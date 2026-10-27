// 原创之魂·2016（补全 3 将）技能实现
// 数据见 src/data/yz2016.js；技能 id 前缀 `yz16_`
// 口径：官方原文；引擎不支持的机制在 desc 内以「实现：」注明降级方式
import { defineSkill } from '../engine/skill.js';
import { cardLabel } from '../engine/cards.js';

const SUIT_CN = { spade: '黑桃', heart: '红桃', club: '梅花', diamond: '方块', none: '无色' };
const others = (g, p) => g.alive().filter((x) => x !== p);
const equipCards = (p) => Object.values(p.equips).filter(Boolean);
const allCards = (p) => [...p.hand, ...equipCards(p)];
const handLimitOf = (p) => p.hp + (p.flags?.handLimit || 0);

// ============================================================
// 岑昏（吴 3）【极奢】【链祸】
// ============================================================
// 极奢：出牌阶段，若你的手牌上限大于 0，你可以摸一张牌，然后本回合手牌上限 -1；
//       结束阶段开始时，若你没有手牌，你可以横置至多 X 名角色的武将牌（X 为你的体力值）。
defineSkill({
  id: 'yz16_jishe', name: '极奢',
  desc: '出牌阶段，若你的手牌上限大于0，你可以摸一张牌，然后本回合手牌上限-1；结束阶段开始时，若你没有手牌，你可以横置至多X名角色的武将牌（X为你的体力值）。',
  active: {
    perTurn: false,
    prompt: '极奢：摸一张牌，本回合手牌上限 -1',
    async effect(ctx) {
      const p = ctx.self;
      if (handLimitOf(p) <= 0) { await ctx.log('【极奢】：你的手牌上限不大于 0，无法发动'); return; }
      await ctx.draw(p, 1, { reason: 'jishe' });
      p.flags.handLimit = (p.flags.handLimit || 0) - 1;
      await ctx.log(`【极奢】：摸一张牌，本回合手牌上限 -1（当前 ${Math.max(0, handLimitOf(p))}）`);
    },
  },
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.player.hand.length === 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const X = Math.max(0, p.hp);
      const cands = g.alive().filter((q) => !q.chained);
      if (X <= 0 || !cands.length) { await ctx.log('【极奢】：没有可横置的角色'); return; }
      const picks = await ctx.ask.targets(p, {
        prompt: `【极奢】：至多横置 ${X} 名角色`, candidates: cands, min: 0, max: Math.min(X, cands.length),
      });
      if (!picks.length) return;
      for (const q of picks) q.chained = true;
      await ctx.log(`【极奢】：${p.name} 横置 ${picks.map((q) => q.name).join('、')} 的武将牌`);
    },
  }],
});

// 链祸：锁定技，当你受到火焰伤害时，若你处于连环状态且为传导伤害的起点，此伤害 +1。
// 实现：以「你处于连环状态 + 本伤害不是连环传导产生（reason !== 'tiesuo'）+ 场上还有其他连环角色」判定为起点。
defineSkill({
  id: 'yz16_lianhuo', name: '链祸',
  desc: '锁定技，当你受到火焰伤害时，若你处于连环状态且为传导伤害的起点，此伤害+1。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.to === d.player && d.nature === 'fire' && d.player.chained
      && d.reason !== 'tiesuo'
      && d.game.alive().some((q) => q !== d.player && q.chained),
    async effect(ctx) {
      const p = ctx.self;
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      await ctx.log(`【链祸】：${p.name} 处于连环状态且为传导起点，此火焰伤害 +1（共 ${ctx.data.amount} 点）`);
    },
  }],
});

// ============================================================
// 孙资刘放（魏 3）【瑰藻】【讥谀】
// ============================================================
// 瑰藻：若你于弃牌阶段弃置过至少两张牌且这些牌花色均不相同，你可以回复 1 点体力或摸一张牌。
defineSkill({
  id: 'yz16_guizao', name: '瑰藻',
  desc: '若你于弃牌阶段弃置过至少两张牌且这些牌花色均不相同，你可以回复1点体力或摸一张牌。',
  triggers: [
    {
      on: 'cards.discard', who: 'self', optional: false,
      filter: (d) => d.reason === 'discard' && d.game.phase === 'discard' && (d.cards || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const rec = (p.flags.yz16Guizao && p.flags.yz16Guizao.turn === g.turnCount)
          ? p.flags.yz16Guizao : { turn: g.turnCount, cards: [] };
        for (const c of ctx.data.cards) rec.cards.push({ name: c.name, suit: c.suit });
        p.flags.yz16Guizao = rec;
      },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => {
        if (d.phase !== 'discard') return false;
        const f = d.player.flags.yz16Guizao;
        if (!f || f.turn !== d.game.turnCount || f.cards.length < 2) return false;
        return new Set(f.cards.map((c) => c.suit)).size === f.cards.length;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const f = p.flags.yz16Guizao;
        const suits = f.cards.map((c) => SUIT_CN[c.suit] || '无色').join('/');
        p.flags.yz16Guizao = { turn: g.turnCount, cards: [] };
        await ctx.log(`【瑰藻】：弃牌阶段弃置 ${f.cards.length} 张牌且花色各不相同（${suits}）`);
        const canHeal = p.hp < p.maxHp;
        const idx = canHeal
          ? await ctx.ask.choose(p, ['回复 1 点体力', '摸一张牌'], { prompt: '【瑰藻】：选择一项', reason: 'guizao' })
          : 1;
        if (idx === 0 && canHeal) {
          await ctx.recover(p, 1, { reason: 'guizao' });
          await ctx.log(`【瑰藻】：${p.name} 回复 1 点体力`);
        } else {
          await ctx.draw(p, 1, { reason: 'guizao' });
          await ctx.log(`【瑰藻】：${p.name} 摸一张牌`);
        }
      },
    },
  ],
});

