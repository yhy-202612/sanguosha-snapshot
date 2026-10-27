// 一将成名 2011 守门测试：11 将 19 技能
// 运行：node tools/yj2011check.js
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
    seats, mode: getMode('duel'), seed: 20261029,
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
  if (extra) return extra(g, p, req);
  return null;
};

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['zhangchunhua', '张春华', 'wei', 3, ['jueqing', 'shangshi']],
  ['yujin', '于禁', 'wei', 4, ['zhenjun']],
  ['caozhi', '曹植', 'wei', 3, ['luoying', 'jiushi_shi']],
  ['fazheng2011', '法正', 'shu', 3, ['enyuan', 'xuanhuo']],
  ['masu', '马谡', 'shu', 3, ['xinzhan', 'huilei']],
  ['xushu', '徐庶', 'shu', 3, ['wuyan', 'jujian']],
  ['lingtong', '凌统', 'wu', 4, ['xuanfeng']],
  ['xusheng', '徐盛', 'wu', 4, ['pojun']],
  ['wuguotai', '吴国太', 'wu', 3, ['ganlu', 'buyi']],
  ['chengong', '陈宫', 'qun', 3, ['mingce', 'zhichi']],
  ['gaoshun', '高顺', 'qun', 4, ['xianzhen', 'jinjiu']],
];
ok(GENERALS.filter(g => g.pack === 'yj2011').length === 11, `2011 包武将数应为 11，实际 ${GENERALS.filter(g => g.pack === 'yj2011').length}`);
ok(PACK_CN.yj2011 === '一将成名·2011', `PACK_CN.yj2011 名称不符：${PACK_CN.yj2011}`);
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name && gd.kingdom === kingdom && gd.hp === hp, `${id} 基础数据不符`);
  ok(gd && gd.pack === 'yj2011', `${id} pack 应为 yj2011`);
  ok(!!gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常/降级`);
  }
}

// ================= 2. 张春华 · 绝情 / 伤逝 =================
{
  const g = mk(['zhangchunhua', 'simayi']);
  const zc = g.players[0], t = g.players[1];
  const hp0 = t.hp;
  await g.damage({ from: zc, to: t, amount: 1, reason: 'test' });
  ok(t.hp === hp0 - 1, '绝情：伤害仍应减少目标 1 点体力');
  ok(g.logs.some(l => /绝情/.test(l.text)), '缺少绝情日志');
  ok(!g.logs.some(l => /受到 1 点伤害/.test(l.text)), '绝情：不应作为「伤害」结算');
}
{
  const g = mk(['zhangchunhua', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const zc = g.players[0];
  zc.hp = zc.maxHp - 2;
  zc.hand = [card('h1', 'sha', 'spade', 3)];
  const h0 = zc.hand.length;
  await g.trigger('hand.change', { self: zc, player: zc });
  ok(zc.hand.length === h0 + 1, `伤逝：手牌应补至 2 张（${h0} → ${zc.hand.length}）`);
}

// ================= 3. 于禁 · 镇军 =================
{
  const g = mk(['yujin', 'simayi'], yes());
  const yj = g.players[0], t = g.players[1];
  t.equips.weapon = card('w1', 'zhuge', 'spade', 1);
  g.phase = 'play';
  await g.useActiveSkill(yj, 'zhenjun');
  ok(!t.equips.weapon, '镇军：目标装备区武器应被移走');
  ok((yj.zhen || []).length === 1, '镇军：应获得 1 张「镇」');
  const h0 = t.hand.length;
  await g.trigger('phase.begin', { self: t, player: t, phase: 'prepare' });
  ok((yj.zhen || []).length === 0, '镇军：目标回合开始应归还「镇」');
  ok(t.hand.length === h0 + 1, '镇军：目标应摸 1 张牌');
}

// ================= 4. 曹植 · 落英 / 酒诗 =================
{
  const g = mk(['caozhi', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const cz = g.players[0], t = g.players[1];
  const club = card('c1', 'sha', 'club', 5);
  // 真实语义：cards.discard 在「牌进入弃牌堆之前」触发，技能须用 data.taken 声明接走
  t.hand.push(club);
  const h0 = cz.hand.length;
  const data = { self: t, player: t, cards: [club], reason: 'test', taken: [] };
  await g.trigger('cards.discard', data);
  ok(cz.hand.length === h0 + 1, '落英：应获得梅花弃牌');
  ok(!g.discardPile.includes(club), '落英：接走的牌不应进入弃牌堆');
  ok((data.taken || []).includes(club), '落英：应以 taken 声明接走（否则会与弃牌堆双存）');
}
{
  const g = mk(['caozhi', 'simayi']);
  const cz = g.players[0];
  ok(g.virtualAllowed(cz, [card('s1', 'sha', 'spade', 7)], 'jiu') === true, '酒诗：黑桃手牌可当酒');
  ok(g.virtualAllowed(cz, [card('h1', 'sha', 'heart', 7)], 'jiu') === false, '酒诗：红桃手牌不可当酒');
}
{
  const g = mk(['caozhi', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const cz = g.players[0];
  cz.hp = 0;
  await g.trigger('dying.begin', { self: cz, player: cz, from: null });
  ok(cz.flipped === true, '酒诗：濒死自救应翻面');
  ok(cz.hp === 1, `酒诗：应回复至 1 点体力（实际 ${cz.hp}）`);
}

// ================= 5. 法正 · 恩怨 / 眩惑 =================
{
  const g = mk(['fazheng2011', 'simayi'], (gg, p, req) => (req.kind === 'card' ? null : null));
  const fz = g.players[0], t = g.players[1];
  const h0 = fz.hand.length;
  await g.trigger('damage.after', { self: fz, player: fz, from: t, to: fz, amount: 1, card: null });
  ok(fz.hand.length === h0 + 1, '恩怨：来源未交红桃牌时法正应摸一张');
}
{
  const g = mk(['fazheng2011', 'simayi'], (gg, p, req) => {
    if (req.kind === 'card') return { cardId: p.hand.find(c => c.suit === 'heart')?.id };
    return null;
  });
  const fz = g.players[0], t = g.players[1];
  t.hand = [card('hr', 'sha', 'heart', 3)];
  const h0 = fz.hand.length;
  await g.trigger('damage.after', { self: fz, player: fz, from: t, to: fz, amount: 1, card: null });
  ok(fz.hand.length === h0 + 1, '恩怨：来源交红桃牌后法正应获得该牌');
  ok(t.hand.length === 0, '恩怨：来源应失去该红桃牌');
}
{
  const g = mk(['fazheng2011', 'simayi'], yes());
  const fz = g.players[0];
  g.phase = 'play';
  const h0 = fz.hand.length;
  await g.useActiveSkill(fz, 'xuanhuo');
  ok(g.logs.some(l => /眩惑/.test(l.text)), '缺少眩惑日志');
  ok(fz.hand.length >= h0 - 1, '眩惑：手牌数不应异常');
}

// ================= 6. 马谡 · 心战 / 挥泪 =================
{
  const g = mk(['masu', 'simayi'], yes());
  const ms = g.players[0];
  g.deck.push(card('k1', 'tao', 'heart', 7), card('k2', 'sha', 'spade', 3), card('k3', 'shan', 'heart', 5));
  g.phase = 'play';
  const h0 = ms.hand.length;
  await g.useActiveSkill(ms, 'xinzhan');
  ok(ms.hand.length === h0 + 2, `心战：应获得 2 张红桃牌（${h0} → ${ms.hand.length}）`);
  ok(g.deck[g.deck.length - 1].id === 'k2', '心战：非红桃牌应放回牌堆顶');
}
{
  const g = mk(['masu', 'simayi']);
  const ms = g.players[0], killer = g.players[1];
  const hp = killer.hand.length;
  await g.die(ms, { from: killer });
  ok(killer.hand.length === 0, `挥泪：击杀者应弃置所有手牌（${hp} → ${killer.hand.length}）`);
}

// ================= 7. 徐庶 · 无言 / 举荐 =================
{
  const g = mk(['xushu', 'simayi']);
  const xs = g.players[0], t = g.players[1];
  const hp0 = t.hp;
  await g.damage({ from: xs, to: t, amount: 1, card: card('t1', 'juedou', 'spade', 1), reason: 'test' });
  ok(t.hp === hp0, '无言：锦囊牌伤害应为 0');
  const xsHp = xs.hp;
  await g.damage({ from: t, to: xs, amount: 1, card: card('t2', 'nanman', 'club', 2), reason: 'test' });
  ok(xs.hp === xsHp, '无言：徐庶受到的锦囊伤害也应为 0');
}
{
  const g = mk(['xushu', 'simayi'], yes());
  const xs = g.players[0], t = g.players[1];
  xs.hand.push(card('e1', 'zhuge', 'spade', 1));
  g.phase = 'play';
  const th = t.hand.length;
  await g.useActiveSkill(xs, 'jujian');
  ok(t.hand.length === th + 2 - Math.min(2, th + 2), `举荐：目标应摸 2 弃 2（净变化 0，${th} → ${t.hand.length}）`);
}

// ================= 8. 凌统 · 旋风 =================
{
  const g = mk(['lingtong', 'simayi'], yes());
  const lt = g.players[0], t = g.players[1];
  t.hand = [card('x1', 'sha', 'spade', 3), card('x2', 'shan', 'heart', 4)];
  const th = t.hand.length;
  await g.trigger('equip.lose', { self: lt, player: lt, card: card('eq', 'bagua', 'spade', 2), slot: 'armor' });
  ok(t.hand.length === th - 1, `旋风：应弃置对方 1 张牌（${th} → ${t.hand.length}）`);
}

// ================= 9. 徐盛 · 破军 =================
{
  const g = mk(['xusheng', 'simayi'], yes());
  const xs = g.players[0], t = g.players[1];
  t.hand = [card('p1', 'sha', 'spade', 3), card('p2', 'shan', 'heart', 4), card('p3', 'tao', 'club', 5)];
  await g.trigger('damage.after', { self: t, player: xs, from: xs, to: t, amount: 1, card: card('s1', 'sha', 'spade', 6) });
  ok((t.jun || []).length > 0, '破军：目标应有牌被置于武将牌上');
  const n = t.jun.length;
  const th = t.hand.length;
  await g.trigger('phase.begin', { self: t, player: t, phase: 'end' });
  ok((t.jun || []).length === 0, '破军：回合结束应清空武将牌上的牌');
  ok(t.hand.length === th + n, `破军：目标应收回 ${n} 张牌`);
}

// ================= 10. 吴国太 · 甘露 / 补益 =================
{
  const g = mk(['wuguotai', 'simayi', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1, 2] };
    return null;
  });
  const a = g.players[1], b = g.players[2];
  a.equips.weapon = card('aw', 'zhuge', 'spade', 1);
  b.equips.armor = card('ba', 'bagua', 'club', 2);
  g.phase = 'play';
  await g.useActiveSkill(g.players[0], 'ganlu');
  ok(a.equips.armor && a.equips.armor.name === 'bagua', '甘露：甲应换到 a 的装备区');
  ok(b.equips.weapon && b.equips.weapon.name === 'zhuge', '甘露：武器应换到 b 的装备区');
}
{
  const g = mk(['wuguotai', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const wg = g.players[0], t = g.players[1];
  t.hand = [card('nb', 'juedou', 'spade', 3)];
  t.hp = 0;
  await g.trigger('dying.begin', { self: t, player: wg, from: wg });
  ok(t.hp === 1, `补益：展示非基本牌应回复 1 点体力（实际 ${t.hp}）`);
}

// ================= 11. 陈宫 · 明策 / 智迟 =================
{
  const g = mk(['chengong', 'simayi', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 1 };
    if (req.kind === 'card') return { cardId: p.hand.find(c => c.name === 'sha')?.id };
    return null;
  });
  const cg = g.players[0], t = g.players[1];
  cg.hand.push(card('ms', 'sha', 'spade', 5));
  g.phase = 'play';
  const th = t.hand.length;
  await g.useActiveSkill(cg, 'mingce');
  ok(t.hand.length === th + 2, `明策：目标应获得牌并摸一张（${th} → ${t.hand.length}）`);
}
{
  const g = mk(['chengong', 'simayi']);
  const cg = g.players[0], t = g.players[1];
  g.turnPlayer = t;
  await g.trigger('damage.after', { self: cg, player: cg, from: t, to: cg, amount: 1, card: null });
  ok(cg.flags.zhichiTurn === g.turnCount, '智迟：应记录本回合已受伤');
  const hp0 = cg.hp;
  await g.trigger('damage.before', { self: cg, player: cg, from: t, to: cg, amount: 1, card: null });
  const hp1 = cg.hp;
  ok(hp1 === hp0, '智迟：本回合不应再受到伤害');
}

// ================= 12. 高顺 · 陷阵 / 禁酒 =================
{
  const g = mk(['gaoshun', 'simayi'], yes());
  const gs = g.players[0], t = g.players[1];
  gs.hand = [card('g1', 'sha', 'spade', 13)];
  t.hand = [card('g2', 'shan', 'heart', 5)];
  g.phase = 'play';
  await g.useActiveSkill(gs, 'xianzhen');
  ok(!!gs.flags.xianzhenWin || !!gs.flags.xianzhenLose, '陷阵：应记录拼点结果');
}
{
  const g = mk(['gaoshun', 'simayi']);
  const gs = g.players[0];
  const jiu = card('j1', 'jiu', 'spade', 3);
  const r = g.canUse(gs, jiu, [gs]);
  ok(r.ok === false, '禁酒：不能使用【酒】');
  ok(/禁酒/.test(r.reason || ''), `禁酒：拒绝原因应说明技能（${r.reason}）`);
}

// ================= 汇总 =================
console.log(`\n=== yj2011check：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
