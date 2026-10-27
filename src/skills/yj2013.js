// 一将成名 2013（11 将 / 23 技能）
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, suitOf, isRedFor } from '../engine/cards.js';
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

// 曹冲 · 称象：受到伤害后亮出牌堆顶四张，获得其中点数之和不大于 13 的牌。
defineSkill({
  id: 'chengxiang', name: '称象',
  desc: '每当你受到一次伤害后，你可以亮出牌堆顶四张牌，然后获得其中任意数量点数之和不大于 13 的牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => (d.amount || 0) > 0 && d.self.alive,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const top = g.deck.splice(-4);   // 牌堆顶在数组末尾
      if (!top.length) return;
      const sorted = [...top].sort((a, b) => (a.num || 0) - (b.num || 0));
      const take = [];
      let sum = 0;
      for (const c of sorted) {
        const n = c.num === 1 ? 1 : (c.num || 0);
        if (sum + n <= 13) { take.push(c); sum += n; }
      }
      const rest = top.filter(c => !take.includes(c));
      if (take.length) await ctx.gain(p, take, { reason: 'chengxiang' });
      g.deck.push(...rest);
      await ctx.log(`${p.name} 发动【称象】：亮出 ${top.map(c => cardLabel(c)).join('、')}，获得点数合计 ${sum} 的 ${take.length} 张`);
    },
  }],
});

// 曹冲 · 仁心：其他角色受到伤害时，若其体力为 1，可弃装备区一张牌防止此伤害。
defineSkill({
  id: 'renxin', name: '仁心',
  desc: '每当一名其他角色受到伤害时，若该角色的体力值为 1，你可以将装备区里的一张牌置入弃牌堆，然后防止此伤害。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && (d.amount || 0) > 0 && d.self.hp === 1
      && Object.values(d.player.equips).some(Boolean),
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self;
      const eqs = Object.entries(p.equips).filter(([, c]) => c);
      const i = eqs.length > 1
        ? await ctx.ask.choose(p, eqs.map(([, c]) => cardLabel(c)), { prompt: '【仁心】：弃置一张装备牌', reason: 'renxin' })
        : 0;
      if (i < 0) return;
      const [slot, c] = eqs[i];
      await ctx.game.unequipCard(p, c, { reason: 'fangzhu' });
      ctx.game.discardPile.push(c);
      ctx.data.amount = 0;
      await ctx.log(`${p.name} 发动【仁心】：弃置 ${cardLabel(c)}，防止对 ${t.name} 的伤害`);
    },
  }],
});

// 郭淮 · 精策：出牌阶段结束时，若本阶段使用过的牌数不少于体力值，摸两张牌。
defineSkill({
  id: 'jingce', name: '精策',
  desc: '出牌阶段结束时，若你于此阶段内使用过的牌数不少于你的体力值，你可以摸两张牌。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.game.phase === 'play',
      async effect(ctx) {
        const p = ctx.self;
        p.flags.playUsed = (p.flags.playUsed || 0) + 1;
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && (d.self.flags.playUsed || 0) >= d.self.hp,
      async effect(ctx) {
        const p = ctx.self;
        const n = p.flags.playUsed || 0;
        p.flags.playUsed = 0;
        await ctx.draw(p, 2, { reason: 'jingce' });
        await ctx.log(`${p.name} 发动【精策】：本阶段使用 ${n} 张牌，摸两张牌`);
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false, filter: () => true,
      async effect(ctx) { ctx.self.flags.playUsed = 0; },
    },
  ],
});

