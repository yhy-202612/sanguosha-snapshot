// 神话再临·雷（第一批）：陈到 / 郝昭 / 周妃 / 诸葛瞻 / 毌丘俭
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

// ==================== 陈到 · 往烈 ====================
// 出牌阶段使用的第一张牌无距离限制；当你于出牌阶段使用一张牌时，可令此牌不能被响应，
// 若如此做，此阶段你不能再使用牌。
defineSkill({
  id: 'wanglie', name: '往烈',
  desc: '锁定技，你于出牌阶段使用的第一张牌无距离限制。当你于出牌阶段使用一张牌时，你可以令此牌不能被响应，若如此做，此阶段你不能再使用牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self',
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self;
        p.flags.wanglieFreeRange = ctx.game.turnCount;
        p.flags.wanglieUsed = 0;
      },
    },
    {
      on: 'card.use.after', who: 'any',
      filter: (d) => d.self === d.player && d.game.turnPlayer === d.player && d.game.phase === 'play',
      async effect(ctx) {
        const p = ctx.self;
        p.flags.wanglieUsed = (p.flags.wanglieUsed || 0) + 1;
        if (p.flags.wanglieFreeRange === ctx.game.turnCount && p.flags.wanglieUsed >= 1) {
          p.flags.wanglieFreeRange = 0;
        }
      },
    },
    {
      on: 'card.use.before', who: 'any', optional: true,
      filter: (d) => d.self === d.player && d.game.turnPlayer === d.player && d.game.phase === 'play'
        && d.player.flags.wanglieNoRespTurn !== d.game.turnCount
        && d.card && d.card.name === 'sha',
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        d.unavoidable = true;
        p.flags.wanglieNoRespTurn = ctx.game.turnCount;
        p.flags.banCardTurn = ctx.game.turnCount;
        await ctx.log('【往烈】：此【杀】不能被响应，本阶段不能再使用牌');
      },
    },
  ],
});

// ==================== 郝昭 · 镇骨 ====================
// 结束阶段选择一名其他角色；你的回合结束时与该角色下个回合结束时，
// 其将手牌摸至或弃至与你手牌数相同（最多摸至五张）。
async function zhenguSettle(ctx, p, t) {
  const target = Math.min(5, p.hand.length);
  if (t.hand.length < target) {
    const n = target - t.hand.length;
    await ctx.draw(t, n, { reason: 'zhengu' });
    await ctx.log(`【镇骨】：${t.name} 摸 ${n} 张，手牌补至 ${target} 张`);
  } else if (t.hand.length > target) {
    const over = t.hand.length - target;
    const res = await ctx.game.ask(t, 'cards', {
      prompt: `【镇骨】：手牌弃至 ${target} 张`, cards: t.hand.map(c => c.id),
      min: over, max: over, optional: false,
    });
    const picks = (res?.cardIds || []).map(id => t.hand.find(c => c.id === id)).filter(Boolean);
    if (picks.length) await ctx.discard(t, picks, { reason: 'zhengu' });
    await ctx.log(`【镇骨】：${t.name} 弃 ${picks.length} 张，手牌调整至 ${target} 张`);
  } else {
    await ctx.log(`【镇骨】：${t.name} 手牌数已与你相同（${target}）`);
  }
}

defineSkill({
  id: 'zhengu', name: '镇骨',
  desc: '结束阶段，你可以选择一名其他角色；你的回合结束时和该角色的下个回合结束时，其将手牌摸至或弃至与你手牌数相同（最多摸至五张）。',
  triggers: [
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.phase === 'end' && d.game.alive().some(x => x !== d.self),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const t = (await ctx.ask.targets(p, {
          min: 1, max: 1, candidates: g.alive().filter(x => x !== p), prompt: '【镇骨】：选择一名其他角色',
        }))[0];
        if (!t) return;
        p.flags.zhengu = { seat: t.seat, mine: true };
        await ctx.log(`【镇骨】：选择 ${t.name}，双方回合结束时其手牌将与你对齐`);
      },
    },
    {
      on: 'turn.end', who: 'any',
      filter: (d) => !!d.player.flags.zhengu && d.self && (d.self.seat === d.player.seat || d.self.seat === d.player.flags.zhengu.seat),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const z = p.flags.zhengu;
        const ending = ctx.data.self;
        const t = g.players.find(x => x.seat === z.seat);
        if (!t || !t.alive) { p.flags.zhengu = null; return; }
        if (ending.seat === p.seat && !z.mine) return;      // 自己那次已结算
        await zhenguSettle(ctx, p, t);
        if (ending.seat === p.seat) z.mine = false;
        if (ending.seat === z.seat) p.flags.zhengu = null;   // 目标回合结束，镇骨结束
      },
    },
  ],
});

export const LEI1_SKILL_IDS = ['wanglie', 'zhengu'];
