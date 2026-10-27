// 界限突破·风火林山（阶段 2D）：界黄忠 / 界张角 / 界荀彧 / 界魏延 / 界小乔
// 技能 id 统一 jie_ 前缀；界荀彧【驱虎】与原版一致，直接复用 quhu。
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, suitOf } from '../engine/cards.js';

async function pickHand(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  const res = await ctx.game.ask(player, 'card', {
    prompt, cards: cands.map(c => c.id), optional: true, reason: 'skill',
  });
  return cands.find(c => c.id === (res?.cardId || res?.id)) || null;
}

// ==================== 界黄忠 · 烈弓 ====================
// ①使用【杀】可把此牌点数当作可及距离（引擎侧 shaRangeByPoint）；
// ②指定目标后：手牌数 ≥ 其手牌数 → 其不能使用【闪】；体力值 ≤ 其体力值 → 此【杀】伤害 +1。
defineSkill({
  id: 'jie_liegong', name: '烈弓',
  desc: '你可以将【杀】的点数当作可及距离使用【杀】。当你使用【杀】指定目标后：若你的手牌数不小于其手牌数，该角色不能使用【闪】；若你的体力值不大于其体力值，此【杀】伤害 +1。',
  triggers: [{
    on: 'target.after', who: 'self',
    filter: (d) => !!(d.card && d.card.name === 'sha' && d.target && d.target !== d.self),
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.target, sc = ctx.data.shaCtx;
      const parts = [];
      if (p.hand.length >= t.hand.length) {
        if (sc) sc.unavoidable = true;
        parts.push(`${t.name} 不能使用【闪】`);
      }
      if (p.hp <= t.hp) {
        if (sc) {
          sc.bonusBySeat = sc.bonusBySeat || {};
          sc.bonusBySeat[t.seat] = 1;
        }
        parts.push('此【杀】伤害 +1');
      }
      if (parts.length) await ctx.log(`【烈弓】：${parts.join('；')}`);
    },
  }],
});

// ==================== 界张角 · 雷击 / 鬼道 ====================
// 雷击：使用/打出【闪】时进行判定 —— 黑桃：对一名角色 2 点雷电伤害；梅花：回复 1 点体力，然后对一名角色 1 点雷电伤害。
defineSkill({
  id: 'jie_leiji', name: '雷击',
  desc: '当你使用或打出【闪】时，你可以进行判定：若结果为黑桃，你对一名角色造成 2 点雷电伤害；若结果为梅花，你回复 1 点体力，然后对一名角色造成 1 点雷电伤害。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => !!(d.filter && d.filter.name === 'shan') && d.self.hand.some(c => c.name === 'shan'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = await pickHand(ctx, p, x => x.name === 'shan', '【雷击】：打出一张【闪】并发动雷击');
      if (!c) return;
      ctx.data.handled = true;
      ctx.data.card = c;
      const j = await ctx.judge(p, { reason: '雷击' });
      const suit = j.suit;
      if (suit !== 'spade' && suit !== 'club') {
        await ctx.log(`【雷击】：判定为${cardLabel(j.card || { suit })}，未产生效果`);
        return;
      }
      const ts = await ctx.ask.targets(p, {
        min: 1, max: 1, candidates: g.alive(), prompt: '【雷击】：选择一名角色',
      });
      if (!ts.length) return;
      const t = ts[0];
      if (suit === 'spade') {
        await ctx.log(`【雷击】：判定为黑桃，对 ${t.name} 造成 2 点雷电伤害`);
        await ctx.damage({ from: p, to: t, amount: 2, nature: 'thunder', reason: 'jie_leiji' });
      } else {
        await ctx.recover(p, 1, { reason: 'jie_leiji' });
        await ctx.log(`【雷击】：判定为梅花，${p.name} 回复 1 点体力，然后对 ${t.name} 造成 1 点雷电伤害`);
        await ctx.damage({ from: p, to: t, amount: 1, nature: 'thunder', reason: 'jie_leiji' });
      }
    },
  }],
});

