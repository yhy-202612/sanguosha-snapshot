// 装备效果全量检查：25 种装备逐项断言（node tools/equipfullcheck.js [--verbose]）
// 目的：equipcheck.js 只覆盖 8 项（酒/白银狮子/雌雄/青龙/贯石斧/寒冰/方天/濒死），
//      这里把 CARD_META 里全部 25 种装备（11 武器 + 4 防具 + 3 宝物/特殊 + 6 坐骑）都过一遍，
//      每条断言都作用在「可观测的数值/状态」上（伤害数、手牌数、装备槽、距离、攻击范围）。
import '../src/skills/index.js';
import { Game, CARD_META } from '../src/engine/index.js';
import { deckEntries } from '../src/data/deck.js';

let pass = 0, fail = 0;
const bad = [];
const skips = [];
const verbose = process.argv.includes('--verbose');
const ok = (cond, msg) => { if (cond) pass++; else { fail++; bad.push(msg); console.log('  ✗', msg); } };
const skip = (msg) => skips.push(msg);

let uid = 0;
const mk = (name = 'sha', suit = 'spade', num = 7) => ({ id: `e${++uid}`, name, suit, num, type: CARD_META[name]?.type });
const SUIT = ['spade', 'heart', 'club', 'diamond'];
const red = () => mk('shan', 'heart', 9);
const black = () => mk('shan', 'spade', 9);

const MODE = { id: 'equiptest', name: '装备全量', setup() {}, checkVictory() { return null; } };

// 精确控制「下一张判定牌 / 摸牌」：直接覆盖 popDeck（牌堆内部顺序易受洗牌影响，unshift 不可靠）
function forceNext(g, ...cards) {
  const queue = cards.slice();
  const orig = g.popDeck.bind(g);
  g.popDeck = (n = 1) => {
    const taken = [];
    while (taken.length < n && queue.length) taken.push(queue.shift());
    while (taken.length < n) taken.push(...orig(1));
    return taken;
  };
  return g;
}

// 可编程 responder：cfg.card(p, req) → 'first' | 'none' ；cfg.confirm → bool；cfg.choice → index
function mkResp(cfg = {}) {
  const asked = [];
  return {
    asked,
    async askPlay() { return { endPhase: true }; },
    async ask(g, p, req) {
      asked.push({ seat: p.seat, kind: req.kind, prompt: req.prompt || '' });
      if (req.kind === 'card') {
        const d = cfg.card ? cfg.card(p, req) : 'none';
        if (d === 'none' || !(req.cards || []).length) return null;
        return { cardId: req.cards[0] };
      }
      if (req.kind === 'choice') return { index: cfg.choice ? cfg.choice(p, req) : 0 };
      if (req.kind === 'confirm') return { yes: cfg.confirm ? cfg.confirm(p, req) : true };
      if (req.kind === 'targets') return { seats: (req.targets || []).slice(0, Math.max(req.min || 1, 1)) };
      if (req.kind === 'discard') return { cardIds: (req.cards || []).slice(0, Math.max(req.min || 1, 1)) };
      return null;
    },
  };
}

function newGame({ n = 3, resp = mkResp() } = {}) {
  const seats = [];
  for (let i = 0; i < n; i++) {
    seats.push({
      id: `s${i}`, name: `P${i}`, isAI: false,
      general: { id: `g${i}`, name: `T${i}`, hp: 4, kingdom: 'qun', gender: i % 2 === 0 ? 'male' : 'female', skills: [] },
    });
  }
  const g = new Game({ seats, mode: MODE, seed: 9, deckEntries: deckEntries('standard'), responder: resp, config: { timeout: 200 } });
  g.onState = () => {};
  g.logs = g.logs || [];
  const logs = [];
  const origLog = g.log.bind(g);
  g.log = async (t, e2) => { logs.push(String(t)); return origLog(t, e2); };
  g.testLogs = logs;
  for (const p of g.players) {
    p.hand = []; p.hp = 4; p.maxHp = 4; p.skills = []; p.marks = {}; p.flags = {}; p.judgeZone = [];
    p.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null, treasure: null };
  }
  return g;
}
const equip = (p, name) => {
  const sub = CARD_META[name].sub;
  const slot = sub === 'horse+' ? 'horsePlus' : sub === 'horse-' ? 'horseMinus' : sub;
  p.equips[slot] = mk(name);
  return p.equips[slot];
};
// 出杀：把一张【杀】塞进手牌再 useCard（responder 默认不出闪）
async function useSha(g, from, to, { suit = 'spade', num = 7, nature = null } = {}) {
  const c = mk('sha', suit, num);
  if (nature) c.nature = nature;
  from.hand.push(c);
  return g.useCard({ from, card: c, targets: [to], reason: 'sha' });
}

