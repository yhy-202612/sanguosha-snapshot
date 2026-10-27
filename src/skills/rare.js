// 稀有·传说（pack = 'rare'）技能实现
// ------------------------------------------------------------------
// 7 名：神魏延【奇谋】、孙鲁育【止息】、骆统【勤政】、贺齐【奋威】、
//       全琮【邀名】、胡车儿【盗戟】、蹋顿【乱战】
// 技能 id 前缀 `ra_`。只用引擎既有 API。
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

const others = (g, p) => g.alive().filter((x) => x !== p);

// ===================== 神魏延 =====================
// 奇谋：出牌阶段限一次，你可以失去 1 点体力，然后本回合你使用【杀】无次数限制。
defineSkill({
  id: 'ra_qimou', name: '奇谋',
  desc: '出牌阶段限一次，你可以失去 1 点体力，然后本回合你使用【杀】无次数限制。',
  active: {
    perPhase: true,
    prompt: '奇谋：失去 1 点体力，本回合【杀】无次数限制',
    async effect(ctx) {
      const p = ctx.self;
      await ctx.loseHp(p, 1, { reason: 'qimou' });
      p.flags.shaUnlimited = true;
      await ctx.log('【奇谋】：失去 1 点体力，本回合使用【杀】无次数限制');
    },
  },
});

// ===================== 孙鲁育 =====================
// 止息：当你受到伤害时，你可以弃置一张手牌，令此伤害 -1。
defineSkill({
  id: 'ra_zhixi', name: '止息',
  desc: '当你受到伤害时，你可以弃置一张手牌，令此伤害 -1。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: true,
    filter: (d) => d.to === d.self && (d.amount || 1) >= 1 && (d.self.hand || []).length > 0,
    async effect(ctx) {
      const p = ctx.self;
      const [c] = await ctx.game.chooseSomeCards(p, p.hand, 1, { prompt: '【止息】：弃置一张手牌令此伤害 -1' });
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'zhixi' });
      ctx.data.amount = Math.max(0, (ctx.data.amount || 1) - 1);
      await ctx.log(`【止息】：弃 ${cardLabel(c)}，此伤害减至 ${ctx.data.amount}`);
    },
  }],
});

// ===================== 骆统 =====================
// 勤政：出牌阶段限一次，你可以摸一张牌，然后弃置一张手牌。
defineSkill({
  id: 'ra_qinzheng', name: '勤政',
  desc: '出牌阶段限一次，你可以摸一张牌，然后弃置一张手牌。',
  active: {
    perPhase: true,
    prompt: '勤政：摸一张牌，然后弃一张手牌',
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'qinzheng' });
      if (!p.hand.length) return;
      const [c] = await ctx.game.chooseSomeCards(p, p.hand, 1, { prompt: '【勤政】：弃置一张手牌' });
      if (c) await ctx.discard(p, [c], { reason: 'qinzheng' });
      await ctx.log('【勤政】：摸一张牌并弃置一张');
    },
  },
});

// ===================== 贺齐 =====================
// 奋威：当你使用【杀】造成伤害后，你可以弃置受伤角色的一张牌。
defineSkill({
  id: 'ra_fenwei', name: '奋威',
  desc: '当你使用【杀】造成伤害后，你可以弃置受伤角色的一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => !!d.player && d.from === d.player && d.card && d.card.name === 'sha'
      && d.to && d.to.alive && d.to !== d.player,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.to;
      const pool = [...(t.hand || []), ...Object.values(t.equips || {}).filter(Boolean)];
      if (!pool.length) return;
      const [c] = await ctx.game.chooseSomeCards(p, pool, 1, { prompt: '【奋威】：弃置其一张牌' });
      if (!c) return;
      await ctx.discard(t, [c], { reason: 'fenwei' });
      await ctx.log(`【奋威】：弃置 ${t.name} 的 ${cardLabel(c)}`);
    },
  }],
});

// ===================== 全琮 =====================
// 邀名：出牌阶段限一次，你可以令一名角色摸一张牌，然后你摸一张牌。
defineSkill({
  id: 'ra_yaoming', name: '邀名',
  desc: '出牌阶段限一次，你可以令一名角色摸一张牌，然后你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '邀名：令一名角色摸一张牌，然后你摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const tg = await ctx.ask.targets(p, { candidates: g.alive(), min: 1, max: 1, prompt: '【邀名】：选择一名角色' });
      const t = tg && tg[0];
      if (!t) return;
      await ctx.draw(t, 1, { reason: 'yaoming' });
      await ctx.draw(p, 1, { reason: 'yaoming' });
      await ctx.log(`【邀名】：${t.name} 摸一张牌，你摸一张牌`);
    },
  },
});

// ===================== 胡车儿 =====================
// 盗戟：出牌阶段限一次，你可以获得一名角色装备区里的一张牌。
defineSkill({
  id: 'ra_daoji', name: '盗戟',
  desc: '出牌阶段限一次，你可以获得一名角色装备区里的一张牌。',
  active: {
    perPhase: true,
    prompt: '盗戟：获得一名角色装备区里的一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((x) => Object.values(x.equips || {}).some(Boolean));
      if (!cands.length) { await ctx.log('【盗戟】：没有角色装备区有牌'); return; }
      const tg = await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【盗戟】：选择一名角色' });
      const t = tg && tg[0];
      if (!t) return;
      const pool = Object.values(t.equips || {}).filter(Boolean);
      if (!pool.length) return;
      const [c] = await g.chooseSomeCards(p, pool, 1, { prompt: `【盗戟】：获得 ${t.name} 装备区的牌` });
      if (!c) return;
      await ctx.gain(p, [c], { from: t, reason: 'daoji' });
      await ctx.log(`【盗戟】：获得 ${t.name} 装备区的 ${cardLabel(c)}`);
    },
  },
});

// ===================== 蹋顿 =====================
// 乱战：锁定技，当你使用【杀】对一名手牌数大于你的角色造成伤害时，此伤害 +1。
defineSkill({
  id: 'ra_luanzhan', name: '乱战',
  desc: '锁定技，当你使用【杀】对一名手牌数大于你的角色造成伤害时，此伤害 +1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => !!d.player && d.from === d.player && d.card && d.card.name === 'sha'
      && d.to && d.to !== d.player && ((d.to.hand || []).length > (d.player.hand || []).length),
    async effect(ctx) {
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      await ctx.log(`【乱战】：${ctx.data.to.name} 手牌多于你，此伤害 +1`);
    },
  }],
});
