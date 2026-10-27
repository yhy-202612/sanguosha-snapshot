// 卢植（神话再临·阴补完）：明任 / 贞良（转换技）
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, suitOf, isRedFor } from '../engine/cards.js';

const isRed = (player, card) => isRedFor(player, card);

// 取「任」的牌对象（存于 flags.renCard，不在手牌/装备区）
const renOf = (p) => (p.flags.renCard && p.flags.renCard.name ? p.flags.renCard : null);
const renColor = (p) => { const c = renOf(p); return c ? (isRed(p, c) ? 'red' : 'black') : null; };
const renType = (p) => { const c = renOf(p); return c ? (CARD_META[c.name]?.type || 'other') : null; };

async function putRen(ctx, p, card) {
  const old = renOf(p);
  const i = p.hand.indexOf(card);
  if (i >= 0) p.hand.splice(i, 1);
  p.flags.renCard = card;
  if (!p.marks) p.marks = {};
  p.marks.ren = cardLabel(card);
  if (old) p.hand.push(old);
  await ctx.log(`【明任】：将 ${cardLabel(card)} 置于武将牌上作为「任」${old ? `（收回 ${cardLabel(old)}）` : ''}`);
}

defineSkill({
  id: 'mingren', name: '明任',
  desc: '游戏开始时，你摸一张牌，然后将一张手牌置于你的武将牌上，称为「任」。结束阶段，你可以用手牌替换「任」。',
  triggers: [
    {
      on: 'game.start', who: 'any', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        await ctx.draw(p, 1, { reason: 'mingren' });
        if (!p.hand.length) return;
        const res = await ctx.game.ask(p, 'card', {
          prompt: '【明任】：选择一张手牌作为「任」', cards: p.hand.map(c => c.id), optional: true, reason: 'mingren',
        });
        const card = p.hand.find(c => c.id === (res?.cardId || res?.id)) || p.hand[0];
        if (card) await putRen(ctx, p, card);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'end' && !!renOf(d.self) && d.self.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self;
        const res = await ctx.game.ask(p, 'card', {
          prompt: '【明任】：选择一张手牌替换「任」', cards: p.hand.map(c => c.id), optional: true, reason: 'mingren',
        });
        const card = p.hand.find(c => c.id === (res?.cardId || res?.id));
        if (card) await putRen(ctx, p, card);
      },
    },
  ],
});

// 贞良（转换技）：阳 —— 出牌阶段限一次，弃 X 张与「任」同色的牌，对攻击范围内一名角色造成 1 点伤害（X=体力差，至少 1）；
// 阴 —— 回合外你使用/打出的牌进入弃牌堆时，若与「任」类别相同，可令一名角色摸一张牌。
defineSkill({
  id: 'zhenliang', name: '贞良',
  desc: '转换技。阳：出牌阶段限一次，你可以弃置 X 张与「任」颜色相同的牌，对攻击范围内的一名其他角色造成 1 点伤害（X 为你与其体力值之差，至少 1）。阴：你的回合外，当你使用或打出的牌进入弃牌堆时，若此牌与「任」类别相同，你可以令一名角色摸一张牌。',
  active: {
    perPhase: true,
    prompt: '转换技·阳：弃 X 张与「任」同色的牌，对攻击范围内角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.zhenliangSide === 'yin') { await ctx.log('【贞良】：当前为阴面，需回合外触发'); return; }
      const ren = renOf(p);
      if (!ren) { await ctx.log('【贞良】：没有「任」'); return; }
      const color = renColor(p);
      const pool = p.hand.filter(c => (isRed(p, c) ? 'red' : 'black') === color);
      const cands = g.alive().filter(x => x !== p && g.inAttackRange(p, x));
      if (!pool.length || !cands.length) { await ctx.log('【贞良】：条件不足（同色牌或目标）'); return; }
      const t = (await ctx.ask.targets(p, {
        min: 1, max: 1, candidates: cands, prompt: '【贞良】：选择攻击范围内的一名其他角色',
      }))[0];
      if (!t) return;
      const x = Math.max(1, Math.abs(p.hp - t.hp));
      if (pool.length < x) { await ctx.log(`【贞良】：需要 ${x} 张同色牌，不足`); return; }
      const res = await g.ask(p, 'cards', {
        prompt: `【贞良】：弃置 ${x} 张与「任」同色的牌`, cards: pool.map(c => c.id),
        min: x, max: x, optional: true,
      });
      const picks = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
      if (picks.length !== x) { await ctx.log('【贞良】：未弃足牌，取消发动'); return; }
      await ctx.discard(p, picks, { reason: 'zhenliang' });
      p.flags.zhenliangSide = 'yin';
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'zhenliang' });
      await ctx.log(`【贞良】：弃置 ${x} 张同色牌，对 ${t.name} 造成 1 点伤害（转为阴）`);
    },
  },
  triggers: [{
    on: 'cards.discard', who: 'any', optional: true,
    filter: (d) => {
      if (d.self !== d.player) return false;
      if (d.game.turnPlayer === d.player) return false;          // 必须回合外
      if (d.game.phase && d.game.turnPlayer === d.player) return false;
      const rt = renType(d.player);
      if (!rt) return false;
      return (d.cards || []).some(c => (CARD_META[c.name]?.type || 'other') === rt);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, {
        min: 1, max: 1, candidates: g.alive(), prompt: '【贞良】·阴：令一名角色摸一张牌',
      }))[0];
      if (!t) return;
      await ctx.draw(t, 1, { reason: 'zhenliang' });
      p.flags.zhenliangSide = 'yang';
      await ctx.log(`【贞良】·阴：${t.name} 摸一张牌（转为阳）`);
    },
  }],
});

export const YIN3_SKILL_IDS = ['mingren', 'zhenliang'];
