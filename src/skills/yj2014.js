// 一将成名 2014（10 将 / 16 技能）
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, suitOf, isRedFor } from '../engine/cards.js';

async function pickHand(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  const res = await ctx.game.ask(player, 'card', { prompt, cards: cands.map(c => c.id), optional: true, reason: 'skill' });
  if (!res || !res.cardId) return null;
  return cands.find(c => c.id === res.cardId) || null;
}

// ================= 魏 =================

// 曹真 · 司敌：其他角色的出牌阶段开始时，可弃一张牌，令其本阶段不能使用或打出同颜色的手牌。
defineSkill({
  id: 'sidi', name: '司敌',
  desc: '其他角色的出牌阶段开始时，你可以弃置一张牌，然后其本阶段不能使用或打出与弃置牌颜色相同的手牌。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => d.phase === 'play' && d.self !== d.player && d.player.hand.length > 0
      && [...d.self.hand, ...Object.values(d.self.equips).filter(Boolean)].length > 0,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      const res = await ctx.game.ask(p, 'card', { prompt: '【司敌】：弃置一张牌（其本阶段不能使用同颜色手牌）', cards: pool.map(c => c.id), optional: true, reason: 'sidi' });
      const c = res && res.cardId ? pool.find(x => x.id === res.cardId) : null;
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'sidi' });
      const color = isRedFor(p, c) ? 'red' : 'black';
      t.flags.qianxiNoColor = color;
      t.flags.qianxiTurn = ctx.game.turnCount;
      await ctx.log(`${p.name} 发动【司敌】：${t.name} 本阶段不能使用${color === 'red' ? '红' : '黑'}色手牌`);
    },
  }],
});

// 陈群 · 定品：弃一张牌，令一名已受伤角色判定，黑色则摸一张并回复 1 点体力，红色则摸一张并翻面。
defineSkill({
  id: 'dingpin', name: '定品',
  desc: '出牌阶段限一次，你可以弃置一张牌，令一名已受伤的角色进行判定：若为黑色，其摸一张牌并回复 1 点体力；若为红色，其摸一张牌并将武将牌翻面。',
  active: {
    perPhase: true,
    prompt: '弃一张牌，令一名受伤角色判定（黑：摸+回血，红：摸+翻面）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) { await ctx.log('【定品】：没有牌可弃'); return; }
      const res = await g.ask(p, 'card', { prompt: '【定品】：弃置一张牌', cards: pool.map(c => c.id), optional: false, reason: 'dingpin' });
      const c = res && res.cardId ? pool.find(x => x.id === res.cardId) : null;
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'dingpin' });
      const cands = g.alive().filter(x => x.hp < x.maxHp);
      if (!cands.length) { await ctx.log('【定品】：没有已受伤的角色'); return; }
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【定品】：选择一名已受伤角色' });
      if (!ts.length) return;
      const t = ts[0];
      const j = await ctx.judge(t, { reason: '定品' });
      await ctx.draw(t, 1, { reason: 'dingpin' });
      if (j.suit === 'spade' || j.suit === 'club') {
        await ctx.recover(t, 1, { reason: 'dingpin' });
        await ctx.log(`【定品】：判定黑色，${t.name} 摸一张并回复 1 点体力`);
      } else {
        await ctx.flip(t);
        await ctx.log(`【定品】：判定红色，${t.name} 摸一张并翻面`);
      }
    },
  },
});

// 陈群 · 法恩：一名角色翻面或翻回正面后，你可以摸一张牌。
defineSkill({
  id: 'faen', name: '法恩',
  desc: '当一名角色将武将牌翻面或翻回正面后，你可以摸一张牌。',
  triggers: [{
    on: 'flip.after', who: 'any', optional: true,
    filter: (d) => d.player.alive,
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'faen' });
      await ctx.log(`${ctx.self.name} 发动【法恩】：${ctx.data.self.name} 翻面，摸一张牌`);
    },
  }],
});

