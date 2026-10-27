// 一将成名 2012（12 将 / 21 技能）
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, suitOf, isRedFor } from '../engine/cards.js';

async function pickHand(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  const res = await ctx.game.ask(player, 'card', { prompt, cards: cands.map(c => c.id), optional: true, reason: 'skill' });
  if (!res || !res.cardId) return null;
  return cands.find(c => c.id === res.cardId) || null;
}
function awaken(p, ids) {
  for (const id of ids) {
    if (effSkills(p).some(s => s.id === id)) continue;
    const sk = getSkill(id);
    if (sk) p.skills.push(sk);
  }
}
const kingdomCount = (g) => new Set(g.alive().map(x => x.kingdom).filter(Boolean)).size;

// ================= 魏 =================

// 王异 · 贞烈：成为【杀】或非延时锦囊目标时，可失去 1 点体力令其无效，然后弃置来源一张牌。
defineSkill({
  id: 'zhenlie', name: '贞烈',
  desc: '当你成为其他角色使用的【杀】或非延时锦囊牌的目标时，你可以失去 1 点体力，令此牌对你无效，然后弃置该角色一张牌。',
  triggers: [{
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => {
      if (d.target !== d.player || !d.card) return false;
      const meta = CARD_META[d.card.name];
      if (!meta) return false;
      const okType = d.card.name === 'sha' || (meta.type === 'trick' && !meta.delayed);
      return okType && d.self !== d.player && d.player.hp > 0;
    },
    async effect(ctx) {
      const me = ctx.self, from = ctx.data.self;
      await ctx.loseHp(me, 1, { reason: 'zhenlie' });
      ctx.data.canceled = true;
      const pool = [...from.hand, ...Object.values(from.equips).filter(Boolean)];
      if (pool.length) {
        const c = pool[Math.floor(Math.random() * pool.length)];
        await ctx.discard(from, [c], { reason: 'zhenlie' });
      }
      await ctx.log(`${me.name} 发动【贞烈】：失去 1 点体力，令 ${cardLabel(ctx.data.card)} 无效`);
    },
  }],
});

// 王异 · 秘计：回合开始/结束时，若已受伤，摸 X 张然后将等量手牌交给一名其他角色。
defineSkill({
  id: 'miji', name: '秘计',
  desc: '回合开始或结束时，若你已受伤，你可以摸 X 张牌（X 为你已损失的体力值），然后将等量的手牌交给一名其他角色。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => (d.phase === 'prepare' || d.phase === 'end') && d.self.hp < d.self.maxHp && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.min(p.maxHp - p.hp, 5);
      if (x <= 0) return;
      await ctx.draw(p, x, { reason: 'miji' });
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: g.alive().filter(z => z !== p), prompt: `【秘计】：交给一名角色 ${x} 张手牌` });
      if (!ts.length) return;
      const n = Math.min(x, p.hand.length);
      const res = await g.ask(p, 'cards', { prompt: `【秘计】：选择 ${n} 张手牌交出`, min: n, max: n, candidates: p.hand.map(c => c.id), reason: 'miji' });
      const ids = (res && res.cardIds) || [];
      const cs = p.hand.filter(c => ids.includes(c.id));
      if (cs.length) await ctx.gain(ts[0], cs, { from: p, reason: 'miji' });
      await ctx.log(`${p.name} 发动【秘计】：摸 ${x} 张并交给 ${ts[0].name} ${cs.length} 张`);
    },
  }],
});

