// 阶段 6C · 威震天下 / 武庙 / 星河璀璨·限定 剩余 15 将（pack = 'weizhen2'）守门测试
// 运行：node tools/weizhen2check.js
// 说明：本批次按任务约束「只新增 3 个文件」，不改 src/data/generals.js 与 src/skills/index.js，
//       故测试直接 import 自己的技能/数据文件，并在运行时把 WEIZHEN2_GENERALS 注入 GENERALS 注册表。
import '../src/skills/weizhen2.js';
import { WEIZHEN2_GENERALS } from '../src/data/weizhen2.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

// —— 运行时注册（主控合入 generals.js 后此段变成幂等空操作）
for (const gd of WEIZHEN2_GENERALS) {
  if (!generalById(gd.id)) GENERALS.push(gd);
}

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));
const logCount = (g, kw) => g.logs.filter(l => l.text.includes(kw)).length;
const noErr = (g) => !g.logs.some(l => l.text.includes('执行异常'));

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
// 通用桩：confirm=是 / choice=index / targets=over.seats / card=手牌首张 / cards=over.cardCount 张
const H = (over = {}) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: over.yes !== false };
  if (req.kind === 'choice' || req.kind === 'choose') return { index: over.index !== undefined ? over.index : 0 };
  if (req.kind === 'targets') return { seats: over.seats !== undefined ? over.seats : [1] };
  if (req.kind === 'card') return { cardId: over.cardId || (p.hand[0] || {}).id };
  if (req.kind === 'cards') {
    const n = over.cardCount !== undefined ? over.cardCount : Math.max(1, req.min || 1);
    return { cardIds: (req.cards || []).slice(0, n) };
  }
  return null;
};
const setHand = (p, list) => { p.hand = list; };

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['wz2_weizhangliao', '威张辽', 'qun', 4, ['wz2s_yuxi', 'wz2s_porong'], false],
  ['wz2_weizhaoyun', '威赵云', 'qun', 4, ['wz2s_longxiang', 'wz2s_chongzhen'], false],
  ['wz2_weimachao', '威马超', 'qun', 4, ['wz2s_zhongtao', 'wz2s_jizhan'], false],
  ['wz2_weihuangzhong', '威黄忠', 'qun', 4, ['wz2s_chuanyang', 'wz2s_dingjun'], false],
  ['wz2_weidianwei', '威典韦', 'qun', 4, ['wz2s_elai', 'wz2s_zhiji'], false],
  ['wz2_wuzhaoyun', '武赵云', 'shu', 5, ['wz2s_juechen', 'wz2s_qijin'], false],
  ['wz2_wumachao', '武马超', 'shu', 5, ['wz2s_tieji2', 'wz2s_shenwei'], false],
  ['wz2_wuhuangzhong', '武黄忠', 'shu', 5, ['wz2s_liehun', 'wz2s_pozhen'], false],
  ['wz2_wudianwei', '武典韦', 'wei', 5, ['wz2s_guzhielai2', 'wz2s_sheshen'], false],
  ['wz2_xingsunquan', '星孙权', 'wu', 4, ['wz2s_xingheng', 'wz2s_ningwang'], false],
  ['wz2_xingliubei', '星刘备', 'shu', 4, ['wz2s_xingde', 'wz2s_renwang'], false],
  ['wz2_xingcaocao', '星曹操', 'wei', 4, ['wz2s_xingxiong', 'wz2s_guancang'], false],
  ['wz2_xingguanyu', '星关羽', 'shu', 4, ['wz2s_wuxing', 'wz2s_weizhen'], false],
  ['wz2_xingzhangfei', '星张飞', 'shu', 4, ['wz2s_xinghou', 'wz2s_xingxiao'], false],
  ['wz2_xingdaqiao', '星大乔', 'wu', 3, ['wz2s_xingying', 'wz2s_yizhu'], true],
];
for (const [id, name, kingdom, hp, skills, female] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 数据缺失`);
  if (!gd) continue;
  ok(gd.name === name, `${id} 名称不符：${gd.name}`);
  ok(gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符：${gd.kingdom}/${gd.hp}`);
  ok(gd.pack === 'weizhen', `${id} pack 应为 weizhen（阶段6 已合入原包），实际 ${gd.pack}`);
  ok(Array.isArray(gd.skills) && gd.skills.length === 2, `${id} 应为 2 个技能，实际 ${gd.skills}`);
  ok(gd.skills.length === skills.length && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  ok(female ? gd.gender === 'female' : !gd.gender, `${id} gender 标记不符`);
}
for (const [id, name] of EXPECT) {
  ok(GENERALS.filter(g => g.name === name).length === 1, `武将名「${name}」与既有武将重名`);
  ok(GENERALS.filter(g => g.id === id).length === 1, `武将 id ${id} 重复注册`);
}
ok(WEIZHEN2_GENERALS.length === 15, `WEIZHEN2_GENERALS 应为 15 位，实际 ${WEIZHEN2_GENERALS.length}`);
ok(GENERALS.filter(g => g.pack === 'weizhen').length === 25, `weizhen 包将数应为 25（合并后），实际 ${GENERALS.filter(g => g.pack === 'weizhen2').length}`);

