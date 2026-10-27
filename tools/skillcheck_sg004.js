// SG004 技能定向测试：界 4 + 谋 11 + 极 3（独立脚本，不接入 selfcheck）
// 运行：node tools/skillcheck_sg004.js
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill } from '../src/engine/skill.js';
import { generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; bad.push(msg); }
}

const SG004_IDS = [
  // 界
  'jie_qixi', 'jie_kurou', 'jie_jieyin', 'jie_xiaoji',
  // 谋
  'mou_jianxiong', 'mou_hujia', 'mou_lijian', 'mou_tuxi', 'mou_luoyi', 'mou_yingzi',
  'mou_fanjian', 'mou_guanxing', 'mou_paoxiao', 'mou_wusheng', 'mou_zhiheng',
  // 极
  'ji_wushuang', 'ji_guicai', 'ji_fanjian',
];

// ① 独立注册（不得走前缀降级） ② 必须有 desc
for (const id of SG004_IDS) {
  const s = getSkill(id);
  ok(!!s && s.id === id && !s.fallbackOf, `${id} 未独立注册（或仍走前缀降级）`);
  ok(!!s?.desc, `${id} 缺少 desc`);
}

function makeResponder(handler) {
  return {
    askPlay: async () => ({ endPhase: true }),
    ask: async (g, p, req) => handler(g, p, req),
  };
}

function mk(ids, handler) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261025,
    responder: makeResponder(handler), deckEntries: deckEntries('standard'),
    config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}

const card = (id, name, suit = 'heart', num = 1, type = 'basic') => ({ id, name, suit, num, type });
const yes = () => ({ yes: true });

// ---------- 界甘宁 · 奇袭 ----------
{
  let asked = false;
  const g = mk(['jie_ganning', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') { asked = true; return { seats: [1] }; }
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const [p, t] = g.players;
  const black = card('q1', 'sha', 'spade', 7);
  p.hand = [black];
  t.hand = [card('q2', 'tao', 'heart', 3)];
  await g.useActiveSkill(p, 'jie_qixi');
  ok(asked, '奇袭：未询问【过河拆桥】目标');
  ok(!p.hand.includes(black), '奇袭：黑色牌未作为【过河拆桥】消耗');
  ok(t.hand.length === 0, '奇袭：未弃置目标一张牌');
}

// ---------- 界黄盖 · 苦肉 ----------
{
  const g = mk(['jie_huanggai', 'simayi'], (gg, p, req) => (req.kind === 'card' ? { cardId: (req.cards || [])[0] } : null));
  const [p] = g.players;
  p.hp = 4;
  p.hand = [card('k1', 'sha', 'spade', 7)];
  await g.useActiveSkill(p, 'jie_kurou');
  ok(p.hp === 3, `苦肉：失去 1 点体力后应为 3，实际 ${p.hp}`);
  ok(p.hand.length === 3, `苦肉：弃 1 摸 3 后手牌应为 3，实际 ${p.hand.length}`);
}

// ---------- 界孙尚香 · 结姻 ----------
{
  const g = mk(['jie_sunshangxiang', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, 2) };
    return null;
  });
  const [p, t] = g.players;
  p.hp = 2; t.hp = 2;
  p.hand = [card('j1', 'sha', 'spade', 7), card('j2', 'shan', 'heart', 2)];
  await g.useActiveSkill(p, 'jie_jieyin');
  ok(p.hp === 3, `结姻：发动者应回复 1 点体力，实际 ${p.hp}`);
  ok(t.hp === 3, `结姻：目标应回复 1 点体力，实际 ${t.hp}`);
  ok(p.hand.length === 0, '结姻：未弃置两张手牌');
}

// ---------- 界孙尚香 · 枭姬 ----------
{
  const g = mk(['jie_sunshangxiang', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? yes() : null));
  const [p] = g.players;
  const armor = card('x1', 'bagua', 'spade', 2, 'equip');
  p.equips.armor = armor;
  const before = p.hand.length;
  await g.discardCards(p, [armor], { reason: 'test' });
  ok(p.equips.armor === null, '枭姬：装备未离开装备区');
  ok(p.hand.length === before + 2, `枭姬：失去装备后应摸 2 张，实际 ${p.hand.length - before}`);
}

// ---------- 谋曹操 · 奸雄 ----------
{
  const g = mk(['mou_caocao', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? yes() : null));
  const [p, src] = g.players;
  p.hp = 4;
  const dmg = card('m1', 'sha', 'spade', 7);
  g.table.push(dmg);
  const before = p.hand.length;
  await g.damage({ from: src, to: p, amount: 1, card: dmg, reason: 'sha' });
  ok(p.hand.includes(dmg), '奸雄：未获得造成伤害的牌');
  ok(p.hand.length === before + 2, `奸雄：获得伤害牌并摸 1 张后手牌应为 +2，实际 +${p.hand.length - before}`);
}

