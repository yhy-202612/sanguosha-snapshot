// 阶段 5I · 神将跨线 10 将（pack = 'shen2'，PACK_CN = 「神·跨线」）技能实现
// ---------------------------------------------------------------------------
// 神张辽【夺锐】【止啼】  神太史慈【击虚】【天义】  神荀彧【奇策】【节命】
// 神孙策【英魂】【激昂】  神鲁肃【缔盟】【好施】    神黄忠【烈弓】【穿云】
// 神庞统【涅槃】【连环】  神甄姬【倾国】【洛神】    神典韦【强袭】【古之恶来】
// 神曹丕【放逐】【行殇】
//
// 技能 id 一律使用 sn_ 前缀（不使用 jie_/mou_/ji_/shen_/sp_/ol_，避免被引擎静默降级别名）。
// 技能名允许与本家武将重名（跨线神将本就是同一人的「神格化」版本），但 id 全部唯一。
//
// ★★ 资料核实与自拟口径清单（desc 一律写成「本实现实际效果」）★★
//  1. 神张辽【止啼】：官方无此神将条目 → **自拟**。取「张辽威震逍遥津、江东小儿闻之止啼」的典故，
//     实现为「每名其他角色的每个回合内，其第一张指定你的【杀】被取消，你摸一张牌」。
//     「取消目标」用引擎既有的 target.before + data.canceled（引擎已有的目标取消出口）。
//  2. 神张辽【夺锐】：**自拟**（「夺其锐气」）：造成伤害后获得受伤角色一张手牌，红色牌则再摸一张。
//  3. 神太史慈【击虚】：**自拟**（「避实击虚」）：出牌阶段限一次，弃一名其他角色一张牌；
//     若其手牌数小于你，再对其造成 1 点伤害（伤害条件与实际结算顺序一致，desc 如实写出）。
//  4. 神太史慈【天义】：沿用火包太史慈【天义】的拼点框架，胜则「本回合【杀】伤害 +1、可额外使用一张
//     【杀】」（「无距离限制 / 额外目标」两部分未接回，引擎的 canUse 在技能钩子之前就完成距离校验）；
//     没赢则本回合不能使用【杀」（复用引擎既有的 banShaTurn 出口）。
//  5. 神荀彧【奇策】：沿用荀攸【奇策】口径——将全部手牌当一张普通锦囊牌使用；可选锦囊限定 10 种
//     单/群体普通锦囊（不含延时锦囊与【无懈可击】）。
//  6. 神荀彧【节命】：受到伤害后，令一名角色将手牌补至体力上限，单次最多摸 5 张（防爆上限为简化）。
//  7. 神孙策【英魂】：沿用孙坚【英魂】口径（准备阶段、已受伤、X = 已损体力），由被指定的角色二选一。
//  8. 神孙策【激昂】：官方激昂是「使用【杀】指定目标后 / 成为【杀】目标后摸一张」，本实现按
//     「同一张【杀】只结算一次」（用 card.id 去重），避免多目标【杀】重复摸牌。
//  9. 神鲁肃【缔盟】：沿用鲁肃【缔盟】口径，代价为「弃置等同于两名角色手牌数之差的牌」，
//     牌不够则不能发动（简化：不加「不足则改为失去体力」，直接不可发动）。
// 10. 神鲁肃【好施】：摸牌阶段可多摸两张；本阶段结束时若手牌数大于 5，将一半（向下取整）
//     交给手牌数最少的一名其他角色（「手牌上限 +2」未实装，属于引擎 hand.limit 内建逻辑）。
// 11. 神黄忠【烈弓】：沿用风包黄忠【烈弓】口径与原实现（target.after 置 shaCtx.unavoidable）。
// 12. 神黄忠【穿云】：**自拟**（「穿云裂石」）：锁定技，你计算与其他角色的距离 -1；
//     你的【杀】造成伤害时，若目标手牌数不大于你，此伤害 +1。
// 13. 神庞统【涅槃】/【连环】：与火包庞统同口径（限定技 / 一张手牌当【铁索连环】使用）。
// 14. 神甄姬【倾国】/【洛神】：与标准包甄姬同口径（黑色手牌当【闪】/ 判定黑色可获得并重复）。
// 15. 神典韦【强袭】：沿用典韦【强袭】口径（弃置一张武器牌或失去 1 点体力，然后造成 1 点伤害）。
// 16. 神典韦【古之恶来】：**自拟**（典韦「古之恶来」的称号）：锁定技，其他角色计算与你的距离 +1；
//     你受到伤害后，可以弃置伤害来源一张牌。
// 17. 神曹丕【放逐】/【行殇】：与林包曹丕同口径（翻面 / 角色死亡前获得其所有牌）。
// ---------------------------------------------------------------------------
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

