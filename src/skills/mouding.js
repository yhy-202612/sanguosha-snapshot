// 谋定天下（11 将）：谋姜维 / 谋庞统 / 谋诸葛亮 / 谋关平 / 谋关羽 / 谋法正 / 谋吴懿 / 谋马谡 / 谋王平 / 谋杨奉 / 谋陆逊
// 与已有包 mou（OL 谋）/ mou2（手杀谋攻篇）不同：本包为「一将成名 · 谋定天下」灯（武将编号 MD.*）。
// 技能原文取自三国杀官网（x.sanguosha.com）、biligame 三国杀 Wiki「谋定天下」条目、萌娘百科。
// 无法完全落地的细节写在技能 desc 的「本实现」括号内，并在交付总结里列出简化点。
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { cardLabel, CARD_META } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

const DMG_NAMES = ['sha', 'juedou', 'huogong', 'nanman', 'wanjian'];
const TRICK_NAMES = ['wuzhong', 'guohe', 'shunshou', 'juedou', 'nanman', 'wanjian', 'huogong', 'wugu', 'jiedao', 'taoyuan', 'tiesuo', 'wuxie'];
const typeOf = (c) => (c ? CARD_META[c.name]?.type : null);
let BB_SEQ = 0;
const isNeighbor = (g, a, b) => {
  const ps = g.players.filter(p => p.alive);
  const i = ps.indexOf(a);
  if (i < 0) return false;
  return ps[(i + 1) % ps.length] === b || ps[(i - 1 + ps.length) % ps.length] === b;
};

// ============================================================ 谋姜维
defineSkill({
  id: 'zhuri', name: '逐日',
  desc: '你的一个阶段结束时，若你的手牌数于此阶段内变化过，你可以与一名其他角色拼点。若你赢，你可以使用其中一张拼点牌，否则你选择一项：1.失去1点体力；2.失去此技能直到回合结束。（本实现：拼点牌在拼点流程中已弃置，“使用拼点牌”结算为摸一张牌）',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false, filter: (d) => d.self === d.player,
      async effect(ctx) { ctx.self.flags.handAtPhase = ctx.self.hand.length; },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.self === d.player && d.self.flags.handAtPhase !== d.self.hand.length && !d.self.flags.zhuriOff && d.game.alive().some(x => x !== d.self && x.hand.length),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.handAtPhase = p.hand.length;
        if (!p.hand.length) return;
        if (!(await ctx.ask.confirm(p, '【逐日】：手牌数变化过，是否拼点？'))) return;
        const cands = g.alive().filter(x => x !== p && x.hand.length);
        const t = (await ctx.ask.targets(p, { prompt: '【逐日】：选择拼点角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const r = await pindian(g, p, t, { reason: '逐日' });
        if (r.skip) return;
        if (r.win) {
          await ctx.draw(p, 1, { reason: 'zhuri' });
          await ctx.log('【逐日】：拼点赢，视为使用拼点牌（本实现：摸一张牌）');
        } else {
          const idx = await ctx.ask.choose(p, ['失去 1 点体力', '失去【逐日】直到回合结束'], { prompt: '【逐日】：拼点没赢，选择一项', reason: 'zhuri' });
          if (idx === 1) { p.flags.zhuriOff = true; await ctx.log('【逐日】：失去【逐日】直到回合结束'); }
          else { await ctx.loseHp(p, 1, { reason: 'zhuri' }); await ctx.log('【逐日】：失去 1 点体力'); }
        }
      },
    },
    { on: 'turn.end', who: 'self', optional: false, filter: (d) => d.self === d.player, async effect(ctx) { ctx.self.flags.zhuriOff = false; } },
  ],
});

defineSkill({
  id: 'ranji', name: '燃己',
  desc: '限定技，结束阶段，若你本回合使用过牌的阶段数不小于/不大于你的体力值，你可以获得技能“困奋”/“诈降”。若如此做，你将手牌或体力值调整至上限，然后你不能回复体力直到你杀死一名角色。（本实现：体力值调整结算为“手牌数不足体力上限则摸至体力上限”）',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false, filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.ranjiPhases = p.flags.ranjiPhases || [];
        const ph = ctx.game.phase || 'play';
        if (!p.flags.ranjiPhases.includes(ph)) p.flags.ranjiPhases.push(ph);
      },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.self === d.player && (d.phase === 'discard' || d.phase === 'end') && !d.self.flags.ranjiDone,
      async effect(ctx) {
        const p = ctx.self;
        const n = (p.flags.ranjiPhases || []).length;
        if (n === 0) return;
        const gain = n >= p.hp ? 'kunfen2' : 'zhaxiang2';
        if (!(await ctx.ask.confirm(p, `【燃己】：本回合使用过牌的阶段数为 ${n}，是否发动并获得【${gain === 'kunfen2' ? '困奋' : '诈降'}】？`))) return;
        p.flags.ranjiDone = true;
        if (!effSkills(p).some(s => s.id === gain)) {
          const { getSkill } = await import('../engine/skill.js');
          const sk = getSkill(gain);
          if (sk) p.skills.push(sk);
        }
        p.flags.noRecoverUntilKill = true;
        if (p.hand.length < p.maxHp) await ctx.draw(p, p.maxHp - p.hand.length, { reason: 'ranji' });
        p.flags.ranjiPhases = [];
        await ctx.log(`【燃己】：获得【${gain === 'kunfen2' ? '困奋' : '诈降'}】，手牌补至体力上限，杀死一名角色前不能回复体力`);
      },
    },
  ],
});

defineSkill({
  id: 'kunfen2', name: '困奋',
  desc: '结束阶段，你可以失去1点体力，然后摸两张牌。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: true,
    filter: (d) => d.self === d.player && (d.phase === 'discard' || d.phase === 'end'),
    async effect(ctx) {
      const p = ctx.self;
      if (!(await ctx.ask.confirm(p, '【困奋】：是否失去 1 点体力并摸两张牌？'))) return;
      await ctx.loseHp(p, 1, { reason: 'kunfen2' });
      await ctx.draw(p, 2, { reason: 'kunfen2' });
      await ctx.log('【困奋】：失去 1 点体力，摸两张牌');
    },
  }],
});

defineSkill({
  id: 'zhaxiang2', name: '诈降',
  desc: '锁定技，当你失去1点体力后，你摸三张牌，然后若此时是你的出牌阶段，你本阶段：使用红色【杀】无距离限制且不能被【闪】响应、使用【杀】的次数上限+1。',
  triggers: [{
    on: 'hp.lose', who: 'self', optional: false,
    filter: (d) => d.self === d.player && (d.amount || 1) >= 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      await ctx.draw(p, 3, { reason: 'zhaxiang2' });
      if (g.phase === 'play') {
        p.flags.freeRangeTurn = g.turnCount;
        p.flags.shaUnlimited = g.turnCount;
      }
      await ctx.log('【诈降】：失去体力，摸三张牌（出牌阶段内杀无距离与次数限制）');
    },
  }],
});

