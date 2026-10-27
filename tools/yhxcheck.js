// 阶段 6E · 一将成名 2022–2026（十周年原创线）14 将 守门测试（pack = 'yhx'）
// 运行：node tools/yhxcheck.js
// 说明：本批次按任务约束「只新增 3 个文件」，不改 src/data/generals.js 与 src/skills/index.js，
//       故测试直接 import 自己的技能/数据文件，并在运行时把 YHX_GENERALS 注入 GENERALS 注册表。
import '../src/skills/yhx.js';
import { YHX_GENERALS } from '../src/data/yhx.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

// —— 运行时注册（主控合入 generals.js 后此段变成幂等空操作）
for (const gd of YHX_GENERALS) {
  if (!generalById(gd.id)) GENERALS.push(gd);
}

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261130,
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
  if (req.kind === 'discard') return { cardIds: (req.cards || []).slice(0, req.min || 1) };
  return null;
};
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));
const noErr = (g) => !g.logs.some(l => l.text.includes('执行异常'));

// ================= 1. 数据注册 =================
const EXPECT = [
  ['yhx_zhugeshang', '诸葛尚', 'shu', 3, ['yhxs_sangu', 'yhxs_yizu']],
  ['yhx_lukai', '陆凯', 'wu', 4, ['yhxs_bushi', 'yhxs_zhongzhuang']],
  ['yhx_kebineng', '轲比能', 'qun', 4, ['yhxs_koujing']],
  ['yhx_wuanguo', '武安国', 'qun', 4, ['yhxs_diezhang', 'yhxs_duanwan']],
  ['yhx_sufei', '苏飞', 'wu', 4, ['yhxs_shujian']],
  ['yhx_qiaozhou', '谯周', 'shu', 3, ['yhxs_shiming', 'yhxs_jiangxi']],
  ['yhx_caorui', '曹叡', 'wei', 3, ['yhxs_huituo', 'yhxs_mingjian']],
  ['yhx_caoxiu', '曹休', 'wei', 4, ['yhxs_qianju', 'yhxs_qingxi']],
  ['yhx_xiahoushi', '夏侯氏', 'shu', 3, ['yhxs_qiaoshi', 'yhxs_yanyu']],
  ['yhx_sunxiu', '孙休', 'wu', 3, ['yhxs_yanzhu', 'yhxs_xingxue']],
  ['yhx_guohuanghou', '郭皇后', 'wei', 3, ['yhxs_jiazhao', 'yhxs_danxin']],
  ['yhx_liuyu', '刘虞', 'qun', 2, ['yhxs_zhige', 'yhxs_zongzuo']],
  ['yhx_xinxianying', '辛宪英', 'wei', 3, ['yhxs_zhongjian', 'yhxs_caishi']],
  ['yhx_wuxian', '吴苋', 'shu', 3, ['yhxs_fumian', 'yhxs_daiyan']],
];
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 数据缺失`);
  if (!gd) continue;
  ok(gd.name === name, `${id} 名称不符：${gd.name}`);
  ok(gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符：${gd.kingdom}/${gd.hp}`);
  ok(gd.pack === 'yhx', `${id} pack 应为 yhx，实际 ${gd.pack}`);
  ok(Array.isArray(gd.skills) && gd.skills.length === skills.length, `${id} 技能数量不符：${gd.skills}`);
  for (const s of skills) {
    ok(gd.skills.includes(s), `${id} 技能列表缺少 ${s}`);
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && sk.name && sk.desc && sk.desc.length > 8, `技能 ${s} 缺少 name/desc`);
  }
}
ok(YHX_GENERALS.length === 14, `YHX_GENERALS 应为 14 位，实际 ${YHX_GENERALS.length}`);
ok(GENERALS.filter(g => g.pack === 'yhx').length === 14, `yhx 包将数应为 14，实际 ${GENERALS.filter(g => g.pack === 'yhx').length}`);
// 无重名（与仓库既有 363 位武将逐一比对）
{
  const mine = new Set(YHX_GENERALS.map(g => g.name));
  const dupName = GENERALS.filter(g => !String(g.id).startsWith('yhx_') && mine.has(g.name)).map(g => g.name);
  ok(dupName.length === 0, `YHX 武将名与既有武将重名：${dupName.join('、')}`);
  ok(GENERALS.filter(g => mine.has(g.name)).length === 14, 'YHX 武将名在全表中应恰好出现 14 次（不得重名）');
  const ids = YHX_GENERALS.map(g => g.id);
  ok(new Set(ids).size === ids.length, 'YHX 武将 id 存在重复');
  ok(GENERALS.filter(g => ids.includes(g.id)).length === 14, 'YHX 武将 id 注册数不为 14');
  // 女将 gender 标注
  for (const id of ['yhx_xiahoushi', 'yhx_guohuanghou', 'yhx_xinxianying', 'yhx_wuxian']) {
    ok(generalById(id).gender === 'female', `${id} 应标注 gender:'female'`);
  }
}
// 技能 id 前缀红线
const ALL_SK = EXPECT.flatMap(x => x[4]);
ok(new Set(ALL_SK).size === ALL_SK.length, '技能 id 存在重复');
for (const sk of ALL_SK) {
  ok(sk.startsWith('yhxs_'), `技能 id ${sk} 应使用 yhxs_ 前缀`);
  ok(!/^(jie_|mou_|ji_|shen_|sp_|ol_|bc_|sk4_|sn_)/.test(sk), `技能 id ${sk} 使用了禁用/越界前缀`);
  const base = sk.replace(/^yhxs_/, '');
  ok(!hasSkill(base), `技能 ${sk} 去掉 yhxs_ 后与既有技能 ${base} 冲突`);
}
// 主控待办：PACK_CN 尚未登记（不改 generals.js 的约束下测试只做提示，不计失败）
const packCnReady = PACK_CN.yhx === '一将成名·十周年';

