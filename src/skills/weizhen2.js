// 阶段 6C · 威震天下 / 武庙 / 星河璀璨·限定 剩余 15 将（pack = 'weizhen2'，PACK_CN = 「威震武庙·星河（补全）」）
// ---------------------------------------------------------------------------
// 威张辽【驭袭】【破戎】  威赵云【龙骧】【冲阵】  威马超【众讨】【极斩】
// 威黄忠【穿杨】【定军】  威典韦【恶来】【掷戟】
// 武赵云【绝尘】【七进】  武马超【铁骑】【神威】  武黄忠【烈魂】【破阵】  武典韦【古之恶来】【舍身】
// 星孙权【星衡】【凝望】  星刘备【星德】【仁望】  星曹操【星雄】【观沧】
// 星关羽【武星】【威震】  星张飞【星吼】【星啸】  星大乔【星影】【遗珠】
//
// 技能 id 一律 wz2s_ 前缀（不使用 jie_/mou_/ji_/shen_/sp_/ol_，避免被引擎静默降级别名）。
// 技能名允许与本家武将重名（威/武/星本就是同一人的「异格」），但 id 全部唯一。
//
// ★★ 资料核实与自拟口径清单（desc 一律写成「本实现实际效果」）★★
//  1. 威张辽【驭袭】：**官方技能**（威-威震天下，2024-12-07）：「你造成或受到伤害时，摸一张牌，
//     以此法获得的牌无次数限制」。本实现只接回「摸一张牌」；「无次数限制」属于引擎 useCard 内建
//     计数逻辑，未接回，desc 已如实标注。
//  2. 威张辽【破戎】：**官方技能**（连招技：伤害牌+【杀】）。本实现以「本回合使用过伤害类牌」判定
//     连招前摇，并以「对该目标造成 1 点伤害」代替官方「令此【杀】额外结算一次」（额外结算涉及
//     useCard 重入，属引擎级改动，按任务约束不动 src/engine/），desc 已如实写出。
//  3. 威马超【众讨】：**官方技能**（威-威震天下，雄烈盖世）：「选择一种花色（每有 1 点已损体力可额外
//     选择一种），随机从场上、弃牌堆或牌堆获得该花色各一张」。本实现简化为「选择一种花色，从弃牌堆
//     取最上面一张该花色的牌，弃牌堆没有则摸一张牌」，并去掉「已损体力加花色」。
//  4. 威马超【极斩】：**官方技能**（连招技：装备牌+黑色牌）：「弃置其他角色共计至多 X 张牌 / 造成 X 点
//     伤害，X 为本回合发动次数」。出牌阶段限一次下 X 恒为 1，故实现为「弃一张黑色牌 → 弃目标两张牌，
//     或对其造成 1 点伤害」。
//  5. 威赵云 / 威黄忠 / 威典韦 / 武赵云 / 武马超 / 武黄忠 / 武典韦 / 星孙权 / 星刘备 / 星曹操 /
//     星关羽 / 星张飞 / 星大乔：**技能名与效果均为自拟**（无可靠官方条目；威张辽/威马超之外的三位
//     威将、武庙四位、星河璀璨/限定六位均查无确切技能文本），按武将典故与既有同系列（weizhen/xinghe）
//     的强度口径设计，desc 写的就是实际实现。
//  ※ 武系列沿用 weizhen 包「体力上限高于本家」的口径（武赵云/武马超/武黄忠 5 血，武典韦 5 血）；
//   威系列沿用官方威张辽/威马超的「群势力 4 血」。
// ---------------------------------------------------------------------------
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

