// 线下叙事包（narrative）：蚀心入魔·嗔（8 将）+ 雁翎耀光（界蔡文姬 / 界孙策）
// 资料：萌娘百科 / 百度百科 / 哔哩哔哩 wiki（详见 tools/narrativecheck.js 头部说明与交付总结）
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, isRed , EQUIP_SUB } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

let vseq = 0;
const vcard = (name, type = 'trick', suit = 'spade', num = 7) => ({ id: `vnr${++vseq}`, name, suit, num, type, virtual: true });
const SLOTS = ['weapon', 'armor', 'horsePlus', 'horseMinus', 'treasure'];
const SLOT_CN = { weapon: '武器栏', armor: '防具栏', horsePlus: '+1 坐骑栏', horseMinus: '-1 坐骑栏', treasure: '宝物栏' };
const roundOf = (g) => Math.floor(((g.turnCount || 1) - 1) / Math.max(1, g.alive().length));
const allCards = (p) => [...p.hand, ...Object.values(p.equips).filter(Boolean)];
const NAME_CN = (n) => (CARD_META[n]?.cn || n);

function grant(p, ids) {
  for (const id of ids) {
    if ((effSkills(p) || []).some(s => s.id === id)) continue;
    const sk = getSkill(id);
    if (sk) p.skills.push(sk);
  }
}

// ==================== 嗔周瑜 · 劫火（使命技）====================
defineSkill({
  id: 'jiehuo2', name: '劫火',
  desc: '使命技，回合开始时，你可以令场上下次出现的伤害改为3点火焰伤害。失败：此伤害被造成时，若造成此伤害的角色不为你，你减1点体力上限。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: true,
      filter: (d) => !d.player.flags.jiehuoPend,
      async effect(ctx) {
        ctx.self.flags.jiehuoPend = true;
        await ctx.log('【劫火】：场上接下来出现的伤害改为3点火焰伤害');
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.player.flags.jiehuoPend === true,
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        p.flags.jiehuoPend = false;
        d.amount = 3;
        d.nature = 'fire';
        await ctx.log(`【劫火】：${d.to?.name} 即将受到的伤害改为 3 点火焰伤害`);
        if (d.from && d.from !== p) {
          p.maxHp = Math.max(1, p.maxHp - 1);
          await ctx.log(`【劫火】使命失败：造成伤害的不是 ${p.name}，其减 1 点体力上限（${p.maxHp}）`);
        }
      },
    },
  ],
});

