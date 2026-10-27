// 阶段 2D 守门测试：界限突破·风火林山（界黄忠 / 界张角 / 界荀彧 / 界魏延 / 界小乔）
// 运行：node tools/jie2check.js
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META, suitOf, cardLabel } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261107,
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
  ['jie_huangzhong', '界黄忠', 'shu', 4, ['jie_liegong']],
  ['jie_zhangjiao', '界张角', 'qun', 3, ['jie_leiji', 'jie_guidao']],
  ['jie_xunyu', '界荀彧', 'wei', 3, ['quhu', 'jie_jieming']],
  ['jie_weiyan', '界魏延', 'shu', 4, ['jie_kuanggu', 'jie_qimou']],
  ['jie_xiaoqiao', '界小乔', 'wu', 3, ['jie_tianxiang', 'jie_hongyan']],
];
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符`);
  ok(gd && gd.pack === 'jie', `${id} pack 应为 jie`);
  ok(gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    if (s === 'quhu') continue; // 复用原版技能
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
  }
}
ok(GENERALS.filter(g => g.pack === 'jie').length === 30,
  `界包应为 30 将（实际 ${GENERALS.filter(g => g.pack === 'jie').length}）`);

// ================= 2. 界黄忠 · 烈弓 =================
{
  // ①点数距离：4 人局 seat0 → seat2 距离 2，攻击范围 1，靠点数 10 够到
  const g = mk(['jie_huangzhong', 'sunquan', 'liubei', 'caocao']);
  const hz = g.players[0], far = g.players[2];
  ok(g.distance(hz, far) === 2, `烈弓：构造需距离 2（实际 ${g.distance(hz, far)}）`);
  ok(g.inAttackRange(hz, far) === false, '烈弓：默认攻击范围应够不到距离 2');
  const sha10 = card('a1', 'sha', 'spade', 10);
  hz.hand = [sha10];
  const r1 = g.canUse(hz, sha10, [far]);
  ok(r1.ok === true, `烈弓：点数 10 应可够到距离 2（${r1.ok ? 'ok' : r1.reason}）`);
  const sha3 = card('a2', 'sha', 'spade', 1);
  hz.hand = [sha3];
  const r2 = g.canUse(hz, sha3, [far]);
  ok(r2.ok === false, '烈弓：点数 1 不应够到距离 2');
  // 无技能的对照
  const g2 = mk(['sunquan', 'liubei', 'caocao', 'jie_huangzhong']);
  const sq = g2.players[0];
  const s2 = card('b1', 'sha', 'spade', 10);
  sq.hand = [s2];
  ok(g2.canUse(sq, s2, [g2.players[2]]).ok === false, '烈弓：无技能者不应享受点数距离');
}
{
  // ②免闪 + 伤害 +1
  const g = mk(['jie_huangzhong', 'sunquan']);
  const hz = g.players[0], t = g.players[1];
  hz.hand = [card('h1', 'sha', 'spade', 5), card('h2', 'sha', 'heart', 6)];
  t.hand = [card('t1', 'shan', 'heart', 2)];
  hz.hp = 4; t.hp = 4;
  const sc = { unavoidable: false };
  await g.trigger('target.after', { self: hz, target: t, card: card('u1', 'sha', 'spade', 5), shaCtx: sc });
  ok(sc.unavoidable === true, '烈弓：手牌数 ≥ 目标时应令其不能使用【闪】');
  ok(sc.bonusBySeat && sc.bonusBySeat[t.seat] === 1, '烈弓：体力值 ≤ 目标时伤害应 +1');
  // 体力更高 / 手牌更少时不触发
  hz.hp = 4; t.hp = 2; hz.hand = [];
  const sc2 = { unavoidable: false };
  await g.trigger('target.after', { self: hz, target: t, card: card('u2', 'sha', 'spade', 5), shaCtx: sc2 });
  ok(sc2.unavoidable !== true, '烈弓：手牌数不足时不应令其不能使用【闪】');
  ok(!sc2.bonusBySeat, '烈弓：体力值高于目标时不应加伤');
}
{
  // ③伤害 +1 真正落地（走 resolveSha）
  const g = mk(['jie_huangzhong', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: false };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const hz = g.players[0], t = g.players[1];
  hz.hp = 3; t.hp = 4;
  hz.hand = [card('h1', 'sha', 'spade', 5), card('h2', 'sha', 'heart', 6)];
  const hp0 = t.hp;
  await g.useCard({ from: hz, card: hz.hand[0], targets: [t] });
  ok(t.hp === hp0 - 2, `烈弓：应造成 2 点伤害（${hp0} → ${t.hp}）`);
}

// ================= 3. 界张角 · 雷击 =================
{
  // 黑桃 → 2 点雷电伤害
  const g = mk(['jie_zhangjiao', 'sunquan'], yes());
  const zj = g.players[0], t = g.players[1];
  zj.hand = [card('s1', 'shan', 'heart', 2)];
  g.deck.push(card('j1', 'sha', 'spade', 1)); // 牌堆顶 = 末尾
  const hp0 = t.hp;
  await g.trigger('respond.need', { self: zj, filter: { name: 'shan' }, kind: 'respond' });
  ok(t.hp === hp0 - 2, `雷击：黑桃应对一名角色造成 2 点雷电伤害（${hp0} → ${t.hp}）`);
  ok(g.logs.some(l => /雷击/.test(l.text)), '缺少雷击日志');
}
{
  // 梅花 → 回复 1 点 + 1 点雷电伤害
  const g = mk(['jie_zhangjiao', 'sunquan'], yes());
  const zj = g.players[0], t = g.players[1];
  zj.hand = [card('s2', 'shan', 'heart', 3)];
  zj.hp = 2;
  g.deck.push(card('j2', 'sha', 'club', 7));
  const hp0 = t.hp, zhp = zj.hp;
  await g.trigger('respond.need', { self: zj, filter: { name: 'shan' }, kind: 'respond' });
  ok(zj.hp === Math.min(zj.maxHp, zhp + 1), `雷击：梅花应回复 1 点体力（${zhp} → ${zj.hp}）`);
  ok(t.hp === hp0 - 1, `雷击：梅花应对一名角色造成 1 点雷电伤害（${hp0} → ${t.hp}）`);
}
{
  // 非黑桃/梅花（红桃）→ 无效果
  const g = mk(['jie_zhangjiao', 'sunquan'], yes());
  const zj = g.players[0], t = g.players[1];
  zj.hand = [card('s3', 'shan', 'heart', 4)];
  g.deck.push(card('j3', 'sha', 'heart', 8));
  const hp0 = t.hp;
  await g.trigger('respond.need', { self: zj, filter: { name: 'shan' }, kind: 'respond' });
  ok(t.hp === hp0, '雷击：红桃判定不应造成伤害');
}

// ================= 4. 界张角 · 鬼道 =================
{
  const g = mk(['jie_zhangjiao', 'sunquan'], yes());
  const zj = g.players[0];
  zj.hand = [card('g1', 'sha', 'spade', 5)];
  const n0 = zj.hand.length;
  const data = { self: g.players[1], suit: 'heart', num: 3 };
  await g.trigger('judge.before', data);
  ok(data.suit === 'spade' && data.num === 5, `鬼道：应以黑色牌替换判定（${data.suit}${data.num}）`);
  ok(zj.hand.length === n0 - 1 + 1, `鬼道：黑桃 2~9 应摸一张（${n0} → ${zj.hand.length}）`);
}
{
  // 黑桃 10 不摸牌
  const g = mk(['jie_zhangjiao', 'sunquan'], yes());
  const zj = g.players[0];
  zj.hand = [card('g2', 'sha', 'spade', 10)];
  const n0 = zj.hand.length;
  const data = { self: g.players[1], suit: 'heart', num: 3 };
  await g.trigger('judge.before', data);
  ok(zj.hand.length === n0 - 1, `鬼道：黑桃 10 不应摸牌（${n0} → ${zj.hand.length}）`);
}

// ================= 5. 界荀彧 · 节命 =================
{
  const g = mk(['jie_xunyu', 'sunquan'], yes());
  const xy = g.players[0], t = g.players[1];
  t.hp = 1; t.maxHp = 4;
  t.hand = [card('c1', 'sha', 'spade', 5)];
  await g.trigger('damage.after', { self: xy, to: xy, amount: 1, from: t });
  ok(t.hand.length === 4, `节命：应摸至体力上限 4（实际 ${t.hand.length}）`);
}
{
  // 手牌超出 → 弃至 X
  const g = mk(['jie_xunyu', 'sunquan'], yes());
  const xy = g.players[0], t = g.players[1];
  t.maxHp = 3; t.hp = 3;
  t.hand = [1, 2, 3, 4, 5].map(i => card('x' + i, 'sha', 'spade', i));
  await g.trigger('damage.after', { self: xy, to: xy, amount: 1, from: t });
  ok(t.hand.length === 3, `节命：手牌应弃至 3 张（实际 ${t.hand.length}）`);
}

// ================= 6. 界魏延 · 狂骨 =================
{
  const g = mk(['jie_weiyan', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 1 }; // 摸一张牌
    return null;
  });
  const wy = g.players[0], t = g.players[1];
  const n0 = wy.hand.length;
  await g.trigger('damage.after', { self: t, to: t, amount: 1, from: wy });
  ok(wy.hand.length === n0 + 1, `狂骨：选摸牌应 +1（${n0} → ${wy.hand.length}）`);
}
{
  const g = mk(['jie_weiyan', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 }; // 回复
    return null;
  });
  const wy = g.players[0], t = g.players[1];
  wy.hp = 2;
  const hp0 = wy.hp;
  await g.trigger('damage.after', { self: t, to: t, amount: 1, from: wy });
  ok(wy.hp === hp0 + 1, `狂骨：选回复应 +1 体力（${hp0} → ${wy.hp}）`);
}

// ================= 7. 界魏延 · 奇谋 =================
{
  const g = mk(['jie_weiyan', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 }; // 失去 1 点
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const wy = g.players[0];
  wy.hp = 4;
  const h0 = wy.hp;
  await g.useActiveSkill(wy, 'jie_qimou');
  ok(wy.hp === h0 - 1, `奇谋：应失去 1 点体力（${h0} → ${wy.hp}）`);
  ok(wy.flags.qimouUsed === true, '奇谋：应标记限定技已使用');
  ok((wy.flags.qimouSha || 0) === 1, '奇谋：应获得 1 次额外【杀】');
  ok((wy.flags.distanceMinus || 0) === 1, '奇谋：本回合距离应 -1');
  // 额外杀次数生效
  const sha = card('q1', 'sha', 'spade', 5);
  wy.hand = [sha, card('q2', 'sha', 'heart', 6)];
  wy.flags.shaUsed = 1;
  ok(g.canUse(wy, wy.hand[0], [g.players[1]]).ok === true, '奇谋：应可额外使用【杀】');
  // 再次发动应被拒
  await g.useActiveSkill(wy, 'jie_qimou');
  ok(wy.hp === h0 - 1, '奇谋：限定技不应重复发动');
}

// ================= 8. 界小乔 · 天香 =================
{
  // 选项 1：转移伤害，然后摸 X 张
  const g = mk(['jie_xiaoqiao', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const xq = g.players[0], t = g.players[1];
  xq.hand = [card('h1', 'sha', 'heart', 7)];
  t.hp = 2; t.maxHp = 4;
  const data = { self: xq, to: xq, from: t, amount: 1, nature: 'normal', canceled: false };
  await g.trigger('damage.before', data);
  ok(data.to === t, '天香：选项 1 应把伤害转移给目标');
  ok(!data.canceled, '天香：选项 1 不应取消伤害');
  ok(typeof data.afterDamage === 'function', '天香：选项 1 应挂摸牌回调');
}
{
  // 选项 2：取消伤害，令其失去 1 点体力并获得弃置的牌
  const g = mk(['jie_xiaoqiao', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 1 };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const xq = g.players[0], t = g.players[1];
  const heart = card('h2', 'sha', 'heart', 8);
  xq.hand = [heart];
  const hp0 = t.hp;
  const data = { self: xq, to: xq, from: t, amount: 1, nature: 'normal', canceled: false };
  await g.trigger('damage.before', data);
  ok(data.canceled === true, '天香：选项 2 应取消此伤害');
  ok(t.hp === hp0 - 1, `天香：选项 2 应令其失去 1 点体力（${hp0} → ${t.hp}）`);
  ok(t.hand.some(c => c.id === 'h2'), '天香：选项 2 其应获得弃置的牌');
  ok(!g.discardPile.some(c => c.id === 'h2'), '天香：弃置的牌应从弃牌堆移出');
}

// ================= 9. 界小乔 · 红颜 =================
{
  const g = mk(['jie_xiaoqiao', 'sunquan']);
  const xq = g.players[0];
  const spade = card('r1', 'sha', 'spade', 9);
  ok(suitOf(xq, spade) === 'heart', '红颜：黑桃牌应视为红桃');
  // 装备区有红桃牌 → 手牌上限 = 体力上限
  xq.hp = 1; xq.maxHp = 3;
  xq.equips.weapon = card('w1', 'qinggang', 'heart', 6);
  await g.trigger('phase.begin', { self: xq, phase: 'discard' });
  ok((xq.flags.handLimit || 0) >= 2, `红颜：装备区有红桃牌时手牌上限应提升（实际 handLimit=${xq.flags.handLimit}）`);
}
{
  // 装备区无红桃牌 → 不提升
  const g = mk(['jie_xiaoqiao', 'sunquan']);
  const xq = g.players[0];
  xq.hp = 1; xq.maxHp = 3;
  xq.equips.weapon = card('w2', 'qinggang', 'club', 6);
  await g.trigger('phase.begin', { self: xq, phase: 'discard' });
  ok(!xq.flags.handLimit, '红颜：装备区无红桃牌时不应提升手牌上限');
}

// ================= 汇总 =================
console.log(`\n=== jie2check：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
