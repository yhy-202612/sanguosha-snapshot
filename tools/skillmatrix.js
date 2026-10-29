// 全技能矩阵测试（每个技能都要被真正驱动一次）
//   node tools/skillmatrix.js [--json /tmp/skillmatrix.json] [--limit N] [--id xxx]
// 三层判定：
//   L1 静态合法   —— id/name/desc 非空，每个 trigger 的 on ∈ VALID_EVENTS 且 effect 是函数，
//                    active.effect 是函数（漏了 effect 的技能等于死代码）
//   L2 挂载有效   —— collectTriggers 在对应事件上能收集到该技能的该触发器
//                    （on/who 解析错误会让技能永不触发，T60 那类假绿就靠这层兜）
//   L3 真跑       —— 真跑 effect：强驱动 = 走 game.trigger / useActiveSkill（含 filter 判定）；
//                    弱驱动 = filter 拒绝时直调 effect；抓异常与引擎「⚠ 技能 X 执行异常」
// 牌张守恒另由 tools/sg020guard.js 负责，这里只测「能不能跑」。
import '../src/skills/index.js';
import { Game, CARD_META } from '../src/engine/index.js';
import { allSkills, VALID_EVENTS, collectTriggers, getSkill } from '../src/engine/skill.js';
import { generalById, GENERALS } from '../src/data/generals.js';
import { getMode } from '../src/modes/index.js';
import { deckEntries } from '../src/data/deck.js';
import fs from 'node:fs';

// 无 trigger/active 的技能里，这些是「面板展示用 / 逻辑内联在别的技能里」的合法声明（源码注释均已注明）：
//   binglve 兵略 → 内联在【飞军】；leisui 雷随 / leizu 雷诅 → 判定看 marks，逻辑在【天雷】【雷雨】；
//   siyin 死印 → 触发挂在【魔星】持有者身上；weizhong 威重 → 唯一结算入口在文件头 cutMaxHp()
const KNOWN_INLINE = new Set(['binglve', 'leisui', 'leizu', 'siyin', 'weizhong']);

const argv = process.argv.slice(2);
const argOf = (k, def) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : def; };
const JSON_OUT = argOf('--json', '');
const LIMIT = Number(argOf('--limit', '0')) || 0;
const ONLY = argOf('--id', '');
const TIMEOUT_MS = Number(argOf('--to', '1500'));

let uid = 0;
const mk = (name, suit = 'spade', num = 7) => ({ id: `s${++uid}`, name, suit, num });
const EQ = { weapon: 'qinggang', armor: 'bagua', horsePlus: 'chitu', horseMinus: 'jueying', treasure: 'muniu' };

// ---------------------------------------------------------------- 造一个「满配世界」
function newWorld() {
  const gens = ['sunquan', 'caocao', 'liubei', 'guanyu'];
  const seats = gens.map((gid, i) => ({ id: `p${i}`, name: `P${i}`, isAI: true, general: generalById(gid) }));
  const g = new Game({
    seats, mode: getMode('identity'), seed: 11,
    deckEntries: deckEntries('standard'),
    responder: { askPlay: async () => ({ endPhase: true }), ask: async () => null },
    config: { timeout: 200 },
  });
  g.onState = () => {};
  g.warn = [];
  const realLog = g.log.bind(g);
  g.log = async (t) => { const s = String(t); if (s.startsWith('⚠')) g.warn.push(s); else realLog(s); };
  g.confirm = async () => true;
  g.chooseOne = async (p, opts) => (opts && opts.length ? 0 : -1);
  g.chooseTargets = async (p, { min = 1, candidates = [] } = {}) => (candidates || []).slice(0, Math.max(1, min));
  g.respondCard = async (p, opt = {}) => {
    const pool = (p?.hand || []).filter((c) => !opt.filter || safe(() => opt.filter(c), false));
    return pool[0] || null;
  };
  g.ask = async () => null;
  for (const p of g.players) {
    p.skills = []; p.hp = 5; p.maxHp = 5; p.marks = {}; p.flags = {}; p.judgeZone = [];
    p.hand = [mk('sha', 'heart', 7), mk('shan', 'diamond', 2), mk('tao', 'heart', 3),
      mk('guohe', 'spade', 4), mk('wuxie', 'club', 5), mk('juedou', 'spade', 1)];
    p.equips = { weapon: mk(EQ.weapon), armor: mk(EQ.armor), horsePlus: mk(EQ.horsePlus), horseMinus: mk(EQ.horseMinus), treasure: mk(EQ.treasure) };
  }
  return g;
}