const ALL_SK = EXPECT.flatMap(x => x[4]);
ok(ALL_SK.length === 30, `技能总数应为 30，实际 ${ALL_SK.length}`);
ok(new Set(ALL_SK).size === 30, '技能 id 存在重复');
for (const s of ALL_SK) {
  ok(hasSkill(s), `技能 ${s} 未注册`);
  const sk = getSkill(s);
  ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
  ok(sk && !!sk.name && !!sk.desc && sk.desc.length > 8, `技能 ${s} 缺少 name/desc`);
  ok(sk && ((sk.triggers || []).length > 0 || !!sk.active), `技能 ${s} 是空壳`);
  ok(s.startsWith('wz2s_'), `技能 id ${s} 应使用 wz2s_ 前缀`);
  ok(!/^(jie_|mou_|ji_|shen_|sp_|ol_)/.test(s), `技能 id ${s} 使用了禁用前缀`);
}
const NAMES = {
  wz2s_yuxi: '驭袭', wz2s_porong: '破戎', wz2s_longxiang: '龙骧', wz2s_chongzhen: '冲阵',
  wz2s_zhongtao: '众讨', wz2s_jizhan: '极斩', wz2s_chuanyang: '穿杨', wz2s_dingjun: '定军',
  wz2s_elai: '恶来', wz2s_zhiji: '掷戟', wz2s_juechen: '绝尘', wz2s_qijin: '七进',
  wz2s_tieji2: '铁骑', wz2s_shenwei: '神威', wz2s_liehun: '烈魂', wz2s_pozhen: '破阵',
  wz2s_guzhielai2: '古之恶来', wz2s_sheshen: '舍身', wz2s_xingheng: '星衡', wz2s_ningwang: '凝望',
  wz2s_xingde: '星德', wz2s_renwang: '仁望', wz2s_xingxiong: '星雄', wz2s_guancang: '观沧',
  wz2s_wuxing: '武星', wz2s_weizhen: '威震', wz2s_xinghou: '星吼', wz2s_xingxiao: '星啸',
  wz2s_xingying: '星影', wz2s_yizhu: '遗珠',
};
for (const [id, name] of Object.entries(NAMES)) {
  const sk = getSkill(id);
  ok(sk && sk.name === name, `技能 ${id} 名称不符（期望 ${name}，实际 ${sk && sk.name}）`);
}

// ================= 2. 主动技按钮可见性 =================
const ACTIVES = {
  wz2_weizhaoyun: ['wz2s_chongzhen'], wz2_weimachao: ['wz2s_zhongtao', 'wz2s_jizhan'],
  wz2_weihuangzhong: ['wz2s_dingjun'], wz2_weidianwei: ['wz2s_zhiji'], wz2_wuhuangzhong: ['wz2s_pozhen'],
  wz2_wudianwei: ['wz2s_sheshen'], wz2_xingsunquan: ['wz2s_xingheng'], wz2_xingliubei: ['wz2s_xingde'],
  wz2_xingcaocao: ['wz2s_guancang'], wz2_xingguanyu: ['wz2s_wuxing'], wz2_xingzhangfei: ['wz2s_xinghou'],
  wz2_xingdaqiao: ['wz2s_yizhu'],
};
for (const [id, list] of Object.entries(ACTIVES)) {
  const g = mk([id, 'caocao']);
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
  const names = g.activeSkillsOf(p).map(s => s.id);
  for (const s of list) ok(names.includes(s), `${id} 的主动技 ${s} 未出现在 activeSkillsOf（${names.join(',')}）`);
}
for (const id of ['wz2_weizhangliao', 'wz2_wuzhaoyun', 'wz2_wumachao']) {
  const g = mk([id, 'caocao']);
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
  const own = g.activeSkillsOf(p).filter(s => (generalById(id).skills || []).includes(s.id));
  ok(own.length === 0, `${id} 不应有主动技按钮：${own.map(s => s.id).join(',')}`);
}

// ================= 3. 威张辽 · 驭袭 / 破戎 =================
{
  // 驭袭正例：造成伤害时摸一张牌
  const g = mk(['wz2_weizhangliao', 'caocao'], H());
  const [a, b] = g.players;
  setHand(a, []); setHand(b, [card('yx1', 'tao')]);
  await g.damage({ from: a, to: b, amount: 1, reason: 'test' });
  ok(a.hand.length === 1, `驭袭：造成伤害应摸一张牌（手牌 ${a.hand.length}）`);
  ok(hasLog(g, '驭袭'), '驭袭：缺少战报');
  ok(noErr(g), '驭袭：技能执行异常');
  // 驭袭正例②：受到伤害也摸牌
  const g2 = mk(['wz2_weizhangliao', 'caocao'], H());
  const [c, d] = g2.players;
  setHand(c, []); setHand(d, [card('yx2', 'tao')]);
  await g2.damage({ from: d, to: c, amount: 1, reason: 'test' });
  ok(c.hand.length === 1, `驭袭：受到伤害也应摸一张牌（手牌 ${c.hand.length}）`);
  // 驭袭反例：不确认则不摸牌
  const g3 = mk(['wz2_weizhangliao', 'caocao'], H({ yes: false }));
  const [e, f] = g3.players;
  setHand(e, []); setHand(f, [card('yx3', 'tao')]);
  await g3.damage({ from: e, to: f, amount: 1, reason: 'test' });
  ok(e.hand.length === 0, `驭袭：放弃发动不应摸牌（手牌 ${e.hand.length}）`);
  ok(!hasLog(g3, '驭袭'), '驭袭：放弃发动不应有战报');
}
{
  // 破戎正例：先用伤害类牌（决斗）→ 再用【杀】指定目标 → 获得其手牌并额外 1 点伤害
  const g = mk(['wz2_weizhangliao', 'caocao'], H());
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 3;
  setHand(a, [card('pr_a', 'sha')]);
  setHand(b, [card('pr_b1', 'sha'), card('pr_b2', 'sha')]);
  await g.trigger('card.use.after', { self: a, card: card('pr_jd', 'juedou') });
  ok(a.flags.wz2ComboTurn === 3, '破戎：使用伤害类牌后应记录连招前摇');
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play', ignoreShaLimit: true });
  ok(hasLog(g, '破戎'), '破戎：连招应触发');
  ok(noErr(g), '破戎：技能执行异常');
  ok(b.hp === 2, `破戎：应额外造成 1 点伤害（目标 hp ${b.hp}，期望 2）`);
  ok(b.hand.length === 1, `破戎：应获得目标一张手牌（目标剩 ${b.hand.length}）`);
  // 破戎反例：未使用伤害类牌 → 不触发
  const g2 = mk(['wz2_weizhangliao', 'caocao'], H());
  const [c, d] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 4;
  setHand(c, [card('pr_c', 'sha')]);
  setHand(d, [card('pr_d1', 'sha'), card('pr_d2', 'sha')]);
  await g2.useCard({ from: c, card: c.hand[0], targets: [d], reason: 'play', ignoreShaLimit: true });
  ok(!hasLog(g2, '破戎'), '破戎：没有连招前摇不应触发');
  ok(d.hand.length === 2, `破戎：未触发时不应获得对方手牌（剩 ${d.hand.length}）`);
}

