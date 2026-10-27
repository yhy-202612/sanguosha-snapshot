// 阶段 5B「国战·不臣篇」（buchen · 7 将 / 13 技）守门测试
// 运行：node tools/buchencheck.js
// 说明：本批次按文件边界要求不改 src/data/generals.js 与 src/skills/index.js，
//   故武将数据直接从 '../src/data/buchen.js' 读取构造对局；
//   「generals.js 已注册」相关断言在未注册时降级为提示（注册后自动生效）。
import '../src/skills/buchen.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { BUCHEN_GENERALS } from '../src/data/buchen.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });
const GEN = (id) => BUCHEN_GENERALS.find(g => g.id === id) || generalById(id);
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: GEN(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261025,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
// 桩 handler：默认 yes / 第一个目标 / 第 0 个选项
const H = (over = {}) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: over.yes !== false };
  if (req.kind === 'targets') return { seats: (over.seats || [1]).slice(0, req.max || 1) };
  if (req.kind === 'choice') return { index: over.index !== undefined ? over.index : 0 };
  if (req.kind === 'card') return { cardId: over.cardId || (p.hand[0] || {}).id };
  return null;
};
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));
const noErr = (g) => !g.logs.some(l => l.text.includes('执行异常'));

// ================= 1. 数据注册 =================
const EXPECT = [
  ['buchen_mengda', '孟达', 'wei', 'shu', 3, ['bc_qiuan', 'bc_liangfan']],
  ['mifang_fushiren', '糜芳&傅士仁', 'shu', 'wu', 4, ['bc_fengshi']],
  ['buchen_liuqi', '刘琦', 'shu', 'qun', 3, ['bc_wenji', 'bc_tunjiang']],
  ['buchen_zhanglu', '张鲁', 'wei', 'qun', 3, ['bc_bushi', 'bc_midao']],
  ['buchen_shixie', '士燮', 'wu', 'qun', 3, ['bc_biluan', 'bc_lixia']],
  ['buchen_tangzi', '唐咨', 'wei', 'wu', 4, ['bc_xingzhao']],
  ['buchen_yanbaihu', '严白虎', 'qun', null, 4, ['bc_zhidao', 'bc_jili']],
];
ok(BUCHEN_GENERALS.length === 7, `BUCHEN_GENERALS 应为 7 位（跳过的董昭/徐庶已存在），实际 ${BUCHEN_GENERALS.length}`);
for (const [id, name, kingdom, kingdom2, hp, skills] of EXPECT) {
  const gd = BUCHEN_GENERALS.find(x => x.id === id);
  ok(!!gd, `${id} 数据缺失`);
  if (!gd) continue;
  ok(gd.name === name, `${id} 名称不符：${gd.name}`);
  ok(gd.kingdom === kingdom, `${id} 势力不符：${gd.kingdom}`);
  ok((gd.kingdom2 || null) === kingdom2, `${id} 第二势力不符：${gd.kingdom2}`);
  ok(gd.hp === hp, `${id} 体力不符：${gd.hp}`);
  ok(gd.pack === 'buchen', `${id} pack 应为 buchen，实际 ${gd.pack}`);
  ok(Array.isArray(gd.skills) && gd.skills.length === skills.length, `${id} 技能数量不符：${gd.skills}`);
  for (const s of skills) {
    ok(gd.skills.includes(s), `${id} 技能列表缺少 ${s}`);
    ok(hasSkill(s), `技能 ${s} 未注册`);
  }
}
// 无重复 id / 无重名将（本批不得与既有包撞名）
{
  const ids = BUCHEN_GENERALS.map(g => g.id);
  ok(new Set(ids).size === ids.length, 'BUCHEN_GENERALS 存在重复 id');
  for (const gd of BUCHEN_GENERALS) {
    const dup = GENERALS.filter(x => x.name === gd.name && x.pack !== 'buchen');
    ok(dup.length === 0, `武将名 ${gd.name} 与既有包重名（${dup.map(x => x.id + '@' + x.pack).join(',')}）`);
  }
}
// generals.js / PACK_CN 注册情况（未注册时只提示，不判失败）
{
  const registered = GENERALS.filter(g => g.pack === 'buchen');
  if (registered.length === 0) {
    console.log('ℹ 提示：generals.js 尚未注册 buchen 包（主控统一注册后，以下断言会自动生效）');
  } else {
    ok(registered.length === 7, `generals.js 中 buchen 包将数应为 7，实际 ${registered.length}`);
    ok(PACK_CN.buchen === '国战·不臣篇', `PACK_CN.buchen 不符：${PACK_CN.buchen}`);
    for (const [id, name] of EXPECT) {
      const gd = generalById(id);
      ok(!!gd && gd.name === name && gd.pack === 'buchen', `generalById(${id}) 注册异常`);
    }
  }
}

