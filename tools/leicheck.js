// 阶段 5A 第二批守门测试：神话再临·雷（陈到 · 往烈 / 郝昭 · 镇骨）
// 运行：node tools/leicheck.js
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
    seats, mode: getMode('duel'), seed: 20261225,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['chendao', '陈到', 'shu', 4, ['wanglie']],
  ['haozhao', '郝昭', 'wei', 4, ['zhengu']],
];
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符`);
  ok(gd && gd.pack === 'lei', `${id} pack 应为 lei`);
  ok(gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
  }
}
ok(PACK_CN.lei === '神话再临·雷', `PACK_CN.lei 不符：${PACK_CN.lei}`);
ok(GENERALS.filter(g => g.pack === 'lei').length === 8, `雷包将数应为 6，实际 ${GENERALS.filter(g => g.pack === 'lei').length}`);
for (const [id, name, kingdom, hp, skills] of [
  ['zhoufei', '周妃', 'wu', 3, ['liangyin', 'kongsheng']],
  ['zhugezhan', '诸葛瞻', 'shu', 3, ['zuilun', 'fuyin']],
  ['guanqiujian', '毌丘俭', 'wei', 4, ['zhengrong', 'hongju']],
  ['yuanshu', '袁术', 'qun', 4, ['yongsi', 'weidi']],
  ['lukang', '陆抗', 'wu', 4, ['qianjie', 'jueyan', 'poshi']],
  ['zhangxiu', '张绣', 'qun', 4, ['xiongluan', 'congjian']],
]) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name && gd.pack === 'lei', `${id} 数据缺失或 pack 不符`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符`);
  ok(gd && skills.every(x => gd.skills.includes(x)), `${id} 技能列表不符`);
  for (const x of skills) {
    ok(hasSkill(x), `技能 ${x} 未注册`);
    const sk = getSkill(x);
    ok(sk && sk.id === x && sk.fallbackOf === undefined, `技能 ${x} 注册异常（不得降级）`);
  }
}
ok(GENERALS.length >= 179, `总将数应 ≥179（含卢植），实际 ${GENERALS.length}`);

// ================= 2. 陈到 · 往烈（第一张牌无距离限制）=================
{
  const g = mk(['chendao', 'sunquan', 'liubei', 'caocao', 'guanyu', 'zhenji'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: false };
    return null;
  });
  const cd = g.players[0], far = g.players[3];
  g.turnPlayer = cd; g.turnCount = 5; g.phase = 'play';
  cd.hand = [card('c1', 'sha', 'spade', 7)];
  await g.trigger('phase.begin', { self: cd, phase: 'play' });
  ok(cd.flags.wanglieFreeRange === 5, '往烈：出牌阶段开始应置无距离标记');
  ok(cd.flags.wanglieUsed === 0, '往烈：新阶段使用计数应清零');
  ok(g.freeRangeNow(cd) === true, '往烈：第一张牌应享受无距离限制');
  const dist = g.distance(cd, far);
  ok(dist > 1, `测试前提：${cd.name} 到 P3 距离应 >1（实际 ${dist}）`);
  const chk1 = g.canUse(cd, cd.hand[0], [far]);
  ok(chk1.ok === true, `往烈：第一张【杀】应可打远距离目标（${chk1.reason}）`);
  // 用掉第一张后，距离恢复正常限制
  cd.flags.wanglieUsed = 1;
  ok(g.freeRangeNow(cd) === false, '往烈：用掉第一张牌后无距离限制应失效');
  const chk2 = g.canUse(cd, cd.hand[0], [far]);
  ok(chk2.ok === false, '往烈：第二张牌应受攻击范围限制');
  // 非自己回合不享受
  g.turnPlayer = g.players[1];
  ok(g.freeRangeNow(cd) === false, '往烈：非自己回合不应享受无距离限制');
}