// ---------- 谋曹操 · 护驾 ----------
{
  const g = mk(['mou_caocao', 'simayi', 'caocao'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const [p, ally] = g.players;
  p.role = 'lord';
  const shan = card('h1', 'shan', 'heart', 2);
  ally.hand = [shan];
  const data = { self: p, filter: { name: 'shan' }, handled: false, card: null };
  await g.trigger('respond.need', data);
  ok(data.handled === true && data.card?.name === 'shan', '护驾：未视为打出【闪】');
  ok(p.hand.includes(shan), '护驾：魏势力角色的【闪】未交给主公');
  ok(!ally.hand.includes(shan), '护驾：魏势力角色的【闪】未移出手牌');

  // 每回合限一次
  const shan2 = card('h2', 'shan', 'diamond', 3);
  ally.hand = [shan2];
  const data2 = { self: p, filter: { name: 'shan' }, handled: false, card: null };
  await g.trigger('respond.need', data2);
  ok(data2.handled === false, '护驾：同一回合不应再次发动');
}

// ---------- 谋貂蝉 · 离间 ----------
{
  const g = mk(['mou_diaochan', 'simayi', 'caocao'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1, 2] };
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const [p, , b] = g.players;
  p.hand = [card('l1', 'tao', 'heart', 3)];
  b.hand = [];
  const hp = b.hp;
  await g.useActiveSkill(p, 'mou_lijian');
  ok(p.hand.length === 0, '离间：未弃置一张牌');
  ok(b.hp === hp - 1, `离间：后者应受到 1 点决斗伤害，实际 ${hp - b.hp} 点`);
}

// ---------- 谋张辽 · 突袭 ----------
{
  const g = mk(['mou_zhangliao', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const [p, t] = g.players;
  p.hand = [];
  t.hand = [card('t1', 'tao', 'heart', 3), card('t2', 'sha', 'spade', 7)];
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(p.flags.skip_draw === true, '突袭：未跳过摸牌阶段');
  ok(p.hand.length === 2, `突袭：少摸 1 张并获 1 张后手牌应为 2，实际 ${p.hand.length}`);
  ok(t.hand.length === 1, '突袭：未获得目标一张手牌');
  p.flags.skip_draw = false;
}

// ---------- 谋许褚 · 裸衣 ----------
{
  const g = mk(['mou_xuchu', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? yes() : null));
  const [p, t] = g.players;
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(p.flags.skip_one_draw === true, '裸衣：未少摸一张');
  ok(p.flags.mouLuoyi === true, '裸衣：未设置伤害 +1 标记');
  const d1 = { self: t, from: p, amount: 1, reason: 'sha', card: card('b1', 'sha') };
  await g.trigger('damage.before', d1);
  ok(d1.amount === 2, `裸衣：【杀】伤害应 +1，实际 ${d1.amount}`);
  const d2 = { self: t, from: p, amount: 1, reason: 'juedou', card: card('b2', 'juedou') };
  await g.trigger('damage.before', d2);
  ok(d2.amount === 2, `裸衣：【决斗】伤害应 +1，实际 ${d2.amount}`);
  await g.trigger('turn.end', { self: p });
  ok(p.flags.mouLuoyi === false, '裸衣：回合结束未清理伤害 +1 标记');
}

// ---------- 谋周瑜 · 英姿 ----------
{
  const g = mk(['mou_zhouyu', 'simayi'], (gg, p, req) =>
    (req.kind === 'discard' ? { cardIds: (req.cards || []).slice(0, req.max || 1) } : null));
  const [p] = g.players;
  const d = { self: p, count: 2 };
  await g.trigger('draw.count', d);
  ok(d.count === 3, `英姿：摸牌数应 +1，实际 ${d.count}`);
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.handLimit === p.maxHp, `英姿：手牌上限加成应为体力上限 ${p.maxHp}，实际 ${p.flags.handLimit}`);
  p.hp = 3;
  p.hand = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((id, i) => card(id, 'sha', 'spade', i + 1));
  await g.runPhase(p, 'discard');
  ok(p.hand.length === 6, `英姿：手牌上限 6 时不应弃牌，实际剩 ${p.hand.length}`);
  await g.trigger('turn.end', { self: p });
  ok(p.flags.handLimit === 0, '英姿：回合结束未清理手牌上限加成');
}

// ---------- 谋周瑜 · 反间 ----------
{
  const g = mk(['mou_zhouyu', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 0 }; // 黑桃
    return null;
  });
  const [p, t] = g.players;
  p.hand = [card('f1', 'tao', 'heart', 3)];
  t.hand = [];
  const hp = t.hp;
  await g.useActiveSkill(p, 'mou_fanjian');
  ok(p.hand.length === 0, '反间：交给对方的牌未移出手牌');
  ok(t.hand.length === 1, '反间：目标未获得展示牌');
  ok(t.hp === hp - 1, '反间：花色不符应造成 1 点伤害');
}

// ---------- 谋诸葛亮 · 观星 ----------
{
  const g = mk(['mou_zhugeliang', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const [p] = g.players;
  const before = g.deck.length;
  const topIds = g.deck.slice(-2).map(c => c.id);
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(g.deck.length === before, `观星：观看后牌堆数应不变，${before} → ${g.deck.length}`);
  ok(topIds.every(id => g.deck.some(c => c.id === id)), '观星：看过的牌未放回牌堆');
}

// ---------- 谋张飞 · 咆哮 ----------
{
  const g = mk(['mou_zhangfei', 'simayi'], () => null);
  const [p, t] = g.players;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.shaUnlimited === true, '咆哮：未获得无限出杀');
  const before = p.hand.length;
  await g.trigger('sha.dodged', { self: p, target: t, card: card('s1', 'sha') });
  ok(p.hand.length === before + 1, '咆哮：杀被闪抵消后未摸一张牌');
  await g.trigger('turn.end', { self: p });
  ok(p.flags.shaUnlimited === false, '咆哮：回合结束未清理无限出杀');
}

// ---------- 谋关羽 · 武圣 ----------
{
  const g = mk(['mou_guanyu', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const [p, t] = g.players;
  const red = card('w1', 'tao', 'heart', 3);
  p.hand = [red];
  ok(g.virtualAllowed(p, [red], 'sha') === true, '武圣：红色牌不能当【杀】使用');
  const data = { self: p, filter: { name: 'sha' }, handled: false, card: null };
  await g.trigger('respond.need', data);
  ok(data.handled === true && data.card?.name === 'sha', '武圣：红色牌未能当【杀】打出');
  const d = { self: t, from: p, amount: 1, reason: 'sha', card: { ...red, name: 'sha', __src: red } };
  await g.trigger('damage.before', d);
  ok(d.amount === 2, `武圣：以此法造成的伤害应 +1，实际 ${d.amount}`);
}

// ---------- 谋孙权 · 制衡 ----------
{
  const g = mk(['mou_sunquan', 'simayi'], (gg, p, req) => (req.kind === 'cards' ? { cardIds: (req.cards || []).slice() } : null));
  const [p] = g.players;
  p.hand = [card('z1', 'sha', 'spade', 7), card('z2', 'shan', 'heart', 2)];
  await g.useActiveSkill(p, 'mou_zhiheng');
  ok(p.hand.length === 3, `制衡：弃光手牌应额外摸 1 张（共 3），实际 ${p.hand.length}`);
}

// ---------- 极吕布 · 无双 ----------
{
  const g = mk(['ji_lvbu', 'simayi'], () => null);
  const [p, t] = g.players;
  const d = { self: t, from: p, card: card('v1', 'sha', 'spade', 8), dodged: false, extraDodge: 0 };
  await g.trigger('dodge.before', d);
  ok(d.extraDodge === 1, `无双：【杀】应需两张【闪】（extraDodge=${d.extraDodge}）`);
  const n = { self: t, from: p, card: card('v2', 'juedou'), extraSha: 0 };
  await g.trigger('juedou.need', n);
  ok(n.extraSha === 1, `无双：【决斗】每次应打出两张【杀】（extraSha=${n.extraSha}）`);
}

// ---------- 极司马懿 · 鬼才 ----------
{
  const g = mk(['ji_simayi', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const [p] = g.players;
  p.skills = [getSkill('ji_guicai')]; // 隔离标准包【反馈】【鬼才】，只测极鬼才
  g.players[1].skills = [];           // 对方的标准【鬼才】也会响应任意判定，一并隔离
  const black = card('g1', 'sha', 'spade', 7);
  const keep = card('g2', 'tao', 'heart', 3);
  p.hand = [black, keep];
  const top = card('g3', 'wuzhong', 'club', 9);
  g.deck.push(top);
  const data = { self: p, card: card('j1', 'sha', 'heart', 5), suit: 'heart', num: 5, reason: 'test' };
  await g.trigger('judge.before', data);
  ok(data.suit === 'spade' && data.num === 7, `鬼才：判定未改为打出的牌（${data.suit}${data.num}）`);
  ok(!p.hand.includes(black), '鬼才：打出的手牌未移出手牌');
  ok(p.hand.includes(top), '鬼才：打出黑色牌后未摸一张牌');
}

// ---------- 极周瑜 · 反间 ----------
{
  const g = mk(['ji_zhouyu', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 0 }; // 黑桃
    return null;
  });
  const [p, t] = g.players;
  p.hand = [card('v3', 'tao', 'heart', 3)];
  t.hand = [];
  const hp = t.hp;
  await g.useActiveSkill(p, 'ji_fanjian');
  ok(p.hand.length === 0, '极反间：交给对方的牌未移出手牌');
  ok(t.hand.length === 1, '极反间：目标未获得展示牌');
  ok(t.hp === hp - 1, '极反间：花色不符应造成 1 点伤害');
}

console.log(`通过 ${pass} / 失败 ${fail}`);
if (bad.length) {
  console.log('失败项：');
  for (const b of bad) console.log('  -', b);
  process.exit(1);
}
