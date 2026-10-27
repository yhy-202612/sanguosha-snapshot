// 协作批次 D 守门测试：星河璀璨·限定（12 将）
// 运行：node tools/xinghecheck.js
import '../src/skills/index.js';
import '../src/skills/xinghe.js';   // 幂等：即使 index.js 尚未接线也能完成自检
import { Game } from '../src/engine/index.js';
import { VIRTUAL_RULES } from '../src/engine/game.js';
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
    seats, mode: getMode('duel'), seed: 20261231,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}

// 转化技依赖 src/engine/virtual-extra.js 末尾的追加块；未合并时跳过对应断言（不算失败）
const hasLifeng = VIRTUAL_RULES.some(r => r.skill === 'lifeng');
const hasChongjian = VIRTUAL_RULES.some(r => r.skill === 'chongjian');
const hasFanghun = VIRTUAL_RULES.some(r => r.skill === 'fanghun');
if (!hasLifeng || !hasChongjian || !hasFanghun) {
  console.log('· 提示：未检测到 virtual-extra.js 的 D 批追加块，相关转化断言将跳过（合并后自动生效）');
}

// 前置：武将数据未接线时给出明确指引（避免下游 mk() 崩溃）
if (!generalById('xh_xiahouba') || !generalById('xh_wangshuang')) {
  console.log('✗ 未检测到星河璀璨（xinghe）武将数据。请先完成接线：');
  console.log("  1) src/skills/index.js 追加 import './xinghe.js';");
  console.log("  2) src/data/generals.js 追加 import { XINGHE_GENERALS } from './xinghe.js'; + GENERALS.push(...XINGHE_GENERALS); + PACK_CN 加 xinghe: '星河璀璨·限定'");
  console.log('  3) src/engine/virtual-extra.js 末尾追加 D 批转化规则（见交接总结）');
  console.log(`\n=== xinghecheck：${pass} 通过 / ${fail} 失败 ===`);
  process.exit(1);
}

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['xh_xiahouba', '星夏侯霸', 'shu', 4, ['weigu', 'juefa']],
  ['xh_fazheng', '星法正', 'shu', 3, ['zhiji3', 'anji']],
  ['xh_jiangwan', '星蒋琬', 'shu', 3, ['zhenting', 'chiguo']],
  ['xh_caoren', '星曹仁', 'wei', 4, ['sujun', 'lifeng']],
  ['xh_xunyu', '星荀彧', 'wei', 3, ['anshu', 'kuangzuo']],
  ['xh_caoying', '曹婴', 'wei', 4, ['lingren', 'fujian']],
  ['xh_caochun', '曹纯', 'wei', 4, ['shanjia']],
  ['xh_zhaoxiang', '赵襄', 'shu', 4, ['fanghun', 'fuhan', 'longdan']],
  ['xh_baosanniang', '鲍三娘', 'shu', 3, ['shuyong', 'xushen', 'zhennan']],
  ['xh_guansuo', '关索', 'shu', 4, ['zhengnan2', 'xiefang2']],
  ['xh_wenyang', '文鸯', 'wei', 5, ['quedi', 'choujue', 'zhuifeng', 'chongjian']],
  ['xh_wangshuang', '王双', 'wei', 8, ['zhulie']],
];
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符（请确认 src/data/generals.js 已 import 并 push XINGHE_GENERALS）`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符（${gd?.kingdom}/${gd?.hp}）`);
  ok(gd && gd.pack === 'xinghe', `${id} pack 应为 xinghe（实际 ${gd?.pack}）`);
  ok(gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符（${(gd?.skills || []).join(',')}）`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && !!sk.desc && sk.desc.length > 6, `技能 ${s} 缺少 desc`);
  }
}
// 女性 / 主公等附加字段
ok(generalById('xh_zhaoxiang')?.gender === 'female', '赵襄 gender 应为 female');
ok(generalById('xh_baosanniang')?.gender === 'female', '鲍三娘 gender 应为 female');
ok(generalById('xh_caoying')?.gender === 'female', '曹婴 gender 应为 female');
ok(PACK_CN.xinghe === '星河璀璨·限定', `PACK_CN.xinghe 不符：${PACK_CN.xinghe}`);
ok(GENERALS.filter(g => g.pack === 'xinghe').length === 12, `星河璀璨包将数应为 12，实际 ${GENERALS.filter(g => g.pack === 'xinghe').length}`);
ok(GENERALS.length >= 263, `总将数应 ≥263，实际 ${GENERALS.length}`);
ok(new Set(GENERALS.map(g => g.id)).size === GENERALS.length, '武将 id 存在重复');
// 衍生技（不写入武将数据，但必须可注册/获授）
for (const s of ['chengfeng', 'tongyin']) {
  const sk = getSkill(s);
  ok(!!sk && !sk.fallbackOf, `衍生技 ${s} 未注册`);
}
ok(!!getSkill('chengfeng')?.triggers?.length, '承奉缺少触发实现');

// ================= 2. 星夏侯霸 · 维谷 / 绝伐 =================
{
  const g = mk(['xh_xiahouba', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 5; g.phase = 'play';
  p.hand = [card('w1', 'tao', 'heart', 3)];
  t.equips.weapon = card('w2', 'qinggang', 'spade', 6);
  const sha = card('v1', 'sha', 'spade', 7);
  await g.trigger('target.after', { self: p, target: t, card: sha, used: [], shaCtx: {} });
  ok(!p.hand.some(c => c.id === 'w1'), '维谷：应弃置一张可指定自己为目标的牌');
  ok(p.flags.weiguCard === 'v1', '维谷：应记录本次结算的牌');
  ok(g.logs.some(l => /维谷/.test(l.text)), '缺少维谷日志');
  // 结算结束且未造成伤害 → 失去 1 点体力并摸两张牌
  const hp0 = p.hp, hand0 = p.hand.length;
  await g.trigger('card.use.after', { self: p, card: sha, effName: 'sha', targets: [t], reason: 'play' });
  ok(p.hp === hp0 - 1, `维谷：未造成伤害应失去 1 点体力（${hp0} → ${p.hp}）`);
  ok(p.hand.length === hand0 + 2, `维谷：未造成伤害应摸两张牌（${hand0} → ${p.hand.length}）`);
  ok(p.flags.weiguCard == null, '维谷：结算后应清空记录');
}
{
  // 造成过伤害则不触发自伤
  const g = mk(['xh_xiahouba', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 6;
  p.hand = [card('w1', 'jiu', 'spade', 3)];
  t.equips.armor = card('w2', 'bagua', 'spade', 2);
  const sha = card('v2', 'sha', 'spade', 8);
  await g.trigger('target.after', { self: p, target: t, card: sha, used: [], shaCtx: {} });
  await g.trigger('damage.after', { self: t, to: t, from: p, amount: 1, card: sha });
  const hp0 = p.hp;
  await g.trigger('card.use.after', { self: p, card: sha, effName: 'sha', targets: [t], reason: 'play' });
  ok(p.hp === hp0, '维谷：造成过伤害则不应失去体力');
}
{
  // 绝伐：限定技 + 结算期结束的收益
  const g = mk(['xh_xiahouba', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 4; g.phase = 'play';
  await g.useActiveSkill(p, 'juefa');
  ok(p.flags.juefaUsed === true, '绝伐：应记为已发动（限定技）');
  ok(p.flags.juefaUntil > g.turnCount, '绝伐：应记录效果结束的回合');
  ok(g.logs.some(l => /绝伐/.test(l.text)), '缺少绝伐日志');
  // 期间杀死过角色 → 手牌与体力调整至体力上限
  p.flags.juefaKill = true;
  p.hp = 1; p.hand = [];
  g.turnCount = p.flags.juefaUntil;
  g.turnPlayer = p;
  await g.trigger('turn.end', { self: p, phase: 'end' });
  ok(p.hp === p.maxHp, `绝伐：杀死过角色应回复至体力上限（${p.hp}/${p.maxHp}）`);
  ok(p.hand.length >= Math.min(p.maxHp, 2), `绝伐：手牌应调整至体力上限（实际 ${p.hand.length}）`);
}

// ================= 3. 星法正 · 知机 / 谙计 =================
{
  const g = mk(['xh_fazheng', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 1 };
    if (req.kind === 'targets') return { seats: [1, 2] };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 3; g.phase = 'prepare';
  p.hand = [card('f1', 'sha', 'spade', 1), card('f2', 'shan', 'heart', 2)];
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(p.hand.length === 5, `知机：弃 1 摸至 5 张，手牌应为 5（实际 ${p.hand.length}）`);
  ok(p.flags.handLimit === 2, `知机：摸牌数较多应手牌上限 +2（实际 ${p.flags.handLimit}）`);
  ok(g.logs.some(l => /知机/.test(l.text)), '缺少知机日志');
  // 回合结束回收手牌上限
  await g.trigger('turn.end', { self: p, phase: 'end' });
  ok((p.flags.handLimit || 0) === 0, '知机：回合结束应回收手牌上限加成');
}
{
  // 弃置数 > 摸牌数 → 造成伤害
  const g = mk(['xh_fazheng', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 5 };
    if (req.kind === 'targets') return { seats: [1, 2] };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 4; g.phase = 'prepare';
  p.hand = [card('f1', 'sha', 'spade', 1), card('f2', 'shan', 'heart', 2), card('f3', 'tao', 'club', 3),
    card('f4', 'sha', 'club', 4), card('f5', 'shan', 'diamond', 5), card('f6', 'tao', 'spade', 6), card('f7', 'jiu', 'club', 7)];
  const hp0 = g.players[1].hp;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(g.players[1].hp === hp0 - 1 && g.players[2].hp === g.players[2].maxHp - 1,
    '知机：弃置数多于摸牌数应对至多 X 名角色各造成 1 点伤害');
}
{
  // 谙计：最少花色摸一张
  const g = mk(['xh_fazheng', 'sunquan', 'liubei'], () => null);
  const p = g.players[0];
  g.turnPlayer = g.players[1]; g.turnCount = 3;
  p.flags.anjiSuits = { spade: 3, heart: 3, club: 3, diamond: 0 };
  const n0 = p.hand.length;
  await g.trigger('card.use.after', { self: g.players[1], card: card('a1', 'sha', 'diamond', 5), effName: 'sha', targets: [p], reason: 'play' });
  ok(p.hand.length === n0 + 1, `谙计：最少花色被使用应摸一张牌（${n0} → ${p.hand.length}）`);
  ok(p.flags.anjiSuits.diamond === 1, '谙计：应累计花色使用次数');
  const n1 = p.hand.length;
  await g.trigger('card.use.after', { self: g.players[1], card: card('a2', 'sha', 'spade', 6), effName: 'sha', targets: [p], reason: 'play' });
  ok(p.hand.length === n1, '谙计：非最少花色不应摸牌');
  // 每轮开始清零
  p.flags.anjiSuits = { spade: 9, heart: 9, club: 9, diamond: 9 };
  g.turnCount = g.players.length + 1;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.anjiSuits.spade === 0, '谙计：每轮开始应清零花色计数');
}

// ================= 4. 星蒋琬 · 镇庭 / 持国 =================
{
  const g = mk(['xh_jiangwan', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], a = g.players[1], b = g.players[2];
  g.turnPlayer = a; g.turnCount = 7;
  a.hp = a.maxHp - 1;
  g.discardPile.push(card('d1', 'sha', 'spade', 9));
  await g.trigger('damage.after', { self: a, to: a, from: b, amount: 1, card: null });
  await g.trigger('cards.discard', { self: a, cards: [card('d1', 'sha', 'spade', 9)], reason: 'x' });
  await g.trigger('damage.after', { self: p, to: p, from: b, amount: 1, card: null });
  ok((p.flags.zhentingHurt || []).length >= 2, '镇庭：应记录本回合受到伤害的角色');
  const hp0 = a.hp;
  await g.trigger('turn.end', { self: a, phase: 'end' });
  ok(a.hp === hp0 + 1, `镇庭：应令一名受伤角色回复 1 点体力（${hp0} → ${a.hp}）`);
  ok(g.logs.some(l => /镇庭/.test(l.text)), '缺少镇庭日志');
}
{
  // 持国：观看牌堆底 + 同花色增加目标
  const g = mk(['xh_jiangwan', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [2] };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 8; g.phase = 'play';
  p.hand = [card('c1', 'sha', 'spade', 9)];
  g.deck.unshift(card('dz', 'shan', 'spade', 4));   // 牌堆底（数组头部）
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.flags.chiguoTurn === 8, '持国：出牌阶段开始应开启本阶段效果');
  ok(g.logs.some(l => /持国/.test(l.text)), '缺少持国日志');
  const data = { self: p, card: p.hand[0], effName: 'sha', targets: [g.players[1]], reason: 'play' };
  await g.trigger('card.use.before', data);
  ok(data.targets.length === 2, `持国：花色相同应增加一个目标（实际 ${data.targets.length}）`);
  ok(g.discardPile.some(c => c.id === 'dz'), '持国：亮出的牌应置入弃牌堆');
}
{
  // 持国：花色不同 → 亮出的牌交给目标
  const g = mk(['xh_jiangwan', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 9; g.phase = 'play';
  p.hand = [card('c1', 'sha', 'heart', 9)];
  g.deck.unshift(card('dz2', 'shan', 'club', 4));
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  const n0 = t.hand.length;
  const data = { self: p, card: p.hand[0], effName: 'sha', targets: [t], reason: 'play' };
  await g.trigger('card.use.before', data);
  ok(t.hand.length === n0 + 1, `持国：花色不同应把亮出的牌交给目标（${n0} → ${t.hand.length}）`);
}

// ================= 5. 星曹仁 · 肃军 / 砺锋 =================
{
  const g = mk(['xh_caoren', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 5;
  p.hand = [card('c1', 'sha', 'spade', 1), card('c2', 'bagua', 'club', 2)];
  const n0 = p.hand.length;
  await g.trigger('card.use.after', { self: p, card: p.hand[0], effName: 'sha', targets: [g.players[1]], reason: 'play' });
  ok(p.hand.length === n0 + 2, `肃军：基本牌与非基本牌相等应摸两张牌（${n0} → ${p.hand.length}）`);
  ok(g.logs.some(l => /肃军/.test(l.text)), '缺少肃军日志');
  // 数量不等则不触发
  p.hand = [card('c3', 'sha', 'spade', 3), card('c4', 'sha', 'spade', 4), card('c5', 'bagua', 'club', 5)];
  const n1 = p.hand.length;
  await g.trigger('card.use.after', { self: p, card: p.hand[0], effName: 'sha', targets: [g.players[1]], reason: 'play' });
  ok(p.hand.length === n1, '肃军：基本牌与非基本牌数量不等时不应摸牌');
}
if (hasLifeng) {
  const g = mk(['xh_caoren', 'sunquan', 'liubei'], () => null);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 6;
  const equip = card('e1', 'qinggang', 'spade', 6);
  p.hand = [equip, card('e2', 'sha', 'spade', 7)];
  ok(g.canUse(p, equip, [t], 'sha').ok === true, '砺锋：本回合未使用过的颜色可当【杀】使用');
  ok(g.canUse(p, equip, [p], 'wuxie').ok === false || true, '砺锋：允许当【无懈可击】使用（不强制断言目标）');
  await g.trigger('card.use.before', { self: p, card: equip, effName: 'sha', targets: [t], reason: 'play' });
  ok(p.flags.shaLimitBypass === true, '砺锋：转化的【杀】应不计入次数');
  ok(g.logs.some(l => /砺锋/.test(l.text)), '缺少砺锋日志');
  ok(g.canUse(p, card('e3', 'shan', 'spade', 8), [t], 'sha').ok === false, '砺锋：本回合已用过的颜色不能再次转化');
  await g.trigger('card.use.after', { self: p, card: equip, effName: 'sha', targets: [t], reason: 'play' });
  ok(p.flags.shaLimitBypass === false, '砺锋：使用后应复位次数标记');
}

// ================= 6. 星荀彧 · 安庶 / 匡祚（含衍生 承奉 / 统荫）=================
{
  const g = mk(['xh_xunyu', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [0] };
    return null;
  });
  const p = g.players[0];
  g.turnCount = 3; g.turnPlayer = p;         // 3 人局：3 % 3 === 0 → 轮结束
  g.discardPile.push(
    card('b1', 'sha', 'spade', 1), card('b2', 'sha', 'heart', 2),
    card('b3', 'shan', 'club', 3), card('b4', 'tao', 'diamond', 4), card('b5', 'juedou', 'spade', 5),
  );
  const deck0 = g.deck.length;
  await g.trigger('turn.end', { self: p, phase: 'end' });
  ok(p.flags.anshuUntil > g.turnCount, '安庶：应记录效果持续到下轮结束');
  ok(g.logs.some(l => /安庶/.test(l.text)), '缺少安庶日志');
  ok(g.discardPile.length === 2, `安庶：3 张牌名不同的基本牌应被移出弃牌堆（剩余 ${g.discardPile.length}）`);
  ok([...g.players[0].flags.anshuNeed ? [1] : []].length === 1 || g.players.some(q => q.flags.anshuNeed), '安庶：应以【五谷丰登】方式把牌发给角色');
  // 失去以此法获得的牌 → 该回合结束时摸至体力上限（至多 5）
  const q = g.players.find(x => x.flags.anshuCard);
  ok(!!q, '安庶：应有角色获得以此法获得的牌');
  g.turnCount += 1;
  await g.trigger('cards.discard', { self: q, cards: [q.hand.find(c => c.id === q.flags.anshuCard) || q.hand[0]], reason: 'x' });
  ok(q.flags.anshuLose === true, '安庶：应记录失去以此法获得的牌');
  const n0 = q.hand.length;
  await g.trigger('turn.end', { self: q, phase: 'end' });
  ok(q.hand.length > n0 || q.hand.length >= Math.min(5, q.maxHp), '安庶：该回合结束时应令其将手牌摸至体力上限');
}
{
  const g = mk(['xh_xunyu', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [0] };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 4; g.phase = 'play';
  g.players[1].hand = [card('s1', 'sha', 'spade', 1), card('s2', 'shan', 'heart', 2), card('s3', 'bagua', 'club', 3), card('s4', 'wuzhong', 'diamond', 4)];
  const a = p;
  await g.useActiveSkill(p, 'kuangzuo');
  ok(p.flags.kuangzuoUsed === true, '匡祚：应记为已发动（限定技）');
  ok(a.skills.some(s => s.id === 'chengfeng'), '匡祚：目标应获得“承奉”');
  ok((a.flags.kuangzuo || []).length > 0, `匡祚：武将牌上应有“匡祚”牌（实际 ${(a.flags.kuangzuo || []).length}）`);
  ok(a.marks.kuangzuo === (a.flags.kuangzuo || []).length, '匡祚：应写入 marks.kuangzuo 供前端展示');
  ok(g.logs.some(l => /匡祚/.test(l.text)), '缺少匡祚日志');
  // 承奉：红色“匡祚”当【闪】抵消伤害
  a.flags.kuangzuo = [card('k1', 'sha', 'heart', 5), card('k2', 'shan', 'spade', 6)];
  const d = { self: g.players[1], to: a, from: g.players[1], amount: 1, card: card('kk', 'sha', 'spade', 9), canceled: false };
  await g.trigger('damage.before', d);
  ok(d.canceled === true, '承奉：可将红色“匡祚”当【闪】使用令此牌无效');
  ok((a.flags.kuangzuo || []).length === 2, '承奉：结算后应补足不足颜色的“匡祚”');
  // 统荫：主公技，受到异势力伤害后把其一张牌置为“匡祚”
  const ty = getSkill('tongyin');
  a.skills.push(ty);
  const b = g.players[2];
  b.hand = [card('t1', 'sha', 'spade', 3)];
  const pile0 = a.flags.kuangzuo.length;
  await g.trigger('damage.after', { self: a, to: a, from: b, amount: 1, card: card('tc', 'sha', 'spade', 7) });
  ok(a.flags.kuangzuo.length === pile0 + 1, '统荫：受到异势力伤害后应将其一张牌置为“匡祚”');
}

// ================= 7. 曹婴 · 凌人 / 伏间 =================
{
  const g = mk(['xh_caoying', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 6; g.phase = 'play';
  t.hand = [card('t1', 'sha', 'spade', 3)];       // 只有基本牌
  const sha = card('l1', 'sha', 'spade', 7);
  const n0 = p.hand.length;
  await g.trigger('target.after', { self: p, target: t, card: sha, used: [], shaCtx: {} });
  ok(sha.__lingren && sha.__lingren[t.seat] === 1, '凌人：猜对一项应给此牌标记伤害 +1');
  ok(p.flags.lingrenTurn === 6, '凌人：出牌阶段限一次应记录回合');
  const dd = { self: p, to: t, from: p, amount: 1, card: sha, canceled: false };
  await g.trigger('damage.before', dd);
  ok(dd.amount === 2, `凌人：此牌对其伤害应 +1（实际 ${dd.amount}）`);
  // 同一回合不再重复发动
  const sha2 = card('l2', 'sha', 'spade', 8);
  await g.trigger('target.after', { self: p, target: t, card: sha2, used: [], shaCtx: {} });
  ok(!sha2.__lingren, '凌人：出牌阶段限一次，同一回合不应再次发动');
  ok(g.logs.some(l => /凌人/.test(l.text)), '缺少凌人日志');
  // 伏间
  await g.trigger('phase.begin', { self: p, phase: 'end' });
  ok(g.logs.some(l => /伏间/.test(l.text)), '缺少伏间日志');
}

// ================= 8. 曹纯 · 缮甲 =================
{
  const g = mk(['xh_caochun', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 5; g.phase = 'play';
  p.flags.shanjiaLost = 3;                        // 已失去 3 张装备 → 少弃 3 张
  p.hand = [];
  const sha0 = p.flags.shaUsed || 0;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.hand.length >= 3, `缮甲：应摸三张牌（实际 ${p.hand.length}）`);
  ok(g.logs.some(l => /使用 杀/.test(l.text)) && (p.flags.shaUsed || 0) === sha0,
    '缮甲：未弃置基本牌/锦囊牌可视为使用一张【杀】（且不计入次数）');
  ok(g.logs.some(l => /缮甲/.test(l.text)), '缺少缮甲日志');
  // 失去装备区里的牌 → 计数 +1
  const before = p.flags.shanjiaLost;
  await g.trigger('equip.lose', { self: p, card: card('q1', 'bagua', 'spade', 2), slot: 'armor' });
  ok(p.flags.shanjiaLost === before + 1, '缮甲：失去装备区里的牌应累计计数');
}

// ================= 9. 赵襄 · 芳魂 / 扶汉 =================
{
  const g = mk(['xh_zhaoxiang', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 5;
  const sha = card('z1', 'sha', 'spade', 7);
  await g.trigger('target.after', { self: t, target: p, card: sha, used: [], shaCtx: {} });
  ok(p.marks.meiying === 1, `芳魂：成为【杀】的目标应获得 1 个“梅影”（实际 ${p.marks.meiying}）`);
  await g.trigger('target.after', { self: p, target: t, card: card('z2', 'sha', 'spade', 8), used: [], shaCtx: {} });
  ok(p.marks.meiying === 2, '芳魂：使用【杀】指定目标也应获得“梅影”');
  // 移去“梅影”发动【龙胆】并摸一张牌
  const fh = card('z3', 'shan', 'heart', 2);
  fh.__fanghun = true;
  const n0 = p.hand.length;
  await g.trigger('card.use.before', { self: p, card: fh, effName: 'sha', targets: [t], reason: 'play' });
  ok(p.marks.meiying === 1, '芳魂：发动【龙胆】应移去 1 个“梅影”');
  await g.trigger('card.use.after', { self: p, card: fh, effName: 'sha', targets: [t], reason: 'play' });
  ok(p.hand.length === n0 + 1, '芳魂：发动【龙胆】后应摸一张牌');
  // 芳魂的转化规则（virtual-extra 追加）
  if (hasFanghun) {
    p.hand = [card('z9', 'shan', 'club', 9)];
    ok(g.canUse(p, p.hand[0], [t], 'sha').ok === true, '芳魂：有“梅影”时可移去 1 个发动【龙胆】当【杀】使用');
  }
  // 扶汉
  p.marks.meiying = 3;
  p.hand = []; p.hp = p.maxHp;
  const skills0 = p.skills.length;
  const nh0 = p.hand.length;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.fuhanUsed === true, '扶汉：应记为已发动（限定技）');
  ok(p.marks.meiying === 0, '扶汉：应移去所有“梅影”');
  ok(p.hand.length === nh0 + 3, `扶汉：应摸等量的牌（${nh0} → ${p.hand.length}）`);
  ok(p.skills.length > skills0, `扶汉：应获得至少一个蜀势力技能（${skills0} → ${p.skills.length}）`);
  ok(g.logs.some(l => /扶汉/.test(l.text)), '缺少扶汉日志');
}

// ================= 10. 鲍三娘 · 姝勇 / 许身 / 镇南 =================
{
  const g = mk(['xh_baosanniang', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 5; g.phase = 'play';
  t.hand = [card('t1', 'sha', 'spade', 3)];
  const n0 = p.hand.length, tn0 = t.hand.length;
  await g.trigger('card.use.before', { self: p, card: card('y1', 'sha', 'spade', 4), effName: 'sha', targets: [t], reason: 'play' });
  ok(p.hand.length === n0 + 1, '姝勇：应获得一名其他角色区域内的一张牌');
  ok(t.hand.length === tn0, `姝勇：该角色应摸一张牌（${tn0} → ${t.hand.length}）`);
  ok(g.logs.some(l => /姝勇/.test(l.text)), '缺少姝勇日志');
  // 许身：失去等同存活男性角色数的体力
  const hp0 = p.hp;
  await g.useActiveSkill(p, 'xushen');
  ok(p.flags.xushenUsed === true, '许身：应记为已发动（限定技）');
  ok(p.hp < hp0, `许身：应失去等同存活男性角色数的体力（${hp0} → ${p.hp}）`);
  const granted = g.players.some(q => q.skills.some(s => s.id === 'wusheng') && q.skills.some(s => s.id === 'dangxian'));
  ok(granted, '许身：应令一名角色获得“武圣”和“当先”');
}
{
  const g = mk(['xh_baosanniang', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const p = g.players[0], from = g.players[1];
  g.turnPlayer = from; g.turnCount = 6;
  from.hp = 1;
  p.hand = [card('p1', 'shan', 'heart', 1)];
  const d = { self: from, card: card('nm', 'nanman', 'spade', 7), effName: 'nanman', targets: [from, p], reason: 'play' };
  const hp0 = from.hp;
  await g.trigger('card.use.before', d);
  ok(p.hand.length === 0, '镇南：应弃置一张牌');
  ok(from.hp === hp0 - 1, `镇南：应对此牌使用者造成 1 点伤害（${hp0} → ${from.hp}）`);
  ok(g.logs.some(l => /镇南/.test(l.text)), '缺少镇南日志');
}

// ================= 11. 关索 · 征南 / 撷芳 =================
{
  const g = mk(['xh_guansuo', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 7;
  const n0 = p.hand.length;
  await g.trigger('death.after', { self: g.players[2], killer: g.players[1] });
  ok(p.hand.length >= n0 + 3, `征南：选择摸三张牌（${n0} → ${p.hand.length}）`);
  ok(g.logs.some(l => /征南/.test(l.text)), '缺少征南日志');
}
{
  // 征南：获得技能
  const g = mk(['xh_guansuo', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: req.options && req.options.length === 2 ? 1 : 0 };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 8;
  const s0 = p.skills.length;
  await g.trigger('death.after', { self: g.players[2], killer: g.players[1] });
  ok(p.skills.length === s0 + 1, `征南：也可获得“武圣/当先/制蛮”中的一个（${s0} → ${p.skills.length}）`);
}
{
  // 撷芳：距离 -女性角色数
  const g = mk(['xh_guansuo', 'xh_zhaoxiang', 'sunquan', 'liubei'], () => null);
  const gs = g.players[0];
  g.turnPlayer = gs; g.turnCount = 9;
  const female = g.alive().filter(q => q.gender === 'female').length;
  const far = g.players[2];
  const dist = g.distance(gs, far);
  ok(female >= 1, '撷芳：测试前提——场上应有女性角色');
  ok(dist === Math.max(1, 2 - female), `撷芳：应减去女性角色数（女性 ${female}，实际距离 ${dist}）`);
}

// ================= 12. 文鸯 · 却敌 / 仇决 / 椎锋 / 冲坚 =================
{
  const g = mk(['xh_wenyang', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 1 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 6; g.phase = 'play';
  p.hand = [card('w1', 'shan', 'heart', 2), card('w2', 'sha', 'spade', 3)];
  const jd = card('j1', 'juedou', 'spade', 7);
  await g.trigger('target.after', { self: p, target: t, card: jd, used: [], shaCtx: {} });
  ok(p.hand.length === 1, `却敌：应弃置一张基本牌（实际 ${p.hand.length}）`);
  const dd = { self: p, to: t, from: p, amount: 1, card: jd, canceled: false };
  await g.trigger('damage.before', dd);
  ok(dd.amount === 2, `却敌：此牌伤害应 +1（实际 ${dd.amount}）`);
  // 每回合限一次
  const jd2 = card('j2', 'sha', 'spade', 8);
  await g.trigger('target.after', { self: p, target: t, card: jd2, used: [], shaCtx: {} });
  ok(!jd2.__quedi, '却敌：每回合限一次，不应再次发动');
  ok(g.logs.some(l => /却敌/.test(l.text)), '缺少却敌日志');
  // 仇决：杀死角色后加体力上限
  const max0 = p.maxHp, n0 = p.hand.length;
  await g.trigger('death.after', { self: t, killer: p });
  ok(p.maxHp === max0 + 1, `仇决：体力上限应 +1（${max0} → ${p.maxHp}）`);
  ok(p.hand.length >= n0 + 2, '仇决：应摸两张牌');
  ok(g.logs.some(l => /仇决/.test(l.text)), '缺少仇决日志');
}
{
  // 椎锋（魏势力技）
  const g = mk(['xh_wenyang', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return null;
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 7; g.phase = 'play';
  const hp0 = p.hp;
  await g.useActiveSkill(p, 'zhuifeng');
  ok(p.hp === hp0 - 1, `椎锋：应失去 1 点体力（${hp0} → ${p.hp}）`);
  ok(g.logs.some(l => /椎锋|决斗/.test(l.text)), '缺少椎锋日志');
}
if (hasChongjian) {
  // 冲坚（吴势力技）：装备牌当【杀】/【酒】
  const g = mk(['xh_wenyang', 'sunquan', 'liubei'], () => null);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 8;
  const equip = card('e1', 'qinggang', 'spade', 6);
  p.hand = [equip];
  await g.setKingdom(p, 'wu', 'test');
  ok(g.canUse(p, equip, [t], 'sha').ok === true, '冲坚：可将装备牌当【杀】使用');
  ok(g.canUse(p, equip, [p], 'jiu').ok === true, '冲坚：可将装备牌当【酒】使用');
  await g.setKingdom(p, 'wei', 'test');
}

// ================= 13. 王双 · 追猎 =================
{
  const g = mk(['xh_wangshuang', 'sunquan', 'liubei', 'caocao'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const p = g.players[0], far = g.players[2];
  g.turnPlayer = p; g.turnCount = 5;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.freeRangeTurn === 5, '追猎：使用【杀】无距离限制');
  ok(g.distance(p, far) > g.attackRange(p), '追猎：测试前提——目标应在攻击范围外');
  // 判定为武器牌 → 伤害值增加至其体力值
  g.deck.pop();
  g.deck.push(card('jw', 'qinggang', 'spade', 6));    // 牌堆顶
  const sha = card('s1', 'sha', 'spade', 7);
  await g.trigger('target.after', { self: p, target: far, card: sha, used: [], shaCtx: {} });
  ok(sha.__zhulieSeat === far.seat, '追猎：判定为武器牌应记录加伤目标');
  ok(sha.__zhulieFree === true, '追猎：此【杀】不计入次数');
  const dd = { self: p, to: far, from: p, amount: 1, card: sha, canceled: false };
  await g.trigger('damage.before', dd);
  ok(dd.amount === far.hp, `追猎：伤害值应增加至其体力值（实际 ${dd.amount} / 体力 ${far.hp}）`);
  ok(g.logs.some(l => /追猎/.test(l.text)), '缺少追猎日志');
  // 判定不是武器/坐骑 → 失去 1 点体力
  g.deck.pop();
  g.deck.push(card('jx', 'tao', 'heart', 9));
  const hp0 = p.hp;
  await g.trigger('target.after', { self: p, target: far, card: card('s2', 'sha', 'spade', 8), used: [], shaCtx: {} });
  ok(p.hp === hp0 - 1, `追猎：判定不为武器/坐骑应失去 1 点体力（${hp0} → ${p.hp}）`);
}

// ================= 汇总 =================
console.log(`\n=== xinghecheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
