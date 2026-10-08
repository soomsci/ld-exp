// 빛의 세기와 거리 탐구 – Apps Script 백엔드 (구글 시트 = DB)
// 학생 공개 배포와 교사 학교 도메인 전용 배포를 별도로 유지한다.
// 학생: .../exec   교사 대시보드: .../exec?page=teacher

const FOLDER_NAME = '빛실험_그래프';
const TEACHERS = []; // 배포한 교사 외에 대시보드를 쓸 교사 이메일
const STAGES = ['설계', '그래프'];
const FORMS_URL = ''; // 교사가 제공한 개인 분석 퀴즈 HTTPS 주소
const TYPES = ['text', 'vars', 'graph'];
const MAX_ANSWER = 1500; // 문항당 최대 글자 수 (시트 한 칸 한도 5만 자)

const HEADERS = {
  '명렬표': ['이메일', '반', '번호', '이름', '모둠'],
  '문항': ['id', '순서', '단계', '유형', '발문', '배점', '필수'],
  '문항_v2': ['id', '순서', '단계', '유형', '발문', '배점', '필수'],
  '제출이력': ['보관시각', '기존제출(JSON)'],
  '모둠데이터': ['시각', '반', '모둠', '제출자', '배경조도', '측정수', '데이터(JSON)'],
  '제출': ['이메일', '반', '번호', '이름', '모둠', '제출시각', '답변(JSON)', '그래프ID', '점수(JSON)', '피드백', '총점', '채점시각', '상태', '형식버전', '문항사본(JSON)', '측정자료사본(JSON)', '자료ID', '제출ID'],
};
const C = { email: 0, cls: 1, num: 2, name: 3, group: 4, at: 5, ans: 6, img: 7, scores: 8, fb: 9, total: 10, gradedAt: 11, status: 12 };
HEADERS['제출이력'] = ['보관시각', ...HEADERS['제출']];

// 남는 문항의 기존 배점만 유지: 8점. Forms 합산 배점은 별도로 확정한다.
const DEFAULT_QUESTIONS = [
  ['q1', 1, '설계', 'text', '가설: 거리와 조도 사이에 어떤 관계가 있을지 예상해서 써 보세요.', 2, true],
  ['q2', 2, '설계', 'vars', '변인 정하기: 독립변인, 종속변인, 통제변인을 고르세요.', 3, true],
  ['q3', 3, '설계', 'text', '모둠 측정 계획: 거리 조건과 같은 조건으로 3회 측정할 방법을 써 보세요.', 1, false],
  ['q4', 4, '그래프', 'graph', '가로축을 바꿔 산점도를 비교하고, 조도와 거리 제곱의 역수 사이의 비례 관계를 분석하세요.', 2, true],
];

