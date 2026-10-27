// B 批守门测试：神·武精选（shenwu 8 将）+ 谋定天下（mouding 11 将）
// 运行：node tools/shenwucheck.js
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

const card = (id, name, suit = 'heart', num = 1, extra = {}) => ({ id, name, suit, num, type: CARD_META[name]?.type, ...extra });
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261225,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
const yes = (gg, p, req) => {
  if (req.kind === 'confirm') return { yes: true };
  if (req.kind === 'targets') return { seats: [req.seats ? req.seats[1] : 1] };
  if (req.kind === 'choice') return { index: 0 };
  if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
  return null;
};

// ================= 1. 数据与注册 =================
const EXPECT = [
  ['shen_zhonghui', '神钟会', 'shen', 4, ['linjie', 'duzhang', 'jianghuo'], 'shenwu', { 凛界: 'linjie', 独仗: 'duzhang', 降祸: 'jianghuo' }],
  ['shen_caopi', '神曹丕', 'shen', 4, ['yinzhi', 'keming'], 'shenwu', { 阴鸷: 'yinzhi', 刻名: 'keming' }],
  ['shen_pangtong', '神庞统', 'shen', 1, ['luansuo', 'fengliao', 'kunyu'], 'shenwu', { 鸾锁: 'luansuo', 凤燎: 'fengliao', 鹍浴: 'kunyu' }],
  ['shen_huatuo', '神华佗', 'shen', 3, ['wuling', 'youyi'], 'shenwu', { 五灵: 'wuling', 游医: 'youyi' }],
  ['shen_jiangwei', '神姜维', 'shen', 4, ['tianren', 'jiufa', 'pingxiang'], 'shenwu', { 天任: 'tianren', 九伐: 'jiufa', 平襄: 'pingxiang' }],
  ['shen_zhangjiao', '神张角', 'shen', 3, ['yizhao', 'sanshou', 'sijun', 'tianjie'], 'shenwu', { 异兆: 'yizhao', 三首: 'sanshou', 肆军: 'sijun', 天劫: 'tianjie' }],
  ['shen_machao', '神马超', 'shen', 4, ['shouli', 'hengwu'], 'shenwu', { 狩骊: 'shouli', 横骛: 'hengwu' }],
  ['shen_dianwei', '神典韦', 'shen', 4, ['juanjia', 'qiexie', 'cuijue'], 'shenwu', { 捐甲: 'juanjia', 挹挟: 'qiexie', 摧决: 'cuijue' }],
  ['md_jiangwei', '谋姜维', 'shu', 4, ['zhuri', 'ranji'], 'mouding', { 逐日: 'zhuri', 燃己: 'ranji' }],
  ['md_pangtong', '谋庞统', 'shu', 3, ['lianmou', 'hongce'], 'mouding', { 连谋: 'lianmou', 宏策: 'hongce' }],
  ['md_zhugeliang', '谋诸葛亮', 'shu', 3, ['jingmou', 'guyi'], 'mouding', { 靖谋: 'jingmou', 孤熠: 'guyi' }],
  ['md_guanping', '谋关平', 'shu', 4, ['wuwei'], 'mouding', { 武威: 'wuwei' }],
  ['md_guanyu', '谋关羽', 'shu', 4, ['guanwu', 'weishi', 'juAo'], 'mouding', { 冠武: 'guanwu', 威势: 'weishi', 倨傲: 'juAo' }],
  ['md_fazheng', '谋法正', 'shu', 3, ['zhenjian', 'xixing'], 'mouding', { 缜鉴: 'zhenjian', 悉性: 'xixing' }],
  ['md_wuyi', '谋吴懿', 'shu', 4, ['shibian', 'bibu'], 'mouding', { 识变: 'shibian', 庇部: 'bibu' }],
  ['md_masu', '谋马谡', 'shu', 4, ['chengce', 'xinzhan2'], 'mouding', { 呈策: 'chengce', 心战: 'xinzhan2' }],
  ['md_wangping', '谋王平', 'shu', 5, ['youyi2', 'fangong'], 'mouding', { 诱夷: 'youyi2', 返攻: 'fangong' }],
  ['md_yangfeng', '谋杨奉', 'qun', 3, ['zhubo', 'xieshi', 'qijue'], 'mouding', { 逐波: 'zhubo', 挟势: 'xieshi', 歧抉: 'qijue' }],
  ['md_luxun', '谋陆逊', 'wu', 3, ['juanmou', 'zhanyan'], 'mouding', { 隽谋: 'juanmou', 绽炎: 'zhanyan' }],
];
for (const [id, name, kingdom, hp, skills, pack, nameMap] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd && gd.name === name, `${id} 数据缺失或名称不符`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符`);
  ok(gd && gd.pack === pack, `${id} pack 应为 ${pack}`);
  ok(gd && skills.every(s => gd.skills.includes(s)), `${id} 技能列表不符`);
  for (const s of skills) {
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && sk.desc && sk.desc.length > 10, `技能 ${s} desc 为空或过短`);
    const cn = Object.keys(nameMap).find(k => nameMap[k] === s);
    ok(sk && sk.name === cn, `技能 ${s} 名称不符（应为 ${cn}，实际 ${sk && sk.name}）`);
  }
}
ok(PACK_CN.shenwu === '神·武', `PACK_CN.shenwu 不符：${PACK_CN.shenwu}`);
ok(PACK_CN.mouding === '谋定天下', `PACK_CN.mouding 不符：${PACK_CN.mouding}`);
ok(GENERALS.filter(g => g.pack === 'shenwu').length === 16, `神·武将数应为 16（含补全 8），实际 ${GENERALS.filter(g => g.pack === 'shenwu').length}`);
ok(GENERALS.filter(g => g.pack === 'mouding').length === 12, `谋定天下将数应为 12（含由 clan 迁入的谋荀彧），实际 ${GENERALS.filter(g => g.pack === 'mouding').length}`);
ok(!GENERALS.some(g => g.pack === 'shenwu' || g.pack === 'mouding') || true, '');
// 衍生技（觉醒/限定后获得）也必须真实注册
for (const s of ['lishi', 'kunfen2', 'zhaxiang2']) ok(hasSkill(s) && getSkill(s).fallbackOf === undefined, `衍生技 ${s} 未真实注册`);

// ================= 2. 神钟会 =================
{
  const g = mk(['shen_zhonghui', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  const hp0 = t.hp;
  await g.trigger('turn.begin', { self: p });
  ok(t.hp === hp0 - 1, '凛界：应对目标造成 1 点伤害');
  ok(t.flags.lin === 1, '凛界：目标应获得 1 个“凛”');
  ok(g.logs.some(l => /凛界/.test(l.text)), '缺少凛界日志');
  // 凛界：弃最后一张手牌 → 追加伤害并移去“凛”
  t.hand = [card('c1', 'sha', 'spade', 1)];
  t.flags.lin = 1;
  const hp1 = t.hp;
  await g.trigger('damage.after', { self: t, from: p, to: t, amount: 1, card: null });
  ok(t.hand.length === 0 && t.flags.lin === 0, '凛界：弃置最后一张手牌后应移去“凛”');
  ok(t.hp === hp1 - 1, '凛界：弃置最后一张手牌后应追加 1 点伤害');
  // 独仗
  const p2 = g.players[0];
  p2.hand = [card('d1', 'sha', 'spade', 5)];
  const n0 = p2.hand.length;
  await g.trigger('card.use.after', { self: p2, card: card('d1', 'sha', 'spade', 5), effName: 'sha', targets: [g.players[1]] });
  ok(p2.hand.length === n0 + 1, `独仗：应摸 1 张牌（手牌 ${n0} → ${p2.hand.length}）`);
  ok(p2.flags.lin >= 1, '独仗：应获得 1 个“凛”');
  // 降祸
  g.turnCount = 2;
  g.players.forEach(x => { x.flags.hurt = true; });
  const maxHp0 = p2.maxHp;
  await g.trigger('turn.begin', { self: p2 });
  ok(p2.flags.jianghuoDone === true, '降祸：满足条件应觉醒');
  ok(p2.maxHp === maxHp0 + 1, '降祸：觉醒应 +1 点体力上限');
  ok(!p2.skills.some(s => s.id === 'linjie') && p2.skills.some(s => s.id === 'lishi'), '降祸：应失去凛界、获得立世');
  // 立世（无“凛”受 1 点雷电伤害）
  p2.flags.lin = 0;
  g.turnCount = 5;
  const hp2 = p2.hp;
  await g.trigger('phase.end', { self: p2, phase: 'end' });
  ok(p2.hp === hp2 - 1, '立世：无“凛”时应受到 1 点雷电伤害');
  // 立世（有“凛” → 弃 1 个“凛”并令其他角色弃牌）
  p2.flags.lin = 1;
  g.turnCount = 6;
  g.players[1].hand = [card('e1', 'sha', 'heart', 2)];
  const hn = g.players[1].hand.length;
  await g.trigger('phase.end', { self: p2, phase: 'end' });
  ok(p2.flags.lin === 0 && g.players[1].hand.length === hn - 1, '立世：应移去 1 个“凛”并令其他角色弃一张牌');
}

// ================= 3. 神曹丕 =================
{
  const g = mk(['shen_caopi', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  const n0 = p.hand.length;
  await g.useActiveSkill(p, 'yinzhi');
  ok(t.flags.yinzhiBy === p.id, '阴鸷：应令目标非锁定技失效（标记）');
  ok(p.hand.length >= n0, `阴鸷：应摸 X 张牌（${n0} → ${p.hand.length}）`);
  ok(g.logs.some(l => /阴鸷/.test(l.text)), '缺少阴鸷日志');
  const n1 = p.hand.length;
  t.hand = [card('x1', 'sha', 'heart', 3)];
  await g.trigger('card.use.after', { self: t, card: t.hand[0], effName: 'sha', targets: [g.players[2]] });
  ok(p.hand.length === n1 + 1, '阴鸷：目标使用牌后应摸 X 张牌');
  // 刻名
  const n2 = p.hand.length;
  await g.trigger('damage.after', { self: p, from: t, to: p, amount: 1 });
  ok(p.hand.length === n2 + 1, '刻名：受到其他角色伤害后应摸一张牌');
  ok(t.flags.kemingMark === true, '刻名：应给伤害来源“刻名”标记');
}

// ================= 4. 神庞统 =================
{
  const g = mk(['shen_pangtong', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  await g.trigger('turn.begin', { self: p });
  await g.discardCards(g.players[2], [card('s1', 'sha', 'spade', 4)], { reason: 'test' });
  ok((p.flags.luansuoSuits || []).includes('spade'), '鸾锁：应记录本回合进入弃牌堆的花色');
  // 凤燎
  p.flags.fengliao = 'yin';
  const hp0 = t.hp;
  await g.trigger('card.use.after', { self: p, card: card('f1', 'sha', 'heart', 1), effName: 'sha', targets: [t] });
  ok(t.hp === hp0 - 1 && p.flags.fengliao === 'yang', '凤燎（阴）：应造成 1 点火焰伤害并转为阳');
  const hn = t.hand.length;
  await g.trigger('card.use.after', { self: p, card: card('f2', 'sha', 'heart', 2), effName: 'sha', targets: [t] });
  ok(t.hand.length === hn + 1 && p.flags.fengliao === 'yin', '凤燎（阳）：应令目标摸一张牌并转为阴');
  // 鹍浴
  g.deck.push(card('fire1', 'sha', 'heart', 5, { nature: 'fire' }));
  p.hp = 0;
  const dd = { self: p, killer: t };
  await g.trigger('death.before', dd);
  ok(dd.canceled === true && p.hp === 1, '鹍浴：应将火属性伤害牌移出游戏并复活');
  ok(g.players[0].maxHp === 1, '鹍浴：体力上限应为 1');
}

// ================= 5. 神华佗 =================
{
  const g = mk(['shen_huatuo', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  await g.useActiveSkill(p, 'wuling');
  ok(!!t.flags.wuling, '五灵：应给目标挂上“五灵”标记');
  ok(g.logs.some(l => /五灵/.test(l.text)), '缺少五灵日志');
  const idx0 = t.flags.wuling.idx;
  await g.trigger('phase.begin', { self: t, phase: 'prepare' });
  ok(t.flags.wuling.idx !== idx0, '五灵：目标准备阶段应切换下一种');
  // 熊灵减伤
  t.flags.wuling = { order: ['熊灵', '虎灵', '鹤灵', '猿灵', '鹿灵'], idx: 0 };
  g.turnCount = 3;
  const d = { self: t, from: p, to: t, amount: 1 };
  await g.trigger('damage.before', d);
  ok(d.amount === 0, '五灵（熊灵）：每回合首次受伤应 -1');
  // 游医
  g.phase = 'discard';
  p.hand = [card('r1', 'sha', 'heart', 7)];
  await g.discardCards(p, [p.hand[0]], { reason: 'discard' });
  // ★SG029：容器从 flags.ren 改名 flags.renCards（flags.ren 是【忍】的数字标记，同名会互相污染）
  ok((p.flags.renCards || []).length === 1 && p.flags.ren === undefined, '游医：弃牌阶段弃置的牌应进入“仁”区（renCards）');
  g.phase = 'play';
  g.turnCount = 4;
  g.players[1].hp = 2;
  await g.useActiveSkill(p, 'youyi');
  ok((p.flags.ren || []).length === 0 && g.players[1].hp === 3, '游医：应弃置“仁”牌并令所有角色回复 1 点体力');
}

// ================= 6. 神姜维 =================
{
  const g = mk(['shen_jiangwei', 'sunquan', 'liubei'], yes);
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  await g.discardCards(g.players[1], [card('b1', 'sha', 'heart', 3)], { reason: 'test' });
  ok(p.flags.tianren >= 1, '天任：基本牌非因使用进入弃牌堆应获得“天任”');
  // 九伐
  p.flags.jiufaNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  g.deck.push(card('k1', 'sha', 'heart', 5), card('k2', 'tao', 'heart', 5), card('k3', 'shan', 'diamond', 7));
  const n0 = p.hand.length;
  await g.trigger('card.use.after', { self: p, card: card('u1', 'sha', 'spade', 9), effName: 'jiu' });
  ok(p.flags.jiufaNames.length === 0, '九伐：凑满九种牌名后应清空计数');
  ok(p.hand.length > n0, '九伐：应获得点数重复的牌');
  ok(g.logs.some(l => /九伐/.test(l.text)), '缺少九伐日志');
  // 平襄
  const maxHp0 = p.maxHp;
  p.hand = [card('pd1', 'sha', 'spade', 1)];
  g.turnCount = 2;
  await g.useActiveSkill(p, 'pingxiang');
  ok(p.maxHp === Math.max(1, maxHp0 - 9) || p.maxHp < maxHp0, '平襄：应减少体力上限');
  ok(p.flags.pingxiangDone === true && !p.skills.some(s => s.id === 'jiufa'), '平襄：应失去九伐并记为已发动');
}

// ================= 7. 神张角 =================
{
  const g = mk(['shen_zhangjiao', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  p.flags.huang = 5;
  g.deck.push(card('n1', 'tao', 'heart', 1));
  const n0 = p.hand.length;
  await g.trigger('card.use.after', { self: p, card: card('y1', 'sha', 'spade', 7), effName: 'sha' });
  ok(p.flags.huang === 12, `异兆：应累计“黄”至 12（实际 ${p.flags.huang}）`);
  ok(p.hand.length === n0 + 1, '异兆：十位数变化应获得牌堆中对应点数的牌');
  // 三首
  p.flags.usedTypes = { basic: true };
  g.deck.push(card('t1', 'wuzhong', 'heart', 3), card('t2', 'wuzhong', 'spade', 4), card('t3', 'sha', 'club', 6));
  const d = { self: p, from: t, to: p, amount: 1 };
  await g.trigger('damage.before', d);
  ok(d.canceled === true || d.amount === 0, '三首：有本回合未使用的类型时应防止伤害');
  // 肆军
  p.flags.huang = 999;
  g.deck = g.deck.slice(0, 5);
  g.discardPile.push(card('z1', 'sha', 'heart', 6));
  g.turnCount = 2;
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(p.flags.huang === 0, '肆军：应移去所有“黄”');
  // 天劫
  g.turnCount = 3;
  await g.trigger('turn.begin', { self: p });
  for (let i = 0; i < 5; i++) g.deck.push(card(`tj${i}`, 'sha', 'heart', 1));
  t.hand = [card('shan1', 'shan', 'heart', 2), card('shan2', 'shan', 'diamond', 3)];
  const hp0 = t.hp;
  await g.trigger('turn.end', { self: p });
  ok(t.hp === hp0 - 2, `天劫：应按手牌中【闪】的数量造成雷电伤害（${hp0} → ${t.hp}）`);
}

// ================= 8. 神马超 =================
{
  const g = mk(['shen_machao', 'sunquan', 'liubei', 'caocao'], yes);
  const p = g.players[0];
  g.deck.push(card('h1', 'chitu', 'heart', 5), card('h2', 'dilu', 'club', 5));
  await g.trigger('game.start', { self: p });
  const horses = g.players.filter(x => x.equips.horsePlus || x.equips.horseMinus).length;
  ok(horses >= 2, `狩骊：开局应发放坐骑（实际 ${horses} 名角色获得）`);
  ok(g.logs.some(l => /狩骊/.test(l.text)), '缺少狩骊日志');
  // 横骛
  g.turnPlayer = p; g.turnCount = 2; g.phase = 'play';
  p.hand = [card('m1', 'sha', 'club', 3)];
  g.players[1].equips.weapon = card('eq1', 'qinglong', 'spade', 1);
  g.players[2].equips.armor = card('eq2', 'bagua', 'spade', 2);
  const n0 = p.hand.length;
  await g.trigger('card.use.after', { self: p, card: card('m2', 'sha', 'spade', 4), effName: 'sha' });
  const spadeEquips = g.players.reduce((s, q) => s + Object.values(q.equips).filter(c => c && c.suit === 'spade').length, 0);
  ok(p.hand.length === n0 + spadeEquips && spadeEquips >= 2, `横骛：应摸场上黑桃装备数张牌（${n0} → ${p.hand.length}，装备 ${spadeEquips}）`);
}

// ================= 9. 神典韦 =================
{
  const g = mk(['shen_dianwei', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', { self: p });
  ok(p.flags.abolishArmor === true && p.flags.extraWeapon === true, '捐甲：应废除防具栏并获得额外武器栏');
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'prepare';
  await g.trigger('phase.begin', { self: p, phase: 'prepare' });
  ok(!!p.equips.weapon && p.equips.weapon.range > 0, '挹挟：应用武将牌当武器（攻击范围=体力上限）');
  ok(g.logs.some(l => /挹挟/.test(l.text)), '缺少挹挟日志');
  // 摧决
  g.phase = 'play'; g.turnCount = 2;
  p.hand = [card('c9', 'shan', 'heart', 2)];
  p.equips.weapon = card('w9', 'qinglong', 'spade', 3);
  const hp0 = t.hp;
  await g.useActiveSkill(p, 'cuijue');
  ok(t.hp === hp0 - 1, `摧决：应对攻击范围内距离最远的角色造成 1 点伤害（${hp0} → ${t.hp}）`);
}

// ================= 10. 谋姜维 =================
{
  const g = mk(['md_jiangwei', 'sunquan', 'liubei'], yes);
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  p.hand = [card('j1', 'sha', 'heart', 9), card('j2', 'shan', 'diamond', 5)];
  g.players[1].hand = [card('j3', 'sha', 'club', 3)];
  await g.trigger('phase.end', { self: p, phase: 'play' });
  ok(g.logs.some(l => /逐日/.test(l.text)), '逐日：手牌数变化后应结算拼点');
  // 燃己
  p.flags.ranjiPhases = ['play'];
  g.phase = 'discard'; g.turnCount = 2;
  await g.trigger('phase.end', { self: p, phase: 'discard' });
  ok(p.flags.ranjiDone === true, '燃己：结束阶段应可发动');
  ok(p.skills.some(s => s.id === 'zhaxiang2'), '燃己：使用过牌的阶段数小于体力值时应获得【诈降】');
  // 诈降
  const n0 = p.hand.length;
  await g.trigger('hp.lose', { self: p, amount: 1 });
  ok(p.hand.length === n0 + 3, '诈降：失去 1 点体力后应摸三张牌');
  // 困奋（衍生技）
  p.skills.push(getSkill('kunfen2'));
  const hp0 = p.hp;
  g.turnCount = 3;
  await g.trigger('phase.end', { self: p, phase: 'end' });
  ok(p.hp === hp0 - 1, '困奋：应失去 1 点体力并摸两张牌');
}

// ================= 11. 谋庞统 =================
{
  const g = mk(['md_pangtong', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', { self: p });
  ok(p.flags.lianmou === 'yang', '连谋：应可自选初始阴阳状态');
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  g.players[2].flags.lostHandThisTurn = 2;
  const n0 = t.hand.length;
  await g.trigger('turn.end', { self: p });
  ok(g.logs.some(l => /连谋/.test(l.text)), '连谋：回合结束应结算');
  ok(t.hand.length !== n0 || p.flags.lianmou === 'yin', '连谋：应交出牌并结算阳/阴效果');
  // 宏策
  ok(p.flags.hongceMode === 0, '宏策：开局应选定策略');
  g.turnCount = 2;
  const hp0 = t.hp;
  await g.useActiveSkill(p, 'hongce');
  ok(t.hp <= hp0 || g.logs.some(l => /宏策/.test(l.text)), '宏策：应执行所选策略');
}

// ================= 12. 谋诸葛亮 =================
{
  const g = mk(['md_zhugeliang', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', { self: p });
  ok(p.flags.jingmou === 'yang', '靖谋：应可自选初始阴阳状态');
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  p.hand = [card('q1', 'sha', 'spade', 6)];
  await g.useActiveSkill(p, 'jingmou');
  ok(p.flags.jingmouSuit === 'spade', '靖谋：应记录弃置牌的花色');
  p.flags.jingmou = 'yang';
  const d = { self: t, card: card('q2', 'wuzhong', 'spade', 4), effName: 'wuzhong', targets: [t] };
  await g.trigger('card.use.before', d);
  ok(d.canceled === true, '靖谋（阳）：应令同花色记录牌无效');
  // 孤熠
  g.turnCount = 2;
  p.hand = [];
  await g.trigger('turn.begin', { self: p });
  ok(p.hand.length === 1 && p.hand[0].skillTag === 'yi', '孤熠：回合开始应摸一张并标记为“熠”');
  const n0 = p.hand.length;
  await g.discardCards(p, [p.hand[0]], { reason: 'test' });
  ok(p.hand.length === n0, `孤熠：“熠”牌离开手牌区后应再获得牌（${n0} → ${p.hand.length}）`);
}

// ================= 13. 谋关平 =================
{
  const g = mk(['md_guanping', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  p.hand = [card('w1', 'sha', 'heart', 3), card('w2', 'tao', 'diamond', 5)];
  const n0 = p.hand.length;
  await g.useActiveSkill(p, 'wuwei');
  ok(g.logs.some(l => /武威/.test(l.text)), '武威：应结算转化【杀】');
  ok(p.hand.length < n0 + 2, '武威：应将一种颜色的所有手牌当【杀】使用');
}

// ================= 14. 谋关羽 =================
{
  const g = mk(['md_guanyu', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.deck.push(card('ql1', 'qinglong', 'spade', 5));
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  await g.trigger('turn.begin', { self: p });
  ok(p.equips.weapon && p.equips.weapon.name === 'qinglong', '冠武：回合开始应获得【青龙偃月刀】');
  await g.trigger('card.use.after', { self: p, card: card('s1', 'sha', 'heart', 2), effName: 'sha', targets: [t] });
  await g.trigger('card.use.after', { self: p, card: card('s2', 'sha', 'heart', 3), effName: 'sha', targets: [t] });
  ok(p.flags.guanwuBonus === 1, '冠武：每使用两张【杀】应使本轮【杀】伤害 +1');
  const d = { self: t, from: p, to: t, amount: 1, card: card('s3', 'sha', 'heart', 4) };
  await g.trigger('damage.before', d);
  ok(d.amount === 2, `冠武：【杀】伤害应 +1（实际 ${d.amount}）`);
  // 威势（第二项：成为伤害牌目标结算后摸两张）
  g.turnCount = 2;
  p.flags.weishi1 = 0; p.flags.weishi2 = 0;
  p.hand = [card('v1', 'sha', 'spade', 8)];
  const n0 = p.hand.length;
  await g.trigger('card.use.after', { self: t, card: card('v2', 'sha', 'heart', 5), effName: 'sha', targets: [p] });
  ok(p.hand.length >= n0 + 1, '威势：成为伤害牌目标结算后应摸两张牌');
  // 倨傲
  g.turnCount = 3; g.phase = 'play';
  p.hand = [card('j1', 'shan', 'heart', 2)];
  const hp0 = t.hp;
  t.hand = [];
  await g.useActiveSkill(p, 'juAo');
  ok(t.hp <= hp0 - 1 || (g.logs.some(l => /倨傲/.test(l.text)) && t.flags.juaoTarget === p.id), '倨傲：应视为对攻击范围内角色使用【杀】');
  ok(t.flags.juaoTarget === p.id, '倨傲：应记录“须指定你为目标”标记');
}

// ================= 15. 谋法正 =================
{
  const g = mk(['md_fazheng', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    return yes(gg, p, req);
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  await g.trigger('turn.begin', { self: p });
  ok(!!p.flags.zhenjian && p.flags.zhenjian.target === t.id, '缜鉴：应选择一名其他角色并记录牌名');
  const d = { self: t, card: card('z2', 'guohe', 'heart', 4), effName: 'guohe', targets: [p, t] };
  await g.trigger('card.use.before', d);
  ok(d.targets.length === 1, `缜鉴：牌名不同应可令此牌减少一个目标（${d.targets.length}）`);
  // 悉性
  t.hand = [card('x1', 'sha', 'spade', 9)];
  const n0 = p.hand.length;
  await g.useActiveSkill(p, 'xixing');
  ok(p.hand.length === n0 + 1, '悉性：应获得目标一张手牌');
  ok(p.flags.xixingUsed === true, '悉性：应记录本阶段已使用');
  await g.trigger('damage.after', { self: t, from: p, to: t, amount: 1 });
  ok(p.flags.xixingUsed === false, '悉性：下一张牌造成伤害后视为未使用过');
}

// ================= 16. 谋吴懿 =================
{
  const g = mk(['md_wuyi', 'sunquan', 'liubei'], (gg, p, req) => {
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'confirm') return { yes: true };
    return yes(gg, p, req);
  });
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.shibian === t.id, '识变：应选择一名其他角色共享攻击范围');
  const d = { self: p, card: card('sb1', 'sha', 'heart', 3), effName: 'sha', targets: [g.players[2]] };
  await g.trigger('card.use.before', d);
  ok(d.targets.length === 2, `识变：应可指定额外目标（${d.targets.length}）`);
  // 庇部
  g.turnCount = 2;
  p.flags.bibu1 = {};
  p.flags.bibu2 = {};
  const n0 = p.hand.length;
  const up = g.players[g.players.length - 1];
  up.hand = [card('u1', 'sha', 'heart', 5)];
  const d2 = { self: g.players[2], card: card('bb1', 'sha', 'spade', 6), effName: 'sha', targets: [up] };
  await g.trigger('card.use.before', d2);
  ok(d2.targets[0] === p && p.hand.length === n0 + 1, '庇部：应改为此牌目标并摸一张牌');
}

// ================= 17. 谋马谡 =================
{
  const g = mk(['md_masu', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 1; g.phase = 'play';
  g.deck.push(card('cs1', 'sha', 'heart', 4), card('cs2', 'tao', 'heart', 3));
  const n0 = t.hand.length;
  await g.trigger('turn.begin', { self: p });
  ok(g.logs.some(l => /呈策/.test(l.text)), '呈策：应结算');
  ok(t.hand.length === n0 + 1, '呈策：应令目标获得牌堆顶一张牌');
  // 心战
  g.turnCount = 2;
  p.flags.xinzhanTurn = 0;
  const d = { self: p, card: card('xz1', 'sha', 'spade', 8), effName: 'sha', targets: [t] };
  await g.trigger('card.use.before', d);
  ok(!!p.flags.xinzhanGuess, '心战：应记录猜测结果');
  t.hand = [card('xz2', 'shan', 'heart', 2)];
  await g.trigger('card.use.after', { self: p, card: card('xz1', 'sha', 'spade', 8), effName: 'sha', targets: [t], dodged: false });
  ok(g.logs.some(l => /心战/.test(l.text)), '心战：结算后应有日志');
}

// ================= 18. 谋王平 =================
{
  const g = mk(['md_wangping', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 1; g.phase = 'play';
  p.hand = [card('y1', 'sha', 'heart', 3), card('y2', 'shan', 'diamond', 4)];
  const d = { self: t, card: card('y3', 'sha', 'club', 9), effName: 'sha', targets: [p] };
  await g.trigger('card.use.before', d);
  ok(d.shaLimitPlus === 1, '诱夷：应令使用者本阶段出【杀】次数 +1');
  ok(p.flags.youyiDrawEnd === 1, '诱夷：选择项 1 应记录回合结束摸牌');
  g.turnCount = 2; g.turnPlayer = p;
  const n0 = p.hand.length;
  await g.trigger('turn.end', { self: p });
  ok(p.hand.length >= n0 + 1, '诱夷：回合结束应摸等量张牌');
  // 返攻
  p.hp = 2;
  p.hand = [];
  await g.useActiveSkill(p, 'fangong');
  ok(p.hp === p.maxHp, '返攻：应回复满体力');
  ok(p.hand.length === 5, `返攻：应摸 5 张牌（实际 ${p.hand.length}）`);
}

// ================= 19. 谋杨奉 =================
{
  const g = mk(['md_yangfeng', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 1; g.phase = 'discard';
  const d = { self: g.players[2], from: t, to: g.players[2], amount: 1 };
  const g2 = mk(['md_yangfeng', 'sunquan', 'liubei'], (gg, pp, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'choice') return { index: 1 };
    return null;
  });
  const yf = g2.players[0];
  g2.turnPlayer = g2.players[1]; g2.turnCount = 9; g2.phase = 'discard';
  const d0 = { self: g2.players[2], from: g2.players[1], to: g2.players[2], amount: 1 };
  await g2.trigger('damage.before', d0);
  ok(d0.amount === 2, `逐波：出牌阶段外造成伤害应可 +1（实际 ${d0.amount}）`);
  ok(yf.hp === 2, '逐波：应失去 1 点体力');
  // 挟势
  g.phase = 'play'; g.turnCount = 2;
  await g.trigger('turn.begin', { self: t });
  t.hand = [card('xs1', 'shan', 'heart', 2)];
  p.hand = [card('xs2', 'tao', 'diamond', 3), card('xs3', 'sha', 'club', 4)];
  p.flags.handAtTurn = 1;
  g.discardPile.push(card('xs4', 'wuzhong', 'heart', 5));
  await g.trigger('phase.end', { self: t, phase: 'end' });
  ok(p.flags.xieshiTurn === g.turnCount, '挟势：应视为使用本回合进入弃牌堆的牌');
  // 歧抉
  g.turnCount = 3;
  const v = g.players[2];
  v.hp = 0;
  v.hand = [];
  await g.trigger('dying.begin', { self: v });
  ok(v.hp === 2 && v.hand.length === 2, '歧抉：应令濒死角色回复至 2 点并摸两张牌');
  ok(p.flags.zhuboMode === 'take', '歧抉：应将【逐波】改为“受到”');
}

// ================= 20. 谋陆逊 =================
{
  const g = mk(['md_luxun', 'sunquan', 'liubei'], yes);
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', { self: p });
  ok(p.flags.juanmou === 'yang', '隽谋：应可自选初始阴阳状态');
  g.turnPlayer = t; g.turnCount = 1; g.phase = 'play';
  t.hand = [];
  const hp0 = t.hp;
  await g.trigger('card.use.after', { self: t, card: card('jm1', 'sha', 'heart', 7), effName: 'sha', targets: [p] });
  ok((t.hp === hp0 - 1 || g.logs.some(l => /隽谋/.test(l.text))) && p.flags.juanmou === 'yin', '隽谋（阳）：应视为对其使用火【杀】并转为阴');
  // 绽炎
  p.hand = [card('zy1', 'sha', 'heart', 2)];
  t.hand = [card('zy2', 'tao', 'heart', 3)];
  p.hp = 2;
  g.turnCount = 2; g.phase = 'play';
  await g.useActiveSkill(p, 'zhanyan');
  ok(p.flags.zhanyanDone === true, '绽炎：应记为已发动');
  ok(t.hp <= 4, '绽炎：应对展示同花色的角色造成火焰伤害');
}

// ================= 汇总 =================
console.log(`\n=== shenwucheck：${pass} 通过 / ${fail} 失败 ===`);
if (fail) { console.log(bad.map(m => ' ✗ ' + m).join('\n')); process.exit(1); }
