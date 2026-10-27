// OL「魔」系列（第一批 2 将：魔司马懿 / 魔曹操）
// 依赖机制：M4 入魔形态（player.form = 'demon'）、M6 勾玉颜色（game.jadeColor）
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const vcard = (name, type = 'basic', suit = 'spade', num = 7) => ({ id: `vm${++vseq}`, name, suit, num, type, virtual: true });

const roundIdxOf = (g) => Math.floor(((g?.turnCount || 1) - 1) / Math.max(1, (g?.players || []).length));

// ==================== 魔司马懿 · 诡伏 ====================
// 每轮开始时或你体力值变化后，你获得一张不计入手牌上限的【闪】。技能或牌造成伤害后，你记录此技能或牌名。
// 你可将因此技能获得的【闪】当做记录的牌名使用（不计入次数限制，每回合每种牌名限一次）。
defineSkill({
  id: 'guifu', name: '诡伏',
  // ★SG030 A1.1：诡伏容器会混入 vcard 虚拟牌（合成牌）→ 只清空、不返回，
  //   否则回收后弃牌堆会出现 vm999 这类非法牌。
  reclaimCards(p) { p.flags.guifu = []; return []; },
  desc: '每轮开始时或你体力值变化后，你获得一张不计入手牌上限的【闪】。技能或牌造成伤害后，你记录此技能或牌名。你可将因此技能获得的【闪】当做记录的牌名使用（不计入次数限制，每回合每种牌名限一次）。',
  triggers: [
    {
      // 每轮开始时
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player && roundIdxOf(d.game) !== d.self.flags.guifuRound,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.guifuRound = roundIdxOf(g);
        p.flags.guifu = p.flags.guifu || [];
        const c = vcard('shan');
        c.skillTag = 'guifu';
        p.flags.guifu.push(c);
        await ctx.log(`【诡伏】：获得一张【闪】（诡伏），不计入手牌上限`);
      },
    },
    {
      // 体力值变化后（受伤）
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => d.player.hp !== (d.player.flags.guifuHpLast ?? d.player.hp),
      async effect(ctx) {
        const p = ctx.self;
        if (p.flags.guifuHpLast === p.hp) return;
        p.flags.guifuHpLast = p.hp;
        p.flags.guifu = p.flags.guifu || [];
        const c = vcard('shan'); c.skillTag = 'guifu';
        p.flags.guifu.push(c);
        await ctx.log('【诡伏】：体力值变化，获得一张【闪】（诡伏）');
      },
    },
    {
      // 体力值变化后（回复）
      on: 'hp.recover', who: 'self', optional: false,
      filter: (d) => true,
      async effect(ctx) {
        const p = ctx.self;
        if (p.flags.guifuHpLast === p.hp) return;
        p.flags.guifuHpLast = p.hp;
        p.flags.guifu = p.flags.guifu || [];
        const c = vcard('shan'); c.skillTag = 'guifu';
        p.flags.guifu.push(c);
        await ctx.log('【诡伏】：体力值变化，获得一张【闪】（诡伏）');
      },
    },
    {
      // 记录造成伤害的技能 / 牌名
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.player.alive !== false,
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        const tag = d.reason || d.card?.name;
        if (!tag) return;
        p.flags.guifuRec = p.flags.guifuRec || [];
        if (!p.flags.guifuRec.includes(tag)) {
          p.flags.guifuRec.push(tag);
          await ctx.log(`【诡伏】：记录「${tag}」（共 ${p.flags.guifuRec.length} 项）`);
        }
      },
    },
    {
      // 回合开始刷新「每回合每种牌名限一次」计数
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) { ctx.self.flags.guifuUsed = {}; },
    },
  ],
});

// ==================== 魔司马懿 · 谋变 ====================
// 准备阶段，若「诡伏」记录数至少为 3，你可入魔，获得你「诡伏」记录的技能，并获得「骤袭」。
// 入魔后，每轮结束时，若本轮你未造成过伤害，你失去 1 点体力。
defineSkill({
  id: 'moubian', name: '谋变',
  desc: '准备阶段，若你「诡伏」记录数至少为 3，你可以入魔，获得你「诡伏」记录的技能，并获得「骤袭」。入魔后，每轮结束时，若本轮你未造成过伤害，你失去 1 点体力。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare' && (d.self.flags.guifuRec || []).length >= 3 && d.self.form !== 'demon',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        await g.setForm(p, 'demon', '谋变');
        // 获得「诡伏」记录中可命名的技能（能对应到已注册技能的记录）
        for (const rec of p.flags.guifuRec) {
          const key = String(rec).replace(/^skill:/, '');
          if (getSkill(key) && !effSkills(p).some(s => s.id === key)) {
            p.skills.push(getSkill(key));
            await ctx.log(`【谋变】：获得记录技能【${getSkill(key).name}】`);
          }
        }
        if (!effSkills(p).some(s => s.id === 'zhouxi')) {
          const sk = getSkill('zhouxi'); if (sk) p.skills.push(sk);
        }
        await ctx.log('【谋变】：入魔，获得【骤袭】');
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.player.form === 'demon',
      async effect(ctx) { ctx.self.flags.guifuDmgTurn = ctx.game.turnCount; },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => {
        const g = d.game, n = Math.max(1, g.players.length);
        return d.player.form === 'demon' && g.turnCount % n === 0;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        // 本轮（最近 n 个回合）内是否造成过伤害
        const n = Math.max(1, g.players.length);
        const start = g.turnCount - n + 1;
        if ((p.flags.guifuDmgTurn || -1) >= start) return;
        await ctx.log('【谋变】：本轮未造成伤害，失去 1 点体力');
        await ctx.loseHp(p, 1);
      },
    },
  ],
});

