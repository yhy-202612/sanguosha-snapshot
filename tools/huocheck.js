// 神话再临·火（7 将 / 12 技能）守门测试
// 运行：node tools/huocheck.js
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function ok2(cond, msg) { ok(cond, msg); }

function mk(ids, handler = () => null) {
  const seats = ids.map(id => ({ name: id, isAI: true, general: generalById(id) }));
  const g = new Game({
    seats, mode: getMode('duel'), seed: 771122,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (gg, p, req) => handler(gg, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  g.onState = () => {};
  return g;
}
const yes = (extra) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: true };
  if (req.kind === 'targets') { const ts = req.targets || [1]; return { seats: [ts[ts.length - 1]] }; }
  if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
  if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
  if (req.kind === 'cards') return { cardIds: p.hand.slice(0, req.min || 1).map(c => c.id) };
  return extra ? extra(g, p, req) : null;
};

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['xunyu', '荀彧', 'wei', 3, ['quhu', 'jieming']],
  ['pangtong', '庞统', 'shu', 3, ['lianhuan', 'niepan']],
  ['wolong', '卧龙诸葛亮', 'shu', 3, ['bazhen', 'huoji', 'kanpo']],
  ['taishici', '太史慈', 'wu', 4, ['tianyi']],
  ['pangde', '庞德', 'qun', 4, ['mengjin', 'mashu']],
  ['yuanshao', '袁绍', 'qun', 4, ['luanji', 'xueyi']],
  ['yanliangwenchou', '颜良文丑', 'qun', 4, ['shuangxiong']],
];
ok(GENERALS.filter(g => g.pack === 'huo').length === 8, `火包应为 8 将（含典韦），实际 ${GENERALS.filter(g => g.pack === 'huo').length}`);
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name && gd.kingdom === kingdom && gd.hp === hp, `${id} 基础数据不符`);
  ok(gd && gd.pack === 'huo', `${id} pack 应为 huo`);
  ok(!!gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s, `技能 ${s} 注册异常`);
    ok(sk && (sk.triggers?.length > 0 || sk.active || ['lianhuan', 'huoji', 'kanpo', 'luanji'].includes(s)), `技能 ${s} 是空壳`);
  }
}

// ================= 2. 转化规则 =================
{
  const g = mk(['pangtong', 'wolong', 'yuanshao', 'yanliangwenchou', 'simayi']);
  const [pt, wl, ys, ylw] = g.players;
  ok(g.virtualAllowed(pt, [card('c1', 'sha', 'club', 5)], 'tiesuo'), '连环：梅花手牌可当【铁索连环】');
  ok(!g.virtualAllowed(pt, [card('c2', 'sha', 'heart', 5)], 'tiesuo'), '连环：红桃不能当【铁索连环】');
  ok(g.virtualAllowed(wl, [card('c3', 'sha', 'heart', 5)], 'huogong'), '火计：红色手牌可当【火攻】');
  ok(!g.virtualAllowed(wl, [card('c4', 'sha', 'spade', 5)], 'huogong'), '火计：黑色不能当【火攻】');
  ok(g.virtualAllowed(wl, [card('c5', 'sha', 'spade', 5)], 'wuxie'), '看破：黑色手牌可当【无懈可击】');
  const two = [card('c6', 'sha', 'spade', 3), card('c7', 'shan', 'spade', 9)];
  ok(g.virtualAllowed(ys, two, 'wanjian'), '乱击：两张同花色可当【万箭齐发】');
  ok(!g.virtualAllowed(ys, [card('c8', 'sha', 'spade', 3), card('c9', 'shan', 'heart', 9)], 'wanjian'), '乱击：花色不同不可');
  // 双雄：判定后本回合异色手牌当【决斗】
  ok(!g.virtualAllowed(ylw, [card('d1', 'sha', 'spade', 3)], 'juedou'), '双雄：未发动时不可当【决斗】');
  ylw.flags.shuangxiongTurn = g.turnCount;
  ylw.flags.shuangxiongSuit = 'heart';
  ok(g.virtualAllowed(ylw, [card('d2', 'sha', 'spade', 3)], 'juedou'), '双雄：判定红桃后黑色手牌可当【决斗】');
  ok(!g.virtualAllowed(ylw, [card('d3', 'sha', 'diamond', 3)], 'juedou'), '双雄：同色手牌不可当【决斗】');
  ylw.flags.shuangxiongTurn = g.turnCount - 1;
  ok(!g.virtualAllowed(ylw, [card('d4', 'sha', 'spade', 3)], 'juedou'), '双雄：跨回合失效');
}