// 鬼道：判定牌生效前打出黑色牌替换；若替换牌为黑桃 2~9，摸一张牌。
defineSkill({
  id: 'jie_guidao', name: '鬼道',
  desc: '当一名角色的判定牌生效前，你可以打出一张黑色牌替换之。若你打出的牌为黑桃 2~9，你摸一张牌。',
  triggers: [{
    on: 'judge.before', who: 'any', optional: true,
    filter: (d) => !!d.self && d.self.alive !== false
      && d.player.hand.some(c => suitOf(d.player, c) === 'spade' || suitOf(d.player, c) === 'club'),
    async effect(ctx) {
      const p = ctx.self;
      const c = await pickHand(ctx, p,
        x => suitOf(p, x) === 'spade' || suitOf(p, x) === 'club',
        '【鬼道】：打出一张黑色牌替换判定牌');
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'jie_guidao' });
      ctx.data.suit = suitOf(p, c);
      ctx.data.num = c.num;
      ctx.data.card = c;
      await ctx.log(`${p.name} 发动【鬼道】，判定改为 ${cardLabel(c)}`);
      if (suitOf(p, c) === 'spade' && c.num >= 2 && c.num <= 9) {
        await ctx.draw(p, 1, { reason: 'jie_guidao' });
        await ctx.log('【鬼道】：替换牌为黑桃 2~9，摸一张牌');
      }
    },
  }],
});

// ==================== 界荀彧 · 节命 ====================
// 受伤后或死亡时：令一名角色摸 X 张，然后将手牌弃至 X 张（X 为其体力上限且至多 5）。
async function jiemingEffect(ctx) {
  const p = ctx.self, g = ctx.game;
  const t = (await ctx.ask.targets(p, {
    min: 1, max: 1, candidates: g.alive(), prompt: '【节命】：选择一名角色',
  }))[0];
  if (!t) return;
  const x = Math.min(5, t.maxHp);
  const need = Math.max(0, x - t.hand.length);
  if (need) await ctx.draw(t, need, { reason: 'jie_jieming' });
  if (t.hand.length > x) {
    const drop = t.hand.length - x;
    const res = await g.ask(t, 'cards', {
      prompt: `【节命】：手牌需弃至 ${x} 张`, cards: t.hand.map(c => c.id),
      min: drop, max: drop, optional: false,
    });
    const picks = (res?.cardIds || []).map(id => t.hand.find(c => c.id === id)).filter(Boolean);
    if (picks.length) await ctx.discard(t, picks, { reason: 'jie_jieming' });
  }
  await ctx.log(`【节命】：${t.name} 摸 ${need} 张，手牌调整至 ${x} 张`);
}

defineSkill({
  id: 'jie_jieming', name: '节命',
  desc: '当你受到 1 点伤害后或死亡时，你可以令一名角色摸 X 张牌，然后将手牌弃至 X 张（X 为其体力上限且至多 5）。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => (d.amount || 0) > 0 && d.self.alive !== false,
      async effect(ctx) { await jiemingEffect(ctx); },
    },
    {
      on: 'death.before', who: 'self', optional: true,
      async effect(ctx) { await jiemingEffect(ctx); },
    },
  ],
});

// ==================== 界魏延 · 狂骨 / 奇谋 ====================
// 狂骨（界）：对距离 1 以内角色造成伤害后，可回复 1 点体力或摸一张牌。
defineSkill({
  id: 'jie_kuanggu', name: '狂骨',
  desc: '当你对距离 1 以内的一名角色造成 1 点伤害后，你可以选择一项：回复 1 点体力，或摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.from === d.player && d.self !== d.player && d.self.alive !== false
      && (d.amount || 0) >= 1 && d.game.distance(d.player, d.self) <= 1,
    async effect(ctx) {
      const p = ctx.self;
      const idx = await ctx.ask.choose(p, ['回复 1 点体力', '摸一张牌'], { prompt: '【狂骨】：选择一项' });
      if (idx === 1) {
        await ctx.draw(p, 1, { reason: 'jie_kuanggu' });
        await ctx.log(`${p.name} 发动【狂骨】，摸一张牌`);
      } else {
        await ctx.recover(p, 1, { reason: 'jie_kuanggu' });
        await ctx.log(`${p.name} 发动【狂骨】，回复 1 点体力`);
      }
    },
  }],
});