// 满宠 · 峻刑：弃任意张手牌，令一名其他角色选择弃等量手牌，或翻面并摸等量牌。
defineSkill({
  id: 'junxing', name: '峻刑',
  desc: '出牌阶段限一次，你可以弃置任意张手牌，然后令一名其他角色选择一项：弃置与你弃置牌数相同的手牌；或翻面并摸等量的牌。',
  active: {
    perPhase: true,
    prompt: '弃任意张手牌，令一名角色弃等量手牌或翻面摸牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【峻刑】：没有手牌'); return; }
      const n = p.hand.length === 1 ? 1 : await (async () => {
        const res = await g.ask(p, 'cards', { prompt: '【峻刑】：选择弃置的手牌（至少 1 张）', min: 1, max: p.hand.length, candidates: p.hand.map(c => c.id), reason: 'junxing' });
        return ((res && res.cardIds) || []).length;
      })();
      if (n <= 0) return;
      const res = await g.ask(p, 'cards', { prompt: `【峻刑】：选择 ${n} 张手牌弃置`, min: n, max: n, candidates: p.hand.map(c => c.id), reason: 'junxing' });
      const ids = (res && res.cardIds) || [];
      const cs = p.hand.filter(c => ids.includes(c.id));
      if (cs.length < n) return;
      await ctx.discard(p, cs, { reason: 'junxing' });
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【峻刑】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const i = await ctx.ask.choose(t, ['弃置等量手牌', '翻面并摸等量的牌'], { prompt: '【峻刑】：选择一项', reason: 'junxing' });
      if (i === 0) {
        const k = Math.min(n, t.hand.length);
        const r2 = await g.ask(t, 'cards', { prompt: `【峻刑】：弃置 ${k} 张手牌`, min: k, max: k, candidates: t.hand.map(c => c.id), reason: 'junxing' });
        const ids2 = (r2 && r2.cardIds) || [];
        const cs2 = t.hand.filter(c => ids2.includes(c.id));
        if (cs2.length) await ctx.discard(t, cs2, { reason: 'junxing' });
      } else {
        await ctx.flip(t);
        await ctx.draw(t, n, { reason: 'junxing' });
      }
      await ctx.log(`${p.name} 发动【峻刑】：弃置 ${n} 张牌，${t.name} 选择「${i === 0 ? '弃牌' : '翻面摸牌'}」`);
    },
  },
});

// 满宠 · 御策：受到伤害后展示一张手牌，来源须弃同类别的牌，否则你回复 1 点体力。
defineSkill({
  id: 'yuce', name: '御策',
  desc: '每当你受到伤害后，你可以展示一张手牌，令伤害来源选择一项：弃置一张与此牌类别相同的手牌；或令你回复 1 点体力。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => (d.amount || 0) > 0 && !!d.from && d.from !== d.self && d.self.alive && d.self.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, src = ctx.data.from;
      const c = await pickHand(ctx, p, () => true, '【御策】：展示一张手牌');
      if (!c) return;
      const type = CARD_META[c.name]?.type || CARD_META[c.name]?.sub;
      await ctx.log(`【御策】：展示 ${cardLabel(c)}`);
      const same = src.hand.filter(x => ((CARD_META[x.name]?.type || CARD_META[x.name]?.sub) === type));
      const r = same.length
        ? await ctx.game.ask(src, 'card', { prompt: '【御策】：弃置一张同类别的牌，否则对方回复 1 点体力', cards: same.map(x => x.id), optional: true, reason: 'yuce' })
        : null;
      const pick = r && r.cardId ? same.find(x => x.id === r.cardId) : null;
      if (pick) {
        await ctx.discard(src, [pick], { reason: 'yuce' });
        await ctx.log(`【御策】：${src.name} 弃置 ${cardLabel(pick)}`);
      } else {
        await ctx.recover(p, 1, { reason: 'yuce' });
        await ctx.log(`【御策】：${p.name} 回复 1 点体力`);
      }
    },
  }],
});

// ================= 蜀 =================

// 关平 · 龙吟：一名角色于出牌阶段使用【杀】时，可弃一张牌令此【杀】不计次数；若为红色【杀】，你摸一张牌。
defineSkill({
  id: 'longyin', name: '龙吟',
  desc: '当一名角色于其出牌阶段使用【杀】时，你可以弃置一张牌，令此【杀】不计次数；若此【杀】为红色，你摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'any', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && d.game.phase === 'play'
      && (d.source || d.self) !== d.player && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, src = ctx.data.source || ctx.data.self;
      const c = await pickHand(ctx, p, () => true, '【龙吟】：弃置一张牌，令此【杀】不计次数');
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'longyin' });
      src.flags.shaUsed = Math.max(0, (src.flags.shaUsed || 0) - 1);
      if (isRedFor(src, ctx.data.card)) await ctx.draw(p, 1, { reason: 'longyin' });
      await ctx.log(`${p.name} 发动【龙吟】：弃置 ${cardLabel(c)}，${src.name} 的【杀】不计次数${isRedFor(src, ctx.data.card) ? '，并摸一张牌' : ''}`);
    },
  }],
});

