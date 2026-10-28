// 玩家自定义武将（pack: custom）
// 规范见 docs/SKILL-AUTHORING.md
import { defineSkill, effSkills } from '../engine/skill.js';
import { cardLabel, CARD_META } from '../engine/cards.js';

const others = (g, p) => g.alive().filter(x => x !== p);
const QIAO_WEAPONS = ['nupao', 'zhuge', 'zhuque'];   // 「巧」武器牌：弩炮、诸葛连弩、朱雀羽扇
const QIAO_ARMORS = ['bagua', 'tengjia'];            // 「巧」防具牌：八卦阵、藤甲

// ============================================================ 极·庞统

// 【谋渊】锁定技：当一张牌进入弃牌堆时，你获得 1 点谋略值（上限 5；有谋略值即视为拥有【妙计】）
defineSkill({
  id: 'mouyuan', name: '谋渊',
  desc: '锁定技，当一张牌进入弃牌堆时，你获得 1 点谋略值（上限默认 5，由其它技能决定；拥有谋略值时你视为拥有【妙计】）。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: false,
    filter: (d) => (d.cards || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const got = g.addMoulue(p, ctx.data.cards.length);
      if (got > 0) await ctx.log(`【谋渊】：获得 ${got} 点谋略值（${p.moulue}/${p.moulueMax}）`);
    },
  }],
});

// 【穷谋】锁定技：你的谋略值上限为 10；你复活时，将体力回复至上限
// 与【持恒】配套：持恒把「死→活」这一步做出来，本技能把「上限 10」与「回满」两条静态修正挂上。
defineSkill({
  id: 'qiongmou', name: '穷谋',
  desc: '锁定技，你的谋略值上限为 10；你复活时，将体力回复至上限。',
  triggers: [{
    on: 'game.start', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self;
      p.moulueMax = Math.max(10, p.moulueMax || 5);
      p.flags.reviveToFull = true;      // 【持恒】等复活结算读取此标记
      await ctx.log(`【穷谋】：${p.name} 的谋略值上限为 ${p.moulueMax}，复活时回复至体力上限`);
    },
  }],
});

// 【持恒】持恒技：当你死亡时，可以减少 1 点谋略值，复活并回复至 1 点体力
defineSkill({
  id: 'chiheng', name: '持恒',
  desc: '持恒技，当你死亡时，你可以减少 1 点谋略值，然后复活并回复至 1 点体力（拥有【穷谋】时回复至体力上限）。',
  triggers: [{
    on: 'death.before', who: 'self', optional: false,
    filter: (d) => d.self === d.player && (d.player.moulue || 0) >= 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const toFull = !!(p.flags?.reviveToFull || (p.skills || []).some(s => s && s.id === 'qiongmou'));
      const hpText = toFull ? '体力上限' : '1 点体力';
      const yes = await ctx.ask.confirm(p, `【持恒】：减少 1 点谋略值（当前 ${p.moulue}），复活并回复至${hpText}？`);
      if (!yes) return;
      if (!g.useMoulue(p, 1)) return;
      ctx.data.canceled = true;
      p.alive = true;
      p.hp = toFull ? p.maxHp : 1;
      await ctx.log(`【持恒】：减少 1 点谋略值（剩余 ${p.moulue}/${p.moulueMax}），复活并回复至${hpText}（${p.hp}/${p.maxHp}）`);
    },
  }],
});

// ============================================================ 神黄盖（2 体力 · 护甲体系，上限 10）

// 【铁壁】锁定技：你的护甲值上限为 10
defineSkill({
  id: 'tiebi', name: '铁壁',
  desc: '锁定技，你的护甲值上限为 10。',
  triggers: [{
    on: 'game.start', who: 'self', optional: false,
    async effect(ctx) {
      ctx.self.armorMax = 10;
      ctx.self.armor = ctx.self.armor || 0;
      await ctx.log(`【铁壁】：${ctx.self.name} 的护甲值上限为 10`);
    },
  }],
});

