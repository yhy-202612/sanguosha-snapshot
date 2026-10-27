// 手杀「谋攻篇」第一批：谋黄盖 / 谋曹仁 / 谋甄姬
// 依赖机制：护甲（player.armor，受伤先扣）、翻面（player.flipped）、不可响应（data.unavoidable）
import { defineSkill } from '../engine/skill.js';
import { cardLabel } from '../engine/cards.js';

const allCardsOf = (p) => [
  ...p.hand.map(c => ({ c, slot: null })),
  ...Object.entries(p.equips).filter(([, v]) => v).map(([k, v]) => ({ c: v, slot: k })),
];

// ==================== 谋黄盖 · 苦肉 ====================
// 出牌阶段开始时，你可以交给其他角色一张牌，然后失去 1 点体力（若交出的牌为【桃】或【酒】则改为失去 2 点）。
// 当你失去 1 点体力后，你获得 2 点护甲。
defineSkill({
  id: 'kurou2', name: '苦肉',
  desc: '出牌阶段开始时，你可以交给其他角色一张牌，然后失去 1 点体力（若你交出的牌是【桃】或【酒】，则改为失去 2 点体力）。当你失去 1 点体力后，你获得 2 点护甲。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.self.hand.length > 0 && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      const t = (await ctx.ask.targets(p, { prompt: '【苦肉】：选择交给其一张牌的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【苦肉】：选择交出的牌', optional: false });
      const c = picks[0];
      if (!c) return;
      const isTaoJiu = c.name === 'tao' || c.name === 'jiu';
      await ctx.gain(t, [c], { from: p, reason: 'kurou2' });
      const n = isTaoJiu ? 2 : 1;
      const armorBefore = p.armor || 0;
      await ctx.loseHp(p, n);
      await ctx.game.addArmor(p, 2 * n);
      await ctx.log(`【苦肉】：交给 ${t.name} ${cardLabel(c)}，失去 ${n} 点体力，获得 ${2 * n} 点护甲（护甲 ${armorBefore} → ${p.armor}）`);
    },
  }],
});

// ==================== 谋黄盖 · 诈降（锁定技）====================
// 你于每个回合使用的前 X 张牌无距离和次数限制且不可被响应；摸牌阶段，你多摸 X 张牌。（X 为你已损失的体力值）
defineSkill({
  id: 'zhaixiang', name: '诈降',
  desc: '锁定技，你于每个回合使用的前 X 张牌无距离和次数限制且不可被响应；摸牌阶段，你多摸 X 张牌（X 为你已损失的体力值）。',
  triggers: [
    {
      // 摸牌阶段多摸 X 张
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'draw',
      async effect(ctx) {
        const p = ctx.self;
        const x = Math.max(0, p.maxHp - p.hp);
        if (x > 0) { await ctx.draw(p, x, { reason: 'zhaixiang' }); await ctx.log(`【诈降】：多摸 ${x} 张牌`); }
      },
    },
    {
      // 每回合刷新：前 X 张无距离与次数限制
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.zhaixiangTurn = ctx.game.turnCount;
        p.flags.zhaixiangUsed = 0;
        p.flags.freeRangeTurn = ctx.game.turnCount;
        p.flags.shaUnlimited = ctx.game.turnCount;
      },
    },
    {
      // 前 X 张牌不可被响应
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => {
        if (d.self !== d.player) return false;
        const p = d.player;
        const x = Math.max(0, p.maxHp - p.hp);
        return p.flags.zhaixiangTurn === d.game.turnCount && (p.flags.zhaixiangUsed || 0) < x;
      },
      async effect(ctx) {
        ctx.data.unavoidable = true;
        ctx.self.flags.zhaixiangUsed = (ctx.self.flags.zhaixiangUsed || 0) + 1;
      },
    },
  ],
});

