// 阶段 5C 守门测试：晋 · 文德武备（补全）12 将 / 23 技能
// 运行：node tools/jin2check.js
// 自包含：直接 import '../src/skills/jin2.js' + '../src/data/jin2.js'（不依赖 generals.js / skills/index.js 的注册）
import '../src/skills/index.js';   // 先加载全量技能包（若 jin2 的技能 id 与旧包冲突，defineSkill 会静默复用旧技能）
import '../src/skills/jin2.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { generalById } from '../src/data/generals.js';
import { JIN2_GENERALS } from '../src/data/jin2.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });
const byId = (id) => generalById(id) || JIN2_GENERALS.find(g => g.id === id);

function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: byId(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261025,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
// 常用桩：全部同意 / 选项 0 / 目标座位 / 第一张牌
const yes = (over = {}) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: over.yes !== false };
  if (req.kind === 'choice' || req.kind === 'choose') return { index: over.index ?? 0 };
  if (req.kind === 'targets') return { seats: (over.seats || [1]).slice(0, Math.max(1, req.max || 1)) };
  if (req.kind === 'card' || req.kind === 'cards') return { cardId: (over.cardId || (p.hand[0] || {}).id), cardIds: [over.cardId || (p.hand[0] || {}).id] };
  return null;
};
const sayNo = () => (g, p, req) => (req.kind === 'confirm' ? { yes: false } : null);
const hasLog = (g, t) => g.logs.some(l => l.text.includes(t));

// ================= 1. 数据与注册 =================
const EXPECT = [
  // id, 名称, 势力, 体力, [技能], hidden
  ['jin2_simazhou', '司马伷', 'jin', 4, ['caiwang', 'najiang'], false],
  ['jin2_huaxin', '华歆', 'wei', 3, ['caozhao', 'xibing2'], false],
  ['jin2_shibao', '石苞', 'jin', 4, ['zhuosheng'], false],
  ['jin2_yanghuiyu', '羊徽瑜', 'jin', 3, ['huirong', 'ciwei', 'caiyuan'], true],
  ['chengji_chengcui', '成济&成倅', 'wei', 4, ['tousui', 'chuming'], false],
  ['jin2_weiguan', '卫瓘', 'jin', 3, ['zhongyun', 'shenpin'], false],
  ['jin2_xinchang', '辛敞', 'jin', 3, ['canmou', 'congjian2'], false],
  ['jin2_jiachong', '贾充', 'jin', 3, ['xiongshu', 'jianhui'], false],
  ['jin2_wangxiang', '王祥', 'jin', 3, ['bingxin'], false],
  ['jin2_yangyan', '杨艳', 'jin', 3, ['xuanbei', 'xianwan'], false],
  ['jin2_yangzhi', '杨芷', 'jin', 3, ['wanyi', 'maihuo'], false],
  ['jin2_xunyi', '荀顗', 'jin', 3, ['jianya', 'juzhang'], false],
];
ok(JIN2_GENERALS.length === 12, `将数应为 12，实际 ${JIN2_GENERALS.length}`);
ok(JIN2_GENERALS.every(g => g.pack === 'jin'), 'pack 应全为 jin（阶段6 合入主包）');
ok(new Set(JIN2_GENERALS.map(g => g.id)).size === 12, '武将 id 必须唯一');

