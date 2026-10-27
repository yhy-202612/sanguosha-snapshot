// 神话再临·风（SG006）：夏侯渊 / 曹仁 / 黄忠 / 魏延 / 小乔 / 周泰 / 张角
// 武将 id 统一使用 feng_ 前缀；技能 id 不带包前缀，避免引擎的 jie_/mou_/ji_ 降级逻辑。
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, isRed, suitOf } from '../engine/cards.js';

// 直接从手牌选一张：不走 respondCard，避免再次触发 respond.need（武圣/龙胆等）造成递归。
async function pickHand(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  const res = await ctx.game.ask(player, 'card', {
    prompt, cards: cands.map(c => c.id), optional: true, reason: 'skill',
  });
  if (!res || !res.cardId) return null;
  return cands.find(c => c.id === res.cardId) || null;
}

// 虚拟基本牌（不新建实体牌，只用于「视为使用一张【杀】」）
function virtualBasic(game, name) {
  const n = (game.__virtualSeq = (game.__virtualSeq || 0) + 1);
  return { id: `v${n}`, name, suit: 'none', num: 0, type: 'basic', virtual: true };
}

function equipPool(player) {
  return [...player.hand, ...Object.values(player.equips).filter(Boolean)]
    .filter(c => CARD_META[c.name]?.sub);
}

// ================= 魏 =================

// 夏侯渊 · 神速：每回合可选择两项各一次，每选择一项视为使用一张无距离限制的【杀】。
defineSkill({
  id: 'shensu', name: '神速',
  desc: '你可以做出以下选择：1. 跳过判定阶段和摸牌阶段；2. 跳过出牌阶段并弃置一张装备牌。你每选择一项，视为对一名其他角色使用一张无距离限制的【杀】。',
  active: {
    perTurn: false,
    prompt: '选择一项，视为使用一张无距离限制的【杀】（每回合两项各一次）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.shensuTurn !== g.turnCount) {
        p.flags.shensuTurn = g.turnCount;
        p.flags.shensuOpts = {};
        p.flags.shensuCount = 0;
      }
      const used = p.flags.shensuOpts || {};
      const options = [];
      if (!used[1]) options.push({ key: 1, label: '1. 跳过判定阶段和摸牌阶段' });
      if (!used[2] && equipPool(p).length) options.push({ key: 2, label: '2. 跳过出牌阶段并弃置一张装备牌' });
      if (!options.length) { await ctx.log(`【神速】：本回合已无可发动项`); return; }
      const idx = await ctx.ask.choose(p, options.map(o => o.label), { prompt: '【神速】：选择一项', reason: 'shensu' });
      if (idx < 0) return;
      const opt = options[idx].key;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) { used[opt] = true; await ctx.log('【神速】：没有可指定的目标'); return; }
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【神速】：选择【杀】的目标（无距离限制）' });
      if (!ts.length) return;
      used[opt] = true;
      p.flags.shensuCount = (p.flags.shensuCount || 0) + 1;
      if (opt === 1) {
        ctx.skipPhase(p, 'judge');
        ctx.skipPhase(p, 'draw');
        await ctx.log(`${p.name} 发动【神速】：跳过判定阶段和摸牌阶段`);
      } else {
        const pool = equipPool(p);
        const c = pool.length === 1 ? pool[0] : await pickHand(ctx, p, x => pool.includes(x), '【神速】：弃置一张装备牌');
        if (c) await ctx.discard(p, [c], { reason: 'shensu' });
        ctx.skipPhase(p, 'play');
        await ctx.log(`${p.name} 发动【神速】：跳过出牌阶段${c ? '并弃置 ' + cardLabel(c) : ''}`);
      }
      await ctx.useCard({
        from: p, card: virtualBasic(g, 'sha'), targets: [ts[0]],
        reason: 'shensu', ignoreRange: true, ignoreShaLimit: true,
      });
    },
  },
});

// 曹仁 · 据守：结束阶段摸三张牌，然后翻面。
// 引擎的 active 技能只在出牌阶段可点；为让 AI 白名单（jushou）真正生效，同时注册 active 与结束阶段触发，
// 两者共用 act_jushou 计数，保证同一回合最多一次。
defineSkill({
  id: 'jushou', name: '据守',
  desc: '结束阶段，你可以摸三张牌，然后翻面。',
  active: {
    perTurn: true,
    prompt: '摸三张牌，然后翻面',
    async effect(ctx) {
      await ctx.draw(ctx.self, 3, { reason: 'jushou' });
      await ctx.flip(ctx.self);
    },
  },
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && !(d.self.flags.act_jushou >= 1),
    async effect(ctx) {
      ctx.self.flags.act_jushou = (ctx.self.flags.act_jushou || 0) + 1;
      await ctx.draw(ctx.self, 3, { reason: 'jushou' });
      await ctx.flip(ctx.self);
    },
  }],
});

// ================= 蜀 =================

