// 双存诊断：定位牌在哪些区域重复。用法：node tools/jsgdiag.js <seed> [mode] [seats]
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS, generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const seed = Number(process.argv[2] || 9110);
const modeId = process.argv[3] || 'duel';
const seatCount = Number(process.argv[4] || 2);
const POOL = GENERALS.filter(g => g.pack === 'jsg_qi').map(g => g.id);
const FILLER = ['sunquan', 'caocao', 'liubei', 'guanyu', 'zhenji', 'zhouyu', 'huanggai', 'luxun', 'huatuo', 'lvbu'];

const rng = makeRng(seed);
const first = POOL[(seed - 9100) % POOL.length];
const seats = [{ id: 's0', name: 'P0', isAI: true, general: generalById(first) }];
const used = new Set([first]);
for (let k = 1; k < seatCount; k++) {
  let id;
  if (k % 2 === 1) {
    const cands = POOL.filter((x) => !used.has(x));
    id = cands.length ? cands[rng.int(cands.length)] : FILLER[rng.int(FILLER.length)];
  } else {
    id = FILLER[rng.int(FILLER.length)];
  }
  used.add(id);
  seats.push({ id: `s${k}`, name: `P${k}`, isAI: true, general: generalById(id) });
}
const mode = getMode(modeId);
const game = new Game({
  seats, mode, seed,
  responder: makeAIResponder(0),
  deckEntries: deckEntries(mode.deck || 'standard'),
  config: { timeout: 5000 },
});
const aiMap = new Map();
const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
game.onState = () => {};


// ---- 双存钩子：任一手牌区出现重复 id 立即定位 ----
let hitOnce = false;
const checkHand = (g, tag) => {
  if (hitOnce) return;
  for (const p of g.players) {
    const seen = new Set();
    for (const c of p.hand) {
      if (seen.has(c.id)) {
        hitOnce = true;
        console.log(`!! ${tag} -> p${p.seat}.hand 重复 ${c.id} ${c.name}`);
        console.log('   近 8 条日志: ' + g.logs.slice(-8).map(l => String(l.text || l).slice(0, 70)).join(' / '));
        return;
      }
      seen.add(c.id);
    }
  }
};
const og = game.gainCards.bind(game);
game.gainCards = async (pl, cards, o) => {
  const r = await og(pl, cards, o);
  checkHand(game, `gain [${(cards || []).map(c => c?.name).join(',')}] from=${o?.from?.name || '-'} reason=${o?.reason}`);
  return r;
};
const od = game.discardCards.bind(game);
game.discardCards = async (pl, cards, o) => {
  const r = await od(pl, cards, o);
  checkHand(game, `discard [${(cards || []).map(c => c?.name).join(',')}] reason=${o?.reason}`);
  return r;
};

function locate(g) {
  const map = new Map();
  const put = (c, where) => {
    if (!c || c.id == null) return;
    if (!map.has(c.id)) map.set(c.id, { name: c.name, where: [] });
    map.get(c.id).where.push(where);
  };
  g.deck.forEach(c => put(c, 'deck'));
  g.discardPile.forEach(c => put(c, 'discard'));
  (g.table || []).forEach(c => put(c, 'table'));
  (g.exilePile || []).forEach(c => put(c, 'exile'));
  for (const p of g.players) {
    p.hand.forEach(c => put(c, `p${p.seat}.hand`));
    Object.entries(p.equips || {}).forEach(([k, v]) => put(v, `p${p.seat}.equip.${k}`));
    (p.judgeZone || []).forEach(z => put(z.card, `p${p.seat}.judge`));
    const walk = (v, path, d) => {
      if (!v || typeof v !== 'object' || d > 3) return;
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, d + 1)); return; }
      if (v.id != null && v.name) put(v, path);
      for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, d + 1);
    };
    walk(p.flags, `p${p.seat}.flags`, 0);
    walk(p.marks, `p${p.seat}.marks`, 0);
  }
  return map;
}

await game.run();
const map = locate(game);
let dup = 0;
for (const [id, info] of map) {
  if (info.where.length > 1) {
    dup++;
    console.log(`重复 ${id} ${info.name}: ${info.where.join(' | ')}`);
  }
}
console.log(`--- seed ${seed} ${modeId} ${seatCount}p | 重复 ${dup} 处 | 将: ${seats.map(s => s.general.name).join('/')}`);
const warns = game.logs.map(l => String(l.text || l)).filter(t => t.includes('⚠'));
if (warns.length) console.log('⚠日志:', warns.slice(0, 5));
const recent = game.logs.slice(-25).map(l => String(l.text || l).slice(0, 100));
console.log('--- 末段日志 ---\n' + recent.join('\n'));
