// 阶段 6B · 谋·增补 6 将（pack = 'mou5'，PACK_CN = 「谋·增补」）技能实现
// ---------------------------------------------------------------------------
// 谋司马懿【权谋】【平辽】  谋夏侯惇【刚烈】【清俭】  谋徐盛【破军】【疑城】
// 谋甘宁【奇袭】【奋威】    谋张角【雷击】【鬼道】    谋董卓【凶逆】【封赏】
//
// 技能 id 一律使用 m5_ 前缀（不使用 jie_/mou_/ji_/shen_/sp_/ol_，避免被引擎静默降级别名）。
// 技能名允许与既有武将重名（谋将本就是同一人的重做版），id 全部唯一。
//
// ★★ 资料核实与简化口径清单（desc 一律写成「本实现实际效果」）★★
//  1. 谋司马懿【权谋】【平辽】：十周年「谋定天下」谋司马懿（魏 3 体力，称号「韬谋韫势」）。
//     【权谋】完整实现「阳/阴」转换：阳=交牌并防止你本阶段下次对其造成的伤害；阴=交牌且你本阶段
//     下次对其造成伤害后可对除其以外至多三名其他角色各造成 1 点伤害（每名角色每阶段限一次）。
//     【平辽】官方要求「不公开指定目标 + 攻击范围内其他角色依次选择是否打出红色基本牌」，本实现
//     收窄为「攻击范围内除目标外的其他角色依次可打出一张红色基本牌；有 1~2 人打出则你摸 1~2 张牌
//     且本阶段【杀】次数 +1；无人打出则此【杀】的目标本回合不能使用或打出手牌」（用引擎既有的
//     xiongluanBan 出口），「不公开目标」因引擎无隐藏目标机制而不实现。
//  2. 谋夏侯惇【刚烈】【清俭】：三国杀移动版 / 谋攻篇（魏 4 体力）。【刚烈】按官方改为主动技
//     「出牌阶段限一次，选择任意名本局对你造成过伤害的角色，各造成 2 点伤害（每局每名角色限一次）」。
//     【清俭】：官方为「牌不因使用而进入弃牌堆时置于武将牌上（上限 体力值-1，至少 1），出牌阶段结束
//     时分配」。引擎的 cards.discard 事件在牌离开原区域**之前**触发，故实现为「先打标记、出牌阶段结束
//     时再从弃牌堆取走分配」（牌会在弃牌堆短暂存在，属引擎时序导致的口径收窄）。
//  3. 谋徐盛【破军】【疑城】：移动版谋徐盛（吴 4 体力）。【破军】「扣置至多 X 张牌，当前回合结束后归还」
//     用 t.flags.m5Kou 暂存 + 回合结束时归还实现；伤害 +1 的两条件按官方保留。
//  4. 谋甘宁【奇袭】【奋威】：官网 sanguosha.cn hero-detail-513（吴 4 体力）。【奇袭】简化为
//     「令其依次猜测花色（每种一次，至多两次），每猜错一次你弃置其区域内一张牌；全对则你展示手牌」；
//     【奋威】限定技与「威」的取消目标完整实现（target.before + data.canceled）。
//  5. 谋张角【雷击】【鬼道】：移动版谋张角（群 3 体力，称号「驱雷掣电」）。「道兵」标记用 flags.m5Db：
//     游戏开始 2 个（上限 8）；一名角色受到属性伤害后 +1；受到伤害时可弃 2 个防止此伤害；回合外以此法
//     弃置后本回合不能再获得。【雷击】出牌阶段不限次数，弃 4 个「道兵」造成 1 点雷电伤害。
//  6. 谋董卓【凶逆】【封赏】：三国杀OL 谋董卓（群，技能 观变/凶逆/封赏/执柄）。本包只实装【凶逆】【封赏】；
//     【观变】（首轮距离/手牌上限加成）与主公技【执柄】不实现。【封赏】的「本回合弃牌堆」用
//     flags.m5FsPool 追踪（回合开始清空），「每轮每花色限一次」简化为每回合一次。
//     体力值 8 沿用标准董卓（谋董卓官方体力未核实，标为「未核实」）。
// ---------------------------------------------------------------------------
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';