// ==================== 嗔周瑜 · 香饵（使命技）====================
defineSkill({
  id: 'xianger', name: '香饵',
  desc: '使命技，出牌阶段限一次，你可以令一名角色于其下个结束阶段回复2点体力，期间其不能使用点数大于6的牌。失败：此回复体力流程结束后，若期间其受到的伤害值小于2，你减1点体力上限。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.self.flags.xianger === true
        && d.self.flags.xiangerOwner === d.player.seat && (d.card?.num || 0) > 6,
      async effect(ctx) {
        ctx.data.canceled = true;
        await ctx.log(`【香饵】：${ctx.self.name} 处于香饵期间，不能使用点数大于 6 的 ${cardLabel(ctx.data.card)}`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.to?.flags?.xianger === true && d.to.flags.xiangerOwner === d.player.seat,
      async effect(ctx) {
        const t = ctx.data.to;
        t.flags.xiangerDmg = (t.flags.xiangerDmg || 0) + (ctx.data.amount || 0);
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'end' && d.self !== d.player && d.self.flags.xianger === true
        && d.self.flags.xiangerOwner === d.player.seat,
      async effect(ctx) {
        const p = ctx.data.self, g = ctx.game;
        const owner = g.players.find(x => x.seat === p.flags.xiangerOwner) || null;
        const dmg = p.flags.xiangerDmg || 0;
        p.flags.xianger = false;
        p.flags.xiangerDmg = 0;
        await ctx.recover(p, 2, { reason: 'xianger' });
        await ctx.log(`【香饵】：${p.name} 于结束阶段回复 2 点体力（期间受到伤害 ${dmg} 点）`);
        if (owner && dmg < 2) {
          owner.maxHp = Math.max(1, owner.maxHp - 1);
          await ctx.log(`【香饵】使命失败：${owner.name} 减 1 点体力上限（${owner.maxHp}）`);
        }
      },
    },
  ],
  active: {
    perPhase: true,
    prompt: '令一名角色下个结束阶段回复2点体力（期间不能使用点数大于6的牌）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive();
      const t = (await ctx.ask.targets(p, { prompt: '【香饵】：选择一名角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      t.flags.xianger = true;
      t.flags.xiangerOwner = p.seat;
      t.flags.xiangerDmg = 0;
      await ctx.log(`【香饵】：${t.name} 下个结束阶段回复 2 点体力，期间不能使用点数大于 6 的牌`);
    },
  },
});

// ==================== 嗔周瑜 · 灭虢（使命技）====================
defineSkill({
  id: 'mieguo', name: '灭虢',
  desc: '使命技，额定回合结束后，你可以获得一名其他角色至多三张牌并令其指定等量角色，然后你执行一个不能对其指定角色使用牌的额外回合。失败：此额外回合结束时，若此额外回合你未使用过牌，你减1点体力上限。',
  triggers: [
    {
      on: 'turn.end', who: 'self', optional: true,
      filter: (d) => d.self === d.player && d.game.alive().some(x => x !== d.player && allCards(x).length > 0),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter(x => x !== p && allCards(x).length);
        const t = (await ctx.ask.targets(p, { prompt: '【灭虢】：选择获得牌的角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const pool = allCards(t);
        const picks = await g.chooseSomeCards(p, pool, Math.min(3, pool.length), { prompt: '【灭虢】：获得至多三张牌', optional: false });
        const got = picks.length ? picks : pool.slice(0, Math.min(3, pool.length));
        for (const c of got) {
          const slot = SLOTS.find(k => t.equips[k] === c);
          if (slot) { t.equips[slot] = null; await g.trigger('equip.lose', { self: t, card: c, slot }); }
        }
        await ctx.gain(p, got, { from: t, reason: 'mieguo' });
        const others = g.alive().filter(x => x !== p && x !== t);
        const banned = [];
        while (banned.length < Math.min(got.length, others.length)) {
          const c = g.rng.pick(others.filter(x => !banned.includes(x)));
          if (!c) break;
          banned.push(c);
        }
        p.flags.mieguoBanned = banned.map(x => x.seat);
        p.flags.mieguoUsed = 0;
        p.flags.mieguoPending = true;
        p.flags.mieguoExtraTurn = null;
        await ctx.log(`【灭虢】：获得 ${t.name} 的 ${got.length} 张牌，${t.name} 指定 ${banned.map(x => x.name).join('、') || '（无）'}，${p.name} 执行一个额外回合`);
        await ctx.extraTurn(p);
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.player.flags.mieguoPending === true && d.player.flags.mieguoExtraTurn == null,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.mieguoExtraTurn = ctx.game.turnCount;
        p.flags.mieguoUsed = 0;
        await ctx.log('【灭虢】：额外回合开始');
      },
    },
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => d.player.flags.mieguoPending === true && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.mieguoUsed = (p.flags.mieguoUsed || 0) + 1;
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.player.flags.mieguoPending === true && d.player.flags.mieguoExtraTurn === d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.mieguoPending = false;
        if ((p.flags.mieguoUsed || 0) === 0) {
          p.maxHp = Math.max(1, p.maxHp - 1);
          await ctx.log(`【灭虢】使命失败：额外回合未使用过牌，${p.name} 减 1 点体力上限（${p.maxHp}）`);
        }
      },
    },
  ],
});

// ==================== 嗔诸葛亮 · 并驱 ====================
const TRICK_NAMES = ['juedou', 'nanman', 'wanjian', 'huogong', 'wuzhong', 'guohe', 'shunshou', 'tiesuo'];
const DMG_TRICKS = new Set(['juedou', 'nanman', 'wanjian', 'huogong']);
defineSkill({
  id: 'bingqu2', name: '并驱',
  desc: '准备阶段，你可以与一名其他角色各声明一种普通锦囊牌，然后双方依次将半数手牌（向上取整）当对方声明的牌使用。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.self.hand.length > 0 && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      const t = (await ctx.ask.targets(p, { prompt: '【并驱】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const idx = await ctx.ask.choose(p, TRICK_NAMES.map(n => `声明【${NAME_CN(n)}】`), { prompt: '【并驱】：声明一种普通锦囊牌', reason: 'bingqu2' });
      const mine = TRICK_NAMES[idx >= 0 ? idx : 0];
      const theirs = g.rng.pick(TRICK_NAMES);
      await ctx.log(`【并驱】：${p.name} 声明【${NAME_CN(mine)}】，${t.name} 声明【${NAME_CN(theirs)}】`);
      // 对方声明的牌：你以半数手牌（向上取整）为之
      const useHalf = async (who, name, other) => {
        const n = Math.ceil(who.hand.length / 2);
        if (n <= 0) return;
        const cards = who.hand.slice(0, n);
        await ctx.discard(who, cards, { reason: 'bingqu2' });
        if (DMG_TRICKS.has(name)) {
          const victim = g.rng.pick(g.alive().filter(x => x !== who)) || null;
          if (victim) {
            await ctx.log(`【并驱】：${who.name} 将 ${n} 张手牌当【${NAME_CN(name)}】使用（目标 ${victim.name}）`);
            await g.damage({ from: who, to: victim, amount: 1, card: vcard(name), reason: 'bingqu2' });
          }
        } else {
          await ctx.log(`【并驱】：${who.name} 将 ${n} 张手牌当【${NAME_CN(name)}】使用`);
          await ctx.draw(who, 1, { reason: 'bingqu2' });
        }
      };
      if (p.alive) await useHalf(p, theirs, t);
      if (t.alive) await useHalf(t, mine, p);
      await ctx.log('【并驱】：并驱结算完毕');
    },
  }],
});

// ==================== 嗔诸葛亮 · 狂暴（锁定技）====================
defineSkill({
  id: 'kuangbao2', name: '狂暴',
  desc: '锁定技，游戏的第一个回合开始后，你获得2枚「暴怒」；当你造成或受到1点伤害后，你获得1枚「暴怒」。',
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => d.game.turnCount === 1 && !d.player.flags.kuangbaoInit,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.kuangbaoInit = true;
        p.marks = p.marks || {};
        p.marks.baonu = (p.marks.baonu || 0) + 2;
        await ctx.log(`【狂暴】：${p.name} 获得 2 枚「暴怒」（共 ${p.marks.baonu} 枚）`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => (d.from === d.player || d.to === d.player) && (d.amount || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.marks = p.marks || {};
        p.marks.baonu = (p.marks.baonu || 0) + (ctx.data.amount || 1);
        await ctx.log(`【狂暴】：${p.name} 获得 ${ctx.data.amount || 1} 枚「暴怒」（共 ${p.marks.baonu} 枚）`);
      },
    },
  ],
});