// 【舍甲】出牌阶段限一次：失去 1 点护甲摸 2 张，或减少 1 点体力上限摸 4 张
defineSkill({
  id: 'shejia', name: '舍甲',
  desc: '出牌阶段限一次，你可以选择一项：1. 失去 1 点护甲，摸 2 张牌；2. 减少 1 点体力上限，摸 4 张牌。',
  active: {
    prompt: '舍甲：出牌阶段限一次',
    perPhase: true,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const opts = [];
      if ((p.armor || 0) >= 1) opts.push('失去 1 点护甲 → 摸 2 张牌');
      if (p.maxHp > 1) opts.push('减少 1 点体力上限 → 摸 4 张牌');
      if (!opts.length) { await ctx.log('【舍甲】：护甲为 0 且体力上限已为 1，无法发动'); return; }
      const idx = await ctx.ask.choose(p, opts, { prompt: '【舍甲】：选择一项' });
      if (idx === 0 && (p.armor || 0) >= 1) {
        await ctx.game.setArmor(p, (p.armor || 0) - 1);
        await ctx.draw(p, 2, { reason: 'shejia' });
        await ctx.log(`【舍甲】：失去 1 点护甲（剩余 ${p.armor}/${p.armorMax}），摸 2 张牌`);
      } else if (p.maxHp > 1) {
        p.maxHp -= 1;
        p.hp = Math.min(p.hp, p.maxHp);
        await ctx.draw(p, 4, { reason: 'shejia' });
        await ctx.log(`【舍甲】：体力上限减至 ${p.maxHp}，摸 4 张牌`);
      }
    },
  },
});

// 【焚身】受到 x 点伤害时可取消，改为失去 2x-1 点体力；每失去 1 点体力获得 3 点护甲（求桃前结算）
defineSkill({
  id: 'fenshen', name: '焚身',
  desc: '当你受到 X 点伤害时，你可以取消之；若如此做，你失去 2X-1 点体力，且每因此失去 1 点体力，你获得 3 点护甲（在进入濒死求桃前结算）。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.self === d.player && (d.amount || 0) > 0 && d.to === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = ctx.data.amount || 1;
      const cost = 2 * x - 1;
      const yes = await ctx.ask.confirm(p, `【焚身】：取消这 ${x} 点伤害，改为失去 ${cost} 点体力（每失去 1 点体力获得 3 点护甲）？`);
      if (!yes) return;
      ctx.data.canceled = true;
      await ctx.log(`【焚身】：取消 ${x} 点伤害，改为失去 ${cost} 点体力`);
      // desc 要求「在进入濒死求桃前结算」：必须先一次性发放护甲，再失去体力；
      // 若逐点 loseHp 再 addArmor，中途 hp<=0 进濒死时护甲仍为 0，会连带【复燃】的 armor>0 条件失效。
      await g.addArmor(p, 3 * cost);
      await ctx.loseHp(p, cost, { reason: 'fenshen' });
      await ctx.log(`【焚身】：护甲 ${p.armor}/${p.armorMax}，体力 ${p.hp}/${p.maxHp}`);
    },
  }],
});

// 【三彩】当你连续获得三张花色各不相同的牌时，可二选一
defineSkill({
  id: 'sancai', name: '三彩',
  desc: '当你连续获得三张花色均不相同的牌时，你可以选择一项：1. 你使用的下一张牌无距离与次数限制，且不可被响应；2. 从牌堆底获得一张【桃】或【酒】。',
  triggers: [{
    on: 'cards.gain', who: 'self', optional: false,
    filter: (d) => d.self === d.player && (d.cards || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const seq = p.flags.gainSeq || [];
      for (const c of ctx.data.cards) seq.push(c.suit || 'none');
      while (seq.length > 3) seq.shift();
      p.flags.gainSeq = seq;
      if (seq.length < 3 || new Set(seq).size < 3) return;
      p.flags.gainSeq = [];
      const yes = await ctx.ask.confirm(p, '【三彩】：连续获得三张花色不同的牌，是否发动？');
      if (!yes) return;
      const idx = await ctx.ask.choose(p, ['下一张牌无距离/次数限制且不可被响应', '从牌堆底获得一张【桃】或【酒】'],
        { prompt: '【三彩】：选择一项' });
      if (idx === 0) {
        p.flags.sancaiOnce = true;
        await ctx.log('【三彩】：下一张牌无距离/次数限制且不可被响应');
      } else {
        const i = g.deck.findIndex(c => c.name === 'tao' || c.name === 'jiu');
        if (i < 0) { await ctx.log('【三彩】：牌堆中已无【桃】或【酒】'); return; }
        const [c] = g.deck.splice(i, 1);
        await ctx.gain(p, [c], { reason: 'sancai' });
        await ctx.log(`【三彩】：从牌堆底获得 ${cardLabel(c)}`);
      }
    },
  }],
});

