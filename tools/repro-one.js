// 单局复现：node tools/repro-one.js <mode> <seats> <seed>
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const [modeId, seatCount, seedStr] = [process.argv[2] || 'doudizhu', Number(process.argv[3] || 3), Number(process.argv[4] || 900000)];
const seed = seedStr;
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
const result = await game.run();
console.log('武将：', seats.map(s => s.general.name).join(' / '));
console.log('结果：', result?.text, '回合：', game.turnCount);
console.log('--- 最后 40 条日志 ---');
for (const l of game.logs.slice(-40)) console.log(typeof l === 'string' ? l : l.text);
