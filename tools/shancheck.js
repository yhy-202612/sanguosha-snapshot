// SG010 守门测试：神话再临·山 7 将 16 技能（左慈待 M11）
// 运行：node tools/shancheck.js
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
    seats, mode: getMode('duel'), seed: 20261028,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['liushan', '刘禅', 'shu', 3, ['xiangle', 'fangquan', 'yuruo']],
  ['zhanghe', '张郃', 'wei', 4, ['qiaobian']],
  ['dengai', '邓艾', 'wei', 4, ['tuntian', 'zaoxian']],
  ['jiangwei', '姜维', 'shu', 4, ['tiaoxin', 'zhiji']],
  ['sunce', '孙策', 'wu', 4, ['jiangji', 'hunzi', 'zhiba']],
  ['zhangzhaozhanghong', '张昭张纮', 'wu', 3, ['zhijian', 'guzheng']],
  ['caiwenji', '蔡文姬', 'qun', 3, ['beige', 'duanchang']],
  ['zuoci', '左慈', 'qun', 3, ['huashen', 'xinsheng']],
];
ok(GENERALS.filter(g => g.pack === 'shan').length === 8, `山包武将数应为 8，实际 ${GENERALS.filter(g => g.pack === 'shan').length}`);
ok(PACK_CN.shan === '神话再临·山', `PACK_CN.shan 应为「神话再临·山」，实际 ${PACK_CN.shan}`);
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 未找到`);
  ok(gd && gd.name === name && gd.kingdom === kingdom && gd.hp === hp, `${id} 姓名/势力/体力不符`);
  ok(gd && gd.pack === 'shan', `${id} pack 应为 shan`);
  ok(!!gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符：${gd?.skills}`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常/降级`);
  }
}
ok(generalById('liushan')?.lord === 'yuruo', '刘禅应为主公技 yuruo');
ok(generalById('sunce')?.lord === 'zhiba', '孙策应为主公技 zhiba');
ok(['jixi'].every(hasSkill), '急袭应注册（觉醒后获得）');

// ================= 2. 刘禅 · 享乐 / 放权 / 若愚 =================
{
  const g = mk(['liushan', 'simayi'], (gg, p, req) => {
    if (req.kind === 'card') return null; // 不出基本牌
    return null;
  });
  const ls = g.players[0], from = g.players[1];
  from.hand.push(card('b1', 'sha', 'spade', 5));
  const sha = card('s1', 'sha', 'spade', 7);
  const data = { self: from, player: from, card: sha, target: ls, canceled: false };
  await g.trigger('target.before', data);
  ok(data.canceled === true, '享乐：使用者不弃基本牌时【杀】应对刘禅无效');
}
{
  let discarded = null;
  const g = mk(['liushan', 'simayi'], (gg, p, req) => {
    if (req.kind === 'card') return { cardId: p.hand.find(c => CARD_META[c.name]?.type === 'basic')?.id };
    return null;
  });
  const ls = g.players[0], from = g.players[1];
  from.hand = [card('b2', 'shan', 'heart', 2)];
  const data = { self: from, player: from, card: card('s2', 'sha', 'spade', 8), target: ls, canceled: false };
  await g.trigger('target.before', data);
  ok(data.canceled === false, '享乐：使用者弃基本牌后【杀】应生效');
  ok(from.hand.length === 0, '享乐：使用者应弃置 1 张基本牌');
}
{
  const g = mk(['liushan', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const ls = g.players[0];
  g.phase = 'play';
  await g.useActiveSkill(ls, 'fangquan');
  ok(ls.flags.skip_play === true || ls.flags.fangquanTarget === 1, '放权：应跳过出牌阶段并记录目标');
  const q = g.extraQueue.length;
  await g.trigger('phase.begin', { self: ls, player: ls, phase: 'end' });
  ok(g.extraQueue.length === q + 1, '放权：回合结束应排队一个额外回合');
  ok(g.logs.some(l => /放权/.test(l.text)), '缺少放权日志');
}
{
  const g = mk(['liushan', 'simayi'], () => null);
  const ls = g.players[0];
  ls.role = 'lord';
  ls.hp = 1;
  const mx = ls.maxHp;
  await g.trigger('phase.begin', { self: ls, player: ls, phase: 'prepare' });
  ok(ls.flags.awaken_yuruo === true, '若愚：应标记为已觉醒');
  ok(ls.maxHp === mx + 1, `若愚：体力上限应 +1（${mx} → ${ls.maxHp}）`);
  ok(ls.skills.some(s => s.id === 'jijiang'), '若愚：应获得【激将】');
}

// ================= 3. 张郃 · 巧变 =================
{
  const g = mk(['zhanghe', 'simayi', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    if (req.kind === 'targets') return { seats: [2] };
    return null;
  });
  const zh = g.players[0], t = g.players[2];
  g.players[1].hand.push(card('h1', 'sha', 'spade', 3));
  const h0 = zh.hand.length;
  await g.trigger('phase.begin', { self: zh, player: zh, phase: 'prepare' });
  ok(zh.flags.skip_draw === true, '巧变：应跳过摸牌阶段');
  ok(zh.hand.length === h0, `巧变：弃 1 得 1，手牌数应不变（${h0} → ${zh.hand.length}）`);
  ok(g.logs.some(l => /巧变/.test(l.text)), '缺少巧变日志');
}

// ================= 4. 邓艾 · 屯田 / 凿险 / 急袭 =================
{
  const g = mk(['dengai', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const da = g.players[0];
  g.turnPlayer = g.players[1];
  g.deck.unshift(card('j1', 'sha', 'spade', 6));
  await g.trigger('cards.discard', { self: da, player: da, cards: [card('x1', 'shan', 'club', 3)], reason: 'test' });
  ok((da.tian || []).length === 1, `屯田：非红桃判定应获得 1 张「田」（实际 ${(da.tian || []).length}）`);
  ok(g.logs.some(l => /屯田/.test(l.text)), '缺少屯田日志');
}
{
  const g = mk(['dengai', 'simayi'], () => null);
  const da = g.players[0];
  da.tian = [card('t1', 'sha', 'spade', 1), card('t2', 'sha', 'club', 2), card('t3', 'sha', 'heart', 3)];
  const mx = da.maxHp;
  await g.trigger('phase.begin', { self: da, player: da, phase: 'prepare' });
  ok(da.flags.awaken_zaoxian === true, '凿险：3 张「田」应觉醒');
  ok(da.maxHp === mx - 1, '凿险：体力上限应 -1');
  ok(da.skills.some(s => s.id === 'jixi'), '凿险：应获得【急袭】');
}
{
  const g = mk(['dengai', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    // chooseCardFrom 会问选择哪张
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
    return null;
  });
  const da = g.players[0], t = g.players[1];
  da.skills.push(getSkill('jixi'));
  da.tian = [card('t4', 'sha', 'spade', 4)];
  t.hand.push(card('o1', 'tao', 'heart', 7));
  g.phase = 'play';
  const h0 = da.hand.length;
  await g.useActiveSkill(da, 'jixi');
  ok(da.tian.length === 0, '急袭：应移去 1 张「田」');
  ok(da.hand.length === h0 + 1, `急袭：应获得目标 1 张牌（${h0} → ${da.hand.length}）`);
}

// ================= 5. 姜维 · 挑衅 / 志继 =================
{
  const g = mk(['jiangwei', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
    return null;
  });
  const jw = g.players[0], t = g.players[1];
  t.hand = [card('q1', 'sha', 'spade', 5)];
  g.phase = 'play';
  const hp0 = jw.hp;
  await g.useActiveSkill(jw, 'tiaoxin');
  ok(jw.hp === hp0 - 1, `挑衅：目标应选择对姜维出【杀】（hp ${hp0} → ${jw.hp}）`);
}
{
  const g = mk(['jiangwei', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
    return null;
  });
  const jw = g.players[0], t = g.players[1];
  t.hand = [card('q2', 'tao', 'heart', 5)];
  g.phase = 'play';
  const th = t.hand.length;
  await g.useActiveSkill(jw, 'tiaoxin');
  ok(t.hand.length === th - 1, '挑衅：目标无【杀】时应被弃置 1 张牌');
}
{
  const g = mk(['jiangwei', 'simayi'], () => null);
  const jw = g.players[0];
  jw.hand = [];
  const mx = jw.maxHp;
  await g.trigger('phase.begin', { self: jw, player: jw, phase: 'prepare' });
  ok(jw.flags.awaken_zhiji === true && jw.maxHp === mx - 1, '志继：无手牌应觉醒并减体力上限');
  ok(jw.skills.some(s => s.id === 'guanxing'), '志继：应获得【观星】');
}

// ================= 6. 孙策 · 激昂 / 魂姿 / 制霸 =================
{
  const g = mk(['sunce', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const sc = g.players[0];
  const red = card('r1', 'sha', 'heart', 7);
  const h0 = sc.hand.length;
  await g.trigger('target.after', { self: sc, player: sc, card: red, target: g.players[1] });
  ok(sc.hand.length === h0 + 1, '激昂：使用红色【杀】应摸 1 张牌');
  const black = card('b1', 'sha', 'spade', 7);
  const h1 = sc.hand.length;
  await g.trigger('target.after', { self: sc, player: sc, card: black, target: g.players[1] });
  ok(sc.hand.length === h1, '激昂：黑色【杀】不应摸牌');
}
{
  const g = mk(['sunce', 'simayi'], () => null);
  const sc = g.players[0];
  sc.hp = 1;
  const mx = sc.maxHp;
  await g.trigger('phase.begin', { self: sc, player: sc, phase: 'prepare' });
  ok(sc.flags.awaken_hunzi === true && sc.maxHp === mx - 1, '魂姿：体力 1 应觉醒并减上限');
  ok(sc.skills.some(s => s.id === 'yingzi') && sc.skills.some(s => s.id === 'yinghun'), '魂姿：应获得【英姿】【英魂】');
}
{
  const g = mk(['sunce', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const sc = g.players[0], t = g.players[1];
  g.phase = 'play';
  const h0 = sc.hand.length;
  await g.useActiveSkill(sc, 'zhiba');
  ok(g.logs.some(l => /制霸/.test(l.text)), '缺少制霸日志/未执行');
  ok(sc.hand.length >= h0 - 1, '制霸：拼点后手牌数不应异常');
}

// ================= 7. 张昭张纮 · 直谏 / 固政 =================
{
  const g = mk(['zhangzhaozhanghong', 'simayi'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return { cardId: p.hand.find(c => CARD_META[c.name]?.sub)?.id };
    return null;
  });
  const zz = g.players[0], t = g.players[1];
  zz.hand.push(card('e1', 'zhuge', 'heart', 1));
  g.phase = 'play';
  const h0 = zz.hand.length;
  await g.useActiveSkill(zz, 'zhijian');
  ok(Object.values(t.equips).some(c => c && c.name === 'zhuge'), '直谏：装备应置入目标装备区');
  ok(zz.hand.length === h0, `直谏：置入装备后摸 1 张，手牌数应不变（${h0} → ${zz.hand.length}）`);
}
{
  const g = mk(['zhangzhaozhanghong', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const zz = g.players[0], t = g.players[1];
  g.phase = 'discard';
  const d1 = card('c1', 'sha', 'spade', 3), d2 = card('c2', 'shan', 'heart', 4);
  await g.trigger('cards.discard', { self: t, player: t, cards: [d1, d2], reason: 'discard' });
  const z0 = zz.hand.length, t0 = t.hand.length;
  await g.trigger('phase.end', { self: t, player: t, phase: 'discard' });
  ok(t.hand.length === t0 + 1, `固政：应交还目标 1 张（${t0} → ${t.hand.length}）`);
  ok(zz.hand.length === z0 + 1, `固政：应获得其余 1 张（${z0} → ${zz.hand.length}）`);
}

// ================= 8. 蔡文姬 · 悲歌 / 断肠 =================
{
  const g = mk(['caiwenji', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const cw = g.players[0], t = g.players[1];
  g.deck.unshift(card('j2', 'sha', 'heart', 9));
  const hp0 = t.hp;
  await g.trigger('damage.after', { self: t, player: cw, from: cw, to: t, amount: 1, card: card('s5', 'sha', 'spade', 5) });
  ok(t.hp === Math.min(t.maxHp, hp0 + 1), `悲歌：判定红桃应回复 1 点体力（${hp0} → ${t.hp}）`);
  ok(cw.hand.length >= 0, '悲歌：应弃置 1 张牌发动');
  ok(g.logs.some(l => /悲歌/.test(l.text)), '缺少悲歌日志');
}
{
  const g = mk(['caiwenji', 'simayi'], () => null);
  const cw = g.players[0], killer = g.players[1];
  const n = killer.skills.length;
  await g.die(cw, { from: killer });
  ok(killer.skills.length === 0, `断肠：击杀者应失去全部技能（${n} → ${killer.skills.length}）`);
  ok(g.logs.some(l => /断肠/.test(l.text)), '缺少断肠日志');
}


// ================= 左慈 · 化身 / 新生 =================
{
  const g = mk(['zuoci', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 1 };
    return null;
  });
  const zc = g.players[0];
  await g.trigger('game.start', { self: null });
  const st = zc.flags.huashen;
  ok(!!st && st.cards.length === 2, `化身：开局应获得 2 张化身牌（实际 ${st && st.cards.length}）`);
  ok(!!st.active, '化身：开局应自动启用一个化身技能');
  ok(zc.skills.some(s => s.id === st.active), '化身：启用的技能应装入技能表');
  ok(!st.cards.includes('huashen') && !st.cards.includes('xinsheng'), '化身：化身牌不应含自身技能');
  ok(st.active !== 'huashen' && st.active !== 'xinsheng', `化身：不应化身自己（${st.active}）`);
  const n0 = zc.skills.length;
  await g.trigger('damage.after', { self: zc, to: zc, from: g.players[1], amount: 1 });
  ok(zc.flags.huashen.cards.length >= 3, `新生：受伤后应获得新化身牌（${st.cards.length}）`);
  ok(g.logs.some(l => /化身|新生/.test(l.text)), '缺少化身/新生日志');
  ok(zc.skills.length >= n0, '新生：技能表不应异常减少');
}
{
  // 更换化身技能：选第 2 张（index 2），旧技能应被移除
  const g = mk(['zuoci', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 2 };
    return null;
  });
  const zc = g.players[0];
  await g.trigger('game.start', { self: null });
  const st = zc.flags.huashen;
  const first = st.active;
  await g.trigger('damage.after', { self: zc, to: zc, from: g.players[1], amount: 1 });
  ok(st.active !== first, `化身：应可更换化身技能（${first} → ${st.active}）`);
  ok(!zc.skills.some(s => s.id === first), '化身：旧化身技能应被移除');
  ok(zc.skills.some(s => s.id === st.active), '化身：新化身技能应装入');
  // 同回合不可再次更换
  const cur = st.active;
  await g.trigger('damage.after', { self: zc, to: zc, from: g.players[1], amount: 1 });
  ok(st.active === cur, '化身：同一回合不应重复更换');
}
{
  // 化身牌上限 5
  const g = mk(['zuoci', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
    return null;
  });
  const zc = g.players[0];
  await g.trigger('game.start', { self: null });
  for (let i = 0; i < 6; i++) {
    zc.flags.huashenChangedTurn = -1;
    await g.trigger('damage.after', { self: zc, to: zc, from: g.players[1], amount: 1 });
  }
  ok(zc.flags.huashen.cards.length <= 5, `新生：化身牌上限应为 5（实际 ${zc.flags.huashen.cards.length}）`);
}

// ================= 汇总 =================
console.log(`\n=== shancheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