// ==================== 嗔诸葛亮 · 无谋（锁定技）====================
defineSkill({
  id: 'wumou2', name: '无谋',
  desc: '锁定技，当你使用普通锦囊牌时，你选择一项：1.弃1枚「暴怒」；2.失去1点体力。',
  triggers: [{
    on: 'card.use.before', who: 'self', optional: false,
    filter: (d) => {
      if (d.self !== d.player) return false;
      const m = CARD_META[d.effName || d.card?.name];
      return !!m && m.type === 'trick' && !m.delayed;
    },
    async effect(ctx) {
      const p = ctx.self;
      p.marks = p.marks || {};
      if ((p.marks.baonu || 0) > 0) {
        const idx = await ctx.ask.choose(p, ['弃1枚「暴怒」', '失去1点体力'], { prompt: '【无谋】：选择一项', reason: 'wumou2' });
        if (idx !== 1) {
          p.marks.baonu -= 1;
          await ctx.log(`【无谋】：弃 1 枚「暴怒」（剩余 ${p.marks.baonu} 枚）`);
          return;
        }
      }
      await ctx.loseHp(p, 1);
      await ctx.log('【无谋】：失去 1 点体力');
    },
  }],
});

// ==================== 嗔诸葛亮 · 燔心 ====================
defineSkill({
  id: 'fanxin', name: '燔心',
  desc: '①游戏的第一个回合开始后，你可以令一名其他角色获得1枚「燔心」，其获得〖狂暴〗和〖无谋〗。②当一名角色死亡时，你可以将其所有「燔心」交给另一名角色，其获得〖狂暴〗和〖无谋〗。③一名角色的回合开始后，若其有「燔心」，你可以选择其至多5枚「暴怒」，其弃这些「暴怒」，你摸X张牌。',
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: true,
      filter: (d) => d.game.turnCount === 1 && !d.player.flags.fanxinGiven && d.game.alive().some(x => x !== d.player),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter(x => x !== p);
        const t = (await ctx.ask.targets(p, { prompt: '【燔心】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        p.flags.fanxinGiven = true;
        t.marks = t.marks || {};
        t.marks.fanxin = 1;
        grant(t, ['kuangbao2', 'wumou2']);
        await ctx.log(`【燔心】：${t.name} 获得 1 枚「燔心」以及〖狂暴〗〖无谋〗`);
      },
    },
    {
      on: 'death.after', who: 'any', optional: true,
      filter: (d) => (d.self?.marks?.fanxin || 0) > 0 && d.game.alive().some(x => x !== d.player && x !== d.self),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter(x => x !== p && x !== ctx.data.self);
        const t = (await ctx.ask.targets(p, { prompt: '【燔心】：将「燔心」交给一名角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const n = ctx.data.self.marks.fanxin || 0;
        ctx.data.self.marks.fanxin = 0;
        t.marks = t.marks || {};
        t.marks.fanxin = (t.marks.fanxin || 0) + n;
        grant(t, ['kuangbao2', 'wumou2']);
        await ctx.log(`【燔心】：${n} 枚「燔心」交给 ${t.name}`);
      },
    },
    {
      on: 'turn.begin', who: 'any', optional: true,
      filter: (d) => (d.self?.marks?.fanxin || 0) > 0 && (d.self?.marks?.baonu || 0) > 0,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.self;
        const n = Math.min(5, t.marks.baonu || 0);
        t.marks.baonu -= n;
        await ctx.draw(p, n, { reason: 'fanxin' });
        await ctx.log(`【燔心】：${t.name} 弃 ${n} 枚「暴怒」，${p.name} 摸 ${n} 张牌`);
      },
    },
  ],
});

// ==================== 嗔曹操 · 枯心 ====================
defineSkill({
  id: 'kuxin', name: '枯心',
  desc: '当你受到伤害后，你可以令所有其他角色依次展示任意张手牌，你选择获得所有角色展示的牌或一名其他角色未展示的所有手牌并展示之，若你未因此获得红桃牌，你弃置获得的牌并翻面。（简化：其余角色各展示一张手牌）',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.game.alive().some(x => x !== d.player && x.hand.length),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const idx = await ctx.ask.choose(p, ['获得所有角色展示的牌', '获得一名其他角色未展示的手牌'], { prompt: '【枯心】：选择一项', reason: 'kuxin' });
      const got = [];   // { c, owner }：必须按原主分别 gain（不传 from 会让牌在原主区域双存）
      if (idx === 1) {
        const cands = g.alive().filter(x => x !== p && x.hand.length);
        const t = (await ctx.ask.targets(p, { prompt: '【枯心】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
        if (t) { got.push({ c: t.hand[0], owner: t }); await ctx.log(`【枯心】：获得 ${t.name} 未展示的手牌`); }
      } else {
        for (const q of g.alive()) {
          if (q === p || !q.hand.length) continue;
          got.push({ c: g.rng.pick(q.hand), owner: q });
        }
        await ctx.log(`【枯心】：${got.length} 名其他角色各展示一张手牌`);
      }
      if (!got.length) return;
      const hasHeart = got.some(x => x.c.suit === 'heart');
      for (const { c, owner } of got) await ctx.gain(p, [c], { from: owner, reason: 'kuxin' });
      await ctx.log(`【枯心】：${p.name} 获得 ${got.length} 张牌`);
      if (!hasHeart) {
        await ctx.discard(p, got.filter(x => p.hand.includes(x.c)).map(x => x.c), { reason: 'kuxin' });
        await g.flip(p);
        await ctx.log('【枯心】：未获得红桃牌，弃置这些牌并翻面');
      }
    },
  }],
});

// ==================== 嗔曹操 · 似故 ====================
defineSkill({
  id: 'sigu', name: '似故',
  desc: '出牌阶段限一次，你可以令一名其他角色进行一次判定并对其造成两次1点伤害，期间其根据判定结果视为拥有对应的「受到伤害后」的技能。（简化：省略技能授予）',
  active: {
    perPhase: true,
    prompt: '令一名其他角色判定，然后对其造成两次1点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【似故】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const j = await ctx.judge(t, { reason: 'sigu' });
      const num = j.num || 1;
      const TABLE = { 1: '智迟', 2: '刚烈', 3: '反馈', 4: '遗计', 5: '节命', 6: '放逐', 7: '矢北', 8: '称象', 9: '智愚', 10: '鸡肋', 11: '贲育', 12: '筹策', 13: '武魂' };
      await ctx.log(`【似故】：${t.name} 判定点数 ${num}，期间视为拥有〖${TABLE[num] || '智迟'}〗`);
      for (let i = 0; i < 2; i++) {
        if (!t.alive) break;
        await ctx.damage({ from: p, to: t, amount: 1, card: vcard('sha'), reason: 'sigu' });
      }
    },
  },
});

