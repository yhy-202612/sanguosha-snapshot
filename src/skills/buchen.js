// 阶段 5B「国战·不臣篇」（pack = 'buchen'）技能实现
//   孟达 / 糜芳&傅士仁 / 刘琦 / 张鲁 / 士燮 / 唐咨 / 严白虎
//   （董昭、徐庶在其它包中已存在同 id 同名的武将，本批次按去重要求跳过，见交付报告）
//
// 资料来源：三国杀官方「国战·不臣篇·上」(2021 手杀版) 技能原文，
//   参考萌娘百科 / 三国杀 Wiki / 手杀爆料帖。技能以「简略描述」为准，
//   规则集描述中无法在本引擎建模的部分用括号写明实际实现口径（见各技能 desc）。
// 未核实项（文件内已逐条标注）：
//   1) 唐咨【兴棹】第 3 段「你于回合内手牌上限+4」的「于回合内」口径（本实现按「你自己的回合」）；
//   2) 严白虎【寄篱】③「移除此武将牌」在引擎中无「移除武将牌」概念，
//      改为「失去【雉盗】【寄篱】且体力上限-1」（desc 已写明）；
//   3) 孟达【求安】「置于武将牌上」用 player.flags.hanCards 模拟（武将牌上区域无独立数据结构）。
//
// 引擎红线备忘：game.damage() 对象参数；judge() 返回 data；ask.choose 返回下标；rng 是对象；
//   trigger.filter(d) 中 d.player = 技能拥有者，d.self = 事件主体。
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';

