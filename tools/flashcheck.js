// 阶段 2B 守门测试：OL「闪」系列（闪赵云 / 闪孙坚）
// 运行：node tools/flashcheck.js
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261130,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}

// ================= 1. 数据与注册 =================
for (const [id, name, kingdom, hp, skills] of [
  ['flash_zhaoyun', '闪赵云', 'shu', 4, ['longlin', 'zhendan']],
  ['flash_sunjian', '闪孙坚', 'qun', 4, ['pingtao', 'juelie']],
]) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符`);
  ok(gd && gd.pack === 'flash', `${id} pack 应为 flash`);
  ok(gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
  }
}
ok(PACK_CN.flash === 'OL·闪', `PACK_CN.flash 不符：${PACK_CN.flash}`);
ok(GENERALS.filter(g => g.pack === 'flash').length === 6, `闪包将数应为 6（含闪朱儁，2026-10-26 补全；实际 ${GENERALS.filter(g => g.pack === 'flash').length}）`);

// ================= 4. 闪赵云 · 镇胆（转化）=================
{
  const g = mk(['flash_zhaoyun', 'sunquan'], () => null);
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 1;
  const trick = card('zd1', 'guohe', 'spade', 3);
  const basic = card('zd2', 'sha', 'heart', 4);
  p.hand = [trick, basic];
  ok(g.virtualAllowed(p, [trick], 'tao') === true, '镇胆：非基本牌应可当本轮未使用过的【桃】');
  ok(g.virtualAllowed(p, [basic], 'tao') === false, '镇胆：基本牌不能转化');
  ok(g.virtualAllowed(p, [trick, basic], 'tao') === false, '镇胆：必须是单张');
  p.flags.zhendanUsed = { '0:tao': true };
  ok(g.virtualAllowed(p, [trick], 'tao') === false, '镇胆：本轮已使用过该基本牌则不可转化');
  ok(g.virtualAllowed(p, [trick], 'sha') === true, '镇胆：其他未使用的基本牌仍可转化');
}

// ================= 3. 闪赵云 · 镇胆（摸牌）=================
{
  const g = mk(['flash_zhaoyun', 'sunquan', 'liubei'], () => null);
  const p = g.players[0];
  g.turnPlayer = g.players[1]; g.turnCount = 2;
  const n0 = p.hand.length;
  await g.trigger('damage.after', { self: p, to: p, from: g.players[1], amount: 1 });
  ok(p.hand.length > n0, `镇胆：受伤后应摸牌（${n0} → ${p.hand.length}）`);
  ok(g.logs.some(l => /镇胆/.test(l.text)), '镇胆：缺少日志');
  const n1 = p.hand.length;
  await g.trigger('damage.after', { self: p, to: p, from: g.players[1], amount: 1 });
  ok(p.hand.length === n1, '镇胆：本轮已失效后不应再摸牌');
}

// ================= 4. 闪赵云 · 龙临 =================
{
  let confirmed = 0;
  const g = mk(['flash_zhaoyun', 'sunquan', 'liubei'], (gg, p, req) => {
    // 第一次 confirm = 是否发动【龙临】（是）；后续 confirm = 是否视为使用【决斗】（否）
    if (req.kind === 'confirm') return { yes: confirmed++ === 0 };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const zy = g.players[0], atk = g.players[1];
  g.turnPlayer = atk; g.turnCount = 3; g.phase = 'play';
  zy.hand = [card('ll1', 'sha', 'spade', 3)];
  atk.hand = [card('ll2', 'sha', 'heart', 5)];
  atk.flags.shaUsed = 1;
  const d = { self: atk, target: zy, card: atk.hand[0], used: [], shaCtx: {} };
  await g.trigger('target.before', d);
  ok(d.canceled === true, '龙临：应令此【杀】无效');
  ok(zy.hand.length === 0, '龙临：应弃置一张牌');
  ok(g.logs.some(l => /龙临/.test(l.text)), '龙临：缺少日志');
  const g2 = mk(['flash_zhaoyun', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const zy2 = g2.players[0], atk2 = g2.players[1];
  g2.turnPlayer = atk2; g2.turnCount = 3; g2.phase = 'play';
  zy2.hand = [card('ll3', 'sha', 'spade', 3)];
  atk2.flags.shaUsed = 2;
  const d2 = { self: atk2, target: zy2, card: card('ll4', 'sha', 'heart', 6), used: [], shaCtx: {} };
  await g2.trigger('target.before', d2);
  ok(!d2.canceled, '龙临：非本回合第一张【杀】不应触发');
  const d3 = { self: atk2, target: zy2, card: card('ll5', 'sha', 'heart', 7), used: [], shaCtx: {} };
  atk2.flags.shaUsed = 1; g2.phase = 'discard';
  await g2.trigger('target.before', d3);
  ok(!d3.canceled, '龙临：非出牌阶段不应触发');
}

// ================= 5. 闪孙坚 · 平讨（交牌分支）=================
{
  const g = mk(['flash_sunjian', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const sj = g.players[0], t = g.players[1];
  g.turnPlayer = sj; g.turnCount = 4; g.phase = 'play';
  sj.hand = [];
  t.hand = [card('pt1', 'sha', 'spade', 2), card('pt2', 'shan', 'heart', 3)];
  await g.useActiveSkill(sj, 'pingtao');
  ok(sj.hand.length === 1, `平讨：应交给你一张牌（实际 ${sj.hand.length}）`);
  ok(sj.flags.extraShaTarget === 4, `平讨：本回合下一张【杀】可多指定一个目标（实际 ${sj.flags.extraShaTarget}）`);
  ok(g.logs.some(l => /平讨/.test(l.text)), '平讨：缺少日志');
}

// ================= 6. 闪孙坚 · 平讨（视为被杀分支）=================
{
  const g = mk(['flash_sunjian', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 1 };
    if (req.kind === 'card') return null;
    return null;
  });
  const sj = g.players[0], t = g.players[1];
  g.turnPlayer = sj; g.turnCount = 5; g.phase = 'play';
  sj.hand = [card('pt3', 'sha', 'club', 6)];
  t.hand = [card('pt4', 'sha', 'heart', 2)];
  const hp0 = t.hp;
  await g.useActiveSkill(sj, 'pingtao');
  ok(t.hp < hp0, `平讨：未交牌应视为被使用一张【杀】（${hp0} → ${t.hp}）`);
}

// ================= 7. 闪孙坚 · 绝烈 =================
{
  const g = mk(['flash_sunjian', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, req.max || req.min || 1) };
    return null;
  });
  const sj = g.players[0], t = g.players[1];
  g.turnPlayer = sj; g.turnCount = 6; g.phase = 'play';
  sj.hp = 2;
  sj.hand = [1, 2, 3].map(i => card('jl' + i, 'sha', 'spade', i));
  t.hand = [1, 2].map(i => card('jlt' + i, 'shan', 'heart', i));
  const sjN = sj.hand.length, tN = t.hand.length;
  await g.trigger('target.after', { self: sj, target: t, card: card('jlc', 'sha', 'club', 7), used: [], shaCtx: {} });
  ok(sj.hand.length < sjN, `绝烈：应弃置自己若干牌（${sjN} → ${sj.hand.length}）`);
  ok(t.hand.length < tN, `绝烈：目标应共弃等量牌（${tN} → ${t.hand.length}）`);
  ok(sj.flags.juelieTurn === 6, '绝烈：应记录本回合发动');
  const hit = { self: sj, target: t, card: card('jlc', 'sha', 'club', 7), amount: 1 };
  sj.hp = Math.min(...g.alive().map(x => x.hp));
  await g.trigger('sha.hit', hit);
  ok(hit.amount === 2, `绝烈：体力最少时伤害应 +1（实际 ${hit.amount}）`);
  sj.maxHp = 4; sj.hand = [];
  await g.trigger('death.after', { self: t, from: sj, player: sj });
  ok(sj.hand.length === 4, `绝烈：击杀后应摸至体力上限 4（实际 ${sj.hand.length}）`);
}

// ================= 汇总 =================
console.log(`\n=== flashcheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
