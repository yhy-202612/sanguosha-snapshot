// 一将成名 2012 守门测试：12 将 21 技能
// 运行：node tools/yj2012check.js
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
    seats, mode: getMode('duel'), seed: 20261030,
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
  if (req.kind === 'cards') {
    const n = req.min || 1;
    return { cardIds: p.hand.slice(0, n).map(c => c.id) };
  }
  if (extra) return extra(g, p, req);
  return null;
};

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['wangyi', '王异', 'wei', 3, ['zhenlie', 'miji']],
  ['xunyou', '荀攸', 'wei', 3, ['qice', 'zhiyu']],
  ['caozhang', '曹彰', 'wei', 4, ['jiangchi']],
  ['madai', '马岱', 'shu', 4, ['qianxi']],
  ['liaohua', '廖化', 'shu', 4, ['dangxian', 'fuli']],
  ['guanxingzhangbao', '关兴张苞', 'shu', 4, ['fuheng']],
  ['chengpu', '程普', 'wu', 4, ['lihuo', 'chunlao']],
  ['bulianshi', '步练师', 'wu', 3, ['anxu', 'zhuiyi']],
  ['handang', '韩当', 'wu', 4, ['gongqi', 'jiefan']],
  ['huaxiong', '华雄', 'qun', 4, ['shiyong']],
  ['liubiao', '刘表', 'qun', 3, ['zishou', 'zongshi']],
  ['zhonghui', '钟会', 'wei', 4, ['quanji', 'zili', 'paiyi']],
];
ok(GENERALS.filter(g => g.pack === 'yj2012').length === 12, `2012 包应为 12 将，实际 ${GENERALS.filter(g => g.pack === 'yj2012').length}`);
ok(PACK_CN.yj2012 === '一将成名·2012', `PACK_CN.yj2012 不符：${PACK_CN.yj2012}`);
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name && gd.kingdom === kingdom && gd.hp === hp, `${id} 基础数据不符`);
  ok(gd && gd.pack === 'yj2012', `${id} pack 应为 yj2012`);
  ok(!!gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常`);
  }
}

// ================= 2. 王异 · 贞烈 / 秘计 =================
{
  const g = mk(['wangyi', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const wy = g.players[0], from = g.players[1];
  from.hand = [card('h1', 'sha', 'spade', 5), card('h2', 'shan', 'heart', 3)];
  const hp0 = wy.hp;
  const data = { self: from, player: from, card: card('s1', 'sha', 'spade', 7), target: wy, canceled: false };
  await g.trigger('target.before', data);
  ok(data.canceled === true, '贞烈：应令该【杀】对王异无效');
  ok(wy.hp === hp0 - 1, `贞烈：应失去 1 点体力（${hp0} → ${wy.hp}）`);
  ok(from.hand.length === 1, '贞烈：应弃置来源 1 张牌');
}
{
  const g = mk(['wangyi', 'simayi'], yes());
  const wy = g.players[0];
  wy.hp = wy.maxHp - 2;
  const h0 = wy.hand.length;
  await g.trigger('phase.begin', { self: wy, player: wy, phase: 'prepare' });
  ok(wy.hand.length === h0, `秘计：摸 2 交 2，手牌数应不变（${h0} → ${wy.hand.length}）`);
  ok(g.logs.some(l => /秘计/.test(l.text)), '缺少秘计日志');
}

// ================= 3. 荀攸 · 奇策 / 智愚 =================
{
  const g = mk(['xunyou', 'simayi'], yes());
  const xy = g.players[0];
  g.phase = 'play';
  const h0 = xy.hand.length;
  await g.useActiveSkill(xy, 'qice');
  ok(xy.hand.length === 0, `奇策：所有手牌应被当作一张锦囊使用（${h0} → ${xy.hand.length}）`);
  ok(Object.keys(xy.flags.qiceUsed || {}).length === 1, '奇策：应记录该牌名本局已用');
}
{
  const g = mk(['xunyou', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const xy = g.players[0], src = g.players[1];
  xy.hand = [card('r1', 'sha', 'heart', 3), card('r2', 'shan', 'diamond', 4)];
  src.hand = [card('s1', 'tao', 'club', 5)];
  await g.trigger('damage.after', { self: xy, player: xy, from: src, to: xy, amount: 1, card: null });
  ok(xy.hand.length === 3, '智愚：应摸 1 张');
  ok(src.hand.length === 0, '智愚：手牌颜色相同时来源应弃 1 张');
}

// ================= 4. 曹彰 · 将驰 =================
{
  const g = mk(['caozhang', 'simayi'], yes());
  const cz = g.players[0];
  const h0 = cz.hand.length;
  await g.trigger('phase.begin', { self: cz, player: cz, phase: 'draw' });
  ok(cz.hand.length === h0 + 1, `将驰：选项 1 应额外摸 1 张（${h0} → ${cz.hand.length}）`);
  ok(cz.flags.banShaTurn === g.turnCount, '将驰：本回合应禁止使用【杀】');
  const sha = card('z1', 'sha', 'spade', 7);
  cz.hand.push(sha);
  const r = g.canUse(cz, sha, [g.players[1]]);
  ok(r.ok === false, '将驰：canUse 应拒绝使用【杀】');
}

// ================= 5. 马岱 · 潜袭 =================
{
  const g = mk(['madai', 'simayi'], yes());
  const md = g.players[0], t = g.players[1];
  g.deck.unshift(card('j1', 'sha', 'heart', 6));
  await g.trigger('phase.begin', { self: md, player: md, phase: 'prepare' });
  ok(t.flags.qianxiNoColor === 'red', '潜袭：应限制目标使用红色手牌');
  const red = card('rd', 'sha', 'heart', 3);
  const r = g.canUse(t, red, [md]);
  ok(r.ok === false, '潜袭：目标使用红色手牌应被拒绝');
  const black = card('bk', 'sha', 'spade', 3);
  ok(g.canUse(t, black, [md]).ok !== false, '潜袭：黑色手牌不受限制');
}

// ================= 6. 廖化 · 当先 / 伏枥 =================
{
  const g = mk(['liaohua', 'simayi'], () => null);
  const lh = g.players[0];
  await g.trigger('turn.begin', { self: lh, player: lh });
  ok(lh.flags.extraPlay === true, '当先：应标记额外出牌阶段');
}
{
  const g = mk(['liaohua', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const lh = g.players[0];
  lh.hp = 0;
  await g.trigger('dying.begin', { self: lh, player: lh, from: null });
  ok(lh.hp >= 1, `伏枥：应回复体力（实际 ${lh.hp}）`);
  ok(lh.flags.fuliUsed === true, '伏枥：应标记限定技已用');
}

// ================= 7. 关兴张苞 · 父魂 =================
{
  const g = mk(['guanxingzhangbao', 'simayi'], yes());
  const gx = g.players[0];
  g.deck.push(card('f1', 'sha', 'heart', 3), card('f2', 'shan', 'spade', 4));
  const h0 = gx.hand.length;
  await g.trigger('phase.begin', { self: gx, player: gx, phase: 'draw' });
  ok(gx.hand.length === h0 + 2, `父魂：应获得牌堆顶 2 张（${h0} → ${gx.hand.length}）`);
  ok(gx.flags.skipDraw === true, '父魂：应标记跳过摸牌');
  ok(gx.flags.fuhengRange === g.turnCount, '父魂：两牌颜色不同应获得无距离限制');
}

// ================= 8. 程普 · 疠火 / 醇醪 =================
{
  const g = mk(['chengpu', 'simayi'], (gg, p, req) => {
    if (req.kind === 'card') return { cardId: p.hand.find(c => c.name === 'sha')?.id };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const cp = g.players[0];
  cp.hand.push(card('lh', 'sha', 'spade', 5));
  g.phase = 'play';
  const hp0 = cp.hp;
  await g.useActiveSkill(cp, 'lihuo');
  ok(cp.flags.lihuoPending === null, '疠火：伤害结算后应清空标记');
  ok(cp.hp === hp0 - 1, `疠火：造成伤害后自己应失去 1 点体力（${hp0} → ${cp.hp}）`);
}
{
  const g = mk(['chengpu', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return { cardId: p.hand[0]?.id };
    return null;
  });
  const cp = g.players[0];
  cp.hand = [card('cl', 'sha', 'spade', 3)];
  await g.trigger('phase.begin', { self: cp, player: cp, phase: 'end' });
  ok((cp.chunlao || []).length === 1, '醇醪：结束阶段应获得 1 张「醇」');
  const t = g.players[1];
  t.hp = 0;
  const hp0 = t.hp;
  await g.trigger('dying.begin', { self: t, player: cp, from: cp });
  ok(t.hp === hp0 + 1, `醇醪：濒死时移去「醇」应回复 1 点体力（${hp0} → ${t.hp}）`);
}

// ================= 9. 步练师 · 安恤 / 追忆 =================
{
  const g = mk(['bulianshi', 'simayi', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1, 2] };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const bl = g.players[0], a = g.players[1], b = g.players[2];
  a.hand = [card('a1', 'sha', 'spade', 3)];
  b.hand = [card('b1', 'sha', 'heart', 3), card('b2', 'shan', 'club', 4), card('b3', 'tao', 'diamond', 5)];
  g.phase = 'play';
  const ah = a.hand.length, bh = b.hand.length;
  await g.useActiveSkill(bl, 'anxu');
  ok(a.hand.length === ah + 1, `安恤：手牌少者应摸 1 张（${ah} → ${a.hand.length}）`);
  ok(b.hand.length === bh - 1, `安恤：手牌多者应弃 1 张（${bh} → ${b.hand.length}）`);
}
{
  const g = mk(['bulianshi', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const bl = g.players[0], t = g.players[1];
  const h0 = t.hand.length;
  await g.die(bl, { from: t });
  ok(t.hand.length >= h0 + 3, '追忆：应有角色摸三张牌');
}

// ================= 10. 韩当 · 弓骑 / 解烦 =================
{
  const g = mk(['handang', 'simayi']);
  const hd = g.players[0];
  ok(g.virtualAllowed(hd, [card('e1', 'zhuge', 'spade', 1)], 'sha') === true, '弓骑：装备牌可当【杀】');
  ok(g.virtualAllowed(hd, [card('e2', 'tao', 'heart', 1)], 'sha') === false, '弓骑：非装备牌不可当【杀】');
}
{
  const g = mk(['handang', 'simayi', 'sunquan'], yes());
  const hd = g.players[0];
  g.phase = 'play';
  const h0 = hd.hand.length;
  await g.useActiveSkill(hd, 'jiefan');
  ok(hd.flags.jiefanUsed === true, '解烦：应标记限定技已用');
  ok(hd.hand.length >= h0, `解烦：应摸等量牌（${h0} → ${hd.hand.length}）`);
}

// ================= 11. 华雄 · 恃勇 =================
{
  const g = mk(['huaxiong', 'simayi']);
  const hx = g.players[0];
  const mx = hx.maxHp;
  await g.trigger('damage.after', { self: hx, player: hx, from: g.players[1], to: hx, amount: 1, card: card('r1', 'sha', 'heart', 5) });
  ok(hx.maxHp === mx - 1, `恃勇：红【杀】伤害后应减 1 点体力上限（${mx} → ${hx.maxHp}）`);
  const mx2 = hx.maxHp;
  await g.trigger('damage.after', { self: hx, player: hx, from: g.players[1], to: hx, amount: 1, card: card('b1', 'sha', 'spade', 5) });
  ok(hx.maxHp === mx2, '恃勇：黑色【杀】不触发');
}

// ================= 12. 刘表 · 自守 / 宗室 =================
{
  const g = mk(['liubiao', 'simayi'], yes());
  const lb = g.players[0];
  const h0 = lb.hand.length;
  await g.trigger('phase.begin', { self: lb, player: lb, phase: 'draw' });
  ok(lb.hand.length > h0, `自守：应额外摸牌（${h0} → ${lb.hand.length}）`);
  ok(lb.flags.banShaTurn === g.turnCount, '自守：本回合不能使用【杀】');
}
{
  const g = mk(['liubiao', 'simayi'], () => null);
  const lb = g.players[0];
  await g.trigger('phase.begin', { self: lb, player: lb, phase: 'discard' });
  ok(lb.flags.handLimit >= 1, `宗室：手牌上限加成应 ≥1（实际 ${lb.flags.handLimit}）`);
}

// ================= 13. 钟会 · 权计 / 自立 / 排异 =================
{
  const g = mk(['zhonghui', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const zh = g.players[0];
  const h0 = zh.hand.length;
  await g.trigger('damage.after', { self: zh, player: zh, from: g.players[1], to: zh, amount: 1, card: null });
  ok((zh.quan || []).length === 1, '权计：应获得 1 张「权」');
  ok(zh.hand.length === h0, `权计：摸 1 置 1，手牌数应不变（${h0} → ${zh.hand.length}）`);
  zh.quan = [card('q1', 'sha', 'spade', 1), card('q2', 'shan', 'heart', 2), card('q3', 'tao', 'club', 3)];
  const mx = zh.maxHp;
  await g.trigger('phase.begin', { self: zh, player: zh, phase: 'prepare' });
  ok(zh.flags.awaken_zili === true && zh.maxHp === mx - 1, '自立：3 张「权」应觉醒并减体力上限');
  ok(zh.skills.some(s => s.id === 'paiyi'), '自立：应获得【排异】');
  const g2 = mk(['zhonghui', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const zh2 = g2.players[0], t = g2.players[1];
  zh2.skills.push(getSkill('paiyi'));
  zh2.quan = [card('q4', 'sha', 'spade', 1), card('q5', 'shan', 'heart', 2)];
  g2.phase = 'play';
  const th = t.hand.length, thp = t.hp;
  await g2.useActiveSkill(zh2, 'paiyi');
  ok(zh2.quan.length === 1, '排异：应移去 1 张「权」');
  ok(t.hand.length === th + 2, `排异：目标应摸 2 张（${th} → ${t.hand.length}）`);
  ok(t.hp === thp - 1, `排异：目标应受到 1 点伤害（${thp} → ${t.hp}）`);
}

// ================= 汇总 =================
console.log(`\n=== yj2012check：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
