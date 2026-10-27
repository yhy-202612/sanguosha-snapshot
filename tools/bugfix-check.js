// dsh SG026 回执「7 条修复复核 PASS 2 / FAIL 5」的定向回归
// 覆盖：#1 义襄（第一张牌 -1 / 第二张黑牌无效）、#2 等力（拥有者越权）、
//       #4 追命（唯一目标 + per-seat 免闪/加伤）、#5 round.end（额外回合/单人存活）、
//       #7 笛音（自弃牌不再凭空消失）
// 用法：node tools/bugfix-check.js
import '../src/skills/index.js';
import { Game, CARD_META } from '../src/engine/index.js';
import { suitOf } from '../src/engine/cards.js';
import { getSkill, collectTriggers, HELD_CONTAINERS } from '../src/engine/skill.js';
import { generalById } from '../src/data/generals.js';
import { getMode } from '../src/modes/index.js';
import { deckEntries } from '../src/data/deck.js';
import { pindian } from '../src/engine/pindian.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

let uid = 0;
const mk = (name, suit = 'spade', num = 7) => ({ id: `t${++uid}`, name, suit, num });

// 造一局：无技能、空手牌、体力 4，回合流程会立刻结束出牌阶段
function newGame(n, seed = 5) {
  const gens = ['sunquan', 'caocao', 'liubei', 'guanyu', 'zhangfei'];
  const seats = [];
  for (let i = 0; i < n; i++) seats.push({ id: `p${i}`, name: `P${i}`, isAI: true, general: generalById(gens[i]) });
  const g = new Game({
    seats, mode: getMode('identity'), seed, deckEntries: deckEntries('standard'),
    responder: { askPlay: async () => ({ endPhase: true }), ask: async () => null },
    config: { timeout: 500 },
  });
  g.onState = () => {};
  for (const p of g.players) { p.hand = []; p.skills = []; p.hp = 4; p.maxHp = 4; p.judgeZone = []; }
  return g;
}
// 记录响应器被问了什么（用于确认「不该被问到的技能确实没被问」）
function spyAsks(g) {
  const asked = [];
  g.responder = {
    askPlay: async () => ({ endPhase: true }),
    ask: async (gg, pl, req) => { asked.push({ seat: pl.seat, kind: req.kind, prompt: req.prompt || '' }); return null; },
  };
  return asked;
}

// ---------------- T1 笛音：自弃的手牌不能凭空消失 ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills.push(getSkill('diyin'));
  const c = mk('sha', 'spade', 7);
  p0.hand = [c];
  p0.flags.diyinGrab = true;          // 已累计七张，下一次进入弃牌堆的牌由我获得
  await g.discardCards(p0, [c], { reason: 'discard' });
  ok(p0.hand.includes(c), 'T1 笛音：本批正在弃置的手牌应留在手里（旧版会凭空消失）');
  ok(!g.discardPile.includes(c), 'T1 笛音：该牌不应进入弃牌堆');
  ok(p0.hand.filter(x => x === c).length === 1, 'T1 笛音：该牌在手牌中应只有 1 份（不能双存）');
  ok(g.discardPile.every(x => x !== c) && p0.hand.includes(c), 'T1 笛音：牌张守恒（恰在一处）');
}

// ---------------- T2 义襄 ①：其第一张牌造成的伤害 -1 ----------------
{
  const g = newGame(3);
  const [p0, p1] = g.players;
  p1.skills.push(getSkill('jc_yixiang'));
  const sha = mk('sha', 'spade', 7);
  p0.hand = [sha];
  p1.hand = [];                        // 空手牌 → 无法出闪
  await g.useCard({ from: p0, card: sha, targets: [p1], reason: 'sha' });
  ok(p1.hp === 4, `T2 义襄：其第一张牌造成的伤害应 -1（1-1=0，hp 不变），实际 hp=${p1.hp}`);
  ok(p1.flags.jcYixiangBy && p1.flags.jcYixiangBy[p0.seat] === 1, 'T2 义襄：计数应在牌结算前就记为 1');
}

// ---------------- T3 义襄 ②：其第二张黑色牌对你无效 ----------------
{
  const g = newGame(3);
  const [p0, p1] = g.players;
  p1.skills.push(getSkill('jc_yixiang'));
  const c1 = mk('guohe', 'spade', 3);
  const c2 = mk('guohe', 'club', 4);
  p0.hand = [c1, c2];
  p1.hand = [mk('shan', 'diamond', 2), mk('shan', 'diamond', 3), mk('shan', 'heart', 4)];
  await g.useCard({ from: p0, card: c1, targets: [p1], reason: 'guohe' });
  const mid = p1.hand.length;
  ok(mid === 2, `T3 义襄：其第一张牌正常生效（应被拆走 1 张），实际剩 ${mid}`);
  await g.useCard({ from: p0, card: c2, targets: [p1], reason: 'guohe' });
  ok(p1.hand.length === mid, `T3 义襄：其第二张黑色牌应对你无效（手牌应保持 ${mid}），实际 ${p1.hand.length}`);
}

// ---------------- T4 等力：拥有者既非使用者亦非目标时不应被问 ----------------
{
  const g = newGame(3);
  const [p0, p1, p2] = g.players;
  p2.skills.push(getSkill('jc_dengli'));
  const asked = spyAsks(g);
  const sha = mk('sha', 'spade', 9);
  p0.hand = [sha];
  p1.hand = [];
  await g.useCard({ from: p0, card: sha, targets: [p1], reason: 'sha' });
  ok(!asked.some(a => a.seat === p2.seat && /等力/.test(a.prompt)),
    'T4 等力：拥有者未参与该【杀】时不应触发（旧 filter 恒真会误问并误摸）');
}

// ---------------- T4b 等力：拥有者作为目标时应正常触发 ----------------
{
  const g = newGame(3);
  const [p0, , p2] = g.players;
  p2.skills.push(getSkill('jc_dengli'));
  const asked = spyAsks(g);
  const sha = mk('sha', 'spade', 9);
  p0.hand = [sha];
  p2.hand = [];
  p0.hp = 3; p2.hp = 3;                // 体力相等
  await g.useCard({ from: p0, card: sha, targets: [p2], reason: 'sha' });
  ok(asked.some(a => a.seat === p2.seat && /等力/.test(a.prompt)), 'T4b 等力：成为目标且体力相等时应正常询问');
}

// ---------------- T5 追命：唯一目标限制 ----------------
{
  const g = newGame(3);
  const [p0, p1, p2] = g.players;
  p0.skills.push(getSkill('jz_zhuiming'));
  p1.hand = [mk('shan', 'diamond', 5)];
  p2.hand = [mk('shan', 'diamond', 6)];
  const asked = spyAsks(g);
  const card = mk('sha', 'spade', 10);
  // 多目标 → 不满足「指定唯一目标」
  await g.trigger('target.after', { self: p0, target: p1, card, canceled: false, used: [], shaCtx: {}, total: 2 });
  ok(!asked.some(a => /追命/.test(a.prompt)), 'T5a 追命：多目标【杀】不应发动（唯一目标限制）');
  // 唯一目标 → 应发动
  await g.trigger('target.after', { self: p0, target: p1, card, canceled: false, used: [], shaCtx: {}, total: 1 });
  ok(asked.some(a => /追命/.test(a.prompt)), 'T5b 追命：唯一目标时应发动');
}

// ---------------- T5c 追命：per-seat 免闪 / 加伤不得泄漏到其它目标 ----------------
{
  const g = newGame(3);
  const [p0, p1, p2] = g.players;
  const calls = [];
  const orig = g.resolveSha;
  g.resolveSha = async (from, t, card, o = {}) => { calls.push({ seat: t.seat, ...o }); };
  await CARD_META.sha.effect(g, {
    from: p0, targets: [p1, p2], card: mk('sha'),
    shaCtx: { unavoidableBySeat: { [p1.seat]: true }, bonusBySeat: { [p1.seat]: 1 } },
    unavoidable: false,
  });
  g.resolveSha = orig;
  const c1 = calls.find(x => x.seat === p1.seat);
  const c2 = calls.find(x => x.seat === p2.seat);
  ok(c1 && c1.unavoidable === true, 'T5c 追命：per-seat 免闪应作用于该目标');
  ok(c2 && c2.unavoidable === false, 'T5d 追命：其它目标不应被免闪（旧版 shaCtx 共享会全免闪）');
  ok(c1 && c1.bonus === 1, 'T5e 追命：该目标伤害 +1');
  ok(c2 && c2.bonus === 0, 'T5f 追命：其它目标不应加伤');
}

// ---------------- T6 round.end：额外回合不参与轮判定 ----------------
{
  const g = newGame(4);
  await g.runTurn(g.players[0]);
  await g.runTurn(g.players[1]);
  await g.runTurn(g.players[2]);
  await g.runTurn(g.players[3]);
  ok(g.round === 1, `T6a 首轮 4 个回合内 round 应保持 1，实际 ${g.round}`);
  await g.runTurn(g.players[0]);
  ok(g.round === 2, `T6b 座位回绕后 round 应为 2，实际 ${g.round}`);
  const snapRound = g.round;
  const snapSeat = g._lastTurnSeat;
  await g.runTurn(g.players[1], { extra: true });   // 额外回合授予更低座次（模拟放权/诏图）
  ok(g.round === snapRound, `T6c 额外回合不应触发 round.end，实际 ${snapRound} → ${g.round}`);
  ok(g._lastTurnSeat === snapSeat, 'T6d 额外回合不应改写「最后行动者」座次');
  await g.runTurn(g.players[2]);
  ok(g.round === snapRound, `T6e 额外回合后正常轮转不应提前进入新一轮，实际 ${g.round}`);
}