// 荀攸 · 奇策：将所有手牌当任意一张非延时锦囊使用（每种牌名每局限一次）。
defineSkill({
  id: 'qice', name: '奇策',
  desc: '出牌阶段限一次，你可以将所有手牌当任意一张非延时锦囊牌使用（每种牌名每局限一次）。',
  active: {
    perPhase: true,
    prompt: '将所有手牌当一张非延时锦囊使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【奇策】：没有手牌'); return; }
      p.flags.qiceUsed = p.flags.qiceUsed || {};
      const NAMES = ['juedou', 'guohe', 'shunshou', 'wuzhong', 'nanman', 'wanjian', 'taoyuan', 'wugu', 'tiesuo'];
      const opts = NAMES.filter(n => CARD_META[n] && !p.flags.qiceUsed[n]);
      if (!opts.length) { await ctx.log('【奇策】：所有锦囊牌名本局均已用过'); return; }
      const i = await ctx.ask.choose(p, opts.map(n => `【${CARD_META[n].cn}】`), { prompt: '【奇策】：选择牌名', reason: 'qice' });
      if (i < 0) return;
      const name = opts[i];
      const meta = CARD_META[name];
      const cands = g.alive().filter(x => {
        if (meta.target?.self) return x === p;
        if (meta.target?.others) return x !== p && g.inAttackRange(p, x);
        return true;
      });
      const min = meta.target?.min || 0;
      const max = meta.target?.max || cands.length;
      let targets = [];
      if (min > 0) {
        const ts = await ctx.ask.targets(p, { min, max, candidates: cands, prompt: `【奇策】：为【${meta.cn}】选择目标` });
        if (!ts.length) return;
        targets = ts;
      }
      p.flags.qiceUsed[name] = true;
      const cards = [...p.hand];
      for (const c of cards) {
        const hi = p.hand.indexOf(c);
        if (hi >= 0) p.hand.splice(hi, 1);
      }
      await ctx.log(`${p.name} 发动【奇策】：将 ${cards.length} 张手牌当【${meta.cn}】使用`);
      const vCard = { id: `v${Date.now()}`, name, suit: 'none', num: 0, type: meta.type, virtual: true };
      await ctx.useCard({ from: p, card: vCard, targets, reason: 'qice', extraCards: cards });
    },
  },
});

// 荀攸 · 智愚：受伤后摸一张并展示所有手牌，若颜色均相同，伤害来源弃一张手牌。
defineSkill({
  id: 'zhiyu', name: '智愚',
  desc: '每当你受到一次伤害后，你可以摸一张牌，然后展示所有手牌；若这些牌颜色均相同，伤害来源弃置一张手牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => (d.amount || 0) > 0 && d.self.alive,
    async effect(ctx) {
      const p = ctx.self, src = ctx.data.from;
      await ctx.draw(p, 1, { reason: 'zhiyu' });
      if (!p.hand.length) return;
      const reds = p.hand.filter(c => isRedFor(p, c)).length;
      const uniform = reds === 0 || reds === p.hand.length;
      await ctx.log(`【智愚】：展示手牌 ${p.hand.map(c => cardLabel(c)).join('、')}（${uniform ? '颜色相同' : '颜色不同'}）`);
      if (uniform && src && src.alive && src.hand.length) {
        const c = src.hand[Math.floor(Math.random() * src.hand.length)];
        await ctx.discard(src, [c], { reason: 'zhiyu' });
        await ctx.log(`【智愚】：${src.name} 弃置 ${cardLabel(c)}`);
      }
    },
  }],
});

// 曹彰 · 将驰：摸牌阶段选择：额外摸一张且本回合不能使用【杀】；或少摸一张且本回合【杀】无距离限制。
defineSkill({
  id: 'jiangchi', name: '将驰',
  desc: '摸牌阶段，你可以选择一项：1. 额外摸一张牌，本回合你不能使用【杀】；2. 少摸一张牌，本回合你使用【杀】无距离限制。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const i = await ctx.ask.choose(p, ['额外摸一张牌（本回合不能使用【杀】）', '少摸一张牌（本回合使用【杀】无距离限制）'], { prompt: '【将驰】：选择一项', reason: 'jiangchi' });
      if (i < 0) return;
      if (i === 0) {
        await ctx.draw(p, 1, { reason: 'jiangchi' });
        p.flags.banShaTurn = g.turnCount;
        await ctx.log(`${p.name} 发动【将驰】：额外摸一张牌，本回合不能使用【杀】`);
      } else {
        p.flags.skip_one_draw = true;
        p.flags.jiangchiRange = g.turnCount;
        await ctx.log(`${p.name} 发动【将驰】：少摸一张牌，本回合使用【杀】无距离限制`);
      }
    },
  }],
});

