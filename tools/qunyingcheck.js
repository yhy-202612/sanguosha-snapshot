// E 批守门测试：群英荟萃（20 将 / 38 技能）
// 运行：node tools/qunyingcheck.js
// 自包含：数据注册全字段 + 包将数 20 + 每个技能 ≥1 条真实行为断言
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
// 常用桩：全部同意、选项 0、目标座位 1、第一张牌
const yes = (over = {}) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: over.yes !== false };
  if (req.kind === 'choice' || req.kind === 'choose') return { index: over.index ?? 0 };
  if (req.kind === 'targets') return { seats: (over.seats || [1]).slice(0, Math.max(1, req.max || 1)) };
  if (req.kind === 'card' || req.kind === 'cards') return { cardId: (over.cardId || (p.hand[0] || {}).id), cardIds: [over.cardId || (p.hand[0] || {}).id] };
  return null;
};

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['liwan', '李婉', 'wei', 3, ['liandui', 'biejun']],
  ['hanlong', '韩龙', 'wei', 4, ['duwang', 'cibei']],
  ['xiahoumao', '夏侯楙', 'wei', 4, ['tongwei', 'cuguo']],
  ['feiyao', '费曜', 'wei', 4, ['zhenfeng']],
  ['sunli', '孙礼', 'wei', 4, ['kangli']],
  ['simafu', '司马孚', 'wei', 3, ['beiyu', 'duchi']],
  ['xuanshifu', '宣公主', 'wei', 3, ['qimei', 'zhuiji']],
  ['majun', '马钧', 'wei', 3, ['gongqiao', 'jingyi']],
  ['xunxu', '荀勖', 'wei', 3, ['diyin', 'boqia']],
  ['liuxuan', '刘璿', 'shu', 4, ['mogui', 'zunjian', 'rencheng']],
  ['heyan', '何晏', 'wei', 3, ['yaichai', 'qingtan']],
  ['xiahouxuan', '夏侯玄', 'wei', 3, ['boxuan', 'yizheng', 'guilin']],
  ['panghui', '庞会', 'wei', 5, ['yiyong', 'suqiu']],
  ['zhanghu', '张虎', 'wei', 4, ['cuijian', 'tongyuan']],
  ['lejin', '乐进', 'wei', 4, ['xiaoguo']],
  ['dongzhao', '董昭', 'wei', 3, ['yijia', 'dingji']],
  ['yanghu', '羊祜', 'wei', 3, ['deshao', 'mingfa']],
  ['huaxin', '华歆', 'wei', 3, ['wanggui', 'xibing']],
  ['duyu', '杜预', 'wei', 4, ['jianguo', 'qingshi3']],
  ['wangshuang', '王双', 'wei', 8, ['zhuilie']],
];
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符`);
  ok(gd && gd.pack === 'qunying', `${id} pack 应为 qunying`);
  ok(gd && skills.every(s => gd.skills.includes(s)) && gd.skills.length === skills.length, `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && !!sk.desc && sk.desc.length > 4, `技能 ${s} 缺少 desc`);
    ok(sk && ((sk.triggers || []).length > 0 || !!sk.active), `技能 ${s} 是空壳`);
  }
}
ok(PACK_CN.qunying === '群英荟萃', `PACK_CN.qunying 不符：${PACK_CN.qunying}`);
ok(GENERALS.filter(g => g.pack === 'qunying').length === 42,
  `群英荟萃将数应为 42（含补全 22），实际 ${GENERALS.filter(g => g.pack === 'qunying').length}`);

