// 引擎回归用例（无第三方依赖）：node tools/regression.js
// 覆盖：铁索传导递归、延时锦囊重复进弃牌堆、无懈可击重复进弃牌堆、
//       奸雄获得伤害牌后原牌又进弃牌堆、顺走判定区牌后判定区残留。
import '../src/skills/index.js';
import { Game, CARD_META } from '../src/engine/index.js';
import { deckEntries } from '../src/data/deck.js';
import { generalById } from '../src/data/generals.js';

let pass = 0, fail = 0;
const bad = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; bad.push(msg); } }

const MODE = { id: 'test', name: '回归', setup() {}, checkVictory() { return null; } };
const seat = (i, skills = []) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: { id: `t${i}`, name: `T${i}`, hp: 4, kingdom: 'qun', skills } });
const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });

function makeGame(skills = [[], [], []], responder = null) {
  const g = new Game({
    seats: skills.map((s, i) => seat(i, s)), mode: MODE, seed: 42,
    responder: responder || { ask: async () => null, askPlay: async () => ({ endPhase: true }) },
    deckEntries: deckEntries('standard'),
  });
  return g;
}

// 1. 铁索传导：火伤害只传导一轮，不能 A→B→A 无限递归
{
  const g = makeGame();
  g.players[0].chained = true; g.players[1].chained = true;
  const hp0 = g.players[0].hp, hp1 = g.players[1].hp;
  let err = null;
  try { await g.damage({ to: g.players[0], amount: 1, nature: 'fire', reason: 'test' }); } catch (e) { err = e; }
  ok(!err, `铁索传导抛错：${err?.message}`);
  ok(g.players[0].hp === hp0 - 1 && g.players[1].hp === hp1 - 1, `铁索传导伤害不对：${g.players[0].hp}/${g.players[1].hp}`);
  ok(!g.players[0].chained && !g.players[1].chained, '铁索传导后未解除连环');
  ok(g.discardPile.length === 0, '铁索测试不应产生弃牌');
}

// 2. 延时锦囊：置入判定区时不能同时进弃牌堆，判定后只进一次
{
  const g = makeGame();
  const lebu = card('lebu1', 'lebu', 'heart', 6);
  g.players[0].hand.push(lebu);
  await g.useCard({ from: g.players[0], card: lebu, targets: [g.players[1]], reason: 'play' });
  ok(g.players[1].judgeZone.some(z => z.card === lebu), '乐不思蜀未进入判定区');
  ok(!g.discardPile.includes(lebu), '乐不思蜀在判定区时又进了弃牌堆');
  const z = g.players[1].judgeZone.pop();
  await g.resolveDelayed(g.players[1], z);
  ok(g.discardPile.filter(c => c === lebu).length === 1, `乐不思蜀判定后弃牌堆数量 ${g.discardPile.filter(c => c === lebu).length}`);
}

// 2b. 虚拟延时锦囊（奇袭→乐不思蜀）：实体牌只能进一次弃牌堆
{
  const g = makeGame([['guose'], [], []]);
  const diamond = card('d1', 'sha', 'diamond', 5);
  g.players[0].hand.push(diamond);
  await g.useCard({ from: g.players[0], card: diamond, asName: 'lebu', targets: [g.players[1]], reason: 'play' });
  ok(g.players[1].judgeZone.length === 1, '奇袭的乐不思蜀未进入判定区');
  ok(!g.discardPile.includes(diamond), '奇袭的实体牌提前进了弃牌堆');
  const z = g.players[1].judgeZone.pop();
  await g.resolveDelayed(g.players[1], z);
  ok(g.discardPile.filter(c => c.id === diamond.id).length === 1, `奇袭的实体牌在弃牌堆出现 ${g.discardPile.filter(c => c.id === diamond.id).length} 次`);
}

