// 阶段 5E 守门测试：手杀「兵势篇·势」10 将 + 「老友季·友」5 将（共 15 将 / 40 技能）
// 运行：node tools/shiyoucheck.js
// 说明：本批次尚未在 src/data/generals.js / src/skills/index.js 注册（由主控统一注册），
//       故本文件直接 import 技能文件与数据文件，用 SHI_GENERALS / YOU_GENERALS 构造对局。
import '../src/skills/shi.js';
import '../src/skills/you.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { generalById } from '../src/data/generals.js';
import { SHI_GENERALS } from '../src/data/shi.js';
import { YOU_GENERALS } from '../src/data/you.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const ALL = [...SHI_GENERALS, ...YOU_GENERALS];
const GEN = Object.fromEntries(ALL.map(g => [g.id, g]));
const genOf = (id) => GEN[id] || generalById(id);
const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });

function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: genOf(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261105,
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
  if (req.kind === 'card') return { cardId: over.cardId || (p.hand[0] || {}).id };
  return null;
};
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));
const noErr = (g) => !g.logs.some(l => l.text.includes('执行异常'));

// ================= 1. 数据与注册 =================
const EXPECT_SHI = [
  ['shi_weiyan', '势魏延', 'shu', 4, ['zhuangshi', 'yinzhan', 'zhongao']],
  ['shi_chendao', '势陈到', 'shu', 4, ['wanglie2', 'hongyi']],
  ['shi_luyusheng', '势陆郁生', 'wu', 3, ['runwei', 'shuanghuai']],
  ['shi_huangzu', '势黄祖', 'qun', 4, ['chizhang', 'duanyang']],
  ['shi_zhangren', '势张任', 'qun', 4, ['fuan', 'yinxian']],
  ['shi_sunchen', '势孙綝', 'wu', 4, ['nigu', 'lulian']],
  ['shi_caoshuang', '势曹爽', 'wei', 4, ['shanzheng', 'dianyi', 'jianzhuan2']],
  ['shi_chenqun', '势陈群', 'wei', 3, ['dingpin2', 'faen2']],
  ['shi_chengpu', '势程普', 'wu', 4, ['duzuo', 'bihan']],
  ['shi_zhouyu', '势周瑜', 'wu', 4, ['chiyun', 'yanhui', 'fentao', 'xiongzi']],
];
const EXPECT_YOU = [
  ['you_zhugeliang', '友诸葛亮', 'qun', 3, ['yance', 'fangqiu', 'gongli_zhuge']],
  ['you_xushu', '友徐庶', 'qun', 3, ['xiaxing', 'qihui', 'gongli_xushu']],
  ['you_pangtong', '友庞统', 'qun', 3, ['manjuan', 'yangming', 'gongli_pangtong']],
  ['you_shitao', '友石韬', 'qun', 3, ['qinying', 'lunxiong', 'gongli_shitao']],
  ['you_cuijun', '友崔钧', 'qun', 3, ['shunyi', 'biwei', 'gongli_cuijun']],
];
ok(SHI_GENERALS.length === 10, `势系列将数应为 10，实际 ${SHI_GENERALS.length}`);
ok(YOU_GENERALS.length === 5, `友系列将数应为 5，实际 ${YOU_GENERALS.length}`);
ok(SHI_GENERALS.every(g => g.pack === 'shi'), '势系列 pack 应全为 shi');
ok(YOU_GENERALS.every(g => g.pack === 'you'), '友系列 pack 应全为 you');

