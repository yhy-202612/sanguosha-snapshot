// 神话再临·火（7 将 / 14 技能）
// 典韦【强袭】在 lin.js（火包首位，历史原因），本文件只含其余 7 将。
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

function elementPools(t) {
  const out = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
  return out.filter(Boolean);
}

// ================= 魏 · 荀彧 =================
// 驱虎：出牌阶段限一次，你可以与一名体力值大于你的角色拼点。若你赢，你令该角色对其攻击范围内
//       由你指定的另一名角色造成 1 点伤害；若你没赢，该角色对你造成 1 点伤害。
defineSkill({
  id: 'quhu', name: '驱虎',
  desc: '出牌阶段限一次，你可以与一名体力值大于你的角色拼点。若你赢，你令其对其攻击范围内你指定的一名角色造成 1 点伤害；若你没赢，其对你造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '与一名体力值大于你的角色拼点，赢则驱使其攻击，没赢则受伤',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.hp > p.hp);
      if (!cands.length) { await ctx.log('【驱虎】：没有体力值大于你的角色'); return; }
      if (!p.hand.length) { await ctx.log('【驱虎】：你没有手牌可拼点'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【驱虎】：选择拼点对象', candidates: cands, min: 1, max: 1, reason: 'quhu' }))[0];
      if (!t || !t.hand.length) { await ctx.log('【驱虎】：目标没有手牌'); return; }
      const r = await pindian(g, p, t, { reason: '驱虎' });
      if (r.win) {
        const victims = g.alive().filter(x => x !== p && x !== t && g.inAttackRange(t, x));
        if (!victims.length) { await ctx.log('【驱虎】：目标攻击范围内没有其他角色'); return; }
        const v = (await ctx.ask.targets(p, { prompt: `【驱虎】：令 ${t.name} 对谁造成 1 点伤害`, candidates: victims, min: 1, max: 1, reason: 'quhu' }))[0];
        if (!v) return;
        await ctx.damage({ from: t, to: v, amount: 1, reason: 'quhu' });
        await ctx.log(`【驱虎】：${t.name} 对 ${v.name} 造成 1 点伤害`);
      } else {
        await ctx.damage({ from: t, to: p, amount: 1, reason: 'quhu' });
        await ctx.log(`【驱虎】：拼点未赢，${t.name} 对 ${p.name} 造成 1 点伤害`);
      }
    },
  },
});

// 节命：当你受到伤害后，你可以令一名角色将手牌补至 X 张（X 为其体力上限，最多 5）。
defineSkill({
  id: 'jieming', name: '节命',
  desc: '当你受到伤害后，你可以令一名角色将手牌补至 X 张（X 为其体力上限，且最多为 5）。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.self === d.player && (d.amount || 0) > 0 && d.player.alive,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { prompt: '【节命】：令一名角色补手牌', candidates: g.alive(), min: 1, max: 1, reason: 'jieming' }))[0];
      if (!t) return;
      const x = Math.min(5, t.maxHp);
      const n = Math.max(0, x - t.hand.length);
      if (n > 0) await ctx.draw(t, n, { reason: 'jieming' });
      await ctx.log(`${p.name} 发动【节命】：${t.name} 补至 ${x} 张（摸 ${n}）`);
    },
  }],
});

// ================= 蜀 · 庞统 =================
// 连环：你可以将一张梅花手牌当【铁索连环】使用（转化规则见 engine/virtual-huo.js）。
defineSkill({
  id: 'lianhuan', name: '连环',
  desc: '你可以将一张梅花手牌当【铁索连环】使用。',
  triggers: [],
});

// 涅槃：限定技，当你处于濒死状态时，你可以弃置所有牌，摸三张牌，将体力回复至 3 点。
defineSkill({
  id: 'niepan', name: '涅槃',
  desc: '限定技，当你处于濒死状态时，你可以弃置所有牌，然后摸三张牌，将体力回复至 3 点。',
  triggers: [{
    on: 'dying.begin', who: 'self', optional: true,
    filter: (d) => d.player.flags.niepanUsed !== true,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.niepanUsed = true;
      const all = [...p.hand, ...Object.values(p.equips).filter(Boolean), ...((p.judgeZone || []).filter(Boolean))];
      if (all.length) await ctx.discard(p, all, { reason: 'niepan' });
      await ctx.draw(p, 3, { reason: 'niepan' });
      p.hp = Math.max(p.hp, 0);
      await ctx.recover(p, 3 - Math.max(0, p.hp), { reason: 'niepan' });
      await ctx.log(`${p.name} 发动限定技【涅槃】：弃置所有牌，摸三张，体力回复至 ${p.hp}`);
    },
  }],
});

// ================= 蜀 · 卧龙诸葛亮 =================
// 八阵：锁定技，若你没有防具，视为装备【八卦阵】（需要【闪】时可判定，红色视为打出【闪】）。
defineSkill({
  id: 'bazhen', name: '八阵',
  desc: '锁定技，若你的装备区里没有防具牌，你视为装备着【八卦阵】。',
  triggers: [{
    on: 'dodge.before', who: 'any', optional: false,
    filter: (d) => d.self === d.player && !d.player.equips.armor && !d.dodged,
    async effect(ctx) {
      const p = ctx.self;
      const j = await ctx.judge(p, { reason: '八阵' });
      const jc = j.card || j;               // judge() 返回 data，牌本体在 .card
      const red = jc.suit === 'heart' || jc.suit === 'diamond';
      if (red) ctx.data.dodged = true;
      await ctx.log(`【八阵】：判定 ${jc.suit ? cardLabel(jc) : '—'}（${red ? '红色，视为打出【闪】' : '黑色，未能闪避'}）`);
    },
  }],
});