// 3. 无懈可击：打出的牌只能进弃牌堆一次
{
  const wuxie = card('w1', 'wuxie', 'spade', 2);
  const wuzhong = card('z1', 'wuzhong', 'heart', 7);
  const responder = {
    ask: async (game, p, req) => {
      if (req.kind === 'card' && req.reason === 'wuxie') {
        const c = p.hand.find(x => x.name === 'wuxie');
        return c ? { cardId: c.id } : null;
      }
      if (req.kind === 'card') return null;
      if (req.kind === 'confirm') return { yes: false };
      return null;
    },
    askPlay: async () => ({ endPhase: true }),
  };
  const g = makeGame([[], [], []], responder);
  g.players[1].hand.push(wuxie);
  g.players[0].hand.push(wuzhong);
  await g.useCard({ from: g.players[0], card: wuzhong, targets: [g.players[0]], reason: 'play' });
  ok(!g.players[1].hand.includes(wuxie), '无懈可击未从手牌移出');
  ok(g.discardPile.filter(c => c === wuxie).length === 1, `无懈可击在弃牌堆出现 ${g.discardPile.filter(c => c === wuxie).length} 次`);
}

// 4. 奸雄：获得伤害牌后，同一张牌不能再进弃牌堆
{
  const sha = card('s1', 'sha', 'spade', 7);
  const responder = {
    ask: async (game, p, req) => {
      if (req.kind === 'confirm') return { yes: true }; // 发动奸雄
      return null;                                      // 不出闪/桃
    },
    askPlay: async () => ({ endPhase: true }),
  };
  const g = makeGame([[], ['jianxiong'], []], responder);
  g.players[0].hand.push(sha);
  await g.useCard({ from: g.players[0], card: sha, targets: [g.players[1]], reason: 'play' });
  ok(g.players[1].hand.includes(sha), '奸雄未获得伤害牌');
  ok(!g.discardPile.includes(sha), '奸雄获得的牌又进了弃牌堆');
}

// 5. 顺走判定区牌：判定区不能残留同一张牌
{
  const g = makeGame();
  const lebu = card('lebu2', 'lebu', 'club', 3);
  g.players[1].judgeZone.push({ card: lebu, name: 'lebu' });
  await g.gainCards(g.players[0], [lebu], { from: g.players[1], reason: 'test' });
  ok(!g.players[1].judgeZone.some(z => z.card === lebu), '判定区牌被获得后仍残留');
  ok(g.players[0].hand.includes(lebu), '顺走的判定区牌未进入手牌');
}

// 6. 目标口径：桃只能对自己（原来完全选不到自己）、杀不能对自己、铁索自己与他人皆可
{
  const g = makeGame();
  const p0 = g.players[0], p1 = g.players[1];
  const tao = card('t1', 'tao');
  const sha = card('t2', 'sha', 'spade');
  const tiesuo = card('t3', 'tiesuo');
  const wuzhong = card('t4', 'wuzhong');

  const cort0 = g.candidatesFor(p0, tao);
  ok(cort0.length === 0, '满血时桃无可用目标');
  ok(g.canUse(p0, tao, [p0]).ok === false, '满血不应能使用桃');
  p0.hp = p0.maxHp - 1; // 受伤后才可用桃
  const cort = g.candidatesFor(p0, tao);
  ok(cort.length === 1 && cort[0] === p0, '桃的候选目标应只有自己');
  ok(g.canUse(p0, tao, [p0]).ok === true, '桃不能对自己使用（核心 bug）');
  ok(g.canUse(p0, tao, [p1]).ok === false, '桃不应能对别人使用');
  p0.hp = p0.maxHp;

  ok(g.candidatesFor(p0, wuzhong).every(p => p === p0), '无中生有应只能选自己');
  ok(g.canUse(p0, wuzhong, [p0]).ok === true, '无中生有不能对自己使用');

  const csha = g.candidatesFor(p0, sha);
  ok(!csha.includes(p0), '杀的候选目标不应包含自己');
  ok(g.canUse(p0, sha, [p0]).ok === false, '杀不应能对自己使用');

  const cts = g.candidatesFor(p0, tiesuo);
  ok(cts.includes(p0) && cts.includes(p1), '铁索连环应自己与他人皆可选');
  ok(g.canUse(p0, tiesuo, [p0, p1]).ok === true, '铁索连环应能对自己+他人使用');
}

