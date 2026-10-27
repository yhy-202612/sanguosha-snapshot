// 星火燎原·补全（pack = 'xinghuo'）技能实现
// 数据见 src/data/xinghuo2.js；技能 id 前缀 `xh_`
// 口径：官方《星火燎原》原版技能文本；引擎不支持的机制在 desc 内以「实现：」注明降级方式
import { defineSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, isRed } from '../engine/cards.js';

let vseq = 0;
const vcard = (name, suit = 'none', num = 0, extra = {}) => ({
  id: `vxh${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const others = (g, p) => g.alive().filter((x) => x !== p);
const equipOf = (p) => Object.values(p.equips || {}).filter(Boolean);
const zoneOf = (p) => [...p.hand, ...equipOf(p), ...(p.judgeZone || []).map((z) => z.card)];
const fieldOf = (g) => g.alive().flatMap((q) => [...equipOf(q), ...(q.judgeZone || []).map((z) => z.card)]);
const black = (c) => !!c && !isRed(c);
// 「使用 / 打出」类进弃牌堆的原因（用于区分「弃置」）
const USE_REASONS = new Set(['use', 'play', 'respond', 'sha', 'juedou', 'wuxie']);
// 从任意区域把牌摘下（手牌 / 装备 / 判定 / 处理区 / 牌堆 / 弃牌堆），用于「置于武将牌上」「置于牌堆顶」等。
// 硬约束：取牌必须 splice 摘除，避免同一张牌同时存在于两个区域。
// ★async：装备区摘牌走 g.unequipCard 派发 equip.lose（SG033 P0-2），否则监听者不刷新
async function pullFrom(g, p, card) {
  if (!card) return false;
  let moved = false;
  if (p) {
    const hi = (p.hand || []).indexOf(card);
    if (hi >= 0) { p.hand.splice(hi, 1); moved = true; }
    if ((p.equips && Object.values(p.equips).includes(card)) && g && typeof g.unequipCard === 'function') {
      await g.unequipCard(p, card, { reason: 'pull' });
      moved = true;
    }
    const ji = (p.judgeZone || []).findIndex((z) => z.card === card);
    if (ji >= 0) { p.judgeZone.splice(ji, 1); moved = true; }
  }
  const ti = (g.table || []).indexOf(card);
  if (ti >= 0) { g.table.splice(ti, 1); moved = true; }
  const di = g.discardPile.indexOf(card);
  if (di >= 0) { g.discardPile.splice(di, 1); moved = true; }
  const ki = g.deck.indexOf(card);
  if (ki >= 0) { g.deck.splice(ki, 1); moved = true; }
  return moved;
}
// 从牌堆底摸牌（引擎已有 popDeckBottom，通过 player.flags.drawFromBottom 走 drawCards 正常出口）
async function drawFromBottom(ctx, p, n = 1, reason = 'draw') {
  const old = p.flags.drawFromBottom;
  p.flags.drawFromBottom = true;
  try { return await ctx.draw(p, n, { reason }); } finally { p.flags.drawFromBottom = old; }
}
// 拼点（本包内自用版本：支持秦宓【天辩】以牌堆顶一张牌拼点，红桃视为 K）
// 未走引擎 pindian.js，因为那里没有「改用牌堆顶牌」的插入点。
const hasTianbian = (p) => (effSkills(p) || []).some((s) => s.id === 'xh_tianbian');
async function pindianX(g, from, to, { reason = '拼点' } = {}) {
  const pick = async (p) => {
    if (hasTianbian(p) && g.deck.length) {
      const yes = await g.confirm(p, '【天辩】：是否改用牌堆顶一张牌拼点？');
      if (yes) {
        const c = g.deck.pop();   // 牌堆顶 = 数组末尾
        const num = c.suit === 'heart' ? 13 : (c.num || 0);
        await g.log(`【天辩】：${p.name} 改为用牌堆顶 ${cardLabel(c)} 拼点${c.suit === 'heart' ? '（红桃视为 K）' : ''}`);
        g.pushDiscard([c]);
        return { card: c, num };
      }
    }
    if (!p.hand.length) return null;
    const idx = await g.chooseOne(p, p.hand.map((c) => cardLabel(c)), { prompt: `【${reason}】：选择一张手牌拼点` });
    const c = p.hand[idx] || p.hand[0];
    if (!c) return null;
    await g.discardCards(p, [c], { reason });
    return { card: c, num: c.num || 0 };
  };
  const cb = await pick(to);
  const ca = await pick(from);
  if (!ca || !cb) { await g.log(`【${reason}】拼点无法进行（有一方无法出牌）`); return { win: false, skip: true }; }
  const win = ca.num > cb.num;
  await g.log(`【${reason}】拼点：${from.name} ${ca.num} 点 vs ${to.name} ${cb.num} 点 → ${win ? from.name + ' 赢' : from.name + ' 没赢'}`);
  return { win, a: ca, b: cb };
}

// ============================================================
// 星火·孙登（吴 4）【匡弼】
// ============================================================
// 匡弼：出牌阶段限一次，你可以令一名有牌的其他角色将至多三张牌置于你的武将牌上；
//       你的下回合开始时，你获得这些牌，然后其摸等量张牌。
// 实现：「武将牌上」没有独立区域，用 player.flags.xhKuangbi = [{seat, cards}] 存牌（牌已从原区域 splice 摘除）。
defineSkill({
  id: 'xh_kuangbi', name: '匡弼',
  desc: '出牌阶段限一次，你可以令一名有牌的其他角色将至多三张牌置于你的武将牌上；你的下回合开始时，你获得这些牌，然后其摸等量张牌。',
  active: {
    perPhase: true,
    prompt: '匡弼：令一名有牌的其他角色将至多 3 张牌置于你的武将牌上',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((q) => zoneOf(q).length > 0);
      if (!cands.length) { await ctx.log('【匡弼】：没有有牌的其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【匡弼】：选择一名有牌的其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const pool = zoneOf(t);
      const picks = await g.chooseSomeCards(t, pool, Math.min(3, pool.length), { prompt: `【匡弼】：将至多 3 张牌置于 ${p.name} 的武将牌上` });
      if (!picks.length) return;
      for (const c of picks) await pullFrom(g, t, c);
      p.flags.xhKuangbi = [...(p.flags.xhKuangbi || []), { seat: t.seat, cards: picks }];
      await ctx.log(`【匡弼】：${t.name} 将 ${picks.map(cardLabel).join('、')} 置于 ${p.name} 的武将牌上`);
    },
  },
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && d.self === d.player && (d.player.flags.xhKuangbi || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const entries = p.flags.xhKuangbi || [];
      p.flags.xhKuangbi = [];
      for (const e of entries) {
        const q = g.players[e.seat];
        const list = (e.cards || []).filter(Boolean);
        if (!list.length) continue;
        await ctx.gain(p, list, { from: q || null, reason: 'kuangbi' });
        if (q && q.alive) await ctx.draw(q, list.length, { reason: 'kuangbi' });
        await ctx.log(`【匡弼】：${p.name} 获得武将牌上的 ${list.length} 张牌，${q ? q.name : '原主'} 摸 ${list.length} 张牌`);
      }
    },
  }],
});

// ============================================================
// 星火·步骘（吴 3）【弘德】【定叛】
// ============================================================
async function hongdeGive(ctx) {
  const p = ctx.self, g = ctx.game;
  const cands = others(g, p);
  if (!cands.length) return;
  const t = (await ctx.ask.targets(p, { prompt: '【弘德】：令一名其他角色摸 1 张牌', candidates: cands, min: 1, max: 1 }))[0];
  if (!t) return;
  await ctx.draw(t, 1, { reason: 'hongde' });
  await ctx.log(`【弘德】：${t.name} 摸 1 张牌`);
}

// 弘德：当你一次性获得或失去至少两张牌后，你可以令一名其他角色摸一张牌。
// 实现：获得看 cards.gain（自己获得 / 自己失去交给别人），失去看 cards.discard（引擎不触发 cards.lose）。
defineSkill({
  id: 'xh_hongde', name: '弘德',
  desc: '当你一次性获得或失去至少两张牌后，你可以令一名其他角色摸一张牌。',
  triggers: [
    {
      on: 'cards.gain', who: 'self', optional: true,
      filter: (d) => d.self === d.player && (d.cards || []).length >= 2,
      async effect(ctx) { await hongdeGive(ctx); },
    },
    {
      on: 'cards.gain', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && d.from === d.player && (d.cards || []).length >= 2,
      async effect(ctx) { await hongdeGive(ctx); },
    },
    {
      on: 'cards.discard', who: 'self', optional: true,
      filter: (d) => d.self === d.player && (d.cards || []).length >= 2,
      async effect(ctx) { await hongdeGive(ctx); },
    },
  ],
});

// 定叛：出牌阶段限 X 次（X 为场上存活反贼数，非身份场按 1 处理），你可以令一名装备区有牌的角色摸一张牌，
//       然后其选择：1. 令你弃置其装备区一张牌；2. 获得其装备区所有牌，然后你对其造成 1 点伤害。
// 实现：引擎 active 只有 perTurn 布尔，次数限制用 flags 按回合号自行计数（等价）。
defineSkill({
  id: 'xh_dingpan', name: '定叛',
  desc: '出牌阶段限 X 次（X 为场上存活的反贼数，非身份场按 1 处理），你可以令一名装备区有牌的角色摸一张牌，然后其选择：1. 令你弃置其装备区一张牌；2. 获得其装备区所有牌，然后你对其造成 1 点伤害。',
  active: {
    prompt: '定叛：令一名装备区有牌的角色摸 1 张牌，然后其选择一项',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.max(1, g.alive().filter((q) => q.role === 'rebel').length);
      // 「本阶段」= 本出牌阶段：用 playPhaseSeq 而非 turnCount，额外出牌阶段（当先/整兵等）才会刷新（SG025 #11）
      if (p.flags.xhDingpanPhase !== g.playPhaseSeq) { p.flags.xhDingpanPhase = g.playPhaseSeq; p.flags.xhDingpanCount = 0; }
      if ((p.flags.xhDingpanCount || 0) >= x) { await ctx.log(`【定叛】：本阶段已发动 ${x} 次，不能再发动`); return; }
      const cands = others(g, p).filter((q) => equipOf(q).length > 0);
      if (!cands.length) { await ctx.log('【定叛】：没有装备区有牌的其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【定叛】：选择一名装备区有牌的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.xhDingpanCount = (p.flags.xhDingpanCount || 0) + 1;
      await ctx.log(`【定叛】：${t.name} 摸 1 张牌（本阶段第 ${p.flags.xhDingpanCount}/${x} 次）`);
      await ctx.draw(t, 1, { reason: 'dingpan' });
      const idx = await ctx.ask.choose(t, [`令 ${p.name} 弃置你装备区一张牌`, `获得你装备区所有牌，然后 ${p.name} 对你造成 1 点伤害`],
        { prompt: '【定叛】：请选择一项', reason: 'dingpan' });
      if (idx === 1) {
        const eq = equipOf(t);
        if (eq.length) await ctx.gain(t, eq, { from: t, reason: 'dingpan' });
        await ctx.log(`【定叛】：${t.name} 获得装备区的 ${eq.length} 张牌`);
        await ctx.damage({ from: p, to: t, amount: 1, card: null, reason: 'dingpan' });
      } else {
        const eq = equipOf(t);
        if (!eq.length) return;
        const pick = (await g.chooseSomeCards(p, eq, 1, { prompt: `【定叛】：弃置 ${t.name} 装备区一张牌` }))[0];
        if (pick) await ctx.discard(t, [pick], { reason: 'dingpan' });
      }
    },
  },
});

// ============================================================
// 星火·司马朗（魏 3）【郡兵】【去疾】
// ============================================================
// 郡兵：一名角色的结束阶段，若其手牌数小于 2，其可摸一张牌，然后将所有手牌交给你，你再交给其等量张牌。
defineSkill({
  id: 'xh_junbing', name: '郡兵',
  desc: '一名角色的结束阶段，若其手牌数小于 2，其可摸一张牌，然后将所有手牌交给你，你再交给其等量张牌。',
  triggers: [{
    on: 'phase.end', who: 'any', optional: false,
    filter: (d) => d.phase === 'end' && !!d.self && d.self.alive && d.self.hand.length < 2 && d.player.alive,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, q = ctx.data.self;
      if (!q || !q.alive) return;
      const yes = await ctx.ask.confirm(q, `【郡兵】：是否摸 1 张牌并将所有手牌交给 ${p.name}？`);
      if (!yes) return;
      await ctx.draw(q, 1, { reason: 'junbing' });
      const all = q.hand.slice();
      if (!all.length) return;
      await ctx.gain(p, all, { from: q, reason: 'junbing' });
      const n = Math.min(all.length, p.hand.length);
      if (n <= 0) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), n, { prompt: `【郡兵】：交给 ${q.name} ${n} 张牌` });
      if (picks.length) await ctx.gain(q, picks, { from: p, reason: 'junbing' });
      await ctx.log(`【郡兵】：${q.name} 摸 1 张后与 ${p.name} 交换了 ${picks.length} 张手牌`);
    },
  }],
});

// 去疾：出牌阶段限一次，若你已受伤，你可以弃置 X 张牌并令至多 X 名已受伤角色各回复 1 点体力
//       （X 为你已损失的体力值）；若你以此法弃置的牌含黑色牌，你失去 1 点体力。
defineSkill({
  id: 'xh_quji', name: '去疾',
  desc: '出牌阶段限一次，若你已受伤，你可以弃置 X 张牌并令至多 X 名已受伤角色各回复 1 点体力（X 为你已损失的体力值）；若你以此法弃置的牌含黑色牌，你失去 1 点体力。',
  active: {
    perPhase: true,
    prompt: '去疾：弃 X 张牌，令至多 X 名已受伤角色各回复 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.max(0, p.maxHp - p.hp);
      if (x <= 0) { await ctx.log('【去疾】：你未受伤，无法发动'); return; }
      const pool = p.hand.slice();
      if (!pool.length) { await ctx.log('【去疾】：没有手牌可弃置'); return; }
      const picks = await g.chooseSomeCards(p, pool, Math.min(x, pool.length), { prompt: `【去疾】：弃置最多 ${x} 张牌` });
      if (!picks.length) return;
      await ctx.discard(p, picks, { reason: 'quji' });
      const hurt = g.alive().filter((q) => q.hp < q.maxHp);
      const cands = hurt.length ? hurt : [];
      if (cands.length) {
        const ts = await ctx.ask.targets(p, {
          prompt: `【去疾】：选择至多 ${picks.length} 名已受伤角色各回复 1 点体力`,
          candidates: cands, min: 0, max: Math.min(picks.length, cands.length),
        });
        for (const t of ts) { await ctx.recover(t, 1, { reason: 'quji' }); await ctx.log(`【去疾】：${t.name} 回复 1 点体力`); }
      }
      if (picks.some((c) => black(c))) {
        await ctx.log('【去疾】：弃置的牌中含黑色牌，你失去 1 点体力');
        await ctx.loseHp(p, 1, { reason: 'quji' });
      }
    },
  },
});

// ============================================================
// 星火·杜畿（魏 3）【安东】【应势】
// ============================================================
// 安东：当你受到其他角色造成的伤害时，你可以令来源选择：
//       1. 防止此伤害，其红桃牌本回合不计入手牌上限；2. 令你观看其手牌并获得其中所有红桃牌。
// 实现①：手牌上限提升在弃牌阶段以 flags.handLimit 临时加上「红桃手牌数」，阶段结束时还原。
defineSkill({
  id: 'xh_andong', name: '安东',
  desc: '当你受到其他角色造成的伤害时，你可以令来源选择：1. 防止此伤害，其红桃牌本回合不计入手牌上限；2. 令你观看其手牌并获得其中所有红桃牌。',
  triggers: [
    {
      on: 'damage.before', who: 'self', optional: true,
      filter: (d) => d.to === d.player && !!d.from && d.from !== d.player && !d.canceled && (d.amount || 0) > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, src = ctx.data.from;
        const idx = await ctx.ask.choose(src, [
          `防止此伤害，你的红桃牌本回合不计入手牌上限`,
          `令 ${p.name} 观看你的手牌并获得其中所有红桃牌`,
        ], { prompt: `【安东】：${p.name} 发动【安东】，请选择一项`, reason: 'andong' });
        if (idx === 1) {
          await ctx.log(`【安东】：${p.name} 观看 ${src.name} 的手牌（${src.hand.map(cardLabel).join('、') || '无'}）`);
          const hearts = src.hand.filter((c) => c.suit === 'heart');
          if (hearts.length) await ctx.gain(p, hearts, { from: src, reason: 'andong' });
          await ctx.log(`【安东】：${p.name} 获得其中 ${hearts.length} 张红桃牌`);
        } else {
          ctx.data.canceled = true;
          src.flags.xhAndongTurn = g.turnCount;
          await ctx.log(`【安东】：防止此伤害，${src.name} 的红桃牌本回合不计入手牌上限`);
        }
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'discard' && !!d.self && d.self.flags.xhAndongTurn === d.game.turnCount,
      async effect(ctx) {
        const q = ctx.data.self;
        const n = q.hand.filter((c) => c.suit === 'heart').length;
        q.flags.xhAndongBonus = n;
        q.flags.handLimit = (q.flags.handLimit || 0) + n;
        await ctx.log(`【安东】：${q.name} 的 ${n} 张红桃牌本回合不计入手牌上限`);
      },
    },
    {
      on: 'phase.end', who: 'any', optional: false,
      filter: (d) => d.phase === 'discard' && !!d.self && d.self.flags.xhAndongTurn === d.game.turnCount,
      async effect(ctx) {
        const q = ctx.data.self;
        const n = q.flags.xhAndongBonus || 0;
        q.flags.handLimit = (q.flags.handLimit || 0) - n;
        q.flags.xhAndongBonus = 0;
      },
    },
  ],
});

// 应势：出牌阶段开始时，若场上无「酬」，你可以将你所有红桃牌置于一名其他角色武将牌上，称为「酬」；
//       一名角色用【杀】对有「酬」角色造成伤害后，可获得一张「酬」，该角色死亡时你获得全部「酬」。
// 实现：「酬」没有独立区域，用 target.flags.xhChou = { seat, cards } 存（牌已从原区域 splice 摘除）。
defineSkill({
  id: 'xh_yingshi', name: '应势',
  desc: '出牌阶段开始时，若场上没有「酬」，你可以将你所有红桃牌置于一名其他角色的武将牌上，称为「酬」；一名角色用【杀】对有「酬」角色造成伤害后，其可获得一张「酬」，该角色死亡时你获得其所有「酬」。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.self === d.player
        && d.player.hand.some((c) => c.suit === 'heart')
        && !d.game.alive().some((q) => (q.flags.xhChou?.cards || []).length),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = others(g, p);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【应势】：将你所有红桃牌置于一名其他角色武将牌上（「酬」）', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const hearts = p.hand.filter((c) => c.suit === 'heart');
        if (!hearts.length) return;
        for (const c of hearts) await pullFrom(g, p, c);
        t.flags.xhChou = { seat: p.seat, cards: [...(t.flags.xhChou?.cards || []), ...hearts] };
        await ctx.log(`【应势】：${p.name} 将 ${hearts.map(cardLabel).join('、')} 置于 ${t.name} 的武将牌上，称为「酬」`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: true,
      filter: (d) => !!d.from && d.card && d.card.name === 'sha' && (d.to?.flags?.xhChou?.cards || []).length > 0,
      async effect(ctx) {
        const g = ctx.game, q = ctx.data.from, holder = ctx.data.to;
        const card = holder.flags.xhChou.cards[holder.flags.xhChou.cards.length - 1];
        holder.flags.xhChou.cards.pop();
        if (!card) return;
        await ctx.gain(q, [card], { from: null, reason: 'yingshi' });
        await ctx.log(`【应势】：${q.name} 获得 ${holder.name} 的一张「酬」${cardLabel(card)}`);
      },
    },
    {
      on: 'death.after', who: 'any', optional: false,
      filter: (d) => !!d.self && (d.self.flags.xhChou?.cards || []).length > 0 && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, dead = ctx.data.self;
        const cards = (dead.flags.xhChou?.cards || []).filter(Boolean);
        dead.flags.xhChou = null;
        if (!cards.length) return;
        await ctx.gain(p, cards, { from: null, reason: 'yingshi' });
        await ctx.log(`【应势】：${dead.name} 死亡，${p.name} 获得其所有「酬」（${cards.length} 张）`);
      },
    },
  ],
});

// ============================================================
// 星火·董允（蜀 3）【秉正】【舍宴】
// ============================================================
// 秉正：出牌阶段结束时，你可以令一名手牌数不等于体力值的角色弃置一张手牌或摸一张牌；
//       若其手牌数因此等于体力值，你摸一张牌，并可交给其一张牌。
defineSkill({
  id: 'xh_bingzheng', name: '秉正',
  desc: '出牌阶段结束时，你可以令一名手牌数不等于体力值的角色弃置一张手牌或摸一张牌；若其手牌数因此等于体力值，你摸一张牌，并可交给其一张牌。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.self === d.player && d.game.alive().some((q) => q.hand.length !== q.hp),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((q) => q.hand.length !== q.hp);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【秉正】：选择一名手牌数不等于体力值的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      if (t.hand.length === 0) {
        await ctx.draw(t, 1, { reason: 'bingzheng' });
        await ctx.log(`【秉正】：${t.name} 没有手牌，改为摸 1 张牌`);
      } else {
        const idx = await ctx.ask.choose(t, ['弃置一张手牌', '摸一张牌'], { prompt: '【秉正】：请选择一项', reason: 'bingzheng' });
        if (idx === 1) await ctx.draw(t, 1, { reason: 'bingzheng' });
        else {
          const pick = (await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【秉正】：弃置一张手牌' }))[0];
          if (pick) await ctx.discard(t, [pick], { reason: 'bingzheng' });
        }
      }
      if (t.hand.length !== t.hp) return;
      await ctx.log(`【秉正】：${t.name} 手牌数等于体力值，${p.name} 摸 1 张牌`);
      await ctx.draw(p, 1, { reason: 'bingzheng' });
      const give = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: `【秉正】：可交给 ${t.name} 一张牌（取消则不交）` }))[0];
      if (give) await ctx.gain(t, [give], { from: p, reason: 'bingzheng' });
    },
  }],
});

// 舍宴：当你成为普通锦囊牌的目标时，你可以为此牌增加或减少一个目标（目标数至少为 1）。
// 实现：在 card.use.before 里直接改 useData.targets（与引擎内部 targets 同一数组引用），
//       「增加」受该牌自身目标上限（CARD_META.target.max）限制，避免越界结算。
defineSkill({
  id: 'xh_sheyan', name: '舍宴',
  desc: '当你成为普通锦囊牌的目标时，你可以为此牌增加或减少一个目标（目标数至少为 1）。',
  triggers: [{
    on: 'card.use.before', who: 'any', optional: true,
    filter: (d) => {
      const c = d.card;
      if (!c || c.name === 'wuxie') return false;
      const meta = CARD_META[c.name];
      if (!meta || meta.type !== 'trick' || meta.delayed) return false;
      if (d.self === d.player || !d.player.alive) return false;
      return Array.isArray(d.targets) && d.targets.includes(d.player);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const targets = d.targets;
      const meta = CARD_META[d.card.name];
      const canAdd = targets.length < (meta.target?.max ?? 99) && g.alive().some((q) => !targets.includes(q));
      const canCut = targets.length > 1;
      if (!canAdd && !canCut) return;
      const opts = [];
      if (canAdd) opts.push('增加一个目标');
      if (canCut) opts.push('减少一个目标');
      const idx = await ctx.ask.choose(p, opts, { prompt: '【舍宴】：请选择一项', reason: 'sheyan' });
      const what = opts[idx] || opts[0];
      if (what === '增加一个目标') {
        const cands = g.alive().filter((q) => !targets.includes(q));
        const t = (await ctx.ask.targets(p, { prompt: '【舍宴】：选择增加的目标', candidates: cands, min: 1, max: 1 }))[0];
        if (!t || targets.length >= (meta.target?.max ?? 99)) return;
        targets.push(t);
        await ctx.log(`【舍宴】：为 ${cardLabel(d.card)} 增加一个目标：${t.name}`);
      } else {
        if (targets.length <= 1) return;
        const t = (await ctx.ask.targets(p, { prompt: '【舍宴】：选择减少的目标', candidates: targets.slice(), min: 1, max: 1 }))[0];
        if (!t || targets.length <= 1) return;
        const i = targets.indexOf(t);
        if (i >= 0) targets.splice(i, 1);
        await ctx.log(`【舍宴】：为 ${cardLabel(d.card)} 减少一个目标：${t.name}`);
      }
    },
  }],
});

// ============================================================
// 星火·严畯（吴 3）【观潮】【逊贤】
// ============================================================
// 观潮：出牌阶段开始时，选择「严格递增」或「严格递减」；本回合你使用牌时，
//       若本阶段你使用过的所有牌点数满足该顺序，你摸一张牌。
defineSkill({
  id: 'xh_guanchao', name: '观潮',
  desc: '出牌阶段开始时，你选择「严格递增」或「严格递减」；本回合你使用牌时，若本阶段你使用过的所有牌点数满足该顺序，你摸一张牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const idx = await ctx.ask.choose(p, ['严格递增', '严格递减'], { prompt: '【观潮】：请选择牌点数的顺序', reason: 'guanchao' });
        const mode = idx === 1 ? 'desc' : 'asc';
        p.flags.xhGuanchao = { mode, nums: [], turn: g.turnCount };
        await ctx.log(`【观潮】：本阶段你使用牌的点数需${mode === 'asc' ? '严格递增' : '严格递减'}`);
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.card && (d.card.num || 0) > 0
        && d.game.phase === 'play'
        && d.self.flags.xhGuanchao?.turn === d.game.turnCount && d.player.flags.xhGuanchao?.mode,
      async effect(ctx) {
        const p = ctx.self, info = p.flags.xhGuanchao;
        info.nums.push(ctx.data.card.num);
        let ok = true;
        for (let i = 1; i < info.nums.length; i++) {
          const a = info.nums[i - 1], b = info.nums[i];
          if (info.mode === 'asc' ? !(b > a) : !(b < a)) { ok = false; break; }
        }
        if (!ok) return;
        await ctx.draw(p, 1, { reason: 'guanchao' });
        await ctx.log(`【观潮】：本阶段使用的牌点数仍${info.mode === 'asc' ? '严格递增' : '严格递减'}，摸 1 张牌`);
      },
    },
    { on: 'turn.end', who: 'self', optional: false, async effect(ctx) { ctx.self.flags.xhGuanchao = null; } },
  ],
});

// 逊贤：每回合限一次，当你于回合外使用或打出的牌置入弃牌堆时，你可以将之交给一名手牌数多于你的角色。
defineSkill({
  id: 'xh_xunxian', name: '逊贤',
  desc: '每回合限一次，当你于回合外使用或打出的牌置入弃牌堆时，你可以将之交给一名手牌数多于你的角色。',
  triggers: [{
    on: 'cards.discard', who: 'self', optional: true,
    filter: (d) => {
      const p = d.player, g = d.game;
      if (d.self !== p || (d.cards || []).length !== 1) return false;
      if (g.turnPlayer === p) return false;                       // 必须是回合外
      if (!USE_REASONS.has(d.reason)) return false;                // 必须是使用 / 打出，不是弃置
      if (p.flags.xhXunxianTurn === g.turnCount) return false;     // 每回合限一次
      return true;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, c = ctx.data.cards[0];
      const cands = g.alive().filter((q) => q !== p && q.hand.length > p.hand.length);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: `【逊贤】：可将 ${cardLabel(c)} 交给一名手牌数多于你的角色`, candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.xhXunxianTurn = g.turnCount;
      await pullFrom(g, p, c);
      await ctx.gain(t, [c], { from: p, reason: 'xunxian' });
      await ctx.log(`【逊贤】：${p.name} 将 ${cardLabel(c)} 交给 ${t.name}`);
    },
  }],
});

// ============================================================
// 星火·戏志才（魏 3）【天妒】【先辅】【筹策】
// ============================================================
// 天妒：当你的判定牌生效后，你可以获得此牌。（直接复用标准包 `tiandu`，已在 src/skills/standard.js 实现）

// 先辅：锁定技，游戏开始时，你选择一名其他角色，当其受到伤害后，你受到等量伤害；当其回复体力后，你回复等量体力。
defineSkill({
  id: 'xh_xianfu', name: '先辅',
  desc: '锁定技，游戏开始时，你选择一名其他角色，当其受到伤害后，你受到等量伤害；当其回复体力后，你回复等量体力。',
  triggers: [
    {
      on: 'game.start', who: 'any', optional: false,
      filter: (d) => d.player.flags.xhXianfuSeat == null,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = others(g, p);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【先辅】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        p.flags.xhXianfuSeat = t.seat;
        await ctx.log(`【先辅】：${p.name} 选择 ${t.name} 为辅佐对象`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.to && d.to !== d.player && d.player.flags.xhXianfuSeat === d.to.seat
        && (d.amount || 0) > 0 && d.player.alive && !d.__xhXianfuDmg,
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        d.__xhXianfuDmg = true;    // 防自触发递归
        await ctx.log(`【先辅】：${d.to.name} 受到 ${d.amount} 点伤害，${p.name} 受到等量伤害`);
        await ctx.damage({ from: d.from || null, to: p, amount: d.amount, nature: d.nature || 'normal', reason: 'xianfu' });
      },
    },
    {
      on: 'hp.recover', who: 'any', optional: false,
      filter: (d) => !!d.self && d.self !== d.player && d.player.flags.xhXianfuSeat === d.self.seat
        && (d.count || 0) > 0 && d.player.alive && !d.__xhXianfuRec,
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        d.__xhXianfuRec = true;
        await ctx.recover(p, d.count, { reason: 'xianfu' });
        await ctx.log(`【先辅】：${d.self.name} 回复 ${d.count} 点体力，${p.name} 回复等量体力`);
      },
    },
  ],
});

// 筹策：当你受到 1 点伤害后，你可以进行判定：若结果为黑色，你弃置一名角色区域内的一张牌；
//       若结果为红色，你令一名角色摸一张牌，若其为【先辅】对象则改为摸两张牌。
defineSkill({
  id: 'xh_chouce', name: '筹策',
  desc: '当你受到 1 点伤害后，你可以进行判定：若结果为黑色，你弃置一名角色区域内的一张牌；若结果为红色，你令一名角色摸一张牌，若其为【先辅】对象则改为摸两张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.to === d.player && (d.amount || 0) >= 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const j = await ctx.judge(p, { reason: '筹策' });
      if (j.suit === 'spade' || j.suit === 'club') {
        const cands = g.alive().filter((q) => zoneOf(q).length > 0);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【筹策】：弃置一名角色区域内的一张牌', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const c = await g.chooseCardFrom(p, t, { reason: 'chouce' });
        if (c) { await ctx.discard(t, [c], { reason: 'chouce' }); await ctx.log(`【筹策】：判定为黑色，弃置 ${t.name} 的 ${cardLabel(c)}`); }
      } else {
        const cands = g.alive();
        const t = (await ctx.ask.targets(p, { prompt: '【筹策】：令一名角色摸牌', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const n = t.seat === p.flags.xhXianfuSeat ? 2 : 1;
        await ctx.draw(t, n, { reason: 'chouce' });
        await ctx.log(`【筹策】：判定为红色，${t.name} 摸 ${n} 张牌${n === 2 ? '（为先辅对象）' : ''}`);
      }
    },
  }],
});

// ============================================================
// 星火·孙乾（蜀 3）【谦雅】【说盟】
// ============================================================
// 谦雅：当你成为锦囊牌的目标后，你可以将任意张手牌交给一名其他角色。
defineSkill({
  id: 'xh_qianya', name: '谦雅',
  desc: '当你成为锦囊牌的目标后，你可以将任意张手牌交给一名其他角色。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => !!d.target && d.target === d.player && !!d.card
      && CARD_META[d.card.name]?.type === 'trick' && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), p.hand.length, { prompt: '【谦雅】：选择任意张手牌（取消则交出已选的牌）' });
      if (!picks.length) return;
      const t = (await ctx.ask.targets(p, { prompt: `【谦雅】：将 ${picks.length} 张手牌交给一名其他角色`, candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.gain(t, picks, { from: p, reason: 'qianya' });
      await ctx.log(`【谦雅】：${p.name} 将 ${picks.map(cardLabel).join('、')} 交给 ${t.name}`);
    },
  }],
});

// 说盟：出牌阶段结束时，你可以与一名角色拼点：你赢则视为你使用【无中生有】，你没赢则视为其对你使用【过河拆桥】。
defineSkill({
  id: 'xh_shuomeng', name: '说盟',
  desc: '出牌阶段结束时，你可以与一名角色拼点：若你赢，视为你使用一张【无中生有】；若你没赢，视为其对你使用一张【过河拆桥】。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.self === d.player
      && (d.player.hand.length > 0 || hasTianbian(d.player))
      && d.game.alive().some((q) => q !== d.player && (q.hand.length > 0 || hasTianbian(q))),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((q) => q.hand.length > 0 || hasTianbian(q));
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【说盟】：选择一名角色拼点', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const r = await pindianX(g, p, t, { reason: '说盟' });
      if (r.skip) return;
      if (r.win) {
        await ctx.log('【说盟】：你赢，视为你使用【无中生有】');
        await ctx.useCard({ from: p, card: vcard('wuzhong'), targets: [p], reason: 'shuomeng' });
      } else {
        await ctx.log(`【说盟】：你没赢，视为 ${t.name} 对你使用【过河拆桥】`);
        await ctx.useCard({ from: t, card: vcard('guohe'), targets: [p], reason: 'shuomeng' });
      }
    },
  }],
});

// ============================================================
// 星火·秦宓（蜀 3）【谏征】【专对】【天辩】
// ============================================================
// 谏征：当一名其他角色使用【杀】指定目标时，若你在其攻击范围内且不是此【杀】的目标，
//       你可以将一张手牌置于牌堆顶，取消此【杀】的所有目标，然后若此【杀】不为黑色，你成为此【杀】的目标。
// 实现：在 card.use.before 里直接改写 useData.targets（与引擎内部 targets 同一数组引用）。
defineSkill({
  id: 'xh_jianzheng', name: '谏征',
  desc: '当一名其他角色使用【杀】指定目标时，若你在其攻击范围内且不是此【杀】的目标，你可以将一张手牌置于牌堆顶，取消此【杀】的所有目标，然后若此【杀】不为黑色，你成为此【杀】的目标。',
  triggers: [{
    on: 'card.use.before', who: 'any', optional: true,
    filter: (d) => !!d.card && d.card.name === 'sha' && !!d.self && d.self !== d.player
      && Array.isArray(d.targets) && !d.targets.includes(d.player)
      && d.player.hand.length > 0 && d.player.alive
      && d.game.inAttackRange(d.self, d.player),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【谏征】：将一张手牌置于牌堆顶' }))[0];
      if (!c) return;
      await pullFrom(g, p, c);
      g.deck.push(c);                       // 牌堆顶 = 数组末尾
      await ctx.log(`【谏征】：${p.name} 将 ${cardLabel(c)} 置于牌堆顶，取消此【杀】的所有目标`);
      d.targets.length = 0;
      if (!black(d.card)) {
        d.targets.push(p);
        await ctx.log(`【谏征】：此【杀】不为黑色，${p.name} 成为此【杀】的目标`);
      }
    },
  }],
});

// 专对：当你使用【杀】指定目标后，或当你成为【杀】的目标后，你可以与其拼点：
//       若你赢，此【杀】不能被【闪】响应 / 此【杀】对你无效。
// 实现：①使用【杀】赢 → 置 shaCtx.unavoidable（引擎「此杀不可被闪响应」同一出口）；
//       ②成为目标赢 → 在 dodge.before 强制视为已闪避（等价于「此【杀】对你无效」，因为 target.after 已无法移出目标表）。
defineSkill({
  id: 'xh_zhuandui', name: '专对',
  desc: '当你使用【杀】指定目标后，或当你成为【杀】的目标后，你可以与其拼点：若你赢，此【杀】不能被【闪】响应/此【杀】对你无效。（实现：「此【杀】对你无效」以【闪】避结算等价实现）',
  triggers: [
    {
      on: 'target.after', who: 'self', optional: true,
      filter: (d) => d.self === d.player && !!d.card && d.card.name === 'sha' && !!d.target
        && d.target !== d.player && !!d.shaCtx && !d.shaCtx.unavoidable
        && (d.player.hand.length > 0 || hasTianbian(d.player)),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const r = await pindianX(g, p, d.target, { reason: '专对' });
        if (r.skip || !r.win) return;
        d.shaCtx.unavoidable = true;
        await ctx.log('【专对】：你赢，此【杀】不能被【闪】响应');
      },
    },
    {
      on: 'target.after', who: 'any', optional: true,
      filter: (d) => !!d.target && d.target === d.player && d.self !== d.player && !!d.card
        && d.card.name === 'sha' && d.player.alive && !d.canceled
        && (d.player.hand.length > 0 || hasTianbian(d.player)),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const r = await pindianX(g, p, d.self, { reason: '专对' });
        if (r.skip || !r.win) return;
        p.flags.xhZdDodge = d.card.id;
        await ctx.log('【专对】：你赢，此【杀】对你无效');
      },
    },
    {
      on: 'dodge.before', who: 'self', optional: false,
      filter: (d) => !!d.card && d.card.id === d.player.flags.xhZdDodge,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.xhZdDodge = null;
        ctx.data.dodged = true;
        await ctx.log(`【专对】：此【杀】对 ${p.name} 无效`);
      },
    },
  ],
});

// 天辩：你拼点时，可改用牌堆顶一张牌拼点，若该牌为红桃，则点数视为 K。
// 实现：本包内的拼点（【专对】【戡难】【说盟】）走本文件的 pindianX，已支持【天辩】；
//       其他武将/其他技能发起的拼点走引擎 pindian.js，暂不支持改用牌堆顶牌。
defineSkill({
  id: 'xh_tianbian', name: '天辩',
  desc: '你拼点时，可改用牌堆顶一张牌拼点，若该牌为红桃，则点数视为 K。',
  triggers: [{
    // 引擎 pindian.js 在选牌前派发 pindian.pick（data = { self, game, card, num }），
    // 技能在这里把本方的拼点牌换成牌堆顶一张即可 —— 对所有走 engine/pindian.js 的拼点都生效。
    on: 'pindian.pick', who: 'self', optional: true,
    filter: (d) => d.game.deck.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【天辩】：是否改用牌堆顶一张牌拼点（若为红桃则点数视为 K）？'))) return;
      if (!g.deck.length) return;
      const top = g.deck.pop();          // 牌堆顶 = 数组末尾
      const isHeart = top.suit === 'heart';
      ctx.data.card = top;
      ctx.data.num = isHeart ? 13 : (top.num || 0);
      await ctx.log(`【天辩】：${p.name} 改用牌堆顶 ${cardLabel(top)} 拼点${isHeart ? '（红桃视为 K）' : ''}`);
    },
  }],
});

// ============================================================
// 星火·薛综（吴 3）【复难】【诫训】
// ============================================================
// 复难：其他角色使用或打出牌响应你使用的牌时，你可以令其获得你使用的牌且本回合不能使用之，
//       然后你获得其使用或打出的牌。
// 实现：「本回合不能使用之」没有引擎出口，改为在该牌被使用时于 card.use.before 取消（牌留在其手中）。
defineSkill({
  id: 'xh_funan', name: '复难',
  desc: '其他角色使用或打出牌响应你使用的牌时，你可以令其获得你使用的牌且本回合不能使用之，然后你获得其使用或打出的牌。（实现：「本回合不能使用之」以「其使用该牌时被取消、牌留在手中」实现）',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => d.self === d.player && !!d.card,
      effect(ctx) {
        ctx.self.flags.xhFunan = { card: ctx.data.card, turn: ctx.game.turnCount, used: false };
      },
    },
    {
      on: 'cards.discard', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player, g = d.game, info = p.flags.xhFunan;
        if (d.self === p) return false;
        if (!info || info.turn !== g.turnCount || info.used) return false;
        if (!USE_REASONS.has(d.reason)) return false;
        // 只在「你使用的牌仍在处理区结算中」时认定为其响应你的牌，避免误响应他人
        if (!info.card || !(g.table || []).includes(info.card)) return false;
        return (d.cards || []).length === 1;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, info = p.flags.xhFunan, q = ctx.data.self, resp = ctx.data.cards[0];
        info.used = true;
        if (!p.flags.xhFunanFree && info.card) {
          const used = info.card;
          if (await pullFrom(g, p, used)) {
            await ctx.gain(q, [used], { from: p, reason: 'funan' });
            used.__xhNoUseTurn = g.turnCount;
            await ctx.log(`【复难】：${q.name} 获得你使用的 ${cardLabel(used)}，本回合不能使用之`);
          }
        }
        if (resp) {
          await pullFrom(g, q, resp);
          await ctx.gain(p, [resp], { from: q, reason: 'funan' });
          await ctx.log(`【复难】：你获得 ${q.name} 使用/打出的 ${cardLabel(resp)}`);
        }
      },
    },
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => !!d.card && d.card.__xhNoUseTurn === d.game.turnCount,
      async effect(ctx) {
        ctx.data.canceled = true;
        await ctx.log(`【复难】：${cardLabel(ctx.data.card)} 本回合不能使用`);
      },
    },
  ],
});

// 诫训：结束阶段，你可以令一名其他角色摸等同于场上方块牌数的牌，然后弃置 X 张牌（X 为此前发动过此技能的次数）；
//       若其因此弃光了所有牌，你失去【诫训】，此后发动【复难】无须令其获得你使用的牌。
defineSkill({
  id: 'xh_jiexun', name: '诫训',
  desc: '结束阶段，你可以令一名其他角色摸等同于场上方块牌数的牌，然后弃置 X 张牌（X 为此前发动过此技能的次数）；若其因此弃光了所有牌，你失去【诫训】，此后你发动【复难】无须令其获得你使用的牌。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.self === d.player && !!effSkills(d.player).some((s) => s.id === 'xh_jiexun'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【诫训】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const n = fieldOf(g).filter((c) => c.suit === 'diamond').length;
      const x = p.flags.xhJiexunUsed || 0;
      if (n > 0) await ctx.draw(t, n, { reason: 'jiexun' });
      await ctx.log(`【诫训】：${t.name} 摸 ${n} 张牌（场上方块牌数），然后弃置 ${x} 张牌`);
      p.flags.xhJiexunUsed = x + 1;
      if (x > 0 && t.hand.length) {
        const picks = await g.chooseSomeCards(t, t.hand.slice(), Math.min(x, t.hand.length), { prompt: `【诫训】：弃置 ${Math.min(x, t.hand.length)} 张牌` });
        if (picks.length) await ctx.discard(t, picks, { reason: 'jiexun' });
      }
      if (x > 0 && t.hand.length === 0) {
        p.skills = (p.skills || []).filter((s) => s.id !== 'xh_jiexun');
        p.flags.xhFunanFree = true;
        await ctx.log(`【诫训】：${t.name} 因此弃光了所有牌，${p.name} 失去【诫训】，此后【复难】无须令其获得你使用的牌`);
      }
    },
  }],
});

// ============================================================
// 星火·潘濬（吴 3）【观微】【公清】
// ============================================================
// 观微：每回合限一次，一名角色的出牌阶段结束时，若其本回合使用过至少两张牌且这些牌的花色均相同，
//       你可以弃置一张牌，令其摸两张牌并获得一个额外的出牌阶段。
// 实现：引擎已有额外出牌阶段出口（player.flags.extraPlay，廖化【当先】/【流离】在用），故完整实现，非降级。
defineSkill({
  id: 'xh_guanwei', name: '观微',
  desc: '每回合限一次，一名角色的出牌阶段结束时，若其本回合使用过至少两张牌且这些牌的花色均相同，你可以弃置一张牌，令其摸两张牌并获得一个额外的出牌阶段。',
  triggers: [
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!d.card && !!d.self && !!d.card.suit && d.card.suit !== 'none',
      effect(ctx) {
        const q = ctx.data.self, g = ctx.game;
        if (q.flags.xhUsedTurn !== g.turnCount) { q.flags.xhUsedTurn = g.turnCount; q.flags.xhUsedSuits = []; }
        q.flags.xhUsedSuits.push(ctx.data.card.suit);
      },
    },
    {
      on: 'phase.end', who: 'any', optional: true,
      filter: (d) => {
        const g = d.game, p = d.player, q = d.self;
        if (d.phase !== 'play' || !q || !q.alive) return false;
        if (p.flags.xhGuanweiTurn === g.turnCount) return false;
        if (q.flags.xhUsedTurn !== g.turnCount) return false;
        const s = q.flags.xhUsedSuits || [];
        return s.length >= 2 && s.every((x) => x === s[0]);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, q = ctx.data.self;
        const pool = zoneOf(p);
        if (!pool.length) { await ctx.log('【观微】：你没有牌可弃置'); return; }
        const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【观微】：弃置一张牌' }))[0];
        if (!c) return;
        p.flags.xhGuanweiTurn = g.turnCount;
        await ctx.discard(p, [c], { reason: 'guanwei' });
        await ctx.draw(q, 2, { reason: 'guanwei' });
        q.flags.extraPlay = true;
        await ctx.log(`【观微】：${p.name} 弃置 ${cardLabel(c)}，${q.name} 摸 2 张牌并获得一个额外的出牌阶段`);
      },
    },
  ],
});

// 公清：锁定技，当你受到伤害时，若伤害来源的攻击范围小于 3，此伤害改为 1；若大于 3，此伤害 +1。
defineSkill({
  id: 'xh_gongqing', name: '公清',
  desc: '锁定技，当你受到伤害时，若伤害来源的攻击范围小于 3，则此伤害改为 1；若大于 3，则此伤害 +1。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.to === d.player && !!d.from && !d.canceled && (d.amount || 0) > 0,
    async effect(ctx) {
      const g = ctx.game, src = ctx.data.from;
      const r = g.attackRange(src);
      if (r < 3) {
        if ((ctx.data.amount || 1) > 1) {
          ctx.data.amount = 1;
          await ctx.log(`【公清】：${src.name} 的攻击范围为 ${r}（<3），此伤害改为 1`);
        }
      } else if (r > 3) {
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log(`【公清】：${src.name} 的攻击范围为 ${r}（>3），此伤害 +1`);
      }
    },
  }],
});

// ============================================================
// 星火·马忠（蜀 4）【抚蛮】
// ============================================================
// 抚蛮：出牌阶段每名角色限一次，你可以将一张【杀】交给一名其他角色，
//       然后直到其下回合结束，其使用「抚蛮」牌时，你摸一张牌。
// 生效期：给该角色记一个「抚蛮」窗口（授予时的回合数），其回合结束时若授予回合早于本回合则窗口关闭，
//         即精确地「直到其下回合结束」（不再用「当前回合 + 存活人数 + 1」近似）。
defineSkill({
  id: 'xh_fuman', name: '抚蛮',
  desc: '出牌阶段每名角色限一次，你可以将一张【杀】交给一名其他角色，然后直到其下回合结束，其使用「抚蛮」牌时，你摸一张牌。',
  active: {
    prompt: '抚蛮：将一张【杀】交给一名其他角色',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.xhFumanTurn !== g.turnCount) { p.flags.xhFumanTurn = g.turnCount; p.flags.xhFumanSeats = []; }
      const shas = p.hand.filter((c) => c.name === 'sha');
      if (!shas.length) { await ctx.log('【抚蛮】：你没有【杀】可交出'); return; }
      const c = (await g.chooseSomeCards(p, shas, 1, { prompt: '【抚蛮】：选择一张【杀】' }))[0];
      if (!c) return;
      const done = p.flags.xhFumanSeats || [];
      const cands = others(g, p).filter((q) => !done.includes(q.seat));
      if (!cands.length) { await ctx.log('【抚蛮】：本阶段每名其他角色均已获得过【杀】'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【抚蛮】：交给一名本阶段尚未获得过的其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.xhFumanSeats = [...done, t.seat];
      c.__xhFuman = { owner: p.seat, fromTurn: g.turnCount };
      t.flags.xhFumanWin = { owner: p.seat, fromTurn: g.turnCount, expired: false };
      await ctx.gain(t, [c], { from: p, reason: 'fuman' });
      await ctx.log(`【抚蛮】：${p.name} 将 ${cardLabel(c)} 交给 ${t.name}，直到其下回合结束其使用此牌时 ${p.name} 摸一张牌`);
    },
  },
  triggers: [{
    on: 'card.use.after', who: 'any', optional: false,
    filter: (d) => {
      const f = d.card && d.card.__xhFuman;
      if (!f || f.owner !== d.player.seat) return false;
      const w = d.self && d.self.flags && d.self.flags.xhFumanWin;
      return !!w && w.owner === f.owner && !w.expired;
    },
    async effect(ctx) {
      const p = ctx.self, c = ctx.data.card;
      c.__xhFuman = null;
      await ctx.draw(p, 1, { reason: 'fuman' });
      await ctx.log(`【抚蛮】：${ctx.data.self.name} 使用了「抚蛮」牌 ${cardLabel(c)}，${p.name} 摸一张牌`);
    },
  }, {
    // 窗口关闭：某角色回合结束时，若「抚蛮」是在更早的回合授予的，则「直到其下回合结束」到达
    on: 'turn.end', who: 'any', optional: false,
    filter: (d) => {
      const w = d.self && d.self.flags && d.self.flags.xhFumanWin;
      return !!w && !w.expired && w.fromTurn < d.game.turnCount;
    },
    async effect(ctx) {
      const t = ctx.data.self, w = t.flags.xhFumanWin;
      w.expired = true;
      await ctx.log(`【抚蛮】：${t.name} 的回合结束，「抚蛮」对其失效`);
    },
  }],
});

// ============================================================
// 星火·李严（蜀 3）【督粮】【腹鳞】
// ============================================================
// 督粮：出牌阶段限一次，你可以获得一名其他角色的一张手牌，然后令其选择：
//       1. 观看牌堆顶两张牌并获得其中的基本牌；2. 于其下个摸牌阶段多摸一张牌。
// 实现：选项 1 中「非基本牌」放回牌堆顶（原文未明示去向，选择不弃置以免亏牌）。
defineSkill({
  id: 'xh_duliang', name: '督粮',
  desc: '出牌阶段限一次，你可以获得一名其他角色的一张手牌，然后令其选择：1. 观看牌堆顶两张牌并获得其中的基本牌；2. 于其下个摸牌阶段多摸一张牌。（实现：选项 1 的非基本牌放回牌堆顶）',
  active: {
    perPhase: true,
    prompt: '督粮：获得一名其他角色一张手牌，然后令其选择一项',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((q) => q.hand.length > 0);
      if (!cands.length) { await ctx.log('【督粮】：没有有手牌的其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【督粮】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const idx = await g.chooseOne(p, t.hand.map((c, i) => `手牌（第 ${i + 1} 张）`), { prompt: '【督粮】：选择其一张手牌（暗选）' });
      const c = t.hand[Math.max(0, idx)] || t.hand[0];
      if (c) { await ctx.gain(p, [c], { from: t, reason: 'duliang' }); await ctx.log(`【督粮】：${p.name} 获得 ${t.name} 一张手牌`); }
      const opt = await ctx.ask.choose(t, ['观看牌堆顶两张牌并获得其中的基本牌', '于你的下个摸牌阶段多摸一张牌'],
        { prompt: '【督粮】：请选择一项', reason: 'duliang' });
      if (opt === 1) {
        t.flags.xhDuliangExtra = true;
        await ctx.log(`【督粮】：${t.name} 的下个摸牌阶段多摸一张牌`);
        return;
      }
      const top = g.popDeck(2);
      if (!top.length) return;
      await g.revealCards(top, { to: [t], reason: '督粮' });
      const basics = top.filter((x) => x.type === 'basic');
      const rest = top.filter((x) => x.type !== 'basic');
      if (basics.length) { await ctx.gain(t, basics, { from: null, reason: 'duliang' }); }
      if (rest.length) g.deck.push(...rest);   // 放回牌堆顶（保持原顺序）
      await ctx.log(`【督粮】：${t.name} 获得其中 ${basics.length} 张基本牌${rest.length ? `，其余 ${rest.length} 张放回牌堆顶` : ''}`);
    },
  },
  triggers: [{
    on: 'draw.count', who: 'any', optional: false,
    filter: (d) => !!d.self && d.self.flags.xhDuliangExtra && d.self.alive,
    async effect(ctx) {
      const q = ctx.data.self;
      q.flags.xhDuliangExtra = false;
      ctx.data.count = (ctx.data.count || 0) + 1;
      await ctx.log(`【督粮】：${q.name} 本摸牌阶段多摸一张牌`);
    },
  }],
});

// 腹鳞：锁定技，弃牌阶段内，你于此回合内获得的牌不计入你的手牌数。
// 实现：弃牌阶段以 flags.handLimit 临时补偿「本回合获得的、仍在手牌中的牌数」，阶段结束还原（等价）。
defineSkill({
  id: 'xh_fulin', name: '腹鳞',
  desc: '锁定技，弃牌阶段内，你于此回合内获得的牌不计入你的手牌数。',
  triggers: [
    {
      on: 'cards.gain', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.game.turnPlayer === d.player && (d.cards || []).length > 0,
      effect(ctx) {
        const p = ctx.self;
        p.flags.xhFulinIds = [...(p.flags.xhFulinIds || []), ...ctx.data.cards.map((c) => c.id)];
      },
    },
    {
      on: 'cards.draw.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.game.turnPlayer === d.player && (d.cards || []).length > 0,
      effect(ctx) {
        const p = ctx.self;
        p.flags.xhFulinIds = [...(p.flags.xhFulinIds || []), ...ctx.data.cards.map((c) => c.id)];
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'discard' && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        const ids = new Set(p.flags.xhFulinIds || []);
        const n = p.hand.filter((c) => ids.has(c.id)).length;
        p.flags.xhFulinBonus = n;
        p.flags.handLimit = (p.flags.handLimit || 0) + n;
        if (n > 0) await ctx.log(`【腹鳞】：本回合获得的 ${n} 张牌不计入手牌数`);
      },
    },
    {
      on: 'phase.end', who: 'self', optional: false,
      filter: (d) => d.phase === 'discard' && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        const n = p.flags.xhFulinBonus || 0;
        p.flags.handLimit = (p.flags.handLimit || 0) - n;
        p.flags.xhFulinBonus = 0;
      },
    },
    { on: 'turn.end', who: 'self', optional: false, effect(ctx) { ctx.self.flags.xhFulinIds = []; } },
  ],
});

// ============================================================
// 星火·糜竺（蜀 3）【资援】【巨贾】
// ============================================================
// 资援：出牌阶段限一次，你可以将任意张点数之和为 13 的手牌交给一名其他角色，然后其回复 1 点体力。
defineSkill({
  id: 'xh_ziyuan', name: '资援',
  desc: '出牌阶段限一次，你可以将任意张点数之和为 13 的手牌交给一名其他角色，然后其回复 1 点体力。',
  active: {
    perPhase: true,
    prompt: '资援：将点数之和为 13 的手牌交给一名其他角色',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length || !p.hand.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【资援】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const picks = [];
      let sum = 0;
      while (sum < 13) {
        const pool = p.hand.filter((c) => !picks.includes(c) && (c.num || 0) > 0 && sum + (c.num || 0) <= 13);
        if (!pool.length) break;
        const c = (await g.chooseSomeCards(p, pool, 1, { prompt: `【资援】：选择点数之和为 13 的手牌（当前 ${sum}/13，可取消）` }))[0];
        if (!c) break;
        picks.push(c);
        sum += c.num || 0;
      }
      if (sum !== 13) { await ctx.log(`【资援】：所选牌点数之和为 ${sum}，不为 13，技能无效`); return; }
      await ctx.gain(t, picks, { from: p, reason: 'ziyuan' });
      await ctx.log(`【资援】：${p.name} 将 ${picks.map(cardLabel).join('、')}（合计 13 点）交给 ${t.name}`);
      await ctx.recover(t, 1, { reason: 'ziyuan' });
    },
  },
});

// 巨贾：锁定技，你的手牌上限 +X；游戏开始时，你多摸 X 张牌（X 为你的体力上限）。
defineSkill({
  id: 'xh_jujia', name: '巨贾',
  desc: '锁定技，你的手牌上限 +X；游戏开始时，你多摸 X 张牌（X 为你的体力上限）。',
  triggers: [{
    on: 'game.start', who: 'any', optional: false,
    filter: (d) => d.self === null || d.self === undefined || d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      const x = Math.max(1, p.maxHp);
      p.flags.handLimit = (p.flags.handLimit || 0) + x;
      await ctx.draw(p, x, { reason: 'jujia' });
      await ctx.log(`【巨贾】：${p.name} 的手牌上限 +${x}，开局额外摸 ${x} 张牌`);
    },
  }],
});

// ============================================================
// 星火·周鲂（吴 4）【断发】【诱敌】
// ============================================================
// 断发：出牌阶段，你可以弃置任意张黑色牌，然后摸等量张牌；本阶段你以此法弃置的牌总数不能大于你的体力上限。
defineSkill({
  id: 'xh_duanfa', name: '断发',
  desc: '出牌阶段，你可以弃置任意张黑色牌，然后摸等量张牌。本阶段你以此法弃置的牌总数不能大于你的体力上限。',
  active: {
    prompt: '断发：弃置任意张黑色牌，然后摸等量张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      // desc 的「本阶段」= 本出牌阶段，按 playPhaseSeq 计（额外出牌阶段刷新，SG025 #11）
      if (p.flags.xhDuanfaPhase !== g.playPhaseSeq) { p.flags.xhDuanfaPhase = g.playPhaseSeq; p.flags.xhDuanfaCount = 0; }
      const left = p.maxHp - (p.flags.xhDuanfaCount || 0);
      if (left <= 0) { await ctx.log(`【断发】：本阶段已弃置 ${p.flags.xhDuanfaCount} 张，达到体力上限 ${p.maxHp}`); return; }
      const blacks = p.hand.filter((c) => black(c));
      if (!blacks.length) { await ctx.log('【断发】：没有黑色手牌'); return; }
      const picks = await g.chooseSomeCards(p, blacks, Math.min(left, blacks.length), { prompt: `【断发】：弃置黑色牌（本阶段最多再弃 ${left} 张）` });
      if (!picks.length) return;
      p.flags.xhDuanfaCount = (p.flags.xhDuanfaCount || 0) + picks.length;
      await ctx.discard(p, picks, { reason: 'duanfa' });
      await ctx.draw(p, picks.length, { reason: 'duanfa' });
      await ctx.log(`【断发】：弃置 ${picks.length} 张黑色牌后摸 ${picks.length} 张牌（本阶段累计 ${p.flags.xhDuanfaCount}/${p.maxHp}）`);
    },
  },
});

// 诱敌：结束阶段，你可以令一名其他角色弃置你一张手牌：若此牌不为【杀】，你获得其一张牌；
//       若此牌不为黑色牌，你摸一张牌。
defineSkill({
  id: 'xh_youdi', name: '诱敌',
  desc: '结束阶段，你可以令一名其他角色弃置你一张手牌：若此牌不为【杀】，你获得其一张牌；若此牌不为黑色牌，你摸一张牌。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.self === d.player && d.player.hand.length > 0
      && d.game.alive().some((q) => q !== d.player),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【诱敌】：选择一名其他角色弃置你一张手牌', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const idx = await g.chooseOne(t, p.hand.map((c, i) => `手牌（第 ${i + 1} 张）`), { prompt: `【诱敌】：弃置 ${p.name} 一张手牌（暗选）` });
      const c = p.hand[Math.max(0, idx)] || p.hand[0];
      if (!c) return;
      const isSha = c.name === 'sha';
      const isBlack = black(c);
      await ctx.discard(p, [c], { reason: 'youdi' });
      await ctx.log(`【诱敌】：${t.name} 弃置了 ${p.name} 的 ${cardLabel(c)}`);
      if (!isSha) {
        const zone = zoneOf(t);
        if (zone.length) {
          const pick = await g.chooseCardFrom(p, t, { reason: 'youdi' });
          if (pick) { await ctx.gain(p, [pick], { from: t, reason: 'youdi' }); await ctx.log(`【诱敌】：${p.name} 获得 ${t.name} 一张牌`); }
        }
      }
      if (!isBlack) await ctx.draw(p, 1, { reason: 'youdi' });
    },
  }],
});

// ============================================================
// 星火·吕岱（吴 4）【勤国】
// ============================================================
// 勤国：当你于回合内使用装备牌结算结束后，你可以视为使用一张【杀】（不计入出牌阶段次数但有距离限制）；
//       当你的装备区牌数变化后，若变化后的牌数等于你的体力值，你回复 1 点体力。
defineSkill({
  id: 'xh_qinguo', name: '勤国',
  desc: '当你于回合内使用装备牌结算结束后，你可以视为使用一张【杀】（不计入出牌阶段次数但有距离限制）；当你的装备区牌数变化后，若变化后的牌数等于你的体力值，你回复 1 点体力。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: true,
      filter: (d) => d.self === d.player && !!d.card && d.card.type === 'equip' && d.game.turnPlayer === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter((q) => q !== p && g.inAttackRange(p, q));
        if (!cands.length) { await ctx.log('【勤国】：攻击范围内没有其他角色'); return; }
        const t = (await ctx.ask.targets(p, { prompt: '【勤国】：视为使用一张【杀】的目标', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        await ctx.log('【勤国】：视为使用一张【杀】（不计入次数限制）');
        await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'qinguo', ignoreShaLimit: true });
      },
    },
    {
      on: 'equip.change', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { await qinguoCheck(ctx); },
    },
    {
      on: 'equip.lose', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { await qinguoCheck(ctx); },
    },
  ],
});

async function qinguoCheck(ctx) {
  const p = ctx.self;
  const n = equipOf(p).length;
  if (n > 0 && n === p.hp && p.hp < p.maxHp) {
    await ctx.recover(p, 1, { reason: 'qinguo' });
    await ctx.log(`【勤国】：装备区牌数为 ${n}，等于体力值，回复 1 点体力`);
  }
}

// ============================================================
// 星火·刘繇（群 4）【戡难】
// ============================================================
// 戡难：出牌阶段限 X 次（X 为你的体力值），你可以与本阶段未以此法拼点过的一名角色拼点：
//       若你赢，你使用的下一张【杀】伤害基数 +1 且本阶段不能再发动；若其赢，其使用的下一张【杀】伤害基数 +1。
defineSkill({
  id: 'xh_kannan', name: '戡难',
  desc: '出牌阶段限 X 次（X 为你的体力值），你可以与本阶段未以此法拼点过的一名角色拼点：若你赢，你使用的下一张【杀】伤害基数 +1 且本阶段不能再发动；若其赢，其使用的下一张【杀】伤害基数 +1。',
  active: {
    prompt: '戡难：与本阶段未以此法拼点过的角色拼点',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      // 戡难的「本阶段」（次数上限 X 与「本阶段未以此法拼点过的角色」）都按出牌阶段算，故用 playPhaseSeq（SG025 #11）
      if (p.flags.xhKannanPhase !== g.playPhaseSeq) { p.flags.xhKannanPhase = g.playPhaseSeq; p.flags.xhKannanSeats = []; p.flags.xhKannanCount = 0; }
      const x = Math.max(1, p.hp);
      if ((p.flags.xhKannanCount || 0) >= x) { await ctx.log(`【戡难】：本阶段已发动 ${x} 次，不能再发动`); return; }
      const done = p.flags.xhKannanSeats || [];
      const cands = others(g, p).filter((q) => !done.includes(q.seat) && (q.hand.length > 0 || hasTianbian(q)));
      if (!cands.length) { await ctx.log('【戡难】：没有可拼点的角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【戡难】：选择一名本阶段未以此法拼点过的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.xhKannanSeats = [...done, t.seat];
      p.flags.xhKannanCount = (p.flags.xhKannanCount || 0) + 1;
      const r = await pindianX(g, p, t, { reason: '戡难' });
      if (r.skip) return;
      if (r.win) {
        p.flags.xhKannanBonus = true;
        p.flags.xhKannanCount = 999;     // 本阶段不能再发动
        await ctx.log('【戡难】：你赢，你使用的下一张【杀】伤害基数 +1，本阶段不能再发动');
      } else {
        t.flags.xhKannanBonus = true;
        await ctx.log(`【戡难】：${t.name} 赢，其使用的下一张【杀】伤害基数 +1`);
      }
    },
  },
  triggers: [{
    on: 'sha.hit', who: 'any', optional: false,
    filter: (d) => !!d.self && !!d.self.flags.xhKannanBonus,
    async effect(ctx) {
      const q = ctx.data.self;
      q.flags.xhKannanBonus = false;
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      await ctx.log(`【戡难】：${q.name} 使用的【杀】伤害基数 +1（共 ${ctx.data.amount} 点）`);
    },
  }],
});

// ============================================================
// 星火·吕虔（魏 4）【威虏】【赠刀】
// ============================================================
// 威虏：锁定技，当你受到其他角色造成的伤害后，伤害来源在你的下个出牌阶段开始时失去体力至仅剩 1 点，
//       然后其于此阶段结束时回复以此法失去的体力。
defineSkill({
  id: 'xh_weilu', name: '威虏',
  desc: '锁定技，当你受到其他角色造成的伤害后，伤害来源在你的下个出牌阶段开始时失去体力至仅剩 1 点，然后其于此阶段结束时回复以此法失去的体力。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => d.to === d.player && !!d.from && d.from !== d.player && d.from.alive,
      async effect(ctx) {
        const p = ctx.self, src = ctx.data.from;
        p.flags.xhWeilu = { seat: src.seat };
        await ctx.log(`【威虏】：${src.name} 将于 ${p.name} 的下个出牌阶段开始时失去体力至仅剩 1 点`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && d.self === d.player && !!d.player.flags.xhWeilu,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, info = p.flags.xhWeilu;
        p.flags.xhWeilu = null;
        const src = g.players[info.seat];
        if (!src || !src.alive) return;
        const loss = Math.max(0, src.hp - 1);
        if (loss > 0) {
          await ctx.log(`【威虏】：${src.name} 失去 ${loss} 点体力（至仅剩 1 点）`);
          await ctx.loseHp(src, loss, { reason: 'weilu' });
        }
        p.flags.xhWeiluLoss = { seat: src.seat, amount: loss };
      },
    },
    {
      on: 'phase.end', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && d.self === d.player && (d.player.flags.xhWeiluLoss?.amount || 0) > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, info = p.flags.xhWeiluLoss;
        p.flags.xhWeiluLoss = null;
        const src = g.players[info.seat];
        if (!src || !src.alive) return;
        await ctx.recover(src, info.amount, { reason: 'weilu' });
        await ctx.log(`【威虏】：${src.name} 回复以此法失去的 ${info.amount} 点体力`);
      },
    },
  ],
});

// 赠刀：限定技，出牌阶段，你可以将装备区任意张牌置于一名其他角色武将牌旁，
//       该角色每次造成伤害时，移去一张「赠刀」牌，使此伤害 +1。
defineSkill({
  id: 'xh_zengdao', name: '赠刀',
  desc: '限定技，出牌阶段，你可以将装备区任意张牌置于一名其他角色武将牌旁，该角色每次造成伤害时，移去一张「赠刀」牌，使此伤害 +1。',
  active: {
    prompt: '赠刀（限定技）：将装备区任意张牌置于一名其他角色武将牌旁',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.xhZengdaoUsed) { await ctx.log('【赠刀】：限定技，本局已发动过'); return; }
      const eq = equipOf(p);
      if (!eq.length) { await ctx.log('【赠刀】：你的装备区没有牌'); return; }
      const picks = await g.chooseSomeCards(p, eq, eq.length, { prompt: '【赠刀】：选择要置于其武将牌旁的装备牌' });
      if (!picks.length) return;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【赠刀】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.xhZengdaoUsed = true;
      for (const c of picks) await pullFrom(g, p, c);
      t.flags.xhZengdao = [...(t.flags.xhZengdao || []), ...picks];
      await ctx.log(`【赠刀】：${p.name} 将 ${picks.map(cardLabel).join('、')} 置于 ${t.name} 武将牌旁（「赠刀」${t.flags.xhZengdao.length} 张）`);
    },
  },
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => !!d.from && (d.from.flags.xhZengdao || []).length > 0 && !d.canceled && (d.amount || 0) > 0,
    async effect(ctx) {
      const q = ctx.data.from, g = ctx.game;
      const c = q.flags.xhZengdao.pop();
      if (!c) return;
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      g.pushDiscard([c]);
      await ctx.log(`【赠刀】：${q.name} 移去一张「赠刀」牌 ${cardLabel(c)}，此伤害 +1`);
    },
  }],
});

// ============================================================
// 星火·祖茂（吴 4）【引兵】【绝地】
// ============================================================
// 引兵：结束阶段，你可以将任意张非基本牌置于你的武将牌上，称为「引兵」；
//       当你受到【杀】或【决斗】造成的伤害后，你移去一张「引兵」牌。
// 实现：「武将牌上」用 player.flags.xhYinbing 数组存牌（已从原区域 splice 摘除）。
defineSkill({
  id: 'xh_yinbing', name: '引兵',
  desc: '结束阶段，你可以将任意张非基本牌置于你的武将牌上，称为「引兵」；当你受到【杀】或【决斗】造成的伤害后，你移去一张「引兵」牌。',
  triggers: [
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.phase === 'end' && d.self === d.player && d.player.hand.some((c) => c.type !== 'basic'),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const pool = p.hand.filter((c) => c.type !== 'basic');
        const picks = await g.chooseSomeCards(p, pool, pool.length, { prompt: '【引兵】：选择任意张非基本牌置于武将牌上' });
        if (!picks.length) return;
        for (const c of picks) await pullFrom(g, p, c);
        p.flags.xhYinbing = [...(p.flags.xhYinbing || []), ...picks];
        await ctx.log(`【引兵】：${p.name} 将 ${picks.map(cardLabel).join('、')} 置于武将牌上（「引兵」${p.flags.xhYinbing.length} 张）`);
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => d.to === d.player && !!d.card && (d.card.name === 'sha' || d.card.name === 'juedou')
        && (d.player.flags.xhYinbing || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const c = p.flags.xhYinbing.pop();
        if (!c) return;
        g.pushDiscard([c]);
        await ctx.log(`【引兵】：${p.name} 移去一张「引兵」牌 ${cardLabel(c)}（剩余 ${p.flags.xhYinbing.length} 张）`);
      },
    },
  ],
});

// 绝地：锁定技，准备阶段，若你有「引兵」牌，你选择：
//       1. 移去所有「引兵」牌并将手牌摸至体力上限；
//       2. 令一名体力值不大于你的其他角色获得所有「引兵」牌，然后其回复 1 点体力并摸等量张牌。
defineSkill({
  id: 'xh_juedi', name: '绝地',
  desc: '锁定技，准备阶段，若你有「引兵」牌，你选择：1. 移去所有「引兵」牌并将手牌摸至体力上限；2. 令一名体力值不大于你的其他角色获得你所有「引兵」牌，然后其回复 1 点体力并摸等量张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && d.self === d.player && (d.player.flags.xhYinbing || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cards = (p.flags.xhYinbing || []).filter(Boolean);
      if (!cards.length) return;
      const cands = others(g, p).filter((q) => q.hp <= p.hp);
      const opts = ['移去所有「引兵」牌并将手牌摸至体力上限'];
      if (cands.length) opts.push('令一名体力值不大于你的其他角色获得所有「引兵」牌，然后其回复 1 点体力并摸等量张牌');
      const idx = await ctx.ask.choose(p, opts, { prompt: '【绝地】：请选择一项', reason: 'juedi' });
      if (idx === 1 && cands.length) {
        const t = (await ctx.ask.targets(p, { prompt: '【绝地】：令一名体力值不大于你的其他角色获得所有「引兵」牌', candidates: cands, min: 1, max: 1 }))[0];
        if (t) {
          p.flags.xhYinbing = [];
          await ctx.gain(t, cards, { from: p, reason: 'juedi' });
          await ctx.recover(t, 1, { reason: 'juedi' });
          await ctx.draw(t, cards.length, { reason: 'juedi' });
          await ctx.log(`【绝地】：${t.name} 获得 ${cards.length} 张「引兵」牌，回复 1 点体力并摸 ${cards.length} 张牌`);
          return;
        }
      }
      p.flags.xhYinbing = [];
      g.pushDiscard(cards);
      const need = Math.max(0, p.maxHp - p.hand.length);
      if (need > 0) await ctx.draw(p, need, { reason: 'juedi' });
      await ctx.log(`【绝地】：移去 ${cards.length} 张「引兵」牌，手牌摸至体力上限（摸 ${need} 张）`);
    },
  }],
});

// ============================================================
// 星火·徐氏（吴 3）【问卦】【伏诛】
// ============================================================
// 问卦：出牌阶段限一次，你可以将一张牌置于牌堆顶或牌堆底，然后从另一端摸一张牌；
//       其他角色的出牌阶段限一次，其可以交给你一张牌，你可以将其置于牌堆顶或牌堆底，然后你与其各从另一端摸一张牌。
// 实现：从牌堆底摸牌用 player.flags.drawFromBottom（引擎 drawCards 已支持）。
defineSkill({
  id: 'xh_wengua', name: '问卦',
  desc: '出牌阶段限一次，你可以将一张牌置于牌堆顶或牌堆底，然后从另一端摸一张牌；其他角色的出牌阶段限一次，其可以交给你一张牌，你可以将其置于牌堆顶或牌堆底，然后你与其各从另一端摸一张牌。',
  active: {
    perPhase: true,
    prompt: '问卦：将一张牌置于牌堆顶/底，然后从另一端摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = zoneOf(p);
      if (!pool.length) { await ctx.log('【问卦】：你没有牌可放置'); return; }
      const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【问卦】：选择一张牌' }))[0];
      if (!c) return;
      await pullFrom(g, p, c);
      const idx = await ctx.ask.choose(p, ['置于牌堆顶（然后从牌堆底摸一张）', '置于牌堆底（然后从牌堆顶摸一张）'], { prompt: '【问卦】：请选择放置位置', reason: 'wengua' });
      if (idx === 1) {
        g.deck.unshift(c);                    // 牌堆底 = 数组头部
        await ctx.draw(p, 1, { reason: 'wengua' });
        await ctx.log(`【问卦】：${p.name} 将 ${cardLabel(c)} 置于牌堆底，然后从牌堆顶摸一张牌`);
      } else {
        g.deck.push(c);                       // 牌堆顶 = 数组末尾
        await drawFromBottom(ctx, p, 1, 'wengua');
        await ctx.log(`【问卦】：${p.name} 将 ${cardLabel(c)} 置于牌堆顶，然后从牌堆底摸一张牌`);
      }
    },
  },
  triggers: [{
    on: 'phase.begin', who: 'any', optional: false,
    filter: (d) => d.phase === 'play' && !!d.self && d.self !== d.player && d.player.alive
      && d.self.hand.length > 0 && d.player.flags.xhWenguaTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, q = ctx.data.self;
      const yes = await ctx.ask.confirm(q, `【问卦】：是否交给 ${p.name} 一张牌并与其进行问卦？`);
      if (!yes) return;
      const c = (await g.chooseSomeCards(q, q.hand.slice(), 1, { prompt: `【问卦】：交给 ${p.name} 一张牌` }))[0];
      if (!c) return;
      p.flags.xhWenguaTurn = g.turnCount;
      await ctx.gain(p, [c], { from: q, reason: 'wengua' });
      const idx = await ctx.ask.choose(p, ['置于牌堆顶', '置于牌堆底'], { prompt: `【问卦】：${c ? cardLabel(c) : '该牌'}置于牌堆顶还是牌堆底？`, reason: 'wengua' });
      await pullFrom(g, p, c);
      if (idx === 1) {
        g.deck.unshift(c);
        await ctx.draw(p, 1, { reason: 'wengua' });
        await ctx.draw(q, 1, { reason: 'wengua' });
        await ctx.log(`【问卦】：${p.name} 将 ${cardLabel(c)} 置于牌堆底，${p.name} 与 ${q.name} 各从牌堆顶摸一张牌`);
      } else {
        g.deck.push(c);
        await drawFromBottom(ctx, p, 1, 'wengua');
        await drawFromBottom(ctx, q, 1, 'wengua');
        await ctx.log(`【问卦】：${p.name} 将 ${cardLabel(c)} 置于牌堆顶，${p.name} 与 ${q.name} 各从牌堆底摸一张牌`);
      }
    },
  }],
});

// 伏诛：一名男性角色的结束阶段，若牌堆剩余牌数不大于你体力值的 10 倍，
//       你可以依次对其使用牌堆中所有【杀】（至多游戏人数张），然后洗牌。
defineSkill({
  id: 'xh_fuzhu', name: '伏诛',
  desc: '一名男性角色的结束阶段，若牌堆剩余牌数不大于你体力值的 10 倍，你可以依次对其使用牌堆中所有【杀】（至多游戏人数张），然后洗牌。',
  triggers: [{
    on: 'turn.end', who: 'any', optional: true,
    filter: (d) => {
      const g = d.game, p = d.player, q = d.self;
      if (!q || !q.alive || q === p || q.gender !== 'male') return false;
      if (p.flags.xhFuzhuTurn === g.turnCount) return false;
      if (g.deck.length > p.hp * 10) return false;
      return g.deck.some((c) => c.name === 'sha');
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, q = ctx.data.self;
      p.flags.xhFuzhuTurn = g.turnCount;
      const limit = g.players.length;
      let n = 0;
      for (const c of [...g.deck]) {
        if (n >= limit || !q.alive || g.over) break;
        if (c.name !== 'sha') continue;
        const i = g.deck.indexOf(c);
        if (i < 0) continue;
        g.deck.splice(i, 1);          // 从牌堆摘除后再使用（牌张守恒）
        n++;
        await ctx.useCard({ from: p, card: c, targets: [q], reason: 'fuzhu', ignoreRange: true, ignoreShaLimit: true });
      }
      g.deck = g.rng.shuffle(g.deck);
      await ctx.log(`【伏诛】：对 ${q.name} 依次使用了 ${n} 张【杀】，然后洗牌`);
    },
  }],
});