// ================= 4. 威赵云 · 龙骧 / 冲阵 =================
{
  const g0 = mk(['caocao', 'sunquan', 'liubei', 'zhouyu']);
  const base = g0.distance(g0.players[0], g0.players[2]);
  const g = mk(['wz2_weizhaoyun', 'sunquan', 'liubei', 'zhouyu']);
  const p = g.players[0];
  const d = g.distance(p, g.players[2]);
  ok(d === base - 1 || (base === 1 && d === 1), `龙骧：计算与其他角色距离应 -1（对照 ${base} → ${d}）`);
  // 正例：回合外成为【杀】目标 → 摸一张牌
  const g2 = mk(['wz2_weizhaoyun', 'caocao'], H());
  const [a, b] = g2.players;
  g2.turnPlayer = b; g2.turnCount = 5;
  setHand(a, []); setHand(b, [card('lx1', 'sha')]);
  await g2.useCard({ from: b, card: b.hand[0], targets: [a], reason: 'play' });
  ok(hasLog(g2, '龙骧'), '龙骧：回合外成为【杀】目标应摸牌');
  ok(hasLog(g2, '摸了 1 张牌'), '龙骧：应有摸一张牌的战报');
  ok(a.hp === a.maxHp, `龙骧：摸到的【闪】可正常响应（hp ${a.hp}/${a.maxHp}）`);
  // 反例：自己回合内成为目标不摸牌
  const g3 = mk(['wz2_weizhaoyun', 'caocao'], H());
  const [c, dd] = g3.players;
  g3.turnPlayer = c; g3.turnCount = 6;
  setHand(c, []); setHand(dd, [card('lx2', 'sha')]);
  await g3.useCard({ from: dd, card: dd.hand[0], targets: [c], reason: 'play' });
  ok(!hasLog(g3, '龙骧'), '龙骧：自己回合内不应触发');
}
{
  // 冲阵：拼点赢 → 视为使用【杀】
  const g = mk(['wz2_weizhaoyun', 'caocao'], H());
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 7; g.phase = 'play';
  setHand(a, [card('cz_a', 'shan', 'heart', 12)]);
  setHand(b, [card('cz_b', 'tao', 'spade', 2)]);
  await g.useActiveSkill(a, 'wz2s_chongzhen');
  ok(hasLog(g, '冲阵'), '冲阵：缺少战报');
  ok(noErr(g), '冲阵：技能执行异常');
  ok(b.hp === 3, `冲阵：拼点赢后应视为使用【杀】命中（目标 hp ${b.hp}，期望 3）`);
  // 反例：拼点没赢 → 不使用【杀】
  const g2 = mk(['wz2_weizhaoyun', 'caocao'], H());
  const [c, d] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 8; g2.phase = 'play';
  setHand(c, [card('cz_c', 'shan', 'heart', 2)]);
  setHand(d, [card('cz_d', 'tao', 'spade', 13)]);
  await g2.useActiveSkill(c, 'wz2s_chongzhen');
  ok(d.hp === d.maxHp, `冲阵：拼点没赢不应造成伤害（目标 hp ${d.hp}）`);
  ok(hasLog(g2, '拼点未赢'), '冲阵：应记录拼点未赢');
  ok(g2.activeSkillsOf(c).every(s => s.id !== 'wz2s_chongzhen'), '冲阵：本回合已发动，按钮应消失');
}

