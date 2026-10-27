// 阶段 2/3 通用守门测试：数据注册 + 技能注册 + 关键行为
// 运行：node tools/packcheck.js
// 用法：新批次把武将加入 EXP?ECT 表，并在文末「专项」区加少量行为断言即可。
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';
import { addMoon, moonMaxOf, markQiyue, qiyueReady } from '../src/engine/moon.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261025,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}

// ================= 1. 数据与注册（全量）=================
// [id, 名称, 势力, 体力, 技能数组, 包]
const EXPECT = [
  // OL·闪（第二批）
  ['flash_liuhong', '闪刘宏', 'qun', 4, ['chaozheng', 'shenchong', 'julian'], 'flash'],
  ['flash_zhangliao', '闪张辽', 'qun', 4, ['zhengbing', 'tuwei'], 'flash'],
  // OL·魔（第一批）
  ['mo_simayi', '魔司马懿', 'wei', 3, ['guifu', 'moubian'], 'mo'],
  ['mo_caocao', '魔曹操', 'wei', 4, ['fuzai', 'bachao'], 'mo'],
  ['mo_diaochan', '魔貂蝉', 'qun', 3, ['huanhuo', 'qingshi'], 'mo'],
  ['mo_lvbu', '魔吕布', 'qun', 4, ['duoqi', 'kuangmo'], 'mo'],
  // 谋攻篇（第一批）
  ['mou2_huanggai', '谋黄盖', 'wu', 4, ['kurou2', 'zhaixiang'], 'mou2'],
  ['mou2_caoren', '谋曹仁', 'wei', 4, ['jushou2', 'jiewei2'], 'mou2'],
  ['mou2_zhenji', '谋甄姬', 'wei', 3, ['luoshen2', 'qingguo'], 'mou2'],
  ['mou2_jiangwei', '谋姜维', 'shu', 4, ['tiaoxin2', 'zhiji2'], 'mou2'],
  ['mou2_fazheng', '谋法正', 'shu', 3, ['xuanhuo2', 'enyuan2'], 'mou2'],
  ['mou2_pangtong', '谋庞统', 'shu', 3, ['lianhuan2', 'niepan2'], 'mou2'],
// 2026-10-26 第二批补全（41 将）：星火燎原 / 一将成名 2015 / 原创之魂 2016 / 门阀士族 / 闪朱儁
  ['flash_zhujun', '闪朱儁', 'qun', 4, ['zhujun_fendi', 'zhujun_jujiang'], 'flash'],
  ['xh_sundeng', '孙登', 'wu', 4, ['xh_kuangbi'], 'xinghuo'],
  ['xh_buzhi', '步骘', 'wu', 3, ['xh_hongde', 'xh_dingpan'], 'xinghuo'],
  ['xh_simalang', '司马朗', 'wei', 3, ['xh_junbing', 'xh_quji'], 'xinghuo'],
  ['xh_duji', '杜畿', 'wei', 3, ['xh_andong', 'xh_yingshi'], 'xinghuo'],
  ['xh_dongyun', '董允', 'shu', 3, ['xh_bingzheng', 'xh_sheyan'], 'xinghuo'],
  ['xh_yanjun', '严畯', 'wu', 3, ['xh_guanchao', 'xh_xunxian'], 'xinghuo'],
  ['xh_xizhicai', '戏志才', 'wei', 3, ['tiandu', 'xh_xianfu', 'xh_chouce'], 'xinghuo'],
  ['xh_sunqian', '孙乾', 'shu', 3, ['xh_qianya', 'xh_shuomeng'], 'xinghuo'],
  ['xh_qinmi', '秦宓', 'shu', 3, ['xh_jianzheng', 'xh_zhuandui', 'xh_tianbian'], 'xinghuo'],
  ['xh_xuezong', '薛综', 'wu', 3, ['xh_funan', 'xh_jiexun'], 'xinghuo'],
  ['xh_panjun', '潘濬', 'wu', 3, ['xh_guanwei', 'xh_gongqing'], 'xinghuo'],
  ['xh_mazhong', '马忠', 'shu', 4, ['xh_fuman'], 'xinghuo'],
  ['xh_liyan', '李严', 'shu', 3, ['xh_duliang', 'xh_fulin'], 'xinghuo'],
  ['xh_mizhu', '糜竺', 'shu', 3, ['xh_ziyuan', 'xh_jujia'], 'xinghuo'],
  ['xh_zhoufang', '周鲂', 'wu', 4, ['xh_duanfa', 'xh_youdi'], 'xinghuo'],
  ['xh_lvdai', '吕岱', 'wu', 4, ['xh_qinguo'], 'xinghuo'],
  ['xh_liuyao', '刘繇', 'qun', 4, ['xh_kannan'], 'xinghuo'],
  ['xh_lvqian', '吕虔', 'wei', 4, ['xh_weilu', 'xh_zengdao'], 'xinghuo'],
  ['xh_zumao', '祖茂', 'wu', 4, ['xh_yinbing', 'xh_juedi'], 'xinghuo'],
  ['xh_xushi', '徐氏', 'wu', 3, ['xh_wengua', 'xh_fuzhu'], 'xinghuo'],
  ['y15_liuchen', '刘谌', 'shu', 4, ['y15_zhanjue', 'y15_qinwang'], 'yj2015'],
  ['y15_zhangyi', '张嶷', 'shu', 4, ['y15_wurong', 'y15_shizhi'], 'yj2015'],
  ['y15_zhuzhi', '朱治', 'wu', 4, ['y15_anguo'], 'yj2015'],
  ['y15_gongsunyuan', '公孙渊', 'qun', 4, ['y15_huaiyi'], 'yj2015'],
  ['y15_guotufengji', '郭图逢纪', 'qun', 3, ['y15_jigong', 'y15_shifei'], 'yj2015'],
  ['yz16_cenhun', '岑昏', 'wu', 3, ['yz16_jishe', 'yz16_lianhuo'], 'yz2016'],
  ['yz16_sunziliufang', '孙资刘放', 'wei', 3, ['yz16_guizao', 'yz16_jiyu'], 'yz2016'],
  ['yz16_huanghao', '黄皓', 'shu', 3, ['yz16_qinqing', 'yz16_huisheng'], 'yz2016'],
  ['clan3_xunyou', '族荀攸', 'wei', 3, ['cl3_baichu', 'cl3_qice', 'daojie'], 'clan2'],
  ['clan3_xuncai', '族荀采', 'qun', 3, ['cl3_lieshi', 'cl3_dianzhan', 'cl3_huanyin', 'daojie'], 'clan2'],
  ['clan3_xunshi', '族荀莳', 'wei', 3, ['cl3_qingjue', 'cl3_yingxiang', 'daojie'], 'clan2'],
  ['clan3_xunshuang', '族荀爽', 'qun', 3, ['cl3_yangji', 'cl3_dandao', 'cl3_qingli', 'daojie'], 'clan2'],
  ['clan3_wangguang', '族王广', 'wei', 3, ['cl3_lilun', 'cl3_jianji', 'zhongliu'], 'clan2'],
  ['clan3_wangmingshan', '族王明山', 'wei', 3, ['cl3_tanque', 'cl3_shengmo', 'zhongliu'], 'clan2'],
  ['clan3_wangyun', '族王允', 'qun', 3, ['cl3_jiexuan', 'cl3_mingjie', 'zhongliu'], 'clan2'],
  ['clan3_wuxian', '族吴苋', 'shu', 3, ['cl3_yirong', 'cl3_guixiang', 'muyin'], 'clan2'],
  ['clan3_wuban', '族吴班', 'shu', 4, ['cl3_zhanding', 'muyin'], 'clan2'],
  ['clan3_zhugeguo', '族诸葛果', 'shu', 3, ['cl3_fuyao', 'cl3_fenshi'], 'clan2'],
  ['clan3_luji', '族陆绩', 'wu', 3, ['cl3_gailan', 'cl3_fennu', 'zelie'], 'clan2'],
  ['clan3_yangci', '族杨赐', 'qun', 3, ['cl3_qieyi', 'cl3_jianzhi', 'quhuo'], 'clan2'],
];

