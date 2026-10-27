// 神将技能（12 位神将 / 19 个技能）。简化口径见各 desc。
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, isRed, cardLabel } from '../engine/cards.js';

const has = (p, id) => effSkills(p).some(s => s.id === id);

// ---------- 武魂 ----------
defineSkill({
  id: 'wuhun', name: '武魂', desc: '锁定技。你死亡时，令杀死你的角色失去 3 点体力（简化：不实现「梦魇」标记）。',
  triggers: [{
    on: 'death.after', who: 'self', optional: false,
    filter: (d) => d.killer && d.killer.alive,
    async effect(ctx) {
      await ctx.log(`${ctx.self.name} 触发【武魂】`);
      await ctx.loseHp(ctx.data.killer, 3, { reason: 'wuhun' });
    },
  }],
});

// ---------- 七星 ----------
defineSkill({
  id: 'qixing', name: '七星', desc: '游戏开始时，你将牌堆顶七张牌置于武将牌上，称为「星」；每当你受到 1 点伤害后，你可以获得一张「星」。',
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.stars = p.flags.stars || [];
        for (let i = 0; i < 7; i++) {
          const cs = await ctx.game.drawCards(null, 1, { reason: 'qixing' });
          if (cs[0]) p.flags.stars.push(cs[0]);
        }
        await ctx.log(`${p.name} 发动【七星】，获得 ${p.flags.stars.length} 枚「星」`);
      },
    },
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => (d.self.flags.stars || []).length > 0,
      async effect(ctx) {
        const star = ctx.self.flags.stars.pop();
        if (star) await ctx.gain(ctx.self, [star], { reason: 'qixing' });
      },
    },
  ],
});

// ---------- 狂风 ----------
defineSkill({
  id: 'kuangfeng', name: '狂风', desc: '出牌阶段限一次，你可以弃一枚「星」，令一名角色获得「狂风」直到你的下回合开始；其受到的火焰伤害 +1。',
  active: {
    perPhase: true,
    prompt: '弃一枚「星」，令一名角色受到的火焰伤害 +1',
    async effect(ctx) {
      const p = ctx.self;
      const stars = p.flags.stars || [];
      if (!stars.length) return ctx.log('【狂风】没有「星」可用');
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: ctx.game.alive(), prompt: '【狂风】：选择一名角色' });
      if (!ts.length) return;
      stars.pop();
      ts[0].flags.kuangfeng = ctx.game.turnCount + Math.max(2, ctx.game.alive().length);
      await ctx.log(`${ts[0].name} 获得「狂风」标记`);
    },
  },
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => d.nature === 'fire' && d.self.flags.kuangfeng && d.self.flags.kuangfeng >= d.game?.turnCount,
    async effect(ctx) { ctx.data.amount += 1; },
  }],
});

// ---------- 大雾 ----------
defineSkill({
  id: 'dawu', name: '大雾', desc: '出牌阶段限一次，你可以弃 X 枚「星」（X≥1），令至多 X 名角色获得「大雾」直到你的下回合开始；其受到的非雷电伤害 -1。',
  active: {
    perPhase: true,
    prompt: '弃若干「星」，令等量角色受到的非雷电伤害 -1',
    async effect(ctx) {
      const p = ctx.self;
      const stars = p.flags.stars || [];
      if (!stars.length) return ctx.log('【大雾】没有「星」可用');
      const n = await ctx.ask.choose(p, [1, 2, 3, 4, 5, 6, 7].slice(0, stars.length).map(x => `弃 ${x} 枚「星」`), { prompt: '【大雾】：消耗几枚「星」？' });
      if (n < 0) return;
      const count = n + 1;
      const ts = await ctx.ask.targets(p, { min: 1, max: count, candidates: ctx.game.alive(), prompt: `【大雾】：选择至多 ${count} 名角色` });
      if (!ts.length) return;
      for (let i = 0; i < count && stars.length; i++) stars.pop();
      for (const t of ts) t.flags.dawu = ctx.game.turnCount + Math.max(2, ctx.game.alive().length);
      await ctx.log(`${ts.map(t => t.name).join('、')} 获得「大雾」标记`);
    },
  },
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => d.nature !== 'thunder' && d.self.flags.dawu && d.self.flags.dawu >= d.game?.turnCount,
    async effect(ctx) { ctx.data.amount = Math.max(0, ctx.data.amount - 1); },
  }],
});