// 韩浩史涣 · 慎断：回合外失去黑色牌时，可将其置于一名角色的判定区（视为【兵粮寸断】）。
defineSkill({
  id: 'shenduan', name: '慎断',
  desc: '当你于回合外失去黑色牌时，你可以将此牌置于一名角色的判定区，视为【兵粮寸断】。',
  triggers: [{
    on: 'cards.discard', who: 'self', optional: true,
    filter: (d) => d.self !== d.game.turnPlayer && (d.cards || []).some(c => !isRedFor(d.self, c))
      && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = (ctx.data.cards || []).find(x => !isRedFor(p, x));
      if (!c) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: g.alive().filter(x => x !== p), prompt: '【慎断】：将此牌置于一名角色的判定区' });
      if (!ts.length) return;
      // 用引擎约定的 data.taken 把牌「接走」：discardCards 会照常把牌从原区域摘除
      // （含 equip.lose 等副作用），但不会再把实体牌推进弃牌堆。
      // 判定区必须存「实体牌」+ name 覆盖：resolveDelayed 用 z.name 定牌型、用 card 实体入堆；
      // 存浅拷贝副本会让同一 id 同时出现在判定区与弃牌堆。
      (ctx.data.taken = ctx.data.taken || []).push(c);
      ts[0].judgeZone.push({ card: c, name: 'bingliang', from: p.seat, reason: 'shenduan' });
      await ctx.log(`${p.name} 发动【慎断】：将 ${cardLabel(c)} 视为【兵粮寸断】置于 ${ts[0].name} 的判定区`);
    },
  }],
});

// 韩浩史涣 · 勇略：其他角色的判定阶段开始时，可令其判定作废并弃置此判定牌，然后你对其造成 1 点伤害。
defineSkill({
  id: 'yonglve', name: '勇略',
  desc: '其他角色的判定阶段开始时，你可以令其判定结果作废并弃置此判定牌，然后你对其造成 1 点伤害。',
  triggers: [{
    on: 'judge.after', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && d.self.alive && d.game.phase === 'judge' && !!d.card,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self;
      await ctx.log(`${p.name} 发动【勇略】：令 ${t.name} 的判定「${cardLabel(ctx.data.card)}」作废`);
      await ctx.damage({ from: p, to: t, amount: 1, reason: '勇略' });
    },
  }],
});

// 曹洪 · 援护：结束阶段，可将一张装备牌置入一名角色的装备区，然后其摸一张牌。
defineSkill({
  id: 'yuanhu', name: '援护',
  desc: '结束阶段，你可以将一张装备牌置入一名角色的装备区，然后其摸一张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.self.hand.some(c => CARD_META[c.name]?.sub) && d.game.alive().length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = await pickHand(ctx, p, x => CARD_META[x.name]?.sub, '【援护】：选择一张装备牌');
      if (!c) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: g.alive(), prompt: '【援护】：置入谁的装备区' });
      if (!ts.length) return;
      const t = ts[0];
      const slot = CARD_META[c.name].sub;
      p.hand = p.hand.filter(x => x !== c);
      const old = t.equips[slot];
      if (old) await ctx.discard(t, [old], { reason: 'yuanhu' });
      t.equips[slot] = c;
      await g.trigger('equip.change', { self: t, slot, card: c, old: old || null });
      await ctx.draw(t, 1, { reason: 'yuanhu' });
      await ctx.log(`${p.name} 发动【援护】：将 ${cardLabel(c)} 置入 ${t.name} 的装备区，其摸一张牌`);
    },
  }],
});

// ================= 吴 =================