// 讥谀：出牌阶段每名角色限一次，若你有可使用的手牌，你可以令一名角色弃置一张手牌，
//       然后本回合你不能使用与之相同花色的牌；若其以此法弃置的牌为黑桃，其失去 1 点体力，你翻面。
// 「可使用的手牌」用引擎的 canUse / candidatesFor 真判定（不再是「你有手牌」）；
// 「每名角色限一次」按目标角色每回合各一次。
// 无法主动使用的牌（【闪】【无懈可击】）不计入「可使用的手牌」。
const playPhaseUsable = (g, p, c) => {
  if (!c) return false;
  if (c.name === 'shan' || c.name === 'wuxie') return false;
  if (g.canUse(p, c, []).ok) return true;
  const cands = g.candidatesFor(p, c);
  return Array.isArray(cands) && cands.length > 0;
};
defineSkill({
  id: 'yz16_jiyu', name: '讥谀',
  desc: '出牌阶段每名角色限一次，若你有可使用的手牌，你可以令一名角色弃置一张手牌，然后本回合你不能使用与之相同花色的牌；若其以此法弃置的牌为黑桃，其失去1点体力，你翻面。',
  active: {
    perTurn: false,
    prompt: '讥谀：令一名角色弃置一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.some((c) => playPhaseUsable(g, p, c))) {
        await ctx.log('【讥谀】：你没有可使用的手牌，无法发动');
        return;
      }
      const rec = (p.flags.yz16Jiyu && p.flags.yz16Jiyu.turn === g.turnCount)
        ? p.flags.yz16Jiyu : { turn: g.turnCount, seats: [] };
      const cands = g.alive().filter((q) => q.hand.length > 0 && !rec.seats.includes(q.seat));
      if (!cands.length) { await ctx.log('【讥谀】：本回合每名角色均已结算过，无法再发动'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【讥谀】：选择一名角色（其弃置一张手牌）', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const [c] = await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【讥谀】：弃置一张手牌' });
      if (!c) return;
      rec.seats.push(t.seat);
      p.flags.yz16Jiyu = rec;
      await ctx.discard(t, [c], { reason: 'jiyu' });
      p.flags.yz16JiyuSuit = { turn: g.turnCount, suit: c.suit };
      await ctx.log(`【讥谀】：${t.name} 弃置 ${cardLabel(c)}，${p.name} 本回合不能使用${SUIT_CN[c.suit] || '无色'}牌`);
      if (c.suit === 'spade') {
        await ctx.loseHp(t, 1, { reason: 'jiyu' });
        await ctx.flip(p);
        await ctx.log(`【讥谀】：弃置的是黑桃，${t.name} 失去 1 点体力，${p.name} 翻面`);
      }
    },
  },
  triggers: [{
    on: 'card.use.before', who: 'self', optional: false,
    filter: (d) => {
      const f = d.player.flags.yz16JiyuSuit;
      return !!f && f.turn === d.game.turnCount;
    },
    async effect(ctx) {
      const f = ctx.self.flags.yz16JiyuSuit;
      const c = ctx.data.card;
      if (!f || !c || !c.suit || c.suit === 'none') return;
      if (c.suit !== f.suit) return;
      ctx.data.canceled = true;
      await ctx.log(`【讥谀】：本回合不能使用${SUIT_CN[f.suit]}牌，${cardLabel(c)} 使用被取消`);
    },
  }],
});

