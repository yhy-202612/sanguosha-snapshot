// 一将成名 2011（11 将 / 19 技能）
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, suitOf } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

async function pickHand(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  const res = await ctx.game.ask(player, 'card', { prompt, cards: cands.map(c => c.id), optional: true, reason: 'skill' });
  if (!res || !res.cardId) return null;
  return cands.find(c => c.id === res.cardId) || null;
}

function takeFromDiscard(g, cards) {
  for (const c of cards) {
    const i = g.discardPile.indexOf(c);
    if (i >= 0) g.discardPile.splice(i, 1);
  }
}

// ================= 魏 =================

// 张春华 · 绝情（锁定技）：你造成的伤害均视为失去体力。
defineSkill({
  id: 'jueqing', name: '绝情',
  desc: '锁定技，你造成的伤害均视为失去体力。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => d.from === d.player && d.self !== d.player && (d.amount || 0) > 0,
    async effect(ctx) {
      const n = ctx.data.amount;
      ctx.data.amount = 0;
      await ctx.log(`${ctx.self.name} 发动【绝情】：伤害视为失去体力`);
      if (ctx.data.self && ctx.data.self.alive) await ctx.loseHp(ctx.data.self, n, { reason: '绝情', from: ctx.self });
    },
  }],
});

// 张春华 · 伤逝：除弃牌阶段外，手牌数小于已损体力时补至。
defineSkill({
  id: 'shangshi', name: '伤逝',
  desc: '除弃牌阶段外，每当你的手牌数小于 X 时，你可以将手牌补至 X（X 为你已损失的体力值）。',
  triggers: [{
    on: 'hand.change', who: 'self', optional: true,
    filter: (d) => d.self.alive && d.self.hp < d.self.maxHp && d.game.phase !== 'discard'
      && d.self.hand.length < (d.self.maxHp - d.self.hp),
    async effect(ctx) {
      const p = ctx.self;
      const x = (p.maxHp - p.hp) - p.hand.length;
      if (x <= 0) return;
      await ctx.draw(p, x, { reason: 'shangshi' });
      await ctx.log(`${p.name} 发动【伤逝】：补至 ${p.maxHp - p.hp} 张手牌`);
    },
  }],
});

// 于禁 · 镇军：把其他角色装备区一张牌置于你的武将牌上称为「镇」；其回合开始时归还一张并摸一张。
defineSkill({
  id: 'zhenjun', name: '镇军',
  reclaimCards(p) { const a = (p.zhen || []).map(r => r.card).filter(Boolean); p.zhen = []; return a; },
  desc: '出牌阶段限一次，你可以将一名其他角色装备区里的一张牌置于你的武将牌上，称为「镇」；该角色的回合开始时，你须将一张「镇」置入弃牌堆，然后其摸一张牌。',
  active: {
    perPhase: true,
    prompt: '把其他角色装备区一张牌置于你的武将牌上（称「镇」）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && Object.values(x.equips).some(Boolean));
      if (!cands.length) { await ctx.log('【镇军】：没有可夺取装备的角色'); return; }
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【镇军】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const eqs = Object.entries(t.equips).filter(([, c]) => c);
      if (!eqs.length) return;
      let idx = 0;
      if (eqs.length > 1) {
        const i = await ctx.ask.choose(p, eqs.map(([, c]) => cardLabel(c)), { prompt: '【镇军】：选择一张装备', reason: 'zhenjun' });
        if (i < 0) return;
        idx = i;
      }
      const [slot, c] = eqs[idx];
      await g.unequipCard(t, c, { reason: 'zhenjun' });
      p.zhen = p.zhen || [];
      p.zhen.push({ card: c, owner: t.seat });
      await ctx.log(`${p.name} 发动【镇军】：将 ${t.name} 的 ${cardLabel(c)} 置于武将牌上（「镇」${p.zhen.length} 张）`);
    },
  },
  triggers: [{
    on: 'phase.begin', who: 'any', optional: false,
    filter: (d) => d.phase === 'prepare' && d.self !== d.player && (d.player.zhen || []).some(z => z.owner === d.self.seat),
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self;
      const i = (p.zhen || []).findIndex(z => z.owner === t.seat);
      if (i < 0) return;
      const z = p.zhen.splice(i, 1)[0];
      ctx.game.discardPile.push(z.card);
      await ctx.draw(t, 1, { reason: 'zhenjun' });
      await ctx.log(`${p.name} 的「镇」归还：${cardLabel(z.card)} 置入弃牌堆，${t.name} 摸一张牌`);
    },
  }],
});

