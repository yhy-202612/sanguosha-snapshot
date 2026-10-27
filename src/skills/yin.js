// 神话再临·阴（第一批 4 将）：王基 / 王平 / 许攸 / 严颜
// 说明：陆绩（橘标记）、孙亮（溃诛/掣政）、蒯良蒯越（审时转换技）需额外标记机制，留下一批。
import { defineSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, suitOf } from '../engine/cards.js';

const isBasicOrTrick = (name) => {
  const m = CARD_META[name];
  return !!m && (m.type === 'basic' || m.type === 'trick');
};

async function discardSome(ctx, player, n, prompt) {
  const pool = [...player.hand, ...Object.values(player.equips).filter(Boolean)];
  if (!pool.length) return [];
  const res = await ctx.game.ask(player, 'cards', {
    prompt, cards: pool.map(c => c.id), min: n, max: n, optional: true,
  });
  const picks = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
  if (picks.length) await ctx.discard(player, picks, { reason: 'skill' });
  return picks;
}

// 兵略的实际结算：对每名其他角色第一次发动【飞军】时摸两张牌
async function binglveHook(ctx, p, t) {
  if (!(effSkills(p) || []).some(s => s.id === 'binglve')) return;
  p.flags.feijunSeats = p.flags.feijunSeats || [];
  if (p.flags.feijunSeats.includes(t.seat)) return;
  p.flags.feijunSeats.push(t.seat);
  await ctx.draw(p, 2, { reason: 'binglve' });
  await ctx.log(`【兵略】：首次对 ${t.name} 发动【飞军】，摸两张牌`);
}

// ==================== 王基 · 奇制 / 进趋 ====================
// 奇制：回合内使用基本牌/锦囊牌指定目标后，可弃一名非目标角色的一张牌，然后其摸一张。
defineSkill({
  id: 'qizhi', name: '奇制',
  desc: '当你于回合内使用基本牌或锦囊牌指定目标后，你可以弃置一名不是此牌目标的角色的一张牌，然后其摸一张牌。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => {
      if (d.self !== d.player || d.game.turnPlayer !== d.player) return false;
      if (!d.card || !isBasicOrTrick(d.card.name)) return false;
      const used = [d.player, ...(d.used || []), d.target].filter(Boolean);
      return d.game.alive().some(x => !used.includes(x)
        && (x.hand.length || Object.values(x.equips).filter(Boolean).length));
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const used = [p, ...(d.used || []), d.target].filter(Boolean);
      const cands = g.alive().filter(x => !used.includes(x)
        && (x.hand.length || Object.values(x.equips).filter(Boolean).length));
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, {
        min: 1, max: 1, candidates: cands, prompt: '【奇制】：弃置一名非目标角色的一张牌',
      }))[0];
      if (!t) return;
      const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
      const res = await g.ask(p, 'cards', {
        prompt: `【奇制】：选择 ${t.name} 的一张牌弃置`,
        cards: pool.map(c => c.id), min: 1, max: 1, optional: false,
      });
      const pick = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
      if (!pick.length) return;
      await ctx.discard(t, pick, { reason: 'qizhi' });
      await ctx.draw(t, 1, { reason: 'qizhi' });
      p.flags.qizhiCount = (p.flags.qizhiCount || 0) + 1;
      await ctx.log(`【奇制】：弃置 ${t.name} 的 ${cardLabel(pick[0])}，其摸一张牌（本回合第 ${p.flags.qizhiCount} 次）`);
    },
  }],
});

// 进趋：结束阶段，可摸两张，然后将手牌弃至 X（X = 本回合发动奇制的次数）。
defineSkill({
  id: 'jinqu', name: '进趋',
  desc: '结束阶段，你可以摸两张牌，然后将手牌弃置至 X 张（X 为你于此回合内发动过【奇制】的次数）。',
  triggers: [
    {
      on: 'turn.begin', who: 'self',
      async effect(ctx) { ctx.self.flags.qizhiCount = 0; },
    },
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'end',
      async effect(ctx) {
        const p = ctx.self;
        const x = p.flags.qizhiCount || 0;
        await ctx.draw(p, 2, { reason: 'jinqu' });
        const over = p.hand.length - x;
        if (over > 0) {
          const res = await ctx.game.ask(p, 'cards', {
            prompt: `【进趋】：手牌弃至 ${x} 张`, cards: p.hand.map(c => c.id),
            min: over, max: over, optional: false,
          });
          const picks = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
          if (picks.length) await ctx.discard(p, picks, { reason: 'jinqu' });
        }
        await ctx.log(`【进趋】：摸两张，手牌调整至 ${x} 张`);
      },
    },
  ],
});

