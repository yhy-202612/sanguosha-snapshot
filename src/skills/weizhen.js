// 威震天下·武庙（weizhen）：威震天下 6 将 + 武庙 4 将
// 资料：三国杀官网 x.sanguosha.com / biligame wiki / 百度百科 / 萌娘百科
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, isRed } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

let vseq = 0;
const vcard = (name, type = 'trick', suit = 'spade', num = 7) => ({ id: `vnw${++vseq}`, name, suit, num, type, virtual: true });
const SLOTS = ['weapon', 'armor', 'horsePlus', 'horseMinus', 'treasure'];
const SLOT_CN = { weapon: '武器栏', armor: '防具栏', horsePlus: '+1 坐骑栏', horseMinus: '-1 坐骑栏' };
const allCards = (p) => [...p.hand, ...Object.values(p.equips).filter(Boolean)];
const CN = (n) => (CARD_META[n]?.cn || n);
const nameLen = (c) => (CARD_META[c?.name]?.cn || '').length;
const SUBS = { weapon: 'weapon', armor: 'armor', horsePlus: 'horsePlus', horseMinus: 'horseMinus' };

function grant(p, ids) {
  for (const id of ids) {
    if ((effSkills(p) || []).some(s => s.id === id)) continue;
    const sk = getSkill(id);
    if (sk) p.skills.push(sk);
  }
}

async function disableSlot(ctx, p, slot) {
  const g = ctx.game;
  p.flags.disabledEquip = { ...(p.flags.disabledEquip || {}), [slot]: true };
  const c = p.equips[slot];
  if (c) {
    p.equips[slot] = null;
    await g.trigger('equip.lose', { self: p, card: c, slot });
    if (!g.discardPile.includes(c)) g.discardPile.push(c);
  }
  return c;
}

async function disableAnySlot(ctx, p, prefer = null) {
  const avail = SLOTS.filter(k => !(p.flags.disabledEquip || {})[k]);
  if (!avail.length) return null;
  const slot = (prefer && avail.includes(prefer)) ? prefer : avail[0];
  await disableSlot(ctx, p, slot);
  return slot;
}

function restoreSlot(p) {
  const dis = SLOTS.filter(k => (p.flags.disabledEquip || {})[k]);
  if (!dis.length) return null;
  const slot = dis[0];
  p.flags.disabledEquip = { ...(p.flags.disabledEquip || {}), [slot]: false };
  return slot;
}

// ==================== 威曹操 · 掇月 ====================
defineSkill({
  id: 'duoyue', name: '掇月',
  desc: '出牌阶段开始时，你可进行至多三次拼点，你可令赢的角色摸当前拼点次数张牌。若你赢，你可改为对一名角色造成1点伤害并终止后续拼点。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.self.hand.length > 0 && d.game.alive().some(x => x !== d.self && x.hand.length),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      for (let i = 1; i <= 3; i++) {
        if (!p.hand.length || !p.alive) break;
        const cands = g.alive().filter(x => x !== p && x.hand.length);
        if (!cands.length) break;
        const t = (await ctx.ask.targets(p, { prompt: `【掇月】：第 ${i} 次拼点的角色`, candidates: cands, min: 1, max: 1 }))[0];
        if (!t) break;
        if (t.kingdom === 'wei') p.flags.pindianWeiSeat = t.seat;
        const r = await pindian(g, p, t, { reason: '掇月' });
        p.flags.pindianWeiSeat = null;
        if (r.skip) break;
        if (r.win) {
          const idx = await ctx.ask.choose(p, [`令赢的角色摸 ${i} 张牌`, '改为对一名角色造成1点伤害并终止拼点'], { prompt: '【掇月】：选择一项', reason: 'duoyue' });
          if (idx === 1) {
            const vt = (await ctx.ask.targets(p, { prompt: '【掇月】：选择受到伤害的角色', candidates: g.alive().filter(x => x !== p), min: 1, max: 1 }))[0];
            if (vt) {
              await ctx.log(`【掇月】：终止拼点，对 ${vt.name} 造成 1 点伤害`);
              await ctx.damage({ from: p, to: vt, amount: 1, card: vcard('sha'), reason: 'duoyue' });
            }
            return;
          }
        }
        const winner = r.win ? p : t;
        await ctx.draw(winner, i, { reason: 'duoyue' });
        await ctx.log(`【掇月】：第 ${i} 次拼点，${winner.name} 摸 ${i} 张牌`);
        if (i < 3) {
          const go = await ctx.ask.confirm(p, '【掇月】：是否继续拼点？');
          if (!go) break;
        }
      }
    },
  }],
});