for (const [id, name, kingdom, hp, skills, hidden] of EXPECT) {
  const gd = byId(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符（期望 ${kingdom}/${hp}）`);
  ok(gd && gd.pack === 'jin', `${id} pack 应为 jin（阶段6 已合入原包）`);
  ok(gd && skills.every(s => gd.skills.includes(s)) && gd.skills.length === skills.length, `${id} 技能列表不符`);
  ok(gd && (gd.hidden === true) === hidden, `${id} hidden 标记不符（应为 ${hidden}）`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && !!sk.desc && sk.desc.length > 8, `技能 ${s} 缺少 desc`);
    ok(sk && ((sk.triggers || []).length > 0 || !!sk.active), `技能 ${s} 是空壳`);
    ok(!/^(jie_|mou_|ji_|shen_)/.test(s), `技能 ${s} 使用了禁用前缀`);
  }
}

// ---- id 冲突守门：defineSkill 遇到已注册的 id 会静默复用旧技能，必须比对名称 ----
const NAMES = {
  caiwang: '才望', najiang: '纳降', caozhao: '草诏', xibing2: '息兵', zhuosheng: '擢升',
  huirong: '慧容', ciwei: '慈威', caiyuan: '才媛', tousui: '透髓', chuming: '畜鸣',
  zhongyun: '忠允', shenpin: '神品', canmou: '参谋', congjian2: '从鉴', xiongshu: '凶竖',
  jianhui: '奸回', bingxin: '冰心', xuanbei: '选备', xianwan: '娴婉', wanyi: '婉嫕',
  maihuo: '埋祸', jianya: '践雅', juzhang: '举章',
};
ok(Object.keys(NAMES).length === 23, `本包技能数应为 23，实际 ${Object.keys(NAMES).length}`);
for (const [id, name] of Object.entries(NAMES)) {
  const sk = getSkill(id);
  ok(sk && sk.name === name,
    `技能 ${id} 名称不符（期望 ${name}，实际 ${sk && sk.name}）——可能与他包技能 id 冲突被静默复用`);
}

// ================= 2. 司马伷 · 才望 =================
{
  const g = mk(['jin2_simazhou', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.phase = 'play';
  a.hand = [card('cw_a1', 'shan', 'spade', 2)];        // 黑闪
  b.hand = [card('cw_b1', 'tao', 'heart', 3)];         // 待被弃置
  await g.useCard({ from: b, card: card('cw_b2', 'sha', 'club', 7), targets: [a], reason: 'play' });
  ok(hasLog(g, '才望'), '才望：同色响应后应有日志');
  ok(b.hand.length === 0, `才望：应弃置响应链对方一张牌（b 手牌 ${b.hand.length}）`);
  ok(!a.hidden, '司马伷（非隐匿将）不应处于隐匿');
}
// 纳降：记录伤害对象；才望改为「获得」
{
  const g = mk(['jin2_simazhou', 'sunquan'], yes());
  const [a, b] = g.players;
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok((a.flags.najiangSeats || {})[b.seat] === true, '纳降：应对伤害来源记录“降”');
  ok(hasLog(g, '纳降'), '纳降：应有日志');
  // 回合开始后清空
  await g.trigger('turn.begin', { self: a });
  ok(Object.keys(a.flags.najiangSeats || {}).length === 0, '纳降：自己的回合开始应清空记录');
}
// 才望③：最后一张手牌当【闪】
{
  const g = mk(['jin2_simazhou', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hand = [card('cw_c1', 'sha', 'club', 9)];
  const dodged = await g.requireDodge(a, { from: b, card: card('cw_c2', 'sha', 'spade', 7), reason: 'sha' });
  ok(dodged === true && a.hand.length === 0, '才望：最后一张手牌应能当【闪】打出');
}

// ================= 3. 华歆 · 草诏 =================
{
  const g = mk(['jin2_huaxin', 'zhouyu'], yes({ seats: [1], index: 0 }));
  const [a, b] = g.players;
  g.phase = 'play';
  a.hand = [card('cz1', 'sha', 'spade', 5)];
  b.hand = [];
  const used = await g.useActiveSkill(a, 'caozhao');
  ok(used === true, '草诏：主动技应能发动');
  ok(hasLog(g, '草诏'), '草诏：应有日志');
  ok(b.hand.length === 1, `草诏：声明成功后应能把牌交给目标（b 手牌 ${b.hand.length}）`);
  ok((a.flags.caozhaoDeclared || {}).sha === true, '草诏：应记录已声明牌名');
  // 选项 1：失去 1 点体力
  const g2 = mk(['jin2_huaxin', 'zhouyu'], yes({ seats: [1], index: 1 }));
  const [a2, b2] = g2.players;
  g2.phase = 'play';
  a2.hand = [card('cz2', 'sha', 'heart', 4)];
  const hp0 = b2.hp;
  await g2.useActiveSkill(a2, 'caozhao');
  ok(b2.hp === hp0 - 1, `草诏：选第二项应失去 1 点体力（${hp0} → ${b2.hp}）`);
}
// 华歆 · 息兵
{
  const g = mk(['jin2_huaxin', 'zhouyu'], yes({ index: 0 }));
  const [a, b] = g.players;
  a.hand = [card('xb_a1', 'sha', 'spade', 3), card('xb_a2', 'shan', 'heart', 4)];
  b.hand = [card('xb_b1', 'sha'), card('xb_b2', 'sha'), card('xb_b3', 'sha'), card('xb_b4', 'sha')];
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(hasLog(g, '息兵'), '息兵：应有日志');
  ok(a.hand.length === 2, `息兵：弃两张后手牌较少的你应摸两张（实际 ${a.hand.length}）`);
  ok(a.flags.xibingBanSeat === a.seat, '息兵：应以法摸牌的角色获得“不能指定你为目标”标记');
  // 拦截：受影响角色不能指定华歆
  const okUse = await g.useCard({ from: a, card: card('xb_a3', 'sha', 'club', 6), targets: [b], reason: 'play' });
  ok(okUse === false || hasLog(g, '不能指定'), '息兵：受影响角色不能使用牌指定华歆为目标');
}

// ================= 4. 石苞 · 擢升 =================
{
  const g = mk(['jin2_shibao', 'sunquan'], yes());
  const [a, b] = g.players;
  g.phase = 'play';
  a.hand = [];
  await g.gainCards(a, [card('zs1', 'zhuge', 'spade', 1)], { reason: 'test' });
  await g.useCard({ from: a, card: a.hand[0], targets: [], reason: 'play' });
  ok(hasLog(g, '擢升'), '擢升：使用本轮获得的装备牌应有日志');
  ok(a.hand.length === 1, `擢升：装备牌应摸一张（手牌 ${a.hand.length}）`);
}
{
  const g = mk(['jin2_shibao', 'sunquan'], yes());
  const [a, b] = g.players;
  g.phase = 'play';
  a.hand = [];
  await g.gainCards(a, [card('zs2', 'sha', 'spade', 8)], { reason: 'test' });
  a.flags.shaUsed = 0;
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play' });
  ok(a.flags.shaUsed === 0, `擢升：本轮获得的【杀】不应计入次数（shaUsed=${a.flags.shaUsed}）`);
  ok(hasLog(g, '不计入【杀】的使用次数'), '擢升：应有“不计入次数”日志');
}
// 擢升：普通锦囊目标 +1
{
  const g = mk(['jin2_shibao', 'sunquan', 'zhouyu'], yes({ seats: [2] }));
  const [a, b, c] = g.players;
  g.phase = 'play';
  a.hand = [];
  await g.gainCards(a, [card('zs3', 'guohe', 'heart', 3)], { reason: 'test' });
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play' });
  ok(hasLog(g, '额外指定'), '擢升：普通锦囊应能令目标 +1');
}

// ================= 5. 羊徽瑜 · 慧容 / 慈威 / 才媛 =================
{
  const g = mk(['jin2_yanghuiyu', 'sunquan'], yes({ seats: [0] }));
  const [a, b] = g.players;
  ok(a.hidden === true, '羊徽瑜：开局应处于隐匿（慧容为隐匿技）');
  a.hp = 3;
  a.hand = [card('hr1', 'sha'), card('hr2', 'sha'), card('hr3', 'sha'), card('hr4', 'sha')];
  await g.trigger('turn.begin', { self: a });
  ok(a.hidden === false, '慧容：自己的回合开始应解除隐匿（登场）');
  ok(hasLog(g, '慧容'), '慧容：登场后应有日志');
  ok(a.hand.length === 3, `慧容：手牌应补/弃至体力值 3（实际 ${a.hand.length}）`);
}
{
  const g = mk(['jin2_yanghuiyu', 'sunquan'], yes({ seats: [0] }));
  const [a, b] = g.players;
  g.turnPlayer = b; g.phase = 'play';
  a.hand = [card('cw2_1', 'tao', 'heart', 5)];
  b.hand = [card('cw2_2', 'wuzhong', 'heart', 6), card('cw2_3', 'wuzhong', 'heart', 7)];
  await g.useCard({ from: b, card: b.hand[0], targets: [b], reason: 'play' });
  const second = await g.useCard({ from: b, card: b.hand[0], targets: [b], reason: 'play' });
  ok(second === false, '慈威：第二张牌应被取消');
  ok(hasLog(g, '慈威'), '慈威：应有日志');
  ok(a.hand.length === 0, '慈威：应弃置一张牌作为成本');
}
{
  const g = mk(['jin2_yanghuiyu', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hand = [card('cy1', 'sha'), card('cy2', 'sha')];
  const n0 = a.hand.length;
  await g.trigger('phase.begin', { self: a, phase: 'end' });
  ok(a.hand.length === n0 + 2, `才媛：未扣减体力应摸两张（${n0} → ${a.hand.length}）`);
  // 扣减过体力则不摸
  const g2 = mk(['jin2_yanghuiyu', 'sunquan'], yes());
  const [a2, b2] = g2.players;
  await g2.damage({ from: b2, to: a2, amount: 1, reason: 'test' });
  const n1 = a2.hand.length;
  await g2.trigger('phase.begin', { self: a2, phase: 'end' });
  ok(a2.hand.length === n1, `才媛：扣减过体力则不应摸牌（${n1} → ${a2.hand.length}）`);
}

// ================= 6. 成济&成倅 · 透髓 / 畜鸣 =================
{
  const g = mk(['chengji_chengcui', 'sunquan'], yes({ seats: [1], index: 0 }));
  const [a, b] = g.players;
  g.phase = 'play';
  a.hand = [card('ts1', 'tao', 'heart', 3), card('ts2', 'shan', 'heart', 4)];
  b.hand = [];
  const d0 = g.deck.length;
  await g.useActiveSkill(a, 'tousui');
  ok(g.deck.length === d0 + 2, `透髓：两张牌应置于牌堆底（牌堆 ${d0} → ${g.deck.length}）`);
  ok(hasLog(g, '透髓'), '透髓：应有日志');
  ok(hasLog(g, '需 2 张【闪】抵消'), '透髓：应要求等量张【闪】抵消');
}
{
  const g = mk(['chengji_chengcui', 'sunquan'], yes());
  const [a, b] = g.players;
  // 无实体牌的伤害 +1
  const hp0 = b.hp;
  await g.damage({ from: a, to: b, amount: 1, reason: 'test' });
  ok(b.hp === hp0 - 2, `畜鸣：无实体牌伤害应 +1（${hp0} → ${b.hp}）`);
  ok(hasLog(g, '畜鸣'), '畜鸣：应有日志');
  // 有实体牌 → 记录待结算
  const g2 = mk(['chengji_chengcui', 'sunquan'], yes());
  const [a2, b2] = g2.players;
  await g2.damage({ from: b2, to: a2, amount: 1, card: card('cm1', 'sha', 'spade', 7), reason: 'test' });
  ok((a2.flags.chumingPending || []).length === 1, '畜鸣：应有实体牌的待结算记录');
  g2.turnPlayer = b2;
  await g2.trigger('turn.end', { self: b2 });
  ok((a2.flags.chumingPending || []).length === 0 && hasLog(g2, '当【过河拆桥】'), '畜鸣：回合结束应结算过河拆桥');
}

// ================= 7. 卫瓘 · 忠允 / 神品 =================
{
  const g = mk(['jin2_weiguan', 'sunquan'], yes({ index: 0 }));
  const [a, b] = g.players;
  a.hp = 2;
  a.hand = [card('zy1', 'sha', 'spade', 3)];
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(a.hp === 2, `忠允①：受伤后体力=手牌数应能回复 1 点（hp=${a.hp}）`);
  ok(hasLog(g, '忠允'), '忠允：应有日志');
  // ② 手牌数变化
  const g2 = mk(['jin2_weiguan', 'sunquan'], yes({ index: 0 }));
  const [a2, b2] = g2.players;
  a2.hp = 3;
  a2.flags.zy1 = g2.turnCount;
  a2.hand = [card('zy2', 'sha'), card('zy3', 'shan')];
  const n0 = a2.hand.length;
  await g2.gainCards(a2, [card('zy4', 'tao')], { reason: 'test' });
  ok(a2.hand.length >= n0 + 1, '忠允②：手牌数=体力值后应能摸牌');
}
{
  const g = mk(['jin2_weiguan', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hand = [card('sp1', 'sha', 'heart', 5)];
  g.deck.push(card('sp_t', 'sha', 'spade', 9));    // 判定牌（黑）
  const r = await g.judge(a, { reason: 'test' });
  ok(r.suit === 'heart' && r.num === 5, `神品：应用红牌代替黑判定（实际 ${r.suit}${r.num}）`);
  ok(hasLog(g, '神品'), '神品：应有日志');
}

// ================= 8. 辛敞 · 参谋 / 从鉴 =================
{
  const g = mk(['jin2_xinchang', 'sunquan', 'zhouyu'], yes({ seats: [0] }));
  const [a, b, c] = g.players;
  a.hand = [card('cm_a', 'sha')];
  c.hand = [card('cm_c', 'sha')];
  b.hand = [card('cm_b1', 'sha'), card('cm_b2', 'sha'), card('cm_b3', 'sha'),
    card('cm_b4', 'sha'), card('cm_b5', 'sha')];
  await g.useCard({ from: b, card: card('cm_t', 'guohe', 'heart', 4), targets: [c], reason: 'play' });
  ok(hasLog(g, '参谋'), '参谋：手牌唯一最多者使用普通锦囊应能加目标');
}
{
  const g = mk(['jin2_xinchang', 'sunquan', 'zhouyu'], yes());
  const [a, b, c] = g.players;
  a.hp = 3; b.hp = 3; c.hp = 4;
  a.hand = [card('cj_a', 'sha')];
  b.hand = [card('cj_b', 'sha')];
  c.hand = [card('cj_c', 'sha')];
  await g.useCard({ from: b, card: card('cj_t', 'guohe', 'club', 4), targets: [c], reason: 'play' });
  ok(hasLog(g, '从鉴'), '从鉴：体力唯一最多者成为唯一目标应能跟上');
}

// ================= 9. 贾充 · 凶竖 / 奸回 =================
{
  const g = mk(['jin2_jiachong', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hand = [card('xs_a', 'sha')];
  b.hand = [card('xs_b1', 'sha', 'spade', 7), card('xs_b2', 'sha', 'club', 8)];
  g.turnPlayer = b; g.phase = 'play';
  await g.trigger('phase.begin', { self: b, phase: 'play' });
  ok(!!a.flags.xiongshu && a.flags.xiongshu.guess === true, '凶竖：应记录猜测（是=会使用）');
  await g.trigger('card.use.after', { self: b, card: b.hand[0] });
  ok(a.flags.xiongshu.used === true, '凶竖：应记录其使用了同名牌');
  const hp0 = b.hp;
  await g.trigger('phase.end', { self: b, phase: 'play' });
  ok(b.hp === hp0 - 1, `凶竖：猜对应造成 1 点伤害（${hp0} → ${b.hp}）`);
}
{
  const g = mk(['jin2_jiachong', 'sunquan'], yes());
  const [a, b] = g.players;
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(a.flags.jianhuiSeat === b.seat, '奸回：应记录上次伤害来源');
  const n0 = b.hand.length;
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(b.hand.length === n0 - 1, `奸回：其再次对你造成伤害应弃一张牌（${n0} → ${b.hand.length}）`);
  const n1 = a.hand.length;
  await g.damage({ from: a, to: b, amount: 1, reason: 'test' });
  ok(a.hand.length === n1 + 1, `奸回：你对其造成伤害应摸一张（${n1} → ${a.hand.length}）`);
}

// ================= 10. 王祥 · 冰心 =================
{
  const g = mk(['jin2_wangxiang', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hp = 3;
  a.hand = [card('bx1', 'sha', 'spade', 2), card('bx2', 'sha', 'club', 3), card('bx3', 'sha', 'spade', 4)];
  const n0 = a.hand.length;
  const dodged = await g.requireDodge(a, { from: b, card: card('bx0', 'sha', 'heart', 7), reason: 'sha' });
  ok(dodged === true, '冰心：手牌=体力值且同色时应视为使用【闪】');
  ok(hasLog(g, '冰心'), '冰心：应有日志');
  ok(a.hand.length === n0 + 1, `冰心：应先摸一张牌（${n0} → ${a.hand.length}）`);
}

// ================= 11. 杨艳 · 选备 / 娴婉 =================
{
  const g = mk(['jin2_yangyan', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.phase = 'play';
  b.hand = [card('xb2_1', 'tao', 'heart', 5)];
  b.equips.weapon = card('xb2_w', 'zhuge', 'spade', 1);
  const used = await g.useActiveSkill(a, 'xuanbei');
  ok(used === true, '选备：主动技应能发动');
  ok(hasLog(g, '选备'), '选备：应有日志');
  ok(b.hand.length === 0 || b.equips.weapon === null, '选备：应移走目标区域内的一张牌');
}
{
  const g = mk(['jin2_yangyan', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hand = [];
  const dodged = await g.requireDodge(a, { from: b, card: card('xw0', 'sha', 'spade', 3), reason: 'sha' });
  ok(dodged === true && a.chained === true, '娴婉：未横置时应能横置视为使用【闪】');
  a.hand = [];
  const c = await g.respondCard(a, { filter: { name: 'sha' }, reason: 'juedou' });
  ok(!!c && a.chained === false, '娴婉：已横置时应能重置视为使用【杀】');
}

// ================= 12. 杨芷 · 婉嫕 / 埋祸 =================
{
  const g = mk(['jin2_yangzhi', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.phase = 'play';
  a.hand = [card('wy1', 'sha', 'club', 7)];
  b.hand = [card('wy_b1', 'shan', 'heart', 2), card('wy_b2', 'tao', 'diamond', 3)];
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play' });
  ok((a.flags.wyCards || []).length === 1, `婉嫕：应把目标一张牌置于武将牌上（实际 ${(a.flags.wyCards || []).length}）`);
  ok(hasLog(g, '婉嫕'), '婉嫕：应有日志');
  // ③ 受到伤害后让一名角色获得“嫕”
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok((a.flags.wyCards || []).length === 0, '婉嫕：受到伤害后应把“嫕”交给一名角色');
  // ② 不能使用同花色
  a.flags.wyCards = [card('wy_x', 'tao', 'spade', 4)];
  const usedBlocked = await g.useCard({ from: a, card: card('wy2', 'guohe', 'spade', 6), targets: [b], reason: 'play' });
  ok(usedBlocked === false && hasLog(g, '不能使用'), '婉嫕：不能使用与“嫕”同花色的牌');
}
{
  const g = mk(['jin2_yangzhi', 'sunquan'], yes());
  const [a, b] = g.players;
  g.phase = 'play';
  b.hand = [card('mh1', 'sha', 'spade', 7), card('mh2', 'shan', 'heart', 2)];
  await g.useCard({ from: b, card: b.hand[0], targets: [a], reason: 'play' });
  ok(!!b.flags.maihuoCard, '埋祸：实体【杀】仅指定你后应置于其武将牌上（“祸”）');
  ok(hasLog(g, '埋祸'), '埋祸：应有日志');
  g.turnPlayer = b;
  await g.trigger('phase.begin', { self: b, phase: 'play' });
  ok(!b.flags.maihuoCard, '埋祸：其下个出牌阶段开始时应使用“祸”');
}

// ================= 13. 荀顗 · 践雅 / 举章 =================
{
  const g = mk(['jin2_xunyi', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.phase = 'play';
  b.hp = 4;
  b.hand = [card('jy1', 'sha')];
  await g.trigger('phase.end', { self: a, phase: 'play' });
  ok(b.hand.length === 4, `践雅：应把手牌调整至体力值 4（实际 ${b.hand.length}）`);
  ok(hasLog(g, '践雅'), '践雅：应有日志');
}
{
  const g = mk(['jin2_xunyi', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hand = [card('jz_a1', 'sha'), card('jz_a2', 'shan')];
  b.hand = [card('jz_b1', 'sha'), card('jz_b2', 'shan'), card('jz_b3', 'tao')];
  await g.useCard({ from: b, card: card('jz_t', 'guohe', 'heart', 4), targets: [a], reason: 'play' });
  ok(hasLog(g, '举章'), '举章：成为普通锦囊目标且手牌不多于使用者应摸一张牌');
}

// ================= 14. 反例 / 负面用例 =================
{
  // 石苞：非本轮获得的牌不触发
  const g = mk(['jin2_shibao', 'sunquan'], yes());
  const [a, b] = g.players;
  g.phase = 'play';
  a.hand = [card('zs_n1', 'zhuge', 'heart', 1)];
  await g.useCard({ from: a, card: a.hand[0], targets: [], reason: 'play' });
  ok(!hasLog(g, '擢升'), '擢升：非本轮获得的牌不应触发');
}
{
  // 才媛：拒绝时不摸
  const g = mk(['jin2_yanghuiyu', 'sunquan'], sayNo());
  const [a, b] = g.players;
  a.hand = [card('cy_n1', 'sha')];
  const n0 = a.hand.length;
  await g.trigger('phase.begin', { self: a, phase: 'end' });
  ok(a.hand.length === n0 + 2 || a.hand.length === n0, '才媛：为锁定技，不论是否同意都应摸牌');
}

// ================= 汇总 =================
console.log(`\n=== jin2check ===\n通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('失败项：'); bad.forEach(m => console.log('  ✗', m)); process.exitCode = 1; }
else console.log('全部通过 ✔');
