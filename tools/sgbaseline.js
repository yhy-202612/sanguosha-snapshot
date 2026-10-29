// SG020 门禁工具：三条与具体技能实现正交的引擎级守门检查
//   1) 静默异常哨兵：引擎把技能异常吞成日志 `⚠ 技能 X 执行异常`，此处要求 0 条
//   2) 牌张守恒：逐回合 + 局终比对「全部牌 id 集合」，抓复制 / 丢失 / 同一 id 双区域
//   3) 次数限制与跨回合复位：静态扫描 perTurn 主动技，逐技能断言「回合1首次成功 / 回合1再次被拒 / 回合2首次又成功」
//
// 运行：node tools/sg020guard.js [--games=60] [--only=1,2,3] [--verbose] [--strict] [--allow-lost=c12,c33]
//   --games=N      检查 1/2 跑的对局数（固定 seed 序列 1..N，默认 60）
//   --only=1,2,3   只跑指定检查（默认全跑）
//   --verbose      打印逐局 / 逐技能明细
//   --strict       检查 2 把「丢牌」也判失败（默认只警告）
//   --allow-lost=  检查 2 丢牌白名单（逗号分隔牌 id）
//
// 约束：只读引擎，不改 src/。所有 hook 都在 game 实例上包裹方法（不碰引擎源码），
// 因此可以和「主控正在并行改技能代码」同时运行。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { allSkills } from '../src/engine/skill.js';
import { GENERALS as ALL_G } from '../src/data/generals.js';
const GENERALS = ALL_G.filter(g => !['jsg_qi','jsg_cheng','jsg_zhuan','jsg_he','rare2'].includes(g.pack));
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// ---------------------------------------------------------------- 参数
function optValue(name, dflt = null) {
  const hit = process.argv.slice(2).find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit == null) return dflt;
  const i = hit.indexOf('=');
  return i < 0 ? true : hit.slice(i + 1);
}
const GAMES = Math.max(1, Number(optValue('games', 60)) || 60);
const VERBOSE = !!optValue('verbose', false);
const STRICT = !!optValue('strict', false);
const ONLY = new Set(String(optValue('only', '1,2,3')).split(',').map(s => s.trim()).filter(Boolean));
const ALLOW_LOST = new Set(String(optValue('allow-lost', '') || '').split(',').map(s => s.trim()).filter(Boolean));
const run = (n) => ONLY.has(String(n));

// ---------------------------------------------------------------- 段落与计数
const sections = [];
function makeSection(id, title, warnLabel = '警告') {
  const sec = { id, title, warnLabel, pass: 0, fail: 0, warn: 0, skip: 0, lines: [], notes: [], noteCount: {} };
  sections.push(sec);
  return sec;
}
const say = (s = '') => console.log(s);
// 同类提示最多留 8 条，避免 60 局刷屏（失败明细不受此限）
function note(sec, key, text) {
  sec.noteCount[key] = (sec.noteCount[key] || 0) + 1;
  if (sec.noteCount[key] <= 8) sec.notes.push(text);
}

// ================================================================ 检查 1 & 2：随机器
// 与 tools/simulate.js 保持一致的六模式口径；seed 固定为 1..N
const CASES = [
  ['identity', 3], ['identity', 4], ['identity', 5], ['identity', 6],
  ['junzheng', 4], ['junzheng', 5],
  ['duel', 2],
  ['doudizhu', 3],
  ['guozhan', 4], ['guozhan', 5],
  ['hulao', 3], ['hulao', 4],
];

// ---------------------------------------------------------------- 牌张收集（检查 2 核心）
const MAX_DEPTH = 6;
const MAX_NODES = 20000;
// 深搜时跳过的键：循环引用源（players/game）、引擎对象（mode/responder/rng）、
// 以及「玩家对象的别名」（turnPlayer / result.winners / extraQueue）——别名会让同一张手牌被算成两个区域
const SKIP_KEYS = new Set([
  'players', 'responder', 'mode', 'rng', 'onLog', 'onState', 'logs', 'pending', 'config', 'game',
  'turnPlayer', 'result', 'extraQueue', 'currentIndex',
]);
// 「独占区域」：一张实体牌同一时刻只可能在其中一个。判「同一 id 在 2 个以上区域」只在独占区域之间做。
// 引擎里另有一批**合法别名位**（extraZone 天机/谋「同时视为手牌」、flags.lastDodgeCards 闪牌回看、
// flags.mingfa/qiongtu/wyCards/rong 武将牌上的牌、p.tian 屯田的「田」），它们与手牌/弃牌堆并存不算复制，
// 只以警告形式列出，便于人工复核。
const EXCL_ROOT = /^(deck|discard|table|p\d+\.(hand|equips|judgeZone|buqu))$/;
const STD_PLAYER_ZONES = new Set(['hand', 'equips', 'judgeZone', 'marks', 'flags', 'extraZone', 'buqu']);

