// 极系列武将专属技能（其余 ji_ 技能走 getSkill 前缀降级复用标准包同名技能）
import { defineSkill } from '../engine/skill.js';
import { isRed, cardLabel } from '../engine/cards.js';

// 极关羽 · 威震（简化：出牌阶段限一次，弃一张牌对一名角色造成 1 点伤害）
defineSkill({
  id: 'ji_weizhen', name: '威震', desc: '出牌阶段限一次，你可以弃一张牌，对一名其他角色造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '弃一张牌，对一名角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self;
      if (!p.hand.length) return;
      const cands = ctx.game.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【威震】：选择一名角色' });
      if (!ts.length) return;
      // respondCard 已弃置该牌
      const c = await ctx.ask.card(p, { prompt: '【威震】：弃一张牌', optional: false });
      if (!c) return;
      await ctx.damage({ from: p, to: ts[0], amount: 1, reason: 'weizhen' });
    },
  },
});

// 极曹操 · 号令（简化：出牌阶段限一次，令一名其他角色交给你一张手牌，否则受到 1 点伤害）
defineSkill({
  id: 'ji_haoling', name: '号令', desc: '出牌阶段限一次，你可以令一名其他角色交给你一张手牌，否则其受到你造成的 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '令一名角色交给你一张手牌，否则受到 1 点伤害',
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【号令】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      if (!t.hand.length) {
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'haoling' });
        return;
      }
      const c = await ctx.ask.card(t, { prompt: '【号令】：交给对方一张手牌（可取消，改为受到伤害）', optional: true });
      if (c) {
        // respondCard 已把牌置入弃牌堆，转交时先从弃牌堆取出，避免「一牌两处」
        const di = ctx.game.discardPile.indexOf(c);
        if (di >= 0) ctx.game.discardPile.splice(di, 1);
        await ctx.gain(p, [c], { from: t, reason: 'haoling' });
      }
      else await ctx.damage({ from: p, to: t, amount: 1, reason: 'haoling' });
    },
  },
});

// ================= SG004 补全（极 3 条） =================

// 极吕布 · 无双：锁定技，【杀】需两张【闪】抵消；决斗中对方每次需打出两张【杀】。
defineSkill({
  id: 'ji_wushuang', name: '无双',
  desc: '锁定技，你的【杀】需两张【闪】抵消；与你【决斗】的角色每次需打出两张【杀】。',
  triggers: [
    {
      on: 'dodge.before', who: 'any', optional: false,
      filter: (d) => d.from && d.from === d.player && d.card,
      async effect(ctx) { ctx.data.extraDodge = Math.max(ctx.data.extraDodge || 0, 1); },
    },
    {
      on: 'juedou.need', who: 'any', optional: false,
      filter: (d) => d.from && d.from === d.player,
      async effect(ctx) { ctx.data.extraSha = Math.max(ctx.data.extraSha || 0, 1); },
    },
  ],
});

// 极司马懿 · 鬼才：判定牌生效前可打出一张手牌代替；若打出的牌为黑色，摸一张。
defineSkill({
  id: 'ji_guicai', name: '鬼才',
  desc: '在任意角色的判定牌生效前，你可以打出一张手牌代替之；若你打出的牌为黑色，你摸一张牌。',
  triggers: [{
    on: 'judge.before', who: 'any', optional: true,
    filter: (d) => !!d.self && d.self.alive !== false,
    async effect(ctx) {
      const p = ctx.self;
      if (!p.hand.length) return;
      const res = await ctx.game.ask(p, 'card', {
        prompt: '【鬼才】：打出一张手牌代替判定牌', cards: p.hand.map(c => c.id), optional: true, reason: 'ji_guicai',
      });
      const c = res && p.hand.find(x => x.id === res.cardId);
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'ji_guicai' });
      ctx.data.suit = c.suit;
      ctx.data.num = c.num;
      await ctx.game.log(`${p.name} 发动【鬼才】，判定改为 ${cardLabel(c)}`);
      if (!isRed(c)) await ctx.draw(p, 1, { reason: 'ji_guicai' });
    },
  }],
});

// 极周瑜 · 反间：同谋反间（出牌阶段限一次，选花色 → 展示你的一张手牌 → 花色不符则造成 1 点伤害）。
defineSkill({
  id: 'ji_fanjian', name: '反间',
  desc: '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后其获得你的一张手牌并展示之，若此牌与所选花色不同，你对其造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '令一名角色猜花色',
    async effect(ctx) {
      const p = ctx.self;
      const others = ctx.game.alive().filter(x => x !== p);
      if (!others.length || !p.hand.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: others, prompt: '【反间】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const suits = ['spade', 'heart', 'club', 'diamond'];
      const idx = await ctx.ask.choose(t, ['♠ 黑桃', '♥ 红桃', '♣ 梅花', '♦ 方块'], { prompt: '【反间】：选择一种花色' });
      const suit = suits[idx] || 'spade';
      const c = p.hand[ctx.game.rng.int(p.hand.length)];
      await ctx.gain(t, [c], { from: p, reason: 'ji_fanjian' });
      await ctx.game.revealCards([c], { to: ctx.game.alive(), reason: '反间' });
      await ctx.log(`【反间】：${t.name} 选择了 ${['黑桃', '红桃', '梅花', '方块'][suits.indexOf(suit)]}，实际为 ${cardLabel(c)}`);
      if (c.suit !== suit) await ctx.damage({ from: p, to: t, amount: 1, reason: 'ji_fanjian' });
    },
  },
});

export {};
