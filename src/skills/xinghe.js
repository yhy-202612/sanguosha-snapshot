// 星河璀璨·限定（D 批 12 将）
// 星河璀璨 5 将：星夏侯霸 / 星法正 / 星蒋琬 / 星曹仁 / 星荀彧
// 限定专属 7 将：曹婴 / 曹纯 / 赵襄 / 鲍三娘 / 关索 / 文鸯 / 王双
// 依赖机制：判定（judge）、护甲无关的体力上限（maxHp）、标记（marks）、区域移动（chooseCardFrom）
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, isRed, SUIT_CN } from '../engine/cards.js';
import { GENERALS } from '../data/generals.js';

let vseq = 0;
const vcard = (name, type = 'basic', suit = 'spade', num = 7) => ({ id: `vxh${++vseq}`, name, suit, num, type, virtual: true });
const roundStart = (g) => g.turnCount % Math.max(1, g.players.length) === 1;
const roundEnd = (g) => g.turnCount % Math.max(1, g.players.length) === 0;
const DAMAGE_CARDS = ['sha', 'juedou', 'nanman', 'wanjian', 'huogong'];
const isDamageCard = (name) => DAMAGE_CARDS.includes(name);
const singleTargetCard = (name) => {
  const r = CARD_META[name]?.target;
  return !!r && typeof r === 'object' && r.max === 1;
};
const typeOf = (c) => CARD_META[c?.name]?.type;
const colorOf = (c) => (c?.suit === 'heart' || c?.suit === 'diamond' ? 'red' : c?.suit === 'spade' || c?.suit === 'club' ? 'black' : null);

// ==================================================================
// 星河璀璨 · 星夏侯霸
// ==================================================================

// 维谷：你使用伤害牌指定唯一目标或成为伤害牌的唯一目标时，你可以弃置一张可指定自己为目标的牌，
// 然后选择一项：1.移动场上一张牌；2.令你攻击范围内的所有角色也成为此牌目标（此牌使用者除外）。
// 此牌结算结束后，若此牌未造成过伤害，你失去 1 点体力并摸两张牌。
defineSkill({
  id: 'weigu', name: '维谷',
  desc: '你使用伤害牌指定唯一目标或成为伤害牌的唯一目标时，你可以弃置一张可指定自己为目标的牌，然后选择一项：1.移动场上一张牌；2.令你攻击范围内的所有角色也成为此牌目标（不包括此牌使用者）。此牌结算结束后，若此牌未造成过伤害，你失去 1 点体力并摸两张牌。',
  triggers: [
    {
      on: 'target.after', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player;
        if (!p || !p.alive || !d.card) return false;
        if (d.self !== p && d.target !== p) return false;              // 使用者是自己 或 目标是自己
        if (!isDamageCard(d.card.name) || !singleTargetCard(d.card.name)) return false;
        return p.hand.some(c => CARD_META[c.name]?.target?.self);      // 手里有「可指定自己为目标」的牌
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data, card = d.card;
        if (!(await ctx.ask.confirm(p, '【维谷】：弃置一张可指定自己为目标的牌发动？'))) return;
        const pool = p.hand.filter(c => CARD_META[c.name]?.target?.self);
        const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【维谷】：弃置一张可指定自己为目标的牌', optional: false });
        if (!picks.length) return;
        await ctx.discard(p, picks, { reason: 'weigu' });
        p.flags.weiguCard = card.id;
        p.flags.weiguHit = false;
        const juefaOn = (p.flags.juefaUntil || -1) >= g.turnCount;
        const opts = juefaOn
          ? ['对一名角色造成 2 点伤害（绝伐）', '令你攻击范围内的所有角色也成为此牌目标']
          : ['移动场上一张牌', '令你攻击范围内的所有角色也成为此牌目标'];
        const idx = await ctx.ask.choose(p, opts, { prompt: '【维谷】：选择一项', reason: 'weigu' });
        if (idx <= 0) {
          if (juefaOn) {
            const cands = g.alive().filter(q => q !== p);
            const t = cands.length
              ? (await ctx.ask.targets(p, { prompt: '【维谷·绝伐】：对一名角色造成 2 点伤害', candidates: cands, min: 0, max: 1 }))[0]
              : null;
            if (t) {
              await ctx.damage({ from: p, to: t, amount: 2, reason: 'juefa' });
              if (!t.alive) p.flags.juefaKill = true;
              await ctx.log(`【维谷·绝伐】：对 ${t.name} 造成 2 点伤害`);
            }
          } else {
            const owners = g.alive().filter(q => q !== p
              && (Object.values(q.equips).some(Boolean) || (q.judgeZone || []).length));
            if (owners.length) {
              const t = (await ctx.ask.targets(p, { prompt: '【维谷】：移动场上一张牌（选择角色）', candidates: owners, min: 0, max: 1 }))[0] || owners[0];
              const c = await g.chooseCardFrom(p, t, { reason: 'weigu' });
              if (c) {
                await ctx.gain(p, [c], { from: t, reason: 'weigu' });
                await ctx.log(`【维谷】：移动场上一张牌（${t.name} 的 ${cardLabel(c)}）`);
              }
            } else await ctx.log('【维谷】：场上没有可移动的牌');
          }
        } else {
          // 令你攻击范围内的所有角色也成为此牌目标（此牌使用者除外）
          const from = d.self;
          const extra = g.alive().filter(q => q !== p && q !== from && g.inAttackRange(p, q));
          const name = card.name;
          if (name === 'sha') {
            for (const q of extra) await g.resolveSha(from, q, { ...card, __src: card });
          } else {
            for (const q of extra) await ctx.damage({ from, to: q, amount: 1, card, reason: 'weigu' });
          }
          await ctx.log(`【维谷】：${extra.length} 名角色（${extra.map(q => q.name).join('、') || '无'}）也成为此牌目标`);
        }
      },
    },
    {
      // 此牌造成过伤害
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.card && d.card.id === d.player?.flags?.weiguCard,
      async effect(ctx) { ctx.self.flags.weiguHit = true; },
    },
    {
      // 此牌结算结束：若未造成伤害 → 失去 1 点体力并摸两张牌
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!d.card && d.card.id === d.player?.flags?.weiguCard,
      async effect(ctx) {
        const p = ctx.self;
        const hit = p.flags.weiguHit;
        p.flags.weiguCard = null;
        p.flags.weiguHit = false;
        if (hit) return;
        await ctx.log('【维谷】：此牌未造成伤害，失去 1 点体力并摸两张牌');
        await ctx.loseHp(p, 1, { reason: 'weigu' });
        if (p.alive) await ctx.draw(p, 2, { reason: 'weigu' });
      },
    },
  ],
});

