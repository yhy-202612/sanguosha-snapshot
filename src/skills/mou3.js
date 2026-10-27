// 手杀「谋攻篇」第二批：谋姜维 / 谋法正 / 谋庞统
import { defineSkill, getSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const vcard = (name, type = 'trick') => ({ id: `vn${++vseq}`, name, suit: 'none', num: 0, type, virtual: true });

// ==================== 谋姜维 · 挑衅（蓄力技 2/4）====================
// 出牌阶段限一次，你可以至多选择 X 名其他角色（X 为你拥有的蓄力点数量），令这些角色依次选择一项：
// 1. 对你使用一张无距离限制的【杀】；2. 交给你一张牌。然后你每选择一名角色，减少 1 点蓄力点。
// 弃牌阶段，你每弃置一张牌，获得 1 点蓄力点。
defineSkill({
  id: 'tiaoxin2', name: '挑衅',
  desc: '蓄力技（2/4），出牌阶段限一次，你可以至多选择 X 名其他角色（X 为你拥有的蓄力点数量），令这些角色依次选择一项：1. 对你使用一张无距离限制的【杀】；2. 交给你一张牌。然后你每选择一名角色，减少 1 点蓄力点。弃牌阶段，你每弃置一张牌，获得 1 点蓄力点。',
  triggers: [
    {
      // 弃牌阶段每弃一张牌获得 1 点蓄力点
      on: 'cards.discard', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.game.phase === 'discard' && (d.cards || []).length > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.marks = p.marks || {};
        const n = Math.min(4, (p.marks.charge || 0) + (ctx.data.cards || []).length);
        p.marks.charge = n;
        await ctx.log(`【挑衅】：弃牌获得蓄力点，当前 ${n}/4`);
      },
    },
  ],
  active: {
    perPhase: true,
    prompt: '令至多 X 名其他角色交牌或对你出【杀】（X=蓄力点）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.marks = p.marks || {};
      const x = Math.min(4, p.marks.charge == null ? 2 : p.marks.charge);
      if (x <= 0) { await ctx.log('【挑衅】：没有蓄力点'); return; }
      const cands = g.alive().filter(q => q !== p);
      if (!cands.length) return;
      const picked = await ctx.ask.targets(p, { prompt: `【挑衅】：选择至多 ${x} 名其他角色`, candidates: cands, min: 1, max: Math.min(x, cands.length) });
      if (!picked.length) return;
      p.marks.charge = Math.max(0, x - picked.length);
      p.flags.tiaoxinPicked = (p.flags.tiaoxinPicked || 0) + picked.length;
      for (const q of picked) {
        const idx = await ctx.ask.choose(q, [`交给你一张牌`, `对 ${p.name} 使用一张【杀】`], { prompt: `【挑衅】：${p.name} 令你选择一项`, reason: 'tiaoxin2' });
        if (idx === 0) {
          if (!q.hand.length) { await ctx.log(`【挑衅】：${q.name} 无牌可交`); continue; }
          const c = g.rng.pick(q.hand);
          await ctx.gain(p, [c], { from: q, reason: 'tiaoxin2' });
          await ctx.log(`【挑衅】：${q.name} 交给 ${p.name} ${cardLabel(c)}`);
        } else {
          const sha = q.hand.find(c => c.name === 'sha');
          if (!sha) { await ctx.log(`【挑衅】：${q.name} 没有【杀】`); continue; }
          await g.useCard({ from: q, card: sha, targets: [p], reason: 'tiaoxin2', ignoreRange: true });
        }
      }
      await ctx.log(`【挑衅】：选择 ${picked.length} 名角色，剩余蓄力点 ${p.marks.charge}`);
    },
  },
});

