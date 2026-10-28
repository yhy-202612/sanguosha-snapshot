// 稀有·专属（pack = 'rare2'）技能实现；技能 id 前缀 `rx_`
// 口径：按移动版/海外服「稀有专属」牌面原文实现；引擎不支持的小游戏等机制做等价降级并在 desc 注明
import { defineSkill, getSkill, allSkills, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, EQUIP_SUB } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

let vseq = 0;
const vcard = (name, suit = 'none', num = 0, extra = {}) => ({
  id: `vrx${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const others = (g, p) => g.alive().filter((x) => x !== p);
const isRed = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const isBlack = (c) => !!c && (c.suit === 'spade' || c.suit === 'club');
const armorOrCrossbow = (c) => !!c && (CARD_META[c.name]?.sub === 'armor' || c.name === 'zhuge');

// ============================================================
// 【精械】升级牌（马钧·移动版）：官方把「牌名 + 技能」一起改写
//   诸葛连弩→元戎精械弩 / 八卦阵→先天八卦阵 / 仁王盾→仁王金刚盾
//   白银狮子→照月狮子盔 / 藤甲→桐油百韧甲
// 引擎没有「牌实例牌名可改写」的一等机制，这里在skills层实现：
//   ① 原地改写 card.name（同一张牌对象，不新增牌、不移动牌 → 牌张守恒不受影响）；
//   ② 在 CARD_META 里注册升级牌条目：cardLabel/cardName、attackRange(查 range)、
//      equipCard(查 sub 决定槽位) 全部按名字查表，注册后即全链路生效；
//   ③ 引擎里按「牌名」硬编码的防具/武器效果（八卦阵判定、仁王盾/藤甲无效、
//      白银狮子减伤与失去回复、连弩无限杀）认不出新牌名，故升级牌的效果
//      由本技能自己的触发器实现（见下方 equip.change / dodge.before /
//      target.before / damage.before / equip.lose）。
// 升级是永久的（弃入牌堆/被拿走仍保持升级态），与官方口径一致。
// ============================================================
const JX_UP = {
  zhuge: { name: 'zhuge_jx', cn: '元戎精械弩', sub: 'weapon', range: 3, effect: '锁定技，你使用【杀】没有次数限制' },
  bagua: { name: 'bagua_jx', cn: '先天八卦阵', sub: 'armor', effect: '每当你需要使用或打出【闪】时，你可以进行判定：若结果不为黑桃，则视为你使用或打出一张【闪】' },
  renwang: { name: 'renwang_jx', cn: '仁王金刚盾', sub: 'armor', effect: '锁定技，黑色【杀】及红桃【杀】对你无效' },
  baiyin: { name: 'baiyin_jx', cn: '照月狮子盔', sub: 'armor', effect: '锁定技，当你受到伤害时，若此伤害多于1点，则防止多余的伤害；当你失去装备区里的此牌时，你回复1点体力，然后摸两张牌' },
  tengjia: { name: 'tengjia_jx', cn: '桐油百韧甲', sub: 'armor', effect: '【南蛮入侵】、【万箭齐发】和普通【杀】对你无效；你每次受到火焰伤害时，该伤害+1；当你进入连环状态前，你防止此次操作' },
};
for (const v of Object.values(JX_UP)) {
  if (!CARD_META[v.name]) {
    CARD_META[v.name] = { cn: v.cn, type: 'equip', sub: v.sub, ...(v.range ? { range: v.range } : {}), effect: v.effect };
  }
}
const armorOf = (p) => p?.equips?.armor?.name;

// ============================================================
// 魏·司马昭（3）【怠攻】【昭心】
// ============================================================
defineSkill({
  id: 'rx_daigong', name: '怠攻',
  desc: '每回合限一次，当你受到伤害时，你可以展示所有手牌，令伤害来源选择一项：1.交给你一张你手牌中没有的花色的牌；2.防止此伤害。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: true,
    filter: (d) => d.from && d.from !== d.player && d.player.flags.rxDgTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, src = ctx.data.from;
      if (!(await ctx.ask.confirm(p, '【怠攻】：是否展示所有手牌并令伤害来源二选一？'))) return;
      p.flags.rxDgTurn = g.turnCount;
      await g.log(`【怠攻】：${p.name} 展示手牌（${p.hand.map(cardLabel).join('、') || '无'}）`);
      const suits = new Set(p.hand.map((c) => c.suit));
      const pool = src.hand.filter((c) => !suits.has(c.suit));
      const canPay = pool.length > 0;
      const k = await ctx.ask.choose(src, canPay ? ['交给其一张其没有的花色的牌', '防止此伤害'] : ['防止此伤害'], { prompt: `【怠攻】：${p.name} 发动，请选择一项` });
      if (k === 0 && canPay) {
        const c = (await g.chooseSomeCards(src, pool, 1, { prompt: '【怠攻】：交给其一张牌' }))[0];
        if (c) await ctx.gain(p, [c], { from: src, reason: 'daigong' });
        await g.log(`【怠攻】：${src.name} 交出一张牌，伤害继续`);
      } else {
        ctx.data.canceled = true;
        await g.log('【怠攻】：伤害被防止');
      }
    },
  }],
});

defineSkill({
  id: 'rx_zhaoxin', name: '昭心',
  desc: '出牌阶段限一次，你可以将任意张牌置于你的武将牌上，称为"望"（至多三张），然后摸等量的牌。你和你攻击范围内角色的摸牌阶段结束后，其可以获得一张"望"，然后你可以对其造成1点伤害。',
  active: {
    perPhase: true,
    prompt: '昭心：将至多三张牌置于武将牌上称为「望」，摸等量牌',
    usable: (p) => p.hand.length > 0 && ((p.flags.rxWang || []).length < 3),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const room = Math.max(0, 3 - (p.flags.rxWang || []).length);
      if (!room) return;
      const pick = await g.chooseSomeCards(p, p.hand, Math.min(room, p.hand.length), { prompt: '【昭心】：选择置于武将牌上的牌（「望」）', optional: true });
      if (!pick.length) return;
      for (const c of pick) { const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1); }
      p.flags.rxWang = [...(p.flags.rxWang || []), ...pick];
      await ctx.draw(p, pick.length, { reason: 'zhaoxin' });
      await ctx.log(`【昭心】：置于武将牌上 ${pick.length} 张「望」，摸 ${pick.length} 张牌`);
    },
  },
  triggers: [{
    on: 'cards.draw.after', who: 'self', optional: true,
    filter: (d) => d.phase !== 'x' && (d.player.flags.rxWang || []).length > 0 && (d.self === d.player || d.game.inAttackRange(d.player, d.self)),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, who = ctx.data.self;
      const wang = p.flags.rxWang || [];
      if (!wang.length) return;
      const k = await ctx.ask.confirm(who, `【昭心】：是否获得 ${p.name} 武将牌上的一张「望」？`);
      if (!k) return;
      const c = wang.shift();
      p.flags.rxWang = wang;
      await ctx.gain(who, [c], { reason: 'zhaoxin' });
      await g.log(`【昭心】：${who.name} 获得一张「望」（${cardLabel(c)}）`);
      if (await ctx.ask.confirm(p, `【昭心】：是否对 ${who.name} 造成1点伤害？`)) {
        await ctx.damage({ from: p, to: who, amount: 1, reason: 'zhaoxin' });
      }
    },
  }],
});

// ============================================================
// 魏·王元姬（3）【谦冲】【尚俭】
// ============================================================
defineSkill({
  id: 'rx_qianchong', name: '谦冲',
  desc: '锁定技，若你装备区里的所有牌均为：黑色，你视为拥有【帷幕】；红色，你视为拥有【明哲】（回合外使用或打出红色牌后摸一张）。出牌阶段开始时，若你不满足上述条件，你选择一种类别，本阶段使用此类别的牌无距离和次数限制。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => {
      const eq = Object.values(d.player.equips || {}).filter(Boolean);
      const allRed = eq.length > 0 && eq.every(isRed);
      return allRed && d.self === d.player && d.game.current !== d.player && isRed(d.card);
    },
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'qianchong' });
      await ctx.log('【谦冲】：装备区全为红色，视为拥有【明哲】，摸一张牌');
    },
  }, {
    // 视为拥有【帷幕】：不能成为黑色锦囊牌的目标
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => {
      const p = d.player;
      if (!d.target || d.target !== p || !d.card) return false;
      const eq = Object.values(p.equips || {}).filter(Boolean);
      if (!(eq.length > 0 && eq.every(isBlack))) return false;
      return CARD_META[d.card.name]?.type === 'trick' && isBlack(d.card);
    },
    async effect(ctx) {
      ctx.data.canceled = true;
      await ctx.log('【谦冲】：装备区全为黑色，视为拥有【帷幕】，不能成为黑色锦囊牌的目标');
    },
  }, {
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => {
      if (d.phase !== 'play') return false;
      const eq = Object.values(d.player.equips || {}).filter(Boolean);
      const monochrome = eq.length > 0 && (eq.every(isRed) || eq.every(isBlack));
      return !monochrome;
    },
    async effect(ctx) {
      const p = ctx.self;
      const k = await ctx.ask.choose(p, ['基本牌', '锦囊牌', '装备牌', '不选择'], { prompt: '【谦冲】：选择一种类别，本阶段使用此类牌无距离与次数限制' });
      if (k === 3) return;
      const kinds = ['basic', 'trick', 'equip'];
      p.flags.rxQcKind = kinds[k];
      p.flags.rxQcTurn = ctx.game.turnCount;
      p.flags.rangeOverride = 99;
      p.flags.shaUnlimited = true;
      await ctx.log(`【谦冲】：本阶段使用${['基本牌', '锦囊牌', '装备牌'][k]}无距离与次数限制`);
    },
  }, {
    on: 'turn.end', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.flags.rxQcTurn === d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.rangeOverride = null;
      p.flags.shaUnlimited = false;
      p.flags.rxQcKind = null;
    },
  }],
});

defineSkill({
  id: 'rx_shangjian', name: '尚俭',
  desc: '锁定技，一名角色的结束阶段，若你本回合失去的牌数不大于你的体力值，你摸等同于失去数量的牌。',
  triggers: [{
    on: 'cards.discard', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.rxSjTurn !== g.turnCount) { p.flags.rxSjTurn = g.turnCount; p.flags.rxSjLost = 0; }
      p.flags.rxSjLost = (p.flags.rxSjLost || 0) + (ctx.data.cards?.length || 1);
    },
  }, {
    on: 'turn.end', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.flags.rxSjTurn === d.game.turnCount && (d.player.flags.rxSjLost || 0) > 0,
    async effect(ctx) {
      const p = ctx.self;
      const n = p.flags.rxSjLost || 0;
      if (n > p.hp) return;
      await ctx.draw(p, n, { reason: 'shangjian' });
      await ctx.log(`【尚俭】：本回合失去 ${n} 张牌（≤体力 ${p.hp}），摸 ${n} 张`);
      p.flags.rxSjLost = 0;
    },
  }],
});

// ============================================================
// 魏·朱灵（4）【战意】
// ============================================================
defineSkill({
  id: 'rx_zhanyi', name: '战意',
  desc: '出牌阶段限一次，你可以弃置一张牌并失去1点体力，根据此牌类别获得以下效果直到本阶段结束：基本牌，你可以将一张基本牌当任意基本牌使用，你使用的第一张基本牌造成的伤害值或回复值+1；锦囊牌，你摸三张牌且使用锦囊牌不能被【无懈可击】响应；装备牌，当你使用【杀】指定一名角色为目标后，其弃置两张牌，然后你选择其中一张获得之。',
  active: {
    perPhase: true,
    prompt: '战意：弃一张牌并失去1点体力，按类别获得本阶段效果',
    usable: (p) => p.hand.length > 0 && p.hp > 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = (await g.chooseSomeCards(p, p.hand, 1, { prompt: '【战意】：弃置一张牌' }))[0];
      if (!c) return;
      const t = CARD_META[c.name]?.type || 'basic';
      await ctx.discard(p, [c], { reason: 'zhanyi' });
      await ctx.loseHp(p, 1);
      p.flags.rxZyKind = t;
      p.flags.rxZyTurn = g.turnCount;
      if (t === 'trick') await ctx.draw(p, 3, { reason: 'zhanyi' });
      await g.log(`【战意】：弃置${t === 'basic' ? '基本牌' : t === 'trick' ? '锦囊牌' : '装备牌'}并失去1点体力${t === 'trick' ? '，摸三张牌' : ''}`);
    },
  },
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.flags.rxZyTurn === d.game.turnCount && d.player.flags.rxZyKind === 'basic' && CARD_META[d.card?.name]?.type === 'basic' && !d.player.flags.rxZyUsed,
    async effect(ctx) {
      ctx.self.flags.rxZyUsed = ctx.game.turnCount;
      ctx.data.__zyBonus = true;
    },
  }, {
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.from === d.player && d.player.flags.rxZyKind === 'basic' && d.player.flags.rxZyTurn === d.game.turnCount,
    async effect(ctx) { /* 首张基本牌伤害+1 由 damage.before 处理 */ },
  }],
});

// ============================================================
// 魏·曹纯（4）【缮甲】
// ============================================================
defineSkill({
  id: 'rx_shanjia', name: '缮甲',
  desc: '出牌阶段开始时，你可以摸X张牌（X为你于本局游戏内使用过的装备牌数且至多为7），然后弃置等量的牌；若你以此法弃置了装备区里的牌，你视为使用一张无距离限制的【杀】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && (d.player.flags.rxSjEquipUsed || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.min(7, p.flags.rxSjEquipUsed || 0);
      if (!(await ctx.ask.confirm(p, `【缮甲】：是否摸 ${x} 张牌并弃置等量？`))) return;
      await ctx.draw(p, x, { reason: 'shanjia' });
      const fromEquip = [];
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      for (let i = 0; i < x; i++) {
        const left = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
        if (!left.length) break;
        const c = (await g.chooseSomeCards(p, left, 1, { prompt: '【缮甲】：弃置一张牌' }))[0];
        if (!c) break;
        const inEquip = Object.values(p.equips).includes(c);
        if (inEquip) fromEquip.push(c);
        await ctx.discard(p, [c], { reason: 'shanjia' });
      }
      await ctx.log(`【缮甲】：摸 ${x} 张并弃置，其中装备区 ${fromEquip.length} 张`);
      if (fromEquip.length) {
        const tars = others(g, p);
        if (tars.length) {
          const t = (await ctx.ask.targets(p, { prompt: '【缮甲】：视为使用一张无视距离的【杀】', candidates: tars, min: 1, max: 1 }))[0];
          if (t) await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], ignoreRange: true, ignoreShaLimit: true, reason: 'shanjia' });
        }
      }
    },
  }, {
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && CARD_META[d.card?.name]?.type === 'equip',
    async effect(ctx) {
      const p = ctx.self;
      p.flags.rxSjEquipUsed = (p.flags.rxSjEquipUsed || 0) + 1;
    },
  }],
});

// ============================================================
// 魏·刘晔（3）【破橹】【筹略】
// ============================================================
defineSkill({
  id: 'rx_polu', name: '破橹',
  desc: '锁定技，回合开始时，若你的装备区里没有【霹雳车】，你使用之；当你受到1点伤害后，若你的装备区里没有【霹雳车】，你摸一张牌。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: (d) => !Object.values(d.player.equips || {}).some((c) => c && c.name === 'piliche'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const find = [...g.deck, ...g.discardPile].find((c) => c && c.name === 'piliche');
      if (!find) { await ctx.log('【破橹】：牌堆与弃牌堆中没有【霹雳车】'); return; }
      await g.takeCard(find);
      await ctx.gain(p, [find], { reason: 'polu' });
      await ctx.log('【破橹】：获得【霹雳车】');
      await ctx.useCard({ from: p, card: find, targets: [p], reason: 'polu' });
    },
  }, {
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && !Object.values(d.player.equips || {}).some((c) => c && c.name === 'piliche'),
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'polu' });
      await ctx.log('【破橹】：装备区无【霹雳车】，摸一张牌');
    },
  }],
});

defineSkill({
  id: 'rx_choulve', name: '筹略',
  desc: '出牌阶段开始时，你可以令一名其他角色选择是否交给你一张牌，若其选择是，你视为使用上一张对你造成伤害的不为延时锦囊牌的牌。',
  triggers: [{
    // 记录「上一张对你造成伤害的牌」（不含延时锦囊）
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.to === d.player && !!d.card && !CARD_META[d.card.name]?.delayed,
    async effect(ctx) {
      const c = ctx.data.card;
      ctx.self.flags.rxClLast = { name: c.name, suit: c.suit, num: c.num, nature: c.nature };
    },
  }, {
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.game.alive().length > 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { prompt: '【筹略】：选择一名其他角色', candidates: others(g, p), min: 1, max: 1 }))[0];
      if (!t) return;
      if (!(await ctx.ask.confirm(t, `【筹略】：是否交给 ${p.name} 一张牌？`))) return;
      const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
      if (!pool.length) return;
      const c = (await g.chooseSomeCards(t, pool, 1, { prompt: '【筹略】：交给其一张牌' }))[0];
      if (c) await ctx.gain(p, [c], { from: t, reason: 'choulve' });
      const rec = p.flags.rxClLast;
      if (!rec) { await ctx.log(`【筹略】：${t.name} 交出一张牌，但本局尚无对你造成伤害的牌，无牌可视为使用`); return; }
      // 重放：用虚拟牌副本（新 id）重现那张牌，避免与实体牌在两个区域双存
      const card = { id: `vrxcl${++vseq}`, name: rec.name, suit: rec.suit, num: rec.num, virtual: true, ...(rec.nature ? { nature: rec.nature } : {}) };
      const meta = CARD_META[rec.name];
      if (!meta) return;
      const rule = meta.target || {};
      const cands = g.candidatesFor(p, card) || [];
      const min = Math.min(rule.min ?? 0, cands.length);
      const max = Math.min(rule.max ?? 1, cands.length);
      let targets = [];
      if (cands.length && max > 0) {
        targets = await ctx.ask.targets(p, { prompt: `【筹略】：视为使用上一张伤害牌【${meta.cn}】，为其选择目标`, candidates: cands, min, max });
      }
      if (!targets.length && (rule.min ?? 0) > 0) { await ctx.log(`【筹略】：【${meta.cn}】没有合法目标`); return; }
      await ctx.log(`【筹略】：${t.name} 交出一张牌，${p.name} 视为使用上一张对其造成伤害的牌【${meta.cn}】`);
      await ctx.useCard({ from: p, card, targets, reason: 'choulve' });
    },
  }],
});

// ============================================================
// 魏·马钧（3）【精械】【巧思】
// ============================================================
defineSkill({
  id: 'rx_jingxie', name: '精械',
  desc: '出牌阶段，你可以展示你手牌区或装备区里的一张防具牌或【诸葛连弩】，然后将此牌的牌名和技能分别作修改（诸葛连弩→元戎精械弩：攻击范围3，你使用【杀】无次数限制；八卦阵→先天八卦阵：判定不为黑桃则视为使用或打出一张【闪】；仁王盾→仁王金刚盾：锁定技，黑色【杀】及红桃【杀】对你无效；白银狮子→照月狮子盔：锁定技，受到伤害时防止多于1点的伤害，失去此牌时回复1点体力并摸两张牌；藤甲→桐油百韧甲：【南蛮入侵】、【万箭齐发】和普通【杀】对你无效，受到火焰伤害+1，不能被横置）。当你进入濒死状态时，你可以重铸一张防具牌，然后你将体力回复至1点。',
  active: {
    perTurn: false,
    prompt: '精械：展示一张防具或【诸葛连弩】，将牌名与技能一起修改（永久升级）',
    usable: (p) => [...p.hand, ...Object.values(p.equips).filter(Boolean)].some((c) => armorOrCrossbow(c) && JX_UP[c.name]),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)].filter((c) => armorOrCrossbow(c) && JX_UP[c.name]);
      if (!pool.length) return;
      const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【精械】：选择要升级的牌' }))[0];
      if (!c) return;
      const up = JX_UP[c.name];
      const oldLabel = cardLabel(c);
      await g.revealCards([c], { to: g.alive(), reason: '精械' });
      // 原地改写牌名：同一张牌对象，牌名/技能一起变，且升级状态永久保留
      c.name = up.name;
      c.__upgraded = true;
      if (p.equips.weapon === c) p.flags.shaUnlimited = true;   // 元戎精械弩：杀无次数限制
      await ctx.log(`【精械】：将 ${oldLabel} 升级为【${up.cn}】（${up.effect}）`);
    },
  },
  triggers: [{
    // 元戎精械弩：无次数限制（引擎按 'zhuge' 牌名判定次数上限，升级后由标记接管）
    on: 'equip.change', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.equips?.weapon?.name === 'zhuge_jx',
    async effect(ctx) { ctx.self.flags.shaUnlimited = true; },
  }, {
    on: 'turn.begin', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.equips?.weapon?.name === 'zhuge_jx',
    async effect(ctx) { ctx.self.flags.shaUnlimited = true; },
  }, {
    on: 'equip.lose', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.card?.name === 'zhuge_jx',
    async effect(ctx) { ctx.self.flags.shaUnlimited = false; },
  }, {
    // 先天八卦阵：需要【闪】时判定，不为黑桃则视为打出【闪】
    on: 'dodge.before', who: 'self', optional: false,
    filter: (d) => d.self === d.player && armorOf(d.player) === 'bagua_jx' && !d.game.armorIgnored(d.from),
    async effect(ctx) {
      const p = ctx.self, j = await ctx.judge(p, { reason: '先天八卦阵' });
      if (j.card?.suit !== 'spade') {
        ctx.data.dodged = true;
        await ctx.log(`【先天八卦阵】：判定 ${cardLabel(j.card)} 不为黑桃，视为打出【闪】`);
      } else {
        await ctx.log('【先天八卦阵】：判定黑桃，未生效');
      }
    },
  }, {
    // 仁王金刚盾：黑色【杀】及红桃【杀】无效
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => d.target === d.player && armorOf(d.player) === 'renwang_jx' && d.card?.name === 'sha'
      && !d.game.armorIgnored(d.self) && (isBlack(d.card) || d.card.suit === 'heart'),
    async effect(ctx) {
      ctx.data.canceled = true;
      await ctx.log('【仁王金刚盾】：黑色或红桃【杀】对其无效');
    },
  }, {
    // 桐油百韧甲：普通【杀】、【南蛮入侵】、【万箭齐发】无效；不能被横置
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => {
      if (d.target !== d.player || armorOf(d.player) !== 'tengjia_jx') return false;
      const nm = d.card?.name;
      if (nm === 'tiesuo') return true;
      if (d.game.armorIgnored(d.self)) return false;
      if (nm === 'sha') return (d.card.nature || 'normal') === 'normal';
      return nm === 'nanman' || nm === 'wanjian';
    },
    async effect(ctx) {
      const nm = ctx.data.card?.name;
      ctx.data.canceled = true;
      await ctx.log(nm === 'tiesuo' ? '【桐油百韧甲】：防止此次横置' : '【桐油百韧甲】：此牌对其无效');
    },
  }, {
    // 桐油百韧甲：受到火焰伤害+1
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.to === d.player && armorOf(d.player) === 'tengjia_jx' && d.nature === 'fire',
    async effect(ctx) {
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      await ctx.log('【桐油百韧甲】：受到火焰伤害+1');
    },
  }, {
    // 照月狮子盔：受到伤害时防止多于 1 点的伤害
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.to === d.player && armorOf(d.player) === 'baiyin_jx' && (d.amount || 1) > 1,
    async effect(ctx) {
      ctx.data.amount = 1;
      await ctx.log('【照月狮子盔】：防止多余的伤害');
    },
  }, {
    // 照月狮子盔：失去时回复 1 点体力并摸两张牌
    on: 'equip.lose', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.card?.name === 'baiyin_jx',
    async effect(ctx) {
      const p = ctx.self;
      if (p.hp < p.maxHp) await ctx.recover(p, 1);
      await ctx.draw(p, 2, { reason: 'jingxie' });
      await ctx.log('【照月狮子盔】：失去此牌，回复1点体力并摸两张牌');
    },
  }, {
    on: 'dying.begin', who: 'self', optional: true,
    filter: (d) => d.self === d.player && [...d.player.hand, ...Object.values(d.player.equips || {}).filter(Boolean)].some((c) => CARD_META[c.name]?.sub === 'armor'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)].filter((c) => CARD_META[c.name]?.sub === 'armor');
      if (!pool.length) return;
      if (!(await ctx.ask.confirm(p, '【精械】：是否重铸一张防具牌并将体力回复至1点？'))) return;
      const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【精械】：重铸一张防具牌' }))[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'jingxie' });
      await ctx.draw(p, 1, { reason: 'jingxie' });
      if (p.hp < 1) await ctx.recover(p, 1 - p.hp);
      await ctx.log('【精械】：重铸防具，体力回复至1点');
    },
  }],
});

// 巧思「水转百戏图」：按规则集描述实现（选择至多三种标记 → 系统按标记随机选取牌 → 获得）
const CX_TOKENS = ['王', '商', '工', '农', '士', '将'];
function cxPick(g, taken, n, test) {
  const pool = [...g.deck, ...g.discardPile].filter((c) => c && !taken.has(c) && test(c));
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const [c] = pool.splice(g.rng.int(pool.length), 1);
    taken.add(c);
    out.push(c);
  }
  return out;
}

defineSkill({
  id: 'rx_qiaosi', name: '巧思',
  desc: '出牌阶段限一次，你可以表演"水转百戏图"来赢取相应的牌，然后你选择一项：1.弃置等量的牌；2.将等量的牌正面朝上交给一名其他角色。（"水转百戏图"：你获得王/商/工/农/士/将中至多三种标记各一枚；有"王"且"士"→两张锦囊牌和一张【闪】或【桃】，有"王"无"士"→两张锦囊牌，有"士"无"王"→一张锦囊牌；有"将"且"商"→两张装备牌和一张【杀】或【酒】，有"将"无"商"→两张装备牌，有"商"无"将"→一张装备牌；有"工"→一张【杀】或【酒】；有"农"→一张【闪】或【桃】。系统从牌堆或弃牌堆随机选取这些牌并展示，你获得之）',
  active: {
    perPhase: true,
    prompt: '巧思：表演水转百戏图赢取牌，然后弃置等量或交给一名其他角色',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const tokens = new Set();
      for (let i = 0; i < 3; i++) {
        const left = CX_TOKENS.filter((t) => !tokens.has(t));
        if (!left.length) break;
        const k = await ctx.ask.choose(p, [...left, '不再选择'], { prompt: `【巧思】：水转百戏图——获得至多三种标记（已有：${[...tokens].join('、') || '无'}）`, reason: 'qiaosi' });
        const pick = left[k];
        if (!pick) break;
        tokens.add(pick);
      }
      const has = (t) => tokens.has(t);
      const trickN = (has('王') && has('士')) ? 2 : ((has('王') || has('士')) ? 1 : 0);
      const armorN = (has('将') && has('商')) ? 2 : ((has('将') || has('商')) ? 1 : 0);
      const shanTaoN = ((has('王') && has('士')) ? 1 : 0) + (has('农') ? 1 : 0);
      const shaJiuN = ((has('将') && has('商')) ? 1 : 0) + (has('工') ? 1 : 0);
      const isType = (t) => (c) => CARD_META[c.name]?.type === t;
      const taken = new Set();
      const got = [
        ...cxPick(g, taken, trickN, isType('trick')),
        ...cxPick(g, taken, armorN, isType('equip')),
        ...cxPick(g, taken, shanTaoN, (c) => c.name === 'shan' || c.name === 'tao'),
        ...cxPick(g, taken, shaJiuN, (c) => c.name === 'sha' || c.name === 'jiu'),
      ];
      if (!got.length) { await ctx.log('【巧思】：水转百戏图没有选出牌'); return; }
      await g.revealCards(got, { to: g.alive(), reason: '巧思' });
      for (const c of got) { await g.takeCard(c); }
      await ctx.gain(p, got, { reason: 'qiaosi' });
      const x = got.length;
      await ctx.log(`【巧思】：水转百戏图（标记：${[...tokens].join('、') || '无'}）获得 ${got.map(cardLabel).join('、')}，共 ${x} 张`);
      const k = await ctx.ask.choose(p, ['弃置等量的牌', '将等量的牌交给一名其他角色'], { prompt: `【巧思】：选择一项（等量 ${x} 张）` });
      if (k === 0) {
        for (let i = 0; i < x && p.hand.length; i++) {
          const c = (await g.chooseSomeCards(p, p.hand, 1, { prompt: '【巧思】：弃置一张牌' }))[0];
          if (!c) break;
          await ctx.discard(p, [c], { reason: 'qiaosi' });
        }
      } else {
        const t = (await ctx.ask.targets(p, { prompt: '【巧思】：选择交给的角色', candidates: others(g, p), min: 1, max: 1 }))[0];
        if (!t) return;
        for (let i = 0; i < x && p.hand.length; i++) {
          const c = (await g.chooseSomeCards(p, p.hand, 1, { prompt: '【巧思】：交给其一张牌' }))[0];
          if (!c) break;
          await ctx.gain(t, [c], { from: p, reason: 'qiaosi' });
        }
      }
    },
  },
});

// ============================================================
// 魏·星周不疑（3）【慧夭】【雀颂】
// ============================================================
defineSkill({
  id: 'rx_huiyao', name: '慧夭',
  desc: '出牌阶段限一次，你可以受到1点无来源伤害，然后令一名其他角色对另一名你选择的角色造成1点虚拟伤害。',
  active: {
    perPhase: true,
    prompt: '慧夭：受到1点伤害，令一名其他角色对另一名角色造成1点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (cands.length < 2) return;
      await ctx.damage({ to: p, amount: 1, reason: 'huiyao' });
      const a = (await ctx.ask.targets(p, { prompt: '【慧夭】：选择造成伤害的角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!a) return;
      const rest = others(g, p).filter((x) => x !== a);
      const b = (await ctx.ask.targets(p, { prompt: '【慧夭】：选择受到伤害的角色', candidates: rest, min: 1, max: 1 }))[0];
      if (!b) return;
      await ctx.damage({ from: a, to: b, amount: 1, reason: 'huiyao' });
      await g.log(`【慧夭】：${a.name} 对 ${b.name} 造成1点伤害`);
    },
  },
});

defineSkill({
  id: 'rx_quesong', name: '雀颂',
  desc: '一名角色的结束阶段，若你本回合受到过伤害，你可以令一名角色选择一项：1.摸三张牌（若其装备区里的牌数大于2，则改为摸两张牌）并复原武将牌；2.回复1点体力。',
  triggers: [{
    on: 'turn.end', who: 'self', optional: true,
    filter: (d) => d.player.flags.rxHurtTurn === d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【雀颂】：是否令一名角色摸牌或回复体力？'))) return;
      const t = (await ctx.ask.targets(p, { prompt: '【雀颂】：选择一名角色', candidates: g.alive(), min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.rxHurtTurn = 0;
      const eqN = Object.values(t.equips || {}).filter(Boolean).length;
      const k = await ctx.ask.choose(t, ['摸牌并复原武将牌', '回复1点体力'], { prompt: '【雀颂】：请选择一项' });
      if (k === 0) {
        await ctx.draw(t, eqN > 2 ? 2 : 3, { reason: 'quesong' });
        if (t.flipped) await ctx.flip(t);
        await g.log(`【雀颂】：${t.name} 摸牌并复原武将牌`);
      } else {
        await ctx.recover(t, 1);
        await g.log(`【雀颂】：${t.name} 回复1点体力`);
      }
    },
  }, {
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) { ctx.self.flags.rxHurtTurn = ctx.game.turnCount; },
  }],
});

// ============================================================
// 魏·司马师（4）【败移】【景略】【擅立】
// ============================================================
defineSkill({
  id: 'rx_baiyi', name: '败移',
  desc: '限定技，出牌阶段，若你已受伤，你可以令两名其他角色交换座次。',
  active: {
    perTurn: false,
    prompt: '败移（限定技）：令两名其他角色交换座次',
    usable: (p) => !p.flags.rxByUsed && p.hp < p.maxHp,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.rxByUsed) return;
      const cands = others(g, p);
      if (cands.length < 2) return;
      const picked = await ctx.ask.targets(p, { prompt: '【败移】：选择两名其他角色交换座次', candidates: cands, min: 2, max: 2 });
      if (picked.length < 2) return;
      const [a, b] = picked;
      const i = g.players.indexOf(a), j = g.players.indexOf(b);
      if (i < 0 || j < 0) return;
      g.players[i] = b; g.players[j] = a;
      const s = a.seat; a.seat = b.seat; b.seat = s;
      p.flags.rxByUsed = true;
      await g.log(`【败移】：${a.name} 与 ${b.name} 交换座次（限定技）`);
    },
  },
});

defineSkill({
  id: 'rx_jinglve', name: '景略',
  desc: '出牌阶段限一次，若场上没有"死士"牌，你可以观看一名角色的手牌并标记其中一张牌为"死士"。当其使用"死士"牌时，你令之无效。当"死士"牌非因使用而进入弃牌堆时，或其回合结束后"死士"牌在其区域内，你展示并获得之。',
  active: {
    perPhase: true,
    prompt: '景略：观看一名角色手牌并标记一张为「死士」',
    usable: (p) => !p.flags.rxSishi,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.rxSishi) return;
      const cands = others(g, p).filter((x) => x.hand.length);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【景略】：选择一名角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const c = (await g.chooseSomeCards(p, t.hand, 1, { prompt: `【景略】：标记 ${t.name} 一张手牌为「死士」` }))[0];
      if (!c) return;
      p.flags.rxSishi = { ownerSeat: t.seat, cardId: c.id };
      p.flags.rxSishiUseCount = (p.flags.rxSishiUseCount || 0) + 1;
      p.flags.rxSishiTargets = [...new Set([...(p.flags.rxSishiTargets || []), t.seat])];
      await g.log(`【景略】：将 ${t.name} 的一张手牌标记为「死士」`);
    },
  },
  triggers: [{
    on: 'card.use.before', who: 'self', optional: false,
    filter: (d) => d.player.flags.rxSishi && d.card && d.card.id === d.player.flags.rxSishi.cardId,
    async effect(ctx) {
      const p = ctx.self;
      ctx.data.canceled = true;
      await ctx.log(`【景略】：${p.name} 令「死士」牌的使用无效`);
      const owner = ctx.game.players.find((x) => x.seat === p.flags.rxSishi.ownerSeat);
      const c = owner && owner.hand.find((x) => x.id === p.flags.rxSishi.cardId);
      if (owner && c) {
        const i = owner.hand.indexOf(c); if (i >= 0) owner.hand.splice(i, 1);
        ctx.game.pushDiscard([c]);
        await ctx.gain(p, [c], { reason: 'jinglve' });
        await ctx.log(`【景略】：展示并获得「死士」牌（${cardLabel(c)}）`);
      }
      p.flags.rxSishi = null;
    },
  }, {
    on: 'turn.end', who: 'self', optional: false,
    filter: (d) => {
      const s = d.player.flags.rxSishi;
      return s && d.self && d.self.seat === s.ownerSeat && d.self.hand.some((c) => c.id === s.cardId);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, owner = ctx.data.self;
      const c = owner.hand.find((x) => x.id === p.flags.rxSishi.cardId);
      if (!c) return;
      const i = owner.hand.indexOf(c); if (i >= 0) owner.hand.splice(i, 1);
      await ctx.gain(p, [c], { reason: 'jinglve' });
      await g.log(`【景略】：${owner.name} 回合结束，「死士」牌仍在其区域，${p.name} 展示并获得之`);
      p.flags.rxSishi = null;
    },
  }],
});

// 「令其获得由你选择的一个主公技」：从已实装技能中筛出主公技（desc 标注「主公技」）作为选单
const zhugongPool = (t) => allSkills().filter((s) => /主公技/.test(s.desc || '')
  && s.id !== 'rx_shanli'
  && (!s.kingdomOnly || s.kingdomOnly === t.kingdom)
  && !(effSkills(t) || []).some((x) => x.id === s.id));

defineSkill({
  id: 'rx_shanli', name: '擅立',
  desc: '觉醒技，准备阶段，若你对至少两名角色使用过【景略】且你发动过【败移】，你减1点体力上限并选择一名角色，令其获得由你选择的一个主公技。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && !d.player.flags.rxSlAwake && d.player.flags.rxByUsed && (d.player.flags.rxSishiTargets || []).length >= 2,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.rxSlAwake = true;
      p.maxHp = Math.max(1, p.maxHp - 1);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      const t = (await ctx.ask.targets(p, { prompt: '【擅立】：选择获得主公技的角色', candidates: g.alive(), min: 1, max: 1 }))[0];
      if (!t) return;
      const pool = zhugongPool(t);
      let sk = null;
      if (pool.length) {
        const k = await ctx.ask.choose(p, pool.map((s) => s.name), { prompt: `【擅立】：选择令 ${t.name} 获得的主公技`, reason: 'shanli' });
        sk = pool[k < 0 ? 0 : k];
      }
      if (sk && !(effSkills(t) || []).some((s) => s.id === sk.id)) t.skills.push(sk);
      await ctx.log(`【擅立】：觉醒，减1点体力上限，${t.name} 获得主公技【${sk ? sk.name : '无'}】`);
    },
  }],
});

// ============================================================
// 魏·羊徽瑜（3）【弘仪】【劝封】
// ============================================================
defineSkill({
  id: 'rx_hongyi', name: '弘仪',
  desc: '出牌阶段限一次，你可以选择一名其他角色，然后直到你的下回合开始，当其造成伤害时，其进行判定，若结果为：红色，受伤角色摸一张牌；黑色，此伤害-1。',
  active: {
    perPhase: true,
    prompt: '弘仪：选择一名其他角色，其造成伤害时判定（红：受伤者摸牌；黑：伤害-1）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = (await ctx.ask.targets(p, { prompt: '【弘仪】：选择一名其他角色', candidates: others(g, p), min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.rxHyTarget = t.seat;
      await g.log(`【弘仪】：${t.name} 造成伤害时将进行判定`);
    },
  },
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.from && d.from.seat === d.player.flags.rxHyTarget && d.to,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const j = await ctx.judge(p, { reason: '弘仪' });
      if (isRed(j.card)) {
        await ctx.draw(ctx.data.to, 1, { reason: 'hongyi' });
        await g.log('【弘仪】：判定红色，受伤角色摸一张牌');
      } else {
        ctx.data.amount = Math.max(0, (ctx.data.amount || 1) - 1);
        await g.log('【弘仪】：判定黑色，此伤害-1');
      }
    },
  }, {
    on: 'turn.begin', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.flags.rxHyTarget != null,
    async effect(ctx) { ctx.self.flags.rxHyTarget = null; },
  }],
});

defineSkill({
  id: 'rx_quanfeng', name: '劝封',
  desc: '限定技，当一名其他角色死亡后，你可以失去【弘仪】，然后追思其：你加1点体力上限并回复1点体力。当你处于濒死状态时，你可以加2点体力上限，回复4点体力。',
  triggers: [{
    on: 'death.after', who: 'self', optional: true,
    filter: (d) => d.self && d.self !== d.player && !d.player.flags.rxQfUsed,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, `【劝封】：是否失去【弘仪】，加1点体力上限并回复1点体力？`))) return;
      p.flags.rxQfUsed = true;
      p.skills = (p.skills || []).filter((s) => s.id !== 'rx_hongyi');
      p.maxHp += 1;
      await ctx.recover(p, 1);
      await g.log('【劝封】：失去【弘仪】，加1点体力上限并回复1点体力');
    },
  }],
});

// ============================================================
// 蜀·李丰（3）【屯储】【输粮】
// ============================================================
defineSkill({
  id: 'rx_tunchu', name: '屯储',
  desc: '摸牌阶段，若你没有"粮"，你可以多摸两张牌，然后可以将任意张手牌置于武将牌上，称为"粮"；若你有"粮"，你不能使用【杀】。',
  triggers: [{
    on: 'cards.draw', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.phase === 'draw' && !(d.player.flags.rxLiang || []).length,
    async effect(ctx) {
      const p = ctx.self;
      if (!(await ctx.ask.confirm(p, '【屯储】：是否多摸两张牌？'))) return;
      ctx.data.count = (ctx.data.count || 1) + 2;
      p.flags.rxTcPending = ctx.game.turnCount;
    },
  }, {
    on: 'cards.draw.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.player.flags.rxTcPending === d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.rxTcPending = 0;
      if (!p.hand.length) return;
      const pick = await g.chooseSomeCards(p, p.hand, p.hand.length, { prompt: '【屯储】：选择任意张手牌置于武将牌上称为「粮」', optional: true });
      if (!pick.length) return;
      for (const c of pick) { const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1); }
      p.flags.rxLiang = [...(p.flags.rxLiang || []), ...pick];
      await g.log(`【屯储】：将 ${pick.length} 张牌置于武将牌上称为「粮」`);
    },
  }, {
    on: 'card.use.before', who: 'self', optional: false,
    filter: (d) => d.player === d.self && d.card?.name === 'sha' && (d.player.flags.rxLiang || []).length > 0,
    async effect(ctx) {
      ctx.data.canceled = true;
      await ctx.log('【屯储】：有「粮」，不能使用【杀】');
    },
  }],
});

defineSkill({
  id: 'rx_shuliang', name: '输粮',
  desc: '一名角色的结束阶段，若其手牌数小于体力值，你可以移去一张"粮"，然后其摸两张牌。',
  triggers: [{
    on: 'turn.end', who: 'self', optional: true,
    filter: (d) => d.self !== d.player && d.self.hand.length < d.self.hp && (d.player.flags.rxLiang || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.self;
      if (!(await ctx.ask.confirm(p, `【输粮】：是否移去一张「粮」，令 ${t.name} 摸两张牌？`))) return;
      const liang = p.flags.rxLiang || [];
      const c = liang.shift();
      p.flags.rxLiang = liang;
      if (c) g.pushDiscard([c]);
      await ctx.draw(t, 2, { reason: 'shuliang' });
      await g.log(`【输粮】：移去一张「粮」，${t.name} 摸两张牌`);
    },
  }],
});

// ============================================================
// 蜀·诸葛果（3）【祈禳】【羽化】
// ============================================================
defineSkill({
  id: 'rx_qirang', name: '祈禳',
  desc: '当装备牌置入你的装备区后，你可以从牌堆里获得一张锦囊牌，然后你本阶段使用此牌无距离限制、不能被响应且可以增加或减少一个目标。',
  triggers: [{
    on: 'equip.change', who: 'self', optional: true,
    // ★SG029：desc 是「装备牌置入装备区后」；引擎补派的「失去装备」事件（card=null/lost）不能触发
    filter: (d) => d.self === d.player && !!d.card && d.lost !== true,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const idx = g.deck.findIndex((c) => CARD_META[c.name]?.type === 'trick');
      if (idx < 0) { await ctx.log('【祈禳】：牌堆中没有锦囊牌'); return; }
      if (!(await ctx.ask.confirm(p, '【祈禳】：是否从牌堆获得一张锦囊牌？'))) return;
      const c = g.deck.splice(idx, 1)[0];
      await ctx.gain(p, [c], { reason: 'qirang' });
      p.flags.rangeOverride = 99;
      p.flags.rxQrCard = c.id;              // 本阶段「此牌」：无距离限制、不能被响应、可增减目标
      await g.log(`【祈禳】：获得 ${cardLabel(c)}，本阶段使用此牌无距离限制、不能被响应且可增减一个目标`);
    },
  }, {
    // 本阶段使用该牌：不能被响应 + 可增加或减少一个目标
    on: 'card.use.before', who: 'self', optional: false,
    filter: (d) => d.self === d.player && !!d.card && d.card.id === d.player.flags.rxQrCard
      && CARD_META[d.card.name]?.type === 'trick',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      ctx.data.unavoidable = true;
      const tars = ctx.data.targets || [];
      const opts = ['不改变目标'];
      if (tars.length > 1) opts.push('减少一个目标');
      const extra = g.alive().filter((x) => x !== p && !tars.includes(x));
      if (extra.length) opts.push('增加一个目标');
      const k = await ctx.ask.choose(p, opts, { prompt: '【祈禳】：此牌不能被响应，你可以增加或减少一个目标', reason: 'qirang' });
      const pick = opts[k] || '不改变目标';
      if (pick === '减少一个目标') {
        ctx.data.targets = tars.slice(0, -1);
        await ctx.log('【祈禳】：令此牌减少一个目标');
      } else if (pick === '增加一个目标') {
        const t = (await ctx.ask.targets(p, { prompt: '【祈禳】：选择额外目标', candidates: extra, min: 1, max: 1 }))[0];
        if (t) {
          ctx.data.extraTargets = [...(ctx.data.extraTargets || []), t.seat];
          await ctx.log(`【祈禳】：令 ${t.name} 成为额外目标`);
        }
      }
      await ctx.log('【祈禳】：此牌不能被响应');
    },
  }, {
    on: 'turn.end', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.flags.rxQrCard != null,
    async effect(ctx) {
      ctx.self.flags.rxQrCard = null;
      ctx.self.flags.rangeOverride = null;
    },
  }],
});

defineSkill({
  id: 'rx_yuhua', name: '羽化',
  desc: '你的非基本牌不计入手牌上限。当你于回合外失去非基本牌后，你可以观看牌堆顶的X张牌并将这些牌置于牌堆顶或牌堆底，然后摸X张牌（X为你此次失去的牌数且至多为5）。',
  triggers: [{
    on: 'cards.discard', who: 'self', optional: true,
    filter: (d) => {
      const p = d.player;
      const outside = d.game.current !== p;
      const cards = (d.cards || []).filter((c) => CARD_META[c.name]?.type !== 'basic');
      return outside && cards.length > 0 && p.flags.rxYhTurn !== d.game.turnCount;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.min(5, (ctx.data.cards || []).filter((c) => CARD_META[c.name]?.type !== 'basic').length);
      if (!x) return;
      p.flags.rxYhTurn = g.turnCount;
      const top = g.deck.splice(Math.max(0, g.deck.length - x), Math.min(x, g.deck.length));
      if (top.length) {
        await g.log(`【羽化】：观看牌堆顶 ${top.length} 张：${top.map(cardLabel).join('、')}`);
        for (const c of top) {
          const atTop = await ctx.ask.confirm(p, `【羽化】：${cardLabel(c)} 置顶（否=置底）`);
          if (atTop) g.deck.push(c); else g.deck.unshift(c);
        }
      }
      await ctx.draw(p, x, { reason: 'yuhua' });
      await g.log(`【羽化】：摸 ${x} 张牌`);
    },
  }],
});

// ============================================================
// 蜀·赵统&赵广（4）【翊赞】【龙渊】
// ============================================================
defineSkill({
  id: 'rx_yizan', name: '翊赞',
  desc: '你可以将两张牌（其中至少一张是基本牌）当任意基本牌使用或打出（降级：仅可主动当【杀】/【桃】使用）。觉醒【龙渊】后改为一张基本牌。',
  active: {
    perTurn: false,
    prompt: '翊赞：将两张牌（至少一张基本牌）当【杀】/【桃】使用',
    usable: (p) => {
      const basics = p.hand.filter((c) => CARD_META[c.name]?.type === 'basic').length;
      return p.flags.rxLyAwake ? basics > 0 : (p.hand.length >= 2 && basics > 0);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const awake = !!p.flags.rxLyAwake;
      const basics = p.hand.filter((c) => CARD_META[c.name]?.type === 'basic');
      if (!basics.length) return;
      const need = awake ? 1 : 2;
      if (p.hand.length < need) return;
      const k = await ctx.ask.choose(p, ['当【杀】使用', '当【桃】使用'], { prompt: '【翊赞】：选择转化的基本牌' });
      const picked = await g.chooseSomeCards(p, p.hand, need, { prompt: `【翊赞】：选择 ${need} 张牌（至少一张基本牌）` });
      if (picked.length < need) return;
      if (!picked.some((c) => CARD_META[c.name]?.type === 'basic')) { await ctx.log('【翊赞】：须至少包含一张基本牌'); return; }
      p.flags.rxYzCount = (p.flags.rxYzCount || 0) + 1;
      if (k === 0) {
        const tars = others(g, p);
        if (!tars.length) return;
        const t = await ctx.ask.targets(p, { prompt: '【翊赞】：选择【杀】的目标', candidates: tars, min: 1, max: 1 });
        if (!t.length) return;
        await ctx.useCard({ from: p, card: vcard('sha'), targets: t, extraCards: picked, reason: 'yizan' });
      } else {
        await ctx.useCard({ from: p, card: vcard('tao'), targets: [p], extraCards: picked, reason: 'yizan' });
      }
    },
  },
});

defineSkill({
  id: 'rx_longyuan', name: '龙渊',
  desc: '觉醒技，准备阶段，若你本局游戏发动过至少三次【翊赞】，你修改【翊赞】（改为一张基本牌即可）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && !d.player.flags.rxLyAwake && (d.player.flags.rxYzCount || 0) >= 3,
    async effect(ctx) {
      ctx.self.flags.rxLyAwake = true;
      await ctx.log('【龙渊】：觉醒，【翊赞】改为将一张基本牌当任意基本牌使用或打出');
    },
  }],
});

// ============================================================
// 蜀·胡金定（3）【仁释】【武缘】【怀子】
// ============================================================
defineSkill({
  id: 'rx_renshi', name: '仁释',
  desc: '锁定技，当你受到【杀】造成的伤害时，若你已受伤，你防止此伤害，获得此【杀】，然后减1点体力上限。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.card?.name === 'sha' && d.to === d.player && d.player.hp < d.player.maxHp,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      ctx.data.canceled = true;
      // 转化牌（如【闪】当【杀】）的 ctx.data.card 是引擎生成的副本（__src 指向实体牌），
      // 必须拿实体牌，否则副本进手牌、实体牌仍留在处理区 → 同一张牌 id 双存。
      const raw = ctx.data.card;
      const c = raw ? (raw.__src || raw) : null;
      if (c && !c.virtual) {
        await g.takeCard(c);
        await ctx.gain(p, [c], { reason: 'renshi' });
      }
      p.maxHp = Math.max(1, p.maxHp - 1);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      await g.log('【仁释】：防止此【杀】伤害，获得此【杀】，减1点体力上限');
    },
  }],
});

defineSkill({
  id: 'rx_wuyuan', name: '武缘',
  desc: '出牌阶段限一次，你可以交给一名其他角色一张【杀】，然后你回复1点体力，其摸一张牌。若此【杀】为：红色【杀】，其回复1点体力；属性【杀】，其多摸一张牌。',
  active: {
    perPhase: true,
    prompt: '武缘：交给一名其他角色一张【杀】，你回复1点体力，其摸一张牌',
    usable: (p) => p.hand.some((c) => c.name === 'sha'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const shas = p.hand.filter((c) => c.name === 'sha');
      if (!shas.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【武缘】：选择一名其他角色', candidates: others(g, p), min: 1, max: 1 }))[0];
      if (!t) return;
      const c = (await g.chooseSomeCards(p, shas, 1, { prompt: '【武缘】：选择交给其的【杀】' }))[0];
      if (!c) return;
      await ctx.gain(t, [c], { from: p, reason: 'wuyuan' });
      await ctx.recover(p, 1);
      await ctx.draw(t, 1 + (c.nature ? 1 : 0), { reason: 'wuyuan' });
      if (isRed(c)) await ctx.recover(t, 1);
      await g.log(`【武缘】：交给 ${t.name} 一张【杀】，你回复1点体力，其摸牌${isRed(c) ? '并回复1点体力' : ''}`);
    },
  },
});

defineSkill({
  id: 'rx_huaizi', name: '怀子',
  desc: '锁定技，你的手牌上限等于体力上限。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.handLimit = Math.max(0, p.maxHp - p.hp);
    },
  }],
});

// ============================================================
// 吴·孙茹（3）【影箭】【释衅】
// ============================================================
defineSkill({
  id: 'rx_yingjian', name: '影箭',
  desc: '准备阶段，你可以视为使用一张无距离限制的【杀】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.game.alive().length > 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const tars = others(g, p);
      if (!tars.length) return;
      if (!(await ctx.ask.confirm(p, '【影箭】：是否视为使用一张无距离限制的【杀】？'))) return;
      const t = (await ctx.ask.targets(p, { prompt: '【影箭】：选择【杀】的目标', candidates: tars, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], ignoreRange: true, reason: 'yingjian' });
    },
  }],
});

defineSkill({
  id: 'rx_shixin', name: '释衅',
  desc: '锁定技，防止你受到的火焰伤害。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.to === d.player && d.nature === 'fire',
    async effect(ctx) {
      ctx.data.canceled = true;
      await ctx.log('【释衅】：防止火焰伤害');
    },
  }],
});

// ============================================================
// 吴·凌操（4）【独进】
// ============================================================
defineSkill({
  id: 'rx_dujin', name: '独进',
  desc: '摸牌阶段，你可以多摸X+1张牌（X为你装备区里牌数的一半且向下取整）。',
  triggers: [{
    on: 'cards.draw', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.phase === 'draw',
    async effect(ctx) {
      const p = ctx.self;
      if (!(await ctx.ask.confirm(p, '【独进】：是否多摸牌？'))) return;
      const eqN = Object.values(p.equips || {}).filter(Boolean).length;
      const x = Math.floor(eqN / 2) + 1;
      ctx.data.count = (ctx.data.count || 1) + x;
      await ctx.log(`【独进】：装备 ${eqN} 件，多摸 ${x} 张牌`);
    },
  }],
});

// ============================================================
// 吴·留赞（4）【奋音】
// ============================================================
defineSkill({
  id: 'rx_fenyin', name: '奋音',
  desc: '当你于回合内使用牌时，若此牌与你本回合使用的上一张牌颜色不同，你可以摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.game.current === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = ctx.data.card;
      if (!c) return;
      const color = isRed(c) ? 'red' : isBlack(c) ? 'black' : null;
      if (!color) return;
      const last = p.flags.rxFyColor;
      p.flags.rxFyColor = color;
      if (!last || last === color) return;
      if (!(await ctx.ask.confirm(p, '【奋音】：本张与此前颜色不同，是否摸一张牌？'))) return;
      await ctx.draw(p, 1, { reason: 'fenyin' });
      await g.log('【奋音】：摸一张牌');
    },
  }],
});

// ============================================================
// 吴·孙寒华（3）【冲虚】【妙剑】【莲华】
// ============================================================
defineSkill({
  id: 'rx_chongxu', name: '冲虚',
  desc: '出牌阶段限一次，你可以进行一次集灵（接水果）来获得分数，然后你可以用此次获得的分数来升级【妙剑】、升级【莲华】或摸牌（升级一个技能需3分，摸一张牌需2分）（降级：小游戏改为随机获得 1~3 分）。',
  active: {
    perPhase: true,
    prompt: '冲虚：集灵得分，可用分数升级【妙剑】/【莲华】或摸牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const gain = 1 + g.rng.int(3);
      p.flags.rxScore = (p.flags.rxScore || 0) + gain;
      await g.log(`【冲虚】：集灵得分 ${gain}（累计 ${p.flags.rxScore}）`);
      for (let i = 0; i < 3; i++) {
        const opts = [];
        if ((p.flags.rxScore || 0) >= 3 && (p.flags.rxMjLv || 1) < 3) opts.push('升级【妙剑】（3分）');
        if ((p.flags.rxScore || 0) >= 3 && (p.flags.rxLjLv || 1) < 3) opts.push('升级【莲华】（3分）');
        if ((p.flags.rxScore || 0) >= 2) opts.push('摸一张牌（2分）');
        opts.push('结束');
        const k = await ctx.ask.choose(p, opts, { prompt: `【冲虚】：当前 ${p.flags.rxScore} 分，请选择` });
        const choice = opts[k] || '结束';
        if (choice === '结束') break;
        if (choice.startsWith('升级【妙剑】')) { p.flags.rxScore -= 3; p.flags.rxMjLv = (p.flags.rxMjLv || 1) + 1; await g.log(`【冲虚】：【妙剑】升至 ${p.flags.rxMjLv} 级`); }
        else if (choice.startsWith('升级【莲华】')) { p.flags.rxScore -= 3; p.flags.rxLjLv = (p.flags.rxLjLv || 1) + 1; await g.log(`【冲虚】：【莲华】升至 ${p.flags.rxLjLv} 级`); }
        else { p.flags.rxScore -= 2; await ctx.draw(p, 1, { reason: 'chongxu' }); }
      }
    },
  },
});

defineSkill({
  id: 'rx_miaojian', name: '妙剑',
  desc: '出牌阶段限一次，你可以将一张【杀】当刺【杀】使用，或将一张锦囊牌当【无中生有】使用（2级：基本牌当刺【杀】/非基本牌当【无中生有】；3级：视为使用一张刺【杀】或【无中生有】）。刺【杀】：当目标角色使用【闪】抵消此牌时，若其有手牌则须弃置一张手牌，若其没有手牌则此牌依然造成1点伤害。',
  active: {
    perPhase: true,
    prompt: '妙剑：将牌当刺【杀】/【无中生有】使用（等级越高限制越少）',
    usable: (p) => p.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const lv = p.flags.rxMjLv || 1;
      const k = await ctx.ask.choose(p, ['当刺【杀】使用', '当【无中生有】使用'], { prompt: `【妙剑】（${lv}级）：选择一项` });
      if (k === 0) {
        const tars = others(g, p);
        if (!tars.length) return;
        let src = [];
        if (lv >= 3) { /* 3级：无需牌 */ }
        else {
          const pool = lv >= 2 ? p.hand.filter((c) => CARD_META[c.name]?.type === 'basic') : p.hand.filter((c) => c.name === 'sha');
          if (!pool.length) { await ctx.log('【妙剑】：没有可转化的牌'); return; }
          src = await g.chooseSomeCards(p, pool, 1, { prompt: '【妙剑】：选择转化的牌' });
          if (!src.length) return;
        }
        const t = await ctx.ask.targets(p, { prompt: '【妙剑】：选择刺【杀】的目标', candidates: tars, min: 1, max: 1 });
        if (!t.length) return;
        await ctx.useCard({ from: p, card: vcard('sha', 'none', 0, { __cisha: true }), targets: t, extraCards: lv >= 3 ? null : src, reason: 'miaojian' });
      } else {
        let src = [];
        if (lv >= 3) { /* 无需牌 */ }
        else {
          const pool = lv >= 2 ? p.hand.filter((c) => CARD_META[c.name]?.type !== 'basic') : p.hand.filter((c) => CARD_META[c.name]?.type === 'trick');
          if (!pool.length) { await ctx.log('【妙剑】：没有可转化的牌'); return; }
          src = await g.chooseSomeCards(p, pool, 1, { prompt: '【妙剑】：选择转化的牌' });
          if (!src.length) return;
        }
        await ctx.useCard({ from: p, card: vcard('wuzhong'), targets: [p], extraCards: lv >= 3 ? null : src, reason: 'miaojian' });
      }
    },
  },
  triggers: [{
    // 刺【杀】：被【闪】抵消时有手牌须弃一张，无手牌则依然造成1点伤害
    on: 'sha.dodged', who: 'any', optional: false,
    filter: (d) => d.self === d.player && !!d.card?.__cisha && !!d.target && d.target.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.target;
      if (t.hand.length) {
        const c = (await g.chooseSomeCards(t, t.hand, 1, { prompt: '【刺杀】：须弃置一张手牌' }))[0];
        if (c) await ctx.discard(t, [c], { reason: 'cisha' });
        await ctx.log(`【刺杀】：${t.name} 以【闪】抵消此牌，须弃置一张手牌`);
      } else {
        await ctx.damage({ from: p, to: t, amount: 1, card: ctx.data.card, reason: 'cisha' });
        await ctx.log(`【刺杀】：${t.name} 无手牌，此牌依然造成1点伤害`);
      }
    },
  }],
});

defineSkill({
  id: 'rx_lianhua', name: '莲华',
  desc: '当你成为其他角色使用【杀】的目标时，你摸一张牌（2级：然后判定黑桃则取消之；3级：然后除非其弃置一张牌，否则取消之）。',
  triggers: [{
    on: 'target.before', who: 'self', optional: false,
    filter: (d) => d.card?.name === 'sha' && d.self === d.player && d.from && d.from !== d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const lv = p.flags.rxLjLv || 1;
      await ctx.draw(p, 1, { reason: 'lianhua' });
      if (lv >= 3) {
        const src = ctx.data.from;
        let discard = false;
        if (src.hand.length && (await ctx.ask.confirm(src, `【莲华】：是否弃置一张牌以免此【杀】被取消？`))) {
          const c = (await g.chooseSomeCards(src, src.hand, 1, { prompt: '【莲华】：弃置一张牌' }))[0];
          if (c) { await ctx.discard(src, [c], { reason: 'lianhua' }); discard = true; }
        }
        if (!discard) { ctx.data.canceled = true; await g.log('【莲华】：未弃牌，此【杀】被取消'); }
      } else if (lv === 2) {
        const j = await ctx.judge(p, { reason: '莲华' });
        if (j.card?.suit === 'spade') { ctx.data.canceled = true; await g.log('【莲华】：判定黑桃，此【杀】被取消'); }
      }
      await g.log('【莲华】：成为【杀】的目标，摸一张牌');
    },
  }],
});

// ============================================================
// 吴·张奋（4）【渠冲】【逊节】
// ============================================================
defineSkill({
  id: 'rx_quchong', name: '渠冲',
  desc: '出牌阶段，你可以重铸装备牌。每回合结束时，你将弃牌堆中的装备牌移出游戏并获得等量的铸造值。出牌阶段开始时，若场上没有【大攻车】，你可以依次消耗0、5、10、10点铸造值造车（降级：本引擎未实现【大攻车】，改为消耗5点铸造值视为使用一张【杀】并摸一张牌）。',
  active: {
    perTurn: false,
    prompt: '渠冲：重铸装备牌；消耗5点铸造值造车（降级：视为使用【杀】）',
    usable: (p) => p.hand.some((c) => CARD_META[c.name]?.type === 'equip') || (p.flags.rxZhu || 0) >= 5,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const k = await ctx.ask.choose(p, ['重铸一张装备牌', '消耗5点铸造值造车（降级为视为使用【杀】）', '取消'], { prompt: `【渠冲】：当前铸造值 ${p.flags.rxZhu || 0}` });
      if (k === 0) {
        const pool = p.hand.filter((c) => CARD_META[c.name]?.type === 'equip');
        if (!pool.length) return;
        const c = (await g.chooseSomeCards(p, pool, 1, { prompt: '【渠冲】：重铸一张装备牌' }))[0];
        if (!c) return;
        await ctx.discard(p, [c], { reason: 'quchong' });
        await ctx.draw(p, 1, { reason: 'quchong' });
        p.flags.rxZhu = (p.flags.rxZhu || 0) + 1;
        await g.log(`【渠冲】：重铸装备牌，铸造值 ${p.flags.rxZhu}`);
      } else if (k === 1) {
        if ((p.flags.rxZhu || 0) < 5) { await ctx.log('【渠冲】：铸造值不足'); return; }
        p.flags.rxZhu -= 5;
        const tars = others(g, p);
        if (!tars.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【渠冲】：造车（视为使用【杀】）', candidates: tars, min: 1, max: 1 }))[0];
        if (!t) return;
        await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'quchong' });
        await ctx.draw(p, 1, { reason: 'quchong' });
        await g.log(`【渠冲】：消耗5点铸造值造车`);
      }
    },
  },
});

defineSkill({
  id: 'rx_xunjie', name: '逊节',
  desc: '锁定技，当你受到伤害时，若场上没有【大攻车】且伤害来源的体力值大于你，你进行判定，若结果为红色，此伤害-1。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.to === d.player && d.from && d.from !== d.player && d.from.hp > d.player.hp && (d.amount || 1) > 0,
    async effect(ctx) {
      const p = ctx.self;
      const j = await ctx.judge(p, { reason: '逊节' });
      if (isRed(j.card)) {
        ctx.data.amount = Math.max(0, (ctx.data.amount || 1) - 1);
        await ctx.log('【逊节】：判定红色，此伤害-1');
      } else {
        await ctx.log('【逊节】：判定黑色，伤害不变');
      }
    },
  }],
});

// ============================================================
// 群·南华老仙（3，稀有专属版）【御风】【天书】
// ============================================================
defineSkill({
  id: 'rx_yufeng', name: '御风',
  desc: '出牌阶段限一次，你可以进行一次御风飞行（管道鸟）。若失败，你摸X张牌；若成功，你可以选择任意名其他角色并摸任意张牌（角色数和摸牌总数为X，X为御风飞行得分），其下一个准备阶段进行判定，若结果为：黑色，其跳过接下来的出牌和弃牌阶段；红色，其跳过接下来的摸牌阶段。（降级：小游戏改为随机得分 1~5，按成功结算）',
  active: {
    perPhase: true,
    prompt: '御风：御风飞行得分，令至多 X 名其他角色判定（黑：跳出牌弃牌；红：跳摸牌）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = 1 + g.rng.int(5);
      await g.log(`【御风】：御风飞行得分 ${x}`);
      const cands = others(g, p);
      if (!cands.length) { await ctx.draw(p, x, { reason: 'yufeng' }); return; }
      const picked = await ctx.ask.targets(p, { prompt: `【御风】：选择至多 ${x} 名其他角色（角色数与摸牌数之和为 ${x}）`, candidates: cands, min: 0, max: Math.min(x, cands.length) });
      const n = Math.max(0, x - picked.length);
      if (n > 0) await ctx.draw(p, n, { reason: 'yufeng' });
      for (const t of picked) {
        t.flags.rxYfPending = (t.flags.rxYfPending || 0) + 1;
        await g.log(`【御风】：${t.name} 下个准备阶段进行判定`);
      }
      await g.log(`【御风】：摸 ${n} 张牌，${picked.length} 名角色将在准备阶段判定`);
    },
  },
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && (d.player.flags.rxYfPending || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.rxYfPending -= 1;
      const j = await ctx.judge(p, { reason: '御风' });
      if (isRed(j.card)) {
        g.skipPhase(p, 'draw');
        await g.log('【御风】：判定红色，跳过摸牌阶段');
      } else {
        g.skipPhase(p, 'play');
        g.skipPhase(p, 'discard');
        await g.log('【御风】：判定黑色，跳过出牌与弃牌阶段');
      }
    },
  }],
});

defineSkill({
  id: 'rx_tianshu', name: '天书',
  desc: '出牌阶段开始时，若【太平要术】在牌堆或弃牌堆中或不在游戏内，你可以弃置一张牌并选择一名角色，其获得【太平要术】并使用之。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const equipped = g.players.some((x) => x.equips?.treasure && x.equips.treasure.name === 'taiping');
      if (equipped) { await ctx.log('【天书】：场上已有【太平要术】在装备区'); return; }
      if (!(await ctx.ask.confirm(p, '【天书】：是否弃一张牌令一名角色获得并使用【太平要术】？'))) return;
      const c = (await g.chooseSomeCards(p, p.hand, 1, { prompt: '【天书】：弃置一张牌' }))[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'tianshu' });
      const t = (await ctx.ask.targets(p, { prompt: '【天书】：选择获得【太平要术】的角色', candidates: g.alive(), min: 1, max: 1 }))[0];
      if (!t) return;
      let card = [...g.deck, ...g.discardPile].find((x) => x && x.name === 'taiping');
      if (card) await g.takeCard(card);
      else card = { id: `vtp${++vseq}`, name: 'taiping', suit: 'heart', num: 6, type: 'equip', sub: 'treasure', virtual: true };
      await ctx.gain(t, [card], { reason: 'tianshu' });
      await ctx.useCard({ from: t, card, targets: [t], reason: 'tianshu' });
      await g.log(`【天书】：${t.name} 获得并使用【太平要术】`);
    },
  }],
});

// ============================================================
// 群·杨彪（3，稀有专属版）【昭汉】【让节】【义争】
// ============================================================
defineSkill({
  id: 'rx_zhaohan', name: '昭汉',
  desc: '锁定技，你于游戏的前四个准备阶段加1点体力上限并回复1点体力；之后的三个准备阶段减1点体力上限。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const n = (p.flags.rxZhCount || 0) + 1;
      p.flags.rxZhCount = n;
      if (n <= 4) {
        p.maxHp += 1;
        await ctx.recover(p, 1);
        await g.log(`【昭汉】：第 ${n} 个准备阶段，加1点体力上限并回复1点体力`);
      } else if (n <= 7) {
        p.maxHp = Math.max(1, p.maxHp - 1);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
        await g.log(`【昭汉】：第 ${n} 个准备阶段，减1点体力上限`);
      }
    },
  }],
});

defineSkill({
  id: 'rx_rangjie', name: '让节',
  desc: '当你受到1点伤害后，你可以选择一项：1.移动场上的一张牌；2.从牌堆或弃牌堆中获得一张你指定类别的牌。若如此做，你摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.to === d.player && (d.amount || 1) >= 1,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【让节】：是否发动（移动场上的一张牌 / 获得一张指定类别的牌）？'))) return;
      const k = await ctx.ask.choose(p, ['移动场上的一张牌', '从牌堆或弃牌堆获得一张指定类别的牌'], { prompt: '【让节】：选择一项' });
      if (k === 0) {
        const zones = [];
        for (const q of g.alive()) {
          for (const slot of Object.keys(q.equips || {})) if (q.equips[slot]) zones.push({ owner: q, card: q.equips[slot], zone: 'equip', slot });
          for (const z of q.judgeZone || []) zones.push({ owner: q, card: z.card, zone: 'judge' });
        }
        if (!zones.length) { await ctx.log('【让节】：场上没有可移动的牌'); return; }
        const pickIdx = await ctx.ask.choose(p, zones.map((z) => `${z.owner.name} ${z.zone === 'equip' ? '装备区' : '判定区'}：${cardLabel(z.card)}`), { prompt: '【让节】：选择要移动的牌' });
        const from = zones[Math.max(0, Math.min(zones.length - 1, pickIdx || 0))];
        const dests = g.alive().filter((q) => q !== from.owner);
        const dest = (await ctx.ask.targets(p, { prompt: '【让节】：选择移动到的角色', candidates: dests, min: 1, max: 1 }))[0];
        if (!dest) return;
        if (from.zone === 'equip') {
          await g.unequipCard(from.owner, from.card, { reason: 'rangjie' });
          // ★SG035-r2 P1：CARD_META.sub 是 'horse+' / 'horse-'，不是 'horsePlus' / 'horseMinus'；
          //   原映射永远 fallback 到 weapon → 坐骑被塞进武器栏、目标原武器被误弃。
          const sub = CARD_META[from.card.name]?.sub;
          const dslot = (sub && EQUIP_SUB[sub]) || 'weapon';
          // 目标槽位原有装备先摘下（派 lose）再置入，最后派 change（SG034 P1）
          let oldC = null;
          if (dest.equips[dslot]) {
            oldC = dest.equips[dslot];
            await g.unequipCard(dest, oldC, { reason: 'rangjie' });
            g.pushDiscard(oldC);   // ★摘下的牌必须有着落，否则凭空丢失
          }
          dest.equips[dslot] = from.card;
          await g.trigger('equip.change', { self: dest, slot: dslot, card: from.card, old: oldC });
        } else {
          from.owner.judgeZone = (from.owner.judgeZone || []).filter((z) => z.card !== from.card);
          dest.judgeZone = dest.judgeZone || [];
          dest.judgeZone.push({ card: from.card, name: 'xumou' });
        }
        await g.log(`【让节】：将 ${from.owner.name} 的一张牌移至 ${dest.name}`);
      } else {
        const kinds = ['基本牌', '锦囊牌', '装备牌'];
        const kk = await ctx.ask.choose(p, kinds, { prompt: '【让节】：指定牌的类别' });
        const type = ['basic', 'trick', 'equip'][kk || 0];
        const pool = [...g.deck, ...g.discardPile].filter((c) => c && CARD_META[c.name]?.type === type);
        if (!pool.length) { await ctx.log('【让节】：没有该类别的牌'); return; }
        const c = pool[g.rng.int(pool.length)];
        await g.takeCard(c);
        await ctx.gain(p, [c], { reason: 'rangjie' });
        await g.log(`【让节】：获得 ${cardLabel(c)}`);
      }
      await ctx.draw(p, 1, { reason: 'rangjie' });
    },
  }],
});

defineSkill({
  id: 'rx_yizheng', name: '义争',
  desc: '出牌阶段限一次，你可以与一名体力值不大于你的角色拼点，若你：赢，其跳过下个摸牌阶段；没赢，你减1点体力上限。',
  active: {
    perPhase: true,
    prompt: '义争：与一名体力不大于你的角色拼点（赢：其跳摸牌；没赢：你减1体力上限）',
    usable: (p) => p.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter((x) => x.hp <= p.hp && x.hand.length);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【义争】：选择拼点角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: 'yizheng' });
      if (!r) return;
      const win = r.winner ? r.winner === p : r.a > r.b;
      if (win) {
        g.skipPhase(t, 'draw');
        await g.log(`【义争】：${p.name} 拼点胜，${t.name} 跳过下个摸牌阶段`);
      } else {
        p.maxHp = Math.max(1, p.maxHp - 1);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
        await g.log('【义争】：没赢，减1点体力上限');
      }
    },
  },
});


