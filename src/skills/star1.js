// 星将技能 · 第一批：星·吕蒙 / 星·孙权 / 星·华雄 / 星·曹丕 / 星·贾诩 / 星·赵云
// 手写稿里大量「持恒技」按「锁定 / 不可取消」处理；超出状态机的机制做可玩近似，简化说明写在各 desc 末尾。
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

const roundOf = (g) => g.round ?? 0;
// 每轮限一次记账（引擎的 round 计数在 round.begin 里自增）
function onceRound(p, g, key) {
  const k = `r_${key}`;
  if (p.flags[k] === roundOf(g)) return false;
  p.flags[k] = roundOf(g);
  return true;
}
let vseq = 0;
const vcard = (name, suit = 'none', num = 0) => ({ id: `vst${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true });
const maxOtherHand = (g, p) => Math.max(0, ...g.alive().filter(x => x !== p).map(x => x.hand.length));

// ==================== 星·吕蒙 ====================
// 【生息】锁定技：手牌不是全场最多且不到上限时摸一张
async function shengyiTick(ctx) {
  const p = ctx.self, g = ctx.game;
  if (p.flags.shengyiBusy) return;                        // 重入保护（摸牌本身会触发 hand.change）
  const cap = p.hp + (p.flags.handLimit || 0);
  if (p.hand.length >= cap) return;
  if (p.hand.length >= maxOtherHand(g, p) && g.alive().length > 1) return;
  p.flags.shengyiBusy = true;
  try {
    await ctx.log(`【生息】：${p.name} 手牌 ${p.hand.length} 张少于全场最多，摸一张牌`);
    await ctx.draw(p, 1, { reason: 'shengyi' });
  } finally { p.flags.shengyiBusy = false; }
}
defineSkill({
  id: 'shengyi', name: '生息',
  desc: '锁定技，若你的手牌数不是全场最多且未达到手牌上限，你摸一张牌。',
  triggers: [
    { on: 'turn.begin', who: 'self', optional: false, async effect(ctx) { ctx.self.flags.shengyiCount = 0; await shengyiTick(ctx); } },
    { on: 'hand.change', who: 'self', optional: false, async effect(ctx) { await shengyiTick(ctx); } },
  ],
});

// 【攻天】出牌阶段限一次：展示牌堆顶 X 张（X=场上角色数），弃任意张手牌，等量张牌分给任意角色，摸等于分配角色数的牌
defineSkill({
  id: 'gongtian', name: '攻天',
  desc: '出牌阶段限一次，你展示牌堆顶的 X 张牌（X 为场上角色数），然后你可以弃置任意张手牌，将至多等量的展示牌分配给任意角色，然后你摸等于分配角色数的牌。',
  active: {
    perPhase: true,
    prompt: '展示牌堆顶的牌并分配',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const X = Math.max(1, g.alive().length);
      const shown = g.popDeck(X);
      const unassigned = [...shown];
      try {
        await ctx.log(`【攻天】：展示牌堆顶 ${shown.length} 张：${shown.map(c => cardLabel(c)).join('、')}`);
        const res = await g.ask(p, 'cards', {
          prompt: `【攻天】：可弃置任意张手牌（可用 ${shown.length} 张展示牌做分配）`,
          cards: p.hand.map(c => c.id), min: 0, max: p.hand.length, optional: true,
        });
        const given = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
        if (given.length) await ctx.discard(p, given, { reason: 'gongtian' });
        const quota = Math.min(given.length, shown.length);
        const got = new Set();
        for (let i = 0; i < quota; i++) {
          const card = shown[i];
          if (!unassigned.includes(card)) continue;
          const ts = await g.chooseTargets(p, {
            min: 1, max: 1, candidates: g.alive(),
            prompt: `【攻天】：把 ${cardLabel(card)} 交给谁？（取消＝留在弃牌堆）`,
          });
          if (!ts.length) break;
          const t = ts[0];
          await ctx.gain(t, [card], { reason: 'gongtian' });
          unassigned.splice(unassigned.indexOf(card), 1);
          got.add(t.id);
        }
        if (got.size) {
          await ctx.draw(p, got.size, { reason: 'gongtian' });
          await ctx.log(`【攻天】：已分配 ${got.size} 名角色，${p.name} 摸 ${got.size} 张牌`);
        }
      } finally {
        if (unassigned.length) g.pushDiscard(unassigned);
      }
    },
  },
});

// 【离心】每轮限一次：指定一名角色，在你更改之前，其单次造成的伤害至多为 1
defineSkill({
  id: 'lixin', name: '离心',
  desc: '每轮限一次，你可以选择一名角色，在你更改之前，其单次造成的伤害至多为 1，且其不能使用延时类锦囊牌。',
  active: {
    prompt: '限制一名角色单次伤害至多 1 点',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!onceRound(p, g, 'lixin')) { await ctx.log('【离心】：本轮已发动过'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive(), prompt: '【离心】：选择一名角色（其单次伤害至多 1）' });
      if (!ts.length) return;
      p.marks.lixin = ts[0].id;
      await ctx.log(`【离心】：${p.name} 使 ${ts[0].name} 的单次伤害至多为 1 点`);
    },
  },
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => !!d.player?.marks?.lixin && d.from?.id === d.player.marks.lixin && (d.amount || 0) > 1,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.log(`【离心】：${ctx.data.from?.name} 的单次伤害降至 1 点`);
      ctx.data.amount = 1;
      p.marks.lixin = null;
    },
  }],
});

// ==================== 星·孙权 ====================
// 【平准】其他角色摸牌时判定，黑色则重铸一张牌，然后可以视为使用一张牌（简化为摸一张）
defineSkill({
  id: 'pingzhun', name: '平准',
  desc: '当有其他角色摸牌时，你可以判定：若为黑色，你可以重铸一张牌，若成功，你可以视为使用或打出 1 张牌。（实现：重铸后额外摸一张代表「视为使用」；每回合限一次）',
  triggers: [{
    on: 'cards.draw', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && d.player?.alive,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.pingzhunTurn === g.turnCount) return;
      p.flags.pingzhunTurn = g.turnCount;
      const jd = await ctx.judge(p, { reason: 'pingzhun' });
      await ctx.log(`【平准】：判定 ${cardLabel(jd.card)} → ${jd.suit === 'spade' || jd.suit === 'club' ? '黑色' : '红色'}`);
      if (!(jd.suit === 'spade' || jd.suit === 'club')) return;
      if (!p.hand.length) return;
      const res = await g.ask(p, 'cards', { prompt: '【平准】：选择一张手牌重铸', cards: p.hand.map(c => c.id), min: 1, max: 1 });
      const c = (res?.cardIds || []).map(id => p.hand.find(x => x.id === id)).filter(Boolean)[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'pingzhun' });
      await ctx.draw(p, 2, { reason: 'pingzhun' });
      await ctx.log('【平准】：重铸成功，视为使用 1 张牌（本实现按摸 1 张结算）');
    },
  }],
});

// 【制霸】出牌阶段限一次：给一名角色两张牌；对方不返还两张花色不同的牌则翻面、视为被使用杀、你摸一张
defineSkill({
  id: 'star_zhiba', name: '制霸',
  desc: '出牌阶段限一次，你可以交给一名角色两张牌，然后该角色可以返还两张花色与你给出的牌均不同的牌；否则其翻面，视为你对其使用一张无距离与次数限制的【杀】，然后你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '给一名角色两张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.hand.length < 2) { await ctx.log('【制霸】：手牌不足两张'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【制霸】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const res = await g.ask(p, 'cards', { prompt: '【制霸】：选择交给对方的两张牌', cards: p.hand.map(c => c.id), min: 2, max: 2 });
      const given = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean).slice(0, 2);
      if (given.length < 2) return;
      const suits = given.map(c => c.suit);
      await ctx.gain(t, given, { from: p, reason: 'zhiba' });
      await ctx.log(`【制霸】：${p.name} 交给 ${t.name} 两张牌`);
      let back = false;
      if (t.hand.length >= 2) {
        const yes = await g.confirm(t, `【制霸】：是否返还两张花色均不同于「${suits.map(s => ({ spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[s] || s)).join('')}」的牌？`);
        if (yes) {
          const r2 = await g.ask(t, 'cards', { prompt: '【制霸】：选择两张返还的牌', cards: t.hand.map(c => c.id), min: 2, max: 2 });
          const ret = (r2?.cardIds || []).map(id => t.hand.find(c => c.id === id)).filter(Boolean).slice(0, 2);
          if (ret.length === 2 && ret.every(c => !suits.includes(c.suit))) {
            await ctx.gain(p, ret, { from: t, reason: 'zhiba' });
            back = true;
            await ctx.log(`【制霸】：${t.name} 返还两张不同花色的牌，${p.name} 摸一张牌`);
            await ctx.draw(p, 1, { reason: 'zhiba' });
          }
        }
      }
      if (!back) {
        await ctx.flip(t);
        await ctx.log(`【制霸】：${t.name} 未返还合格牌，翻面并受到 ${p.name} 使用的一张无距离与次数限制的【杀】`);
        await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'zhiba', ignoreRange: true, ignoreShaLimit: true });
        await ctx.draw(p, 1, { reason: 'zhiba' });
      }
    },
  },
});

// 【权定】锁定技：有人响应了你使用的牌时你摸一张
defineSkill({
  id: 'quanding', name: '权定',
  desc: '锁定技，当有角色响应了你使用的牌时，你摸一张牌。',
  triggers: [{
    on: 'sha.dodged', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.quandingTurn === ctx.game.turnCount) return;   // 每回合限一次，防连锁刷牌
      p.flags.quandingTurn = ctx.game.turnCount;
      await ctx.log('【权定】：你的牌被响应，摸一张牌');
      await ctx.draw(p, 1, { reason: 'quanding' });
    },
  }],
});

// ==================== 星·华雄 ====================
// 【善战】你用牌被响应时获得 1 点【勇】；勇达到 2 后你的【杀】不可被【闪】响应（近似「须以更高点数响应」）
defineSkill({
  id: 'shanzhan', name: '善战',
  desc: '持恒技，当你使用的牌被响应时，你获得 1 点【勇】。你使用的牌只能用点数至少高于你使用牌 X 点的牌响应（X 为【勇】数），且不能被转化或虚拟牌响应。（实现：勇≥2 时你的【杀】不可被【闪】响应）',
  triggers: [
    {
      on: 'sha.dodged', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        p.marks.yong = (p.marks.yong || 0) + 1;
        await ctx.log(`【善战】：${p.name} 获得 1 点【勇】（当前 ${p.marks.yong}）`);
      },
    },
    {
      // card.use.before 的 data 就是 useData 本身（没有 data.useData 这一层）
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.card?.name === 'sha' || d.asName === 'sha',
      effect(ctx) {
        const p = ctx.self;
        if ((p.marks.yong || 0) >= 2) ctx.data.unavoidable = true;
      },
    },
  ],
});

// 【温酒】酒饮用者对你使用的【杀】无距离限制且不可被响应
defineSkill({
  id: 'wenjiu', name: '温酒',
  desc: '当有角色因【酒】的效果对你使用【杀】时，该【杀】无距离限制且不可被响应。',
  triggers: [{
    on: 'card.use.before', who: 'any', optional: false,
    filter: (d) => {
      if (!(d.card?.name === 'sha' || d.asName === 'sha')) return false;
      if (!d.self || d.self === d.player) return false;                  // 只看别人使用的【杀】
      if (!(d.self.flags?.jiuUsed)) return false;                       // 该角色本回合饮用过【酒】
      return Array.isArray(d.targets) && d.targets.includes(d.player);  // 且目标包含我
    },
    effect(ctx) {
      ctx.data.unavoidable = true;
      ctx.data.ignoreRange = true;
    },
  }],
});

// ==================== 星·曹丕 ====================
// 【称帝】限定技：弃置所有手牌（至少四张），获得【帝星】
defineSkill({
  id: 'chengdi', name: '称帝',
  desc: '限定技，出牌阶段，你可以弃置所有手牌（至少四张），获得技能【帝星】。',
  active: {
    prompt: '弃置全部手牌获得【帝星】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.marks.dixing) { await ctx.log('【称帝】：已获得【帝星】'); return; }
      if (p.hand.length < 4) { await ctx.log('【称帝】：手牌不足四张'); return; }
      const yes = await ctx.ask.confirm(p, `【称帝】：弃置全部 ${p.hand.length} 张手牌，获得【帝星】？`);
      if (!yes) return;
      await ctx.discard(p, [...p.hand], { reason: 'chengdi' });
      p.marks.dixing = true;
      p.marks.longyu = 4;
      await ctx.log(`【称帝】：${p.name} 弃置全部手牌，获得【帝星】（龙谕 ${p.marks.longyu}）`);
    },
  },
});

// 【帝星】锁定：跳过摸牌与弃牌阶段；每回合开始获得 4 点龙谕（上限 4）；获得手牌时销毁并 +1 龙谕；消耗龙谕视为使用牌
defineSkill({
  id: 'dixing', name: '帝星',
  desc: '持恒技、锁定技，你跳过摸牌阶段与弃牌阶段；每回合开始时获得 4 点龙谕（上限 4）；当你获得手牌时，销毁这些牌并改为获得等量龙谕（无上限）；你可以消耗 1 点龙谕查看牌堆顶一张牌（本实现：摸一张牌），或消耗 2 点龙谕视为使用一张非锦囊牌（本实现：对一名角色造成 1 点伤害）。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        if (!p.marks.dixing) return;
        p.marks.longyu = Math.min(4, (p.marks.longyu || 0) + 4);
        await ctx.log(`【帝星】：${p.name} 获得龙谕（当前 ${p.marks.longyu}）`);
      },
    },
    {
      // 跳过摸牌与弃牌阶段：runTurn 在阶段循环开始前检查 skip_ 标记，故必须在 turn.begin 里置位
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => !!d.player?.marks?.dixing,
      async effect(ctx) {
        const p = ctx.self;
        ctx.skipPhase(p, 'draw');
        ctx.skipPhase(p, 'discard');
        await ctx.log('【帝星】：跳过摸牌阶段与弃牌阶段');
      },
    },
    {
      // 获得手牌 → 销毁换龙谕
      on: 'cards.gain', who: 'self', optional: false,
      filter: (d) => !!d.player?.marks?.dixing && Array.isArray(d.cards) && d.cards.length > 0 && d.reason !== 'dixing',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cards = (ctx.data.cards || []).filter(c => p.hand.includes(c));
        if (!cards.length) return;
        for (const c of cards) {
          const i = p.hand.indexOf(c);
          if (i >= 0) p.hand.splice(i, 1);
        }
        g.exileCards(cards);            // 销毁＝移出游戏并记账（保证牌张守恒）
        p.marks.longyu = (p.marks.longyu || 0) + cards.length;
        await ctx.log(`【帝星】：销毁 ${cards.length} 张牌，龙谕增至 ${p.marks.longyu}`);
      },
    },
  ],
  active: {
    prompt: '消耗龙谕：1 点摸一张牌 / 2 点造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const n = p.marks.longyu || 0;
      if (!p.marks.dixing || n < 1) { await ctx.log('【帝星】：龙谕不足'); return; }
      const opts = [];
      if (n >= 1) opts.push('消耗 1 点龙谕：摸一张牌');
      if (n >= 2) opts.push('消耗 2 点龙谕：视为使用一张非锦囊牌（对一名角色造成 1 点伤害）');
      const idx = await ctx.ask.choose(p, opts, { prompt: '【帝星】：选择一项' });
      if (idx === 0) {
        p.marks.longyu = n - 1;
        await ctx.draw(p, 1, { reason: 'dixing' });
        await ctx.log('【帝星】：查看牌堆顶一张牌（按摸一张结算）');
      } else if (idx === 1) {
        const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【帝星】：选择一名角色造成 1 点伤害' });
        if (!ts.length) return;
        p.marks.longyu = n - 2;
        await ctx.damage({ from: p, to: ts[0], amount: 1, nature: 'normal', card: null, reason: 'dixing' });
      }
    },
  },
});

// ==================== 星·贾诩 ====================
// 【深谋】损失体力时从伤害来源获得一张牌，并可将其当【杀】打出；造成伤害后回复（简化）
defineSkill({
  id: 'shenmou', name: '深谋',
  desc: '当你损失体力时，你可以从伤害来源处获得一张牌，然后你可以将其视为【杀】对其使用；你可以打出一张【借力杀人】（视为【杀】），然后回复 1 点体力。（实现：每回合限一次获得牌；用于打出后按 1 点伤害结算）',
  active: {
    prompt: '打出【借力杀人】（视为【杀】）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!onceRound(p, g, 'shenmou')) { await ctx.log('【深谋】：本轮已发动过'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【深谋】：选择【借力杀人】的目标' });
      if (!ts.length) return;
      await ctx.log(`【深谋】：${p.name} 对 ${ts[0].name} 打出【借力杀人】（视为【杀】）`);
      await ctx.damage({ from: p, to: ts[0], amount: 1, nature: 'normal', card: null, reason: 'shenmou' });
      await ctx.recover(p, 1, { reason: 'shenmou' });
    },
  },
  triggers: [{
    on: 'hp.lose', who: 'self', optional: true,
    filter: (d) => !!d.player && d.player.alive && !!d.from && d.from !== d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.shenmouTurn === g.turnCount) return;
      const from = ctx.data.from;
      const src = [_pickFree(from)].filter(Boolean)[0];
      if (!src) return;
      p.flags.shenmouTurn = g.turnCount;
      await ctx.gain(p, [src], { from, reason: 'shenmou' });
      await ctx.log(`【深谋】：${p.name} 从 ${from.name} 处获得一张牌（视为【借力杀人】，可在出牌阶段打出）`);
    },
  }],
});

function _pickFree(target) {
  // 优先拿装备区/判定区的公开牌（不偷看手牌）
  const eq = Object.values(target.equips || {}).filter(Boolean);
  if (eq.length) return eq[0];
  return target.hand[0] || null;
}

// 【远虑】锁定：濒死时回复至少到 1；手牌上限始终为 4
defineSkill({
  id: 'yuanlv', name: '远虑',
  desc: '锁定技，当你处于濒死状态时，任何回复效果至少将你回复至 1 点体力；你的手牌上限始终为 4。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.handLimit = Math.max(0, 4 - p.hp);   // 引擎口径：手牌上限 = 体力 + handLimit
    },
  }, {
    on: 'dying.begin', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self;
      if (p.hp >= 1) return;
      // 由「其他回复效果」处理为主；这里只给一次保底（每轮限一次，避免无限救）
      if (!onceRound(p, ctx.game, 'yuanlv')) return;
      await ctx.log(`【远虑】：${p.name} 濒死时保底回复至 1 点体力`);
      p.hp = 1;
    },
  }],
});

// 【记恨】每轮选一人；其轮次内摸牌数超过体力上限 4 倍时，令其失去等于体力上限的体力并计数减半
defineSkill({
  id: 'jihen', name: '记恨',
  desc: '每轮限一次，你可以选择一名角色。若其回合内摸牌总数超过了其体力上限的四倍，你令其失去等于其体力上限的体力，并将此计数减半。',
  active: {
    prompt: '记恨一名角色',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!onceRound(p, g, 'jihen')) { await ctx.log('【记恨】：本轮已发动过'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【记恨】：选择一名角色（其摸牌超量时受罚）' });
      if (!ts.length) return;
      p.marks.jihen = { id: ts[0].id, n: 0 };
      await ctx.log(`【记恨】：${p.name} 记恨 ${ts[0].name}`);
    },
  },
  triggers: [{
    on: 'cards.draw', who: 'any', optional: false,
    filter: (d) => {
      const mark = d.player?.marks?.jihen;
      return !!mark && d.self?.id === mark.id;
    },
    async effect(ctx) {
      const owner = ctx.self, g = ctx.game;
      const t = g.byId(owner.marks.jihen.id);
      if (!t || !t.alive) { owner.marks.jihen = null; return; }
      const n = (owner.marks.jihen.n || 0) + (ctx.data.count || ctx.data.cards?.length || 1);
      owner.marks.jihen.n = n;
      if (n <= 4 * t.maxHp) return;
      owner.marks.jihen.n = Math.floor(n / 2);
      await ctx.log(`【记恨】：${t.name} 摸牌超过体力上限四倍，失去 ${t.maxHp} 点体力`);
      await ctx.loseHp(t, t.maxHp, { reason: 'jihen', from: owner });
    },
  }],
});

// ==================== 星·赵云 ====================
// 【龙吟】出牌阶段限一次：扣置一张基本牌为【龙吟】牌并获得等于当前体力的龙威；可消耗 1 点龙威视为使用龙吟牌
defineSkill({
  id: 'star_longyin', name: '龙吟',
  desc: '出牌阶段限一次，你可以将一张基本牌扣置于场上，弃置原有的【龙吟】牌，并获得至多等于你当前体力值的【龙威】。你可以随时消耗 1 点【龙威】，展示牌堆顶的两张牌，视为使用或打出【龙吟】牌。（实现：消耗龙威时把龙吟牌当【杀】使用）',
  active: {
    prompt: '扣置基本牌为【龙吟】牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const basics = p.hand.filter(c => c.type === 'basic');
      if (!basics.length) { await ctx.log('【龙吟】：没有基本牌'); return; }
      const res = await g.ask(p, 'cards', { prompt: '【龙吟】：选择一张基本牌扣置', cards: basics.map(c => c.id), min: 1, max: 1 });
      const c = (res?.cardIds || []).map(id => basics.find(x => x.id === id)).filter(Boolean)[0];
      if (!c) return;
      // 旧的龙吟牌进弃牌堆（从扣置区取回后正常弃置）
      if (p.flags.longyinCard) {
        const old = p.flags.longyinCard;
        const k = (g.exilePile || []).indexOf(old);
        if (k >= 0) g.exilePile.splice(k, 1);
        g.pushDiscard([old]);
      }
      const i = p.hand.indexOf(c);
      if (i >= 0) p.hand.splice(i, 1);
      // 「扣置在场上」不在引擎的常规区域里，必须显式记账（exile 区），否则牌会凭空消失
      g.exileCards([c]);
      p.flags.longyinCard = c;
      p.marks.longwei = Math.min(p.hp, (p.marks.longwei || 0) + p.hp);
      await ctx.log(`【龙吟】：${p.name} 扣置 ${cardLabel(c)} 为【龙吟】牌，龙威 ${p.marks.longwei}`);
    },
  },
  triggers: [{
    on: 'turn.end', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self;
      p.marks.longwei = 0;
    },
  }],
});

// 【龙吟·出牌】消耗 1 点龙威：把龙吟牌当【杀】使用（不受距离与次数限制）
// 说明：龙吟牌扣置在 exile 区（记账），这里先取回再按【杀】结算，保证牌张守恒
defineSkill({
  id: 'star_longyin_use', name: '龙吟·出牌',
  desc: '消耗 1 点【龙威】，将【龙吟】牌当【杀】使用（无距离与次数限制）。',
  active: {
    prompt: '消耗龙威：龙吟牌当【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const card = p.flags.longyinCard;
      if (!card) { await ctx.log('【龙吟】：还没有扣置的【龙吟】牌'); return; }
      if ((p.marks.longwei || 0) < 1) { await ctx.log('【龙吟】：龙威不足'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【龙吟】：选择【杀】的目标' });
      if (!ts.length) return;
      const t = ts[0];
      p.marks.longwei -= 1;
      const k = (g.exilePile || []).indexOf(card);
      if (k >= 0) g.exilePile.splice(k, 1);
      g.pushDiscard([card]);
      p.flags.longyinCard = null;
      await ctx.log(`【龙吟】：消耗 1 点龙威，龙吟牌 ${cardLabel(card)} 当【杀】对 ${t.name} 使用（龙威剩 ${p.marks.longwei}）`);
      await ctx.damage({ from: p, to: t, amount: 1, card, reason: 'star_longyin_use' });
    },
  },
});

// 【游龙】锁定：与所有角色距离视为 1
defineSkill({
  id: 'youlong', name: '游龙',
  desc: '锁定技，你与其他角色的距离总视为 1；当你因此使用或打出了本不符合距离条件的牌时，你摸一张牌。',
  triggers: [{
    // distance.calc 的 data.self 是距离计算起点（from），who:'self' 即「我发起距离计算」
    on: 'distance.calc', who: 'self', optional: false,
    effect(ctx) { ctx.data.value = 1; },     // 与其他角色的距离恒视为 1
  }],
});