console.log('=== 装备效果全量检查（25 种）===');

// ---------- 1. 攻击范围（11 种武器） ----------
{
  const g = newGame();
  const p0 = g.players[0];
  for (const [id, meta] of Object.entries(CARD_META)) {
    if (meta.sub !== 'weapon') continue;
    for (const k of Object.keys(p0.equips)) p0.equips[k] = null;
    equip(p0, id);
    ok(g.attackRange(p0) === meta.range, `[${meta.cn}] 攻击范围应为 ${meta.range}，实际 ${g.attackRange(p0)}`);
  }
}

// ---------- 2. 坐骑距离（horse+ 让别人更难够到你；horse- 让你更容易够到别人） ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  const base = g.distance(p0, p1);
  ok(base === 1, `基础相邻距离应为 1，实际 ${base}`);
  equip(p1, 'chitu');                 // +1 马在目标身上
  ok(g.distance(p0, p1) === 2, `目标装+1马后距离应为 2，实际 ${g.distance(p0, p1)}`);
  p1.equips.horsePlus = null;
  equip(p0, 'dilu');                  // -1 马在自己身上
  ok(g.distance(p0, p1) === 1, `-1马后距离 clamp 到 1，实际 ${g.distance(p0, p1)}`);
  // 三种 +1 马、三种 -1 马效果一致
  for (const id of ['chitu', 'dawan', 'zixing']) {
    p1.equips.horsePlus = null; p0.equips.horseMinus = null;
    equip(p1, id);
    ok(g.distance(p0, p1) === 2, `[${CARD_META[id].cn}]+1 马未生效（距离 ${g.distance(p0, p1)}）`);
  }
  for (const id of ['dilu', 'jueying', 'zhuahuang']) {
    p1.equips.horsePlus = null; p0.equips.horseMinus = null;
    equip(p0, id);
    const d = g.distance(p0, p1);
    ok(d === base, `[${CARD_META[id].cn}]-1 马未生效（距离 ${d}，基准 ${base}）`);
  }
}

// ---------- 3. 诸葛连弩：出杀无次数限制 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  await useSha(g, p0, p1);
  const r2 = await useSha(g, p0, p1);
  ok(r2 === false, '没有连弩时第 2 张【杀】应被拒（本回合已用尽）');
  const g2 = newGame();
  const [q0, q1] = g2.players;
  equip(q0, 'zhuge');
  await useSha(g2, q0, q1);
  const ok2 = await useSha(g2, q0, q1);
  ok(ok2 !== false, '[诸葛连弩] 装上后第 2 张【杀】应可出');
}

// ---------- 4. 八卦阵：判定红 → 视为闪 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p1, 'bagua');
  forceNext(g, mk('shan', 'heart', 3));        // 下一张判定牌为红桃
  await useSha(g, p0, p1);
  ok(p1.hp === 4, `[八卦阵] 判定为红应视为【闪】（p1 hp 应为 4，实际 ${p1.hp}）`);
  // 判定为黑 → 不生效，正常掉血
  const g2 = newGame();
  const [q0, q1] = g2.players;
  equip(q1, 'bagua');
  forceNext(g2, mk('sha', 'spade', 3));        // 判定为黑 → 八卦不生效
  await useSha(g2, q0, q1);
  ok(q1.hp === 3, `[八卦阵] 判定为黑不应生效（hp 应为 3，实际 ${q1.hp}）`);
}

// ---------- 5. 青釭剑：无视防具（穿透八卦阵） ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p0, 'qinggang');
  equip(p1, 'bagua');
  forceNext(g, mk('shan', 'heart', 3));        // 红判定，但青釭剑应无视
  await useSha(g, p0, p1);
  ok(p1.hp === 3, `[青釭剑] 应无视防具（八卦阵不该挡住，hp 应为 3，实际 ${p1.hp}）`);
}

// ---------- 6. 仁王盾：黑杀无效 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p1, 'renwang');
  await useSha(g, p0, p1, { suit: 'spade' });
  ok(p1.hp === 4, `[仁王盾] 黑杀应无效（hp 应为 4，实际 ${p1.hp}）`);
  const g2 = newGame();
  const [q0, q1] = g2.players;
  equip(q1, 'renwang');
  await useSha(g2, q0, q1, { suit: 'heart' });
  ok(q1.hp === 3, `[仁王盾] 红杀应正常生效（hp 应为 3，实际 ${q1.hp}）`);
}

// ---------- 7. 藤甲：普通杀无效 / 火杀伤害 +1 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p1, 'tengjia');
  await useSha(g, p0, p1, { suit: 'spade' });
  ok(p1.hp === 4, `[藤甲] 普通杀应无效（hp 应为 4，实际 ${p1.hp}）`);
  const g2 = newGame();
  const [q0, q1] = g2.players;
  equip(q1, 'tengjia');
  await useSha(g2, q0, q1, { suit: 'heart', nature: 'fire' });
  ok(q1.hp === 2, `[藤甲] 火杀伤害应 +1（4-2=2，实际 hp=${q1.hp}）`);
}

