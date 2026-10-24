// SG002 批次 A 技能定向测试（独立脚本，不接入 selfcheck）
// 运行：node tools/skillcheck_sg002.js
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

const JIE_IDS = [
  'jie_jianxiong', 'jie_fankui', 'jie_ganglie', 'jie_tuxi', 'jie_luoyi',
  'jie_yiji', 'jie_luoshen', 'jie_rende', 'jie_wusheng', 'jie_paoxiao',
  'jie_longdan', 'jie_tieji', 'jie_guanxing', 'jie_jizhi', 'jie_zhiheng',
  'jie_keji', 'jie_fanjian', 'jie_liuli', 'jie_qianxun', 'jie_lianying',
  'jie_qingnang', 'jie_wushuang', 'jie_lijian',
];
for (const id of JIE_IDS) {
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
    seats, mode: getMode('duel'), seed: 20261024,
    responder: makeResponder(handler), deckEntries: deckEntries('standard'),
    config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}

const card = (id, name, suit, num) => ({ id, name, suit, num, type: 'basic' });

// 让所有询问都返回“是/第一项/指定目标”
const yes = () => ({ yes: true });

// ---------- 界曹操 · 奸雄 ----------
{
  let pick = 1;
  const g = mk(['jie_caocao', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'choice') return { index: pick };
    return null;
  });
  const [p, src] = g.players;
  p.hp = 4;
  const dmgCard = card('dmg1', 'sha', 'spade', 7);
  g.table.push(dmgCard);
  const before = p.hand.length;
  await g.damage({ from: src, to: p, amount: 1, card: dmgCard, reason: 'sha' });
  ok(p.hand.includes(dmgCard), '奸雄：选择获得伤害牌时未获得');
  ok(p.hand.length === before + 1, '奸雄：获得伤害牌后手牌数不对');

  pick = 0;
  const dmgCard2 = card('dmg2', 'sha', 'club', 8);
  g.table.push(dmgCard2);
  const before2 = p.hand.length;
  await g.damage({ from: src, to: p, amount: 1, card: dmgCard2, reason: 'sha' });
  ok(p.hand.length === before2 + 1, '奸雄：选择摸一张牌时未摸牌');
}

// ---------- 界司马懿 · 反馈 ----------
{
  let pick = 0;
  const g = mk(['jie_simayi', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'choice') return { index: pick };
    return null;
  });
  const [p, src] = g.players;
  p.hp = 3;
  const sc = card('s1', 'tao', 'heart', 3);
  src.hand = [sc];
  await g.damage({ from: src, to: p, amount: 1, reason: 'duel' });
  ok(p.hand.includes(sc), '反馈：选择获得来源一张牌时未获得');

  pick = 1;
  const before = src.hand.length;
  await g.damage({ from: src, to: p, amount: 1, reason: 'duel' });
  ok(src.hand.length === before + 1, '反馈：选择令来源摸牌时未摸牌');
}