// 简雍 · 巧说：出牌阶段开始时与一名角色拼点，赢则本阶段使用的下一张牌可多指定一个目标（简化为摸一张牌），没赢则本阶段不能使用锦囊牌。
defineSkill({
  id: 'qiaoshuo', name: '巧说',
  desc: '出牌阶段开始时，你可以与一名角色拼点：若你赢，本阶段你使用的下一张牌可以多指定一个目标（简化为你摸一张牌）；若你没赢，你本阶段不能使用锦囊牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.self.hand.length > 0 && d.game.alive().some(x => x !== d.self && x.hand.length),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.hand.length);
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【巧说】：选择拼点对象' });
      if (!ts.length) return;
      const r = await pindian(g, p, ts[0], { reason: '巧说' });
      if (r.win) {
        p.flags.qiaoshuoWin = g.turnCount;
        await ctx.draw(p, 1, { reason: 'qiaoshuo' });
        await ctx.log(`${p.name} 发动【巧说】获胜：本阶段多一个目标（简化为摸一张牌）`);
      } else {
        p.flags.qiaoshuoLose = g.turnCount;
        await ctx.log(`${p.name} 发动【巧说】未赢：本阶段不能使用锦囊牌`);
      }
    },
  }],
});

// 简雍 · 纵适：当你拼点的牌亮出后，你可以获得其中一张（简化：赢则收回自己拼点的牌）。
defineSkill({
  id: 'zongshi_jy', name: '纵适',
  desc: '当你拼点的牌亮出后，你可以获得其中一张。',
  triggers: [{
    on: 'cards.discard', who: 'self', optional: true,
    filter: (d) => d.reason === '巧说' || d.reason === '拼点' || d.reason === '纵适',
    async effect(ctx) {
      const p = ctx.self;
      const cards = (ctx.data.cards || []).filter(c => p.flags.lastPindianId === c.id);
      if (!cards.length) return;
      // cards.discard 在「牌进入弃牌堆之前」触发：用 taken 声明接管，并兼容牌已在弃牌堆的情形
      ctx.data.taken = ctx.data.taken || [];
      for (const c of cards) if (!ctx.data.taken.includes(c)) ctx.data.taken.push(c);
      takeFromDiscard(ctx.game, cards);
      await ctx.gain(p, cards, { reason: 'zongshi_jy' });
      await ctx.log(`${p.name} 发动【纵适】：收回拼点的牌 ${cardLabel(cards[0])}`);
    },
  }],
});

// 刘封 · 陷嗣：准备阶段将至多两名角色各一张牌置于武将牌上称「嗣」。
defineSkill({
  id: 'xiansi', name: '陷嗣',
  reclaimCards(p) { const a = p.si || []; p.si = []; return a; },
  desc: '准备阶段，你可以将至多两名角色的各一张牌置于你的武将牌上，称为「嗣」；其他角色可以将两张「嗣」置入弃牌堆，视为对你使用一张【杀】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.game.alive().some(x => x !== d.self && (x.hand.length || Object.values(x.equips).some(Boolean))),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && (x.hand.length || Object.values(x.equips).some(Boolean)));
      const ts = await ctx.ask.targets(p, { min: 1, max: 2, candidates: cands, prompt: '【陷嗣】：选择至多两名角色，各取一张牌作为「嗣」' });
      p.si = p.si || [];
      for (const t of ts) {
        const c = await g.chooseCardFrom(p, t, { reason: 'xiansi' });
        if (!c) continue;
        const hi = t.hand.indexOf(c);
        if (hi >= 0) t.hand.splice(hi, 1);
        await g.unequipCard(t, c, { reason: 'xiansi' });
        p.si.push(c);
      }
      await ctx.log(`${p.name} 发动【陷嗣】：获得 ${p.si.length} 张「嗣」`);
    },
  }],
});

// ================= 吴 =================

