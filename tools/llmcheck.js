// LLM 大脑守门：node tools/llmcheck.js
// 覆盖：候选动作枚举的合法性、决策解析容错、接口失败/超时回落、端到端选中编号即执行
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { deckEntries } from '../src/data/deck.js';
import { generalById } from '../src/data/generals.js';
import { getMode } from '../src/modes/index.js';
import { enumerateActions, parseDecision, makeLLMBrain, describeState, llmStatus, llmStats, resetLLMStats } from '../src/ai/llm.js';
import { AIPlayer } from '../src/ai/index.js';

let pass = 0, fail = 0;
const bad = [];
const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); console.log('  ✗', m); } };

let uid = 0;
const mk = (name, suit = 'spade', num = 7) => ({ id: `llm${++uid}`, name, suit, num, type: 'basic' });

function newGame(seed = 7) {
  const gens = ['sunquan', 'caocao', 'liubei', 'guanyu'];
  const seats = gens.map((gid, i) => ({ id: `p${i}`, name: `P${i}`, isAI: true, general: generalById(gid) }));
  const g = new Game({
    seats, mode: getMode('identity'), seed, deckEntries: deckEntries('standard'),
    responder: { askPlay: async () => ({ endPhase: true }), ask: async () => null },
    config: { timeout: 500 },
  });
  g.onState = () => {};
  g.turnCount = 3;
  g.phase = 'play';
  for (const p of g.players) { p.hand = []; p.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null, treasure: null }; p.hp = 4; p.maxHp = 4; }
  g.players[0].role = 'lord';
  g.players[1].role = 'rebel';
  g.players[2].role = 'loyalist';
  g.players[3].role = 'rebel';
  return g;
}

// 回答结构必须始终合法（不论走 LLM 还是回落）
const legalAnswer = (ans, me) => {
  if (!ans || typeof ans !== 'object') return false;
  if (ans.endPhase === true) return true;
  if (ans.skill) return true;
  if (ans.card) return me.hand.includes(ans.card) && Array.isArray(ans.targets) && ans.targets.length >= 1;
  return false;
};

// ---------------- 1. 候选枚举合法性 ----------------
{
  const g = newGame();
  const me = g.players[0];
  me.hand = [mk('sha'), mk('shan'), mk('tao'), mk('wuzhong'), mk('guohe'), mk('qinggang')];
  me.hp = 4;
  me.equips.weapon = { id: 'w0', name: 'qinglong', suit: 'spade', num: 5 };
  const acts = enumerateActions(g, me, { rich: true });
  ok(acts.length > 0, 'T1a 应有候选动作');
  ok(acts[acts.length - 1].type === 'end', 'T1b 最后一个候选必须是「结束出牌阶段」');
  let illegal = 0;
  for (const a of acts) {
    if (a.type !== 'use') continue;
    if (!me.hand.includes(a.card)) { illegal++; continue; }
    const chk = g.canUse(me, a.card, a.targets || []);
    if (!chk.ok) { illegal++; console.log('    非法候选:', a.label, chk.reason); }
  }
  ok(illegal === 0, `T1c 所有出牌候选都必须通过 canUse（非法 ${illegal} 个）`);
  ok(!acts.some(a => a.type === 'use' && a.card.name === 'tao'), 'T1d 满血时【桃】不应进候选');
  const shaActs = acts.filter(a => a.type === 'use' && a.card.name === 'sha');
  ok(shaActs.every(a => a.targets.every(t => t.role !== 'loyalist' || g.alive().filter(x => x !== me && x.role !== 'loyalist' && x.role !== 'lord').length === 0)),
    'T1e 有敌人可选时【杀】不应以忠臣为目标');
  ok(acts.some(a => a.type === 'equip' && a.card.name === 'qinggang'), 'T1f 手牌中的装备牌应产出装备候选');
  const d = describeState(g, me);
  ok(/回合/.test(d) && /手牌/.test(d) && /血/.test(d), 'T1g 状态描述应含回合/手牌/体力');
  ok(d.length < 1600, `T1h 状态描述不宜过长（实际 ${d.length} 字符）`);
}

// ---------------- 2. 决策解析容错 ----------------
{
  ok(parseDecision('{"i":2}', 5)?.index === 2, 'T2a 标准 JSON');
  ok(parseDecision('```json\n{"i":1,"why":"拆装备"}\n```', 5)?.index === 1, 'T2b 代码块围栏');
  ok(parseDecision('我选择 3。\n{"i":3}', 5)?.index === 3, 'T2c 前缀废话');
  ok(parseDecision('{"index":0}', 5)?.index === 0, 'T2d index 别名');
  ok(parseDecision('{"i":9}', 5) === null, 'T2e 越界必须拒绝');
  ok(parseDecision('{"i":-1}', 5) === null, 'T2f 负数必须拒绝');
  ok(parseDecision('选第 2 个', 5) === null, 'T2g 非 JSON 必须拒绝（不由正则猜）');
  ok(parseDecision('', 5) === null, 'T2h 空串必须拒绝');
  ok(parseDecision('{"i":"2"}', 5)?.index === 2, 'T2i 字符串数字可接受');
  ok(parseDecision('{"action":2}', 5)?.index === 2, 'T2j GLM 的 action 字段（实测中转站只会输出这个）');
  ok(parseDecision('{"action":1,"card":"无中生有","reason":"摸牌","x":"未闭合}', 5)?.index === 1,
    'T2k JSON 被截断时仍能从「字段:数字」取出编号');
  ok(parseDecision('{"action":1,"reason":"摸牌"}', 5)?.why === '摸牌', 'T2l GLM 的 reason 应映射到 why');
}

