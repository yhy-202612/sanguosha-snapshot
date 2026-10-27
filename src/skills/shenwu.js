// 神·武精选（8 将）：神钟会 / 神曹丕 / 神庞统 / 神华佗 / 神姜维 / 神张角 / 神马超 / 神典韦
// 技能原文取自三国杀官网（x.sanguosha.com / sanguosha.com）、三国杀 Wiki、萌娘百科「神·武」条目。
// 无法完全落地的细节统一写在技能 desc 的「本实现」括号内，并在交付总结里列出简化点。
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { cardLabel, CARD_META } from '../engine/cards.js';

const takeTop = (g, n) => { const out = []; for (let i = 0; i < n && g.deck.length; i++) out.push(g.deck.pop()); return out; };
const isBlack = (c) => !!c && (c.suit === 'spade' || c.suit === 'club');
const isFireDamageCard = (c) => !!c && (c.name === 'huogong' || (c.name === 'sha' && c.nature === 'fire'));
const typeOf = (c) => (c ? CARD_META[c.name]?.type : null);

// ============================================================ 神钟会
defineSkill({
  id: 'linjie', name: '凛界',
  desc: '每轮开始时，你可对一名没有“凛”的角色造成1点伤害，然后令其获得一个“凛”标记。有“凛”的其他角色受到伤害后，随机弃置一张手牌；若其因此弃置了最后一张手牌，你对其造成1点伤害并移去“凛”。',
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => ((d.player.flags.swRound || 0) !== (d.game.round || 1))
        && d.game.alive().some(x => x !== d.player && !(x.flags.lin || 0)),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.swRound = g.round || 1;   // 每轮只在此轮第一个回合的开始时结算一次
        const cands = g.alive().filter(x => x !== p && !(x.flags.lin || 0));
        if (!cands.length) return;
        if (!(await ctx.ask.confirm(p, '【凛界】：是否对一名没有“凛”的角色造成 1 点伤害？'))) return;
        const t = (await ctx.ask.targets(p, { prompt: '【凛界】：选择目标', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'linjie' });
        t.flags.lin = (t.flags.lin || 0) + 1;
        await ctx.log(`【凛界】：${t.name} 获得 1 个“凛”（共 ${t.flags.lin}）`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && (d.self.flags.lin || 0) > 0 && d.self.hand.length > 0 && d.self.alive,
      async effect(ctx) {
        const p = ctx.self, v = ctx.data.self;
        const c = v.hand[ctx.game.rng.int(v.hand.length)];
        await ctx.discard(v, [c], { reason: 'linjie' });
        await ctx.log(`【凛界】：${v.name} 因“凛”随机弃置 ${cardLabel(c)}`);
        if (!v.hand.length) {
          v.flags.lin = 0;
          await ctx.damage({ from: p, to: v, amount: 1, reason: 'linjie' });
          await ctx.log(`【凛界】：${v.name} 弃置了最后一张手牌，受到 1 点伤害并移去“凛”`);
        }
      },
    },
  ],
});

defineSkill({
  id: 'duzhang', name: '独仗',
  desc: '每回合限一次，当你使用黑色牌指定唯一目标或成为黑色牌的唯一目标后，你摸一张牌并获得一个“凛”。你的手牌上限+X（X为“凛”的数量）。（本实现：手牌上限加成因引擎限制以“凛”标记记数，未接入弃牌阶段上限计算）',
  triggers: [{
    on: 'card.use.after', who: 'any', optional: false,
    filter: (d) => {
      const p = d.player;
      if (p.flags.duzhangTurn === d.game.turnCount) return false;
      if (!isBlack(d.card)) return false;
      const tg = d.targets || [];
      if (tg.length !== 1) return false;
      return d.self === p || tg.includes(p);
    },
    async effect(ctx) {
      const p = ctx.self;
      p.flags.duzhangTurn = ctx.game.turnCount;
      await ctx.draw(p, 1, { reason: 'duzhang' });
      p.flags.lin = (p.flags.lin || 0) + 1;
      await ctx.log(`【独仗】：${p.name} 摸一张牌并获得 1 个“凛”（共 ${p.flags.lin}）`);
    },
  }],
});

