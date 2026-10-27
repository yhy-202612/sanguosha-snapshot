// 谋系列武将专属技能（其余 mou_ 技能走 getSkill 前缀降级复用标准包同名技能）
import { defineSkill } from '../engine/skill.js';
import { CARD_META, isRed, cardLabel } from '../engine/cards.js';

// 谋黄忠 · 烈弓（简化：令一名角色本回合不能使用【闪】）
defineSkill({
  id: 'mou_liegong', name: '烈弓', desc: '出牌阶段限一次，你可以令一名其他角色本回合不能使用【闪】（简化口径）。',
  active: {
    perPhase: true,
    prompt: '令一名角色本回合不能使用【闪】',
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【烈弓】：选择一名角色' });
      if (!ts.length) return;
      ts[0].flags.noShanTurn = ctx.game.turnCount;
      await ctx.log(`${p.name} 发动【烈弓】，${ts[0].name} 本回合不能使用【闪】`);
    },
  },
});

// 谋黄忠 · 酒诗（简化：视为使用一张【酒】，下一张【杀】伤害 +1）
defineSkill({
  id: 'mou_jiushi', name: '酒诗', desc: '出牌阶段限一次，你可以视为使用一张【酒】（本回合下一张【杀】伤害 +1）。',
  active: {
    perPhase: true,
    prompt: '视为使用一张【酒】',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.jiu) return ctx.log('【酒诗】：本回合已有【酒】效果');
      p.flags.jiu = 1;
      await ctx.log(`${p.name} 发动【酒诗】，视为使用【酒】`);
    },
  },
});

// ================= SG004 补全（谋 11 条） =================

// 只从手牌里直接选一张：不走 ctx.ask.card（respondCard 会再触发 respond.need，造成转化技递归）。
async function askHand(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  const res = await ctx.game.ask(player, 'card', {
    prompt, cards: cands.map(c => c.id), optional: false, reason: 'mou_skill',
  });
  return (res && cands.find(c => c.id === res.cardId)) || null;
}

// 从处理区 / 弃牌堆取回一张牌
function takeFromZones(game, card) {
  if (!card) return null;
  let i = game.table.indexOf(card);
  if (i >= 0) { game.table.splice(i, 1); return card; }
  i = game.discardPile.indexOf(card);
  if (i >= 0) { game.discardPile.splice(i, 1); return card; }
  return null;
}

// 谋曹操 · 奸雄：受到伤害后，可获得造成伤害的牌，然后摸一张牌。
defineSkill({
  id: 'mou_jianxiong', name: '奸雄',
  desc: '当你受到伤害后，你可以获得对你造成伤害的牌，然后摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => !!d.card,
    async effect(ctx) {
      const c = takeFromZones(ctx.game, ctx.data.card);
      if (c) await ctx.gain(ctx.self, [c], { reason: 'mou_jianxiong' });
      await ctx.draw(ctx.self, 1, { reason: 'mou_jianxiong' });
    },
  }],
});

// 谋曹操 · 护驾（主公技）：每回合限一次，令一名其他魏势力角色交给你一张【闪】，视为你使用/打出【闪】。
defineSkill({
  id: 'mou_hujia', name: '护驾',
  desc: '主公技，每回合限一次：当你需要使用或打出【闪】时，你可以令一名其他魏势力角色交给你一张【闪】，视为你使用或打出【闪】。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'shan' && d.self.role === 'lord'
      && d.self.flags.mouHujiaTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self;
      const allies = ctx.game.alive().filter(x => x !== p && x.kingdom === 'wei' && x.hand.some(c => c.name === 'shan'));
      for (const a of allies) {
        const shan = a.hand.filter(c => c.name === 'shan');
        if (!shan.length) continue;
        const res = await ctx.game.ask(a, 'card', {
          prompt: `【护驾】：是否交给 ${p.name} 一张【闪】？`, cards: shan.map(c => c.id), optional: true, reason: 'mou_hujia',
        });
        const c = res && shan.find(x => x.id === res.cardId);
        if (!c) continue;
        await ctx.gain(p, [c], { from: a, reason: 'mou_hujia' });
        p.flags.mouHujiaTurn = ctx.game.turnCount;
        ctx.data.handled = true;
        ctx.data.card = { ...c, name: 'shan', __src: c };
        await ctx.log(`${p.name} 发动【护驾】，${a.name} 交给一张【闪】`);
        return;
      }
    },
  }],
});