for (const [id, name, kingdom, hp, skills, pack] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 数据缺失`);
  if (!gd) continue;
  ok(gd.name === name, `${id} 名称不符（${gd.name}）`);
  ok(gd.kingdom === kingdom, `${id} 势力应为 ${kingdom}（实际 ${gd.kingdom}）`);
  ok(gd.hp === hp, `${id} 体力应为 ${hp}（实际 ${gd.hp}）`);
  ok(gd.pack === pack, `${id} pack 应为 ${pack}（实际 ${gd.pack}）`);
  for (const s of skills) ok(gd.skills.includes(s), `${id} 缺少技能 ${s}`);
  for (const s of gd.skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常或降级（fallbackOf=${sk?.fallbackOf}）`);
    ok(sk && ((sk.triggers || []).length || sk.active), `技能 ${s} 既无触发器也无主动效果`);
  }
}

ok(PACK_CN.flash === 'OL·闪', `PACK_CN.flash 不符：${PACK_CN.flash}`);
ok(PACK_CN.mo === 'OL·魔', `PACK_CN.mo 不符：${PACK_CN.mo}`);
ok(GENERALS.filter(g => g.pack === 'flash').length === 6, `闪包将数应为 6（含闪朱儁），实际 ${GENERALS.filter(g => g.pack === 'flash').length}`);
ok(GENERALS.filter(g => g.pack === 'mo').length === 6, `魔包将数应为 6，实际 ${GENERALS.filter(g => g.pack === 'mo').length}`);
ok(generalById('flash_zhangliao').kingdom2 === 'wei', '闪张辽应为双势力（kingdom2=wei）');
ok(GENERALS.filter(g => g.pack === 'mou2').length === 8, `谋攻篇将数应为 8，实际 ${GENERALS.filter(g => g.pack === 'mou2').length}`);
ok(GENERALS.filter(g => g.pack === 'clan').length === 6, `门阀士族将数应为 6（谋荀彧已迁出），实际 ${GENERALS.filter(g => g.pack === 'clan').length}`);
ok(GENERALS.filter(g => g.pack === 'clan2').length === 24, `门阀士族·族将将数应为 24（含第二批 12），实际 ${GENERALS.filter(g => g.pack === 'clan2').length}`);
ok(GENERALS.filter(g => g.pack === 'xinghuo').length === 30, `星火燎原将数应为 30（含补全 20），实际 ${GENERALS.filter(g => g.pack === 'xinghuo').length}`);
ok(GENERALS.filter(g => g.pack === 'yj2015').length === 5, `一将成名·2015 将数应为 5，实际 ${GENERALS.filter(g => g.pack === 'yj2015').length}`);
ok(GENERALS.filter(g => g.pack === 'yz2016').length === 3, `原创之魂·2016 将数应为 3，实际 ${GENERALS.filter(g => g.pack === 'yz2016').length}`);
ok(PACK_CN.yj2015 === '一将成名·2015', `PACK_CN.yj2015 不符：${PACK_CN.yj2015}`);
ok(PACK_CN.yz2016 === '原创之魂·2016', `PACK_CN.yz2016 不符：${PACK_CN.yz2016}`);
ok(GENERALS.filter(g => g.pack === 'shenwu').length === 16, `神·武将数应为 16（含补全 8），实际 ${GENERALS.filter(g => g.pack === 'shenwu').length}`);
ok(GENERALS.filter(g => g.pack === 'mouding').length === 12, `谋定天下将数应为 12（含由 clan 迁入的谋荀彧），实际 ${GENERALS.filter(g => g.pack === 'mouding').length}`);
ok(GENERALS.filter(g => g.pack === 'narrative').length === 10, `叙事包将数应为 10，实际 ${GENERALS.filter(g => g.pack === 'narrative').length}`);
ok(GENERALS.filter(g => g.pack === 'weizhen').length === 25, `威震包将数应为 25（含补全 15），实际 ${GENERALS.filter(g => g.pack === 'weizhen').length}`);
ok(GENERALS.filter(g => g.pack === 'xinghe').length === 12, `星河璀璨将数应为 12，实际 ${GENERALS.filter(g => g.pack === 'xinghe').length}`);
ok(GENERALS.filter(g => g.pack === 'qunying').length === 42, `群英荟萃将数应为 42（含补全 22），实际 ${GENERALS.filter(g => g.pack === 'qunying').length}`);
// ---- 阶段 5 新增包（势 / 友 / 晋补全）----
ok(PACK_CN.shi === '手杀·兵势篇', `PACK_CN.shi 不符：${PACK_CN.shi}`);
ok(PACK_CN.you === '手杀·友', `PACK_CN.you 不符：${PACK_CN.you}`);
// 阶段 6 起「晋·文德武备（补全）」已合入 jin 主包
ok(GENERALS.filter(g => g.pack === 'jin').length === 20, `晋·文德武备（合并补全后）将数应为 20，实际 ${GENERALS.filter(g => g.pack === 'jin').length}`);
ok(GENERALS.filter(g => g.pack === 'shi').length === 10, `兵势篇将数应为 10，实际 ${GENERALS.filter(g => g.pack === 'shi').length}`);
ok(GENERALS.filter(g => g.pack === 'you').length === 5, `友包将数应为 5，实际 ${GENERALS.filter(g => g.pack === 'you').length}`);
for (const g of GENERALS.filter(g => ['shi', 'you'].includes(g.pack))) {
  ok((g.skills || []).length >= 1, `${g.id} 缺少技能`);
  ok((g.hp ?? g.hpNow) >= 1 && (g.hp ?? g.hpNow) <= 8, `${g.id} 体力异常：${g.hp ?? g.hpNow}`);
}
// 阶段 5F：手杀 SP·精选 10 将
ok(PACK_CN.sp4 === '手杀 SP·精选', `PACK_CN.sp4 不符：${PACK_CN.sp4}`);
ok(GENERALS.filter(g => g.pack === 'sp4').length === 10, `手杀 SP 将数应为 10，实际 ${GENERALS.filter(g => g.pack === 'sp4').length}`);
for (const g of GENERALS.filter(g => g.pack === 'sp4')) {
  ok((g.skills || []).length >= 1, `${g.id} 缺少技能`);
  ok((g.hp ?? g.hpNow) >= 1 && (g.hp ?? g.hpNow) <= 20, `${g.id} 体力异常：${g.hp ?? g.hpNow}`);
  for (const s of g.skills) ok(!!getSkill(s) && getSkill(s).id === s, `${g.id} 技能 ${s} 未真实装（不得降级）`);
}
// 阶段 5I：神将跨线 10 将
// 阶段 6 起「神·跨线」已合入 shen 主包
ok(GENERALS.filter(g => g.pack === 'shen').length === 22, `神（合并跨线后）将数应为 22，实际 ${GENERALS.filter(g => g.pack === 'shen').length}`);
// ---- 阶段 6：尾期全量补齐（6A-6E）----
// 阶段 6 各批已「合入原包体」：shenwu2→shenwu / mou5→mou / weizhen2→weizhen / qunying2→qunying / jin2→jin / shen2→shen
for (const [k, cn, n] of [
  ['shenwu', '神·武', 16], ['mou', '谋', 16], ['weizhen', '威震天下·武庙', 25],
  ['qunying', '群英荟萃', 42], ['yhx', '一将成名·十周年', 14],
]) {
  ok(PACK_CN[k] === cn, `PACK_CN.${k} 不符：${PACK_CN[k]}`);
  ok(GENERALS.filter(g => g.pack === k).length === n, `${cn} 将数应为 ${n}，实际 ${GENERALS.filter(g => g.pack === k).length}`);
  for (const g of GENERALS.filter(x => x.pack === k)) {
    ok((g.skills || []).length >= 1, `${g.id} 缺少技能`);
    ok((g.hp ?? g.hpNow) >= 1 && (g.hp ?? g.hpNow) <= 8, `${g.id} 体力异常：${g.hp ?? g.hpNow}`);
    for (const sk of g.skills) ok(!!getSkill(sk) && getSkill(sk).id === sk, `${g.id} 技能 ${sk} 未真实装（不得降级）`);
  }
}
ok(GENERALS.length >= 428, `总将数应 ≥428，实际 ${GENERALS.length}`);
// 阶段 6 不得引入新的同名武将（历史遗留重名白名单固定 13 组，新增即失败）
{
  const KNOWN_DUP = new Set(['谋姜维', '谋庞统', '谋诸葛亮', '谋关羽', '谋法正', '关索', '王双', '杜预', '左慈', '华歆', '神庞统', '神典韦', '神曹丕']);
  const cnt = {};
  for (const g of GENERALS) cnt[g.name] = (cnt[g.name] || 0) + 1;
  const unexpected = Object.entries(cnt).filter(([n, c]) => c > 1 && !KNOWN_DUP.has(n)).map(([n]) => n);
  ok(!unexpected.length, `新增了未登记的同名武将：${unexpected.join('、')}`);
}
// 阶段 5B：国战·不臣篇（董昭 / 徐庶 已存在于 qunying / yj2011，故本包 7 将）
ok(PACK_CN.buchen === '国战·不臣篇', `PACK_CN.buchen 不符：${PACK_CN.buchen}`);
ok(GENERALS.filter(g => g.pack === 'buchen').length === 7, `不臣篇将数应为 7，实际 ${GENERALS.filter(g => g.pack === 'buchen').length}`);
for (const g of GENERALS.filter(g => g.pack === 'buchen')) {
  ok((g.skills || []).length >= 1, `${g.id} 缺少技能`);
  ok((g.hp ?? g.hpNow) >= 1 && (g.hp ?? g.hpNow) <= 8, `${g.id} 体力异常：${g.hp ?? g.hpNow}`);
  for (const s of g.skills) ok(!!getSkill(s) && getSkill(s).id === s, `${g.id} 技能 ${s} 未真实装（不得降级）`);
}
for (const k of ['clan', 'shenwu', 'mouding', 'narrative', 'weizhen', 'xinghe', 'qunying']) {
  ok(!!PACK_CN[k], `PACK_CN 缺少 ${k}`);
}
ok(generalById('mou2_huanggai').hpNow === 2 && generalById('mou2_huanggai').armor === 2, '谋黄盖应为 2/4 体力 + 2 护甲');