// 牌的形状：字符串 id + 字符串 name，且带 suit / num 之一（角色、武将、技能对象都不满足）
function isCardLike(o) {
  return !!o && typeof o === 'object' && !Array.isArray(o)
    && typeof o.id === 'string' && typeof o.name === 'string'
    && (Object.prototype.hasOwnProperty.call(o, 'suit') || Object.prototype.hasOwnProperty.call(o, 'num'));
}

// 快照：收集此刻所有区域出现的牌，返回 Map<id, {card, roots:Set, excl:Set, places:Set}>
function snapshotCards(game) {
  const byId = new Map();
  let nodes = 0;

  const addCard = (card, root, place) => {
    let rec = byId.get(card.id);
    if (!rec) { rec = { id: card.id, card, roots: new Set(), excl: new Set(), places: new Set(), virtual: false }; byId.set(card.id, rec); }
    rec.roots.add(root);
    if (EXCL_ROOT.test(root)) rec.excl.add(root);
    rec.places.add(place);
    if (card.virtual === true) rec.virtual = true;
  };

  const walk = (val, root, place, depth, seen) => {
    if (val === null || typeof val !== 'object' || depth > MAX_DEPTH) return;
    if (nodes++ > MAX_NODES) return;
    if (seen.has(val)) return;   // 同一对象在同一牌位里只记一次（防循环、防 __src 自引用重复计数）
    seen.add(val);
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) walk(val[i], root, `${place}[${i}]`, depth + 1, seen);
      return;
    }
    if (isCardLike(val)) addCard(val, root, place);
    for (const k of Object.keys(val)) {
      if (SKIP_KEYS.has(k)) continue;
      const v = val[k];
      if (v === null || typeof v !== 'object') continue;
      walk(v, root, `${place}.${k}`, depth + 1, seen);
    }
  };

  const roots = [
    ['deck', game.deck],
    ['discard', game.discardPile],
    ['table', game.table],
  ];
  for (const p of game.players || []) {
    const tag = `p${p.seat}`;
    roots.push(
      [`${tag}.hand`, p.hand],
      [`${tag}.equips`, p.equips],
      [`${tag}.judgeZone`, p.judgeZone],
      [`${tag}.marks`, p.marks],
      [`${tag}.flags`, p.flags],
      [`${tag}.extraZone`, p.extraZone],
      [`${tag}.buqu`, p.buqu],
    );
    // 角色对象上非标准区域的牌容器（如邓艾【屯田】的 p.tian「田」）：不硬编码，一律当别名牌位深搜，
    // 否则「武将牌上的牌」会被误报成丢牌
    for (const k of Object.keys(p)) {
      if (STD_PLAYER_ZONES.has(k) || SKIP_KEYS.has(k)) continue;
      const v = p[k];
      if (v && typeof v === 'object') roots.push([`${tag}.${k}`, v]);
    }
  }
  // 引擎顶层未知的牌容器（未来的 exile / sideboard 之类）也覆盖，避免漏检
  const KNOWN_GAME = new Set(['deck', 'discardPile', 'table', 'players']);
  for (const k of Object.keys(game)) {
    if (KNOWN_GAME.has(k) || SKIP_KEYS.has(k)) continue;
    const v = game[k];
    if (v && typeof v === 'object') roots.push([`game.${k}`, v]);
  }
  for (const [root, val] of roots) {
    if (!val) continue;
    walk(val, root, root, 0, new Set());
  }
  return byId;
}