// ------------------------------ 公用小工具 ------------------------------
let vseq = 0;
const vcard = (name, extra = {}) => ({
  id: `vzw2_${++vseq}`, name, suit: 'none', num: 0,
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
const neighborOf = (g, t) => {
  const idx = g.players.indexOf(t);
  if (idx < 0 || g.players.length < 2) return [];
  const out = [];
  for (const off of [-1, 1]) {
    const n = g.players[(idx + off + g.players.length) % g.players.length];
    if (n && n !== t && n.alive && !out.includes(n)) out.push(n);
  }
  return out;
};
// 伤害类牌（【破戎】连招前摇判定用）
const DAMAGE_NAMES = new Set(['sha', 'juedou', 'huogong', 'nanman', 'wanjian', 'shuiyan']);
const SUITS = ['spade', 'club', 'heart', 'diamond'];
const SUIT_CN = { spade: '黑桃', club: '梅花', heart: '红桃', diamond: '方块' };

// ============================================================
// 威张辽 · 驭袭 / 破戎
// ============================================================
defineSkill({
  id: 'wz2s_yuxi', name: '驭袭',
  desc: '当你造成或受到伤害时，你可以摸一张牌（本实现只接回摸牌；官方「以此法获得的牌无次数限制」未实装）。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: true,
    filter: (d) => (!!d.from && d.from === d.player) || d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'yuxi' });
      await ctx.log(`【驭袭】：${p.name} 摸一张牌`);
    },
  }],
});

defineSkill({
  id: 'wz2s_porong', name: '破戎',
  desc: '连招技（伤害牌+【杀】），当你使用【杀】指定目标后，若你于此之前本回合使用过伤害类牌，你可以获得该【杀】的目标与其相邻角色各一张手牌，然后对该目标造成 1 点伤害（官方「额外结算一次」简化为 1 点伤害）。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => !!d.card && DAMAGE_NAMES.has(d.card.name),
      async effect(ctx) {
        ctx.self.flags.wz2ComboTurn = ctx.game.turnCount;
      },
    },
    {
      on: 'target.after', who: 'self', optional: true,
      filter: (d) => {
        const p = d.player;
        if (!d.card || d.card.name !== 'sha' || !d.target || d.target === p) return false;
        if ((p.flags || {}).wz2ComboTurn !== d.game.turnCount) return false;
        return (p.flags || {}).wz2ComboCard !== d.card.id;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data, t = d.target;
        p.flags.wz2ComboCard = d.card.id;
        p.flags.wz2ComboTurn = -1;              // 连招前摇已消耗
        const victims = [t, ...neighborOf(g, t)].filter(x => x !== p && x.alive && x.hand.length > 0);
        for (const v of victims) {
          const [c] = await g.chooseSomeCards(p, v.hand.slice(), 1, { prompt: `【破戎】：获得 ${v.name} 的一张手牌` });
          if (!c) continue;
          await ctx.gain(p, [c], { from: v, reason: 'porong' });
          await ctx.log(`【破戎】：${p.name} 获得 ${v.name} 的一张手牌`);
        }
        if (t.alive) {
          await ctx.damage({ from: p, to: t, amount: 1, reason: 'porong' });
          await ctx.log(`【破戎】：${t.name} 被此连招额外伤及，受到 1 点伤害`);
        }
      },
    },
  ],
});

// ============================================================
// 威赵云 · 龙骧 / 冲阵
// ============================================================
defineSkill({
  id: 'wz2s_longxiang', name: '龙骧',
  desc: '锁定技，你计算与其他角色的距离 -1；你的回合外，当你成为【杀】的目标后，你摸一张牌。',
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
      on: 'target.after', who: 'any', optional: false,
      filter: (d) => !!d.card && d.card.name === 'sha' && d.target === d.player
        && d.game.turnPlayer !== d.player,
      async effect(ctx) {
        const p = ctx.self;
        await ctx.draw(p, 1, { reason: 'longxiang' });
        await ctx.log(`【龙骧】：${p.name} 于回合外成为【杀】的目标，摸一张牌`);
      },
    },
  ],
});

defineSkill({
  id: 'wz2s_chongzhen', name: '冲阵',
  desc: '出牌阶段限一次，你可以与一名其他角色拼点。若你赢，你可以视为对其使用一张【杀】（无距离限制）。',
  active: {
    perPhase: true,
    prompt: '与一名其他角色拼点：赢则视为对其使用一张【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【冲阵】：你没有手牌可拼点'); return; }
      const cands = others(g, p).filter(x => x.hand.length > 0);
      if (!cands.length) { await ctx.log('【冲阵】：没有可拼点的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【冲阵】：选择拼点角色', candidates: cands, min: 1, max: 1, reason: 'chongzhen',
      });
      const t = ts[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: '冲阵' });
      if (r.skip) return;
      if (!r.win) { await ctx.log(`【冲阵】：${p.name} 拼点未赢，无法冲阵`); return; }
      await ctx.log(`【冲阵】：${p.name} 拼点获胜，视为对 ${t.name} 使用一张【杀】`);
      await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'chongzhen', ignoreRange: true, ignoreShaLimit: true });
    },
  },
});

