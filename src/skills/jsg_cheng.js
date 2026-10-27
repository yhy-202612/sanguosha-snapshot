// 江山如故·承（pack = 'jsg_cheng'）技能实现
// 数据见 src/data/jsg_cheng.js；技能 id 前缀 `jc_`
// 口径：线下《江山如故·承》2023 原版；引擎不支持的机制在 desc 内以「实现：」注明降级方式
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const vcard = (name, suit = 'none', num = 0, extra = {}) => ({
  id: `vjc${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const others = (g, p) => g.alive().filter((x) => x !== p);
const isBasic = (c) => c.type === 'basic';
const inRangeCount = (g, p) => g.alive().filter((x) => x !== p && g.inAttackRange(p, x)).length;
const rangeToCount = (g, p) => g.alive().filter((x) => x !== p && g.inAttackRange(x, p)).length;

async function gainFromOutside(g, p, cards, reason = 'gain') {
  const list = (cards || []).filter(Boolean);
  for (const c of list) {
    for (const zone of [g.deck, g.discardPile, g.table || [], g.exilePile || []]) {
      const i = zone.indexOf(c);
      if (i >= 0) zone.splice(i, 1);
    }
  }
  if (list.length) await g.gainCards(p, list, { reason });
  return list;
}

// ============================================================
// 承·梦孙策（吴 4）【独行】【猘横】【诈死】【霸世】
// ============================================================
// 独行：出牌阶段限一次，视为使用一张以任意名角色为目标的【决斗】，此牌结算过程中所有目标的手牌均视为【杀】。
// 实现口径：【决斗】是 1v1 结算牌，多目标按「对每名目标依次结算一次【决斗】」落地（等价于同一张多目标【决斗】）；
// 「目标的手牌均视为【杀】」由 respond.need 接管——决策目标需要打出【杀】时，允许其把手牌当【杀】打出。
const DUXING_MARK = 'jcDxMark';
defineSkill({
  id: 'jc_duxing', name: '独行',
  desc: '出牌阶段限一次，你可以视为使用一张以任意名角色为目标的【决斗】，此牌结算过程中所有目标的手牌均视为【杀】。',
  triggers: [{
    on: 'respond.need', who: 'any', optional: false,
    filter: (d) => d.self && d.self.flags && d.self.flags[DUXING_MARK] != null
      && d.filter && d.filter.name === 'sha' && d.self.hand.length > 0,
    async effect(ctx) {
      const t = ctx.data.self, g = ctx.game;
      const c = (await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【独行】：你的手牌视为【杀】，选择一张打出' }))[0];
      if (!c) return;
      ctx.data.handled = true;
      ctx.data.card = { ...c, name: 'sha', __src: c };
      await ctx.log(`【独行】：${t.name} 的手牌视为【杀】`);
    },
  }],
  active: {
    perPhase: true,
    prompt: '独行：视为使用一张以任意名角色为目标的【决斗】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) return;
      const tars = await ctx.ask.targets(p, { prompt: '【独行】：选择任意名目标', candidates: cands, min: 1, max: cands.length });
      if (!tars.length) return;
      const mark = (p.flags.jcDxSeq || 0) + 1;
      p.flags.jcDxSeq = mark;
      for (const t of tars) t.flags[DUXING_MARK] = mark;
      await ctx.log(`【独行】：视为对 ${tars.map((t) => t.name).join('、')} 使用【决斗】`);
      try {
        for (const t of tars) {
          if (!p.alive || g.over) break;
          if (!t.alive) continue;
          await ctx.useCard({ from: p, card: vcard('juedou'), targets: [t], reason: 'duxing' });
        }
      } finally {
        for (const t of tars) if (t.flags[DUXING_MARK] === mark) delete t.flags[DUXING_MARK];
      }
    },
  },
});

// 猘横：锁定技，当你使用牌对目标角色造成伤害时，若其于此回合内使用或打出牌响应过你使用的牌，此伤害 +1。
defineSkill({
  id: 'jc_yiheng', name: '猘横',
  desc: '锁定技，当你使用牌对目标角色造成伤害时，若其于此回合内使用或打出牌响应过你使用的牌，此伤害 +1。',
  triggers: [
    {
      on: 'dodge.after', who: 'any', priority: 2,
      async effect(ctx) { if (ctx.data.self) ctx.data.self.flags.jcRespondedTurn = ctx.game.turnCount; },
    },
    {
      on: 'damage.before', who: 'any',
      filter: (d) => d.from === d.player && d.to && d.to.flags.jcRespondedTurn === d.game.turnCount,
      async effect(ctx) {
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log('【猘横】：其本回合响应过你的牌，此伤害 +1');
      },
    },
  ],
});

// 诈死：限定技，当你受到致命伤害时，你可以防止之，你失去【猘横】并获得【制衡】，
//       然后令你不计入座次和距离计算直到你对其他角色使用牌或当你受到伤害后。
// 「不计入距离计算」= 你与其他角色互相视为不在攻击范围内：用距离计算的同步钩子 distance.calc
// 把「任意一方是诈死中的孙策」的距离改写成 99（引擎 distance() 会取 Math.max(1, value)）。
// 仍缺：「不计入座次计算」（game.orderFrom / 回合轮转里跳过该角色）需引擎支持。
defineSkill({
  id: 'jc_zhasi', name: '诈死',
  desc: '限定技，当你受到致命伤害时，你可以防止之，你失去【猘横】并获得【制衡】，然后令你不计入座次和距离计算直到你对其他角色使用牌或当你受到伤害后。（实现：「不计入座次」需引擎在 game.orderFrom 里跳过该角色，暂未实现；距离已按「互相不在攻击范围内」实现）',
  triggers: [{
    on: 'damage.before', who: 'self', optional: true,
    filter: (d) => d.to === d.player && (d.amount || 0) >= d.player.hp && !d.player.flags.jcZhasiUsed,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.jcZhasiUsed = true;
      ctx.data.canceled = true;
      p.skills = (p.skills || []).filter((s) => s.id !== 'jc_yiheng');
      if (!(effSkills(p) || []).some((s) => s.id === 'zhiheng')) {
        const sk = getSkill('zhiheng');
        if (sk) p.skills.push(sk);
      }
      p.flags.jcZhasiActive = true;
      await ctx.log('【诈死】：防止致命伤害，失去【猘横】并获得【制衡】；你不计入距离计算，直到你使用牌指定其他角色或你受到伤害');
    },
  }, {
    // 同步钩子：距离计算里把与孙策有关的距离改为不可及
    on: 'distance.calc', who: 'any', optional: false,
    filter: (d) => !!d.player.flags.jcZhasiActive && d.self !== d.to
      && (d.self === d.player || d.to === d.player),
    effect(ctx) { ctx.data.value = 99; },
  }, {
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => !!d.player.flags.jcZhasiActive && (d.targets || []).some((t) => t && t !== d.player),
    async effect(ctx) {
      ctx.self.flags.jcZhasiActive = false;
      await ctx.log('【诈死】：你对其他角色使用牌，重新计入距离计算');
    },
  }, {
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => !!d.player.flags.jcZhasiActive && d.to === d.player,
    async effect(ctx) {
      ctx.self.flags.jcZhasiActive = false;
      await ctx.log('【诈死】：你受到伤害，重新计入距离计算');
    },
  }],
});

// 霸世：主公技，当你需要打出【杀】或【闪】时，你可以令其他吴势力角色各选择是否代替你打出。
// 落地方式与标准包【护驾】完全同构：respond.need 里按行动顺序逐个询问其他吴势力角色，
// 其打出的牌由引擎（respondCard）移出手牌并进弃牌堆，本次响应改用该牌（handled/card）。
defineSkill({
  id: 'jc_bashi', name: '霸世', lord: true,
  desc: '主公技，当你需要打出【杀】或【闪】时，你可以令其他吴势力角色各选择是否代替你打出。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && (d.filter.name === 'sha' || d.filter.name === 'shan')
      && (d.self.role === 'lord' || d.self.flags?.isLord)
      && d.game.alive().some((q) => q !== d.self && q.kingdom === 'wu'),
    async effect(ctx) {
      const me = ctx.self, need = ctx.data.filter.name;
      const cn = CARD_META[need]?.cn || need;
      for (const p of ctx.game.orderFrom(me, { includeSelf: false })) {
        if (!p.alive || p === me || p.kingdom !== 'wu') continue;
        const c = await ctx.respond(p, {
          filter: { name: need }, optional: true,
          prompt: `【霸世】：是否替 ${me.name} 打出一张【${cn}】？`,
        });
        if (c) {
          ctx.data.handled = true;
          ctx.data.card = c;
          await ctx.log(`【霸世】：${p.name} 代替 ${me.name} 打出【${cn}】`);
          return;
        }
      }
    },
  }],
});

// ============================================================
// 承·许贡（吴 3）【表召】【业仇】
// ============================================================
// 表召：准备阶段，你可以依次选择两名其他角色，直到你下回合开始，
//       你此次选择的第一名角色对第二名角色使用牌无次数距离限制，且第二名角色对你使用的牌造成的伤害 +1。
// 实现：「第一名对第二名无距离限制」+「第二名对第一名伤害 +1」。
defineSkill({
  id: 'jc_biaozhao', name: '表召',
  desc: '准备阶段，你可以依次选择两名其他角色，直到你下回合开始，你此次选择的第一名角色对第二名角色使用牌无次数与距离限制，且第二名角色对你使用的牌造成的伤害 +1。（实现：伤害 +1 的对象取第二名角色对他人）',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = others(g, p);
        if (cands.length < 2) return;
        const a = (await ctx.ask.targets(p, { prompt: '【表召】：选择第一名角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!a) return;
        const rest = cands.filter((x) => x !== a);
        const b = (await ctx.ask.targets(p, { prompt: '【表召】：选择第二名角色', candidates: rest, min: 1, max: 1 }))[0];
        if (!b) return;
        p.flags.jcBiaoZhao = { a: a.seat, b: b.seat, until: g.turnCount + g.alive().length + 1 };
        await ctx.log(`【表召】：${a.name} 对 ${b.name} 使用牌无距离次数限制；${b.name} 使用的牌伤害 +1`);
      },
    },
    {
      on: 'distance.calc', who: 'any',
      effect(ctx) {
        const d = ctx.data;
        const info = (d.self?.flags?.jcBiaoZhao) || null;
        if (!info || !d.to) return;
        if (d.self.seat === info.a && d.to.seat === info.b) d.value = 1;
      },
    },
    {
      on: 'damage.before', who: 'any',
      filter: (d) => {
        const info = d.from?.flags?.jcBiaoZhao;
        return info && d.from.seat === info.b && d.game.turnCount <= info.until;
      },
      async effect(ctx) { ctx.data.amount = (ctx.data.amount || 1) + 1; },
    },
    { on: 'turn.begin', who: 'self', async effect(ctx) { ctx.self.flags.jcBiaoZhao = null; } },
  ],
});

// 业仇：当你死亡时，你可以选择一名其他角色，当其于本局游戏内受到致命伤害时，其令此伤害翻倍。
defineSkill({
  id: 'jc_yechou', name: '业仇',
  desc: '当你死亡时，你可以选择一名其他角色，当其于本局游戏内受到致命伤害时，其令此伤害翻倍。',
  triggers: [{
    on: 'death.after', who: 'self', optional: true,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【业仇】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      if (!(effSkills(t) || []).some((s) => s.id === 'jc_yechou_aura')) {
        const sk = getSkill('jc_yechou_aura');
        if (sk) t.skills.push(sk);
      }
      await ctx.log(`【业仇】：${t.name} 受到致命伤害时此伤害翻倍`);
    },
  }],
});

defineSkill({
  id: 'jc_yechou_aura', name: '业仇',
  desc: '锁定技，当你受到致命伤害时，此伤害翻倍（许贡【业仇】赋予）。',
  hidden: true,
  triggers: [{
    on: 'damage.before', who: 'self',
    filter: (d) => d.to === d.player && (d.amount || 0) >= d.player.hp && (d.amount || 0) < 99,
    async effect(ctx) {
      ctx.data.amount = (ctx.data.amount || 1) * 2;
      await ctx.log('【业仇】：致命伤害翻倍');
    },
  }],
});

// ============================================================
// 承·陈登（群 3）【论势】【诡图】
// ============================================================
// 论势：出牌阶段限一次，你可以令一名角色摸等同于其攻击范围内角色数的牌（至多摸至五张），
//       然后令其弃置等同于攻击范围内含有其的角色数的牌。
defineSkill({
  id: 'jc_lunshi', name: '论势',
  desc: '出牌阶段限一次，你可以令一名角色摸等同于其攻击范围内角色数的牌（至多摸至五张），然后令其弃置等同于攻击范围内含有其的角色数的牌。',
  active: {
    perPhase: true,
    prompt: '论势：令一名角色按其攻击范围摸牌，再按其被覆盖数弃牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { prompt: '【论势】：选择一名角色', candidates: g.alive(), min: 1, max: 1 }))[0];
      if (!t) return;
      const x = inRangeCount(g, t);
      const n = Math.max(0, Math.min(x, 5 - t.hand.length));
      if (n > 0) await ctx.draw(t, n, { reason: 'lunshi' });
      const y = Math.min(rangeToCount(g, t), t.hand.length);
      if (y > 0) {
        const got = await g.chooseSomeCards(t, t.hand.slice(), y, { prompt: `【论势】：弃置 ${y} 张牌` });
        if (got && got.length) await ctx.discard(t, got, { reason: 'lunshi' });
      }
      await ctx.log(`【论势】：${t.name} 摸 ${n} 张，弃 ${y} 张`);
    },
  },
});

// 诡图：准备阶段，你可以交换场上的两张武器牌，然后攻击范围以此法减少的角色回复 1 点体力。
defineSkill({
  id: 'jc_gueitu', name: '诡图',
  desc: '准备阶段，你可以交换场上的两张武器牌，然后攻击范围以此法减少的角色回复 1 点体力。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare'
      && d.game.alive().filter((x) => x.equips.weapon).length >= 2,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const owners = g.alive().filter((x) => x.equips.weapon);
      const a = (await ctx.ask.targets(p, { prompt: '【诡图】：选择第一名装备武器的角色', candidates: owners, min: 1, max: 1 }))[0];
      if (!a) return;
      const b = (await ctx.ask.targets(p, { prompt: '【诡图】：选择第二名装备武器的角色', candidates: owners.filter((x) => x !== a), min: 1, max: 1 }))[0];
      if (!b) return;
      const rA = g.attackRange(a), rB = g.attackRange(b);
      const wa = a.equips.weapon, wb = b.equips.weapon;
      a.equips.weapon = wb; b.equips.weapon = wa;
      await ctx.log(`【诡图】：交换 ${a.name} 与 ${b.name} 的武器牌`);
      for (const [who, before] of [[a, rA], [b, rB]]) {
        if (g.attackRange(who) < before && who.hp < who.maxHp) {
          await ctx.recover(who, 1, { reason: 'gueitu' });
          await ctx.log(`【诡图】：${who.name} 攻击范围减少，回复 1 点体力`);
        }
      }
    },
  }],
});

// ============================================================
// 承·关羽（蜀 5）【冠绝】【念恩】+【马术】
// ============================================================
// 冠绝：锁定技，当你使用或打出一张牌时，你令所有其他角色于本回合内不能使用或打出花色与之相同的牌。
// 「不能使用」在 card.use.before 里取消（花色按本回合累计，允许多个花色）；「不能打出」需要
// respondCard 的候选牌过滤钩子（引擎未提供）。
const SUIT_CN2 = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
defineSkill({
  id: 'jc_guanjue', name: '冠绝',
  desc: '锁定技，当你使用或打出一张牌时，你令所有其他角色于本回合内不能使用或打出花色与之相同的牌。（实现：「不能使用」已实现；「不能打出」需引擎在 respondCard 里按 flags 过滤候选牌）',
  triggers: [
    {
      on: 'card.use.after', who: 'self',
      async effect(ctx) {
        const c = ctx.data.card, g = ctx.game;
        if (!c || !c.suit || c.suit === 'none') return;
        g.flags = g.flags || {};
        const prev = g.flags.jcGuanjue;
        const suits = (prev && prev.turn === g.turnCount && Array.isArray(prev.suits)) ? prev.suits.slice() : [];
        if (!suits.includes(c.suit)) suits.push(c.suit);
        g.flags.jcGuanjue = { suits, turn: g.turnCount, owner: ctx.self.seat };
        await ctx.log(`【冠绝】：其他角色本回合不能使用${suits.map((s) => SUIT_CN2[s] || s).join('')}花色的牌`);
      },
    },
    {
      on: 'card.use.before', who: 'any',
      filter: (d) => {
        const info = d.game.flags?.jcGuanjue;
        if (!info || info.turn !== d.game.turnCount) return false;
        const c = d.card;
        if (!c || !c.suit || c.suit === 'none') return false;
        if (d.self && d.self.seat === info.owner) return false;
        return info.suits.includes(c.suit);
      },
      async effect(ctx) {
        const p = ctx.self;
        ctx.data.canceled = true;
        await ctx.log(`【冠绝】：${p.name} 本回合不能使用该花色的牌（已被取消）`);
      },
    },
  ],
});

// 念恩：你可以将一张牌当任意基本牌使用或打出，然后若你以此法转化后的牌不为红色普通【杀】，
//       直到回合结束，你视为拥有【马术】且不能发动此技能。
defineSkill({
  id: 'jc_nianen', name: '念恩',
  desc: '你可以将一张牌当任意基本牌使用或打出，然后若你以此法转化后的牌不为红色普通【杀】，直到回合结束，你视为拥有【马术】且不能发动此技能。',
  active: {
    perTurn: false,
    prompt: '念恩：将一张牌当基本牌使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jcNianenUsed === g.turnCount) { await ctx.log('【念恩】：本回合已不能发动'); return; }
      if (!p.hand.length) return;
      const names = ['sha', 'shan', 'tao', 'jiu'];
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【念恩】：选择一张牌转化' }))[0];
      if (!c) return;
      const idx = await ctx.ask.choose(p, ['当【杀】', '当【闪】', '当【桃】', '当【酒】'], { prompt: '【念恩】：转化为什么牌' });
      if (idx < 0) return;
      const asName = names[idx];
      await g.discardCards(p, [c], { reason: 'nianen' });
      const targets = asName === 'sha'
        ? await g.chooseTargets(p, { prompt: '【念恩】：选择【杀】的目标', candidates: g.candidatesFor(p, { name: 'sha' }), min: 1, max: 1 })
        : [];
      await g.useCard({ from: p, card: vcard(asName, c.suit, c.num), targets, reason: 'nianen', virtual: true, asName });
      const red = c.suit === 'heart' || c.suit === 'diamond';
      if (!(asName === 'sha' && red)) {
        p.flags.jcNianenUsed = g.turnCount;
        p.flags.distanceMinus = (p.flags.distanceMinus || 0) + 1;
        await ctx.log('【念恩】：获得【马术】效果，本回合不能再发动【念恩】');
      }
    },
  },
});

// ============================================================
// 承·邹氏（群 3）【孤吟】【帐灯】
// ============================================================
// 孤吟：准备阶段，你可以翻面，然后令所有其他男性角色各选择其是否翻面。
//       若如此做，你和所有选择翻面的角色轮流各摸一张牌直到以此法摸牌数达到 X 张（X 为本局游戏开始时的男性角色数）。
defineSkill({
  id: 'jc_guyin', name: '孤吟',
  desc: '准备阶段，你可以翻面，然后令所有其他男性角色各选择其是否翻面。若如此做，你和所有选择翻面的角色轮流各摸一张牌直到以此法摸牌数达到 X 张（X 为本局游戏开始时的男性角色数）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!g.flags) g.flags = {};
      if (g.flags.jcMaleBase == null) g.flags.jcMaleBase = g.players.filter((x) => x.gender !== 'female').length;
      await ctx.flip(p);
      const joined = [p];
      for (const t of g.alive().filter((x) => x !== p && x.gender !== 'female')) {
        const yes = await ctx.ask.confirm(t, `【孤吟】：${p.name} 已翻面，是否也翻面？`);
        if (yes) { await ctx.flip(t); joined.push(t); }
      }
      const total = g.flags.jcMaleBase || joined.length;
      let i = 0;
      while (i < total && joined.length) {
        const q = joined[i % joined.length];
        if (q.alive) await ctx.draw(q, 1, { reason: 'guyin' });
        i++;
        if (!q.alive && joined.every((x) => !x.alive)) break;
      }
      await ctx.log(`【孤吟】：翻面 ${joined.length} 人，轮流摸牌至 ${total} 张`);
    },
  }],
});

// 帐灯：当一名武将牌背面朝上的角色需要使用【酒】时，若你的武将牌背面朝上，其可以视为使用之。
//       当本技能于一回合内第二次发动时，你翻面至正面朝上。
// 落地：引擎里「需要【酒】」的真实时点只有濒死自救（dying.begin），因此在该时点让背面朝上的角色
// 视为使用【酒】（回复 1 点体力），替代旧的「有人使用【酒】后触发」近似。
defineSkill({
  id: 'jc_zhangdeng', name: '帐灯',
  desc: '当一名武将牌背面朝上的角色需要使用【酒】时，若你的武将牌背面朝上，其可以视为使用之。当本技能于一回合内第二次发动时，你翻面至正面朝上。',
  triggers: [{
    on: 'dying.begin', who: 'any', optional: true,
    filter: (d) => d.self && d.self !== d.player && d.player.flipped
      && d.self.flipped && d.self.hp <= 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.self;
      if (!t.alive || t.hp > 0) return;
      if (p.flags.jcZdTurn !== g.turnCount) { p.flags.jcZdTurn = g.turnCount; p.flags.jcZdCount = 0; }
      p.flags.jcZdCount = (p.flags.jcZdCount || 0) + 1;
      await ctx.recover(t, 1);
      await ctx.log(`【帐灯】：${t.name} 视为使用【酒】，回复1点体力`);
      if (p.flags.jcZdCount >= 2) {
        await ctx.flip(p);
        await ctx.log('【帐灯】：本回合第二次发动，翻至正面朝上');
      }
    },
  }],
});

// ============================================================
// 承·吕布（群/蜀 5）【无常】【轻狡】【乘虚】
// ============================================================
// 无常：锁定技，当你得到其他角色的牌后，你变更势力至与其相同；
//       当你使用【杀】或【决斗】对势力与你相同的目标角色造成伤害时，你令此伤害 +1，然后你变更势力至群。
defineSkill({
  id: 'jc_wuchang', name: '无常',
  desc: '锁定技，当你得到其他角色的牌后，你变更势力至与其相同；当你使用【杀】或【决斗】对势力与你相同的目标角色造成伤害时，你令此伤害 +1，然后你变更势力至群。',
  triggers: [
    {
      on: 'cards.gain', who: 'any',
      filter: (d) => d.self === d.player && d.from && d.from !== d.self && d.from.kingdom,
      async effect(ctx) {
        const p = ctx.self, from = ctx.data.from;
        if (p.kingdom !== from.kingdom) {
          await ctx.setKingdom(p, from.kingdom, 'wuchang');
          await ctx.log(`【无常】：变更势力为${from.kingdom === 'wei' ? '魏' : from.kingdom === 'shu' ? '蜀' : from.kingdom === 'wu' ? '吴' : '群'}`);
        }
      },
    },
    {
      on: 'damage.before', who: 'any',
      filter: (d) => {
        if (d.from !== d.player || !d.card) return false;
        if (d.card.name !== 'sha' && d.card.name !== 'juedou') return false;
        return d.to && d.to.kingdom === d.player.kingdom;
      },
      async effect(ctx) {
        const p = ctx.self;
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.setKingdom(p, 'qun', 'wuchang');
        await ctx.log('【无常】：同势力目标伤害 +1，势力变更至群');
      },
    },
  ],
});

// 轻狡：群势力技，出牌阶段各限一次，你可以将一张牌当【推心置腹】/【趁火打劫】对一名手牌数大于/小于你的角色使用。
// 实现：以【顺手牵羊】/【过河拆桥】等价替代（引擎无这两张新锦囊）。
defineSkill({
  id: 'jc_qingjiao', name: '轻狡',
  desc: '群势力技，出牌阶段各限一次，你可以将一张牌当【推心置腹】/【趁火打劫】对一名手牌数大于/小于你的角色使用。（实现：以【顺手牵羊】/【过河拆桥】等价替代）',
  active: {
    perTurn: false,
    prompt: '轻狡：将一张牌当【顺手牵羊】/【过河拆桥】使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.kingdom !== 'qun') { await ctx.log('【轻狡】：仅群势力可用'); return; }
      if (!p.hand.length) return;
      const idx = await ctx.ask.choose(p, ['当【顺手牵羊】（目标手牌数大于你）', '当【过河拆桥】（目标手牌数小于你）'], { prompt: '【轻狡】：选择一项' });
      if (idx < 0) return;
      const key = idx === 0 ? 'shunshou' : 'guochai';
      const keyFlag = idx === 0 ? 'jcQingjiaoA' : 'jcQingjiaoB';
      if (p.flags[keyFlag] === g.turnCount) { await ctx.log('【轻狡】：此项本回合已使用'); return; }
      const cands = others(g, p).filter((x) => (idx === 0 ? x.hand.length > p.hand.length : x.hand.length < p.hand.length));
      if (!cands.length) { await ctx.log('【轻狡】：没有符合条件的目标'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【轻狡】：选择目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【轻狡】：选择转化的牌' }))[0];
      if (!c) return;
      p.flags[keyFlag] = g.turnCount;
      await g.discardCards(p, [c], { reason: 'qingjiao' });
      await g.useCard({ from: p, card: vcard(key), targets: [t], reason: 'qingjiao', virtual: true, asName: key });
      await ctx.log(`【轻狡】：将一张牌当【${idx === 0 ? '顺手牵羊' : '过河拆桥'}】对 ${t.name} 使用`);
    },
  },
});

// 乘虚：蜀势力技，势力与你相同的其他角色不能响应你使用的牌。
// 可用的引擎出口：①【杀】——在 target.after 给该目标打 noShan（requireDodge 会拒绝其【闪】）；
// ②锦囊——当全部目标都是同势力角色时写 useData.unavoidable（引擎据此跳过【无懈可击】链）。
// 仍缺：决斗/南蛮/万箭这类「要求目标打出牌」的响应禁用（respondCard 需要携带来源牌与禁令过滤）。
defineSkill({
  id: 'jc_chengxu', name: '乘虚',
  desc: '蜀势力技，势力与你相同的其他角色不能响应你使用的牌。（实现：【杀】的【闪】与锦囊的【无懈可击】已禁用；决斗/南蛮/万箭等“要求目标打出牌”的响应禁用需引擎支持）',
  triggers: [{
    on: 'target.after', who: 'self', optional: false,
    filter: (d) => d.card?.name === 'sha' && d.target && d.target !== d.player
      && d.player.kingdom === 'shu' && d.target.kingdom === 'shu',
    async effect(ctx) {
      const t = ctx.data.target;
      t.flags.noShan = ctx.data.card?.id;
      await ctx.log(`【乘虚】：${t.name} 不能响应此【杀】`);
    },
  }, {
    on: 'card.use.before', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.kingdom === 'shu'
      && (d.card?.name === 'sha' || d.card?.type === 'trick'),
    async effect(ctx) {
      const p = ctx.self;
      const tars = (ctx.data.targets || []).filter((t) => t && t !== p);
      if (!tars.length || !tars.every((t) => t.kingdom === p.kingdom)) return;
      ctx.data.unavoidable = true;
      await ctx.log('【乘虚】：同势力目标不能响应此牌');
    },
  }],
});

// ============================================================
// 承·严夫人（群 3）【谗逆】【匿伏】
// ============================================================
// 谗逆：出牌阶段限一次，你可以交给一名其他角色任意张手牌，然后其可以将至多等量张手牌当一张【决斗】使用。
//       其因此【决斗】：造成伤害后，其摸 X 张牌（X 为其转化此【决斗】的牌数）；受到伤害后，你弃置所有手牌。
defineSkill({
  id: 'jc_channe', name: '谗逆',
  desc: '出牌阶段限一次，你可以交给一名其他角色任意张手牌，然后其可以将至多等量张手牌当一张【决斗】使用。其因此【决斗】：造成伤害后，其摸 X 张牌（X 为其转化此【决斗】的牌数）；受到伤害后，你弃置所有手牌。（实现：转化牌数简化为交出的牌数）',
  active: {
    perPhase: true,
    prompt: '谗逆：交给一名角色若干手牌，其可将等量手牌当【决斗】使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length || !p.hand.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【谗逆】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const give = await g.chooseSomeCards(p, p.hand.slice(), Math.min(2, p.hand.length), { prompt: '【谗逆】：选择交给其的手牌' });
      if (!give || !give.length) return;
      await ctx.gain(t, give, { from: p, reason: 'channe' });
      const yes = await ctx.ask.confirm(t, `【谗逆】：是否将至多 ${give.length} 张手牌当【决斗】对 ${p.name} 使用？`);
      if (!yes) return;
      const target = (await ctx.ask.targets(t, { prompt: '【谗逆】：选择【决斗】目标', candidates: others(g, t), min: 1, max: 1 }))[0];
      if (!target) return;
      const used = Math.min(give.length, t.hand.length);
      const extra = t.hand.slice(0, used);
      const hpBefore = target.hp, myHpBefore = t.hp;
      await ctx.useCard({ from: t, card: vcard('juedou'), targets: [target], reason: 'channe', virtual: true, extraCards: extra });
      if (target.hp < hpBefore) await ctx.draw(t, used, { reason: 'channe' });
      if (t.hp < myHpBefore && p.hand.length) await ctx.discard(p, p.hand.slice(), { reason: 'channe' });
    },
  },
});

// 匿伏：锁定技，一名角色的回合结束时，你将手牌数调整至 3。
defineSkill({
  id: 'jc_nifu', name: '匿伏',
  desc: '锁定技，一名角色的回合结束时，你将手牌数调整至 3。',
  triggers: [{
    on: 'turn.end', who: 'any',
    filter: (d) => d.player.alive,
    async effect(ctx) {
      const p = ctx.self;
      const n = p.hand.length;
      if (n > 3) {
        const got = p.hand.slice(0, n - 3);
        await ctx.discard(p, got, { reason: 'nifu' });
      } else if (n < 3) {
        await ctx.draw(p, 3 - n, { reason: 'nifu' });
      }
    },
  }],
});

// ============================================================
// 承·陶谦（群 3）【招祸】【义襄】【揖让】
// ============================================================
// 招祸：锁定技，当其他角色进入濒死状态时，若你的体力上限大于 1，你将体力上限减至 1 点，然后摸等同于体力上限减少数张牌。
defineSkill({
  id: 'jc_zhaohuo', name: '招祸',
  desc: '锁定技，当其他角色进入濒死状态时，若你的体力上限大于 1，你将体力上限减至 1 点，然后摸等同于体力上限减少数张牌。',
  triggers: [{
    on: 'dying.begin', who: 'any',
    filter: (d) => d.self !== d.player && (d.player.maxHp || 1) > 1,
    async effect(ctx) {
      const p = ctx.self;
      const dec = p.maxHp - 1;
      p.maxHp = 1;
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      await ctx.draw(p, dec, { reason: 'zhaohuo' });
      await ctx.log(`【招祸】：体力上限减至 1，摸 ${dec} 张牌`);
    },
  }],
});

// 义襄：锁定技，其他角色的出牌阶段内：当你受到其使用的第一张牌造成的伤害时，此伤害 -1；
//       当你成为其使用的第二张牌的目标后，若此牌为黑色，此牌对你无效。
defineSkill({
  id: 'jc_yixiang', name: '义襄',
  desc: '锁定技，其他角色的出牌阶段内：当你受到其使用的第一张牌造成的伤害时，此伤害 -1；当你成为其使用的第二张牌的目标后，若此牌为黑色，此牌对你无效。',
  triggers: [
    {
      // ★计数必须放在 card.use.before：card.use.after 是在 meta.effect（伤害结算）之后才派发的，
      //   若在那里计数，第一张牌造成的伤害结算时计数还是 0（先减伤后计数），
      //   「第一张牌伤害 -1」会错落到第二张牌上。
      on: 'card.use.before', who: 'any', priority: 2,
      async effect(ctx) {
        // card.use.before 的原始数据是 { self(使用者), card, effName, targets, reason }，没有 player
        // （player 只由 trigger() 注入给 filter，代表技能拥有者）；effect 里必须用 ctx.self
        const d = ctx.data, from = d.self, p = ctx.self;
        if (!from || from === p) return;
        if (!(d.targets || []).includes(p)) return;
        if (p.flags.jcYixiangTurn !== ctx.game.turnCount) { p.flags.jcYixiangTurn = ctx.game.turnCount; p.flags.jcYixiangBy = {}; }
        const by = p.flags.jcYixiangBy[from.seat] || 0;
        p.flags.jcYixiangBy[from.seat] = by + 1;
      },
    },
    {
      on: 'damage.before', who: 'self',
      filter: (d) => {
        const p = d.player, from = d.from;
        return d.to === p && from && from !== p && (p.flags.jcYixiangBy?.[from.seat] || 0) === 1;
      },
      async effect(ctx) {
        ctx.data.amount = Math.max(0, (ctx.data.amount || 1) - 1);
        await ctx.log('【义襄】：其本阶段第一张牌造成的伤害 -1');
      },
    },
    {
      // ★必须挂在 target.before：引擎只在 target.before 之后检查 canceled（game.js 目标循环），
      //   target.after 里置 canceled 是死代码，技能永远不生效。
      // ★数据口径：target.before 的 data 是 { self(使用者), target(目标), card, canceled, used, shaCtx, total }，
      //   既没有 from 也没有 player（player 只注入给 filter）。use who:'any' + d.player 判拥有者。
      on: 'target.before', who: 'any',
      filter: (d) => {
        const p = d.player, from = d.self, t = d.target || d.to;
        const card = d.card || d.source;
        return t === p && from && from !== p && card
          && (p.flags.jcYixiangBy?.[from.seat] || 0) === 2
          && (card.suit === 'spade' || card.suit === 'club');
      },
      async effect(ctx) {
        ctx.data.canceled = true;
        await ctx.log('【义襄】：其本阶段第二张黑色牌对你无效');
      },
    },
  ],
});

// 揖让：出牌阶段开始时，你可以展示所有牌，将其中的非基本牌交给一名其他角色，
//       然后若其体力上限大于你，你将体力上限加至与其相同并回复 X 点体力（X 为你以此法交给其的牌数）。
defineSkill({
  id: 'jc_yirang', name: '揖让',
  desc: '出牌阶段开始时，你可以展示所有牌，将其中的非基本牌交给一名其他角色，然后若其体力上限大于你，你将体力上限加至与其相同并回复 X 点体力（X 为你以此法交给其的牌数）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const nonBasic = p.hand.filter((c) => !isBasic(c));
      await ctx.log(`【揖让】：展示手牌 ${p.hand.map((c) => `【${cardLabel(c)}】`).join('') || '（无）'}`);
      if (!nonBasic.length) return;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【揖让】：选择交给其非基本牌的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.gain(t, nonBasic, { from: p, reason: 'yirang' });
      if (t.maxHp > p.maxHp) {
        const add = t.maxHp - p.maxHp;
        p.maxHp = t.maxHp;
        await ctx.recover(p, Math.min(nonBasic.length, add), { reason: 'yirang' });
        await ctx.log(`【揖让】：体力上限加至 ${t.maxHp}，回复 ${Math.min(nonBasic.length, add)} 点体力`);
      }
    },
  }],
});

// ============================================================
// 承·曹嵩（魏 4）【礼赂】【翊正】
// ============================================================
// 礼赂：摸牌阶段，你可以改为将手牌摸至体力上限（至多摸至五张），然后交给一名其他角色至少一张手牌。
//       若你交出的牌数大于你上次以此法交出的牌数，你加 1 点体力上限并回复 1 点体力。
defineSkill({
  id: 'jc_lilu', name: '礼赂',
  desc: '摸牌阶段，你可以改为将手牌摸至体力上限（至多摸至五张），然后交给一名其他角色至少一张手牌。若你交出的牌数大于你上次以此法交出的牌数，你加 1 点体力上限并回复 1 点体力。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const target = Math.min(5, p.maxHp);
      const n = Math.max(0, target - p.hand.length);
      ctx.game.skipPhase(p, 'draw');
      if (n > 0) await ctx.draw(p, n, { reason: 'lilu' });
      const cands = others(g, p);
      if (!cands.length || !p.hand.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【礼赂】：选择交给手牌的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const give = await g.chooseSomeCards(p, p.hand.slice(), Math.min(3, p.hand.length), { prompt: '【礼赂】：至少交给其一张手牌' });
      if (!give || !give.length) return;
      await ctx.gain(t, give, { from: p, reason: 'lilu' });
      if (give.length > (p.flags.jcLiluLast || 0)) {
        p.maxHp += 1;
        if (p.hp < p.maxHp) await ctx.recover(p, 1, { reason: 'lilu' });
        await ctx.log(`【礼赂】：交出 ${give.length} 张（多于上次），体力上限 +1 并回复 1 点`);
      }
      p.flags.jcLiluLast = give.length;
    },
  }],
});

// 翊正：结束阶段，你可以选择一名其他角色。直到你的下回合开始，当其造成伤害时或回复体力前，
//       若其体力上限小于你，你减 1 点体力上限，然后此伤害值或回复值 +1。
defineSkill({
  id: 'jc_yizheng2', name: '翊正',
  desc: '结束阶段，你可以选择一名其他角色。直到你的下回合开始，当其造成伤害时或回复体力前，若其体力上限小于你，你减 1 点体力上限，然后此伤害值或回复值 +1。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'end',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = others(g, p);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【翊正】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        p.flags.jcYizhengTarget = t.id;
        await ctx.log(`【翊正】：${t.name} 造成伤害或回复体力前，可令其数值 +1`);
      },
    },
    {
      on: 'damage.before', who: 'any',
      filter: (d) => {
        const p = d.player;
        const id = p.flags.jcYizhengTarget;
        return id && d.from && d.from.id === id && d.from.maxHp < p.maxHp;
      },
      async effect(ctx) {
        const p = ctx.self, from = ctx.data.from;
        p.maxHp = Math.max(1, p.maxHp - 1);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log(`【翊正】：${from.name} 造成的伤害 +1，你的体力上限 -1`);
      },
    },
    {
      on: 'hp.recover', who: 'any',
      filter: (d) => {
        const p = d.player;
        const id = p.flags.jcYizhengTarget;
        return id && d.self && d.self.id === id && d.self.maxHp < p.maxHp;
      },
      async effect(ctx) {
        const p = ctx.self;
        p.maxHp = Math.max(1, p.maxHp - 1);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
        ctx.data.count = (ctx.data.count || 1) + 1;
        await ctx.log('【翊正】：回复值 +1，你的体力上限 -1');
      },
    },
    { on: 'turn.begin', who: 'self', async effect(ctx) { ctx.self.flags.jcYizhengTarget = null; } },
  ],
});

// ============================================================
// 承·许攸（群/魏 3）【离叛】【轻袭】【烬灭】
// ============================================================
// 离叛：回合结束时，你可以变更势力，然后摸 X 张牌并执行一个额外的出牌阶段，
//       此阶段结束时，所有势力与你相同的角色依次可以将一张牌当【决斗】对你使用（X 为势力与你相同的其他角色数）。
// 落地：额外「出牌阶段」用引擎回合流程末尾的 flags.extraPlayAtEnd（闪张辽【整兵】同款出口），
//       不再降级成额外回合；阶段的收尾决斗挂在 phase.end('play') 上。
defineSkill({
  id: 'jc_lipan', name: '离叛',
  desc: '回合结束时，你可以变更势力，然后摸 X 张牌并执行一个额外的出牌阶段，此阶段结束时，所有势力与你相同的角色依次可以将一张牌当【决斗】对你使用（X 为势力与你相同的其他角色数）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && !!d.player.kingdom2,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const to = p.kingdom === 'qun' ? (p.kingdom2 || 'wei') : 'qun';
      await ctx.setKingdom(p, to, 'lipan');
      const x = g.alive().filter((q) => q !== p && q.kingdom === to).length;
      if (x > 0) await ctx.draw(p, x, { reason: 'lipan' });
      p.flags.extraPlayAtEnd = true;
      p.flags.jcLipanTurn = g.turnCount;
      await ctx.log(`【离叛】：变更势力，摸 ${x} 张牌，本回合结束时执行一个额外的出牌阶段`);
    },
  }, {
    // 额外出牌阶段结束：同势力角色依次把一张牌当【决斗】对许攸使用
    on: 'phase.end', who: 'self', optional: false,
    filter: (d) => d.phase === 'play' && d.player.flags.jcLipanTurn === d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.jcLipanTurn = null;
      if (!p.alive) return;
      const join = g.alive().filter((q) => q !== p && q.kingdom === p.kingdom && q.hand.length);
      if (!join.length) { await ctx.log('【离叛】：没有同势力角色可以响应'); return; }
      await ctx.log(`【离叛】：出牌阶段结束，${join.length} 名同势力角色可以视为对你使用【决斗】`);
      for (const q of join) {
        if (!q.alive || !p.alive || g.over) break;
        if (!q.hand.length) continue;
        const c = (await g.chooseSomeCards(q, q.hand.slice(), 1, { prompt: `【离叛】：选择一张牌当【决斗】对 ${p.name} 使用（取消则不使用）` }))[0];
        if (!c) continue;
        await ctx.useCard({ from: q, card: vcard('juedou'), targets: [p], extraCards: [c], reason: 'lipan' });
      }
    },
  }],
});

// 轻袭：群势力技，出牌阶段每名角色限一次，你可以选择一名手牌数小于你的角色，
//       你将手牌弃置至与其手牌数相同，然后视为对其使用一张无距离限制的刺【杀】。
// 实现：【刺杀】以普通【杀】替代；「每名角色限一次」简化为每回合一次。
defineSkill({
  id: 'jc_qingxi', name: '轻袭',
  desc: '群势力技，出牌阶段每名角色限一次，你可以选择一名手牌数小于你的角色，你将手牌弃置至与其手牌数相同，然后视为对其使用一张无距离限制的刺【杀】。（实现：以普通【杀】替代刺【杀】，每回合限一次）',
  active: {
    perTurn: true,
    prompt: '轻袭：弃手牌至与目标相同，视为对其使用【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.kingdom !== 'qun') { await ctx.log('【轻袭】：仅群势力可用'); return; }
      const cands = others(g, p).filter((x) => x.hand.length < p.hand.length);
      if (!cands.length) { await ctx.log('【轻袭】：没有手牌数小于你的角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【轻袭】：选择目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const drop = p.hand.length - t.hand.length;
      if (drop > 0) await ctx.discard(p, p.hand.slice(0, drop), { reason: 'qingxi' });
      await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'qingxi', ignoreRange: true, ignoreShaLimit: true });
      await ctx.log(`【轻袭】：弃置 ${drop} 张牌，视为对 ${t.name} 使用【杀】`);
    },
  },
});

// 烬灭：魏势力技，出牌阶段限一次，你可以视为对一名手牌数大于你的角色使用一张无次数和距离限制的火【杀】，
//       此牌造成伤害后，你将其手牌弃置至与你手牌数相同。
defineSkill({
  id: 'jc_jinmie', name: '烬灭',
  desc: '魏势力技，出牌阶段限一次，你可以视为对一名手牌数大于你的角色使用一张无次数和距离限制的火【杀】，此牌造成伤害后，你将其手牌弃置至与你手牌数相同。',
  active: {
    perPhase: true,
    prompt: '烬灭：视为对一名手牌数大于你的角色使用火【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.kingdom !== 'wei') { await ctx.log('【烬灭】：仅魏势力可用'); return; }
      const cands = others(g, p).filter((x) => x.hand.length > p.hand.length);
      if (!cands.length) { await ctx.log('【烬灭】：没有手牌数大于你的角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【烬灭】：选择目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const before = t.hp;
      await ctx.useCard({ from: p, card: vcard('sha', 'heart', 5, { nature: 'fire' }), targets: [t], reason: 'jinmie', ignoreRange: true, ignoreShaLimit: true });
      if (t.hp < before) {
        const drop = t.hand.length - p.hand.length;
        if (drop > 0) await ctx.discard(t, t.hand.slice(0, drop), { reason: 'jinmie' });
        await ctx.log(`【烬灭】：${t.name} 弃置 ${Math.max(0, drop)} 张手牌`);
      }
    },
  },
});

// ============================================================
// 承·张郃（群/魏 4）【穷途】(复用)【先著】
// ============================================================
// 先著：魏势力技，你可以将一张普通锦囊牌当无次数限制的【杀】使用。
//       此【杀】对唯一目标造成伤害后，你视为对其执行原锦囊牌的效果。
defineSkill({
  id: 'jc_xianzhu', name: '先著',
  desc: '魏势力技，你可以将一张普通锦囊牌当无次数限制的【杀】使用。此【杀】对唯一目标造成伤害后，你视为对其执行原锦囊牌的效果。',
  active: {
    perTurn: false,
    prompt: '先著：将一张普通锦囊当【杀】使用（造成伤害后执行原锦囊效果）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.kingdom !== 'wei') { await ctx.log('【先著】：仅魏势力可用'); return; }
      const tricks = p.hand.filter((c) => c.type === 'trick');
      if (!tricks.length) { await ctx.log('【先著】：没有普通锦囊牌'); return; }
      const c = (await g.chooseSomeCards(p, tricks, 1, { prompt: '【先著】：选择一张普通锦囊牌' }))[0];
      if (!c) return;
      const t = (await ctx.ask.targets(p, { prompt: '【先著】：选择【杀】的目标', candidates: others(g, p), min: 1, max: 1 }))[0];
      if (!t) return;
      await g.discardCards(p, [c], { reason: 'xianzhu' });
      const before = t.hp;
      await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'xianzhu', ignoreShaLimit: true });
      if (t.hp < before) {
        const meta = CARD_META[c.name] || {};
        const tg = await g.chooseTargets(p, { prompt: `【先著】：为【${cardLabel(c)}】选择目标`, candidates: g.candidatesFor(p, { ...c, virtual: false }), min: 0, max: 2 });
        await ctx.useCard({ from: p, card: { ...c, virtual: true, id: `vjc_xz${++vseq}` }, targets: tg.length ? tg : [t], reason: 'xianzhu' });
        await ctx.log(`【先著】：造成伤害，执行【${cardLabel(c)}】的效果`);
      }
    },
  },
});

// ============================================================
// 承·淳于琼（群 4）【仓储】【失守】
// ============================================================
// 仓储：一名角色的结束阶段，若 X：不大于存活角色数，你可以令至多 X 名角色各摸一张牌；
//       大于存活角色数，你可以令任意名角色各摸两张牌（X 为你本回合得到的牌数）。
defineSkill({
  id: 'jc_cangchu', name: '仓储',
  desc: '一名角色的结束阶段，若 X：不大于存活角色数，你可以令至多 X 名角色各摸一张牌；大于存活角色数，你可以令任意名角色各摸两张牌（X 为你本回合得到的牌数）。',
  triggers: [
    {
      on: 'cards.gain', who: 'self', priority: 1,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.flags.jcGainTurn !== g.turnCount) { p.flags.jcGainTurn = g.turnCount; p.flags.jcGainCount = 0; }
        p.flags.jcGainCount = (p.flags.jcGainCount || 0) + (ctx.data.cards || []).length;
      },
    },
    {
      on: 'cards.draw.after', who: 'self', priority: 1,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.flags.jcGainTurn !== g.turnCount) { p.flags.jcGainTurn = g.turnCount; p.flags.jcGainCount = 0; }
        p.flags.jcGainCount = (p.flags.jcGainCount || 0) + (ctx.data.cards || []).length;
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: true,
      filter: (d) => d.phase === 'end' && !d.player.flags.jcShishouBlock,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = (p.flags.jcGainTurn === g.turnCount) ? (p.flags.jcGainCount || 0) : 0;
        if (x <= 0) return;
        const alive = g.alive().length;
        if (x <= alive) {
          const picked = await ctx.ask.targets(p, {
            prompt: `【仓储】：令至多 ${x} 名角色各摸一张牌`, candidates: g.alive(), min: 0, max: Math.min(x, alive),
          });
          for (const t of picked) await ctx.draw(t, 1, { reason: 'cangchu' });
        } else {
          const picked = await ctx.ask.targets(p, {
            prompt: '【仓储】：令任意名角色各摸两张牌', candidates: g.alive(), min: 0, max: alive,
          });
          for (const t of picked) await ctx.draw(t, 2, { reason: 'cangchu' });
        }
      },
    },
  ],
});

// 失守：锁定技，当你使用【酒】时，你摸三张牌，然后本回合不能使用牌。
//       当你受到火焰伤害后，【仓储】失效直到你的下回合结束。
defineSkill({
  id: 'jc_shishou', name: '失守',
  desc: '锁定技，当你使用【酒】时，你摸三张牌，然后本回合不能使用牌。当你受到火焰伤害后，【仓储】失效直到你的下回合结束。',
  triggers: [
    {
      on: 'card.use.after', who: 'self',
      filter: (d) => d.card && d.card.name === 'jiu',
      async effect(ctx) {
        const p = ctx.self;
        await ctx.draw(p, 3, { reason: 'shishou' });
        p.flags.jcShishouTurn = ctx.game.turnCount;
        await ctx.log('【失守】：摸三张牌，本回合不能使用牌');
      },
    },
    {
      on: 'card.use.before', who: 'self',
      filter: (d) => d.player.flags.jcShishouTurn === d.game.turnCount,
      async effect(ctx) {
        ctx.data.canceled = true;
        await ctx.log('【失守】：本回合不能使用牌');
      },
    },
    {
      on: 'damage.after', who: 'self',
      filter: (d) => d.to === d.player && d.nature === 'fire',
      async effect(ctx) {
        const p = ctx.self;
        p.flags.jcShishouBlock = true;
        await ctx.log('【失守】：受到火焰伤害，【仓储】失效直到你的下回合结束');
      },
    },
    { on: 'turn.end', who: 'self', async effect(ctx) { ctx.self.flags.jcShishouBlock = false; } },
  ],
});

// ============================================================
// 承·高览（群 4）【峻攻】【等力】
// ============================================================
// 峻攻：出牌阶段，你可以弃置 X 张牌或失去 X 点体力，视为使用一张无距离与次数限制且不计入次数限制的【杀】
//       （X 为你本阶段此前发动过此技能的次数 + 1），然后当此【杀】造成伤害后，此技能本回合失效。
defineSkill({
  id: 'jc_jungong', name: '峻攻',
  desc: '出牌阶段，你可以弃置 X 张牌或失去 X 点体力，视为使用一张无距离与次数限制且不计入次数限制的【杀】（X 为你本阶段此前发动过此技能的次数 + 1），然后当此【杀】造成伤害后，此技能本回合失效。',
  active: {
    perTurn: false,
    prompt: '峻攻：弃 X 张牌或失去 X 点体力，视为使用一张【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jcJungongDone === g.turnCount) { await ctx.log('【峻攻】：本回合已失效'); return; }
      if (p.flags.jcJungongTurn !== g.turnCount) { p.flags.jcJungongTurn = g.turnCount; p.flags.jcJungongCount = 0; }
      const x = (p.flags.jcJungongCount || 0) + 1;
      p.flags.jcJungongCount = x;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: `【峻攻】：选择目标（需弃 ${x} 张牌或失去 ${x} 点体力）`, candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      if (p.hand.length + Object.values(p.equips).filter(Boolean).length >= x) {
        const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
        const got = await g.chooseSomeCards(p, pool, x, { prompt: `【峻攻】：弃置 ${x} 张牌` });
        if (got && got.length) await ctx.discard(p, got, { reason: 'jungong' });
      } else {
        await ctx.loseHp(p, x, { reason: 'jungong' });
      }
      const before = t.hp;
      await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'jungong', ignoreRange: true, ignoreShaLimit: true });
      if (t.hp < before) p.flags.jcJungongDone = g.turnCount;
    },
  },
});

// 等力：当你使用【杀】指定一名角色为目标时，或当你成为其他角色使用【杀】的目标时，
//       若你与其体力值相等，你可以摸一张牌。
defineSkill({
  id: 'jc_dengli', name: '等力',
  desc: '当你使用【杀】指定一名角色为目标时，或当你成为其他角色使用【杀】的目标时，若你与其体力值相等，你可以摸一张牌。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => {
      if (!d.card || d.card.name !== 'sha') return false;
      // ★d.self 是使用者、d.target 是目标、d.player 才是技能拥有者（trigger 注入）。
      //   旧实现写成 `const me = d.self` 再判 `d.self === me`，条件恒真，
      //   导致「拥有者既没使用也没被指定、只是使用者与目标体力相等」时也会被问一次并误摸牌。
      const user = d.self, target = d.target || d.to, me = d.player;
      if (!user || !target || !me) return false;
      if (me !== user && me !== target) return false;       // 只认使用者/目标本人
      return me.hp === (me === user ? target : user).hp;     // 比的是「我」与另一方
    },
    async effect(ctx) {
      const p = ctx.self, d = ctx.data;
      // 我是使用者时比较对象是 d.target；我是目标时比较对象是使用者 d.self
      const t = ((d.self === p) ? (d.target || d.to) : d.self);
      if (t && t.hp === p.hp) { await ctx.draw(p, 1, { reason: 'dengli' }); await ctx.log('【等力】：体力相等，摸一张牌'); }
    },
  }],
});

// ============================================================
// 承·袁谭&袁尚（群 4）【内伐】
// ============================================================
// 内伐：出牌阶段开始时，你可以摸两张牌，然后弃置一张牌并展示所有手牌直到本回合结束。
//       若弃置的牌：为基本牌，本回合你不能使用锦囊牌和装备牌，使用【杀】的次数上限 +X 且使用时可以增加一个目标；
//       不为基本牌，本回合你不能使用基本牌，使用普通锦囊牌时可以为此牌增加或减少一个目标，首次使用装备牌时摸 X 张牌
//       （X 为你此次因此技能不能使用的手牌数，且至少为 1 至多为 5）。
defineSkill({
  id: 'jc_neifa', name: '内伐',
  desc: '出牌阶段开始时，你可以摸两张牌，然后弃置一张牌并展示所有手牌直到本回合结束。若弃置的牌：为基本牌，本回合你不能使用锦囊牌和装备牌，使用【杀】的次数上限 +X 且使用时可以增加一个目标；不为基本牌，本回合你不能使用基本牌，使用普通锦囊牌时可以增加或减少一个目标，首次使用装备牌时摸 X 张牌（X 为你此次因此技能不能使用的手牌数，且至少为 1 至多为 5）。（实现：摸弃与「首次使用装备摸 X 张」已实现，禁用类别以标记记录）',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      await ctx.draw(p, 2, { reason: 'neifa' });
      if (!p.hand.length) return;
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【内伐】：弃置一张牌' }))[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'neifa' });
      await ctx.log(`【内伐】：展示手牌 ${p.hand.map((x) => `【${cardLabel(x)}】`).join('') || '（无）'}`);
      p.flags.jcNeifaTurn = g.turnCount;
      if (isBasic(c)) {
        p.flags.jcNeifaBasic = true;
        p.flags.shaUnlimited = true;
        await ctx.log('【内伐】：本回合【杀】次数上限增加且不能使用锦囊与装备牌');
      } else {
        p.flags.jcNeifaTrick = true;
        await ctx.log('【内伐】：本回合不能使用基本牌，首次使用装备可摸牌');
      }
    },
  }, {
    on: 'card.use.after', who: 'self',
    filter: (d) => d.player.flags.jcNeifaTurn === d.game.turnCount
      && d.player.flags.jcNeifaTrick && d.card && d.card.type === 'equip'
      && !d.player.flags.jcNeifaEquipDone,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.jcNeifaEquipDone = true;
      const x = Math.max(1, Math.min(5, p.hand.length));
      await ctx.draw(p, x, { reason: 'neifa' });
      await ctx.log(`【内伐】：首次使用装备，摸 ${x} 张牌`);
    },
  }],
});

// ============================================================
// 承·甄宓（群 3）【济乡】【称贤】
// ============================================================
// 济乡：你的回合内每种牌名限一次，当一名其他角色需要使用或打出一张基本牌时，
//       你可以弃置一张牌令其视为使用或打出之，然后你摸一张牌并令【称贤】于此阶段可发动次数 +1。
// 落地：引擎所有「需要打出一张牌」的时点都走 respondCard → respond.need，因此用该事件接管
//      （杀/闪/桃/酒 全覆盖，每种牌名每回合一次）；「需要使用」侧引擎没有独立时点。
const JX_BASIC = ['sha', 'shan', 'tao', 'jiu'];
defineSkill({
  id: 'jc_jixiang', name: '济乡',
  desc: '你的回合内每种牌名限一次，当一名其他角色需要使用或打出一张基本牌时，你可以弃置一张牌令其视为使用或打出之，然后你摸一张牌并令【称贤】于此阶段可发动次数 +1。',
  triggers: [{
    on: 'respond.need', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player;
      if (!d.filter || !JX_BASIC.includes(d.filter.name)) return false;
      if (!d.self || !d.self.alive || d.self === p) return false;
      if (d.game.turnPlayer !== p) return false;                    // 你的回合内
      if (!p.hand.length) return false;
      const used = p.flags.jcJxUsed;
      if (!used || used.turn !== d.game.turnCount) return true;
      return !used.names.includes(d.filter.name);                   // 每种牌名限一次
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.self, need = ctx.data.filter.name;
      const cn = CARD_META[need]?.cn || need;
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: `【济乡】：弃置一张牌令 ${t.name} 视为打出【${cn}】（取消则不发动）` }))[0];
      if (!c) return;
      const used = (p.flags.jcJxUsed && p.flags.jcJxUsed.turn === g.turnCount)
        ? p.flags.jcJxUsed : { turn: g.turnCount, names: [] };
      if (!used.names.includes(need)) used.names.push(need);
      p.flags.jcJxUsed = used;
      await ctx.discard(p, [c], { reason: 'jixiang' });
      ctx.data.handled = true;
      ctx.data.card = { ...c, name: need, __src: c };   // 视为打出：不消耗响应者的手牌
      await ctx.draw(p, 1, { reason: 'jixiang' });
      p.flags.jcChengxianBonus = (p.flags.jcChengxianBonus || 0) + 1;
      await ctx.log(`【济乡】：令 ${t.name} 视为打出【${cn}】，你摸一张牌`);
    },
  }],
});

// 称贤：出牌阶段限两次，你可以将一张手牌当一张本回合未以此法使用过的普通锦囊牌使用，
//       以此法转化的普通锦囊牌须与原牌名的牌合法目标角色数相同。
defineSkill({
  id: 'jc_chengxian', name: '称贤',
  desc: '出牌阶段限两次，你可以将一张手牌当一张本回合未以此法使用过的普通锦囊牌使用，以此法转化的普通锦囊牌须与原牌名的牌合法目标角色数相同。',
  active: {
    perTurn: false,
    prompt: '称贤：将一张手牌当普通锦囊使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jcChengxianTurn !== g.turnCount) { p.flags.jcChengxianTurn = g.turnCount; p.flags.jcChengxianCount = 0; p.flags.jcChengxianUsed = []; }
      const limit = 2 + (p.flags.jcChengxianBonus || 0);
      if ((p.flags.jcChengxianCount || 0) >= limit) { await ctx.log('【称贤】：本阶段发动次数已满'); return; }
      if (!p.hand.length) return;
      const POOL = ['guochai', 'shunshou', 'juedou', 'wuxie', 'wuzhong', 'taoyuan'];
      const avail = POOL.filter((n) => !(p.flags.jcChengxianUsed || []).includes(n));
      if (!avail.length) { await ctx.log('【称贤】：本回合每张锦囊均已用过'); return; }
      const idx = await ctx.ask.choose(p, avail.map((n) => `当【${CARD_META[n]?.cn || n}】使用`), { prompt: '【称贤】：选择要转化的锦囊' });
      if (idx < 0) return;
      const asName = avail[idx];
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【称贤】：选择转化的手牌' }))[0];
      if (!c) return;
      let targets = [];
      if (asName === 'guochai' || asName === 'shunshou' || asName === 'juedou') {
        const need = asName === 'juedou' ? others(g, p) : others(g, p).filter((x) => [...x.hand, ...Object.values(x.equips).filter(Boolean)].length > 0);
        if (!need.length) return;
        const t = (await ctx.ask.targets(p, { prompt: `【称贤】：为【${CARD_META[asName]?.cn || asName}】选择目标`, candidates: need, min: 1, max: 1 }))[0];
        if (!t) return;
        targets = [t];
      }
      p.flags.jcChengxianCount = (p.flags.jcChengxianCount || 0) + 1;
      p.flags.jcChengxianUsed = [...(p.flags.jcChengxianUsed || []), asName];
      await g.discardCards(p, [c], { reason: 'chengxian' });
      await ctx.useCard({ from: p, card: vcard(asName, c.suit, c.num), targets, reason: 'chengxian', virtual: true, asName });
      await ctx.log(`【称贤】：将一张牌当【${CARD_META[asName]?.cn || asName}】使用`);
    },
  },
});