defineSkill({
  id: 'jianghuo', name: '降祸',
  desc: '觉醒技，回合开始时，若所有角色均受到过伤害，你将所有“凛”移动到自己的武将牌上，并摸与“凛”等量的牌，然后加1点体力上限，失去“凛界”，获得“立世”。',
  triggers: [
    { on: 'damage.after', who: 'any', optional: false, filter: () => true, async effect(ctx) { ctx.data.self.flags.hurt = true; } },
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => !d.self.flags.jianghuoDone && d.game.alive().every(x => x.flags.hurt),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.jianghuoDone = true;
        let sum = p.flags.lin || 0;
        p.flags.lin = 0;
        for (const x of g.alive()) {
          if (x !== p && x.flags.lin) { sum += x.flags.lin; x.flags.lin = 0; }
        }
        p.flags.lin = sum;
        p.maxHp += 1;
        if (sum) await ctx.draw(p, sum, { reason: 'jianghuo' });
        p.skills = p.skills.filter(s => s.id !== 'linjie');
        const ls = getSkill('lishi');
        if (ls && !effSkills(p).some(s => s.id === 'lishi')) p.skills.push(ls);
        await ctx.log(`【降祸】：觉醒！获得 ${sum} 个“凛”，体力上限 +1（${p.maxHp}/${p.maxHp}），失去【凛界】，获得【立世】`);
      },
    },
  ],
});

defineSkill({
  id: 'lishi', name: '立世',
  desc: '锁定技，结束阶段，若你没有“凛”，你受到1点雷电伤害；若你有“凛”，你失去任意个“凛”并选择等量选项令所有其他角色执行（本实现：结算为移去 1 个“凛”，令所有其他角色各弃置一张手牌）。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: false,
    filter: (d) => d.self === d.player && (d.phase === 'end' || d.phase === 'discard') && d.self.flags.lishiTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.lishiTurn = g.turnCount;
      const n = p.flags.lin || 0;
      if (!n) {
        await ctx.damage({ to: p, amount: 1, nature: 'thunder', reason: 'lishi' });
        await ctx.log('【立世】：没有“凛”，受到 1 点雷电伤害');
        return;
      }
      p.flags.lin = n - 1;
      for (const x of g.alive()) {
        if (x === p || !x.hand.length) continue;
        const c = x.hand[g.rng.int(x.hand.length)];
        await ctx.discard(x, [c], { reason: 'lishi' });
      }
      await ctx.log(`【立世】：移去 1 个“凛”，所有其他角色各弃置一张手牌`);
    },
  }],
});

// ============================================================ 神曹丕
defineSkill({
  id: 'yinzhi', name: '阴鸷',
  desc: '出牌阶段限一次，你可以选择一名其他角色并摸X张牌，该角色直至其回合开始所有非锁定技失效，且在此期间其每次使用或打出手牌后你摸X张牌。然后其回合内只能使用或打出本回合获得的牌，若其对你造成伤害，则此效果消失。（X为本局游戏你对其发动“阴鸷”的次数且至多为3；本实现：非锁定技失效与“只能用本回合获得的牌”以标记记录，其余同原文）',
  active: {
    perPhase: true,
    prompt: '选择一名其他角色：摸X张牌并令其非锁定技失效',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【阴鸷】：选择角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.yinzhiCnt = p.flags.yinzhiCnt || {};
      const x = Math.min(3, (p.flags.yinzhiCnt[t.id] || 0) + 1);
      p.flags.yinzhiCnt[t.id] = x;
      await ctx.draw(p, x, { reason: 'yinzhi' });
      t.flags.yinzhiBy = p.id;
      t.flags.yinzhiX = x;
      await ctx.log(`【阴鸷】：对 ${t.name} 第 ${x} 次发动，${p.name} 摸 ${x} 张牌，${t.name} 非锁定技失效至其回合开始`);
    },
  },
  triggers: [
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.self.flags.yinzhiBy === d.player.id,
      async effect(ctx) {
        const p = ctx.self, v = ctx.data.self;
        const x = v.flags.yinzhiX || 1;
        await ctx.draw(p, x, { reason: 'yinzhi' });
        await ctx.log(`【阴鸷】：${v.name} 使用/打出牌，${p.name} 摸 ${x} 张牌`);
      },
    },
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => !!d.self.flags.yinzhiBy && d.game.turnPlayer === d.self,
      async effect(ctx) { ctx.data.self.flags.yinzhiBy = null; await ctx.log(`【阴鸷】：${ctx.data.self.name} 的封印解除`); },
    },
  ],
});