// ------------------------------ 公用小工具 ------------------------------
let vseq = 0;
const vcard = (name, extra = {}) => ({
  id: `vsn_${++vseq}`, name, suit: 'none', num: 0,
  type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const isRedC = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const isBlackC = (c) => !!c && (c.suit === 'spade' || c.suit === 'club');
const zonesOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card).filter(Boolean)),
];
const others = (g, p) => g.alive().filter(x => x !== p);
const lostHpOf = (p) => Math.max(0, (p.maxHp ?? p.hp) - p.hp);
const handMinOthers = (g, p) => {
  const list = others(g, p);
  if (!list.length) return [];
  const min = Math.min(...list.map(x => x.hand.length));
  return list.filter(x => x.hand.length === min);
};

// ============================================================
// 神张辽 · 夺锐 / 止啼
// ============================================================
// 夺锐：当你对其他角色造成伤害后，你可以获得其一张手牌；若该牌为红色，你摸一张牌。
defineSkill({
  id: 'sn_duorui', name: '夺锐',
  desc: '当你对其他角色造成伤害后，你可以获得其一张手牌；若你以此法获得的牌为红色，你摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
      && d.self.alive !== false && (d.self.hand || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, victim = ctx.data.self;
      const ok = await ctx.ask.confirm(p, `【夺锐】：是否获得 ${victim.name} 的一张手牌？`);
      if (!ok) return;
      const [c] = await g.chooseSomeCards(p, victim.hand.slice(), 1, {
        prompt: `【夺锐】：选择获得 ${victim.name} 的一张手牌`,
      });
      if (!c) return;
      await ctx.gain(p, [c], { from: victim, reason: 'duorui' });
      await ctx.log(`【夺锐】：${p.name} 获得 ${victim.name} 一张牌`);
      if (isRedC(c)) {
        await ctx.draw(p, 1, { reason: 'duorui' });
        await ctx.log('【夺锐】：获得的牌为红色，摸一张牌');
      }
    },
  }],
});

// 止啼：锁定技，其他角色于其回合内首次使用【杀】指定你为目标时，取消之，然后你摸一张牌。
defineSkill({
  id: 'sn_zhiti', name: '止啼',
  desc: '锁定技，其他角色于其回合内第一次使用【杀】指定你为目标时，取消此【杀】对你的结算，然后你摸一张牌。',
  triggers: [{
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => d.player === d.target && d.target !== d.self
      && !!d.card && d.card.name === 'sha'
      && (d.self.flags || {}).snZhitiTurn !== d.game.turnCount,
    async effect(ctx) {
      const d = ctx.data, p = ctx.self, src = d.self;
      src.flags.snZhitiTurn = ctx.game.turnCount;
      d.canceled = true;
      await ctx.log(`【止啼】：${src.name} 本回合第一张【杀】因 ${p.name} 的威名而作废`);
      await ctx.draw(p, 1, { reason: 'zhiti' });
    },
  }],
});

