// 稀世珍宝（pack = 'xe'）技能实现
// ------------------------------------------------------------------
// 7 名：张让【滔乱】、庞德公【评才】、黄承彦【雅士】、钟琰【观戏】、
//       张梁【妖术】、张宝【呼风】、丘力居【骁骑】【掠阵】
// 技能 id 前缀 `xe_`。只用引擎既有 API。
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const VC = (name, suit = 'spade', num = 7) => ({
  id: `vcxe_${++vseq}`, name, suit, num,
  type: CARD_META[name]?.type || 'basic', virtual: true,
});
const others = (g, p) => g.alive().filter((x) => x !== p);
const isBlackC = (c) => !!c && (c.suit === 'spade' || c.suit === 'club');

// ===================== 张让 =====================
// 滔乱：出牌阶段限一次，你可以弃置一张手牌，视为使用一张【无中生有】，然后失去 1 点体力。
defineSkill({
  id: 'xe_taoluan', name: '滔乱',
  desc: '出牌阶段限一次，你可以弃置一张手牌，视为使用一张【无中生有】，然后你失去 1 点体力。',
  active: {
    perPhase: true,
    prompt: '滔乱：弃一张手牌，视为使用【无中生有】，然后失去 1 点体力',
    async effect(ctx) {
      const p = ctx.self;
      if (!p.hand.length) { await ctx.log('【滔乱】：没有手牌'); return; }
      const [cost] = await ctx.game.chooseSomeCards(p, p.hand, 1, { prompt: '【滔乱】：弃置一张手牌' });
      if (!cost) return;
      await ctx.discard(p, [cost], { reason: 'taoluan' });
      const vc = VC('wuzhong', cost.suit, cost.num);
      await ctx.useCard({ from: p, card: vc, targets: [], reason: 'taoluan', virtual: true, asName: 'wuzhong' });
      await ctx.log(`【滔乱】：弃 ${cardLabel(cost)} 视为使用【无中生有】`);
      await ctx.loseHp(p, 1, { reason: 'taoluan' });
    },
  },
});

// ===================== 庞德公 =====================
// 评才：出牌阶段限一次，你可以令一名角色摸两张牌，然后其弃置一张手牌。
defineSkill({
  id: 'xe_pingcai', name: '评才',
  desc: '出牌阶段限一次，你可以令一名角色摸两张牌，然后其弃置一张手牌。',
  active: {
    perPhase: true,
    prompt: '评才：令一名角色摸两张牌，然后弃一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive();
      if (!cands.length) return;
      const tg = await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【评才】：选择一名角色' });
      const t = tg && tg[0];
      if (!t) return;
      await ctx.draw(t, 2, { reason: 'pingcai' });
      if (t.hand.length) {
        const [c] = await g.chooseSomeCards(t, t.hand, 1, { prompt: '【评才】：弃置一张手牌' });
        if (c) await ctx.discard(t, [c], { reason: 'pingcai' });
      }
      await ctx.log(`【评才】：${t.name} 摸两张牌并弃置一张`);
    },
  },
});

// ===================== 黄承彦 =====================
// 雅士：出牌阶段限一次，你可以弃置一名其他角色的一张手牌。
defineSkill({
  id: 'xe_yashi', name: '雅士',
  desc: '出牌阶段限一次，你可以弃置一名其他角色的一张手牌。',
  active: {
    perPhase: true,
    prompt: '雅士：弃置一名其他角色的一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((x) => (x.hand || []).length);
      if (!cands.length) { await ctx.log('【雅士】：没有可选目标'); return; }
      const tg = await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【雅士】：选择一名角色' });
      const t = tg && tg[0];
      if (!t) return;
      const [c] = await g.chooseSomeCards(p, t.hand, 1, { prompt: `【雅士】：弃置 ${t.name} 的一张手牌` });
      if (!c) return;
      await ctx.discard(t, [c], { reason: 'yashi' });
      await ctx.log(`【雅士】：弃置 ${t.name} 的一张手牌`);
    },
  },
});