// ------------------------------ 公用小工具 ------------------------------
let vseq = 0;
const vcard = (name, extra = {}) => ({
  id: `vmou5_${++vseq}`, name, suit: 'none', num: 0,
  type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const isRedC = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const typeOf = (c) => (c ? CARD_META[c.name]?.type : null);
const isDelayed = (c) => !!(c && CARD_META[c.name]?.delayed);
const zonesOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card).filter(Boolean)),
];
const equipsOf = (p) => Object.values(p?.equips || {}).filter(Boolean);
const others = (g, p) => g.alive().filter(x => x !== p);
const handMax = (g) => Math.max(...g.alive().map(x => x.hand.length));
// 从一个角色的区域里取走牌（不进入弃牌堆，用于「置于武将牌上 / 扣置」）
// ★async：装备区摘牌要走 g.unequipCard 派发 equip.lose（SG033 P0-2），否则监听者不刷新
async function pluckCards(t, cards, g) {
  for (const c of cards) {
    const i = t.hand.indexOf(c);
    if (i >= 0) { t.hand.splice(i, 1); continue; }
    if (g) await g.unequipCard(t, c, { reason: 'pluck' });
    // 兜底分支（调用方未传 g 时）：正常路径都传 g，会走 unequipCard 派发 equip.lose
    else for (const k of Object.keys(t.equips || {})) if (t.equips[k] === c) t.equips[k] = null;
    const j = (t.judgeZone || []).findIndex(z => z.card === c);
    if (j >= 0) t.judgeZone.splice(j, 1);
  }
}
const takeFromDiscard = (g, c) => {
  const i = g.discardPile.indexOf(c);
  if (i >= 0) g.discardPile.splice(i, 1);
  return c;
};
const SUITS = ['spade', 'heart', 'club', 'diamond'];

// ============================================================
// 谋司马懿 · 权谋 / 平辽
// ============================================================
// 权谋：转换技，出牌阶段每名角色限一次，令攻击范围内一名其他角色交给你一张牌。
//       阳：防止你本阶段下次对其造成的伤害；阴：本阶段你下次对其造成伤害后，可对至多三名其他角色各造成 1 点伤害。
defineSkill({
  id: 'm5_quanmou', name: '权谋',
  desc: '转换技，出牌阶段每名角色限一次，你可以令攻击范围内的一名其他角色交给你一张牌。'
    + '阳：防止你本阶段下次对其造成的伤害；阴：本阶段你下次对其造成伤害后，你可以对除其以外的至多三名其他角色各造成 1 点伤害。',
  active: {
    prompt: '（阳/阴 转换）令攻击范围内一名其他角色交给你一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.m5QmTurn !== g.turnCount) { p.flags.m5QmTurn = g.turnCount; p.flags.m5QmUsed = []; }
      const used = p.flags.m5QmUsed || [];
      const cands = others(g, p).filter(x => g.inAttackRange(p, x) && zonesOf(x).length > 0 && !used.includes(x.seat));
      if (!cands.length) {
        await ctx.log('【权谋】：攻击范围内没有本阶段未交出过牌的其他角色');
        return;
      }
      const ts = await ctx.ask.targets(p, {
        prompt: '【权谋】：选择攻击范围内的一名其他角色', candidates: cands, min: 1, max: 1, reason: 'quanmou',
      });
      const t = ts[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(t, zonesOf(t), 1, { prompt: `【权谋】：交给 ${p.name} 一张牌` });
      const c = picks[0];
      if (!c) { await ctx.log(`【权谋】：${t.name} 未交出牌，发动取消`); return; }
      await ctx.gain(p, [c], { from: t, reason: 'quanmou' });
      used.push(t.seat);
      p.flags.m5QmUsed = used;
      const yin = p.flags.m5QmYin === true;
      // 「本阶段」用 turnCount:phase 定界（原实现只比 turnCount，出牌阶段结束后同回合内的伤害仍会生效）。
      // 待生效目标用数组而非单槽：同阶段可对多个不同角色各发动一次，单槽会让前一个承诺静默丢失。
      const pk = `${g.turnCount}:${g.phase}`;
      if (!yin) {
        if (p.flags.m5QmYangKey !== pk) { p.flags.m5QmYangKey = pk; p.flags.m5QmYangSeats = []; }
        p.flags.m5QmYangSeats = [...(p.flags.m5QmYangSeats || []), t.seat];
        await ctx.log(`【权谋】·阳：${t.name} 交出 ${cardLabel(c)}；防止你本阶段下次对其造成的伤害`);
      } else {
        if (p.flags.m5QmYinKey !== pk) { p.flags.m5QmYinKey = pk; p.flags.m5QmYinSeats = []; }
        p.flags.m5QmYinSeats = [...(p.flags.m5QmYinSeats || []), t.seat];
        await ctx.log(`【权谋】·阴：${t.name} 交出 ${cardLabel(c)}；你本阶段下次对其造成伤害后可波及至多三名其他角色`);
      }
      p.flags.m5QmYin = !yin;
    },
  },
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) { ctx.self.flags.m5QmUsed = []; },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.self !== d.player
        && d.player.flags.m5QmYangKey === `${d.game.turnCount}:${d.game.phase}`
        && (d.player.flags.m5QmYangSeats || []).includes(d.self.seat),
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.self;
        ctx.data.canceled = true;
        p.flags.m5QmYangSeats = (p.flags.m5QmYangSeats || []).filter(s => s !== t.seat);
        await ctx.log(`【权谋】·阳：防止对 ${t.name} 的伤害`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.self !== d.player
        && d.player.flags.m5QmYinKey === `${d.game.turnCount}:${d.game.phase}`
        && (d.player.flags.m5QmYinSeats || []).includes(d.self.seat),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, v = ctx.data.self;
        p.flags.m5QmYinSeats = (p.flags.m5QmYinSeats || []).filter(s => s !== v.seat);
        const cands = others(g, p).filter(x => x !== v);
        if (!cands.length) return;
        const ts = await ctx.ask.targets(p, {
          prompt: `【权谋】·阴：可对除 ${v.name} 以外的至多三名其他角色各造成 1 点伤害`,
          candidates: cands, min: 0, max: 3, reason: 'quanmou',
        });
        for (const t of ts.slice(0, 3)) {
          if (!t.alive) continue;
          await ctx.damage({ from: p, to: t, amount: 1, reason: 'quanmou' });
          await ctx.log(`【权谋】·阴：${t.name} 受到 1 点伤害`);
        }
      },
    },
  ],
});