// 黄忠 · 烈弓：出牌阶段使用【杀】指定目标后，满足条件可令此【杀】不可被【闪】响应。
defineSkill({
  id: 'liegong', name: '烈弓',
  desc: '当你于出牌阶段使用【杀】指定目标后，若该角色的手牌数不小于你的体力值，或不大于你的攻击范围，你可以令此【杀】不可被【闪】响应。',
  triggers: [{
    on: 'target.after', who: 'self', optional: true,
    filter: (d) => !!(d.card && d.card.name === 'sha' && d.target && d.target !== d.self)
      && (d.game.phase === 'play' || !d.game.phase)
      && (d.target.hand.length >= d.self.hp || d.target.hand.length <= d.game.attackRange(d.self)),
    async effect(ctx) {
      if (ctx.data.shaCtx) ctx.data.shaCtx.unavoidable = true;
      await ctx.log(`【烈弓】生效：${ctx.data.target.name} 不能使用【闪】响应此【杀】`);
    },
  }],
});

// 魏延 · 狂骨：对距离 1 以内的角色造成 1 点伤害后回复 1 点体力。
defineSkill({
  id: 'kuanggu', name: '狂骨',
  desc: '锁定技，当你对距离 1 以内的一名角色造成 1 点伤害后，你回复 1 点体力。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => d.from === d.player && d.self !== d.player && d.self.alive !== false
      && (d.amount || 0) >= 1 && d.game.distance(d.player, d.self) <= 1,
    async effect(ctx) {
      await ctx.recover(ctx.self, 1, { reason: 'kuanggu' });
      await ctx.log(`${ctx.self.name} 发动【狂骨】，回复 1 点体力`);
    },
  }],
});

// ================= 吴 =================

// 小乔 · 天香：弃一张红桃手牌，将受到的伤害转移给另一名角色，然后其摸 X 张（X=已损失体力）。
defineSkill({
  id: 'tianxiang', name: '天香',
  desc: '当你受到伤害时，你可以弃置一张红桃手牌并选择一名其他角色。若如此做，你将此伤害转移给该角色，然后该角色摸 X 张牌（X 为其已损失的体力值）。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: true,
    filter: (d) => !d.canceled && (d.amount || 0) > 0 && d.self.alive
      && d.self.hand.some(c => suitOf(d.self, c) === 'heart')
      && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self;
      const c = await pickHand(ctx, p, x => suitOf(p, x) === 'heart', '【天香】：弃置一张红桃手牌，转移此伤害');
      if (!c) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: ctx.game.alive().filter(x => x !== p), prompt: '【天香】：将伤害转移给谁？' });
      if (!ts.length) return;
      const t = ts[0];
      await ctx.discard(p, [c], { reason: 'tianxiang' });
      ctx.data.to = t;
      ctx.data.afterDamage = async () => {
        if (!t.alive) return;
        const lost = Math.max(0, t.maxHp - t.hp);
        await ctx.log(`【天香】：${t.name} 已损失 ${lost} 点体力，摸 ${lost} 张牌`);
        if (lost > 0) await ctx.draw(t, lost, { reason: 'tianxiang' });
      };
      await ctx.log(`${p.name} 发动【天香】，将伤害转移给 ${t.name}`);
    },
  }],
});

// 小乔 · 红颜：锁定技，黑桃牌视为红桃牌（具体映射在 engine/cards.js 的 suitOf / isRedFor）。
defineSkill({
  id: 'hongyan', name: '红颜',
  desc: '锁定技，你的黑桃牌均视为红桃牌。',
  triggers: [],
});

// 周泰 · 不屈：濒死时的「创」堆由引擎 M9 处理（见 game.js dying）。
defineSkill({
  id: 'buqu', name: '不屈',
  desc: '锁定技，当你处于濒死状态时，你将牌堆顶的一张牌置于你的武将牌上，称为「创」；若此牌点数与已有「创」点数均不同，你将体力回复至 1 点；若相同，将此牌置入弃牌堆，然后移去所有「创」，继续濒死结算。你的手牌上限 -「创」数。',
  triggers: [],
});

// ================= 群 =================

// 张角 · 雷击：使用/打出【闪】时，可令一名角色判定，黑桃则造成 2 点雷电伤害。
// 实现口径：在 respond.need（要求【闪】）时接管本次响应，打出【闪】并发动雷击。
defineSkill({
  id: 'leiji', name: '雷击',
  desc: '当你使用或打出【闪】时，你可以令一名角色进行判定：若结果为黑桃，你对其造成 2 点雷电伤害。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => !!(d.filter && d.filter.name === 'shan') && d.self.hand.some(c => c.name === 'shan'),
    async effect(ctx) {
      const p = ctx.self;
      const c = await pickHand(ctx, p, x => x.name === 'shan', '【雷击】：打出一张【闪】并发动雷击');
      if (!c) return;
      ctx.data.handled = true;
      ctx.data.card = c;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: ctx.game.alive(), prompt: '【雷击】：选择一名角色进行判定' });
      if (!ts.length) return;
      const j = await ctx.judge(ts[0], { reason: '雷击' });
      if (j.suit === 'spade') {
        await ctx.log(`【雷击】：判定为黑桃，对 ${ts[0].name} 造成 2 点雷电伤害`);
        await ctx.damage({ from: p, to: ts[0], amount: 2, nature: 'thunder', reason: 'leiji' });
      } else {
        await ctx.log(`【雷击】：判定不为黑桃，未造成伤害`);
      }
    },
  }],
});

