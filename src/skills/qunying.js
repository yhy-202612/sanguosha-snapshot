// 群英荟萃（E 批 20 将）
// 十周年「一将成名」系列 + 群英荟萃各子包代表武将
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';

let vseq = 0;
const vcard = (name, suit = 'spade', num = 7) => ({
  id: `vq${++vseq}`, name, suit, num, type: CARD_META[name]?.type, virtual: true,
});
const typeOf = (c) => CARD_META[c?.name]?.type;
const cnOf = (c) => CARD_META[c?.name]?.cn || c?.name || '?';
const isRedCard = (c) => c && (c.suit === 'heart' || c.suit === 'diamond');
const suitText = (c) => (c ? SUIT_CN[c.suit] || '' : '');
const others = (g, p) => g.alive().filter(q => q !== p);
const newTurn = (p, key, g) => p.flags[key] !== g.turnCount;

// 通用：摸至 n 张
const drawTo = async (ctx, p, n, reason) => {
  const need = n - p.hand.length;
  if (need > 0) await ctx.draw(p, need, { reason });
  return need;
};
// 通用：从一名角色区域（手牌/装备/判定）里选一张牌（不移动）
const pickZoneCard = async (ctx, from, target, { prompt = '选择一张牌', includeJudge = true } = {}) => {
  const g = ctx.game;
  const pool = [
    ...target.hand,
    ...Object.values(target.equips).filter(Boolean),
    ...(includeJudge ? target.judgeZone.map(z => z.card) : []),
  ].filter(Boolean);
  if (!pool.length) return null;
  return (await g.chooseSomeCards(from, pool, 1, { prompt, optional: false }))[0] || null;
};

// ==================== 李婉 · 联对（魏 · 3） ====================
// 你使用牌时，若上一张牌的使用者不为你，你可以令其摸两张牌；
// 其他角色使用牌时，若上一张牌的使用者为你，其可以令你摸两张牌。
const lastUseOwner = new WeakMap();
defineSkill({
  id: 'liandui', name: '联对',
  desc: '当你使用牌时，若上一张牌的使用者不为你，你可以令其摸两张牌；其他角色使用牌时，若上一张牌的使用者为你，其可以令你摸两张牌。',
  triggers: [
    {
      // priority 高：先结算效果，再由低优先级触发更新「上一张牌的使用者」
      on: 'card.use.after', who: 'any', optional: false, priority: 10,
      filter: (d) => !!(d.card && d.self) && !!lastUseOwner.get(d.game),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const prev = lastUseOwner.get(g);
        if (!prev || !prev.alive) return;
        if (d.self === p && prev !== p) {
          const yes = await ctx.ask.confirm(p, `【联对】：令上一张牌的使用者 ${prev.name} 摸两张牌？`);
          if (yes) {
            await ctx.draw(prev, 2, { reason: 'liandui' });
            await ctx.log(`【联对】：${prev.name} 摸两张牌`);
          }
        } else if (d.self !== p && prev === p) {
          const yes = await ctx.ask.confirm(d.self, `【联对】：是否令 ${p.name} 摸两张牌？`);
          if (yes) {
            await ctx.draw(p, 2, { reason: 'liandui' });
            await ctx.log(`【联对】：${p.name} 摸两张牌`);
          }
        }
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: false, priority: -100,
      filter: (d) => !!d.self,
      async effect(ctx) {
        lastUseOwner.set(ctx.game, ctx.data.self);
      },
    },
  ],
});

// ==================== 李婉 · 别君（魏 · 3） ====================
defineSkill({
  id: 'biejun', name: '别君',
  desc: '其他角色的出牌阶段限一次，其可以交给你一张手牌。当你每回合第一次受到伤害时，若你手牌中没有本回合以此法获得的牌，你可以翻面并防止此伤害。',
  triggers: [
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'play' && d.self !== d.player && d.self.hand.length > 0
        && d.self.flags.biejunTurn !== d.game.turnCount,
      async effect(ctx) {
        const d = ctx.data, p = ctx.self, g = ctx.game;
        const giver = d.self;
        const yes = await ctx.ask.confirm(giver, `【别君】：是否交给 ${p.name} 一张手牌？`);
        if (!yes) return;
        giver.flags.biejunTurn = g.turnCount;
        const c = (await g.chooseSomeCards(giver, giver.hand.slice(), 1, { prompt: '【别君】：选择交给的牌', optional: false }))[0];
        if (!c) return;
        const i = giver.hand.indexOf(c);
        if (i >= 0) giver.hand.splice(i, 1);
        c.skillTag = 'biejun';
        c.biejunTurn = g.turnCount;
        p.hand.push(c);
        await g.trigger('zone.in', { self: p, cards: [c] });
        await ctx.log(`【别君】：${giver.name} 交给 ${p.name} ${cardLabel(c)}`);
      },
    },
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => !d.self.flags.biejunGuardTurn || d.self.flags.biejunGuardTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const hasBie = p.hand.some(c => c.skillTag === 'biejun' && c.biejunTurn === g.turnCount);
        if (hasBie) return;
        const yes = await ctx.ask.confirm(p, '【别君】：翻面并防止此伤害？');
        if (!yes) return;
        d.canceled = true;
        p.flags.biejunGuardTurn = g.turnCount;
        await ctx.flip(p);
        await ctx.log(`【别君】：${p.name} 翻面并防止此伤害`);
      },
    },
  ],
});

// ==================== 韩龙 · 独往（魏 · 4） ====================
// 锁定技，游戏开始时，你将牌堆顶五张不为【杀】的牌置于武将牌上，称为「刺」。
// 若你有「刺」，你和其他角色互相计算距离时均+1。
defineSkill({
  id: 'duwang', name: '独往',
  desc: '锁定技，游戏开始时，你将牌堆顶五张不为【杀】的牌置于武将牌上，称为「刺」。若你有「刺」，你和其他角色互相计算距离时均+1。',
  triggers: [
    {
      on: 'game.start', who: 'any', optional: false,
      filter: (d) => d.game && !d.game.__duwangDone,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (g.__duwangDone) return;
        g.__duwangDone = true;
        const picked = [];
        let scan = 0;
        while (picked.length < 5 && scan < 60 && g.deck.length) {
          scan += 1;
          const c = g.deck.pop();
          if (!c) break;
          if (c.name === 'sha') g.deck.unshift(c);
          else picked.push(c);
        }
        p.flags.ci = picked;
        await g.trigger('zone.out', { self: p, cards: picked });
        await ctx.log(`【独往】：将 ${picked.length} 张牌置于武将牌上，称为「刺」`);
      },
    },
    {
      on: 'distance.calc', who: 'any', optional: false,
      // 注意：distance.calc 走 triggerSync，引擎不会调用 filter，必须在这里自行校验
      effect(ctx) {
        const d = ctx.data, p = ctx.self;
        if (!p || !d) return;
        if (d.self !== p && d.to !== p) return;
        if ((p.flags.ci || []).length === 0) return;
        d.value += 1;
      },
    },
  ],
});

// ==================== 韩龙 · 刺北（魏 · 4） ====================
defineSkill({
  id: 'cibei', name: '刺北',
  desc: '当任意角色使用的【杀】造成伤害并进入弃牌堆时，你可以将此牌与一张不为【杀】的「刺」交换，然后弃置一名角色区域内的一张牌；每个回合结束时，若「刺」均为【杀】，你获得所有「刺」，以此法获得的【杀】不能被弃置（不计手牌上限）且无次数和距离限制。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: true,
      filter: (d) => !!d.card && d.card.name === 'sha' && (d.player.flags.ci || []).some(c => c.name !== 'sha'),
      prompt: '是否用此【杀】交换一张「刺」？',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const ci = p.flags.ci || [];
        const idx = ci.findIndex(c => c.name !== 'sha');
        if (idx < 0) return;
        const out = ci[idx];
        const sha = d.card;
        ci[idx] = sha;
        p.flags.ci = ci;
        const di = g.discardPile.indexOf(sha);
        if (di >= 0) g.discardPile.splice(di, 1);
        if (!g.discardPile.includes(out)) g.discardPile.push(out);
        await g.trigger('zone.out', { self: p, cards: [sha] });
        await ctx.log(`【刺北】：以此【杀】交换「刺」${cardLabel(out)}`);
        const cands = g.alive();
        const t = (await ctx.ask.targets(p, { candidates: cands, min: 0, max: 1, prompt: '【刺北】：弃置一名角色区域内的一张牌' }))[0];
        if (!t) return;
        const c = await pickZoneCard(ctx, p, t, { prompt: '【刺北】：选择弃置的牌' });
        if (c) await ctx.discard(t, [c], { reason: 'cibei' });
      },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => (d.player.flags.ci || []).length > 0 && (d.player.flags.ci || []).every(c => c.name === 'sha'),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const ci = p.flags.ci || [];
        p.flags.ci = [];
        await g.trigger('zone.in', { self: p, cards: ci });
        for (const c of ci) {
          const i = g.discardPile.indexOf(c);
          if (i >= 0) g.discardPile.splice(i, 1);
          c.skillTag = 'ci';
          // ★牌级豁免（SG030 A4.2）：「以此法获得的【杀】不受次数限制、无距离限制」是**牌自身**的属性，
          //   写 flags（shaExtraTurn / freeRangeTurn）会在回合结束时被清零 → 效果全无。
          c.ignoreShaLimit = true;
          c.ignoreRange = true;
          p.hand.push(c);
        }
        // 兼容口径：本回合内（若在回合内获得）也放宽一次次数上限
        p.flags.shaExtraTurn = Math.max(p.flags.shaExtraTurn || 0, ci.length);
        p.flags.freeRangeTurn = g.turnCount;
        await ctx.log(`【刺北】：${p.name} 获得所有「刺」（${ci.length} 张），这些【杀】不受次数与距离限制`);
      },
    },
  ],
});

