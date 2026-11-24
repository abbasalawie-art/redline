// Tiny local web server for trying the app on this PC:  node tools/serve.mjs  → http://localhost:5173
//   node tools/serve.mjs --lan   also lets other devices on the same Wi-Fi open it (http://<this PC's IP>:5173)
//   node tools/serve.mjs --base /redline --port 5174   serves it from a sub-folder, the way GitHub Pages does
// Also serves ./tests at /tests/, and (for testing only, from this PC only) accepts POST /__save?name=x.pdf into ./tests/out/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const port = Number(arg('--port') || process.env.PORT || 5173);
const basePath = (arg('--base') || '').replace(/\/+$/, '');
const lan = process.argv.includes('--lan');
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
  '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.icc': 'application/vnd.iccprofile',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/__save') {
    if (!isLocal(req)) { res.writeHead(403).end(); return; }
    const name = path.basename(url.searchParams.get('name') || 'out.pdf');
    const dir = path.join(root, 'tests', 'out');
    fs.mkdirSync(dir, { recursive: true });
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks)); res.end('saved'); });
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.startsWith('/tests/') && !isLocal(req)) { res.writeHead(403).end(); return; }
  const base = rel.startsWith('/tests/') ? root : path.join(root, 'app');
  if (basePath && base !== root) {
    if (rel === '/' || rel === basePath) { res.writeHead(302, { location: basePath + '/' }).end(); return; }
    if (!rel.startsWith(basePath + '/')) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
    rel = rel.slice(basePath.length);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(base, rel);
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}).listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => console.log(`Redline running at http://localhost:${port}${basePath}/${lan ? ' (and on the local network)' : ''}`));