// 孙鲁班 · 谮毁（简化）：出牌阶段限一次，弃一张黑色牌，视为对一名其他角色使用一张【杀】。
defineSkill({
  id: 'zenghui', name: '谮毁',
  desc: '出牌阶段限一次，你可以弃置一张黑色牌，视为对一名其他角色使用一张【杀】。',
  active: {
    perPhase: true,
    prompt: '弃一张黑色牌，视为使用一张【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = await pickHand(ctx, p, x => !isRedFor(p, x), '【谮毁】：弃置一张黑色牌');
      if (!c) { await ctx.log('【谮毁】：没有黑色牌'); return; }
      const cands = g.alive().filter(x => x !== p && g.inAttackRange(p, x));
      if (!cands.length) { await ctx.log('【谮毁】：攻击范围内没有目标'); return; }
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【谮毁】：选择【杀】的目标' });
      if (!ts.length) return;
      await ctx.discard(p, [c], { reason: 'zenghui' });
      const vSha = { id: `v${Date.now()}`, name: 'sha', suit: 'none', num: 0, type: 'basic', virtual: true };
      await ctx.useCard({ from: p, card: vSha, targets: ts, reason: 'zenghui' });
      await ctx.log(`${p.name} 发动【谮毁】：弃置 ${cardLabel(c)}，视为对 ${ts[0].name} 使用【杀】`);
    },
  },
});

// 孙鲁班 · 骄矜：受到男性角色造成的伤害时，可弃一张装备牌防止此伤害。
defineSkill({
  id: 'jiaojin', name: '骄矜',
  desc: '当你受到男性角色造成的伤害时，你可以弃置一张装备牌，然后防止此伤害。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: true,
    filter: (d) => (d.amount || 0) > 0 && !!d.from && d.from.gender === 'male'
      && [...d.self.hand, ...Object.values(d.self.equips).filter(Boolean)].some(c => CARD_META[c.name]?.sub),
    async effect(ctx) {
      const p = ctx.self;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)].filter(c => CARD_META[c.name]?.sub);
      const res = await ctx.game.ask(p, 'card', { prompt: '【骄矜】：弃置一张装备牌，防止此伤害', cards: pool.map(c => c.id), optional: true, reason: 'jiaojin' });
      const c = res && res.cardId ? pool.find(x => x.id === res.cardId) : null;
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'jiaojin' });
      ctx.data.amount = 0;
      await ctx.log(`${p.name} 发动【骄矜】：弃置 ${cardLabel(c)}，防止此伤害`);
    },
  }],
});

// 朱桓 · 奋励（简化）：准备阶段弃一张牌，本回合可跳过摸牌阶段并改为摸三张牌。
defineSkill({
  id: 'fenli', name: '奋励',
  desc: '准备阶段，你可以弃置一张牌：本回合跳过摸牌阶段，改为摸三张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.self.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self;
      const c = await pickHand(ctx, p, () => true, '【奋励】：弃置一张牌');
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'fenli' });
      p.flags.skipDraw = true;
      await ctx.draw(p, 3, { reason: 'fenli' });
      await ctx.log(`${p.name} 发动【奋励】：跳过摸牌阶段，摸三张牌`);
    },
  }],
});

// 朱桓 · 平寇：结束阶段，可对一名手牌数大于你的角色造成 1 点伤害。
defineSkill({
  id: 'pingkou', name: '平寇',
  desc: '结束阶段，你可以对一名手牌数大于你的角色造成 1 点伤害。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.game.alive().some(x => x !== d.self && x.hand.length > d.self.hand.length),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.hand.length > p.hand.length);
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【平寇】：选择一名手牌数大于你的角色' });
      if (!ts.length) return;
      await ctx.damage({ from: p, to: ts[0], amount: 1, reason: '平寇' });
      await ctx.log(`${p.name} 发动【平寇】：对 ${ts[0].name} 造成 1 点伤害`);
    },
  }],
});

// ================= 群 =================

// 沮授 · 渐营：出牌阶段内使用与上一张牌花色相同的牌时，可以摸一张牌。
defineSkill({
  id: 'jianying', name: '渐营',
  desc: '当你于出牌阶段内使用与上一张牌花色相同的牌时，你可以摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.game.phase === 'play' && !!d.card
      && d.player.flags.lastSuit === suitOf(d.player, d.card),
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'jianying' });
      await ctx.log(`${p.name} 发动【渐营】：同花色连用，摸一张牌`);
    },
  }, {
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && !!d.card,
    async effect(ctx) {
      ctx.self.flags.lastSuit = suitOf(ctx.self, ctx.data.card);
    },
  }],
});

