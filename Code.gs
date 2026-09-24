// 빛의 세기와 거리 탐구 – Apps Script 백엔드 (구글 시트 = DB)
// 배포: 실행 계정 = 나(교사), 액세스 = 학교 도메인 내 모든 사용자
// 학생: .../exec   교사 대시보드: .../exec?page=teacher

const FOLDER_NAME = '빛실험_그래프';
const TEACHERS = []; // 배포한 교사 외에 대시보드를 쓸 교사 이메일
const STAGES = ['설계', '분석'];
const TYPES = ['text', 'vars', 'graph'];

const HEADERS = {
  '문항': ['id', '순서', '단계', '유형', '발문', '배점', '필수'],
  '모둠데이터': ['시각', '반', '모둠', '제출자', '배경조도', '측정수', '데이터(JSON)'],
  '제출': ['이메일', '반', '번호', '이름', '모둠', '제출시각', '답변(JSON)', '그래프ID', '점수(JSON)', '피드백', '총점', '채점시각', '상태'],
};
const C = { email: 0, cls: 1, num: 2, name: 3, group: 4, at: 5, ans: 6, img: 7, scores: 8, fb: 9, total: 10, gradedAt: 11, status: 12 };

const DEFAULT_QUESTIONS = [
  ['q1', 1, '설계', 'text', '가설: 거리와 조도 사이에 어떤 관계가 있을지 예상해서 써 보세요.', 2, true],
  ['q2', 2, '설계', 'vars', '변인 정하기: 독립변인, 종속변인, 통제변인을 고르세요.', 3, true],
  ['q3', 3, '설계', 'text', '측정 계획: 몇 cm부터 몇 cm까지, 몇 cm 간격으로 잴까요?', 1, false],
  ['q4', 4, '분석', 'graph', '그래프 그리기: x축 4가지를 모두 눌러 보고, 원점을 지나는 직선이 되는 그래프를 골라 제출하세요.', 2, true],
  ['q5', 5, '분석', 'text', "Q1. x축을 '거리 d'로 했을 때 그래프는 어떤 모양인가요? 거리가 2배(10cm → 20cm)가 되면 조도는 약 몇 분의 1이 되나요?", 2, false],
  ['q6', 6, '분석', 'text', 'Q2. 4가지 x축 중 점들이 원점을 지나는 직선에 가장 가까운 것은 무엇인가요? R² 값을 근거로 쓰세요.', 2, true],
  ['q7', 7, '분석', 'text', 'Q3. 조도와 거리 사이의 관계를 한 문장으로 쓰세요.', 3, true],
  ['q8', 8, '분석', 'text', '결론: 가설과 비교해서 실험 결과로 알게 된 것을 쓰세요.', 2, true],
  ['q9', 9, '분석', 'text', '오차 원인: 결과가 완벽한 직선이 아닌 이유는 무엇일까요?', 2, false],
  ['q10', 10, '분석', 'text', '느낀 점', 1, false],
];

function doGet(e) {
  const teacher = e && e.parameter && e.parameter.page === 'teacher';
  if (teacher && !isTeacher_()) return HtmlService.createHtmlOutput('<h3>교사 계정만 볼 수 있어요.</h3>');
  return HtmlService.createHtmlOutputFromFile(teacher ? 'teacher' : 'index')
    .setTitle(teacher ? '교사 대시보드 · 빛의 세기와 거리' : '빛의 세기와 거리')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ================= 학생 =================
function getConfig() {
  return { email: Session.getActiveUser().getEmail(), questions: questions_() };
}

function submitGroup(d) {
  const email = requireUser_();
  const cls = checkInt_(d.cls, 1, 4), group = checkInt_(d.group, 1, 12);
  if (!Array.isArray(d.rows) || !d.rows.length || d.rows.length > 30) throw new Error('측정 데이터가 올바르지 않아요.');
  const rows = d.rows.map(r => ({ d: Number(r.d), lux: Number(r.lux) }));
  if (rows.some(r => !(r.d > 0) || !isFinite(r.lux))) throw new Error('거리/조도 값이 올바르지 않아요.');
  sheet_('모둠데이터').appendRow([new Date(), cls, group, email, Number(d.bg) || 0, rows.length, JSON.stringify(rows)]);
  return true;
}

function loadGroup(cls, group) {
  requireUser_();
  const values = sheet_('모둠데이터').getDataRange().getValues();
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i][1] == cls && values[i][2] == group) {
      return { bg: values[i][4], rows: JSON.parse(values[i][6]), by: values[i][3], at: fmtDate_(values[i][0]) };
    }
  }
  return null;
}

