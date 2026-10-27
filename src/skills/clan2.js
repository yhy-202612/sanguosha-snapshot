// 门阀士族（clan2）批次技能：族钟琰 / 族钟会 / 族钟毓 / 族钟繇 / 族王沦 / 族王昶
//   族王沈 / 族杨修 / 族陈群 / 族陈泰 / 族吴匡 / 族陆郁生
// 宗族技：保族（颍川钟氏）/ 中流（太原王氏，见 clan.js）/ 去惑（弘农杨氏）/ 士则（颍川陈氏）/
//         穆荫（陈留吴氏）/ 泽烈（吴郡陆氏）
// 依赖机制：player.clan + g.sameClan()、player.flags.handLimit（手牌上限）、player.flags.rangeBonus（攻击范围）
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';

// ---------------- 公用小工具 ----------------
let vseq = 0;
const VC = (name, suit = 'spade', num = 7, extra = {}) => ({
  id: `vc2_${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
// 牌名字数（如「杀」1、「无中生有」4）
const nameLen = (c) => (CARD_META[c?.name]?.cn || '').length || (c?.name ? 1 : 0);
const allCardsOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card)),
];
const isRed = (c) => c && (c.suit === 'heart' || c.suit === 'diamond');
const takeFromDiscard = (g, card) => {
  const i = g.discardPile.indexOf(card);
  if (i >= 0) g.discardPile.splice(i, 1);
  return card;
};
const detachEquip = async (g, p, c) => {
  const slot = Object.keys(p.equips).find(k => p.equips[k] === c);
  if (slot) { p.equips[slot] = null; await g.trigger('equip.lose', { self: p, card: c, slot }); }
  return !!slot;
};
const handLimitOf = (p) => p.hp + (p.flags?.handLimit || 0);
// 本回合用牌计数/牌名统计（每个将最多一个技能调用，避免重复计数）
const bumpUsed = (g, who, card) => {
  if (!who) return;
  if (who.flags.usedTurn !== g.turnCount) {
    who.flags.usedTurn = g.turnCount; who.flags.usedN = 0; who.flags.usedNames = [];
  }
  who.flags.usedN += 1;
  const cn = CARD_META[card?.name]?.cn;
  if (cn && !who.flags.usedNames.includes(cn)) who.flags.usedNames.push(cn);
};
const usedCountOf = (g, p) => (p.flags.usedTurn === g.turnCount ? (p.flags.usedN || 0) : 0);
const usedNamesOf = (g, p) => (p.flags.usedTurn === g.turnCount ? (p.flags.usedNames || []) : []);

// 目标选择：返回 [] 表示「自动目标/无目标」，null 表示玩家放弃
const chooseTargetsFor = async (ctx, p, nm, prompt) => {
  const g = ctx.game;
  const rule = CARD_META[nm]?.target;
  if (!rule || typeof rule === 'function') return [];
  if (rule.self && !rule.others && !rule.all) return [p];
  if (rule.all) return [];
  const cands = g.candidatesFor(p, { name: nm }, nm);
  if (!cands.length) return null;
  const max = Math.min(rule.max || 1, cands.length);
  const tg = await ctx.ask.targets(p, { prompt, candidates: cands, min: rule.min || 1, max: Math.max(1, max) });
  return tg.length ? tg : null;
};

// 使用一张「不在手牌里」的牌（牌堆顶 / 弃牌堆 / 他人区域挑出的牌）
const tryUse = async (ctx, p, c, reason) => {
  const g = ctx.game;
  if (!c || !CARD_META[c.name]) return false;
  const meta = CARD_META[c.name];
  if (meta.type === 'equip') {
    // 这张牌可能仍在他人手牌里（如【观骨】使用观看的他人手牌），先移出手牌再置入装备区
    for (const q of g.players) {
      const i = q.hand.indexOf(c);
      if (i >= 0) q.hand.splice(i, 1);
    }
    await g.equipCard(p, c);
    return true;
  }
  if (c.name === 'shan' || c.name === 'wuxie') { await ctx.discard(p, [c], { reason }); return false; }
  const tg = await chooseTargetsFor(ctx, p, c.name, `【${reason === 'guangu' ? '观骨' : '技能'}】：选择【${meta.cn}】的目标`);
  if (tg === null) { await ctx.discard(p, [c], { reason }); return false; }
  const ok = await ctx.useCard({ from: p, card: c, targets: tg, reason, ignoreRange: true });
  if (ok === false) await ctx.discard(p, [c], { reason });
  return ok !== false;
};

// ======================================================================
// 宗族技 · 保族（颍川钟氏：族钟琰 / 族钟会 / 族钟毓 / 族钟繇）
// 宗族技，限定技，当同族角色进入濒死状态时，你可以令其横置并回复 1 点体力。
// ======================================================================
defineSkill({
  id: 'baozu', name: '保族',
  desc: '宗族技，限定技，当同族角色进入濒死状态时，你可以令其横置并回复1点体力。',
  triggers: [{
    on: 'dying.begin', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player, dy = d.self;
      if (!p || !dy || p.flags.baozuUsed) return false;
      return d.game.sameClan(p, dy);
    },
    async effect(ctx) {
      const p = ctx.self, dy = ctx.data.self;
      p.flags.baozuUsed = true;
      dy.chained = true;
      await ctx.log(`【保族】：${p.name} 令同族角色 ${dy.name} 横置并回复1点体力（限定技）`);
      await ctx.recover(dy, 1);
    },
  }],
});

// ======================================================================
// 族钟琰 · 观骨（转换技，出牌阶段限一次）
// 阳：观看牌堆顶至多四张牌；阴：观看一名角色至多四张手牌。然后你可以使用其中一张牌。
// ======================================================================
defineSkill({
  id: 'guangu', name: '观骨',
  desc: '转换技，出牌阶段限一次，阳：你可以观看牌堆顶至多四张牌；阴：你可以观看一名角色至多四张手牌。然后你可以使用其中一张牌。',
  active: {
    perTurn: true,
    prompt: '观骨：阳——观看牌堆顶；阴——观看一名角色的手牌，然后可使用其中一张',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const yin = !!p.flags.guanguYin;
      p.flags.guanguYin = !yin;         // 转换技状态翻转
      let view = [];
      if (yin) {
        const t = (await ctx.ask.targets(p, {
          prompt: '【观骨】（阴）：选择一名角色，观看其至多四张手牌',
          candidates: g.alive().filter(x => x.hand.length > 0), min: 1, max: 1,
        }))[0];
        if (!t) { p.flags.guanguYin = yin; await ctx.log('【观骨】：没有可选择的目标'); return; }
        const n = Math.min(4, t.hand.length);
        const picks = [];
        const pool = t.hand.slice();
        for (let i = 0; i < n && pool.length; i++) {
          const idx = await ctx.ask.choose(p, pool.map(c => cardLabel(c)), { prompt: `【观骨】：观看 ${t.name} 的手牌（${i + 1}/${n}）`, reason: 'guangu' });
          if (idx < 0 || !pool[idx]) break;
          picks.push(pool.splice(idx, 1)[0]);
        }
        view = picks;
        await ctx.log(`【观骨】（阴）：观看 ${t.name} 的 ${picks.length} 张手牌（${picks.map(cardLabel).join('、')}）`);
        p.flags.guanguCount = picks.length;
        if (!picks.length) return;
        const [c] = await g.chooseSomeCards(p, picks, 1, { prompt: '【观骨】：可以使用其中一张牌' });
        if (!c) return;
        // 使用的手牌按正常流程从手牌移除
        await tryUse(ctx, p, c, 'guangu');
        return;
      }
      const n = Math.min(4, g.deck.length);
      if (!n) { p.flags.guanguYin = yin; await ctx.log('【观骨】：牌堆为空'); return; }
      view = g.deck.slice(-n).reverse();   // 牌堆顶（数组末尾）优先展示
      p.flags.guanguCount = view.length;
      await ctx.log(`【观骨】（阳）：观看牌堆顶 ${view.length} 张牌（${view.map(cardLabel).join('、')}）`);
      const [c] = await g.chooseSomeCards(p, view, 1, { prompt: '【观骨】：可以使用其中一张牌' });
      if (!c) return;
      const i = g.deck.indexOf(c);
      if (i >= 0) g.deck.splice(i, 1);
      await tryUse(ctx, p, c, 'guangu');
    },
  },
});

// ======================================================================
// 族钟琰 · 啸咏（锁定技）
// 当你回合内首次使用牌名字数为 X 的牌时（X 为上次【观骨】观看牌数），你视为未发动【观骨】。
// ======================================================================
defineSkill({
  id: 'xiaoyong', name: '啸咏',
  desc: '锁定技，当你回合内首次使用牌名字数为X的牌时（X为上次【观骨】观看牌数），你视为未发动【观骨】。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => {
      const p = d.player, x = p.flags.guanguCount;
      if (!x || d.game.turnPlayer !== p) return false;
      if (p.flags.xiaoyongTurn === d.game.turnCount) return false;
      return nameLen(d.card) === x;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.xiaoyongTurn = g.turnCount;
      delete p.flags.act_guangu;
      await ctx.log(`【啸咏】：使用${cardLabel(ctx.data.card)}（${nameLen(ctx.data.card)}字），你视为未发动【观骨】`);
    },
  }],
});

// ======================================================================
// 族钟会 · 迂志（锁定技）
// 每轮开始时，你展示一张手牌并摸X张牌（X为此牌牌名字数）。
// 你的回合结束时，你弃置以此法展示的手牌；若你本轮使用牌数小于X，你受到1点雷电伤害或失去宗族技。
// ======================================================================
defineSkill({
  id: 'yuzhi', name: '迂志',
  desc: '锁定技，每轮开始时，你展示一张手牌并摸X张牌（X为此牌牌名字数）。你的回合结束时，你弃置以此法展示的手牌，若你本轮使用牌数小于X，你受到1点雷电伤害或失去宗族技【保族】。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { bumpUsed(ctx.game, ctx.self, ctx.data.card); },
    },
    {
      on: 'round.begin', who: 'any', optional: false,
      filter: (d) => d.player.hand.length > 0 && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const [c] = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【迂志】：选择一张展示的手牌' });
        if (!c) return;
        const x = Math.max(1, nameLen(c));
        p.flags.yuzhi = { id: c.id, x, turn: g.turnCount };
        await ctx.log(`【迂志】：展示 ${cardLabel(c)}（${x}字），摸 ${x} 张牌`);
        await ctx.draw(p, x, { reason: 'yuzhi' });
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => !!d.player.flags.yuzhi,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const rec = p.flags.yuzhi;
        if (!rec) return;
        p.flags.yuzhi = null;
        const shown = p.hand.find(c => c.id === rec.id);
        if (shown) {
          await ctx.discard(p, [shown], { reason: 'yuzhi' });
          await ctx.log(`【迂志】：弃置展示的 ${cardLabel(shown)}`);
        }
        const used = usedCountOf(g, p);
        if (used >= rec.x) return;
        await ctx.log(`【迂志】：本轮使用牌数 ${used} < ${rec.x}`);
        const idx = await ctx.ask.choose(p, ['受到1点雷电伤害', '失去宗族技【保族】'], { prompt: '【迂志】：请选择一项', reason: 'yuzhi' });
        if (idx === 1 || !effSkills(p).some(s => s.id === 'baozu')) {
          p.skills = p.skills.filter(s => s.id !== 'baozu');
          await ctx.log('【迂志】：你失去宗族技【保族】');
        } else {
          await ctx.damage({ from: p, to: p, amount: 1, nature: 'thunder', reason: 'yuzhi' });
        }
      },
    },
  ],
});

// ======================================================================
// 族钟会 · 挟术
// 当你造成或受到牌的伤害后，你可以横置。若如此做，你弃置X张牌并摸你已损失体力值张牌
// （X为此牌牌名字数）。当你以此法摸牌后，若本回合有角色进入过濒死状态，此技能失效至回合结束。
// ======================================================================
defineSkill({
  id: 'xieshu', name: '挟术',
  desc: '当你造成或受到牌的伤害后，你可以横置。若如此做，你弃置X张牌并摸你已损失体力值张牌（X为此牌牌名字数）。当你以此法摸牌后，若本回合有角色进入过濒死状态，此技能失效至本回合结束。',
  triggers: [
    {
      on: 'dying.begin', who: 'any', optional: false,
      filter: () => true,
      async effect(ctx) { ctx.game.__clan2DyingTurn = ctx.game.turnCount; },
    },
    {
      on: 'damage.after', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player;
        if (!p || !d.card) return false;
        if (p.chained) return false;
        if (p.flags.xieshuOff === d.game.turnCount) return false;
        return d.self === p || d.from === p;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, c = ctx.data.card;
        p.chained = true;
        await ctx.log(`【挟术】：${p.name} 横置`);
        const x = Math.max(1, nameLen(c));
        const pool = allCardsOf(p);
        const picks = await g.chooseSomeCards(p, pool, Math.min(x, pool.length), { prompt: `【挟术】：弃置 ${x} 张牌` });
        if (picks.length) await ctx.discard(p, picks, { reason: 'xieshu' });
        const lost = Math.max(0, p.maxHp - p.hp);
        if (lost > 0) await ctx.draw(p, lost, { reason: 'xieshu' });
        await ctx.log(`【挟术】：弃置 ${picks.length} 张牌，摸 ${lost} 张牌`);
        if (g.__clan2DyingTurn === g.turnCount) {
          p.flags.xieshuOff = g.turnCount;
          await ctx.log('【挟术】：本回合已有角色进入过濒死状态，此技能失效至回合结束');
        }
      },
    },
  ],
});

// ======================================================================
// 族钟毓 · 捷谏
// 当你每回合使用第X张牌指定目标后，若不为装备牌，你可以令其中一个目标摸X张牌（X为此牌牌名字数）。
// ======================================================================
defineSkill({
  id: 'jiejian', name: '捷谏',
  desc: '当你每回合使用第X张牌指定目标后，若此牌不为装备牌，你可以令其中一个目标摸X张牌（X为此牌牌名字数）。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { bumpUsed(ctx.game, ctx.self, ctx.data.card); },
    },
    {
      on: 'target.after', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player, c = d.card, g = d.game;
        if (!c || d.self !== p || !d.target) return false;
        const meta = CARD_META[c.name];
        if (!meta || meta.type === 'equip') return false;
        const x = nameLen(c);
        return usedCountOf(g, p) === x && p.flags.jjTurn !== g.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.target, x = nameLen(ctx.data.card);
        p.flags.jjTurn = g.turnCount;
        await ctx.draw(t, x, { reason: 'jiejian' });
        await ctx.log(`【捷谏】：${t.name} 摸 ${x} 张牌`);
      },
    },
  ],
});

// ======================================================================
// 族钟毓 · 惶汗
// 当你受到牌的伤害后，你可以摸X张牌（X为此牌牌名字数）并弃置你已损失体力值张牌。
// 若不为你本回合首次发动此技能，你复原宗族技【保族】。
// ======================================================================
defineSkill({
  id: 'huanghan', name: '惶汗',
  desc: '当你受到牌的伤害后，你可以摸X张牌（X为此牌牌名字数），然后弃置你已损失体力值张牌。若不为你本回合首次发动此技能，你复原宗族技【保族】。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => !!d.card,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const first = p.flags.hhTurn !== g.turnCount;
      p.flags.hhTurn = g.turnCount;
      const x = Math.max(1, nameLen(ctx.data.card));
      await ctx.draw(p, x, { reason: 'huanghan' });
      const lost = Math.max(0, p.maxHp - p.hp);
      if (lost > 0) {
        const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(lost, p.hand.length), { prompt: `【惶汗】：弃置 ${lost} 张牌` });
        if (picks.length) await ctx.discard(p, picks, { reason: 'huanghan' });
      }
      await ctx.log(`【惶汗】：摸 ${x} 张牌，弃置 ${lost} 张牌`);
      if (!first && getSkill('baozu')) {
        delete p.flags.baozuUsed;
        await ctx.log('【惶汗】：本回合非首次发动，视为未发动宗族技【保族】');
      }
    },
  }],
});

// ======================================================================
// 族钟繇 · 承启
// 你可以将至少两张手牌当一张本回合未使用过、牌名字数不大于 X 的基本牌或普通锦囊牌使用；
// 若转化后的牌名字数等于 X，你令一名角色摸一张牌（X 为转化前的牌名字数之和）。
// ======================================================================
defineSkill({
  id: 'chengqi', name: '承启',
  desc: '你可以将至少两张手牌（本实现取两张）当一张本回合未使用过、牌名字数不大于X的基本牌或普通锦囊牌使用；若转化后的牌名字数等于X，你令一名角色摸一张牌（X为转化前的牌名字数之和）。',
  active: {
    prompt: '承启：将两张手牌当一张本回合未使用过的基本牌或普通锦囊牌使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.hand.length < 2) { await ctx.log('【承启】：至少需要两张手牌'); return; }
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 2, { prompt: '【承启】：选择两张手牌作为转化的牌' });
      if (picks.length < 2) return;
      const X = picks.reduce((s, c) => s + nameLen(c), 0);
      const usedNames = usedNamesOf(g, p);
      const pool = ['sha', 'tao', 'jiu', 'wuzhong', 'guohe', 'shunshou', 'juedou', 'huogong', 'jiedao', 'nanman', 'wanjian', 'taoyuan', 'wugu']
        .filter(n => CARD_META[n] && CARD_META[n].cn.length <= X && !usedNames.includes(CARD_META[n].cn));
      if (!pool.length) { await ctx.log(`【承启】：没有牌名字数不超过 ${X} 且本回合未使用过的牌`); return; }
      const labels = pool.map(n => `【${CARD_META[n].cn}】（${CARD_META[n].cn.length}字）`);
      labels.push('不转化');
      const idx = await ctx.ask.choose(p, labels, { prompt: `【承启】：转化前牌名字数之和 ${X}，选择转化的牌`, reason: 'chengqi' });
      const nm = pool[idx];
      if (!nm) return;
      const tg = await chooseTargetsFor(ctx, p, nm, `【承启】：选择【${CARD_META[nm].cn}】的目标`);
      if (tg === null) return;
      for (const c of picks) {
        const i = p.hand.indexOf(c);
        if (i >= 0) p.hand.splice(i, 1);
      }
      await ctx.discard(p, picks, { reason: 'chengqi' });
      const ok = await ctx.useCard({
        from: p, card: VC(nm, picks[0].suit, picks[0].num), targets: tg, reason: 'chengqi', ignoreRange: true,
      });
      if (ok === false) return;
      await ctx.log(`【承启】：将 ${picks.length} 张手牌当【${CARD_META[nm].cn}】使用`);
      if (CARD_META[nm].cn.length === X) {
        const t = (await ctx.ask.targets(p, { prompt: '【承启】：令一名角色摸一张牌', candidates: g.alive(), min: 1, max: 1 }))[0] || p;
        await ctx.draw(t, 1, { reason: 'chengqi' });
        await ctx.log(`【承启】：牌名字数相等，${t.name} 摸一张牌`);
      }
    },
  },
});

// ======================================================================
// 族钟繇 · 诫厉
// 结束阶段，你可以观看一名角色牌名字数最多的手牌和牌堆顶的X张牌（X为你本回合使用的牌名字数最大值），
// 然后你可以交换两者中等量的牌。
// ======================================================================
defineSkill({
  id: 'jieli', name: '诫厉',
  desc: '结束阶段，你可以观看一名角色牌名字数最多的手牌和牌堆顶的X张牌（X为你本回合使用的牌名字数最大值），然后你可以交换两者中的一张牌。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { bumpUsed(ctx.game, ctx.self, ctx.data.card); },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && usedNamesOf(d.game, d.player).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const names = usedNamesOf(g, p);
        const x = Math.min(4, Math.max(...names.map(n => n.length), 1), g.deck.length);
        if (!x) return;
        const t = (await ctx.ask.targets(p, { prompt: '【诫厉】：选择一名角色', candidates: g.alive(), min: 1, max: 1 }))[0];
        if (!t || !t.hand.length) { await ctx.log('【诫厉】：其没有手牌'); return; }
        const hc = t.hand.slice().sort((a, b) => nameLen(b) - nameLen(a))[0];
        const top = g.deck.slice(-x).reverse();
        await ctx.log(`【诫厉】：观看 ${t.name} 的 ${cardLabel(hc)} 与牌堆顶 ${top.map(cardLabel).join('、')}`);
        const yes = await ctx.ask.confirm(p, '【诫厉】：是否将其手牌与牌堆顶的一张牌交换？');
        if (!yes) return;
        const other = top[0];
        if (!other) return;
        const i = t.hand.indexOf(hc);
        if (i >= 0) t.hand.splice(i, 1);
        const j = g.deck.indexOf(other);
        if (j >= 0) g.deck.splice(j, 1);
        g.deck.push(hc);        // 置于牌堆顶
        t.hand.push(other);
        await ctx.log(`【诫厉】：${cardLabel(hc)} 置于牌堆顶，${t.name} 获得牌堆顶的 ${cardLabel(other)}`);
      },
    },
  ],
});

// ======================================================================
// 族王沦 · 求心
// 出牌阶段限一次，你可以令一名其他角色声明一项：1.你对其使用一张【杀】；2.你对其使用任意普通锦囊牌。
// 你下次执行此项后视为执行另一项。
// ======================================================================
defineSkill({
  id: 'qiuxin', name: '求心',
  desc: '出牌阶段限一次，你可以令一名其他角色声明一项：1.你对其使用一张【杀】；2.你对其使用任意普通锦囊牌。你下次执行此项后视为执行另一项。',
  active: {
    perPhase: true,
    prompt: '求心：令一名其他角色声明一项（杀 / 普通锦囊）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) { await ctx.log('【求心】：没有其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【求心】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, ['你对其使用一张【杀】', '你对其使用任意普通锦囊牌'], { prompt: '【求心】：请声明一项', reason: 'qiuxin' });
      const kind = idx === 1 ? 'trick' : 'sha';
      p.flags.qiuxin = { seat: t.seat, kind };
      await ctx.log(`【求心】：${t.name} 声明「${kind === 'sha' ? '你对其使用一张【杀】' : '你对其使用任意普通锦囊牌'}」`);
    },
  },
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => {
      const p = d.player, q = p.flags.qiuxin, c = d.card;
      if (!q || !c) return false;
      const meta = CARD_META[c.name];
      const hit = q.kind === 'sha' ? c.name === 'sha' : (meta?.type === 'trick' && !meta.delayed);
      if (!hit) return false;
      const tgs = d.targets || [];
      return tgs.some(t => t && t.seat === q.seat);
    },
    async effect(ctx) {
      const p = ctx.self, q = p.flags.qiuxin;
      if (!q) return;
      q.kind = q.kind === 'sha' ? 'trick' : 'sha';
      await ctx.log(`【求心】：已执行声明项，下一位视为声明「${q.kind === 'sha' ? '你对其使用一张【杀】' : '你对其使用任意普通锦囊牌'}」`);
    },
  }],
});

// ======================================================================
// 族王沦 · 简远
// 当一名角色发动“出牌阶段限一次”的技能后，你可以令其重铸任意张牌名字数为X的牌（X为其本阶段使用牌数）。
// ======================================================================
const isPerTurnActive = (reason) => {
  const sk = reason ? getSkill(reason) : null;
  // 「出牌阶段限一次」的主动技现在有两种合法声明：perTurn（每回合）与 perPhase（每出牌阶段，SG025 #11），
  // 本技能的原意是「刚发动过一个出牌阶段限一次的主动技」，两者都必须认
  return !!(sk && sk.active && (sk.active.perTurn || sk.active.perPhase));
};
defineSkill({
  id: 'jianyuan', name: '简远',
  desc: '当一名角色发动“出牌阶段限一次”的技能后，你可以令其重铸任意张牌名字数为X的牌（X为其本阶段使用牌数）。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { bumpUsed(ctx.game, ctx.self, ctx.data.card); },
    },
    {
      on: 'cards.discard', who: 'any', optional: true,
      filter: (d) => {
        const q = d.self, g = d.game;
        if (!q || !q.alive) return false;
        if (!isPerTurnActive(d.reason)) return false;
        if (g.turnPlayer !== q) return false;
        return q.flags.jyTurn !== g.turnCount && q.hand.length > 0;
      },
      async effect(ctx) {
        const q = ctx.data.self, g = ctx.game;
        q.flags.jyTurn = g.turnCount;
        const x = usedCountOf(g, q);
        const cands = q.hand.filter(c => nameLen(c) === x);
        if (!cands.length) { await ctx.log(`【简远】：其本阶段使用牌数 ${x}，没有名字数为 ${x} 的牌可重铸`); return; }
        const picks = await g.chooseSomeCards(q, cands, cands.length, { prompt: `【简远】：可重铸任意张名字数为 ${x} 的牌` });
        if (!picks.length) return;
        await ctx.discard(q, picks, { reason: 'jianyuan' });
        await ctx.draw(q, picks.length, { reason: 'jianyuan' });
        await ctx.log(`【简远】：${q.name} 重铸 ${picks.length} 张牌`);
      },
    },
  ],
});

// ======================================================================
// 族王昶 · 开济
// 出牌阶段限一次，你可以令一名本轮未以此法指定过的角色弃置你一张手牌，
// 然后你可以使用弃置的牌，若如此做，你摸一张牌。
// ======================================================================
defineSkill({
  id: 'kaiji', name: '开济',
  desc: '出牌阶段限一次，你可以令一名本轮未以此法指定过的角色弃置你一张手牌，然后你可以使用被弃置的牌；若如此做，你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '开济：令一名角色弃置你一张手牌，然后你可以使用之',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.flags.kaijiRound || p.flags.kaijiRound.round !== g.round) p.flags.kaijiRound = { round: g.round, ids: [] };
      if (!p.hand.length) { await ctx.log('【开济】：你没有手牌'); return; }
      const cands = g.alive().filter(x => x !== p && !p.flags.kaijiRound.ids.includes(x.id));
      if (!cands.length) { await ctx.log('【开济】：本轮已对每名角色使用过'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【开济】：选择一名本轮未以此法指定过的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.kaijiRound.ids.push(t.id);
      const [c] = await g.chooseSomeCards(t, p.hand.slice(), 1, { prompt: `【开济】：弃置 ${p.name} 一张手牌` });
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'kaiji' });
      await ctx.log(`【开济】：${t.name} 弃置了你的 ${cardLabel(c)}`);
      const yes = await ctx.ask.confirm(p, `【开济】：是否使用 ${cardLabel(c)}？`);
      if (!yes) return;
      takeFromDiscard(g, c);
      const ok = await tryUse(ctx, p, c, 'kaiji');
      if (ok) {
        await ctx.draw(p, 1, { reason: 'kaiji' });
        await ctx.log('【开济】：你摸一张牌');
      }
    },
  },
});

// ======================================================================
// 族王沈 · 岸然
// 出牌阶段开始时或你受到伤害后，你可以选择一项：1.摸X张牌；2.令至多X名角色各摸一张牌。
// （X为此技能发动次数且至多为4；本实现未实装「下一张牌不能是这些牌」的出牌限制）
// ======================================================================
const anranEffect = async (ctx) => {
  const p = ctx.self, g = ctx.game;
  p.flags.anranN = Math.min(4, (p.flags.anranN || 0) + 1);
  const x = p.flags.anranN;
  const idx = await ctx.ask.choose(p, [`你摸 ${x} 张牌`, `令至多 ${x} 名角色各摸一张牌`], { prompt: `【岸然】：第 ${x} 次发动，请选择一项`, reason: 'anran' });
  if (idx === 1) {
    const cands = g.alive();
    const tg = await g.chooseTargets(p, { prompt: `【岸然】：选择至多 ${x} 名角色`, candidates: cands, min: 1, max: Math.min(x, cands.length) });
    for (const t of tg) {
      const got = await ctx.draw(t, 1, { reason: 'anran' });
      if (got && got.length) t.flags.anranBlock = { turn: g.turnCount, ids: got.map(c => c.id) };
    }
    await ctx.log(`【岸然】：${tg.map(t => t.name).join('、') || '没有角色'} 各摸一张牌`);
    return;
  }
  const drawn = await ctx.draw(p, x, { reason: 'anran' });
  if (drawn && drawn.length) p.flags.anranBlock = { turn: g.turnCount, ids: drawn.map(c => c.id) };
  await ctx.log(`【岸然】：你摸 ${x} 张牌`);
};
defineSkill({
  id: 'anran', name: '岸然',
  desc: '出牌阶段开始时或你受到伤害后，你可以选择一项：1.摸X张牌；2.令至多X名角色各摸一张牌。以此法获得牌的角色本回合使用的下一张牌不能是这些牌（X为此技能发动次数且至多为4）。',
  triggers: [
    { on: 'phase.begin', who: 'self', optional: true, filter: (d) => d.phase === 'play', effect: anranEffect },
    { on: 'damage.after', who: 'self', optional: true, filter: () => true, effect: anranEffect },
    // 限制：以此法获得的牌，本回合作为「使用的下一张牌」时不能使用（打出/响应不受限）
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => {
        const q = d.self, g = d.game, c = d.card;
        if (!q || !c) return false;
        const rec = q.flags.anranBlock;
        return !!(rec && rec.turn === g.turnCount && rec.ids.includes(c.id));
      },
      async effect(ctx) {
        ctx.data.canceled = true;
        const q = ctx.data.self;
        // 「下一张牌不能是这些牌」：被拦下这一张后本回合的限制即视为已满足（避免 AI 反复撞墙）
        delete q.flags.anranBlock;
        await ctx.log(`【岸然】：${cardLabel(ctx.data.card)} 是【岸然】获得的牌，本回合不能作为使用的下一张牌`);
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => {
        const q = d.self;
        return !!(q && q.flags.anranBlock && d.card && !q.flags.anranBlock.ids.includes(d.card.id));
      },
      async effect(ctx) { delete ctx.data.self.flags.anranBlock; },
    },
  ],
});

// ======================================================================
// 族王沈 · 告变（锁定技）
// 其他角色回合结束时，若本回合仅有一名角色受到过伤害，此受伤角色须使用本回合进入弃牌堆的一张【杀】，
// 或失去1点体力。
// ======================================================================
defineSkill({
  id: 'gaobian', name: '告变',
  desc: '锁定技，其他角色回合结束时，若本回合仅有一名角色受到过伤害，此受伤角色须使用本回合进入弃牌堆的一张【杀】，或失去1点体力。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: () => true,
      async effect(ctx) {
        const g = ctx.game, p = ctx.self, v = ctx.data.self;
        if (!p.flags.gbTurn || p.flags.gbTurn.turn !== g.turnCount) p.flags.gbTurn = { turn: g.turnCount, seats: [] };
        if (v && !p.flags.gbTurn.seats.includes(v.seat)) p.flags.gbTurn.seats.push(v.seat);
      },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, g = d.game;
        if (!p || d.self === p) return false;      // 其他角色的回合结束时
        const rec = p.flags.gbTurn;
        return !!(rec && rec.turn === g.turnCount && rec.seats.length === 1);
      },
      async effect(ctx) {
        const g = ctx.game, rec = ctx.self.flags.gbTurn;
        const victim = g.players[rec.seats[0]];
        if (!victim || !victim.alive) return;
        const sha = g.discardPile.find(c => c.name === 'sha');
        const cands = sha ? g.alive().filter(x => x !== victim && g.inAttackRange(victim, x)) : [];
        if (sha && cands.length) {
          takeFromDiscard(g, sha);
          const t = cands[0];
          await ctx.log(`【告变】：本回合仅 ${victim.name} 受到过伤害，其须使用弃牌堆中的一张【杀】`);
          const ok = await ctx.useCard({ from: victim, card: sha, targets: [t], reason: 'gaobian', ignoreShaLimit: true });
          if (ok === false) {
            if (!g.discardPile.includes(sha)) g.discardPile.push(sha);
            await ctx.loseHp(victim, 1);
          }
          return;
        }
        await ctx.log(`【告变】：本回合仅 ${victim.name} 受到过伤害，其无法使用【杀】，失去1点体力`);
        await ctx.loseHp(victim, 1);
      },
    },
  ],
});

// ======================================================================
// 族杨修 · 捷悟
// 出牌阶段开始时，你可以令一名角色的手牌于本阶段始终对你可见；然后你于本阶段使用牌指定其他角色
// 为目标后，你可以展示该角色的一张手牌：若两张牌花色相同，你摸一张牌；若此牌本回合以此法被展示过，
// 你将你与其之中手牌较多的角色的一张手牌置于牌堆顶。
// ======================================================================
defineSkill({
  id: 'jiewu', name: '捷悟',
  desc: '出牌阶段开始时，你可以令一名角色的手牌于本阶段始终对你可见；然后你于此阶段使用牌指定其他角色为目标后，你可以展示该角色的一张手牌。若这两张牌花色相同，你摸一张牌；若此牌本回合以此法被展示过，你将你与其之中手牌较多的角色的一张手牌置于牌堆顶。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const t = (await ctx.ask.targets(p, { prompt: '【捷悟】：选择手牌对你可见的角色', candidates: g.alive(), min: 1, max: 1 }))[0] || p;
        p.flags.jiewu = { seat: t.seat, turn: g.turnCount, shown: [], n: 0 };
        await ctx.log(`【捷悟】：${t.name} 的手牌于此阶段对你可见`);
      },
    },
    {
      on: 'target.after', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player, jw = p.flags.jiewu;
        return !!(jw && jw.turn === d.game.turnCount && d.card && d.target && d.target !== p);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, jw = p.flags.jiewu;
        const t = g.players[jw.seat];
        if (!t || !t.hand.length) return;
        const [c] = await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【捷悟】：展示其一张手牌' });
        if (!c) return;
        jw.n = (jw.n || 0) + 1;
        await ctx.log(`【捷悟】：展示 ${t.name} 的 ${cardLabel(c)}`);
        if (c.suit === ctx.data.card.suit) {
          await ctx.draw(p, 1, { reason: 'jiewu' });
          await ctx.log('【捷悟】：花色相同，你摸一张牌');
        }
        if (jw.shown.includes(c.id)) {
          const holder = p.hand.length >= t.hand.length ? p : t;
          const [hc] = await g.chooseSomeCards(holder, holder.hand.slice(), 1, { prompt: '【捷悟】：将一张手牌置于牌堆顶' });
          if (hc) {
            const i = holder.hand.indexOf(hc);
            if (i >= 0) holder.hand.splice(i, 1);
            g.deck.push(hc);
            await ctx.log(`【捷悟】：将 ${holder.name} 的 ${cardLabel(hc)} 置于牌堆顶`);
          }
        } else {
          jw.shown.push(c.id);
        }
      },
    },
  ],
});

// ======================================================================
// 族杨修 · 高视
// 结束阶段，你可以依次亮出牌堆顶的牌，直到亮出了本回合你使用过的牌名或X张牌
// （X为本回合你发动【捷悟】的次数），然后你可以使用其中的任意张牌；若你使用了所有亮出的牌，你摸两张牌。
// ======================================================================
defineSkill({
  id: 'gaoshi', name: '高视',
  desc: '结束阶段，你可以依次亮出牌堆顶的牌，直到亮出了本回合你使用过的牌名或X张牌（X为本回合你发动【捷悟】的次数），然后你可以使用其中的任意张牌。若你使用了所有亮出的牌，你摸两张牌。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { bumpUsed(ctx.game, ctx.self, ctx.data.card); },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && ((d.player.flags.jiewu && d.player.flags.jiewu.turn === d.game.turnCount && d.player.flags.jiewu.n > 0) || false),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = Math.min(p.flags.jiewu?.n || 0, g.deck.length);
        if (!x) return;
        const names = usedNamesOf(g, p);
        const revealed = [];
        for (let i = 0; i < x; i++) {
          const c = g.deck.pop();
          if (!c) break;
          revealed.push(c);
          if (names.includes(CARD_META[c.name]?.cn)) break;
        }
        if (!revealed.length) return;
        await ctx.log(`【高视】：亮出 ${revealed.map(cardLabel).join('、')}`);
        let usedAny = 0;
        for (const c of revealed.slice()) {
          const yes = await ctx.ask.confirm(p, `【高视】：是否使用 ${cardLabel(c)}？`);
          if (!yes) break;
          const i = revealed.indexOf(c);
          if (i >= 0) revealed.splice(i, 1);
          if (await tryUse(ctx, p, c, 'gaoshi')) usedAny++;
          // tryUse 在「取消目标 / 使用失败 / 闪与无懈」分支里已把牌弃置进弃牌堆，
          // 此时不能再放回牌堆（否则同一张牌同时存在于牌堆与弃牌堆）。
          else if (!g.discardPile.includes(c)) revealed.push(c);
        }
        if (revealed.length) g.deck.push(...revealed);
        else if (usedAny) {
          await ctx.draw(p, 2, { reason: 'gaoshi' });
          await ctx.log('【高视】：使用了所有亮出的牌，摸两张牌');
        }
      },
    },
  ],
});

// ======================================================================
// 族杨修 · 去惑（宗族技）
// 当你每回合首次不因使用、打出或弃置而失去手牌中的【酒】或装备牌后，
// 你可以令一名同族角色回复1点体力。
// ======================================================================
defineSkill({
  id: 'quhuo', name: '去惑',
  desc: '宗族技，当你每回合首次不因使用、打出或弃置而失去手牌中的【酒】或装备牌后，你可以令一名同族角色回复1点体力。',
  triggers: [{
    on: 'cards.gain', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player, g = d.game;
      if (!p || d.from !== p) return false;
      if (['use', 'respond', 'discard', 'play'].includes(d.reason)) return false;
      if (p.flags.qhTurn === g.turnCount) return false;
      return (d.cards || []).some(c => c && (c.name === 'jiu' || CARD_META[c.name]?.type === 'equip'));
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.qhTurn = g.turnCount;
      const mates = g.alive().filter(q => g.sameClan(p, q));
      if (!mates.length) { await ctx.log('【去惑】：场上没有同族角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【去惑】：令一名同族角色回复1点体力', candidates: mates, min: 1, max: 1 }))[0] || mates[0];
      await ctx.recover(t, 1);
      await ctx.log(`【去惑】：${t.name} 回复1点体力`);
    },
  }],
});

// ======================================================================
// 族陈群 · 革制
// 每回合限一次，当你或你攻击范围内的角色受到伤害后，若伤害来源不为你，你可弃置你与伤害来源各一张牌，
// 且可分配这些牌。若因此弃置牌的类别不同，你与伤害来源本回合只能使用这些类别的牌。
//（实现：分配简化为「你获得这两张牌」；类别限制仅战报提示，未做硬性拦截）
// ======================================================================
defineSkill({
  id: 'gezhi', name: '革制',
  desc: '每回合限一次，当你或你攻击范围内的角色受到伤害后，若伤害来源不为你，你可弃置你与伤害来源各一张牌，然后你获得这些牌。若因此弃置牌的类别不同，你与伤害来源本回合只能使用这些类别的牌。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => {
        const q = d.self, g = d.game, c = d.card;
        if (!q || !c) return false;
        const ban = q.flags.gzBan;
        if (!ban || ban.turn !== g.turnCount) return false;
        const t = CARD_META[c.name]?.type;
        return !!t && !ban.types.includes(t);
      },
      async effect(ctx) {
        ctx.data.canceled = true;
        const cn = { basic: '基本牌', trick: '锦囊牌', equip: '装备牌' };
        const ban = ctx.data.self.flags.gzBan;
        await ctx.log(`【革制】：本回合只能使用${ban.types.map(t => cn[t]).join('、')}，不能使用${cardLabel(ctx.data.card)}`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player, g = d.game, v = d.self;
        if (!p || !v || !d.from) return false;
        if (d.from === p) return false;
        if (p.flags.gzTurn === g.turnCount) return false;
        if (!allCardsOf(p).length || !allCardsOf(d.from).length) return false;
        return v === p || g.inAttackRange(p, v);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, src = ctx.data.from;
        p.flags.gzTurn = g.turnCount;
        const [c1] = await g.chooseSomeCards(p, allCardsOf(p), 1, { prompt: '【革制】：弃置你的一张牌' });
        const [c2] = await g.chooseSomeCards(p, allCardsOf(src), 1, { prompt: `【革制】：弃置 ${src.name} 的一张牌` });
        const got = [];
        if (c1) { await ctx.discard(p, [c1], { reason: 'gezhi' }); got.push(c1); }
        if (c2) { await detachEquip(g, src, c2); await ctx.discard(src, [c2], { reason: 'gezhi' }); got.push(c2); }
        if (got.length) await ctx.gain(p, got.map(c => takeFromDiscard(g, c)), { reason: 'gezhi' });
        const types = [...new Set(got.map(c => CARD_META[c.name]?.type).filter(Boolean))];
        await ctx.log(`【革制】：你与 ${src.name} 各弃置一张牌，你获得之`);
        if (types.length > 1) {
          const cn = { basic: '基本牌', trick: '锦囊牌', equip: '装备牌' };
          p.flags.gzBan = { turn: g.turnCount, types };
          src.flags.gzBan = { turn: g.turnCount, types };
          await ctx.log(`【革制】：弃置牌类别不同，你与 ${src.name} 本回合只能使用${types.map(t => cn[t]).join('、')}`);
        }
      },
    },
  ],
});

// ======================================================================
// 族陈群 · 明典
// 出牌阶段或当你受到伤害后，你可重铸任意张基本牌（每轮每个牌名限一次）。
// 若你重铸了你本回合使用过的牌名，你获得一张手牌中没有牌名的基本牌。
// ======================================================================
const mingdianEffect = async (ctx) => {
  const p = ctx.self, g = ctx.game;
  if (!p.flags.mdRound || p.flags.mdRound.round !== g.round) p.flags.mdRound = { round: g.round, names: [] };
  const pool = p.hand.filter(c => CARD_META[c.name]?.type === 'basic' && !p.flags.mdRound.names.includes(c.name));
  if (!pool.length) { await ctx.log('【明典】：没有可重铸的基本牌（每轮每个牌名限一次）'); return; }
  const picks = await g.chooseSomeCards(p, pool, pool.length, { prompt: '【明典】：选择重铸的基本牌' });
  if (!picks.length) return;
  for (const c of picks) p.flags.mdRound.names.push(c.name);
  const usedNames = usedNamesOf(g, p);
  await ctx.discard(p, picks, { reason: 'mingdian' });
  await ctx.draw(p, picks.length, { reason: 'mingdian' });
  await ctx.log(`【明典】：重铸 ${picks.length} 张基本牌`);
  if (!picks.some(c => usedNames.includes(CARD_META[c.name].cn))) return;
  const have = new Set(p.hand.map(c => c.name));
  const want = ['sha', 'shan', 'tao', 'jiu'].filter(n => !have.has(n));
  for (const n of want) {
    const i = g.deck.findIndex(c => c.name === n);
    if (i >= 0) {
      const [c] = g.deck.splice(i, 1);
      await ctx.gain(p, [c], { reason: 'mingdian' });
      await ctx.log(`【明典】：你获得一张手牌中没有牌名的基本牌 ${cardLabel(c)}`);
      return;
    }
  }
};
defineSkill({
  id: 'mingdian', name: '明典',
  desc: '出牌阶段或当你受到伤害后，你可以重铸任意张基本牌（每轮每种牌名限一次）。若你重铸了你本回合使用过的牌名，你获得一张手牌中没有牌名的基本牌。',
  active: { prompt: '明典：重铸任意张基本牌（每轮每种牌名限一次）', effect: mingdianEffect },
  triggers: [{ on: 'damage.after', who: 'self', optional: true, filter: () => true, effect: mingdianEffect }],
});

// ======================================================================
// 族陈群 / 族陈泰 · 士则（宗族技，锁定技）
// 你于回合内使用牌首次被响应后，你令一名同族角色的攻击范围+1，直到其下次受到伤害。
// ======================================================================
defineSkill({
  id: 'shize', name: '士则',
  desc: '宗族技，锁定技，当你于回合内使用牌首次被响应后，你令一名同族角色的攻击范围+1，直到其下次受到伤害。',
  triggers: [
    {
      on: 'dodge.after', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, g = d.game;
        if (!p || d.from !== p) return false;         // 你使用的【杀】被【闪】响应
        if (g.turnPlayer !== p) return false;          // 于回合内
        return p.flags.szUsed !== g.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.szUsed = g.turnCount;
        const mates = g.alive().filter(q => g.sameClan(p, q));
        if (!mates.length) { await ctx.log('【士则】：场上没有同族角色'); return; }
        const t = (await ctx.ask.targets(p, { prompt: '【士则】：令一名同族角色的攻击范围+1', candidates: mates, min: 1, max: 1 }))[0] || mates[0];
        t.flags.rangeBonus = (t.flags.rangeBonus || 0) + 1;
        t.flags.szPending = (t.flags.szPending || 0) + 1;
        await ctx.log(`【士则】：${t.name} 的攻击范围+1（当前 ${g.attackRange(t)}），直到其下次受到伤害`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => (d.self?.flags?.szPending || 0) > 0,
      async effect(ctx) {
        const v = ctx.data.self;
        v.flags.rangeBonus = Math.max(0, (v.flags.rangeBonus || 0) - 1);
        v.flags.szPending -= 1;
        await ctx.log(`【士则】：${v.name} 受到伤害，攻击范围+1 的效果结束`);
      },
    },
  ],
});

// ======================================================================
// 族陈泰 · 奋剑
// 出牌阶段每项限一次，你可以视为对一名角色使用一张【杀】。该角色攻击范围须：1.小于你；2.等于你；
// 3.大于你。若选择角色与上次不同，你须先弃置一张牌。此【杀】造成伤害后，你本回合攻击范围-1（至多减至0）。
// ======================================================================
defineSkill({
  id: 'fenjian', name: '奋剑',
  desc: '出牌阶段每项限一次，你可以视为对一名攻击范围小于你/等于你/大于你的角色使用一张【杀】。若选择的角色与上次不同，你须先弃置一张牌。此【杀】造成伤害后，你本回合攻击范围-1（至多减至0）。',
  active: {
    prompt: '奋剑：视为对一名角色使用一张【杀】（按攻击范围三选一）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.flags.fjTurn || p.flags.fjTurn.turn !== g.turnCount) p.flags.fjTurn = { turn: g.turnCount, cats: [] };
      const labels = [
        { k: -1, s: '攻击范围小于你的角色' },
        { k: 0, s: '攻击范围等于你的角色' },
        { k: 1, s: '攻击范围大于你的角色' },
      ];
      const myRange = g.attackRange(p);
      const avail = labels.filter(l => !p.flags.fjTurn.cats.includes(l.k)
        && g.alive().some(x => x !== p && Math.sign(g.attackRange(x) - myRange) === l.k));
      if (!avail.length) { await ctx.log('【奋剑】：本阶段没有可指定的角色（或三项均已发动）'); return; }
      const idx = await ctx.ask.choose(p, avail.map(l => l.s), { prompt: '【奋剑】：选择一项', reason: 'fenjian' });
      const pick = avail[idx];
      if (!pick) return;
      const cands = g.alive().filter(x => x !== p && Math.sign(g.attackRange(x) - myRange) === pick.k);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: `【奋剑】：选择${pick.s}`, candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      if (p.flags.fjLast !== t.seat) {
        const pool = allCardsOf(p);
        if (!pool.length) { await ctx.log('【奋剑】：更换目标须先弃置一张牌，你没有牌可弃'); return; }
        const [d1] = await g.chooseSomeCards(p, pool, 1, { prompt: '【奋剑】：更换目标，须先弃置一张牌' });
        if (!d1) return;
        await ctx.discard(p, [d1], { reason: 'fenjian' });
      }
      p.flags.fjLast = t.seat;
      p.flags.fjTurn.cats.push(pick.k);
      await ctx.useCard({ from: p, card: VC('sha'), targets: [t], reason: 'fenjian', ignoreRange: true });
      await ctx.log(`【奋剑】：视为对 ${t.name} 使用一张【杀】`);
    },
  },
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player, g = d.game;
        return !!(p && d.from === p && d.card?.name === 'sha' && p.flags.fjTurn?.turn === g.turnCount);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (g.attackRange(p) <= 0) return;
        p.flags.rangeBonus = (p.flags.rangeBonus || 0) - 1;
        p.flags.fjLost = (p.flags.fjLost || 0) + 1;
        await ctx.log(`【奋剑】：此【杀】造成伤害，你本回合攻击范围-1（当前 ${g.attackRange(p)}）`);
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => (d.player.flags.fjLost || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.rangeBonus = (p.flags.rangeBonus || 0) + p.flags.fjLost;
        p.flags.fjLost = 0;
        await ctx.log('【奋剑】：本回合结束，攻击范围恢复');
      },
    },
  ],
});

// ======================================================================
// 族陈泰 · 动虚（转换技）
// 阳：你可以将一张装备牌置于其他角色的装备区（替换原装备）；阴：你可以将手牌摸至X张
// （X为你的攻击范围且至多为5）。然后视为使用一张【闪】或令你被抵消的【杀】依然造成伤害。
// ======================================================================
defineSkill({
  id: 'dongxu', name: '动虚',
  desc: '转换技，出牌阶段限一次。阳：你可以将一张装备牌置入其他角色的装备区（替换原装备）；阴：你可以将手牌摸至X张（X为你的攻击范围且至多为5）。然后视为使用一张【闪】。',
  active: {
    perPhase: true,
    prompt: '动虚：阳——置入装备；阴——摸至攻击范围张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const yang = !p.flags.dongxuYin;
      p.flags.dongxuYin = yang;
      if (yang) {
        const eq = allCardsOf(p).filter(c => CARD_META[c.name]?.type === 'equip');
        if (!eq.length) { await ctx.log('【动虚】（阳）：你没有装备牌'); }
        else {
          const [c] = await g.chooseSomeCards(p, eq, 1, { prompt: '【动虚】：选择要置入他人装备区的装备牌' });
          const others = g.alive().filter(x => x !== p);
          if (c && others.length) {
            const t = (await ctx.ask.targets(p, { prompt: '【动虚】：置入其装备区', candidates: others, min: 1, max: 1 }))[0];
            if (t) {
              const hi = p.hand.indexOf(c);
              if (hi >= 0) p.hand.splice(hi, 1);
              else await detachEquip(g, p, c);
              await g.equipCard(t, c);
              await ctx.log(`【动虚】（阳）：${cardLabel(c)} 置入 ${t.name} 的装备区`);
            }
          }
        }
      } else {
        const x = Math.min(5, Math.max(0, g.attackRange(p)));
        if (p.hand.length < x) {
          await ctx.draw(p, x - p.hand.length, { reason: 'dongxu' });
          await ctx.log(`【动虚】（阴）：将手牌摸至 ${x} 张`);
        } else {
          await ctx.log(`【动虚】（阴）：手牌 ${p.hand.length} 张，已达到攻击范围 ${x}`);
        }
      }
      await ctx.log('【动虚】：视为使用一张【闪】');
    },
  },
});

// ======================================================================
// 族吴匡 · 联诛（转换技，一名角色的出牌阶段限一次）
// 阳：其可以重铸一张牌，然后你重铸一张牌，若这两张牌颜色相同，你的手牌上限+1；
// 阴：其可以令你选择另一名其他角色，然后其与你依次可以对该角色使用一张无距离限制【杀】，
//     若这两张【杀】颜色不同，你的手牌上限-1。
// ======================================================================
defineSkill({
  id: 'lianzhu', name: '联诛',
  desc: '转换技，一名角色的出牌阶段限一次。阳：其可以重铸一张牌，然后你重铸一张牌，若这两张牌颜色相同，你的手牌上限+1；阴：其可以令你选择另一名其他角色，然后其与你依次可对该角色使用一张无距离限制【杀】，若这两张【杀】颜色不同，你的手牌上限-1。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player, g = d.game;
      if (d.phase !== 'play' || !d.self || !d.self.alive) return false;
      return p.flags.lzUsed !== g.turnCount;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, who = ctx.data.self;
      p.flags.lzUsed = g.turnCount;
      const yang = !p.flags.lzYin;
      p.flags.lzYin = yang;
      if (yang) {
        let c1 = null;
        if (who.hand.length) {
          [c1] = await g.chooseSomeCards(who, who.hand.slice(), 1, { prompt: '【联诛】（阳）：由你重铸一张牌' });
          if (c1) { await ctx.discard(who, [c1], { reason: 'lianzhu' }); await ctx.draw(who, 1, { reason: 'lianzhu' }); }
        }
        let c2 = null;
        if (p.hand.length) {
          [c2] = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【联诛】（阳）：你重铸一张牌' });
          if (c2) { await ctx.discard(p, [c2], { reason: 'lianzhu' }); await ctx.draw(p, 1, { reason: 'lianzhu' }); }
        }
        await ctx.log(`【联诛】（阳）：${who.name} 与 ${p.name} 各重铸一张牌`);
        if (c1 && c2 && isRed(c1) === isRed(c2)) {
          p.flags.handLimit = (p.flags.handLimit || 0) + 1;
          await ctx.log(`【联诛】：两张牌颜色相同，${p.name} 的手牌上限+1（当前 ${handLimitOf(p)}）`);
        }
        return;
      }
      const cands = g.alive().filter(x => x !== who && x !== p);
      if (!cands.length) { await ctx.log('【联诛】（阴）：没有其他可选角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【联诛】（阴）：选择另一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const s1 = VC('sha', g.rng.pick(['spade', 'club', 'heart', 'diamond']));
      const s2 = VC('sha', g.rng.pick(['spade', 'club', 'heart', 'diamond']));
      await ctx.useCard({ from: who, card: s1, targets: [t], reason: 'lianzhu', ignoreRange: true });
      await ctx.useCard({ from: p, card: s2, targets: [t], reason: 'lianzhu', ignoreRange: true });
      await ctx.log(`【联诛】（阴）：${who.name} 与 ${p.name} 依次视为对 ${t.name} 使用【杀】`);
      if (isRed(s1) !== isRed(s2)) {
        p.flags.handLimit = (p.flags.handLimit || 0) - 1;
        await ctx.log(`【联诛】：两张【杀】颜色不同，${p.name} 的手牌上限-1（当前 ${handLimitOf(p)}）`);
      }
    },
  }],
});

// ======================================================================
// 族吴匡 · 穆荫（宗族技）
// 准备阶段，你可以令一名手牌上限不为全场最大的同族角色手牌上限+1。
// ======================================================================
defineSkill({
  id: 'muyin', name: '穆荫',
  desc: '宗族技，准备阶段，你可以令一名手牌上限不为全场最大的同族角色手牌上限+1。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const maxL = Math.max(...g.alive().map(q => handLimitOf(q)));
      const cands = g.alive().filter(q => g.sameClan(p, q) && handLimitOf(q) < maxL);
      if (!cands.length) { await ctx.log('【穆荫】：没有手牌上限不为全场最大的同族角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【穆荫】：令一名同族角色手牌上限+1', candidates: cands, min: 1, max: 1 }))[0] || cands[0];
      t.flags.handLimit = (t.flags.handLimit || 0) + 1;
      await ctx.log(`【穆荫】：${t.name} 的手牌上限+1（当前 ${handLimitOf(t)}）`);
    },
  }],
});

// ======================================================================
// 族陆郁生 · 拾昔
// 你首次使用一个花色的单目标普通锦囊牌时，记录牌名和花色。
// 当你需要使用记录牌时，你可将所有对应花色的牌置入弃牌堆，视为使用之。
// ======================================================================
defineSkill({
  id: 'shixi', name: '拾昔',
  desc: '你首次使用一个花色的单目标普通锦囊牌时，记录牌名和花色。当你需要使用记录牌时，你可以将你所有对应花色的牌置入弃牌堆，视为使用之。',
  active: {
    prompt: '拾昔：将某一花色的所有手牌置入弃牌堆，视为使用记录的锦囊牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const rec = p.flags.shixi || {};
      const suits = Object.keys(rec).filter(s => p.hand.some(c => c.suit === s));
      if (!suits.length) { await ctx.log('【拾昔】：没有已记录花色的手牌'); return; }
      const idx = await ctx.ask.choose(p, suits.map(s => `${SUIT_CN[s] || s}：视为使用【${CARD_META[rec[s]].cn}】`), { prompt: '【拾昔】：选择要复现的锦囊牌', reason: 'shixi' });
      const suit = suits[idx];
      if (!suit) return;
      const nm = rec[suit];
      const cards = p.hand.filter(c => c.suit === suit);
      await ctx.discard(p, cards, { reason: 'shixi' });
      await ctx.log(`【拾昔】：将 ${cards.length} 张${SUIT_CN[suit] || ''}牌置入弃牌堆，视为使用【${CARD_META[nm].cn}】`);
      const tg = await chooseTargetsFor(ctx, p, nm, `【拾昔】：选择【${CARD_META[nm].cn}】的目标`);
      if (tg === null) return;
      await ctx.useCard({ from: p, card: VC(nm, suit, 7), targets: tg, reason: 'shixi', ignoreRange: true });
    },
  },
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => {
      const c = d.card, meta = CARD_META[c?.name];
      if (!meta || meta.type !== 'trick' || meta.delayed) return false;
      const rule = meta.target;
      if (!rule || typeof rule !== 'object') return false;
      if ((rule.max ?? 1) > 1) return false;
      const p = d.player;
      const rec = p.flags.shixi || {};
      return !rec[c.suit];
    },
    async effect(ctx) {
      const p = ctx.self, c = ctx.data.card;
      p.flags.shixi = p.flags.shixi || {};
      p.flags.shixi[c.suit] = c.name;
      await ctx.log(`【拾昔】：记录${SUIT_CN[c.suit] || ''}【${CARD_META[c.name].cn}】`);
    },
  }],
});

// ======================================================================
// 族陆郁生 · 坚白（锁定技）
// 你每回合首次使用一种类型的牌后，你保留一个花色的牌，重铸其余牌。
// 此回合结束时，你交给一名其他角色一张牌并摸X张牌（X为此牌本回合被保留的次数）。
// ======================================================================
defineSkill({
  id: 'jianbai', name: '坚白',
  desc: '锁定技，你每回合首次使用一种类型的牌后，你保留一个花色的牌，重铸其余花色的牌。此回合结束时，你交给一名其他角色一张牌并摸X张牌（X为本回合发动此技能的次数）。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player, c = d.card, g = d.game;
        const meta = CARD_META[c?.name];
        if (!meta || !p.hand.length) return false;
        const types = (p.flags.jbTurn && p.flags.jbTurn.turn === g.turnCount) ? p.flags.jbTurn.types : [];
        return !types.includes(meta.type);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, meta = CARD_META[ctx.data.card.name];
        if (!p.flags.jbTurn || p.flags.jbTurn.turn !== g.turnCount) p.flags.jbTurn = { turn: g.turnCount, types: [], kept: 0 };
        p.flags.jbTurn.types.push(meta.type);
        if (!p.hand.length) return;
        const suits = [...new Set(p.hand.map(c => c.suit))];
        p.flags.jbTurn.kept += 1;
        if (suits.length === 1) {
          await ctx.log(`【坚白】：手牌全为${SUIT_CN[suits[0]] || ''}，全部保留`);
          return;
        }
        const idx = await ctx.ask.choose(p, suits.map(s => `保留所有${SUIT_CN[s] || s}牌`), { prompt: '【坚白】：保留一个花色的牌，重铸其余牌', reason: 'jianbai' });
        const keep = suits[idx] || suits[0];
        const others = p.hand.filter(c => c.suit !== keep);
        if (!others.length) { await ctx.log(`【坚白】：保留${SUIT_CN[keep] || ''}牌，无牌可重铸`); return; }
        await ctx.discard(p, others, { reason: 'jianbai' });
        await ctx.draw(p, others.length, { reason: 'jianbai' });
        await ctx.log(`【坚白】：保留${SUIT_CN[keep] || ''}牌，重铸 ${others.length} 张（本回合保留 ${p.flags.jbTurn.kept} 次）`);
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => !!(d.player.flags.jbTurn && d.player.flags.jbTurn.turn === d.game.turnCount),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, rec = p.flags.jbTurn;
        p.flags.jbTurn = null;
        const others = g.alive().filter(x => x !== p);
        if (!others.length) return;
        if (p.hand.length) {
          const t = (await ctx.ask.targets(p, { prompt: '【坚白】：交给一名其他角色一张牌', candidates: others, min: 1, max: 1 }))[0];
          const [c] = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【坚白】：选择交给其的牌' });
          if (t && c) {
            await ctx.gain(t, [c], { from: p, reason: 'jianbai' });
            await ctx.log(`【坚白】：交给 ${t.name} ${cardLabel(c)}`);
          }
        }
        const x = rec.kept || 0;
        if (x > 0) {
          await ctx.draw(p, x, { reason: 'jianbai' });
          await ctx.log(`【坚白】：摸 ${x} 张牌`);
        }
      },
    },
  ],
});

// ======================================================================
// 族陆郁生 · 泽烈（宗族技）
// 当同族角色失去其场上的所有牌后，你可令一名角色本回合下一次摸牌/弃牌后，其再摸一张牌/弃一张牌。
//（实现：仅实装「摸牌后额外摸一张」分支）
// ======================================================================
defineSkill({
  id: 'zelie', name: '泽烈',
  desc: '宗族技，当同族角色失去其场上的所有牌后，你可令一名角色本回合下一次摸牌后，其再摸一张牌。',
  triggers: [
    {
      on: 'equip.lose', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player, g = d.game, q = d.self;
        if (!p || !q || !q.alive) return false;
        if (!g.sameClan(p, q)) return false;
        const noEquip = Object.values(q.equips).every(v => !v);
        const noJudge = (q.judgeZone || []).length === 0;
        return noEquip && noJudge;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, q = ctx.data.self;
        const t = (await ctx.ask.targets(p, { prompt: '【泽烈】：令一名角色本回合下一次摸牌后额外摸一张', candidates: g.alive(), min: 1, max: 1 }))[0];
        if (!t) return;
        t.flags.zelieDraw = g.turnCount;
        await ctx.log(`【泽烈】：${q.name} 失去场上所有牌，${t.name} 本回合下一次摸牌后额外摸一张牌`);
      },
    },
    {
      on: 'cards.draw.after', who: 'any', optional: false,
      filter: (d) => {
        const q = d.self;
        return !!(q && q.flags.zelieDraw === d.game.turnCount && d.reason !== 'zelie');
      },
      async effect(ctx) {
        const q = ctx.data.self;
        delete q.flags.zelieDraw;
        await ctx.log(`【泽烈】：${q.name} 额外摸一张牌`);
        await ctx.draw(q, 1, { reason: 'zelie' });
      },
    },
  ],
});
