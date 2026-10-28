// 端到端：房间设置「AI 大脑」→ 快照回显 → 开局后真人能看到 ai-think 与战报
// 用法：node tools/llmroom.js [BASE]
//   BASE 默认 http://127.0.0.1:8096（需先把服务起在该端口，且带 DEEPSEEK_API_KEY）
const BASE = process.argv[2] || 'http://127.0.0.1:8096';

let pass = 0, fail = 0;
const bad = [];
const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); console.log('  ✗', m); } };
const post = async (p, body) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const get = async (p) => {
  const r = await fetch(BASE + p);
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

// 1. 状态端点：只回可用性，绝不回密钥
{
  const { data } = await get('/api/llm-status');
  ok(!!data.providers?.deepseek, 'S1a llm-status 应含 deepseek');
  ok(typeof data.enabled === 'boolean', 'S1b enabled 必须是布尔');
  ok(!JSON.stringify(data).includes('sk-'), 'S1c llm-status 绝不能泄露密钥');
  ok(!JSON.stringify(data).includes('api.deepseek.com'), 'S1d llm-status 不应暴露上游地址');
}

// 2. 建房 → 改配置 → 快照回显
const created = await post('/api/rooms', { modeId: 'duel', maxSeats: 2, name: '房主', aiSeats: 1 });
ok(created.status === 200 && !!created.data.roomId, 'S2a 应能建房');
const { roomId, token } = created.data;
let room = created.data.room;
ok(room.aiBrain === 'builtin', `S2b 新房间默认内置 AI（实际 ${room.aiBrain}）`);

const cfg = await post(`/api/rooms/${roomId}/config`, { token, aiBrain: 'llm', aiModel: 'deepseek', aiLevel: 'high', maxSeats: 2, fillAI: true });
ok(cfg.data?.ok, `S2c 保存 AI 配置应成功（${JSON.stringify(cfg.data).slice(0, 120)}）`);
room = cfg.data.room || {};
ok(room.aiBrain === 'llm', `S2d 保存后快照应为 llm（实际 ${room.aiBrain}）`);
ok(room.aiModel === 'deepseek', `S2e 模型应回显 deepseek（实际 ${room.aiModel}）`);
ok(room.aiLevel === 'high', `S2f 强度应回显 high（实际 ${room.aiLevel}）`);
ok(typeof room.aiReady === 'boolean', 'S2g 快照应下发 aiReady');
ok((room.seats || []).some(s => s.isAI), 'S2h 应已用电脑补足座位');

// 3. 非法值必须被拒绝（不污染房间状态）
{
  const bad1 = await post(`/api/rooms/${roomId}/config`, { token, aiBrain: 'hack' });
  const st = await get(`/api/rooms/${roomId}/state?token=${encodeURIComponent(token)}`);
  ok(st.data?.room?.aiBrain === 'llm', `S3a 非法 aiBrain 应被忽略（实际 ${st.data?.room?.aiBrain}）`);
  const bad2 = await post(`/api/rooms/${roomId}/config`, { token, aiLevel: 'ultra' });
  const st2 = await get(`/api/rooms/${roomId}/state?token=${encodeURIComponent(token)}`);
  ok(st2.data?.room?.aiLevel === 'high', `S3b 非法 aiLevel 应被忽略（实际 ${st2.data?.room?.aiLevel}）`);
}

// 4. 开局，收集 ai-think 与 log
// Node 20 没有全局 EventSource，手写 SSE 解析（与浏览器同协议，够用）
const events = [];
const controller = new AbortController();
(async () => {
  const r = await fetch(`${BASE}/api/rooms/${roomId}/stream?token=${encodeURIComponent(token)}`, { signal: controller.signal });
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let ev = '', data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) ev = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (ev) {
        let d = null;
        try { d = JSON.parse(data); } catch {}
        events.push({ t: ev, d });
        // 真人座位自动应答：出牌阶段直接结束阶段，其它询问一律不响应 → 尽快轮到电脑，好观察 AI
        if (ev === 'ask' && d && d.id != null) {
          const answer = d.kind === 'play' ? { endPhase: true } : null;
          post(`/api/rooms/${roomId}/action`, { token, reqId: d.id, reqKind: d.kind, answer }).catch(() => {});
        }
      }
    }
  }
})().catch(() => {});
await new Promise(r => setTimeout(r, 600));

const started = await post(`/api/rooms/${roomId}/start`, { token });
ok(started.data?.ok !== false, `S4a 开局应成功（${JSON.stringify(started.data).slice(0, 120)}）`);

const deadline = Date.now() + Number(process.env.WAIT_MS || 45000);
let thinkStart = 0, thinkDone = 0, thinkMiss = 0, thinkDead = 0;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 500));
  thinkStart = events.filter(e => e.t === 'ai-think' && e.d.phase === 'start').length;
  thinkDone = events.filter(e => e.t === 'ai-think' && e.d.phase === 'done').length;
  thinkMiss = events.filter(e => e.t === 'ai-think' && e.d.phase === 'miss').length;
  thinkDead = events.filter(e => e.t === 'ai-think' && e.d.phase === 'dead').length;
  if (thinkDone >= 1 || thinkDead >= 1) break;
}
try { controller.abort(); } catch {}

ok(thinkStart >= 1, `S4b 真人应收到 ai-think:start（实际 ${thinkStart}）`);
ok(thinkDone + thinkDead >= 1, `S4c 应有决策结果或熔断事件（done=${thinkDone} dead=${thinkDead} miss=${thinkMiss}）`);
const dn = events.find(e => e.t === 'ai-think' && e.d.phase === 'done');
if (dn) {
  ok(typeof dn.d.ms === 'number', 'S4d done 应带耗时');
  ok(!!dn.d.label, 'S4e done 应带动作名');
  const del = events.find(e => e.t === 'ai-think' && e.d.phase === 'dead');
  ok(thinkDone >= 1 || !!del, 'S4f 决策链路应闭环');
}
// 「🤖 想了 4.2s → 使用【杀】」这条战报由前端渲染（tools/uiai.cjs 覆盖），
// 服务端这里只需保证把决策细节完整广播出来
const dn2 = events.find(e => e.t === 'ai-think' && e.d.phase === 'done');
ok(!!dn2 && typeof dn2.d.ms === 'number' && !!dn2.d.label, 'S4g 决策事件须带耗时与动作名（前端据此写战报）');
ok(!!dn2 && typeof dn2.d.seat === 'number' && dn2.d.seat >= 0, 'S4g2 决策事件须标明是哪个座位');
// 对局仍在推进
const st = await get(`/api/rooms/${roomId}/state?token=${encodeURIComponent(token)}`);
ok(!!st.data?.state || ['playing', 'ended'].includes(st.data?.status), `S4h 对局应已开局（status=${st.data?.status}）`);

console.log(`\nLLMROOM：通过 ${pass} / 失败 ${fail}  （think start=${thinkStart} done=${thinkDone} miss=${thinkMiss} dead=${thinkDead}）`);
if (bad.length) { console.log('失败项：'); for (const b of bad) console.log('  -', b); }
process.exit(fail ? 1 : 0);