// 平辽：锁定技，当你使用【杀】指定目标后，你攻击范围内除目标外的其他角色依次可打出一张红色基本牌。
//       有 1~2 人打出则你摸 1~2 张牌且本阶段【杀】次数 +1；无人打出则目标本回合不能使用或打出手牌。
defineSkill({
  id: 'm5_pingliao', name: '平辽',
  desc: '锁定技，当你使用【杀】指定目标后，你攻击范围内除该目标外的其他角色依次可以打出一张红色基本牌；'
    + '若有 1 名角色如此做，你摸一张牌且本阶段使用【杀】的次数 +1，有 2 名及以上则你摸两张牌且本阶段'
    + '使用【杀】的次数 +1；若无人打出，此【杀】的目标本回合不能使用或打出手牌。',
  triggers: [{
    on: 'target.after', who: 'self', optional: false,
    filter: (d) => !!d.card && d.card.name === 'sha' && !!d.target && d.target !== d.self,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, victim = ctx.data.target;
      const cands = others(g, p).filter(x => x !== victim && g.inAttackRange(p, x) && x.hand.length > 0);
      let got = 0;
      for (const x of cands) {
        if (got >= 2) break;
        const c = await ctx.ask.card(x, {
          filter: { type: 'basic', red: true },
          prompt: '【平辽】：是否打出一张红色基本牌？', optional: true, reason: 'pingliao',
        });
        if (c) {
          got++;
          await ctx.log(`【平辽】：${x.name} 打出 ${cardLabel(c)}`);
        }
      }
      if (got > 0) {
        p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + 1;   // 本阶段（SG028）
        await ctx.draw(p, got >= 2 ? 2 : 1, { reason: 'pingliao' });
        await ctx.log(`【平辽】：${p.name} 摸 ${got >= 2 ? 2 : 1} 张牌且本阶段【杀】次数 +1`);
      } else {
        victim.flags.xiongluanBan = g.turnCount;
        await ctx.log(`【平辽】：无人打出红色基本牌，${victim.name} 本回合不能使用或打出手牌`);
      }
    },
  }],
});