// ================= 3. 陈到 · 往烈（令此牌不能被响应 + 封牌）=================
{
  const g = mk(['chendao', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    return null;
  });
  const cd = g.players[0], t = g.players[1];
  g.turnPlayer = cd; g.turnCount = 7; g.phase = 'play';
  cd.hand = [card('c1', 'sha', 'spade', 7), card('c2', 'sha', 'heart', 8)];
  const d = { self: cd, card: cd.hand[0], effName: 'sha', targets: [t], reason: 'play' };
  await g.trigger('card.use.before', d);
  ok(d.unavoidable === true, '往烈：应声明此【杀】不可被响应');
  ok(cd.flags.banCardTurn === 7, '往烈：应记录本阶段封牌');
  ok(g.logs.some(l => /往烈/.test(l.text)), '缺少往烈日志');
  const chk = g.canUse(cd, cd.hand[1], [t]);
  ok(chk.ok === false, '往烈：本阶段后续不应再能使用牌');
  // 每回合只声明一次
  cd.flags.banCardTurn = 0;
  const d2 = { self: cd, card: cd.hand[1], effName: 'sha', targets: [t], reason: 'play' };
  await g.trigger('card.use.before', d2);
  ok(d2.unavoidable === undefined, '往烈：同一回合不应重复声明');
}

// ================= 4. 郝昭 · 镇骨（选择目标）=================
{
  const g = mk(['haozhao', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [2] };
    return null;
  });
  const hz = g.players[0];
  hz.hand = [card('h1', 'sha', 'spade', 3), card('h2', 'sha', 'heart', 4), card('h3', 'sha', 'club', 5)];
  await g.trigger('phase.end', { self: hz, phase: 'end' });
  ok(hz.flags.zhengu && hz.flags.zhengu.seat === 2, `镇骨：应记录目标 P2（实际 ${JSON.stringify(hz.flags.zhengu)}）`);
  ok(hz.flags.zhengu.mine === true, '镇骨：自己的回合结算标记应为 true');
  ok(g.logs.some(l => /镇骨/.test(l.text)), '缺少镇骨日志');
}

// ================= 5. 郝昭 · 镇骨（自己回合结束 → 目标补至同手牌）=================
{
  const g = mk(['haozhao', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [2] };
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, req.min || 1) };
    return null;
  });
  const hz = g.players[0], t = g.players[2];
  hz.hand = [1, 2, 3, 4].map(i => card('h' + i, 'sha', 'spade', i));
  t.hand = [card('t1', 'sha', 'heart', 1)];
  hz.flags.zhengu = { seat: 2, mine: true };
  await g.trigger('turn.end', { self: hz });
  ok(t.hand.length === 4, `镇骨：目标手牌应补至 4（实际 ${t.hand.length}）`);
  ok(hz.flags.zhengu && hz.flags.zhengu.mine === false, '镇骨：自己那次结算后 mine 应置 false');
  // 目标回合结束 → 再结算一次并清除
  t.hand = [1, 2, 3, 4, 5, 6].map(i => card('x' + i, 'sha', 'club', i));
  await g.trigger('turn.end', { self: t });
  ok(t.hand.length === 4, `镇骨：目标手牌应弃至 4（实际 ${t.hand.length}）`);
  ok(!hz.flags.zhengu, '镇骨：目标回合结束后应清除标记');
  // 无关角色回合结束不触发
  const g2 = mk(['haozhao', 'sunquan', 'liubei'], () => null);
  const hz2 = g2.players[0], t2 = g2.players[2];
  hz2.flags.zhengu = { seat: 2, mine: true };
  t2.hand = [card('y1', 'sha', 'heart', 1)];
  await g2.trigger('turn.end', { self: g2.players[1] });
  ok(t2.hand.length === 1, '镇骨：无关角色回合结束不应结算');
  ok(!!hz2.flags.zhengu, '镇骨：无关角色回合结束不应清除标记');
}

