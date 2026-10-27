// 晋势力 · 文德武备（补全）—— 阶段 5C 批次 · 12 将
// 官方出处：《三国杀OL》文德武备系列（理 / 备 / 果 / 戒 / 约 五个子包）。
// 资料来源：三国杀OL 官网武将页（sanguosha.com/hero/70xx）、三国杀OL 版本更新公告、
//           三国杀 Wiki（sanguosha.fandom.com）、萌娘百科条目「文德武备」系列武将。
//
// ============ 本批实现的简化与偏差（逐条列出，desc 一律写成「实际实现的版本」）============
//  1. 石苞【擢升】：官方「基本牌，此牌无距离和次数限制」。引擎 canUse 在进入技能钩子之前就已
//     完成距离/次数校验，技能层没有介入点 → 本实现只做「不计入【杀】的使用次数」（用后回退
//     shalUsed 计数），距离豁免未实现。
//  2. 华歆【草诏】：官方「令此牌视为你声明的牌」这一步需要对他人的手牌做牌名转化（引擎
//     VIRTUAL_RULES 属引擎文件，本批不得修改）→ 本实现按「声明成功 → 你可以将此牌交给一名
//     其他角色」结算，牌名转化只写战报（信息性）。
//  3. 成济&成倅【畜鸣】：官方「其可将造成伤害的牌当【借刀杀人】或【过河拆桥】对你使用」→
//     本实现固定为「当【过河拆桥】对你使用」（【借刀杀人】需要武器与第三方目标，语义不符）。
//  4. 杨芷【婉嫕】：「置入你的武将牌上」用 player.flags.wyCards 存牌表示（zone.out/zone.in
//     事件照发）；「不能使用/打出/弃置」三个动作里，本实现只拦截「使用」（引擎没有统一的
//     「弃置/打出合法性」拦截点）。
//  5. 杨芷【埋祸】：把该【杀】置入其武将牌上，本实现用「该牌留在弃牌堆 + 记标记」表示，其下个
//     出牌阶段开始时若该牌仍在弃牌堆就取回来自动使用，否则用一张等效虚拟【杀】。
//  6. 辛敞【参谋】/【从鉴】：均落在 card.use.before 上（额外目标 / 追加自己为目标）。
//  7. 荀顗：**资料未核实**。官方文德武备（理/备/果/戒/约）五个子包内查不到官方技能原文，
//     本实现按「明三礼、知朝廷大仪，唯阿意苟合于贾充、荀勖之间」的史评 + 晋势力机制
//     自拟【践雅】【举章】两条技能（非官方原文，desc 即本实现口径）。
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';

// ---------------- 通用小工具（本文件自包含，不依赖 jin.js） ----------------
let vseq = 0;
const vcard = (name, suit = 'none', num = 0) => ({
  id: `vj2${++vseq}`, name, suit, num, type: CARD_META[name]?.type, virtual: true,
});
const typeOf = (c) => CARD_META[c?.name]?.type;
const cnOf = (c) => CARD_META[c?.name]?.cn || c?.name || '?';
const isRedCard = (c) => c?.suit === 'heart' || c?.suit === 'diamond';
const colorOf = (c) => (isRedCard(c) ? 'red' : (c?.suit === 'spade' || c?.suit === 'club') ? 'black' : 'none');
const COLOR_CN = { red: '红', black: '黑', none: '无色' };
const isNormalTrick = (c) => typeOf(c) === 'trick' && !CARD_META[c?.name]?.delayed && c?.name !== 'wuxie';
const isBasic = (c) => typeOf(c) === 'basic';
const others = (g, p) => g.alive().filter(q => q !== p);
const zoneOf = (p) => [
  ...p.hand,
  ...Object.values(p.equips).filter(Boolean),
  ...(p.judgeZone || []).map(z => z.card).filter(Boolean),
];
const handUniqueMax = (g, q) => q.hand.length > 0
  && g.alive().every(x => x === q || x.hand.length < q.hand.length);
const hpUniqueMax = (g, q) => q.hp > 0
  && g.alive().every(x => x === q || x.hp < q.hp);
const handColors = (hand) => new Set(hand.map(c => colorOf(c)).filter(x => x !== 'none'));

// 从一名角色的区域里挑一张牌（由技能拥有者挑选，只返回，不移动）
const pickZoneCard = async (ctx, target, prompt) => {
  const pool = zoneOf(target);
  if (!pool.length) return null;
  const picks = await ctx.game.chooseSomeCards(ctx.self, pool, 1, { prompt, optional: false });
  return picks[0] || null;
};
// 把一张牌从某角色的区域（手牌/装备/判定）里静默取出（不触发弃置）
const takeFromZone = async (owner, c, g) => {
  const i = owner.hand.indexOf(c);
  if (i >= 0) { owner.hand.splice(i, 1); return 'hand'; }
  // ★走引擎统一出口（SG033 P0-2）：置空槽位 + 派发 equip.lose + afterEquipLose，
  //   保证飒然/降怒/精械弩等 16 个监听者能刷新（SG031 C③）。
  if (g && typeof g.unequipCard === 'function') {
    const slot = await g.unequipCard(owner, c, { reason: 'take' });
    if (slot) return slot;
  }
  const j = (owner.judgeZone || []).findIndex(z => z.card === c);
  if (j >= 0) { owner.judgeZone.splice(j, 1); return 'judge'; }
  return null;
};
// 「视为使用一张牌」的伪牌：__src 指向真实牌，便于引擎把真实牌移出手牌并正确弃置
const asCard = (real, name) => ({ ...real, name, type: CARD_META[name]?.type, virtual: true, __src: real });

