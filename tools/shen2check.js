// 阶段 5I 守门测试：神将跨线 10 将 / 20 技能
// 运行：node tools/shen2check.js
// 自包含：import 全量技能包（含注册后的 generals.js），用最小 game 桩驱动每个技能的正/反用例。
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { SHEN2_GENERALS } from '../src/data/shen2.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));
const logCount = (g, kw) => g.logs.filter(l => l.text.includes(kw)).length;

function mk(ids, handler = () => null, mode = 'duel') {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode(mode), seed: 20261225,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
// 通用桩：confirm=是 / choice=index0 / targets=over.seats / card=手牌首张
const H = (over = {}) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: over.yes !== false };
  if (req.kind === 'choice' || req.kind === 'choose') return { index: over.index ?? 0 };
  if (req.kind === 'targets') return { seats: (over.seats || [1]).slice(0, req.max || 1) };
  if (req.kind === 'card') return { cardId: over.cardId || (p.hand[0] || {}).id };
  if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, Math.max(1, req.min || 1)) };
  return null;
};
const sayNo = () => (g, p, req) => (req.kind === 'confirm' ? { yes: false } : null);
// 手牌固定（避免开局摸牌干扰断言）
const setHand = (p, list) => { p.hand = list; };

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['shen2_zhangliao', '神张辽', 'shen', 4, ['sn_duorui', 'sn_zhiti'], false],
  ['shen2_taishici', '神太史慈', 'shen', 4, ['sn_jixu', 'sn_tianyi'], false],
  ['shen2_xunyu', '神荀彧', 'shen', 3, ['sn_qice', 'sn_jieming'], false],
  ['shen2_sunce', '神孙策', 'shen', 4, ['sn_yinghun', 'sn_jingge'], false],
  ['shen2_lusu', '神鲁肃', 'shen', 3, ['sn_dimeng', 'sn_haoshi'], false],
  ['shen2_huangzhong', '神黄忠', 'shen', 4, ['sn_liegong', 'sn_chuanyun'], false],
  ['shen2_pangtong', '神庞统', 'shen', 3, ['sn_niepan', 'sn_lianhuan'], false],
  ['shen2_zhenji', '神甄姬', 'shen', 3, ['sn_qingguo', 'sn_luoshen'], true],
  ['shen2_dianwei', '神典韦', 'shen', 4, ['sn_qiangxi', 'sn_guzhielai'], false],
  ['shen2_caopi', '神曹丕', 'shen', 3, ['sn_fangzhu', 'sn_xingshang'], false],
];
ok(SHEN2_GENERALS.length === 10, `将数应为 10，实际 ${SHEN2_GENERALS.length}`);
ok(SHEN2_GENERALS.every(g => g.pack === 'shen'), 'pack 应全为 shen（阶段6 合入主包）');
ok(new Set(SHEN2_GENERALS.map(g => g.id)).size === 10, '武将 id 必须唯一');
ok(PACK_CN.shen === '神', `PACK_CN.shen 不符：${PACK_CN.shen}`);
ok(GENERALS.filter(g => g.pack === 'shen').length === 22, '已注册的 shen2 武将应为 10 位');

