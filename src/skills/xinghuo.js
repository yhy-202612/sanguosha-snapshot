// 星火燎原·精选（10 将 / 16 技能）
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, suitOf, isRedFor } from '../engine/cards.js';

async function pickHand(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  const res = await ctx.game.ask(player, 'card', { prompt, cards: cands.map(c => c.id), optional: true, reason: 'skill' });
  if (!res || !res.cardId) return null;
  return cands.find(c => c.id === res.cardId) || null;
}

// 曹昂 · 慷忾（锁定技）：成为【杀】的目标后，若使用者不在你的攻击范围内，你摸一张牌。
defineSkill({
  id: 'kangkai', name: '慷忾',
  desc: '锁定技，当你成为【杀】的目标后，若此【杀】的使用者不在你的攻击范围内，你摸一张牌。',
  triggers: [{
    on: 'target.after', who: 'any', optional: false,
    filter: (d) => d.target === d.player && d.card && d.card.name === 'sha'
      && d.player.alive && !d.game.inAttackRange(d.player, d.self),
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'kangkai' });
      await ctx.log(`${ctx.self.name} 发动【慷忾】：摸一张牌`);
    },
  }],
});

// 丁原 · 备诛：使用【杀】指定目标后，可令其选择：交给你一张牌，或令此【杀】伤害 +1。
defineSkill({
  id: 'beizhu', name: '备诛',
  desc: '当你使用【杀】指定目标后，你可以令其选择一项：交给你一张牌；或令此【杀】对其造成的伤害 +1。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => d.self === d.player && d.card && d.card.name === 'sha'
      && d.target !== d.player && d.target.alive !== false && d.target.hand.length > 0,
    async effect(ctx) {
      const t = ctx.data.target;
      const i = await ctx.ask.choose(t, ['交给他一张牌', '令此【杀】伤害 +1'], { prompt: `【备诛】：${ctx.self.name} 的【杀】`, reason: 'beizhu' });
      if (i === 0) {
        const c = t.hand[Math.floor(Math.random() * t.hand.length)];
        await ctx.gain(ctx.self, [c], { from: t, reason: 'beizhu' });
        await ctx.log(`【备诛】：${t.name} 交给 ${ctx.self.name} ${cardLabel(c)}`);
      } else {
        ctx.data.damageBonus = (ctx.data.damageBonus || 0) + 1;
        await ctx.log(`【备诛】：${t.name} 选择令此【杀】伤害 +1`);
      }
    },
  }],
});

// 公孙瓒 · 义从（锁定技）：你的攻击范围 +1；若你的体力值大于 2，你与其他角色的距离 -1。
defineSkill({
  id: 'yicong', name: '义从',
  desc: '锁定技，你的攻击范围 +1；若你的体力值大于 2，你与其他角色的距离 -1。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: () => true,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.rangeBonus = 1;
      p.flags.distanceMinus = p.hp > 2 ? 1 : 0;
    },
  }],
});

// 麴义 · 伏骑（锁定技）：使用【杀】指定距离为 1 的目标后，此【杀】不可被【闪】响应。
defineSkill({
  id: 'fuqi', name: '伏骑',
  desc: '锁定技，当你使用【杀】指定与你距离为 1 的角色为目标后，此【杀】不可被【闪】响应。',
  triggers: [{
    on: 'target.after', who: 'any', optional: false,
    filter: (d) => d.self === d.player && d.card && d.card.name === 'sha'
      && d.target !== d.player && d.game.distance(d.player, d.target) <= 1,
    async effect(ctx) {
      if (ctx.data.shaCtx) ctx.data.shaCtx.unavoidable = true;
      await ctx.log(`【伏骑】：${ctx.data.target.name} 不能使用【闪】响应此【杀】`);
    },
  }],
});

// 麴义 · 骄恣（锁定技）：造成或受到伤害时，若你的手牌数为全场唯一最多，此伤害 +1。
defineSkill({
  id: 'jiaozi', name: '骄恣',
  desc: '锁定技，当你造成或受到伤害时，若你的手牌数为全场唯一最多，此伤害 +1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => (d.amount || 0) > 0 && (d.from === d.player || d.self === d.player)
      && d.game.players.filter(x => x.alive && x.hand.length === d.player.hand.length).length === 1,
    async effect(ctx) {
      ctx.data.amount = (ctx.data.amount || 0) + 1;
      await ctx.log(`【骄恣】：${ctx.self.name} 手牌唯一最多，此伤害 +1`);
    },
  }],
});