function safe(fn, def) { try { return fn(); } catch { return def; } }

// ---------------------------------------------------------------- 按事件造 data（字段照引擎里的真实派发抄）
function makeData(event, g, p, q, extra = {}) {
  const self = p;
  const base = { self, player: p, game: g, reason: `test:${event}` };
  const card = mk('sha', 'heart', 7);
  const cards = [mk('sha', 'spade', 8), mk('shan', 'diamond', 9)];
  switch (event) {
    case 'game.start': return {};
    case 'turn.begin': case 'turn.end': case 'round.begin': case 'round.end':
    case 'flip.after': return { ...base, to: 1 };
    case 'phase.begin': case 'phase.end': return { ...base, phase: 'play' };
    case 'cards.draw': case 'cards.draw.after': return { ...base, cards, count: cards.length };
    case 'cards.gain': return { ...base, from: q, cards };
    case 'cards.lose': return { ...base, cards };
    case 'cards.discard': return { ...base, cards, taken: [] };
    case 'judge.before': case 'judge.after':
      return { ...base, card: mk('shan', 'heart', 2), suit: 'heart', num: 2, reason: 'test' };
    case 'card.use.before': case 'card.use.after':
    case 'card.effect.before': case 'card.effect.after':
      return { ...base, self: p, from: p, card, targets: [q], target: q, total: 1, reason: 'sha' };
    case 'target.before': case 'target.after':
    case 'sha.target':
      return { ...base, from: p, card, targets: [q], target: q, total: 1 };
    case 'juedou.need': return { ...base, card };
    case 'damage.before': case 'damage.after':
      return { ...base, self: p, from: q, to: p, target: p, amount: 1, nature: 'normal', card };
    case 'hp.lose': case 'hp.recover': return { ...base, amount: 1, from: q, card };
    case 'dying.begin': case 'dying.end': return { ...base, from: q };
    case 'death.before': case 'death.after': return { ...base, killer: q, from: q };
    case 'dodge.before': case 'dodge.after': return { ...base, card: mk('shan', 'diamond', 3), from: q };
    // 引擎口径：sha.dodged = { self: 使用杀的人, target, card, dodgeCards }；
    //           sha.hit    = { self: 使用杀的人, target, card, amount }
    case 'sha.dodged': return { ...base, self: p, from: p, target: q, to: q, card, dodgeCards: [] };
    case 'sha.hit': return { ...base, self: p, from: p, target: q, to: q, card, amount: 1 };
    case 'respond.need':
      // 响应窗口必须带一张真实牌：转化技（龙胆/龙魂…）会直接读 data.card.name
      return { ...base, kind: 'shan', filter: null, handled: false, card: mk('shan', 'diamond', 7) };
    case 'equip.change': return { ...base, slot: 'weapon', card: mk(EQ.weapon), old: null };
    case 'equip.lose': return { ...base, slot: 'weapon', card: mk(EQ.weapon) };
    case 'armor.change': return { ...base, delta: 2, armor: 2 };
    case 'distance.calc': return { ...base, from: p, to: q, distance: 1, base: 1, value: 1 };
    case 'hand.change': return { ...base, delta: 1, cards: [] };
    case 'draw.count': return { ...base, count: 2, reason: 'turn' };
    case 'zone.out': case 'zone.in': return { ...base, cards };
    case 'pindian.pick': return { ...base, self: p, cards: [mk('sha', 'spade', 5), mk('tao', 'heart', 6)] };
    case 'yishi.end': return { ...base, self: p, initiator: p, result: 'red', red: 2, black: 1 };
    case 'skills.disabled': case 'skills.enabled': return { ...base, reason: 'test' };
    case 'form.change': return { ...base, form: 'demon', from: 'normal' };
    case 'kingdom.change': return { ...base, from: 'qun', to: 'wei' };
    default: return { ...base, card, cards, from: q, to: q, target: q, targets: [q], amount: 1 };
  }
}

// 同一事件的多个 data 变体：filter 在真实对局里会因阶段/牌名/属性不同而放行，
// 只有跑到「filter 通过」的那条才算走了真实可达路径（否则统计里只能算弱驱动）。
const CARD_VARIANTS = ['sha', 'shan', 'tao', 'jiu', 'guohe', 'shunshou', 'juedou', 'wuxie',
  'lebu', 'shandian', 'wuzhong', 'nanman', 'wanjian', 'jiedao', 'wugu', 'taoyuan'];
