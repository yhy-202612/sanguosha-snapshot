// 神话再临·阴（第二批 3 将）：陆绩 / 孙亮 / 蒯良蒯越
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

// ==================== 陆绩 · 怀橘 / 遗礼 / 整论 ====================
defineSkill({
  id: 'huaiju', name: '怀橘',
  desc: '锁定技，游戏开始时你获得 3 个「橘」；有「橘」的角色受到伤害时，防止此伤害并移去一个「橘」；有「橘」的角色摸牌阶段多摸一张牌。',
  triggers: [
    {
      on: 'game.start', who: 'any',
      async effect(ctx) {
        const p = ctx.self;
        p.marks.ju = (p.marks.ju || 0) + 3;
        await ctx.log(`【怀橘】：${p.name} 获得 3 个「橘」`);
      },
    },
    {
      on: 'damage.before', who: 'any',
      filter: (d) => !d.canceled && (d.amount || 0) > 0 && (d.self.marks?.ju || 0) > 0,
      async effect(ctx) {
        const d = ctx.data;
        d.canceled = true;
        d.self.marks.ju = Math.max(0, (d.self.marks.ju || 0) - 1);
        await ctx.log(`【怀橘】：${d.self.name} 移去一个「橘」，防止此伤害（剩余 ${d.self.marks.ju} 个）`);
      },
    },
    {
      on: 'cards.draw', who: 'any',
      filter: (d) => (d.self.marks?.ju || 0) > 0 && d.reason === 'draw' && d.game.phase === 'draw'
        && d.self.flags.zhenglunSkip !== d.game.turnCount,
      async effect(ctx) {
        ctx.data.count += 1;
        await ctx.log(`【怀橘】：${ctx.data.self.name} 摸牌阶段多摸一张`);
      },
    },
  ],
});

defineSkill({
  id: 'yili', name: '遗礼',
  desc: '出牌阶段开始时，你可以失去 1 点体力或移去一个「橘」，然后令一名其他角色获得一个「橘」。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const hasJu = (p.marks.ju || 0) > 0;
      const canHp = p.hp > 1;
      if (!hasJu && !canHp) { await ctx.log('【遗礼】：无法支付代价'); return; }
      const opts = [];
      if (hasJu) opts.push('移去一个「橘」');
      if (canHp) opts.push('失去 1 点体力');
      const idx = await ctx.ask.choose(p, opts, { prompt: '【遗礼】：选择支付方式' });
      const pick = opts[idx >= 0 ? idx : 0];
      if (pick === '移去一个「橘」') {
        p.marks.ju = Math.max(0, (p.marks.ju || 0) - 1);
      } else {
        await g.loseHp(p, 1, { reason: 'yili' });
      }
      const t = (await ctx.ask.targets(p, {
        min: 1, max: 1, candidates: g.alive().filter(x => x !== p), prompt: '【遗礼】：令谁获得一个「橘」',
      }))[0];
      if (!t) return;
      t.marks.ju = (t.marks.ju || 0) + 1;
      await ctx.log(`【遗礼】：${t.name} 获得一个「橘」（共 ${t.marks.ju} 个）`);
    },
  }],
});

defineSkill({
  id: 'zhenglun', name: '整论',
  desc: '若你没有「橘」，你可以跳过摸牌阶段，然后获得一个「橘」。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw' && (d.self.marks?.ju || 0) === 0,
    async effect(ctx) {
      const p = ctx.self;
      p.marks.ju = (p.marks.ju || 0) + 1;
      p.flags.zhenglunSkip = ctx.game.turnCount;
      await ctx.log(`【整论】：跳过摸牌阶段，获得一个「橘」（共 ${p.marks.ju} 个）`);
    },
  }, {
    // 跳过摸牌阶段的落地：本阶段不摸牌（整论与怀橘互斥，由 huaiju 的 filter 排除）
    on: 'cards.draw', who: 'any',
    filter: (d) => d.self === d.player && d.reason === 'draw' && d.game.phase === 'draw'
      && d.player.flags.zhenglunSkip === d.game.turnCount && d.player.flags.zhenglunDone !== d.game.turnCount,
    async effect(ctx) {
      ctx.data.count = 0;
      ctx.self.flags.zhenglunDone = ctx.game.turnCount;
      await ctx.log('【整论】：跳过摸牌阶段，本阶段不摸牌');
    },
  }],
});