for (const [id, name, kingdom, hp, skills, female] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符（期望 ${kingdom}/${hp}）`);
  ok(gd && (gd.gender === 'female') === female, `${id} 性别标记不符（应为 female=${female}）`);
  ok(gd && gd.skills.length === skills.length && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && !!sk.desc && sk.desc.length > 8, `技能 ${s} 缺少 desc`);
    ok(sk && ((sk.triggers || []).length > 0 || !!sk.active), `技能 ${s} 是空壳`);
    ok(s.startsWith('sn_'), `技能 id ${s} 应使用 sn_ 前缀`);
    ok(!/^(jie_|mou_|ji_|shen_|sp_|ol_)/.test(s), `技能 id ${s} 使用了禁用前缀`);
  }
}
// id 冲突守门：defineSkill 遇重复 id 会静默复用旧技能，必须比对名称
const NAMES = {
  sn_duorui: '夺锐', sn_zhiti: '止啼', sn_jixu: '击虚', sn_tianyi: '天义', sn_qice: '奇策',
  sn_jieming: '节命', sn_yinghun: '英魂', sn_jingge: '激昂', sn_dimeng: '缔盟', sn_haoshi: '好施',
  sn_liegong: '烈弓', sn_chuanyun: '穿云', sn_niepan: '涅槃', sn_lianhuan: '连环', sn_qingguo: '倾国',
  sn_luoshen: '洛神', sn_qiangxi: '强袭', sn_guzhielai: '古之恶来', sn_fangzhu: '放逐', sn_xingshang: '行殇',
};
ok(Object.keys(NAMES).length === 20, `本包技能数应为 20，实际 ${Object.keys(NAMES).length}`);
for (const [id, name] of Object.entries(NAMES)) {
  const sk = getSkill(id);
  ok(sk && sk.name === name, `技能 ${id} 名称不符（期望 ${name}，实际 ${sk && sk.name}）`);
}

// ================= 2. 神张辽 · 夺锐 / 止啼 =================
// 夺锐正例：造成伤害后获得受伤角色一张红色手牌 → 再摸一张
{
  const g = mk(['shen2_zhangliao', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, [card('dr_r', 'tao', 'heart', 5)]);
  await g.damage({ from: a, to: b, amount: 1, reason: 'test' });
  ok(a.hand.length === 2, `夺锐：获得红牌后应摸一张（手牌 ${a.hand.length}，期望 2）`);
  ok(b.hand.length === 0, `夺锐：受伤角色应失去一张手牌（剩 ${b.hand.length}）`);
  ok(hasLog(g, '夺锐'), '夺锐：应有日志');
}
// 夺锐反例①：黑牌不摸牌；反例②：自己受伤不触发
{
  const g = mk(['shen2_zhangliao', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, [card('dr_b', 'sha', 'spade', 8)]);
  await g.damage({ from: a, to: b, amount: 1, reason: 'test' });
  ok(a.hand.length === 1, `夺锐：黑牌不应额外摸牌（手牌 ${a.hand.length}，期望 1）`);
}
{
  const g = mk(['shen2_zhangliao', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, [card('dr_x', 'tao', 'heart', 3)]);
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(a.hand.length === 0 && b.hand.length === 1, '夺锐：自己受伤不应触发（不应获得对方的牌）');
}
// 止啼正例：本回合第一张指定自己的【杀】被取消，并摸一张
{
  const g = mk(['shen2_zhangliao', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, [card('zt_1', 'sha'), card('zt_2', 'sha')]);
  await g.useCard({ from: b, card: b.hand[0], targets: [a], reason: 'play', ignoreShaLimit: true });
  ok(hasLog(g, '止啼'), '止啼：第一张【杀】应触发');
  ok(a.hp === 4, `止啼：第一张【杀】应被取消（hp ${a.hp}，期望 4）`);
  ok(a.hand.length === 1, `止啼：应摸一张牌（手牌 ${a.hand.length}）`);
  // 反例：同一回合第二张【杀】不再取消
  setHand(a, []);
  await g.useCard({ from: b, card: b.hand[0], targets: [a], reason: 'play', ignoreShaLimit: true });
  ok(logCount(g, '止啼') === 1, `止啼：每回合理应只触发一次（实际 ${logCount(g, '止啼')}）`);
  ok(a.hp === 3, `止啼：第二张【杀】应正常结算（hp ${a.hp}，期望 3）`);
}
// 止啼反例：不是自己的目标不触发
{
  const g = mk(['shen2_zhangliao', 'sunquan', 'caocao'], H({ seats: [2] }), 'identity');
  const [a, b, c] = g.players;
  setHand(b, [card('zt_3', 'sha')]);
  setHand(c, [card('zt_4', 'shan')]);
  await g.useCard({ from: b, card: b.hand[0], targets: [c], reason: 'play' });
  ok(!hasLog(g, '止啼'), '止啼：自己不成为目标时不应触发');
}

// ================= 3. 神太史慈 · 击虚 / 天义 =================
// 击虚正例：弃牌后对方手牌数小于自己 → 追加 1 点伤害
{
  const g = mk(['shen2_taishici', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, [card('jx_a1', 'sha'), card('jx_a2', 'tao')]);
  setHand(b, [card('jx_b1', 'shan')]);
  g.turnPlayer = a; g.turnCount = 3; g.phase = 'play';
  ok(g.activeSkillsOf(a).some(s => s.id === 'sn_jixu'), '击虚：应作为主动技出现');
  await g.useActiveSkill(a, 'sn_jixu');
  ok(b.hand.length === 0, `击虚：应弃置对方一张牌（剩 ${b.hand.length}）`);
  ok(b.hp === 3, `击虚：对方手牌数小于你应受到 1 点伤害（hp ${b.hp}，期望 3）`);
  ok(hasLog(g, '击虚'), '击虚：应有日志');
}
// 击虚反例：对方手牌数不少于你 → 只弃牌不造成伤害
{
  const g = mk(['shen2_taishici', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, [card('jx_c1', 'sha')]);
  setHand(b, [card('jx_c2', 'shan'), card('jx_c3', 'tao'), card('jx_c4', 'sha')]);
  g.turnPlayer = a; g.turnCount = 3; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_jixu');
  ok(b.hand.length === 2, `击虚：应只弃一张（剩 ${b.hand.length}，期望 2）`);
  ok(b.hp === 4, `击虚：对方手牌数不小于你时不应受伤（hp ${b.hp}，期望 4）`);
}
// 天义正例：拼点获胜 → 本回合【杀】伤害 +1
{
  const g = mk(['shen2_taishici', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, [card('ty_a', 'sha', 'spade', 13)]);
  setHand(b, [card('ty_b', 'tao', 'heart', 1)]);
  g.turnPlayer = a; g.turnCount = 4; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_tianyi');
  ok(a.flags.snTianyiTurn === 4, `天义：拼点获胜应记录回合（实际 ${a.flags.snTianyiTurn}）`);
  await g.damage({ from: a, to: b, amount: 1, nature: 'normal', card: card('ty_s', 'sha'), reason: 'sha' });
  ok(b.hp === 2, `天义：本回合【杀】伤害应 +1（hp ${b.hp}，期望 2）`);
  ok(hasLog(g, '天义'), '天义：应有日志');
}
// 天义反例：没赢 → 本回合不能使用【杀】
{
  const g = mk(['shen2_taishici', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, [card('ty_c', 'sha', 'spade', 1)]);
  setHand(b, [card('ty_d', 'tao', 'heart', 13)]);
  g.turnPlayer = a; g.turnCount = 5; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_tianyi');
  ok(a.flags.banShaTurn === 5, `天义：没赢应封【杀】（实际 ${a.flags.banShaTurn}）`);
  ok(!a.flags.snTianyiTurn, '天义：没赢不应获得伤害加成');
}

// ================= 4. 神荀彧 · 奇策 / 节命 =================
// 奇策正例：弃全部手牌当【无中生有】使用 → 摸两张
{
  const g = mk(['shen2_xunyu', 'sunquan'], H({ index: 0 }));
  const [a, b] = g.players;
  setHand(a, [card('qc_1', 'sha'), card('qc_2', 'tao')]);
  setHand(b, []);
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_qice');
  ok(a.hand.length === 2, `奇策：弃 2 张当【无中生有】后应摸 2 张（手牌 ${a.hand.length}）`);
  ok(g.discardPile.some(c => c.id === 'qc_1') && g.discardPile.some(c => c.id === 'qc_2'), '奇策：弃置的手牌应进弃牌堆');
  ok(hasLog(g, '奇策'), '奇策：应有日志');
}
// 奇策反例：没有手牌不能发动
{
  const g = mk(['shen2_xunyu', 'sunquan'], H());
  const [a] = g.players;
  setHand(a, []);
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_qice');
  ok(hasLog(g, '【奇策】：你没有手牌'), '奇策：无手牌时应给出提示且不崩溃');
}
// 节命正例：受伤后令一名角色补至体力上限
{
  const g = mk(['shen2_xunyu', 'sunquan'], H({ seats: [1] }));
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, []);
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(b.hand.length === b.maxHp, `节命：应补至体力上限（${b.hand.length}/${b.maxHp}）`);
  ok(hasLog(g, '节命'), '节命：应有日志');
}
// 节命反例：目标手牌已够 → 不摸牌
{
  const g = mk(['shen2_xunyu', 'sunquan'], H({ seats: [1] }));
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, [card('jm1', 'sha'), card('jm2', 'sha'), card('jm3', 'sha'), card('jm4', 'sha')]);
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(b.hand.length === 4, `节命：手牌已达上限时不应摸牌（手牌 ${b.hand.length}）`);
  ok(hasLog(g, '手牌已不少于体力上限'), '节命：应提示手牌已够');
}

// ================= 5. 神孙策 · 英魂 / 激昂 =================
// 英魂正例：已受伤 → 令一名其他角色摸 X 弃 1
{
  const g = mk(['shen2_sunce', 'sunquan'], H({ seats: [1], index: 0 }));
  const [a, b] = g.players;
  a.hp = 2;
  setHand(a, []);
  setHand(b, [card('yh_1', 'sha')]);
  await g.trigger('phase.begin', { self: a, phase: 'prepare' });
  ok(b.hand.length === 2, `英魂（X=2）：目标应摸 2 弃 1（手牌 ${b.hand.length}，期望 2）`);
  ok(hasLog(g, '英魂'), '英魂：应有日志');
}
// 英魂反例：未受伤不触发
{
  const g = mk(['shen2_sunce', 'sunquan'], H({ seats: [1] }));
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, [card('yh_2', 'sha')]);
  await g.trigger('phase.begin', { self: a, phase: 'prepare' });
  ok(b.hand.length === 1, `英魂：未受伤时不应触发（手牌 ${b.hand.length}，期望 1）`);
  ok(!hasLog(g, '英魂'), '英魂：未受伤时不应有日志');
}
// 激昂正例：成为【杀】的目标后摸一张；反例：非【杀】不触发
{
  const g = mk(['caocao', 'shen2_sunce'], H());
  const [a, b] = g.players;
  setHand(a, [card('jg_1', 'sha')]);
  setHand(b, [card('jg_2', 'sha')]);
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play' });
  ok(hasLog(g, '激昂'), '激昂：成为【杀】目标后应触发');
  ok(b.flags.snJinggeCard === 'jg_1', `激昂：应记录已结算的【杀】（实际 ${b.flags.snJinggeCard}）`);
}
{
  const g = mk(['caocao', 'shen2_sunce'], H());
  const [a, b] = g.players;
  setHand(a, [card('jg_3', 'guohe')]);
  setHand(b, [card('jg_4', 'sha')]);
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play' });
  ok(!hasLog(g, '激昂'), '激昂：非【杀】的牌不应触发');
}

// ================= 6. 神鲁肃 · 缔盟 / 好施 =================
// 缔盟正例：弃差额牌，令两名其他角色交换手牌
{
  const g = mk(['shen2_lusu', 'sunquan', 'caocao'], H({ seats: [1, 2] }), 'identity');
  const [a, b, c] = g.players;
  setHand(a, [card('dm_a1', 'sha'), card('dm_a2', 'tao')]);
  setHand(b, [card('dm_b1', 'sha'), card('dm_b2', 'sha'), card('dm_b3', 'sha')]);
  setHand(c, [card('dm_c1', 'shan')]);
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_dimeng');
  ok(a.hand.length === 0, `缔盟：应弃置 2 张差额牌（手牌 ${a.hand.length}）`);
  ok(b.hand.length === 1 && c.hand.length === 3, `缔盟：二者应交换手牌（${b.hand.length} / ${c.hand.length}，期望 1 / 3）`);
  ok(hasLog(g, '交换手牌'), '缔盟：应有交换手牌日志');
}
// 缔盟反例：手牌数相同无需交换；自己的牌不足以支付代价
{
  const g = mk(['shen2_lusu', 'sunquan', 'caocao'], H({ seats: [1, 2] }), 'identity');
  const [a, b, c] = g.players;
  setHand(a, [card('dm_d1', 'sha')]);
  setHand(b, [card('dm_e1', 'sha'), card('dm_e2', 'sha')]);
  setHand(c, [card('dm_f1', 'shan'), card('dm_f2', 'shan')]);
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_dimeng');
  ok(hasLog(g, '手牌数相同'), '缔盟：手牌数相同时应跳过');
  ok(b.hand.length === 2 && c.hand.length === 2, '缔盟：手牌数相同时不应交换');
}
{
  const g = mk(['shen2_lusu', 'sunquan', 'caocao'], H({ seats: [1, 2] }), 'identity');
  const [a, b, c] = g.players;
  setHand(a, []);
  setHand(b, [card('dm_g1', 'sha'), card('dm_g2', 'sha'), card('dm_g3', 'sha')]);
  setHand(c, []);
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_dimeng');
  ok(hasLog(g, '不足以支付'), '缔盟：牌不足时应拒绝发动');
  ok(b.hand.length === 3 && c.hand.length === 0, '缔盟：牌不足时不应交换');
}
// 好施正例：摸牌阶段多摸两张，阶段结束时弃半给手牌最少的角色；反例：不发动则不结算
{
  const g = mk(['shen2_lusu', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, []);
  g.turnPlayer = a; g.turnCount = 6;
  await g.trigger('phase.begin', { self: a, phase: 'draw' });
  ok(a.hand.length === 2, `好施：摸牌阶段应多摸两张（手牌 ${a.hand.length}，期望 2）`);
  setHand(a, [1, 2, 3, 4, 5, 6, 7].map(i => card(`hs${i}`, 'sha')));
  setHand(b, []);
  await g.trigger('phase.end', { self: a, phase: 'draw' });
  ok(a.hand.length === 4 && b.hand.length === 3, `好施：应交出一半（${a.hand.length}/${b.hand.length}，期望 4/3）`);
  ok(hasLog(g, '好施'), '好施：应有日志');
}
{
  const g = mk(['shen2_lusu', 'sunquan'], sayNo());
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, []);
  g.turnPlayer = a; g.turnCount = 6;
  await g.trigger('phase.begin', { self: a, phase: 'draw' });
  ok(a.hand.length === 0, `好施：拒绝时不应摸牌（手牌 ${a.hand.length}）`);
  setHand(a, [1, 2, 3, 4, 5, 6, 7].map(i => card(`hs9${i}`, 'sha')));
  await g.trigger('phase.end', { self: a, phase: 'draw' });
  ok(a.hand.length === 7 && b.hand.length === 0, '好施：拒绝发动时阶段结束不应交牌');
}

// ================= 7. 神黄忠 · 烈弓 / 穿云 =================
// 烈弓正例：目标手牌数不小于你的体力值 → 不可被【闪】响应
{
  const g = mk(['shen2_huangzhong', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, [card('lg_1', 'sha')]);
  setHand(b, [card('lg_s1', 'shan'), card('lg_s2', 'shan'), card('lg_s3', 'shan'), card('lg_s4', 'shan')]);
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play' });
  ok(b.hp === 3, `烈弓：满足条件时【杀】不可被【闪】响应（hp ${b.hp}，期望 3）`);
  ok(b.hand.length === 4, `烈弓：目标不应消耗【闪】（手牌 ${b.hand.length}）`);
  ok(hasLog(g, '烈弓'), '烈弓：应有日志');
}
// 烈弓反例：手牌数既不 ≥ 体力值也不 ≤ 攻击范围 → 可正常【闪】响应
{
  const g = mk(['shen2_huangzhong', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, [card('lg_2', 'sha')]);
  setHand(b, [card('lg_s5', 'shan', 'heart', 2), card('lg_s6', 'tao', 'heart', 3)]);
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play' });
  ok(b.hp === 4, `烈弓：不满足条件时目标可【闪】响应（hp ${b.hp}，期望 4）`);
  ok(!hasLog(g, '烈弓'), '烈弓：不满足条件时不应有日志');
}
// 穿云正例：自己的距离 -1 且【杀】伤害 +1；反例：其他角色的距离不受影响 / 目标手牌多则不加伤
{
  const g = mk(['shen2_huangzhong', 'sunquan', 'caocao', 'liubei'], H(), 'identity');
  const [a, b, c, d] = g.players;
  ok(g.distance(a, c) === 1, `穿云：自己计算距离应 -1（实际 ${g.distance(a, c)}，期望 1）`);
  ok(g.distance(c, a) === 2, `穿云：其他角色计算与你的距离不受影响（实际 ${g.distance(c, a)}，期望 2）`);
  ok(g.distance(b, d) === 2, `穿云：其他角色之间的距离不受影响（实际 ${g.distance(b, d)}，期望 2）`);
  setHand(a, [card('cy_a1', 'sha'), card('cy_a2', 'sha')]);
  setHand(b, [card('cy_b1', 'tao')]);
  await g.damage({ from: a, to: b, amount: 1, card: card('cy_s', 'sha'), reason: 'sha' });
  ok(b.hp === 2, `穿云：目标手牌数不大于你时【杀】伤害 +1（hp ${b.hp}，期望 2）`);
}
{
  const g = mk(['shen2_huangzhong', 'sunquan'], H(), 'identity');
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, [card('cy_c1', 'tao'), card('cy_c2', 'tao'), card('cy_c3', 'tao')]);
  await g.damage({ from: a, to: b, amount: 1, card: card('cy_s2', 'sha'), reason: 'sha' });
  ok(b.hp === 3, `穿云：目标手牌数大于你时不加伤（hp ${b.hp}，期望 3）`);
}

// ================= 8. 神庞统 · 涅槃 / 连环 =================
// 涅槃正例：濒死时弃所有牌、摸三张、体力回复至 3
{
  const g = mk(['shen2_pangtong', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, [card('np_1', 'sha'), card('np_2', 'tao')]);
  a.hp = 0;
  await g.trigger('dying.begin', { self: a, from: b });
  ok(a.hp === 3, `涅槃：体力应回复至 3（实际 ${a.hp}）`);
  ok(a.hand.length === 3, `涅槃：应弃所有牌后摸三张（手牌 ${a.hand.length}）`);
  ok(a.flags.snNiepanUsed === true, '涅槃：应标记为已发动（限定技）');
  // 反例：限定技只能发动一次
  const before = a.hp;
  await g.trigger('dying.begin', { self: a, from: b });
  ok(a.hp === before, '涅槃：限定技第二次濒死不应再生效');
}
// 连环正例：一张手牌当【铁索连环】使用 → 目标横置；反例：无手牌不能发动
{
  const g = mk(['shen2_pangtong', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, [card('lh_1', 'sha', 'club', 6)]);
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_lianhuan');
  ok(b.chained === true, '连环：目标应被横置（chained）');
  ok(a.hand.length === 0, `连环：作为【铁索连环】的手牌应离开手牌（剩 ${a.hand.length}）`);
  ok(hasLog(g, '铁索连环'), '连环：应有使用【铁索连环】的日志');
}
{
  const g = mk(['shen2_pangtong', 'sunquan'], H());
  const [a] = g.players;
  setHand(a, []);
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_lianhuan');
  ok(hasLog(g, '【连环】：你没有手牌'), '连环：无手牌时应提示且不崩溃');
}

// ================= 9. 神甄姬 · 倾国 / 洛神 =================
// 倾国正例：黑色手牌当【闪】打出；反例：只有红牌则无法响应
{
  const g = mk(['sunquan', 'shen2_zhenji'], H());
  const [b, a] = g.players;
  setHand(b, [card('qg_1', 'sha')]);
  setHand(a, [card('qg_2', 'sha', 'club', 9)]);
  await g.useCard({ from: b, card: b.hand[0], targets: [a], reason: 'play' });
  ok(a.hp === 3, `倾国：黑色手牌应可当【闪】打出（hp ${a.hp}，期望 3）`);
  ok(a.hand.length === 0, `倾国：作为【闪】的牌应离开手牌（剩 ${a.hand.length}）`);
  ok(hasLog(g, '倾国'), '倾国：应有日志');
}
{
  const g = mk(['sunquan', 'shen2_zhenji'], H());
  const [b, a] = g.players;
  setHand(b, [card('qg_3', 'sha')]);
  setHand(a, [card('qg_4', 'tao', 'heart', 4)]);
  await g.useCard({ from: b, card: b.hand[0], targets: [a], reason: 'play' });
  ok(a.hp === 2, `倾国：红色手牌不能当【闪】（hp ${a.hp}，期望 2）`);
  ok(a.hand.length === 1, '倾国：红色手牌应留在手里');
}
// 洛神正例：判定黑色获得并可重复（第一次同意、第二次拒绝）；反例：判定红色立即结束
{
  let n = 0;
  const g = mk(['shen2_zhenji', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') { n++; return { yes: n === 1 }; }
    return null;
  });
  const [a] = g.players;
  setHand(a, []);
  g.deck[g.deck.length - 1] = card('ls_black', 'sha', 'spade', 5);
  await g.trigger('phase.begin', { self: a, phase: 'prepare' });
  ok(a.hand.length === 1, `洛神：判定黑色应获得此牌（手牌 ${a.hand.length}）`);
  ok(hasLog(g, '洛神'), '洛神：应有日志');
}
{
  const g = mk(['shen2_zhenji', 'sunquan'], H());
  const [a] = g.players;
  setHand(a, []);
  g.deck[g.deck.length - 1] = card('ls_red', 'tao', 'heart', 6);
  await g.trigger('phase.begin', { self: a, phase: 'prepare' });
  ok(a.hand.length === 0, `洛神：判定红色不应获得牌（手牌 ${a.hand.length}）`);
  ok(hasLog(g, '判定为红色'), '洛神：判定红色应结束流程');
}

// ================= 10. 神典韦 · 强袭 / 古之恶来 =================
// 强袭正例①：弃武器牌支付代价；正例②：无武器则失去 1 点体力
{
  const g = mk(['shen2_dianwei', 'sunquan'], H({ index: 0 }));
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, []);
  a.equips.weapon = card('qx_w', 'qinglong');
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_qiangxi');
  ok(a.equips.weapon === null, '强袭：应弃置武器牌作为代价');
  ok(b.hp === 3, `强袭：应对目标造成 1 点伤害（hp ${b.hp}，期望 3）`);
  ok(hasLog(g, '强袭'), '强袭：应有日志');
}
{
  const g = mk(['shen2_dianwei', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, []);
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_qiangxi');
  ok(a.hp === 3, `强袭：无武器时应失去 1 点体力（hp ${a.hp}，期望 3）`);
  ok(b.hp === 3, `强袭：仍应对目标造成伤害（hp ${b.hp}，期望 3）`);
}
// 强袭反例：每个自己的回合限一次（第二次发动被拒绝，不再支付代价）
{
  const g = mk(['shen2_dianwei', 'sunquan'], H());
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, []);
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(a, 'sn_qiangxi');
  ok(a.hp === 3, `强袭：第一次发动应失去 1 点体力（hp ${a.hp}）`);
  await g.useActiveSkill(a, 'sn_qiangxi');
  ok(a.hp === 3, `强袭：同回合第二次发动应被拒绝（hp ${a.hp}，期望 3）`);
  ok(hasLog(g, '本回合已发动过'), '强袭：同回合第二次发动应提示已发动过');
  ok(!g.activeSkillsOf(a).some(s => s.id === 'sn_qiangxi'), '强袭：发动后本回合不再出现在主动技列表');
}
// 古之恶来正例：其他角色计算与你的距离 +1；你受伤后可弃伤害来源一张牌
{
  const g = mk(['shen2_dianwei', 'sunquan', 'caocao', 'liubei'], H(), 'identity');
  const [a, b, c, d] = g.players;
  ok(g.distance(b, a) === 2, `古之恶来：其他角色计算与你的距离应 +1（实际 ${g.distance(b, a)}）`);
  ok(g.distance(a, b) === 1, `古之恶来：你计算与其他角色的距离不受影响（实际 ${g.distance(a, b)}）`);
  setHand(b, [card('gz_1', 'sha'), card('gz_2', 'sha')]);
  setHand(a, []);
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(b.hand.length === 1, `古之恶来：受伤后可弃伤害来源一张牌（剩 ${b.hand.length}）`);
  ok(hasLog(g, '古之恶来'), '古之恶来：应有日志');
}
// 古之恶来反例：拒绝发动则对方手牌不变
{
  const g = mk(['shen2_dianwei', 'sunquan'], sayNo());
  const [a, b] = g.players;
  setHand(b, [card('gz_3', 'sha')]);
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(b.hand.length === 1, `古之恶来：拒绝时不应弃牌（剩 ${b.hand.length}）`);
}

// ================= 11. 神曹丕 · 放逐 / 行殇 =================
// 放逐正例：受伤后令一名其他角色摸 X 张并翻面；反例：拒绝则不结算
{
  const g = mk(['shen2_caopi', 'sunquan'], H({ seats: [1] }));
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, []);
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(b.hand.length === 1, `放逐：X=1 应摸 1 张（手牌 ${b.hand.length}）`);
  ok(b.flipped === true, '放逐：目标应翻面');
  ok(hasLog(g, '放逐'), '放逐：应有日志');
}
{
  const g = mk(['shen2_caopi', 'sunquan'], sayNo());
  const [a, b] = g.players;
  setHand(a, []);
  setHand(b, []);
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(b.hand.length === 0 && !b.flipped, '放逐：拒绝时不应摸牌也不翻面');
}
// 行殇正例：一名角色死亡时可获得其所有牌；反例：拒绝则牌进弃牌堆
{
  const g = mk(['shen2_caopi', 'sunquan', 'caocao'], H(), 'identity');
  const [a, b, c] = g.players;
  setHand(a, []);
  setHand(c, [card('xs_1', 'sha'), card('xs_2', 'tao')]);
  await g.die(c, { from: b });
  ok(a.hand.length === 2, `行殇：应获得死亡角色的所有牌（手牌 ${a.hand.length}，期望 2）`);
  ok(c.hand.length === 0, '行殇：死亡角色的手牌应被取走');
  ok(hasLog(g, '行殇'), '行殇：应有日志');
}
{
  const g = mk(['shen2_caopi', 'sunquan', 'caocao'], sayNo(), 'identity');
  const [a, b, c] = g.players;
  setHand(a, []);
  setHand(c, [card('xs_3', 'sha')]);
  await g.die(c, { from: b });
  ok(a.hand.length === 0, `行殇：拒绝时不应获得牌（手牌 ${a.hand.length}）`);
  ok(g.discardPile.some(x => x.id === 'xs_3'), '行殇：拒绝时牌应进入弃牌堆');
}

// ================= 结果 =================
console.log(`\n=== shen2check：${pass} 通过 / ${fail} 失败 ===`);
if (fail) {
  console.log('失败项：');
  for (const b of bad) console.log('  ✗', b);
  process.exit(1);
}
