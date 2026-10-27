#!/usr/bin/env node
// 房主自选身份守门：node tools/rolecheck.js
// 引擎层：assignRoles 按 config.hostRole 指定房主身份，人数不匹配时回退主公；主公体力上限 +1 仍生效
// 服务端层：建房/局间下发 hostRole、开局生效、非身份模式忽略、非房主拿不到 hostRole
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/engine/index.js';
import { MODES } from '../src/modes/index.js';
import { deckEntries } from '../src/data/deck.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.ROLECHECK_PORT || 8095);
const HOST = '127.0.0.1';

let pass = 0, fail = 0;
const bad = [];
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; bad.push(m); console.log(`  ✗ ${m}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const resp = { async askPlay() { return { endPhase: true }; }, async ask() { return null; } };

function mkGame(n, modeId, hostRole) {
  const seats = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: { id: `t${i}`, name: `T${i}`, hp: 4, kingdom: 'qun', skills: [] } }));
  return new Game({ seats, mode: MODES[modeId], seed: 3, responder: resp, deckEntries: deckEntries(MODES[modeId].deck), config: { hostRole } });
}

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const r = http.request({ host: HOST, port: PORT, method, path: urlPath, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => { buf += c; });
      res.on('end', () => { let p = null; try { p = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, body: p }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // ---------- 引擎层 ----------
  {
    const g = mkGame(4, 'identity', null);
    ok(g.players[0].role === 'lord', '默认：房主（0 号位）为主公');
    const lord = g.players.find(p => p.role === 'lord');
    ok(lord.maxHp === 5, `主公体力上限 +1 生效（实际 ${lord.maxHp}）`);
  }
  {
    const g = mkGame(4, 'identity', 'rebel');
    ok(g.players[0].role === 'rebel', '房主选「反贼」→ 房主身份为反贼');
    const lords = g.players.filter(p => p.role === 'lord');
    ok(lords.length === 1 && lords[0].seat !== 0, '主公自动落到其他座位（且仅 1 名主公）');
    const counts = g.players.reduce((m, p) => (m[p.role] = (m[p.role] || 0) + 1, m), {});
    ok(counts.rebel === 2 && counts.loyalist === 1, `4 人局身份数量守恒（${JSON.stringify(counts)}）`);
    ok(lords[0].maxHp === 5, '主公换人后体力上限仍 +1');
  }
  {
    const g = mkGame(5, 'junzheng', 'renegade');
    ok(g.players[0].role === 'renegade', '军争 5 人：房主可选「内奸」');
    ok(g.players.filter(p => p.role === 'lord').length === 1, '军争局主公仍唯一');
  }
  {
    const g = mkGame(4, 'identity', 'renegade');
    ok(g.players[0].role === 'lord', '4 人局没有内奸 → 回退为主公');
  }
  {
    const g = mkGame(2, 'identity', 'loyalist');
    ok(g.players[0].role === 'lord', '2 人局只有主公/反贼 → 选忠臣时回退主公');
  }

  // ---------- 服务端层 ----------
  const child = spawn(process.execPath, [path.join(ROOT, 'src/server/index.js')], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST }, stdio: 'ignore',
  });
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { await sleep(150); try { up = (await req('GET', '/api/meta')).status === 200; } catch {} }
    if (!up) throw new Error('服务未启动');

    // 1) 房主选反贼 → 开局生效
    const r1 = await req('POST', '/api/rooms', { modeId: 'identity', hostRole: 'rebel', maxSeats: 4, aiSeats: 4, name: '房主' });
    ok(r1.status === 200 && r1.body.roomId, '建房（hostRole=rebel）成功');
    const rid1 = r1.body.roomId, tok1 = r1.body.token;
    const info1 = await req('POST', `/api/rooms/${rid1}/pick-info`, { token: tok1 });
    ok(info1.body?.hostRole === 'rebel', `房主可从 pick-info 取回自己的身份选择（${info1.body?.hostRole}）`);
    await req('POST', `/api/rooms/${rid1}/start`, { token: tok1 });
    await sleep(600);
    const st1 = await req('POST', `/api/rooms/${rid1}/state?token=${encodeURIComponent(tok1)}`);
    const pl1 = st1.body?.state?.players || [];
    ok(pl1[0]?.role === 'rebel', `开局后房主身份为反贼（实际 ${pl1[0]?.role}）`);
    ok(pl1.filter(p => p.role === 'lord').length === 1, '开局后仍有一名主公（且不在 0 号位）');

    // 2) 不传 hostRole → 房主仍为默认主公
    const r2 = await req('POST', '/api/rooms', { modeId: 'identity', maxSeats: 4, aiSeats: 4, name: '房主2' });
    await req('POST', `/api/rooms/${r2.body.roomId}/start`, { token: r2.body.token });
    await sleep(600);
    const st2 = await req('POST', `/api/rooms/${r2.body.roomId}/state?token=${encodeURIComponent(r2.body.token)}`);
    ok((st2.body?.state?.players || [])[0]?.role === 'lord', '未指定时房主仍是主公');

    // 3) 非身份模式：hostRole 被忽略
    const r3 = await req('POST', '/api/rooms', { modeId: 'duel', hostRole: 'rebel', maxSeats: 2, aiSeats: 2, name: '决斗' });
    const info3 = await req('POST', `/api/rooms/${r3.body.roomId}/pick-info`, { token: r3.body.token });
    ok(!info3.body?.hostRole, '1v1 模式不接受 hostRole（返回空）');

    // 4) 非房主拿不到 hostRole（不泄露）
    const r4 = await req('POST', '/api/rooms', { modeId: 'identity', hostRole: 'renegade', maxSeats: 5, aiSeats: 0, name: '房主4' });
    const j4 = await req('POST', `/api/rooms/${r4.body.roomId}/join`, { name: '路人' });
    const info4 = await req('POST', `/api/rooms/${r4.body.roomId}/pick-info`, { token: j4.body.token });
    ok(!info4.body?.hostRole, '非房主拿不到房主的身份选择');

    // 5) 局间可通过 config 改身份
    const c5 = await req('POST', `/api/rooms/${r4.body.roomId}/config`, { token: r4.body.token, hostRole: 'loyalist' });
    ok(c5.status === 200, '房主可通过 config 修改身份');
    const info5 = await req('POST', `/api/rooms/${r4.body.roomId}/pick-info`, { token: r4.body.token });
    ok(info5.body?.hostRole === 'loyalist', 'config 修改后的身份可回读');
    const c6 = await req('POST', `/api/rooms/${r4.body.roomId}/config`, { token: j4.body.token, hostRole: 'lord' });
    ok(c6.status === 403, '非房主不能修改身份（403）');
  } finally {
    child.kill();
  }

  console.log(`\n房主自选身份：通过 ${pass} / 失败 ${fail}`);
  if (fail) { for (const b of bad) console.log('  -', b); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