// 绝伐：限定技，出牌阶段，你可以将「维谷」中“移动场上一张牌”改为“对一名角色造成 2 点伤害”直到你的下个回合结束。
// 若如此做，当你于此期间内通过「维谷」杀死角色后，你将手牌和体力值调整至体力上限；
// 若此效果结束时你于此期间内未杀死过角色，你失去当前全部体力。
defineSkill({
  id: 'juefa', name: '绝伐',
  desc: '限定技，出牌阶段，你可以将「维谷」中“移动场上一张牌”改为“对一名角色造成 2 点伤害”直到你的下个回合结束。若如此做，当你于此期间内通过「维谷」杀死角色后，你将手牌和体力值调整至体力上限；若此效果结束时你于此期间内未杀死过角色，你失去当前全部体力。',
  triggers: [{
    on: 'turn.end', who: 'self', optional: false,
    filter: (d) => d.self === d.player && (d.player.flags.juefaUntil || 0) > 0
      && d.game.turnCount >= d.player.flags.juefaUntil && !d.player.flags.juefaDone,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.juefaDone = true;
      p.flags.juefaUntil = 0;
      if (p.flags.juefaKill) {
        if (p.hp < p.maxHp) await ctx.recover(p, p.maxHp - p.hp, { reason: 'juefa' });
        if (p.hand.length < p.maxHp) await ctx.draw(p, p.maxHp - p.hand.length, { reason: 'juefa' });
        await ctx.log('【绝伐】：期间内杀死过角色，手牌与体力值调整至体力上限');
      } else {
        await ctx.log(`【绝伐】：期间内未杀死角色，${p.name} 失去当前全部体力`);
        await ctx.loseHp(p, Math.max(1, p.hp), { reason: 'juefa' });
      }
    },
  }],
  active: {
    prompt: '限定技：将「维谷」的“移动场上一张牌”改为“造成 2 点伤害”',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.juefaUsed) { await ctx.log('【绝伐】：限定技已发动过'); return; }
      p.flags.juefaUsed = true;
      p.flags.juefaKill = false;
      p.flags.juefaDone = false;
      p.flags.juefaUntil = g.turnCount + Math.max(1, g.players.length);
      await ctx.log('【绝伐】：直到你的下个回合结束，「维谷」可改为对一名角色造成 2 点伤害');
    },
  },
});

// ==================================================================
// 星河璀璨 · 星法正
// ==================================================================

// 知机：准备阶段，你可以弃置任意张手牌，然后将手牌摸至五张。
// 若你因此弃置的牌数比摸牌数多，你可以对至多 X 名其他角色各造成 1 点伤害（X 为多的数量）；
// 与摸牌数相等，你本回合使用牌不能被响应；比摸牌数少，你本回合手牌上限 +2。
defineSkill({
  id: 'zhiji3', name: '知机',
  desc: '准备阶段，你可以弃置任意张手牌，然后将手牌摸至五张。若你因此弃置的牌数比摸牌数多，你可以对至多 X 名其他角色各造成 1 点伤害（X 为弃置牌数比摸牌数多的数量）；若弃置牌数与摸牌数相等，你本回合使用牌不能被响应；若摸牌数较多，你本回合手牌上限 +2。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const opts = ['不弃牌'];
        for (let i = 1; i <= p.hand.length; i++) opts.push(`弃置 ${i} 张手牌`);
        const idx = await ctx.ask.choose(p, opts, { prompt: '【知机】：弃置任意张手牌，然后将手牌摸至五张', reason: 'zhiji3' });
        const k = Math.max(0, Math.min(p.hand.length, idx));
        let discarded = 0;
        if (k > 0) {
          const picks = await g.chooseSomeCards(p, p.hand.slice(), k, { prompt: `【知机】：选择弃置 ${k} 张牌`, optional: false });
          discarded = picks.length;
          if (discarded) await ctx.discard(p, picks, { reason: 'zhiji3' });
        }
        const need = Math.max(0, 5 - p.hand.length);
        let drawn = 0;
        if (need > 0) { await ctx.draw(p, need, { reason: 'zhiji3' }); drawn = need; }
        if (discarded > drawn) {
          const x = discarded - drawn;
          const cands = g.alive().filter(q => q !== p);
          const picked = cands.length
            ? await ctx.ask.targets(p, { prompt: `【知机】：对至多 ${x} 名其他角色各造成 1 点伤害`, candidates: cands, min: 0, max: Math.min(x, cands.length) })
            : [];
          for (const q of picked) await ctx.damage({ from: p, to: q, amount: 1, reason: 'zhiji3' });
          await ctx.log(`【知机】：弃 ${discarded} 摸 ${drawn}，对 ${picked.length} 名角色各造成 1 点伤害`);
        } else if (discarded === drawn) {
          p.flags.zhijiNoRespond = g.turnCount;
          await ctx.log('【知机】：弃置数与摸牌数相等，本回合你使用牌不能被响应');
        } else {
          p.flags.handLimit = (p.flags.handLimit || 0) + 2;
          p.flags.zhijiLimitTurn = g.turnCount;
          await ctx.log('【知机】：摸牌数较多，本回合手牌上限 +2');
        }
      },
    },
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.player.flags.zhijiNoRespond === d.game.turnCount,
      async effect(ctx) { ctx.data.unavoidable = true; },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.player.flags.zhijiLimitTurn === d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.handLimit = Math.max(0, (p.flags.handLimit || 0) - 2);
        p.flags.zhijiLimitTurn = 0;
      },
    },
  ],
});

// 谙计：锁定技，当一名角色使用牌时，若此牌的花色为本轮内被使用过次数最少的花色，你摸一张牌。
defineSkill({
  id: 'anji', name: '谙计',
  desc: '锁定技，当一名角色使用牌时，若此牌的花色为本轮内被使用过次数最少的花色，你摸一张牌。',
  triggers: [
    {
      // 每轮开始时清零花色计数
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => roundStart(d.game),
      async effect(ctx) { ctx.self.flags.anjiSuits = { spade: 0, heart: 0, club: 0, diamond: 0 }; },
    },
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!d.card && !!d.card.suit && d.card.suit !== 'none' && !!d.player && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, c = ctx.data.card;
        const cnt = p.flags.anjiSuits || { spade: 0, heart: 0, club: 0, diamond: 0 };
        const min = Math.min(cnt.spade, cnt.heart, cnt.club, cnt.diamond);
        const hit = (cnt[c.suit] ?? 0) === min;
        cnt[c.suit] = (cnt[c.suit] ?? 0) + 1;
        p.flags.anjiSuits = cnt;
        if (hit) {
          await ctx.draw(p, 1, { reason: 'anji' });
          await ctx.log(`【谙计】：${SUIT_CN[c.suit]} 为本轮最少花色，摸一张牌`);
        }
      },
    },
  ],
});

// ==================================================================
// 星河璀璨 · 星蒋琬
// ==================================================================