// ==================== 夏侯楙 · 统围（魏 · 4） ====================
defineSkill({
  id: 'tongwei', name: '统围',
  desc: '出牌阶段限一次，你可以选择一名其他角色，然后你重铸两张牌。若如此做，其使用下一张牌结算后，若此牌点数为你上次此法重铸牌点数之间，你视为对其使用一张【杀】或【过河拆桥】。',
  active: {
    perPhase: true,
    prompt: '统围',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { candidates: others(g, p), min: 1, max: 1, prompt: '【统围】：选择一名其他角色' }))[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 2, { prompt: '【统围】：选择两张牌重铸', optional: false });
      if (picks.length < 2) { await ctx.log('【统围】：重铸失败（牌不足）'); return; }
      await ctx.discard(p, picks, { reason: 'tongwei' });
      await ctx.draw(p, 2, { reason: 'tongwei' });
      const nums = picks.map(c => c.num).sort((a, b) => a - b);
      p.flags.tongwei = { seat: t.seat, min: nums[0], max: nums[nums.length - 1] };
      await ctx.log(`【统围】：重铸点数 ${nums.join('、')}，监视 ${t.name}`);
    },
  },
  triggers: [
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!d.player.flags.tongwei && d.self.seat === d.player.flags.tongwei.seat,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const rec = p.flags.tongwei;
        p.flags.tongwei = null;
        const t = d.self;
        const num = d.card?.num || 0;
        if (!(num >= rec.min && num <= rec.max)) {
          await ctx.log(`【统围】：${cardLabel(d.card)}（${num}）不在 ${rec.min}~${rec.max} 之间`);
          return;
        }
        const yes = await ctx.ask.confirm(p, `【统围】：${cardLabel(d.card)} 点数在 ${rec.min}~${rec.max} 之间，是否视为对其使用【杀】或【过河拆桥】？`);
        if (!yes) return;
        const pick = await ctx.ask.choose(p, ['视为使用【杀】', '视为使用【过河拆桥】'], { prompt: '【统围】：选择一项' });
        const name = pick === 1 ? 'guohe' : 'sha';
        const vb = vcard(name, 'spade', 7);
        await ctx.log(`【统围】：视为对 ${t.name} 使用【${CARD_META[name].cn}】`);
        await ctx.useCard({ from: p, card: vb, targets: [t], reason: 'tongwei' });
      },
    },
  ],
});

// ==================== 夏侯楙 · 蹙国（魏 · 4） ====================
defineSkill({
  id: 'cuguo', name: '蹙国',
  desc: '锁定技，当你每回合使用牌首次被抵消后，你弃置一张牌，令此牌对目标角色再结算一次，此牌结算后，若仍被抵消，你失去1点体力。',
  triggers: [
    {
      on: 'sha.dodged', who: 'any', optional: false,
      filter: (d) => d.self === d.player && d.player.flags.cuguoTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const t = d.target;
        if (!t || !t.alive) return;
        p.flags.cuguoTurn = g.turnCount;
        const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
        if (pool.length) {
          const c = (await ctx.game.chooseSomeCards(p, pool, 1, { prompt: '【蹙国】：弃置一张牌', optional: false }))[0];
          if (c) await ctx.discard(p, [c], { reason: 'cuguo' });
        }
        const hp0 = t.hp;
        await ctx.log(`【蹙国】：令 ${cardLabel(d.card)} 对 ${t.name} 再结算一次`);
        await g.resolveSha(p, t, d.card, { unavoidable: false });
        if (p.alive && t.alive && t.hp === hp0) {
          await ctx.log('【蹙国】：此牌仍被抵消');
          await ctx.loseHp(p, 1, { reason: 'cuguo' });
        }
      },
    },
  ],
});

// ==================== 费曜 · 镇锋（魏 · 4） ====================
defineSkill({
  id: 'zhenfeng', name: '镇锋',
  desc: '每回合限一次，当其他角色于其回合内使用一张牌时，若其手牌数不大于体力值，你可以猜测其手牌中与此牌类别相同的牌数。若你：猜对，你摸X张牌（X为你连续猜对的次数，至多为5）并视为对其使用一张【杀】；猜错且差值大于1，其视为对你使用一张【杀】。',
  triggers: [
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.self === d.game.turnPlayer
        && d.self.hand.length <= d.self.hp && !!typeOf(d.card)
        && d.player.flags.zhenfengTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const t = d.self;
        const type = typeOf(d.card);
        const yes = await ctx.ask.confirm(p, `【镇锋】：是否猜测 ${t.name} 手牌中${CARD_META[d.card.name]?.cn ? ({ basic: '基本牌', trick: '锦囊牌', equip: '装备牌' }[type]) : ''}数量？`);
        if (!yes) return;
        p.flags.zhenfengTurn = g.turnCount;
        const guess = await ctx.ask.choose(p, ['0', '1', '2', '3', '4', '5'], { prompt: '【镇锋】：猜测该类别的张数' });
        const real = t.hand.filter(c => typeOf(c) === type).length;
        const diff = Math.abs((guess < 0 ? 0 : guess) - real);
        await ctx.log(`【镇锋】：猜测 ${guess < 0 ? 0 : guess}，实际 ${real}`);
        if (diff === 0) {
          p.flags.zhenfengHit = Math.min(5, (p.flags.zhenfengHit || 0) + 1);
          const n = p.flags.zhenfengHit;
          await ctx.draw(p, n, { reason: 'zhenfeng' });
          await ctx.log(`【镇锋】：连续猜对 ${n} 次，视为对 ${t.name} 使用【杀】`);
          await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'zhenfeng' });
        } else {
          p.flags.zhenfengHit = 0;
          if (diff > 1) {
            await ctx.log(`【镇锋】：猜错（差 ${diff}），${t.name} 视为对 ${p.name} 使用【杀】`);
            await ctx.useCard({ from: t, card: vcard('sha'), targets: [p], reason: 'zhenfeng' });
          }
        }
      },
    },
  ],
});

// ==================== 孙礼 · 伉厉（魏 · 4） ====================
defineSkill({
  id: 'kangli', name: '伉厉',
  desc: '当你造成或受到伤害后，你可以摸两张牌，然后你下次造成伤害时弃置这些牌。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: true,
      filter: (d) => d.self === d.player || d.from === d.player,
      prompt: '是否发动【伉厉】摸两张牌？',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cards = await ctx.draw(p, 2, { reason: 'kangli' });
        for (const c of cards) c.skillTag = 'kangli';
        p.flags.kangli = [...(p.flags.kangli || []), ...cards];
        await ctx.log(`【伉厉】：${p.name} 获得 ${cards.length} 张「伉厉」牌`);
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from === d.player && (d.player.flags.kangli || []).some(c => d.player.hand.includes(c)),
      async effect(ctx) {
        const p = ctx.self;
        const live = (p.flags.kangli || []).filter(c => p.hand.includes(c));
        p.flags.kangli = [];
        if (!live.length) return;
        await ctx.discard(p, live, { reason: 'kangli' });
        await ctx.log(`【伉厉】：弃置 ${live.length} 张「伉厉」牌`);
      },
    },
  ],
});

// ==================== 司马孚 · 备预（魏 · 3） ====================
defineSkill({
  id: 'beiyu', name: '备预',
  desc: '出牌阶段限一次，你可以将手牌摸至体力上限，然后将一种花色的所有手牌置于牌堆底。',
  active: {
    perPhase: true,
    prompt: '备预',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      await drawTo(ctx, p, Math.max(1, p.maxHp), 'beiyu');
      const suits = [...new Set(p.hand.map(c => c.suit))];
      if (!suits.length) return;
      const idx = await ctx.ask.choose(p, suits.map(s => `${SUIT_CN[s]}花色`), { prompt: '【备预】：选择一种花色置于牌堆底' });
      const suit = suits[idx < 0 ? 0 : idx];
      const out = p.hand.filter(c => c.suit === suit);
      for (const c of out) {
        const i = p.hand.indexOf(c);
        if (i >= 0) p.hand.splice(i, 1);
      }
      g.deck.unshift(...out);
      await ctx.log(`【备预】：将 ${out.length} 张${SUIT_CN[suit]}牌置于牌堆底`);
    },
  },
});

// ==================== 司马孚 · 督持（魏 · 3） ====================
defineSkill({
  id: 'duchi', name: '督持',
  desc: '每回合限一次，当你成为其他角色使用牌的目标后，你可以从牌堆底摸一张牌并展示所有手牌，若颜色均相同，此牌对你无效。',
  triggers: [
    {
      on: 'target.before', who: 'any', optional: false,
      filter: (d) => {
        if (d.self !== d.player || d.from === d.player) return false;
        if (d.player.flags.duchiTurn === d.game.turnCount) return false;
        if (d.game.deck.length <= 0) return false;
        // 仅能指定自己的牌（桃/酒/无中生有等）被取消会导致无目标，跳过
        const m = CARD_META[d.effName];
        if (!m || m.delayed) return false;
        if (m.target && m.target.self && !m.target.others && !m.target.all) return false;
        return true;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const yes = await ctx.ask.confirm(p, '【督持】：从牌堆底摸一张牌并展示手牌？');
        if (!yes) return;
        p.flags.duchiTurn = g.turnCount;
        const c = g.deck.shift();
        if (c) p.hand.push(c);
        const colors = new Set(p.hand.map(x => (isRedCard(x) ? 'red' : 'black')));
        await ctx.log(`【督持】：从牌堆底摸到 ${cardLabel(c)}，手牌展示：${p.hand.map(cardLabel).join('、')}`);
        if (colors.size === 1) {
          d.canceled = true;
          await ctx.log(`【督持】：手牌颜色均相同，${cardLabel(d.card)} 对 ${p.name} 无效`);
        }
      },
    },
  ],
});