// ---------- 无谋 ----------
defineSkill({
  id: 'wumou', name: '无谋', desc: '锁定技。你使用普通锦囊牌后，若体力大于 1 则失去 1 点体力，否则弃一张手牌（简化口径）。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.card && d.card.type === 'trick' && !CARD_META[d.card.name]?.delayed,
    async effect(ctx) {
      const p = ctx.self;
      if (p.hp > 1) await ctx.loseHp(p, 1, { reason: 'wumou' });
      else if (p.hand.length) await ctx.discard(p, [p.hand[0]], { reason: 'wumou' });
    },
  }],
});

// ---------- 无前 ----------
defineSkill({
  id: 'wqian', name: '无前', desc: '出牌阶段限一次，你可以弃一张牌，令一名其他角色本回合不能使用【闪】（简化：替代「技能失效」）。',
  active: {
    perPhase: true,
    prompt: '弃一张牌，令一名角色本回合不能使用【闪】',
    async effect(ctx) {
      const p = ctx.self;
      if (!p.hand.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: ctx.game.alive().filter(x => x !== p), prompt: '【无前】：选择一名角色' });
      if (!ts.length) return;
      const c = await ctx.ask.card(p, { prompt: '【无前】：弃一张牌', optional: false, reason: 'wqian' });
      if (!c) return;
      ts[0].flags.noShanTurn = ctx.game.turnCount;
      await ctx.log(`${ts[0].name} 本回合不能使用【闪】`);
    },
  },
});

// ---------- 归心 ----------
defineSkill({
  id: 'guixin', name: '归心', desc: '每当你受到 1 点伤害后，你可以获得一名其他角色的一张牌，然后将一张手牌置于牌堆顶。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x !== p && (x.hand.length > 0 || Object.values(x.equips).some(Boolean)));
      if (cands.length) {
        const ts = await ctx.ask.targets(p, { min: 0, max: 1, candidates: cands, prompt: '【归心】：获得一名角色的一张牌' });
        if (ts.length) {
          const c = await ctx.game.chooseCardFrom(p, ts[0], { reason: 'guixin' });
          if (c) await ctx.gain(p, [c], { from: ts[0], reason: 'guixin' });
        }
      }
      if (p.hand.length) {
        const c = await ctx.ask.card(p, { prompt: '【归心】：将一张手牌置于牌堆顶（可取消）', optional: true });
        if (c) {
          // 置于牌堆顶前先从所有区域摘下（该牌可能因历史双存同时留在弃牌堆）
          await ctx.game.takeCard(c);
          ctx.game.deck.push(c);
          await ctx.log(`${p.name} 将一张牌置于牌堆顶`);
        }
      }
    },
  }],
});

// ---------- 忍戒 / 拜印 ----------
defineSkill({
  id: 'renjie', name: '忍戒', desc: '锁定技。你每受到 1 点伤害获得一枚「忍」；回合开始时若「忍」≥3，你可以摸 X 张牌并清空（X=「忍」数）。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.ren = (p.flags.ren || 0) + Math.max(1, ctx.data.amount || 1);
        await ctx.log(`${p.name} 获得「忍」标记（${p.flags.ren}）`);
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: true,
      filter: (d) => (d.self.flags.ren || 0) >= 3,
      async effect(ctx) {
        const p = ctx.self;
        const n = p.flags.ren || 0;
        p.flags.ren = 0;
        await ctx.draw(p, n, { reason: 'renjie' });
        await ctx.log(`${p.name} 发动【忍戒】，摸 ${n} 张牌`);
      },
    },
  ],
});

defineSkill({
  id: 'baiyin_skill', name: '拜印', desc: '觉醒技。准备阶段，若「忍」≥4，你减 1 点体力上限、回复 1 点体力，并获得技能【制衡】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && (d.self.flags.ren || 0) >= 4 && !d.self.flags.baiyin,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.baiyin = true;
      p.maxHp = Math.max(1, p.maxHp - 1);
      await ctx.recover(p, 1, { reason: 'baiyin' });
      const sk = getSkill('zhiheng');
      if (sk && !has(p, 'zhiheng')) p.skills.push(sk);
      await ctx.log(`${p.name} 觉醒【拜印】：体力上限 -1，获得【制衡】`);
    },
  }],
});

