// SG006 守门测试：神话再临·风 7 将 + M2 翻面 / M9 不屈 / 3 个引擎小能力
// 运行：node tools/fengcheck.js（零第三方依赖，不接入 selfcheck）
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { getSkill, hasSkill } from '../src/engine/skill.js';
import { GENERALS, generalById, PACK_CN } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META, suitOf, isRedFor } from '../src/engine/cards.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; bad.push(msg); }
}

const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function yesNo(handler) {
  return { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) };
}
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261026,
    responder: yesNo(handler), deckEntries: deckEntries('standard'),
    config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}

// ================= 1. 7 将数据 / 技能注册（不得走前缀降级） =================
const EXPECT = [
  ['feng_xiahouyuan', '夏侯渊', 'wei', 4, ['shensu']],
  ['feng_caoren', '曹仁', 'wei', 4, ['jushou']],
  ['feng_huangzhong', '黄忠', 'shu', 4, ['liegong']],
  ['feng_weiyan', '魏延', 'shu', 4, ['kuanggu']],
  ['feng_xiaoqiao', '小乔', 'wu', 3, ['tianxiang', 'hongyan']],
  ['feng_zhoutai', '周泰', 'wu', 4, ['buqu']],
  ['feng_zhangjiao', '张角', 'qun', 3, ['leiji', 'guidao']],
];
ok(GENERALS.filter(g => g.pack === 'feng').length === 8, `风包武将数应为 8，实际 ${GENERALS.filter(g => g.pack === 'feng').length}`);
ok(PACK_CN.feng === '神话再临·风', `PACK_CN 缺少风包名称（实际 ${PACK_CN.feng}）`);
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 未在 generalById() 中取到`);
  ok(gd && gd.name === name, `${id} 姓名应为 ${name}`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力应为 ${kingdom}/${hp}`);
  ok(gd && gd.pack === 'feng', `${id} pack 应为 feng`);
  ok(!!gd && gd.skills.length === skills.length && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符：${gd?.skills}`);
  ok(id.startsWith('feng_'), `${id} 应使用 feng_ 前缀`);
  ok(!/^jie_|^mou_|^ji_/.test(id), `${id} 不得使用 jie_/mou_/ji_ 前缀`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册（hasSkill=false）`);
    const sk = getSkill(s);
    ok(sk && sk.id === s, `技能 ${s} getSkill 返回值不对`);
    ok(sk && sk.fallbackOf === undefined, `技能 ${s} 走了前缀降级（fallbackOf=${sk?.fallbackOf}）`);
  }
}