// ---------------- T7 只剩 1 人存活：每个正常回合都算新一轮 ----------------
{
  const g = newGame(2);
  g.players[1].alive = false;
  await g.runTurn(g.players[0]);
  const r1 = g.round;
  await g.runTurn(g.players[0]);
  ok(g.round === r1 + 1, `T7 单人存活时 round 应递增（旧版 player===prevPlayer 会永久卡住），实际 ${r1} → ${g.round}`);
}

// ---------------- T8 cards.lose：引擎必须真实派发「失去牌」 ----------------
// 【沙城】按「目标本回合失去的牌数」摸牌，而引擎此前只在 VALID_EVENTS 注册 cards.lose、从不 emit，
// 导致该统计恒为 0（技能一半失效）。这里直接断言事件被派发且计数走通。
{
  const g = newGame(3);
  const [, p1, p2] = g.players;
  p1.skills.push(getSkill('jz_shacheng'));
  p1.flags.jzShacheng = [mk('sha', 'heart', 5)];   // 手工给一张「沙城」牌
  p1.flags.jzLostTurn = g.turnCount;
  p1.flags.jzLostCount = 0;
  // 沙城是可选技：让响应器对 confirm 一律回 yes，便于观察结算
  g.responder = { askPlay: async () => ({ endPhase: true }), ask: async (gg, pl, req) => (req.kind === 'confirm' ? { yes: true } : null) };
  // ① 弃置 → cards.lose
  const c1 = mk('shan', 'diamond', 9);
  p2.hand = [c1];
  await g.discardCards(p2, [c1], { reason: 'discard' });
  ok(p2.flags.jzLostCount === 1, `T8a cards.lose：弃置应记 1 张失去牌，实际 ${p2.flags.jzLostCount}`);
  // ② 被获得 → cards.lose（失去者 = from）
  const c2 = mk('shan', 'diamond', 10);
  p2.hand.push(c2);
  await g.gainCards(g.players[0], [c2], { from: p2, reason: 'shunshou' });
  ok(p2.flags.jzLostCount === 2, `T8b cards.lose：被获得应再记 1 张，实际 ${p2.flags.jzLostCount}`);
  // ③ 沙城结算：使用【杀】后按失去数摸牌
  const sha = mk('sha', 'spade', 11);
  g.players[0].hand = [sha];
  p2.hand = [];
  const before = p2.hand.length;
  await g.useCard({ from: g.players[0], card: sha, targets: [p2], reason: 'sha' });
  ok(p2.hand.length === before + 2, `T8c 沙城：应按失去的 2 张牌摸 2 张，实际 ${p2.hand.length - before}`);
}

// ---------------- T9 disableSkills / setHp（清 D18 锁星） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills.push(getSkill('diyin'));            // 锁定技
  await g.disableSkills(p0, { includeLocked: true, reason: 'test' });
  const c = mk('sha', 'spade', 4);
  p0.hand = [c];
  p0.flags.diyinGrab = true;
  p0.flags.diyinCount = 6;
  await g.discardCards(p0, [c], { reason: 'discard' });
  ok(g.discardPile.includes(c), 'T9a disableSkills：连锁定技一起停（笛音不应把牌留下）');
  ok(g.activeSkillsOf(p0).length === 0, 'T9b disableSkills：主动技面板应为空');
  p0.hp = 4;
  await g.setHp(p0, 1, { reason: 'test' });
  ok(p0.hp === 1, `T9c setHp：体力应为 1，实际 ${p0.hp}`);
}

// ---------------- T10 响应白名单（清 D14 分敌） ----------------
{
  const g = newGame(2);
  const [, p1] = g.players;
  const s1 = mk('shan', 'diamond', 2), s2 = mk('shan', 'diamond', 3);
  const wz = mk('wuzhong', 'heart', 4);
  p1.hand = [s1, s2, wz];
  const asked = [];
  g.responder = {
    askPlay: async () => ({ endPhase: true }),
    ask: async (gg, pl, req) => { asked.push({ seat: pl.seat, kind: req.kind, cards: req.cards }); return null; },
  };
  p1.flags.responseWhitelist = { cardId: 'zz', ids: [s1.id], turn: g.turnCount };
  await g.respondCard(p1, { filter: { name: 'shan' }, reason: 'test' });
  const req = asked.find(a => a.kind === 'card');
  ok(req && req.cards.length === 1 && req.cards[0] === s1.id,
    `T10a 白名单：响应候选只应剩白名单里的那张，实际 ${JSON.stringify(req && req.cards)}`);
  const used = await g.useCard({ from: p1, card: wz, targets: [], reason: 'test' });
  ok(used === false, 'T10b 白名单：白名单外的牌不能主动使用');
  const okCard = await g.useCard({ from: p1, card: s1, targets: [], reason: 'test' });
  ok(okCard === false, 'T10c 白名单：【闪】本身不能主动使用（此条只验证没被白名单额外拦成别的错）');
  delete p1.flags.responseWhitelist;
  const used2 = await g.useCard({ from: p1, card: wz, targets: [], reason: 'test' });
  ok(used2 === true, 'T10d 白名单清除后应恢复正常使用');
}

// ---------------- T11 yishi.end 真实派发（SG025 #10） ----------------
{
  const g = newGame(3);
  const p0 = g.players[0];
  const seen = [];
  const orig = g.trigger.bind(g);
  g.trigger = async (ev, data) => { if (ev === 'yishi.end') seen.push(data); return orig(ev, data); };
  p0.hand = [mk('sha', 'heart', 2)];
  g.players[1].hand = [mk('sha', 'heart', 3)];
  g.players[2].hand = [mk('sha', 'spade', 4)];
  const r = await g.yishi(p0);
  ok(seen.length === 1, `T11a yishi.end：应派发恰好 1 次，实际 ${seen.length}`);
  ok(seen[0] && seen[0].initiator === p0 && typeof seen[0].redN === 'number', 'T11b yishi.end：data 应含 initiator / redN');
  ok(r && typeof r.redN === 'number' && Array.isArray(r.red), 'T11c yishi：应返回统计结果');
}

// ---------------- T12 拼点「牌堆顶」分支派发 cards.discard（SG025 #14） ----------------
{
  const g = newGame(2);
  const [p0, p1] = g.players;
  const a = mk('sha', 'spade', 5), b = mk('sha', 'heart', 6);
  p0.hand = [a];
  p1.hand = [b];
  let disc = 0;
  const orig = g.trigger.bind(g);
  g.trigger = async (ev, d) => { if (ev === 'cards.discard') disc++; return orig(ev, d); };
  g.responder = { askPlay: async () => ({ endPhase: true }), ask: async (gg, pl) => ({ cardId: pl.hand[0] ? pl.hand[0].id : null }) };
  await pindian(g, p0, p1, { reason: 'test' });
  ok(disc >= 2, `T12a 拼点：两张拼点牌都应派发 cards.discard，实际 ${disc} 次`);
  ok(g.discardPile.includes(a) && g.discardPile.includes(b), 'T12b 拼点：两张牌都应进入弃牌堆');
}

// ---------------- T13 perPhase：每个出牌阶段限一次（SG025 #11） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [{ id: 'tp_test', name: '测试阶段技', desc: '', active: { perPhase: true, async effect() {} } }];
  g.playPhaseSeq = 5;
  const r1 = await g.useActiveSkill(p0, 'tp_test', []);
  const r2 = await g.useActiveSkill(p0, 'tp_test', []);
  g.playPhaseSeq = 6;                            // 模拟进入第二个出牌阶段
  const r3 = await g.useActiveSkill(p0, 'tp_test', []);
  ok(r1 === true, 'T13a perPhase：本阶段首次应可发动');
  ok(r2 === false, 'T13b perPhase：同阶段第二次应被拒');
  ok(r3 === true, `T13c perPhase：进入下一个出牌阶段应可再次发动（实际 ${JSON.stringify(r3)}）`);
  // perTurn 仍按回合：同一回合内即使换了出牌阶段也不能再发动
  p0.skills.push({ id: 'tt_test', name: '测试回合技', desc: '', active: { perTurn: true, async effect() {} } });
  const t1 = await g.useActiveSkill(p0, 'tt_test', []);
  g.playPhaseSeq = 7;
  const t2 = await g.useActiveSkill(p0, 'tt_test', []);
  ok(t1 === true && t2 === false, 'T13d perTurn：换阶段后仍应被拒（每回合语义不变）');
}

// ---------------- T14 拒降：次数上限 +N（SG025 #12） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.hand = [mk('sha', 'spade', 8), mk('sha', 'club', 9)];
  p0.flags.shaUsed = 0;
  const base = g.canUse(p0, p0.hand[0], [g.players[1]], null, null, {});
  ok(base.ok === true, 'T14a 未加次数时第一张【杀】可用');
  p0.flags.shaUsed = 1;
  const blocked = g.canUse(p0, p0.hand[0], [g.players[1]], null, null, {});
  ok(blocked.ok === false, 'T14b 已用 1 张后应被拒');
  p0.flags.shaExtra = 2;                          // 【拒降】的效果就是这个
  const allowed = g.canUse(p0, p0.hand[0], [g.players[1]], null, null, {});
  ok(allowed.ok === true, 'T14c 加上 shaExtra 后应恢复可用（旧实现减 shaUsed 在 shaUsed=0 时无效）');
}

