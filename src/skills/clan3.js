// 门阀士族（clan3）批次技能：族荀攸 / 族荀采 / 族荀莳 / 族荀爽 / 族荀彧 / 族王广 / 族王明山
//   族王允 / 族吴苋 / 族吴班 / 族诸葛果 / 族陆绩 / 族杨赐
//
// 宗族技（复用既有实现，本文件不再重复定义）：
//   中流 zhongliu（src/skills/clan.js） · 蹈节 daojie（clan.js）
//   定安 dingan / 抚宁 funing（clan.js，族荀彧技能组）
//   穆荫 muyin / 泽烈 zelie / 去惑 quhuo（src/skills/clan2.js）
// 本批新增宗族技：纷势 cl3_fenshi（琅琊诸葛氏）
//
// 依赖机制：player.clan + g.sameClan()、player.flags.handLimit（手牌上限）、
//           g.rng、g.takeCard()、g.popDeck()、VIRTUAL 牌（本文件统一用 VC() 造虚拟牌 + extraCards 支付真牌，
//           避免走 VIRTUAL_RULES 白名单校验）
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';

// ---------------- 公用小工具 ----------------
let vseq = 0;
const VC = (name, suit = 'spade', num = 7, extra = {}) => ({
  id: `vc3_${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const TYPE_CN = { basic: '基本牌', trick: '锦囊牌', equip: '装备牌' };
// 可作为「普通锦囊」转化的牌名（排除延时锦囊与只能响应的【无懈可击】）
const NORMAL_TRICKS = ['wuzhong', 'guohe', 'shunshou', 'juedou', 'jiedao', 'wanjian', 'nanman', 'taoyuan', 'wugu', 'huogong', 'tiesuo', 'binglin', 'qizheng'];
const BASIC_NAMES = ['sha', 'shan', 'tao', 'jiu'];
const roundIdx = (g) => Math.floor(((g?.turnCount || 1) - 1) / Math.max(1, (g?.players || []).length));
const handLimitOf = (p) => p.hp + (p.flags?.handLimit || 0);
const isRed = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const allCardsOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card)),
];
const takeFromDiscard = (g, c) => {
  const i = g.discardPile.indexOf(c);
  if (i >= 0) g.discardPile.splice(i, 1);
  return c;
};
const detachEquip = async (g, p, c) => {
  const slot = Object.keys(p.equips || {}).find(k => p.equips[k] === c);
  if (slot) { p.equips[slot] = null; await g.trigger('equip.lose', { self: p, card: c, slot }); }
  return !!slot;
};
// 「摸至 / 弃置至 n 张」：摸牌部分
const drawTo = async (ctx, p, n, reason) => {
  const need = n - p.hand.length;
  if (need > 0) await ctx.draw(p, need, { reason });
  return Math.max(0, need);
};
// 本回合记录（turn 号 + 数据），每次读取前自动按回合重置
const turnRec = (p, key, g, init) => {
  if (!p.flags[key] || p.flags[key].turn !== g.turnCount) p.flags[key] = { turn: g.turnCount, ...init };
  return p.flags[key];
};
// 本「出牌阶段」记录（playPhaseSeq + 数据），每次读取前自动按出牌阶段重置。
// 与 turnRec 的区别：额外出牌阶段（【当先】【整兵】【观微】【贵相】）会重新计数（SG025 #11）
const phaseRec = (p, key, g, init) => {
  if (!p.flags[key] || p.flags[key].phase !== g.playPhaseSeq) p.flags[key] = { phase: g.playPhaseSeq, ...init };
  return p.flags[key];
};
// 目标选择：返回 [] = 「自动/无目标」，null = 玩家放弃
const targetsFor = async (ctx, p, nm, prompt, opt = {}) => {
  const g = ctx.game;
  const meta = CARD_META[nm];
  const rule = meta?.target;
  if (!rule || typeof rule === 'function') return [];
  if (rule.self && !rule.others && !rule.all) return [p];
  if (rule.all) return [];
  const cands = g.candidatesFor(p, { name: nm, type: meta.type }, nm);
  if (!cands.length) return null;
  const mn = opt.min ?? (rule.min ?? 1);
  const mx = Math.max(mn, Math.min(opt.max ?? (rule.max ?? 1), cands.length));
  const tg = await ctx.ask.targets(p, { prompt, candidates: cands, min: mn, max: mx });
  if (!tg.length) return null;
  return tg;
};
// 视为使用一张虚拟牌（真牌通过 extraCards 支付并进入弃牌堆）
const useVirtual = async (ctx, p, nm, { suit = 'spade', num = 7, reason = 'cl3', prompt = null, extraCards = [], targets = null, ignoreRange = false, ignoreShaLimit = false } = {}) => {
  const cn = CARD_META[nm]?.cn || nm;
  const tg = targets || (await targetsFor(ctx, p, nm, prompt || `请选择【${cn}】的目标`));
  if (tg === null) return false;
  const ok = await ctx.useCard({ from: p, card: VC(nm, suit, num), targets: tg, extraCards, reason, ignoreRange, ignoreShaLimit });
  return ok !== false;
};

// ======================================================================
// 族荀攸 · 百出（锁定技）
// 当你使用一张牌结算结束后，依次执行：
//   ①若此牌的「花色+类别」组合为你首次使用，你记录一个尚未记录的普通锦囊牌名；
//   ②若该组合非你首次使用，你本轮内视为拥有【奇策】；
//   ③若此牌牌名已被【百出】记录过，你摸一张牌或回复1点体力。
// ======================================================================
defineSkill({
  id: 'cl3_baichu', name: '百出',
  desc: '锁定技，当你使用一张牌结算结束后，依次执行：①若此牌的「花色+类别（基本/锦囊/装备）」组合为你首次使用，你记录一个尚未记录的普通锦囊牌名；②若该组合非你首次使用，你本轮内视为拥有【奇策】；③若此牌牌名已被【百出】记录过，你摸一张牌或回复1点体力。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => !!d.card && !!CARD_META[d.effName || d.card.name],
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, c = ctx.data.card;
      const nm = ctx.data.effName || c.name;
      const meta = CARD_META[nm];
      p.flags.bcKeys = p.flags.bcKeys || [];
      p.flags.bcNames = p.flags.bcNames || [];
      const key = `${c.suit || 'none'}_${meta.type}`;
      if (!p.flags.bcKeys.includes(key)) {
        // ① 首次使用该「花色+类别」组合
        p.flags.bcKeys.push(key);
        const left = NORMAL_TRICKS.filter(n => !p.flags.bcNames.includes(n));
        if (left.length) {
          const pick = g.rng.pick(left);
          p.flags.bcNames.push(pick);
          await ctx.log(`【百出】：${SUIT_CN[c.suit] || ''}${TYPE_CN[meta.type]} 组合首次使用，记录普通锦囊【${CARD_META[pick].cn}】`);
        } else {
          await ctx.log(`【百出】：${SUIT_CN[c.suit] || ''}${TYPE_CN[meta.type]} 组合首次使用，普通锦囊牌名已记录完`);
        }
      } else {
        // ② 非首次：本轮视为拥有【奇策】
        if (p.flags.bcQiceRound !== g.round) await ctx.log(`【百出】：${SUIT_CN[c.suit] || ''}${TYPE_CN[meta.type]} 组合非首次使用，本轮视为拥有【奇策】`);
        p.flags.bcQiceRound = g.round;
      }
      // ③ 牌名已被记录
      if (p.flags.bcNames.includes(nm)) {
        const idx = await ctx.ask.choose(p, ['摸一张牌', '回复1点体力'], { prompt: `【百出】：【${meta.cn}】已被记录，选择一项`, reason: 'cl3_baichu' });
        if (idx === 1) { await ctx.recover(p, 1); await ctx.log(`【百出】：【${meta.cn}】已被记录，回复1点体力`); }
        else { await ctx.draw(p, 1, { reason: 'cl3_baichu' }); await ctx.log(`【百出】：【${meta.cn}】已被记录，摸一张牌`); }
      }
    },
  }],
});

// ======================================================================
// 族荀攸 · 奇策（衍生技）
// 出牌阶段限一次，你可以将所有手牌当任意一张普通锦囊牌使用。
// 实现口径：【百出】②让你「本轮内视为拥有【奇策】」，故本技能默认挂在武将牌上，
//   实际发动需 bcQiceRound === 当前轮（未获得时发动会直接失败并写战报）。
// ======================================================================
defineSkill({
  id: 'cl3_qice', name: '奇策',
  desc: '衍生技，出牌阶段限一次，你可以将所有手牌当任意一张普通锦囊牌使用。（需由【百出】②于本轮获得，未获得时不能发动）',
  active: {
    perPhase: true,
    prompt: '奇策：将所有手牌当任意一张普通锦囊牌使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.bcQiceRound !== g.round) { await ctx.log('【奇策】：本轮尚未通过【百出】获得此技能，不能发动'); return; }
      if (!p.hand.length) { await ctx.log('【奇策】：没有手牌'); return; }
      const idx = await ctx.ask.choose(p, NORMAL_TRICKS.map(n => `视为使用【${CARD_META[n].cn}】`), { prompt: '【奇策】：选择要转化的普通锦囊牌', reason: 'cl3_qice' });
      const nm = NORMAL_TRICKS[idx];
      if (!nm) return;
      const cards = p.hand.slice();
      await ctx.log(`【奇策】：将全部 ${cards.length} 张手牌当【${CARD_META[nm].cn}】使用`);
      await useVirtual(ctx, p, nm, { suit: cards[0].suit, num: cards[0].num, extraCards: cards, reason: 'cl3_qice' });
    },
  },
});

// ======================================================================
// 族荀采 · 烈誓（出牌阶段，可重复发动）
// 选择一项：1.废除你的判定区并受到1点火焰伤害；2.弃置你所有【闪】；3.弃置你所有【杀】；
// 然后令一名其他角色从其余两项中选一项执行。
// ======================================================================
const LIESHI_OPTS = (p) => [
  '废除你的判定区并受到 1 点火焰伤害',
  `弃置你所有【闪】（共 ${p.hand.filter(c => c.name === 'shan').length} 张）`,
  `弃置你所有【杀】（共 ${p.hand.filter(c => c.name === 'sha').length} 张）`,
];
const lieshiDo = async (ctx, q, which, source) => {
  const g = ctx.game;
  if (which === 0) {
    // 废除判定区：引擎没有「判定区废除」字段，改为「清空现有判定区 + 打标记」，
    // 由本技能下面的 judge 阶段钩子把之后被置入的延时锦囊直接弃置（等价于判定区不再生效）
    // 判定区先 splice 清空、再统一交给 discardCards：牌已不在任何区域，discardCards 会正常入堆并派发
    // cards.discard / cards.lose。若像旧实现那样直推 discardPile，会绕过事件，
    // 导致【落英】【天任】【笛音】等「牌进入弃牌堆后」的技能全部漏触发（SG025 #18）。
    const zs = (q.judgeZone || []).splice(0);
    const moved = zs.map(z => z.card).filter(Boolean);
    if (moved.length) await g.discardCards(q, moved, { reason: 'cl3_lieshi' });
    q.flags.cl3JudgeDisabled = true;
    await ctx.log(`【烈誓】：${q.name} 废除判定区${zs.length ? `（${zs.length} 张延时锦囊置入弃牌堆）` : ''}`);
    await ctx.damage({ from: source || q, to: q, amount: 1, nature: 'fire', reason: 'cl3_lieshi' });
  } else if (which === 1) {
    const cs = q.hand.filter(c => c.name === 'shan');
    if (cs.length) { await ctx.discard(q, cs, { reason: 'cl3_lieshi' }); }
    await ctx.log(`【烈誓】：${q.name} 弃置所有【闪】（${cs.length} 张）`);
  } else {
    const cs = q.hand.filter(c => c.name === 'sha');
    if (cs.length) { await ctx.discard(q, cs, { reason: 'cl3_lieshi' }); }
    await ctx.log(`【烈誓】：${q.name} 弃置所有【杀】（${cs.length} 张）`);
  }
};
defineSkill({
  id: 'cl3_lieshi', name: '烈誓',
  desc: '出牌阶段，你可以选择一项：1.废除你的判定区并受到1点火焰伤害；2.弃置你所有【闪】；3.弃置你所有【杀】；然后令一名其他角色从其余两项中选一项执行。（可重复发动）',
  active: {
    prompt: '烈誓：自己执行一项，再令一名其他角色执行其余一项',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const others = g.alive().filter(x => x !== p);
      if (!others.length) { await ctx.log('【烈誓】：没有其他角色'); return; }
      const idx = await ctx.ask.choose(p, LIESHI_OPTS(p), { prompt: '【烈誓】：选择你执行的一项', reason: 'cl3_lieshi' });
      if (idx < 0) return;
      await lieshiDo(ctx, p, idx, p);
      const rest = [0, 1, 2].filter(i => i !== idx);
      const t = (await ctx.ask.targets(p, { prompt: '【烈誓】：选择令其执行剩余一项的角色', candidates: others, min: 1, max: 1 }))[0];
      if (!t) return;
      const ti = await ctx.ask.choose(t, rest.map(i => LIESHI_OPTS(t)[i]), { prompt: `【烈誓】：${p.name} 令你选择一项执行`, reason: 'cl3_lieshi' });
      await lieshiDo(ctx, t, rest[ti < 0 ? 0 : ti], p);
    },
  },
  triggers: [{
    // 「判定区被废除」的落地：废除者进入判定阶段时，把置入其判定区的延时锦囊全部弃置（不结算）
    on: 'phase.begin', who: 'any', optional: false,
    filter: (d) => d.phase === 'judge' && !!d.self && d.self.flags.cl3JudgeDisabled
      && (d.self.judgeZone || []).length > 0,
    async effect(ctx) {
      const g = ctx.game, q = ctx.data.self;
      const zs = (q.judgeZone || []).splice(0);
      const names = [];
      for (const z of zs) names.push(cardLabel(z.card));
      // 同上（SG025 #18）：必须先 splice 清空判定区再走 discardCards，
      // 直推 discardPile 会绕过 cards.discard → 【落英】【天任】【笛音】等漏触发
      const moved = zs.map(z => z.card).filter(Boolean);
      if (moved.length) await g.discardCards(q, moved, { reason: 'cl3_lieshi' });
      await ctx.log(`【烈誓】：${q.name} 的判定区已被废除，${names.join('、')} 直接置入弃牌堆`);
    },
  }],
});

// ======================================================================
// 族荀采 · 点盏（锁定技）
// 当你每轮第一次使用一种花色的牌结算结束后，依次执行：
//   1.横置此牌的唯一目标；2.重铸此花色的所有手牌；若两项均执行，你摸一张牌。
// ======================================================================
defineSkill({
  id: 'cl3_dianzhan', name: '点盏',
  desc: '锁定技，当你每轮第一次使用一种花色的牌结算结束后，依次执行：1.横置此牌的唯一目标；2.重铸此花色的所有手牌；若两项均执行，你摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => {
      const p = d.player, c = d.card;
      if (!p || !c || !c.suit || c.suit === 'none') return false;
      const rec = p.flags.dzSuits;
      if (!rec || rec.round !== d.game.round) return true;
      return !rec.suits.includes(c.suit);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, c = ctx.data.card;
      if (!p.flags.dzSuits || p.flags.dzSuits.round !== g.round) p.flags.dzSuits = { round: g.round, suits: [] };
      p.flags.dzSuits.suits.push(c.suit);
      let did = 0;
      // 1. 横置此牌的唯一目标
      const tg = (ctx.data.targets || []).filter(t => t && t.alive);
      if (tg.length === 1) {
        tg[0].chained = true;
        did++;
        await ctx.log(`【点盏】：${SUIT_CN[c.suit]} 首次使用，横置唯一目标 ${tg[0].name}`);
      }
      // 2. 重铸此花色的所有手牌
      const same = p.hand.filter(x => x.suit === c.suit);
      if (same.length) {
        await ctx.discard(p, same, { reason: 'cl3_dianzhan' });
        await ctx.draw(p, same.length, { reason: 'cl3_dianzhan' });
        did++;
        await ctx.log(`【点盏】：重铸 ${same.length} 张${SUIT_CN[c.suit]}手牌`);
      }
      if (did >= 2) { await ctx.draw(p, 1, { reason: 'cl3_dianzhan' }); await ctx.log('【点盏】：两项均执行，摸一张牌'); }
    },
  }],
});

// ======================================================================
// 族荀采 · 还阴（锁定技）
// 当你进入濒死状态时，你将手牌摸至四张。
// ======================================================================
defineSkill({
  id: 'cl3_huanyin', name: '还阴',
  desc: '锁定技，当你进入濒死状态时，你将手牌摸至四张。',
  triggers: [{
    on: 'dying.begin', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      const n = await drawTo(ctx, p, 4, 'cl3_huanyin');
      await ctx.log(`【还阴】：${p.name} 进入濒死，将手牌摸至四张（摸 ${n} 张）`);
    },
  }],
});

// ======================================================================
// 族荀莳 · 清绝（锁定技）
// ①你手牌中每个花色仅一张的牌不计入手牌上限；
// ②当你每回合体力值首次变化后，你弃置手牌中任意张「该花色手牌数量不为一」的牌，
//   并执行等量项：1.将这些牌交给一名其他角色；2.获得手牌中你未拥有花色的牌各一张。
// ======================================================================
// ①的手牌上限补偿：每个「只有一张」的花色 +1 手牌上限（用 flags.handLimit 动态维护，
// 保留 flags.qjBonus 记录自己贡献的部分，避免覆盖穆荫/移荣的加减）。
const qingjueRefresh = (p) => {
  const cnt = {};
  for (const c of p.hand) cnt[c.suit] = (cnt[c.suit] || 0) + 1;
  const bonus = Object.values(cnt).filter(n => n === 1).length;
  const prev = p.flags.qjBonus || 0;
  if (bonus !== prev) {
    p.flags.handLimit = (p.flags.handLimit || 0) + (bonus - prev);
    p.flags.qjBonus = bonus;
  }
  return bonus;
};
const QJ_EVENTS = ['cards.draw.after', 'cards.gain', 'cards.discard', 'hand.change'];
defineSkill({
  id: 'cl3_qingjue', name: '清绝',
  desc: '锁定技，①你手牌中每个花色仅一张的牌不计入手牌上限；②当你每回合体力值首次变化后，你弃置手牌中任意张「该花色手牌数量不为一」的牌，并执行等量项：1.将这些牌交给一名其他角色；2.获得手牌中你未拥有花色的牌各一张。',
  triggers: [
    ...QJ_EVENTS.map(ev => ({
      on: ev, who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { qingjueRefresh(ctx.self); },
    })),
    {
      on: 'hp.lose', who: 'self', optional: false,
      filter: (d) => d.count > 0 && d.player.flags.qj2Turn !== d.game.turnCount,
      async effect(ctx) { await qingjue2(ctx); },
    },
    {
      on: 'hp.recover', who: 'self', optional: false,
      filter: (d) => d.count > 0 && d.player.flags.qj2Turn !== d.game.turnCount,
      async effect(ctx) { await qingjue2(ctx); },
    },
  ],
});
async function qingjue2(ctx) {
  const p = ctx.self, g = ctx.game;
  p.flags.qj2Turn = g.turnCount;
  const cnt = {};
  for (const c of p.hand) cnt[c.suit] = (cnt[c.suit] || 0) + 1;
  const pool = p.hand.filter(c => (cnt[c.suit] || 0) !== 1);
  if (!pool.length) { await ctx.log('【清绝】：体力首次变化，但没有「该花色数量不为一」的手牌可弃置'); return; }
  const picks = await g.chooseSomeCards(p, pool.slice(), pool.length, { prompt: '【清绝】：选择要弃置的牌（可少于可选数，点取消即结束）' });
  if (!picks.length) { await ctx.log('【清绝】：未弃置任何牌'); return; }
  const others = g.alive().filter(q => q !== p);
  for (const c of picks) {
    const missSuits = ['spade', 'heart', 'club', 'diamond'].filter(s => !p.hand.some(x => x.suit === s));
    const opts = [];
    const optGive = others.length > 0;
    const optTake = missSuits.length > 0;
    if (optGive) opts.push(`将 ${cardLabel(c)} 交给一名其他角色`);
    if (optTake) opts.push(`弃置 ${cardLabel(c)}，获得你手牌中未拥有花色的牌各一张（缺 ${missSuits.map(s => SUIT_CN[s]).join('')}）`);
    let which = 0;
    if (opts.length > 1) which = await ctx.ask.choose(p, opts, { prompt: '【清绝】：选择执行的一项', reason: 'cl3_qingjue' });
    else if (!opts.length) { await ctx.discard(p, [c], { reason: 'cl3_qingjue' }); continue; }
    if (which === 1 && optTake) {
      await ctx.discard(p, [c], { reason: 'cl3_qingjue' });
      const n = Math.min(3, missSuits.length);
      await ctx.draw(p, n, { reason: 'cl3_qingjue' });
      await ctx.log(`【清绝】：弃置 ${cardLabel(c)}，按缺少花色 ${missSuits.map(s => SUIT_CN[s]).join('')} 补摸 ${n} 张`);
    } else {
      const t = (await ctx.ask.targets(p, { prompt: `【清绝】：将 ${cardLabel(c)} 交给一名其他角色`, candidates: others, min: 1, max: 1 }))[0] || others[0];
      if (!t) { await ctx.discard(p, [c], { reason: 'cl3_qingjue' }); continue; }
      await ctx.gain(t, [c], { from: p, reason: 'cl3_qingjue' });
      await ctx.log(`【清绝】：将 ${cardLabel(c)} 交给 ${t.name}`);
    }
  }
  qingjueRefresh(p);
}

// ======================================================================
// 族荀莳 · 萦香（锁定技）
// 其他角色获得你的牌称为「萦香」；「萦香」被使用后，你与持有「萦香」的角色各摸一张牌；
// 若「萦香」不因使用而失去，你发动一次【清绝】（每轮限一次）。
// ======================================================================
defineSkill({
  id: 'cl3_yingxiang', name: '萦香',
  desc: '锁定技，其他角色获得你的牌称为「萦香」；「萦香」被使用后，你与持有「萦香」的角色各摸一张牌；若「萦香」不因使用而失去，你发动一次【清绝】（每轮限一次）。',
  triggers: [
    {
      on: 'cards.gain', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player;
        return !!(p && d.from === p && d.self && d.self !== p && (d.cards || []).length);
      },
      async effect(ctx) {
        const p = ctx.self, got = ctx.data.self;
        for (const c of ctx.data.cards || []) c.__cl3Yn = p.seat;
        await ctx.log(`【萦香】：${got.name} 获得的 ${(ctx.data.cards || []).length} 张牌成为「萦香」`);
      },
    },
    {
      // 「萦香」被使用：引擎在 card.use.after 之前就会把使用的牌推进弃牌堆（触发 cards.discard），
      // 故用 card.use.before 打一个临时标记，让下面的「不因使用失去」判断能区分两类失去。
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => !!(d.card && d.card.__cl3Yn === d.player.seat),
      async effect(ctx) { ctx.data.card.__cl3Using = true; },
    },
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!(d.card && d.card.__cl3Yn === d.player.seat),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, c = ctx.data.card;
        delete c.__cl3Yn;
        delete c.__cl3Using;
        const holder = g.players.find(q => q.hand.includes(c)) || ctx.data.self;
        await ctx.draw(p, 1, { reason: 'cl3_yingxiang' });
        if (holder) await ctx.draw(holder, 1, { reason: 'cl3_yingxiang' });
        await ctx.log(`【萦香】：「萦香」被使用，${p.name} 与 ${holder ? holder.name : '—'} 各摸一张牌`);
      },
    },
    {
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, g = d.game;
        if (!p) return false;
        if (p.flags.yxRound === roundIdx(g)) return false;
        return (d.cards || []).some(c => c && c.__cl3Yn === p.seat && !c.__cl3Using);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.yxRound = roundIdx(g);
        for (const c of ctx.data.cards || []) if (c.__cl3Yn === p.seat && !c.__cl3Using) delete c.__cl3Yn;
        const bonus = qingjueRefresh(p);
        await ctx.log(`【萦香】：「萦香」不因使用而失去，发动一次【清绝】（本轮首次，手牌上限加成 ${bonus}）`);
      },
    },
  ],
});

// ======================================================================
// 族荀爽 · 佯疾
// 准备阶段，或你已损失体力值变化过的阶段结束时，你可以使用一张牌；
// 若此牌未造成伤害，你可以将一张♠牌当【乐不思蜀】对当前回合角色使用。
// ======================================================================
const yangjiTry = async (ctx) => {
  const p = ctx.self, g = ctx.game;
  if (!p.hand.length) { await ctx.log('【佯疾】：没有手牌'); return; }
  const [c] = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【佯疾】：选择一张手牌使用（取消即不发动）' });
  if (!c) return;
  const meta = CARD_META[c.name];
  if (!meta) return;
  const tg = await targetsFor(ctx, p, c.name, `【佯疾】：选择【${meta.cn}】的目标`);
  if (tg === null) { await ctx.log('【佯疾】：没有合法目标'); return; }
  const before = tg.map(t => t.hp);
  const ok = await ctx.useCard({ from: p, card: c, targets: tg, reason: 'cl3_yangji' });
  if (ok === false) return;
  const dmg = tg.some((t, i) => t.hp < before[i]);
  if (dmg) { await ctx.log('【佯疾】：此牌造成了伤害，不能转化【乐不思蜀】'); return; }
  const spades = p.hand.filter(x => x.suit === 'spade');
  if (!spades.length) return;
  const cur = g.turnPlayer;
  if (!cur || !cur.alive || cur === p) return;   // 【乐不思蜀】不能指定自己为目标
  const yes = await ctx.ask.confirm(p, `【佯疾】：此牌未造成伤害，是否将一张♠牌当【乐不思蜀】对 ${cur.name} 使用？`);
  if (!yes) return;
  const [sc] = await g.chooseSomeCards(p, spades, 1, { prompt: '【佯疾】：选择一张♠牌当【乐不思蜀】' });
  if (!sc) return;
  await ctx.log(`【佯疾】：将 ${cardLabel(sc)} 当【乐不思蜀】对 ${cur.name} 使用`);
  await ctx.useCard({ from: p, card: VC('lebu', sc.suit, sc.num), targets: [cur], extraCards: [sc], reason: 'cl3_yangji' });
};
defineSkill({
  id: 'cl3_yangji', name: '佯疾',
  desc: '准备阶段，或你已损失体力值变化过的阶段结束时，你可以使用一张牌；若此牌未造成伤害，你可以将一张♠牌当【乐不思蜀】对当前回合角色使用。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare' && d.self === d.player && d.player.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.yjLost = p.maxHp - p.hp;
        await yangjiTry(ctx);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { ctx.self.flags.yjLost = ctx.self.maxHp - ctx.self.hp; },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player;
        if (d.self !== p || d.phase === 'prepare') return false;
        if (p.flags.yjLost === undefined) return false;
        return (p.maxHp - p.hp) !== p.flags.yjLost && p.hand.length > 0;
      },
      async effect(ctx) {
        const p = ctx.self;
        p.flags.yjLost = p.maxHp - p.hp;
        await ctx.log('【佯疾】：本阶段你的已损失体力值变化过');
        await yangjiTry(ctx);
      },
    },
  ],
});

// ======================================================================
// 族荀爽 · 耽道（锁定技）
// 每名角色首次判定后，你的体力上限+1。
// ======================================================================
defineSkill({
  id: 'cl3_dandao', name: '耽道',
  desc: '锁定技，每名角色首次判定后，你的体力上限+1。',
  triggers: [{
    on: 'judge.after', who: 'any', optional: false,
    filter: (d) => {
      const q = d.self;
      return !!(q && q.alive && !q.flags.ddJudged);
    },
    async effect(ctx) {
      const p = ctx.self, q = ctx.data.self;
      q.flags.ddJudged = true;
      p.maxHp += 1;
      await ctx.log(`【耽道】：${q.name} 首次判定，${p.name} 的体力上限+1（${p.hp}/${p.maxHp}）`);
    },
  }],
});

// ======================================================================
// 族荀爽 · 清励（锁定技）
// 每回合结束时，你将手牌摸至已损失体力值（至多摸至5张）。
// ======================================================================
defineSkill({
  id: 'cl3_qingli', name: '清励',
  desc: '锁定技，每回合结束时，你将手牌摸至已损失体力值（至多摸至5张）。',
  triggers: [{
    on: 'turn.end', who: 'any', optional: false,
    filter: (d) => !!d.player && d.player.alive,
    async effect(ctx) {
      const p = ctx.self;
      const lost = Math.max(0, p.maxHp - p.hp);
      const target = Math.min(5, lost);
      if (target <= 0) { await ctx.log('【清励】：未损失体力，不摸牌'); return; }
      const n = await drawTo(ctx, p, target, 'cl3_qingli');
      if (n > 0) await ctx.log(`【清励】：回合结束，将手牌摸至 ${p.hand.length} 张（已损失体力 ${lost}）`);
    },
  }],
});

// ======================================================================
// 族王广 · 离论
// 出牌阶段限一次，你可以重铸两张牌名相同的牌（每种牌名每回合限一次），然后你可以使用其中一张牌。
// ======================================================================
defineSkill({
  id: 'cl3_lilun', name: '离论',
  desc: '出牌阶段限一次，你可以重铸两张牌名相同的牌（每种牌名每回合限一次），然后你可以使用其中一张牌。',
  active: {
    perPhase: true,
    prompt: '离论：重铸两张同名牌（每种牌名每回合限一次），然后可使用其中一张',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const rec = turnRec(p, 'llNames', g, { names: [] });
      const cnt = {};
      for (const c of p.hand) cnt[c.name] = (cnt[c.name] || 0) + 1;
      const av = Object.keys(cnt).filter(n => cnt[n] >= 2 && !rec.names.includes(n));
      if (!av.length) { await ctx.log('【离论】：没有可重铸的同名牌（每种牌名每回合限一次）'); return; }
      const idx = await ctx.ask.choose(p, av.map(n => `重铸两张【${CARD_META[n].cn}】`), { prompt: '【离论】：选择牌名', reason: 'cl3_lilun' });
      const nm = av[idx];
      if (!nm) return;
      const picks = p.hand.filter(c => c.name === nm).slice(0, 2);
      rec.names.push(nm);
      await ctx.discard(p, picks, { reason: 'cl3_lilun' });
      await ctx.draw(p, picks.length, { reason: 'cl3_lilun' });
      await ctx.log(`【离论】：重铸 ${picks.length} 张【${CARD_META[nm].cn}】`);
      const yes = await ctx.ask.confirm(p, '【离论】：是否使用其中一张牌？');
      if (!yes) return;
      const [use] = await g.chooseSomeCards(p, picks, 1, { prompt: '【离论】：选择要使用的一张牌' });
      if (!use) return;
      takeFromDiscard(g, use);
      const meta = CARD_META[use.name];
      const tg = await targetsFor(ctx, p, use.name, `【离论】：选择【${meta.cn}】的目标`);
      if (tg === null) { if (!g.discardPile.includes(use)) g.discardPile.push(use); return; }
      const ok = await ctx.useCard({ from: p, card: use, targets: tg, reason: 'cl3_lilun' });
      if (ok === false && !g.discardPile.includes(use)) g.discardPile.push(use);
    },
  },
});

// ======================================================================
// 族王广 · 见机（限定技）
// 一名角色的回合结束时，若此时与其相邻的角色本回合未使用过牌，你可以与其各摸一张牌；
// 若该相邻角色本回合未成为过【杀】或【决斗】的目标，你可以视为使用一张【杀】。
// ======================================================================
const adjacentOf = (g, q) => {
  const n = g.players.length;
  const a = g.players[(q.seat - 1 + n) % n], b = g.players[(q.seat + 1) % n];
  return [a, b].filter(x => x && x !== q && x.alive);
};
defineSkill({
  id: 'cl3_jianji', name: '见机',
  desc: '限定技，一名角色的回合结束时，若此时与其相邻的角色本回合未使用过牌，你可以与其各摸一张牌；若该相邻角色本回合未成为过【杀】或【决斗】的目标，你可以视为使用一张【杀】。',
  triggers: [
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!d.self,
      async effect(ctx) { ctx.data.self.flags.jjUsedTurn = ctx.game.turnCount; },
    },
    {
      on: 'target.after', who: 'any', optional: false,
      filter: (d) => d.card && (d.card.name === 'sha' || d.card.name === 'juedou'),
      async effect(ctx) { if (ctx.data.target) ctx.data.target.flags.jjTargetTurn = ctx.game.turnCount; },
    },
    {
      on: 'turn.end', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player, g = d.game, cur = d.self;
        if (!p || !cur || p.flags.jjUsed) return false;
        const adj = adjacentOf(g, cur).filter(q => q.flags.jjUsedTurn !== g.turnCount);
        return adj.length > 0;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, cur = ctx.data.self;
        const adj = adjacentOf(g, cur).filter(q => q.flags.jjUsedTurn !== g.turnCount);
        if (!adj.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【见机】：选择相邻且本回合未使用过牌的角色', candidates: adj, min: 1, max: 1 }))[0] || adj[0];
        p.flags.jjUsed = true;
        await ctx.draw(p, 1, { reason: 'cl3_jianji' });
        await ctx.draw(t, 1, { reason: 'cl3_jianji' });
        await ctx.log(`【见机】：${cur.name} 的回合结束，${p.name} 与 ${t.name} 各摸一张牌（限定技）`);
        if (t.flags.jjTargetTurn !== g.turnCount) {
          const ok = await useVirtual(ctx, p, 'sha', { targets: [t], reason: 'cl3_jianji', ignoreRange: true, ignoreShaLimit: true });
          if (ok !== false) await ctx.log(`【见机】：${t.name} 本回合未成为【杀】/【决斗】的目标，视为对其使用一张【杀】`);
        }
      },
    },
  ],
});

// ======================================================================
// 族王明山 · 弹雀
// 每回合限一次，当你使用一张牌结算结束后，若X不为0，你可以对一名体力值或手牌数等于X的角色
// 造成1点伤害（X为你此次使用的牌点数与你上一张使用的牌点数之差）。
// ======================================================================
defineSkill({
  id: 'cl3_tanque', name: '弹雀',
  desc: '每回合限一次，当你使用一张牌结算结束后，若X不为0，你可以对一名体力值或手牌数等于X的角色造成1点伤害（X为你此次使用的牌点数与你上一张使用的牌点数之差）。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player, c = d.card, g = d.game;
        if (!p || !c || typeof c.num !== 'number') return false;
        if (p.flags.tqTurn === g.turnCount) return false;
        if (typeof p.flags.tqLast !== 'number') return false;
        const x = Math.abs(c.num - p.flags.tqLast);
        if (!x) return false;
        return g.alive().some(q => q.hp === x || q.hand.length === x);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, c = ctx.data.card;
        p.flags.tqTurn = g.turnCount;
        const x = Math.abs(c.num - p.flags.tqLast);
        const cands = g.alive().filter(q => q.hp === x || q.hand.length === x);
        const t = (await ctx.ask.targets(p, { prompt: `【弹雀】：X=${x}，对一名体力值或手牌数等于 ${x} 的角色造成1点伤害`, candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        await ctx.log(`【弹雀】：此牌点数 ${c.num} 与上一张 ${p.flags.tqLast} 之差为 ${x}，对 ${t.name} 造成1点伤害`);
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'cl3_tanque' });
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => !!d.card && typeof d.card.num === 'number' && d.player.flags.tqLast !== d.card.num,
      async effect(ctx) { ctx.self.flags.tqLast = ctx.data.card.num; },
    },
  ],
});

// ======================================================================
// 族王明山 · 剩墨（每轮限一次）
// 当你需要使用一张基本牌时（每种基本牌每局游戏限一次），你可以从弃牌堆中获得一张本回合置入
// 弃牌堆的牌（每种点数每局限一次）；若该牌点数不为最大也不为最小，则视为你使用了该基本牌。
// 实现口径：引擎没有「需要使用基本牌」的响应时机，改为出牌阶段主动发动（每轮限一次）。
// ======================================================================
defineSkill({
  id: 'cl3_shengmo', name: '剩墨',
  desc: '每轮限一次，当你需要使用一张基本牌时（每种基本牌每局游戏限一次），你可以从弃牌堆中获得一张本回合置入弃牌堆的牌（每种点数每局限一次）；若该牌点数不为最大也不为最小，则视为你使用了该基本牌。（引擎无「需要使用基本牌」时机，本实现改为出牌阶段主动发动）',
  active: {
    prompt: '剩墨：取回一张本回合置入弃牌堆的牌，点数居中则视为使用一张基本牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.smRound === roundIdx(g)) { await ctx.log('【剩墨】：本轮已发动过（每轮限一次）'); return; }
      const rec = p.flags.smPool;
      const nums = p.flags.smNums || [];
      const pool = (rec && rec.turn === g.turnCount ? rec.cards : [])
        .filter(c => c && !c.virtual && g.discardPile.includes(c) && !nums.includes(c.num));
      if (!pool.length) { await ctx.log('【剩墨】：弃牌堆中没有可取的牌（须本回合置入且点数未记录过）'); return; }
      const [c] = await g.chooseSomeCards(p, pool, 1, { prompt: '【剩墨】：选择一张本回合置入弃牌堆的牌' });
      if (!c) return;
      p.flags.smRound = roundIdx(g);
      (p.flags.smNums = nums).push(c.num);
      await ctx.gain(p, [takeFromDiscard(g, c)], { from: null, reason: 'cl3_shengmo' });
      await ctx.log(`【剩墨】：从弃牌堆获得 ${cardLabel(c)}（点数 ${c.num}）`);
      if (c.num <= 1 || c.num >= 13) { await ctx.log('【剩墨】：该牌点数为最大或最小，不视为使用基本牌'); return; }
      const left = BASIC_NAMES.filter(n => !(p.flags.smBasics || []).includes(n));
      if (!left.length) { await ctx.log('【剩墨】：每种基本牌每局限一次，已全部用过'); return; }
      const idx = await ctx.ask.choose(p, left.map(n => `视为使用【${CARD_META[n].cn}】`), { prompt: '【剩墨】：选择视为使用的基本牌', reason: 'cl3_shengmo' });
      const nm = left[idx];
      if (!nm) return;
      (p.flags.smBasics = p.flags.smBasics || []).push(nm);
      await useVirtual(ctx, p, nm, { suit: c.suit, num: c.num, reason: 'cl3_shengmo', ignoreRange: true });
    },
  },
  triggers: [{
    on: 'cards.discard', who: 'any', optional: false,
    filter: (d) => !!d.player && (d.cards || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const rec = turnRec(p, 'smPool', g, { cards: [] });
      for (const c of ctx.data.cards || []) if (c && !c.virtual && !rec.cards.includes(c)) rec.cards.push(c);
    },
  }],
});

// ======================================================================
// 族王允 · 解悬（转换技，限定技）
// 阳：你可以将一张红色牌当【顺手牵羊】使用；阴：你可以将一张黑色牌当【过河拆桥】使用。
// ======================================================================
defineSkill({
  id: 'cl3_jiexuan', name: '解悬',
  desc: '转换技，限定技。阳：你可以将一张红色牌当【顺手牵羊】使用；阴：你可以将一张黑色牌当【过河拆桥】使用。',
  active: {
    prompt: '解悬：阳—红牌当【顺手牵羊】／阴—黑牌当【过河拆桥】（限定技，全局一次）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jxUsed) { await ctx.log('【解悬】：本局限定技已使用'); return; }
      const yin = !!p.flags.jxYin;
      const pool = p.hand.filter(c => (yin ? !isRed(c) && c.suit !== 'none' : isRed(c)));
      if (!pool.length) { await ctx.log(`【解悬】：没有${yin ? '黑' : '红'}色手牌`); return; }
      const [c] = await g.chooseSomeCards(p, pool, 1, { prompt: `【解悬】：选择一张${yin ? '黑' : '红'}色牌` });
      if (!c) return;
      const nm = yin ? 'guohe' : 'shunshou';
      const tg = await targetsFor(ctx, p, nm, `【解悬】：选择【${CARD_META[nm].cn}】的目标`);
      if (tg === null) return;
      const ok = await useVirtual(ctx, p, nm, { suit: c.suit, num: c.num, extraCards: [c], targets: tg, reason: 'cl3_jiexuan' });
      if (!ok) return;
      p.flags.jxUsed = true;
      p.flags.jxYin = !yin;
      await ctx.log(`【解悬】：以${yin ? '阴' : '阳'}形态发动，本局限定技已使用`);
    },
  },
});

// ======================================================================
// 族王允 · 铭戒（限定技）
// 出牌阶段，你可以选择一名角色：
// 1.直到其下个回合结束，你使用牌可以额外选择该角色为目标；
// 2.其下个回合结束时，你可以使用弃牌堆中本回合使用过的♠牌和被抵消过的牌。
// ======================================================================
defineSkill({
  id: 'cl3_mingjie', name: '铭戒',
  desc: '限定技，出牌阶段，你可以选择一名角色：1.直到其下个回合结束，你使用牌可以额外选择该角色为目标；2.其下个回合结束时，你可以使用弃牌堆中本回合使用过的♠牌和被抵消过的牌。',
  active: {
    prompt: '铭戒：指定一名角色，你对其用牌可多选其为目标；其下回合结束时可回收本回合的♠牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.mjUsed) { await ctx.log('【铭戒】：本局限定技已使用'); return; }
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) { await ctx.log('【铭戒】：没有其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【铭戒】：选择一名角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.mjUsed = true;
      p.flags.mjSeat = t.seat;
      p.marks.mingjie = t.name;
      await ctx.log(`【铭戒】：指定 ${t.name}，直到其下个回合结束你使用牌可额外选择其为目标`);
    },
  },
  triggers: [
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.player.flags.mjSeat != null,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const t = g.players[p.flags.mjSeat];
        if (!t || !t.alive) { delete p.flags.mjSeat; return; }
        const nm = d.effName || d.card?.name;
        const meta = CARD_META[nm];
        const rule = meta?.target;
        if (!meta || !rule || typeof rule === 'function') return;
        if (!(rule.others || rule.all)) return;
        if ((d.targets || []).includes(t)) return;
        const cands = g.candidatesFor(p, { name: nm, type: meta.type }, nm);
        if (!cands.includes(t)) return;
        d.extraTargets = [t.seat];
        await ctx.log(`【铭戒】：额外选择 ${t.name} 为目标`);
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!d.card && d.card.suit === 'spade',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.flags.mjSeat == null && !p.flags.mjUsed) return;
        const rec = turnRec(p, 'mjCards', g, { cards: [] });
        if (!rec.cards.includes(ctx.data.card)) rec.cards.push(ctx.data.card);
      },
    },
    {
      on: 'turn.end', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player, cur = d.self;
        return !!(p && cur && p.flags.mjSeat != null && p.flags.mjSeat === cur.seat);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, cur = ctx.data.self;
        delete p.flags.mjSeat;
        await ctx.log(`【铭戒】：${cur.name} 的下个回合结束，可使用弃牌堆中本回合使用过的♠牌`);
        const rec = p.flags.mjCards;
        const pool = (rec && rec.turn === g.turnCount ? rec.cards : []).filter(c => c && g.discardPile.includes(c));
        if (!pool.length) { await ctx.log('【铭戒】：本回合没有可用过的♠牌'); return; }
        const [c] = await g.chooseSomeCards(p, pool, 1, { prompt: '【铭戒】：选择一张本回合使用过的♠牌使用（取消则不用）' });
        if (!c) return;
        takeFromDiscard(g, c);
        const meta = CARD_META[c.name];
        const tg = await targetsFor(ctx, p, c.name, `【铭戒】：选择【${meta.cn}】的目标`);
        if (tg === null) { if (!g.discardPile.includes(c)) g.discardPile.push(c); return; }
        const ok = await ctx.useCard({ from: p, card: c, targets: tg, reason: 'cl3_mingjie' });
        if (ok === false && !g.discardPile.includes(c)) g.discardPile.push(c);
      },
    },
  ],
});

// ======================================================================
// 族吴苋 · 移荣
// 出牌阶段限两次，你可以将手牌摸至／弃置至手牌上限，然后你的手牌上限-1／+1（摸牌则-1，弃牌则+1）。
// ======================================================================
defineSkill({
  id: 'cl3_yirong', name: '移荣',
  desc: '出牌阶段限两次，你可以将手牌摸至／弃置至手牌上限，然后你的手牌上限-1／+1（摸牌则-1，弃牌则+1）。',
  active: {
    prompt: '移荣：摸至手牌上限（上限-1）／弃置至手牌上限（上限+1），每阶段限两次',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      // 【移荣】官方口径是「出牌阶段限两次」，故按 playPhaseSeq 计（额外出牌阶段刷新），不能用 turnRec
      const rec = phaseRec(p, 'yrUsed', g, { n: 0 });
      if (rec.n >= 2) { await ctx.log('【移荣】：本阶段已发动两次'); return; }
      const lim = handLimitOf(p);
      const idx = await ctx.ask.choose(p, [
        `将手牌摸至手牌上限（${lim}），然后手牌上限-1`,
        `将手牌弃置至手牌上限（${lim}），然后手牌上限+1`,
      ], { prompt: `【移荣】：请选择（当前手牌 ${p.hand.length} 张 / 上限 ${lim}）`, reason: 'cl3_yirong' });
      if (idx < 0) return;
      rec.n++;
      if (idx === 0) {
        await drawTo(ctx, p, lim, 'cl3_yirong');
        p.flags.handLimit = (p.flags.handLimit || 0) - 1;
        await ctx.log(`【移荣】：手牌摸至 ${p.hand.length} 张，手牌上限-1（${handLimitOf(p)}）`);
      } else {
        const over = p.hand.length - lim;
        if (over > 0) {
          const picks = await g.chooseSomeCards(p, p.hand.slice(), over, { prompt: `【移荣】：弃置 ${over} 张手牌` });
          if (picks.length) await ctx.discard(p, picks, { reason: 'cl3_yirong' });
        }
        p.flags.handLimit = (p.flags.handLimit || 0) + 1;
        await ctx.log(`【移荣】：弃置至 ${p.hand.length} 张，手牌上限+1（${handLimitOf(p)}）`);
      }
    },
  },
});

// ======================================================================
// 族吴苋 · 贵相（锁定技）
// 你本回合的第X个阶段开始前，将此阶段改为出牌阶段（X为你的手牌上限）。
// 实现口径：在该阶段 phase.begin 时插入一个完整的出牌阶段，并尽力抵消原阶段
//   （摸牌→skip_draw；弃牌→临时放大手牌上限后于 phase.end 复原；判定/结束阶段按原样结算）。
// ======================================================================
const PHASES_CL3 = ['prepare', 'judge', 'draw', 'play', 'discard', 'end'];
const PHASE_CN_CL3 = { prepare: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束' };
defineSkill({
  id: 'cl3_guixiang', name: '贵相',
  desc: '锁定技，你本回合的第X个阶段开始前，将此阶段改为出牌阶段（X为你的手牌上限）。（引擎无「插入/替换阶段」原语：实现为在该阶段开始时插入一个出牌阶段，摸牌阶段不再摸牌、弃牌阶段不再弃牌）',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { ctx.self.flags.gxDone = false; },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player;
        if (!p || d.self !== p || p.flags.gxDone) return false;
        if (d.phase === 'play') return false;
        return PHASES_CL3.indexOf(d.phase) + 1 === Math.max(1, handLimitOf(p));
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, ph = ctx.data.phase;
        const x = Math.max(1, handLimitOf(p));
        p.flags.gxDone = true;
        if (ph === 'draw') p.flags.skip_draw = true;
        if (ph === 'discard') { p.flags.gxSaveHL = p.flags.handLimit || 0; p.flags.handLimit = 99; }
        await ctx.log(`【贵相】：本回合第 ${x} 个阶段（${PHASE_CN_CL3[ph] || ph}）改为出牌阶段`);
        g.phase = 'play';
        await g.trigger('phase.begin', { self: p, phase: 'play' });
        await g.runPhase(p, 'play');
        await g.trigger('phase.end', { self: p, phase: 'play' });
        g.phase = ph;
      },
    },
    {
      on: 'phase.end', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.player.flags.gxSaveHL != null,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.handLimit = p.flags.gxSaveHL;
        delete p.flags.gxSaveHL;
      },
    },
  ],
});

// ======================================================================
// 族吴班 · 斩钉
// 你可以将任意张牌当【杀】使用并令你手牌上限-1；若此【杀】造成过伤害，你将手牌数调整至
// 手牌上限，否则此【杀】不计入本阶段使用次数。
// ======================================================================
defineSkill({
  id: 'cl3_zhanding', name: '斩钉',
  desc: '你可以将任意张牌当【杀】使用并令你手牌上限-1；若此【杀】造成过伤害，你将手牌数调整至手牌上限，否则此【杀】不计入本阶段使用次数。',
  active: {
    prompt: '斩钉：将任意张牌当【杀】使用（手牌上限-1）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【斩钉】：没有手牌'); return; }
      const picks = await g.chooseSomeCards(p, p.hand.slice(), p.hand.length, { prompt: '【斩钉】：选择任意张牌当【杀】（点取消即结束）' });
      if (!picks.length) return;
      const tg = await targetsFor(ctx, p, 'sha', '【斩钉】：选择【杀】的目标');
      if (tg === null) { await ctx.log('【斩钉】：没有合法目标'); return; }
      p.flags.handLimit = (p.flags.handLimit || 0) - 1;
      await ctx.log(`【斩钉】：将 ${picks.length} 张牌当【杀】使用，手牌上限-1（${handLimitOf(p)}）`);
      const before = tg.map(t => t.hp);
      const ok = await ctx.useCard({ from: p, card: VC('sha', picks[0].suit, picks[0].num), targets: tg, extraCards: picks, reason: 'cl3_zhanding' });
      if (ok === false) {
        p.flags.handLimit = (p.flags.handLimit || 0) + 1;
        await ctx.log('【斩钉】：此【杀】未能使用，手牌上限复原');
        return;
      }
      const dmg = tg.some((t, i) => t.hp < before[i]);
      if (dmg) {
        const lim = Math.max(0, handLimitOf(p));
        if (p.hand.length < lim) await ctx.draw(p, lim - p.hand.length, { reason: 'cl3_zhanding' });
        else if (p.hand.length > lim) {
          const over = p.hand.length - lim;
          const cs = await g.chooseSomeCards(p, p.hand.slice(), over, { prompt: `【斩钉】：弃置 ${over} 张手牌` });
          if (cs.length) await ctx.discard(p, cs, { reason: 'cl3_zhanding' });
        }
        await ctx.log(`【斩钉】：此【杀】造成过伤害，手牌数调整至手牌上限 ${lim}`);
      } else {
        p.flags.shaUsed = Math.max(0, (p.flags.shaUsed || 0) - 1);
        await ctx.log('【斩钉】：此【杀】未造成伤害，不计入本阶段使用次数');
      }
    },
  },
});

// ======================================================================
// 族诸葛果 · 扶摇（转换技）
// 出牌阶段，你可以将手牌中「展示过」与「未展示过」的牌：阳：展示至两者数量相同；
// 阴：弃置至两者数量相同；然后视为使用一张本阶段未以此法使用过的单目标普通锦囊牌。
// 实现口径：手牌「展示过」用卡牌临时属性 __cl3Show 记账（引擎无「手牌明置」原语）。
// ======================================================================
const isSingleTrick = (n) => {
  const m = CARD_META[n];
  const r = m?.target;
  return !!(m && m.type === 'trick' && !m.delayed && r && typeof r === 'object' && (r.max ?? 1) <= 1);
};
defineSkill({
  id: 'cl3_fuyao', name: '扶摇',
  desc: '转换技，出牌阶段，你可以将手牌中「展示过」与「未展示过」的牌：阳：展示至两者数量相同；阴：弃置至两者数量相同；然后视为使用一张本阶段未以此法使用过的单目标普通锦囊牌。',
  active: {
    prompt: '扶摇：阳—展示至数量相同／阴—弃置至数量相同，然后视为使用一张单目标普通锦囊牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【扶摇】：没有手牌'); return; }
      const yin = !!p.flags.fyYin;
      const shown = p.hand.filter(c => c.__cl3Show);
      const unshown = p.hand.filter(c => !c.__cl3Show);
      if (shown.length === unshown.length) { await ctx.log('【扶摇】：展示过与未展示过的牌数量已相同'); return; }
      if (yin) {
        // 阴：弃置「展示过」的牌，弃掉的牌离开手牌 → 需要 (shown - unshown) 张
        if (shown.length <= unshown.length) { await ctx.log('【扶摇】（阴）：「展示过」的牌不多于「未展示过」的牌，无法弃置至相同'); return; }
        const need = shown.length - unshown.length;
        const picks = await g.chooseSomeCards(p, shown.slice(), need, { prompt: `【扶摇】（阴）：弃置 ${need} 张「展示过」的牌` });
        if (picks.length !== need) { await ctx.log('【扶摇】：选择不足，技能未发动'); return; }
        await ctx.discard(p, picks, { reason: 'cl3_fuyao' });
        await ctx.log(`【扶摇】（阴）：弃置 ${need} 张「展示过」的牌至两者数量相同`);
      } else {
        // 阳：展示「未展示过」的牌（仍在手牌，只是转入「展示过」）→ 需要差值的半数
        if (unshown.length <= shown.length) { await ctx.log('【扶摇】（阳）：「未展示过」的牌不多于「展示过」的牌，无法展示至相同'); return; }
        if ((unshown.length - shown.length) % 2 !== 0) { await ctx.log('【扶摇】（阳）：两者数量差不为偶数，无法恰好展示至相同'); return; }
        const need = (unshown.length - shown.length) / 2;
        const picks = await g.chooseSomeCards(p, unshown.slice(), need, { prompt: `【扶摇】（阳）：展示 ${need} 张手牌` });
        if (picks.length !== need) { await ctx.log('【扶摇】：选择不足，技能未发动'); return; }
        g.revealCards?.(picks, { reason: '扶摇' });
        for (const c of picks) c.__cl3Show = true;
        await ctx.log(`【扶摇】（阳）：展示 ${picks.length} 张手牌至两者数量相同`);
      }
      p.flags.fyYin = !yin;
      const rec = turnRec(p, 'fyNames', g, { names: [] });
      const left = NORMAL_TRICKS.filter(n => !rec.names.includes(n) && isSingleTrick(n));
      if (!left.length) { await ctx.log('【扶摇】：本阶段可用的单目标普通锦囊已全部用过'); return; }
      const idx = await ctx.ask.choose(p, left.map(n => `视为使用【${CARD_META[n].cn}】`), { prompt: '【扶摇】：选择要使用的单目标普通锦囊牌', reason: 'cl3_fuyao' });
      const nm = left[idx];
      if (!nm) return;
      rec.names.push(nm);
      await useVirtual(ctx, p, nm, { reason: 'cl3_fuyao' });
    },
  },
});

// ======================================================================
// 族诸葛果 · 纷势（宗族技 · 本批新增）
// 每回合限一次，若有同族角色手牌数等于场上势力数，你使用锦囊牌可以额外结算一次。
// ======================================================================
defineSkill({
  id: 'cl3_fenshi', name: '纷势',
  desc: '宗族技，每回合限一次，若有同族角色手牌数等于场上势力数，你使用锦囊牌可以额外结算一次。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => {
      const p = d.player, g = d.game;
      if (!p) return false;
      if (p.flags.fsTurn === g.turnCount) return false;
      const meta = CARD_META[d.effName || d.card?.name];
      if (!meta || meta.type !== 'trick') return false;
      const fx = new Set(g.alive().map(q => q.kingdom)).size;
      return g.alive().some(q => g.sameClan(p, q) && q.hand.length === fx);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const nm = d.effName || d.card.name;
      const meta = CARD_META[nm];
      p.flags.fsTurn = g.turnCount;
      const fx = new Set(g.alive().map(q => q.kingdom)).size;
      await ctx.log(`【纷势】：有同族角色手牌数等于场上势力数（${fx}），【${meta.cn}】额外结算一次`);
      try {
        await meta.effect(g, { from: p, card: d.card, targets: (d.targets || []).slice() });
      } catch (e) {
        await ctx.log(`【纷势】：额外结算异常（${e.message}）`);
      }
    },
  }],
});

// ======================================================================
// 族陆绩 · 该览（锁定技）
// ①游戏开始时，将四张【浑天仪】加入牌堆；②回合开始时，你将牌堆或弃牌堆中的一张【浑天仪】
// 置入你的装备区。（衍生装备【浑天仪】：失去时从牌堆随机获得两张与此牌点数相同的锦囊牌；
// 受到伤害时销毁此牌并防止此伤害。）
// 降级：引擎无自定义装备牌 → 改为「浑天仪」标记：开局 4 枚，每回合开始 +1（上限 4），
//       受到伤害时可弃 1 枚防止之，失去 1 枚时摸两张牌。
// ======================================================================
defineSkill({
  id: 'cl3_gailan', name: '该览',
  desc: '锁定技，①游戏开始时，你获得 4 枚「浑天仪」标记；②回合开始时，你获得 1 枚「浑天仪」（上限 4）；③当你受到伤害时，你可以弃 1 枚「浑天仪」防止此伤害，然后摸两张牌。（引擎无自定义装备牌：原「将四张【浑天仪】加入牌堆／置入装备区，失去时从牌堆获得两张同点数锦囊牌」降级为标记实现，失去 1 枚标记即摸两张牌）',
  triggers: [
    {
      on: 'game.start', who: 'any', optional: false,
      filter: () => true,
      async effect(ctx) {
        const p = ctx.self;
        p.marks.huntianyi = 4;
        await ctx.log(`【该览】：游戏开始，${p.name} 获得 4 枚「浑天仪」（降级：以标记代替 4 张衍生装备【浑天仪】）`);
      },
    },
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => !!d.player && (d.player.marks.huntianyi || 0) < 4,
      async effect(ctx) {
        const p = ctx.self;
        p.marks.huntianyi = Math.min(4, (p.marks.huntianyi || 0) + 1);
        await ctx.log(`【该览】：回合开始，获得 1 枚「浑天仪」（${p.marks.huntianyi}/4）`);
      },
    },
    {
      on: 'damage.before', who: 'self', optional: true,
      filter: (d) => d.self === d.player && !d.canceled && (d.player.marks.huntianyi || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.marks.huntianyi -= 1;
        ctx.data.canceled = true;
        ctx.data.amount = 0;
        await ctx.draw(p, 2, { reason: 'cl3_gailan' });
        await ctx.log(`【该览】：销毁 1 枚「浑天仪」防止此伤害，然后摸两张牌（剩余 ${p.marks.huntianyi}/4）`);
      },
    },
  ],
});

// ======================================================================
// 族陆绩 · 奋驽
// ①出牌阶段开始时，你可以令至多X名角色各弃置一张牌，将这些牌置于你的武将牌上称为「逸」
//   （X为你当前体力值）；
// ②若你武将牌上有「逸」，你使用牌指定目标时记录此牌点数；
// ③准备阶段，若记录点数大于「逸」的点数和，你清除记录并获得所有「逸」。
// 实现口径：「逸」用 flags.yi 存牌对象 + marks.yi 计数；记录点数累加写 flags.fnSum。
// ======================================================================
defineSkill({
  id: 'cl3_fennu', name: '奋驽',
  desc: '①出牌阶段开始时，你可以令至多X名角色各弃置一张牌，将这些牌置于你的武将牌上称为「逸」（X为你当前体力值）；②若你武将牌上有「逸」，你使用牌指定目标时记录此牌点数；③准备阶段，若记录点数大于「逸」的点数和，你清除记录并获得所有「逸」。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.self === d.player && d.player.hp > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = p.hp;
        const cands = g.alive();
        const ts = await ctx.ask.targets(p, { prompt: `【奋驽】：令至多 ${x} 名角色各弃置一张牌`, candidates: cands, min: 1, max: Math.min(x, cands.length) });
        if (!ts.length) return;
        const got = [];
        for (const q of ts) {
          const pool = allCardsOf(q);
          if (!pool.length) continue;
          const [c] = await g.chooseSomeCards(q, pool, 1, { prompt: `【奋驽】：${p.name} 令你弃置一张牌（将置于其武将牌上）` });
          if (!c) continue;
          await g.takeCard(c);
          got.push(c);
        }
        if (!got.length) return;
        p.flags.yi = [...(p.flags.yi || []), ...got];
        p.marks.yi = p.flags.yi.length;
        await g.trigger('zone.out', { self: p, cards: got });
        await ctx.log(`【奋驽】：${got.length} 张牌置于 ${p.name} 的武将牌上称为「逸」（合计 ${p.flags.yi.length} 张）`);
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => !!d.card && typeof d.card.num === 'number' && (d.player.flags.yi || []).length > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.fnSum = (p.flags.fnSum || 0) + (ctx.data.card.num || 0);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'prepare' && d.self === d.player && (d.player.flags.yi || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const sum = (p.flags.yi || []).reduce((a, c) => a + (c.num || 0), 0);
        const rec = p.flags.fnSum || 0;
        if (rec <= sum) { await ctx.log(`【奋驽】：记录点数 ${rec} 不大于「逸」点数和 ${sum}，不获得`); return; }
        const cards = (p.flags.yi || []).splice(0);
        p.flags.fnSum = 0;
        p.marks.yi = 0;
        await g.trigger('zone.in', { self: p, cards });
        await ctx.gain(p, cards, { from: null, reason: 'cl3_fennu' });
        await ctx.log(`【奋驽】：记录点数 ${rec} > 「逸」点数和 ${sum}，清除记录并获得所有「逸」（${cards.length} 张）`);
      },
    },
  ],
});

// ======================================================================
// 族杨赐 · 切议
// 出牌阶段开始时，你可以观看牌堆顶的两张牌；然后你于本回合第一次使用一种花色的牌结算结束后，
// 展示牌堆顶的一张牌：若这两张牌颜色或类别相同，你获得展示的牌，否则你将一张牌置于牌堆顶。
// 实现口径：「这两张牌」取「观看的两张 + 展示的一张」，只要展示牌与其中任一张颜色或类别相同即算相同。
// ======================================================================
defineSkill({
  id: 'cl3_qieyi', name: '切议',
  desc: '出牌阶段开始时，你可以观看牌堆顶的两张牌；然后你于本回合第一次使用一种花色的牌结算结束后，展示牌堆顶的一张牌：若这两张牌颜色或类别相同，你获得展示的牌，否则你将一张牌置于牌堆顶。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const rec = turnRec(p, 'qy', g, { count: 0, cards: [], suits: [], shown: [] });
        rec.count += 1;
        const top = g.deck.slice(Math.max(0, g.deck.length - 2)).reverse();
        rec.cards = top.map(c => ({ suit: c.suit, name: c.name, type: CARD_META[c.name]?.type || '' }));
        if (top.length) await ctx.log(`【切议】：观看牌堆顶 ${top.length} 张（${top.map(cardLabel).join('、')}）`);
        else await ctx.log('【切议】：牌堆为空');
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => !!d.card,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, c = ctx.data.card;
        const rec = turnRec(p, 'qy', g, { count: 0, cards: [], suits: [], shown: [] });
        const first = !rec.suits.includes(c.suit);
        if (first && c.suit) rec.suits.push(c.suit);
        if (!first || !c.suit || c.suit === 'none') return;
        if (!rec.count || !(rec.cards || []).length) return;      // 本回合未发动【切议】
        if (rec.shown.includes(c.suit)) return;
        rec.shown.push(c.suit);
        const [card] = g.popDeck(1);
        if (!card) { await ctx.log('【切议】：牌堆为空，无法展示'); return; }
        await g.revealCards([card], { reason: '切议' });
        const myType = CARD_META[card.name]?.type;
        const same = (rec.cards || []).some(o =>
          (isRed({ suit: o.suit }) === isRed(card)) || (o.type && o.type === myType));
        if (same) {
          await ctx.gain(p, [card], { from: null, reason: 'cl3_qieyi' });
          await ctx.log(`【切议】：展示的 ${cardLabel(card)} 与观看的牌颜色或类别相同，获得之`);
        } else {
          g.deck.push(card);
          await ctx.log(`【切议】：展示的 ${cardLabel(card)} 与观看的牌颜色/类别均不同，将一张牌置于牌堆顶`);
        }
      },
    },
  ],
});

// ======================================================================
// 族杨赐 · 谏直（锁定技）
// 结束阶段，你进行至多X次判定（X为你本回合发动【切议】的次数），然后将判定牌中属于你本回合
// 使用过的花色的牌分配给任意角色；若判定牌中包含你本回合未使用过的花色的牌，
// 你受到1点无伤害来源的雷电伤害。
// ======================================================================
defineSkill({
  id: 'cl3_jianzhi', name: '谏直',
  desc: '锁定技，结束阶段，你进行至多X次判定（X为你本回合发动【切议】的次数），然后将判定牌中属于你本回合使用过的花色的牌分配给任意角色；若判定牌中包含你本回合未使用过的花色的牌，你受到1点无伤害来源的雷电伤害。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'end' && d.self === d.player && (d.player.flags.qy?.count || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const rec = p.flags.qy;
      const used = rec.suits || [];
      const x = Math.min(4, rec.count || 0);
      const results = [];
      for (let i = 0; i < x; i++) {
        const j = await ctx.judge(p, { reason: 'cl3_jianzhi' });
        if (j && j.card) results.push({ card: j.card, suit: j.suit });
      }
      if (!results.length) { await ctx.log('【谏直】：没有判定牌'); return; }
      let bad = false;
      for (const r of results) {
        if (used.includes(r.suit)) {
          const t = (await ctx.ask.targets(p, {
            prompt: `【谏直】：将判定牌 ${cardLabel(r.card)}（${SUIT_CN[r.suit] || ''}）分配给一名角色`,
            candidates: g.alive(), min: 1, max: 1,
          }))[0];
          if (!t) continue;
          await ctx.gain(t, [takeFromDiscard(g, r.card)], { from: null, reason: 'cl3_jianzhi' });
          await ctx.log(`【谏直】：将 ${cardLabel(r.card)} 分配给 ${t.name}`);
        } else {
          bad = true;
        }
      }
      if (bad) {
        await ctx.log('【谏直】：判定牌中有本回合未使用过的花色，受到1点雷电伤害（无来源）');
        await ctx.damage({ from: null, to: p, amount: 1, nature: 'thunder', reason: 'cl3_jianzhi' });
      }
    },
  }],
});