// ---------- 琴音 ----------
defineSkill({
  id: 'qinyin', name: '琴音', desc: '弃牌阶段结束时，若你于此阶段弃置过至少两张牌，你可以令所有角色各回复 1 点体力或各失去 1 点体力。',
  triggers: [
    {
      on: 'cards.discard', who: 'self', optional: false,
      filter: (d) => d.reason === 'discard',
      async effect(ctx) { ctx.self.flags.discardTurn = (ctx.self.flags.discardTurn || 0) + (ctx.data.cards || []).length; },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.phase === 'discard' && (d.self.flags.discardTurn || 0) >= 2,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.discardTurn = 0;
        const idx = await ctx.ask.choose(p, ['所有角色各回复 1 点体力', '所有角色各失去 1 点体力'], { prompt: '【琴音】：选择效果' });
        if (idx === 0) {
          for (const t of ctx.game.alive()) if (t.hp < t.maxHp) await ctx.recover(t, 1, { reason: 'qinyin' });
        } else if (idx === 1) {
          for (const t of ctx.game.alive()) await ctx.loseHp(t, 1, { reason: 'qinyin' });
        }
      },
    },
  ],
});

// ---------- 业炎 ----------
defineSkill({
  id: 'yeyan', name: '业炎', desc: '限定技。出牌阶段，你可以对至多三名角色各造成 1 点火焰伤害，然后失去 3 点体力。',
  active: {
    perTurn: false,
    prompt: '限定技：对至多三名角色造成火焰伤害，然后失去 3 点体力',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.yeyanUsed) return ctx.log('【业炎】本局已使用');
      const cands = ctx.game.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 3, candidates: cands, prompt: '【业炎】：选择至多三名角色' });
      if (!ts.length) return;
      p.flags.yeyanUsed = true;
      for (const t of ts) await ctx.damage({ from: p, to: t, amount: 1, nature: 'fire', reason: 'yeyan' });
      await ctx.loseHp(p, 3, { reason: 'yeyan' });
    },
  },
});

// ---------- 涉猎 ----------
defineSkill({
  id: 'shelie', name: '涉猎', desc: '摸牌阶段，你可以放弃摸牌，改为亮出牌堆顶五张牌，获得其中每种花色的各一张。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw',
    async effect(ctx) {
      const p = ctx.self;
      const top = ctx.game.popDeck(5);
      if (!top.length) return;
      p.flags.skip_draw = true;
      await ctx.game.revealCards(top, { to: ctx.game.alive(), reason: '涉猎' });
      const bySuit = {};
      for (const c of top) (bySuit[c.suit] = bySuit[c.suit] || []).push(c);
      const got = [];
      for (const suit of Object.keys(bySuit)) {
        if (bySuit[suit].length) got.push(bySuit[suit][0]);
      }
      const rest = top.filter(c => !got.includes(c));
      if (got.length) await ctx.gain(p, got, { reason: 'shelie' });
      if (rest.length) ctx.game.discardPile.push(...rest);
    },
  }],
});

// ---------- 攻心 ----------
defineSkill({
  id: 'gongxin', name: '攻心', desc: '出牌阶段限一次，你可以令一名其他角色弃置一张红桃手牌（简化：由其自己选择）。',
  active: {
    perPhase: true,
    prompt: '令一名其他角色弃置一张红桃手牌',
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x !== p && x.hand.some(c => c.suit === 'heart'));
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【攻心】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const hearts = t.hand.filter(c => c.suit === 'heart');
      await ctx.game.revealCards(hearts, { to: ctx.game.alive(), reason: '攻心' });
      await ctx.ask.card(t, { filter: { suit: ['heart'] }, prompt: '【攻心】：弃置一张红桃手牌', optional: false, reason: 'gongxin' });
    },
  },
});

// ---------- 绝境 ----------
defineSkill({
  id: 'juejing', name: '绝境', desc: '锁定技。摸牌阶段，你多摸 X 张牌（X 为你已损失的体力值）。',
  triggers: [{
    on: 'draw.count', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self;
      ctx.data.count += Math.max(0, p.maxHp - p.hp);
    },
  }],
});