// ============================================================
// 威马超 · 众讨 / 极斩
// ============================================================
defineSkill({
  id: 'wz2s_zhongtao', name: '众讨',
  desc: '出牌阶段限一次，你可以选择一种花色，然后从弃牌堆获得一张该花色的牌；若弃牌堆没有该花色的牌，你改为摸一张牌。',
  active: {
    perPhase: true,
    prompt: '选择一种花色，从弃牌堆（没有则摸牌）获得该花色的一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const idx = await ctx.ask.choose(p, SUITS.map(s => SUIT_CN[s]), {
        prompt: '【众讨】：选择一种花色', reason: 'zhongtao',
      });
      if (idx < 0 || idx >= SUITS.length) return;
      const suit = SUITS[idx];
      const pile = g.discardPile || [];
      let hit = null;
      for (let i = pile.length - 1; i >= 0; i -= 1) if (pile[i] && pile[i].suit === suit) { hit = pile[i]; break; }
      if (hit) {
        pile.splice(pile.indexOf(hit), 1);
        await ctx.gain(p, [hit], { reason: 'zhongtao' });
        await ctx.log(`【众讨】：${p.name} 从弃牌堆获得 ${cardLabel(hit)}`);
      } else {
        await ctx.draw(p, 1, { reason: 'zhongtao' });
        await ctx.log(`【众讨】：弃牌堆无${SUIT_CN[suit]}，${p.name} 摸一张牌`);
      }
    },
  },
});

defineSkill({
  id: 'wz2s_jizhan', name: '极斩',
  desc: '出牌阶段限一次，你可以弃置一张黑色手牌，然后选择一项：1.弃置一名其他角色的两张牌；2.对一名其他角色造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '弃置一张黑色牌：弃置一名其他角色两张牌，或对其造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const black = p.hand.filter(isBlackC);
      if (!black.length) { await ctx.log('【极斩】：你没有黑色手牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【极斩】：没有其他角色可选'); return; }
      // 顺序：先定「选项 + 目标」，最后才弃黑牌。原实现先扣费再问，取消/无目标时黑牌已白扣。
      const mode = await ctx.ask.choose(p, ['弃置一名其他角色的两张牌', '对一名其他角色造成 1 点伤害'], {
        prompt: '【极斩】：选择一项', reason: 'jizhan',
      });
      // 取消（-1 / 超时）必须直接结束：原实现用 else 兜底，取消反而会打出 1 点伤害。
      if (mode !== 0 && mode !== 1) { await ctx.log('【极斩】：取消发动'); return; }
      const pool = mode === 0 ? cands.filter(x => zonesOf(x).length) : cands;
      if (!pool.length) { await ctx.log('【极斩】：没有符合该选项的目标'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【极斩】：选择目标', candidates: pool, min: 1, max: 1, reason: 'jizhan',
      });
      const t = ts[0];
      if (!t) { await ctx.log('【极斩】：未选择目标，结算结束'); return; }
      const [cost] = await g.chooseSomeCards(p, black, 1, { prompt: '【极斩】：弃置一张黑色牌' });
      const c = cost;
      if (!c) { await ctx.log('【极斩】：未选择要弃置的黑色牌，取消发动'); return; }
      await ctx.discard(p, [c], { reason: 'jizhan' });
      if (mode === 0) {
        const area = zonesOf(t);
        if (!area.length) { await ctx.log(`【极斩】：${t.name} 没有可弃置的牌`); return; }
        const picks = await g.chooseSomeCards(p, area, Math.min(2, area.length), { prompt: `【极斩】：弃置 ${t.name} 的两张牌` });
        const list = picks.length ? picks.slice(0, 2) : area.slice(0, 2);
        await ctx.discard(t, list, { reason: 'jizhan' });
        await ctx.log(`【极斩】：${p.name} 弃置 ${t.name} 的 ${list.length} 张牌`);
      } else {
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'jizhan' });
        await ctx.log(`【极斩】：${p.name} 对 ${t.name} 造成 1 点伤害`);
      }
    },
  },
});