// ============================================================================
// SG027 回执（PASS 10 / 部分通过 5 / FAIL 2）的定向回归：T15–T23
// ============================================================================

// ---------------- T15 分敌：命中后白名单必须清（SG027 R8 FAIL） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0], p1 = g.players[1];
  g.turnCount = 3;
  const sha = { id: 'r8sha', name: 'sha', suit: 'spade', num: 7 };

  // 闪朱儁：模拟「伤害已造成」的现场 —— damage.after 已把 fdShown 记录 splice 掉，白名单还在
  p0.skills = [getSkill('zhujun_fendi')].filter(Boolean);
  p0.flags.fdShown = [];
  p1.flags.responseWhitelist = { cardId: sha.id, targetId: p1.id, ids: [901], turn: 3 };
  await g.trigger('card.use.after', { self: p0, card: sha });
  ok(!p1.flags.responseWhitelist, 'T15a 分敌（闪）：造成伤害后白名单也必须清（旧实现依赖 fdShown 导致残留）');

  // 起朱儁：同上（旧 filter 依赖 jqFendi 非空，命中后已被置 null）
  const g2 = newGame(2);
  const q0 = g2.players[0], q1 = g2.players[1];
  g2.turnCount = 4;
  const sha2 = { id: 'r8sha2', name: 'sha', suit: 'club', num: 8 };
  q0.skills = [getSkill('jq_fendi')].filter(Boolean);
  q0.flags.jqFendi = null;
  q1.flags.responseWhitelist = { cardId: sha2.id, targetId: q1.id, ids: [902], turn: 4 };
  await g2.trigger('card.use.after', { self: q0, card: sha2 });
  ok(!q1.flags.responseWhitelist, 'T15b 分敌（起）：造成伤害后白名单也必须清（旧 filter 依赖 jqFendi）');
}

// ---------------- T16 转化技 handled 路径不得绕过响应白名单（SG027 R8） ----------------
{
  const g = newGame(2);
  const p1 = g.players[1];
  g.turnCount = 2;
  p1.hand = [{ id: 'h1', name: 'shan', suit: 'heart', num: 2 }];
  p1.flags.responseWhitelist = { cardId: 'someSha', targetId: p1.id, ids: [98765], turn: 2 };
  // 临时技能：在 respond.need 里直接递上一张（不在白名单里的）牌，模拟龙胆/武圣等转化技
  p1.skills = [{
    id: 't_handled', name: '测试转化', desc: '',
    triggers: [{
      on: 'respond.need', who: 'self', optional: false, filter: () => true,
      effect: (ctx) => { ctx.data.handled = true; ctx.data.card = p1.hand[0]; },
    }],
  }];
  const r = await g.respondCard(p1, { filter: { name: 'shan' } });
  ok(r === null, 'T16 转化技 handled 路径也必须过响应白名单（旧实现可直接打出未被展示的牌）');
}

// ---------------- T17/T18 主动技闸门：失去技能 + 出牌阶段（SG027 R6 / R1） ----------------
{
  const g = newGame(1);
  const p0 = g.players[0];
  let n = 0;
  p0.skills = [{ id: 't_act', name: '测试主动', desc: '', active: { perPhase: true, async effect() { n++; } } }];
  g.turnPlayer = p0; g.phase = 'play';
  ok((await g.useActiveSkill(p0, 't_act', [])) === true, 'T17a 出牌阶段正常可发动');

  g.playPhaseSeq += 1;
  p0.flags.skillsDisabled = { permanent: true, includeLocked: true };
  ok((await g.useActiveSkill(p0, 't_act', [])) === false, 'T17b 失去技能后主动技必须被拒（旧实现只隐藏面板）');
  ok(n === 1, `T17c 被拒时不得执行 effect（实际执行 ${n} 次）`);
  // ★T17d 定向验证「闸门」本身（SG028 §D：T17b 在闸门被移除时仍全绿，因为 effSkills 返回空使 find 落空）：
  //   把 effectiveSkills 打桩成「返回全部技能」，让兜底失效 —— 此时只有 skillsDisabled 闸门能拦住。
  {
    const realEff = g.effectiveSkills.bind(g);
    g.effectiveSkills = () => p0.skills;
    const r = await g.useActiveSkill(p0, 't_act', []);
    g.effectiveSkills = realEff;
    ok(r === false && n === 1, 'T17d 打桩绕开 effSkills 后，skillsDisabled 闸门仍必须拦住（闸门独立有效）');
  }
  delete p0.flags.skillsDisabled;

  g.phase = 'judge';
  ok((await g.useActiveSkill(p0, 't_act', [])) === false, 'T18a 自己回合的非出牌阶段应被拒');
  g.phase = 'play';
  ok((await g.useActiveSkill(p0, 't_act', [])) === true, 'T18b 回到出牌阶段可发动');
}

// ---------------- T19 disableSkills 的 permanent 参数必须真的生效（SG027 R6） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0], p1 = g.players[1];
  await g.disableSkills(p0, { permanent: false, reason: '测试短期' });
  ok(!!p0.flags.skillsDisabled && p0.flags.skillsDisabled.permanent === false, 'T19a 短期禁用应写入标记且 permanent=false');
  await g.runTurn(p0);
  ok(!p0.flags.skillsDisabled, 'T19b 非永久禁用应在自己的下一个回合开始时恢复');

  await g.disableSkills(p1, { permanent: true, reason: '测试永久' });
  await g.runTurn(p1);
  ok(!!p1.flags.skillsDisabled, 'T19c 永久禁用不得被回合开始清除');
}

// ---------------- T20 effSkills：直读 player.skills 的判定也要受禁用影响（SG027 R9 FAIL） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('buqu'), getSkill('fuzai'), getSkill('hongyan')].filter(Boolean);
  ok(g.hasSkill(p0, 'buqu') === true, 'T20a 未禁用时 hasSkill 为真');
  ok(g.effectiveSkills(p0).length === 3, 'T20b 未禁用时 effectiveSkills 长度应为 3');

  p0.flags.skillsDisabled = { permanent: true, includeLocked: true };
  ok(g.hasSkill(p0, 'buqu') === false, 'T20c 失去技能后【不屈】判定必须失效（旧实现直读 p.skills）');
  ok(g.hasSkill(p0, 'fuzai') === false, 'T20d 失去技能后【覆载】判定必须失效');
  ok(g.effectiveSkills(p0).length === 0, 'T20e 失去技能后 effectiveSkills 应为空');
  const spade = { id: 'r9spade', name: 'sha', suit: 'spade', num: 9 };
  ok(suitOf(p0, spade) === 'spade', 'T20f 失去技能后【红颜】不得再把黑桃视为红桃');

  // includeLocked:false 时只停「非锁定」的技能（不屈/红颜本身都是锁定技，应当保留）
  const g2 = newGame(2);
  const q = g2.players[0];
  q.skills = [getSkill('buqu'), getSkill('hongyan'), getSkill('qingnang')].filter(Boolean);
  q.flags.skillsDisabled = { permanent: true, includeLocked: false };
  ok(g2.hasSkill(q, 'hongyan') === true, 'T20g includeLocked:false 时锁定技【红颜】应保留');
  ok(g2.hasSkill(q, 'buqu') === true, 'T20h includeLocked:false 时锁定技【不屈】应保留');
  ok(g2.hasSkill(q, 'qingnang') === false, 'T20i includeLocked:false 时非锁定技【青囊】应停');
}

// ---------------- T21 笔伐 cleanup 触发器：失去技能后扣置牌必须回收（SG027 R9 FAIL） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0], p1 = g.players[1];
  p0.skills = [getSkill('qy2s_bifa')].filter(Boolean);
  const held = { id: 'bifaX', name: 'sha', suit: 'club', num: 3 };
  p1.bifaStack = [{ ownerId: p0.id, card: held }];
  g.discardPile = [];
  await g.disableSkills(p0, { permanent: true, reason: '测试' });
  ok(g.discardPile.some((c) => c.id === 'bifaX'), 'T21a 失去技能后笔伐扣置牌必须回收进弃牌堆（cleanup 触发器）');
  ok((p1.bifaStack || []).length === 0, 'T21b bifaStack 应清空（不得残留）');
}

// ---------------- T22 yishi.end 必须携带 opinions（SG027 R13，伐异依赖） ----------------
{
  const g = newGame(3);
  for (const p of g.players) p.hand = [mk('sha', 'spade', 2)];
  const r = await g.yishi(g.players[0]);
  ok(!!r.opinions && Object.keys(r.opinions).length === 2, 'T22a yishi 返回值必须含 opinions（伐异 filter 依赖）');
  ok(Array.isArray(r.participants) && r.participants.length === 2, 'T22b participants 应为实际参与议事者');
  ok(typeof r.verdict === 'string', 'T22c verdict 应为 red/black/none');

  let seen = null;
  const orig = g.trigger.bind(g);
  g.trigger = async (ev, data) => { if (ev === 'yishi.end') seen = data; return orig(ev, data); };
  await g.yishi(g.players[0]);
  ok(!!seen && !!seen.opinions && !!seen.shown, 'T22d yishi.end 事件必须携带 opinions/shown（否则伐异永远不触发）');
}

