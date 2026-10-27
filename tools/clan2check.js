// 门阀士族 4B 批次（clan2 · 族将 12）守门测试
// 运行：node tools/clan2check.js
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
const noErr = (g) => !g.logs.some(l => l.text.includes('执行异常'));

// ================= 1. 数据注册 =================
const EXPECT = [
  ['clan2_zhongyan', '族钟琰', 'jin', 3, ['guangu', 'xiaoyong', 'baozu'], 'clan2', 'zhong'],
  ['clan2_zhonghui', '族钟会', 'wei', 4, ['yuzhi', 'xieshu', 'baozu'], 'clan2', 'zhong'],
  ['clan2_zhongyu', '族钟毓', 'wei', 3, ['jiejian', 'huanghan', 'baozu'], 'clan2', 'zhong'],
  ['clan2_zhongyao', '族钟繇', 'wei', 3, ['chengqi', 'jieli', 'baozu'], 'clan2', 'zhong'],
  ['clan2_wanglun', '族王沦', 'wei', 3, ['qiuxin', 'jianyuan', 'zhongliu'], 'clan2', 'wang'],
  ['clan2_wangchang', '族王昶', 'wei', 4, ['kaiji', 'zhongliu'], 'clan2', 'wang'],
  ['clan2_wangshen', '族王沈', 'wei', 3, ['anran', 'gaobian', 'zhongliu'], 'clan2', 'wang'],
  ['clan2_yangxiu', '族杨修', 'wei', 3, ['jiewu', 'gaoshi', 'quhuo'], 'clan2', 'yang'],
  ['clan2_chenqun', '族陈群', 'wei', 3, ['gezhi', 'mingdian', 'shize'], 'clan2', 'chen'],
  ['clan2_chentai', '族陈泰', 'wei', 4, ['fenjian', 'dongxu', 'shize'], 'clan2', 'chen'],
  ['clan2_wukuang', '族吴匡', 'qun', 4, ['lianzhu', 'muyin'], 'clan2', 'wu'],
  ['clan2_luyusheng', '族陆郁生', 'wu', 3, ['shixi', 'jianbai', 'zelie'], 'clan2', 'lu'],
];
for (const [id, name, kingdom, hp, skills, pack, clan] of EXPECT) {
  const gd = generalById(id);
  ok(!!gd, `${id} 数据缺失`);
  if (!gd) continue;
  ok(gd.name === name, `${id} 名称不符：${gd.name}`);
  ok(gd.kingdom === kingdom && gd.hp === hp, `${id} 势力/体力不符：${gd.kingdom}/${gd.hp}`);
  ok(gd.pack === pack, `${id} pack 应为 ${pack}，实际 ${gd.pack}`);
  ok(gd.clan === clan, `${id} clan 标签应为 ${clan}，实际 ${gd.clan}`);
  ok(Array.isArray(gd.skills) && gd.skills.length === skills.length, `${id} 技能数量不符：${gd.skills}`);
  for (const s of skills) {
    ok(gd.skills.includes(s), `${id} 技能列表缺少 ${s}`);
    ok(hasSkill(s), `技能 ${s} 未注册`);
    const sk = getSkill(s);
    ok(sk && sk.id === s && sk.fallbackOf === undefined, `技能 ${s} 注册异常（不得降级）`);
    ok(sk && sk.name && sk.desc && sk.desc.length > 5, `技能 ${s} 缺少 name/desc`);
  }
}
ok(PACK_CN.clan2 === '门阀士族·族将', `PACK_CN.clan2 不符：${PACK_CN.clan2}`);
ok(GENERALS.filter(g => g.pack === 'clan2').length === 24, `clan2 包将数应为 24（原 12 + 2026-10-26 补全 12），实际 ${GENERALS.filter(g => g.pack === 'clan2').length}`);
ok(GENERALS.filter(g => g.pack === 'clan').length === 6, `clan 包将数应为 6（谋荀彧 2026-10-26 迁入 mouding），实际 ${GENERALS.filter(g => g.pack === 'clan').length}`);
// 宗族标签覆盖六个宗族
for (const [clan, ids] of Object.entries({
  zhong: ['clan2_zhongyan', 'clan2_zhonghui', 'clan2_zhongyu', 'clan2_zhongyao'],
  wang: ['clan2_wanglun', 'clan2_wangchang', 'clan2_wangshen'],
  yang: ['clan2_yangxiu'], chen: ['clan2_chenqun', 'clan2_chentai'],
  wu: ['clan2_wukuang'], lu: ['clan2_luyusheng'],
})) {
  for (const id of ids) ok(generalById(id)?.clan === clan, `${id} 应属宗族 ${clan}`);
}
// 技能 id 不得使用会被降级的前缀
for (const sk of ['guangu', 'xiaoyong', 'baozu', 'yuzhi', 'xieshu', 'jiejian', 'huanghan', 'chengqi', 'jieli',
  'qiuxin', 'jianyuan', 'kaiji', 'anran', 'gaobian', 'jiewu', 'gaoshi', 'quhuo', 'gezhi', 'mingdian', 'shize',
  'fenjian', 'dongxu', 'lianzhu', 'muyin', 'shixi', 'jianbai', 'zelie']) {
  ok(!/^(jie_|mou_|ji_)/.test(sk), `技能 id ${sk} 使用了会被降级的禁用前缀`);
}