// 沮授 · 矢北（锁定技）：受到伤害后，若为黑色牌造成则摸一张，若为红色牌造成则弃一张。
defineSkill({
  id: 'shibei', name: '矢北',
  desc: '锁定技，当你受到伤害后，若此伤害为黑色牌造成，你摸一张牌；若为红色牌造成，你弃置一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => (d.amount || 0) > 0 && !!d.card && d.self.alive,
    async effect(ctx) {
      const p = ctx.self, c = ctx.data.card;
      if (isRedFor(p, c)) {
        if (!p.hand.length) return;
        const x = p.hand[Math.floor(Math.random() * p.hand.length)];
        await ctx.discard(p, [x], { reason: 'shibei' });
        await ctx.log(`${p.name} 发动【矢北】：红色牌造成伤害，弃置 ${cardLabel(x)}`);
      } else {
        await ctx.draw(p, 1, { reason: 'shibei' });
        await ctx.log(`${p.name} 发动【矢北】：黑色牌造成伤害，摸一张牌`);
      }
    },
  }],
});

// 蔡邕 · 辟撰：使用锦囊牌时可以摸一张牌，然后将一张手牌置于牌堆顶。
defineSkill({
  id: 'bizhuan', name: '辟撰',
  desc: '当你使用一张锦囊牌时，你可以摸一张牌，然后将一张手牌置于牌堆顶。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && !!d.card && CARD_META[d.card.name]?.type === 'trick',
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'bizhuan' });
      const c = await pickHand(ctx, p, () => true, '【辟撰】：将一张手牌置于牌堆顶');
      if (!c) return;
      p.hand = p.hand.filter(x => x !== c);
      ctx.game.deck.push(c);
      await ctx.log(`${p.name} 发动【辟撰】：摸一张牌，将 ${cardLabel(c)} 置于牌堆顶`);
    },
  }],
});

// 蔡邕 · 通博（锁定技）：手牌上限 +X（X 为你已损失的体力值）。
defineSkill({
  id: 'tongbo', name: '通博',
  desc: '锁定技，你的手牌上限 +X（X 为你已损失的体力值）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'discard',
    async effect(ctx) {
      const p = ctx.self;
      const x = Math.max(0, p.maxHp - p.hp);
      p.flags.handLimit = x;
      if (x) await ctx.log(`【通博】：手牌上限 +${x}`);
    },
  }],
});

// ================= 蜀 =================

// 张松 · 强识：出牌阶段开始时，可展示一名其他角色的一张手牌，本阶段使用同类别牌时摸一张。
defineSkill({
  id: 'qiangshi', name: '强识',
  desc: '出牌阶段开始时，你可以展示一名其他角色的一张手牌，然后本阶段你使用与此牌类别相同的牌时，你摸一张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.game.alive().some(x => x !== d.self && x.hand.length),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.hand.length);
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【强识】：选择一名角色，展示其一张手牌' });
      if (!ts.length) return;
      const t = ts[0];
      const c = t.hand[Math.floor(Math.random() * t.hand.length)];
      const type = CARD_META[c.name]?.type || CARD_META[c.name]?.sub;
      p.flags.qiangshiType = type;
      p.flags.qiangshiTurn = g.turnCount;
      await ctx.log(`${p.name} 发动【强识】：展示 ${t.name} 的 ${cardLabel(c)}，本阶段使用同类牌可摸一张`);
    },
  }, {
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && !!d.card
      && d.player.flags.qiangshiTurn === d.game.turnCount
      && ((CARD_META[d.card.name]?.type || CARD_META[d.card.name]?.sub) === d.player.flags.qiangshiType),
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'qiangshi' });
      await ctx.log(`${ctx.self.name} 发动【强识】：同类别牌，摸一张`);
    },
  }],
});

