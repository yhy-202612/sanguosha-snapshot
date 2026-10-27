// 装备特效与规则修复守门（无第三方依赖）：node tools/equipcheck.js
// 覆盖：酒每回合 1 次、白银狮子失去回血、雌雄双股剑、青龙偃月刀、贯石斧、寒冰剑、方天画戟、濒死求桃顺序
import '../src/skills/index.js';
import { Game, CARD_META } from '../src/engine/index.js';
import { deckEntries } from '../src/data/deck.js';

let pass = 0, fail = 0;
const bad = [];
const ok = (cond, msg) => { if (cond) pass++; else { fail++; bad.push(msg); console.log('  ✗', msg); } };

const MODE = { id: 'test', name: '装备回归', setup() {}, checkVictory() { return null; } };
const seat = (i, ai = false) => ({ id: `s${i}`, name: `P${i}`, isAI: ai, general: { id: `t${i}`, name: `T${i}`, hp: 4, kingdom: 'qun', skills: [] } });
const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });

function mkResp(opts = {}) {
  const asked = [];
  return {
    asked,
    async askPlay() { return { endPhase: true }; },
    async ask(g, p, req) {
      asked.push({ seat: p.seat, kind: req.kind, prompt: req.prompt || '' });
      if (req.kind === 'card') {
        const dir = opts.card ? opts.card(p, req) : 'first';
        if (dir === 'none') return null;
        return { cardId: (req.cards || [])[0] };
      }
      if (req.kind === 'choice') return { index: opts.choice ? opts.choice(p, req) : 0 };
      if (req.kind === 'confirm') return { yes: opts.confirm ? opts.confirm(p, req) : true };
      if (req.kind === 'targets') return { seats: (req.targets || []).slice(0, Math.max(req.min || 1, 1)) };
      return null;
    },
  };
}

function makeGame(n = 2, resp = mkResp()) {
  const g = new Game({
    seats: Array.from({ length: n }, (_, i) => seat(i)), mode: MODE, seed: 7,
    responder: resp, deckEntries: deckEntries('standard'),
  });
  // 清空初始发牌，让每个用例从确定的手牌状态开始
  g.players.forEach(p => { p.hand.length = 0; });
  return g;
}

// 1）【酒】每回合限一次
{
  const g = makeGame(2);
  const p = g.players[0];
  const j1 = card('j1', 'jiu'), j2 = card('j2', 'jiu');
  p.hand.push(j1, j2);
  const r1 = g.canUse(p, j1, [p]);
  ok(r1.ok, `第一张【酒】应可用：${r1.reason || ''}`);
  await g.useCard({ from: p, card: j1, targets: [p] });
  ok(p.flags.jiuUsed === true, '使用【酒】后未置 jiuUsed 标记');
  const r2 = g.canUse(p, j2, [p]);
  ok(!r2.ok, '第二张【酒】应被拒绝（每回合限一次）');
  // 新回合清空
  for (const x of g.players) { x.flags.jiu = 0; x.flags.jiuUsed = false; }
  ok(g.canUse(p, j2, [p]).ok, '新回合【酒】应恢复可用');
}

// 2）白银狮子：失去装备时回复 1 点体力
{
  const g = makeGame(2);
  const p = g.players[0];
  p.hp = 2;
  const baiyin = card('b1', 'baiyin');
  await g.equipCard(p, baiyin);
  ok(p.equips.armor === baiyin, '白银狮子未进入护甲槽');
  await g.equipCard(p, card('b2', 'bagua'));
  ok(p.hp === 3, `失去白银狮子应回复 1 点体力，实际 ${p.hp}`);
  // 被拆走也应回血
  p.hp = 2;
  const baiyin2 = card('b3', 'baiyin');
  await g.equipCard(p, baiyin2);
  await g.discardCards(p, [baiyin2], { reason: 'guohe' });
  ok(p.hp === 3, `白银狮子被弃置应回复 1 点体力，实际 ${p.hp}`);
}

// 3）雌雄双股剑：异性目标 → 舍弃一张手牌或你摸一张牌
{
  const resp = mkResp({ card: () => 'none', choice: () => 1 }); // 选「让对方摸一张牌」
  const g = makeGame(2, resp);
  const p0 = g.players[0], p1 = g.players[1];
  p0.gender = 'male'; p1.gender = 'female';
  await g.equipCard(p0, card('w1', 'cixiong'));
  const sha = card('s1', 'sha', 'spade', 7);
  p0.hand.push(sha);
  const before = p0.hand.length; // 1
  await g.useCard({ from: p0, card: sha, targets: [p1] });
  ok(resp.asked.some(a => a.prompt.includes('雌雄双股剑')), '雌雄双股剑未触发询问');
  ok(p0.hand.length === before, `雌雄（摸牌）净手牌应不变：使用-1 摸牌+1，实际 ${p0.hand.length}`);
  // 选「弃置一张手牌」
  const resp2 = mkResp({ card: () => 'none', choice: () => 0 });
  const g2 = makeGame(2, resp2);
  const q0 = g2.players[0], q1 = g2.players[1];
  q0.gender = 'male'; q1.gender = 'female';
  await g2.equipCard(q0, card('w2', 'cixiong'));
  q1.hand.push(card('h1', 'sha'), card('h2', 'shan'));
  const n1 = q1.hand.length;
  await g2.useCard({ from: q0, card: card('s2', 'sha', 'spade', 8), targets: [q1] });
  ok(q1.hand.length === n1 - 1, `雌雄（弃牌）目标手牌应 -1，实际 ${n1}→${q1.hand.length}`);
}

