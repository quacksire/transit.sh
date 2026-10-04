import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';

const origin = process.env.TRANSIT_URL || 'http://localhost:8798';
const id = `test-${crypto.randomUUID()}`;
const bytes = randomBytes(2 * 1024 * 1024);
const hash = value => createHash('sha256').update(value).digest('hex');
const browserHeaders = { 'user-agent': 'Mozilla/5.0 Safari/605.1.15', 'sec-fetch-mode': 'navigate', accept: 'text/html' };
const upload = fetch(`${origin}/${id}/app.aab`, {
  method: 'PUT', body: bytes, signal: AbortSignal.timeout(30000),
  headers: { 'content-type': 'application/octet-stream' },
});
// Poll only the browser preview: never consume the download slot during inspection.
let page;
for (let attempt = 0; attempt < 50; attempt++) {
  page = await fetch(`${origin}/${id}/`, { headers: browserHeaders });
  if (page.status === 200) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
assert.equal(page.status, 200);
const html = await page.text();
assert.match(html, /Ready to download/);
assert.match(html, /id="download-button"/);
assert.match(html, /app.aab/);
assert.doesNotMatch(html, /{{|Send a file/);
const previewAgain = await fetch(`${origin}/${id}/`, { headers: browserHeaders });
assert.match(await previewAgain.text(), /data-receiver-connected="false"/);
const download = await fetch(`${origin}/${id}/?download=true`, { headers: browserHeaders, signal: AbortSignal.timeout(30000) });
assert.equal(download.status, 200);
assert.match(download.headers.get('content-disposition'), /app.aab/);
assert.equal(hash(Buffer.from(await download.arrayBuffer())), hash(bytes));
const uploaded = await upload;
assert.equal(uploaded.status, 200);
assert.equal(await uploaded.text(), 'Transfer complete.');
const missing = await fetch(`${origin}/missing-${crypto.randomUUID()}/`, { headers: browserHeaders });
assert.equal(missing.status, 404);
console.log('PASS: browser navigation renders original download template; preview does not consume transfer; 2 MiB AAB bytes match; missing transfer returns 404.');
