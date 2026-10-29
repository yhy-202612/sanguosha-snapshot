// 「牌同时在弃牌堆与某人手牌」专项诊断（对应 tools/sgbaseline.js 检查 2 报出的 discard | pX.hand 双存）
// 用法：node tools/diag-dup.js <seed> [cardId]
//   与 sg020diag 的区别：sg020diag 只在「引擎 log 之后」比对，双存发生在两条日志之间时会漏检；
//   这里在**每回合末 + 每次派发后**比对，并记录该牌「进弃牌堆 / 进手牌」两条调用栈。
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';
import { cardLabel } from '../src/engine/cards.js';

const CASES = [
  ['identity', 3], ['identity', 4], ['identity', 5], ['identity', 6],
  ['junzheng', 4], ['junzheng', 5],
  ['duel', 2],
  ['doudizhu', 3],
  ['guozhan', 4], ['guozhan', 5],
  ['hulao', 3], ['hulao', 4],
];
const seed = Number(process.argv[2] || 6);
const only = process.argv[3] || null;
const i = seed - 1;
const [modeId, n] = CASES[i % CASES.length];

const rng = makeRng(seed);
const pool = [...GENERALS];
const used = new Set();
const seats = [];
for (let k = 0; k < n; k++) {
  const cands = pool.filter(g => !used.has(g.id));
  const gd = cands[rng.int(cands.length)];
  used.add(gd.id);
  seats.push({ id: `s${k}`, name: `P${k}`, isAI: true, general: gd });
}
console.log(`模式 ${modeId} ${n} 人 | ${seats.map((s, k) => `P${k}=${s.general.name}(${s.general.id})`).join(' , ')}`);

const game = new Game({
  seats, mode: getMode(modeId), seed,
  responder: makeAIResponder(0), deckEntries: deckEntries(getMode(modeId).deck),
  config: { timeout: 5000 },
});
const aiMap = new Map();
const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
game.onState = () => {};

// ---- 记录牌的流转（只关心栈，不干预逻辑）
const trail = new Map();   // cardId -> [{kind, turn, stack}]
const stackOf = (skip = 2) => new Error().stack.split('\n').slice(skip, skip + 3).map(s => s.trim().replace(/^at /, '')).join(' < ');
const log = (c, kind) => {
  if (!c || c.id == null) return;
  const k = String(c.id);
  if (!trail.has(k)) trail.set(k, []);
  trail.get(k).push({ kind, turn: game.turnCount, stack: stackOf(3) });
};

const oPushDiscard = game.pushDiscard.bind(game);
game.pushDiscard = (cards) => { for (const c of (Array.isArray(cards) ? cards : [cards])) log(c, '→discard'); return oPushDiscard(cards); };
const oGain = game.gainCards.bind(game);
game.gainCards = async (pl, cards, opts) => { for (const c of (cards || [])) log(c, `→gain:P${pl.seat}(from=${opts?.from ? 'P' + opts.from.seat : 'null'},reason=${opts?.reason || ''})`); return oGain(pl, cards, opts); };
const oDraw = game.drawCards.bind(game);
game.drawCards = async (pl, cnt, opts) => { const r = await oDraw(pl, cnt, opts); return r; };
for (const p of game.players) {
  for (const m of ['push', 'unshift', 'splice']) {
    const orig = p.hand[m].bind(p.hand);
    p.hand[m] = (...a) => { const r = orig(...a); if (m !== 'splice') for (const c of a) log(c, `P${p.seat}.hand.${m}`); return r; };
  }
}

// ---- 守恒检查
const found = new Map();
function scan(label) {
  const disc = new Map(game.discardPile.filter(Boolean).map(c => [String(c.id), c]));
  for (const p of game.players) {
    for (const c of p.hand) {
      if (!c) continue;
      const id = String(c.id);
      if (only && id !== only) continue;
      if (!disc.has(id)) continue;
      const key = `${id}:${p.seat}`;
      if (found.has(key)) continue;
      found.set(key, true);
      console.log(`\n⚠ [${label}] 第 ${game.turnCount} 回合/${game.phase} ${cardLabel(c)}（id=${id}）同时在 弃牌堆 与 P${p.seat}(${p.generalName || p.general?.name}) 手牌`);
      const t = trail.get(id) || [];
      console.log('   流转记录（最近 10 条）：');
      for (const r of t.slice(-10)) console.log(`     T${r.turn} ${r.kind}  @ ${r.stack}`);
      console.log('   最近 14 条日志：');
      for (const l of game.logs.slice(-14)) console.log('     ', String(l.text ?? l).slice(0, 130));
    }
  }
}

const oRunTurn = game.runTurn.bind(game);
game.runTurn = async (p) => { const r = await oRunTurn(p); scan(`回合末 P${p.seat}`); return r; };

// ★关键：sgbaseline 在运行时把 Math.random 换成按 seed 派生的确定性序列（技能内部有十余处 Math.random），
//   不换的话同一 seed 的走向不同、复现不出它报的双存。
const origRandom = Math.random;
const rnd = makeRng((seed ^ 0x9e3779b9) >>> 0);
Math.random = () => rnd.next();
try { await game.run(); } finally { Math.random = origRandom; }
scan('局终');
console.log(`\n共发现 ${found.size} 处「弃牌堆 + 手牌」双存（seed=${seed} ${modeId}·${n}人）`);
console.log(`回合数 ${game.turnCount} / 日志 ${game.logs.length} / 弃牌堆 ${game.discardPile.length} / 牌堆 ${game.deck.length}`);
process.exit(found.size ? 1 : 0);