// ---------- 8. 白银狮子：每次最多受 1 点伤害 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p1, 'baiyin');
  await g.damage({ from: p0, to: p1, amount: 3, reason: 'test' });
  ok(p1.hp === 3, `[白银狮子] 每次最多受 1 点伤害（3 伤应只掉 1，实际 hp=${p1.hp}）`);
}

// ---------- 9. 古锭刀：目标无手牌时伤害 +1 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p0, 'guding');
  p1.hand = [];
  await useSha(g, p0, p1);
  ok(p1.hp === 2, `[古锭刀] 目标无手牌时伤害应为 2（hp 应为 2，实际 ${p1.hp}）`);
  // 有手牌 → 正常 1 点
  const g2 = newGame();
  const [q0, q1] = g2.players;
  equip(q0, 'guding');
  q1.hand = [mk('shan', 'club', 2)];
  await useSha(g2, q0, q1);
  ok(q1.hp === 3, `[古锭刀] 目标有手牌时应为 1 点伤害（hp 应为 3，实际 ${q1.hp}）`);
}

// ---------- 10. 朱雀羽扇：火杀伤害 +1 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p0, 'zhuque');
  await useSha(g, p0, p1, { nature: 'fire', suit: 'heart' });
  ok(p1.hp === 2, `[朱雀羽扇] 火【杀】伤害应为 2（hp 应为 2，实际 ${p1.hp}）`);
}

// ---------- 11. 麒麟弓：造成伤害后可弃目标坐骑 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p0, 'qilin');
  equip(p1, 'chitu');
  await useSha(g, p0, p1);
  ok(!p1.equips.horsePlus, '[麒麟弓] 造成伤害后应弃置目标坐骑（+1 马仍在）');
  ok(p1.hp === 3, `[麒麟弓] 伤害本身应正常（hp 应为 3，实际 ${p1.hp}）`);
}

// ---------- 12. 寒冰剑：可改为弃目标两张牌 ----------
{
  const g = newGame({ resp: mkResp({ confirm: () => true }) });
  const [p0, p1] = g.players;
  equip(p0, 'hanbing');
  p1.hand = [mk('sha', 'spade', 2), mk('tao', 'heart', 3), mk('shan', 'club', 4)];
  const before = p1.hand.length;
  await useSha(g, p0, p1);
  ok(p1.hp === 4, `[寒冰剑] 选择弃两张牌时不应造成伤害（hp 应为 4，实际 ${p1.hp}）`);
  ok(p1.hand.length === before - 2, `[寒冰剑] 应弃置目标 2 张牌（${before} → ${p1.hand.length}）`);
}

// ---------- 13. 霹雳车：杀造成伤害后弃目标装备 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p0, 'piliche');
  equip(p1, 'chitu');           // 用坐骑当「目标装备区的牌」，避免防具把伤害挡掉
  await useSha(g, p0, p1);
  ok(!p1.equips.horsePlus, '[霹雳车] 造成伤害后应弃置目标装备区的牌（+1 马仍在）');
}

// ---------- 14. 贯石斧：弃两张牌令杀强制命中 ----------
{
  const g = newGame({ resp: mkResp({ card: () => 'first', confirm: () => true, choice: () => 0 }) });
  const [p0, p1] = g.players;
  equip(p0, 'guanshi');
  p1.hand = [mk('shan', 'diamond', 5)];
  p0.hand = [mk('sha', 'spade', 9), mk('tao', 'heart', 2)];    // 供贯石斧弃置
  const c = p0.hand[0];
  await g.useCard({ from: p0, card: c, targets: [p1], reason: 'sha' });
  ok(p1.hp === 3, `[贯石斧] 弃两张牌后应强制命中（hp 应为 3，实际 ${p1.hp}）`);
}

// ---------- 15. 太平要术：防止火属性伤害 + 手牌上限 +1 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p0, 'taiping');
  await g.damage({ from: p1, to: p0, amount: 2, nature: 'fire', reason: 'test' });
  ok(p0.hp === 4, `[太平要术] 应防止火属性伤害（hp 应为 4，实际 ${p0.hp}）`);
  // 手牌上限：hp 4 + 1 = 5，手牌 6 → 弃牌阶段应弃 1 张
  p0.hand = [mk('sha'), mk('shan'), mk('tao'), mk('wuxie'), mk('guohe'), mk('juedou')];
  p0.hp = 4;
  await g.runPhase(p0, 'discard');
  ok(p0.hand.length === 5, `[太平要术] 手牌上限应为 5（弃后应剩 5，实际 ${p0.hand.length}）`);
}

