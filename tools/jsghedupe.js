// 合包牌张守恒定位：node tools/jsghedupe.js <seed>
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS, generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const seed = Number(process.argv[2] || 9104);
const CASES = [['duel', 2], ['identity', 3], ['identity', 5], ['junzheng', 4], ['identity', 6]];
const i = seed - 9100;
const [modeId, seatCount] = CASES[i % CASES.length];
const POOL = GENERALS.filter((g) => g.pack === 'jsg_he').map((g) => g.id);
const FILLER = ['sunquan', 'caocao', 'liubei', 'guanyu', 'zhenji', 'zhouyu', 'huanggai', 'luxun', 'huatuo', 'lvbu'];
const rng = makeRng(seed);
const first = POOL[i % POOL.length];
const used = new Set([first]);
const seats = [{ id: 's0', name: 'P0', isAI: true, general: generalById(first) }];
for (let k = 1; k < seatCount; k++) {
  let id;
  if (k % 2 === 1) { const c = POOL.filter((x) => !used.has(x)); id = c.length ? c[rng.int(c.length)] : FILLER[rng.int(FILLER.length)]; }
  else id = FILLER[rng.int(FILLER.length)];
  used.add(id);
  seats.push({ id: `s${k}`, name: `P${k}`, isAI: true, general: generalById(id) });
}
const game = new Game({ seats, mode: getMode(modeId), seed, responder: makeAIResponder(0), deckEntries: deckEntries(getMode(modeId).deck || 'standard'), config: { timeout: 5000 } });
const aiMap = new Map();
const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };

function idSetFn(g) {
  const ids = new Set();
  g.deck.forEach(c => ids.add(c.id)); g.discardPile.forEach(c => ids.add(c.id));
  (g.table || []).forEach(c => ids.add(c.id)); (g.exilePile || []).forEach(c => ids.add(c.id));
  for (const p of g.players) {
    p.hand.forEach(c => ids.add(c.id)); Object.values(p.equips || {}).forEach(c => c && ids.add(c.id));
    (p.judgeZone || []).forEach(z => z?.card && ids.add(z.card.id));
    const walk = (v, d, k) => { if (k === 'lastDodgeCards' || !v || typeof v !== 'object' || d > 4) return; if (Array.isArray(v)) { v.forEach((x) => walk(x, d + 1)); return; } if (v.id != null && v.name) ids.add(v.id); for (const kk of Object.keys(v)) walk(v[kk], d + 1, kk); };
    walk(p.flags, 0); walk(p.marks, 0);
  }
  return ids;
}
const spots = new Map();
const add = (id, where) => { if (!spots.has(id)) spots.set(id, []); spots.get(id).push(where); };
const walkFlags = (v, d, where, key) => {
  if (key === 'lastDodgeCards') return;
  if (!v || typeof v !== 'object' || d > 4) return;
  if (Array.isArray(v)) { v.forEach((x) => walkFlags(x, d + 1, where)); return; }
  if (v.id != null && v.name) add(v.id, where);
  for (const k of Object.keys(v)) walkFlags(v[k], d + 1, where, k);
};
function survey() {
  spots.clear();
  game.deck.forEach((c) => add(c.id, 'deck'));
  game.discardPile.forEach((c) => add(c.id, 'discard'));
  (game.table || []).forEach((c) => add(c.id, 'table'));
  (game.exilePile || []).forEach((c) => add(c.id, 'exile'));
  for (const p of game.players) {
    p.hand.forEach((c) => add(c.id, `${p.name}.hand`));
    Object.values(p.equips || {}).forEach((c) => c && add(c.id, `${p.name}.equips`));
    (p.judgeZone || []).forEach((z) => z?.card && add(z.card.id, `${p.name}.judge`));
    walkFlags(p.flags, 0, `${p.name}.flags`);
    walkFlags(p.marks, 0, `${p.name}.marks`);
  }
  const dup = [...spots.entries()].filter(([, v]) => v.length > 1);
  return dup;
}