// ============================================================ 谋庞统
defineSkill({
  id: 'lianmou', name: '连谋',
  desc: '转换技，游戏开始时可自选阴阳状态。每个回合结束时，若本回合有角色失去手牌数大于等于其剩余手牌数，你可观看牌堆顶三张牌并交给其中一名角色一张牌；其此牌离开手牌区时，阳：摸当前体力值张手牌（至多摸5）；阴：弃置当前体力值张手牌。（本实现：交给牌后立刻结算阳/阴效果）',
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false, filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        const idx = await ctx.ask.choose(p, ['阳（交给的牌让人摸牌）', '阴（交给的牌让人弃牌）'], { prompt: '【连谋】：选择初始阴阳状态', reason: 'lianmou' });
        p.flags.lianmou = idx === 1 ? 'yin' : 'yang';
        await ctx.log(`【连谋】：初始为${p.flags.lianmou === 'yin' ? '阴' : '阳'}`);
      },
    },
    {
      on: 'turn.end', who: 'self', optional: true,
      filter: (d) => d.self === d.player && d.game.players.some(x => x.flags.lostHandThisTurn > 0),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        g.players.forEach(x => { x.flags.lostHandThisTurn = 0; });
        if (!(await ctx.ask.confirm(p, '【连谋】：本回合有角色失去手牌数不小于剩余手牌数，是否发动？'))) return;
        const three = [];
        for (let i = 0; i < 3 && g.deck.length; i++) three.push(g.deck.pop());
        if (!three.length) return;
        await g.revealCards(three, { to: [p], reason: '连谋' });
        const cands = g.alive();
        const t = (await ctx.ask.targets(p, { prompt: '【连谋】：选择交给牌的角色', candidates: cands, min: 1, max: 1 }))[0] || p;
        const card = three.pop();
        await ctx.gain(t, [card], { reason: 'lianmou' });
        if (three.length) g.deck.push(...three);
        const yang = p.flags.lianmou !== 'yin';
        p.flags.lianmou = yang ? 'yin' : 'yang';
        const x = Math.min(5, Math.max(1, t.hp));
        if (yang) {
          await ctx.draw(t, x, { reason: 'lianmou' });
          await ctx.log(`【连谋】（阳）：交给 ${t.name} ${cardLabel(card)}，其摸 ${x} 张牌，转为阴`);
        } else {
          for (let i = 0; i < x && t.hand.length; i++) await ctx.discard(t, [t.hand[0]], { reason: 'lianmou' });
          await ctx.log(`【连谋】（阴）：交给 ${t.name} ${cardLabel(card)}，其弃置 ${x} 张手牌，转为阳`);
        }
      },
    },
  ],
});

defineSkill({
  id: 'hongce', name: '宏策',
  desc: '首轮开始时，你令一名角色选择一项执行：1.将半数手牌替换为伤害牌，并视为使用一张【杀】；2.重铸一张手牌，视为使用一张单目标普通锦囊牌；3.摸三张牌且此牌不计入手牌上限。结算后，根据所选项修改“宏策”为出牌阶段限一次的同款效果。（本实现：三种效果按“视为使用【杀】/摸两张并弃一张/摸三张”落地）',
  triggers: [{
    on: 'game.start', who: 'self', optional: false, filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      const idx = await ctx.ask.choose(p, ['上策：视为使用一张【杀】', '中策：重铸一张手牌', '下策：摸三张牌'], { prompt: '【宏策】：选择本局固定策略', reason: 'hongce' });
      p.flags.hongceMode = idx < 0 ? 0 : idx;
      await ctx.log(`【宏策】：本局固定为第 ${p.flags.hongceMode + 1} 项策略`);
    },
  }],
  active: {
    perPhase: true,
    prompt: '执行【宏策】所选的策略',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const mode = p.flags.hongceMode || 0;
      if (mode === 0) {
        const cands = g.alive().filter(x => x !== p);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【宏策】：选择【杀】的目标', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        await g.useCard({ from: p, asName: 'sha', targets: [t], reason: 'hongce', ignoreRange: true, ignoreShaLimit: true, card: { id: `hc_${g.turnCount}`, name: 'sha', suit: 'none', num: 0, virtual: true } });
        await ctx.log(`【宏策】（上策）：视为对 ${t.name} 使用一张【杀】`);
      } else if (mode === 1) {
        if (!p.hand.length) return;
        const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【宏策】：重铸一张手牌' }))[0];
        if (!c) return;
        await ctx.discard(p, [c], { reason: 'hongce' });
        await ctx.draw(p, 1, { reason: 'hongce' });
        await ctx.log(`【宏策】（中策）：重铸 ${cardLabel(c)}，视为使用一张单目标普通锦囊（本实现：摸一张）`);
      } else {
        await ctx.draw(p, 3, { reason: 'hongce' });
        p.flags.noHandLimitTurn = g.turnCount;
        await ctx.log('【宏策】（下策）：摸三张牌，本回合不计入手牌上限');
      }
    },
  },
});

// ============================================================ 谋诸葛亮
defineSkill({
  id: 'jingmou', name: '靖谋',
  desc: '转换技，游戏开始时你可自选阴阳状态。任意角色出牌阶段开始时，若你未有记录的花色或牌类型，你可弃置任意张牌并秘密记录其中至多三种包含的花色或牌类型。有角色使用与记录的花色或类型相同的牌时，移除该记录，阳：你可令此牌无效并弃置牌堆顶一张牌，若与此牌花色一致对其造成1点火焰伤害；阴：此牌结算后交给任意一名角色。（本实现：记录花色，阳为令此牌无效并造成 1 点火焰伤害，阴为你摸一张牌）',
  active: {
    perTurn: true,
    prompt: '弃置一张牌，记录其花色（转换阴阳）',
    async effect(ctx) {
      const p = ctx.self;
      if (!p.hand.length) return;
      const c = (await ctx.game.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【靖谋】：弃置一张牌并记录其花色' }))[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'jingmou' });
      p.flags.jingmouSuit = c.suit;
      const yang = p.flags.jingmou !== 'yin';
      p.flags.jingmou = yang ? 'yin' : 'yang';
      await ctx.log(`【靖谋】：记录花色 ${c.suit}（当前为${p.flags.jingmou === 'yin' ? '阴' : '阳'}）`);
    },
  },
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false, filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        const idx = await ctx.ask.choose(p, ['阳', '阴'], { prompt: '【靖谋】：选择初始阴阳状态', reason: 'jingmou' });
        p.flags.jingmou = idx === 1 ? 'yin' : 'yang';
      },
    },
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && !!d.player.flags.jingmouSuit && d.card && d.card.suit === d.player.flags.jingmouSuit,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.jingmouSuit = null;
        p.flags.jingmouUsed = true;
        if (p.flags.jingmou === 'yin') {
          await ctx.draw(p, 1, { reason: 'jingmou' });
          await ctx.log('【靖谋】（阴）：移除记录，摸一张牌');
          return;
        }
        ctx.data.canceled = true;
        await ctx.damage({ from: p, to: ctx.data.self, amount: 1, nature: 'fire', reason: 'jingmou' });
        await ctx.log(`【靖谋】（阳）：令此牌无效，并对 ${ctx.data.self.name} 造成 1 点火焰伤害`);
      },
    },
  ],
});

