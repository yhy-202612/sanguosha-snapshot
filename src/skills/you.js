// 手杀「老友季·友」5 将技能（阶段 5E 批次 15 将之另一半）
//   友诸葛亮 / 友徐庶 / 友庞统 / 友石韬 / 友崔钧（均为群势力，官方设定：三人求学时期魏蜀吴未立）
//
// 资料核验：技能文本核到官方（三国杀官网 / 萌娘百科 / bilibili wiki「老友季」）。
//   未核到完整细节或本引擎无法一比一实现的部分，在技能注释中标注“简化”，并保持描述与实现一致：
//   1. 友徐庶【侠行】的“玄剑”在本引擎没有对应装备牌（不可改 engine/cards.js），
//      以「攻击范围 +8（视为【杀】无距离关系限制）」+ 标记表示；失去玄剑后的回收分支不建模。
//   2. 友诸葛亮【演策】的“卧龙演策”以「声明一种类别/颜色 + 预测牌数 N」的可玩形式实现。
//   3. 各【共砺】（友系列统一锁定技）按官方描述做成“同势力友武将”判定，效果为对应主技能的强化。
import { defineSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';

// ---------------- 公用小工具 ----------------
let vseq = 0;
const VC = (name, extra = {}) => ({
  id: `vc5ey_${++vseq}`, name, suit: 'spade', num: 7, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const isRed = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const colorOf = (c) => (isRed(c) ? 'red' : 'black');
const COLOR_CN = { red: '红色', black: '黑色' };
const typeOf = (c) => CARD_META[c?.name]?.type || 'basic';
const TYPE_CN = { basic: '基本牌', trick: '锦囊牌', equip: '装备牌' };
const allCardsOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card)),
];
const takeDiscard = (g, c) => {
  const i = g.discardPile.indexOf(c);
  if (i >= 0) g.discardPile.splice(i, 1);
  return c;
};
// 同势力“友”武将（技能表里带 gongli_* 的角色）
const isYouGeneral = (q) => effSkills(q).some(s => String(s.id).startsWith('gongli_'));
const friendsOf = (g, p, mainSkillId) => g.players.filter(q => q !== p && q.alive && q.kingdom === p.kingdom
  && (mainSkillId ? (effSkills(q) || []).some(s => s.id === mainSkillId) : isYouGeneral(q)));
const youCountAll = (g) => g.players.filter(q => q.alive && isYouGeneral(q)).length;

// ======================================================================
// 友诸葛亮（群 3）· 演策 / 方遒 / 共砺
// ======================================================================
const YANCE_BASE = 3;

defineSkill({
  id: 'yance', name: '演策',
  desc: '每轮限一次，首轮开始时，或准备阶段，你可以选择一项：1.从牌堆中随机获得一张锦囊牌；2.执行“卧龙演策”（声明一种类别或颜色作为预测，并预测接下来 N 张牌）。若你执行“卧龙演策”，当一张牌被使用时，若此牌的类别或颜色与你的预测相同，你摸一张牌（每次执行至多因此摸五张牌）。当本次预测全部验证后：正确的预测数量为0，你失去1点体力且此后可预测牌数-1；不足一半，你弃置两张牌；至少一半（向上取整），你从牌堆中获得一张符合声明条件的牌；全部正确，你摸两张牌且此后可预测牌数+1（至多7）。',
  triggers: [{
    on: 'round.begin', who: 'self', optional: true, prompt: '是否发动【演策】？',
    filter: (d) => d.round === 1 && d.player.flags.ycRound !== d.game.round,
    async effect(ctx) { await doYance(ctx); },
  }, {
    on: 'phase.begin', who: 'self', optional: true, prompt: '是否发动【演策】？',
    filter: (d) => d.phase === 'prepare' && d.player.flags.ycRound !== d.game.round,
    async effect(ctx) { await doYance(ctx); },
  }, {
    on: 'card.use.after', who: 'any',
    async effect(ctx) {
      const p = ctx.self, pred = p.flags.yance;
      if (!pred) return;
      const c = ctx.data.card;
      if (!c) return;
      const val = pred.kind === 'type' ? typeOf(c) : colorOf(c);
      let correct = val === pred.value;
      if (!pred.got && p.flags.gongliFirst) correct = true;
      pred.got += 1;
      if (correct) {
        pred.correct += 1;
        if (pred.drawn < 5) { pred.drawn += 1; await ctx.draw(p, 1, { reason: 'yance' }); }
      }
      await ctx.log(`【演策】：${cardLabel(c)} ${correct ? '符合' : '不符'}预测（${pred.got}/${pred.need}）`);
      if (pred.got >= pred.need) await settleYance(ctx, pred);
    },
  }],
});