// ==================== 孙亮 · 溃诛 / 掣政 ====================
defineSkill({
  id: 'kuizhu', name: '溃诛',
  desc: '弃牌阶段结束后，你可以选择一项：令至多 X 名角色各摸一张牌；或对一名体力值不小于 X 的角色造成 1 点伤害（X 为你于此阶段弃置的牌数）。',
  triggers: [
    {
      on: 'cards.discard', who: 'any',
      filter: (d) => d.self === d.player && d.game.phase === 'discard' && d.game.turnPlayer === d.player,
      async effect(ctx) {
        ctx.self.flags.kuizhuCount = (ctx.self.flags.kuizhuCount || 0) + (ctx.data.cards || []).length;
      },
    },
    {
      on: 'turn.begin', who: 'self',
      async effect(ctx) { ctx.self.flags.kuizhuCount = 0; },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.phase === 'discard' && (d.self.flags.kuizhuCount || 0) > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = p.flags.kuizhuCount || 0;
        const idx = await ctx.ask.choose(p, [
          `令至多 ${x} 名角色各摸一张牌`,
          `对一名体力值不小于 ${x} 的角色造成 1 点伤害`,
        ], { prompt: `【溃诛】：X = ${x}，选择一项` });
        if (idx === 1) {
          const cands = g.alive().filter(t => t.hp >= x);
          if (!cands.length) { await ctx.log(`【溃诛】：没有体力值不小于 ${x} 的角色`); return; }
          const t = (await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【溃诛】：选择一名角色' }))[0];
          if (!t) return;
          await ctx.damage({ from: p, to: t, amount: 1, reason: 'kuizhu' });
          await ctx.log(`【溃诛】：对 ${t.name} 造成 1 点伤害`);
          return;
        }
        const ts = await ctx.ask.targets(p, {
          min: 1, max: x, candidates: g.alive(), prompt: `【溃诛】：令至多 ${x} 名角色各摸一张牌`,
        });
        for (const t of ts) await ctx.draw(t, 1, { reason: 'kuizhu' });
        await ctx.log(`【溃诛】：${ts.length} 名角色各摸一张牌`);
      },
    },
  ],
});

defineSkill({
  id: 'chezheng', name: '掣政',
  desc: '锁定技，你的出牌阶段内，攻击范围内不包含你的角色不能成为你使用牌的目标；出牌阶段结束时，若你本阶段内使用的牌数不大于这些角色数，你弃置其中一名角色的一张牌。',
  triggers: [
    {
      on: 'turn.begin', who: 'self',
      async effect(ctx) { ctx.self.flags.chezhengUses = 0; },
    },
    {
      on: 'card.use.after', who: 'any',
      filter: (d) => d.self === d.player && d.game.turnPlayer === d.player && d.game.phase === 'play',
      async effect(ctx) { ctx.self.flags.chezhengUses = (ctx.self.flags.chezhengUses || 0) + 1; },
    },
    {
      on: 'phase.end', who: 'self',
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const outside = g.alive().filter(x => x !== p && !g.inAttackRange(x, p));
        const used = p.flags.chezhengUses || 0;
        if (!outside.length || used > outside.length) return;
        const t = (await ctx.ask.targets(p, {
          min: 1, max: 1, candidates: outside, prompt: '【掣政】：弃置一名攻击范围不含你的角色一张牌',
        }))[0];
        if (!t) return;
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        if (!pool.length) { await ctx.log('【掣政】：目标没有牌'); return; }
        const res = await g.ask(p, 'cards', {
          prompt: `【掣政】：弃置 ${t.name} 的一张牌`, cards: pool.map(c => c.id), min: 1, max: 1, optional: false,
        });
        const pick = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
        if (!pick.length) return;
        await ctx.discard(t, pick, { reason: 'chezheng' });
        await ctx.log(`【掣政】：弃置 ${t.name} 的 ${cardLabel(pick[0])}`);
      },
    },
  ],
});

// ==================== 蒯良蒯越 · 荐降 / 审时 ====================
defineSkill({
  id: 'jiangjian', name: '荐降',
  desc: '当你成为其他角色使用牌的目标后，你可以令手牌数最少的一名角色摸一张牌。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => d.target === d.player && d.self && d.self !== d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const alive = g.alive();
      const min = Math.min(...alive.map(x => x.hand.length));
      const cands = alive.filter(x => x.hand.length === min);
      const t = cands.length === 1 ? cands[0]
        : (await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【荐降】：令一名手牌最少的角色摸一张牌' }))[0];
      if (!t) return;
      await ctx.draw(t, 1, { reason: 'jiangjian' });
      await ctx.log(`【荐降】：${t.name} 摸一张牌`);
    },
  }],
});

