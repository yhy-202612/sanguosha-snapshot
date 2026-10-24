import '../src/skills/index.js';
import { Game, CARD_META } from '../src/engine/index.js';
import { allSkills, skillIds, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById } from '../src/data/generals.js';
import { DECKS, deckEntries } from '../src/data/deck.js';
import { MODES, getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) {
  if (cond) pass++; else { fail++; bad.push(msg); }
}

// ---------- 1. 数据完整性 ----------
const std = deckEntries('standard');
const ex = deckEntries('ex');
ok(std.length === 108, `标准包应为 108 张，实际 ${std.length}`);
ok(ex.length === 160, `标准+军争应为 160 张，实际 ${ex.length}`);
ok(std.every(c => CARD_META[c.name]), '标准包存在未知牌名');
ok(ex.every(c => CARD_META[c.name]), '军争包存在未知牌名');
const shaCount = std.filter(c => c.name === 'sha').length;
ok(shaCount >= 25 && shaCount <= 35, `杀数量异常：${shaCount}`);

// 武将
const packs = ['standard', 'jie', 'mou', 'shen', 'ji'];
for (const p of packs) {
  const n = GENERALS.filter(g => g.pack === p).length;
  ok(n > 0, `${p} 包为空`);
}
ok(GENERALS.length >= 70, `武将总数偏少：${GENERALS.length}`);
const missSkill = [];
for (const g of GENERALS) for (const s of g.skills) if (!hasSkill(s)) missSkill.push(`${g.name}:${s}`);
ok(missSkill.length === 0, `未实现技能：${missSkill.slice(0, 8).join(', ')}${missSkill.length > 8 ? '…' : ''}`);

// ---------- 2. 引擎对局冒烟 ----------
async function playOne(modeId, seatCount, seed, pack) {
  const rng = makeRng(seed);
  const pool = GENERALS.filter(g => pack === 'all' ? true : ['standard', pack].includes(g.pack));
  const seats = [];
  const used = new Set();
  for (let i = 0; i < seatCount; i++) {
    const cands = pool.filter(g => !used.has(g.id));
    const g = cands[rng.int(cands.length)];
    used.add(g.id);
    seats.push({ id: `s${i}`, name: `P${i}`, isAI: true, general: g });
  }
  const game = new Game({
    seats, mode: getMode(modeId), seed,
    responder: makeAIResponder(0), // 占位，下面按座位替换
    deckEntries: deckEntries(getMode(modeId).deck),
    config: { timeout: 5000 },
  });
  // 每个座位独立的 AI responder
  const aiMap = new Map();
  game.responder = {
    askPlay: (g, p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat).askPlay(g, p); },
    ask: (g, p, req) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat).ask(g, p, req); },
  };
  game.onState = () => {};
  const t0 = Date.now();
  const result = await game.run();
  return { game, result, ms: Date.now() - t0 };
}

const cases = [
  ['identity', 3, 'standard', 'identity·3人'],
  ['identity', 5, 'standard', 'identity·5人'],
  ['junzheng', 4, 'standard', 'identity·军争4人'],
  ['duel', 2, 'standard', '1v1'],
  ['doudizhu', 3, 'standard', '斗地主'],
  ['guozhan', 4, 'standard', '国战'],
  ['hulao', 3, 'standard', '虎牢关'],
];

for (const [modeId, n, pack, label] of cases) {
  try {
    const { game, result, ms } = await playOne(modeId, n, 20261024 + n, pack);
    ok(!!result, `${label}：无结果`);
    ok(game.turnCount > 0, `${label}：未进行任何回合`);
    ok(ms < 60000, `${label}：耗时过长 ${ms}ms`);
    console.log(`  ✓ ${label}：${game.turnCount} 回合 / ${ms}ms / ${result.text || ''}`);
  } catch (e) {
    fail++; bad.push(`${label} 抛错：${e.message}`);
    console.error(`  ✗ ${label}:`, e.stack?.split('\n').slice(0, 4).join('\n'));
  }
}

// ---------- 3. 快照与手牌可见性 ----------
try {
  const rng = makeRng(7);
  const seats = [0, 1, 2].map(i => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: GENERAL_OF(i) }));
  function GENERAL_OF(i) { return generalById(['caocao', 'liubei', 'sunquan'][i]); }
  const game = new Game({ seats, mode: getMode('identity'), seed: 7, responder: makeAIResponder(0), deckEntries: deckEntries('standard') });
  const snap0 = game.snapshot(0);
  ok(snap0.players[0].hand?.length === 4, '本人手牌未下发');
  ok(snap0.players[1].hand === undefined, '他人手牌泄漏');
  ok(snap0.players[0].role === 'lord', '主公身份未公开');
  ok(snap0.players[1].role === null, '非本人身份泄漏');
} catch (e) {
  fail++; bad.push('快照检查抛错：' + e.message);
}

// ---------- 输出 ----------
console.log(`\n通过 ${pass} / 失败 ${fail}`);
if (bad.length) {
  console.log('失败项：');
  for (const b of bad) console.log('  -', b);
  process.exit(1);
}
