// 新牌面单测（2026-10-25）：火杀/雷杀、太平要术/霹雳车/木牛流马（宝物槽）、兵临城下/奇正相生
// 运行：node tools/newcardcheck.js
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META, cardLabel, cardName, EQUIP_SUB, SUB_CN } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const card = (id, name, suit = 'spade', num = 7, extra = {}) => ({ id, name, suit, num, type: CARD_META[name]?.type, ...extra });

function mk(ids, over = {}) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const handler = (g, p, req) => {
    if (req.kind === 'confirm') return { yes: over.yes !== false };
    if (req.kind === 'targets') return { seats: (over.seats || [1]).slice(0, req.max || 1) };
    if (req.kind === 'choice') return { index: over.index !== undefined ? over.index : 0 };
    if (req.kind === 'card') return { cardId: over.card !== undefined ? over.card : null };
    if (req.kind === 'cards') {
      const ids2 = req.cards || [];
      const n = Math.max(req.min || 0, Math.min(req.max ?? 1, ids2.length));
      return { cardIds: ids2.slice(0, n) };
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

// ================= 1. 牌面与牌堆 =================
{
  ok(cardName({ name: 'sha', nature: 'fire' }) === '火杀', `火杀显示名错误：${cardName({ name: 'sha', nature: 'fire' })}`);
  ok(cardName({ name: 'sha', nature: 'thunder' }) === '雷杀', '雷杀显示名错误');
  ok(cardLabel({ name: 'sha', nature: 'fire', suit: 'heart', num: 7 }) === '火杀♥7', '火杀标签错误');
  ok(cardName({ name: 'sha' }) === '杀', '普通杀显示名被误改');
  const ex = deckEntries('ex');
  ok(ex.filter(c => c.name === 'sha' && c.nature === 'fire').length === 5, `火杀应为 5 张，实际 ${ex.filter(c => c.name === 'sha' && c.nature === 'fire').length}`);
  ok(ex.filter(c => c.name === 'sha' && c.nature === 'thunder').length === 5, `雷杀应为 5 张，实际 ${ex.filter(c => c.name === 'sha' && c.nature === 'thunder').length}`);
  ok(ex.filter(c => c.name === 'taiping').length === 2, '太平要术应为 2 张');
  ok(ex.filter(c => c.name === 'muniu').length === 2, '木牛流马应为 2 张');
  ok(ex.filter(c => c.name === 'piliche').length === 1, '霹雳车应为 1 张');
  ok(ex.filter(c => c.name === 'binglin').length === 2, '兵临城下应为 2 张');
  ok(ex.filter(c => c.name === 'qizheng').length === 2, '奇正相生应为 2 张');
  ok(EQUIP_SUB.treasure === 'treasure' && SUB_CN.treasure === '宝物', '宝物槽映射缺失');
  for (const n of ['taiping', 'muniu', 'piliche', 'binglin', 'qizheng']) {
    ok(!!CARD_META[n], `CARD_META 缺少 ${n}`);
  }
  ok(CARD_META.piliche.sub === 'weapon' && CARD_META.piliche.range === 4, '霹雳车应为范围 4 的武器');
  ok(CARD_META.taiping.sub === 'treasure' && CARD_META.muniu.sub === 'treasure', '宝物槽归属错误');
}

// ================= 2. 宝物槽：装备/替换 =================
{
  const g = mk(['sunquan', 'caocao']);
  const p = g.players[0];
  ok('treasure' in p.equips, '玩家装备区缺少 treasure 槽');
  const tp = card('e1', 'taiping', 'diamond', 6);
  p.hand.push(tp);
  await g.equipCard(p, tp);
  ok(p.equips.treasure === tp, '太平要术未进入宝物槽');
  const mn = card('e2', 'muniu', 'club', 7);
  p.hand.push(mn);
  await g.equipCard(p, mn);
  ok(p.equips.treasure === mn, '木牛流马未替换宝物槽');
  ok(g.discardPile.includes(tp), '被替换的宝物应进入弃牌堆');
}

// ================= 3. 属性杀：火杀对藤甲有效、普通杀无效 =================
{
  const g = mk(['sunquan', 'caocao']);
  const p = g.players[0], t = g.players[1];
  const armor = card('a1', 'tengjia', 'spade', 2);
  t.hand.push(armor);
  await g.equipCard(t, armor);
  const hp0 = t.hp;
  t.hand = [];                                  // 清空手牌，避免出【闪】抵消
  await g.resolveSha(p, t, card('s1', 'sha', 'spade', 7));
  ok(t.hp === hp0, `【藤甲】应对普通杀无效（实际掉血 ${hp0 - t.hp}）`);
  await g.resolveSha(p, t, card('s2', 'sha', 'heart', 4, { nature: 'fire' }));
  ok(t.hp < hp0, '【藤甲】不能挡火杀（应造成伤害）');
  // 雷杀对藤甲：藤甲只写「杀与普通锦囊无效」，引擎口径为「非火属性杀无效」
  const hp1 = t.hp;
  await g.resolveSha(p, t, card('s3', 'sha', 'club', 4, { nature: 'thunder' }));
  ok(t.hp === hp1, '【藤甲】按现有口径应挡住非火属性杀（雷杀）');
}

// ================= 4. 太平要术：防止火属性伤害，但不防普通/雷电 =================
{
  const g = mk(['sunquan', 'caocao']);
  const p = g.players[0], t = g.players[1];
  const tp = card('b1', 'taiping', 'diamond', 6);
  t.hand.push(tp);
  await g.equipCard(t, tp);
  const hp0 = t.hp;
  await g.damage({ from: p, to: t, amount: 2, nature: 'fire', card: null, reason: 'test' });
  ok(t.hp === hp0, `【太平要术】应防止火属性伤害（实际掉血 ${hp0 - t.hp}）`);
  ok(hasLog(g, '太平要术'), '【太平要术】缺少发动日志');
  await g.damage({ from: p, to: t, amount: 1, nature: 'normal', card: null, reason: 'test' });
  ok(t.hp === hp0 - 1, '【太平要术】不应防止普通伤害');
}

// ================= 5. 霹雳车：杀造成伤害后弃目标装备 =================
{
  const g = mk(['sunquan', 'caocao']);
  const p = g.players[0], t = g.players[1];
  const car = card('c1', 'piliche', 'diamond', 11);
  p.hand.push(car);
  await g.equipCard(p, car);
  const eq = card('c2', 'qinggang', 'spade', 6);
  t.hand.push(eq);
  await g.equipCard(t, eq);
  ok(g.attackRange(p) === 4, `【霹雳车】攻击范围应为 4，实际 ${g.attackRange(p)}`);
  t.hand = [];                                  // 不留闪，保证命中
  await g.resolveSha(p, t, card('c3', 'sha', 'spade', 8));
  ok(!t.equips.armor, '【霹雳车】应在造成伤害后弃置目标装备区的牌');
  ok(g.discardPile.includes(eq), '被霹雳车弃置的装备应进弃牌堆');
}

// ================= 6. 木牛流马：回合开始运粮 + 手牌上限 +2 =================
{
  const g = mk(['sunquan', 'caocao']);
  const p = g.players[0];
  const mn = card('d1', 'muniu', 'club', 7);
  p.hand.push(mn);
  await g.equipCard(p, mn);
  const deckBefore = g.deck.length;
  g.turnCount = 500;
  await g.runTurn(p);
  ok(g.deck.length < deckBefore, '【木牛流马】回合开始应摸牌（运粮）');
  ok(hasLog(g, '木牛流马'), '【木牛流马】缺少运粮日志');
}

// ================= 7. 兵临城下（查看牌堆顶 4 张，可使用其中的【杀】） =================
{
  const g = mk(['sunquan', 'caocao'], { seats: [1] });
  const p = g.players[0], t = g.players[1];
  t.hand = [];
  const sha = card('f1', 'sha', 'spade', 7);
  g.deck.push(card('f2', 'shan', 'heart', 2), card('f3', 'tao', 'heart', 3), card('f4', 'guohe', 'club', 4), sha);
  const bl = card('f5', 'binglin', 'spade', 5);
  p.hand.push(bl);
  const hp0 = t.hp;
  await g.useCard({ from: p, card: bl, targets: [p], reason: 'play' });
  ok(t.hp === hp0 - 1, `【兵临城下】应使用牌堆顶的【杀】命中目标（${hp0} → ${t.hp}）`);
  ok(!g.deck.some(c => c.id === 'f1') && !p.hand.some(c => c.id === 'f1'), '【兵临城下】用掉的【杀】应离开牌堆（已使用）');
  ok(g.deck.filter(c => ['f2', 'f3', 'f4'].includes(c.id)).length === 3, '【兵临城下】其余牌应放回牌堆');
}
{
  // 牌堆顶 4 张没有【杀】→ 无效果
  const g = mk(['sunquan', 'caocao'], { seats: [1] });
  const p = g.players[0], t = g.players[1];
  t.hand = [];
  g.deck.push(card('k1', 'shan', 'heart', 2), card('k2', 'tao', 'heart', 3), card('k3', 'guohe', 'club', 4), card('k4', 'shan', 'spade', 5));
  const bl = card('k5', 'binglin', 'club', 6);
  p.hand.push(bl);
  const hp0 = t.hp;
  await g.useCard({ from: p, card: bl, targets: [p], reason: 'play' });
  ok(t.hp === hp0, '【兵临城下】牌堆顶无【杀】时不应造成伤害');
  ok(g.deck.filter(c => ['k1', 'k2', 'k3', 'k4'].includes(c.id)).length === 4, '【兵临城下】没有【杀】时 4 张牌应原样留在牌堆');
}

// ================= 8. 奇正相生（使用者选奇兵/正兵，对方可打出【杀】或【闪】） =================
function mkQz(bingIndex, targetChoice) {
  const g = mk(['sunquan', 'caocao']);
  const p = g.players[0], t = g.players[1];
  const oldAsk = g.responder.ask;
  g.responder.ask = async (gg, pl, req) => {
    if (req.kind === 'choice') {
      // 按提示语区分「使用者选兵势」与「目标选打出哪张牌」，避免依赖对象引用比较
      if (String(req.prompt || '').includes('请选择兵势')) return { index: bingIndex };
      return { index: targetChoice };
    }
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return { cardId: (pl.hand[0] || {}).id };   // 打出第一张手牌
    return oldAsk ? oldAsk(gg, pl, req) : null;
  };
  return { g, p, t };
}
{
  // 奇兵 + 对方打出【杀】→ 此牌无效
  const { g, p, t } = mkQz(0, 0);
  t.hand = [card('q1', 'sha', 'spade', 9)];
  const qz = card('q2', 'qizheng', 'club', 6);
  p.hand.push(qz);
  const hp0 = t.hp, hand0 = p.hand.length - 1;
  await g.useCard({ from: p, card: qz, targets: [t], reason: 'play' });
  ok(t.hp === hp0, '【奇正相生·奇兵】对方打出【杀】时不应造成伤害');
  ok(g.logs.some(l => String(l.text || l).includes('奇兵被【杀】化解')), '【奇正相生·奇兵】对方打出【杀】时此牌应无效（日志）');
}
{
  // 奇兵 + 对方不打出 → 获得对方一张牌
  const { g, p, t } = mkQz(0, 2);
  t.hand = [card('q3', 'shan', 'heart', 5)];
  const qz = card('q4', 'qizheng', 'club', 7);
  p.hand.push(qz);
  await g.useCard({ from: p, card: qz, targets: [t], reason: 'play' });
  ok(p.hand.some(c => c.id === 'q3'), '【奇正相生·奇兵】对方未打出时应获得其一张牌');
  ok(t.hp === t.maxHp, '【奇正相生·奇兵】不造成伤害');
}
{
  // 正兵 + 对方打出【闪】→ 此牌无效
  const { g, p, t } = mkQz(1, 1);
  t.hand = [card('q5', 'shan', 'heart', 6)];
  const qz = card('q6', 'qizheng', 'heart', 8);
  p.hand.push(qz);
  const hp0 = t.hp;
  await g.useCard({ from: p, card: qz, targets: [t], reason: 'play' });
  ok(t.hp === hp0, '【奇正相生·正兵】对方打出【闪】时此牌应无效');
  ok(g.logs.some(l => String(l.text || l).includes('正兵被【闪】化解')), '【奇正相生·正兵】打出【闪】应化解（日志）');
}
{
  // 正兵 + 对方不打出 → 1 点伤害
  const { g, p, t } = mkQz(1, 2);
  t.hand = [];
  const qz = card('q7', 'qizheng', 'diamond', 9);
  p.hand.push(qz);
  const hp0 = t.hp;
  await g.useCard({ from: p, card: qz, targets: [t], reason: 'play' });
  ok(t.hp === hp0 - 1, `【奇正相生·正兵】对方未打出【闪】时应受 1 点伤害（${hp0} → ${t.hp}）`);
}

console.log(`\n新牌面单测：通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败项：'); bad.forEach(b => console.log('  ✗', b)); process.exit(1); }