// ============================================================
// 神太史慈 · 击虚 / 天义
// ============================================================
// 击虚：出牌阶段限一次，弃置一名其他角色一张牌；若其手牌数小于你，你对其造成 1 点伤害。
defineSkill({
  id: 'sn_jixu', name: '击虚',
  desc: '出牌阶段限一次，你可以弃置一名其他角色的一张牌，然后若其手牌数小于你，你对其造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '弃置一名其他角色的一张牌；若其手牌数小于你，再对其造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter(x => zonesOf(x).length > 0);
      if (!cands.length) { await ctx.log('【击虚】：没有可弃牌的其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【击虚】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'jixu',
      });
      const t = ts[0];
      if (!t) return;
      const pool = zonesOf(t);
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: `【击虚】：弃置 ${t.name} 的一张牌` });
      const c = picks[0] || pool[0];
      if (!c) return;
      await ctx.discard(t, [c], { reason: 'jixu' });
      await ctx.log(`【击虚】：${p.name} 弃置 ${t.name} 的 ${cardLabel(c)}`);
      if (t.alive && t.hand.length < p.hand.length) {
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'jixu' });
        await ctx.log(`【击虚】：${t.name} 手牌数小于 ${p.name}，受到 1 点伤害`);
      }
    },
  },
});

// 天义：出牌阶段限一次，与一名其他角色拼点。赢：本回合【杀】伤害 +1 且可额外使用一张【杀】；
//       没赢：本回合不能使用【杀】。
defineSkill({
  id: 'sn_tianyi', name: '天义',
  desc: '出牌阶段限一次，你可以与一名其他角色拼点。若你赢，本回合你使用【杀】造成的伤害 +1 且可额外使用一张【杀】；若你没赢，本回合你不能使用【杀】。',
  active: {
    perPhase: true,
    prompt: '与一名其他角色拼点：赢则本回合【杀】伤害 +1，没赢则本回合不能使用【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【天义】：你没有手牌可拼点'); return; }
      const cands = others(g, p).filter(x => x.hand.length > 0);
      if (!cands.length) { await ctx.log('【天义】：没有可拼点的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【天义】：选择拼点角色', candidates: cands, min: 1, max: 1, reason: 'tianyi',
      });
      const t = ts[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: '天义' });
      if (r.skip) return;
      if (r.win) {
        p.flags.snTianyiTurn = g.turnCount;
        p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + 1;   // 本回合（SG028）
        await ctx.log(`${p.name}【天义】拼点获胜：本回合【杀】伤害 +1，可额外使用一张【杀】`);
      } else {
        p.flags.banShaTurn = g.turnCount;
        await ctx.log(`${p.name}【天义】未获胜：本回合不能使用【杀】`);
      }
    },
  },
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
      && (d.reason === 'sha' || (d.card && d.card.name === 'sha'))
      && (d.player.flags || {}).snTianyiTurn === d.game.turnCount,
    async effect(ctx) {
      ctx.data.amount += 1;
      await ctx.log(`【天义】：${ctx.self.name} 本回合的【杀】伤害 +1`);
    },
  }],
});

// ============================================================
// 神荀彧 · 奇策 / 节命
// ============================================================
// 奇策：出牌阶段限一次，将全部手牌当任意一张普通锦囊牌使用（可选 10 种普通锦囊）。
const QICE_NAMES = ['wuzhong', 'guohe', 'shunshou', 'juedou', 'huogong', 'tiesuo', 'nanman', 'wanjian', 'taoyuan', 'wugu'];
const ALL_TARGETS = new Set(['nanman', 'wanjian', 'taoyuan', 'wugu']);
defineSkill({
  id: 'sn_qice', name: '奇策',
  desc: '出牌阶段限一次，你可以将你的所有手牌当任意一张普通锦囊牌使用（【无中生有】【过河拆桥】【顺手牵羊】【决斗】【火攻】【铁索连环】【南蛮入侵】【万箭齐发】【桃园结义】【五谷丰登】）。',
  active: {
    perPhase: true,
    prompt: '将全部手牌当一张普通锦囊牌使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【奇策】：你没有手牌'); return; }
      const idx = await ctx.ask.choose(p, QICE_NAMES.map(n => CARD_META[n].cn), {
        prompt: '【奇策】：声明要视为使用的锦囊牌', reason: 'qice',
      });
      if (idx < 0 || idx >= QICE_NAMES.length) return;
      const name = QICE_NAMES[idx];
      let targets = [];
      if (name === 'wuzhong') {
        targets = [p];
      } else if (ALL_TARGETS.has(name)) {
        targets = name === 'nanman' || name === 'wanjian' ? others(g, p) : g.alive();
        if (!targets.length) { await ctx.log(`【奇策】：【${CARD_META[name].cn}】没有合法目标`); return; }
      } else {
        const cands = others(g, p).filter(x => zonesOf(x).length > 0 || name === 'juedou' || name === 'huogong');
        if (!cands.length) { await ctx.log(`【奇策】：【${CARD_META[name].cn}】没有合法目标`); return; }
        const ts = await ctx.ask.targets(p, {
          prompt: `【奇策】：为【${CARD_META[name].cn}】选择一名其他角色`, candidates: cands, min: 1, max: 1, reason: 'qice',
        });
        if (!ts.length) return;
        targets = [ts[0]];
      }
      const cost = p.hand.slice();
      await ctx.discard(p, cost, { reason: 'qice' });
      await ctx.log(`【奇策】：${p.name} 将 ${cost.length} 张手牌当【${CARD_META[name].cn}】使用`);
      await ctx.useCard({ from: p, card: vcard(name), targets, reason: 'qice', ignoreRange: true });
    },
  },
});