// 【复燃】限定技：死亡且护甲 x≠0 时复活，加 ⌈x/2⌉ 体力上限、回复 x 点体力、摸 x+1 张，然后失去一个技能
defineSkill({
  id: 'fuyan', name: '复燃',
  desc: '限定技，当你死亡时，若你的护甲值 X 不为 0，你可以复活：增加 ⌈X/2⌉ 点体力上限，回复 X 点体力，摸 X+1 张牌；若如此做，你失去一个技能。',
  triggers: [{
    on: 'death.before', who: 'self', optional: false,
    filter: (d) => d.self === d.player && (d.player.armor || 0) > 0 && !d.player.flags.fuyanUsed,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = p.armor || 0;
      const yes = await ctx.ask.confirm(p, `【复燃】：护甲 ${x}，是否复活？（体力上限 +${Math.ceil(x / 2)}，回复 ${x} 点体力，摸 ${x + 1} 张，随后失去一个技能）`);
      if (!yes) return;
      p.flags.fuyanUsed = true;
      ctx.data.canceled = true;
      p.alive = true;
      p.maxHp += Math.ceil(x / 2);
      p.hp = Math.min(p.maxHp, Math.max(1, x));
      await ctx.log(`【复燃】：复活，体力上限 ${p.maxHp}、体力 ${p.hp}，摸 ${x + 1} 张牌`);
      await ctx.draw(p, x + 1, { reason: 'fuyan' });
      // 失去一个技能（排除【复燃】本身）
      const cands = (effSkills(p) || []).filter(s => s.id !== 'fuyan');
      if (cands.length) {
        const idx = await ctx.ask.choose(p, cands.map(s => `失去【${s.name}】`), { prompt: '【复燃】：选择一个要失去的技能' });
        const lose = cands[Math.max(0, Math.min(cands.length - 1, idx))];
        if (lose) {
          await ctx.game.removeSkills(p, [lose.id]);   // ★统一出口（SG030 A2）
          await ctx.log(`【复燃】：${p.name} 失去【${lose.name}】`);
        }
      }
    },
  }],
});

// 【弃甲】每轮限一次：手牌为唯一最多时，弃置所有手牌并重置【复燃】
defineSkill({
  id: 'qijia', name: '弃甲',
  desc: '每轮限一次，当你的手牌数为场上唯一最多时，你可以弃置所有手牌，然后重置【复燃】。',
  active: {
    prompt: '弃甲：每轮限一次',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.qijiaRound === g.round) { await ctx.log('【弃甲】：本轮已发动过'); return; }
      const os = others(g, p);
      if (os.some(x => (x.hand || []).length >= (p.hand || []).length)) { await ctx.log('【弃甲】：你的手牌不是唯一最多'); return; }
      if (!p.hand.length) { await ctx.log('【弃甲】：没有手牌可弃'); return; }
      p.flags.qijiaRound = g.round;
      const cards = p.hand.slice();
      await ctx.discard(p, cards, { reason: 'qijia' });
      p.flags.fuyanUsed = false;
      await ctx.log(`【弃甲】：弃置 ${cards.length} 张手牌，重置【复燃】`);
    },
  },
});

// 【蓄甲】回合开始时摸牌：X = 体力上限 - 体力，X≤3 时摸 X+1，否则摸 X
defineSkill({
  id: 'xujia', name: '蓄甲',
  desc: '回合开始时，你可以摸 X+1 张牌（X≤3）或 X 张牌（X>3），X 为你的体力上限与体力值之差。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: true,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      const x = Math.max(0, p.maxHp - p.hp);
      const n = x <= 3 ? x + 1 : x;
      if (n <= 0) return;
      await ctx.draw(p, n, { reason: 'xujia' });
      await ctx.log(`【蓄甲】：体力上限与体力差 ${x}，摸 ${n} 张牌`);
    },
  }],
});