// ==================== 宣公主 · 齐眉（魏 · 3） ====================
defineSkill({
  id: 'qimei', name: '齐眉',
  desc: '出牌阶段限一次，你可以选择一名其他角色，你与其各摸两张牌并展示两张手牌，根据展示牌的花色数，你可以执行以下效果：1.你依次使用之；2.你与其复原武将牌并各回复1点体力；3.你与其重铸这些牌；4.你与其各摸一张牌。',
  active: {
    perPhase: true,
    prompt: '齐眉',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { candidates: others(g, p), min: 1, max: 1, prompt: '【齐眉】：选择一名其他角色' }))[0];
      if (!t) return;
      await ctx.draw(p, 2, { reason: 'qimei' });
      await ctx.draw(t, 2, { reason: 'qimei' });
      const mine = await g.chooseSomeCards(p, p.hand.slice(), Math.min(2, p.hand.length), { prompt: '【齐眉】：展示你的手牌' });
      const his = await g.chooseSomeCards(t, t.hand.slice(), Math.min(2, t.hand.length), { prompt: '【齐眉】：展示对方的手牌' });
      const shown = [...mine, ...his];
      if (!shown.length) return;
      const suits = new Set(shown.map(c => c.suit));
      await ctx.log(`【齐眉】：展示 ${shown.map(cardLabel).join('、')}，共 ${suits.size} 种花色`);
      const n = Math.min(4, suits.size);
      if (n === 1) {
        for (const c of shown) {
          const owner = p.hand.includes(c) ? p : t;
          if (owner !== p) continue;
          const tg = g.autoTargetsFor(p, c) || [];
          if (g.canUse(p, c, tg).ok) await ctx.useCard({ from: p, card: c, targets: tg, reason: 'qimei' });
        }
        await ctx.log('【齐眉】：依次使用展示的牌');
      } else if (n === 2) {
        if (p.flipped) await ctx.flip(p);
        if (t.flipped) await ctx.flip(t);
        await ctx.recover(p, 1, { reason: 'qimei' });
        await ctx.recover(t, 1, { reason: 'qimei' });
        await ctx.log('【齐眉】：你与其复原武将牌并各回复1点体力');
      } else if (n === 3) {
        for (const c of shown) {
          const owner = p.hand.includes(c) ? p : t;
          await ctx.discard(owner, [c], { reason: 'qimei' });
        }
        await ctx.draw(p, mine.length, { reason: 'qimei' });
        await ctx.draw(t, his.length, { reason: 'qimei' });
        await ctx.log('【齐眉】：你与其重铸展示的牌');
      } else {
        await ctx.draw(p, 1, { reason: 'qimei' });
        await ctx.draw(t, 1, { reason: 'qimei' });
        await ctx.log('【齐眉】：你与其各摸一张牌');
      }
    },
  },
});

// ==================== 宣公主 · 追姬（魏 · 3） ====================
// 【追姬】的后续效果（失去以此法获得的装备后废除对应装备栏）不能挂在宣公主自己身上：
// ① death.before 时宣公主已进入濒死/死亡流程，引擎收集触发器会跳过已死亡角色；
// ② equip.lose 事件的 d.player 是技能拥有者、d.self 才是失去装备的人。
// 因此把它做成内部技能 zhuiji_mark，在发动时临时授予「被指定的那名角色」。
defineSkill({
  id: 'zhuiji_mark', name: '追姬·印记', hidden: true,
  desc: '（内部）你以此法获得的装备牌失去后，废除对应的装备栏。',
  triggers: [{
    on: 'equip.lose', who: 'self', optional: false,
    filter: (d) => !!(d.self?.flags?.zhuijiSlot && d.self.flags.zhuijiSlot[d.slot]),
    async effect(ctx) {
      const t = ctx.self, d = ctx.data;
      if (!t.flags.zhuijiSlot?.[d.slot]) return;
      delete t.flags.zhuijiSlot[d.slot];
      t.flags.disabledEquip = t.flags.disabledEquip || {};
      t.flags.disabledEquip[d.slot] = true;
      await ctx.log(`【追姬】：${t.name} 的${SLOT_CN[d.slot] || d.slot}废除`);
    },
  }],
});

defineSkill({
  id: 'zhuiji', name: '追姬',
  desc: '当你死亡时，你可以令一名其他角色为其每个空置的装备栏随机使用一张装备牌，然后当其失去以此法使用的装备牌后，废除对应的装备栏。',
  triggers: [
    {
      on: 'death.before', who: 'self', optional: false,
      filter: () => true,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = others(g, p);
        if (!cands.length) return;
        const yes = await ctx.ask.confirm(p, '【追姬】：是否令一名角色获得装备？');
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【追姬】：选择一名其他角色' }))[0];
        if (!t) return;
        // 标记型内部技能挂到被指定者身上，由他自己结算「失去后废除装备栏」
        if (!(effSkills(t) || []).some(s => s.id === 'zhuiji_mark')) {
          const mark = getSkill('zhuiji_mark');
          if (mark) { t.skills = t.skills || []; t.skills.push(mark); }
        }
        const slots = ['weapon', 'armor', 'horsePlus', 'horseMinus', 'treasure'];
        for (const slot of slots) {
          if (t.equips[slot]) continue;
          const pool = g.deck.filter(c => {
            const sub = CARD_META[c.name]?.sub;
            if (!sub) return false;
            return (slot === 'horsePlus' && sub === 'horse+') || (slot === 'horseMinus' && sub === 'horse-') || sub === slot;
          });
          if (!pool.length) continue;
          const c = g.rng.pick(pool);
          const i = g.deck.indexOf(c);
          if (i >= 0) g.deck.splice(i, 1);
          t.equips[slot] = c;
          t.flags.zhuijiSlot = t.flags.zhuijiSlot || {};
          t.flags.zhuijiSlot[slot] = true;
          await g.trigger('equip.change', { self: t, slot, card: c, old: null });
          await ctx.log(`【追姬】：${t.name} 装备 ${cardLabel(c)}`);
        }
      },
    },
  ],
});

// ==================== 马钧 · 工巧（魏 · 3） ====================
const SLOT_CN = { weapon: '武器栏', armor: '防具栏', horsePlus: '+1 坐骑栏', horseMinus: '-1 坐骑栏' };
defineSkill({
  id: 'gongqiao', name: '工巧',
  desc: '出牌阶段限一次，你可以将一张手牌置于你的任意装备栏（替换原装备）；若你的装备区内有：1.基本牌，你使用基本牌的数值+1；2.锦囊牌，你每回合首次使用一种类型的牌后摸一张牌；3.装备牌，手牌上限+3。',
  active: {
    perPhase: true,
    prompt: '工巧',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) return;
      const slotKeys = ['weapon', 'armor', 'horsePlus', 'horseMinus', 'treasure'];
      const idx = await ctx.ask.choose(p, slotKeys.map(k => SLOT_CN[k]), { prompt: '【工巧】：选择放置的装备栏' });
      const slot = slotKeys[idx < 0 ? 0 : idx];
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【工巧】：选择一张手牌置于装备栏', optional: false }))[0];
      if (!c) return;
      const i = p.hand.indexOf(c);
      if (i >= 0) p.hand.splice(i, 1);
      c.origType = typeOf(c);
      const old = p.equips[slot];
      if (old) {
        p.equips[slot] = null;
        if (!g.discardPile.includes(old)) g.discardPile.push(old);
        await g.trigger('equip.lose', { self: p, card: old, slot });
      }
      p.equips[slot] = c;
      await g.trigger('equip.change', { self: p, slot, card: c, old });
      await ctx.log(`【工巧】：将 ${cardLabel(c)} 置于${SLOT_CN[slot]}`);
      const has = (t) => Object.values(p.equips).some(x => x && (x.origType || typeOf(x)) === t);
      p.flags.handLimit = has('equip') ? 3 : 0;
    },
  },
  triggers: [
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => {
        if (d.from !== d.player || !d.card || d.card.name !== 'sha') return false;
        return Object.values(d.player.equips).some(x => x && (x.origType || typeOf(x)) === 'basic');
      },
      async effect(ctx) {
        const d = ctx.data;
        d.amount += 1;
        // ★SG037：damage.before 的原始 data 里没有 player 字段（player 只由 trigger 注入给 filter），
        //   effect 里必须用 ctx.self（= 技能拥有者，与 filter 的 d.player 同一人），否则静默 ⚠ 不生效。
        await ctx.log(`【工巧】：${ctx.self.name} 的【杀】基础值 +1`);
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => {
        const hasTrick = Object.values(d.player.equips).some(x => x && (x.origType || typeOf(x)) === 'trick');
        if (!hasTrick) return false;
        const key = `gongqiao_${typeOf(d.card)}`;
        return d.player.flags[key] !== d.game.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        p.flags[`gongqiao_${typeOf(d.card)}`] = g.turnCount;
        await ctx.draw(p, 1, { reason: 'gongqiao' });
        await ctx.log(`【工巧】：首次使用${CARD_META[d.card.name]?.cn || ''}后摸一张牌`);
      },
    },
  ],
});

