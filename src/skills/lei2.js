// 神话再临·雷（第二批）：周妃 / 诸葛瞻 / 毌丘俭 / 袁术
import { defineSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';
import { getSkill } from '../engine/skill.js';

const setMark = (p, k, v) => { if (!p.marks) p.marks = {}; p.marks[k] = v; };

const pickHand = async (ctx, p, prompt, n = 1, optional = true) => {
  if (!p.hand.length) return [];
  const res = await ctx.game.ask(p, 'cards', {
    prompt, cards: p.hand.map(c => c.id), min: n, max: n, optional,
  });
  return (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
};

// ==================== 周妃 · 箜声 ====================
// 准备阶段可将任意张牌置于武将牌上；结束阶段使用其中装备牌，并获得其余牌。
defineSkill({
  id: 'kongsheng', name: '箜声',
  desc: '准备阶段，你可以将任意张牌置于你的武将牌上，称为「声」。结束阶段，你使用其中的装备牌，并获得其余牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare' && d.self.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self;
        const res = await ctx.game.ask(p, 'cards', {
          prompt: '【箜声】：选择要置于武将牌上的牌', cards: p.hand.map(c => c.id),
          min: 1, max: 99, optional: true,
        });
        const picks = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
        if (!picks.length) return;
        for (const c of picks) { const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1); }
        p.flags.kongsheng = [...(p.flags.kongsheng || []), ...picks];
        setMark(p, 'sheng', String((p.flags.kongsheng || []).length));
        await ctx.game.trigger('zone.out', { self: p, cards: picks });
        await ctx.log(`【箜声】：将 ${picks.length} 张牌置于武将牌上`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'end' && (d.self.flags.kongsheng || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cards = p.flags.kongsheng || [];
        p.flags.kongsheng = [];
        setMark(p, 'sheng', '0');
        const equips = cards.filter(c => CARD_META[c.name]?.sub);
        const others = cards.filter(c => !CARD_META[c.name]?.sub);
        for (const c of equips) {
          // 不能先 push 进手牌再装备：equipCard 只写 equips[slot]、不会从手牌摘除，
          // 那会让同一张牌同时存在于手牌与装备区。
          await g.equipCard(p, c);
          await ctx.log(`【箜声】：使用武将牌上的装备 ${cardLabel(c)}`);
        }
        if (others.length) {
          p.hand.push(...others);
          await g.trigger('zone.in', { self: p, cards: others });
          await ctx.log(`【箜声】：收回 ${others.length} 张牌`);
        }
      },
    },
  ],
});

// ==================== 周妃 · 良姻 ====================
// 有牌移出游戏时，可令手牌数大于你的一名角色摸一张；
// 有牌从游戏外加入任意角色手牌时，可令手牌数小于你的一名角色弃一张。
defineSkill({
  id: 'liangyin', name: '良姻',
  desc: '当有牌移出游戏时，你可以令手牌数大于你的一名角色摸一张牌；当有牌从游戏外加入任意角色的手牌时，你可以令手牌数小于你的一名角色弃置一张牌。',
  triggers: [
    {
      on: 'zone.out', who: 'any', optional: true,
      filter: (d) => d.game.alive().some(x => x.hand.length > d.player.hand.length),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter(x => x.hand.length > p.hand.length);
        const t = (await ctx.ask.targets(p, {
          min: 1, max: 1, candidates: cands, prompt: '【良姻】：令手牌数大于你的一名角色摸一张牌',
        }))[0];
        if (!t) return;
        await ctx.draw(t, 1, { reason: 'liangyin' });
        await ctx.log(`【良姻】：${t.name} 摸一张牌`);
      },
    },
    {
      on: 'zone.in', who: 'any', optional: true,
      filter: (d) => d.game.alive().some(x => x.hand.length < d.player.hand.length && x.hand.length > 0),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter(x => x.hand.length < p.hand.length && x.hand.length > 0);
        const t = (await ctx.ask.targets(p, {
          min: 1, max: 1, candidates: cands, prompt: '【良姻】：令手牌数小于你的一名角色弃置一张牌',
        }))[0];
        if (!t) return;
        const res = await g.ask(t, 'cards', {
          prompt: '【良姻】：弃置一张牌', cards: t.hand.map(c => c.id), min: 1, max: 1, optional: false,
        });
        const c = (res?.cardIds || []).map(id => t.hand.find(x => x.id === id)).filter(Boolean);
        if (c.length) await ctx.discard(t, c, { reason: 'liangyin' });
        await ctx.log(`【良姻】：${t.name} 弃置一张牌`);
      },
    },
  ],
});