// 审时（转换技，简化）：阳 —— 出牌阶段限一次，将一张牌交给手牌数最多的一名角色，然后对其造成 1 点伤害。
// 阴 —— 其他角色对你造成伤害后，你可以交给其一张牌，本回合结束时若其未失去此牌，你将手牌摸至四张。
defineSkill({
  id: 'shenshi', name: '审时',
  desc: '转换技。阳：出牌阶段限一次，你可以将一张牌交给手牌数最多的一名角色，然后对其造成 1 点伤害。阴：其他角色对你造成伤害后，你可以交给其一张牌，若其于本回合结束时未失去此牌，你将手牌摸至四张。',
  active: {
    perPhase: true,
    prompt: '转换技·阳：交一张牌给手牌最多的角色，然后对其造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const side = p.flags.shenshiSide === 'yin' ? 'yin' : 'yang';
      if (side === 'yin') { await ctx.log('【审时】：当前为阴面（受伤后触发），无法主动发动'); return; }
      const alive = g.alive().filter(x => x !== p);
      if (!alive.length || !p.hand.length) { await ctx.log('【审时】：条件不足'); return; }
      const max = Math.max(...alive.map(x => x.hand.length));
      const cands = alive.filter(x => x.hand.length === max);
      const t = cands.length === 1 ? cands[0]
        : (await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【审时】：选择手牌最多的角色' }))[0];
      if (!t) return;
      const res = await g.ask(p, 'cards', {
        prompt: '【审时】：交给其一张牌', cards: p.hand.map(c => c.id), min: 1, max: 1, optional: false,
      });
      // AI 的 cards 回答可能超过 max，必须按上限截断；gain 必须带 from（否则牌双存）。
      const pick = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean).slice(0, 1);
      if (!pick.length) return;
      await ctx.gain(t, pick, { from: p, reason: 'shenshi' });
      await ctx.log(`【审时】：将 ${cardLabel(pick[0])} 交给 ${t.name}`);
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'shenshi' });
      p.flags.shenshiSide = 'yin';
      await ctx.log(`【审时】：对 ${t.name} 造成 1 点伤害（转为阴）`);
    },
  },
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && (d.amount || 0) > 0 && d.from && d.from !== d.player
      && d.player.flags.shenshiSide === 'yin' && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, d = ctx.data, g = ctx.game;
      const foe = d.from;
      const res = await g.ask(p, 'cards', {
        prompt: `【审时】：交给 ${foe.name} 一张牌`, cards: p.hand.map(c => c.id), min: 1, max: 1, optional: false,
      });
      const pick = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
      if (!pick.length) return;
      const i = p.hand.indexOf(pick[0]);
      if (i >= 0) p.hand.splice(i, 1);
      await ctx.gain(foe, pick, { reason: 'shenshi' });
      p.flags.shenshiSide = 'yang';
      // 简化：回合结束时若其未失去此牌则摸至四张（用 turn.end 一次性判定）
      p.flags.shenshiPending = { cardId: pick[0].id, ownerSeat: foe.seat, turn: g.turnCount };
      await ctx.log(`【审时】：将 ${cardLabel(pick[0])} 交给 ${foe.name}（转为阳）`);
    },
  }, {
    on: 'turn.end', who: 'self',
    filter: (d) => {
      const pd = d.self.flags.shenshiPending;
      return !!pd && pd.turn === d.game.turnCount;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pd = p.flags.shenshiPending;
      p.flags.shenshiPending = null;
      const owner = g.players.find(x => x.seat === pd.ownerSeat);
      const still = owner && owner.alive && owner.hand.some(c => c.id === pd.cardId);
      if (!still) { await ctx.log('【审时】：该牌已离开其手牌，无后续效果'); return; }
      const need = Math.max(0, 4 - p.hand.length);
      if (need > 0) await ctx.draw(p, need, { reason: 'shenshi' });
      await ctx.log(`【审时】：${owner.name} 未失去此牌，${p.name} 将手牌补至 4 张（摸 ${need}）`);
    },
  }],
});

export const YIN2_SKILL_IDS = ['huaiju', 'yili', 'zhenglun', 'kuizhu', 'chezheng', 'jiangjian', 'shenshi'];