// 张松 · 献图：其他角色出牌阶段开始时，可摸两张牌并交给其两张，若如此做其本回合不能对你使用牌。
defineSkill({
  id: 'xiantu', name: '献图',
  desc: '其他角色的出牌阶段开始时，你可以摸两张牌，然后交给该角色两张牌；若如此做，其本回合不能对你使用牌。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => d.phase === 'play' && d.self !== d.player && d.player.alive && d.self.alive,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self, g = ctx.game;
      await ctx.draw(p, 2, { reason: 'xiantu' });
      const n = Math.min(2, p.hand.length);
      if (n <= 0) return;
      const res = await g.ask(p, 'cards', { prompt: `【献图】：选择 ${n} 张手牌交给 ${t.name}`, min: n, max: n, candidates: p.hand.map(c => c.id), reason: 'xiantu' });
      const ids = (res && res.cardIds) || [];
      const cs = p.hand.filter(c => ids.includes(c.id));
      if (cs.length) await ctx.gain(t, cs, { from: p, reason: 'xiantu' });
      t.flags.noTargetSeat = p.seat;
      t.flags.noTargetTurn = g.turnCount;
      await ctx.log(`${p.name} 发动【献图】：交给 ${t.name} ${cs.length} 张牌，其本回合不能对 ${p.name} 使用牌`);
    },
  }],
});

// ================= 顾雍（吴） =================

// 顾雍 · 慎行：出牌阶段，你可以弃置两张手牌，然后摸一张牌。
defineSkill({
  id: 'shenxing', name: '慎行',
  desc: '出牌阶段，你可以弃置两张手牌，然后摸一张牌。',
  active: {
    perTurn: false,
    prompt: '弃置两张手牌，然后摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.hand.length < 2) { await ctx.log('【慎行】：手牌不足两张'); return; }
      const res = await g.ask(p, 'cards', { prompt: '【慎行】：弃置两张手牌', min: 2, max: 2, candidates: p.hand.map(c => c.id), reason: 'shenxing' });
      const ids = (res && res.cardIds) || [];
      const cs = p.hand.filter(c => ids.includes(c.id));
      if (cs.length < 2) return;
      await ctx.discard(p, cs, { reason: 'shenxing' });
      await ctx.draw(p, 1, { reason: 'shenxing' });
      await ctx.log(`${p.name} 发动【慎行】：弃置两张手牌，摸一张牌`);
    },
  },
});

// 顾雍 · 秉壹：结束阶段展示所有手牌，若颜色均相同，令至多 X 名角色各摸一张牌。
defineSkill({
  id: 'bingyi', name: '秉壹',
  desc: '结束阶段，你可以展示所有手牌，若这些牌颜色均相同，你令至多 X 名角色各摸一张牌（X 为你的手牌数）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.self.hand.length > 0 && d.game.alive().length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const reds = p.hand.filter(c => isRedFor(p, c)).length;
      const uniform = reds === 0 || reds === p.hand.length;
      await ctx.log(`【秉壹】：展示手牌 ${p.hand.map(c => cardLabel(c)).join('、')}（${uniform ? '颜色相同' : '颜色不同'}）`);
      if (!uniform) return;
      const x = Math.min(p.hand.length, g.alive().length);
      const ts = await ctx.ask.targets(p, { min: 1, max: x, candidates: g.alive(), prompt: `【秉壹】：令至多 ${x} 名角色各摸一张牌` });
      for (const t of ts) await ctx.draw(t, 1, { reason: 'bingyi' });
      await ctx.log(`${p.name} 发动【秉壹】：${ts.length} 名角色各摸一张牌`);
    },
  }],
});