// ==================== 嗔鲁肃 · 万利 ====================
defineSkill({
  id: 'wanli', name: '万利',
  desc: '首轮开始时，你可以交给一名其他角色任意张牌；第四轮结束时，其交给你三倍数量的牌（此前其称为「万利」角色；不足则全给并失去所有技能）；若其不为「万利」角色或已死亡，摸牌阶段，你多摸三张牌。',
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: true,
      filter: (d) => d.game.turnCount === 1 && !d.player.flags.wanliSet && d.player.hand.length >= 2,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter(x => x !== p);
        const t = (await ctx.ask.targets(p, { prompt: '【万利】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(3, p.hand.length), { prompt: '【万利】：交给其任意张牌', optional: true });
        if (!picks.length) return;
        await ctx.gain(t, picks, { from: p, reason: 'wanli' });
        p.flags.wanliSet = true;
        p.flags.wanliSeat = t.seat;
        p.flags.wanliN = picks.length;
        p.flags.wanliDue = 4;
        t.flags.wanliDebtor = p.seat;
        await ctx.log(`【万利】：交给 ${t.name} ${picks.length} 张牌，第四轮结束时其需归还 ${picks.length * 3} 张`);
      },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player;
        if (!p.flags.wanliSeat && p.flags.wanliSeat !== 0) return false;
        if ((d.game.turnPlayer || {}).seat !== p.seat) return false;
        return roundOf(d.game) >= (p.flags.wanliDue || 4);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const t = g.players.find(x => x.seat === p.flags.wanliSeat);
        p.flags.wanliSeat = null;
        if (!t || !t.alive) { await ctx.log('【万利】：欠债角色已不在场'); return; }
        const need = (p.flags.wanliN || 0) * 3;
        const pool = allCards(t);
        if (pool.length >= need && need > 0) {
          const picks = pool.slice(0, need);
          await ctx.gain(p, picks, { from: t, reason: 'wanli' });
          await ctx.log(`【万利】：${t.name} 归还 ${picks.length} 张牌`);
        } else {
          await ctx.gain(p, pool, { from: t, reason: 'wanli' });
          const n = effSkills(t).length;
          await ctx.game.removeSkills(t, null);   // ★统一出口（SG029 BLOCKER-2）
          await ctx.log(`【万利】：${t.name} 牌不足，全部交出并失去 ${n} 个技能`);
        }
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'draw',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const t = p.flags.wanliSeat == null ? null : g.players.find(x => x.seat === p.flags.wanliSeat);
        if (t && t.alive) return;
        await ctx.draw(p, 3, { reason: 'wanli' });
        await ctx.log('【万利】：其不为「万利」角色或已死亡，摸牌阶段多摸 3 张牌');
      },
    },
  ],
});

// ==================== 嗔鲁肃 · 理说 ====================
defineSkill({
  id: 'lishuo', name: '理说',
  desc: '当你成为黑色牌的目标后，你可以摸一张牌并与「万利」角色拼点：若你赢，其交给你牌的时机提前一轮。',
  triggers: [{
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => {
      if (d.target !== d.player) return false;
      const c = d.card;
      if (!c || !c.suit || c.suit === 'none') return false;
      return !isRed(c);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.wanliSeat == null) { await ctx.draw(p, 1, { reason: 'lishuo' }); return; }
      const t = g.players.find(x => x.seat === p.flags.wanliSeat);
      await ctx.draw(p, 1, { reason: 'lishuo' });
      if (!t || !t.alive || !p.hand.length || !t.hand.length) return;
      const r = await pindian(g, p, t, { reason: '理说' });
      if (r.win) {
        p.flags.wanliDue = Math.max(1, (p.flags.wanliDue || 4) - 1);
        await ctx.log(`【理说】：拼点获胜，其归还牌的时机提前一轮（第 ${p.flags.wanliDue} 轮结束）`);
      }
    },
  }],
});

// ==================== 嗔孙尚香 · 骄纵 ====================
defineSkill({
  id: 'jiaozong', name: '骄纵',
  desc: '准备阶段或当你成为【杀】的目标后，你可以将场上一张装备牌移动至一名角色的装备区，其本回合不能使用此牌颜色的牌且受到的伤害+1。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare' && d.game.players.some(x => SLOTS.some(k => x.equips[k])),
      async effect(ctx) { await jiaozongMove(ctx); },
    },
    {
      on: 'target.before', who: 'any', optional: true,
      filter: (d) => d.target === d.player && d.card?.name === 'sha',
      async effect(ctx) { await jiaozongMove(ctx); },
    },
  ],
});