// 曹植 · 落英：其他角色的梅花牌因弃置或判定进入弃牌堆时，你可以获得之。
defineSkill({
  id: 'luoying', name: '落英',
  desc: '当其他角色的梅花牌因弃置或判定而进入弃牌堆时，你可以获得之。',
  triggers: [
    {
      on: 'cards.discard', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && (d.cards || []).some(c => suitOf(d.self, c) === 'club'),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const clubs = (ctx.data.cards || []).filter(c => suitOf(ctx.data.self, c) === 'club');
        // 用 taken 声明接走：discardCards 路径下引擎不会把牌放进弃牌堆；
        // useCard / respondCard 路径（先入堆再派发事件）下，引擎在事件后按 taken 从弃牌堆摘除（settleTaken）。
        ctx.data.taken = ctx.data.taken || [];
        for (const c of clubs) if (!ctx.data.taken.includes(c)) ctx.data.taken.push(c);
        await ctx.gain(p, clubs, { reason: 'luoying' });
        await ctx.log(`${p.name} 发动【落英】，获得 ${clubs.length} 张梅花牌`);
      },
    },
    {
      on: 'judge.after', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && d.card && d.card.suit === 'club',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        takeFromDiscard(g, [ctx.data.card]);
        await ctx.gain(p, [ctx.data.card], { reason: 'luoying' });
        await ctx.log(`${p.name} 发动【落英】，获得判定牌 ${cardLabel(ctx.data.card)}`);
      },
    },
  ],
});

// 曹植 · 酒诗：黑桃手牌当【酒】（转化规则见 virtual-yj2011.js）；濒死时可翻面视为使用一张【酒】。
defineSkill({
  id: 'jiushi_shi', name: '酒诗',
  desc: '你可以将一张黑桃手牌当【酒】使用；当你处于濒死状态时，你可以将武将牌翻面，视为使用一张【酒】。',
  triggers: [{
    on: 'dying.begin', who: 'self', optional: true,
    filter: (d) => d.self.alive !== false && d.self.hp <= 0 && !d.self.flipped,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.flip(p);
      await ctx.recover(p, 1, { reason: 'jiushi_shi' });
      await ctx.log(`${p.name} 发动【酒诗】：翻面并视为使用一张【酒】，回复 1 点体力`);
    },
  }],
});

// ================= 蜀 =================

// 法正 · 恩怨：受伤后来源须交一张红桃手牌否则你摸一张；回复体力后可令一名角色摸一张。
defineSkill({
  id: 'enyuan', name: '恩怨',
  desc: '每当你受到 1 点伤害后，伤害来源须交给你一张红桃手牌，否则你摸一张牌；每当你回复 1 点体力后，你可以令一名其他角色摸一张牌。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => (d.amount || 0) > 0 && !!d.from && d.from !== d.self && d.from.alive,
      async effect(ctx) {
        const p = ctx.self, src = ctx.data.from;
        const hearts = src.hand.filter(c => suitOf(src, c) === 'heart');
        const res = hearts.length
          ? await ctx.game.ask(src, 'card', { prompt: '【恩怨】：交给他一张红桃手牌，否则他摸一张牌', cards: hearts.map(c => c.id), optional: true, reason: 'enyuan' })
          : null;
        const c = res && res.cardId ? hearts.find(x => x.id === res.cardId) : null;
        if (c) {
          await ctx.gain(p, [c], { from: src, reason: 'enyuan' });
          await ctx.log(`【恩怨】：${src.name} 交给 ${p.name} ${cardLabel(c)}`);
        } else {
          await ctx.draw(p, 1, { reason: 'enyuan' });
          await ctx.log(`【恩怨】：${src.name} 未交红桃牌，${p.name} 摸一张牌`);
        }
      },
    },
    {
      on: 'hp.recover', who: 'self', optional: true,
      filter: (d) => (d.count || 0) > 0 && d.game.alive().some(x => x !== d.self),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: g.alive().filter(x => x !== p), prompt: '【恩怨】：令一名其他角色摸一张牌' });
        if (!ts.length) return;
        await ctx.draw(ts[0], 1, { reason: 'enyuan' });
        await ctx.log(`【恩怨】：${ts[0].name} 摸一张牌`);
      },
    },
  ],
});

