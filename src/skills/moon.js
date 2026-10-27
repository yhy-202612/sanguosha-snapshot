// 「月」包技能：月·黄忠 / 月·黄盖 / 月·关羽
// 月体系规则见 engine/moon.js 与 data/moon.js 顶部注释。
import { defineSkill } from '../engine/skill.js';
import { cardLabel, CARD_META } from '../engine/cards.js';
import { addMoon, moonMaxOf, moonIsFull, moonClear } from '../engine/moon.js';

// 牌堆底 = deck 数组头部（见 game.js popDeckBottom 注释）
function takeFromBottom(g, pred, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = g.deck.findIndex(pred);
    if (idx < 0) break;
    out.push(g.deck.splice(idx, 1)[0]);
  }
  return out;
}

async function gainTo(ctx, p, cards, reason) {
  if (!cards.length) return;
  const g = ctx.game;
  p.hand.push(...cards);
  await g.trigger('cards.gain', { self: p, from: null, cards, reason });
}

// ---------------- 月·黄忠 ----------------
// 【天诛】满辉技（「☽」集满时立即使用，耗尽「☽」）：造成「已记录花色数」点伤害并清空记录与 ☽
async function tryTianzhu(ctx) {
  const p = ctx.self, g = ctx.game;
  if (!moonIsFull(p)) return;
  const suits = p.flags.zhuyueSuits || [];
  if (!suits.length) return;
  const cands = g.alive().filter(t => t !== p);
  if (!cands.length) return;
  const n = suits.length;
  const ts = cands.length === 1 ? cands : await g.chooseTargets(p, {
    min: 1, max: 1, candidates: cands,
    prompt: `【天诛】（满辉·立即发动）：对一名角色造成 ${n} 点伤害，并清空花色记录与「☽」`,
  });
  if (!ts.length) return;
  moonClear(p);
  p.flags.zhuyueSuits = [];
  await ctx.log(`【天诛】：${p.name} 清空 ${n} 个「☽」与 ${n} 种花色记录，对 ${ts[0].name} 造成 ${n} 点伤害`);
  await ctx.damage({ from: p, to: ts[0], amount: n, card: null, reason: 'tianzhu' });
}

defineSkill({
  id: 'moon_zhuyue', name: '逐月',
  desc: '锁定技，当你使用一张牌时，积累 1 层「☽」并记录此牌的花色；若此花色为本局首次记录，则额外积累 1 层「☽」。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false, priority: 10,
    async effect(ctx) {
      const p = ctx.self;
      const c = ctx.data?.card;
      addMoon(p, 1);
      let extra = '';
      const suit = c?.suit;
      if (suit) {
        const rec = p.flags.zhuyueSuits || [];
        if (!rec.includes(suit)) {
          p.flags.zhuyueSuits = [...rec, suit];
          addMoon(p, 1);
          extra = '（新记录花色，额外 +1）';
        }
      }
      await ctx.log(`【逐月】：${p.name} 积累「☽」→ ${p.marks.yue}/${moonMaxOf(p)}${extra}`);
    },
  }],
});

// 满辉技【天诛】：由 moon_zhuyue 积累之后检查（priority 低于逐月）
defineSkill({
  id: 'moon_tianzhu', name: '天诛',
  desc: '满辉技（「☽」集满时立即使用，耗尽「☽」）：你对一名角色造成 X 点伤害，X 为你记录的花色数，并清空花色记录。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false, priority: 0,
      async effect(ctx) { await tryTianzhu(ctx); },
    },
    // 兜底：月标记若经非「使用牌」途径集满（如他人给月），出牌阶段开始时立即发动
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) { await tryTianzhu(ctx); },
    },
  ],
});

// ---------------- 月·黄盖 ----------------
// 【诈降】初辉技本体：耗尽 ☽，从牌堆底获得等量【杀】，并可明置
async function doZhaxiang(ctx, n) {
  const p = ctx.self, g = ctx.game;
  const got = takeFromBottom(g, c => c.name === 'sha', n);
  await ctx.log(`【诈降】：${p.name} 耗尽 ${n} 个「☽」，从牌堆底获得 ${got.length} 张【杀】`);
  await gainTo(ctx, p, got, 'zhaxiang');
  const shas = p.hand.filter(c => c.name === 'sha');
  if (!shas.length) return;
  const yes = await g.confirm(p, '【诈降】：是否明置任意张【杀】？明置后你使用【杀】无次数限制。');
  if (!yes) return;
  const pick = await g.chooseSomeCards(p, shas, shas.length, { prompt: '【诈降】：选择要明置的【杀】', optional: true });
  if (!pick.length) return;
  p.flags.zhaxiangMing = pick.map(c => c.id);
  p.flags.shaUnlimited = true;
  await ctx.log(`【诈降】：明置 ${pick.map(c => cardLabel(c)).join('、')}，本回合你使用【杀】无次数限制`);
}