defineSkill({
  id: 'guyi', name: '孤熠',
  desc: '锁定技，每回合限三次，“熠”牌离开手牌区后，观看牌堆顶X张牌选择其中一张牌获得并标记为“熠”，然后以任意顺序放回牌堆顶（X为本轮触发此效果的次数，至多为7）。每回合开始时，若你手牌中没有“熠”牌，你摸一张牌并选择一张牌标记为“熠”。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false, filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        if (p.hand.some(c => c.skillTag === 'yi')) return;
        await ctx.draw(p, 1, { reason: 'guyi' });
        const c = p.hand[p.hand.length - 1];
        if (c) c.skillTag = 'yi';
        p.flags.guyiTimes = 0;
        await ctx.log('【孤熠】：摸一张牌并标记为“熠”');
      },
    },
    {
      on: 'cards.discard', who: 'self', optional: false,
      filter: (d) => d.self === d.player && (d.cards || []).some(c => c.skillTag === 'yi') && (d.player.flags.guyiTimes || 0) < 3,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.guyiTimes = (p.flags.guyiTimes || 0) + 1;
        const x = Math.min(7, p.flags.guyiTimes);
        const top = [];
        for (let i = 0; i < x && g.deck.length; i++) top.push(g.deck.pop());
        if (!top.length) return;
        await g.revealCards(top, { to: [p], reason: '孤熠' });
        const pick = top.pop();
        await ctx.gain(p, [pick], { reason: 'guyi' });
        const rest = top;
        if (rest.length) g.deck.push(...rest);
        pick.skillTag = 'yi';
        await ctx.log(`【孤熠】：“熠”牌离开手牌区，观看牌堆顶 ${x} 张并获得 ${cardLabel(pick)}`);
      },
    },
  ],
});

// ============================================================ 谋关平
defineSkill({
  id: 'wuwei', name: '武威',
  desc: '出牌阶段限一次，你可以将一种颜色的所有手牌当【杀】使用（无次数距离限制），其中每有一种牌的类型，你便可以选择一项执行：1.摸一张牌；2.目标角色本回合非锁定技失效；3.此技能本阶段可发动次数+1。若此【杀】执行了所有选项，则伤害+1。（本实现：按类型各摸一张牌；三种类型齐全时令目标本回合非锁定技失效并额外造成 1 点伤害）',
  active: {
    perTurn: false,
    prompt: '将一种颜色的所有手牌当【杀】使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.wuweiUsed = p.flags.wuweiUsed || { turn: -1, n: 0 };
      if (p.flags.wuweiUsed.turn !== g.turnCount) p.flags.wuweiUsed = { turn: g.turnCount, n: 0 };
      const limit = 1 + (p.flags.wuweiBonus || 0);
      if (p.flags.wuweiUsed.n >= limit) { await ctx.log('【武威】：本阶段发动次数已用完'); return; }
      const color = (await ctx.ask.choose(p, ['红色手牌', '黑色手牌'], { prompt: '【武威】：选择一种颜色', reason: 'wuwei' })) === 1 ? 'black' : 'red';
      const cards = p.hand.filter(c => (color === 'red' ? (c.suit === 'heart' || c.suit === 'diamond') : (c.suit === 'spade' || c.suit === 'club')));
      if (!cards.length) { await ctx.log('【武威】：该颜色没有手牌'); return; }
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【武威】：选择【杀】的目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.wuweiUsed.n += 1;
      const types = [...new Set(cards.map(c => typeOf(c)).filter(Boolean))];
      await g.useCard({
        from: p, card: cards[0], asName: 'sha', extraCards: cards.slice(1), targets: [t],
        reason: 'wuwei', ignoreRange: true, ignoreShaLimit: true,
      });
      for (const _ of types) await ctx.draw(p, 1, { reason: 'wuwei' });
      if (types.length >= 3) {
        t.flags.skillLockTurn = g.turnCount;
        p.flags.wuweiBonus = 1;
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'wuwei' });
        await ctx.log(`【武威】：三种类型齐备，${t.name} 本回合非锁定技失效，伤害 +1`);
      }
      await ctx.log(`【武威】：将 ${cards.length} 张${color === 'red' ? '红' : '黑'}色手牌当【杀】对 ${t.name} 使用，摸 ${types.length} 张牌`);
    },
  },
});