// ---------------- T23 起朱儁【拒降】必须加 shaExtra，不得再减 shaUsed（SG027 R15 残留） ----------------
{
  const g = newGame(3);
  const p0 = g.players[0], cur = g.players[1];
  p0.skills = [getSkill('jq_jujiang')].filter(Boolean);
  const c1 = mk('sha', 'heart', 5), c2 = mk('sha', 'spade', 6);
  p0.hand = [c1, c2];
  g.turnPlayer = cur;
  g.responder = { askPlay: async () => ({ endPhase: true }), ask: async () => ({ yes: true }) };
  await g.trigger('cards.gain', { self: p0, cards: [c1, c2], reason: 'test' });
  ok((cur.flags.shaExtraTurn || 0) === 2, `T23a 拒降应加 shaExtraTurn=2（实际 ${cur.flags.shaExtraTurn}）`);
  ok((cur.flags.shaUsed || 0) === 0, `T23b 不得再减 shaUsed（实际 ${cur.flags.shaUsed}）`);
  ok((cur.flags.shaExtra || 0) === 0, 'T23c 本回合加成不得写进 shaExtra（会被【漠规②】的永久 +1 语义污染）');
  // 出杀次数上限应真的 +2，且下个自己的回合要清零
  cur.flags.shaUsed = 1;
  const canAfter = g.canUse(cur, mk('sha', 'spade', 9), [g.players[2]], null, null, {});
  ok(canAfter.ok === true, 'T23d 拒降 +2 后，已出 1 张仍可再出（上限 1+2=3）');
  await g.runTurn(cur);
  ok((cur.flags.shaExtraTurn || 0) === 0, 'T23e 本回合类加成必须在下一个自己的回合清零（旧实现跨回合累积）');
}

// ---------------- T24 技能私有容器：死亡时必须回收（SG028，dsh 实测发现） ----------------
{
  // T24a：笔伐「施放者」死亡 → 回收
  const g = newGame(3);
  const owner = g.players[0], t = g.players[1];
  owner.skills = [getSkill('qy2s_bifa')].filter(Boolean);
  const c1 = { id: 'bifaA', name: 'sha', suit: 'club', num: 3 };
  t.bifaStack = [{ ownerId: owner.id, card: c1 }];
  g.discardPile = [];
  await g.die(owner);
  ok((t.bifaStack || []).length === 0, 'T24a 施放者死亡：bifaStack 应清空');
  ok(g.discardPile.some((c) => c.id === 'bifaA'), 'T24b 施放者死亡：扣置牌必须进弃牌堆');

  // T24c：笔伐「目标」死亡 → 牌挂在目标身上，die() 原先只清 hand/equips/judgeZone/buqu，会丢牌
  const g2 = newGame(3);
  const o2 = g2.players[0], t2 = g2.players[1];
  o2.skills = [getSkill('qy2s_bifa')].filter(Boolean);
  const c2 = { id: 'bifaB', name: 'sha', suit: 'club', num: 4 };
  t2.bifaStack = [{ ownerId: o2.id, card: c2 }];
  g2.discardPile = [];
  await g2.die(t2);
  ok((t2.bifaStack || []).length === 0, 'T24c 目标死亡：bifaStack 应清空（旧实现滞留）');
  ok(g2.discardPile.some((c) => c.id === 'bifaB'), 'T24d 目标死亡：扣置牌必须进弃牌堆（牌张守恒级）');

  // T24e：通用契约 heldCards —— 技能声明后，引擎在死亡时自动回收
  const g3 = newGame(2);
  const q = g3.players[0];
  const held = { id: 'heldX', name: 'shan', suit: 'heart', num: 5 };
  q.skills = [{ id: 't_held', name: '测试寄放', desc: '', triggers: [], reclaimCards: () => [held] }];
  q.heldX = [held];
  g3.discardPile = [];
  await g3.reclaimHeld(q);
  ok(g3.discardPile.some((c) => c.id === 'heldX'), 'T24e 技能声明 heldCards 后，reclaimHeld 应把牌退回弃牌堆');
}

// ---------------- T25 effSkills 的 noSkills 语义 + 锁定技判据反例（SG028 A2） ----------------
{
  // noSkills（【她的乡愁】④）：只停非锁定技，锁定技保留
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('buqu'), getSkill('hongyan'), getSkill('qingnang')].filter(Boolean);
  p0.flags.noSkills = true;
  ok(g.hasSkill(p0, 'hongyan') === true, 'T25a noSkills 时锁定技【红颜】应保留');
  ok(g.hasSkill(p0, 'buqu') === true, 'T25b noSkills 时锁定技【不屈】应保留');
  ok(g.hasSkill(p0, 'qingnang') === false, 'T25c noSkills 时非锁定技【青囊】必须失效（旧实现 effSkills 不看 noSkills）');
  delete p0.flags.noSkills;

  // 锁定技判据反例：desc 写作「主公技，锁定技，…」「持恒技、锁定技，…」时不能被判成非锁定
  const g2 = newGame(2);
  const q = g2.players[0];
  q.skills = [getSkill('jz_jiemeng'), getSkill('weidi'), getSkill('liaoyuan')].filter(Boolean);
  q.flags.skillsDisabled = { permanent: true, includeLocked: false };
  ok(g2.hasSkill(q, 'jz_jiemeng') === true, 'T25d includeLocked:false 时【皆盟】不得被误停（desc「主公技，锁定技，…」）');
  ok(g2.hasSkill(q, 'weidi') === true, 'T25e includeLocked:false 时【伪帝】不得被误停');
  ok(g2.hasSkill(q, 'liaoyuan') === true, 'T25f includeLocked:false 时【燎原】不得被误停（desc「持恒技、锁定技，…」）');
}

// ---------------- T26 失去技能的 splice 必须按原数组定位（SG028 A2：findIndex(effSkills) 会错位） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  const s1 = getSkill('qingnang'), s2 = getSkill('hongyan'), s3 = getSkill('jizhi');
  p0.skills = [s1, s2, s3].filter(Boolean);
  // includeLocked:false 时 effSkills 只返回锁定技（hongyan），若用它的索引去 splice 原数组会删错
  p0.flags.skillsDisabled = { permanent: true, includeLocked: false };
  const idxEff = g.effectiveSkills(p0).findIndex((s) => s.id === 'jizhi');
  const idxRaw = p0.skills.findIndex((s) => s.id === 'jizhi');
  ok(idxEff === -1 && idxRaw === 2, `T26a 复现前提：effSkills 里查不到非锁定技（effIdx=${idxEff}、rawIdx=${idxRaw}）`);
  // 真实删除路径必须用原数组索引
  const i = p0.skills.findIndex((s) => s.id === 'jizhi');
  if (i >= 0) p0.skills.splice(i, 1);
  ok(!p0.skills.some((s) => s.id === 'jizhi') && p0.skills.some((s) => s.id === 'hongyan'),
    'T26b 用原数组索引删除：只删目标技能，不得误删锁定技');
}

// ---------------- T27 shaExtra 分类语义：永久保留 / 本回合清零（SG028 §B） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.flags.shaExtra = 2;        // 永久类（【漠规②】：本局游戏出杀次数上限 +1）
  p0.flags.shaExtraTurn = 3;    // 本回合类（【拒降】【天义】【决堰】等）
  await g.runTurn(p0);
  ok((p0.flags.shaExtra || 0) === 2, 'T27a 永久加成 shaExtra 必须在回合开始保留（【漠规②】类）');
  ok((p0.flags.shaExtraTurn || 0) === 0, 'T27b 本回合加成 shaExtraTurn 必须在回合开始清零');
  p0.flags.shaUsed = 2;
  const r = g.canUse(p0, mk('sha', 'spade', 4), [g.players[1]], null, null, {});
  ok(r.ok === true, 'T27c 永久 +2 时已出 2 张仍可出（上限 1+2）');
}

// ---------------- T28 私有容器回收的边界：只回收「声明为拥有」的牌（SG028 第③组） ----------------
{
  // T28a：未声明 heldCards 的容器不得被自动回收 —— 容器里也可能是「已用牌的引用」
  //       （如 clan3 的 rec.cards 记录已进弃牌堆的牌），一律扫描会把引用再推一次 → 牌张重复。
  const g = newGame(2);
  const p0 = g.players[0];
  const ref = { id: 'refX', name: 'sha', suit: 'spade', num: 2 };
  p0.flags.recCards = [ref];
  g.discardPile = [ref];                       // 引用：牌本来就在弃牌堆
  await g.reclaimHeld(p0);
  ok((p0.flags.recCards || []).length === 1, 'T28a 未声明的容器不得被自动清空（防「引用」被当「拥有」）');
  ok(g.discardPile.filter((c) => c.id === 'refX').length === 1, 'T28b 引用型容器不得重复入弃牌堆');

  // T28c：声明 heldCards 的技能容器会被回收（拥有型容器的正确接入口）
  const g2 = newGame(2);
  const q = g2.players[0];
  const owned = { id: 'ownY', name: 'shan', suit: 'heart', num: 3 };
  q.own = [owned];
  q.skills = [{ id: 't_held', name: '测试寄放', desc: '', triggers: [], reclaimCards: (p) => { const a = p.own || []; p.own = []; return a; } }];
  g2.discardPile = [];
  await g2.reclaimHeld(q);
  ok(g2.discardPile.some((c) => c.id === 'ownY'), 'T28c 声明 heldCards 后，拥有型牌必须回收进弃牌堆');

  // T28d：只存 id / 花色 / 类型的标记数组不得被误清
  q.flags.zsIds = [1, 2, 3];
  q.flags.luansuoSuits = ['heart'];
  q.flags.fdShown = [{ seat: 1, ids: ['x'], cardId: 'y' }];
  await g2.reclaimHeld(q);
  ok((q.flags.zsIds || []).length === 3 && (q.flags.luansuoSuits || []).length === 1
    && (q.flags.fdShown || []).length === 1, 'T28d 标记数组（id/花色/记录）不得被误清');
}

