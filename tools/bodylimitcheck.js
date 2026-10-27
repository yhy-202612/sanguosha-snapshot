// Q2-B 守门：readBody 超限必须返回 413（而不是 destroy 后挂起）
// 用法：node tools/bodylimitcheck.js
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.BODYCHECK_PORT || 8099);
const HOST = '127.0.0.1';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

function raw(port, method, urlPath, payload, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const r = http.request({ host: HOST, port, method, path: urlPath, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => done({ status: res.statusCode, text: buf }));
    });
    r.on('error', (e) => done({ status: 0, error: e.code || e.message }));
    r.setTimeout(timeoutMs, () => { r.destroy(); done({ status: 0, error: 'TIMEOUT' }); });
    r.end(payload);
  });
}

const child = spawn(process.execPath, ['src/server/index.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST }, stdio: 'ignore',
});
// 等服务就绪（轮询而非固定 sleep：沙箱 I/O 慢时 900ms 不够，会导致整组 4 条假失败）
await sleep(300);
for (let i = 0; i < 40; i++) {
  const probe = await raw(PORT, 'GET', '/api/meta');
  if (probe.status) break;
  await sleep(250);
}

// 1. 正常小请求仍可用
const small = await raw(PORT, 'POST', '/api/rooms', JSON.stringify({ name: '小请求' }));
ok(small.status === 200, `小请求应 200（实际 ${small.status}）`);

// 2. 1.1MB 请求体 → 413，且必须在超时前返回（不挂起）
const big = 'x'.repeat(1100 * 1024);
const r1 = await raw(PORT, 'POST', '/api/rooms', `{"pad":"${big}"}`);
ok(r1.status === 413, `1.1MB 请求体应 413（实际 ${r1.status} ${r1.error || ''}）`);
ok(/请求体过大|BODY_TOO_LARGE/.test(r1.text || ''), '413 响应应包含中文提示或 code');

// 3. 服务仍存活（后续请求正常）
const after = await raw(PORT, 'POST', '/api/rooms', JSON.stringify({ name: '之后' }));
ok(after.status === 200, `超限请求后服务应仍存活（实际 ${after.status}）`);

child.kill('SIGKILL');
console.log(`\n=== bodylimitcheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