// ============================================================
// ==================== 司马伷 · 才望 / 纳降 ====================
// ============================================================
// 才望：响应链上的颜色比对 → 弃置（纳降生效时改为获得）对方一张牌；
//       另附「最后一张手牌当【闪】」的转化（官方第二段，用 respond.need 实现）。
defineSkill({
  id: 'caiwang', name: '才望',
  desc: '当你使用或打出牌响应其他角色使用的牌，或其他角色使用或打出牌响应你使用的牌后，若这两张牌的颜色相同，你可以弃置其一张牌。你可以将最后一张手牌当【闪】使用或打出。',
  triggers: [
    // ① 记录「某张【杀】指定了谁」→ 后续响应比对用
    {
      on: 'target.before', who: 'any', optional: false,
      filter: (d) => !!d.card && d.card.name === 'sha' && !!d.target && !!d.self
        && d.self !== d.target && (d.self === d.player || d.target === d.player),
      async effect(ctx) {
        const d = ctx.data;
        d.target.flags.cwSha = { seat: d.self.seat, card: d.card };
      },
    },
    // ② 响应牌进入弃牌堆 → 比颜色
    {
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => !!d.self && d.self.alive && !!d.cards && d.cards.length > 0
        && !!(d.self.flags || {}).cwSha
        && (d.self === d.player || d.self.flags.cwSha.seat === d.player.seat),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const info = d.self.flags.cwSha;
        delete d.self.flags.cwSha;
        const mine = d.cards[0];
        if (!info || !info.card || colorOf(mine) !== colorOf(info.card)) return;
        // 对方 = 响应链上的另一人
        const other = d.self === p ? g.players[info.seat] : d.self;
        if (!other || other === p || !other.alive || !zoneOf(other).length) return;
        const yes = await ctx.ask.confirm(p,
          `【才望】：你打出的 ${cardLabel(mine)} 与其 ${cardLabel(info.card)} 颜色相同，是否弃置 ${other.name} 的一张牌？`);
        if (!yes) return;
        const gainMode = (p.flags.najiangSeats || {})[other.seat] === true;
        const c = await pickZoneCard(ctx, other, `【才望】：选择${gainMode ? '获得' : '弃置'}的一张牌`);
        if (!c) return;
        if (gainMode) {
          await ctx.gain(p, [c], { from: other, reason: 'caiwang' });
          await ctx.log(`【才望】：${p.name} 获得 ${other.name} 的一张牌（纳降）`);
        } else {
          await ctx.discard(other, [c], { reason: 'caiwang' });
          await ctx.log(`【才望】：${p.name} 弃置 ${other.name} 的一张牌`);
        }
      },
    },
    // ③ 最后一张手牌当【闪】
    {
      on: 'respond.need', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self.alive && d.self === d.player && d.self.hand.length === 1
        && d.player.flags.caiwangShanTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const probe = { id: 'cw_probe', name: 'shan', suit: 'heart', num: 1, type: 'basic' };
        let can = false;
        try { can = g.matchFilter(probe, d.filter, p); } catch { can = false; }
        if (!can) return;
        const real = p.hand[0];
        if (!real || real.name === 'shan') return;   // 本来就是闪 → 不必发动
        const yes = await ctx.ask.confirm(p, `【才望】：是否将最后一张手牌 ${cardLabel(real)} 当【闪】打出？`);
        if (!yes) return;
        p.flags.caiwangShanTurn = g.turnCount;
        d.handled = true;
        d.card = asCard(real, 'shan');
        await ctx.log(`【才望】：${p.name} 将最后一张手牌当【闪】打出`);
      },
    },
  ],
});

// 纳降（锁定技）：受伤/造成伤害后记录对象，才望的「弃置」对其改为「获得」直到你的回合开始。
defineSkill({
  id: 'najiang', name: '纳降',
  desc: '锁定技，当其他角色对你造成伤害后，或受到你对其造成的伤害后，你对其发动【才望】的“弃置”修改为“获得”，直到你的回合开始。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.from && !!d.to && d.from !== d.to
        && (d.from === d.player || d.to === d.player),
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        const other = d.from === p ? d.to : d.from;
        if (!other || !other.alive) return;
        p.flags.najiangSeats = { ...(p.flags.najiangSeats || {}), [other.seat]: true };
        await ctx.log(`【纳降】：${p.name} 记录 ${other.name}（【才望】改为获得其牌）`);
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => !!d.player && Object.keys(d.player.flags.najiangSeats || {}).length > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.najiangSeats = {};
        await ctx.log(`【纳降】：${p.name} 的回合开始，改为“获得”的效果结束`);
      },
    },
  ],
});

// ============================================================
// ==================== 华歆 · 草诏 / 息兵 ====================
// ============================================================
// 草诏（出牌阶段限一次）：展示一张手牌 + 声明牌名 → 体力值不大于你的角色二选一。
defineSkill({
  id: 'caozhao', name: '草诏',
  desc: '出牌阶段限一次，你可以展示一张手牌并声明一种未以此法声明过的基本牌或普通锦囊牌，令一名体力值不大于你的其他角色选择一项：1.令此牌视为你声明的牌，然后你可以将此牌交给一名其他角色；2.其失去 1 点体力。',
  active: {
    perPhase: true,
    prompt: '【草诏】：展示一张手牌并声明一种牌名',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【草诏】：没有手牌，无法发动'); return; }
      const show = (await g.chooseSomeCards(p, p.hand.slice(), 1,
        { prompt: '【草诏】：选择要展示的手牌', optional: false }))[0];
      if (!show) return;
      const declared = p.flags.caozhaoDeclared || {};
      const pool = ['sha', 'shan', 'tao', 'jiu', 'wuzhong', 'guohe', 'shunshou', 'juedou', 'jiedao', 'nanman', 'wanjian']
        .filter(n => !declared[n]);
      if (!pool.length) { await ctx.log('【草诏】：所有牌名都已声明过'); return; }
      const idx = await ctx.ask.choose(p, pool.map(n => `声明为【${CARD_META[n]?.cn || n}】`),
        { prompt: '【草诏】：声明一种未声明过的牌名' });
      if (idx < 0 || !pool[idx]) return;
      const name = pool[idx];
      p.flags.caozhaoDeclared = { ...declared, [name]: true };
      await g.revealCards([show], { reason: `【草诏】展示，声明为【${CARD_META[name]?.cn || name}】` });
      const cands = others(g, p).filter(q => q.hp <= p.hp);
      if (!cands.length) { await ctx.log('【草诏】：没有体力值不大于你的其他角色'); return; }
      const t = (await ctx.ask.targets(p, {
        candidates: cands, min: 1, max: 1,
        prompt: `【草诏】：令一名体力值不大于你的角色（声明为【${CARD_META[name]?.cn || name}】）`,
      }))[0];
      if (!t) return;
      const pick = await g.chooseOne(t,
        [`令此牌视为【${CARD_META[name]?.cn || name}】`, '失去 1 点体力'],
        { prompt: `【草诏】（${p.name}）：请选择一项` }, { optional: false });
      if (pick === 1 || pick < 0) {
        await ctx.loseHp(t, 1);
        await ctx.log(`【草诏】：${t.name} 选择失去 1 点体力`);
        return;
      }
      await ctx.log(`【草诏】：${show ? cardLabel(show) : ''} 视为【${CARD_META[name]?.cn || name}】`);
      const give = others(g, p);
      if (!give.length) return;
      const q = (await ctx.ask.targets(p, {
        candidates: give, min: 1, max: 1, prompt: '【草诏】：是否将此牌交给一名其他角色？（选人即为交给）',
      }))[0];
      if (!q) return;
      await ctx.gain(q, [show], { from: p, reason: 'caozhao' });
      await ctx.log(`【草诏】：${p.name} 将 ${cardLabel(show)} 交给 ${q.name}`);
    },
  },
});