// 节命：当你受到伤害后，你可以令一名角色将手牌补至其体力上限（单次最多摸 5 张）。
defineSkill({
  id: 'sn_jieming', name: '节命',
  desc: '当你受到伤害后，你可以令一名角色将手牌补至其体力上限（单次最多摸五张）。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.self.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ts = await ctx.ask.targets(p, {
        prompt: '【节命】：选择一名角色，令其将手牌补至体力上限',
        candidates: g.alive(), min: 1, max: 1, reason: 'jieming2',
      });
      const t = ts[0];
      if (!t) return;
      const need = Math.min(5, Math.max(0, (t.maxHp ?? t.hp) - t.hand.length));
      if (need <= 0) { await ctx.log(`【节命】：${t.name} 手牌已不少于体力上限`); return; }
      await ctx.draw(t, need, { reason: 'jieming2' });
      await ctx.log(`【节命】：${t.name} 摸 ${need} 张牌`);
    },
  }],
});

// ============================================================
// 神孙策 · 英魂 / 激昂
// ============================================================
// 英魂：准备阶段，若你已受伤，你可以令一名其他角色摸 X 弃 1，或摸 1 弃 X（X = 你已损体力值）。
defineSkill({
  id: 'sn_yinghun', name: '英魂',
  desc: '准备阶段，若你已受伤，你可以令一名其他角色选择一项：摸 X 张牌然后弃置一张牌；或摸一张牌然后弃置 X 张牌（X 为你已损失的体力值）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.self === d.player && d.self.hp < (d.self.maxHp ?? d.self.hp),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.max(1, lostHpOf(p));
      const ts = await ctx.ask.targets(p, {
        prompt: `【英魂】（X=${x}）：选择一名其他角色`, candidates: others(g, p), min: 1, max: 1, reason: 'yinghun2',
      });
      const t = ts[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, [`摸 ${x} 张牌，然后弃置一张牌`, `摸一张牌，然后弃置 ${x} 张牌`], {
        prompt: `【英魂】（X=${x}）：请选择一项`, reason: 'yinghun2',
      });
      if (idx === 1) {
        await ctx.draw(t, 1, { reason: 'yinghun2' });
        const n = Math.min(x, t.hand.length);
        if (n > 0) {
          const picks = await g.chooseSomeCards(t, t.hand.slice(), n, { prompt: `【英魂】：弃置 ${n} 张手牌` });
          const list = picks.length ? picks : t.hand.slice(0, n);
          await ctx.discard(t, list, { reason: 'yinghun2' });
        }
        await ctx.log(`【英魂】：${t.name} 摸一张牌并弃置 ${n} 张牌`);
      } else {
        await ctx.draw(t, x, { reason: 'yinghun2' });
        if (t.hand.length) {
          const picks = await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【英魂】：弃置一张手牌' });
          await ctx.discard(t, [picks[0] || t.hand[0]], { reason: 'yinghun2' });
        }
        await ctx.log(`【英魂】：${t.name} 摸 ${x} 张牌并弃置一张牌`);
      }
    },
  }],
});

