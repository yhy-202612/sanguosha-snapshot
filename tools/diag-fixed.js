// 固定武将组合重跑（用于判定某个门禁失败是否与新包无关）
// 用法：node tools/diag-fixed.js identity <seed> <generalId1> <generalId2> ...
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';

const [modeId, seedStr, ...ids] = process.argv.slice(2);
const seed = Number(seedStr);
const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
const mode = getMode(modeId);
const game = new Game({ seats, mode, seed, responder: makeAIResponder(0), deckEntries: deckEntries(mode.deck), config: { timeout: 5000 } });
const aiMap = new Map();
const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
game.onState = () => {};

const STD = () => {
  const out = [];
  game.deck.forEach(c => out.push(c.id));
  game.discardPile.forEach(c => out.push(c.id));
  (game.table || []).forEach(c => out.push(c.id));
  for (const p of game.players) {
    p.hand.forEach(c => out.push(c.id));
    Object.values(p.equips || {}).forEach(c => c && out.push(c.id));
    (p.judgeZone || []).forEach(z => z.card && out.push(z.card.id));
  }
  return out;
};
const initial = new Set(STD());
const origRunTurn = game.runTurn.bind(game);
let n = 0;
game.runTurn = async (p) => {
  await origRunTurn(p);
  n++;
  const ids2 = STD();
  const set = new Set(ids2);
  if (ids2.length !== set.size) {
    const dup = [...new Set(ids2.filter((id, i) => ids2.indexOf(id) !== i))];
    // 定位重复牌所在的区域
    const where = (cid) => {
      const out = [];
      if (game.deck.some(c => c.id === cid)) out.push('deck');
      if (game.discardPile.some(c => c.id === cid)) out.push('discard');
      (game.table || []).forEach((c, i) => c?.id === cid && out.push(`table[${i}]`));
      for (const q of game.players) {
        if (q.hand.some(c => c.id === cid)) out.push(`p${q.seat}.hand`);
        Object.entries(q.equips || {}).forEach(([k, c]) => c?.id === cid && out.push(`p${q.seat}.equips.${k}`));
        (q.judgeZone || []).forEach((z, i) => z.card?.id === cid && out.push(`p${q.seat}.judge[${i}]`));
      }
      return out.join(' | ');
    };
    console.log(`⚠ 第 ${n} 回合（${p.name} ${p.generalName}）后 重复 id：${dup.map(id => `${id} → ${where(id)}`).join(' ; ')}`);
    console.log('最近日志：'); game.logs.slice(-12).map(l => String(l.text || l)).forEach(t => console.log('   ', t));
    process.exit(0);
  }
  const lost = [...initial].filter(id => !set.has(id));
  if (lost.length) {
    console.log(`⚠ 第 ${n} 回合（${p.name} ${p.generalName}）后 丢牌：${lost.join(',')}`);
    console.log('最近日志：'); game.logs.slice(-12).map(l => String(l.text || l)).forEach(t => console.log('   ', t));
    process.exit(0);
  }
};
await game.run();
console.log(`无异常（${n} 回合，武将：${seats.map(s => s.general.name).join('/')}）`);