// 何太后 · 鸩毒：其他角色的出牌阶段开始时，可弃一张手牌，视为该角色使用一张【酒】。
defineSkill({
  id: 'zhendu', name: '鸩毒',
  desc: '其他角色的出牌阶段开始时，你可以弃置一张手牌，视为该角色使用一张【酒】。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => d.phase === 'play' && d.self !== d.player && d.player.alive && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self;
      const c = await pickHand(ctx, p, () => true, '【鸩毒】：弃置一张手牌，令其视为使用【酒】');
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'zhendu' });
      t.flags.jiu = 1;
      t.flags.jiuUsed = true;
      await ctx.log(`${p.name} 发动【鸩毒】：${t.name} 视为使用一张【酒】`);
    },
  }],
});

// 何太后 · 戚乱：一名角色的回合结束时，若你于此回合内造成过伤害，你可以摸 X 张牌（X 为该角色体力值）。
defineSkill({
  id: 'qiluan', name: '戚乱',
  desc: '一名角色的回合结束时，若你于此回合内造成过伤害，你可以摸 X 张牌（X 为该角色的体力值）。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && (d.amount || 0) > 0,
      async effect(ctx) { ctx.self.flags.qiluanTurn = ctx.game.turnCount; },
    },
    {
      on: 'turn.end', who: 'any', optional: true,
      filter: (d) => d.player.flags.qiluanTurn === d.game.turnCount && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.self;
        const x = Math.max(1, Math.min(4, t.hp));
        await ctx.draw(p, x, { reason: 'qiluan' });
        await ctx.log(`${p.name} 发动【戚乱】：摸 ${x} 张牌`);
      },
    },
  ],
});

// 蔡夫人 · 窃听：其他角色的回合结束时，若其本回合未使用过牌，你可以选择：令其摸一张牌；或你摸一张牌。
defineSkill({
  id: 'qieting', name: '窃听',
  desc: '其他角色的回合结束时，若其于此回合内未使用过牌，你可以选择一项：令其摸一张牌；或你摸一张牌。',
  triggers: [
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!d.card && !!d.self,
      async effect(ctx) { ctx.data.self.flags.usedCardTurn = ctx.game.turnCount; },
    },
    {
      on: 'turn.end', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && d.self.alive && d.self.flags.usedCardTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.self;
        const i = await ctx.ask.choose(p, [`令 ${t.name} 摸一张牌`, '自己摸一张牌'], { prompt: '【窃听】：选择一项', reason: 'qieting' });
        if (i === 0) await ctx.draw(t, 1, { reason: 'qieting' });
        else await ctx.draw(p, 1, { reason: 'qieting' });
        await ctx.log(`${p.name} 发动【窃听】（${i === 0 ? t.name + ' 摸牌' : '自己摸牌'}）`);
      },
    },
  ],
});

// 马云騄 · 凤魄：使用【杀】或【决斗】指定目标后，可令其选择：弃一张牌，或令此牌伤害 +1。
defineSkill({
  id: 'fengpo', name: '凤魄',
  desc: '当你使用【杀】或【决斗】指定目标后，你可以令其选择一项：弃置一张牌；或令此牌对其造成的伤害 +1。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => d.self === d.player && d.card && (d.card.name === 'sha' || d.card.name === 'juedou')
      && d.target !== d.player && d.target.alive !== false,
    async effect(ctx) {
      const t = ctx.data.target;
      const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
      const opts = pool.length ? ['弃置一张牌', '令此牌伤害 +1'] : ['令此牌伤害 +1'];
      const i = await ctx.ask.choose(t, opts, { prompt: `【凤魄】：${ctx.self.name} 的${dCardName(ctx)}`, reason: 'fengpo' });
      if (i === 0 && pool.length) {
        const c = pool[Math.floor(Math.random() * pool.length)];
        await ctx.discard(t, [c], { reason: 'fengpo' });
        await ctx.log(`【凤魄】：${t.name} 弃置 ${cardLabel(c)}`);
      } else {
        ctx.data.damageBonus = (ctx.data.damageBonus || 0) + 1;
        await ctx.log(`【凤魄】：${t.name} 选择令此牌伤害 +1`);
      }
    },
  }],
});
function dCardName(ctx) { return CARD_META[ctx.data.card?.name]?.cn || '牌'; }

