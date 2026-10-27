// 阶段 6B · 谋·增补 6 将（pack = 'mou5'）守门测试
// 运行：node tools/mou5check.js
// 说明：本批次按任务约束「只新增 6 个文件」，不改 src/data/generals.js 与 src/skills/index.js，
//       故测试直接 import 自己的技能/数据文件，并在运行时把 MOU5_GENERALS 注入 GENERALS 注册表。
import '../src/skills/mou5.js';
import { MOU5_GENERALS } from '../src/data/mou5.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

// —— 运行时注册（主控合入 generals.js 后此段变成幂等空操作）
for (const gd of MOU5_GENERALS) {
  if (!generalById(gd.id)) GENERALS.push(gd);
}

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261126,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
const H = (over = {}) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: over.yes !== false };
  if (req.kind === 'targets') return { seats: (over.seats || [1]).slice(0, req.max || 1) };
  if (req.kind === 'choice') return { index: over.index !== undefined ? over.index : 0 };
  if (req.kind === 'card') {
    if (over.cardId) return { cardId: over.cardId };
    const c = p.hand[0];
    return { cardId: (c || {}).id };
  }
  if (req.kind === 'discard') return { cardIds: (req.cards || []).slice(0, over.min || 1) };
  return null;
};
const Hfirst = (over = {}) => (g, p, req) => {
  // 目标选择一律取「第一个合法候选」，用于需要多次指定不同角色的技能
  if (req.kind === 'targets') { const t = (req.targets || [])[0]; return { seats: t === undefined ? [] : [t] }; }
  return H(over)(g, p, req);
};
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));
const noErr = (g) => !g.logs.some(l => l.text.includes('执行异常'));

// ================= 1. 数据注册 =================
const EXPECT = [
  ['mou5_simayi', '谋司马懿', 'wei', 3, ['m5_quanmou', 'm5_pingliao']],
  ['mou5_xiahoudun', '谋夏侯惇', 'wei', 4, ['m5_ganglie', 'm5_qingjian']],
  ['mou5_xusheng', '谋徐盛', 'wu', 4, ['m5_pojun', 'm5_yicheng']],
  ['mou5_ganning', '谋甘宁', 'wu', 4, ['m5_qixi', 'm5_fenwei']],
  ['mou5_zhangjiao', '谋张角', 'qun', 3, ['m5_leiji', 'm5_guidao']],
  ['mou5_dongzhuo', '谋董卓', 'qun', 8, ['m5_xiongni', 'm5_fengshang']],
];
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 数据缺失`);
  if (!gd) continue;
  ok(gd.name === name, `${id} 名称不符：${gd.name}`);
  ok(gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符：${gd.kingdom}/${gd.hp}`);
  ok(gd.pack === 'mou', `${id} pack 应为 mou（阶段6 已合入原包），实际 ${gd.pack}`);
  ok(Array.isArray(gd.skills) && gd.skills.length === skills.length, `${id} 技能数量不符：${gd.skills}`);
  for (const s of skills) {
    ok(gd.skills.includes(s), `${id} 技能列表缺少 ${s}`);
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && sk.name && sk.desc && sk.desc.length > 8, `技能 ${s} 缺少 name/desc`);
  }
}
ok(MOU5_GENERALS.length === 6, `MOU5_GENERALS 应为 6 位，实际 ${MOU5_GENERALS.length}`);
ok(GENERALS.filter(g => g.pack === 'mou').length === 16, `mou 包将数应为 16（合并后），实际 ${GENERALS.filter(g => g.pack === 'mou5').length}`);
const ALL_SK = EXPECT.flatMap(x => x[4]);
ok(new Set(ALL_SK).size === ALL_SK.length, '技能 id 存在重复');
for (const sk of ALL_SK) {
  ok(sk.startsWith('m5_'), `技能 id ${sk} 应使用 m5_ 前缀`);
  ok(!/^(jie_|mou_|ji_|shen_|sp_|ol_|bc_)/.test(sk), `技能 id ${sk} 使用了禁用前缀`);
  const base = sk.replace(/^m5_/, '');
  ok(!hasSkill(base), `技能 ${sk} 去掉 m5_ 后与既有技能 ${base} 冲突`);
}
for (const [id] of EXPECT) ok(GENERALS.filter(g => g.id === id).length === 1, `武将 id ${id} 重复注册`);
const packCnReady = PACK_CN.mou5 === '谋·增补';