async function jiaozongMove(ctx) {
  const p = ctx.self, g = ctx.game;
  const pool = [];
  for (const q of g.alive()) for (const k of SLOTS) if (q.equips[k]) pool.push({ q, k, c: q.equips[k] });
  if (!pool.length) { await ctx.log('【骄纵】：场上没有装备牌'); return; }
  pool.sort(() => 0);
  const pick = pool[g.rng.int(pool.length)];
  const cands = g.alive();
  const t = (await ctx.ask.targets(p, { prompt: '【骄纵】：将装备牌移给一名角色', candidates: cands, min: 1, max: 1 }))[0];
  if (!t) return;
  // ★SG036 P1：按牌的牌型定槽位（原来「随便找空槽」会把坐骑塞进武器栏）
  const want = EQUIP_SUB[CARD_META[pick.c.name]?.sub];
  const free = !!want && !(t.flags.disabledEquip || {})[want];
  if (!free) { await ctx.log(`【骄纵】：${t.name} 没有可用的装备栏`); return; }
  await g.unequipCard(pick.q, pick.c, { reason: 'jiaozong' });
  await g.forceEquip(t, pick.c, { reason: 'jiaozong' });
  const color = isRed(pick.c) ? 'red' : 'black';
  t.flags.jiaozongColor = color;
  t.flags.jiaozongTurn = g.turnCount;
  t.flags.jiaozongDmgTurn = g.turnCount;
  await ctx.log(`【骄纵】：将 ${cardLabel(pick.c)} 移入 ${t.name} 的${SLOT_CN[free]}，其本回合不能使用${color === 'red' ? '红色' : '黑色'}牌且受到伤害 +1`);
}

// ==================== 嗔孙尚香 · 妇随（限定技）/ 比翼 ====================
defineSkill({
  id: 'fusui', name: '妇随',
  desc: '限定技，出牌阶段，你可以令一名男性角色失去一个非标签技能，然后你与其均获得「比翼」且防止你与其本轮受到的伤害。',
  active: {
    prompt: '令一名男性角色失去一个非标签技能，你与其获得「比翼」并防伤害（限定技）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.fusuiUsed) { await ctx.log('【妇随】：限定技，本局已发动过'); return; }
      const isMale = (q) => (q.gender || q.general?.gender || 'male') !== 'female';
      const cands = g.alive().filter(q => q !== p && isMale(q) && (effSkills(q) || []).some(s => !/^(锁定技|限定技|觉醒技|使命技|契定技)/.test(s.desc || '')));
      if (!cands.length) { await ctx.log('【妇随】：没有可失去技能的男性角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【妇随】：选择一名男性角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const removable = effSkills(t).filter(s => !/^(锁定技|限定技|觉醒技|使命技|契定技)/.test(s.desc || ''));
      const lost = removable[0];
      await ctx.game.removeSkills(t, [lost.id]);   // ★统一出口（SG029 BLOCKER-2）
      p.flags.fusuiUsed = true;
      for (const q of [p, t]) {
        grant(q, ['biyi']);
        q.flags.fusuiRound = roundOf(g);
        q.flags.biyiLost = lost.name;
      }
      await ctx.log(`【妇随】：${t.name} 失去〖${lost.name}〗，${p.name} 与其均获得〖比翼〗，本轮防止双方受到的伤害`);
    },
  },
});

defineSkill({
  id: 'biyi', name: '比翼',
  desc: '转换技，①因「妇随」而失去的技能；②「枭姬」。当前面：当你失去装备区里的牌后，你摸两张牌。（"失去的技能"面以记录形式保留）',
  triggers: [{
    on: 'equip.lose', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.biyiYang = !p.flags.biyiYang;
      await ctx.draw(p, 2, { reason: 'biyi' });
      await ctx.log(`【比翼】（${p.flags.biyiYang ? '①' : '②'}）：失去装备，摸 2 张牌（记录技能：${p.flags.biyiLost || '无'}）`);
    },
  }],
});

// ==================== 嗔赵云 · 诈夺 ====================
defineSkill({
  id: 'zhaduo', name: '诈夺',
  desc: '结束阶段，你可以获得两名其他角色各一张牌，视为对其中一名角色使用一张【杀】，然后另一名角色视为对你使用一张【决斗】；与其中一名角色的结算流程中，你视为拥有另一名角色的所有技能。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.self === d.player && d.game.alive().filter(x => x !== d.player).length >= 2,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      const picked = await ctx.ask.targets(p, { prompt: '【诈夺】：选择两名其他角色', candidates: cands, min: 2, max: 2 });
      if (!picked || picked.length < 2) return;
      const [a, b] = picked;
      for (const q of [a, b]) {
        const pool = allCards(q);
        if (!pool.length) continue;
        const c = g.rng.pick(pool);
        const slot = SLOTS.find(k => q.equips[k] === c);
        if (slot) { q.equips[slot] = null; await g.trigger('equip.lose', { self: q, card: c, slot }); }
        await ctx.gain(p, [c], { from: q, reason: 'zhaduo' });
      }
      await ctx.log(`【诈夺】：获得 ${a.name}、${b.name} 各一张牌`);
      if (a.alive) {
        await ctx.log(`【诈夺】：视为对 ${a.name} 使用一张【杀】（视为拥有 ${b.name} 的技能）`);
        await ctx.useCard({ from: p, card: vcard('sha'), targets: [a], reason: 'zhaduo', ignoreRange: true, ignoreShaLimit: true });
      }
      if (b.alive && p.alive) {
        await ctx.log(`【诈夺】：${b.name} 视为对 ${p.name} 使用一张【决斗】`);
        await ctx.useCard({ from: b, card: vcard('juedou'), targets: [p], reason: 'zhaduo', ignoreRange: true });
      }
    },
  }],
});