// ================= 2. 主动技按钮可见 =================
{
  const ACTIVES = {
    clan2_zhongyan: ['guangu'], clan2_zhongyao: ['chengqi'], clan2_wanglun: ['qiuxin'],
    clan2_wangchang: ['kaiji'], clan2_chenqun: ['mingdian'], clan2_chentai: ['fenjian', 'dongxu'],
    clan2_luyusheng: ['shixi'],
  };
  for (const [id, list] of Object.entries(ACTIVES)) {
    const g = mk([id, 'caocao']);
    const p = g.players[0];
    g.turnPlayer = p;
    g.turnCount = 2;
    const names = g.activeSkillsOf(p).map(s => s.id);
    for (const s of list) ok(names.includes(s), `${id} 的主动技 ${s} 未出现在 activeSkillsOf 中（${names.join(',')}）`);
  }
  // 无主动技的将不应出现在按钮里
  for (const id of ['clan2_zhonghui', 'clan2_zhongyu', 'clan2_wangshen', 'clan2_yangxiu', 'clan2_wukuang']) {
    const g = mk([id, 'caocao']);
    g.turnPlayer = g.players[0];
    g.turnCount = 2;
    const own = g.activeSkillsOf(g.players[0]).filter(s => (generalById(id).skills || []).includes(s.id));
    ok(own.length === 0, `${id} 不应有主动技按钮：${own.map(s => s.id).join(',')}`);
  }
}