// 激昂：当你使用【杀】指定目标后，或你成为【杀】的目标后，你可以摸一张牌（同一张【杀】只结算一次）。
defineSkill({
  id: 'sn_jingge', name: '激昂',
  desc: '当你使用的【杀】指定目标后，或你成为【杀】的目标后，你可以摸一张牌（同一张【杀】只结算一次）。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => !!d.card && d.card.name === 'sha' && (d.self === d.player || d.target === d.player)
      && (d.player.flags || {}).snJinggeCard !== d.card.id,
    async effect(ctx) {
      const p = ctx.self, d = ctx.data;
      p.flags.snJinggeCard = d.card.id;
      const ok = await ctx.ask.confirm(p, '【激昂】：是否摸一张牌？');
      if (!ok) return;
      await ctx.draw(p, 1, { reason: 'jingge' });
      await ctx.log(`【激昂】：${p.name} 摸一张牌`);
    },
  }],
});

// ============================================================
// 神鲁肃 · 缔盟 / 好施
// ============================================================
// 缔盟：出牌阶段限一次，弃置等同于两名其他角色手牌数之差的牌，令二者交换手牌。
defineSkill({
  id: 'sn_dimeng', name: '缔盟',
  desc: '出牌阶段限一次，你可以选择两名手牌数不同的其他角色，弃置等同于其手牌数之差的牌，然后令二者交换手牌（牌不足则不能发动）。',
  active: {
    perPhase: true,
    prompt: '弃置等同于两名其他角色手牌数之差的牌，令二者交换手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (cands.length < 2) { await ctx.log('【缔盟】：其他角色不足两名'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【缔盟】：选择两名其他角色', candidates: cands, min: 2, max: 2, reason: 'dimeng2',
      });
      if (ts.length < 2) return;
      const [a, b] = ts;
      const diff = Math.abs(a.hand.length - b.hand.length);
      if (diff === 0) { await ctx.log('【缔盟】：两名角色手牌数相同，无需交换'); return; }
      const mine = zonesOf(p);
      if (mine.length < diff) {
        await ctx.log(`【缔盟】：你的牌不足以支付 ${diff} 张代价`);
        return;
      }
      const picks = await g.chooseSomeCards(p, mine, diff, { prompt: `【缔盟】：弃置 ${diff} 张牌作为代价` });
      if (picks.length < diff) { await ctx.log('【缔盟】：取消发动'); return; }
      await ctx.discard(p, picks, { reason: 'dimeng2' });
      const ha = a.hand.slice(), hb = b.hand.slice();
      a.hand = hb;
      b.hand = ha;
      await ctx.log(`【缔盟】：${a.name} 与 ${b.name} 交换手牌（各 ${hb.length} / ${ha.length} 张）`);
      if (g.checkHandChange) { await g.checkHandChange(a); await g.checkHandChange(b); }
    },
  },
});

// 好施：摸牌阶段，你可以多摸两张牌；本阶段结束时若手牌数大于 5，将一半交给手牌数最少的一名其他角色。
defineSkill({
  id: 'sn_haoshi', name: '好施',
  desc: '摸牌阶段，你可以多摸两张牌；若如此做，此阶段结束时，若你的手牌数大于 5，你将一半（向下取整）交给手牌数最少的一名其他角色。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'draw' && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        const ok = await ctx.ask.confirm(p, '【好施】：是否多摸两张牌？');
        if (!ok) return;
        p.flags.snHaoshiTurn = ctx.game.turnCount;
        await ctx.draw(p, 2, { reason: 'haoshi2' });
        await ctx.log(`【好施】：${p.name} 额外摸两张牌`);
      },
    },
    {
      on: 'phase.end', who: 'self', optional: false,
      filter: (d) => d.phase === 'draw' && d.self === d.player
        && (d.player.flags || {}).snHaoshiTurn === d.game.turnCount
        && d.player.hand.length > 5,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.snHaoshiTurn = -1;
        const cands = handMinOthers(g, p);
        if (!cands.length) { await ctx.log('【好施】：没有其他角色可接手牌'); return; }
        const t = cands.length === 1
          ? cands[0]
          : (await ctx.ask.targets(p, { prompt: '【好施】：交给谁？', candidates: cands, min: 1, max: 1, reason: 'haoshi2' }))[0];
        if (!t) return;
        const n = Math.floor(p.hand.length / 2);
        const picks = await g.chooseSomeCards(p, p.hand.slice(), n, { prompt: `【好施】：选择 ${n} 张手牌交给 ${t.name}` });
        const list = picks.length ? picks : p.hand.slice(0, n);
        await ctx.gain(t, list, { from: p, reason: 'haoshi2' });
        await ctx.log(`【好施】：${p.name} 将 ${list.length} 张手牌交给 ${t.name}`);
      },
    },
  ],
});