async function doYance(ctx) {
  const p = ctx.self, g = ctx.game;
  p.flags.ycRound = g.round;
  const idx = await g.chooseOne(p, ['从牌堆中随机获得一张锦囊牌', '执行“卧龙演策”（预测接下来若干张牌的类别或颜色）'],
    { prompt: '【演策】：请选择一项' });
  if (idx === 0) {
    const tricks = g.deck.filter(c => typeOf(c) === 'trick');
    if (!tricks.length) { await ctx.log('【演策】：牌堆中没有锦囊牌'); return; }
    const c = g.rng.pick(tricks);
    const i = g.deck.indexOf(c);
    if (i >= 0) g.deck.splice(i, 1);
    await ctx.gain(p, [c], { reason: 'yance' });
    await ctx.log(`【演策】：${p.name} 从牌堆随机获得一张锦囊牌`);
    return;
  }
  if (idx < 0) return;
  const kinds = ['类别：基本牌', '类别：锦囊牌', '类别：装备牌', '颜色：红色', '颜色：黑色'];
  const ki = await g.chooseOne(p, kinds, { prompt: '【演策】· 卧龙演策：声明你的预测' });
  if (ki < 0) return;
  const map = [
    { kind: 'type', value: 'basic' }, { kind: 'type', value: 'trick' }, { kind: 'type', value: 'equip' },
    { kind: 'color', value: 'red' }, { kind: 'color', value: 'black' },
  ];
  const pred = map[ki];
  const need = Math.max(1, Math.min(7, YANCE_BASE + (p.flags.yanceN || 0) + (p.flags.gongliYanceN || 0)));
  p.flags.yance = { kind: pred.kind, value: pred.value, need, got: 0, correct: 0, drawn: 0 };
  await ctx.log(`【演策】· 卧龙演策：${p.name} 预测接下来 ${need} 张牌为「${kinds[ki].replace('：', '：')}」`);
}

async function settleYance(ctx, pred) {
  const p = ctx.self, g = ctx.game;
  p.flags.yance = null;
  const bonus = p.flags.fangqiu ? 1 : 0;
  p.flags.fangqiu = false;
  const desc = pred.kind === 'type' ? TYPE_CN[pred.value] : COLOR_CN[pred.value];
  if (pred.correct === 0) {
    p.flags.yanceN = Math.max(1, (p.flags.yanceN || 0) - 1);
    await ctx.loseHp(p, 1, { reason: 'yance' });
    await ctx.log(`【演策】：预测（${desc}）全错，${p.name} 失去1点体力，此后可预测牌数-1`);
    return;
  }
  if (pred.correct * 2 < pred.need) {
    const n = 2 + bonus;
    const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(n, p.hand.length), { prompt: `【演策】：预测不足一半，弃置 ${n} 张牌` });
    if (picks.length) await ctx.discard(p, picks, { reason: 'yance' });
    await ctx.log(`【演策】：正确的预测不足一半，${p.name} 弃置 ${picks.length} 张牌`);
    return;
  }
  if (pred.correct >= pred.need) {
    p.flags.yanceN = Math.min(7, (p.flags.yanceN || 0) + 1);
    await ctx.draw(p, 2 + bonus, { reason: 'yance' });
    await ctx.log(`【演策】：预测全部正确，${p.name} 摸 ${2 + bonus} 张牌，此后可预测牌数+1`);
    if (p.flags.fangqiuUsed && pred.need > 3) {
      p.flags.fangqiuUsed = false;
      await ctx.log('【方遒】：本次预测牌数大于3且全部正确，此技能可以再次发动');
    }
    return;
  }
  // 至少一半（向上取整）：从牌堆获得一张符合声明条件的牌
  const want = pred.kind === 'type' ? (c) => typeOf(c) === pred.value : (c) => colorOf(c) === pred.value;
  const got = g.deck.filter(want);
  const take = got.length + bonus;
  const picks = got.slice(-Math.max(1, take));
  for (const c of picks) { const i = g.deck.indexOf(c); if (i >= 0) g.deck.splice(i, 1); }
  if (picks.length) await ctx.gain(p, picks, { reason: 'yance' });
  await ctx.log(`【演策】：预测至少一半正确，${p.name} 从牌堆获得 ${picks.length} 张「${desc}」`);
}