function submitReport(r) {
  const email = requireUser_();
  const cls = checkInt_(r.cls, 1, 4), group = checkInt_(r.group, 1, 12), num = checkInt_(r.num, 1, 40);
  const name = String(r.name || '').trim().slice(0, 20);
  if (!name) throw new Error('이름을 입력해 주세요.');

  // 현재 문항 기준으로만 답변 저장
  const src = r.answers || {}, answers = {};
  questions_().forEach(q => {
    const v = src[q.id];
    if (q.type === 'text') answers[q.id] = String(v || '').slice(0, 5000);
    if (q.type === 'vars') answers[q.id] = v ? { indep: str_(v.indep, 50), dep: str_(v.dep, 50), ctrl: str_(v.ctrl, 500) } : null;
    if (q.type === 'graph') answers[q.id] = v ? { xaxis: str_(v.xaxis, 20), r2: Number(v.r2) || null, r2table: str_(v.r2table, 200) } : null;
    const empty = q.type === 'text' ? !answers[q.id].trim() : !answers[q.id];
    if (q.required && empty) throw new Error('필수 문항이 비어 있어요: ' + q.text.slice(0, 20));
  });

  let imgId = '';
  if (r.png) {
    if (r.png.length > 3e6) throw new Error('그래프 이미지가 너무 커요.');
    const bytes = Utilities.base64Decode(String(r.png).split(',').pop());
    imgId = folder_().createFile(Utilities.newBlob(bytes, 'image/png', `${cls}반_${num}번_${name}.png`)).getId();
  }

  return withLock_(() => {
    const sh = sheet_('제출'), i = findRow_(sh, email);
    const old = i ? sh.getRange(i, 1, 1, HEADERS['제출'].length).getValues()[0] : null;
    if (old && old[C.img] && old[C.img] !== imgId) try { DriveApp.getFileById(old[C.img]).setTrashed(true); } catch (e) {}
    const row = [email, cls, num, text_(name), group, new Date(), JSON.stringify(answers), imgId,
      old ? old[C.scores] : '', old ? old[C.fb] : '', old ? old[C.total] : '', old ? old[C.gradedAt] : '',
      old && old[C.scores] ? '재제출' : '제출'];
    if (i) sh.getRange(i, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    return true;
  });
}

// ================= 교사 =================
function listReports() {
  requireTeacher_();
  const values = sheet_('제출').getDataRange().getValues().slice(1);
  return {
    questions: questions_(),
    sheetUrl: SpreadsheetApp.getActive().getUrl(),
    reports: values.filter(v => v[C.email]).map(v => ({
      email: v[C.email], cls: v[C.cls], num: v[C.num], name: v[C.name], group: v[C.group],
      at: fmtDate_(v[C.at]), answers: parse_(v[C.ans]) || {}, img: v[C.img],
      scores: parse_(v[C.scores]) || {}, feedback: v[C.fb], total: v[C.total], status: v[C.status],
    })),
  };
}

function getImage(fileId) {
  requireTeacher_();
  const blob = DriveApp.getFileById(fileId).getBlob();
  return 'data:image/png;base64,' + Utilities.base64Encode(blob.getBytes());
}

function saveGrade(email, scores, feedback) {
  requireTeacher_();
  const clean = {};
  let total = 0;
  questions_().forEach(q => {
    const v = scores && scores[q.id];
    if (v === '' || v == null) return;
    const n = Math.min(Math.max(Number(v) || 0, 0), q.points);
    clean[q.id] = n; total += n;
  });
  return withLock_(() => {
    const sh = sheet_('제출'), i = findRow_(sh, email);
    if (!i) throw new Error('제출 기록을 찾을 수 없어요.');
    sh.getRange(i, C.scores + 1, 1, 5).setValues([[JSON.stringify(clean), text_(feedback), total, new Date(), '채점완료']]);
    return total;
  });
}

function saveQuestions(list) {
  requireTeacher_();
  if (!Array.isArray(list) || !list.length || list.length > 40) throw new Error('문항 목록이 올바르지 않아요.');
  const seen = {};
  const rows = list.map((q, k) => {
    const id = /^[a-z0-9_]{1,20}$/i.test(q.id) ? q.id : 'q' + Date.now().toString(36) + k;
    if (!STAGES.includes(q.stage) || !TYPES.includes(q.type)) throw new Error('단계/유형이 올바르지 않아요.');
    if (q.type !== 'text' && seen[q.type]) throw new Error('변인/그래프 문항은 하나씩만 둘 수 있어요.');
    seen[q.type] = true;
    const text = String(q.text || '').trim().slice(0, 1000);
    if (!text) throw new Error((k + 1) + '번째 문항의 발문이 비어 있어요.');
    const points = Math.min(Math.max(Number(q.points) || 0, 0), 100);
    return [id, k + 1, q.stage, q.type, text_(text), points, !!q.required];
  });
  return withLock_(() => {
    const sh = sheet_('문항');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS['문항'].length).clearContent();
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    return questions_();
  });
}

// 반/번호/이름/문항별 점수/총점을 '성적' 시트로 펼쳐 쓰기
function exportGrades() {
  requireTeacher_();
  const { questions, reports } = listReports();
  const header = ['반', '번호', '이름', '이메일', '모둠', ...questions.map((q, i) => `${i + 1}. (${q.points}점)`), '총점', '상태'];
  const rows = reports.sort((a, b) => a.cls - b.cls || a.num - b.num).map(r =>
    [r.cls, r.num, r.name, r.email, r.group, ...questions.map(q => r.scores[q.id] != null ? r.scores[q.id] : ''), r.total, r.status]);
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('성적') || ss.insertSheet('성적');
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  sh.setFrozenRows(1);
  return ss.getUrl() + '#gid=' + sh.getSheetId();
}

// ================= helpers =================
function questions_() {
  const sh = sheet_('문항');
  if (sh.getLastRow() < 2) sh.getRange(2, 1, DEFAULT_QUESTIONS.length, HEADERS['문항'].length).setValues(DEFAULT_QUESTIONS);
  return sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS['문항'].length).getValues()
    .filter(v => v[0])
    .map(v => ({ id: String(v[0]), order: Number(v[1]), stage: v[2], type: v[3], text: String(v[4]), points: Number(v[5]) || 0, required: v[6] === true }))
    .sort((a, b) => a.order - b.order);
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
  }
  return sh;
}

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
