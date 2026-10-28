// 江山如故·转（pack = 'jsg_zhuan'）技能实现
// 数据见 src/data/jsg_zhuan.js；技能 id 前缀 `jz_`
// 【影】：黑桃 A 的基本牌，不能使用/打出、无效果；从游戏外无限获得；进入弃牌堆即销毁（引擎 pushDiscard 已处理）
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

let vseq = 0;
const vcard = (name, suit = 'none', num = 0, extra = {}) => ({
  id: `vjz${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const others = (g, p) => g.alive().filter((x) => x !== p);

// 从游戏外获得若干张【影】
async function gainYing(g, p, n, reason = 'ying') {
  if (n <= 0) return [];
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(vcard('ying', 'spade', 1));
  await g.gainCards(p, cards, { reason });
  return cards;
}

async function gainFromOutside(g, p, cards, reason = 'gain') {
  const list = (cards || []).filter(Boolean);
  for (const c of list) {
    for (const zone of [g.deck, g.discardPile, g.table || [], g.exilePile || []]) {
      const i = zone.indexOf(c);
      if (i >= 0) zone.splice(i, 1);
    }
  }
  if (list.length) await g.gainCards(p, list, { reason });
  return list;
}

// ============================================================
// 转·梦郭嘉（魏 3）【轻辎】【定策】【针锋】
// ============================================================
// 轻辎：准备阶段，你可以弃置任意名其他角色装备区内的各一张牌，然后令这些角色获得【神速】直到你的下回合开始。
defineSkill({
  id: 'jz_qingzi', name: '轻辎',
  desc: '准备阶段，你可以弃置任意名其他角色装备区内的各一张牌，然后令这些角色获得【神速】直到你的下回合开始。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.game.alive().some((x) => x !== d.player && Object.values(x.equips).some(Boolean)),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const owners = g.alive().filter((x) => x !== p && Object.values(x.equips).some(Boolean));
      const picked = await ctx.ask.targets(p, {
        prompt: '【轻辎】：弃置这些角色装备区各一张牌', candidates: owners, min: 0, max: owners.length,
      });
      for (const t of picked) {
        const pool = Object.values(t.equips).filter(Boolean);
        if (!pool.length) continue;
        const c = (await g.chooseSomeCards(p, pool, 1, { prompt: `【轻辎】：弃置 ${t.name} 一张装备` }))[0];
        if (c) await ctx.discard(t, [c], { reason: 'qingzi' });
        const sk = getSkill('shensu');
        if (sk && !(effSkills(t) || []).some((s) => s.id === 'shensu')) t.skills.push(sk);
      }
      await ctx.log(`【轻辎】：弃置 ${picked.length} 名角色的装备，其获得【神速】`);
    },
  }],
});

// 定策：当你受到伤害后，你可以依次弃置你和伤害来源各一张手牌，若这两张牌颜色相同，你视为使用一张【洞烛先机】。
// 实现：【洞烛先机】以【无中生有】等价替代。
defineSkill({
  id: 'jz_dingce', name: '定策',
  desc: '当你受到伤害后，你可以依次弃置你和伤害来源各一张手牌，若这两张牌颜色相同，你视为使用一张【洞烛先机】。（实现：【洞烛先机】以【无中生有】等价替代）',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.to === d.player && (d.amount || 0) > 0 && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, from = ctx.data.from;
      const c1 = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【定策】：弃置你一张手牌' }))[0];
      if (!c1) return;
      await ctx.discard(p, [c1], { reason: 'dingce' });
      if (!from || !from.hand.length) return;
      const c2 = (await g.chooseSomeCards(p, from.hand.slice(), 1, { prompt: `【定策】：弃置 ${from.name} 一张手牌` }))[0];
      if (!c2) return;
      await ctx.discard(from, [c2], { reason: 'dingce' });
      const color = (c) => (c.suit === 'heart' || c.suit === 'diamond' ? 'red' : 'black');
      if (color(c1) === color(c2)) {
        await ctx.useCard({ from: p, card: vcard('wuzhong'), targets: [p], reason: 'dingce', virtual: true });
        await ctx.log('【定策】：两牌同色，视为使用【洞烛先机】（以【无中生有】替代）');
      }
    },
  }],
});

// 针锋：出牌阶段每种类别限一次，你可以视为使用一张存活角色技能中包含的牌名的牌
//       （无次数距离限制且须为基本牌或普通锦囊牌），当此牌对该角色生效后，你对其造成 1 点伤害。
// 实现：牌名从常用牌池中选取（引擎无技能文本解析）。
defineSkill({
  id: 'jz_zhenfeng', name: '针锋',
  desc: '出牌阶段每种类别限一次，你可以视为使用一张存活角色技能中包含的牌名的牌（无次数与距离限制且须为基本牌或普通锦囊牌），当此牌对该角色生效后，你对其造成 1 点伤害。（实现：牌名从常用牌池选取）',
  active: {
    perTurn: false,
    prompt: '针锋：视为使用一张基本牌/普通锦囊，生效后对该角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const POOL = { basic: ['sha', 'shan', 'tao'], trick: ['guochai', 'shunshou', 'juedou', 'huogong'] };
      const avail = [];
      if (p.flags.jzZhenfengBasic !== g.turnCount) avail.push('basic');
      if (p.flags.jzZhenfengTrick !== g.turnCount) avail.push('trick');
      if (!avail.length) { await ctx.log('【针锋】：本回合两类别均已使用'); return; }
      const ci = await ctx.ask.choose(p, avail.map((k) => (k === 'basic' ? '基本牌' : '普通锦囊牌')), { prompt: '【针锋】：选择类别' });
      if (ci < 0) return;
      const kind = avail[ci];
      const names = POOL[kind];
      const ni = await ctx.ask.choose(p, names.map((n) => `【${CARD_META[n]?.cn || n}】`), { prompt: '【针锋】：选择牌名' });
      if (ni < 0) return;
      const asName = names[ni];
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【针锋】：选择目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      if (kind === 'basic') p.flags.jzZhenfengBasic = g.turnCount; else p.flags.jzZhenfengTrick = g.turnCount;
      await ctx.useCard({ from: p, card: vcard(asName), targets: [t], reason: 'zhenfeng', virtual: true, asName, ignoreRange: true, ignoreShaLimit: true });
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'zhenfeng' });
      await ctx.log(`【针锋】：视为使用【${CARD_META[asName]?.cn}】并对 ${t.name} 造成 1 点伤害`);
    },
  },
});

// ============================================================
// 转·张飞（蜀 5）【暴喝】【虚势】
// ============================================================
// 暴喝：一名角色的出牌阶段结束时，你可以弃置两张牌，然后视为对攻击范围内包含其的所有角色使用一张无距离限制的【杀】。
//       当其中一名目标角色响应此【杀】后，此【杀】对剩余目标造成的伤害 +1。
defineSkill({
  id: 'jz_baohe', name: '暴喝',
  desc: '一名角色的出牌阶段结束时，你可以弃置两张牌，然后视为对攻击范围内包含其的所有角色使用一张无距离限制的【杀】。当其中一名目标角色响应此【杀】后，此【杀】对剩余目标造成的伤害 +1。',
  triggers: [
    {
      on: 'phase.end', who: 'any', optional: true,
      filter: (d) => d.phase === 'play' && d.player.hand.length >= 2 && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, cur = ctx.data.self;
        const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
        if (pool.length < 2) return;
        const got = await g.chooseSomeCards(p, pool, 2, { prompt: '【暴喝】：弃置两张牌' });
        if (!got || got.length < 2) return;
        await ctx.discard(p, got, { reason: 'baohe' });
        // 「攻击范围内包含其的角色」= 其在该角色的攻击范围内
        const targets = g.alive().filter((x) => x !== cur && g.inAttackRange(x, cur));
        if (!targets.length) return;
        // 一张【杀】同时指定所有目标（shaMultiTarget 打开【杀】的多目标上限，结算后还原）
        const card = vcard('sha');
        card.__baohe = { order: [], shaCtx: null };
        const prevMulti = p.flags.shaMultiTarget;
        p.flags.shaMultiTarget = true;
        try {
          await ctx.useCard({ from: p, card, targets, reason: 'baohe', ignoreRange: true, ignoreShaLimit: true });
        } finally {
          p.flags.shaMultiTarget = prevMulti;
          delete card.__baohe;
        }
        await ctx.log(`【暴喝】：对 ${targets.map((t) => t.name).join('、')} 使用一张【杀】`);
      },
    },
    {
      // 记录此【杀】的实际结算顺序与 shaCtx（target.after 在该【杀】的每个目标上按结算顺序依次触发）
      on: 'target.after', who: 'self',
      filter: (d) => !!(d.card && d.card.__baohe && d.target),
      async effect(ctx) {
        const rec = ctx.data.card.__baohe;
        if (ctx.data.shaCtx) rec.shaCtx = ctx.data.shaCtx;
        if (!rec.order.includes(ctx.data.target)) rec.order.push(ctx.data.target);
      },
    },
    {
      // 一名目标响应此【杀】后：对「剩余目标」（结算顺序在其之后者）加伤，经 shaCtx.bonusBySeat 生效
      on: 'sha.dodged', who: 'self',
      filter: (d) => !!(d.card && d.card.__baohe && d.target),
      async effect(ctx) {
        const rec = ctx.data.card.__baohe, t = ctx.data.target;
        const i = rec.order.indexOf(t);
        const rest = (i >= 0 ? rec.order.slice(i + 1) : rec.order.filter((x) => x !== t)).filter((x) => x !== t);
        if (!rest.length) return;
        const sc = rec.shaCtx;
        if (sc) {
          sc.bonusBySeat = sc.bonusBySeat || {};
          for (const x of rest) sc.bonusBySeat[x.seat] = (sc.bonusBySeat[x.seat] || 0) + 1;
        }
        await ctx.log(`【暴喝】：${t.name} 响应此【杀】，对剩余 ${rest.length} 名目标的伤害 +1`);
      },
    },
  ],
});

// 虚势：出牌阶段限一次，你可以交给任意名角色各一张牌，然后你获得两倍数量的【影】。
defineSkill({
  id: 'jz_xushi', name: '虚势',
  desc: '出牌阶段限一次，你可以交给任意名角色各一张牌，然后你获得两倍数量的【影】。',
  active: {
    perPhase: true,
    prompt: '虚势：交给其他角色各一张牌，获得两倍数量的【影】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) return;
      const cands = others(g, p);
      if (!cands.length) return;
      const picked = await ctx.ask.targets(p, {
        prompt: '【虚势】：选择交牌的角色（每人一张）', candidates: cands, min: 0, max: Math.min(cands.length, p.hand.length),
      });
      if (!picked.length) return;
      for (const t of picked) {
        const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: `【虚势】：交给 ${t.name} 一张牌` }))[0];
        if (c) await ctx.gain(t, [c], { from: p, reason: 'xushi' });
      }
      await gainYing(g, p, picked.length * 2, 'xushi');
      await ctx.log(`【虚势】：交给 ${picked.length} 名角色各一张牌，获得 ${picked.length * 2} 张【影】`);
    },
  },
});

// ============================================================
// 转·孙尚香（吴 3）【闺忌】【骄豪】
// ============================================================
// 闺忌：每回合限一次，出牌阶段，你可以与一名手牌数小于你的男性角色交换手牌，
//       然后其下个出牌阶段结束时，你可以与其交换手牌。
const swapHands = (a, b) => {
  const mine = a.hand.splice(0, a.hand.length);
  const theirs = b.hand.splice(0, b.hand.length);
  a.hand.push(...theirs);
  b.hand.push(...mine);
};
defineSkill({
  id: 'jz_guiji', name: '闺忌',
  desc: '每回合限一次，出牌阶段，你可以与一名手牌数小于你的男性角色交换手牌，然后其下个出牌阶段结束时，你可以与其交换手牌。',
  active: {
    perTurn: true,
    prompt: '闺忌：与一名手牌数小于你的男性角色交换手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((x) => x.gender !== 'female' && x.hand.length < p.hand.length);
      if (!cands.length) { await ctx.log('【闺忌】：没有手牌数小于你的男性角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【闺忌】：选择交换手牌的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      swapHands(p, t);
      p.flags.jzGuijiPending = t.seat;   // 其下个出牌阶段结束时可以再交换一次
      await ctx.log(`【闺忌】：与 ${t.name} 交换手牌`);
    },
  },
  triggers: [{
    on: 'phase.end', who: 'any', optional: true,
    prompt: '【闺忌】：是否与其交换手牌？',
    filter: (d) => d.phase === 'play' && !!d.self
      && d.player.flags?.jzGuijiPending === d.self.seat
      && d.player.flags?.jzGuijiPending !== d.player.seat,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self;
      p.flags.jzGuijiPending = null;
      if (!p.alive || !t.alive) return;
      swapHands(p, t);
      await ctx.log(`【闺忌】：${t.name} 的出牌阶段结束，与其再次交换手牌`);
    },
  }],
});

// 骄豪：其他角色出牌阶段限一次，其可以将手牌中的一张装备牌置于你的装备区中；
//       准备阶段，你获得 X 张【影】（X 为你空置的装备栏数的一半且向上取整）。
defineSkill({
  id: 'jz_jiaohao', name: '骄豪',
  desc: '其他角色出牌阶段限一次，其可以将手牌中的一张装备牌置于你的装备区中；准备阶段，你获得 X 张【影】（X 为你空置的装备栏数的一半且向上取整）。',
  triggers: [
    {
      on: 'phase.begin', who: 'self',
      filter: (d) => d.phase === 'prepare',
      async effect(ctx) {
        const p = ctx.self;
        const empty = Object.values(p.equips).filter((v) => !v).length;
        const x = Math.ceil(empty / 2);
        if (x > 0) { await gainYing(ctx.game, p, x, 'jiaohao'); await ctx.log(`【骄豪】：空置装备栏 ${empty}，获得 ${x} 张【影】`); }
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: true,
      filter: (d) => d.phase === 'play' && d.self !== d.player
        && d.self.flags.jzJiaohaoTurn !== d.game.turnCount
        && d.self.hand.some((c) => c.type === 'equip'),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.self;
        const equips = t.hand.filter((c) => c.type === 'equip');
        const c = (await g.chooseSomeCards(t, equips, 1, { prompt: `【骄豪】：将一张装备牌置入 ${p.name} 的装备区` }))[0];
        if (!c) return;
        t.flags.jzJiaohaoTurn = g.turnCount;
        await g.useCard({ from: t, card: c, targets: [p], reason: 'jiaohao' });
        await ctx.log(`【骄豪】：${t.name} 将【${cardLabel(c)}】置入 ${p.name} 的装备区`);
      },
    },
  ],
});

// ============================================================
// 转·张任（群 4）【伏匿】【穿心】
// ============================================================
// 伏匿：锁定技，你的攻击范围始终为 0；每轮开始时，你令任意名角色获得合计 X 张【影】
//       （X 为存活角色数的一半，向上取整）；当一张【影】被置入弃牌堆时，令你本回合使用牌无距离限制且不能被响应。
defineSkill({
  id: 'jz_funi', name: '伏匿',
  desc: '锁定技，你的攻击范围始终为 0；每轮开始时，你令任意名角色获得合计 X 张【影】（X 为存活角色数的一半，向上取整）；当一张【影】被置入弃牌堆时，令你本回合使用牌无距离限制且不能被响应。',
  triggers: [
    {
      on: 'game.start', who: 'self',
      async effect(ctx) { ctx.self.flags.rangeOverride = 0; },
    },
    {
      on: 'round.begin', who: 'self', optional: true,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = Math.ceil(g.alive().length / 2);
        const picked = await ctx.ask.targets(p, {
          prompt: `【伏匿】：令任意名角色合计获得 ${x} 张【影】`, candidates: g.alive(), min: 1, max: g.alive().length,
        });
        let left = x;
        for (let i = 0; i < picked.length && left > 0; i++) {
          const n = i === picked.length - 1 ? left : Math.ceil(left / (picked.length - i));
          const give = Math.min(n, left);
          left -= give;
          if (give > 0) await gainYing(g, picked[i], give, 'funi');
        }
        await ctx.log(`【伏匿】：分配 ${x} 张【影】`);
      },
    },
    {
      on: 'cards.discard', who: 'any',
      filter: (d) => (d.cards || []).some((c) => c && c.name === 'ying'),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.freeRangeTurn = g.turnCount;
        p.flags.jzUnrespondable = g.turnCount;
        await ctx.log('【伏匿】：有【影】入弃牌堆，本回合使用牌无距离限制且不能被响应');
      },
    },
  ],
});

// 穿心：一名角色结束阶段，你可以将一张牌当伤害值 +X 的【杀】使用（X 为当前目标本回合回复过的体力值）。
defineSkill({
  id: 'jz_chuanxin', name: '穿心',
  desc: '一名角色结束阶段，你可以将一张牌当伤害值 +X 的【杀】使用（X 为当前目标本回合回复过的体力值）。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => d.phase === 'end' && (d.player.hand.length > 0 || Object.values(d.player.equips).some(Boolean)),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) return;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【穿心】：选择【杀】的目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【穿心】：选择一张牌当【杀】' }))[0];
      if (!c) return;
      const x = t.flags.jzRecoverTurn === g.turnCount ? (t.flags.jzRecoverCount || 0) : 0;
      await ctx.discard(p, [c], { reason: 'chuanxin' });
      await ctx.useCard({ from: p, card: vcard('sha', 'none', 0, { jzBonus: x }), targets: [t], reason: 'chuanxin', ignoreShaLimit: true });
      await ctx.log(`【穿心】：将一张牌当【杀】使用（伤害 +${x}）`);
    },
  }, {
    on: 'hp.recover', who: 'any', priority: 2,
    async effect(ctx) {
      const t = ctx.data.self;
      if (!t) return;
      const g = ctx.game;
      if (t.flags.jzRecoverTurn !== g.turnCount) { t.flags.jzRecoverTurn = g.turnCount; t.flags.jzRecoverCount = 0; }
      t.flags.jzRecoverCount = (t.flags.jzRecoverCount || 0) + (ctx.data.count || 1);
    },
  }, {
    on: 'damage.before', who: 'any',
    filter: (d) => d.card && d.card.jzBonus > 0,
    async effect(ctx) { ctx.data.amount = (ctx.data.amount || 1) + (ctx.data.card.jzBonus || 0); },
  }],
});

// ============================================================
// 转·娄圭（魏 3）【沙城】【凝寒】
// ============================================================
// 沙城：游戏开始时，你将牌堆顶的两张牌置于你的武将牌上（称为「沙城」）；
//       当一名角色使用一张【杀】结算后，你可以移去一张「沙城」，令其中一名目标角色摸 X 张牌（X 为该目标本回合失去的牌数且至多为 5）。
defineSkill({
  id: 'jz_shacheng', name: '沙城',
  reclaimCards(p) { const a = p.flags.jzShacheng || []; p.flags.jzShacheng = []; return a; },
  desc: '游戏开始时，你将牌堆顶的两张牌置于你的武将牌上（称为「沙城」）；当一名角色使用一张【杀】结算后，你可以移去一张「沙城」，令其中一名目标角色摸 X 张牌（X 为该目标本回合失去的牌数且至多为 5）。',
  triggers: [
    {
      on: 'game.start', who: 'self',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.jzShacheng = (p.flags.jzShacheng || []);
        for (let i = 0; i < 2; i++) { const c = g.popDeck(1)[0]; if (c) p.flags.jzShacheng.push(c); }
        await ctx.log(`【沙城】：将牌堆顶两张牌置于武将牌上（沙城 ${p.flags.jzShacheng.length}）`);
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: true,
      filter: (d) => d.card && d.card.name === 'sha' && (d.player.flags.jzShacheng || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const pile = p.flags.jzShacheng || [];
        if (!pile.length) return;
        const removed = pile.pop();
        p.flags.jzShacheng = pile;
        // ★「移去」的牌必须进弃牌堆，否则牌凭空消失（SG029 BLOCKER-4）
        // ★用 pushDiscardIfOrphan：牌可能仍在牌堆/其它区域（引用或未摘除），不能重复入堆（SG029 seed 9144）
        if (removed) g.pushDiscardIfOrphan(removed);
        const t = (ctx.data.targets || [])[0];
        const x = Math.max(0, Math.min(5, t ? (t.flags.jzLostTurn === ctx.game.turnCount ? (t.flags.jzLostCount || 0) : 0) : 0));
        if (t && x > 0) await ctx.draw(t, x, { reason: 'shacheng' });
        await ctx.log(`【沙城】：移去【${cardLabel(removed)}】，${t ? t.name : '目标'} 摸 ${x} 张牌`);
      },
    },
    {
      on: 'cards.lose', who: 'any', priority: 1,
      async effect(ctx) {
        const t = ctx.data.self;
        if (!t) return;
        const g = ctx.game;
        if (t.flags.jzLostTurn !== g.turnCount) { t.flags.jzLostTurn = g.turnCount; t.flags.jzLostCount = 0; }
        t.flags.jzLostCount = (t.flags.jzLostCount || 0) + (ctx.data.cards || []).length;
      },
    },
  ],
});

// 凝寒：锁定技，所有角色手牌中的梅花【杀】均视为冰【杀】；
//       当一名角色受到冰冻伤害后，你可以将造成此伤害的牌置于武将牌上（称为「沙城」）。
// 实现：引擎无「冰冻」属性，梅花【杀】按普通【杀】结算；伤害后「沙城」加牌保留。
defineSkill({
  id: 'jz_ninghan', name: '凝寒',
  desc: '锁定技，所有角色手牌中的梅花【杀】均视为冰【杀】；当一名角色受到冰冻伤害后，你可以将造成此伤害的牌置于武将牌上（称为「沙城」）。（实现：引擎无冰属性，梅花杀按普通结算；伤害后加「沙城」保留）',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && d.card.suit === 'club',
    async effect(ctx) {
      const p = ctx.self;
      const c = ctx.data.card;
      p.flags.jzShacheng = p.flags.jzShacheng || [];
      if (!p.flags.jzShacheng.includes(c)) p.flags.jzShacheng.push(c);
      await ctx.log(`【凝寒】：将【${cardLabel(c)}】置于「沙城」`);
    },
  }],
});

// ============================================================
// 转·黄忠（蜀 4）【摧锋】【登难】
// ============================================================
// 摧锋：限定技，出牌阶段，你可以视为使用一张单目标伤害类牌（无距离限制），
//       此回合结束时，若此牌造成的伤害值不为 1，你重置【摧锋】。
defineSkill({
  id: 'jz_cuifeng', name: '摧锋',
  desc: '限定技，出牌阶段，你可以视为使用一张单目标伤害类牌（无距离限制），此回合结束时，若此牌造成的伤害值不为 1，你重置【摧锋】。',
  active: {
    perTurn: false,
    prompt: '摧锋（限定技）：视为使用一张伤害类牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jzCuifengUsed === g.turnCount) { await ctx.log('【摧锋】：本回合已使用'); return; }
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【摧锋】：选择目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.jzCuifengUsed = g.turnCount;
      const before = t.hp;
      await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'cuifeng', ignoreRange: true, ignoreShaLimit: true });
      const dmg = before - t.hp;
      if (dmg !== 1) {
        p.flags.jzCuifengUsed = null;
        await ctx.log(`【摧锋】：伤害为 ${dmg}（不为 1），重置【摧锋】`);
      }
    },
  },
});

// 登难：限定技，出牌阶段，你可以视为使用一张非伤害类普通锦囊牌，
//       此回合结束时，若此牌的目标均于此回合受到过伤害，你重置【登难】。
defineSkill({
  id: 'jz_dengnan', name: '登难',
  desc: '限定技，出牌阶段，你可以视为使用一张非伤害类普通锦囊牌，此回合结束时，若此牌的目标均于此回合受到过伤害，你重置【登难】。',
  active: {
    perTurn: false,
    prompt: '登难（限定技）：视为使用一张非伤害类普通锦囊',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jzDengnanUsed === g.turnCount) { await ctx.log('【登难】：本回合已使用'); return; }
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【登难】：选择目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.jzDengnanUsed = g.turnCount;
      await ctx.useCard({ from: p, card: vcard('wuzhong'), targets: [p], reason: 'dengnan', virtual: true });
      if (t.flags.jzHurtTurn === g.turnCount) {
        p.flags.jzDengnanUsed = null;
        await ctx.log('【登难】：目标本回合受到过伤害，重置【登难】');
      }
    },
  },
  triggers: [{
    on: 'damage.after', who: 'any', priority: 2,
    async effect(ctx) { if (ctx.data.to) ctx.data.to.flags.jzHurtTurn = ctx.game.turnCount; },
  }],
});

// ============================================================
// 转·夏侯荣（魏 4）【奋剑】
// ============================================================
// 奋剑：每回合各限一次，当你需要对其他角色使用【决斗】或【桃】时，
//       你可以令你受到的伤害 +1 直到本回合结束，然后你视为使用之。
// 实现：【桃】分支在濒死求桃时（dying.begin）真实触发；引擎没有「需要使用某张牌」的统一入口，
//       【决斗】分支仍以出牌阶段主动发动近似。
defineSkill({
  id: 'jz_fenjian', name: '奋剑',
  desc: '每回合各限一次，当你需要对其他角色使用【决斗】或【桃】时，你可以令你受到的伤害 +1 直到本回合结束，然后你视为使用之。（实现：【桃】分支于濒死时触发；【决斗】分支因引擎无「需要使用某牌」入口，仍为出牌阶段主动发动）',
  active: {
    perTurn: false,
    prompt: '奋剑：令你本回合受到的伤害 +1，视为使用【决斗】或【桃】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const opts = [];
      if (p.flags.jzFenjianA !== g.turnCount) opts.push({ key: 'duel', label: '视为使用【决斗】' });
      if (p.flags.jzFenjianB !== g.turnCount && p.hp < p.maxHp) opts.push({ key: 'tao', label: '视为使用【桃】' });
      if (!opts.length) { await ctx.log('【奋剑】：本回合两项均已使用'); return; }
      const idx = await ctx.ask.choose(p, opts.map((o) => o.label), { prompt: '【奋剑】：选择一项' });
      if (idx < 0) return;
      p.flags.jzFenjianPlus = g.turnCount;
      if (opts[idx].key === 'duel') {
        const cands = others(g, p);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【奋剑】：选择【决斗】目标', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        p.flags.jzFenjianA = g.turnCount;
        await ctx.useCard({ from: p, card: vcard('juedou'), targets: [t], reason: 'fenjian', virtual: true });
      } else {
        p.flags.jzFenjianB = g.turnCount;
        await ctx.recover(p, 1, { reason: 'fenjian' });
      }
      await ctx.log('【奋剑】：本回合你受到的伤害 +1');
    },
  },
  triggers: [
    {
      // 【桃】分支：濒死时视为使用【桃】（回复 1 点体力）
      on: 'dying.begin', who: 'self', optional: true,
      filter: (d) => d.self.hp <= 0 && d.player.flags.jzFenjianB !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.jzFenjianB = g.turnCount;
        p.flags.jzFenjianPlus = g.turnCount;
        await ctx.recover(p, 1, { reason: 'fenjian' });
        await ctx.log('【奋剑】：视为使用【桃】，本回合你受到的伤害 +1');
      },
    },
    {
      on: 'damage.before', who: 'self',
      filter: (d) => d.to === d.player && d.player.flags.jzFenjianPlus === d.game.turnCount,
      async effect(ctx) { ctx.data.amount = (ctx.data.amount || 1) + 1; },
    },
  ],
});

// ============================================================
// 转·庞统（群 3）【漫卷】【养名】
// ============================================================
// 漫卷：若你没有手牌，你可以如手牌般使用或打出弃牌堆中本回合置入的牌（每种点数每回合限一次）。
defineSkill({
  id: 'jz_manjuan', name: '漫卷',
  desc: '若你没有手牌，你可以如手牌般使用或打出弃牌堆中本回合置入的牌（每种点数每回合限一次）。',
  active: {
    perTurn: false,
    prompt: '漫卷：无手牌时，使用弃牌堆中本回合置入的牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.hand.length) { await ctx.log('【漫卷】：需没有手牌'); return; }
      const pool = (g.discardPile || []).filter((c) => c && c.name !== 'ying' && !(p.flags.jzManjuanPts || []).includes(c.num));
      if (!pool.length) { await ctx.log('【漫卷】：弃牌堆没有可用牌'); return; }
      const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【漫卷】：选择弃牌堆中的一张牌使用' }))[0];
      if (!c) return;
      p.flags.jzManjuanPts = [...(p.flags.jzManjuanPts || []), c.num];
      await gainFromOutside(g, p, [c], 'manjuan');
      const meta = CARD_META[c.name] || {};
      const targets = (meta.target && meta.target.max !== 0)
        ? await g.chooseTargets(p, { prompt: `【漫卷】：为【${cardLabel(c)}】选择目标`, candidates: g.candidatesFor(p, c), min: 0, max: 1 })
        : [];
      await g.useCard({ from: p, card: c, targets, reason: 'manjuan' });
      await ctx.log(`【漫卷】：使用弃牌堆中的【${cardLabel(c)}】`);
    },
  },
});

// 养名：出牌阶段限一次，你可以与一名角色拼点，若其没赢，你可以与其重复此流程；
//       若其赢，其摸等同于其本阶段拼点没赢次数的牌，然后你回复 1 点体力。
defineSkill({
  id: 'jz_yangming', name: '养名',
  desc: '出牌阶段限一次，你可以与一名角色拼点，若其没赢，你可以与其重复此流程；若其赢，其摸等同于其本阶段拼点没赢次数的牌，然后你回复 1 点体力。',
  active: {
    perPhase: true,
    prompt: '养名：与一名角色反复拼点，其赢了则摸牌、你回复体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((x) => x.hand.length > 0);
      if (!cands.length || !p.hand.length) { await ctx.log('【养名】：没有可拼点的角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【养名】：选择拼点对象', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      let lose = 0, guard = 0;
      while (guard++ < 10 && p.hand.length && t.hand.length) {
        const r = await pindian(g, p, t, { reason: '养名' });
        if (r.win) {
          lose++;
          const again = await ctx.ask.confirm(p, '【养名】：其没赢，是否继续拼点？');
          if (!again) break;
        } else {
          if (lose > 0) await ctx.draw(t, lose, { reason: 'yangming' });
          if (p.hp < p.maxHp) await ctx.recover(p, 1, { reason: 'yangming' });
          await ctx.log(`【养名】：其赢，摸 ${lose} 张牌，你回复 1 点体力`);
          return;
        }
      }
      await ctx.log('【养名】：拼点结束');
    },
  },
});

// ============================================================
// 转·蔡瑁&张允（魏 4）【连舟】【惊澜】
// ============================================================
// 连舟：锁定技，准备阶段，你横置，然后你横置任意名体力值等于你的角色。
defineSkill({
  id: 'jz_lianzhou', name: '连舟',
  desc: '锁定技，准备阶段，你横置，然后你横置任意名体力值等于你的角色。',
  triggers: [{
    on: 'phase.begin', who: 'self',
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.chained = true;
      const cands = g.alive().filter((x) => x !== p && x.hp === p.hp && !x.chained);
      if (!cands.length) { await ctx.log('【连舟】：你横置'); return; }
      const picked = await ctx.ask.targets(p, {
        prompt: '【连舟】：横置体力值与你相同的角色', candidates: cands, min: 0, max: cands.length,
      });
      for (const t of picked) t.chained = true;
      await ctx.log(`【连舟】：横置自己${picked.length ? '与 ' + picked.map((t) => t.name).join('、') : ''}`);
    },
  }],
});

// 惊澜：锁定技，当你造成伤害后，若你的手牌数：大于体力值，你弃置四张手牌；
//       等于体力值，你弃置一张牌并回复 1 点体力；小于体力值，你受到 1 点火焰伤害并摸五张牌。
defineSkill({
  id: 'jz_jinglan', name: '惊澜',
  desc: '锁定技，当你造成伤害后，若你的手牌数：大于体力值，你弃置四张手牌；等于体力值，你弃置一张牌并回复 1 点体力；小于体力值，你受到 1 点火焰伤害并摸五张牌。',
  triggers: [{
    on: 'damage.after', who: 'self',
    filter: (d) => d.from === d.player && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self;
      if (p.hand.length > p.hp) {
        const n = Math.min(4, p.hand.length);
        await ctx.discard(p, p.hand.slice(0, n), { reason: 'jinglan' });
      } else if (p.hand.length === p.hp) {
        if (p.hand.length) await ctx.discard(p, [p.hand[0]], { reason: 'jinglan' });
        if (p.hp < p.maxHp) await ctx.recover(p, 1, { reason: 'jinglan' });
      } else {
        await ctx.damage({ to: p, amount: 1, nature: 'fire', reason: 'jinglan' });
        await ctx.draw(p, 5, { reason: 'jinglan' });
      }
    },
  }],
});

// ============================================================
// 转·蒋干（魏 3）【伪诚】【盗书】
// ============================================================
// 伪诚：当你交给其他角色手牌，或你的手牌被其他角色获得后，若你的手牌数小于体力值，你可以摸一张牌。
defineSkill({
  id: 'jz_weicheng', name: '伪诚',
  desc: '当你交给其他角色手牌，或你的手牌被其他角色获得后，若你的手牌数小于体力值，你可以摸一张牌。',
  triggers: [{
    on: 'cards.gain', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player;
      const owner = d.self;      // 获得牌的人
      const from = d.from;       // 牌的原主
      // ① 自己把牌交给别人（原主为自己、获得者为他人）；② 自己的牌被别人获得（同样 from=自己、self=他人）
      return from === p && owner !== p && p.hand.length < p.hp;
    },
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'weicheng' });
      await ctx.log('【伪诚】：手牌数小于体力值，摸一张牌');
    },
  }],
});

// 盗书：出牌阶段限一次，你可以选择一名其他角色并选择一种花色，然后获得其一张手牌。
//       若此牌与你选择的花色：相同，你对其造成 1 点伤害且此技能视为未发动过；
//       不同，你交给其一张与此牌花色不同的手牌（若没有须展示所有手牌）。
defineSkill({
  id: 'jz_daoshu', name: '盗书',
  desc: '出牌阶段限一次，你可以选择一名其他角色并选择一种花色，然后获得其一张手牌。若此牌与你选择的花色：相同，你对其造成 1 点伤害且此技能视为未发动过；不同，你交给其一张与此牌花色不同的手牌（若没有须展示所有手牌）。',
  active: {
    perPhase: true,
    prompt: '盗书：猜花色并获得一名角色一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((x) => x.hand.length > 0);
      if (!cands.length) { await ctx.log('【盗书】：没有可指定的目标'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【盗书】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const SUITS = ['spade', 'heart', 'club', 'diamond'];
      const CN = { spade: '黑桃', heart: '红桃', club: '梅花', diamond: '方块' };
      const si = await ctx.ask.choose(p, SUITS.map((s) => CN[s]), { prompt: '【盗书】：声明一种花色' });
      if (si < 0) return;
      const suit = SUITS[si];
      const c = (await g.chooseSomeCards(p, t.hand.slice(), 1, { prompt: '【盗书】：获得其一张手牌' }))[0];
      if (!c) return;
      await ctx.gain(p, [c], { from: t, reason: 'daoshu' });
      if (c.suit === suit) {
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'daoshu' });
        p.flags.act_daoshu = null;
        await ctx.log(`【盗书】：花色相同，造成 1 点伤害，此技能视为未发动`);
      } else {
        const give = p.hand.filter((x) => x.suit !== c.suit);
        if (give.length) {
          const pick = (await g.chooseSomeCards(p, give, 1, { prompt: '【盗书】：交给其一张花色不同的手牌' }))[0];
          if (pick) await ctx.gain(t, [pick], { from: p, reason: 'daoshu' });
        } else {
          await ctx.log(`【盗书】：展示手牌 ${p.hand.map((x) => `【${cardLabel(x)}】`).join('')}`);
        }
      }
    },
  },
});

// ============================================================
// 转·黄承彦（群 3）【观虚】【雅士】
// ============================================================
// 观虚：出牌阶段限一次，你可以观看一名其他角色的手牌，同时你观看牌堆顶的五张牌并可以用其中一张牌交换该角色的一张手牌。
//       若如此做，你可以弃置其手牌中三张相同花色的牌。
defineSkill({
  id: 'jz_guanxu', name: '观虚',
  desc: '出牌阶段限一次，你可以观看一名其他角色的手牌，同时你观看牌堆顶的五张牌并可以用其中一张牌交换该角色的一张手牌。若如此做，你可以弃置其手牌中三张相同花色的牌。',
  active: {
    perPhase: true,
    prompt: '观虚：观看他人手牌与牌堆顶，可交换一张并弃其三张同花色牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((x) => x.hand.length > 0);
      if (!cands.length) { await ctx.log('【观虚】：没有可指定的目标'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【观虚】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.log(`【观虚】：${t.name} 的手牌 ${t.hand.map((c) => `【${cardLabel(c)}】`).join('')}`);
      const top = [];
      for (let i = 0; i < 5 && g.deck.length; i++) top.push(g.deck.pop());
      await ctx.log(`【观虚】：牌堆顶 ${top.map((c) => `【${cardLabel(c)}】`).join('')}`);
      if (top.length && t.hand.length) {
        const yes = await ctx.ask.confirm(p, '【观虚】：是否用牌堆顶一张牌交换其一张手牌？');
        if (yes) {
          const mine = (await g.chooseSomeCards(p, top, 1, { prompt: '【观虚】：选择牌堆顶一张牌' }))[0];
          const theirs = (await g.chooseSomeCards(p, t.hand.slice(), 1, { prompt: '【观虚】：选择其一张手牌' }))[0];
          if (mine && theirs) {
            const ti = t.hand.indexOf(theirs);
            if (ti >= 0) t.hand.splice(ti, 1);
            const oi = top.indexOf(mine);
            if (oi >= 0) top.splice(oi, 1);
            t.hand.push(mine);
            top.push(theirs);
            await ctx.log('【观虚】：交换一张牌');
            const counts = {};
            for (const c of t.hand) counts[c.suit] = (counts[c.suit] || 0) + 1;
            const sp = Object.entries(counts).find(([, n]) => n >= 3);
            if (sp) {
              const same = t.hand.filter((c) => c.suit === sp[0]).slice(0, 3);
              const ok = await ctx.ask.confirm(p, `【观虚】：是否弃置 ${t.name} 三张同花色牌？`);
              if (ok) { await ctx.discard(t, same, { reason: 'guanxu' }); await ctx.log('【观虚】：弃置其三张同花色牌'); }
            }
          }
        }
      }
      for (const c of top.reverse()) g.deck.push(c);   // 余牌放回牌堆顶
    },
  },
});

// 雅士：当你受到伤害后，你可以选择一项：1.令伤害来源的非锁定技无效直到其下个回合开始；
//       2.对一名其他角色发动一次【观虚】。
defineSkill({
  id: 'jz_yashi', name: '雅士',
  desc: '当你受到伤害后，你可以选择一项：1.令伤害来源的非锁定技无效直到其下个回合开始；2.对一名其他角色发动一次【观虚】。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.to === d.player && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, from = ctx.data.from;
      const idx = await ctx.ask.choose(p, ['令伤害来源的非锁定技无效直到其下个回合开始', '对一名其他角色发动一次【观虚】'], { prompt: '【雅士】：选择一项' });
      if (idx === 0) {
        if (!from) return;
        from.flags.noSkills = true;
        await ctx.log(`【雅士】：${from.name} 的非锁定技失效`);
      } else {
        const cands = others(g, p).filter((x) => x.hand.length > 0);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【雅士】：选择【观虚】的目标', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const sk = getSkill('jz_guanxu');
        if (sk) await sk.active.effect(ctx);
      }
    },
  }],
});

// ============================================================
// 转·阚泽（吴 3）【下书】【宽释】
// ============================================================
// 下书：出牌阶段开始时，你可以将所有手牌交给一名其他角色，然后其展示任意张手牌，你选择一项：
//       1.获得其展示的手牌；2.获得其未展示的手牌。
defineSkill({
  id: 'jz_xiashu', name: '下书',
  desc: '出牌阶段开始时，你可以将所有手牌交给一名其他角色，然后其展示任意张手牌，你选择一项：1.获得其展示的手牌；2.获得其未展示的手牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【下书】：将所有手牌交给一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.gain(t, p.hand.slice(), { from: p, reason: 'xiashu' });
      if (!t.hand.length) return;
      const shown = await g.chooseSomeCards(t, t.hand.slice(), Math.min(2, t.hand.length), { prompt: '【下书】：展示任意张手牌' });
      const shownList = shown || [];
      await ctx.log(`【下书】：${t.name} 展示 ${shownList.map((c) => `【${cardLabel(c)}】`).join('') || '（无）'}（共 ${t.hand.length} 张）`);
      const idx = await ctx.ask.choose(p, ['获得其展示的手牌', '获得其未展示的手牌'], { prompt: '【下书】：选择一项' });
      const rest = t.hand.filter((c) => !shownList.includes(c));
      const take = idx === 0 ? shownList : rest;
      if (take.length) await ctx.gain(p, take, { from: t, reason: 'xiashu' });
      await ctx.log(`【下书】：获得 ${take.length} 张牌`);
    },
  }],
});

// 宽释：结束阶段，你可以选择一名角色，直到你的下回合开始，
//       当其于一回合内受到第 2 点伤害后，其回复 1 点体力。
defineSkill({
  id: 'jz_kuanshi', name: '宽释',
  desc: '结束阶段，你可以选择一名角色，直到你的下回合开始，当其于一回合内受到第 2 点伤害后，其回复 1 点体力。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { prompt: '【宽释】：选择一名角色', candidates: g.alive(), min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.jzKuanshiTarget = t.id;
      if (!(effSkills(t) || []).some((s) => s.id === 'jz_kuanshi_aura')) {
        const sk = getSkill('jz_kuanshi_aura');
        if (sk) t.skills.push(sk);
      }
      await ctx.log(`【宽释】：${t.name} 一回合内第 2 点伤害后回复 1 点体力`);
    },
  }, { on: 'turn.begin', who: 'self', async effect(ctx) { ctx.self.flags.jzKuanshiTarget = null; } }],
});

defineSkill({
  id: 'jz_kuanshi_aura', name: '宽释',
  desc: '锁定技，当你于一回合内受到第 2 点伤害后，你回复 1 点体力（阚泽【宽释】赋予）。',
  hidden: true,
  triggers: [{
    on: 'damage.after', who: 'self',
    filter: (d) => d.to === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jzKsTurn !== g.turnCount) { p.flags.jzKsTurn = g.turnCount; p.flags.jzKsCount = 0; }
      p.flags.jzKsCount = (p.flags.jzKsCount || 0) + (ctx.data.amount || 0);
      if (p.flags.jzKsCount >= 2 && !p.flags.jzKsDone) {
        p.flags.jzKsDone = true;
        if (p.hp < p.maxHp) await ctx.recover(p, 1, { reason: 'kuanshi' });
        await ctx.log('【宽释】：本回合第 2 点伤害后，回复 1 点体力');
      }
    },
  }],
});

// ============================================================
// 转·马超（群 4）【追命】+【马术】
// ============================================================
// 追命：当你使用【杀】指定唯一目标后，你可以声明一种颜色并令目标角色弃置任意张牌，然后你展示其一张牌；
//       若此牌颜色与你声明的相同，则此【杀】不计入次数限制、不能被响应且伤害 +1。
defineSkill({
  id: 'jz_zhuiming', name: '追命',
  desc: '当你使用【杀】指定唯一目标后，你可以声明一种颜色并令目标角色弃置任意张牌，然后你展示其一张牌；若此牌颜色与你声明的相同，则此【杀】不计入次数限制、不能被响应且伤害 +1。',
  triggers: [{
    on: 'target.after', who: 'self', optional: true,
    // 「指定唯一目标后」：d.total 由引擎在目标循环里注入（本次使用的声明目标数）
    filter: (d) => d.card && d.card.name === 'sha' && !!(d.target || d.to) && d.total === 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.target || ctx.data.to;
      if (!t || !t.hand.length) return;
      const idx = await ctx.ask.choose(p, ['声明红色', '声明黑色'], { prompt: '【追命】：声明一种颜色' });
      if (idx < 0) return;
      const red = idx === 0;
      const cn = await ctx.ask.confirm(t, '【追命】：是否弃置任意张牌？');
      if (cn) {
        const got = await g.chooseSomeCards(t, [...t.hand, ...Object.values(t.equips).filter(Boolean)], Math.min(2, t.hand.length), { prompt: '【追命】：弃置任意张牌' });
        if (got && got.length) await ctx.discard(t, got, { reason: 'zhuiming' });
      }
      if (!t.hand.length) return;
      const shown = t.hand[g.rng.int(t.hand.length)];
      await ctx.log(`【追命】：展示 ${t.name} 一张牌【${cardLabel(shown)}】`);
      const isRed = shown.suit === 'heart' || shown.suit === 'diamond';
      if (isRed === red) {
        p.flags.shaUsed = Math.max(0, (p.flags.shaUsed || 0) - 1);
        // ★必须按目标写 per-seat 通道：shaCtx 是一次【杀】共享的，
        //   置 shaCtx.unavoidable 会让全部目标都免【闪】；用牌级标记加伤则会让全部目标伤害 +1。
        //   引擎在 cards.js 的 sha.effect 里逐目标读 unavoidableBySeat / bonusBySeat。
        const sc = ctx.data.shaCtx;
        if (sc) {
          if (!sc.unavoidableBySeat) sc.unavoidableBySeat = {};
          sc.unavoidableBySeat[t.seat] = true;
          if (!sc.bonusBySeat) sc.bonusBySeat = {};
          sc.bonusBySeat[t.seat] = (sc.bonusBySeat[t.seat] || 0) + 1;
        }
        await ctx.log('【追命】：颜色相同，此【杀】不计次数、不能被响应且伤害 +1');
      }
    },
  }],
});

// ============================================================
// 转·韩遂（群 4）【逆乱】【互雠】【皆盟】
// ============================================================
// 逆乱：准备阶段，你可以选择一项：1.弃置一张牌，对一名未对你造成过伤害的角色造成 1 点伤害；
//       2.令一名对你造成过伤害的角色摸两张牌。
defineSkill({
  id: 'jz_niluan', name: '逆乱',
  desc: '准备阶段，你可以选择一项：1.弃置一张牌，对一名未对你造成过伤害的角色造成 1 点伤害；2.令一名对你造成过伤害的角色摸两张牌。',
  triggers: [
    {
      on: 'damage.after', who: 'self', priority: 2,
      async effect(ctx) {
        if (!ctx.data.from) return;
        const p = ctx.self;
        p.flags.jzHurtBy = p.flags.jzHurtBy || {};
        p.flags.jzHurtBy[ctx.data.from.id] = true;
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const hurtBy = p.flags.jzHurtBy || {};
        const clean = others(g, p).filter((x) => !hurtBy[x.id]);
        const dirty = others(g, p).filter((x) => hurtBy[x.id]);
        const opts = [];
        if (p.hand.length && clean.length) opts.push(`弃一张牌，对一名未伤你的角色造成 1 点伤害`);
        if (dirty.length) opts.push('令一名伤过你的角色摸两张牌');
        if (!opts.length) return;
        const idx = await ctx.ask.choose(p, opts, { prompt: '【逆乱】：选择一项' });
        if (idx < 0) return;
        if (opts[idx].startsWith('弃')) {
          const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【逆乱】：弃置一张牌' }))[0];
          if (!c) return;
          await ctx.discard(p, [c], { reason: 'niluan' });
          const t = (await ctx.ask.targets(p, { prompt: '【逆乱】：选择目标', candidates: clean, min: 1, max: 1 }))[0];
          if (t) await ctx.damage({ from: p, to: t, amount: 1, reason: 'niluan' });
        } else {
          const t = (await ctx.ask.targets(p, { prompt: '【逆乱】：选择目标', candidates: dirty, min: 1, max: 1 }))[0];
          if (t) await ctx.draw(t, 2, { reason: 'niluan' });
        }
      },
    },
  ],
});

// 互雠：锁定技，当上一名对你使用伤害类牌的其他角色受到你造成的伤害时，此伤害 +1。
defineSkill({
  id: 'jz_huchou', name: '互雠',
  desc: '锁定技，当上一名对你使用伤害类牌的其他角色受到你造成的伤害时，此伤害 +1。',
  triggers: [
    {
      on: 'damage.before', who: 'self',
      async effect(ctx) { if (ctx.data.from) ctx.self.flags.jzLastAttacker = ctx.data.from.id; },
    },
    {
      on: 'damage.before', who: 'any',
      filter: (d) => d.from === d.player && d.to && d.player.flags.jzLastAttacker === d.to.id,
      async effect(ctx) { ctx.data.amount = (ctx.data.amount || 1) + 1; },
    },
  ],
});

// 皆盟：主公技，锁定技，所有群势力角色计算与其他角色的距离 -X（X 为群势力角色数）。
defineSkill({
  id: 'jz_jiemeng', name: '皆盟',
  locked: true,   // 主公技+锁定技：desc 前缀不是「锁定技」，靠显式标记避免 includeLocked:false 时被误停（SG028）
  desc: '主公技，锁定技，所有群势力角色计算与其他角色的距离 -X（X 为群势力角色数）。',
  triggers: [{
    on: 'distance.calc', who: 'any',
    effect(ctx) {
      const d = ctx.data;
      if (!d.self || d.self.kingdom !== 'qun') return;
      const x = d.game?.alive ? d.game.alive().filter((p) => p.kingdom === 'qun').length : 0;
      if (x > 0) d.value = Math.max(1, d.value - x);
    },
  }],
});

// ============================================================
// 转·张楚（群 3）【惑众】【日彗】
// ============================================================
// 惑众：每名角色出牌阶段限一次，其可以将一张黑色非锦囊牌当【兵粮寸断】置入其判定区，然后令你摸两张牌。
defineSkill({
  id: 'jz_huozhong', name: '惑众',
  desc: '每名角色出牌阶段限一次，其可以将一张黑色非锦囊牌当【兵粮寸断】置入其判定区，然后令你摸两张牌。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => d.phase === 'play' && d.self !== d.player
      && d.self.flags.jzHuozhongTurn !== d.game.turnCount
      && d.self.hand.some((c) => (c.suit === 'spade' || c.suit === 'club') && c.type !== 'trick'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.self;
      t.flags.jzHuozhongTurn = g.turnCount;
      const pool = t.hand.filter((c) => (c.suit === 'spade' || c.suit === 'club') && c.type !== 'trick');
      const c = (await g.chooseSomeCards(t, pool, 1, { prompt: '【惑众】：将一张黑色非锦囊牌当【兵粮寸断】置入判定区' }))[0];
      if (!c) return;
      await ctx.discard(t, [c], { reason: 'huozhong' });
      t.judgeZone = t.judgeZone || [];
      t.judgeZone.push({ card: vcard('bingliang', c.suit, c.num), name: 'bingliang' });
      await ctx.draw(p, 2, { reason: 'huozhong' });
      await ctx.log(`【惑众】：${t.name} 置入【兵粮寸断】，${p.name} 摸两张牌`);
    },
  }],
});

// 日彗：当你使用【杀】对目标角色造成伤害后，你可以令所有判定区里有牌的其他角色各摸一张牌；
//       每回合你对每名判定区里没有牌的角色使用的首张【杀】无次数限制。
defineSkill({
  id: 'jz_rihui', name: '日彗',
  desc: '当你使用【杀】对目标角色造成伤害后，你可以令所有判定区里有牌的其他角色各摸一张牌；每回合你对每名判定区里没有牌的角色使用的首张【杀】无次数限制。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => d.from === d.player && d.card && d.card.name === 'sha',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = others(g, p).filter((x) => (x.judgeZone || []).length > 0);
        for (const t of cands) await ctx.draw(t, 1, { reason: 'rihui' });
        if (cands.length) await ctx.log(`【日彗】：${cands.map((t) => t.name).join('、')} 各摸一张牌`);
      },
    },
    {
      // 后半段：每回合对每名「判定区无牌」的角色使用的首张【杀】不占用出【杀】次数。
      // 用【杀】的计数已在 useCard 内 +1，故在 target.after 里按「角色 / 牌」各退还一次，
      // 净效果 = 对这些角色的【杀】不消耗次数（引擎无「按目标豁免次数」的钩子，此为等价做法）。
      on: 'target.after', who: 'self',
      filter: (d) => {
        const t = d.target, p = d.player;
        if (!t || !d.card || d.card.name !== 'sha') return false;
        if ((t.judgeZone || []).length > 0) return false;
        if ((p.flags.jzRihuiSeats || {})[t.seat] === d.game.turnCount) return false;
        const rec = p.flags.jzRihuiCards;
        if (rec && rec.turn === d.game.turnCount && rec.ids[d.card.id]) return false;
        return true;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.target;
        p.flags.jzRihuiSeats = Object.assign(p.flags.jzRihuiSeats || {}, { [t.seat]: g.turnCount });
        if (!p.flags.jzRihuiCards || p.flags.jzRihuiCards.turn !== g.turnCount) {
          p.flags.jzRihuiCards = { turn: g.turnCount, ids: {} };
        }
        p.flags.jzRihuiCards.ids[ctx.data.card.id] = true;
        if ((p.flags.shaUsed || 0) > 0) p.flags.shaUsed -= 1;
        await ctx.log(`【日彗】：对判定区无牌的 ${t.name} 使用首张【杀】，不占用出【杀】次数`);
      },
    },
  ],
});

// ============================================================
// 转·范疆&张达（吴 5）【负山】
// ============================================================
// 负山：出牌阶段开始时，所有其他角色依次可以交给你一张牌并令你本阶段使用【杀】的次数上限 +1。
//       本阶段结束时，若你使用【杀】的次数未达上限且本阶段以此法交给你牌的角色均存活，
//       则你失去 2 点体力，否则你将手牌摸至体力上限。
defineSkill({
  id: 'jz_fushan', name: '负山',
  desc: '出牌阶段开始时，所有其他角色依次可以交给你一张牌并令你本阶段使用【杀】的次数上限 +1。本阶段结束时，若你使用【杀】的次数未达上限且本阶段以此法交给你牌的角色均存活，则你失去 2 点体力，否则你将手牌摸至体力上限。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const donors = [];
        for (const t of others(g, p)) {
          if (!t.hand.length) continue;
          const yes = await ctx.ask.confirm(t, `【负山】：是否交给 ${p.name} 一张牌（可令其多使用一张【杀】）？`);
          if (!yes) continue;
          const c = (await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【负山】：交给其一张牌' }))[0];
          if (!c) continue;
          await ctx.gain(p, [c], { from: t, reason: 'fushan' });
          donors.push(t.id);
        }
        p.flags.jzFushan = { donors, limit: 1 + donors.length, startSha: (p.flags.shaUsed || 0) };
        p.flags.shaUsed = Math.max(0, (p.flags.shaUsed || 0) - donors.length);
        await ctx.log(`【负山】：${donors.length} 名角色交牌，本阶段【杀】次数上限 +${donors.length}`);
      },
    },
    {
      on: 'phase.end', who: 'self',
      filter: (d) => d.phase === 'play' && d.player.flags.jzFushan,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const info = p.flags.jzFushan;
        p.flags.jzFushan = null;
        const used = Math.max(0, (p.flags.shaUsed || 0) - (info.startSha || 0));
        const allAlive = (info.donors || []).every((id) => { const q = g.byId(id); return q && q.alive; });
        if (used < info.limit && allAlive) {
          await ctx.loseHp(p, 2, { reason: 'fushan' });
          await ctx.log('【负山】：未达上限且交牌者均存活，失去 2 点体力');
        } else {
          const n = Math.max(0, p.maxHp - p.hand.length);
          if (n > 0) await ctx.draw(p, n, { reason: 'fushan' });
          await ctx.log(`【负山】：将手牌摸至 ${p.maxHp} 张`);
        }
      },
    },
  ],
});

// ============================================================
// 转·夏侯恩（魏 4）【护剑】【恃力】
// ============================================================
// 护剑：游戏开始时，你从游戏外获得一张【赤血青锋】。每回合结束时，此回合最后一名使用或打出过牌的角色
//       可以获得弃牌堆中的【赤血青锋】。实现：以【青釭剑】等价替代。
defineSkill({
  id: 'jz_hujian', name: '护剑',
  desc: '游戏开始时，你从游戏外获得一张【赤血青锋】。每回合结束时，此回合最后一名使用或打出过牌的角色可以获得弃牌堆中的【赤血青锋】。（实现：以【青釭剑】等价替代）',
  triggers: [
    {
      on: 'game.start', who: 'self',
      async effect(ctx) {
        const p = ctx.self;
        const w = vcard('qinggang', 'spade', 6);
        p.flags.jzChixue = w;
        p.equips.weapon = w;
        // ★SG036-r2 P2：置入装备区必须派 equip.change
        await ctx.game.trigger('equip.change', { self: p, slot: 'weapon', card: w, old: null });
        await ctx.log('【护剑】：获得【赤血青锋】（以【青釭剑】替代）并装备');
      },
    },
    {
      on: 'card.use.after', who: 'any', priority: 1,
      async effect(ctx) { if (ctx.data.self) ctx.game.flags = Object.assign(ctx.game.flags || {}, { jzLastActor: ctx.data.self.id }); },
    },
    {
      on: 'turn.end', who: 'any',
      filter: (d) => {
        const g = d.game;
        const id = g.flags?.jzLastActor;
        if (!id) return false;
        const c = (g.discardPile || []).find((x) => x === g.players.map((p) => p.flags.jzChixue).find(Boolean));
        return !!c;
      },
      async effect(ctx) {
        const g = ctx.game, p = ctx.self;
        const id = g.flags?.jzLastActor;
        const q = g.byId(id);
        const card = (g.discardPile || []).find((x) => x === p.flags.jzChixue);
        if (!q || !card) return;
        const yes = await ctx.ask.confirm(q, '【护剑】：是否获得弃牌堆中的【赤血青锋】？');
        if (!yes) return;
        await gainFromOutside(g, q, [card], 'hujian');
        await ctx.log(`【护剑】：${q.name} 获得【赤血青锋】`);
      },
    },
  ],
});

// 恃力：出牌阶段限一次，你可以将一张手牌中的装备牌当【决斗】使用。
defineSkill({
  id: 'jz_shili', name: '恃力',
  desc: '出牌阶段限一次，你可以将一张手牌中的装备牌当【决斗】使用。',
  active: {
    perPhase: true,
    prompt: '恃力：将一张装备手牌当【决斗】使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const equips = p.hand.filter((c) => c.type === 'equip');
      if (!equips.length) { await ctx.log('【恃力】：没有装备手牌'); return; }
      const c = (await g.chooseSomeCards(p, equips, 1, { prompt: '【恃力】：选择一张装备牌' }))[0];
      if (!c) return;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【恃力】：选择【决斗】目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.discard(p, [c], { reason: 'shili' });
      await ctx.useCard({ from: p, card: vcard('juedou'), targets: [t], reason: 'shili', virtual: true });
      await ctx.log(`【恃力】：将【${cardLabel(c)}】当【决斗】对 ${t.name} 使用`);
    },
  },
});
