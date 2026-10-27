// sg020guard 单局诊断：复现 seed，打印座位武将，并在首次出现「discard + 某人 hand」双存时输出该牌进入两处的调用栈
// 用法：node tools/sg020diag.js <seed> [cardId]
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
const seed = Number(process.argv[2] || 30);
const i = seed - 1;
const target = process.argv[3] || null;

const rng = makeRng(seed);
const pool = [...GENERALS];
const used = new Set();
const seats = [];
const [modeId, n] = CASES[i % CASES.length];
for (let k = 0; k < n; k++) {
  const cands = pool.filter(g => !used.has(g.id));
  const gd = cands[rng.int(cands.length)];
  used.add(gd.id);
  seats.push({ id: `s${k}`, name: `P${k}`, isAI: true, general: gd });
}
console.log('模式', modeId, n, '人 | 座位:', seats.map((s, k) => `P${k}=${s.general.name}(${s.general.id})`).join(' , '));

const mode = getMode(modeId);
const game = new Game({ seats, mode, seed, responder: makeAIResponder(0), deckEntries: deckEntries(mode.deck), config: { timeout: 5000 } });
const aiMap = new Map();
const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
game.onState = () => {};

const tid = (c) => c && (target ? String(c.id) === target : true);
const stacks = new Map();   // id -> [堆栈描述]
const note = (kind, c) => {
  if (!tid(c)) return;
  const st = new Error().stack.split('\n').slice(3, 7).map(x => x.trim().replace(/^at /, '')).join(' < ');
  const k = String(c.id);
  if (!stacks.has(k)) stacks.set(k, []);
  stacks.get(k).push(`${kind}: ${st}`);
};

const oPushD = game.pushDiscard.bind(game);
game.pushDiscard = (cards) => {
  const list = Array.isArray(cards) ? cards : [cards];
  if (target) for (const c of list) note('pushDiscard', c);
  return oPushD(cards);
};
for (const p of game.players) {
  for (const m of ['push', 'unshift']) {
    const orig = p.hand[m].bind(p.hand);
    p.hand[m] = (...a) => { if (target) for (const c of a) note(`P${p.seat}.hand.${m}`, c); return orig(...a); };
  }
}
const oGain = game.gainCards.bind(game);
game.gainCards = async (pl, cards, opts) => {
  if (target) for (const c of (cards || [])) note(`gain→P${pl.seat}(from=${opts && opts.from ? 'P' + opts.from.seat : 'null'})`, c);
  return oGain(pl, cards, opts);
};

// 每次 log 后检查：同一张牌是否同时在 discardPile 与某人 hand
let reported = 0;
const origLog = game.log.bind(game);
game.log = async (text, extra) => {
  await origLog(text, extra);
  const inDisc = new Set(game.discardPile.map(c => c && String(c.id)));
  for (const p of game.players) {
    for (const c of p.hand) {
      if (!c) continue;
      const id = String(c.id);
      if (inDisc.has(id)) {
        if (reported++ < 3) {
          console.log(`⚠ 第 ${game.turnCount} 回合(${game.phase}) ${cardLabel(c)} 同时在 discard 与 P${p.seat}(${p.general?.name}) 手牌`);
          console.log('   最近 12 条日志:');
          for (const l of game.logs.slice(-12)) console.log('     ', String(l.text || l).slice(0, 140));
          if (!target) {
            console.log('   （未指定 cardId，建议指定上面这张牌重跑以获取调用栈）');
          }
        }
      }
    }
  }
};

try { await game.run(); } catch (e) { console.log('运行结束/异常:', e.message); }
if (target && stacks.has(target)) {
  console.log(`\n=== ${target} 的区域迁移记录 ===`);
  for (const l of stacks.get(target).slice(-14)) console.log('  ' + l);
}
