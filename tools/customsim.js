// 自定义武将（极·庞统 / 神黄盖 / 天工·诸葛亮）AI 压力测试
// 用途：这三位技能交互重（谋略值、护甲、工标记、天机/谋、额外回合），需确认 AI 打不卡死、无技能异常。
// 运行：node tools/customsim.js [局数]
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const N = Number(process.argv[2] || 24);
const POOL = ['custom_huanggai', 'custom_zhugeliang', 'custom_pangtong', 'sunquan', 'caocao', 'liubei', 'guanyu', 'zhenji'];
const CASES = [['duel', 2], ['identity', 3], ['identity', 4], ['junzheng', 4]];

let fail = 0, total = 0, maxMs = 0;
const problems = [];

for (let i = 0; i < N; i++) {
  const [modeId, seatCount] = CASES[i % CASES.length];
  const seed = 7001 + i;
  const rng = makeRng(seed);
  const used = new Set();
  const seats = [];
  // 第一位固定是自定义将，保证每局都能覆盖到
  const first = POOL[i % 3];
  used.add(first);
  seats.push({ id: 's0', name: 'P0', isAI: true, general: generalById(first) });
  for (let k = 1; k < seatCount; k++) {
    const cands = POOL.filter(id => !used.has(id));
    const id = cands[rng.int(cands.length)];
    used.add(id);
    seats.push({ id: `s${k}`, name: `P${k}`, isAI: true, general: generalById(id) });
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
  try {
    await game.run();
  } catch (e) {
    fail++;
    problems.push(`seed ${seed} ${modeId}: 抛异常 ${e.message}`);
    continue;
  }
  const ms = Date.now() - t0;
  maxMs = Math.max(maxMs, ms);
  total++;
  const warns = game.logs.map(l => String(l.text || l)).filter(t => t.includes('⚠'));
  if (warns.length) { fail++; problems.push(`seed ${seed} ${modeId}: ${warns.slice(0, 3).join(' | ')}`); }
  if (!game.over) { fail++; problems.push(`seed ${seed} ${modeId}: 对局未结束（可能死循环）`); }
  // 护甲不超上限、谋略值不越界
  for (const p of game.players) {
    if ((p.armor || 0) > (p.armorMax || 99)) { fail++; problems.push(`seed ${seed}: ${p.generalName} 护甲 ${p.armor} 超上限 ${p.armorMax}`); }
    if ((p.moulue || 0) > 5) { fail++; problems.push(`seed ${seed}: ${p.generalName} 谋略值 ${p.moulue} 超 5`); }
  }
}

console.log(`\n自定义将压力测试：完成 ${total}/${N} 局，最长 ${maxMs}ms，失败 ${fail}`);
if (problems.length) {
  console.log('问题：');
  [...new Set(problems)].slice(0, 20).forEach(p => console.log('  ✗', p));
  process.exit(1);
}
