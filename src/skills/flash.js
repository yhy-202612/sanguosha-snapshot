// OL「闪」系列（第一批）：闪赵云 / 闪孙坚
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const vcard = (name, type = 'basic') => ({ id: `vf${++vseq}`, name, suit: 'none', num: 0, type, virtual: true });

// 「轮」近似：本轮已执行回合数（1..players），轮次编号用 turnCount/人数 取整
const roundIdx = (g) => Math.floor((g.turnCount - 1) / Math.max(1, g.players.length));
const roundTurns = (g) => {
  const n = Math.max(1, g.players.length);
  const k = g.turnCount % n;
  return k === 0 ? n : k;
};

// ==================== 闪赵云 · 镇胆 ====================
// 可将一张非基本手牌当本轮你未使用过的基本牌使用或打出；
// 受到伤害后或每轮结束时，摸 X 张牌（X=本轮已执行回合数，至多 5），此技能本轮失效。
defineSkill({
  id: 'zhendan', name: '镇胆',
  desc: '你可以将一张非基本手牌当本轮你未使用过的基本牌使用或打出。当你受到伤害后或每轮结束时，你摸 X 张牌（X 为本轮所有角色执行过的回合数，至多 5），此技能本轮失效。',
  triggers: [
    {
      // 记录本轮已使用过的基本牌（真实使用或转化使用都算）
      on: 'card.use.after', who: 'any',
      filter: (d) => d.self === d.player && CARD_META[d.effName || d.card?.name]?.type === 'basic',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const name = ctx.data.effName || ctx.data.card?.name;
        p.flags.zhendanUsed = p.flags.zhendanUsed || {};
        p.flags.zhendanUsed[`${roundIdx(g)}:${name}`] = true;
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => d.player.flags.zhendanDisabledRound !== roundIdx(d.game),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = Math.min(5, roundTurns(g));
        p.flags.zhendanDisabledRound = roundIdx(g);
        await ctx.draw(p, x, { reason: 'zhendan' });
        await ctx.log(`【镇胆】：受伤后摸 ${x} 张牌，本轮此技能失效`);
      },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => {
        const g = d.game;
        const n = Math.max(1, g.players.length);
        return g.turnCount % n === 0;   // 本轮最后一人的回合结束
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const r = roundIdx(g);
        if (p.flags.zhendanRoundDone === r) return;
        p.flags.zhendanRoundDone = r;
        const x = Math.min(5, roundTurns(g));
        await ctx.draw(p, x, { reason: 'zhendan' });
        await ctx.log(`【镇胆】：本轮结束摸 ${x} 张牌，本轮此技能失效`);
      },
    },
  ],
});

// ==================== 闪赵云 · 龙临 ====================
defineSkill({
  id: 'longlin', name: '龙临',
  desc: '当其他角色于其出牌阶段首次使用【杀】指定目标后，你可以弃置一张牌令此【杀】无效，然后其可以视为对你使用一张【决斗】；你以此法造成伤害后，其本阶段使用的下一张牌不能指定其他角色为目标。',
  triggers: [{
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => {
      if (d.card?.name !== 'sha') return false;
      const g = d.game;
      if (g.turnPlayer !== d.self || g.phase !== 'play') return false;  // 必须是使用者自己的出牌阶段
      if ((d.self.flags.shaUsed || 0) !== 1) return false;              // 本回合第一张【杀】
      const p = d.player;
      return p.hand.length > 0 || Object.values(p.equips).some(Boolean);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const pool = [
        ...p.hand.map(c => ({ c, slot: null })),
        ...Object.entries(p.equips).filter(([, v]) => v).map(([k, v]) => ({ c: v, slot: k })),
      ];
      const res = await g.ask(p, 'card', {
        prompt: '【龙临】：弃置一张牌，令此【杀】无效', cards: pool.map(x => x.c.id), optional: true, reason: 'longlin',
      });
      const pick = pool.find(x => x.c.id === (res?.cardId || res?.id));
      if (!pick) return;
      if (pick.slot) {
        p.equips[pick.slot] = null;
        await g.trigger('equip.lose', { self: p, card: pick.c, slot: pick.slot });
        await g.discardCards(p, [pick.c], { reason: 'longlin' });
      } else {
        await g.discardCards(p, [pick.c], { reason: 'longlin' });
      }
      d.canceled = true;
      await ctx.log(`【龙临】：弃置 ${cardLabel(pick.c)}，此【杀】无效`);
      // 使用者可以选择视为对闪赵云使用一张【决斗】
      const yes = await ctx.ask.confirm(d.self, '【龙临】：是否视为对闪赵云使用一张【决斗】？');
      if (!yes) return;
      const hpBefore = d.self.hp;
      await g.useCard({ from: d.self, card: vcard('juedou', 'trick'), targets: [p], reason: 'longlin' });
      if (d.self.hp < hpBefore) {
        d.self.flags.noOtherTargetTurn = g.turnCount;
        await ctx.log(`【龙临】：${d.self.name} 本阶段下一张牌不能指定其他角色为目标`);
      }
    },
  }, {
    // 「下一张牌」用掉后即失效
    on: 'card.use.after', who: 'any',
    filter: (d) => d.self === d.player && d.player.flags.noOtherTargetTurn === d.game.turnCount,
    async effect(ctx) {
      const d = ctx.data;
      const targets = d.targets || [];
      if (targets.length && targets.every(t => t === ctx.self)) ctx.self.flags.noOtherTargetTurn = 0;
    },
  }],
});

