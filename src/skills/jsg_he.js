// 江山如故·合（pack = 'jsg_he'）技能实现；技能 id 前缀 `jh_`
// 本包引入「蓄谋」：将一张手牌扣置判定区（背面），判定阶段按后置先处理，可使用之，否则全部置入弃牌堆（引擎 resolveXumou）
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

let vseq = 0;
const vcard = (name, suit = 'none', num = 0, extra = {}) => ({
  id: `vjh${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const others = (g, p) => g.alive().filter((x) => x !== p);
const isRed = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const lordOf = (g) => g.players.find((x) => x.flags?.isLord) || g.players[0];

async function gainYing(g, p, n) {
  const list = [];
  for (let i = 0; i < n; i++) list.push(vcard('ying', 'spade', 1));
  if (list.length) await g.gainCards(p, list, { reason: 'ying' });
  return list;
}
// 蓄谋：把一张牌从原区域移入判定区（背面朝上）
async function doXumou(g, p, card) {
  if (!card) return false;
  const i = p.hand.indexOf(card);
  if (i >= 0) p.hand.splice(i, 1);
  else for (const z of [g.deck, g.discardPile, g.table || []]) { const j = z.indexOf(card); if (j >= 0) z.splice(j, 1); }
  p.judgeZone = p.judgeZone || [];
  p.judgeZone.push({ card, name: 'xumou' });
  await g.log(`${p.name} 蓄谋一张牌（置于判定区）`);
  return true;
}
const xumouCards = (p) => (p.judgeZone || []).filter((z) => z.name === 'xumou');

// ============================================================
// 合·梦诸葛亮（蜀 3）【问天】【出师】【隐略】
// ============================================================
defineSkill({
  id: 'jh_wentian', name: '问天',
  desc: '每回合限一次，你的任意阶段开始时，你可以观看牌堆顶的五张牌，将其中一张交给一名其他角色，其余牌以任意顺序置于牌堆顶或牌堆底；你可以将牌堆顶的牌当【火攻】使用，若此牌不为红色，此技能于本轮内失效。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.player.flags.jhWtRound !== d.game.round,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jhWtTurn === g.turnCount) return;
      if (!(await ctx.ask.confirm(p, '【问天】：是否观看牌堆顶五张并分牌？'))) return;
      p.flags.jhWtTurn = g.turnCount;
      const top = g.deck.splice(Math.max(0, g.deck.length - 5), Math.min(5, g.deck.length));
      if (!top.length) return;
      await g.log(`【问天】：观看 ${top.map(cardLabel).join('、')}`);
      const cands = others(g, p);
      if (cands.length) {
        const t = (await ctx.ask.targets(p, { prompt: '【问天】：将其中一张交给一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
        const give = await g.chooseSomeCards(p, top, 1, { prompt: '【问天】：选择交给其的牌' });
        if (t && give[0]) {
          const i = top.indexOf(give[0]); if (i >= 0) top.splice(i, 1);
          await ctx.gain(t, [give[0]], { reason: 'wentian' });
          await g.log(`【问天】：${p.name} 将一张牌交给 ${t.name}`);
        }
      }
      for (const c of top) {
        const atTop = await ctx.ask.confirm(p, `【问天】：牌堆顶放置这段牌（顶或底）—— 当前牌 ${cardLabel(c)}`);
        if (atTop) g.deck.push(c); else g.deck.unshift(c);
      }
      // 本轮若牌堆顶非红色则本轮失效
      const nt = g.deck[g.deck.length - 1];
      if (!isRed(nt)) { p.flags.jhWtRound = g.round; await g.log('【问天】：牌堆顶非红色，本轮此技能失效'); }
    },
  }],
  active: {
    perTurn: false,
    prompt: '问天：将牌堆顶的牌当【火攻】使用（牌堆顶非红色则本轮失效）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jhWtRound === g.round) { await ctx.log('【问天】：本轮已失效'); return; }
      const cands = others(g, p).filter((x) => x.hand.length);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【问天】：选择【火攻】目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.useCard({ from: p, card: vcard('huogong', 'none', 0), targets: [t], reason: 'wentian' });
      const nt = g.deck[g.deck.length - 1];
      if (!isRed(nt)) { p.flags.jhWtRound = g.round; await ctx.log('【问天】：牌堆顶非红色，本轮此技能失效'); }
    },
  },
});

defineSkill({
  id: 'jh_chushi', name: '出师',
  desc: '出牌阶段限一次，你可以与主公议事，若结果为：红色，你与其各摸一张牌，若你们手牌数之和小于7则重复此流程；黑色，你本轮造成的属性伤害+1。',
  active: {
    perPhase: true,
    prompt: '出师：与主公议事（红：各摸一张；黑：本轮属性伤害+1）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const lord = lordOf(g);
      for (let i = 0; i < 3; i++) {
        const r = await g.yishi(p, p.flags.jhBazheng ? { forceRed: p.flags.jhHurtTargets || [] } : {});
        if (!r.total) { await ctx.log('【出师】：无法议事'); return; }
        if (r.redWin) {
          await ctx.draw(p, 1, { reason: 'chushi' });
          if (lord !== p) await ctx.draw(lord, 1, { reason: 'chushi' });
          await ctx.log(`【出师】：议事为红色（红${r.redN} 黑${r.blackN}），各摸一张`);
          if (p.hand.length + lord.hand.length >= 7) break;
        } else {
          p.flags.elemDmgBonus = (p.flags.elemDmgBonus || 0) + 1;
          p.flags.elemDmgRound = g.round;
          await ctx.log(`【出师】：议事为黑色（红${r.redN} 黑${r.blackN}），本轮属性伤害+1`);
          break;
        }
      }
    },
  },
});

defineSkill({
  id: 'jh_yinlue', name: '隐略',
  desc: '每轮各限一次，当一名角色受到火焰/雷电伤害时，你可以防止之，然后你在当前回合结束后执行一个只有摸牌/弃牌阶段的额外回合。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: true,
    filter: (d) => (d.nature === 'fire' || d.nature === 'thunder') && d.player.flags[`jhYl_${d.nature}`] !== d.game.round,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const nat = ctx.data.nature;
      if (!(await ctx.ask.confirm(p, `【隐略】：是否防止此${nat === 'fire' ? '火焰' : '雷电'}伤害？`))) return;
      ctx.data.canceled = true;
      p.flags[`jhYl_${nat}`] = g.round;
      await ctx.log('【隐略】：防止此次属性伤害');
      ctx.extraTurn(p);
    },
  }],
});

// ============================================================
// 合·姜维（蜀 4）【矜伐】【复谋】【选锋】
// ============================================================
defineSkill({
  id: 'jh_jinfa', name: '矜伐',
  desc: '出牌阶段限一次，你可以展示一张手牌，令所有体力上限不大于你的角色议事，若结果与此牌颜色：相同，你令其中至多两名角色将手牌摸至体力上限；不同，你获得两张【影】。然后若没有其他角色与你意见相同，你可以变更势力。',
  active: {
    perPhase: true,
    prompt: '矜伐：展示一张手牌令体力上限不大于你的角色议事',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) return;
      const c = (await g.chooseSomeCards(p, p.hand, 1, { prompt: '【矜伐】：展示一张手牌' }))[0];
      if (!c) return;
      const mine = isRed(c);
      await ctx.log(`【矜伐】：展示 ${cardLabel(c)}（${mine ? '红' : '黑'}）`);
      const force = p.flags.jhBazheng ? (p.flags.jhHurtTargets || []) : [];
      const r = await g.yishi(p, mine ? { forceRed: force } : { forceBlack: force });
      const same = mine ? r.red : r.black;
      const diff = mine ? r.black : r.red;
      if (mine ? r.redN >= r.blackN : r.blackN >= r.redN) {
        const cands = g.alive().filter((x) => x.maxHp <= p.maxHp && x.hand.length < x.hp);
        const picked = cands.length ? await ctx.ask.targets(p, { prompt: '【矜伐】：令至多两名角色将手牌摸至体力上限', candidates: cands, min: 0, max: Math.min(2, cands.length) }) : [];
        for (const t of picked) await ctx.draw(t, Math.max(0, t.hp - t.hand.length), { reason: 'jinfa' });
        await ctx.log(`【矜伐】：意见相同，${picked.length} 名角色摸牌至体力上限`);
      } else {
        await gainYing(g, p, 2);
        await ctx.log('【矜伐】：意见不同，获得两张【影】');
      }
      const allies = same.filter((x) => x !== p).length;
      if (!allies) {
        const k = await ctx.ask.choose(p, ['不变更势力', '变更为魏', '变更为蜀'], { prompt: '【矜伐】：无其他角色与你意见相同，可变更势力' });
        if (k === 1) await ctx.setKingdom(p, 'wei', '矜伐');
        else if (k === 2) await ctx.setKingdom(p, 'shu', '矜伐');
      }
      p.flags.jhJinfaRound = g.round;
    },
  },
});

defineSkill({
  id: 'jh_fumou', name: '复谋',
  desc: '魏势力技。议事结束后，与你意见不同的角色本回合不能使用或打出与其意见牌颜色相同的牌（降级：引擎议事不记录每位角色的意见牌，且无「禁止打出」钩子，前半段未实现）；你可以将一张【影】当【过河拆桥】对一名与你意见不同的角色使用。',
  active: {
    perTurn: false,
    prompt: '复谋（魏势力技）：将一张【影】当【过河拆桥】使用',
    usable: (p) => p.kingdom === 'wei' && p.hand.some((c) => c.name === 'ying'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ying = p.hand.filter((c) => c.name === 'ying');
      if (!ying.length) return;
      const cands = others(g, p).filter((x) => x.hand.length || Object.values(x.equips).some(Boolean) || (x.judgeZone || []).length);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【复谋】：选择【过河拆桥】目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.useCard({ from: p, card: vcard('guohe', 'none', 0), targets: [t], extraCards: [ying[0]], reason: 'fumou' });
    },
  },
});

defineSkill({
  id: 'jh_xuanfeng', name: '选锋',
  desc: '蜀势力技。你可以将一张【影】当无距离次数限制的刺【杀】使用（降级：引擎无【刺】关键字，按普通【杀】结算；无距离与次数限制已生效）。',
  active: {
    perTurn: false,
    prompt: '选锋（蜀势力技）：将一张【影】当无距离次数限制的【杀】使用',
    usable: (p) => p.kingdom === 'shu' && p.hand.some((c) => c.name === 'ying'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ying = p.hand.filter((c) => c.name === 'ying');
      const cands = others(g, p);
      if (!ying.length || !cands.length) return;
      const picked = await ctx.ask.targets(p, { prompt: '【选锋】：选择【杀】的目标', candidates: cands, min: 1, max: 1 });
      if (!picked.length) return;
      await ctx.useCard({ from: p, card: vcard('sha', 'none', 0), targets: picked, extraCards: [ying[0]], ignoreRange: true, ignoreShaLimit: true, reason: 'xuanfeng' });
    },
  },
});

// ============================================================
// 合·赵云（蜀 4）【龙临】【镇胆】
// ============================================================
// 龙临：在 target.before 阶段把该目标从这张【杀】的目标里摘掉（= 令此【杀】对其无效），
// 然后攻击者可以视为对赵云使用【决斗】；赵云以此法造成伤害后，攻击者本阶段不能再使用手牌
// （引擎 canUse 的 banCardTurn 出口，与陈到【往烈】同口径）。
defineSkill({
  id: 'jh_longlin', name: '龙临',
  desc: '当其他角色于其出牌阶段内首次使用【杀】指定目标后，你可以弃置一张牌令此【杀】无效，然后其可以视为对你使用一张【决斗】；当你以此法造成伤害后，其本阶段不能再使用手牌。',
  triggers: [{
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => d.card?.name === 'sha' && d.self && d.self !== d.player
      && d.game.phase === 'play' && d.game.turnPlayer === d.self
      && d.player.flags.jhLlTurn !== d.game.turnCount && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, u = ctx.data.self;
      if (u.flags.jhLlTurn === g.turnCount) return;
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【龙临】：弃置一张牌令此【杀】无效' }))[0];
      if (!c) return;
      u.flags.jhLlTurn = g.turnCount;
      await ctx.discard(p, [c], { reason: 'longlin' });
      ctx.data.canceled = true;
      await ctx.log('【龙临】：弃置一张牌，令此【杀】无效');
      if (u.alive && p.alive && (await ctx.ask.confirm(u, `【龙临】：是否视为对 ${p.name} 使用一张【决斗】？`))) {
        await ctx.useCard({ from: u, card: vcard('juedou', 'none', 0), targets: [p], reason: 'longlin' });
      }
    },
  }, {
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => d.reason === 'longlin' && d.from === d.player && d.to && d.to !== d.player,
    async effect(ctx) {
      const t = ctx.data.to, g = ctx.game;
      if (!t.alive || t.flags.banCardTurn === g.turnCount) return;
      t.flags.banCardTurn = g.turnCount;
      await ctx.log(`【龙临】：${t.name} 本阶段不能再使用手牌`);
    },
  }],
});

// 镇胆：
//   ①转化：可以把「一张非基本手牌」当任意基本牌【使用】（杀/桃/酒，出牌阶段可用者）或【打出】
//     （respond.need 接管，杀/闪/桃/酒全部支持）。②受伤后或每轮结束时摸 X 张（X = 本轮已执行的回合数，至多 5），
//     受伤后摸牌会令本技能本轮失效。round.end 已存在（game.js runTurn，self = 上一回合行动者）；
//     本处仍用「新一轮开始（round.begin）」对齐上一轮结束，属历史写法，可评估迁移。
const BASIC_RESPOND = ['sha', 'shan', 'tao', 'jiu'];
const zdX = (p) => Math.min(5, Math.max(1, p.flags.jhZdBouts || 1));
defineSkill({
  id: 'jh_zhendan', name: '镇胆',
  desc: '你可以将一张非基本手牌当任意基本牌使用或打出；当你受到伤害后或每轮结束时，你摸X张牌，此技能本轮失效（X为本轮所有角色执行过的回合数且至多为5）。',
  triggers: [{
    // X 的取值依据：本轮所有角色执行过的回合数
    on: 'turn.begin', who: 'any', optional: false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jhZdBoutsRound !== g.round) { p.flags.jhZdBoutsRound = g.round; p.flags.jhZdBouts = 0; }
      p.flags.jhZdBouts = (p.flags.jhZdBouts || 0) + 1;
    },
  }, {
    // 每轮结束时（用新一轮开始对齐）
    on: 'round.begin', who: 'any', optional: false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const n = zdX(p);
      await ctx.draw(p, n, { reason: 'zhendan' });
      await ctx.log(`【镇胆】：本轮结束，摸 ${n} 张牌，此技能本轮失效`);
    },
  }, {
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.player.flags.jhZdRound !== d.game.round,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.jhZdRound = g.round;
      const n = zdX(p);
      await ctx.draw(p, n, { reason: 'zhendan' });
      await ctx.log(`【镇胆】：受伤后摸 ${n} 张，此技能本轮失效`);
    },
  }, {
    // 打出：任意基本牌
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && BASIC_RESPOND.includes(d.filter.name)
      && d.self.flags.jhZdRound !== d.game.round
      && d.self.hand.some((c) => CARD_META[c.name]?.type !== 'basic'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const need = ctx.data.filter.name;
      const pool = p.hand.filter((c) => CARD_META[c.name]?.type !== 'basic');
      const c = (await g.chooseSomeCards(p, pool, 1, { prompt: `【镇胆】：将一张非基本手牌当【${CARD_META[need]?.cn}】打出` }))[0];
      if (!c) return;
      ctx.data.handled = true;
      ctx.data.card = { ...c, name: need, __src: c };
      await ctx.log(`【镇胆】：将一张非基本手牌当【${CARD_META[need]?.cn}】打出`);
    },
  }],
  active: {
    perTurn: false,
    prompt: '镇胆：将一张非基本手牌当基本牌使用',
    usable: (p) => p.flags.jhZdRound !== p.game.round && p.hand.some((c) => CARD_META[c.name]?.type !== 'basic'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jhZdRound === g.round) { await ctx.log('【镇胆】：本轮已失效'); return; }
      const pool = p.hand.filter((c) => CARD_META[c.name]?.type !== 'basic');
      if (!pool.length) return;
      const opts = [];
      if (others(g, p).length) opts.push(['sha', '当【杀】使用']);
      if (p.hp < p.maxHp) opts.push(['tao', '当【桃】使用']);
      if (!p.flags.jiuUsed) opts.push(['jiu', '当【酒】使用']);
      if (!opts.length) { await ctx.log('【镇胆】：当前没有可用的基本牌'); return; }
      const k = await ctx.ask.choose(p, opts.map((o) => o[1]), { prompt: '【镇胆】：转化的基本牌' });
      if (k < 0) return;
      const name = opts[k][0];
      const src = (await g.chooseSomeCards(p, pool, 1, { prompt: '【镇胆】：选择转化的牌' }))[0];
      if (!src) return;
      let targets = [p];
      if (name === 'sha') {
        const cands = g.candidatesFor(p, { name: 'sha', suit: src.suit, num: src.num });
        if (!cands.length) { await ctx.log('【镇胆】：没有合法目标'); return; }
        targets = await ctx.ask.targets(p, { prompt: '【镇胆】：选择【杀】的目标', candidates: cands, min: 1, max: 1 });
        if (!targets.length) return;
      }
      await ctx.useCard({ from: p, card: vcard(name, src.suit, src.num), targets, extraCards: [src], reason: 'zhendan' });
    },
  },
});

// ============================================================
// 合·刘永（蜀 3）【丹心】【封乡】
// ============================================================
// 丹心：把一张牌当【推心置腹】使用（【推心置腹】牌数据缺失，暂以【顺手牵羊】同构实现）+
// 「此牌结算结束后，本回合你计算与目标角色的距离+1」。距离修正走引擎 distance() 的
// `to.flags.distancePlus`（数值），回合结束时还原，避免遗留永久距离。
defineSkill({
  id: 'jh_danxin', name: '丹心',
  desc: '你可以将一张牌当【推心置腹】使用（降级：本引擎无【推心置腹】，以【顺手牵羊】代替）；你须展示获得和给出的牌，以此法得到红桃牌的角色回复1点体力。此牌结算结束后，本回合你计算与目标角色的距离+1。',
  triggers: [{
    // 回合结束还原临时距离修正
    on: 'turn.end', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const seat = p.flags.jhDxSeat;
      if (seat == null) return;
      const t = g.players[seat];
      if (t && (t.flags.distancePlus || 0) > 0) t.flags.distancePlus -= 1;
      p.flags.jhDxSeat = null;
    },
  }],
  active: {
    perTurn: false,
    prompt: '丹心：将一张牌当【顺手牵羊】使用（得红桃牌者回复1点体力）',
    usable: (p) => p.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) return;
      const cands = others(g, p).filter((x) => x.hand.length);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【丹心】：选择目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const src = (await g.chooseSomeCards(p, p.hand, 1, { prompt: '【丹心】：选择转化的牌' }))[0];
      if (!src) return;
      await g.log(`【丹心】：${p.name} 展示 ${cardLabel(src)}`);
      const got = t.hand.length ? (await g.chooseSomeCards(p, t.hand, 1, { prompt: `【丹心】：获得 ${t.name} 一张牌` }))[0] : null;
      if (src) { const i = p.hand.indexOf(src); if (i >= 0) p.hand.splice(i, 1); await ctx.gain(t, [src], { reason: 'danxin' }); }
      if (got) {
        await g.log(`【丹心】：${p.name} 获得 ${cardLabel(got)}`);
        await ctx.gain(p, [got], { from: t, reason: 'danxin' });
      }
      // 「以此法得到红桃牌的角色回复1点体力」：两个获得者各自判定——src 由 t 得到（t 回复）、
      // got 由 p 得到（p 回复）。旧实现只判了 src，且嵌在 got 分支里，导致 p 的红桃牌漏回复。
      if (src && src.suit === 'heart' && t.hp < t.maxHp) { await ctx.recover(t, 1, { reason: 'danxin' }); await g.log(`【丹心】：${t.name} 得到红桃牌，回复1点体力`); }
      if (got && got.suit === 'heart' && p.hp < p.maxHp) { await ctx.recover(p, 1, { reason: 'danxin' }); await g.log(`【丹心】：${p.name} 得到红桃牌，回复1点体力`); }
      t.flags.distancePlus = (t.flags.distancePlus || 0) + 1;
      p.flags.jhDxSeat = t.seat;
      await g.log(`【丹心】：本回合 ${p.name} 计算与 ${t.name} 的距离+1`);
    },
  },
});

defineSkill({
  id: 'jh_fengxiang', name: '封乡',
  desc: '锁定技，当你受到伤害后，你须与一名其他角色交换装备区里的所有牌，若你装备区里的牌数因此减少，你摸等同于减少数的牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【封乡】：选择交换装备区的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const mine = Object.values(p.equips).filter(Boolean).length;
      const his = Object.values(t.equips).filter(Boolean).length;
      const a = p.equips, b = t.equips;
      p.equips = { ...b }; t.equips = { ...a };
      const now = Object.values(p.equips).filter(Boolean).length;
      await g.log(`【封乡】：与 ${t.name} 交换装备区（${mine} ⇄ ${his}）`);
      if (now < mine) await ctx.draw(p, mine - now, { reason: 'fengxiang' });
    },
  }],
});

// ============================================================
// 合·高翔（蜀 4）【驰应】
// ============================================================
defineSkill({
  id: 'jh_chiying', name: '驰应',
  desc: '出牌阶段限一次，你可以选择一名角色，令其攻击范围内的其他角色各弃置一张牌。若弃置的基本牌数不大于其体力值，其获得这些基本牌。',
  active: {
    perPhase: true,
    prompt: '驰应：令一名角色攻击范围内的其他角色各弃置一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { prompt: '【驰应】：选择一名角色', candidates: g.alive(), min: 1, max: 1 }))[0];
      if (!t) return;
      const victims = g.alive().filter((x) => x !== t && g.inAttackRange(t, x) && (x.hand.length || Object.values(x.equips).some(Boolean)));
      const basics = [];
      for (const v of victims) {
        const pool = [...v.hand, ...Object.values(v.equips).filter(Boolean)];
        if (!pool.length) continue;
        const c = (await g.chooseSomeCards(t, pool, 1, { prompt: `【驰应】：弃置 ${v.name} 一张牌` }))[0];
        if (!c) continue;
        if (CARD_META[c.name]?.type === 'basic') basics.push(c);
        await ctx.discard(v, [c], { reason: 'chiying' });
      }
      await g.log(`【驰应】：${victims.length} 名角色各弃一张牌`);
      if (basics.length && basics.length <= t.hp) {
        for (const c of basics) await g.takeCard(c);   // 先从弃牌堆摘下，避免双存
        await ctx.gain(t, basics, { reason: 'chiying' });
        await g.log(`【驰应】：${t.name} 获得 ${basics.length} 张基本牌`);
      }
    },
  },
});

// ============================================================
// 合·曹芳（魏 3/4）【诏图】【惊惧】【危坠】
// ============================================================
// 诏图：额外回合的「手牌上限-2」用引擎弃牌阶段读取的 flags.handLimit 实现，
// 在该额外回合开始时减 2、结束时还原（否则会永久生效）。
defineSkill({
  id: 'jh_zhaotu', name: '诏图',
  desc: '每轮限一次，你可以将一张红色非锦囊牌当【乐不思蜀】使用，然后当前回合结束后，目标角色执行一个手牌上限-2的额外回合。',
  triggers: [{
    on: 'turn.begin', who: 'any', optional: false,
    filter: (d) => !!d.self.flags.jhZtPen,
    async effect(ctx) {
      const t = ctx.data.self, g = ctx.game;
      t.flags.jhZtPen = false;
      t.flags.handLimit = (t.flags.handLimit || 0) - 2;
      t.flags.jhZtApplied = g.turnCount;
      await ctx.log(`【诏图】：${t.name} 的额外回合，手牌上限-2`);
    },
  }, {
    on: 'turn.end', who: 'any', optional: false,
    filter: (d) => d.self.flags.jhZtApplied === d.game.turnCount,
    async effect(ctx) {
      const t = ctx.data.self;
      t.flags.handLimit = (t.flags.handLimit || 0) + 2;
      t.flags.jhZtApplied = null;
      await ctx.log('【诏图】：手牌上限恢复');
    },
  }],
  active: {
    perTurn: false,
    prompt: '诏图：将一张红色非锦囊牌当【乐不思蜀】使用（目标随后额外执行一个回合）',
    usable: (p) => p.hand.some((c) => isRed(c) && CARD_META[c.name]?.type !== 'trick'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jhZtRound === g.round) { await ctx.log('【诏图】：本轮已发动过'); return; }
      const pool = p.hand.filter((c) => isRed(c) && CARD_META[c.name]?.type !== 'trick');
      if (!pool.length) return;
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【诏图】：选择【乐不思蜀】目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const src = (await g.chooseSomeCards(p, pool, 1, { prompt: '【诏图】：选择转化的红色牌' }))[0];
      if (!src) return;
      p.flags.jhZtRound = g.round;
      const i = p.hand.indexOf(src); if (i >= 0) p.hand.splice(i, 1);
      t.judgeZone = t.judgeZone || [];
      t.judgeZone.push({ card: src, name: 'lebu' });
      await g.log(`【诏图】：${p.name} 将 ${cardLabel(src)} 当【乐不思蜀】置于 ${t.name} 判定区`);
      t.flags.jhZtPen = true;
      ctx.extraTurn(t);
      await g.log(`【诏图】：${t.name} 随后执行一个手牌上限-2的额外回合`);
    },
  },
});

defineSkill({
  id: 'jh_jingju', name: '惊惧',
  desc: '你可以将其他角色判定区里的一张牌移至你的判定区里，视为使用一张基本牌。',
  active: {
    perTurn: false,
    prompt: '惊惧：将其他角色判定区一张牌移至你的判定区，视为使用一张基本牌',
    usable: (p) => p.game.alive().some((x) => x !== p && (x.judgeZone || []).length > 0),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const owners = others(g, p).filter((x) => (x.judgeZone || []).length);
      if (!owners.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【惊惧】：选择判定区有牌的角色', candidates: owners, min: 1, max: 1 }))[0];
      if (!t) return;
      const z = t.judgeZone.pop();
      p.judgeZone = p.judgeZone || [];
      p.judgeZone.push(z);
      await g.log(`【惊惧】：${p.name} 将 ${t.name} 判定区的 ${cardLabel(z.card)} 移至自己判定区`);
      // 视为使用一张基本牌：引擎内可主动使用的基本牌为【杀】/【桃】/【酒】（【闪】不能主动使用）
      const opts = [];
      if (others(g, p).length) opts.push(['sha', '视为使用【杀】']);
      if (p.hp < p.maxHp) opts.push(['tao', '视为使用【桃】']);
      if (!p.flags.jiuUsed) opts.push(['jiu', '视为使用【酒】']);
      if (!opts.length) { await ctx.log('【惊惧】：当前没有可使用的基本牌'); return; }
      const k = await ctx.ask.choose(p, opts.map((o) => o[1]), { prompt: '【惊惧】：视为使用一张基本牌' });
      if (k < 0) return;
      const name = opts[k][0];
      if (name === 'sha') {
        const cands = g.candidatesFor(p, { name: 'sha' });
        if (!cands.length) return;
        const tg = await ctx.ask.targets(p, { prompt: '【惊惧】：选择【杀】的目标', candidates: cands, min: 1, max: 1 });
        if (tg.length) await ctx.useCard({ from: p, card: vcard('sha'), targets: tg, reason: 'jingju' });
      } else {
        await ctx.useCard({ from: p, card: vcard(name), targets: [p], reason: 'jingju' });
      }
    },
  },
});

defineSkill({
  id: 'jh_weizhui', name: '危坠',
  desc: '主公技，其他魏势力角色的结束阶段，其可以将一张黑色手牌当【过河拆桥】对你使用。',
  triggers: [{
    on: 'turn.end', who: 'self', optional: true,
    filter: (d) => d.self !== d.player && d.self.kingdom === 'wei' && d.self.hand.some((c) => !isRed(c)),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, u = ctx.data.self;
      const blacks = u.hand.filter((c) => !isRed(c));
      if (!blacks.length) return;
      if (!(await ctx.ask.confirm(u, `【危坠】：是否将一张黑色手牌当【过河拆桥】对 ${p.name} 使用？`))) return;
      const c = blacks[0];
      u.flags.__wzCard = c;
      await ctx.useCard({ from: u, card: vcard('guohe'), targets: [p], extraCards: [c], reason: 'weizhui' });
    },
  }],
});

// ============================================================
// 合·郭循（魏 4）【遏前】【伏杀】
// ============================================================
defineSkill({
  id: 'jh_eqian', name: '遏前',
  desc: '结束阶段，你可以蓄谋任意次；当你使用【杀】或蓄谋牌指定其他角色为唯一目标后，你可以令此牌不计入次数限制并获得目标一张牌，然后目标可以令你本回合计算与其的距离+2。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self;
      for (let i = 0; i < 3; i++) {
        if (!p.hand.length) break;
        if (i > 0 && !(await ctx.ask.confirm(p, '【遏前】：是否继续蓄谋？'))) break;
        const c = (await ctx.game.chooseSomeCards(p, p.hand, 1, { prompt: '【遏前】：蓄谋一张手牌' }))[0];
        if (!c) break;
        await doXumou(ctx.game, p, c);
      }
    },
  }, {
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => {
      if (!d.self || d.self !== d.player) return false;
      const isSha = d.card?.name === 'sha';
      const fromXm = d.card?.__xumou;
      return (isSha || fromXm) && (d.targets || []).filter((t) => t !== d.player).length === 1;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (ctx.data.targets || []).filter((x) => x !== p)[0];
      if (!t) return;
      if (!(await ctx.ask.confirm(p, `【遏前】：是否令此牌不计次数并获得 ${t.name} 一张牌？`))) return;
      const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
      if (pool.length) {
        const c = (await g.chooseSomeCards(p, pool, 1, { prompt: `【遏前】：获得 ${t.name} 一张牌` }))[0];
        if (c) await ctx.gain(p, [c], { from: t, reason: 'eqian' });
      }
      if (await ctx.ask.confirm(t, `【遏前】：是否令 ${p.name} 本回合计算与你的距离+2？`)) {
        p.flags.distancePlus = { ...(p.flags.distancePlus || {}), [t.seat]: g.turnCount };
        await g.log(`【遏前】：${p.name} 本回合与 ${t.name} 的距离+2`);
      }
    },
  }],
});

defineSkill({
  id: 'jh_fusha', name: '伏杀',
  desc: '限定技，出牌阶段，若你的攻击范围内仅有一名角色，你可以对其造成X点伤害（X为你的攻击范围且至多为游戏人数）。',
  active: {
    perTurn: false,
    prompt: '伏杀（限定技）：若攻击范围内仅一名角色，对其造成X点伤害',
    usable: (p) => !p.flags.jhFsUsed,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jhFsUsed) return;
      const inR = g.alive().filter((x) => x !== p && g.inAttackRange(p, x));
      if (inR.length !== 1) { await ctx.log(`【伏杀】：攻击范围内角色数为 ${inR.length}，无法发动`); return; }
      p.flags.jhFsUsed = true;
      const x = Math.min(g.attackRange(p), g.alive().length);
      await ctx.log(`【伏杀】：限定技发动，对 ${inR[0].name} 造成 ${x} 点伤害`);
      await ctx.damage({ from: p, to: inR[0], amount: x, reason: 'fusha' });
    },
  },
});

// ============================================================
// 合·司马懿（魏 4）【鹰视】【蜕骨】
// ============================================================
defineSkill({
  id: 'jh_yingshi', name: '鹰视',
  desc: '当你翻面时，你可以观看牌堆底的三张牌（若死亡角色数大于2则改为五张），然后将这些牌以任意顺序置于牌堆顶或牌堆底。',
  triggers: [{
    on: 'flip.after', who: 'self', optional: true,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const dead = g.players.filter((x) => !x.alive).length;
      const n = dead > 2 ? 5 : 3;
      const picked = g.deck.splice(0, Math.min(n, g.deck.length));
      if (!picked.length) return;
      await g.log(`【鹰视】：观看牌堆底 ${picked.length} 张：${picked.map(cardLabel).join('、')}`);
      for (const c of picked) {
        const atTop = await ctx.ask.confirm(p, `【鹰视】：${cardLabel(c)} 置顶（否=置底）`);
        if (atTop) g.deck.push(c); else g.deck.unshift(c);
      }
    },
  }],
});

// 蜕骨：手牌上限用引擎弃牌阶段读取的 flags.handLimit（本回合有效，回合结束还原）。
// 仍缺：「视为使用【解甲归田】」（CARD_META 无该牌）、「每轮结束时若本轮未执行过回合则执行额外回合」
// （round.end 已存在，见 game.js runTurn，self = 上一回合行动者；未实现是功能缺口，不是缺事件）。
defineSkill({
  id: 'jh_tuigu', name: '蜕骨',
  desc: '回合开始时，你可以翻面并令你本回合的手牌上限+X，然后摸X张牌（降级：原文另有「视为使用【解甲归田】」与「每轮结束时若本轮未执行过回合则执行额外回合」；X为存活角色数的一半向下取整）；当你失去装备区里的牌后，你回复1点体力。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: true,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【蜕骨】：是否翻面并摸牌（本回合手牌上限提升）？'))) return;
      await ctx.flip(p);
      const x = Math.max(1, Math.floor(g.alive().length / 2));
      p.flags.handLimit = (p.flags.handLimit || 0) + x;
      p.flags.jhTgLimit = (p.flags.jhTgLimit || 0) + x;
      await ctx.draw(p, x, { reason: 'tuigu' });
      await ctx.log(`【蜕骨】：翻面，本回合手牌上限+${x}，摸 ${x} 张牌`);
    },
  }, {
    // 本回合的手牌上限加成在回合结束时还原
    on: 'turn.end', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self;
      const add = p.flags.jhTgLimit || 0;
      if (!add) return;
      p.flags.handLimit = (p.flags.handLimit || 0) - add;
      p.flags.jhTgLimit = 0;
    },
  }, {
    on: 'equip.lose', who: 'self', optional: true,
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.jhTgHpRound === ctx.game.round) return;
      p.flags.jhTgHpRound = ctx.game.round;
      await ctx.recover(p, 1);
      await ctx.log('【蜕骨】：失去装备区的牌，回复1点体力');
    },
  }],
});

// ============================================================
// 合·郭照（魏 3）【偏宠】【尊位】
// ============================================================
// 偏宠：X 取「此回合进入弃牌堆的红色/黑色牌数量」（判定红色数红色牌、黑色数黑色牌），
// 由 cards.discard 事件按回合累计；判定的前提仍是「你于此回合内失去过牌」。
defineSkill({
  id: 'jh_pianchong', name: '偏宠',
  desc: '一名角色的结束阶段，若你于此回合内失去过牌，你可以进行判定，若结果为红色/黑色，你摸X张牌（X为此回合进入弃牌堆的红色/黑色牌数且至多5）。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jhPcTurn !== g.turnCount) {
        p.flags.jhPcTurn = g.turnCount; p.flags.jhPcRed = 0; p.flags.jhPcBlack = 0; p.flags.jhPcLost = false;
      }
      for (const c of (ctx.data.cards || [])) {
        if (!c || !c.suit) continue;
        if (c.suit === 'heart' || c.suit === 'diamond') p.flags.jhPcRed = (p.flags.jhPcRed || 0) + 1;
        else if (c.suit === 'spade' || c.suit === 'club') p.flags.jhPcBlack = (p.flags.jhPcBlack || 0) + 1;
      }
      if (ctx.data.self === p) p.flags.jhPcLost = true;
    },
  }, {
    on: 'turn.end', who: 'any', optional: true,
    filter: (d) => d.player.flags.jhPcTurn === d.game.turnCount && d.player.flags.jhPcLost
      && d.player.flags.jhPcDone !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【偏宠】：是否进行判定并摸牌？'))) return;
      p.flags.jhPcDone = g.turnCount;
      const d = await ctx.judge(p, { reason: '偏宠' });
      const red = isRed(d.card);
      const cnt = red ? (p.flags.jhPcRed || 0) : (p.flags.jhPcBlack || 0);
      const x = Math.min(5, Math.max(1, cnt));
      await g.log(`【偏宠】：判定为${red ? '红色' : '黑色'}，摸 ${x} 张牌`);
      await ctx.draw(p, x, { reason: 'pianchong' });
    },
  }],
});

defineSkill({
  id: 'jh_zunwei', name: '尊位',
  desc: '出牌阶段限一次，你可以选择一名其他角色并选择一项（每回合各限一次）：1.将手牌摸至与其相同（至多摸五张）；2.将其装备区里的牌移至你的装备区，直到你装备区里的牌数不小于其；3.将体力回复至与其相同。',
  active: {
    perPhase: true,
    prompt: '尊位：选择一名其他角色，摸牌/夺装备/回复体力至与其相同',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { prompt: '【尊位】：选择一名其他角色', candidates: others(g, p), min: 1, max: 1 }))[0];
      if (!t) return;
      const k = await ctx.ask.choose(p, ['手牌摸至与其相同（至多5张）', '将其装备移入你的装备区', '体力回复至与其相同'], { prompt: '【尊位】：选择一项' });
      if (k === 0) {
        const n = Math.min(5, Math.max(0, t.hand.length - p.hand.length));
        if (n > 0) await ctx.draw(p, n, { reason: 'zunwei' });
        await ctx.log(`【尊位】：摸 ${n} 张牌`);
      } else if (k === 1) {
        const mine = Object.values(p.equips).filter(Boolean).length;
        const his = Object.values(t.equips).filter(Boolean).length;
        let moved = 0;
        if (his > 0 && mine < his) {
          for (const slot of Object.keys(t.equips)) {
            const c = t.equips[slot];
            if (!c) continue;
            if (Object.values(p.equips).filter(Boolean).length >= his) break;
            if (p.equips[slot]) continue;
            // ★t 的装备被移走 → 走引擎出口派发 equip.lose（SG033 P0-2）
            await g.unequipCard(t, c, { reason: 'zunwei' });
            p.equips[slot] = c; moved++;
          }
        }
        await ctx.log(`【尊位】：移入 ${moved} 张装备`);
      } else {
        const n = Math.max(0, Math.min(t.hp - p.hp, p.maxHp - p.hp));
        if (n > 0) await ctx.recover(p, n);
        await ctx.log(`【尊位】：回复 ${n} 点体力`);
      }
    },
  },
});

// ============================================================
// 合·文钦（魏 4）【犷骜】【彗企】【偕举】
// ============================================================
// 犷骜：
//   ①你使用【杀】可以多指定一个目标（card.use.before 里追加 targets）；
//   ②其他角色使用【杀】可以多指定你为目标（card.use.before 里写 useData.extraTargets，引擎已支持）；
//   ③然后若你的手牌数为偶数，你摸一张牌且可以令此【杀】对任意目标无效
//     （在 card.use.before 预选一个无效目标，target.before 里置 canceled 摘掉它）。
defineSkill({
  id: 'jh_guangao', name: '犷骜',
  desc: '你使用【杀】可以多指定一个目标，其他角色使用【杀】可以多指定你为目标。然后若你的手牌数为偶数，你摸一张牌且可以令此【杀】对任意目标无效。',
  triggers: [{
    // ① 你的【杀】多指定一个目标 + ③ 预选「令此【杀】无效」的目标
    on: 'card.use.before', who: 'self', optional: false,
    filter: (d) => d.card?.name === 'sha' && d.self === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const tars = (ctx.data.targets || []).filter((t) => t !== p);
      if (tars.length === 1) {
        const cands = others(g, p).filter((x) => !(ctx.data.targets || []).includes(x));
        if (cands.length && (await ctx.ask.confirm(p, '【犷骜】：是否为此【杀】多指定一个目标？'))) {
          const t = (await ctx.ask.targets(p, { prompt: '【犷骜】：额外指定一个目标', candidates: cands, min: 1, max: 1 }))[0];
          if (t) {
            ctx.data.extraTargets = [...(ctx.data.extraTargets || []), t.seat];
            await g.log(`【犷骜】：额外指定 ${t.name} 为目标`);
          }
        }
      }
      if (p.hand.length % 2 !== 0) return;
      const live = (ctx.data.targets || []).filter((x) => x && x.alive);
      if (!live.length) return;
      if (!(await ctx.ask.confirm(p, '【犷骜】：手牌数为偶数，是否令此【杀】对其中一名目标无效？'))) return;
      const t = (await ctx.ask.targets(p, { prompt: '【犷骜】：令此【杀】对该目标无效', candidates: live, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.jhGaVoid = { cardId: ctx.data.card?.id, seats: [t.seat] };
      await g.log(`【犷骜】：令此【杀】对 ${t.name} 无效`);
    },
  }, {
    // ② 其他角色使用【杀】可以多指定你为目标
    on: 'card.use.before', who: 'any', optional: false,
    filter: (d) => d.card?.name === 'sha' && d.self && d.self !== d.player
      && d.player.alive && !(d.targets || []).includes(d.player),
    async effect(ctx) {
      const p = ctx.self, u = ctx.data.self;
      if (!(await ctx.ask.confirm(u, `【犷骜】：是否额外指定 ${p.name} 为此【杀】的目标？`))) return;
      ctx.data.extraTargets = [...(ctx.data.extraTargets || []), p.seat];
      await ctx.log(`【犷骜】：额外指定 ${p.name} 为此【杀】的目标`);
    },
  }, {
    // ③ 无效目标落地
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => {
      const v = d.player.flags.jhGaVoid;
      return !!v && d.card && v.cardId === d.card.id && v.seats.includes(d.target?.seat);
    },
    async effect(ctx) {
      ctx.data.canceled = true;
      ctx.self.flags.jhGaVoid = null;
      await ctx.log('【犷骜】：此【杀】对该目标无效');
    },
  }, {
    // ③ 手牌数为偶数：摸一张牌（并把预选标记清掉）
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.card?.name === 'sha' && d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.jhGaVoid = null;
      if (p.hand.length % 2 !== 0) return;
      await ctx.draw(p, 1, { reason: 'guangao' });
      await ctx.log('【犷骜】：手牌数为偶数，摸一张牌');
    },
  }],
});

defineSkill({
  id: 'jh_huiqi', name: '彗企',
  desc: '觉醒技，每回合结束后，若本回合包括你有且仅有三名角色成为过牌的目标，你回复1点体力并获得【偕举】。',
  triggers: [{
    on: 'turn.end', who: 'self', optional: false,
    filter: (d) => !d.player.flags.jhHqAwake,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const set = p.flags.jhTargetSet;
      if (p.flags.jhTargetTurn !== g.turnCount || !set) return;
      const names = Object.keys(set);
      if (names.length !== 3 || !set[p.id]) return;
      p.flags.jhHqAwake = true;
      await ctx.recover(p, 1);
      const sk = getSkill('jh_xieju');
      if (sk && !(effSkills(p) || []).some((s) => s.id === 'jh_xieju')) p.skills.push(sk);
      await ctx.log(`【彗企】：觉醒，回复1点体力并获得【偕举】`);
    },
  }, {
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jhHqAwake) return;
      if (p.flags.jhTargetTurn !== g.turnCount) { p.flags.jhTargetTurn = g.turnCount; p.flags.jhTargetSet = {}; }
      const set = p.flags.jhTargetSet;
      const users = [ctx.data.self, ...(ctx.data.targets || [])];
      for (const u of users) if (u) set[u.id] = 1;
    },
  }],
});

defineSkill({
  id: 'jh_xieju', name: '偕举',
  desc: '出牌阶段限一次，你可以选择任意名本回合成为过牌目标的角色，令其各可以将一张黑色牌当【杀】使用。',
  active: {
    perPhase: true,
    prompt: '偕举：令本回合成为过牌目标的角色各可将一张黑色牌当【杀】使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const set = p.flags.jhTargetSet || {};
      const cands = g.alive().filter((x) => set[x.id] && x.hand.some((c) => !isRed(c)));
      if (!cands.length) { await ctx.log('【偕举】：无可选角色'); return; }
      const picked = await ctx.ask.targets(p, { prompt: '【偕举】：选择角色', candidates: cands, min: 0, max: cands.length });
      for (const t of picked) {
        const blacks = t.hand.filter((c) => !isRed(c));
        if (!blacks.length) continue;
        if (!(await ctx.ask.confirm(t, '【偕举】：是否将一张黑色牌当【杀】使用？'))) continue;
        const tars = others(g, t);
        if (!tars.length) continue;
        const tg = await ctx.ask.targets(t, { prompt: '【偕举】：选择【杀】的目标', candidates: tars, min: 1, max: 1 });
        if (!tg.length) continue;
        await ctx.useCard({ from: t, card: vcard('sha'), targets: tg, extraCards: [blacks[0]], reason: 'xieju' });
      }
    },
  },
});

// ============================================================
// 合·曹爽（魏 4）【擅专】【托孤】
// ============================================================
defineSkill({
  id: 'jh_shanzhuan', name: '擅专',
  desc: '当你对一名其他角色造成伤害后，若其判定区里没有牌，你可以将其一张牌置于其判定区（红色牌视为【乐不思蜀】、黑色牌视为【兵粮寸断】）；结束阶段，若你本回合未造成过伤害，你可以摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.to && d.to !== d.player && !(d.to.judgeZone || []).length,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.to;
      const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
      if (!pool.length) return;
      if (!(await ctx.ask.confirm(p, `【擅专】：是否将 ${t.name} 一张牌置于其判定区？`))) return;
      const c = (await g.chooseSomeCards(p, pool, 1, { prompt: `【擅专】：选择 ${t.name} 的牌` }))[0];
      if (!c) return;
      const i = t.hand.indexOf(c);
      if (i >= 0) t.hand.splice(i, 1);
      else await ctx.game.unequipCard(t, c, { reason: 'lebu' });
      t.judgeZone = t.judgeZone || [];
      t.judgeZone.push({ card: c, name: isRed(c) ? 'lebu' : 'bingliang' });
      await g.log(`【擅专】：将 ${cardLabel(c)} 置于 ${t.name} 判定区（视为${isRed(c) ? '【乐不思蜀】' : '【兵粮寸断】'}）`);
    },
  }, {
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.player.flags.jhSzDmgTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'shanzhuan' });
      await ctx.log('【擅专】：本回合未造成伤害，摸一张牌');
    },
  }, {
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.to && d.to !== d.player,
    async effect(ctx) { ctx.self.flags.jhSzDmgTurn = ctx.game.turnCount; },
  }],
});

defineSkill({
  id: 'jh_tuogu', name: '托孤',
  desc: '当一名角色死亡时，你可以令其选择其武将牌上的一个技能（限定技、觉醒技、主公技、隐匿技除外），然后你失去上一次以此法获得的技能，获得此技能。',
  triggers: [{
    on: 'death.after', who: 'self', optional: true,
    filter: (d) => d.self && d.self !== d.player && effSkills(d.self).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, dead = ctx.data.self;
      const pool = (effSkills(dead) || []).filter((s) => s && !s.lord && !s.awaken && !s.limited);
      if (!pool.length) return;
      if (!(await ctx.ask.confirm(p, `【托孤】：是否获得 ${dead.name} 的一个技能？`))) return;
      const k = await ctx.ask.choose(p, pool.map((s) => s.name), { prompt: '【托孤】：选择要获得的技能' });
      const pick = pool[Math.max(0, Math.min(pool.length - 1, k || 0))];
      if (!pick) return;
      const prevTg = p.flags.jhTgSkill;
      if (prevTg) await g.removeSkills(p, [prevTg]);   // ★统一出口（SG030 A2）
      p.flags.jhTgSkill = pick.id;
      if (!effSkills(p).some((s) => s.id === pick.id)) p.skills.push(pick);
      await g.log(`【托孤】：${p.name} 获得【${pick.name}】`);
    },
  }],
});

// ============================================================
// 合·陈泰（魏 4）【救陷】【沉勇】
// ============================================================
defineSkill({
  id: 'jh_jiuxian', name: '救陷',
  desc: '出牌阶段限一次，你可以重铸一半的手牌（向上取整），视为使用一张【决斗】；此牌对目标角色造成伤害后，你可以令其攻击范围内的一名其他角色回复1点体力。',
  active: {
    perPhase: true,
    prompt: '救陷：重铸一半手牌（向上取整），视为使用【决斗】',
    usable: (p) => p.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const n = Math.ceil(p.hand.length / 2);
      const thrown = p.hand.slice(0, n);
      if (thrown.length) {
        for (const c of thrown) { const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1); }
        g.pushDiscard(thrown);
        await g.log(`【救陷】：重铸 ${thrown.length} 张牌`);
        await ctx.draw(p, thrown.length, { reason: 'jiuxian' });
      }
      const cands = others(g, p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【救陷】：选择【决斗】目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const before = t.hp;
      await ctx.useCard({ from: p, card: vcard('juedou'), targets: [t], reason: 'jiuxian' });
      if (t.hp < before && t.alive) {
        const heal = g.alive().filter((x) => x !== t && g.inAttackRange(t, x) && x.hp < x.maxHp);
        if (heal.length && (await ctx.ask.confirm(p, '【救陷】：是否令其攻击范围内一名其他角色回复1点体力？'))) {
          const h = (await ctx.ask.targets(p, { prompt: '【救陷】：选择回复体力的角色', candidates: heal, min: 1, max: 1 }))[0];
          if (h) await ctx.recover(h, 1);
        }
      }
    },
  },
});

defineSkill({
  id: 'jh_chenyong', name: '沉勇',
  desc: '结束阶段，你可以摸X张牌（X为你本回合使用过牌的类别数：基本牌/锦囊牌/装备牌）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && Object.keys(d.player.flags.jhUseKinds || {}).length > 0,
    async effect(ctx) {
      const p = ctx.self;
      const x = Object.keys(p.flags.jhUseKinds || {}).length;
      await ctx.draw(p, x, { reason: 'chenyong' });
      await ctx.log(`【沉勇】：本回合使用过 ${x} 类牌，摸 ${x} 张`);
    },
  }, {
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      const t = CARD_META[ctx.data.card?.name]?.type || 'basic';
      p.flags.jhUseKinds = { ...(p.flags.jhUseKinds || {}), [t]: 1 };
    },
  }],
});

// ============================================================
// 合·孙峻（吴 4）【邀宴】【霸政】
// ============================================================
defineSkill({
  id: 'jh_yaoyan', name: '邀宴',
  desc: '准备阶段，你可以令所有角色依次选择是否于本回合结束时参与议事，若此议事结果为：红色，你获得任意名未参与议事的角色各一张手牌；黑色，你可以对一名参与议事的角色造成2点伤害。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.game.alive().length > 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【邀宴】：是否令所有角色议事？'))) return;
      const join = [], skip = [];
      for (const t of others(g, p)) {
        const yes = await ctx.ask.confirm(t, `【邀宴】：是否参与议事？（${p.name} 发动）`);
        (yes ? join : skip).push(t);
      }
      const force = p.flags.jhBazheng ? (p.flags.jhHurtTargets || []) : [];
      const r = await g.yishi(p, { forceRed: force });
      await g.log(`【邀宴】：议事红${r.redN} 黑${r.blackN}（参与 ${join.length} 人）`);
      if (r.redWin) {
        const pool = skip.filter((x) => x.hand.length);
        if (!pool.length) { await ctx.log('【邀宴】：无未参与者有手牌'); return; }
        const picked = await ctx.ask.targets(p, { prompt: '【邀宴】：获得未参与议事角色各一张手牌', candidates: pool, min: 0, max: pool.length });
        for (const t of picked) {
          const c = (await g.chooseSomeCards(p, t.hand, 1, { prompt: `【邀宴】：获得 ${t.name} 一张手牌` }))[0];
          if (c) await ctx.gain(p, [c], { from: t, reason: 'yaoyan' });
        }
      } else {
        if (!join.length) { await ctx.log('【邀宴】：无参与者'); return; }
        const t = (await ctx.ask.targets(p, { prompt: '【邀宴】：对一名参与议事的角色造成2点伤害', candidates: join, min: 1, max: 1 }))[0];
        if (t) await ctx.damage({ from: p, to: t, amount: 2, reason: 'yaoyan' });
      }
    },
  }],
});

defineSkill({
  id: 'jh_bazheng', name: '霸政',
  desc: '当你参与的议事意见展示时，本回合受到过你造成伤害的角色意见视为与你相同。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.to && d.to !== d.player,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.jhBazheng = true;
      const list = (p.flags.jhHurtTargets || []).filter(Boolean);
      if (!list.includes(ctx.data.to)) list.push(ctx.data.to);
      p.flags.jhHurtTargets = list;
      p.flags.jhHurtTurn = ctx.game.turnCount;
    },
  }],
});

// ============================================================
// 合·陆逊（吴 3）【诱进】【待劳】【逐北】
// ============================================================
// 诱进：拼点后双方各记录本方拼点牌点数，本回合「使用」点数小于该值的牌被取消（card.use.before）。
// 拼点结果改用 pindian 返回的 aNum/bNum 判定（旧实现用 r.a > r.b 比较牌对象，永远判成平局）。
// 仍缺：「打出」的点数限制需要 respondCard 的候选牌钩子（引擎未提供）。
defineSkill({
  id: 'jh_youjin', name: '诱进',
  desc: '出牌阶段开始时，你可以与一名角色拼点，双方本回合不能使用点数小于各自拼点牌的手牌（降级：「打出」部分未实现）；赢的角色视为对没赢的角色使用一张【杀】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.game.alive().length > 1 && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【诱进】：是否与一名角色拼点？'))) return;
      const t = (await ctx.ask.targets(p, { prompt: '【诱进】：选择拼点角色', candidates: others(g, p).filter((x) => x.hand.length), min: 1, max: 1 }))[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: 'youjin' });
      if (!r || r.skip) return;
      p.flags.jhYjP = { num: r.aNum || 0, turn: g.turnCount };
      t.flags.jhYjP = { num: r.bNum || 0, turn: g.turnCount };
      await ctx.log(`【诱进】：双方本回合不能使用点数小于 ${r.aNum}/${r.bNum} 的手牌`);
      if (r.aNum === r.bNum) { await ctx.log('【诱进】：拼点平局，不视为使用【杀】'); return; }
      const winner = r.aNum > r.bNum ? p : t;
      const loser = winner === p ? t : p;
      await ctx.log(`【诱进】：${winner.name} 拼点胜，视为对 ${loser.name} 使用一张【杀】`);
      await ctx.useCard({ from: winner, card: vcard('sha'), targets: [loser], reason: 'youjin' });
    },
  }, {
    // 点数限制（使用）：本回合不能使用点数小于自己拼点牌的手牌
    on: 'card.use.before', who: 'any', optional: false,
    filter: (d) => {
      const r = d.self && d.self.flags && d.self.flags.jhYjP;
      if (!r || r.turn !== d.game.turnCount) return false;
      const c = d.card;
      if (!c || c.suit === 'none') return false;      // 虚拟牌/无花色牌不受限制
      return (c.num || 0) < r.num;
    },
    async effect(ctx) {
      const u = ctx.data.self;
      ctx.data.canceled = true;
      await ctx.log(`【诱进】：${u.name} 本回合不能使用点数小于 ${u.flags.jhYjP.num} 的牌`);
    },
  }],
});

// 待劳：「没有可以使用的手牌」用引擎 canUse 逐张试算（旧实现只看手牌是否为空）；
// 展示所有手牌后摸两张牌。仍缺：「然后结束此回合」需要引擎提供结束出牌阶段/回合的出口。
function firstUsableHand(g, p) {
  for (const c of p.hand) {
    const meta = CARD_META[c.name];
    if (!meta || !meta.target) continue;              // 【闪】/【无懈】不能主动使用
    let tars = null;
    try { tars = g.autoTargetsFor(p, c); } catch { tars = null; }
    if (!tars || !tars.length) {
      let cands = [];
      try { cands = (typeof meta.target === 'function' ? meta.target(g, p) : g.candidatesFor(p, c)) || []; } catch { cands = []; }
      tars = cands.length ? [cands[0]] : [];
    }
    if (!tars.length) continue;
    let ok = false;
    try { ok = g.canUse(p, c, tars).ok; } catch { ok = false; }
    if (ok) return c;
  }
  return null;
}

defineSkill({
  id: 'jh_dailao', name: '待劳',
  desc: '出牌阶段，若你没有可以使用的手牌（降级：省略「然后结束此回合」），你可以展示所有手牌并摸两张牌。',
  active: {
    perTurn: false,
    prompt: '待劳：没有可以使用的手牌时，展示所有手牌并摸两张牌',
    usable: (p) => !firstUsableHand(p.game, p),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (firstUsableHand(g, p)) { await ctx.log('【待劳】：你有可以使用的手牌，无法发动'); return; }
      await g.log(`【待劳】：展示所有手牌 ${p.hand.map((c) => `【${cardLabel(c)}】`).join('') || '（无）'}`);
      await ctx.draw(p, 2, { reason: 'dailao' });
      await ctx.log('【待劳】：摸两张牌');
    },
  },
});

// 逐北：
//   ①你对本回合受到过伤害的角色造成的伤害 +1（damage.before/after 打时间戳）；
//   ②你对本回合失去过最后手牌的角色使用牌无次数限制 —— 引擎 canUse 里唯一的「按座位豁免
//     【杀】次数」出口是 flags.xiongluanTurn/xiongluanSeat（张绣【雄乱】在用，flag 按角色私有，
//     不会串技能），因此在 hand.change 发现某角色手牌归零时把它记成该座位，引擎即豁免次数。
defineSkill({
  id: 'jh_zhubei', name: '逐北',
  desc: '锁定技，你对本回合受到过伤害的角色造成的伤害+1；你对本回合失去过最后手牌的角色使用牌无次数限制。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.from === d.player && d.to && d.to !== d.player && d.to.flags.jhHurtTurn === d.game.turnCount,
    async effect(ctx) {
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      await ctx.log(`【逐北】：${ctx.data.to.name} 本回合受到过伤害，此伤害+1`);
    },
  }, {
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.to && d.to !== d.player,
    async effect(ctx) { ctx.data.to.flags.jhHurtTurn = ctx.game.turnCount; },
  }, {
    // ②本回合失去过最后手牌的角色 → 你对其使用牌无次数限制
    on: 'hand.change', who: 'any', optional: false,
    filter: (d) => d.self && d.self !== d.player && d.count === 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, q = ctx.data.self;
      p.flags.xiongluanTurn = g.turnCount;
      p.flags.xiongluanSeat = q.seat;
      await ctx.log(`【逐北】：${q.name} 失去最后的手牌，你对其使用牌无次数限制`);
    },
  }],
});

// ============================================================
// 合·孙鲁班&孙鲁育（吴 3）【殆谋】【芳洁】
// ============================================================
defineSkill({
  id: 'jh_daimou', name: '殆谋',
  desc: '每回合各限一次，当一名角色使用【杀】指定其他角色/你为目标时，你可以用牌堆顶的牌蓄谋/你须弃置你区域里的一张蓄谋牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => d.card?.name === 'sha' && (d.targets || []).some((t) => t !== d.self) && d.player.flags.jhDmA !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【殆谋】：是否用牌堆顶的牌蓄谋？'))) return;
      const top = g.deck.pop();
      if (!top) return;
      p.flags.jhDmA = g.turnCount;
      p.judgeZone = p.judgeZone || [];
      p.judgeZone.push({ card: top, name: 'xumou' });
      await g.log('【殆谋】：用牌堆顶的牌蓄谋');
    },
  }, {
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.card?.name === 'sha' && (d.targets || []).includes(d.player) && xumouCards(d.player).length > 0 && d.player.flags.jhDmB !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.jhDmB = ctx.game.turnCount;
      const list = xumouCards(p);
      if (!list.length) return;
      const c = (await ctx.game.chooseSomeCards(p, list.map((z) => z.card), 1, { prompt: '【殆谋】：弃置你区域内的一张蓄谋牌' }))[0];
      if (!c) return;
      p.judgeZone = p.judgeZone.filter((z) => z.card !== c);
      ctx.game.pushDiscard([c]);
      await ctx.log(`【殆谋】：弃置一张蓄谋牌（${cardLabel(c)}）`);
    },
  }],
});

defineSkill({
  id: 'jh_fangjie', name: '芳洁',
  desc: '准备阶段，若你：没有蓄谋牌，你回复1点体力并摸一张牌；有蓄谋牌，你可以弃置任意张你区域里的蓄谋牌并失去此技能。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const list = xumouCards(p);
      if (!list.length) {
        await ctx.recover(p, 1);
        await ctx.draw(p, 1, { reason: 'fangjie' });
        await ctx.log('【芳洁】：无蓄谋牌，回复1点体力并摸一张牌');
        return;
      }
      if (!(await ctx.ask.confirm(p, `【芳洁】：弃置任意张蓄谋牌并失去此技能？（现有 ${list.length} 张）`))) return;
      const picked = await g.chooseSomeCards(p, list.map((z) => z.card), list.length, { prompt: '【芳洁】：选择要弃置的蓄谋牌', optional: true });
      if (!picked.length) return;
      p.judgeZone = (p.judgeZone || []).filter((z) => !picked.includes(z.card));
      g.pushDiscard(picked);
      p.skills = (p.skills || []).filter((s) => s.id !== 'jh_fangjie');
      await ctx.log(`【芳洁】：弃置 ${picked.length} 张蓄谋牌并失去此技能`);
    },
  }],
});

// ============================================================
// 合·张嫙（吴 4）【同礼】【奢葬】
// ============================================================
// 同礼：「效果额外执行一次」= 直接再调一次该牌的 CARD_META.effect（与族诸葛果【纷势】同口径），
// 对【杀】就是再结算一次（目标需再出【闪】），对锦囊就是再结算一次。
defineSkill({
  id: 'jh_tongli', name: '同礼',
  desc: '当你于出牌阶段内使用基本牌或普通锦囊牌指定目标后，若你手牌中的花色数等于你本阶段已使用过的牌数，你可以展示所有手牌，令此牌效果额外执行一次。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => {
      if (d.self !== d.player || d.game.phase !== 'play') return false;
      const m = CARD_META[d.effName || d.card?.name];
      // 官方口径是「基本牌或普通锦囊牌」：延时锦囊不算（重复结算会把同一张牌二次放入判定区）
      return !!m && (m.type === 'basic' || (m.type === 'trick' && !m.delayed));
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const used = p.flags.jhTlCount || 0;
      const suits = new Set(p.hand.map((c) => c.suit).filter(Boolean));
      if (suits.size !== used) return;
      const nm = ctx.data.effName || ctx.data.card?.name;
      const meta = CARD_META[nm];
      if (!meta || typeof meta.effect !== 'function') return;
      const tars = (ctx.data.targets || []).filter((x) => x && x.alive);
      await g.log(`【同礼】：展示手牌（${[...suits].join('/') || '无'}），【${meta.cn}】效果额外执行一次`);
      try {
        await meta.effect(g, { from: p, card: ctx.data.card, targets: tars.slice() });
      } catch (e) {
        await g.log(`【同礼】：额外结算异常（${e.message}）`);
      }
    },
  }, {
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.game.phase === 'play',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.jhTlTurn !== ctx.game.turnCount) { p.flags.jhTlTurn = ctx.game.turnCount; p.flags.jhTlCount = 0; }
      p.flags.jhTlCount = (p.flags.jhTlCount || 0) + 1;
    },
  }],
});

defineSkill({
  id: 'jh_shezang', name: '奢葬',
  desc: '每轮限一次，当你或你回合内有角色进入濒死状态时，你可以亮出牌堆顶的四张牌，然后获得其中任意张花色各不相同的牌。',
  triggers: [{
    on: 'dying.begin', who: 'self', optional: true,
    filter: (d) => d.player.flags.jhSzRound !== d.game.round,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【奢葬】：是否亮出牌堆顶四张并获取花色各不相同的牌？'))) return;
      p.flags.jhSzRound = g.round;
      const top = g.deck.splice(Math.max(0, g.deck.length - 4), Math.min(4, g.deck.length));
      if (!top.length) return;
      await g.log(`【奢葬】：亮出 ${top.map(cardLabel).join('、')}`);
      const bySuit = {};
      for (const c of top) if (!bySuit[c.suit]) bySuit[c.suit] = c;
      const pickable = Object.values(bySuit);
      const take = await g.chooseSomeCards(p, pickable, pickable.length, { prompt: '【奢葬】：获得花色各不相同的牌', optional: true });
      const rest = top.filter((c) => !take.includes(c));
      if (take.length) await ctx.gain(p, take, { reason: 'shezang' });
      if (rest.length) g.deck.push(...rest);
      await ctx.log(`【奢葬】：获得 ${take.length} 张，其余 ${rest.length} 张置于牌堆顶`);
    },
  }],
});

// ============================================================
// 合·卫温&诸葛直（吴 4）【浮海】
// ============================================================
defineSkill({
  id: 'jh_fuhai', name: '浮海',
  desc: '出牌阶段限一次，你可以令所有其他角色同时展示一张手牌（没有则跳过），然后你选择一个方向（顺时针或逆时针），并摸X张牌（X为从你开始，该方向上的角色展示的点数连续严格递增或严格递减的牌数且至少为1）。',
  active: {
    perPhase: true,
    prompt: '浮海：令所有其他角色展示一张手牌，按方向连续严格递增/递减的牌数摸牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const shown = [];
      const order = g.alive().filter((x) => x !== p);
      for (const t of order) {
        if (!t.hand.length) { shown.push({ who: t, num: null }); continue; }
        const c = t.hand[g.rng.int(t.hand.length)];
        shown.push({ who: t, num: c.num, card: c });
        await g.log(`${t.name} 展示 ${cardLabel(c)}`);
      }
      const k = await ctx.ask.choose(p, ['顺时针', '逆时针'], { prompt: '【浮海】：选择方向' });
      const seq = k === 1 ? [...shown].reverse() : shown;
      let dir = 0, run = 0, prev = null;
      for (const s of seq) {
        if (s.num == null) break;
        if (prev == null) { run = 1; prev = s.num; continue; }
        const d0 = Math.sign(s.num - prev);
        if (d0 === 0) break;
        if (dir === 0) { dir = d0; run++; }
        else if (d0 === dir) run++;
        else break;
        prev = s.num;
      }
      const x = Math.max(1, run);
      await ctx.draw(p, x, { reason: 'fuhai' });
      await ctx.log(`【浮海】：连续${dir === 1 ? '递增' : dir === -1 ? '递减' : '（单一）'} ${run} 名，摸 ${x} 张牌`);
    },
  },
});