// ==================== 马钧 · 精益（魏 · 3） ====================
defineSkill({
  id: 'jingyi', name: '精益',
  desc: '锁定技，有牌进入你的装备区后，你摸X张牌，然后弃置两张牌（X为你装备区内的牌数）。每个副类别每回合限一次。',
  triggers: [
    {
      on: 'equip.change', who: 'self', optional: false,
      filter: (d) => {
        // ★SG029：只在「有牌进入装备区」时触发；失去装备（引擎补派，card=null/lost:true）不算
        if (!d.card || d.lost === true) return false;
        const sub = CARD_META[d.card?.name]?.sub || d.card?.origType || 'other';
        d.player.flags.jingyiTurn = d.player.flags.jingyiTurn || {};
        return d.player.flags.jingyiTurn[sub] !== d.game.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const sub = CARD_META[d.card?.name]?.sub || d.card?.origType || 'other';
        p.flags.jingyiTurn = p.flags.jingyiTurn || {};
        p.flags.jingyiTurn[sub] = g.turnCount;
        const n = Object.values(p.equips).filter(Boolean).length;
        await ctx.draw(p, n, { reason: 'jingyi' });
        const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(2, p.hand.length), { prompt: '【精益】：弃置两张牌' });
        if (picks.length) await ctx.discard(p, picks, { reason: 'jingyi' });
        await ctx.log(`【精益】：摸 ${n} 张并弃置 ${picks.length} 张`);
      },
    },
  ],
});

// ==================== 荀勖 · 笛音（魏 · 3） ====================
defineSkill({
  id: 'diyin', name: '笛音',
  desc: '锁定技，你每失去七次牌后，你获得下一次进入弃牌堆的牌；当你受到伤害后，所有体力与你相同的角色各摸一张牌。',
  triggers: [
    {
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => (d.cards || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        let justSet = false;
        if (d.self === p) {
          p.flags.diyinCount = (p.flags.diyinCount || 0) + d.cards.length;
          if (p.flags.diyinCount >= 7) {
            p.flags.diyinCount -= 7;
            p.flags.diyinGrab = true;
            justSet = true;
            await ctx.log('【笛音】：累计失去七张牌，获得下一张进入弃牌堆的牌');
          }
        }
        if (p.flags.diyinGrab && !justSet) {
          const c = d.cards[0];
          if (c) {
            p.flags.diyinGrab = false;
            if (p.hand.includes(c)) {
              // 抓到的正是本批正在弃置的手牌：用 kept 声明「这张牌留在原主区域、本批不弃置」。
              // ★不能用 taken：taken 语义是「牌已被我移到别处、别再入堆」，引擎仍会从原区域摘除，
              //   而这里牌必须留在手里 → 否则牌从手牌被 splice 掉又不进弃牌堆，凭空消失。
              d.kept = d.kept || [];
              if (!d.kept.includes(c)) d.kept.push(c);
            } else {
              // ★用 takeCard 从任意区域摘除（弃牌堆/牌堆/装备区/判定区/他人手牌），
              //   只 splice(弃牌堆) 不够：牌若还在别处会变成「两处持有」或「拿走一张、原处留一张」
              await g.takeCard(c);
              p.hand.push(c);
              await g.trigger('zone.in', { self: p, cards: [c] });
            }
            await ctx.log(`【笛音】：获得 ${cardLabel(c)}`);
          }
        }
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: () => true,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const same = g.alive().filter(q => q.hp === p.hp);
        for (const q of same) await ctx.draw(q, 1, { reason: 'diyin' });
        await ctx.log(`【笛音】：体力相同（${p.hp}）的角色各摸一张牌`);
      },
    },
  ],
});

// ==================== 荀勖 · 博洽（魏 · 3） ====================
const BOQIA_NAMES = ['sha', 'tao', 'jiu', 'wuzhong', 'guohe', 'shunshou', 'wuxie'];
defineSkill({
  id: 'boqia', name: '博洽',
  desc: '每回合限一次，你可以将三张牌当一张基本牌或非伤害普通锦囊牌使用，若这三张牌的花色或类型均不同，此牌结算后你令一名角色将手牌调整至其体力上限，然后此技能可再次发动（每回合每种牌名限一次）。',
  active: {
    perTurn: true,
    prompt: '博洽',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.hand.length < 3) { await ctx.log('【博洽】：手牌不足三张'); return; }
      p.flags.boqiaNames = p.flags.boqiaNames || {};
      const avail = BOQIA_NAMES.filter(n => !p.flags.boqiaNames[n]);
      if (!avail.length) { await ctx.log('【博洽】：本回合牌名已用尽'); return; }
      const ni = await ctx.ask.choose(p, avail.map(n => `【${CARD_META[n].cn}】`), { prompt: '【博洽】：选择视为使用的牌' });
      const name = avail[ni < 0 ? 0 : ni];
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 3, { prompt: '【博洽】：选择三张牌', optional: false });
      if (picks.length < 3) return;
      const suits = new Set(picks.map(c => c.suit));
      const types = new Set(picks.map(c => typeOf(c)));
      const gain = suits.size === 3 || types.size === 3;
      await ctx.discard(p, picks, { reason: 'boqia' });
      p.flags.boqiaNames[name] = true;
      const tg = g.autoTargetsFor(p, vcard(name)) || [];
      await ctx.log(`【博洽】：三张牌视为【${CARD_META[name].cn}】${gain ? '（花色或类别均不同）' : ''}`);
      await ctx.useCard({ from: p, card: vcard(name), targets: tg, reason: 'boqia' });
      if (gain) {
        const cands = g.alive();
        const t = (await ctx.ask.targets(p, { candidates: cands, min: 0, max: 1, prompt: '【博洽】：令一名角色将手牌调整至体力上限' }))[0];
        if (t) {
          if (t.hand.length < t.maxHp) await drawTo(ctx, t, t.maxHp, 'boqia');
          else if (t.hand.length > t.maxHp) {
            const over = t.hand.length - t.maxHp;
            const out = await g.chooseSomeCards(t, t.hand.slice(), Math.min(over, t.hand.length), { prompt: '【博洽】：弃置至体力上限' });
            if (out.length) await ctx.discard(t, out, { reason: 'boqia' });
          }
          await ctx.log(`【博洽】：${t.name} 手牌调整至 ${t.maxHp}`);
        }
        p.flags.act_boqia = -1; // 视为未发动过
      }
    },
  },
});

// ==================== 刘璿 · 漠规（蜀 · 4） ====================
const moguiUsed = (p) => (p.flags.mogui = p.flags.mogui || { judge: false, draw: false, discard: false });
defineSkill({
  id: 'mogui', name: '漠规',
  desc: '每项限一次：①判定阶段开始时，你可以令一名角色回复1点体力并弃置其判定区的所有牌；②摸牌阶段开始时，你可以令一名角色本局游戏：摸牌阶段额定摸牌数+1，出牌阶段使用【杀】的次数上限+1；③弃牌阶段开始时，弃置至多五张牌，令一名角色手牌上限+1并摸等量张牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'judge' && !moguiUsed(d.self).judge,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const yes = await ctx.ask.confirm(p, '【漠规①】：令一名角色回复体力并弃置判定区？');
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: g.alive(), min: 1, max: 1, prompt: '【漠规①】：选择角色' }))[0];
        if (!t) return;
        moguiUsed(p).judge = true;
        await ctx.recover(t, 1, { reason: 'mogui' });
        if (t.judgeZone.length) {
          const cards = t.judgeZone.map(z => z.card);
          t.judgeZone = [];
          await ctx.discard(t, cards, { reason: 'mogui' });
        }
        await ctx.log(`【漠规①】：${t.name} 回复 1 点体力并清空判定区`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'draw' && !moguiUsed(d.self).draw,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const yes = await ctx.ask.confirm(p, '【漠规②】：令一名角色永久摸牌+1、出杀次数+1？');
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: g.alive(), min: 1, max: 1, prompt: '【漠规②】：选择角色' }))[0];
        if (!t) return;
        moguiUsed(p).draw = true;
        t.flags.moguiDrawPlus = (t.flags.moguiDrawPlus || 0) + 1;
        t.flags.shaExtra = (t.flags.shaExtra || 0) + 1;
        await ctx.log(`【漠规②】：${t.name} 摸牌数 +1、使用【杀】次数上限 +1（永久）`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'discard' && !moguiUsed(d.self).discard,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (!p.hand.length) return;
        const yes = await ctx.ask.confirm(p, '【漠规③】：弃置至多五张牌，令一名角色手牌上限+1并摸等量张牌？');
        if (!yes) return;
        const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(5, p.hand.length), { prompt: '【漠规③】：弃置至多五张牌' });
        if (!picks.length) return;
        moguiUsed(p).discard = true;
        await ctx.discard(p, picks, { reason: 'mogui' });
        const t = (await ctx.ask.targets(p, { candidates: g.alive(), min: 1, max: 1, prompt: '【漠规③】：选择角色' }))[0];
        const target = t || p;
        target.flags.handLimit = (target.flags.handLimit || 0) + 1;
        await ctx.draw(target, picks.length, { reason: 'mogui' });
        await ctx.log(`【漠规③】：${target.name} 手牌上限 +1 并摸 ${picks.length} 张`);
      },
    },
    {
      on: 'draw.count', who: 'any', optional: false,
      filter: (d) => (d.self.flags.moguiDrawPlus || 0) > 0,
      async effect(ctx) {
        const d = ctx.data;
        d.count += d.self.flags.moguiDrawPlus;
      },
    },
  ],
});

