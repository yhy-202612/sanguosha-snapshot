// OL「闪」系列（第三批）：闪张郃（群 / 魏 双势力）
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const VC = (name, suit = 'spade', num = 7, extra = {}) => ({
  id: `vf3${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const DMG_TRICK = ['nanman', 'wansha', 'juedou', 'huogong', 'jiedao'];

// ==================== 闪张郃 · 穷途（群势力技）====================
// 群势力技，每回合限一次，你可视为使用一张【无懈可击】并摸一张牌。
// 若此【无懈可击】生效，你将被响应牌置于你的武将牌上，否则，你将势力变更至魏，并获得武将牌上的所有牌。
defineSkill({
  id: 'qiongtu', name: '穷途',
  kingdomOnly: 'qun',
  desc: '群势力技，每回合限一次，你可视为使用一张【无懈可击】并摸一张牌。若此【无懈可击】生效，你将被响应牌置于你的武将牌上，否则，你将势力变更至魏，并获得武将牌上的所有牌。',
  triggers: [{
    // 有牌可被【无懈可击】抵消时
    on: 'card.use.before', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player, g = d.game;
      if (d.self === p) return false;
      if (p.kingdom !== 'qun' || p.flags.qiongtuTurn === g.turnCount) return false;
      const m = d.card && CARD_META[d.card.name];
      return !!(m && m.type === 'trick');
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data, card = d.card;
      p.flags.qiongtuTurn = g.turnCount;
      await ctx.draw(p, 1, { reason: 'qiongtu' });
      // 视为使用【无懈可击】：抵消该锦囊，并把被响应牌置于武将牌上
      const i = d.self.hand.indexOf(card);
      if (i >= 0) d.self.hand.splice(i, 1);
      const ti = g.table.indexOf(card);
      if (ti >= 0) g.table.splice(ti, 1);
      p.flags.qiongtu = (p.flags.qiongtu || []).concat([card]);
      d.canceled = true;
      await ctx.log(`【穷途】：视为使用【无懈可击】抵消 ${cardLabel(card)}，并将其置于武将牌上（「穷途」牌 ${p.flags.qiongtu.length} 张）`);
    },
  }],
  active: {
    perTurn: true,
    prompt: '穷途：视为使用【无懈可击】并摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      await ctx.draw(p, 1, { reason: 'qiongtu' });
      const stored = p.flags.qiongtu || [];
      // 主动发动视为「无懈可击未生效」→ 势力变更至魏，并获得武将牌上的所有牌
      await g.setKingdom(p, 'wei', '穷途');
      if (stored.length) {
        await ctx.gain(p, stored.slice(), { reason: 'qiongtu' });
        p.flags.qiongtu = [];
      }
      await ctx.log(`【穷途】：此【无懈可击】未生效，势力变更至魏并收回「穷途」牌 ${stored.length} 张`);
    },
  },
});

// ==================== 闪张郃 · 先著（魏势力技）====================
// 魏势力技，出牌阶段每个类型限一次，你可弃置一张非伤害牌，视为使用一张无次数限制的【杀】。
// 若【此杀】造成伤害，你可使用本次弃置的牌。
defineSkill({
  id: 'xianzhu', name: '先著',
  kingdomOnly: 'wei',
  desc: '魏势力技，出牌阶段每个类型限一次，你可弃置一张非伤害牌，视为使用一张无次数限制的【杀】。若此【杀】造成伤害，你可使用本次弃置的牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => d.from === d.player && d.reason === 'xianzhu',
    async effect(ctx) { ctx.self.flags.xianzhuHit = true; },
  }],
  active: {
    prompt: '先著：弃置一张非伤害牌，视为使用无次数限制的【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (g.turnPlayer !== p) { await ctx.log('【先著】：仅出牌阶段可用'); return; }
      p.flags.xianzhuTypes = (p.flags.xianzhuTypes && p.flags.xianzhuTurn === g.turnCount) ? p.flags.xianzhuTypes : [];
      p.flags.xianzhuTurn = g.turnCount;
      const usable = p.hand.filter(c => {
        const m = CARD_META[c.name];
        if (!m) return false;
        if (c.name === 'sha' || DMG_TRICK.includes(c.name)) return false;
        return !p.flags.xianzhuTypes.includes(m.type);
      });
      if (!usable.length) { await ctx.log('【先著】：没有可弃置的非伤害牌（每个类型限一次）'); return; }
      const [c] = await g.chooseSomeCards(p, usable, 1, { prompt: '【先著】：弃置一张非伤害牌' });
      if (!c) return;
      p.flags.xianzhuTypes.push(CARD_META[c.name].type);
      await ctx.discard(p, [c], { reason: 'xianzhu' });
      const cs = g.alive().filter(x => x !== p);
      if (!cs.length) return;
      const tg = await ctx.ask.targets(p, { prompt: '【先著】：选择【杀】的目标', candidates: cs, min: 1, max: 1 });
      if (!tg.length) return;
      p.flags.xianzhuHit = false;
      const ok = await ctx.useCard({ from: p, card: VC('sha'), targets: tg, reason: 'xianzhu', ignoreShaLimit: true });
      await ctx.log(`【先著】：弃置 ${cardLabel(c)}，视为使用一张无次数限制的【杀】`);
      if (ok !== false && p.flags.xianzhuHit) {
        const i = g.discardPile.indexOf(c);
        if (i >= 0) g.discardPile.splice(i, 1);
        await ctx.gain(p, [c], { reason: 'xianzhu' });
        const again = await ctx.ask.confirm(p, '【先著】：是否使用本次弃置的牌？');
        if (again) {
          const tg2 = await ctx.ask.targets(p, { prompt: `【先著】：使用 ${cardLabel(c)}`, candidates: cs, min: 1, max: 1 });
          if (tg2.length) await ctx.useCard({ from: p, card: c, targets: tg2, reason: 'xianzhu' });
        }
        await ctx.log(`【先著】：此【杀】造成伤害，你收回 ${cardLabel(c)} 并可使用之`);
      }
    },
  },
});
