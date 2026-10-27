// 神话再临·林（SG009）：祝融 / 曹丕 / 徐晃 / 孟获 / 孙坚 / 鲁肃 / 董卓 / 贾诩
// 另补典韦（属火包，pack: 'huo'）。
import { defineSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, isRed, suitOf } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

async function pickHand(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  // 注意：ctx.ask.card 走 respondCard（会把牌打出并进弃牌堆）；
  // 这里只需要「选一张手牌待用」，故直接用 game.ask 询问，由调用方决定后续处理。
  const res = await ctx.game.ask(player, 'card', {
    prompt, cards: cands.map(c => c.id), optional: true, reason: 'skill',
  });
  if (!res || !res.cardId) return null;
  return cands.find(c => c.id === res.cardId) || null;
}

const elementPools = (p) => [...p.hand, ...Object.values(p.equips).filter(Boolean)];

// ================= 蜀 =================

// 祝融 · 巨象（锁定技）：【南蛮入侵】对你无效；其他角色使用【南蛮入侵】结算后，你获得之。
defineSkill({
  id: 'juxiang', name: '巨象',
  desc: '锁定技，【南蛮入侵】对你无效；当其他角色使用的【南蛮入侵】结算结束后，你获得之。',
  triggers: [
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => d.card && d.card.name === 'nanman' && (d.amount || 0) > 0,
      async effect(ctx) {
        ctx.data.amount = 0;
        await ctx.log(`${ctx.self.name} 发动【巨象】：【南蛮入侵】对其无效`);
      },
    },
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => d.card && d.card.name === 'nanman' && d.self !== d.player && d.self.alive,
      async effect(ctx) {
        const c = ctx.data.card;
        if (!c) return;
        const pile = ctx.game.discardPile;
        const i = pile.indexOf(c);
        if (i >= 0) pile.splice(i, 1);
        await ctx.gain(ctx.self, [c], { reason: 'juxiang' });
        await ctx.log(`${ctx.self.name} 发动【巨象】，获得 ${cardLabel(c)}`);
      },
    },
  ],
});

// 祝融 · 烈刃：你使用【杀】造成伤害后，可与其拼点，赢则获得其一张牌。
defineSkill({
  id: 'lieren', name: '烈刃',
  desc: '当你使用【杀】对目标角色造成伤害后，你可以与其拼点，若你赢，你获得其一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && d.from === d.player && d.self !== d.player
      && d.self.alive !== false && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self;
      if (!p.hand.length || !t.hand.length) return;
      const r = await pindian(ctx.game, p, t, { reason: '烈刃' });
      if (!r.win) return;
      const pool = elementPools(t);
      if (!pool.length) return;
      const c = pool[Math.floor(Math.random() * pool.length)];
      // 必须带 from，否则目标区域的牌不会摘除（牌会在两处并存）
      await ctx.gain(p, [c], { from: t, reason: 'lieren' });
      await ctx.log(`${p.name} 发动【烈刃】，获得 ${t.name} 的 ${cardLabel(c)}`);
    },
  }],
});

// ================= 魏 =================

// 典韦 · 强袭：失去 1 点体力或弃武器牌，对攻击范围内一名角色造成 1 点伤害。
defineSkill({
  id: 'qiangxi', name: '强袭',
  desc: '出牌阶段限一次，你可以失去 1 点体力或弃置一张武器牌，然后对攻击范围内的一名其他角色造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '失去 1 点体力或弃武器牌，对攻击范围内角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const tg = g.alive().filter(x => x !== p && g.inAttackRange(p, x));
      if (!tg.length) { await ctx.log('【强袭】：攻击范围内没有其他角色'); return; }
      let mode = 'hp';
      if (p.equips.weapon) {
        const i = await ctx.ask.choose(p, ['失去 1 点体力', '弃置武器牌'], { prompt: '【强袭】：选择代价', reason: 'qiangxi' });
        if (i < 0) return;
        mode = i === 0 ? 'hp' : 'weapon';
      }
      if (mode === 'hp') await ctx.loseHp(p, 1, { reason: 'qiangxi' });
      else await ctx.discard(p, [p.equips.weapon], { reason: 'qiangxi' });
      if (!p.alive) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: tg, prompt: '【强袭】：选择目标' });
      if (!ts.length) return;
      await ctx.damage({ from: p, to: ts[0], amount: 1, reason: '强袭' });
    },
  },
});