// ============================================================ 谋关羽
defineSkill({
  id: 'guanwu', name: '冠武',
  desc: '锁定技，回合开始时，你从场上、弃牌堆、牌堆中获得【青龙偃月刀】。本轮你每声明使用两张【杀】后，你本轮通过【杀】造成的伤害+1。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false, filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.equips.weapon && p.equips.weapon.name === 'qinglong') return;
        let found = null;
        for (const q of g.players) {
          for (const k of Object.keys(q.equips)) {
            if (q.equips[k]?.name === 'qinglong') {
              found = q.equips[k];
              // ★走引擎出口派发 equip.lose（SG033 P0-2）
              await g.unequipCard(q, found, { reason: 'qinglong' });
              break;
            }
          }
          if (found) break;
        }
        if (!found) {
          const i = g.discardPile.findIndex(c => c.name === 'qinglong');
          if (i >= 0) found = g.discardPile.splice(i, 1)[0];
        }
        if (!found) {
          const i = g.deck.findIndex(c => c.name === 'qinglong');
          if (i >= 0) found = g.deck.splice(i, 1)[0];
        }
        if (!found) { await ctx.log('【冠武】：场上、弃牌堆、牌堆中都没有【青龙偃月刀】'); return; }
        // ★SG034 P0：旧武器静默进弃牌堆 → 精械弩换成青龙后 shaUnlimited 残留（实测 shaUsed=99 仍可出杀）
        await g.forceEquip(p, found, { reason: 'guanwu' });
        await ctx.log('【冠武】：获得【青龙偃月刀】');
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && (d.effName === 'sha' || d.card?.name === 'sha'),
      async effect(ctx) {
        const p = ctx.self;
        p.flags.guanwuSha = (p.flags.guanwuSha || 0) + 1;
        if (p.flags.guanwuSha % 2 === 0) {
          p.flags.guanwuBonus = (p.flags.guanwuBonus || 0) + 1;
          await ctx.log(`【冠武】：本轮通过【杀】造成的伤害 +${p.flags.guanwuBonus}`);
        }
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from === d.player && (d.card?.name === 'sha') && (d.player.flags.guanwuBonus || 0) > 0,
      async effect(ctx) {
        ctx.data.amount = (ctx.data.amount || 1) + ctx.self.flags.guanwuBonus;
        await ctx.log(`【冠武】：【杀】伤害 +${ctx.self.flags.guanwuBonus}`);
      },
    },
    { on: 'turn.begin', who: 'self', optional: false, filter: (d) => d.self === d.player, async effect(ctx) { ctx.self.flags.guanwuSha = 0; ctx.self.flags.guanwuBonus = 0; } },
  ],
});

defineSkill({
  id: 'weishi', name: '威势',
  desc: '每回合每项限一次，1.你成为其他角色非伤害牌目标后，可弃置半数手牌（向上取整），令此牌对你无效；2.其他角色使用目标包括你的伤害牌结算后，你可摸两张牌，并可对其使用一张【杀】。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && (d.targets || []).includes(d.player) && !DMG_NAMES.includes(d.effName || d.card?.name) && d.player.flags.weishi1 !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.weishi1 = ctx.game.turnCount;
        if (!(await ctx.ask.confirm(p, '【威势】：是否弃置半数手牌令此牌对你无效？'))) return;
        const k = Math.ceil(p.hand.length / 2);
        const picks = k > 0 ? await ctx.game.chooseSomeCards(p, p.hand.slice(), k, { prompt: '【威势】：弃置半数手牌' }) : [];
        if (picks.length) await ctx.discard(p, picks, { reason: 'weishi' });
        ctx.data.targets = (ctx.data.targets || []).filter(x => x !== p);
        await ctx.log('【威势】：弃置半数手牌，此牌对你无效');
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && (d.targets || []).includes(d.player) && DMG_NAMES.includes(d.effName || d.card?.name) && d.player.flags.weishi2 !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.weishi2 = g.turnCount;
        if (!(await ctx.ask.confirm(p, '【威势】：是否摸两张牌并对其使用一张【杀】？'))) return;
        await ctx.draw(p, 2, { reason: 'weishi' });
        const src = ctx.data.self;
        const sha = p.hand.find(c => c.name === 'sha');
        if (src && src.alive && sha) {
          await g.useCard({ from: p, card: sha, targets: [src], reason: 'weishi', ignoreShaLimit: true });
          await ctx.log(`【威势】：摸两张牌，对 ${src.name} 使用【杀】`);
        } else {
          await ctx.log('【威势】：摸两张牌（没有可用的【杀】）');
        }
      },
    },
  ],
});

defineSkill({
  id: 'juAo', name: '倨傲',
  desc: '出牌阶段限一次，你可弃置一张牌然后视为对攻击范围内任意名角色使用【杀】；若如此做，这些角色下次使用【杀】或普通锦囊牌时须额外指定你为目标。（本实现：指定 1 名角色，并置“须指定你为目标”标记。）',
  active: {
    perPhase: true,
    prompt: '弃一张牌，视为对攻击范围内一名角色使用【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) return;
      const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【倨傲】：弃置一张牌' }))[0];
      if (!c) return;
      const slot = Object.keys(p.equips).find(k => p.equips[k] === c);
      if (slot) { p.equips[slot] = null; g.discardPile.push(c); await g.trigger('equip.lose', { self: p, card: c, slot }); }
      else await ctx.discard(p, [c], { reason: 'juAo' });
      const cands = g.alive().filter(x => x !== p && g.inAttackRange(p, x));
      if (!cands.length) { await ctx.log('【倨傲】：攻击范围内没有其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【倨傲】：选择目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      t.flags.juaoTarget = p.id;
      await g.useCard({ from: p, asName: 'sha', targets: [t], reason: 'juAo', ignoreRange: true, ignoreShaLimit: true, card: { id: `ja_${g.turnCount}`, name: 'sha', suit: 'none', num: 0, virtual: true } });
      await ctx.log(`【倨傲】：视为对 ${t.name} 使用【杀】，其下次使用【杀】或普通锦囊须指定你为目标`);
    },
  },
});

// ============================================================ 谋法正
// 「每轮开始时」：引擎 round.begin 只在座位回绕时派发（第 1 轮没有），
// 故用「本回合是所在轮的第一个回合」判定——每轮第一个 turn.begin 等价于轮开始。
const newRoundFor = (d) => (d.player.flags.mdRound || 0) !== (d.game.round || 1);

defineSkill({
  id: 'zhenjian', name: '缜鉴',
  desc: '每轮开始时，你选择一名其他角色并秘密选择1种普通锦囊牌名，本轮内其使用普通锦囊牌时：1.若与你选择的牌名不同，你可令此牌增加或减少1个目标；2.若与你选择的牌名相同，你摸1张牌且此技能本回合失效。',
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => newRoundFor(d) && d.game.alive().some(x => x !== d.player),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.mdRound = g.round || 1;
        if (!(await ctx.ask.confirm(p, '【缜鉴】：每轮开始时，是否选择一名其他角色并秘密选择一种普通锦囊牌名？'))) return;
        const cands = g.alive().filter(x => x !== p);
        const t = (await ctx.ask.targets(p, { prompt: '【缜鉴】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const idx = await ctx.ask.choose(p, TRICK_NAMES.map(n => CARD_META[n]?.cn || n), { prompt: '【缜鉴】：秘密选择一种普通锦囊牌名', reason: 'zhenjian' });
        p.flags.zhenjian = { target: t.id, name: TRICK_NAMES[idx < 0 ? 0 : idx] };
        await ctx.log(`【缜鉴】：本轮针对 ${t.name}（已秘密记录牌名）`);
      },
    },
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => !!d.player.flags.zhenjian && d.self.id === d.player.flags.zhenjian.target && typeOf({ name: d.effName || d.card?.name }) === 'trick' && d.player.flags.zhenjianDone !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        const rec = p.flags.zhenjian;
        const nm = ctx.data.effName || ctx.data.card?.name;
        if (nm === rec.name) {
          p.flags.zhenjianDone = ctx.game.turnCount;
          await ctx.draw(p, 1, { reason: 'zhenjian' });
          await ctx.log('【缜鉴】：牌名相符，摸一张牌且本回合【缜鉴】失效');
          return;
        }
        const tars = ctx.data.targets || [];
        const opts = ['不改变目标'];
        if (tars.length > 1) opts.push('减少一个目标');
        const extra = ctx.game.alive().filter(x => !tars.includes(x));
        if (extra.length) opts.push('增加一个目标');
        if (opts.length === 1) return;
        if (!(await ctx.ask.confirm(p, '【缜鉴】：牌名不同，是否令此牌增加或减少一个目标？'))) return;
        const k = await ctx.ask.choose(p, opts.slice(1), { prompt: '【缜鉴】：增加或减少一个目标', reason: 'zhenjian' });
        if (k === 0 && opts[1] === '减少一个目标') {
          ctx.data.targets = tars.slice(0, -1);
          await ctx.log('【缜鉴】：令此牌减少一个目标');
        } else {
          const t = (await ctx.ask.targets(p, { prompt: '【缜鉴】：选择额外目标', candidates: extra, min: 1, max: 1 }))[0];
          if (t) {
            ctx.data.extraTargets = [...(ctx.data.extraTargets || []), t.seat];
            await ctx.log(`【缜鉴】：令 ${t.name} 成为额外目标`);
          }
        }
      },
    },
  ],
});