// 息兵：受到其他角色伤害后，弃置你或其两张牌 → 手牌少者摸两张，且本回合不能指定你为目标。
defineSkill({
  id: 'xibing2', name: '息兵',
  desc: '当你受到其他角色造成的伤害后，你可以弃置你或其两张牌，然后你与其手牌较少的角色摸两张牌，以此法摸牌的角色于此回合不能使用牌指定你为目标。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => !!d.to && d.to === d.player && !!d.from && d.from !== d.player && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, src = ctx.data.from;
        if (!src.alive) return;
        const yes = await ctx.ask.confirm(p, `【息兵】：是否弃置你或 ${src.name} 的两张牌？`);
        if (!yes) return;
        const selfPool = zoneOf(p);
        const srcPool = zoneOf(src);
        const opts = [];
        if (selfPool.length >= 2) opts.push('弃置你自己的两张牌');
        if (srcPool.length >= 2) opts.push(`弃置 ${src.name} 的两张牌`);
        if (!opts.length) { await ctx.log('【息兵】：双方都不足两张牌，无法弃置'); return; }
        const idx = await g.chooseOne(p, opts, { prompt: '【息兵】：选择弃置哪一边的两张牌' }, { optional: false });
        const useSelf = idx <= 0 ? selfPool.length >= 2 : srcPool.length < 2;
        const owner = useSelf ? p : src;
        const picks = await g.chooseSomeCards(p, zoneOf(owner), 2, { prompt: '【息兵】：选择要弃置的两张牌', optional: false });
        if (picks.length) await ctx.discard(owner, picks, { reason: 'xibing2' });
        // 手牌较少者摸两张
        const fewer = p.hand.length <= src.hand.length ? p : src;
        await ctx.draw(fewer, 2, { reason: 'xibing2' });
        fewer.flags.xibingBanSeat = p.seat;
        fewer.flags.xibingBanTurn = g.turnCount;
        await ctx.log(`【息兵】：${fewer.name} 摸两张牌，本回合不能使用牌指定 ${p.name} 为目标`);
      },
    },
    // 拦截：受【息兵】影响的角色不能以你为目标
    {
      on: 'target.before', who: 'any', optional: false,
      filter: (d) => !!d.self && !!d.target && d.self !== d.target
        && d.self.flags.xibingBanSeat === d.player.seat
        && d.self.flags.xibingBanTurn === d.game.turnCount,
      async effect(ctx) {
        const d = ctx.data;
        d.canceled = true;
        await ctx.log(`【息兵】：${d.self.name} 本回合不能指定 ${ctx.self.name} 为目标`);
      },
    },
  ],
});

// ============================================================
// ==================== 石苞 · 擢升 ====================
// ============================================================
defineSkill({
  id: 'zhuosheng', name: '擢升',
  desc: '出牌阶段，当你使用本轮获得的牌时（因此技能获得的牌除外），根据此牌的类型执行：1.基本牌，此牌不计入【杀】的使用次数；2.普通锦囊牌，你可以令此牌目标 +1；3.装备牌，你摸一张牌。',
  triggers: [
    // 记录「本轮获得的牌」
    {
      on: 'cards.gain', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && !!d.cards && d.cards.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.flags.zsRound !== g.round) { p.flags.zsRound = g.round; p.flags.zsIds = []; }
        for (const c of ctx.data.cards) {
          if (ctx.data.reason === 'zhuosheng') continue;
          if (!p.flags.zsIds.includes(c.id)) p.flags.zsIds.push(c.id);
        }
      },
    },
    // 普通锦囊牌：目标 +1
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player, c = d.card, g = d.game;
        return !!p && !!c && p === d.self && g.phase === 'play'
          && p.flags.zsRound === g.round && (p.flags.zsIds || []).includes(c.id)
          && isNormalTrick(c) && (CARD_META[c.name]?.target || {}).min > 0
          && !(CARD_META[c.name]?.target || {}).self;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const used = (d.targets || []).map(t => t.seat);
        const cands = g.alive().filter(q => !used.includes(q.seat));
        if (!cands.length) return;
        const yes = await ctx.ask.confirm(p, `【擢升】：${cardLabel(d.card)} 是否令目标 +1？`);
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【擢升】：选择一个额外目标' }))[0];
        if (!t) return;
        d.extraTargets = [t.seat];
        await ctx.log(`【擢升】：${cardLabel(d.card)} 额外指定 ${t.name} 为目标`);
      },
    },
    // 基本牌：不计入次数；装备牌：摸一张牌
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player, c = d.card, g = d.game;
        return !!p && !!c && p === d.self && g.phase === 'play'
          && p.flags.zsRound === g.round && (p.flags.zsIds || []).includes(c.id);
      },
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        if (isBasic(d.card)) {
          if (d.card.name === 'sha' && (p.flags.shaUsed || 0) > 0) {
            p.flags.shaUsed = Math.max(0, (p.flags.shaUsed || 0) - 1);
            await ctx.log(`【擢升】：${cardLabel(d.card)} 不计入【杀】的使用次数`);
          }
        } else if (typeOf(d.card) === 'equip') {
          await ctx.draw(p, 1, { reason: 'zhuosheng' });
          await ctx.log(`【擢升】：${p.name} 使用本轮获得的装备牌，摸一张牌`);
        }
      },
    },
  ],
});

// ============================================================
// ==================== 羊徽瑜 · 慧容 / 慈威 / 才媛 ====================
// ============================================================
// 慧容（隐匿技 · 锁定技）：登场时令一名角色将手牌补至或弃至体力值（至多摸至 5 张）。
const HUIRONG_APPEAR = 'huirongAppeared';
const huirongEffect = async (ctx, turnCount) => {
  const p = ctx.self, g = ctx.game;
  if (p.flags[HUIRONG_APPEAR]) return;
  p.flags[HUIRONG_APPEAR] = true;
  p.flags.jin2AppearTurn = turnCount;
  await ctx.log(`【登场】：${p.name} 亮出武将牌（解除隐匿），发动【慧容】`);
  const cands = g.alive();
  if (!cands.length) return;
  const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【慧容】：令一名角色将手牌补至或弃至其体力值' }))[0]
    || p;
  const upTo = Math.min(Math.max(1, t.hp), 5);
  if (t.hand.length < upTo) {
    const n = upTo - t.hand.length;
    await ctx.draw(t, n, { reason: 'huirong' });
    await ctx.log(`【慧容】：${t.name} 摸 ${n} 张牌（补至 ${upTo}）`);
  } else if (t.hand.length > Math.max(1, t.hp)) {
    const n = t.hand.length - Math.max(1, t.hp);
    const picks = await ctx.game.chooseSomeCards(t, t.hand.slice(), n,
      { prompt: `【慧容】：弃置 ${n} 张手牌（弃至体力值 ${Math.max(1, t.hp)}）`, optional: false });
    if (picks.length) await ctx.discard(t, picks, { reason: 'huirong' });
    await ctx.log(`【慧容】：${t.name} 弃置 ${picks.length} 张牌`);
  } else {
    await ctx.log(`【慧容】：${t.name} 的手牌数已等于体力值，不调整`);
  }
};
defineSkill({
  id: 'huirong', name: '慧容',
  desc: '隐匿技，锁定技，当你登场后，你令一名角色将手牌补至或弃至其体力值（至多摸至 5 张）。',
  triggers: [
    // ① 用牌导致解除隐匿 → 登场
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && d.self.alive
        && d.self.hidden === false && d.self.flags[HUIRONG_APPEAR] !== true,
      async effect(ctx) { await huirongEffect(ctx, ctx.game.turnCount); },
    },
    // ② 自己的回合开始 → 官方隐匿规则：解除隐匿并登场
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => !!d.player && d.player.alive && d.player.hidden === true,
      async effect(ctx) {
        const p = ctx.self;
        p.hidden = false;
        await ctx.log(`${p.name} 的回合开始，解除隐匿`);
        await huirongEffect(ctx, ctx.game.turnCount);
      },
    },
    // ③ 隐匿中受伤 → 登场并结算慧容
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && d.self.hidden === true,
      async effect(ctx) {
        const p = ctx.self;
        p.hidden = false;
        await huirongEffect(ctx, ctx.game.turnCount);
      },
    },
  ],
});

