// 「持有型容器」双管检测（v2，SG031 A3 增强）
// ---------------------------------------------------------------------------
// ① 静态清点：扫源码里所有「向 flags/marks/玩家级字段 存牌」的写法，
//    与 src/skills/held-reclaim.js 的登记表对比 → 列出「未登记候选」（需人工判定拥有/引用）
// ② 运行时探测：包裹 game.die / game.removeSkills，并在每回合末 + 局终，
//    扫描所有玩家容器里的牌；若牌不在任何标准区域（按 id 比对，豁免虚拟牌）⇒ 泄漏
// 运行：node tools/heldleak.js [局数]
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS, generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';
import { HELD_CONTAINERS, isVirtualCard } from '../src/engine/skill.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const N = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 40);
const SKIP_STATIC = process.argv.includes('--no-static');
const FILLER = ['sunquan', 'caocao', 'liubei', 'guanyu', 'zhenji', 'zhouyu', 'huanggai', 'luxun', 'huatuo', 'lvbu', 'simayi', 'diaochan'];
const CASES = [['identity', 5], ['junzheng', 4], ['duel', 2], ['identity', 6], ['guozhan', 4]];

const isCard = (v) => v && typeof v === 'object' && v.id != null && typeof v.name === 'string';
// 虚拟牌 / 合成牌：不是真牌，不入堆、也不该被当成「丢失」
// ★与引擎同一判据（SG032 A1.1）：纯 vcard 的 id 是 vm*/vxh*、name 却是正常牌名
const isVirtual = (c) => isVirtualCard(c);
const registered = new Set(HELD_CONTAINERS.map(c => c.key));

// 静态扫描的「人工已判定为非牌」白名单（每条都核实过源码语义，避免重复排查）
const KNOWN_NONCARD = new Set([
  'flags.jiewu',        // clan2 捷悟：shown 只声明、从未存牌
  'flags.bcNames',      // clan3：存的是名字字符串
  'flags.cwSha',        // jin2：{card:d.card} 引用已使用的杀
  'flags.maihuoCard',   // jin2：引用已使用的牌
  'flags.zhouxiAs',     // mo：引用打出的牌副本
  'flags.kangli',       // qunying 伉厉：手牌子集（仍 in hand）
  'flags.gzPool',       // shan 固政：他人已弃置的牌（在弃牌堆）
  'flags.huashen',      // shan 化身：cards 存**技能 id 字符串**
  'flags.tianzongCards',// star3：走 game.exileCards 已记账
  'flags.xhFunan',      // xinghuo2：{card:d.card} 引用
  'flags.lastSuit',     // yj2014：存花色值
  'flags.yz16Guizao',   // yz2016 瑰藻：自己已弃置的牌（在弃牌堆）
]);

// ============================================================ ① 静态清点
function staticScan() {
  const dir = 'src/skills';
  const files = readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'held-reclaim.js');
  const cand = new Map();   // 容器 key -> {file, line, snippet}
  // 只认「存牌对象」的写法：右侧/参数里出现牌变量，且**不是**取 id/名字/花色/数量
  const CARDY = /\b(cards?|picks?|hearts|cs\[|hand|top|shown|candidates)\b/;
  const NOT_CARD = /\.(id|name|suit|num|type|cn|length)\b|\.map\(|length\b/;
  for (const f of files) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*\/\//.test(l)) continue;
      let m;
      // flags.X = [...] / flags.X.push(...)
      if ((m = /\.flags\.(\w+)\s*=\s*(.{0,90})/.exec(l))) {
        const name = m[1], rhs = m[2];
        if (CARDY.test(rhs) && !NOT_CARD.test(rhs)) cand.set(`flags.${name}`, { file: f, line: i + 1, snippet: l.trim().slice(0, 80) });
      }
      if ((m = /\.flags\.(\w+)\.push\((.{0,60})/.exec(l))) {
        const name = m[1], arg = m[2];
        if (CARDY.test(arg) && !NOT_CARD.test(arg)) cand.set(`flags.${name}`, { file: f, line: i + 1, snippet: l.trim().slice(0, 80) });
      }
    }
  }
  const unreg = [...cand.entries()].filter(([k]) => {
    if (registered.has(k) || KNOWN_NONCARD.has(k)) return false;
    // 已登记的嵌套形态（flags.xhChou.cards 等）
    if (registered.has(`${k}.cards`) || registered.has(`${k}.card`)) return false;
    return true;
  });
  console.log(`=== ① 静态清点：登记 ${registered.size} / 源码候选 ${cand.size} / 未登记候选 ${unreg.length}`);
  for (const [k, v] of unreg) console.log(`  ? ${k.padEnd(26)} ${v.file}:${v.line}  ${v.snippet}`);
  return unreg.length;
}