// 关索 · 征南：杀死一名角色后，可摸三张牌并回复 1 点体力。
defineSkill({
  id: 'zhengnan', name: '征南',
  desc: '当你杀死一名角色后，你可以摸三张牌，然后回复 1 点体力。',
  triggers: [{
    on: 'death.after', who: 'any', optional: true,
    filter: (d) => d.killer === d.player && d.player.alive,
    async effect(ctx) {
      await ctx.draw(ctx.self, 3, { reason: 'zhengnan' });
      await ctx.recover(ctx.self, 1, { reason: 'zhengnan' });
      await ctx.log(`${ctx.self.name} 发动【征南】：摸三张牌并回复 1 点体力`);
    },
  }],
});

// 关索 · 撷芳（锁定技）：你计算与其他角色的距离 -1。
defineSkill({
  id: 'xiefang', name: '撷芳',
  desc: '锁定技，你计算与其他角色的距离 -1。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: () => true,
    async effect(ctx) { ctx.self.flags.distanceMinus = Math.max(1, ctx.self.flags.distanceMinus || 0); },
  }],
});

// 张星彩 · 甚贤：其他角色于其回合内使用牌时，若你的手牌数为全场最少（或之一），你可以摸一张牌。
defineSkill({
  id: 'shenxian_c', name: '甚贤',
  desc: '每当一名其他角色于其回合内使用牌时，若你的手牌数为全场最少（或之一），你可以摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'any', optional: true,
    filter: (d) => {
      const me = d.player;
      if (!me || !me.alive || !me.hand || d.self === me) return false;
      const min = Math.min(...d.game.alive().map(x => x.hand.length));
      return me.hand.length === min;
    },
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'shenxian_c' });
      await ctx.log(`${ctx.self.name} 发动【甚贤】：摸一张牌`);
    },
  }],
});

// 张星彩 · 枪舞：出牌阶段限一次，你可以进行判定，本回合你使用点数小于判定结果的【杀】无距离限制且不计次数。
defineSkill({
  id: 'qiangwu', name: '枪舞',
  desc: '出牌阶段限一次，你可以进行判定，本回合你使用点数小于判定结果的【杀】无距离限制且不计次数。',
  active: {
    perPhase: true,
    prompt: '判定，本回合点数小于判定结果的【杀】无距离限制且不计次数',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const j = await ctx.judge(p, { reason: '枪舞' });
      const num = j.num || 0;
      p.flags.qiangwuNum = num;
      p.flags.qiangwuTurn = g.turnCount;
      await ctx.log(`${p.name} 发动【枪舞】：判定点数 ${num}，本回合使用点数小于 ${num} 的【杀】无距离限制且不计次数`);
    },
  },
});

// 诸葛果 · 祈禳：使用装备牌时，可以摸一张牌。
defineSkill({
  id: 'qirang', name: '祈禳',
  desc: '当你使用装备牌时，你可以摸一张牌。',
  triggers: [{
    on: 'equip.change', who: 'self', optional: true,
    filter: (d) => !!d.card,
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'qirang' });
      await ctx.log(`${ctx.self.name} 发动【祈禳】：摸一张牌`);
    },
  }],
});

// 诸葛果 · 羽化（锁定技）：弃牌阶段，你的手牌上限 +X（X 为你装备区的牌数）。
defineSkill({
  id: 'yuhua', name: '羽化',
  desc: '锁定技，弃牌阶段，你的手牌上限 +X（X 为你装备区的牌数）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'discard',
    async effect(ctx) {
      const p = ctx.self;
      const x = Object.values(p.equips).filter(Boolean).length;
      p.flags.handLimit = x;
      if (x) await ctx.log(`【羽化】：手牌上限 +${x}`);
    },
  }],
});

export const XINGHUO_SKILL_IDS = ['kangkai', 'beizhu', 'yicong', 'fuqi', 'jiaozi', 'zhendu', 'qiluan',
  'qieting', 'fengpo', 'zhengnan', 'xiefang', 'shenxian_c', 'qiangwu', 'qirang', 'yuhua'];
