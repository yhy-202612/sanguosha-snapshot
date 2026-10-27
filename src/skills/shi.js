// 手杀「兵势篇·势」10 将技能（阶段 5E 批次 15 将之一半）
//   势魏延 / 势陈到 / 势陆郁生 / 势黄祖 / 势张任 / 势孙綝 / 势曹爽 / 势陈群 / 势程普 / 势周瑜
//
// 资料核验说明：
//   - 势魏延 / 势陈到 / 势陆郁生 / 势黄祖 / 势孙綝 / 势程普 / 势周瑜 / 势陈群：技能文本核到官方（三国杀官网 / 萌娘百科 兵势篇 2025-2026 版），按原文实现。
//   - 势张任：核到 bilibili wiki 的「兵势篇-奇包」爆料版（简略描述），个别细节（“技能失效”的实现）为**简化口径**，见各技能注释。
//   - 【资料未核实】势曹爽：仅核到「兵势篇-势包，魏 4 体力，2026-02-08 上线，技能 擅政/典易/渐专」的框架与两版测试文本，
//     官方定稿文本未能核到，本文件按「擅政 + 典易 + 渐专（累积时机→提升体力上限）」的最合理口径实现，标注【资料未核实】。
//
// 全局简化（均在对应技能注释里再次说明）：
//   1. 本引擎牌堆没有“火【杀】”这一独立牌，涉及“火【杀】”的效果统一按【杀】处理。
//   2. 「攻击范围+X」用 player.flags.rangeBonus 表示（引擎 attackRange 已支持）；“无距离限制”以 rangeBonus+8 近似。
//   3. “技能失效”引擎无通用开关，势张任【伏暗】的选项②复用引擎既有的“本回合不能使用或打出手牌”机制（xiongluanBan）。
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';

// ---------------- 公用小工具 ----------------
let vseq = 0;
const VC = (name, extra = {}) => ({
  id: `vc5es_${++vseq}`, name, suit: 'spade', num: 7, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const isRed = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const colorOf = (c) => (isRed(c) ? 'red' : 'black');
const COLOR_CN = { red: '红色', black: '黑色' };
const typeOf = (c) => CARD_META[c?.name]?.type || 'basic';
const allCardsOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card)),
];
const equipCount = (p) => Object.values(p?.equips || {}).filter(Boolean).length;
const takeDiscard = (g, c) => {
  const i = g.discardPile.indexOf(c);
  if (i >= 0) g.discardPile.splice(i, 1);
  return c;
};
const takeFromDeck = (g, c) => {
  const i = g.deck.indexOf(c);
  if (i >= 0) g.deck.splice(i, 1);
  return c;
};
const DAMAGE_NAMES = ['sha', 'juedou', 'nanman', 'wanjian', 'huogong'];
const isDamageCard = (nm) => DAMAGE_NAMES.includes(nm);
// 势力技/派生技：把技能对象塞进武将技能表（引擎按 p.skills 收集触发器）
const learn = (p, id, ctx) => {
  if (!effSkills(p).some(s => s.id === id)) {
    const sk = getSkill(id);
    if (sk) p.skills.push(sk);
  }
  return ctx.log(`【${getSkill(id)?.name || id}】：${p.name} 获得该技能`);
};
const forget = (p, id) => {
  const i = p.skills.findIndex(s => s.id === id);
  if (i >= 0) p.skills.splice(i, 1);
  return i >= 0;
};

// ======================================================================
// 势魏延（蜀 4）· 壮誓 / 饮战 / 忠傲（+ 狂骨 / 困奋）
// ======================================================================
defineSkill({
  id: 'zhuangshi', name: '壮誓',
  desc: '出牌阶段开始时，你可以执行其中的任意项：1.弃置任意张手牌，然后你于此阶段内使用的前等量张牌无距离限制且不可被响应；2.失去任意点体力，然后你于此阶段内使用的前等量张牌不计入次数。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true, prompt: '是否发动【壮誓】？',
    filter: (d) => d.phase === 'play',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      // 项 1：弃置手牌 → 本阶段前等量张牌无距离限制且不可被响应
      const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(4, p.hand.length), {
        prompt: '【壮誓】①：弃置任意张手牌（每弃 1 张，本阶段前 1 张牌无距离限制且不可被响应；可取消）',
      });
      if (picks.length) {
        await ctx.discard(p, picks, { reason: 'zhuangshi' });
        p.flags.zsFree = (p.flags.zsFree || 0) + picks.length;
        p.flags.zsRange = (p.flags.zsRange || 0) + picks.length * 8;
        p.flags.rangeBonus = (p.flags.rangeBonus || 0) + picks.length * 8;
        await ctx.log(`【壮誓】①：${p.name} 弃置 ${picks.length} 张手牌，本阶段前 ${p.flags.zsFree} 张牌无距离限制且不可被响应`);
      }
      // 项 2：失去体力 → 本阶段前等量张牌不计入次数
      if (p.hp > 1 && await ctx.ask.confirm(p, '【壮誓】②：是否失去 1 点体力，令本阶段你使用的牌不计入次数？')) {
        await ctx.loseHp(p, 1, { reason: 'zhuangshi' });
        p.flags.shaLimitBypass = true;
        p.flags.zsNoLimit = true;
        await ctx.log(`【壮誓】②：${p.name} 失去 1 点体力，本阶段使用牌不计入次数`);
      }
    },
  }, {
    on: 'card.use.before', who: 'self',
    filter: (d) => (d.player.flags.zsFree || 0) > 0,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.zsFree -= 1;
      ctx.data.unavoidable = true;
      await ctx.log(`【壮誓】：${p.name} 此牌无距离限制且不可被响应`);
    },
  }, {
    on: 'phase.end', who: 'self',
    filter: (d) => d.phase === 'play' && ((d.player.flags.zsRange || 0) > 0 || d.player.flags.zsNoLimit),
    async effect(ctx) {
      const p = ctx.self;
      p.flags.rangeBonus = Math.max(0, (p.flags.rangeBonus || 0) - (p.flags.zsRange || 0));
      p.flags.zsRange = 0;
      p.flags.zsFree = 0;
      if (p.flags.zsNoLimit) { p.flags.shaLimitBypass = false; p.flags.zsNoLimit = false; }
    },
  }],
});