// 潘璋马忠 · 夺刀：受到【杀】造成的伤害后，可以获得此【杀】。
defineSkill({
  id: 'duodao', name: '夺刀',
  desc: '当你受到【杀】造成的伤害后，你可以获得此【杀】。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && (d.amount || 0) > 0 && d.self.alive,
    async effect(ctx) {
      const c = ctx.data.card;
      takeFromDiscard(ctx.game, [c]);
      await ctx.gain(ctx.self, [c], { reason: 'duodao' });
      await ctx.log(`${ctx.self.name} 发动【夺刀】：获得 ${cardLabel(c)}`);
    },
  }],
});

// 潘璋马忠 · 暗箭（锁定技）：使用【杀】指定目标后，若你不在其攻击范围内，此【杀】不能被【闪】响应。
defineSkill({
  id: 'anjian', name: '暗箭',
  desc: '锁定技，当你使用【杀】指定目标后，若你不在其攻击范围内，此【杀】不能被【闪】响应。',
  triggers: [{
    on: 'target.after', who: 'any', optional: false,
    filter: (d) => d.self === d.player && d.card && d.card.name === 'sha'
      && d.target !== d.player && d.target.alive !== false
      && !d.game.inAttackRange(d.target, d.player),
    async effect(ctx) {
      if (ctx.data.shaCtx) ctx.data.shaCtx.unavoidable = true;
      await ctx.log(`【暗箭】：${ctx.self.name} 不在 ${ctx.data.target.name} 的攻击范围内，此【杀】不可被【闪】响应`);
    },
  }],
});

// 虞翻 · 纵玄：你的牌因弃置进入弃牌堆时，可将其中任意张置于牌堆顶（简化：全部置顶）。
defineSkill({
  id: 'zongxuan', name: '纵玄',
  desc: '每当你的牌因弃置而进入弃牌堆时，你可以将其中任意张牌置于牌堆顶。',
  triggers: [{
    on: 'cards.discard', who: 'self', optional: true,
    filter: (d) => (d.cards || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cards = ctx.data.cards || [];
      // 置于牌堆顶：牌尚未进弃牌堆，须用 taken 接管并自行放入牌堆，否则牌会同时存在于两处
      ctx.data.taken = ctx.data.taken || [];
      for (const c of cards) if (!ctx.data.taken.includes(c)) ctx.data.taken.push(c);
      takeFromDiscard(g, cards);
      g.deck.push(...cards);
      await ctx.log(`${p.name} 发动【纵玄】：将 ${cards.length} 张弃牌置于牌堆顶`);
    },
  }],
});

// 虞翻 · 直言：结束阶段令一名角色摸一张牌并展示，若为装备牌，其回复 1 点体力并装备之（简化：装备牌则回复 1 点）。
defineSkill({
  id: 'zhiyan', name: '直言',
  desc: '结束阶段，你可以令一名角色摸一张牌并展示之，若此牌为装备牌，该角色回复 1 点体力并使用之。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: g.alive(), prompt: '【直言】：令一名角色摸一张牌并展示' });
      if (!ts.length) return;
      const t = ts[0];
      const cards = await ctx.draw(t, 1, { reason: 'zhiyan' });
      const c = cards && cards[0];
      if (!c) return;
      const sub = CARD_META[c.name]?.sub;
      await ctx.log(`【直言】：展示 ${cardLabel(c)}${sub ? '（装备牌）' : ''}`);
      if (sub) await ctx.recover(t, 1, { reason: 'zhiyan' });
    },
  }],
});

// 朱然 · 胆守：造成伤害后摸一张牌，然后若手牌数大于体力值，弃一张牌。
defineSkill({
  id: 'danshou', name: '胆守',
  desc: '每当你造成伤害后，你可以摸一张牌，然后若你的手牌数大于体力值，你弃置一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.from === d.player && d.self !== d.player && (d.amount || 0) > 0 && d.player.alive,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'danshou' });
      if (p.hand.length > p.hp) {
        const c = await pickHand(ctx, p, () => true, '【胆守】：弃置一张手牌');
        if (c) await ctx.discard(p, [c], { reason: 'danshou' });
      }
      await ctx.log(`${p.name} 发动【胆守】`);
    },
  }],
});

// ================= 群 =================