// ============================================================
// 谋夏侯惇 · 刚烈 / 清俭
// ============================================================
// 刚烈：出牌阶段限一次，你可以选择任意名本局对你造成过伤害的角色（每局每名角色限一次），各造成 2 点伤害。
defineSkill({
  id: 'm5_ganglie', name: '刚烈',
  desc: '出牌阶段限一次，你可以选择任意名本局游戏中对你造成过伤害的角色（每局每名角色限一次），对其各造成 2 点伤害。',
  active: {
    perTurn: true,
    prompt: '选择本局对你造成过伤害的角色，对其各造成 2 点伤害（每局每名角色限一次）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const hurt = p.flags.m5HurtBy || [];
      const done = p.flags.m5GlDone || [];
      const cands = others(g, p).filter(x => hurt.includes(x.id) && !done.includes(x.id));
      if (!cands.length) { await ctx.log('【刚烈】：没有可报复的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【刚烈】：选择要报复的角色（可多选）', candidates: cands, min: 1, max: cands.length, reason: 'ganglie2',
      });
      if (!ts.length) return;
      for (const t of ts) {
        if (!t.alive) continue;
        done.push(t.id);
        await ctx.damage({ from: p, to: t, amount: 2, reason: 'ganglie2' });
        await ctx.log(`【刚烈】：${p.name} 对 ${t.name} 造成 2 点伤害`);
      }
      p.flags.m5GlDone = done;
    },
  },
  triggers: [{
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && !!d.from && d.from !== d.player && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, src = ctx.data.from;
      const hurt = p.flags.m5HurtBy || [];
      if (hurt.includes(src.id)) return;
      hurt.push(src.id);
      p.flags.m5HurtBy = hurt;
      await ctx.log(`【刚烈】：记录 ${src.name} 本局对 ${p.name} 造成过伤害`);
    },
  }],
});

// 清俭：锁定技，一张牌不因使用而进入弃牌堆时，若你的「清俭」牌不足 X 张（X = 体力值 - 1，至少 1），
//       你将其置于武将牌上；出牌阶段结束时，你将这些牌分配给任意角色。
defineSkill({
  id: 'm5_qingjian', name: '清俭',
  reclaimCards(p) { const a = p.flags.m5Qj || []; p.flags.m5Qj = []; return a; },
  desc: '锁定技，当一张牌不因使用而进入弃牌堆时，若你武将牌上的「清俭」牌不足 X 张（X 为你的体力值 -1，至少为 1），'
    + '你将其置于你的武将牌上，称为「清俭」牌；出牌阶段结束时，你将这些牌分配给任意角色。',
  triggers: [
    {
      on: 'cards.discard', who: 'self', optional: false,
      filter: (d) => d.self === d.player && (d.cards || []).length > 0
        && !['play', 'use', 'respond', 'qingjian'].includes(d.reason)
        && (d.player.flags.m5Qj || []).length < Math.max(1, d.player.hp - 1),
      async effect(ctx) {
        const p = ctx.self, c = (ctx.data.cards || [])[0];
        if (!c) return;
        // ★「置于武将牌上」必须先把它从手牌/装备区摘出：本触发器挂在 cards.gain 上，
        //   牌此刻已在手牌里；旧实现直接 push 进 m5Qj 会与手牌双存（SG028 顺手修，牌张守恒）。
        const hi = p.hand.indexOf(c);
        if (hi >= 0) p.hand.splice(hi, 1);
        // ★走引擎出口派发 equip.lose（SG033 P0-2）
        await ctx.game.unequipCard(p, c, { reason: 'qingjian' });
        p.flags.m5Qj = p.flags.m5Qj || [];
        p.flags.m5Qj.push(c);
        c.__m5Qj = true;
        await ctx.log(`【清俭】：${cardLabel(c)} 置于 ${p.name} 的武将牌上（共 ${p.flags.m5Qj.length} 张）`);
      },
    },
    {
      on: 'phase.end', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && (d.player.flags.m5Qj || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const list = (p.flags.m5Qj || []).slice();
        if (!list.length) return;
        p.flags.m5Qj = [];
        for (const c of list) {
          c.__m5Qj = false;
          const ts = await ctx.ask.targets(p, {
            prompt: `【清俭】：将 ${cardLabel(c)} 交给一名角色`,
            candidates: g.alive(), min: 1, max: 1, reason: 'qingjian',
          });
          const t = ts[0] || p;
          takeFromDiscard(g, c);
          await ctx.gain(t, [c], { reason: 'qingjian' });
          await ctx.log(`【清俭】：${p.name} 将 ${cardLabel(c)} 交给 ${t.name}`);
        }
      },
    },
  ],
});