// ============================================================
// 威黄忠 · 穿杨 / 定军
// ============================================================
defineSkill({
  id: 'wz2s_chuanyang', name: '穿杨',
  desc: '当你使用【杀】指定目标后，若该角色的手牌数不大于你，你可以令此【杀】不可被【闪】响应。',
  triggers: [{
    on: 'target.after', who: 'self', optional: true,
    filter: (d) => !!d.card && d.card.name === 'sha' && !!d.target && d.target !== d.self
      && d.target.hand.length <= d.self.hand.length,
    async effect(ctx) {
      const d = ctx.data;
      if (d.shaCtx) d.shaCtx.unavoidable = true;
      await ctx.log(`【穿杨】：${d.target.name} 不能使用【闪】响应此【杀】`);
    },
  }],
});

defineSkill({
  id: 'wz2s_dingjun', name: '定军',
  desc: '出牌阶段限一次，你可以弃置一张牌，然后对你攻击范围内的一名其他角色造成 1 点伤害；若其体力值大于你，你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '弃置一张牌，对攻击范围内的一名其他角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = zonesOf(p);
      if (!pool.length) { await ctx.log('【定军】：你没有可弃置的牌'); return; }
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【定军】：弃置一张牌' });
      const c = picks[0] || pool[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'dingjun' });
      const cands = others(g, p).filter(x => ctx.inRange(p, x));
      if (!cands.length) { await ctx.log('【定军】：攻击范围内没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【定军】：选择攻击范围内的一名其他角色', candidates: cands, min: 1, max: 1, reason: 'dingjun',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'dingjun' });
      await ctx.log(`【定军】：${p.name} 对 ${t.name} 造成 1 点伤害`);
      if (t.alive && t.hp > p.hp) {
        await ctx.draw(p, 1, { reason: 'dingjun' });
        await ctx.log(`【定军】：${t.name} 体力值大于 ${p.name}，${p.name} 摸一张牌`);
      }
    },
  },
});

// ============================================================
// 威典韦 · 恶来 / 掷戟
// ============================================================
defineSkill({
  id: 'wz2s_elai', name: '恶来',
  desc: '锁定技，当你受到伤害时，若伤害来源与你的距离不大于 1，此伤害 -1。',
  triggers: [{
    on: 'damage.before', who: 'self', optional: false,
    filter: (d) => d.self === d.player && !!d.from && d.from !== d.player
      && d.player.alive !== false && d.game.distance(d.from, d.player) <= 1,
    async effect(ctx) {
      const d = ctx.data;
      d.amount = Math.max(0, d.amount - 1);
      await ctx.log(`【恶来】：${ctx.self.name} 距伤害来源极近，此伤害 -1`);
    },
  }],
});

defineSkill({
  id: 'wz2s_zhiji', name: '掷戟',
  desc: '出牌阶段限一次，你可以弃置一张武器牌或失去 1 点体力，然后对你攻击范围内的一名其他角色造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '弃置武器牌或失去 1 点体力，对攻击范围内的一名其他角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const weapon = p.equips ? p.equips.weapon : null;
      const opts = weapon ? ['弃置一张武器牌', '失去 1 点体力'] : ['失去 1 点体力'];
      const idx = await ctx.ask.choose(p, opts, { prompt: '【掷戟】：选择消耗', reason: 'zhiji' });
      if (idx < 0) return;
      if (weapon && idx === 0) {
        await ctx.discard(p, [weapon], { reason: 'zhiji' });
        await ctx.log(`【掷戟】：${p.name} 弃置武器牌`);
      } else {
        await ctx.loseHp(p, 1, { reason: 'zhiji' });
      }
      if (!p.alive) return;
      const cands = others(g, p).filter(x => ctx.inRange(p, x));
      if (!cands.length) { await ctx.log('【掷戟】：攻击范围内没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【掷戟】：选择攻击范围内的一名其他角色', candidates: cands, min: 1, max: 1, reason: 'zhiji',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'zhiji' });
      await ctx.log(`【掷戟】：${p.name} 对 ${t.name} 造成 1 点伤害`);
    },
  },
});