// 伏皇后 · 惴恐：其他角色回合开始时，若你已受伤，可与其拼点：赢则其本回合不能指定他人为目标；没赢则其视为对你使用【杀】。
defineSkill({
  id: 'zhuikong', name: '惴恐',
  desc: '其他角色的回合开始时，若你已受伤，你可以与其拼点：若你赢，其本回合不能使用牌指定除其以外的角色为目标；若你没赢，其视为对你使用一张【杀】。',
  triggers: [{
    on: 'turn.begin', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && d.player.hp < d.player.maxHp
      && d.player.hand.length > 0 && d.self.hand.length > 0 && d.self.alive,
    async effect(ctx) {
      const me = ctx.self, t = ctx.data.self, g = ctx.game;
      const r = await pindian(g, me, t, { reason: '惴恐' });
      if (r.win) {
        t.flags.zhuikongTurn = g.turnCount;
        await ctx.log(`【惴恐】：${me.name} 拼点获胜，${t.name} 本回合不能指定其他角色为目标`);
      } else {
        const vSha = { id: `v${Date.now()}`, name: 'sha', suit: 'none', num: 0, type: 'basic', virtual: true };
        await ctx.log(`【惴恐】：${me.name} 未赢，${t.name} 视为对 ${me.name} 使用一张【杀】`);
        await g.useCard({ from: t, card: vSha, targets: [me], reason: 'zhuikong' });
      }
    },
  }],
});

// 伏皇后 · 求援：成为【杀】目标时，可令另一名其他角色选择：交给你一张【闪】；或令此【杀】转移给他。
defineSkill({
  id: 'qiuyuan', name: '求援',
  desc: '当你成为【杀】的目标时，你可以令另一名其他角色选择一项：交给你一张【闪】；或令此【杀】转移给你。',
  triggers: [{
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => d.target === d.player && d.card && d.card.name === 'sha'
      && d.game.alive().some(x => x !== d.player && x !== d.self),
    async effect(ctx) {
      const me = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== me && x !== ctx.data.self);
      const ts = await ctx.ask.targets(me, { min: 1, max: 1, candidates: cands, prompt: '【求援】：选择一名其他角色' });
      if (!ts.length) return;
      const t = ts[0];
      const shan = t.hand.find(c => c.name === 'shan');
      const i = await ctx.ask.choose(t, shan ? ['交给她一张【闪】', '令此【杀】转移给你'] : ['令此【杀】转移给你'], { prompt: `【求援】：${me.name} 向你求援`, reason: 'qiuyuan' });
      if (i === 0 && shan) {
        await ctx.gain(me, [shan], { from: t, reason: 'qiuyuan' });
        await ctx.log(`【求援】：${t.name} 交给 ${me.name} 一张【闪】`);
      } else {
        ctx.data.target = t;
        await ctx.log(`【求援】：${t.name} 成为此【杀】的新目标`);
      }
    },
  }],
});

// 李儒 · 绝策：结束阶段，可对一名没有手牌的角色造成 1 点伤害。
defineSkill({
  id: 'juece', name: '绝策',
  desc: '结束阶段，你可以对一名没有手牌的角色造成 1 点伤害。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.game.alive().some(x => x !== d.self && x.hand.length === 0),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.hand.length === 0);
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【绝策】：选择一名没有手牌的角色' });
      if (!ts.length) return;
      await ctx.damage({ from: p, to: ts[0], amount: 1, reason: '绝策' });
      await ctx.log(`${p.name} 发动【绝策】：对 ${ts[0].name} 造成 1 点伤害`);
    },
  }],
});