// ---------------- 公用小工具 ----------------
let vseq = 0;
const VC = (name, suit = 'spade', num = 7, extra = {}) => ({
  id: `vbc_${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const isRed = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const nameLen = (c) => (CARD_META[c?.name]?.cn || '').length || 1;
const pullFrom = (arr, card) => {
  if (!Array.isArray(arr)) return false;
  const i = arr.indexOf(card);
  if (i >= 0) { arr.splice(i, 1); return true; }
  return false;
};
const zoneCardsOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card)),
];
const equipCount = (p) => Object.values(p?.equips || {}).filter(Boolean).length;
const KINGDOM_CN = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', shen: '神', jin: '晋' };
const kingdomCN = (k) => KINGDOM_CN[k] || '未确定';
const kingdomN = (g) => new Set(g.alive().map(p => p.kingdom)).size;
const woundedKingdomN = (g) => new Set(g.alive().filter(p => p.hp < p.maxHp).map(p => p.kingdom)).size;
// 伤害类锦囊（不臣篇口径：【杀】或伤害类锦囊牌）
const DAMAGE_TRICK = new Set(['juedou', 'wanjian', 'nanman', 'huogong', 'wugu_sha']);

// ======================================================================
// 孟达 · 求安
// 当你受到伤害时，若你的武将牌上没有「函」，你可以将造成此伤害的牌置于你的武将牌上，
// 称为「函」，然后防止此伤害。
// ======================================================================
defineSkill({
  id: 'bc_qiuan', name: '求安',
  // 失去技能/死亡时把「函」区的牌退回弃牌堆（SG028 私有容器回收）
  reclaimCards(p) { const a = p.flags.hanCards || []; p.flags.hanCards = []; return a; },
  desc: '当你受到伤害时，若你的武将牌上没有「函」，你可以将造成此伤害的牌置于你的武将牌上，称为「函」，然后防止此伤害。',
  triggers: [
    {
      on: 'damage.before', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player;
        if (!p || d.self !== p || !d.card) return false;
        return (p.flags.hanCards || []).length === 0;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, c = ctx.data.card;
        if (!Array.isArray(p.flags.hanCards)) p.flags.hanCards = [];
        // 造成伤害的牌此刻还在「处理区」：先把它从处理区/手牌/装备区摘出，再置于武将牌上
        pullFrom(g.table, c);
        for (const q of g.players) {
          pullFrom(q.hand, c);
          // ★走引擎出口派发 equip.lose（SG033 P0-2）：静默置空会让 16 个监听装备变化的技能不刷新
          await g.unequipCard(q, c, { reason: 'qiuan' });
        }
        p.flags.hanCards.push(c);
        ctx.data.canceled = true;   // 防止此伤害
        await ctx.log(`【求安】：${p.name} 将 ${cardLabel(c)} 置于武将牌上（「函」），并防止此伤害`);
      },
    },
    {
      // 使用结算结束时，把已被引擎放进弃牌堆的那张牌挪回来（武将牌上的牌不应在弃牌堆里）
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!(d.card && (d.player.flags.hanCards || []).includes(d.card)),
      async effect(ctx) {
        const g = ctx.game, c = ctx.data.card;
        pullFrom(g.discardPile, c);
      },
    },
  ],
});

// ======================================================================
// 孟达 · 量反
// 准备阶段，若你的武将牌上有「函」，你获得所有「函」，然后失去1点体力。
// 当你因使用本回合得到的「函」而造成伤害后，你可以获得受到此伤害角色的一张牌。
// ======================================================================
defineSkill({
  id: 'bc_liangfan', name: '量反',
  desc: '准备阶段，若你的武将牌上有「函」，你获得所有「函」，然后失去1点体力。当你因使用本回合得到的「函」对一名角色造成伤害后，你可以获得其一张牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'prepare' && (d.player.flags.hanCards || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cards = (p.flags.hanCards || []).slice();
        p.flags.hanCards = [];
        for (const c of cards) pullFrom(g.discardPile, c);   // 若同时被放进弃牌堆，一并取回
        p.flags.liangfan = { turn: g.turnCount, ids: cards.map(c => c.id) };
        await ctx.gain(p, cards, { reason: 'liangfan' });
        await ctx.log(`【量反】：${p.name} 获得 ${cards.length} 张「函」，然后失去1点体力`);
        await ctx.loseHp(p, 1, { reason: 'liangfan' });
      },
    },
    {
      on: 'damage.after', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player, r = p.flags.liangfan;
        if (!r || d.from !== p || !d.card) return false;
        if (r.turn !== d.game.turnCount) return false;
        return r.ids.includes(d.card.id) && d.to && d.to !== p;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.to, r = p.flags.liangfan;
        r.ids = r.ids.filter(id => id !== ctx.data.card.id);
        const c = await g.chooseCardFrom(p, t, { reason: 'liangfan', includeJudge: false });
        if (!c) return;
        await ctx.gain(p, [c], { from: t, reason: 'liangfan' });
        await ctx.log(`【量反】：${p.name} 使用「函」造成伤害，获得 ${t.name} 的一张牌`);
      },
    },
  ],
});

// ======================================================================
// 糜芳&傅士仁 · 锋势
// 当你使用牌指定唯一目标后，若你与目标角色均有牌且其手牌数小于你，
// 你可以弃置你与其各一张牌，然后此牌伤害+1；
// 当你成为其他角色使用牌的唯一目标后，若你与目标角色均有牌且你的手牌数小于其，
// 其可以令你弃置你与其各一张牌，然后此牌伤害+1。
// ======================================================================
defineSkill({
  id: 'bc_fengshi', name: '锋势',
  desc: '当你使用牌指定唯一目标后，若你与目标角色均有牌且其手牌数小于你，你可以弃置你与其各一张牌，然后此牌伤害+1；当你成为其他角色使用牌的唯一目标后，若你与目标角色均有牌且你的手牌数小于其，其可以令你弃置你与其各一张牌，然后此牌伤害+1。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, u = d.self, c = d.card;
        if (!p || !u || !c) return false;
        if (!Array.isArray(d.targets) || d.targets.length !== 1) return false;   // 唯一目标
        const t = d.targets[0];
        if (!t) return false;
        const pCards = zoneCardsOf(p).length, tCards = zoneCardsOf(t).length;
        if (!pCards || !tCards) return false;                                   // 双方均有牌
        if (u === p) return t !== p && t.hand.length < p.hand.length;            // ① 你使用牌
        if (t === p) return u !== p && p.hand.length < u.hand.length;            // ② 你成为目标
        return false;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, c = ctx.data.card;
        const u = ctx.data.self, t = ctx.data.targets[0];
        const selfUse = (u === p);
        let chooser = p;
        if (!selfUse) {
          // ② 由使用者决定是否发动
          const ok = await ctx.ask.confirm(u, `【锋势】：是否令 ${p.name} 弃置你与其各一张牌，令此牌伤害+1？`);
          if (!ok) return;
          chooser = p;
        }
        const other = selfUse ? t : u;
        const ownPool = zoneCardsOf(p);
        const otherPool = zoneCardsOf(other);
        if (!ownPool.length || !otherPool.length) return;
        const mine = (await g.chooseSomeCards(chooser, ownPool, 1, { prompt: '【锋势】：弃置你自己的一张牌' }))[0];
        if (mine) await ctx.discard(p, [mine], { reason: 'fengshi' });
        const theirs = (await g.chooseSomeCards(chooser, otherPool, 1, { prompt: `【锋势】：弃置 ${other.name} 的一张牌` }))[0];
        if (theirs) await ctx.discard(other, [theirs], { reason: 'fengshi' });
        c.__fengshi = true;
        await ctx.log(`【锋势】：弃置双方各一张牌，${cardLabel(c)} 的伤害+1`);
      },
    },
    {
      // 伤害时把「+1」落到实处（同一张牌只加一次）
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => !!(d.card && d.card.__fengshi) && (d.from === d.player || d.to === d.player),
      async effect(ctx) {
        const c = ctx.data.card;
        delete c.__fengshi;
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log(`【锋势】：${cardLabel(c)} 造成的伤害+1`);
      },
    },
  ],
});

// ======================================================================
// 刘琦 · 问计
// 出牌阶段开始时，你可以令一名其他角色交给你一张牌。
// 若该角色与你势力相同或未确定势力，你本回合内使用此牌无距离和次数限制且不能被响应；
// 若其与你势力不同，你交给其一张除其交给你的牌之外的牌。
// ======================================================================
defineSkill({
  id: 'bc_wenji', name: '问计',
  desc: '出牌阶段开始时，你可以令一名其他角色交给你一张牌。若该角色与你势力相同或未确定势力，你本回合内使用此牌无距离和次数限制且不能被响应；若其与你势力不同，你交给其一张除其交给你的牌之外的牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.game.alive().length > 1,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const t = (await ctx.ask.targets(p, {
          prompt: '【问计】：令一名其他角色交给你一张牌', candidates: g.alive().filter(x => x !== p), min: 1, max: 1,
        }))[0];
        if (!t) return;
        let got = null;
        if (t.hand.length) {
          got = (await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: `【问计】：选择交给 ${p.name} 的一张牌` }))[0] || null;
        }
        if (got) {
          await ctx.gain(p, [got], { from: t, reason: 'wenji' });
          await ctx.log(`【问计】：${t.name} 交给 ${p.name} 一张牌`);
        } else {
          await ctx.log(`【问计】：${t.name} 没有手牌可交出`);
        }
        const sameKingdom = !t.kingdom || t.kingdom === p.kingdom;
        if (sameKingdom) {
          if (!got) return;
          p.flags.wenji = { cardId: got.id, turn: g.turnCount };
          await ctx.log(`【问计】：与你势力相同，本回合使用 ${cardLabel(got)} 无距离与次数限制且不能被响应`);
          return;
        }
        const pool = p.hand.filter(c => c !== got);
        if (!pool.length) { await ctx.log('【问计】：你没有可交出的其他牌'); return; }
        const give = (await g.chooseSomeCards(p, pool, 1, { prompt: `【问计】：交给 ${t.name} 一张牌` }))[0];
        if (give) {
          await ctx.gain(t, [give], { from: p, reason: 'wenji' });
          await ctx.log(`【问计】：势力不同，${p.name} 交给 ${t.name} 一张牌`);
        }
      },
    },
    {
      // 本回合使用该牌：不能被响应 + 不计入【杀】的次数限制
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => {
        const r = d.player.flags.wenji;
        return !!r && r.turn === d.game.turnCount && !!d.card && d.card.id === r.cardId;
      },
      async effect(ctx) {
        const p = ctx.self;
        ctx.data.unavoidable = true;
        if ((ctx.data.effName || ctx.data.card.name) === 'sha') {
          p.flags.shaUsed = Math.max(0, (p.flags.shaUsed || 0) - 1);   // 抵消引擎随后的 +1
        }
        await ctx.log(`【问计】：${cardLabel(ctx.data.card)} 无距离与次数限制且不能被响应`);
        p.flags.wenji = null;
      },
    },
    {
      // 无距离限制（同步钩子，不能 await）
      on: 'distance.calc', who: 'self', optional: false,
      filter: (d) => {
        const r = d.player.flags.wenji;
        return !!r && d.self === d.player && r.turn === d.game.turnCount;
      },
      effect(ctx) { ctx.data.value = 1; },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => !!d.player.flags.wenji,
      async effect(ctx) { ctx.self.flags.wenji = null; },
    },
  ],
});

// ======================================================================
// 刘琦 · 屯江
// 结束阶段开始时，若你于本回合出牌阶段内使用过至少一张牌且没有指定过其他角色为目标，
// 则你可以摸X张牌（X为全场势力数）。
// ======================================================================
defineSkill({
  id: 'bc_tunjiang', name: '屯江',
  desc: '结束阶段开始时，若你于本回合的出牌阶段内使用过至少一张牌且没有指定过其他角色为目标，则你可以摸X张牌（X为全场势力数）。',
  triggers: [
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.game.turnPlayer === d.player && d.game.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.flags.tjTurn !== g.turnCount) { p.flags.tjTurn = g.turnCount; p.flags.tjUsed = 0; p.flags.tjOther = false; }
        p.flags.tjUsed = (p.flags.tjUsed || 0) + 1;
        const tgs = ctx.data.targets || [];
        if (tgs.some(t => t && t !== p)) p.flags.tjOther = true;
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player;
        return d.phase === 'end' && p.flags.tjTurn === d.game.turnCount
          && (p.flags.tjUsed || 0) > 0 && !p.flags.tjOther;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = kingdomN(g);
        p.flags.tjTurn = null;
        await ctx.log(`【屯江】：${p.name} 本回合未指定其他角色为目标，摸 ${x} 张牌（全场 ${x} 个势力）`);
        await ctx.draw(p, x, { reason: 'tunjiang' });
      },
    },
  ],
});

// ======================================================================
// 张鲁 · 布施（锁定技）
// 当你受到伤害后，你令与你势力相同的角色各摸一张牌；
// 当你对其他角色造成伤害后，你令与其势力相同的角色各摸一张牌。
// ======================================================================
defineSkill({
  id: 'bc_bushi', name: '布施',
  desc: '锁定技，当你受到伤害后，你令与你势力相同的角色各摸一张牌；当你对其他角色造成伤害后，你令与其势力相同的角色各摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => {
      const p = d.player;
      if (!p || !d.to) return false;
      return d.to === p || d.from === p;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const k = d.to === p ? p.kingdom : d.to.kingdom;   // 受伤角色的势力
      const who = g.alive().filter(x => x.kingdom === k);
      if (!who.length) return;
      await ctx.log(`【布施】：与${kingdomCN(k)}势力角色 ${who.map(x => x.name).join('、')} 各摸一张牌`);
      for (const x of who) await ctx.draw(x, 1, { reason: 'bushi' });
    },
  }],
});

// ======================================================================
// 张鲁 · 米道
// 与你势力相同的角色的出牌阶段限一次，当其使用非虚拟的【杀】或伤害类锦囊牌指定第一个目标时，
// 其可以交给你一张手牌，令你声明一种花色和一种属性，
// 然后其此次使用牌的花色与造成伤害的属性均视为与你声明的相同。
// ======================================================================
const SUIT_LIST = ['spade', 'heart', 'club', 'diamond'];
const NATURE_LIST = ['normal', 'fire', 'thunder'];
defineSkill({
  id: 'bc_midao', name: '米道',
  desc: '与你势力相同的角色的出牌阶段限一次，当其使用非虚拟的【杀】或伤害类锦囊牌指定第一个目标时，其可以交给你一张手牌，令你声明一种花色和一种属性，然后其此次使用牌的花色与造成伤害的属性均视为与你声明的相同。',
  triggers: [
    {
      on: 'target.before', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, u = d.self, c = d.card;
        if (!p || !u || !c || u === p) return false;                 // 「若为你则跳过此步骤」
        if (u.kingdom !== p.kingdom) return false;
        if (c.virtual && !c.__src) return false;                      // 非虚拟牌
        if ((d.used || []).length) return false;                      // 指定第一个目标时
        const meta = CARD_META[c.name];
        if (!meta) return false;
        const isSha = c.name === 'sha';
        const isDmgTrick = meta.type === 'trick' && !meta.delayed && DAMAGE_TRICK.has(c.name);
        if (!isSha && !isDmgTrick) return false;
        return u.flags.midaoTurn !== d.game.turnCount && u.hand.length > 0;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, u = ctx.data.self, c = ctx.data.card;
        const ok = await ctx.ask.confirm(u, `【米道】：是否交给 ${p.name} 一张手牌，令其重新声明此牌的花色与伤害属性？`);
        if (!ok) return;
        u.flags.midaoTurn = g.turnCount;
        const give = (await g.chooseSomeCards(u, u.hand.slice(), 1, { prompt: `【米道】：交给 ${p.name} 一张手牌` }))[0];
        if (give) await ctx.gain(p, [give], { from: u, reason: 'midao' });
        const si = await ctx.ask.choose(p, SUIT_LIST.map(s => SUIT_CN[s]), { prompt: '【米道】：声明一种花色', reason: 'midao' });
        const ni = await ctx.ask.choose(p, ['普通伤害', '火焰伤害', '雷电伤害'], { prompt: '【米道】：声明一种伤害属性', reason: 'midao' });
        const suit = SUIT_LIST[Math.max(0, si)] || 'spade';
        const nature = NATURE_LIST[Math.max(0, ni)] || 'normal';
        if (c.__origSuit === undefined) c.__origSuit = c.suit;
        c.suit = suit;
        c.__midaoNature = nature;
        await ctx.log(`【米道】：声明 ${SUIT_CN[suit]} 花色、${nature === 'fire' ? '火焰' : nature === 'thunder' ? '雷电' : '普通'}属性，${cardLabel(c)} 据此结算`);
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => !!(d.card && d.card.__midaoNature),
      effect(ctx) {
        // 同步即可完成（无询问）
        ctx.data.nature = ctx.data.card.__midaoNature;
      },
    },
    {
      // 结算结束后恢复牌面（「视为」不应永久改牌）
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!(d.card && d.card.__origSuit !== undefined),
      async effect(ctx) {
        const c = ctx.data.card;
        c.suit = c.__origSuit;
        delete c.__origSuit;
        delete c.__midaoNature;
      },
    },
  ],
});

// ======================================================================
// 士燮 · 避乱（锁定技）
// 其他角色与你的距离+X（X为你装备区里的牌数且至少为1）。
// ======================================================================
defineSkill({
  id: 'bc_biluan', name: '避乱',
  desc: '锁定技，其他角色与你的距离+X（X为你装备区里的牌数且至少为1）。',
  triggers: [{
    on: 'distance.calc', who: 'any', optional: false,
    filter: (d) => !!d.player && d.to === d.player && d.self !== d.player,
    effect(ctx) {
      const x = Math.max(1, equipCount(ctx.self));
      ctx.data.value += x;
    },
  }],
});

// ======================================================================
// 士燮 · 礼下
// 一名角色的准备阶段，若其与你势力不同，其可以弃置你装备区里的一张牌并选择一项：
// 1.弃置两张手牌；2.失去1点体力；3.令你摸两张牌。
// ======================================================================
defineSkill({
  id: 'bc_lixia', name: '礼下',
  desc: '一名角色的准备阶段，若其与你势力不同，其可以弃置你装备区里的一张牌并选择一项：1.弃置两张手牌；2.失去1点体力；3.令你摸两张牌。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: false,
    filter: (d) => {
      const p = d.player, q = d.self;
      if (!p || !q || q === p || d.phase !== 'prepare') return false;
      if (!q.kingdom || q.kingdom === p.kingdom) return false;
      return equipCount(p) > 0;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, q = ctx.data.self;
      const ok = await ctx.ask.confirm(q, `【礼下】：是否弃置 ${p.name} 装备区里的一张牌？`);
      if (!ok) return;
      const pool = Object.values(p.equips).filter(Boolean);
      const pick = (await g.chooseSomeCards(q, pool, 1, { prompt: `【礼下】：弃置 ${p.name} 装备区里的一张牌` }))[0] || pool[0];
      if (!pick) return;
      await ctx.discard(p, [pick], { reason: 'lixia' });
      await ctx.log(`【礼下】：${q.name} 弃置了 ${p.name} 的 ${cardLabel(pick)}`);
      const idx = await ctx.ask.choose(q, ['弃置两张手牌', '失去1点体力', `令 ${p.name} 摸两张牌`], { prompt: '【礼下】：请选择一项', reason: 'lixia' });
      if (idx === 1) {
        await ctx.loseHp(q, 1, { reason: 'lixia' });
        await ctx.log(`【礼下】：${q.name} 失去1点体力`);
      } else if (idx === 2) {
        await ctx.draw(p, 2, { reason: 'lixia' });
        await ctx.log(`【礼下】：${p.name} 摸两张牌`);
      } else {
        const cards = await g.chooseSomeCards(q, q.hand.slice(), 2, { prompt: '【礼下】：弃置两张手牌' });
        if (cards.length) await ctx.discard(q, cards, { reason: 'lixia' });
        await ctx.log(`【礼下】：${q.name} 弃置 ${cards.length} 张手牌`);
      }
    },
  }],
});

// ======================================================================
// 唐咨 · 恂恂（由【兴棹】动态赋予的技能，本体单独注册）
// 摸牌阶段开始时，你可以观看牌堆顶的四张牌，然后将其中的两张牌置于牌堆顶，
// 将其余的牌置于牌堆底。
// ======================================================================
defineSkill({
  id: 'bc_xunxun', name: '恂恂',
  desc: '摸牌阶段开始时，你可以观看牌堆顶的四张牌，然后将其中的两张牌置于牌堆顶，将其余的牌置于牌堆底。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw' && d.game.deck.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const n = Math.min(4, g.deck.length);
      const view = g.deck.slice(-n).reverse();      // 牌堆顶在数组末尾
      await ctx.log(`【恂恂】：观看牌堆顶 ${n} 张（${view.map(cardLabel).join('、')}）`);
      const top = n <= 2
        ? view.slice()
        : await g.chooseSomeCards(p, view.slice(), 2, { prompt: '【恂恂】：选择置于牌堆顶的两张牌' });
      const rest = view.filter(c => !top.includes(c));
      for (const c of view) pullFrom(g.deck, c);
      g.deck.push(...top);            // 置于牌堆顶
      g.deck.unshift(...rest);        // 其余置于牌堆底
      await ctx.log(`【恂恂】：${top.map(cardLabel).join('、')} 置于牌堆顶，其余置于牌堆底`);
    },
  }],
});

// ======================================================================
// 唐咨 · 兴棹（锁定技）
// 锁定技，你根据场上有受伤角色的势力数获得以下效果：
// 1个或以上，你拥有【恂恂】；2个或以上，当你受到伤害后，你与伤害来源两者中手牌唯一最少的角色摸一张牌；
// 3个或以上，你于回合内手牌上限+4；4个或以上，当你失去装备区里的牌时，你摸一张牌。
// ======================================================================
const xzLevel = (g, p) => woundedKingdomN(g);
const xzRefresh = (p, g) => {
  const n = xzLevel(g, p);
  p.flags.xzLevel = n;
  p.flags.handLimit = n >= 3 ? 4 : 0;
  const has = (effSkills(p) || []).some(s => s.id === 'bc_xunxun');
  if (n >= 1 && !has) {
    const sk = getSkill('bc_xunxun');
    if (sk) p.skills.push(sk);
  } else if (n < 1 && has) {
    p.skills = p.skills.filter(s => s.id !== 'bc_xunxun');
  }
  return n;
};
defineSkill({
  id: 'bc_xingzhao', name: '兴棹',
  desc: '锁定技，你根据场上有受伤角色的势力数获得以下效果：1个或以上，你拥有【恂恂】；2个或以上，当你受到伤害后，你与伤害来源两者中手牌唯一最少的角色摸一张牌；3个或以上，你于回合内手牌上限+4；4个或以上，当你失去装备区里的牌时，你摸一张牌。',
  triggers: [
    {
      // 等级刷新（优先级高于其它钩子，保证【恂恂】在摸牌阶段前就位）
      on: 'turn.begin', who: 'self', optional: false, priority: 9,
      filter: () => true,
      async effect(ctx) {
        const n = xzRefresh(ctx.self, ctx.game);
        await ctx.log(`【兴棹】：当前有受伤角色的势力数 ${n}`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false, priority: 9,
      filter: (d) => d.phase === 'draw' || d.phase === 'discard',
      async effect(ctx) { xzRefresh(ctx.self, ctx.game); },
    },
    {
      on: 'damage.after', who: 'self', optional: false, priority: 9,
      filter: () => true,
      async effect(ctx) { xzRefresh(ctx.self, ctx.game); },
    },
    {
      // 2个或以上：受到伤害后，你与伤害来源中手牌唯一最少者摸一张牌
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player, f = d.from;
        if (!p || d.to !== p) return false;
        if (xzLevel(d.game, p) < 2) return false;
        if (!f || f === p || !f.alive) return false;
        return p.hand.length !== f.hand.length;   // 唯一最少（并列则不触发）
      },
      async effect(ctx) {
        const p = ctx.self, f = ctx.data.from;
        const t = p.hand.length < f.hand.length ? p : f;
        await ctx.log(`【兴棹】：${p.name} 与 ${f.name} 中手牌唯一最少的 ${t.name} 摸一张牌`);
        await ctx.draw(t, 1, { reason: 'xingzhao' });
      },
    },
    {
      // 4个或以上：失去装备区里的牌时摸一张牌
      on: 'equip.lose', who: 'self', optional: false,
      filter: (d) => xzLevel(d.game, d.player) >= 4,
      async effect(ctx) {
        await ctx.log(`【兴棹】：失去装备区里的牌，摸一张牌`);
        await ctx.draw(ctx.self, 1, { reason: 'xingzhao' });
      },
    },
  ],
});

// ======================================================================
// 严白虎 · 雉盗（锁定技）
// 锁定技，出牌阶段开始时，你选择一名其他角色，直到回合结束，你与其距离视为1
// 且你不能使用牌指定除你与其外的角色为目标，然后当你于出牌阶段内第一次对其造成伤害后，
// 你获得其区域里的一张牌。
// ======================================================================
defineSkill({
  id: 'bc_zhidao', name: '雉盗',
  desc: '锁定技，出牌阶段开始时，你选择一名其他角色，直到回合结束，你与其距离视为1且你不能使用牌指定除你与其外的角色为目标，然后当你于出牌阶段内第一次对其造成伤害后，你获得其区域里的一张牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && d.game.alive().length > 1,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter(x => x !== p);
        if (!cands.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【雉盗】：选择一名其他角色（本回合只能以其为目标）', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) { await ctx.log('【雉盗】：没有选择目标'); return; }
        p.flags.zhidao = { seat: t.seat, got: false, turn: g.turnCount };
        await ctx.log(`【雉盗】：${p.name} 与 ${t.name} 的距离视为1，且只能以其为目标`);
      },
    },
    {
      // 距离视为1（同步钩子）
      on: 'distance.calc', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, z = p.flags.zhidao;
        if (!z) return false;
        const other = d.self === p ? d.to : (d.to === p ? d.self : null);
        return !!other && other.seat === z.seat;
      },
      effect(ctx) { ctx.data.value = 1; },
    },
    {
      // 不能指定除你与其外的角色为目标
      on: 'target.before', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player, z = p.flags.zhidao, t = d.target;
        if (!z || !t || !d.card || d.self !== p) return false;
        if (t === p) return false;
        return t.seat !== z.seat;
      },
      async effect(ctx) {
        ctx.data.canceled = true;
        await ctx.log(`【雉盗】：本回合不能指定 ${ctx.data.target.name} 为目标`);
      },
    },
    {
      // 第一次对其造成伤害后，获得其区域里的一张牌
      // 注意：damage.after 的 data.self 是「受伤者」，故此处必须 who:'any' + filter 判 d.from
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, z = p.flags.zhidao;
        if (!z || z.got || d.from !== p || !d.to) return false;
        return d.to.seat === z.seat;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.to, z = p.flags.zhidao;
        if (!zoneCardsOf(t).length) { await ctx.log(`【雉盗】：${t.name} 区域内没有牌`); return; }
        z.got = true;
        const c = await g.chooseCardFrom(p, t, { reason: 'zhidao' });
        if (!c) return;
        await ctx.gain(p, [c], { from: t, reason: 'zhidao' });
        await ctx.log(`【雉盗】：${p.name} 获得 ${t.name} 区域里的 ${cardLabel(c)}`);
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => !!d.player.flags.zhidao,
      async effect(ctx) { ctx.self.flags.zhidao = null; },
    },
  ],
});

// ======================================================================
// 严白虎 · 寄篱
// ② 当你成为红色基本牌或红色普通锦囊牌的唯一目标后，在此牌结算结束后，
//    此牌的使用者视为对你再使用一张相同牌名的牌（本实现：结算两次）。
// ③ 当你于任意一个阶段内受到第二次伤害时，你防止此伤害，然后移除此武将牌。
//    （引擎无「移除武将牌」概念，改为：失去【雉盗】【寄篱】且体力上限-1 —— desc 已写明）
// 注：官方另有一句「副将技，你计算体力上限时减少1个单独的阴阳鱼」，本引擎无双将副将位，
//    且 2025 修订已取消该血量限制，故不建模。
// ======================================================================
defineSkill({
  id: 'bc_jili', name: '寄篱',
  desc: '当你成为红色基本牌或红色普通锦囊牌的唯一目标后，此牌结算结束后，此牌的使用者视为对你再使用一张相同牌名的牌。当你于任意一个阶段内受到第二次伤害时，你防止此伤害，然后你失去【雉盗】与【寄篱】并减1点体力上限（原效果为「移除此武将牌」）。',
  triggers: [
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, u = d.self, c = d.card;
        if (!p || !u || !c || u === p) return false;
        if (c.__jili || c.jili) return false;                      // 递归保护
        const tgs = d.targets || [];
        if (tgs.length !== 1 || tgs[0] !== p) return false;         // 唯一目标且为严白虎
        if (!isRed(c)) return false;
        const meta = CARD_META[d.effName || c.name];
        if (!meta) return false;
        const okType = meta.type === 'basic' || (meta.type === 'trick' && !meta.delayed);
        return okType && !!meta.cn;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, u = ctx.data.self, c = ctx.data.card;
        const nm = ctx.data.effName || c.name;
        const v = VC(nm, c.suit, c.num, { __jili: true, jili: true });
        await ctx.log(`【寄篱】：${u.name} 视为对 ${p.name} 再使用一张【${CARD_META[nm].cn}】`);
        await ctx.useCard({ from: u, card: v, targets: [p], reason: 'jili', ignoreRange: true, ignoreShaLimit: true });
        pullFrom(g.discardPile, v);   // 视为使用的虚拟牌不留在弃牌堆
      },
    },
    {
      // ③ 的伤害计数：本阶段已受到的伤害次数（实际阻止在 damage.before）
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => !!d.player && d.to === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const key = `${g.turnCount}_${g.phase}`;
        const rec = (p.flags.jlDmg && p.flags.jlDmg.key === key) ? p.flags.jlDmg : { key, n: 0 };
        rec.n += 1;
        p.flags.jlDmg = rec;
      },
    },
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player;
        if (!p || d.to !== p) return false;
        const key = `${d.game.turnCount}_${d.game.phase}`;
        const rec = p.flags.jlDmg;
        return !!rec && rec.key === key && rec.n >= 1;     // 本阶段的第二次伤害
      },
      async effect(ctx) {
        const p = ctx.self;
        ctx.data.canceled = true;
        p.maxHp = Math.max(1, p.maxHp - 1);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
        p.skills = (p.skills || []).filter(s => s.id !== 'bc_zhidao' && s.id !== 'bc_jili');
        p.flags.jlDmg = { key: null, n: 0 };
        await ctx.log(`【寄篱】：${p.name} 于本阶段受到第二次伤害，防止此伤害；失去【雉盗】【寄篱】，体力上限-1（${p.hp}/${p.maxHp}）`);
      },
    },
  ],
});