// 4）青龙偃月刀：被闪抵消后可弃一张【杀】继续攻击
{
  const resp = mkResp({ card: () => 'first' }); // 目标总能出闪
  const g = makeGame(2, resp);
  const p0 = g.players[0], p1 = g.players[1];
  await g.equipCard(p0, card('w3', 'qinglong'));
  p0.hand.push(card('s3', 'sha', 'spade', 9), card('s4', 'sha', 'club', 10));
  p1.hand.push(card('d1', 'shan', 'heart', 2), card('d2', 'shan', 'heart', 3));
  const shanBefore = p1.hand.length;
  await g.useCard({ from: p0, card: p0.hand.find(c => c.id === 's3'), targets: [p1] });
  ok(p1.hand.length === shanBefore - 2, `青龙偃月刀应导致第二次【杀】结算（目标应打出 2 张闪），实际 ${shanBefore}→${p1.hand.length}`);
}

// 5）贯石斧：被闪抵消后弃两张牌强制命中
{
  const resp = mkResp({ card: () => 'first', confirm: () => true, choice: () => 0 });
  const g = makeGame(2, resp);
  const p0 = g.players[0], p1 = g.players[1];
  await g.equipCard(p0, card('w4', 'guanshi'));
  p0.hand.push(card('s5', 'sha', 'spade', 11), card('x1', 'guohe', 'club', 4), card('x2', 'wuzhong', 'heart', 5));
  p1.hand.push(card('d3', 'shan', 'heart', 4));
  const hp1 = p1.hp;
  await g.useCard({ from: p0, card: p0.hand.find(c => c.id === 's5'), targets: [p1] });
  ok(resp.asked.some(a => a.prompt.includes('贯石斧')), '贯石斧未触发询问');
  ok(p1.hp === hp1 - 1, `贯石斧应强制造成 1 点伤害，实际 ${hp1}→${p1.hp}`);
  ok(p0.hand.length === 0, `贯石斧应弃两张牌，实际剩余 ${p0.hand.length}`);
}

// 6）寒冰剑：命中时可防止伤害改为弃目标两张牌
{
  const resp = mkResp({ card: () => 'none', confirm: () => true, choice: () => 0 });
  const g = makeGame(2, resp);
  const p0 = g.players[0], p1 = g.players[1];
  await g.equipCard(p0, card('w5', 'hanbing'));
  p0.hand.push(card('s6', 'sha', 'spade', 12));
  p1.hand.push(card('h3', 'sha', 'club', 6), card('h4', 'shan', 'heart', 7), card('h5', 'tao', 'heart', 8));
  const hp1 = p1.hp, n1 = p1.hand.length;
  await g.useCard({ from: p0, card: p0.hand.find(c => c.id === 's6'), targets: [p1] });
  ok(resp.asked.some(a => a.prompt.includes('寒冰剑')), '寒冰剑未触发询问');
  ok(p1.hp === hp1, `寒冰剑应防止伤害，实际掉血 ${hp1}→${p1.hp}`);
  ok(p1.hand.length === n1 - 2, `寒冰剑应弃目标两张牌，实际 ${n1}→${p1.hand.length}`);
}

// 7）方天画戟：最后一张手牌当【杀】可指定至多 3 个目标
{
  const g = makeGame(3);
  const p0 = g.players[0];
  await g.equipCard(p0, card('w6', 'fangtian'));
  const sha = card('s7', 'sha', 'spade', 13);
  p0.hand.push(sha);
  ok(g.canUse(p0, sha, [g.players[1], g.players[2]]).ok, '方天画戟应允许 2 个目标');
  // 非最后一张手牌时不允许
  p0.hand.push(card('extra', 'shan', 'heart', 1));
  ok(!g.canUse(p0, sha, [g.players[1], g.players[2]]).ok, '手牌多于一张时方天画戟不应允许 2 个目标');
}

// 8）濒死求桃顺序：从当前回合角色起，而不是从濒死者起
{
  const resp = mkResp({ card: () => 'none' }); // 谁都不出桃
  const g = makeGame(3, resp);
  const [p0, p1, p2] = g.players;
  // 每人一张桃（都不出），确保求桃询问真的发生
  g.players.forEach((p, i) => p.hand.push(card(`t${i}`, 'tao', 'heart', 9)));
  g.turnPlayer = p1;             // 当前回合是 P1
  p2.hp = 0; p2.alive = true;    // P2 濒死
  await g.dying(p2, { from: p0 });
  const firstAsk = resp.asked.find(a => a.kind === 'card' && a.prompt.includes('濒死'));
  ok(!!firstAsk, '濒死未发生求桃询问');
  ok(firstAsk && firstAsk.seat === 1, `求桃应从当前回合角色（座位 1）起问，实际先问座位 ${firstAsk?.seat}`);
}

console.log(`\n装备/规则回归：通过 ${pass} / 失败 ${fail}`);
if (fail) { console.log('失败项：'); bad.forEach(b => console.log('  -', b)); process.exit(1); }