function doGet(e) {
  if (e?.parameter?.page === 'relay') {
    const channel = String(e.parameter.channel || '');
    if (!validStudentToken_(channel)) throw new Error('학생 접속 채널이 올바르지 않아요.');
    const template = HtmlService.createTemplateFromFile('relay');
    template.channel = channel;
    return template.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  const teacher = e && e.parameter && e.parameter.page === 'teacher';
  if (teacher && !isTeacher_()) return HtmlService.createHtmlOutput('<h3>교사 계정만 볼 수 있어요.</h3>');
  return HtmlService.createHtmlOutputFromFile(teacher ? 'teacher' : 'index')
    .setTitle(teacher ? '교사 대시보드 · 빛의 세기와 거리' : '빛의 세기와 거리')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ================= 학생 =================
function getConfig(studentToken) {
  studentToken = validStudentToken_(studentToken) ? studentToken : Utilities.getUuid();
  const out = { email: Session.getActiveUser().getEmail(), questions: questions_(), maxAnswer: MAX_ANSWER, profile: null, version: 2, formsUrl: /^https:\/\//.test(FORMS_URL) ? FORMS_URL : '' };
  try { const me = me_(studentToken); out.email = me.email; out.studentToken = studentToken; } catch (e) { out.error = e.message; }
  return out;
}

function members_(members, final) {
  if (members !== undefined && (!Array.isArray(members) || members.length > 4)) throw new Error('모둠원은 최대 4명까지 입력하세요.');
  const seen = new Set();
  return Array.from({ length: 4 }, (_, i) => {
    const m = (members || [])[i] || {}, n = String(m.num ?? '').trim(), name = String(m.name || '').trim();
    if (n && (!Number.isInteger(Number(n)) || Number(n) < 1 || Number(n) > 40)) throw new Error('모둠원 번호는 1~40 사이 정수로 입력하세요.');
    if (name.length > 20) throw new Error('모둠원 이름은 20자 이내로 입력하세요.');
    const num = n ? String(Number(n)) : '';
    if (final && !!num !== !!name) throw new Error('모둠원의 번호와 이름을 함께 입력하세요.');
    if (num && seen.has(num)) throw new Error('모둠원 번호가 중복됐어요.');
    if (num) seen.add(num);
    return { num, name };
  });
}

// JSON 한 칸에 버전이 있는 자료 전체를 저장. 이전 배열 자료는 읽을 때만 변환한다.
function validateData_(d, final) {
  if (!d || d.version !== 2) throw new Error('새 형식의 3회 측정 자료가 필요해요.');
  const number = v => typeof v === 'number' && isFinite(v);
  if (!Array.isArray(d.distances) || d.distances.length < 5 || d.distances.length > 6 ||
      d.distances.some(v => !number(v) || v <= 0) || new Set(d.distances).size !== d.distances.length)
    throw new Error('서로 다른 양수 거리 5~6개를 정해 주세요.');
  if (!d.distances.some(x => d.distances.some(y => Math.abs(y - 2 * x) < 1e-8)))
    throw new Error('거리가 두 배인 조건을 포함해 주세요.');
  if (d.bg !== null && (!number(d.bg) || d.bg < 0)) throw new Error('배경 조도를 확인해 주세요.');
  if (!Array.isArray(d.rows) || d.rows.length > 18) throw new Error('측정 자료를 확인해 주세요.');
  const keys = new Set();
  const cleanRow = r => {
    if (!r || !number(r.d) || r.d <= 0 || ![1, 2, 3].includes(r.round) ||
        !number(r.lux) || r.lux < 0 || !number(r.bg) || r.bg < 0 ||
        !['manual', 'sensor', 'legacy'].includes(r.mode) || !r.at || !isFinite(Date.parse(r.at)))
      throw new Error('회차·거리·원래 조도·배경 조도·시각을 확인해 주세요.');
    return { d: r.d, round: r.round, lux: r.lux, bg: r.bg, at: str_(r.at, 40), mode: r.mode };
  };
  const rows = d.rows.map(r => {
    const row = cleanRow(r), key = row.round + ':' + row.d;
    if (!d.distances.includes(row.d) || keys.has(key)) throw new Error('거리 목록 불일치 또는 회차·거리 중복이에요.');
    keys.add(key); return row;
  });
  if (final && (d.bg === null || rows.length !== d.distances.length * 3))
    throw new Error('모든 거리에서 1·2·3차 측정을 마친 뒤 제출해 주세요.');
  if (!Array.isArray(d.history) || d.history.length > 150) throw new Error('변경 이력을 확인해 주세요 (최대 150건).');
  const history = d.history.map(h => {
    if (!['remeasure', 'delete', 'distance', 'background'].includes(h.action) || !isFinite(Date.parse(h.at)))
      throw new Error('변경 이력이 올바르지 않아요.');
    return { action: h.action, at: str_(h.at, 40), before: cleanRow(h.before), after: h.after ? cleanRow(h.after) : null };
  });
  const out = { version: 2, distances: d.distances.slice().sort((a,b) => a-b), bg: d.bg, rows, history, members: members_(d.members, final) };
  if (JSON.stringify(out).length > 44000) throw new Error('측정 변경 이력이 너무 길어요. 교사에게 알려 주세요.');
  return out;
}

function submitGroup(d, studentToken) {
  const { email, profile } = me_(studentToken);
  const [cls, group] = myGroup_(profile, d.cls, d.group);
  const data = validateData_(d, d.status !== 'draft');
  Object.assign(data, { id: Utilities.getUuid(), cls, group, by: email, at: new Date().toISOString(), status: d.status === 'draft' ? 'draft' : 'submitted' });
  if (studentToken) data.shareCode = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  return withLock_(() => {
    sheet_('모둠데이터').appendRow([new Date(), cls, group, email, data.bg, data.rows.length, JSON.stringify(data)]);
    return data;
  });
}

function groupValue_(v, i) {
  const stored = parse_(v[6]);
  if (!Array.isArray(stored)) return stored;
  return { version: 1, legacy: true, id: 'legacy-' + i, cls: v[1], group: v[2], bg: Number(v[4]) || 0,
    rows: stored.map(r => ({ d: Number(r.d), lux: Number(r.lux), round: 1, bg: Number(v[4]) || 0, mode: 'legacy', at: v[0] instanceof Date ? v[0].toISOString() : new Date(0).toISOString() })),
    distances: stored.map(r => Number(r.d)), history: [], by: v[3], at: fmtDate_(v[0]), status: 'legacy' };
}
function loadGroup(cls, group, shareCode, studentToken) {
  const me = studentToken ? me_(studentToken) : null;
  if (me || !isTeacher_()) [cls, group] = myGroup_((me || me_()).profile, cls, group);
  shareCode = String(shareCode || '').trim().toLowerCase();
  const values = sheet_('모둠데이터').getDataRange().getValues();
  for (let i = values.length - 1; i > 0; i--) if (values[i][1] == cls && values[i][2] == group) {
    const data = groupValue_(values[i], i);
    if (data && data.status !== 'draft' && (!me || data.by === me.email || (shareCode && data.shareCode === shareCode))) {
      if (me) {
        const reports = sheet_('제출').getDataRange().getValues();
        const row = reports.find(v => v[0] === 'group:' + cls + ':' + group && v[16] === data.id);
        if (row) data.activity = { answers: parse_(row[C.ans]), at: fmtDate_(row[C.at]), id: row[17] };
      }
      return data;
    }
  }
  if (me) throw new Error('이 기기에서 제출한 자료가 없어요. 모둠원이 알려 준 자료 코드를 입력해 주세요.');
  return null;
}
function submittedData_(id, cls, group) {
  const values = sheet_('모둠데이터').getDataRange().getValues();
  for (let i = values.length - 1; i > 0; i--) if (values[i][1] == cls && values[i][2] == group) {
    const data = groupValue_(values[i], i);
    if (data && data.id === id && data.status === 'submitted') return data;
  }
  throw new Error('먼저 현재 모둠 측정 자료를 제출하거나 불러와 주세요.');
}
function graph_(v) {
  const axes = ['distance', 'squared', 'inverseSquared'];
  if (!v || !String(v.title || '').trim() || !axes.includes(v.xaxis) ||
      v.yaxis !== 'mean') throw new Error('그래프 제목과 가로축을 확인해 주세요. 세로축은 조도로 고정해요.');
  const a = v.analysis || {};
  if (!axes.concat('unclear').includes(a.linearAxis) || !['yes', 'no', 'unclear'].includes(a.origin) ||
      !String(a.reason || '').trim()) throw new Error('그래프 분석의 축 비교, 원점과의 관계, 근거를 작성해 주세요.');
  const observations = {};
  axes.forEach(axis => { observations[axis] = str_((a.observations || {})[axis], 500); });
  return { title: str_(v.title.trim(), 120), xaxis: v.xaxis, yaxis: 'mean', showTrials: !!v.showTrials, connectPoints: !!v.connectPoints,
    analysis: { observations, linearAxis: a.linearAxis, origin: a.origin, reason: str_(a.reason, MAX_ANSWER) } };
}

function submitReport(r, studentToken) {
  const me = me_(studentToken), profile = me.profile;
  const [cls, group] = myGroup_(profile, r.cls, r.group);
  const email = studentToken ? 'group:' + cls + ':' + group : me.email;
  const num = studentToken ? group : checkInt_(profile ? profile.num : r.num, 1, 40);
  const name = studentToken ? group + '모둠' : String(profile ? profile.name : r.name || '').trim().slice(0, 20);
  if (!name) throw new Error('이름을 입력해 주세요.');

  const snapshot = validateData_(r.data, true);
  const source = submittedData_(r.sourceId, cls, group);
  if (JSON.stringify(snapshot) !== JSON.stringify(validateData_(source, true))) throw new Error('자료가 제출 후 변경됐어요. 모둠 자료를 다시 제출해 주세요.');
  Object.assign(snapshot, { id: source.id, cls, group, by: source.by, at: source.at, status: 'submitted' });
  const graph = graph_(r.graph);
  const qs = questions_(), src = r.answers || {}, answers = {};
  qs.forEach(q => {
    const v = src[q.id];
    if (q.type === 'text') answers[q.id] = String(v || '').slice(0, MAX_ANSWER);
    if (q.type === 'vars') answers[q.id] = v ? { indep: str_(v.indep, 50), dep: str_(v.dep, 50), ctrl: str_(v.ctrl, 500) } : null;
    if (q.type === 'graph') answers[q.id] = graph;
    const empty = q.type === 'text' ? !answers[q.id].trim() : q.type === 'vars' ? !answers[q.id] || !answers[q.id].indep || !answers[q.id].dep || !answers[q.id].ctrl : !answers[q.id];
    if (q.required && empty) throw new Error('필수 문항이 비어 있어요: ' + q.text.slice(0, 20));
  });

  const json = JSON.stringify(answers);
  if (json.length > 45000) throw new Error('답변이 너무 길어요. 조금 줄여서 다시 제출해 주세요.');

  let imgId = '';
  if (!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(r.png || '')) throw new Error('그래프 PNG 이미지가 필요해요.');
  if (r.png) {
    if (r.png.length > 3e6) throw new Error('그래프 이미지가 너무 커요.');
    const bytes = Utilities.base64Decode(String(r.png).split(',').pop());
    imgId = folder_().createFile(Utilities.newBlob(bytes, 'image/png', `${cls}반_${num}번_${name}.png`)).getId();
  }

  return withLock_(() => {
    const sh = sheet_('제출'), i = findRow_(sh, email);
    const old = i ? sh.getRange(i, 1, 1, HEADERS['제출'].length).getValues()[0] : null;
    if (old) sheet_('제출이력').appendRow([new Date(), ...old]);
    const sameVersion = old && old[13] === 2 && old[14] === JSON.stringify(qs);
    const row = [email, cls, num, text_(name), group, new Date(), json, imgId,
      sameVersion ? old[C.scores] : '', sameVersion ? old[C.fb] : '', sameVersion ? old[C.total] : '', sameVersion ? old[C.gradedAt] : '',
      old ? '재제출' : '제출', 2, JSON.stringify(qs), JSON.stringify(snapshot), source.id, Utilities.getUuid()];
    if (i) sh.getRange(i, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    return { id: row[17], at: row[5].toISOString() };
  });
}

// ================= 교사 =================
function listReports() {
  requireTeacher_();
  const values = sheet_('제출').getDataRange().getValues().slice(1);
  return {
    questions: questions_(),
    sheetUrl: SpreadsheetApp.getActive().getUrl(),
    roster: roster_(),
    history: sheet_('제출이력').getDataRange().getValues().slice(1).filter(v => v[1]).map(v => reportValue_(v.slice(1))),
    reports: values.filter(v => v[C.email]).map(reportValue_),
  };
}
function reportValue_(v) {
  return { email: v[C.email], groupActivity: String(v[C.email]).startsWith('group:'), cls: v[C.cls], num: v[C.num], name: v[C.name], group: v[C.group],
    at: fmtDate_(v[C.at]), answers: parse_(v[C.ans]) || {}, img: v[C.img],
    scores: parse_(v[C.scores]) || {}, feedback: v[C.fb], total: v[C.total], status: v[C.status],
    version: v[13] || 1, questions: parse_(v[14]) || legacyQuestions_(), data: parse_(v[15]), sourceId: v[16], id: v[17] || '' };
}

function getImage(fileId) {
  requireTeacher_();
  const blob = DriveApp.getFileById(fileId).getBlob();
  return 'data:image/png;base64,' + Utilities.base64Encode(blob.getBytes());
}

function saveGrade(email, scores, feedback, submissionId) {
  requireTeacher_();
  const clean = {};
  let total = 0;
  const sh0 = sheet_('제출'), row0 = findRow_(sh0, email);
  if (!row0) throw new Error('제출 기록을 찾을 수 없어요.');
  const original = sh0.getRange(row0, 1, 1, HEADERS['제출'].length).getValues()[0];
  if (submissionId && original[17] !== submissionId) throw new Error('새 제출이 도착했어요. 새로고침 후 채점해 주세요.');
  (parse_(original[14]) || legacyQuestions_()).forEach(q => {
    const v = scores && scores[q.id];
    if (v === '' || v == null) return;
    const n = Math.min(Math.max(Number(v) || 0, 0), q.points);
    clean[q.id] = n; total += n;
  });
  return withLock_(() => {
    const sh = sheet_('제출'), i = findRow_(sh, email);
    if (!i) throw new Error('제출 기록을 찾을 수 없어요.');
    const latest = sh.getRange(i, 1, 1, HEADERS['제출'].length).getValues()[0];
    if (latest[17] !== original[17] || String(latest[C.at]) !== String(original[C.at])) throw new Error('새 제출이 도착했어요. 새로고침 후 채점해 주세요.');
    sh.getRange(i, C.scores + 1, 1, 5).setValues([[JSON.stringify(clean), text_(feedback), total, new Date(), '채점완료']]);
    return total;
  });
}

function saveQuestions(list) {
  requireTeacher_();
  if (!Array.isArray(list) || !list.length || list.length > 40) throw new Error('문항 목록이 올바르지 않아요.');
  const seen = {}, ids = new Set();
  const rows = list.map((q, k) => {
    const id = /^[a-z0-9_]{1,20}$/i.test(q.id) ? q.id : 'q' + Date.now().toString(36) + k;
    if (ids.has(id)) throw new Error('문항 ID가 중복됐어요.');
    ids.add(id);
    if ((q.type === 'graph' && q.stage !== '그래프') || (q.type !== 'graph' && q.stage !== '설계')) throw new Error('설계 답변과 그래프 작성만 웹앱에서 받아요.');
    if (!STAGES.includes(q.stage) || !TYPES.includes(q.type)) throw new Error('단계/유형이 올바르지 않아요.');
    if (q.type !== 'text' && seen[q.type]) throw new Error('변인/그래프 문항은 하나씩만 둘 수 있어요.');
    seen[q.type] = true;
    const text = String(q.text || '').trim().slice(0, 1000);
    if (!text) throw new Error((k + 1) + '번째 문항의 발문이 비어 있어요.');
    const points = Math.min(Math.max(Number(q.points) || 0, 0), 100);
    return [id, k + 1, q.stage, q.type, text_(text), points, !!q.required];
  });
  if (!seen.graph) throw new Error('그래프 작성 문항 하나를 유지해 주세요.');
  return withLock_(() => {
    const sh = sheet_('문항_v2');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS['문항_v2'].length).clearContent();
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    return questions_();
  });
}

// 성적표: 반/번호/이름/문항별 점수/총점/피드백 (CSV 다운로드와 '성적' 시트가 같이 씀)
function gradeTable() {
  requireTeacher_();
  const { questions, reports, roster } = listReports();
  const all = [...questions];
  reports.forEach(r => (r.questions || []).forEach(q => { if (!all.some(x => x.id === q.id && x.text === q.text && x.points === q.points)) all.push(q); }));
  const header = ['반', '모둠', '제출 단위', ...Array.from({length:4}, (_,i) => ['모둠원'+(i+1)+' 번호', '모둠원'+(i+1)+' 이름']).flat(),
    ...all.map((q, i) => `${i + 1}. ${q.text.slice(0, 15)} (${q.points}점)`), '총점', '만점', '상태', '피드백', '제출시각'];
  const rows = reports.sort((a, b) => a.cls - b.cls || a.num - b.num).map(r =>
    [r.cls, r.group, r.groupActivity ? '모둠' : '이전 개인', ...Array.from({length:4}, (_,i) => { const m = (r.data?.members || [])[i] || {}; return [m.num || '', m.name || '']; }).flat(), ...all.map(q => (r.questions || questions).some(x => x.id === q.id && x.text === q.text && x.points === q.points) && r.scores[q.id] != null ? r.scores[q.id] : ''),
      r.total, (r.questions || questions).reduce((a,q) => a+q.points,0), r.status, r.feedback, r.at]);
  return { header, rows };
}

function exportGrades() {
  const { header, rows } = gradeTable();
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('성적') || ss.insertSheet('성적');
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows.map(r => r.map(v => typeof v === 'string' ? text_(v) : v)));
  sh.setFrozenRows(1);
  return ss.getUrl() + '#gid=' + sh.getSheetId();
}

// ================= helpers =================
function readQuestions_(sh) {
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().filter(v => v[0])
    .map(v => ({ id: String(v[0]), order: Number(v[1]), stage: v[2], type: v[3], text: String(v[4]), points: Number(v[5]) || 0, required: v[6] === true }))
    .sort((a,b) => a.order-b.order);
}
function legacyQuestions_() { return readQuestions_(sheet_('문항')); }
function questions_() {
  const sh = sheet_('문항_v2');
  if (sh.getLastRow() < 2) {
    const old = legacyQuestions_();
    const initial = old.length ? old.filter(q => q.stage === '설계' || q.type === 'graph').map(q =>
      [q.id, q.order, q.type === 'graph' ? '그래프' : '설계', q.type,
       q.type === 'graph' ? DEFAULT_QUESTIONS[3][4] : q.text, q.points, q.required]) : DEFAULT_QUESTIONS;
    if (!initial.some(q => q[3] === 'graph')) initial.push(DEFAULT_QUESTIONS[3]);
    sh.getRange(2, 1, initial.length, 7).setValues(initial);
  }
  return readQuestions_(sh).map(q => ({...q, text: q.text.replace(/개인 측정 계획/g, '모둠 측정 계획')}));
}

// 명렬표: 비어 있으면 학생이 직접 입력, 채워져 있으면 명렬표 값을 강제
function roster_() {
  return sheet_('명렬표').getDataRange().getValues().slice(1).filter(v => String(v[0]).trim()).map(v => ({
    email: String(v[0]).trim().toLowerCase(), cls: Number(v[1]), num: Number(v[2]), name: String(v[3]).trim(), group: Number(v[4]) || '',
  }));
}

function validStudentToken_(token) { return typeof token === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token); }
function me_(studentToken) {
  if (studentToken !== undefined && studentToken !== '') {
    if (!validStudentToken_(studentToken)) throw new Error('학생 접속 정보를 다시 불러와 주세요.');
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, studentToken);
    const id = digest.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
    return { email: 'guest:' + id, profile: null };
  }
  const email = requireUser_(), roster = roster_();
  if (!roster.length) return { email, profile: null };
  const profile = roster.find(p => p.email === email.toLowerCase());
  if (!profile) throw new Error(`명렬표에 없는 계정이에요 (${email}). 선생님께 알려 주세요.`);
  return { email, profile };
}