defineSkill({
  id: 'yinzhan', name: '饮战',
  desc: '锁定技，当你使用【杀】对一名角色造成伤害时，若你的：体力值小于等于其，则此伤害+1；牌数小于等于其，则你于此【杀】结算结束后弃置其一张牌。“乘势”：你回复1点体力并获得其以此法弃置的牌。',
  triggers: [{
    on: 'damage.before', who: 'any',
    filter: (d) => d.from === d.player && d.to && d.to !== d.player
      && (d.card?.name === 'sha' || d.reason === 'sha' || d.reason === 'yinzhan'),
    async effect(ctx) {
      const p = ctx.self, to = ctx.data.to;
      const hpCond = p.hp <= to.hp;
      const handCond = allCardsOf(p).length <= allCardsOf(to).length;
      if (hpCond) {
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log(`【饮战】：${p.name} 体力值不大于 ${to.name}，此伤害+1`);
      }
      if (handCond) p.flags.yzPending = { seat: to.seat, steal: hpCond };
    },
  }, {
    on: 'damage.after', who: 'any',
    filter: (d) => d.from === d.player && d.to && d.player.flags.yzPending && d.player.flags.yzPending.seat === d.to.seat,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, to = ctx.data.to;
      const pend = p.flags.yzPending;
      p.flags.yzPending = null;
      const pool = allCardsOf(to);
      if (!pool.length) return;
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: `【饮战】：弃置 ${to.name} 的一张牌` });
      if (!picks.length) return;
      await ctx.discard(to, picks, { reason: 'yinzhan' });
      await ctx.log(`【饮战】：${p.name} 弃置了 ${to.name} 的一张牌`);
      if (pend.steal) {
        for (const c of picks) takeDiscard(g, c);
        await ctx.recover(p, 1);
        await ctx.gain(p, picks, { reason: 'yinzhan' });
        await ctx.log(`【饮战】乘势：${p.name} 回复1点体力并获得其弃置的牌`);
      }
    },
  }],
});

defineSkill({
  id: 'zhongao', name: '忠傲',
  desc: '使命技，游戏开始时，你获得【狂骨】。成功：当你杀死一名角色后，你为【狂骨】增加选项“背水：弃置一张牌，然后你此阶段使用【杀】的次数+1”。失败：当你进入濒死状态时，或你选择不执行【壮誓】时，你失去【壮誓】并获得【困奋】。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) {
      await ctx.log(`【忠傲】：${ctx.self.name} 获得技能【狂骨】`);
      await learn(ctx.self, 'kuanggu3', ctx);
    },
  }, {
    on: 'death.after', who: 'any', optional: true, prompt: '是否发动【忠傲】？',
    filter: (d) => d.self !== d.player && d.from === d.player && !d.player.flags.kuangguUp,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.kuangguUp = true;
      await ctx.log(`【忠傲】使命成功：${p.name} 令【狂骨】增加“背水”选项`);
    },
  }, {
    on: 'dying.begin', who: 'self',
    filter: (d) => !d.player.flags.zhongaoFailed,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.zhongaoFailed = true;
      forget(p, 'zhuangshi');
      await ctx.log(`【忠傲】使命失败：${p.name} 失去【壮誓】`);
      await learn(p, 'kunfen', ctx);
    },
  }],
});

defineSkill({
  id: 'kuanggu3', name: '狂骨',
  desc: '当你对距离1以内的一名角色造成伤害后，你可以选择一项：1.回复1点体力；2.摸一张牌。背水（【忠傲】使命成功后追加）：弃置一张牌，然后你此阶段使用【杀】的次数+1。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true, prompt: '是否发动【狂骨】？',
    filter: (d) => d.from === d.player && d.to && d.to !== d.player && d.game.distance(d.player, d.to) <= 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const opts = ['回复1点体力', '摸一张牌'];
      if (p.flags.kuangguUp) opts.push('背水：弃置一张牌，本阶段使用【杀】次数+1');
      const idx = await g.chooseOne(p, opts, { prompt: `【狂骨】：${ctx.data.to.name} 受到你的伤害，请选择一项` });
      if (idx === 0) await ctx.recover(p, 1);
      else if (idx === 1) await ctx.draw(p, 1, { reason: 'kuanggu3' });
      else if (idx === 2) {
        const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【狂骨】背水：弃置一张牌' });
        if (picks.length) {
          await ctx.discard(p, picks, { reason: 'kuanggu3' });
          p.flags.shaLimitBypass = true;
        }
      }
      await ctx.log(`【狂骨】：${p.name} 对近距离角色的伤害结算`);
    },
  }],
});

defineSkill({
  id: 'kunfen', name: '困奋',
  desc: '锁定技，结束阶段，你失去1点体力，然后摸两张牌。',
  triggers: [{
    on: 'phase.end', who: 'self',
    filter: (d) => d.phase === 'end',
    async effect(ctx) {
      const p = ctx.self;
      await ctx.loseHp(p, 1, { reason: 'kunfen' });
      await ctx.draw(p, 2, { reason: 'kunfen' });
      await ctx.log(`【困奋】：${p.name} 失去1点体力并摸两张牌`);
    },
  }],
});

// ======================================================================
// 势陈到（蜀 4）· 往烈 / 弘毅
// ======================================================================
defineSkill({
  id: 'wanglie2', name: '往烈',
  desc: '出牌阶段开始时，你可以选择一张手牌，你于此阶段内：使用此牌无距离限制且不可被响应；使用此牌结算结束后不能再对其他角色使用牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true, prompt: '是否发动【往烈】？',
    filter: (d) => d.phase === 'play' && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【往烈】：选择一张手牌（此阶段使用它无距离限制且不可被响应，结算后不能再对其他角色使用牌）' });
      if (!picks.length) return;
      p.flags.wlId = picks[0].id;
      p.flags.wlRange = 8;
      p.flags.rangeBonus = (p.flags.rangeBonus || 0) + 8;
      p.flags.wlDone = false;
      await ctx.log(`【往烈】：${p.name} 选定 ${cardLabel(picks[0])}（无距离限制且不可被响应）`);
    },
  }, {
    on: 'card.use.before', who: 'self',
    filter: (d) => (d.player.flags.wlId && d.card && d.card.id === d.player.flags.wlId)
      || (d.player.flags.wlDone && (d.targets || []).some(t => t && t !== d.player)),
    async effect(ctx) {
      const p = ctx.self, d = ctx.data;
      if (d.card && d.card.id === p.flags.wlId) {
        d.unavoidable = true;
        p.flags.wlDone = true;
        await ctx.log(`【往烈】：${p.name} 此牌无距离限制且不可被响应`);
        return;
      }
      d.canceled = true;
      await ctx.log(`【往烈】：${p.name} 已使用过选定的牌，本阶段不能再对其他角色使用牌`);
    },
  }, {
    on: 'phase.end', who: 'self',
    filter: (d) => d.player.flags.wlRange || d.player.flags.wlId,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.rangeBonus = Math.max(0, (p.flags.rangeBonus || 0) - (p.flags.wlRange || 0));
      p.flags.wlRange = 0; p.flags.wlId = null; p.flags.wlDone = false;
    },
  }],
});

