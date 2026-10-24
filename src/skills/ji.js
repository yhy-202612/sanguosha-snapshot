// 极系列武将专属技能（其余 ji_ 技能走 getSkill 前缀降级复用标准包同名技能）
import { defineSkill } from '../engine/skill.js';

// 极关羽 · 威震（简化：出牌阶段限一次，弃一张牌对一名角色造成 1 点伤害）
defineSkill({
  id: 'ji_weizhen', name: '威震', desc: '出牌阶段限一次，你可以弃一张牌，对一名其他角色造成 1 点伤害。',
  active: {
    perTurn: true,
    prompt: '弃一张牌，对一名角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self;
      if (!p.hand.length) return;
      const cands = ctx.game.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【威震】：选择一名角色' });
      if (!ts.length) return;
      const c = await ctx.ask.card(p, { prompt: '【威震】：弃一张牌', optional: false });
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'weizhen' });
      await ctx.damage({ from: p, to: ts[0], amount: 1, reason: 'weizhen' });
    },
  },
});

// 极曹操 · 号令（简化：出牌阶段限一次，令一名其他角色交给你一张手牌，否则受到 1 点伤害）
defineSkill({
  id: 'ji_haoling', name: '号令', desc: '出牌阶段限一次，你可以令一名其他角色交给你一张手牌，否则其受到你造成的 1 点伤害。',
  active: {
    perTurn: true,
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
      if (c) await ctx.gain(p, [c], { from: t, reason: 'haoling' });
      else await ctx.damage({ from: p, to: t, amount: 1, reason: 'haoling' });
    },
  },
});

export {};
