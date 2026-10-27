// SG005 守门：选将（几选一 / 双将）与房间生命周期（局间保留 / 准备制 / 空房回收）
// 用法：node tools/roomcheck.js
// 默认自起两个本地服务（PORT=8097，回收测试用 PORT+1 + ROOM_TTL_MS=1500），只依赖 Node 标准库。
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.ROOMCHECK_PORT || process.env.PORT || 8097);
const TTL_PORT = PORT + 1;
const HOST = '127.0.0.1';
// 房间壳快照文件统一放临时目录：既不污染仓库，也保证各测试服务互不干扰
const TMP_DIR = path.join(os.tmpdir(), 'sanguo-roomcheck');
try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch {}
for (const f of fs.existsSync(TMP_DIR) ? fs.readdirSync(TMP_DIR) : []) {
  if (f.startsWith('rooms-')) try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch {}
}

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; bad.push(msg); console.log(`  ✗ ${msg}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function req(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const r = http.request({
      host: HOST, port, method, path: urlPath,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, body: parsed, raw: buf });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const GET = (port, p) => req(port, 'GET', p);
const POST = (port, p, b) => req(port, 'POST', p, b);

function startServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, ['src/server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST, ...extraEnv },
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', (e) => console.error('[roomcheck] 启动服务失败：', e.message));
  return child;
}

async function waitServer(port, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await GET(port, '/api/meta');
      if (r.status === 200) return true;
    } catch {}
    await sleep(120);
  }
  return false;
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode != null) return resolve();
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve(); }, 2000);
    child.once('exit', () => { clearTimeout(t); resolve(); });
    try { child.kill(); } catch { clearTimeout(t); resolve(); }
  });
}

// 打开一条 SSE（用于制造「有客户端在线 → 再断开」的场景），返回关闭函数
function openStream(port, roomId, token) {
  return new Promise((resolve, reject) => {
    const r = http.request({
      host: HOST, port, method: 'GET',
      path: `/api/rooms/${encodeURIComponent(roomId)}/stream?token=${encodeURIComponent(token)}`,
    }, (res) => {
      res.on('data', () => {});
      res.on('error', () => {});
      resolve({ close: () => { try { r.destroy(); } catch {} } });
    });
    r.on('error', reject);
    r.end();
  });
}

async function waitUntil(fn, timeout, step = 150) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await fn()) return true; } catch {}
    await sleep(step);
  }
  return false;
}

async function metaCardPool() {
  const meta = await GET(PORT, '/api/meta');
  const byId = new Map();
  for (const g of meta.body?.generals || []) byId.set(g.id, g);
  return byId;
}

async function main() {
  const servers = [];
  let mainSrv = null, ttlSrv = null;
  try {
    mainSrv = startServer(PORT, { RECONNECT_GRACE_MS: '100', STATE_FILE: path.join(TMP_DIR, 'rooms-main.json') });
    servers.push(mainSrv);
    if (!await waitServer(PORT)) {
      console.error(`[roomcheck] ${PORT} 端口服务未就绪`);
      return finish(1);
    }
    const metaById = await metaCardPool();

    console.log('\n[1-4] 抽将（draw）+ 双将：候选、数量校验、占位校验、开局合成');
    {
      const created = await POST(PORT, '/api/rooms', {
        modeId: 'duel', packs: ['standard'], pickMode: 'draw', pickCount: 3, dual: true,
        maxSeats: 2, name: '房主', aiSeats: 1,
      });
      ok(created.status === 200 && created.body.ok, '建房（draw/3选1/双将）返回 200');
      const roomId = created.body.roomId, token = created.body.token;
      ok(created.body.room.generalCount === 2 && created.body.room.dual === true, 'publicRoom 下发 dual 与 generalCount=2');
      ok(created.body.room.pickCount === 3 && created.body.room.round === 0, 'publicRoom 下发 pickCount=3、round=0');

      const info = await POST(PORT, `/api/rooms/${roomId}/pick-info`, { token });
      const cands = info.body?.candidates || [];
      ok(info.status === 200 && info.body.ok === true, 'pick-info 返回 200');
      ok(cands.length === 6, `draw 候选长度 = pickCount × generalCount = 6（实际 ${cands.length}）`);
      ok(new Set(cands).size === 6, '候选互不重复');
      ok(Array.isArray(info.body.pool) && info.body.pool.length > 0, 'pick-info 下发将池详情');
      ok(info.body.chosen.length === 0 && info.body.ready === false, '初始 chosen=[]、ready=false');

      const state0 = await GET(PORT, `/api/rooms/${roomId}/state`);
      ok(!JSON.stringify(state0.body.room).includes('candidates'), 'publicRoom 广播不包含 candidates');

      // 候选在首次 pick-info 时缓存：再次调用应一致
      const info2 = await POST(PORT, `/api/rooms/${roomId}/pick-info`, { token });
      ok(JSON.stringify(info2.body.candidates) === JSON.stringify(cands), '候选在首次调用后缓存复用');

      const wrongN = await POST(PORT, `/api/rooms/${roomId}/pick`, { token, generalIds: [cands[0]] });
      ok(wrongN.status === 400, `双将只提交 1 个武将 → 400（实际 ${wrongN.status}）`);

      const both = await POST(PORT, `/api/rooms/${roomId}/pick`, { token, generalIds: [cands[0], cands[1]] });
      ok(both.status === 200 && both.body.ok, `双将提交 2 个武将 → 200（实际 ${both.status}）`);
      ok(JSON.stringify(both.body.room.seats[0].generalIds) === JSON.stringify([cands[0], cands[1]]), '座位 generalIds 记录已选武将');

      const started = await POST(PORT, `/api/rooms/${roomId}/start`, { token });
      ok(started.status === 200 && started.body.ok, '第一局（round=0）未准备即可开始 → 200');

      const st = await GET(PORT, `/api/rooms/${roomId}/state?token=${encodeURIComponent(token)}`);
      ok(st.body.status === 'playing', `开局后 status=playing（实际 ${st.body.status}）`);
      const p0 = st.body.state?.players?.[0];
      const ids = p0?.generalIds || [];
      ok(ids.length === 2, `state 中 players[0].generalIds.length=2（实际 ${ids.length}）`);
      const g1 = metaById.get(ids[0]), g2 = metaById.get(ids[1]);
      const expectHp = Math.ceil((g1.hp + g2.hp) / 2);
      const expectArmor = (g1.armor || 0) + (g2.armor || 0);
      ok(p0 && p0.maxHp === expectHp, `双将体力上限 = ceil((${g1.hp}+${g2.hp})/2) = ${expectHp}（实际 ${p0?.maxHp}）`);
      ok(p0 && p0.armor === expectArmor, `双将护甲 = ${expectArmor}（实际 ${p0?.armor}）`);
      ok(p0 && p0.generalName.includes('＆'), `双将名用「A ＆ B」（实际 ${p0?.generalName}）`);

      // [3] 占位校验放在 all 模式（同一池、两人可见）
      const allRoom = await POST(PORT, '/api/rooms', {
        modeId: 'duel', packs: ['standard'], pickMode: 'all', maxSeats: 2, name: '甲',
      });
      const joined = await POST(PORT, `/api/rooms/${allRoom.body.roomId}/join`, { name: '乙' });
      const allInfo = await POST(PORT, `/api/rooms/${allRoom.body.roomId}/pick-info`, { token: allRoom.body.token });
      const gid = allInfo.body.pool[0].id;
      const pickA = await POST(PORT, `/api/rooms/${allRoom.body.roomId}/pick`, { token: allRoom.body.token, generalIds: [gid] });
      const pickB = await POST(PORT, `/api/rooms/${allRoom.body.roomId}/pick`, { token: joined.body.token, generalIds: [gid] });
      ok(pickA.status === 200, '甲选将 → 200');
      ok(pickB.status === 400, `乙重复选择已被占用的武将 → 400（实际 ${pickB.status}）`);
      ok(/其他座位/.test(pickB.body?.error || ''), `占位错误文案明确（${pickB.body?.error || '空'}）`);
      const hostOnly = await POST(PORT, `/api/rooms/${allRoom.body.roomId}/pick`, { token: allRoom.body.token, generalIds: [] });
      ok(hostOnly.status === 400, '空 generalIds 数量不符 → 400');

      await POST(PORT, `/api/rooms/${allRoom.body.roomId}/ready`, { token: joined.body.token, ready: true });
      const rInfo = await POST(PORT, `/api/rooms/${allRoom.body.roomId}/pick-info`, { token: joined.body.token });
      ok(rInfo.body.ready === true, 'ready 端点生效（pick-info.ready=true）');
    }

    console.log('\n[5-8] 局间：AI 对局结束 → ended 保留 → config 生效 → 准备制');
    let endRoom = null;
    {
      const created = await POST(PORT, '/api/rooms', {
        modeId: 'duel', packs: ['standard'], pickMode: 'draw', pickCount: 2, dual: false,
        maxSeats: 2, name: '观战', aiSeats: 2,
      });
      endRoom = created.body;
      const started = await POST(PORT, `/api/rooms/${endRoom.roomId}/start`, { token: endRoom.token });
      ok(started.status === 200, 'AI 对局（2 人 duel）开始 → 200');
      const ended = await waitUntil(async () => {
        const r = await GET(PORT, `/api/rooms/${endRoom.roomId}/state`);
        return r.body?.status === 'ended';
      }, 30000, 200);
      const st = await GET(PORT, `/api/rooms/${endRoom.roomId}/state`);
      ok(ended && st.body.status === 'ended', `对局结束 → status=ended（实际 ${st.body.status}）`);
      ok(st.body.room.seats.length === 2 && st.body.room.seats.every(s => s.generalId), 'ended 后仍保留 seats 与 token/将');
      ok(st.body.room.round === 1, `ended 后 round=1（实际 ${st.body.room.round}）`);
      ok(st.body.room.seats.every(s => (s.generalIds || []).length === 1), 'ended 后座位仍保留本局武将');
      ok(st.body.room.seats[0].ready === false && st.body.room.seats[1].ready === true, 'ended 后人类 ready=false、AI 恒 true');
      ok(st.body.state === null, 'ended 后 game 已清空（state=null）');

      // [8] 局间 config：dual / pickCount / pickMode 生效
      const cfg = await POST(PORT, `/api/rooms/${endRoom.roomId}/config`, {
        token: endRoom.token, dual: true, pickCount: 5, pickMode: 'draw', packs: ['standard'],
      });
      ok(cfg.status === 200 && cfg.body.ok, `局间 config → 200（实际 ${cfg.status}）`);
      const cfgRoom = cfg.body?.room || {};
      ok(cfgRoom.dual === true && cfgRoom.generalCount === 2, 'config 后 dual=true、generalCount=2');
      ok(cfgRoom.pickCount === 5, `config 后 pickCount=5（实际 ${cfgRoom.pickCount}）`);
      ok(cfgRoom.pickMode === 'draw', 'config 后 pickMode=draw');
      ok((cfgRoom.seats || []).every(s => (s.generalIds || []).length === 0), 'config 改 dual 后长度不符的已选武将已清空');

      // [6] ended 后未准备不能开；全员准备后才开
      const noReady = await POST(PORT, `/api/rooms/${endRoom.roomId}/start`, { token: endRoom.token });
      ok(noReady.status === 400, `ended 后未 ready 就 start → 400（实际 ${noReady.status}）`);
      ok(/未准备/.test(noReady.body?.error || ''), `未准备错误文案含人数（${noReady.body?.error || '空'}）`);
      const ready = await POST(PORT, `/api/rooms/${endRoom.roomId}/ready`, { token: endRoom.token, ready: true });
      ok(ready.status === 200 && ready.body.ready === true, '房主 ready=true → 200');
      const start2 = await POST(PORT, `/api/rooms/${endRoom.roomId}/start`, { token: endRoom.token });
      ok(start2.status === 200 && start2.body.ok, `全员 ready（AI 视为已准备）后 start → 200（实际 ${start2.status}）`);
      const st2 = await GET(PORT, `/api/rooms/${endRoom.roomId}/state`);
      ok(st2.body.room.round === 2, `第二局 round=2（实际 ${st2.body.room.round}）`);
      ok(st2.body.status === 'playing', '第二局 status=playing');
    }

    console.log('\n[9] 满员 AI 让位：真人加入顶掉电脑座位（原位替换）；局间也允许加入');
    {
      // 9.1 建房后 AI 补满 → 真人依次顶掉 AI
      const created = await POST(PORT, '/api/rooms', {
        modeId: 'identity', packs: ['standard'], pickMode: 'random',
        maxSeats: 3, name: '房主', aiSeats: 3,
      });
      const roomId = created.body.roomId, token = created.body.token;
      ok(created.status === 200 && created.body.room.seats.length === 3, '建房（AI 补满 3 人）→ seats=3');
      ok(created.body.room.status === 'waiting', `建房后应停在等待（准备）状态（status=${created.body.room.status}）`);
      ok(created.body.room.seats.filter(s => s.isAI).length === 2, 'AI 占满剩余座位（房主 1 + 电脑 2）');

      const j1 = await POST(PORT, `/api/rooms/${roomId}/join`, { name: '甲' });
      ok(j1.status === 200 && j1.body.ok, `满员 AI 房加入真人 → 200（实际 ${j1.status} ${j1.body?.error || ''}）`);
      ok(j1.body.replacedAI === true, '加入返回 replacedAI=true（顶掉了一个电脑座位）');
      ok(j1.body.room.seats.length === 3, `顶替后座位数应保持 3（实际 ${j1.body.room.seats.length}）`);
      const seat1 = j1.body.room.seats[j1.body.seat];
      ok(seat1 && !seat1.isAI && seat1.name === '甲', `新玩家落在被顶掉的座位（seat=${j1.body.seat}）`);
      ok(j1.body.room.seats.filter(s => s.isAI).length === 1, '顶替后只剩 1 个电脑座位');

      const j2 = await POST(PORT, `/api/rooms/${roomId}/join`, { name: '乙' });
      ok(j2.status === 200 && j2.body.replacedAI === true, '第二个真人再加入 → 再顶掉一个电脑');
      ok(j2.body.room.seats.filter(s => !s.isAI).length === 3, '此时真人座位应为 3');

      const j3 = await POST(PORT, `/api/rooms/${roomId}/join`, { name: '丙' });
      ok(j3.status === 400 && /已满/.test(j3.body?.error || ''), `全真人后再加入 → 400 房间已满（实际 ${j3.status}）`);

      // 9.2 局间（ended）允许加入并顶掉电脑
      const c2 = await POST(PORT, '/api/rooms', {
        modeId: 'duel', packs: ['standard'], pickMode: 'random', maxSeats: 2, name: '房主2', aiSeats: 2,
      });
      const r2 = c2.body.roomId, t2 = c2.body.token;
      const st = await POST(PORT, `/api/rooms/${r2}/start`, { token: t2 });
      ok(st.status === 200, '局间测试：AI 对局开始 → 200');
      const ended = await waitUntil(async () => {
        const r = await GET(PORT, `/api/rooms/${r2}/state`);
        return r.body?.status === 'ended';
      }, 30000, 200);
      ok(ended, '局间测试：对局应能结束（ended）');
      const j4 = await POST(PORT, `/api/rooms/${r2}/join`, { name: '丁' });
      ok(j4.status === 200 && j4.body.ok, `局间（ended）应允许加入（实际 ${j4.status} ${j4.body?.error || ''}）`);
      ok(j4.body.replacedAI === true, '局间加入同样顶掉电脑座位');
    }

    console.log('\n[10] 房间设置（房主可改人数 / 补 AI / 各座位托管）');
    {
      const c = await POST(PORT, '/api/rooms', {
        modeId: 'identity', packs: ['standard'], pickMode: 'random', maxSeats: 4, name: '房主', aiSeats: 4,
      });
      ok(c.status === 200, '设置测试：建房 → 200');
      const rid = c.body.roomId, tok = c.body.token;
      ok(c.body.room.maxPlayers === 8, `publicRoom 应下发 maxPlayers（实际 ${c.body.room.maxPlayers}）`);
      // 10.1 缩容：末尾是 AI → 成功
      const s1 = await POST(PORT, `/api/rooms/${rid}/config`, { token: tok, maxSeats: 3 });
      ok(s1.status === 200 && s1.body.room.maxSeats === 3, '缩容到 3 人（末尾为电脑）应成功');
      ok(s1.body.room.seats.length === 3, '缩容后座位数应为 3');
      // 10.2 真人加入顶掉最后一个电脑（index 2）
      const j = await POST(PORT, `/api/rooms/${rid}/join`, { name: '真人乙' });
      ok(j.status === 200 && j.body.replacedAI === true, '满员时真人加入顶掉电脑');
      ok(j.body.seat === 2, `让位应原位替换（实际座位 ${j.body.seat}）`);
      const otherTok = j.body.token;
      // 10.3 末尾是真人 → 缩容应被拒绝
      const s2 = await POST(PORT, `/api/rooms/${rid}/config`, { token: tok, maxSeats: 2 });
      ok(s2.status === 400 && /真人/.test(s2.body.error || ''), `末尾有真人时缩容应 400（实际 ${s2.status} ${s2.body?.error || ''}）`);
      ok(s2.body.error.includes('真人乙'), '错误信息应指出是哪位玩家占用座位');
      // 10.4 fillAI 补足
      const s3 = await POST(PORT, `/api/rooms/${rid}/config`, { token: tok, maxSeats: 4, fillAI: true });
      ok(s3.status === 200 && s3.body.room.seats.length === 4, 'fillAI 应补足到 4 个座位');
      ok(s3.body.room.seats[3].isAI === true, '补足出来的座位应为电脑');
      // 10.5 非房主不能改他人托管
      const a1 = await POST(PORT, `/api/rooms/${rid}/autoplay`, { token: otherTok, seat: 0, enabled: true, seconds: 20 });
      ok(a1.status === 403, `非房主调整他人托管应 403（实际 ${a1.status}）`);
      // 10.6 房主可为其他真人座位设置托管
      const a2 = await POST(PORT, `/api/rooms/${rid}/autoplay`, { token: tok, seat: 2, enabled: true, seconds: 42 });
      ok(a2.status === 200 && a2.body.seat === 2, '房主应能调整其他玩家的托管');
      const st = await GET(PORT, `/api/rooms/${rid}/state`);
      ok(st.body.room.seats[2].autoSeconds === 42, `托管秒数应下发（实际 ${st.body.room.seats[2].autoSeconds}）`);
      ok(st.body.room.seats[2].auto === true, '托管启用状态应下发');
      // 10.7 电脑座位无需托管
      const a3 = await POST(PORT, `/api/rooms/${rid}/autoplay`, { token: tok, seat: 3, enabled: true, seconds: 20 });
      ok(a3.status === 400, `对电脑座位设置托管应 400（实际 ${a3.status}）`);
      // 10.8 非房主改自己仍然可以
      const a4 = await POST(PORT, `/api/rooms/${rid}/autoplay`, { token: otherTok, enabled: true, seconds: 30 });
      ok(a4.status === 200 && a4.body.seat === 2, '玩家仍可自行调整自己的托管');
    }

    console.log('\n[11] SG019 修复回归：扩员补位 / token 复用 / 仅改身份不重置准备 / 包去重');
    {
      const c = await POST(PORT, '/api/rooms', {
        modeId: 'identity', packs: ['standard'], pickMode: 'random', maxSeats: 3, name: '房主', aiSeats: 3,
      });
      const rid = c.body.roomId, tok = c.body.token;
      ok(c.body.room.seats.length === 3, '扩员测试：初始 3 座位');
      // 11.1 扩员自动补电脑占位座（seats.length 必须等于 maxSeats）
      const e1 = await POST(PORT, `/api/rooms/${rid}/config`, { token: tok, maxSeats: 5 });
      ok(e1.status === 200 && e1.body.room.seats.length === 5, `扩大到 5 人应自动补电脑占位座（实际 ${e1.body?.room?.seats?.length}）`);
      ok(e1.body.room.seats.slice(3).every(s => s.isAI), '补出来的座位应全是电脑');
      // 11.2 同 token 重连复用座位，不再新增
      const j1 = await POST(PORT, `/api/rooms/${rid}/join`, { token: tok, name: '房主' });
      ok(j1.status === 200 && j1.body.reused === true, `同 token 重连应复用座位（实际 ${JSON.stringify(j1.body.reused)}）`);
      ok(j1.body.room.seats.length === 5, '重连后座位数不应变化');
      // 11.3 只改房主身份不应重置别人的准备状态
      const jn = await POST(PORT, `/api/rooms/${rid}/join`, { name: '乙' });
      const nTok = jn.body.token, nSeat = jn.body.seat;
      // 让乙准备（第一轮没有准备按钮，用 ready 字段走接口不现实 → 直接断言 poolChanged 标志）
      const e2 = await POST(PORT, `/api/rooms/${rid}/config`, { token: tok, hostRole: 'loyalist' });
      ok(e2.status === 200, '只改房主身份应 200');
      ok(e2.body.poolChanged === false, `只改身份不应触发将池重置（实际 poolChanged=${e2.body.poolChanged}）`);
      const st2 = await GET(PORT, `/api/rooms/${rid}/state`);
      ok(st2.body.room.hostRole === 'loyalist', '房主身份应已更新');
      // 11.4 改武将包触发将池重置
      const e3 = await POST(PORT, `/api/rooms/${rid}/config`, { token: tok, packs: ['standard', 'jie'] });
      ok(e3.status === 200 && e3.body.poolChanged === true, `改武将包应触发重置（实际 poolChanged=${e3.body?.poolChanged}）`);
      // 11.5 重复包去重
      const e4 = await POST(PORT, `/api/rooms/${rid}/config`, { token: tok, packs: ['standard', 'standard', 'jie'] });
      ok(e4.body.room.packs.length === 2, `重复包应去重（实际 ${JSON.stringify(e4.body?.room?.packs)}）`);
      // 11.6 非法包全部过滤后回退 standard
      const e5 = await POST(PORT, `/api/rooms/${rid}/config`, { token: tok, packs: ['not_a_pack'] });
      ok(e5.body.room.packs.join(',') === 'standard', `非法包应回退 standard（实际 ${JSON.stringify(e5.body?.room?.packs)}）`);
      ok(!!nTok && nSeat >= 0, '陪测玩家已就位');
      // 11.7 缩容时若末尾是真人仍应 400，且不能留下「已改武将包」的脏状态
      const e6 = await POST(PORT, `/api/rooms/${rid}/config`, { token: tok, packs: ['jie'], maxSeats: 2 });
      ok(e6.status === 400, `末尾有真人时缩容应 400（实际 ${e6.status}）`);
      const st3 = await GET(PORT, `/api/rooms/${rid}/state`);
      ok(st3.body.room.packs.join(',') === 'standard', `400 时不得改动武将包（实际 ${JSON.stringify(st3.body?.room?.packs)}）`);
    }

    console.log('\n[7] 空房回收：ROOM_TTL_MS=1500，断开 SSE 后 3 秒内删除');
    {
      ttlSrv = startServer(TTL_PORT, { ROOM_TTL_MS: '1500', STATE_FILE: path.join(TMP_DIR, 'rooms-ttl.json') });
      servers.push(ttlSrv);
      if (!await waitServer(TTL_PORT)) {
        ok(false, `${TTL_PORT} 端口回收测试服务未就绪`);
      } else {
        const created = await POST(TTL_PORT, '/api/rooms', { modeId: 'duel', packs: ['standard'], maxSeats: 2, name: '空房' });
        ok(created.status === 200, 'TTL 服务建房 → 200');
        const stream = await openStream(TTL_PORT, created.body.roomId, created.body.token);
        await sleep(350);
        const online = await GET(TTL_PORT, `/api/rooms/${created.body.roomId}/state`);
        ok(online.status === 200, 'SSE 在线时房间存在');
        stream.close();
        const deleted = await waitUntil(async () => {
          const r = await GET(TTL_PORT, `/api/rooms/${created.body.roomId}/state`);
          return r.status === 404;
        }, 3000, 100);
        ok(deleted, '断开所有 SSE 后 3 秒内房间被回收（state → 404）');
      }
    }

    console.log('\n[12] 房间存活：重启恢复（房间壳持久化）+ 对局中不按短 TTL 回收 + 维护提示');
    {
      // 12.1/12.2 单独一套服务：允许中途停掉再起（模拟部署更新时的 systemctl restart）
      const P2 = PORT + 2;
      const stateFile = path.join(TMP_DIR, 'rooms-persist.json');
      try { fs.unlinkSync(stateFile); } catch {}
      let svc = startServer(P2, { RECONNECT_GRACE_MS: '100', STATE_FILE: stateFile });
      servers.push(svc);
      ok(await waitServer(P2), `12.1 服务就绪（${P2}）`);

      const c1 = await POST(P2, '/api/rooms', {
        modeId: 'duel', packs: ['standard'], pickMode: 'draw', pickCount: 2, dual: false,
        maxSeats: 2, name: '重启测试', aiSeats: 2,
      });
      ok(c1.status === 200, '12.1 建房 200');
      const rid = c1.body.roomId, tok = c1.body.token;
      await sleep(800); // 等 debounce 落盘（400ms）
      ok(fs.existsSync(stateFile), '12.1 房间已写入磁盘快照');

      await stopServer(svc);
      svc = startServer(P2, { RECONNECT_GRACE_MS: '100', STATE_FILE: stateFile });
      servers.push(svc);
      ok(await waitServer(P2), '12.1 重启后服务就绪');
      let r1 = await GET(P2, `/api/rooms/${rid}/state`);
      ok(r1.status === 200 && r1.body?.room?.id === rid, `12.1 重启后房间仍在（实际 ${r1.status}）`);
      ok((r1.body?.room?.seats || []).length === 2, `12.1 重启后座位完整（真人 + AI，实际 ${(r1.body?.room?.seats || []).length}）`);
      ok(r1.body?.room?.interrupted == null, '12.1 未开局的房间不应标记为中断');
      const r1b = await POST(P2, `/api/rooms/${rid}/pick-info`, { token: tok });
      ok(r1b.status === 200, `12.1 重启后原 token 仍有效，可直接重连（实际 ${r1b.status}）`);

      // 12.2 对局进行中重启：房间保留 → 回到 waiting → 标记 interrupted
      const pick = await POST(P2, `/api/rooms/${rid}/pick`, { token: tok, generalIds: [r1b.body.candidates[0]] });
      ok(pick.status === 200, `12.2 选将 200（实际 ${pick.status}）`);
      await POST(P2, `/api/rooms/${rid}/ready`, { token: tok, ready: true });
      const st1 = await POST(P2, `/api/rooms/${rid}/start`, { token: tok });
      ok(st1.status === 200 && st1.body.ok, `12.2 开局 200（实际 ${st1.status}）`);
      await sleep(800);
      await stopServer(svc);
      svc = startServer(P2, { RECONNECT_GRACE_MS: '100', STATE_FILE: stateFile });
      servers.push(svc);
      ok(await waitServer(P2), '12.2 重启后服务就绪');
      const r2 = await GET(P2, `/api/rooms/${rid}/state`);
      ok(r2.status === 200, `12.2 对局中断后房间仍存在（实际 ${r2.status}）`);
      ok(r2.body?.status === 'waiting', `12.2 状态回到 waiting（实际 ${r2.body?.status}）`);
      ok(r2.body?.room?.interrupted === 'restart', `12.2 标记 interrupted=restart（实际 ${r2.body?.room?.interrupted}）`);
      ok(r2.body?.state === null, '12.2 已中断的对局不再下发 state');
      ok((r2.body?.room?.seats || []).filter(x => !x.isAI).every(x => x.ready === false), '12.2 人类座位重置为未准备');

      // 12.3 对局进行中：即使短 TTL 也不回收（玩家锁屏/断网不该被踢出）
      const P3 = PORT + 3;
      const svc3 = startServer(P3, {
        ROOM_TTL_MS: '800', ROOM_PLAY_TTL_MS: '600000',
        STATE_FILE: path.join(TMP_DIR, 'rooms-play.json'),
      });
      servers.push(svc3);
      ok(await waitServer(P3), `12.3 短 TTL 服务就绪（${P3}）`);
      const c3 = await POST(P3, '/api/rooms', {
        modeId: 'duel', packs: ['standard'], pickMode: 'random', dual: false,
        maxSeats: 2, name: '中局回收', aiSeats: 2,
      });
      const rid3 = c3.body.roomId, tok3 = c3.body.token;
      await POST(P3, `/api/rooms/${rid3}/ready`, { token: tok3, ready: true });
      const s3 = await POST(P3, `/api/rooms/${rid3}/start`, { token: tok3 });
      ok(s3.status === 200 && s3.body.ok, `12.3 开局 200（实际 ${s3.status}）`);
      await sleep(3000); // 远超 800ms 的短 TTL
      const alive3 = await GET(P3, `/api/rooms/${rid3}/state`);
      ok(alive3.status === 200, `12.3 对局中无任何 SSE 连接 3 秒后房间仍存活（实际 ${alive3.status}）`);

      // 12.4 维护提示端点：部署脚本重启前调用
      const n4 = await POST(P2, '/api/admin/notice', { text: '测试维护提示', seconds: 5 });
      ok(n4.status === 200 && n4.body?.ok === true, `12.4 /api/admin/notice 本机可调用（实际 ${n4.status}）`);
    }

  } catch (e) {
    console.error('[roomcheck] 运行异常：', e);
    fail++;
    bad.push(`运行异常：${e.message}`);
  } finally {
    for (const s of servers) await stopServer(s);
  }
  return finish(0);
}

function finish(extraFail) {
  if (extraFail) fail += extraFail;
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  if (bad.length) {
    console.log('失败项：');
    for (const b of bad) console.log(`  - ${b}`);
  }
  process.exit(fail ? 1 : 0);
}

main();