defineSkill({
  id: 'keming', name: '刻名',
  desc: '当你受到其他角色造成的伤害后，若其武将牌上有此时机触发的技能，则你可以触发此技能，若没有，则你可从“曹”姓武将中随机触发一个此时机的技能。当你对其他角色造成伤害后，该角色下次在其准备阶段、结束阶段或出牌阶段内发动技能后，若该角色因此技能摸牌或使用了牌，你可以摸等量同名牌（至多为5）。（本实现：受到他人伤害后摸一张牌；对你造成过伤害的角色下次摸牌时你摸一张牌）',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => d.self === d.player && d.from && d.from !== d.player,
      async effect(ctx) {
        const p = ctx.self, src = ctx.data.from;
        await ctx.draw(p, 1, { reason: 'keming' });
        src.flags.kemingMark = true;
        await ctx.log(`【刻名】：${p.name} 刻下 ${src.name} 之名，摸一张牌`);
      },
    },
    {
      on: 'cards.draw.after', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.self.flags.kemingMark && (d.count || 0) > 0,
      async effect(ctx) {
        const p = ctx.self, v = ctx.data.self;
        v.flags.kemingMark = false;
        const n = Math.min(5, ctx.data.count || 1);
        await ctx.draw(p, n, { reason: 'keming' });
        await ctx.log(`【刻名】：${v.name} 摸牌，${p.name} 摸 ${n} 张同名牌`);
      },
    },
  ],
});

// ============================================================ 神庞统
defineSkill({
  id: 'luansuo', name: '鸾锁',
  desc: '锁定技，你的回合内，所有角色不能弃置手牌且当前手牌与本回合进入弃牌堆的牌花色均不同的牌视为【铁索连环】。（本实现：仅记录本回合进入弃牌堆的花色；「不能弃置手牌」需引擎在 discardCards 处拦截、「视为【铁索连环】」需引擎的转化牌规则 VIRTUAL_RULES，两项暂未实现）',
  triggers: [
    { on: 'turn.begin', who: 'self', optional: false, filter: (d) => d.self === d.player, async effect(ctx) { ctx.self.flags.luansuoSuits = []; } },
    {
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => !!d.game.turnPlayer && effSkills(d.game.turnPlayer).some(s => s.id === 'luansuo'),
      async effect(ctx) {
        const tp = ctx.game.turnPlayer;
        tp.flags.luansuoSuits = tp.flags.luansuoSuits || [];
        for (const c of ctx.data.cards || []) {
          if (c && c.suit && !tp.flags.luansuoSuits.includes(c.suit)) tp.flags.luansuoSuits.push(c.suit);
        }
      },
    },
  ],
});

defineSkill({
  id: 'fengliao', name: '凤燎',
  desc: '锁定技，转换技，当你使用牌指定唯一目标后，阳：你令其摸一张牌；阴：你对其造成一点火焰伤害。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && (d.targets || []).length === 1 && d.targets[0] !== d.player,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.targets[0];
      if (!t || !t.alive) return;
      const yang = p.flags.fengliao !== 'yin';
      p.flags.fengliao = yang ? 'yin' : 'yang';
      if (yang) {
        await ctx.draw(t, 1, { reason: 'fengliao' });
        await ctx.log(`【凤燎】（阳）：${t.name} 摸一张牌，转为阴`);
      } else {
        await ctx.damage({ from: p, to: t, amount: 1, nature: 'fire', reason: 'fengliao' });
        await ctx.log(`【凤燎】（阴）：对 ${t.name} 造成 1 点火焰伤害，转为阳`);
      }
    },
  }],
});

defineSkill({
  id: 'kunyu', name: '鹍浴',
  desc: '锁定技，你的体力上限始终为1，当你死亡时，你将牌堆中的一张火属性伤害牌移出游戏，然后复活并将体力值回复至一点。',
  triggers: [
    { on: 'game.start', who: 'self', optional: false, filter: (d) => d.self === d.player, async effect(ctx) { ctx.self.maxHp = 1; ctx.self.hp = 1; await ctx.log('【鹍浴】：体力上限始终为 1'); } },
    {
      on: 'death.before', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const i = g.deck.findIndex(c => isFireDamageCard(c));
        if (i < 0) { await ctx.log('【鹍浴】：牌堆中已无火属性伤害牌，无法复活'); return; }
        const [c] = g.deck.splice(i, 1);
        g.discardPile.push(c);
        ctx.data.canceled = true;
        p.alive = true;
        p.hp = 1;
        await ctx.log(`【鹍浴】：将 ${cardLabel(c)} 移出游戏，复活并回复至 1 点体力`);
      },
    },
  ],
});

// ============================================================ 神华佗
const WULING = ['虎灵', '鹤灵', '熊灵', '猿灵', '鹿灵'];

