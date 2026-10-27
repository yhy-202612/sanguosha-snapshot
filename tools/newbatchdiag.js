// 诊断：newbatchcheck 的 seed 9129（i=29, identity 6人, 首将 clan3_xunyou）牌张重复 c63
// 用法：node tools/newbatchdiag.js [i] [cardId]
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { cardLabel } from '../src/engine/cards.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const POOL = JSON.parse(process.env.POOL || '[]');
const FILLER = ['sunquan', 'caocao', 'liubei', 'guanyu', 'zhenji', 'zhouyu', 'huanggai', 'luxun', 'huatuo', 'lvbu'];
const CASES = [['duel', 2], ['identity', 3], ['identity', 5], ['junzheng', 4], ['identity', 6]];
const i = Number(process.argv[2] || 29);
const target = process.argv[3] || 'c63';

const [modeId, seatCount] = CASES[i % CASES.length];
const seed = 9100 + i;
const rng = makeRng(seed);
const first = POOL[i % POOL.length];
const used = new Set([first]);
const seats = [{ id: 's0', name: 'P0', isAI: true, general: generalById(first) }];
for (let k = 1; k < seatCount; k++) {
  let id;
  if (k % 2 === 1) {
    const cands = POOL.filter(x => !used.has(x));
    id = cands.length ? cands[rng.int(cands.length)] : FILLER[rng.int(FILLER.length)];
  } else id = FILLER[rng.int(FILLER.length)];
  used.add(id);
  seats.push({ id: `s${k}`, name: `P${k}`, isAI: true, general: generalById(id) });
}
const mode = getMode(modeId);
const game = new Game({ seats, mode, seed, responder: makeAIResponder(0), deckEntries: deckEntries(mode.deck || 'standard'), config: { timeout: 5000 } });
const aiMap = new Map();
const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
game.onState = () => {};

console.log('首将', first, '模式', modeId, seatCount, 'seed', seed);
// deck 的 push/unshift 追踪（重洗会替换 deck 引用，故每回合重挂）
let hookedDeck = null;
const hookDeck = () => {
  if (game.deck === hookedDeck) return;
  hookedDeck = game.deck;
  for (const m of ['push', 'unshift']) {
    const orig = game.deck[m].bind(game.deck);
    game.deck[m] = (...a) => { for (const c of a) if (TRACE && tid(c)) console.log(`  >> deck.${m}`, cardLabel(c), '\n     ', new Error().stack.split('\n').slice(2, 7).map(x => x.trim()).join(' | ')); return orig(...a); };
  }
};
hookDeck();

// pushDiscard / gainCards 追踪
const oPush = game.pushDiscard.bind(game);
game.pushDiscard = (cards) => { const list = Array.isArray(cards) ? cards : [cards]; for (const c of list) if (TRACE && tid(c)) console.log('  >> pushDiscard', cardLabel(c), '\n     ', new Error().stack.split('\n').slice(2, 6).map(x => x.trim()).join(' | ')); return oPush(cards); };
const oGain = game.gainCards.bind(game);
game.gainCards = async (pl, cards, opts) => { for (const c of (cards || [])) if (TRACE && tid(c)) console.log('  >> gainCards →P' + pl.seat, cardLabel(c), 'from=' + (opts && opts.from ? 'P' + opts.from.seat : 'null'), '\n     ', new Error().stack.split('\n').slice(2, 7).map(x => x.trim()).join(' | ')); return oGain(pl, cards, opts); };