// 慈威：其他角色于其回合中使用第二张牌时，若为基本牌或普通锦囊牌，可弃一张牌令此牌无效。
defineSkill({
  id: 'ciwei', name: '慈威',
  desc: '其他角色于其回合中使用第二张牌时，若此牌为基本牌或普通锦囊牌，你可以弃置一张牌，令此牌无效。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => !!d.self && !!d.player && d.self !== d.player && d.self.alive && d.player.alive
        && !!d.card && d.game.turnPlayer === d.self,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const key = `ciwei_${g.turnCount}_${d.self.seat}`;
        p.flags[key] = (p.flags[key] || 0) + 1;
        if (p.flags[key] !== 2) return;
        if (!isBasic(d.card) && !isNormalTrick(d.card)) return;
        if (!zoneOf(p).length) return;
        const yes = await ctx.ask.confirm(p,
          `【慈威】：是否弃置一张牌，令 ${d.self.name} 的 ${cardLabel(d.card)} 无效？`);
        if (!yes) return;
        const pay = (await g.chooseSomeCards(p, zoneOf(p), 1, { prompt: '【慈威】：弃置一张牌', optional: false }))[0];
        if (!pay) return;
        await ctx.discard(p, [pay], { reason: 'ciwei' });
        d.canceled = true;
        await ctx.log(`【慈威】：${p.name} 弃置 ${cardLabel(pay)}，令 ${d.self.name} 的 ${cardLabel(d.card)} 无效`);
      },
    },
  ],
});

// 才媛（锁定技）：结束阶段，若上回合结束至今未扣减过体力，摸两张牌。
defineSkill({
  id: 'caiyuan', name: '才媛',
  desc: '锁定技，结束阶段，若你于上回合结束至今未扣减过体力，你摸两张牌。',
  triggers: [
    {
      on: 'hp.lose', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player,
      async effect(ctx) { ctx.self.flags.caiyuanLost = true; },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => !!d.to && d.to === d.player,
      async effect(ctx) { ctx.self.flags.caiyuanLost = true; },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'end' && !!d.player && d.player.alive,
      async effect(ctx) {
        const p = ctx.self;
        if (p.flags.caiyuanLost) {
          p.flags.caiyuanLost = false;
          await ctx.log(`【才媛】：${p.name} 于上回合结束至今扣减过体力，不摸牌`);
          return;
        }
        await ctx.draw(p, 2, { reason: 'caiyuan' });
        await ctx.log(`【才媛】：${p.name} 未扣减过体力，摸两张牌`);
      },
    },
  ],
});

// ============================================================
// ==================== 成济&成倅 · 透髓 / 畜鸣 ====================
// ============================================================
// 透髓：将任意张牌置于牌堆底，视为使用一张需等量张【闪】抵消的【杀】。
defineSkill({
  id: 'tousui', name: '透髓',
  desc: '你可以将任意张牌置于牌堆底，视为使用一张需等量张【闪】抵消的【杀】。',
  active: {
    prompt: '【透髓】：将任意张牌置于牌堆底，视为使用【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【透髓】：没有手牌，无法发动'); return; }
      const picks = await g.chooseSomeCards(p, p.hand.slice(), p.hand.length,
        { prompt: '【透髓】：选择任意张牌置于牌堆底（逐张选择，取消即结束）', optional: true });
      if (!picks.length) return;
      for (const c of picks) {
        const i = p.hand.indexOf(c);
        if (i >= 0) p.hand.splice(i, 1);
      }
      g.deck.unshift(...picks);   // 牌堆底
      await g.checkHandChange(p);
      await ctx.log(`【透髓】：${p.name} 将 ${picks.length} 张牌置于牌堆底`);
      const vc = { ...vcard('sha', 'none', 0), needShan: picks.length };
      const cands = g.candidatesFor(p, vc, null);
      if (!cands.length) { await ctx.log('【透髓】：没有合法目标'); return; }
      const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【透髓】：选择【杀】的目标' }))[0];
      if (!t) return;
      await ctx.useCard({ from: p, card: vc, targets: [t], reason: 'tousui', ignoreRange: true, ignoreShaLimit: true });
    },
  },
  triggers: [
    // 需等量张【闪】抵消
    {
      on: 'dodge.before', who: 'any', optional: false,
      filter: (d) => !!d.self && !!d.card && (d.card.needShan || 0) > 1,
      async effect(ctx) {
        const d = ctx.data;
        d.extraDodge = (d.card.needShan || 1) - 1;
        await ctx.log(`【透髓】：此【杀】需 ${d.card.needShan} 张【闪】抵消`);
      },
    },
  ],
});

// 畜鸣（锁定技）：无实体牌伤害 +1；有实体牌则回合结束时对方把那张牌当【过河拆桥】对成济使用。
defineSkill({
  id: 'chuming', name: '畜鸣',
  desc: '锁定技，当你对其他角色造成伤害或受到其他角色的伤害时，若此伤害没有对应的实体牌，此伤害 +1；否则当前回合结束时，受到伤害的角色将造成伤害的牌当【过河拆桥】对你使用。',
  triggers: [
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => !!d.player && d.player.alive && !!d.from && !!d.to
        && ((d.from === d.player && d.to !== d.player) || (d.to === d.player && d.from !== d.player)),
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        if (!d.card) {
          d.amount = (d.amount || 1) + 1;
          p.flags.chumingMing = (p.flags.chumingMing || 0) + 1;
          await ctx.log(`【畜鸣】：此伤害没有实体牌，伤害 +1（${p.name} 获得 1 枚“鸣”）`);
          return;
        }
        const victim = d.to === p ? d.from : d.to;
        p.flags.chumingPending = [...(p.flags.chumingPending || []),
          { seat: victim.seat, cardId: d.card.id, card: d.card }];
        await ctx.log(`【畜鸣】：${victim.name} 需在本回合结束时将 ${cardLabel(d.card)} 当【过河拆桥】对 ${p.name} 使用`);
      },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => !!d.player && (d.player.flags.chumingPending || []).length > 0
        && d.self === d.game.turnPlayer,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const list = p.flags.chumingPending || [];
        p.flags.chumingPending = [];
        for (const it of list) {
          const holder = g.players[it.seat];
          if (!holder || !holder.alive || !p.alive) continue;
          const card = it.card
            || g.discardPile.find(c => c.id === it.cardId)
            || vcard('guohe', 'none', 0);
          if (card && g.discardPile.includes(card)) g.discardPile.splice(g.discardPile.indexOf(card), 1);
          const ok = await g.useCard({
            from: holder, card, asName: 'guohe', targets: [p],
            reason: 'chuming', ignoreRange: true,
          });
          if (!ok && card && !g.discardPile.includes(card)) g.discardPile.push(card);
          await ctx.log(`【畜鸣】：${holder.name} 将 ${cardLabel(card)} 当【过河拆桥】对 ${p.name} 使用`);
        }
      },
    },
  ],
});