// 钟会 · 权计：受伤后摸一张，然后将一张手牌置于武将牌上称为「权」。
defineSkill({
  id: 'quanji', name: '权计',
  reclaimCards(p) { const a = p.quan || []; p.quan = []; return a; },
  desc: '每当你受到 1 点伤害后，你可以摸一张牌，然后将一张手牌置于你的武将牌上，称为「权」。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => (d.amount || 0) > 0 && d.self.alive,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'quanji' });
      const c = await pickHand(ctx, p, () => true, '【权计】：将一张手牌置于武将牌上（称「权」）');
      if (!c) return;
      p.hand = p.hand.filter(x => x !== c);
      p.quan = p.quan || [];
      p.quan.push(c);
      await ctx.log(`${p.name} 发动【权计】：获得 1 张「权」（共 ${p.quan.length} 张）`);
    },
  }],
});

// 钟会 · 自立（觉醒技）：准备阶段若「权」≥3，减 1 点体力上限并获得【排异】。
defineSkill({
  id: 'zili', name: '自立',
  desc: '觉醒技，准备阶段，若你的「权」不少于 3 张，你减 1 点体力上限，然后获得技能【排异】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && d.self.alive && !d.self.flags.awaken_zili && (d.self.quan || []).length >= 3,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.awaken_zili = true;
      p.maxHp = Math.max(1, p.maxHp - 1);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      awaken(p, ['paiyi']);
      await ctx.log(`${p.name} 觉醒【自立】：体力上限 -1，并获得【排异】`);
    },
  }],
});

// 钟会 · 排异：移去一张「权」，令一名角色摸两张牌，然后你对其造成 1 点伤害。
defineSkill({
  id: 'paiyi', name: '排异',
  desc: '出牌阶段限一次，你可以移去一张「权」，令一名角色摸两张牌，然后你对其造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '移去一张「权」，令一名角色摸两张牌后对其造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const quan = p.quan || [];
      if (!quan.length) { await ctx.log('【排异】：没有「权」'); return; }
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: g.alive(), prompt: '【排异】：选择一名角色' });
      if (!ts.length) return;
      // ★移去的那张「权」必须进弃牌堆，否则 slice 一丢就永久消失（SG029 BLOCKER-4）
      const removedQuan = quan[0];
      p.quan = quan.slice(1);
      if (removedQuan && g.pushDiscardIfOrphan(removedQuan)) {
        await g.trigger('cards.discard', { self: p, cards: [removedQuan], reason: 'paiyi', taken: [] });
      }
      await ctx.draw(ts[0], 2, { reason: 'paiyi' });
      await ctx.damage({ from: p, to: ts[0], amount: 1, reason: '排异' });
      await ctx.log(`${p.name} 发动【排异】：${ts[0].name} 摸两张牌并受到 1 点伤害`);
    },
  },
});

// ================= 蜀 =================

// 马岱 · 潜袭：准备阶段判定，令距离 1 以内一名角色本回合不能使用/打出与判定结果同颜色的手牌。
defineSkill({
  id: 'qianxi', name: '潜袭',
  desc: '准备阶段，你可以进行判定，然后令一名距离为 1 的角色本回合不能使用或打出与判定结果颜色相同的手牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.game.alive().some(x => x !== d.self && d.game.distance(d.self, x) <= 1),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const j = await ctx.judge(p, { reason: '潜袭' });
      const color = (j.suit === 'heart' || j.suit === 'diamond') ? 'red' : 'black';
      const cands = g.alive().filter(x => x !== p && g.distance(p, x) <= 1);
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: `【潜袭】：选择一名角色（禁止其使用${color === 'red' ? '红' : '黑'}色手牌）` });
      if (!ts.length) return;
      ts[0].flags.qianxiNoColor = color;
      ts[0].flags.qianxiTurn = g.turnCount;
      await ctx.log(`${p.name} 发动【潜袭】：${ts[0].name} 本回合不能使用${color === 'red' ? '红' : '黑'}色手牌`);
    },
  }],
});

