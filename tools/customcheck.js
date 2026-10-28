// 玩家自定义武将 + 自定义配件牌（弩炮）守门测试
// 运行：node tools/customcheck.js
// 覆盖：①数据注册 ②谋略值上限/获取/消耗 ③【妙计】两种选项 + 每回合限一次
//      ④极·庞统【谋渊】任意弃牌得谋略 ⑤【持恒】死亡消耗谋略值复活 ⑥弩炮的距离/攻击范围/次数/判定
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

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });

// 可配置桩：over.index 选项下标 / over.seats 目标 / over.card 出牌（null=不出）/ over.yes
function mk(ids, over = {}) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const handler = (g, p, req) => {
    if (req.kind === 'confirm') return { yes: over.yes !== false };
    if (req.kind === 'targets') return { seats: (over.seats || [1]).slice(0, req.max || 1) };
    if (req.kind === 'choice') return { index: over.index !== undefined ? over.index : 0 };
    if (req.kind === 'card') {
      if (over.hasOwnProperty('card')) return over.card === null ? { cardId: null } : { cardId: over.card };
      return { cardId: (p.hand[0] || {}).id };
    }
    return null;
  };
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261025,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
const hasLog = (g, kw) => g.logs.some(l => String(l.text || l).includes(kw));

// ================= 1. 数据注册 =================
{
  const gd = generalById('custom_pangtong');
  ok(!!gd, 'custom_pangtong 数据缺失');
  ok(gd?.name === '极·庞统', `名称不符：${gd?.name}`);
  ok(gd?.kingdom === 'shu' && gd?.hp === 2, `势力/体力不符：${gd?.kingdom}/${gd?.hp}`);
  ok(gd?.pack === 'custom', `pack 应为 custom，实际 ${gd?.pack}`);
  for (const s of ['mouyuan', 'chiheng']) {
    ok(gd?.skills.includes(s), `极·庞统 技能列表缺少 ${s}`);
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && sk.name && sk.desc && sk.desc.length > 5, `技能 ${s} 缺少 name/desc`);
  }
  ok(PACK_CN.custom === '自定义', `PACK_CN.custom 不符：${PACK_CN.custom}`);
  ok(GENERALS.filter(g => g.pack === 'custom').length === 3, `custom 包将数应为 3，实际 ${GENERALS.filter(g => g.pack === 'custom').length}`);
}

// ================= 2. 弩炮牌面 =================
{
  const m = CARD_META.nupao;
  ok(!!m, 'CARD_META 缺少 nupao');
  ok(m?.cn === '弩炮', `弩炮中文名不符：${m?.cn}`);
  ok(m?.type === 'equip' && m?.sub === 'weapon', '弩炮应为武器');
  ok(m?.range === 7, `弩炮攻击范围应为 7，实际 ${m?.range}`);
  const ex = deckEntries('ex');
  ok(ex.filter(c => c.name === 'nupao').length === 0, `弩炮不应常驻牌堆（由【巧工】注入），实际 ${ex.filter(c => c.name === 'nupao').length}`);
  ok(ex.length === 180, `标准+军争应为 180 张（含火杀5/雷杀5/太平要术2/木牛流马2/霹雳车1/兵临城下2/奇正相生2），实际 ${ex.length}`);
}

// ================= 3. 谋略值基础 =================
{
  const g = mk(['custom_pangtong', 'sunquan']);
  const p = g.players[0];
  ok(p.moulue === 0 && p.moulueMax === 5, `初始谋略值应为 0/5，实际 ${p.moulue}/${p.moulueMax}`);
  ok(g.addMoulue(p, 3) === 3 && p.moulue === 3, 'addMoulue 应加 3 点');
  ok(g.addMoulue(p, 9) === 2 && p.moulue === 5, '谋略值应在上限 5 处截断');
  ok(g.useMoulue(p, 6) === false && p.moulue === 5, '谋略值不足时不应扣除');
  ok(g.useMoulue(p, 2) === true && p.moulue === 3, 'useMoulue 应扣 2 点');
  ok(g.hasMoulue(p) === true, 'hasMoulue 应为 true');
  p.moulue = 0;
  ok(g.hasMoulue(p) === false, '谋略值为 0 时 hasMoulue 应为 false');
}