// ================= 2. 主动技按钮可见性 =================
{
  const ACTIVES = {
    mou5_simayi: ['m5_quanmou'], mou5_xiahoudun: ['m5_ganglie'],
    mou5_ganning: ['m5_qixi', 'm5_fenwei'], mou5_zhangjiao: ['m5_leiji'],
    mou5_dongzhuo: ['m5_fengshang'],
  };
  for (const [id, list] of Object.entries(ACTIVES)) {
    const g = mk([id, 'caocao']);
    const p = g.players[0];
    g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
    const names = g.activeSkillsOf(p).map(s => s.id);
    for (const s of list) ok(names.includes(s), `${id} 的主动技 ${s} 未出现在 activeSkillsOf 中（${names.join(',')}）`);
  }
  // 谋徐盛 无主动技
  const g2 = mk(['mou5_xusheng', 'caocao']);
  const p2 = g2.players[0];
  g2.turnPlayer = p2; g2.turnCount = 2; g2.phase = 'play';
  const own = g2.activeSkillsOf(p2).filter(s => generalById('mou5_xusheng').skills.includes(s.id));
  ok(own.length === 0, `谋徐盛 不应有主动技按钮：${own.map(s => s.id).join(',')}`);
}

// ================= 3. 谋司马懿 · 权谋 / 平辽 =================
{
  const g = mk(['mou5_simayi', 'caocao', 'liubei'], Hfirst({}));
  const p = g.players[0], a = g.players[1], b = g.players[2];
  g.turnPlayer = p; g.turnCount = 3; g.phase = 'play';
  a.hand = [card('q1', 'sha'), card('q2', 'shan')];
  b.hand = [card('q3', 'sha')];
  const ph = p.hand.length;
  await g.useActiveSkill(p, 'm5_quanmou');
  ok(hasLog(g, '权谋'), '权谋：缺少战报');
  ok(noErr(g), '权谋：技能执行异常');
  ok(p.hand.length === ph + 1, `权谋：应获得目标一张牌（${ph} → ${p.hand.length}）`);
  ok((p.flags.m5QmYangSeats || []).includes(a.seat) && p.flags.m5QmYin === true, `权谋：首次应为「阳」并转为「阴」（${(p.flags.m5QmYangSeats || []).join(',')}/${p.flags.m5QmYin}）`);
  // 阳：防止本阶段下次对其造成的伤害
  const dm = { self: a, to: a, from: p, amount: 1, nature: 'normal', reason: 'test', canceled: false };
  await g.trigger('damage.before', dm);
  ok(dm.canceled === true, '权谋·阳：应防止对目标的下次伤害');
  ok(hasLog(g, '权谋】·阳'), '权谋·阳：缺少战报');
  // 阴：本阶段下次对其造成伤害后可波及至多三名其他角色
  await g.useActiveSkill(p, 'm5_quanmou');   // 本次为「阴」，目标按 seats[1]
  ok((p.flags.m5QmYinSeats || []).length > 0, `权谋：第二次应为「阴」（${(p.flags.m5QmYinSeats || []).join(',')}）`);
  const victim = g.players[p.flags.m5QmYinSeats[0]];
  const other = g.alive().find(x => x !== p && x !== victim);
  const hpO = other.hp;
  await g.trigger('damage.after', { self: victim, to: victim, from: p, amount: 1, nature: 'normal', reason: 'test' });
  ok(other.hp === hpO - 1, `权谋·阴：应波及至多三名其他角色（${hpO} → ${other.hp}）`);
  // 反例：同一角色本阶段不能再被权谋指定
  const g2 = mk(['mou5_simayi', 'caocao'], H({ seats: [1] }));
  const p2 = g2.players[0], t2 = g2.players[1];
  g2.turnPlayer = p2; g2.turnCount = 4; g2.phase = 'play';
  t2.hand = [card('q4', 'sha'), card('q5', 'shan')];
  await g2.useActiveSkill(p2, 'm5_quanmou');
  await g2.useActiveSkill(p2, 'm5_quanmou');
  ok(hasLog(g2, '没有本阶段未交出过牌的其他角色'), '权谋：每名角色每阶段限一次');

  // 平辽：攻击范围内其他角色打出红色基本牌 → 摸牌 + 本阶段【杀】次数 +1
  const g3 = mk(['mou5_simayi', 'caocao', 'liubei'], H({ seats: [1], cardId: 'r1' }));
  const q = g3.players[0], w = g3.players[1], v = g3.players[2];
  g3.turnPlayer = q; g3.turnCount = 5; g3.phase = 'play';
  w.hand = [card('r1', 'sha', 'heart'), card('r2', 'shan')];
  q.hand = [];
  const td = { self: q, target: v, card: card('r3', 'sha'), canceled: false, used: [], shaCtx: {} };
  await g3.trigger('target.after', td);
  ok(hasLog(g3, '平辽'), '平辽：缺少战报');
  ok(q.hand.length >= 1, `平辽：有人打出红色基本牌应摸牌（${q.hand.length}）`);
  ok(q.flags.shaExtraTurn === 1, `平辽：应令本阶段【杀】次数 +1（${q.flags.shaExtraTurn}，本阶段类 → shaExtraTurn）`);
  // 反例：无人打出 → 目标本回合不能使用或打出手牌
  const g4 = mk(['mou5_simayi', 'caocao'], H({ seats: [1] }));
  const z = g4.players[0], tz = g4.players[1];
  g4.turnPlayer = z; g4.turnCount = 6; g4.phase = 'play';
  z.hand = []; tz.hand = [card('r4', 'tao', 'heart')];
  const td2 = { self: z, target: tz, card: card('r5', 'sha'), canceled: false, used: [], shaCtx: {} };
  await g4.trigger('target.after', td2);
  ok(tz.flags.xiongluanBan === 6, `平辽：无人打出时目标本回合不能使用或打出手牌（${tz.flags.xiongluanBan}）`);
}