// 谋貂蝉 · 离间：弃一张牌，令两名男性角色视为前者对后者使用【决斗】（不能被无懈）。
defineSkill({
  id: 'mou_lijian', name: '离间',
  desc: '出牌阶段限一次，你可以弃置一张牌，令一名男性角色视为对另一名男性角色使用一张【决斗】（不能被【无懈可击】抵消）。',
  active: {
    perPhase: true,
    prompt: '弃一张牌，令两名男性角色决斗',
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x !== p && x.gender !== 'female');
      if (cands.length < 2) return;
      const picked = await ctx.ask.targets(p, { min: 2, max: 2, candidates: cands, prompt: '【离间】：选择两名男性角色（先选者视为使用【决斗】）' });
      const ts = [...new Set(picked)];
      if (ts.length < 2) return;
      const c = await askHand(ctx, p, () => true, '【离间】：弃置一张手牌');
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'mou_lijian' });
      await ctx.game.log(`【离间】：${ts[0].name} 视为对 ${ts[1].name} 使用【决斗】（不可无懈）`);
      await ctx.game.resolveJuedou({ from: ts[0], target: ts[1], card: c, reason: 'lijian' });
    },
  },
});

// 谋张辽 · 突袭：摸牌阶段，可少摸任意张，获得等量名其他角色各一张手牌。
defineSkill({
  id: 'mou_tuxi', name: '突袭',
  desc: '摸牌阶段，你可以少摸任意张牌，然后获得等量名其他角色的各一张手牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw' && d.game.alive().some(x => x !== d.self && x.hand.length),
    async effect(ctx) {
      const cands = ctx.game.alive().filter(x => x !== ctx.self && x.hand.length);
      if (!cands.length) return;
      const picked = await ctx.ask.targets(ctx.self, { min: 1, max: 2, candidates: cands, prompt: '【突袭】：选择至多两名角色（少摸等量牌）' });
      const ts = [...new Set(picked)].slice(0, 2);
      if (!ts.length) return;
      ctx.self.flags.skip_draw = true;
      const remain = Math.max(0, 2 - ts.length);
      if (remain > 0) await ctx.draw(ctx.self, remain, { reason: 'mou_tuxi' });
      for (const t of ts) {
        if (!t.hand.length) continue;
        const c = t.hand[ctx.game.rng.int(t.hand.length)];
        await ctx.gain(ctx.self, [c], { from: t, reason: 'mou_tuxi' });
      }
      await ctx.log(`${ctx.self.name} 发动【突袭】，少摸 ${ts.length} 张并获得 ${ts.length} 名角色各一张手牌`);
    },
  }],
});

// 谋许褚 · 裸衣：摸牌阶段，可少摸一张，本回合【杀】或【决斗】伤害 +1。
defineSkill({
  id: 'mou_luoyi', name: '裸衣',
  desc: '摸牌阶段，你可以少摸一张牌；若如此做，本回合你使用【杀】或【决斗】造成的伤害 +1。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'draw',
      async effect(ctx) {
        ctx.self.flags.skip_one_draw = true;
        ctx.self.flags.mouLuoyi = true;
        await ctx.log(`${ctx.self.name} 发动【裸衣】，本回合【杀】与【决斗】伤害 +1`);
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from && d.from === d.player && d.player.flags.mouLuoyi
        && (d.reason === 'sha' || d.reason === 'juedou' || d.reason === 'lijian'),
      async effect(ctx) { ctx.data.amount += 1; },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.mouLuoyi = false; },
    },
  ],
});

// 谋周瑜 · 英姿：摸牌阶段多摸一张；手牌上限 +X（X = 体力上限）。
defineSkill({
  id: 'mou_yingzi', name: '英姿',
  desc: '摸牌阶段，你多摸一张牌；你的手牌上限 +X（X 为你的体力上限）。',
  triggers: [
    {
      on: 'draw.count', who: 'self', optional: false,
      async effect(ctx) { ctx.data.count += 1; },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.handLimit = ctx.self.maxHp; },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.handLimit = 0; },
    },
  ],
});