// ============================================================
// 神黄忠 · 烈弓 / 穿云
// ============================================================
// 烈弓：使用【杀】指定目标后，若其手牌数不小于你的体力值或不大于你的攻击范围，此【杀】不可被【闪】响应。
defineSkill({
  id: 'sn_liegong', name: '烈弓',
  desc: '当你使用【杀】指定目标后，若该角色的手牌数不小于你的体力值，或不大于你的攻击范围，你可以令此【杀】不可被【闪】响应。',
  triggers: [{
    on: 'target.after', who: 'self', optional: true,
    filter: (d) => !!d.card && d.card.name === 'sha' && !!d.target && d.target !== d.self
      && (d.target.hand.length >= d.self.hp || d.target.hand.length <= d.game.attackRange(d.self)),
    async effect(ctx) {
      const d = ctx.data;
      if (d.shaCtx) d.shaCtx.unavoidable = true;
      await ctx.log(`【烈弓】：${d.target.name} 不能使用【闪】响应此【杀】`);
    },
  }],
});

// 穿云：锁定技，你计算与其他角色的距离 -1；你的【杀】造成伤害时，若目标手牌数不大于你，此伤害 +1。
defineSkill({
  id: 'sn_chuanyun', name: '穿云',
  desc: '锁定技，你计算与其他角色的距离 -1；当你使用【杀】造成伤害时，若目标角色的手牌数不大于你，此伤害 +1。',
  triggers: [
    {
      on: 'distance.calc', who: 'self', optional: false,
      effect(ctx) {
        // distance.calc 的数据形如 { self: 计算距离的一方, to, value }
        const d = ctx.data, p = ctx.self;
        if (!d || d.self !== p || !d.to || d.to === p) return;
        if (d.value <= 1) return;
        d.value -= 1;
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
        && (d.reason === 'sha' || (d.card && d.card.name === 'sha'))
        && d.self.hand.length <= d.player.hand.length,
      async effect(ctx) {
        ctx.data.amount += 1;
        await ctx.log(`【穿云】：${ctx.self.name} 的【杀】伤害 +1`);
      },
    },
  ],
});

// ============================================================
// 神庞统 · 涅槃 / 连环
// ============================================================
// 涅槃：限定技，濒死时弃置所有牌，摸三张牌，将体力回复至 3 点。
defineSkill({
  id: 'sn_niepan', name: '涅槃',
  desc: '限定技，当你处于濒死状态时，你可以弃置你区域里的所有牌，然后摸三张牌，将体力回复至 3 点。',
  triggers: [{
    on: 'dying.begin', who: 'self', optional: true,
    filter: (d) => d.player.flags.snNiepanUsed !== true,
    async effect(ctx) {
      const p = ctx.self;
      const ok = await ctx.ask.confirm(p, '【涅槃】（限定技）：是否发动？');
      if (!ok) return;
      p.flags.snNiepanUsed = true;
      const all = zonesOf(p);
      if (all.length) await ctx.discard(p, all, { reason: 'niepan2' });
      await ctx.draw(p, 3, { reason: 'niepan2' });
      p.hp = Math.max(p.hp, 0);
      await ctx.recover(p, 3 - p.hp, { reason: 'niepan2' });
      await ctx.log(`${p.name} 发动限定技【涅槃】：弃置所有牌、摸三张、体力回复至 ${p.hp}`);
    },
  }],
});

// 连环：出牌阶段限一次，你可以将一张手牌当【铁索连环】使用。
defineSkill({
  id: 'sn_lianhuan', name: '连环',
  desc: '出牌阶段限一次，你可以弃置一张手牌，视为使用一张【铁索连环】。',
  active: {
    perPhase: true,
    prompt: '将一张手牌当【铁索连环】使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【连环】：你没有手牌'); return; }
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【连环】：选择一张手牌弃置，视为使用【铁索连环】' });
      const c = picks[0];
      if (!c) return;
      const ts = await ctx.ask.targets(p, {
        prompt: '【连环】：为【铁索连环】选择目标（1~2 名角色）',
        candidates: g.alive(), min: 1, max: 2, reason: 'lianhuan2',
      });
      if (!ts.length) return;
      await ctx.discard(p, [c], { reason: 'lianhuan2' });
      await ctx.log(`【连环】：${p.name} 弃置 ${cardLabel(c)}，视为使用【铁索连环】`);
      await ctx.useCard({ from: p, card: vcard('tiesuo'), targets: ts, reason: 'lianhuan2', ignoreRange: true });
    },
  },
});