async function applyLing(ctx, holder, name) {
  const g = ctx.game;
  if (name === '鹤灵') { await ctx.draw(holder, 3, { reason: 'wuling' }); await ctx.log(`【五灵】：${holder.name} 获“鹤灵”，摸三张牌`); return; }
  if (name === '猿灵') {
    const cands = g.alive().filter(x => x !== holder && Object.values(x.equips).some(Boolean));
    if (!cands.length) return;
    const t = cands[g.rng.int(cands.length)];
    const slot = Object.keys(t.equips).find(k => t.equips[k]);
    if (!slot) return;
    const c = t.equips[slot];
    await g.unequipCard(t, c, { reason: 'wuling' });
    await ctx.gain(holder, [c], { reason: 'wuling' });
    await ctx.log(`【五灵】：${holder.name} 获“猿灵”，获得 ${t.name} 装备区的 ${cardLabel(c)}`);
    return;
  }
  if (name === '鹿灵') {
    await ctx.recover(holder, 1, { reason: 'wuling' });
    if (holder.judgeZone?.length) {
      const cards = holder.judgeZone.map(z => z.card);
      holder.judgeZone = [];
      g.discardPile.push(...cards);
    }
    await ctx.log(`【五灵】：${holder.name} 获“鹿灵”，回复 1 点体力并移除判定区所有牌`);
  }
}

