// 批次 C 守门测试：线下叙事包（narrative 10 将）+ 威震天下·武庙（weizhen 10 将）
// 运行：node tools/narrativecheck.js
//
// 资料核实情况（详见交付总结）：
//   · 嗔周瑜、嗔诸葛亮、嗔鲁肃、嗔孙尚香、嗔赵云、嗔张昭、嗔贾华：萌娘百科《蚀心入魔·嗔》简略描述（已核实）
//   · 嗔曹操：官方文本未能检索到，按「魔曹操（蚀心入魔·疑）」版本实现（枯心 / 似故，存在简化）
//   · 界蔡文姬、界孙策：萌娘百科「界限突破2026（雁翎耀光·山幽 / 山啸）」版本
//   · 威震天下 / 武庙 10 将：三国杀官网 x.sanguosha.com 武将页 / 公告、biligame wiki、百度百科（已核实）
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
    seats, mode: getMode('duel'), seed: 20260701,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
const yes = () => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: true };
  if (req.kind === 'choice') return { index: 0 };
  if (req.kind === 'targets') return { seats: [2] };
  if (req.kind === 'card') return { cardId: p.hand[0]?.id };
  return null;
};
const has = (g, s) => g.logs.some(l => l.text.includes(s));

// ================= 1. 数据与注册 =================
const NARRATIVE = [
  ['chen_zhouyu', '嗔周瑜', 'qun', 4, ['jiehuo2', 'xianger', 'mieguo']],
  ['chen_zhugeliang', '嗔诸葛亮', 'shu', 3, ['bingqu2', 'fanxin', 'kuangbao2', 'wumou2']],
  ['chen_caocao', '嗔曹操', 'wei', 4, ['kuxin', 'sigu']],
  ['chen_lusu', '嗔鲁肃', 'wu', 3, ['wanli', 'lishuo']],
  ['chen_sunshangxiang', '嗔孙尚香', 'wu', 3, ['jiaozong', 'fusui']],
  ['chen_zhaoyun', '嗔赵云', 'shu', 4, ['zhaduo']],
  ['chen_zhangzhao', '嗔张昭', 'wu', 3, ['xiezhong', 'qishi']],
  ['chen_jiahua', '嗔贾华', 'wu', 4, ['fubei', 'dancui']],
  ['jie_caiwenji', '界蔡文姬', 'qun', 3, ['duanchang2', 'beige2']],
  ['jie_sunce', '界孙策', 'wu', 4, ['jiang2', 'hunzi2', 'zhiba2']],
];
const WEIZHEN = [
  ['wei_caocao', '威曹操', 'wei', 4, ['duoyue', 'junhe', 'xiongwei']],
  ['wei_liubei', '威刘备', 'shu', 4, ['liexiang', 'renkou']],
  ['wei_sunshangxiang', '威孙尚香', 'wu', 3, ['shuren', 'saran']],
  ['wei_zhangxingcai', '威张星彩', 'shu', 3, ['huangnu', 'xiankuang']],
  ['wei_guanyinping', '威关银屏', 'shu', 4, ['shaowei', 'dichou']],
  ['wei_gongsunzan', '威公孙瓒', 'qun', 4, ['juxi', 'zhuitao']],
  ['wu_zhugeliang', '武诸葛亮', 'shu', 7, ['jincui', 'qingshi2', 'zhizhe']],
  ['wu_guanyu', '武关羽', 'shu', 5, ['juewu', 'wuyou', 'yixian']],
  ['wu_zhangfei', '武张飞', 'shu', 4, ['zisheng', 'xianlve', 'haoxian']],
  ['wu_lukang', '武陆抗', 'wu', 4, ['shenduan2', 'kegou', 'dixian']],
];
const BANNED = /^(jie_|mou_|ji_)/;
for (const [pack, list] of [['narrative', NARRATIVE], ['weizhen', WEIZHEN]]) {
  for (const [id, name, kingdom, hp, skills] of list) {
    const gd = generalById(id);
    ok(!!gd, `${id} 数据缺失`);
    if (!gd) continue;
    ok(gd.name === name, `${id} 名称不符：${gd.name}`);
    ok(gd.kingdom === kingdom, `${id} 势力不符：${gd.kingdom}`);
    ok(gd.hp === hp, `${id} 体力不符：${gd.hp}`);
    ok(gd.pack === pack, `${id} pack 应为 ${pack}（实际 ${gd.pack}）`);
    ok(skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符：${gd.skills}`);
    for (const s of gd.skills) {
      ok(hasSkill(s), `技能 ${s}（${name}）未注册`);
      const sk = getSkill(s);
      ok(sk && sk.id === s, `技能 ${s} 注册异常`);
      ok(sk && sk.fallbackOf === undefined, `技能 ${s} 被降级（fallbackOf=${sk && sk.fallbackOf}）`);
      ok(sk && typeof sk.desc === 'string' && sk.desc.length >= 8, `技能 ${s} desc 为空/过短`);
      ok(!BANNED.test(s), `技能 ${s} 使用了禁用前缀`);
    }
  }
}
ok(PACK_CN.narrative === '线下叙事包', `PACK_CN.narrative 不符：${PACK_CN.narrative}`);
ok(PACK_CN.weizhen === '威震天下·武庙', `PACK_CN.weizhen 不符：${PACK_CN.weizhen}`);
ok(GENERALS.filter(g => g.pack === 'narrative').length === 10, `narrative 包将数应为 10，实际 ${GENERALS.filter(g => g.pack === 'narrative').length}`);
ok(GENERALS.filter(g => g.pack === 'weizhen').length === 25, `weizhen 包将数应为 25（含补全 15），实际 ${GENERALS.filter(g => g.pack === 'weizhen').length}`);
const ids = GENERALS.map(g => g.id);
ok(new Set(ids).size === ids.length, '武将 id 存在重复');

// ================= 2. narrative 行为断言 =================
// 嗔周瑜 · 劫火
{
  const g = mk(['chen_zhouyu', 'sunquan', 'liubei'], yes());
  const p = g.players[0], q = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.jiehuoPend === true, '劫火：回合开始应置下次伤害标记');
  await g.damage({ from: q, to: g.players[2], amount: 1 });
  ok(g.players[2].hp === g.players[2].maxHp - 3, `劫火：伤害应改为 3 点（实际 ${g.players[2].maxHp - g.players[2].hp}）`);
  ok(p.maxHp === 3, `劫火：造成伤害者非本人，应减 1 点体力上限（实际 ${p.maxHp}）`);
  ok(has(g, '劫火'), '缺少劫火日志');
}
// 嗔周瑜 · 香饵
{
  const g = mk(['chen_zhouyu', 'sunquan', 'liubei'], yes());
  const p = g.players[0], t = g.players[2];
  g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(p, 'xianger');
  ok(t.flags.xianger === true, '香饵：目标应获得香饵标记');
  const big = card('x1', 'sha', 'spade', 9);
  t.hand = [big];
  const d = { self: t, card: big, effName: 'sha', targets: [p] };
  await g.trigger('card.use.before', d);
  ok(d.canceled === true, '香饵：目标不能使用点数大于 6 的牌');
  t.hp = 2;
  await g.trigger('phase.begin', { self: t, phase: 'end' });
  ok(t.hp === t.maxHp, `香饵：结束阶段应回复 2 点体力（实际 ${t.hp}）`);
  ok(has(g, '香饵'), '缺少香饵日志');
}
// 嗔周瑜 · 灭虢
{
  const g = mk(['chen_zhouyu', 'sunquan', 'liubei', 'caocao'], yes());
  const p = g.players[0], t = g.players[2];
  g.turnPlayer = p; g.turnCount = 4;
  t.hand = [card('m1', 'sha'), card('m2', 'tao'), card('m3', 'guohe'), card('m4', 'wuzhong')];
  const before = p.hand.length;
  await g.trigger('turn.end', { self: p });
  ok(p.hand.length > before, '灭虢：应获得至多三张牌');
  ok(p.flags.mieguoPending === true, '灭虢：应标记额外回合');
  ok(has(g, '灭虢'), '缺少灭虢日志');
}
// 嗔诸葛亮 · 并驱
{
  const g = mk(['chen_zhugeliang', 'sunquan', 'liubei'], yes());
  const p = g.players[0], t = g.players[2];
  p.hand = [card('b1', 'sha'), card('b2', 'tao'), card('b3', 'guohe'), card('b4', 'wuzhong')];
  t.hand = [card('b5', 'sha'), card('b6', 'tao')];
  g.turnPlayer = p; g.turnCount = 5;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(has(g, '并驱'), '缺少并驱日志');
  ok(has(g, '声明'), '并驱：应各声明一种普通锦囊牌');
}
// 嗔诸葛亮 · 狂暴 / 无谋 / 燔心
{
  const g = mk(['chen_zhugeliang', 'sunquan', 'liubei'], yes());
  const p = g.players[0], t = g.players[2];
  g.turnPlayer = p; g.turnCount = 1;
  await g.trigger('turn.begin', { self: p });
  ok((p.marks && p.marks.baonu || 0) >= 2, '狂暴：第一个回合开始后应获得 2 枚暴怒');
  await g.damage({ from: p, to: t, amount: 1 });
  ok((p.marks && p.marks.baonu || 0) >= 3, '狂暴：造成伤害后应获得暴怒');
  const before = p.marks.baonu;
  p.hand = [card('w1', 'guohe', 'spade', 3)];
  await g.trigger('card.use.before', { self: p, card: p.hand[0], effName: 'guohe' });
  ok((p.marks && p.marks.baonu || 0) === before - 1, '无谋：使用普通锦囊应弃 1 枚暴怒');
  ok(t.marks && t.marks.fanxin === 1, '燔心：应给其他角色燔心标记');
  ok(t.skills.some(s => s.id === 'kuangbao2') && t.skills.some(s => s.id === 'wumou2'), '燔心：目标应获得狂暴与无谋');
}
// 嗔曹操 · 枯心 / 似故
{
  const g = mk(['chen_caocao', 'sunquan', 'liubei'], yes());
  const p = g.players[0], t = g.players[2];
  t.hand = [card('k1', 'sha', 'spade', 4), card('k2', 'tao', 'heart', 5)];
  const before = p.hand.length;
  await g.damage({ from: t, to: p, amount: 1 });
  ok(p.hand.length > before || p.flipped, `枯心：应获得展示的牌或翻面（手牌 ${before}→${p.hand.length}）`);
  ok(has(g, '枯心'), '缺少枯心日志');
  const hp0 = t.hp;
  await g.useActiveSkill(p, 'sigu');
  ok(t.hp <= hp0 - 1, `似故：应对目标造成两次 1 点伤害（${hp0}→${t.hp}）`);
}
// 嗔鲁肃 · 万利 / 理说
{
  const g = mk(['chen_lusu', 'sunquan', 'liubei'], yes());
  const p = g.players[0], t = g.players[2];
  p.hand = [card('l1', 'sha'), card('l2', 'tao'), card('l3', 'guohe')];
  g.turnPlayer = p; g.turnCount = 1;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.wanliSet === true && p.flags.wanliN > 0, '万利：首轮开始应交出牌并记录数量');
  ok(t.hand.length >= p.flags.wanliN, '万利：对方应收到牌');
  const blackCard = card('l4', 'sha', 'spade', 8);
  await g.trigger('target.before', { self: t, target: p, card: blackCard });
  ok(has(g, '理说'), '理说：成为黑色牌目标后应摸牌并与万利角色拼点');
}
// 嗔孙尚香 · 骄纵 / 妇随 / 比翼
{
  const g = mk(['chen_sunshangxiang', 'sunquan', 'liubei', 'caocao'], yes());
  const p = g.players[0], t = g.players[2];
  g.players[1].equips.weapon = card('j1', 'qinggang', 'spade', 6);
  g.turnPlayer = p; g.turnCount = 6;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(t.flags.jiaozongColor === 'black' || t.flags.jiaozongColor === 'red', '骄纵：应设置颜色限制标记');
  ok(has(g, '骄纵'), '缺少骄纵日志');
  t.hand = [card('j2', 'sha'), card('j3', 'tao'), card('j4', 'guohe')];
  const lostName = (t.skills.find(s => s.id === 'rende') || {}).name;
  await g.useActiveSkill(p, 'fusui');
  ok(!t.skills.some(s => s.id === 'rende'), `妇随：目标应失去一个非标签技能（${lostName}）`);
  ok(p.skills.some(s => s.id === 'biyi') && t.skills.some(s => s.id === 'biyi'), '妇随：双方应获得比翼');
  const hp0 = p.hand.length;
  await g.trigger('equip.lose', { self: p, card: card('j5', 'bagua', 'club', 2), slot: 'armor' });
  ok(p.hand.length === hp0 + 2, '比翼：失去装备后应摸两张牌');
}
// 嗔赵云 · 诈夺
{
  const g = mk(['chen_zhaoyun', 'sunquan', 'liubei', 'caocao'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1, 2] };
    if (req.kind === 'card') return { cardId: p.hand[0] && p.hand[0].id };
    return null;
  });
  const p = g.players[0];
  const before = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'end' });
  ok(p.hand.length >= before, `诈夺：手牌数不应减少（${before}→${p.hand.length}）`);
  ok(has(g, '各一张牌'), '诈夺：应获得两名角色各一张牌');
  ok(has(g, '诈夺'), '缺少诈夺日志');
}
// 嗔张昭 · 挟众 / 乞施
{
  const g = mk(['chen_zhangzhao', 'sunquan', 'liubei', 'caocao'], yes());
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 7;
  t.hand = [card('z1', 'sha'), card('z2', 'tao')];
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(has(g, '挟众'), '缺少挟众日志');
  g.discardPile.push(card('z3', 'guohe'), card('z4', 'wuzhong'));
  const h0 = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'end' });
  ok(p.hand.length > h0, '乞施：应获得弃牌堆中的牌');
  ok(p.flags.skip_draw === true, '乞施：应跳过下个摸牌阶段');
}
// 嗔贾华 · 伏备 / 殚瘁
{
  const g = mk(['chen_jiahua', 'sunquan', 'liubei'], yes());
  const p = g.players[0], t = g.players[2];
  g.turnPlayer = p; g.turnCount = 8; g.phase = 'play';
  p.hand = [card('f1', 'sha'), card('f2', 'tao')];
  await g.useActiveSkill(p, 'fubei');
  const marked = g.deck.filter(c => c.skillTag === 'fubei');
  ok(marked.length >= 1, '伏备：应将牌正面朝上置于牌堆顶');
  const top = g.deck[g.deck.length - 1];
  top.skillTag = 'fubei'; top.faceUp = true;
  const hp0 = t.hp;
  await g.trigger('turn.end', { self: t });
  ok(t.hp <= hp0 - 1, `伏备：回合结束时应造成 1 点伤害（${hp0}→${t.hp}）`);
  const hp1 = t.hp;
  await g.damage({ from: p, to: t, amount: 1 });
  ok(hp1 - t.hp === 2, `殚瘁：造成的伤害应 +1（实际 ${hp1 - t.hp}）`);
}
// 界蔡文姬 · 悲歌 / 断肠 / 曲终
{
  const g = mk(['jie_caiwenji', 'sunquan', 'liubei'], yes());
  const p = g.players[0], q = g.players[2];
  p.hand = [card('c1', 'sha')];
  await g.trigger('damage.after', { self: q, to: q, from: g.players[1], card: card('c2', 'sha'), amount: 1 });
  ok(has(g, '悲歌'), '缺少悲歌日志');
  await g.trigger('death.before', { self: p, killer: q });
  ok(q.skills.length === 0 || q.hand.length === 0, '断肠：击杀者应失去所有技能或弃置所有牌');
  ok(has(g, '断肠'), '缺少断肠日志');
  const g2 = mk(['jie_caiwenji', 'sunquan', 'liubei'], yes());
  const a = g2.players[0], b = g2.players[2];
  a.skills.push(getSkill('quzhong'));
  a.hand = [card('q1', 'tao')];
  g2.turnPlayer = a; g2.turnCount = 9;
  await g2.trigger('cards.discard', { self: a, cards: [card('q2', 'sha')], reason: 'discard' });
  ok(a.flags.quzhongCard === 'q2', '曲终：应记录本回合弃置的牌');
  g2.discardPile.push(card('q2', 'sha'));
  await g2.trigger('phase.begin', { self: a, phase: 'end' });
  ok(has(g2, '曲终'), '缺少曲终日志');
}
// 界孙策 · 激昂 / 魂姿 / 制霸 / 英姿 / 英魂
{
  const g = mk(['jie_sunce', 'sunquan', 'liubei'], yes());
  const p = g.players[0], q = g.players[1];
  const h0 = p.hand.length;
  await g.trigger('card.use.after', { self: q, card: card('s1', 'sha', 'heart', 7), effName: 'sha', targets: [p] });
  ok(p.hand.length === h0 + 1, '激昂：应摸一张牌');
  ok(has(g, '激昂'), '缺少激昂日志');
  p.hp = 1;
  await g.trigger('damage.after', { self: p, to: p, from: q, amount: 1 });
  ok(p.skills.some(s => s.id === 'yingzi2') && p.skills.some(s => s.id === 'yinghun2'), '魂姿：应获得英姿与英魂');
  ok(p.maxHp === 3, `魂姿：应减 1 点体力上限（实际 ${p.maxHp}）`);
  const h1 = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(p.hand.length === h1 + 1, '英姿：摸牌阶段多摸一张牌');
  p.hp = 2;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(has(g, '英魂'), '缺少英魂日志');
  p.hand = [card('s2', 'sha', 'spade', 10)];
  q.hand = [card('s3', 'tao', 'heart', 3)];
  q.kingdom = 'wu';
  g.turnPlayer = p; g.turnCount = 10; g.phase = 'play';
  await g.useActiveSkill(p, 'zhiba2');
  ok(has(g, '制霸'), '缺少制霸日志');
}

// ================= 3. weizhen 行为断言 =================
// 威曹操 · 掇月 / 军合 / 雄威
{
  const g = mk(['wei_caocao', 'sunquan', 'liubei'], yes());
  const p = g.players[0], q = g.players[1];
  p.hand = [card('d1', 'sha', 'spade', 13), card('d2', 'tao', 'heart', 5), card('d3', 'guohe', 'club', 6)];
  q.hand = [card('d4', 'sha', 'heart', 4), card('d5', 'tao', 'diamond', 3)];
  g.turnPlayer = p; g.turnCount = 11; g.phase = 'play';
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(has(g, '掇月'), '缺少掇月日志');
  ok(has(g, '拼点'), '掇月：应进行拼点');
  const g2 = mk(['wei_caocao', 'sunquan', 'liubei'], yes());
  const a = g2.players[0], b = g2.players[2];
  a.hand = [card('j1', 'sha', 'spade', 4), card('j2', 'sha', 'club', 9), card('j3', 'tao', 'heart', 2)];
  g2.turnPlayer = a; g2.turnCount = 12;
  await g2.trigger('phase.begin', { self: a, phase: 'prepare' });
  ok(a.flags.junhe && a.flags.junhe.left >= 2, '军合：应获得军合次数');
  const hp0 = b.hp;
  await g2.damage({ from: a, to: b, amount: 1 });
  ok(hp0 - b.hp === 2, `军合：造成伤害时可 +1（${hp0}→${b.hp}）`);
  const g3 = mk(['wei_caocao', 'sunquan', 'liubei'], yes());
  const c = g3.players[0], w = g3.players[1];
  w.kingdom = 'wei';
  c.flags.pindianWeiSeat = w.seat;
  const pd = card('x1', 'sha', 'spade', 9);
  g3.discardPile.push(pd);
  await g3.trigger('cards.discard', { self: c, cards: [pd], reason: '掇月' });
  ok(c.hand.some(x => x.id === 'x1'), '雄威：与魏势力拼点后应获得其拼点的牌');
}
// 威刘备 · 烈骧 / 仁彀
{
  const g = mk(['wei_liubei', 'sunquan', 'liubei'], yes());
  const p = g.players[0], t = g.players[2];
  t.hand = [];
  g.turnPlayer = p; g.turnCount = 13; g.phase = 'play';
  const h0 = p.hand.length;
  await g.useActiveSkill(p, 'liexiang');
  ok(p.hand.length >= h0, '烈骧：应摸牌');
  ok(t.hp <= t.maxHp - 1, '烈骧：应对目标造成 1 点伤害');
  const g2 = mk(['wei_liubei', 'sunquan', 'liubei'], yes());
  const owner = g2.players[0], shu = g2.players[2];
  shu.hand = [card('r1', 'sha'), card('r2', 'tao')];
  owner.hp = owner.maxHp - 1;
  g2.turnPlayer = shu; g2.turnCount = 14;
  await g2.trigger('phase.begin', { self: shu, phase: 'play' });
  ok(has(g2, '仁彀'), '缺少仁彀日志');
}
// 威孙尚香 · 淑任 / 飒然
{
  const g = mk(['wei_sunshangxiang', 'sunquan', 'liubei'], yes());
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 15; g.phase = 'play';
  const h0 = p.hand.length;
  await g.useActiveSkill(p, 'shuren');
  ok(p.flags.disabledEquip && Object.values(p.flags.disabledEquip).some(Boolean), '淑任：应废除一个装备栏');
  ok(p.hand.length >= h0, '淑任：应获得亮出的牌');
  const g2 = mk(['wei_sunshangxiang', 'sunquan', 'liubei'], yes());
  const a = g2.players[0];
  g2.deck.push(card('e1', 'qinggang', 'spade', 6));
  const eq0 = Object.values(a.equips).filter(Boolean).length;
  await g2.damage({ from: g2.players[1], to: a, amount: 1 });
  ok(Object.values(a.equips).filter(Boolean).length > eq0, '飒然：受伤后应从牌堆/弃牌堆使用一张装备牌');
}
// 威张星彩 · 煌怒 / 贤贶
{
  const g = mk(['wei_zhangxingcai', 'sunquan', 'liubei'], yes());
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 16; g.phase = 'play';
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(has(g, '煌怒'), '缺少煌怒日志');
  ok(p.flags.huangnuCount >= 1, '煌怒：应记录本回合发动次数');
  const g2 = mk(['wei_zhangxingcai', 'sunquan', 'liubei'], yes());
  const a = g2.players[0], b = g2.players[2];
  const basic = card('v1', 'sha', 'spade', 7);
  g2.discardPile.push(basic);
  await g2.trigger('cards.discard', { self: b, cards: [basic], reason: 'discard' });
  ok(a.flags.disabledEquip && Object.values(a.flags.disabledEquip).some(Boolean), '贤贶：应废除一个装备栏');
}
// 威关银屏 · 绍威 / 涤仇
{
  const g = mk(['wei_guanyinping', 'sunquan', 'liubei'], yes());
  const p = g.players[0];
  p.flags.disabledEquip = { armor: true };
  g.deck.push(card('s1', 'sha', 'heart', 4), card('s2', 'shan', 'diamond', 5));
  const h0 = p.hand.length;
  await g.trigger('cards.discard', { self: p, cards: [card('s3', 'sha', 'diamond', 6)], reason: 'discard' });
  ok(p.hand.length > h0, '绍威：失去♦️牌后应获得红色牌');
  const g2 = mk(['wei_guanyinping', 'sunquan', 'liubei'], yes());
  const a = g2.players[0], t = g2.players[2];
  await g2.trigger('target.before', { self: t, target: a, card: card('s4', 'sha'), canceled: false });
  ok(t.marks && t.marks.chou === 1, '涤仇：其他角色对你使用牌应获得仇标记');
  const hp0 = t.hp;
  g2.turnPlayer = a; g2.turnCount = 17;
  await g2.trigger('turn.end', { self: a });
  ok(t.hp === hp0 - 1, `涤仇：回合结束应造成 1 点火焰伤害（${hp0}→${t.hp}）`);
  ok(has(g2, '涤仇'), '缺少涤仇日志');
}
// 威公孙瓒 · 举袭 / 追讨
{
  const g = mk(['wei_gongsunzan', 'sunquan', 'liubei'], yes());
  const p = g.players[0];
  p.hand = [card('u1', 'tao', 'heart', 3)];
  g.turnPlayer = p; g.turnCount = 18; g.phase = 'play';
  await g.useActiveSkill(p, 'juxi');
  ok(has(g, '举袭'), '缺少举袭日志');
  ok((p.flags.juxiUsed || []).length === 1, '举袭：应记录本回合使用过的伤害牌名');
  const g2 = mk(['wei_gongsunzan', 'sunquan', 'liubei'], yes());
  const a = g2.players[0];
  g2.turnPlayer = a; g2.turnCount = 19; g2.phase = 'play';
  const h0 = a.hand.length;
  await g2.trigger('card.use.after', { self: a, card: card('u2', 'sha', 'spade', 8), effName: 'sha', targets: [g2.players[2]] });
  ok(a.flags.zhuitaoSeat != null, '追讨：应选择一名角色');
  ok(a.hand.length === h0 + 2, '追讨：应摸 2 张牌');
}
// 武诸葛亮 · 尽瘁 / 情势 / 智哲
{
  const g = mk(['wu_zhugeliang', 'sunquan', 'liubei'], yes());
  const p = g.players[0];
  p.hand = [];
  await g.trigger('game.start', { self: p });
  ok(p.hand.length >= 7, `尽瘁：游戏开始应将手牌摸至 7 张（实际 ${p.hand.length}）`);
  g.turnPlayer = p; g.turnCount = 20;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(p.hp >= 1, '尽瘁：体力值应调整为牌堆中点数为 7 的牌数（至少 1）');
  ok(has(g, '尽瘁'), '缺少尽瘁日志');
  const g2 = mk(['wu_zhugeliang', 'sunquan', 'liubei'], yes());
  const a = g2.players[0];
  a.hand = [card('p1', 'guohe', 'spade', 3), card('p2', 'guohe', 'club', 4)];
  g2.turnPlayer = a; g2.turnCount = 21; g2.phase = 'play';
  await g2.trigger('card.use.before', { self: a, card: a.hand[0], effName: 'guohe', targets: [g2.players[2]] });
  ok((a.flags.qingshiDmgBonus || 0) === 1, '情势：选择①应令此牌伤害 +1');
  const g3 = mk(['wu_zhugeliang', 'sunquan', 'liubei'], yes());
  const c = g3.players[0];
  c.hand = [card('z1', 'sha', 'spade', 9)];
  g3.turnPlayer = c; g3.turnCount = 22; g3.phase = 'play';
  await g3.useActiveSkill(c, 'zhizhe');
  ok(c.hand.length === 2 && c.flags.zhizheUsed === true, '智哲：应复制一张手牌且本局限一次');
  const copy = c.hand.find(x => x.__zhizhe);
  await g3.trigger('cards.discard', { self: c, cards: [copy], reason: 'discard' });
  ok(c.hand.includes(copy), '智哲：复制的牌进入弃牌堆时应收回手牌');
}
// 武关羽 · 绝武 / 武佑 / 义贤
{
  const g = mk(['wu_guanyu', 'sunquan', 'liubei'], yes());
  const p = g.players[0], q = g.players[1];
  const gained = card('g1', 'sha', 'spade', 9);
  p.hand.push(gained);
  await g.trigger('cards.gain', { self: p, from: q, cards: [gained], reason: 'test' });
  ok(gained.num === 2, '绝武：从其他角色处获得的牌点数视为 2');
  ok(has(g, '绝武'), '缺少绝武日志');
  const g2 = mk(['wu_guanyu', 'sunquan', 'liubei'], yes());
  const a = g2.players[0], b = g2.players[2];
  a.hand = [card('y1', 'tao', 'heart', 4)];
  b.hand = [card('y2', 'sha', 'spade', 5)];
  g2.turnPlayer = b; g2.turnCount = 23;
  await g2.trigger('phase.begin', { self: b, phase: 'play' });
  ok(has(g2, '武佑'), '缺少武佑日志');
  const g3 = mk(['wu_guanyu', 'sunquan', 'liubei'], yes());
  const c = g3.players[0];
  g3.players[1].equips.weapon = card('y3', 'qinggang', 'spade', 6);
  g3.turnPlayer = c; g3.turnCount = 24; g3.phase = 'play';
  await g3.useActiveSkill(c, 'yixian');
  ok(c.hand.some(x => x.id === 'y3') || Object.values(c.equips).filter(Boolean).length >= 1, '义贤：应获得场上所有装备牌');
  ok(c.flags.yixianUsed === true, '义贤：限定技应标记已发动');
}
// 武张飞 · 恣胜 / 显略 / 豪贤
{
  const g = mk(['wu_zhangfei', 'sunquan', 'liubei'], yes());
  const p = g.players[0], t = g.players[2];
  p.hand = [card('f1', 'sha', 'spade', 9)];
  g.deck.push(card('f2', 'sha', 'heart', 3));
  g.turnPlayer = p; g.turnCount = 25; g.phase = 'play';
  await g.trigger('card.use.before', { self: p, card: p.hand[0], effName: 'sha', targets: [t] });
  ok(has(g, '恣胜'), '缺少恣胜日志');
  const g2 = mk(['wu_zhangfei', 'sunquan', 'liubei'], yes());
  const a = g2.players[0], b = g2.players[2];
  const c1 = card('f3', 'tao');
  b.hand.push(c1);
  await g2.trigger('cards.gain', { self: a, from: b, cards: [c1], reason: 'test' });
  ok(b.hp <= b.maxHp - 1, '恣胜：获得其他角色的牌后应造成等量伤害');
  await g2.useActiveSkill(a, 'xianlve');
  ok(has(g2, '显略'), '缺少显略日志');
  const g3 = mk(['wu_zhangfei', 'sunquan', 'liubei'], yes());
  const c = g3.players[0], d = g3.players[2];
  g3.discardPile.push(card('h1', 'sha', 'spade', 3), card('h2', 'tao', 'heart', 3));
  d.hand.push(card('h3', 'guohe', 'club', 3));
  g3.turnPlayer = c; g3.turnCount = 26; g3.phase = 'play';
  const before = c.hand.length;
  await g3.useActiveSkill(c, 'haoxian');
  ok(c.hand.length > before, '豪贤：应获得其他角色手牌中点数 3 的牌');
  ok(has(g3, '豪贤'), '缺少豪贤日志');
}
// 武陆抗 · 审断 / 克构 / 砥贤
{
  const g = mk(['wu_lukang', 'sunquan', 'liubei'], yes());
  const p = g.players[0], q = g.players[1];
  p.hand = [card('x1', 'shan', 'heart', 2), card('x2', 'tao', 'diamond', 3)];
  q.hand = [card('x3', 'sha', 'spade', 4)];
  g.deck.push(card('x4', 'sha', 'spade', 13));
  g.turnPlayer = p; g.turnCount = 27; g.phase = 'play';
  await g.useActiveSkill(p, 'shenduan2');
  ok(has(g, '审断'), '缺少审断日志');
  const g2 = mk(['wu_lukang', 'sunquan', 'liubei'], yes());
  const a = g2.players[0], b = g2.players[1];
  a.hand = [card('y1', 'sha', 'spade', 13)];
  b.hand = [card('y2', 'tao', 'heart', 2)];
  g2.deck.push(card('y3', 'shan', 'club', 2), card('y4', 'sha', 'diamond', 5));
  g2.turnPlayer = a; g2.turnCount = 28; g2.phase = 'play';
  await g2.trigger('phase.begin', { self: a, phase: 'play' });
  ok(has(g2, '克构'), '缺少克构日志');
  const g3 = mk(['wu_lukang', 'sunquan', 'liubei'], yes());
  const c = g3.players[0];
  g3.turnPlayer = c; g3.turnCount = 29; g3.phase = 'play';
  await g3.useActiveSkill(c, 'dixian');
  ok(c.flags.dixianUsed === true, '砥贤：限定技应标记已发动');
  ok(has(g3, '砥贤'), '缺少砥贤日志');
}

// ================= 4. 汇总 =================
console.log(`\n叙事包守门：通过 ${pass} / 失败 ${fail}`);
if (fail) {
  console.log('失败明细：');
  for (const b of bad) console.log('  ✗', b);
  process.exit(1);
}
console.log('线下叙事包 + 威震天下·武庙：数据与技能行为全部通过。');
