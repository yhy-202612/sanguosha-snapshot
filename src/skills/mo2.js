// OL「魔」系列（第二批）：魔貂蝉 / 魔吕布
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const vcard = (name, type = 'basic', suit = 'spade', num = 7) => ({ id: `vm2${++vseq}`, name, suit, num, type, virtual: true });
const roundStart = (g) => g.turnCount % Math.max(1, g.players.length) === 1;

// ==================== 魔貂蝉 · 幻惑 ====================
// 每轮开始时，你摸两张牌，然后弃置至多两张牌并选择等量其他角色。
// 其下回合出牌阶段强制选中一张可用的手牌，且每使用一张牌后随机弃一张牌，直到其使用了 2 张牌后。
defineSkill({
  id: 'huanhuo', name: '幻惑',
  desc: '每轮开始时，你摸两张牌，然后弃置至多两张牌并选择等量其他角色。其下回合出牌阶段强制选中一张可用的手牌，且每使用一张牌后随机弃一张牌，直到其使用了 2 张牌后。',
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => roundStart(d.game),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        await ctx.draw(p, 2, { reason: 'huanhuo' });
        const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(2, p.hand.length), { prompt: '【幻惑】：弃置至多两张牌', optional: true });
        if (picks.length) await ctx.discard(p, picks, { reason: 'huanhuo' });
        const cands = g.alive().filter(q => q !== p);
        if (picks.length && cands.length) {
          const chosen = await ctx.ask.targets(p, { prompt: `【幻惑】：选择 ${picks.length} 名角色`, candidates: cands, min: 0, max: Math.min(picks.length, cands.length) });
          for (const q of chosen) {
            q.marks = q.marks || {};
            q.marks.huanhuo = 1;
            q.flags.huanhuoPending = true;
          }
          if (chosen.length) await ctx.log(`【幻惑】：${chosen.map(q => q.name).join('、')} 下个出牌阶段将受幻惑`);
        }
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'play' && d.self === d.player && d.player.flags.huanhuoPending,
      async effect(ctx) {
        const q = ctx.self;
        q.flags.huanhuoPending = false;
        q.flags.huanhuoLeft = 2;
        await ctx.log(`【幻惑】：${q.name} 本阶段每使用一张牌后随机弃一张（共 2 次）`);
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => d.self === d.player && (d.player.flags.huanhuoLeft || 0) > 0,
      async effect(ctx) {
        const q = ctx.self, g = ctx.game;
        if (!q.hand.length) return;
        const c = g.rng.pick(q.hand);
        await ctx.discard(q, [c], { reason: 'huanhuo' });
        q.flags.huanhuoLeft -= 1;
        await ctx.log(`【幻惑】：${q.name} 随机弃置 ${cardLabel(c)}（剩余 ${q.flags.huanhuoLeft} 次）`);
      },
    },
  ],
});

// ==================== 魔貂蝉 · 倾世 ====================
// 准备阶段，你可入魔，令所有角色获得一张单目标伤害牌。这些牌造成伤害后你摸一张牌。
defineSkill({
  id: 'qingshi', name: '倾世',
  desc: '准备阶段，你可以入魔，令所有角色获得一张单目标伤害牌。其他角色使用此牌指定唯一目标时，你可以弃置一张牌，重新指定牌的目标（无距离限制）。这些牌造成伤害后你摸一张牌；未因使用进入弃牌堆后你获得之。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.form !== 'demon') {
          await g.setForm(p, 'demon', '倾世');
          if (!effSkills(p).some(s => s.id === 'ru_ma')) { const sk = getSkill('ru_ma'); if (sk) p.skills.push(sk); }
        }
        for (const q of g.alive()) {
          const c = vcard('sha');
          c.skillTag = 'qingshi';
          q.hand.push(c);
        }
        await ctx.log('【倾世】：所有角色获得一张单目标伤害牌');
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.card?.skillTag === 'qingshi',
      async effect(ctx) {
        await ctx.draw(ctx.self, 1, { reason: 'qingshi' });
        await ctx.log('【倾世】：这些牌造成伤害，你摸一张牌');
      },
    },
  ],
});