// 奇谋：限定技，失去任意点体力，本回合距离 -X，且可额外使用 X 张【杀】。
defineSkill({
  id: 'jie_qimou', name: '奇谋',
  desc: '限定技，出牌阶段，你可以失去任意点体力，然后直到回合结束，你计算与其他角色的距离 -X，且你可以额外使用 X 张【杀】（X 为你失去的体力值）。',
  active: {
    perTurn: true,
    prompt: '限定技：失去任意点体力，本回合距离 -X 且可额外使用 X 张【杀】',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.qimouUsed) { await ctx.log('【奇谋】：限定技本局已使用'); return; }
      const maxX = Math.max(0, p.hp - 1);
      if (!maxX) { await ctx.log('【奇谋】：体力不足，无法发动'); return; }
      const opts = [];
      for (let i = 1; i <= maxX; i++) opts.push(`失去 ${i} 点体力`);
      const idx = await ctx.ask.choose(p, opts, { prompt: '【奇谋】：失去多少点体力？' });
      if (!(idx >= 0) || idx >= opts.length) return;
      const x = idx + 1;
      p.flags.qimouUsed = true;
      p.flags.qimouSha = (p.flags.qimouSha || 0) + x;
      p.flags.distanceMinus = (p.flags.distanceMinus || 0) + x;
      await ctx.game.loseHp(p, x, { reason: 'qimou' });
      await ctx.log(`【奇谋】：失去 ${x} 点体力，本回合距离 -${x}，可额外使用 ${x} 张【杀】`);
    },
  },
});

// ==================== 界小乔 · 天香 / 红颜 ====================
// 天香（界）：受伤时弃一张红桃牌，防止此伤害并令一名其他角色二选一。
defineSkill({
  id: 'jie_tianxiang', name: '天香',
  desc: '当你受到伤害时，你可以弃置一张红桃牌，防止此伤害并选择一名其他角色，然后你选择一项：1. 令其受到伤害来源对其造成的 1 点伤害，然后其摸 X 张牌（X 为其已损失的体力值且至多 5）；2. 令其失去 1 点体力，然后其获得你弃置的牌。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: true,
    filter: (d) => !d.canceled && (d.amount || 0) > 0 && d.self.alive !== false
      && d.self.hand.some(c => suitOf(d.self, c) === 'heart')
      && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = await pickHand(ctx, p, x => suitOf(p, x) === 'heart', '【天香】：弃置一张红桃牌，转移此伤害');
      if (!c) return;
      const ts = await ctx.ask.targets(p, {
        min: 1, max: 1, candidates: g.alive().filter(x => x !== p),
        prompt: '【天香】：选择一名其他角色',
      });
      if (!ts.length) return;
      const t = ts[0];
      await ctx.discard(p, [c], { reason: 'jie_tianxiang' });
      const idx = await ctx.ask.choose(p, [
        '转移伤害，然后其摸 X 张牌',
        '令其失去 1 点体力，然后其获得此牌',
      ], { prompt: '【天香】：选择一项' });
      if (idx === 1) {
        ctx.data.canceled = true;
        await g.loseHp(t, 1, { from: p, reason: 'jie_tianxiang' });
        const di = g.discardPile.indexOf(c);
        if (di >= 0) g.discardPile.splice(di, 1);
        await ctx.gain(t, [c], { reason: 'jie_tianxiang' });
        await ctx.log(`【天香】：${t.name} 失去 1 点体力并获得 ${cardLabel(c)}`);
        return;
      }
      ctx.data.to = t;
      ctx.data.afterDamage = async () => {
        if (!t.alive) return;
        const lost = Math.min(5, Math.max(0, t.maxHp - t.hp));
        if (lost > 0) await ctx.draw(t, lost, { reason: 'jie_tianxiang' });
        await ctx.log(`【天香】：${t.name} 已损失 ${lost} 点体力，摸 ${lost} 张牌`);
      };
      await ctx.log(`${p.name} 发动【天香】，将伤害转移给 ${t.name}`);
    },
  }],
});

// 红颜（界）：黑桃视为红桃（引擎 suitOf）；装备区有红桃牌时手牌上限等于体力上限。
defineSkill({
  id: 'jie_hongyan', name: '红颜',
  desc: '锁定技，你的黑桃牌视为红桃牌；若你的装备区里有红桃牌，你的手牌上限等于体力上限。',
  triggers: [{
    on: 'phase.begin', who: 'self',
    filter: (d) => d.phase === 'discard',
    async effect(ctx) {
      const p = ctx.self;
      const reds = Object.values(p.equips).filter(Boolean).filter(c => suitOf(p, c) === 'heart');
      if (!reds.length) return;
      const extra = Math.max(0, p.maxHp - p.hp);
      if (extra > 0) {
        p.flags.handLimit = (p.flags.handLimit || 0) + extra;
        await ctx.log(`【红颜】：装备区有红桃牌，手牌上限 +${extra}（等于体力上限）`);
      }
    },
  }],
});

export const JIE2_SKILL_IDS = ['jie_liegong', 'jie_leiji', 'jie_guidao', 'jie_jieming',
  'jie_kuanggu', 'jie_qimou', 'jie_tianxiang', 'jie_hongyan'];
