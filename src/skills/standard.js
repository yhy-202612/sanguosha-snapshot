import { defineSkill, effSkills } from '../engine/skill.js';
import { CARD_META, isRed, cardLabel } from '../engine/cards.js';

// ---------- 工具 ----------
function takeFromZones(game, card) {
  if (!card) return null;
  let i = game.table.indexOf(card);
  if (i >= 0) { game.table.splice(i, 1); return card; }
  i = game.discardPile.indexOf(card);
  if (i >= 0) { game.discardPile.splice(i, 1); return card; }
  return null;
}
function redCards(p) { return p.hand.filter(isRed); }
function blackCards(p) { return p.hand.filter(c => !isRed(c)); }
// 注意：ctx.ask.card（= respondCard）本身就会把选中的牌移出手牌并置入弃牌堆，
// 调用方不要再 ctx.discard，否则会二次触发 cards.discard（屯田/连营等会一牌算两次）。
async function pickCard(ctx, player, filter, prompt, reason = 'skill') {
  return ctx.ask.card(player, { filter, prompt, optional: true, reason });
}

// ================= 魏 =================
defineSkill({
  id: 'jianxiong', name: '奸雄', desc: '当你受到伤害后，你可以获得对你造成伤害的牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => !!d.card,
    async effect(ctx) {
      const c = takeFromZones(ctx.game, ctx.data.card);
      if (c) await ctx.gain(ctx.self, [c], { reason: 'jianxiong' });
    },
  }],
});

defineSkill({
  id: 'hujia', name: '护驾', desc: '主公技。当你需要使用或打出【闪】时，你可以令其他魏势力角色选择是否打出一张【闪】（视为由你使用或打出）。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'shan' && d.self.role === 'lord',
    async effect(ctx) {
      for (const p of ctx.game.alive()) {
        if (p === ctx.self || p.kingdom !== 'wei') continue;
        const c = await ctx.respond(p, { filter: { name: 'shan' }, prompt: `【护驾】：是否替 ${ctx.self.name} 打出【闪】？`, optional: true });
        if (c) { ctx.data.handled = true; ctx.data.card = c; return; }
      }
    },
  }],
});

defineSkill({
  id: 'fankui', name: '反馈', desc: '当你受到伤害后，你可以获得伤害来源的一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => !!d.from,
    async effect(ctx) {
      const src = ctx.data.from;
      const c = await ctx.game.chooseCardFrom(ctx.self, src, { reason: 'fankui' });
      if (c) await ctx.gain(ctx.self, [c], { from: src, reason: 'fankui' });
    },
  }],
});

defineSkill({
  id: 'guicai', name: '鬼才', desc: '在任意角色的判定牌生效前，你可以打出一张手牌代替之。',
  triggers: [{
    on: 'judge.before', who: 'any', optional: true,
    filter: (d) => d.self && d.self.seat !== d.player?.seat || true,
    async effect(ctx) {
      if (!ctx.self.hand.length) return;
      const c = await pickCard(ctx, ctx.self, {}, '【鬼才】：打出一张手牌代替判定牌');
      if (!c) return;
      await ctx.game.discardCards(ctx.self, [c], { reason: 'guicai' });
      ctx.data.suit = c.suit;
      ctx.data.num = c.num;
      await ctx.game.log(`${ctx.self.name} 发动【鬼才】，判定改为 ${cardLabel(c)}`);
    },
  }],
});

defineSkill({
  id: 'ganglie', name: '刚烈', desc: '当你受到伤害后，你可以进行判定：若结果不为红桃，伤害来源需弃置两张手牌，否则受到你造成的 1 点伤害。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => !!d.from && d.from !== d.self,
    async effect(ctx) {
      const j = await ctx.judge(ctx.self, { reason: '刚烈' });
      if (j.suit === 'heart') { await ctx.log('【刚烈】判定为红桃，无效'); return; }
      const src = ctx.data.from;
      if (src.hand.length >= 2) {
        const yes = await ctx.ask.confirm(src, `${ctx.self.name} 发动【刚烈】：是否弃置两张手牌？`);
        if (yes) {
          const res = await ctx.game.ask(src, 'discard', { prompt: '请弃置两张手牌', cards: src.hand.map(c => c.id), min: 2, max: 2, optional: false });
          const cards = (res?.cardIds || []).map(id => src.hand.find(c => c.id === id)).filter(Boolean).slice(0, 2);
          if (cards.length === 2) { await ctx.discard(src, cards, { reason: 'ganglie' }); return; }
        }
      }
      await ctx.damage({ from: ctx.self, to: src, amount: 1, reason: 'ganglie' });
    },
  }],
});

