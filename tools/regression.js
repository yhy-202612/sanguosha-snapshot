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

console.log(`\n回归用例：通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败项：'); for (const b of bad) console.log('  -', b); process.exit(1); }