// 镇庭：一名角色的回合结束时，若本回合至少 2 名角色受到过伤害，你可以选择一项：
// 1.令本回合受到伤害的一名角色回复 1 点体力并摸一张牌；
// 2.令本回合造成伤害的一名角色获得本回合进入弃牌堆的两张牌。
defineSkill({
  id: 'zhenting', name: '镇庭',
  desc: '一名角色的回合结束时，若本回合至少 2 名角色受到过伤害，你可以选择一项：1.令本回合受到过伤害的一名角色回复 1 点体力并摸一张牌；2.令本回合造成过伤害的一名角色获得本回合进入弃牌堆的两张牌。',
  triggers: [
    {
      // 记录本回合受伤 / 造成伤害 / 进入弃牌堆的牌
      on: 'damage.after', who: 'any', optional: false,
      filter: () => true,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        if (p.flags.zhentingTurn !== g.turnCount) {
          p.flags.zhentingTurn = g.turnCount;
          p.flags.zhentingHurt = [];
          p.flags.zhentingBy = [];
          p.flags.zhentingDiscard = [];
        }
        if (d.to && d.to.alive && !p.flags.zhentingHurt.includes(d.to.seat)) p.flags.zhentingHurt.push(d.to.seat);
        if (d.from && d.from.alive && !p.flags.zhentingBy.includes(d.from.seat)) p.flags.zhentingBy.push(d.from.seat);
      },
    },
    {
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => (d.cards || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.flags.zhentingTurn !== g.turnCount) {
          p.flags.zhentingTurn = g.turnCount;
          p.flags.zhentingHurt = [];
          p.flags.zhentingBy = [];
          p.flags.zhentingDiscard = [];
        }
        p.flags.zhentingDiscard.push(...(ctx.data.cards || []).map(c => c.id));
      },
    },
    {
      on: 'turn.end', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player, g = d.game;
        if (!p || !p.alive) return false;
        if (p.flags.zhentingTurn !== g.turnCount) return false;
        return (p.flags.zhentingHurt || []).length >= 2;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const idx = await ctx.ask.choose(p, ['令一名受伤角色回复 1 点体力并摸一张牌', '令一名造成伤害的角色获得本回合进入弃牌堆的两张牌'],
          { prompt: '【镇庭】：选择一项', reason: 'zhenting' });
        if (idx <= 0) {
          const cands = (p.flags.zhentingHurt || []).map(s => g.players[s]).filter(q => q && q.alive);
          if (!cands.length) return;
          const t = (await ctx.ask.targets(p, { prompt: '【镇庭】：令一名角色回复体力并摸一张牌', candidates: cands, min: 0, max: 1 }))[0] || cands[0];
          await ctx.recover(t, 1, { reason: 'zhenting' });
          await ctx.draw(t, 1, { reason: 'zhenting' });
          await ctx.log(`【镇庭】：${t.name} 回复 1 点体力并摸一张牌`);
        } else {
          const cands = (p.flags.zhentingBy || []).map(s => g.players[s]).filter(q => q && q.alive);
          if (!cands.length) return;
          const t = (await ctx.ask.targets(p, { prompt: '【镇庭】：令一名造成伤害的角色获得弃牌堆中的两张牌', candidates: cands, min: 0, max: 1 }))[0] || cands[0];
          const ids = p.flags.zhentingDiscard || [];
          const pool = ids.map(id => g.discardPile.find(c => c.id === id)).filter(Boolean).slice(0, 2);
          if (!pool.length) { await ctx.log('【镇庭】：本回合没有进入弃牌堆的牌'); return; }
          for (const c of pool) {
            const i = g.discardPile.indexOf(c);
            if (i >= 0) g.discardPile.splice(i, 1);
          }
          await ctx.gain(t, pool, { from: null, reason: 'zhenting' });
          await ctx.log(`【镇庭】：${t.name} 获得本回合进入弃牌堆的 ${pool.length} 张牌`);
        }
      },
    },
  ],
});

// 持国：出牌阶段开始时，你可以观看牌堆底的三张牌。若如此做，本阶段当你使用一张牌时，
// 亮出牌堆底一张牌，若两张牌花色相同，你为你使用的牌增加或减少一个目标（目标数至少为一），
// 然后将该牌置入弃牌堆；若花色不同，你将亮出的牌交给其中一名目标角色。
defineSkill({
  id: 'chiguo', name: '持国',
  desc: '出牌阶段开始时，你可以观看牌堆底的三张牌。若如此做，本阶段当你使用一张牌时，亮出牌堆底一张牌，若两张牌花色相同，你为你使用的牌增加或减少一个目标（目标数至少为一），然后将该牌置入弃牌堆；若花色不同，你将亮出的牌交给其中一名目标角色。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.game.deck.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.chiguoTurn = g.turnCount;
        const bottom = g.deck.slice(0, 3);
        await ctx.log(`【持国】：观看牌堆底三张（${bottom.map(cardLabel).join('、') || '无'}）`);
      },
    },
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.player.flags.chiguoTurn === d.game.turnCount && d.game.deck.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const c = g.popDeckBottom(1)[0];   // 牌堆底的牌
        if (!c) return;
        const suit = d.card?.suit;
        if (suit && suit !== 'none' && c.suit === suit) {
          const cands = g.candidatesFor(p, d.card, d.effName).filter(q => !d.targets.includes(q));
          const canAdd = cands.length > 0;
          const canSub = (d.targets || []).length > 1;
          const idx = await ctx.ask.choose(p, [canAdd ? '增加一个目标' : '（无法增加目标）', canSub ? '减少一个目标' : '（无法减少目标）'],
            { prompt: `【持国】：亮出 ${cardLabel(c)}，花色相同，为你使用的牌增加或减少一个目标`, reason: 'chiguo' });
          if (idx <= 0 && canAdd) {
            const t = (await ctx.ask.targets(p, { prompt: '【持国】：选择增加的目标', candidates: cands, min: 0, max: 1 }))[0] || cands[0];
            if (t) d.targets.push(t);
          } else if (idx > 0 && canSub) {
            d.targets.pop();
          }
          if (!g.discardPile.includes(c)) g.discardPile.push(c);
          await ctx.log(`【持国】：亮出 ${cardLabel(c)}，花色相同，调整此牌目标数（${(d.targets || []).length}）`);
        } else {
          const t = (d.targets || [])[0];
          if (t) {
            await ctx.gain(t, [c], { from: p, reason: 'chiguo' });
            await ctx.log(`【持国】：亮出 ${cardLabel(c)}，花色不同，交给 ${t.name}`);
          } else if (!g.discardPile.includes(c)) g.discardPile.push(c);
        }
      },
    },
  ],
});

// ==================================================================
// 星河璀璨 · 星曹仁
// ==================================================================

// 肃军：当你使用一张牌时，若你手牌中基本牌与非基本牌的数量相等，你可以摸两张牌。
defineSkill({
  id: 'sujun', name: '肃军',
  desc: '当你使用一张牌时，若你手牌中基本牌与非基本牌的数量相等，你可以摸两张牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => {
      const p = d.player;
      if (d.self !== p || !p.alive) return false;
      const basic = p.hand.filter(c => typeOf(c) === 'basic').length;
      return basic === p.hand.length - basic;      // 基本牌与非基本牌数量相等（含空城）
    },
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 2, { reason: 'sujun' });
      await ctx.log('【肃军】：手牌中基本牌与非基本牌数量相等，摸两张牌');
    },
  }],
});

// 砺锋：你可将一张本回合未使用过的颜色的手牌当不计次数的【杀】或【无懈可击】使用。
defineSkill({
  id: 'lifeng', name: '砺锋',
  desc: '你可将一张本回合未使用过的颜色的手牌当不计次数的【杀】或【无懈可击】使用。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { ctx.self.flags.lifengColors = { turn: ctx.game.turnCount, list: [] }; },
    },
    {
      // 记录本回合已使用过的牌的颜色；【砺锋】转化出去的【杀】不计入次数
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (!p.flags.lifengColors || p.flags.lifengColors.turn !== g.turnCount) p.flags.lifengColors = { turn: g.turnCount, list: [] };
        const col = colorOf(ctx.data.card);
        if (col && !p.flags.lifengColors.list.includes(col)) p.flags.lifengColors.list.push(col);
        if (ctx.data.card && ctx.data.card.__lifeng) {
          p.flags.shaLimitBypass = true;
          await ctx.log(`【砺锋】：将 ${cardLabel(ctx.data.card)} 当不计次数的【${ctx.data.effName === 'sha' ? '杀' : '无懈可击'}】使用`);
        }
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.player.flags.shaLimitBypass,
      async effect(ctx) { ctx.self.flags.shaLimitBypass = false; },
    },
  ],
});