// 李儒 · 灭计：将一张黑色锦囊置于牌堆顶，令一名有手牌角色选择：弃一张锦囊牌；或将两张手牌置于牌堆顶。
defineSkill({
  id: 'mieji', name: '灭计',
  desc: '出牌阶段限一次，你可以将一张黑色锦囊牌置于牌堆顶，然后选择一名有手牌的其他角色，其选择一项：弃置一张锦囊牌；或将两张手牌置于牌堆顶。',
  active: {
    perPhase: true,
    prompt: '将一张黑色锦囊置于牌堆顶，令一名角色弃锦囊或置两张手牌于牌堆顶',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = await pickHand(ctx, p, x => CARD_META[x.name]?.type === 'trick' && !isRedFor(p, x), '【灭计】：将一张黑色锦囊置于牌堆顶');
      if (!c) { await ctx.log('【灭计】：没有黑色锦囊牌'); return; }
      p.hand = p.hand.filter(x => x !== c);
      g.deck.push(c);
      await ctx.log(`${p.name} 发动【灭计】：将 ${cardLabel(c)} 置于牌堆顶`);
      const cands = g.alive().filter(x => x !== p && x.hand.length > 0);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【灭计】：选择一名有手牌的角色' });
      if (!ts.length) return;
      const t = ts[0];
      const tricks = t.hand.filter(x => CARD_META[x.name]?.type === 'trick');
      const i = await ctx.ask.choose(t, tricks.length ? ['弃置一张锦囊牌', '将两张手牌置于牌堆顶'] : ['将两张手牌置于牌堆顶'], { prompt: '【灭计】：选择一项', reason: 'mieji' });
      if (i === 0 && tricks.length) {
        const tc = tricks[Math.floor(Math.random() * tricks.length)];
        await ctx.discard(t, [tc], { reason: 'mieji' });
        await ctx.log(`【灭计】：${t.name} 弃置 ${cardLabel(tc)}`);
      } else {
        const n = Math.min(2, t.hand.length);
        const moved = t.hand.slice(0, n);
        t.hand = t.hand.slice(n);
        g.deck.push(...moved);
        await ctx.log(`【灭计】：${t.name} 将 ${n} 张手牌置于牌堆顶`);
      }
    },
  },
});

// 李儒 · 焚城（限定技）：令所有其他角色依次选择：弃置至少 X 张牌（X 为上一名弃牌者的弃牌数 +1）；或受到 1 点火焰伤害。
defineSkill({
  id: 'fencheng', name: '焚城',
  desc: '限定技，出牌阶段，你可以令所有其他角色依次选择一项：弃置至少 X 张牌（X 为上一名以此法弃牌的角色弃置的牌数 +1）；或受到 1 点火焰伤害。',
  active: {
    perTurn: false,
    prompt: '限定技：所有其他角色弃 X 张牌或受到 1 点火焰伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.fenchengUsed) { await ctx.log('【焚城】：本局已使用过'); return; }
      p.flags.fenchengUsed = true;
      let need = 1;
      for (const t of g.alive().filter(x => x !== p)) {
        if (!t.alive) continue;
        const canDiscard = t.hand.length + Object.values(t.equips).filter(Boolean).length >= need;
        const opts = canDiscard ? [`弃置至少 ${need} 张牌`, '受到 1 点火焰伤害'] : ['受到 1 点火焰伤害'];
        const i = await ctx.ask.choose(t, opts, { prompt: `【焚城】：需弃置至少 ${need} 张牌，或受到 1 点火焰伤害`, reason: 'fencheng' });
        if (i === 0 && canDiscard) {
          const k = Math.min(need, t.hand.length);
          const res = await g.ask(t, 'cards', { prompt: `【焚城】：弃置 ${k} 张手牌`, min: k, max: k, candidates: t.hand.map(c => c.id), reason: 'fencheng' });
          const ids = (res && res.cardIds) || [];
          const cs = t.hand.filter(c => ids.includes(c.id));
          if (cs.length) await ctx.discard(t, cs, { reason: 'fencheng' });
          need = cs.length + 1;
          await ctx.log(`【焚城】：${t.name} 弃置 ${cs.length} 张牌，下一名需弃置至少 ${need} 张`);
        } else {
          await ctx.damage({ from: p, to: t, amount: 1, nature: 'fire', reason: '焚城' });
          await ctx.log(`【焚城】：${t.name} 受到 1 点火焰伤害`);
        }
      }
    },
  },
});

export const YJ2013_SKILL_IDS = ['chengxiang', 'renxin', 'jingce', 'junxing', 'yuce', 'longyin', 'qiaoshuo',
  'zongshi_jy', 'xiansi', 'duodao', 'anjian', 'zongxuan', 'zhiyan', 'danshou', 'zhuikong', 'qiuyuan',
  'juece', 'mieji', 'fencheng'];
