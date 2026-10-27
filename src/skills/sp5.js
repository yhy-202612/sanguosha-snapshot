// SP·绝世（pack = 'sp5'）技能实现
// ------------------------------------------------------------------
// 8 名：SP貂蝉【离魂】【闭月】、SP周瑜【反间】【英姿】、马云禄【马术】【凤魄】、
// 曹金玉【金玉】、孙寒华【寒华】【凝冰】、花鬘【战缘】、张琪瑛【雷击】、卑弥呼【邪马台】
//
// 技能 id 前缀统一 `sp5_`（避免 jie_/mou_/ji_ 等被引擎降级别名的前缀）。
// 设计原则：只用引擎既有 API（choose / targets / judge / damage / draw / discard / gain / pindian），
// 不引入需要引擎改动的新能力；每名武将强度控制在「一个稳定收益 + 一个条件收益」。
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

const others = (g, p) => g.alive().filter((x) => x !== p);
const isRedC = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const isBlackC = (c) => !!c && (c.suit === 'spade' || c.suit === 'club');
const SUITS = ['黑桃', '红桃', '梅花', '方块'];
const SUIT_KEY = ['spade', 'heart', 'club', 'diamond'];

// ===================== SP貂蝉 =====================
// 离魂：出牌阶段限一次，你可以弃置一张手牌，然后获得一名其他角色的一张手牌。
defineSkill({
  id: 'sp5_lihun', name: '离魂',
  desc: '出牌阶段限一次，你可以弃置一张手牌，然后获得一名其他角色的一张手牌。',
  active: {
    perPhase: true,
    prompt: '离魂：弃置一张手牌，获得一名其他角色的一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【离魂】：没有手牌可弃'); return; }
      const ts = others(g, p);
      if (!ts.length) return;
      if (!p.hand.length) return;
      const [cost] = await g.chooseSomeCards(p, p.hand, 1, { prompt: '【离魂】：弃置一张手牌' });
      if (!cost) return;
      await ctx.discard(p, [cost], { reason: 'lihun' });
      const tg = await ctx.ask.targets(p, { candidates: ts, min: 1, max: 1, prompt: '【离魂】：选择一名角色' });
      const t = tg && tg[0];
      if (!t) return;
      if (!t.hand.length) { await ctx.log(`【离魂】：${t.name} 没有手牌`); return; }
      const pick = t.hand[Math.floor(Math.random() * t.hand.length)];
      await ctx.gain(p, [pick], { from: t, reason: 'lihun' });
      await ctx.log(`【离魂】：弃置 ${cardLabel(cost)}，获得 ${t.name} 的一张手牌`);
    },
  },
});

// 闭月：结束阶段，你可以摸一张牌。
defineSkill({
  id: 'sp5_biyue', name: '闭月',
  desc: '结束阶段，你可以摸一张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.player.alive,
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'biyue' });
      await ctx.log('【闭月】：摸一张牌');
    },
  }],
});

// ===================== SP周瑜 =====================
// 反间：出牌阶段限一次，你可以令一名其他角色选择一种花色，然后你展示一张手牌；
//       若花色不同，其受到 1 点伤害。
defineSkill({
  id: 'sp5_fanjian', name: '反间',
  desc: '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后你展示一张手牌；若其选择的花色与展示的牌不同，其受到 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '反间：令一名其他角色猜花色，猜错则受到 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【反间】：没有手牌'); return; }
      const ts = others(g, p);
      if (!ts.length) return;
      const tg = await ctx.ask.targets(p, { candidates: ts, min: 1, max: 1, prompt: '【反间】：选择一名角色' });
      const t = tg && tg[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, SUITS.map((s) => `猜${s}`), { prompt: '【反间】：选择一种花色', reason: 'fanjian' });
      if (idx < 0) return;
      const shown = p.hand[Math.floor(Math.random() * p.hand.length)];
      const hit = shown.suit !== SUIT_KEY[idx];
      await ctx.log(`【反间】：${t.name} 猜${SUITS[idx]}，展示 ${cardLabel(shown)}${hit ? '，猜错' : '，猜对'}`);
      if (hit) await ctx.damage({ from: p, to: t, amount: 1, reason: 'fanjian' });
    },
  },
});