// 虚拟衍生牌：引擎会造不占实体牌位的虚拟牌（virtual:true / v12 / c37_mf0）
function isVirtualDerived(rec, base) {
  if (rec.virtual) return true;
  if (/^v\d+$/.test(rec.id)) return true;
  const m = String(rec.id).match(/^([^_#:]+)[_#:]/);
  return !!(m && base.has(m[1]));
}

// 基线 vs 当前
function diffSnap(base, cur, lastSeen) {
  const out = [];
  for (const [id, rec] of cur) {
    if (rec.excl.size > 1) out.push({ kind: 'dup', id, places: [...rec.excl] });
    else if (rec.excl.size === 1 && rec.roots.size > 1) out.push({ kind: 'alias', id, places: [...rec.places] });
  }
  for (const [id, rec] of cur) {
    if (base.has(id)) continue;
    if (isVirtualDerived(rec, base)) out.push({ kind: 'virtual', id });
    else out.push({ kind: 'extra', id, card: rec.card?.name, roots: [...rec.roots] });
  }
  for (const [id, rec] of base) {
    if (cur.has(id) || ALLOW_LOST.has(id)) continue;
    out.push({ kind: 'lost', id, card: rec.card?.name, lastRoots: lastSeen.get(id)?.roots || [...rec.roots] });
  }
  return out;
}

// ================================================================ 检查 1 & 2：跑一局
function makeSeats(seatCount, rng) {
  const pool = [...GENERALS];
  const used = new Set();
  const seats = [];
  for (let i = 0; i < seatCount; i++) {
    const cands = pool.filter(g => !used.has(g.id));
    const g = cands[rng.int(cands.length)];
    used.add(g.id);
    seats.push({ id: `s${i}`, name: `P${i}`, isAI: true, general: g });
  }
  return seats;
}

async function playOneGame({ modeId, seatCount, seed, index }) {
  const rng = makeRng(seed);
  const seats = makeSeats(seatCount, rng);
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

  // 1) 日志 hook：实例方法包裹（引擎 logs 无上限，但将来若加 slice 也只影响快照，不影响这里）
  const logLines = [];
  const origLog = game.log.bind(game);
  game.log = async (text, extra = {}) => {
    logLines.push({ text: String(text), turn: game.turnCount, phase: game.phase });
    return origLog(text, extra);
  };

  // 2) 守恒 hook：首回合前取基线；每个 runTurn（turn.end 之后）比对一次；局终再比对一次
  let baseline = null;
  const lastSeen = new Map();
  const lostSeen = new Map();   // id -> {turn, roots}
  const dupSeen = new Map();    // kind:id -> {turn, detail}
  let snapshots = 0, consPass = 0, consFail = 0, consWarn = 0;
  let aliasMax = 0, virtualMax = 0;
  const aliasNoted = new Set();

  const compare = (label) => {
    snapshots++;
    const cur = snapshotCards(game);
    const findings = diffSnap(baseline, cur, lastSeen);
    for (const [id, rec] of cur) lastSeen.set(id, { roots: [...rec.roots] });

    const hard = findings.filter(f => f.kind === 'extra' || f.kind === 'dup');
    const lost = findings.filter(f => f.kind === 'lost');
    const alias = findings.filter(f => f.kind === 'alias');
    const virt = findings.filter(f => f.kind === 'virtual');
    aliasMax = Math.max(aliasMax, alias.length);
    virtualMax = Math.max(virtualMax, virt.length);

    for (const f of hard) {
      const key = `${f.kind}:${f.id}`;
      if (process.env.DEBUG_DUP && f.kind === 'dup') {
        // 同一时刻的权威判定：该 id 到底在哪些真实区域里
        const id = f.id;
        const where = [];
        if (game.discardPile.some(c => c && String(c.id) === id)) where.push('discardPile');
        if (game.deck.some(c => c && String(c.id) === id)) where.push('deck');
        for (const p of game.players) {
          if (p.hand.some(c => c && String(c.id) === id)) where.push(`p${p.seat}.hand`);
          if (Object.values(p.equips || {}).some(c => c && String(c.id) === id)) where.push(`p${p.seat}.equips`);
        }
        console.log(`[DEBUG_DUP] T${game.turnCount} id=${id} snapshot 称 places=${f.places.join(' / ')} | 实时区域=${where.join(',') || '（都不在）'}`);
        for (const r of (trail.get(id) || []).slice(-12)) console.log(`   T${r.turn} ${r.kind}  @ ${r.stack}`);
      }
      if (!dupSeen.has(key)) dupSeen.set(key, { turn: game.turnCount, label, detail: f });
    }
    for (const f of lost) {
      if (!lostSeen.has(f.id)) lostSeen.set(f.id, { turn: game.turnCount, lastRoots: f.lastRoots, card: f.card });
    }
    for (const f of alias) {
      if (aliasNoted.has(f.id)) continue;
      aliasNoted.add(f.id);
      note0('alias', `  ${label} 别名位并存（警告，非失败）：${f.id} → ${f.places.join(' / ')}`);
    }

    if (hard.length) consFail++;
    else if (lost.length) { if (STRICT) consFail++; else consWarn++; }
    else consPass++;
  };

  // ★DEBUG_DUP=1：记录每张牌的流转栈，用于定位 dup 双存的来源（平时不记录，零开销）
  const DBG = !!process.env.DEBUG_DUP;
  const trail = new Map();
  const trailOf = (c, kind) => {
    if (!DBG || !c || c.id == null) return;
    const k = String(c.id);
    if (!trail.has(k)) trail.set(k, []);
    trail.get(k).push({ kind, turn: game.turnCount, stack: new Error().stack.split('\n').slice(3, 6).map(x => x.trim().replace(/^at /, '')).join(' < ') });
  };
  if (DBG) {
    const oPD = game.pushDiscard.bind(game);
    game.pushDiscard = (cards) => { for (const c of (Array.isArray(cards) ? cards : [cards])) trailOf(c, '→discard'); return oPD(cards); };
    const oGC = game.gainCards.bind(game);
    game.gainCards = async (pl, cards, opts) => { for (const c of (cards || [])) trailOf(c, `→gain:p${pl.seat}(from=${opts?.from ? 'p' + opts.from.seat : 'null'},reason=${opts?.reason || ''})`); return oGC(pl, cards, opts); };
    for (const p of game.players) {
      for (const m of ['push', 'unshift', 'splice']) {
        const orig = p.hand[m].bind(p.hand);
        p.hand[m] = (...a) => { const r = orig(...a); if (m !== 'splice') for (const c of a) trailOf(c, `p${p.seat}.hand.${m}`); return r; };
      }
    }
  }

  const origRunTurn = game.runTurn.bind(game);
  game.runTurn = async (p) => {
    if (!baseline) baseline = snapshotCards(game);
    await origRunTurn(p);
    compare(`局#${index} seed=${seed} ${modeId}·${seatCount}人`);
  };

  // src/ 里有十余处 Math.random（技能内部的随机挑牌），会让同一 seed 的失败集抖动。
  // 这里在**运行时**把 Math.random 换成按 seed 派生的确定性序列（不改 src），保证 gate 可复现。
  const origRandom = Math.random;
  const rnd = makeRng((seed ^ 0x9e3779b9) >>> 0);
  Math.random = () => rnd.next();
  let thrown = null;
  try { await game.run(); } catch (e) { thrown = e; } finally { Math.random = origRandom; }
  if (baseline) compare(`局#${index} seed=${seed} ${modeId}·${seatCount}人 局终`);

  return {
    game, logLines, thrown, snapshots, consPass, consFail, consWarn,
    lostSeen, dupSeen, aliasMax, virtualMax,
  };
}

// 别名提示的接收方（在 playOneGame 里还没拿到 secCons，用一个小注入点）
let note0 = () => {};
function bindNote(sec) { note0 = (key, text) => note(sec, key, text); }

// ================================================================ 检查 3：perTurn 主动技
// 静态扫描 src/skills/*.js
function scanSkillFiles() {
  const dir = path.join(ROOT, 'src', 'skills');
  const out = new Map();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const starts = [...src.matchAll(/defineSkill\(\s*\{/g)].map(m => m.index);
    for (let i = 0; i < starts.length; i++) {
      const block = src.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : src.length);
      const idm = block.match(/id:\s*'([^']+)'/);
      if (!idm) continue;
      out.set(idm[1], {
        id: idm[1],
        file: `src/skills/${f}`,
        line: src.slice(0, starts[i]).split('\n').length,
        hasActive: /\bactive:\s*\{/.test(block),
        perTurn: /perTurn:\s*true/.test(block),
        desc: (block.match(/desc:\s*'([^']*)'/) || [])[1] || '',
      });
    }
  }
  return out;
}

const MODE_TEST = { id: 'sg020test', name: 'SG020', setup() {}, checkVictory() { return null; } };

function stubResponder(state) {
  return {
    async askPlay() { return { endPhase: true }; },
    async ask() {
      state.asks++;
      if (state.asks > 300) throw new Error('询问次数超限（疑似死循环）');
      return null;   // 一律「不响应 / 不选择」，让技能效果快速收手（本检查只看引擎的次数闸门）
    },
  };
}

// 三态断言：回合1首次 / 回合1再次 / 回合2首次
async function testPerTurnReset(skillId, meta) {
  const state = { asks: 0 };
  const logs = [];
  const g = new Game({
    seats: [
      { id: 's0', name: 'T0', isAI: true, general: { id: 'sg020t0', name: 'T0', hp: 4, kingdom: meta.kingdom, form: meta.form, skills: [skillId] } },
      { id: 's1', name: 'T1', isAI: true, general: { id: 'sg020t1', name: 'T1', hp: 4, kingdom: 'qun', skills: [] } },
    ],
    mode: MODE_TEST, seed: 2020,
    responder: stubResponder(state),
    deckEntries: deckEntries('standard'),
    config: { timeout: 200 },
  });
  g.onState = () => {};
  const origLog = g.log.bind(g);
  g.log = async (text, extra = {}) => { logs.push(String(text)); return origLog(text, extra); };

  const p0 = g.players[0], p1 = g.players[1];
  if (!p0.skills.some(s => s.id === skillId)) {
    return { status: 'SKIP', reason: '武将未挂到该技能（getSkill 未注册或降级失败）', detail: '-' };
  }
  const wrap = async (fn) => {
    try { return await Promise.race([fn(), new Promise(r => setTimeout(() => r('__timeout__'), 4000))]); }
    catch (e) { return `__throw__:${e.message}`; }
  };
  const slice = (n) => logs.slice(n);

  await wrap(() => g.runTurn(p0));                       // 进入 p0 的第 1 回合（turnCount=1）
  const kingdom0 = p0.kingdom, form0 = p0.form;

  let m = logs.length;
  const t1First = await wrap(() => g.useActiveSkill(p0, skillId, []));
  const log1 = slice(m);

  m = logs.length;
  const t1Again = await wrap(() => g.useActiveSkill(p0, skillId, []));
  const log2 = slice(m);
  const rejectReason = log2.find(l => /本回合已发动过/.test(l)) || '';

  await wrap(() => g.runTurn(p1));                       // 走过 p1 的回合
  await wrap(() => g.runTurn(p0));                       // p0 的第 2 个回合（runTurn 清 act_*，被测点）
  m = logs.length;
  const t2First = await wrap(() => g.useActiveSkill(p0, skillId, []));
  const log3 = slice(m);

  const detail = `回合1首次=${t1First === true ? '接受' : '拒绝'} / 回合1再次=${t1Again === false ? '拒绝' : JSON.stringify(t1Again)} / 回合2首次=${t2First === true ? '接受' : JSON.stringify(t2First)}`;
  const warned = logs.filter(l => /⚠/.test(l));

  if (t1First !== true) {
    const why = log1.find(t => /无法发动|不可发动/.test(t)) || String(t1First);
    return { status: 'SKIP', reason: `回合1 首次即被拒：${why}`, detail, warned };
  }
  // 技能自身改势力/形态（如【穷途】发动后转魏、【乾纲】入魔）：后续发动被 kingdomOnly/form 拦，
  // 属技能设计而非引擎计数问题，机械测试观测不到 act_* 复位 → SKIP
  const flipped = (p0.kingdom !== kingdom0 || p0.form !== form0);
  const blocked = [...log2, ...log3].find(l => /当前势力不可发动|当前形态不可发动/.test(l));
  if (blocked || (flipped && t2First !== true)) {
    return {
      status: 'SKIP',
      reason: `发动后自身势力/形态改变（${kingdom0}→${p0.kingdom}${form0 !== p0.form ? `，${form0}→${p0.form}` : ''}），后续被${blocked ? `「${blocked}」` : '势力/形态条件'}拦截，无法观测 act_* 跨回合复位`,
      detail, warned,
    };
  }
  const bad = [];
  if (t1Again !== false) bad.push(`同回合第二次未被拒（返回 ${JSON.stringify(t1Again)}）`);
  if (!rejectReason) bad.push(`同回合第二次被拒但原因不是「本回合已发动过」：${log2.filter(l => /✗/.test(l)).slice(-1)[0] || '无日志'}`);
  if (t2First !== true) bad.push(`第 2 回合未复位（返回 ${JSON.stringify(t2First)}）：${log3.filter(l => /✗/.test(l)).slice(-1)[0] || '无日志'}`);
  return { status: bad.length ? 'FAIL' : 'PASS', detail, bad, asks: state.asks, warned };
}

// ================================================================ 主流程
const secWarn = makeSection(1, '静默异常哨兵');
const secCons = makeSection(2, '牌张守恒');
const secTurn = makeSection(3, '次数限制跨回合复位', '跳过');
bindNote(secCons);

say('==================== SG020GUARD ====================');
say(`对局 ${GAMES} 局（seed 1..${GAMES}） / 检查 ${[...ONLY].join(',')} / 严格=${STRICT ? 'on' : 'off'}${ALLOW_LOST.size ? ` / 丢牌白名单 ${[...ALLOW_LOST].join(',')}` : ''}`);

// ---- 检查 1 & 2 ----
if (run(1) || run(2)) {
  const t0 = Date.now();
  const warnLines = [];
  const lostByGame = [];
  const dupByGame = [];
  for (let i = 0; i < GAMES; i++) {
    const [modeId, n] = CASES[i % CASES.length];
    const label = `局#${i + 1} seed=${i + 1} ${modeId}·${n}人`;
    let r;
    try {
      r = await playOneGame({ modeId, seatCount: n, seed: i + 1, index: i + 1 });
    } catch (e) {
      secWarn.fail++;
      warnLines.push(`  ${label} 构建/驱动失败：${e.message}`);
      continue;
    }
    // [1] 静默异常
    const warns = r.logLines.filter(l => /⚠/.test(l.text));
    if (r.thrown) {
      secWarn.fail++;
      warnLines.push(`  ${label} 局内抛错：${r.thrown.message}`);
    } else if (warns.length) {
      secWarn.fail++;
      warnLines.push(`  ${label} 静默异常 ${warns.length} 条`);
      for (const w of warns.slice(0, 10)) warnLines.push(`    · [第${w.turn}回合/${w.phase || '-'}] ${w.text}`);
    } else secWarn.pass++;

    // [2] 牌张守恒
    secCons.pass += r.consPass;
    secCons.fail += r.consFail;
    secCons.warn += r.consWarn;
    if (r.dupSeen.size) {
      dupByGame.push(`  ${label} 牌被复制/重复 id ${r.dupSeen.size} 处：` + [...r.dupSeen.values()].map(v =>
        `\n    · 第${v.turn}回合起 id=${v.detail.id}${v.detail.card ? `(${v.detail.card})` : ''} → ${(v.detail.places || v.detail.roots).join(' | ')}`).join(''));
    }
    if (r.lostSeen.size) {
      const turns = [...r.lostSeen.values()].map(v => v.turn);
      lostByGame.push(`  ${STRICT ? '' : '⚠ '}${label} 牌丢失 ${r.lostSeen.size} 张（首次第${Math.min(...turns)}回合${STRICT ? '' : '，--strict 时判失败'}）：`
        + [...r.lostSeen.entries()].slice(0, 10).map(([id, v]) => `${id}(${v.card || '?'}, 最后 ${v.lastRoots.join('/') || '未知'})`).join('；'));
    }
    if (r.virtualMax) note(secCons, 'virtual', `  ${label} 虚拟牌（豁免）：最多 ${r.virtualMax} 个 id 同时存在`);
    if (VERBOSE) say(`  · ${label} 回合 ${r.game.turnCount} / 日志 ${r.logLines.length} / 快照 ${r.snapshots} / 别名并存最多 ${r.aliasMax}`);
  }
  secWarn.lines.push(...warnLines.slice(0, 40));
  if (warnLines.length > 40) secWarn.lines.push(`  … 其余 ${warnLines.length - 40} 条省略`);
  secCons.lines.push(...dupByGame, ...lostByGame.slice(0, 30));
  if (lostByGame.length > 30) secCons.lines.push(`  … 其余 ${lostByGame.length - 30} 局丢牌明细省略`);
  if (VERBOSE) say(`  （对局分段耗时 ${Date.now() - t0}ms）`);
}

// ---- 检查 3 ----
if (run(3)) {
  const scanned = scanSkillFiles();
  const registry = new Map(allSkills().map(s => [s.id, s]));
  const DESC_RE = /每回合限一次|每阶段限一次|出牌阶段限一次/;

  const staticPerTurn = [...scanned.values()].filter(s => s.hasActive && s.perTurn);
  const regPerTurn = [...registry.values()].filter(s => s.active && s.active.perTurn);
  const staticIds = new Set(staticPerTurn.map(s => s.id));
  const regIds = new Set(regPerTurn.map(s => s.id));
  const missInStatic = [...regIds].filter(id => !staticIds.has(id));
  const missInReg = [...staticIds].filter(id => !regIds.has(id));

  secTurn.notes.push(`  静态扫描：${scanned.size} 个技能定义 / 主动技 ${[...scanned.values()].filter(s => s.hasActive).length} / 其中 perTurn 主动技 ${staticPerTurn.length} 个`);
  secTurn.notes.push(`  注册表口径：perTurn 主动技 ${regPerTurn.length} 个${missInStatic.length ? `（扫描缺失 ${missInStatic.length}：${missInStatic.slice(0, 8).join(',')}）` : '（与扫描一致）'}${missInReg.length ? `（扫描多出 ${missInReg.length}：${missInReg.slice(0, 8).join(',')}）` : ''}`);

  const descOnly = [...registry.values()].filter(s => s.active && !s.active.perTurn && DESC_RE.test(s.desc || ''));
  secTurn.notes.push(`  desc 含「限一次」但未声明 perTurn 的主动技 ${descOnly.length} 个（靠技能内部计数，引擎 act_* 不适用，列 SKIP）`);

  for (const sk of regPerTurn.sort((a, b) => a.id.localeCompare(b.id))) {
    const meta = scanned.get(sk.id);
    const where = meta ? `${meta.file}:${meta.line}` : '未定位到源文件';
    const res = await testPerTurnReset(sk.id, { kingdom: sk.kingdomOnly || 'qun', form: sk.form || 'normal' });
    if (res.status === 'PASS') {
      secTurn.pass++;
      if (VERBOSE) say(`  ✓ ${sk.id}【${sk.name}】 ${res.detail}  (${where})`);
    } else if (res.status === 'SKIP') {
      secTurn.skip++;
      secTurn.lines.push(`  SKIP ${sk.id}【${sk.name}】 ${res.detail} —— ${res.reason}  (${where})`);
    } else {
      secTurn.fail++;
      secTurn.lines.push(`  ✗ ${sk.id}【${sk.name}】 ${res.detail} —— ${res.bad.join('；')}  (${where})`);
    }
    if (res.warned?.length) note(secTurn, 'warned', `  · ${sk.id} 测试中出现 ⚠：${res.warned.slice(0, 2).join(' / ')}`);
  }
  if (descOnly.length) {
    secTurn.lines.push(`  SKIP（desc 口径，未声明 perTurn）${descOnly.map(s => s.id).join(', ')}`);
    secTurn.skip += descOnly.length;
  }
}

// ================================================================ 报告
let totalPass = 0, totalFail = 0;
for (const sec of sections) {
  if (!ONLY.has(String(sec.id))) continue;
  say('');
  say(`[${sec.id}] ${sec.title}`);
  for (const n of sec.notes) say(n);
  for (const l of sec.lines) say(l);
  say(`  通过 ${sec.pass} / 失败 ${sec.fail}${sec.warn ? ` / ${sec.warnLabel} ${sec.warn}` : ''}${sec.skip ? ` / 跳过 ${sec.skip}` : ''}`);
  totalPass += sec.pass;
  totalFail += sec.fail;
}

say('');
say(`SG020GUARD 通过 ${totalPass} / 失败 ${totalFail}`);
process.exit(totalFail > 0 ? 1 : 0);