// ============================================================
// ==================== 卫瓘 · 忠允 / 神品 ====================
// ============================================================
defineSkill({
  id: 'zhongyun', name: '忠允',
  desc: '锁定技，每回合各限一次：当你受到伤害或回复体力后，若你的体力值与手牌数相等，你回复 1 点体力或对你攻击范围内的一名角色造成 1 点伤害；当你获得或失去手牌后，若你的体力值与手牌数相等，你摸一张牌或弃置一名其他角色的一张牌。',
  triggers: [
    // ① 受伤 / 回复体力后
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => !!d.to && d.to === d.player && d.player.alive
        && d.player.hp === d.player.hand.length
        && d.player.flags.zy1 !== d.game.turnCount,
      async effect(ctx) { await zhongyunHealOrHurt(ctx); },
    },
    {
      on: 'hp.recover', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && d.player.alive
        && d.player.hp === d.player.hand.length
        && d.player.flags.zy1 !== d.game.turnCount,
      async effect(ctx) { await zhongyunHealOrHurt(ctx); },
    },
    // ② 获得 / 失去手牌后
    {
      on: 'hand.change', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && d.player.alive
        && d.player.hp === d.player.hand.length
        && d.player.flags.zy2 !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.zy2 = g.turnCount;
        const idx = await g.chooseOne(p, ['摸一张牌', '弃置一名其他角色的一张牌'],
          { prompt: `【忠允】（体力 ${p.hp} / 手牌 ${p.hand.length}）：请选择一项` }, { optional: false });
        if (idx === 1) {
          const cands = others(g, p).filter(q => zoneOf(q).length);
          if (!cands.length) { await ctx.draw(p, 1, { reason: 'zhongyun' }); return; }
          const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【忠允】：选择一名其他角色' }))[0];
          if (!t) return;
          const c = await pickZoneCard(ctx, t, '【忠允】：弃置其一张牌');
          if (c) await ctx.discard(t, [c], { reason: 'zhongyun' });
          return;
        }
        await ctx.draw(p, 1, { reason: 'zhongyun' });
        await ctx.log(`【忠允】：${p.name} 摸一张牌`);
      },
    },
  ],
});
async function zhongyunHealOrHurt(ctx) {
  const p = ctx.self, g = ctx.game;
  p.flags.zy1 = g.turnCount;
  const idx = await g.chooseOne(p, ['回复 1 点体力', '对攻击范围内的一名角色造成 1 点伤害'],
    { prompt: `【忠允】（体力 ${p.hp} / 手牌 ${p.hand.length}）：请选择一项` }, { optional: false });
  if (idx === 1) {
    const cands = others(g, p).filter(q => g.inAttackRange(p, q));
    if (!cands.length) { await ctx.log('【忠允】：攻击范围内没有其他角色'); return; }
    const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【忠允】：选择造成伤害的目标' }))[0];
    if (!t) return;
    await ctx.damage({ from: p, to: t, amount: 1, reason: 'zhongyun' });
    await ctx.log(`【忠允】：${p.name} 对 ${t.name} 造成 1 点伤害`);
    return;
  }
  if (p.hp < p.maxHp) {
    await ctx.recover(p, 1, { reason: 'zhongyun' });
    await ctx.log(`【忠允】：${p.name} 回复 1 点体力`);
  } else {
    await ctx.log(`【忠允】：${p.name} 体力已满，无法回复`);
  }
}

// 神品：判定牌生效前，打出一张与判定牌颜色不同的牌代替之。
defineSkill({
  id: 'shenpin', name: '神品',
  desc: '当一名角色的判定牌生效前，你可以打出一张与判定牌颜色不同的牌代替之。',
  triggers: [
    {
      on: 'judge.before', who: 'any', optional: false,
      filter: (d) => !!d.player && d.player.alive && !!d.card
        && d.player.hand.some(c => colorOf(c) !== colorOf(d.card) && colorOf(c) !== 'none'),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const cands = p.hand.filter(c => colorOf(c) !== colorOf(d.card) && colorOf(c) !== 'none');
        if (!cands.length) return;
        const yes = await ctx.ask.confirm(p,
          `【神品】：是否打出一张${COLOR_CN[colorOf(d.card)] === '黑' ? '红' : '黑'}色的牌，代替 ${cardLabel(d.card)}？`);
        if (!yes) return;
        const pay = (await g.chooseSomeCards(p, cands, 1, { prompt: '【神品】：选择代替的牌', optional: false }))[0];
        if (!pay) return;
        const old = { suit: d.suit, num: d.num };
        d.suit = pay.suit;
        d.num = pay.num;
        await ctx.discard(p, [pay], { reason: 'shenpin' });
        await ctx.log(`【神品】：${p.name} 以 ${cardLabel(pay)} 代替判定（原 ${SUIT_CN[old.suit] || ''}${old.num}）`);
      },
    },
  ],
});

// ============================================================
// ==================== 辛敞 · 参谋 / 从鉴 ====================
// ============================================================
defineSkill({
  id: 'canmou', name: '参谋',
  desc: '当一名角色使用普通锦囊牌指定目标时，若其手牌数为全场唯一最多，你可以为此锦囊牌选择一个额外目标。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => !!d.self && !!d.player && d.self !== d.player && d.self.alive && d.player.alive
        && isNormalTrick(d.card) && (CARD_META[d.card.name]?.target || {}).min > 0
        && !(CARD_META[d.card.name]?.target || {}).self
        && handUniqueMax(d.game, d.self),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const used = (d.targets || []).map(t => t.seat);
        const cands = g.alive().filter(q => !used.includes(q.seat));
        if (!cands.length) return;
        const yes = await ctx.ask.confirm(p,
          `【参谋】：${d.self.name} 手牌为全场唯一最多，是否为其 ${cardLabel(d.card)} 增加一个目标？`);
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【参谋】：选择额外目标' }))[0];
        if (!t) return;
        d.extraTargets = [t.seat];
        await ctx.log(`【参谋】：${p.name} 为 ${cardLabel(d.card)} 增加目标 ${t.name}`);
      },
    },
  ],
});