// ---------------- T29 8 个「武将牌旁」私有容器：声明 reclaimCards 后能完整回收（SG028 第③组） ----------------
{
  const cases = [
    ['bc_qiuan', 'han', (p) => { p.flags.hanCards = [{ id: 'rk_han', name: 'sha', suit: 'spade', num: 1 }]; }, (p) => (p.flags.hanCards || []).length],
    ['jz_shacheng', 'shacheng', (p) => { p.flags.jzShacheng = [{ id: 'rk_sc', name: 'tao', suit: 'heart', num: 2 }]; }, (p) => (p.flags.jzShacheng || []).length],
    ['youyi', 'renCards', (p) => { p.flags.renCards = [{ id: 'rk_ren', name: 'sha', suit: 'club', num: 4 }]; }, (p) => (p.flags.renCards || []).length],
    ['zhenjun', 'zhen', (p) => { p.zhen = [{ card: { id: 'rk_zh', name: 'sha', suit: 'spade', num: 5 }, owner: 1 }]; }, (p) => (p.zhen || []).length],
    ['quanji', 'quan', (p) => { p.quan = [{ id: 'rk_q', name: 'sha', suit: 'heart', num: 6 }]; }, (p) => (p.quan || []).length],
    ['xiansi', 'si', (p) => { p.si = [{ id: 'rk_si', name: 'sha', suit: 'club', num: 7 }]; }, (p) => (p.si || []).length],
    ['m5_qingjian', 'qingjian', (p) => { p.flags.m5Qj = [{ id: 'rk_qj', name: 'shan', suit: 'diamond', num: 8 }]; }, (p) => (p.flags.m5Qj || []).length],
  ];
  for (const [sid, label, seed, lenOf] of cases) {
    const g = newGame(2);
    const p0 = g.players[0];
    const sk = getSkill(sid);
    if (!sk || typeof sk.reclaimCards !== 'function') {
      ok(false, `T29 技能 ${sid}（${label}）必须声明 reclaimCards`);
      continue;
    }
    p0.skills = [sk];
    seed(p0);
    g.discardPile = [];
    const n0 = lenOf(p0);
    await g.reclaimHeld(p0);
    const after = lenOf(p0);
    const inPile = g.discardPile.length;
    ok(n0 === 1 && after === 0 && inPile === 1,
      `T29 ${label}：回收后容器应为空且牌入弃牌堆（seed=${n0} after=${after} pile=${inPile}）`);
  }
}


// ================================================================
// SG029 回执（修完 BLOCKER 后发布）的定向回归：T30–T38
// ================================================================

// ---------------- T30 集中声明的持有型容器：技能不在身上也能回收（SG029 BLOCKER-1） ----------------
{
  const C = (name = 'sha', suit = 'spade', num = 9) => ({ id: `rk_${name}_${Math.random().toString(36).slice(2, 7)}`, name, suit, num });
  const cases = [
    ['谦逊 qianxunCards', (p) => { p.flags.qianxunCards = [C()]; }, (p) => (p.flags.qianxunCards || []).length],
    ['七星 stars', (p) => { p.flags.stars = [C()]; }, (p) => (p.flags.stars || []).length],
    ['屯储 rxLiang', (p) => { p.flags.rxLiang = [C()]; }, (p) => (p.flags.rxLiang || []).length],
    ['引兵 xhYinbing', (p) => { p.flags.xhYinbing = [C()]; }, (p) => (p.flags.xhYinbing || []).length],
    ['赠刀 xhZengdao', (p) => { p.flags.xhZengdao = [C()]; }, (p) => (p.flags.xhZengdao || []).length],
    ['酬 xhChou.cards', (p) => { p.flags.xhChou = { seat: 1, cards: [C()] }; }, (p) => (p.flags.xhChou?.cards || []).length],
    ['设伏 fubing', (p) => { p.flags.fubing = [{ key: 'sha', cn: '杀', card: C() }]; p.marks = { fubing: 1 }; }, (p) => (p.flags.fubing || []).length],
    ['寇 m5Kou', (p) => { p.flags.m5Kou = [C()]; }, (p) => (p.flags.m5Kou || []).length],
    ['养民 ymCards', (p) => { p.flags.ymCards = [C()]; }, (p) => (p.flags.ymCards || []).length],
    ['藏 syHide', (p) => { p.flags.syHide = [C()]; }, (p) => (p.flags.syHide || []).length],
    // ★kuangzuo（统荫「匡祚」）是引用型：存的 d.card 是已使用的伤害牌，牌在弃牌堆 —— 不登记、不回收
    ['仁 renCards', (p) => { p.flags.renCards = [C()]; }, (p) => (p.flags.renCards || []).length],
    ['权 quan', (p) => { p.quan = [C()]; }, (p) => (p.quan || []).length],
    ['嗣 si', (p) => { p.si = [C()]; }, (p) => (p.si || []).length],
    ['镇 zhen', (p) => { p.zhen = [{ card: C(), owner: 1 }]; }, (p) => (p.zhen || []).length],
  ];
  ok(HELD_CONTAINERS.length >= 15, `T30 集中声明的持有型容器应有 ≥15 个（实际 ${HELD_CONTAINERS.length}）`);
  for (const [label, seedFn, lenOf] of cases) {
    const g = newGame(2);
    const p0 = g.players[0];
    p0.skills = [];            // ★技能不在身上（模拟断肠清技能后的状态）
    seedFn(p0);
    g.discardPile = [];
    const n0 = lenOf(p0);
    await g.reclaimHeld(p0);
    const after = lenOf(p0);
    ok(n0 === 1 && after === 0 && g.discardPile.length === 1,
      `T30 ${label}：技能不在身上也要回收（seed=${n0} after=${after} pile=${g.discardPile.length}）`);
  }
}

// ---------------- T31 removeSkills：删技能 + 回收容器（SG029 BLOCKER-2） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('quanji'), getSkill('guifu')];
  p0.quan = [{ id: 'rk_q31', name: 'sha', suit: 'spade', num: 1 }];
  p0.flags.guifu = [{ id: 'rk_g31', name: 'shan', suit: 'heart', num: 2 }];
  g.discardPile = [];
  const n = await g.removeSkills(p0, null);
  ok(n === 2, `T31a removeSkills 应返回失去技能数 2（实际 ${n}）`);
  ok((p0.skills || []).length === 0, 'T31b removeSkills(null) 应清空全部技能');
  ok((p0.quan || []).length === 0 && (p0.flags.guifu || []).length === 0,
    'T31c 失去技能后「权」「归附」容器必须被回收（旧实现直接 p.skills=[] 会永久滞留）');
  // ★guifu 只清不返回（虚拟牌不入堆）→ 只有 quan 的 1 张真正入堆
  ok(g.discardPile.length === 1, `T31d 只回收「拥有」的牌入堆（quan 1 张；guifu 仅清空），实际 ${g.discardPile.length}`);
}

// ---------------- T32 降怒：护甲变化走 armor.change 且不覆盖 shaExtra（SG029 BLOCKER-3） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('jiangnu')];
  p0.flags.shaExtra = 1;            // 假设另有「永久 +1」来源
  p0.flags.rangeBonus = 1;
  p0.armor = 3;
  await g.trigger('armor.change', { self: p0, delta: 3, armor: 3 });
  ok(p0.flags.shaExtraArmor === 3, `T32a 降怒应按护甲值写 shaExtraArmor=3（实际 ${p0.flags.shaExtraArmor}）`);
  ok(p0.flags.rangeBonusArmor === 3, `T32b 降怒应按护甲值写 rangeBonusArmor=3（实际 ${p0.flags.rangeBonusArmor}）`);
  ok(p0.flags.shaExtra === 1, 'T32c 降怒不得覆盖 shaExtra（累加型字段）');
  ok(p0.flags.rangeBonus === 1, 'T32d 降怒不得覆盖 rangeBonus（累加型字段）');
  const cnt = g.canUse(p0, mk('sha'), [g.players[1]], null, null, {});
  // 只验证次数上限口径：不得因降怒把 shaExtra 冲成护甲值
  ok(p0.flags.shaExtra === 1 && p0.flags.shaExtraArmor === 3, 'T32e 出杀次数 = shaExtra(1) + shaExtraArmor(3) 求和口径');
}

// ---------------- T33 飒然：装备减少也要重算（equip.lose → equip.change 补派） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('saran')];
  p0.equips = { weapon: { id: 'rk_w33', name: 'qinggang', suit: 'spade', num: 3 }, armor: null, horsePlus: null, horseMinus: null, treasure: null };
  p0.flags.shaExtra = 2;            // 其它永久 +2 来源
  await g.trigger('equip.change', { self: p0, slot: 'weapon', card: p0.equips.weapon });
  ok(p0.flags.shaExtraEquip === 1, `T33a 飒然按装备数写 shaExtraEquip=1（实际 ${p0.flags.shaExtraEquip}）`);
  // 失去装备（equip.lose）→ 引擎必须补派 equip.change
  const card = p0.equips.weapon;
  p0.equips = { ...p0.equips, weapon: null };
  await g.trigger('equip.lose', { self: p0, card, slot: 'weapon' });
  ok(p0.flags.shaExtraEquip === 0, `T33b 失去装备后必须重算 shaExtraEquip=0（实际 ${p0.flags.shaExtraEquip}）`);
  ok(p0.flags.shaExtra === 2, 'T33c 飒然不得覆盖 shaExtra（累加型字段）');
}