// 曹丕 · 行殇：其他角色死亡时，你可以获得其所有牌。
defineSkill({
  id: 'xingshang', name: '行殇',
  desc: '当其他角色死亡时，你可以获得其所有牌。',
  triggers: [{
    on: 'death.before', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && d.self.alive !== false,
    async effect(ctx) {
      const dead = ctx.data.self;
      const all = [...dead.hand, ...Object.values(dead.equips).filter(Boolean), ...(dead.judgeZone || []).map(z => z.card)].filter(Boolean);
      if (!all.length) return;
      // 必须带 from：gainCards 只在传 from 时从原区域摘牌，
      // 否则死者区域仍持有这些牌，随后 die() 再推进弃牌堆 → 同一张牌三处并存。
      await ctx.gain(ctx.self, all, { from: dead, reason: 'xingshang' });
      await ctx.log(`${ctx.self.name} 发动【行殇】，获得 ${dead.name} 的所有牌（${all.length} 张）`);
    },
  }],
});

// 曹丕 · 放逐：受到伤害后，令一名其他角色摸 X 张（X=已损体力）并翻面。
defineSkill({
  id: 'fangzhu', name: '放逐',
  desc: '每当你受到一次伤害后，你可以令一名其他角色摸 X 张牌（X 为你已损失的体力值），然后该角色将其武将牌翻面。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self.alive && d.self.hp < d.self.maxHp && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.max(1, p.maxHp - p.hp);
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: g.alive().filter(z => z !== p), prompt: `【放逐】：令一名角色摸 ${x} 张牌并翻面` });
      if (!ts.length) return;
      await ctx.draw(ts[0], x, { reason: 'fangzhu' });
      await ctx.flip(ts[0]);
    },
  }],
});

// 徐晃 · 断粮：黑色基本牌/装备牌当【兵粮寸断】；使用【兵粮寸断】无距离限制（转化规则见 virtual-lin.js）。
defineSkill({
  id: 'duanliang', name: '断粮',
  desc: '你可以将一张黑色基本牌或黑色装备牌当【兵粮寸断】使用；你使用【兵粮寸断】无距离限制。',
});

// ================= 群 =================

// 孟获 · 祸首（锁定技）：【南蛮入侵】对你无效，且该【南蛮入侵】的伤害来源视为你。
defineSkill({
  id: 'huoshou', name: '祸首',
  desc: '锁定技，【南蛮入侵】对你无效；当其他角色使用【南蛮入侵】造成伤害时，伤害来源视为你。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => d.card && d.card.name === 'nanman' && (d.amount || 0) > 0,
    async effect(ctx) {
      const me = ctx.self;
      if (ctx.data.to === me) {
        ctx.data.amount = 0;
        await ctx.log(`${me.name} 发动【祸首】：【南蛮入侵】对其无效`);
        return;
      }
      if (me.alive && ctx.data.from !== me) {
        ctx.data.from = me;
        await ctx.log(`${me.name} 发动【祸首】：改为该【南蛮入侵】的伤害来源`);
      }
    },
  }],
});

