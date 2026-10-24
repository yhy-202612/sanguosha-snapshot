// 谋系列武将专属技能（其余 mou_ 技能走 getSkill 前缀降级复用标准包同名技能）
import { defineSkill } from '../engine/skill.js';
import { CARD_META } from '../engine/cards.js';

// 谋黄忠 · 烈弓（简化：令一名角色本回合不能使用【闪】）
defineSkill({
  id: 'mou_liegong', name: '烈弓', desc: '出牌阶段限一次，你可以令一名其他角色本回合不能使用【闪】（简化口径）。',
  active: {
    perTurn: true,
    prompt: '令一名角色本回合不能使用【闪】',
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【烈弓】：选择一名角色' });
      if (!ts.length) return;
      ts[0].flags.noShanTurn = ctx.game.turnCount;
      await ctx.log(`${p.name} 发动【烈弓】，${ts[0].name} 本回合不能使用【闪】`);
    },
  },
});

// 谋黄忠 · 酒诗（简化：视为使用一张【酒】，下一张【杀】伤害 +1）
defineSkill({
  id: 'mou_jiushi', name: '酒诗', desc: '出牌阶段限一次，你可以视为使用一张【酒】（本回合下一张【杀】伤害 +1）。',
  active: {
    perTurn: true,
    prompt: '视为使用一张【酒】',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.jiu) return ctx.log('【酒诗】：本回合已有【酒】效果');
      p.flags.jiu = 1;
      await ctx.log(`${p.name} 发动【酒诗】，视为使用【酒】`);
    },
  },
});

export {};
