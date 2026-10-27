// 江山如故·起（pack = 'jsg_qi'）技能实现
// 数据见 src/data/jsg_qi.js；技能 id 前缀 `jq_`
// 口径：线下《江山如故·起》2023 原版；引擎不支持的机制在 desc 内以「实现：」注明降级方式
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

let vseq = 0;
const vcard = (name, suit = 'none', num = 0, extra = {}) => ({
  id: `vjq${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const hasLie = (x) => (x?.marks?.lie || 0) > 0;
const others = (g, p) => g.alive().filter((x) => x !== p);

// 从「非角色持有区域」（牌堆 / 弃牌堆 / 处理区）取牌交给某人：
// 必须先把牌从原区域摘除，否则引擎 gainCards 不传 from 时不会摘牌 → 同一张牌双存。
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
// 梦曹操（起·群 4）【政略】【会猎】【平戎】【飞影】
// ============================================================
// 政略：主公的回合结束后，你可以摸一张牌，然后令一名没有「猎」的角色获得「猎」
//       （若主公本回合未造成过伤害，则改为至多两名）。你对有「猎」的角色使用牌无距离和次数限制。
//       每回合限一次，当你对有「猎」的角色造成伤害后，你可以摸一张牌并获得造成此伤害的牌。
// 实现：距离限制经 distance 钩子归 1；次数限制用「使用【杀】结算后退还次数」实现（引擎无按目标豁免次数的钩子）。
defineSkill({
  id: 'jq_zhenglue', name: '政略',
  desc: '主公的回合结束后，你可以摸一张牌，然后令一名没有「猎」的角色获得「猎」（若主公本回合未造成过伤害，则改为至多两名）。你对有「猎」的角色使用牌无距离和次数限制。每回合限一次，当你对有「猎」的角色造成伤害后，你可以摸一张牌并获得造成此伤害的牌。（实现：距离视为 1；对有「猎」角色使用【杀】结算后退还次数，故本回合次数已被其他【杀】用尽时那一张仍会受限）',
  triggers: [
    // 记录「本回合造成过伤害」的角色（用于判断主公是否造成过伤害）
    {
      on: 'damage.after', who: 'any', priority: 3,
      async effect(ctx) { if (ctx.data.from) ctx.data.from.flags.jqDealt = ctx.game.turnCount; },
    },
    // 对有「猎」的角色距离视为 1（同步钩子，不可 await）
    {
      on: 'distance.calc', who: 'any',
      effect(ctx) {
        const d = ctx.data;
        if (d.to && hasLie(d.to)) d.value = Math.min(d.value, 1);
      },
    },
    // 对有「猎」的角色使用【杀】不占用出【杀】次数：计数已在 useCard 内 +1，这里按「牌」退还一次
    {
      on: 'target.after', who: 'self',
      filter: (d) => {
        const t = d.target, p = d.player;
        if (!t || !d.card || d.card.name !== 'sha') return false;
        if (!hasLie(t)) return false;
        const rec = p.flags.jqZhenglueCards;
        if (rec && rec.turn === d.game.turnCount && rec.ids[d.card.id]) return false;
        return true;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.target;
        if (!p.flags.jqZhenglueCards || p.flags.jqZhenglueCards.turn !== g.turnCount) {
          p.flags.jqZhenglueCards = { turn: g.turnCount, ids: {} };
        }
        p.flags.jqZhenglueCards.ids[ctx.data.card.id] = true;
        if ((p.flags.shaUsed || 0) > 0) p.flags.shaUsed -= 1;
        await ctx.log(`【政略】：对有「猎」的 ${t.name} 使用【杀】，不占用出【杀】次数`);
      },
    },
    // 主公回合结束
    {
      on: 'turn.end', who: 'any', optional: true,
      filter: (d) => d.self?.role === 'lord' && d.self !== d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, lord = ctx.data.self;
        await ctx.draw(p, 1, { reason: 'zhenglue' });
        const dealt = lord.flags.jqDealt === g.turnCount;
        const maxN = dealt ? 1 : 2;
        const cands = g.alive().filter((x) => !hasLie(x));
        if (!cands.length) return;
        const picked = await ctx.ask.targets(p, {
          prompt: `【政略】：令${maxN > 1 ? `至多 ${maxN} 名` : '一名'}没有「猎」的角色获得「猎」`,
          candidates: cands, min: 0, max: Math.min(maxN, cands.length),
        });
        for (const t of picked) {
          t.marks.lie = (t.marks.lie || 0) + 1;
          await ctx.log(`【政略】：${t.name} 获得「猎」`);
        }
      },
    },
    // 对有「猎」角色造成伤害后：摸一张并获得造成伤害的牌
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => d.from === d.player && hasLie(d.to) && d.player.flags.jqLieGainTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.jqLieGainTurn = ctx.game.turnCount;
        await ctx.draw(p, 1, { reason: 'zhenglue' });
        const c = ctx.data.card;
        if (c && ctx.game.cardLocated(c)) await gainFromOutside(ctx.game, p, [c], 'zhenglue');
        await ctx.log('【政略】：摸一张牌' + (c ? `并获得【${cardLabel(c)}】` : ''));
      },
    },
  ],
});

// 会猎：觉醒技，准备阶段，若有「猎」的角色数大于 2，你减 1 点体力上限，获得【平戎】和【飞影】。
defineSkill({
  id: 'jq_huilie', name: '会猎',
  desc: '觉醒技，准备阶段，若有「猎」的角色数大于 2，你减 1 点体力上限，然后获得【平戎】和【飞影】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && !d.self.flags.jqHuilieDone
      && d.game.alive().filter(hasLie).length > 2,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.jqHuilieDone = true;
      p.maxHp = Math.max(1, p.maxHp - 1);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      for (const id of ['jq_pingrong', 'jq_feiying']) {
        if (!(effSkills(p) || []).some((s) => s.id === id)) {
          const sk = getSkill(id);
          if (sk) p.skills.push(sk);
        }
      }
      await ctx.log('【会猎】：减 1 点体力上限，获得【平戎】【飞影】');
    },
  }],
});

// 平戎：每轮限一次，一名角色的回合结束时，你可以弃一名角色的「猎」，然后执行一个额外回合；
//       若该额外回合内你未造成过伤害，你失去 1 点体力。
defineSkill({
  id: 'jq_pingrong', name: '平戎',
  desc: '每轮限一次，一名角色的回合结束时，你可以弃一名角色的「猎」，然后你于此回合结束后执行一个额外回合。若如此做，该额外回合结束时，若你该回合未造成过伤害，你失去 1 点体力。',
  triggers: [
    {
      on: 'turn.end', who: 'any', optional: true,
      filter: (d) => d.player.flags.jqPingrongRound !== d.game.round
        && d.game.alive().some(hasLie),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter(hasLie);
        const t = (await ctx.ask.targets(p, {
          prompt: '【平戎】：弃一名角色的「猎」，获得一个额外回合',
          candidates: cands, min: 1, max: 1,
        }))[0];
        if (!t) return;
        p.flags.jqPingrongRound = g.round;
        t.marks.lie = Math.max(0, (t.marks.lie || 0) - 1);
        const ok = ctx.extraTurn(p);
        if (ok) {
          p.flags.jqPingrongPending = g.turnCount;
          await ctx.log(`【平戎】：弃 ${t.name} 的「猎」，${p.name} 获得一个额外回合`);
        } else {
          await ctx.log('【平戎】：额外回合未能获得（队列已满）');
        }
      },
    },
    {
      on: 'turn.end', who: 'self',
      filter: (d) => d.player.flags.jqPingrongPending != null,
      async effect(ctx) {
        const p = ctx.self;
        const base = p.flags.jqPingrongPending;
        p.flags.jqPingrongPending = null;
        if (p.flags.jqDealt === base) return;   // 该回合造成过伤害
        await ctx.loseHp(p, 1, { reason: 'pingrong' });
        await ctx.log('【平戎】：额外回合未造成伤害，失去 1 点体力');
      },
    },
  ],
});

// 飞影：锁定技，其他角色计算与你的距离 +1。
defineSkill({
  id: 'jq_feiying', name: '飞影',
  desc: '锁定技，其他角色计算与你的距离 +1。',
  triggers: [{
    on: 'game.start', who: 'self',
    async effect(ctx) { ctx.self.flags.distancePlus = (ctx.self.flags.distancePlus || 0) + 1; },
  }],
});

// ============================================================
// 起·刘备（群 4）【积善】【振鞘】
// ============================================================
// 积善：每回合各限一次，当一名角色受到伤害时，你可以失去 1 点体力并防止此伤害，
//       然后你与其各摸一张牌；当你造成伤害后，你可以令一名体力值最小且以此法被防止过伤害的角色回复 1 点体力。
defineSkill({
  id: 'jq_jishan', name: '积善',
  desc: '每回合各限一次，当一名角色受到伤害时，你可以失去 1 点体力并防止此伤害，然后你与其各摸一张牌；当你造成伤害后，你可以令一名体力值最小且以此法被防止过伤害的角色回复 1 点体力。',
  triggers: [
    {
      on: 'damage.before', who: 'any', optional: true,
      filter: (d) => d.player.flags.jqJishanTurn !== d.game.turnCount && (d.amount || 0) > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, victim = ctx.data.to;
        p.flags.jqJishanTurn = g.turnCount;
        ctx.data.canceled = true;
        await ctx.loseHp(p, 1, { reason: 'jishan' });
        await ctx.draw(p, 1, { reason: 'jishan' });
        if (victim && victim.alive) await ctx.draw(victim, 1, { reason: 'jishan' });
        const saved = (p.flags.jqJishanSaved || []);
        if (victim) saved.push(victim.id);
        p.flags.jqJishanSaved = saved;
        await ctx.log(`【积善】：失去 1 点体力防止 ${victim?.name || '该角色'} 受到的伤害，双方各摸一张牌`);
      },
    },
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => d.from === d.player && (d.player.flags.jqJishanSaved || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const ids = [...new Set(p.flags.jqJishanSaved || [])];
        const cands = ids.map((id) => g.byId(id)).filter((x) => x && x.alive && x.hp < x.maxHp);
        if (!cands.length) return;
        const minHp = Math.min(...cands.map((x) => x.hp));
        const pick = cands.filter((x) => x.hp === minHp);
        const t = pick.length === 1 ? pick[0] : (await ctx.ask.targets(p, {
          prompt: '【积善】：令一名体力值最小的角色回复 1 点体力', candidates: pick, min: 1, max: 1,
        }))[0];
        if (!t) return;
        await ctx.recover(t, 1, { reason: 'jishan' });
        await ctx.log(`【积善】：${t.name} 回复 1 点体力`);
      },
    },
  ],
});

// 振鞘：锁定技，你的攻击范围 +1；当你使用【杀】指定目标后，若你的装备区里没有武器牌，此【杀】结算两次。
// 实现：「结算两次」以「伤害 +1」等价替代（引擎单次结算，避免重复触发 sha.target）。
defineSkill({
  id: 'jq_zhenqiao', name: '振鞘',
  desc: '锁定技，你的攻击范围 +1；当你使用【杀】指定目标后，若你的装备区里没有武器牌，令此【杀】结算两次。（实现：结算两次以「此【杀】伤害 +1」等价替代）',
  triggers: [
    {
      on: 'game.start', who: 'self',
      async effect(ctx) { ctx.self.flags.rangeBonus = (ctx.self.flags.rangeBonus || 0) + 1; },
    },
    {
      on: 'target.after', who: 'self',
      filter: (d) => d.card && d.card.name === 'sha' && !d.self.equips?.weapon,
      async effect(ctx) { ctx.self.flags.jqZhenqiaoTurn = ctx.game.turnCount; },
    },
    {
      on: 'damage.before', who: 'any',
      filter: (d) => d.from && d.from.flags.jqZhenqiaoTurn === d.game.turnCount
        && d.card && d.card.name === 'sha' && !d.from.equips?.weapon,
      async effect(ctx) { ctx.data.amount = (ctx.data.amount || 1) + 1; },
    },
  ],
});

// ============================================================
// 起·孙坚（群 4）【平讨】【绝烈】
// ============================================================
// 平讨：出牌阶段限一次，你可以令一名其他角色选择一项：1.交给你一张牌，然后你本回合可以多使用一张【杀】；
//       2.令你视为对其使用一张无次数限制的【杀】。
defineSkill({
  id: 'jq_pingtao', name: '平讨',
  desc: '出牌阶段限一次，你可以令一名其他角色选择一项：1.交给你一张牌，然后你本回合可以多使用一张【杀】；2.令你视为对其使用一张无次数限制的【杀】。',
  active: {
    perPhase: true,
    prompt: '平讨：令一名其他角色交牌（你可多出一张杀）或让你视为对其使用【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【平讨】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, ['交给你一张牌', '令其视为对你使用一张【杀】'], { prompt: '【平讨】：请选择一项' });
      if (idx === 0) {
        if (!t.hand.length) { await ctx.log(`【平讨】：${t.name} 没有手牌可交`); return; }
        const pick = await g.chooseSomeCards(t, t.hand, 1, { prompt: '【平讨】：交给其一张牌' });
        if (pick && pick[0]) await ctx.gain(p, [pick[0]], { from: t, reason: 'pingtao' });
        p.flags.shaUsed = Math.max(0, (p.flags.shaUsed || 0) - 1);   // 本回合可多使用一张【杀】
        await ctx.log(`【平讨】：${t.name} 交给 ${p.name} 一张牌，本回合可多使用一张【杀】`);
      } else {
        const sha = vcard('sha');
        await ctx.useCard({ from: p, card: sha, targets: [t], reason: 'pingtao', ignoreShaLimit: true });
        await ctx.log(`【平讨】：${p.name} 视为对 ${t.name} 使用一张【杀】`);
      }
    },
  },
});

// 绝烈：①当你使用【杀】对目标角色造成伤害时，若你的手牌数或体力值为全场最小，此伤害 +1；
//       ②当你使用【杀】指定一名角色为目标后，你可以弃置一张牌，然后弃置其一张牌。
defineSkill({
  id: 'jq_juelie', name: '绝烈',
  desc: '当你使用【杀】对目标角色造成伤害时，若你的手牌数或体力值为全场最小，此伤害 +1。当你使用【杀】指定一名角色为目标后，你可以弃置一张牌，然后弃置其一张牌。',
  triggers: [
    {
      on: 'damage.before', who: 'any',
      filter: (d) => {
        if (!d.from || d.from !== d.player || !d.card || d.card.name !== 'sha') return false;
        const g = d.game, p = d.player;
        const minHand = Math.min(...g.alive().map((x) => x.hand.length));
        const minHp = Math.min(...g.alive().map((x) => x.hp));
        return p.hand.length === minHand || p.hp === minHp;
      },
      async effect(ctx) {
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log('【绝烈】：手牌或体力为全场最小，此伤害 +1');
      },
    },
    {
      on: 'target.after', who: 'self', optional: true,
      filter: (d) => d.card && d.card.name === 'sha' && d.self.hand.length + Object.values(d.self.equips).filter(Boolean).length > 0,
      async effect(ctx) {
        const p = ctx.self, target = ctx.data.target || ctx.data.to;
        const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
        const mine = await ctx.game.chooseSomeCards(p, pool, 1, { prompt: '【绝烈】：弃置一张牌' });
        if (!mine || !mine[0]) return;
        // 牌来自自己的手牌或装备区，持有者恒为自己（此前写成 `p.hand.includes(...) ? p : p` 的恒等三元）
        await ctx.discard(p, [mine[0]], { reason: 'juelie' });
        if (!target) return;
        const theirs = [...target.hand, ...Object.values(target.equips).filter(Boolean)];
        const got = await ctx.game.chooseSomeCards(p, theirs, 1, { prompt: `【绝烈】：弃置 ${target.name} 一张牌` });
        if (got && got[0]) {
          await ctx.discard(target, [got[0]], { reason: 'juelie' });
        }
        await ctx.log(`【绝烈】：弃置一张牌，并弃置 ${target.name} 一张牌`);
      },
    },
  ],
});

// ============================================================
// 起·皇甫嵩（群 4）【观火】【居下】
// ============================================================
// 观火：出牌阶段，你可以视为使用一张【火攻】；结算结束后，若未造成伤害且本阶段第一次发动，
//       本阶段你使用【火攻】造成的伤害 +1；若不是第一次发动，你失去此技能。
defineSkill({
  id: 'jq_guanhuo', name: '观火',
  desc: '出牌阶段，你可以视为使用一张【火攻】。当此牌结算结束后，若此牌未造成伤害且你于此阶段内：第一次发动此技能，此阶段你使用【火攻】造成的伤害 +1；不为第一次发动此技能，你失去此技能。',
  active: {
    perTurn: false,
    prompt: '观火：视为使用一张【火攻】（连续空放会失去此技能）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((x) => x.hand.length > 0);
      if (!cands.length) { await ctx.log('【观火】：没有可指定的目标'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【观火】：选择【火攻】的目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const round = (p.flags.jqGuanhuoRound === g.turnCount) ? (p.flags.jqGuanhuoCount || 0) + 1 : 1;
      p.flags.jqGuanhuoRound = g.turnCount;
      p.flags.jqGuanhuoCount = round;
      const before = t.hp;
      await ctx.useCard({ from: p, card: vcard('huogong'), targets: [t], reason: 'guanhuo' });
      const hurt = t.hp < before;
      if (!hurt) {
        if (round === 1) {
          p.flags.jqHuogongBonus = g.turnCount;
          await ctx.log('【观火】：此阶段你使用【火攻】造成的伤害 +1');
        } else {
          p.skills = (p.skills || []).filter((s) => s.id !== 'jq_guanhuo');
          await ctx.log('【观火】：未造成伤害且非首次发动，失去【观火】');
        }
      }
    },
  },
  triggers: [{
    on: 'damage.before', who: 'any',
    filter: (d) => d.from && d.from.flags.jqHuogongBonus === d.game.turnCount
      && d.card && d.card.name === 'huogong',
    async effect(ctx) { ctx.data.amount = (ctx.data.amount || 1) + 1; },
  }],
});

// 居下：每回合限一次，当其他角色使用牌指定你为目标后，若其技能数大于你，
//       其可以令此牌对你无效，然后你摸两张牌。
defineSkill({
  id: 'jq_juxia', name: '居下',
  desc: '每回合限一次，当其他角色使用牌指定你为目标后，若其技能数大于你，其可以令此牌对你无效，然后你摸两张牌。',
  triggers: [{
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => {
      const me = d.player;
      return (d.target || d.to) === me && d.from && d.from !== me
        && me.flags.jqJuxiaTurn !== d.game.turnCount
        && (effSkills(d.from) || []).length > (effSkills(me) || []).length;   // ★读 effSkills：对方失去技能后技能数应为 0（SG029 A1）
    },
    async effect(ctx) {
      const me = ctx.self, src = ctx.data.from;
      me.flags.jqJuxiaTurn = ctx.game.turnCount;
      const yes = await ctx.ask.confirm(src, `【居下】：是否令此牌对 ${me.name} 无效？（其将摸两张牌）`);
      if (yes) {
        ctx.data.canceled = true;
        await ctx.log(`【居下】：${src.name} 令此牌对 ${me.name} 无效`);
      }
      await ctx.draw(me, 2, { reason: 'juxia' });
    },
  }],
});

// ============================================================
// 起·何进（群 4）【诏兵】【诛宦】【延祸】
// ============================================================
// 诏兵：结束阶段，你可以弃置所有手牌，然后令至多 X 名其他角色各选择一项（X 为此次弃置的牌数）：
//       1.展示并交给你一张【杀】；2.失去 1 点体力。
defineSkill({
  id: 'jq_zhaobing', name: '诏兵',
  desc: '结束阶段，你可以弃置所有手牌，然后令至多 X 名其他角色各选择一项（X 为你此次弃置的牌数）：1.展示并交给你一张【杀】；2.失去 1 点体力。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.self.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const n = p.hand.length;
      await ctx.discard(p, p.hand.slice(), { reason: 'zhaobing' });
      const cands = others(g, p);
      if (!cands.length) return;
      const picked = await ctx.ask.targets(p, {
        prompt: `【诏兵】：选择至多 ${n} 名其他角色（弃置 ${n} 张牌）`,
        candidates: cands, min: 0, max: Math.min(n, cands.length),
      });
      for (const t of picked) {
        const shaCards = t.hand.filter((c) => c.name === 'sha');
        const idx = await ctx.ask.choose(t, ['展示并交给其一张【杀】', '失去 1 点体力'], { prompt: '【诏兵】：请选择一项' });
        if (idx === 0 && shaCards.length) {
          const pick = (await g.chooseSomeCards(t, shaCards, 1, { prompt: '【诏兵】：交给其一张【杀】' }))[0];
          if (pick) await ctx.gain(p, [pick], { from: t, reason: 'zhaobing' });
        } else {
          await ctx.loseHp(t, 1, { reason: 'zhaobing' });
        }
      }
    },
  }],
});

// 诛宦：准备阶段，你可以展示所有手牌并弃置其中所有【杀】，然后令一名其他角色选择一项：
//       1.受到 1 点伤害，然后弃置等量的牌；2.令你回复 1 点体力，然后你摸等量的牌。
defineSkill({
  id: 'jq_zhuhuan', name: '诛宦',
  desc: '准备阶段，你可以展示所有手牌并弃置其中所有【杀】，然后令一名其他角色选择一项：1.受到 1 点伤害，然后弃置等量的牌；2.令你回复 1 点体力，然后你摸等量的牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.self.hand.some((c) => c.name === 'sha'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const shas = p.hand.filter((c) => c.name === 'sha');
      const n = shas.length;
      await ctx.log(`【诛宦】：展示手牌 ${p.hand.map((c) => `【${cardLabel(c)}】`).join('')}，弃置其中 ${n} 张【杀】`);
      await ctx.discard(p, shas, { reason: 'zhuhuan' });
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【诛宦】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, ['受到 1 点伤害并弃等量的牌', '令其回复 1 点体力并摸等量的牌'], { prompt: '【诛宦】：请选择一项' });
      if (idx === 0) {
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'zhuhuan' });
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        const got = await g.chooseSomeCards(t, pool, Math.min(n, pool.length), { prompt: `【诛宦】：弃置 ${Math.min(n, pool.length)} 张牌` });
        if (got && got.length) await ctx.discard(t, got, { reason: 'zhuhuan' });
      } else {
        if (p.hp < p.maxHp) await ctx.recover(p, 1, { reason: 'zhuhuan' });
        await ctx.draw(p, n, { reason: 'zhuhuan' });
      }
    },
  }],
});

// 延祸：锁定技，当你死亡时，你令本局游戏【杀】对目标角色造成的伤害 +1。
defineSkill({
  id: 'jq_yanhuo', name: '延祸',
  desc: '锁定技，当你死亡时，你令本局游戏【杀】对目标角色造成的伤害 +1。',
  triggers: [{
    on: 'death.after', who: 'self',
    async effect(ctx) {
      const g = ctx.game;
      g.flags = g.flags || {};
      g.flags.jqYanhuo = true;
      for (const q of g.alive()) {
        if (!(effSkills(q) || []).some((s) => s.id === 'jq_yanhuo_aura')) {
          const sk = getSkill('jq_yanhuo_aura');
          if (sk) q.skills.push(sk);
        }
      }
      await ctx.log('【延祸】：本局游戏【杀】造成的伤害 +1');
    },
  }],
});

// 延祸·余威（何进死亡后赋予全场的常驻效果，不单独显示为武将技能）
defineSkill({
  id: 'jq_yanhuo_aura', name: '延祸',
  desc: '锁定技，本局游戏【杀】对目标角色造成的伤害 +1（何进死亡后生效）。',
  hidden: true,
  triggers: [{
    on: 'damage.before', who: 'any',
    filter: (d) => d.card && d.card.name === 'sha' && d.game.flags?.jqYanhuo,
    async effect(ctx) { ctx.data.amount = (ctx.data.amount || 1) + 1; },
  }],
});

// ============================================================
// 起·王允（群 4）【赦论】【伐异】
// ============================================================
// ============================================================
// 「议事」通用实现（江山如故新机制，供本包【赦论】【朝争】等共用）
// 规则集：所有有手牌的参与角色同时展示一张手牌，展示牌的颜色即其「意见」；红多于黑→红色，
//         黑多于红→黑色，相等→无结果（不执行任何效果）。没有手牌的角色不能参与议事。
// 实现要点：
//   ① 意见牌只是「展示」，仍留在手牌里，不需要移动牌（牌张守恒零风险）；
//   ② 意见由各角色自行选择（旧实现是随机抽一张）；
//   ③ 议事结算结束后统一发 'yishi.end'，供【伐异】等「参与议事结束后」的技能响应
//      （引擎 VALID_EVENTS 尚未收录该事件，注册方式见 jq_fayi 处说明）。
// ============================================================
const YISHI_END = 'yishi.end';

async function runYishi(g, initiator, parts, { prompt = '【议事】：展示一张手牌作为意见' } = {}) {
  const red = [], black = [], opinions = {}, shown = {};
  for (const p of (parts || [])) {
    if (!p || !p.alive || !p.hand.length) continue;   // 没有手牌的角色不能参与议事
    const pool = p.hand.slice();
    let c = pool.length === 1 ? pool[0] : (await g.chooseSomeCards(p, pool, 1, { prompt }))[0];
    if (!c) c = pool[g.rng.int(pool.length)];
    const isRed = c.suit === 'heart' || c.suit === 'diamond';
    (isRed ? red : black).push(p);
    opinions[p.seat] = isRed ? 'red' : 'black';
    shown[p.seat] = c;
    await g.log(`${p.name} 展示【${cardLabel(c)}】作为议事意见（${isRed ? '红色' : '黑色'}）`);
  }
  const total = red.length + black.length;
  const result = red.length === black.length ? 'none' : (red.length > black.length ? 'red' : 'black');
  const joined = (parts || []).filter((p) => p && opinions[p.seat]);
  return { red, black, total, result, redWin: result === 'red', opinions, shown, initiator, parts: joined };
}

// 议事结算结束：广播 'yishi.end'（【伐异】等技能在此响应）
// ★引擎的 game.yishi() 也已派发同名事件（SG025 #10 修复）；本文件保留本地实现是因为
//   起·王允的议事需要「指定参与者 + 逐个展示具体牌」，语义比引擎的随机抽牌更细。
//   两条路径的 data 字段已对齐（self/initiator/red/black/redN/blackN/redWin/total），
//   监听者不必区分事件来源。
async function emitYishiEnd(g, initiator, r) {
  await g.trigger(YISHI_END, {
    self: initiator, initiator,
    participants: r.parts, opinions: r.opinions, shown: r.shown,
    result: r.result, red: r.red, black: r.black, total: r.total,
    redN: r.red.length, blackN: r.black.length, redWin: r.result === 'red',
  });
}

// 赦论：出牌阶段限一次，你可以选择一名你攻击范围内的其他角色，然后令除其外所有手牌数不大于你的角色议事，
//       若结果为：红色，你弃置其一张牌；黑色，你对其造成 1 点伤害。
//       （王允本人手牌数必不大于自己，故必定参与议事——【伐异】由此获得意见）
defineSkill({
  id: 'jq_shelun', name: '赦论',
  desc: '出牌阶段限一次，你可以选择你攻击范围内的一名其他角色，然后令除其外所有手牌数不大于你的角色议事，若结果为：红色，你弃置其一张牌；黑色，你对其造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '赦论：令众人议事，红则弃其一张牌，黑则对其造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((x) => x !== p && g.inAttackRange(p, x));
      if (!cands.length) { await ctx.log('【赦论】：攻击范围内没有其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【赦论】：选择一名攻击范围内的其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const parts = g.alive().filter((x) => x !== t && x.hand.length <= p.hand.length);
      const r = await runYishi(g, p, parts, { prompt: '【赦论】：议事——展示一张手牌作为意见' });
      const RES = { red: '红色', black: '黑色', none: '无结果' };
      await ctx.log(`【赦论】：议事 — 红 ${r.red.length} / 黑 ${r.black.length} → ${RES[r.result]}`);
      if (r.result === 'red') {
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        if (pool.length) {
          const c = (await g.chooseSomeCards(p, pool, 1, { prompt: `【赦论】：弃置 ${t.name} 一张牌` }))[0];
          if (c) await ctx.discard(t, [c], { reason: 'shelun' });
        }
      } else if (r.result === 'black') {
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'shelun' });
      } else {
        await ctx.log('【赦论】：红黑意见数相等，议事无结果');
      }
      await emitYishiEnd(g, p, r);
    },
  },
});

// 伐异：当你参与的议事结束后，你可以对一名意见与你不同的角色造成 1 点伤害。
// 规则集口径：议事结算结束后，若你于此次议事中有意见，你可对一名于此次议事中与你意见不同的角色造成 1 点普通伤害。
// 实现：引擎 VALID_EVENTS 未收录「议事结束」事件，defineSkill 会拒绝未收录的事件名，因此本技能在
//       defineSkill 之后把触发器追加到注册对象上，监听本文件议事实现（runYishi → emitYishiEnd）统一发出的 'yishi.end'。
//       若后续引擎把 'yishi.end' 加入 VALID_EVENTS 并由引擎层统一发出，可把该触发器直接写回下面的 triggers 数组。
const fayiSkill = defineSkill({
  id: 'jq_fayi', name: '伐异',
  desc: '当你参与的议事结束后，你可以对一名意见与你不同的角色造成 1 点伤害。',
  triggers: [],
});
fayiSkill.triggers.push({
  on: YISHI_END,
  who: 'any',
  optional: true,
  prompt: '【伐异】：是否对一名意见与你不同的角色造成 1 点伤害？',
  filter: (d) => {
    const p = d.player, mine = d.opinions && d.opinions[p.seat];
    if (!mine) return false;   // 本次议事中没有意见 → 不能发动
    return (d.participants || []).some((x) => x && x.alive && x !== p
      && d.opinions[x.seat] && d.opinions[x.seat] !== mine);
  },
  async effect(ctx) {
    const p = ctx.self, d = ctx.data, mine = d.opinions[p.seat];
    const diff = (d.participants || []).filter((x) => x && x.alive && x !== p
      && d.opinions[x.seat] && d.opinions[x.seat] !== mine);
    if (!diff.length) return;
    const t = diff.length === 1 ? diff[0] : (await ctx.ask.targets(p, {
      prompt: '【伐异】：选择一名意见与你不同的角色', candidates: diff, min: 1, max: 1,
    }))[0];
    if (!t) return;
    await ctx.damage({ from: p, to: t, amount: 1, reason: 'fayi' });
    await ctx.log(`【伐异】：对意见与你不同的 ${t.name} 造成 1 点伤害`);
  },
});

// ============================================================
// 起·桥玄（群 3）【绝质】【急召】
// ============================================================
const SLOT_CN = { weapon: '武器栏', armor: '防具栏', horseMinus: '进攻坐骑栏', horsePlus: '防御坐骑栏', treasure: '宝物栏' };

// 绝质：当你失去装备区里的一张牌后，你可以废除对应装备栏；你的回合内每阶段限一次，
//       当你使用牌对目标角色造成伤害时，其装备区里每有一张与你已废除装备栏对应的装备牌，此伤害便 +1。
defineSkill({
  id: 'jq_juezhi', name: '绝质',
  desc: '当你失去装备区里的一张牌后，你可以废除对应装备栏；你的回合内每阶段限一次，当你使用牌对目标角色造成伤害时，其装备区里每有一张与你已废除装备栏对应的装备牌，此伤害 +1。',
  triggers: [
    {
      on: 'equip.lose', who: 'self', optional: true,
      async effect(ctx) {
        const p = ctx.self;
        const slot = ctx.data.slot || ctx.data.key;
        if (!slot) return;
        p.flags.jqBroken = p.flags.jqBroken || {};
        if (p.flags.jqBroken[slot]) return;
        p.flags.jqBroken[slot] = true;
        await ctx.log(`【绝质】：废除${SLOT_CN[slot] || slot}`);
      },
    },
    {
      on: 'damage.before', who: 'any',
      filter: (d) => {
        if (d.from !== d.player || !d.player.flags.jqBroken) return false;
        const broken = d.player.flags.jqBroken;
        return Object.entries(broken).some(([k, v]) => v && d.to.equips && d.to.equips[k]);
      },
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.to;
        let n = 0;
        for (const [k, v] of Object.entries(p.flags.jqBroken || {})) if (v && t.equips && t.equips[k]) n++;
        if (n > 0) {
          ctx.data.amount = (ctx.data.amount || 1) + n;
          await ctx.log(`【绝质】：${t.name} 装备区有 ${n} 张对应装备，此伤害 +${n}`);
        }
      },
    },
  ],
});

// 急召：准备阶段与结束阶段，你可以令一名角色选择一项：1.使用一张手牌；2.令你可以移动其区域里的一张牌。
// 实现：「移动」= 将其一件装备/判定牌收入你手牌（引擎无跨区域移动原语）。
defineSkill({
  id: 'jq_jizhao', name: '急召',
  desc: '准备阶段与结束阶段，你可以令一名角色选择一项：1.使用一张手牌；2.令你可以移动其区域里的一张牌。（实现：移动 = 你获得该牌）',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' || d.phase === 'end',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, {
        prompt: '【急召】：选择一名角色', candidates: g.alive(), min: 1, max: 1,
      }))[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, ['使用一张手牌', '令其移动你区域里的一张牌'], { prompt: '【急召】：请选择一项' });
      if (idx === 0) {
        if (!t.hand.length) { await ctx.log(`【急召】：${t.name} 没有手牌`); return; }
        const c = (await g.chooseSomeCards(t, t.hand, 1, { prompt: '【急召】：使用一张手牌' }))[0];
        if (!c) return;
        const meta = CARD_META[c.name] || {};
        if (meta.type === 'equip') {
          await g.useCard({ from: t, card: c, reason: 'jizhao' });
        } else {
          const targets = (c.name === 'sha' || meta.targets)
            ? await g.chooseTargets(t, { prompt: `【急召】：为【${cardLabel(c)}】选择目标`, candidates: g.candidatesFor(t, c), min: 0, max: 1 })
            : [];
          await g.useCard({ from: t, card: c, targets, reason: 'jizhao' });
        }
      } else {
        const pool = [...Object.values(t.equips).filter(Boolean), ...(t.judgeZone || []).map((z) => z.card || z)];
        if (!pool.length) { await ctx.log(`【急召】：${t.name} 区域里没有可移动的牌`); return; }
        const card = await ctx.game.chooseSomeCards(p, pool, 1, { prompt: `【急召】：移动 ${t.name} 区域里的一张牌` });
        if (card && card[0]) {
          await ctx.gain(p, [card[0]], { from: t, reason: 'jizhao' });
          await ctx.log(`【急召】：移动 ${t.name} 的一张牌`);
        }
      }
    },
  }],
});

// ============================================================
// 起·许劭（群 4）【盈门】【评鉴】
// ============================================================
// 实现说明：官方「访客」= 剩余武将牌堆的武将牌，可发动其上无标签/仅锁定技的技能。
// 本实现改为「技能池」等价替代：访客 = 从预设简易技能池随机 4 个，【评鉴】发动其效果后移去。
const FANGKE_POOL = [
  {
    name: '突袭',
    run: async (ctx, p, g) => {
      const cands = g.alive().filter((x) => x !== p && x.hand.length > 0);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【突袭】：获得一名角色一张手牌', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const c = (await g.chooseSomeCards(p, t.hand, 1, { prompt: '【突袭】：选择获得的手牌' }))[0];
      if (c) await ctx.gain(p, [c], { from: t, reason: 'pingjian' });
    },
  },
  { name: '英姿', run: async (ctx, p, g) => { await ctx.draw(p, 2, { reason: 'pingjian' }); } },
  {
    name: '制衡',
    run: async (ctx, p, g) => {
      if (!p.hand.length) return;
      const got = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【制衡】：弃置一张牌并摸一张牌' });
      if (got && got[0]) { await ctx.discard(p, [got[0]], { reason: 'pingjian' }); await ctx.draw(p, 1, { reason: 'pingjian' }); }
    },
  },
  {
    name: '仁德',
    run: async (ctx, p, g) => {
      if (!p.hand.length) return;
      const cands = g.alive().filter((x) => x !== p);
      const t = (await ctx.ask.targets(p, { prompt: '【仁德】：交给一名角色一张牌，然后摸一张牌', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【仁德】：选择交出的牌' }))[0];
      if (c) await ctx.gain(t, [c], { from: p, reason: 'pingjian' });
      await ctx.draw(p, 1, { reason: 'pingjian' });
    },
  },
  { name: '遗计', run: async (ctx, p, g) => { await ctx.draw(p, 2, { reason: 'pingjian' }); } },
  {
    name: '观星',
    run: async (ctx, p, g) => {
      const take = [];
      for (let i = 0; i < 3 && g.deck.length; i++) take.push(g.deck.pop());
      if (!take.length) return;
      const c = (await g.chooseSomeCards(p, take, 1, { prompt: '【观星】：获得牌堆顶一张牌' }))[0];
      for (const x of take) if (x !== c) g.deck.push(x);   // 未选的放回牌堆顶
      if (c) await ctx.gain(p, [c], { reason: 'pingjian' });
    },
  },
];

// 盈门：锁定技，游戏开始时，你将剩余武将牌堆中的随机四张牌置于你的武将牌上，称为「访客」；
//       回合开始时，若你的「访客」牌少于四张，你从剩余武将牌堆中将「访客」补至四张。
defineSkill({
  id: 'jq_yingmen', name: '盈门',
  desc: '锁定技，游戏开始时，你将 4 名「访客」置于你的武将牌上；回合开始时，若你的「访客」少于 4 名，你将其补至 4 名。（实现：访客取自技能池）',
  triggers: [
    {
      on: 'game.start', who: 'self',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const names = FANGKE_POOL.map((f) => f.name);
        const pool = g.rng.shuffle(names.slice());
        p.marks.fangke = pool.slice(0, 4);
        await ctx.log(`【盈门】：访客 — ${p.marks.fangke.join('、')}`);
      },
    },
    {
      on: 'turn.begin', who: 'self',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.marks.fangke = p.marks.fangke || [];
        const names = FANGKE_POOL.map((f) => f.name);
        while (p.marks.fangke.length < 4) {
          const left = names.filter((n) => !p.marks.fangke.includes(n));
          if (!left.length) break;
          const shuffled = g.rng.shuffle(left);
          p.marks.fangke.push(shuffled[0]);
        }
      },
    },
  ],
});

// 评鉴：你可以于对应时机发动「访客」牌上的无类型标签或仅有锁定技标签的技能，然后选择一项：
//       1.移去该「访客」，然后摸一张牌；2.移去另一张「访客」。
// 实现：出牌阶段限一次，选择一个「访客」发动其效果；发动后移去该访客并摸一张牌。
defineSkill({
  id: 'jq_pingjian', name: '评鉴',
  desc: '你可以发动一张「访客」上的技能，然后选择一项：1.移去该「访客」，然后摸一张牌；2.移去另一张「访客」。（实现：出牌阶段限一次，发动一名访客的效果）',
  active: {
    perPhase: true,
    prompt: '评鉴：发动一名「访客」的技能，然后移去它并摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const list = (p.marks.fangke || []).slice();
      if (!list.length) { await ctx.log('【评鉴】：没有「访客」'); return; }
      const idx = await ctx.ask.choose(p, list.map((n) => `访客·${n}`), { prompt: '【评鉴】：选择一名「访客」发动其技能' });
      if (idx < 0) return;
      const name = list[idx];
      const entry = FANGKE_POOL.find((f) => f.name === name);
      await ctx.log(`【评鉴】：发动访客【${name}】`);
      if (entry) await entry.run(ctx, p, g);
      p.marks.fangke = list.filter((n) => n !== name);
      await ctx.draw(p, 1, { reason: 'pingjian' });
    },
  },
});

// ============================================================
// 起·董白（群 3）【恃宠】【连诛】
// ============================================================
// 恃宠：转换技，当你使用牌指定其他角色为唯一目标后，阳：你可以获得其一张手牌；阴：其可以交给你一张手牌。
defineSkill({
  id: 'jq_shichong', name: '恃宠',
  desc: '转换技，当你使用牌指定其他角色为唯一目标后，阳：你可以获得其一张手牌；阴：其可以交给你一张手牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => {
      const ts = d.targets || [];
      return ts.length === 1 && ts[0] && ts[0] !== d.player && ts[0].hand.length > 0;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = (ctx.data.targets || [])[0];
      const yin = !!p.flags.jqShichongYin;
      p.flags.jqShichongYin = !yin;
      if (!yin) {
        const c = (await g.chooseSomeCards(p, t.hand.slice(), 1, { prompt: `【恃宠·阳】：获得 ${t.name} 一张手牌` }))[0];
        if (c) { await ctx.gain(p, [c], { from: t, reason: 'shichong' }); await ctx.log(`【恃宠·阳】：获得 ${t.name} 一张手牌`); }
      } else {
        const yes = await ctx.ask.confirm(t, `【恃宠·阴】：是否交给 ${p.name} 一张手牌？`);
        if (yes && t.hand.length) {
          const c = (await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【恃宠·阴】：交给其一张手牌' }))[0];
          if (c) await ctx.gain(p, [c], { from: t, reason: 'shichong' });
        }
        await ctx.log('【恃宠】：转换为阳');
      }
    },
  }],
});

// 连诛：出牌阶段限一次，你可以展示并交给一名其他角色一张黑色手牌，
//       然后视为对所有与其势力相同的其他角色各使用一张【过河拆桥】。
defineSkill({
  id: 'jq_lianzhu', name: '连诛',
  desc: '出牌阶段限一次，你可以展示并交给一名其他角色一张黑色手牌，然后视为对所有与其势力相同的其他角色各使用一张【过河拆桥】。',
  active: {
    perPhase: true,
    prompt: '连诛：交给一名其他角色一张黑色手牌，拆所有与其同势力角色的牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const blacks = p.hand.filter((c) => c.color === 'black' || c.suit === 'spade' || c.suit === 'club');
      if (!blacks.length) { await ctx.log('【连诛】：没有黑色手牌'); return; }
      const cands = g.alive().filter((x) => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【连诛】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const c = (await g.chooseSomeCards(p, blacks, 1, { prompt: '【连诛】：交给其一张黑色手牌' }))[0];
      if (!c) return;
      await ctx.gain(t, [c], { from: p, reason: 'lianzhu' });
      await ctx.log(`【连诛】：交给 ${t.name} 【${cardLabel(c)}】`);
      const same = g.alive().filter((x) => x !== p && x !== t && x.kingdom === t.kingdom);
      for (const q of same) {
        const pool = [...q.hand, ...Object.values(q.equips).filter(Boolean)];
        if (!pool.length) continue;
        const got = (await g.chooseSomeCards(p, pool, 1, { prompt: `【连诛】：弃置 ${q.name} 一张牌` }))[0];
        if (got) await ctx.discard(q, [got], { reason: 'lianzhu' });
        await ctx.log(`【连诛】：对 ${q.name} 使用【过河拆桥】`);
      }
    },
  },
});

// ============================================================
// 起·刘焉（群 3，主公）【立牧】【图射】【通绝】
// ============================================================
// 立牧：出牌阶段，你可以将一张方块牌当【乐不思蜀】对自己使用，然后回复 1 点体力；
//       若你的判定区有牌，你对攻击范围内的其他角色使用牌无次数和距离限制。
defineSkill({
  id: 'jq_limu', name: '立牧',
  desc: '出牌阶段，你可以将一张方块牌当【乐不思蜀】对自己使用，然后回复 1 点体力；若你的判定区有牌，你使用牌无次数和距离限制。（实现：满足条件时给予本回合无距离/无次数限制标记）',
  active: {
    perTurn: false,
    prompt: '立牧：弃一张方块牌当【乐不思蜀】对自己使用并回复 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const diamonds = p.hand.filter((c) => c.suit === 'diamond');
      if (!diamonds.length) { await ctx.log('【立牧】：没有方块牌'); return; }
      const c = (await g.chooseSomeCards(p, diamonds, 1, { prompt: '【立牧】：弃置一张方块牌' }))[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'limu' });
      const le = vcard('lebusishu', 'diamond', c.num);
      p.judgeZone = p.judgeZone || [];
      p.judgeZone.push({ card: le, name: 'lebusishu' });
      await ctx.log(`【立牧】：视为对自己使用【乐不思蜀】（判定区 ${p.judgeZone.length} 张）`);
      if (p.hp < p.maxHp) await ctx.recover(p, 1, { reason: 'limu' });
      p.flags.freeRangeTurn = g.turnCount;
      p.flags.shaUnlimited = true;
      await ctx.log('【立牧】：本回合使用牌无次数和距离限制');
    },
  },
});

// 图射：当你使用非装备牌指定目标后，你可以展示所有手牌（无牌则跳过），
//       若其中没有基本牌，你摸 X 张牌（X 为此牌指定的目标数）。
defineSkill({
  id: 'jq_tushe', name: '图射',
  desc: '当你使用非装备牌指定目标后，你可以展示所有手牌，若其中没有基本牌，你摸 X 张牌（X 为此牌指定的目标数）。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => {
      const c = d.card;
      if (!c || c.type === 'equip') return false;
      return (d.targets || []).length > 0;
    },
    async effect(ctx) {
      const p = ctx.self, n = (ctx.data.targets || []).length;
      await ctx.log(`【图射】：展示手牌 ${p.hand.map((c) => `【${cardLabel(c)}】`).join('') || '（无）'}`);
      if (p.hand.some((c) => c.type === 'basic')) return;
      if (n > 0) {
        await ctx.draw(p, n, { reason: 'tushe' });
        await ctx.log(`【图射】：手牌无基本牌，摸 ${n} 张`);
      }
    },
  }],
});

// 通绝：主公技，出牌阶段限一次，你可以交给任意名其他群势力角色各一张牌，
//       若如此做，本回合你不能对这些角色使用牌。
defineSkill({
  id: 'jq_tongjue', name: '通绝',
  desc: '主公技，出牌阶段限一次，你可以交给任意名其他群势力角色各一张牌，若如此做，本回合你不能对这些角色使用牌。（实现：交牌已实现，「本回合不能对其使用牌」以标记记录）',
  active: {
    perPhase: true,
    prompt: '通绝：交给任意名其他群势力角色各一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((x) => x !== p && x.kingdom === 'qun');
      if (!cands.length || !p.hand.length) { await ctx.log('【通绝】：没有可交牌的目标或手牌'); return; }
      const picked = await ctx.ask.targets(p, {
        prompt: '【通绝】：选择至多与手牌数相同的其他群势力角色',
        candidates: cands, min: 0, max: Math.min(cands.length, p.hand.length),
      });
      if (!picked.length) return;
      for (const t of picked) {
        const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: `【通绝】：交给 ${t.name} 一张牌` }))[0];
        if (c) await ctx.gain(t, [c], { from: p, reason: 'tongjue' });
      }
      p.flags.jqTongjueSeats = picked.map((t) => t.seat);
      await ctx.log(`【通绝】：交给 ${picked.map((t) => t.name).join('、')} 各一张牌`);
    },
  },
});

// ============================================================
// 起·杨彪（群 3/4）【昭汉】【让节】【义争】
// ============================================================
// 昭汉：锁定技，准备阶段，若：未洗过牌，你回复 1 点体力；洗过牌，你失去 1 点体力。
defineSkill({
  id: 'jq_zhaohan', name: '昭汉',
  desc: '锁定技，准备阶段，若：未洗过牌，你回复 1 点体力；洗过牌，你失去 1 点体力。',
  triggers: [{
    on: 'phase.begin', who: 'self',
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const shuffled = (g.flags?.shuffled || 0) > 0;
      if (!shuffled) {
        if (p.hp < p.maxHp) await ctx.recover(p, 1, { reason: 'zhaohan' });
        await ctx.log('【昭汉】：本局未洗过牌，回复 1 点体力');
      } else {
        await ctx.loseHp(p, 1, { reason: 'zhaohan' });
        await ctx.log('【昭汉】：本局已洗过牌，失去 1 点体力');
      }
    },
  }],
});

// 让节：当你受到 1 点伤害后，你可以移动场上的一张牌，
//       然后你可以在本回合进入弃牌堆的牌中获得一张与你以此法移动的牌的花色相同的牌。
defineSkill({
  id: 'jq_rangjie', name: '让节',
  desc: '当你受到 1 点伤害后，你可以移动场上的一张牌，然后你可以在本回合进入弃牌堆的牌中获得一张与你以此法移动的牌的花色相同的牌。（实现：移动 = 你将那张牌收入手牌）',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.to === d.player && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const owners = g.alive().filter((x) => [...Object.values(x.equips).filter(Boolean), ...(x.judgeZone || [])].length > 0);
      if (!owners.length) return;
      const owner = (await ctx.ask.targets(p, { prompt: '【让节】：移动场上的一张牌（选择角色）', candidates: owners, min: 1, max: 1 }))[0];
      if (!owner) return;
      const pool = [...Object.values(owner.equips).filter(Boolean), ...(owner.judgeZone || []).map((z) => z.card || z)];
      const moved = (await g.chooseSomeCards(p, pool, 1, { prompt: `【让节】：移动 ${owner.name} 的一张牌` }))[0];
      if (!moved) return;
      await ctx.gain(p, [moved], { from: owner, reason: 'rangjie' });
      await ctx.log(`【让节】：移动 ${owner.name} 的【${cardLabel(moved)}】`);
      const suit = moved.suit;
      const cand = (g.discardPile || []).filter((c) => c.suit === suit);
      if (!cand.length) return;
      const yes = await ctx.ask.confirm(p, `【让节】：是否获得本回合进入弃牌堆的一张${suit === 'heart' ? '红桃' : suit === 'diamond' ? '方块' : suit === 'spade' ? '黑桃' : '梅花'}牌？`);
      if (!yes) return;
      const pick = (await g.chooseSomeCards(p, cand, 1, { prompt: '【让节】：选择获得的牌' }))[0];
      if (pick) await gainFromOutside(g, p, [pick], 'rangjie');
    },
  }],
});

// 义争：出牌阶段限一次，你可以与一名手牌数大于你的角色拼点，若你：赢，其跳过下个摸牌阶段；
//       没赢，其可以对你造成至多 2 点伤害。
defineSkill({
  id: 'jq_yizheng', name: '义争',
  desc: '出牌阶段限一次，你可以与一名手牌数大于你的角色拼点，若你：赢，其跳过下个摸牌阶段；没赢，其可以对你造成至多 2 点伤害。',
  active: {
    perPhase: true,
    prompt: '义争：与手牌数大于你的角色拼点，赢则其跳摸牌阶段，没赢其可对你造成至多 2 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((x) => x !== p && x.hand.length > p.hand.length && x.hand.length > 0);
      if (!cands.length || !p.hand.length) { await ctx.log('【义争】：没有可拼点的角色或你没有手牌'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【义争】：选择拼点对象', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: '义争' });
      if (r.win) {
        t.flags.jqSkipDraw = true;
        await ctx.log(`【义争】：拼点赢，${t.name} 跳过下个摸牌阶段`);
      } else {
        const yes = await ctx.ask.confirm(t, `【义争】：是否对 ${p.name} 造成伤害？`);
        if (!yes) return;
        const n = Math.min(2, Math.max(1, t.hp));
        const idx = await ctx.ask.choose(t, ['造成 1 点伤害', '造成 2 点伤害'], { prompt: '【义争】：造成几点伤害？' });
        const amt = idx === 1 ? 2 : 1;
        await ctx.damage({ from: t, to: p, amount: Math.min(amt, n), reason: 'yizheng' });
      }
    },
  },
  triggers: [{
    on: 'turn.begin', who: 'any',
    filter: (d) => d.self.flags.jqSkipDraw,
    async effect(ctx) {
      const p = ctx.data.self;
      p.flags.jqSkipDraw = false;
      ctx.game.skipPhase(p, 'draw');
      await ctx.log(`【义争】：${p.name} 跳过摸牌阶段`);
    },
  }],
});

// ============================================================
// 起·南华老仙（群 3）【授术】【尊道】【宣化】
// ============================================================
// 授术：锁定技，每轮开始时，若场上没有【太平要术】，你可以将游戏外的【太平要术】置入一名角色的装备区；
//       当场上的【太平要术】离开装备区时，你令此【太平要术】销毁。
defineSkill({
  id: 'jq_shoushu', name: '授术',
  desc: '锁定技，每轮开始时，若场上没有【太平要术】，你可以将游戏外的【太平要术】置入一名角色的装备区；当场上的【太平要术】离开装备区时，你令此【太平要术】销毁。',
  triggers: [
    {
      on: 'round.begin', who: 'self', optional: true,
      filter: (d) => !d.game.players.some((x) => x.equips?.treasure?.name === 'taiping'),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter((x) => !x.equips.treasure);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【授术】：将【太平要术】置入一名角色的装备区', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const card = vcard('taiping', 'spade', 1);
        t.equips.treasure = card;
        await ctx.log(`【授术】：${t.name} 获得【太平要术】（宝物）`);
      },
    },
    {
      on: 'equip.lose', who: 'any',
      filter: (d) => d.self && (d.card?.name === 'taiping' || d.slot === 'treasure'),
      async effect(ctx) { await ctx.log('【授术】：【太平要术】离开装备区，销毁'); },
    },
  ],
});

// 尊道：当你的判定牌生效前，你可以选择至多两名有牌的角色，令这些角色各弃置一张牌，
//       然后你选择其中一张代替此判定牌。
defineSkill({
  id: 'jq_zundao', name: '尊道',
  desc: '当你的判定牌生效前，你可以选择至多两名有牌的角色，令这些角色各弃置一张牌，然后你选择其中一张代替此判定牌。',
  triggers: [{
    on: 'judge.before', who: 'self', optional: true,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((x) => x.hand.length > 0);
      if (!cands.length) return;
      const picked = await ctx.ask.targets(p, {
        prompt: '【尊道】：选择至多两名有牌的角色各弃一张牌',
        candidates: cands, min: 0, max: Math.min(2, cands.length),
      });
      const pool = [];
      for (const t of picked) {
        const c = (await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【尊道】：弃置一张牌' }))[0];
        if (c) { await ctx.discard(t, [c], { reason: 'zundao' }); pool.push(c); }
      }
      if (!pool.length) return;
      const pick = pool.length === 1 ? pool[0] : (await g.chooseSomeCards(p, pool, 1, { prompt: '【尊道】：选择一张代替判定牌' }))[0];
      if (pick) {
        ctx.data.card = pick;
        ctx.data.suit = pick.suit;
        ctx.data.num = pick.num;
        await ctx.log(`【尊道】：以【${cardLabel(pick)}】代替判定牌`);
      }
    },
  }],
});

// 宣化：准备阶段，你可以进行一次【闪电】判定，然后若你未因此受到伤害，你可以令一名角色回复 1 点体力；
//       结束阶段，你可以进行一次判定结果反转的【闪电】判定，然后若你未因此受到伤害，你可以对一名角色造成 1 点雷电伤害。
defineSkill({
  id: 'jq_xuanhua', name: '宣化',
  desc: '准备阶段，你可以进行一次【闪电】判定，然后若你未因此受到伤害，你可以令一名角色回复 1 点体力；结束阶段，你可以进行一次判定结果反转的【闪电】判定，然后若你未因此受到伤害，你可以对一名角色造成 1 点雷电伤害。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' || d.phase === 'end',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const isEnd = ctx.data.phase === 'end';
      const r = await ctx.judge(p, { reason: isEnd ? '宣化·反转' : '宣化' });
      const card = ctx.data.card || r?.card;
      const spade29 = card && card.suit === 'spade' && (card.num >= 2 && card.num <= 9);
      const hit = isEnd ? !spade29 : spade29;      // 结束阶段判定结果反转
      if (hit) {
        await ctx.damage({ to: p, amount: 3, nature: 'thunder', reason: 'xuanhua' });
        await ctx.log('【宣化】：判定命中【闪电】，受到 3 点雷电伤害');
        return;
      }
      await ctx.log(`【宣化】：判定【${card ? cardLabel(card) : '—'}】，未受伤害`);
      const cands = g.alive();
      const t = (await ctx.ask.targets(p, {
        prompt: isEnd ? '【宣化】：对一名角色造成 1 点雷电伤害' : '【宣化】：令一名角色回复 1 点体力',
        candidates: cands, min: 0, max: 1,
      }))[0];
      if (!t) return;
      if (isEnd) {
        await ctx.damage({ from: p, to: t, amount: 1, nature: 'thunder', reason: 'xuanhua' });
      } else if (t.hp < t.maxHp) {
        await ctx.recover(t, 1, { reason: 'xuanhua' });
      }
    },
  }],
});

// ============================================================
// 起·王荣（群 3）【丰姿】【吉占】【赋颂】
// ============================================================
// 丰姿：出牌阶段内限一次，当你使用基本牌或普通锦囊牌时，你可以弃置一张同类别手牌，
//       然后令此牌的效果额外结算一次。实现：以「此牌伤害 +1」等价替代。
defineSkill({
  id: 'jq_fengzi', name: '丰姿',
  desc: '出牌阶段内限一次，当你使用基本牌或普通锦囊牌时，你可以弃置一张同类别手牌，然后令此牌的效果额外结算一次。（实现：以「此牌伤害 +1」等价替代）',
  triggers: [{
    on: 'card.use.before', who: 'self', optional: true,
    filter: (d) => {
      const c = d.card;
      if (!c || c.type === 'equip') return false;
      const p = d.player;
      if (p.flags.jqFengziTurn === d.game.turnCount) return false;
      return p.hand.some((x) => x.type === c.type);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.jqFengziTurn = g.turnCount;
      const same = p.hand.filter((x) => x.type === (ctx.data.card?.type));
      const c = (await g.chooseSomeCards(p, same, 1, { prompt: '【丰姿】：弃置一张同类别手牌' }))[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'fengzi' });
      p.flags.jqFengziTurn = g.turnCount;
      ctx.data.jqFengziBonus = true;
      p.flags.jqFengziBonusCard = ctx.data.card?.id;
      await ctx.log('【丰姿】：此牌效果额外结算一次（伤害 +1）');
    },
  }, {
    on: 'damage.before', who: 'any',
    filter: (d) => d.from === d.player && d.card && d.player.flags.jqFengziBonusCard === d.card.id,
    async effect(ctx) { ctx.data.amount = (ctx.data.amount || 1) + 1; },
  }],
});

// 吉占：摸牌阶段开始时，你可以改为展示牌堆顶的一张牌，猜测牌堆顶的下一张牌点数大于或小于此牌，
//       然后展示之，若猜对，你可以重复此流程。最后你获得以此法展示的牌。
defineSkill({
  id: 'jq_jizhan', name: '吉占',
  desc: '摸牌阶段开始时，你可以改为展示牌堆顶的一张牌，猜测牌堆顶的下一张牌点数大于或小于此牌，然后展示之，若猜对，你可以重复此流程。最后你获得以此法展示的牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const got = [];
      let prev = g.popDeck(1)[0];
      if (!prev) return;
      got.push(prev);
      ctx.game.skipPhase(p, 'draw');
      await ctx.log(`【吉占】：展示牌堆顶【${cardLabel(prev)}】（点数 ${prev.num}）`);
      let guard = 0;
      while (guard++ < 20) {
        if (!g.deck.length) break;
        const idx = await ctx.ask.choose(p, ['猜大', '猜小'], { prompt: '【吉占】：猜下一张点数更大还是更小（也可停止）' });
        if (idx < 0) break;
        const next = g.popDeck(1)[0];
        if (!next) break;
        got.push(next);
        const bigger = next.num >= prev.num;
        const guessBig = idx === 0;
        await ctx.log(`【吉占】：展示【${cardLabel(next)}】（点数 ${next.num}）— 猜${guessBig ? '大' : '小'}${bigger === guessBig ? '，正确' : '，错误'}`);
        prev = next;
        if (bigger !== guessBig) break;
        const again = await ctx.ask.confirm(p, '【吉占】：猜对，是否继续？');
        if (!again) break;
      }
      const take = got.filter(Boolean);
      if (take.length) await ctx.gain(p, take, { reason: 'jizhan' });
      await ctx.log(`【吉占】：获得 ${take.length} 张展示牌`);
    },
  }],
});

// 赋颂：当你死亡时，你可以令一名体力上限大于你的角色选择获得【丰姿】或【吉占】。
defineSkill({
  id: 'jq_fusong', name: '赋颂',
  desc: '当你死亡时，你可以令一名体力上限大于你的角色选择获得【丰姿】或【吉占】。',
  triggers: [{
    on: 'death.after', who: 'self', optional: true,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((x) => x.maxHp > p.maxHp);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【赋颂】：选择一名体力上限大于你的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, ['获得【丰姿】', '获得【吉占】'], { prompt: '【赋颂】：请选择获得一个技能' });
      const id = idx === 0 ? 'jq_fengzi' : 'jq_jizhan';
      if (!(effSkills(t) || []).some((s) => s.id === id)) {
        const sk = getSkill(id);
        if (sk) t.skills.push(sk);
      }
      await ctx.log(`【赋颂】：${t.name} 获得【${idx === 0 ? '丰姿' : '吉占'}】`);
    },
  }],
});

// ============================================================
// 起·朱儁（群 4）【分敌】【拒降】
// ============================================================
// 分敌：每回合限一次，当你使用【杀】指定一名角色为唯一目标后，你可以展示其至少一张手牌。
//       若如此做，直到此【杀】结算结束后，其只能使用或打出这些牌；当此【杀】对其造成伤害后，你获得这些牌。
// 实现：用引擎的「响应白名单」通用能力（同 OL 闪朱儁【分敌】）：
//       展示后给目标写 flags.responseWhitelist = { cardId, targetId, ids, turn }，
//       game.useCard / game.respondCard 两条路径统一检查，此【杀】结算结束时清除。
defineSkill({
  id: 'jq_fendi', name: '分敌',
  desc: '每回合限一次，当你使用【杀】指定一名角色为唯一目标后，你可以展示其至少一张手牌。若如此做，直到此【杀】结算结束后，其只能使用或打出这些牌；当此【杀】对其造成伤害后，你获得这些牌。',
  triggers: [
    {
      on: 'target.after', who: 'self', optional: true,
      // 「唯一目标」用 d.total（本次使用声明的目标总数）判定：
      // d.used 是「已结算过的目标」数组，多目标【杀】时后面的目标结算时 d.used.length 也可能是 0，
      // 拿它当唯一目标判据会让多目标【杀】也发动【分敌】。
      filter: (d) => d.total === 1 && d.card && d.card.name === 'sha'
        && d.self.flags.jqFendiTurn !== d.game.turnCount
        && (d.target || d.to) && (d.target || d.to).hand.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.target || ctx.data.to;
        p.flags.jqFendiTurn = g.turnCount;
        const n = Math.min(2, t.hand.length);
        const pick = await g.chooseSomeCards(p, t.hand.slice(), n, { prompt: `【分敌】：展示 ${t.name} 至少一张手牌` });
        const shown = (pick && pick.length ? pick : t.hand.slice(0, 1));
        // 标记绑定到「这张【杀】」（cardId）+ 目标（targetId），且只存牌 id 不存牌对象
        // （存对象会让同一张牌同时存在于手牌与技能标记，触发牌张守恒门禁）。
        p.flags.jqFendi = {
          cardId: ctx.data.card.id, targetId: t.id, ids: shown.map((c) => c.id), turn: g.turnCount,
        };
        // 响应白名单：直到此【杀】结算结束，目标只能使用/打出这些被展示的牌
        t.flags.responseWhitelist = { cardId: ctx.data.card.id, targetId: t.id, ids: shown.map((c) => c.id), turn: g.turnCount };
        await ctx.log(`【分敌】：展示 ${t.name} 的 ${shown.map((c) => `【${cardLabel(c)}】`).join('')}（此【杀】结算结束前，其只能使用或打出这些牌）`);
      },
    },
    {
      on: 'damage.after', who: 'any',
      // 三重匹配：伤害来源是本技能拥有者、伤害由「同一张【杀】」造成、被打的是当初展示牌的目标。
      filter: (d) => {
        const p = d.player, r = p.flags.jqFendi;
        return !!r && d.from === p && !!d.card && d.card.id === r.cardId
          && d.to?.id === r.targetId && (r.ids || []).length > 0;
      },
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.to;
        const r = p.flags.jqFendi;
        p.flags.jqFendi = null;
        if (!r) return;
        const cards = t.hand.filter((c) => (r.ids || []).includes(c.id));
        if (cards.length) {
          await ctx.gain(p, cards, { from: t, reason: 'fendi' });
          await ctx.log(`【分敌】：获得展示的 ${cards.length} 张牌`);
        }
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      // 这张【杀】结算结束即无条件清空标记：被【闪】化解、被【无懈】、目标在伤害前阵亡等
      // 都走不到 damage.after，若不清就会残留到下一张【杀】，错拿上一张展示的牌。
      // ★filter 不能只依赖 jqFendi 非空：造成伤害时 damage.after 已把 jqFendi 置 null，
      //   命中后的白名单就永远清不掉（SG027 R8）。故「自己使用【杀】」本身就足以触发清理。
      filter: (d) => d.self === d.player && !!d.card
        && ((d.effName || d.card.name) === 'sha' || !!d.player.flags.jqFendi),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, cardId = ctx.data.card && ctx.data.card.id;
        // ★只清「这张牌」对应的记录（SG028 A1 残留）：自己连续使用多张【杀】时，
        //   前一张结算结束会把后一张的 jqFendi 记录一起清掉（后一张就取不回展示牌）。
        if (p.flags.jqFendi && p.flags.jqFendi.cardId === cardId) p.flags.jqFendi = null;
        // 同时清掉目标身上的响应白名单（否则会一直锁住他的手牌）
        for (const q of g.players) {
          const wl = q.flags.responseWhitelist;
          if (wl && wl.cardId === cardId) delete q.flags.responseWhitelist;
        }
      },
    },
  ],
});

// 拒降：当你于摸牌阶段外获得牌后，你可以弃置这些牌，
//       令当前回合角色于本回合额定出牌阶段内使用【杀】的次数上限 +X（X 为你此次弃置牌的花色数）。
defineSkill({
  id: 'jq_jujiang', name: '拒降',
  desc: '当你于摸牌阶段外获得牌后，你可以弃置这些牌，令当前回合角色于本回合额定出牌阶段内使用【杀】的次数上限 +X（X 为你此次弃置牌的花色数）。',
  triggers: [{
    on: 'cards.gain', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.reason !== 'draw' && (d.cards || []).length > 0
      && d.game.turnPlayer && d.game.turnPlayer !== d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, cur = g.turnPlayer;
      const cards = (ctx.data.cards || []).filter((c) => p.hand.includes(c));
      if (!cards.length) return;
      const suits = new Set(cards.map((c) => c.suit).filter(Boolean));
      await ctx.discard(p, cards, { reason: 'jujiang' });
      // ★「次数上限 +X」必须加到 shaExtra，不能去减已用次数 shaUsed（SG027 R15 残留）：
      //   本回合还没出过【杀】时 Math.max(0, 0-X)=0，额外次数一点都没生效（SG025 #12 同类问题，
      //   闪朱儁那份已改成 shaExtra，起朱儁这条漏了）。
      cur.flags.shaExtraTurn = (cur.flags.shaExtraTurn || 0) + suits.size;
      await ctx.log(`【拒降】：弃置 ${cards.length} 张牌（${suits.size} 种花色），${cur.name} 本回合【杀】次数上限 +${suits.size}`);
    },
  }],
});

// ============================================================
// 起·孔融（群 3）【礼让】【争义】
// ============================================================
// 礼让：每轮限一次，其他角色的摸牌阶段开始时，你可以交给其两张牌，
//       然后本回合的弃牌阶段结束时，你可以获得其此阶段内弃置的牌。
defineSkill({
  id: 'jq_lirang', name: '礼让',
  desc: '每轮限一次，其他角色的摸牌阶段开始时，你可以交给其两张牌，然后本回合的弃牌阶段结束时，你可以获得其此阶段内弃置的牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'any', optional: true,
      filter: (d) => d.phase === 'draw' && d.self !== d.player && d.player.hand.length >= 2
        && d.player.flags.jqLirangRound !== d.game.round,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.self;
        p.flags.jqLirangRound = g.round;
        const pick = await g.chooseSomeCards(p, p.hand.slice(), 2, { prompt: `【礼让】：交给 ${t.name} 两张牌` });
        if (!pick || pick.length < 2) return;
        await ctx.gain(t, pick, { from: p, reason: 'lirang' });
        p.flags.jqLirangTarget = t.id;
        p.flags.jqLirangTurn = g.turnCount;
        t.flags.jqLirangGot = true;
        await ctx.log(`【礼让】：交给 ${t.name} 两张牌`);
      },
    },
    {
      on: 'phase.end', who: 'any', optional: true,
      filter: (d) => d.phase === 'discard' && d.player.flags.jqLirangTurn === d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.self;
        const cards = (g.discardPile || []).filter((c) => (c.fromSeat === t.seat) || (c.owner === t.id));
        const picked = cards.length ? cards : [];
        if (picked.length) {
          await ctx.gain(p, picked, { reason: 'lirang' });
          await ctx.log(`【礼让】：获得 ${t.name} 弃牌阶段弃置的 ${picked.length} 张牌`);
        }
      },
    },
  ],
});

// 争义：当你每回合首次受到伤害时，本轮因【礼让】获得过牌的其他角色可以令你将此伤害转移给其。
defineSkill({
  id: 'jq_zhengyi', name: '争义',
  desc: '当你每回合首次受到伤害时，本轮因【礼让】获得过牌的其他角色可以令你将此伤害转移给其。',
  triggers: [{
    on: 'damage.before', who: 'self',
    filter: (d) => d.to === d.player && d.player.flags.jqZhengyiTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((x) => x !== p && x.flags.jqLirangGot);
      if (!cands.length) return;
      p.flags.jqZhengyiTurn = g.turnCount;
      const t = cands.find((x) => true);
      const yes = await ctx.ask.confirm(t, `【争义】：是否将 ${p.name} 受到的伤害转移给你？`);
      if (!yes) return;
      ctx.data.to = t;
      await ctx.log(`【争义】：${t.name} 令此伤害转移给其`);
    },
  }],
});

// ============================================================
// 起·段煨（群 4）【狼灭】
// ============================================================
// 狼灭：其他角色的结束阶段，你可以选择一项：
//       1.若其本回合使用过至少两张类别相同的牌，你弃置一张牌，然后摸两张牌；
//       2.若其本回合造成过至少 2 点伤害，你弃置一张牌，然后对其造成 1 点伤害。
defineSkill({
  id: 'jq_langmie', name: '狼灭',
  desc: '其他角色的结束阶段，你可以选择一项：1.若其本回合使用过至少两张类别相同的牌，你弃置一张牌，然后摸两张牌；2.若其本回合造成过至少 2 点伤害，你弃置一张牌，然后对其造成 1 点伤害。',
  triggers: [
    // 记录每名角色本回合使用牌的类别计数与造成的伤害值
    {
      on: 'card.use.after', who: 'any', priority: 1,
      async effect(ctx) {
        const d = ctx.data, p = d.self;
        if (!p) return;
        if (p.flags.jqCatsTurn !== ctx.game.turnCount) { p.flags.jqCatsTurn = ctx.game.turnCount; p.flags.jqCats = {}; }
        const type = d.card?.type || 'other';
        p.flags.jqCats[type] = (p.flags.jqCats[type] || 0) + 1;
      },
    },
    {
      on: 'damage.after', who: 'any', priority: 1,
      async effect(ctx) {
        const from = ctx.data.from;
        if (!from) return;
        if (from.flags.jqDmgTurn !== ctx.game.turnCount) { from.flags.jqDmgTurn = ctx.game.turnCount; from.flags.jqDmgTotal = 0; }
        from.flags.jqDmgTotal = (from.flags.jqDmgTotal || 0) + (ctx.data.amount || 0);
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: true,
      filter: (d) => d.phase === 'end' && d.self !== d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.self;
        const cats = (t.flags.jqCatsTurn === g.turnCount) ? (t.flags.jqCats || {}) : {};
        const manyCards = Object.values(cats).some((n) => n >= 2);
        const dmg = (t.flags.jqDmgTurn === g.turnCount) ? (t.flags.jqDmgTotal || 0) : 0;
        const opts = [];
        if (manyCards) opts.push('弃置一张牌，然后摸两张牌');
        if (dmg >= 2) opts.push(`弃置一张牌，然后对 ${t.name} 造成 1 点伤害`);
        if (!opts.length || !p.hand.length) return;
        const idx = await ctx.ask.choose(p, opts, { prompt: '【狼灭】：选择一项' });
        if (idx < 0) return;
        const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【狼灭】：弃置一张牌' }))[0];
        if (c) await ctx.discard(p, [c], { reason: 'langmie' });
        if (idx === 0) {
          await ctx.draw(p, 2, { reason: 'langmie' });
          await ctx.log('【狼灭】：摸两张牌');
        } else {
          await ctx.damage({ from: p, to: t, amount: 1, reason: 'langmie' });
          await ctx.log(`【狼灭】：对 ${t.name} 造成 1 点伤害`);
        }
      },
    },
  ],
});

// ============================================================
// 起·刘宏（群 4，主公）【朝争】【甚宠】【聚敛】
// ============================================================
// 朝争：准备阶段，你可以令所有其他角色议事，若结果为：红色，意见为红色的角色各回复 1 点体力；
//       黑色，意见为红色的角色各失去 1 点体力。此次议事结束后，若所有角色意见相同，你摸 X 张牌。
defineSkill({
  id: 'jq_chaozheng', name: '朝争',
  desc: '准备阶段，你可以令所有其他角色议事，若结果为：红色，意见为红色的角色各回复 1 点体力；黑色，意见为红色的角色各失去 1 点体力。此次议事结束后，若所有角色意见相同，你摸 X 张牌（X 为此次议事的角色数）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const parts = g.alive().filter((x) => x !== p);
      if (parts.filter((x) => x.hand.length).length < 2) { await ctx.log('【朝争】：能参与议事的角色不足 2 名'); return; }
      const r = await runYishi(g, p, parts, { prompt: '【朝争】：议事——展示一张手牌作为意见' });
      const RES = { red: '红色', black: '黑色', none: '无结果' };
      await ctx.log(`【朝争】：议事 — 红 ${r.red.length} / 黑 ${r.black.length} → ${RES[r.result]}`);
      if (r.result === 'red') {
        for (const q of r.red) if (q.alive && q.hp < q.maxHp) await ctx.recover(q, 1, { reason: 'chaozheng' });
        await ctx.log('【朝争】：红色胜，红色意见者各回复 1 点体力');
      } else if (r.result === 'black') {
        for (const q of r.red) if (q.alive) await ctx.loseHp(q, 1, { reason: 'chaozheng' });
        await ctx.log('【朝争】：黑色胜，红色意见者各失去 1 点体力');
      } else {
        await ctx.log('【朝争】：红黑意见数相等，议事无结果');
      }
      const same = r.total > 0 && (r.red.length === 0 || r.black.length === 0);
      if (same) {
        await ctx.draw(p, r.total, { reason: 'chaozheng' });
        await ctx.log(`【朝争】：所有人意见相同，摸 ${r.total} 张牌`);
      }
      await emitYishiEnd(g, p, r);
    },
  }],
});

// 甚宠：限定技，出牌阶段，你可以令一名其他角色获得【飞扬】和【跋扈】。
//       若如此做，当你死亡时，其失去所有技能，弃置所有手牌。
defineSkill({
  id: 'jq_shenchong', name: '甚宠',
  desc: '限定技，出牌阶段，你可以令一名其他角色获得【飞扬】和【跋扈】。若如此做，当你死亡时，其失去所有技能，弃置所有手牌。',
  active: {
    perTurn: false,
    prompt: '甚宠（限定技）：令一名其他角色获得【飞扬】【跋扈】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jqShenchongUsed) { await ctx.log('【甚宠】：限定技已发动过'); return; }
      const cands = g.alive().filter((x) => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【甚宠】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.jqShenchongUsed = true;
      p.flags.jqShenchongTarget = t.id;
      for (const id of ['feiyang', 'bahu']) {
        if (!(effSkills(t) || []).some((s) => s.id === id)) {
          const sk = getSkill(id);
          if (sk) t.skills.push(sk);
        }
      }
      await ctx.log(`【甚宠】：${t.name} 获得【飞扬】【跋扈】`);
    },
  },
  triggers: [{
    on: 'death.after', who: 'self',
    filter: (d) => !!d.self.flags.jqShenchongTarget,
    async effect(ctx) {
      const g = ctx.game;
      const t = g.byId(ctx.data.self.flags.jqShenchongTarget);
      if (!t) return;
      t.skills = (t.skills || []).filter((s) => s.id !== 'feiyang' && s.id !== 'bahu');
      if (t.hand.length) await ctx.discard(t, t.hand.slice(), { reason: 'shenchong' });
      await ctx.log(`【甚宠】：${t.name} 失去【飞扬】【跋扈】并弃置所有手牌`);
    },
  }],
});

// 聚敛：主公技，其他群势力角色回合内限两次，当其于摸牌阶段外不因此技能而摸牌后，其可以摸一张牌；
//       结束阶段，你可以获得所有其他群势力角色各一张手牌。
defineSkill({
  id: 'jq_julian', name: '聚敛',
  desc: '主公技，其他群势力角色回合内限两次，当其于摸牌阶段外不因此技能而摸牌后，其可以摸一张牌；结束阶段，你可以获得所有其他群势力角色各一张手牌。',
  triggers: [
    {
      on: 'cards.draw.after', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && d.self.kingdom === 'qun'
        && d.reason !== 'draw' && d.reason !== 'julian'
        && (d.self.flags.jqJulianCount || 0) < 2,
      async effect(ctx) {
        const t = ctx.data.self;
        t.flags.jqJulianCount = (t.flags.jqJulianCount || 0) + 1;
        await ctx.draw(t, 1, { reason: 'julian' });
        await ctx.log(`【聚敛】：${t.name} 摸一张牌`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'end',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter((x) => x !== p && x.kingdom === 'qun' && x.hand.length > 0);
        if (!cands.length) return;
        for (const t of cands) {
          const c = (await g.chooseSomeCards(p, t.hand.slice(), 1, { prompt: `【聚敛】：获得 ${t.name} 一张手牌` }))[0];
          if (c) await ctx.gain(p, [c], { from: t, reason: 'julian' });
        }
        await ctx.log(`【聚敛】：获得 ${cands.map((t) => t.name).join('、')} 各一张手牌`);
      },
    },
  ],
});