// 孟获 · 再起：摸牌阶段可放弃摸牌，亮出 X 张（X=已损体力，至少 1），每有一张红桃回复 1 点体力并获得之。
defineSkill({
  id: 'zaiqi', name: '再起',
  desc: '摸牌阶段，你可以放弃摸牌，改为亮出牌堆顶 X 张牌（X 为你已损失的体力值，至少为 1）；其中每有一张红桃牌，你回复 1 点体力，然后你获得其中的红桃牌，其余置入弃牌堆。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw' && d.self.hp < d.self.maxHp,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.max(1, p.maxHp - p.hp);
      p.flags.skipDraw = true;
      const cards = await ctx.draw(p, x, { reason: 'zaiqi' });
      const hearts = cards.filter(c => suitOf(p, c) === 'heart');
      if (hearts.length) {
        await ctx.recover(p, hearts.length, { reason: 'zaiqi' });
        await ctx.log(`${p.name} 发动【再起】：亮出 ${x} 张，红桃 ${hearts.length} 张，回复 ${hearts.length} 点体力并保留红桃牌`);
      } else {
        const rest = cards.filter(c => !hearts.includes(c));
        await ctx.discard(p, rest, { reason: 'zaiqi' });
        await ctx.log(`${p.name} 发动【再起】：亮出 ${x} 张，无红桃，全部置入弃牌堆`);
      }
    },
  }],
});

// 董卓 · 酒池：黑桃手牌当【酒】；你的【酒】无次数限制（转化规则见 virtual-lin.js）。
defineSkill({
  id: 'jiuchi', name: '酒池',
  desc: '你可以将一张黑桃手牌当【酒】使用。你的【酒】无次数限制。',
});

// 董卓 · 肉林（锁定技）：双方使用【杀】时，对方需连续使用两张【闪】才能抵消。
defineSkill({
  id: 'roulin', name: '肉林',
  desc: '锁定技，你对其他角色使用【杀】时，其需连续使用两张【闪】才能抵消；其他角色对你使用【杀】时，你需连续使用两张【闪】才能抵消。',
  triggers: [{
    on: 'dodge.after', who: 'any', optional: false,
    filter: (d) => {
      const has = (x) => x && (effSkills(x) || []).some(s => s.id === 'roulin');
      return !!d.card && d.card.name === 'sha' && (has(d.self) || has(d.from));
    },
    async effect(ctx) {
      const t = ctx.self;
      const res = await ctx.game.respondCard(t, {
        prompt: '【肉林】：需再使用一张【闪】才能抵消【杀】', filter: { name: 'shan' }, reason: 'roulin',
      });
      if (!res) {
        ctx.data.dodged = false;
        await ctx.log(`【肉林】：${t.name} 未再使用【闪】，此【杀】命中`);
      } else {
        await ctx.log(`【肉林】：${t.name} 使用第二张【闪】，成功抵消`);
      }
    },
  }],
});

// 董卓 · 崩坏（锁定技）：结束阶段，若有角色体力值小于你，你须减 1 点体力或减 1 点体力上限。
defineSkill({
  id: 'bengkuai', name: '崩坏',
  desc: '锁定技，结束阶段，若场上有角色的体力值小于你，你须选择一项：减 1 点体力，或减 1 点体力上限。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'end' && d.self.alive && d.game.players.some(x => x.alive && x.hp < d.self.hp),
    async effect(ctx) {
      const p = ctx.self;
      const i = await ctx.ask.choose(p, ['减 1 点体力', '减 1 点体力上限'], { prompt: '【崩坏】：选择一项', reason: 'bengkuai' });
      if (i === 1) {
        p.maxHp = Math.max(1, p.maxHp - 1);   // 官方下限为 1
        await ctx.log(`${p.name} 发动【崩坏】：体力上限减至 ${p.maxHp}`);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
      } else {
        await ctx.loseHp(p, 1, { reason: 'bengkuai' });
        await ctx.log(`${p.name} 发动【崩坏】：失去 1 点体力`);
      }
    },
  }],
});

// 贾诩 · 完杀（锁定技）：实现于引擎 dying()（只有你与濒死者能使用【桃】）。
defineSkill({
  id: 'wansha', name: '完杀',
  desc: '锁定技，你的回合内，除你以外，只有处于濒死状态的角色才能使用【桃】。',
});

