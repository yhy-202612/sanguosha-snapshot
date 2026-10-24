// 批量随机对局压力测试：node tools/simulate.js [局数]
// 用途：技能改动后回归，确保六模式全武将池下无异常、无死循环、胜负判定正常。
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const N = Number(process.argv[2] || 60);
const CASES = [
  ['identity', 3], ['identity', 4], ['identity', 5], ['identity', 6],
  ['junzheng', 4], ['junzheng', 5],
  ['duel', 2],
  ['doudizhu', 3],
  ['guozhan', 4], ['guozhan', 5],
  ['hulao', 3], ['hulao', 4],
];

async function playOne(modeId, seatCount, seed) {
  const rng = makeRng(seed);
  const pool = [...GENERALS];
  const used = new Set();
  const seats = [];
  for (let i = 0; i < seatCount; i++) {
    const cands = pool.filter(g => !used.has(g.id));
    const g = cands[rng.int(cands.length)];
    used.add(g.id);
    seats.push({ id: `s${i}`, name: `P${i}`, isAI: true, general: g });
  }
  const mode = getMode(modeId);
  const game = new Game({
    seats, mode, seed,
    responder: makeAIResponder(0),
    deckEntries: deckEntries(mode.deck),
    config: { timeout: 5000 },
  });
  const aiMap = new Map();
  const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
  game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
  game.onState = () => {};
  const t0 = Date.now();
  const result = await game.run();
  return { game, result, ms: Date.now() - t0 };
}

let ok = 0;
const errs = [];
const stat = {};
for (let i = 0; i < N; i++) {
  const [modeId, n] = CASES[i % CASES.length];
  const label = `${modeId}·${n}人`;
  try {
    const { game, result, ms } = await playOne(modeId, n, 900000 + i * 37);
    stat[label] = stat[label] || { n: 0, turns: 0, ms: 0 };
    stat[label].n++; stat[label].turns += game.turnCount; stat[label].ms += ms;
    if (!result || !result.text) errs.push(`${label}#${i} 无胜负结果`);
    else if (game.turnCount > 300) errs.push(`${label}#${i} 回合数异常 ${game.turnCount}`);
    else if (ms > 60000) errs.push(`${label}#${i} 耗时 ${ms}ms`);
    else ok++;
  } catch (e) {
    errs.push(`${label}#${i} 抛错 ${e.message}`);
  }
}

console.log(`\n对局 ${N} 局：成功 ${ok} / 异常 ${errs.length}`);
for (const [k, v] of Object.entries(stat)) {
  console.log(`  ${k}: ${v.n} 局 / 平均 ${(v.turns / v.n).toFixed(1)} 回合 / 平均 ${(v.ms / v.n).toFixed(0)}ms`);
}
if (errs.length) {
  console.log('\n异常明细：');
  for (const e of errs.slice(0, 15)) console.log('  -', e);
  process.exit(1);
}