// 英姿：摸牌阶段，你可以额外摸一张牌。
defineSkill({
  id: 'sp5_yingzi', name: '英姿',
  desc: '摸牌阶段，你可以额外摸一张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw' && d.player.alive,
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'yingzi' });
      await ctx.log('【英姿】：额外摸一张牌');
    },
  }],
});

// ===================== 马云禄 =====================
// 马术：锁定技，你计算与其他角色的距离 -1。
defineSkill({
  id: 'sp5_mashu', name: '马术',
  desc: '锁定技，你计算与其他角色的距离 -1。',
  triggers: [{
    on: 'distance.calc', who: 'self', optional: false,
    // distance.calc 是同步钩子，不能 await
    effect(ctx) {
      const d = ctx.data, p = ctx.self;
      if (!d || d.self !== p || !d.to || d.to === p) return;
      if (d.value > 1) d.value -= 1;
    },
  }],
});

// 凤魄：当你使用【杀】造成伤害后，你可以弃置受伤角色的一张牌。
defineSkill({
  id: 'sp5_fengpo', name: '凤魄',
  desc: '当你使用【杀】造成伤害后，你可以弃置受伤角色的一张牌。',
  triggers: [{
    // 造成伤害时 d.self 是受害者，故用 who:'any' 并以 d.player（技能拥有者）判定
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => !!d.player && d.from === d.player && d.card && d.card.name === 'sha'
      && d.to && d.to.alive && d.to !== d.player,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.to;
      const pool = [...(t.hand || []), ...Object.values(t.equips || {}).filter(Boolean)];
      if (!pool.length) return;
      const [c] = await ctx.game.chooseSomeCards(p, pool, 1, { prompt: '【凤魄】：弃置其一张牌' });
      if (!c) return;
      const holder = (t.hand || []).includes(c) ? t : t;
      await ctx.discard(holder, [c], { reason: 'fengpo' });
      await ctx.log(`【凤魄】：弃置 ${t.name} 的 ${cardLabel(c)}`);
    },
  }],
});

// ===================== 曹金玉 =====================
// 金玉：出牌阶段限一次，你可以弃置一张手牌：若为红色，令一名角色回复 1 点体力；
//       若为黑色，令一名角色摸一张牌。
defineSkill({
  id: 'sp5_jinyu', name: '金玉',
  desc: '出牌阶段限一次，你可以弃置一张手牌：若此牌为红色，你令一名角色回复 1 点体力；若为黑色，你令一名角色摸一张牌。',
  active: {
    perPhase: true,
    prompt: '金玉：弃一张手牌（红→回复 1 点体力；黑→摸一张牌）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【金玉】：没有手牌'); return; }
      const [cost] = await g.chooseSomeCards(p, p.hand, 1, { prompt: '【金玉】：弃置一张手牌' });
      if (!cost) return;
      const red = isRedC(cost);
      await ctx.discard(p, [cost], { reason: 'jinyu' });
      const cands = g.alive();
      const tg = await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: red ? '【金玉】：选择回复体力的角色' : '【金玉】：选择摸牌的角色' });
      const t = tg && tg[0];
      if (!t) return;
      if (red) {
        await ctx.recover(t, 1);
        await ctx.log(`【金玉】：弃 ${cardLabel(cost)}（红），${t.name} 回复 1 点体力`);
      } else {
        await ctx.draw(t, 1, { reason: 'jinyu' });
        await ctx.log(`【金玉】：弃 ${cardLabel(cost)}（黑），${t.name} 摸一张牌`);
      }
    },
  },
});

// ===================== 孙寒华 =====================
// 寒华：锁定技，其他角色计算与你的距离 +1。
defineSkill({
  id: 'sp5_hanhua', name: '寒华',
  desc: '锁定技，其他角色计算与你的距离 +1。',
  triggers: [{
    on: 'distance.calc', who: 'self', optional: false,
    effect(ctx) {
      const d = ctx.data, p = ctx.self;
      if (!d || !d.to || d.to !== p || d.self === p) return;
      d.value += 1;
    },
  }],
});