defineSkill({
  id: 'tuxi', name: '突袭', desc: '摸牌阶段，你可以放弃摸牌，改为获得至多两名其他角色的各一张手牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw',
    async effect(ctx) {
      const cands = ctx.game.alive().filter(p => p !== ctx.self && p.hand.length);
      if (!cands.length) return;
      const targets = await ctx.ask.targets(ctx.self, { min: 1, max: 2, candidates: cands, prompt: '【突袭】：选择至多两名角色' });
      if (!targets.length) return;
      ctx.self.flags.skip_draw = true;
      for (const t of targets) {
        if (!t.hand.length) continue;
        const c = t.hand[ctx.game.rng.int(t.hand.length)];
        await ctx.gain(ctx.self, [c], { from: t, reason: 'tuxi' });
      }
    },
  }],
});

defineSkill({
  id: 'luoyi', name: '裸衣', desc: '摸牌阶段，你可以少摸一张牌；若如此做，本回合你使用【杀】或【决斗】造成的伤害 +1。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'draw',
      async effect(ctx) {
        const yes = await ctx.ask.confirm(ctx.self, '【裸衣】：少摸一张牌，本回合【杀】与【决斗】伤害 +1？');
        if (!yes) return;
        ctx.self.flags.skip_one_draw = true;
        ctx.self.flags.luoyi = true;
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from && d.from.flags?.luoyi && (d.reason === 'sha' || d.reason === 'juedou'),
      async effect(ctx) { ctx.data.amount += 1; },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.luoyi = false; },
    },
  ],
});

defineSkill({
  id: 'tiandu', name: '天妒', desc: '当你的判定牌生效后，你可以获得此牌。',
  triggers: [{
    on: 'judge.after', who: 'self', optional: true,
    async effect(ctx) {
      const c = ctx.data.card;
      const i = ctx.game.discardPile.indexOf(c);
      if (i >= 0) { ctx.game.discardPile.splice(i, 1); await ctx.gain(ctx.self, [c], { reason: 'tiandu' }); }
    },
  }],
});

defineSkill({
  id: 'yiji', name: '遗计', desc: '当你受到 1 点伤害后，你可以摸两张牌，然后你可以将这些牌交给任意角色。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    async effect(ctx) {
      const cards = await ctx.draw(ctx.self, 2, { reason: 'yiji' });
      if (!cards.length) return;
      for (const c of cards) {
        if (!ctx.self.hand.includes(c)) continue;
        const cands = ctx.game.alive();
        const targets = await ctx.ask.targets(ctx.self, { min: 0, max: 1, candidates: cands, prompt: `【遗计】：将 ${cardLabel(c)} 交给一名角色（可取消）` });
        if (targets.length) await ctx.gain(targets[0], [c], { from: ctx.self, reason: 'yiji' });
      }
    },
  }],
});

defineSkill({
  id: 'qingguo', name: '倾国', desc: '你可以将一张黑色手牌当【闪】使用或打出。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'shan' && blackCards(d.self).length > 0,
    async effect(ctx) {
      const c = await pickCard(ctx, ctx.self, { red: false }, '【倾国】：将一张黑色手牌当【闪】打出');
      if (c) { ctx.data.handled = true; ctx.data.card = { ...c, name: 'shan', __src: c }; }
    },
  }],
});

defineSkill({
  id: 'luoshen', name: '洛神', desc: '准备阶段，你可以进行判定：若为黑色，你获得此牌并可以重复此流程。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      let guard = 0;
      while (guard++ < 12) {
        const yes = await ctx.ask.confirm(ctx.self, '【洛神】：是否进行判定？');
        if (!yes) break;
        const j = await ctx.judge(ctx.self, { reason: '洛神' });
        if (j.suit === 'heart' || j.suit === 'diamond') { await ctx.log('【洛神】判定为红色，结束'); break; }
        const c = j.card;
        const i = ctx.game.discardPile.indexOf(c);
        if (i >= 0) { ctx.game.discardPile.splice(i, 1); await ctx.gain(ctx.self, [c], { reason: 'luoshen' }); }
      }
    },
  }],
});

