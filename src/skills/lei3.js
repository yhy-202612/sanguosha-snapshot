// 神话再临·雷（第三批）：陆抗 / 张绣 —— 引入 M7「装备区废除」机制
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

const SLOT_CN = { weapon: '武器栏', armor: '防具栏', horsePlus: '+1 坐骑栏', horseMinus: '-1 坐骑栏', treasure: '宝物栏' };
const SLOTS = ['weapon', 'armor', 'horsePlus', 'horseMinus', 'treasure'];

// 废除一个装备栏：弃置其中装备并记为已废除
async function disableSlot(ctx, p, slot) {
  const g = ctx.game;
  p.flags.disabledEquip = { ...(p.flags.disabledEquip || {}), [slot]: true };
  const c = p.equips[slot];
  if (c) {
    p.equips[slot] = null;
    await g.trigger('equip.lose', { self: p, card: c, slot });
    if (!g.discardPile.includes(c)) g.discardPile.push(c);
    await ctx.log(`废除${SLOT_CN[slot]}：弃置 ${cardLabel(c)}`);
  }
  return c;
}

// 已废除的装备栏
const disabledSlots = (p) => (p.flags.disabledEquip ? SLOTS.filter(k => p.flags.disabledEquip[k]) : []);

function awaken(p, ids) {
  for (const id of ids) {
    if ((effSkills(p) || []).some(s => s.id === id)) continue;
    const sk = getSkill(id);
    if (sk) p.skills.push(sk);
  }
}

// ==================== 陆抗 · 谦节 ====================
defineSkill({
  id: 'qianjie', name: '谦节',
  desc: '锁定技，你不能被横置，且不能成为延时类锦囊牌或其他角色拼点的目标。',
  triggers: [{
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => {
      if (d.target !== d.player) return false;
      const meta = CARD_META[d.card?.name];
      if (d.card?.name === 'tiesuo') return true;           // 不能被横置
      if (meta?.delayed) return true;                       // 延时类锦囊
      if (d.reason === 'pindian' || d.card?.__pindian) return true;  // 拼点
      return false;
    },
    async effect(ctx) {
      const d = ctx.data;
      d.canceled = true;
      await ctx.log(`【谦节】：${ctx.self.name} 不能成为 ${cardLabel(d.card)} 的目标`);
    },
  }],
});

// ==================== 陆抗 · 决堰 ====================
defineSkill({
  id: 'jueyan', name: '决堰',
  desc: '出牌阶段限一次，你可以废除你装备区里的一个装备栏，然后执行对应的一项：武器栏，本回合你可以多使用三张【杀】；防具栏，摸三张牌，本回合手牌上限 +3；坐骑栏，本回合你使用牌无距离限制。',
  active: {
    perPhase: true,
    prompt: '废除一个装备栏，获得对应收益',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!effSkills(p).some(s => s.id === 'jueyan')) { await ctx.log('【决堰】：技能已失去'); return; }
      const avail = SLOTS.filter(k => !(p.flags.disabledEquip || {})[k]);
      if (!avail.length) { await ctx.log('【决堰】：装备栏已全部废除'); return; }
      const idx = await g.chooseOne(p, avail.map(k => SLOT_CN[k]), { prompt: '【决堰】：选择要废除的装备栏' });
      const slot = avail[idx] || avail[0];
      await disableSlot(ctx, p, slot);
      if (slot === 'weapon') {
        p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + 3;   // 本回合（SG028）
        await ctx.log('【决堰】·武器栏：本回合可以多使用三张【杀】');
      } else if (slot === 'armor') {
        await ctx.draw(p, 3, { reason: 'jueyan' });
        p.flags.handLimit = (p.flags.handLimit || 0) + 3;
        await ctx.log('【决堰】·防具栏：摸三张牌，本回合手牌上限 +3');
      } else {
        p.flags.freeRangeTurn = g.turnCount;
        await ctx.log('【决堰】·坐骑栏：本回合你使用牌无距离限制');
      }
    },
  },
});

// ==================== 陆抗 · 破势 ====================
defineSkill({
  id: 'poshi', name: '破势',
  desc: '觉醒技，准备阶段开始时，若你的装备栏均被废除或你的体力值为 1，你扣减 1 点体力上限，然后将手牌补至体力上限，失去技能【决堰】并获得技能【怀柔】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && !d.self.flags.poshiDone
      && (disabledSlots(d.self).length === SLOTS.length || d.self.hp === 1),
    async effect(ctx) {
      const p = ctx.self;
      p.flags.poshiDone = true;
      p.maxHp -= 1;
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      if (p.hand.length < p.maxHp) await ctx.draw(p, p.maxHp - p.hand.length, { reason: 'poshi' });
      const i = (p.skills || []).findIndex(s => s.id === 'jueyan');
      if (i >= 0) p.skills.splice(i, 1);
      awaken(p, ['huairou']);
      await ctx.log(`【破势】：觉醒！${p.name} 体力上限 -1，手牌补至 ${p.maxHp}，失去【决堰】并获得【怀柔】`);
    },
  }],
});

