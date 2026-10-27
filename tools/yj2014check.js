// 一将成名 2014 守门测试：10 将 18 技能
// 运行：node tools/yj2014check.js
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
    seats, mode: getMode('duel'), seed: 20261101,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
const yes = (extra) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: true };
  if (req.kind === 'targets') return { seats: [1] };
  if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
  if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
  if (req.kind === 'cards') return { cardIds: p.hand.slice(0, req.min || 1).map(c => c.id) };
  if (extra) return extra(g, p, req);
  return null;
};

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['caozhen', '曹真', 'wei', 4, ['sidi']],
  ['chenqun', '陈群', 'wei', 3, ['dingpin', 'faen']],
  ['guyong', '顾雍', 'wu', 3, ['shenxing', 'bingyi']],
  ['hanhaoshihuan', '韩浩史涣', 'wei', 4, ['shenduan', 'yonglve']],
  ['caohong', '曹洪', 'wei', 4, ['yuanhu']],
  ['sunluban', '孙鲁班', 'wu', 3, ['zenghui', 'jiaojin']],
  ['zhuhuan', '朱桓', 'wu', 4, ['fenli', 'pingkou']],
  ['jushou_ju', '沮授', 'qun', 3, ['jianying', 'shibei']],
  ['caiyong', '蔡邕', 'qun', 3, ['bizhuan', 'tongbo']],
  ['zhangsong', '张松', 'shu', 3, ['qiangshi', 'xiantu']],
  ['wuyi', '吴懿', 'shu', 4, ['benxi']],
  ['zhoucang', '周仓', 'shu', 4, ['zhongyong']],
];
ok(GENERALS.filter(g => g.pack === 'yj2014').length === 12, `2014 包应为 12 将，实际 ${GENERALS.filter(g => g.pack === 'yj2014').length}`);
ok(PACK_CN.yj2014 === '一将成名·2014', `PACK_CN.yj2014 不符：${PACK_CN.yj2014}`);
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name && gd.kingdom === kingdom && gd.hp === hp, `${id} 基础数据不符`);
  ok(gd && gd.pack === 'yj2014', `${id} pack 应为 yj2014`);
  ok(!!gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常`);
  }
}

// ================= 2. 曹真 · 司敌 =================
{
  const g = mk(['caozhen', 'simayi'], yes());
  const cz = g.players[0], t = g.players[1];
  const data = { self: t, player: cz, phase: 'play' };
  await g.trigger('phase.begin', data);
  ok(!!t.flags.qianxiNoColor, '司敌：应给目标加上颜色限制');
  ok(g.logs.some(l => /司敌/.test(l.text)), '缺少司敌日志');
}

// ================= 3. 陈群 · 定品 / 法恩 =================
{
  const g = mk(['chenqun', 'sunquan'], yes());
  const cq = g.players[0], t = g.players[1];
  t.hp = t.maxHp - 1;
  g.deck.push(card('j1', 'sha', 'spade', 6));
  g.phase = 'play';
  const th = t.hand.length;
  await g.useActiveSkill(cq, 'dingpin');
  ok(t.hand.length === th + 1, `定品：目标应摸一张（${th} → ${t.hand.length}）`);
  ok(t.hp === t.maxHp, `定品：黑色判定应回复 1 点体力（${t.hp}/${t.maxHp}）`);
}
{
  const g = mk(['chenqun', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const cq = g.players[0], t = g.players[1];
  const h0 = cq.hand.length;
  await g.flip(t);
  ok(t.flipped === true, '法恩：目标应被翻面');
  ok(cq.hand.length === h0 + 1, `法恩：翻面后陈群应摸一张（${h0} → ${cq.hand.length}）`);
}

// ================= 4. 顾雍 · 慎行 / 秉壹 =================
{
  const g = mk(['guyong', 'simayi'], yes());
  const gy = g.players[0];
  g.phase = 'play';
  const h0 = gy.hand.length;
  await g.useActiveSkill(gy, 'shenxing');
  ok(gy.hand.length === h0 - 1, `慎行：弃 2 摸 1（${h0} → ${gy.hand.length}）`);
}
{
  const g = mk(['guyong', 'simayi'], yes());
  const gy = g.players[0], t = g.players[1];
  gy.hand = [card('a1', 'sha', 'spade', 3), card('a2', 'shan', 'club', 4)];
  const h0 = t.hand.length;
  await g.trigger('phase.begin', { self: gy, player: gy, phase: 'end' });
  ok(t.hand.length === h0 + 1, `秉壹：颜色相同应令目标摸一张（${h0} → ${t.hand.length}）`);
}

// ================= 5. 韩浩史涣 · 慎断 / 勇略 =================
{
  const g = mk(['hanhaoshihuan', 'simayi'], yes());
  const hh = g.players[0], t = g.players[1];
  g.turnPlayer = t;
  const black = card('b1', 'sha', 'spade', 3);
  await g.trigger('cards.discard', { self: hh, player: hh, cards: [black], reason: 'test' });
  ok(t.judgeZone.length === 1, '慎断：应把黑牌置于目标判定区');
}
{
  const g = mk(['hanhaoshihuan', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const hh = g.players[0], t = g.players[1];
  g.phase = 'judge';
  const hp0 = t.hp;
  await g.trigger('judge.after', { self: t, player: hh, card: card('j2', 'sha', 'heart', 5), suit: 'heart', num: 5 });
  ok(t.hp === hp0 - 1, `勇略：应造成 1 点伤害（${hp0} → ${t.hp}）`);
}

// ================= 6. 曹洪 · 援护 =================
{
  const g = mk(['caohong', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return { cardId: (p.hand.find(c => CARD_META[c.name]?.sub) || p.hand[0])?.id };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const ch = g.players[0], t = g.players[1];
  ch.hand.push(card('e1', 'zhuge', 'spade', 1));
  const th = t.hand.length;
  const eq0 = Object.values(t.equips).filter(Boolean).length;
  await g.trigger('phase.begin', { self: ch, player: ch, phase: 'end' });
  ok(Object.values(t.equips).filter(Boolean).length === eq0 + 1, `援护：目标装备区应多一件装备（${eq0} 件）`);
  ok(t.hand.length === th + 1, '援护：目标应摸一张牌');
}

// ================= 7. 孙鲁班 · 谮毁 / 骄矜 =================
{
  const g = mk(['sunluban', 'simayi'], yes());
  const sl = g.players[0], t = g.players[1];
  sl.hand.push(card('bk', 'sha', 'spade', 5));
  g.phase = 'play';
  const hp0 = t.hp;
  await g.useActiveSkill(sl, 'zenghui');
  ok(t.hp <= hp0, '谮毁：应视为使用【杀】');
  ok(g.logs.some(l => /谮毁/.test(l.text)), '缺少谮毁日志');
}
{
  const g = mk(['sunluban', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const sl = g.players[0], t = g.players[1];
  t.gender = 'male';
  sl.hand = [card('eq', 'zhuge', 'spade', 1)];
  const data = { self: sl, player: sl, from: t, to: sl, amount: 1, card: null, canceled: false };
  await g.trigger('damage.before', data);
  ok(data.amount === 0, '骄矜：男性角色造成的伤害应被防止');
}

// ================= 8. 朱桓 · 奋励 / 平寇 =================
{
  const g = mk(['zhuhuan', 'simayi'], yes());
  const zh = g.players[0];
  const h0 = zh.hand.length;
  await g.trigger('phase.begin', { self: zh, player: zh, phase: 'prepare' });
  ok(zh.flags.skipDraw === true, '奋励：应跳过摸牌阶段');
  ok(zh.hand.length === h0 + 2, `奋励：弃 1 摸 3（${h0} → ${zh.hand.length}）`);
}
{
  const g = mk(['zhuhuan', 'simayi'], yes());
  const zh = g.players[0], t = g.players[1];
  zh.hand = [card('z1', 'sha', 'spade', 3)];
  t.hand = [card('t1', 'sha', 'heart', 3), card('t2', 'shan', 'club', 4)];
  const hp0 = t.hp;
  await g.trigger('phase.begin', { self: zh, player: zh, phase: 'end' });
  ok(t.hp === hp0 - 1, `平寇：应对手牌更多的角色造成 1 点伤害（${hp0} → ${t.hp}）`);
}

// ================= 9. 沮授 · 渐营 / 矢北 =================
{
  const g = mk(['jushou_ju', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const js = g.players[0];
  g.phase = 'play';
  const c1 = card('c1', 'sha', 'spade', 3), c2 = card('c2', 'shan', 'spade', 4);
  await g.trigger('card.use.after', { self: js, player: js, card: c1 });
  ok(js.flags.lastSuit === 'spade', '渐营：应记录上一张牌花色');
  const h0 = js.hand.length;
  await g.trigger('card.use.after', { self: js, player: js, card: c2 });
  ok(js.hand.length === h0 + 1, `渐营：同花色应摸一张（${h0} → ${js.hand.length}）`);
}
{
  const g = mk(['jushou_ju', 'simayi']);
  const js = g.players[0];
  const h0 = js.hand.length;
  await g.trigger('damage.after', { self: js, player: js, from: g.players[1], to: js, amount: 1, card: card('k', 'sha', 'spade', 5) });
  ok(js.hand.length === h0 + 1, `矢北：黑色牌伤害应摸一张（${h0} → ${js.hand.length}）`);
  const h1 = js.hand.length;
  await g.trigger('damage.after', { self: js, player: js, from: g.players[1], to: js, amount: 1, card: card('r', 'sha', 'heart', 5) });
  ok(js.hand.length === h1 - 1, `矢北：红色牌伤害应弃一张（${h1} → ${js.hand.length}）`);
}

// ================= 10. 蔡邕 · 辟撰 / 通博 =================
{
  const g = mk(['caiyong', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return { cardId: p.hand[0]?.id };
    return null;
  });
  const cy = g.players[0];
  const h0 = cy.hand.length;
  await g.trigger('card.use.after', { self: cy, player: cy, card: card('t1', 'guohe', 'spade', 3) });
  ok(cy.hand.length === h0, `辟撰：摸 1 置 1，手牌数应不变（${h0} → ${cy.hand.length}）`);
  ok(g.deck[g.deck.length - 1] !== undefined, '辟撰：应有牌被置于牌堆顶');
}
{
  const g = mk(['caiyong', 'simayi']);
  const cy = g.players[0];
  cy.hp = cy.maxHp - 2;
  await g.trigger('phase.begin', { self: cy, player: cy, phase: 'discard' });
  ok(cy.flags.handLimit === 2, `通博：手牌上限应 +2（实际 ${cy.flags.handLimit}）`);
}

// ================= 11. 张松 · 强识 / 献图 =================
{
  const g = mk(['zhangsong', 'simayi'], yes());
  const zs = g.players[0], t = g.players[1];
  t.hand = [card('h1', 'sha', 'spade', 3)];
  await g.trigger('phase.begin', { self: zs, player: zs, phase: 'play' });
  ok(!!zs.flags.qiangshiType, '强识：应记录展示牌的类别');
  const h0 = zs.hand.length;
  await g.trigger('card.use.after', { self: zs, player: zs, card: card('u1', 'sha', 'heart', 5) });
  ok(zs.hand.length === h0 + 1, `强识：同类别牌应摸一张（${h0} → ${zs.hand.length}）`);
}
{
  const g = mk(['zhangsong', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'cards') return { cardIds: p.hand.slice(0, req.min || 2).map(c => c.id) };
    return null;
  });
  const zs = g.players[0], t = g.players[1];
  const zh = zs.hand.length, th = t.hand.length;
  await g.trigger('phase.begin', { self: t, player: zs, phase: 'play' });
  ok(t.hand.length === th + 2, `献图：目标应收到 2 张（${th} → ${t.hand.length}）`);
  ok(zs.hand.length === zh, `献图：摸 2 交 2，手牌数应不变（${zh} → ${zs.hand.length}）`);
  ok(t.flags.noTargetSeat === zs.seat, '献图：应记录本回合不能对献图者使用牌');
  const r = g.canUse(t, card('x', 'sha', 'spade', 5), [zs]);
  ok(r.ok === false, '献图：目标不能对献图者使用牌');
}

// ================= 12. 吴懿 · 奔袭 =================
{
  const g = mk(['wuyi', 'sunquan', 'liubei']);
  const wy = g.players[0];
  g.turnPlayer = wy;
  await g.trigger('turn.begin', { self: wy, player: wy });
  ok(wy.flags.benxiMinus === 0, '奔袭：回合开始应清零距离修正');
  await g.trigger('card.use.after', { self: wy, player: wy, card: card('a1', 'guohe', 'spade', 7) });
  ok(wy.flags.benxiMinus === 1, `奔袭：回合内使用牌后距离 -1（实际 ${wy.flags.benxiMinus}）`);
  // 三人局两两距离均为 1 → 触发②
  ok(wy.flags.extraShaTarget === g.turnCount, '奔袭：与所有角色距离为 1 时应开放额外【杀】目标');
  ok(wy.flags.ignoreArmorTurn === g.turnCount, '奔袭：距离全 1 时应置无视防具标记');
  ok(g.armorIgnored(wy), '奔袭：armorIgnored 应为 true');
  const r = g.canUse(wy, card('a2', 'sha', 'spade', 8), [g.players[1], g.players[2]]);
  ok(r.ok === true, `奔袭：应可对两名角色使用【杀】（${r.ok ? 'ok' : r.reason}）`);
  // 未使用牌时不应该有额外目标
  const g2 = mk(['wuyi', 'sunquan', 'liubei']);
  const wy2 = g2.players[0];
  g2.turnPlayer = wy2;
  const r2 = g2.canUse(wy2, card('b1', 'sha', 'spade', 8), [g2.players[1], g2.players[2]]);
  ok(r2.ok === false, '奔袭：未触发时【杀】不能指定两个目标');
  // 距离修正生效（clamp 到 1）
  wy2.flags.benxiMinus = 2;
  ok(g2.distance(wy2, g2.players[1]) === 1, '奔袭：距离下限仍为 1');
}

// ================= 13. 周仓 · 忠勇 =================
{
  const h = (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [gg.players[1].seat] };
    return null;
  };
  const g = mk(['zhoucang', 'sunquan', 'liubei'], h);
  const zc = g.players[0], sq = g.players[1], lb = g.players[2];
  g.turnPlayer = zc; g.turnCount = 3; g.phase = 'play';
  const shan = card('s1', 'shan', 'heart', 8);
  g.discardPile.push(shan);
  sq.hand = [card('k1', 'sha', 'spade', 9)];
  const hp0 = lb.hp;
  await g.trigger('sha.dodged', {
    self: zc, player: zc, target: lb, card: card('sha1', 'sha', 'spade', 7), dodgeCards: [shan],
  });
  ok(sq.hand.some(c => c.id === 's1'), '忠勇：应将打出的【闪】交给选定角色');
  ok(!g.discardPile.includes(shan), '忠勇：交给的【闪】应从弃牌堆移除');
  ok(lb.hp === hp0 - 1, `忠勇：获得者应对原目标再使用一张【杀】（体力 ${hp0} → ${lb.hp}）`);
}
{
  // 交给周仓自己 → 不再追击
  const h = (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [gg.players[0].seat] };
    return null;
  };
  const g = mk(['zhoucang', 'sunquan', 'liubei'], h);
  const zc = g.players[0], sq = g.players[1], lb = g.players[2];
  g.turnPlayer = zc; g.turnCount = 3; g.phase = 'play';
  const shan = card('s2', 'shan', 'diamond', 4);
  g.discardPile.push(shan);
  sq.hand = [card('k2', 'sha', 'spade', 10)];
  const hp0 = lb.hp;
  await g.trigger('sha.dodged', {
    self: zc, player: zc, target: lb, card: card('sha2', 'sha', 'spade', 6), dodgeCards: [shan],
  });
  ok(zc.hand.some(c => c.id === 's2'), '忠勇：可以交给自己');
  ok(lb.hp === hp0, '忠勇：交给自己时不再追击');
}

// ================= 汇总 =================
console.log(`\n=== yj2014check：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