// 谋周瑜 · 反间：令一名其他角色选花色，其获得你一张手牌并展示，花色不符则你对其造成 1 点伤害。
defineSkill({
  id: 'mou_fanjian', name: '反间',
  desc: '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后其获得你的一张手牌并展示之，若此牌与所选花色不同，你对其造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '令一名角色猜花色',
    async effect(ctx) {
      const p = ctx.self;
      const others = ctx.game.alive().filter(x => x !== p);
      if (!others.length || !p.hand.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: others, prompt: '【反间】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const idx = await ctx.ask.choose(t, ['♠ 黑桃', '♥ 红桃', '♣ 梅花', '♦ 方块'], { prompt: '【反间】：选择一种花色' });
      const suits = ['spade', 'heart', 'club', 'diamond'];
      const suit = suits[idx] || 'spade';
      const c = p.hand[ctx.game.rng.int(p.hand.length)];
      await ctx.gain(t, [c], { from: p, reason: 'mou_fanjian' });
      await ctx.game.revealCards([c], { to: ctx.game.alive(), reason: '反间' });
      await ctx.log(`【反间】：${t.name} 选择了 ${['黑桃', '红桃', '梅花', '方块'][suits.indexOf(suit)]}，实际为 ${cardLabel(c)}`);
      if (c.suit !== suit) await ctx.damage({ from: p, to: t, amount: 1, reason: 'mou_fanjian' });
    },
  },
});

// 谋诸葛亮 · 观星：准备阶段观看牌堆顶 X 张（X = 存活人数，至多 5），以任意顺序置于顶或底。
defineSkill({
  id: 'mou_guanxing', name: '观星',
  desc: '准备阶段，你可以观看牌堆顶的 X 张牌（X 为存活角色数且至多为 5），然后以任意顺序置于牌堆顶或牌堆底。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self;
      const n = Math.min(5, ctx.game.alive().length);
      const top = ctx.game.deck.splice(-n, n);
      if (!top.length) return;
      const toTop = [], toBottom = [];
      for (const c of top) {
        const idx = await ctx.ask.choose(p, [`${cardLabel(c)} → 置于牌堆顶`, `${cardLabel(c)} → 置于牌堆底`], {
          prompt: '【观星】：选择放置位置', reason: 'mou_guanxing',
        });
        if (idx === 1) toBottom.push(c); else toTop.push(c);
      }
      // top 数组按「牌堆底→顶」排列，原样 push/unshift 回牌堆即保持相对顺序
      ctx.game.deck.push(...toTop);
      if (toBottom.length) ctx.game.deck.unshift(...toBottom);
      await ctx.log(`${p.name} 发动【观星】，调整了 ${top.length} 张牌（顶 ${toTop.length}）`);
    },
  }],
});

// 谋张飞 · 咆哮：锁定技，使用【杀】无次数限制；【杀】被【闪】抵消后摸一张牌。
defineSkill({
  id: 'mou_paoxiao', name: '咆哮',
  desc: '锁定技，你使用【杀】无次数限制；当你的【杀】被【闪】抵消后，你摸一张牌。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.shaUnlimited = true; },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.shaUnlimited = false; },
    },
    {
      on: 'sha.dodged', who: 'self', optional: false,
      async effect(ctx) { await ctx.draw(ctx.self, 1, { reason: 'mou_paoxiao' }); },
    },
  ],
});

// 谋关羽 · 武圣：可将红色牌当【杀】使用/打出；以此法造成的伤害 +1。
defineSkill({
  id: 'mou_wusheng', name: '武圣',
  desc: '你可以将一张红色牌当【杀】使用或打出；以此法造成的伤害 +1。',
  triggers: [
    {
      on: 'respond.need', who: 'self', optional: true,
      filter: (d) => d.filter && d.filter.name === 'sha' && d.self.hand.some(isRed),
      async effect(ctx) {
        const c = await askHand(ctx, ctx.self, isRed, '【武圣】：将一张红色牌当【杀】打出');
        if (!c) return;
        ctx.data.handled = true;
        ctx.data.card = { ...c, name: 'sha', __src: c };
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from && d.from === d.player && d.reason === 'sha'
        && d.card && d.card.__src && isRed(d.card.__src),
      async effect(ctx) { ctx.data.amount += 1; },
    },
  ],
});

// 谋孙权 · 制衡：弃任意张牌摸等量；若弃光所有手牌，额外摸一张。
defineSkill({
  id: 'mou_zhiheng', name: '制衡',
  desc: '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌；若你以此法弃置了所有手牌，你额外摸一张牌。',
  active: {
    perPhase: true,
    prompt: '弃置任意张牌并摸等量的牌',
    async effect(ctx) {
      const p = ctx.self;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) return;
      const handBefore = p.hand.length;
      const res = await ctx.game.ask(p, 'cards', {
        prompt: '【制衡】：选择要弃置的牌', cards: pool.map(c => c.id), min: 0, max: 99, optional: true,
      });
      const cards = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
      if (!cards.length) return;
      await ctx.discard(p, cards, { reason: 'mou_zhiheng' });
      const extra = handBefore > 0 && p.hand.length === 0 ? 1 : 0;
      await ctx.draw(p, cards.length + extra, { reason: 'mou_zhiheng' });
    },
  },
});

export {};