// ==================== 陆抗 · 怀柔 ====================
defineSkill({
  id: 'huairou', name: '怀柔',
  desc: '出牌阶段，你可以重铸装备牌。',
  active: {
    prompt: '重铸一张装备牌（弃置并摸一张）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const equips = p.hand.filter(c => CARD_META[c.name]?.sub);
      if (!equips.length) { await ctx.log('【怀柔】：没有装备牌可重铸'); return; }
      const res = await g.ask(p, 'card', {
        prompt: '【怀柔】：选择要重铸的装备牌', cards: equips.map(c => c.id), optional: true,
      });
      const card = equips.find(c => c.id === (res?.cardId || res?.id));
      if (!card) return;
      await ctx.discard(p, [card], { reason: 'huairou' });
      await ctx.draw(p, 1, { reason: 'huairou' });
      await ctx.log(`【怀柔】：重铸 ${cardLabel(card)}，摸一张牌`);
    },
  },
});

// ==================== 张绣 · 雄乱 ====================
defineSkill({
  id: 'xiongluan', name: '雄乱',
  desc: '限定技，出牌阶段，你可以废除你的判定区和装备区，然后指定一名其他角色；直到回合结束，你对其使用牌无距离和次数限制，其不能使用和打出手牌。',
  active: {
    limitOnce: true,
    prompt: '废除判定区与装备区，令一名角色本回合不能使用手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.xiongluanUsed) { await ctx.log('【雄乱】：本局限定技已使用'); return; }
      const t = (await ctx.ask.targets(p, {
        min: 1, max: 1, candidates: g.alive().filter(x => x !== p), prompt: '【雄乱】：选择一名其他角色',
      }))[0];
      if (!t) return;
      p.flags.xiongluanUsed = true;
      // 废除判定区
      const judges = (p.judgeZone || []).splice(0);
      for (const z of judges) {
        const c = z.card || z;
        if (!g.discardPile.includes(c)) g.discardPile.push(c);
      }
      if (judges.length) await ctx.log(`【雄乱】：判定区 ${judges.length} 张牌置入弃牌堆`);
      // 废除装备区（所有装备栏都废除，含宝物栏；即使该栏当时没有装备也要标记）
      for (const slot of SLOTS) {
        await disableSlot(ctx, p, slot);
      }
      p.marks.xiongluan = t.name;
      p.flags.xiongluanSeat = t.seat;
      p.flags.xiongluanTurn = g.turnCount;
      t.flags.xiongluanBan = g.turnCount;
      t.flags.xiongluanBy = p.seat;
      await ctx.log(`【雄乱】：指定 ${t.name}，本回合对其使用牌无距离与次数限制，且其不能使用和打出手牌`);
    },
  },
});

// ==================== 张绣 · 从谏 ====================
defineSkill({
  id: 'congjian', name: '从谏',
  desc: '当你成为锦囊牌的目标时，若此牌的目标数大于 1，你可以交给其中一名目标角色一张牌，然后摸一张牌；若你给出的牌是装备牌，改为摸两张牌。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => d.target === d.player && CARD_META[d.card?.name]?.type === 'trick'
      && !CARD_META[d.card?.name]?.delayed
      && ((d.used || []).length + 1) > 1 && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const others = (ctx.data.used || []).filter(x => x && x !== p);
      if (!others.length) return;
      const t = (await ctx.ask.targets(p, {
        min: 1, max: 1, candidates: others, prompt: '【从谏】：交给其中一名目标角色一张牌',
      }))[0];
      if (!t) return;
      const res = await g.ask(p, 'card', {
        prompt: '【从谏】：选择要交出的牌', cards: p.hand.map(c => c.id), optional: true,
      });
      const card = p.hand.find(c => c.id === (res?.cardId || res?.id));
      if (!card) return;
      const i = p.hand.indexOf(card);
      if (i >= 0) p.hand.splice(i, 1);
      t.hand.push(card);
      const isEquip = !!CARD_META[card.name]?.sub;
      await ctx.draw(p, isEquip ? 2 : 1, { reason: 'congjian' });
      await ctx.log(`【从谏】：交给 ${t.name} ${cardLabel(card)}，摸 ${isEquip ? 2 : 1} 张牌`);
    },
  }],
});

export const LEI3_SKILL_IDS = ['qianjie', 'jueyan', 'poshi', 'huairou', 'xiongluan', 'congjian'];