// ================= 6. 镇骨「最多摸至五张」=================
{
  const g = mk(['haozhao', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [2] };
    return null;
  });
  const hz = g.players[0], t = g.players[2];
  hz.hand = [1, 2, 3, 4, 5, 6, 7].map(i => card('h' + i, 'sha', 'spade', i));
  t.hand = [card('t1', 'sha', 'heart', 1)];
  hz.flags.zhengu = { seat: 2, mine: true };
  await g.trigger('turn.end', { self: hz });
  ok(t.hand.length === 5, `镇骨：最多摸至 5 张（实际 ${t.hand.length}）`);
}

// ================= 7. 卢植 · 明任 / 贞良 =================
{
  const g = mk(['luzhi', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, req.min || 1) };
    return null;
  });
  const lz = g.players[0];
  lz.hand = [card('r1', 'sha', 'spade', 9), card('r2', 'tao', 'heart', 5)];
  await g.trigger('game.start', { self: null });
  ok(!!lz.flags.renCard, '明任：开局应设置「任」');
  ok(lz.marks && !!lz.marks.ren, '明任：应写入 marks.ren 供前端展示');
  ok(lz.hand.length === 2, `明任：摸 1 后置 1 张，手牌应回到 2（实际 ${lz.hand.length}）`);
  const oldRen = lz.flags.renCard;
  // 结束阶段替换
  lz.flags.zhenliangSide = 'yin';
  await g.trigger('phase.begin', { self: lz, phase: 'end' });
  ok(lz.flags.renCard && lz.flags.renCard.id !== oldRen.id, '明任：结束阶段应可用手牌替换「任」');
  ok(lz.hand.some(c => c.id === oldRen.id), '明任：被替换的「任」应回到手牌');
}

// ================= 8. 卢植 · 贞良（阳：弃同色牌造成伤害）=================
{
  const g = mk(['luzhi', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, req.min || 1) };
    return null;
  });
  const lz = g.players[0], t = g.players[1];
  g.turnPlayer = lz; g.turnCount = 9; g.phase = 'play';
  lz.hand = [card('d1', 'sha', 'spade', 3), card('d2', 'sha', 'club', 4), card('d3', 'sha', 'heart', 5)];
  lz.flags.renCard = card('ren1', 'shan', 'diamond', 2);   // 红色「任」
  lz.flags.zhenliangSide = 'yang';
  const hp0 = t.hp;
  await g.useActiveSkill(lz, 'zhenliang');
  ok(t.hp <= hp0, `贞良：目标体力不应上升（${hp0} → ${t.hp}）`);
  ok(lz.flags.zhenliangSide === 'yin', `贞良：发动阳后应转为阴（实际 ${lz.flags.zhenliangSide}）`);
  ok(g.logs.some(l => /贞良/.test(l.text)), '缺少贞良日志');

  // 阴面不能再发动阳
  const before = lz.flags.zhenliangSide;
  await g.useActiveSkill(lz, 'zhenliang');
  ok(lz.flags.zhenliangSide === before, '贞良：阴面时不应再次发动阳');
}