defineSkill({
  id: 'hongyi', name: '弘毅',
  desc: '锁定技，游戏开始时，你获得2个“毅”标记；当你造成或受到伤害后，你获得1个“毅”标记；你至多拥有4个“毅”标记；准备阶段（X为你此时拥有的“毅”标记数），你选择执行一项，并于结束阶段执行另一项：1.摸X张牌；2.清空“毅”标记。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) {
      const p = ctx.self;
      p.marks.yi = Math.min(4, (p.marks.yi || 0) + 2);
      await ctx.log(`【弘毅】：${p.name} 获得 2 枚“毅”标记（当前 ${p.marks.yi}）`);
    },
  }, {
    on: 'damage.after', who: 'any',
    filter: (d) => d.from === d.player || d.to === d.player,
    async effect(ctx) {
      const p = ctx.self;
      p.marks.yi = Math.min(4, (p.marks.yi || 0) + 1);
      await ctx.log(`【弘毅】：${p.name} 获得 1 枚“毅”标记（当前 ${p.marks.yi}）`);
    },
  }, {
    on: 'phase.begin', who: 'self', optional: true, prompt: '是否发动【弘毅】？',
    filter: (d) => d.phase === 'prepare' && (d.player.marks.yi || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = p.marks.yi || 0;
      const idx = await g.chooseOne(p, [`摸 ${x} 张牌（结束阶段清空“毅”）`, '清空“毅”标记（结束阶段摸牌）'],
        { prompt: `【弘毅】：当前“毅” ${x}，请选择此时执行的一项（另一项于结束阶段执行）` });
      if (idx < 0) return;
      p.flags.hyEnd = idx === 0 ? 1 : 2;
      p.flags.hyX = x;
      if (idx === 0) { await ctx.draw(p, x, { reason: 'hongyi' }); await ctx.log(`【弘毅】：${p.name} 摸 ${x} 张牌`); }
      else { p.marks.yi = 0; await ctx.log(`【弘毅】：${p.name} 清空“毅”标记`); }
    },
  }, {
    on: 'phase.end', who: 'self',
    filter: (d) => d.phase === 'end' && !!d.player.flags.hyEnd,
    async effect(ctx) {
      const p = ctx.self;
      const x = p.flags.hyX || 0, mode = p.flags.hyEnd;
      p.flags.hyEnd = 0;
      if (mode === 1) { p.marks.yi = 0; await ctx.log(`【弘毅】：${p.name} 于结束阶段清空“毅”标记`); }
      else { await ctx.draw(p, x, { reason: 'hongyi' }); await ctx.log(`【弘毅】：${p.name} 于结束阶段摸 ${x} 张牌`); }
    },
  }],
});

// ======================================================================
// 势陆郁生（吴 3 女）· 润微 / 霜怀
// ======================================================================
defineSkill({
  id: 'runwei', name: '润微',
  desc: '出牌阶段限一次，你可以展示牌堆顶至多五张牌，令一名角色获得其中一种颜色的所有牌。若如此做：1.每阶段限一次，你失去X张牌后（X为其因此获得的牌数），该技能可以再次发动且不能指定本阶段获得过牌的角色为目标；2.本阶段结束时，你弃置以此法获得的手牌。',
  active: {
    prompt: '润微：展示牌堆顶至多五张牌，令一名角色获得其中一种颜色的所有牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const phaseKey = `${g.turnCount}-play`;
      if (p.flags.rwKey !== phaseKey) {
        p.flags.rwKey = phaseKey; p.flags.rwN = 0; p.flags.rwSeats = []; p.flags.rwReturn = [];
      }
      if ((p.flags.rwN || 0) >= 2) { await ctx.log('✗【润微】本阶段已发动两次'); return; }
      const n = Math.min(5, g.deck.length);
      if (!n) { await ctx.log('✗【润微】牌堆为空'); return; }
      const top = g.deck.slice(-n);          // 牌堆顶在数组末尾
      await ctx.log(`【润微】：展示牌堆顶 ${n} 张：${top.map(cardLabel).join('、')}`);
      const reds = top.filter(isRed), blacks = top.filter(c => !isRed(c));
      const colorOpts = [];
      if (reds.length) colorOpts.push(`红色（${reds.map(cardLabel).join('、')}）`);
      if (blacks.length) colorOpts.push(`黑色（${blacks.map(cardLabel).join('、')}）`);
      if (!colorOpts.length) return;
      const ci = await g.chooseOne(p, colorOpts, { prompt: '【润微】：选择一种颜色（目标获得该颜色的所有牌）' });
      if (ci < 0) return;
      const color = (reds.length && ci === 0) ? 'red' : 'black';
      const gain = top.filter(c => (color === 'red' ? isRed(c) : !isRed(c)));
      const banned = p.flags.rwSeats || [];
      const cands = g.alive().filter(q => !banned.includes(q.seat));
      if (!cands.length) { await ctx.log('【润微】：没有合法的目标'); return; }
      const tg = await g.chooseTargets(p, { candidates: cands, min: 1, max: 1, prompt: '【润微】：令一名角色获得这些牌' });
      const target = tg[0] || cands[0];
      for (const c of gain) takeFromDeck(g, c);
      target.hand.push(...gain);
      await ctx.log(`【润微】：${target.name} 获得 ${COLOR_CN[color]}的 ${gain.length} 张牌`);
      p.flags.rwN = (p.flags.rwN || 0) + 1;
      p.flags.rwSeats = [...banned, target.seat];
      if (target === p) p.flags.rwReturn = [...(p.flags.rwReturn || []), ...gain.map(c => c.id)];
    },
  },
  triggers: [{
    on: 'phase.end', who: 'self',
    filter: (d) => d.phase === 'play' && (d.player.flags.rwReturn || []).length > 0,
    async effect(ctx) {
      const p = ctx.self;
      const ids = p.flags.rwReturn || [];
      p.flags.rwReturn = [];
      const cards = p.hand.filter(c => ids.includes(c.id));
      if (!cards.length) return;
      await ctx.discard(p, cards, { reason: 'runwei' });
      await ctx.log(`【润微】：${p.name} 弃置以此法获得的 ${cards.length} 张手牌`);
    },
  }],
});

defineSkill({
  id: 'shuanghuai', name: '霜怀',
  desc: '每回合限一次，当与你距离1以内的其他角色受到伤害时，你可以选择一项：1.防止此伤害；2.令其从弃牌堆中获得一张【桃】。若该角色与你上一次发动时相同，你与其各摸一张牌；不同，你失去1点体力。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: true, prompt: '是否发动【霜怀】？',
    filter: (d) => d.to && d.to !== d.player && (d.amount || 1) > 0
      && d.game.distance(d.player, d.to) <= 1 && d.player.flags.shTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, to = ctx.data.to;
      p.flags.shTurn = g.turnCount;
      const idx = await g.chooseOne(p, ['防止此伤害', '令其从弃牌堆中获得一张【桃】'],
        { prompt: `【霜怀】：${to.name} 受到伤害，请选择一项` });
      if (idx === 0) {
        ctx.data.canceled = true;
        await ctx.log(`【霜怀】：${p.name} 防止了 ${to.name} 受到的伤害`);
      } else if (idx === 1) {
        const tao = g.discardPile.find(c => c.name === 'tao');
        if (tao) {
          takeDiscard(g, tao);
          await ctx.gain(to, [tao], { reason: 'shuanghuai' });
          await ctx.log(`【霜怀】：${to.name} 从弃牌堆中获得一张【桃】`);
        } else await ctx.log('【霜怀】：弃牌堆中没有【桃】');
      } else return;
      const same = p.flags.shLast === to.seat;
      p.flags.shLast = to.seat;
      if (same) {
        await ctx.draw(p, 1, { reason: 'shuanghuai' });
        await ctx.draw(to, 1, { reason: 'shuanghuai' });
        await ctx.log(`【霜怀】：与上次目标相同，${p.name} 与 ${to.name} 各摸一张牌`);
      } else {
        await ctx.loseHp(p, 1, { reason: 'shuanghuai' });
        await ctx.log(`【霜怀】：与上次目标不同，${p.name} 失去1点体力`);
      }
    },
  }],
});