// 【铸甲】每回合限两次：弃置一张牌，获得 1 点护甲
defineSkill({
  id: 'zhujia', name: '铸甲',
  desc: '每回合限两次，你可以弃置一张牌，获得 1 点护甲。',
  active: {
    prompt: '铸甲：每回合限两次',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const key = `zhujia_${g.turnCount}`;
      if ((p.flags[key] || 0) >= 2) { await ctx.log('【铸甲】：本回合已发动两次'); return; }
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (pool.length < 1) { await ctx.log('【铸甲】：没有牌可弃置'); return; }
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【铸甲】：选择一张牌弃置' });
      if (picks.length < 1) return;
      await ctx.discard(p, picks, { reason: 'zhujia' });
      const got = await g.addArmor(p, 1);
      p.flags[key] = (p.flags[key] || 0) + 1;
      await ctx.log(`【铸甲】：弃置 1 张牌，获得 ${got} 点护甲（${p.armor}/${p.armorMax}，本回合第 ${p.flags[key]} 次）`);
    },
  },
});

// 【馈甲】你可以将一张牌交给一名其他角色，然后失去 1 点体力
defineSkill({
  id: 'kuijia', name: '馈甲',
  desc: '出牌阶段，你可以将一张牌交给一名其他角色，然后失去 1 点体力。',
  active: {
    prompt: '馈甲：将一张牌交给一名其他角色，然后失去 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【馈甲】：没有手牌'); return; }
      const os = others(g, p);
      if (!os.length) return;
      const t = (await g.chooseTargets(p, { candidates: os, min: 1, max: 1, prompt: '【馈甲】：选择一名其他角色', optional: false }))[0];
      if (!t) return;
      const idx = await g.chooseOne(p, p.hand.map(c => cardLabel(c)), { prompt: '【馈甲】：选择交给对方的牌' });
      const c = p.hand[idx];
      if (!c) return;
      await ctx.gain(t, [c], { from: p, reason: 'kuijia' });
      await ctx.loseHp(p, 1, { reason: 'kuijia' });
      await ctx.log(`【馈甲】：将 ${cardLabel(c)} 交给 ${t.name}，失去 1 点体力`);
    },
  },
});

// ============================================================ 天工·诸葛亮（蜀 · 3 体力 · 工标记 + 天机/谋）

// 【巧工】游戏开始时把「弩炮」加入牌堆，并从牌堆底获得一张「巧」武器与一张「巧」防具；
// 失去装备牌时获得 1 点「工」；可移去 2 点「工」把牌堆/弃牌堆中的「巧」武器、防具各一张置入装备区
defineSkill({
  id: 'qiaogong', name: '巧工',
  desc: '游戏开始时，你将「弩炮」加入牌堆，并从牌堆底获得一张「巧」武器牌与一张「巧」防具牌（「巧」武器牌：弩炮、诸葛连弩、朱雀羽扇；「巧」防具牌：八卦阵、藤甲）。当你失去装备牌时，你获得 1 点「工」标记；你可以移去 2 点「工」标记，将牌堆/弃牌堆中的「巧」武器、防具牌各一张置入装备区。',
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        // 弩炮加入牌堆（本牌不常驻牌堆，仅由本技能注入）
        g.deck.push({ id: 'c-nupao', name: 'nupao', suit: 'diamond', num: 8, type: 'equip' });
        g.deck = g.rng.shuffle(g.deck);   // shuffle 返回新数组，必须赋值（否则牌堆未洗）
        await ctx.log(`【巧工】：将「弩炮」加入牌堆，并从牌堆底获得一张「巧」武器与一张「巧」防具`);
        const takeBottom = (pool) => {
          const i = g.deck.findIndex(c => pool.includes(c.name));   // deck[0] 为牌堆底
          if (i < 0) return null;
          const [c] = g.deck.splice(i, 1);
          return c;
        };
        for (const pool of [QIAO_WEAPONS, QIAO_ARMORS]) {
          const c = takeBottom(pool);
          if (!c) continue;
          await g.equipCard(p, c);
          await ctx.log(`【巧工】：从牌堆底获得 ${cardLabel(c)} 并置入装备区`);
        }
      },
    },
    {
      on: 'equip.lose', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        g.addGong(p, 1);
        await ctx.log(`【巧工】：失去装备牌，获得 1 点「工」标记（${g.gongOf(p)}）`);
      },
    },
  ],
  active: {
    prompt: '巧工：游戏开始时',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (g.gongOf(p) < 2) { await ctx.log('【巧工】：需要 2 点「工」标记'); return; }
      const pull = (pool, fromDiscard) => {
        const arr = fromDiscard ? g.discardPile : g.deck;
        const i = arr.findIndex(c => pool.includes(c.name));
        if (i < 0) return null;
        const [c] = arr.splice(i, 1);
        return c;
      };
      let w = pull(QIAO_WEAPONS, false) || pull(QIAO_WEAPONS, true);
      let a = pull(QIAO_ARMORS, false) || pull(QIAO_ARMORS, true);
      if (!w && !a) { await ctx.log('【巧工】：牌堆与弃牌堆中都没有「巧」装备牌'); return; }
      // 按实际拿到的张数扣「工」（每张 1 点）：只找到一张时不应白扣 2 点
      const cost = (w ? 1 : 0) + (a ? 1 : 0);
      g.useGong(p, cost);
      await ctx.log(`【巧工】：移去 ${cost} 点「工」（剩余 ${g.gongOf(p)}）`);
      if (w) await g.equipCard(p, w);
      if (a) await g.equipCard(p, a);
    },
  },
});