// ==================== 王平 · 飞军 / 兵略 ====================
defineSkill({
  id: 'feijun', name: '飞军',
  desc: '出牌阶段限一次，你可以弃置一张牌，然后选择一项：令一名手牌数大于你的角色交给你一张牌；或令一名装备区里牌数大于你的角色弃置一张装备牌。',
  active: {
    perTurn: true,
    prompt: '弃一张牌：令手牌多于你的角色交你一张，或令装备多于你的角色弃一张装备',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) { await ctx.log('【飞军】：没有可弃置的牌'); return; }
      const picks = await discardSome(ctx, p, 1, '【飞军】：弃置一张牌');
      if (!picks.length) return;
      const idx = await ctx.ask.choose(p, [
        '令一名手牌数大于你的角色交给你一张牌',
        '令一名装备区牌数大于你的角色弃置一张装备牌',
      ], { prompt: '【飞军】：选择一项' });
      if (idx === 1) {
        const cands = g.alive().filter(x => x !== p && Object.values(x.equips).filter(Boolean).length > Object.values(p.equips).filter(Boolean).length);
        if (!cands.length) { await ctx.log('【飞军】：没有装备更多的角色'); return; }
        const t = (await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【飞军】：选择一名角色弃置装备' }))[0];
        if (!t) return;
        const eq = Object.values(t.equips).filter(Boolean);
        const c = eq[(await ctx.ask.choose(p, eq.map(x => cardLabel(x)), { prompt: '【飞军】：选择其一张装备弃置' }))] || eq[0];
        if (!c) return;
        await ctx.discard(t, [c], { reason: 'feijun' });
        await ctx.log(`【飞军】：${t.name} 弃置装备 ${cardLabel(c)}`);
        await binglveHook(ctx, p, t);
      } else {
        const cands = g.alive().filter(x => x !== p && x.hand.length > p.hand.length);
        if (!cands.length) { await ctx.log('【飞军】：没有手牌更多的角色'); return; }
        const t = (await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【飞军】：选择一名角色交牌' }))[0];
        if (!t) return;
        const res = await g.ask(t, 'cards', {
          prompt: '【飞军】：交给王平一张牌', cards: t.hand.map(c => c.id), min: 1, max: 1, optional: false,
        });
        // AI 的 cards 回答可能超过 max（历史实现固定回 2 张），必须按上限截断，
        // 并且 gain 必须带 from，否则第 2 张牌会同时留在交牌者手牌里。
        const pick = (res?.cardIds || []).map(id => t.hand.find(c => c.id === id)).filter(Boolean).slice(0, 1);
        if (!pick.length) return;
        await ctx.gain(p, pick, { from: t, reason: 'feijun' });
        await ctx.log(`【飞军】：${t.name} 交给 ${p.name} ${cardLabel(pick[0])}`);
        await binglveHook(ctx, p, t);
      }
    },
  },
});

// 兵略：锁定技（引擎无关，逻辑内联在【飞军】里：对每名其他角色第一次发动飞军时摸两张）。
defineSkill({
  id: 'binglve', name: '兵略',
  desc: '锁定技，当你对每名其他角色第一次发动【飞军】时，你摸两张牌。',
  triggers: [],
});

// ==================== 许攸 · 成略 / 恃才 / 寸目 ====================
// 成略：转换技，出牌阶段限一次。阳：摸一张弃两张；阴：摸两张弃一张。直到回合结束，使用与弃置牌同花色的牌无距离与次数限制。
defineSkill({
  id: 'chenglve', name: '成略',
  desc: '转换技，出牌阶段限一次。阳：你摸一张牌，然后弃置两张手牌；阴：你摸两张牌，然后弃置一张手牌。如此做后，直到本回合结束，你使用与弃置牌花色相同的牌无距离和次数限制。',
  active: {
    perTurn: true,
    prompt: '转换技：阳（摸1弃2）/ 阴（摸2弃1）',
    async effect(ctx) {
      const p = ctx.self;
      const side = p.flags.chenglveSide === 'yin' ? 'yin' : 'yang';
      const isYang = side === 'yang';
      await ctx.draw(p, isYang ? 1 : 2, { reason: 'chenglve' });
      const picks = isYang
        ? await discardSome(ctx, p, 2, '【成略】·阳：弃置两张手牌')
        : await discardSome(ctx, p, 1, '【成略】·阴：弃置一张手牌');
      p.flags.chenglveSide = isYang ? 'yin' : 'yang';
      if (picks.length) {
        const suits = [...new Set(picks.map(c => suitOf(p, c)))];
        p.flags.chenglveSuits = suits;
        p.flags.chenglveTurn = ctx.game.turnCount;
        // 简化：视为无距离与次数限制（花色限制在回执中注明未逐牌校验）
        p.flags.shaUnlimited = ctx.game.turnCount;
        p.flags.distanceMinus = (p.flags.distanceMinus || 0) + 5;
        await ctx.log(`【成略】·${isYang ? '阳 → 阴' : '阴 → 阳'}：本回合使用${suits.join('/')}花色的牌无距离与次数限制`);
      } else {
        await ctx.log(`【成略】·${isYang ? '阳' : '阴'}：未弃置牌，无后续效果`);
      }
    },
  },
});