// ================= 3. 荀彧 · 驱虎 =================
{
  const g = mk(['xunyu', 'sunquan', 'simayi'], yes());
  const xy = g.players[0], t = g.players[1], v = g.players[2];
  xy.hand = [card('x1', 'sha', 'spade', 13)];
  t.hand = [card('t1', 'sha', 'club', 2)];
  t.hp = xy.hp + 1;
  g.phase = 'play';
  const hpV = v.hp;
  await g.useActiveSkill(xy, 'quhu');
  ok(v.hp === hpV - 1 || xy.hp === xy.maxHp - 1, '驱虎：应向目标指定角色造成伤害或自己受伤');
  ok(g.logs.some(l => /驱虎/.test(l.text)), '驱虎：缺少日志');
}
{
  const g = mk(['xunyu', 'sunquan'], yes());
  const xy = g.players[0], t = g.players[1];
  xy.hand = [card('x1', 'sha', 'spade', 2)];
  t.hand = [card('t1', 'sha', 'club', 13)];
  t.hp = xy.hp + 1;
  g.phase = 'play';
  const hp0 = xy.hp;
  await g.useActiveSkill(xy, 'quhu');
  ok(xy.hp === hp0 - 1, `驱虎：拼点没赢应自己受伤（${hp0} → ${xy.hp}）`);
}
{
  const g = mk(['xunyu', 'sunquan'], yes());
  const xy = g.players[0], t = g.players[1];
  t.hp = xy.hp; // 体力不大于自己 → 无候选
  g.phase = 'play';
  await g.useActiveSkill(xy, 'quhu');
  ok(g.logs.some(l => /驱虎/.test(l.text)), '驱虎：无候选时应有提示日志');
}

// ================= 4. 荀彧 · 节命 =================
{
  const g = mk(['xunyu', 'sunquan'], yes());
  const xy = g.players[0], t = g.players[1];
  t.hand = [card('t1', 'shan', 'club', 2)];
  const h0 = t.hand.length;
  await g.trigger('damage.after', { self: xy, player: xy, from: t, to: xy, amount: 1, card: null });
  ok(t.hand.length > h0, `节命：应令目标补手牌（${h0} → ${t.hand.length}）`);
  ok(g.logs.some(l => /节命/.test(l.text)), '节命：缺少日志');
}

// ================= 5. 庞统 · 涅槃 =================
{
  const g = mk(['pangtong', 'sunquan'], yes());
  const pt = g.players[0], t = g.players[1];
  pt.hp = 0;
  pt.hand = [card('p1', 'sha', 'spade', 3), card('p2', 'shan', 'heart', 4)];
  await g.trigger('dying.begin', { self: pt, from: t });
  ok(pt.flags.niepanUsed === true, '涅槃：应标记已使用（限定技）');
  ok(pt.hand.length === 3, `涅槃：应摸三张（实际 ${pt.hand.length}）`);
  ok(pt.hp === 3, `涅槃：体力应回复至 3（实际 ${pt.hp}）`);
  ok(g.logs.some(l => /涅槃/.test(l.text)), '涅槃：缺少日志');
}
{
  const g = mk(['pangtong', 'sunquan'], yes());
  const pt = g.players[0];
  pt.flags.niepanUsed = true;
  pt.hp = 0;
  await g.trigger('dying.begin', { self: pt, from: g.players[1] });
  ok(pt.hp === 0, '涅槃：限定技用过之后不应再生效');
}

// ================= 6. 卧龙诸葛亮 · 八阵 =================
{
  const g = mk(['wolong', 'sunquan'], yes());
  const wl = g.players[0];
  let found = false;
  for (let i = 0; i < 24 && !found; i++) {
    const data = { self: wl, from: g.players[1], card: card('s1', 'sha', 'spade', 9), dodged: false, extraDodge: 0 };
    await g.trigger('dodge.before', data);
    if (data.dodged) found = true;
  }
  ok(found, '八阵：无防具时应能通过判定打出【闪】');
  wl.equips.armor = card('a1', 'bagua', 'club', 2);
  const data2 = { self: wl, from: g.players[1], card: card('s2', 'sha', 'spade', 9), dodged: false, extraDodge: 0 };
  await g.trigger('dodge.before', data2);
  ok(data2.dodged === false, '八阵：已有防具时不应触发');
}