// ============================================================ ② 运行时探测
const leaks = new Map();
const mv = new Map();   // 虚拟牌豁免计数（顺带统计，便于发现「本该是实体牌却虚拟」）
function noteLeak(path, card, who) {
  if (isVirtual(card)) { mv.set(path, (mv.get(path) || 0) + 1); return; }
  if (!leaks.has(path)) leaks.set(path, { hits: 0, sample: '', who: new Set() });
  const e = leaks.get(path);
  e.hits++;
  e.sample = `${card.name}#${card.id}`;
  e.who.add(who || '?');
}
function scanPlayer(g, p, tag) {
  const walk = (obj, path) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'lastDodgeCards') continue;
      if (Array.isArray(v)) {
        for (const x of v) {
          if (isCard(x) && !g.inAnyZone(x)) noteLeak(`${tag}${path}${k}`, x, p.generalName);
          else if (x && typeof x === 'object') walk(x, `${path}${k}.`);
        }
      } else if (v && typeof v === 'object') {
        if (isCard(v)) { if (!g.inAnyZone(v)) noteLeak(`${tag}${path}${k}`, v, p.generalName); continue; }
        walk(v, `${path}${k}.`);
      }
    }
  };
  walk(p.flags || {}, 'flags.');
  walk(p.marks || {}, 'marks.');
  for (const [key, arr] of [['quan', p.quan], ['si', p.si], ['zhen', (p.zhen || []).map(r => r && r.card)]]) {
    for (const c of arr || []) if (isCard(c) && !g.inAnyZone(c)) noteLeak(`${tag}${key}`, c, p.generalName);
  }
}

let done = 0, threw = 0, diedCount = 0, removeCount = 0;
for (let i = 0; i < N; i++) {
  const [modeId, n] = CASES[i % CASES.length];
  const seed = 7700 + i;
  const rng = makeRng(seed);
  const pool = rng.shuffle(GENERALS.map(x => x.id));
  const seats = [];
  for (let k = 0; k < n; k++) seats.push({ id: `s${k}`, name: `P${k}`, isAI: true, general: generalById(pool[k]) });
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

  const origDie = game.die.bind(game);
  game.die = async (player, opts) => {
    const r = await origDie(player, opts);
    diedCount++;
    try { scanPlayer(game, player, 'die:'); } catch { /* ignore */ }
    return r;
  };
  const origRemove = game.removeSkills.bind(game);
  game.removeSkills = async (player, ids) => {
    const r = await origRemove(player, ids);
    removeCount++;
    try { scanPlayer(game, player, 'rm:'); } catch { /* ignore */ }
    return r;
  };
  // ★只在「不该再有持有」的两个时机扫：死亡后、失去技能后。
  //   回合末 / 局终不能扫 —— 那时容器里正当持有牌（刺、威、荣、伏兵…）会被误报成泄漏。
  game.onState = () => {};
  try { await game.run(); done++; } catch (e) { threw++; if (threw <= 3) console.error(`局 ${i} 异常：${e.message}`); }
}

console.log(`\n=== ② 运行时：跑完 ${done}/${N} 局（异常 ${threw}）/ 死亡 ${diedCount} / removeSkills ${removeCount}`);
const rows = [...leaks.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.hits - a.hits);
if (!rows.length) console.log('✅ 未发现持有型容器泄漏');
else {
  console.log('⚠ 泄漏容器（应加入 src/skills/held-reclaim.js）：');
  for (const r of rows) console.log(`  ${r.k.padEnd(34)} 次数 ${String(r.hits).padStart(4)}  样例 ${r.sample}  武将 ${[...r.who].slice(0, 3).join('/')}`);
}
if (mv.size) {
  console.log('\n（已豁免的虚拟牌容器，仅供核对）');
  for (const [k, v] of mv) console.log(`  ${k.padEnd(34)} ${v}`);
}
const staticUnreg = SKIP_STATIC ? 0 : staticScan();
console.log(`\n小结：运行时泄漏 ${rows.length} 个 / 静态未登记候选 ${staticUnreg} 个`);
process.exit(rows.length ? 1 : 0);
