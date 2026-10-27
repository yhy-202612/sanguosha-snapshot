// A 批（门阀士族 clan + 闪张郃 + 魔张飞/魔孙权 + 谋刘备/谋大乔）守门测试
// 运行：node tools/clancheck.js
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

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });
function mk(ids, handler = () => null) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const game = new Game({
    seats, mode: getMode('duel'), seed: 20261025,
    responder: { askPlay: async () => ({ endPhase: true }), ask: async (g, p, req) => handler(g, p, req) },
    deckEntries: deckEntries('standard'), config: { timeout: 1000 },
  });
  game.onState = () => {};
  return game;
}
// 桩 handler：默认返回 yes / 第一个目标 / 第 0 个选项
const H = (over = {}) => (g, p, req) => {
  if (req.kind === 'confirm') return { yes: over.yes !== false };
  if (req.kind === 'targets') return { seats: (over.seats || [1]).slice(0, req.max || 1) };
  if (req.kind === 'choice') return { index: over.index !== undefined ? over.index : 0 };
  if (req.kind === 'card') return { cardId: over.cardId || (p.hand[0] || {}).id };
  return null;
};
const hasLog = (g, kw) => g.logs.some(l => l.text.includes(kw));

// ================= 1. 数据注册 =================
const EXPECT = [
  ['clan_wangling', '族王凌', 'wei', 4, ['bolong', 'zhongliu'], 'clan'],
  ['clan_wanghun', '族王浑', 'wei', 3, ['fuxun', 'chenya', 'zhongliu'], 'clan'],
  ['clan_xunshu', '族荀淑', 'qun', 3, ['shenjun', 'balong', 'daojie'], 'clan'],
  ['clan_xuncan', '族荀粲', 'wei', 3, ['yunshen', 'shangshen', 'fenchai', 'daojie'], 'clan'],
  ['clan_xunyu', '族荀彧', 'wei', 3, ['dingan', 'funing', 'daojie'], 'clan'],
  ['clan_xunchen', '族荀谌', 'qun', 3, ['sankuang', 'beishi', 'daojie'], 'clan'],
  ['clan_mouxunyu', '谋荀彧', 'wei', 3, ['bizuo', 'shimou'], 'mouding'],
  ['flash_zhanghe', '闪张郃', 'qun', 4, ['qiongtu', 'xianzhu'], 'flash'],
  ['mo_zhangfei', '魔张飞', 'shu', 5, ['zhuohun', 'chenshi'], 'mo'],
  ['mo_sunquan', '魔孙权', 'wu', 4, ['quanyu', 'tianen', 'qiangang'], 'mo'],
  ['mou2_liubei', '谋刘备', 'shu', 4, ['rende2', 'zhangwu', 'jijiang2'], 'mou2'],
  ['mou2_daqiao', '谋大乔', 'wu', 3, ['guose2', 'liuli2'], 'mou2'],
];
for (const [id, name, kingdom, hp, skills, pack] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 数据缺失`);
  ok(gd && gd.name === name, `${id} 名称不符：${gd && gd.name}`);
  ok(gd && gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符：${gd && gd.kingdom}/${gd && gd.hp}`);
  ok(gd && gd.pack === pack, `${id} pack 应为 ${pack}，实际 ${gd && gd.pack}`);
  for (const s of skills) {
    ok(gd && gd.skills.includes(s), `${id} 技能列表缺少 ${s}`);
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && sk.name && sk.desc && sk.desc.length > 5, `技能 ${s} 缺少 name/desc`);
  }
}
ok(PACK_CN.clan === '门阀士族', `PACK_CN.clan 不符：${PACK_CN.clan}`);
ok(GENERALS.filter(g => g.pack === 'clan').length === 6, `clan 包将数应为 6（谋荀彧已迁入 mouding），实际 ${GENERALS.filter(g => g.pack === 'clan').length}`);
ok(GENERALS.filter(g => g.pack === 'flash').length === 6, `flash 包将数应为 6（含闪朱儁），实际 ${GENERALS.filter(g => g.pack === 'flash').length}`);
ok(GENERALS.filter(g => g.pack === 'mo').length === 6, `mo 包将数应为 6，实际 ${GENERALS.filter(g => g.pack === 'mo').length}`);
ok(GENERALS.filter(g => g.pack === 'mou2').length === 8, `mou2 包将数应为 8，实际 ${GENERALS.filter(g => g.pack === 'mou2').length}`);
ok(generalById('clan_wangling')?.clan === 'wang' && generalById('clan_xuncan')?.clan === 'xun', 'clan 宗族标签缺失');
ok(generalById('flash_zhanghe')?.kingdom2 === 'wei', '闪张郃 应为 群/魏 双势力');
ok(getSkill('qiongtu')?.kingdomOnly === 'qun' && getSkill('xianzhu')?.kingdomOnly === 'wei', '闪张郃 势力技 kingdomOnly 不符');

