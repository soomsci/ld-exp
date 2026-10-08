import { readFileSync } from 'node:fs';
import { initAuth } from '/opt/homebrew/lib/node_modules/@google/clasp/build/src/auth/auth.js';

const { scriptId } = JSON.parse(readFileSync(new URL('../.clasp.json', import.meta.url), 'utf8'));
const { credentials } = await initAuth({});
try {
  const response = await credentials.request({
    url: `https://script.googleapis.com/v1/projects/${scriptId}/deployments`,
    method: 'GET',
  });
  console.log(JSON.stringify(response.data, null, 2));
} catch (error) {
  // Do not print authenticated request objects or credential-bearing headers.
  console.error(JSON.stringify({ status: error.response?.status, message: error.response?.data?.error?.message || error.message }));
  process.exitCode = 1;
}