// ================= 蜀 =================
defineSkill({
  id: 'rende', name: '仁德', desc: '出牌阶段，你可以将任意张手牌交给其他角色。若你于此阶段内给出的牌首次达到两张，你回复 1 点体力。',
  active: {
    perTurn: false,
    prompt: '将任意张手牌交给一名其他角色',
    async effect(ctx, targets) {
      const p = ctx.self;
      const others = ctx.game.alive().filter(x => x !== p);
      if (!others.length || !p.hand.length) return;
      const res = await ctx.game.ask(p, 'cards', { prompt: '【仁德】：选择要交出的手牌', cards: p.hand.map(c => c.id), min: 0, max: 99, optional: true });
      const cards = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
      if (!cards.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: others, prompt: '【仁德】：交给谁？' });
      if (!ts.length) return;
      await ctx.gain(ts[0], cards, { from: p, reason: 'rende' });
      p.flags.rende = (p.flags.rende || 0) + cards.length;
      if (p.flags.rende >= 2 && !p.flags.rendeHealed) {
        p.flags.rendeHealed = true;
        await ctx.recover(p, 1, { reason: 'rende' });
      }
    },
  },
});

defineSkill({
  id: 'jijiang', name: '激将', desc: '主公技。当你需要使用或打出【杀】时，你可以令其他蜀势力角色选择是否打出一张【杀】（视为由你使用或打出）。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'sha' && d.self.role === 'lord',
    async effect(ctx) {
      for (const p of ctx.game.alive()) {
        if (p === ctx.self || p.kingdom !== 'shu') continue;
        const c = await ctx.respond(p, { filter: { name: 'sha' }, prompt: `【激将】：是否替 ${ctx.self.name} 打出【杀】？`, optional: true });
        if (c) { ctx.data.handled = true; ctx.data.card = c; return; }
      }
    },
  }],
});

defineSkill({
  id: 'wusheng', name: '武圣', desc: '你可以将一张红色牌当【杀】使用或打出。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'sha' && redCards(d.self).length > 0,
    async effect(ctx) {
      const c = await pickCard(ctx, ctx.self, { red: true }, '【武圣】：将一张红色牌当【杀】打出');
      if (c) { ctx.data.handled = true; ctx.data.card = { ...c, name: 'sha', __src: c }; }
    },
  }],
});

defineSkill({
  id: 'paoxiao', name: '咆哮', desc: '出牌阶段，你使用【杀】无次数限制。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    async effect(ctx) { ctx.self.flags.shaUnlimited = true; },
  }, {
    on: 'turn.end', who: 'self', optional: false,
    async effect(ctx) { ctx.self.flags.shaUnlimited = false; },
  }],
});

defineSkill({
  id: 'longdan', name: '龙胆', desc: '你可以将【杀】当【闪】、【闪】当【杀】使用或打出。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && (d.filter.name === 'sha' || d.filter.name === 'shan'),
    async effect(ctx) {
      const want = ctx.data.filter.name;
      const need = want === 'sha' ? 'shan' : 'sha';
      const c = ctx.self.hand.find(x => x.name === need);
      if (!c) return;
      const yes = await ctx.ask.confirm(ctx.self, `【龙胆】：将【${CARD_META[need].cn}】当【${CARD_META[want].cn}】打出？`);
      if (!yes) return;
      ctx.data.handled = true;
      ctx.data.card = { ...c, name: want, __src: c };
    },
  }],
});

defineSkill({
  id: 'mashu', name: '马术', desc: '锁定技，你计算与其他角色的距离 -1。',
  triggers: [{
    on: 'distance.calc', who: 'self', optional: false,
    effect(ctx) { if (ctx.data.self === ctx.self) ctx.data.value -= 1; },   // distance.calc 走同步分发，不能 async
  }],
});

defineSkill({
  id: 'tieji', name: '铁骑', desc: '当你使用【杀】指定目标后，你可以进行判定：若为红色，该角色不能使用【闪】响应此【杀】。',
  triggers: [{
    on: 'target.after', who: 'self', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && d.target && d.target !== d.self,
    async effect(ctx) {
      const j = await ctx.judge(ctx.self, { reason: '铁骑' });
      if (isRed({ suit: j.suit })) {
        ctx.data.target.flags.noShan = ctx.data.card?.id || true;
        await ctx.log(`【铁骑】生效：${ctx.data.target.name} 不能使用【闪】`);
      }
    },
  }],
});

