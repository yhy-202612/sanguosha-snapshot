// 阶段 4 收尾批守门测试（诸葛诞 / 左慈简化化身 / 魔周瑜）+ SG016 三处修复回归
// 运行：node tools/phase4check.js
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById } from '../src/data/generals.js';
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
      if (over.hasOwnProperty('card')) return { cardId: over.card };
      return { cardId: (p.hand[0] || {}).id };
    }
    return null;
  };
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261026,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
const hasLog = (g, kw) => g.logs.some(l => String(l.text || l).includes(kw));

// ================= 1. 数据注册 / 技能实装 =================
{
  for (const [gid, name, hp, skills] of [
    ['p4_zhugedan', '诸葛诞', 4, ['gongao', 'juyi']],
    ['p4_zuoci', '左慈', 3, ['huashen2', 'xinsheng2']],
    ['p4_mozhouyu', '魔周瑜', 4, ['moyan', 'fentian']],
  ]) {
    const gd = generalById(gid);
    ok(!!gd, `${gid} 数据缺失`);
    ok(gd?.name === name, `${gid} 名称不符：${gd?.name}`);
    ok(gd?.hp === hp, `${gid} 体力应为 ${hp}，实际 ${gd?.hp}`);
    for (const sid of skills) {
      ok(gd?.skills.includes(sid), `${name} 技能列表缺少 ${sid}`);
      const sk = getSkill(sid);
      ok(!!sk && !sk.fallbackOf, `技能 ${sid} 未真实装（不得降级）`);
      ok(sk?.name && sk?.desc && sk.desc.length > 8, `技能 ${sid} 缺 name/desc`);
    }
  }
  ok(GENERALS.filter(g => g.pack === 'phase4').length === 3, `phase4 包将数应为 3，实际 ${GENERALS.filter(g => g.pack === 'phase4').length}`);
}