// ---------- 龙魂 ----------
defineSkill({
  id: 'longhun', name: '龙魂', desc: '你可以将两张同花色的牌当【杀】/【闪】/【桃】使用或打出（简化：方块两张当【闪】、红桃两张当【桃】）。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => {
      if (!d.filter) return false;
      const want = d.filter.name;
      if (want === 'shan') return d.self.hand.filter(c => c.suit === 'diamond').length >= 2;
      if (want === 'tao') return d.self.hand.filter(c => c.suit === 'heart').length >= 2;
      return false;
    },
    async effect(ctx) {
      const p = ctx.self;
      const want = ctx.data.filter.name;
      const suit = want === 'shan' ? 'diamond' : 'heart';
      const first = await ctx.ask.card(p, { filter: { suit: [suit] }, prompt: `【龙魂】：将两张${suit === 'diamond' ? '方块' : '红桃'}牌当【${CARD_META[want].cn}】打出`, optional: true });
      if (!first) return;
      const second = p.hand.find(c => c.suit === suit && c.id !== first.id);
      if (!second) return;
      const i = p.hand.indexOf(second);
      if (i >= 0) p.hand.splice(i, 1);
      ctx.game.discardPile.push(second);
      ctx.data.handled = true;
      ctx.data.card = { ...first, name: want, __src: first };
      await ctx.log(`${p.name} 发动【龙魂】，将两张牌当【${CARD_META[want].cn}】`);
    },
  }],
});

// ---------- 军略 / 摧克 ----------
defineSkill({
  id: 'junlve', name: '军略', desc: '锁定技。你每使用或打出一张装备牌，获得一枚「略」标记。',
  triggers: [{
    on: 'equip.change', who: 'self', optional: false,
    // ★SG029：引擎现在会在「失去装备」时补派 equip.change（lost:true / card:null），
    //   本技能是「使用或打出装备牌后 +1 略」，失去装备不能算 → 必须要求 d.card 存在
    filter: (d) => !!d.card && d.lost !== true,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.lve = (p.flags.lve || 0) + 1;
      await ctx.log(`${p.name} 获得「略」标记（${p.flags.lve}）`);
    },
  }],
});

defineSkill({
  id: 'cuike', name: '摧克', desc: '出牌阶段限一次，你可以弃两枚「略」，对一名角色造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '弃两枚「略」，对一名角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self;
      if ((p.flags.lve || 0) < 2) return ctx.log('【摧克】「略」不足');
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: ctx.game.alive().filter(x => x !== p), prompt: '【摧克】：选择一名角色' });
      if (!ts.length) return;
      p.flags.lve -= 2;
      await ctx.damage({ from: p, to: ts[0], amount: 1, reason: 'cuike' });
    },
  },
});

// ---------- 劫营 ----------
defineSkill({
  id: 'jieying', name: '劫营', desc: '出牌阶段限一次，你可以弃一张牌，获得一名其他角色装备区里的一张牌。',
  active: {
    perPhase: true,
    prompt: '弃一张牌，获得一名角色装备区的一张牌',
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x !== p && Object.values(x.equips).some(Boolean));
      if (!cands.length || !p.hand.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【劫营】：选择一名角色' });
      if (!ts.length) return;
      const c = await ctx.ask.card(p, { prompt: '【劫营】：弃一张牌', optional: false, reason: 'jieying' });
      if (!c) return;
      const t = ts[0];
      const eq = Object.values(t.equips).filter(Boolean);
      const idx = await ctx.ask.choose(p, eq.map(x => cardLabel(x)), { prompt: '【劫营】：获得哪张装备？' });
      const target = eq[Math.max(0, idx)];
      if (target) await ctx.gain(p, [target], { from: t, reason: 'jieying' });
    },
  },
});

// ---------- 佐定 ----------
defineSkill({
  id: 'zuoding', name: '佐定', desc: '每当一名角色于其回合内使用【杀】造成伤害后，若其手牌数大于你，你可以摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.reason === 'sha' && d.from && d.from !== d.player && d.from.hand.length > d.player.hand.length,
    async effect(ctx) { await ctx.draw(ctx.self ?? ctx.player, 1, { reason: 'zuoding' }); },
  }],
});

export {};