// 法正 · 眩惑：交给一名其他角色一张手牌，其选择：交给你一张牌并让你摸一张；或让你获得其一张牌。
defineSkill({
  id: 'xuanhuo', name: '眩惑',
  desc: '出牌阶段限一次，你可以交给一名其他角色一张手牌，然后令其选择一项：1. 交给你一张牌，然后你摸一张牌；2. 令你获得其一张牌。',
  active: {
    perPhase: true,
    prompt: '交给一名其他角色一张手牌，然后其二选一',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【眩惑】：没有手牌'); return; }
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【眩惑】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const c = await pickHand(ctx, p, () => true, '【眩惑】：交给对方一张手牌');
      if (!c) return;
      await ctx.gain(t, [c], { from: p, reason: 'xuanhuo' });
      const i = await ctx.ask.choose(t, ['交给他一张牌，然后他摸一张牌', '令他获得你的一张牌'], { prompt: '【眩惑】：选择一项', reason: 'xuanhuo' });
      if (i === 0) {
        const t2 = t.hand.length ? await pickHand(ctx, t, () => true, '【眩惑】：交给对方一张牌') : null;
        if (t2) await ctx.gain(p, [t2], { from: t, reason: 'xuanhuo' });
        await ctx.draw(p, 1, { reason: 'xuanhuo' });
        await ctx.log(`【眩惑】：${t.name} 交给 ${p.name} 一张牌，${p.name} 摸一张牌`);
      } else {
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        if (pool.length) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          await ctx.gain(p, [pick], { from: t, reason: 'xuanhuo' });
          await ctx.log(`【眩惑】：${p.name} 获得 ${t.name} 的 ${cardLabel(pick)}`);
        }
      }
    },
  },
});

// 马谡 · 心战：看牌堆顶三张，展示其中红桃牌并获得，其余以任意顺序置于牌堆顶（简化为原序放回）。
defineSkill({
  id: 'xinzhan', name: '心战',
  desc: '出牌阶段限一次，你可以观看牌堆顶三张牌，然后展示其中任意数量的红桃牌并获得之，其余以任意顺序置于牌堆顶。',
  active: {
    perPhase: true,
    prompt: '看牌堆顶三张，获得其中的红桃牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const top = g.deck.splice(-3);   // 牌堆顶在数组末尾（与 popDeck 一致）
      if (!top.length) { await ctx.log('【心战】：牌堆已空'); return; }
      const hearts = top.filter(c => c.suit === 'heart');
      const rest = top.filter(c => c.suit !== 'heart');
      if (hearts.length) {
        await ctx.gain(p, hearts, { reason: 'xinzhan' });
      }
      g.deck.push(...rest);
      await ctx.log(`${p.name} 发动【心战】：亮出 ${top.length} 张（${top.map(c => cardLabel(c)).join('、')}），获得其中 ${hearts.length} 张红桃牌`);
    },
  },
});

// 马谡 · 挥泪（锁定技）：死亡时，杀死你的角色弃置其所有牌。
defineSkill({
  id: 'huilei', name: '挥泪',
  desc: '锁定技，当你死亡时，杀死你的角色弃置其所有牌。',
  triggers: [{
    on: 'death.before', who: 'self', optional: false,
    filter: (d) => !!d.killer && d.killer !== d.self,
    async effect(ctx) {
      const k = ctx.data.killer;
      const all = [...k.hand, ...Object.values(k.equips).filter(Boolean)];
      if (all.length) await ctx.discard(k, all, { reason: 'huilei' });
      await ctx.log(`${ctx.self.name} 发动【挥泪】：${k.name} 弃置所有牌（${all.length} 张）`);
    },
  }],
});