defineSkill({
  id: 'fangqiu', name: '方遒',
  desc: '限定技，当你执行“卧龙演策”后，你可以展示你的预测，若如此做，本次“卧龙演策”的预测全部验证后，执行效果的值均+1，然后若本次预测牌数大于3且预测全部正确，该技能可以再次发动。',
  active: {
    prompt: '方遒（限定技）：展示本次“卧龙演策”的预测，使其结算效果值+1',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.fangqiuUsed) { await ctx.log('✗【方遒】本局已发动且未重置'); return; }
      if (!p.flags.yance) { await ctx.log('✗【方遒】当前没有执行中的“卧龙演策”'); return; }
      p.flags.fangqiu = true;
      await ctx.log(`【方遒】：${p.name} 展示预测，本次结算效果值+1`);
    },
  },
});

defineSkill({
  id: 'gongli_zhuge', name: '共砺',
  desc: '锁定技，若友庞统在场且与你阵营一致，你执行“卧龙演策”可预测的牌数+1；若友徐庶在场且与你阵营一致，你“卧龙演策”预测的第一张牌的结果视为正确。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (friendsOf(g, p, 'manjuan').length) p.flags.gongliYanceN = 1;
      if (friendsOf(g, p, 'qihui').length) p.flags.gongliFirst = true;
      await ctx.log(`【共砺】：${p.name} 与友同席（可预测牌数 ${1 + (p.flags.gongliYanceN || 0)}，首张预测${p.flags.gongliFirst ? '必中' : '否'}）`);
    },
  }],
});

// ======================================================================
// 友徐庶（群 3）· 侠行 / 启诲 / 共砺
// ======================================================================
defineSkill({
  id: 'xiaxing', name: '侠行',
  desc: '锁定技，游戏开始时，你获得并使用专属武器“玄剑”（你使用【杀】无距离关系限制）。当“玄剑”进入弃牌堆后，你可以移除2枚“启诲”标记，然后再次获得之。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) {
      const p = ctx.self;
      p.flags.xuanjian = true;
      p.flags.rangeBonus = (p.flags.rangeBonus || 0) + 8;   // 简化：以攻击范围 +8 表示“【杀】无距离关系限制”
      p.flags.xxRange = (p.flags.xxRange || 0) + 8;
      await ctx.log(`【侠行】：${p.name} 获得并使用专属武器“玄剑”（【杀】无距离关系限制）`);
    },
  }, {
    on: 'cards.discard', who: 'any', optional: true, prompt: '是否发动【侠行】？',
    filter: (d) => d.self === d.player && d.player.flags.xuanjian && d.player.flags.xjLost !== d.game.turnCount
      && (d.player.marks.qh || []).length >= 2
      && (d.cards || []).some(c => c.__xuanjian),
    async effect(ctx) {
      const p = ctx.self;
      const c = (ctx.data.cards || []).find(x => x.__xuanjian);
      if (!c) return;
      p.flags.xjLost = ctx.game.turnCount;
      p.marks.qh = (p.marks.qh || []).slice(2);
      takeDiscard(ctx.game, c);
      delete c.__xuanjian;
      p.hand.push(c);
      await ctx.log(`【侠行】：${p.name} 移除2枚“启诲”标记，重新获得“玄剑”`);
    },
  }],
});