// ============================================================
// 谋徐盛 · 破军 / 疑城
// ============================================================
// 破军：当你使用【杀】指定目标后，你可以将其至多 X 张牌扣置于其武将牌旁（X 为其体力值）；
//       当前回合结束后，其获得这些牌。你使用【杀】对没有手牌或装备数不大于你的角色造成伤害时，此伤害 +1。
defineSkill({
  id: 'm5_pojun', name: '破军',
  desc: '当你使用【杀】指定目标后，你可以将其至多 X 张牌扣置于其武将牌旁（X 为其体力值），'
    + '当前回合结束时，其获得这些牌。你使用【杀】对没有手牌或装备数不大于你的角色造成伤害时，此伤害 +1。',
  triggers: [
    {
      on: 'target.after', who: 'self', optional: false,
      filter: (d) => !!d.card && d.card.name === 'sha' && !!d.target && d.target !== d.self
        && zonesOf(d.target).length > 0 && d.target.hp > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.target;
        const x = Math.min(Math.max(1, t.hp), zonesOf(t).length);
        const picks = await g.chooseSomeCards(p, zonesOf(t), x, { prompt: `【破军】：扣置 ${t.name} 至多 ${x} 张牌` });
        if (!picks.length) return;
        pluckCards(t, picks, g);
        t.flags.m5Kou = [...(t.flags.m5Kou || []), ...picks];
        await ctx.log(`【破军】：${p.name} 扣置 ${t.name} 的 ${picks.map(cardLabel).join('、')}（回合结束时归还）`);
      },
    },
    {
      // 「当前回合结束后」= 任意回合结束时检查所有被扣置牌的角色（不限于自己的回合）
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => d.game.players.some(x => (x.flags.m5Kou || []).length > 0),
      async effect(ctx) {
        const g = ctx.game;
        for (const t of g.players) {
          const list = (t.flags.m5Kou || []).slice();
          if (!list.length) continue;
          t.flags.m5Kou = [];
          await ctx.gain(t, list, { reason: 'pojun' });
          await ctx.log(`【破军】：${t.name} 收回 ${list.map(cardLabel).join('、')}`);
        }
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.self !== d.player
        && (d.reason === 'sha' || (d.card && d.card.name === 'sha'))
        && (d.self.hand.length === 0 || equipsOf(d.self).length <= equipsOf(d.player).length),
      async effect(ctx) {
        ctx.data.amount += 1;
        await ctx.log('【破军】：此伤害 +1');
      },
    },
  ],
});

// 疑城：结束阶段，若你本回合未使用过【杀】，你可以选择一项：1.视为使用一张【杀】；2.摸两张牌。
defineSkill({
  id: 'm5_yicheng', name: '疑城',
  desc: '结束阶段，若你本回合未使用过【杀】，你可以选择一项：1.视为使用一张【杀】；2.摸两张牌。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.card && d.card.name === 'sha',
      async effect(ctx) { ctx.self.flags.m5ShaUsed = ctx.game.turnCount; },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'end' && d.player.flags.m5ShaUsed !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = others(g, p);
        const opts = cands.length ? ['视为使用一张【杀】', '摸两张牌'] : ['摸两张牌'];
        const idx = await ctx.ask.choose(p, opts, { prompt: '【疑城】：本回合未使用【杀】，请选择一项', reason: 'yicheng2' });
        if (idx < 0) return;
        if (opts[idx] === '视为使用一张【杀】') {
          const ts = await ctx.ask.targets(p, {
            prompt: '【疑城】：为视为使用的【杀】选择目标', candidates: cands, min: 1, max: 1, reason: 'yicheng2',
          });
          const t = ts[0];
          if (!t) return;
          await ctx.log(`【疑城】：${p.name} 视为对 ${t.name} 使用一张【杀】`);
          await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'yicheng2', ignoreRange: true, ignoreShaLimit: true });
        } else {
          await ctx.draw(p, 2, { reason: 'yicheng2' });
          await ctx.log(`【疑城】：${p.name} 摸两张牌`);
        }
      },
    },
  ],
});