defineSkill({
  id: 'wuling', name: '五灵',
  desc: '出牌阶段限两次，你可以选择一名未拥有“五灵”标记的角色，按照你选择的顺序向其传授“五禽戏”。拥有“五灵”标记的角色拥有你选择的效果，并在准备阶段切换为下一种。虎灵：若你使用的牌仅指定唯一目标，则此牌对目标角色造成伤害时，此伤害+1。鹤灵：你获得“鹤”标记时，摸三张牌。熊灵：每回合限一次，你受到伤害时，此伤害-1。猿灵：你获得“猿”标记时，选择一名其他角色，获得其装备区里的一张牌。鹿灵：你获得“鹿”标记时，回复1点体力，移除判定区所有牌。',
  active: {
    perTurn: false,
    prompt: '向一名没有“五灵”的角色传授“五禽戏”（每阶段限两次）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.wulingUsed = p.flags.wulingUsed || {};
      const used = p.flags.wulingUsed[g.turnCount] || 0;
      if (used >= 2) { await ctx.log('【五灵】：本阶段已发动两次'); return; }
      const cands = g.alive().filter(x => !x.flags.wuling);
      if (!cands.length) { await ctx.log('【五灵】：场上已无未拥有“五灵”的角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【五灵】：选择传授对象', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const first = await ctx.ask.choose(p, WULING, { prompt: '【五灵】：选择起始效果', reason: 'wuling' });
      const start = first < 0 ? 0 : first;
      const order = WULING.map((_, i) => WULING[(start + i) % WULING.length]);
      t.flags.wuling = { order, idx: 0 };
      p.flags.wulingUsed[g.turnCount] = used + 1;
      await ctx.log(`【五灵】：向 ${t.name} 传授“五禽戏”，起始为 ${order[0]}`);
      await applyLing(ctx, t, order[0]);
    },
  },
  triggers: [
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'prepare' && !!d.self.flags.wuling,
      async effect(ctx) {
        const h = ctx.data.self, w = h.flags.wuling;
        w.idx = (w.idx + 1) % w.order.length;
        await ctx.log(`【五灵】：${h.name} 切换为 ${w.order[w.idx]}`);
        await applyLing(ctx, h, w.order[w.idx]);
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => {
        const f = d.from;
        return !!f && !!f.flags.wuling && f.flags.wuling.order[f.flags.wuling.idx] === '虎灵' && (!d.targets || d.targets.length <= 1);
      },
      async effect(ctx) {
        ctx.data.amount = (ctx.data.amount || 0) + 1;
        await ctx.log('【五灵】（虎灵）：此伤害 +1');
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => {
        const v = d.self;
        return !!v && !!v.flags.wuling && v.flags.wuling.order[v.flags.wuling.idx] === '熊灵' && v.flags.xiongTurn !== d.game.turnCount && (d.amount || 0) > 0;
      },
      async effect(ctx) {
        const v = ctx.data.self;
        v.flags.xiongTurn = ctx.game.turnCount;
        ctx.data.amount = Math.max(0, (ctx.data.amount || 1) - 1);
        await ctx.log('【五灵】（熊灵）：此伤害 -1');
      },
    },
  ],
});

defineSkill({
  id: 'youyi', name: '游医',
  // ★容器名必须用 renCards：`flags.ren` 已被神·某人【忍】用作数字标记，两者同名会让
  //   同一角色同时拥有时「仁」区变成数字，回收时 `for…of` 直接抛错（SG029 seed34 实测 got is not iterable）
  reclaimCards(p) { const a = p.flags.renCards || []; p.flags.renCards = []; return a; },
  desc: '弃牌阶段结束时，你可以将此阶段弃置的牌置入“仁”区。出牌阶段限一次，你可以弃置所有“仁”区的牌，令所有角色回复1点体力。',
  triggers: [{
    on: 'cards.discard', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.game.phase === 'discard' && (d.cards || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.renCards = p.flags.renCards || [];
      // cards.discard 在「牌真正进入弃牌堆之前」触发，故此处用 data.taken 声明接走，
      // 引擎会在之后跳过这些牌（否则牌会同时存在于“仁”区与弃牌堆）。
      ctx.data.taken = ctx.data.taken || [];
      for (const c of ctx.data.cards) {
        const i = g.discardPile.indexOf(c);
        if (i >= 0) g.discardPile.splice(i, 1);
        if (!ctx.data.taken.includes(c)) ctx.data.taken.push(c);
        if (!p.flags.renCards.includes(c)) p.flags.renCards.push(c);
      }
      await ctx.log(`【游医】：将 ${ctx.data.cards.length} 张牌置入“仁”区（共 ${p.flags.renCards.length}）`);
    },
  }],
  active: {
    perPhase: true,
    prompt: '弃置所有“仁”牌，令所有角色回复 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ren = p.flags.renCards || [];
      if (!ren.length) { await ctx.log('【游医】：“仁”区没有牌'); return; }
      p.flags.renCards = [];
      const moved = [];
      for (const c of ren) if (!g.discardPile.includes(c)) { g.discardPile.push(c); moved.push(c); }
      if (moved.length) {
        // ★手写派发 cards.discard 必须自己结算 taken：否则【落英】【笛音】等把牌「接走」的技能
        //   会让同一张牌同时留在弃牌堆与目标区域（双存）
        const dd = { self: p, cards: moved, reason: 'youyi', taken: [] };
        await g.trigger('cards.discard', dd);
        g.settleTaken(dd);
      }
      for (const x of g.alive()) await ctx.recover(x, 1, { reason: 'youyi' });
      await ctx.log(`【游医】：弃置 ${ren.length} 张“仁”牌，所有角色回复 1 点体力`);
    },
  },
});

// ============================================================ 神姜维
defineSkill({
  id: 'tianren', name: '天任',
  desc: '锁定技，当有基本牌或普通锦囊牌不是因使用而进入弃牌堆后，你获得一个“天任”标记。当你的“天任”标记大于等于你的体力上限时，你移除等量的“天任”然后增加1点体力上限并摸两张牌。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: false,
    filter: (d) => d.reason !== 'use' && (d.cards || []).some(c => ['basic', 'trick'].includes(typeOf(c))),
    async effect(ctx) {
      const p = ctx.self;
      const n = (ctx.data.cards || []).filter(c => ['basic', 'trick'].includes(typeOf(c))).length;
      p.flags.tianren = (p.flags.tianren || 0) + n;
      while ((p.flags.tianren || 0) >= p.maxHp) {
        p.flags.tianren -= p.maxHp;
        p.maxHp += 1;
        await ctx.draw(p, 2, { reason: 'tianren' });
        await ctx.log(`【天任】：移除 ${p.maxHp - 1} 个“天任”，体力上限 +1（${p.maxHp}），摸两张牌`);
      }
    },
  }],
});

defineSkill({
  id: 'jiufa', name: '九伐',
  desc: '你每次使用或打出九张不同牌名的牌后，你可以亮出牌堆顶的九张牌，你选择并获得其中点数重复的牌各一张，其余的牌置入弃牌堆。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && !!d.card,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.jiufaNames = p.flags.jiufaNames || [];
      const nm = ctx.data.effName || ctx.data.card?.name;
      if (nm && !p.flags.jiufaNames.includes(nm)) p.flags.jiufaNames.push(nm);
      if (p.flags.jiufaNames.length < 9) return;
      p.flags.jiufaNames = [];
      const nine = takeTop(g, 9);
      if (!nine.length) return;
      await g.revealCards(nine, { to: g.alive(), reason: '九伐' });
      const cnt = {};
      for (const c of nine) cnt[c.num] = (cnt[c.num] || 0) + 1;
      const keep = nine.filter(c => cnt[c.num] > 1);
      const rest = nine.filter(c => cnt[c.num] <= 1);
      if (keep.length) await ctx.gain(p, keep, { reason: 'jiufa' });
      if (rest.length) g.discardPile.push(...rest);
      await ctx.log(`【九伐】：亮出九张，获得 ${keep.length} 张点数重复的牌，其余 ${rest.length} 张置入弃牌堆`);
    },
  }],
});