// 명렬표에 반/모둠이 있으면 그 값, 없으면 학생이 고른 값
function myGroup_(profile, cls, group) {
  return [checkInt_(profile ? profile.cls : cls, 1, 4), checkInt_(profile && profile.group ? profile.group : group, 1, 12)];
}

function isTeacher_() {
  const e = Session.getActiveUser().getEmail();
  return !!e && (e === Session.getEffectiveUser().getEmail() || TEACHERS.includes(e));
}

function requireTeacher_() {
  if (!isTeacher_()) throw new Error('교사만 사용할 수 있어요.');
}

function requireUser_() {
  const e = Session.getActiveUser().getEmail();
  if (!e) throw new Error('학교 구글 계정으로 로그인해 주세요.');
  return e;
}

function checkInt_(v, lo, hi) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error('반/모둠/번호를 확인해 주세요.');
  return n;
}

function str_(v, max) { return String(v == null ? '' : v).slice(0, max); }

// 학생 입력이 시트 수식으로 실행되지 않게 막음
function text_(v) {
  const s = str_(v, 5000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function parse_(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

function fmtDate_(d) {
  return d instanceof Date ? Utilities.formatDate(d, 'Asia/Seoul', 'MM/dd HH:mm') : String(d || '');
}

function findRow_(sh, email) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const i = sh.getRange(2, 1, n, 1).getValues().findIndex(v => v[0] === email);
  return i < 0 ? 0 : i + 2;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS[name]);
    sh.setFrozenRows(1);
  } else if (HEADERS[name] && sh.getLastColumn() < HEADERS[name].length) {
    sh.getRange(1, sh.getLastColumn() + 1, 1, HEADERS[name].length - sh.getLastColumn()).setValues([HEADERS[name].slice(sh.getLastColumn())]);
  }
  return sh;
}

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