defineSkill({
  id: 'guanxing', name: '观星', desc: '准备阶段，你可以观看牌堆顶的 X 张牌（X 为存活角色数且至多为 5），然后以任意顺序置于牌堆顶或牌堆底。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const n = Math.min(5, ctx.game.alive().length);
      const top = ctx.game.deck.splice(-n, n);
      if (!top.length) return;
      // 简化：逐张询问置于顶或底
      const toTop = [], toBottom = [];
      for (const c of top) {
        const idx = await ctx.ask.choose(ctx.self, [`${cardLabel(c)} → 置于牌堆顶`, `${cardLabel(c)} → 置于牌堆底`], { prompt: '【观星】：选择放置位置' });
        if (idx === 0) toTop.push(c); else toBottom.push(c);
      }
      // 牌堆顶在数组末尾；top 的遍历序是「底→顶」，顺序压回即可保持相对顺序
      ctx.game.deck.push(...toTop);
      if (toBottom.length) ctx.game.deck.unshift(...toBottom);
      await ctx.log(`${ctx.self.name} 发动【观星】，调整了 ${top.length} 张牌`);
    },
  }],
});

defineSkill({
  id: 'kongcheng', name: '空城', desc: '锁定技，若你没有手牌，你不能成为【杀】或【决斗】的目标。',
  triggers: [{
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => d.target === d.player && d.player.hand.length === 0 && d.card && (d.card.name === 'sha' || d.card.name === 'juedou'),
    async effect(ctx) { ctx.data.canceled = true; await ctx.log(`${ctx.self.name}【空城】生效，不能成为目标`); },
  }],
});

defineSkill({
  id: 'jizhi', name: '集智', desc: '当你使用普通锦囊牌时，你可以摸一张牌。',
  triggers: [{
    on: 'card.use.before', who: 'self', optional: true,
    filter: (d) => d.card && d.card.type === 'trick' && !CARD_META[d.card.name]?.delayed,
    async effect(ctx) { await ctx.draw(ctx.self, 1, { reason: 'jizhi' }); },
  }],
});

defineSkill({
  id: 'qicai', name: '奇才', desc: '锁定技，你使用锦囊牌无距离限制。',
  triggers: [],
});

// ================= 吴 =================
defineSkill({
  id: 'zhiheng', name: '制衡', desc: '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。',
  active: {
    perPhase: true,
    prompt: '弃置任意张牌并摸等量的牌',
    async effect(ctx) {
      const p = ctx.self;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) return;
      const res = await ctx.game.ask(p, 'cards', { prompt: '【制衡】：选择要弃置的牌', cards: pool.map(c => c.id), min: 0, max: 99, optional: true });
      const cards = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
      if (!cards.length) return;
      await ctx.discard(p, cards, { reason: 'zhiheng' });
      await ctx.draw(p, cards.length, { reason: 'zhiheng' });
    },
  },
});

defineSkill({
  id: 'jiuyuan', name: '救援', desc: '主公技。其他吴势力角色对处于濒死状态的你使用【桃】时，你额外回复 1 点体力。',
  triggers: [{
    on: 'hp.recover', who: 'self', optional: false,
    filter: (d) => d.reason === 'dying' && d.from && d.from.kingdom === 'wu' && d.from !== d.self && d.self.role === 'lord',
    async effect(ctx) { await ctx.recover(ctx.self, 1, { reason: 'jiuyuan' }); },
  }],
});

defineSkill({
  id: 'qixi', name: '奇袭', desc: '你可以将一张黑色牌当【过河拆桥】使用。',
  triggers: [],
});

defineSkill({
  id: 'keji', name: '克己', desc: '若你于出牌阶段未使用或打出过【杀】，你可以跳过弃牌阶段。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'end' || d.phase === 'discard',
    async effect(ctx) {
      if (ctx.data.phase === 'discard' && !ctx.self.flags.shaUsed) {
        ctx.self.flags.skip_discard = true;
        await ctx.log(`${ctx.self.name} 发动【克己】，跳过弃牌阶段`);
      }
    },
  }],
});