defineSkill({
  id: 'pingxiang', name: '平襄',
  desc: '限定技，出牌阶段，你可以减9点体力上限。若如此做，你视为使用至多九张火【杀】。然后你失去“九伐”且本局游戏你的手牌上限改为体力上限。（本实现：体力上限不足 10 时按“减至 1 点”结算；火【杀】优先指向攻击范围内的角色）',
  active: {
    perTurn: true,
    prompt: '减 9 点体力上限，视为使用至多九张火【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.pingxiangDone) { await ctx.log('【平襄】：本局游戏已发动过'); return; }
      if (p.maxHp <= 1) { await ctx.log('【平襄】：体力上限过低，无法发动'); return; }
      const cut = Math.min(9, p.maxHp - 1);
      p.maxHp -= cut;
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      p.flags.pingxiangDone = true;
      p.flags.handLimitAsMaxHp = true;
      p.skills = p.skills.filter(s => s.id !== 'jiufa');
      await ctx.log(`【平襄】：减 ${cut} 点体力上限（${p.hp}/${p.maxHp}），视为使用至多九张火【杀】，失去【九伐】`);
      const enemies = g.alive().filter(x => x !== p && g.inAttackRange(p, x));
      if (!enemies.length) return;
      const times = Math.min(9, Math.max(enemies.length, 1));
      for (let i = 0; i < times; i++) {
        const t = enemies[i % enemies.length];
        if (!t || !t.alive) continue;
        await g.useCard({
          from: p, asName: 'sha', targets: [t], reason: 'pingxiang', ignoreRange: true, ignoreShaLimit: true,
          card: { id: `px_${g.turnCount}_${i}`, name: 'sha', nature: 'fire', suit: 'none', num: 0, virtual: true },
        });
      }
    },
  },
});

// ============================================================ 神张角
defineSkill({
  id: 'yizhao', name: '异兆',
  desc: '锁定技，当你使用或打出牌时，你获得此牌点数的“黄”标记，若“黄”的十位数变化，你获得牌堆中一张与变化后十位数点数相同的牌。（本实现：仅统计“使用”牌，未统计“打出”）',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.card && typeof d.card.num === 'number' && d.card.num > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const before = p.flags.huang || 0;
        const after = before + (ctx.data.card.num || 0);
        p.flags.huang = after;
        const t0 = Math.floor(before / 10), t1 = Math.floor(after / 10);
        if (t1 === t0) return;
        const i = g.deck.findIndex(c => c.num === t1);
        if (i < 0) return;
        const [c] = g.deck.splice(i, 1);
        await ctx.gain(p, [c], { reason: 'yizhao' });
        await ctx.log(`【异兆】：“黄” ${before} → ${after}，十位数变化，获得 ${cardLabel(c)}`);
      },
    },
    { on: 'turn.begin', who: 'self', optional: false, filter: (d) => d.self === d.player, async effect(ctx) { ctx.self.flags.usedTypes = {}; } },
  ],
});

defineSkill({
  id: 'sanshou', name: '三首',
  desc: '当你受到伤害时，你可以亮出牌堆顶三张牌，若其中有本回合没使用过的牌的类型，则防止此伤害。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: true,
    filter: (d) => d.self === d.player && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const three = takeTop(g, 3);
      if (!three.length) return;
      await g.revealCards(three, { to: g.alive(), reason: '三首' });
      const used = p.flags.usedTypes || {};
      const hit = three.some(c => { const ty = typeOf(c); return !!ty && !used[ty]; });
      g.discardPile.push(...three);
      if (!hit) { await ctx.log('【三首】：三张牌的类型本回合均已使用过，无法防止'); return; }
      if (await ctx.ask.confirm(p, '【三首】：是否防止此伤害？')) {
        ctx.data.amount = 0;
        ctx.data.canceled = true;
        await ctx.log('【三首】：防止此伤害');
      }
    },
  }, {
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const ty = typeOf(ctx.data.card) || (ctx.data.effName ? CARD_META[ctx.data.effName]?.type : null);
      if (!ty) return;
      ctx.self.flags.usedTypes = ctx.self.flags.usedTypes || {};
      ctx.self.flags.usedTypes[ty] = true;
    },
  }],
});