defineSkill({
  id: 'xixing', name: '悉性',
  desc: '出牌阶段限一次，你可观看一名其他角色的手牌并获得其中1张牌，然后若你使用的下一张牌对其造成伤害，此技能视为未使用过。',
  active: {
    perPhase: true,
    prompt: '观看一名其他角色的手牌并获得其中一张',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.hand.length);
      if (!cands.length) { await ctx.log('【悉性】：没有手牌可看的其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【悉性】：选择角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await g.revealCards(t.hand.slice(), { to: [p], reason: '悉性' });
      const pick = (await g.chooseSomeCards(p, t.hand.slice(), 1, { prompt: '【悉性】：获得其中一张牌' }))[0];
      if (!pick) return;
      await ctx.gain(p, [pick], { from: t, reason: 'xixing' });
      p.flags.xixingTarget = t.id;
      p.flags.xixingUsed = true;
      await ctx.log(`【悉性】：观看并获得 ${t.name} 的一张手牌`);
    },
  },
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => d.from === d.player && d.self.id === d.player.flags.xixingTarget && d.player.flags.xixingUsed,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.xixingUsed = false;
      p.flags.xixingReset = ctx.game.turnCount;
      await ctx.log('【悉性】：下一张牌造成伤害，此技能视为未使用过');
    },
  }],
});

// ============================================================ 谋吴懿
defineSkill({
  id: 'shibian', name: '识变',
  desc: '每轮开始时，你可选择一名其他角色，本轮其攻击范围内的角色视为在你的攻击范围内，且你使用【杀】与普通锦囊牌可指定其攻击范围内的1名角色为额外目标。',
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => newRoundFor(d) && d.game.alive().some(x => x !== d.player),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.mdRound = g.round || 1;
        if (!(await ctx.ask.confirm(p, '【识变】：是否选择一名其他角色共享攻击范围？'))) return;
        const cands = g.alive().filter(x => x !== p);
        const t = (await ctx.ask.targets(p, { prompt: '【识变】：选择角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        p.flags.shibian = t.id;
        await ctx.log(`【识变】：本轮 ${t.name} 攻击范围内的角色视为在你的攻击范围内`);
      },
    },
    {
      // 攻击范围共享：其攻击范围内的角色，你与其计算距离视为 1（即视为在你的攻击范围内）
      // distance.calc 走同步钩子，不能 await；用 reentrancy 标记避免套娃
      on: 'distance.calc', who: 'self', optional: false,
      effect(ctx) {
        const d = ctx.data, p = ctx.self, g = ctx.game;
        if (!d || !d.to || d.to === p || d.value <= 1) return;
        if (p.flags.sbBusy || !p.flags.shibian) return;
        const shared = g.byId(p.flags.shibian);
        if (!shared || !shared.alive) return;
        p.flags.sbBusy = true;
        try {
          if (g.inAttackRange(shared, d.to)) d.value = 1;
        } finally { p.flags.sbBusy = false; }
      },
    },
    {
      on: 'card.use.before', who: 'self', optional: true,
      filter: (d) => {
        if (d.self !== d.player) return false;
        const nm = d.effName || d.card?.name;
        const ty = CARD_META[nm]?.type;
        if (!(nm === 'sha' || ty === 'trick')) return false;
        const t = d.game.byId(d.player.flags.shibian);
        return !!t && t.alive;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const shared = g.byId(p.flags.shibian);
        if (!shared) return;
        const cands = g.alive().filter(x => x !== p && !(ctx.data.targets || []).includes(x) && g.inAttackRange(shared, x));
        if (!cands.length) return;
        if (!(await ctx.ask.confirm(p, `【识变】：是否令 ${shared.name} 攻击范围内的一名角色成为额外目标？`))) return;
        const extra = (await ctx.ask.targets(p, { prompt: '【识变】：选择额外目标', candidates: cands, min: 1, max: 1 }))[0];
        if (!extra) return;
        ctx.data.targets = [...(ctx.data.targets || []), extra];
        await ctx.log(`【识变】：令 ${extra.name} 成为额外目标`);
      },
    },
  ],
});