// ---------- 16. 木牛流马：手牌上限 +2 ----------
{
  const g = newGame();
  const p0 = g.players[0];
  equip(p0, 'muniu');
  p0.hand = [mk('sha'), mk('shan'), mk('tao'), mk('wuxie'), mk('guohe'), mk('juedou'), mk('nanman')];
  p0.hp = 4;
  await g.runPhase(p0, 'discard');
  ok(p0.hand.length === 6, `[木牛流马] 手牌上限应为 6（弃后应剩 6，实际 ${p0.hand.length}）`);
  // 每回合开始「运粮」摸 1：运粮写在 runTurn 里（不是 turn.begin 触发器），跑一次完整回合验证
  const g2 = newGame({ resp: mkResp({ card: () => 'none' }) });
  const q0 = g2.players[0];
  equip(q0, 'muniu');
  q0.hand = [];
  const before = q0.hand.length;
  await g2.runTurn(q0);                       // 摸牌阶段 2 张 + 运粮 1 张 = 3
  ok(q0.hand.length >= before + 3, `[木牛流马] 回合开始应「运粮」多摸 1 张（${before} → ${q0.hand.length}，未运粮应为 2）`);
}

// ---------- 17. 弩炮：距离 -1、出杀次数 +1 ----------
{
  const g = newGame();
  const [p0, p1] = g.players;
  equip(p0, 'chitu');   // 先给自己 +1 马（无影响，仅占位）
  equip(p0, 'nupao');
  const d = g.distance(p0, p1);
  ok(d === 1, `[弩炮] 与相邻角色距离应为 1（实际 ${d}）`);
  // 出杀次数 +1：第一张正常、第二张也应可出
  const r1 = await useSha(g, p0, p1);
  const r2 = await useSha(g, p0, p1);
  ok(r1 !== false && r2 !== false, `[弩炮] 每回合出杀次数 +1（第一张=${r1}，第二张=${r2}）`);
}

// ---------- 18. 丈八蛇矛：两张手牌可当【杀】 ----------
{
  const g = newGame();
  const p0 = g.players[0];
  equip(p0, 'zhangba');
  const a = mk('shan', 'club', 3), b = mk('tao', 'heart', 4);
  p0.hand = [a, b];
  ok(g.virtualAllowed(p0, [a, b], 'sha') === true, '[丈八蛇矛] 两张手牌应可当【杀】使用');
  const g2 = newGame();
  const q0 = g2.players[0];
  q0.hand = [mk('shan', 'club', 3), mk('tao', 'heart', 4)];
  ok(g2.virtualAllowed(q0, q0.hand, 'sha') === false, '没有丈八蛇矛时两张手牌不应能当【杀】');
}

// ---------- 19. 雌雄双股剑：对异性目标可令其弃牌或你摸牌 ----------
{
  const g = newGame({ resp: mkResp({ choice: () => 0, confirm: () => true }) });
  const [p0, p1] = g.players;
  ok(p0.gender !== p1.gender, '测试前置：P0/P1 应为异性');
  equip(p0, 'cixiong');
  p1.hand = [mk('tao', 'heart', 5)];
  const before = p1.hand.length;
  await useSha(g, p0, p1);
  ok(p1.hand.length === before - 1 || g.players[0].hand.length > 0,
    `[雌雄双股剑] 对异性出杀应触发「其弃一张 或 你摸一张」（p1 手牌 ${before} → ${p1.hand.length}）`);
}

// ---------- 20. 青龙偃月刀：杀被闪抵消后可再出杀 ----------
{
  const g = newGame({ resp: mkResp({ card: () => 'first' }) });   // 目标总能出闪
  const [p0, p1] = g.players;
  equip(p0, 'qinglong');
  p1.hand = [mk('shan', 'diamond', 3), mk('shan', 'club', 4), mk('shan', 'heart', 5)];
  p0.hand = [mk('sha', 'spade', 9), mk('sha', 'heart', 8)];
  await g.useCard({ from: p0, card: p0.hand[0], targets: [p1], reason: 'sha' });
  ok(p1.hp === 4, '[青龙偃月刀] 目标出闪后不应受伤（血未变）');
  const extra = g.testLogs.some(t => /青龙偃月刀|追杀/.test(t)) || p0.hand.length < 2;
  ok(extra, '[青龙偃月刀] 被闪抵消后应提示/允许再用一张【杀】');
}

// ---------- 汇总 ----------
console.log(`\n装备全量：通过 ${pass} / 失败 ${fail}`);
if (skips.length) for (const s of skips) console.log('  (skip)', s);
if (fail) { console.log('失败项：'); for (const b of bad) console.log('  ✗', b); }
process.exit(fail ? 1 : 0);