// ================= 4. 谋渊：任意角色弃牌都获得谋略值 =================
{
  const g = mk(['custom_pangtong', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  p.moulue = 0;
  const c = card('t-disc', 'sha', 'spade', 7);
  t.hand.push(c);
  await g.discardCards(t, [c], { reason: 'mouyuan-test' });
  ok(p.moulue === 1, `【谋渊】：他人弃 1 张牌应得 1 点谋略值，实际 ${p.moulue}`);
  // 一次弃 2 张 → +2
  p.moulue = 0;
  const c2 = card('t-d2', 'sha', 'club', 8), c3 = card('t-d3', 'sha', 'club', 9);
  t.hand.push(c2, c3);
  await g.discardCards(t, [c2, c3], { reason: 'mouyuan-test2' });
  ok(p.moulue === 2, `【谋渊】：一次弃 2 张应得 2 点，实际 ${p.moulue}`);
  // 到上限截断
  p.moulue = 4;
  const c4 = card('t-d4', 'sha', 'club', 10), c5 = card('t-d5', 'sha', 'club', 11);
  t.hand.push(c4, c5);
  await g.discardCards(t, [c4, c5], { reason: 'mouyuan-test3' });
  ok(p.moulue === 5, `【谋渊】：应在上限 5 截断，实际 ${p.moulue}`);
  // 使用牌（出【杀】）后进入弃牌堆同样属于「一张牌进入弃牌堆」
  p.moulue = 0;
  p.flags.shaUsed = 0;
  t.hand = [];                       // 目标无手牌，避免测试桩返回非法【闪】
  const sha1 = card('t-sha1', 'sha', 'spade', 12);
  p.hand.push(sha1);
  await g.useCard({ from: p, card: sha1, targets: [t], reason: 'play' });
  ok(p.moulue >= 1, `【谋渊】：出【杀】后牌进弃牌堆也应获得谋略值（实际 ${p.moulue}）`);
  // 响应牌（【闪】）进弃牌堆同样触发
  p.moulue = 0;
  t.hand = [card('t-shan1', 'shan', 'heart', 2)];
  p.flags.shaUsed = 0;
  const sha2 = card('t-sha2', 'sha', 'club', 11);
  p.hand.push(sha2);
  await g.useCard({ from: p, card: sha2, targets: [t], reason: 'play' });
  ok(p.moulue >= 1, `【谋渊】：打出【闪】后牌进弃牌堆也应获得谋略值（实际 ${p.moulue}）`);
}

// ================= 5. 【妙计】无中生有（消耗 3 点）+ 每回合限一次 =================
{
  const g = mk(['custom_pangtong', 'sunquan'], { index: 1 });   // 第二项 = 消耗 3 → 无中生有
  const p = g.players[0];
  g.turnCount = 11;
  p.moulue = 0;
  ok(!g.activeSkillsOf(p).some(a => a.id === 'miaojii'), '无谋略值时不应出现【妙计】');
  p.moulue = 3;
  const acts = g.activeSkillsOf(p);
  ok(acts.some(a => a.id === 'miaojii'), '有谋略值时应出现【妙计】按钮（activeSkills）');
  const hand0 = p.hand.length;
  const r = await g.useActiveSkill(p, 'miaojii');
  ok(r === true, '【妙计】发动应成功');
  // 消耗 3 点后，虚拟【无中生有】进弃牌堆又触发己方【谋渊】+1 → 剩 1
  ok(p.moulue === 1, `【妙计】无中生有应消耗 3 点（虚拟牌进弃牌堆触发【谋渊】+1，应剩 1），实际剩余 ${p.moulue}`);
  ok(p.hand.length === hand0 + 2, `【妙计】无中生有应摸 2 张（${hand0} → ${p.hand.length}）`);
  ok(!g.activeSkillsOf(p).some(a => a.id === 'miaojii'), '本回合发动过后不应再出现【妙计】');
  // 同回合再给 3 点也不能再发动
  p.moulue = 3;
  const r2 = await g.useActiveSkill(p, 'miaojii');
  ok(r2 === false, '【妙计】每回合限一次，同回合不应再发动');
}

// ================= 6. 【妙计】过河拆桥（消耗 1 点） =================
{
  // 注意：此处 p0 用孙权而不是极·庞统——因为弃置目标牌会触发【谋渊】+1 谋略值，会干扰消耗断言
  const g = mk(['sunquan', 'custom_pangtong'], { index: 0, seats: [1], card: null });
  const p = g.players[0], t = g.players[1];
  g.turnCount = 21;
  p.moulue = 1;
  const targetCard = card('t-keep', 'tao', 'heart', 3);
  t.hand = [targetCard];
  const before = t.hand.length;
  const r = await g.useActiveSkill(p, 'miaojii');
  ok(r === true, '【妙计·过河拆桥】应发动成功');
  ok(p.moulue === 0, `过河拆桥应消耗 1 点，实际剩余 ${p.moulue}`);
  ok(t.hand.length < before, `过河拆桥应弃置目标 1 张牌（${before} → ${t.hand.length}）`);
  ok(hasLog(g, '妙计'), '日志应记录【妙计】');
}

// ================= 7. 持恒：死亡时消耗 1 点谋略值复活 =================
{
  const g = mk(['custom_pangtong', 'sunquan'], { yes: true });
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', { self: p, player: p });   // 【穷谋】在开局时挂上限
  ok(p.moulueMax === 10, `【穷谋】谋略值上限应为 10（实际 ${p.moulueMax}）`);
  p.moulue = 2;
  p.hp = 0;
  const dd = { self: p, killer: t };
  await g.trigger('death.before', dd);
  ok(dd.canceled === true, '【持恒】应取消本次死亡');
  // 2026-10-28：极·庞统新增【穷谋】，复活改为回满血
  ok(p.alive === true && p.hp === p.maxHp, `【持恒】+【穷谋】复活应回满血（hp=${p.hp}/${p.maxHp}）`);
  ok(p.moulue === 1, `【持恒】应消耗 1 点谋略值（剩余 ${p.moulue}）`);
  // 没有谋略值时不能复活
  const g2 = mk(['custom_pangtong', 'sunquan'], { yes: true });
  const p2 = g2.players[0];
  p2.moulue = 0; p2.hp = 0;
  const dd2 = { self: p2, killer: g2.players[1] };
  await g2.trigger('death.before', dd2);
  ok(dd2.canceled !== true, '没有谋略值时【持恒】不应复活');
}

// ================= 8. 弩炮：攻击范围 / 无视坐骑 / 距离 -1 =================
{
  const g = mk(['custom_pangtong', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  p.equips.weapon = card('w-nupao', 'nupao', 'diamond', 8);
  ok(g.attackRange(p) === 7, `装备弩炮后攻击范围应为 7，实际 ${g.attackRange(p)}`);
  // 目标装 +1 马：普通武器距离 1 → 2；弩炮无视坐骑且 -1 → 1
  t.equips.horsePlus = card('h1', 'chitu', 'heart', 5);
  ok(g.distance(p, t) === 1, `弩炮应无视目标坐骑并 -1 距离（实际 ${g.distance(p, t)}）`);
  p.equips.weapon = null;
  ok(g.distance(p, t) === 2, `不装弩炮时 +1 马应使距离为 2（实际 ${g.distance(p, t)}）`);
}

// ================= 9. 弩炮：出杀次数 +1 =================
{
  const g = mk(['custom_pangtong', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  p.equips.weapon = card('w-nupao', 'nupao', 'diamond', 8);
  const sha = card('sha-1', 'sha', 'spade', 7);
  ok(g.canUse(p, sha, [t]).ok === true, '弩炮：未出杀时应可使用【杀】');
  p.flags.shaUsed = 1;
  ok(g.canUse(p, sha, [t]).ok === true, '弩炮：出杀次数 +1，已出 1 张仍可使用');
  p.flags.shaUsed = 2;
  ok(g.canUse(p, sha, [t]).ok !== true, '弩炮：已出 2 张后应不可再使用');
}

// ================= 10. 弩炮：相邻出杀判定（红色伤害 +1 / 黑色次数 +1） =================
{
  // 红色判定
  const g = mk(['custom_pangtong', 'sunquan'], { card: null, yes: false });
  const p = g.players[0], t = g.players[1];
  p.equips.weapon = card('w-nupao', 'nupao', 'diamond', 8);
  p.hand = [card('sha-red', 'sha', 'spade', 7)];
  t.hand = [];
  g.deck.push(card('judge-red', 'tao', 'heart', 5));   // 牌堆顶（末尾）为红桃
  const hp0 = t.hp;
  await g.useCard({ from: p, card: p.hand[0], targets: [t], reason: 'play' });
  ok(t.hp === hp0 - 2, `弩炮红色判定应令【杀】伤害 +1（${hp0} → ${t.hp}）`);
  ok(hasLog(g, '弩炮'), '日志应记录【弩炮】判定');
}
{
  // 黑色判定
  const g = mk(['custom_pangtong', 'sunquan'], { card: null, yes: false });
  const p = g.players[0], t = g.players[1];
  p.equips.weapon = card('w-nupao', 'nupao', 'diamond', 8);
  p.hand = [card('sha-blk', 'sha', 'club', 7)];
  t.hand = [];
  g.deck.push(card('judge-blk', 'shan', 'spade', 6));
  await g.useCard({ from: p, card: p.hand[0], targets: [t], reason: 'play' });
  ok(p.flags.nupaoExtra === 1, `弩炮黑色判定应令本回合出杀次数 +1（实际 ${p.flags.nupaoExtra}）`);
}

// ================= 11. 快照下发谋略值 =================
{
  const g = mk(['custom_pangtong', 'sunquan']);
  const p = g.players[0];
  p.moulue = 4;
  const snap = g.snapshot(p.seat);
  const me = snap.players.find(x => x.seat === p.seat);
  ok(me.moulue === 4 && me.moulueMax === 5, `快照应下发谋略值（实际 ${me.moulue}/${me.moulueMax}）`);
  ok((me.activeSkills || []).some(a => a.id === 'miaojii'), '快照的 activeSkills 应包含【妙计】');
}

// ================= 12. 数据：神黄盖 2 体力 / 天工·诸葛亮 3 体力 =================
{
  ok(generalById('custom_pangtong')?.hp === 2, `极·庞统初始体力应为 2，实际 ${generalById('custom_pangtong')?.hp}`);
  const hg = generalById('custom_huanggai');
  ok(hg?.name === '神黄盖' && hg?.kingdom === 'shen' && hg?.hp === 2, `神黄盖数据不符：${hg?.name}/${hg?.kingdom}/${hg?.hp}`);
  ok(hg?.skills.length === 9, `神黄盖应有 9 个技能，实际 ${hg?.skills.length}`);
  const zg = generalById('custom_zhugeliang');
  ok(zg?.name === '天工·诸葛亮' && zg?.kingdom === 'shu' && zg?.hp === 3, `天工·诸葛亮数据不符：${zg?.name}/${zg?.kingdom}/${zg?.hp}`);
  ok(zg?.skills.length === 5, `天工·诸葛亮应有 5 个技能，实际 ${zg?.skills.length}`);
  for (const id of [...(hg?.skills || []), ...(zg?.skills || [])]) {
    ok(hasSkill(id), `技能 ${id} 未注册`);
    ok(getSkill(id)?.fallbackOf === undefined, `技能 ${id} 不得降级`);
  }
  ok(GENERALS.filter(g => g.pack === 'custom').length === 3, `custom 包将数应为 3，实际 ${GENERALS.filter(g => g.pack === 'custom').length}`);
  // 弩炮不常驻牌堆；朱雀羽扇常驻
  const ex = deckEntries('ex');
  ok(ex.filter(c => c.name === 'nupao').length === 0, '弩炮不应常驻军争牌堆');
  ok(ex.filter(c => c.name === 'zhuque').length === 1, '朱雀羽扇应在牌堆中');
}

// ================= 13. 神黄盖：铁壁 / 舍甲 / 焚身 / 蓄甲 =================
{
  const g = mk(['custom_huanggai', 'sunquan'], { yes: true, index: 0 });
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', { self: p, player: p });
  ok(p.armorMax === 10, `【铁壁】护甲上限应为 10，实际 ${p.armorMax}`);
  // 舍甲①：失 1 护甲摸 2
  p.armor = 3; p.flags = {}; g.turnCount = 31;
  const hand0 = p.hand.length;
  await g.useActiveSkill(p, 'shejia');
  ok(p.armor === 2, `【舍甲】应失去 1 点护甲（实际 ${p.armor}）`);
  ok(p.hand.length === hand0 + 2, `【舍甲】应摸 2 张（${hand0} → ${p.hand.length}）`);
  // 舍甲②：减 1 体力上限摸 4（护甲为 0 时只剩此项）
  p.armor = 0; p.maxHp = 4; p.hp = 4; p.flags = {}; g.turnCount = 32;
  const hand1 = p.hand.length;
  await g.useActiveSkill(p, 'shejia');
  ok(p.maxHp === 3, `【舍甲】应减 1 点体力上限（实际 ${p.maxHp}）`);
  ok(p.hand.length === hand1 + 4, `【舍甲】应摸 4 张（${hand1} → ${p.hand.length}）`);
  // 焚身：受到 2 点伤害 → 取消，失去 3 点体力，获得 9 点护甲
  p.hp = 10; p.maxHp = 10; p.armor = 0;
  const d = { self: p, player: p, to: p, amount: 2, from: t };
  await g.trigger('damage.before', d);
  ok(d.canceled === true, '【焚身】应取消本次伤害');
  ok(p.armor === 9, `【焚身】失去 3 点体力应获得 9 点护甲（实际 ${p.armor}）`);
  ok(p.hp === 7, `【焚身】应失去 3 点体力（10 → ${p.hp}）`);
  // 蓄甲：X = 上限 - 体力 = 2（≤3）→ 摸 3
  p.maxHp = 4; p.hp = 2; g.turnCount = 33;
  const hand2 = p.hand.length;
  await g.trigger('turn.begin', { self: p, player: p });
  ok(p.hand.length === hand2 + 3, `【蓄甲】差额 2 应摸 3 张（${hand2} → ${p.hand.length}）`);
}

// ================= 14. 神黄盖：铸甲 / 馈甲 / 复燃 =================
{
  const g = mk(['custom_huanggai', 'sunquan'], { yes: true, index: 0 });
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', { self: p, player: p });
  // 铸甲：弃 1 张得 1 护甲，每回合限两次
  p.armor = 0; p.flags = {}; g.turnCount = 41;
  p.hand = [card('z1', 'sha', 'spade', 3), card('z2', 'sha', 'club', 4), card('z3', 'shan', 'heart', 5), card('z4', 'tao', 'diamond', 6)];
  const hz0 = p.hand.length;
  await g.useActiveSkill(p, 'zhujia');
  ok(p.armor === 1, `【铸甲】应获得 1 点护甲（实际 ${p.armor}）`);
  ok(p.hand.length === hz0 - 1, `【铸甲】应只弃置 1 张牌（${hz0} → ${p.hand.length}）`);
  const cnt = p.flags[`zhujia_41`] || 0;
  ok(cnt === 1, `【铸甲】计数应为 1（实际 ${cnt}）`);
  // 每回合限两次：第 2 次可发动，第 3 次被拒
  await g.useActiveSkill(p, 'zhujia');
  ok(p.armor === 2, `【铸甲】第 2 次应再获得 1 点护甲（实际 ${p.armor}）`);
  const hz1 = p.hand.length;
  await g.useActiveSkill(p, 'zhujia');
  ok(p.armor === 2 && p.hand.length === hz1, `【铸甲】每回合限两次（护甲 ${p.armor}，手牌 ${p.hand.length}）`);
  // 馈甲：给 1 张牌 + 失去 1 体力
  p.hand = [card('k1', 'sha', 'spade', 7)]; p.hp = 5; p.maxHp = 10;
  const th = t.hand.length;
  await g.useActiveSkill(p, 'kuijia');
  ok(t.hand.length === th + 1, `【馈甲】应交给目标 1 张牌（${th} → ${t.hand.length}）`);
  ok(p.hp === 4, `【馈甲】应失去 1 点体力（实际 ${p.hp}）`);
  // 复燃：护甲 4、死亡 → 复活，上限 +2，体力 4，摸 5，失去一个技能
  p.armor = 4; p.hp = 0; p.maxHp = 2; p.flags = { fuyanUsed: false };
  const skills0 = p.skills.length;
  const dd = { self: p, player: p, killer: t };
  await g.trigger('death.before', dd);
  ok(dd.canceled === true && p.alive === true, '【复燃】应复活');
  ok(p.maxHp === 4, `【复燃】体力上限应 +2（实际 ${p.maxHp}）`);
  ok(p.hp === 4, `【复燃】应回复至 4 点体力（实际 ${p.hp}）`);
  ok(p.skills.length === skills0 - 1, `【复燃】应失去一个技能（${skills0} → ${p.skills.length}）`);
  // 限定：第二次死亡不能再用
  p.hp = 0; p.armor = 4;
  const dd2 = { self: p, player: p, killer: t };
  await g.trigger('death.before', dd2);
  ok(dd2.canceled !== true, '【复燃】限定技用过一次后不应再复活');
}

// ================= 15. 天工·诸葛亮：巧工（弩炮仅此时入堆 + 巧装备 + 工标记） =================
{
  const g = mk(['custom_zhugeliang', 'sunquan'], { yes: true, index: 0 });
  const p = g.players[0];
  ok(g.deck.filter(c => c.name === 'nupao').length === 0, '开局牌堆不应含弩炮');
  await g.trigger('game.start', { self: p, player: p });
  const nupaoTotal = g.deck.filter(c => c.name === 'nupao').length
    + (p.equips.weapon?.name === 'nupao' ? 1 : 0)
    + g.discardPile.filter(c => c.name === 'nupao').length;
  ok(nupaoTotal === 1, `【巧工】应把 1 张弩炮加入牌堆（实际 ${nupaoTotal}）`);
  ok(['nupao', 'zhuge', 'zhuque'].includes(p.equips.weapon?.name), `【巧工】应获得巧武器（实际 ${p.equips.weapon?.name}）`);
  ok(['bagua', 'tengjia'].includes(p.equips.armor?.name), `【巧工】应获得巧防具（实际 ${p.equips.armor?.name}）`);
  // 失去装备牌 → +1 工
  const gong0 = g.gongOf(p);
  const w = p.equips.weapon;
  p.equips.weapon = null;
  await g.trigger('equip.lose', { self: p, player: p, card: w, slot: 'weapon' });
  ok(g.gongOf(p) === gong0 + 1, `【巧工】失去装备牌应 +1 工（${gong0} → ${g.gongOf(p)}）`);
}

// ================= 16. 天工·诸葛亮：天机 / 谋 + 付费 =================
{
  const g = mk(['custom_zhugeliang', 'sunquan'], { yes: true, index: 0 });
  const p = g.players[0], t = g.players[1];
  await g.trigger('turn.begin', { self: t, player: p });
  ok(p.extraZone.tianji.length === 1, '【天机】任意角色回合开始应把牌堆顶置为「天机」');
  const tz = p.extraZone.tianji[0];
  ok(tz && p.hand.includes(tz) && tz.__tz === 'tianji', '「天机」应同时视为手牌');
  // 天机无上限：再来两个回合开始 → 累积 3 张
  await g.trigger('turn.begin', { self: p, player: p });
  await g.trigger('turn.begin', { self: t, player: p });
  ok(p.extraZone.tianji.length === 3, `「天机」应无数量上限（期望 3 张，实际 ${p.extraZone.tianji.length}）`);
  await g.trigger('round.begin', { self: t, player: p, round: 2 });
  ok(p.extraZone.tianji.length === 0 && p.extraZone.mou.length === 3, `【天机】每轮开始应把全部「天机」转为「谋」（天机 ${p.extraZone.tianji.length} / 谋 ${p.extraZone.mou.length}）`);
  ok(p.extraZone.mou.includes(tz) && tz.__mou === true, '转为「谋」后仍视为手牌并带「谋」标记');
  ok(p.hand.includes(tz), '转为「谋」后仍视为手牌');
  // 使用「谋」时付 1 点体力（hp>1 且工=0 → 只能付体力）
  p.marks.gong = 0;
  p.hp = 3; p.maxHp = 3; p.flags.shaUsed = 0;
  tz.name = 'sha'; tz.suit = 'spade'; tz.num = 9;
  const hp0 = p.hp;
  await g.useCard({ from: p, card: tz, targets: [t], reason: 'play' });
  ok(p.hp === hp0 - 1, `使用「天机/谋」应扣 1 点体力（${hp0} → ${p.hp}）`);
  ok(!p.extraZone.mou.includes(tz), '「谋」被使用后牌位应清空');
}

// ================= 17. 天工·诸葛亮：造极 + 连击弩炮 =================
{
  const g = mk(['custom_zhugeliang', 'sunquan'], { yes: true, index: 0 });
  const p = g.players[0], t = g.players[1];
  p.marks.gong = 6;
  p.equips.weapon = card('w-qg', 'qinggang', 'spade', 6);
  await g.useActiveSkill(p, 'zaoji');
  ok(p.flags.lianji === true, '【天工·造极】应获得「连击弩炮」');
  ok(p.flags.disabledEquip?.weapon === true, '【天工·造极】应废除武器区');
  // ★SG033 P0-2 后弃置武器会真实派发 equip.lose，【巧工】因此 +1「工」：
  //   造极 -5、巧工失去装备 +1 → 6-5+1 = 2（此前静默置空不派发，才恒为 1）
  ok(g.gongOf(p) === 2, `【天工·造极】应移去 5 点工、失去装备再由【巧工】+1（剩 ${g.gongOf(p)}）`);
  ok(g.distance(p, t) === 1, `「连击弩炮」应令距离视为 1（实际 ${g.distance(p, t)}）`);
  p.hand = [card('sha-lj', 'sha', 'spade', 7)];
  p.flags.shaUsed = 0;
  await g.useCard({ from: p, card: p.hand[0], targets: [t], reason: 'play' });
  ok(p.flags.skip_discard === true, '「连击弩炮」使用【杀】应跳过弃牌阶段');
  ok(g.extraQueue.includes(p), '「连击弩炮」使用【杀】应获得额外回合');
}

// ================= 18. 天工·登峰：两项后续效果分别询问是否发动 =================
{
  // 用例 A：两问都答「是」→ ①弃 1 张手牌得 1 工 ②移除 1 工取 1 张观看牌
  const g = mk(['custom_zhugeliang', 'sunquan'], { yes: true, index: 0 });
  const p = g.players[0];
  p.marks.gong = 3;
  p.hand = [card('d1', 'sha', 'spade', 3), card('d2', 'shan', 'heart', 4)];
  const asked = [];
  g.responder.ask = async (gg, pl, req) => {
    const pr = req.prompt || '';
    asked.push(`${req.kind}:${pr}`);
    if (req.kind === 'confirm') return { yes: true };                 // 两问都发动
    if (req.kind === 'choice') {
      if (pr.includes('选择移除的「工」数（当前')) return { index: 0 };  // 第一问：不移工（X=0）
      if (pr.includes('选择弃置张数')) return { index: 1 };             // 弃 1 张
      if (pr.includes('选择移除的「工」数')) return { index: 1 };       // 移除 1 点工
      return { index: 0 };
    }
    return null;
  };
  const h0 = p.hand.length;
  await g.trigger('round.begin', { self: p, player: p, round: 3 });
  ok(asked.filter(a => a.startsWith('confirm:') && (a.includes('弃置若干手牌') || a.includes('移除「工」标记'))).length === 2,
    `【天工·登峰】：两项后续效果应各自单独询问（实际 ${asked.filter(a => a.includes('弃置若干手牌') || a.includes('移除「工」标记')).length} 次）`);
  ok(asked.some(a => a.includes('是否弃置若干手牌')) && asked.some(a => a.includes('是否移除「工」标记')),
    '【天工·登峰】：两次询问应分别对应「弃手牌得工」与「移工取牌」');
  ok(g.gongOf(p) === 3, `【天工·登峰】：弃 1 张得 1 工、移除 1 工取 1 张 → 工应仍为 3（实际 ${g.gongOf(p)}）`);
  ok(p.hand.length === h0, `【天工·登峰】：弃 1 取 1 → 手牌数不变（${h0} → ${p.hand.length}）`);

  // 用例 B：只发动①（弃手牌得工），②拒绝 → 手牌 -1、工 +1
  const g2 = mk(['custom_zhugeliang', 'sunquan'], { yes: true, index: 0 });
  const p2 = g2.players[0];
  p2.marks.gong = 1;
  p2.hand = [card('e1', 'sha', 'spade', 5), card('e2', 'shan', 'heart', 6)];
  let ci = 0;
  g2.responder.ask = async (gg, pl, req) => {
    const pr = req.prompt || '';
    if (req.kind === 'confirm') {
      if (pr.includes('是否移除「工」标记')) return { yes: false };     // 第二问拒绝
      return { yes: true };                                            // 技能总开关 + 第一问
    }
    if (req.kind === 'choice') {
      if (pr.includes('选择移除的「工」数（当前')) return { index: 0 };
      if (pr.includes('选择弃置张数')) return { index: 1 };
      return { index: 0 };
    }
    return null;
  };
  const h1 = p2.hand.length;
  await g2.trigger('round.begin', { self: p2, player: p2, round: 4 });
  ok(p2.hand.length === h1 - 1, `【天工·登峰】：只发动①时应净弃 1 张（${h1} → ${p2.hand.length}）`);
  ok(g2.gongOf(p2) === 2, `【天工·登峰】：只发动①时应 +1 工（期望 2，实际 ${g2.gongOf(p2)}）`);

  // 用例 C：技能发动、但两项后续都拒绝 → 牌与工都不变
  const g3 = mk(['custom_zhugeliang', 'sunquan'], { yes: true, index: 0 });
  const p3 = g3.players[0];
  p3.marks.gong = 1;
  p3.hand = [card('f1', 'sha', 'spade', 8), card('f2', 'shan', 'heart', 9)];
  g3.responder.ask = async (gg, pl, req) => {
    const pr = req.prompt || '';
    if (req.kind === 'confirm') {
      if (pr.includes('弃置若干手牌') || pr.includes('移除「工」标记')) return { yes: false };
      return { yes: true };
    }
    if (req.kind === 'choice') return { index: 0 };
    return null;
  };
  const h2 = p3.hand.length;
  await g3.trigger('round.begin', { self: p3, player: p3, round: 5 });
  ok(p3.hand.length === h2 && g3.gongOf(p3) === 1, `【天工·登峰】：两问都拒绝时不应变化（手牌 ${p3.hand.length}，工 ${g3.gongOf(p3)}）`);
}

// ================= 19. 焚身：护甲必须在「失去体力（进入濒死求桃）」之前结算 =================
{
  const g = mk(['custom_huanggai', 'sunquan'], { yes: true, index: 0 });
  const p = g.players[0];
  p.hp = 2; p.armor = 0; p.armorMax = 10;
  const d = { self: p, player: p, to: p, amount: 1, canceled: false };
  await g.trigger('damage.before', d);
  ok(d.canceled === true, '【焚身】：应取消原伤害');
  ok(p.hp === 1, `【焚身】：1 点伤害 → 失去 2×1-1=1 点体力（实际 hp=${p.hp}）`);
  ok(p.armor === 3, `【焚身】：每失去 1 点体力得 3 点护甲，且须在失去体力之前发放（实际 ${p.armor}）`);
  // 一次扣 1 点体力即可能进入濒死：护甲此刻必须已在位（不能等 loseHp 循环结束才加）
  const g2 = mk(['custom_huanggai', 'sunquan'], { yes: true, index: 0 });
  const p2 = g2.players[0];
  p2.hp = 1; p2.armor = 0; p2.armorMax = 10;
  const d2 = { self: p2, player: p2, to: p2, amount: 1, canceled: false };
  await g2.trigger('damage.before', d2);
  ok(p2.armor === 3, `【焚身】：濒死前的护甲应为 3（否则【复燃】armor>0 条件失效，实际 ${p2.armor}）`);
}

// ================= 20. 天工·登峰：观看的牌面不得写进公共日志 =================
{
  const g = mk(['custom_zhugeliang', 'sunquan'], { yes: false, index: 0 });
  const p = g.players[0];
  p.marks.gong = 2;
  const asked = [];
  let firstAsk = true;
  g.responder.ask = async (gg, pl, req) => {
    asked.push(`${req.kind}:${req.prompt || ''}`);
    if (req.kind === 'confirm') {
      if (firstAsk) { firstAsk = false; return { yes: true }; }   // 先同意发动登峰，后续两项都拒绝
      return { yes: false };
    }
    if (req.kind === 'choice') return { index: 0 };
    return null;
  };
  await g.trigger('round.begin', { self: p, player: p, round: 7 });
  const viewLine = (g.logs || []).map(e => e.text).find(t => t.includes('观看牌堆顶'));
  ok(!!viewLine, '【天工·登峰】：应记录一条「观看牌堆顶」日志');
  ok(viewLine && viewLine.includes('仅本人可见') && !/[♠♥♣♦]/.test(viewLine),
    `【天工·登峰】：公共日志不应列出牌面（实际：${viewLine}）`);
  ok(asked.some(a => a.includes('观看的牌为')), '【天工·登峰】：牌面应写进只发给本人的询问提示');
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败项：'); bad.forEach(m => console.log('  ✗', m)); process.exit(1); }