// ==================== 谋姜维 · 志继（觉醒技）====================
// 准备阶段，若你发动「挑衅」选择过至少 4 名角色，你减 1 点体力上限，令任意名角色直到你的下个回合开始时获得「北伐」标记。
// 拥有「北伐」标记的角色使用牌只能选择你或其自身为目标。
defineSkill({
  id: 'zhiji2', name: '志继',
  desc: '觉醒技，准备阶段，若你发动「挑衅」选择过至少 4 名角色，你减 1 点体力上限，令任意名角色直到你的下个回合开始时获得「北伐」标记。拥有「北伐」标记的角色使用牌只能选择你或其自身为目标。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && !d.self.flags.zhijiDone && (d.self.flags.tiaoxinPicked || 0) >= 4,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.zhijiDone = true;
      p.maxHp = Math.max(1, p.maxHp - 1);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      const cands = g.alive().filter(q => q !== p);
      const picked = await ctx.ask.targets(p, { prompt: '【志继】：令任意名角色获得「北伐」标记', candidates: cands, min: 0, max: cands.length });
      const until = g.turnCount + g.players.length;
      for (const q of picked) {
        q.marks = q.marks || {};
        q.marks.beifa = until;
        q.flags.beifaUntil = until;
      }
      await ctx.log(`【志继】：减 1 点体力上限，${picked.map(q => q.name).join('、') || '无'} 获得「北伐」标记`);
    },
  }],
});

// ==================== 谋法正 · 眩惑 ====================
// 出牌阶段限一次，你可以交给一名没有「眩」标记的其他角色一张牌并令其获得「眩」标记。
// 有「眩」标记的角色于摸牌阶段外获得牌时，你随机获得其一张手牌（每个「眩」标记最多令你获得五张牌）。
defineSkill({
  id: 'xuanhuo2', name: '眩惑',
  desc: '出牌阶段限一次，你可以交给一名没有「眩」标记的其他角色一张牌，令其获得「眩」标记。有「眩」标记的角色于摸牌阶段外获得牌时，你随机获得其一张手牌（每个「眩」标记最多令你获得五张牌）。',
  triggers: [{
    on: 'cards.gain', who: 'any', optional: false,
    filter: (d) => {
      const q = d.self;
      if (!q || q === d.player) return false;
      if (!q.flags?.xuan) return false;
      if (d.game.phase === 'draw') return false;
      return true;
    },
    async effect(ctx) {
      const p = ctx.self, q = ctx.data.self;
      const got = q.flags.xuanGot || 0;
      if (got >= 5) return;
      if (!q.hand.length) return;
      const c = ctx.game.rng.pick(q.hand);
      await ctx.gain(p, [c], { from: q, reason: 'xuanhuo2' });
      q.flags.xuanGot = got + 1;
      await ctx.log(`【眩惑】：${q.name} 摸牌阶段外获得牌，你随机获得其一张手牌（${q.flags.xuanGot}/5）`);
    },
  }],
  active: {
    perPhase: true,
    prompt: '交给一名角色一张牌，令其获得「眩」标记',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(q => q !== p && !q.flags?.xuan);
      if (!cands.length) { await ctx.log('【眩惑】：没有可标记的角色'); return; }
      if (!p.hand.length) { await ctx.log('【眩惑】：你没有手牌可交'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【眩惑】：选择一名角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【眩惑】：选择交出的牌', optional: false });
      const c = picks[0];
      if (!c) return;
      await ctx.gain(t, [c], { from: p, reason: 'xuanhuo2' });
      t.flags.xuan = true;
      t.flags.xuanGot = 0;
      await ctx.log(`【眩惑】：交给 ${t.name} ${cardLabel(c)}，其获得「眩」标记`);
    },
  },
});

// ==================== 谋法正 · 恩怨（锁定技）====================
// 准备阶段，令有「眩」标记的角色：若你获得其至少三张牌，移除标记并交给其两张牌；否则其失去 1 点体力，你回复 1 点体力并移除标记。
defineSkill({
  id: 'enyuan2', name: '恩怨',
  desc: '锁定技，准备阶段，你令有「眩」标记的角色执行以下效果：自其获得「眩」标记开始，若你获得其至少三张牌，则你移除其「眩」标记，然后交给其两张牌；否则其失去 1 点体力，然后你回复 1 点体力并移除「眩」标记。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && d.game.alive().some(q => q.flags?.xuan),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      for (const q of g.alive().filter(x => x.flags?.xuan)) {
        if ((q.flags.xuanGot || 0) >= 3) {
          q.flags.xuan = false; q.flags.xuanGot = 0;
          for (let i = 0; i < 2 && p.hand.length; i++) {
            const c = g.rng.pick(p.hand);
            await ctx.gain(q, [c], { from: p, reason: 'enyuan2' });
          }
          await ctx.log(`【恩怨】：${q.name} 已被获得 ${3} 张以上，交给其两张牌并移除标记`);
        } else {
          q.flags.xuan = false; q.flags.xuanGot = 0;
          await ctx.loseHp(q, 1);
          if (p.hp < p.maxHp) await ctx.recover(p, 1);
          await ctx.log(`【恩怨】：${q.name} 失去 1 点体力，你回复 1 点体力并移除标记`);
        }
      }
    },
  }],
});

