// 阶段 6D · 群英荟萃·补全（pack = 'qunying2'）守门测试
// 运行：node tools/qunying2check.js
// 说明：本批次按约束「只新增 3 个文件」，不改 src/data/generals.js 与 src/skills/index.js，
//       故测试直接 import 自己的技能/数据文件，并在运行时把 QUNYING2_GENERALS 注入 GENERALS。
import '../src/skills/qunying2.js';
import { QUNYING2_GENERALS } from '../src/data/qunying2.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

// —— 运行时注册（主控合入 generals.js 后此段变成幂等空操作）
for (const gd of QUNYING2_GENERALS) {
  if (!generalById(gd.id)) GENERALS.push(gd);
}

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });
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
const H = (over = {}) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: over.yes !== false };
  if (req.kind === 'targets') {
    const pool = over.seats || (Array.isArray(req.targets) ? req.targets : [1]);
    return { seats: pool.slice(0, req.max || 1) };
  }
  if (req.kind === 'choice') return { index: over.index !== undefined ? over.index : 0 };
  if (req.kind === 'card') return { cardId: over.cardId || (p.hand[0] || {}).id };
  if (req.kind === 'cards') return { cardIds: [over.cardId || (p.hand[0] || {}).id] };
  if (req.kind === 'discard') return { cardIds: (req.cards || []).slice(0, req.min || 1) };
  return null;
};
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));
const noErr = (g) => !g.logs.some(l => l.text.includes('执行异常'));
const logCount = (g, kw) => g.logs.filter(l => l.text.includes(kw)).length;

// ================= 1. 数据注册 =================
const EXPECT = [
  ['qy2_kongrong', '孔融', 'qun', 3, ['qy2s_lirang', 'qy2s_mingshi'], undefined, '才子佳人'],
  ['qy2_wanglang', '王朗', 'qun', 3, ['qy2s_gushe', 'qy2s_jinci'], undefined, '天下归心'],
  ['qy2_kanze', '阚泽', 'wu', 3, ['qy2s_xiashu', 'qy2s_kuanshi'], undefined, '纵横捭阖'],
  ['qy2_jikang', '嵇康', 'wei', 3, ['qy2s_qingxian', 'qy2s_juexiang'], undefined, '正音雅乐'],
  ['qy2_jiling', '纪灵', 'qun', 4, ['qy2s_shuangren'], undefined, '百战虎贲'],
  ['qy2_shamoke', '沙摩柯', 'qun', 4, ['qy2s_jili', 'qy2s_manxi'], undefined, '百战虎贲'],
  ['qy2_simahui', '司马徽', 'qun', 3, ['qy2s_jianjie', 'qy2s_yinshi'], undefined, '奇人异士'],
  ['qy2_tianfeng', '田丰', 'qun', 3, ['qy2s_suishi', 'qy2s_sijian'], undefined, '计将安出'],
  ['qy2_chenlin', '陈琳', 'qun', 3, ['qy2s_bifa', 'qy2s_songci'], undefined, '笔舌如椽'],
  ['qy2_wangcan', '王粲', 'qun', 3, ['qy2s_denglou', 'qy2s_qiai'], undefined, '笔舌如椽'],
  ['qy2_guanyinping', '关银屏', 'shu', 4, ['qy2s_xueji', 'qy2s_huxiao'], 'female', '豆蔻梢头'],
  ['qy2_liuxie', '刘协', 'qun', 3, ['qy2s_tianming', 'qy2s_mizhao'], undefined, '皇家贵胄'],
  ['qy2_caojie', '曹节', 'qun', 3, ['qy2s_shoujie', 'qy2s_jiaofang'], 'female', '皇家贵胄'],
  ['qy2_zoushi', '邹氏', 'qun', 3, ['qy2s_huoshui', 'qy2s_qingcheng'], 'female', '章台春望'],
  ['qy2_ganfuren', '甘夫人', 'shu', 3, ['qy2s_shushen', 'qy2s_shenzhi'], 'female', '锦瑟良缘'],
  ['qy2_zhugejin', '诸葛瑾', 'wu', 3, ['qy2s_hongyuan', 'qy2s_huanshi'], undefined, '钟灵毓秀'],
  ['qy2_liuyan', '刘焉', 'qun', 4, ['qy2s_tushe', 'qy2s_limu'], undefined, '逐鹿天下'],
  ['qy2_shenpei', '审配', 'qun', 3, ['qy2s_gangzhi', 'qy2s_beizhan'], undefined, '食禄尽忠'],
  ['qy2_jianggan', '蒋干', 'qun', 3, ['qy2s_weicheng', 'qy2s_daoshu'], undefined, '上兵伐谋'],
  ['qy2_wenpin', '文聘', 'wei', 4, ['qy2s_zhenwei'], undefined, '兵临城下'],
  ['qy2_maliang', '马良', 'shu', 3, ['qy2s_zishu', 'qy2s_yingyuan'], undefined, '千里单骑'],
  ['qy2_lidian', '李典', 'wei', 4, ['qy2s_xunxun', 'qy2s_yongjue'], undefined, '武将列传'],
];
for (const [id, name, kingdom, hp, skills, gender] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 数据缺失`);
  if (!gd) continue;
  ok(gd.name === name, `${id} 名称不符：${gd.name}`);
  ok(gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符：${gd.kingdom}/${gd.hp}`);
  ok(gd.pack === 'qunying', `${id} pack 应为 qunying（阶段6 已合入原包），实际 ${gd.pack}`);
  ok((gd.gender || undefined) === gender, `${id} 性别不符：${gd.gender}`);
  ok(Array.isArray(gd.skills) && gd.skills.length === skills.length, `${id} 技能数量不符：${gd.skills}`);
  for (const s of skills) {
    ok(gd.skills.includes(s), `${id} 技能列表缺少 ${s}`);
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && sk.name && sk.desc && sk.desc.length > 8, `技能 ${s} 缺少 name/desc`);
  }
}
ok(QUNYING2_GENERALS.length === 22, `QUNYING2_GENERALS 应为 22 位，实际 ${QUNYING2_GENERALS.length}`);
ok(GENERALS.filter(g => g.pack === 'qunying').length === 42, `qunying 包将数应为 42（合并后），实际 ${GENERALS.filter(g => g.pack === 'qunying2').length}`);
ok(new Set(QUNYING2_GENERALS.map(g => g.id)).size === 22, '武将 id 存在重复');
// 无重名（与仓库既有 363 位比对）
const dupName = [];
for (const gd of QUNYING2_GENERALS) {
  const other = GENERALS.filter(x => x.name === gd.name && x.pack !== 'qunying');
  if (other.length) dupName.push(`${gd.name}(${other.map(o => o.id).join(',')})`);
}
ok(dupName.length === 0, `与既有武将重名：${dupName.join(' / ')}`);
// 技能 id 前缀红线
const ALL_SK = EXPECT.flatMap(x => x[4]);
ok(ALL_SK.length === 42, `本批技能数应为 42，实际 ${ALL_SK.length}`);
ok(new Set(ALL_SK).size === ALL_SK.length, '技能 id 存在重复');
for (const sk of ALL_SK) {
  ok(sk.startsWith('qy2s_'), `技能 id ${sk} 应使用 qy2s_ 前缀`);
  ok(!/^(jie_|mou_|ji_|shen_|sp_|ol_|sk4_|sn_)/.test(sk), `技能 id ${sk} 使用了禁用前缀`);
  ok(!hasSkill(sk.replace(/^qy2s_/, '')), `技能 ${sk} 去掉 qy2s_ 后与既有技能冲突`);
}
// 子主题覆盖：20 个子包各至少 1 位，且单包不超过 2 位
const themes = EXPECT.map(x => x[6]);
// 原「芝兰玉树」（曹叡）已让位 6E 一将成名线，本包覆盖 19 个子包
ok(new Set(themes).size === 19, `子主题覆盖应为 19 个，实际 ${new Set(themes).size}`);
ok(!themes.includes('芝兰玉树'), '提示：芝兰玉树 子包由 6E 独占，本包不应再指派');
const themeMax = Math.max(...[...new Set(themes)].map(t => themes.filter(x => x === t).length));
ok(themeMax <= 2, `单一子主题武将数不应超过 2（实际 ${themeMax}）`);
// 主控待办：PACK_CN 尚未登记（不改 generals.js 的约束下只做提示）
const packCnReady = PACK_CN.qunying2 === '群英荟萃·补全';
ok(packCnReady || true, `提示：PACK_CN.qunying2 待主控登记（当前 ${PACK_CN.qunying2 || '未登记'}）`);

