// 手杀「谋攻篇」第三批：谋刘备 / 谋大乔
import { defineSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const VC = (name, suit = 'spade', num = 7, extra = {}) => ({
  id: `vm4${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const allCardsOf = (p) => [
  ...p.hand.map(c => ({ c, slot: null })),
  ...Object.entries(p.equips).filter(([, v]) => v).map(([k, v]) => ({ c: v, slot: k })),
];
const detachEquip = async (g, p, c) => {
  const slot = Object.keys(p.equips).find(k => p.equips[k] === c);
  if (slot) { p.equips[slot] = null; await g.trigger('equip.lose', { self: p, card: c, slot }); }
  return !!slot;
};
const BASIC = ['sha', 'shan', 'tao', 'jiu'];

// ==================== 谋刘备 · 仁德 ====================
// 出牌阶段开始时，你获得2个"仁望"标记。出牌阶段，你可以将任意张牌交给一名本阶段未获得过"仁德"牌的其他角色，
// 然后你获得等量的"仁望"标记（你至多拥有8个"仁望"标记）。
// 每回合限一次，当你需要使用或打出一张基本牌时，你可以弃置2个"仁望"标记视为使用或打出之。
defineSkill({
  id: 'rende2', name: '仁德',
  desc: '出牌阶段开始时，你获得2个“仁望”标记。出牌阶段，你可以将任意张牌交给一名本阶段未获得过“仁德”牌的其他角色，然后你获得等量的“仁望”标记（你至多拥有8个“仁望”标记）。每回合限一次，当你需要使用或打出一张基本牌时，你可以弃置2个“仁望”标记视为使用或打出之。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self;
        p.flags.renwang = Math.min(8, (p.flags.renwang || 0) + 2);
        p.flags.rendeGiven = [];
        await ctx.log(`【仁德】：获得2个「仁望」标记（当前 ${p.flags.renwang}）`);
      },
    },
    {
      // 弃 2 个「仁望」视为使用/打出一张基本牌
      on: 'respond.need', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player;
        const f = d.filter;
        const nm = typeof f === 'string' ? f : (f && f.name);
        return BASIC.includes(nm) && (p.flags.renwang || 0) >= 2 && p.flags.rendeResp !== d.game.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        const f = d.filter;
        const nm = typeof f === 'string' ? f : (f && f.name);
        const yes = await ctx.ask.confirm(p, `【仁德】：弃置2个「仁望」标记视为${CARD_META[nm].cn}？`);
        if (!yes) return;
        p.flags.renwang = Math.max(0, (p.flags.renwang || 0) - 2);
        p.flags.rendeResp = ctx.game.turnCount;
        d.handled = true;
        d.card = VC(nm);
        await ctx.log(`【仁德】：弃置2个「仁望」标记，视为使用/打出【${CARD_META[nm].cn}】（剩余 ${p.flags.renwang}）`);
      },
    },
  ],
  active: {
    prompt: '仁德：将任意张牌交给一名本阶段未获得过「仁德」牌的角色',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const given = (p.flags.rendeGiven = p.flags.rendeGiven || []);
      const cands = g.alive().filter(x => x !== p && !given.includes(x.id));
      if (!cands.length) { await ctx.log('【仁德】：本阶段所有其他角色均已获得过「仁德」牌'); return; }
      if (!p.hand.length) { await ctx.log('【仁德】：你没有手牌'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【仁德】：选择一名角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), p.hand.length, { prompt: '【仁德】：选择交给其的牌（可取消）', optional: true });
      if (!picks || !picks.length) return;
      await ctx.gain(t, picks, { from: p, reason: 'rende2' });
      given.push(t.id);
      p.flags.rendeReceivers = p.flags.rendeReceivers || [];
      if (!p.flags.rendeReceivers.includes(t.id)) p.flags.rendeReceivers.push(t.id);
      p.flags.renwang = Math.min(8, (p.flags.renwang || 0) + picks.length);
      await ctx.log(`【仁德】：交给 ${t.name} ${picks.length} 张牌，获得 ${picks.length} 个「仁望」标记（当前 ${p.flags.renwang}）`);
    },
  },
});

// ==================== 谋刘备 · 章武（限定技）====================
// 限定技，出牌阶段，你可以令本局游戏中所有获得过"仁德"牌的角色依次交给你Y张牌
// （Y为游戏轮数-1，且最大为3），若如此做，你回复3点体力，然后失去"仁德"。
defineSkill({
  id: 'zhangwu', name: '章武',
  desc: '限定技，出牌阶段，你可以令本局游戏中所有获得过“仁德”牌的角色依次交给你Y张牌（Y为游戏轮数-1，且最大为3），若如此做，你回复3点体力，然后失去“仁德”。',
  active: {
    perTurn: true,
    prompt: '章武（限定技）：令获得过「仁德」牌的角色各交给你若干牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.zhangwuUsed) { await ctx.log('【章武】：限定技已发动过'); return; }
      const ids = (p.flags.rendeReceivers || []).filter(id => { const q = g.byId(id); return q && q.alive; });
      if (!ids.length) { await ctx.log('【章武】：本局尚没有角色获得过「仁德」牌'); return; }
      p.flags.zhangwuUsed = true;
      const round = Math.ceil(g.turnCount / Math.max(1, g.players.length));
      const y = Math.max(1, Math.min(3, round - 1));
      let got = 0;
      for (const id of ids) {
        const q = g.byId(id);
        if (!q || !q.alive) continue;
        const pool = allCardsOf(q).map(o => o.c);
        if (!pool.length) continue;
        const n = Math.min(y, pool.length);
        const picks = await g.chooseSomeCards(q, pool, n, { prompt: `【章武】：交给 ${p.name} ${n} 张牌` });
        for (const c of picks) await detachEquip(g, q, c);
        if (picks.length) { await ctx.gain(p, picks, { from: q, reason: 'zhangwu' }); got += picks.length; }
        await ctx.log(`【章武】：${q.name} 交给你 ${picks.length} 张牌`);
      }
      await ctx.recover(p, 3);
      p.skills = p.skills.filter(s => s.id !== 'rende2');
      await ctx.log(`【章武】：共获得 ${got} 张牌，回复3点体力，失去【仁德】`);
    },
  },
});

// ==================== 谋刘备 · 激将（主公技）====================
// 主公技，出牌阶段结束时，你可指定一名角色，并令一名攻击范围内含有该角色且体力值不小于你的
// 其他蜀势力角色选择一项：1.视为对你指定的角色使用一张普通【杀】；2.跳过下一个出牌阶段。
defineSkill({
  id: 'jijiang2', name: '激将',
  desc: '主公技，出牌阶段结束时，你可指定一名角色，并令一名攻击范围内含有该角色且体力值不小于你的其他蜀势力角色选择一项：1.视为对你指定的角色使用一张普通【杀】；2.跳过下一个出牌阶段。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: true,
    filter: (d) => d.phase === 'play',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【激将】：指定一名角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const helpers = g.alive().filter(q => q !== p && q.kingdom === 'shu' && q.hp >= p.hp && g.inAttackRange(q, t));
      if (!helpers.length) { await ctx.log('【激将】：没有符合条件的蜀势力角色'); return; }
      const h = (await ctx.ask.targets(p, { prompt: '【激将】：选择发动技能的蜀势力角色', candidates: helpers, min: 1, max: 1 }))[0] || helpers[0];
      const i = await ctx.ask.choose(h, [`视为对 ${t.name} 使用一张普通【杀】`, '跳过其下一个出牌阶段'], { prompt: '【激将】：请选择一项', reason: 'jijiang2' });
      if (i === 1) {
        g.skipPhase(h, 'play');
        await ctx.log(`【激将】：${h.name} 选择跳过其下一个出牌阶段`);
        return;
      }
      await ctx.useCard({ from: h, card: VC('sha'), targets: [t], reason: 'jijiang2', ignoreRange: true, ignoreShaLimit: true });
      await ctx.log(`【激将】：${h.name} 视为对 ${t.name} 使用一张普通【杀】`);
    },
  }],
});

// ==================== 谋大乔 · 国色 ====================
// 出牌阶段限四次，你可以选择一项：1.将一张方片牌当【乐不思蜀】使用，然后你摸一张牌；
// 2.弃置一张场上的【乐不思蜀】，然后你摸一张牌。
defineSkill({
  id: 'guose2', name: '国色',
  desc: '出牌阶段限四次，你可以选择一项：1.将一张方片牌当【乐不思蜀】使用，然后你摸一张牌；2.弃置一张场上的【乐不思蜀】，然后你摸一张牌。',
  active: {
    prompt: '国色：方片当【乐不思蜀】／弃置场上【乐不思蜀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (g.turnPlayer !== p) { await ctx.log('【国色】：仅出牌阶段可用'); return; }
      if (p.flags.guose2Turn !== g.turnCount) { p.flags.guose2Turn = g.turnCount; p.flags.guose2Used = 0; }
      if ((p.flags.guose2Used || 0) >= 4) { await ctx.log('【国色】：本阶段已发动4次'); return; }
      const diamonds = p.hand.filter(c => c.suit === 'diamond');
      const lebuOwners = g.alive().filter(q => (q.judgeZone || []).some(z => z.card?.name === 'lebu'));
      const opts = [];
      if (diamonds.length) opts.push('将一张方片牌当【乐不思蜀】使用');
      if (lebuOwners.length) opts.push('弃置一张场上的【乐不思蜀】');
      opts.push('取消');
      if (opts.length === 1) { await ctx.log('【国色】：没有方片牌，也没有场上的【乐不思蜀】'); return; }
      const i = await ctx.ask.choose(p, opts, { prompt: '【国色】：选择一项', reason: 'guose2' });
      const label = opts[i];
      if (!label || label === '取消') return;
      p.flags.guose2Used = (p.flags.guose2Used || 0) + 1;
      if (label.startsWith('将一张方片')) {
        const [c] = await g.chooseSomeCards(p, diamonds, 1, { prompt: '【国色】：选择一张方片牌' });
        if (!c) return;
        const cs = g.alive().filter(q => q !== p);
        const tg = await ctx.ask.targets(p, { prompt: '【国色】：选择【乐不思蜀】的目标', candidates: cs, min: 1, max: 1 });
        if (!tg.length) return;
        const j = p.hand.indexOf(c);
        if (j >= 0) p.hand.splice(j, 1);
        await ctx.discard(p, [c], { reason: 'guose2' });
        await ctx.useCard({ from: p, card: VC('lebu', 'diamond', c.num), targets: tg, reason: 'guose2', ignoreRange: true });
      } else {
        const owner = lebuOwners[0];
        const z = (owner.judgeZone || []).find(x => x.card?.name === 'lebu');
        if (!z) return;
        await ctx.discard(owner, [z.card], { reason: 'guose2' });
        await ctx.log(`【国色】：弃置了 ${owner.name} 判定区的【乐不思蜀】`);
      }
      await ctx.draw(p, 1, { reason: 'guose2' });
      await ctx.log(`【国色】：摸一张牌（本阶段第 ${p.flags.guose2Used} 次）`);
    },
  },
});

// ==================== 谋大乔 · 流离 ====================
// 当你成为其他角色使用【杀】的目标时，你可以弃置一张牌，将此【杀】转移给你攻击范围内的另一名其他角色。
// 每回合限一次，若你弃置的牌为红桃牌，你可以令一名其他角色（【杀】的使用者除外）获得"流离"标记
// （若场上已有此标记则改为转移给该角色）。拥有"流离"标记的角色的回合开始时，其执行一个额外的出牌阶段并移去标记。
defineSkill({
  id: 'liuli2', name: '流离',
  desc: '当你成为其他角色使用【杀】的目标时，你可以弃置一张牌，将此【杀】转移给你攻击范围内的另一名其他角色。每回合限一次，若你弃置的牌为红桃牌，你可以令一名其他角色（【杀】的使用者除外）获得“流离”标记（若场上已有此标记则改为转移给该角色）。拥有“流离”标记的角色的回合开始时，其执行一个额外的出牌阶段并移去标记。',
  triggers: [
    {
      on: 'target.before', who: 'any', optional: true,
      filter: (d) => d.target === d.player && d.card?.name === 'sha' && d.self !== d.player && d.player.flags.liuli2Turn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        p.flags.liuli2Turn = g.turnCount;
        const pool = allCardsOf(p);
        if (!pool.length) return;
        const [c] = await g.chooseSomeCards(p, pool.map(o => o.c), 1, { prompt: '【流离】：弃置一张牌转移此【杀】', optional: true });
        if (!c) { p.flags.liuli2Turn = -1; return; }
        const cands = g.alive().filter(q => q !== p && q !== d.self && g.inAttackRange(p, q));
        if (!cands.length) { await ctx.log('【流离】：攻击范围内没有可转移目标'); return; }
        const t = (await ctx.ask.targets(p, { prompt: '【流离】：选择转移的目标', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        await detachEquip(g, p, c);
        await ctx.discard(p, [c], { reason: 'liuli2' });
        d.target = t;
        await ctx.log(`【流离】：弃置 ${cardLabel(c)}，将【杀】转移给 ${t.name}`);
        if (c.suit === 'heart') {
          const others = g.alive().filter(q => q !== d.self);
          if (!others.length) return;
          const marked = others.find(q => q.flags.liuliMark);
          let holder = marked;
          if (!holder) {
            holder = (await ctx.ask.targets(p, { prompt: '【流离】：令一名角色获得「流离」标记', candidates: others, min: 1, max: 1 }))[0];
          }
          if (holder) {
            for (const q of g.alive()) q.flags.liuliMark = false;
            holder.flags.liuliMark = true;
            await ctx.log(`【流离】：${holder.name} 获得「流离」标记`);
          }
        }
      },
    },
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => !!(d.self && d.self.flags.liuliMark && d.self === d.game.turnPlayer),
      async effect(ctx) {
        const q = ctx.data.self || ctx.self;   // 标记持有者未必是技能拥有者
        q.flags.liuliMark = false;
        q.flags.extraPlay = true;
        await ctx.log(`【流离】：${q.name} 执行一个额外的出牌阶段`);
      },
    },
  ],
});