// ==================== 嗔张昭 · 挟众 ====================
defineSkill({
  id: 'xiezhong', name: '挟众',
  desc: '准备阶段，你可以令场上半数角色（向上取整）依次选择一项：1.摸两张牌，失去1点体力；2.将两张牌当【杀】使用。然后你可以令另一名角色执行两次被选择次数较多的一项。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.game.alive().length >= 2,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const n = Math.ceil(g.alive().length / 2);
      const order = g.orderFrom(p, { includeSelf: true }).filter(x => x.alive).slice(0, n);
      let c1 = 0, c2 = 0;
      for (const q of order) {
        const idx = await ctx.ask.choose(q, ['摸两张牌，失去1点体力', '将两张牌当【杀】使用'], { prompt: `【挟众】：${p.name} 令你选择一项`, reason: 'xiezhong' });
        if (idx === 1) {
          c2 += 1;
          const cards = q.hand.slice(0, 2);
          if (cards.length) {
            await ctx.discard(q, cards, { reason: 'xiezhong' });
            const victim = g.rng.pick(g.alive().filter(x => x !== q));
            await ctx.log(`【挟众】：${q.name} 将两张牌当【杀】使用`);
            if (victim) await g.damage({ from: q, to: victim, amount: 1, card: vcard('sha'), reason: 'xiezhong' });
          }
        } else {
          c1 += 1;
          await ctx.draw(q, 2, { reason: 'xiezhong' });
          await ctx.loseHp(q, 1);
          await ctx.log(`【挟众】：${q.name} 摸两张牌并失去 1 点体力`);
        }
      }
      const major = c1 >= c2 ? 1 : 2;
      const others = g.alive().filter(x => !order.includes(x));
      if (!others.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【挟众】：选择另一名角色执行两次较多的一项', candidates: others, min: 1, max: 1 }))[0];
      if (!t) return;
      for (let i = 0; i < 2; i++) {
        if (!t.alive) break;
        if (major === 1) {
          await ctx.draw(t, 2, { reason: 'xiezhong' });
          await ctx.loseHp(t, 1);
          await ctx.log(`【挟众】：${t.name} 执行两次「摸两张牌，失去1点体力」（第 ${i + 1} 次）`);
        } else {
          const cards = t.hand.slice(0, 2);
          if (!cards.length) break;
          await ctx.discard(t, cards, { reason: 'xiezhong' });
          const victim = g.rng.pick(g.alive().filter(x => x !== t));
          await ctx.log(`【挟众】：${t.name} 执行「将两张牌当【杀】使用」（第 ${i + 1} 次）`);
          if (victim) await g.damage({ from: t, to: victim, amount: 1, card: vcard('sha'), reason: 'xiezhong' });
        }
      }
    },
  }],
});

// ==================== 嗔张昭 · 乞施（契定技）====================
defineSkill({
  id: 'qishi', name: '乞施',
  desc: '契定技，结束阶段，你可以获得本回合弃牌堆中其他角色置入的至多五张牌，然后你跳过下个摸牌阶段。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.self === d.player && d.game.discardPile.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const take = g.discardPile.slice(-Math.min(5, g.discardPile.length));
      if (!take.length) return;
      for (const c of take) {
        const i = g.discardPile.indexOf(c);
        if (i >= 0) g.discardPile.splice(i, 1);
      }
      await ctx.gain(p, take, { reason: 'qishi' });
      p.flags.qishiDone = true;
      ctx.skipPhase(p, 'draw');
      await ctx.log(`【乞施】：获得弃牌堆中 ${take.length} 张牌，跳过下个摸牌阶段`);
    },
  }],
});

// ==================== 嗔贾华 · 伏备 ====================
defineSkill({
  id: 'fubei', name: '伏备',
  desc: '出牌阶段限一次，你可以将手牌摸至体力上限，然后将两张牌正面朝上置于牌堆顶前十张的任意位置；一名角色回合结束时，若牌堆顶的牌正面朝上，你对其造成1点伤害。',
  triggers: [{
    on: 'turn.end', who: 'any', optional: false,
    filter: (d) => {
      const top = d.game.deck[d.game.deck.length - 1];
      return !!top && top.skillTag === 'fubei' && top.faceUp === true;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.self;
      const top = g.deck[g.deck.length - 1];
      top.faceUp = false;
      top.skillTag = null;
      await ctx.log(`【伏备】：牌堆顶为 ${cardLabel(top)}（正面朝上），对 ${t.name} 造成 1 点伤害`);
      if (t && t.alive) await ctx.damage({ from: p, to: t, amount: 1, card: vcard('sha'), reason: 'fubei' });
    },
  }],
  active: {
    perPhase: true,
    prompt: '将手牌摸至体力上限，然后将两张牌正面朝上置于牌堆顶前十张',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.hand.length < p.maxHp) await ctx.draw(p, p.maxHp - p.hand.length, { reason: 'fubei' });
      if (!p.hand.length) { await ctx.log('【伏备】：没有手牌可置入牌堆'); return; }
      const cards = p.hand.length > 1
        ? await g.chooseSomeCards(p, p.hand.slice(), 2, { prompt: '【伏备】：选择两张牌置于牌堆顶', optional: false })
        : p.hand.slice(0, 1);
      const use = cards.length ? cards : p.hand.slice(0, 1);
      for (const c of use) {
        const i = p.hand.indexOf(c);
        if (i >= 0) p.hand.splice(i, 1);
        c.faceUp = true;
        c.skillTag = 'fubei';
        const span = Math.min(10, g.deck.length);
        const pos = g.deck.length - 1 - g.rng.int(Math.max(1, span));
        g.deck.splice(Math.max(0, pos), 0, c);
      }
      await ctx.log(`【伏备】：将 ${use.map(c => cardLabel(c)).join('、')} 正面朝上置于牌堆顶前十张`);
    },
  },
});