// ======================================================================
// 势黄祖（群 4）· 鸱张 / 断鞅
// ======================================================================
defineSkill({
  id: 'chizhang', name: '鸱张',
  desc: '你使用伤害类牌无距离限制。当你使用手牌中除【闪电】外的伤害类牌指定目标后，你可以弃置任意张手牌，令其他角色不能使用或打出与你以此法弃置牌颜色相同的牌响应此牌。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) {
      const p = ctx.self;
      p.flags.rangeBonus = (p.flags.rangeBonus || 0) + 8;
      p.flags.czRange = (p.flags.czRange || 0) + 8;
      await ctx.log(`【鸱张】：${p.name} 使用伤害类牌无距离限制`);
    },
  }, {
    on: 'card.use.before', who: 'self', optional: true, prompt: '是否发动【鸱张】？',
    filter: (d) => isDamageCard(d.effName) && d.card && d.player.hand.includes(d.card)
      && (d.targets || []).some(t => t && t !== d.player),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const pool = p.hand.filter(c => c !== d.card);
      if (!pool.length) return;
      const picks = await g.chooseSomeCards(p, pool, Math.min(2, pool.length),
        { prompt: '【鸱张】：可弃置任意张手牌，令其他角色不能用同颜色的牌响应此牌' });
      if (!picks.length) return;
      await ctx.discard(p, picks, { reason: 'chizhang' });
      const colors = [...new Set(picks.map(colorOf))];
      for (const t of d.targets) {
        if (t && t !== p) t.flags.noShan = d.card.id;
      }
      await ctx.log(`【鸱张】：${p.name} 弃置 ${picks.map(cardLabel).join('、')}（${colors.map(c => COLOR_CN[c]).join('、')}），其他角色不能以此颜色牌响应`);
    },
  }],
});

defineSkill({
  id: 'duanyang', name: '断鞅',
  desc: '每回合限一次，当你不因使用而失去手牌后，你可以将其中随机一张【杀】置于武将牌上，并于本阶段结束时使用之（无次数限制）；当你以此法使用【杀】造成伤害后，你可以重铸受伤角色区域里的至多两张牌，然后摸四张牌。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: true, prompt: '是否发动【断鞅】？',
    filter: (d) => d.self === d.player && d.reason !== 'duanyang' && d.player.flags.dyTurn !== d.game.turnCount
      && (d.cards || []).some(c => c.name === 'sha'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const shas = (ctx.data.cards || []).filter(c => c.name === 'sha');
      if (!shas.length) return;
      const c = g.rng.pick(shas);
      takeDiscard(g, c);
      p.flags.duanCards = [...(p.flags.duanCards || []), c];
      p.flags.dyTurn = g.turnCount;
      await ctx.log(`【断鞅】：${p.name} 将 ${cardLabel(c)} 置于武将牌上，本阶段结束时使用之`);
    },
  }, {
    on: 'phase.end', who: 'self',
    filter: (d) => (d.player.flags.duanCards || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cards = p.flags.duanCards.slice();
      p.flags.duanCards = [];
      for (const c of cards) {
        const cands = g.alive().filter(q => q !== p);
        if (!cands.length) { await ctx.discard(p, [c], { reason: 'duanyang' }); continue; }
        const tg = await g.chooseTargets(p, { candidates: cands, min: 1, max: 1, prompt: '【断鞅】：选择此【杀】的目标' });
        const targets = tg.length ? tg : [cands[0]];
        const ok = await ctx.useCard({ from: p, card: c, targets, reason: 'duanyang', ignoreRange: true, ignoreShaLimit: true });
        if (ok === false) await ctx.discard(p, [c], { reason: 'duanyang' });
      }
      await ctx.log(`【断鞅】：${p.name} 使用了置于武将牌上的【杀】（无次数限制）`);
    },
  }, {
    on: 'damage.after', who: 'any', optional: true, prompt: '是否发动【断鞅】？',
    filter: (d) => d.from === d.player && d.reason === 'duanyang' && d.to,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, to = ctx.data.to;
      const pool = allCardsOf(to);
      let n = 0;
      if (pool.length) {
        const picks = await g.chooseSomeCards(p, pool, Math.min(2, pool.length), { prompt: `【断鞅】：重铸 ${to.name} 区域里的至多两张牌` });
        if (picks.length) {
          await ctx.discard(to, picks, { reason: 'duanyang' });
          n = picks.length;
        }
      }
      await ctx.draw(p, 4, { reason: 'duanyang' });
      await ctx.log(`【断鞅】：${p.name} 重铸 ${n} 张牌，然后摸四张牌`);
    },
  }],
});