// ==================================================================
// 星河璀璨 · 星荀彧
// ==================================================================

// 承奉（【匡祚】衍生）：每回合限一次，你可以将一张红色“匡祚”当【闪】、黑色“匡祚”当【无懈可击】使用；
// 此牌结算完成后，若“匡祚”不足两种颜色，你可以将牌堆顶一张牌置为“匡祚”。
defineSkill({
  id: 'chengfeng', name: '承奉',
  desc: '每回合限一次，你可以将一张红色“匡祚”当【闪】或黑色“匡祚”当【无懈可击】对即将对自己生效的牌使用。此牌结算完成后，若“匡祚”不足两种颜色，你可以将牌堆顶一张牌置为“匡祚”。',
  triggers: [
    {
      // 红色“匡祚”当【闪】：令即将对自己生效的伤害牌无效
      on: 'damage.before', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player;
        if (!p || !p.alive || d.to !== p) return false;
        if (p.flags.chengfengTurn === d.game.turnCount) return false;
        const red = (p.flags.kuangzuo || []).filter(c => isRed(c));
        return red.length > 0;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const pile = p.flags.kuangzuo || [];
        const idx = pile.findIndex(c => isRed(c));
        if (idx < 0) return;
        const c = pile.splice(idx, 1)[0];
        p.flags.chengfengTurn = g.turnCount;
        p.marks = p.marks || {};
        p.marks.kuangzuo = pile.length;
        g.discardPile.push(c);
        ctx.data.canceled = true;
        await ctx.log(`【承奉】：将 ${cardLabel(c)} 当【闪】使用，此牌对 ${p.name} 无效`);
        // 结算完成后若不足两种颜色，补一张牌堆顶为“匡祚”
        const colors = new Set(pile.map(x => (isRed(x) ? 'red' : 'black')));
        if (colors.size < 2) {
          const nc = g.popDeck(1)[0];
          if (nc) {
            pile.push(nc);
            p.marks.kuangzuo = pile.length;
            await ctx.log('【承奉】：置一张牌堆顶的牌为“匡祚”');
          }
        }
      },
    },
  ],
});

// 统荫（【匡祚】衍生，主公技）：当你受到其他角色使用牌造成的伤害后，若伤害来源与你势力相同，
// 你可以将此牌置为“匡祚”；若与你势力不同，你可以将其一张牌置为“匡祚”。
defineSkill({
  id: 'tongyin', name: '统荫',
  desc: '主公技，当你受到其他角色使用牌造成的伤害后，若伤害来源与你势力相同，你可以将此牌置为“匡祚”；若与你势力不同，你可以将其一张牌置为“匡祚”。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => !!d.from && d.from !== d.player && !!d.card && d.to === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      p.flags.kuangzuo = p.flags.kuangzuo || [];
      p.marks = p.marks || {};
      if (d.from.kingdom === p.kingdom) {
        if (!p.flags.kuangzuo.includes(d.card)) p.flags.kuangzuo.push(d.card);
        await ctx.log(`【统荫】：伤害来源同势力，将 ${cardLabel(d.card)} 置为“匡祚”`);
      } else {
        const pool = [...d.from.hand, ...Object.values(d.from.equips).filter(Boolean)];
        if (!pool.length) return;
        const c = pool[g.rng.int(pool.length)];
        await ctx.gain(p, [c], { from: d.from, reason: 'tongyin', toHand: false });
        p.flags.kuangzuo.push(c);
        await ctx.log(`【统荫】：伤害来源异势力，将其 ${cardLabel(c)} 置为“匡祚”`);
      }
      p.marks.kuangzuo = p.flags.kuangzuo.length;
    },
  }],
});

// 安庶：每轮结束时，你可以将弃牌堆中牌名不同的基本牌各一张置于牌堆顶，然后视为使用一张【五谷丰登】，
// 你选择从自己或一名受伤角色开始结算。下轮结束前，若有角色失去了以此法选择的牌，
// 此回合结束时你可令其将手牌摸至体力上限（最多摸到 5 张）。
defineSkill({
  id: 'anshu', name: '安庶',
  desc: '每轮结束时，你可以将弃牌堆中牌名不同的基本牌各一张置于牌堆顶，然后视为使用一张【五谷丰登】（你在自己或已受伤的角色中选择一名角色，从其开始结算）。然后直到下轮结束前，当一名角色失去了以此法获得的牌后，你可以于当前回合结束时令其将手牌摸至体力上限（至多摸至五）。',
  triggers: [
    {
      on: 'turn.end', who: 'self', optional: true,
      filter: (d) => d.self === d.player && roundEnd(d.game)
        && d.game.discardPile.some(c => typeOf(c) === 'basic'),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const picks = [];
        const names = [];
        for (const c of g.discardPile) {
          if (typeOf(c) !== 'basic' || names.includes(c.name)) continue;
          names.push(c.name);
          picks.push(c);
        }
        if (!picks.length) return;
        for (const c of picks) {
          const i = g.discardPile.indexOf(c);
          if (i >= 0) g.discardPile.splice(i, 1);
        }
        g.deck.push(...picks);            // 置于牌堆顶（数组末尾）
        p.flags.anshuUntil = g.turnCount + Math.max(1, g.players.length);
        const hurt = g.alive().filter(q => q.hp < q.maxHp && q !== p);
        const cands = [p, ...hurt];
        const start = (await ctx.ask.targets(p, { prompt: '【安庶】：选择从谁开始结算【五谷丰登】', candidates: cands, min: 0, max: 1 }))[0] || p;
        const order = g.orderFrom(start);
        let left = picks.length;
        for (const q of order) {
          if (left <= 0) break;
          const c = g.popDeck(1)[0];
          if (!c) break;
          left -= 1;
          q.hand.push(c);
          q.flags.anshuCard = c.id;
          q.flags.anshuNeed = true;
          await ctx.log(`【安庶】：${q.name} 获得 ${cardLabel(c)}`);
        }
        while (left-- > 0) {
          const c = g.popDeck(1)[0];
          if (c) g.discardPile.push(c);
        }
        await ctx.log(`【安庶】：将 ${picks.length} 张牌名不同的基本牌置于牌堆顶，视为使用【五谷丰登】`);
      },
    },
    {
      // 记录“失去以此法获得的牌”
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => (d.cards || []).some(c => c.id === d.self?.flags?.anshuCard),
      async effect(ctx) { ctx.data.self.flags.anshuLose = true; },
    },
    {
      // 该回合结束时令其将手牌摸至体力上限（至多 5）
      on: 'turn.end', who: 'any', optional: true,
      filter: (d) => !!d.player.flags.anshuLose && (d.player.flags.anshuUntil || 0) >= d.game.turnCount,
      async effect(ctx) {
        const q = ctx.self;
        q.flags.anshuLose = false;
        const cap = Math.min(5, q.maxHp);
        const need = Math.max(0, cap - q.hand.length);
        if (!need) return;
        await ctx.draw(q, need, { reason: 'anshu' });
        await ctx.log(`【安庶】：${q.name} 将手牌摸至 ${cap} 张`);
      },
    },
  ],
});

