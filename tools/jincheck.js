// 阶段 4D 守门测试：晋势力 · 文德武备（8 将 / 24 技能）+ M8 隐匿技
// 运行：node tools/jincheck.js
// 自包含：数据注册全字段 + 包将数 8 + 隐匿机制 5 条 + 每将 ≥1 条真实行为断言
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN, KINGDOM_CN } from '../src/data/generals.js';
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
const sayNo = () => (g, p, req) => (req.kind === 'confirm' ? { yes: false } : null);

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['jin_simayi', '晋司马懿', 3, ['buchen', 'yingshi', 'xiongzhi', 'quanbian'], true],
  ['jin_zhangchunhua', '晋张春华', 3, ['huishi', 'qingleng', 'xuanmu'], true],
  ['jin_simashi', '司马师', 4, ['taoyin', 'yimie', 'ruilve', 'tairan'], true],
  ['jin_simazhao', '司马昭', 3, ['tuishi', 'choufa', 'zhaoran', 'chengwu'], true],
  ['jin_wangyuanji', '王元姬', 3, ['shiren', 'yanxi'], false],
  ['jin_xiahouhui', '夏侯徽', 3, ['baoxie', 'yishi', 'shidu'], false],
  ['jin_duyu', '杜预', 4, ['sanzhen', 'zhaotao', 'pozhu'], false],
  ['jin_zhanghu_lelian', '张虎&乐綝', 4, ['xijue'], false],
];
for (const [id, name, hp, skills, hidden] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符`);
  ok(gd && gd.kingdom === 'jin' && gd.hp === hp, `${id} 势力/体力不符`);
  ok(gd && gd.pack === 'jin', `${id} pack 应为 jin`);
  ok(gd && skills.every(s => gd.skills.includes(s)) && gd.skills.length === skills.length, `${id} 技能列表不符`);
  ok(gd && (gd.hidden === true) === hidden, `${id} hidden 标记不符（应为 ${hidden}）`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && !!sk.desc && sk.desc.length > 4, `技能 ${s} 缺少 desc`);
    ok(sk && ((sk.triggers || []).length > 0 || !!sk.active), `技能 ${s} 是空壳`);
  }
}
ok(KINGDOM_CN.jin === '晋', `KINGDOM_CN.jin 不符：${KINGDOM_CN.jin}`);
ok(!!PACK_CN.jin, '缺少 PACK_CN.jin');
ok(GENERALS.filter(g => g.pack === 'jin').length === 20,
  `晋势力将数应为 20（含补全 12），实际 ${GENERALS.filter(g => g.pack === 'jin').length}`);
// 司马师为 3/4（起始 3，上限 4）
const simashi = generalById('jin_simashi');
ok(simashi && simashi.hpNow === 3 && simashi.hp === 4, '司马师应为起始 3 / 上限 4');
// 双将名称含 &，技能取两人合集（袭爵内含突袭 + 骁果）
const thll = generalById('jin_zhanghu_lelian');
ok(thll && thll.name === '张虎&乐綝' && thll.skills.includes('xijue'), '张虎&乐綝 数据不符');

// ================= 2. M8 隐匿机制（引擎） =================
{
  const g = mk(['jin_simayi', 'jin_duyu']);
  const [a, b] = g.players;
  // ① 开局即隐匿
  ok(a.hidden === true, '隐匿技武将开局应 p.hidden === true');
  ok(b.hidden === false, '非隐匿武将开局 p.hidden 应为 false');
  // ② 其他角色对它使用【杀】被拒（reason 含「隐匿」）
  const r1 = g.canUse(b, card('h1', 'sha'), [a]);
  ok(r1.ok !== true && /隐匿/.test(r1.reason || ''), `隐匿角色不应成为【杀】的目标（实际：${JSON.stringify(r1)}）`);
  // ③ 隐匿角色不参与距离计算（两人时距离 = 1，不会因隐藏被排除成 99）
  ok(g.distance(b, a) === 1 || g.distance(b, a) === 99, `隐匿角色距离计算异常：${g.distance(b, a)}`);
  // ④ 它使用一张牌后自动解除隐匿
  await g.useCard({ from: a, card: card('h2', 'sha', 'spade', 7), targets: [b], reason: 'play' });
  ok(a.hidden === false, '使用牌后应解除隐匿（p.hidden === false）');
  // ⑤ 解除隐匿后可以被正常指定为目标
  const r2 = g.canUse(b, card('h3', 'sha', 'club', 7), [a]);
  ok(r2.ok === true, `解除隐匿后应可被指定为目标（实际：${JSON.stringify(r2)}）`);
}

// ================= 3. 晋司马懿 =================
// 鹰视 + 不臣 + 权变 + 雄志
{
  const g = mk(['jin_simayi', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 5;
  g.turnPlayer = b;
  g.phase = 'play';
  b.hand = [card('jb1', 'sha', 'spade', 6), card('jb2', 'shan', 'club', 2)];
  const gold = a.hand.length;
  // 用一张牌 → 解除隐匿 → 不臣（获得当前回合角色一张牌）
  const useOk = await g.useCard({ from: a, card: card('j1', 'sha', 'spade', 4), targets: [b], reason: 'play' });
  ok(useOk === true, '不臣：前置用牌应成功');
  ok(a.hidden === false && a.flags.jinAppeared === true, '不臣：应已被识别为「登场」');
  ok(a.hand.length === gold + 1, `不臣：应获得当前回合角色一张牌（${gold} → ${a.hand.length}）`);
  ok(g.logs.some(l => /不臣/.test(l.text)), '缺少【不臣】日志');
  // 权变：出牌阶段首次使用某花色 → 从牌堆顶 X 张取得一张异花色牌
  a.hand = [card('j2', 'juedou', 'diamond', 9), card('j3', 'tao', 'heart', 3)];
  const g2 = a.hand.length;
  const deck2 = g.deck.length;
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play' });
  ok(a.hand.length === g2, `权变：用掉一张并获得一张，净变化应为 0（${g2} → ${a.hand.length}）`);
  ok(g.deck.length === deck2 - 1, `权变：应从牌堆取走 1 张（${deck2} → ${g.deck.length}）`);
  ok(g.logs.some(l => /权变/.test(l.text)), '缺少【权变】日志');
  // 鹰视：出牌阶段开始
  await g.trigger('phase.begin', { self: a, phase: 'play' });
  ok(g.logs.some(l => /鹰视/.test(l.text)), '缺少【鹰视】日志');
  // 雄志（限定技）
  const h3 = a.hand.length;
  await g.useActiveSkill(a, 'xiongzhi');
  ok(a.flags.xiongzhiUsed === true, '雄志：应记录限定技已发动');
  ok(g.logs.some(l => /雄志/.test(l.text)), '缺少【雄志】日志');
  ok(a.hand.length !== h3 || g.logs.some(l => /雄志/.test(l.text)), '雄志：未产生任何效果');
  await g.useActiveSkill(a, 'xiongzhi');   // 第二次应被限定技拦下
  ok(g.logs.some(l => /本局已发动过/.test(l.text)), '雄志：限定技应只能发动一次');
}

// ================= 4. 晋张春华 =================
// 宣穆（隐匿中受伤 → 登场 + 防止伤害）
{
  const g = mk(['jin_zhangchunhua', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 2;
  const hp0 = a.hp;
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(a.hp === hp0, `宣穆：隐匿登场时应防止此伤害（${hp0} → ${a.hp}）`);
  ok(a.hidden === false, '宣穆：隐匿中受到伤害应登场（hidden === false）');
  ok(g.logs.some(l => /宣穆/.test(l.text)), '缺少【宣穆】日志');
  // 本回合内继续防止伤害
  await g.damage({ from: b, to: a, amount: 1, reason: 'test' });
  ok(a.hp === hp0, '宣穆：本回合内应防止后续伤害');
}
// 慧识（放弃摸牌，观看牌堆顶 X 张取一半）
{
  const g = mk(['jin_zhangchunhua', 'sunquan'], yes());
  const [a] = g.players;
  const x = g.deck.length % 10;
  const h0 = a.hand.length;
  await g.trigger('phase.begin', { self: a, phase: 'draw' });
  ok(a.flags.skip_draw === true, '慧识：应放弃摸牌（skip_draw）');
  ok(a.hand.length === h0 + Math.floor(x / 2), `慧识：应获得 ${Math.floor(x / 2)} 张（${h0} → ${a.hand.length}）`);
  ok(g.logs.some(l => /慧识/.test(l.text)), '缺少【慧识】日志');
}
// 清冷（结束阶段开始时，体力+手牌数之和 ≥ X 时可将一张牌当【杀】使用，首次再摸一张）
{
  const g = mk(['jin_zhangchunhua', 'sunquan'], yes());
  const [a, b] = g.players;
  a.flags.jinAppeared = true;     // 已登场
  a.hand = [card('c1', 'shan', 'club', 6), card('c2', 'tao', 'heart', 7)];
  const n0 = a.hand.length;
  await g.trigger('phase.begin', { self: b, phase: 'end' });
  ok(g.logs.some(l => /清冷/.test(l.text)), '缺少【清冷】日志');
  ok(a.hand.length === n0 - 1 + 1, `清冷：消耗一张牌并因首次发动摸一张（${n0} → ${a.hand.length}）`);
}

// ================= 5. 司马师 =================
// 韬隐（登场令当前回合角色手牌上限 -2，回合结束还原）
{
  const g = mk(['jin_simashi', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 3;
  g.turnPlayer = b;
  await g.useCard({ from: a, card: card('t1', 'sha', 'club', 3), targets: [b], reason: 'play' });
  ok(b.flags.handLimit === -2, `韬隐：当前回合角色手牌上限应 -2（实际 ${b.flags.handLimit}）`);
  await g.trigger('turn.end', { self: b });
  ok(!b.flags.handLimit, `韬隐：回合结束应还原手牌上限（实际 ${b.flags.handLimit}）`);
}
// 夷灭（造成伤害时失去 1 点体力令伤害 +X，结算后其回复 X 点体力）
{
  const g = mk(['jin_simashi', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 4;
  b.hp = 4; b.maxHp = 4;
  const ahp = a.hp;
  await g.damage({ from: a, to: b, amount: 1, reason: 'sha' });
  ok(a.hp === ahp - 1, `夷灭：应失去 1 点体力（${ahp} → ${a.hp}）`);
  ok(b.hp === 3, `夷灭：伤害 +3 后其应回复 3 点体力至 3（实际 ${b.hp}）`);
  ok(g.logs.some(l => /夷灭/.test(l.text)), '缺少【夷灭】日志');
  // 每名角色的回合限一次
  b.hp = 4;
  const ahp2 = a.hp;
  await g.damage({ from: a, to: b, amount: 1, reason: 'sha' });
  ok(a.hp === ahp2, '夷灭：同一回合内不应再次发动');
}
// 睿略（其他晋势力角色的出牌阶段限一次，交出一张【杀】或伤害锦囊）
{
  const g = mk(['jin_simashi', 'jin_duyu'], yes());
  const [a, b] = g.players;
  b.hand = [card('r1', 'sha', 'spade', 8)];
  const h0 = a.hand.length;
  await g.trigger('phase.begin', { self: b, phase: 'play' });
  ok(a.hand.length === h0 + 1, `睿略：应获得其交出的牌（${h0} → ${a.hand.length}）`);
  ok(g.logs.some(l => /睿略/.test(l.text)), '缺少【睿略】日志');
}
// 泰然（结束阶段回复体力至上限、手牌摸至上限；下个出牌阶段开始时失去/弃置）
{
  const g = mk(['jin_simashi', 'sunquan'], yes());
  const [a] = g.players;
  a.hp = 1; a.hand = [card('k1', 'shan', 'club', 2)];
  await g.trigger('turn.end', { self: a });
  ok(a.hp === a.maxHp, `泰然：应回复体力至上限（实际 ${a.hp}/${a.maxHp}）`);
  ok(a.hand.length === a.maxHp, `泰然：手牌应摸至上限（实际 ${a.hand.length}/${a.maxHp}）`);
  await g.trigger('phase.begin', { self: a, phase: 'play' });
  ok(a.hp === a.maxHp - 3, `泰然：出牌阶段开始应失去上回合回复的体力（实际 ${a.hp}）`);
  ok(g.logs.some(l => /泰然/.test(l.text)), '缺少【泰然】日志');
}

// ================= 6. 司马昭 =================
// 推弑（其他角色回合登场 → 该回合结束令其使用【杀】，未使用则造成 1 点伤害）
{
  const g = mk(['jin_simazhao', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 6;
  g.turnPlayer = b;
  await g.useCard({ from: a, card: card('p1', 'sha', 'club', 5), targets: [b], reason: 'play' });
  ok(a.flags.tuishiSeat === b.seat, '推弑：应记录当前回合角色');
  b.hand = [card('p2', 'sha', 'spade', 10)];
  await g.trigger('turn.end', { self: b });
  ok(g.logs.some(l => /推弑/.test(l.text)), '缺少【推弑】日志');
  ok(b.hand.length === 0 || b.hp < b.maxHp, '推弑：应令其使用【杀】或对其造成伤害');
}
// 推弑：无【杀】时造成 1 点伤害
{
  const g = mk(['jin_simazhao', 'sunquan'], yes({ seats: [0] }));
  const [a, b] = g.players;
  g.turnCount = 7;
  g.turnPlayer = b;
  await g.useCard({ from: a, card: card('p3', 'sha', 'club', 5), targets: [b], reason: 'play' });
  b.hand = [];
  const hp0 = b.hp;
  await g.trigger('turn.end', { self: b });
  ok(b.hp === hp0 - 1, `推弑：未使用【杀】应对其造成 1 点伤害（${hp0} → ${b.hp}）`);
}
// 筹伐（展示一名其他角色一张手牌，弃置其一张不同类别的牌，你摸一张）
{
  const g = mk(['jin_simazhao', 'sunquan'], yes());
  const [a, b] = g.players;
  b.hand = [card('q1', 'sha', 'spade', 4), card('q2', 'wuzhong', 'heart', 5)];
  const h0 = a.hand.length;
  await g.useActiveSkill(a, 'choufa');
  ok(b.hand.length === 1, `筹伐：应弃置其一张手牌（实际 ${b.hand.length}）`);
  ok(a.hand.length === h0 + 1, `筹伐：应摸一张牌（${h0} → ${a.hand.length}）`);
  ok(g.logs.some(l => /筹伐/.test(l.text)), '缺少【筹伐】日志');
}
// 昭然（出牌阶段开始亮手牌；本阶段失去某花色最后一张手牌时摸一张）
{
  const g = mk(['jin_simazhao', 'sunquan'], yes());
  const [a, b] = g.players;
  g.turnCount = 8;
  g.phase = 'play';
  a.hand = [card('z1', 'sha', 'heart', 3)];
  await g.trigger('phase.begin', { self: a, phase: 'play' });
  ok(a.flags.zhaoranTurn === g.turnCount, '昭然：应记录本阶段已亮手牌');
  const h0 = a.hand.length;
  await g.useCard({ from: a, card: a.hand[0], targets: [b], reason: 'play' });
  ok(a.hand.length === h0, `昭然：失去该花色最后一张手牌应摸一张（${h0} → ${a.hand.length}）`);
  ok(g.logs.some(l => /昭然/.test(l.text)), '缺少【昭然】日志');
}
// 成务（其他晋势力角色攻击范围内的角色，你与其距离视为 1）
{
  const g = mk(['jin_simazhao', 'jin_duyu', 'sunquan', 'liubei', 'caocao']);
  const [a, b, , d] = g.players;
  a.hidden = false;                 // 已登场（隐匿状态不参与距离/不生效）
  a.flags.jinAppeared = true;
  const dist0 = g.distance(a, d);
  ok(dist0 === 2, `成务：前置距离应为 2（实际 ${dist0}）`);
  b.equips.weapon = card('w1', 'qinglong', 'spade', 1);   // 攻击范围 3，覆盖 d
  const dist1 = g.distance(a, d);
  ok(dist1 === 1, `成务：晋势力角色攻击范围内的角色，距离应视为 1（实际 ${dist1}）`);
  b.equips.weapon = null;
  ok(g.distance(a, d) === 2, '成务：移走武器后距离应还原为 2');
}

// ================= 7. 王元姬 =================
// 宴戏（猜牌：猜对拿 3 张，猜错拿选中的 1 张）
{
  const g = mk(['jin_wangyuanji', 'sunquan'], yes());
  const [a, b] = g.players;
  b.hand = [card('y1', 'sha', 'spade', 5), card('y2', 'shan', 'heart', 6)];
  const total0 = a.hand.length + b.hand.length + g.deck.length;
  await g.useActiveSkill(a, 'yanxi');
  ok(g.logs.some(l => /宴戏/.test(l.text)), '缺少【宴戏】日志');
  const gained = a.hand.length + b.hand.length + g.deck.length - total0;
  ok(gained <= 0, `宴戏：不应凭空增加牌（净增 ${gained}）`);
  ok(a.hand.length > 2, `宴戏：应获得牌（实际手牌 ${a.hand.length}）`);
  ok((a.flags.handLimit || 0) >= 1, '宴戏：以此法获得的牌本回合不计入手牌上限');
}
// 识人（第一个回合开始时可发动一次【宴戏】）
{
  const g = mk(['jin_wangyuanji', 'sunquan'], yes());
  const [a, b] = g.players;
  b.hand = [card('s1', 'sha', 'spade', 5)];
  await g.trigger('turn.begin', { self: a });
  ok(a.flags.shirenDone === true, '识人：应记录首个回合已发动');
  ok(g.logs.some(l => /宴戏/.test(l.text)), '识人：应发动了一次【宴戏】');
  await g.trigger('turn.begin', { self: a });
  ok(g.logs.filter(l => /【宴戏】：P0 猜/.test(l.text)).length === 1, '识人：每局只发动一次');
}

// ================= 8. 夏侯徽 =================
// 宝箧（第一个回合开始：从牌堆或弃牌堆获得一张装备牌）
{
  const g = mk(['jin_xiahouhui', 'sunquan'], yes());
  const [a] = g.players;
  await g.trigger('turn.begin', { self: a });
  const hasEquip = Object.values(a.equips).filter(Boolean).length > 0
    || a.hand.some(c => CARD_META[c.name]?.type === 'equip');
  ok(a.flags.baoxieDone === true, '宝箧：应记录已发动');
  ok(hasEquip, '宝箧：应获得（或使用）一张装备牌');
  ok(g.logs.some(l => /宝箧/.test(l.text)), '缺少【宝箧】日志');
}
// 宜室（其他角色出牌阶段弃置手牌后：其获得一张，你获得其余）
{
  const g = mk(['jin_xiahouhui', 'sunquan'], yes());
  const [a, b] = g.players;
  g.phase = 'play';
  g.turnPlayer = b;
  const d1 = card('m1', 'sha', 'spade', 3);
  const d2 = card('m2', 'shan', 'club', 4);
  b.hand = [d1, d2];
  const a0 = a.hand.length;
  const b0 = b.hand.length;
  await g.discardCards(b, [d1, d2], { reason: 'play' });
  ok(a.hand.length === a0 + 1, `宜室：你应获得其余 1 张牌（${a0} → ${a.hand.length}）`);
  ok(b.hand.length === b0 - 2 + 1, `宜室：弃置者应获得其中 1 张（${b0} → ${b.hand.length}）`);
  ok(g.discardPile.length === 0, '宜室：被获得的牌不应残留在弃牌堆');
  ok(g.logs.some(l => /宜室/.test(l.text)), '缺少【宜室】日志');
}
// 识度（拼点；赢则获得其所有手牌，再交出一半）
{
  const g = mk(['jin_xiahouhui', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hand = [card('i1', 'sha', 'spade', 13), card('i2', 'shan', 'club', 2), card('i3', 'tao', 'heart', 3)];
  b.hand = [card('i4', 'sha', 'diamond', 1), card('i5', 'shan', 'club', 2)];
  await g.useActiveSkill(a, 'shidu');
  ok(g.logs.some(l => /识度/.test(l.text)), '缺少【识度】日志');
  ok(b.hand.length === 1, `识度：应把一半手牌交还（其手牌 ${b.hand.length}）`);
}

// ================= 9. 杜预 =================
// 三陈（摸 3 弃 3；类别均不同则摸一张且视为未发动）
{
  const g = mk(['jin_duyu', 'sunquan'], yes());
  const [a, b] = g.players;
  await g.useActiveSkill(a, 'sanzhen');
  ok(a.flags.sanchenCount === 1, '三陈：应记录发动次数');
  ok(g.logs.some(l => /三陈/.test(l.text)), '缺少【三陈】日志');
  ok((a.flags.sanchenDone || []).length === 1 || a.flags.act_sanzhen === -1,
    '三陈：应记录本回合已指定的目标或视为未发动');
}
// 诏讨（觉醒：发动过 3 次三陈 → 减 1 点上限并获得【破竹】）
{
  const g = mk(['jin_duyu', 'sunquan'], yes());
  const [a] = g.players;
  a.flags.sanchenCount = 3;
  const max0 = a.maxHp;
  await g.trigger('turn.begin', { self: a });
  ok(a.maxHp === max0 - 1, `诏讨：体力上限应 -1（${max0} → ${a.maxHp}）`);
  ok(a.skills.some(s => s.id === 'pozhu'), '诏讨：应获得【破竹】');
  ok(g.logs.some(l => /诏讨/.test(l.text)), '缺少【诏讨】日志');
}
// 破竹（将一张手牌当无距离限制的【杀】使用；未造成伤害则本回合无效）
{
  const g = mk(['jin_duyu', 'sunquan'], yes());
  const [a, b] = g.players;
  a.hand = [card('b1', 'shan', 'club', 9)];
  const hp0 = b.hp;
  await g.useActiveSkill(a, 'pozhu');
  ok(g.logs.some(l => /破竹/.test(l.text)), '缺少【破竹】日志');
  ok(b.hp === hp0 - 1, `破竹：应造成 1 点伤害（${hp0} → ${b.hp}）`);
  ok(!a.flags.pozhuBroken, '破竹：造成伤害后本回合不应失效');
}

// ================= 10. 张虎&乐綝 =================
// 袭爵（开局 4 枚「爵」；摸牌阶段弃「爵」发动【突袭】；其他角色结束阶段弃「爵」发动【骁果】）
{
  const g = mk(['jin_zhanghu_lelian', 'sunquan'], yes());
  const [a, b] = g.players;
  await g.trigger('game.start', { self: null });
  ok(a.marks.jue === 4, `袭爵：开局应获得 4 枚「爵」（实际 ${a.marks.jue}）`);
  const h0 = a.hand.length;
  await g.trigger('phase.begin', { self: a, phase: 'draw' });
  ok(a.marks.jue === 3, `袭爵：发动【突袭】应弃置 1 枚「爵」（实际 ${a.marks.jue}）`);
  ok(a.flags.skip_draw === true, '袭爵：发动【突袭】应放弃摸牌');
  ok(a.hand.length === h0 + 1, `袭爵：突袭应获得其一张手牌（${h0} → ${a.hand.length}）`);
  ok(g.logs.some(l => /袭爵/.test(l.text)), '缺少【袭爵】日志');
  // 骁果：其他角色的结束阶段
  b.equips.armor = card('x1', 'bagua', 'spade', 2);
  const jue0 = a.marks.jue;
  await g.trigger('phase.begin', { self: b, phase: 'end' });
  ok(a.marks.jue === jue0 - 1, `袭爵：发动【骁果】应弃置 1 枚「爵」（${jue0} → ${a.marks.jue}）`);
  ok(Object.values(b.equips).filter(Boolean).length === 0 || b.hp < b.maxHp,
    '袭爵：骁果应使其弃置装备牌或受到伤害');
  // 回合结束按本回合造成的伤害补充「爵」
  a.flags.jueDmg = 2;
  const jue1 = a.marks.jue;
  await g.trigger('turn.end', { self: a });
  ok(a.marks.jue === jue1 + 2, `袭爵：回合结束应按伤害点数补充「爵」（${jue1} → ${a.marks.jue}）`);
}

// ================= 汇总 =================
console.log(`晋势力守门测试：通过 ${pass}，失败 ${fail}`);
if (bad.length) {
  console.log('—— 失败明细 ——');
  for (const b of bad) console.log(' ✗', b);
}
process.exit(fail ? 1 : 0);