defineSkill({
  id: 'bibu', name: '庇部',
  desc: '你的上家和下家每回合首次成为其他角色使用的【杀】或普通锦囊牌的唯一目标时，你可摸1张牌并令此牌的目标改为你；你的上家和下家每回合首次使用【杀】或普通锦囊牌结算完毕后，你可摸1张牌，然后可视为使用此牌。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player;
        if (d.self === p) return false;
        const nm = d.effName || d.card?.name;
        const ty = CARD_META[nm]?.type;
        if (!(nm === 'sha' || ty === 'trick')) return false;
        const tg = d.targets || [];
        if (tg.length !== 1) return false;
        const victim = tg[0];
        if (victim === p || !victim.alive) return false;
        if (!isNeighbor(d.game, p, victim)) return false;
        p.flags.bibu1 = p.flags.bibu1 || {};
        return p.flags.bibu1[victim.id] !== d.game.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const victim = (ctx.data.targets || [])[0];
        if (!(await ctx.ask.confirm(p, `【庇部】：是否替 ${victim?.name} 成为此牌目标？`))) return;
        p.flags.bibu1 = p.flags.bibu1 || {};
        p.flags.bibu1[victim.id] = g.turnCount;
        await ctx.draw(p, 1, { reason: 'bibu' });
        ctx.data.targets = [p];
        await ctx.log(`【庇部】：摸一张牌，令此牌的目标改为 ${p.name}`);
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player;
        if (d.self === p) return false;
        const nm = d.effName || d.card?.name;
        const ty = CARD_META[nm]?.type;
        if (!(nm === 'sha' || ty === 'trick')) return false;
        if (!isNeighbor(d.game, p, d.self)) return false;
        p.flags.bibu2 = p.flags.bibu2 || {};
        return p.flags.bibu2[d.self.id] !== d.game.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const src = ctx.data.self;
        p.flags.bibu2 = p.flags.bibu2 || {};
        p.flags.bibu2[src.id] = g.turnCount;
        if (!(await ctx.ask.confirm(p, '【庇部】：是否摸一张牌？'))) return;
        await ctx.draw(p, 1, { reason: 'bibu' });
        await ctx.log(`【庇部】：${src.name} 使用牌结算完毕，${p.name} 摸一张牌`);
        const used = ctx.data.card;
        const rec = used ? (used.__src || used) : null;
        const meta = rec ? CARD_META[rec.name] : null;
        if (!meta || meta.delayed || rec.virtual) return;
        if (!(await ctx.ask.confirm(p, `【庇部】：是否视为使用此牌（${meta.cn}）？`))) return;
        // 用虚拟副本（新 id）重现此牌，避免与实体牌双存
        const card = { id: `vmdbb${++BB_SEQ}`, name: rec.name, suit: rec.suit, num: rec.num, virtual: true, ...(rec.nature ? { nature: rec.nature } : {}) };
        const rule = meta.target || {};
        const cands = g.candidatesFor(p, card) || [];
        const min = Math.min(rule.min ?? 0, cands.length);
        const max = Math.min(rule.max ?? 1, cands.length);
        let targets = [];
        if (cands.length && max > 0) {
          targets = await ctx.ask.targets(p, { prompt: `【庇部】：视为使用【${meta.cn}】，为其选择目标`, candidates: cands, min, max });
        }
        if (!targets.length && (rule.min ?? 0) > 0) { await ctx.log(`【庇部】：【${meta.cn}】没有合法目标`); return; }
        await ctx.log(`【庇部】：${p.name} 视为使用此牌【${meta.cn}】`);
        await ctx.useCard({ from: p, card, targets, reason: 'bibu' });
      },
    },
  ],
});

// ============================================================ 谋马谡
defineSkill({
  id: 'chengce', name: '呈策',
  desc: '每轮开始时，你可观看牌堆顶2张牌并用任意张手牌替换其中等量牌，然后你令一名其他角色观看牌堆顶2张牌并获得其中1张。若其获得的牌为非伤害牌，你获得3张非伤害牌，其获得"心战"直到本轮结束；若其获得的牌为伤害牌，你获得3张伤害牌，其随机3张非伤害手牌视为【杀】直到本轮结束。（本实现：其获得的牌为伤害牌时，「随机三张非伤害手牌视为【杀】」需引擎的转化牌规则，未实现）',
  triggers: [{
    on: 'turn.begin', who: 'any', optional: false,
    filter: (d) => newRoundFor(d) && d.game.deck.length >= 2 && d.game.alive().some(x => x !== d.player),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.mdRound = g.round || 1;
      if (!(await ctx.ask.confirm(p, '【呈策】：是否发动？'))) return;
      const top = [g.deck.pop(), g.deck.pop()].filter(Boolean);
      if (p.hand.length) {
        const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(1, p.hand.length), { prompt: '【呈策】：选择手牌替换牌堆顶的牌' });
        for (const c of picks) {
          const i = p.hand.indexOf(c);
          if (i >= 0) p.hand.splice(i, 1);
          const j = top.indexOf(top[0]);
          if (j >= 0) { const old = top.splice(j, 1)[0]; p.hand.push(old); }
          top.unshift(c);
        }
      }
      const cands = g.alive().filter(x => x !== p);
      const t = (await ctx.ask.targets(p, { prompt: '【呈策】：选择获得牌的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await g.revealCards(top, { to: [t], reason: '呈策' });
      const given = top.pop();
      await ctx.gain(t, [given], { reason: 'chengce' });
      const rest = top;
      if (rest.length) g.deck.push(...rest);
      // 「获得3张同类牌」：从牌堆取 3 张非伤害牌 / 伤害牌
      const wantDmg = DMG_NAMES.includes(given.name);
      const picked = [];
      for (let i = g.deck.length - 1; i >= 0 && picked.length < 3; i--) {
        const c = g.deck[i];
        if (!c) continue;
        if (DMG_NAMES.includes(c.name) === wantDmg) { picked.push(c); g.deck.splice(i, 1); }
      }
      if (picked.length) await ctx.gain(p, picked, { reason: 'chengce' });
      if (wantDmg) {
        t.flags.xinzhanSha = true;
        t.flags.ccShaRound = g.round || 1;
        await ctx.log(`【呈策】：${t.name} 获得伤害牌 ${cardLabel(given)}，${p.name} 获得 ${picked.length} 张伤害牌；其随机三张非伤害手牌视为【杀】直到本轮结束（本实现未接入转化规则）`);
      } else {
        t.flags.ccXzRound = g.round || 1;
        const xz = getSkill('xinzhan2');
        if (xz && !(effSkills(t) || []).some(s => s.id === 'xinzhan2')) t.skills.push(xz);
        await ctx.log(`【呈策】：${t.name} 获得非伤害牌 ${cardLabel(given)}，${p.name} 获得 ${picked.length} 张非伤害牌；${t.name} 获得【心战】直到本轮结束`);
      }
    },
  }],
});

defineSkill({
  id: 'xinzhan2', name: '心战',
  desc: '你每回合首次使用【杀】或普通锦囊牌指定其他角色为唯一目标时，可各猜测一次此牌是否被响应。此牌结算完毕后，若你猜对，观看此牌目标的手牌并获得其中1张；若你猜错，其视为对你使用【决斗】。（本实现：猜错结算为失去 1 点体力）',
  triggers: [
    {
      on: 'card.use.before', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player;
        if (d.self !== p) return false;
        // 【呈策】授予的【心战】仅到本轮结束（谋马谡本身拥有的【心战】不受影响）
        if (p.flags.ccXzRound != null && p.flags.ccXzRound !== (d.game.round || 1)) return false;
        const nm = d.effName || d.card?.name;
        if (!(nm === 'sha' || CARD_META[nm]?.type === 'trick')) return false;
        const tg = d.targets || [];
        return tg.length === 1 && tg[0] !== p && p.flags.xinzhanTurn !== d.game.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self;
        p.flags.xinzhanTurn = ctx.game.turnCount;
        const idx = await ctx.ask.choose(p, ['猜：会被响应', '猜：不会被响应'], { prompt: '【心战】：猜测此牌是否被响应', reason: 'xinzhan' });
        p.flags.xinzhanGuess = idx === 1 ? 'no' : 'yes';
        p.flags.xinzhanTarget = (ctx.data.targets || [])[0]?.id;
        await ctx.log(`【心战】：猜测此牌${p.flags.xinzhanGuess === 'no' ? '不会' : '会'}被响应`);
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.player.flags.xinzhanGuess,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const guess = p.flags.xinzhanGuess;
        const t = g.byId(p.flags.xinzhanTarget);
        p.flags.xinzhanGuess = null;
        if (!t || !t.alive) return;
        const dodged = !!ctx.data.dodged;
        if ((guess === 'no' && !dodged) || (guess === 'yes' && dodged)) {
          if (t.hand.length) {
            const c = t.hand[g.rng.int(t.hand.length)];
            await ctx.gain(p, [c], { from: t, reason: 'xinzhan' });
            await ctx.log(`【心战】：猜对，观看 ${t.name} 手牌并获得 ${cardLabel(c)}`);
          }
        } else {
          await ctx.loseHp(p, 1, { reason: 'xinzhan' });
          await ctx.log(`【心战】：猜错，${t.name} 视为对你使用【决斗】（本实现：失去 1 点体力）`);
        }
      },
    },
  ],
});