// ================= 2. 诸葛诞【功獒】任意角色受伤得「暴」 =================
{
  const g = mk(['p4_zhugedan', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  ok((p.marks.bao || 0) === 0, '「暴」初始应为 0');
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok((p.marks.bao || 0) === 1, `【功獒】自己受伤后应得 1 枚「暴」（实际 ${p.marks.bao || 0}）`);
  await g.damage({ from: p, to: t, amount: 1, reason: 'test' });
  ok((p.marks.bao || 0) === 2, `【功獒】他人受伤后也应得 1 枚「暴」（实际 ${p.marks.bao || 0}）`);
}

// ================= 3. 诸葛诞【举义】觉醒（暴≥3 → 减上限 + 获得崩坏/威重） =================
{
  const g = mk(['p4_zhugedan', 'sunquan'], { yes: true });
  const p = g.players[0];
  p.marks.bao = 2;
  await g.trigger('phase.begin', { self: p, player: p, phase: 'prepare' });
  ok(p.maxHp === 4 && !p.skills.some(s => s.id === 'bengkai'), `暴不足 3 时不应觉醒（上限 ${p.maxHp}）`);
  p.marks.bao = 3;
  await g.trigger('phase.begin', { self: p, player: p, phase: 'prepare' });
  ok(p.maxHp === 3, `【举义】觉醒应减 1 点体力上限（实际 ${p.maxHp}）`);
  ok(p.skills.some(s => s.id === 'bengkai') && p.skills.some(s => s.id === 'weizhong'),
    '【举义】觉醒应获得【崩坏】与【威重】');
  ok(p.flags.juyiUsed === true, '【举义】觉醒技应只生效一次');
  // 再次准备阶段不应重复觉醒
  p.marks.bao = 6;
  await g.trigger('phase.begin', { self: p, player: p, phase: 'prepare' });
  ok(p.maxHp === 3, `【举义】不应二次觉醒（上限 ${p.maxHp}）`);
}

// ================= 4. 【崩坏】+【威重】（减上限时摸一张） =================
{
  const g = mk(['p4_zhugedan', 'sunquan'], { yes: true, index: 0 });
  const p = g.players[0], t = g.players[1];
  p.maxHp = 4; p.hp = 4; t.hp = 1;
  p.skills.push(getSkill('bengkai'), getSkill('weizhong'));
  p.hand = [];
  const h0 = p.hand.length;
  await g.trigger('phase.begin', { self: p, player: p, phase: 'end' });
  ok(p.maxHp === 3, `【崩坏】选减上限后应 4 → 3（实际 ${p.maxHp}）`);
  ok(p.hand.length === h0 + 1, `【威重】体力上限减少后应摸 1 张（${h0} → ${p.hand.length}）`);
  // 已是体力最少者 → 不结算
  const p2 = mk(['p4_zhugedan', 'sunquan'], { yes: true, index: 1 }).players[0];
  const g2 = mk(['p4_zhugedan', 'sunquan'], { yes: true, index: 1 });
  const q = g2.players[0], r = g2.players[1];
  q.maxHp = 4; q.hp = 1; r.hp = 3;
  q.skills.push(getSkill('bengkai'));
  await g2.trigger('phase.begin', { self: q, player: q, phase: 'end' });
  ok(q.hp === 1 && q.maxHp === 4, `【崩坏】体力最少时不应结算（${q.hp}/${q.maxHp}）`);
}

// ================= 5. 左慈【化身】开局 2 张 + 获得技能 / 【新生】 =================
{
  const g = mk(['p4_zuoci', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', { self: null });
  const list = p.marks.huashan || [];
  ok(list.length === 2, `【化身】开局应得 2 张化身牌（实际 ${list.length}）`);
  ok(list.every(gid => generalById(gid) && gid !== 'p4_zuoci'), '化身牌应为其他武将 id');
  const sk0 = p.skills.length;
  const sk0Ids = new Set(p.skills.map(s => s.id));
  await g.useActiveSkill(p, 'huashen2');
  ok(p.skills.length === sk0 + 1, `【化身】应获得 1 个技能（${sk0} → ${p.skills.length}）`);
  ok(!!p.flags.huashenSkill, '【化身】应记录以此法获得的技能 id');
  const gained = p.skills.filter(s => !sk0Ids.has(s.id)).map(s => s.id);
  ok(gained.length === 1 && !['huashen', 'xinsheng', 'huashen2', 'xinsheng2'].includes(gained[0]),
    `【化身】不应获得化身类技能（实际获得 ${gained.join('、') || '无'}）`);
  // 新生：受伤后 +1 张（上限 4）
  p.hp = 3; p.maxHp = 3;
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok((p.marks.huashan || []).length === 3, `【新生】受伤后应 +1 张化身牌（实际 ${(p.marks.huashan || []).length}）`);
  p.marks.huashan = ['standard_caocao', 'standard_liubei', 'standard_sunquan', 'standard_zhaoyun'];
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok((p.marks.huashan || []).length === 4, `【新生】化身牌上限应为 4（实际 ${(p.marks.huashan || []).length}）`);
}

// ================= 6. 魔周瑜【魔炎】弃红牌造成火焰伤害 =================
{
  const g = mk(['p4_mozhouyu', 'sunquan'], { seats: [1] });
  const p = g.players[0], t = g.players[1];
  p.hand = [card('r1', 'sha', 'heart', 5)];
  t.hp = 4; t.maxHp = 4;
  const h0 = p.hand.length;
  await g.useActiveSkill(p, 'moyan');
  ok(t.hp === 3, `【魔炎】应造成 1 点伤害（${t.hp}/4）`);
  ok(p.hand.length === h0 - 1, `【魔炎】应弃置 1 张红色手牌（${h0} → ${p.hand.length}）`);
  ok(hasLog(g, '【魔炎】'), '【魔炎】应有日志');
  // 无红色手牌时不应生效
  p.hand = [card('b1', 'sha', 'spade', 6)];
  const hp1 = t.hp;
  await g.useActiveSkill(p, 'moyan');
  ok(t.hp === hp1, '【魔炎】没有红色手牌时不应造成伤害');
}

// ================= 7. 魔周瑜【焚天】限定技：全体弃牌 + 额外回合 =================
{
  const g = mk(['p4_mozhouyu', 'sunquan', 'liubei'], { card: null });
  const p = g.players[0], t1 = g.players[1], t2 = g.players[2];
  t1.hand = [card('a1', 'sha', 'spade', 3)];
  t2.hand = [card('a2', 'shan', 'heart', 4)];
  const n1 = t1.hand.length, n2 = t2.hand.length;
  await g.useActiveSkill(p, 'fentian');
  ok(t1.hand.length === n1 - 1 && t2.hand.length === n2 - 1,
    `【焚天】应令所有其他角色各弃 1 张（${n1}→${t1.hand.length} / ${n2}→${t2.hand.length}）`);
  ok(p.flags.fentianUsed === true, '【焚天】应标记为已发动（限定技）');
  ok((g.extraQueue || []).includes(p), '【焚天】应获得一个额外回合');
  // 第二次不应再生效
  t1.hand = [card('a3', 'sha', 'club', 5)];
  const before = t1.hand.length;
  await g.useActiveSkill(p, 'fentian');
  ok(t1.hand.length === before, '【焚天】限定技第二次不应生效');
}

// ================= 8. SG016-A 狂魔：击败「狂」对手后获得其所有「炁」 =================
{
  const g = mk(['mo_lvbu', 'sunquan']);
  const p = g.players[0], t = g.players[1];
  p.flags.kuangWith = t.id;
  t.flags.kuangWith = p.id;
  const qi = card('qi1', 'sha', 'spade', 9);
  t.flags.qi = [qi.id];
  t.hand = [qi, card('qi0', 'shan', 'heart', 3)];
  await g.trigger('death.before', { self: t, player: p, killer: p });
  ok(p.hand.includes(qi), '【狂魔】击败「狂」对手后应获得其「炁」牌');
  ok(!t.hand.includes(qi), '【狂魔】对方的「炁」牌应被移出其手牌');
  ok((t.flags.qi || []).length === 0, '【狂魔】对方的「炁」记录应清空');
  // 非「狂」关系不应获得
  const g2 = mk(['mo_lvbu', 'sunquan']);
  const p2 = g2.players[0], t2 = g2.players[1];
  const qi2 = card('qi2', 'sha', 'club', 8);
  t2.flags.qi = [qi2.id];
  t2.hand = [qi2];
  await g2.trigger('death.before', { self: t2, player: p2, killer: p2 });
  ok(!p2.hand.includes(qi2), '【狂魔】非「狂」关系击败时不应获得「炁」');
}

// ================= 9. SG016-B 追姬：后续效果挂到被指定者身上（失去装备后废除栏位） =================
{
  const g = mk(['xuanshifu', 'sunquan', 'liubei'], { yes: true, seats: [1] });
  const p = g.players[0], t = g.players[1];
  t.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
  await g.trigger('death.before', { self: p, player: p, killer: null });
  const slots = Object.keys(t.equips).filter(k => t.equips[k]);
  ok(slots.length > 0, `【追姬】应给目标空置装备栏随机装备（实际装备 ${slots.length} 个）`);
  ok(t.skills.some(s => s.id === 'zhuiji_mark'), '【追姬】应把「失去后废除」的结算挂到被指定角色身上');
  ok(!t.equips.__disabled, '【追姬】不应把 dict 写进 equips（会被当牌遍历）');
  const slot = slots[0];
  const eq = t.equips[slot];
  ok(!!t.flags.zhuijiSlot?.[slot], '【追姬】应记录以此法装备的栏位');
  await g.discardCards(t, [eq], { reason: 'test' });
  ok(t.flags.disabledEquip?.[slot] === true, `【追姬】失去该装备后应废除 ${slot} 装备栏`);
}

// ================= 10. SG016-C 同援：红锦囊不可被无懈 + 红基本牌额外目标 =================
{
  // 10.1 红色普通锦囊不可被【无懈可击】响应
  const g = mk(['zhanghu', 'sunquan'], { card: null });
  const p = g.players[0], t = g.players[1];
  p.flags.tongyuanTrick = true;
  p.flags.tongyuanBasic = true;
  t.hand = [card('wx1', 'wuxie', 'spade', 2)];
  let askedWuxie = 0;
  g.responder.ask = async (gg, pl, req) => {
    const pr = req.prompt || '';
    if (req.kind === 'card' && (req.filter?.name === 'wuxie' || pr.includes('无懈'))) {
      askedWuxie++;
      return { cardId: null };
    }
    if (req.kind === 'card') return { cardId: null };
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [] };
    return null;
  };
  p.hand = [card('wz1', 'wuzhong', 'heart', 7)];
  await g.useCard({ from: p, card: p.hand[0], targets: [p], reason: 'play' });
  ok(askedWuxie === 0, `【同援】两个效果都触发后，红色普通锦囊不应被【无懈可击】响应（实际询问 ${askedWuxie} 次）`);

  // 对照：未触发时应该会询问无懈
  const g2 = mk(['zhanghu', 'sunquan'], { card: null });
  const p2 = g2.players[0], t2 = g2.players[1];
  t2.hand = [card('wx2', 'wuxie', 'spade', 2)];
  let asked2 = 0;
  g2.responder.ask = async (gg, pl, req) => {
    const pr = req.prompt || '';
    if (req.kind === 'card' && (req.filter?.name === 'wuxie' || pr.includes('无懈'))) { asked2++; return { cardId: null }; }
    if (req.kind === 'card') return { cardId: null };
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [] };
    return null;
  };
  p2.hand = [card('wz2', 'wuzhong', 'heart', 8)];
  await g2.useCard({ from: p2, card: p2.hand[0], targets: [p2], reason: 'play' });
  ok(asked2 > 0, `对照：未触发【同援】时红色普通锦囊应可被【无懈可击】响应（询问 ${asked2} 次）`);

  // 10.2 红色基本牌可以额外指定一个目标
  const g3 = mk(['zhanghu', 'sunquan', 'liubei'], { card: null });
  const q = g3.players[0], a = g3.players[1], b = g3.players[2];
  q.flags.tongyuanTrick = true;
  q.flags.tongyuanBasic = true;
  q.equips.weapon = card('wq', 'qinggang', 'spade', 6);
  a.hand = []; b.hand = [];
  q.hand = [card('sh1', 'sha', 'heart', 7)];
  q.flags.shaUsed = 0;
  g3.responder.ask = async (gg, pl, req) => {
    if (req.kind === 'card') return { cardId: null };      // 都不出【闪】
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') {
      if ((req.prompt || '').includes('额外指定')) return { seats: [b.seat] };
      return { seats: [] };
    }
    return null;
  };
  const ah = a.hp, bh = b.hp;
  await g3.useCard({ from: q, card: q.hand[0], targets: [a], reason: 'play' });
  ok(a.hp === ah - 1, `【同援】原目标应受到伤害（${ah} → ${a.hp}）`);
  ok(b.hp === bh - 1, `【同援】红色基本牌应能额外指定一个目标并结算（${bh} → ${b.hp}）`);

  // 对照：未触发时不应追加目标
  const g4 = mk(['zhanghu', 'sunquan', 'liubei'], { card: null });
  const q2 = g4.players[0], a2 = g4.players[1], b2 = g4.players[2];
  q2.equips.weapon = card('wq2', 'qinggang', 'spade', 6);
  a2.hand = []; b2.hand = [];
  q2.hand = [card('sh2', 'sha', 'heart', 8)];
  q2.flags.shaUsed = 0;
  g4.responder.ask = async (gg, pl, req) => {
    if (req.kind === 'card') return { cardId: null };
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [b2.seat] };
    return null;
  };
  const a2h = a2.hp, b2h = b2.hp;
  await g4.useCard({ from: q2, card: q2.hand[0], targets: [a2], reason: 'play' });
  ok(a2.hp === a2h - 1 && b2.hp === b2h, `对照：未触发【同援】时不应有额外目标（${a2h}→${a2.hp} / ${b2h}→${b2.hp}）`);
}

console.log(`\n阶段 4 守门：通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败项：'); bad.forEach(m => console.log('  ✗', m)); process.exit(1); }