// 徐庶 · 无言（锁定技）：造成的/受到的锦囊牌伤害均为 0。
defineSkill({
  id: 'wuyan', name: '无言',
  desc: '锁定技，你造成的锦囊牌伤害与受到的锦囊牌伤害均视为 0。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => (d.amount || 0) > 0 && d.card && CARD_META[d.card.name]?.type === 'trick'
      && (d.from === d.player || d.self === d.player),
    async effect(ctx) {
      ctx.data.amount = 0;
      await ctx.log(`${ctx.self.name} 发动【无言】：锦囊牌伤害视为 0`);
    },
  }],
});

// 徐庶 · 举荐：弃一张非基本牌，令一名其他角色摸两张牌，然后其弃置两张牌。
defineSkill({
  id: 'jujian', name: '举荐',
  desc: '出牌阶段限一次，你可以弃置一张非基本牌，然后令一名其他角色摸两张牌，若如此做，该角色弃置两张牌。',
  active: {
    perPhase: true,
    prompt: '弃一张非基本牌，令一名其他角色摸两张然后弃两张',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const c = await pickHand(ctx, p, x => CARD_META[x.name]?.type !== 'basic', '【举荐】：弃置一张非基本牌');
      if (!c) { await ctx.log('【举荐】：没有非基本牌可弃'); return; }
      await ctx.discard(p, [c], { reason: 'jujian' });
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【举荐】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      await ctx.draw(t, 2, { reason: 'jujian' });
      const res = await g.ask(t, 'cards', { prompt: '【举荐】：弃置两张手牌', min: Math.min(2, t.hand.length), max: Math.min(2, t.hand.length), candidates: t.hand.map(x => x.id), reason: 'jujian' });
      const ids = (res && res.cardIds) || [];
      const cs = t.hand.filter(x => ids.includes(x.id));
      if (cs.length) await ctx.discard(t, cs, { reason: 'jujian' });
      await ctx.log(`${p.name} 发动【举荐】：${t.name} 摸两张牌并弃置 ${cs.length} 张`);
    },
  },
});

// ================= 吴 =================

// 凌统 · 旋风：失去装备区里的牌时，可以弃置一名其他角色的一张牌。
defineSkill({
  id: 'xuanfeng', name: '旋风',
  desc: '当你失去装备区里的牌时，你可以弃置一名其他角色的一张牌。',
  triggers: [{
    on: 'equip.lose', who: 'self', optional: true,
    filter: (d) => d.self.alive && d.game.alive().some(x => x !== d.self && (x.hand.length || Object.values(x.equips).some(Boolean))),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && (x.hand.length || Object.values(x.equips).some(Boolean)));
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【旋风】：选择一名角色，弃置其一张牌' });
      if (!ts.length) return;
      const c = await g.chooseCardFrom(p, ts[0], { reason: 'xuanfeng' });
      if (c) await ctx.discard(ts[0], [c], { reason: 'xuanfeng' });
      await ctx.log(`${p.name} 发动【旋风】：弃置 ${ts[0].name} 的 ${c ? cardLabel(c) : '（无）'}`);
    },
  }],
});

// 徐盛 · 破军：使用【杀】造成伤害后，将目标至多 X 张牌置于其武将牌上，其回合结束时收回（X 为其体力值）。
defineSkill({
  id: 'pojun', name: '破军',
  desc: '当你使用【杀】对目标角色造成伤害后，你可以将其至多 X 张牌置于其武将牌上（X 为其体力值），其回合结束时收回这些牌。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: true,
      filter: (d) => d.card && d.card.name === 'sha' && d.from === d.player && d.self !== d.player && d.self.alive,
      async effect(ctx) {
        const t = ctx.data.self;
        const x = Math.min(t.hp, t.hand.length + Object.values(t.equips).filter(Boolean).length);
        if (x <= 0) return;
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        const moved = [];
        for (let i = 0; i < x; i++) {
          if (!pool.length) break;
          const c = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
          moved.push(c);
        }
        for (const c of moved) {
          const hi = t.hand.indexOf(c);
          if (hi >= 0) t.hand.splice(hi, 1);
          await ctx.game.unequipCard(t, c, { reason: 'pojun' });
        }
        t.jun = t.jun || [];
        // 记归属（heldFrom=施放者座次）：回收时只退自己扣的牌（SG035-r2 P1）
        for (const c of moved) if (c) c.heldFrom = ctx.self.seat;
        t.jun.push(...moved);
        await ctx.log(`${ctx.self.name} 发动【破军】：将 ${t.name} 的 ${moved.length} 张牌置于其武将牌上`);
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'end' && (d.self.jun || []).length > 0,
      async effect(ctx) {
        const t = ctx.data.self;
        const cards = t.jun || [];
        t.jun = [];
        await ctx.gain(t, cards, { reason: 'pojun' });
        await ctx.log(`【破军】：${t.name} 收回 ${cards.length} 张牌`);
      },
    },
  ],
});