// ============================================================
// 黄皓（蜀 3）【寝情】【贿生】
// ============================================================
// 寝情：结束阶段开始时，你可以弃置攻击范围内含有主公的一名其他角色一张牌，令其摸一张牌，
//       然后若其手牌数多于主公，你摸一张牌。
// 主公用 player.role === 'lord'（身份局）判定；非身份局（无 lord）时不做主公相关限制与比较。
defineSkill({
  id: 'yz16_qinqing', name: '寝情',
  desc: '结束阶段开始时，你可以弃置攻击范围内含有主公的一名其他角色一张牌，令其摸一张牌，然后若其手牌数多于主公，你摸一张牌。（无主公的对局中不限制目标、也不做手牌数比较）',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const lord = g.players.find((x) => x && x.role === 'lord' && x.alive !== false) || null;
      const cands = others(g, p).filter((q) => allCards(q).length > 0
        && (!lord || lord === q || g.inAttackRange(q, lord)));
      if (!cands.length) { await ctx.log('【寝情】：没有符合条件（攻击范围内含有主公）且有牌的其他角色'); return; }
      const t = (await ctx.ask.targets(p, {
        prompt: lord ? `【寝情】：选择一名攻击范围内含有主公（${lord.name}）的其他角色` : '【寝情】：选择一名其他角色',
        candidates: cands, min: 1, max: 1,
      }))[0];
      if (!t) return;
      const c = await g.chooseCardFrom(p, t, { reason: 'qinqing' });
      if (!c) return;
      await ctx.discard(t, [c], { reason: 'qinqing' });
      await ctx.draw(t, 1, { reason: 'qinqing' });
      await ctx.log(`【寝情】：弃置 ${t.name} 的 ${cardLabel(c)}，令其摸一张牌`);
      if (lord && t.hand.length > lord.hand.length) {
        await ctx.draw(p, 1, { reason: 'qinqing' });
        await ctx.log(`【寝情】：${t.name} 手牌数（${t.hand.length}）多于主公 ${lord.name}（${lord.hand.length}），你摸一张牌`);
      }
    },
  }],
});

// 贿生：每名角色限一次，当你受到其他角色造成的伤害时，你可以令其观看你任意张牌，然后其选择：
//       1. 获得其中一张牌并防止此伤害；2. 弃置等量张牌。
// 实现：「你任意张牌」取手牌；「每名角色限一次」按伤害来源每回合各一次。
defineSkill({
  id: 'yz16_huisheng', name: '贿生',
  desc: '每名角色限一次，当你受到其他角色造成的伤害时，你可以令其观看你任意张牌，然后其选择：1.获得其中一张牌并防止此伤害；2.弃置等量张牌。（实现：展示的牌取你的手牌）',
  triggers: [{
    on: 'damage.before', who: 'self', optional: true,
    filter: (d) => {
      if (!d.from || d.from === d.player || d.to !== d.player) return false;
      if (!d.player.hand.length) return false;
      const f = d.player.flags.yz16Huisheng;
      return !(f && f.turn === d.game.turnCount && f.seats.includes(d.from.seat));
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, src = ctx.data.from;
      const shown = [];
      while (shown.length < p.hand.length) {
        const rest = p.hand.filter((c) => !shown.includes(c));
        if (!rest.length) break;
        const yes = await ctx.ask.confirm(p, `【贿生】：是否再展示一张手牌给对方观看？（已展示 ${shown.length} 张）`);
        if (!yes) break;
        const [c] = await g.chooseSomeCards(p, rest, 1, { prompt: '【贿生】：选择要展示的牌' });
        if (!c) break;
        shown.push(c);
      }
      if (!shown.length) { await ctx.log('【贿生】：未展示任何牌，无效果'); return; }
      const rec = (p.flags.yz16Huisheng && p.flags.yz16Huisheng.turn === g.turnCount)
        ? p.flags.yz16Huisheng : { turn: g.turnCount, seats: [] };
      if (!rec.seats.includes(src.seat)) rec.seats.push(src.seat);
      p.flags.yz16Huisheng = rec;
      await g.revealCards(shown, { reason: '贿生' });
      await ctx.log(`【贿生】：${p.name} 令 ${src.name} 观看其 ${shown.length} 张牌`);
      const idx = await ctx.ask.choose(src, ['获得其中一张牌并防止此伤害', `弃置 ${shown.length} 张牌`],
        { prompt: `【贿生】：${p.name} 展示了 ${shown.length} 张牌，请选择一项`, reason: 'huisheng' });
      if (idx === 1) {
        const n = Math.min(shown.length, src.hand.length);
        if (n > 0) {
          const cards = await g.chooseSomeCards(src, src.hand.slice(), n, { prompt: `【贿生】：弃置 ${n} 张牌` });
          if (cards.length) await ctx.discard(src, cards, { reason: 'huisheng' });
          await ctx.log(`【贿生】：${src.name} 弃置 ${cards.length} 张牌`);
        } else {
          await ctx.log(`【贿生】：${src.name} 没有手牌可弃置`);
        }
        return;
      }
      const [pick] = await g.chooseSomeCards(src, shown.slice(), 1, { prompt: '【贿生】：获得其中一张牌' });
      if (!pick) { await ctx.log('【贿生】：对方放弃获得牌，伤害不防止'); return; }
      await ctx.gain(src, [pick], { from: p, reason: 'huisheng' });
      ctx.data.canceled = true;
      await ctx.log(`【贿生】：${src.name} 获得 ${cardLabel(pick)}，此伤害被防止`);
    },
  }],
});
