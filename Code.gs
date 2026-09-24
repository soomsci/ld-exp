// 빛의 세기와 거리 탐구 – Apps Script 백엔드
// 배포: 실행 계정 = 나(교사), 액세스 = 학교 도메인 내 모든 사용자

const FOLDER_NAME = '빛실험_그래프';
const HEADERS = {
  '모둠데이터': ['시각', '반', '모둠', '제출자', '배경조도', '측정수', '데이터(JSON)'],
  '보고서': ['시각', '이메일', '반', '모둠', '가설', '독립변인', '종속변인', '통제변인', '거리계획',
    'Q1 그래프모양', 'Q2 직선이 되는 축', 'Q3 관계', '결론', '오차원인', '느낀점', '선택한 x축', 'R²', 'R² 비교', '그래프'],
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('빛의 세기와 거리')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function whoami() {
  return Session.getActiveUser().getEmail();
}

function submitGroup(d) {
  const email = requireUser_();
  const cls = checkInt_(d.cls, 1, 4), group = checkInt_(d.group, 1, 12);
  if (!Array.isArray(d.rows) || !d.rows.length || d.rows.length > 30) throw new Error('측정 데이터가 올바르지 않아요.');
  const rows = d.rows.map(r => ({ d: Number(r.d), lux: Number(r.lux) }));
  if (rows.some(r => !(r.d > 0) || !isFinite(r.lux))) throw new Error('거리/조도 값이 올바르지 않아요.');
  sheet_('모둠데이터')
    .appendRow([new Date(), cls, group, email, Number(d.bg) || 0, rows.length, JSON.stringify(rows)]);
  return true;
}

function loadGroup(cls, group) {
  requireUser_();
  const values = sheet_('모둠데이터').getDataRange().getValues();
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i][1] == cls && values[i][2] == group) {
      return { bg: values[i][4], rows: JSON.parse(values[i][6]), by: values[i][3], at: String(values[i][0]) };
    }
  }
  return null;
}

function submitReport(r) {
  const email = requireUser_();
  const cls = checkInt_(r.cls, 1, 4), group = checkInt_(r.group, 1, 12);
  let link = '';
  if (r.png) {
    if (r.png.length > 3e6) throw new Error('그래프 이미지가 너무 커요.');
    const bytes = Utilities.base64Decode(String(r.png).split(',').pop());
    const blob = Utilities.newBlob(bytes, 'image/png', `${cls}반_${group}모둠_${email.split('@')[0]}.png`);
    link = folder_().createFile(blob).getUrl();
  }
  const a = r.answers || {};
  const cols = ['hyp', 'indep', 'dep', 'ctrl', 'plan', 'q1', 'q2', 'q3', 'conclusion', 'error', 'feel'];
  sheet_('보고서')
    .appendRow([new Date(), email, cls, group, ...cols.map(k => text_(a[k])),
      text_(r.xaxis), Number(r.r2) || '', text_(r.r2table), link]);
  return link;
}

// ---- helpers ----
function requireUser_() {
  const e = Session.getActiveUser().getEmail();
  if (!e) throw new Error('학교 구글 계정으로 로그인해 주세요.');
  return e;
}

function checkInt_(v, lo, hi) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error('반/모둠 번호를 확인해 주세요.');
  return n;
}

// 학생 입력이 시트 수식으로 실행되지 않게 막음
function text_(v) {
  const s = String(v == null ? '' : v).slice(0, 5000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
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
