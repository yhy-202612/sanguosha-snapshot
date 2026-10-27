// 阶段 5A 第一批守门测试：神话再临·阴（王基 / 王平 / 许攸 / 严颜）
// 运行：node tools/yincheck.js
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META, cardLabel } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261108,
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
  ['wangji', '王基', 'wei', 3, ['qizhi', 'jinqu']],
  ['wangping', '王平', 'shu', 4, ['feijun', 'binglve']],
  ['xuyou', '许攸', 'qun', 3, ['chenglve', 'shicai', 'cunmu']],
  ['yanyan', '严颜', 'shu', 4, ['juzhan']],
];
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符`);
  ok(gd && gd.pack === 'yin', `${id} pack 应为 yin`);
  ok(gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
  }
}
ok(GENERALS.filter(g => g.pack === 'yin').length === 8, `阴包应为 8 将（实际 ${GENERALS.filter(g => g.pack === 'yin').length}）`);
for (const [id, name, skills] of [
  ['luji', '陆绩', ['huaiju', 'yili', 'zhenglun']],
  ['sunliang', '孙亮', ['kuizhu', 'chezheng']],
  ['kuailiangkuaiyue', '蒯良蒯越', ['jiangjian', 'shenshi']],
  ['luzhi', '卢植', ['mingren', 'zhenliang']],
]) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name && gd.pack === 'yin', `${id} 数据缺失或 pack 不符`);
  ok(!!gd && skills.every(x => gd.skills.includes(x)), `${id} 技能列表不符`);
  for (const x of skills) {
    ok(hasSkill(x), `技能 ${x} 未注册`);
    const sk = getSkill(x);
    ok(sk && sk.fallbackOf === undefined, `技能 ${x} 注册异常（不得降级）`);
  }
}
ok(PACK_CN.yin === '神话再临·阴', `PACK_CN.yin 不符：${PACK_CN.yin}`);

// ================= 2. 王基 · 奇制 =================
{
  const g = mk(['wangji', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [2] };
    if (req.kind === 'cards') {
      // 选目标角色的牌（req.cards 是牌 id 列表）
      return { cardIds: [req.cards[0]] };
    }
    return null;
  });
  const wj = g.players[0], t2 = g.players[2];
  g.turnPlayer = wj; g.turnCount = 3;
  t2.hand = [card('e1', 'sha', 'spade', 3), card('e2', 'sha', 'heart', 4)];
  const n2 = t2.hand.length;
  await g.trigger('target.after', {
    self: wj, target: g.players[1], card: card('u1', 'guohe', 'spade', 5), used: [],
  });
  ok(wj.flags.qizhiCount === 1, `奇制：应累计 1 次（实际 ${wj.flags.qizhiCount}）`);
  ok(t2.hand.length === n2, `奇制：目标弃 1 摸 1，手牌数应不变（${n2} → ${t2.hand.length}）`);
  ok(g.logs.some(l => /奇制/.test(l.text)), '缺少奇制日志');
  // 非本人回合不触发
  g.turnPlayer = g.players[1];
  await g.trigger('target.after', {
    self: wj, target: g.players[1], card: card('u2', 'guohe', 'spade', 6), used: [],
  });
  ok(wj.flags.qizhiCount === 1, '奇制：非自己回合不应触发');
}

// ================= 3. 王基 · 进趋 =================
{
  const g = mk(['wangji', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'cards') return { cardIds: p.hand.slice(0, req.min || 1).map(c => c.id) };
    return null;
  });
  const wj = g.players[0];
  wj.flags.qizhiCount = 2;
  wj.hand = [1, 2, 3].map(i => card('h' + i, 'sha', 'spade', i));
  await g.trigger('phase.begin', { self: wj, phase: 'end' });
  ok(wj.hand.length === 2, `进趋：摸 2 后应弃至 X=2（实际 ${wj.hand.length}）`);
}
{
  // 回合开始清零奇制计数
  const g = mk(['wangji', 'sunquan']);
  const wj = g.players[0];
  wj.flags.qizhiCount = 5;
  await g.trigger('turn.begin', { self: wj });
  ok(wj.flags.qizhiCount === 0, '进趋：回合开始应清零奇制计数');
}

// ================= 4. 王平 · 飞军 / 兵略 =================
{
  // 分支 1：手牌更多的角色交牌
  const g = mk(['wangping', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
    if (req.kind === 'cards') return { cardIds: [req.cards[0]] };
    return null;
  });
  const wp = g.players[0], t = g.players[1];
  wp.hand = [card('w1', 'sha', 'spade', 5)];
  t.hand = [1, 2, 3].map(i => card('t' + i, 'sha', 'heart', i));
  const n0 = wp.hand.length, t0 = t.hand.length;
  await g.useActiveSkill(wp, 'feijun');
  ok(wp.hand.length === n0 - 1 + 1 + 2, `飞军：弃 1 得 1，兵略再摸 2（${n0} → ${wp.hand.length}）`);
  ok(t.hand.length === t0 - 1, `飞军：目标应交出 1 张（${t0} → ${t.hand.length}）`);
  ok((wp.flags.feijunSeats || []).includes(t.seat), '兵略：应记录首次目标');
}
{
  // 分支 2：装备更多 → 弃装备；对同一角色第二次不再摸 2
  const g = mk(['wangping', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 1 };
    if (req.kind === 'cards') return { cardIds: [req.cards[0]] };
    return null;
  });
  const wp = g.players[0], t = g.players[1];
  wp.hand = [card('w2', 'sha', 'spade', 6)];
  t.equips.weapon = card('eq1', 'qinggang', 'spade', 6);
  t.equips.armor = card('eq2', 'bagua', 'club', 2);
  await g.useActiveSkill(wp, 'feijun');
  ok(!t.equips.weapon || !t.equips.armor, '飞军：应弃置目标一张装备');
  const n1 = wp.hand.length;
  wp.hand.push(card('w3', 'sha', 'heart', 7));
  wp.flags.act_feijun = null; // 重置限次以便再次发动
  await g.useActiveSkill(wp, 'feijun');
  ok(wp.hand.length <= n1 + 1, `兵略：对同一角色第二次发动不应再摸 2 张（${n1} → ${wp.hand.length}）`);
}

// ================= 5. 许攸 · 成略（转换技） =================
{
  const g = mk(['xuyou', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'cards') return { cardIds: p.hand.slice(0, req.min || 1).map(c => c.id) };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const xy = g.players[0];
  g.turnCount = 2;
  xy.hand = [1, 2, 3, 4].map(i => card('c' + i, 'sha', 'spade', i));
  const n0 = xy.hand.length;
  await g.useActiveSkill(xy, 'chenglve');
  ok(xy.flags.chenglveSide === 'yin', `成略：阳发动后应转为阴（实际 ${xy.flags.chenglveSide}）`);
  ok(xy.hand.length === n0 + 1 - 2, `成略·阳：摸 1 弃 2，净 -1（${n0} → ${xy.hand.length}）`);
  ok(xy.flags.chenglveTurn === 2, '成略：应记录本回合');
  // 第二回合发动阴：摸 2 弃 1
  g.turnCount = 3;
  xy.flags.act_chenglve = null;
  const n1 = xy.hand.length;
  await g.useActiveSkill(xy, 'chenglve');
  ok(xy.flags.chenglveSide === 'yang', `成略：阴发动后应转回阳（实际 ${xy.flags.chenglveSide}）`);
  ok(xy.hand.length === n1 + 2 - 1, `成略·阴：摸 2 弃 1，净 +1（${n1} → ${xy.hand.length}）`);
}

// ================= 6. 许攸 · 恃才 =================
{
  const g = mk(['xuyou', 'sunquan'], yes());
  const xy = g.players[0];
  g.turnPlayer = xy; g.turnCount = 4;
  xy.flags.shicaiTypes = [];
  await g.trigger('card.use.after', { self: xy, card: card('s1', 'sha', 'spade', 5) });
  ok((xy.flags.shicaiTypes || []).includes('basic'), '恃才：应记录已用牌类型 basic');
  ok(xy.flags.shicaiTypes.length === 1, `恃才：首次类型应触发（实际 ${xy.flags.shicaiTypes.length}）`);
  // 同类型再触发应被 filter 拒绝
  const before = xy.flags.shicaiTypes.length;
  await g.trigger('card.use.after', { self: xy, card: card('s2', 'sha', 'heart', 6) });
  ok(xy.flags.shicaiTypes.length === before, '恃才：同类型牌不应再次触发');
  // 不同类型（锦囊）应触发
  await g.trigger('card.use.after', { self: xy, card: card('s3', 'guohe', 'spade', 7) });
  ok(xy.flags.shicaiTypes.includes('trick'), '恃才：不同类型应触发');
}

// ================= 7. 许攸 · 寸目 =================
{
  const g = mk(['xuyou', 'sunquan']);
  const xy = g.players[0];
  await g.trigger('game.start', { self: null });
  ok(xy.flags.drawFromBottom === true, '寸目：开局应置 drawFromBottom');
  // 构造牌堆：底部（数组头部）放一张唯一标记牌
  const bottom = card('bd1', 'sha', 'club', 11);
  g.deck = [bottom, ...g.deck.slice(1)];
  const got = await g.drawCards(xy, 1, { reason: 'test' });
  ok(got.length === 1 && got[0].id === 'bd1', `寸目：应从牌堆底摸牌（实际摸到 ${got[0] && got[0].id}）`);
}
{
  // 无寸目的对照：从顶摸
  const g = mk(['sunquan', 'xuyou']);
  const sq = g.players[0];
  const top = card('tp1', 'sha', 'diamond', 12);
  g.deck = [...g.deck.slice(0, -1), top];
  const got = await g.drawCards(sq, 1, { reason: 'test' });
  ok(got.length === 1 && got[0].id === 'tp1', '寸目：无技能者应从牌堆顶摸牌');
}

// ================= 8. 严颜 · 拒战（转换技） =================
{
  // 阳：成为他人【杀】目标 → 各摸一张 + 对方本回合不能再对我用牌
  const g = mk(['yanyan', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    return null;
  });
  const yy = g.players[0], foe = g.players[1];
  g.turnPlayer = foe; g.turnCount = 5;
  const n0 = yy.hand.length, f0 = foe.hand.length;
  await g.trigger('target.after', { self: foe, target: yy, card: card('k1', 'sha', 'spade', 5), used: [] });
  ok(yy.hand.length === n0 + 1 && foe.hand.length === f0 + 1, '拒战·阳：双方应各摸一张');
  ok(foe.flags.noTargetTurn === 5 && foe.flags.noTargetSeat === yy.seat, '拒战·阳：对方本回合不应能对严颜使用牌');
  ok(yy.flags.juzhanSide === 'yin', '拒战：发动阳后应转为阴');
  // 本回合对方用牌被拦
  const cc = card('k2', 'sha', 'spade', 6);
  foe.hand = [cc];
  ok(g.canUse(foe, cc, [yy]).ok === false, '拒战·阳：对方本回合不能对严颜使用牌');
}
{
  // 阴：使用【杀】指定目标 → 获得其一张牌 + 本回合不能再对其用牌
  const g = mk(['yanyan', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'cards') return { cardIds: [req.cards[0]] };
    return null;
  });
  const yy = g.players[0], t = g.players[1];
  g.turnPlayer = yy; g.turnCount = 6;
  yy.flags.juzhanSide = 'yin';
  t.hand = [card('d1', 'sha', 'club', 3), card('d2', 'shan', 'heart', 4)];
  const n0 = yy.hand.length, t0 = t.hand.length;
  await g.trigger('target.after', { self: yy, target: t, card: card('k3', 'sha', 'spade', 7), used: [] });
  ok(yy.hand.length === n0 + 1, `拒战·阴：应获得目标一张牌（${n0} → ${yy.hand.length}）`);
  ok(t.hand.length === t0 - 1, `拒战·阴：目标应减少一张（${t0} → ${t.hand.length}）`);
  ok(yy.flags.noTargetTurn === 6 && yy.flags.noTargetSeat === t.seat, '拒战·阴：本回合不应能再对目标使用牌');
  ok(yy.flags.juzhanSide === 'yang', '拒战：发动阴后应转为阳');
}


// ================= 9. 陆绩 · 怀橘 / 遗礼 / 整论 =================
{
  const g = mk(['luji', 'sunquan'], yes());
  const lj = g.players[0];
  await g.trigger('game.start', { self: null });
  ok(lj.marks.ju === 3, `怀橘：开局应获得 3 个橘（实际 ${lj.marks.ju}）`);
  // 受伤时防止并移去一个橘
  const data = { self: lj, to: lj, from: g.players[1], amount: 1, canceled: false };
  await g.trigger('damage.before', data);
  ok(data.canceled === true, '怀橘：有橘时应防止此伤害');
  ok(lj.marks.ju === 2, `怀橘：应移去一个橘（实际 ${lj.marks.ju}）`);
  // 摸牌阶段多摸一张
  g.phase = 'draw';
  const dd = { self: lj, count: 2, reason: 'draw' };
  await g.trigger('cards.draw', dd);
  ok(dd.count === 3, `怀橘：摸牌阶段应多摸一张（实际 ${dd.count}）`);
  // 无橘时不多摸
  lj.marks.ju = 0;
  const dd2 = { self: lj, count: 2, reason: 'draw' };
  await g.trigger('cards.draw', dd2);
  ok(dd2.count === 2, '怀橘：无橘时不应多摸');
}
{
  // 遗礼：移去一个橘给他人
  const g = mk(['luji', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const lj = g.players[0], t = g.players[1];
  lj.marks.ju = 2;
  await g.trigger('phase.begin', { self: lj, phase: 'play' });
  ok(lj.marks.ju === 1, `遗礼：应移去一个橘（实际 ${lj.marks.ju}）`);
  ok(t.marks.ju === 1, `遗礼：目标应获得一个橘（实际 ${t.marks.ju}）`);
}
{
  // 整论：无橘时获得一个橘并少摸一张
  const g = mk(['luji', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const lj = g.players[0];
  lj.marks.ju = 0;
  g.turnCount = 3; g.phase = 'draw';
  await g.trigger('phase.begin', { self: lj, phase: 'draw' });
  ok(lj.marks.ju === 1, `整论：应获得一个橘（实际 ${lj.marks.ju}）`);
  const dd = { self: lj, count: 2, reason: 'draw' };
  await g.trigger('cards.draw', dd);
  ok(dd.count === 0, `整论：跳过摸牌阶段应不摸牌（实际 ${dd.count}）`);
}

// ================= 10. 孙亮 · 溃诛 / 掣政 =================
{
  const g = mk(['sunliang', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const sl = g.players[0], t = g.players[1];
  g.turnPlayer = sl; g.turnCount = 2; g.phase = 'discard';
  // 模拟弃牌阶段弃 2 张
  await g.trigger('cards.discard', { self: sl, cards: [card('d1', 'sha'), card('d2', 'sha')], reason: 'discard' });
  ok(sl.flags.kuizhuCount === 2, `溃诛：应累计弃牌 2 张（实际 ${sl.flags.kuizhuCount}）`);
  const n0 = t.hand.length;
  await g.trigger('phase.end', { self: sl, phase: 'discard' });
  ok(t.hand.length === n0 + 1, `溃诛：选项 1 应令角色摸一张（${n0} → ${t.hand.length}）`);
}
{
  // 溃诛选项 2：伤害
  const g = mk(['sunliang', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 1 };
    return null;
  });
  const sl = g.players[0], t = g.players[1];
  g.turnPlayer = sl; g.turnCount = 2; g.phase = 'discard';
  await g.trigger('cards.discard', { self: sl, cards: [card('d1', 'sha')], reason: 'discard' });
  const hp0 = t.hp;
  await g.trigger('phase.end', { self: sl, phase: 'discard' });
  ok(t.hp === hp0 - 1, `溃诛：选项 2 应造成 1 点伤害（${hp0} → ${t.hp}）`);
}
{
  // 掣政：攻击范围不含孙亮的角色不能成为其目标（4 人局制造距离 2）
  const g = mk(['sunliang', 'sunquan', 'liubei', 'caocao']);
  const sl = g.players[0], far = g.players[2];
  g.phase = 'play';
  ok(g.inAttackRange(far, sl) === false, '掣政：构造需目标攻击范围不含孙亮');
  const cc = card('k1', 'sha', 'spade', 5);
  sl.hand = [cc];
  const r = g.canUse(sl, cc, [far]);
  ok(r.ok === false, `掣政：不应能指定攻击范围不含自己的角色（${r.ok ? 'ok' : r.reason}）`);
}

// ================= 11. 蒯良蒯越 · 荐降 / 审时 =================
{
  const g = mk(['kuailiangkuaiyue', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const kl = g.players[0], t = g.players[1];
  kl.hand = [1, 2, 3].map(i => card('k' + i, 'sha', 'spade', i));
  t.hand = [card('t1', 'sha', 'heart', 4)];
  const n0 = t.hand.length;
  await g.trigger('target.after', { self: t, target: kl, card: card('u1', 'guohe', 'spade', 5), used: [] });
  ok(t.hand.length === n0 + 1, `荐降：手牌最少者应摸一张（${n0} → ${t.hand.length}）`);
}
{
  // 审时·阳：交一张牌给手牌最多的角色，然后造成 1 点伤害
  const g = mk(['kuailiangkuaiyue', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'cards') return { cardIds: [req.cards[0]] };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const kl = g.players[0], t = g.players[1];
  kl.hand = [card('k1', 'sha', 'spade', 5), card('k2', 'sha', 'heart', 6)];
  t.hand = [1, 2, 3, 4].map(i => card('t' + i, 'sha', 'club', i));
  g.players[2].hand = [card('l1', 'sha', 'diamond', 2)];
  const hp0 = t.hp;
  await g.useActiveSkill(kl, 'shenshi');
  ok(t.hp === hp0 - 1, `审时·阳：应对目标造成 1 点伤害（${hp0} → ${t.hp}）`);
  ok(kl.flags.shenshiSide === 'yin', `审时：发动阳后应转为阴（实际 ${kl.flags.shenshiSide}）`);
  ok(t.hand.some(c => c.id === 'k1'), '审时·阳：目标应获得交给的牌');
}

// ================= 汇总 =================
console.log(`\n=== yincheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