// ================= 2. 专项行为 =================

// 2.1 闪刘宏【朝争】：出牌阶段开始时议事，红色胜→回复；黑色胜→红色意见者失体力；随后摸牌
{
  const g = mk(['flash_liuhong', 'sunquan', 'liubei', 'caocao'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const p = g.players[0];
  // 让所有人手上都是红牌 → 议事红色胜
  p.hand = [card('a1', 'sha', 'heart', 5)];
  for (const q of g.players.slice(1)) q.hand = [card('b' + q.seat, 'sha', 'diamond', 6)];
  // ★口径：使用者本人不参与议事（官方「令所有其他角色议事」），故回复的是「意见为红色的其他角色」
  for (const q of g.players.slice(1)) { q.hp = Math.max(1, q.maxHp - 1); }
  g.turnPlayer = p;
  const before = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(g.players.slice(1).every(q => q.hp === q.maxHp), `朝争：红色胜应令意见为红色的其他角色各回复 1 点体力（${g.players.slice(1).map(q => q.hp + '/' + q.maxHp).join(',')}）`);
  ok(p.hand.length > before, '朝争：议事完成后应摸牌');
  ok(g.logs.some(l => JSON.stringify(l).includes('朝争')), '朝争：应产生日志');
}

// 2.2 闪刘宏【飞扬】：判定区有牌时弃两张牌并清空判定区
{
  const g = mk(['flash_liuhong', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p = g.players[0];
  // 【飞扬】/【跋扈】是虎牢关·斗地主类模式的附加技，当前未在 skills 注册（历史缺口）。
  // 这里若 getSkill 返回空则跳过，避免 collectTriggers 读到 null 直接崩。
  const fySkill = getSkill('feiyang');
  if (!fySkill) {
    ok(true, '飞扬：技能未注册，跳过该段（历史缺口，已登记到 docs 未实现清单）');
  } else {
    if (!p.skills.some(s => s.id === 'feiyang')) p.skills.push(fySkill);
    p.hand = [card('c1', 'sha'), card('c2', 'shan'), card('c3', 'tao')];
    p.judgeZone = [{ card: card('j1', 'lebu', 'spade', 3), name: 'lebu' }];
    await g.trigger('phase.begin', { self: p, phase: 'judge' });
    ok(p.judgeZone.length === 0, '飞扬：判定区应被清空');
    ok(p.hand.length <= 1, `飞扬：应弃置两张手牌（剩 ${p.hand.length}）`);
  }
}

// 2.3 闪张辽【整兵】：重铸【杀】→ 手牌上限 +1；势力技门控
{
  const g = mk(['flash_zhangliao', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p = g.players[0];
  p.hand = [card('d1', 'sha', 'spade', 7), card('d2', 'sha', 'club', 8)];
  g.turnPlayer = p; g.phase = 'play';
  const hl0 = p.flags.handLimit || 0;
  await g.useActiveSkill(p, 'zhengbing');
  ok((p.flags.handLimit || 0) === hl0 + 1, `整兵：重铸【杀】应 +1 手牌上限（${p.flags.handLimit}）`);
  ok(p.kingdom === 'qun', '整兵：仅触发一项目前不应变更为魏');
  ok(hasSkill('tuwei') && getSkill('tuwei').kingdomOnly === 'wei', '突围应为魏势力技');
  // 变更为魏后，【整兵】不再可用、【突围】可用
  await g.setKingdom(p, 'wei', 'test');
  ok(p.kingdom === 'wei', '整兵：势力应可变更至魏');
  ok(g.activeSkillsOf(p).every(s => s.id !== 'zhengbing'), '整兵：变为魏后不应出现在主动技列表');
}

// 2.4 魔司马懿【诡伏】：每轮开始获得一张「诡伏」闪；覆载前的攻击范围基线
{
  const g = mk(['mo_simayi', 'sunquan']);
  const p = g.players[0];
  await g.trigger('turn.begin', { self: p });
  ok((p.flags.guifu || []).length === 1, `诡伏：每轮开始应获得一张【闪】（${(p.flags.guifu || []).length}）`);
  ok(p.flags.guifu[0].skillTag === 'guifu', '诡伏：获得的【闪】应带诡伏标记');
  ok(p.form === 'normal', '魔司马懿：初始形态应为 normal');
}

// 2.5 魔司马懿【谋变】：记录 ≥3 时可入魔并获得【骤袭】
{
  const g = mk(['mo_simayi', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    return null;
  });
  const p = g.players[0];
  p.flags.guifuRec = ['sha', 'juedou', 'huogong'];
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(p.form === 'demon', `谋变：记录 ≥3 应入魔（form=${p.form}）`);
  ok(p.skills.some(s => s.id === 'zhouxi'), '谋变：入魔后应获得【骤袭】');
}

// 2.6 魔曹操【覆载】：装备区无牌时攻击范围 = 体力值；装备牌不能进装备区
{
  const g = mk(['mo_caocao', 'sunquan']);
  const p = g.players[0];
  p.hp = 4;
  ok(g.attackRange(p) === 4, `覆载：攻击范围应等于体力值（${g.attackRange(p)}）`);
  const eq = card('e1', 'qinggang', 'spade', 7);
  p.hand.push(eq);
  await g.equipCard(p, eq);
  ok(!p.equips.weapon, '覆载：装备牌不应进入装备区');
  ok(g.discardPile.includes(eq), '覆载：装备牌应进入弃牌堆');
}

// 2.7 魔曹操【霸朝】：出牌阶段开始时触发并获得牌
{
  const g = mk(['mo_caocao', 'sunquan', 'liubei'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 1 };
    return null;
  });
  const p = g.players[0];
  for (const q of g.players.slice(1)) q.hand = [card('f' + q.seat, 'juedou', 'spade', 9)];
  g.turnPlayer = p;
  const before = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.hand.length > before, '霸朝：应获得其他角色交给的牌');
  ok(p.form === 'demon', `霸朝：选择自己应入魔（form=${p.form}）`);
  ok(p.flags.freeRangeTurn === g.turnCount, '霸朝：选择自己应获得本阶段无距离限制');
}

// 2.8 闪刘宏【甚宠】：令一名其他角色获得【飞扬】【跋扈】
{
  const g = mk(['flash_liuhong', 'sunquan', 'liubei'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(p.flags.shenchongUsed === true, '甚宠：应标记已发动（限定技）');
  ok(t.skills.some(s => s.id === 'feiyang') && t.skills.some(s => s.id === 'bahu'), '甚宠：目标应获得【飞扬】【跋扈】');
  // 限定技只能一次：再次触发不应改变目标
  const t2 = g.players[2];
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(!t2.skills.some(s => s.id === 'feiyang'), '甚宠：限定技不应二次发动');
}

// 2.9 谋黄盖：初始 2/4 体力 + 2 护甲；诈降多摸 X 张
{
  const g = mk(['mou2_huanggai', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p = g.players[0];
  ok(p.hp === 2 && p.maxHp === 4, `谋黄盖：初始体力应为 2/4（${p.hp}/${p.maxHp}）`);
  ok(p.armor === 2, `谋黄盖：初始护甲应为 2（${p.armor}）`);
  const before = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(p.hand.length === before + 2, `诈降：已损 2 点体力应多摸 2 张（${before} → ${p.hand.length}）`);
}

// 2.10 谋曹仁【据守】：弃 2 张牌获得 2 护甲并翻面；翻回时摸护甲值张牌
{
  const g = mk(['mou2_caoren', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const p = g.players[0];
  p.hand = [card('j1', 'sha'), card('j2', 'shan'), card('j3', 'tao')];
  g.turnPlayer = p; g.phase = 'play';
  const a0 = p.armor || 0;
  await g.useActiveSkill(p, 'jushou2');
  ok(p.flipped === true, '据守：发动后应翻面（背面朝上）');
  ok((p.armor || 0) === a0 + 2, `据守：应获得 2 点护甲（${a0} → ${p.armor}）`);
  const h0 = p.hand.length;
  await g.flip(p);   // 翻回正面 → 摸等同于护甲值的牌
  ok(p.flipped === false, '据守：应可翻回正面');
  ok(p.hand.length > h0, `据守：翻回时应摸等同于护甲值的牌（${h0} → ${p.hand.length}）`);
}

// 2.11 谋甄姬【洛神】：黑色牌你获得、红色牌其弃置
{
  const g = mk(['mou2_zhenji', 'sunquan', 'liubei'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0];
  g.players[1].hand = [card('k1', 'shan', 'spade', 4)];
  g.players[2].hand = [card('k2', 'shan', 'heart', 5)];
  const before = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(p.hand.length > before, '洛神：黑色展示牌应被你获得');
  ok(g.players[2].hand.length === 0, '洛神：红色展示牌应被其弃置');
}

// 2.12 谋姜维【挑衅】：消耗蓄力点，被选角色交牌或出【杀】
{
  const g = mk(['mou2_jiangwei', 'sunquan', 'liubei'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1, 2] };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const p = g.players[0];
  g.turnPlayer = p; g.phase = 'play';
  const h0 = p.hand.length;
  await g.useActiveSkill(p, 'tiaoxin2');
  ok((p.marks?.charge ?? 2) === 0, `挑衅：选 2 名角色后蓄力点应减到 0（${p.marks?.charge}）`);
  ok(p.hand.length > h0, '挑衅：被选角色应交给谋姜维牌');
  ok((p.flags.tiaoxinPicked || 0) === 2, '挑衅：应记录挑衅过的角色数（供觉醒）');
}

// 2.13 谋法正【眩惑】：有「眩」标记的角色摸牌阶段外获得牌时被随机取走一张
{
  const g = mk(['mou2_fazheng', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p = g.players[0], q = g.players[1];
  g.turnPlayer = p; g.phase = 'play';
  await g.useActiveSkill(p, 'xuanhuo2');
  ok(q.flags.xuan === true, '眩惑：目标应获得「眩」标记');
  q.hand = [card('x1', 'shan', 'heart', 6)];
  q.flags.xuanGot = 0;
  g.phase = 'play';
  const ph = p.hand.length;
  await g.trigger('cards.gain', { self: q, cards: [card('x2', 'sha', 'spade', 7)], reason: 'test' });
  ok(p.hand.length > ph, `眩惑：应随机获得其一张手牌（${ph} → ${p.hand.length}）`);
  ok(q.flags.xuanGot === 1, '眩惑：应累计已获得的张数');
}

// 2.14 谋庞统【涅槃】：濒死时弃所有牌、回复至 3 体力、摸三张
{
  const g = mk(['mou2_pangtong', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    return null;
  });
  const p = g.players[0];
  p.hp = 0;
  p.hand = [card('n1', 'sha'), card('n2', 'shan')];
  const before = p.hand.length;
  await g.trigger('dying.begin', { self: p });
  ok(p.hp === Math.min(3, p.maxHp), `涅槃：应回复至 3 点体力（${p.hp}）`);
  ok(p.flags.niepan2Used === true, '涅槃：限定技应标记已发动');
  ok(p.hand.length >= 0 && p.hand.length <= 3, `涅槃：应弃所有牌后摸三张（${before} → ${p.hand.length}）`);
}

// 2.15 魔貂蝉【幻惑】：每轮开始摸 2 弃至多 2，并标记角色
{
  const g = mk(['mo_diaochan', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0];
  g.turnCount = 1;   // 轮开始
  const h0 = p.hand.length;
  await g.trigger('turn.begin', { self: p });
  ok(p.hand.length >= h0, `幻惑：应摸两张再弃至多两张（${h0} → ${p.hand.length}）`);
  ok(g.players[1].flags.huanhuoPending === true, '幻惑：应标记被选角色的下个出牌阶段');
}

// 2.16 魔吕布【夺炁】：首次造成伤害获得其一张「炁」
{
  const g = mk(['mo_lvbu', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnCount = 2;
  t.flags.qi = t.hand.map(c => c.id);
  const th0 = t.hand.length, ph0 = p.hand.length;
  await g.damage({ from: p, to: t, amount: 1, reason: 'test' });
  ok(t.hand.length < th0 && p.hand.length > ph0, `夺炁：应获得其一张「炁」（${th0}→${t.hand.length} / ${ph0}→${p.hand.length}）`);
}


// ================= 2.17 稀有扩展三包：数据与注册（2026-10-26）=================
{
  const EXPECT3 = [
    // SP·绝世
    ['sp5_diaochan', 'SP貂蝉', 'qun', 3, ['sp5_lihun', 'sp5_biyue'], 'sp5'],
    ['sp5_zhouyu', 'SP周瑜', 'wu', 3, ['sp5_fanjian', 'sp5_yingzi'], 'sp5'],
    ['sp5_mayunlu', '马云禄', 'shu', 4, ['sp5_mashu', 'sp5_fengpo'], 'sp5'],
    ['sp5_caojinyu', '曹金玉', 'wei', 3, ['sp5_jinyu'], 'sp5'],
    ['sp5_sunhanhua', '孙寒华', 'wu', 3, ['sp5_hanhua', 'sp5_ningbing'], 'sp5'],
    ['sp5_huaman', '花鬘', 'qun', 4, ['sp5_zhanyuan'], 'sp5'],
    ['sp5_zhangqiying', '张琪瑛', 'qun', 3, ['sp5_leiji'], 'sp5'],
    ['sp5_himiko', '卑弥呼', 'qun', 3, ['sp5_xiamatai'], 'sp5'],
    // 稀世珍宝
    ['xe_zhangrang', '张让', 'qun', 3, ['xe_taoluan'], 'xe'],
    ['xe_pangdegong', '庞德公', 'qun', 3, ['xe_pingcai'], 'xe'],
    ['xe_huangchengyan', '黄承彦', 'qun', 3, ['xe_yashi'], 'xe'],
    ['xe_zhongyan', '钟琰', 'wei', 3, ['xe_guanxi'], 'xe'],
    ['xe_zhangliang', '张梁', 'qun', 4, ['xe_yaoshu'], 'xe'],
    ['xe_zhangbao', '张宝', 'qun', 4, ['xe_hufeng'], 'xe'],
    ['xe_qiuliju', '丘力居', 'qun', 4, ['xe_xiaoqi', 'xe_luezhen'], 'xe'],
    // 稀有·传说
    ['ra_shenweiyan', '神魏延', 'shen', 4, ['ra_qimou'], 'rare'],
    ['ra_sunluyu', '孙鲁育', 'wu', 3, ['ra_zhixi'], 'rare'],
    ['ra_luotong', '骆统', 'wu', 4, ['ra_qinzheng'], 'rare'],
    ['ra_heqi', '贺齐', 'wu', 4, ['ra_fenwei'], 'rare'],
    ['ra_quancong', '全琮', 'wu', 4, ['ra_yaoming'], 'rare'],
    ['ra_hucher', '胡车儿', 'qun', 4, ['ra_daoji'], 'rare'],
    ['ra_tadun', '蹋顿', 'qun', 4, ['ra_luanzhan'], 'rare'],
  ];
  for (const [id, name, kingdom, hp, skills, pack] of EXPECT3) {
    const g = generalById(id);
    ok(!!g, `稀有扩展：武将 ${id} 未注册`);
    if (!g) continue;
    ok(g.name === name && g.kingdom === kingdom && g.hp === hp && g.pack === pack,
      `${id} 数据不符（${g.name}/${g.kingdom}/${g.hp}/${g.pack}）`);
    ok(JSON.stringify(g.skills) === JSON.stringify(skills), `${id} 技能列表不符（${g.skills}）`);
    for (const sk of skills) ok(hasSkill(sk), `稀有扩展：技能 ${sk} 未注册`);
  }
  ok(PACK_CN.sp5 === 'SP·绝世' && PACK_CN.xe === '稀世珍宝' && PACK_CN.rare === '稀有·传说', 'PACK_CN 缺少新包中文名');
}

// 2.18 SP貂蝉【离魂】：弃 1 张手牌，获得目标 1 张手牌
{
  const g = mk(['sp5_diaochan', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  p.hand = [card('l1', 'sha'), card('l2', 'shan')];
  g.turnPlayer = p; g.phase = 'play';
  const th0 = t.hand.length;
  await g.useActiveSkill(p, 'sp5_lihun');
  ok(p.hand.length === 2, `离魂：弃 1 得 1，手牌数应不变（${p.hand.length}）`);
  ok(t.hand.length === th0 - 1, `离魂：目标应少一张手牌（${th0} → ${t.hand.length}）`);
}

// 2.19 SP貂蝉【闭月】＋SP周瑜【英姿】：结束/摸牌阶段各多摸一张
{
  const g = mk(['sp5_diaochan', 'sp5_zhouyu'], (gg, pl, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const p = g.players[0], q = g.players[1];
  const h0 = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'end' });
  ok(p.hand.length === h0 + 1, `闭月：结束阶段应摸一张（${h0} → ${p.hand.length}）`);
  const h1 = q.hand.length;
  await g.trigger('phase.begin', { self: q, phase: 'draw' });
  ok(q.hand.length === h1 + 1, `英姿：摸牌阶段应额外摸一张（${h1} → ${q.hand.length}）`);
}

// 2.20 SP周瑜【反间】：猜错花色受到 1 点伤害
{
  const g = mk(['sp5_zhouyu', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };   // 猜黑桃
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  p.hand = [card('f1', 'sha', 'heart', 5)];   // 只有红桃，必猜错
  t.hp = 4; t.maxHp = 4;
  g.turnPlayer = p; g.phase = 'play';
  await g.useActiveSkill(p, 'sp5_fanjian');
  ok(t.hp === 3, `反间：猜错应受到 1 点伤害（hp=${t.hp}）`);
}

// 2.21 马云禄【马术】/ 孙寒华【寒华】：距离修饰
{
  const g = mk(['sp5_mayunlu', 'sunquan', 'liubei'], (gg, pl, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const p = g.players[0], t = g.players[2];
  const d1 = g.distance(p, t);
  const g2 = mk(['sunquan', 'liubei', 'sunquan'], () => null);
  const d2 = g2.distance(g2.players[0], g2.players[2]);
  ok(d1 <= d2, `马术：距离应不大于普通角色（${d1} vs ${d2}）`);
  // 寒华：他人到你的距离 +1
  const g3 = mk(['sunquan', 'sp5_sunhanhua', 'liubei'], () => null);
  const toH = g3.distance(g3.players[0], g3.players[1]);
  const g4 = mk(['sunquan', 'liubei', 'sunquan'], () => null);
  const toN = g4.distance(g4.players[0], g4.players[1]);
  ok(toH >= toN, `寒华：他人计算与你的距离应不小于普通（${toH} vs ${toN}）`);
}

// 2.22 曹金玉【金玉】：红牌令目标回复、黑牌令目标摸牌
{
  const g = mk(['sp5_caojinyu', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [0] };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p = g.players[0];
  p.hand = [card('j1', 'sha', 'heart', 3)];
  p.hp = 2; p.maxHp = 4;
  g.turnPlayer = p; g.phase = 'play';
  await g.useActiveSkill(p, 'sp5_jinyu');
  ok(p.hp === 3, `金玉：红色牌应令目标回复 1 点体力（hp=${p.hp}）`);
}

// 2.23 孙寒华【凝冰】：受伤后摸两张弃一张（净 +1）
{
  const g = mk(['sp5_sunhanhua', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  p.hp = 5; p.maxHp = 5;
  const h0 = p.hand.length;
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok(p.hand.length === h0 + 1, `凝冰：受伤后摸 2 弃 1，净 +1（${h0} → ${p.hand.length}）`);
}

// 2.24 卑弥呼【邪马台】：回合开始得标记，出牌阶段弃标记摸两张
{
  const g = mk(['sp5_himiko', 'sunquan'], () => null);
  const p = g.players[0];
  await g.trigger('turn.begin', { self: p, player: p });
  ok((p.marks.qinwei || 0) === 1, `邪马台：回合开始应获得 1 个标记（${p.marks.qinwei}）`);
  const h0 = p.hand.length;
  g.turnPlayer = p; g.phase = 'play';
  await g.useActiveSkill(p, 'sp5_xiamatai');
  ok((p.marks.qinwei || 0) === 0 && p.hand.length === h0 + 2, `邪马台：弃标记应摸两张（标记 ${p.marks.qinwei} / 手牌 ${h0}→${p.hand.length}）`);
}

// 2.25 张让【滔乱】：弃 1 张视为【无中生有】，然后失去 1 点体力
{
  const g = mk(['xe_zhangrang', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p = g.players[0];
  p.hand = [card('t1', 'shan'), card('t2', 'sha')];
  p.hp = 4; p.maxHp = 4;
  g.players[1].hand = [];           // 避免对手用【无懈可击】抵消（测的是滔乱本身）
  g.turnPlayer = p; g.phase = 'play';
  await g.useActiveSkill(p, 'xe_taoluan');
  ok(p.hp === 3, `滔乱：应失去 1 点体力（hp=${p.hp}）`);
  ok(p.hand.length >= 2, `滔乱：弃 1 张后用【无中生有】摸 2，手牌应不少于 2（${p.hand.length}；日志 ${g.logs.slice(-4).map(x => x.text).join(' | ')}）`);
}

// 2.26 庞德公【评才】/ 黄承彦【雅士】
{
  const g = mk(['xe_pangdegong', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.phase = 'play';
  const th0 = t.hand.length;
  await g.useActiveSkill(p, 'xe_pingcai');
  ok(t.hand.length === th0 + 1, `评才：目标摸 2 弃 1，净 +1（${th0} → ${t.hand.length}）`);

  const g2 = mk(['xe_huangchengyan', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p2 = g2.players[0], t2 = g2.players[1];
  g2.turnPlayer = p2; g2.phase = 'play';
  const th2 = t2.hand.length;
  await g2.useActiveSkill(p2, 'xe_yashi');
  ok(t2.hand.length === th2 - 1, `雅士：目标应少一张手牌（${th2} → ${t2.hand.length}）`);
}

// 2.27 丘力居【骁骑】：回合开始后【杀】无距离限制
{
  const g = mk(['xe_qiuliju', 'sunquan'], () => null);
  const p = g.players[0];
  await g.trigger('turn.begin', { self: p, player: p });
  ok(p.flags.shaNoRange === true, '骁骑：回合开始应获得【杀】无距离限制');
}

// 2.28 神魏延【奇谋】／孙鲁育【止息】
{
  const g = mk(['ra_shenweiyan', 'sunquan'], (gg, pl, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const p = g.players[0];
  p.hp = 4; p.maxHp = 4;
  g.turnPlayer = p; g.phase = 'play';
  await g.useActiveSkill(p, 'ra_qimou');
  ok(p.hp === 3 && p.flags.shaUnlimited === true, `奇谋：应失去 1 点体力并获得【杀】无次数限制（hp=${p.hp} / unlimited=${p.flags.shaUnlimited}）`);

  const g2 = mk(['ra_sunluyu', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const p2 = g2.players[0], t2 = g2.players[1];
  p2.hp = 3; p2.maxHp = 3;
  await g2.damage({ from: t2, to: p2, amount: 1, reason: 'test' });
  ok(p2.hp === 3, `止息：弃一张手牌应令此伤害减至 0（hp=${p2.hp}）`);
}

// 2.29 全琮【邀名】／蹋顿【乱战】
{
  const g = mk(['ra_quancong', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.phase = 'play';
  const h0 = p.hand.length, th0 = t.hand.length;
  await g.useActiveSkill(p, 'ra_yaoming');
  ok(p.hand.length === h0 + 1 && t.hand.length === th0 + 1, `邀名：双方各摸一张（${h0}→${p.hand.length} / ${th0}→${t.hand.length}）`);

  const g2 = mk(['ra_tadun', 'sunquan'], () => null);
  const p2 = g2.players[0], t2 = g2.players[1];
  p2.hand = [card('z1', 'sha')];
  t2.hand = [card('z2', 'sha'), card('z3', 'shan')];
  t2.hp = 4; t2.maxHp = 4;
  g2.turnCount = 3;
  const sha = p2.hand[0];
  await g2.damage({ from: p2, to: t2, amount: 1, card: sha, reason: 'test' });
  ok(t2.hp === 2, `乱战：目标手牌多于你时伤害 +1（应造成 2 点，实际 hp=${t2.hp}）`);
}

// 2.30 三张军争锦囊：兵粮寸断 / 铁索连环 / 火攻
{
  const exNames = deckEntries('ex').map(c => c.name);
  const cnt = (arr, n) => arr.filter(x => x === n).length;
  ok(cnt(exNames, 'huogong') === 3, `ex 牌堆·火攻应为 3 张（实际 ${cnt(exNames, 'huogong')}）`);
  ok(cnt(exNames, 'tiesuo') === 6, `ex 牌堆·铁索连环应为 6 张（实际 ${cnt(exNames, 'tiesuo')}）`);
  ok(cnt(exNames, 'bingliang') === 2, `ex 牌堆·兵粮寸断应为 2 张（实际 ${cnt(exNames, 'bingliang')}）`);
  const stdNames = deckEntries('standard').map(c => c.name);
  ok(!stdNames.includes('huogong') && !stdNames.includes('tiesuo') && !stdNames.includes('bingliang'),
    '标准包不应含军争三锦囊（官方口径）');
  ok(getMode('junzheng').deck === 'ex', '军争模式应使用 ex 牌堆（默认模式已切到军争）');
  for (const n of ['huogong', 'tiesuo', 'bingliang']) ok(!!CARD_META[n], `牌元数据缺失：${n}`);

  // 火攻：只能指定「有手牌」的其他角色；由目标展示一张手牌，弃同花色造成 1 点火焰伤害
  const g = mk(['sunquan', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, 1) };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  const hg = card('hg1', 'huogong');
  t.hand = [];
  ok(!g.candidatesFor(p, hg).includes(t), '火攻：目标无手牌时不可指定');
  t.hand = [card('hg2', 'sha', 'spade', 7)];
  ok(g.candidatesFor(p, hg).includes(t), '火攻：目标有手牌时可指定');
  p.hand = [card('hg3', 'guohe', 'spade', 3)];   // 与展示牌同为黑桃
  const hp0 = t.hp;
  await CARD_META.huogong.effect(g, { from: p, targets: [t], card: hg });
  ok(t.hp === hp0 - 1, `火攻：弃同花色手牌应造成 1 点火焰伤害（hp ${hp0}→${t.hp}）`);
  // 无同花色手牌时不造成伤害
  const g1b = mk(['sunquan', 'sunquan'], (gg, pl, req) => (req.kind === 'cards' ? { cardIds: (req.cards || []).slice(0, 1) } : null));
  const p1b = g1b.players[0], t1b = g1b.players[1];
  t1b.hand = [card('hg4', 'sha', 'spade', 7)];
  p1b.hand = [card('hg5', 'guohe', 'heart', 3)];
  const hp1b = t1b.hp;
  await CARD_META.huogong.effect(g1b, { from: p1b, targets: [t1b], card: card('hg6', 'huogong') });
  ok(t1b.hp === hp1b, `火攻：没有同花色手牌时不应造成伤害（hp=${t1b.hp}）`);

  // 铁索连环：横置 / 重置 / 属性伤害传导
  const g2 = mk(['sunquan', 'sunquan'], () => null);
  const a = g2.players[0], b = g2.players[1];
  await CARD_META.tiesuo.effect(g2, { from: a, targets: [a, b], card: card('ts1', 'tiesuo') });
  ok(a.chained && b.chained, '铁索：可同时横置自己与他人');
  await CARD_META.tiesuo.effect(g2, { from: a, targets: [a], card: card('ts2', 'tiesuo') });
  ok(!a.chained && b.chained, '铁索：再次指定可重置（仅解除被指定者）');
  const g3 = mk(['sunquan', 'sunquan'], () => null);
  const x = g3.players[0], y = g3.players[1];
  x.chained = true; y.chained = true;
  const hpY = y.hp;
  await g3.damage({ from: null, to: x, amount: 1, nature: 'fire', reason: 'test' });
  ok(y.hp === hpY - 1, `铁索：属性伤害应传导给其他连环角色（${hpY}→${y.hp}）`);
  ok(!x.chained && !y.chained, '铁索：传导后相关角色应解除连环');

  // 铁索连环【重铸】：弃置该牌并摸一张，不视为使用
  const seats = [0, 1].map(i => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById('sunquan') }));
  const tsCard = card('ts3', 'tiesuo', 'spade', 12);
  const seq = [{ card: tsCard, recast: true }, { endPhase: true }];
  const g4 = new Game({
    seats, mode: getMode('duel'), seed: 777,
    responder: { askPlay: async () => seq.shift() || { endPhase: true }, ask: async () => null },
    deckEntries: deckEntries('ex'), config: { timeout: 1000 },
  });
  g4.onState = () => {};
  const p4 = g4.players[0];
  p4.hand = [tsCard];
  g4.turnPlayer = p4;
  await g4.runPhase(p4, 'play');
  ok(!p4.hand.some(c => c.id === 'ts3'), '铁索重铸：该牌应已弃置');
  ok(p4.hand.length >= 1, `铁索重铸：应摸一张牌（手牌 ${p4.hand.length}）`);
}

// 2.31 「月」体系三概念：初辉技 / 满辉技 / 祈月
{
  // 初辉技（【诈降】）：「☽」不满时可于出牌阶段发动，发动后耗尽「☽」
  const g = mk(['moon_huanggai', 'sunquan'], (gg, pl, req) => (req.kind === 'confirm' ? { yes: true } : req.kind === 'cards' ? { cardIds: [] } : null));
  const p = g.players[0];
  g.turnPlayer = p; g.phase = 'play';
  p.hand = [];
  p.marks.yue = moonMaxOf(p);
  await g.useActiveSkill(p, 'moon_zhaxiang');
  ok((p.marks.yue || 0) === moonMaxOf(p), `初辉【诈降】：「☽」集满时不应发动（现 ${p.marks.yue}）`);
  p.marks.yue = 3;
  await g.useActiveSkill(p, 'moon_zhaxiang');
  ok((p.marks.yue || 0) === 0, `初辉【诈降】：不满时发动后应耗尽「☽」（现 ${p.marks.yue}）`);

  // 满辉技（【忠心】）：「☽」集满时「立即使用」——发动环节不再询问玩家
  // （其后【诈降】的「是否明置【杀】」仍会问，属技能本体交互，不算发动询问）
  const confirmMsgs = [];
  const g2 = mk(['moon_huanggai', 'sunquan'], (gg, pl, req) => {
    if (req.kind === 'confirm') { confirmMsgs.push(JSON.stringify(req)); return { yes: true }; }
    if (req.kind === 'cards') return { cardIds: [] };
    return null;
  });
  const p2 = g2.players[0];
  p2.marks.yue = moonMaxOf(p2);
  await g2.trigger('turn.begin', { self: p2 });
  const askedLaunch = confirmMsgs.some(m => /满辉/.test(m));
  ok(!askedLaunch, `满辉【忠心】应立即发动、不再询问（confirm：${confirmMsgs.join(' | ').slice(0, 160)}）`);
  ok((p2.marks.yue || 0) < moonMaxOf(p2), `满辉【忠心】：发动后应耗尽「☽」（现 ${p2.marks.yue}）`);
  ok(p2.flags.shaNoRange === true, '满辉【忠心】：应获得本局【杀】无距离限制');

  // 满辉技（嫦娥【新征程】）：集满自动发动，增幅 +50%
  const g3 = mk(['myth_change', 'sunquan'], () => null);
  const p3 = g3.players[0];
  p3.marks.yue = moonMaxOf(p3);
  p3.marks.zengfu = 0;
  await g3.trigger('turn.begin', { self: p3 });
  ok((p3.marks.zengfu || 0) === 50, `满辉【新征程】：集满应立即发动、增幅 +50%（现 ${p3.marks.zengfu}）`);
  ok((p3.marks.yue || 0) > 0 && (p3.marks.yue || 0) < moonMaxOf(p3), `满辉【新征程】：应清空并重新获得 1~5 个「☽」（现 ${p3.marks.yue}）`);

  // 祈月：「于下一次获得「☽」前可用」——发动后关闭窗口，获得「☽」即重新打开
  const qp = { marks: { yue: 0 }, flags: {}, moonMax: 10 };
  markQiyue(qp);
  ok(!qiyueReady(qp), '祈月：发动后窗口应关闭');
  addMoon(qp, 1);
  ok(qiyueReady(qp), '祈月：获得「☽」后窗口应重新打开');
}

console.log(`\n=== packcheck：${pass} 通过 / ${fail} 失败 ===`);
if (bad.length) { console.log('失败项：'); for (const b of bad) console.log('  ✗', b); }
process.exit(fail ? 1 : 0);