defineSkill({
  id: 'congjian2', name: '从鉴',
  desc: '当一名其他角色成为普通锦囊牌的唯一目标时，若其体力值是全场唯一最多的，你可以也成为此牌目标；此牌结算后，若此牌对你造成伤害，你摸两张牌。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => !!d.self && !!d.player && d.self !== d.player && d.self.alive && d.player.alive
        && isNormalTrick(d.card) && (d.targets || []).length === 1
        && d.targets[0] !== d.player && hpUniqueMax(d.game, d.targets[0])
        && (CARD_META[d.card.name]?.target || {}).min > 0,
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        const t = d.targets[0];
        const yes = await ctx.ask.confirm(p,
          `【从鉴】：${t.name} 体力为全场唯一最多，是否也成为 ${cardLabel(d.card)} 的目标？`);
        if (!yes) return;
        d.targets.push(p);
        p.flags.cjCardId = d.card.id;
        p.flags.cjTurn = ctx.game.turnCount;
        await ctx.log(`【从鉴】：${p.name} 也成为 ${cardLabel(d.card)} 的目标`);
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => !!d.to && d.to === d.player && !!d.card
        && d.card.id === d.player.flags.cjCardId
        && d.player.flags.cjTurn === d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        await ctx.draw(p, 2, { reason: 'congjian2' });
        await ctx.log(`【从鉴】：此牌对 ${p.name} 造成伤害，其摸两张牌`);
      },
    },
  ],
});

// ============================================================
// ==================== 贾充 · 凶竖 / 奸回 ====================
// ============================================================
defineSkill({
  id: 'xiongshu', name: '凶竖',
  desc: '其他角色的出牌阶段开始时，你可以弃置 X 张牌（X 为你本轮此前发动过本技能的次数），展示其一张牌，然后猜测其于此阶段内是否使用同名牌。此阶段结束时，若你猜对，你对其造成 1 点伤害；若你猜错，你获得此牌。',
  triggers: [
    {
      on: 'round.begin', who: 'any', optional: false,
      filter: (d) => !!d.player && (d.player.flags.xiongshuCount || 0) > 0,
      async effect(ctx) {
        ctx.self.flags.xiongshuCount = 0;
        await ctx.log('【凶竖】：本轮结束，发动次数重置');
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'play' && !!d.self && !!d.player
        && d.self !== d.player && d.self.alive && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.self;
        const x = p.flags.xiongshuCount || 0;
        const own = zoneOf(p);
        if (own.length < x) { await ctx.log(`【凶竖】：需弃置 ${x} 张牌，你没有足够的牌`); return; }
        if (!zoneOf(t).length) return;
        const yes = await ctx.ask.confirm(p,
          `【凶竖】：是否弃置 ${x} 张牌，展示 ${t.name} 一张牌并猜测？`);
        if (!yes) return;
        if (x > 0) {
          const pay = await g.chooseSomeCards(p, own, x, { prompt: `【凶竖】：弃置 ${x} 张牌`, optional: false });
          if (pay.length < x) { await ctx.log('【凶竖】：未能支付足够的牌'); return; }
          await ctx.discard(p, pay, { reason: 'xiongshu' });
        }
        p.flags.xiongshuCount = x + 1;
        const shown = g.rng.pick(zoneOf(t));
        await g.revealCards([shown], { reason: `【凶竖】${t.name} 的牌` });
        const guessYes = await ctx.ask.confirm(p, `【凶竖】：猜测 ${t.name} 于此阶段内是否会使用【${cnOf(shown)}】？（是 = 会使用）`);
        p.flags.xiongshu = { seat: t.seat, name: shown.name, card: shown, guess: guessYes, used: false };
        await ctx.log(`【凶竖】：${p.name} 猜测 ${t.name} 此阶段${guessYes ? '会' : '不会'}使用【${cnOf(shown)}】`);
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!d.player && !!d.self && !!d.card && !!d.player.flags.xiongshu
        && d.self.seat === d.player.flags.xiongshu.seat
        && d.card.name === d.player.flags.xiongshu.name,
      async effect(ctx) { ctx.self.flags.xiongshu.used = true; },
    },
    {
      on: 'phase.end', who: 'any', optional: false,
      filter: (d) => d.phase === 'play' && !!d.player && !!d.self && !!d.player.flags.xiongshu
        && d.self.seat === d.player.flags.xiongshu.seat,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const info = p.flags.xiongshu;
        delete p.flags.xiongshu;
        const t = g.players[info.seat];
        if (!t || !t.alive) return;
        const right = info.used === !!info.guess;
        if (right) {
          await ctx.damage({ from: p, to: t, amount: 1, reason: 'xiongshu' });
          await ctx.log(`【凶竖】：猜对，${p.name} 对 ${t.name} 造成 1 点伤害`);
        } else {
          const card = t.hand.includes(info.card) ? info.card
            : (t.equips && Object.values(t.equips).includes(info.card) ? info.card : null);
          if (card) {
            await ctx.gain(p, [card], { from: t, reason: 'xiongshu' });
            await ctx.log(`【凶竖】：猜错，${p.name} 获得 ${cardLabel(card)}`);
          } else {
            await ctx.log('【凶竖】：猜错，但该牌已不在其区域内');
          }
        }
      },
    },
  ],
});

defineSkill({
  id: 'jianhui', name: '奸回',
  desc: '锁定技，你记录上次对你造成伤害的其他角色：当你对其造成伤害后，你摸一张牌；当其对你造成伤害后，其弃置一张牌。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.player && d.player.alive && !!d.from && !!d.to && d.from !== d.to
        && (d.from === d.player || d.to === d.player),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const rec = p.flags.jianhuiSeat;
        // ① 你对其造成伤害
        if (d.from === p && d.to.seat === rec) {
          await ctx.draw(p, 1, { reason: 'jianhui' });
          await ctx.log(`【奸回】：${p.name} 对 ${d.to.name} 造成伤害，摸一张牌`);
          return;
        }
        // ② 其对你造成伤害
        if (d.to === p && d.from.seat === rec) {
          const pool = zoneOf(d.from);
          if (pool.length) {
            const c = (await g.chooseSomeCards(p, pool, 1, { prompt: `【奸回】：弃置 ${d.from.name} 的一张牌`, optional: false }))[0];
            if (c) await ctx.discard(d.from, [c], { reason: 'jianhui' });
          }
          await ctx.log(`【奸回】：${d.from.name} 对你造成伤害，其弃置一张牌`);
          return;
        }
        // ③ 记录新的伤害来源
        if (d.to === p) {
          p.flags.jianhuiSeat = d.from.seat;
          await ctx.log(`【奸回】：${p.name} 记录伤害来源 ${d.from.name}`);
        }
      },
    },
  ],
});

