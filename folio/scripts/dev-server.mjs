// Local server for development: serves the app and the Pronote relay at /api/pronote,
// the same routes Netlify serves in production.  Run:  node scripts/dev-server.mjs  [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import relay from '../netlify/functions/pronote-relay.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const port = +(process.argv[2] || process.env.PORT || 8888);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain',
};
const PRIVATE = /^\/(node_modules|netlify|scripts|tests|package(-lock)?\.json)(\/|$)/;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/pronote') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const out = await relay(new Request('http://localhost/api/pronote', { method: req.method, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }));
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    if (PRIVATE.test(path)) { res.writeHead(404).end('Not found'); return; }
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('Server error');
  }
}).listen(port, () => console.log(`Folio running at http://localhost:${port}`));
