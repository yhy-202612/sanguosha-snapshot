// 「SP·绝世 / 稀世珍宝 / 稀有·传说」稀有专属压力测试（2026-10-26）
// 运行：node tools/starsim.js [局数] [--verbose]
// 检查：①每局首位是新包武将，全覆盖 21 将 ②无 `⚠ 技能 X 执行异常`
//      ③对局正常结束（不死循环）④牌张守恒（无重复 id / 无丢牌）
//      ⑤护甲不越界 ⑥统计各技能实际发动次数（--verbose 打印）
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS, generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a)) || 66);
const VERBOSE = args.includes('--verbose');

const POOL = GENERALS.filter(g => ['rare2'].includes(g.pack)).map(g => g.id);
const FILLER = ['sunquan', 'caocao', 'liubei', 'guanyu', 'zhenji', 'zhouyu', 'huanggai', 'luxun', 'huatuo', 'lvbu'];
const CASES = [['duel', 2], ['identity', 3], ['identity', 5], ['junzheng', 4], ['identity', 6]];

let fail = 0, total = 0, maxMs = 0;
const problems = [];
const skillFired = new Map();
const covered = new Set();

// 标准区域（参与重复判定）+ 别名牌位（exile / flags / marks 里的悬挂牌，只算「存在」）
function zoneIds(g) {
  const std = [];
  const push = (c) => { if (c && c.id != null) std.push(c.id); };
  g.deck.forEach(push);
  g.discardPile.forEach(push);
  (g.table || []).forEach(push);
  for (const p of g.players) {
    p.hand.forEach(push);
    Object.values(p.equips || {}).forEach(push);
    (p.judgeZone || []).forEach(z => push(z.card));
  }
  return std;
}
function allCardIds(g) {
  const ids = zoneIds(g);
  const push = (c) => { if (c && c.id != null) ids.push(c.id); };
  (g.exilePile || []).forEach(push);
  // 武将牌上的牌 / 扣置牌等「别名牌位」：flags、marks 里出现的牌对象一律算存在
  // ★例外：引擎的「记录型引用」（只存"最近打过哪张牌"，牌本体仍在弃牌堆）不计入，否则误报双存
  const SKIP_FLAGS = new Set(['lastDodgeCards']);
  const walk = (v, d, key) => {
    if (SKIP_FLAGS.has(key)) return;
    if (!v || typeof v !== 'object' || d > 4) return;
    if (Array.isArray(v)) { v.forEach(x => walk(x, d + 1)); return; }
    if (v.id != null && v.name) ids.push(v.id);
    for (const k of Object.keys(v)) walk(v[k], d + 1, k);
  };
  for (const p of g.players) { walk(p.flags, 0); walk(p.marks, 0); }
  return ids;
}

for (let i = 0; i < N; i++) {
  const [modeId, seatCount] = CASES[i % CASES.length];
  const seed = 9100 + i;
  const rng = makeRng(seed);
  const first = POOL[i % POOL.length];
  covered.add(first);
  const used = new Set([first]);
  const seats = [{ id: 's0', name: 'P0', isAI: true, general: generalById(first) }];
  for (let k = 1; k < seatCount; k++) {
    // 一半座位补新包武将（提高覆盖），一半补常规武将（对照）
    let id;
    if (k % 2 === 1) {
      const cands = POOL.filter(x => !used.has(x));
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

  const beforeIds = allCardIds(game);
  const t0 = Date.now();
  try {
    await game.run();
  } catch (e) {
    fail++;
    problems.push(`seed ${seed} ${modeId}: 抛异常 ${e.stack?.split('\n')[1]?.trim() || e.message}`);
    continue;
  }
  const ms = Date.now() - t0;
  maxMs = Math.max(maxMs, ms);
  total++;

  const warn = game.logs.map(l => String(l.text || l)).filter(t => t.includes('⚠'));
  if (warn.length) {
    fail++;
    problems.push(`seed ${seed} ${modeId}: ${warn.slice(0, 2).join(' | ')}`);
  }
  if (!game.over) {
    fail++;
    problems.push(`seed ${seed} ${modeId}: 对局未结束（可能死循环）`);
  }
  // 牌张守恒：把当前所有区域的 id 统计一遍（牌堆 + 弃牌堆 + 移出区 + 各家区域）
  const ids = allCardIds(game);
  const stdIds = zoneIds(game);
  const seenAll = new Set(ids);          // 存在性：含 exile / flags / marks 等别名牌位
  const dup = new Set();
  const stdSeen = new Set();
  // 重复只按「标准区域」判定（与 sg020guard 同口径，避免把武将牌上的牌误判为双存）
  for (const id of stdIds) {
    if (stdSeen.has(id)) dup.add(id);
    stdSeen.add(id);
  }
  if (dup.size) {
    fail++;
    problems.push(`seed ${seed} ${modeId}: 牌张重复 ${[...dup].slice(0, 4).join(',')}`);
  }
  const lost = beforeIds.filter(id => !seenAll.has(id));
  if (lost.length) {
    fail++;
    problems.push(`seed ${seed} ${modeId}: 牌张丢失 ${lost.slice(0, 4).join(',')}`);
  }
  for (const p of game.players) {
    if ((p.armor || 0) > (p.armorMax || 99)) {
      fail++;
      problems.push(`seed ${seed}: ${p.generalName} 护甲 ${p.armor} 超上限 ${p.armorMax}`);
    }
    if ((p.armor || 0) < 0) {
      fail++;
      problems.push(`seed ${seed}: ${p.generalName} 护甲为负 ${p.armor}`);
    }
  }
  for (const l of game.logs) {
    const t = String(l.text || l);
    const m = t.match(/发动【([^】]+)】/) || t.match(/【([^】]+)】：/);
    if (m) skillFired.set(m[1], (skillFired.get(m[1]) || 0) + 1);
  }
}

console.log(`\nSP·绝世 / 稀世珍宝 / 稀有·传说 压力测试：完成 ${total}/${N} 局，最长 ${maxMs}ms，失败 ${fail}`);
console.log(`首批武将覆盖 ${covered.size}/${POOL.length}`);
const skillIds = new Set();
for (const g of GENERALS.filter(x => ['star', 'myth', 'moon'].includes(x.pack))) for (const s of g.skills) skillIds.add(s);
if (VERBOSE) {
  const fired = [...skillFired.entries()].sort((a, b) => b[1] - a[1]);
  console.log('技能发动统计（含同名的其它包技能）：');
  for (const [k, v] of fired.slice(0, 40)) console.log(`  ${k} × ${v}`);
}
if (problems.length) {
  console.log('问题：');
  [...new Set(problems)].slice(0, 24).forEach(p => console.log('  ✗', p));
  process.exit(1);
}