// 【天机】锁定技：每轮开始把「天机」转为「谋」；任意角色回合开始把牌堆顶一张牌置为「天机」；
// 「天机」「谋」可当手牌使用/打出（代价：1 点体力或 1 个「工」，由引擎支付）
defineSkill({
  id: 'tianji', name: '天机',
  desc: '锁定技，「天机」无数量上限。每轮开始时，你将所有「天机」置为「谋」；任意角色的回合开始时，你将牌堆顶的一张牌置为「天机」。你可以将「天机」与「谋」当作手牌使用或打出；当你将「天机」或「谋」使用或打出时，你需：1. 扣除 1 点体力；或 2. 移除 1 点「工」标记。',
  triggers: [
    {
      // 注意：round.begin 的 data.self 是「当时开始回合的玩家」，不一定是自己，故用 who:'any'
      on: 'round.begin', who: 'any', optional: false,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const moved = g.tianjiToMou(p);
        if (moved.length) await ctx.log(`【天机】：将 ${moved.length} 张「天机」转为「谋」（${moved.map(c => cardLabel(c)).join('、')}）`);
      },
    },
    {
      on: 'turn.begin', who: 'any', optional: false,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const c = g.popDeck(1)[0];
        if (!c) return;
        g.placeTianji(p, c);
        await ctx.log(`【天机】：将牌堆顶的 ${cardLabel(c)} 置为「天机」`);
      },
    },
  ],
});