// ==================== 魔司马懿 · 骤袭 ====================
// 准备阶段，你从三个可造成伤害的技能中选择一个获得至你的下回合开始。
defineSkill({
  id: 'zhouxi', name: '骤袭',
  desc: '准备阶段，你从三个可造成伤害的技能中选择一个获得至你的下回合开始。（本实现：选择【杀】/【决斗】/【火攻】之一，获得对应的转化能力）',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.self.form === 'demon',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const opts = ['sha', 'juedou', 'huogong'];
      const idx = await ctx.ask.choose(p, opts.map(k => `【诡伏】的【闪】当【${CARD_META[k]?.cn || k}】使用`), { prompt: '【骤袭】：选择一项获得至你的下回合开始', reason: 'zhouxi' });
      const pick = opts[idx];
      if (!pick) return;
      p.flags.zhouxiAs = pick;
      p.flags.zhouxiUntil = g.turnCount + g.players.length;
      await ctx.log(`【骤袭】：获得「诡伏」的【闪】当【${CARD_META[pick]?.cn || pick}】使用`);
    },
  }],
});

// ==================== 魔曹操 · 覆载 ====================
// 锁定技，你的装备牌只能当【借刀】或【无中生有】使用。若你的装备区里没有牌，你视为装备着一张武器牌和防具牌。
defineSkill({
  id: 'fuzai', name: '覆载', form: undefined,
  desc: '锁定技，你的装备牌只能当【借刀】或【无中生有】使用。若你的装备区里没有牌，你视为装备着一张武器牌和防具牌（攻击范围等于你当前体力值）。',
  triggers: [{
    on: 'equip.change', who: 'self', optional: false,
    filter: () => false,   // 纯展示型锁定技，规则由引擎 attackRange / equipCard 负责
    async effect() { },
  }],
});

// ==================== 魔曹操 · 霸朝 ====================
// 出牌阶段开始时，你可以令所有其他角色同时选择是否交给你一张牌，然后你可对未以此法交给你非基本牌的一名角色造成 1 点伤害；
// 若你选择自己，本阶段你使用当前手牌无次数和距离限制并入魔。
// 入魔：每局游戏限一次，入魔后每轮结束时，若本轮你未造成过伤害，你失去 1 点体力。
defineSkill({
  id: 'bachao', name: '霸朝',
  desc: '出牌阶段开始时，你可以令所有其他角色同时选择是否交给你一张牌，然后你可以对未以此法交给你非基本牌的一名角色造成 1 点伤害，若你选择自己，本阶段你使用当前手牌无次数和距离限制并入魔。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const others = g.alive().filter(x => x !== p);
      const nonBasicGivers = [];
      for (const q of others) {
        if (!q.hand.length) continue;
        const yes = await ctx.ask.confirm(q, `【霸朝】：${p.name} 令你选择是否交给他一张牌`);
        if (!yes) continue;
        const c = q.hand[g.rng.int(q.hand.length)];
        if (CARD_META[c.name]?.type !== 'basic') nonBasicGivers.push(q);
        await ctx.gain(p, [c], { from: q, reason: 'bachao' });
      }
      if (nonBasicGivers.length) {
        const idx = await ctx.ask.choose(p, ['对未交非基本牌的一名角色造成 1 点伤害', '选择自己：本阶段无次数与距离限制并入魔'], { prompt: '【霸朝】：选择一项', reason: 'bachao' });
        const pick = ['damage', 'self'][idx];
        if (pick === 'damage') {
          const t = (await ctx.ask.targets(p, { prompt: '【霸朝】：选择受到 1 点伤害的角色', candidates: nonBasicGivers, min: 1, max: 1 }))[0];
          if (t) { await ctx.damage({ from: p, to: t, amount: 1, reason: 'bachao' }); await ctx.log(`【霸朝】：对 ${t.name} 造成 1 点伤害`); }
        } else if (pick === 'self') {
          p.flags.shaUnlimited = g.turnCount;
          p.flags.freeRangeTurn = g.turnCount;
          if (p.form !== 'demon') {
            await g.setForm(p, 'demon', '霸朝');
            if (!effSkills(p).some(s => s.id === 'ru_ma')) { const sk = getSkill('ru_ma'); if (sk) p.skills.push(sk); }
          }
          await ctx.log('【霸朝】：选择自己——本阶段使用手牌无次数和距离限制，并入魔');
        }
      }
    },
  }],
});

// ==================== 入魔（通用被动）====================
// 入魔：每局游戏限一次；入魔后，每轮结束时，若本轮你未造成过伤害，你失去 1 点体力。
defineSkill({
  id: 'ru_ma', name: '入魔',
  desc: '每局游戏限一次。入魔后，每轮结束时，若本轮你未造成过伤害，你失去 1 点体力。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.player.form === 'demon',
      async effect(ctx) { ctx.self.flags.demonDmgTurn = ctx.game.turnCount; },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => {
        const g = d.game, n = Math.max(1, g.players.length);
        return d.player.form === 'demon' && effSkills(d.player).some(s => s.id === 'ru_ma') && g.turnCount % n === 0;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, n = Math.max(1, g.players.length);
        const start = g.turnCount - n + 1;
        if ((p.flags.demonDmgTurn || -1) >= start) return;
        await ctx.log('【入魔】：本轮未造成伤害，失去 1 点体力');
        await ctx.loseHp(p, 1);
      },
    },
  ],
});

export const MO_SKILL_IDS = ['guifu', 'moubian', 'zhouxi', 'fuzai', 'bachao', 'ru_ma'];