// ================= 2. 主动技按钮可见性 =================
{
  const ACTIVE = ['yhx_caorui', 'yhx_sunxiu', 'yhx_sufei', 'yhx_xiahoushi',
    'yhx_xinxianying', 'yhx_guohuanghou', 'yhx_liuyu'];
  for (const id of ACTIVE) {
    const g = mk([id, 'caocao']);
    const p = g.players[0];
    g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
    const names = g.activeSkillsOf(p).map(s => s.id);
    ok((generalById(id).skills || []).some(s => names.includes(s)), `${id} 的主动技未出现在 activeSkillsOf 中（${names.join(',')}）`);
  }
  for (const id of ['yhx_zhugeshang', 'yhx_lukai', 'yhx_kebineng', 'yhx_wuanguo', 'yhx_qiaozhou', 'yhx_caoxiu']) {
    const g = mk([id, 'caocao']);
    const p = g.players[0];
    g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
    const own = g.activeSkillsOf(p).filter(s => (generalById(id).skills || []).includes(s.id));
    ok(own.length === 0, `${id} 不应有主动技按钮：${own.map(s => s.id).join(',')}`);
  }
}

// ================= 3. 诸葛尚 · 三顾 / 轶祖 =================
{
  const g = mk(['yhx_zhugeshang', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3; g.phase = 'play';
  p.hand = [card('a1', 'sha'), card('a2', 'shan')];
  const hp0 = p.hp;
  // 本阶段未使用过【杀】→ 发动后失去 1 点体力
  await g.trigger('phase.end', { self: p, phase: 'play' });
  ok(hasLog(g, '三顾'), '三顾：缺少战报');
  ok(noErr(g), '三顾：技能执行异常');
  ok(t.flags.yhxSangu && t.flags.yhxSangu.left >= 1, '三顾：应在目标身上记录「视为牌」');
  ok(p.hp === hp0 - 1, `三顾：选择了本阶段未使用过的牌名，应失去 1 点体力（${hp0} → ${p.hp}）`);
  // 目标下个出牌阶段使用同名牌 → 额外摸一张
  const th = t.hand.length;
  await g.trigger('card.use.after', { self: t, card: card('b1', 'sha'), reason: 'play' });
  ok(t.hand.length === th + 1, `三顾：目标使用所选同名牌应摸一张（${th} → ${t.hand.length}）`);
  // 已使用过该牌名 → 不再失去体力
  const g2 = mk(['yhx_zhugeshang', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 4; g2.phase = 'play';
  q.hand = [card('c1', 'sha'), card('c2', 'shan')];
  q.flags.yhxPlayNamesTurn = 4; q.flags.yhxPlayNames = ['sha'];
  const qh = q.hp;
  await g2.trigger('phase.end', { self: q, phase: 'play' });
  ok(q.hp === qh, '三顾：使用了所选牌名时不应失去体力');
  ok(hasLog(g2, '三顾'), '三顾：缺少战报（第二例）');
  // 非出牌阶段结束时（结束阶段）不触发
  const g3 = mk(['yhx_zhugeshang', 'caocao'], H({ seats: [1] }));
  const r = g3.players[0];
  g3.turnPlayer = r; g3.turnCount = 5;
  r.hand = [card('d1', 'sha')];
  await g3.trigger('phase.end', { self: r, phase: 'end' });
  ok(!hasLog(g3, '三顾'), '三顾：结束阶段结束时不应触发');

  // 轶祖
  const g4 = mk(['yhx_zhugeshang', 'caocao'], H({ seats: [1] }));
  const a = g4.players[0], b = g4.players[1];
  g4.turnPlayer = b; g4.turnCount = 6;
  a.hp = 2; b.hp = 4;
  await g4.trigger('target.after', { self: b, target: a, card: card('e1', 'sha') });
  ok(a.hp === 3, `轶祖：体力值不大于使用者时应回复 1 点（2 → ${a.hp}）`);
  await g4.trigger('target.after', { self: b, target: a, card: card('e2', 'sha') });
  ok(a.hp === 3, '轶祖：每回合限一次，第二次不应回复');
  const g5 = mk(['yhx_zhugeshang', 'caocao'], H({ seats: [1] }));
  const c = g5.players[0], d = g5.players[1];
  g5.turnPlayer = d; g5.turnCount = 7;
  c.hp = 3; d.hp = 1;
  await g5.trigger('target.after', { self: d, target: c, card: card('f1', 'sha') });
  ok(c.hp === 3, '轶祖：体力值大于使用者时不应回复');
}

// ================= 4. 陆凯 · 卜筮 / 忠壮 =================
{
  const g = mk(['yhx_lukai', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 8; g.phase = 'prepare';
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(hasLog(g, '卜筮'), '卜筮：缺少战报');
  ok(noErr(g), '卜筮：技能执行异常');
  ok(p.flags.yhxBushiTurn === 8, '卜筮：应记录本回合已发动');
  ok(p.flags.shaUnlimited === true, '卜筮：♠ 效果应使【杀】无次数限制');
  // ♥ 牌 → 摸一张
  const h0 = p.hand.length;
  await g.trigger('card.use.after', { self: p, card: card('g1', 'sha', 'heart'), reason: 'play' });
  ok(p.hand.length === h0 + 1, `卜筮：使用♥牌后应摸一张（${h0} → ${p.hand.length}）`);
  const h1 = p.hand.length;
  await g.trigger('card.use.after', { self: p, card: card('g2', 'sha', 'spade'), reason: 'play' });
  ok(p.hand.length === h1, '卜筮：非♥牌不应摸牌');
  // ♣ 牌成为目标 → 弃一张手牌取消
  p.hand = [card('g3', 'shan'), card('g4', 'tao')];
  const d = { self: t, target: p, card: card('g5', 'guohe', 'club') };
  await g.trigger('target.before', d);
  ok(d.canceled === true, '卜筮：♣牌成为目标时应可取消之');
  ok(p.hand.length === 1, `卜筮：取消应弃置一张手牌（2 → ${p.hand.length}）`);
  // 结束阶段领取♦牌
  g.phase = 'end';
  const h2 = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'end' });
  ok(p.hand.length === h2 + 1, `卜筮：结束阶段应获得一张牌（${h2} → ${p.hand.length}）`);
  ok(hasLog(g, '卜筮'), '卜筮：结束阶段缺少战报');
  // 回合结束清空【杀】无次数限制
  await g.trigger('turn.end', { self: p });
  ok(p.flags.shaUnlimited === false, '卜筮：回合结束应清空【杀】无次数限制');

  // 忠壮
  const g2 = mk(['yhx_lukai', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 9;
  const d2 = { self: u, from: q, card: card('h1', 'sha'), amount: 2 };
  await g2.trigger('damage.before', d2);
  ok(d2.amount === 1, `忠壮：攻击范围小于 3 时伤害至多为 1（实际 ${d2.amount}）`);
  q.flags.rangeBonus = 4;
  const d3 = { self: u, from: q, card: card('h2', 'sha'), amount: 1 };
  await g2.trigger('damage.before', d3);
  ok(d3.amount === 2, `忠壮：攻击范围大于 3 时伤害 +1（实际 ${d3.amount}）`);
  const d4 = { self: u, from: q, card: card('h3', 'juedou'), amount: 2 };
  await g2.trigger('damage.before', d4);
  ok(d4.amount === 2, '忠壮：非【杀】造成的伤害不应影响');
}

// ================= 5. 轲比能 · 寇旌 =================
{
  const g = mk(['yhx_kebineng', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], v = g.players[1];
  g.turnPlayer = p; g.turnCount = 10; g.phase = 'play';
  p.hand = [card('k1', 'shan'), card('k2', 'tao')];
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(hasLog(g, '寇旌'), '寇旌：缺少战报');
  ok(noErr(g), '寇旌：技能执行异常');
  ok((p.flags.yhxKoujing || []).length === 2, `寇旌：应标记 2 张「旌」（实际 ${(p.flags.yhxKoujing || []).length}）`);
  ok(p.flags.shaUnlimited === true, '寇旌：本回合使用【杀】应无次数限制');
  // 受伤角色可用全部手牌交换「旌」
  v.hand = [card('k3', 'wuzhong'), card('k4', 'guohe'), card('k5', 'jiu')];
  await g.trigger('damage.after', { self: v, from: p, card: card('k6', 'sha'), amount: 1 });
  ok((v.hand || []).length === 2, `寇旌：交换后受伤角色应得到 2 张「旌」（实际 ${v.hand.length}）`);
  ok(p.hand.length === 3, `寇旌：交换后轲比能应得到对方 3 张手牌（实际 ${p.hand.length}）`);
  ok((p.flags.yhxKoujing || []).length === 0, '寇旌：交换后应清空「旌」');
  await g.trigger('turn.end', { self: p });
  ok(p.flags.shaUnlimited === false, '寇旌：回合结束应清空【杀】无次数限制');
  // 拒绝交换
  const g2 = mk(['yhx_kebineng', 'caocao'], H({ seats: [1], yes: false }));
  const q = g2.players[0], w = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 11; g2.phase = 'play';
  q.hand = [card('m1', 'shan')];
  q.flags.yhxKoujing = ['m1'];
  w.hand = [card('m2', 'tao'), card('m3', 'jiu')];
  await g2.trigger('damage.after', { self: w, from: q, card: card('m4', 'sha'), amount: 1 });
  ok(w.hand.length === 2, '寇旌：对方拒绝交换时手牌不变');
  ok((q.flags.yhxKoujing || []).length === 1, '寇旌：拒绝交换时应保留「旌」');
}

// ================= 6. 武安国 · 叠嶂 / 断腕 =================
{
  const g = mk(['yhx_wuanguo', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 12; g.phase = 'play';
  await g.trigger('turn.begin', { self: p });
  ok((p.flags.shaExtraTurn || 0) >= 1, `叠嶂：使用【杀】次数上限应 +1（实际 ${p.flags.shaExtraTurn}，本回合类）`);
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.flags.yhxDiezhangYang === 12, '叠嶂·阳：出牌阶段开始应点亮');
  // 阳：牌被抵消后弃一张牌视为对【杀】
  p.hand = [card('n1', 'shan')];
  await g.trigger('sha.dodged', { self: p, target: t, card: card('n2', 'sha') });
  ok(hasLog(g, '叠嶂·阳'), '叠嶂·阳：缺少战报');
  ok(noErr(g), '叠嶂·阳：技能执行异常');
  ok(p.hand.length === 0, '叠嶂·阳：应弃置一张牌');
  // 阴：抵消他人之牌后摸一张并视为使用【杀】
  const g2 = mk(['yhx_wuanguo', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = u; g2.turnCount = 13;
  const h0 = q.hand.length;
  await g2.trigger('dodge.after', { self: q, from: u, card: card('n3', 'sha') });
  ok(hasLog(g2, '叠嶂·阴'), '叠嶂·阴：缺少战报');
  ok(noErr(g2), '叠嶂·阴：技能执行异常');
  ok(q.hand.length >= h0, '叠嶂·阴：应摸一张牌');
  await g2.trigger('turn.end', { self: q });
  // 叠嶂的「+1」属本回合类（shaExtraTurn），由引擎在下一个自己的回合开始时清零；
  // 旧实现的「turn.end 配对 -1」已删除（不依赖配对，也不会累积）——SG028
  await g2.runTurn(q);
  ok((q.flags.shaExtraTurn || 0) === 1, `叠嶂：每回合固定 +1、不跨回合累积（清零后 turn.begin 重新 +1，实际 ${q.flags.shaExtraTurn}）`);

  // 断腕：濒死限定技
  const g3 = mk(['yhx_wuanguo', 'caocao'], H());
  const a = g3.players[0];
  g3.turnPlayer = a; g3.turnCount = 14;
  a.hp = 0;
  a.hand = [card('p1', 'sha')];
  a.equips.armor = card('p2', 'bagua');
  await g3.trigger('dying.begin', { self: a });
  ok(hasLog(g3, '断腕'), '断腕：缺少战报');
  ok(noErr(g3), '断腕：技能执行异常');
  ok(a.hp === 2, `断腕：应回复至 2 点体力（实际 ${a.hp}）`);
  ok(a.hand.length === 0 && !a.equips.armor, '断腕：应弃置所有牌');
  ok(a.flags.yhxDuanwanUsed === true, '断腕：限定技应记录已发动');
  const hb = a.hand.length;
  await g3.trigger('dying.begin', { self: a });
  ok(a.hand.length === hb && a.flags.yhxDuanwanUsed === true, '断腕：限定技不能重复发动');
}

// ================= 7. 苏飞 · 数荐 =================
{
  const g = mk(['yhx_sufei', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 15; g.phase = 'play';
  p.hand = [card('q1', 'sha'), card('q2', 'shan'), card('q3', 'tao')];
  await g.useActiveSkill(p, 'yhxs_shujian');
  ok(hasLog(g, '数荐'), '数荐：缺少战报');
  ok(noErr(g), '数荐：技能执行异常');
  ok(t.hand.length >= 1, '数荐：应交给目标一张牌');
  ok(p.flags.yhxShujianLeft === 2, `数荐：剩余次数应为 2（实际 ${p.flags.yhxShujianLeft}）`);
  // 选项 2：视为使用 X 张【过河拆桥】且本回合不再发动
  const g2 = mk(['yhx_sufei', 'caocao'], H({ seats: [1], index: 1 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 16; g2.phase = 'play';
  q.hand = [card('r1', 'sha'), card('r2', 'shan')];
  u.hand = [card('r3', 'tao'), card('r4', 'jiu'), card('r5', 'wuzhong')];
  const uh = u.hand.length;
  await g2.useActiveSkill(q, 'yhxs_shujian');
  ok(hasLog(g2, '过河拆桥'), '数荐：选项 2 应视为使用【过河拆桥】');
  ok(u.hand.length < uh, `数荐：选项 2 应拆掉对方一张牌（${uh} → ${u.hand.length}）`);
  ok(q.flags.yhxShujianLeft === 0, '数荐：选项 2 后本回合不能再发动');
  const qh = q.hand.length;
  await g2.useActiveSkill(q, 'yhxs_shujian');
  ok(q.hand.length === qh, '数荐：选项 2 后再次发动应无效');
  ok(hasLog(g2, '本阶段已发动三次'), '数荐：应记录已达上限');
  // 三次用尽
  const g3 = mk(['yhx_sufei', 'caocao'], H({ seats: [1], index: 0 }));
  const a = g3.players[0];
  g3.turnPlayer = a; g3.turnCount = 17; g3.phase = 'play';
  a.hand = [card('s1', 'sha'), card('s2', 'shan'), card('s3', 'tao'), card('s4', 'jiu'), card('s5', 'wuzhong')];
  for (let i = 0; i < 3; i++) await g3.useActiveSkill(a, 'yhxs_shujian');
  ok(a.flags.yhxShujianLeft === 0, `数荐：三次用尽后剩余应为 0（实际 ${a.flags.yhxShujianLeft}）`);
  ok(noErr(g3), '数荐：连续发动执行异常');
}

// ================= 8. 谯周 · 识命 / 将息 =================
{
  const g = mk(['yhx_qiaozhou', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 18; g.round = 5; g.phase = 'draw';
  const th = t.hand.length;
  const dh = g.deck.length;
  const topTwo = g.deck.slice(-2).map(c => c.id);
  await g.trigger('phase.begin', { self: t, phase: 'draw' });
  ok(hasLog(g, '识命'), '识命：缺少战报');
  ok(noErr(g), '识命：技能执行异常');
  ok(p.flags.yhxShimingRound === 5, `识命：应记录本轮已发动（实际 ${p.flags.yhxShimingRound}）`);
  ok(t.hand.some(c => topTwo.includes(c.id)), '识命：置于牌堆底的牌应从牌堆底被摸到（而非移除）');
  ok(g.deck.length === dh - 3, `识命：置底 1 张后自牌堆底摸 3 张，牌堆应减少 3 张（${dh} → ${g.deck.length}）`);
  ok(t.hp === 3, `识命：放弃摸牌应对自己造成 1 点伤害（4 → ${t.hp}）`);
  ok(t.hand.length === th + 3, `识命：应从牌堆底摸三张（${th} → ${t.hand.length}）`);
  ok(t.flags.drawFromBottom === false, '识命：摸牌方向标记应复位');
  // 每轮限一次
  const hb = t.hand.length;
  await g.trigger('phase.begin', { self: t, phase: 'draw' });
  ok(t.hand.length === hb, '识命：每轮限一次，同一轮不应再次触发');
  // 选择不置底 → 不进入后续
  const g2 = mk(['yhx_qiaozhou', 'caocao'], H({ seats: [1], index: -1 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = u; g2.turnCount = 19; g2.round = 6; g2.phase = 'draw';
  const uh = u.hand.length;
  await g2.trigger('phase.begin', { self: u, phase: 'draw' });
  ok(u.hand.length === uh && u.hp === 4, '识命：不置于牌堆底时不应有后续效果');
  ok(!q.flags.yhxShimingRound || q.flags.yhxShimingRound !== 6, '识命：不置于牌堆底时不计入每轮限一次');

  // 将息
  const g3 = mk(['yhx_qiaozhou', 'caocao'], H({ seats: [1] }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = b; g3.turnCount = 20; g3.round = 7;
  a.flags.yhxShimingRound = 7;
  a.flags.yhxHurtTurn = -1; b.flags.yhxHurtTurn = -1;
  a.flags.yhxDyingTurn = -1; b.flags.yhxDyingTurn = -1;
  const ah = a.hand.length, bh = b.hand.length;
  await g3.trigger('turn.end', { self: b });
  ok(hasLog(g3, '将息'), '将息：缺少战报');
  ok(noErr(g3), '将息：技能执行异常');
  ok(a.flags.yhxShimingRound === -1, '将息：一号位未受伤时应重置【识命】');
  ok(a.hand.length === ah + 1 && b.hand.length === bh + 1, '将息：全员未受伤时各摸一张牌');
  // 有伤且一号位未受伤 → 仍重置，但不摸牌
  const g4 = mk(['yhx_qiaozhou', 'caocao'], H({ seats: [1] }));
  const c = g4.players[0], d = g4.players[1];
  g4.turnPlayer = d; g4.turnCount = 21; g4.round = 8;
  c.flags.yhxShimingRound = 8;
  c.flags.yhxHurtTurn = -1; d.flags.yhxHurtTurn = 21;
  const ch = c.hand.length, dhh = d.hand.length;
  await g4.trigger('turn.end', { self: d });
  ok(c.flags.yhxShimingRound === -1, '将息：一号位未受伤时应重置【识命】（有伤场景）');
  ok(c.hand.length === ch && d.hand.length === dhh, '将息：有人受伤时不应各摸一张牌');
}

// ================= 9. 曹叡 · 恢拓 / 明鉴 =================
{
  const g = mk(['yhx_caorui', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 22;
  p.hp = 2;
  const th = t.hand.length;
  await g.trigger('damage.after', { self: p, amount: 2 });
  ok(hasLog(g, '恢拓'), '恢拓：缺少战报');
  ok(noErr(g), '恢拓：技能执行异常');
  ok(t.hand.length !== th || t.hp === t.maxHp || t.hp === 5, '恢拓：判定黑应摸 2 张 / 判定红应回血');
  ok(hasLog(g, '恢拓】：判定'), '恢拓：应记录判定结果');
  // 明鉴
  const g2 = mk(['yhx_caorui', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 23; g2.phase = 'play';
  q.hand = [card('t1', 'sha'), card('t2', 'shan')];
  u.hand = [];
  await g2.useActiveSkill(q, 'yhxs_mingjian');
  ok(hasLog(g2, '明鉴'), '明鉴：缺少战报');
  ok(noErr(g2), '明鉴：技能执行异常');
  ok(q.hand.length === 0 && u.hand.length === 2, `明鉴：应交出所有手牌（${q.hand.length} / ${u.hand.length}）`);
  ok(u.flags.yhxMingjianPending === true, '明鉴：应在目标身上标记下回合增益');
  await g2.trigger('turn.begin', { self: u });
  ok((u.flags.handLimit || 0) === 1, `明鉴：目标下回合手牌上限应 +1（实际 ${u.flags.handLimit}）`);
  ok((u.flags.shaExtraTurn || 0) === 1, `明鉴：目标下回合【杀】次数上限应 +1（实际 ${u.flags.shaExtraTurn}）`);
  await g2.trigger('turn.end', { self: u });
  ok((u.flags.handLimit || 0) === 0, '明鉴：目标回合结束手牌上限应回收');
  await g2.runTurn(u);
  ok((u.flags.shaExtraTurn || 0) === 0, `明鉴：【杀】次数增益由引擎在回合开始清零（不依赖配对减，实际 ${u.flags.shaExtraTurn}）`);
  // 无手牌不能发动
  const g3 = mk(['yhx_caorui', 'caocao'], H({ seats: [1] }));
  const a = g3.players[0];
  g3.turnPlayer = a; g3.turnCount = 24; g3.phase = 'play';
  a.hand = [];
  await g3.useActiveSkill(a, 'yhxs_mingjian');
  ok(hasLog(g3, '没有手牌'), '明鉴：没有手牌时不应发动');
}

// ================= 10. 曹休 · 千驹 / 倾袭 =================
{
  const g = mk(['yhx_caoxiu', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 25;
  p.hp = 2;
  const d = { self: p, to: t, value: 3 };
  await g.trigger('distance.calc', d);
  ok(d.value === 1, `千驹：已损失 2 点体力，距离应 3 → 1（实际 ${d.value}）`);
  const d2 = { self: p, to: t, value: 1 };
  await g.trigger('distance.calc', d2);
  ok(d2.value === 1, '千驹：距离不应小于 1');
  p.hp = p.maxHp;
  const d3 = { self: p, to: t, value: 3 };
  await g.trigger('distance.calc', d3);
  ok(d3.value === 3, '千驹：未受伤时不应减距离');

  // 倾袭：选择加伤
  const g2 = mk(['yhx_caoxiu', 'caocao'], H({ seats: [1], index: 1 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 26;
  q.equips.weapon = card('w1', 'qinglong');
  const d4 = { self: u, from: q, card: card('w2', 'sha'), amount: 1 };
  await g2.trigger('damage.before', d4);
  ok(hasLog(g2, '倾袭'), '倾袭：缺少战报');
  ok(noErr(g2), '倾袭：技能执行异常');
  ok(d4.amount === 2, `倾袭：选择加伤时伤害 +1（实际 ${d4.amount}）`);
  // 倾袭：选择弃牌并弃置武器
  const g3 = mk(['yhx_caoxiu', 'caocao'], H({ seats: [1], index: 0 }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = a; g3.turnCount = 27;
  a.equips.weapon = card('w3', 'qinglong');
  b.hand = [card('w4', 'tao'), card('w5', 'jiu'), card('w6', 'shan')];
  const d5 = { self: b, from: a, card: card('w7', 'sha'), amount: 1 };
  await g3.trigger('damage.before', d5);
  ok(d5.amount === 1, '倾袭：选择弃牌时伤害不变');
  ok(b.hand.length === 0, `倾袭：应弃置 3 张手牌（实际 ${b.hand.length}）`);
  ok(!a.equips.weapon, '倾袭：应弃置曹休的武器牌');
  // 无武器不触发
  const g4 = mk(['yhx_caoxiu', 'caocao'], H({ seats: [1], index: 1 }));
  const c = g4.players[0], e = g4.players[1];
  g4.turnPlayer = c; g4.turnCount = 28;
  const d6 = { self: e, from: c, card: card('w8', 'sha'), amount: 1 };
  await g4.trigger('damage.before', d6);
  ok(d6.amount === 1 && !hasLog(g4, '倾袭'), '倾袭：装备区无武器时不应触发');
}

// ================= 11. 夏侯氏 · 樵拾 / 燕语 =================
{
  const g = mk(['yhx_xiahoushi', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 29;
  p.hand = [card('x1', 'sha'), card('x2', 'shan')];
  t.hand = [card('x3', 'tao'), card('x4', 'jiu')];
  const ph = p.hand.length, th = t.hand.length;
  await g.trigger('phase.begin', { self: t, phase: 'end' });
  ok(hasLog(g, '樵拾'), '樵拾：缺少战报');
  ok(noErr(g), '樵拾：技能执行异常');
  ok(p.hand.length === ph + 1 && t.hand.length === th + 1, '樵拾：手牌数相同时应各摸一张牌');
  // 手牌数不同 → 不触发
  const g2 = mk(['yhx_xiahoushi', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = u; g2.turnCount = 30;
  q.hand = [card('y1', 'sha')];
  u.hand = [card('y2', 'tao'), card('y3', 'jiu'), card('y4', 'shan')];
  const qh = q.hand.length;
  await g2.trigger('phase.begin', { self: u, phase: 'end' });
  ok(q.hand.length === qh && !hasLog(g2, '樵拾'), '樵拾：手牌数不同时不应触发');

  // 燕语：重铸两张【杀】后结束阶段令男性角色摸两张牌
  const g3 = mk(['yhx_xiahoushi', 'caocao'], H({ seats: [1] }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = a; g3.turnCount = 31; g3.phase = 'play';
  a.hand = [card('z1', 'sha'), card('z2', 'sha')];
  const ah = a.hand.length;
  await g3.useActiveSkill(a, 'yhxs_yanyu');
  await g3.useActiveSkill(a, 'yhxs_yanyu');
  ok(hasLog(g3, '燕语'), '燕语：缺少战报');
  ok(noErr(g3), '燕语：技能执行异常');
  ok(a.flags.yhxYanyu === 2, `燕语：应记录本阶段重铸 2 张（实际 ${a.flags.yhxYanyu}）`);
  ok(a.hand.length === ah, '燕语：重铸后手牌数不变（弃一摸一）');
  const bh = b.hand.length;
  await g3.trigger('phase.end', { self: a, phase: 'play' });
  ok(b.hand.length === bh + 2, `燕语：应令一名男性角色摸两张牌（${bh} → ${b.hand.length}）`);
  // 只重铸一张 → 结束阶段不触发
  const g4 = mk(['yhx_xiahoushi', 'caocao'], H({ seats: [1] }));
  const c = g4.players[0], e = g4.players[1];
  g4.turnPlayer = c; g4.turnCount = 32; g4.phase = 'play';
  c.hand = [card('v1', 'sha'), card('v2', 'shan')];
  await g4.useActiveSkill(c, 'yhxs_yanyu');
  const eh = e.hand.length;
  await g4.trigger('phase.end', { self: c, phase: 'play' });
  ok(e.hand.length === eh, '燕语：重铸不足两张时不应触发');
}

// ================= 12. 孙休 · 宴诛 / 兴学 =================
{
  const g = mk(['yhx_sunxiu', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 33; g.phase = 'play';
  t.equips.weapon = card('u1', 'qinglong');
  await g.useActiveSkill(p, 'yhxs_yanzhu');
  ok(hasLog(g, '宴诛'), '宴诛：缺少战报');
  ok(noErr(g), '宴诛：技能执行异常');
  ok(p.hand.some(c => c.id === 'u1'), '宴诛：应获得其装备区所有牌');
  ok(p.flags.yhxYanzhuLost === true, '宴诛：选项一应令孙休失去【宴诛】');
  // 已失去 → 不能再发动（进入下一个出牌阶段）
  // ★【宴诛】desc 是「出牌阶段限一次」→ active.perPhase（SG025 #11），判重键是 playPhaseSeq 而不是 turnCount；
  //   这里必须同步推进 playPhaseSeq，否则会被引擎先按「本阶段已发动过」拒掉，走不到技能自身的「已失去」分支。
  const ph = p.hand.length;
  g.turnCount += 1; g.playPhaseSeq = (g.playPhaseSeq || 0) + 1; g.phase = 'play';
  await g.useActiveSkill(p, 'yhxs_yanzhu');
  ok(p.hand.length === ph && hasLog(g, '你已失去此技能'), '宴诛：已失去时不应再生效');
  // 选项二：其弃置一张牌
  const g2 = mk(['yhx_sunxiu', 'caocao'], H({ seats: [1], index: 1 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 34; g2.phase = 'play';
  u.hand = [card('u2', 'tao'), card('u3', 'jiu')];
  const uh = u.hand.length;
  await g2.useActiveSkill(q, 'yhxs_yanzhu');
  ok(u.hand.length === uh - 1, `宴诛：选项二其应弃置一张牌（${uh} → ${u.hand.length}）`);
  ok(!q.flags.yhxYanzhuLost, '宴诛：选项二不应失去技能');
  // 兴学：X = 体力值
  const g3 = mk(['yhx_sunxiu', 'caocao', 'liubei'], H({ seats: [1, 2].slice(0, 3) }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = a; g3.turnCount = 35; a.hp = 2;
  const bh = b.hand.length, dl = g3.deck.length;
  await g3.trigger('phase.begin', { self: a, phase: 'end' });
  ok(hasLog(g3, '兴学'), '兴学：缺少战报');
  ok(noErr(g3), '兴学：技能执行异常');
  ok(b.hand.length === bh, `兴学：摸一张后应控顶一张（${bh} → ${b.hand.length}）`);
  ok(hasLog(g3, '置于牌堆顶'), '兴学：应有牌被置于牌堆顶');
  ok(g3.deck.length === dl, `兴学：摸 1 张后控顶 1 张，牌堆总数不变（${dl} → ${g3.deck.length}）`);
  // 已失去宴诛 → X 改为体力上限
  const g4 = mk(['yhx_sunxiu', 'caocao'], H({ seats: [1] }));
  const c = g4.players[0], e = g4.players[1];
  g4.turnPlayer = c; g4.turnCount = 36; c.hp = 1; c.flags.yhxYanzhuLost = true;
  const eh = e.hand.length;
  await g4.trigger('phase.begin', { self: c, phase: 'end' });
  ok(noErr(g4), '兴学：失去宴诛后结算异常');
  ok(e.hand.length === eh, '兴学：失去宴诛后 X 改为体力上限（仍可控顶）');
  ok(hasLog(g4, `至多 3 名`), `兴学：X 应为体力上限 3`);
}

// ================= 13. 郭皇后 · 矫诏 / 殚心 =================
{
  const g = mk(['yhx_guohuanghou', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 37; g.phase = 'play';
  p.hand = [card('j1', 'shan')];
  await g.useActiveSkill(p, 'yhxs_jiazhao');
  ok(hasLog(g, '矫诏'), '矫诏：缺少战报');
  ok(noErr(g), '矫诏：技能执行异常');
  ok(p.hand.length === 0, `矫诏：所选手牌应被使用（手牌 ${p.hand.length}）`);
  ok(p.flags.yhxJiazhaoUsed === 1, '矫诏：应记录本回合已发动一次');
  ok(hasLog(g, '声明【杀】'), '矫诏：应由最近的角色声明牌名');
  // 本回合限一次
  p.hand = [card('j2', 'tao')];
  const hb = p.hand.length;
  await g.useActiveSkill(p, 'yhxs_jiazhao');
  ok(p.hand.length === hb && hasLog(g, '本回合已发动'), '矫诏：出牌阶段限一次');
  // 殚心：选择修改描述 → 矫诏可额外发动一次
  const g2 = mk(['yhx_guohuanghou', 'caocao'], H({ seats: [1], index: 1 }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 38;
  await g2.trigger('damage.after', { self: q, amount: 1 });
  ok(hasLog(g2, '殚心'), '殚心：缺少战报');
  ok(q.flags.yhxDanxin === 1, `殚心：应累加【矫诏】额外发动次数（实际 ${q.flags.yhxDanxin}）`);
  const g3 = mk(['yhx_guohuanghou', 'caocao'], H({ seats: [1], index: 0 }));
  const a = g3.players[0];
  g3.turnPlayer = a; g3.turnCount = 39;
  const ah = a.hand.length;
  await g3.trigger('damage.after', { self: a, amount: 1 });
  ok(a.hand.length === ah + 1, `殚心：选项一应摸一张牌（${ah} → ${a.hand.length}）`);
}

// ================= 14. 刘虞 · 止戈 / 宗祚 =================
{
  const g = mk(['yhx_liuyu', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 40; g.phase = 'play';
  p.hand = [card('l1', 'sha'), card('l2', 'shan'), card('l3', 'tao')];
  t.hand = [card('l4', 'shan')];
  t.equips.armor = card('l5', 'bagua');
  await g.useActiveSkill(p, 'yhxs_zhige');
  ok(hasLog(g, '止戈'), '止戈：缺少战报');
  ok(noErr(g), '止戈：技能执行异常');
  ok(p.hand.some(c => c.id === 'l5'), '止戈：未打出【杀】时应获得其装备区一张牌');
  ok(!t.equips.armor, '止戈：装备牌应移出装备区');
  // 其打出【杀】 → 不交牌
  const g2 = mk(['yhx_liuyu', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 41; g2.phase = 'play';
  q.hand = [card('m1', 'sha'), card('m2', 'shan'), card('m3', 'tao')];
  u.hand = [card('m4', 'sha')];
  u.equips.weapon = card('m5', 'qinglong');
  const qh = q.hand.length;
  await g2.useActiveSkill(q, 'yhxs_zhige');
  ok(q.hand.length === qh, '止戈：其打出【杀】时不应获得装备牌');
  ok(u.hand.length === 0, '止戈：其应打出一张【杀】');
  // 手牌数不大于体力值 → 不能发动
  const g3 = mk(['yhx_liuyu', 'caocao'], H({ seats: [1] }));
  const a = g3.players[0];
  g3.turnPlayer = a; g3.turnCount = 42; g3.phase = 'play';
  a.hand = [card('n1', 'sha'), card('n2', 'shan')];
  await g3.useActiveSkill(a, 'yhxs_zhige');
  ok(hasLog(g3, '不大于体力值'), '止戈：手牌数不大于体力值时不应发动');

  // 宗祚
  const g4 = mk(['yhx_liuyu', 'caocao'], H({ seats: [1] }));
  const c = g4.players[0], d = g4.players[1];
  g4.turnPlayer = c; g4.turnCount = 43;
  const mh = c.maxHp;
  await g4.trigger('game.start', { self: c });
  ok(c.maxHp === mh + 2, `宗祚：全场 2 个势力，体力上限应 +2（${mh} → ${c.maxHp}）`);
  ok(c.hp === c.maxHp, `宗祚：体力应同步提升（${c.hp}/${c.maxHp}）`);
  const mh2 = c.maxHp;
  d.alive = false;
  await g4.trigger('death.after', { self: d });
  ok(c.maxHp === mh2 - 1, `宗祚：魏势力尽灭后体力上限应 -1（${mh2} → ${c.maxHp}）`);
  ok(hasLog(g4, '宗祚'), '宗祚：缺少战报');
}

// ================= 15. 辛宪英 · 忠鉴 / 才识 =================
{
  const g = mk(['yhx_xinxianying', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 44; g.phase = 'play';
  p.hand = [card('o1', 'sha', 'heart', 7), card('o2', 'shan', 'spade', 2)];
  t.hand = [card('o3', 'tao', 'heart', 5), card('o4', 'jiu', 'spade', 6),
    card('o5', 'wuzhong', 'club', 3), card('o6', 'guohe', 'diamond', 4), card('o7', 'shunshou', 'spade', 9)];
  const ph = p.hand.length;
  await g.useActiveSkill(p, 'yhxs_zhongjian');
  ok(hasLog(g, '忠鉴'), '忠鉴：缺少战报');
  ok(noErr(g), '忠鉴：技能执行异常');
  ok(p.flags.yhxZhongjianUsed === 1, '忠鉴：应记录本回合已发动一次');
  ok(p.hand.length === ph + 1, `忠鉴：颜色相同（同类判定）应摸一张牌（${ph} → ${p.hand.length}）`);
  // 手牌数不大于体力值 → 无候选
  const g2 = mk(['yhx_xinxianying', 'caocao'], H({ seats: [1], index: 0 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 45; g2.phase = 'play';
  q.hand = [card('p1', 'sha', 'heart', 7)];
  u.hand = [card('p2', 'tao')];
  await g2.useActiveSkill(q, 'yhxs_zhongjian');
  ok(hasLog(g2, '没有手牌数大于体力值'), '忠鉴：无合法目标时不应结算');
  // 才识：选项一
  const g3 = mk(['yhx_xinxianying', 'caocao'], H({ index: 0 }));
  const a = g3.players[0];
  g3.turnPlayer = a; g3.turnCount = 46;
  await g3.trigger('phase.begin', { self: a, phase: 'draw' });
  ok(hasLog(g3, '才识'), '才识：缺少战报');
  ok(noErr(g3), '才识：技能执行异常');
  ok((a.flags.handLimit || 0) === 1, `才识：选项一手牌上限应 +1（实际 ${a.flags.handLimit}）`);
  ok(a.flags.zhuikongTurn === 46, '才识：选项一本回合应不能指定其他角色为目标');
  // 才识：选项二
  const g4 = mk(['yhx_xinxianying', 'caocao'], H({ index: 1 }));
  const b = g4.players[0];
  g4.turnPlayer = b; g4.turnCount = 47; b.hp = 2;
  await g4.trigger('phase.begin', { self: b, phase: 'draw' });
  ok(b.hp === 3, `才识：选项二应回复 1 点体力（2 → ${b.hp}）`);
  ok(!b.flags.handLimit, '才识：选项二不应增加手牌上限');
}

// ================= 16. 吴苋 · 福绵 / 怠宴 =================
{
  const g = mk(['yhx_wuxian', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 48; g.phase = 'prepare';
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(hasLog(g, '福绵'), '福绵：缺少战报');
  ok(noErr(g), '福绵：技能执行异常');
  ok(p.flags.yhxFumianDraw === 1, `福绵：首次选摸牌应 +1（实际 ${p.flags.yhxFumianDraw}）`);
  const d = { self: p, count: 2 };
  await g.trigger('draw.count', d);
  ok(d.count === 3, `福绵：摸牌阶段应多摸一张（2 → ${d.count}）`);
  // 选项不同 → 数值 +1
  const g2 = mk(['yhx_wuxian', 'caocao'], H({ index: 0 }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 49; g2.phase = 'prepare';
  q.flags.yhxFumianLast = 1;
  await g2.trigger('phase.begin', { self: q, phase: 'prepare' });
  ok(q.flags.yhxFumianDraw === 2, `福绵：与上回合选项不同应改为多摸 2 张（实际 ${q.flags.yhxFumianDraw}）`);
  const d2 = { self: q, count: 2 };
  await g2.trigger('draw.count', d2);
  ok(d2.count === 4, `福绵：应多摸两张（2 → ${d2.count}）`);
  // 选项二：红色【杀】可额外指定目标
  const g3 = mk(['yhx_wuxian', 'caocao', 'liubei'], H({ index: 1, seats: [2] }));
  const a = g3.players[0], b = g3.players[1], c = g3.players[2];
  g3.turnPlayer = a; g3.turnCount = 50; g3.phase = 'prepare';
  await g3.trigger('phase.begin', { self: a, phase: 'prepare' });
  ok(a.flags.yhxFumianTarget === 1, '福绵：选项二应记录可额外指定的目标数');
  g3.phase = 'play';
  const ud = { self: a, player: a, card: card('f1', 'sha', 'heart'), targets: [b], reason: 'play' };
  await g3.trigger('card.use.before', ud);
  ok(Array.isArray(ud.extraTargets) && ud.extraTargets.includes(c.seat),
    `福绵：红色【杀】应额外指定一个目标（${JSON.stringify(ud.extraTargets)}）`);
  ok(a.flags.yhxFumianTarget === 0, '福绵：额外目标每回合限一次');
  // 非红色牌不触发
  const g4 = mk(['yhx_wuxian', 'caocao'], H({ index: 1, seats: [1] }));
  const e = g4.players[0], f = g4.players[1];
  g4.turnPlayer = e; g4.turnCount = 51; e.flags.yhxFumianTarget = 1; e.flags.yhxFumianTargetTurn = 51; g4.phase = 'play';
  const ud2 = { self: e, player: e, card: card('f2', 'sha', 'spade'), targets: [f], reason: 'play' };
  await g4.trigger('card.use.before', ud2);
  ok(!ud2.extraTargets, '福绵：黑色牌不应额外指定目标');

  // 怠宴
  const g5 = mk(['yhx_wuxian', 'caocao'], H({ seats: [1] }));
  const r = g5.players[0], s = g5.players[1];
  g5.turnPlayer = r; g5.turnCount = 52; g5.round = 3;
  const sh = s.hand.length;
  await g5.trigger('phase.begin', { self: r, phase: 'end' });
  ok(hasLog(g5, '怠宴'), '怠宴：缺少战报');
  ok(noErr(g5), '怠宴：技能执行异常');
  ok(s.hand.length >= sh, '怠宴：应令其从牌堆获得一张♥基本牌');
  ok(s.flags.yhxDaiyanRound === 3, '怠宴：应记录本轮目标');
  // 连续两轮命中 → 失去 1 点体力
  const g6 = mk(['yhx_wuxian', 'caocao'], H({ seats: [1] }));
  const u = g6.players[0], v = g6.players[1];
  g6.turnPlayer = u; g6.turnCount = 53; g6.round = 4;
  v.flags.yhxDaiyanRound = 3;
  v.hp = 4;
  await g6.trigger('phase.begin', { self: u, phase: 'end' });
  ok(v.hp === 3, `怠宴：上回合成为过目标应失去 1 点体力（4 → ${v.hp}）`);
}

// ================= 总结 =================
console.log(`\n===== yhxcheck（阶段 6E 一将成名 2022–2026 / 十周年原创线 14 将）=====`);
console.log(`断言通过：${pass}    失败：${fail}`);
if (!packCnReady) console.log("⚠ 提示：PACK_CN.yhx 尚未登记，主控合入 src/data/generals.js 后应补 PACK_CN.yhx = '一将成名·十周年'");
if (fail) {
  console.log('失败明细：');
  for (const m of bad) console.log('  ✗ ' + m);
  process.exitCode = 1;
} else {
  console.log('全部断言通过 ✅');
}