// ==================== 刘璿 · 遵谏（蜀 · 4） ====================
defineSkill({
  id: 'zunjian', name: '遵谏',
  desc: '觉醒技，若你回合开始时已移除「漠规」所有选项，你回复1点体力并选择一项：1.摸2张牌并重置「漠规」；2.再回复1点体力，然后失去「漠规」并修改「仁诚」。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => !d.self.flags.zunjianDone && (() => {
        const m = moguiUsed(d.self);
        return m.judge && m.draw && m.discard;
      })(),
      async effect(ctx) {
        const p = ctx.self;
        p.flags.zunjianDone = true;
        await ctx.recover(p, 1, { reason: 'zunjian' });
        await ctx.log('【遵谏】：觉醒！回复 1 点体力');
        const idx = await ctx.ask.choose(p, ['摸两张牌并重置「漠规」', '回复体力，失去「漠规」并修改「仁诚」'], { prompt: '【遵谏】：选择一项' });
        if (idx === 1) {
          await ctx.recover(p, 1, { reason: 'zunjian' });
          p.flags.mogui = null;
          const i = p.skills.findIndex(s => s.id === 'mogui');
          if (i >= 0) p.skills.splice(i, 1);
          p.flags.renchengPlus = true;
          await ctx.log('【遵谏】：失去「漠规」，「仁诚」已修改');
        } else {
          await ctx.draw(p, 2, { reason: 'zunjian' });
          p.flags.mogui = { judge: false, draw: false, discard: false };
          await ctx.log('【遵谏】：摸两张牌并重置「漠规」');
        }
      },
    },
  ],
});

// ==================== 刘璿 · 仁诚（蜀 · 4） ====================
defineSkill({
  id: 'rencheng', name: '仁诚',
  desc: '出牌阶段限一次，你可以摸2张牌，然后可以交给一名其他角色至多2张牌。（修改后：摸3张牌，然后交给一名其他角色至多3张牌，若这些牌中：有基本牌，其下个出牌阶段使用牌无距离限制；有锦囊牌，你可弃置一名角色区域内一张牌；有装备牌，你与其各回复1点体力。）',
  active: {
    perTurn: true,
    prompt: '仁诚',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const plus = !!p.flags.renchengPlus;
      const n = plus ? 3 : 2;
      await ctx.draw(p, n, { reason: 'rencheng' });
      const t = (await ctx.ask.targets(p, { candidates: others(g, p), min: 0, max: 1, prompt: '【仁诚】：交给一名其他角色牌' }))[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(n, p.hand.length), { prompt: `【仁诚】：选择交给至多 ${n} 张牌` });
      if (!picks.length) return;
      const types = new Set(picks.map(c => typeOf(c)));
      await ctx.gain(t, picks, { from: p, reason: 'rencheng' });
      await ctx.log(`【仁诚】：交给 ${t.name} ${picks.length} 张牌`);
      if (!plus) return;
      if (types.has('basic')) {
        t.flags.freeRangeTurnAny = true;
        await ctx.log(`【仁诚】：${t.name} 下个出牌阶段使用牌无距离限制`);
      }
      if (types.has('trick')) {
        const q = (await ctx.ask.targets(p, { candidates: g.alive(), min: 0, max: 1, prompt: '【仁诚】：弃置一名角色区域内一张牌' }))[0];
        if (q) {
          const c = await pickZoneCard(ctx, p, q, { prompt: '【仁诚】：选择弃置的牌' });
          if (c) await ctx.discard(q, [c], { reason: 'rencheng' });
        }
      }
      if (types.has('equip')) {
        await ctx.recover(p, 1, { reason: 'rencheng' });
        await ctx.recover(t, 1, { reason: 'rencheng' });
      }
    },
  },
});

// ==================== 何晏 · 崖柴（魏 · 3） ====================
defineSkill({
  id: 'yaichai', name: '崖柴',
  desc: '当你受到伤害后，你可以令伤害来源选择一项：1.弃置一半数量的手牌（向上取整且至少一张）；2.本回合不能再使用手牌，然后你摸两张牌；3.展示所有手牌，然后交给你其中一种花色的所有牌。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => !!d.from && d.from !== d.player && d.from.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const src = d.from;
        const yes = await ctx.ask.confirm(p, `【崖柴】：是否令 ${src.name} 选择一项？`);
        if (!yes) return;
        const opts = [];
        if (src.hand.length) opts.push('弃置一半数量的手牌（向上取整）');
        opts.push('本回合不能再使用手牌，然后何晏摸两张牌');
        if (src.hand.length) opts.push('展示所有手牌，交给何晏其中一种花色的所有牌');
        const idx = await ctx.ask.choose(src, opts, { prompt: '【崖柴】：选择一项' });
        const pick = idx < 0 ? 0 : idx;
        const label = opts[pick];
        if (label.startsWith('弃置')) {
          const n = Math.max(1, Math.ceil(src.hand.length / 2));
          const out = await g.chooseSomeCards(src, src.hand.slice(), Math.min(n, src.hand.length), { prompt: '【崖柴】：弃置一半手牌' });
          if (out.length) await ctx.discard(src, out, { reason: 'yaichai' });
          await ctx.log(`【崖柴】：${src.name} 弃置 ${out.length} 张手牌`);
        } else if (label.startsWith('本回合')) {
          src.flags.banCardTurn = g.turnCount;
          await ctx.draw(p, 2, { reason: 'yaichai' });
          await ctx.log(`【崖柴】：${src.name} 本回合不能再使用手牌，${p.name} 摸两张牌`);
        } else {
          await ctx.log(`【崖柴】：${src.name} 展示手牌：${src.hand.map(cardLabel).join('、')}`);
          const suits = [...new Set(src.hand.map(c => c.suit))];
          if (suits.length) {
            const si = await ctx.ask.choose(src, suits.map(s => `${SUIT_CN[s]}花色`), { prompt: '【崖柴】：选择交给的花色' });
            const suit = suits[si < 0 ? 0 : si];
            const give = src.hand.filter(c => c.suit === suit);
            await ctx.gain(p, give, { from: src, reason: 'yaichai' });
            await ctx.log(`【崖柴】：${src.name} 交给 ${p.name} ${give.length} 张${SUIT_CN[suit]}牌`);
          }
        }
      },
    },
  ],
});

// ==================== 何晏 · 清谈（魏 · 3） ====================
defineSkill({
  id: 'qingtan', name: '清谈',
  desc: '出牌阶段限一次，你可以令所有有手牌的角色选择一张手牌并同时展示之，然后你可以获得其中一种花色的牌，展示此花色的牌的角色各摸一张牌，且弃置其他展示的牌。',
  active: {
    perPhase: true,
    prompt: '清谈',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const shown = [];
      for (const q of g.alive()) {
        if (!q.hand.length) continue;
        const c = (await g.chooseSomeCards(q, q.hand.slice(), 1, { prompt: '【清谈】：选择一张手牌展示' }))[0];
        if (c) shown.push({ owner: q, card: c });
      }
      if (!shown.length) return;
      await ctx.log(`【清谈】：展示 ${shown.map(x => cardLabel(x.card)).join('、')}`);
      const suits = [...new Set(shown.map(x => x.card.suit))];
      const si = await ctx.ask.choose(p, [...suits.map(s => `${SUIT_CN[s]}花色`), '不获得'], { prompt: '【清谈】：选择获得的花色' });
      if (si < 0 || si >= suits.length) {
        await ctx.log('【清谈】：不获得任何牌');
        return;
      }
      const suit = suits[si];
      for (const x of shown) {
        if (x.card.suit === suit) {
          await ctx.gain(p, [x.card], { from: x.owner, reason: 'qingtan' });
          await ctx.draw(x.owner, 1, { reason: 'qingtan' });
        } else {
          await ctx.discard(x.owner, [x.card], { reason: 'qingtan' });
        }
      }
      await ctx.log(`【清谈】：获得全部${SUIT_CN[suit]}牌，其余弃置`);
    },
  },
});

// ==================== 夏侯玄 · 博玄（魏 · 3） ====================
defineSkill({
  id: 'boxuan', name: '博玄',
  desc: '你使用手牌指定其他角色为目标结算完毕后，可展示牌堆底的3张牌，若展示牌中有牌与你使用的牌：1.牌名字数相同，你摸1张牌；2.花色相同，你可弃置一名其他角色1张牌；3.类型相同，你可使用1张展示牌。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => (d.targets || []).some(t => t && t !== d.player) && !!(d.effName && CARD_META[d.effName])
        && (d.player.flags.boxuanPlus || d.card?.__fromHand !== false),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const yes = await ctx.ask.confirm(p, '【博玄】：展示牌堆底三张牌？');
        if (!yes) return;
        const shown = g.deck.slice(0, Math.min(3, g.deck.length));
        if (!shown.length) return;
        const used = d.card;
        const cnLen = (CARD_META[used?.name]?.cn || '').length;
        await ctx.log(`【博玄】：牌堆底 ${shown.map(cardLabel).join('、')}`);
        if (shown.some(c => (CARD_META[c.name]?.cn || '').length === cnLen)) {
          await ctx.draw(p, 1, { reason: 'boxuan' });
          await ctx.log('【博玄】：牌名字数相同，摸一张牌');
        }
        const sameSuit = shown.filter(c => c.suit === used?.suit);
        if (sameSuit.length) {
          const q = (await ctx.ask.targets(p, { candidates: others(g, p), min: 0, max: 1, prompt: '【博玄】：弃置一名其他角色一张牌' }))[0];
          if (q) {
            const c = await pickZoneCard(ctx, p, q, { prompt: '【博玄】：选择弃置的牌' });
            if (c) await ctx.discard(q, [c], { reason: 'boxuan' });
          }
        }
        const sameType = shown.filter(c => typeOf(c) === typeOf(used));
        if (sameType.length) {
          const c = (await g.chooseSomeCards(p, sameType, 1, { prompt: '【博玄】：选择使用一张展示牌' }))[0];
          if (c) {
            const i = g.deck.indexOf(c);
            if (i >= 0) g.deck.splice(i, 1);
            const tg = g.autoTargetsFor(p, c) || [];
            if (g.canUse(p, c, tg, null, null, {}).ok) await ctx.useCard({ from: p, card: c, targets: tg, reason: 'boxuan' });
            else p.hand.push(c);
          }
        }
      },
    },
  ],
});