// ==================== 嗔贾华 · 殚瘁（契定技）====================
defineSkill({
  id: 'dancui', name: '殚瘁',
  desc: '契定技，当你造成伤害时，你可以弃置两张牌（无牌则不弃），令此伤害+1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => d.from === d.player && d.player.flags.dancuiSkipTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, d = ctx.data;
      if (!p.flags.dancuiLock) {
        const yes = await ctx.ask.confirm(p, '【殚瘁】：弃置两张牌令此伤害 +1？');
        if (!yes) return;
      } else {
        await ctx.log('【殚瘁】：契定技已锁定，必须发动');
      }
      const pool = allCards(p);
      const picks = pool.length ? await ctx.game.chooseSomeCards(p, pool, Math.min(2, pool.length), { prompt: '【殚瘁】：弃置两张牌', optional: true }) : [];
      for (const c of picks) {
        const slot = SLOTS.find(k => p.equips[k] === c);
        if (slot) { p.equips[slot] = null; await ctx.game.trigger('equip.lose', { self: p, card: c, slot }); }
      }
      if (picks.length) await ctx.discard(p, picks, { reason: 'dancui' });
      d.amount = (d.amount || 1) + 1;
      p.flags.dancuiLock = true;
      await ctx.log(`【殚瘁】：弃置 ${picks.length} 张牌，此伤害 +1（共 ${d.amount} 点）`);
    },
  }],
});

// ==================== 界蔡文姬 · 断肠（锁定技）====================
defineSkill({
  id: 'duanchang2', name: '断肠',
  desc: '锁定技，当你死亡时，你令杀死你的角色失去所有武将技能或弃置所有牌。',
  triggers: [{
    on: 'death.before', who: 'self', optional: false,
    filter: (d) => !!d.killer && d.killer !== d.self,
    async effect(ctx) {
      const k = ctx.data.killer;
      const idx = await ctx.ask.choose(k, ['失去所有武将技能', '弃置所有牌'], { prompt: '【断肠】：选择一项', reason: 'duanchang2' });
      if (idx === 1) {
        const pool = allCards(k);
        for (const c of pool) {
          const slot = SLOTS.find(s => k.equips[s] === c);
          if (slot) { k.equips[slot] = null; await ctx.game.trigger('equip.lose', { self: k, card: c, slot }); }
        }
        if (pool.length) await ctx.discard(k, pool, { reason: 'duanchang2' });
        await ctx.log(`【断肠】：${k.name} 弃置所有 ${pool.length} 张牌`);
      } else {
        const n = effSkills(k).length;
        await ctx.game.removeSkills(k, null);   // ★统一出口（SG029 BLOCKER-2）
        await ctx.log(`【断肠】：${k.name} 失去全部 ${n} 个武将技能`);
      }
    },
  }],
});

// ==================== 界蔡文姬 · 悲歌 ====================
defineSkill({
  id: 'beige2', name: '悲歌',
  desc: '当一名角色受到【杀】造成的伤害后，你可以弃置一张牌，然后令其进行判定，若结果为：红桃，其回复X点体力（X为其本次受到伤害值）；方块，其摸三张牌；梅花，伤害来源弃置两张牌；黑桃，伤害来源翻面。因此判定过四种花色后，你获得〖曲终〗。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && (d.amount || 0) > 0 && d.self.alive !== false && allCards(d.player).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const victim = ctx.data.to;
      const from = ctx.data.from;
      const swap = !!p.flags.quzhongSwap;
      const pool = allCards(p);
      const res = await g.ask(p, 'card', { prompt: '【悲歌】：弃置一张牌', cards: pool.map(c => c.id), optional: true, reason: 'beige2' });
      const c = res && res.cardId ? pool.find(x => x.id === res.cardId) : null;
      if (!c) return;
      const slot = SLOTS.find(k => p.equips[k] === c);
      if (slot) { p.equips[slot] = null; await g.trigger('equip.lose', { self: p, card: c, slot }); }
      await ctx.discard(p, [c], { reason: 'beige2' });
      const j = await ctx.judge(victim, { reason: '悲歌' });
      const target = swap ? (from || victim) : victim;
      const other = swap ? victim : from;
      const amt = ctx.data.amount || 1;
      if (j.suit === 'heart') await ctx.recover(target, amt, { reason: 'beige2' });
      else if (j.suit === 'diamond') await ctx.draw(target, 3, { reason: 'beige2' });
      else if (j.suit === 'club' && other) {
        const hand = allCards(other).slice(0, 2);
        if (hand.length) await ctx.discard(other, hand, { reason: 'beige2' });
      } else if (j.suit === 'spade' && other) await g.flip(other);
      p.flags.beigeSuits = p.flags.beigeSuits || {};
      p.flags.beigeSuits[j.suit] = true;
      await ctx.log(`【悲歌】：判定 ${j.suit}，适用对象 ${target.name}`);
      const four = ['heart', 'diamond', 'club', 'spade'].every(s => p.flags.beigeSuits[s]);
      if (four && !(effSkills(p) || []).some(s => s.id === 'quzhong')) {
        grant(p, ['quzhong']);
        await ctx.log(`【悲歌】：已判定过四种花色，${p.name} 获得〖曲终〗`);
      }
    },
  }],
});

// ==================== 界蔡文姬 · 曲终 ====================
defineSkill({
  id: 'quzhong', name: '曲终',
  desc: '一名角色的结束阶段，你可以将你本回合弃置的一张牌当【杀】使用，因此发动的〖悲歌〗交换选项中的其与伤害来源。',
  triggers: [
    {
      on: 'cards.discard', who: 'self', optional: false,
      filter: (d) => d.self === d.player && (d.cards || []).length > 0,
      async effect(ctx) {
        const c = (ctx.data.cards || [])[0];
        if (!c) return;
        ctx.self.flags.quzhongCard = c.id;
        ctx.self.flags.quzhongCardTurn = ctx.game.turnCount;
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'end' && d.self === d.player && d.player.flags.quzhongCard && d.player.flags.quzhongCardTurn === d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const c = g.discardPile.find(x => x.id === p.flags.quzhongCard);
        p.flags.quzhongCard = null;
        const cands = g.alive().filter(x => x !== p && g.inAttackRange(p, x));
        const t = (await ctx.ask.targets(p, { prompt: '【曲终】：将本回合弃置的一张牌当【杀】使用', candidates: cands, min: 1, max: 1 }))[0] || g.rng.pick(g.alive().filter(x => x !== p));
        if (!t) return;
        p.flags.quzhongSwap = true;
        await ctx.log(`【曲终】：${p.name} 将 ${c ? cardLabel(c) : '本回合弃置的牌'} 当【杀】使用`);
        await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'quzhong', ignoreRange: true, ignoreShaLimit: true });
        p.flags.quzhongSwap = false;
      },
    },
  ],
});