// ==================== 威曹操 · 军合 ====================
defineSkill({
  id: 'junhe', name: '军合',
  desc: '准备阶段，你可展示任意张颜色或类别相同的牌并获得「军合」效果：你下X次（X为你展示的牌数+1）：造成伤害时，可弃置一张与展示牌颜色或类别相同的牌令此伤害+1；受到伤害后摸两张牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare' && d.self.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const groups = new Map();
        for (const c of p.hand) {
          const meta = CARD_META[c.name];
          if (!meta) continue;
          const key = `${meta.type}|${isRed(c) ? 'red' : 'black'}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(c);
        }
        const keys = [...groups.keys()];
        if (!keys.length) return;
        const idx = await ctx.ask.choose(p, keys.map(k => `展示${k.split('|')[1] === 'red' ? '红色' : '黑色'}${({ basic: '基本', trick: '锦囊', equip: '装备' })[k.split('|')[0]] || ''}牌`), { prompt: '【军合】：选择展示的牌', reason: 'junhe' });
        const key = keys[idx >= 0 ? idx : 0];
        const [type, color] = key.split('|');
        const shown = await g.chooseSomeCards(p, groups.get(key), groups.get(key).length, { prompt: '【军合】：展示任意张牌', optional: false });
        const use = shown.length ? shown : groups.get(key).slice(0, 1);
        p.flags.junhe = { left: use.length + 1, type, color };
        await ctx.log(`【军合】：展示 ${use.length} 张${color === 'red' ? '红色' : '黑色'}牌，获得 ${use.length + 1} 枚「军合」`);
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from === d.player && (d.player.flags.junhe?.left || 0) > 0,
      async effect(ctx) {
        const p = ctx.self, d = ctx.data;
        const j = p.flags.junhe;
        if (!j || j.left <= 0) return;
        const pool = allCards(p).filter(c => CARD_META[c.name]?.type === j.type || (isRed(c) ? 'red' : 'black') === j.color);
        if (!pool.length) return;
        const picks = await ctx.game.chooseSomeCards(p, pool, 1, { prompt: '【军合】：弃置一张与展示牌颜色或类别相同的牌令伤害 +1', optional: true });
        if (!picks.length) return;
        const c = picks[0];
        const slot = SLOTS.find(k => p.equips[k] === c);
        if (slot) { p.equips[slot] = null; await ctx.game.trigger('equip.lose', { self: p, card: c, slot }); }
        await ctx.discard(p, [c], { reason: 'junhe' });
        j.left -= 1;
        d.amount = (d.amount || 1) + 1;
        await ctx.log(`【军合】：弃置 ${cardLabel(c)}，此伤害 +1（剩余 ${j.left} 次）`);
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => d.to === d.player && (d.player.flags.junhe?.left || 0) > 0 && (d.amount || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.junhe.left -= 1;
        await ctx.draw(p, 2, { reason: 'junhe' });
        await ctx.log(`【军合】：受到伤害后摸 2 张牌（剩余 ${p.flags.junhe.left} 次）`);
      },
    },
  ],
});

// ==================== 威曹操 · 雄威 ====================
defineSkill({
  id: 'xiongwei', name: '雄威',
  desc: '你和魏势力角色拼点后，你获得其拼点的牌。若如此做，且该角色没有「军合」效果，则你可以将任意次数的「军合」转移给该角色。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: false,
    filter: (d) => {
      const p = d.player;
      if (p.flags.pindianWeiSeat == null) return false;
      if (!/拼点|掇月|制霸/.test(d.reason || '')) return false;
      return d.self === p || d.self.seat === p.flags.pindianWeiSeat;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const seat = p.flags.pindianWeiSeat;
      const t = g.players.find(x => x.seat === seat);
      const cards = (ctx.data.cards || []).filter(c => !p.hand.includes(c));
      // 牌此时尚未进入弃牌堆，用 taken 声明接管，否则会与弃牌堆双存
      ctx.data.taken = ctx.data.taken || [];
      for (const c of cards) if (!ctx.data.taken.includes(c)) ctx.data.taken.push(c);
      if (cards.length) await ctx.gain(p, cards, { reason: 'xiongwei' });
      await ctx.log(`【雄威】：${p.name} 获得与魏势力角色拼点的 ${cards.length} 张牌`);
      if (t && !t.flags.junhe && (p.flags.junhe?.left || 0) > 0) {
        const yes = await ctx.ask.confirm(p, `【雄威】：是否将「军合」转移给 ${t.name}？`);
        if (yes) {
          const n = p.flags.junhe.left;
          t.flags.junhe = { ...p.flags.junhe };
          p.flags.junhe = null;
          await ctx.log(`【雄威】：将 ${n} 枚「军合」转移给 ${t.name}`);
        }
      }
    },
  }],
});

// ==================== 威刘备 · 烈骧 ====================
defineSkill({
  id: 'liexiang', name: '烈骧',
  desc: '出牌阶段限一次，你可以摸至多5张牌并对一名其他角色造成1点伤害，若你的手牌数：1.大于该角色，本阶段你出【杀】次数+1且可交给一名其他角色至多X张牌；2.等于该角色，你获得其1张牌且其下回合使用的前X张牌无效；3.小于该角色，你失去X点体力，本阶段此技能修改为「出牌阶段限两次」且可额外选择X名其他角色。',
  active: {
    perTurn: true,
    prompt: '摸至多5张牌并对一名其他角色造成1点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const idx = await ctx.ask.choose(p, ['摸1张', '摸2张', '摸3张', '摸4张', '摸5张'], { prompt: '【烈骧】：选择摸牌数（至多5）', reason: 'liexiang' });
      const x = (idx >= 0 ? idx : 4) + 1;
      await ctx.draw(p, x, { reason: 'liexiang' });
      const cands = g.alive().filter(q => q !== p);
      if (!cands.length) return;
      const extra = Math.min(1 + (p.flags.liexiangExtra || 0), cands.length);
      const picked = await ctx.ask.targets(p, { prompt: '【烈骧】：选择造成1点伤害的角色', candidates: cands, min: 1, max: extra });
      p.flags.liexiangExtra = 0;
      if (!picked.length) return;
      const t = picked[0];
      await ctx.damage({ from: p, to: t, amount: 1, card: vcard('sha'), reason: 'liexiang' });
      if (p.hand.length > t.hand.length) {
        p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + 1;   // 本阶段（SG028）
        await ctx.log(`【烈骧】①：手牌多于 ${t.name}，本阶段出【杀】次数 +1`);
        const others = g.alive().filter(q => q !== p);
        const to = (await ctx.ask.targets(p, { prompt: '【烈骧】：可交给一名角色至多 X 张牌（可取消）', candidates: others, min: 0, max: 1 }))[0];
        if (to) {
          const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(x, p.hand.length), { prompt: '【烈骧】：选择交出的牌', optional: true });
          if (picks.length) { await ctx.gain(to, picks, { from: p, reason: 'liexiang' }); await ctx.log(`【烈骧】：交给 ${to.name} ${picks.length} 张牌`); }
        }
      } else if (p.hand.length === t.hand.length) {
        const pool = allCards(t);
        if (pool.length) {
          const c = g.rng.pick(pool);
          const slot = SLOTS.find(k => t.equips[k] === c);
          if (slot) { t.equips[slot] = null; await g.trigger('equip.lose', { self: t, card: c, slot }); }
          await ctx.gain(p, [c], { from: t, reason: 'liexiang' });
        }
        t.flags.liexiangBanCount = x;
        t.flags.liexiangBanTurn = g.turnCount + 1;
        await ctx.log(`【烈骧】②：手牌等于 ${t.name}，获得其一张牌，其下回合使用的前 ${x} 张牌无效`);
      } else {
        await ctx.loseHp(p, x);
        p.flags.liexiangExtra = x;
        p.flags.act_liexiang = -1;
        await ctx.log(`【烈骧】③：手牌少于 ${t.name}，失去 ${x} 点体力，此技能本阶段可再发动一次并可额外选择 ${x} 名角色`);
      }
    },
  },
  triggers: [{
    on: 'card.use.before', who: 'any', optional: false,
    filter: (d) => (d.self.flags.liexiangBanCount || 0) > 0 && d.self.flags.liexiangBanTurn === d.game.turnCount,
    async effect(ctx) {
      const p = ctx.data.self;
      p.flags.liexiangBanCount -= 1;
      ctx.data.canceled = true;
      await ctx.log(`【烈骧】：${p.name} 本回合使用的前 X 张牌无效（剩余 ${p.flags.liexiangBanCount} 张）`);
    },
  }],
});

// ==================== 威刘备 · 仁彀 ====================
defineSkill({
  id: 'renkou', name: '仁彀',
  desc: '其他蜀势力角色出牌阶段限一次，其可弃置1张牌并令你回复1点体力，然后你可令其发动一次至多摸2张牌的「烈骧」。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => d.phase === 'play' && d.self !== d.player && d.self.kingdom === 'shu' && d.self.hand.length > 0
      && d.player.flags[`renkou_${d.self.seat}_${d.game.turnCount}`] !== true,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, q = ctx.data.self;
      const yes = await ctx.ask.confirm(q, `【仁彀】：是否弃置一张牌令 ${p.name} 回复1点体力？`);
      if (!yes) return;
      p.flags[`renkou_${q.seat}_${g.turnCount}`] = true;
      const picks = await g.chooseSomeCards(q, q.hand.slice(), 1, { prompt: '【仁彀】：弃置一张牌', optional: false });
      if (picks.length) await ctx.discard(q, picks, { reason: 'renkou' });
      await ctx.recover(p, 1, { reason: 'renkou' });
      await ctx.log(`【仁彀】：${q.name} 弃置一张牌，${p.name} 回复 1 点体力`);
      const n = Math.min(2, g.deck.length);
      await ctx.draw(q, n, { reason: 'renkou' });
      const target = g.rng.pick(g.alive().filter(x => x !== q));
      await ctx.log(`【仁彀】：${q.name} 发动一次至多摸 2 张牌的「烈骧」`);
      if (target) await ctx.damage({ from: q, to: target, amount: 1, card: vcard('sha'), reason: 'renkou' });
    },
  }],
});

// ==================== 威孙尚香 · 淑任 ====================
defineSkill({
  id: 'shuren', name: '淑任',
  desc: '出牌阶段限一次，你可废除一个装备栏，亮出牌堆顶三张牌，你选择其中一张牌获得并可选择一名其他角色获得其中一张牌，若此装备栏有牌则此技能视为未发动过并恢复1点体力。',
  active: {
    perTurn: true,
    prompt: '废除一个装备栏，亮出牌堆顶三张牌并分配',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const avail = SLOTS.filter(k => !(p.flags.disabledEquip || {})[k]);
      if (!avail.length) { await ctx.log('【淑任】：装备栏已全部废除'); return; }
      const idx = await ctx.ask.choose(p, avail.map(k => SLOT_CN[k]), { prompt: '【淑任】：选择要废除的装备栏', reason: 'shuren' });
      const slot = avail[idx >= 0 ? idx : 0];
      const had = p.equips[slot];
      await disableSlot(ctx, p, slot);
      const shown = g.popDeck(3);
      const mine = shown[0] || null;
      if (mine) await ctx.gain(p, [mine], { reason: 'shuren' });
      const rest = shown.slice(1);
      const others = g.alive().filter(q => q !== p);
      if (rest.length && others.length) {
        const t = (await ctx.ask.targets(p, { prompt: '【淑任】：选择一名其他角色获得其中一张牌（可取消）', candidates: others, min: 0, max: 1 }))[0];
        if (t) await ctx.gain(t, [rest[0]], { reason: 'shuren' });
      }
      const left = shown.filter(c => !p.hand.includes(c) && !g.alive().some(q => q.hand.includes(c)));
      if (left.length) g.discardPile.push(...left);
      await ctx.log(`【淑任】：废除${SLOT_CN[slot]}，亮出 ${shown.length} 张牌并分配`);
      if (had) {
        p.flags.act_shuren = -1;
        await ctx.recover(p, 1, { reason: 'shuren' });
        await ctx.log('【淑任】：该栏位原有装备，此技能视为未发动过并回复 1 点体力');
      }
    },
  },
});

// ==================== 威孙尚香 · 飒然 ====================
defineSkill({
  id: 'saran', name: '飒然',
  desc: '你的装备区每有一张牌，你出牌阶段可使用【杀】次数+1。你受到或造成一点伤害后，从牌堆或弃牌堆中随机使用一张装备牌，若有废除的装备栏可先选择一个装备栏恢复。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        // ★独立字段 shaExtraEquip：shaExtra 是累加型（【漠规②】永久 +1 等），用 `=` 会覆盖（SG029 BLOCKER-3）
        p.flags.shaExtraEquip = Object.values(p.equips).filter(Boolean).length;
        await ctx.log(`【飒然】：装备区 ${p.flags.shaExtraEquip} 张牌，出牌阶段可使用【杀】次数 +${p.flags.shaExtraEquip}`);
      },
    },
    {
      // 装备区随时增减（含【飒然】自身「受到伤害后随机使用装备」）：变动即重算，
      // 否则本回合次数上限要等下一回合才更新（SG028 刷新时机修正）
      on: 'equip.change', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.shaExtraEquip = Object.values(p.equips).filter(Boolean).length;
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => (d.to === d.player || d.from === d.player) && (d.amount || 0) > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const pool = [...g.deck, ...g.discardPile].filter(c => CARD_META[c.name]?.type === 'equip');
        if (!pool.length) return;
        const c = g.rng.pick(pool);
        const di = g.deck.indexOf(c);
        if (di >= 0) g.deck.splice(di, 1);
        const pi = g.discardPile.indexOf(c);
        if (pi >= 0) g.discardPile.splice(pi, 1);
        // ★SG036 P1：原实现「随便找一个空槽」，会把坐骑塞进武器栏（牌型与槽位不符）。
        //   改为走 forceEquip：按 CARD_META.sub 定槽位，旧装备派 lose + 进弃牌堆 + 派 change。
        const restored = restoreSlot(p);
        const slot = restored || SLOTS.find(k => !p.equips[k] && !(p.flags.disabledEquip || {})[k]);
        if (!slot) { if (!g.discardPile.includes(c)) g.discardPile.push(c); return; }
        if (restored) {
          p.equips[slot] = c;
          await g.trigger('equip.change', { self: p, card: c, slot });
        } else {
          await g.forceEquip(p, c, { reason: 'saran' });
        }
        await ctx.log(`【飒然】：从${di >= 0 ? '牌堆' : '弃牌堆'}使用 ${cardLabel(c)}${restored ? `（恢复${SLOT_CN[restored]}）` : ''}`);
      },
    },
  ],
});

// ==================== 威张星彩 · 煌怒 ====================
defineSkill({
  id: 'huangnu', name: '煌怒',
  desc: '出牌阶段或受到伤害后，你可选择一项执行：1.选择一名角色令其随机弃置一张你指定类型的牌；2.你视为使用一张【杀】；3.令一名角色本回合下次使用的牌无效。执行后恢复X个装备栏，若恢复数不足对应数量则此技能失效至本回合结束。（X为此技能本回合发动的次数）',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.player.flags.huangnuDisabledTurn !== d.game.turnCount,
      async effect(ctx) { await huangnuRun(ctx); },
    },
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => d.to === d.player && d.player.flags.huangnuDisabledTurn !== d.game.turnCount,
      async effect(ctx) { await huangnuRun(ctx); },
    },
  ],
});

async function huangnuRun(ctx) {
  const p = ctx.self, g = ctx.game;
  const idx = await ctx.ask.choose(p, ['指定类型弃置一名角色一张牌', '视为使用一张【杀】', '令一名角色本回合下次使用的牌无效'], { prompt: '【煌怒】：选择一项', reason: 'huangnu' });
  p.flags.huangnuCount = (p.flags.huangnuCount || 0) + 1;
  const x = p.flags.huangnuCount;
  if (idx === 1) {
    const cands = g.alive().filter(q => q !== p);
    const t = (await ctx.ask.targets(p, { prompt: '【煌怒】：【杀】的目标', candidates: cands, min: 1, max: 1 }))[0];
    if (t) {
      await ctx.log(`【煌怒】：视为对 ${t.name} 使用一张【杀】`);
      await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'huangnu', ignoreRange: true, ignoreShaLimit: true });
    }
  } else if (idx === 2) {
    const t = (await ctx.ask.targets(p, { prompt: '【煌怒】：选择一名角色', candidates: g.alive(), min: 1, max: 1 }))[0];
    if (t) {
      t.flags.huagnuVoid = true;
      t.flags.huangnuVoidTurn = g.turnCount;
      await ctx.log(`【煌怒】：${t.name} 本回合下次使用的牌无效`);
    }
  } else {
    const types = ['basic', 'trick', 'equip'];
    const cn = { basic: '基本牌', trick: '锦囊牌', equip: '装备牌' };
    const ti = await ctx.ask.choose(p, types.map(t => cn[t]), { prompt: '【煌怒】：指定一种牌的类别', reason: 'huangnu' });
    const type = types[ti >= 0 ? ti : 0];
    const cands = g.alive();
    const t = (await ctx.ask.targets(p, { prompt: `【煌怒】：令一名角色随机弃置一张${cn[type]}`, candidates: cands, min: 1, max: 1 }))[0];
    if (t) {
      const pool = allCards(t).filter(c => CARD_META[c.name]?.type === type);
      if (pool.length) {
        const c = g.rng.pick(pool);
        const slot = SLOTS.find(k => t.equips[k] === c);
        if (slot) { t.equips[slot] = null; await g.trigger('equip.lose', { self: t, card: c, slot }); }
        await ctx.discard(t, [c], { reason: 'huangnu' });
        await ctx.log(`【煌怒】：${t.name} 随机弃置${cn[type]} ${cardLabel(c)}`);
      } else await ctx.log(`【煌怒】：${t.name} 没有${cn[type]}`);
    }
  }
  let restored = 0;
  for (let i = 0; i < x; i++) if (restoreSlot(p)) restored += 1;
  if (restored < x) {
    p.flags.huangnuDisabledTurn = g.turnCount;
    await ctx.log(`【煌怒】：恢复 ${restored} 个装备栏，不足 ${x} 个，此技能本回合失效`);
  } else if (restored) {
    await ctx.log(`【煌怒】：恢复 ${restored} 个装备栏`);
  }
}

// ==================== 威张星彩 · 贤贶 ====================
defineSkill({
  id: 'xiankuang', name: '贤贶',
  desc: '有角色非因使用失去基本牌进入弃牌堆时，你可废除一个装备栏并选择一项发动：1.获得此牌；2.令此角色摸你废除的装备栏数张牌。（单回合因此技能获得牌累计大于1张时此技能失效至回合结束）',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player;
      if (d.reason === 'use' || d.reason === 'play') return false;
      if (p.flags.xiankuangOff === d.game.turnCount) return false;
      if (!(d.cards || []).some(c => CARD_META[c.name]?.type === 'basic')) return false;
      return SLOTS.some(k => !(p.flags.disabledEquip || {})[k]);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, q = ctx.data.self;
      const card = (ctx.data.cards || []).find(c => CARD_META[c.name]?.type === 'basic');
      if (!card) return;
      const idx = await ctx.ask.choose(p, ['获得此牌', `令其摸 ${SLOTS.filter(k => (p.flags.disabledEquip || {})[k]).length} 张牌`], { prompt: '【贤贶】：选择一项', reason: 'xiankuang' });
      await disableAnySlot(ctx, p);
      if (idx === 1) {
        const n = SLOTS.filter(k => (p.flags.disabledEquip || {})[k]).length;
        await ctx.draw(q, n, { reason: 'xiankuang' });
        await ctx.log(`【贤贶】：${q.name} 摸 ${n} 张牌`);
      } else {
        const di = g.discardPile.indexOf(card);
        if (di >= 0) g.discardPile.splice(di, 1);
        await ctx.gain(p, [card], { reason: 'xiankuang' });
        p.flags.xiankuangGot = (p.flags.xiankuangGot || 0) + 1;
        await ctx.log(`【贤贶】：获得 ${cardLabel(card)}`);
        if (p.flags.xiankuangGot > 1) {
          p.flags.xiankuangOff = g.turnCount;
          await ctx.log('【贤贶】：单回合获得牌累计大于 1 张，此技能失效至回合结束');
        }
      }
    },
  }],
});

// ==================== 威关银屏 · 绍威 ====================
defineSkill({
  id: 'shaowei', name: '绍威',
  desc: '每回合各限一次，你失去♦️牌后，你可摸2张牌（或从牌堆随机获得3张红色牌）；你失去♥️牌后，你可回复1点体力并恢复1个装备栏。',
  triggers: [{
    on: 'cards.discard', who: 'self', optional: false,
    filter: (d) => d.self === d.player && (d.cards || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cards = ctx.data.cards || [];
      const hasDiamond = cards.some(c => c.suit === 'diamond');
      const hasHeart = cards.some(c => c.suit === 'heart');
      if (hasDiamond && p.flags.shaoweiDia !== g.turnCount) {
        p.flags.shaoweiDia = g.turnCount;
        const pool = g.deck.filter(c => c.suit === 'heart' || c.suit === 'diamond').slice(-3);
        for (const c of pool) { const i = g.deck.indexOf(c); if (i >= 0) g.deck.splice(i, 1); }
        if (pool.length) await ctx.gain(p, pool, { reason: 'shaowei' });
        else await ctx.draw(p, 2, { reason: 'shaowei' });
        await ctx.log(`【绍威】：失去♦️牌，从牌堆随机获得 ${pool.length || 2} 张红色牌`);
      }
      if (hasHeart && p.flags.shaoweiHeart !== g.turnCount) {
        p.flags.shaoweiHeart = g.turnCount;
        await ctx.recover(p, 1, { reason: 'shaowei' });
        const slot = restoreSlot(p);
        await ctx.log(`【绍威】：失去♥️牌，回复 1 点体力${slot ? `并恢复${SLOT_CN[slot]}` : ''}`);
      }
    },
  }],
});

// ==================== 威关银屏 · 涤仇（锁定技）====================
defineSkill({
  id: 'dichou', name: '涤仇',
  desc: '锁定技，其他角色对你使用牌时你令其获得1个「仇」标记。你的回合开始时，废除1个装备栏并弃置一名角色1张牌，本回合你攻击范围与出【杀】次数增加此牌名字数。你对一名有「仇」的角色使用牌时摸1张牌并移去其1个「仇」。你的回合结束时，你对任意名有「仇」的角色各造成1点火焰伤害并移去所有「仇」。',
  triggers: [
    {
      on: 'target.before', who: 'any', optional: false,
      filter: (d) => d.target === d.player && d.self !== d.player,
      async effect(ctx) {
        const q = ctx.data.self;
        q.marks = q.marks || {};
        q.marks.chou = (q.marks.chou || 0) + 1;
        await ctx.log(`【涤仇】：${q.name} 获得 1 个「仇」（共 ${q.marks.chou}）`);
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const slot = await disableAnySlot(ctx, p);
        const cands = g.alive().filter(q => q !== p && allCards(q).length);
        const t = cands.length ? g.rng.pick(cands) : null;
        let len = 0;
        if (t) {
          const c = g.rng.pick(allCards(t));
          len = nameLen(c);
          const s2 = SLOTS.find(k => t.equips[k] === c);
          if (s2) { t.equips[s2] = null; await g.trigger('equip.lose', { self: t, card: c, slot: s2 }); }
          await ctx.discard(t, [c], { reason: 'dichou' });
        }
        p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + len;   // 本回合（SG028）
        p.flags.rangeBonus = (p.flags.rangeBonus || 0) + len;
        await ctx.log(`【涤仇】：废除${slot ? SLOT_CN[slot] : '（无可用）'}，弃置 ${t?.name || '（无）'} 一张牌，本回合攻击范围与出【杀】次数 +${len}`);
      },
    },
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => {
        if (d.self !== d.player) return false;
        const t = (d.targets || [])[0];
        return !!t && (t.marks?.chou || 0) > 0;
      },
      async effect(ctx) {
        const p = ctx.self, t = (ctx.data.targets || [])[0];
        t.marks.chou -= 1;
        await ctx.draw(p, 1, { reason: 'dichou' });
        await ctx.log(`【涤仇】：对 ${t.name} 使用牌，摸 1 张牌并移去 1 个「仇」（剩余 ${t.marks.chou}）`);
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.game.alive().some(q => (q.marks?.chou || 0) > 0),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const targets = g.alive().filter(q => (q.marks?.chou || 0) > 0);
        for (const q of targets) q.marks.chou = 0;
        await ctx.log(`【涤仇】：对 ${targets.map(q => q.name).join('、')} 各造成 1 点火焰伤害`);
        for (const q of targets) {
          if (q.alive) await ctx.damage({ from: p, to: q, amount: 1, nature: 'fire', card: vcard('sha'), reason: 'dichou' });
        }
      },
    },
  ],
});

// ==================== 威公孙瓒 · 举袭 ====================
const DMG_NAMES = ['sha', 'juedou', 'nanman', 'wanjian', 'huogong'];
defineSkill({
  id: 'juxi', name: '举袭',
  desc: '出牌阶段限一次，若你手牌中无可使用的伤害牌，你可视为使用一张本回合未以此法使用过的伤害牌，若本阶段此牌名进入弃牌堆，此技能可再次发动。',
  active: {
    perTurn: true,
    prompt: '视为使用一张本回合未以此法使用过的伤害牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const hasDmg = p.hand.some(c => DMG_NAMES.includes(c.name));
      if (hasDmg) { await ctx.log('【举袭】：手牌中有可使用的伤害牌，不能发动'); return; }
      const used = p.flags.juxiUsed || [];
      const avail = DMG_NAMES.filter(n => !used.includes(n));
      if (!avail.length) { await ctx.log('【举袭】：本回合的伤害牌名均已使用过'); return; }
      const idx = await ctx.ask.choose(p, avail.map(n => `视为使用【${CN(n)}】`), { prompt: '【举袭】：选择一种伤害牌', reason: 'juxi' });
      const name = avail[idx >= 0 ? idx : 0];
      p.flags.juxiUsed = [...used, name];
      const meta = CARD_META[name];
      let targets = [];
      if (meta?.target?.min >= 1) {
        const cands = g.alive().filter(q => q !== p);
        targets = await ctx.ask.targets(p, { prompt: `【举袭】：选择【${CN(name)}】的目标`, candidates: cands, min: meta.target.min || 1, max: meta.target.max || 1 });
      }
      await ctx.log(`【举袭】：视为使用【${CN(name)}】`);
      await ctx.useCard({ from: p, card: vcard(name), targets, reason: 'juxi', ignoreRange: true, ignoreShaLimit: true });
    },
  },
  triggers: [{
    on: 'cards.discard', who: 'any', optional: false,
    filter: (d) => (d.player.flags.juxiUsed || []).length > 0 && (d.cards || []).some(c => (d.player.flags.juxiUsed || []).includes(c.name)),
    async effect(ctx) {
      const p = ctx.self;
      p.flags.act_juxi = -1;
      await ctx.log('【举袭】：此牌名进入弃牌堆，此技能可再次发动');
    },
  }],
});

// ==================== 威公孙瓒 · 追讨 ====================
defineSkill({
  id: 'zhuitao', name: '追讨',
  desc: '连招技（黑色牌+伤害牌），你可选择一名本回合未以此法选择过的其他角色并摸2张牌，本回合你与其计算距离为1，你对其使用伤害牌或黑色牌结算后，每满足一项可弃置其一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => {
      if (d.self !== d.player) return false;
      const c = d.card || {};
      const isDmg = DMG_NAMES.includes(d.effName || c.name);
      const isBlack = !isRed(c);
      return isDmg || isBlack;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const d = ctx.data;
      const c = d.card || {};
      const isDmg = DMG_NAMES.includes(d.effName || c.name);
      const isBlack = !isRed(c);
      const chosen = p.flags.zhuitaoSeat;
      if (chosen == null) {
        const cands = g.alive().filter(q => q !== p);
        const t = (await ctx.ask.targets(p, { prompt: '【追讨】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
        if (!t) return;
        p.flags.zhuitaoSeat = t.seat;
        p.flags.zhuitaoTurn = g.turnCount;
        await ctx.draw(p, 2, { reason: 'zhuitao' });
        await ctx.log(`【追讨】：选择 ${t.name}，摸 2 张牌，本回合与其距离视为 1`);
        return;
      }
      if (p.flags.zhuitaoTurn !== g.turnCount) return;
      const t = g.players.find(q => q.seat === p.flags.zhuitaoSeat);
      if (!t || !t.alive) return;
      const n = (isDmg ? 1 : 0) + (isBlack ? 1 : 0);
      const pool = allCards(t);
      const take = Math.min(n, pool.length);
      for (let i = 0; i < take; i++) {
        const c2 = g.rng.pick(allCards(t));
        if (!c2) break;
        const slot = SLOTS.find(k => t.equips[k] === c2);
        if (slot) { t.equips[slot] = null; await g.trigger('equip.lose', { self: t, card: c2, slot }); }
        await ctx.discard(t, [c2], { reason: 'zhuitao' });
      }
      if (take) await ctx.log(`【追讨】：满足 ${n} 项，弃置 ${t.name} ${take} 张牌`);
    },
  }],
});

// ==================== 武诸葛亮 · 尽瘁（锁定技）====================
defineSkill({
  id: 'jincui', name: '尽瘁',
  desc: '锁定技，游戏开始时，你将手牌摸至7张。准备阶段，你的体力值调整为与牌堆中点数为7的游戏牌数量相等（至少为1）。然后你观看牌堆顶X张牌，将这些牌以任意顺序放回牌堆顶或牌堆底（X为你的体力值）。',
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        if (p.hand.length < 7) await ctx.draw(p, 7 - p.hand.length, { reason: 'jincui' });
        await ctx.log(`【尽瘁】：将手牌摸至 7 张（${p.hand.length}）`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'prepare',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const n7 = [...g.deck, ...g.discardPile].filter(c => c.num === 7).length;
        const want = Math.max(1, Math.min(p.maxHp, n7));
        if (p.hp !== want) {
          await ctx.log(`【尽瘁】：牌堆中点数 7 的牌有 ${n7} 张，体力值调整为 ${want}`);
          if (want > p.hp) await ctx.recover(p, want - p.hp, { reason: 'jincui' });
          else if (want < p.hp) p.hp = want;
        }
        const x = Math.max(0, Math.min(p.hp, g.deck.length));
        if (x > 0) {
          const top = g.deck.splice(g.deck.length - x, x);
          const half = Math.floor(top.length / 2);
          g.deck.push(...top.slice(0, half));
          g.deck.unshift(...top.slice(half));
          await ctx.log(`【尽瘁】：观看牌堆顶 ${x} 张牌，${half} 张放回牌堆顶，${top.length - half} 张置于牌堆底`);
        }
      },
    },
  ],
});

// ==================== 武诸葛亮 · 情势 ====================
defineSkill({
  id: 'qingshi2', name: '情势',
  desc: '你于出牌阶段内使用一张牌时（每种牌名每回合限一次），若手牌中有同名牌，你可以选择一项：1.令此牌对其中一个目标造成的伤害值+1；2.令任意名其他角色各摸一张牌；3.摸3张牌，然后此技能本回合失效。',
  triggers: [{
    on: 'card.use.before', who: 'self', optional: true,
    filter: (d) => {
      if (d.self !== d.player) return false;
      const g = d.game;
      if (g.phase !== 'play') return false;
      const name = d.effName || d.card?.name;
      const used = d.player.flags.qingshiUsed || {};
      if (used[`${g.turnCount}:${name}`]) return false;
      return d.player.hand.some(c => c.name === name && c !== d.card);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const name = ctx.data.effName || ctx.data.card?.name;
      const idx = await ctx.ask.choose(p, ['此牌对其中一个目标伤害 +1', '令任意名其他角色各摸一张牌', '摸3张牌，然后此技能本回合失效'], { prompt: '【情势】：选择一项', reason: 'qingshi2' });
      p.flags.qingshiUsed = p.flags.qingshiUsed || {};
      p.flags.qingshiUsed[`${g.turnCount}:${name}`] = true;
      if (idx === 0) {
        ctx.data.qingshiBonus = 1;
        p.flags.qingshiDmgBonus = (p.flags.qingshiDmgBonus || 0) + 1;
        await ctx.log('【情势】：此牌对其一个目标造成的伤害 +1');
      } else if (idx === 1) {
        const cands = g.alive().filter(q => q !== p);
        const picked = cands.length ? await ctx.ask.targets(p, { prompt: '【情势】：令任意名其他角色各摸一张牌', candidates: cands, min: 0, max: cands.length }) : [];
        for (const q of picked) await ctx.draw(q, 1, { reason: 'qingshi2' });
        await ctx.log(`【情势】：${picked.map(q => q.name).join('、') || '（无）'} 各摸一张牌`);
      } else {
        await ctx.draw(p, 3, { reason: 'qingshi2' });
        p.flags.qingshiOff = g.turnCount;
        await ctx.log('【情势】：摸 3 张牌，此技能本回合失效');
      }
    },
  }, {
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => d.from === d.player && (d.player.flags.qingshiDmgBonus || 0) > 0,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.qingshiDmgBonus -= 1;
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      await ctx.log('【情势】：此牌造成的伤害 +1');
    },
  }],
});

// ==================== 武诸葛亮 · 智哲（限定技）====================
defineSkill({
  id: 'zhizhe', name: '智哲',
  desc: '限定技，出牌阶段，你可以「复制」一张手牌。此牌因你使用或打出进入弃牌堆时，改为将此牌收回手牌且本回合不能再使用或打出。',
  active: {
    prompt: '复制一张手牌（限定技）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.zhizheUsed) { await ctx.log('【智哲】：限定技，本局已发动过'); return; }
      if (!p.hand.length) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【智哲】：选择一张手牌复制', optional: false });
      const src = picks[0] || p.hand[0];
      const copy = { ...src, id: `vzz${++vseq}`, virtual: true, __zhizhe: true };
      p.hand.push(copy);
      p.flags.zhizheUsed = true;
      await ctx.log(`【智哲】：复制 ${cardLabel(src)}（本局限一次）`);
    },
  },
  triggers: [{
    on: 'cards.discard', who: 'self', optional: false,
    filter: (d) => (d.cards || []).some(c => c.__zhizhe),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = (ctx.data.cards || []).find(x => x.__zhizhe);
      const di = g.discardPile.indexOf(c);
      if (di >= 0) g.discardPile.splice(di, 1);
      if (!p.hand.includes(c)) p.hand.push(c);
      await ctx.log(`【智哲】：将复制的 ${cardLabel(c)} 收回手牌（本回合不能再使用或打出）`);
    },
  }],
});

// ==================== 武关羽 · 绝武 ====================
defineSkill({
  id: 'juewu', name: '绝武',
  desc: '你点数为2的牌可当任意伤害牌使用（每种牌名每回合限一次）。你从其他角色处获得的牌在你的手牌中时均视为点数2。',
  triggers: [
    {
      on: 'cards.gain', who: 'self', optional: false,
      filter: (d) => !!d.from && d.from !== d.player && (d.cards || []).length > 0,
      async effect(ctx) {
        const p = ctx.self;
        let n = 0;
        for (const c of ctx.data.cards || []) {
          if (p.hand.includes(c) && c.num !== 2) { c.num = 2; n += 1; }
        }
        if (n) await ctx.log(`【绝武】：从其他角色处获得的 ${n} 张牌点数视为 2`);
      },
    },
    {
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.self === d.player && DMG_NAMES.includes(d.effName || d.card?.name) && (d.card?.num === 2),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const name = ctx.data.effName || ctx.data.card?.name;
        p.flags.juewuUsed = p.flags.juewuUsed || {};
        p.flags.juewuUsed[`${g.turnCount}:${name}`] = true;
        await ctx.log(`【绝武】：点数为 2 的牌当【${CN(name)}】使用`);
      },
    },
  ],
});

// ==================== 武关羽 · 武佑 ====================
const WUYOU_NAMES = ['sha', 'shan', 'tao', 'jiu', 'juedou', 'guohe', 'shunshou', 'wuzhong', 'nanman', 'wanjian', 'huogong', 'tiesuo', 'wuxie', 'jiedao', 'taoyuan', 'wugu'];
defineSkill({
  id: 'wuyou', name: '武佑',
  desc: '每名角色的出牌阶段限一次，其可以交给你一张手牌，然后你可以从五个随机非装备牌名中选择一个并交给其一张手牌。此牌视为你选择牌名的牌且无距离和次数限制。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => d.phase === 'play' && d.self !== d.player && d.self.hand.length > 0
      && d.player.hand.length > 0 && d.player.flags[`wuyou_${d.self.seat}_${d.game.turnCount}`] !== true,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, q = ctx.data.self;
      const yes = await ctx.ask.confirm(q, `【武佑】：是否交给 ${p.name} 一张手牌？`);
      if (!yes) return;
      p.flags[`wuyou_${q.seat}_${g.turnCount}`] = true;
      const give = await g.chooseSomeCards(q, q.hand.slice(), 1, { prompt: '【武佑】：交给其一张手牌', optional: false });
      if (give.length) await ctx.gain(p, give, { from: q, reason: 'wuyou' });
      const opts = [];
      const pool = WUYOU_NAMES.slice();
      while (opts.length < Math.min(5, pool.length)) {
        const n = pool.splice(g.rng.int(pool.length), 1)[0];
        opts.push(n);
      }
      const idx = await ctx.ask.choose(p, opts.map(n => `选择【${CN(n)}】`), { prompt: '【武佑】：选择一种非装备牌名', reason: 'wuyou' });
      const name = opts[idx >= 0 ? idx : 0];
      const back = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: `【武佑】：交给其一张手牌（视为【${CN(name)}】）`, optional: false });
      const c = back[0];
      if (!c) return;
      c.__wuyouAs = name;
      await ctx.gain(q, [c], { from: p, reason: 'wuyou' });
      await ctx.log(`【武佑】：${p.name} 交给 ${q.name} ${cardLabel(c)}，此牌视为【${CN(name)}】`);
    },
  }],
});

// ==================== 武关羽 · 义贤（限定技）====================
defineSkill({
  id: 'yixian', name: '义贤',
  desc: '限定技，出牌阶段，你可以选择一项：1.获得场上所有装备牌；2.获得弃牌堆中所有装备牌。然后你可令被你获得牌的角色摸X张牌（X为该角色因此被你获得的牌数）并回复1点体力。',
  active: {
    prompt: '获得场上/弃牌堆所有装备牌（限定技）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.yixianUsed) { await ctx.log('【义贤】：限定技，本局已发动过'); return; }
      const idx = await ctx.ask.choose(p, ['获得场上所有装备牌', '获得弃牌堆中所有装备牌'], { prompt: '【义贤】：选择一项', reason: 'yixian' });
      p.flags.yixianUsed = true;
      const donors = [];
      if (idx === 0) {
        for (const q of g.alive()) {
          const got = [];
          for (const k of SLOTS) {
            if (!q.equips[k]) continue;
            const c = q.equips[k];
            q.equips[k] = null;
            await g.trigger('equip.lose', { self: q, card: c, slot: k });
            got.push(c);
          }
          if (got.length) {
            await ctx.gain(p, got, { from: q, reason: 'yixian' });
            donors.push({ q, n: got.length });
          }
        }
      } else {
        const got = g.discardPile.filter(c => CARD_META[c.name]?.type === 'equip');
        for (const c of got) {
          const i = g.discardPile.indexOf(c);
          if (i >= 0) g.discardPile.splice(i, 1);
        }
        if (got.length) await ctx.gain(p, got, { reason: 'yixian' });
        await ctx.log(`【义贤】：获得弃牌堆中 ${got.length} 张装备牌`);
      }
      for (const { q, n } of donors) {
        if (!q.alive) continue;
        await ctx.draw(q, n, { reason: 'yixian' });
        await ctx.recover(q, 1, { reason: 'yixian' });
        await ctx.log(`【义贤】：${q.name} 摸 ${n} 张牌并回复 1 点体力`);
      }
    },
  },
});

// ==================== 武张飞 · 恣胜 ====================
defineSkill({
  id: 'zisheng', name: '恣胜',
  desc: '你使用点数大于3且为3的倍数的牌时（同时使用多张牌时点数相加），可从牌堆中随机三张点数为3的牌，选择其中一张获得；你弃置或获得其他角色牌时，可对该角色造成与弃置或获得牌数相等的伤害（不超过该角色当前体力值）。',
  triggers: [
    {
      on: 'card.use.before', who: 'self', optional: true,
      filter: (d) => {
        if (d.self !== d.player) return false;
        const num = d.card?.num || 0;
        return num > 3 && num % 3 === 0 && d.game.deck.some(c => c.num === 3);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const pool = g.deck.filter(c => c.num === 3);
        const pick3 = [];
        while (pick3.length < Math.min(3, pool.length)) {
          const c = pool.splice(g.rng.int(pool.length), 1)[0];
          pick3.push(c);
        }
        const idx = await ctx.ask.choose(p, pick3.map(c => cardLabel(c)), { prompt: '【恣胜】：选择获得一张点数为3的牌', reason: 'zisheng' });
        const c = pick3[idx >= 0 ? idx : 0];
        const di = g.deck.indexOf(c);
        if (di >= 0) g.deck.splice(di, 1);
        if (c) {
          await ctx.gain(p, [c], { reason: 'zisheng' });
          await ctx.log(`【恣胜】：从牌堆随机三张点数 3 的牌中获得 ${cardLabel(c)}`);
        }
      },
    },
    {
      on: 'cards.gain', who: 'self', optional: true,
      filter: (d) => !!d.from && d.from !== d.player && d.from.alive !== false && (d.cards || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.from;
        const n = Math.min((ctx.data.cards || []).length, Math.max(0, t.hp));
        if (n <= 0) return;
        await ctx.log(`【恣胜】：获得 ${t.name} ${n} 张牌，对其造成 ${n} 点伤害`);
        await ctx.damage({ from: p, to: t, amount: n, card: vcard('sha'), reason: 'zisheng' });
      },
    },
  ],
});

// ==================== 武张飞 · 显略 ====================
defineSkill({
  id: 'xianlve', name: '显略',
  desc: '出牌阶段每名角色限一次，你可以观看本回合受到过伤害或失去过牌的一名其他角色的手牌并记录其中所有牌的点数。当本次记录点数的数量超过3、6、9时，你摸三张牌。若已因此记录了所有点数，则清除记录且「豪贤」视为未发动过。',
  active: {
    perTurn: true,
    prompt: '观看本回合受过伤/失去过牌的一名其他角色的手牌并记录点数',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(q => q !== p && (q.flags.hurtTurn === g.turnCount || q.flags.loseTurn === g.turnCount || q.hand.length));
      if (!cands.length) { await ctx.log('【显略】：没有可选角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【显略】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.xianlveRec = p.flags.xianlveRec || [];
      p.flags.xianlveMarks = p.flags.xianlveMarks || 0;
      for (const c of t.hand) if (!p.flags.xianlveRec.includes(c.num)) p.flags.xianlveRec.push(c.num);
      const n = p.flags.xianlveRec.length;
      await ctx.log(`【显略】：记录 ${t.name} 手牌点数，共记录 ${n} 种`);
      const th = [3, 6, 9].filter(x => n >= x).length;
      while (p.flags.xianlveMarks < th) {
        p.flags.xianlveMarks += 1;
        await ctx.draw(p, 3, { reason: 'xianlve' });
        await ctx.log(`【显略】：记录数量超过 ${[3, 6, 9][p.flags.xianlveMarks - 1]}，摸 3 张牌`);
      }
      if (p.flags.xianlveRec.length >= 13) {
        p.flags.xianlveRec = [];
        p.flags.xianlveMarks = 0;
        p.flags.act_haoxian = -1;
        await ctx.log('【显略】：已记录所有点数，清除记录且「豪贤」视为未发动过');
      }
    },
  },
});

// ==================== 武张飞 · 豪贤（限定技）====================
defineSkill({
  id: 'haoxian', name: '豪贤',
  desc: '限定技，出牌阶段，你可以将弃牌堆中所有点数为3的牌洗入牌库，然后获得其他角色手牌中点数为3的牌。',
  active: {
    prompt: '弃牌堆中点数3的牌洗入牌库，获得其他角色手牌中点数3的牌（限定技）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.haoxianUsed) { await ctx.log('【豪贤】：限定技，本局已发动过'); return; }
      p.flags.haoxianUsed = true;
      const threes = g.discardPile.filter(c => c.num === 3);
      for (const c of threes) {
        const i = g.discardPile.indexOf(c);
        if (i >= 0) g.discardPile.splice(i, 1);
      }
      g.deck.unshift(...threes);
      g.deck = g.rng.shuffle(g.deck);   // shuffle 返回新数组，必须赋值（否则牌堆未洗）
      await ctx.log(`【豪贤】：弃牌堆中 ${threes.length} 张点数 3 的牌洗入牌库`);
      let got = 0;
      for (const q of g.alive()) {
        if (q === p) continue;
        const cards = q.hand.filter(c => c.num === 3);
        if (cards.length) { await ctx.gain(p, cards, { from: q, reason: 'haoxian' }); got += cards.length; }
      }
      await ctx.log(`【豪贤】：获得其他角色手牌中 ${got} 张点数 3 的牌`);
    },
  },
});

// ==================== 武陆抗 · 审断 ====================
defineSkill({
  id: 'shenduan2', name: '审断',
  desc: '你拼点时，可弃置一张牌，然后用牌堆中点数最大的牌拼点。有角色拼点后，赢的角色将其拼点牌置于牌堆底，然后本次用K拼点的角色摸一张牌堆中点数最小的牌。',
  active: {
    perTurn: true,
    prompt: '弃一张牌，用牌堆中点数最大的牌与一名角色拼点',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(q => q !== p && q.hand.length);
      if (!cands.length || !g.deck.length) { await ctx.log('【审断】：没有可拼点的角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【审断】：选择拼点角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      if (p.hand.length) {
        const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【审断】：可弃置一张牌', optional: true });
        if (picks.length) await ctx.discard(p, picks, { reason: 'shenduan2' });
      }
      g.deck.sort((a, b) => (a.num || 0) - (b.num || 0));
      const big = g.deck.pop();
      const small = g.deck[0];
      const cb = g.rng.pick(t.hand);
      if (!big || !cb) { if (big) g.deck.push(big); return; }
      await ctx.discard(t, [cb], { reason: 'shenduan2' });
      const win = (big.num || 0) > (cb.num || 0);
      await ctx.log(`【审断】：牌堆最大 ${cardLabel(big)} vs ${t.name} ${cardLabel(cb)} → ${win ? p.name + ' 赢' : p.name + ' 没赢'}`);
      g.deck.unshift(big);
      const winner = win ? p : t;
      if (winner === p && small) {
        const si = g.deck.indexOf(small);
        if (si >= 0) g.deck.splice(si, 1);
        await ctx.gain(p, [small], { reason: 'shenduan2' });
        await ctx.log(`【审断】：赢的角色将拼点牌置于牌堆底，摸点数最小的 ${cardLabel(small)}`);
      } else if (small) {
        const si = g.deck.indexOf(small);
        if (si >= 0) g.deck.splice(si, 1);
        await ctx.gain(t, [small], { reason: 'shenduan2' });
        await ctx.log(`【审断】：${t.name} 摸点数最小的 ${cardLabel(small)}`);
      }
    },
  },
});

// ==================== 武陆抗 · 克构 ====================
defineSkill({
  id: 'kegou', name: '克构',
  desc: '出牌阶段开始时或你使用或打出过牌的回合结束时，你可与一名其他角色拼点。若你赢，你获得牌堆中2个点数最小的牌各一张；若你没赢，其可以对你使用一张【杀】，你可以继续拼点并重复上述效果。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.self.hand.length > 0 && d.game.alive().some(x => x !== d.self && x.hand.length),
      async effect(ctx) { await kegouRun(ctx); },
    },
    {
      on: 'turn.end', who: 'self', optional: true,
      filter: (d) => d.self === d.player && (d.player.flags.cardsUsedTurn === d.game.turnCount) && d.self.hand.length > 0,
      async effect(ctx) { await kegouRun(ctx); },
    },
  ],
});

async function kegouRun(ctx) {
  const p = ctx.self, g = ctx.game;
  for (let i = 0; i < 3; i++) {
    if (!p.alive || !p.hand.length) break;
    const cands = g.alive().filter(q => q !== p && q.hand.length);
    if (!cands.length) break;
    const t = (await ctx.ask.targets(p, { prompt: '【克构】：选择拼点角色', candidates: cands, min: 1, max: 1 }))[0];
    if (!t) break;
    const r = await pindian(g, p, t, { reason: '克构' });
    if (r.skip) break;
    if (r.win) {
      g.deck.sort((a, b) => (a.num || 0) - (b.num || 0));
      const two = g.deck.splice(0, Math.min(2, g.deck.length));
      if (two.length) await ctx.gain(p, two, { reason: 'kegou' });
      await ctx.log(`【克构】：拼点获胜，获得牌堆中 ${two.length} 个点数最小的牌`);
    } else {
      await ctx.log(`【克构】：没赢，${t.name} 可以对你使用一张【杀】`);
      const sha = t.hand.find(c => c.name === 'sha');
      if (sha) {
        t.hand.splice(t.hand.indexOf(sha), 1);
        t.hand.push(sha);
        await ctx.useCard({ from: t, card: sha, targets: [p], reason: 'kegou', ignoreRange: true, ignoreShaLimit: true });
      }
      const go = await ctx.ask.confirm(p, '【克构】：是否继续拼点？');
      if (!go) break;
    }
  }
}

// ==================== 武陆抗 · 砥贤（限定技）====================
defineSkill({
  id: 'dixian', name: '砥贤',
  desc: '限定技，出牌阶段，你可以选择一个点数。若牌堆中所有的牌均大于等于此点数，你摸此点数张牌，且本局游戏你使用小于等于此点数的牌无距离和次数限制。若牌堆中有牌小于此点数，你获得所有场上、牌堆和弃牌堆中点数为K的牌。',
  active: {
    prompt: '选择一个点数（限定技）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.dixianUsed) { await ctx.log('【砥贤】：限定技，本局已发动过'); return; }
      p.flags.dixianUsed = true;
      const idx = await ctx.ask.choose(p, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], { prompt: '【砥贤】：选择一个点数', reason: 'dixian' });
      const n = (idx >= 0 ? idx : 0) + 1;
      const allBig = g.deck.every(c => (c.num || 0) >= n);
      if (allBig) {
        await ctx.draw(p, n, { reason: 'dixian' });
        p.flags.shaLimitBypass = true;
        p.flags.shaUnlimited = g.turnCount;
        p.flags.rangeBonus = (p.flags.rangeBonus || 0) + 5;
        await ctx.log(`【砥贤】：牌堆所有牌点数均不小于 ${n}，摸 ${n} 张牌，本局使用不大于 ${n} 的牌无距离和次数限制`);
      } else {
        const got = [];
        for (const q of g.alive()) {
          for (const k of SLOTS) {
            if (q.equips[k]?.num !== 13) continue;
            const c = q.equips[k];
            q.equips[k] = null;
            await g.trigger('equip.lose', { self: q, card: c, slot: k });
            got.push(c);
          }
          for (const c of q.hand.filter(x => x.num === 13)) {
            const i = q.hand.indexOf(c);
            if (i >= 0) q.hand.splice(i, 1);
            got.push(c);
          }
        }
        for (const c of g.deck.filter(x => x.num === 13)) { const i = g.deck.indexOf(c); if (i >= 0) g.deck.splice(i, 1); got.push(c); }
        for (const c of g.discardPile.filter(x => x.num === 13)) { const i = g.discardPile.indexOf(c); if (i >= 0) g.discardPile.splice(i, 1); got.push(c); }
        if (got.length) await ctx.gain(p, got, { reason: 'dixian' });
        await ctx.log(`【砥贤】：牌堆中有牌小于 ${n}，获得场上/牌堆/弃牌堆中所有点数 K 的 ${got.length} 张牌`);
      }
    },
  },
});