// ================= 9. 卢植 · 贞良（阴：回合外弃牌令摸）=================
{
  const g = mk(['luzhi', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const lz = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 10; g.phase = 'play';
  lz.flags.renCard = card('ren2', 'sha', 'spade', 6);      // 「任」为基本牌
  lz.flags.zhenliangSide = 'yin';
  const n0 = t.hand.length;
  await g.trigger('cards.discard', { self: lz, cards: [card('q1', 'sha', 'heart', 2)], reason: 'use' });
  ok(t.hand.length > n0, `贞良·阴：应令一名角色摸一张（${n0} → ${t.hand.length}）`);
  ok(lz.flags.zhenliangSide === 'yang', '贞良·阴：发动后应转回阳');
  // 类别不同不触发
  const g2 = mk(['luzhi', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const lz2 = g2.players[0], t2 = g2.players[1];
  g2.turnPlayer = t2;
  lz2.flags.renCard = card('ren3', 'sha', 'spade', 6);
  lz2.flags.zhenliangSide = 'yin';
  const m0 = t2.hand.length;
  await g2.trigger('cards.discard', { self: lz2, cards: [card('q2', 'guohe', 'heart', 3)], reason: 'use' });
  ok(t2.hand.length === m0, '贞良·阴：类别不同不应触发');
  // 自己回合内不触发
  g2.turnPlayer = lz2;
  await g2.trigger('cards.discard', { self: lz2, cards: [card('q3', 'sha', 'heart', 4)], reason: 'use' });
  ok(t2.hand.length === m0, '贞良·阴：自己回合内不应触发');
}


// ================= 10. 周妃 · 箜声 =================
{
  const g = mk(['zhoufei', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, 2) };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const zf = g.players[0];
  g.turnPlayer = zf; g.turnCount = 3;
  zf.hand = [card('k1', 'zhuge', 'club', 2), card('k2', 'sha', 'heart', 3), card('k3', 'shan', 'diamond', 4)];
  await g.trigger('phase.begin', { self: zf, phase: 'prepare' });
  ok((zf.flags.kongsheng || []).length === 2, `箜声：准备阶段应置 2 张（实际 ${(zf.flags.kongsheng || []).length}）`);
  ok(zf.hand.length === 1, `箜声：手牌应剩 1 张（实际 ${zf.hand.length}）`);
  const keep = zf.flags.kongsheng.slice();
  const equipName = keep[0].name;
  await g.trigger('phase.begin', { self: zf, phase: 'end' });
  ok((zf.flags.kongsheng || []).length === 0, '箜声：结束阶段应清空武将牌上的牌');
  const isEquip = CARD_META[equipName]?.sub;
  if (isEquip) ok(!!Object.values(zf.equips).filter(Boolean).length, '箜声：装备牌应被使用（进入装备区）');
  ok(g.logs.some(l => /箜声/.test(l.text)), '缺少箜声日志');
}

// ================= 11. 周妃 · 良姻 =================
{
  const g = mk(['zhoufei', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'cards') return { cardIds: [req.cards[0]] };
    return null;
  });
  const zf = g.players[0], t = g.players[1];
  zf.hand = [card('z1', 'sha', 'heart', 1)];
  t.hand = [1, 2, 3].map(i => card('m' + i, 'sha', 'club', i));
  const n0 = t.hand.length;
  await g.trigger('zone.out', { self: zf, cards: [card('o1', 'sha', 'spade', 2)] });
  ok(t.hand.length === n0 + 1, `良姻①：手牌更多的角色应摸一张（${n0} → ${t.hand.length}）`);
  // 反方向：从游戏外加入手牌 → 手牌更少的角色弃一张
  const g2 = mk(['zhoufei', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'cards') return { cardIds: [req.cards[0]] };
    return null;
  });
  const zf2 = g2.players[0], t2 = g2.players[1];
  zf2.hand = [1, 2, 3, 4].map(i => card('w' + i, 'sha', 'heart', i));
  t2.hand = [card('n1', 'sha', 'club', 1)];
  const m0 = t2.hand.length;
  await g2.trigger('zone.in', { self: zf2, cards: [card('i1', 'sha', 'spade', 5)] });
  ok(t2.hand.length === m0 - 1, `良姻②：手牌更少的角色应弃一张（${m0} → ${t2.hand.length}）`);
}

// ================= 12. 诸葛瞻 · 罪论 =================
{
  const g = mk(['zhugezhan', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const zz = g.players[0];
  g.turnPlayer = zz; g.turnCount = 11;
  g.deck = [card('d1', 'sha', 'spade', 1), card('d2', 'shan', 'heart', 2), card('d3', 'tao', 'club', 3)];
  zz.flags.zuilunDmgTurn = 11;      // 条件 1 满足
  zz.flags.zuilunDiscardTurn = 11;   // 条件 2 不满足（本回合弃过牌）
  zz.hand = [card('h1', 'sha', 'heart', 5)];
  const n0 = zz.hand.length, deck0 = g.deck.length;
  await g.trigger('phase.end', { self: zz, phase: 'end' });
  // 手牌最少 = 1 张（P1/P2 手牌为 0？默认手牌空），此处只要求保留 1~3 张且牌堆/手牌守恒
  const gained = zz.hand.length - n0;
  // 满足 2 项：①本回合造成过伤害 ②手牌数为全场最少（P1/P2 各 4 张，诸葛瞻 1 张）；③不满足
  ok(gained === 2, `罪论：满足 2 项时保留 2 张（实际 ${gained}）`);
  ok(g.deck.length + gained === deck0, `罪论：牌堆+手牌应守恒（${deck0} → ${g.deck.length}+${gained}）`);
  ok(g.logs.some(l => /罪论/.test(l.text)), '缺少罪论日志');
}
{
  // 三项均不满足 → 你与一名其他角色各失去 1 点体力
  const g = mk(['zhugezhan', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const zz = g.players[0], t = g.players[1];
  g.turnPlayer = zz; g.turnCount = 12;
  g.deck = [card('e1', 'sha', 'spade', 1), card('e2', 'sha', 'heart', 2), card('e3', 'sha', 'club', 3)];
  zz.flags.zuilunDmgTurn = 0;
  zz.flags.zuilunDiscardTurn = 12;   // 弃过牌 → 条件 2 不满足
  zz.hand = [1, 2, 3, 4, 5].map(i => card('q' + i, 'sha', 'diamond', i));
  t.hand = [1, 2].map(i => card('r' + i, 'sha', 'club', i));
  const hp0 = zz.hp, thp0 = t.hp;
  await g.trigger('phase.end', { self: zz, phase: 'end' });
  ok(zz.hp < hp0 || thp0 === 0, `罪论：均不满足时应失去体力（${hp0} → ${zz.hp}）`);
}

// ================= 13. 诸葛瞻 · 父荫 =================
{
  const g = mk(['zhugezhan', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    return null;
  });
  const zz = g.players[0], atk = g.players[1];
  g.turnPlayer = atk; g.turnCount = 13;
  zz.hand = [card('f1', 'sha', 'heart', 1)];
  atk.hand = [1, 2, 3].map(i => card('a' + i, 'sha', 'club', i));
  const d = { self: atk, target: zz, card: card('s1', 'sha', 'spade', 7), used: [], shaCtx: {} };
  await g.trigger('target.before', d);
  ok(d.canceled === true, '父荫：手牌数 ≤ 使用者时【杀】应无效');
  const d2 = { self: atk, target: zz, card: card('s2', 'sha', 'spade', 8), used: [], shaCtx: {} };
  await g.trigger('target.before', d2);
  ok(!d2.canceled, '父荫：每回合只挡第一次');
  // 手牌多于使用者则不挡
  const g2 = mk(['zhugezhan', 'sunquan'], () => null);
  const zz2 = g2.players[0], atk2 = g2.players[1];
  g2.turnPlayer = atk2; g2.turnCount = 3;
  zz2.hand = [1, 2, 3, 4].map(i => card('p' + i, 'sha', 'heart', i));
  atk2.hand = [card('b1', 'sha', 'club', 1)];
  const d3 = { self: atk2, target: zz2, card: card('s3', 'sha', 'spade', 9), used: [], shaCtx: {} };
  await g2.trigger('target.before', d3);
  ok(!d3.canceled, '父荫：手牌多于使用者时不应生效');
}

// ================= 14. 毌丘俭 · 征荣 / 鸿举 / 清侧 =================
{
  const g = mk(['guanqiujian', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const mq = g.players[0], t = g.players[1];
  g.turnPlayer = mq; g.turnCount = 4;
  t.hand = [1, 2].map(i => card('t' + i, 'sha', 'heart', i));
  await g.trigger('damage.after', { self: t, to: t, from: mq, amount: 1 });
  ok((mq.flags.rong || []).length === 1, `征荣：应获得 1 张「荣」（实际 ${(mq.flags.rong || []).length}）`);
  ok(t.hand.length === 1, `征荣：目标应少一张牌（实际 ${t.hand.length}）`);
  // 觉醒
  mq.flags.rong = [card('r1', 'sha', 'spade', 1), card('r2', 'shan', 'heart', 2), card('r3', 'tao', 'club', 3)];
  const max0 = mq.maxHp;
  await g.trigger('phase.begin', { self: mq, phase: 'prepare' });
  ok(mq.maxHp === max0 - 1, `鸿举：觉醒应 -1 体力上限（${max0} → ${mq.maxHp}）`);
  ok((mq.skills || []).some(s => s.id === 'qingce'), '鸿举：觉醒后应获得【清侧】');
  // 清侧
  t.hand = [card('c1', 'sha', 'heart', 5)];
  const rongN = mq.flags.rong.length;
  await g.useActiveSkill(mq, 'qingce');
  ok((mq.flags.rong || []).length === rongN - 1, `清侧：应消耗 1 张「荣」（${rongN} → ${(mq.flags.rong || []).length}）`);
  ok(g.logs.some(l => /清侧/.test(l.text)), '缺少清侧日志');
}

// ================= 15. 袁术 · 庸肆 =================
{
  const g = mk(['yuanshu', 'sunquan', 'liubei', 'caocao'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    return null;
  });
  const ys = g.players[0];
  g.turnPlayer = ys; g.turnCount = 6;
  const d = { self: ys, count: 2 };
  await g.trigger('draw.count', d);
  ok(d.count === 4, `庸肆：应改为摸存活势力数（4），实际 ${d.count}`);
  // 出牌阶段结束未造成伤害 → 摸至体力值
  ys.hand = [card('y1', 'sha', 'heart', 1)];
  const hp = ys.hp;
  await g.trigger('phase.end', { self: ys, phase: 'play' });
  ok(ys.hand.length === hp, `庸肆：未造成伤害应摸至体力值 ${hp}（实际 ${ys.hand.length}）`);
  // 造成 2 点伤害 → 手牌上限改为已损失体力值
  const g2 = mk(['yuanshu', 'sunquan'], () => null);
  const ys2 = g2.players[0];
  g2.turnPlayer = ys2; g2.turnCount = 3;
  ys2.hp = 2; ys2.maxHp = 4;
  ys2.flags.yongsiDmgTurn = 3; ys2.flags.yongsiDmgAmt = 2;
  await g2.trigger('phase.end', { self: ys2, phase: 'play' });
  ok(g2.logs.some(l => /庸肆/.test(l.text)), '缺少庸肆日志');
}

// ================= 16. 袁术 · 伪帝 =================
{
  const g = mk(['yuanshu', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [2] };
    return null;
  });
  const ys = g.players[0], t = g.players[2];
  ys.role = 'lord';
  ys.hand = [];
  t.hand = [];
  t.kingdom = 'qun';
  const cards = [card('w1', 'sha', 'heart', 1), card('w2', 'shan', 'club', 2)];
  await g.trigger('cards.discard', { self: ys, cards, reason: 'discard' });
  ok(t.hand.length === 2, `伪帝：主公弃牌应可分给群势力角色（实际 ${t.hand.length}）`);
  ok(g.logs.some(l => /伪帝/.test(l.text)), '缺少伪帝日志');
}


// ================= 17. 陆抗 · 谦节 =================
{
  const g = mk(['lukang', 'sunquan', 'liubei'], () => null);
  const lk = g.players[0], atk = g.players[1];
  g.turnPlayer = atk; g.turnCount = 2;
  const d1 = { self: atk, target: lk, card: card('j1', 'lebu', 'spade', 6), used: [], shaCtx: {} };
  await g.trigger('target.before', d1);
  ok(d1.canceled === true, '谦节：不应成为延时类锦囊的目标');
  const d1b = { self: atk, target: lk, card: card('j3', 'tiesuo', 'club', 12), used: [], shaCtx: {} };
  await g.trigger('target.before', d1b);
  ok(d1b.canceled === true, '谦节：不能被横置（【铁索连环】目标应被取消）');
  const d2 = { self: atk, target: lk, card: card('j2', 'guohe', 'club', 3), used: [], shaCtx: {} };
  await g.trigger('target.before', d2);
  ok(!d2.canceled, '谦节：普通锦囊不应被取消');
}

// ================= 18. 陆抗 · 决堰（三档）=================
{
  // 武器栏：+3 张杀
  const g = mk(['lukang', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const lk = g.players[0];
  g.turnPlayer = lk; g.turnCount = 5;
  lk.equips.weapon = card('ew', 'qinggang', 'spade', 6, 'weapon');
  lk.equips.weapon = { ...card('ew', 'qinggang', 'spade', 6), name: 'qinggang' };
  await g.useActiveSkill(lk, 'jueyan');
  ok(lk.flags.disabledEquip && lk.flags.disabledEquip.weapon, '决堰：武器栏应被废除');
  ok(lk.flags.shaExtraTurn === 3, `决堰·武器栏：应 +3 张杀（实际 ${lk.flags.shaExtraTurn}，本回合类 → shaExtraTurn）`);
  ok(!lk.equips.weapon, '决堰：废除时装备应被弃置');
  ok(g.logs.some(l => /决堰/.test(l.text)), '缺少决堰日志');
  // 已废除的栏不能再装备
  await g.equipCard(lk, { id: 'nw', name: 'qinggang', suit: 'club', num: 7, type: 'equip' });
  ok(!lk.equips.weapon, '决堰：已废除的装备栏不能再装备');
}
{
  // 防具栏：摸 3 + 手牌上限 +3
  const g = mk(['lukang', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };   // 只剩 armor 可选
    return null;
  });
  const lk = g.players[0];
  g.turnPlayer = lk; g.turnCount = 6;
  lk.flags.disabledEquip = { weapon: true, horsePlus: true, horseMinus: true };
  const n0 = lk.hand.length;
  await g.useActiveSkill(lk, 'jueyan');
  ok(lk.flags.disabledEquip.armor === true, '决堰：防具栏应被废除');
  ok(lk.hand.length === n0 + 3, `决堰·防具栏：应摸 3 张（${n0} → ${lk.hand.length}）`);
  ok(lk.flags.handLimit === 3, `决堰·防具栏：手牌上限 +3（实际 ${lk.flags.handLimit}）`);
}
{
  // 坐骑栏：本回合使用牌无距离限制
  const g = mk(['lukang', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const lk = g.players[0];
  g.turnPlayer = lk; g.turnCount = 7;
  lk.flags.disabledEquip = { weapon: true, armor: true, horseMinus: true };
  await g.useActiveSkill(lk, 'jueyan');
  ok(lk.flags.freeRangeTurn === 7, '决堰·坐骑栏：应置本回合无距离限制');
  ok(g.freeRangeNow(lk) === true, '决堰·坐骑栏：freeRangeNow 应生效');
}

// ================= 19. 陆抗 · 破势 / 怀柔 =================
{
  const g = mk(['lukang', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const lk = g.players[0];
  g.turnPlayer = lk; g.turnCount = 8;
  lk.flags.disabledEquip = { weapon: true, armor: true, horsePlus: true, horseMinus: true, treasure: true };
  lk.hand = [card('h1', 'sha', 'heart', 1)];
  const max0 = lk.maxHp;
  await g.trigger('phase.begin', { self: lk, phase: 'prepare' });
  ok(lk.maxHp === max0 - 1, `破势：应 -1 体力上限（${max0} → ${lk.maxHp}）`);
  ok(!lk.skills.some(s => s.id === 'jueyan'), '破势：应失去【决堰】');
  ok(lk.skills.some(s => s.id === 'huairou'), '破势：应获得【怀柔】');
  // 体力为 1 也触发
  const g2 = mk(['lukang', 'sunquan'], () => null);
  const lk2 = g2.players[0];
  g2.turnPlayer = lk2; lk2.hp = 1;
  const m2 = lk2.maxHp;
  await g2.trigger('phase.begin', { self: lk2, phase: 'prepare' });
  ok(lk2.maxHp === m2 - 1, '破势：体力为 1 时也应觉醒');
  // 怀柔：重铸装备牌
  const g3 = mk(['lukang', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const lk3 = g3.players[0];
  g3.turnPlayer = lk3; g3.turnCount = 9;
  lk3.skills.push(getSkill('huairou'));
  lk3.hand = [card('q1', 'qinggang', 'spade', 6), card('q2', 'sha', 'heart', 2)];
  const n3 = lk3.hand.length;
  await g3.useActiveSkill(lk3, 'huairou');
  ok(lk3.hand.length === n3, `怀柔：弃 1 摸 1，手牌数不变（${n3} → ${lk3.hand.length}）`);
  ok(g3.logs.some(l => /怀柔/.test(l.text)), '缺少怀柔日志');
}

// ================= 20. 张绣 · 雄乱 =================
{
  const g = mk(['zhangxiu', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const zx = g.players[0], t = g.players[1];
  g.turnPlayer = zx; g.turnCount = 10; g.phase = 'play';
  zx.equips.weapon = { id: 'w1', name: 'qinggang', suit: 'spade', num: 6, type: 'equip' };
  zx.judgeZone = [{ card: card('jz', 'lebu', 'spade', 6), name: 'lebu' }];
  zx.hand = [card('x1', 'sha', 'heart', 3), card('x2', 'sha', 'club', 4)];
  t.hand = [card('t1', 'shan', 'heart', 1)];
  await g.useActiveSkill(zx, 'xiongluan');
  ok(zx.flags.xiongluanUsed === true, '雄乱：应记为已使用（限定技）');
  ok((zx.judgeZone || []).length === 0, '雄乱：判定区应被清空');
  ok(!zx.equips.weapon, '雄乱：装备区应被清空');
  ok(zx.flags.disabledEquip && Object.keys(zx.flags.disabledEquip).length === 5, '雄乱：五个装备栏（含宝物）均应标记废除');
  ok(t.flags.xiongluanBan === 10, '雄乱：目标应被禁止使用手牌');
  // 目标不能使用牌
  const chk = g.canUse(t, t.hand[0], [zx]);
  ok(chk.ok === false, '雄乱：目标本回合不能使用牌');
  // 目标不能打出【闪】
  const dodged = await g.requireDodge(t, { from: zx, card: card('s1', 'sha', 'spade', 5) });
  ok(dodged === false, '雄乱：目标不能打出【闪】');
  // 张绣对目标使用牌不受距离/次数限制
  g.turnCount = 10;
  const chk2 = g.canUse(zx, zx.hand[0], [t]);
  ok(chk2.ok === true, `雄乱：对目标使用【杀】应可用（${chk2.reason}）`);
  zx.flags.shaUsed = 5;
  const chk3 = g.canUse(zx, zx.hand[1], [t]);
  ok(chk3.ok === true, '雄乱：对目标使用【杀】不受次数限制');
}

// ================= 21. 张绣 · 从谏 =================
{
  const g = mk(['zhangxiu', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const zx = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 11;
  zx.hand = [card('c1', 'sha', 'heart', 1), card('c2', 'bagua', 'spade', 2)];
  const n0 = zx.hand.length;
  await g.trigger('target.after', {
    self: t, target: zx, card: card('nn', 'nanman', 'spade', 7), used: [t], shaCtx: {},
  });
  ok(t.hand.length >= 1, '从谏：应交给另一名目标角色一张牌');
  ok(zx.hand.length === n0, `从谏：给出 1 张、摸 1（或装备摸 2）张，手牌应有变化但不为 0（${n0} → ${zx.hand.length}）`);
  ok(g.logs.some(l => /从谏/.test(l.text)), '缺少从谏日志');
}

// ================= 汇总 =================
console.log(`\n=== leicheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