// 7. 过河拆桥 / 顺手牵羊：手牌必须暗选（不得泄漏牌名），装备区/判定区明示
{
  const seen = [];
  const responder = {
    async askPlay() { return { endPhase: true }; },
    async ask(g, p, req) {
      if (req.kind === 'choice') { seen.push(...(req.options || [])); return { index: 0 }; }
      if (req.kind === 'targets') return { seats: [1] };
      return null;
    },
  };
  const g = makeGame([[], [], []], responder);
  const p0 = g.players[0], p1 = g.players[1];
  p1.hand.length = 0; // 清掉初始发牌，选项数可控
  p1.hand.push(card('h1', 'sha', 'spade', 7), card('h2', 'tao', 'heart', 3));
  p1.equips.armor = card('e1', 'bagua', 'spade', 2);
  p1.judgeZone.push({ card: card('j1', 'lebu', 'club', 6), name: 'lebu' });
  await g.chooseCardFrom(p0, p1, { reason: 'guohe', includeJudge: true });
  const txt = seen.join('|');
  ok(seen.length === 4, `过河拆桥选项数应为 4（2 手牌+1 装备+1 判定），实际 ${seen.length}`);
  ok(/装备区：八卦阵/.test(txt), '装备区的牌应明示牌名');
  ok(/判定区：乐不思蜀/.test(txt), '判定区的牌应明示牌名');
  ok(!/杀|桃/.test(txt), `手牌不得泄漏牌名（实际选项：${txt}）`);
  ok(seen.filter(x => /^手牌/.test(x)).length === 2, '手牌应有 2 个暗选选项');
}

// 8. 双将：体力上限取平均向上取整、护甲取和、技能取并集；护甲先于体力被扣
{
  const seats = [
    { id: 's0', name: 'D0', isAI: true, generals: [generalById('caocao'), generalById('simayi')] },
    { id: 's1', name: 'D1', isAI: true, general: generalById('sunquan') },
  ];
  const g = new Game({
    seats, mode: MODE, seed: 7,
    responder: { ask: async () => null, askPlay: async () => ({ endPhase: true }) },
    deckEntries: deckEntries('standard'),
  });
  const p0 = g.players[0];
  ok(p0.maxHp === 4, `双将体力上限应 ceil((4+3)/2)=4，实际 ${p0.maxHp}`);
  ok(p0.hp === p0.maxHp, '双将初始体力应等于上限');
  const sk = p0.skills.map(s => s.id);
  ok(sk.includes('jianxiong') && sk.includes('fankui'), `双将技能应取并集，实际 ${sk.join(',')}`);
  ok(p0.generalName.includes('曹操') && p0.generalName.includes('司马懿'), `双将名应拼接，实际 ${p0.generalName}`);
  ok(p0.generalIds.length === 2, '双将应有两个 generalId');
  // 护甲：2 点护甲吸收 1+1 点伤害，剩余 1 点扣体力
  p0.armor = 2;
  const hp0 = p0.hp;
  g.responder = { ask: async () => null, askPlay: async () => ({ endPhase: true }) };
  g.trigger = async () => {};
  g.triggerSync = () => {};
  g.dying = async () => {};
  await g.damage({ from: g.players[1], to: p0, amount: 1 });
  ok(p0.armor === 1 && p0.hp === hp0, `1 点伤害应全被护甲吸收（护甲 ${p0.armor}/体力 ${p0.hp}）`);
  await g.damage({ from: g.players[1], to: p0, amount: 3 });
  ok(p0.armor === 0 && p0.hp === hp0 - 2, `3 点伤害应吸 1 扣 2（护甲 ${p0.armor}/体力 ${p0.hp}）`);
  const snap = g.snapshot(0);
  ok(typeof snap.players[0].armor === 'number', '快照应下发 armor');
  ok((snap.players[0].generalIds || []).length === 2, '快照应下发 generalIds');
}

