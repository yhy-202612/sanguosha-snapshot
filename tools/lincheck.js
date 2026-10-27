// SG009 守门测试：神话再临·林 8 将（+典韦补火包）共 17 技能，含 M1 拼点
// 运行：node tools/lincheck.js
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
    seats, mode: getMode('duel'), seed: 20261027,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}

// ================= 1. 数据与注册（不得走前缀降级） =================
const EXPECT = [
  ['zhurong', '祝融', 'shu', 4, ['juxiang', 'lieren']],
  ['caopi', '曹丕', 'wei', 4, ['xingshang', 'fangzhu']],
  ['xuhuang', '徐晃', 'wei', 4, ['duanliang']],
  ['menghuo', '孟获', 'qun', 4, ['huoshou', 'zaiqi']],
  ['sunjian', '孙坚', 'wu', 4, ['yinghun']],
  ['lusu', '鲁肃', 'wu', 3, ['haoshi', 'dimeng']],
  ['dongzhuo', '董卓', 'qun', 8, ['jiuchi', 'roulin', 'bengkuai']],
  ['jiaxu', '贾诩', 'qun', 3, ['wansha', 'luanwu', 'weimu']],
];
ok(GENERALS.filter(g => g.pack === 'lin').length === 8, `林包武将数应为 8，实际 ${GENERALS.filter(g => g.pack === 'lin').length}`);
ok(PACK_CN.lin === '神话再临·林', `PACK_CN.lin 应为「神话再临·林」，实际 ${PACK_CN.lin}`);
const dw = generalById('dianwei');
ok(!!dw && dw.pack === 'huo', '典韦应在库且 pack=huo');
for (const [id, name, kingdom, hp, skills] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 未在 generalById() 中取到`);
  ok(gd && gd.name === name, `${id} 姓名应为 ${name}`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力应为 ${kingdom}/${hp}`);
  ok(gd && gd.pack === 'lin', `${id} pack 应为 lin`);
  ok(!!gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符：${gd?.skills}`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s, `技能 ${s} getSkill 返回不对`);
    ok(sk && sk.fallbackOf === undefined, `技能 ${s} 走前缀降级 fallbackOf=${sk?.fallbackOf}`);
  }
}

// ================= 2. 典韦 · 强袭 =================
{
  const g = mk(['dianwei', 'simayi'], (gg, p, req) => {
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };  // 选「失去 1 点体力」
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const p = g.players[0], t = g.players[1];
  g.phase = 'play';
  const hp0 = p.hp, thp = t.hp;
  await g.useActiveSkill(p, 'qiangxi');
  ok(p.hp === hp0 - 1, `强袭：发动者应失去 1 点体力（${hp0} → ${p.hp}）`);
  ok(t.hp === thp - 1, `强袭：目标应受到 1 点伤害（${thp} → ${t.hp}）`);
  ok(g.logs.some(l => /强袭/.test(l.text)), '缺少强袭日志');
}

// ================= 3. 曹丕 · 行殇 + 放逐 =================
{
  const g = mk(['caopi', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const cp = g.players[0], victim = g.players[1];
  victim.hand.push(card('v1', 'sha', 'spade', 5), card('v2', 'shan', 'heart', 3));
  victim.alive = true;
  const total = victim.hand.length + Object.values(victim.equips).filter(Boolean).length;
  const before = cp.hand.length;
  await g.die(victim, { from: cp });
  ok(victim.alive === false, '行殇测试：受害者应已阵亡');
  ok(cp.hand.length === before + total, `行殇：应获得死者全部 ${total} 张牌（${before} → ${cp.hand.length}）`);
  ok(g.logs.some(l => /行殇/.test(l.text)), '缺少行殇日志');
}
{
  const g = mk(['caopi', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const cp = g.players[0], t = g.players[1];
  cp.hp = cp.maxHp - 2;
  const th = t.hand.length;
  await g.trigger('damage.after', { self: cp, player: cp, from: t, to: cp, amount: 1, card: null });
  ok(t.hand.length === th + 2, `放逐：X=已损体力 2，目标应摸 2 张（${th} → ${t.hand.length}）`);
  ok(t.flipped === true, '放逐：目标应被翻面');
}

// ================= 4. 徐晃 · 断粮（转化规则） =================
{
  const g = mk(['xuhuang', 'simayi']);
  const p = g.players[0];
  ok(g.virtualAllowed(p, [card('b1', 'sha', 'spade', 7)], 'bingliang') === true, '断粮：黑桃基本牌应可当兵粮寸断');
  ok(g.virtualAllowed(p, [card('b2', 'sha', 'heart', 7)], 'bingliang') === false, '断粮：红色牌不可当兵粮寸断');
  ok(g.virtualAllowed(p, [card('b3', 'juedou', 'club', 7)], 'bingliang') === false, '断粮：非基本非装备牌不可当兵粮寸断（非装备锦囊）');
}

// ================= 5. 祝融 · 巨象 / 烈刃 =================
{
  let asked = 0;
  const g = mk(['zhurong', 'simayi'], (gg, p, req) => {
    if (req.kind === 'card') { asked++; return null; }
    return null;
  });
  const zr = g.players[0];
  const nanman = card('nm1', 'nanman', 'spade', 7);
  const hp0 = zr.hp;
  await g.damage({ from: g.players[1], to: zr, amount: 1, card: nanman, reason: 'test' });
  ok(zr.hp === hp0, `巨象：南蛮入侵对祝融应无效（${hp0} → ${zr.hp}）`);
  g.discardPile.push(nanman);
  const h0 = zr.hand.length;
  await g.trigger('card.use.after', { self: g.players[1], player: g.players[1], card: nanman, targets: [zr] });
  ok(zr.hand.length === h0 + 1, '巨象：其他角色的南蛮结算后应由祝融获得');
  ok(!g.discardPile.includes(nanman), '巨象：南蛮应从弃牌堆移出');
}
{
  let pd = 0;
  const g = mk(['zhurong', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') { pd++; return p.hand.length ? { cardId: p.hand[0].id } : null; }
    return null;
  });
  const zr = g.players[0], t = g.players[1];
  zr.hand.push(card('z1', 'sha', 'spade', 13));
  t.hand.push(card('t1', 'shan', 'club', 5), card('t2', 'tao', 'heart', 6));
  g.deck.push(card('d1', 'sha', 'diamond', 2));
  const sha = card('zs', 'sha', 'spade', 9);
  await g.trigger('damage.after', { self: t, player: zr, from: zr, to: t, amount: 1, card: sha });
  ok(pd >= 2, `烈刃：应进行一次拼点（双方各出 1 张，实际询问 ${pd} 次）`);
  ok(g.logs.some(l => /烈刃.*拼点/.test(l.text)), '缺少烈刃拼点日志');
}

// ================= 6. 孟获 · 祸首 / 再起 =================
{
  const g = mk(['menghuo', 'simayi', 'sunquan'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const mh = g.players[0], s1 = g.players[1], s2 = g.players[2];
  const nanman = card('nm2', 'nanman', 'club', 7);
  const hp0 = mh.hp;
  await g.damage({ from: s1, to: mh, amount: 1, card: nanman, reason: 'test' });
  ok(mh.hp === hp0, '祸首：南蛮入侵对孟获应无效');
  const hp2 = s2.hp;
  await g.damage({ from: s1, to: s2, amount: 1, card: nanman, reason: 'test' });
  ok(s2.hp === hp2 - 1, '祸首：南蛮对他人仍造成 1 点伤害');
  ok(g.logs.some(l => /祸首/.test(l.text)), '缺少祸首日志');
}
{
  const g = mk(['menghuo', 'simayi'], (gg, p, req) => (req.kind === 'confirm' ? { yes: true } : null));
  const mh = g.players[0];
  mh.hp = mh.maxHp - 2;
  g.deck.unshift(card('r1', 'tao', 'heart', 7), card('r2', 'sha', 'spade', 3));
  const hp0 = mh.hp;
  await g.trigger('phase.begin', { self: mh, player: mh, phase: 'draw' });
  ok(mh.flags.skipDraw === true, '再起：应设置跳过正常摸牌标记');
  ok(mh.hp === Math.min(mh.maxHp, hp0 + 1), `再起：亮出牌中 1 张红桃应回复 1 点体力（${hp0} → ${mh.hp}）`);
  ok(g.logs.some(l => /再起/.test(l.text)), '缺少再起日志');
}

// ================= 7. 孙坚 · 英魂 =================
{
  const g = mk(['sunjian', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 0 };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const sj = g.players[0], t = g.players[1];
  sj.hp = sj.maxHp - 2;
  const h0 = t.hand.length;
  await g.trigger('phase.begin', { self: sj, player: sj, phase: 'prepare' });
  ok(t.hand.length === h0 + 1, `英魂：选项 1 目标应净增 1 张（摸 2 弃 1，${h0} → ${t.hand.length}）`);
  ok(g.logs.some(l => /英魂/.test(l.text)), '缺少英魂日志');
}

// ================= 8. 鲁肃 · 好施 / 缔盟 =================
{
  const g = mk(['lusu', 'simayi'], (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'cards') return { cardIds: p.hand.slice(0, 3).map(c => c.id) };
    return null;
  });
  const ls = g.players[0], t = g.players[1];
  const h0 = ls.hand.length;
  await g.trigger('phase.begin', { self: ls, player: ls, phase: 'draw' });
  ok(ls.hand.length === h0 + 2, `好施：应额外摸 2 张（${h0} → ${ls.hand.length}）`);
  ok(ls.flags.haoshi === g.turnCount, '好施：应记录本回合已发动');
}
{
  const g = mk(['lusu', 'simayi', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1, 2] };
    if (req.kind === 'cards') return { cardIds: p.hand.slice(0, 2).map(c => c.id) };
    return null;
  });
  const ls = g.players[0], a = g.players[1], b = g.players[2];
  g.phase = 'play';
  a.hand = [card('a1', 'sha', 'spade', 3)];
  b.hand = [card('b1', 'shan', 'heart', 2), card('b2', 'tao', 'heart', 4), card('b3', 'jiu', 'club', 9)];
  const ah = a.hand.length, bh = b.hand.length;
  await g.useActiveSkill(ls, 'dimeng');
  ok(a.hand.length === bh && b.hand.length === ah, `缔盟：应交换手牌（${ah}/${bh} → ${a.hand.length}/${b.hand.length}）`);
  ok(g.logs.some(l => /缔盟/.test(l.text)), '缺少缔盟日志');
}

// ================= 9. 董卓 · 酒池 / 肉林 / 崩坏 =================
{
  const g = mk(['dongzhuo', 'simayi']);
  const dz = g.players[0];
  ok(g.virtualAllowed(dz, [card('j1', 'sha', 'spade', 8)], 'jiu') === true, '酒池：黑桃手牌可当酒');
  ok(g.virtualAllowed(dz, [card('j2', 'sha', 'heart', 8)], 'jiu') === false, '酒池：红桃手牌不可当酒');
}
{
  let extra = 0;
  const g = mk(['dongzhuo', 'simayi'], (gg, p, req) => {
    if (req.kind === 'card') { extra++; return null; }
    return null;
  });
  const dz = g.players[0];
  await g.trigger('dodge.after', { self: dz, player: dz, from: g.players[1], card: card('s1', 'sha', 'spade', 5) });
  ok(extra >= 1, `肉林：董卓被【杀】时应追加一次【闪】询问（实际 ${extra}）`);
}
{
  const g = mk(['dongzhuo', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 1 };  // 减体力上限
    return null;
  });
  const dz = g.players[0];
  g.players[1].hp = 2;
  const mx = dz.maxHp;
  await g.trigger('phase.begin', { self: dz, player: dz, phase: 'end' });
  ok(dz.maxHp === mx - 1, `崩坏：应减 1 点体力上限（${mx} → ${dz.maxHp}）`);
  ok(g.logs.some(l => /崩坏/.test(l.text)), '缺少崩坏日志');
}

// ================= 10. 贾诩 · 乱武 / 帷幕 / 完杀 =================
{
  const g = mk(['jiaxu', 'simayi', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'choice' || req.kind === 'choose') return { index: 1 };  // 一律选失去体力
    if (req.kind === 'targets') return { seats: [1] };
    return null;
  });
  const jx = g.players[0];
  g.phase = 'play';
  const h1 = g.players[1].hp, h2 = g.players[2].hp;
  await g.useActiveSkill(jx, 'luanwu');
  ok(g.players[1].hp === h1 - 1 && g.players[2].hp === h2 - 1, '乱武：其他角色各失去 1 点体力');
  ok(jx.flags.luanwuUsed === true, '乱武：应标记为已使用（限定技）');
  await g.useActiveSkill(jx, 'luanwu');
  ok(g.logs.some(l => /本局已使用过/.test(l.text)), '乱武：第二次发动应被拒绝（限定技每局一次）');
}
{
  const g = mk(['jiaxu', 'sunquan'], (gg, p, req) => null);
  const jx = g.players[0];
  const black = card('bl1', 'guohe', 'spade', 3);
  const data = { self: g.players[1], player: g.players[1], card: black, target: jx, canceled: false };
  await g.trigger('target.before', data);
  ok(data.canceled === true, '帷幕：黑色锦囊指定贾诩时应被取消');
  const data2 = { self: g.players[1], player: g.players[1], card: black, target: g.players[1], canceled: false };
  await g.trigger('target.before', data2);
  ok(data2.canceled === false, '帷幕：其他角色不受影响');
  const red = card('rd1', 'guohe', 'heart', 3);
  const data3 = { self: g.players[1], player: g.players[1], card: red, target: jx, canceled: false };
  await g.trigger('target.before', data3);
  ok(data3.canceled === false, '帷幕：红色锦囊仍可指定贾诩');
}
{
  // 完杀：贾诩回合内，非濒死者不能出桃
  let taoAsk = 0;
  const g = mk(['jiaxu', 'simayi', 'sunquan'], (gg, p, req) => {
    if (req.kind === 'card' && req.reason === 'dying') { taoAsk++; return null; }
    return null;
  });
  const jx = g.players[0], dyingP = g.players[1];
  g.turnPlayer = jx;
  jx.skills = [...jx.skills];
  g.players[1].hand.push(card('k1', 'tao', 'heart', 5));
  g.players[2].hand.push(card('k2', 'tao', 'heart', 6));
  dyingP.hp = 0;
  await g.dying(dyingP);
  ok(taoAsk <= 2, `完杀：只应询问贾诩与濒死者（实际询问 ${taoAsk} 次，含濒死者 1 次）`);
  ok(dyingP.alive === false, '完杀：无人出桃应阵亡');
}

// ================= 汇总 =================
console.log(`\n=== lincheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