// ---------- 界夏侯惇 · 刚烈 ----------
{
  let judgeSuit = 'heart';
  const g = mk(['jie_xiahoudun', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const [p, src] = g.players;
  p.hp = 4; src.hp = 4;
  g.deck.push(card('j1', 'sha', judgeSuit, 7));
  await g.damage({ from: src, to: p, amount: 1, reason: 'sha' });
  ok(src.hp === 3, `刚烈：判定红色应对来源造成 1 点伤害，实际 ${src.hp}`);

  const sc = card('s2', 'shan', 'diamond', 2);
  src.hand = [sc];
  g.deck.push(card('j2', 'sha', 'club', 7));
  await g.damage({ from: src, to: p, amount: 1, reason: 'sha' });
  ok(!src.hand.includes(sc), '刚烈：判定黑色应弃置来源一张牌');
}

// ---------- 界张辽 · 突袭 ----------
{
  const g = mk(['jie_zhangliao', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const [p, t] = g.players;
  p.hand = [card('a1', 'sha', 'spade', 7), card('a2', 'shan', 'heart', 2)];
  t.hand = [card('b1', 'tao', 'heart', 3), card('b2', 'wuzhong', 'heart', 7)];
  const targetCards = [t.hand[0], t.hand[1]];
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(p.flags.skip_draw === true, '突袭：未设置跳过摸牌');
  ok(targetCards.some(c => p.hand.includes(c)), '突袭：未获得目标一张手牌');
  ok(p.hand.length === 4, `突袭：少摸 1 张并获 1 张后手牌应为 4，实际 ${p.hand.length}`);
  p.flags.skip_draw = false;
}

// ---------- 界许褚 · 裸衣 ----------
{
  const g = mk(['jie_xuchu', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    return null;
  });
  const [p, t] = g.players;
  p.hp = 4;
  const top = [card('t1', 'sha', 'spade', 7), card('t2', 'qinglong', 'spade', 5), card('t3', 'wuzhong', 'heart', 7)];
  top[1].type = 'equip';
  g.deck.push(...top); // 最后一张为牌堆顶
  await g.trigger('phase.begin', { self: p, phase: 'draw' });
  ok(p.flags.skip_draw === true, '裸衣：未放弃摸牌');
  ok(p.hand.includes(top[0]) && p.hand.includes(top[1]), '裸衣：未获得基本牌/武器');
  ok(!p.hand.includes(top[2]), '裸衣：普通锦囊不应被获得');
  ok(g.discardPile.includes(top[2]), '裸衣：未获得的牌未置入弃牌堆');
  const data = { self: t, from: p, amount: 1, nature: 'normal', card: card('v', 'sha', 'spade', 7), reason: 'sha' };
  await g.trigger('damage.before', data);
  ok(data.amount === 2, `裸衣：杀伤害应 +1，实际 ${data.amount}`);
  const data2 = { self: t, from: p, amount: 1, nature: 'normal', card: card('v2', 'sha', 'spade', 8), reason: 'sha' };
  await g.trigger('damage.before', data2);
  ok(data2.amount === 2, '裸衣：回合外仍应保留 +1 直到下回合开始');
  await g.trigger('turn.end', { self: p });
  ok(p.flags.luoyi === false, '裸衣：回合结束未清理标记');
}

// ---------- 界郭嘉 · 遗计 ----------
{
  const g = mk(['jie_guojia', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, 2) };
    return null;
  });
  const [p, t] = g.players;
  p.hp = 3;
  await g.trigger('damage.after', { self: p, from: t, amount: 1, reason: 'sha' });
  ok((t.flags.yiji || []).length === 2, `遗计：应扣置 2 张，实际 ${(t.flags.yiji || []).length}`);
  const before = t.hand.length;
  await g.trigger('phase.begin', { self: t, phase: 'draw' });
  ok(t.hand.length === before + 2, '遗计：目标下个摸牌阶段未获得扣置的牌');
  ok((t.flags.yiji || []).length === 0, '遗计：扣置牌未清空');
}

// ---------- 界甄姬 · 洛神 ----------
{
  const g = mk(['jie_zhenji', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    return null;
  });
  const [p] = g.players;
  p.hp = 3;
  g.deck.push(card('r1', 'sha', 'heart', 7));  // 先判红（第二次）
  g.deck.push(card('r2', 'sha', 'spade', 8));  // 再判黑（第一次）
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(p.hand.some(c => c.id === 'r2'), '洛神：黑色判定牌未获得');
  ok(!p.hand.some(c => c.id === 'r1'), '洛神：红色判定牌不应获得');
}

// ---------- 界刘备 · 仁德 ----------
{
  let choice = 3;
  const g = mk(['jie_liubei', 'simayi'], (gg, p, req) => {
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, 2) };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: choice };
    return null;
  });
  const [p, t] = g.players;
  p.hand = [card('a1', 'sha', 'spade', 7), card('a2', 'shan', 'heart', 2)];
  const before = t.hand.length;
  await g.useActiveSkill(p, 'jie_rende');
  ok(t.hand.length === before + 2, '仁德：交给目标的牌数不对');
  ok(p.flags.jieRendeTotal === 2, '仁德：累计给牌数不对');
  await g.useActiveSkill(p, 'jie_rende');
  ok(t.hand.length === before + 2, '仁德：同一角色不应重复给牌');
  p.flags.jieRendeGiven = [];
  p.flags.jieRendeTotal = 0;
  p.flags.jieRendeBasic = false;
}

// 仁德：给满两张后视为使用【杀】
{
  const g = mk(['jie_liubei', 'simayi'], (gg, p, req) => {
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, 2) };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'card') return null;
    return null;
  });
  const [p, t] = g.players;
  p.hand = [card('a1', 'sha', 'spade', 7), card('a2', 'shan', 'heart', 2)];
  const hp = t.hp;
  await g.useActiveSkill(p, 'jie_rende');
  ok(t.hp === hp - 1, `仁德：视为使用【杀】未造成伤害（${t.hp}）`);
}

// ---------- 界关羽 · 武圣 ----------
{
  const g = mk(['jie_guanyu', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const [p] = g.players;
  p.hand = [card('red1', 'tao', 'heart', 3)];
  const data = { self: p, filter: { name: 'sha' }, handled: false, card: null };
  await g.trigger('respond.need', data);
  ok(data.handled === true && data.card?.name === 'sha', '武圣：红色牌未能当【杀】打出');
}

// ---------- 界张飞 · 咆哮 ----------
{
  const g = mk(['jie_zhangfei', 'simayi'], () => null);
  const [p, t] = g.players;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.shaUnlimited === true, '咆哮：未获得无限出杀');
  await g.trigger('sha.dodged', { self: p, target: t, card: card('x', 'sha', 'spade', 7) });
  const d1 = { self: t, from: p, amount: 1, reason: 'sha' };
  await g.trigger('damage.before', d1);
  ok(d1.amount === 2, `咆哮：杀被抵消后下一张杀伤害应 +1（${d1.amount}）`);
  const d2 = { self: t, from: p, amount: 1, reason: 'sha' };
  await g.trigger('damage.before', d2);
  ok(d2.amount === 1, '咆哮：伤害加成应只生效一次');
  await g.trigger('turn.end', { self: p });
  ok(p.flags.shaUnlimited === false, '咆哮：回合结束未清理无限出杀');
}

// ---------- 批次 B ----------

// 界孙权 · 制衡：弃掉所有手牌后额外摸一张
{
  const g = mk(['jie_sunquan', 'simayi'], (gg, p, req) => {
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice() };
    return null;
  });
  const [p] = g.players;
  p.hand = [card('a1', 'sha', 'spade', 7), card('a2', 'shan', 'heart', 2)];
  await g.useActiveSkill(p, 'jie_zhiheng');
  ok(p.hand.length === 3, `制衡：弃 2 张应额外摸 1 张（共 3），实际 ${p.hand.length}`);
}