// 张角 · 鬼道：判定牌生效前，可打出一张黑色牌替换之（与标准包【鬼才】同构，限定黑色牌）。
defineSkill({
  id: 'guidao', name: '鬼道',
  desc: '当一名角色的判定牌生效前，你可以打出一张黑色牌替换之。',
  triggers: [{
    on: 'judge.before', who: 'any', optional: true,
    filter: (d) => !!d.self && d.self.alive !== false
      && d.player.hand.some(c => !isRed({ suit: suitOf(d.player, c) })),
    async effect(ctx) {
      const p = ctx.self;
      const c = await pickHand(ctx, p, x => !isRed({ suit: suitOf(p, x) }), '【鬼道】：打出一张黑色牌替换判定牌');
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'guidao' });
      ctx.data.suit = suitOf(p, c);
      ctx.data.num = c.num;
      await ctx.log(`${p.name} 发动【鬼道】，判定改为 ${cardLabel(c)}`);
    },
  }],
});

// 于吉 · 蛊惑（M10 简化版）：出牌阶段限一次，将一张手牌声明为任意基本牌/非延时锦囊使用；
// 其他角色可依次质疑 —— 无人质疑则按声明生效；亮牌为真则质疑者各失去 1 点体力，
// 为假则质疑者各摸一张牌且此牌作废。
defineSkill({
  id: 'guhuo', name: '蛊惑',
  desc: '出牌阶段限一次，你可以将一张手牌声明为任意基本牌或非延时锦囊牌并使用。其他角色可依次质疑：若无人质疑，此牌按你声明的牌生效；若有人质疑，亮出此牌——声明为真则质疑者各失去 1 点体力，声明为假则质疑者各摸一张牌且此牌作废。',
  active: {
    perTurn: true,
    prompt: '将一张手牌声明为任意基本牌 / 非延时锦囊使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) return;
      const res = await g.ask(p, 'card', {
        prompt: '【蛊惑】：选择一张手牌', cards: p.hand.map(c => c.id), optional: true, reason: 'guhuo',
      });
      const card = p.hand.find(c => c.id === (res?.cardId || res?.id));
      if (!card) return;
      const names = Object.keys(CARD_META).filter((k) => {
        const m = CARD_META[k];
        if (k === 'shan' || k === 'wuxie') return false; // 不能主动使用
        return m.type === 'basic' || (m.type === 'trick' && !m.delayed);
      });
      if (!names.length) return;
      const idx = await ctx.ask.choose(p, names.map(k => CARD_META[k].cn), { prompt: '【蛊惑】：声明此牌为？' });
      if (!(idx >= 0) || idx >= names.length) return;
      const declared = names[idx];
      const cn = CARD_META[declared].cn;
      // 质疑
      const doubters = [];
      for (const o of g.alive()) {
        if (o === p) continue;
        const yes = await g.confirm(o, `【蛊惑】：${p.name} 声称此牌为【${cn}】，是否质疑？`);
        if (yes) doubters.push(o);
      }
      if (!doubters.length) {
        await ctx.log(`【蛊惑】：无人质疑，按【${cn}】结算`);
        const rule = CARD_META[declared].target;
        let targets = [];
        if (rule && typeof rule !== 'function' && (rule.max ?? 1) > 0) {
          const probe = g.canUse(p, card, [], declared, null, {});
          const cands = probe.candidates || [];
          if (cands.length) {
            const ts = await ctx.ask.targets(p, {
              min: rule.min ?? 1, max: rule.max ?? 1, candidates: cands,
              prompt: `【蛊惑】：为【${cn}】指定目标`,
            });
            targets = ts || [];
          }
        }
        card.__guhuo = true;
        let ok = false;
        try {
          ok = await g.useCard({
            from: p, card, asName: declared, virtual: true, targets, reason: 'guhuo',
            ignoreRange: false,
          });
        } finally {
          delete card.__guhuo;
        }
        if (!ok) await ctx.log(`【蛊惑】：【${cn}】未能使用`);
        return;
      }
      await g.revealCards([card], { reason: '【蛊惑】亮牌' });
      const truth = card.name === declared;
      if (truth) {
        await ctx.log(`【蛊惑】：亮牌为真（${cardLabel(card)}），质疑者各失去 1 点体力`);
        for (const d of doubters) await g.loseHp(d, 1, { from: p, reason: 'guhuo' });
      } else {
        await ctx.log(`【蛊惑】：亮牌为假（${cardLabel(card)}），质疑者各摸一张牌，此牌作废`);
        for (const d of doubters) await ctx.draw(d, 1, { reason: 'guhuo' });
        const still = p.hand.includes(card);
        if (still) await ctx.discard(p, [card], { reason: 'guhuo' });
        else {
          const di = g.discardPile.indexOf(card);
          if (di < 0) g.discardPile.push(card);
        }
      }
    },
  },
});

export {};