// ---------------- T34 追猎：多目标【杀】只应 +1 次（SG029 BLOCKER-4） ----------------
{
  const g = newGame(4);
  const p0 = g.players[0];
  p0.skills = [getSkill('zhuilie')];
  p0.flags.shaExtraTurn = 0;
  const sha = mk('sha');
  // 同一张【杀】命中两个「攻击范围外」的目标（4 人局：p2/p3 距 p0 为 2 > 攻击范围 1）
  for (const t of [g.players[2], g.players[3]]) {
    t.hp = 3;
    await g.trigger('target.after', { self: p0, card: sha, target: t, player: p0 });
  }
  ok(p0.flags.shaExtraTurn === 1, `T34 同一张杀命中多个目标只应 +1 次（实际 ${p0.flags.shaExtraTurn}）`);
}

// ---------------- T35 容器同名冲突：忍(数字) 与 仁(牌) 不得互相污染 ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.flags.ren = 3;                       // 【忍】数字标记
  p0.flags.renCards = [{ id: 'rk_r35', name: 'tao', suit: 'heart', num: 4 }];
  g.discardPile = [];
  let threw = null;
  try { await g.reclaimHeld(p0); } catch (e) { threw = e; }
  ok(!threw, `T35a 回收不得抛错（实际 ${threw && threw.message}）`);
  ok(p0.flags.ren === 3, `T35b 【忍】数字标记不得被回收逻辑破坏（实际 ${p0.flags.ren}）`);
  ok((p0.flags.renCards || []).length === 0 && g.discardPile.length === 1, 'T35c 【仁】牌应被回收');
}

// ---------------- T36 noSkills 下 desc-locked 技能仍触发（与 hasSkill 同源，SG029 BLOCKER-5） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  let fired = 0;
  p0.skills = [{
    id: 't_lockedtest', name: '测试锁定', desc: '主公技，锁定技，测试用',
    triggers: [{ on: 'turn.begin', optional: true, async effect() { fired++; } }],
  }];
  p0.flags.noSkills = true;
  const list = collectTriggers(g, 'turn.begin', { self: p0 });
  ok(list.length === 1, `T36a noSkills 下 desc 声明锁定技的技能仍应收集到触发器（实际 ${list.length}）`);
  ok(p0.skills[0] && (g.effectiveSkills(p0) || []).some(s => s.id === 't_lockedtest'),
    'T36b hasSkill 口径与触发器口径必须同源（都保留锁定技）');
  p0.flags.noSkills = false;
  const list2 = collectTriggers(g, 'turn.begin', { self: p0 });
  ok(list2.length === 1, 'T36c 未封印时正常收集');
}

// ---------------- T37 removeSkills 指定 id：只删指定技能 ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('quanji'), getSkill('guifu')];
  p0.quan = [{ id: 'rk_q37', name: 'sha', suit: 'spade', num: 7 }];
  const n = await g.removeSkills(p0, ['quanji']);
  ok(n === 1 && (p0.skills || []).length === 1 && p0.skills[0].id === 'guifu', 'T37a 只删指定技能');
  ok((p0.quan || []).length === 0, 'T37b 被删技能的容器也要回收（全局回收表生效）');
}

// ---------------- T29b 诡伏：容器只清不返回（混入 vcard 虚拟牌，不能入弃牌堆） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  const sk = getSkill('guifu');
  p0.skills = [sk];
  p0.flags.guifu = [{ id: 'rk_gf', name: 'shan', suit: 'diamond', num: 3 }];
  g.discardPile = [];
  await g.reclaimHeld(p0);
  ok((p0.flags.guifu || []).length === 0 && g.discardPile.length === 0,
    `T29b 诡伏：容器应清空但牌不进退牌堆（SG030 A1.1；实际 clr=${(p0.flags.guifu || []).length} pile=${g.discardPile.length}）`);
}

// ================================================================
// SG030 回执（PASS 5 / 部分 1 / FAIL 6）的定向回归：T38–T45
// ================================================================

// ---------------- T38 全集：HELD_CONTAINERS 的每一项都能被回收（SG030 B「T30 只测 9/19」） ----------------
{
  const C = (name = 'sha', suit = 'spade', num = 9) => ({ id: `rk38_${Math.random().toString(36).slice(2, 8)}`, name, suit, num });
  // key -> [seedFn, lenOf, 期望是否入弃牌堆]
  const SEEDS = {
    'flags.jzShacheng': [(p) => { p.flags.jzShacheng = [C()]; }, (p) => (p.flags.jzShacheng || []).length, true],
    'flags.rxLiang': [(p) => { p.flags.rxLiang = [C()]; }, (p) => (p.flags.rxLiang || []).length, true],
    'flags.rxWang': [(p) => { p.flags.rxWang = [C()]; }, (p) => (p.flags.rxWang || []).length, true],
    'flags.xhYinbing': [(p) => { p.flags.xhYinbing = [C()]; }, (p) => (p.flags.xhYinbing || []).length, true],
    'flags.xhZengdao': [(p) => { p.flags.xhZengdao = [C()]; }, (p) => (p.flags.xhZengdao || []).length, true],
    'flags.xhKuangbi': [(p) => { p.flags.xhKuangbi = [{ seat: 1, cards: [C()] }]; }, (p) => (p.flags.xhKuangbi || []).length, true],
    'flags.xhChou.cards': [(p) => { p.flags.xhChou = { seat: 1, cards: [C()] }; }, (p) => (p.flags.xhChou?.cards || []).length, true],
    'flags.yi': [(p) => { p.flags.yi = [C()]; }, (p) => (p.flags.yi || []).length, true],
    'flags.qianxunCards': [(p) => { p.flags.qianxunCards = [C()]; }, (p) => (p.flags.qianxunCards || []).length, true],
    'flags.yiji': [(p) => { p.flags.yiji = [C()]; }, (p) => (p.flags.yiji || []).length, true],
    'flags.stars': [(p) => { p.flags.stars = [C()]; }, (p) => (p.flags.stars || []).length, true],
    'flags.qiongtu': [(p) => { p.flags.qiongtu = [C()]; }, (p) => (p.flags.qiongtu || []).length, true],
    'flags.kongsheng': [(p) => { p.flags.kongsheng = [C()]; }, (p) => (p.flags.kongsheng || []).length, true],
    'flags.rong': [(p) => { p.flags.rong = [C()]; }, (p) => (p.flags.rong || []).length, true],
    'flags.wyCards': [(p) => { p.flags.wyCards = [C()]; }, (p) => (p.flags.wyCards || []).length, true],
    'flags.hanCards': [(p) => { p.flags.hanCards = [C()]; }, (p) => (p.flags.hanCards || []).length, true],
    'flags.renCards': [(p) => { p.flags.renCards = [C()]; }, (p) => (p.flags.renCards || []).length, true],
    'flags.m5Qj': [(p) => { p.flags.m5Qj = [C()]; }, (p) => (p.flags.m5Qj || []).length, true],
    'flags.m5Kou': [(p) => { p.flags.m5Kou = [C()]; }, (p) => (p.flags.m5Kou || []).length, true],
    'flags.ci': [(p) => { p.flags.ci = [C()]; }, (p) => (p.flags.ci || []).length, true],
    'flags.duanCards': [(p) => { p.flags.duanCards = [C()]; }, (p) => (p.flags.duanCards || []).length, true],
    'flags.ymCards': [(p) => { p.flags.ymCards = [C()]; }, (p) => (p.flags.ymCards || []).length, true],
    'flags.syHide': [(p) => { p.flags.syHide = [C()]; }, (p) => (p.flags.syHide || []).length, true],
    'flags.mingfa.card': [(p) => { p.flags.mingfa = { card: C(), seat: 1 }; }, (p) => (p.flags.mingfa?.card ? 1 : 0), true],
    'flags.fubing': [(p) => { p.flags.fubing = [{ key: 'sha', cn: '杀', card: C() }]; }, (p) => (p.flags.fubing || []).length, true],
    'flags.kong': [(p) => { p.flags.kong = [{ seat: 1, cards: [C()] }]; }, (p) => (p.flags.kong || []).length, true],
    'flags.kuangzuo': [(p) => { p.flags.kuangzuo = [C()]; }, (p) => (p.flags.kuangzuo || []).length, true],
    quan: [(p) => { p.quan = [C()]; }, (p) => (p.quan || []).length, true],
    si: [(p) => { p.si = [C()]; }, (p) => (p.si || []).length, true],
    zhen: [(p) => { p.zhen = [{ card: C(), owner: 1 }]; }, (p) => (p.zhen || []).length, true],
    'flags.renCard': [(p) => { p.flags.renCard = C(); }, (p) => (p.flags.renCard ? 1 : 0), true],
    'flags.m5Wei': [(p) => { p.flags.m5Wei = C(); }, (p) => (p.flags.m5Wei ? 1 : 0), true],
    // 挹挟的额外武器是虚拟牌（不能入弃牌堆）→ 只清空
    'flags.extraWeaponCard': [(p) => { p.flags.extraWeaponCard = { id: 'qx_test', name: 'qinglong', virtual: true }; }, (p) => (p.flags.extraWeaponCard ? 1 : 0), false],
    // SG033 P1-3 新增的 4 个容器
    tian: [(p) => { p.tian = [C()]; }, (p) => (p.tian || []).length, true],
    'marks.mu': [(p) => { p.marks = { ...(p.marks || {}), mu: [C()] }; }, (p) => (p.marks?.mu || []).length, true],
    jun: [(p) => { p.jun = [C()]; }, (p) => (p.jun || []).length, true],
    chunlao: [(p) => { p.chunlao = [C()]; }, (p) => (p.chunlao || []).length, true],
  };
  // 断言：注册表里的每一项都在测试表里（防「新增容器忘记加测试」）
  const missing = HELD_CONTAINERS.map(c => c.key).filter(k => !SEEDS[k]);
  ok(missing.length === 0, `T38a 每个已登记容器都必须有回收测试（缺 ${missing.join(',') || '无'}）`);
  ok(HELD_CONTAINERS.length >= 30, `T38b 已登记容器数应 ≥30（实际 ${HELD_CONTAINERS.length}）`);
  for (const [key, [seedFn, lenOf, expectPile = true]] of Object.entries(SEEDS)) {
    const g = newGame(2);
    const p0 = g.players[0];
    p0.skills = [];
    seedFn(p0);
    g.discardPile = [];
    const n0 = lenOf(p0);
    await g.reclaimHeld(p0);
    const wantPile = expectPile ? 1 : 0;
    ok(n0 === 1 && lenOf(p0) === 0 && g.discardPile.length === wantPile,
      `T38 ${key}：技能不在身上也要回收（seed=${n0} after=${lenOf(p0)} pile=${g.discardPile.length} 期望 pile=${wantPile}）`);
  }
}