defineSkill({
  id: 'kurou', name: '苦肉', desc: '出牌阶段，你可以失去 1 点体力，然后摸两张牌。',
  active: {
    perTurn: false,
    prompt: '失去 1 点体力，摸两张牌',
    async effect(ctx) {
      await ctx.loseHp(ctx.self, 1, { reason: 'kurou' });
      if (ctx.self.alive) await ctx.draw(ctx.self, 2, { reason: 'kurou' });
    },
  },
});

defineSkill({
  id: 'yingzi', name: '英姿', desc: '摸牌阶段，你可以多摸一张牌。',
  triggers: [{
    on: 'draw.count', who: 'self', optional: false,
    async effect(ctx) { ctx.data.count += 1; },
  }],
});

defineSkill({
  id: 'fanjian', name: '反间', desc: '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后获得你的一张手牌并展示之，若此牌与所选花色不同，该角色受到 1 点伤害。',
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
      const suit = ['spade', 'heart', 'club', 'diamond'][idx] || 'spade';
      const c = p.hand[ctx.game.rng.int(p.hand.length)];
      await ctx.gain(t, [c], { from: p, reason: 'fanjian' });
      await ctx.game.revealCards([c], { to: ctx.game.alive(), reason: 'fanjian' });
      await ctx.log(`【反间】：${t.name} 选择了 ${suit === 'spade' ? '黑桃' : suit === 'heart' ? '红桃' : suit === 'club' ? '梅花' : '方块'}，实际为 ${cardLabel(c)}`);
      if (c.suit !== suit) await ctx.damage({ from: p, to: t, amount: 1, reason: 'fanjian' });
    },
  },
});

defineSkill({
  id: 'guose', name: '国色', desc: '你可以将一张方块牌当【乐不思蜀】使用。',
  triggers: [],
});

defineSkill({
  id: 'liuli', name: '流离', desc: '当你成为【杀】的目标时，你可以弃置一张牌，将此【杀】转移给你攻击范围内的另一名角色。',
  triggers: [{
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && d.target === d.player && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self;
      const used = ctx.data.used || [];
      const cands = ctx.game.alive().filter(x => x !== p && !used.includes(x) && ctx.inRange(p, x));
      if (!cands.length) return;
      const c = await pickCard(ctx, p, {}, '【流离】：弃置一张牌，转移此【杀】', 'liuli');
      if (!c) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【流离】：将【杀】转移给谁？' });
      if (!ts.length) return;
      // 牌已由 respondCard 弃置，勿重复 discard
      ctx.data.target = ts[0];
      ctx.data.redirected = true;
      await ctx.log(`${p.name} 发动【流离】，将【杀】转移给 ${ts[0].name}`);
    },
  }],
});

defineSkill({
  id: 'qianxun', name: '谦逊', desc: '锁定技，你不能成为【顺手牵羊】和【乐不思蜀】的目标。',
  triggers: [{
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => d.target === d.player && d.card && (d.card.name === 'shunshou' || d.card.name === 'lebu'),
    async effect(ctx) { ctx.data.canceled = true; await ctx.log(`${ctx.self.name}【谦逊】生效`); },
  }],
});

defineSkill({
  id: 'lianying', name: '连营', desc: '当你失去最后一张手牌时，你可以摸一张牌。',
  triggers: [{
    on: 'hand.change', who: 'self', optional: true,
    filter: (d) => d.self.hand.length === 0,
    async effect(ctx) { await ctx.draw(ctx.self, 1, { reason: 'lianying' }); },
  }],
});

defineSkill({
  id: 'jieyin', name: '结姻', desc: '出牌阶段限一次，你可以弃置两张手牌，令一名已受伤的男性角色回复 1 点体力，然后你回复 1 点体力。',
  active: {
    perPhase: true,
    prompt: '弃置两张手牌，令一名受伤男性角色与你各回复 1 点体力',
    async effect(ctx) {
      const p = ctx.self;
      if (p.hand.length < 2) return;
      const cands = ctx.game.alive().filter(x => x !== p && x.gender !== 'female' && x.hp < x.maxHp);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【结姻】：选择一名受伤的男性角色' });
      if (!ts.length) return;
      const res = await ctx.game.ask(p, 'cards', { prompt: '【结姻】：弃置两张手牌', cards: p.hand.map(c => c.id), min: 2, max: 2, optional: false });
      const cards = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean).slice(0, 2);
      if (cards.length < 2) return;
      await ctx.discard(p, cards, { reason: 'jieyin' });
      await ctx.recover(ts[0], 1, { reason: 'jieyin' });
      await ctx.recover(p, 1, { reason: 'jieyin' });
    },
  },
});