// ======================================================================
// 势张任（群 4）· 伏暗 / 引弦   —— 技能文本取自 bilibili wiki「兵势篇-奇包」简略描述
// ======================================================================
defineSkill({
  id: 'fuan', name: '伏暗',
  desc: '①结束阶段，你可以将你基础的攻击范围调整至0，并失去因“引弦”增加的攻击范围，若如此做，你摸因此减少的攻击范围张牌（至多摸5张），然后选择一个手牌中的花色并记录（每轮每个花色限一次）。②其他角色的回合结束时，若本回合有你记录花色的牌进入了弃牌堆，你可以移除对应花色，然后对一名角色视为使用一张无距离限制的【杀】；若此牌造成伤害，结算完毕后你可以选择一项：1.再次发动“伏暗”（此选项失效）；2.令该角色本回合不能使用或打出手牌。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: true, prompt: '是否发动【伏暗】？',
    filter: (d) => d.phase === 'end',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const lost = Math.max(0, p.flags.rangeBonus || 0);
      p.flags.rangeBonus = 0;
      const drawN = Math.min(5, lost);
      if (drawN > 0) await ctx.draw(p, drawN, { reason: 'fuan' });
      const rec = p.flags.fuanSuits || [];
      const suits = [...new Set(p.hand.map(c => c.suit))].filter(s => !rec.includes(s));
      if (suits.length) {
        const idx = await g.chooseOne(p, suits.map(s => `记录花色 ${SUIT_CN[s]}`), { prompt: '【伏暗】：选择一种花色记录（每轮每种花色限一次）' });
        if (idx >= 0) p.flags.fuanSuits = [...rec, suits[idx]];
      }
      await ctx.log(`【伏暗】：${p.name} 攻击范围归零（失去 ${lost}），摸 ${drawN} 张牌`);
    },
  }, {
    on: 'cards.discard', who: 'any',
    filter: (d) => d.self !== d.player && (d.cards || []).length > 0,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.fuanSeen = [...new Set([...(p.flags.fuanSeen || []), ...(ctx.data.cards || []).map(c => c.suit)])];
    },
  }, {
    on: 'turn.end', who: 'any', optional: true, prompt: '是否发动【伏暗】？',
    filter: (d) => d.self !== d.player && (d.player.flags.fuanSuits || []).length > 0
      && (d.player.flags.fuanSeen || []).some(s => (d.player.flags.fuanSuits || []).includes(s)),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const hit = (p.flags.fuanSeen || []).filter(s => (p.flags.fuanSuits || []).includes(s));
      const suit = hit[0];
      if (suit) p.flags.fuanSuits = (p.flags.fuanSuits || []).filter(s => s !== suit);
      p.flags.fuanSeen = [];
      const cands = g.alive().filter(q => q !== p);
      if (!cands.length) return;
      const tg = await g.chooseTargets(p, { candidates: cands, min: 1, max: 1, prompt: '【伏暗】：视为对一名角色使用一张无距离限制的【杀】' });
      const target = tg[0] || cands[0];
      const c = VC('sha', { __fuan: true });
      await ctx.useCard({ from: p, card: c, targets: [target], reason: 'fuan', ignoreRange: true, ignoreShaLimit: true });
      await ctx.log(`【伏暗】：${p.name} 移除花色 ${SUIT_CN[suit]}，视为对 ${target.name} 使用【杀】`);
    },
  }, {
    on: 'damage.after', who: 'any', optional: true, prompt: '是否发动【伏暗】？',
    filter: (d) => d.from === d.player && d.reason === 'fuan' && !d.player.flags.fuanNoAgain,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, to = ctx.data.to;
      const idx = await g.chooseOne(p, ['再次发动“伏暗”（此后本选项失效）', '令其本回合不能使用或打出手牌'],
        { prompt: `【伏暗】：${to ? to.name : ''} 受到伤害，请选择一项` });
      if (idx === 0) {
        p.flags.fuanNoAgain = true;
        await ctx.log(`【伏暗】：${p.name} 可以再次发动“伏暗”（本局此选项已失效）`);
      } else if (idx === 1 && to) {
        to.flags.xiongluanBan = g.turnCount;     // 引擎既有机制：本回合不能打出手牌
        await ctx.log(`【伏暗】：${to.name} 本回合不能使用或打出手牌`);
      }
    },
  }],
});

defineSkill({
  id: 'yinxian', name: '引弦',
  desc: '锁定技，①你对你攻击范围内与其距离最远的角色使用的【杀】造成的伤害+1；②当你于回合外使用一张牌后，你的攻击范围+1。',
  triggers: [{
    on: 'damage.before', who: 'any',
    filter: (d) => {
      const p = d.player;
      if (d.from !== p || !d.to || d.to === p) return false;
      if (!(d.card?.name === 'sha' || d.reason === 'sha')) return false;
      const g = d.game;
      if (!g.inAttackRange(p, d.to)) return false;
      const inRange = g.alive().filter(q => q !== p && g.inAttackRange(p, q));
      const max = Math.max(...inRange.map(q => g.distance(p, q)));
      return g.distance(p, d.to) === max;
    },
    async effect(ctx) {
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      await ctx.log(`【引弦】：${ctx.data.to.name} 位于攻击范围最远处，此【杀】伤害+1`);
    },
  }, {
    on: 'card.use.after', who: 'self',
    filter: (d) => d.game.turnPlayer !== d.player,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.rangeBonus = (p.flags.rangeBonus || 0) + 1;
      await ctx.log(`【引弦】：${p.name} 于回合外使用牌，攻击范围+1（合计 +${p.flags.rangeBonus}）`);
    },
  }],
});

// ======================================================================
// 势孙綝（吴 4）· 逆固 / 戮连
// ======================================================================
defineSkill({
  id: 'nigu', name: '逆固',
  desc: '出牌阶段限一次，你可以弃置任意张花色各不相同的牌，令攻击范围内的所有角色同时选择是否交给你一张牌，然后你本回合造成的下X次伤害+1（X为不交给你牌的角色数）。',
  active: {
    perPhase: true,
    prompt: '逆固：弃置花色各不相同的牌，令攻击范围内的角色选择是否交给你一张牌，不交者令你本回合伤害+1',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      let picks = [];
      if (p.hand.length) {
        const raw = await g.chooseSomeCards(p, p.hand.slice(), Math.min(4, p.hand.length),
          { prompt: '【逆固】：弃置任意张花色各不相同的牌（同花色只计一张）' });
        const seen = new Set();
        for (const c of raw) { if (seen.has(c.suit)) continue; seen.add(c.suit); picks.push(c); }
      }
      if (picks.length) await ctx.discard(p, picks, { reason: 'nigu' });
      const cands = g.alive().filter(q => q !== p && g.inAttackRange(p, q));
      let x = 0;
      for (const q of cands) {
        const yes = await g.confirm(q, `【逆固】：${p.name} 令你选择是否交给其一张牌，是否交给？`);
        let given = false;
        if (yes) {
          const pool = allCardsOf(q);
          if (pool.length) {
            const give = await g.chooseSomeCards(q, pool, 1, { prompt: `【逆固】：选择一张牌交给 ${p.name}`, optional: true });
            if (give.length) {
              const c = give[0];
              const hi = q.hand.indexOf(c);
              if (hi >= 0) q.hand.splice(hi, 1);
              else {
                for (const k of Object.keys(q.equips)) {
                  if (q.equips[k] === c) { q.equips[k] = null; await g.trigger('equip.lose', { self: q, card: c, slot: k }); }
                }
                const ji = q.judgeZone.findIndex(z => z.card === c);
                if (ji >= 0) q.judgeZone.splice(ji, 1);
              }
              p.hand.push(c);
              given = true;
              await ctx.log(`【逆固】：${q.name} 交给 ${p.name} 一张牌`);
            }
          }
        }
        if (!given) x += 1;
      }
      p.flags.niguBonus = (p.flags.niguBonus || 0) + x;
      await ctx.log(`【逆固】：${p.name} 本回合下 ${x} 次造成的伤害+1`);
    },
  },
  triggers: [{
    on: 'damage.before', who: 'any',
    filter: (d) => d.from === d.player && (d.player.flags.niguBonus || 0) > 0,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.niguBonus -= 1;
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      await ctx.log(`【逆固】：此伤害+1（剩余加伤次数 ${p.flags.niguBonus}）`);
    },
  }],
});