// ==================== 诸葛瞻 · 罪论 ====================
// 结束阶段观看牌堆顶三张，每满足一项保留一张；若均不满足，你与一名其他角色失去 1 点体力。
defineSkill({
  id: 'zuilun', name: '罪论',
  desc: '结束阶段，你可以观看牌堆顶三张牌，你每满足以下一项便保留一张：1. 你于此回合内造成过伤害；2. 你于此回合内未弃置过牌；3. 你的手牌数为全场最少。然后将其余的牌以任意顺序放回牌堆顶。若均不满足，你与一名其他角色失去 1 点体力。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: true,
    filter: (d) => d.phase === 'end',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c1 = p.flags.zuilunDmgTurn === g.turnCount;
      const c2 = (p.flags.zuilunDiscardTurn || 0) !== g.turnCount;
      const minHand = Math.min(...g.alive().map(x => x.hand.length));
      const c3 = p.hand.length === minHand;
      const k = [c1, c2, c3].filter(Boolean).length;
      if (k === 0) {
        const others = g.alive().filter(x => x !== p);
        const t = others.length ? (await ctx.ask.targets(p, {
          min: 1, max: 1, candidates: others, prompt: '【罪论】：均不满足，选择一名其他角色与你各失去 1 点体力',
        }))[0] : null;
        await ctx.loseHp(p, 1, { reason: 'zuilun' });
        if (t) await ctx.loseHp(t, 1, { reason: 'zuilun' });
        await ctx.log(`【罪论】：三项均不满足，${p.name}${t ? ' 与 ' + t.name : ''} 各失去 1 点体力`);
        return;
      }
      // 牌堆顶在数组末尾：取最后 3 张，保留最上面 k 张，其余原序放回顶部
      const n = Math.min(3, g.deck.length);
      const top = g.deck.splice(g.deck.length - n, n);
      const keep = top.slice(top.length - k);
      const rest = top.slice(0, top.length - k);
      p.hand.push(...keep);
      if (rest.length) g.deck.push(...rest);
      await ctx.log(`【罪论】：满足 ${k} 项，保留 ${keep.map(c => cardLabel(c)).join('、')}，其余放回牌堆顶`);
      await g.trigger('cards.gain', { self: p, cards: keep, reason: 'zuilun' });
    },
  }, {
    on: 'damage.after', who: 'any',
    filter: (d) => d.from === d.player && d.to !== d.player,
    async effect(ctx) { ctx.self.flags.zuilunDmgTurn = ctx.game.turnCount; },
  }, {
    on: 'cards.discard', who: 'any',
    filter: (d) => d.self === d.player,
    async effect(ctx) { ctx.self.flags.zuilunDiscardTurn = ctx.game.turnCount; },
  }],
});

// ==================== 诸葛瞻 · 父荫 ====================
// 锁定技，你每回合第一次成为【杀】或【决斗】的目标后，若你的手牌数 ≤ 该角色，此牌对你无效。
defineSkill({
  id: 'fuyin', name: '父荫',
  desc: '锁定技，你每回合第一次成为【杀】或【决斗】的目标后，若你的手牌数小于等于该角色，此牌对你无效。',
  triggers: [{
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => {
      if (d.target !== d.player) return false;
      const nm = d.card?.name;
      if (nm !== 'sha' && nm !== 'juedou') return false;
      if (d.player.flags.fuyinTurn === d.game.turnCount) return false;
      return d.player.hand.length <= (d.self?.hand.length || 0);
    },
    async effect(ctx) {
      const p = ctx.self, d = ctx.data;
      d.canceled = true;
      p.flags.fuyinTurn = ctx.game.turnCount;
      await ctx.log(`【父荫】：${cardLabel(d.card)} 对 ${p.name} 无效`);
    },
  }],
});

