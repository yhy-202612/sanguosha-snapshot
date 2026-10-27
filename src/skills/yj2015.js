// 一将成名·2015（补全 5 将）技能实现
// 数据见 src/data/yj2015.js；技能 id 前缀 `y15_`
// 口径：官方原文；引擎不支持的机制在 desc 内以「实现：」注明降级方式
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, isRed } from '../engine/cards.js';

let vseq = 0;
const vcard = (name, suit = 'none', num = 0) => ({
  id: `vy15v${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true,
});
const SUIT_CN = { spade: '黑桃', heart: '红桃', club: '梅花', diamond: '方块', none: '无色' };
const others = (g, p) => g.alive().filter((x) => x !== p);
const equipCards = (p) => Object.values(p.equips).filter(Boolean);
const allCards = (p) => [...p.hand, ...equipCards(p)];
const inRangeCount = (g, p) => g.alive().filter((x) => x !== p && g.inAttackRange(p, x)).length;
// 视为「使用/打出」一张手牌：从手牌摘出并进弃牌堆（等价 respondCard 的出牌路径，
// 但不走 respondCard，避免再次触发 respond.need 造成转化技自我递归）
async function spendFromHand(g, p, card, reason) {
  const i = p.hand.indexOf(card);
  if (i >= 0) p.hand.splice(i, 1);
  if (!g.discardPile.includes(card)) g.discardPile.push(card);
  // 带 taken 并结算（同游医：手写派发不结算 taken 会让「接走牌」的技能造成双存）
  const dd = { self: p, cards: [card], reason, taken: [] };
  await g.trigger('cards.discard', dd);
  g.settleTaken(dd);
  await g.checkHandChange(p);
  return card;
}

// ============================================================
// 刘谌（蜀 4）【战绝】【勤王】
// ============================================================
// 战绝：出牌阶段，你可以将所有手牌当【决斗】使用，结算后你与因此受伤的角色各摸一张牌；
//       若你本阶段以此法摸过至少两张牌，本阶段此技能失效。
// 实现：所有手牌作为该【决斗】的消耗牌（extraCards）一次性打出；摸牌数按「你自己摸到的张数」计数。
defineSkill({
  id: 'y15_zhanjue', name: '战绝',
  desc: '出牌阶段，你可以将所有手牌当【决斗】使用，结算后你与因此受伤的角色各摸一张牌；若你本阶段以此法摸过至少两张牌，本阶段此技能失效。',
  active: {
    perTurn: false,
    prompt: '战绝：将所有手牌当【决斗】使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【战绝】：你没有手牌，无法发动'); return; }
      // desc 的「本阶段」= 本出牌阶段，按 playPhaseSeq 判（额外出牌阶段刷新，SG025 #11）
      const drawn = p.flags.y15ZjPhase === g.playPhaseSeq ? (p.flags.y15ZjDraw || 0) : 0;
      if (drawn >= 2) { await ctx.log(`【战绝】：本阶段已以此法摸过 ${drawn} 张牌，此技能本阶段已失效`); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【战绝】：没有其他角色可作为【决斗】目标'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【战绝】：选择【决斗】的目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const hand = p.hand.slice();
      const vc = vcard('juedou');
      vc.__y15zj = true;   // 标记：本次伤害来自【战绝】的【决斗】
      await ctx.log(`【战绝】：${p.name} 将 ${hand.length} 张手牌当【决斗】对 ${t.name} 使用`);
      await ctx.useCard({ from: p, card: vc, targets: [t], extraCards: hand, reason: 'y15_zhanjue' });
      // 虚拟牌不留在弃牌堆（其余手牌已作为消耗正常进弃牌堆）
      const i = g.discardPile.indexOf(vc);
      if (i >= 0) g.discardPile.splice(i, 1);
    },
  },
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => !!d.card?.__y15zj && (d.from === d.player || d.to === d.player),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      p.flags.y15ZjDraw = (p.flags.y15ZjPhase === g.playPhaseSeq ? (p.flags.y15ZjDraw || 0) : 0) + 1;
      p.flags.y15ZjPhase = g.playPhaseSeq;
      await ctx.draw(p, 1, { reason: 'zhanjue' });
      if (d.to && d.to !== p && d.to.alive) await ctx.draw(d.to, 1, { reason: 'zhanjue' });
      const who = d.to && d.to !== p ? `${p.name} 与 ${d.to.name} 各摸一张牌` : `${p.name} 摸一张牌`;
      await ctx.log(`【战绝】：${who}（${p.name} 本阶段已以此法摸 ${p.flags.y15ZjDraw}/2 张）`);
    },
  }],
});

// 勤王：主公技，当你需要使用或打出【杀】时，你可以弃置一张牌，令其他蜀势力角色依次选择是否打出一张【杀】，
//       若有角色打出则视为你使用或打出，且该角色摸一张牌。
// 主公技门控：与标准包【激将】【护驾】同一口径，用 player.role === 'lord'（身份局主公）判定。
defineSkill({
  id: 'y15_qinwang', name: '勤王',
  desc: '主公技，当你需要使用或打出【杀】时，你可以弃置一张牌，令其他蜀势力角色依次选择是否打出一张【杀】，若有角色打出则视为你使用或打出，且该角色摸一张牌。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'sha' && d.self.alive && d.self.role === 'lord'
      && allCards(d.self).length > 0
      && d.game.alive().some((q) => q !== d.self && q.kingdom === 'shu'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = allCards(p);
      if (!pool.length) return;
      const [cost] = await g.chooseSomeCards(p, pool, 1, { prompt: '【勤王】：弃置一张牌' });
      if (!cost) return;
      await ctx.discard(p, [cost], { reason: 'qinwang' });
      await ctx.log(`【勤王】：${p.name} 弃置 ${cardLabel(cost)}，令其他蜀势力角色选择是否打出【杀】`);
      const cands = g.alive().filter((q) => q !== p && q.kingdom === 'shu');
      for (const q of cands) {
        const c = await ctx.respond(q, {
          filter: { name: 'sha' }, reason: 'qinwang', optional: true,
          prompt: `【勤王】：是否替 ${p.name} 打出一张【杀】？`,
        });
        if (!c) continue;
        ctx.data.handled = true;
        ctx.data.card = c;
        await ctx.log(`【勤王】：${q.name} 打出 ${cardLabel(c)}，视为 ${p.name} 使用/打出【杀】`);
        await ctx.draw(q, 1, { reason: 'qinwang' });
        return;
      }
      await ctx.log('【勤王】：没有蜀势力角色打出【杀】');
    },
  }],
});

// ============================================================
// 张嶷（蜀 4）【怃戎】【矢志】
// ============================================================
// 怃戎：出牌阶段限一次，你可以令一名其他角色与你同时展示一张手牌：
//       你展示【杀】而其展示的不是【闪】，你弃置此【杀】并对其造成 1 点伤害；
//       你展示的不是【杀】而其展示【闪】，你弃置展示的牌并获得其一张牌。
defineSkill({
  id: 'y15_wurong', name: '怃戎',
  desc: '出牌阶段限一次，你可以令一名其他角色与你同时展示一张手牌：你展示【杀】而其展示的不是【闪】，你弃置此【杀】并对其造成1点伤害；你展示的不是【杀】而其展示【闪】，你弃置展示的牌并获得其一张牌。',
  active: {
    perPhase: true,
    prompt: '怃戎：与一名其他角色同时展示一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【怃戎】：你没有手牌，无法发动'); return; }
      const cands = others(g, p).filter((q) => q.hand.length > 0);
      if (!cands.length) { await ctx.log('【怃戎】：没有可展示手牌的其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【怃戎】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const [mine] = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【怃戎】：选择一张手牌展示' });
      if (!mine) return;
      const [theirs] = await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【怃戎】：选择一张手牌展示' });
      if (!theirs) return;
      await g.revealCards([mine], { reason: '怃戎' });
      await g.revealCards([theirs], { reason: '怃戎' });
      await ctx.log(`【怃戎】：${p.name} 展示 ${cardLabel(mine)}，${t.name} 展示 ${cardLabel(theirs)}`);
      if (mine.name === 'sha' && theirs.name !== 'shan') {
        await ctx.discard(p, [mine], { reason: 'wurong' });
        await ctx.log(`【怃戎】：${p.name} 弃置【杀】，对 ${t.name} 造成 1 点伤害`);
        await ctx.damage({ from: p, to: t, amount: 1, card: null, reason: 'wurong' });
        return;
      }
      if (mine.name !== 'sha' && theirs.name === 'shan') {
        await ctx.discard(p, [mine], { reason: 'wurong' });
        const c = await g.chooseCardFrom(p, t, { reason: 'wurong' });
        if (c) {
          await ctx.gain(p, [c], { from: t, reason: 'wurong' });
          await ctx.log(`【怃戎】：${p.name} 弃置展示的牌并获得 ${t.name} 的一张牌`);
        }
        return;
      }
      await ctx.log('【怃戎】：展示结果不满足任一条，无后续效果');
    },
  },
});

// 矢志：锁定技，当你的体力值为 1 时，你的【闪】均视为【杀】。
defineSkill({
  id: 'y15_shizhi', name: '矢志',
  desc: '锁定技，当你的体力值为1时，你的【闪】均视为【杀】。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'sha' && d.self.hp === 1
      && d.self.hand.some((c) => c.name === 'shan'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const [c] = await g.chooseSomeCards(p, p.hand.filter((x) => x.name === 'shan'), 1, { prompt: '【矢志】：将一张【闪】当【杀】打出' });
      if (!c) return;
      await spendFromHand(g, p, c, 'shizhi');
      ctx.data.handled = true;
      ctx.data.card = { ...c, name: 'sha', __src: c };
      await ctx.log(`【矢志】：${p.name} 体力为 1，将 ${cardLabel(c)} 当【杀】打出`);
    },
  }],
});

// ============================================================
// 朱治（吴 4）【安国】
// ============================================================
// 安国：出牌阶段限一次，你可以选择一名其他角色装备区里一张牌，令其将此牌收回手牌；
//       然后若该角色攻击范围内的角色数因此减少，你摸一张牌。
defineSkill({
  id: 'y15_anguo', name: '安国',
  desc: '出牌阶段限一次，你可以选择一名其他角色装备区里一张牌，令其将此牌收回手牌；然后若该角色攻击范围内的角色数因此减少，你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '安国：令一名其他角色收回装备区的一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((q) => equipCards(q).length > 0);
      if (!cands.length) { await ctx.log('【安国】：没有装备区有牌的其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【安国】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const [c] = await g.chooseSomeCards(p, equipCards(t), 1, { prompt: `【安国】：选择 ${t.name} 装备区里的一张牌` });
      if (!c) return;
      const before = inRangeCount(g, t);
      await ctx.gain(t, [c], { from: t, reason: 'anguo' });
      const after = inRangeCount(g, t);
      await ctx.log(`【安国】：${t.name} 将 ${cardLabel(c)} 收回手牌（攻击范围内角色数 ${before} → ${after}）`);
      if (after < before) {
        await ctx.draw(p, 1, { reason: 'anguo' });
        await ctx.log(`【安国】：${t.name} 攻击范围内的角色数减少，${p.name} 摸一张牌`);
      }
    },
  },
});

// ============================================================
// 公孙渊（群 4）【怀异】
// ============================================================
// 怀异：出牌阶段限一次，你可以展示所有手牌，若含不止一种颜色则选择一种颜色并弃置该颜色的所有手牌，
//       然后获得至多 X 名角色各一张牌（X 为你以此法弃置的手牌数）；若以此获得的牌不少于两张，你失去 1 点体力。
defineSkill({
  id: 'y15_huaiyi', name: '怀异',
  desc: '出牌阶段限一次，你可以展示所有手牌，若含不止一种颜色则选择一种颜色并弃置该颜色的所有手牌，然后获得至多X名角色各一张牌（X为你以此法弃置的手牌数）；若以此获得的牌不少于两张，你失去1点体力。',
  active: {
    perPhase: true,
    prompt: '怀异：展示所有手牌，弃置一种颜色的全部手牌并获得他人牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【怀异】：你没有手牌，无法发动'); return; }
      await g.revealCards(p.hand.slice(), { reason: '怀异' });
      const reds = p.hand.filter((c) => isRed(c));
      const blacks = p.hand.filter((c) => !isRed(c));
      if (!reds.length || !blacks.length) {
        await ctx.log('【怀异】：手牌只有一种颜色，不满足发动条件');
        return;
      }
      const idx = await ctx.ask.choose(p, ['红色手牌', '黑色手牌'], { prompt: '【怀异】：选择要弃置的颜色', reason: 'huaiyi' });
      if (idx < 0) return;
      const chosen = idx === 0 ? reds : blacks;
      const X = chosen.length;
      await ctx.discard(p, chosen, { reason: 'huaiyi' });
      await ctx.log(`【怀异】：弃置 ${X} 张${idx === 0 ? '红' : '黑'}色手牌，可至多获得 ${X} 名角色各一张牌`);
      const cands = others(g, p).filter((q) => allCards(q).length > 0);
      if (!cands.length) return;
      const picks = await ctx.ask.targets(p, {
        prompt: `【怀异】：至多选择 ${X} 名角色，各获得其一张牌`,
        candidates: cands, min: 0, max: Math.min(X, cands.length),
      });
      let got = 0;
      for (const t of picks) {
        if (!t.alive) continue;
        const c = await g.chooseCardFrom(p, t, { reason: 'huaiyi' });
        if (!c) continue;
        await ctx.gain(p, [c], { from: t, reason: 'huaiyi' });
        got++;
      }
      if (got >= 2) {
        await ctx.log(`【怀异】：以此获得 ${got} 张牌，失去 1 点体力`);
        await ctx.loseHp(p, 1, { reason: 'huaiyi' });
      }
    },
  },
});

// ============================================================
// 郭图逢纪（群 3）【急攻】【饰非】
// ============================================================
// 急攻：出牌阶段开始时，你可以摸两张牌，若如此做，此回合你的手牌上限改为 X（X 为你此阶段造成的伤害数）。
// 实现：本阶段伤害数在 plays 阶段结束时结算为 flags.handLimit（limit = 体力 + handLimit，故取 X - 体力），回合结束时还原。
defineSkill({
  id: 'y15_jigong', name: '急攻',
  desc: '出牌阶段开始时，你可以摸两张牌，若如此做，此回合你的手牌上限改为X（X为你此阶段造成的伤害数）。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.y15JgOn = g.turnCount;
        p.flags.y15JgDmg = 0;
        await ctx.draw(p, 2, { reason: 'jigong' });
        await ctx.log('【急攻】：摸两张牌，本回合手牌上限改为本阶段造成的伤害数');
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.player.flags.y15JgOn === d.game.turnCount && d.game.phase === 'play',
      async effect(ctx) {
        const p = ctx.self;
        p.flags.y15JgDmg = (p.flags.y15JgDmg || 0) + 1;
      },
    },
    {
      on: 'phase.end', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && d.player.flags.y15JgOn === d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        const X = p.flags.y15JgDmg || 0;
        p.flags.handLimit = X - p.hp;
        await ctx.log(`【急攻】：本回合手牌上限改为 ${Math.max(0, X)}（本阶段造成 ${X} 点伤害）`);
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => d.player.flags.y15JgOn === d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.handLimit = 0;
        p.flags.y15JgOn = null;
        p.flags.y15JgDmg = 0;
      },
    },
  ],
});

// 饰非：当你需要使用或打出【闪】时，你可以令当前回合角色摸一张牌，然后若其手牌数不为全场最多，
//       你弃置全场手牌最多（或之一）角色一张牌，视为你使用或打出 1 张【闪】。
defineSkill({
  id: 'y15_shifei', name: '饰非',
  desc: '当你需要使用或打出【闪】时，你可以令当前回合角色摸一张牌，然后若其手牌数不为全场最多，你弃置全场手牌最多（或之一）角色一张牌，视为你使用或打出1张【闪】。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'shan' && !!d.game.turnPlayer,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cur = g.turnPlayer;
      if (!cur) return;
      await ctx.draw(cur, 1, { reason: 'shifei' });
      await ctx.log(`【饰非】：当前回合角色 ${cur.name} 摸一张牌（手牌 ${cur.hand.length}）`);
      const tops = g.alive().filter((q) => q.hand.length > cur.hand.length);
      if (tops.length) {
        const maxN = Math.max(...tops.map((q) => q.hand.length));
        const maxes = tops.filter((q) => q.hand.length === maxN);
        let victim = maxes[0];
        if (maxes.length > 1) {
          victim = (await ctx.ask.targets(p, {
            prompt: '【饰非】：选择手牌最多（之一）的角色，弃置其一张牌',
            candidates: maxes, min: 1, max: 1,
          }))[0] || maxes[0];
        }
        if (victim) {
          const c = await g.chooseCardFrom(p, victim, { reason: 'shifei' });
          if (c) {
            await ctx.discard(victim, [c], { reason: 'shifei' });
            await ctx.log(`【饰非】：弃置手牌最多的 ${victim.name} 的 ${cardLabel(c)}`);
          }
        }
      } else {
        await ctx.log(`【饰非】：${cur.name} 的手牌数为全场最多，不弃牌`);
      }
      ctx.data.handled = true;
      ctx.data.card = vcard('shan');
      await ctx.log(`【饰非】：视为 ${p.name} 使用/打出一张【闪】`);
    },
  }],
});