// ============================================================
// 武赵云 · 绝尘 / 七进
// ============================================================
defineSkill({
  id: 'wz2s_juechen', name: '绝尘',
  desc: '锁定技，你计算与其他角色的距离 -1；当你使用【杀】指定目标后，此【杀】不可被【闪】响应。',
  triggers: [
    {
      on: 'distance.calc', who: 'self', optional: false,
      effect(ctx) {
        const d = ctx.data, p = ctx.self;
        if (!d || d.self !== p || !d.to || d.to === p) return;
        if (d.value <= 1) return;
        d.value -= 1;
      },
    },
    {
      on: 'target.after', who: 'self', optional: false,
      filter: (d) => !!d.card && d.card.name === 'sha' && !!d.target && d.target !== d.self,
      async effect(ctx) {
        const d = ctx.data;
        if (d.shaCtx) d.shaCtx.unavoidable = true;
        await ctx.log(`【绝尘】：${ctx.self.name} 的【杀】不可被【闪】响应`);
      },
    },
  ],
});

defineSkill({
  id: 'wz2s_qijin', name: '七进',
  desc: '当你成为【杀】的目标时，你可以弃置一张牌，令此【杀】对你无效，然后你摸一张牌。',
  triggers: [{
    // target.before 的 data.self 是「使用牌的角色」，故用 who:'any' + filter 判定自己是否为目标
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => !!d.card && d.card.name === 'sha' && d.target === d.player
      && zonesOf(d.player).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const pool = zonesOf(p);
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【七进】：弃置一张牌，令此【杀】对你无效' });
      const c = picks[0] || pool[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'qijin' });
      d.canceled = true;
      await ctx.log(`【七进】：${p.name} 弃置一张牌，此【杀】对其无效`);
      await ctx.draw(p, 1, { reason: 'qijin' });
      await ctx.log(`【七进】：${p.name} 摸一张牌`);
    },
  }],
});

// ============================================================
// 武马超 · 铁骑 / 神威
// ============================================================
defineSkill({
  id: 'wz2s_tieji2', name: '铁骑',
  desc: '当你使用【杀】指定目标后，你可以进行判定：若结果为红色，此【杀】不可被【闪】响应。',
  triggers: [{
    on: 'target.after', who: 'self', optional: true,
    filter: (d) => !!d.card && d.card.name === 'sha' && !!d.target && d.target !== d.self,
    async effect(ctx) {
      const p = ctx.self, d = ctx.data;
      const r = await ctx.judge(p, { reason: '铁骑' });
      if (!r) return;
      if (r.suit === 'heart' || r.suit === 'diamond') {
        if (d.shaCtx) d.shaCtx.unavoidable = true;
        await ctx.log(`【铁骑】：判定为红色，${d.target.name} 不能使用【闪】响应此【杀】`);
      } else {
        await ctx.log('【铁骑】：判定不为红色，此【杀】照常结算');
      }
    },
  }],
});

defineSkill({
  id: 'wz2s_shenwei', name: '神威',
  desc: '锁定技，你计算与其他角色的距离 -1；当你使用【杀】造成伤害后，你摸一张牌。',
  triggers: [
    {
      on: 'distance.calc', who: 'self', optional: false,
      effect(ctx) {
        const d = ctx.data, p = ctx.self;
        if (!d || d.self !== p || !d.to || d.to === p) return;
        if (d.value <= 1) return;
        d.value -= 1;
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
        && (d.reason === 'sha' || (d.card && d.card.name === 'sha')),
      async effect(ctx) {
        const p = ctx.self;
        await ctx.draw(p, 1, { reason: 'shenwei' });
        await ctx.log(`【神威】：${p.name} 的【杀】造成伤害，摸一张牌`);
      },
    },
  ],
});

// ============================================================
// 武黄忠 · 烈魂 / 破阵
// ============================================================
defineSkill({
  id: 'wz2s_liehun', name: '烈魂',
  desc: '锁定技，当你使用的【杀】造成伤害时，若目标角色的体力值不大于你，此伤害 +1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
      && (d.reason === 'sha' || (d.card && d.card.name === 'sha'))
      && d.self.hp <= d.player.hp,
    async effect(ctx) {
      ctx.data.amount += 1;
      await ctx.log(`【烈魂】：${ctx.self.name} 的【杀】伤害 +1`);
    },
  }],
});