const PHASES = ['play', 'draw', 'discard', 'judge', 'start', 'end'];
const NATURES = ['normal', 'fire', 'thunder'];

function dataVariants(event, g, p, q) {
  const base = makeData(event, g, p, q);
  const out = [base];
  const push = (over) => out.push({ ...base, ...over });
  if (event.startsWith('phase.')) for (const ph of PHASES) push({ phase: ph });
  for (const nm of CARD_VARIANTS) push({ card: mk(nm, 'spade', 7), cards: [mk(nm, 'spade', 8)] });
  for (const nt of NATURES) push({ nature: nt });
  push({ amount: 2 });
  push({ amount: 0 });
  // 目标 / 来源互换：「当你是目标」「当你使用牌被响应」两种视角都试一遍
  push({ self: q, target: p, to: p, from: p, targets: [p] });
  push({ killer: p, from: p });
  // 手牌/装备更肥一点，让「弃置」「获得」类前置成立
  return out;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms @${label}`)), ms)),
  ]);
}

// ---------------------------------------------------------------- 单技能
async function testSkill(sk) {
  const rec = { id: sk.id, name: sk.name, kind: sk.active ? 'active' : 'trigger', cases: [], problems: [] };

  // ---- L1 静态
  if (!sk.id || !sk.name) rec.problems.push('L1 缺少 id/name');
  if (!sk.desc) rec.problems.push('L1 缺少 desc');
  for (const tr of sk.triggers || []) {
    if (!VALID_EVENTS.has(tr.on)) rec.problems.push(`L1 未知事件 ${tr.on}`);
    if (typeof tr.effect !== 'function') rec.problems.push(`L1 ${tr.on} 缺 effect`);
  }
  if (sk.active && typeof sk.active.effect !== 'function') rec.problems.push('L1 active 缺 effect');
  // 无 trigger 也无 active：可能由引擎内特判实现（如【不屈】在 game.js 的濒死逻辑里），
  // 不算失败，但要单列出来让人核对「是否真被引擎实现」。
  if (!sk.triggers?.length && !sk.active) rec.engineNative = true;

  // ---- 一局一技能，避免技能之间互相污染
  let g;
  try { g = newWorld(); } catch (e) { rec.problems.push(`建局失败：${e.message}`); return rec; }
  const p = g.players[0], q = g.players[1];
  p.skills = [sk];
  if (sk.kingdomOnly) p.kingdom = sk.kingdomOnly;
  if (sk.lord) p.isLord = true;

  // ---- L2 挂载（技能挂满 4 人：who:'self' / 'other' / 'any' 都能被覆盖，
  //          避免「data.self 指向别的角色」造成卡在 who 判定上而误判为未挂载）
  for (const tr of sk.triggers || []) {
    for (const pl of g.players) pl.skills = [sk];
    const list = safe(() => collectTriggers(g, tr.on, makeData(tr.on, g, p, q)), []);
    const hit = list.some((x) => x.skill.id === sk.id && x.trigger.on === tr.on);
    if (!hit) rec.problems.push(`L2 ${tr.on} 未被 collectTriggers 收取`);
    for (const pl of g.players) pl.skills = [];
    p.skills = [sk];
  }

  // ---- L3a 主动技
  if (sk.active) {
    p.flags = {}; p.hp = 5;
    const before = g.warn.length;
    let err = null;
    try { await withTimeout(g.useActiveSkill(p, sk.id, [q]), TIMEOUT_MS, `${sk.id}/active`); }
    catch (e) { err = e.message; }
    const warns = g.warn.slice(before);
    rec.cases.push({ on: 'active', mode: 'strong', err, warn: warns });
  }

  // ---- L3b 触发器
  for (const tr of sk.triggers || []) {
    // 逐个 data 变体试到 filter 放行（放行才走真实派发链）
    let data = makeData(tr.on, g, p, q);
    let pass = false, filterErr = null;
    if (!tr.filter) pass = true;
    else {
      for (const cand of dataVariants(tr.on, g, p, q)) {
        const fself = (cand.self == null && tr.on === 'game.start') ? p : cand.self;
        try {
          if (tr.filter({ ...cand, self: fself, player: p, game: g })) { pass = true; data = cand; break; }
        } catch (e) { filterErr = filterErr || e.message; }
      }
    }
    const before = g.warn.length;
    if (pass) {
      let err = null;
      try { await withTimeout(g.trigger(tr.on, data), TIMEOUT_MS, `${sk.id}/${tr.on}`); }
      catch (e) { err = e.message; }
      rec.cases.push({ on: tr.on, mode: 'strong', err, warn: g.warn.slice(before) });
    } else {
      // filter 拒绝（多半是 data 前提不成立）：绕过 filter 直调 effect，只求「能跑起来不崩」
      let err = null;
      try {
        const ctx = g.makeCtx(p, sk, tr, data);
        await withTimeout(tr.effect(ctx), TIMEOUT_MS, `${sk.id}/${tr.on}/weak`);
      } catch (e) { err = e.message; }
      rec.cases.push({ on: tr.on, mode: 'weak', err, filterErr, warn: g.warn.slice(before) });
    }
  }
  return rec;
}

// ---------------------------------------------------------------- 主流程
// 引擎内特判核对：无 trigger/active 的技能，看它是否被引擎（含转化技 virtual-*.js）真正引用
const ENGINE_SRC = (() => {
  const dirs = ['../src/engine/', '../src/modes/', '../src/server/', '../src/ai/'];
  let txt = '';
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(new URL(d, import.meta.url)); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.js')) continue;
      txt += fs.readFileSync(new URL(d + f, import.meta.url), 'utf8');
    }
  }
  return txt;
})();

const all = allSkills().slice().sort((a, b) => a.id.localeCompare(b.id));
const target = ONLY ? all.filter((s) => s.id === ONLY) : (LIMIT ? all.slice(0, LIMIT) : all);
const t0 = Date.now();
const out = [];
let i = 0;
for (const sk of target) {
  out.push(await testSkill(sk));
  i++;
  if (i % 200 === 0) process.stderr.write(`  …${i}/${target.length}  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}