// 匡祚：限定技，出牌阶段，你可以令一名角色获得“承奉”（若其为主公且没有主公技，则额外获得“统荫”），
// 然后令另一名角色将每种花色各一张牌置于获得技能角色的武将牌上，称为“匡祚”。
defineSkill({
  id: 'kuangzuo', name: '匡祚',
  desc: '限定技，出牌阶段，你可以令一名角色获得“承奉”（若其为主公且没有主公技，则额外获得“统荫”），然后令另一名角色将每种花色各一张牌置于获得技能角色的武将牌上，称为“匡祚”。',
  active: {
    prompt: '限定技：令一名角色获得“承奉”，另一名角色上缴四种花色各一张牌作为“匡祚”',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.kuangzuoUsed) { await ctx.log('【匡祚】：限定技已发动过'); return; }
      p.flags.kuangzuoUsed = true;
      const a = (await ctx.ask.targets(p, { prompt: '【匡祚】：选择获得“承奉”的角色', candidates: g.alive(), min: 0, max: 1 }))[0] || p;
      const cf = getSkill('chengfeng');
      if (cf && !effSkills(a).some(s => s.id === 'chengfeng')) a.skills.push(cf);
      if (a.lord && !effSkills(a).some(s => s.id === 'tongyin')) {
        const ty = getSkill('tongyin');
        if (ty) a.skills.push(ty);
      }
      a.flags.kuangzuo = a.flags.kuangzuo || [];
      a.marks = a.marks || {};
      const rest = g.alive().filter(q => q !== a);
      let b = null;
      if (rest.length) b = (await ctx.ask.targets(p, { prompt: '【匡祚】：选择上缴牌的角色', candidates: rest, min: 0, max: 1 }))[0] || rest[0];
      if (b) {
        const pool = [...b.hand, ...Object.values(b.equips).filter(Boolean)];
        for (const s of ['spade', 'heart', 'club', 'diamond']) {
          const c = pool.find(x => x.suit === s && !a.flags.kuangzuo.includes(x));
          if (c) {
            await ctx.gain(a, [c], { from: b, reason: 'kuangzuo', toHand: false });
            a.flags.kuangzuo.push(c);
          }
        }
      }
      a.marks.kuangzuo = a.flags.kuangzuo.length;
      await ctx.log(`【匡祚】：${a.name} 获得“承奉”，武将牌上置 ${a.flags.kuangzuo.length} 张“匡祚”`);
    },
  },
});

// ==================================================================
// 限定专属 · 曹婴
// ==================================================================

// 凌人：出牌阶段限一次，当你使用【杀】或伤害类锦囊牌指定目标后，你可以猜测其中一名目标的手牌
// 是否有基本牌、锦囊牌或装备牌。至少猜对一项则此牌对其伤害 +1；至少猜对两项则你摸两张牌；
// 猜对三项则你获得“奸雄”和“行殇”直到你的下回合开始。
defineSkill({
  id: 'lingren', name: '凌人',
  desc: '出牌阶段限一次，当你使用【杀】或伤害类锦囊牌指定其他角色为目标后，你可以猜测其中一个目标的手牌是否有基本牌、锦囊牌或装备牌。至少猜对一项则此牌对其伤害 +1；至少猜对两项则你摸两张牌；猜对三项则你获得“奸雄”和“行殇”直到你下回合开始。',
  triggers: [
    {
      on: 'target.after', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player;
        if (d.self !== p || !p.alive || !d.target || d.target === p) return false;
        if (!isDamageCard(d.card?.name)) return false;
        return p.flags.lingrenTurn !== d.game.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.target, card = ctx.data.card;
        p.flags.lingrenTurn = g.turnCount;
        const has = {
          basic: t.hand.some(c => typeOf(c) === 'basic'),
          trick: t.hand.some(c => typeOf(c) === 'trick'),
          equip: t.hand.some(c => typeOf(c) === 'equip'),
        };
        let right = 0;
        for (const [k, label] of [['basic', '基本牌'], ['trick', '锦囊牌'], ['equip', '装备牌']]) {
          const yes = await ctx.ask.confirm(p, `【凌人】：猜测 ${t.name} 手牌中有${label}？`);
          if (!!yes === has[k]) right += 1;
        }
        if (right >= 1) {
          card.__lingren = card.__lingren || {};
          card.__lingren[t.seat] = (card.__lingren[t.seat] || 0) + 1;
        }
        if (right >= 2) await ctx.draw(p, 2, { reason: 'lingren' });
        if (right >= 3) {
          const granted = [];
          for (const id of ['jianxiong', 'xingshang']) {
            const sk = getSkill(id);
            if (sk && !effSkills(p).some(s => s.id === id)) { p.skills.push(sk); granted.push(sk.name); }
          }
          p.flags.lingrenUntil = g.turnCount + Math.max(1, g.players.length);
          p.flags.lingrenGranted = ['jianxiong', 'xingshang'];
          if (granted.length) await ctx.log(`【凌人】：获得【${granted.join('】【')}】直到你的下回合开始`);
        }
        await ctx.log(`【凌人】：猜对 ${right} 项（${t.name}）`);
      },
    },
    {
      // 此牌对其伤害 +1
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => !!(d.card && d.card.__lingren && d.card.__lingren[d.to?.seat]) && d.from === d.player,
      async effect(ctx) {
        const d = ctx.data;
        const n = d.card.__lingren[d.to.seat] || 0;
        delete d.card.__lingren[d.to.seat];
        d.amount += n;
        await ctx.log(`【凌人】：此牌对 ${d.to.name} 伤害 +${n}`);
      },
    },
    {
      // 收回临时技能
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player && (d.player.flags.lingrenUntil || 0) > 0
        && d.game.turnCount >= d.player.flags.lingrenUntil,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.lingrenUntil = 0;
        await ctx.game.removeSkills(p, (p.flags.lingrenGranted || []).slice());   // ★统一出口（SG030 A2）
        p.flags.lingrenGranted = [];
        await ctx.log('【凌人】：临时获得的技能已收回');
      },
    },
  ],
});

// 伏间：锁定技，结束阶段，若全场角色均有手牌，你随机观看一名其他角色的 X 张手牌
// （X 为全场手牌数最少的角色的手牌数）。
defineSkill({
  id: 'fujian', name: '伏间',
  desc: '锁定技，结束阶段，若全场角色均有手牌，你随机观看一名其他角色的 X 张手牌（X 为全场手牌数最少的角色的手牌数）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'end' && d.self === d.player
      && d.game.alive().length > 1 && d.game.alive().every(q => q.hand.length > 0),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const others = g.alive().filter(q => q !== p);
      if (!others.length) return;
      const x = Math.min(...g.alive().map(q => q.hand.length));
      const t = g.rng.pick(others);
      const shown = t.hand.slice(0, Math.min(x, t.hand.length));
      await ctx.log(`【伏间】：随机观看 ${t.name} 的 ${shown.length} 张手牌（${shown.map(cardLabel).join('、')}）`);
    },
  }],
});

// ==================================================================
// 限定专属 · 曹纯
// ==================================================================