// 廖化 · 当先（锁定技）：回合开始时，你进行一个额外的出牌阶段。
defineSkill({
  id: 'dangxian', name: '当先',
  desc: '锁定技，回合开始时，你进行一个额外的出牌阶段。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: (d) => d.self.alive && !d.self.flipped,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.extraPlay = true;
      await ctx.log(`${p.name} 发动【当先】：本回合额外获得一个出牌阶段`);
    },
  }],
});

// 廖化 · 伏枥（限定技）：濒死时，可将体力回复至 X（X 为场上势力数）。
defineSkill({
  id: 'fuli', name: '伏枥',
  desc: '限定技，当你处于濒死状态时，你可以将体力回复至 X 点（X 为场上势力数）。',
  triggers: [{
    on: 'dying.begin', who: 'self', optional: true,
    filter: (d) => d.self.alive !== false && !d.self.flags.fuliUsed,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.fuliUsed = true;
      const x = Math.max(1, kingdomCount(g));
      const need = Math.max(0, Math.min(p.maxHp, x) - p.hp);
      if (need > 0) await ctx.recover(p, need, { reason: 'fuli' });
      await ctx.log(`${p.name} 发动【伏枥】（限定技）：体力回复至 ${p.hp}`);
    },
  }],
});

// 关兴张苞 · 父魂：摸牌阶段可放弃摸牌，亮出牌堆顶两张并获得；若两张颜色不同，本回合【杀】无距离限制。
defineSkill({
  id: 'fuheng', name: '父魂',
  desc: '摸牌阶段，你可以放弃摸牌，亮出牌堆顶两张牌并获得之；若这两张牌颜色不同，本回合你使用【杀】无距离限制。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.skipDraw = true;
      const top = g.deck.splice(-2);   // 牌堆顶在数组末尾
      if (!top.length) return;
      await ctx.gain(p, top, { reason: 'fuheng' });
      const colors = new Set(top.map(c => isRedFor(p, c) ? 'red' : 'black'));
      if (colors.size > 1) {
        p.flags.fuhengRange = g.turnCount;
        await ctx.log(`${p.name} 发动【父魂】：获得 ${top.map(c => cardLabel(c)).join('、')}，两牌颜色不同，本回合【杀】无距离限制`);
      } else {
        await ctx.log(`${p.name} 发动【父魂】：获得 ${top.map(c => cardLabel(c)).join('、')}（颜色相同）`);
      }
    },
  }],
});

// ================= 吴 =================

// 程普 · 疠火：可将一张【杀】当火【杀】使用；造成伤害后你失去 1 点体力。
defineSkill({
  id: 'lihuo', name: '疠火',
  desc: '你可以将一张普通【杀】当火【杀】使用；若此【杀】造成伤害，你失去 1 点体力。',
  active: {
    perTurn: false,
    prompt: '把一张【杀】当火【杀】使用（造成伤害后你失去 1 点体力）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const sha = p.hand.filter(c => c.name === 'sha');
      if (!sha.length) { await ctx.log('【疠火】：没有【杀】'); return; }
      const res = await g.ask(p, 'card', { prompt: '【疠火】：选择一张【杀】当火【杀】使用', cards: sha.map(c => c.id), optional: true, reason: 'lihuo' });
      const c = res && res.cardId ? sha.find(x => x.id === res.cardId) : null;
      if (!c) return;
      const cands = g.alive().filter(x => x !== p && g.inAttackRange(p, x));
      if (!cands.length) { await ctx.log('【疠火】：没有攻击范围内的目标'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: cands, prompt: '【疠火】：选择目标' });
      if (!ts.length) return;
      p.flags.lihuoPending = g.turnCount;
      await ctx.log(`${p.name} 发动【疠火】：将 ${cardLabel(c)} 当火【杀】使用`);
      await ctx.useCard({ from: p, card: c, targets: ts, reason: 'lihuo' });
    },
  },
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => d.card && d.card.name === 'sha' && d.from === d.player && (d.amount || 0) > 0
      && d.player.flags.lihuoPending === d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.lihuoPending = null;
      await ctx.loseHp(p, 1, { reason: 'lihuo' });
      await ctx.log(`【疠火】：${p.name} 失去 1 点体力`);
    },
  }],
});

