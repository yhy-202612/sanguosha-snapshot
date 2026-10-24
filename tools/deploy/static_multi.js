// 第三方三国杀 Web 版的统一静态服务（多个前端共用一个端口，按路径前缀映射）
// 用法：PORT=8031 MAP="/sanguo-noname/:/opt/sanguo-alt/noname,/sanguo-kevin/:/opt/sanguo-alt/kevin/build" node static.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = Number(process.env.PORT || 8031);
const HOST = process.env.HOST || '172.19.0.1';
const MAP = (process.env.MAP || '/sanguo-noname/:/opt/sanguo-alt/noname')
  .split(',').map(s => s.trim()).filter(Boolean)
  .map(s => { const i = s.indexOf(':'); return { prefix: s.slice(0, i), dir: s.slice(i + 1) }; });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm',
  '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml)|image\/svg)/;

function pick(prefix) {
  return MAP.filter(m => prefix.startsWith(m.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
}

function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(root)) return null; // 防目录穿越
  return p;
}

function statFile(p) {
  try { const st = fs.statSync(p); return st.isFile() ? st : null; } catch { return null; }
}

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); return res.end('bad request'); }

  const hit = pick(urlPath);
  if (!hit) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('未配置该路径前缀：' + urlPath);
  }
  let rel = urlPath.slice(hit.prefix.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  let file = safeJoin(hit.dir, rel);
  if (!file) { res.writeHead(403); return res.end('forbidden'); }

  let st = statFile(file);
  if (!st) {
    // 目录：补 index.html；再不行就当 SPA 回退到首页
    const asDir = statFile(path.join(file, 'index.html'));
    if (asDir) { file = path.join(file, 'index.html'); st = asDir; }
    else {
      const fallback = path.join(hit.dir, 'index.html');
      const fst = statFile(fallback);
      if (fst && !path.extname(file)) { file = fallback; st = fst; }
      else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('404 ' + urlPath);
      }
    }
  }

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`;
  const headers = {
    'content-type': type,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    etag,
  };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }

  const gz = COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && st.size > 1024;
  if (gz) headers['content-encoding'] = 'gzip';

  const stream = fs.createReadStream(file);
  stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
  const body = gz ? stream.pipe(zlib.createGzip({ level: 6 })) : stream;
  res.writeHead(200, headers);
  body.pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`静态多站服务：http://${HOST}:${PORT}`);
  for (const m of MAP) console.log(`  ${m.prefix} -> ${m.dir}`);
});