// 缮甲：出牌阶段开始时，你可以摸三张牌，然后弃置三张牌（本局游戏你每失去过一张装备区里的牌，
// 便少弃置一张），若你没有以此法弃置基本牌或锦囊牌，可视为使用一张【杀】（不计入次数限制）。
defineSkill({
  id: 'shanjia', name: '缮甲',
  desc: '出牌阶段开始时，你可以摸三张牌，然后弃置三张牌（本局游戏你每失去过一张装备区里的牌，便少弃置一张），若你没有以此法弃置基本牌或锦囊牌，可视为使用一张【杀】（不计入次数限制）。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        await ctx.draw(p, 3, { reason: 'shanjia' });
        const k = Math.max(0, 3 - (p.flags.shanjiaLost || 0));
        let discarded = [];
        if (k > 0 && p.hand.length) {
          discarded = await g.chooseSomeCards(p, p.hand.slice(), Math.min(k, p.hand.length),
            { prompt: `【缮甲】：弃置 ${Math.min(k, p.hand.length)} 张牌`, optional: false });
        }
        if (discarded.length) await ctx.discard(p, discarded, { reason: 'shanjia' });
        const bad = discarded.some(c => typeOf(c) === 'basic' || typeOf(c) === 'trick');
        await ctx.log(`【缮甲】：摸三张牌，弃置 ${discarded.length} 张牌（少弃 ${p.flags.shanjiaLost || 0} 张）`);
        if (bad) return;
        const cands = g.alive().filter(q => q !== p && g.inAttackRange(p, q));
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【缮甲】：视为使用一张【杀】（不计入次数）', candidates: cands, min: 0, max: 1 }))[0];
        if (t) {
          await g.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'shanjia', ignoreShaLimit: true });
        }
      },
    },
    {
      on: 'equip.lose', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { ctx.self.flags.shanjiaLost = (ctx.self.flags.shanjiaLost || 0) + 1; },
    },
  ],
});

// ==================================================================
// 限定专属 · 赵襄
// ==================================================================

// 芳魂：当你使用【杀】指定目标后或成为【杀】的目标后，你获得 1 个“梅影”标记；
// 你可以移去 1 个“梅影”标记来发动“龙胆”并摸一张牌。
defineSkill({
  id: 'fanghun', name: '芳魂',
  desc: '当你使用【杀】指定目标后或成为【杀】的目标后，你获得 1 个“梅影”标记；你可以移去 1 个“梅影”标记来发动“龙胆”并摸一张牌。',
  triggers: [
    {
      on: 'target.after', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player;
        if (!p || !p.alive || d.card?.name !== 'sha') return false;
        return d.self === p || d.target === p;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (!p.flags.meiyingTurn || p.flags.meiyingTurn.turn !== g.turnCount) p.flags.meiyingTurn = { turn: g.turnCount, n: 0 };
        p.marks = p.marks || {};
        p.marks.meiying = (p.marks.meiying || 0) + 1;
        p.flags.meiyingTurn.n += 1;
        await ctx.log(`【芳魂】：获得 1 个“梅影”（${p.marks.meiying}）`);
      },
    },
    {
      // 移去“梅影”发动【龙胆】
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.card?.__fanghun,
      async effect(ctx) {
        const p = ctx.self;
        p.marks = p.marks || {};
        p.marks.meiying = Math.max(0, (p.marks.meiying || 0) - 1);
        p.flags.fanghunDraw = true;
        await ctx.log(`【芳魂】：移去 1 个“梅影”发动【龙胆】（剩余 ${p.marks.meiying}）`);
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.player.flags.fanghunDraw,
      async effect(ctx) {
        ctx.self.flags.fanghunDraw = false;
        await ctx.draw(ctx.self, 1, { reason: 'fanghun' });
        await ctx.log('【芳魂】：发动【龙胆】后摸一张牌');
      },
    },
  ],
});

// 扶汉：限定技，回合开始时，若你有“梅影”，你可以移去所有“梅影”标记并摸等量的牌，
// 然后从 X 张蜀势力武将牌中选择并获得至多两个技能（限定技、觉醒技、主公技除外）。
// 若此时你是体力值最低的角色，你回复 1 点体力。
defineSkill({
  id: 'fuhan', name: '扶汉',
  desc: '限定技，回合开始时，若你有“梅影”，你可以移去所有“梅影”标记并摸等量的牌，然后从 X 张（X 为存活人数且至少为 4）蜀势力武将牌中选择并获得至多两个技能（限定技、觉醒技、主公技除外）。若此时你是体力值最低的角色，你回复 1 点体力。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: true,
    filter: (d) => d.self === d.player && !d.player.flags.fuhanUsed && (d.player.marks?.meiying || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.fuhanUsed = true;
      const n = p.marks?.meiying || 0;
      p.marks.meiying = 0;
      if (n > 0) await ctx.draw(p, n, { reason: 'fuhan' });
      // 蜀势力武将技能池（排除限定技 / 觉醒技 / 主公技）
      const pool = [];
      for (const gd of GENERALS) {
        if (gd.kingdom !== 'shu' || gd.pack === 'xinghe') continue;
        for (const sid of effSkills(gd) || []) {
          if (pool.includes(sid)) continue;
          if (effSkills(p).some(s => s.id === sid)) continue;
          const sk = getSkill(sid);
          if (!sk || sk.fallbackOf) continue;
          if (/限定技|觉醒技|主公技/.test(sk.desc || '')) continue;
          pool.push(sid);
        }
      }
      const took = [];
      for (let i = 0; i < 2; i++) {
        if (!pool.length) break;
        const opts = pool.slice(0, 8).map(sid => `${getSkill(sid)?.name || sid}`);
        const idx = await ctx.ask.choose(p, opts, { prompt: `【扶汉】：选择获得第 ${i + 1} 个技能（至多两个）`, reason: 'fuhan' });
        if (idx < 0) break;
        const sid = pool.splice(idx, 1)[0];
        const sk = getSkill(sid);
        if (sk) { p.skills.push(sk); took.push(sk.name); }
      }
      if (took.length) await ctx.log(`【扶汉】：移去 ${n} 个“梅影”并摸 ${n} 张牌，获得【${took.join('】【')}】`);
      const minHp = Math.min(...g.alive().map(q => q.hp));
      if (p.alive && p.hp <= minHp) {
        await ctx.recover(p, 1, { reason: 'fuhan' });
        await ctx.log('【扶汉】：你是体力值最低的角色，回复 1 点体力');
      }
    },
  }],
});

// ==================================================================
// 限定专属 · 鲍三娘
// ==================================================================

// 姝勇：当你使用或打出【杀】时，你可以获得一名其他角色区域内的一张牌，然后其摸一张牌。
defineSkill({
  id: 'shuyong', name: '姝勇',
  desc: '当你使用或打出【杀】时，你可以获得一名其他角色区域内的一张牌，若如此做，其摸一张牌。',
  triggers: [{
    on: 'card.use.before', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.effName === 'sha'
      && d.game.alive().some(q => q !== d.player && (q.hand.length || Object.values(q.equips).some(Boolean) || (q.judgeZone || []).length)),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(q => q !== p
        && (q.hand.length || Object.values(q.equips).some(Boolean) || (q.judgeZone || []).length));
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【姝勇】：选择一名其他角色', candidates: cands, min: 0, max: 1 }))[0];
      if (!t) return;
      const c = await g.chooseCardFrom(p, t, { reason: 'shuyong' });
      if (!c) return;
      await ctx.gain(p, [c], { from: t, reason: 'shuyong' });
      await ctx.draw(t, 1, { reason: 'shuyong' });
      await ctx.log(`【姝勇】：获得 ${t.name} 的一张牌，其摸一张牌`);
    },
  }],
});