// ============================================================
// 谋甘宁 · 奇袭 / 奋威
// ============================================================
// 奇袭：出牌阶段限一次，令一名其他角色依次猜测你手牌中数量最多的一种花色（每种花色限一次，至多两次）；
//       每猜错一次，你弃置其区域内一张牌；若其全部猜对，你展示所有手牌。
defineSkill({
  id: 'm5_qixi', name: '奇袭',
  desc: '出牌阶段限一次，你可以令一名其他角色依次猜测你手牌中数量最多的一种花色（每种花色限一次，至多两次）；'
    + '其每猜错一次，你弃置其区域内一张牌；若其全部猜对，你展示所有手牌。',
  active: {
    perPhase: true,
    prompt: '令一名其他角色猜测你手牌最多的花色，猜错则弃置其区域内一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【奇袭】：你没有手牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【奇袭】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【奇袭】：选择令其猜测花色的角色', candidates: cands, min: 1, max: 1, reason: 'qixi',
      });
      const t = ts[0];
      if (!t) return;
      const cnt = (s) => p.hand.filter(c => c.suit === s).length;
      const maxCnt = Math.max(...SUITS.map(cnt));
      const guessed = [];
      let wrong = 0;
      for (let k = 0; k < 2; k++) {
        const left = SUITS.filter(s => !guessed.includes(s));
        if (!left.length) break;
        const idx = await ctx.ask.choose(t, left.map(s => SUIT_CN[s]), {
          prompt: `【奇袭】：猜测 ${p.name} 手牌中数量最多的一种花色`, reason: 'qixi',
        });
        if (idx < 0 || !left[idx]) break;
        const suit = left[idx];
        guessed.push(suit);
        if (maxCnt > 0 && cnt(suit) >= maxCnt) {
          await ctx.log(`【奇袭】：${t.name} 猜对了 ${SUIT_CN[suit]}，猜错 ${wrong} 次`);
          break;
        }
        wrong++;
        const pool = zonesOf(t);
        if (!pool.length) continue;
        const picks = await g.chooseSomeCards(p, pool, 1, { prompt: `【奇袭】：弃置 ${t.name} 的一张牌` });
        const c = picks[0];
        if (!c) continue;
        await ctx.discard(t, [c], { reason: 'qixi' });
        await ctx.log(`【奇袭】：${t.name} 猜错，${p.name} 弃置其 ${cardLabel(c)}`);
      }
      if (wrong === 0) {
        await ctx.log(`【奇袭】：${p.name} 展示所有手牌（${p.hand.map(cardLabel).join('、')}）`);
      }
    },
  },
});

// 奋威（限定技）：出牌阶段，你可以将至多三张牌置于任意名角色的武将牌上（每名角色各一张），
//       称为「威」，然后你摸等量的牌。有「威」的角色成为锦囊牌的目标时，你选择一项：
//       1.令其获得「威」牌；2.弃置其「威」牌，取消其作为此锦囊牌的目标。
defineSkill({
  id: 'm5_fenwei', name: '奋威',
  desc: '限定技，出牌阶段，你可以将至多三张牌置于任意名角色的武将牌上（每名角色各一张），称为「威」，'
    + '然后你摸等量的牌。当有「威」的角色成为锦囊牌的目标时，你可以选择一项：1.令其获得「威」牌；'
    + '2.弃置其「威」牌，取消其作为此锦囊牌的目标。',
  active: {
    prompt: '限定技：将至多三张牌置于任意名角色武将牌上（称为「威」），然后摸等量的牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.m5FwUsed) { await ctx.log('【奋威】：限定技本局已发动过'); return; }
      const pool = zonesOf(p);
      if (!pool.length) { await ctx.log('【奋威】：没有可放置的牌'); return; }
      const picks = await g.chooseSomeCards(p, pool, 3, { prompt: '【奋威】：选择至多三张牌作为「威」' });
      if (!picks.length) return;
      p.flags.m5FwUsed = true;
      let n = 0;
      for (const c of picks) {
        const cands = g.alive().filter(x => !x.flags.m5Wei);
        if (!cands.length) break;
        const ts = await ctx.ask.targets(p, {
          prompt: `【奋威】：将 ${cardLabel(c)} 置于一名角色的武将牌上`,
          candidates: cands, min: 1, max: 1, reason: 'fenwei',
        });
        const t = ts[0];
        if (!t) break;
        pluckCards(p, [c], g);
        t.flags.m5Wei = c;
        n++;
        await ctx.log(`【奋威】：${cardLabel(c)} 置于 ${t.name} 的武将牌上，称为「威」`);
      }
      if (!n) return;
      await ctx.draw(p, n, { reason: 'fenwei' });
      await ctx.log(`【奋威】：${p.name} 摸 ${n} 张牌`);
    },
  },
  triggers: [{
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => !!d.target && d.target !== d.player && !!d.target.flags?.m5Wei
      && !!d.card && typeOf(d.card) === 'trick' && !isDelayed(d.card),
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.target;
      const c = t.flags.m5Wei;
      const idx = await ctx.ask.choose(p, ['令其获得「威」牌', '弃置「威」牌并取消其作为此锦囊牌的目标'], {
        prompt: `【奋威】：${t.name} 成为锦囊牌目标，是否发动「威」？`, reason: 'fenwei',
      });
      if (idx < 0) return;
      t.flags.m5Wei = null;
      if (idx === 0) {
        await ctx.gain(t, [c], { reason: 'fenwei' });
        await ctx.log(`【奋威】：${t.name} 获得「威」牌 ${cardLabel(c)}`);
      } else {
        await ctx.discard(null, [c], { reason: 'fenwei' });
        ctx.data.canceled = true;
        await ctx.log(`【奋威】：弃置 ${t.name} 的「威」牌，取消其作为此锦囊牌的目标`);
      }
    },
  }],
});