defineSkill({
  id: 'qihui', name: '启诲',
  desc: '锁定技，当你使用牌时，若你没有该牌对应类别的“启诲”标记，你获得1个对应类别的“启诲”标记。若你拥有3个“启诲”标记，你移除2个“启诲”标记，并从以下三项中选择其一：1.回复1点体力并重铸一张牌；2.摸两张牌；3.你使用的下一张牌不计入使用次数。',
  triggers: [{
    on: 'card.use.before', who: 'self',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const t = typeOf({ name: d.effName || d.card?.name });
      p.marks.qh = p.marks.qh || [];
      if (!p.marks.qh.includes(t)) p.marks.qh.push(t);
      await ctx.log(`【启诲】：${p.name} 获得“${TYPE_CN[t]}”标记（${p.marks.qh.length}/3）`);
      if (p.marks.qh.length < 3) return;
      p.marks.qh = p.marks.qh.slice(-1);   // 移除2个，保留最新1个
      const idx = await g.chooseOne(p, ['回复1点体力并重铸一张牌', '摸两张牌', '下一张牌不计入使用次数'],
        { prompt: '【启诲】：已集齐3个标记，请选择一项' });
      if (idx === 0) {
        await ctx.recover(p, 1);
        const pool = p.hand.filter(c => c !== d.card);
        if (pool.length) {
          const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【启诲】：重铸一张牌' });
          if (picks.length) {
            await ctx.discard(p, picks, { reason: 'qihui' });
            await ctx.draw(p, 1, { reason: 'qihui' });
          }
        }
      } else if (idx === 1) {
        await ctx.draw(p, 2, { reason: 'qihui' });
      } else if (idx === 2) {
        p.flags.shaLimitBypass = true;
      }
      await ctx.log(`【启诲】：${p.name} 结算标记（剩余 ${p.marks.qh.length}）`);
    },
  }],
});

defineSkill({
  id: 'gongli_xushu', name: '共砺',
  desc: '锁定技，若友诸葛亮在场且与你阵营一致，你发动“玄剑”可以将一张手牌当作普通【杀】使用（本引擎实现为：你使用【杀】不计入次数限制）；若友庞统在场且与你阵营一致，你发动“玄剑”使用的【杀】无距离限制。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (friendsOf(g, p, 'yance').length) { p.flags.xsShaFree = true; p.flags.shaLimitBypass = true; }
      if (friendsOf(g, p, 'manjuan').length) {
        p.flags.rangeBonus = (p.flags.rangeBonus || 0) + 8;
        p.flags.xsRange = true;
      }
      await ctx.log(`【共砺】：${p.name} 与友同心（${p.flags.xsShaFree ? '出【杀】不限次数' : '常规'}）`);
    },
  }],
});

// ======================================================================
// 友庞统（群 3）· 漫卷 / 养名 / 共砺
// ======================================================================
defineSkill({
  id: 'manjuan', name: '漫卷',
  desc: '当你不因此技能一次性获得至少两张牌后，你可以将这些牌中的任意张牌以任意顺序置于牌堆顶。若如此做，你每放置一张牌，便从弃牌堆中随机获得一张与此牌类别不同的牌（一次性至多获得五张牌）。',
  triggers: [{
    on: 'cards.gain', who: 'any', optional: true, prompt: '是否发动【漫卷】？',
    filter: (d) => d.self === d.player && (d.cards || []).length >= 2 && d.reason !== 'manjuan'
      && d.player.flags.mjRound !== d.game.round,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.mjRound = g.round;
      let pool = (ctx.data.cards || []).filter(c => p.hand.includes(c));
      await ctx.log(`【漫卷】：${p.name} 可将本次获得的至多 5 张牌置于牌堆顶，每放置 1 张从弃牌堆获得 1 张类别不同的牌`);
      let placed = 0;
      while (placed < 5 && pool.length) {
        const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【漫卷】：选择一张牌置于牌堆顶（取消即结束）' });
        if (!picks.length) break;
        const c = picks[0];
        pool = pool.filter(x => x !== c);
        const hi = p.hand.indexOf(c);
        if (hi >= 0) p.hand.splice(hi, 1);
        g.deck.push(c);                       // 牌堆顶在数组末尾
        placed += 1;
        const cands = g.discardPile.filter(x => typeOf(x) !== typeOf(c));
        if (cands.length) {
          const got = g.rng.pick(cands);
          takeDiscard(g, got);
          p.hand.push(got);
        }
      }
      if (placed) await ctx.log(`【漫卷】：${p.name} 将 ${placed} 张牌置于牌堆顶，并从弃牌堆获得等量类别不同的牌`);
    },
  }],
});