// 界周瑜 · 反间：目标选择弃置同花色牌
{
  const g = mk(['jie_zhouyu', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice') return { index: 0 };
    return null;
  });
  const [p, t] = g.players;
  p.hand = [card('a1', 'tao', 'heart', 3)];
  t.hand = [card('b1', 'sha', 'heart', 8), card('b2', 'shan', 'spade', 2)];
  await g.useActiveSkill(p, 'jie_fanjian');
  ok(p.hand.length === 0, '反间：交给对方的牌未移出手牌');
  ok(t.hand.length === 1 && t.hand[0].suit === 'spade', `反间：未弃置同花色牌（剩 ${t.hand.length}）`);
}

// 界华佗 · 青囊：红牌可再发动一次
{
  const g = mk(['jie_huatuo', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [(req.targets || [])[0]] };
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'confirm') return yes();
    return null;
  });
  const [p, t] = g.players;
  p.hp = 2; t.hp = 2;
  p.hand = [card('a1', 'tao', 'heart', 3), card('a2', 'sha', 'spade', 7)];
  await g.useActiveSkill(p, 'jie_qingnang');
  ok(t.hp === 3, `青囊：第一名目标未回复（${t.hp}）`);
  ok(p.hp === 3, `青囊：红牌后未再次发动（${p.hp}）`);
  ok(p.hand.length === 0, '青囊：未弃置两张手牌');
}

// 界大乔 · 流离：转移【杀】目标
{
  const g = mk(['jie_daqiao', 'simayi', 'caocao'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    if (req.kind === 'targets') return { seats: [2] };
    return null;
  });
  const [p, , u] = g.players;
  p.hand = [card('a1', 'shan', 'heart', 2)];
  const data = { self: u, target: p, card: { id: 'x', name: 'sha', suit: 'spade', num: 7 }, canceled: false, used: [] };
  await g.trigger('target.before', data);
  ok(data.target === u && data.redirected === true, '流离：未转移【杀】目标');
  ok(!p.hand.some(c => c.id === 'a1'), '流离：未弃置一张牌');
}

// 界赵云 · 龙胆：闪当杀
{
  const g = mk(['jie_zhaoyun', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return yes();
    if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
    return null;
  });
  const [p] = g.players;
  p.hand = [card('a1', 'shan', 'heart', 2)];
  const data = { self: p, filter: { name: 'sha' }, handled: false, card: null };
  await g.trigger('respond.need', data);
  ok(data.handled === true && data.card?.name === 'sha', '龙胆：闪未能当杀打出');
}

// 界马超 · 铁骑：无同花色牌可弃则不能出闪
{
  const g = mk(['jie_machao', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? yes() : null));
  const [p, t] = g.players;
  t.hand = [card('b1', 'shan', 'spade', 2)];
  g.deck.push(card('j1', 'sha', 'heart', 7));
  await g.trigger('target.after', { self: p, target: t, card: { id: 'x', name: 'sha', suit: 'spade', num: 8 } });
  ok(!!t.flags.noShan, '铁骑：未限制目标使用【闪】');
}

// 界吕布 · 无双：需要两张闪
{
  const g = mk(['jie_lvbu', 'simayi'], () => null);
  const [p, t] = g.players;
  const data = { self: t, from: p, card: { id: 'x', name: 'sha', suit: 'spade', num: 8 }, dodged: false, extraDodge: 0 };
  await g.trigger('dodge.before', data);
  ok(data.extraDodge === 1, '无双：未增加一张【闪】的需求');
}

// 界吕蒙 · 克己：未出杀跳过弃牌
{
  const g = mk(['jie_lumeng', 'simayi'], () => null);
  const [p] = g.players;
  p.flags.shaUsed = 0;
  await g.trigger('phase.end', { self: p, phase: 'play' });
  ok(p.flags.skip_discard === true, '克己：未设置跳过弃牌阶段');
}

console.log(`通过 ${pass} / 失败 ${fail}`);
if (bad.length) {
  console.log('失败项：');
  for (const b of bad) console.log('  -', b);
  process.exit(1);
}