// ============================================================
// 谋张角 · 雷击 / 鬼道
// ============================================================
// 雷击：出牌阶段，你可以弃置四个「道兵」标记，对一名其他角色造成 1 点雷电伤害。
defineSkill({
  id: 'm5_leiji', name: '雷击',
  desc: '出牌阶段（不限次数），你可以弃置四个「道兵」标记，对一名其他角色造成 1 点雷电伤害。',
  active: {
    prompt: '弃置四个「道兵」标记，对一名其他角色造成 1 点雷电伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const db = p.flags.m5Db || 0;
      if (db < 4) { await ctx.log(`【雷击】：未开启/不足四个「道兵」（当前 ${db}）`); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【雷击】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【雷击】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'leiji2',
      });
      const t = ts[0];
      if (!t) return;
      p.flags.m5Db = db - 4;
      await ctx.log(`【雷击】：${p.name} 弃置四个「道兵」（剩余 ${p.flags.m5Db}），对 ${t.name} 造成雷电伤害`);
      await ctx.damage({ from: p, to: t, amount: 1, nature: 'thunder', reason: 'leiji2' });
    },
  },
});

// 鬼道：游戏开始时，你获得两个「道兵」标记（至多八个）；一名角色受到属性伤害后，你获得一个「道兵」
//       标记；当你受到伤害时，你可以弃置两个「道兵」标记，防止此伤害。
defineSkill({
  id: 'm5_guidao', name: '鬼道',
  desc: '游戏开始时，你获得两个「道兵」标记（你至多拥有八个「道兵」标记）；当一名角色受到属性伤害后，'
    + '你获得一个「道兵」标记（你于回合外以此法弃置「道兵」后，本回合不能再以此法获得）；'
    + '当你受到伤害时，你可以弃置两个「道兵」标记，防止此伤害。',
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false,
      async effect(ctx) {
        ctx.self.flags.m5Db = Math.min(8, (ctx.self.flags.m5Db || 0) + 2);
        await ctx.log(`【鬼道】：${ctx.self.name} 获得两个「道兵」标记（共 ${ctx.self.flags.m5Db}）`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => (d.nature === 'fire' || d.nature === 'thunder') && (d.amount || 0) > 0
        && d.player.flags.m5DbBlockTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.m5Db = Math.min(8, (p.flags.m5Db || 0) + 1);
        await ctx.log(`【鬼道】：属性伤害使 ${p.name} 获得一个「道兵」（共 ${p.flags.m5Db}）`);
      },
    },
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !d.canceled && (d.player.flags.m5Db || 0) >= 2,
      async effect(ctx) {
        const p = ctx.self;
        if (!(await ctx.ask.confirm(p, '【鬼道】：弃置两个「道兵」标记，防止此伤害？'))) return;
        p.flags.m5Db -= 2;
        ctx.data.canceled = true;
        if (ctx.game.turnPlayer !== p) p.flags.m5DbBlockTurn = ctx.game.turnCount;
        await ctx.log(`【鬼道】：${p.name} 弃置两个「道兵」（剩余 ${p.flags.m5Db}），防止此伤害`);
      },
    },
  ],
});