defineSkill({
  id: 'yangming', name: '养名',
  desc: '出牌阶段结束时，若你本阶段失去过至少三张手牌，你可以将牌堆顶的X张牌置于你的武将牌上（X为本回合进入弃牌堆的牌的花色数），然后使用其中花色各不相同的两张牌（无次数限制），将剩余的牌置入弃牌堆。',
  triggers: [{
    on: 'cards.discard', who: 'any',
    filter: (d) => d.self === d.player && d.game.phase === 'play',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.ymTurn !== ctx.game.turnCount) { p.flags.ymTurn = ctx.game.turnCount; p.flags.ymLost = 0; }
      p.flags.ymLost = (p.flags.ymLost || 0) + (ctx.data.cards || []).length;
    },
  }, {
    on: 'phase.end', who: 'self', optional: true, prompt: '是否发动【养名】？',
    filter: (d) => d.phase === 'play' && d.player.flags.ymTurn === d.game.turnCount && (d.player.flags.ymLost || 0) >= 3,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const suits = [...new Set(g.discardPile.map(c => c.suit))];
      const X = Math.min(4, suits.length) + (p.flags.gongliYmX || 0);
      const cards = g.popDeck(Math.min(X, g.deck.length));
      if (!cards.length) { await ctx.log('【养名】：牌堆为空'); return; }
      p.flags.ymCards = [...(p.flags.ymCards || []), ...cards];
      await ctx.log(`【养名】：${p.name} 将牌堆顶 ${cards.length} 张牌置于武将牌上（花色数 ${suits.length}）`);
      // 使用其中花色各不相同的两张牌
      const used = [];
      let rest = cards.slice();
      for (let i = 0; i < 2; i++) {
        const cands = rest.filter(c => !used.some(u => u.suit === c.suit));
        if (!cands.length) break;
        const idx = await g.chooseOne(p, cands.map(c => `使用 ${cardLabel(c)}`), { prompt: '【养名】：使用其中一张牌（花色需各不相同）' }, { optional: true });
        if (idx < 0) break;
        const c = cands[idx];
        rest = rest.filter(x => x !== c);
        p.flags.ymCards = (p.flags.ymCards || []).filter(x => x !== c);
        used.push(c);
        if (CARD_META[c.name]?.type === 'equip') {
          await g.equipCard(p, c);
          continue;
        }
        if (c.name === 'shan' || c.name === 'wuxie') { await ctx.discard(p, [c], { reason: 'yangming' }); continue; }
        const tg = await g.chooseTargets(p, {
          candidates: g.alive().filter(q => q !== p), min: 1, max: 1,
          prompt: `【养名】：选择【${CARD_META[c.name]?.cn || c.name}】的目标`,
        });
        const ok = await ctx.useCard({ from: p, card: c, targets: tg.length ? tg : [], reason: 'yangming', ignoreRange: true, ignoreShaLimit: true });
        if (ok === false) await ctx.discard(p, [c], { reason: 'yangming' });
      }
      if (rest.length) {
        await ctx.discard(p, rest, { reason: 'yangming' });
        p.flags.ymCards = (p.flags.ymCards || []).filter(x => !rest.includes(x));
        await ctx.log(`【养名】：剩余的 ${rest.length} 张牌置入弃牌堆`);
      }
      if (p.flags.gongliYmGet) {
        const left = (p.flags.ymCards || []).filter(c => !used.some(u => u.suit === c.suit));
        if (left.length) {
          const got = left[0];
          p.flags.ymCards = (p.flags.ymCards || []).filter(x => x !== got);
          await ctx.gain(p, [got], { reason: 'yangming' });
          await ctx.log('【共砺】：获得一张本次未使用花色的牌');
        }
      }
    },
  }],
});

defineSkill({
  id: 'gongli_pangtong', name: '共砺',
  desc: '锁定技，若友诸葛亮在场且与你阵营一致，你发动“养名”置于武将牌上的牌的张数+1；若友徐庶在场且与你阵营一致，你发动“养名”后，获得一张本次置于武将牌上的牌中未使用过的花色的牌。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (friendsOf(g, p, 'yance').length) p.flags.gongliYmX = 1;
      if (friendsOf(g, p, 'qihui').length) p.flags.gongliYmGet = true;
      await ctx.log(`【共砺】：${p.name} 与友同心（“养名”张数 +${p.flags.gongliYmX || 0}）`);
    },
  }],
});