// ============================================================
// ==================== 王祥 · 冰心 ====================
// ============================================================
defineSkill({
  id: 'bingxin', name: '冰心',
  desc: '当你需要使用基本牌时（每种基本牌每回合限一次），若你的手牌数等于体力值且你的手牌不包含两种颜色，你可以摸一张牌，视为使用此基本牌。',
  triggers: [
    {
      on: 'respond.need', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && d.player.alive
        && d.player.hand.length === d.player.hp
        && handColors(d.player.hand).size <= 1,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const names = ['sha', 'shan', 'tao', 'jiu']
          .filter(n => p.flags[`bx_${n}_${g.turnCount}`] !== true);
        const usable = names.filter((n) => {
          try {
            return g.matchFilter({ id: `bx_${n}`, name: n, suit: 'heart', num: 1, type: 'basic' }, d.filter, p);
          } catch { return false; }
        });
        if (!usable.length) return;
        const n = usable[0];
        const yes = await ctx.ask.confirm(p, `【冰心】：是否摸一张牌，视为使用【${CARD_META[n]?.cn || n}】？`);
        if (!yes) return;
        p.flags[`bx_${n}_${g.turnCount}`] = true;
        await ctx.draw(p, 1, { reason: 'bingxin' });
        d.handled = true;
        d.card = vcard(n, 'heart', 1);
        await ctx.log(`【冰心】：${p.name} 摸一张牌，视为使用【${CARD_META[n]?.cn || n}】`);
      },
    },
  ],
});

// ============================================================
// ==================== 杨艳 · 选备 / 娴婉 ====================
// ============================================================
defineSkill({
  id: 'xuanbei', name: '选备',
  desc: '出牌阶段限一次，你可以选择一名其他角色区域内的一张牌，令其将此牌当无距离限制的【杀】对你使用。然后若此【杀】未对你造成伤害，你摸一张牌，否则你摸两张牌。',
  active: {
    perPhase: true,
    prompt: '【选备】：令一名其他角色将其一张牌当【杀】对你使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter(q => zoneOf(q).length);
      if (!cands.length) { await ctx.log('【选备】：没有区域内还有牌的其他角色'); return; }
      const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【选备】：选择一名其他角色' }))[0];
      if (!t) return;
      const c = await pickZoneCard(ctx, t, `【选备】：选择 ${t.name} 区域内的一张牌`);
      if (!c) return;
      await takeFromZone(t, c, ctx.game);
      // __src 必须指向被取出的实体牌：否则虚拟牌用完进弃牌堆、实体牌无处可去 → 牌凭空消失。
      const vc = { ...vcard('sha', c.suit, c.num), __src: c };
      p.flags.xuanbeiHurt = false;
      p.flags.xuanbeiCardId = vc.id;
      await ctx.log(`【选备】：${t.name} 将 ${cardLabel(c)} 当无距离限制的【杀】对 ${p.name} 使用`);
      const used = await ctx.useCard({ from: t, card: vc, targets: [p], reason: 'xuanbei', ignoreRange: true });
      // 使用失败（如目标本回合【杀】已用尽）时引擎提前 return、不会处理实体牌，
      // 而实体牌已被 takeFromZone 摘出 → 必须补进弃牌堆，否则牌凭空消失。
      if (used === false && !g.cardLocated(c) && !g.discardPile.includes(c)) g.pushDiscard([c]);
      const hurt = p.flags.xuanbeiHurt === true;
      if (p.alive) {
        await ctx.draw(p, hurt ? 2 : 1, { reason: 'xuanbei' });
        await ctx.log(`【选备】：${p.name} ${hurt ? '受到伤害，摸两张牌' : '未受到伤害，摸一张牌'}`);
      }
      delete p.flags.xuanbeiCardId;
    },
  },
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => !!d.to && d.to === d.player && !!d.card && !!d.player.flags.xuanbeiCardId
        && d.card.id === d.player.flags.xuanbeiCardId,
      async effect(ctx) { ctx.self.flags.xuanbeiHurt = true; },
    },
  ],
});

defineSkill({
  id: 'xianwan', name: '娴婉',
  desc: '当你需要使用【杀】或【闪】时，若你未横置，你可以横置你的武将牌，视为使用一张【闪】；若你已横置，你可以重置你的武将牌，视为使用一张【杀】。',
  triggers: [
    // 需要【闪】
    {
      on: 'dodge.before', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && d.player.alive && !d.player.chained,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const yes = await ctx.ask.confirm(p, '【娴婉】：是否横置你的武将牌，视为使用一张【闪】？');
        if (!yes) return;
        p.chained = true;
        d.dodged = true;
        await ctx.log(`【娴婉】：${p.name} 横置武将牌，视为使用一张【闪】`);
      },
    },
    // 需要【杀】
    {
      on: 'respond.need', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && d.player.alive && d.player.chained === true,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        let can = false;
        try {
          can = g.matchFilter({ id: 'xw_probe', name: 'sha', suit: 'spade', num: 1, type: 'basic' }, d.filter, p);
        } catch { can = false; }
        if (!can) return;
        const yes = await ctx.ask.confirm(p, '【娴婉】：是否重置你的武将牌，视为使用一张【杀】？');
        if (!yes) return;
        p.chained = false;
        d.handled = true;
        d.card = vcard('sha', 'spade', 7);
        await ctx.log(`【娴婉】：${p.name} 重置武将牌，视为使用一张【杀】`);
      },
    },
  ],
});

// ============================================================
// ==================== 杨芷 · 婉嫕 / 埋祸 ====================
// ============================================================
defineSkill({
  id: 'wanyi', name: '婉嫕',
  desc: '当你使用【杀】或普通锦囊牌指定唯一其他角色为目标后，你可以将其一张牌置于你的武将牌上，称为“嫕”。你不能使用与你武将牌上的牌花色相同的牌。结束阶段或当你受到伤害后，你令一名角色获得一张你武将牌上的牌。',
  triggers: [
    // ① 拿牌放到武将牌上
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && d.self.alive && !!d.card
        && (d.card.name === 'sha' || isNormalTrick(d.card))
        && (d.targets || []).length === 1 && d.targets[0] !== d.player
        && zoneOf(d.targets[0]).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data, t = d.targets[0];
        const yes = await ctx.ask.confirm(p, `【婉嫕】：是否将 ${t.name} 的一张牌置于你的武将牌上（“嫕”）？`);
        if (!yes) return;
        const c = await pickZoneCard(ctx, t, `【婉嫕】：选择 ${t.name} 的一张牌`);
        if (!c) return;
        await takeFromZone(t, c, g);
        p.flags.wyCards = [...(p.flags.wyCards || []), c];
        p.marks = { ...(p.marks || {}), wanyi: p.flags.wyCards.length };
        await ctx.log(`【婉嫕】：${p.name} 将 ${t.name} 的 ${cardLabel(c)} 置于武将牌上（“嫕”）`);
      },
    },
    // ② 不能使用与「嫕」同花色的牌
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && !!d.card
        && (d.player.flags.wyCards || []).some(c => c.suit === d.card.suit && c.suit !== 'none'),
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        d.canceled = true;
        await ctx.log(`【婉嫕】：${p.name} 不能使用与“嫕”花色（${SUIT_CN[d.card.suit] || ''}）相同的牌`);
      },
    },
    // ③ 结束阶段 / 受到伤害后 → 让一名角色获得一张「嫕」
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'end' && !!d.player && (d.player.flags.wyCards || []).length > 0,
      async effect(ctx) { await wanyiGive(ctx); },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => !!d.to && d.to === d.player && (d.player.flags.wyCards || []).length > 0,
      async effect(ctx) { await wanyiGive(ctx); },
    },
  ],
});
async function wanyiGive(ctx) {
  const p = ctx.self, g = ctx.game;
  const cards = p.flags.wyCards || [];
  if (!cards.length) return;
  const c = (await g.chooseSomeCards(p, cards.slice(), 1, { prompt: '【婉嫕】：选择一张“嫕”交给一名角色', optional: false }))[0];
  if (!c) return;
  const t = (await ctx.ask.targets(p, { candidates: g.alive(), min: 1, max: 1, prompt: '【婉嫕】：选择获得此牌的角色' }))[0];
  if (!t) return;
  p.flags.wyCards = cards.filter(x => x !== c);
  p.marks = { ...(p.marks || {}), wanyi: p.flags.wyCards.length };
  await ctx.gain(t, [c], { reason: 'wanyi' });
  await ctx.log(`【婉嫕】：${t.name} 获得“嫕”${cardLabel(c)}`);
}