// 贾诩 · 乱武（限定技）：出牌阶段，令所有其他角色依次选择对最近的角色使用【杀】，或失去 1 点体力。
defineSkill({
  id: 'luanwu', name: '乱武',
  desc: '限定技，出牌阶段，你可以令所有其他角色依次选择一项：对与其距离最近的一名角色使用一张【杀】，或失去 1 点体力。',
  active: {
    perTurn: false,
    prompt: '限定技：所有其他角色使用【杀】或失去 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.luanwuUsed) { await ctx.log('【乱武】：本局已使用过'); return; }
      p.flags.luanwuUsed = true;
      await ctx.log(`${p.name} 发动【乱武】（限定技）`);
      for (const t of g.alive().filter(x => x !== p)) {
        if (!t.alive) continue;
        const nearest = g.alive().filter(x => x !== t)
          .sort((a, b) => g.distance(t, a) - g.distance(t, b))[0];
        const canSha = t.hand.some(c => c.name === 'sha');
        const opts = canSha ? ['对最近的角色使用【杀】', '失去 1 点体力'] : ['失去 1 点体力'];
        const i = await ctx.ask.choose(t, opts, { prompt: '【乱武】：选择一项', reason: 'luanwu' });
        if (i === 0 && canSha && nearest) {
          const sha = t.hand.find(c => c.name === 'sha');
          await ctx.useCard({ from: t, card: sha, targets: [nearest], reason: '乱武' });
        } else {
          await ctx.loseHp(t, 1, { reason: 'luanwu' });
        }
      }
    },
  },
});

// 贾诩 · 帷幕（锁定技）：你不能成为黑色锦囊牌的目标。
defineSkill({
  id: 'weimu', name: '帷幕',
  desc: '锁定技，你不能成为黑色锦囊牌的目标。',
  triggers: [{
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => {
      if (d.target !== d.player) return false;
      const c = d.card;
      if (!c) return false;
      const meta = CARD_META[c.name];
      if (!meta || meta.type !== 'trick') return false;
      return !isRed(c);
    },
    async effect(ctx) {
      ctx.data.canceled = true;
      await ctx.log(`【帷幕】：${ctx.self.name} 不能成为黑色锦囊 ${cardLabel(ctx.data.card)} 的目标`);
    },
  }],
});

// ================= 吴 =================

// 孙坚 · 英魂：准备阶段，若已受伤，可选一名其他角色摸 X 弃 1 或摸 1 弃 X（X=已损体力）。
defineSkill({
  id: 'yinghun', name: '英魂',
  desc: '准备阶段，若你已受伤，你可以选择一名其他角色并选择一项：1. 令其摸 X 张牌，然后弃置一张牌；2. 令其摸一张牌，然后弃置 X 张牌（X 为你已损失的体力值）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.self.hp < d.self.maxHp && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = p.maxHp - p.hp;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: g.alive().filter(z => z !== p), prompt: '【英魂】：选择一名其他角色' });
      if (!ts.length) return;
      const t = ts[0];
      const i = await ctx.ask.choose(p, [`令其摸 ${x} 张然后弃 1 张`, '令其摸 1 张然后弃 X 张'], { prompt: '【英魂】：选择一项', reason: 'yinghun' });
      if (i < 0) return;
      if (i === 0) {
        await ctx.draw(t, x, { reason: 'yinghun' });
        const c = await pickHand(ctx, t, () => true, '【英魂】：弃置一张手牌');
        if (c) await ctx.discard(t, [c], { reason: 'yinghun' });
      } else {
        await ctx.draw(t, 1, { reason: 'yinghun' });
        const n = Math.min(x, t.hand.length);
        const res = await ctx.game.ask(t, 'cards', { prompt: `【英魂】：弃置 ${n} 张手牌`, min: n, max: n, candidates: t.hand.map(c => c.id), reason: 'yinghun' });
        const ids = (res && res.cardIds) || [];
        const cs = t.hand.filter(c => ids.includes(c.id));
        if (cs.length) await ctx.discard(t, cs, { reason: 'yinghun' });
      }
      await ctx.log(`${p.name} 发动【英魂】（X=${x}）`);
    },
  }],
});