const ms = Date.now() - t0;

// ---------------------------------------------------------------- 汇总
const STRICT = argv.includes('--strict');
const stat = {
  total: target.length, nativeImpl: [], nativeInline: [], nativeDead: [], nativeOrphan: [],
  strongSkills: 0, weakOnly: [],
  l1_bad: [], l2_bad: [], strong: 0, weak: 0,
  threw: [], weakThrew: [], filterErr: [], warned: [], timeout: [],
};
for (const r of out) {
  const hasStrong = r.cases.some((c) => c.mode === 'strong');
  if (hasStrong) stat.strongSkills++;
  else if (r.cases.length && !r.engineNative) stat.weakOnly.push(`${r.id}【${r.name}】`);
  if (r.engineNative) {
    const sk = getSkill(r.id) || {};
    // 属性型实现（banUse / 纯声明）：技能不带触发器，但引擎按属性生效
    const attrKeys = ['banUse', 'locked', 'kingdomOnly', 'lord', 'hidden', 'form', 'xuliTech', 'reclaimCards'];
    const attr = attrKeys.some((k) => sk[k] != null && sk[k] !== false);
    const used = new RegExp(`['"\`]${r.id}['"\`]`).test(ENGINE_SRC);
    const onGeneral = GENERALS.some((g) => (g.skills || []).includes(sk.id) || (g.skills || []).includes(r.id));
    const label = `${r.id}【${r.name}】`;
    if (used || attr) stat.nativeImpl.push(label + (attr && !used ? '(属性型)' : ''));
    else if (KNOWN_INLINE.has(r.id)) stat.nativeInline.push(label);
    else if (onGeneral) stat.nativeDead.push(label + '(被武将引用但无任何实现)');
    else stat.nativeOrphan.push(label);
  }
  for (const pb of r.problems) {
    if (pb.startsWith('L1')) stat.l1_bad.push(`${r.id}：${pb}`);
    else stat.l2_bad.push(`${r.id}：${pb}`);
  }
  for (const c of r.cases) {
    if (c.mode === 'strong') stat.strong++;
    else if (c.mode === 'weak') stat.weak++;
    if (c.filterErr) stat.filterErr.push(`${r.id}【${r.name}】${c.on}：${c.filterErr}`);
    if (c.err) {
      const line = `${r.id}【${r.name}】${c.on}（${c.mode}）：${c.err}`;
      if (c.err.startsWith('TIMEOUT')) stat.timeout.push(line);
      else if (c.mode === 'weak') stat.weakThrew.push(line);
      else stat.threw.push(line);
    }
    for (const w of c.warn || []) stat.warned.push(`${r.id}【${r.name}】${c.on}：${w}`);
  }
}
const cluster = (arr, keyFn) => {
  const m = new Map();
  for (const s of arr) { const k = keyFn(s); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`\n=== 全技能矩阵测试 ===`);
console.log(`技能 ${stat.total} 个（触发 ${out.filter((r) => r.kind === 'trigger').length} / 主动 ${out.filter((r) => r.kind === 'active').length}），用时 ${(ms / 1000).toFixed(1)}s`);
console.log(`L1 静态合法：${stat.total - new Set(stat.l1_bad.map((s) => s.split('：')[0])).size}/${stat.total}`);
console.log(`L2 挂载有效：${stat.total - new Set(stat.l2_bad.map((s) => s.split('：')[0])).size}/${stat.total}`);
console.log(`L3 强驱动 ${stat.strong} 次 / 弱驱动 ${stat.weak} 次`);
console.log(`   走真实可达路径（≥1 次强驱动）的技能：${stat.strongSkills}/${stat.total}（仅弱驱动 ${stat.weakOnly.length}）`);
console.log(`   强驱动抛错 ${stat.threw.length} / 弱驱动抛错 ${stat.weakThrew.length} / 超时 ${stat.timeout.length} / ⚠ 日志 ${stat.warned.length} / filter 异常 ${stat.filterErr.length}`);
if (stat.nativeImpl.length) console.log(`   无 trigger/active 但被引擎/转化技引用（正常，共 ${stat.nativeImpl.length}）：${stat.nativeImpl.join('、')}`);
if (stat.nativeDead.length) console.log(`   ⚠ 被武将引用但技能体无任何实现（FAIL，共 ${stat.nativeDead.length}）：${stat.nativeDead.join('、')}`);
if (stat.nativeInline.length) console.log(`   内联实现/面板展示声明（合法，共 ${stat.nativeInline.length}）：${stat.nativeInline.join('、')}`);
if (stat.nativeOrphan.length) console.log(`   ⚠ 孤立技能（无武将引用、无实现，WARN 共 ${stat.nativeOrphan.length}）：${stat.nativeOrphan.join('、')}`);
if (stat.weakOnly.length) console.log(`   仅弱驱动（filter 在测试 data 下未放行，需靠实跑覆盖）${stat.weakOnly.length} 个：${stat.weakOnly.slice(0, 40).join('、')}${stat.weakOnly.length > 40 ? ' …' : ''}`);

const show = (title, arr, n = 25) => {
  if (!arr.length) return;
  console.log(`\n-- ${title}（${arr.length}）--`);
  for (const s of arr.slice(0, n)) console.log('  ', s);
  if (arr.length > n) console.log(`   … 其余 ${arr.length - n} 条见 JSON`);
};
show('L1 静态问题', stat.l1_bad);
show('L2 挂载问题', stat.l2_bad);
show('超时', stat.timeout);
show('强驱动抛错（真实可达路径，算 FAIL）', stat.threw, 40);
show('filter 异常（filter 本身崩了，算 FAIL）', stat.filterErr, 20);
show('引擎 ⚠ 日志', stat.warned, 40);
show('弱驱动抛错（绕过 filter 直调，前置状态未铺垫，仅供复核）', stat.weakThrew, 40);
if (stat.threw.length) {
  console.log('\n-- 抛错原因聚类 --');
  for (const [k, n] of cluster(stat.threw, (s) => s.split('：').slice(1).join('：').replace(/["'`][^"'`]*["'`]/g, 'X').slice(0, 70)).slice(0, 20)) {
    console.log(`   ${n}× ${k}`);
  }
}

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({ at: new Date().toISOString(), ms, stat, detail: out }, null, 1));
  console.log(`\nJSON 已写入 ${JSON_OUT}`);
}
let bad = stat.l1_bad.length + stat.l2_bad.length + stat.threw.length + stat.filterErr.length + stat.timeout.length + stat.warned.length + stat.nativeDead.length;
if (STRICT) bad += stat.weakThrew.length;
console.log(bad
  ? `\nRESULT: FAIL（${bad} 项问题${STRICT ? '，--strict 含弱驱动' : ''}）`
  : `\nRESULT: PASS（每个技能都通过 L1/L2/L3；弱驱动抛错 ${stat.weakThrew.length} 条仅记录）`);
process.exit(bad ? 1 : 0);
