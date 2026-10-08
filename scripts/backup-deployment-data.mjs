import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { initAuth } from '/opt/homebrew/lib/node_modules/@google/clasp/build/src/auth/auth.js';

const project = JSON.parse(readFileSync(new URL('../.clasp.json', import.meta.url), 'utf8'));
const { credentials } = await initAuth({});
try {
  const { data } = await credentials.request({
    url: `https://www.googleapis.com/drive/v3/files/${project.parentId}/export`,
    params: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    responseType: 'arraybuffer',
  });
  const dir = mkdtempSync('/private/tmp/ldexp-data-backup-');
  writeFileSync(`${dir}/spreadsheet.xlsx`, Buffer.from(data), { mode: 0o600 });
  writeFileSync(`${dir}/project.json`, JSON.stringify(project), { mode: 0o600 });
  console.log(JSON.stringify({ backup: dir, bytes: Buffer.byteLength(data) }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: error.response?.status, message: error.response?.data?.error?.message || error.message }));
  process.exitCode = 1;
}