// ============================================================ 谋王平
defineSkill({
  id: 'youyi2', name: '诱夷',
  desc: '每回合每项限一次，你成为其他角色使用的牌的目标时，你可令其本阶段出【杀】次数+1，然后你选择一项执行：1.弃置任意张牌并摸1张牌，本回合结束时你摸等量张牌；2.失去至多4点体力并令一名角色摸等量张牌，本回合结束时你回复因此失去的体力。（本实现：选项1弃1摸1、回合结束再摸1；选项2失1点体力、令一名角色摸1张、回合结束回复1点）',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && (d.targets || []).includes(d.player) && d.player.flags.youyiTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.youyiTurn = g.turnCount;
        if (!(await ctx.ask.confirm(p, '【诱夷】：是否发动（令其本阶段出【杀】次数 +1）？'))) return;
        ctx.data.shaLimitPlus = (ctx.data.shaLimitPlus || 0) + 1;
        const idx = await ctx.ask.choose(p, ['弃置一张牌并摸一张牌', '失去 1 点体力并令一名角色摸一张牌'], { prompt: '【诱夷】：选择一项', reason: 'youyi2' });
        if (idx === 1) {
          await ctx.loseHp(p, 1, { reason: 'youyi2' });
          await ctx.draw(p, 1, { reason: 'youyi2' });
          p.flags.youyiReturn = (p.flags.youyiReturn || 0) + 1;
          await ctx.log('【诱夷】：失去 1 点体力并摸一张牌，回合结束回复');
        } else {
          if (p.hand.length) await ctx.discard(p, [p.hand[0]], { reason: 'youyi2' });
          await ctx.draw(p, 1, { reason: 'youyi2' });
          p.flags.youyiDrawEnd = (p.flags.youyiDrawEnd || 0) + 1;
          await ctx.log('【诱夷】：弃置一张牌并摸一张牌，回合结束再摸一张');
        }
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => d.self === d.player && ((d.player.flags.youyiDrawEnd || 0) > 0 || (d.player.flags.youyiReturn || 0) > 0),
      async effect(ctx) {
        const p = ctx.self;
        const n = p.flags.youyiDrawEnd || 0;
        const h = p.flags.youyiReturn || 0;
        p.flags.youyiDrawEnd = 0;
        p.flags.youyiReturn = 0;
        p.flags.fangongAcc = (p.flags.fangongAcc || 0) + n + h;
        if (n) await ctx.draw(p, n, { reason: 'youyi2' });
        if (h) await ctx.recover(p, h, { reason: 'youyi2' });
        await ctx.log(`【诱夷】：回合结束，摸 ${n} 张牌、回复 ${h} 点体力`);
      },
    },
  ],
});

defineSkill({
  id: 'fangong', name: '返攻',
  desc: '限定技，出牌阶段，你可回复满体力值并摸5张牌。你因“诱夷”失去的体力值和牌数的总和每累计达到7后，此技能视为未发动过。',
  active: {
    perTurn: true,
    prompt: '回复满体力并摸 5 张牌（限定技）',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.fangongDone && (p.flags.fangongAcc || 0) < 7) { await ctx.log('【返攻】：本局已发动（累计未满 7）'); return; }
      p.flags.fangongDone = true;
      p.flags.fangongAcc = 0;
      await ctx.recover(p, Math.max(0, p.maxHp - p.hp), { reason: 'fangong' });
      await ctx.draw(p, 5, { reason: 'fangong' });
      await ctx.log('【返攻】：回复满体力并摸 5 张牌');
    },
  },
});

// ============================================================ 谋杨奉
defineSkill({
  id: 'zhubo', name: '逐波',
  desc: '每回合限一次，有角色于其出牌阶段外造成伤害时，你可以失去一点体力并选择一项：1.你与其各摸两张牌；2.此伤害+1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: true,
    filter: (d) => d.game.phase !== 'play' && d.from && d.player.flags.zhuboTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.zhuboTurn = g.turnCount;
      const mode = p.flags.zhuboMode || 'deal';
      if (!(await ctx.ask.confirm(p, '【逐波】：是否失去 1 点体力发动？'))) return;
      await ctx.loseHp(p, 1, { reason: 'zhubo' });
      const idx = await ctx.ask.choose(p, ['你与其各摸两张牌', '此伤害 +1'], { prompt: '【逐波】：选择一项', reason: 'zhubo' });
      if (idx === 1) {
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log('【逐波】：此伤害 +1');
      } else {
        const src = mode === 'take' ? ctx.data.to : ctx.data.from;
        await ctx.draw(p, 2, { reason: 'zhubo' });
        if (src && src.alive) await ctx.draw(src, 2, { reason: 'zhubo' });
        await ctx.log('【逐波】：你与其各摸两张牌');
      }
    },
  }],
});