// 9. M2 翻面：背面朝上的角色跳过整个回合，回合结束后复位
{
  const g = makeGame();
  const p0 = g.players[0];
  p0.flipped = true;
  const hand0 = p0.hand.length;
  await g.runTurn(p0);
  ok(p0.flipped === false, '翻面角色回合结束后 flipped 应为 false');
  ok(p0.hand.length === hand0, '翻面角色不应在跳过回合中摸牌/弃牌');
  ok(g.logs.some(l => /翻面，跳过本回合/.test(l.text)), '翻面未记录「跳过本回合」日志');
  ok(g.snapshot(0).players[0].flipped === false, '快照应下发 flipped 且跳过回合后为 false');
}

// 10. M9 不屈：不同点数脱离濒死；同点数清空「创」并继续求桃
{
  const g = makeGame([['buqu'], [], []]);
  const p0 = g.players[0];
  g.deck.push(card('bq1', 'sha', 'club', 7));
  p0.hp = 0;
  await g.dying(p0);
  ok(p0.hp === 1 && p0.buqu.length === 1, `不屈：不同点数应回复至 1 并置入「创」（hp=${p0.hp}/buqu=${p0.buqu.length}）`);
  ok(g.snapshot(0).players[0].buqu === 1, '快照应下发 buqu 数量');
}
{
  const g = makeGame([['buqu'], [], []]);
  const p0 = g.players[0];
  p0.buqu.push(card('bqOld', 'shan', 'heart', 7));
  g.deck.push(card('bq2', 'sha', 'spade', 7));
  p0.hp = 0;
  await g.dying(p0);
  ok(p0.buqu.length === 0, '不屈：同点数应清空全部「创」');
  ok(p0.alive === false, '不屈：同点数且无人出桃应阵亡');
  ok(g.discardPile.filter(c => c.id === 'bq2' || c.id === 'bqOld').length === 2, '不屈清空时两张「创」都应进弃牌堆');
}

// 11. 【杀】结算上下文的 unavoidable：跳过【闪】询问，直接命中
{
  let shanAsks = 0;
  const responder = {
    async askPlay() { return { endPhase: true }; },
    async ask(g, p, req) {
      if (req.kind === 'card' && /闪/.test(req.prompt || '')) shanAsks++;
      return null;
    },
  };
  const g = makeGame([[], [], []], responder);
  const p0 = g.players[0], p1 = g.players[1];
  p1.hand = [card('u1', 'shan', 'heart', 2)];
  const sha = card('u2', 'sha', 'spade', 5);
  p0.hand = [sha];
  const hp0 = p1.hp;
  await g.useCard({ from: p0, card: sha, targets: [p1], unavoidable: true });
  ok(shanAsks === 0, `unavoidable 的【杀】不应询问【闪】（实际 ${shanAsks} 次）`);
  ok(p1.hp === hp0 - 1, 'unavoidable 的【杀】应直接造成伤害');
}

// 12. 伤害转移：damage.before 修改 data.to 后伤害落在新目标，来源不变
{
  const responder = {
    async askPlay() { return { endPhase: true }; },
    async ask(g, p, req) {
      if (req.kind === 'confirm') return { yes: true };
      if (req.kind === 'card') return { cardId: (req.cards || [])[0] };
      if (req.kind === 'targets') return { seats: [2] };
      return null;
    },
  };
  const g = makeGame([['tianxiang'], [], []], responder);
  const p0 = g.players[0], p1 = g.players[1], p2 = g.players[2];
  p0.hand = [card('tx1', 'tao', 'heart', 6)];
  p0.hp = p0.maxHp;
  p2.hp = p2.maxHp;
  await g.damage({ from: p1, to: p0, amount: 1, reason: 'test' });
  ok(p0.hp === p0.maxHp, '天香：原目标不应掉血');
  ok(p2.hp === p2.maxHp - 1, '天香：伤害应转移到新目标');
  ok(g.logs.some(l => /伤害转移/.test(l.text)), '缺少伤害转移日志');
}


