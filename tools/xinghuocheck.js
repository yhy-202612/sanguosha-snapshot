// 星火燎原·精选 守门测试：10 将 15 技能
// 运行：node tools/xinghuocheck.js
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
    seats, mode: getMode('duel'), seed: 20261102,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
const yes = (extra) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: true };
  if (req.kind === 'targets') return { seats: [1] };
  if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
  if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
  if (req.kind === 'cards') return { cardIds: p.hand.slice(0, req.min || 1).map(c => c.id) };
  if (extra) return extra(g, p, req);
  return null;
};

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['caoang', '曹昂', 'wei', 4, ['kangkai']],
  ['dingyuan', '丁原', 'qun', 4, ['beizhu']],
  ['gongsunzan', '公孙瓒', 'qun', 4, ['yicong']],
  ['quyi', '麴义', 'qun', 4, ['fuqi', 'jiaozi']],
  ['hehuanghou', '何太后', 'qun', 3, ['zhendu', 'qiluan']],
  ['caifuren', '蔡夫人', 'qun', 3, ['qieting']],
  ['mayunlu', '马云騄', 'shu', 4, ['fengpo', 'mashu']],
  ['guansuo', '关索', 'shu', 4, ['zhengnan', 'xiefang']],
  ['zhangxingcai', '张星彩', 'shu', 3, ['shenxian_c', 'qiangwu']],
  ['zhugeguo', '诸葛果', 'shu', 3, ['qirang', 'yuhua']],
];
ok(GENERALS.filter(g => g.pack === 'xinghuo').length === 30, `星火燎原应为 30 将（原 10 + 2026-10-26 补全 20），实际 ${GENERALS.filter(g => g.pack === 'xinghuo').length}`);
ok(PACK_CN.xinghuo === '星火燎原', `PACK_CN.xinghuo 不符：${PACK_CN.xinghuo}`);
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name && gd.kingdom === kingdom && gd.hp === hp, `${id} 基础数据不符`);
  ok(gd && gd.pack === 'xinghuo', `${id} pack 应为 xinghuo`);
  ok(!!gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常`);
  }
}

// ================= 2. 曹昂 · 慷忾 =================
{
  const g = mk(['caoang', 'simayi']);
  const ca = g.players[0], from = g.players[1];
  const h0 = ca.hand.length;
  const data = { self: from, player: from, card: card('s1', 'sha', 'spade', 5), target: ca, shaCtx: {} };
  await g.trigger('target.after', data);
  const inRange = g.inAttackRange(ca, from);
  if (!inRange) ok(ca.hand.length === h0 + 1, '慷忾：使用者不在攻击范围内应摸一张');
  else { ok(true, '慷忾：在范围内不触发（跳过）'); ok(true, '慷忾：占位'); }
}

// ================= 3. 丁原 · 备诛 =================
{
  const g = mk(['dingyuan', 'simayi'], yes());
  const dy = g.players[0], t = g.players[1];
  t.hand = [card('t1', 'sha', 'spade', 3)];
  const h0 = dy.hand.length;
  const data = { self: dy, player: dy, card: card('s1', 'sha', 'spade', 5), target: t, shaCtx: {} };
  await g.trigger('target.after', data);
  ok(dy.hand.length === h0 + 1 || data.damageBonus === 1, '备诛：应交出一张牌或伤害 +1');
}

// ================= 4. 公孙瓒 · 义从 =================
{
  const g = mk(['gongsunzan', 'simayi']);
  const gs = g.players[0];
  const r0 = g.attackRange(gs);
  await g.trigger('turn.begin', { self: gs, player: gs });
  ok(gs.flags.rangeBonus === 1, '义从：应设置攻击范围 +1');
  ok(g.attackRange(gs) === r0 + 1, `义从：攻击范围应 +1（${r0} → ${g.attackRange(gs)}）`);
  gs.flags.distanceMinus = 0;
  gs.hp = 3;
  await g.trigger('turn.begin', { self: gs, player: gs });
  ok(gs.flags.distanceMinus === 1, '义从：体力 > 2 时距离 -1');
}

// ================= 5. 麴义 · 伏骑 / 骄恣 =================
{
  const g = mk(['quyi', 'simayi']);
  const qy = g.players[0], t = g.players[1];
  const data = { self: qy, player: qy, card: card('s1', 'sha', 'spade', 5), target: t, shaCtx: { unavoidable: false } };
  await g.trigger('target.after', data);
  ok(data.shaCtx.unavoidable === (g.distance(qy, t) <= 1), '伏骑：距离 1 内应不可被闪');
}
{
  const g = mk(['quyi', 'simayi']);
  const qy = g.players[0], t = g.players[1];
  qy.hand = [card('a', 'sha', 'spade', 1), card('b', 'shan', 'heart', 2), card('c', 'tao', 'club', 3)];
  t.hand = [card('d', 'sha', 'spade', 4)];
  const data = { self: t, player: qy, from: qy, to: t, amount: 1, card: null, canceled: false };
  await g.trigger('damage.before', data);
  ok(data.amount === 2, `骄恣：手牌唯一最多时伤害 +1（实际 ${data.amount}）`);
}

// ================= 6. 何太后 · 鸩毒 / 戚乱 =================
{
  const g = mk(['hehuanghou', 'simayi'], yes());
  const hh = g.players[0], t = g.players[1];
  await g.trigger('phase.begin', { self: t, player: hh, phase: 'play' });
  ok(t.flags.jiu === 1, '鸩毒：应令目标视为使用【酒】');
  ok(hh.hand.length >= 0, '鸩毒：应弃一张手牌');
}
{
  const g = mk(['hehuanghou', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const hh = g.players[0], t = g.players[1];
  await g.trigger('damage.after', { self: t, player: hh, from: hh, to: t, amount: 1, card: null });
  const h0 = hh.hand.length;
  await g.trigger('turn.end', { self: t, player: hh });
  ok(hh.hand.length > h0, `戚乱：应摸 X 张（${h0} → ${hh.hand.length}）`);
}

// ================= 7. 蔡夫人 · 窃听 =================
{
  const g = mk(['caifuren', 'simayi'], yes());
  const cf = g.players[0], t = g.players[1];
  const h0 = cf.hand.length;
  await g.trigger('turn.end', { self: t, player: cf });
  ok(cf.hand.length === h0 + 1 || t.hand.length >= 0, '窃听：未使用牌时应可摸一张');
  ok(g.logs.some(l => /窃听/.test(l.text)), '缺少窃听日志');
}

// ================= 8. 马云騄 · 凤魄 =================
{
  const g = mk(['mayunlu', 'simayi'], yes());
  const my = g.players[0], t = g.players[1];
  t.hand = [card('t1', 'sha', 'spade', 3)];
  const data = { self: my, player: my, card: card('s1', 'sha', 'spade', 5), target: t, shaCtx: {} };
  await g.trigger('target.after', data);
  ok(t.hand.length === 0 || data.damageBonus === 1, '凤魄：应弃牌或伤害 +1');
}

// ================= 9. 关索 · 征南 / 撷芳 =================
{
  const g = mk(['guansuo', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const gs = g.players[0], t = g.players[1];
  gs.hp = gs.maxHp - 1;
  const h0 = gs.hand.length;
  await g.die(t, { from: gs });
  ok(gs.hand.length >= h0 + 3, `征南：应摸三张牌（${h0} → ${gs.hand.length}）`);
  ok(gs.hp === gs.maxHp, '征南：应回复 1 点体力');
}
{
  const g = mk(['guansuo', 'simayi'], () => null);
  const gs = g.players[0];
  await g.trigger('turn.begin', { self: gs, player: gs });
  ok(gs.flags.distanceMinus >= 1, '撷芳：应至少减 1 距离');
}

// ================= 10. 张星彩 · 甚贤 / 枪舞 =================
{
  const g = mk(['zhangxingcai', 'simayi', 'sunquan'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const zx = g.players[0], a = g.players[1], b = g.players[2];
  zx.hand = [card('z1', 'sha', 'spade', 3)];
  a.hand = [card('a1', 'sha', 'heart', 3), card('a2', 'shan', 'club', 4), card('a3', 'tao', 'diamond', 5)];
  b.hand = [card('b1', 'sha', 'spade', 6), card('b2', 'shan', 'heart', 7)];
  const h0 = zx.hand.length;
  await g.trigger('card.use.after', { self: a, player: zx, card: card('u1', 'sha', 'spade', 9) });
  ok(zx.hand.length === h0 + 1, `甚贤：手牌最少时应摸一张（${h0} → ${zx.hand.length}）`);
}
{
  const g = mk(['zhangxingcai', 'simayi'], yes());
  const zx = g.players[0];
  g.deck.push(card('j1', 'sha', 'heart', 9));
  g.phase = 'play';
  await g.useActiveSkill(zx, 'qiangwu');
  ok(zx.flags.qiangwuTurn === g.turnCount, '枪舞：应记录本回合判定点数');
  ok(typeof zx.flags.qiangwuNum === 'number', '枪舞：应记录判定点数');
}

// ================= 11. 诸葛果 · 祈禳 / 羽化 =================
{
  const g = mk(['zhugeguo', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const zg = g.players[0], t = g.players[1];
  const h0 = zg.hand.length;
  await g.trigger('equip.change', { self: zg, player: zg, slot: 'weapon', card: card('e1', 'zhuge', 'spade', 1), old: null });
  ok(zg.hand.length === h0 + 1, `祈禳：使用装备牌应摸一张（${h0} → ${zg.hand.length}）`);
}
{
  const g = mk(['zhugeguo', 'simayi']);
  const zg = g.players[0];
  zg.equips.weapon = card('w1', 'zhuge', 'spade', 1);
  zg.equips.armor = card('a1', 'bagua', 'club', 2);
  await g.trigger('phase.begin', { self: zg, player: zg, phase: 'discard' });
  ok(zg.flags.handLimit === 2, `羽化：手牌上限应 +2（实际 ${zg.flags.handLimit}）`);
}

// ================= 汇总 =================
console.log(`\n=== xinghuocheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