defineSkill({
  id: 'sijun', name: '肆军',
  desc: '准备阶段，若“黄”标记数量大于牌堆的牌数，你可以移去所有“黄”并洗牌，然后随机获得点数之和为36的牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.self === d.player && (d.self.flags.huang || 0) > d.game.deck.length,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【肆军】：是否移去所有“黄”并洗牌，获得点数和为 36 的牌？'))) return;
      p.flags.huang = 0;
      g.deck = g.rng.shuffle([...g.deck, ...g.discardPile]);
      g.discardPile = [];
      const got = [];
      let sum = 0;
      while (g.deck.length) {
        const c = g.deck[g.deck.length - 1];
        if (sum + (c.num || 0) > 36) break;
        g.deck.pop();
        got.push(c);
        sum += c.num || 0;
      }
      if (got.length) await ctx.gain(p, got, { reason: 'sijun' });
      await ctx.log(`【肆军】：移去所有“黄”，洗牌后获得 ${got.length} 张牌（点数和 ${sum}）`);
    },
  }],
});

defineSkill({
  id: 'tianjie', name: '天劫',
  desc: '牌堆洗过牌的回合结束时，你可以对至多三名其他角色各造成X点雷电伤害（X为其手牌中【闪】的数量且至少为1）。（本实现：以“回合内牌堆张数变多”判定本回合洗过牌）',
  triggers: [
    { on: 'turn.begin', who: 'any', optional: false, filter: () => true, async effect(ctx) { ctx.game._tianjieDeckLen = ctx.game.deck.length; } },
    {
      on: 'turn.end', who: 'self', optional: true,
      filter: (d) => d.game.deck.length > (d.game._tianjieDeckLen || 0) && d.game.alive().some(x => x !== d.self),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (!(await ctx.ask.confirm(p, '【天劫】：牌堆已洗牌，是否发动？'))) return;
        const cands = g.alive().filter(x => x !== p);
        const ts = await ctx.ask.targets(p, { prompt: '【天劫】：选择至多三名角色', candidates: cands, min: 1, max: Math.min(3, cands.length) });
        for (const t of ts) {
          if (!t.alive) continue;
          const x = Math.max(1, t.hand.filter(c => c.name === 'shan').length);
          await ctx.damage({ from: p, to: t, amount: x, nature: 'thunder', reason: 'tianjie' });
        }
        await ctx.log('【天劫】：降下雷劫');
      },
    },
  ],
});

// ============================================================ 神马超
defineSkill({
  id: 'shouli', name: '狩骊',
  desc: '锁定技，游戏开始时，从下家开始所有角色随机使用牌堆中的一张坐骑。你可将场上的一张进攻马当【杀】（不计入次数）、防御马当【闪】使用或打出，以此法失去坐骑的角色本回合非锁定技失效，你与其本回合受到的伤害+1且改为雷电伤害。（本实现：实现开局发坐骑；“坐骑当杀/闪”因需读取装备区转化，暂未实现）',
  triggers: [{
    on: 'game.start', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const idx = g.players.indexOf(p);
      const order = [];
      for (let i = 1; i <= g.players.length; i++) order.push(g.players[(idx + i) % g.players.length]);
      let n = 0;
      for (const q of order) {
        if (!q || q.equips.horsePlus || q.equips.horseMinus) continue;
        const i = g.deck.findIndex(c => { const s = c && CARD_META[c.name]?.sub; return s === 'horse+' || s === 'horse-'; });
        if (i < 0) break;
        const [c] = g.deck.splice(i, 1);
        const sub = CARD_META[c.name].sub;
        if (sub === 'horse+') q.equips.horsePlus = c; else q.equips.horseMinus = c;
        n++;
        await g.trigger('equip.change', { self: q, card: c });
      }
      await ctx.log(`【狩骊】：从下家开始，${n} 名角色随机使用了坐骑`);
    },
  }],
});

defineSkill({
  id: 'hengwu', name: '横骛',
  desc: '当你使用或打出牌时，若你没有该花色的手牌，你可摸X张牌（X为场上与此牌花色相同的装备数量）。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && !!d.card && !!d.card.suit && !d.player.hand.some(c => c.suit === d.card.suit),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const suit = ctx.data.card.suit;
      const x = g.players.reduce((s, q) => s + Object.values(q.equips).filter(c => c && c.suit === suit).length, 0);
      if (x > 0) {
        await ctx.draw(p, x, { reason: 'hengwu' });
        await ctx.log(`【横骛】：场上 ${x} 件 ${suit} 花色装备，摸 ${x} 张牌`);
      }
    },
  }],
});

