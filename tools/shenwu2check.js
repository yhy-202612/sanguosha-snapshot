// 阶段 6A · 神·武（补全）8 将（pack = 'shenwu2'）守门测试
// 运行：node tools/shenwu2check.js
// 说明：本批次按任务约束「只新增 6 个文件」，不改 src/data/generals.js 与 src/skills/index.js，
//       故测试直接 import 自己的技能/数据文件，并在运行时把 SHENWU2_GENERALS 注入 GENERALS 注册表。
import '../src/skills/shenwu2.js';
import { SHENWU2_GENERALS } from '../src/data/shenwu2.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

// —— 运行时注册（主控合入 generals.js 后此段变成幂等空操作）
for (const gd of SHENWU2_GENERALS) {
  if (!generalById(gd.id)) GENERALS.push(gd);
}

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261125,
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
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));
const noErr = (g) => !g.logs.some(l => l.text.includes('执行异常'));

// ================= 1. 数据注册 =================
const EXPECT = [
  ['shenwu2_zhangfei', '神张飞', 4, ['sw2_shencai', 'sw2_xunshi']],
  ['shenwu2_dengai', '神邓艾', 4, ['sw2_tuoyu', 'sw2_xianjin']],
  ['shenwu2_xuchu', '神许褚', 4, ['sw2_luoyi', 'sw2_shenwei']],
  ['shenwu2_sunshangxiang', '神孙尚香', 3, ['sw2_jieyin', 'sw2_xiaoji']],
  ['shenwu2_diaochan', '神貂蝉', 3, ['sw2_lijian', 'sw2_biyue']],
  ['shenwu2_zhangchunhua', '神张春华', 3, ['sw2_jueqing', 'sw2_shangshi']],
  ['shenwu2_xiahouyuan', '神夏侯渊', 4, ['sw2_shensu', 'sw2_qianli']],
  ['shenwu2_huangyueying', '神黄月英', 3, ['sw2_cangqiao', 'sw2_shenxie']],
];
for (const [id, name, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 数据缺失`);
  if (!gd) continue;
  ok(gd.name === name, `${id} 名称不符：${gd.name}`);
  ok(gd.kingdom === 'shen' && gd.hp === hp, `${id} 势力/体力不符：${gd.kingdom}/${gd.hp}`);
  ok(gd.pack === 'shenwu', `${id} pack 应为 shenwu（阶段6 已合入原包），实际 ${gd.pack}`);
  ok(Array.isArray(gd.skills) && gd.skills.length === skills.length, `${id} 技能数量不符：${gd.skills}`);
  for (const s of skills) {
    ok(gd.skills.includes(s), `${id} 技能列表缺少 ${s}`);
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && sk.name && sk.desc && sk.desc.length > 8, `技能 ${s} 缺少 name/desc`);
  }
}
for (const [id] of EXPECT) {
  const gd = generalById(id);
  if (!gd) continue;
  const female = ['shenwu2_sunshangxiang', 'shenwu2_diaochan', 'shenwu2_zhangchunhua', 'shenwu2_huangyueying'].includes(id);
  ok(female ? gd.gender === 'female' : !gd.gender, `${id} gender 字段不符（${gd.gender}）`);
}
ok(SHENWU2_GENERALS.length === 8, `SHENWU2_GENERALS 应为 8 位，实际 ${SHENWU2_GENERALS.length}`);
ok(GENERALS.filter(g => g.pack === 'shenwu').length === 16, `shenwu 包将数应为 16（合并后），实际 ${GENERALS.filter(g => g.pack === 'shenwu2').length}`);
const ALL_SK = EXPECT.flatMap(x => x[3]);
ok(new Set(ALL_SK).size === ALL_SK.length, '技能 id 存在重复');
for (const sk of ALL_SK) {
  ok(sk.startsWith('sw2_'), `技能 id ${sk} 应使用 sw2_ 前缀`);
  ok(!/^(jie_|mou_|ji_|shen_|sp_|ol_|bc_)/.test(sk), `技能 id ${sk} 使用了禁用前缀`);
  const base = sk.replace(/^sw2_/, '');
  ok(!hasSkill(base), `技能 ${sk} 去掉 sw2_ 后与既有技能 ${base} 冲突`);
}
for (const [id] of EXPECT) ok(GENERALS.filter(g => g.id === id).length === 1, `武将 id ${id} 重复注册`);
const packCnReady = PACK_CN.shenwu2 === '神·武（补全）';

// ================= 2. 主动技按钮可见性 =================
{
  const ACTIVES = {
    shenwu2_zhangfei: ['sw2_shencai'], shenwu2_sunshangxiang: ['sw2_jieyin'],
    shenwu2_diaochan: ['sw2_lijian'], shenwu2_xiahouyuan: ['sw2_qianli'],
  };
  for (const [id, list] of Object.entries(ACTIVES)) {
    const g = mk([id, 'caocao']);
    const p = g.players[0];
    g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
    const names = g.activeSkillsOf(p).map(s => s.id);
    for (const s of list) ok(names.includes(s), `${id} 的主动技 ${s} 未出现在 activeSkillsOf 中（${names.join(',')}）`);
  }
}

// ================= 3. 神张飞 · 神裁 / 巡使 =================
{
  const g = mk(['shenwu2_zhangfei', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3; g.phase = 'play';
  p.hand = [card('a1', 'sha'), card('a2', 'shan')];
  const ph = p.hand.length;
  await g.useActiveSkill(p, 'sw2_shencai');
  ok(hasLog(g, '神裁'), '神裁：缺少战报');
  ok(noErr(g), '神裁：技能执行异常');
  const marks = t.flags.sw2Marks || {};
  ok(Object.values(marks).some(v => v > 0), `神裁：应给目标施加标记（实际 ${JSON.stringify(marks)}）`);
  ok(p.hand.length >= ph - 1, '神裁：应获得该判定牌');
  ok((p.flags.sw2ScUsed || 0) === 1, `神裁：应记录本阶段发动次数（${p.flags.sw2ScUsed}）`);
  // 反例：上限 1 时同一出牌阶段不能再发动
  const before = p.flags.sw2ScUsed;
  await g.useActiveSkill(p, 'sw2_shencai');
  ok(p.flags.sw2ScUsed === before, `神裁：超过上限不应再发动（${p.flags.sw2ScUsed}）`);
  ok(hasLog(g, '不能再发动'), '神裁：超过上限应有战报提示');

  // 「笞」：受到伤害后失去等量体力
  const g2 = mk(['shenwu2_zhangfei', 'caocao'], H({}));
  const p2 = g2.players[0], t2 = g2.players[1];
  g2.turnPlayer = p2; g2.turnCount = 4;
  t2.flags.sw2Marks = { ang: 1, zhang: 0, tu: 0, liu: 0, si: 0, by: p2.seat };
  const hp0 = t2.hp;
  await g2.trigger('damage.after', { self: t2, to: t2, from: p2, amount: 2, nature: 'normal', reason: 'test' });
  ok(t2.hp === hp0 - 2, `神裁「笞」：应额外失去 2 点体力（${hp0} → ${t2.hp}）`);
  ok(hasLog(g2, '「笞」'), '神裁「笞」：缺少战报');

  // 「杖」：不能响应【杀】
  const g3 = mk(['shenwu2_zhangfei', 'caocao'], H({}));
  const p3 = g3.players[0], t3 = g3.players[1];
  g3.turnPlayer = p3; g3.turnCount = 5;
  t3.flags.sw2Marks = { ang: 0, zhang: 1, tu: 0, liu: 0, si: 0, by: p3.seat };
  // 施加回合：noShanTurn === 当前 turnCount → 引擎判定「不能使用【闪】」
  t3.flags.noShanTurn = 5;
  ok(t3.flags.noShanTurn === g3.turnCount, '神裁「杖」：施加回合内应禁止使用【闪】');
  // 跨回合：dodge.before 不得把禁闪续期到当前回合（旧实现等价永久禁闪）
  g3.turnCount = 9;
  await g3.trigger('dodge.before', { self: t3, from: p3, card: card('k1', 'sha') });
  ok(t3.flags.noShanTurn === 5, `神裁「杖」：跨回合不得续期禁闪（noShanTurn 应保持 5，实际 ${t3.flags.noShanTurn}）`);

  // 「徒」：失去手牌后随机弃置一张
  const g4 = mk(['shenwu2_zhangfei', 'caocao'], H({}));
  const p4 = g4.players[0], t4 = g4.players[1];
  g4.turnPlayer = p4; g4.turnCount = 6;
  t4.flags.sw2Marks = { ang: 0, zhang: 0, tu: 1, liu: 0, si: 0, by: p4.seat };
  t4.hand = [card('m1', 'sha'), card('m2', 'shan'), card('m3', 'tao')];
  await g4.trigger('cards.discard', { self: t4, cards: [card('m9', 'jiu')], reason: 'test' });
  ok(t4.hand.length === 2, `神裁「徒」：应随机弃置一张手牌（3 → ${t4.hand.length}）`);
  ok(hasLog(g4, '「徒」'), '神裁「徒」：缺少战报');
  // 反例：本技能自己造成的弃置不再触发
  const h4 = t4.hand.length;
  await g4.trigger('cards.discard', { self: t4, cards: [card('m8', 'jiu')], reason: 'sw2_tu' });
  ok(t4.hand.length === h4, '神裁「徒」：因本技能弃置的牌不应再次触发');

  // 「流」：结束阶段翻面
  const g5 = mk(['shenwu2_zhangfei', 'caocao'], H({}));
  const p5 = g5.players[0], t5 = g5.players[1];
  t5.flags.sw2Marks = { ang: 0, zhang: 0, tu: 0, liu: 1, si: 0, by: p5.seat };
  await g5.trigger('phase.begin', { self: t5, phase: 'end' });
  ok(t5.flipped === true, '神裁「流」：结束阶段应翻面');

  // 「死」①：手牌上限 -X；②：死数大于存活数则死亡
  const g6 = mk(['shenwu2_zhangfei', 'caocao'], H({}));
  const p6 = g6.players[0], t6 = g6.players[1];
  t6.flags.sw2Marks = { ang: 0, zhang: 0, tu: 0, liu: 0, si: 2, by: p6.seat };
  const hl0 = t6.flags.handLimit || 0;
  await g6.trigger('phase.begin', { self: t6, phase: 'discard' });
  ok((t6.flags.handLimit || 0) === hl0 - 2, `神裁「死」：手牌上限应 -2（${hl0} → ${t6.flags.handLimit}）`);
  await g6.trigger('phase.end', { self: t6, phase: 'discard' });
  ok((t6.flags.handLimit || 0) === hl0, '神裁「死」：弃牌阶段结束应还原手牌上限');
  t6.flags.sw2Marks.si = 99;
  const hp6 = t6.hp;
  await g6.trigger('turn.end', { self: t6 });
  ok(!t6.alive || t6.hp < hp6, `神裁「死」：死数超存活数应直接死亡（hp ${hp6} → ${t6.hp}）`);

  // 巡使：杀无距离次数限制 + 提升神裁次数上限
  const g7 = mk(['shenwu2_zhangfei', 'caocao'], H({}));
  const p7 = g7.players[0], t7 = g7.players[1];
  g7.turnPlayer = p7; g7.turnCount = 7;
  await g7.trigger('game.start', { self: p7 });
  ok(p7.flags.shaUnlimited === true, '巡使：游戏开始应获得【杀】无次数限制');
  await g7.trigger('turn.begin', { self: p7 });
  ok(p7.flags.freeRangeTurn === 7, `巡使：回合开始应获得无距离限制（${p7.flags.freeRangeTurn}）`);
  p7.flags.sw2ScMax = 1;
  await g7.trigger('damage.after', { self: t7, to: t7, from: p7, amount: 1, card: card('x1', 'sha'), reason: 'sha' });
  ok(p7.flags.sw2ScMax === 2, `巡使：【杀】造成伤害后神裁上限应 +1（${p7.flags.sw2ScMax}）`);
  // 反例：不是【杀】的伤害不提升
  await g7.trigger('damage.after', { self: t7, to: t7, from: p7, amount: 1, reason: 'juedou' });
  ok(p7.flags.sw2ScMax === 2, '巡使：非【杀】伤害不应提升神裁上限');
  // 提升后同阶段可再发动神裁
  const g8 = mk(['shenwu2_zhangfei', 'caocao'], H({ seats: [1] }));
  const p8 = g8.players[0];
  g8.turnPlayer = p8; g8.turnCount = 8; g8.phase = 'play';
  p8.flags.sw2ScMax = 2;
  await g8.useActiveSkill(p8, 'sw2_shencai');
  await g8.useActiveSkill(p8, 'sw2_shencai');
  ok(p8.flags.sw2ScUsed === 2, `巡使提升后神裁应可发动两次（${p8.flags.sw2ScUsed}）`);
}

// ================= 4. 神邓艾 · 拓域 / 险进 =================
{
  const g = mk(['shenwu2_dengai', 'caocao'], H({}));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 9; g.phase = 'play';
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok((p.flags.sw2Yu || 0) === 1, `拓域：出牌阶段开始应开发第 1 个「域」（${p.flags.sw2Yu}）`);
  ok(p.flags.freeRangeTurn === 9, '拓域：1 个「域」应获得无距离限制');
  ok(hasLog(g, '拓域'), '拓域：缺少战报');
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok((p.flags.sw2Yu || 0) === 2, `拓域：应继续开发（${p.flags.sw2Yu}）`);
  // 2 个「域」：【杀】不可被响应
  const td = { self: p, target: t, card: card('d1', 'sha'), canceled: false, used: [], shaCtx: { unavoidable: false } };
  await g.trigger('target.after', td);
  ok(td.shaCtx.unavoidable === true, '拓域：2 个「域」时【杀】应不可被响应');
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok((p.flags.sw2Yu || 0) === 3, `拓域：最多开发 3 个（${p.flags.sw2Yu}）`);
  const dm = { self: t, to: t, from: p, amount: 1, nature: 'normal', reason: 'test', canceled: false };
  await g.trigger('damage.before', dm);
  ok(dm.amount === 2, `拓域：3 个「域」时伤害应 +1（${dm.amount}）`);
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok((p.flags.sw2Yu || 0) === 3, `拓域：「域」上限为 3（${p.flags.sw2Yu}）`);

  // 险进：累计 2 点伤害后摸「域」数张
  const g2 = mk(['shenwu2_dengai', 'caocao'], H({}));
  const p2 = g2.players[0], t2 = g2.players[1];
  g2.turnPlayer = p2; g2.turnCount = 10;
  p2.flags.sw2Yu = 2;
  p2.hand = [];
  await g2.trigger('damage.after', { self: t2, to: t2, from: p2, amount: 1, reason: 'test' });
  ok(p2.hand.length === 0, `险进：累计不足 2 点不应摸牌（${p2.hand.length}）`);
  await g2.trigger('damage.after', { self: p2, to: p2, from: t2, amount: 1, reason: 'test' });
  ok(p2.hand.length === 2, `险进：累计 2 点应摸 2 张（${p2.hand.length}）`);
  ok(hasLog(g2, '险进'), '险进：缺少战报');
  // 反例：手牌为全场最多时改为摸 1 张
  const g3 = mk(['shenwu2_dengai', 'caocao'], H({}));
  const p3 = g3.players[0], t3 = g3.players[1];
  g3.turnPlayer = p3; g3.turnCount = 11;
  p3.flags.sw2Yu = 3; p3.flags.sw2Xj = 0;
  p3.hand = [card('e1', 'sha'), card('e2', 'sha'), card('e3', 'sha')];
  t3.hand = [];
  await g3.trigger('damage.after', { self: t3, to: t3, from: p3, amount: 2, reason: 'test' });
  ok(p3.hand.length === 4, `险进：手牌最多时改为摸 1 张（3 → ${p3.hand.length}）`);
}

// ================= 5. 神许褚 · 裸衣 / 神威 =================
{
  const g = mk(['shenwu2_xuchu', 'caocao'], H({ yes: true }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 12;
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(p.flags.skip_one_draw === true && p.flags.sw2Luoyi === 12, '裸衣：应记录少摸一张与本回合增伤');
  const dm = { self: t, to: t, from: p, amount: 1, nature: 'normal', card: card('l1', 'sha'), reason: 'sha', canceled: false };
  await g.trigger('damage.before', dm);
  ok(dm.amount === 2, `裸衣：【杀】伤害应 +1（${dm.amount}）`);
  // 反例：回合换了就不再加伤
  const dm2 = { self: t, to: t, from: p, amount: 1, nature: 'normal', card: card('l2', 'sha'), reason: 'sha', canceled: false };
  g.turnCount = 13;
  await g.trigger('damage.before', dm2);
  ok(dm2.amount === 1, `裸衣：非本回合不应增伤（${dm2.amount}）`);
  // 反例：普通锦囊伤害不增伤
  const dm3 = { self: t, to: t, from: p, amount: 1, nature: 'normal', reason: 'nanman', canceled: false };
  g.turnCount = 12;
  await g.trigger('damage.before', dm3);
  ok(dm3.amount === 1, `裸衣：非【杀】/【决斗】伤害不应增伤（${dm3.amount}）`);

  // 神威：攻击范围 +1；手牌最少时【杀】不可被响应
  const g2 = mk(['shenwu2_xuchu', 'caocao'], H({}));
  const p2 = g2.players[0], t2 = g2.players[1];
  const r0 = g2.attackRange(p2);
  await g2.trigger('game.start', { self: p2 });
  ok(g2.attackRange(p2) === r0 + 1, `神威：攻击范围应 +1（${r0} → ${g2.attackRange(p2)}）`);
  p2.hand = [];
  t2.hand = [card('w1', 'sha')];
  const td = { self: p2, target: t2, card: card('w2', 'sha'), canceled: false, used: [], shaCtx: { unavoidable: false } };
  await g2.trigger('target.after', td);
  ok(td.shaCtx.unavoidable === true, '神威：手牌最少时【杀】应不可被响应');
  // 反例：手牌不最少时不生效
  p2.hand = [card('w3', 'sha'), card('w4', 'shan')];
  const td2 = { self: p2, target: t2, card: card('w5', 'sha'), canceled: false, used: [], shaCtx: { unavoidable: false } };
  await g2.trigger('target.after', td2);
  ok(td2.shaCtx.unavoidable === false, '神威：手牌不最少时不应不可响应');
}

// ================= 6. 神孙尚香 · 结姻 / 枭姬 =================
{
  const g = mk(['shenwu2_sunshangxiang', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 14; g.phase = 'play';
  p.hand = [card('j1', 'sha'), card('j2', 'shan'), card('j3', 'tao')];
  t.hp = t.maxHp - 1;
  const thp = t.hp;
  await g.useActiveSkill(p, 'sw2_jieyin');
  ok(hasLog(g, '结姻'), '结姻：缺少战报');
  ok(noErr(g), '结姻：技能执行异常');
  ok(t.hp === thp + 1, `结姻：目标应回复 1 点体力（${thp} → ${t.hp}）`);
  ok(p.hand.length === 2 && t.hand.length >= 1, `结姻：双方应各摸一张牌（p ${p.hand.length} / t ${t.hand.length}）`);

  // 反例：手牌不足两张不能发动
  const g2 = mk(['shenwu2_sunshangxiang', 'caocao'], H({ seats: [1] }));
  const p2 = g2.players[0];
  g2.turnPlayer = p2; g2.turnCount = 15; g2.phase = 'play';
  p2.hand = [card('j4', 'sha')];
  await g2.useActiveSkill(p2, 'sw2_jieyin');
  ok(hasLog(g2, '手牌不足两张'), '结姻：手牌不足应有提示');

  // 枭姬：失去装备区的牌后摸两张
  const g3 = mk(['shenwu2_sunshangxiang', 'caocao'], H({ yes: true }));
  const q = g3.players[0];
  q.hand = [];
  const eq = card('x1', 'qinggang');
  q.equips.weapon = eq;
  await g3.trigger('equip.lose', { self: q, card: eq, slot: 'weapon' });
  ok(q.hand.length === 2, `枭姬：失去装备牌后应摸两张（${q.hand.length}）`);
  ok(hasLog(g3, '枭姬'), '枭姬：缺少战报');
}

// ================= 7. 神貂蝉 · 离间 / 闭月 =================
{
  const g = mk(['shenwu2_diaochan', 'caocao', 'liubei'], H({ seats: [1, 2] }));
  const p = g.players[0], a = g.players[1], b = g.players[2];
  g.turnPlayer = p; g.turnCount = 16; g.phase = 'play';
  p.hand = [card('n1', 'sha'), card('n2', 'shan')];
  a.hand = [card('n3', 'sha')];
  b.hand = [card('n4', 'sha')];
  await g.useActiveSkill(p, 'sw2_lijian');
  ok(hasLog(g, '离间'), '离间：缺少战报');
  ok(noErr(g), '离间：技能执行异常');
  ok(p.hand.length === 1, `离间：应弃置一张牌作为代价（${p.hand.length}）`);
  ok(hasLog(g, '使用【决斗】'), '离间：应视为使用一张【决斗】');
  // 反例：男性角色不足两名
  const g2 = mk(['shenwu2_diaochan', 'zhenji'], H({ seats: [1] }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 17; g2.phase = 'play';
  q.hand = [card('n5', 'sha')];
  await g2.useActiveSkill(q, 'sw2_lijian');
  ok(hasLog(g2, '男性角色不足两名'), '离间：男性角色不足应有提示');

  // 闭月：造成过伤害摸 1，未造成伤害摸 2
  const g3 = mk(['shenwu2_diaochan', 'caocao'], H({}));
  const c = g3.players[0], d = g3.players[1];
  g3.turnPlayer = c; g3.turnCount = 18;
  c.hand = [];
  await g3.trigger('damage.after', { self: d, to: d, from: c, amount: 1, reason: 'test' });
  await g3.trigger('phase.begin', { self: c, phase: 'end' });
  ok(c.hand.length === 1, `闭月：本回合造成过伤害应摸 1 张（${c.hand.length}）`);
  const g4 = mk(['shenwu2_diaochan', 'caocao'], H({}));
  const e = g4.players[0];
  g4.turnPlayer = e; g4.turnCount = 19;
  e.hand = [];
  await g4.trigger('phase.begin', { self: e, phase: 'end' });
  ok(e.hand.length === 2, `闭月：未造成伤害应摸 2 张（${e.hand.length}）`);
}

// ================= 8. 神张春华 · 绝情 / 伤逝 =================
{
  const g = mk(['shenwu2_zhangchunhua', 'caocao'], H({}));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 20;
  const hp0 = t.hp;
  await g.damage({ from: p, to: t, amount: 1, card: card('q1', 'sha'), reason: 'sha' });
  ok(t.hp === hp0 - 1, `绝情：伤害应改为失去体力（${hp0} → ${t.hp}）`);
  ok(hasLog(g, '绝情'), '绝情：缺少战报');
  ok(hasLog(g, '免受伤害'), '绝情：应防止原伤害');
  // 反例：别人造成的伤害仍是普通伤害
  const g2 = mk(['shenwu2_zhangchunhua', 'caocao'], H({}));
  const p2 = g2.players[0], t2 = g2.players[1];
  g2.turnPlayer = t2; g2.turnCount = 21;
  const hp2 = p2.hp;
  await g2.damage({ from: t2, to: p2, amount: 1, reason: 'sha' });
  ok(p2.hp === hp2 - 1 && !hasLog(g2, '绝情'), '绝情：不应影响他人造成的伤害');

  // 伤逝：回合外手牌变化后补至已损体力
  const g3 = mk(['shenwu2_zhangchunhua', 'caocao'], H({}));
  const q = g3.players[0], o = g3.players[1];
  g3.turnPlayer = o; g3.turnCount = 22;
  q.hp = 1; q.maxHp = 3;      // 已损 2 点
  q.hand = [];
  await g3.trigger('hand.change', { self: q, count: 0 });
  ok(q.hand.length === 2, `伤逝：回合外应摸至已损体力值（${q.hand.length}）`);
  // 反例：自己的回合内不发动
  const g4 = mk(['shenwu2_zhangchunhua', 'caocao'], H({}));
  const r = g4.players[0];
  g4.turnPlayer = r; g4.turnCount = 23;
  r.hp = 1; r.maxHp = 3; r.hand = [];
  await g4.trigger('hand.change', { self: r, count: 0 });
  ok(r.hand.length === 0, `伤逝：自己的回合内不应发动（${r.hand.length}）`);
}

// ================= 9. 神夏侯渊 · 神速 / 千里 =================
{
  // 神速：选项①跳过判定与摸牌阶段
  const g = mk(['shenwu2_xiahouyuan', 'caocao'], H({ index: 0, seats: [1] }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 24; g.phase = 'prepare';
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(p.flags.skip_judge === true && p.flags.skip_draw === true, '神速：应跳过判定与摸牌阶段');
  ok(hasLog(g, '神速'), '神速：缺少战报');
  ok(noErr(g), '神速：技能执行异常');
  // 选项②弃置一张装备牌
  const g2 = mk(['shenwu2_xiahouyuan', 'caocao'], H({ index: 1, seats: [1] }));
  const p2 = g2.players[0];
  g2.turnPlayer = p2; g2.turnCount = 25; g2.phase = 'prepare';
  p2.hand = [card('u1', 'qinggang'), card('u2', 'sha')];
  await g2.trigger('phase.begin', { self: p2, phase: 'prepare' });
  ok(p2.hand.length === 1, `神速：应弃置一张装备牌（${p2.hand.length}）`);
  ok(p2.flags.skip_draw !== true, '神速：选②时不应跳过摸牌阶段');
  ok(noErr(g2), '神速：选项②技能执行异常');
  // 反例：取消则不发动
  const g3 = mk(['shenwu2_xiahouyuan', 'caocao'], H({ index: -1 }));
  const p3 = g3.players[0];
  g3.turnPlayer = p3; g3.turnCount = 26; g3.phase = 'prepare';
  await g3.trigger('phase.begin', { self: p3, phase: 'prepare' });
  ok(p3.flags.skip_draw !== true, '神速：取消时不应生效');

  // 千里：弃一张牌，本回合【杀】次数 +1 且无距离限制
  const g4 = mk(['shenwu2_xiahouyuan', 'caocao'], H({ seats: [1] }));
  const q = g4.players[0];
  g4.turnPlayer = q; g4.turnCount = 27; g4.phase = 'play';
  q.hand = [card('u3', 'sha'), card('u4', 'shan')];
  await g4.useActiveSkill(q, 'sw2_qianli');
  ok(hasLog(g4, '千里'), '千里：缺少战报');
  ok(q.flags.shaExtraTurn === 1 && q.flags.freeRangeTurn === 27, `千里：应获得【杀】次数 +1 与无距离限制（${q.flags.shaExtraTurn}/${q.flags.freeRangeTurn}，本回合类 → shaExtraTurn）`);
  // 反例：没有牌时不能发动
  const g5 = mk(['shenwu2_xiahouyuan', 'caocao'], H({ seats: [1] }));
  const r = g5.players[0];
  g5.turnPlayer = r; g5.turnCount = 28; g5.phase = 'play';
  r.hand = []; r.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
  await g5.useActiveSkill(r, 'sw2_qianli');
  ok(hasLog(g5, '没有可弃置的牌'), '千里：无牌应有提示');
}

// ================= 10. 神黄月英 · 藏巧 / 神械 =================
{
  const g = mk(['shenwu2_huangyueying', 'caocao'], H({ yes: true }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 29; g.round = 1;
  const eq = card('y1', 'qinggang');
  g.discardPile.push(eq);
  await g.trigger('turn.begin', { self: p });
  ok(hasLog(g, '藏巧'), '藏巧：缺少战报');
  ok(noErr(g), '藏巧：技能执行异常');
  ok(p.hand.some(c => c.__sw2Cq === true), '藏巧：应从弃牌堆获得一张装备牌并打上「藏巧」标记');
  ok(!g.discardPile.includes(eq), '藏巧：获得的牌应从弃牌堆移出');
  // 使用「藏巧」牌摸至体力上限
  const cq = p.hand.find(c => c.__sw2Cq === true);
  p.hand = [cq];
  await g.trigger('card.use.after', { self: p, card: cq, effName: 'qinggang', targets: [], reason: 'play' });
  ok(p.hand.length === 1 + Math.min(3, p.maxHp - 1), `藏巧：使用「藏巧」牌应摸至体力上限（${p.hand.length}）`);
  // 反例：同一轮不再获得
  const n0 = p.hand.length;
  await g.trigger('turn.begin', { self: p });
  ok(p.hand.length === n0, '藏巧：每轮只发动一次');
  // 反例：弃牌堆无装备牌则改为摸一张
  const g2 = mk(['shenwu2_huangyueying', 'caocao'], H({ yes: true }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 30; g2.round = 1;
  q.hand = [];
  g2.discardPile.length = 0;
  await g2.trigger('turn.begin', { self: q });
  ok(q.hand.length === 1, `藏巧：弃牌堆无装备牌应改为摸一张（${q.hand.length}）`);

  // 神械：黑色牌指定目标后弃置场上装备牌并摸两张
  const g3 = mk(['shenwu2_huangyueying', 'caocao'], H({ seats: [1] }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = a; g3.turnCount = 31;
  const beq = card('y2', 'bagua');
  b.equips.armor = beq;
  a.hand = [];
  const td = { self: a, target: b, card: card('y3', 'guohe', 'spade'), canceled: false, used: [], shaCtx: null };
  await g3.trigger('target.after', td);
  ok(hasLog(g3, '神械'), '神械：缺少战报');
  ok(b.equips.armor === null && a.hand.length === 2, `神械：应弃置其装备牌并摸两张（${a.hand.length}）`);
  // 反例：每回合限一次
  const beq2 = card('y4', 'bagua');
  b.equips.armor = beq2;
  a.hand = [];
  const td2 = { self: a, target: b, card: card('y5', 'guohe', 'club'), canceled: false, used: [], shaCtx: null };
  await g3.trigger('target.after', td2);
  ok(b.equips.armor === beq2 && a.hand.length === 0, '神械：每回合只能发动一次');
  // 反例：红色牌不触发
  const g4 = mk(['shenwu2_huangyueying', 'caocao'], H({ seats: [1] }));
  const c = g4.players[0], d = g4.players[1];
  g4.turnPlayer = c; g4.turnCount = 32;
  d.equips.armor = card('y6', 'bagua');
  c.hand = [];
  const td3 = { self: c, target: d, card: card('y7', 'guohe', 'heart'), canceled: false, used: [], shaCtx: null };
  await g4.trigger('target.after', td3);
  ok(c.hand.length === 0 && !hasLog(g4, '神械'), '神械：红色牌不应触发');
}

// ================= 总结 =================
console.log('\n===== shenwu2check（阶段 6A 神·武（补全）8 将）=====');
console.log(`断言通过：${pass}    失败：${fail}`);
if (fail) {
  console.log('失败明细：');
  for (const m of bad) console.log('  ✗ ' + m);
  process.exitCode = 1;
} else {
  console.log('全部断言通过 ✅');
}