// 程普 · 醇醪：结束阶段可将一张【杀】置于武将牌上称为「醇」；濒死时可移去一张「醇」视为使用一张【酒】。
defineSkill({
  id: 'chunlao', name: '醇醪',
  desc: '结束阶段，若你没有「醇」，你可以将一张【杀】置于你的武将牌上，称为「醇」；当一名角色处于濒死状态时，你可以将一张「醇」置入弃牌堆，视为该角色使用一张【酒】。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'end' && !(d.self.chunlao || []).length && d.self.hand.some(c => c.name === 'sha'),
      async effect(ctx) {
        const p = ctx.self;
        const c = await pickHand(ctx, p, x => x.name === 'sha', '【醇醪】：将一张【杀】置于武将牌上（称「醇」）');
        if (!c) return;
        p.hand = p.hand.filter(x => x !== c);
        p.chunlao = [c];
        await ctx.log(`${p.name} 发动【醇醪】：获得「醇」`);
      },
    },
    {
      on: 'dying.begin', who: 'any', optional: true,
      filter: (d) => (d.player.chunlao || []).length > 0 && d.self.alive !== false,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.self;
        const c = p.chunlao.shift();
        ctx.game.discardPile.push(c);
        await ctx.recover(t, 1, { reason: 'chunlao' });
        await ctx.log(`【醇醪】：移去「醇」，${t.name} 视为使用一张【酒】并回复 1 点体力`);
      },
    },
  ],
});

// 步练师 · 安恤：选两名手牌数不同的其他角色，手牌少的摸一张，手牌多的弃一张；若其手牌数仍比你多，你摸一张。
defineSkill({
  id: 'anxu', name: '安恤',
  desc: '出牌阶段限一次，你可以选择两名手牌数不同的其他角色，令手牌少的角色摸一张牌，然后手牌多的角色弃置一张牌；若其手牌数仍比你多，你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '选择两名手牌数不同的角色，少的摸一张、多的弃一张',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (cands.length < 2) { await ctx.log('【安恤】：其他角色不足两名'); return; }
      const ts = await ctx.ask.targets(p, { min: 2, max: 2, candidates: cands, prompt: '【安恤】：选择两名角色' });
      if (ts.length < 2) return;
      const [a, b] = ts.sort((x, y) => x.hand.length - y.hand.length);
      if (a.hand.length === b.hand.length) { await ctx.log('【安恤】：两人手牌数相同，无法发动'); return; }
      await ctx.draw(a, 1, { reason: 'anxu' });
      const c = await pickHand(ctx, b, () => true, '【安恤】：弃置一张手牌');
      if (c) await ctx.discard(b, [c], { reason: 'anxu' });
      if (b.hand.length > p.hand.length) await ctx.draw(p, 1, { reason: 'anxu' });
      await ctx.log(`${p.name} 发动【安恤】：${a.name} 摸 1 张，${b.name} 弃 1 张`);
    },
  },
});

// 步练师 · 追忆：死亡时，可令一名其他角色摸三张牌并回复 1 点体力。
defineSkill({
  id: 'zhuiyi', name: '追忆',
  desc: '当你死亡时，你可以令一名其他角色摸三张牌并回复 1 点体力。',
  triggers: [{
    on: 'death.after', who: 'self', optional: true,
    filter: (d) => d.self.alive === false && d.game.alive().length > 0,
    async effect(ctx) {
      const g = ctx.game;
      const alive = g.alive();
      if (!alive.length) return;
      const t = alive[Math.floor(Math.random() * alive.length)];
      await ctx.draw(t, 3, { reason: 'zhuiyi' });
      await ctx.recover(t, 1, { reason: 'zhuiyi' });
      await ctx.log(`【追忆】：${t.name} 摸三张牌并回复 1 点体力`);
    },
  }],
});