defineSkill({
  id: 'wz2s_pozhen', name: '破阵',
  desc: '出牌阶段限一次，你可以对一名其他角色造成 1 点伤害，然后你失去 1 点体力。',
  active: {
    perPhase: true,
    prompt: '对一名其他角色造成 1 点伤害，然后失去 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【破阵】：没有其他角色可选'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【破阵】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'pozhen',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'pozhen' });
      await ctx.log(`【破阵】：${p.name} 对 ${t.name} 造成 1 点伤害`);
      await ctx.loseHp(p, 1, { reason: 'pozhen' });
      await ctx.log(`【破阵】：${p.name} 失去 1 点体力`);
    },
  },
});

// ============================================================
// 武典韦 · 古之恶来 / 舍身
// ============================================================
defineSkill({
  id: 'wz2s_guzhielai2', name: '古之恶来',
  desc: '锁定技，其他角色计算与你的距离 +1；当你受到伤害后，你可以弃置伤害来源的一张牌。',
  triggers: [
    {
      on: 'distance.calc', who: 'any', optional: false,
      effect(ctx) {
        // distance.calc 走 triggerSync，引擎不调用 filter，必须在此自行校验
        const d = ctx.data, p = ctx.self;
        if (!d || !d.self || d.self === p || d.to !== p) return;
        d.value += 1;
      },
    },
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => d.self === d.player && !!d.from && d.from !== d.player
        && d.from.alive !== false && zonesOf(d.from).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, src = ctx.data.from;
        const pool = zonesOf(src);
        const picks = await g.chooseSomeCards(p, pool, 1, { prompt: `【古之恶来】：弃置 ${src.name} 的一张牌` });
        const c = picks[0] || pool[0];
        if (!c) return;
        await ctx.discard(src, [c], { reason: 'guzhielai2' });
        await ctx.log(`【古之恶来】：${p.name} 弃置 ${src.name} 的一张牌`);
      },
    },
  ],
});

defineSkill({
  id: 'wz2s_sheshen', name: '舍身',
  desc: '出牌阶段限一次，你可以失去 1 点体力，然后对一名其他角色造成 1 点伤害并摸一张牌。',
  active: {
    perPhase: true,
    prompt: '失去 1 点体力，对一名其他角色造成 1 点伤害并摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【舍身】：没有其他角色可选'); return; }
      await ctx.loseHp(p, 1, { reason: 'sheshen' });
      await ctx.log(`【舍身】：${p.name} 失去 1 点体力`);
      if (!p.alive) return;
      const ts = await ctx.ask.targets(p, {
        prompt: '【舍身】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'sheshen',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'sheshen' });
      await ctx.draw(p, 1, { reason: 'sheshen' });
      await ctx.log(`【舍身】：${p.name} 对 ${t.name} 造成 1 点伤害并摸一张牌`);
    },
  },
});

// ============================================================
// 星孙权 · 星衡 / 凝望
// ============================================================
defineSkill({
  id: 'wz2s_xingheng', name: '星衡',
  desc: '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。',
  active: {
    perPhase: true,
    prompt: '弃置任意张牌并摸等量的牌',
    async effect(ctx) {
      const p = ctx.self;
      const pool = zonesOf(p);
      if (!pool.length) { await ctx.log('【星衡】：你没有可弃置的牌'); return; }
      const res = await ctx.game.ask(p, 'cards', {
        prompt: '【星衡】：选择要弃置的牌', cards: pool.map(c => c.id), min: 0, max: 99, optional: true,
      });
      const cards = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
      if (!cards.length) { await ctx.log('【星衡】：未选择牌，取消发动'); return; }
      await ctx.discard(p, cards, { reason: 'xingheng' });
      await ctx.draw(p, cards.length, { reason: 'xingheng' });
      await ctx.log(`【星衡】：${p.name} 弃置 ${cards.length} 张牌并摸 ${cards.length} 张牌`);
    },
  },
});