defineSkill({
  id: 'xiaoji', name: '枭姬', desc: '当你失去装备区里的一张牌后，你可以摸两张牌。',
  triggers: [{
    on: 'equip.lose', who: 'self', optional: true,
    async effect(ctx) { await ctx.draw(ctx.self, 2, { reason: 'xiaoji' }); },
  }],
});

// ================= 群 =================
defineSkill({
  id: 'jijiu', name: '急救', desc: '你可以将一张红色牌当【桃】使用。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'tao' && redCards(d.self).length > 0,
    async effect(ctx) {
      const c = await pickCard(ctx, ctx.self, { red: true }, '【急救】：将一张红色牌当【桃】使用');
      if (c) { ctx.data.handled = true; ctx.data.card = { ...c, name: 'tao', __src: c }; }
    },
  }],
});

defineSkill({
  id: 'qingnang', name: '青囊', desc: '出牌阶段限一次，你可以弃置一张手牌，令一名已受伤的角色回复 1 点体力。',
  active: {
    perPhase: true,
    prompt: '弃置一张手牌，令一名受伤角色回复 1 点体力',
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x.hp < x.maxHp);
      if (!cands.length || !p.hand.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【青囊】：选择一名受伤角色' });
      if (!ts.length) return;
      const c = await pickCard(ctx, p, {}, '【青囊】：弃置一张手牌', 'qingnang');
      if (!c) return;
      await ctx.recover(ts[0], 1, { reason: 'qingnang' });
    },
  },
});

defineSkill({
  id: 'wushuang', name: '无双', desc: '锁定技，当你使用【杀】时，目标需连续使用两张【闪】才能抵消；当你使用【决斗】时，对方需连续打出两张【杀】。',
  triggers: [{
    on: 'dodge.before', who: 'any', optional: false,
    filter: (d) => d.from && effSkills(d.from).some(s => s.id === 'wushuang') && d.card,
    async effect(ctx) { ctx.data.extraDodge = 1; },
  }, {
    on: 'juedou.need', who: 'any', optional: false,
    filter: (d) => d.from && effSkills(d.from).some(s => s.id === 'wushuang'),
    async effect(ctx) { ctx.data.extraSha = 1; },
  }],
});

defineSkill({
  id: 'lijian', name: '离间', desc: '出牌阶段限一次，你可以弃置一张牌，令两名男性角色进行【决斗】。',
  active: {
    perPhase: true,
    prompt: '弃置一张牌，令两名男性角色决斗',
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x !== p && x.gender !== 'female');
      if (cands.length < 2) return;
      const ts = await ctx.ask.targets(p, { min: 2, max: 2, candidates: cands, prompt: '【离间】：选择两名男性角色进行决斗' });
      if (ts.length < 2) return;
      const c = await pickCard(ctx, p, {}, '【离间】：弃置一张牌', 'lijian');
      if (!c) return;
      await ctx.game.log(`【离间】：${ts[0].name} 与 ${ts[1].name} 进行决斗`);
      // 简化：由第二人先出杀
      let attacker = ts[1], defender = ts[0];
      let guard = 0;
      while (guard++ < 10) {
        const s = await ctx.respond(attacker, { filter: { name: 'sha' }, prompt: `【离间】决斗：请打出一张【杀】`, optional: true });
        if (!s) { await ctx.damage({ from: defender, to: attacker, amount: 1, reason: 'lijian' }); break; }
        [attacker, defender] = [defender, attacker];
      }
    },
  },
});

defineSkill({
  id: 'biyue', name: '闭月', desc: '结束阶段，你可以摸一张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end',
    async effect(ctx) { await ctx.draw(ctx.self, 1, { reason: 'biyue' }); },
  }],
});

export const STANDARD_FEMALE = ['zhenji', 'huangyueying', 'daqiao', 'sunshangxiang', 'diaochan',
  'jie_zhenji', 'jie_huangyueying', 'jie_daqiao', 'jie_sunshangxiang', 'jie_diaochan', 'mou_diaochan'];