// 实时哨兵：任一牌同时存在于 deck 与某玩家 hand 时，打印触发日志
let recent = [];
const chk = () => {
  const deckIds = new Set(game.deck.map(c => c.id));
  for (const p of game.players) {
    for (const c of p.hand) {
      if (deckIds.has(c.id)) {
        console.log(`[SENTINEL] ${c.id}(${c.name}) 同时在 deck 与 ${p.name}.hand`);
        console.log('  最近日志：'); for (const l of recent.slice(-8)) console.log('   ', l);
        game.__hit = true; return;
      }
    }
  }
};
const origLog = game.log.bind(game);
game.log = async (t) => { await origLog(t); recent.push(t); chk(); };
const wrap = (name) => {
  const o = game[name].bind(game);
  game[name] = async (...a) => {
    const r = await o(...a);
    const deckIds = new Set(game.deck.map(c => c.id));
    const dIds = new Set(game.discardPile.map(x => x.id));
    const tIds = new Set((game.table || []).map(x => x.id));
    for (const p of game.players) for (const c of p.hand) {
      const w = [deckIds.has(c.id) ? 'deck' : '', dIds.has(c.id) ? 'discard' : '', tIds.has(c.id) ? 'table' : ''].filter(Boolean);
      if (w.length) console.log(`[HOOK ${name}] ${c.id}(${c.name}) hand∩${w.join('/')} @${p.name}`);
    }
    return r;
  };
};
['drawCards','discardCards','gainCards','useCard','pushDiscard','placeDelayed','flip'].forEach(wrap);
const total = () => {
  let n = game.deck.length + game.discardPile.length + (game.table || []).length + (game.exilePile || []).length;
  for (const p of game.players) {
    n += p.hand.length + Object.values(p.equips || {}).filter(Boolean).length + (p.judgeZone || []).length;
    const walk = (v, d, k) => { if (k === 'lastDodgeCards' || !v || typeof v !== 'object' || d > 4) return; if (Array.isArray(v)) { v.forEach((x) => walk(x, d + 1)); return; } if (v.id != null && v.name) n++; for (const kk of Object.keys(v)) walk(v[kk], d + 1, kk); };
    walk(p.flags, 0); walk(p.marks, 0);
  }
  return n;
};
const idSet = () => {
  const ids = new Set();
  game.deck.forEach(c => ids.add(c.id)); game.discardPile.forEach(c => ids.add(c.id));
  (game.table || []).forEach(c => ids.add(c.id)); (game.exilePile || []).forEach(c => ids.add(c.id));
  for (const p of game.players) {
    p.hand.forEach(c => ids.add(c.id)); Object.values(p.equips || {}).forEach(c => c && ids.add(c.id));
    (p.judgeZone || []).forEach(z => z?.card && ids.add(z.card.id));
    const walk = (v, d, k) => { if (k === 'lastDodgeCards' || !v || typeof v !== 'object' || d > 4) return; if (Array.isArray(v)) { v.forEach((x) => walk(x, d + 1)); return; } if (v.id != null && v.name) ids.add(v.id); for (const kk of Object.keys(v)) walk(v[kk], d + 1, kk); };
    walk(p.flags, 0); walk(p.marks, 0);
  }
  return ids;
};
let missRun = new Map();
const oTrig = game.trigger.bind(game);
game.trigger = async (ev, data) => {
  const r = await oTrig(ev, data);
  const cur = idSet();
  for (const id of beforeIds) {
    if (cur.has(id)) { missRun.delete(id); continue; }
    const n = (missRun.get(id) || 0) + 1;
    missRun.set(id, n);
    if (n === 6) {
      console.log(`[LOST] ${id} 连续6步缺失，最后事件 ${ev}（${data?.card?.id || data?.self?.name || data?.player?.name || ''}）`);
      console.log('   近12条：'); for (const l of recent.slice(-12)) console.log('     ', String(l).slice(0, 100));
    }
  }
  return r;
};
const oPop = game.popDeck.bind(game);
game.popDeck = (n = 1) => {
  const lenBefore = game.deck.length;
  const out = oPop(n);
  const still = out.filter((c) => game.deck.includes(c));
  if (still.length) console.log(`[POPDECK] 返回 ${out.length} 张，其中 ${still.length} 张仍在 deck（deck ${lenBefore}→${game.deck.length}）：${still.map(c=>c.id).join(',')}`);
  return out;
};
const beforeIds = [...idSetFn(game)];
console.log('座位:', seats.map(x=>x.name+'='+x.general.name+'('+x.general.id+')').join(' '));
await game.run();
const dup = survey();
console.log(`seed ${seed} ${modeId} ${seatCount}人 | 重复 ${dup.length} 处`);
for (const [id, v] of dup.slice(0, 12)) {
  const c = [...game.discardPile, ...game.deck, ...game.table].find((x) => x.id === id) || null;
  console.log(`  ${id} ${c ? c.name : ''} → ${v.join(' + ')}`);
}
const tail = game.logs.slice(-6).map((l) => (typeof l === 'string' ? l : l.text));
console.log('末6条：');
for (const t of tail) console.log('   ', t);
const seen = new Set();
game.deck.forEach(c=>seen.add(c.id)); game.discardPile.forEach(c=>seen.add(c.id));
(game.table||[]).forEach(c=>seen.add(c.id)); (game.exilePile||[]).forEach(c=>seen.add(c.id));
for (const p2 of game.players) { p2.hand.forEach(c=>seen.add(c.id)); Object.values(p2.equips||{}).forEach(c=>c&&seen.add(c.id)); (p2.judgeZone||[]).forEach(z=>z?.card&&seen.add(z.card.id)); }
const finalIds = idSetFn(game);
const lost = beforeIds.filter((id) => !finalIds.has(id));
console.log(`丢失 ${lost.length} 张: ${lost.join(',')}`);
const warns = game.logs.filter((l) => String(l).includes('⚠'));
console.log(`⚠ 异常 ${warns.length} 条`);
for (const w of warns.slice(0, 6)) console.log('   ', String(w).slice(0, 120));