// 吴懿 · 奔袭：锁定技，回合内每使用一张牌，本回合计算与其他角色的距离-1；
// 若与所有其他角色距离均为 1，则无视其他角色的防具，且【杀】可额外指定一个目标。
defineSkill({
  id: 'benxi', name: '奔袭',
  desc: '锁定技，当你于回合内使用牌后，本回合你计算与其他角色的距离-1；你的回合内，若你与所有其他角色的距离均为 1，你无视其他角色的防具，且你使用的【杀】可以额外指定一个目标。',
  triggers: [
    {
      on: 'turn.begin', who: 'self',
      async effect(ctx) {
        const p = ctx.self;
        p.flags.benxiMinus = 0;
        p.flags.extraShaTarget = 0;
        p.flags.ignoreArmorTurn = 0;
      },
    },
    {
      on: 'card.use.after', who: 'any',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        if (d.self !== p || g.turnPlayer !== p) return;
        p.flags.benxiMinus = (p.flags.benxiMinus || 0) + 1;
        const others = g.alive().filter(x => x !== p);
        const allOne = others.length > 0 && others.every(x => g.distance(p, x) === 1);
        p.flags.extraShaTarget = allOne ? g.turnCount : 0;
        p.flags.ignoreArmorTurn = allOne ? g.turnCount : 0;
        await ctx.log(`【奔袭】：本回合距离 -${p.flags.benxiMinus}`
          + (allOne ? '；与所有角色距离均为 1（无视防具，【杀】可多指定一个目标）' : ''));
      },
    },
  ],
});

// 周仓 · 忠勇：出牌阶段内使用的【杀】被【闪】抵消时，可将此【闪】交给该目标以外的一名角色；
// 若获得者不是周仓自己，其可对相同目标再使用一张【杀】（不计距离与次数）。
defineSkill({
  id: 'zhongyong', name: '忠勇',
  desc: '当你于出牌阶段内使用的【杀】被目标角色使用的【闪】抵消时，你可以将此【闪】交给除该角色外的一名角色；若获得此【闪】的角色不是你，你可以对相同的目标再使用一张【杀】。',
  triggers: [{
    on: 'sha.dodged', who: 'any', optional: true,
    filter: (d) => d.self === d.player && d.game.turnPlayer === d.player
      && d.game.phase === 'play' && (d.dodgeCards || []).length > 0,
    async effect(ctx) {
      const d = ctx.data;
      const p = ctx.self, g = ctx.game, target = d.target;
      const shan = d.dodgeCards[0];
      const cands = g.alive().filter(x => x !== target);
      if (!cands.length) { await ctx.log('【忠勇】：没有可将【闪】交给的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        min: 1, max: 1, candidates: cands,
        prompt: '【忠勇】：将此【闪】交给一名角色（此【杀】的目标除外）',
      });
      const recv = ts && ts[0];
      if (!recv) return;
      const di = g.discardPile.indexOf(shan);
      if (di >= 0) g.discardPile.splice(di, 1);
      await ctx.gain(recv, [shan], { reason: 'zhongyong' });
      await ctx.log(`【忠勇】：将${cardLabel(shan)}交给 ${recv.name}`);
      if (recv === p) return;
      const sha = recv.hand.find(c => c.name === 'sha');
      if (!sha) { await ctx.log(`【忠勇】：${recv.name} 没有【杀】，无法追击`); return; }
      const yes = await ctx.ask.confirm(recv, `【忠勇】：是否对 ${target.name} 使用一张【杀】？`);
      if (!yes) return;
      await g.useCard({
        from: recv, card: sha, targets: [target], reason: 'zhongyong',
        ignoreRange: true, ignoreShaLimit: true,
      });
    },
  }],
});

export const YJ2014_SKILL_IDS = ['sidi', 'dingpin', 'faen', 'shenduan', 'yonglve', 'yuanhu', 'zenghui',
  'jiaojin', 'fenli', 'pingkou', 'jianying', 'shibei', 'bizhuan', 'tongbo', 'qiangshi', 'xiantu', 'shenxing', 'bingyi',
  'benxi', 'zhongyong'];