// 火计 / 看破：转化规则见 engine/virtual-huo.js
defineSkill({
  id: 'huoji', name: '火计',
  desc: '你可以将一张红色手牌当【火攻】使用。',
  triggers: [],
});
defineSkill({
  id: 'kanpo', name: '看破',
  desc: '你可以将一张黑色手牌当【无懈可击】使用。',
  triggers: [],
});

// ================= 吴 · 太史慈 =================
// 天义：出牌阶段限一次，你可以与一名角色拼点。若你赢，本回合你的攻击范围 +1、
//       使用【杀】无距离限制且可额外使用一张【杀】、使用【杀】可额外指定一个目标；
//       若你没赢，本回合你不能使用【杀】。
defineSkill({
  id: 'tianyi', name: '天义',
  desc: '出牌阶段限一次，你可以与一名角色拼点。若你赢，本回合你使用【杀】无距离限制、可额外使用一张【杀】且可额外指定一个目标；若你没赢，本回合你不能使用【杀】。',
  active: {
    perPhase: true,
    prompt: '与一名角色拼点，赢则本回合强化【杀】，没赢则本回合不能使用【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【天义】：你没有手牌可拼点'); return; }
      const cands = g.alive().filter(x => x !== p && x.hand.length);
      if (!cands.length) { await ctx.log('【天义】：没有可拼点的角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【天义】：选择拼点对象', candidates: cands, min: 1, max: 1, reason: 'tianyi' }))[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: '天义' });
      if (r.win) {
        p.flags.rangeBonus = Math.max(1, p.flags.rangeBonus || 0);
        p.flags.tianyiTurn = g.turnCount;
        p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + 1;   // 本回合（SG028：本回合类效果必须写 shaExtraTurn）
        p.flags.tianyiExtraTarget = g.turnCount;
        await ctx.log(`${p.name} 发动【天义】并拼点获胜：本回合攻击范围 +1、可额外使用一张【杀】且可额外指定目标`);
      } else {
        p.flags.banShaTurn = g.turnCount;
        await ctx.log(`${p.name} 发动【天义】未获胜：本回合不能使用【杀】`);
      }
    },
  },
});

// ================= 群 · 庞德 =================
// 猛进：当你使用的【杀】被【闪】抵消时，你可以弃置该角色的一张牌。
defineSkill({
  id: 'mengjin', name: '猛进',
  desc: '当你使用的【杀】被【闪】抵消时，你可以弃置该角色的一张牌。',
  triggers: [{
    on: 'sha.dodged', who: 'any', optional: true,
    filter: (d) => d.self === d.player && d.target && d.target.alive !== false,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.target;
      const pool = elementPools(t);
      if (!pool.length) { await ctx.log('【猛进】：对方没有可弃置的牌'); return; }
      const c = pool[Math.floor(Math.random() * pool.length)];
      await ctx.discard(t, [c], { reason: 'mengjin' });
      await ctx.log(`${p.name} 发动【猛进】，弃置 ${t.name} 的 ${cardLabel(c)}`);
    },
  }],
});

// ================= 群 · 袁绍 =================
// 乱击：你可以将两张花色相同的手牌当【万箭齐发】使用（转化规则见 engine/virtual-huo.js）。
defineSkill({
  id: 'luanji', name: '乱击',
  desc: '你可以将两张花色相同的手牌当【万箭齐发】使用。',
  triggers: [],
});

// 血裔：锁定技，你的手牌上限 +2X（X 为其他群雄角色数）。
defineSkill({
  id: 'xueyi', name: '血裔',
  desc: '锁定技，你的手牌上限 +2X（X 为场上其他群雄角色的数量）。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: () => true,
    async effect(ctx) {
      const p = ctx.self;
      const x = ctx.game.alive().filter(o => o !== p && o.kingdom === 'qun').length;
      p.flags.handLimit = 2 * x;
    },
  }],
});

// ================= 群 · 颜良文丑 =================
// 双雄：摸牌阶段（本项目实现为出牌阶段开始时）你可以改为判定并获得此判定牌，
//       本回合你可以将与判定牌颜色不同的手牌当【决斗】使用。
defineSkill({
  id: 'shuangxiong', name: '双雄',
  desc: '出牌阶段开始时，你可以进行判定并获得此判定牌，本回合你可以将与此判定牌颜色不同的手牌当【决斗】使用。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const j = await ctx.judge(p, { reason: '双雄' });
      const jc = j.card;
      if (!jc) { await ctx.log('【双雄】：判定牌为空'); return; }
      const pile = g.discardPile;
      const i = pile.indexOf(jc);
      if (i >= 0) pile.splice(i, 1);
      await ctx.gain(p, [jc], { reason: 'shuangxiong' });
      p.flags.shuangxiongTurn = g.turnCount;
      p.flags.shuangxiongSuit = jc.suit;
      await ctx.log(`${p.name} 发动【双雄】：获得判定牌 ${cardLabel(jc)}，本回合异色手牌可当【决斗】`);
    },
  }],
});

export const HUO_SKILL_IDS = ['quhu', 'jieming', 'lianhuan', 'niepan', 'bazhen', 'huoji', 'kanpo',
  'tianyi', 'mengjin', 'luanji', 'xueyi', 'shuangxiong'];