defineSkill({
  id: 'lulian', name: '戮连',
  desc: '锁定技，当你使用手牌中某种类别的最后一张牌结算完成后，若其中有目标角色：体力值小于等于你，令此牌指定的所有目标角色进入连环状态；装备区牌数小于等于你，你摸一张牌。乘势：对一名体力值不为最小的角色造成1点火焰伤害。',
  triggers: [{
    on: 'card.use.after', who: 'self',
    filter: (d) => {
      const p = d.player;
      if (!d.card || !(d.targets || []).length) return false;
      const t = typeOf(d.card);
      return !(p.hand || []).some(c => typeOf(c) === t);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const targets = (d.targets || []).filter(t => t && t !== p);
      if (!targets.length) return;
      const doChain = targets.some(t => t.hp <= p.hp);
      const doDraw = targets.some(t => equipCount(t) <= equipCount(p));
      if (doChain) {
        for (const t of targets) t.chained = true;
        await ctx.log(`【戮连】：${targets.map(t => t.name).join('、')} 进入连环状态`);
      }
      if (doDraw) { await ctx.draw(p, 1, { reason: 'lulian' }); await ctx.log('【戮连】：你摸一张牌'); }
      if (doChain && doDraw) {
        const minHp = Math.min(...g.alive().map(q => q.hp));
        const cands = g.alive().filter(q => q.hp !== minHp);
        if (cands.length) {
          const t = g.rng.pick(cands);
          await ctx.damage({ from: p, to: t, amount: 1, nature: 'fire', reason: 'lulian' });
          await ctx.log(`【戮连】乘势：对 ${t.name} 造成1点火焰伤害`);
        }
      }
    },
  }],
});

// ======================================================================
// 势曹爽（魏 4）· 擅政 / 典易 / 渐专    【资料未核实】定稿文本未核到，按最合理口径实现
// ======================================================================
defineSkill({
  id: 'shanzheng', name: '擅政',
  desc: '每轮开始时，你可以令所有其他角色各选择一张手牌，并将其标记为“专慑”牌。',
  triggers: [{
    on: 'round.begin', who: 'self', optional: true, prompt: '是否发动【擅政】？',
    filter: (d) => d.player.flags.szRound !== d.game.round,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.szRound = g.round;
      for (const q of g.alive()) {
        if (q === p || !q.hand.length) continue;
        const picks = await g.chooseSomeCards(q, q.hand.slice(), 1, { prompt: `【擅政】：${p.name} 令你选择一张手牌标记为“专慑”` });
        const c = picks[0] || q.hand[0];
        if (c) { c.__zhuanshe = true; p.flags.szMarks = [...(p.flags.szMarks || []), c.id]; }
      }
      await ctx.log(`【擅政】：${p.name} 令所有其他角色各标记一张手牌为“专慑”`);
    },
  }],
});

defineSkill({
  id: 'dianyi', name: '典易',
  desc: '出牌阶段限一次，你可以获得一名其他角色的“专慑”牌。',
  active: {
    perPhase: true,
    prompt: '典易：获得一名其他角色的“专慑”牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(q => q !== p && q.hand.some(c => c.__zhuanshe));
      if (!cands.length) { await ctx.log('✗【典易】场上没有“专慑”牌'); return; }
      const tg = await g.chooseTargets(p, { candidates: cands, min: 1, max: 1, prompt: '【典易】：选择一名角色，获得其“专慑”牌' });
      const target = tg[0] || cands[0];
      const card = target.hand.find(c => c.__zhuanshe);
      if (!card) return;
      delete card.__zhuanshe;
      await ctx.gain(p, [card], { from: target, reason: 'dianyi' });
      await ctx.log(`【典易】：${p.name} 获得 ${target.name} 的“专慑”牌`);
    },
  },
});

defineSkill({
  id: 'jianzhuan2', name: '渐专',
  desc: '锁定技，当每轮首次受到伤害时、每轮首次造成伤害时、每轮首次濒死时，你分别获得一个“专”标记；若你已获得三个“专”标记，则你获得技能“溺尊”，然后你增加1点体力上限并回复1点体力（本局限一次）。',
  triggers: [{
    on: 'damage.after', who: 'any',
    filter: (d) => (d.to === d.player || d.from === d.player) && !d.player.flags.jzDone,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      if (p.flags.jzRound !== g.round) { p.flags.jzRound = g.round; p.flags.jzHurt = 0; p.flags.jzDeal = 0; }
      if (d.to === p && !p.flags.jzHurt) { p.flags.jzHurt = 1; p.marks.zhuan = (p.marks.zhuan || 0) + 1; }
      if (d.from === p && !p.flags.jzDeal) { p.flags.jzDeal = 1; p.marks.zhuan = (p.marks.zhuan || 0) + 1; }
      await ctx.log(`【渐专】：${p.name} 获得时机（“专”${p.marks.zhuan || 0}/3）`);
      await finishJz(ctx);
    },
  }, {
    on: 'dying.begin', who: 'self',
    filter: (d) => !d.player.flags.jzDone && !d.player.flags.jzDying,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.jzDying = 1;
      p.marks.zhuan = (p.marks.zhuan || 0) + 1;
      await ctx.log(`【渐专】：${p.name} 濒死时机（“专”${p.marks.zhuan}/3）`);
      await finishJz(ctx);
    },
  }],
});

async function finishJz(ctx) {
  const p = ctx.self;
  if (p.flags.jzDone) return;
  if ((p.marks.zhuan || 0) < 3) return;
  p.flags.jzDone = true;
  p.maxHp = Math.max(1, p.maxHp + 1);
  p.hp = Math.min(p.maxHp, p.hp + 1);
  await ctx.log(`【渐专】：三个时机皆已获得，${p.name} 获得技能“溺尊”，体力上限+1 并回复1点体力`);
}

// ======================================================================
// 势陈群（魏 3）· 定品 / 法恩
// ======================================================================
defineSkill({
  id: 'dingpin2', name: '定品',
  desc: '每轮限一次，每回合结束时，你可以令本回合失去牌最多的一名角色摸两张牌。',
  triggers: [{
    on: 'cards.discard', who: 'any',
    filter: (d) => d.self && (d.cards || []).length > 0,
    async effect(ctx) {
      const g = ctx.game;
      g._lostMap = g._lostMap || {};
      const k = ctx.data.self.seat;
      g._lostMap[k] = (g._lostMap[k] || 0) + (ctx.data.cards || []).length;
    },
  }, {
    on: 'cards.gain', who: 'any',
    filter: (d) => d.from && (d.cards || []).length > 0,
    async effect(ctx) {
      const g = ctx.game;
      g._lostMap = g._lostMap || {};
      const k = ctx.data.from.seat;
      g._lostMap[k] = (g._lostMap[k] || 0) + (ctx.data.cards || []).length;
    },
  }, {
    on: 'turn.end', who: 'any', optional: true, prompt: '是否发动【定品】？',
    filter: (d) => d.player.flags.dpRound !== d.game.round,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const map = g._lostMap || {};
      g._lostMap = {};
      p.flags.dpRound = g.round;
      const alive = g.alive();
      if (!alive.length) return;
      let best = alive[0], bestN = map[alive[0].seat] || 0;
      for (const q of alive) {
        const n = map[q.seat] || 0;
        if (n > bestN) { best = q; bestN = n; }
      }
      await ctx.draw(best, 2, { reason: 'dingpin2' });
      await ctx.log(`【定品】：${p.name} 令本回合失去牌最多的 ${best.name}（${bestN} 张）摸两张牌`);
    },
  }],
});