// 【忠心】满辉技（「☽」集满时立即使用，耗尽「☽」）：使用【诈降】且本局【杀】无距离限制
async function tryZhongxin(ctx) {
  const p = ctx.self, g = ctx.game;
  if (!moonIsFull(p)) return;
  const n = p.marks.yue || 0;
  moonClear(p);
  await ctx.log(`【忠心】：满辉立即发动，${p.name} 耗尽 ${n} 个「☽」`);
  await doZhaxiang(ctx, n);
  p.flags.shaNoRange = true;
  await ctx.log('【忠心】：本局你使用【杀】无距离限制');
}

defineSkill({
  id: 'moon_kurou', name: '苦肉',
  desc: '锁定技，回合开始时，你失去 1 点体力，积累 2 层「☽」；当你受到 1 点伤害时，积累 1 层「☽」。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        await ctx.loseHp(p, 1, { reason: 'moon_kurou' });
        addMoon(p, 2);
        await ctx.log(`【苦肉】：失去 1 点体力，积累 2 层「☽」（${p.marks.yue}/${moonMaxOf(p)}）`);
        await tryZhongxin(ctx);
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => (d.target || d.to) === d.self,
      async effect(ctx) {
        const p = ctx.self;
        const n = Math.max(1, ctx.data?.amount || 1);
        addMoon(p, n);
        await ctx.log(`【苦肉】：受到 ${n} 点伤害，积累 ${n} 层「☽」（${p.marks.yue}/${moonMaxOf(p)}）`);
        await tryZhongxin(ctx);
      },
    },
  ],
});

defineSkill({
  id: 'moon_zhaxiang', name: '诈降',
  desc: '初辉技（「☽」不满时可于出牌阶段使用，发动后耗尽「☽」）：你按当前「☽」数从牌堆底获得等量【杀】；然后你可以明置任意张【杀】，明置的【杀】你使用无次数限制。',
  active: {
    prompt: '耗尽「☽」，从牌堆底获得等量【杀】',
    async effect(ctx) {
      const p = ctx.self;
      if (moonIsFull(p)) { await ctx.log('【诈降】：初辉技只能在「☽」不满时发动'); return; }
      const n = p.marks.yue || 0;
      if (n <= 0) { await ctx.log('【诈降】：没有「☽」，无法发动'); return; }
      moonClear(p);
      await doZhaxiang(ctx, n);
    },
  },
});

defineSkill({
  id: 'moon_zhongxin', name: '忠心',
  desc: '满辉技（「☽」集满时立即使用，耗尽「☽」）：你使用【诈降】，且本局内你使用【诈降】得到的【杀】无距离限制。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) { await tryZhongxin(ctx); },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) { await tryZhongxin(ctx); },
    },
  ],
});

// ---------------- 月·关羽 ----------------
// 【武圣】满辉技（「☽」集满时立即使用，耗尽「☽」）：牌堆底两张基本牌 + 额外回合
async function tryWusheng(ctx) {
  const p = ctx.self, g = ctx.game;
  if (!moonIsFull(p)) return;
  moonClear(p);
  await ctx.log(`【武圣】：满辉立即发动，${p.name} 耗尽「☽」`);
  const got = takeFromBottom(g, c => CARD_META[c.name]?.type === 'basic', 2);
  await ctx.log(`【武圣】：${p.name} 从牌堆底获得 ${got.length} 张基本牌（${got.map(c => cardLabel(c)).join('、') || '无'}）`);
  await gainTo(ctx, p, got, 'wusheng');
  p.flags.shaMultiTarget = true;   // 额外回合内【杀】可指定任意名目标（回合结束清除）
  p.flags.shaUnlimited = true;     // 且无次数限制
  await ctx.extraTurn(p);
  await ctx.log('【武圣】：获得一个额外回合，其间你使用【杀】可指定任意名目标且无次数限制');
}

defineSkill({
  id: 'moon_wuhun', name: '武魂',
  desc: '锁定技，当你使用牌指定其他角色为目标时，积累 1 层「☽」。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => Array.isArray(d.targets) && d.targets.some(t => t && t !== d.self),
    async effect(ctx) {
      const p = ctx.self;
      addMoon(p, 1);
      await ctx.log(`【武魂】：${p.name} 使用牌指定其他角色，积累「☽」→ ${p.marks.yue}/${moonMaxOf(p)}`);
      await tryWusheng(ctx);
    },
  }],
});

defineSkill({
  id: 'moon_wusheng', name: '武圣',
  desc: '满辉技·祈月（「☽」集满时立即使用，耗尽「☽」）：摸牌阶段你从牌堆底获得两张基本牌；你获得一个额外回合，在其中你使用【杀】可以指定任意名目标、无次数限制。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) { await tryWusheng(ctx); },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) { await tryWusheng(ctx); },
    },
  ],
});