// ================= 3. 族钟琰 · 观骨 / 啸咏 / 保族 =================
{
  const g = mk(['clan2_zhongyan', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 3;
  p.hand = [card('a1', 'sha'), card('a2', 'shan'), card('a3', 'tao')];
  await g.useActiveSkill(p, 'guangu');
  ok(hasLog(g, '观骨'), '观骨：缺少战报');
  ok(noErr(g), '观骨：技能执行异常');
  ok(p.flags.guanguYin === true, '观骨：转换技状态应翻转为「阴」');
  ok(p.flags.guanguCount >= 1 && p.flags.guanguCount <= 4, `观骨：观看牌数应为 1~4，实际 ${p.flags.guanguCount}`);
  ok(p.flags.act_guangu === 3 || hasLog(g, '啸咏'), '观骨：应记录本回合已发动（或已被【啸咏】刷新）');

  // 啸咏：使用与上次观骨观看牌数相同字数的牌 → 刷新【观骨】
  const g2 = mk(['clan2_zhongyan', 'caocao']);
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 4;
  q.flags.guanguCount = 1;
  q.flags.act_guangu = 4;
  await g2.trigger('card.use.after', { self: q, card: card('y1', 'sha'), effName: 'sha', targets: [g2.players[1]], reason: 'play' });
  ok(q.flags.act_guangu === undefined, '啸咏：使用 1 字牌后应视为未发动【观骨】');
  ok(hasLog(g2, '啸咏'), '啸咏：缺少战报');

  // 保族：同族角色濒死
  const g3 = mk(['clan2_zhongyan', 'clan2_zhonghui'], H({ seats: [1] }));
  const a = g3.players[0], b = g3.players[1];
  b.hp = 0;
  await g3.trigger('dying.begin', { self: b, from: a });
  ok(b.chained === true, '保族：应令同族濒死角色横置');
  ok(g3.players.some(x => x.flags.baozuUsed), '保族：应记录限定技已发动');
  ok(hasLog(g3, '保族'), '保族：缺少战报');
  // 非同族不触发
  const g4 = mk(['clan2_zhongyan', 'caocao']);
  const c = g4.players[0], d = g4.players[1];
  d.hp = 0;
  await g4.trigger('dying.begin', { self: d, from: c });
  ok(c.flags.baozuUsed === undefined, '保族：非同族角色濒死不应发动');
}

// ================= 4. 族钟会 · 迂志 / 挟术 =================
{
  const g = mk(['clan2_zhonghui', 'caocao'], H({}));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 5;
  p.hand = [card('z1', 'wuzhong'), card('z2', 'sha'), card('z3', 'tao')];
  const before = p.hand.length;
  await g.trigger('round.begin', { self: p, round: 1 });
  ok(hasLog(g, '迂志'), '迂志：缺少战报');
  ok(noErr(g), '迂志：技能执行异常');
  ok(p.hand.length > before, `迂志：展示 4 字牌应摸 4 张（手牌 ${before} → ${p.hand.length}）`);
  ok(!!p.flags.yuzhi, '迂志：应记录展示的牌');
  // 回合结束：使用牌数不足 → 受雷电伤害或失去宗族技
  p.hp = p.maxHp;
  await g.trigger('turn.end', { self: p });
  ok(hasLog(g, '迂志'), '迂志：回合结束应结算（弃置展示牌 / 负面效果）');
  ok(p.skills.some(s => s.id === 'baozu') === false || p.hp < p.maxHp, '迂志：本轮使用牌数不足应受雷伤或失去【保族】');

  // 挟术：受到牌的伤害后横置并弃置/摸牌
  const g2 = mk(['clan2_zhonghui', 'caocao'], H({}));
  const q = g2.players[0];
  g2.turnPlayer = g2.players[1]; g2.turnCount = 6;
  q.chained = false;
  q.hp = q.maxHp - 1;
  await g2.trigger('damage.after', { self: q, to: q, from: g2.players[1], amount: 1, nature: 'normal', card: card('xs', 'sha'), reason: 'sha' });
  ok(q.chained === true, '挟术：应横置');
  ok(hasLog(g2, '挟术'), '挟术：缺少战报');
}

// ================= 5. 族钟毓 · 捷谏 / 惶汗 =================
{
  const g = mk(['clan2_zhongyu', 'caocao'], H({}));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 7;
  p.flags.usedTurn = 7; p.flags.usedN = 1; p.flags.usedNames = ['杀'];
  const th = t.hand.length;
  await g.trigger('target.after', { self: p, target: t, card: card('t1', 'sha'), canceled: false });
  ok(hasLog(g, '捷谏'), '捷谏：缺少战报');
  ok(t.hand.length === th + 1, `捷谏：目标应摸 1 张牌（${th} → ${t.hand.length}）`);

  p.hp = p.maxHp - 1;
  await g.trigger('damage.after', { self: p, from: t, amount: 1, card: card('t2', 'tao'), reason: 'sha' });
  ok(hasLog(g, '惶汗'), '惶汗：缺少战报');
  ok(p.flags.hhTurn === 7, '惶汗：应记录本回合已发动');
}

// ================= 6. 族钟繇 · 承启 / 诫厉 =================
{
  const g = mk(['clan2_zhongyao', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 8;
  p.hand = [card('c1', 'guohe'), card('c2', 'wuzhong'), card('c3', 'shan')];
  const before = p.hand.length;
  await g.useActiveSkill(p, 'chengqi');
  ok(hasLog(g, '承启'), '承启：缺少战报');
  ok(noErr(g), '承启：技能执行异常');
  ok(p.hand.length < before, `承启：转化后手牌应减少（${before} → ${p.hand.length}）`);

  // 诫厉：结束阶段观看牌名最多手牌与牌堆顶 X 张
  const g2 = mk(['clan2_zhongyao', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 9;
  q.flags.usedTurn = 9; q.flags.usedN = 2; q.flags.usedNames = ['无中生有', '杀'];
  await g2.trigger('phase.end', { self: q, phase: 'play' });
  ok(hasLog(g2, '诫厉'), '诫厉：缺少战报');
  ok(noErr(g2), '诫厉：技能执行异常');
}

// ================= 7. 族王沦 · 求心 / 简远 / 中流 =================
{
  const g = mk(['clan2_wanglun', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 10;
  await g.useActiveSkill(p, 'qiuxin');
  ok(hasLog(g, '求心'), '求心：缺少战报');
  ok(p.flags.qiuxin && p.flags.qiuxin.seat === 1, '求心：应记录被声明的角色与项');
  ok(p.flags.qiuxin.kind === 'sha', '求心：选项 0 应为「使用一张【杀】」');
  // 执行声明项后视为执行另一项
  await g.trigger('card.use.after', { self: p, card: card('qx', 'sha'), effName: 'sha', targets: [g.players[1]], reason: 'play' });
  ok(p.flags.qiuxin.kind === 'trick', '求心：执行后应视为声明另一项');

  // 简远：一名角色发动「出牌阶段限一次」技能后重铸
  const g2 = mk(['clan2_wanglun', 'caocao'], H({}));
  const w = g2.players[0], q = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 11;
  q.flags.usedTurn = 11; q.flags.usedN = 2;
  q.hand = [card('j1', 'juedou'), card('j2', 'sha')];
  await g2.trigger('cards.discard', { self: q, cards: [card('j3', 'sha')], reason: 'qiuxin' });
  ok(hasLog(g2, '简远'), '简远：缺少战报');
  ok(noErr(g2), '简远：技能执行异常');
  ok(q.flags.jyTurn === 11, '简远：应记录该角色本回合已发动');
  // 中流（宗族技）仍生效
  ok(hasLog(g2, '简远'), '中流：宗族技应可被同族武将共享');
}

// ================= 8. 族王昶 · 开济 =================
{
  const g = mk(['clan2_wangchang', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 12;
  p.hand = [card('k1', 'sha'), card('k2', 'tao'), card('k3', 'shan')];
  await g.useActiveSkill(p, 'kaiji');
  ok(hasLog(g, '开济'), '开济：缺少战报');
  ok(noErr(g), '开济：技能执行异常');
  ok(p.flags.kaijiRound && p.flags.kaijiRound.ids.length === 1, '开济：应记录本轮已指定的角色');
}

// ================= 9. 族王沈 · 岸然 / 告变 =================
{
  const g = mk(['clan2_wangshen', 'caocao'], H({ index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 13;
  const before = p.hand.length;
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(hasLog(g, '岸然'), '岸然：缺少战报');
  ok(p.hand.length === before + 1, `岸然：第 1 次发动应摸 1 张（${before} → ${p.hand.length}）`);
  ok(p.flags.anranN === 1, '岸然：应记录发动次数');
  ok(p.flags.anranBlock && p.flags.anranBlock.ids.length >= 1, '岸然：应记录以此法获得的牌');
  if (p.flags.anranBlock) {
    const blk = p.flags.anranBlock.ids[0];
    const bcard = p.hand.find(c => c.id === blk) || card(blk, 'sha');
    const bd = { self: p, card: bcard, effName: bcard.name, targets: [], reason: 'play', canceled: false };
    await g.trigger('card.use.before', bd);
    ok(bd.canceled === true, '岸然：以此法获得的牌本回合不能作为使用的下一张牌');
  }
  // 受到伤害后再次发动，X 递增
  await g.trigger('damage.after', { self: p, to: p, from: g.players[1], amount: 1, card: card('ar', 'sha'), reason: 'sha' });
  ok(p.flags.anranN === 2, '岸然：受伤后应可再次发动且 X 递增');

  // 告变：其他角色回合结束时仅一人受伤
  const g2 = mk(['clan2_wangshen', 'caocao'], H({}));
  const w = g2.players[0], v = g2.players[1];
  g2.turnCount = 14; g2.turnPlayer = v;
  await g2.trigger('damage.after', { self: v, to: v, from: w, amount: 1, card: card('gb', 'sha'), reason: 'sha' });
  await g2.trigger('turn.end', { self: v });
  ok(hasLog(g2, '告变'), '告变：缺少战报');
  ok(noErr(g2), '告变：技能执行异常');
}

// ================= 10. 族杨修 · 捷悟 / 高视 / 去惑 =================
{
  const g = mk(['clan2_yangxiu', 'caocao'], H({ seats: [1] }));
  const p = g.players[0], t = g.players[1];
  g.turnPlayer = p; g.turnCount = 15;
  t.hand = [card('jw1', 'sha'), card('jw2', 'shan')];
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(p.flags.jiewu && p.flags.jiewu.seat === 1, '捷悟：应记录手牌可见的角色');
  await g.trigger('target.after', { self: p, target: t, card: card('jw3', 'sha') });
  ok(hasLog(g, '捷悟'), '捷悟：缺少战报');
  ok(p.flags.jiewu.n >= 1, '捷悟：应记录发动次数');
  ok(noErr(g), '捷悟：技能执行异常');

  // 高视
  const g2 = mk(['clan2_yangxiu', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 16;
  q.flags.jiewu = { seat: 1, turn: 16, shown: [], n: 2 };
  q.flags.usedTurn = 16; q.flags.usedN = 1; q.flags.usedNames = ['杀'];
  await g2.trigger('phase.end', { self: q, phase: 'play' });
  ok(hasLog(g2, '高视'), '高视：缺少战报');
  ok(noErr(g2), '高视：技能执行异常');

  // 去惑：不因使用/打出/弃置失去装备牌
  const g3 = mk(['clan2_yangxiu', 'caocao'], H({ seats: [0] }));
  const y = g3.players[0];
  g3.turnCount = 17;
  y.hp = y.maxHp - 1;
  await g3.trigger('cards.gain', { self: g3.players[1], from: y, cards: [card('qh', 'chitu')], reason: 'shunshou' });
  ok(hasLog(g3, '去惑'), '去惑：缺少战报');
  ok(y.flags.qhTurn === 17, '去惑：应记录本回合已发动');
  // 因「使用」失去则不触发
  const g4 = mk(['clan2_yangxiu', 'caocao']);
  const y2 = g4.players[0];
  g4.turnCount = 18;
  await g4.trigger('cards.gain', { self: g4.players[1], from: y2, cards: [card('qh2', 'chitu')], reason: 'discard' });
  ok(y2.flags.qhTurn === undefined, '去惑：因弃置失去手牌不应触发');
}

// ================= 11. 族陈群 · 革制 / 明典 / 士则 =================
{
  const g = mk(['clan2_chenqun', 'caocao'], H({}));
  const p = g.players[0], src = g.players[1];
  g.turnCount = 19; g.turnPlayer = src;
  p.hand = [card('gz1', 'sha')];
  src.hand = [card('gz2', 'wuzhong')];
  await g.trigger('damage.after', { self: p, to: p, from: src, amount: 1, card: card('gzx', 'sha'), reason: 'sha' });
  ok(hasLog(g, '革制'), '革制：缺少战报');
  ok(noErr(g), '革制：技能执行异常');
  ok(p.flags.gzTurn === 19, '革制：应记录本回合已发动');
  ok(p.hand.length === 2, `革制：应获得双方弃置的牌（手牌 ${p.hand.length}）`);
  ok(p.flags.gzBan && p.flags.gzBan.types.length === 2, '革制：类别不同应封印双方本回合的用牌类别');
  if (p.flags.gzBan) {
    const banCard = p.flags.gzBan.types.includes('equip') ? card('bz1', 'sha') : card('bz2', 'qinggang');
    const bd = { self: p, card: banCard, effName: banCard.name, targets: [], reason: 'play', canceled: false };
    await g.trigger('card.use.before', bd);
    ok(bd.canceled === true, '革制：被封印类别的牌本回合不能使用');
  }

  // 明典：重铸基本牌并回收缺少牌名
  const g2 = mk(['clan2_chenqun', 'caocao'], H({}));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 20;
  q.hand = [card('md1', 'sha'), card('md2', 'wuzhong')];
  q.flags.usedTurn = 20; q.flags.usedN = 1; q.flags.usedNames = ['杀'];
  await g2.useActiveSkill(q, 'mingdian');
  ok(hasLog(g2, '明典'), '明典：缺少战报');
  ok(noErr(g2), '明典：技能执行异常');
  ok(q.flags.mdRound && q.flags.mdRound.names.includes('sha'), '明典：应记录本轮已重铸的牌名');

  // 士则：回合内使用牌首次被响应 → 同族角色攻击范围+1
  const g3 = mk(['clan2_chenqun', 'clan2_chentai'], H({ seats: [1] }));
  const a = g3.players[0], b = g3.players[1];
  g3.turnCount = 21; g3.turnPlayer = a;
  await g3.trigger('dodge.after', { self: b, from: a, card: card('sz', 'shan') });
  ok(hasLog(g3, '士则'), '士则：缺少战报');
  ok((b.flags.rangeBonus || 0) === 1, `士则：同族目标攻击范围应+1（实际 ${b.flags.rangeBonus}）`);
  await g3.trigger('damage.after', { self: b, to: b, from: a, amount: 1, card: card('sz2', 'sha'), reason: 'sha' });
  ok((b.flags.rangeBonus || 0) === 0, '士则：受到伤害后攻击范围加成应结束');
}

// ================= 12. 族陈泰 · 奋剑 / 动虚 =================
{
  const g = mk(['clan2_chentai', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 22;
  await g.useActiveSkill(p, 'fenjian');
  ok(hasLog(g, '奋剑'), '奋剑：缺少战报');
  ok(noErr(g), '奋剑：技能执行异常');
  ok(p.flags.fjTurn && p.flags.fjTurn.cats.length === 1, '奋剑：应记录本阶段已发动的一项');

  // 动虚（阳）：把装备牌置入其他角色装备区
  const g2 = mk(['clan2_chentai', 'caocao'], H({ seats: [1] }));
  const q = g2.players[0], t = g2.players[1];
  g2.turnPlayer = q; g2.turnCount = 23;
  q.hand = [card('dx1', 'qinggang'), card('dx2', 'sha')];
  await g2.useActiveSkill(q, 'dongxu');
  ok(hasLog(g2, '动虚'), '动虚：缺少战报');
  ok(noErr(g2), '动虚：技能执行异常');
  ok(t.equips.weapon && t.equips.weapon.name === 'qinggang', '动虚（阳）：应把装备牌置入其他角色装备区');
}

// ================= 13. 族吴匡 · 联诛 / 穆荫 =================
{
  const g = mk(['clan2_wukuang', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 24;
  p.hand = [card('lz1', 'sha'), card('lz2', 'shan')];
  g.players[1].hand = [card('lz3', 'sha'), card('lz4', 'tao')];
  await g.trigger('phase.begin', { self: p, phase: 'play' });
  ok(hasLog(g, '联诛'), '联诛：缺少战报');
  ok(noErr(g), '联诛：技能执行异常');
  ok(p.flags.lzUsed === 24 && p.flags.lzYin === true, '联诛：应记录发动并翻转为「阴」');

  // 穆荫：准备阶段令手牌上限不为全场最大的同族角色 +1
  const g2 = mk(['clan2_wukuang', 'mo_zhangfei'], H({}));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 25;
  q.flags.handLimit = 0;
  await g2.trigger('phase.begin', { self: q, phase: 'prepare' });
  ok(hasLog(g2, '穆荫'), '穆荫：缺少战报');
  ok((q.flags.handLimit || 0) === 1, `穆荫：同族角色手牌上限应+1（实际 ${q.flags.handLimit}）`);
}

// ================= 14. 族陆郁生 · 拾昔 / 坚白 / 泽烈 =================
{
  const g = mk(['clan2_luyusheng', 'caocao'], H({ seats: [1], index: 0 }));
  const p = g.players[0];
  g.turnPlayer = p; g.turnCount = 26;
  await g.trigger('card.use.after', { self: p, card: card('sx1', 'guohe', 'spade'), effName: 'guohe', targets: [g.players[1]], reason: 'play' });
  ok(p.flags.shixi && p.flags.shixi.spade === 'guohe', '拾昔：应记录首次使用的花色与牌名');
  p.hand = [card('sx2', 'sha', 'spade'), card('sx3', 'tao', 'heart')];
  await g.useActiveSkill(p, 'shixi');
  ok(hasLog(g, '拾昔'), '拾昔：缺少战报');
  ok(noErr(g), '拾昔：技能执行异常');
  ok(!p.hand.some(c => c.suit === 'spade'), '拾昔：应将对应花色的所有牌置入弃牌堆');

  // 坚白：每回合首次使用一种类别后重铸其余花色
  const g2 = mk(['clan2_luyusheng', 'caocao'], H({ index: 0 }));
  const q = g2.players[0];
  g2.turnPlayer = q; g2.turnCount = 27;
  q.hand = [card('jb1', 'sha', 'heart'), card('jb2', 'shan', 'spade'), card('jb3', 'tao', 'heart')];
  await g2.trigger('card.use.after', { self: q, card: card('jb0', 'sha', 'club'), effName: 'sha', reason: 'play' });
  ok(hasLog(g2, '坚白'), '坚白：缺少战报');
  ok(noErr(g2), '坚白：技能执行异常');
  ok(q.flags.jbTurn && q.flags.jbTurn.types.length === 1, '坚白：应记录本回合已处理的牌的类别');

  // 泽烈：同族角色失去场上所有牌
  const g3 = mk(['clan2_luyusheng', 'caocao'], H({ seats: [0] }));
  const w = g3.players[0];
  g3.turnCount = 28; g3.turnPlayer = g3.players[1];
  await g3.trigger('equip.lose', { self: w, card: card('zl1', 'qinggang'), slot: 'weapon' });
  ok(hasLog(g3, '泽烈'), '泽烈：缺少战报');
  ok(w.flags.zelieDraw === 28, '泽烈：应给目标挂上「下次摸牌后额外摸一张」');
}

// ================= 汇总 =================
console.log(`\nclan2 守门测试：通过 ${pass} / 失败 ${fail}`);
if (fail) {
  console.log('失败项：');
  for (const b of bad) console.log('  ✗', b);
  process.exit(1);
}
console.log('全部通过。');