// ================= 7. 太史慈 · 天义 =================
{
  const g = mk(['taishici', 'sunquan'], yes());
  const ts = g.players[0], t = g.players[1];
  ts.hand = [card('a', 'sha', 'spade', 13)];
  t.hand = [card('b', 'sha', 'club', 1)];
  g.phase = 'play';
  await g.useActiveSkill(ts, 'tianyi');
  ok(ts.flags.tianyiTurn === g.turnCount, '天义：拼点赢应记录本回合强化');
  ok((ts.flags.rangeBonus || 0) >= 1, '天义：攻击范围应 +1');
  ok((ts.flags.shaExtraTurn || 0) >= 1, '天义：应允许额外使用一张【杀】（本回合类 → shaExtraTurn，SG028）');
  ok(ts.flags.tianyiExtraTarget === g.turnCount, '天义：应允许额外指定目标');
}
{
  const g = mk(['taishici', 'sunquan'], yes());
  const ts = g.players[0], t = g.players[1];
  ts.hand = [card('a', 'sha', 'spade', 1)];
  t.hand = [card('b', 'sha', 'club', 13)];
  g.phase = 'play';
  await g.useActiveSkill(ts, 'tianyi');
  ok(ts.flags.banShaTurn === g.turnCount, '天义：没赢应禁止本回合使用【杀】');
  const r = g.canUse(ts, card('c', 'sha', 'heart', 5), [t.seat ?? 1]);
  ok(r.ok === false, '天义：没赢后 canUse 应拒绝【杀】');
}

// ================= 8. 庞德 · 猛进 =================
{
  const g = mk(['pangde', 'sunquan'], yes());
  const pd = g.players[0], t = g.players[1];
  t.hand = [card('t1', 'sha', 'spade', 3)];
  const n0 = t.hand.length;
  await g.trigger('sha.dodged', { self: pd, player: pd, target: t, card: card('s1', 'sha', 'heart', 5) });
  ok(t.hand.length === n0 - 1, `猛进：【杀】被闪避后应弃其一张牌（${n0} → ${t.hand.length}）`);
  ok(g.logs.some(l => /猛进/.test(l.text)), '猛进：缺少日志');
}

// ================= 9. 袁绍 · 血裔 =================
{
  const g = mk(['yuanshao', 'pangde', 'sunquan']); // 袁绍 + 庞德(群) + 孙权(吴)
  const ys = g.players[0];
  await g.trigger('turn.begin', { self: ys, player: ys });
  ok(ys.flags.handLimit === 2, `血裔：1 名其他群雄 → 手牌上限 +2（实际 ${ys.flags.handLimit}）`);
}
{
  const g = mk(['yuanshao', 'pangde', 'yanliangwenchou']);
  const ys = g.players[0];
  await g.trigger('turn.begin', { self: ys, player: ys });
  ok(ys.flags.handLimit === 4, `血裔：2 名其他群雄 → +4（实际 ${ys.flags.handLimit}）`);
}

// ================= 10. 颜良文丑 · 双雄 =================
{
  const g = mk(['yanliangwenchou', 'sunquan'], yes());
  const y = g.players[0];
  const h0 = y.hand.length;
  g.deck.push(card('j1', 'sha', 'diamond', 7)); // 判定牌（红色）
  await g.trigger('phase.begin', { self: y, player: y, phase: 'play' });
  ok(y.flags.shuangxiongTurn === g.turnCount, '双雄：应记录本回合');
  ok(typeof y.flags.shuangxiongSuit === 'string', '双雄：应记录判定牌花色');
  ok(y.hand.length >= h0 + 1, `双雄：应获得判定牌（${h0} → ${y.hand.length}）`);
  ok(g.logs.some(l => /双雄/.test(l.text)), '双雄：缺少日志');
}

// ================= 汇总 =================
console.log(`\n=== huocheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