// 恃才：使用一张牌结算结束后，若此牌与你本回合使用过的牌类型均不同，可将此牌置于牌堆顶，然后摸一张。
defineSkill({
  id: 'shicai', name: '恃才',
  desc: '当你使用一张牌结算结束后，若此牌与你本回合使用过的牌类型均不同，你可以将此牌置于牌堆顶，然后摸一张牌。',
  triggers: [
    {
      on: 'turn.begin', who: 'self',
      async effect(ctx) { ctx.self.flags.shicaiTypes = []; },
    },
    {
      on: 'card.use.after', who: 'any', optional: true,
      filter: (d) => {
        if (d.self !== d.player || d.game.turnPlayer !== d.player) return false;
        const m = d.card && CARD_META[d.card.name];
        if (!m) return false;
        const used = d.player.flags.shicaiTypes || [];
        return !used.includes(m.type);
      },
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        const m = CARD_META[d.card.name];
        if (!m) return;
        p.flags.shicaiTypes = [...(p.flags.shicaiTypes || []), m.type];
        const card = d.card;
        // 使用结算后该牌可能已在弃牌堆/处理区，装备牌则还在装备区 —— 先彻底摘下再置顶，
        // 否则同一张牌会同时存在于牌堆与弃牌堆（或装备区），牌张总数被复制。
        await ctx.game.takeCard(card);
        ctx.game.deck.push(card); // 牌堆顶 = 末尾
        await ctx.draw(p, 1, { reason: 'shicai' });
        await ctx.log(`【恃才】：将 ${m.cn} 置于牌堆顶，然后摸一张牌`);
      },
    },
  ],
});

// 寸目：锁定技，你摸牌时改为从牌堆底摸牌。
defineSkill({
  id: 'cunmu', name: '寸目',
  desc: '锁定技，当你摸牌时，改为从牌堆底摸牌。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) { ctx.self.flags.drawFromBottom = true; },
  }],
});

// ==================== 严颜 · 拒战（转换技） ====================
// 阳：成为其他角色【杀】的目标后，可与其各摸一张，然后其本回合不能再对你使用牌。
// 阴：使用【杀】指定目标后，可获得其一张牌，然后你本回合不能再对其使用牌。
defineSkill({
  id: 'juzhan', name: '拒战',
  desc: '转换技。阳：当你成为其他角色使用【杀】的目标后，你可以与其各摸一张牌，然后其本回合不能再对你使用牌。阴：当你使用【杀】指定一名角色为目标后，你可以获得其一张牌，然后你本回合不能再对其使用牌。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => {
      if (!d.card || d.card.name !== 'sha') return false;
      const side = d.player.flags.juzhanSide === 'yin' ? 'yin' : 'yang';
      if (side === 'yang') return d.target === d.player && d.self && d.self !== d.player;
      return d.self === d.player && d.target && d.target !== d.player;
    },
    async effect(ctx) {
      const p = ctx.self, d = ctx.data;
      const side = p.flags.juzhanSide === 'yin' ? 'yin' : 'yang';
      if (side === 'yang') {
        const foe = d.self;
        await ctx.draw(p, 1, { reason: 'juzhan' });
        await ctx.draw(foe, 1, { reason: 'juzhan' });
        foe.flags.noTargetTurn = ctx.game.turnCount;
        foe.flags.noTargetSeat = p.seat;
        p.flags.juzhanSide = 'yin';
        await ctx.log(`【拒战】·阳：${p.name} 与 ${foe.name} 各摸一张，${foe.name} 本回合不能再对 ${p.name} 使用牌（转为阴）`);
        return;
      }
      const t = d.target;
      const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
      if (!pool.length) { await ctx.log('【拒战】：目标没有可获得的牌'); return; }
      const res = await ctx.game.ask(p, 'cards', {
        prompt: `【拒战】：获得 ${t.name} 的一张牌`, cards: pool.map(c => c.id), min: 1, max: 1, optional: false,
      });
      const pick = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
      if (!pick.length) return;
      const hi = t.hand.indexOf(pick[0]);
      if (hi >= 0) t.hand.splice(hi, 1);
      else {
        // ★走引擎出口派发 equip.lose（SG033 P0-2）
        await ctx.game.unequipCard(t, pick[0], { reason: 'juzhan' });
      }
      await ctx.gain(p, pick, { reason: 'juzhan' });
      p.flags.noTargetTurn = ctx.game.turnCount;
      p.flags.noTargetSeat = t.seat;
      p.flags.juzhanSide = 'yang';
      await ctx.log(`【拒战】·阴：获得 ${t.name} 的 ${cardLabel(pick[0])}，本回合不能再对 ${t.name} 使用牌（转为阳）`);
    },
  }],
});

export const YIN_SKILL_IDS = ['qizhi', 'jinqu', 'feijun', 'binglve', 'chenglve', 'shicai', 'cunmu', 'juzhan'];