// ==================== 毌丘俭 · 征荣 / 鸿举 / 清侧 ====================
defineSkill({
  id: 'zhengrong', name: '征荣',
  desc: '当你对其他角色造成伤害后，你可以将其一张牌置于你的武将牌上，称为「荣」。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.from === d.player && d.to !== d.player && d.to.alive
      && (d.to.hand.length + Object.values(d.to.equips || {}).filter(Boolean).length) > 0,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.to, g = ctx.game;
      let card = null;
      if (t.hand.length) {
        const idx = Math.floor(Math.random() * t.hand.length);
        card = t.hand.splice(idx, 1)[0];
      } else {
        const slot = Object.keys(t.equips).find(k => t.equips[k]);
        if (slot) {
          card = t.equips[slot];
          t.equips[slot] = null;
          // ★静默摘装备会让监听装备变化的技能（飒然/降怒/精械弩）不刷新（SG031 C③）
          await g.trigger('equip.lose', { self: t, card, slot });
        }
      }
      if (!card) return;
      p.flags.rong = [...(p.flags.rong || []), card];
      setMark(p, 'rong', String(p.flags.rong.length));
      await g.trigger('zone.out', { self: p, cards: [card] });
      await ctx.log(`【征荣】：将 ${t.name} 的 ${cardLabel(card)} 置于武将牌上作为「荣」（共 ${p.flags.rong.length} 张）`);
    },
  }],
});

function awaken(p, ids) {
  for (const id of ids) {
    if ((effSkills(p) || []).some(s => s.id === id)) continue;
    const sk = getSkill(id);
    if (sk) p.skills.push(sk);
  }
}

defineSkill({
  id: 'hongju', name: '鸿举',
  desc: '觉醒技，准备阶段，若「荣」的数量大于等于 3，则你扣减 1 点体力上限并获得技能【清侧】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && (d.self.flags.rong || []).length >= 3 && !d.self.flags.hongjuDone,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.hongjuDone = true;
      p.maxHp -= 1;
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      awaken(p, ['qingce']);
      await ctx.log(`【鸿举】：觉醒！${p.name} 体力上限 -1，获得【清侧】`);
    },
  }],
});

defineSkill({
  id: 'qingce', name: '清侧',
  desc: '出牌阶段，你可以获得一张「荣」，然后弃置场上的一张牌。',
  active: {
    prompt: '获得一张「荣」，然后弃置场上的一张牌',
    cost: '荣',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const rong = p.flags.rong || [];
      if (!rong.length) { await ctx.log('【清侧】：没有「荣」'); return; }
      const card = rong.shift();
      setMark(p, 'rong', String(rong.length));
      p.hand.push(card);
      await g.trigger('zone.in', { self: p, cards: [card] });
      const pool = [];
      for (const x of g.alive()) {
        for (const c of x.hand) pool.push({ seat: x.seat, id: c.id });
        for (const [slot, c] of Object.entries(x.equips)) if (c) pool.push({ seat: x.seat, id: c.id, slot });
        for (const c of x.judgeZone || []) pool.push({ seat: x.seat, id: c.id, judge: true });
      }
      if (!pool.length) { await ctx.log('【清侧】：场上无牌可弃'); return; }
      const res = await g.ask(p, 'card', { prompt: '【清侧】：选择场上要弃置的一张牌', cards: pool.map(x => x.id), optional: true });
      const id = res?.cardId || res?.id;
      const ent = pool.find(x => x.id === id) || pool[0];
      const owner = g.players.find(x => x.seat === ent.seat);
      if (!owner) return;
      if (ent.judge) {
        const i = (owner.judgeZone || []).findIndex(c => c.id === ent.id);
        if (i >= 0) { const c = owner.judgeZone.splice(i, 1)[0]; await ctx.discard(owner, [c], { reason: 'qingce' }); }
      } else if (ent.slot) {
        const c = owner.equips[ent.slot];
        await g.unequipCard(owner, c, { reason: 'qingce' });
        if (c) await ctx.discard(owner, [c], { reason: 'qingce' });
      } else {
        const c = owner.hand.find(x => x.id === ent.id);
        if (c) await ctx.discard(owner, [c], { reason: 'qingce' });
      }
      await ctx.log(`【清侧】：收回一张「荣」，并弃置 ${owner.name} 的一张牌`);
    },
  },
});