defineSkill({
  id: 'xieshi', name: '挟势',
  desc: '其他角色的结束阶段，若你手牌数与本回合开始不同，你可以视为使用一张本回合进入弃牌堆的基本牌或普通锦囊牌。',
  triggers: [
    { on: 'turn.begin', who: 'any', optional: false, filter: () => true, async effect(ctx) { ctx.data.self.flags.handAtTurn = ctx.data.self.hand.length; } },
    {
      on: 'phase.end', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && (d.phase === 'end' || d.phase === 'discard') && d.player.flags.handAtTurn !== d.player.hand.length && d.player.flags.xieshiTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cand = [...g.discardPile].reverse().find(c => ['basic', 'trick'].includes(typeOf(c)));
        if (!cand) return;
        p.flags.xieshiTurn = g.turnCount;
        if (!(await ctx.ask.confirm(p, `【挟势】：是否视为使用 ${cardLabel(cand)}？`))) return;
        const i = g.discardPile.indexOf(cand);
        if (i >= 0) g.discardPile.splice(i, 1);
        const needTarget = ['sha', 'juedou', 'guohe', 'shunshou', 'huogong'].includes(cand.name);
        const cands = g.alive().filter(x => x !== p);
        const targets = needTarget && cands.length ? [cands[g.rng.int(cands.length)]] : [];
        await g.useCard({ from: p, card: cand, targets, reason: 'xieshi' });
        await ctx.log(`【挟势】：视为使用 ${cardLabel(cand)}`);
      },
    },
  ],
});

defineSkill({
  id: 'qijue', name: '歧抉',
  desc: '限定技，有角色进入濒死状态时，你可以令其回复两点体力并摸两张牌，然后将逐波中的“造成”替换为“受到”；若该角色为你，将逐波的时机和角色修改为“你于回合外造成或受到伤害时”，并且不再需要失去体力。',
  triggers: [{
    on: 'dying.begin', who: 'any', optional: true,
    filter: (d) => !d.player.flags.qijueDone && d.self,
    async effect(ctx) {
      const p = ctx.self, v = ctx.data.self;
      p.flags.qijueDone = true;
      if (v.hp < 2) v.hp = 2;
      await ctx.draw(v, 2, { reason: 'qijue' });
      if (v === p) { p.flags.zhuboMode = 'both'; await ctx.log('【歧抉】：自身濒死，【逐波】改为回合外造成或受到伤害时且无需失去体力'); }
      else { p.flags.zhuboMode = 'take'; await ctx.log(`【歧抉】：令 ${v.name} 回复至 2 点体力并摸两张牌，【逐波】改为“受到”`); }
    },
  }],
});

// ============================================================ 谋陆逊
defineSkill({
  id: 'juanmou', name: '隽谋',
  desc: '转换技，游戏开始时可自选阴阳状态。当一张牌结算结束后若你是其目标，你可选择一张手牌：阳：视为使用一张无距离与次数限制的火【杀】；阴：令该颜色的手牌不计入手牌上限并横置一名角色。（本实现：阴结算为弃置伤害来源一张牌并摸一张牌）',
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false, filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        const idx = await ctx.ask.choose(p, ['阳（视为火【杀】）', '阴（横置与免上限）'], { prompt: '【隽谋】：选择初始阴阳状态', reason: 'juanmou' });
        p.flags.juanmou = idx === 1 ? 'yin' : 'yang';
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: true,
      filter: (d) => d.self !== d.player && (d.targets || []).includes(d.player) && d.player.flags.juanmouTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.juanmouTurn = g.turnCount;
        const yang = p.flags.juanmou !== 'yin';
        p.flags.juanmou = yang ? 'yin' : 'yang';
        const src = ctx.data.self;
        if (yang) {
          if (!src || !src.alive) return;
          if (!(await ctx.ask.confirm(p, `【隽谋】（阳）：是否视为对 ${src.name} 使用火【杀】？`))) return;
          await g.useCard({ from: p, asName: 'sha', targets: [src], reason: 'juanmou', ignoreRange: true, ignoreShaLimit: true, card: { id: `jm_${g.turnCount}`, name: 'sha', nature: 'fire', suit: 'none', num: 0, virtual: true } });
          await ctx.log(`【隽谋】（阳）：视为对 ${src.name} 使用火【杀】，转为阴`);
        } else {
          p.flags.noHandLimitTurn = g.turnCount;
          if (src && src.hand.length) await ctx.discard(src, [src.hand[0]], { reason: 'juanmou' });
          await ctx.draw(p, 1, { reason: 'juanmou' });
          await ctx.log('【隽谋】（阴）：手牌不计入手牌上限，弃置其一张牌并摸一张牌，转为阳');
        }
      },
    },
  ],
});

defineSkill({
  id: 'zhanyan', name: '绽炎',
  desc: '限定技，出牌阶段，你可以选择任意名已横置的其他角色并回复等量体力。你令这些角色同时展示一张手牌，然后你可以弃置任意张与展示牌相同花色的牌并对展示此花色的角色各造成1点火焰伤害，若这些角色均受到伤害则重复此流程。当你于此技能结算期间失去牌时，摸等量张牌。（本实现：不检查“已横置”，只结算一轮）',
  active: {
    perTurn: true,
    prompt: '选择任意名其他角色：回复等量体力并弃同花色牌造成火焰伤害（限定技）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.zhanyanDone) { await ctx.log('【绽炎】：本局已发动'); return; }
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { prompt: '【绽炎】：选择角色（至多 3 名）', candidates: cands, min: 1, max: Math.min(3, cands.length) });
      if (!ts.length) return;
      p.flags.zhanyanDone = true;
      await ctx.recover(p, ts.length, { reason: 'zhanyan' });
      const shown = [];
      for (const t of ts) {
        if (!t.hand.length) continue;
        const c = t.hand[g.rng.int(t.hand.length)];
        await g.revealCards([c], { to: g.alive(), reason: '绽炎' });
        shown.push({ t, suit: c.suit });
      }
      for (const s of shown) {
        const discard = p.hand.filter(c => c.suit === s.suit);
        if (!discard.length) continue;
        const c = discard[0];
        await ctx.discard(p, [c], { reason: 'zhanyan' });
        await ctx.damage({ from: p, to: s.t, amount: 1, nature: 'fire', reason: 'zhanyan' });
        await ctx.log(`【绽炎】：弃置 ${cardLabel(c)}，对 ${s.t.name} 造成 1 点火焰伤害`);
      }
      await ctx.log(`【绽炎】：结算完成（回复 ${ts.length} 点体力）`);
    },
  },
});
