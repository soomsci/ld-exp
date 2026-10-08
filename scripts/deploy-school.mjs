import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initAuth } from '/opt/homebrew/lib/node_modules/@google/clasp/build/src/auth/auth.js';

const root = new URL('../', import.meta.url);
const { scriptId } = JSON.parse(readFileSync(new URL('.clasp.json', root), 'utf8'));
const teacherId = 'AKfycbyVBQlcsa5gM7DPYwXxEp3q1kEm6BksjmbaFU5LBsmP50OJgEzm_yyHI7hGSRLUwI2ZBg';
const statePath = new URL('artifacts/deployments/school.json', root);
mkdirSync(new URL('artifacts/deployments/', root), { recursive: true });
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
const { credentials } = await initAuth({});
const base = `https://script.googleapis.com/v1/projects/${scriptId}`;
async function request(url, method = 'GET', data) { return (await credentials.request({ url, method, data })).data; }
const files = [['Code', 'SERVER_JS', 'Code.gs'], ['index', 'HTML', 'index.html'], ['teacher', 'HTML', 'teacher.html'], ['relay', 'HTML', 'relay.html'], ['appsscript', 'JSON', 'appsscript.json']]
  .map(([name, type, file]) => ({ name, type, source: readFileSync(new URL(file, root), 'utf8') }));
const sourceHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
try {
  const user = await request('https://www.googleapis.com/oauth2/v2/userinfo');
  if (user.email !== 'xopowok08@samjeong.ms.kr') throw new Error('Unexpected deployment owner.');
  state.owner = user.email;
  if (state.sourceHash !== sourceHash) {
    state.sourceHash = sourceHash;
    delete state.studentVersion;
    delete state.teacherVersion;
    save();
  }
  if (!state.studentVersion) {
    await request(`${base}/content`, 'PUT', { files });
    const v = await request(`${base}/versions`, 'POST', { description: 'Public student group activity; teacher APIs protected' });
    state.studentVersion = v.versionNumber;
    save();
  }
  const studentConfig = { versionNumber: state.studentVersion, manifestFileName: 'appsscript', description: '학생용 · 로그인 없이 모둠활동' };
  const student = state.studentId
    ? await request(`${base}/deployments/${state.studentId}`, 'PUT', { deploymentConfig: studentConfig })
    : await request(`${base}/deployments`, 'POST', studentConfig);
  state.studentId = student.deploymentId;
  save();
  if (!state.teacherVersion) {
    const teacherFiles = files.map(f => f.name === 'appsscript' ? { ...f, source: JSON.stringify({ ...JSON.parse(f.source), webapp: { executeAs: 'USER_DEPLOYING', access: 'DOMAIN' } }) } : f);
    await request(`${base}/content`, 'PUT', { files: teacherFiles });
    const v = await request(`${base}/versions`, 'POST', { description: 'Teacher school login; group reports and monitoring' });
    state.teacherVersion = v.versionNumber;
    save();
  }
  await request(`${base}/deployments/${teacherId}`, 'PUT', { deploymentConfig: { versionNumber: state.teacherVersion, manifestFileName: 'appsscript', description: '교사용 · samjeong.ms.kr 로그인 · 모둠별 모니터링' } });
  // Keep HEAD consistent with the student manifest in the local source tree.
  await request(`${base}/content`, 'PUT', { files });
  for (const [kind, id, access] of [['student', state.studentId, 'ANYONE_ANONYMOUS'], ['teacher', teacherId, 'DOMAIN']]) {
    const live = await request(`${base}/deployments/${id}`);
    const entry = live.entryPoints.find(e => e.entryPointType === 'WEB_APP').webApp;
    if (entry.entryPointConfig.access !== access || entry.entryPointConfig.executeAs !== 'USER_DEPLOYING') throw new Error(`Unexpected ${kind} access.`);
    const content = await request(`${base}/content?versionNumber=${live.deploymentConfig.versionNumber}`);
    for (const f of files.filter(f => f.name !== 'appsscript')) {
      if (content.files.find(x => x.name === f.name)?.source !== f.source) throw new Error(`Deployed ${kind} file mismatch: ${f.name}`);
    }
    state[kind + 'Url'] = entry.url + (kind === 'teacher' ? '?page=teacher' : '');
  }
  save();
  console.log(JSON.stringify(state, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: error.response?.status, message: error.response?.data?.error?.message || error.message }));
  process.exitCode = 1;
}