// ==================== 袁术 · 庸肆 / 伪帝 ====================
const kingdomCount = (g) => new Set(g.alive().map(p => p.kingdom)).size;

defineSkill({
  id: 'yongsi', name: '庸肆',
  desc: '锁定技，摸牌阶段，你改为摸 X 张牌（X 为存活势力数）。出牌阶段结束时，若你此阶段：1. 没有造成伤害，将手牌摸至当前体力值；2. 造成伤害数超过 1 点，本回合手牌上限改为已损失体力值。',
  triggers: [
    {
      on: 'draw.count', who: 'self', optional: false,
      async effect(ctx) {
        const d = ctx.data;
        d.count = kingdomCount(ctx.game);
        await ctx.log(`【庸肆】：改为摸 ${d.count} 张牌（存活势力数）`);
      },
    },
    {
      on: 'phase.end', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const dmg = p.flags.yongsiDmgTurn === g.turnCount ? (p.flags.yongsiDmgAmt || 0) : 0;
        if (dmg === 0) {
          if (p.hand.length < p.hp) {
            const n = p.hp - p.hand.length;
            await ctx.draw(p, n, { reason: 'yongsi' });
            await ctx.log(`【庸肆】：本阶段未造成伤害，摸 ${n} 张至手牌数等于体力值`);
          }
        } else if (dmg > 1) {
          const lost = p.maxHp - p.hp;
          p.flags.handLimit = lost - p.hp;
          await ctx.log(`【庸肆】：本阶段造成 ${dmg} 点伤害，本回合手牌上限改为已损失体力值（${lost}）`);
        }
      },
    },
    {
      on: 'damage.after', who: 'any',
      filter: (d) => d.from === d.player && d.to !== d.player,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.yongsiDmgTurn = ctx.game.turnCount;
        p.flags.yongsiDmgAmt = (p.flags.yongsiDmgAmt || 0) + (ctx.data.amount || 1);
      },
    },
    {
      on: 'turn.begin', who: 'self',
      async effect(ctx) {
        ctx.self.flags.yongsiDmgTurn = 0;
        ctx.self.flags.yongsiDmgAmt = 0;
      },
    },
  ],
});

defineSkill({
  id: 'weidi', name: '伪帝',
  locked: true,   // 主公技+锁定技：同上（desc 写作「主公技，锁定技，…」）
  desc: '主公技，锁定技，你于弃牌阶段弃置的牌可以交给任意名其他群势力角色各一张。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: true,
    filter: (d) => d.self === d.player && d.reason === 'discard' && d.player.role === 'lord'
      && (d.cards || []).length > 0
      && d.game.alive().some(x => x !== d.player && x.kingdom === 'qun'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.kingdom === 'qun');
      let given = 0;
      for (const c of (ctx.data.cards || [])) {
        const t = (await ctx.ask.targets(p, {
          min: 0, max: 1, candidates: cands, prompt: `【伪帝】：将 ${cardLabel(c)} 交给一名其他群势力角色（可取消）`,
        }))[0];
        if (!t) continue;
        t.hand.push(c);
        given++;
      }
      if (given) await ctx.log(`【伪帝】：将 ${given} 张弃牌交给其他群势力角色`);
    },
  }],
});

export const LEI2_SKILL_IDS = ['kongsheng', 'liangyin', 'zuilun', 'fuyin', 'zhengrong', 'hongju', 'qingce', 'yongsi', 'weidi'];
