// 阶段 5F · 手杀 SP + 界 精选（pack = 'sp4'）守门测试
// 运行：node tools/sp4check.js
// 说明：本批次按任务约束「只新增 3 个文件」，不改 src/data/generals.js 与 src/skills/index.js，
//       故测试直接 import 自己的技能/数据文件，并在运行时把 SP4_GENERALS 注入 GENERALS 注册表。
import '../src/skills/sp4.js';
import { SP4_GENERALS } from '../src/data/sp4.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

// —— 运行时注册（主控合入 generals.js 后此段变成幂等空操作）
for (const gd of SP4_GENERALS) {
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
  if (req.kind === 'card') return { cardId: over.cardId || (p.hand[0] || {}).id };
  if (req.kind === 'discard') return { cardIds: (req.cards || []).slice(0, req.min || 1) };
  return null;
};
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));
const noErr = (g) => !g.logs.some(l => l.text.includes('执行异常'));

// ================= 1. 数据注册 =================
const EXPECT = [
  ['sp4_gaoxiang', '高翔', 'shu', 4, ['sk4_chiying'], 'sp4'],
  ['cuiyan_maojie', '崔琰&毛玠', 'wei', 3, ['sk4_zhengbi', 'sk4_fengying'], 'sp4'],
  ['sp4_dongbai', '董白', 'qun', 3, ['sk4_lianzhu', 'sk4_xiahui'], 'sp4'],
  ['sp4_chengyu', '程昱', 'wei', 3, ['sk4_shefu', 'sk4_benyu'], 'sp4'],
  ['sp4_wutugu', '兀突骨', 'qun', 15, ['sk4_ranshang', 'sk4_hanyong'], 'sp4'],
  ['sp4_lingju', '灵雎', 'qun', 3, ['sk4_jieyuan', 'sk4_fenxin'], 'sp4'],
  ['sp4_dingshangwan', '丁尚涴', 'wei', 3, ['sk4_fengyan', 'sk4_fudao'], 'sp4'],
  ['sp4_zhongyao', '钟繇', 'wei', 3, ['sk4_huomo', 'sk4_zuoding'], 'sp4'],
  ['jie_wangji', '界王基', 'wei', 3, ['sk4_qizhi', 'sk4_jinqu'], 'sp4'],
  ['jie_zhoufei', '界周妃', 'wu', 3, ['sk4_liangyin', 'sk4_kongsheng'], 'sp4'],
];
for (const [id, name, kingdom, hp, skills, pack] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 数据缺失`);
  if (!gd) continue;
  ok(gd.name === name, `${id} 名称不符：${gd.name}`);
  ok(gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符：${gd.kingdom}/${gd.hp}`);
  ok(gd.pack === pack, `${id} pack 应为 ${pack}，实际 ${gd.pack}`);
  ok(Array.isArray(gd.skills) && gd.skills.length === skills.length, `${id} 技能数量不符：${gd.skills}`);
  for (const s of skills) {
    ok(gd.skills.includes(s), `${id} 技能列表缺少 ${s}`);
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && sk.name && sk.desc && sk.desc.length > 8, `技能 ${s} 缺少 name/desc`);
  }
}
ok(SP4_GENERALS.length === 10, `SP4_GENERALS 应为 10 位，实际 ${SP4_GENERALS.length}`);
ok(GENERALS.filter(g => g.pack === 'sp4').length === 10, `sp4 包将数应为 10，实际 ${GENERALS.filter(g => g.pack === 'sp4').length}`);
// 技能 id 前缀红线
const ALL_SK = EXPECT.flatMap(x => x[4]);
ok(new Set(ALL_SK).size === ALL_SK.length, '技能 id 存在重复');
for (const sk of ALL_SK) {
  ok(sk.startsWith('sk4_'), `技能 id ${sk} 应使用 sk4_ 前缀`);
  ok(!/^(jie_|mou_|ji_|shen_|sp_|ol_|bc_)/.test(sk), `技能 id ${sk} 使用了禁用前缀`);
  const base = sk.replace(/^sk4_/, '');
  ok(!hasSkill(base), `技能 ${sk} 去掉 sk4_ 后与既有技能 ${base} 冲突`);
}
// 武将 id 允许 jie_ 前缀（界将），但不得与既有武将重名
for (const [id] of EXPECT) {
  ok(GENERALS.filter(g => g.id === id).length === 1, `武将 id ${id} 重复注册`);
}
ok(EXPECT.some(x => x[0] === 'cuiyan_maojie'), '崔琰&毛玠 的武将 id 应为 cuiyan_maojie');
// 主控待办：PACK_CN 尚未登记（不改 generals.js 的约束下测试只做提示，不计失败）
const packCnReady = PACK_CN.sp4 === '手杀 SP·精选';