// 吴国太 · 甘露：选两名角色，交换他们装备区里的所有牌。
defineSkill({
  id: 'ganlu', name: '甘露',
  desc: '出牌阶段限一次，你可以选择两名角色，交换他们装备区里的所有牌。',
  active: {
    perPhase: true,
    prompt: '选择两名角色，交换他们装备区的所有牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => Object.values(x.equips).some(Boolean));
      if (cands.length < 2) { await ctx.log('【甘露】：装备区有牌的角色不足两名'); return; }
      const ts = await ctx.ask.targets(p, { min: 2, max: 2, candidates: cands, prompt: '【甘露】：选择两名角色' });
      if (ts.length < 2) return;
      const [a, b] = ts;
      // ★SG034 P0：整区交换必须逐槽走 swapEquipSlot（各自派 lose + change + afterEquipLose）
      //   原实现直接 `a.equips = eb; b.equips = ea` 后只补派两个 weapon 的 change，零 lose →
      //   精械弩/飒然/降怒在交换后全部残留。
      for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus', 'treasure']) {
        await g.swapEquipSlot(a, b, slot, { reason: 'ganlu' });
      }
      await ctx.log(`${p.name} 发动【甘露】：${a.name} 与 ${b.name} 交换了装备区的所有牌`);
    },
  },
});

// 吴国太 · 补益：一名角色进入濒死状态时，可展示其一张手牌，若不为基本牌，其回复 1 点体力。
defineSkill({
  id: 'buyi', name: '补益',
  desc: '当一名角色进入濒死状态时，你可以展示其一张手牌，若此牌不为基本牌，该角色回复 1 点体力。',
  triggers: [{
    on: 'dying.begin', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && d.self.alive !== false && d.self.hand.length > 0,
    async effect(ctx) {
      const t = ctx.data.self;
      const c = t.hand[Math.floor(Math.random() * t.hand.length)];
      await ctx.log(`【补益】：展示 ${t.name} 的手牌 ${cardLabel(c)}`);
      if (CARD_META[c.name]?.type !== 'basic') {
        await ctx.recover(t, 1, { reason: 'buyi' });
        await ctx.log(`【补益】：${t.name} 回复 1 点体力`);
      }
    },
  }],
});

// ================= 群 =================

// 陈宫 · 明策：把一张装备牌或【杀】交给一名其他角色，其选择：视为对你指定的角色使用一张【杀】；或摸一张牌。
defineSkill({
  id: 'mingce', name: '明策',
  desc: '出牌阶段限一次，你可以将一张装备牌或【杀】交给一名其他角色，然后令其选择一项：1. 视为对你指定的一名角色使用一张【杀】；2. 摸一张牌。',
  active: {
    perPhase: true,
    prompt: '把一张装备牌或【杀】交给其他角色，其选择出杀或摸牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = await pickHand(ctx, p, x => CARD_META[x.name]?.sub || x.name === 'sha', '【明策】：交出一张装备牌或【杀】');
      if (!c) { await ctx.log('【明策】：没有装备牌或【杀】'); return; }
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【明策】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      await ctx.gain(t, [c], { from: p, reason: 'mingce' });
      const i = await ctx.ask.choose(t, ['视为对指定角色使用一张【杀】', '摸一张牌'], { prompt: '【明策】：选择一项', reason: 'mingce' });
      if (i === 0) {
        const enemies = g.alive().filter(x => x !== t && x !== p);
        if (!enemies.length) { await ctx.draw(t, 1, { reason: 'mingce' }); return; }
        const ts2 = await ctx.ask.targets(p, { min: 1, max: 1, candidates: enemies, prompt: '【明策】：指定【杀】的目标' });
        if (!ts2.length) { await ctx.draw(t, 1, { reason: 'mingce' }); return; }
        const sha = { id: `v${Date.now()}`, name: 'sha', suit: 'none', num: 0, type: 'basic', virtual: true };
        await ctx.useCard({ from: t, card: sha, targets: [ts2[0]], reason: 'mingce' });
      } else {
        await ctx.draw(t, 1, { reason: 'mingce' });
        await ctx.log(`【明策】：${t.name} 摸一张牌`);
      }
    },
  },
});