defineSkill({
  id: 'faen2', name: '法恩',
  desc: '每回合限两次，当一名角色使用牌时，若上一张牌的使用者为你，你可以令其执行一项：1.摸一张牌；2.弃置一张牌。若如此做，本回合下一名使用牌的角色将额外执行另一项。',
  triggers: [{
    on: 'card.use.after', who: 'any',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const prev = g._faenLast;
      g._faenLast = d.self;
      if (prev !== p) return;
      if (p.flags.feTurn !== g.turnCount) { p.flags.feTurn = g.turnCount; p.flags.feN = 0; }
      const pending = p.flags.fePending;
      let idx;
      if (pending) {
        idx = pending === 'draw' ? 0 : 1;
        p.flags.fePending = null;
      } else {
        if ((p.flags.feN || 0) >= 2) return;
        idx = await g.chooseOne(p, [`令 ${d.self.name} 摸一张牌`, `令 ${d.self.name} 弃置一张牌`],
          { prompt: `【法恩】：${d.self.name} 使用了牌（上一张由你使用），请选择一项` });
        if (idx < 0) return;
        p.flags.feN = (p.flags.feN || 0) + 1;
        p.flags.fePending = idx === 0 ? 'discard' : 'draw';
      }
      if (idx === 0) await ctx.draw(d.self, 1, { reason: 'faen2' });
      else {
        const pool = allCardsOf(d.self);
        if (pool.length) {
          const picks = await g.chooseSomeCards(d.self, pool, 1, { prompt: '【法恩】：弃置一张牌' });
          if (picks.length) await ctx.discard(d.self, picks, { reason: 'faen2' });
        }
      }
      await ctx.log(`【法恩】：${d.self.name} ${idx === 0 ? '摸一张牌' : '弃置一张牌'}（本回合下一名使用牌的角色额外执行另一项）`);
    },
  }],
});

// ======================================================================
// 势程普（吴 4）· 督佐 / 蔽扞
//    注：本引擎牌堆无“火【杀】”，督佐按【杀】处理。
// ======================================================================
defineSkill({
  id: 'duzuo', name: '督佐',
  desc: '当你不因此技能获得牌后，你可以令一名角色从牌堆或者弃牌堆中获得一张【杀】。',
  triggers: [{
    on: 'cards.gain', who: 'any', optional: true, prompt: '是否发动【督佐】？',
    filter: (d) => d.self === d.player && d.reason !== 'duzuo' && !d.player.flags.dzBusy,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      let card = g.discardPile.find(c => c.name === 'sha') || null;
      if (card) takeDiscard(g, card);
      else {
        card = g.deck.find(c => c.name === 'sha') || null;
        if (card) takeFromDeck(g, card);
      }
      if (!card) { await ctx.log('【督佐】：牌堆与弃牌堆都没有【杀】'); return; }
      const tg = await g.chooseTargets(p, { candidates: g.alive(), min: 1, max: 1, prompt: '【督佐】：令一名角色获得一张【杀】' });
      const target = tg[0] || p;
      p.flags.dzBusy = true;
      await ctx.gain(target, [card], { reason: 'duzuo' });
      p.flags.dzBusy = false;
      await ctx.log(`【督佐】：${target.name} 从${g.discardPile.includes(card) ? '弃牌堆' : '牌堆'}获得一张【杀】`);
    },
  }],
});

defineSkill({
  id: 'bihan', name: '蔽扞',
  desc: '当一名角色受到【杀】造成的伤害时，你可以令你或者其将手牌数弃置至当前体力值（手牌数大于体力值方可选择），然后令此伤害-1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: true, prompt: '是否发动【蔽扞】？',
    filter: (d) => d.to && (d.amount || 1) > 0 && (d.card?.name === 'sha' || d.reason === 'sha')
      && ((d.to.hand.length > d.to.hp) || (d.player.hand.length > d.player.hp)),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, to = ctx.data.to;
      const selfOk = p.hand.length > p.hp;
      const otherOk = to.hand.length > to.hp;
      let who = null;
      if (selfOk && otherOk) {
        const idx = await g.chooseOne(p, [`令 ${to.name} 弃置手牌至体力值`, '你弃置手牌至体力值'], { prompt: '【蔽扞】：选择由谁弃置手牌' });
        if (idx < 0) return;
        who = idx === 0 ? to : p;
      } else who = selfOk ? p : to;
      const over = who.hand.length - who.hp;
      if (over > 0) {
        const picks = await g.chooseSomeCards(who, who.hand.slice(), over, { prompt: `【蔽扞】：${who.name} 弃置 ${over} 张手牌（手牌数弃至体力值）` });
        if (picks.length) await ctx.discard(who, picks, { reason: 'bihan' });
      }
      ctx.data.amount = Math.max(0, (ctx.data.amount || 1) - 1);
      await ctx.log(`【蔽扞】：${p.name} 令此伤害-1`);
    },
  }],
});