// ============================================================
// 谋董卓 · 凶逆 / 封赏
// ============================================================
// 凶逆：出牌阶段开始时，你可以弃置一张牌；其他每名角色需弃置一张与此牌花色相同的牌，否则受到你的 1 点伤害。
defineSkill({
  id: 'm5_xiongni', name: '凶逆',
  desc: '出牌阶段开始时，你可以弃置一张牌；其他每名角色需弃置一张与此牌花色相同的牌，否则受到你的 1 点伤害。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'play' && zonesOf(d.player).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!(await ctx.ask.confirm(p, '【凶逆】：弃置一张牌，令其他角色需弃同花色牌否则受到 1 点伤害？'))) return;
      const picks = await g.chooseSomeCards(p, zonesOf(p), 1, { prompt: '【凶逆】：弃置一张牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'xiongni' });
      const suitCn = SUIT_CN[c.suit] || '';
      await ctx.log(`【凶逆】：${p.name} 弃置 ${cardLabel(c)}，其他角色需弃置一张${suitCn}牌`);
      for (const x of others(g, p)) {
        if (!x.alive) continue;
        const same = x.hand.filter(cc => cc.suit === c.suit);
        let done = false;
        if (same.length) {
          const res = await g.ask(x, 'discard', {
            prompt: `【凶逆】：弃置一张${suitCn}牌，否则受到 ${p.name} 的 1 点伤害`,
            cards: same.map(cc => cc.id), min: 1, max: 1, optional: true,
          });
          const cc = (res?.cardIds || []).map(id => same.find(y => y.id === id)).filter(Boolean)[0];
          if (cc) { await ctx.discard(x, [cc], { reason: 'xiongni' }); done = true; }
        }
        if (!done) {
          await ctx.damage({ from: p, to: x, amount: 1, reason: 'xiongni' });
          await ctx.log(`【凶逆】：${x.name} 未弃置同花色牌，受到 1 点伤害`);
        }
      }
    },
  }],
});

// 封赏：出牌阶段限一次，你可以将本回合弃牌堆中两张花色相同的牌分配给等量角色；
//       若你未以此法获得牌，你视为使用一张【酒】。
defineSkill({
  id: 'm5_fengshang', name: '封赏',
  desc: '出牌阶段限一次，你可以将本回合弃牌堆中两张花色相同的牌分别交给一名角色（每回合一次）；'
    + '若你未以此法获得牌，你视为使用一张【酒】。',
  active: {
    perPhase: true,
    prompt: '将本回合弃牌堆中两张花色相同的牌分配给两名角色；若你未获得牌，视为使用一张【酒】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = (p.flags.m5FsPool || []).filter(c => g.discardPile.includes(c));
      const bySuit = {};
      for (const c of pool) (bySuit[c.suit] = bySuit[c.suit] || []).push(c);
      const pair = Object.values(bySuit).find(list => list.length >= 2);
      if (!pair) { await ctx.log('【封赏】：本回合弃牌堆没有花色相同的两张牌'); return; }
      const picks = await g.chooseSomeCards(p, pair.slice(), 2, { prompt: '【封赏】：选择两张花色相同的牌' });
      if (picks.length < 2) { await ctx.log('【封赏】：未选择两张牌，发动取消'); return; }
      let gotSelf = false;
      for (const c of picks) {
        const ts = await ctx.ask.targets(p, {
          prompt: `【封赏】：将 ${cardLabel(c)} 交给一名角色`,
          candidates: g.alive(), min: 1, max: 1, reason: 'fengshang',
        });
        const t = ts[0] || p;
        takeFromDiscard(g, c);
        await ctx.gain(t, [c], { reason: 'fengshang' });
        if (t === p) gotSelf = true;
        await ctx.log(`【封赏】：${p.name} 将 ${cardLabel(c)} 交给 ${t.name}`);
      }
      if (!gotSelf) {
        await ctx.log(`【封赏】：${p.name} 未以此法获得牌，视为使用一张【酒】`);
        await ctx.useCard({ from: p, card: vcard('jiu'), targets: [p], reason: 'fengshang', ignoreRange: true });
      }
    },
  },
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.m5FsPool = []; },
    },
    {
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => d.game.turnPlayer === d.player && !!d.self && (d.cards || []).length > 0
        && d.reason !== 'fengshang',
      async effect(ctx) {
        const p = ctx.self;
        const list = p.flags.m5FsPool || [];
        for (const c of ctx.data.cards || []) if (!list.includes(c)) list.push(c);
        p.flags.m5FsPool = list.slice(-20);
      },
    },
  ],
});