// ===================== 钟琰 =====================
// 观戏：每回合限一次，当一名其他角色使用牌后，你可以摸一张牌。
defineSkill({
  id: 'xe_guanxi', name: '观戏',
  desc: '每回合限一次，当一名其他角色使用牌后，你可以摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'any', optional: true,
    filter: (d) => d.player && d.player !== d.self && d.self.alive
      && (d.self.flags.guanxiTurn || 0) !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.guanxiTurn = ctx.game.turnCount;
      await ctx.draw(p, 1, { reason: 'guanxi' });
      // 注意：ctx.data 是事件原始数据，事件主体在 ctx.data.self（ctx.data.player 只在 filter 里存在）
      const user = ctx.data.self;
      await ctx.log(`【观戏】：${user ? user.name : '一名角色'} 使用 ${ctx.data.card ? cardLabel(ctx.data.card) : '牌'}，你摸一张牌`);
    },
  }],
});

// ===================== 张梁 =====================
// 妖术：出牌阶段限一次，你可以弃置一张牌，令一名角色判定；若结果为黑色，其失去 1 点体力。
defineSkill({
  id: 'xe_yaoshu', name: '妖术',
  desc: '出牌阶段限一次，你可以弃置一张牌，令一名角色进行判定；若结果为黑色，其失去 1 点体力。',
  active: {
    perPhase: true,
    prompt: '妖术：弃一张牌令一名角色判定，黑色则失去 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = [...p.hand, ...Object.values(p.equips || {}).filter(Boolean)];
      if (!pool.length) { await ctx.log('【妖术】：没有牌可弃'); return; }
      const [cost] = await g.chooseSomeCards(p, pool, 1, { prompt: '【妖术】：弃置一张牌' });
      if (!cost) return;
      await ctx.discard(p, [cost], { reason: 'yaoshu' });
      const cands = g.alive();
      const tg = await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【妖术】：选择判定的角色' });
      const t = tg && tg[0];
      if (!t) return;
      const j = await ctx.judge(t, { reason: 'yaoshu' });
      if (!j || j.canceled) return;
      if (isBlackC(j.card)) {
        await ctx.loseHp(t, 1, { reason: 'yaoshu' });
        await ctx.log(`【妖术】：${t.name} 判定 ${cardLabel(j.card)}（黑），失去 1 点体力`);
      } else {
        await ctx.log(`【妖术】：${t.name} 判定 ${cardLabel(j.card)}（红），未生效`);
      }
    },
  },
});

// ===================== 张宝 =====================
// 呼风：当你受到伤害后，你可以令伤害来源弃置一张牌。
defineSkill({
  id: 'xe_hufeng', name: '呼风',
  desc: '当你受到伤害后，你可以令伤害来源弃置一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.to === d.self && d.from && d.from !== d.self && d.from.alive,
    async effect(ctx) {
      const p = ctx.self, src = ctx.data.from;
      const pool = [...(src.hand || []), ...Object.values(src.equips || {}).filter(Boolean)];
      if (!pool.length) return;
      const [c] = await ctx.game.chooseSomeCards(src, pool, 1, { prompt: '【呼风】：弃置一张牌' });
      if (!c) return;
      await ctx.discard(src, [c], { reason: 'hufeng' });
      await ctx.log(`【呼风】：${src.name} 弃置一张牌`);
    },
  }],
});

// ===================== 丘力居 =====================
// 骁骑：锁定技，你使用【杀】无距离限制。
defineSkill({
  id: 'xe_xiaoqi', name: '骁骑',
  desc: '锁定技，你使用【杀】无距离限制。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: (d) => d.player === d.self,
    async effect(ctx) { ctx.self.flags.shaNoRange = true; },
  }],
});

// 掠阵：当你使用牌造成伤害后，你可以摸一张牌（每回合限一次）。
defineSkill({
  id: 'xe_luezhen', name: '掠阵',
  desc: '每回合限一次，当你使用【杀】造成伤害后，你可以摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => !!d.player && d.from === d.player && d.card && d.card.name === 'sha'
      && (d.player.flags.luezhenTurn || 0) !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.luezhenTurn = ctx.game.turnCount;
      await ctx.draw(p, 1, { reason: 'luezhen' });
      await ctx.log('【掠阵】：摸一张牌');
    },
  }],
});