// ================= 2. M2 翻面：据守 → 下一个回合整体跳过 =================
{
  const g = mk(['feng_caoren', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const p = g.players[0];
  g.phase = 'play';
  const hand0 = p.hand.length;
  await g.useActiveSkill(p, 'jushou');
  ok(p.flipped === true, '据守发动后 flipped 应为 true');
  ok(p.hand.length === hand0 + 3, `据守应摸 3 张：${hand0} → ${p.hand.length}`);
  ok(g.snapshot(0).players[0].flipped === true, 'snapshot 未下发 flipped');
  const turn0 = g.turnCount;
  const hand1 = p.hand.length;
  await g.runTurn(p);
  ok(g.turnCount === turn0 + 1, '被翻面的回合仍应计入回合数');
  ok(p.flipped === false, '跳过回合后 flipped 应复位为 false');
  ok(p.hand.length === hand1, '翻面跳过回合不应摸牌/弃牌');
  ok(g.logs.some(l => /翻面，跳过本回合/.test(l.text)), '缺少「翻面，跳过本回合」日志');
}

// ================= 3. M9 不屈：不同点数脱离濒死 / 同点数清空并求桃 =================
{
  // 3a. 不同点数 → 体力回到 1，buqu=1，不再求桃
  let taoAsked = 0;
  const g = mk(['feng_zhoutai', 'simayi'], (gg, p, req) => {
    if (req.kind === 'card' && req.reason === 'dying') taoAsked++;
    return null;
  });
  const zt = g.players[0];
  g.players[1].hand.push(card('taoA', 'tao', 'heart', 3)); // 确保「求桃」可被观测
  g.deck.push(card('buq1', 'sha', 'club', 7));            // 牌堆顶
  zt.hp = 0;
  await g.dying(zt);
  ok(zt.alive === true, '不屈（不同点数）应脱离濒死');
  ok(zt.hp === 1, `不屈（不同点数）体力应回复至 1，实际 ${zt.hp}`);
  ok(zt.buqu.length === 1 && zt.buqu[0].id === 'buq1', '不屈应置入 1 张「创」');
  ok(taoAsked === 0, '不屈（不同点数）不应再求桃');
  ok(g.snapshot(0).players[0].buqu === 1, 'snapshot 未下发 buqu 数量');

  // 3b. 相同点数 → 弃置该牌并清空「创」，继续常规求桃
  let taoAsked2 = 0;
  const g2 = mk(['feng_zhoutai', 'simayi'], (gg, p, req) => {
    if (req.kind === 'card' && req.reason === 'dying') taoAsked2++;
    return null;
  });
  const zt2 = g2.players[0];
  zt2.buqu.push(card('old1', 'shan', 'heart', 7));
  g2.players[1].hand.push(card('taoB', 'tao', 'heart', 4));
  g2.deck.push(card('buq2', 'sha', 'spade', 7));           // 与 old1 同为 7 点
  zt2.hp = 0;
  await g2.dying(zt2);
  ok(zt2.buqu.length === 0, '不屈（同点数）应清空全部「创」');
  ok(taoAsked2 > 0, '不屈（同点数）应继续常规求桃');
  ok(zt2.alive === false, '无人出桃时应阵亡');
  ok(g2.discardPile.some(c => c.id === 'buq2') && g2.discardPile.some(c => c.id === 'old1'), '不屈清空时「创」应进弃牌堆');
  ok(g2.discardPile.filter(c => c.id === 'buq2').length === 1, '重复点数的牌在弃牌堆只应出现一次');
}

// ================= 4. 夏侯渊 · 神速（跳过判定+摸牌，无距离限制的杀） =================
{
  const g = mk(['feng_xiahouyuan', 'simayi', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'choice') return { index: 0 };
    if (req.kind === 'targets') return { seats: [2] };
    return null;
  });
  const p = g.players[0], far = g.players[2];
  far.hand = []; // 不出闪，便于验证伤害
  p.hand = [card('x1', 'sha', 'spade', 9)];
  far.hp = far.maxHp;
  const hp0 = far.hp;
  ok(g.distance(p, far) === 2 && g.attackRange(p) === 1, `前置：目标应在攻击范围外（距离 ${g.distance(p, far)} / 范围 ${g.attackRange(p)}）`);
  g.phase = 'play';
  await g.useActiveSkill(p, 'shensu');
  ok(p.flags.skip_judge === true, '神速选项 1 应跳过判定阶段');
  ok(p.flags.skip_draw === true, '神速选项 1 应跳过摸牌阶段');
  ok(far.hp === hp0 - 1, `神速的杀应无视距离命中（${hp0} → ${far.hp}）`);
  ok(g.logs.some(l => /神速/.test(l.text)), '缺少神速日志');
  // 跳到下一个回合，验证两个阶段真的被跳过（且不摸牌）
  const hand0 = p.hand.length;
  await g.runTurn(p);
  ok(g.logs.some(l => /跳过判定阶段/.test(l.text)), '回合流程未跳过判定阶段');
  ok(g.logs.some(l => /跳过摸牌阶段/.test(l.text)), '回合流程未跳过摸牌阶段');
  ok(p.hand.length === hand0, '跳过摸牌阶段后不应摸牌');
}

// ================= 5. 黄忠 · 烈弓（不可被闪响应） =================
{
  let dodgeAsks = 0;
  const g = mk(['feng_huangzhong', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') { if (/闪/.test(req.prompt || '')) dodgeAsks++; return null; }
    return null;
  });
  const hz = g.players[0], t = g.players[1];
  t.hand = [card('h1', 'sha'), card('h2', 'shan'), card('h3', 'tao'), card('h4', 'jiu')];
  t.hp = t.maxHp;
  hz.hand = [card('lg1', 'sha', 'spade', 7)];
  hz.flags.shaUsed = 0;
  g.phase = 'play';
  const hp0 = t.hp;
  await g.useCard({ from: hz, card: hz.hand[0], targets: [t], reason: 'play' });
  ok(t.hp === hp0 - 1, '烈弓：杀应正常造成伤害');
  ok(dodgeAsks === 0, `烈弓：满足条件时不应出现【闪】询问（实际 ${dodgeAsks} 次）`);
  ok(g.logs.some(l => /烈弓/.test(l.text)), '缺少烈弓日志');

  // 反例：目标手牌数 < 黄忠体力且 > 攻击范围 → 仍应询问【闪】
  dodgeAsks = 0;
  t.hand = [card('h5', 'tao'), card('h6', 'sha'), card('h7', 'shan')]; // 3 张：4 > 3 > 1
  t.hp = t.maxHp;
  hz.hand = [card('lg2', 'sha', 'spade', 8)];
  hz.flags.shaUsed = 0;
  await g.useCard({ from: hz, card: hz.hand[0], targets: [t], reason: 'play' });
  ok(dodgeAsks === 1, `烈弓：不满足条件时应询问【闪】（实际 ${dodgeAsks} 次）`);
  ok(t.hp === hp0 - 1, '烈弓：对照用例中目标不出闪应受伤');
}

// ================= 6. 小乔 · 天香 / 红颜 =================
{
  const heart = card('tx1', 'tao', 'heart', 6);
  let cardAsked = null;
  const g = mk(['feng_xiaoqiao', 'simayi', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') { cardAsked = req; return { cardId: heart.id }; }
    if (req.kind === 'targets') return { seats: [2] };
    return null;
  });
  const xq = g.players[0], src = g.players[1], t = g.players[2];
  xq.hand = [heart, card('tx2', 'sha', 'spade', 9)];
  xq.hp = xq.maxHp;
  t.hp = t.maxHp;
  const tHand0 = t.hand.length;
  const xqHp0 = xq.hp;
  await g.damage({ from: src, to: xq, amount: 1, reason: 'test' });
  ok(!!cardAsked, '天香：未询问弃置红桃手牌');
  ok(!xq.hand.includes(heart), '天香：红桃手牌未弃置');
  ok(xq.hp === xqHp0, `天香：伤害应转移，小乔不应掉血（${xqHp0} → ${xq.hp}）`);
  ok(t.hp === t.maxHp - 1, `天香：伤害应落在被转移角色（${t.maxHp} → ${t.hp}）`);
  ok(t.hand.length === tHand0 + 1, `天香：目标应摸 X 张（已损失 1 点 → 摸 1），实际 +${t.hand.length - tHand0}`);
  ok(g.logs.some(l => /转移/.test(l.text)), '缺少天香转移日志');
  // 红颜：黑桃视为红桃（不改牌本身）
  ok(suitOf(xq, { suit: 'spade' }) === 'heart', '红颜：小乔的黑桃牌应视为红桃');
  ok(isRedFor(xq, { suit: 'spade' }) === true, '红颜：小乔的黑桃牌应视为红色');
  ok(suitOf(t, { suit: 'spade' }) === 'spade', '红颜：不应影响其他角色的黑桃牌');
}

// ================= 7. 张角 · 鬼道 / 雷击 =================
{
  const black = card('gd1', 'sha', 'spade', 7);
  const g = mk(['feng_zhangjiao', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return { cardId: black.id };
    return null;
  });
  const zj = g.players[0];
  zj.hand = [black];
  g.deck.push(card('jd1', 'tao', 'heart', 10)); // 原本判定为红桃
  const j = await g.judge(g.players[1], { reason: 'test' });
  ok(j.suit === 'spade' && j.num === 7, `鬼道：判定应被黑色牌替换（实际 ${j.suit}${j.num}）`);
  ok(!zj.hand.includes(black), '鬼道：打出的黑色牌应从手牌移出');
  ok(g.discardPile.some(c => c.id === 'gd1'), '鬼道：打出的牌应进入弃牌堆');
  ok(g.logs.some(l => /鬼道/.test(l.text)), '缺少鬼道日志');
}
{
  // 雷击：要求【闪】时接管响应，判定黑桃 → 2 点雷电伤害
  const shan = card('lj1', 'shan', 'heart', 2);
  const g = mk(['feng_zhangjiao', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return { cardId: shan.id };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const zj = g.players[0], t = g.players[1];
  zj.hand = [shan];
  g.deck.push(card('lj2', 'sha', 'spade', 5)); // 雷击判定为黑桃
  t.hp = t.maxHp;
  const hp0 = t.hp;
  const dodged = await g.requireDodge(zj, { from: t, card: card('lj3', 'sha', 'club', 3), reason: 'sha' });
  ok(dodged === true, '雷击：张角应打出【闪】并躲过此杀');
  ok(t.hp === hp0 - 2, `雷击：判定黑桃应造成 2 点雷电伤害（${hp0} → ${t.hp}）`);
  ok(!zj.hand.includes(shan), '雷击：打出的【闪】应从手牌移出');
  ok(g.logs.some(l => /雷击/.test(l.text)), '缺少雷击日志');
}

// ================= 8. 魏延 · 狂骨（距离 1 回血 / 距离 2 不回） =================
{
  const g = mk(['feng_weiyan', 'simayi', 'sunquan', 'liubei'], () => null);
  const wy = g.players[0], near = g.players[1], far = g.players[2];
  wy.hp = 2;
  near.hp = near.maxHp;
  await g.damage({ from: wy, to: near, amount: 1, reason: 'test' });
  ok(near.hp === near.maxHp - 1, '狂骨：距离 1 的目标应受到伤害');
  ok(wy.hp === 3, `狂骨：对距离 1 的目标造成伤害后应回血（实际 ${wy.hp}）`);
  wy.hp = 2;
  far.hp = far.maxHp;
  await g.damage({ from: wy, to: far, amount: 1, reason: 'test' });
  ok(far.hp === far.maxHp - 1, '狂骨：距离 2 的目标应受到伤害');
  ok(wy.hp === 2, `狂骨：距离 2 不应回血（实际 ${wy.hp}）`);
}

// ================= 9. 引擎小能力：skipPhase 接口 =================
{
  const g = mk(['feng_caoren', 'simayi']);
  const p = g.players[0];
  ok(typeof g.skipPhase === 'function', '缺少 game.skipPhase()');
  g.skipPhase(p, 'play');
  ok(p.flags.skip_play === true, 'skipPhase 未设置 skip_<phase> 标记');
  g.skipPhase(p, 'discard');
  ok(p.flags.skip_discard === true, 'skipPhase 未设置 skip_discard 标记');
}


// ================= 于吉 · 蛊惑（M10 简化版） =================
{
  const yj = generalById('feng_yuji');
  ok(!!yj && yj.name === '于吉', '于吉数据缺失');
  ok(yj && yj.pack === 'feng' && yj.hp === 3, '于吉 pack/hp 不符');
  ok(GENERALS.filter(g => g.pack === 'feng').length === 8,
    `风包应为 8 将（实际 ${GENERALS.filter(g => g.pack === 'feng').length}）`);
  ok(hasSkill('guhuo'), '蛊惑未注册');
  const sk = getSkill('guhuo');
  ok(sk && sk.fallbackOf === undefined && !!sk.active, '蛊惑应为真实装主动技');
  ok(sk && sk.active.perTurn === true, '蛊惑应为出牌阶段限一次');
}

// 1) 无人质疑：把【杀】声明为【无中生有】→ 按无中生有结算（摸 2 张）
{
  const g = mk(['feng_yuji', 'sunquan'], (gg, p_, req) => {
    if (req.kind === 'confirm') return { yes: false };
    if (req.kind === 'card') return p_.hand.length ? { cardId: p_.hand[0].id } : null;
    if (req.kind === 'choice') {
      const i = (req.options || []).indexOf('无中生有');
      return { index: i >= 0 ? i : 0 };
    }
    if (req.kind === 'targets') return { seats: [] };
    return null;
  });
  const yj = g.players[0];
  yj.hand = [card('g1', 'sha', 'spade', 5), card('g2', 'sha', 'heart', 6)];
  const n0 = yj.hand.length;
  const sk = getSkill('guhuo');
  await g.useActiveSkill(yj, 'guhuo');
  ok(yj.hand.length === n0 + 1, `蛊惑：无人质疑时应按【无中生有】摸 2 张（${n0} → ${yj.hand.length}）`);
  ok(g.logs.some(l => /蛊惑/.test(l.text)), '缺少蛊惑日志');
}

// 2) 有人质疑且声明为真 → 质疑者各失去 1 点体力
{
  const g = mk(['feng_yuji', 'sunquan'], (gg, p_, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return p_.hand.length ? { cardId: p_.hand[0].id } : null;
    if (req.kind === 'choice') {
      const i = (req.options || []).indexOf('无中生有');
      return { index: i >= 0 ? i : 0 };
    }
    return null;
  });
  const yj = g.players[0], t = g.players[1];
  yj.hand = [card('w1', 'wuzhong', 'heart', 7)];
  const hp0 = t.hp;
  await g.useActiveSkill(yj, 'guhuo');
  ok(t.hp === hp0 - 1, `蛊惑：声明为真时质疑者应失去 1 点体力（${hp0} → ${t.hp}）`);
}

// 3) 有人质疑且声明为假 → 质疑者摸一张，此牌作废进弃牌堆
{
  const g = mk(['feng_yuji', 'sunquan'], (gg, p_, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return p_.hand.length ? { cardId: p_.hand[0].id } : null;
    if (req.kind === 'choice') {
      const i = (req.options || []).indexOf('无中生有');
      return { index: i >= 0 ? i : 0 };
    }
    return null;
  });
  const yj = g.players[0], t = g.players[1];
  const fake = card('f1', 'sha', 'club', 9);
  yj.hand = [fake];
  const th0 = t.hand.length, yh0 = yj.hand.length;
  await g.useActiveSkill(yj, 'guhuo');
  ok(t.hand.length === th0 + 1, `蛊惑：声明为假时质疑者应摸一张（${th0} → ${t.hand.length}）`);
  ok(yj.hand.length === yh0 - 1, `蛊惑：作废的牌应离开手牌（${yh0} → ${yj.hand.length}）`);
  ok(g.discardPile.some(c => c.id === 'f1'), '蛊惑：作废的牌应进弃牌堆');
}

// 4) 未标记 __guhuo 的普通牌不能被当作其它牌使用（不放开虚拟牌通道）
{
  const g = mk(['feng_yuji', 'sunquan']);
  const yj = g.players[0];
  const plain = card('p1', 'sha', 'spade', 4);
  yj.hand = [plain];
  ok(g.virtualAllowed(yj, [plain], 'wuzhong') === false, '蛊惑：普通牌不应被允许当作【无中生有】');
  plain.__guhuo = true;
  ok(g.virtualAllowed(yj, [plain], 'wuzhong') === true, '蛊惑：标记后应允许当作【无中生有】');
  ok(g.virtualAllowed(yj, [plain], 'lebu') === false, '蛊惑：不应允许当作延时锦囊【乐不思蜀】');
  delete plain.__guhuo;
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
if (bad.length) {
  console.log('失败项：');
  for (const b of bad) console.log('  -', b);
  process.exit(1);
}