// ======================================================================
// 势周瑜（吴 4）· 炽沄 / 焰洄 / 焚涛 / 雄姿
// ======================================================================
defineSkill({
  id: 'chiyun', name: '炽沄',
  desc: '当你于每个阶段首次获得牌后，你可以交给一名其他角色任意张手牌，然后其选择一项：1.展示所有与这些牌颜色相同的手牌，然后你对其造成1点火焰伤害；2.令你摸两张牌，然后其横置。',
  triggers: [{
    on: 'cards.gain', who: 'any', optional: true, prompt: '是否发动【炽沄】？',
    filter: (d) => d.self === d.player && d.player.hand.length > 0
      && d.player.flags.cyKey !== `${d.game.turnCount}-${d.game.phase}`,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.cyKey = `${g.turnCount}-${g.phase}`;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(5, p.hand.length),
        { prompt: '【炽沄】：交给一名其他角色任意张手牌（可取消）' });
      if (!picks.length) return;
      const cands = g.alive().filter(q => q !== p);
      if (!cands.length) return;
      const tg = await g.chooseTargets(p, { candidates: cands, min: 1, max: 1, prompt: '【炽沄】：选择一名其他角色' });
      const target = tg[0] || cands[0];
      await ctx.gain(target, picks, { from: p, reason: 'chiyun' });
      const colors = [...new Set(picks.map(colorOf))];
      await ctx.log(`【炽沄】：${p.name} 交给 ${target.name} ${picks.length} 张牌（${colors.map(c => COLOR_CN[c]).join('、')}）`);
      let idx;
      if (p.flags.xiongzi) idx = 0;
      else idx = await g.chooseOne(target, ['展示同色手牌，然后你受到1点火焰伤害', '令其摸两张牌，然后你横置'],
        { prompt: `【炽沄】：${p.name} 交给你 ${picks.length} 张牌，请选择一项` });
      if (idx === 0) {
        const same = target.hand.filter(c => colors.includes(colorOf(c)));
        if (same.length) await ctx.log(`【炽沄】：${target.name} 展示 ${same.map(cardLabel).join('、')}`);
        await ctx.damage({ from: p, to: target, amount: 1, nature: 'fire', reason: 'chiyun' });
      } else if (idx === 1) {
        await ctx.draw(p, 2, { reason: 'chiyun' });
        target.chained = true;
        await ctx.log(`【炽沄】：${p.name} 摸两张牌，${target.name} 横置`);
      }
    },
  }],
});

defineSkill({
  id: 'yanhui', name: '焰洄',
  desc: '当你使用牌指定目标后，你可以展示一名目标角色的一张手牌，若此牌本回合已被展示过，你弃置之。出牌阶段结束时，你选择一项：1.对一名本阶段因此失去过牌的角色造成1点火焰伤害；2.摸X张牌（X为本回合展示过牌的角色数）。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true, prompt: '是否发动【焰洄】？',
    filter: (d) => d.self === d.player && d.target && d.target !== d.player && d.target.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.target;
      if (p.flags.yhTurn !== g.turnCount) { p.flags.yhTurn = g.turnCount; p.flags.yhShown = []; p.flags.yhSeats = []; p.flags.yhDropped = []; }
      const c = g.rng.pick(t.hand);
      if (!c) return;
      await ctx.log(`【焰洄】：${p.name} 展示 ${t.name} 的一张手牌：${cardLabel(c)}`);
      if (!p.flags.yhSeats.includes(t.seat)) p.flags.yhSeats = [...p.flags.yhSeats, t.seat];
      if ((p.flags.yhShown || []).includes(c.id)) {
        p.flags.yhShown = p.flags.yhShown.filter(x => x !== c.id);
        await ctx.discard(t, [c], { reason: 'yanhui' });
        if (!p.flags.yhDropped.includes(t.seat)) p.flags.yhDropped = [...p.flags.yhDropped, t.seat];
        await ctx.log(`【焰洄】：此牌本回合已展示过，弃置之`);
      } else {
        p.flags.yhShown = [...(p.flags.yhShown || []), c.id];
      }
    },
  }, {
    on: 'phase.end', who: 'self',
    filter: (d) => d.phase === 'play' && (d.player.flags.yhTurn === d.game.turnCount)
      && ((d.player.flags.yhDropped || []).length > 0 || (d.player.flags.yhSeats || []).length > 0),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const dropped = (p.flags.yhDropped || []).map(s => g.players[s]).filter(q => q && q.alive);
      const shown = (p.flags.yhSeats || []).length;
      const opts = [];
      if (dropped.length) opts.push('选项1');
      if (shown) opts.push('选项2');
      let idx;
      if (p.flags.xiongzi) idx = opts.length === 2 ? 0 : (opts[0] === '选项1' ? 0 : 1);
      else idx = await g.chooseOne(p, [
        '1.对一名本阶段因此失去过牌的角色造成1点火焰伤害',
        `2.摸 ${Math.ceil(shown / 2)} 张牌（本回合展示过牌的角色数 ${shown}）`,
      ], { prompt: '【焰洄】：出牌阶段结束，请选择一项' });
      if (idx === 0) {
        const cands = dropped.length ? dropped : g.alive().filter(q => q !== p);
        if (!cands.length) return;
        const tg = await g.chooseTargets(p, { candidates: cands, min: 1, max: 1, prompt: '【焰洄】：选择受到1点火焰伤害的角色' });
        const target = tg[0] || cands[0];
        await ctx.damage({ from: p, to: target, amount: 1, nature: 'fire', reason: 'yanhui' });
      } else if (idx === 1) {
        await ctx.draw(p, Math.ceil(shown / 2), { reason: 'yanhui' });
        await ctx.log(`【焰洄】：${p.name} 摸 ${Math.ceil(shown / 2)} 张牌`);
      }
    },
  }],
});

defineSkill({
  id: 'fentao', name: '焚涛',
  desc: '锁定技，当已横置的其他角色受到火焰伤害时，其选择一项：1.此次传导中的伤害+1；2.弃置一半的牌（向上取整），此伤害结算结束后，其横置。',
  triggers: [{
    on: 'damage.before', who: 'any',
    filter: (d) => d.nature === 'fire' && d.to && d.to !== d.player && d.to.chained && (d.amount || 1) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, to = ctx.data.to;
      const pool = allCardsOf(to);
      const opts = ['此次伤害+1'];
      if (pool.length) opts.push('弃置一半的牌（向上取整）');
      let idx;
      if (p.flags.xiongzi) idx = 0;
      else idx = await g.chooseOne(to, opts, { prompt: `【焚涛】：你已横置且受到火焰伤害，请选择一项` });
      if (idx === 1 && pool.length) {
        const n = Math.ceil(pool.length / 2);
        const picks = await g.chooseSomeCards(to, pool, n, { prompt: `【焚涛】：弃置 ${n} 张牌` });
        if (picks.length) await ctx.discard(to, picks, { reason: 'fentao' });
        to.chained = true;
        await ctx.log(`【焚涛】：${to.name} 弃置 ${picks.length} 张牌，伤害结算后其横置`);
      } else {
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log(`【焚涛】：${to.name} 已横置，此次火焰伤害+1`);
      }
    },
  }],
});

defineSkill({
  id: 'xiongzi', name: '雄姿',
  desc: '限定技，准备阶段，你可以令本局游戏的【炽沄】、【焰洄】和【焚涛】只能在你的回合内发动，然后仅保留其中全部的一选项或二选项，并摸两张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true, prompt: '是否发动【雄姿】？',
    filter: (d) => d.phase === 'prepare' && !d.player.flags.xiongziUsed,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.xiongziUsed = true;
      p.flags.xiongzi = true;      // 简化：本局【炽沄】【焰洄】【焚涛】强制只执行选项一
      await ctx.draw(p, 2, { reason: 'xiongzi' });
      await ctx.log(`【雄姿】：${p.name} 发动限定技，本局【炽沄】【焰洄】【焚涛】仅保留选项一，并摸两张牌`);
    },
  }],
});
