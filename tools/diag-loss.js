// 丢牌定位：复刻 starsim 的座位构造，逐回合检查牌张守恒，定位第一处丢牌
// 运行：node tools/diag-loss.js <seed> [seatCount] [mode]
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS, generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

// 用法一：node tools/diag-loss.js <index>            （复刻 starsim，seed = 9100 + index）
// 用法二：node tools/diag-loss.js --sg <seed> <mode> <seats>   （复刻 sg020guard 的随机选将）
const SG = process.argv[2] === '--sg';
const idx = SG ? 0 : Number(process.argv[2] || 5);
const CASES = [['duel', 2], ['identity', 3], ['identity', 5], ['junzheng', 4]];
const seed = SG ? Number(process.argv[3]) : 9100 + idx;
const [modeId, seatCount] = SG
  ? [process.argv[4] || 'identity', Number(process.argv[5] || 4)]
  : CASES[idx % CASES.length];

const POOL = GENERALS.filter(g => ['star', 'myth'].includes(g.pack)).map(g => g.id);
const FILLER = ['sunquan', 'caocao', 'liubei', 'guanyu', 'zhenji', 'zhouyu', 'huanggai', 'luxun', 'huatuo', 'lvbu'];
const rng = makeRng(seed);
let seats;
if (SG) {
  // 与 sg020guard.makeSeats 完全一致：从全量武将里按 rng 依次抽取不重复的武将
  const pool = [...GENERALS];
  const used = new Set();
  seats = [];
  for (let i = 0; i < seatCount; i++) {
    const cands = pool.filter(g => !used.has(g.id));
    const gd = cands[rng.int(cands.length)];
    used.add(gd.id);
    seats.push({ id: `s${i}`, name: `P${i}`, isAI: true, general: gd });
  }
} else {
  const first = POOL[idx % POOL.length];
  const used = new Set([first]);
  seats = [{ id: 's0', name: 'P0', isAI: true, general: generalById(first) }];
  for (let k = 1; k < seatCount; k++) {
    let id;
    if (k % 2 === 1) {
      const cands = POOL.filter(x => !used.has(x));
      id = cands.length ? cands[rng.int(cands.length)] : FILLER[rng.int(FILLER.length)];
    } else id = FILLER[rng.int(FILLER.length)];
    used.add(id);
    seats.push({ id: `s${k}`, name: `P${k}`, isAI: true, general: generalById(id) });
  }
}
const mode = getMode(modeId);
const game = new Game({ seats, mode, seed, responder: makeAIResponder(0), deckEntries: deckEntries(mode.deck || 'standard'), config: { timeout: 5000 } });
const aiMap = new Map();
const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
game.onState = () => {};

// 与 sg020guard 同口径：只有「标准区域」参与重复判定；exile / marks / flags 等别名牌位只算存在
const STD = (g) => {
  const out = [];
  g.deck.forEach(c => out.push(c.id));
  g.discardPile.forEach(c => out.push(c.id));
  (g.table || []).forEach(c => out.push(c.id));
  for (const p of g.players) {
    p.hand.forEach(c => out.push(c.id));
    Object.values(p.equips || {}).forEach(c => c && out.push(c.id));
    (p.judgeZone || []).forEach(z => z.card && out.push(z.card.id));
  }
  return out;
};
const allIds = () => {
  const out = STD(game);
  (game.exilePile || []).forEach(c => out.push(c.id));
  for (const p of game.players) {
    const walk = (v, d) => {
      if (!v || typeof v !== 'object' || d > 4) return;
      if (Array.isArray(v)) { v.forEach(x => walk(x, d + 1)); return; }
      if (v.id != null && v.name) out.push(v.id);
      for (const k of Object.keys(v)) walk(v[k], d + 1);
    };
    walk(p.flags, 0);
    walk(p.marks, 0);
  }
  return out;
};
const initial = new Set(allIds());
console.log('武将：', seats.map(s => s.general.name).join(' / '), '初始牌数', initial.size);

// 细粒度钩子：每次牌移动后立刻检查重复/丢失，发现即打印调用栈（定位到具体技能）
function checkNow(tag) {
  const ids = allIds();
  const std = STD(game);
  const set = new Set(ids);
  const stdSet = new Set(std);
  const lost = [...initial].filter(id => !set.has(id));
  const dupIds = std.filter((id, i) => std.indexOf(id) !== i);
  if (lost.length || dupIds.length) {
    console.log(`\n⚠ [${tag}] 丢牌 ${lost.join(',') || '无'} / 重复 ${[...new Set(dupIds)].join(',') || '无'}`);
    const last = game.logs.slice(-14).map(l => String(l.text || l));
    console.log('最近日志：'); last.forEach(t => console.log('   ', t));
    console.log('调用栈：');
    console.log(new Error().stack.split('\n').slice(2, 9).join('\n'));
    process.exit(0);
  }
}
// 说明：处理区中间态（如【五谷丰登】的 pool）会让细粒度检查误报，故只在回合末统一检查
if (process.env.DIAG_FINE === '1') {
  for (const fn of ['discardCards', 'gainCards', 'pushDiscard', 'exileCards', 'takeCard', 'useCard', 'damage']) {
    const orig = game[fn].bind(game);
    game[fn] = async (...args) => { const r = await orig(...args); checkNow(fn); return r; };
  }
}

const origRunTurn = game.runTurn.bind(game);
let checked = 0;
game.runTurn = async (p) => {
  await origRunTurn(p);
  checked++;
  const ids = allIds();
  const std = STD(game);
  const set = new Set(ids);
  const stdSet = new Set(std);
  const lost = [...initial].filter(id => !set.has(id));
  const dup = std.length !== stdSet.size;
  if (lost.length || dup) {
    console.log(`\n⚠ 第 ${checked} 个回合（${p.name} ${p.generalName}）后出问题：丢牌 ${lost.join(',') || '无'} / 重复 ${dup}`);
    const last = game.logs.slice(-50).map(l => String(l.text || l));
    console.log('最近日志：');
    last.forEach(t => console.log('   ', t));
    process.exit(0);
  }
};

await game.run();
console.log('无丢牌/重复，对局正常结束');