// 【天工·登峰】每轮开始：移除 x 点「工」观看牌堆顶 4+4x 张；可弃 y 张手牌得 y 点「工」，
// 也可移除 z 点「工」将其中 z 张置入手牌
defineSkill({
  id: 'dengfeng', name: '天工·登峰',
  desc: '每轮开始时，你可以移除 X 点「工」，观看牌堆顶的 4+4X 张牌（X 可以为 0）；然后分别询问是否发动以下两项：① 弃置 Y 张手牌，获得 Y 点「工」；② 移除 Z 点「工」，将其中 Z 张牌置为你的手牌（两项互不排斥）。',
  triggers: [{
    // 同上：round.begin 的 self 不一定是自己，用 who:'any' + 恒真 filter 保证每轮都能发动
    on: 'round.begin', who: 'any', optional: true,
    filter: () => true,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const gong = g.gongOf(p);
      let x = 0;
      if (gong > 0) {
        const idx = await ctx.ask.choose(p, Array.from({ length: gong + 1 }, (_, i) => `移除 ${i} 点「工」→ 观看牌堆顶 ${4 + 4 * i} 张`),
          { prompt: `【天工·登峰】：选择移除的「工」数（当前 ${gong}）` });
        x = Math.max(0, Math.min(gong, idx));
      }
      if (x > 0) g.useGong(p, x);
      const n = 4 + 4 * x;
      const top = g.deck.slice(Math.max(0, g.deck.length - n));
      // 牌面只写进「只发给本人」的询问提示里，公共日志不列出（否则对手等于白看牌堆顶）
      const faceTxt = top.map(c => cardLabel(c)).join('、');
      await ctx.log(`【天工·登峰】：观看牌堆顶 ${top.length} 张（牌面仅本人可见）`);
      // 后续效果：分别询问是否发动（两项互不排斥，可都发动）
      // ① 弃置 Y 张手牌，获得 Y 点「工」
      if (p.hand.length > 0) {
        const yes1 = await ctx.ask.confirm(p, `【天工·登峰】：观看的牌为 ${faceTxt}。是否弃置若干手牌，获得等量的「工」标记？`);
        if (yes1) {
          const maxY = p.hand.length;
          const y = await ctx.ask.choose(p, Array.from({ length: maxY + 1 }, (_, i) => `弃置 ${i} 张手牌 → 获得 ${i} 点「工」`),
            { prompt: `【天工·登峰】：选择弃置张数（手牌 ${p.hand.length}）` });
          if (y > 0) {
            const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(y, p.hand.length), { prompt: '【天工·登峰】：选择弃置的手牌' });
            if (picks.length) {
              await ctx.discard(p, picks, { reason: 'dengfeng' });
              g.addGong(p, picks.length);
              await ctx.log(`【天工·登峰】：弃置 ${picks.length} 张手牌，获得 ${picks.length} 点「工」（${g.gongOf(p)}）`);
            }
          }
        }
      }
      // ② 移除 Z 点「工」，将观看牌中的 Z 张置入手牌
      const able = Math.min(g.gongOf(p), top.length);
      if (able > 0) {
        const yes2 = await ctx.ask.confirm(p, `【天工·登峰】：观看的牌为 ${faceTxt}。是否移除「工」标记（当前 ${g.gongOf(p)}），将观看牌中的等量牌置入手牌？`);
        if (yes2) {
          const z = await ctx.ask.choose(p, Array.from({ length: able + 1 }, (_, i) => `移除 ${i} 点「工」→ 取其中 ${i} 张入手牌`),
            { prompt: '【天工·登峰】：选择移除的「工」数' });
          if (z > 0) {
            g.useGong(p, z);
            const take = top.slice(0, z);
            for (const c of take) {
              const i = g.deck.indexOf(c);
              if (i >= 0) g.deck.splice(i, 1);
            }
            await ctx.gain(p, take, { reason: 'dengfeng' });
            await ctx.log(`【天工·登峰】：移除 ${z} 点「工」，将 ${take.map(c => cardLabel(c)).join('、')} 置入手牌`);
          }
        }
      } else {
        await ctx.log('【天工·登峰】：「工」或观看的牌不足，无法取牌');
      }
    },
  }],
});

// 【天工·造极】移去 5 点「工」：废除武器区，获得「连击弩炮」
defineSkill({
  id: 'zaoji', name: '天工·造极',
  desc: '你可以移去 5 点「工」标记，并废除武器区，获得「连击弩炮」。',
  active: {
    prompt: '天工·造极：你可以移去 5 点「工」标记',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.lianji) { await ctx.log('【天工·造极】：已拥有「连击弩炮」'); return; }
      if (g.gongOf(p) < 5) { await ctx.log(`【天工·造极】：需要 5 点「工」（当前 ${g.gongOf(p)}）`); return; }
      g.useGong(p, 5);
      const w = p.equips.weapon;
      if (w) {
        // ★走引擎出口派发 equip.lose（SG033 P0-2）
        await g.unequipCard(p, w, { reason: 'zaoji' });
        if (!g.discardPile.includes(w)) g.discardPile.push(w);
        await ctx.log(`【天工·造极】：弃置武器 ${cardLabel(w)}`);
      }
      p.flags.disabledEquip = { ...(p.flags.disabledEquip || {}), weapon: true };
      p.flags.lianji = true;
      await ctx.log(`【天工·造极】：废除武器区，获得「连击弩炮」（使用【杀】后跳弃牌阶段并获得额外回合；与其他角色距离视为 1）`);
    },
  },
});

// 【连击弩炮】当你使用【杀】时，跳过本回合弃牌阶段，获得一个额外回合；你与其他角色距离视为 1
defineSkill({
  id: 'lianji', name: '连击弩炮',
  desc: '当你使用【杀】时，你跳过本回合的弃牌阶段，并获得一个额外回合；你与其他角色的距离视为 1。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.effName === 'sha' && d.player.flags.lianji,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.skip_discard = true;
      const queued = g.queueExtraTurn(p);
      await ctx.log(`【连击弩炮】：跳过本回合弃牌阶段${queued ? '，获得一个额外回合' : ''}`);
    },
  }],
});