// ================= 2. 技能 id / 描述规范 =================
const SKILLS = ['bc_qiuan', 'bc_liangfan', 'bc_fengshi', 'bc_wenji', 'bc_tunjiang', 'bc_bushi', 'bc_midao',
  'bc_biluan', 'bc_lixia', 'bc_xingzhao', 'bc_xunxun', 'bc_zhidao', 'bc_jili'];
for (const s of SKILLS) {
  ok(s.startsWith('bc_'), `技能 id ${s} 必须带 bc_ 前缀`);
  ok(!/^(jie_|mou_|ji_|shen_|sp_|ol_)/.test(s), `技能 id ${s} 使用了会被降级的禁用前缀`);
  ok(hasSkill(s), `技能 ${s} 未注册`);
  const sk = getSkill(s);
  ok(!!sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
  ok(!!sk && !!sk.name && !!sk.desc && sk.desc.length > 5, `技能 ${s} 缺少 name/desc`);
  ok(!!sk && ((sk.triggers || []).length + (sk.active ? 1 : 0)) > 0, `技能 ${s} 没有任何触发/主动实现`);
}

// ================= 3. 孟达 · 求安 / 量反 =================
{
  const g = mk(['buchen_mengda', 'caocao'], H({ yes: true }));
  const p = g.players[0], q = g.players[1];
  p.hp = p.maxHp;
  const c1 = card('k1', 'sha');
  await g.damage({ from: q, to: p, amount: 1, card: c1, reason: 'sha' });
  ok(p.hp === p.maxHp, `求安：应防止此伤害（体力 ${p.hp}/${p.maxHp}）`);
  ok((p.flags.hanCards || []).length === 1 && p.flags.hanCards[0] === c1, '求安：应将造成伤害的牌置于武将牌上（「函」）');
  ok(hasLog(g, '求安'), '求安：缺少战报');
  ok(noErr(g), '求安：技能执行异常');

  await g.damage({ from: q, to: p, amount: 1, card: card('k2', 'sha'), reason: 'sha' });
  ok(p.hp === p.maxHp - 1, `求安：已有「函」时不再发动（体力应 -1，实际 ${p.hp}/${p.maxHp}）`);

  // 量反：准备阶段获得「函」并失去 1 点体力
  g.turnCount = 3;
  const hand0 = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok((p.flags.hanCards || []).length === 0, '量反：应获得所有「函」');
  ok(p.hand.includes(c1), '量反：「函」应进入手牌');
  ok(p.hand.length === hand0 + 1, `量反：手牌应 +1（${hand0} → ${p.hand.length}）`);
  ok(p.hp === p.maxHp - 2, `量反：应失去1点体力（${p.hp}/${p.maxHp}）`);
  ok(!!p.flags.liangfan && p.flags.liangfan.ids.includes('k1'), '量反：应记录本回合获得的「函」');
  ok(hasLog(g, '量反'), '量反：缺少战报');

  // 用「函」造成伤害 → 获得受伤角色一张牌
  const t = g.players[1];
  t.hand = [card('th1', 'shan')];
  await g.trigger('damage.after', { self: t, to: t, from: p, amount: 1, card: c1, reason: 'sha' });
  ok(t.hand.length === 0, '量反：应获得受伤角色的一张牌');
  ok(!p.flags.liangfan.ids.includes('k1'), '量反：该「函」的加值应已消耗');
  ok(noErr(g), '量反：技能执行异常');
}

// ================= 4. 糜芳&傅士仁 · 锋势 =================
{
  const g = mk(['mifang_fushiren', 'caocao'], H({ yes: true, index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnCount = 4; g.phase = 'play'; g.turnPlayer = p;
  p.hand = [card('f1', 'sha'), card('f2', 'shan'), card('f3', 'tao')];
  t.hand = [card('f4', 'tao')];
  const c = card('f5', 'sha');
  await g.trigger('card.use.before', { self: p, card: c, effName: 'sha', targets: [t], reason: 'play' });
  ok(p.hand.length === 2, `锋势①：应弃置自己一张牌（实际 ${p.hand.length}）`);
  ok(t.hand.length === 0, '锋势①：应弃置目标一张牌');
  ok(c.__fengshi === true, '锋势①：应记录此牌伤害+1');
  ok(hasLog(g, '锋势'), '锋势：缺少战报');
  const dd = { self: t, to: t, from: p, amount: 1, nature: 'normal', card: c, reason: 'sha', canceled: false };
  await g.trigger('damage.before', dd);
  ok(dd.amount === 2, `锋势①：此牌伤害应+1（实际 ${dd.amount}）`);
  ok(c.__fengshi === undefined, '锋势：加伤只应生效一次');

  // ② 你成为其他角色使用牌的唯一目标
  const g2 = mk(['mifang_fushiren', 'caocao'], H({ yes: true, index: 0 }));
  const p2 = g2.players[0], u2 = g2.players[1];
  g2.turnCount = 5; g2.phase = 'play'; g2.turnPlayer = u2;
  p2.hand = [card('f6', 'shan')];
  u2.hand = [card('f7', 'sha'), card('f8', 'wuqi')].filter(Boolean);
  const c2 = card('f9', 'sha');
  await g2.trigger('card.use.before', { self: u2, card: c2, effName: 'sha', targets: [p2], reason: 'play' });
  ok(p2.hand.length === 0, `锋势②：你应弃置自己一张牌（实际 ${p2.hand.length}）`);
  ok(u2.hand.length === 1, `锋势②：应弃置使用者一张牌（实际 ${u2.hand.length}）`);
  ok(c2.__fengshi === true, '锋势②：应记录此牌伤害+1');
  ok(noErr(g2), '锋势：技能执行异常');
}

// ================= 5. 刘琦 · 问计 / 屯江 =================
{
  // 同势力 → 本回合使用该牌无距离/次数限制且不能被响应
  const g = mk(['buchen_liuqi', 'liubei'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnCount = 6; g.phase = 'play'; g.turnPlayer = p;
  t.hand = [card('w1', 'sha')];
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(!!p.flags.wenji && p.flags.wenji.cardId === 'w1', '问计：同势力应标记该牌本回合无限制');
  ok(p.hand.some(c => c.id === 'w1'), '问计：应获得对方交出的一张牌');
  ok(hasLog(g, '问计'), '问计：缺少战报');
  const used = p.hand.find(c => c.id === 'w1');
  const d = { self: p, card: used, effName: 'sha', targets: [t], reason: 'play' };
  await g.trigger('card.use.before', d);
  ok(d.unavoidable === true, '问计：使用该牌应不能被响应');
  ok(p.flags.wenji === null, '问计：效果应只对那一张牌生效');

  // 无距离限制（同步钩子）
  const g3 = mk(['buchen_liuqi', 'caocao', 'liubei', 'sunquan']);
  const a = g3.players[0];
  g3.turnCount = 7;
  const raw = g3.distance(a, g3.players[2]);
  a.flags.wenji = { cardId: 'x', turn: 7 };
  const free = g3.distance(a, g3.players[2]);
  ok(raw > 1, `问计：测试距离应大于1（实际 ${raw}）`);
  ok(free === 1, `问计：应无距离限制（${raw} → ${free}）`);

  // 势力不同 → 你交给其一张牌
  const g2 = mk(['buchen_liuqi', 'caocao'], H({ seats: [1], index: 0 }));
  const p2 = g2.players[0], t2 = g2.players[1];
  g2.turnCount = 8; g2.phase = 'play'; g2.turnPlayer = p2;
  t2.hand = [card('x1', 'shan')];
  p2.hand = [card('x2', 'sha'), card('x3', 'tao')];
  await g2.trigger('phase.begin', { self: p2, phase: 'play' });
  ok(!p2.flags.wenji, '问计：势力不同时不应获得「无限制」效果');
  ok(t2.hand.length === 1 && ['x2', 'x3'].includes(t2.hand[0]?.id),
    `问计：势力不同应交给其一张除其交给你之外的牌（实际 ${JSON.stringify(t2.hand.map(c => c.id))}）`);
  ok(p2.hand.length === 2, `问计：自己手牌应净变化 0（实际 ${p2.hand.length}）`);
  ok(noErr(g2), '问计：技能执行异常');
}
{
  // 屯江：结束阶段开始时摸全场势力数张牌
  const g = mk(['buchen_liuqi', 'caocao', 'liubei', 'buchen_yanbaihu'], H({ yes: true }));
  const p = g.players[0];
  g.turnCount = 9; g.turnPlayer = p; g.phase = 'play';
  await g.trigger('card.use.before', { self: p, card: card('u1', 'wuzhong'), effName: 'wuzhong', targets: [p], reason: 'play' });
  ok(p.flags.tjUsed === 1 && !p.flags.tjOther, '屯江：应记录「使用过牌且未指定其他角色」');
  const before = p.hand.length;
  const k = new Set(g.alive().map(x => x.kingdom)).size;
  g.phase = 'end';
  await g.trigger('phase.begin', { self: p, phase: 'end' });
  ok(p.hand.length === before + k, `屯江：应摸全场势力数张牌（${before} → ${p.hand.length}，势力数 ${k}）`);
  ok(hasLog(g, '屯江'), '屯江：缺少战报');

  // 指定过其他角色 → 不触发
  const g2 = mk(['buchen_liuqi', 'caocao'], H({ yes: true }));
  const q = g2.players[0];
  g2.turnCount = 10; g2.turnPlayer = q; g2.phase = 'play';
  await g2.trigger('card.use.before', { self: q, card: card('u2', 'sha'), effName: 'sha', targets: [g2.players[1]], reason: 'play' });
  ok(q.flags.tjOther === true, '屯江：应记录「已指定过其他角色」');
  const h0 = q.hand.length;
  g2.phase = 'end';
  await g2.trigger('phase.begin', { self: q, phase: 'end' });
  ok(q.hand.length === h0, '屯江：指定过其他角色则不应摸牌');
  ok(noErr(g2), '屯江：技能执行异常');
}

// ================= 6. 张鲁 · 布施 / 米道 =================
{
  const g = mk(['buchen_zhanglu', 'caocao', 'liubei']);
  const p = g.players[0], w = g.players[1], s = g.players[2];
  g.turnCount = 11; g.phase = 'play';
  const h0 = [p.hand.length, w.hand.length, s.hand.length];
  await g.trigger('damage.after', { self: p, to: p, from: w, amount: 1, nature: 'normal', card: card('b1', 'sha'), reason: 'sha' });
  ok(p.hand.length === h0[0] + 1 && w.hand.length === h0[1] + 1, '布施：受伤后应令与你势力相同的角色各摸一张牌');
  ok(s.hand.length === h0[2], '布施：势力不同的角色不应摸牌');
  ok(hasLog(g, '布施'), '布施：缺少战报');
  const b = [p.hand.length, w.hand.length, s.hand.length];
  await g.trigger('damage.after', { self: s, to: s, from: p, amount: 1, nature: 'normal', card: card('b2', 'sha'), reason: 'sha' });
  ok(s.hand.length === b[2] + 1, '布施：造成伤害后应令与受伤角色势力相同的角色摸一张牌');
  ok(p.hand.length === b[0], '布施：造成伤害方向不应令自己摸牌（受伤角色为蜀）');
  ok(noErr(g), '布施：技能执行异常');
}
{
  const g = mk(['buchen_zhanglu', 'caocao', 'sunquan'], H({ yes: true, index: 1 }));
  const p = g.players[0], u = g.players[1], t = g.players[2];
  g.turnCount = 12; g.phase = 'play'; g.turnPlayer = u;
  u.hand = [card('m1', 'sha'), card('m2', 'tao')];
  const used = card('m3', 'sha');
  const d = { self: u, target: t, card: used, canceled: false, used: [], shaCtx: null };
  await g.trigger('target.before', d);
  ok(used.suit === 'heart', `米道：应按声明改写此牌花色（实际 ${used.suit}）`);
  ok(u.flags.midaoTurn === 12, '米道：应记录本回合已发动');
  ok(p.hand.length >= 1, '米道：使用者应交给你一张手牌');
  ok(hasLog(g, '米道'), '米道：缺少战报');
  const dd = { self: t, to: t, from: u, amount: 1, nature: 'normal', card: used, reason: 'sha', canceled: false };
  await g.trigger('damage.before', dd);
  ok(dd.nature === 'fire', `米道：伤害属性应视为声明属性（实际 ${dd.nature}）`);
  await g.trigger('card.use.after', { self: u, card: used, effName: 'sha', targets: [t], reason: 'play' });
  ok(used.suit === 'spade' && used.__origSuit === undefined, '米道：结算结束后应恢复原花色');
  // 每回合限一次
  const d2 = { self: u, target: t, card: card('m4', 'sha'), canceled: false, used: [], shaCtx: null };
  await g.trigger('target.before', d2);
  ok(d2.card.suit === 'spade', '米道：同一回合只能发动一次');
  // 非伤害类锦囊不触发
  const d3 = { self: u, target: t, card: card('m5', 'wuzhong'), canceled: false, used: [], shaCtx: null };
  u.flags.midaoTurn = null;
  await g.trigger('target.before', d3);
  ok(d3.card.suit === 'spade', '米道：非【杀】/伤害类锦囊不应触发');
  ok(noErr(g), '米道：技能执行异常');
}

// ================= 7. 士燮 · 避乱 / 礼下 =================
{
  const g = mk(['buchen_shixie', 'caocao', 'liubei', 'sunquan']);
  const p = g.players[0];
  const raw = g.distance(g.players[2], p);
  ok(raw === 3, `避乱：其他角色与你的距离应+1（实际 ${raw}）`);
  p.equips.weapon = card('e1', 'qinggang');
  p.equips.armor = card('e2', 'bagua');
  const d2 = g.distance(g.players[2], p);
  ok(d2 === 4, `避乱：装备区 2 张牌应+2（实际 ${d2}）`);
  // 你与其他角色的距离不受影响
  ok(g.distance(p, g.players[2]) === 2, `避乱：不应影响你计算与他人的距离（实际 ${g.distance(p, g.players[2])}）`);
}
{
  const g = mk(['buchen_shixie', 'caocao'], H({ yes: true, index: 0 }));
  const p = g.players[0], q = g.players[1];
  g.turnCount = 13;
  p.equips.weapon = card('e3', 'qinggang');
  q.hand = [card('l1', 'sha'), card('l2', 'shan'), card('l3', 'tao')];
  await g.trigger('phase.begin', { self: q, phase: 'prepare' });
  ok(p.equips.weapon === null, '礼下：应弃置士燮装备区里的一张牌');
  ok(q.hand.length === 1, `礼下：选项「弃置两张手牌」应生效（实际剩 ${q.hand.length}）`);
  ok(hasLog(g, '礼下'), '礼下：缺少战报');
  ok(noErr(g), '礼下：技能执行异常');
  // 势力相同不触发
  const g2 = mk(['buchen_shixie', 'sunquan'], H({ yes: true, index: 0 }));
  g2.players[0].equips.weapon = card('e4', 'qinggang');
  await g2.trigger('phase.begin', { self: g2.players[1], phase: 'prepare' });
  ok(g2.players[0].equips.weapon !== null, '礼下：势力相同不应发动');
  // 选项 3：令士燮摸两张牌
  const g3 = mk(['buchen_shixie', 'caocao'], H({ yes: true, index: 2 }));
  const p3 = g3.players[0], q3 = g3.players[1];
  g3.turnCount = 14;
  p3.equips.armor = card('e5', 'bagua');
  q3.hand = [card('l4', 'sha'), card('l5', 'shan'), card('l6', 'tao')];
  const hp = p3.hand.length;
  await g3.trigger('phase.begin', { self: q3, phase: 'prepare' });
  ok(p3.hand.length === hp + 2, `礼下：选项 3 应令士燮摸两张牌（${hp} → ${p3.hand.length}）`);
}

// ================= 8. 唐咨 · 兴棹 / 恂恂 =================
{
  const g = mk(['buchen_tangzi', 'caocao', 'liubei', 'sunquan', 'buchen_yanbaihu'], H({ yes: true, index: 0 }));
  const p = g.players[0];
  g.turnCount = 15; g.phase = 'play'; g.turnPlayer = p;
  g.players[1].hp = g.players[1].maxHp - 1;   // 魏 受伤
  g.players[2].hp = g.players[2].maxHp - 1;   // 蜀 受伤
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.xzLevel === 2, `兴棹：受伤势力数应为 2（实际 ${p.flags.xzLevel}）`);
  ok(p.skills.some(s => s.id === 'bc_xunxun'), '兴棹：1 个或以上受伤势力应拥有【恂恂】');
  ok(hasLog(g, '兴棹'), '兴棹：缺少战报');

  // 2 个或以上：受到伤害后，与伤害来源中手牌唯一最少者摸一张牌
  p.hand = [];
  p.hp = p.maxHp - 1;
  g.players[1].hand = [card('x1', 'sha'), card('x2', 'shan')];
  await g.trigger('damage.after', { self: p, to: p, from: g.players[1], amount: 1, nature: 'normal', card: card('x3', 'sha'), reason: 'sha' });
  ok(p.hand.length === 1, `兴棹：手牌唯一最少的自己应摸一张牌（实际 ${p.hand.length}）`);

  // 3 个或以上：手牌上限+4
  g.players[3].hp = g.players[3].maxHp - 1;   // 吴 受伤
  g.phase = 'discard';
  await g.trigger('phase.begin', { self: p, phase: 'discard' });
  ok(p.flags.xzLevel === 3 && p.flags.handLimit === 4, `兴棹：3 级应手牌上限+4（${p.flags.xzLevel}/${p.flags.handLimit}）`);

  // 4 个或以上：失去装备区里的牌时摸一张牌
  g.players[4].hp = g.players[4].maxHp - 1;   // 群 受伤
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.xzLevel === 4, `兴棹：受伤势力数应为 4（实际 ${p.flags.xzLevel}）`);
  const h0 = p.hand.length;
  await g.trigger('equip.lose', { self: p, card: card('z1', 'qinggang'), slot: 'weapon' });
  ok(p.hand.length === h0 + 1, '兴棹：4 级失去装备区里的牌应摸一张牌');

  // 恂恂本体
  const g2 = mk(['buchen_tangzi', 'caocao'], H({ yes: true, index: 0 }));
  const q = g2.players[0];
  g2.players[1].hp = g2.players[1].maxHp - 1;
  g2.turnCount = 16;
  await g2.trigger('turn.begin', { self: q });
  ok(q.skills.some(s => s.id === 'bc_xunxun'), '兴棹：应按势力数动态赋予【恂恂】');
  g2.phase = 'draw';
  const dn = g2.deck.length;
  await g2.trigger('phase.begin', { self: q, phase: 'draw' });
  ok(hasLog(g2, '恂恂'), '恂恂：缺少战报');
  ok(g2.deck.length === dn, `恂恂：牌堆数量不应变化（${dn} → ${g2.deck.length}）`);
  ok(noErr(g2), '恂恂：技能执行异常');
}

// ================= 9. 严白虎 · 雉盗 / 寄篱 =================
{
  const g = mk(['buchen_yanbaihu', 'caocao', 'liubei', 'sunquan', 'huatuo'], H({ seats: [3], index: 0 }));
  const p = g.players[0], near = g.players[1], far = g.players[3];
  g.turnCount = 17; g.phase = 'play'; g.turnPlayer = p;
  const raw = g.distance(p, far);
  ok(raw > 1, `雉盗：测试距离应大于1（实际 ${raw}）`);
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(!!p.flags.zhidao && p.flags.zhidao.seat === 3, '雉盗：出牌阶段开始应记录选择的角色');
  ok(g.distance(p, far) === 1, `雉盗：与其距离应视为1（实际 ${g.distance(p, far)}）`);
  ok(hasLog(g, '雉盗'), '雉盗：缺少战报');
  const d1 = { self: p, target: near, card: card('z2', 'sha'), canceled: false, used: [], shaCtx: null };
  await g.trigger('target.before', d1);
  ok(d1.canceled === true, '雉盗：不能指定除其外的角色为目标');
  const d2 = { self: p, target: far, card: card('z3', 'sha'), canceled: false, used: [], shaCtx: null };
  await g.trigger('target.before', d2);
  ok(d2.canceled === false, '雉盗：应可指定所选角色为目标');
  far.hand = [card('z4', 'tao')];
  const h0 = p.hand.length;
  await g.trigger('damage.after', { self: far, to: far, from: p, amount: 1, nature: 'normal', card: card('z5', 'sha'), reason: 'sha' });
  ok(far.hand.length === 0 && p.hand.length === h0 + 1, '雉盗：出牌阶段首次对其造成伤害后应获得其区域里的一张牌');
  await g.trigger('turn.end', { self: p });
  ok(!p.flags.zhidao, '雉盗：回合结束应清除记录');
  ok(noErr(g), '雉盗：技能执行异常');
}
{
  // ② 红色基本牌/普通锦囊唯一目标 → 结算两次
  const g = mk(['buchen_yanbaihu', 'caocao'], H({ yes: true, index: 0 }));
  const p = g.players[0], u = g.players[1];
  g.turnCount = 18; g.phase = 'play'; g.turnPlayer = u;
  p.hand = [card('j1', 'shan'), card('j2', 'shan')];
  p.hp = p.maxHp;
  await g.trigger('card.use.after', { self: u, card: card('j3', 'sha', 'heart'), effName: 'sha', targets: [p], reason: 'play' });
  ok(hasLog(g, '寄篱'), '寄篱：缺少战报（应视为再使用一次）');
  ok(noErr(g), '寄篱：技能执行异常');
  // 黑色牌不触发
  const g2 = mk(['buchen_yanbaihu', 'caocao'], H({ yes: true, index: 0 }));
  const p2 = g2.players[0], u2 = g2.players[1];
  g2.turnCount = 19;
  await g2.trigger('card.use.after', { self: u2, card: card('j4', 'sha', 'spade'), effName: 'sha', targets: [p2], reason: 'play' });
  ok(!hasLog(g2, '寄篱'), '寄篱：黑色牌不应触发');
  // ③ 一阶段内第二次伤害被防止并「移除该武将牌」
  const g3 = mk(['buchen_yanbaihu', 'caocao'], H({ yes: true, index: 0 }));
  const q = g3.players[0], atk = g3.players[1];
  g3.turnCount = 20; g3.phase = 'play'; q.hp = q.maxHp;
  const b1 = { self: q, to: q, from: atk, amount: 1, nature: 'normal', card: card('j5', 'sha'), reason: 'sha', canceled: false };
  await g3.trigger('damage.before', b1);
  ok(b1.canceled === false, '寄篱：本阶段第一次伤害不应被防止');
  await g3.trigger('damage.after', { self: q, to: q, from: atk, amount: 1, nature: 'normal', card: card('j5', 'sha'), reason: 'sha' });
  const b2 = { self: q, to: q, from: atk, amount: 1, nature: 'normal', card: card('j6', 'sha'), reason: 'sha', canceled: false };
  await g3.trigger('damage.before', b2);
  ok(b2.canceled === true, '寄篱：本阶段第二次伤害应被防止');
  ok(!q.skills.some(s => s.id === 'bc_zhidao') && !q.skills.some(s => s.id === 'bc_jili'), '寄篱：应失去【雉盗】【寄篱】（等价「移除此武将牌」）');
  ok(q.maxHp === 3, `寄篱：体力上限应-1（实际 ${q.maxHp}）`);
  ok(hasLog(g3, '寄篱'), '寄篱：第二次伤害缺少战报');
  ok(noErr(g3), '寄篱：技能执行异常');
}

// ================= 汇总 =================
console.log(`\n=== buchen 批次守门测试：通过 ${pass} / 失败 ${fail} ===`);
if (fail) {
  for (const m of bad) console.log(`  ✗ ${m}`);
  process.exitCode = 1;
} else {
  console.log('全部断言通过 ✓');
}