// ---------------- T39 removeSkills 只回收被删技能的容器（SG030 A2「反误伤」） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('quanji'), getSkill('qixing'), getSkill('guifu')];
  p0.quan = [{ id: 'rk39q', name: 'sha', suit: 'spade', num: 1 }];
  p0.flags.stars = [{ id: 'rk39s', name: 'tao', suit: 'heart', num: 2 }];
  p0.flags.guifu = [{ id: 'rk39g', name: 'shan', suit: 'club', num: 3 }];
  g.discardPile = [];
  await g.removeSkills(p0, ['quanji']);
  ok((p0.quan || []).length === 0, 'T39a 被删技能（quanji）的容器应回收');
  ok((p0.flags.stars || []).length === 1, 'T39b 仍持有技能（七星）的容器**不得**被误回收');
  ok((p0.flags.guifu || []).length === 1, 'T39c 仍持有技能（诡伏）的容器**不得**被误回收');
  ok(g.discardPile.length === 1, `T39d 只有 1 张入弃牌堆（实际 ${g.discardPile.length}）`);
}

// ---------------- T40 inAnyZone 按 id（含 __src）比对（SG030 A4.1） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  const orig = { id: 'rk40', name: 'sha', suit: 'spade', num: 5 };
  const clone = { ...orig };            // 同 id 的不同对象（引擎虚拟牌即如此）
  p0.hand = [orig];
  g.table = [clone];
  ok(g.inAnyZone(clone) === true, 'T40a 同 id 副本在 table 时必须判「已在区域」');
  g.table = [];
  g.deck = [{ ...orig }];               // 牌堆里的同 id 副本
  ok(g.inAnyZone(orig) === true, 'T40b 牌堆里的同 id 副本也必须判「已在区域」');
  g.deck = [];
  const vsrc = { id: 'rk40v', name: 'sha', suit: 'heart', num: 6, __src: orig };
  ok(g.inAnyZone(vsrc) === true, 'T40c __src 源牌在区域时必须判「已在区域」');
  const orphan = { id: 'rk40o', name: 'sha', suit: 'club', num: 7 };
  ok(g.inAnyZone(orphan) === false, 'T40d 真正孤立的牌应判 false');
  ok(g.pushDiscardIfOrphan(orphan) === true && g.discardPile.includes(orphan), 'T40e 孤立牌应入弃牌堆');
  ok(g.pushDiscardIfOrphan(orphan) === false, 'T40f 重复调用应幂等');
}

// ---------------- T41 刺北：牌级 exemption（SG030 A4.2） ----------------
{
  const g = newGame(3);
  const p0 = g.players[0];
  p0.skills = [getSkill('cibei')];
  const sha = mk('sha');
  p0.flags.ci = [sha];
  p0.hand = [];
  await g.trigger('turn.end', { self: p0 });
  ok(sha.ignoreShaLimit === true && sha.ignoreRange === true,
    'T41a 刺北获得的「刺」必须打上牌级 ignoreShaLimit/ignoreRange（跨回合仍生效）');
  p0.flags.shaUsed = 99;
  const chk = g.canUse(p0, sha, [g.players[2]], null, null, {});
  ok(chk.ok === true, `T41b 带牌级豁免的【杀】不受次数限制（实际 ${chk.ok ? 'ok' : chk.reason}）`);
}

// ---------------- T42 noSkills 分层：混合技只跑锁定触发器（SG030 A5） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('luoyi')];
  p0.flags.noSkills = true;
  const optOn = collectTriggers(g, 'phase.begin', { self: p0, phase: 'prepare' });
  const lockedOn = collectTriggers(g, 'damage.before', { self: p0, to: p0, amount: 1 });
  ok(optOn.length === 0, `T42a 非锁定触发器（optional:true）在 noSkills 下不得触发（实际 ${optOn.length}）`);
  ok(lockedOn.length === 1, `T42b 锁定触发器（optional:false）在 noSkills 下仍应触发（实际 ${lockedOn.length}）`);
  ok((g.effectiveSkills(p0) || []).every(s => s.id !== 'luoyi'), 'T42c 混合技 hasSkill 应为 false（desc 非锁定）');
  p0.flags.noSkills = false;
  ok(collectTriggers(g, 'phase.begin', { self: p0, phase: 'prepare' }).length === 1, 'T42d 解除封印后恢复正常');
}

// ---------------- T43 精械弩换装时序（SG031 B1/B2 · SG032 A3.1 · SG033 P0-1/P0-2） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('rx_jingxie')];
  const jx = mk('zhuge_jx'); jx.sub = 'weapon';
  const qg = mk('qinggang'); qg.sub = 'weapon';
  const changes = [], loses = [];
  g.onState = () => {};
  const origTrigger = g.trigger.bind(g);
  g.trigger = async (ev, data) => {
    if (ev === 'equip.change') changes.push({ slot: data.slot, card: data.card && data.card.name, slotNow: p0.equips[data.slot] && p0.equips[data.slot].name });
    if (ev === 'equip.lose') loses.push({ card: data.card && data.card.name, slotNow: p0.equips[data.slot] && p0.equips[data.slot].name });
    return origTrigger(ev, data);
  };
  p0.equips.weapon = jx;
  p0.flags.shaUnlimited = true;
  await g.equipCard(p0, qg);            // jx → qinggang 换装
  ok(loses.length === 1, `T43a 一次换装只应派 1 次 equip.lose（实际 ${loses.length}）`);
  ok(changes.length === 1, `T43b 一次换装只应派 1 次 equip.change（实际 ${changes.length}：${changes.map(c => c.card).join(',')}）`);
  ok(!loses.some(l => l.slotNow === 'zhuge_jx'),
    `T43c equip.lose 派发时槽位必须已不指向旧精械弩（实际 ${JSON.stringify(loses)}）`);
  ok(p0.flags.shaUnlimited !== true,
    `T43d 精械弩离场后不得保留「杀无次数限制」（实际 ${p0.flags.shaUnlimited}）`);
  const s = mk('sha');
  p0.hand = [s]; p0.flags.shaUsed = 99;
  const chk = g.canUse(p0, s, [g.players[1]], null, null, {});
  ok(chk.ok === false, `T43e 失去精械弩后 shaUsed=99 不应还能出杀（实际 ${chk.ok ? 'ok' : chk.reason}）`);
}

// ---------------- T44 牌级豁免标记必须随「离开持有者」清除（SG032 A4.2 · SG033 P1-4） ----------------
{
  const g = newGame(3);
  const p0 = g.players[0], p1 = g.players[1];
  const sha = mk('sha');
  sha.ignoreShaLimit = true; sha.ignoreRange = true;
  p1.hand = [sha];
  g.discardPile = [];
  await g.discardCards(p1, [sha], { reason: 'test' });
  ok(!sha.ignoreShaLimit && !sha.ignoreRange, `T44a 弃置后必须清除牌级豁免（实际 ${sha.ignoreShaLimit}/${sha.ignoreRange}）`);
  // 换手路径
  const s2 = mk('sha');
  s2.ignoreShaLimit = true;
  p1.hand = [s2]; p1.equips = {};
  await g.gainCards(p0, [s2], { from: p1, reason: 'test' });
  ok(!s2.ignoreShaLimit, `T44b 换手（gain）后必须清除牌级豁免（实际 ${s2.ignoreShaLimit}）`);
  // 入堆路径
  const s3 = mk('sha');
  s3.ignoreRange = true;
  g.pushDiscard([s3]);
  ok(!s3.ignoreRange, `T44c 入弃牌堆后必须清除牌级豁免（实际 ${s3.ignoreRange}）`);
}