// ======================================================================
// 友石韬（群 3）· 钦英 / 论雄 / 共砺
// ======================================================================
defineSkill({
  id: 'qinying', name: '钦英',
  desc: '出牌阶段限一次，你可以重铸任意张牌，视为使用一张【决斗】。此【决斗】结算过程中限X次（X为你以此法重铸的牌数），你或目标角色可以弃置区域中的一张牌，视为打出一张普通【杀】。',
  active: {
    perPhase: true,
    prompt: '钦英：重铸任意张牌，视为使用一张【决斗】（双方可弃牌当【杀】，共限X次）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      let recast = [];
      if (pool.length) {
        recast = await g.chooseSomeCards(p, pool, Math.min(4, pool.length), { prompt: '【钦英】：重铸任意张牌（每张令决斗中可弃牌当【杀】1次）' });
      }
      for (const c of recast) await ctx.discard(p, [c], { reason: 'qinying' });
      if (recast.length) await ctx.draw(p, recast.length, { reason: 'qinying' });
      const cands = g.alive().filter(q => q !== p);
      if (!cands.length) return;
      const tg = await g.chooseTargets(p, { candidates: cands, min: 1, max: 1, prompt: '【钦英】：视为使用【决斗】的目标' });
      const target = tg[0] || cands[0];
      const X = recast.length + (p.flags.qinyingX || 0);
      await ctx.log(`【钦英】：${p.name} 重铸 ${recast.length} 张牌，视为对 ${target.name} 使用【决斗】（可弃牌当【杀】共限 ${X} 次）`);
      let responder = target, other = p;
      for (let i = 0; i < X; i++) {
        if (!responder.alive || !other.alive) break;
        const rp = allCardsOf(responder);
        let played = false;
        if (rp.length) {
          const picks = await g.chooseSomeCards(responder, rp, 1, { prompt: `【钦英】：弃置区域内一张牌视为打出【杀】（第 ${i + 1}/${X} 次）` });
          if (picks.length) {
            await ctx.discard(responder, picks, { reason: 'qinying' });
            played = true;
            await ctx.log(`【钦英】：${responder.name} 弃置一张牌视为打出【杀】`);
          }
        }
        if (!played) {
          await ctx.damage({ from: other, to: responder, amount: 1, reason: 'qinying' });
          await ctx.log(`【钦英】：${responder.name} 未打出【杀】，受到 ${other.name} 造成的1点伤害`);
          break;
        }
        [responder, other] = [other, responder];
      }
    },
  },
});

defineSkill({
  id: 'lunxiong', name: '论雄',
  desc: '当你造成或受到伤害后，你可以弃置点数唯一最大的手牌，然后你摸三张牌，且你本局游戏以此法弃置的牌的点数必须大于此牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true, prompt: '是否发动【论雄】？',
    filter: (d) => (d.from === d.player || d.to === d.player) && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self;
      if (!p.hand.length) return;
      const nums = p.hand.map(c => c.num);
      const max = Math.max(...nums);
      if (nums.filter(n => n === max).length !== 1) return;      // 须为点数唯一最大
      if (max <= (p.flags.lxLast || 0)) return;                  // 须大于上次以此法弃置牌的点数
      const c = p.hand.find(x => x.num === max);
      await ctx.discard(p, [c], { reason: 'lunxiong' });
      p.flags.lxLast = max;
      await ctx.draw(p, 3, { reason: 'lunxiong' });
      await ctx.log(`【论雄】：${p.name} 弃置 ${cardLabel(c)}（${max}点），摸三张牌；此后须弃置大于 ${max} 点的牌`);
    },
  }],
});

defineSkill({
  id: 'gongli_shitao', name: '共砺',
  desc: '锁定技，游戏开始时，你令本局“钦英”减少X个可用于弃置的类别的牌（X为全场友武将数）。本引擎实现为：你发动【钦英】时可重铸的牌数+X（X为与你同势力的友武将数）。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.qinyingX = friendsOf(g, p).length;
      await ctx.log(`【共砺】：${p.name} 的【钦英】可弃牌次数 +${p.flags.qinyingX}（同势力友武将数）`);
    },
  }],
});