// ============================================================ 神典韦
const QIEXIE_POOL = [
  { name: '关羽', hp: 4 }, { name: '张飞', hp: 4 }, { name: '赵云', hp: 4 }, { name: '马超', hp: 4 },
  { name: '黄忠', hp: 4 }, { name: '许褚', hp: 4 }, { name: '张辽', hp: 4 }, { name: '甘宁', hp: 4 },
  { name: '吕布', hp: 4 }, { name: '诸葛亮', hp: 3 }, { name: '周瑜', hp: 3 }, { name: '陆逊', hp: 3 },
];

defineSkill({
  id: 'juanjia', name: '捐甲',
  desc: '锁定技，游戏开始时，废除你的防具栏，然后你获得一个额外的武器栏。',
  triggers: [{
    on: 'game.start', who: 'self', optional: false, filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.equips.armor) { const _a = p.equips.armor; await g.unequipCard(p, _a, { reason: 'abolishArmor' }); if (!g.discardPile.includes(_a)) g.discardPile.push(_a); }
      p.flags.abolishArmor = true;
      p.flags.extraWeapon = true;
      await ctx.log('【捐甲】：废除防具栏，获得一个额外的武器栏');
    },
  }],
});

defineSkill({
  id: 'qiexie', name: '挹挟',
  desc: '锁定技，准备阶段，你在剩余武将牌堆中随机观看五张武将牌，然后选择其中任意张当武器牌置于你的装备区中，此类武器牌拥有如下规则：1.无花色点数且攻击范围为牌上的体力上限；2.武器效果为牌上描述中含有“【杀】”的无类型标签或仅有锁定技标签的技能；3.此牌离开你的装备区时你令其销毁。（本实现：仅生成攻击范围等于体力上限的武器牌，未接入“武将技能”效果）',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && d.self === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const picks = g.rng.shuffle(QIEXIE_POOL.slice()).slice(0, 5);
      const idx = await ctx.ask.choose(p, picks.map(x => `${x.name}（攻击范围 ${x.hp}）`), { prompt: '【挹挟】：选择武将牌当武器', reason: 'qiexie' });
      const hit = picks[idx < 0 ? 0 : idx];
      if (!hit) return;
      const card = {
        id: `qx_${g.turnCount}_${hit.name}`, name: 'qinglong', cn: hit.name,
        suit: 'none', num: 0, range: hit.hp, virtual: true, skillWeapon: true,
      };
      if (!p.equips.weapon) p.equips.weapon = card;
      else p.flags.extraWeaponCard = card;
      await ctx.log(`【挹挟】：将 ${hit.name} 当武器置于装备区（攻击范围 ${hit.hp}）`);
    },
  }],
});

defineSkill({
  id: 'cuijue', name: '摧决',
  desc: '每回合对每名角色限一次，出牌阶段，你可以弃置一张牌，然后对一名攻击范围内距离最远的其他角色造成1点伤害。',
  active: {
    perTurn: false,
    prompt: '弃一张牌，对攻击范围内距离最远的角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) { await ctx.log('【摧决】：没有可弃置的牌'); return; }
      const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【摧决】：弃置一张牌' }))[0];
      if (!c) return;
      const slot = Object.keys(p.equips).find(k => p.equips[k] === c);
      if (slot) {
        p.equips[slot] = null;
        g.discardPile.push(c);
        await g.trigger('equip.lose', { self: p, card: c, slot });
      } else {
        await ctx.discard(p, [c], { reason: 'cuijue' });
      }
      const cands = g.alive().filter(x => x !== p && g.inAttackRange(p, x) && p.flags[`cuijue_${x.id}`] !== g.turnCount);
      if (!cands.length) { await ctx.log('【摧决】：攻击范围内没有可指定的其他角色'); return; }
      const maxd = Math.max(...cands.map(x => g.distance(p, x)));
      const far = cands.filter(x => g.distance(p, x) === maxd);
      const t = (await ctx.ask.targets(p, { prompt: '【摧决】：选择距离最远的角色', candidates: far, min: 1, max: 1 }))[0] || far[0];
      if (!t) return;
      p.flags[`cuijue_${t.id}`] = g.turnCount;
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'cuijue' });
      await ctx.log(`【摧决】：对距离最远的 ${t.name} 造成 1 点伤害`);
    },
  },
});