// ============ 13. target.before 的 d.player 语义（空城 / 谦逊 / 流离）============
// 教训（SG013 审计 P0）：target.before 的数据是 { self: 使用者, target: 目标 }，
// 技能拥有者在 filter 里是 d.player。写成 d.target === d.self 会让技能永不发动。
function mkG(ids, responder) {
  const seats = ids.map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
  const rsp = typeof responder === 'function'
    ? { ask: responder, askPlay: async () => ({ endPhase: true }) }
    : (responder || { ask: async () => null, askPlay: async () => ({ endPhase: true }) });
  return new Game({ seats, mode: MODE, seed: 42, responder: rsp, deckEntries: deckEntries('standard') });
}

{
  const g = mkG(['zhugeliang', 'sunquan']);
  const zl = g.players[0], atk = g.players[1];
  g.turnPlayer = atk; g.turnCount = 1; zl.hand = [];
  const d = { self: atk, target: zl, card: card('kc1', 'sha', 'spade', 7), used: [], shaCtx: {} };
  await g.trigger('target.before', d);
  ok(d.canceled === true, '空城：手牌为 0 时【杀】应被取消（d.player 语义）');
  ok(g.logs.some(l => /空城/.test(l.text)), '空城：缺少日志');
}
{
  const g = mkG(['luxun', 'sunquan']);
  const lx = g.players[0], atk = g.players[1];
  g.turnPlayer = atk; g.turnCount = 1;
  const d = { self: atk, target: lx, card: card('qx1', 'shunshou', 'spade', 3), used: [], shaCtx: {} };
  await g.trigger('target.before', d);
  ok(d.canceled === true, '谦逊：不能成为【顺手牵羊】的目标');
}
{
  const g = mkG(['daqiao', 'sunquan', 'liubei'], async (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    if (req.kind === 'targets') return { seats: [2] };
    return null;
  });
  const dq = g.players[0], atk = g.players[1];
  g.turnPlayer = atk; g.turnCount = 1;
  dq.hand = [card('ll1', 'sha', 'heart', 2)];
  const d = { self: atk, target: dq, card: card('ll2', 'sha', 'spade', 9), used: [], shaCtx: {} };
  await g.trigger('target.before', d);
  ok(d.target === g.players[2], '流离：应把【杀】转移给第三名角色');
  ok(g.logs.some(l => /流离/.test(l.text)), '流离：缺少日志');
}