// ==================== 界孙策 · 激昂 ====================
defineSkill({
  id: 'jiang2', name: '激昂',
  desc: '当一名角色使用【决斗】或红色【杀】指定目标后，你可以与其各摸一张牌。你点数为K的牌均视为【杀】。',
  triggers: [{
    on: 'card.use.after', who: 'any', optional: true,
    filter: (d) => {
      const name = d.effName || d.card?.name;
      if (name === 'juedou') return true;
      if (name !== 'sha') return false;
      return isRed(d.card || {});
    },
    async effect(ctx) {
      const p = ctx.self, user = ctx.data.self;
      await ctx.draw(p, 1, { reason: 'jiang2' });
      if (user && user !== p && user.alive) await ctx.draw(user, 1, { reason: 'jiang2' });
      await ctx.log(`【激昂】：${p.name} 与 ${user?.name || '使用者'} 各摸一张牌`);
    },
  }],
});

// ==================== 界孙策 · 魂姿（觉醒技）====================
defineSkill({
  id: 'hunzi2', name: '魂姿',
  desc: '觉醒技，当你的体力值首次变为1时，你减1点体力上限，然后获得〖英姿〗和〖英魂〗。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.hp === 1 && !d.player.flags.hunziAwake,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.hunziAwake = true;
      p.maxHp = Math.max(1, p.maxHp - 1);
      grant(p, ['yingzi2', 'yinghun2']);
      await ctx.log(`【魂姿】觉醒：${p.name} 减 1 点体力上限（${p.maxHp}），获得〖英姿〗〖英魂〗`);
    },
  }],
});

// ==================== 界孙策 · 制霸（主公技，简化实现）====================
defineSkill({
  id: 'zhiba2', name: '制霸',
  desc: '主公技（简化实现），出牌阶段限一次，你可以与一名吴势力角色拼点，若其没赢，你获得拼点的两张牌。',
  active: {
    perPhase: true,
    prompt: '与一名吴势力角色拼点，其没赢则获得拼点的两张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.kingdom === 'wu' && x.hand.length && p.hand.length);
      if (!cands.length) { await ctx.log('【制霸】：没有可拼点的吴势力角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【制霸】：选择一名吴势力角色拼点', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: '制霸' });
      if (!r.win && r.a && r.b) {
        // 拼点牌已在弃牌堆，先从所有区域摘下再获得，否则会与弃牌堆双存
        for (const c of [r.a, r.b]) if (c) await g.takeCard(c);
        await ctx.gain(p, [r.a, r.b], { reason: 'zhiba2' });
        await ctx.log('【制霸】：其没赢，你获得双方拼点的牌');
      }
    },
  },
});

// ==================== 界孙策 · 英姿 / 英魂 ====================
defineSkill({
  id: 'yingzi2', name: '英姿',
  desc: '锁定技，摸牌阶段，你多摸一张牌；你的手牌上限等于X（X为你的体力上限）。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'draw',
      async effect(ctx) {
        await ctx.draw(ctx.self, 1, { reason: 'yingzi2' });
        await ctx.log('【英姿】：摸牌阶段多摸一张牌');
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        ctx.self.flags.handLimit = Math.max(0, ctx.self.maxHp - ctx.self.hp);
      },
    },
  ],
});

defineSkill({
  id: 'yinghun2', name: '英魂',
  desc: '准备阶段，若你已受伤，你可以选择一名其他角色并选择一项：1.令其摸X张牌，然后弃置一张牌；2.令其摸一张牌，然后弃置X张牌（X为你已损失的体力值）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.self.hp < d.self.maxHp && d.game.alive().some(x => x !== d.self),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.max(0, p.maxHp - p.hp);
      if (x <= 0) return;
      const cands = g.alive().filter(q => q !== p);
      const t = (await ctx.ask.targets(p, { prompt: '【英魂】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const idx = await ctx.ask.choose(p, [`令其摸 ${x} 张牌，然后弃置一张牌`, '令其摸一张牌，然后弃置 X 张牌'], { prompt: '【英魂】：选择一项', reason: 'yinghun2' });
      if (idx === 0) {
        await ctx.draw(t, x, { reason: 'yinghun2' });
        const pool = allCards(t);
        const picks = pool.length ? await g.chooseSomeCards(t, pool, 1, { prompt: '【英魂】：弃置一张牌', optional: true }) : [];
        if (picks.length) await ctx.discard(t, picks, { reason: 'yinghun2' });
      } else {
        await ctx.draw(t, 1, { reason: 'yinghun2' });
        const pool = allCards(t);
        const picks = pool.length ? await g.chooseSomeCards(t, pool, Math.min(x, pool.length), { prompt: `【英魂】：弃置 ${x} 张牌`, optional: true }) : [];
        if (picks.length) await ctx.discard(t, picks, { reason: 'yinghun2' });
      }
      await ctx.log(`【英魂】：${t.name} 执行英魂效果（X=${x}）`);
    },
  }],
});