// ==================== 魔吕布 · 夺炁 ====================
defineSkill({
  id: 'duoqi', name: '夺炁',
  desc: '锁定技，所有角色的初始手牌称为「炁」。你每回合对一名角色首次造成伤害后，你获得其一张「炁」。你的第一个回合开始前，你执行一个不能使用延时锦囊牌的额外出牌阶段。',
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => d.self === d.player && d.game.turnCount === 1 && !d.player.flags.duoqiInit,
      async effect(ctx) {
        const g = ctx.game;
        for (const q of g.players) {
          q.flags.qi = (q.flags.qi || []).concat((q.hand || []).map(c => c.id));
        }
        ctx.self.flags.duoqiInit = true;
        await ctx.log('【夺炁】：所有角色的初始手牌成为「炁」');
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !d.player.flags.duoqiExtra,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.duoqiExtra = true;
        await ctx.log('【夺炁】：额外执行一个出牌阶段（不能使用延时锦囊）');
        p.flags.duoqiExtraPlay = true;
        g.phase = 'play';
        await g.trigger('phase.begin', { self: p, phase: 'play' });
        await g.runPhase(p, 'play');
        await g.trigger('phase.end', { self: p, phase: 'play' });
        g.phase = null;
        p.flags.duoqiExtraPlay = false;
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.to && d.to !== d.player
        && d.player.flags.duoqiHurtTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.to, g = ctx.game;
        p.flags.duoqiHurtTurn = g.turnCount;
        const ids = t.flags?.qi || [];
        const c = t.hand.find(x => ids.includes(x.id));
        if (!c) { await ctx.log(`【夺炁】：${t.name} 没有「炁」牌`); return; }
        t.flags.qi = ids.filter(id => id !== c.id);
        await ctx.gain(p, [c], { from: t, reason: 'duoqi' });
        await ctx.log(`【夺炁】：获得 ${t.name} 的「炁」${cardLabel(c)}`);
      },
    },
  ],
});

// ==================== 魔吕布 · 狂魔 ====================
defineSkill({
  id: 'kuangmo', name: '狂魔',
  desc: '出牌阶段，你可以入魔并选择一名其他角色，你与其成为「狂」角色，每回合对彼此首次造成的伤害 +1。击败对方后，获得对方所有「炁」。',
  triggers: [
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => {
        const g = d.game;
        const a = d.from, b = d.to;
        if (!a || !b || a === b) return false;
        if (a.flags.kuangWith !== b.id && b.flags.kuangWith !== a.id) return false;
        return a.flags.kuangDmgTurn !== g.turnCount;
      },
      async effect(ctx) {
        const d = ctx.data;
        d.amount = (d.amount || 1) + 1;
        ctx.self.flags.kuangDmgTurn = ctx.game.turnCount;
        await ctx.log('【狂魔】：狂角色之间首次伤害 +1');
      },
    },
    {
      // 「击败对方后，获得对方所有「炁」」——原实现完全缺失这一段
      on: 'death.before', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, dead = d.self;
        if (!p || !dead || dead === p) return false;
        if (p.flags.kuangWith !== dead.id) return false;
        return !d.killer || d.killer === p;   // 无击杀来源时按「对方阵亡即获得」处理
      },
      async effect(ctx) {
        const p = ctx.self, dead = ctx.data.self;
        const ids = dead.flags?.qi || [];
        const cards = (dead.hand || []).filter(c => ids.includes(c.id));
        dead.flags.kuangWith = null;
        p.flags.kuangWith = null;
        if (!ids.length) { await ctx.log(`【狂魔】：击败 ${dead.name}，但其没有「炁」牌`); return; }
        dead.flags.qi = [];
        if (cards.length) {
          // 先把「炁」牌从对方手牌摘出，避免随后随阵亡进弃牌堆
          dead.hand = dead.hand.filter(c => !ids.includes(c.id));
          await ctx.gain(p, cards, { from: dead, reason: 'kuangmo' });
        }
        await ctx.log(`【狂魔】：击败 ${dead.name}，获得其 ${cards.length} 张「炁」牌`);
      },
    },
  ],
  active: {
    prompt: '入魔并指定一名「狂」角色',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(q => q !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【狂魔】：选择「狂」角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.kuangWith = t.id;
      t.flags.kuangWith = p.id;
      if (p.form !== 'demon') {
        await g.setForm(p, 'demon', '狂魔');
        if (!effSkills(p).some(s => s.id === 'ru_ma')) { const sk = getSkill('ru_ma'); if (sk) p.skills.push(sk); }
      }
      await ctx.log(`【狂魔】：${p.name} 与 ${t.name} 成为「狂」角色，每回合对彼此首次伤害 +1`);
    },
  },
});

export const MO2_SKILL_IDS = ['huanhuo', 'qingshi', 'duoqi', 'kuangmo'];