// ============================================================
// 神甄姬 · 倾国 / 洛神
// ============================================================
// 倾国：你可以将一张黑色手牌当【闪】使用或打出。
defineSkill({
  id: 'sn_qingguo', name: '倾国',
  desc: '你可以将一张黑色手牌当【闪】使用或打出。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => !!d.filter && d.filter.name === 'shan' && d.self.hand.some(isBlackC),
    async effect(ctx) {
      const c = await ctx.ask.card(ctx.self, {
        filter: { red: false }, prompt: '【倾国】：将一张黑色手牌当【闪】打出', optional: true, reason: 'qingguo2',
      });
      if (!c) return;
      ctx.data.handled = true;
      ctx.data.card = { ...c, name: 'shan', __src: c };
      await ctx.log(`【倾国】：${ctx.self.name} 将一张黑色手牌当【闪】打出`);
    },
  }],
});

// 洛神：准备阶段，你可以进行判定：若为黑色，你获得此牌，然后可以重复此流程。
defineSkill({
  id: 'sn_luoshen', name: '洛神',
  desc: '准备阶段，你可以进行判定：若结果为黑色，你获得此牌，然后你可以重复此流程。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      let guard = 0;
      while (guard++ < 10) {
        const yes = await ctx.ask.confirm(p, '【洛神】：是否进行判定？');
        if (!yes) break;
        const j = await ctx.judge(p, { reason: 'luoshen2' });
        if (!j.card || isRedC({ suit: j.suit })) { await ctx.log('【洛神】：判定为红色，结束'); break; }
        const c = j.card;
        const i = g.discardPile.indexOf(c);
        if (i >= 0) g.discardPile.splice(i, 1);
        await ctx.gain(p, [c], { reason: 'luoshen2' });
        await ctx.log(`【洛神】：判定为黑色，${p.name} 获得 ${cardLabel(c)}`);
      }
    },
  }],
});