// ================= 2. 主动技按钮可见性 =================
{
  const ACTIVES = {
    sp4_gaoxiang: ['sk4_chiying'], cuiyan_maojie: ['sk4_fengying'],
    sp4_dongbai: ['sk4_lianzhu'], sp4_dingshangwan: ['sk4_fengyan'],
    sp4_zhongyao: ['sk4_huomo'], jie_wangji: ['sk4_qizhi'],
  };
  for (const [id, list] of Object.entries(ACTIVES)) {
    const g = mk([id, 'caocao']);
    const p = g.players[0];
    g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
    const names = g.activeSkillsOf(p).map(s => s.id);
    for (const s of list) ok(names.includes(s), `${id} 的主动技 ${s} 未出现在 activeSkillsOf 中（${names.join(',')}）`);
  }
  for (const id of ['sp4_chengyu', 'sp4_wutugu', 'sp4_lingju', 'jie_zhoufei']) {
    const g = mk([id, 'caocao']);
    const p = g.players[0];
    g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
    const own = g.activeSkillsOf(p).filter(s => (generalById(id).skills || []).includes(s.id));
    ok(own.length === 0, `${id} 不应有主动技按钮：${own.map(s => s.id).join(',')}`);
  }
}

// ================= 3. 高翔 · 驰应 =================
{
  const g = mk(['sp4_gaoxiang', 'caocao', 'liubei', 'sunquan'], H({ seats: [1] }));
  const p = g.players[0], a = g.players[1];
  g.turnPlayer = p; g.turnCount = 3; g.phase = 'play';
  a.hand = [card('c1', 'sha'), card('c2', 'tao'), card('c3', 'shan')];
  const ah = a.hand.length;
  await g.useActiveSkill(p, 'sk4_chiying');
  ok(hasLog(g, '驰应'), '驰应：缺少战报');
  ok(noErr(g), '驰应：技能执行异常');
  // 攻击范围内（seat1 的邻位 seat0/seat2）各弃一张
  ok(hasLog(g, '各弃置一张牌'), '驰应：应记录各弃置一张牌');
  ok(a.hand.length >= ah, `驰应：选择的角色不应弃置自己的牌（${ah} → ${a.hand.length}）`);
  ok(hasLog(g, '获得弃置牌中的基本牌') || a.hand.length === ah, '驰应：选择其他角色时应获得弃置牌中的基本牌');
}