// ================= 5. 威马超 · 众讨 / 极斩 =================
{
  // 众讨正例：弃牌堆有红桃 → 获得之
  const g = mk(['wz2_weimachao', 'caocao'], H({ index: 2 }));
  const [a] = g.players;
  g.turnPlayer = a; g.turnCount = 9; g.phase = 'play';
  setHand(a, []);
  g.discardPile.push(card('zt_h', 'tao', 'heart', 5));
  await g.useActiveSkill(a, 'wz2s_zhongtao');
  ok(hasLog(g, '众讨'), '众讨：缺少战报');
  ok(noErr(g), '众讨：技能执行异常');
  ok(a.hand.length === 1 && a.hand[0].suit === 'heart', `众讨：应获得红桃牌（手牌 ${a.hand.length}）`);
  // 众讨反例：弃牌堆无该花色 → 改为摸一张牌
  const g2 = mk(['wz2_weimachao', 'caocao'], H({ index: 0 }));
  const [c] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 10; g2.phase = 'play';
  setHand(c, []);
  await g2.useActiveSkill(c, 'wz2s_zhongtao');
  ok(c.hand.length === 1 && hasLog(g2, '摸一张牌'), '众讨：弃牌堆无该花色应改为摸一张牌');
  // 众讨反例：取消选择 → 无变化
  const g3 = mk(['wz2_weimachao', 'caocao'], H({ index: -1 }));
  const [e] = g3.players;
  g3.turnPlayer = e; g3.turnCount = 11; g3.phase = 'play';
  setHand(e, []);
  await g3.useActiveSkill(e, 'wz2s_zhongtao');
  ok(e.hand.length === 0, `众讨：取消选择不应获得牌（手牌 ${e.hand.length}）`);
}
{
  // 极斩正例①：弃置目标两张牌
  const g = mk(['wz2_weimachao', 'caocao'], H({ index: 0 }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 12; g.phase = 'play';
  setHand(a, [card('jz_a', 'sha', 'spade', 9)]);
  setHand(b, [card('jz_b1', 'tao'), card('jz_b2', 'shan'), card('jz_b3', 'sha')]);
  await g.useActiveSkill(a, 'wz2s_jizhan');
  ok(hasLog(g, '极斩'), '极斩：缺少战报');
  ok(noErr(g), '极斩：技能执行异常');
  ok(b.hand.length === 1, `极斩：应弃置目标两张牌（剩 ${b.hand.length}）`);
  ok(a.hand.length === 0, `极斩：应弃置黑色手牌作为代价（自己手牌 ${a.hand.length}）`);
  // 极斩正例②：造成 1 点伤害
  const g2 = mk(['wz2_weimachao', 'caocao'], H({ index: 1 }));
  const [c, d] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 13; g2.phase = 'play';
  setHand(c, [card('jz_c', 'sha', 'club', 9)]);
  setHand(d, [card('jz_d', 'tao')]);
  await g2.useActiveSkill(c, 'wz2s_jizhan');
  ok(d.hp === 3, `极斩：应造成 1 点伤害（目标 hp ${d.hp}，期望 3）`);
  // 极斩反例：没有黑色手牌
  const g3 = mk(['wz2_weimachao', 'caocao'], H());
  const [e, f] = g3.players;
  g3.turnPlayer = e; g3.turnCount = 14; g3.phase = 'play';
  setHand(e, [card('jz_e', 'tao', 'heart', 8)]);
  setHand(f, [card('jz_f', 'tao')]);
  await g3.useActiveSkill(e, 'wz2s_jizhan');
  ok(hasLog(g3, '没有黑色手牌'), '极斩：无黑色手牌应提示');
  ok(f.hand.length === 1, '极斩：无黑色手牌不应产生任何结算');
}

// ================= 6. 威黄忠 · 穿杨 / 定军 =================
{
  // 穿杨正例：目标手牌数不大于自己 → 不可闪避
  const g = mk(['wz2_weihuangzhong', 'caocao'], H());
  const [a, b] = g.players;
  setHand(a, [card('cy1', 'sha'), card('cy2', 'tao')]);
  setHand(b, [card('cy3', 'shan')]);
  const shaCtx = {};
  await g.trigger('target.after', { self: a, card: card('cy_sha', 'sha'), target: b, shaCtx, used: [], canceled: false });
  ok(shaCtx.unavoidable === true, '穿杨：目标手牌数不大于你时应不可被【闪】响应');
  ok(hasLog(g, '穿杨'), '穿杨：缺少战报');
  // 穿杨反例：目标手牌更多 → 不置位
  const shaCtx2 = {};
  setHand(b, [card('cy4', 'shan'), card('cy5', 'shan'), card('cy6', 'shan')]);
  await g.trigger('target.after', { self: a, card: card('cy_sha2', 'sha'), target: b, shaCtx: shaCtx2, used: [], canceled: false });
  ok(shaCtx2.unavoidable === undefined, '穿杨：目标手牌更多时不应不可闪避');
}
{
  // 定军正例：弃一张牌 → 造成 1 点伤害，且目标体力大于自己时摸一张牌
  const g = mk(['wz2_weihuangzhong', 'caocao'], H());
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 15; g.phase = 'play';
  setHand(a, [card('dj1', 'tao')]);
  setHand(b, [card('dj2', 'tao')]);
  a.hp = 1;                                   // 目标体力大于自己 → 追加摸一张牌
  await g.useActiveSkill(a, 'wz2s_dingjun');
  ok(hasLog(g, '定军'), '定军：缺少战报');
  ok(noErr(g), '定军：技能执行异常');
  ok(b.hp === 3, `定军：应造成 1 点伤害（目标 hp ${b.hp}，期望 3）`);
  ok(a.hand.length === 1, `定军：目标体力大于自己应摸一张牌（手牌 ${a.hand.length}）`);
  // 定军反例：无牌可弃
  const g2 = mk(['wz2_weihuangzhong', 'caocao'], H());
  const [c, d] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 16; g2.phase = 'play';
  setHand(c, []); setHand(d, [card('dj3', 'tao')]);
  await g2.useActiveSkill(c, 'wz2s_dingjun');
  ok(hasLog(g2, '没有可弃置的牌'), '定军：无牌可弃应提示');
  ok(d.hp === d.maxHp, '定军：无牌可弃不应造成伤害');
}

// ================= 7. 威典韦 · 恶来 / 掷戟 =================
{
  // 恶来正例：伤害来源与己距离 1 → 伤害 -1
  const g = mk(['wz2_weidianwei', 'caocao'], H());
  const [a, b] = g.players;
  await g.damage({ from: b, to: a, amount: 2, reason: 'test' });
  ok(a.hp === 3, `恶来：距离 1 的伤害应 -1（hp ${a.hp}，期望 4-1=3）`);
  ok(hasLog(g, '恶来'), '恶来：缺少战报');
  // 恶来反例：远处角色造成伤害不减免
  const g2 = mk(['wz2_weidianwei', 'caocao', 'sunquan', 'liubei']);
  const p2 = g2.players[0];
  await g2.damage({ from: g2.players[2], to: p2, amount: 2, reason: 'test' });
  ok(p2.hp === 2, `恶来：距离大于 1 不应减免（hp ${p2.hp}，期望 2）`);
}
{
  // 掷戟正例：无武器 → 失去 1 点体力并对攻击范围内目标造成 1 点伤害
  const g = mk(['wz2_weidianwei', 'caocao'], H({ index: 0 }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 17; g.phase = 'play';
  setHand(a, [card('zj1', 'tao')]);
  setHand(b, [card('zj2', 'tao')]);
  await g.useActiveSkill(a, 'wz2s_zhiji');
  ok(hasLog(g, '掷戟'), '掷戟：缺少战报');
  ok(noErr(g), '掷戟：技能执行异常');
  ok(a.hp === 3, `掷戟：应失去 1 点体力（hp ${a.hp}，期望 3）`);
  ok(b.hp === 3, `掷戟：应对目标造成 1 点伤害（hp ${b.hp}，期望 3）`);
  // 掷戟正例②：有武器时弃置武器牌，不失去体力
  const g2 = mk(['wz2_weidianwei', 'caocao'], H({ index: 0 }));
  const [c, d] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 18; g2.phase = 'play';
  c.equips.weapon = card('zj_w', 'qinggang', 'spade', 6);
  setHand(c, [card('zj3', 'tao')]); setHand(d, [card('zj4', 'tao')]);
  await g2.useActiveSkill(c, 'wz2s_zhiji');
  ok(!c.equips.weapon, '掷戟：选择弃置武器时武器应离场');
  ok(c.hp === c.maxHp, `掷戟：弃置武器时不应失去体力（hp ${c.hp}）`);
}

// ================= 8. 武赵云 · 绝尘 / 七进 =================
{
  const g0 = mk(['caocao', 'sunquan', 'liubei', 'zhouyu']);
  const base = g0.distance(g0.players[0], g0.players[2]);
  const g = mk(['wz2_wuzhaoyun', 'sunquan', 'liubei', 'zhouyu']);
  const p = g.players[0];
  const d = g.distance(p, g.players[2]);
  ok(d === base - 1 || (base === 1 && d === 1), `绝尘：计算与其他角色距离应 -1（对照 ${base} → ${d}）`);
  const shaCtx = {};
  await g.trigger('target.after', { self: p, card: card('jc', 'sha'), target: g.players[1], shaCtx, used: [], canceled: false });
  ok(shaCtx.unavoidable === true, '绝尘：使用【杀】指定目标后应不可被【闪】响应');
  ok(hasLog(g, '绝尘'), '绝尘：缺少战报');
}
{
  // 七进正例：弃一张牌令【杀】无效并摸一张牌
  const g = mk(['wz2_wuzhaoyun', 'caocao'], H());
  const [a, b] = g.players;
  g.turnPlayer = b; g.turnCount = 19;
  setHand(a, [card('qj1', 'tao')]);
  setHand(b, [card('qj2', 'sha')]);
  await g.useCard({ from: b, card: b.hand[0], targets: [a], reason: 'play' });
  ok(hasLog(g, '七进'), '七进：缺少战报');
  ok(noErr(g), '七进：技能执行异常');
  ok(a.hp === a.maxHp, `七进：此【杀】应对其无效（hp ${a.hp}/${a.maxHp}）`);
  ok(a.hand.length === 1, `七进：弃一张摸一张后手牌应为 1（实际 ${a.hand.length}）`);
  // 七进反例：没有牌可弃 → 不取消
  const g2 = mk(['wz2_wuzhaoyun', 'caocao'], H());
  const [c, d] = g2.players;
  g2.turnPlayer = d; g2.turnCount = 20;
  setHand(c, []); setHand(d, [card('qj3', 'sha')]);
  await g2.useCard({ from: d, card: d.hand[0], targets: [c], reason: 'play' });
  ok(!hasLog(g2, '七进'), '七进：没有牌可弃时不应发动');
  ok(c.hp === c.maxHp - 1, `七进：未发动时应正常受到伤害（hp ${c.hp}）`);
}

// ================= 9. 武马超 · 铁骑 / 神威 =================
{
  const g = mk(['wz2_wumachao', 'caocao'], H());
  const [a, b] = g.players;
  const shaCtx = {};
  await g.trigger('target.after', { self: a, card: card('tq', 'sha'), target: b, shaCtx, used: [], canceled: false });
  ok(hasLog(g, '铁骑'), '铁骑：缺少战报');
  ok(noErr(g), '铁骑：技能执行异常');
  ok((shaCtx.unavoidable === true) !== hasLog(g, '判定不为红色'),
    '铁骑：判定为红应不可闪避，判定非红应可闪避');
  // 铁骑反例：非【杀】牌指定目标不判定
  const g2 = mk(['wz2_wumachao', 'caocao'], H());
  const [c, d] = g2.players;
  await g2.trigger('target.after', { self: c, card: card('tq2', 'guohe'), target: d, used: [], canceled: false });
  ok(!hasLog(g2, '铁骑'), '铁骑：非【杀】不应触发');
}
{
  const g0 = mk(['caocao', 'sunquan', 'liubei', 'zhouyu']);
  const base = g0.distance(g0.players[0], g0.players[2]);
  const g = mk(['wz2_wumachao', 'sunquan', 'liubei', 'zhouyu']);
  const p = g.players[0];
  const d = g.distance(p, g.players[2]);
  ok(d === base - 1 || (base === 1 && d === 1), `神威：计算与其他角色距离应 -1（对照 ${base} → ${d}）`);
  // 神威正例：【杀】造成伤害后摸一张牌
  const g2 = mk(['wz2_wumachao', 'caocao'], H());
  const [a, b] = g2.players;
  setHand(a, []);
  await g2.damage({ from: a, to: b, amount: 1, card: card('sw', 'sha'), reason: 'sha' });
  ok(a.hand.length === 1, `神威：【杀】造成伤害后应摸一张牌（手牌 ${a.hand.length}）`);
  ok(hasLog(g2, '神威'), '神威：缺少战报');
  // 神威反例：非【杀】伤害不摸牌
  const g3 = mk(['wz2_wumachao', 'caocao'], H());
  const [c, dd] = g3.players;
  setHand(c, []);
  await g3.damage({ from: c, to: dd, amount: 1, reason: 'test' });
  ok(c.hand.length === 0, `神威：非【杀】伤害不应摸牌（手牌 ${c.hand.length}）`);
}

// ================= 10. 武黄忠 · 烈魂 / 破阵 =================
{
  // 烈魂正例：目标体力不大于自己 → +1
  const g = mk(['wz2_wuhuangzhong', 'caocao'], H());
  const [a, b] = g.players;
  await g.damage({ from: a, to: b, amount: 1, card: card('lh', 'sha'), reason: 'sha' });
  ok(b.hp === 2, `烈魂：【杀】伤害应 +1（目标 hp ${b.hp}，期望 4-2=2）`);
  ok(hasLog(g, '烈魂'), '烈魂：缺少战报');
  // 烈魂反例：目标体力大于自己 → 不加成
  const g2 = mk(['wz2_wuhuangzhong', 'caocao'], H());
  const [c, d] = g2.players;
  c.hp = 2;
  await g2.damage({ from: c, to: d, amount: 1, card: card('lh2', 'sha'), reason: 'sha' });
  ok(d.hp === 3, `烈魂：目标体力大于自己不应加成（hp ${d.hp}，期望 3）`);
}
{
  // 破阵正例：目标 -1 体力，自己失去 1 点体力
  const g = mk(['wz2_wuhuangzhong', 'caocao'], H());
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 21; g.phase = 'play';
  setHand(a, [card('pz1', 'tao')]); setHand(b, [card('pz2', 'tao')]);
  await g.useActiveSkill(a, 'wz2s_pozhen');
  ok(hasLog(g, '破阵'), '破阵：缺少战报');
  ok(noErr(g), '破阵：技能执行异常');
  ok(b.hp === 3, `破阵：应造成 1 点伤害（hp ${b.hp}，期望 3）`);
  ok(a.hp === 4, `破阵：应失去 1 点体力（hp ${a.hp}，期望 4）`);
  // 破阵反例：未选择目标 → 不结算
  const g2 = mk(['wz2_wuhuangzhong', 'caocao'], H({ seats: [] }));
  const [c, d] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 22; g2.phase = 'play';
  await g2.useActiveSkill(c, 'wz2s_pozhen');
  ok(d.hp === d.maxHp && c.hp === c.maxHp, '破阵：未选择目标时不应造成伤害或失去体力');
}

// ================= 11. 武典韦 · 古之恶来 / 舍身 =================
{
  const g0 = mk(['caocao', 'sunquan', 'liubei', 'zhouyu']);
  const base = g0.distance(g0.players[0], g0.players[2]);
  const g = mk(['wz2_wudianwei', 'sunquan', 'liubei', 'zhouyu']);
  const p = g.players[0];
  const d = g.distance(g.players[2], p);
  ok(d === base + 1 || (d === base && base >= 2), `古之恶来：其他角色计算与你的距离应 +1（对照 ${base} → ${d}）`);
  // 正例：受到伤害后弃置伤害来源一张牌
  const g2 = mk(['wz2_wudianwei', 'caocao'], H());
  const [a, b] = g2.players;
  setHand(b, [card('gl1', 'tao'), card('gl2', 'sha')]);
  await g2.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(hasLog(g2, '古之恶来'), '古之恶来：缺少战报');
  ok(noErr(g2), '古之恶来：技能执行异常');
  ok(b.hand.length === 1, `古之恶来：应弃置伤害来源一张牌（剩 ${b.hand.length}）`);
  // 反例：伤害来源无牌 → 不发动
  const g3 = mk(['wz2_wudianwei', 'caocao'], H());
  const [c, dd] = g3.players;
  setHand(dd, []);
  await g3.damage({ from: dd, to: c, amount: 1, reason: 'test' });
  ok(!hasLog(g3, '古之恶来'), '古之恶来：伤害来源没有牌时不应发动');
}
{
  // 舍身正例：失去 1 点体力 + 造成 1 点伤害 + 摸一张牌
  const g = mk(['wz2_wudianwei', 'caocao'], H());
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 23; g.phase = 'play';
  setHand(a, []); setHand(b, [card('ss1', 'tao')]);
  await g.useActiveSkill(a, 'wz2s_sheshen');
  ok(hasLog(g, '舍身'), '舍身：缺少战报');
  ok(noErr(g), '舍身：技能执行异常');
  ok(a.hp === 4, `舍身：应失去 1 点体力（hp ${a.hp}，期望 4）`);
  ok(b.hp === 3, `舍身：应造成 1 点伤害（hp ${b.hp}，期望 3）`);
  ok(a.hand.length === 1, `舍身：应摸一张牌（手牌 ${a.hand.length}）`);
  // 舍身反例：未选择目标时不摸牌
  const g2 = mk(['wz2_wudianwei', 'caocao'], H({ seats: [] }));
  const [c] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 24; g2.phase = 'play';
  setHand(c, []);
  await g2.useActiveSkill(c, 'wz2s_sheshen');
  ok(c.hand.length === 0, `舍身：未选择目标不应摸牌（手牌 ${c.hand.length}）`);
}

// ================= 12. 星孙权 · 星衡 / 凝望 =================
{
  const g = mk(['wz2_xingsunquan', 'caocao'], H({ cardCount: 2 }));
  const [a] = g.players;
  g.turnPlayer = a; g.turnCount = 25; g.phase = 'play';
  setHand(a, [card('xh1', 'tao'), card('xh2', 'shan'), card('xh3', 'sha')]);
  await g.useActiveSkill(a, 'wz2s_xingheng');
  ok(hasLog(g, '星衡'), '星衡：缺少战报');
  ok(noErr(g), '星衡：技能执行异常');
  ok(a.hand.length === 3, `星衡：弃 2 摸 2，手牌应仍为 3（实际 ${a.hand.length}）`);
  ok(!a.hand.some(c => c.id === 'xh1' || c.id === 'xh2'), '星衡：应弃置选中的两张牌');
  // 星衡反例：未选择牌 → 取消发动
  const g2 = mk(['wz2_xingsunquan', 'caocao'], H({ cardCount: 0 }));
  const [c] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 26; g2.phase = 'play';
  setHand(c, [card('xh4', 'tao')]);
  await g2.useActiveSkill(c, 'wz2s_xingheng');
  ok(hasLog(g2, '未选择牌'), '星衡：未选择牌应提示取消');
  ok(c.hand.length === 1, `星衡：取消发动后手牌不应变化（${c.hand.length}）`);
  // 凝望正例：结束阶段手牌少于体力 → 摸一张牌
  const g3 = mk(['wz2_xingsunquan', 'caocao'], H());
  const e = g3.players[0];
  setHand(e, [card('nw1', 'tao')]);
  await g3.trigger('phase.begin', { self: e, phase: 'end' });
  ok(e.hand.length === 2, `凝望：结束阶段手牌少于体力应摸一张牌（手牌 ${e.hand.length}）`);
  ok(hasLog(g3, '凝望'), '凝望：缺少战报');
  // 凝望反例：手牌不少于体力 → 不摸牌
  const g4 = mk(['wz2_xingsunquan', 'caocao'], H());
  const f = g4.players[0];
  setHand(f, [card('nw2', 'tao'), card('nw3', 'tao'), card('nw4', 'tao'), card('nw5', 'tao')]);
  await g4.trigger('phase.begin', { self: f, phase: 'end' });
  ok(f.hand.length === 4, `凝望：手牌不少于体力时不应摸牌（手牌 ${f.hand.length}）`);
}

// ================= 13. 星刘备 · 星德 / 仁望 =================
{
  const g = mk(['wz2_xingliubei', 'caocao'], H({ cardCount: 2 }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 27; g.phase = 'play';
  setHand(a, [card('xd1', 'tao'), card('xd2', 'shan'), card('xd3', 'sha')]);
  setHand(b, []);
  await g.useActiveSkill(a, 'wz2s_xingde');
  ok(hasLog(g, '星德'), '星德：缺少战报');
  ok(noErr(g), '星德：技能执行异常');
  ok(b.hand.length === 2, `星德：应交给目标两张牌（目标手牌 ${b.hand.length}）`);
  ok(a.hand.length === 2, `星德：给出两张后应摸一张牌（自己手牌 ${a.hand.length}，1+1=2）`);
  // 星德反例：只给一张不摸牌
  const g2 = mk(['wz2_xingliubei', 'caocao'], H({ cardCount: 1 }));
  const [c, d] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 28; g2.phase = 'play';
  setHand(c, [card('xd4', 'tao'), card('xd5', 'sha')]);
  setHand(d, []);
  await g2.useActiveSkill(c, 'wz2s_xingde');
  ok(d.hand.length === 1 && c.hand.length === 1, `星德：只给一张不应摸牌（自己 ${c.hand.length}，目标 ${d.hand.length}）`);
  // 仁望正例：受伤后令一名角色摸一张牌
  const g3 = mk(['wz2_xingliubei', 'caocao'], H({ seats: [1] }));
  const [e, f] = g3.players;
  setHand(f, []);
  await g3.damage({ from: f, to: e, amount: 1, reason: 'test' });
  ok(f.hand.length === 1, `仁望：应令目标摸一张牌（目标手牌 ${f.hand.length}）`);
  ok(hasLog(g3, '仁望'), '仁望：缺少战报');
  // 仁望反例：不确认则不摸牌
  const g4 = mk(['wz2_xingliubei', 'caocao'], H({ yes: false }));
  const [h, i] = g4.players;
  setHand(i, []);
  await g4.damage({ from: i, to: h, amount: 1, reason: 'test' });
  ok(i.hand.length === 0, `仁望：放弃发动不应摸牌（${i.hand.length}）`);
}

// ================= 14. 星曹操 · 星雄 / 观沧 =================
{
  const g = mk(['wz2_xingcaocao', 'caocao'], H());
  const [a, b] = g.players;
  setHand(a, []); setHand(b, [card('xx1', 'tao'), card('xx2', 'sha')]);
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(hasLog(g, '星雄'), '星雄：缺少战报');
  ok(noErr(g), '星雄：技能执行异常');
  ok(a.hand.length === 1 && b.hand.length === 1, `星雄：应获得伤害来源一张牌（自己 ${a.hand.length}，来源 ${b.hand.length}）`);
  // 星雄反例：伤害来源无牌 → 不发动
  const g2 = mk(['wz2_xingcaocao', 'caocao'], H());
  const [c, d] = g2.players;
  setHand(d, []);
  await g2.damage({ from: d, to: c, amount: 1, reason: 'test' });
  ok(!hasLog(g2, '星雄'), '星雄：伤害来源没有牌时不应发动');
  // 观沧正例：弃一张牌 → 令一名角色摸两张牌
  const g3 = mk(['wz2_xingcaocao', 'caocao'], H({ seats: [1] }));
  const [e, f] = g3.players;
  g3.turnPlayer = e; g3.turnCount = 29; g3.phase = 'play';
  setHand(e, [card('gc1', 'tao')]); setHand(f, []);
  await g3.useActiveSkill(e, 'wz2s_guancang');
  ok(hasLog(g3, '观沧'), '观沧：缺少战报');
  ok(f.hand.length === 2, `观沧：应令目标摸两张牌（目标手牌 ${f.hand.length}）`);
  ok(e.hand.length === 0, `观沧：应弃置一张牌（自己手牌 ${e.hand.length}）`);
  // 观沧反例：无牌可弃
  const g4 = mk(['wz2_xingcaocao', 'caocao'], H());
  const [h] = g4.players;
  g4.turnPlayer = h; g4.turnCount = 30; g4.phase = 'play';
  setHand(h, []);
  await g4.useActiveSkill(h, 'wz2s_guancang');
  ok(hasLog(g4, '没有可弃置的牌'), '观沧：无牌可弃应提示');
}

// ================= 15. 星关羽 · 武星 / 威震 =================
{
  // 武星正例：红色手牌当【杀】
  const g = mk(['wz2_xingguanyu', 'caocao'], H());
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 31; g.phase = 'play';
  setHand(a, [card('wx1', 'tao', 'heart', 6)]);
  setHand(b, [card('wx2', 'sha')]);
  await g.useActiveSkill(a, 'wz2s_wuxing');
  ok(hasLog(g, '武星'), '武星：缺少战报');
  ok(noErr(g), '武星：技能执行异常');
  ok(b.hp === 3, `武星：红色牌当【杀】应命中（目标 hp ${b.hp}，期望 3）`);
  ok(a.hand.length === 0, `武星：应消耗那张红色手牌（自己手牌 ${a.hand.length}）`);
  // 武星反例：没有红色手牌
  const g2 = mk(['wz2_xingguanyu', 'caocao'], H());
  const [c] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 32; g2.phase = 'play';
  setHand(c, [card('wx3', 'sha', 'spade', 4)]);
  await g2.useActiveSkill(c, 'wz2s_wuxing');
  ok(hasLog(g2, '没有红色手牌'), '武星：无红牌应提示');
  // 威震正例：目标已受伤 → +1
  const g3 = mk(['wz2_xingguanyu', 'caocao'], H());
  const [e, f] = g3.players;
  f.hp = 3;
  await g3.damage({ from: e, to: f, amount: 1, card: card('wz1', 'sha'), reason: 'sha' });
  ok(f.hp === 1, `威震：目标已受伤时【杀】伤害应 +1（hp ${f.hp}，期望 3-2=1）`);
  ok(hasLog(g3, '威震'), '威震：缺少战报');
  // 威震反例：目标未受伤 → 不加成
  const g4 = mk(['wz2_xingguanyu', 'caocao'], H());
  const [h, i] = g4.players;
  await g4.damage({ from: h, to: i, amount: 1, card: card('wz2', 'sha'), reason: 'sha' });
  ok(i.hp === 3, `威震：目标未受伤不应加成（hp ${i.hp}，期望 3）`);
}

// ================= 16. 星张飞 · 星吼 / 星啸 =================
{
  const g = mk(['wz2_xingzhangfei', 'caocao'], H());
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 33; g.phase = 'play';
  setHand(a, [card('xho1', 'tao')]);
  setHand(b, [card('xho2', 'sha')]);
  await g.useActiveSkill(a, 'wz2s_xinghou');
  ok(hasLog(g, '星吼'), '星吼：缺少战报');
  ok(noErr(g), '星吼：技能执行异常');
  ok(b.hp === 2, `星吼：视为使用【杀】命中且【星啸】加伤（目标 hp ${b.hp}，期望 4-2=2）`);
  ok(a.hand.length === 0, `星吼：应弃置一张牌（自己手牌 ${a.hand.length}）`);
  // 星吼反例：无牌可弃
  const g2 = mk(['wz2_xingzhangfei', 'caocao'], H());
  const [c] = g2.players;
  g2.turnPlayer = c; g2.turnCount = 34; g2.phase = 'play';
  setHand(c, []);
  await g2.useActiveSkill(c, 'wz2s_xinghou');
  ok(hasLog(g2, '没有可弃置的牌'), '星吼：无牌可弃应提示');
  // 星啸正例：自己手牌不大于 1 → +1
  const g3 = mk(['wz2_xingzhangfei', 'caocao'], H());
  const [e, f] = g3.players;
  setHand(e, [card('xx_a', 'tao')]);
  await g3.damage({ from: e, to: f, amount: 1, card: card('xx_s', 'sha'), reason: 'sha' });
  ok(f.hp === 2, `星啸：手牌不大于 1 时【杀】伤害应 +1（hp ${f.hp}，期望 2）`);
  ok(hasLog(g3, '星啸'), '星啸：缺少战报');
  // 星啸反例：手牌多于 1 → 不加成
  const g4 = mk(['wz2_xingzhangfei', 'caocao'], H());
  const [h, i] = g4.players;
  setHand(h, [card('xx_b', 'tao'), card('xx_c', 'tao')]);
  await g4.damage({ from: h, to: i, amount: 1, card: card('xx_s2', 'sha'), reason: 'sha' });
  ok(i.hp === 3, `星啸：手牌多于 1 时不应加成（hp ${i.hp}，期望 3）`);
}

// ================= 17. 星大乔 · 星影 / 遗珠 =================
{
  const g0 = mk(['caocao', 'sunquan', 'liubei', 'zhouyu']);
  const base = g0.distance(g0.players[0], g0.players[2]);
  const g = mk(['wz2_xingdaqiao', 'sunquan', 'liubei', 'zhouyu']);
  const p = g.players[0];
  const d = g.distance(g.players[2], p);
  ok(d === base + 1 || (d === base && base >= 2), `星影：其他角色计算与你的距离应 +1（对照 ${base} → ${d}）`);
  // 遗珠正例：目标摸两张弃一张
  const g2 = mk(['wz2_xingdaqiao', 'caocao'], H({ seats: [1] }));
  const [a, b] = g2.players;
  g2.turnPlayer = a; g2.turnCount = 35; g2.phase = 'play';
  setHand(a, [card('yz1', 'tao')]); setHand(b, []);
  await g2.useActiveSkill(a, 'wz2s_yizhu');
  ok(hasLog(g2, '遗珠'), '遗珠：缺少战报');
  ok(noErr(g2), '遗珠：技能执行异常');
  ok(b.hand.length === 1, `遗珠：摸两张弃一张后应为 1 张（实际 ${b.hand.length}）`);
  ok(a.hand.length === 1, `遗珠：自己不应弃牌（自己手牌 ${a.hand.length}）`);
  // 遗珠反例：未选择目标 → 无结算
  const g3 = mk(['wz2_xingdaqiao', 'caocao'], H({ seats: [] }));
  const [c, d2] = g3.players;
  g3.turnPlayer = c; g3.turnCount = 36; g3.phase = 'play';
  setHand(c, [card('yz2', 'tao')]); setHand(d2, []);
  await g3.useActiveSkill(c, 'wz2s_yizhu');
  ok(d2.hand.length === 0, `遗珠：未选择目标不应摸牌（${d2.hand.length}）`);
}

const packCnReady = PACK_CN.weizhen2 === '威震武庙·星河（补全）';

// ================= 输出 =================
console.log(`\n通过 ${pass} / 失败 ${fail}`);
if (bad.length) {
  console.log('失败项：');
  for (const b of bad) console.log('  -', b);
  process.exit(1);
}