// ==================== 夏侯玄 · 议政（魏 · 3） ====================
defineSkill({
  id: 'yizheng', name: '议政',
  desc: '你的回合开始时，你可与任意名其他角色各展示1张手牌，若展示的牌类型均相同，你可将这些牌交给其中一名角色，若类型不同，你弃置这些牌。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const yes = await ctx.ask.confirm(p, '【议政】：是否发动？');
        if (!yes) return;
        const chosen = await ctx.ask.targets(p, {
          candidates: others(g, p).filter(q => q.hand.length), min: 0, max: Math.max(1, p.maxHp),
          prompt: '【议政】：选择一同展示手牌的角色',
        });
        const parts = [{ owner: p, card: (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【议政】：展示你的手牌' }))[0] }];
        for (const q of chosen) {
          const c = (await g.chooseSomeCards(q, q.hand.slice(), 1, { prompt: '【议政】：展示一张手牌' }))[0];
          if (c) parts.push({ owner: q, card: c });
        }
        const valid = parts.filter(x => x.card);
        if (!valid.length) return;
        const types = new Set(valid.map(x => typeOf(x.card)));
        await ctx.log(`【议政】：展示 ${valid.map(x => cardLabel(x.card)).join('、')}`);
        if (types.size === 1) {
          const t = (await ctx.ask.targets(p, { candidates: g.alive(), min: 0, max: 1, prompt: '【议政】：将展示的牌交给一名角色' }))[0];
          if (t) {
            for (const x of valid) await ctx.gain(t, [x.card], { from: x.owner, reason: 'yizheng' });
            await ctx.log(`【议政】：类别均相同，展示的牌交给 ${t.name}`);
          }
        } else {
          for (const x of valid) await ctx.discard(x.owner, [x.card], { reason: 'yizheng' });
          await ctx.log('【议政】：类别不同，弃置展示的牌');
        }
      },
    },
  ],
});

// ==================== 夏侯玄 · 归林（魏 · 3） ====================
defineSkill({
  id: 'guilin', name: '归林',
  desc: '限定技，出牌阶段或你进入濒死状态时，可回复满体力值，然后失去「议政」并修改「博玄」。',
  active: {
    prompt: '归林',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.guilinUsed) { await ctx.log('【归林】：已发动过'); return; }
      p.flags.guilinUsed = true;
      const need = p.maxHp - p.hp;
      if (need > 0) await ctx.recover(p, need, { reason: 'guilin' });
      const i = p.skills.findIndex(s => s.id === 'yizheng');
      if (i >= 0) p.skills.splice(i, 1);
      p.flags.boxuanPlus = true;
      await ctx.log('【归林】：体力回复至上限，失去「议政」并修改「博玄」');
    },
  },
  triggers: [
    {
      on: 'dying.begin', who: 'self', optional: false,
      filter: (d) => !d.self.flags.guilinUsed && d.self.hp <= 0,
      async effect(ctx) {
        const p = ctx.self;
        const yes = await ctx.ask.confirm(p, '【归林】：是否发动（回复满体力，失去「议政」）？');
        if (!yes) return;
        p.flags.guilinUsed = true;
        await ctx.recover(p, Math.max(1, p.maxHp), { reason: 'guilin' });
        const i = p.skills.findIndex(s => s.id === 'yizheng');
        if (i >= 0) p.skills.splice(i, 1);
        p.flags.boxuanPlus = true;
        await ctx.log('【归林】：发动，体力回复至上限');
      },
    },
  ],
});

// ==================== 庞会 · 异勇（魏 · 5） ====================
defineSkill({
  id: 'yiyong', name: '异勇',
  desc: '当你对其他角色造成伤害时，你可以与其同时弃置任意张牌。若你弃置的牌的点数之和：不大于其，你摸X张牌（X为其弃置的牌数+1）；不小于其，此伤害+1。',
  triggers: [
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.to && d.to !== d.player
        && (d.player.flags.yiyongTurn !== d.game.turnCount || (d.player.flags.yiyongCount || 0) < 2)
        && d.player.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const t = d.to;
        const yes = await ctx.ask.confirm(p, `【异勇】：是否与 ${t.name} 同时弃牌？`);
        if (!yes) return;
        p.flags.yiyongTurn = g.turnCount;
        p.flags.yiyongCount = (p.flags.yiyongCount || 0) + 1;
        const mine = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【异勇】：弃置任意张牌', optional: false });
        const his = t.hand.length
          ? await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【异勇】：弃置任意张牌' })
          : [];
        const sum = (arr) => arr.reduce((s, c) => s + (c.num || 0), 0);
        const a = sum(mine), b = sum(his);
        if (mine.length) await ctx.discard(p, mine, { reason: 'yiyong' });
        if (his.length) await ctx.discard(t, his, { reason: 'yiyong' });
        await ctx.log(`【异勇】：你 ${a} 点，其 ${b} 点`);
        if (a <= b) await ctx.draw(p, his.length + 1, { reason: 'yiyong' });
        if (a >= b) d.amount += 1;
      },
    },
  ],
});

// ==================== 庞会 · 夙仇（魏 · 5） ====================
defineSkill({
  id: 'suqiu', name: '夙仇',
  desc: '锁定技，出牌阶段开始时，你选择一项：1.失去1点体力或减1点体力上限，然后你此阶段使用牌不能被响应；2.失去此技能。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const opts = ['失去1点体力，此阶段使用牌不能被响应'];
        if (p.maxHp > 1) opts.push('减1点体力上限，此阶段使用牌不能被响应');
        opts.push('失去此技能');
        const idx = await ctx.ask.choose(p, opts, { prompt: '【夙仇】：选择一项' });
        const pick = idx < 0 ? 0 : idx;
        if (pick === opts.length - 1) {
          const i = p.skills.findIndex(s => s.id === 'suqiu');
          if (i >= 0) p.skills.splice(i, 1);
          await ctx.log('【夙仇】：失去此技能');
          return;
        }
        if (pick === 1) {
          p.maxHp = Math.max(1, p.maxHp - 1);
          if (p.hp > p.maxHp) p.hp = p.maxHp;
          await ctx.log('【夙仇】：减 1 点体力上限');
        } else {
          await ctx.loseHp(p, 1, { reason: 'suqiu' });
        }
        p.flags.suqiuTurn = g.turnCount;
        await ctx.log('【夙仇】：此阶段使用牌不能被响应');
      },
    },
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.player.flags.suqiuTurn === d.game.turnCount,
      async effect(ctx) {
        ctx.data.unavoidable = true;
      },
    },
  ],
});

// ==================== 张虎 · 摧坚（魏 · 4） ====================
defineSkill({
  id: 'cuijian', name: '摧坚',
  desc: '出牌阶段限一次，你可以选择一名有手牌的角色，若其手牌中有【闪】，其将所有【闪】和防具牌交给你，然后你交给其等量的牌；若其没有【闪】，你弃置一张手牌。',
  active: {
    perPhase: true,
    prompt: '摧坚',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { candidates: g.alive().filter(q => q.hand.length), min: 1, max: 1, prompt: '【摧坚】：选择一名有手牌的角色' }))[0];
      if (!t) return;
      const shans = t.hand.filter(c => c.name === 'shan');
      if (shans.length) {
        const armor = t.equips.armor;
        const gain = [...shans, ...(armor ? [armor] : [])];
        await ctx.gain(p, gain, { from: t, reason: 'cuijian' });
        await ctx.log(`【摧坚】：${t.name} 交出 ${gain.map(cardLabel).join('、')}`);
        if (!p.flags.tongyuanBasic) {
          const back = await g.chooseSomeCards(p, p.hand.slice(), Math.min(gain.length, p.hand.length), { prompt: '【摧坚】：交给其等量的牌' });
          if (back.length) await ctx.gain(t, back, { from: p, reason: 'cuijian' });
        }
      } else if (p.flags.tongyuanTrick) {
        await ctx.draw(p, 2, { reason: 'cuijian' });
        await ctx.log(`【摧坚】：${t.name} 没有【闪】，${p.name} 摸两张牌`);
      } else if (p.hand.length) {
        const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【摧坚】：弃置一张手牌', optional: false }))[0];
        if (c) await ctx.discard(p, [c], { reason: 'cuijian' });
      }
    },
  },
});

// ==================== 张虎 · 同援（魏 · 4） ====================
defineSkill({
  id: 'tongyuan', name: '同援',
  desc: '锁定技，你使用红色锦囊牌后，「摧坚」增加描述「若其没有【闪】，你摸两张牌」；你使用或打出红色基本牌后，「摧坚」将「交给」的效果删除。若以上两个效果都已触发，则你本局游戏接下来你使用红色普通锦囊牌无法响应，使用红色基本牌可以额外指定一个目标。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => isRedCard(d.card) && !!typeOf(d.card),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const t = typeOf(d.card);
        if (t === 'trick' && !p.flags.tongyuanTrick) {
          p.flags.tongyuanTrick = true;
          await ctx.log('【同援】：「摧坚」增加「若其没有【闪】，你摸两张牌」');
        }
        if (t === 'basic' && !p.flags.tongyuanBasic) {
          p.flags.tongyuanBasic = true;
          await ctx.log('【同援】：「摧坚」删去「交给等量的牌」');
        }
        if (p.flags.tongyuanTrick && p.flags.tongyuanBasic && !p.flags.tongyuanDone) {
          p.flags.tongyuanDone = true;
          await ctx.log('【同援】：两个效果均已触发，红色普通锦囊不能被响应');
        }
      },
    },
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.player.flags.tongyuanTrick && d.player.flags.tongyuanBasic
        && typeOf(d.card) === 'trick' && isRedCard(d.card),
      async effect(ctx) {
        ctx.data.unavoidable = true;   // 不可被响应（引擎据此跳过【无懈可击】链）
      },
    },
    {
      // 「使用红色基本牌可以额外指定一个目标」：在 card.use.before 里追加（引擎消费 extraTargets）
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player;
        return p.flags.tongyuanTrick && p.flags.tongyuanBasic
          && typeOf(d.card) === 'basic' && isRedCard(d.card);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const taken = d.targets || [];
        const cands = g.candidatesFor(p, d.card).filter(q => !taken.includes(q));
        if (!cands.length) return;
        const extra = (await ctx.ask.targets(p, {
          candidates: cands, min: 1, max: 1, prompt: '【同援】：额外指定一名目标（红色基本牌）',
        }))[0];
        if (!extra) return;
        d.extraTargets = [extra.seat];
        await ctx.log(`【同援】：额外指定 ${extra.name} 为目标`);
      },
    },
  ],
});