// 埋祸：其他角色用实体【杀】仅指定你 → 无效并置为“祸”；其下个出牌阶段开始时对你使用此【杀】。
defineSkill({
  id: 'maihuo', name: '埋祸',
  desc: '其他角色使用实体【杀】仅指定你为目标后，若其武将牌上没有牌，你可以令此牌对你无效；其下个出牌阶段开始时，其需对你使用此【杀】（计入距离与次数）。当你对其他角色造成伤害后，移除其武将牌上的“祸”。',
  triggers: [
    // 记录这张【杀】共有几个目标（target.before 阶段拿不到完整目标表）
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => !!d.card && d.card.name === 'sha' && !d.card.virtual,
      async effect(ctx) {
        ctx.data.card.__tgtCount = (ctx.data.targets || []).length;
      },
    },
    {
      on: 'target.before', who: 'any', optional: false,
      filter: (d) => !!d.target && d.target === d.player && !!d.self && d.self !== d.player
        && !!d.card && d.card.name === 'sha' && !d.card.virtual
        && (d.used || []).length === 0 && d.card.__tgtCount === 1 && !d.self.flags.maihuoCard,
      async effect(ctx) {
        const p = ctx.self, d = ctx.data, from = d.self;
        const yes = await ctx.ask.confirm(p, `【埋祸】：是否令 ${from.name} 的这张【杀】对你无效，并置于其武将牌上（“祸”）？`);
        if (!yes) return;
        d.canceled = true;
        from.flags.maihuoCard = d.card;
        from.flags.maihuoSeat = p.seat;
        await ctx.log(`【埋祸】：此【杀】对 ${p.name} 无效，置于 ${from.name} 的武将牌上（“祸”）`);
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'play' && !!d.self && !!d.player
        && d.self !== d.player && d.self.alive && d.player.alive && !!d.self.flags.maihuoCard,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.self;
        const card = t.flags.maihuoCard;
        delete t.flags.maihuoCard;
        delete t.flags.maihuoSeat;
        const real = card && g.discardPile.includes(card) ? card : (card || vcard('sha', 'none', 0));
        if (real && g.discardPile.includes(real)) g.discardPile.splice(g.discardPile.indexOf(real), 1);
        await ctx.log(`【埋祸】：${t.name} 需对你使用“祸”${cardLabel(real)}`);
        const ok = await g.useCard({ from: t, card: real, targets: [p], reason: 'maihuo' });
        if (!ok && !g.discardPile.includes(real)) {
          g.discardPile.push(real);
          await ctx.log('【埋祸】：无法合法使用，此牌置入弃牌堆');
        }
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => !!d.from && d.from === d.player && !!d.to && d.to !== d.player
        && !!d.to.flags.maihuoCard,
      async effect(ctx) {
        const t = ctx.data.to;
        delete t.flags.maihuoCard;
        delete t.flags.maihuoSeat;
        await ctx.log(`【埋祸】：移除 ${t.name} 武将牌上的“祸”`);
      },
    },
  ],
});

// ============================================================
// ==================== 荀顗 · 践雅 / 举章（资料未核实） ====================
// ============================================================
defineSkill({
  id: 'jianya', name: '践雅',
  desc: '出牌阶段结束时，你可以令一名角色将手牌调整至其体力值（不足则摸至其体力值且至多摸至 5 张，超出则由其弃至其体力值）。',
  triggers: [
    {
      on: 'phase.end', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && !!d.player && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const yes = await ctx.ask.confirm(p, '【践雅】：是否令一名角色将手牌调整至其体力值？');
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: g.alive(), min: 1, max: 1, prompt: '【践雅】：选择一名角色' }))[0];
        if (!t) return;
        const upTo = Math.min(Math.max(1, t.hp), 5);
        if (t.hand.length < upTo) {
          await ctx.draw(t, upTo - t.hand.length, { reason: 'jianya' });
          await ctx.log(`【践雅】：${t.name} 摸至 ${upTo} 张手牌`);
        } else if (t.hand.length > Math.max(1, t.hp)) {
          const n = t.hand.length - Math.max(1, t.hp);
          const picks = await g.chooseSomeCards(t, t.hand.slice(), n, { prompt: `【践雅】：弃置 ${n} 张手牌`, optional: false });
          if (picks.length) await ctx.discard(t, picks, { reason: 'jianya' });
          await ctx.log(`【践雅】：${t.name} 弃至 ${Math.max(1, t.hp)} 张手牌`);
        } else {
          await ctx.log(`【践雅】：${t.name} 的手牌数无需调整`);
        }
      },
    },
  ],
});

defineSkill({
  id: 'juzhang', name: '举章',
  desc: '锁定技，当你成为其他角色使用的普通锦囊牌的目标后，若你的手牌数不大于该角色，你摸一张牌。',
  triggers: [
    {
      on: 'target.before', who: 'any', optional: false,
      filter: (d) => !!d.target && d.target === d.player && !!d.self && d.self !== d.player
        && !!d.card && isNormalTrick(d.card) && d.player.hand.length <= d.self.hand.length,
      async effect(ctx) {
        const p = ctx.self, src = ctx.data.self;
        await ctx.draw(p, 1, { reason: 'juzhang' });
        await ctx.log(`【举章】：${p.name} 成为 ${src.name} 的 ${cardLabel(ctx.data.card)} 的目标，摸一张牌`);
      },
    },
  ],
});