// ==================== 谋庞统 · 连环 ====================
// 出牌阶段，你可以将一张梅花手牌当【铁索连环】使用（每个出牌阶段限一次）；当你使用【铁索连环】时，你可以弃置一名角色的一张牌（升级后：不受此限）。
defineSkill({
  id: 'lianhuan2', name: '连环',
  desc: '出牌阶段，你可以将一张梅花手牌当【铁索连环】使用（每个出牌阶段限一次）；当你使用【铁索连环】指定目标后，你可以弃置该角色的一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'any', optional: false,
    filter: (d) => d.self === d.player && (d.effName || d.card?.name) === 'tiesuo',
    async effect(ctx) { ctx.self.flags.lianhuan2Turn = ctx.game.turnCount; },
  }, {
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => d.self === d.player && d.card?.name === 'tiesuo' && d.target && d.target !== d.self,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.target;
      const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
      if (!pool.length) return;
      const c = ctx.game.rng.pick(pool);
      const slot = Object.keys(t.equips).find(k => t.equips[k] === c);
      if (slot) { t.equips[slot] = null; await ctx.game.trigger('equip.lose', { self: t, card: c, slot }); }
      await ctx.discard(t, [c], { reason: 'lianhuan2' });
      await ctx.log(`【连环】：弃置 ${t.name} 的 ${cardLabel(c)}`);
    },
  }],
});

// ==================== 谋庞统 · 涅槃（限定技）====================
// 限定技，当你处于濒死状态时，你可以弃置所有牌，回复至 3 点体力，摸三张牌，然后升级【连环】。
defineSkill({
  id: 'niepan2', name: '涅槃',
  desc: '限定技，当你处于濒死状态时，你可以弃置所有牌，然后回复至 3 点体力，摸三张牌，并升级【连环】。',
  triggers: [{
    on: 'dying.begin', who: 'self', optional: true,
    filter: (d) => d.self === d.player && !d.player.flags.niepan2Used,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.niepan2Used = true;
      const cs = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      const eqs = Object.keys(p.equips).filter(k => p.equips[k]);
      // ★先派发 equip.lose 再统一弃置（SG033 P0-2）：直接置空会让监听者永不刷新
      for (const k of eqs) await g.unequipCard(p, p.equips[k], { reason: 'niepan2' });
      if (cs.length) await ctx.discard(p, cs, { reason: 'niepan2' });
      p.hp = Math.min(3, p.maxHp);
      await ctx.draw(p, 3, { reason: 'niepan2' });
      p.flags.lianhuanUpgraded = true;
      await ctx.log('【涅槃】：弃置所有牌，回复至 3 点体力，摸三张牌，【连环】升级');
    },
  }],
});

export const MOU3_SKILL_IDS = ['tiaoxin2', 'zhiji2', 'xuanhuo2', 'enyuan2', 'lianhuan2', 'niepan2'];