// 追踪 target 牌进入各区域的所有路径（打印调用栈）
const TRACE = process.env.TRACE === '1';
const tid = (c) => c && String(c.id) === target;
for (const p of game.players) {
  for (const m of ['push', 'unshift']) {
    const orig = p.hand[m].bind(p.hand);
    p.hand[m] = (...a) => { for (const c of a) if (TRACE && tid(c)) console.log(`  >> P${p.seat}.hand.${m}`, cardLabel(c), '\n     ', new Error().stack.split('\n').slice(2, 6).map(x => x.trim()).join(' | ')); return orig(...a); };
  }
}
for (const m of ['push', 'unshift']) {
  const orig = game.discardPile[m].bind(game.discardPile);
  game.discardPile[m] = (...a) => { for (const c of a) if (TRACE && tid(c)) console.log(`  >> discard.${m}`, cardLabel(c), '\n     ', new Error().stack.split('\n').slice(2, 6).map(x => x.trim()).join(' | ')); return orig(...a); };
}


// 逐回合扫描：钩到 game.log 上，检测每回合结束后 target 是否出现在两个标准区域
const zones = () => {
  const z = new Map();
  const add = (name, c) => { if (c && String(c.id) === target) z.set(name, (z.get(name) || 0) + 1); };
  game.deck.forEach(c => add('deck', c));
  game.discardPile.forEach(c => add('discard', c));
  (game.table || []).forEach(c => add('table', c));
  for (const p of game.players) {
    p.hand.forEach(c => add(`hand:p${p.seat}`, c));
    Object.entries(p.equips || {}).forEach(([k, c]) => add(`equip:${k}@p${p.seat}`, c));
    (p.judgeZone || []).forEach(z => add(`judge@p${p.seat}`, z.card));
  }
  const flags = [];
  for (const p of game.players) {
    const walk = (v, path) => {
      if (!v) return;
      if (Array.isArray(v)) { v.forEach((x, k2) => walk(x, `${path}[${k2}]`)); return; }
      if (typeof v === 'object') {
        if (v.id != null && String(v.id) === target) { flags.push(path); return; }
        for (const [k2, x] of Object.entries(v)) walk(x, `${path}.${k2}`);
      }
    };
    walk(p.flags, `p${p.seat}.flags`);
    walk(p.marks, `p${p.seat}.marks`);
  }
  return { z, flags };
};

let lastCheck = 0;
const origLog = game.log.bind(game);
game.log = async (text) => {
  await origLog(text);
  hookDeck();
  const { z } = zones();
  const total = [...z.values()].reduce((a, b) => a + b, 0);
  if (total > 1) {
    const find = (arr) => arr.find(c => c && String(c.id) === target);
    const inDeck = find(game.deck), inHand = game.players.map(p => find(p.hand)).find(Boolean);
    const fmt = (c) => c ? `${c.id}/${c.name}/${c.suit}${c.num}` : 'null';
    console.log('deck:', fmt(inDeck), '| hand:', fmt(inHand), '| sameObject:', inDeck === inHand);
    console.log('deck 含该id份数:', game.deck.filter(c => c && String(c.id) === target).length,
      '| discard 份数:', game.discardPile.filter(c => c && String(c.id) === target).length,
      '| 各人hand份数:', game.players.map(p => p.seat + ':' + p.hand.filter(c => c && String(c.id) === target).length).join(','));
    console.log('deck.length', game.deck.length, 'discard.length', game.discardPile.length);
    console.log(`⚠ 首次双存（第 ${game.turnCount} 回合，阶段 ${game.phase}）:`, [...z.entries()].map(([k, v]) => `${k}×${v}`).join(' , '));
    console.log('最近 14 条日志:');
    for (const l of game.logs.slice(-14)) console.log('   ', String(l.text || l).slice(0, 150));
    throw new Error('STOP_DUP');
  }
};

try { await game.run(); } catch (e) { if (e.message !== 'STOP_DUP') throw e; }
const { z, flags } = zones();
console.log('\n局终:', [...z.entries()].map(([k, v]) => `${k}×${v}`).join(' , ') || '（不在标准区域）');
console.log('flags/marks 引用:', flags.length ? flags.join(' , ') : '无');
console.log('\n最近 40 条日志:');
for (const l of game.logs.slice(-40)) console.log(' ', String(l.text || l).slice(0, 160));