defineSkill({
  id: 'wz2s_ningwang', name: '凝望',
  desc: '锁定技，结束阶段，若你的手牌数小于你的体力值，你摸一张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'end' && d.self === d.player && d.player.hand.length < d.player.hp,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'ningwang' });
      await ctx.log(`【凝望】：${p.name} 于结束阶段摸一张牌`);
    },
  }],
});

// ============================================================
// 星刘备 · 星德 / 仁望
// ============================================================
defineSkill({
  id: 'wz2s_xingde', name: '星德',
  desc: '出牌阶段限一次，你可以将任意张手牌交给一名其他角色，若你以此法给出的牌不少于两张，你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '将任意张手牌交给一名其他角色；给出不少于两张则摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【星德】：你没有手牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【星德】：没有其他角色可给牌'); return; }
      const res = await g.ask(p, 'cards', {
        prompt: '【星德】：选择要交出的手牌', cards: p.hand.map(c => c.id), min: 0, max: 99, optional: true,
      });
      const cards = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
      if (!cards.length) { await ctx.log('【星德】：未选择牌，取消发动'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【星德】：交给哪名其他角色', candidates: cands, min: 1, max: 1, reason: 'xingde',
      });
      const t = ts[0];
      if (!t) { await ctx.log('【星德】：未选择角色，取消发动'); return; }
      await ctx.gain(t, cards, { from: p, reason: 'xingde' });
      await ctx.log(`【星德】：${p.name} 将 ${cards.length} 张手牌交给 ${t.name}`);
      if (cards.length >= 2) {
        await ctx.draw(p, 1, { reason: 'xingde' });
        await ctx.log('【星德】：给出不少于两张牌，摸一张牌');
      }
    },
  },
});

defineSkill({
  id: 'wz2s_renwang', name: '仁望',
  desc: '当你受到伤害后，你可以令一名角色摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.self.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ts = await ctx.ask.targets(p, {
        prompt: '【仁望】：选择一名角色，令其摸一张牌', candidates: g.alive(), min: 1, max: 1, reason: 'renwang',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, 1, { reason: 'renwang' });
      await ctx.log(`【仁望】：${t.name} 摸一张牌`);
    },
  }],
});

// ============================================================
// 星曹操 · 星雄 / 观沧
// ============================================================
defineSkill({
  id: 'wz2s_xingxiong', name: '星雄',
  desc: '当你受到伤害后，你可以获得伤害来源的一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && !!d.from && d.from !== d.player
      && d.from.alive !== false && zonesOf(d.from).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, src = ctx.data.from;
      const pool = zonesOf(src);
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: `【星雄】：获得 ${src.name} 的一张牌` });
      const c = picks[0] || pool[0];
      if (!c) return;
      await ctx.gain(p, [c], { from: src, reason: 'xingxiong' });
      await ctx.log(`【星雄】：${p.name} 获得 ${src.name} 的一张牌`);
    },
  }],
});

defineSkill({
  id: 'wz2s_guancang', name: '观沧',
  desc: '出牌阶段限一次，你可以弃置一张牌，然后令一名角色摸两张牌。',
  active: {
    perPhase: true,
    prompt: '弃置一张牌，令一名角色摸两张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = zonesOf(p);
      if (!pool.length) { await ctx.log('【观沧】：你没有可弃置的牌'); return; }
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【观沧】：弃置一张牌' });
      const c = picks[0] || pool[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'guancang' });
      const ts = await ctx.ask.targets(p, {
        prompt: '【观沧】：选择一名角色，令其摸两张牌', candidates: g.alive(), min: 1, max: 1, reason: 'guancang',
      });
      const t = ts[0];
      if (!t) { await ctx.log('【观沧】：未选择角色，结算结束'); return; }
      await ctx.draw(t, 2, { reason: 'guancang' });
      await ctx.log(`【观沧】：${t.name} 摸两张牌`);
    },
  },
});