// 陈宫 · 智迟（锁定技）：你的回合外，受到伤害后，本回合你不能再受到伤害。
defineSkill({
  id: 'zhichi', name: '智迟',
  desc: '锁定技，你的回合外，当你受到伤害后，本回合你不能再受到伤害。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => (d.amount || 0) > 0 && d.game.turnPlayer !== d.self,
      async effect(ctx) {
        ctx.self.flags.zhichiTurn = ctx.game.turnCount;
        await ctx.log(`${ctx.self.name} 发动【智迟】：本回合不再受到伤害`);
      },
    },
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => (d.amount || 0) > 0 && d.self.flags.zhichiTurn === d.game.turnCount,
      async effect(ctx) {
        ctx.data.amount = 0;
        await ctx.log(`【智迟】：${ctx.self.name} 本回合不再受到伤害`);
      },
    },
  ],
});

// 高顺 · 陷阵：与一名其他角色拼点，赢则本回合对其使用【杀】无距离限制且其不能使用【闪】；没赢则本回合不能使用【杀】。
defineSkill({
  id: 'xianzhen', name: '陷阵',
  desc: '出牌阶段限一次，你可以与一名其他角色拼点：若你赢，本回合你对其使用【杀】无距离限制且其不能使用【闪】；若你没赢，本回合你不能使用【杀】。',
  active: {
    perPhase: true,
    prompt: '与一名其他角色拼点',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【陷阵】：没有手牌可拼点'); return; }
      const cands = g.alive().filter(x => x !== p && x.hand.length);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【陷阵】：选择拼点对象' });
      if (!ts.length) return;
      const t = ts[0];
      const r = await pindian(g, p, t, { reason: '陷阵' });
      if (r.win) {
        p.flags.xianzhenWin = { seat: t.seat, turn: g.turnCount };
        await ctx.log(`${p.name} 发动【陷阵】获胜：本回合对 ${t.name} 使用【杀】无距离限制且其不能使用【闪】`);
      } else {
        p.flags.xianzhenLose = g.turnCount;
        await ctx.log(`${p.name} 发动【陷阵】未赢：本回合不能使用【杀】`);
      }
    },
  },
  triggers: [{
    on: 'target.after', who: 'any', optional: false,
    filter: (d) => {
      if (!d.card || d.card.name !== 'sha' || d.target !== d.player) return false;
      const w = d.self.flags.xianzhenWin;
      return !!w && w.turn === d.game.turnCount && w.seat === d.target.seat;
    },
    async effect(ctx) {
      if (ctx.data.shaCtx) ctx.data.shaCtx.unavoidable = true;
      await ctx.log(`【陷阵】：${ctx.data.target.name} 不能使用【闪】响应此【杀】`);
    },
  }],
});

// 高顺 · 禁酒（锁定技）：你不能使用【酒】。
defineSkill({
  id: 'jinjiu', name: '禁酒',
  desc: '锁定技，你不能使用【酒】。',
  banUse: ['jiu'],
});

export const YJ2011_SKILL_IDS = ['jueqing', 'shangshi', 'zhenjun', 'luoying', 'jiushi_shi', 'enyuan', 'xuanhuo',
  'xinzhan', 'huilei', 'wuyan', 'jujian', 'xuanfeng', 'pojun', 'ganlu', 'buyi', 'mingce', 'zhichi', 'xianzhen', 'jinjiu'];
