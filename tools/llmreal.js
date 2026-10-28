// 真实 API 联调：node tools/llmreal.js
// 需要环境变量 DEEPSEEK_API_KEY / GLM_API_KEY。做两件事：
//   ① 单次决策延迟与正确性（两个 provider 各一次）
//   ② 完整跑一局 2 人局（座 0 用 LLM，座 1 用启发式），检查无异常、无 ⚠ 技能异常、牌张守恒
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeLLMBrain, enumerateActions, describeState, llmStats, resetLLMStats, llmStatus } from '../src/ai/llm.js';

const st = llmStatus();
console.log('密钥状态：', Object.entries(st).map(([k, v]) => `${k}(${v.model})=${v.ready ? 'ready' : 'MISSING'}`).join('  '));

function newGame(seed = 4242, seats = 2) {
  const gens = ['sunquan', 'caocao', 'liubei'];
  const s = [];
  for (let i = 0; i < seats; i++) s.push({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(gens[i]) });
  const mode = getMode('duel');
  const game = new Game({ seats: s, mode, seed, responder: makeAIResponder(0), deckEntries: deckEntries('standard'), config: { timeout: 5000 } });
  const aiMap = new Map();
  const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
  game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
  game.onState = () => {};
  return game;
}

// ---- ① 单次决策 ----
for (const [id, info] of Object.entries(st)) {
  if (!info.ready) { console.log(`\n[${id}] 跳过（无密钥）`); continue; }
  const g = newGame(4242, 2);
  const me = g.players[0];
  me.hand = [];
  const acts = enumerateActions(g, me, { rich: true });
  console.log(`\n[${id}] 候选 ${acts.length} 个：`, acts.map(a => a.label).slice(0, 6).join(' / '));
  resetLLMStats();
  const brain = makeLLMBrain(0, { model: id, level: 'high', timeoutMs: 20000 });
  const t0 = Date.now();
  const ans = await brain.askPlay(g, g.players[0]);   // 必须是同一个 game 的 player，否则 state 描述与实际局面错位
  const ms = Date.now() - t0;
  const s = llmStats();
  console.log(`[${id}] 耗时 ${ms}ms  calls=${s.calls} fails=${s.fails} timeouts=${s.timeouts} why="${s.lastWhy}"`);
  console.log(`[${id}] 决策：`, JSON.stringify(ans)?.slice(0, 160));
}

// ---- ② 完整一局（座 0 = LLM deepseek） ----
if (st.deepseek.ready) {
  console.log('\n=== 完整对局（座 0 用 DeepSeek LLM，座 1 用启发式） ===');
  const g = newGame(777, 2);
  const brain = makeLLMBrain(0, { model: 'deepseek', level: 'high', timeoutMs: 12000 });
  const base = g.responder;
  g.responder = {
    askPlay: (gg, p) => (p.seat === 0 ? brain.askPlay(gg, p) : base.askPlay(gg, p)),
    ask: (gg, p, req) => (p.seat === 0 ? brain.ask(gg, p, req) : base.ask(gg, p, req)),
  };
  resetLLMStats();
  const t0 = Date.now();
  let err = null;
  try { await g.run(); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  const s = llmStats();
  const warns = g.logs.map(l => String(l.text || l)).filter(t => t.includes('⚠'));
  // 牌张守恒
  const ids = [];
  const push = c => { if (c && c.id != null) ids.push(c.id); };
  g.deck.forEach(push); g.discardPile.forEach(push); (g.table || []).forEach(push);
  for (const p of g.players) { p.hand.forEach(push); Object.values(p.equips || {}).forEach(push); (p.judgeZone || []).forEach(z => push(z.card)); }
  const dup = ids.length - new Set(ids).size;
  const turnCount = g.turnCount || 0;
  console.log(`结果：over=${!!g.over} 回合=${turnCount} 耗时=${(ms / 1000).toFixed(1)}s`);
  console.log(`LLM：calls=${s.calls} fails=${s.fails} timeouts=${s.timeouts} 成功率=${s.calls ? Math.round((1 - (s.fails + s.timeouts) / s.calls) * 100) : 0}%`);
  console.log(`牌张：${ids.length} 张，重复 ${dup}`);
  console.log(`⚠ 技能异常：${warns.length}`);
  const problems = [];
  if (err) problems.push(`抛异常：${err.message}`);
  if (!g.over) problems.push('未正常结束');
  if (warns.length) problems.push(`技能异常 ${warns.length}：${warns[0]}`);
  if (dup) problems.push(`牌张重复 ${dup}`);
  if (turnCount < 2) problems.push(`几乎没跑起来（回合 ${turnCount}）`);
  if (s.calls === 0) problems.push('LLM 一次都没被调用（可能候选过少短路）');
  if (problems.length) { console.log('\n❌ 失败：\n- ' + problems.join('\n- ')); process.exit(1); }
  console.log('\n✅ 真实联调通过');
} else {
  console.log('\n（无 DEEPSEEK_API_KEY，跳过完整对局）');
}
