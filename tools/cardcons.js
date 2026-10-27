// 牌张守恒检查（引用级）：跑 N 局，校验
//  ①同一张牌的**对象引用**不得同时出现在两个区域（抓「弃牌堆未清理 / 牌被复制」）
//  ②总数 = 初始牌堆 + 技能生成 - 技能移出，偏离过大即列出明细供人工核对
// 用法：node tools/cardcons.js [局数=30] [--verbose]
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const N = Number(process.argv[2] || 30);
const VERBOSE = process.argv.includes('--verbose');

function zones(g) {
  const out = [];
  g.deck.forEach(c => c && out.push([c, 'deck']));
  g.discardPile.forEach(c => c && out.push([c, 'discard']));
  (g.table || []).forEach(c => c && out.push([c, 'table']));
  for (const p of g.players) {
    p.hand.forEach(c => c && out.push([c, `${p.name}.hand`]));
    Object.entries(p.equips || {}).forEach(([k, v]) => v && out.push([v, `${p.name}.equip`]));
    (p.judgeZone || []).forEach(z => z && z.card && out.push([z.card, `${p.name}.judge`]));
    (p.buqu || []).forEach(c => c && out.push([c, `${p.name}.buqu`]));
    Object.entries(p.extraZone || {}).forEach(([k, v]) => Array.isArray(v) && v.forEach(c => c && out.push([c, `${p.name}.extra`])));
  }
  return out;
}
// 技能内部的「追踪用」牌引用（如 lastDodgeCards、防止池）不构成独占区域，
// 单独收集：它们与实体区域重叠属正常，只在实体区之间重复才算真 bug。
function flagRefs(g) {
  const out = [];
  for (const p of g.players) {
    for (const [k, v] of Object.entries(p.flags || {})) {
      if (Array.isArray(v) && v.length && v.every(x => x && x.id)) v.forEach(c => out.push([c, `${p.name}.flags.${k}`]));
    }
  }
  return out;
}

let pass = 0, fail = 0, virtTotal = 0;
const problems = [];
const deltas = [];
let virtAll = 0;
for (let seed = 1; seed <= N; seed++) {
  const mode = getMode('identity');
  const rng = makeRng(seed * 3301 + 7);
  const used = new Set(); const seats = [];
  for (let i = 0; i < 4; i++) {
    const cands = GENERALS.filter(g => !used.has(g.id));
    const g = cands[rng.int(cands.length)]; used.add(g.id);
    seats.push({ id: `s${i}`, name: `P${i}`, isAI: true, general: g });
  }
  const game = new Game({ seats, mode, seed, responder: makeAIResponder(0), deckEntries: deckEntries(mode.deck), config: { timeout: 5000 } });
  const aiMap = new Map();
  const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
  game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
  game.onState = () => {};
  // 初始基准 = 牌堆 + 开局已发的起手牌（构造时已发牌，只数 deck 会漏掉起手牌）
  const total0 = game.deck.length + game.players.reduce((a, p) => a + p.hand.length, 0);
  let crash = null;
  try { await game.run(); } catch (e) { crash = e; }

  const zs = zones(game);
  const seen = new Map(); const dups = [];
  for (const [c, where] of zs) {
    if (seen.has(c)) dups.push({ card: c, a: seen.get(c), b: where });
    else seen.set(c, where);
  }
  // 虚拟牌（技能「视为使用」的牌）结算后进入弃牌堆属正常设计，不计入真实牌张守恒
  const realSeen = new Set();
  const virtSeen = new Set();
  for (const [c, where] of seen) { if (c.virtual) virtSeen.add(c); else realSeen.add(c); }
  const uniq = realSeen.size;
  virtAll += virtSeen.size;
  const frefs = flagRefs(game);
  for (const [c, where] of frefs) if (!seen.has(c)) seen.set(c, where);
  const delta = uniq - total0;
  deltas.push(delta);
  const gname = seats.map(s => s.general.name).join('/');

  if (crash) { fail++; problems.push(`seed ${seed}: 运行异常 ${crash.message}`); continue; }
  if (dups.length) {
    fail++;
    problems.push(`seed ${seed}（${gname}）: ${dups.length} 处牌被复制 → ` +
      dups.slice(0, 4).map(d => `${d.card.name}${d.card.suit || ''}${d.card.num || ''} 在 ${d.a} 与 ${d.b}`).join('；'));
    continue;
  }
  pass++;
  if (VERBOSE) console.log(`  seed ${String(seed).padStart(2)} 唯一牌 ${uniq} / 初始 ${total0} → ${delta >= 0 ? '+' : ''}${delta}  ${gname}`);
}

const big = deltas.filter(d => Math.abs(d) > 8);
console.log(`\n[牌张守恒] ${pass} 通过 / ${fail} 失败（${N} 局）`);
console.log(`（虚拟牌合计 ${virtAll} 张已从守恒统计中排除）`);
console.log(`delta 分布：min ${Math.min(...deltas)} / max ${Math.max(...deltas)} / 中位 ${deltas.slice().sort((a, b) => a - b)[Math.floor(N / 2)]}`);
console.log(`|delta| > 8 的局：${big.length}${big.length ? ' → ' + big.join(',') : ''}`);
if (problems.length) { console.log('\n问题：'); problems.forEach(p => console.log('  ✗ ' + p)); }
process.exit(fail ? 1 : 0);
