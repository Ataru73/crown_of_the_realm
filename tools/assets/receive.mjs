// Local receiver for images and music pulled out of the Gemini page during the asset pass.
// Gemini's CSP blocks requests to localhost, so the Gemini tab opens this page
// with window.open and postMessages { id, blob } to it; the page POSTs the bytes
// to /<id> and they are saved as raw-assets/<id>.<ext> (music in raw-assets/music/).
// Run with: node tools/assets/receive.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 5199;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../raw-assets');
const EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg',
};
mkdirSync(join(OUT, 'music'), { recursive: true });

const cors = {
  'Access-Control-Allow-Origin': 'https://gemini.google.com',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
};

const PAGE = `<!doctype html><title>asset receiver</title><pre id=log>waiting</pre><script>
addEventListener('message', async (e) => {
  if (e.origin !== 'https://gemini.google.com') return;
  const { id, blob } = e.data;
  const r = await fetch('/' + id, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
  const line = r.status + ' ' + (await r.text());
  log.textContent += '\\n' + line;
  e.source.postMessage({ id, result: line }, e.origin);
});
</script>`;

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE);
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end();
    return;
  }
  const id = req.url?.slice(1) ?? '';
  const ext = EXT[req.headers['content-type'] ?? ''];
  if (req.method !== 'POST' || !/^[a-z0-9_]+$/.test(id) || !ext) {
    res.writeHead(400, cors).end('bad request');
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const dir = req.headers['content-type'].startsWith('audio/') ? join(OUT, 'music') : OUT;
    const file = join(dir, `${id}.${ext}`);
    writeFileSync(file, Buffer.concat(chunks));
    console.log(`saved ${file}`);
    res.writeHead(200, cors).end(`${id}.${ext}`);
  });
}).listen(PORT, '0.0.0.0', () => console.log(`receiving on :${PORT}`));