// ---------------- 3. 接口失败 / 超时必须回落启发式 ----------------
{
  const g = newGame();
  const me = g.players[0];
  me.hand = [mk('sha')];
  const savedKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  resetLLMStats();
  const brain = makeLLMBrain(0, { model: 'deepseek', level: 'low' });
  const got = await brain.askPlay(g, me);
  ok(legalAnswer(got, me), `T3a 无密钥时必须回落且给出合法动作（实际 ${JSON.stringify(got)?.slice(0, 80)}）`);
  ok(llmStats().fails >= 1, 'T3b 无密钥应计入 fails');
  if (savedKey) process.env.DEEPSEEK_API_KEY = savedKey;
}

// ---------------- 4. 端到端：mock fetch，选中的编号必须被执行 ----------------
{
  const g = newGame();
  const me = g.players[0];
  me.hand = [mk('sha'), mk('wuzhong'), mk('guohe')];
  const acts = enumerateActions(g, me, { rich: false });
  const wantIdx = acts.findIndex(a => a.type === 'use' && a.card.name === 'wuzhong');
  ok(wantIdx >= 0, 'T4a 前置：候选里应有【无中生有】');
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  let called = 0;
  globalThis.fetch = async (url, init) => {
    called++;
    const body = JSON.parse(init.body);
    ok(/候选动作/.test(body.messages[1].content), 'T4b 提示词必须包含候选动作列表');
    ok(body.messages[1].content.length < 4000, `T4c 提示词不应过长（实际 ${body.messages[1].content.length}）`);
    ok(!JSON.stringify(body).includes('test-key'), 'T4d 请求体里不能出现明文密钥（走 header）');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ i: wantIdx, why: '摸牌' }) } }] }) };
  };
  const brain = makeLLMBrain(0, { model: 'deepseek', level: 'low' });
  const ans = await brain.askPlay(g, me);
  ok(called === 1, `T4e 应只调用一次模型（实际 ${called}）`);
  ok(ans && ans.card && ans.card.name === 'wuzhong', `T4f 应执行模型选中的【无中生有】（实际 ${ans?.card?.name || JSON.stringify(ans)}）`);
  ok(Array.isArray(ans.targets) && ans.targets[0] === me, 'T4g 目标应为自己');

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"i":99}' } }] }) });
  resetLLMStats();
  const got = await makeLLMBrain(0, { level: 'low' }).askPlay(g, me);
  ok(legalAnswer(got, me), 'T4h 越界编号必须回落到合法动作');
  ok(llmStats().fails >= 1, 'T4h2 越界应计入 fails');

  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  resetLLMStats();
  const got2 = await makeLLMBrain(0, { level: 'low' }).askPlay(g, me);
  ok(legalAnswer(got2, me), 'T4i 接口 500 必须回落到合法动作');
  ok(llmStats().fails >= 1, 'T4i2 500 应计入 fails');

  // 超时：fetch 永挂起 → AbortController 必须生效并回落
  globalThis.fetch = (url, init) => new Promise((_res, rej) => {
    init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
  });
  const t0 = Date.now();
  resetLLMStats();
  const got3 = await makeLLMBrain(0, { level: 'low', timeoutMs: 120 }).askPlay(g, me);
  const used = Date.now() - t0;
  ok(used < 1500, `T4j 超时必须及时回落（耗时 ${used}ms）`);
  ok(legalAnswer(got3, me), 'T4k 超时必须回落到合法动作');
  ok(llmStats().timeouts >= 1, 'T4k2 超时应计入 timeouts');

  globalThis.fetch = savedFetch;
  if (savedKey) process.env.DEEPSEEK_API_KEY = savedKey; else delete process.env.DEEPSEEK_API_KEY;
}

// ---------------- 5. 强度差异 ----------------
{
  const g = newGame();
  const me = g.players[0];
  me.hand = [mk('sha'), mk('sha', 'heart', 9), mk('guohe')];
  const low = enumerateActions(g, me, { rich: false });
  const high = enumerateActions(g, me, { rich: true });
  ok(high.length >= low.length, `T5a 高强度候选数不应少于低强度（${high.length} vs ${low.length}）`);
  ok(low.every(a => a.type !== 'use' || (a.targets || []).length === 1), 'T5b 低强度每个动作只给单目标');
}