// ============================================================
// 神典韦 · 强袭 / 古之恶来
// ============================================================
// 强袭：出牌阶段限一次，弃置一张武器牌或失去 1 点体力，然后对攻击范围内一名其他角色造成 1 点伤害。
defineSkill({
  id: 'sn_qiangxi', name: '强袭',
  desc: '出牌阶段限一次，你可以弃置一张武器牌或失去 1 点体力，然后对攻击范围内的一名其他角色造成 1 点伤害。',
  active: {
    perTurn: true,
    prompt: '弃置武器牌或失去 1 点体力，对攻击范围内一名其他角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter(x => g.inAttackRange(p, x));
      if (!cands.length) { await ctx.log('【强袭】：攻击范围内没有其他角色'); return; }
      let paid = false;
      if (p.equips.weapon) {
        const idx = await ctx.ask.choose(p, ['弃置武器牌', '失去 1 点体力'], { prompt: '【强袭】：选择代价', reason: 'qiangxi2' });
        if (idx === 0) {
          await ctx.discard(p, [p.equips.weapon], { reason: 'qiangxi2' });
          paid = true;
        }
      }
      if (!paid) {
        await ctx.loseHp(p, 1, { reason: 'qiangxi2' });
        await ctx.log(`【强袭】：${p.name} 失去 1 点体力`);
        if (!p.alive) return;
      }
      const ts = await ctx.ask.targets(p, {
        prompt: '【强袭】：选择一名攻击范围内的其他角色', candidates: cands, min: 1, max: 1, reason: 'qiangxi2',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'qiangxi2' });
    },
  },
});

// 古之恶来：锁定技，其他角色计算与你的距离 +1；你受到伤害后，可以弃置伤害来源一张牌。
defineSkill({
  id: 'sn_guzhielai', name: '古之恶来',
  desc: '锁定技，其他角色计算与你的距离 +1；当你受到伤害后，你可以弃置伤害来源的一张牌。',
  triggers: [
    {
      on: 'distance.calc', who: 'any', optional: false,
      effect(ctx) {
        const d = ctx.data, p = ctx.self;
        if (!d || d.to !== p || d.self === p) return;
        d.value += 1;
      },
    },
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => d.self === d.player && !!d.from && d.from !== d.player
        && d.from.alive !== false && zonesOf(d.from).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, src = ctx.data.from;
        const ok = await ctx.ask.confirm(p, `【古之恶来】：是否弃置 ${src.name} 的一张牌？`);
        if (!ok) return;
        const pool = zonesOf(src);
        const picks = await g.chooseSomeCards(p, pool, 1, { prompt: `【古之恶来】：弃置 ${src.name} 的一张牌` });
        const c = picks[0] || pool[0];
        if (!c) return;
        await ctx.discard(src, [c], { reason: 'guzhielai' });
        await ctx.log(`【古之恶来】：${p.name} 弃置 ${src.name} 的 ${cardLabel(c)}`);
      },
    },
  ],
});

// ============================================================
// 神曹丕 · 放逐 / 行殇
// ============================================================
// 放逐：当你受到伤害后，你可以令一名其他角色摸 X 张牌，然后将其武将牌翻面（X = 你已损体力值）。
defineSkill({
  id: 'sn_fangzhu', name: '放逐',
  desc: '当你受到伤害后，你可以令一名其他角色摸 X 张牌，然后将其武将牌翻面（X 为你已损失的体力值）。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.self.alive !== false && d.game.alive().some(x => x !== d.player),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = Math.max(1, lostHpOf(p));
      const ts = await ctx.ask.targets(p, {
        prompt: `【放逐】：令一名其他角色摸 ${x} 张牌并翻面`,
        candidates: others(g, p), min: 1, max: 1, reason: 'fangzhu2',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, x, { reason: 'fangzhu2' });
      await ctx.flip(t);
      await ctx.log(`【放逐】：${t.name} 摸 ${x} 张牌并翻面`);
    },
  }],
});

// 行殇：当一名角色死亡时，你可以获得其所有牌。
defineSkill({
  id: 'sn_xingshang', name: '行殇',
  desc: '当一名角色死亡时，你可以获得其所有牌。',
  triggers: [{
    on: 'death.before', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && d.self.alive !== false && zonesOf(d.self).length > 0,
    async effect(ctx) {
      const p = ctx.self, dead = ctx.data.self;
      const all = zonesOf(dead);
      if (!all.length) return;
      const ok = await ctx.ask.confirm(p, `【行殇】：是否获得 ${dead.name} 的所有牌（${all.length} 张）？`);
      if (!ok) return;
      await ctx.gain(p, all, { from: dead, reason: 'xingshang2' });
      await ctx.log(`【行殇】：${p.name} 获得 ${dead.name} 的所有牌（${all.length} 张）`);
    },
  }],
});