// ================= 4. 谋夏侯惇 · 刚烈 / 清俭 =================
{
  const g = mk(['mou5_xiahoudun', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 7;
  await g.trigger('damage.after', { self: p, to: p, from: t, amount: 1, nature: 'normal', reason: 'test' });
  ok((p.flags.m5HurtBy || []).includes(t.id), `刚烈：应记录本局伤害来源（${p.flags.m5HurtBy}）`);
  g.turnPlayer = p; g.phase = 'play';
  const thp = t.hp;
  await g.useActiveSkill(p, 'm5_ganglie');
  ok(hasLog(g, '刚烈'), '刚烈：缺少战报');
  ok(noErr(g), '刚烈：技能执行异常');
  ok(t.hp === thp - 2, `刚烈：应对其造成 2 点伤害（${thp} → ${t.hp}）`);
  ok((p.flags.m5GlDone || []).includes(t.id), '刚烈：应记录该角色本局已被报复');
  // 反例：同一回合内不能再发动（perTurn）
  await g.useActiveSkill(p, 'm5_ganglie');
  ok(hasLog(g, '本回合已发动过'), '刚烈：同一回合内不应重复发动');
  // 反例：换回合后同一角色本局不可重复报复
  g.turnCount = 8;
  await g.useActiveSkill(p, 'm5_ganglie');
  ok(hasLog(g, '没有可报复的角色'), '刚烈：同一角色本局不应重复报复');

  // 清俭：不因使用进入弃牌堆的牌置于武将牌上，出牌阶段结束分配
  const g2 = mk(['mou5_xiahoudun', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0], o = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 8; g2.phase = 'play';
  q.hp = 4;
  const c1 = card('s1', 'sha');
  await g2.trigger('cards.discard', { self: q, cards: [c1], reason: 'discard' });
  ok((q.flags.m5Qj || []).length === 1, `清俭：应记录 1 张「清俭」牌（${(q.flags.m5Qj || []).length}）`);
  ok(c1.__m5Qj === true && hasLog(g2, '清俭'), '清俭：应打上标记并有战报');
  g2.discardPile.push(c1);
  await g2.trigger('phase.end', { self: q, phase: 'play' });
  ok((q.flags.m5Qj || []).length === 0, '清俭：出牌阶段结束应清空「清俭」牌');
  ok(o.hand.some(c => c.id === 's1'), '清俭：应把「清俭」牌分配给目标角色');
  // 反例：因使用进入弃牌堆的牌不记录
  const c2 = card('s2', 'sha');
  await g2.trigger('cards.discard', { self: q, cards: [c2], reason: 'play' });
  ok((q.flags.m5Qj || []).length === 0, '清俭：因使用进入弃牌堆的牌不应记录');
  // 反例：上限 = 体力值 - 1
  const g3 = mk(['mou5_xiahoudun', 'caocao'], H({}));
  const r = g3.players[0];
  r.hp = 2;
  r.flags.m5Qj = [];
  for (let i = 0; i < 4; i++) {
    await g3.trigger('cards.discard', { self: r, cards: [card(`t${i}`, 'sha')], reason: 'discard' });
  }
  ok((r.flags.m5Qj || []).length === 1, `清俭：体力 2 时上限应为 1 张（${(r.flags.m5Qj || []).length}）`);
}

// ================= 5. 谋徐盛 · 破军 / 疑城 =================
{
  const g = mk(['mou5_xusheng', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 9; g.phase = 'play';
  t.hand = [card('p1', 'sha'), card('p2', 'shan'), card('p3', 'tao')];
  const th = t.hand.length;
  const td = { self: p, target: t, card: card('p4', 'sha'), canceled: false, used: [], shaCtx: {} };
  await g.trigger('target.after', td);
  ok(hasLog(g, '破军'), '破军：缺少战报');
  ok(noErr(g), '破军：技能执行异常');
  const kou = (t.flags.m5Kou || []).length;
  ok(kou >= 1 && t.hand.length === th - kou,
    `破军：应扣置目标至多体力值张牌（扣置 ${kou}，手牌 ${th} → ${t.hand.length}）`);
  ok(kou <= t.hp, `破军：扣置张数不应超过其体力值（${kou} > ${t.hp}）`);
  await g.trigger('turn.end', { self: p });
  ok((t.flags.m5Kou || []).length === 0 && t.hand.length === th, `破军：回合结束应归还（${t.hand.length}）`);
  // 伤害 +1：目标没有手牌
  t.hand = [];
  const dm = { self: t, to: t, from: p, amount: 1, nature: 'normal', card: card('p5', 'sha'), reason: 'sha', canceled: false };
  await g.trigger('damage.before', dm);
  ok(dm.amount === 2, `破军：目标没有手牌时伤害应 +1（${dm.amount}）`);
  // 反例：目标有手牌且装备更多 → 不增伤
  t.hand = [card('p6', 'sha'), card('p7', 'sha')];
  p.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
  t.equips.armor = card('p8', 'bagua');
  const dm2 = { self: t, to: t, from: p, amount: 1, nature: 'normal', card: card('p9', 'sha'), reason: 'sha', canceled: false };
  await g.trigger('damage.before', dm2);
  ok(dm2.amount === 1, `破军：有手牌且装备更多时不应增伤（${dm2.amount}）`);

  // 疑城：本回合未使用【杀】→ 结束阶段二选一
  const g2 = mk(['mou5_xusheng', 'caocao'], H({ index: 1 }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 10;
  q.hand = [];
  await g2.trigger('phase.begin', { self: q, phase: 'end' });
  ok(q.hand.length === 2, `疑城：选「摸两张牌」应摸两张（${q.hand.length}）`);
  ok(hasLog(g2, '疑城'), '疑城：缺少战报');
  // 选项①：视为使用一张【杀】
  const g3 = mk(['mou5_xusheng', 'caocao'], H({ index: 0, seats: [1] }));
  const r = g3.players[0], s = g3.players[1];
  g3.turnPlayer = r; g3.turnCount = 11;
  r.hand = []; s.hand = [card('y1', 'shan'), card('y2', 'shan')];
  await g3.trigger('phase.begin', { self: r, phase: 'end' });
  ok(hasLog(g3, '视为对') || s.hp < s.maxHp, '疑城：选项①应视为使用一张【杀】');
  // 反例：本回合已使用过【杀】则不发动
  const g4 = mk(['mou5_xusheng', 'caocao'], H({ index: 1 }));
  const u = g4.players[0];
  g4.turnPlayer = u; g4.turnCount = 12;
  u.hand = [];
  await g4.trigger('card.use.after', { self: u, card: card('y3', 'sha'), effName: 'sha', targets: [], reason: 'play' });
  ok(u.flags.m5ShaUsed === 12, `疑城：应记录本回合使用过【杀】（${u.flags.m5ShaUsed}）`);
  await g4.trigger('phase.begin', { self: u, phase: 'end' });
  ok(u.hand.length === 0 && !hasLog(g4, '疑城'), '疑城：已使用过【杀】不应发动');
}

// ================= 6. 谋甘宁 · 奇袭 / 奋威 =================
{
  // 猜对 → 展示手牌，不弃牌
  const g = mk(['mou5_ganning', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 13; g.phase = 'play';
  p.hand = [card('g1', 'sha', 'spade'), card('g2', 'shan', 'spade'), card('g3', 'tao', 'heart')];
  t.hand = [card('g4', 'sha'), card('g5', 'shan')];
  const th = t.hand.length;
  await g.useActiveSkill(p, 'm5_qixi');
  ok(hasLog(g, '奇袭'), '奇袭：缺少战报');
  ok(noErr(g), '奇袭：技能执行异常');
  ok(hasLog(g, '猜对'), '奇袭：猜对应有战报');
  ok(t.hand.length === th, `奇袭：猜对时不应弃置其牌（${th} → ${t.hand.length}）`);
  ok(hasLog(g, '展示所有手牌'), '奇袭：全部猜对应展示手牌');
  // 猜错 → 弃置其一张牌
  const g2 = mk(['mou5_ganning', 'caocao'], H({ seats: [1], index: 1 }));
  const q = g2.players[0], w = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 14; g2.phase = 'play';
  q.hand = [card('g6', 'sha', 'spade'), card('g7', 'shan', 'spade')];
  w.hand = [card('g8', 'sha'), card('g9', 'shan'), card('g10', 'tao')];
  await g2.useActiveSkill(q, 'm5_qixi');
  ok(hasLog(g2, '猜错'), '奇袭：猜错应有战报');
  ok(w.hand.length <= 2, `奇袭：猜错应弃置其区域内一张牌（3 → ${w.hand.length}）`);
  // 反例：没有手牌
  const g3 = mk(['mou5_ganning', 'caocao'], H({ seats: [1] }));
  const e = g3.players[0];
  g3.turnPlayer = e; g3.turnCount = 15; g3.phase = 'play';
  e.hand = [];
  await g3.useActiveSkill(e, 'm5_qixi');
  ok(hasLog(g3, '你没有手牌'), '奇袭：无手牌应有提示');

  // 奋威（限定技）：置「威」并摸等量牌
  const g4 = mk(['mou5_ganning', 'caocao', 'liubei'], H({ seats: [1], index: 1 }));
  const a = g4.players[0], b = g4.players[1];
  g4.turnPlayer = a; g4.turnCount = 16; g4.phase = 'play';
  a.hand = [card('f1', 'sha'), card('f2', 'shan')];
  await g4.useActiveSkill(a, 'm5_fenwei');
  ok(hasLog(g4, '奋威'), '奋威：缺少战报');
  ok(a.flags.m5FwUsed === true, '奋威：限定技应记录已发动');
  ok(!!b.flags.m5Wei, '奋威：应把牌置于目标武将牌上称为「威」');
  ok(a.hand.length === 2, `奋威：应摸等量的牌（${a.hand.length}）`);
  // 「威」的角色成为锦囊牌目标 → 弃置「威」并取消目标
  const wi = b.flags.m5Wei;
  const td = { self: a, target: b, card: card('f3', 'guohe'), canceled: false, used: [], shaCtx: null };
  await g4.trigger('target.before', td);
  ok(td.canceled === true, '奋威：「威」应可取消其作为锦囊牌的目标');
  ok(b.flags.m5Wei === null && g4.discardPile.includes(wi), '奋威：应弃置「威」牌');
  // 反例：限定技不可重复发动
  await g4.useActiveSkill(a, 'm5_fenwei');
  ok(hasLog(g4, '限定技本局已发动过'), '奋威：限定技不可重复发动');
}

// ================= 7. 谋张角 · 雷击 / 鬼道 =================
{
  const g = mk(['mou5_zhangjiao', 'caocao'], H({ seats: [1], yes: true }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 17; g.phase = 'play';
  await g.trigger('game.start', { self: p });
  ok(p.flags.m5Db === 2, `鬼道：游戏开始应获得两个「道兵」（${p.flags.m5Db}）`);
  // 反例：道兵不足四个不能雷击
  await g.useActiveSkill(p, 'm5_leiji');
  ok(hasLog(g, '不足四个「道兵」'), '雷击：「道兵」不足应有提示');
  // 正常：弃四个道兵造成 1 点雷电伤害
  p.flags.m5Db = 4;
  const thp = t.hp;
  await g.useActiveSkill(p, 'm5_leiji');
  ok(hasLog(g, '雷电伤害') || hasLog(g, '受到 1 点雷电'), '雷击：缺少战报');
  ok(noErr(g), '雷击：技能执行异常');
  ok(t.hp === thp - 1, `雷击：应造成 1 点雷电伤害（${thp} → ${t.hp}）`);
  // 属性伤害触发鬼道 +1
  ok(p.flags.m5Db === 1, `鬼道：属性伤害后应获得一个「道兵」（${p.flags.m5Db}）`);
  // 反例：本回合已被封锁则不再获得
  p.flags.m5Db = 0;
  p.flags.m5DbBlockTurn = 17;
  await g.trigger('damage.after', { self: t, to: t, from: p, amount: 1, nature: 'thunder', reason: 'test' });
  ok(p.flags.m5Db === 0, `鬼道：封锁回合内不应获得「道兵」（${p.flags.m5Db}）`);
  p.flags.m5DbBlockTurn = 0;
  await g.trigger('damage.after', { self: t, to: t, from: p, amount: 1, nature: 'thunder', reason: 'test' });
  ok(p.flags.m5Db === 1, `鬼道：解封后属性伤害应获得「道兵」（${p.flags.m5Db}）`);
  // 鬼道防御：弃两个道兵防止伤害
  const g2 = mk(['mou5_zhangjiao', 'caocao'], H({ yes: true }));
  const q = g2.players[0], o = g2.players[1];
  g2.turnPlayer = o; g2.turnCount = 18;
  q.flags.m5Db = 2;
  const hp0 = q.hp;
  await g2.damage({ from: o, to: q, amount: 1, reason: 'sha' });
  ok(q.hp === hp0, `鬼道：弃两个「道兵」应防止此伤害（${hp0} → ${q.hp}）`);
  ok(q.flags.m5Db === 0, `鬼道：应弃置两个「道兵」（${q.flags.m5Db}）`);
  ok(q.flags.m5DbBlockTurn === 18, '鬼道：回合外以此法弃置后本回合不能再获得');
  // 反例：道兵不足两个不能防止
  const g3 = mk(['mou5_zhangjiao', 'caocao'], H({ yes: true }));
  const r = g3.players[0], s = g3.players[1];
  g3.turnPlayer = s; g3.turnCount = 19;
  r.flags.m5Db = 1;
  const hp1 = r.hp;
  await g3.damage({ from: s, to: r, amount: 1, reason: 'sha' });
  ok(r.hp === hp1 - 1, `鬼道：「道兵」不足两个时不应防止伤害（${hp1} → ${r.hp}）`);
}

// ================= 8. 谋董卓 · 凶逆 / 封赏 =================
{
  const g = mk(['mou5_dongzhuo', 'caocao', 'liubei'], H({ seats: [1], yes: true }));
  const p = g.players[0], a = g.players[1], b = g.players[2];
  g.turnPlayer = p; g.turnCount = 20; g.phase = 'play';
  p.hand = [card('z1', 'sha', 'spade'), card('z2', 'shan', 'heart')];
  a.hand = [card('z3', 'tao', 'heart')];      // 无黑桃 → 受伤
  b.hand = [card('z4', 'sha', 'spade')];      // 有黑桃 → 弃置
  const ahp = a.hp, bhp = b.hp;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(hasLog(g, '凶逆'), '凶逆：缺少战报');
  ok(noErr(g), '凶逆：技能执行异常');
  ok(p.hand.length === 1, `凶逆：应弃置一张牌（${p.hand.length}）`);
  ok(a.hp === ahp - 1, `凶逆：未弃同花色牌的角色应受到 1 点伤害（${ahp} → ${a.hp}）`);
  ok(b.hp === bhp && b.hand.length === 0, `凶逆：弃置同花色牌的角色不受伤害（b.hp ${b.hp} / hand ${b.hand.length}）`);
  // 反例：确认取消则不发动
  const g2 = mk(['mou5_dongzhuo', 'caocao'], H({ seats: [1], yes: false }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 21; g2.phase = 'play';
  q.hand = [card('z5', 'sha')];
  await g2.trigger('phase.begin', { self: q, phase: 'play' });
  ok(q.hand.length === 1 && !hasLog(g2, '凶逆'), '凶逆：取消时不应发动');

  // 封赏：本回合弃牌堆两张同花色牌分出，自己没拿到则视为使用【酒】
  const g3 = mk(['mou5_dongzhuo', 'caocao'], H({ seats: [1] }));
  const r = g3.players[0], t = g3.players[1];
  g3.turnPlayer = r; g3.turnCount = 22; g3.phase = 'play';
  const c1 = card('h1', 'sha', 'spade'), c2 = card('h2', 'shan', 'spade'), c3 = card('h3', 'tao', 'heart');
  r.flags.m5FsPool = [c1, c2, c3];
  g3.discardPile.push(c1, c2, c3);
  const th = t.hand.length;
  await g3.useActiveSkill(r, 'm5_fengshang');
  ok(hasLog(g3, '封赏'), '封赏：缺少战报');
  ok(noErr(g3), '封赏：技能执行异常');
  ok(t.hand.length === th + 2, `封赏：应把两张同花色牌交给目标（${th} → ${t.hand.length}）`);
  ok(hasLog(g3, '视为使用一张【酒】'), '封赏：自己未获得牌应视为使用【酒】');
  // 反例：没有同花色的一对
  const g4 = mk(['mou5_dongzhuo', 'caocao'], H({ seats: [1] }));
  const u = g4.players[0];
  g4.turnPlayer = u; g4.turnCount = 23; g4.phase = 'play';
  const c4 = card('h4', 'sha', 'spade'), c5 = card('h5', 'tao', 'heart');
  u.flags.m5FsPool = [c4, c5];
  g4.discardPile.push(c4, c5);
  await g4.useActiveSkill(u, 'm5_fengshang');
  ok(hasLog(g4, '没有花色相同的两张牌'), '封赏：无同花色牌对应有提示');
  // 弃牌堆追踪：本回合弃置的牌进入池
  const g5 = mk(['mou5_dongzhuo', 'caocao'], H({}));
  const v = g5.players[0];
  g5.turnPlayer = v; g5.turnCount = 24;
  v.flags.m5FsPool = [];
  await g5.trigger('cards.discard', { self: g5.players[1], cards: [card('h6', 'sha')], reason: 'discard' });
  ok((v.flags.m5FsPool || []).length === 1, `封赏：应追踪本回合进入弃牌堆的牌（${(v.flags.m5FsPool || []).length}）`);
}

// ================= 总结 =================
console.log('\n===== mou5check（阶段 6B 谋·增补 6 将）=====');
console.log(`断言通过：${pass}    失败：${fail}`);
if (fail) {
  console.log('失败明细：');
  for (const m of bad) console.log('  ✗ ' + m);
  process.exitCode = 1;
} else {
  console.log('全部断言通过 ✅');
}