// 许身：限定技，出牌阶段，你可以失去等同场上存活男性角色数的体力值；
// 若你因此进入濒死状态，则你脱离濒死状态后，你可令使你脱离濒死的角色获得“武圣”和“当先”。
defineSkill({
  id: 'xushen', name: '许身',
  desc: '限定技，出牌阶段，你可以失去等同场上存活男性角色数的体力值；若你因此进入濒死状态，则你脱离濒死状态后，你可令使你脱离濒死的角色获得“武圣”（你可以将一张红色牌当【杀】使用或打出）和“当先”（锁定技，回合开始时，你执行一个额外的出牌阶段）。',
  active: {
    prompt: '限定技：失去等同存活男性角色数的体力值',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.xushenUsed) { await ctx.log('【许身】：限定技已发动过'); return; }
      p.flags.xushenUsed = true;
      const males = g.alive().filter(q => q.gender === 'male').length;
      const x = Math.max(1, males);
      await ctx.log(`【许身】：失去 ${x} 点体力（存活男性角色 ${males}）`);
      await ctx.loseHp(p, x, { reason: 'xushen' });
      if (!p.alive) return;
      const cands = g.alive().filter(q => q !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【许身】：令使你脱离濒死的角色获得“武圣”和“当先”', candidates: cands, min: 0, max: 1 }))[0];
      if (!t) return;
      const got = [];
      for (const id of ['wusheng', 'dangxian']) {
        const sk = getSkill(id);
        if (sk && !effSkills(t).some(s => s.id === id)) { t.skills.push(sk); got.push(sk.name); }
      }
      if (got.length) await ctx.log(`【许身】：${t.name} 获得【${got.join('】【')}】`);
    },
  },
});

// 镇南：当一张牌指定多个目标后，若你为此牌目标之一且此牌指定目标数大于使用者当前体力值，
// 则你可以弃置一张牌，对此牌使用者造成 1 点伤害。
defineSkill({
  id: 'zhennan', name: '镇南',
  desc: '当一张牌指定多个目标后，若你为此牌目标之一且此牌指定目标数大于使用者当前体力值，则你可以弃置一张牌，对此牌使用者造成 1 点伤害。',
  triggers: [{
    on: 'card.use.before', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player, from = d.self;
      if (!p || !p.alive || !from || from === p) return false;
      const tg = d.targets || [];
      if (tg.length < 2 || !tg.includes(p)) return false;
      return tg.length > Math.max(1, from.hp);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, from = ctx.data.self;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) return;
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【镇南】：弃置一张牌，对该牌使用者造成 1 点伤害', optional: false });
      if (!picks.length) return;
      await ctx.discard(p, picks, { reason: 'zhennan' });
      await ctx.damage({ from: p, to: from, amount: 1, reason: 'zhennan' });
      await ctx.log(`【镇南】：弃置一张牌，对 ${from.name} 造成 1 点伤害`);
    },
  }],
});

// ==================================================================
// 限定专属 · 关索
// ==================================================================

// 征南：当其他角色死亡后，你可以选择一项：1.摸三张牌；2.获得“武圣”、“当先”或“制蛮”中的一个。
defineSkill({
  id: 'zhengnan2', name: '征南',
  desc: '当其他角色死亡后，你可以选择一项：1.摸三张牌；2.获得“武圣”、“当先”或“制蛮”中的一个。',
  triggers: [{
    on: 'death.after', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && d.player.alive,
    async effect(ctx) {
      const p = ctx.self;
      const idx = await ctx.ask.choose(p, ['摸三张牌', '获得“武圣”、“当先”或“制蛮”中的一个'], { prompt: '【征南】：选择一项', reason: 'zhengnan2' });
      if (idx <= 0) {
        await ctx.draw(p, 3, { reason: 'zhengnan2' });
        await ctx.log('【征南】：摸三张牌');
        return;
      }
      const opts = ['wusheng', 'dangxian', 'zhiman'].filter(id => {
        const sk = getSkill(id);
        return sk && !effSkills(p).some(s => s.id === id);
      });
      if (!opts.length) { await ctx.draw(p, 3, { reason: 'zhengnan2' }); return; }
      const k = await ctx.ask.choose(p, opts.map(id => getSkill(id).name), { prompt: '【征南】：获得一个技能', reason: 'zhengnan2' });
      const sid = opts[Math.max(0, k)] || opts[0];
      const sk = getSkill(sid);
      if (sk) {
        p.skills.push(sk);
        await ctx.log(`【征南】：获得【${sk.name}】`);
      }
    },
  }],
});

// 撷芳：锁定技，你计算与其他角色的距离 -X（X 为场上女性角色数）。
defineSkill({
  id: 'xiefang2', name: '撷芳',
  desc: '锁定技，你计算与其他角色的距离 -X（X 为场上女性角色数）。',
  triggers: [{
    on: 'distance.calc', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    // distance.calc 走同步分发（triggerSync），必须是同步 effect
    effect(ctx) {
      const n = ctx.game.alive().filter(q => q.gender === 'female').length;
      if (n > 0) ctx.data.value -= n;
    },
  }],
});

// ==================================================================
// 限定专属 · 文鸯（魏势力形态：椎锋；吴势力形态：冲坚）
// ==================================================================

// 却敌：每回合限一次，当你使用【杀】或【决斗】指定唯一目标后，你可以选择一项：
// 1.获得其一张手牌；2.弃置一张基本牌，然后此【杀】或【决斗】伤害 +1；
// 3.背水：你减 1 点体力上限，依次执行两项。
defineSkill({
  id: 'quedi', name: '却敌',
  desc: '每回合限一次，当你使用【杀】或【决斗】指定唯一目标后，你可以选择一项：1.获得其一张手牌；2.弃置一张基本牌，然后此【杀】或【决斗】伤害 +1；3.背水：你减 1 点体力上限，依次执行两项。',
  triggers: [{
    on: 'target.after', who: 'self', optional: true,
    filter: (d) => {
      const p = d.player;
      if (d.self !== p || !p.alive || !d.target || d.target === p) return false;
      const n = d.card?.name;
      if (n !== 'sha' && n !== 'juedou') return false;
      const used = p.flags.quediTurn === d.game.turnCount ? (p.flags.quediCount || 0) : 0;
      return used < 1 + (p.flags.quediExtra || 0);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.target, card = ctx.data.card;
      const used0 = p.flags.quediTurn === g.turnCount ? (p.flags.quediCount || 0) : 0;
      p.flags.quediTurn = g.turnCount;
      p.flags.quediCount = used0 + 1;
      const idx = await ctx.ask.choose(p, ['获得其一张手牌', '弃置一张基本牌，此牌伤害 +1', '背水：减 1 点体力上限，依次执行两项'],
        { prompt: `【却敌】：对 ${t.name} 使用${card.name === 'sha' ? '【杀】' : '【决斗】'}，选择一项`, reason: 'quedi' });
      const doGain = async () => {
        if (!t.hand.length) { await ctx.log(`【却敌】：${t.name} 没有手牌`); return; }
        const c = t.hand[g.rng.int(t.hand.length)];
        await ctx.gain(p, [c], { from: t, reason: 'quedi' });
        await ctx.log(`【却敌】：获得 ${t.name} 的一张手牌`);
      };
      const doBoost = async () => {
        const basics = p.hand.filter(c => typeOf(c) === 'basic');
        if (!basics.length) { await ctx.log('【却敌】：没有基本牌可弃'); return; }
        const picks = await g.chooseSomeCards(p, basics, 1, { prompt: '【却敌】：弃置一张基本牌，令此牌伤害 +1', optional: false });
        if (!picks.length) return;
        await ctx.discard(p, picks, { reason: 'quedi' });
        card.__quedi = card.__quedi || {};
        card.__quedi[t.seat] = (card.__quedi[t.seat] || 0) + 1;
        await ctx.log('【却敌】：此牌伤害 +1');
      };
      if (idx === 0) await doGain();
      else if (idx === 1) await doBoost();
      else {
        p.maxHp = Math.max(1, p.maxHp - 1);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
        await ctx.log(`【却敌·背水】：减 1 点体力上限（${p.maxHp}）`);
        await doGain();
        await doBoost();
      }
    },
  }, {
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => !!(d.card && d.card.__quedi && d.card.__quedi[d.to?.seat]) && d.from === d.player,
    async effect(ctx) {
      const d = ctx.data;
      const n = d.card.__quedi[d.to.seat] || 0;
      delete d.card.__quedi[d.to.seat];
      d.amount += n;
    },
  }],
});