// ============================================================
// 星关羽 · 武星 / 威震
// ============================================================
defineSkill({
  id: 'wz2s_wuxing', name: '武星',
  desc: '出牌阶段限一次，你可以将一张红色手牌当【杀】使用（无距离限制）。',
  active: {
    perPhase: true,
    prompt: '将一张红色手牌当【杀】使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const reds = p.hand.filter(isRedC);
      if (!reds.length) { await ctx.log('【武星】：你没有红色手牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【武星】：没有其他角色可选'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【武星】：选择【杀】的目标', candidates: cands, min: 1, max: 1, reason: 'wuxing',
      });
      const t = ts[0];
      if (!t) return;
      const [c] = await g.chooseSomeCards(p, reds, 1, { prompt: '【武星】：选择一张红色手牌作为【杀】' });
      const src = c || reds[0];
      if (!src) return;
      await ctx.discard(p, [src], { reason: 'wuxing' });
      await ctx.log(`【武星】：${p.name} 将 ${cardLabel(src)} 当【杀】对 ${t.name} 使用`);
      await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'wuxing', ignoreRange: true, ignoreShaLimit: true });
    },
  },
});

defineSkill({
  id: 'wz2s_weizhen', name: '威震',
  desc: '锁定技，当你使用的【杀】造成伤害时，若目标角色已受伤，此伤害 +1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
      && (d.reason === 'sha' || (d.card && d.card.name === 'sha'))
      && d.self.hp < (d.self.maxHp ?? d.self.hp),
    async effect(ctx) {
      ctx.data.amount += 1;
      await ctx.log(`【威震】：目标已受伤，${ctx.self.name} 的【杀】伤害 +1`);
    },
  }],
});

// ============================================================
// 星张飞 · 星吼 / 星啸
// ============================================================
defineSkill({
  id: 'wz2s_xinghou', name: '星吼',
  desc: '出牌阶段限一次，你可以弃置一张牌，视为对一名其他角色使用一张【杀】。',
  active: {
    perPhase: true,
    prompt: '弃置一张牌，视为对一名其他角色使用一张【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = zonesOf(p);
      if (!pool.length) { await ctx.log('【星吼】：你没有可弃置的牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【星吼】：没有其他角色可选'); return; }
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【星吼】：弃置一张牌' });
      const c = picks[0] || pool[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'xinghou' });
      const ts = await ctx.ask.targets(p, {
        prompt: '【星吼】：选择【杀】的目标', candidates: cands, min: 1, max: 1, reason: 'xinghou',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.log(`【星吼】：${p.name} 视为对 ${t.name} 使用一张【杀】`);
      await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'xinghou', ignoreRange: true });
    },
  },
});

defineSkill({
  id: 'wz2s_xingxiao', name: '星啸',
  desc: '锁定技，当你使用的【杀】造成伤害时，若你的手牌数不大于 1，此伤害 +1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
      && (d.reason === 'sha' || (d.card && d.card.name === 'sha'))
      && d.player.hand.length <= 1,
    async effect(ctx) {
      ctx.data.amount += 1;
      await ctx.log(`【星啸】：${ctx.self.name} 手牌无几，此【杀】伤害 +1`);
    },
  }],
});

// ============================================================
// 星大乔 · 星影 / 遗珠
// ============================================================
defineSkill({
  id: 'wz2s_xingying', name: '星影',
  desc: '锁定技，其他角色计算与你的距离 +1。',
  triggers: [{
    on: 'distance.calc', who: 'any', optional: false,
    effect(ctx) {
      // distance.calc 走 triggerSync，引擎不调用 filter，必须在此自行校验
      const d = ctx.data, p = ctx.self;
      if (!d || !d.self || d.self === p || d.to !== p) return;
      d.value += 1;
    },
  }],
});

defineSkill({
  id: 'wz2s_yizhu', name: '遗珠',
  desc: '出牌阶段限一次，你可以令一名角色摸两张牌，然后其弃置一张牌。',
  active: {
    perPhase: true,
    prompt: '令一名角色摸两张牌，然后弃置一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ts = await ctx.ask.targets(p, {
        prompt: '【遗珠】：选择一名角色', candidates: g.alive(), min: 1, max: 1, reason: 'yizhu',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, 2, { reason: 'yizhu' });
      await ctx.log(`【遗珠】：${t.name} 摸两张牌`);
      if (!t.hand.length) return;
      const picks = await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【遗珠】：弃置一张手牌' });
      const c = picks[0] || t.hand[0];
      await ctx.discard(t, [c], { reason: 'yizhu' });
      await ctx.log(`【遗珠】：${t.name} 弃置一张牌`);
    },
  },
});