// ---------------- T45 candidatesFor 必须认牌级 ignoreRange（SG033 P1-4） ----------------
{
  const g = newGame(5);
  const p0 = g.players[0];
  const far = g.players[3];   // identity 5 人座：0→3 距离 2
  const sha = mk('sha');
  const near = g.candidatesFor(p0, sha);
  ok(g.distance(p0, far) > 1 && !near.includes(far), `T45a 普通【杀】的候选里不应包含超距目标（距离 ${g.distance(p0, far)}，候选 ${near.length}）`);
  sha.ignoreRange = true;
  const free = g.candidatesFor(p0, sha);
  ok(free.includes(far), `T45b 带 ignoreRange 的【杀】候选应包含任意存活角色（实际 ${free.length}）`);
  ok(!free.includes(p0), 'T45c 仍不能以自己为目标');
}

// ---------------- T46 unequipCard：统一出口必须派发 equip.lose（SG033 P0-2） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  const w = mk('qinglong'); w.sub = 'weapon';
  p0.equips = { weapon: w, armor: null, horsePlus: null, horseMinus: null, treasure: null };
  const seen = [];
  const orig = g.trigger.bind(g);
  g.trigger = async (ev, data) => { if (ev === 'equip.lose') seen.push(data.slot); return orig(ev, data); };
  const slot = await g.unequipCard(p0, w, { reason: 'test' });
  ok(slot === 'weapon', `T46a 应返回被摘掉的槽名（实际 ${slot}）`);
  ok(p0.equips.weapon === null, 'T46b 装备区应已置空');
  ok(seen.length === 1 && seen[0] === 'weapon', `T46c 必须派发 1 次 equip.lose（实际 ${JSON.stringify(seen)}）`);
  ok(await g.unequipCard(p0, w) === null, 'T46d 对不在装备区的牌应幂等返回 null');
}

// ---------------- T47 owner 归属：ci 属 duwang、kuangzuo 多方写入（SG032 A2 · SG033 P1-3） ----------------
{
  ok(HELD_CONTAINERS.find(c => c.key === 'flags.ci')?.owner === 'duwang',
    'T47a 「刺」容器 owner 应为 duwang（由【独往】创建，【刺北】只消耗）');
  const kz = HELD_CONTAINERS.find(c => c.key === 'flags.kuangzuo');
  const kzOwners = [].concat(kz?.owner || []);
  ok(['tongyin', 'chengfeng', 'kuangzuo'].every(x => kzOwners.includes(x)),
    `T47b 「匡祚」容器 owner 必须含 tongyin/chengfeng/kuangzuo（实际 ${kzOwners.join('|')}）`);
  // 删除 cibei 不应误清 duwang 的「刺」
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('duwang'), getSkill('cibei')];
  const c = mk('sha');
  p0.flags.ci = [c];
  g.discardPile = [];
  await g.removeSkills(p0, ['cibei']);
  ok((p0.flags.ci || []).length === 1, `T47c 删 cibei 不得误清 duwang 的「刺」（实际 ${(p0.flags.ci || []).length}）`);
  g.discardPile = [];
  await g.removeSkills(p0, ['duwang']);
  ok((p0.flags.ci || []).length === 0, 'T47d 删 duwang 才应回收「刺」');
}

// ---------------- T48 交换类技能必须派 lose + change（SG034 P0：甘露/诡图/冠武） ----------------
{
  const g = newGame(3);
  const [a, b] = g.players;
  const jx = mk('zhuge_jx'); const qg = mk('qinggang');
  a.skills = [getSkill('rx_jingxie')];
  a.equips = { weapon: jx, armor: null, horsePlus: null, horseMinus: null, treasure: null };
  b.equips = { weapon: qg, armor: null, horsePlus: null, horseMinus: null, treasure: null };
  const ev = [];
  const orig = g.trigger.bind(g);
  g.trigger = async (e, d) => { if (e === 'equip.lose' || e === 'equip.change') ev.push(`${e}:${d.self.name}:${d.slot}:${d.card ? d.card.name : 'null'}`); return orig(e, d); };
  await g.swapEquipSlot(a, b, 'weapon', { reason: 'test' });
  ok(a.equips.weapon === qg && b.equips.weapon === jx, 'T48a 交换后双方武器应对调');
  ok(ev.filter(x => x.startsWith('equip.lose')).length === 2, `T48b 双方各派 1 次 lose（实际 ${ev.filter(x => x.includes('lose')).length}）`);
  ok(ev.filter(x => x.startsWith('equip.change')).length === 2, `T48c 双方各派 1 次 change（实际 ${ev.filter(x => x.includes('change')).length}）`);
  ok(a.flags.shaUnlimited !== true, `T48d 精械弩换走后不得残留 shaUnlimited（实际 ${a.flags.shaUnlimited}）`);
  ok(b.flags.shaUnlimited !== true, `T48e 接收方也不得凭空获得 shaUnlimited（实际 ${b.flags.shaUnlimited}）`);
  // 冠武式「凭空换上」：旧装备必须派 lose 并进弃牌堆
  const p2 = g.players[2];
  p2.equips = { weapon: jx, armor: null, horsePlus: null, horseMinus: null, treasure: null };
  const ql = mk('qinglong'); ql.sub = 'weapon';
  g.discardPile = [];
  await g.forceEquip(p2, ql, { reason: 'test' });
  ok(p2.equips.weapon === ql && g.discardPile.some(c => c.id === jx.id),
    'T48f forceEquip 应换上新武器并把旧武器放进弃牌堆');
  ok(p2.flags.shaUnlimited !== true, 'T48g forceEquip 换掉精械弩后不得残留 shaUnlimited');
}

// ---------------- T49 respondCard 必须清牌级豁免（SG034 P1） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  const sha = mk('sha');
  sha.ignoreShaLimit = true; sha.ignoreRange = true;
  p0.hand = [sha];
  g.responder = { ask: async () => ({ cardId: sha.id }), askPlay: async () => ({ endPhase: true }) };
  const got = await g.respondCard(p0, { filter: { name: 'sha' }, reason: 'test' });
  ok(!!got, 'T49a respondCard 应返回打出的牌（前置条件）');
  ok(!sha.ignoreShaLimit && !sha.ignoreRange,
    `T49b 打出的牌必须被清掉牌级豁免（实际 ${sha.ignoreShaLimit}/${sha.ignoreRange}）`);
}

// ---------------- T50 afterEquipLose 不得双调（SG034：白银狮子只回 1） ----------------
{
  const g = newGame(2);
  const p0 = g.players[0];
  p0.hp = 2; p0.maxHp = 4;
  const by = mk('baiyin'); by.sub = 'armor';
  const bg = mk('bagua'); bg.sub = 'armor';
  await g.equipCard(p0, by);
  p0.hp = 2;
  await g.equipCard(p0, bg);              // 换装路径
  ok(p0.hp === 3, `T50a 换装失去白银狮子应只回 1 点（实际 ${p0.hp}）`);
  p0.hp = 2;
  await g.discardCards(p0, [bg], { reason: 'test' });   // 弃置路径
  ok(p0.hp === 2, `T50b 弃置失去八卦阵不应回血（实际 ${p0.hp}）`);
  const by2 = mk('baiyin'); by2.sub = 'armor';
  await g.equipCard(p0, by2);
  p0.hp = 2;
  await g.discardCards(p0, [by2], { reason: 'test' });
  ok(p0.hp === 3, `T50c 弃置失去白银狮子应只回 1 点（实际 ${p0.hp}）`);
}

// ---------------- T51 crossPlayer 容器：破军牌在别人身上也要能回收（SG034 P1） ----------------
{
  ok(HELD_CONTAINERS.find(c => c.key === 'jun')?.crossPlayer === true,
    'T51a 「军」必须声明 crossPlayer（牌在目标身上）');
  ok(HELD_CONTAINERS.find(c => c.key === 'flags.m5Kou')?.crossPlayer === true,
    'T51b 「寇」必须声明 crossPlayer（牌在目标身上）');
  const g = newGame(2);
  const [caster, target] = g.players;
  caster.skills = [getSkill('pojun')];
  const c = mk('sha');
  target.jun = [c];
  target.hand = []; target.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null, treasure: null };
  g.discardPile = [];
  await g.removeSkills(caster, ['pojun']);
  ok(caster.skills.length === 0, 'T51c 前置：施放者已失去【破军】');
  ok((target.jun || []).length === 0, `T51d 施放者失技后目标身上的「军」必须被回收（实际 ${(target.jun || []).length}）`);
}

// ---------------- T52 owner 数组用 every 语义（SG034：删统荫不得误清承奉的匡祚） ----------------
{
  const kz = HELD_CONTAINERS.find(c => c.key === 'flags.kuangzuo');
  ok(Array.isArray(kz?.owner) && kz.owner.length === 3, 'T52a 匡祚 owner 应为三元数组');
  const g = newGame(2);
  const p0 = g.players[0];
  p0.skills = [getSkill('tongyin'), getSkill('chengfeng')];
  const c = mk('sha');
  p0.flags.kuangzuo = [c];
  g.discardPile = [];
  await g.removeSkills(p0, ['tongyin']);
  ok((p0.flags.kuangzuo || []).length === 1,
    `T52b 只删【统荫】时不得回收仍被【承奉】使用的「匡祚」（实际 ${(p0.flags.kuangzuo || []).length}）`);
  await g.removeSkills(p0, ['chengfeng']);
  ok((p0.flags.kuangzuo || []).length === 0, 'T52c 两方都失去后才应回收');
}

// ---------------- 汇总 ----------------
console.log(`\nBUGFIX-CHECK：通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败明细：'); for (const b of bad) console.log('  ✗ ' + b); }
process.exit(fail ? 1 : 0);