// 韩当 · 弓骑：装备牌当【杀】（转化规则见 virtual-yj2012.js）。
defineSkill({
  id: 'gongqi', name: '弓骑',
  desc: '你可以将一张装备牌当【杀】使用；当你使用【杀】时，若你已装备武器，此【杀】无距离限制。',
});

// 韩当 · 解烦（限定技）：令所有其他角色各弃置一张牌，然后你摸等量的牌。
defineSkill({
  id: 'jiefan', name: '解烦',
  desc: '限定技，出牌阶段，你可以令所有其他角色各弃置一张牌，然后你摸等量的牌。',
  active: {
    perTurn: false,
    prompt: '限定技：其他角色各弃一张牌，你摸等量的牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.jiefanUsed) { await ctx.log('【解烦】：本局已使用过'); return; }
      p.flags.jiefanUsed = true;
      let n = 0;
      for (const t of g.alive().filter(x => x !== p)) {
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        if (!pool.length) continue;
        const c = pool[Math.floor(Math.random() * pool.length)];
        await ctx.discard(t, [c], { reason: 'jiefan' });
        n++;
      }
      if (n > 0) await ctx.draw(p, n, { reason: 'jiefan' });
      await ctx.log(`${p.name} 发动【解烦】（限定技）：${n} 名角色各弃 1 张，${p.name} 摸 ${n} 张`);
    },
  },
});

// ================= 群 =================

// 华雄 · 恃勇（锁定技）：受到红色【杀】或【酒】【杀】造成的伤害后，减 1 点体力上限。
defineSkill({
  id: 'shiyong', name: '恃勇',
  desc: '锁定技，当你受到红色【杀】或【酒】【杀】造成的伤害后，你减 1 点体力上限。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.card && d.card.name === 'sha' && (d.amount || 0) > 0
      && (isRedFor(d.self, d.card) || d.from?.flags?.jiu),
    async effect(ctx) {
      const p = ctx.self;
      p.maxHp = Math.max(1, p.maxHp - 1);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      await ctx.log(`${p.name} 发动【恃勇】：体力上限减至 ${p.maxHp}`);
    },
  }],
});

// 刘表 · 自守：摸牌阶段可额外摸 X 张（X 为场上势力数），若如此做本回合不能使用【杀】。
defineSkill({
  id: 'zishou', name: '自守',
  desc: '摸牌阶段，你可以额外摸 X 张牌（X 为场上势力数），若如此做，本回合你不能使用【杀】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = kingdomCount(g);
      if (x <= 0) return;
      await ctx.draw(p, x, { reason: 'zishou' });
      p.flags.banShaTurn = g.turnCount;
      await ctx.log(`${p.name} 发动【自守】：额外摸 ${x} 张牌，本回合不能使用【杀】`);
    },
  }],
});

// 刘表 · 宗室（锁定技）：手牌上限 +X（X 为场上势力数）。
defineSkill({
  id: 'zongshi', name: '宗室',
  desc: '锁定技，你的手牌上限 +X（X 为场上势力数）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'discard',
    async effect(ctx) {
      const x = kingdomCount(ctx.game);
      ctx.self.flags.handLimit = x;
      await ctx.log(`【宗室】：手牌上限 +${x}`);
    },
  }],
});

export const YJ2012_SKILL_IDS = ['zhenlie', 'miji', 'qice', 'zhiyu', 'jiangchi', 'quanji', 'zili', 'paiyi',
  'qianxi', 'dangxian', 'fuli', 'fuheng', 'lihuo', 'chunlao', 'anxu', 'zhuiyi', 'gongqi', 'jiefan', 'shiyong', 'zishou', 'zongshi'];