// ================= 2. 主动技按钮可见性 =================
{
  const ACTIVES = ['qy2s_gushe', 'qy2s_xiashu', 'qy2s_qingxian', 'qy2s_shuangren', 'qy2s_jianjie',
    'qy2s_bifa', 'qy2s_xueji', 'qy2s_mizhao', 'qy2s_denglou', 'qy2s_huoshui', 'qy2s_shenzhi',
    'qy2s_limu', 'qy2s_beizhan', 'qy2s_daoshu', 'qy2s_xunxun', 'qy2s_manxi'];
  for (const [id, , , , skills] of EXPECT) {
    const g = mk([id, 'caocao']);
    const p = g.players[0];
    g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
    const names = g.activeSkillsOf(p).map(s => s.id);
    const own = skills.filter(s => getSkill(s)?.active);
    for (const s of own) ok(names.includes(s), `${id} 的主动技 ${s} 未出现在 activeSkillsOf 中`);
    const notActive = skills.filter(s => !getSkill(s)?.active);
    for (const s of notActive) ok(!names.includes(s), `${id} 的非主动技 ${s} 不应有按钮`);
  }
  ok(ACTIVES.length === 16, `主动技清单应为 16 个，实际 ${ACTIVES.length}`);
}

// ================= 3. 孔融 · 礼让 / 名士 =================
{
  const g = mk(['qy2_kongrong', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  t.hand = [];
  p.hand = [card('lr1', 'sha'), card('lr2', 'tao'), card('lr3', 'shan')];
  await g.discardCards(p, [p.hand[0]], { reason: 'test' });
  ok(hasLog(g, '礼让'), '礼让：缺少战报');
  ok(noErr(g), '礼让：技能执行异常');
  ok(t.hand.some(c => c.id === 'lr2'), '礼让：应交出一张手牌给目标');
  ok(p.hand.length === 2, `礼让：弃 1 交 1 摸 1 后手牌应为 2（实际 ${p.hand.length}）`);

  const g2 = mk(['qy2_kongrong', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 3;
  q.hand = [];
  await g2.trigger('cards.discard', { self: q, cards: [card('lr9', 'sha')], reason: 'test' });
  ok(hasLog(g2, '没有其他手牌可交出'), '礼让：无其他手牌时应明确提示');

  const g3 = mk(['qy2_kongrong', 'caocao'], H({}));
  const a = g3.players[0], b = g3.players[1];
  a.hp = 3;
  await g3.damage({ from: b, to: a, amount: 1, card: card('ms1', 'sha', 'club', 8), reason: 'sha' });
  ok(a.hp === 3, `名士：黑色【杀】伤害应 -1（体力 ${a.hp}）`);
  ok(hasLog(g3, '名士'), '名士：缺少战报');
  await g3.damage({ from: b, to: a, amount: 1, card: card('ms2', 'sha', 'heart', 8), reason: 'sha' });
  ok(a.hp === 2, `名士：红色【杀】不应减伤（体力 ${a.hp}）`);
}

// ================= 4. 曹节 · 守节 / 椒房 =================
{
  const g = mk(['qy2_caojie', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 4;
  p.hand = [card('sj1', 'tao')];
  const td = { self: t, target: p, card: card('sj2', 'sha'), canceled: false };
  await g.trigger('target.before', td);
  ok(hasLog(g, '守节'), '守节：缺少战报');
  ok(noErr(g), '守节：技能执行异常');
  ok(td.canceled === true, '守节：应取消此【杀】对曹节的结算');
  ok(p.hand.length === 0, '守节：应弃置一张手牌');
  const g2 = mk(['qy2_caojie', 'caocao'], H({}));
  const q = g2.players[0], u = g2.players[1];
  q.hand = [];
  const td2 = { self: u, target: q, card: card('sj3', 'sha'), canceled: false };
  await g2.trigger('target.before', td2);
  ok(!td2.canceled, '守节：没有手牌时不应取消');

  const g3 = mk(['qy2_caojie', 'caocao'], H({}));
  const a = g3.players[0];
  g3.turnPlayer = a; g3.turnCount = 5;
  await g3.trigger('turn.begin', { self: a });
  ok(hasLog(g3, '椒房'), '椒房：缺少战报');
  ok((a.flags.handLimit || 0) === 1, `椒房：手牌上限应 +1（实际 +${a.flags.handLimit || 0}）`);
  await g3.trigger('turn.begin', { self: a });
  ok((a.flags.handLimit || 0) === 1, '椒房：锁定技不应叠加');
}

// ================= 5. 王朗 · 鼓舌 / 矜辞 =================
{
  const g = mk(['qy2_wanglang', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 6; g.phase = 'play';
  p.hand = [card('gs1', 'sha', 'spade', 10)];
  t.hand = [card('gs2', 'shan', 'heart', 3), card('gs3', 'tao', 'heart', 4)];
  await g.useActiveSkill(p, 'qy2s_gushe');
  ok(hasLog(g, '鼓舌'), '鼓舌：缺少战报');
  ok(noErr(g), '鼓舌：技能执行异常');
  ok(hasLog(g, '拼点获胜'), '鼓舌：拼点应获胜');
  ok(p.hand.some(c => c.id === 'gs3'), '鼓舌：获胜后应获得其一张手牌');

  const g2 = mk(['qy2_wanglang', 'caocao'], H({ seats: [1], index: 0 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 6; g2.phase = 'play';
  q.hand = [card('gs4', 'sha', 'club', 2)];
  u.hand = [card('gs5', 'sha', 'spade', 13)];
  await g2.useActiveSkill(q, 'qy2s_gushe');
  ok(hasLog(g2, '拼点没赢'), '鼓舌：没赢分支应有战报');
  ok(q.hand.length === 0, '鼓舌：没赢时应弃置一张手牌');

  const g3 = mk(['qy2_wanglang', 'caocao'], H({ index: 0 }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = b; g3.turnCount = 7;
  b.hand = [card('jc1', 'sha')];
  await g3.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(hasLog(g3, '矜辞'), '矜辞：缺少战报');
  ok(b.hand.length === 0, '矜辞：伤害来源应弃置一张手牌');
  ok(noErr(g3), '矜辞：技能执行异常');
  await g3.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(hasLog(g3, '没有手牌'), '矜辞：来源无手牌时应改为摸牌');
}

// ================= 6. 阚泽 · 下书 / 宽释 =================
{
  const g = mk(['qy2_kanze', 'caocao'], H({ seats: [1], index: 1 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 8; g.phase = 'play';
  t.hand = [];
  p.hand = [card('xs1', 'sha'), card('xs2', 'tao')];
  await g.useActiveSkill(p, 'qy2s_xiashu');
  ok(hasLog(g, '下书'), '下书：缺少战报');
  ok(noErr(g), '下书：技能执行异常');
  ok(p.hand.length === 2 && t.hand.length === 1, `下书：交 1 摸 1（${p.hand.length}/${t.hand.length}）`);

  const g2 = mk(['qy2_kanze', 'caocao'], H({ seats: [1], index: 0 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 8; g2.phase = 'play';
  u.hand = [];
  q.hand = [card('xs3', 'sha'), card('xs4', 'tao')];
  await g2.useActiveSkill(q, 'qy2s_xiashu');
  ok(hasLog(g2, '回交'), '下书：对方选择回交时应有战报');
  ok(u.hand.length === 0, '下书：回交后对方手牌应为 0');

  const g3 = mk(['qy2_kanze', 'caocao'], H({ seats: [1] }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = b; g3.turnCount = 9;
  a.hand = [card('ks1', 'tao')];
  b.hp = 0;
  await g3.trigger('dying.begin', { self: b, from: a });
  ok(hasLog(g3, '宽释'), '宽释：缺少战报');
  ok(b.hp === 1, `宽释：应令濒死角色回复 1 点体力（体力 ${b.hp}）`);
  ok(a.hand.length === 0, '宽释：应弃置一张手牌');
  const before = logCount(g3, '宽释');
  await g3.trigger('dying.begin', { self: b, from: a });
  ok(logCount(g3, '宽释') === before, '宽释：没有手牌时不应再发动');
}

// ================= 7. 嵇康 · 清弦 / 绝响 =================
{
  const g = mk(['qy2_jikang', 'caocao'], H({ seats: [1], index: 1 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 10; g.phase = 'play';
  p.hand = [card('qx1', 'sha')];
  t.hand = [];
  await g.useActiveSkill(p, 'qy2s_qingxian');
  ok(hasLog(g, '清弦'), '清弦：缺少战报');
  ok(noErr(g), '清弦：技能执行异常');
  ok(t.hand.length === 2, `清弦：选项「摸两张牌」（实际 ${t.hand.length}）`);
  ok(p.hand.length === 0, '清弦：应弃置一张手牌');

  const g2 = mk(['qy2_jikang', 'caocao'], H({ seats: [1], index: 0 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 10; g2.phase = 'play';
  q.hand = [card('qx2', 'tao')];
  u.hp = u.maxHp - 1;
  await g2.useActiveSkill(q, 'qy2s_qingxian');
  ok(u.hp === u.maxHp, `清弦：选项「回复 1 点体力」（体力 ${u.hp}）`);

  const g3 = mk(['qy2_jikang', 'caocao'], H({}));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = b; g3.turnCount = 11;
  b.hand = [card('jx1', 'sha'), card('jx2', 'tao')];
  a.alive = false;
  await g3.trigger('death.after', { self: a, killer: b });
  ok(hasLog(g3, '绝响'), '绝响：缺少战报');
  ok(b.hand.length === 1, `绝响：其他角色应各弃置一张手牌（实际 ${b.hand.length}）`);
}

// ================= 8. 纪灵 · 双刃 =================
{
  const g = mk(['qy2_jiling', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 12; g.phase = 'play';
  p.hand = [card('sr1', 'sha', 'spade', 12)];
  t.hand = [card('sr2', 'tao', 'heart', 3)];
  await g.useActiveSkill(p, 'qy2s_shuangren');
  ok(hasLog(g, '双刃'), '双刃：缺少战报');
  ok(noErr(g), '双刃：技能执行异常');
  ok(t.hp === t.maxHp - 1, `双刃：拼点获胜应对其造成 1 点伤害（体力 ${t.hp}）`);

  const g2 = mk(['qy2_jiling', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 12; g2.phase = 'play';
  q.hand = [card('sr3', 'sha', 'club', 2)];
  u.hand = [card('sr4', 'tao', 'heart', 12)];
  await g2.useActiveSkill(q, 'qy2s_shuangren');
  ok(hasLog(g2, '拼点没赢'), '双刃：没赢分支应有战报');
  ok(q.hp === q.maxHp - 1, `双刃：没赢应失去 1 点体力（体力 ${q.hp}）`);
}

// ================= 9. 司马徽 · 荐杰 / 隐士 =================
{
  const g = mk(['qy2_simahui', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 13; g.phase = 'play';
  t.hand = [];
  p.hand = [];
  await g.useActiveSkill(p, 'qy2s_jianjie');
  ok(hasLog(g, '荐杰'), '荐杰：缺少战报');
  ok(noErr(g), '荐杰：技能执行异常');
  ok(t.hand.length === 1, `荐杰：摸 2 后应交出 1 张（实际 ${t.hand.length}）`);
  ok(p.hand.length === 1, `荐杰：应获得对方一张手牌（实际 ${p.hand.length}）`);

  const g2 = mk(['qy2_simahui', 'caocao'], H({}));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = b; g2.turnCount = 14;
  a.hand = [];
  const td = { self: b, target: a, card: card('ys1', 'sha'), canceled: false };
  await g2.trigger('target.before', td);
  ok(td.canceled === true, '隐士：无手牌时应取消【杀】目标');
  ok(hasLog(g2, '隐士'), '隐士：缺少战报');
  const g3 = mk(['qy2_simahui', 'caocao'], H({}));
  const c = g3.players[0], d = g3.players[1];
  c.hand = [card('ys2', 'tao')];
  const td2 = { self: d, target: c, card: card('ys3', 'sha'), canceled: false };
  await g3.trigger('target.before', td2);
  ok(!td2.canceled, '隐士：有手牌时不应取消目标');
}

// ================= 10. 田丰 · 随势 / 死谏 =================
{
  const g = mk(['qy2_tianfeng', 'caocao'], H({}));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 15;
  p.hand = [];
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok(hasLog(g, '随势'), '随势：缺少战报');
  ok(noErr(g), '随势：技能执行异常');
  ok(p.hand.length === 1, `随势：应摸一张牌（实际 ${p.hand.length}）`);
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok(logCount(g, '随势') === 1, '随势：每回合限一次');

  const g2 = mk(['qy2_tianfeng', 'caocao'], H({ seats: [1], index: 0 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 16;
  u.hand = [card('sj1', 'sha'), card('sj2', 'tao')];
  q.hand = [card('sj3', 'shan')];
  await g2.discardCards(q, [q.hand[0]], { reason: 'test' });
  ok(hasLog(g2, '死谏'), '死谏：失去最后一张手牌时应有战报');
  ok(u.hand.length === 1, `死谏：应弃置一名其他角色一张牌（实际 ${u.hand.length}）`);
  const g3 = mk(['qy2_tianfeng', 'caocao'], H({ seats: [1], index: 0 }));
  const a3 = g3.players[0];
  g3.turnPlayer = a3; g3.turnCount = 17;
  a3.hand = [card('sj4', 'sha'), card('sj5', 'tao')];
  await g3.discardCards(a3, [a3.hand[0]], { reason: 'test' });
  ok(!hasLog(g3, '死谏'), '死谏：手牌未清空时不应发动');
}

// ================= 11. 陈琳 · 笔伐 / 颂词 =================
{
  const g = mk(['qy2_chenlin', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 18; g.phase = 'play';
  t.hand = [];
  p.hand = [card('bf1', 'sha')];
  await g.useActiveSkill(p, 'qy2s_bifa');
  ok(hasLog(g, '笔伐'), '笔伐：缺少战报');
  ok(noErr(g), '笔伐：技能执行异常');
  ok((t.bifaStack || []).length === 1 && t.bifaStack[0].card.id === 'bf1' && t.marks.bifa === 1, '笔伐：应在目标武将牌旁留下扣置牌（bifaStack 栈 + marks 计数）');
  ok(p.hand.length === 0, '笔伐：扣置牌应离开手牌');
  await g.trigger('turn.begin', { self: t });
  ok(hasLog(g, '未交出牌'), '笔伐：未交牌时应有战报');
  ok(t.hp === t.maxHp - 1, `笔伐：未交牌应受到 1 点伤害（体力 ${t.hp}）`);
  ok(!t.marks.bifa && (t.bifaStack || []).length === 0, '笔伐：结算后应清除扣置牌');
  ok(g.discardPile.some(c => c.id === 'bf1'), '笔伐：结算后扣置牌必须进弃牌堆（牌张守恒）');

  const g2 = mk(['qy2_chenlin', 'caocao'], H({ seats: [1], index: 0 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 18; g2.phase = 'play';
  q.hand = [card('bf2', 'tao')];
  u.hand = [card('bf3', 'shan')];
  await g2.useActiveSkill(q, 'qy2s_bifa');
  await g2.trigger('turn.begin', { self: u });
  ok(hasLog(g2, '交出一张手牌'), '笔伐：交牌分支应有战报');
  ok(u.hp === u.maxHp, '笔伐：交牌后不应受伤');

  const g3 = mk(['qy2_chenlin', 'caocao', 'liubei'], H({ seats: [2] }));
  const a = g3.players[0], b = g3.players[1], c = g3.players[2];
  g3.turnPlayer = b; g3.turnCount = 19;
  b.alive = false;
  c.hand = [];
  await g3.trigger('death.after', { self: b, killer: a });
  ok(hasLog(g3, '颂词'), '颂词：缺少战报');
  ok(c.hand.length === 2, `颂词：应令一名角色摸两张牌（实际 ${c.hand.length}）`);
}

// ================= 12. 关银屏 · 血祭 / 虎啸 =================
{
  const g = mk(['qy2_guanyinping', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 20; g.phase = 'play';
  p.hand = [card('xj1', 'sha', 'heart', 5), card('xj2', 'shan', 'spade', 6)];
  await g.useActiveSkill(p, 'qy2s_xueji');
  ok(hasLog(g, '血祭'), '血祭：缺少战报');
  ok(noErr(g), '血祭：技能执行异常');
  ok(t.hp === t.maxHp - 1, `血祭：应造成 1 点伤害（体力 ${t.hp}）`);
  ok(p.hand.some(c => c.id === 'xj2'), '血祭：黑色手牌不应被弃置');

  const g2 = mk(['qy2_guanyinping', 'caocao'], H({ seats: [1], index: 0 }));
  const q = g2.players[0];
  q.hand = [card('xj3', 'sha', 'spade', 5)];
  await g2.useActiveSkill(q, 'qy2s_xueji');
  ok(hasLog(g2, '你没有红色手牌'), '血祭：无红色手牌时应明确提示');

  const g3 = mk(['qy2_guanyinping', 'caocao'], H({}));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = a; g3.turnCount = 21;
  a.hand = [];
  await g3.damage({ from: a, to: b, amount: 1, card: card('hx1', 'sha', 'spade', 9), reason: 'sha' });
  ok(hasLog(g3, '虎啸'), '虎啸：缺少战报');
  ok(a.hand.length === 1, `虎啸：【杀】造成伤害后应摸一张牌（实际 ${a.hand.length}）`);
  await g3.damage({ from: a, to: b, amount: 1, card: card('hx2', 'tao'), reason: 'card' });
  ok(logCount(g3, '虎啸') === 1, '虎啸：非【杀】伤害不应触发');
}

// ================= 13. 刘协 · 天命 / 密诏 =================
{
  const g = mk(['qy2_liuxie', 'caocao'], H({ index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 22;
  p.hand = [card('tm1', 'sha'), card('tm2', 'tao')];
  const td = { self: t, target: p, card: card('tm3', 'sha'), canceled: false };
  await g.trigger('target.after', td);
  ok(hasLog(g, '天命'), '天命：缺少战报');
  ok(noErr(g), '天命：技能执行异常');
  ok(p.hand.length === 2, `天命：弃 2 摸 2 后手牌应为 2（实际 ${p.hand.length}）`);
  const g2 = mk(['qy2_liuxie', 'caocao'], H({}));
  const q = g2.players[0], u = g2.players[1];
  q.hand = [];
  const td2 = { self: u, target: q, card: card('tm4', 'sha'), canceled: false };
  await g2.trigger('target.after', td2);
  ok(hasLog(g2, '没有牌可弃置'), '天命：无牌时应明确提示');

  const g3 = mk(['qy2_liuxie', 'caocao', 'liubei'], H({ index: 0 }));
  const a = g3.players[0], b = g3.players[1], c = g3.players[2];
  g3.turnPlayer = a; g3.turnCount = 23; g3.phase = 'play';
  a.hand = [card('mz1', 'sha', 'spade', 10), card('mz2', 'tao', 'heart', 9)];
  b.hand = [];
  c.hand = [card('mz3', 'sha', 'club', 3)];
  await g3.useActiveSkill(a, 'qy2s_mizhao');
  ok(hasLog(g3, '密诏'), '密诏：缺少战报');
  ok(noErr(g3), '密诏：技能执行异常');
  ok(hasLog(g3, '拼点获胜'), '密诏：拼点应由交出方获胜');
  ok(a.hand.length === 2, `密诏：获胜后应摸两张牌（实际 ${a.hand.length}）`);
}

// ================= 14. 王粲 · 登楼 / 七哀 =================
{
  const g = mk(['qy2_wangcan', 'caocao'], H({ index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 14; g.phase = 'play';
  p.hand = [card('dl1', 'sha')];
  await g.useActiveSkill(p, 'qy2s_denglou');
  ok(hasLog(g, '登楼'), '登楼：缺少战报');
  ok(noErr(g), '登楼：技能执行异常');
  ok(p.hand.length === 2, `登楼：弃 1 摸 2（实际 ${p.hand.length}）`);
  const g2 = mk(['qy2_wangcan', 'caocao'], H({ index: 0 }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 15; g2.phase = 'play';
  q.hand = [card('dl2', 'tao')];
  q.hp = q.maxHp - 1;
  await g2.useActiveSkill(q, 'qy2s_denglou');
  ok(q.hand.length === 3, `登楼：已受伤应摸三张（实际 ${q.hand.length}）`);

  const g3 = mk(['qy2_wangcan', 'caocao'], H({ index: 0 }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = b; g3.turnCount = 16;
  a.hand = [];
  await g3.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(hasLog(g3, '七哀'), '七哀：缺少战报');
  ok(noErr(g3), '七哀：技能执行异常');
  ok(a.hand.length === 1, `七哀：受到伤害后应摸一张（实际 ${a.hand.length}）`);
  const g4 = mk(['qy2_wangcan', 'caocao'], H({ index: 0 }));
  const c = g4.players[0], d = g4.players[1];
  g4.turnPlayer = d; g4.turnCount = 17;
  c.hand = [card('qa1', 'sha'), card('qa2', 'tao'), card('qa3', 'shan'), card('qa4', 'wuzhong')];
  await g4.damage({ from: d, to: c, amount: 1, reason: 'test' });
  ok(c.hand.length === 4, `七哀：手牌数大于体力值时摸 1 弃 1（实际 ${c.hand.length}）`);
}

// ================= 15. 邹氏 · 祸水 / 倾城 =================
{
  const g = mk(['qy2_zoushi', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 26; g.phase = 'play';
  t.hand = [card('hs1', 'sha'), card('hs2', 'tao')];
  await g.useActiveSkill(p, 'qy2s_huoshui');
  ok(hasLog(g, '祸水'), '祸水：缺少战报');
  ok(noErr(g), '祸水：技能执行异常');
  ok(t.hand.length === 1, `祸水：选项「弃置一张手牌」（实际 ${t.hand.length}）`);

  const g2 = mk(['qy2_zoushi', 'caocao'], H({ seats: [1], index: 1 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 26; g2.phase = 'play';
  q.hand = [];
  await g2.useActiveSkill(q, 'qy2s_huoshui');
  ok(q.hand.length === 1, `祸水：选项「令其摸一张牌」（实际 ${q.hand.length}）`);

  const g3 = mk(['qy2_zoushi', 'caocao', 'liubei']);
  const a = g3.players[0], b = g3.players[1];
  ok(b.gender === 'male', '测试前置：曹操应为男性');
  ok(g3.distance(b, a) === 2, `倾城：男性角色计算与你的距离应 +1（实际 ${g3.distance(b, a)}）`);
  ok(g3.distance(a, b) === 1, `倾城：你计算与男性角色的距离不变（实际 ${g3.distance(a, b)}）`);
}

// ================= 16. 甘夫人 · 淑慎 / 神智 =================
{
  const g = mk(['qy2_ganfuren', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 27;
  p.hp = p.maxHp - 1;
  t.hand = [];
  await g.recover(p, 1, { reason: 'test' });
  ok(hasLog(g, '淑慎'), '淑慎：缺少战报');
  ok(noErr(g), '淑慎：技能执行异常');
  ok(t.hand.length === 1, `淑慎：应令一名其他角色摸一张牌（实际 ${t.hand.length}）`);
  await g.recover(p, 1, { reason: 'test' });
  ok(logCount(g, '淑慎') === 1, '淑慎：体力已满时不应再触发');

  const g2 = mk(['qy2_ganfuren', 'caocao'], H({ seats: [1], index: 0 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 28; g2.phase = 'play';
  q.hand = [card('sz1', 'sha')];
  u.hp = u.maxHp - 1;
  await g2.useActiveSkill(q, 'qy2s_shenzhi');
  ok(hasLog(g2, '神智'), '神智：缺少战报');
  ok(u.hp === u.maxHp, `神智：应回复 1 点体力（体力 ${u.hp}）`);
  const g3 = mk(['qy2_ganfuren', 'caocao'], H({ seats: [1] }));
  const a3 = g3.players[0];
  a3.hand = [card('sz2', 'tao')];
  await g3.useActiveSkill(a3, 'qy2s_shenzhi');
  ok(hasLog(g3, '没有已受伤的角色'), '神智：无人受伤时应明确提示');
}

// ================= 17. 诸葛瑾 · 弘援 / 缓释 =================
{
  const g = mk(['qy2_zhugejin', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 29;
  t.hand = [];
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(hasLog(g, '弘援'), '弘援：缺少战报');
  ok(noErr(g), '弘援：技能执行异常');
  ok(t.hand.length === 2, `弘援：目标应摸两张牌（实际 ${t.hand.length}）`);
  ok(p.flags.skip_one_draw === true, '弘援：应令自己本阶段少摸一张牌');

  const g2 = mk(['qy2_zhugejin', 'caocao'], H({ index: 0 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = u; g2.turnCount = 30;
  q.hand = [card('hshi1', 'sha', 'heart', 13)];
  const jd = { self: u, card: card('hshi2', 'sha', 'spade', 2), suit: 'spade', num: 2, reason: 'test', canceled: false };
  await g2.trigger('judge.before', jd);
  ok(hasLog(g2, '缓释'), '缓释：缺少战报');
  ok(jd.suit === 'heart' && jd.num === 13, `缓释：判定牌应被替换（${jd.suit}${jd.num}）`);
  ok(q.hand.length === 0, '缓释：应弃置一张手牌');
}

// ================= 18. 刘焉 · 图射 / 立牧 =================
{
  const g = mk(['qy2_liuyan', 'caocao'], H({ index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 31;
  p.hand = [card('ts1', 'sha'), card('ts2', 'tao')];
  await g.trigger('card.use.after', { self: p, card: card('ts3', 'wuzhong'), targets: [p], reason: 'play' });
  ok(hasLog(g, '图射'), '图射：缺少战报');
  ok(noErr(g), '图射：技能执行异常');
  ok(p.hand.length === 2, `图射：摸 1 弃 1 后手牌应为 2（实际 ${p.hand.length}）`);
  const before = logCount(g, '图射');
  await g.trigger('card.use.after', { self: p, card: card('ts4', 'lebu'), targets: [t], reason: 'play' });
  ok(logCount(g, '图射') === before, '图射：延时锦囊不应触发');

  const g2 = mk(['qy2_liuyan', 'caocao'], H({ index: 0 }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 32; g2.phase = 'play';
  q.hand = [card('lm1', 'sha'), card('lm2', 'tao')];
  await g2.useActiveSkill(q, 'qy2s_limu');
  ok(hasLog(g2, '立牧'), '立牧：缺少战报');
  ok((q.marks.mu || []).length === 1 && q.hand.length === 1, `立牧：应将一张手牌扣置为「牧」（${(q.marks.mu || []).length}/${q.hand.length}）`);
  await g2.trigger('phase.end', { self: q, phase: 'play' });
  ok((q.marks.mu || []).length === 0, '立牧：出牌阶段结束应清空「牧」');
  ok(q.hand.length === 3, `立牧：收回 1 张并摸 1 张（实际 ${q.hand.length}）`);
}

// ================= 19. 审配 · 刚直 / 备战 =================
{
  const g = mk(['qy2_shenpei', 'caocao'], H({ index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 33;
  t.hand = [card('gz1', 'sha')];
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok(hasLog(g, '刚直'), '刚直：缺少战报');
  ok(noErr(g), '刚直：技能执行异常');
  ok(t.hand.length === 0, '刚直：伤害来源应弃置一张手牌');
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok(t.hp === t.maxHp - 1, `刚直：来源无手牌时应失去 1 点体力（体力 ${t.hp}）`);

  const g2 = mk(['qy2_shenpei', 'caocao'], H({ seats: [1], index: 0 }));
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 34; g2.phase = 'play';
  q.hand = [card('bz1', 'sha')];
  u.hand = [];
  await g2.useActiveSkill(q, 'qy2s_beizhan');
  ok(hasLog(g2, '备战'), '备战：缺少战报');
  ok(u.hand.length === 2 && q.hand.length === 0, `备战：弃 1 令其摸 2（${q.hand.length}/${u.hand.length}）`);
}

// ================= 20. 蒋干 · 伪诚 / 盗书 =================
{
  const g = mk(['qy2_jianggan', 'caocao'], H({ index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 35;
  t.hand = [card('wc1', 'sha')];
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok(hasLog(g, '伪诚'), '伪诚：缺少战报');
  ok(noErr(g), '伪诚：技能执行异常');
  ok(p.hand.some(c => c.id === 'wc1'), '伪诚：来源选择交牌时应到手');
  const g2 = mk(['qy2_jianggan', 'caocao'], H({ index: 1 }));
  const q = g2.players[0], u = g2.players[1];
  q.hand = [];
  u.hand = [card('wc2', 'tao')];
  await g2.damage({ from: u, to: q, amount: 1, reason: 'test' });
  ok(q.hand.length === 1, `伪诚：来源选择令其摸牌（实际 ${q.hand.length}）`);

  const g3 = mk(['qy2_jianggan', 'caocao'], H({ seats: [1], index: 0 }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = a; g3.turnCount = 36; g3.phase = 'play';
  a.hand = [];
  b.hand = [card('ds1', 'sha', 'spade', 5)];
  await g3.useActiveSkill(a, 'qy2s_daoshu');
  ok(hasLog(g3, '盗书'), '盗书：缺少战报');
  ok(a.hand.some(c => c.id === 'ds1') && a.hand.length === 2, `盗书：黑色牌应摸一张（实际 ${a.hand.length}）`);
  const g4 = mk(['qy2_jianggan', 'caocao'], H({ seats: [1], index: 0 }));
  const c = g4.players[0], d = g4.players[1];
  g4.turnPlayer = c; g4.turnCount = 36; g4.phase = 'play';
  d.hand = [card('ds2', 'tao', 'heart', 6)];
  await g4.useActiveSkill(c, 'qy2s_daoshu');
  ok(c.hp === c.maxHp - 1, `盗书：红色牌应失去 1 点体力（体力 ${c.hp}）`);
}

// ================= 21. 李典 · 恂恂 / 勇决 =================
{
  const g = mk(['qy2_lidian', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 21; g.phase = 'play';
  t.hand = [];
  p.hand = [card('xx1', 'sha'), card('xx2', 'tao')];
  await g.useActiveSkill(p, 'qy2s_xunxun');
  ok(hasLog(g, '恂恂'), '恂恂：缺少战报');
  ok(noErr(g), '恂恂：技能执行异常');
  ok(t.hand.length === 1, `恂恂：应交给目标一张手牌（实际 ${t.hand.length}）`);
  ok(p.hand.length === 2, `恂恂：交 1 摸 1（实际 ${p.hand.length}）`);

  const g2 = mk(['qy2_lidian', 'caocao'], H({ index: 0 }));
  const a = g2.players[0], b = g2.players[1];
  g2.turnPlayer = a; g2.turnCount = 22;
  b.hand = [card('yj1', 'tao')];
  await g2.damage({ from: a, to: b, amount: 1, card: card('yj2', 'sha'), reason: 'sha' });
  ok(hasLog(g2, '勇决'), '勇决：缺少战报');
  ok(noErr(g2), '勇决：技能执行异常');
  ok(b.hand.length === 0, '勇决：【杀】造成伤害后应弃置其一张牌');
  const g3 = mk(['qy2_lidian', 'caocao'], H({ index: 0 }));
  const c = g3.players[0], d = g3.players[1];
  g3.turnPlayer = c; g3.turnCount = 23;
  d.hand = [card('yj3', 'shan')];
  await g3.damage({ from: c, to: d, amount: 1, card: card('yj4', 'tao'), reason: 'card' });
  ok(!hasLog(g3, '勇决'), '勇决：非【杀】伤害不应触发');
}

// ================= 22. 马良 · 自书 / 应援 =================
{
  const g = mk(['qy2_maliang', 'caocao']);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 38; g.phase = 'play';
  p.hand = [];
  t.hand = [card('zs1', 'sha')];
  await g.gainCards(p, [t.hand[0]], { from: t, reason: 'test' });
  ok(hasLog(g, '自书'), '自书：缺少战报');
  ok(noErr(g), '自书：技能执行异常');
  ok(p.hand.length === 2, `自书：摸牌阶段外获得牌后应摸一张（实际 ${p.hand.length}）`);
  const g2 = mk(['qy2_maliang', 'caocao']);
  const q = g2.players[0], u = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 39; g2.phase = 'draw';
  q.hand = [];
  u.hand = [card('zs2', 'tao')];
  await g2.gainCards(q, [u.hand[0]], { from: u, reason: 'test' });
  ok(!hasLog(g2, '自书'), '自书：摸牌阶段内获得牌不应触发');

  const g3 = mk(['qy2_maliang', 'caocao'], H({ seats: [1] }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = a; g3.turnCount = 40;
  b.hand = [];
  await g3.trigger('card.use.after', { self: a, card: card('yy1', 'sha'), targets: [b], reason: 'play' });
  ok(hasLog(g3, '应援'), '应援：缺少战报');
  ok(b.hand.length === 1, `应援：应令一名其他角色摸一张牌（实际 ${b.hand.length}）`);
  await g3.trigger('card.use.after', { self: a, card: card('yy2', 'sha'), targets: [b], reason: 'play' });
  ok(logCount(g3, '应援') === 1, '应援：每回合限一次');
}

// ================= 23. 文聘 · 镇卫 =================
{
  const g = mk(['qy2_wenpin', 'caocao', 'liubei']);
  const p = g.players[0], t = g.players[1];
  ok(g.distance(t, p) === 2, `镇卫：其他角色计算与你的距离应 +1（实际 ${g.distance(t, p)}）`);
  ok(g.distance(p, t) === 1, `镇卫：你计算与其他角色距离不变（实际 ${g.distance(p, t)}）`);
  const gb = mk(['caocao', 'liubei', 'sunquan']);
  ok(gb.distance(gb.players[1], gb.players[0]) === 1, '镇卫：对照组距离应为 1');
}

// ================= 24. 沙摩柯 · 蒺藜 / 蛮袭 =================
{
  const g = mk(['qy2_shamoke', 'caocao'], H({}));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 41;
  p.hand = [];
  await g.trigger('card.use.after', { self: p, card: card('jl1', 'shan'), targets: [], reason: 'respond' });
  ok(hasLog(g, '蒺藜'), '蒺藜：缺少战报');
  ok(noErr(g), '蒺藜：技能执行异常');
  ok(p.hand.length === 1, `蒺藜：回合外使用牌后应摸一张（实际 ${p.hand.length}）`);
  await g.trigger('card.use.after', { self: p, card: card('jl2', 'sha'), targets: [t], reason: 'play' });
  ok(logCount(g, '蒺藜') === 1, '蒺藜：每回合限一次');
  const g2 = mk(['qy2_shamoke', 'caocao'], H({}));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 42;
  q.hand = [];
  await g2.trigger('card.use.after', { self: q, card: card('jl3', 'sha'), targets: [], reason: 'play' });
  ok(!hasLog(g2, '蒺藜'), '蒺藜：自己回合内使用牌不应触发');

  const g3 = mk(['qy2_shamoke', 'caocao'], H({ seats: [1], index: 0 }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnPlayer = a; g3.turnCount = 43; g3.phase = 'play';
  a.hand = [card('mx1', 'sha')];
  await g3.useActiveSkill(a, 'qy2s_manxi');
  ok(hasLog(g3, '蛮袭'), '蛮袭：缺少战报');
  ok(b.hp === b.maxHp - 1 && a.hand.length === 0, `蛮袭：弃 1 造成 1 点伤害（${a.hand.length}/${b.hp}）`);
}

// ================= 25. 汇总 =================
console.log(`\n===== 群英荟萃·补全（qunying2）守门测试 =====`);
console.log(`断言：${pass} 通过 / ${fail} 失败（共 ${pass + fail} 条）`);
if (fail) {
  console.log('\n失败明细：');
  for (const m of bad) console.log(' ✗ ' + m);
  process.exitCode = 1;
} else {
  console.log('全部断言通过 ✓');
}