// ======================================================================
// 友崔钧（群 3）· 顺逸 / 鄙位 / 共砺
// ======================================================================
defineSkill({
  id: 'shunyi', name: '顺逸',
  desc: '当你使用点数唯一最小的手牌时，若此牌的花色为红桃且点数大于X（X为你本回合发动此技能的次数），你可以将此花色的所有手牌扣置于武将牌上直至当前回合结束，然后你摸一张牌。',
  triggers: [{
    on: 'card.use.before', who: 'self', optional: true, prompt: '是否发动【顺逸】？',
    filter: (d) => {
      const p = d.player, c = d.card;
      if (!p || !c || !p.hand.includes(c)) return false;
      const nums = p.hand.map(x => x.num);
      const min = Math.min(...nums);
      if (c.num !== min || nums.filter(n => n === min).length !== 1) return false;
      const suits = p.flags.sySuits || ['heart'];
      if (!suits.includes(c.suit)) return false;
      const used = (p.flags.syTurn === d.game.turnCount) ? (p.flags.syN || 0) : 0;
      return c.num > used;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, c = ctx.data.card;
      if (p.flags.syTurn !== g.turnCount) { p.flags.syTurn = g.turnCount; p.flags.syN = 0; }
      p.flags.syN = (p.flags.syN || 0) + 1;
      const hide = p.hand.filter(x => x.suit === c.suit && x !== c);
      for (const x of hide) {
        const i = p.hand.indexOf(x);
        if (i >= 0) p.hand.splice(i, 1);
      }
      p.flags.syHide = [...(p.flags.syHide || []), ...hide];
      await ctx.draw(p, 1, { reason: 'shunyi' });
      await ctx.log(`【顺逸】：${p.name} 将 ${hide.length} 张${SUIT_CN[c.suit]}牌扣置于武将牌上，然后摸一张牌`);
    },
  }, {
    on: 'turn.end', who: 'any',
    filter: (d) => (d.player.flags.syHide || []).length > 0,
    async effect(ctx) {
      const p = ctx.self;
      const back = p.flags.syHide || [];
      p.flags.syHide = [];
      p.hand.push(...back);
      p.flags.syN = 0;
      await ctx.log(`【顺逸】：${p.name} 收回扣置于武将牌上的 ${back.length} 张牌`);
    },
  }],
});

defineSkill({
  id: 'biwei', name: '鄙位',
  desc: '出牌阶段限一次，你可以弃置一张点数最大的手牌并选择一名其他角色，令其弃置所有点数大于等于此牌的手牌。若其未因此弃置牌，复原此技能。',
  active: {
    prompt: '鄙位：弃置一张点数最大的手牌，令一名其他角色弃置所有点数不小于此牌的手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.bwTurn !== g.turnCount) { p.flags.bwTurn = g.turnCount; p.flags.bwN = 0; p.flags.bwAgain = false; }
      if ((p.flags.bwN || 0) > 0 && !p.flags.bwAgain) { await ctx.log('✗【鄙位】本阶段已发动过'); return; }
      if (!p.hand.length) { await ctx.log('✗【鄙位】没有手牌'); return; }
      const nums = p.hand.map(c => c.num);
      const max = Math.max(...nums);
      const c = p.hand.find(x => x.num === max);
      await ctx.discard(p, [c], { reason: 'biwei' });
      p.flags.bwN = (p.flags.bwN || 0) + 1;
      const cands = g.alive().filter(q => q !== p);
      if (!cands.length) return;
      const tg = await g.chooseTargets(p, { candidates: cands, min: 1, max: 1, prompt: '【鄙位】：选择一名其他角色' });
      const target = tg[0] || cands[0];
      const drop = target.hand.filter(x => x.num >= c.num);
      if (drop.length) {
        await ctx.discard(target, drop, { reason: 'biwei' });
        p.flags.bwAgain = false;
        await ctx.log(`【鄙位】：${target.name} 弃置 ${drop.length} 张点数不小于 ${c.num} 的手牌`);
      } else {
        p.flags.bwAgain = true;
        await ctx.log(`【鄙位】：${target.name} 未因此弃置牌，此技能复原（可再次发动）`);
      }
    },
  },
});

defineSkill({
  id: 'gongli_cuijun', name: '共砺',
  desc: '锁定技，游戏开始时，你令本局“顺逸”添加X种可触发的花色（X为全场友武将数）。',
  triggers: [{
    on: 'game.start', who: 'any',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = youCountAll(g);
      const extra = ['spade', 'club', 'diamond'].slice(0, Math.max(0, x - 1));
      p.flags.sySuits = ['heart', ...extra];
      await ctx.log(`【共砺】：${p.name} 的【顺逸】可触发花色：${p.flags.sySuits.map(s => SUIT_CN[s]).join('、')}`);
    },
  }],
});