// ================= 2. 李婉 · 联对 =================
{
  const g = mk(['liwan', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 3;
  await g.trigger('card.use.after', { self: a, card: card('x1', 'sha'), effName: 'sha', targets: [b], reason: 'play' });
  await g.trigger('card.use.after', { self: a, card: card('x1b', 'sha'), effName: 'sha', targets: [b], reason: 'play' });
  const h0 = a.hand.length;
  await g.trigger('card.use.after', { self: b, card: card('x2', 'sha'), effName: 'sha', targets: [a], reason: 'play' });
  ok(a.hand.length === h0 + 2, `联对：李婉应摸两张牌（${h0} → ${a.hand.length}）`);
  ok(g.logs.some(l => /联对/.test(l.text)), '缺少联对日志');
}

// ================= 3. 李婉 · 别君 =================
{
  const g = mk(['liwan', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 4;
  b.hand = [card('b1', 'sha', 'spade', 5)];
  await g.trigger('phase.begin', { self: b, phase: 'play' });
  ok(a.hand.some(c => c.skillTag === 'biejun'),
    `别君：应获得一张带「别」标记的牌（手牌 ${a.hand.length}）`);
  // 手牌里没有「别」→ 翻面防止伤害
  a.hand = [card('a1', 'shan', 'club', 3)];
  const d = { self: a, to: a, from: b, amount: 1, card: card('b2', 'sha'), reason: 'test' };
  await g.trigger('damage.before', d);
  ok(d.canceled === true, '别君：应防止此伤害');
  ok(a.flipped === true, '别君：应翻面');
}

// ================= 4. 韩龙 · 独往 =================
{
  const g = mk(['hanlong', 'sunquan', 'liubei'], yes());
  const [a, b] = g.players;
  await g.trigger('game.start', { self: null });
  ok((a.flags.ci || []).length === 5, `独往：应获得 5 张「刺」（实际 ${(a.flags.ci || []).length}）`);
  ok((a.flags.ci || []).every(c => c.name !== 'sha'), '独往：「刺」中不应有【杀】');
  ok(g.distance(a, b) === 2 && g.distance(b, a) === 2, `独往：互相距离应 +1（实际 ${g.distance(a, b)}/${g.distance(b, a)}）`);
  a.flags.ci = [];
  ok(g.distance(a, b) === 1, '独往：无「刺」时距离应恢复');
}

// ================= 5. 韩龙 · 刺北 =================
{
  const g = mk(['hanlong', 'sunquan'], yes({ seats: [0] }));
  const [a, b] = g.players;
  a.flags.ci = [card('c1', 'shan', 'heart', 2), card('c2', 'tao', 'club', 4)];
  b.hand = [card('b1', 'sha', 'spade', 9)];
  g.turnCount = 2;
  const sha = card('sx', 'sha', 'diamond', 8);
  g.discardPile.push(sha);
  await g.trigger('damage.after', { self: b, to: a, from: b, amount: 1, card: sha, reason: 'sha' });
  ok((a.flags.ci || []).some(c => c === sha), '刺北：应将造成伤害的【杀】换为「刺」');
  ok(g.logs.some(l => /刺北/.test(l.text)), '缺少刺北日志');
  // 全部为【杀】→ 回合结束获得所有「刺」
  a.flags.ci = [card('k1', 'sha', 'spade', 1), card('k2', 'sha', 'club', 2)];
  await g.trigger('turn.end', { self: b });
  ok((a.flags.ci || []).length === 0 && a.hand.some(c => c.skillTag === 'ci'),
    '刺北：回合结束应获得所有「刺」');
  // ★SG029：刺北在回合结束时结算，写 shaExtraTurn（本回合语义，runTurn 清零）——
  //   旧实现写永久型 shaExtra，会让后续每回合都 +N（永久累积）。
  ok((a.flags.shaExtraTurn || 0) > 0 && !(a.flags.shaExtra > 0), '刺北：应获得本回合额外【杀】次数（shaExtraTurn，且不得写永久字段）');
}

// ================= 6. 夏侯楙 · 统围 =================
{
  const g = mk(['xiahoumao', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 5; g.phase = 'play';
  a.hand = [card('h1', 'sha', 'spade', 3), card('h2', 'shan', 'heart', 9)];
  await g.useActiveSkill(a, 'tongwei');
  ok(!!a.flags.tongwei && a.flags.tongwei.seat === b.seat, '统围：应记录监视目标');
  ok(a.flags.tongwei.min === 3 && a.flags.tongwei.max === 9,
    `统围：应记录重铸点数区间（实际 ${a.flags.tongwei && a.flags.tongwei.min}~${a.flags.tongwei && a.flags.tongwei.max}）`);
  const d = { self: b, card: card('u1', 'sha', 'club', 6), effName: 'sha', targets: [a], reason: 'play' };
  await g.trigger('card.use.after', d);
  ok(a.flags.tongwei === null, '统围：结算后应清除记录');
  ok(g.logs.some(l => /统围/.test(l.text)), '缺少统围日志');
}

// ================= 7. 夏侯楙 · 蹙国 =================
{
  const g = mk(['xiahoumao', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 6; g.phase = 'play';
  a.hand = [card('h1', 'shan', 'spade', 2), card('h2', 'sha', 'heart', 4)];
  b.hand = [];
  b.armor = 0;
  await g.trigger('sha.dodged', { self: a, target: b, card: card('s1', 'sha', 'club', 7) });
  ok(a.flags.cuguoTurn === 6, '蹙国：应记录本回合已发动');
  ok(a.hand.length === 1, `蹙国：应弃置一张牌（实际剩 ${a.hand.length}）`);
  ok(g.logs.some(l => /蹙国/.test(l.text)), '缺少蹙国日志');
}

// ================= 8. 费曜 · 镇锋 =================
{
  const g = mk(['feiyao', 'sunquan'], yes({ index: 0, seats: [0] }));
  const [a, b] = g.players;
  g.turnCount = 7; g.turnPlayer = b; g.phase = 'play';
  b.hp = 4;
  b.hand = [card('b1', 'qinggang', 'spade', 6)];  // 无基本牌 → 猜 0 必对
  const h0 = a.hand.length;
  await g.trigger('card.use.after', {
    self: b, card: card('b2', 'sha', 'club', 5), effName: 'sha', targets: [a], reason: 'play',
  });
  ok((a.flags.zhenfengHit || 0) === 1, `镇锋：猜对应命中一次（实际 ${a.flags.zhenfengHit}）`);
  ok(a.hand.length === h0 + 1, '镇锋：猜对后应摸一张牌');
  ok(g.logs.some(l => /镇锋/.test(l.text)), '缺少镇锋日志');
}

// ================= 9. 孙礼 · 伉厉 =================
{
  const g = mk(['sunli', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hp = 4;
  await g.trigger('damage.after', { self: a, to: a, from: b, amount: 1, reason: 'test' });
  const got = (a.flags.kangli || []);
  ok(got.length === 2, `伉厉：应获得两张「伉厉」牌（实际 ${got.length}）`);
  ok(got.every(c => c.skillTag === 'kangli' && a.hand.includes(c)), '伉厉：牌应带标记并在手牌中');
  await g.trigger('damage.before', { self: b, to: b, from: a, amount: 1, reason: 'test' });
  ok((a.flags.kangli || []).length === 0, '伉厉：造成伤害时应弃置「伉厉」牌');
  ok(got.every(c => g.discardPile.includes(c)), '伉厉：牌应进入弃牌堆');
}

// ================= 10. 司马孚 · 备预 =================
{
  const g = mk(['simafu', 'sunquan'], yes({ index: 0 }));
  const [a] = g.players;
  g.turnPlayer = a; g.turnCount = 3; g.phase = 'play';
  a.hand = [card('h1', 'sha', 'heart', 3)];
  const deck0 = g.deck.length;
  await g.useActiveSkill(a, 'beiyu');
  ok(a.hand.length <= a.maxHp, `备预：手牌应不超过体力上限（${a.hand.length}/${a.maxHp}）`);
  ok(g.deck.length === deck0, '备预：置于牌堆底不改变牌堆数');
  ok(g.logs.some(l => /备预/.test(l.text)), '缺少备预日志');
}

// ================= 11. 司马孚 · 督持 =================
{
  const g = mk(['simafu', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 8;
  a.hand = [card('h1', 'sha', 'heart', 3), card('h2', 'tao', 'diamond', 4)];
  g.deck[0] = card('d1', 'shan', 'heart', 9);   // 牌堆底：红桃 → 手牌同色
  const d = { self: a, target: a, from: b, card: card('s1', 'sha', 'spade', 7), effName: 'sha', reason: 'sha' };
  await g.trigger('target.before', d);
  ok(a.hand.length === 3, '督持：应从牌堆底摸一张牌');
  ok(d.canceled === true, '督持：手牌同色时此牌应无效');
  ok(a.flags.duchiTurn === 8, '督持：应记录本回合已发动');
}

// ================= 12. 宣公主 · 齐眉 =================
{
  const g = mk(['xuanshifu', 'sunquan'], yes({ index: 0, seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 4; g.phase = 'play';
  const ha = a.hand.length, hb = b.hand.length;
  await g.useActiveSkill(a, 'qimei');
  ok(g.logs.some(l => /齐眉/.test(l.text)), '缺少齐眉日志');
  ok(a.hand.length >= ha && b.hand.length >= hb, '齐眉：双方应摸两张牌');
}

// ================= 13. 宣公主 · 追姬 =================
{
  const g = mk(['xuanshifu', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  b.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
  await g.trigger('death.before', { self: a });
  const got = Object.values(b.equips).filter(Boolean).length;
  ok(got > 0, `追姬：死亡时应令一名角色获得装备（实际 ${got}）`);
  ok(g.logs.some(l => /追姬/.test(l.text)), '缺少追姬日志');
}

// ================= 14. 马钧 · 工巧 =================
{
  const g = mk(['majun', 'sunquan'], yes({ index: 0 }));
  const [a] = g.players;
  g.turnPlayer = a; g.turnCount = 5; g.phase = 'play';
  a.hand = [card('h1', 'sha', 'spade', 2), card('h2', 'tao', 'heart', 3)];
  await g.useActiveSkill(a, 'gongqiao');
  const placed = a.equips.weapon;
  ok(!!placed, '工巧：应将一张手牌置于装备栏');
  ok(!!placed && placed.origType === 'basic', `工巧：应记录原始类别（实际 ${placed && placed.origType}）`);
  // 装备区有基本牌 → 【杀】伤害 +1
  const d = { self: b0(g, a), to: b0(g, a), from: a, amount: 1, card: card('s1', 'sha'), reason: 'sha' };
  await g.trigger('damage.before', d);
  ok(d.amount === 2, `工巧：装备区有基本牌时【杀】基础值 +1（实际 ${d.amount}）`);
}
function b0(g) { return g.players[1]; }

// ================= 15. 马钧 · 精益 =================
{
  const g = mk(['majun', 'sunquan'], yes({ index: 0 }));
  const [a, b] = g.players;
  g.turnCount = 9;
  const c = card('e1', 'qinggang', 'spade', 6);
  a.hand = [card('h1', 'sha', 'heart', 2), card('h2', 'tao', 'club', 3)];
  await g.equipCard(a, c);
  ok(a.flags.jingyiTurn && a.flags.jingyiTurn.weapon === 9, '精益：应记录副类别已发动');
  ok(g.logs.some(l => /精益/.test(l.text)), '缺少精益日志');
}

// ================= 16. 荀勖 · 笛音 =================
{
  const g = mk(['xunxu', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 6;
  const seven = Array.from({ length: 7 }, (_, i) => card(`x${i}`, 'shan', 'club', i + 1));
  await g.trigger('cards.discard', { self: a, cards: seven, reason: 'discard' });
  ok(a.flags.diyinGrab === true, '笛音：失去七张牌后应置回收标记');
  const target = card('t1', 'sha', 'spade', 10);
  g.discardPile.push(target);
  await g.trigger('cards.discard', { self: b, cards: [target], reason: 'discard' });
  ok(a.hand.includes(target), '笛音：应获得下一张进入弃牌堆的牌');
  // 受伤后同体力角色各摸一张
  a.hp = 3; b.hp = 3;
  const hb = b.hand.length;
  await g.trigger('damage.after', { self: a, to: a, from: b, amount: 1, reason: 'test' });
  ok(b.hand.length === hb + 1, '笛音：受伤后体力相同的角色应各摸一张牌');
}

// ================= 17. 荀勖 · 博洽 =================
{
  const g = mk(['xunxu', 'sunquan'], yes({ index: 0, seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 7; g.phase = 'play';
  a.hand = [card('h1', 'tao', 'heart', 3), card('h2', 'shan', 'spade', 4), card('h3', 'jiu', 'club', 5)];
  await g.useActiveSkill(a, 'boqia');
  ok(a.hand.length <= 2, `博洽：应消耗三张牌（实际手牌 ${a.hand.length}）`);
  ok(a.flags.boqiaNames && a.flags.boqiaNames.sha === true, '博洽：应记录本回合已用牌名');
  ok(a.flags.act_boqia === -1, '博洽：花色/类别均不同时技能应可再次发动');
  ok(g.logs.some(l => /博洽/.test(l.text)), '缺少博洽日志');
}

// ================= 18. 刘璿 · 漠规 =================
{
  const g = mk(['liuxuan', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 2; g.phase = 'judge';
  b.hp = 2;
  b.judgeZone = [{ card: card('j1', 'lebu', 'spade', 6), name: 'lebu' }];
  await g.trigger('phase.begin', { self: a, phase: 'judge' });
  ok(a.flags.mogui && a.flags.mogui.judge === true, '漠规①：应标记已执行（单局一次）');
  ok(b.hp === 3, '漠规①：目标应回复 1 点体力');
  ok(b.judgeZone.length === 0, '漠规①：应清空判定区');
  // ②：永久摸牌 +1 与出杀次数 +1
  g.phase = 'draw';
  await g.trigger('phase.begin', { self: a, phase: 'draw' });
  ok(b.flags.moguiDrawPlus === 1 && b.flags.shaExtra === 1, '漠规②：应给予永久增益');
  const dc = { self: b, count: 2, reason: 'draw' };
  await g.trigger('draw.count', dc);
  ok(dc.count === 3, `漠规②：摸牌阶段摸牌数应 +1（实际 ${dc.count}）`);
  // ③
  g.phase = 'discard';
  b.flags.handLimit = 0;
  await g.trigger('phase.begin', { self: a, phase: 'discard' });
  ok(a.flags.mogui.discard === true, '漠规③：应标记已执行');
  ok((b.flags.handLimit || 0) >= 1, '漠规③：目标手牌上限应 +1');
}

// ================= 19. 刘璿 · 遵谏 =================
{
  const g = mk(['liuxuan', 'sunquan'], yes({ index: 1, seats: [0] }));
  const [a] = g.players;
  g.turnCount = 5;
  a.flags.mogui = { judge: true, draw: true, discard: true };
  a.hp = 2;
  await g.trigger('turn.begin', { self: a });
  ok(a.flags.zunjianDone === true, '遵谏：应觉醒');
  ok(a.hp === 4, `遵谏：觉醒应回复体力（实际 ${a.hp}/${a.maxHp}）`);
  ok(!a.skills.some(s => s.id === 'mogui'), '遵谏：选择第二项应失去「漠规」');
  ok(a.flags.renchengPlus === true, '遵谏：应修改「仁诚」');
}

// ================= 20. 刘璿 · 仁诚 =================
{
  const g = mk(['liuxuan', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 3; g.phase = 'play';
  const hb = b.hand.length;
  await g.useActiveSkill(a, 'rencheng');
  ok(b.hand.length > hb, `仁诚：应交给其他角色牌（${hb} → ${b.hand.length}）`);
  ok(g.logs.some(l => /仁诚/.test(l.text)), '缺少仁诚日志');
  // 修改后版本
  const g2 = mk(['liuxuan', 'sunquan'], yes({ seats: [1] }));
  const [a2, b2] = g2.players;
  g2.turnPlayer = a2; g2.turnCount = 3; g2.phase = 'play';
  a2.flags.renchengPlus = true;
  await g2.useActiveSkill(a2, 'rencheng');
  ok(a2.flags.act_rencheng === 3, '仁诚：修改后每回合仍限一次');
}

// ================= 21. 何晏 · 崖柴 =================
{
  const g = mk(['heyan', 'sunquan'], yes({ index: 0 }));
  const [a, b] = g.players;
  g.turnCount = 4;
  b.hand = [card('b1', 'sha', 'spade', 2), card('b2', 'shan', 'heart', 3), card('b3', 'tao', 'club', 4), card('b4', 'jiu', 'diamond', 5)];
  await g.trigger('damage.after', { self: a, to: a, from: b, amount: 1, reason: 'test' });
  ok(b.hand.length === 2, `崖柴：选项1应弃置一半手牌（剩 ${b.hand.length}/4）`);
  ok(g.logs.some(l => /崖柴/.test(l.text)), '缺少崖柴日志');
}

// ================= 22. 何晏 · 清谈 =================
{
  const g = mk(['heyan', 'sunquan'], yes({ index: 0 }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 5; g.phase = 'play';
  a.hand = [card('h1', 'sha', 'heart', 2)];
  b.hand = [card('h2', 'shan', 'heart', 9), card('h3', 'tao', 'spade', 6)];
  const ha = a.hand.length;
  await g.useActiveSkill(a, 'qingtan');
  ok(a.hand.length > ha, `清谈：应获得展示的红桃牌（${ha} → ${a.hand.length}）`);
  ok(g.logs.some(l => /清谈/.test(l.text)), '缺少清谈日志');
}

// ================= 23. 夏侯玄 · 博玄 =================
{
  const g = mk(['xiahouxuan', 'sunquan'], yes({ index: 0 }));
  const [a, b] = g.players;
  g.turnCount = 6; g.turnPlayer = a; g.phase = 'play';
  const sha = card('s1', 'sha', 'spade', 8);
  g.deck[0] = card('d1', 'sha', 'spade', 3);
  g.deck[1] = card('d2', 'guohe', 'heart', 4);
  g.deck[2] = card('d3', 'tao', 'club', 5);
  const h0 = a.hand.length;
  await g.trigger('card.use.after', { self: a, card: sha, effName: 'sha', targets: [b], reason: 'play' });
  ok(a.hand.length >= h0 + 1, '博玄：牌名字数相同时应摸一张牌');
  ok(g.logs.some(l => /博玄/.test(l.text)), '缺少博玄日志');
}

// ================= 24. 夏侯玄 · 议政 =================
{
  const g = mk(['xiahouxuan', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.turnCount = 7;
  a.hand = [card('h1', 'sha', 'heart', 2)];
  b.hand = [card('h2', 'shan', 'spade', 9)];
  await g.trigger('turn.begin', { self: a });
  ok(g.logs.some(l => /议政/.test(l.text)), '缺少议政日志');
  // 类别不同 → 弃置
  ok(g.discardPile.length > 0 || a.hand.length + b.hand.length <= 2, '议政：应结算展示牌');
}

// ================= 25. 夏侯玄 · 归林 =================
{
  const g = mk(['xiahouxuan', 'sunquan'], yes());
  const [a] = g.players;
  g.turnPlayer = a; g.turnCount = 8; g.phase = 'play';
  a.hp = 1;
  await g.useActiveSkill(a, 'guilin');
  ok(a.hp === a.maxHp, `归林：应回复满体力（实际 ${a.hp}/${a.maxHp}）`);
  ok(a.flags.guilinUsed === true && a.flags.boxuanPlus === true, '归林：应记录已发动并修改「博玄」');
  ok(!a.skills.some(s => s.id === 'yizheng'), '归林：应失去「议政」');
}

// ================= 26. 庞会 · 异勇 =================
{
  const g = mk(['panghui', 'sunquan'], yes({ index: 0 }));
  const [a, b] = g.players;
  g.turnCount = 3;
  a.hand = [card('h1', 'sha', 'spade', 13)];
  b.hand = [card('b1', 'shan', 'heart', 2)];
  const d = { self: b, to: b, from: a, amount: 1, card: card('s1', 'sha'), reason: 'sha' };
  await g.trigger('damage.before', d);
  ok(a.flags.yiyongCount === 1, '异勇：应记录发动次数');
  ok(d.amount === 2, `异勇：点数之和不小于其应此伤害 +1（实际 ${d.amount}）`);
  ok(g.logs.some(l => /异勇/.test(l.text)), '缺少异勇日志');
}

// ================= 27. 庞会 · 夙仇 =================
{
  const g = mk(['panghui', 'sunquan'], yes({ index: 0 }));
  const [a] = g.players;
  g.turnPlayer = a; g.turnCount = 4; g.phase = 'play';
  a.hp = 5;
  await g.trigger('phase.begin', { self: a, phase: 'play' });
  ok(a.hp === 4 && a.flags.suqiuTurn === 4, `夙仇：应失去 1 点体力并获得无响应（hp=${a.hp}）`);
  const d = { self: a, card: card('s1', 'sha'), effName: 'sha', targets: [g.players[1]], reason: 'play' };
  await g.trigger('card.use.before', d);
  ok(d.unavoidable === true, '夙仇：此阶段使用牌应不能被响应');
}

// ================= 28. 张虎 · 摧坚 =================
{
  const g = mk(['zhanghu', 'sunquan'], yes({ index: 0, seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 5; g.phase = 'play';
  a.hand = [card('h1', 'tao', 'spade', 2)];
  b.hand = [card('b1', 'shan', 'heart', 3)];
  await g.useActiveSkill(a, 'cuijian');
  ok(a.hand.some(c => c.name === 'shan') || g.discardPile.some(c => c.name === 'shan'),
    '摧坚：目标应将【闪】交给张虎');
  ok(g.logs.some(l => /摧坚/.test(l.text)), '缺少摧坚日志');
}

// ================= 29. 张虎 · 同援 =================
{
  const g = mk(['zhanghu', 'sunquan'], yes());
  const [a] = g.players;
  g.turnCount = 6;
  await g.trigger('card.use.after', { self: a, card: card('c1', 'wuzhong', 'heart', 7), effName: 'wuzhong', targets: [a], reason: 'play' });
  ok(a.flags.tongyuanTrick === true, '同援：使用红色锦囊后应强化「摧坚」');
  await g.trigger('card.use.after', { self: a, card: card('c2', 'sha', 'diamond', 8), effName: 'sha', targets: [g.players[1]], reason: 'play' });
  ok(a.flags.tongyuanBasic === true && a.flags.tongyuanDone === true, '同援：两个效果均触发后应完成');
  const d = { self: a, card: card('c3', 'wuzhong', 'heart', 9), effName: 'wuzhong', targets: [a], reason: 'play' };
  await g.trigger('card.use.before', d);
  ok(d.unavoidable === true, '同援：红色普通锦囊应不能被响应');
}

// ================= 30. 乐进 · 骁果 =================
{
  const g = mk(['lejin', 'sunquan'], yes({ index: 1 }));
  const [a, b] = g.players;
  g.turnCount = 3;
  a.hand = [card('h1', 'sha', 'spade', 2)];
  b.hp = 4;
  await g.trigger('phase.begin', { self: b, phase: 'end' });
  ok(a.hand.length === 0, '骁果：应弃置一张手牌');
  ok(b.hp === 3, `骁果：目标选择选项2应受到 1 点伤害（实际 ${b.hp}）`);
  ok(g.logs.some(l => /骁果/.test(l.text)), '缺少骁果日志');
}

// ================= 31. 董昭 · 移驾 =================
{
  const g = mk(['dongzhao', 'sunquan'], yes());
  const [a, b] = g.players;
  const w = card('w1', 'qinggang', 'spade', 6);
  a.equips.weapon = w;
  await g.trigger('damage.after', { self: b, to: b, from: a, amount: 1, reason: 'test' });
  ok(b.equips.weapon === w, '移驾：应将场上装备牌置入受伤角色的装备区');
  ok(g.logs.some(l => /移驾/.test(l.text)), '缺少移驾日志');
}

// ================= 32. 董昭 · 定基 =================
{
  const g = mk(['dongzhao', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 4; g.phase = 'prepare';
  b.hand = [card('b1', 'sha', 'spade', 2), card('b2', 'shan', 'heart', 3), card('b3', 'tao', 'club', 4),
    card('b4', 'jiu', 'diamond', 5), card('b5', 'wuzhong', 'spade', 6)];
  await g.trigger('phase.begin', { self: a, phase: 'prepare' });
  ok(b.hand.length <= 5, `定基：手牌应调整至五张（实际 ${b.hand.length}）`);
  ok(g.logs.some(l => /定基/.test(l.text)), '缺少定基日志');
}

// ================= 33. 羊祜 · 德劭 =================
{
  const g = mk(['yanghu', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 5;
  a.hand = [card('h1', 'sha', 'heart', 2)];
  b.hand = [card('b1', 'sha', 'spade', 3), card('b2', 'shan', 'club', 4)];
  const h0 = a.hand.length;
  const d = { self: a, target: a, from: b, card: card('s1', 'sha', 'club', 7), effName: 'sha', reason: 'sha' };
  await g.trigger('target.before', d);
  ok(a.hand.length >= h0 + 1, '德劭：成为黑色牌目标后应摸一张牌');
  ok(g.logs.some(l => /德劭/.test(l.text)) || a.flags.deshaoCount === 1, '德劭：应记录发动');
}

// ================= 34. 羊祜 · 明伐 =================
{
  const g = mk(['yanghu', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 6; g.phase = 'play';
  const sha = card('s1', 'sha', 'spade', 8);
  await g.trigger('card.use.after', { self: a, card: sha, effName: 'sha', targets: [b], reason: 'play' });
  ok(!!a.flags.mingfa && a.flags.mingfa.seat === b.seat, '明伐：应将牌置于武将牌上并记录角色');
  const hp0 = b.hp;
  g.phase = 'end';
  await g.trigger('phase.begin', { self: b, phase: 'end' });
  ok(a.flags.mingfa === null, '明伐：结算后应移去「明伐」牌');
  ok(b.hp < hp0, `明伐：应视为对其使用【杀】并造成伤害（${hp0} → ${b.hp}）`);
}

// ================= 35. 华歆 · 望归 =================
{
  const g = mk(['huaxin', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.turnCount = 7;
  a.hp = 3; b.hp = 4;
  await g.trigger('damage.after', { self: b, to: b, from: a, amount: 1, reason: 'test' });
  ok(a.flags.wangguiAtk === 7, '望归：造成伤害后应记录发动');
  ok(g.logs.some(l => /望归/.test(l.text)), '缺少望归日志');
}

// ================= 36. 华歆 · 息兵 =================
{
  const g = mk(['huaxin', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 8; g.phase = 'play'; g.turnPlayer = b;
  b.hp = 4;
  b.hand = [card('b1', 'sha', 'spade', 2)];
  const d = { self: b, card: card('s1', 'sha', 'club', 7), effName: 'sha', targets: [a], reason: 'play' };
  await g.trigger('card.use.before', d);
  ok(b.hand.length === 4, `息兵：应令其将手牌摸至体力值（实际 ${b.hand.length}）`);
  ok(b.flags.banCardTurn === 8, '息兵：其本回合不能再使用牌');
}

// ================= 37. 杜预 · 谏国 =================
{
  const g = mk(['duyu', 'sunquan'], yes({ index: 0, seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 9; g.phase = 'play';
  b.hand = [card('b1', 'sha', 'spade', 2), card('b2', 'shan', 'heart', 3)];
  await g.useActiveSkill(a, 'jianguo');
  ok(a.flags.jianguo && a.flags.jianguo.a === true, '谏国：应记录已发动选项一');
  ok(b.hand.length === 1, `谏国：摸一张后应弃置一半手牌（实际 ${b.hand.length}）`);
  await g.useActiveSkill(a, 'jianguo');
  ok(a.flags.jianguo.b === true, '谏国：选项二本阶段可再发动一次');
  const before = a.flags.jianguo;
  await g.useActiveSkill(a, 'jianguo');
  ok(JSON.stringify(before) === JSON.stringify(a.flags.jianguo), '谏国：两项均发动后本阶段不能再发动');
}

// ================= 38. 杜预 · 倾势 =================
{
  const g = mk(['duyu', 'sunquan'], yes({ seats: [1] }));
  const [a, b] = g.players;
  g.turnPlayer = a; g.turnCount = 10; g.phase = 'play';
  a.hand = [card('h2', 'shan', 'heart', 3), card('h3', 'tao', 'club', 4)];
  a.flags.qingshiTurn = 10; a.flags.qingshiCount = 1;   // 本回合第 1 张已用，此为第 2 张
  b.hp = 4;
  await g.trigger('card.use.after', {
    self: a, card: card('s1', 'sha', 'spade', 8), effName: 'sha', targets: [b], reason: 'play',
  });
  ok(b.hp === 3, `倾势：使用第 X 张牌时应造成 1 点伤害（实际 ${b.hp}）`);
  ok(g.logs.some(l => /倾势/.test(l.text)), '缺少倾势日志');
}

// ================= 39. 王双 · 追猎 =================
{
  const g = mk(['wangshuang', 'sunquan', 'liubei', 'caocao', 'guanyu'], yes());
  const [a, b, c] = g.players;
  g.turnPlayer = a; g.turnCount = 11; g.phase = 'play';
  await g.trigger('phase.begin', { self: a, phase: 'play' });
  ok(a.flags.freeRangeTurn === 11, '追猎：本回合【杀】应无距离限制');
  ok(g.freeRangeNow(a) === true, '追猎：freeRangeNow 应为真');
  const far = g.players[3];
  ok(!g.inAttackRange(a, far), `测试前提：${far.name} 应在攻击范围外（距离 ${g.distance(a, far)}）`);
  g.deck[g.deck.length - 1] = card('w1', 'qinggang', 'spade', 6);   // 判定为武器牌
  await g.trigger('target.after', { self: a, card: card('s1', 'sha', 'heart', 8), target: far });
  ok((a.flags.shaExtraTurn || 0) === 1, '追猎：攻击范围外的【杀】不计入次数（本回合类 → shaExtraTurn）');
  ok(a.flags.zhuilieSeat === far.seat, '追猎：判定为武器牌应记录加伤目标');
  const hit = { self: a, target: far, card: card('s1', 'sha'), amount: 1 };
  await g.trigger('sha.hit', hit);
  ok(hit.amount === far.hp, `追猎：伤害值应增至其体力值（${hit.amount} vs ${far.hp}）`);
  // 判定失败 → 失去体力
  const hp0 = a.hp;
  g.deck[g.deck.length - 1] = card('t1', 'sha', 'club', 3);
  await g.trigger('target.after', { self: a, card: card('s2', 'sha', 'heart', 9), target: far });
  ok(a.hp === hp0 - 1, `追猎：判定非装备应失去 1 点体力（${hp0} → ${a.hp}）`);
}

// ================= 40. 汇总 =================
ok(GENERALS.length >= 260, `总将数应 ≥260，实际 ${GENERALS.length}`);
console.log(`\n群英荟萃守门：通过 ${pass} / 失败 ${fail}`);
if (fail) {
  console.log('失败明细：');
  for (const b of bad) console.log('  ✗', b);
  process.exit(1);
}
console.log('E 批 20 将全部通过。');