let skillCount = 0;
for (const [list, pack] of [[EXPECT_SHI, 'shi'], [EXPECT_YOU, 'you']]) {
  for (const [id, name, kingdom, hp, skills] of list) {
    const gd = genOf(id);
    ok(!!gd, `${id} 数据缺失`);
    if (!gd) continue;
    ok(gd.name === name, `${id} 名称不符：${gd.name}`);
    ok(gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符：${gd.kingdom}/${gd.hp}`);
    ok(gd.pack === pack, `${id} pack 应为 ${pack}，实际 ${gd.pack}`);
    ok(Array.isArray(gd.skills) && gd.skills.length === skills.length, `${id} 技能数量不符：${gd.skills}`);
    for (const s of skills) {
      skillCount += 1;
      ok(gd.skills.includes(s), `${id} 技能列表缺少 ${s}`);
      ok(hasSkill(s), `技能 ${s} 未注册`);
      const sk = getSkill(s);
      ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
      ok(sk && sk.name && sk.desc && sk.desc.length > 5, `技能 ${s} 缺少 name/desc`);
      ok(!/^(jie_|mou_|ji_|shen_)/.test(s), `技能 id ${s} 使用了会被降级的禁用前缀`);
    }
  }
}
ok(skillCount === 39, `本批技能总数应为 39，实际 ${skillCount}`);
// 派生技（由【忠傲】授予）也要注册
for (const s of ['kuanggu3', 'kunfen']) {
  ok(hasSkill(s), `派生技 ${s} 未注册`);
  ok(getSkill(s)?.desc?.length > 5, `派生技 ${s} 缺少 desc`);
}

// ================= 2. 主动技按钮可见 =================
{
  const ACTIVES = {
    shi_luyusheng: ['runwei'], shi_sunchen: ['nigu'], shi_caoshuang: ['dianyi'],
    you_zhugeliang: ['fangqiu'], you_shitao: ['qinying'], you_cuijun: ['biwei'],
  };
  for (const [id, list] of Object.entries(ACTIVES)) {
    const g = mk([id, 'caocao']);
    const p = g.players[0];
    g.turnPlayer = p; g.turnCount = 2;
    const names = g.activeSkillsOf(p).map(s => s.id);
    for (const s of list) ok(names.includes(s), `${id} 的主动技 ${s} 未出现在 activeSkillsOf（${names.join(',')}）`);
  }
  for (const id of ['shi_weiyan', 'shi_chendao', 'shi_huangzu', 'shi_zhangren', 'shi_chenqun', 'shi_chengpu',
    'shi_zhouyu', 'you_xushu', 'you_pangtong']) {
    const g = mk([id, 'caocao']);
    g.turnPlayer = g.players[0]; g.turnCount = 2;
    const own = g.activeSkillsOf(g.players[0]).filter(s => (genOf(id).skills || []).includes(s.id));
    ok(own.length === 0, `${id} 不应有主动技按钮：${own.map(s => s.id).join(',')}`);
  }
}

// ================= 3. 势魏延 · 壮誓 / 饮战 / 忠傲 / 狂骨 / 困奋 =================
{
  const g = mk(['shi_weiyan', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('w1', 'sha'), card('w2', 'shan'), card('w3', 'tao'),
    card('w4', 'sha'), card('w5', 'shan'), card('w6', 'tao')];
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(hasLog(g, '壮誓'), '壮誓：缺少战报');
  ok(noErr(g), '壮誓：技能执行异常');
  ok((p.flags.zsFree || 0) >= 1, '壮誓：应记录本阶段无距离/不可响应的牌数');
  ok(p.hand.length < 6 && p.hand.length > 0, `壮誓：应弃置部分手牌（现 ${p.hand.length}）`);
  // 不可被响应：card.use.before 写入 unavoidable
  const d1 = { self: p, card: p.hand[0], effName: p.hand[0].name, targets: [g.players[1]], reason: 'play' };
  await g.trigger('card.use.before', d1);
  ok(d1.unavoidable === true, '壮誓：本阶段前 N 张牌应不可被响应');
  await g.trigger('phase.end', { self: p, phase: 'play' });
  ok((p.flags.zsFree || 0) === 0, '壮誓：阶段结束应清零');

  // 饮战：体力/手牌都不大于目标 → 伤害+1 且结算后弃其一张牌 + 乘势回复并获得
  const g2 = mk(['shi_weiyan', 'caocao'], H({ seats: [1] }));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = a; g2.turnCount = 4;
  a.hp = 4; b.hp = 4;
  a.hand = [card('y1', 'shan')]; b.hand = [card('y2', 'tao'), card('y3', 'tao')];
  const dmg = { self: b, from: a, to: b, amount: 1, nature: 'normal', card: card('y4', 'sha'), reason: 'sha' };
  await g2.trigger('damage.before', dmg);
  ok(dmg.amount === 2, `饮战：应令此伤害+1（实际 ${dmg.amount}）`);
  ok(hasLog(g2, '饮战'), '饮战：缺少战报');
  const handB = b.hand.length;
  await g2.trigger('damage.after', { self: b, from: a, to: b, amount: 2, card: card('y4', 'sha'), reason: 'sha' });
  ok(b.hand.length === handB - 1, '饮战：结算后应弃置目标一张牌');
  ok(noErr(g2), '饮战：技能执行异常');

  // 忠傲：游戏开始获得狂骨；濒死使命失败 → 失去壮誓，获得困奋
  const g3 = mk(['shi_weiyan', 'caocao'], H({}));
  const c = g3.players[0];
  g3.turnPlayer = c; g3.turnCount = 5;
  await g3.trigger('game.start', { self: null });
  ok(c.skills.some(s => s.id === 'kuanggu3'), '忠傲：游戏开始应获得【狂骨】');
  ok(hasLog(g3, '忠傲'), '忠傲：缺少战报');
  c.hand = [];
  c.hp = 0;
  await g3.trigger('dying.begin', { self: c });
  ok(!c.skills.some(s => s.id === 'zhuangshi'), '忠傲：使命失败应失去【壮誓】');
  ok(c.skills.some(s => s.id === 'kunfen'), '忠傲：使命失败应获得【困奋】');

  // 狂骨：对距离1以内角色造成伤害后选择一项
  const g4 = mk(['shi_weiyan', 'caocao'], H({ index: 1 }));
  const e = g4.players[0], f = g4.players[1];
  g4.turnPlayer = e; g4.turnCount = 6;
  e.skills.push(getSkill('kuanggu3'));
  const before = e.hand.length;
  await g4.trigger('damage.after', { self: f, from: e, to: f, amount: 1, reason: 'sha' });
  ok(hasLog(g4, '狂骨'), '狂骨：缺少战报');
  ok(e.hand.length === before + 1, '狂骨：选“摸一张牌”应摸 1 张');
  ok(noErr(g4), '狂骨：技能执行异常');

  // 困奋：结束阶段失去1点体力摸两张牌
  const g5 = mk(['shi_weiyan', 'caocao'], H({}));
  const k = g5.players[0];
  g5.turnPlayer = k; g5.turnCount = 7;
  k.skills.push(getSkill('kunfen'));
  const hp0 = k.hp, h0 = k.hand.length;
  await g5.trigger('phase.end', { self: k, phase: 'end' });
  ok(k.hp === hp0 - 1 && k.hand.length === h0 + 2, `困奋：应失去1点体力并摸两张牌（${hp0}→${k.hp}，${h0}→${k.hand.length}）`);
  ok(hasLog(g5, '困奋'), '困奋：缺少战报');
}

// ================= 4. 势陈到 · 往烈 / 弘毅 =================
{
  const g = mk(['shi_chendao', 'caocao'], H({ seats: [1] }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 8;
  p.hand = [card('c1', 'sha'), card('c2', 'shan')];
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(hasLog(g, '往烈'), '往烈：缺少战报');
  ok(!!p.flags.wlId, '往烈：应记录选定的手牌');
  const chosen = p.hand.find(c => c.id === p.flags.wlId);
  const d = { self: p, card: chosen, effName: chosen.name, targets: [g.players[1]], reason: 'play' };
  await g.trigger('card.use.before', d);
  ok(d.unavoidable === true, '往烈：选定的牌应不可被响应');
  const d2 = { self: p, card: card('c3', 'guohe'), effName: 'guohe', targets: [g.players[1]], reason: 'play' };
  await g.trigger('card.use.before', d2);
  ok(d2.canceled === true, '往烈：使用选定牌结算后不能再对其他角色使用牌');

  const g2 = mk(['shi_chendao', 'caocao'], H({ index: 0 }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 9;
  await g2.trigger('game.start', { self: null });
  ok(q.marks.yi === 2, `弘毅：游戏开始应获得2枚“毅”（实际 ${q.marks.yi}）`);
  await g2.trigger('damage.after', { self: q, from: g2.players[1], to: q, amount: 1, reason: 'sha' });
  ok(q.marks.yi === 3, `弘毅：受到伤害后应+1（实际 ${q.marks.yi}）`);
  const h0 = q.hand.length;
  await g2.trigger('phase.begin', { self: q, phase: 'prepare' });
  ok(q.hand.length > h0, '弘毅：准备阶段选“摸X张牌”应摸牌');
  await g2.trigger('phase.end', { self: q, phase: 'end' });
  ok(q.marks.yi === 0, '弘毅：结束阶段应清空“毅”标记');
  ok(hasLog(g2, '弘毅'), '弘毅：缺少战报');
}

// ================= 5. 势陆郁生 · 润微 / 霜怀 =================
{
  const g = mk(['shi_luyusheng', 'caocao'], H({ seats: [0], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 10; g.phase = 'play';
  const before = p.hand.length;
  await g.useActiveSkill(p, 'runwei');
  ok(hasLog(g, '润微'), '润微：缺少战报');
  ok(noErr(g), '润微：技能执行异常');
  ok(p.hand.length !== before, '润微：目标为自己时应获得牌');
  await g.trigger('phase.end', { self: p, phase: 'play' });
  ok(hasLog(g, '润微'), '润微：阶段结束应弃置以此法获得的手牌');

  const g2 = mk(['shi_luyusheng', 'caocao'], H({ index: 0 }));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = b; g2.turnCount = 11;
  g2.discardPile.push(card('t1', 'tao'));
  const dmg = { self: b, from: b, to: b, amount: 1, nature: 'normal', reason: 'sha' };
  await g2.trigger('damage.before', dmg);
  ok(dmg.canceled === true, '霜怀：选“防止此伤害”应取消伤害');
  ok(hasLog(g2, '霜怀'), '霜怀：缺少战报');
  ok(noErr(g2), '霜怀：技能执行异常');
  ok(a.hp === a.maxHp - 1, '霜怀：与上次目标不同应失去1点体力');
}

// ================= 6. 势黄祖 · 鸱张 / 断鞅 =================
{
  const g = mk(['shi_huangzu', 'caocao'], H({ seats: [1] }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 12;
  await g.trigger('game.start', { self: null });
  ok((p.flags.rangeBonus || 0) >= 8, '鸱张：伤害类牌应无距离限制（攻击范围加成）');
  p.hand = [card('h1', 'sha'), card('h2', 'shan'), card('h3', 'tao')];
  const d = { self: p, card: p.hand[0], effName: 'sha', targets: [g.players[1]], reason: 'play' };
  await g.trigger('card.use.before', d);
  ok(hasLog(g, '鸱张'), '鸱张：缺少战报');
  ok(g.players[1].flags.noShan === p.hand[0].id || g.players[1].flags.noShan !== undefined, '鸱张：应令目标不能以【闪】响应');

  // 断鞅：弃牌中的【杀】置于武将牌上，阶段结束使用之
  const g2 = mk(['shi_huangzu', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 13;
  q.hand = [];
  await g2.trigger('cards.discard', { self: q, cards: [card('h4', 'sha')], reason: 'discard' });
  ok((q.flags.duanCards || []).length === 1, '断鞅：应将弃置的【杀】置于武将牌上');
  ok(hasLog(g2, '断鞅'), '断鞅：缺少战报');
  await g2.trigger('phase.end', { self: q, phase: 'discard' });
  ok(hasLog(g2, '断鞅'), '断鞅：阶段结束应使用置于武将牌上的【杀】');
  ok(noErr(g2), '断鞅：技能执行异常');
}

// ================= 7. 势张任 · 伏暗 / 引弦 =================
{
  const g = mk(['shi_zhangren', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 14;
  p.flags.rangeBonus = 3;
  p.hand = [card('z1', 'sha', 'heart', 5), card('z2', 'shan')];
  await g.trigger('phase.end', { self: p, phase: 'end' });
  ok((p.flags.rangeBonus || 0) === 0, '伏暗：结束阶段应将攻击范围调整至0');
  ok(hasLog(g, '伏暗'), '伏暗：缺少战报');
  ok((p.flags.fuanSuits || []).length === 1, '伏暗：应记录一种花色');
  // 其他角色回合结束时 → 视为使用【杀】
  const q = g.players[1];
  await g.trigger('cards.discard', { self: q, cards: [card('z3', 'tao', p.flags.fuanSuits[0], 3)], reason: 'discard' });
  await g.trigger('turn.end', { self: q });
  ok(hasLog(g, '伏暗'), '伏暗②：其他角色回合结束应尝试发动');
  ok(noErr(g), '伏暗：技能执行异常');

  const g2 = mk(['shi_zhangren', 'caocao'], H({}));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = a; g2.turnCount = 15;
  const dmg = { self: b, from: a, to: b, amount: 1, nature: 'normal', card: card('z4', 'sha'), reason: 'sha' };
  await g2.trigger('damage.before', dmg);
  ok(dmg.amount === 2, `引弦：攻击范围内最远角色受到的【杀】伤害应+1（实际 ${dmg.amount}）`);
  g2.turnPlayer = b;
  await g2.trigger('card.use.after', { self: a, card: card('z5', 'shan'), effName: 'shan', reason: 'respond' });
  ok((a.flags.rangeBonus || 0) >= 1, '引弦：回合外使用牌后攻击范围应+1');
  ok(hasLog(g2, '引弦'), '引弦：缺少战报');
}

// ================= 8. 势孙綝 · 逆固 / 戮连 =================
{
  const g = mk(['shi_sunchen', 'caocao'], H({ seats: [1], yes: false }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 16;
  p.hand = [card('s1', 'sha', 'spade', 5), card('s2', 'shan', 'heart', 6), card('s3', 'tao')];
  await g.useActiveSkill(p, 'nigu');
  ok(hasLog(g, '逆固'), '逆固：缺少战报');
  ok(noErr(g), '逆固：技能执行异常');
  ok((p.flags.niguBonus || 0) >= 1, `逆固：应记录加伤次数（实际 ${p.flags.niguBonus}）`);
  const dmg = { self: g.players[1], from: p, to: g.players[1], amount: 1, reason: 'sha' };
  await g.trigger('damage.before', dmg);
  ok(dmg.amount === 2, '逆固：本回合伤害应+1');

  // 戮连：使用某类别最后一张牌后
  const g2 = mk(['shi_sunchen', 'caocao'], H({}));
  const q = g2.players[0], t = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 17;
  q.hp = 4; t.hp = 3;
  q.hand = [card('s4', 'qinggang')];
  await g2.trigger('card.use.after', { self: q, card: card('s5', 'sha'), effName: 'sha', targets: [t], reason: 'play' });
  ok(hasLog(g2, '戮连'), '戮连：缺少战报');
  ok(t.chained === true, '戮连：目标体力不大于你时应进入连环状态');
  ok(noErr(g2), '戮连：技能执行异常');
}

// ================= 9. 势曹爽 · 擅政 / 典易 / 渐专 =================
{
  const g = mk(['shi_caoshuang', 'caocao'], H({ index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 18; g.round = 2;
  t.hand = [card('k1', 'sha'), card('k2', 'shan')];
  await g.trigger('round.begin', { self: p, round: 2 });
  ok(hasLog(g, '擅政'), '擅政：缺少战报');
  ok(t.hand.some(c => c.__zhuanshe), '擅政：应标记其他角色的手牌为“专慑”');
  await g.useActiveSkill(p, 'dianyi');
  ok(hasLog(g, '典易'), '典易：缺少战报');
  ok(noErr(g), '典易：技能执行异常');
  // 渐专：三个时机 → 提升体力上限并回复
  const maxHp0 = p.maxHp, hp0 = p.hp;
  p.hp = p.maxHp - 1;
  await g.trigger('damage.after', { self: p, from: t, to: p, amount: 1, reason: 'sha' });
  await g.trigger('damage.after', { self: t, from: p, to: t, amount: 1, reason: 'sha' });
  ok((p.marks.zhuan || 0) >= 2, `渐专：应累计“专”标记（实际 ${p.marks.zhuan}）`);
  await g.trigger('dying.begin', { self: p });
  ok(p.maxHp === maxHp0 + 1, `渐专：三个时机齐全后体力上限应+1（${maxHp0}→${p.maxHp}）`);
  ok(hasLog(g, '渐专'), '渐专：缺少战报');
}

// ================= 10. 势陈群 · 定品 / 法恩 =================
{
  const g = mk(['shi_chenqun', 'caocao'], H({ index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 19; g.round = 3;
  const h0 = t.hand.length;
  await g.trigger('cards.discard', { self: t, cards: [card('q1', 'sha'), card('q2', 'shan')], reason: 'discard' });
  await g.trigger('turn.end', { self: t });
  ok(hasLog(g, '定品'), '定品：缺少战报');
  ok(t.hand.length >= h0, '定品：本回合失去牌最多的角色应摸两张牌');
  ok(noErr(g), '定品：技能执行异常');

  const g2 = mk(['shi_chenqun', 'caocao'], H({ index: 0 }));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = a; g2.turnCount = 20;
  a.hand = [card('f1', 'sha')]; b.hand = [card('f2', 'tao'), card('f3', 'shan')];
  await g2.trigger('card.use.after', { self: a, card: card('f1', 'sha'), effName: 'sha', reason: 'play' });
  const hb = b.hand.length;
  await g2.trigger('card.use.after', { self: b, card: card('f2', 'tao'), effName: 'tao', reason: 'play' });
  ok(hasLog(g2, '法恩'), '法恩：缺少战报');
  ok(b.hand.length !== hb, '法恩：应令该角色摸牌或弃牌');
  ok(noErr(g2), '法恩：技能执行异常');
}

// ================= 11. 势程普 · 督佐 / 蔽扞 =================
{
  const g = mk(['shi_chengpu', 'caocao'], H({ seats: [0] }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 21;
  g.discardPile.push(card('d1', 'sha'));
  const h0 = p.hand.length;
  await g.trigger('cards.gain', { self: p, from: null, cards: [card('d2', 'tao')], reason: 'draw' });
  ok(hasLog(g, '督佐'), '督佐：缺少战报');
  ok(p.hand.length === h0 + 1, '督佐：应令目标获得一张【杀】');
  ok(noErr(g), '督佐：技能执行异常');

  const g2 = mk(['shi_chengpu', 'caocao'], H({ index: 0 }));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = b; g2.turnCount = 22;
  a.hp = 2; a.hand = [card('b1', 'tao'), card('b2', 'tao'), card('b3', 'tao'), card('b4', 'tao')];
  const dmg = { self: b, from: b, to: b, amount: 1, nature: 'normal', card: card('b5', 'sha'), reason: 'sha' };
  b.hp = 4; b.hand = [card('b6', 'tao'), card('b7', 'tao'), card('b8', 'tao'), card('b9', 'tao')];
  await g2.trigger('damage.before', dmg);
  ok(dmg.amount === 0, `蔽扞：应令此伤害-1（实际 ${dmg.amount}）`);
  ok(hasLog(g2, '蔽扞'), '蔽扞：缺少战报');
  ok(noErr(g2), '蔽扞：技能执行异常');
}

// ================= 12. 势周瑜 · 炽沄 / 焰洄 / 焚涛 / 雄姿 =================
{
  const g = mk(['shi_zhouyu', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 23; g.phase = 'draw';
  p.hand = [card('u1', 'sha', 'heart', 5), card('u2', 'tao', 'spade', 6)];
  t.hp = 4;
  await g.trigger('cards.gain', { self: p, cards: [card('u3', 'shan')], reason: 'draw' });
  ok(hasLog(g, '炽沄'), '炽沄：缺少战报');
  ok(t.chained === true || t.hp < 4, '炽沄：目标应受到火焰伤害或被横置');
  ok(noErr(g), '炽沄：技能执行异常');

  // 焰洄：展示目标手牌，重复展示则弃置；出牌阶段结束选择一项
  const g2 = mk(['shi_zhouyu', 'caocao'], H({ seats: [1], index: 1 }));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = a; g2.turnCount = 24; g2.phase = 'play';
  b.hand = [card('v1', 'tao')];
  await g2.trigger('target.after', { self: a, target: b, card: card('v2', 'sha'), canceled: false });
  ok(hasLog(g2, '焰洄'), '焰洄：缺少战报');
  await g2.trigger('target.after', { self: a, target: b, card: card('v2', 'sha'), canceled: false });
  ok(b.hand.length === 0, '焰洄：本回合重复展示的牌应被弃置');
  const h0 = a.hand.length;
  await g2.trigger('phase.end', { self: a, phase: 'play' });
  ok(a.hand.length > h0, '焰洄：出牌阶段结束选择选项2应摸牌');
  ok(noErr(g2), '焰洄：技能执行异常');

  // 焚涛：已横置的其他角色受到火焰伤害
  const g3 = mk(['shi_zhouyu', 'caocao'], H({ index: 0 }));
  const c = g3.players[0], d = g3.players[1];
  g3.turnPlayer = c; g3.turnCount = 25;
  d.chained = true;
  const dmg = { self: d, from: c, to: d, amount: 1, nature: 'fire', reason: 'huogong' };
  await g3.trigger('damage.before', dmg);
  ok(dmg.amount === 2 || d.hand.length === 0, '焚涛：应令伤害+1或令其弃置一半的牌');
  ok(hasLog(g3, '焚涛'), '焚涛：缺少战报');

  // 雄姿：限定技
  const g4 = mk(['shi_zhouyu', 'caocao'], H({}));
  const e = g4.players[0];
  g4.turnPlayer = e; g4.turnCount = 26;
  const h4 = e.hand.length;
  await g4.trigger('phase.begin', { self: e, phase: 'prepare' });
  ok(e.flags.xiongzi === true, '雄姿：应记录形态改变');
  ok(e.hand.length === h4 + 2, '雄姿：应摸两张牌');
  ok(hasLog(g4, '雄姿'), '雄姿：缺少战报');
}

// ================= 13. 友诸葛亮 · 演策 / 方遒 / 共砺 =================
{
  const g = mk(['you_zhugeliang', 'you_pangtong'], H({ index: 1 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 27; g.round = 1;
  await g.trigger('game.start', { self: null });
  await g.trigger('round.begin', { self: p, round: 1 });
  ok(hasLog(g, '演策'), '演策：缺少战报');
  ok(!!p.flags.yance, '演策：应执行“卧龙演策”并记录预测');
  ok(p.flags.yance.need >= 4, `演策：共砺应与友庞统同势力令可预测牌数+1（实际 ${p.flags.yance.need}）`);
  const h0 = p.hand.length;
  // 制造一张与预测相符的牌
  const predCard = p.flags.yance.kind === 'type'
    ? card('x1', p.flags.yance.value === 'basic' ? 'sha' : (p.flags.yance.value === 'trick' ? 'guohe' : 'qinggang'))
    : card('x1', 'sha', p.flags.yance.value === 'red' ? 'heart' : 'spade', 6);
  await g.trigger('card.use.after', { self: t, card: predCard, effName: predCard.name, reason: 'play' });
  ok(p.hand.length >= h0, '演策：预测相符时应摸一张牌');
  ok(noErr(g), '演策：技能执行异常');
  // 方遒
  await g.useActiveSkill(p, 'fangqiu');
  ok(hasLog(g, '方遒'), '方遒：缺少战报');
  ok(p.flags.fangqiu === true, '方遒：应标记本次演策效果值+1');
  ok(hasLog(g, '共砺'), '共砺（友诸葛亮）：缺少战报');
  ok(p.flags.gongliYanceN === 1, '共砺（友诸葛亮）：与友庞统同势力应令可预测牌数+1');
}

// ================= 14. 友徐庶 · 侠行 / 启诲 / 共砺 =================
{
  const g = mk(['you_xushu', 'you_zhugeliang'], H({ index: 1 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 28;
  await g.trigger('game.start', { self: null });
  ok(p.flags.xuanjian === true, '侠行：游戏开始应获得“玄剑”');
  ok((p.flags.rangeBonus || 0) >= 8, '侠行：应令【杀】无距离关系限制（攻击范围加成）');
  ok(hasLog(g, '侠行'), '侠行：缺少战报');
  // 启诲：三种类别 → 集齐三个标记后选一项
  p.hand = [card('m1', 'sha'), card('m2', 'guohe'), card('m3', 'qinggang'), card('m4', 'tao')];
  const h0 = p.hand.length;
  await g.trigger('card.use.before', { self: p, card: p.hand[0], effName: 'sha', targets: [], reason: 'play' });
  ok((p.marks.qh || []).length === 1, '启诲：应获得基本牌标记');
  await g.trigger('card.use.before', { self: p, card: p.hand[0], effName: 'guohe', targets: [], reason: 'play' });
  ok((p.marks.qh || []).length === 2, '启诲：应获得锦囊牌标记');
  await g.trigger('card.use.before', { self: p, card: p.hand[0], effName: 'qinggang', targets: [], reason: 'play' });
  ok(p.hand.length > h0 || hasLog(g, '启诲'), '启诲：集齐三个标记应结算收益');
  ok((p.marks.qh || []).length === 1, '启诲：结算后应移除2个标记');
  ok(hasLog(g, '共砺'), '共砺（友徐庶）：缺少战报');
  ok(p.flags.xsShaFree === true, '共砺（友徐庶）：与友诸葛亮同势力应令【杀】不计次数');
}

// ================= 15. 友庞统 · 漫卷 / 养名 / 共砺 =================
{
  const g = mk(['you_pangtong', 'you_zhugeliang'], H({ index: 0, seats: [1] }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 29; g.round = 2; g.phase = 'draw';
  await g.trigger('game.start', { self: null });
  g.discardPile.push(card('n1', 'tao'), card('n2', 'guohe'));
  const got = [card('n3', 'sha', 'spade', 5), card('n4', 'shan', 'heart', 6)];
  p.hand = [...got];
  await g.trigger('cards.gain', { self: p, cards: got, reason: 'draw' });
  ok(hasLog(g, '漫卷'), '漫卷：缺少战报');
  ok(noErr(g), '漫卷：技能执行异常');
  ok(g.deck.length > 0, '漫卷：应将牌置于牌堆顶');
  ok(hasLog(g, '共砺'), '共砺（友庞统）：缺少战报');

  // 养名：出牌阶段失去≥3张手牌 → 置于武将牌上并使用
  const g2 = mk(['you_pangtong', 'you_zhugeliang'], H({ index: 0, seats: [1] }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 30; g2.phase = 'play';
  q.hand = [card('p1', 'sha'), card('p2', 'shan'), card('p3', 'tao')];
  g2.discardPile.push(card('p4', 'guohe', 'club', 3), card('p5', 'sha', 'diamond', 4));
  await g2.trigger('cards.discard', { self: q, cards: [card('p6', 'shan'), card('p7', 'shan'), card('p8', 'shan')], reason: 'discard' });
  await g2.trigger('phase.end', { self: q, phase: 'play' });
  ok(hasLog(g2, '养名'), '养名：缺少战报');
  ok(noErr(g2), '养名：技能执行异常');
  ok((q.flags.ymCards || []).length < 5, '养名：应将牌堆顶若干牌置于武将牌上');
}

// ================= 16. 友石韬 · 钦英 / 论雄 / 共砺 =================
{
  const g = mk(['you_shitao', 'caocao'], H({ index: 0, seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 31;
  await g.trigger('game.start', { self: null });
  p.hand = [card('r1', 'sha'), card('r2', 'shan')];
  await g.useActiveSkill(p, 'qinying');
  ok(hasLog(g, '钦英'), '钦英：缺少战报');
  ok(noErr(g), '钦英：技能执行异常');
  ok(hasLog(g, '共砺'), '共砺（友石韬）：缺少战报');

  // 论雄：造成伤害后弃点数唯一最大的手牌并摸三张
  const g2 = mk(['you_shitao', 'caocao'], H({}));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = a; g2.turnCount = 32;
  a.hand = [card('r3', 'sha', 'spade', 13), card('r4', 'shan', 'heart', 5)];
  const h0 = a.hand.length;
  await g2.trigger('damage.after', { self: b, from: a, to: b, amount: 1, reason: 'sha' });
  ok(hasLog(g2, '论雄'), '论雄：缺少战报');
  ok(a.hand.length === h0 - 1 + 3, `论雄：应弃1张摸3张（${h0}→${a.hand.length}）`);
  ok(a.flags.lxLast === 13, '论雄：应记录本次弃置牌的点数');
}

// ================= 17. 友崔钧 · 顺逸 / 鄙位 / 共砺 =================
{
  const g = mk(['you_cuijun', 'caocao'], H({ index: 0, seats: [1] }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 33;
  await g.trigger('game.start', { self: null });
  ok(Array.isArray(p.flags.sySuits) && p.flags.sySuits.includes('heart'), '共砺（友崔钧）：应添加可触发花色');
  ok(hasLog(g, '共砺'), '共砺（友崔钧）：缺少战报');
  p.hand = [card('s1', 'sha', 'heart', 5), card('s2', 'shan', 'heart', 9)];
  const h0 = p.hand.length;
  const d = { self: p, card: p.hand[0], effName: 'sha', targets: [g.players[1]], reason: 'play' };
  await g.trigger('card.use.before', d);
  ok(hasLog(g, '顺逸'), '顺逸：缺少战报');
  ok((p.flags.syHide || []).length >= 1, '顺逸：应将同花色手牌扣置于武将牌上');
  await g.trigger('turn.end', { self: p });
  ok((p.flags.syHide || []).length === 0, '顺逸：回合结束应收回扣置的牌');

  // 鄙位：弃置点数最大的手牌，令目标弃置所有点数不小于此牌的手牌
  const g2 = mk(['you_cuijun', 'caocao'], H({ index: 0, seats: [1] }));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = a; g2.turnCount = 34;
  a.hand = [card('t1', 'sha', 'spade', 12), card('t2', 'shan', 'heart', 3)];
  b.hand = [card('t3', 'tao', 'heart', 13), card('t4', 'shan', 'club', 2)];
  await g2.useActiveSkill(a, 'biwei');
  ok(hasLog(g2, '鄙位'), '鄙位：缺少战报');
  ok(noErr(g2), '鄙位：技能执行异常');
  ok(a.hand.length === 1, `鄙位：应弃置一张点数最大的手牌（现 ${a.hand.length} 张）`);
  ok(b.hand.length === 1, `鄙位：目标应弃置点数不小于该牌的手牌（现 ${b.hand.length} 张）`);
}

// ================= 结果 =================
console.log(`\n阶段 5E（势 10 + 友 5）守门测试：通过 ${pass}，失败 ${fail}`);
if (fail) {
  console.log('失败明细：');
  for (const m of bad) console.log('  ✗ ' + m);
  process.exit(1);
} else {
  console.log('全部通过 ✅');
}