// ==================== 乐进 · 骁果（魏 · 4） ====================
defineSkill({
  id: 'xiaoguo', name: '骁果',
  desc: '其他角色的结束阶段，你可以弃置一张手牌，然后该角色选择一项：1.弃置一张装备牌，你摸一张牌；2.受到你造成的1点伤害。',
  triggers: [
    {
      on: 'phase.begin', who: 'any', optional: true,
      filter: (d) => d.phase === 'end' && d.self !== d.player && d.self.alive && d.player.hand.length > 0,
      prompt: '是否对结束阶段的角色发动【骁果】？',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const t = d.self;
        const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【骁果】：弃置一张手牌', optional: false }))[0];
        if (!c) return;
        await ctx.discard(p, [c], { reason: 'xiaoguo' });
        const equips = Object.entries(t.equips).filter(([k, v]) => v && k !== '__disabled');
        const opts = [];
        if (equips.length) opts.push('弃置一张装备牌');
        opts.push('受到乐进造成的 1 点伤害');
        const idx = await ctx.ask.choose(t, opts, { prompt: '【骁果】：选择一项' });
        if (idx === 0 && equips.length) {
          const eq = (await g.chooseSomeCards(t, equips.map(([, v]) => v), 1, { prompt: '【骁果】：弃置一张装备牌', optional: false }))[0];
          if (eq) await ctx.discard(t, [eq], { reason: 'xiaoguo' });
          await ctx.draw(p, 1, { reason: 'xiaoguo' });
          await ctx.log(`【骁果】：${t.name} 弃置装备牌，${p.name} 摸一张牌`);
        } else {
          await ctx.log(`【骁果】：${t.name} 选择受到 1 点伤害`);
          await ctx.damage({ from: p, to: t, amount: 1, reason: 'xiaoguo' });
        }
      },
    },
  ],
});

// ==================== 董昭 · 移驾（魏 · 3） ====================
defineSkill({
  id: 'yijia', name: '移驾',
  desc: '当一名与你距离1以内的角色受到伤害后，你可以将场上一张装备牌置入其对应装备栏（替换原装备），若其因此脱离了一名角色的攻击范围，你摸一张牌。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.self.alive && d.game.distance(d.player, d.self) <= 1,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const t = d.self;
        const pool = [];
        for (const q of g.alive()) {
          for (const k of ['weapon', 'armor', 'horsePlus', 'horseMinus', 'treasure']) {
            if (q.equips[k]) pool.push(q.equips[k]);
          }
        }
        if (!pool.length) return;
        const yes = await ctx.ask.confirm(p, `【移驾】：是否移动一张装备牌给 ${t.name}？`);
        if (!yes) return;
        const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【移驾】：选择场上的一张装备牌', optional: false }))[0];
        if (!c) return;
        // 先从原持有者的装备区移出
        for (const q of g.alive()) {
          for (const k of ['weapon', 'armor', 'horsePlus', 'horseMinus', 'treasure']) {
            if (q.equips[k] === c) await g.unequipCard(q, c, { reason: 'move' });
          }
        }
        const before = new Set(g.alive().filter(q => g.inAttackRange(q, t)).map(q => q.seat));
        await g.equipCard(t, c);
        const after = new Set(g.alive().filter(q => g.inAttackRange(q, t)).map(q => q.seat));
        const changed = [...before].some(s => !after.has(s)) || [...after].some(s => !before.has(s));
        await ctx.log(`【移驾】：将 ${cardLabel(c)} 置入 ${t.name} 的装备区`);
        if (changed) {
          await ctx.draw(p, 1, { reason: 'yijia' });
          await ctx.log(`【移驾】：${t.name} 脱离了一名角色的攻击范围，${p.name} 摸一张牌`);
        }
      },
    },
  ],
});

// ==================== 董昭 · 定基（魏 · 3） ====================
defineSkill({
  id: 'dingji', name: '定基',
  desc: '准备阶段，你可以令一名角色将手牌调整至五张，然后其展示所有手牌，若牌名均不同，其可以视为使用其中一张基本牌或普通锦囊牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'prepare',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const yes = await ctx.ask.confirm(p, '【定基】：是否令一名角色将手牌调整至五张？');
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: g.alive(), min: 1, max: 1, prompt: '【定基】：选择角色' }))[0];
        if (!t) return;
        if (t.hand.length < 5) await drawTo(ctx, t, 5, 'dingji');
        else if (t.hand.length > 5) {
          const over = t.hand.length - 5;
          const out = await g.chooseSomeCards(t, t.hand.slice(), over, { prompt: '【定基】：弃置至五张', optional: false });
          if (out.length) await ctx.discard(t, out, { reason: 'dingji' });
        }
        await ctx.log(`【定基】：${t.name} 手牌调整至 ${t.hand.length} 张，展示：${t.hand.map(cardLabel).join('、')}`);
        const names = t.hand.map(c => c.name);
        if (new Set(names).size !== names.length) return;
        const usable = t.hand.filter(c => {
          const m = CARD_META[c.name];
          return m && !m.delayed && (m.type === 'basic' || m.type === 'trick') && c.name !== 'shan' && c.name !== 'wuxie';
        });
        if (!usable.length) return;
        const ok = await ctx.ask.confirm(t, '【定基】：牌名均不同，是否视为使用其中一张牌？');
        if (!ok) return;
        const c = (await g.chooseSomeCards(t, usable, 1, { prompt: '【定基】：选择使用的牌', optional: false }))[0];
        if (!c) return;
        const tg = g.autoTargetsFor(t, c) || [];
        await ctx.useCard({ from: t, card: c, targets: tg, reason: 'dingji' });
      },
    },
  ],
});

// ==================== 羊祜 · 德劭（魏 · 3） ====================
defineSkill({
  id: 'deshao', name: '德劭',
  desc: '当你成为其他角色使用黑色牌的目标后，你可以摸一张牌，然后若其手牌数大于等于你，你弃置其一张牌，每个回合限发动两次。',
  triggers: [
    {
      on: 'target.before', who: 'any', optional: false,
      filter: (d) => d.self === d.player && d.from && d.from !== d.player && !!d.card
        && !isRedCard(d.card) && (d.player.flags.deshaoTurn !== d.game.turnCount || (d.player.flags.deshaoCount || 0) < 2),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const src = d.from;
        const yes = await ctx.ask.confirm(p, `【德劭】：是否摸一张牌并弃置 ${src.name} 一张牌？`);
        if (!yes) return;
        p.flags.deshaoTurn = g.turnCount;
        p.flags.deshaoCount = (p.flags.deshaoCount || 0) + 1;
        await ctx.draw(p, 1, { reason: 'deshao' });
        if (src.hand.length >= p.hand.length) {
          const c = await pickZoneCard(ctx, p, src, { prompt: '【德劭】：弃置其一张牌' });
          if (c) await ctx.discard(src, [c], { reason: 'deshao' });
        }
      },
    },
  ],
});

// ==================== 羊祜 · 明伐（魏 · 3） ====================
defineSkill({
  id: 'mingfa', name: '明伐',
  desc: '出牌阶段限一次，你使用【杀】或普通锦囊牌结算完毕后，若你没有「明伐」牌，可将此牌置于武将牌上并选择一名其他角色。该角色的回合结束时，视为你对其使用X次「明伐」牌（X为其手牌数且最多为5最少为1），然后移去「明伐」牌。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => {
        if (d.player.flags.mingfa) return false;
        if (d.game.phase !== 'play' || d.game.turnPlayer !== d.player) return false;
        const m = CARD_META[d.effName];
        return !!m && !m.delayed && (d.effName === 'sha' || m.type === 'trick');
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const yes = await ctx.ask.confirm(p, '【明伐】：是否将此牌置于武将牌上？');
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: others(g, p), min: 1, max: 1, prompt: '【明伐】：选择一名其他角色' }))[0];
        if (!t) return;
        const i = g.discardPile.indexOf(d.card);
        if (i >= 0) g.discardPile.splice(i, 1);
        p.flags.mingfa = { card: d.card, seat: t.seat };
        await g.trigger('zone.out', { self: p, cards: [d.card] });
        await ctx.log(`【明伐】：将 ${cardLabel(d.card)} 置于武将牌上，记录 ${t.name}`);
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'end' && !!d.player.flags.mingfa && d.self.seat === d.player.flags.mingfa.seat,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const rec = p.flags.mingfa;
        p.flags.mingfa = null;
        const t = d.self;
        const n = Math.min(5, Math.max(1, t.hand.length));
        await ctx.log(`【明伐】：视为对 ${t.name} 使用 ${n} 次【${CARD_META[rec.card.name]?.cn || ''}】`);
        for (let k = 0; k < n && t.alive && p.alive; k++) {
          const vb = { ...rec.card, id: `${rec.card.id}_mf${k}`, virtual: true };
          await ctx.useCard({ from: p, card: vb, targets: [t], reason: 'mingfa' });
        }
        if (!g.discardPile.includes(rec.card)) g.discardPile.push(rec.card);
        await g.trigger('zone.in', { self: p, cards: [rec.card] });
      },
    },
  ],
});