// 凝冰：当你受到伤害后，你可以摸两张牌，然后弃置一张牌。
defineSkill({
  id: 'sp5_ningbing', name: '凝冰',
  desc: '当你受到伤害后，你可以摸两张牌，然后弃置一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.to === d.self && d.to.alive,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 2, { reason: 'ningbing' });
      if (!p.hand.length) return;
      const [c] = await ctx.game.chooseSomeCards(p, p.hand, 1, { prompt: '【凝冰】：弃置一张手牌' });
      if (c) await ctx.discard(p, [c], { reason: 'ningbing' });
      await ctx.log('【凝冰】：摸两张牌并弃置一张');
    },
  }],
});

// ===================== 花鬘 =====================
// 战缘：当你使用【杀】指定目标后，你可以与其拼点；若你赢，你摸一张牌。
defineSkill({
  id: 'sp5_zhanyuan', name: '战缘',
  desc: '当你使用【杀】指定目标后，你可以与其拼点；若你赢，你摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && (d.targets || []).length > 0 && d.self.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self;
      const t = (ctx.data.targets || [])[0];
      if (!t || !t.alive || !t.hand.length) return;
      const { pindian } = await import('../engine/pindian.js');
      const r = await pindian(ctx.game, p, t, { reason: '战缘' });
      if (!r || r.skip) return;
      if (r.win) {
        await ctx.draw(p, 1, { reason: 'zhanyuan' });
        await ctx.log(`【战缘】：拼点获胜（${r.a?.num} vs ${r.b?.num}），摸一张牌`);
      } else {
        await ctx.log(`【战缘】：拼点未获胜（${r.a?.num} vs ${r.b?.num}）`);
      }
    },
  }],
});

// ===================== 张琪瑛 =====================
// 雷击：当你使用或打出一张【闪】后，你可以令一名角色进行判定；若结果为黑色，
//       你对其造成 2 点雷电伤害。
defineSkill({
  id: 'sp5_leiji', name: '雷击',
  desc: '当你使用或打出一张【闪】后，你可以令一名角色进行判定；若结果为黑色，你对其造成 2 点雷电伤害。',
  triggers: [{
    on: 'dodge.after', who: 'self', optional: true,
    filter: (d) => d.self && d.self.alive,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) return;
      const tg = await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【雷击】：选择判定后受到伤害的角色' });
      const t = tg && tg[0];
      if (!t) return;
      const j = await ctx.judge(t, { reason: 'leiji' });
      if (!j || j.canceled) return;
      if (isBlackC(j.card)) {
        await ctx.damage({ from: p, to: t, amount: 2, nature: 'thunder', reason: 'leiji' });
        await ctx.log(`【雷击】：判定 ${cardLabel(j.card)}（黑），对 ${t.name} 造成 2 点雷电伤害`);
      } else {
        await ctx.log(`【雷击】：判定 ${cardLabel(j.card)}（红），未生效`);
      }
    },
  }],
});

// ===================== 卑弥呼 =====================
// 邪马台：锁定技，回合开始时，你获得 1 个「亲魏」标记（上限 3）。
//         出牌阶段限一次，你可以弃置 1 个「亲魏」标记，然后摸两张牌。
defineSkill({
  id: 'sp5_xiamatai', name: '邪马台',
  desc: '锁定技，回合开始时，你获得 1 个「亲魏」标记（上限 3）。出牌阶段限一次，你可以弃置 1 个「亲魏」标记，然后摸两张牌。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: (d) => d.player === d.self && d.self.alive,
    async effect(ctx) {
      const p = ctx.self;
      p.marks.qinwei = Math.min(3, (p.marks.qinwei || 0) + 1);
      await ctx.log(`【邪马台】：获得 1 个「亲魏」标记（${p.marks.qinwei}/3）`);
    },
  }],
  active: {
    perPhase: true,
    prompt: '邪马台：弃置 1 个「亲魏」标记，摸两张牌',
    async effect(ctx) {
      const p = ctx.self;
      if ((p.marks.qinwei || 0) <= 0) { await ctx.log('【邪马台】：没有「亲魏」标记'); return; }
      p.marks.qinwei -= 1;
      await ctx.draw(p, 2, { reason: 'xiamatai' });
      await ctx.log(`【邪马台】：弃置 1 个标记（剩 ${p.marks.qinwei}），摸两张牌`);
    },
  },
});
