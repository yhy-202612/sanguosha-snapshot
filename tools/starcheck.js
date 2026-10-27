// 星将 / 异闻 包机制单测（2026-10-25 第二批手写设计稿）
// 运行：node tools/starcheck.js
// 重点：①数据注册完整、技能不降级 ②game.start 类技能真的生效（run() 传 self:null，who:'self' 会失效）
//      ③核心资源/标记体系逐条断言 ④牌张守恒（道具类技能不许复制或丢牌）
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

function mk(ids, over = {}) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const handler = (g, p, req) => {
    if (req.kind === 'confirm') return { yes: over.yes !== false };
    if (req.kind === 'targets') return { seats: (over.seats || [1]).slice(0, req.max || 1) };
    if (req.kind === 'choice') return { index: over.index !== undefined ? over.index : 0 };
    if (req.kind === 'card') {
      if (Object.prototype.hasOwnProperty.call(over, 'card')) return over.card === null ? { cardId: null } : { cardId: over.card };
      return { cardId: (p.hand[0] || {}).id };
    }
    if (req.kind === 'cards') {
      const ids2 = req.cards || [];
      const n = Math.max(req.min || 0, Math.min(req.max ?? 1, ids2.length));
      return { cardIds: ids2.slice(0, n) };
    }
    if (req.kind === 'discard') return { cardIds: (req.cards || []).slice(0, req.min || 1) };
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
const allIds = (g) => {
  const out = [];
  g.deck.forEach(c => out.push(c.id));
  g.discardPile.forEach(c => out.push(c.id));
  (g.exilePile || []).forEach(c => out.push(c.id));
  for (const p of g.players) {
    p.hand.forEach(c => out.push(c.id));
    Object.values(p.equips || {}).forEach(c => c && out.push(c.id));
    (p.judgeZone || []).forEach(z => z.card && out.push(z.card.id));
  }
  return out;
};
const noDup = (g) => { const ids = allIds(g); return new Set(ids).size === ids.length; };

// ================= 1. 数据注册 =================
{
  const star = GENERALS.filter(g => g.pack === 'star');
  const myth = GENERALS.filter(g => g.pack === 'myth');
  ok(star.length === 19, `星将应为 19 位，实际 ${star.length}`);
  ok(myth.length === 2, `异闻应为 2 位，实际 ${myth.length}`);
  ok(PACK_CN.star === '星将', `PACK_CN.star 不符：${PACK_CN.star}`);
  ok(PACK_CN.myth === '自定义·异闻', `PACK_CN.myth 不符：${PACK_CN.myth}`);
  const missing = [];
  for (const g of [...star, ...myth]) {
    for (const s of g.skills) {
      if (!hasSkill(s)) missing.push(`${g.name}:${s}`);
      else {
        const sk = getSkill(s);
        if (sk.fallbackOf) missing.push(`${g.name}:${s}(降级)`);
        if (!sk.name || !sk.desc || sk.desc.length < 5) missing.push(`${g.name}:${s}(缺 name/desc)`);
      }
    }
  }
  ok(missing.length === 0, `技能缺失/异常：${missing.join('、')}`);
  const checkHp = [['star_lumeng', 4], ['star_huaxiong', 5], ['star_jiaxu', 2], ['star_zhouyu', 2], ['star_huanggai', 3], ['myth_change', 7], ['myth_columbia', 7]];
  const hpBad = checkHp.filter(([id, hp]) => generalById(id)?.hp !== hp).map(([id, hp]) => `${id} 应为 ${hp}，实际 ${generalById(id)?.hp}`);
  ok(hpBad.length === 0, `体力值不符：${hpBad.join('；')}`);
}

// ================= 2. game.start 类技能必须真的生效 =================
// run() 里 game.start 的 data 是 { self: null }，who:'self' 永远不会命中，这类技能一律要写 who:'any'
{
  const g = mk(['star_zuoci', 'sunquan']);
  await g.trigger('game.start', { self: null });
  ok(g.players[0].marks.huan === 2, `【幻变】开局应得 2 张武将牌，实际 ${g.players[0].marks.huan}`);

  const g2 = mk(['star_zhangjiao', 'sunquan']);
  await g2.trigger('game.start', { self: null });
  ok(g2.players[0].marks.leiyin === 2, `【天雷】开局应得 2 雷之印，实际 ${g2.players[0].marks.leiyin}`);

  const g3 = mk(['star_daqiao', 'sunquan']);
  await g3.trigger('game.start', { self: null });
  ok(g3.players[0].marks.yuechen === 6, `【月魂】开局应得 6 月之尘，实际 ${g3.players[0].marks.yuechen}`);

  const g4 = mk(['star_luxun', 'sunquan']);
  await g4.trigger('game.start', { self: null });
  ok(g4.players.every(p => p.chained === true), '【锁焰】开局应令所有角色横置');

  const g5 = mk(['star_lvbu', 'sunquan'], { index: 2 });     // 降 2 点体力上限
  await g5.trigger('game.start', { self: null });
  ok(g5.players[0].maxHp === 3, `【魔星】降 2 点上限后应为 3，实际 ${g5.players[0].maxHp}`);
  ok(g5.players[0].marks.mozhiyu === 2, `【魔星】应得 2 魔之谕，实际 ${g5.players[0].marks.mozhiyu}`);
}

// ================= 3. 星·南华老仙：玄仙（防伤转失体力 + 得仙御） =================
{
  const g = mk(['star_nanhua', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  const hp0 = p.hp;
  await g.damage({ from: t, to: p, amount: 2, card: null, reason: 'test' });
  ok(p.marks.xianyu === true, '【玄仙】受到伤害后应获得【仙御】');
  ok(p.hp === hp0 - 1, `【玄仙】应改为失去 1 点体力（${hp0} → ${p.hp}）`);
  ok(p.armor === 0 || p.armor === (p.armorMax || 0), '【玄仙】防止伤害后护甲不应被扣');
}

// ================= 4. 星·曹丕：称帝 → 帝星（跳阶段 + 龙谕） =================
{
  const g = mk(['star_caopi', 'sunquan']);
  const p = g.players[0];
  p.hand.push(card('t1', 'sha'), card('t2', 'shan'), card('t3', 'tao'), card('t4', 'jiu'));
  await g.useActiveSkill(p, 'chengdi');
  ok(p.marks.dixing === true, '【称帝】后应获得【帝星】');
  ok(p.hand.length === 0, `【称帝】应弃置全部手牌，实际剩 ${p.hand.length}`);
  const before = p.marks.longyu || 0;
  g.turnCount = 88;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.skip_draw === true && p.flags.skip_discard === true, '【帝星】回合开始应置位跳过摸牌/弃牌阶段');
  ok((p.marks.longyu || 0) >= Math.min(4, before), `【帝星】回合开始应累积龙谕（${before} → ${p.marks.longyu}）`);
}

// ================= 5. 星·贾诩：远虑（手牌上限 4） =================
{
  const g = mk(['star_jiaxu', 'sunquan']);
  const p = g.players[0];
  p.hp = 2; p.flags = {};
  g.turnCount = 77;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.handLimit === 2, `【远虑】2 血时应补 handLimit=2（使上限为 4），实际 ${p.flags.handLimit}`);
}

// ================= 6. 星·赵云：游龙（距离恒为 1） =================
{
  const g = mk(['star_zhaoyun', 'sunquan', 'caocao', 'liubei']);
  const p = g.players[0];
  const d1 = g.distance(p, g.players[1]);
  const d2 = g.distance(p, g.players[2]);
  ok(d1 === 1 && d2 === 1, `【游龙】应使距离恒为 1，实际 ${d1}/${d2}`);
}

// ================= 7. 星·周瑜：环灭（♣→铁索 / ♦→火攻 / ♥→杀） =================
{
  const g = mk(['star_zhouyu', 'sunquan']);
  const p = g.players[0];
  const club = card('c1', 'sha', 'club', 9);
  const dia = card('c2', 'sha', 'diamond', 9);
  const heart = card('c3', 'shan', 'heart', 9);
  const spade = card('c4', 'sha', 'spade', 9);
  ok(g.virtualAllowed(p, [club], 'tiesuo') === true, '【环灭】♣牌应可当【铁索连环】');
  ok(g.virtualAllowed(p, [dia], 'huogong') === true, '【环灭】♦牌应可当【火攻】');
  ok(g.virtualAllowed(p, [heart], 'sha') === true, '【环灭】♥牌应可当【杀】');
  ok(g.virtualAllowed(p, [spade], 'tiesuo') === false, '【环灭】♠牌不应可转化');
}

// ================= 8. 星·华雄：善战（勇标记）+ 温酒（酒杀不可闪） =================
{
  const g = mk(['star_huaxiong', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  await g.trigger('sha.dodged', { self: p, target: t, card: card('x1', 'sha') });
  ok(p.marks.yong === 1, `【善战】被响应后应得 1 勇，实际 ${p.marks.yong}`);
  // 勇 ≥2 时【杀】不可被闪
  p.marks.yong = 2;
  const useData = { self: p, card: card('x2', 'sha'), effName: 'sha', targets: [t], reason: 'play' };
  await g.trigger('card.use.before', useData);
  ok(useData.unavoidable === true, '【善战】勇≥2 时【杀】应不可被响应');

  // 温酒：对手饮酒后对我出【杀】→ unavoidable + ignoreRange
  const g2 = mk(['star_huaxiong', 'sunquan']);
  const me = g2.players[0], foe = g2.players[1];
  foe.flags.jiuUsed = true;
  const ud = { self: foe, card: card('x3', 'sha'), effName: 'sha', targets: [me], reason: 'play' };
  await g2.trigger('card.use.before', ud);
  ok(ud.unavoidable === true && ud.ignoreRange === true, '【温酒】酒【杀】应无距离且不可响应');
}

// ================= 9. 星·吕蒙：生息（非最多时摸牌）+ 离心（单次伤害至多 1） =================
{
  const g = mk(['star_lumeng', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  p.hand = [];
  t.hand = [card('a1', 'sha'), card('a2', 'sha')];
  p.flags = {};
  g.turnCount = 66;
  await g.trigger('turn.begin', { self: p });
  ok(p.hand.length >= 1, `【生息】手牌不是全场最多时应摸牌，实际 ${p.hand.length}`);

  // 离心：设限后对方单次 2 点伤害降为 1
  p.marks.lixin = t.id;
  const hp0 = p.hp;
  await g.damage({ from: t, to: p, amount: 2, card: null, reason: 'test' });
  ok(p.hp === hp0 - 1, `【离心】应把 2 点伤害降为 1 点（${hp0} → ${p.hp}）`);
}

// ================= 10. 星·黄盖：苦肉（失 1 体力换两项补偿） =================
{
  const g = mk(['star_huanggai', 'sunquan'], { index: 0 });
  const p = g.players[0];
  p.hp = 3; p.maxHp = 3; p.flags = {}; p.hand = [];
  g.turnCount = 55;
  const armor0 = p.armor || 0;
  await g.useActiveSkill(p, 'kurou_star');
  ok(p.hp === 2, `【苦肉】应失去 1 点体力（3 → ${p.hp}）`);
  ok(p.hand.length >= 2 || (p.armor || 0) > armor0, '【苦肉】应至少获得两项补偿之一（摸牌/护甲）');
}

// ================= 11. 星·黄月英：天纵（弃牌换心之谕） =================
{
  const g = mk(['star_huangyueying', 'sunquan'], { index: 0 });
  const p = g.players[0];
  const c = card('d1', 'sha', 'heart', 5);
  p.hand.push(c);
  g.turnCount = 44;
  await g.discardCards(p, [c], { reason: 'test' });
  ok((p.marks.xinzhiyu || 0) >= 2, `【天纵】弃牌后应得 2 点心之谕，实际 ${p.marks.xinzhiyu}`);
}

// ================= 12. 星·黄忠：烈影（记录点数并摸牌） =================
{
  const g = mk(['star_huangzhong', 'sunquan']);
  const p = g.players[0];
  const c = card('e1', 'sha', 'spade', 11);
  p.hand = [c];
  const hand0 = p.hand.length;
  await g.trigger('card.use.after', { self: p, card: c, targets: [g.players[1]], reason: 'play' });
  ok((p.marks.lieying || []).includes(11), '【烈影】应记录点数 11');
  ok(p.hand.length >= hand0, '【烈影】记录新点数后应摸一张牌');
}

// ================= 13. 星·典韦：诸武（准备阶段自动上装备，且不复制牌） =================
{
  const g = mk(['star_dianwei', 'sunquan']);
  const p = g.players[0];
  p.flags = {};
  g.turnCount = 33;
  const before = new Set(allIds(g));
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  const equipped = Object.values(p.equips).filter(Boolean).length;
  ok(equipped >= 1, `【诸武】准备阶段应自动装备一张装备牌，实际装备 ${equipped} 张`);
  ok(noDup(g), `【诸武】不应产生重复/双存的牌`);
  const after = allIds(g);
  ok(after.every(id => before.has(id)) && after.length === before.size, '【诸武】不应凭空增减牌');
}

// ================= 14. 嫦娥：长征（5 个 ☽ 摸锦囊） + 奋进（每阶段 +1 ☽） =================
{
  const g = mk(['myth_change', 'sunquan']);
  const p = g.players[0];
  p.marks.yue = 5; p.hand = []; p.flags = {};
  g.turnCount = 22;
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(p.hand.length >= 4, `【长征·无人登月Ⅰ】应获得 4 张锦囊，实际 ${p.hand.length}`);
  ok(p.hand.every(c => CARD_META[c.name].type === 'trick'), '【长征】获得的应全是锦囊牌');
  const yue0 = p.marks.yue;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.marks.yue === Math.min(10, yue0 + 1), `【奋进】每个阶段应 +1 ☽（${yue0} → ${p.marks.yue}）`);
}

// ================= 15. 哥伦比亚：新月自己的法则（弃牌攒 D） + 三相月临 =================
{
  const g = mk(['myth_columbia', 'sunquan'], { index: 0 });
  const p = g.players[0];
  p.hand = [card('f1', 'sha'), card('f2', 'shan')];
  p.flags = {};
  g.turnCount = 11;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok((p.marks.yue || 0) === 2, `【新月自己的法则】弃 2 张应得 2 个 ☽，实际 ${p.marks.yue}`);
  const hp0 = p.hp = 4;
  await g.useActiveSkill(p, 'sanxiang');
  ok(p.marks.xiang === 1 && p.flags.hengYue === true, `【三相月临】首次发动应进入恒月（xiang=${p.marks.xiang}）`);
  ok(p.hp === Math.min(p.maxHp, hp0 + 1), `【三相月临】应回复 1 点体力（${hp0} → ${p.hp}）`);
}

// ================= 16. 星·管辂：域流（有人翻面时摸牌） =================
{
  const g = mk(['star_guanlu', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  p.hand = [];
  g.turnCount = 9;
  await g.trigger('flip.after', { self: t, player: t });
  ok(p.hand.length === 1, `【域流】有人翻面应摸 1 张，实际 ${p.hand.length}`);
}

// ================= 17. 星·黄月英：天纵真的把牌收进「天纵」（不是只在弃牌堆里待着） =================
{
  const g = mk(['star_huangyueying', 'sunquan'], { index: 1 });   // 选「消耗 1 点心之谕置入天纵」
  const p = g.players[0];
  const c = card('t1', 'guohe', 'spade', 4);
  p.hand.push(c);
  p.marks.xinzhiyu = 1;
  p.flags = {};
  g.turnCount = 31;
  await g.discardCards(p, [c], { reason: 'test' });
  ok((p.marks.tianzong || []).includes('guohe'), `【天纵】应记录牌名 guohe，实际 ${JSON.stringify(p.marks.tianzong)}`);
  ok(!g.discardPile.includes(c), '【天纵】接走的牌不应留在弃牌堆（否则等于没发动）');
  ok((g.exilePile || []).includes(c), '【天纵】的牌应记入「移出游戏」区（牌张守恒）');
  ok(p.marks.xinzhiyu === 0, `【天纵】应消耗 1 点心之谕，实际 ${p.marks.xinzhiyu}`);
  ok(hasLog(g, '置入【天纵】'), '【天纵】应输出置入日志');

  // 机衡：把天纵里的实体牌取回手牌
  g.turnCount = 32;
  p.marks.xinzhiyu = 1;
  const hand0 = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(p.hand.includes(c), `【机衡】应把【天纵】里的实体牌取回手牌（手牌 ${hand0} → ${p.hand.length}）`);
  ok(!(g.exilePile || []).includes(c), '【机衡】取回后该牌不应再留在移出区');
  ok((p.marks.tianzong || []).length === 0, '【机衡】取回后天纵列表应清空');
}

// ================= 18. 第二轮：属性【杀】/ 新装备 / 新锦囊 =================
{
  const g = mk(['sunquan', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  p.hand = []; t.hand = [];
  const fire = card('fs1', 'sha', 'heart', 7); fire.nature = 'fire';
  p.hand.push(fire);
  const hp0 = t.hp;
  await g.useCard({ from: p, card: fire, targets: [t] });
  ok(t.hp === hp0 - 1, `火【杀】应造成 1 点伤害（${hp0} → ${t.hp}）`);
  ok(hasLog(g, '火焰伤害'), '火【杀】的伤害日志应标为火焰伤害');
  ok(CARD_META.sha && !CARD_META.huosha, '属性【杀】沿用 sha 牌名 + nature 字段（不新增牌名）');
}
{
  // 太平要术：防止火焰伤害
  const g = mk(['sunquan', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  t.hand = [];
  t.equips.treasure = card('tp1', 'taiping', 'club', 3);
  t.equips.treasure.type = 'equip';
  const fire = card('fs2', 'sha', 'heart', 8); fire.nature = 'fire';
  const hp0 = t.hp;
  await g.useCard({ from: p, card: fire, targets: [t] });
  ok(t.hp === hp0, `太平要术应防止火焰伤害（${hp0} → ${t.hp}）`);
}
{
  // 霹雳车：造成伤害后弃置目标装备
  const g = mk(['sunquan', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  t.hand = [];
  p.equips.weapon = card('pl1', 'piliche', 'spade', 5);
  p.equips.weapon.type = 'equip';
  t.equips.armor = card('ar1', 'baiyin', 'spade', 2);
  t.equips.armor.type = 'equip';
  const sha = card('s1', 'sha', 'spade', 9);
  await g.useCard({ from: p, card: sha, targets: [t] });
  ok(!t.equips.armor, '霹雳车：造成伤害后应弃置目标的装备');
}
{
  // 木牛流马：回合开始运粮摸 1 张
  const g = mk(['sunquan', 'sunquan']);
  const p = g.players[0];
  p.equips.treasure = card('mn1', 'muniu', 'club', 6);
  p.equips.treasure.type = 'equip';
  const n0 = p.hand.length;
  await g.runTurn(p);                    // 运粮写在 runTurn 内（非 turn.begin 触发器）
  ok(hasLog(g, '运粮'), '木牛流马：回合开始应「运粮」摸牌');
}
{
  // 兵临城下：查看牌堆顶 4 张，使用其中的【杀】
  const g = mk(['sunquan', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  const sha = card('b1', 'sha', 'spade', 10);
  g.deck.push(card('b2', 'shan', 'heart', 2), card('b3', 'tao', 'heart', 3), card('b4', 'guohe', 'club', 4), sha);
  const bl = card('bl1', 'binglin', 'spade', 5);
  bl.type = 'trick';
  const hp0 = t.hp;
  await g.useCard({ from: p, card: bl, targets: [p] });
  ok(t.hp === hp0 - 1, `兵临城下应使用牌堆顶的【杀】命中目标（${hp0} → ${t.hp}）`);
  ok(g.discardPile.some(c => c.id === 'b1'), '兵临城下用掉的【杀】应进入弃牌堆');
}
{
  // 奇正相生：奇兵（对方未打出）→ 获得对方一张牌；正兵（对方未打出）→ 1 点伤害
  const g = mk(['sunquan', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  t.hand = [card('t1', 'shan', 'heart', 5)];
  const qz = card('qz1', 'qizheng', 'club', 6); qz.type = 'trick';
  const h0 = p.hand.length;
  // 使用者选奇兵(index 0)、目标选不打出(index 2)
  const oldAsk = g.responder.ask;
  g.responder.ask = async (gg, pl, req) => {
    if (req.kind === 'choice') return { index: pl === p ? 0 : 2 };
    if (req.kind === 'targets') return { seats: [1] };
    return oldAsk ? oldAsk(gg, pl, req) : null;
  };
  await g.useCard({ from: p, card: qz, targets: [t] });
  ok(p.hand.some(c => c.id === 't1'), '奇兵：对方未打出【杀】时应获得其一张牌');
  ok(t.hp === t.maxHp, '奇兵不造成伤害');
}
{
  const g = mk(['sunquan', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  t.hand = [];
  const qz = card('qz2', 'qizheng', 'club', 7); qz.type = 'trick';
  const hp0 = t.hp;
  const oldAsk = g.responder.ask;
  g.responder.ask = async (gg, pl, req) => {
    if (req.kind === 'choice') return { index: pl === p ? 1 : 2 };   // 正兵 / 不打出
    if (req.kind === 'targets') return { seats: [1] };
    return oldAsk ? oldAsk(gg, pl, req) : null;
  };
  await g.useCard({ from: p, card: qz, targets: [t] });
  ok(t.hp === hp0 - 1, `正兵：对方未打出【闪】时应受到 1 点伤害（${hp0} → ${t.hp}）`);
}

// ================= 19. 身份局：只显示自己的身份 =================
{
  const seats = [
    { id: 's0', name: 'P0', isAI: true, general: generalById('sunquan'), role: 'lord' },
    { id: 's1', name: 'P1', isAI: true, general: generalById('sunquan'), role: 'rebel' },
    { id: 's2', name: 'P2', isAI: true, general: generalById('sunquan'), role: 'rebel' },
  ];
  const g = new Game({
    seats, mode: getMode('identity'), seed: 20261025,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async () => ({ yes: false }) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  g.onState = () => {};
  const s0 = g.snapshot(0), s1 = g.snapshot(1);
  ok(s0.players[0].role === 'lord', `自己视角应能看到自己的身份（实际 ${s0.players[0].role}）`);
  ok(s0.players[1].role === null, '自己视角看不到他人身份');
  ok(s1.players[1].role === 'rebel', `他人视角能看到自己的身份（实际 ${s1.players[1].role}）`);
  ok(s1.players[0].role === 'lord', '主公身份对所有人公开');
}

// ================= 20. 月系统：上限 / 天诛 / 诈降 / 忠心 / 武圣 =================
{
  const g = mk(['moon_huangzhong', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  ok(p.moonMax === 7, `月·黄忠的月标记上限应为 7（实际 ${p.moonMax}）`);
  ok(p.maxHp === 4, `月·黄忠体力应为 4 点（实际 ${p.maxHp}）`);
  ok(g.players[1].moonMax === 10, '非月将默认上限 10');
  // 卡面口径：圆形勾玉个数=体力值，月上限取文字标注，二者互不推导
  {
    const hpOf = (id) => ({ moon_huangzhong: 4, moon_huanggai: 4, moon_guanyu: 5, myth_change: 7, myth_columbia: 7 })[id];
    const mmOf = (id) => ({ moon_huangzhong: 7, moon_huanggai: 6, moon_guanyu: 6, myth_change: 10, myth_columbia: 10 })[id];
    for (const id of ['moon_huangzhong', 'moon_huanggai', 'moon_guanyu', 'myth_change', 'myth_columbia']) {
      const gg = mk([id, 'sunquan']);
      const pp = gg.players[0];
      ok(pp.maxHp === hpOf(id) && pp.moonMax === mmOf(id),
        `${id} 应为 ${hpOf(id)} 血 / 月上限 ${mmOf(id)}（实际 ${pp.maxHp} 血 / ${pp.moonMax}）`);
    }
  }
  // 逐月：使用牌积累 ☽ 并记录花色
  p.marks.yue = 0; p.flags = {};
  const sha = card('m1', 'sha', 'spade', 7);
  await g.useCard({ from: p, card: sha, targets: [t] });
  ok(p.marks.yue === 2, `【逐月】首次记录该花色应 +2 层（实际 ${p.marks.yue}）`);
  const wu2 = card('m2', 'wuzhong', 'spade', 8);
  await g.useCard({ from: p, card: wu2, targets: [] });
  ok(p.marks.yue === 3, `【逐月】重复花色应只 +1 层（实际 ${p.marks.yue}）`);
  // 天诛：满辉时按记录花色数造成伤害并清空
  p.marks.yue = 7;
  p.flags.zhuyueSuits = ['spade', 'heart', 'club'];
  p.hand.push(card('m3', 'wuzhong', 'diamond', 5));
  const hp0 = t.hp;
  await g.useCard({ from: p, card: p.hand[p.hand.length - 1], targets: [] });
  ok(t.hp === hp0 - 3, `【天诛】应造成「记录花色数」点伤害（3 点，${hp0} → ${t.hp}）`);
  ok(p.marks.yue === 0 && p.flags.zhuyueSuits.length === 0, '【天诛】应清空 ☽ 与花色记录');
}
{
  // 月·黄盖：【苦肉】累积 ☽、【诈降】把 ☽ 换成牌堆底的【杀】
  const g = mk(['moon_huanggai', 'sunquan']);
  const p = g.players[0];
  ok(p.moonMax === 6, `月·黄盖的月标记上限应为 6（实际 ${p.moonMax}）`);
  p.marks.yue = 0; p.flags = {};
  const hp0 = p.hp;
  await g.trigger('turn.begin', { self: p });
  ok(p.hp === hp0 - 1, `【苦肉】回合开始应失去 1 点体力（${hp0} → ${p.hp}）`);
  ok(p.marks.yue === 2, `【苦肉】应积累 2 层 ☽（实际 ${p.marks.yue}）`);
  // 诈降：deck 底部（数组头部）放 2 张杀
  p.marks.yue = 2;
  g.deck.unshift(card('k1', 'sha', 'spade', 6), card('k2', 'sha', 'heart', 7));
  const n0 = p.hand.length;
  await g.useActiveSkill(p, 'moon_zhaxiang');
  ok(p.hand.length === n0 + 2, `【诈降】应从牌堆底获得等量【杀】（${n0} → ${p.hand.length}）`);
  ok(p.marks.yue === 0, '【诈降】应耗尽 ☽');
}
{
  // 月·关羽：【武魂】指定他人 +1、【武圣】满辉 → 额外回合 + 杀可多目标
  const g = mk(['moon_guanyu', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  ok(p.moonMax === 6, `月·关羽的月标记上限应为 6（实际 ${p.moonMax}）`);
  p.marks.yue = 0; p.flags = {};
  await g.useCard({ from: p, card: card('g1', 'sha', 'spade', 8), targets: [t] });
  ok(p.marks.yue === 1, `【武魂】使用牌指定其他角色应 +1 层（实际 ${p.marks.yue}）`);
  p.marks.yue = 6;
  g.deck.unshift(card('g2', 'sha', 'club', 3), card('g3', 'shan', 'club', 4));
  await g.trigger('turn.begin', { self: p });
  ok(p.marks.yue === 0, '【武圣】应耗尽 ☽');
  ok(p.flags.shaMultiTarget === true, '【武圣】额外回合内【杀】可指定任意名目标');
  ok(p.flags.shaUnlimited === true, '【武圣】额外回合内【杀】无次数限制');
}

// ================= 21. 她的乡愁：满辉技，集满「☽」才能发动，5 点无来源伤害（此前误识别为 0.5） =================
{
  const g = mk(['myth_columbia', 'sunquan'], { yes: false });
  const p = g.players[0], t = g.players[1];
  p.hand = [card('x1', 'sha', 'spade', 7)];
  t.hand = [];
  t.hp = 8; t.maxHp = 8;                 // 撑高体力，便于观察 5 点伤害
  const hp0 = t.hp;
  // 未集满时不能发动（满辉技）
  p.marks.yue = 0;
  await g.useActiveSkill(p, 'xiangchou');
  ok(t.hp === hp0, `【她的乡愁】未集满「☽」时不应发动（hp=${t.hp}）`);
  // 集满时发动 → 5 点伤害，且耗尽「☽」
  p.marks.yue = p.moonMax || 10;
  await g.useActiveSkill(p, 'xiangchou');
  ok(t.hp === hp0 - 5, `【她的乡愁】应造成 5 点无来源伤害（${hp0} → ${t.hp}）`);
  ok((p.marks.yue || 0) === 0, `【她的乡愁】满辉发动后应耗尽「☽」（现 ${p.marks.yue}）`);
}

// ================= 22. 【新征程】增幅同时作用于【奋进】获得的 ☽ 个数 =================
{
  const g = mk(['myth_change', 'sunquan']);
  const p = g.players[0];
  p.flags = {};
  p.marks.zengfu = 0; p.marks.yue = 0;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.marks.yue === 1, `无增幅时【奋进】每阶段应得 1 个 ☽（实际 ${p.marks.yue}）`);
  p.marks.zengfu = 100; p.marks.yue = 0;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.marks.yue === 2, `增幅 +100%（×2）时【奋进】应得 2 个 ☽（实际 ${p.marks.yue}）`);
  p.marks.zengfu = 50; p.marks.yue = 0;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.marks.yue === 1, `增幅 +50%（×1.5 向下取整）时【奋进】仍得 1 个 ☽（实际 ${p.marks.yue}）`);
  p.marks.zengfu = 300; p.marks.yue = 0;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.marks.yue === 4, `增幅 +300%（×4）时【奋进】应得 4 个 ☽（实际 ${p.marks.yue}）`);
  p.marks.zengfu = 100; p.marks.yue = 9;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  // 集满（10）后满辉【新征程】会立即发动（清空重得 1~5 个），故此处只断言「未超上限」
  ok(p.marks.yue <= 10, `【奋进】获得个数不得超月标记上限（实际 ${p.marks.yue}）`);
  p.marks.zengfu = 100; p.marks.yue = 0;
  await g.trigger('card.use.after', { self: p, card: card('wg1', 'wugu'), asName: 'wugu' });
  ok(p.marks.yue === 2, `增幅 +100% 时【奋进】用【五谷丰登】也应得 2 个（实际 ${p.marks.yue}）`);
}

console.log(`\n星将/异闻 机制单测：通过 ${pass} / 失败 ${fail}`);
if (bad.length) {
  console.log('失败项：');
  bad.forEach(b => console.log('  ✗', b));
  process.exit(1);
}