// ============ 14. 观星牌序（标准 / 界 / 谋）============
// 牌堆顶在数组末尾：全部置顶后牌堆应完全不变；全部置底后顶部 n 张应移到数组头部。
{
  const mk = (id) => card(id, 'sha', 'spade', 1);
  const cases = [
    ['zhugeliang', '标准'],
    ['jie_zhugeliang', '界'],
    ['mou_zhugeliang', '谋'],
  ];
  for (const [gid, cn] of cases) {
    const base = ['d1', 'd2', 'd3', 'd4', 't3', 't2', 't1'];
    // 全置顶
    let k = 0;
    let g = mkG([gid, 'sunquan'], async (gg, p, req) => {
      if (req.kind === 'confirm') return { yes: true };
      if (req.kind === 'choice') return { index: 0 };
      return null;
    });
    g.deck = base.map(mk);
    await g.trigger('phase.begin', { self: g.players[0], phase: 'prepare' });
    ok(g.deck.map(c => c.id).join() === base.join(), `${cn}观星：全部置于牌堆顶后牌序应不变（实际 ${g.deck.map(c => c.id).join()}）`);
    // 全置底
    g = mkG([gid, 'sunquan'], async (gg, p, req) => {
      if (req.kind === 'confirm') return { yes: true };
      if (req.kind === 'choice') return { index: 1 };
      return null;
    });
    g.deck = base.map(mk);
    await g.trigger('phase.begin', { self: g.players[0], phase: 'prepare' });
    const got = g.deck.map(c => c.id).join();
    const aliveN = g.players.filter(x => x.alive).length;
    // 标准/谋：min(5, 存活数)；界：存活 <4 时为 3，否则 5
    const n = gid === 'jie_zhugeliang' ? Math.min(5, aliveN < 4 ? 3 : 5) : Math.min(5, aliveN);
    const want = [...base.slice(-n), ...base.slice(0, -n)].join();
    ok(got === want, `${cn}观星：全部置于牌堆底后应为 ${want}（实际 ${got}）`);
  }
}

// ============ 15. respondCard 返回值不得二次弃置（青囊）============
{
  const g = mkG(['huatuo', 'sunquan'], async (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1] };
    if (req.kind === 'card') return p.hand.length ? { cardId: p.hand[0].id } : null;
    return null;
  });
  const ht = g.players[0], t = g.players[1];
  g.turnPlayer = ht; g.turnCount = 1; g.phase = 'play';   // 主动技只能在出牌阶段发动（SG028 R1）
  ht.hand = [card('qn1', 'sha', 'heart', 3)];
  t.hp = 2; t.maxHp = 4;
  let discards = 0;
  const orig = g.trigger.bind(g);
  g.trigger = async (ev, data) => { if (ev === 'cards.discard') discards++; return orig(ev, data); };
  await g.useActiveSkill(ht, 'qingnang');
  ok(discards === 1, `青囊：一次弃牌应只触发 1 次 cards.discard（实际 ${discards} 次，respondCard 已弃置不得重复）`);
  ok(t.hp === 3, `青囊：目标应回复 1 点体力（实际 ${t.hp}）`);
}

// ============ 16. 缔盟交换手牌应触发 cards.gain ============
{
  const g = mkG(['lusu', 'sunquan', 'liubei'], async (gg, p, req) => {
    if (req.kind === 'confirm') return { yes: true };
    if (req.kind === 'targets') return { seats: [1, 2] };
    if (req.kind === 'cards') return { cardIds: (req.cards || []).slice(0, req.min || 1) };
    return null;
  });
  const ls = g.players[0], a = g.players[1], b = g.players[2];
  g.turnPlayer = ls; g.turnCount = 1; g.phase = 'play';   // 主动技只能在出牌阶段发动（SG028 R1）
  ls.hand = [card('dm0', 'sha', 'heart', 1), card('dm1', 'sha', 'club', 2)];
  a.hand = [card('dmA', 'sha', 'spade', 3)];
  b.hand = [card('dmB1', 'sha', 'diamond', 4), card('dmB2', 'shan', 'heart', 5)];
  // 两人手牌数差 1，鲁肃需弃 1 张
  ls.hand = [card('dm0', 'sha', 'heart', 1)];
  let gains = 0;
  const orig = g.trigger.bind(g);
  g.trigger = async (ev, data) => { if (ev === 'cards.gain') gains++; return orig(ev, data); };
  await g.useActiveSkill(ls, 'dimeng');
  ok(gains >= 2, `缔盟：交换手牌应触发 cards.gain（实际 ${gains} 次）`);
  ok(a.hand.length === 2 && b.hand.length === 1, `缔盟：交换后手牌数应为 2/1（实际 ${a.hand.length}/${b.hand.length}）`);
}

console.log(`\n回归用例：通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败项：'); for (const b of bad) console.log('  -', b); process.exit(1); }