// 鲁肃 · 好施：摸牌阶段可额外摸两张；结束时若手牌数大于 5，须将一半（向下取整）交给手牌最少的一名其他角色。
defineSkill({
  id: 'haoshi', name: '好施',
  desc: '摸牌阶段，你可以额外摸两张牌；若如此做，摸牌阶段结束时，若你的手牌数大于 5，你须将一半（向下取整）手牌交给手牌最少的一名其他角色。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'draw',
      async effect(ctx) {
        const p = ctx.self;
        await ctx.draw(p, 2, { reason: 'haoshi' });
        p.flags.haoshi = ctx.game.turnCount;
        await ctx.log(`${p.name} 发动【好施】，额外摸两张牌`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && d.self.flags.haoshi === d.game.turnCount && d.self.hand.length > 5,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const others = g.alive().filter(x => x !== p);
        if (!others.length) return;
        const n = Math.floor(p.hand.length / 2);
        const min = Math.min(...others.map(x => x.hand.length));
        const cands = others.filter(x => x.hand.length === min);
        const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: `【好施】：选择手牌最少的角色（交 ${n} 张）` });
        if (!ts.length) return;
        const res = await ctx.game.ask(p, 'cards', { prompt: `【好施】：选择交给 ${ts[0].name} 的 ${n} 张手牌`, min: n, max: n, candidates: p.hand.map(c => c.id), reason: 'haoshi' });
        const ids = (res && res.cardIds) || [];
        const cs = p.hand.filter(c => ids.includes(c.id));
        if (cs.length) {
          await ctx.gain(ts[0], cs, { from: p, reason: 'haoshi' });
          await ctx.log(`${p.name} 发动【好施】，交给 ${ts[0].name} ${cs.length} 张手牌`);
        }
      },
    },
  ],
});

// 鲁肃 · 缔盟：出牌阶段限一次，弃置等同于两名角色手牌数之差的牌，然后交换他们的手牌。
defineSkill({
  id: 'dimeng', name: '缔盟',
  desc: '出牌阶段限一次，你可以选择两名其他角色，弃置等同于这两名角色手牌数之差的牌，然后交换他们的手牌。',
  active: {
    perPhase: true,
    prompt: '弃 X 张牌（X=两人手牌数之差），交换两人手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const others = g.alive().filter(x => x !== p);
      if (others.length < 2) { await ctx.log('【缔盟】：其他角色不足两名'); return; }
      const ts = await ctx.ask.targets(p, { min: 2, max: 2, candidates: others, prompt: '【缔盟】：选择两名其他角色' });
      if (ts.length < 2) return;
      const [a, b] = ts;
      const diff = Math.abs(a.hand.length - b.hand.length);
      if (diff > p.hand.length) { await ctx.log(`【缔盟】：需要弃 ${diff} 张牌，手牌不足`); return; }
      if (diff > 0) {
        const res = await ctx.game.ask(p, 'cards', { prompt: `【缔盟】：弃置 ${diff} 张手牌`, min: diff, max: diff, cards: p.hand.map(c => c.id), reason: 'dimeng' });
        const ids = (res && res.cardIds) || [];
        const cs = p.hand.filter(c => ids.includes(c.id));
        if (cs.length < diff) { await ctx.log('【缔盟】：未选择足够的牌，取消'); return; }
        await ctx.discard(p, cs, { reason: 'dimeng' });
      }
      // 逐张转移（不直接换数组），保证 cards.gain / hand.change 等事件与 from 关系不丢失
      const ha = [...a.hand], hb = [...b.hand];
      if (hb.length) await ctx.gain(a, hb, { from: b, reason: 'dimeng' });
      if (ha.length) await ctx.gain(b, ha, { from: a, reason: 'dimeng' });
      await g.checkHandChange(a); await g.checkHandChange(b);
      await ctx.log(`${p.name} 发动【缔盟】：交换了 ${a.name}（${hb.length} 张）与 ${b.name}（${ha.length} 张）的手牌`);
    },
  },
});

export const LIN_SKILL_IDS = ['juxiang', 'lieren', 'qiangxi', 'xingshang', 'fangzhu', 'duanliang',
  'huoshou', 'zaiqi', 'jiuchi', 'roulin', 'bengkuai', 'wansha', 'luanwu', 'weimu', 'yinghun', 'haoshi', 'dimeng'];