// ==================== 华歆 · 望归（魏 · 3） ====================
defineSkill({
  id: 'wanggui', name: '望归',
  desc: '每回合限一次，当你造成伤害后，你可以对一名与你势力不同的其他角色造成1点伤害；当你受到伤害后，你可以令一名与你势力相同的角色摸一张牌。若该角色不为你，你摸一张牌。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.game.alive().some(q => q !== d.player && q.kingdom !== d.player.kingdom)
        && d.player.flags.wangguiAtk !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const yes = await ctx.ask.confirm(p, '【望归】：是否对一名势力不同的角色造成1点伤害？');
        if (!yes) return;
        const cands = others(g, p).filter(q => q.kingdom !== p.kingdom);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【望归】：选择势力不同的角色' }))[0];
        if (!t) return;
        p.flags.wangguiAtk = g.turnCount;
        await ctx.log(`【望归】：对 ${t.name} 造成 1 点伤害`);
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'wanggui' });
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => d.player.flags.wangguiDef !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const yes = await ctx.ask.confirm(p, '【望归】：是否令一名同势力角色摸一张牌？');
        if (!yes) return;
        const cands = g.alive().filter(q => q.kingdom === p.kingdom);
        const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【望归】：选择同势力角色' }))[0];
        if (!t) return;
        p.flags.wangguiDef = g.turnCount;
        await ctx.log(`【望归】：${t.name} 摸一张牌`);
        await ctx.draw(t, 1, { reason: 'wanggui' });
        if (t !== p) await ctx.draw(p, 1, { reason: 'wanggui' });
      },
    },
  ],
});

// ==================== 华歆 · 息兵（魏 · 3） ====================
defineSkill({
  id: 'xibing', name: '息兵',
  desc: '每回合限一次，当其他角色于其出牌阶段内使用黑色【杀】或黑色普通锦囊牌指定一名角色为唯一目标后，你可以令该角色将手牌摸至体力值（至多摸至5张）。若其因此摸牌，其本回合不能再使用牌。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => {
        if (d.self === d.player || !d.card || isRedCard(d.card)) return false;
        if (d.game.phase !== 'play' || d.game.turnPlayer !== d.self) return false;
        if ((d.targets || []).length !== 1) return false;
        const m = CARD_META[d.effName];
        if (!m || m.delayed) return false;
        return d.effName === 'sha' || m.type === 'trick';
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        if (p.flags.xibingTurn === g.turnCount) return;
        const src = d.self;
        const target = Math.min(5, src.hp);
        if (src.hand.length >= target) return;
        const yes = await ctx.ask.confirm(p, `【息兵】：是否令 ${src.name} 将手牌摸至 ${target} 张？`);
        if (!yes) return;
        p.flags.xibingTurn = g.turnCount;
        const gain = await drawTo(ctx, src, target, 'xibing');
        if (gain > 0) {
          src.flags.banCardTurn = g.turnCount;
          await ctx.log(`【息兵】：${src.name} 摸 ${gain} 张牌，本回合不能再使用牌`);
        }
      },
    },
  ],
});

// ==================== 杜预 · 谏国（魏 · 4） ====================
defineSkill({
  id: 'jianguo', name: '谏国',
  desc: '出牌阶段各限一次，你可以令一名角色摸一张牌，然后其弃置X张手牌（X为其手牌数的一半，向上取整）；或令一名角色弃置一张牌，然后其摸X张牌。',
  active: {
    prompt: '谏国',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.jianguo = p.flags.jianguo || {};
      if (p.flags.jianguoTurn !== g.turnCount) { p.flags.jianguo = {}; p.flags.jianguoTurn = g.turnCount; }
      const avail = ['令一名角色摸一张牌然后弃置其一半手牌（上取整）', '令一名角色弃置一张牌然后摸其一半手牌（上取整）'];
      const opts = [];
      if (!p.flags.jianguo.a) opts.push({ idx: 'a', text: avail[0] });
      if (!p.flags.jianguo.b) opts.push({ idx: 'b', text: avail[1] });
      if (!opts.length) { await ctx.log('【谏国】：本阶段两项均已发动'); return; }
      const i = await ctx.ask.choose(p, opts.map(o => o.text), { prompt: '【谏国】：选择一项' });
      const choice = opts[i < 0 ? 0 : i];
      const t = (await ctx.ask.targets(p, { candidates: g.alive(), min: 1, max: 1, prompt: '【谏国】：选择一名角色' }))[0];
      if (!t) return;
      p.flags.jianguo[choice.idx] = true;
      if (choice.idx === 'a') {
        await ctx.draw(t, 1, { reason: 'jianguo' });
        const x = Math.ceil(t.hand.length / 2);
        const out = await g.chooseSomeCards(t, t.hand.slice(), Math.min(x, t.hand.length), { prompt: `【谏国】：弃置 ${x} 张手牌`, optional: false });
        if (out.length) await ctx.discard(t, out, { reason: 'jianguo' });
        await ctx.log(`【谏国】：${t.name} 摸一张牌并弃置 ${out.length} 张手牌`);
      } else {
        const c = (await g.chooseSomeCards(t, [...t.hand, ...Object.values(t.equips).filter(Boolean)], 1, { prompt: '【谏国】：弃置一张牌', optional: false }))[0];
        if (c) await ctx.discard(t, [c], { reason: 'jianguo' });
        const x = Math.ceil(t.hand.length / 2);
        if (x > 0) await ctx.draw(t, x, { reason: 'jianguo' });
        await ctx.log(`【谏国】：${t.name} 弃置一张牌并摸 ${x} 张牌`);
      }
    },
  },
});

// ==================== 杜预 · 倾势（魏 · 4） ====================
defineSkill({
  id: 'qingshi3', name: '倾势',
  desc: '当你于回合内使用【杀】或锦囊牌指定第一个目标后，若此牌为你本回合使用的第X张牌（X为你的手牌数），你可以对此牌的其中一名除你以外的目标角色造成1点伤害。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.game.turnPlayer === d.player && (d.effName === 'sha' || typeOf(d.card) === 'trick')
        && (d.targets || []).some(t => t && t !== d.player),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        if (p.flags.qingshiTurn !== g.turnCount) { p.flags.qingshiTurn = g.turnCount; p.flags.qingshiCount = 0; }
        p.flags.qingshiCount = (p.flags.qingshiCount || 0) + 1;
        if (p.flags.qingshiCount !== p.hand.length) return;
        const cands = (d.targets || []).filter(t => t && t !== p && t.alive);
        if (!cands.length) return;
        const yes = await ctx.ask.confirm(p, '【倾势】：是否对其中一名目标造成1点伤害？');
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【倾势】：选择目标' }))[0];
        if (!t) return;
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'qingshi3' });
        await ctx.log(`【倾势】：对 ${t.name} 造成 1 点伤害`);
      },
    },
  ],
});

// ==================== 王双 · 追猎（魏 · 8） ====================
defineSkill({
  id: 'zhuilie', name: '追猎',
  desc: '锁定技，你使用【杀】无距离限制；当你使用【杀】指定你攻击范围外的一名角色为目标后，此【杀】不计入次数且你进行一次判定，若结果为武器牌或坐骑牌，则此【杀】伤害增至该角色的体力值，否则你失去1点体力。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.freeRangeTurn = g.turnCount;
        p.flags.zhuilieShaId = null;   // ★去重键每回合清零，否则实体牌 id 复用会漏计（SG030 A4.0）
        await ctx.log(`【追猎】：${p.name} 本回合使用【杀】无距离限制`);
      },
    },
    {
      on: 'target.after', who: 'any', optional: false,
      filter: (d) => d.self === d.player && d.card && d.card.name === 'sha' && d.target && d.target !== d.player
        && !d.game.inAttackRange(d.player, d.target),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const t = d.target;
        // ★多目标【杀】只应算一次（SG029 BLOCKER-4）：同一张牌按 card.id 去重，否则方天画戟/借刀会 +N
        const shaKey = String(d.card.id);
        if (p.flags.zhuilieShaId !== shaKey) {
          p.flags.zhuilieShaId = shaKey;
          p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + 1;   // 此【杀】不计入次数
        }
        const jd = await ctx.judge(p, { reason: '追猎' });
        const sub = CARD_META[jd.card?.name]?.sub || '';
        if (sub === 'weapon' || sub === 'horse+' || sub === 'horse-') {
          p.flags.zhuilieSeat = t.seat;
          await ctx.log(`【追猎】：判定为 ${cardLabel(jd.card)}（装备），此【杀】伤害增至其体力值`);
        } else {
          p.flags.zhuilieSeat = -1;
          await ctx.log(`【追猎】：判定为 ${cardLabel(jd.card)}，未命中装备，失去1点体力`);
          await ctx.loseHp(p, 1, { reason: '追猎' });
        }
      },
    },
    {
      on: 'sha.hit', who: 'any', optional: false,
      filter: (d) => d.self === d.player && d.player.flags.zhuilieSeat === d.target?.seat,
      async effect(ctx) {
        const d = ctx.data;
        d.amount = Math.max(d.amount || 1, d.target.hp);
        // ★SG037：sha.hit 的 data = { self: 使用者, target, card, amount }，没有 player 字段
        ctx.self.flags.zhuilieSeat = -1;
        await ctx.log(`【追猎】：伤害值增至 ${d.amount}`);
      },
    },
  ],
});