// ---------------- 6. 密钥状态自检 ----------------
{
  const st = llmStatus();
  ok(st.deepseek && st.glm, 'T6a llmStatus 应覆盖 deepseek 与 glm');
  ok(typeof st.deepseek.ready === 'boolean', 'T6b ready 必须是布尔');
  ok(!JSON.stringify(st).includes('sk-'), 'T6c 状态里绝不能出现密钥明文');
}

// ---------------- 7. 决策过程广播（玩家能看到 AI 在想什么、想了多久、选了啥） ----------------
{
  const g = newGame();
  const me = g.players[0];
  me.hand = [mk('sha'), mk('wuzhong')];
  const acts = enumerateActions(g, me, { rich: false });
  const wantIdx = acts.findIndex(a => a.type === 'use' && a.card.name === 'wuzhong');
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ i: wantIdx, why: '先摸两张' }) } }] }) });
  const evs = [];
  const brain = makeLLMBrain(0, { model: 'deepseek', level: 'low', onThink: (ev) => evs.push(ev) });
  await brain.askPlay(g, me);
  ok(evs.length >= 2 && evs[0].phase === 'start', 'T7a 决策开始应先广播 start');
  const done = evs.find(e => e.phase === 'done');
  ok(!!done, 'T7b 成功后应广播 done');
  ok(!!done && done.seat === 0 && typeof done.ms === 'number', 'T7c done 必须带座号与耗时');
  ok(!!done && /无中生有/.test(done.label || ''), 'T7d done 应带人类可读的动作名');
  ok(!!done && done.why === '先摸两张', 'T7e done 应带模型给出的理由');
  ok(!JSON.stringify(evs).includes('test-key') && !JSON.stringify(evs).includes('sk-'), 'T7f 广播事件里不能出现密钥');

  // onThink 自己抛错也不能影响对局
  const brain2 = makeLLMBrain(0, { level: 'low', onThink: () => { throw new Error('broadcast boom'); } });
  const ans2 = await brain2.askPlay(g, me);
  ok(legalAnswer(ans2, me), 'T7g onThink 抛错时决策仍须正常返回');

  globalThis.fetch = savedFetch;
  if (savedKey) process.env.DEEPSEEK_API_KEY = savedKey; else delete process.env.DEEPSEEK_API_KEY;
}

// ---------------- 8. 连续失败熔断（接口挂了不能每回合干等超时） ----------------
{
  const g = newGame();
  const me = g.players[0];
  me.hand = [mk('sha'), mk('wuzhong')];
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  let calls = 0;
  const evs = [];
  globalThis.fetch = async () => { calls++; return { ok: false, status: 503, json: async () => ({}) }; };
  const brain = makeLLMBrain(0, { level: 'low', onThink: (ev) => evs.push(ev) });
  let allLegal = true;
  for (let i = 0; i < 6; i++) {
    const a = await brain.askPlay(g, me);
    if (!legalAnswer(a, me)) allLegal = false;
  }
  ok(calls === 3, `T8a 连续失败 3 次后必须停止调用模型（实际 ${calls} 次）`);
  ok(brain.alive() === false, 'T8b 熔断后 alive() 必须为 false');
  ok(evs.filter(e => e.phase === 'dead').length === 1, 'T8c dead 只广播一次');
  ok(!!evs.find(e => e.phase === 'dead')?.count, 'T8d dead 事件应带失败次数');
  ok(allLegal, 'T8e 熔断前后每一步都必须返回合法动作');

  globalThis.fetch = savedFetch;
  if (savedKey) process.env.DEEPSEEK_API_KEY = savedKey; else delete process.env.DEEPSEEK_API_KEY;
}

// ---------------- 9. 全局限流（防止刷爆额度） ----------------
{
  const g = newGame();
  const me = g.players[0];
  me.hand = [mk('sha'), mk('wuzhong')];
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.DEEPSEEK_API_KEY;
  const savedRpm = process.env.LLM_RPM;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.LLM_RPM = '10';        // 下限即 10 次/分钟
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"i":0,"why":"t"}' } }] }) }; };
  const brain = makeLLMBrain(0, { model: 'deepseek', level: 'low' });
  let legal = true;
  for (let i = 0; i < 16; i++) {
    const a = await brain.askPlay(g, me);
    if (!legalAnswer(a, me)) legal = false;
  }
  ok(calls <= 10, `T9a 超过 LLM_RPM 后必须停止调用（实际 ${calls} 次）`);
  ok(llmStats().throttled >= 1, 'T9b 限流应计入 throttled');
  ok(legal, 'T9c 限流期间仍须返回合法动作');
  globalThis.fetch = savedFetch;
  if (savedKey) process.env.DEEPSEEK_API_KEY = savedKey; else delete process.env.DEEPSEEK_API_KEY;
  if (savedRpm) process.env.LLM_RPM = savedRpm; else delete process.env.LLM_RPM;
}

console.log(`\nLLMCHECK：通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败项：'); for (const b of bad) console.log('  -', b); }
process.exit(fail ? 1 : 0);