// 仇决：锁定技，当你杀死其他角色后，你加 1 点体力上限，摸两张牌，
// 然后本回合可以多发动一次【却敌】。
defineSkill({
  id: 'choujue', name: '仇决',
  desc: '锁定技，当你杀死其他角色后，你加 1 点体力上限，摸两张牌，然后本回合可以多发动一次【却敌】。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      ctx.self.flags.quediExtra = 0;
      ctx.self.flags.quediCount = 0;
      ctx.self.flags.quediTurn = 0;
    },
  }, {
    on: 'death.after', who: 'any', optional: false,
    filter: (d) => d.killer === d.player && d.player.alive,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.maxHp += 1;
      p.flags.quediExtra = (p.flags.quediExtra || 0) + 1;
      if (p.flags.quediTurn === g.turnCount) p.flags.quediCount = Math.max(0, (p.flags.quediCount || 1) - 1);
      await ctx.draw(p, 2, { reason: 'choujue' });
      await ctx.log(`【仇决】：体力上限 +1（${p.maxHp}），摸两张牌，本回合可多发动一次【却敌】`);
    },
  }],
});

// 椎锋：魏势力技，出牌阶段限两次，你可以失去 1 点体力，视为使用一张【决斗】。
defineSkill({
  id: 'zhuifeng', name: '椎锋',
  desc: '魏势力技，出牌阶段限两次，你可以失去 1 点体力，并视为使用一张无距离限制的【决斗】。',
  kingdomOnly: 'wei',
  active: {
    prompt: '魏势力技：失去 1 点体力，视为使用一张【决斗】（出牌阶段限两次）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const key = `act_zhuifeng`;
      const cnt = p.flags[key] === g.turnCount ? (p.flags.zhuifengCount || 0) : 0;
      if (cnt >= 2) { await ctx.log('【椎锋】：本阶段已发动两次'); return; }
      p.flags.zhuifengCount = cnt + 1;
      p.flags[key] = g.turnCount;
      const cands = g.alive().filter(q => q !== p);
      if (!cands.length) return;
      await ctx.loseHp(p, 1, { reason: 'zhuifeng' });
      if (!p.alive) return;
      const t = (await ctx.ask.targets(p, { prompt: '【椎锋】：视为使用一张【决斗】的目标', candidates: cands, min: 0, max: 1 }))[0];
      if (!t) return;
      await g.useCard({ from: p, card: vcard('juedou', 'trick'), targets: [t], reason: 'zhuifeng' });
      await ctx.log(`【椎锋】：对 ${t.name} 使用【决斗】（本阶段第 ${p.flags.zhuifengCount} 次）`);
    },
  },
});

// 冲坚：吴势力技，你可以将一张装备牌当【酒】或无距离限制且无视防具的【杀】使用。
// 以此法使用的【杀】造成伤害后，你获得目标装备区里的 X 张牌（X 为伤害值）。
defineSkill({
  id: 'chongjian', name: '冲坚',
  desc: '吴势力技，你可以将一张装备牌当【酒】或无距离限制且无视防具的任意【杀】使用。当你以此法使用的【杀】对其他角色造成伤害后，你获得其装备区里的 X 张牌（X 为此【杀】对其造成的伤害值）。',
  kingdomOnly: 'wu',
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => d.from === d.player && !!d.card?.__chongjian && d.to && d.to !== d.player && d.to.alive,
    async effect(ctx) {
      const p = ctx.self, d = ctx.data;
      const n = Math.max(0, d.amount || 0);
      const pool = Object.values(d.to.equips).filter(Boolean).slice(0, n);
      if (!pool.length) return;
      await ctx.gain(p, pool, { from: d.to, reason: 'chongjian' });
      await ctx.log(`【冲坚】：获得 ${d.to.name} 装备区的 ${pool.length} 张牌`);
    },
  }],
});

// ==================================================================
// 限定专属 · 王双
// ==================================================================

// 追猎（锁定技）：你使用【杀】无距离限制；当你使用【杀】指定攻击范围外的角色为目标后，
// 此【杀】不计次数且你进行判定，若结果为武器牌或坐骑牌，此【杀】伤害值增加至其体力值；
// 若为其他结果，你失去 1 点体力。
defineSkill({
  id: 'zhulie', name: '追猎',
  desc: '锁定技，你使用【杀】无距离限制；当你使用【杀】指定攻击范围外的角色为目标后，此【杀】不计次数且你进行判定：若结果为武器牌或坐骑牌，此【杀】伤害值增加至其体力值；若为其他结果，你失去 1 点体力。',
  triggers: [
    {
      // 使用【杀】无距离限制
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { ctx.self.flags.freeRangeTurn = ctx.game.turnCount; },
    },
    {
      on: 'target.after', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player;
        if (d.self !== p || !p.alive || d.card?.name !== 'sha') return false;
        return d.target !== p && !d.game.inAttackRange(p, d.target);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.target, card = ctx.data.card;
        card.__zhulieFree = true;
        const j = await ctx.judge(p, { reason: '追猎' });
        const sub = CARD_META[j.card?.name]?.sub;
        if (sub === 'weapon' || sub === 'horse+' || sub === 'horse-') {
          card.__zhulieSeat = t.seat;
          await ctx.log(`【追猎】：判定为武器或坐骑牌，此【杀】伤害值增加至 ${t.hp}`);
        } else {
          await ctx.log('【追猎】：判定不为武器或坐骑牌，失去 1 点体力');
          await ctx.loseHp(p, 1, { reason: 'zhulie' });
        }
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => !!d.card && d.card.__zhulieSeat === d.to?.seat && d.player === d.from,
      async effect(ctx) {
        const d = ctx.data;
        delete d.card.__zhulieSeat;
        d.amount = Math.max(d.amount, d.to.hp);
        await ctx.log(`【追猎】：此【杀】伤害值增加至 ${d.to.hp}`);
      },
    },
    {
      // 此【杀】不计入次数
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.card?.__zhulieFree,
      async effect(ctx) {
        const c = ctx.data.card;
        delete c.__zhulieFree;
        ctx.self.flags.shaUsed = Math.max(0, (ctx.self.flags.shaUsed || 0) - 1);
      },
    },
  ],
});