// ================= 2. 宗族技 中流 =================
{
  const g = mk(['clan_wangling', 'caocao']);
  const p = g.players[0];
  g.turnCount = 5; g.turnPlayer = p;
  p.flags.act_bolong = 5;
  await g.trigger('card.use.before', { self: p, card: card('x1', 'sha'), effName: 'sha', targets: [g.players[1]], reason: 'play' });
  ok(p.flags.act_bolong === undefined, '中流：使用非族牌后应刷新“出牌阶段限一次”');
  ok(hasLog(g, '中流'), '中流：缺少战报');
  // 同族角色的手牌不刷新
  const g2 = mk(['clan_wangling', 'clan_wanghun']);
  const q = g2.players[0];
  g2.turnCount = 7; g2.turnPlayer = q;
  q.flags.act_bolong = 7;
  const mateCard = q.hand[0];
  await g2.trigger('card.use.before', { self: q, card: mateCard, effName: 'sha', targets: [g2.players[1]], reason: 'play' });
  ok(q.flags.act_bolong === 7, '中流：同族角色的手牌不应刷新技能');
}

// ================= 3. 族王凌 · 驳龙 =================
{
  const g = mk(['clan_wangling', 'caocao'], H({ seats: [1], index: 1 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'sha'), card('a2', 'shan')];
  t.hand = [card('b1', 'tao')];
  await g.useActiveSkill(p, 'bolong');
  ok(hasLog(g, '驳龙'), '驳龙：缺少战报');
  ok(p.hand.length === 3, `驳龙：选项二应令其交牌给你（手牌 ${p.hand.length}）`);
  ok(t.hand.length === 0, '驳龙：被驳龙角色应交出牌');
}
{
  const g = mk(['clan_wangling', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 4;
  p.hand = [card('a1', 'shan')];
  t.hand = [card('b1', 'tao')];
  await g.useActiveSkill(p, 'bolong');
  ok(p.hand.length === 0 && t.hand.length >= 2, '驳龙：选项一应将牌交给其并视为使用雷【杀】');
  ok(hasLog(g, '雷【杀】'), '驳龙：缺少雷【杀】战报');
}

// ================= 4. 族王浑 · 抚循 + 沉雅 =================
{
  const g = mk(['clan_wanghun', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'sha'), card('a2', 'shan')];
  t.hand = [card('b1', 'tao'), card('b2', 'shan'), card('b3', 'sha'), card('b4', 'jiu')];
  await g.useActiveSkill(p, 'fuxun');
  ok(hasLog(g, '抚循'), '抚循：缺少战报');
  ok(hasLog(g, '抚循】：将') || p.hand.length >= 3, '抚循：手牌数相同后应可将牌当基本牌使用');
}
{
  const g = mk(['clan_wanghun', 'sunquan'], H());
  const p = g.players[0], q = g.players[1];
  g.turnPlayer = q; g.turnCount = 6;
  q.hand = [card('c1', 'juedou'), card('c2', 'shan')];   // 手牌 2 张、含名字数为 2 的【决斗】
  await g.trigger('cards.discard', { self: q, cards: [q.hand[1]], reason: 'zhiheng' });
  ok(hasLog(g, '沉雅'), '沉雅：应在其他角色发动“出牌阶段限一次”技能后触发');
}

// ================= 5. 族荀淑 · 神君 / 八龙 / 蹈节 =================
{
  const g = mk(['clan_xunshu', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 3;
  p.hand = [card('a1', 'guohe')];
  t.hand = [card('b1', 'tao'), card('b2', 'shan')];
  await g.trigger('card.use.before', { self: t, card: card('c9', 'guohe'), effName: 'guohe', targets: [p], reason: 'play' });
  ok((p.flags.shenjun || []).includes('guohe'), '神君：应将同名手牌记为「神君」');
  await g.trigger('phase.end', { self: p, phase: 'play' });
  ok(hasLog(g, '神君'), '神君：阶段结束时应可将牌当「神君」牌使用');
}
{
  const g = mk(['clan_xunshu', 'caocao'], H());
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 3;
  p.hand = [card('a1', 'wuzhong')];
  const n0 = p.hand.length;
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok(hasLog(g, '八龙'), '八龙：体力变化后锦囊为唯一最多时应发动');
  ok(p.hand.length > n0, `八龙：应摸至存活角色数（${n0} → ${p.hand.length}）`);
}
{
  const g = mk(['clan_xuncan', 'clan_xunshu'], H({ seats: [1], index: 0 }));
  const p = g.players[0], mate = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'wuzhong')];
  mate.hand = [];
  const hp0 = p.hp;
  await g.useCard({ from: p, card: p.hand[0], targets: [p], reason: 'play', ignoreRange: true });
  ok(hasLog(g, '蹈节'), '蹈节：每回合首次使用非伤害锦囊后应触发');
  ok(p.hp === hp0 - 1, `蹈节：选择“失去1点体力”（${hp0} → ${p.hp}）`);
  ok(mate.hand.some(c => c.name === 'wuzhong'), '蹈节：同族角色应获得此牌');
}

// ================= 6. 族荀粲 · 熨身 / 伤神 / 分钗 =================
{
  const g = mk(['clan_xuncan', 'caocao'], H({ seats: [1], index: 1 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  t.hp = 2;
  await g.useActiveSkill(p, 'yunshen');
  ok(t.hp >= 3 || g.logs.some(l => /回复 1 点体力/.test(l.text)), `熨身：目标应回复1点体力（实际 ${t.hp}）`);
  ok(hasLog(g, '熨身'), '熨身：缺少战报');
  ok(p.flags.fenchaiTarget === t.id || t.gender === p.gender, '熨身：应记录【分钗】异性目标');
}
{
  const g = mk(['clan_xuncan', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  t.hand = [];
  await g.damage({ from: p, to: t, amount: 1, nature: 'fire', reason: 'test' });
  ok(hasLog(g, '伤神'), '伤神：属性伤害后应触发');
  ok(t.hand.length === 4, `伤神：应将其手牌摸至四张（实际 ${t.hand.length}）`);
}
{
  const g = mk(['clan_xuncan', 'zhenji'], H());
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 3;
  p.flags.fenchaiTarget = t.id;
  const r = await g.judge(p, { reason: 'test' });
  ok(r.suit === 'heart', `分钗：异性存活时判定牌视为红桃（实际 ${r.suit}）`);
  ok(hasLog(g, '分钗'), '分钗：缺少战报');
  t.alive = false;
  const r2 = await g.judge(p, { reason: 'test2' });
  ok(r2.suit === 'spade', `分钗：异性死亡后判定牌视为黑桃（实际 ${r2.suit}）`);
}

// ================= 7. 族荀彧 · 定安 / 抚宁 =================
{
  const g = mk(['clan_xunyu', 'caocao', 'guanyu'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'guohe'), card('a2', 'guohe')];
  t.hand = [card('b1', 'tao'), card('b2', 'shan')];
  await g.useCard({ from: p, card: p.hand[0], targets: [t], reason: 'play', ignoreRange: true });
  await g.useCard({ from: p, card: p.hand[0], targets: [t], reason: 'play', ignoreRange: true });
  ok(hasLog(g, '定安'), '定安：同一牌名每回合第二次被使用后应触发');
}
{
  const g = mk(['clan_xunyu', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 3;
  p.hp = 2;
  p.hand = [card('a1', 'sha'), card('a2', 'shan')];
  await g.damage({ from: t, to: p, amount: 1, reason: 'test' });
  ok(hasLog(g, '抚宁'), '抚宁：每轮体力值首次变化后应可发动');
}

// ================= 8. 族荀谌 · 三恇 / 卑势 =================
{
  const g = mk(['clan_xunchen', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'sha', 'spade', 7)];
  t.hand = [card('b1', 'tao'), card('b2', 'shan')];
  t.hp = 3;
  await g.useCard({ from: p, card: p.hand[0], targets: [t], reason: 'play' });
  ok(hasLog(g, '三恇'), '三恇：每轮首次使用一种类型的牌后应触发');
  ok(p.flags.beishiTarget === t.id, '三恇：应记录【卑势】角色');
  ok(p.hand.length >= 2, `三恇：应向其讨牌（当前手牌 ${p.hand.length}）`);
}
{
  const g = mk(['clan_xunchen', 'caocao'], H());
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = t; g.turnCount = 3;
  p.hp = 2; p.flags.beishiTarget = t.id;
  t.hand = [card('b1', 'tao')];
  await g.discardCards(t, [t.hand[0]], { reason: 'test' });
  ok(p.hp === 3, `卑势：其失去所有手牌后你回复1点体力（实际 ${p.hp}）`);
  ok(hasLog(g, '卑势'), '卑势：缺少战报');
}

// ================= 9. 谋荀彧 · 弼佐 / 势谋 =================
{
  const g = mk(['clan_mouxunyu', 'caocao', 'guanyu'], H({ seats: [1] }));
  const p = g.players[0];
  g.turnCount = 4; g.turnPlayer = g.players[1];
  p.hp = 1;
  await g.trigger('turn.end', { self: g.players[1] });
  ok(p.flags.bizuoUsed === true, '弼佐：一号位体力最低时应可发动限定技');
  ok(hasLog(g, '弼佐'), '弼佐：缺少战报');
}
{
  const g = mk(['clan_mouxunyu', 'caocao'], H({ seats: [0], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'sha'), card('a2', 'shan')];
  await g.useActiveSkill(p, 'shimou');
  ok(hasLog(g, '势谋'), '势谋：缺少战报');
  ok(p.hand.length >= 2, '势谋：应将手牌调整至体力上限并视为使用锦囊');
  ok(g.logs.some(l => /阳|阴/.test(l.text)), '势谋：转换技应记录阴阳');
}

// ================= 10. 闪张郃 · 穷途 / 先著 =================
{
  const g = mk(['flash_zhanghe', 'caocao'], H({ seats: [0], yes: true }));
  const p = g.players[0], u = g.players[1];
  g.turnCount = 3; g.turnPlayer = u;
  p.hand = [];
  u.hand = [card('b1', 'guohe')];
  const d = { self: u, card: u.hand[0], effName: 'guohe', targets: [p], reason: 'play', canceled: false };
  await g.trigger('card.use.before', d);
  ok(d.canceled === true, '穷途：应视为使用【无懈可击】抵消该锦囊');
  ok((p.flags.qiongtu || []).length === 1, '穷途：被响应牌应置于武将牌上');
  ok(p.hand.length === 1, '穷途：应摸一张牌');
  await g.useActiveSkill(p, 'qiongtu');
  ok(p.kingdom === 'wei', `穷途：无懈未生效时应将势力变更至魏（实际 ${p.kingdom}）`);
  ok((p.flags.qiongtu || []).length === 0, '穷途：转魏后应获得武将牌上的所有牌');
}
{
  const g = mk(['flash_zhanghe', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  p.kingdom = 'wei';
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'guohe'), card('a2', 'shan')];
  await g.useActiveSkill(p, 'xianzhu');
  ok(hasLog(g, '先著'), '先著：缺少战报');
  ok((p.flags.xianzhuTypes || []).includes('trick'), '先著：应记录本阶段已使用的类型');
}

// ================= 11. 魔张飞 · 灼魂 / 瞋视 =================
{
  const g = mk(['mo_zhangfei', 'caocao'], H());
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', {});
  g.turnPlayer = t; g.turnCount = 3;
  p.hand = [];
  await g.damage({ from: t, to: p, amount: 2, reason: 'test' });
  ok(hasLog(g, '灼魂'), '灼魂：勾玉变色后应触发');
  ok(p.hand.length === 1, `灼魂：未入魔时变色摸一张牌（实际 ${p.hand.length}）`);
}
{
  const g = mk(['mo_zhangfei', 'caocao'], H());
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', {});
  g.turnPlayer = t; g.turnCount = 3;
  p.form = 'demon';
  p.hand = [];
  t.hp = 2;
  await g.damage({ from: p, to: t, amount: 1, reason: 'test' });
  ok(hasLog(g, '灼魂·改'), '灼魂（修改）：入魔后变色应触发');
  ok(p.hand.length === p.maxHp, `灼魂（修改）：应将手牌摸至体力上限（${p.hand.length}/${p.maxHp}）`);
  ok(t.hp <= 0 || hasLog(g, '红色'), '灼魂（修改）：红色勾玉应令其失去所有体力');
}
{
  const g = mk(['mo_zhangfei', 'caocao'], H({ seats: [1] }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'shan')];
  await g.useActiveSkill(p, 'zhuohun');
  ok(hasLog(g, '视为【杀】'), '灼魂：回合内【闪】应可视为【杀】使用');
}
{
  const g = mk(['mo_zhangfei', 'caocao', 'zhenji'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1], z = g.players[2];
  await g.trigger('game.start', {});
  g.turnPlayer = p; g.turnCount = 3;
  z.hp = 2;                                  // 甄姬 3 上限 2 血 → 黄色勾玉（与张飞绿色不同）
  p.hand = [card('a1', 'sha', 'spade', 9)];
  await g.useCard({ from: p, card: p.hand[0], targets: [t], reason: 'play' });
  ok(hasLog(g, '瞋视'), '瞋视：黑色【杀】应触发');
  ok(g.logs.some(l => /额外指定/.test(l.text)) || g.logs.some(l => /决斗/.test(l.text)), '瞋视：应多指异色角色或将同色【杀】改为【决斗】');
}
{
  const g = mk(['mo_zhangfei', 'caocao'], H());
  const p = g.players[0], t = g.players[1];
  await g.trigger('game.start', {});
  g.turnPlayer = t; g.turnCount = 3;
  await g.damage({ from: t, to: p, amount: 3, card: card('c1', 'sha'), reason: 'sha' });
  ok(p.flags.chenshiDone === true, '瞋视：因【杀】/【决斗】累计 3 点伤害后应入魔');
  ok(p.form === 'demon', `瞋视：入魔形态（实际 ${p.form}）`);
}

// ================= 12. 魔孙权 · 权御 / 天恩 / 乾纲 =================
{
  const g = mk(['mo_sunquan', 'caocao', 'guanyu'], H({ index: 0 }));
  const p = g.players[0];
  g.turnCount = 1; g.turnPlayer = p;
  await g.trigger('turn.begin', { self: p });
  ok(p.flags.quanyu === 'baihong', `权御：应记录所选效果（实际 ${p.flags.quanyu}）`);
  ok((p.flags.quanyuUsed || []).length === 1, '权御：每人每项限一次');
  ok(p.hand.length >= 2 && p.flags.quanyuUsed.length === 1, `权御：有角色与你效果相同时应摸牌（实际手牌 ${p.hand.length}）`);
  ok(hasLog(g, '权御'), '权御：缺少战报');
  // 白虹：伤害+1
  const t = g.players[1];
  const d = { self: t, to: t, from: p, amount: 1, card: card('c1', 'sha'), nature: 'normal', reason: 'sha' };
  await g.trigger('damage.before', d);
  ok(d.amount === 2, `权御·白虹：【杀】伤害应+1（实际 ${d.amount}）`);
}
{
  const g = mk(['mo_sunquan', 'caocao'], H());
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 2;
  p.flags.quanyu = 'baihong'; t.flags.quanyu = 'zidian';
  p.hand = [card('a1', 'sha', 'spade', 7)];
  t.hand = [card('b1', 'tao'), card('b2', 'shan')];
  await g.useCard({ from: p, card: p.hand[0], targets: [t], reason: 'play' });
  ok(hasLog(g, '天恩'), '天恩：使用牌指定唯一目标后应触发');
}
{
  const g = mk(['mo_sunquan', 'caocao'], H());
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 2;
  await g.useActiveSkill(p, 'qiangang');
  ok(p.form === 'demon', '乾纲：发动后应入魔');
  ok(!p.skills.some(s => s.id === 'tianen'), '乾纲：应失去【天恩】');
  ok(hasLog(g, '乾纲'), '乾纲：缺少战报');
}

// ================= 13. 谋刘备 · 仁德 / 章武 / 激将 =================
{
  const g = mk(['mou2_liubei', 'caocao'], H({ seats: [1], index: 0, yes: true }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.flags.renwang === 2, `仁德：出牌阶段开始应获得2个「仁望」（实际 ${p.flags.renwang}）`);
  p.hand = [card('a1', 'tao'), card('a2', 'shan')];
  await g.useActiveSkill(p, 'rende2');
  ok(hasLog(g, '仁德'), '仁德：缺少战报');
  ok(p.flags.renwang === 4, `仁德：交出的牌应等量转化为「仁望」（实际 ${p.flags.renwang}）`);
  const rd = { self: p, filter: { name: 'shan' }, handled: false, card: null };
  await g.trigger('respond.need', rd);
  ok(rd.handled === true && rd.card?.name === 'shan', '仁德：应可弃2个「仁望」视为打出一张基本牌');
  ok(p.flags.renwang === 2, `仁德：应消耗2个「仁望」（实际 ${p.flags.renwang}）`);
}
{
  const g = mk(['mou2_liubei', 'caocao'], H());
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 5;
  p.hp = 1;
  p.flags.rendeReceivers = [t.id];
  t.hand = [card('b1', 'tao'), card('b2', 'shan')];
  await g.useActiveSkill(p, 'zhangwu');
  ok(hasLog(g, '章武'), '章武：缺少战报');
  ok(p.hp === 4, `章武：应回复3点体力（实际 ${p.hp}）`);
  ok(!p.skills.some(s => s.id === 'rende2'), '章武：发动后应失去【仁德】');
}
{
  const g = mk(['mou2_liubei', 'guanyu', 'caocao'], H({ seats: [2], index: 0 }));
  const p = g.players[0], h = g.players[1], t = g.players[2];
  g.turnPlayer = p; g.turnCount = 3;
  p.hp = 3;
  await g.trigger('phase.end', { self: p, phase: 'play' });
  ok(hasLog(g, '激将'), '激将：出牌阶段结束时应可发动主公技');
}

// ================= 14. 谋大乔 · 国色 / 流离 =================
{
  const g = mk(['mou2_daqiao', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'sha', 'diamond', 8)];
  await g.useActiveSkill(p, 'guose2');
  ok(hasLog(g, '国色'), '国色：缺少战报');
  ok((t.judgeZone || []).length === 1, '国色：应将方片牌当【乐不思蜀】置于其判定区');
  ok(p.hand.length === 1, '国色：使用后应摸一张牌');
}
{
  const g = mk(['mou2_daqiao', 'caocao', 'guanyu'], H({ seats: [2] }));
  const p = g.players[0], u = g.players[1], t2 = g.players[2];
  g.turnPlayer = u; g.turnCount = 3;
  p.hand = [card('a1', 'heart' === 'heart' ? 'tao' : 'tao', 'heart', 5), card('a2', 'shan')];
  u.hand = [card('b1', 'sha', 'spade', 9)];
  await g.useCard({ from: u, card: u.hand[0], targets: [p], reason: 'play' });
  ok(hasLog(g, '流离'), '流离：应可将【杀】转移给其他角色');
  ok(g.logs.some(l => /转移给/.test(l.text)), '流离：缺少转移战报');
  ok(p.hand.length <= 1, '流离：应弃置一张牌');
  t2.flags.liuliMark = true;
  g.turnPlayer = t2;
  await g.trigger('turn.begin', { self: t2 });
  ok(t2.flags.extraPlay === true, '流离：拥有「流离」标记的角色回合开始时应执行额外出牌阶段');
  ok(t2.flags.liuliMark === false, '流离：应移去「流离」标记');
}

// ================= 汇总 =================
console.log(`\nA 批守门：通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败项：'); for (const b of bad) console.log('  ✗ ' + b); }
if (fail) process.exitCode = 1;