// ==================== 谋曹仁 · 据守 ====================
// 出牌阶段限一次，若你正面向上，你可以翻面、弃置至多两张牌并获得等量的护甲。
// 当你受到伤害后，若你背面向上，你可以选择一项：1. 翻回；2. 获得 1 点护甲。当你翻回时，你摸等同于你护甲值的牌。
defineSkill({
  id: 'jushou2', name: '据守',
  desc: '出牌阶段限一次，若你正面向上，你可以翻面、弃置至多两张牌并获得等量的护甲。当你受到伤害后，若你背面向上，你可以选择一项：1. 翻回；2. 获得 1 点护甲。当你翻回时，你摸等同于你护甲值的牌。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => d.player.flipped,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const idx = await ctx.ask.choose(p, ['翻回正面', '获得 1 点护甲'], { prompt: '【据守】：选择一项', reason: 'jushou2' });
        if (idx === 1) { await g.addArmor(p, 1); await ctx.log('【据守】：获得 1 点护甲'); return; }
        await g.flip(p);
      },
    },
    {
      // 翻回正面时摸等同于护甲值的牌
      on: 'flip.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !d.player.flipped && (d.player.armor || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        const n = Math.min(5, p.armor || 0);
        await ctx.draw(p, n, { reason: 'jushou2' });
        await ctx.log(`【据守】：翻回正面，摸 ${n} 张牌（护甲值 ${p.armor}）`);
      },
    },
  ],
  active: {
    perPhase: true,
    prompt: '翻面、弃至多两张牌并获得等量护甲',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flipped) { await ctx.log('【据守】：背面朝上时不能发动'); return; }
      const pool = allCardsOf(p);
      let picks = [];
      if (pool.length) {
        const k = Math.min(2, pool.length);
        const idx = await ctx.ask.choose(p, [`弃置 ${k} 张牌并获得 ${k} 点护甲`, '不弃牌直接翻面'], { prompt: '【据守】：选择', reason: 'jushou2' });
        if (idx === 0) picks = await g.chooseSomeCards(p, pool.map(x => x.c), k, { prompt: '【据守】：弃置牌' });
      }
      for (const c of picks) {
        const slot = Object.keys(p.equips).find(k => p.equips[k] === c);
        if (slot) { p.equips[slot] = null; await g.trigger('equip.lose', { self: p, card: c, slot }); }
      }
      if (picks.length) await ctx.discard(p, picks, { reason: 'jushou2' });
      await ctx.game.addArmor(p, picks.length);
      await g.flip(p);
      await ctx.log(`【据守】：弃 ${picks.length} 张牌，获得 ${picks.length} 点护甲并翻面`);
    },
  },
});

// ==================== 谋曹仁 · 解围 ====================
// 出牌阶段限一次，你可以失去 1 点护甲并选择一名其他角色，你查看其手牌并获得其中一张。
defineSkill({
  id: 'jiewei2', name: '解围',
  desc: '出牌阶段限一次，你可以失去 1 点护甲并选择一名其他角色，你查看其手牌并获得其中一张。',
  active: {
    perPhase: true,
    prompt: '失去 1 点护甲，查看并获取一名其他角色一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if ((p.armor || 0) < 1) { await ctx.log('【解围】：没有护甲可以失去'); return; }
      const cands = g.alive().filter(x => x !== p && x.hand.length);
      if (!cands.length) { await ctx.log('【解围】：没有可查看的角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【解围】：选择一名有其他角色的手牌', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.game.setArmor(p, (p.armor || 0) - 1);
      const c = g.rng.pick(t.hand);
      await ctx.gain(p, [c], { from: t, reason: 'jiewei2' });
      await ctx.log(`【解围】：失去 1 点护甲，获得 ${t.name} 的 ${cardLabel(c)}`);
    },
  },
});

// ==================== 谋甄姬 · 洛神 ====================
// 准备阶段，你可以选择一名角色，自其开始的 X 名其他角色依次展示一张手牌（X 为场上存活角色数的一半，向上取整）：
// 若为黑色，你获得之（这些牌不计入你本回合的手牌上限）；若为红色，其弃置之。
defineSkill({
  id: 'luoshen2', name: '洛神',
  desc: '准备阶段，你可以选择一名角色，自其开始的 X 名其他角色依次展示一张手牌（X 为场上存活角色数的一半，向上取整）：若为黑色，你获得之（这些牌不计入你本回合的手牌上限）；若为红色，其弃置之。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.game.alive().some(x => x.hand.length),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x.hand.length);
      const start = (await ctx.ask.targets(p, { prompt: '【洛神】：选择起始角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!start) return;
      const x = Math.ceil(g.alive().length / 2);
      const seq = [];
      let cur = start;
      for (let i = 0; i < x; i++) {
        if (!cur) break;
        if (cur !== p) seq.push(cur);
        const alive = g.alive();
        cur = alive[(alive.indexOf(cur) + 1) % alive.length];
        if (cur === start) break;
      }
      let gained = 0;
      for (const q of seq) {
        if (!q.hand.length) continue;
        const c = g.rng.pick(q.hand);
        const red = c.suit === 'heart' || c.suit === 'diamond';
        if (red) {
          await ctx.discard(q, [c], { reason: 'luoshen2' });
          await ctx.log(`【洛神】：${q.name} 展示 ${cardLabel(c)}（红色），弃置之`);
        } else {
          await ctx.gain(p, [c], { from: q, reason: 'luoshen2' });
          gained++;
          await ctx.log(`【洛神】：${q.name} 展示 ${cardLabel(c)}（黑色），你获得之`);
        }
      }
      if (gained) p.flags.handLimit = (p.flags.handLimit || 0) + gained;
    },
  }],
});

export const MOU2_SKILL_IDS = ['kurou2', 'zhaixiang', 'jushou2', 'jiewei2', 'luoshen2'];