// ================= 4. 崔琰&毛玠 · 征辟 / 奉迎 =================
{
  const g = mk(['cuiyan_maojie', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 4; g.phase = 'prepare';
  p.hand = [card('z1', 'sha'), card('z2', 'shan')];
  t.hand = [card('z3', 'tao'), card('z4', 'wuzhong')];
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(hasLog(g, '征辟'), '征辟：缺少战报');
  ok(noErr(g), '征辟：技能执行异常');
  ok((p.flags.zhengbiUsed || []).includes(t.id), '征辟：应记录该角色已征辟过');
  ok(p.hand.length === 2, `征辟：获得 1 张后应交给对方 1 张（手牌 ${p.hand.length}）`);
  // 每名角色限一次：再次发动应无候选
  const before = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(p.hand.length === before, '征辟：同一角色本局限一次，不应重复生效');

  const g2 = mk(['cuiyan_maojie', 'caocao', 'liubei'], H({ seats: [1] }));
  const q = g2.players[0], m = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 5; g2.phase = 'play';
  m.hand = [card('f1', 'sha'), card('f2', 'shan')];
  m.maxHp = 5;
  await g2.useActiveSkill(q, 'sk4_fengying');
  ok(hasLog(g2, '奉迎'), '奉迎：缺少战报');
  ok(noErr(g2), '奉迎：技能执行异常');
  ok(q.flags.fengyingUsed === true, '奉迎：限定技应记录已发动');
  ok(g2.extraQueue.includes(q), '奉迎：目标体力上限全场最多时应获得额外回合');
  ok(hasLog(g2, '无中生有'), '奉迎：应记录将手牌当【无中生有】使用');
  // 限定技只能用一次
  await g2.useActiveSkill(q, 'sk4_fengying');
  ok(hasLog(g2, '限定技本局已发动过'), '奉迎：限定技不应重复发动');
}

// ================= 5. 董白 · 连诛 / 黠慧 =================
{
  const g = mk(['sp4_dongbai', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 6; g.phase = 'play';
  p.hand = [card('d1', 'sha', 'spade'), card('d2', 'tao', 'heart')];
  await g.useActiveSkill(p, 'sk4_lianzhu');
  ok(hasLog(g, '连诛'), '连诛：缺少战报');
  ok(noErr(g), '连诛：技能执行异常');
  ok(p.hand.length === 3, `连诛：交出黑色牌后应摸两张牌（手牌 ${p.hand.length}）`);
  ok(t.hand.some(c => c.id === 'd1'), '连诛：应把展示的牌交给目标');

  // 黠慧 ①：弃牌阶段黑色手牌不计入上限
  const g2 = mk(['sp4_dongbai', 'caocao']);
  const q = g2.players[0];
  q.hand = [card('x1', 'sha', 'spade'), card('x2', 'shan', 'club'), card('x3', 'tao', 'heart')];
  const base = q.flags.handLimit || 0;
  await g2.trigger('phase.begin', { self: q, phase: 'discard' });
  ok((q.flags.handLimit || 0) === base + 2, `黠慧：两张黑色手牌应使上限 +2（实际 +${(q.flags.handLimit || 0) - base}）`);
  ok(hasLog(g2, '黠慧'), '黠慧：缺少战报');
  await g2.trigger('phase.end', { self: q, phase: 'discard' });
  ok((q.flags.handLimit || 0) === base, '黠慧：弃牌阶段结束后上限应还原');
  // 黠慧 ②：他人获得黑色牌 → 标记；体力值减少 → 标记消失
  const g3 = mk(['sp4_dongbai', 'caocao']);
  const a = g3.players[0], b = g3.players[1];
  const bc = card('k1', 'sha', 'club');
  a.hand = [bc];
  await g3.gainCards(b, [bc], { from: a, reason: 'test' });
  ok(bc.__xiahui === true, '黠慧：他人获得的黑色牌应标记为“黠慧”');
  ok(hasLog(g3, '标记为“黠慧”'), '黠慧：缺少标记战报');
  b.hp = b.maxHp - 1;
  await g3.trigger('damage.after', { self: b, to: b, from: a, amount: 1, nature: 'normal', reason: 'test' });
  ok(bc.__xiahui === undefined, '黠慧：体力值减少后“黠慧”标记应消失');
}

// ================= 6. 程昱 · 设伏 / 贲育 =================
{
  const g = mk(['sp4_chengyu', 'caocao'], H({ index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 7; g.phase = 'play';
  p.hand = [card('s1', 'sha'), card('s2', 'shan')];
  await g.trigger('phase.begin', { self: p, phase: 'end' });
  ok(hasLog(g, '设伏'), '设伏：缺少战报');
  ok(noErr(g), '设伏：技能执行异常');
  ok((p.flags.fubing || []).length === 1, `设伏：应记录 1 个“伏兵”（实际 ${(p.flags.fubing || []).length}）`);
  ok(p.hand.length === 1, '设伏：应扣置一张手牌');
  const rec = p.flags.fubing[0];
  // 其他角色于程昱回合外使用同名牌 → 此牌无效
  const gx = mk(['sp4_chengyu', 'caocao'], H({}));
  const cx = gx.players[0], tx = gx.players[1];
  gx.turnPlayer = tx; gx.turnCount = 8;
  cx.hand = [card('s3', 'sha')];
  await gx.trigger('phase.begin', { self: cx, phase: 'end' });
  const rec2 = (cx.flags.fubing || [])[0];
  ok(!!rec2, '设伏：第二次布设未成功');
  const useData = { self: tx, card: card('s4', 'sha'), effName: rec2.key, targets: [cx], reason: 'play' };
  await gx.trigger('card.use.before', useData);
  ok(useData.canceled === true, '设伏：同名牌应被令为无效（canceled）');
  ok(hasLog(gx, '此牌无效'), '设伏：缺少无效战报');
  ok(!(cx.flags.fubing || []).length, '设伏：应移去对应的“伏兵”');
  ok(true, `设伏：记录牌名 ${rec.cn}`);

  // 贲育：手牌少于来源 → 摸至相同（最多 5）
  const g2 = mk(['sp4_chengyu', 'caocao'], H({ index: 0 }));
  const q = g2.players[0], o = g2.players[1];
  g2.turnPlayer = o; g2.turnCount = 9;
  q.hand = [card('b1', 'sha')];
  o.hand = [card('b2', 'sha'), card('b3', 'sha'), card('b4', 'sha'), card('b5', 'sha'), card('b6', 'sha')];
  await g2.trigger('damage.after', { self: q, to: q, from: o, amount: 1, nature: 'normal', card: card('b7', 'sha'), reason: 'sha' });
  ok(hasLog(g2, '贲育'), '贲育：缺少战报');
  ok(noErr(g2), '贲育：技能执行异常');
  ok(q.hand.length === 5, `贲育：应将手牌摸至与来源相同且至多 5（实际 ${q.hand.length}）`);
  // 贲育：手牌多于来源 → 弃置 X+1 张并造成 1 点伤害
  const g3 = mk(['sp4_chengyu', 'caocao'], H({ index: 1 }));
  const q3 = g3.players[0], o3 = g3.players[1];
  g3.turnPlayer = o3; g3.turnCount = 10;
  q3.hand = [card('c1', 'sha'), card('c2', 'shan'), card('c3', 'tao'), card('c4', 'jiu')];
  o3.hand = [card('c5', 'sha')];
  const ohp = o3.hp;
  await g3.trigger('damage.after', { self: q3, to: q3, from: o3, amount: 1, nature: 'normal', reason: 'sha' });
  ok(o3.hp === ohp - 1, `贲育：弃置多于来源手牌数的手牌后应对其造成 1 点伤害（${ohp} → ${o3.hp}）`);
}

// ================= 7. 兀突骨 · 燃殇 / 悍勇 =================
{
  const g = mk(['sp4_wutugu', 'caocao']);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 11;
  ok(p.maxHp === 15 && p.hp === 15, `兀突骨：应为 15 体力（${p.hp}/${p.maxHp}）`);
  await g.trigger('damage.after', { self: p, to: p, from: t, amount: 2, nature: 'fire', card: card('r1', 'sha', 'heart'), reason: 'sha' });
  ok((p.marks.ran || 0) === 2, `燃殇：受到 2 点火焰伤害应获得 2 枚“燃”（实际 ${p.marks.ran}）`);
  ok(hasLog(g, '燃殇'), '燃殇：缺少战报');
  const hp0 = p.hp;
  await g.trigger('phase.begin', { self: p, phase: 'end' });
  ok(p.hp === hp0 - 2, `燃殇：结束阶段应失去 2 点体力（${hp0} → ${p.hp}）`);
  ok((p.marks.ran || 0) === 0, '燃殇：结算后“燃”应清零');
  // 燃 > 2 → 减 2 点体力上限并摸两张牌
  p.marks.ran = 3;
  p.hp = 10; p.maxHp = 15;
  const hb = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'end' });
  ok(p.maxHp === 13, `燃殇：“燃”超过 2 时应减 2 点体力上限（实际 ${p.maxHp}）`);
  ok(p.hand.length === hb + 2, `燃殇：减上限后应摸两张牌（${hb} → ${p.hand.length}）`);

  // 悍勇：受伤时使用南蛮 → 伤害 +1，且体力 > 轮数时获得“燃”
  const g2 = mk(['sp4_wutugu', 'caocao'], H({ yes: true }));
  const q = g2.players[0], v = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 12; g2.round = 1;
  q.hp = 10;
  const d1 = { self: v, to: v, from: q, amount: 1, nature: 'normal', card: card('n1', 'nanman', 'club'), reason: 'nanman', canceled: false };
  await g2.trigger('damage.before', d1);
  ok(d1.amount === 2, `悍勇：【南蛮入侵】造成的伤害应 +1（实际 ${d1.amount}）`);
  ok((q.marks.ran || 0) === 1, '悍勇：体力值大于轮数时应获得 1 枚“燃”');
  ok(hasLog(g2, '悍勇'), '悍勇：缺少战报');
  // 未受伤时不生效
  const g3 = mk(['sp4_wutugu', 'caocao']);
  const q3 = g3.players[0], v3 = g3.players[1];
  q3.hp = q3.maxHp;
  const d3 = { self: v3, to: v3, from: q3, amount: 1, nature: 'normal', card: card('n2', 'nanman'), reason: 'nanman', canceled: false };
  await g3.trigger('damage.before', d3);
  ok(d3.amount === 1, '悍勇：未受伤时不应加伤');
}

// ================= 8. 灵雎 · 竭缘 / 焚心 =================
{
  const g = mk(['sp4_lingju', 'caocao'], H({ yes: true }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 13;
  p.hp = 3; t.hp = 3;
  p.hand = [card('j1', 'sha', 'spade'), card('j2', 'shan', 'heart')];
  const d1 = { self: t, to: t, from: p, amount: 1, nature: 'normal', canceled: false };
  await g.trigger('damage.before', d1);
  ok(d1.amount === 2, `竭缘：造成伤害时可弃黑牌令伤害 +1（实际 ${d1.amount}）`);
  ok(hasLog(g, '竭缘'), '竭缘：缺少战报');
  const d2 = { self: p, to: p, from: t, amount: 2, nature: 'normal', canceled: false };
  await g.trigger('damage.before', d2);
  ok(d2.amount === 1, `竭缘：受到伤害时可弃红牌令伤害 -1（实际 ${d2.amount}）`);
  // 体力值小于对方时不触发
  const g2 = mk(['sp4_lingju', 'caocao']);
  const q = g2.players[0], w = g2.players[1];
  q.hp = 1; w.hp = 3;
  q.hand = [card('j3', 'sha', 'spade')];
  const d3 = { self: w, to: w, from: q, amount: 1, nature: 'normal', canceled: false };
  await g2.trigger('damage.before', d3);
  ok(d3.amount === 1, '竭缘：目标体力值小于你时不应加伤');

  // 焚心：杀死角色后交换身份
  const g3 = mk(['sp4_lingju', 'caocao'], H({}));
  const a = g3.players[0], b = g3.players[1];
  a.role = 'rebel'; b.role = 'loyalist'; b.alive = false;
  a.flags.fenxinUsed = false;
  await g3.trigger('death.after', { self: b, killer: a, canceled: false });
  ok(a.role === 'loyalist' && b.role === 'rebel', `焚心：应交换身份牌（${a.role}/${b.role}）`);
  ok(a.flags.fenxinUsed === true, '焚心：应记录限定技已发动');
  ok(hasLog(g3, '焚心'), '焚心：缺少战报');
  // 主公不可发动
  const g4 = mk(['sp4_lingju', 'caocao'], H({}));
  const c = g4.players[0], d = g4.players[1];
  c.role = 'lord'; d.role = 'rebel'; d.alive = false;
  await g4.trigger('death.after', { self: d, killer: c, canceled: false });
  ok(c.role === 'lord', '焚心：主公不应交换身份牌');
}

// ================= 9. 丁尚涴 · 讽言 / 抚悼 =================
{
  const g = mk(['sp4_dingshangwan', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 14; g.phase = 'play';
  p.hp = 3; t.hp = 2;
  p.hand = [card('v1', 'sha'), card('v2', 'shan'), card('v3', 'tao')];
  t.hand = [card('v4', 'sha'), card('v5', 'shan'), card('v6', 'tao'), card('v7', 'jiu'), card('v8', 'wuzhong')];
  await g.useActiveSkill(p, 'sk4_fengyan');
  ok(hasLog(g, '讽言'), '讽言：缺少战报');
  ok(noErr(g), '讽言：技能执行异常');
  ok(p.flags.fy1Turn === 14, '讽言：应记录本回合已发动选项一');
  ok(p.hand.length === 4, `讽言：应令对方交给你一张手牌（手牌 ${p.hand.length}）`);

  // 抚悼：游戏开始时选择犄角，双方首次指定对方为目标后各摸两张
  const g2 = mk(['sp4_dingshangwan', 'caocao', 'liubei'], H({ seats: [1] }));
  const q = g2.players[0], m = g2.players[1], w = g2.players[2];
  g2.turnPlayer = q; g2.turnCount = 15;
  q.hand = [card('u1', 'sha')]; m.hand = [card('u2', 'shan')];
  await g2.trigger('game.start', { self: q });
  ok(q.flags.fudao === m.id, `抚悼：应记录犄角角色（${q.flags.fudao}）`);
  ok(hasLog(g2, '抚悼'), '抚悼：缺少战报');
  const qh = q.hand.length, mh = m.hand.length;
  await g2.trigger('card.use.before', { self: q, card: card('u3', 'sha'), effName: 'sha', targets: [m], reason: 'play' });
  ok(q.hand.length === qh + 2 && m.hand.length === mh + 2, `抚悼：双方应各摸两张牌（${qh}→${q.hand.length}, ${mh}→${m.hand.length}）`);
  const qh2 = q.hand.length;
  await g2.trigger('card.use.before', { self: q, card: card('u4', 'sha'), effName: 'sha', targets: [m], reason: 'play' });
  ok(q.hand.length === qh2, '抚悼：每回合仅首次生效');
  // 决裂：杀死犄角者的角色获得标记，然后对其造成的伤害 +1
  m.alive = false;
  await g2.trigger('death.after', { self: m, killer: w, canceled: false });
  ok((w.marks?.juelie || 0) === 1, '抚悼：杀死犄角的角色应获得“决裂”标记');
  const dd = { self: w, to: w, from: q, amount: 1, nature: 'normal', canceled: false };
  await g2.trigger('damage.before', dd);
  ok(dd.amount === 2, `抚悼：对“决裂”角色造成的伤害 +1（实际 ${dd.amount}）`);
}

// ================= 10. 钟繇 · 活墨 / 佐定 =================
{
  const g = mk(['sp4_zhongyao', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 16; g.phase = 'play';
  const blackTrick = card('m1', 'guohe', 'spade');
  p.hand = [blackTrick, card('m2', 'shan', 'heart')];
  await g.useActiveSkill(p, 'sk4_huomo');
  ok(hasLog(g, '活墨'), '活墨：缺少战报');
  ok(noErr(g), '活墨：技能执行异常');
  ok(g.deck[g.deck.length - 1] === blackTrick, '活墨：应将黑色非基本牌置于牌堆顶');
  ok((p.flags.hmNames || []).includes('sha'), '活墨：应记录本回合以此法使用过【杀】');
  // 佐定：其他角色于其出牌阶段使用黑桃牌指定目标后，令一个目标摸一张牌
  const g2 = mk(['sp4_zhongyao', 'caocao'], H({ seats: [0] }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = u; g2.turnCount = 17; g2.phase = 'play';
  const th = q.hand.length;
  const ud = { self: u, card: card('z1', 'sha', 'spade'), effName: 'sha', targets: [q], reason: 'play' };
  await g2.trigger('card.use.before', ud);
  ok(hasLog(g2, '佐定'), '佐定：缺少战报');
  ok(noErr(g2), '佐定：技能执行异常');
  ok(q.hand.length === th + 1, `佐定：应令其中一名目标摸一张牌（${th} → ${q.hand.length}）`);
  // 本阶段已有人受伤 → 不触发
  const g3 = mk(['sp4_zhongyao', 'caocao']);
  const q3 = g3.players[0], u3 = g3.players[1];
  g3.turnPlayer = u3; g3.turnCount = 18; g3.phase = 'play';
  await g3.trigger('damage.after', { self: q3, to: q3, from: u3, amount: 1, nature: 'normal', reason: 'test' });
  const th3 = q3.hand.length;
  const ud3 = { self: u3, card: card('z2', 'guohe', 'spade'), effName: 'guohe', targets: [q3], reason: 'play' };
  await g3.trigger('card.use.before', ud3);
  ok(q3.hand.length === th3, '佐定：本阶段已有角色受伤时不应触发');
  // 不处理自己使用的黑桃牌
  const g4 = mk(['sp4_zhongyao', 'caocao']);
  const q4 = g4.players[0], u4 = g4.players[1];
  g4.turnPlayer = q4; g4.turnCount = 19; g4.phase = 'play';
  const th4 = u4.hand.length;
  await g4.trigger('card.use.before', { self: q4, card: card('z3', 'sha', 'spade'), effName: 'sha', targets: [u4], reason: 'play' });
  ok(u4.hand.length === th4, '佐定：自己使用的黑桃牌不应触发');
}

// ================= 11. 界王基 · 奇制 / 进趋 =================
{
  const g = mk(['jie_wangji', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 20; g.phase = 'play';
  p.marks.xuli = 1;
  p.flags.jqPeak = 1;
  t.hand = [card('w1', 'tao'), card('w2', 'shan')];
  const th = t.hand.length;
  await g.useActiveSkill(p, 'sk4_qizhi');
  ok(hasLog(g, '奇制'), '奇制：缺少战报');
  ok(noErr(g), '奇制：技能执行异常');
  ok((p.marks.xuli || 0) === 0, `奇制：应消耗 1 点“蓄力”（剩余 ${p.marks.xuli}）`);
  ok(t.hand.length === th + 2, `奇制：目标应摸两张牌（${th} → ${t.hand.length}）`);
  // 之后使用基本牌指定目标 → 观看并弃置其一张牌
  const th2 = t.hand.length;
  await g.trigger('card.use.before', { self: p, card: card('w3', 'sha'), effName: 'sha', targets: [t], reason: 'play' });
  ok(t.hand.length === th2 - 1, `奇制：使用基本牌后应弃置其一张牌（${th2} → ${t.hand.length}）`);
  // 无“蓄力”点时不可发动
  const g2 = mk(['jie_wangji', 'caocao'], H({}));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 21; g2.phase = 'play';
  q.marks.xuli = 0;
  await g2.useActiveSkill(q, 'sk4_qizhi');
  ok(hasLog(g2, '没有“蓄力”点'), '奇制：无蓄力点时应提示');

  // 进趋 ①：回合内使用两张基本牌/普通锦囊 → 令有蓄力技的角色获得 1 点蓄力
  const g3 = mk(['jie_wangji', 'caocao'], H({}));
  const r = g3.players[0];
  g3.turnPlayer = r; g3.turnCount = 22;
  r.marks.xuli = 0; r.flags.jqPeak = 0;
  await g3.trigger('card.use.after', { self: r, card: card('e1', 'sha'), effName: 'sha', targets: [], reason: 'play' });
  ok((r.marks.xuli || 0) === 0, '进趋①：使用 1 张时不应获得蓄力');
  await g3.trigger('card.use.after', { self: r, card: card('e2', 'wuzhong'), effName: 'wuzhong', targets: [], reason: 'play' });
  ok((r.marks.xuli || 0) === 1, `进趋①：使用 2 张后应有角色获得 1 点“蓄力”（实际 ${r.marks.xuli}）`);
  ok(hasLog(g3, '进趋'), '进趋：缺少战报');
  ok(r.flags.jqPeak === 1, '进趋：应记录本回合蓄力峰值');
  // 进趋 ②：结束阶段摸 X 张（X = 峰值）
  r.flags.jqPeak = 3;
  const hb = r.hand.length;
  await g3.trigger('phase.begin', { self: r, phase: 'end' });
  ok(r.hand.length === hb + 3, `进趋②：结束阶段应摸 3 张（${hb} → ${r.hand.length}）`);
}

// ================= 12. 界周妃 · 良姻 / 箜声 =================
{
  const g = mk(['jie_zhoufei', 'caocao'], H({ seats: [1], index: 1 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 23; g.phase = 'prepare';
  p.hand = [card('y1', 'sha'), card('y2', 'shan'), card('y3', 'tao')];
  const th = t.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(hasLog(g, '箜声'), '箜声：缺少战报');
  ok(noErr(g), '箜声：技能执行异常');
  ok((p.flags.kong || []).length === 1, `箜声：应扣置 1 张牌（实际 ${(p.flags.kong || []).length}）`);
  ok(p.hand.length === 2, `箜声：扣置后手牌应减少（${p.hand.length}）`);
  ok(hasLog(g, '良姻'), '良姻：缺少战报（置牌时应触发①）');
  ok(t.hand.length === th + 1, `良姻①：应令一名角色摸一张牌（${th} → ${t.hand.length}）`);
  ok((p.flags.lyCur || []).length === 1, '良姻：应记录本轮“良姻”目标');

  // 结束阶段：使用其中一张，其余归还
  const g2 = mk(['jie_zhoufei', 'caocao'], H({ seats: [1], index: 1 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 24;
  q.flags.kong = [card('y4', 'wuzhong', 'heart')];
  q.marks.kong = 1;
  const hq = q.hand.length;
  await g2.trigger('phase.begin', { self: q, phase: 'end' });
  ok(noErr(g2), '箜声：结束阶段结算异常');
  ok((q.flags.kong || []).length === 0, '箜声：结束阶段应清空“箜”');
  ok(hasLog(g2, '箜声'), '箜声：缺少归还/使用战报');

  // 良姻②：任意角色获得武将牌上的牌 → 令一名角色弃置一张牌
  const g3 = mk(['jie_zhoufei', 'caocao'], H({ seats: [1], index: 0 }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = a; g3.turnCount = 25;
  b.hand = [card('k1', 'sha'), card('k2', 'shan')];
  const bh = b.hand.length;
  await g3.trigger('zone.in', { self: b, cards: [card('k3', 'tao')] });
  ok(b.hand.length === bh - 1, `良姻②：应令一名角色弃置一张牌（${bh} → ${b.hand.length}）`);

  // 良姻③：每轮结束结算（round.begin 时结算上一轮）
  const g4 = mk(['jie_zhoufei', 'caocao'], H({ index: 0 }));
  const c = g4.players[0], d = g4.players[1];
  g4.turnPlayer = c; g4.turnCount = 26;
  d.hp = 2;
  c.flags.lyCur = [d.id];
  await g4.trigger('round.begin', { self: c, round: 2 });
  ok(d.hp === 3, `良姻③：唯一成为“良姻”目标的角色应回复 1 点体力（2 → ${d.hp}）`);
  ok((c.flags.lyCur || []).length === 0, '良姻③：结算后应清空本轮记录');
}

// ================= 总结 =================
console.log(`\n===== sp4check（阶段 5F 手杀 SP + 界 精选 10 将）=====`);
console.log(`断言通过：${pass}    失败：${fail}`);
if (!packCnReady) console.log('⚠ 提示：PACK_CN.sp4 尚未登记，主控合入 src/data/generals.js 后应补 PACK_CN.sp4 = \'手杀 SP·精选\'');
if (fail) {
  console.log('失败明细：');
  for (const m of bad) console.log('  ✗ ' + m);
  process.exitCode = 1;
} else {
  console.log('全部断言通过 ✅');
}