// ==================== 闪孙坚 · 平讨 ====================
// 出牌阶段限一次，令一名其他角色选择：1. 交给你一张牌，然后你本回合下一张【杀】可多指定一个目标；2. 你视为对其使用一张【杀】。
defineSkill({
  id: 'pingtao', name: '平讨',
  desc: '出牌阶段限一次，你可以令一名其他角色选择一项：1. 其交给你一张牌，然后你本回合使用的下一张【杀】可以多指定一个目标；2. 你视为对其使用一张【杀】（计入次数限制）。',
  active: {
    perPhase: true,
    prompt: '令一名其他角色交牌或被【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【平讨】：选择一名其他角色' }))[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, ['交给对方一张牌', '视为被对方使用一张【杀】'], {
        prompt: '【平讨】：请选择一项', reason: 'pingtao',
      });
      if (idx === 0 && (t.hand.length || Object.values(t.equips).some(Boolean))) {
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        const res = await g.ask(t, 'card', { prompt: '【平讨】：交给对方一张牌', cards: pool.map(c => c.id), optional: false, reason: 'pingtao' });
        const c = pool.find(x => x.id === (res?.cardId || res?.id));
        if (c) {
          await ctx.gain(p, [c], { from: t, reason: 'pingtao' });
          p.flags.extraShaTarget = g.turnCount;
          await ctx.log(`【平讨】：${t.name} 交给 ${p.name} ${cardLabel(c)}，${p.name} 本回合下一张【杀】可多指定一个目标`);
          return;
        }
      }
      await g.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'pingtao' });
      await ctx.log(`【平讨】：${t.name} 未交牌，视为被 ${p.name} 使用一张【杀】`);
    },
  },
});

// ==================== 闪孙坚 · 绝烈 ====================
// 当你使用【杀】指定目标后，弃至多 X 张牌（X=体力值），令目标角色共弃置等量牌；
// 若你体力值或手牌数最小，此【杀】伤害 +1；若因此【杀】杀死角色，手牌摸至体力上限。
defineSkill({
  id: 'juelie', name: '绝烈',
  desc: '当你使用【杀】指定目标后，你可以弃置至多 X 张牌（X 为你的体力值），令目标角色共弃置等量的牌；然后若你的体力值或手牌数为全场最少，此【杀】伤害 +1。若你因此【杀】杀死一名角色，你将手牌摸至体力上限。',
  triggers: [
    {
      on: 'target.after', who: 'any', optional: true,
      filter: (d) => d.self === d.player && d.card?.name === 'sha' && d.player.hand.length > 0 && d.target && d.target.alive,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.target, g = ctx.game;
        const max = Math.min(p.hp, p.hand.length);
        if (max <= 0) return;
        const res = await g.ask(p, 'cards', {
          prompt: `【绝烈】：弃置至多 ${max} 张牌，令 ${t.name} 共弃等量牌`,
          cards: p.hand.map(c => c.id), min: 0, max, optional: true, reason: 'juelie',
        });
        const picks = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
        if (!picks.length) return;
        await ctx.discard(p, picks, { reason: 'juelie' });
        const n = Math.min(picks.length, t.hand.length);
        if (n > 0) {
          const r2 = await g.ask(t, 'cards', {
            prompt: `【绝烈】：弃置 ${n} 张牌`, cards: t.hand.map(c => c.id), min: n, max: n, optional: false, reason: 'juelie',
          });
          const cs = (r2?.cardIds || []).map(id => t.hand.find(c => c.id === id)).filter(Boolean);
          if (cs.length) await ctx.discard(t, cs, { reason: 'juelie' });
        }
        p.flags.juelieTurn = g.turnCount;
        await ctx.log(`【绝烈】：弃 ${picks.length} 张，${t.name} 弃 ${n} 张`);
      },
    },
    {
      // 加伤：体力值或手牌数为全场最少
      on: 'sha.hit', who: 'any', optional: false,
      filter: (d) => {
        if (d.self !== d.player) return false;
        const g = d.game;
        if (d.player.flags.juelieTurn !== g.turnCount) return false;
        const alive = g.alive();
        const minHp = Math.min(...alive.map(x => x.hp));
        const minHand = Math.min(...alive.map(x => x.hand.length));
        return d.player.hp === minHp || d.player.hand.length === minHand;
      },
      async effect(ctx) {
        const d = ctx.data;
        d.amount = (d.amount || 1) + 1;
        ctx.self.flags.juelieKillTurn = ctx.game.turnCount;
        await ctx.log('【绝烈】：体力或手牌最少，此【杀】伤害 +1');
      },
    },
    {
      // 击杀收益：手牌摸至体力上限
      on: 'death.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.player.flags.juelieKillTurn === d.game.turnCount
        && d.player.hand.length < d.player.maxHp,
      async effect(ctx) {
        const p = ctx.self;
        const n = p.maxHp - p.hand.length;
        await ctx.draw(p, n, { reason: 'juelie' });
        p.flags.juelieKillTurn = 0;
        await ctx.log(`【绝烈】：击杀角色，摸 ${n} 张牌至体力上限`);
      },
    },
  ],
});

export const FLASH_SKILL_IDS = ['zhendan', 'longlin', 'pingtao', 'juelie'];
