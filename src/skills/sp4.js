// 阶段 5F · 手杀 SP + 界 精选（pack = 'sp4'）技能实现
// ---------------------------------------------------------------
// SP 组：高翔【驰应】 崔琰&毛玠【征辟】【奉迎】 董白【连诛】【黠慧】
//        程昱【设伏】【贲育】 兀突骨【燃殇】【悍勇】 灵雎【竭缘】【焚心】
//        丁尚涴【讽言】【抚悼】 钟繇【活墨】【佐定】
// 界组：界王基【奇制】【进趋】 界周妃【良姻】【箜声】
//
// 技能 id 一律使用 sk4_ 前缀（不使用 jie_/mou_/ji_/shen_/sp_/ol_/bc_，避免被引擎降级别名）。
//
// ★★ 资料未核实 / 实现口径收窄清单（详见 src/data/sp4.js 文件头同名清单）★★
//  1. 高翔【驰应】：按官网 2024 版「其可以弃置其攻击范围内任意名其他角色各一张牌」实现。
//  2. 崔琰&毛玠【征辟】【奉迎】：按移动版官网（sanguosha.cn）文本实现；「选择角色数 +1」
//     额度机制为本批自行复现口径（p.flags.zhengbiQuota，初始 1）。
//  3. 董白【黠慧】：只实现「黑色牌不计入手牌上限」+「被他人获得的黑色牌打上『黠慧』标记，
//     其体力值减少时标记消失」；官方「不能使用/打出/弃置」需全局拦截用牌流程，引擎无该钩子，
//     故 desc 已如实收窄，未写入该句。
//  4. 兀突骨【燃殇】【悍勇】：按手杀（移动版）文本，含「燃 > 2 时减 2 点体力上限并摸两张牌」。
//  5. 灵雎【焚心】：引擎无「身份牌」实物，按互换 player.role 实现（主公不可参与）。
//  6. 丁尚涴【抚悼】：实现「各摸两张牌」与「决裂」标记（受伤 +1）；官方
//     「『决裂』角色使用黑色牌指定你为目标后，其本回合不能再使用牌」未实现，desc 未写该句。
//  7. 钟繇【活墨】：官方为「当你需要使用基本牌时」的响应式转化（回合外可当【闪】【桃】），
//     引擎无「需要使用」通用钩子，本批收窄为出牌阶段主动发动，desc 已如实收窄。
//  8. 界王基【奇制】【进趋】：官方为「蓄力技」体系，引擎无原生蓄力点，用 player.marks.xuli
//     复现，并在技能对象上打 xuliTech: true 供跨将识别。
//  9. 界周妃【良姻】③：「每轮结束时」——round.end 已存在（game.js runTurn，self = 上一回合行动者）；
//     本处仍改写为在下一次 round.begin 结算上一轮，属历史写法，可评估迁移。
// 10. 若干「观看手牌」用引擎既有的暗选接口（chooseCardFrom / 手牌暗选）近似，不做真实展示。
// ---------------------------------------------------------------
import { defineSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

// ---------------- 公用小工具 ----------------
let vseq = 0;
const VC = (name, suit = 'spade', num = 7, extra = {}) => ({
  id: `vc4_${++vseq}`, name, suit, num,
  type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const isRedC = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const isBlackC = (c) => !!c && (c.suit === 'spade' || c.suit === 'club');
const allCardsOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card)),
];
const aliveOthers = (g, p) => g.alive().filter(x => x !== p);
const maxOf = (arr) => (arr.length ? Math.max(...arr) : 0);
const typeOf = (name) => CARD_META[name]?.type || null;
const isBasicOrTrick = (name) => ['basic', 'trick'].includes(typeOf(name));
// 体力上限 / 下限不得小于 1
const safeMaxHp = (p, d) => Math.max(1, p.maxHp - d);

// 使用一张「不在手牌里」的牌（武将牌上 / 牌堆顶 / 弃牌堆挑出的牌）
const playAsideCard = async (ctx, p, c, reason) => {
  const g = ctx.game;
  const meta = CARD_META[c?.name];
  if (!meta) return false;
  if (meta.type === 'equip') {
    for (const q of g.players) {
      const i = q.hand.indexOf(c);
      if (i >= 0) q.hand.splice(i, 1);
    }
    await g.equipCard(p, c);
    return true;
  }
  if (c.name === 'shan' || c.name === 'wuxie') return false;
  const rule = meta.target;
  let tg = [];
  if (rule && !rule.all && !rule.self && !rule.func) {
    const cands = g.candidatesFor(p, { name: c.name }, c.name);
    if (!cands.length) return false;
    const mx = Math.max(1, Math.min(rule.max || 1, cands.length));
    tg = await ctx.ask.targets(p, {
      prompt: `【${reason}】：选择【${meta.cn}】的目标`, candidates: cands, min: rule.min || 1, max: mx,
    });
    if (!tg || !tg.length) return false;
  }
  return (await ctx.useCard({ from: p, card: c, targets: tg, reason, ignoreRange: true })) !== false;
};

// ======================================================================
// 高翔 · 驰应（出牌阶段限一次）
// 出牌阶段限一次，你可以选择一名体力值不大于你的角色，其可以弃置其攻击范围内
// 任意名其他角色各一张牌。若选择的角色不为你，其获得弃置牌中的基本牌。
// ======================================================================
defineSkill({
  id: 'sk4_chiying', name: '驰应',
  desc: '出牌阶段限一次，你可以选择一名体力值不大于你的角色，其可以弃置其攻击范围内任意名其他角色各一张牌。若选择的角色不为你，其获得弃置牌中的基本牌。',
  active: {
    perPhase: true,
    prompt: '驰应：选择一名体力值不大于你的角色，令其攻击范围内的其他角色各弃置一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x.hp <= p.hp);
      if (!cands.length) { await ctx.log('【驰应】：没有可选角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【驰应】：选择一名体力值不大于你的角色', candidates: cands, min: 1, max: 1,
      });
      const a = ts[0];
      if (!a) return;
      const victims = g.alive().filter(x => x !== a && g.inAttackRange(a, x));
      if (!victims.length) { await ctx.log(`【驰应】：${a.name} 攻击范围内没有其他角色`); return; }
      await ctx.log(`【驰应】：${p.name} 令 ${a.name} 攻击范围内的 ${victims.map(v => v.name).join('、')} 各弃置一张牌`);
      const thrown = [];
      for (const v of victims) {
        const pool = [...v.hand, ...Object.values(v.equips).filter(Boolean)];
        if (!pool.length) continue;
        const [c] = await g.chooseSomeCards(v, pool, 1, { prompt: '【驰应】：弃置一张牌' });
        const card = c || pool[0];
        thrown.push(card);
        await ctx.discard(v, [card], { reason: 'chiying' });
      }
      if (!thrown.length) return;
      if (a !== p) {
        const basics = thrown.filter(c => typeOf(c.name) === 'basic');
        if (basics.length) {
          await ctx.gain(a, basics, { reason: 'chiying' });
          await ctx.log(`【驰应】：${a.name} 获得弃置牌中的基本牌 ${basics.map(cardLabel).join('、')}`);
        }
      }
    },
  },
});

// ======================================================================
// 崔琰&毛玠 · 征辟（准备阶段）
// 准备阶段，你可选择至多{一}名其他角色，其选择令你获得其区域内的一至三张牌，
// 然后你交给其等量张牌。每名角色限一次，若其选择三，则你因“征辟”中选择的角色数+1。
// ======================================================================
defineSkill({
  id: 'sk4_zhengbi', name: '征辟',
  desc: '准备阶段，你可以选择至多一名其他角色，其选择令你获得其区域内的一至三张牌，然后你交给其等量张牌；每名角色限一次，若其选择三，则你因“征辟”可选择的其他角色数+1。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.player.alive,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const quota = Math.max(1, p.flags.zhengbiQuota || 1);
      const used = p.flags.zhengbiUsed || [];
      const cands = aliveOthers(g, p).filter(x => !used.includes(x.id));
      if (!cands.length) { await ctx.log('【征辟】：没有可选的其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: `【征辟】：选择至多 ${Math.min(quota, cands.length)} 名其他角色（本技能每名角色限一次）`,
        candidates: cands, min: 1, max: Math.min(quota, cands.length),
      });
      if (!ts.length) return;
      for (const t of ts) {
        if (!t.alive) continue;
        p.flags.zhengbiUsed = [...(p.flags.zhengbiUsed || []), t.id];
        const idx = await ctx.ask.choose(t, ['获得1张', '获得2张', '获得3张'], {
          prompt: `【征辟】：${p.name} 对你发动【征辟】，是否令其获得你区域内的牌？`, reason: 'zhengbi',
        });
        if (idx < 0) { await ctx.log(`【征辟】：${t.name} 放弃`); continue; }
        const n = Math.min(idx + 1, 3);
        const picks = [];
        for (let i = 0; i < n; i++) {
          const c = await g.chooseCardFrom(p, t, { reason: 'zhengbi' });
          if (!c || picks.includes(c)) break;
          picks.push(c);
        }
        if (!picks.length) continue;
        await ctx.gain(p, picks, { from: t, reason: 'zhengbi' });
        await ctx.log(`【征辟】：${p.name} 获得 ${t.name} 的 ${picks.length} 张牌（${picks.map(cardLabel).join('、')}）`);
        // 交给其等量张牌
        const giveN = Math.min(picks.length, p.hand.length);
        if (giveN > 0) {
          const back = await g.chooseSomeCards(p, p.hand.slice(), giveN, { prompt: `【征辟】：交给 ${t.name} ${giveN} 张牌` });
          if (back && back.length) await ctx.gain(t, back, { from: p, reason: 'zhengbi' });
        }
        if (n === 3) {
          p.flags.zhengbiQuota = (p.flags.zhengbiQuota || 1) + 1;
          await ctx.log(`【征辟】：${t.name} 选择获得三张，${p.name} 因“征辟”可选择的其他角色数 +1（当前 ${p.flags.zhengbiQuota}）`);
        }
      }
    },
  }],
});

// ======================================================================
// 崔琰&毛玠 · 奉迎（限定技）
// 限定技，出牌阶段，你可选择一名角色，然后你令其攻击范围内的所有其他角色各将
// 一张手牌当【无中生有】对其使用；若该角色的体力上限为全场最大，则你于此回合
// 结束后执行一个额外的回合。
// ======================================================================
defineSkill({
  id: 'sk4_fengying', name: '奉迎',
  desc: '限定技，出牌阶段，你可以选择一名角色，然后你令其攻击范围内的所有其他角色各将一张手牌当【无中生有】对其使用；若该角色的体力上限为全场最大，则你于此回合结束后执行一个额外的回合。',
  active: {
    perTurn: false,
    prompt: '奉迎（限定技）：令一名角色攻击范围内的所有其他角色各将一张手牌当【无中生有】对其使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.fengyingUsed) { await ctx.log('【奉迎】：限定技本局已发动过'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【奉迎】：选择一名角色', candidates: g.alive(), min: 1, max: 1,
      });
      const t = ts[0];
      if (!t) return;
      p.flags.fengyingUsed = true;
      await ctx.log(`【奉迎】（限定技）：${p.name} 令 ${t.name} 攻击范围内的其他角色各将一张手牌当【无中生有】对其使用`);
      const users = g.alive().filter(x => x !== t && g.inAttackRange(t, x) && x.hand.length > 0);
      for (const u of users) {
        const [c] = await g.chooseSomeCards(u, u.hand.slice(), 1, { prompt: `【奉迎】：将一张手牌当【无中生有】对 ${t.name} 使用` });
        const card = c || u.hand[0];
        await ctx.discard(u, [card], { reason: 'fengying' });
        await ctx.log(`【奉迎】：${u.name} 将 ${cardLabel(card)} 当【无中生有】对 ${t.name} 使用`);
        if (t.alive) await ctx.draw(t, 2, { reason: 'fengying' });
      }
      const mx = maxOf(g.alive().map(x => x.maxHp));
      if (t.maxHp >= mx && t.alive) {
        ctx.extraTurn(p);
        await ctx.log(`【奉迎】：${t.name} 的体力上限为全场最多，${p.name} 于此回合结束后执行一个额外的回合`);
      }
    },
  },
});

// ======================================================================
// 董白 · 连诛（出牌阶段限一次）
// 出牌阶段限一次，你可以展示并交给一名其他角色一张牌，若该牌为黑色，其选择一项：
// 1.你摸两张牌；2.弃置两张牌。
// ======================================================================
defineSkill({
  id: 'sk4_lianzhu', name: '连诛',
  desc: '出牌阶段限一次，你可以展示并交给一名其他角色一张牌，若该牌为黑色，其选择一项：1.你摸两张牌；2.弃置两张牌。',
  active: {
    perPhase: true,
    prompt: '连诛：展示并交给一名其他角色一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【连诛】：没有手牌'); return; }
      const pool = aliveOthers(g, p);
      if (!pool.length) return;
      const [c] = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【连诛】：选择要展示并交给他人的一张手牌' });
      if (!c) return;
      const ts = await ctx.ask.targets(p, { prompt: '【连诛】：交给哪名其他角色？', candidates: pool, min: 1, max: 1 });
      const t = ts[0];
      if (!t) return;
      await ctx.gain(t, [c], { from: p, reason: 'lianzhu' });
      await ctx.log(`【连诛】：${p.name} 展示并交给 ${t.name} ${cardLabel(c)}`);
      if (!isBlackC(c)) return;
      c.__xiahui = true;   // 【黠慧】标记：由他人获得的董白黑色牌
      const idx = await ctx.ask.choose(t, ['令董白摸两张牌', '弃置两张牌'], {
        prompt: `【连诛】：${cardLabel(c)} 为黑色，请选择一项`, reason: 'lianzhu',
      });
      if (idx === 1) {
        const n = Math.min(2, t.hand.length + Object.values(t.equips).filter(Boolean).length);
        if (n > 0) {
          const dpool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
          const picks = await g.chooseSomeCards(t, dpool, n, { prompt: `【连诛】：弃置 ${n} 张牌` });
          const cards = (picks && picks.length ? picks : dpool.slice(0, n));
          await ctx.discard(t, cards, { reason: 'lianzhu' });
        }
      } else {
        await ctx.draw(p, 2, { reason: 'lianzhu' });
        await ctx.log('【连诛】：董白摸两张牌');
      }
    },
  },
});

// ======================================================================
// 董白 · 黠慧（锁定技）
// 锁定技，你的黑色牌不计入你的手牌上限；其他角色获得你的黑色牌后，这些牌被标记为
// “黠慧”，其体力值减少时“黠慧”标记消失。
// （官方「其不能使用、打出、弃置『黠慧』牌」需全局拦截用牌流程，引擎无该钩子，未实现。）
// ======================================================================
defineSkill({
  id: 'sk4_xiahui', name: '黠慧',
  desc: '锁定技，你的黑色牌不计入你的手牌上限；其他角色获得你的黑色牌后，这些牌标记为“黠慧”，其体力值减少时“黠慧”标记消失。',
  triggers: [
    {
      // 弃牌阶段：黑色手牌不占用手牌上限 → 通过 flags.handLimit 临时抬高上限
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'discard' && d.player.alive,
      async effect(ctx) {
        const p = ctx.self;
        const blacks = p.hand.filter(isBlackC).length;
        p.flags.__xlPrevLimit = p.flags.handLimit || 0;
        p.flags.handLimit = (p.flags.handLimit || 0) + blacks;
        if (blacks > 0) await ctx.log(`【黠慧】：${p.name} 的 ${blacks} 张黑色手牌不计入手牌上限（上限 +${blacks}）`);
      },
    },
    {
      on: 'phase.end', who: 'self', optional: false,
      filter: (d) => d.phase === 'discard',
      async effect(ctx) {
        const p = ctx.self;
        if (p.flags.__xlPrevLimit !== undefined) {
          p.flags.handLimit = p.flags.__xlPrevLimit;
          delete p.flags.__xlPrevLimit;
        }
      },
    },
    {
      // 其他角色获得董白的黑色牌 → 打上“黠慧”标记
      on: 'cards.gain', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.self !== d.player && (d.cards || []).some(isBlackC),
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.self;
        const blacks = (ctx.data.cards || []).filter(isBlackC);
        for (const c of blacks) c.__xiahui = true;
        t.marks = { ...(t.marks || {}) };
        await ctx.log(`【黠慧】：${t.name} 获得 ${p.name} 的 ${blacks.length} 张黑色牌，标记为“黠慧”`);
      },
    },
    {
      // 体力值减少 → “黠慧”标记消失
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.self && (d.self.hand || []).some(c => c.__xiahui),
      async effect(ctx) {
        const t = ctx.data.self;
        let n = 0;
        for (const c of t.hand) if (c.__xiahui) { delete c.__xiahui; n++; }
        if (n) await ctx.log(`【黠慧】：${t.name} 体力值减少，${n} 张“黠慧”牌标记消失`);
      },
    },
    {
      on: 'hp.lose', who: 'any', optional: false,
      filter: (d) => d.self && (d.self.hand || []).some(c => c.__xiahui),
      async effect(ctx) {
        const t = ctx.data.self;
        let n = 0;
        for (const c of t.hand) if (c.__xiahui) { delete c.__xiahui; n++; }
        if (n) await ctx.log(`【黠慧】：${t.name} 体力值减少，${n} 张“黠慧”牌标记消失`);
      },
    },
  ],
});

// ======================================================================
// 程昱 · 设伏（结束阶段）
// 结束阶段，你可以记录一个基本牌或锦囊牌的名称并扣置一张手牌，称为“伏兵”。
// 当其他角色于你回合外使用牌时，你可以移去一张记录名称相同的“伏兵”，然后此牌无效。
// ======================================================================
const FUBING_NAMES = Object.entries(CARD_META)
  .filter(([, m]) => m.type === 'basic' || m.type === 'trick')
  .map(([key, m]) => ({ key, cn: m.cn }));

defineSkill({
  id: 'sk4_shefu', name: '设伏',
  desc: '结束阶段，你可以记录一个基本牌或锦囊牌的名称并扣置一张手牌，称为“伏兵”。当其他角色于你回合外使用牌时，你可以移去一张记录名称相同的“伏兵”，然后此牌无效。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'end' && d.player.alive && d.player.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const used = (p.flags.fubing || []).map(f => f.key);
        const pool = FUBING_NAMES.filter(x => !used.includes(x.key));
        if (!pool.length) { await ctx.log('【设伏】：所有牌名均已记录'); return; }
        const idx = await ctx.ask.choose(p, pool.map(x => x.cn), {
          prompt: '【设伏】：记录一个基本牌或锦囊牌的名称', reason: 'shefu',
        });
        if (idx < 0 || !pool[idx]) return;
        const pick = pool[idx];
        const [c] = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【设伏】：扣置一张手牌作为“伏兵”' });
        if (!c) return;
        const i = p.hand.indexOf(c);
        if (i >= 0) p.hand.splice(i, 1);
        p.flags.fubing = [...(p.flags.fubing || []), { key: pick.key, cn: pick.cn, card: c }];
        p.marks = { ...(p.marks || {}), fubing: p.flags.fubing.length };
        await ctx.log(`【设伏】：${p.name} 扣置一张手牌，记录牌名【${pick.cn}】（当前伏兵 ${p.flags.fubing.length} 个）`);
      },
    },
    {
      on: 'card.use.before', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player;
        if (!p || d.self === p) return false;               // 须为其他角色
        if (d.game.turnPlayer === p) return false;          // 须于你的回合外
        const list = p.flags.fubing || [];
        return list.some(f => f.key === d.effName);
      },
      async effect(ctx) {
        const p = ctx.self;
        const list = p.flags.fubing || [];
        const i = list.findIndex(f => f.key === ctx.data.effName);
        if (i < 0) return;
        const f = list.splice(i, 1)[0];
        p.flags.fubing = list;
        p.marks = { ...(p.marks || {}), fubing: list.length };
        ctx.data.canceled = true;
        // 移去的「伏兵」牌必须进弃牌堆，否则实体牌永久消失（牌张不守恒）。
        if (f.card && !ctx.game.discardPile.includes(f.card)) ctx.game.pushDiscard([f.card]);
        await ctx.log(`【设伏】：${p.name} 移去记录【${f.cn}】的“伏兵”（${cardLabel(f.card)}），此牌无效`);
      },
    },
  ],
});

// ======================================================================
// 程昱 · 贲育
// 当你受到伤害后，你可以选择一项：1.将手牌摸至与伤害来源手牌数相同（最多摸至5张）；
// 2.弃置大于伤害来源手牌数的手牌，然后对其造成1点伤害。
// ======================================================================
defineSkill({
  id: 'sk4_benyu', name: '贲育',
  desc: '当你受到伤害后，你可以选择一项：1.将手牌摸至与伤害来源手牌数相同（最多摸至5张）；2.弃置大于伤害来源手牌数的手牌，然后对其造成1点伤害。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.self === d.player && d.player.alive && !!(d.from && d.from !== d.player),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const src = ctx.data.from;
      if (!src) return;
      const x = src.hand.length;
      const opts = [];
      if (p.hand.length < x) opts.push({ key: 'draw', label: `将手牌摸至 ${Math.min(x, 5)} 张（伤害来源手牌 ${x} 张）` });
      if (p.hand.length > x) opts.push({ key: 'discard', label: `弃置 ${x + 1} 张手牌，然后对 ${src.name} 造成1点伤害` });
      if (!opts.length) { await ctx.log(`【贲育】：${p.name} 手牌 ${p.hand.length} 张与来源相同，无法发动`); return; }
      const idx = await ctx.ask.choose(p, opts.map(o => o.label), { prompt: '【贲育】：请选择一项', reason: 'benyu' });
      if (idx < 0 || !opts[idx]) return;
      if (opts[idx].key === 'draw') {
        const target = Math.min(x, 5);
        const n = target - p.hand.length;
        if (n > 0) { await ctx.draw(p, n, { reason: 'benyu' }); await ctx.log(`【贲育】：${p.name} 将手牌摸至 ${target} 张`); }
      } else {
        const need = x + 1;
        const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(need, p.hand.length), { prompt: `【贲育】：弃置 ${need} 张手牌` });
        const cards = picks && picks.length ? picks : p.hand.slice(0, need);
        if (cards.length <= x) { await ctx.log('【贲育】：弃置数目不大于来源手牌数，效果取消'); return; }
        await ctx.discard(p, cards, { reason: 'benyu' });
        await ctx.log(`【贲育】：${p.name} 弃置 ${cards.length} 张手牌，对 ${src.name} 造成1点伤害`);
        if (src.alive) await ctx.damage({ from: p, to: src, amount: 1, nature: 'normal', reason: 'benyu' });
      }
    },
  }],
});

// ======================================================================
// 兀突骨 · 燃殇（锁定技）
// 锁定技，当你受到1点火焰伤害后，你获得1枚“燃”标记；结束阶段，你失去X点体力
// （X为“燃”标记的数量），然后若“燃”标记的数量超过2个，则你减2点体力上限并摸两张牌。
// ======================================================================
defineSkill({
  id: 'sk4_ranshang', name: '燃殇',
  desc: '锁定技，当你受到1点火焰伤害后，你获得1枚“燃”；结束阶段，你失去X点体力（X为“燃”的数量），然后若“燃”的数量超过2个，则你减2点体力上限并摸两张牌。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.self === d.player && d.nature === 'fire' && (d.amount || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        const n = Math.max(1, ctx.data.amount || 1);
        p.marks = { ...(p.marks || {}) };
        p.marks.ran = (p.marks.ran || 0) + n;
        await ctx.log(`【燃殇】：${p.name} 受到 ${n} 点火焰伤害，获得 ${n} 枚“燃”（共 ${p.marks.ran} 枚）`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'end' && d.player.alive && (d.player.marks?.ran || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        const x = p.marks.ran || 0;
        p.marks.ran = 0;
        await ctx.log(`【燃殇】：结束阶段，${p.name} 失去 ${x} 点体力`);
        await ctx.loseHp(p, x, { reason: 'ranshang' });
        if (x > 2 && p.alive) {
          const before = p.maxHp;
          p.maxHp = safeMaxHp(p, 2);
          await ctx.log(`【燃殇】：“燃”超过 2 枚，${p.name} 减 2 点体力上限（${before} → ${p.maxHp}）并摸两张牌`);
          if (p.hp > p.maxHp) p.hp = p.maxHp;
          await ctx.draw(p, 2, { reason: 'ranshang' });
        }
      },
    },
  ],
});

// ======================================================================
// 兀突骨 · 悍勇
// 当你使用【南蛮入侵】、【万箭齐发】或黑桃普通【杀】时，若你已受伤，你可以令此牌
// 造成的伤害+1。然后若你的体力值大于游戏轮数，你获得一个“燃”标记。
// ======================================================================
defineSkill({
  id: 'sk4_hanyong', name: '悍勇',
  desc: '当你使用【南蛮入侵】、【万箭齐发】或黑桃普通【杀】时，若你已受伤，你可以令此牌造成的伤害+1。然后若你的体力值大于游戏轮数，你获得一个“燃”标记。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player;
      if (!p || d.from !== p) return false;
      if (!d.card || d.card.__hanyong) return false;
      if (p.hp >= p.maxHp) return false;            // 须已受伤
      const nm = d.card.name;
      if (nm === 'nanman' || nm === 'wanjian') return true;
      return nm === 'sha' && d.card.suit === 'spade';
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const card = ctx.data.card;
      card.__hanyong = true;
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      await ctx.log(`【悍勇】：${p.name} 令 ${cardLabel(card)} 造成的伤害 +1`);
      const round = g.round || 1;
      if (p.hp > round) {
        p.marks = { ...(p.marks || {}) };
        p.marks.ran = (p.marks.ran || 0) + 1;
        await ctx.log(`【悍勇】：${p.name} 的体力值 ${p.hp} 大于轮数 ${round}，获得 1 枚“燃”（共 ${p.marks.ran} 枚）`);
      }
    },
  }],
});

// ======================================================================
// 灵雎 · 竭缘
// 当你对其他角色造成伤害时，若其体力值不小于你，你可以弃置一张黑色手牌，此伤害+1；
// 当你受到其他角色造成的伤害时，若其体力值不小于你，你可以弃置一张红色手牌，此伤害-1。
// ======================================================================
defineSkill({
  id: 'sk4_jieyuan', name: '竭缘',
  desc: '当你对其他角色造成伤害时，若其体力值不小于你，你可以弃置一张黑色手牌，此伤害+1；当你受到其他角色造成的伤害时，若其体力值不小于你，你可以弃置一张红色手牌，此伤害-1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player;
      if (!p || !d.from || d.canceled) return false;
      if (d.from === p && d.self !== p) return d.self.hp >= p.hp;      // 造成伤害
      if (d.self === p && d.from !== p) return d.from.hp >= p.hp;     // 受到伤害
      return false;
    },
    async effect(ctx) {
      const p = ctx.self;
      const g = ctx.game;
      const isDeal = ctx.data.from === p;
      const other = isDeal ? ctx.data.self : ctx.data.from;
      const wantBlack = isDeal;
      const pool = p.hand.filter(c => (wantBlack ? isBlackC(c) : isRedC(c)));
      if (!pool.length) return;
      const [c] = await g.chooseSomeCards(p, pool, 1, { prompt: `【竭缘】：弃置一张${wantBlack ? '黑' : '红'}色手牌，使此伤害${wantBlack ? '+1' : '-1'}` });
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'jieyuan' });
      if (isDeal) {
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log(`【竭缘】：${p.name} 弃置 ${cardLabel(c)}，对 ${other.name} 的伤害 +1`);
      } else {
        ctx.data.amount = Math.max(0, (ctx.data.amount || 1) - 1);
        await ctx.log(`【竭缘】：${p.name} 弃置 ${cardLabel(c)}，受到的伤害 -1`);
      }
    },
  }],
});

// ======================================================================
// 灵雎 · 焚心（限定技）
// 限定技，当你杀死了一名角色时，若你不为主公，则你可以与其交换身份牌。
// ======================================================================
defineSkill({
  id: 'sk4_fenxin', name: '焚心',
  desc: '限定技，当你杀死了一名角色时，若你不为主公，则你可以与其交换身份牌。',
  triggers: [{
    on: 'death.after', who: 'any', optional: true,
    filter: (d) => {
      const p = d.player;
      if (!p || p.flags.fenxinUsed) return false;
      if (d.killer !== p) return false;
      if (!d.self || d.self === p) return false;
      if (p.role === 'lord' || d.self.role === 'lord') return false;
      return !!(p.role && d.self.role);
    },
    async effect(ctx) {
      const p = ctx.self, dead = ctx.data.self;
      p.flags.fenxinUsed = true;
      const mine = p.role, theirs = dead.role;
      p.role = theirs;
      dead.role = mine;
      await ctx.log(`【焚心】（限定技）：${p.name} 与 ${dead.name} 交换身份牌（${mine} ⇄ ${theirs}）`);
    },
  }],
});

// ======================================================================
// 丁尚涴 · 讽言（出牌阶段每项限一次）
// 出牌阶段每项限一次，你可以选择一名其他角色，若其体力值小于等于你，你令其交给你
// 一张手牌；若其手牌数小于等于你，你视为对其使用一张【杀】（无视距离且不计次数）。
// ======================================================================
defineSkill({
  id: 'sk4_fengyan', name: '讽言',
  desc: '出牌阶段每项限一次，你可以选择一名其他角色，若其体力值小于等于你，你令其交给你一张手牌；若其手牌数小于等于你，你视为对其使用一张【杀】（无视距离且不计次数）。',
  active: {
    perTurn: false,
    prompt: '讽言：令一名体力值不大于你的角色交给你一张手牌，或视为对其使用一张【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = g.turnCount;
      const others = aliveOthers(g, p);
      const can1 = p.flags.fy1Turn !== t && others.some(x => x.hp <= p.hp && x.hand.length > 0);
      const can2 = p.flags.fy2Turn !== t && others.some(x => x.hand.length <= p.hand.length);
      if (!can1 && !can2) { await ctx.log('【讽言】：本回合两项均已发动或无条件'); return; }
      const opts = [];
      if (can1) opts.push({ key: 1, label: '令一名体力值不大于你的角色交给你一张手牌' });
      if (can2) opts.push({ key: 2, label: '视为对一名手牌数不大于你的角色使用一张【杀】（无视距离且不计次数）' });
      const idx = await ctx.ask.choose(p, opts.map(o => o.label), { prompt: '【讽言】：请选择一项', reason: 'fengyan' });
      if (idx < 0 || !opts[idx]) return;
      if (opts[idx].key === 1) {
        const cands = others.filter(x => x.hp <= p.hp && x.hand.length > 0);
        const ts = await ctx.ask.targets(p, { prompt: '【讽言】：选择一名体力值不大于你的角色', candidates: cands, min: 1, max: 1 });
        const v = ts[0];
        if (!v) return;
        p.flags.fy1Turn = t;
        const [c] = await g.chooseSomeCards(v, v.hand.slice(), 1, { prompt: `【讽言】：交给 ${p.name} 一张手牌` });
        const card = c || v.hand[0];
        await ctx.gain(p, [card], { from: v, reason: 'fengyan' });
        await ctx.log(`【讽言】：${v.name} 交给 ${p.name} ${cardLabel(card)}`);
      } else {
        const cands = others.filter(x => x.hand.length <= p.hand.length);
        const ts = await ctx.ask.targets(p, { prompt: '【讽言】：选择一名手牌数不大于你的角色', candidates: cands, min: 1, max: 1 });
        const v = ts[0];
        if (!v) return;
        p.flags.fy2Turn = t;
        await ctx.log(`【讽言】：${p.name} 视为对 ${v.name} 使用一张【杀】`);
        await ctx.useCard({ from: p, card: VC('sha'), targets: [v], reason: 'fengyan', ignoreRange: true, ignoreShaLimit: true });
      }
    },
  },
});

// ======================================================================
// 丁尚涴 · 抚悼
// 游戏开始时，你选择一名其他角色。你与其每回合首次使用牌指定对方为目标后，各摸两张牌。
// 杀死你或该角色的其他角色获得一个“决裂”标记。你或该角色对有“决裂”标记的角色
// 造成的伤害+1。
// ======================================================================
defineSkill({
  id: 'sk4_fudao', name: '抚悼',
  desc: '游戏开始时，你选择一名其他角色。你与其每回合首次使用牌指定对方为目标后，各摸两张牌。杀死你或该角色的其他角色获得一个“决裂”标记；你或该角色对有“决裂”标记的角色造成的伤害+1。',
  triggers: [
    {
      on: 'game.start', who: 'any', optional: true,
      filter: (d) => d.player.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = aliveOthers(g, p);
        if (!cands.length) return;
        const ts = await ctx.ask.targets(p, { prompt: '【抚悼】：选择一名其他角色与之互为犄角', candidates: cands, min: 1, max: 1 });
        const t = ts[0];
        if (!t) return;
        p.flags.fudao = t.id;
        t.flags.fudao = p.id;
        p.marks = { ...(p.marks || {}), fudao: 1 };
        await ctx.log(`【抚悼】：${p.name} 选择 ${t.name}；你与其每回合首次使用牌指定对方为目标后各摸两张牌`);
      },
    },
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player;
        const pid = p?.flags?.fudao;
        if (!pid || !d.self) return false;
        const me = d.self === p, target = (d.targets || []).some(x => x.id === pid);
        if (!target) return false;
        const key = me ? 'fdA' : 'fdB';
        return p.flags[key] !== d.game.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const t = g.byId(p.flags.fudao) || null;
        const me = ctx.data.self === p;
        p.flags[me ? 'fdA' : 'fdB'] = g.turnCount;
        await ctx.log(`【抚悼】：${p.name} 与 ${t ? t.name : '其'} 本回合首次以对方为目标，各摸两张牌`);
        await ctx.draw(p, 2, { reason: 'fudao' });
        if (t && t.alive) await ctx.draw(t, 2, { reason: 'fudao' });
      },
    },
    {
      on: 'death.after', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player;
        if (!p || !d.killer || d.killer === p) return false;
        if (d.self === p) return true;
        return d.self && d.self.id === p.flags.fudao;
      },
      async effect(ctx) {
        const p = ctx.self, k = ctx.data.killer, dead = ctx.data.self;
        k.marks = { ...(k.marks || {}) };
        k.marks.juelie = (k.marks.juelie || 0) + 1;
        await ctx.log(`【抚悼】：${k.name} 杀死了 ${dead.name}，获得一个“决裂”标记`);
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player;
        if (!p || !d.from || !d.self) return false;
        const pid = p.flags.fudao;
        const byMe = d.from === p;
        const byPartner = pid && d.from.id === pid;
        if (!byMe && !byPartner) return false;
        return (d.self.marks?.juelie || 0) > 0;
      },
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.self;
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log(`【抚悼】：${p.name} 或其犄角对“决裂”角色 ${t.name} 造成的伤害 +1`);
      },
    },
  ],
});

// ======================================================================
// 钟繇 · 活墨
// 出牌阶段，你可以将一张黑色非基本牌置于牌堆顶，视为使用一张你本回合未使用过的
// 基本牌（视为使用【杀】有距离限制且计入出牌阶段使用限制）。
// （官方为「当你需要使用基本牌时」的响应式转化，引擎无该通用钩子，故收窄为主动发动。）
// ======================================================================
const HM_BASICS = ['sha', 'tao', 'jiu'];

defineSkill({
  id: 'sk4_huomo', name: '活墨',
  desc: '出牌阶段，你可以将一张黑色非基本牌置于牌堆顶，视为使用一张你本回合未使用过的基本牌（视为使用【杀】有距离限制且计入出牌阶段使用限制）。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.game.phase === 'play' && typeOf(d.effName || d.card?.name) === 'basic',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const nm = ctx.data.effName || ctx.data.card?.name;
        if (p.flags.hmTurn !== g.turnCount) { p.flags.hmTurn = g.turnCount; p.flags.hmNames = []; }
        if (!p.flags.hmNames.includes(nm)) p.flags.hmNames.push(nm);
      },
    },
  ],
  active: {
    perTurn: false,
    prompt: '活墨：将一张黑色非基本牌置于牌堆顶，视为使用一张你本回合未使用过的基本牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.hmTurn !== g.turnCount) { p.flags.hmTurn = g.turnCount; p.flags.hmNames = []; }
      const used = p.flags.hmNames || [];
      const pool = HM_BASICS.filter(n => !used.includes(n));
      if (!pool.length) { await ctx.log('【活墨】：本回合可视为使用的基本牌均已使用过'); return; }
      const blacks = allCardsOf(p).filter(c => isBlackC(c) && typeOf(c.name) !== 'basic' && typeOf(c.name) !== 'equip');
      if (!blacks.length) { await ctx.log('【活墨】：没有黑色非基本牌'); return; }
      const idx = await ctx.ask.choose(p, pool.map(n => CARD_META[n].cn), { prompt: '【活墨】：选择要视为使用的基本牌', reason: 'huomo' });
      if (idx < 0 || !pool[idx]) return;
      const nm = pool[idx];
      const [pay] = await g.chooseSomeCards(p, blacks, 1, { prompt: '【活墨】：将一张黑色非基本牌置于牌堆顶' });
      if (!pay) return;
      // 移出手牌/装备区/判定区，置于牌堆顶（数组末尾）
      const hi = p.hand.indexOf(pay);
      if (hi >= 0) p.hand.splice(hi, 1);
      await g.unequipCard(p, pay, { reason: 'topdeck' });
      const ji = p.judgeZone.findIndex(z => z.card === pay);
      if (ji >= 0) p.judgeZone.splice(ji, 1);
      g.deck.push(pay);
      p.flags.hmNames.push(nm);
      await ctx.log(`【活墨】：${p.name} 将 ${cardLabel(pay)} 置于牌堆顶，视为使用【${CARD_META[nm].cn}】`);
      const card = VC(nm);
      let targets = [];
      if (nm === 'sha') {
        const cands = g.candidatesFor(p, { name: 'sha' }, 'sha');
        if (cands.length) {
          const ts = await ctx.ask.targets(p, { prompt: '【活墨】：选择【杀】的目标', candidates: cands, min: 1, max: 1 });
          targets = ts || [];
        }
      }
      await ctx.useCard({ from: p, card, targets, reason: 'huomo' });
    },
  },
});

// ======================================================================
// 钟繇 · 佐定
// 当其他角色于其出牌阶段内使用黑桃牌指定目标后，若所有角色于此阶段内均未受到过
// 伤害，则你可以令其中的一个目标摸一张牌。
// ======================================================================
defineSkill({
  id: 'sk4_zuoding', name: '佐定',
  desc: '当其他角色于其出牌阶段内使用黑桃牌指定目标后，若所有角色于此阶段内均未受到过伤害，则你可以令其中的一个目标摸一张牌。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => (d.amount || 0) > 0,
      async effect(ctx) {
        const g = ctx.game;
        g.__zdDmgTurn = g.turnCount;
        g.__zdDmgPhase = g.phase;
      },
    },
    {
      on: 'card.use.before', who: 'any', optional: true,
      filter: (d) => {
        const p = d.player, g = d.game;
        if (!p || !d.self || d.self === p) return false;         // 须为「其他角色」使用
        if (!d.card || d.card.suit !== 'spade') return false;
        if (g.phase !== 'play' || g.turnPlayer !== d.self) return false;
        if (d.card.__zd) return false;
        if (!(d.targets || []).length) return false;
        if (g.__zdDmgTurn === g.turnCount && g.__zdDmgPhase === g.phase) return false;  // 本阶段已有角色受伤
        return true;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const card = ctx.data.card;
        card.__zd = true;
        const cands = (ctx.data.targets || []).filter(x => x && x.alive);
        if (!cands.length) return;
        const ts = await ctx.ask.targets(p, {
          prompt: `【佐定】：${ctx.data.self.name} 使用黑桃牌指定目标，令其中一名目标摸一张牌`,
          candidates: cands, min: 1, max: 1,
        });
        const t = ts[0];
        if (!t) return;
        await ctx.log(`【佐定】：${p.name} 令 ${t.name} 摸一张牌`);
        await ctx.draw(t, 1, { reason: 'zuoding' });
      },
    },
  ],
});

// ======================================================================
// 界王基 · 奇制（蓄力技 (1/2)，出牌阶段每名角色限一次）
// 蓄力技，(1/2) 出牌阶段每名角色限一次，你可以消耗1点“蓄力”点，令一名角色摸两张牌，
// 然后此阶段你使用基本牌或者普通锦囊牌指定目标后，你依次观看此阶段因此摸牌的角色的
// 手牌并弃置其一张牌。
// ======================================================================
defineSkill({
  id: 'sk4_qizhi', name: '奇制', xuliTech: true, priority: 1,
  desc: '蓄力技，(1/2) 出牌阶段每名角色限一次，你可以消耗1点“蓄力”点，令一名角色摸两张牌，然后此阶段你使用基本牌或者普通锦囊牌指定目标后，你依次观看此阶段因此摸牌的角色的手牌并弃置其一张牌。',
  triggers: [{
    on: 'card.use.before', who: 'self', optional: true,
    filter: (d) => {
      const p = d.player;
      if (!p || d.self !== p) return false;
      if (d.game.phase !== 'play') return false;
      if (!d.card || d.card.__qz) return false;
      if (!isBasicOrTrick(d.effName || d.card.name)) return false;
      const g = d.game;
      return (p.flags.qzPhase === `${g.turnCount}_play`) && (p.flags.qzList || []).length > 0;
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const card = ctx.data.card;
      card.__qz = true;
      const ids = [...(p.flags.qzList || [])];
      for (const id of ids) {
        const t = g.byId(id);
        if (!t || !t.alive) continue;
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        if (!pool.length) continue;
        const c = await g.chooseCardFrom(p, t, { reason: 'qizhi' });
        const card2 = c || pool[0];
        await ctx.log(`【奇制】：${p.name} 观看 ${t.name} 的手牌，弃置其一张牌`);
        await ctx.discard(t, [card2], { reason: 'qizhi' });
      }
    },
  }],
  active: {
    perTurn: false,
    prompt: '奇制（蓄力技 1/2）：消耗 1 点“蓄力”点，令一名角色摸两张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const key = `${g.turnCount}_play`;
      if (p.flags.qzPhase !== key) { p.flags.qzPhase = key; p.flags.qzUsed = []; p.flags.qzList = []; }
      p.marks = { ...(p.marks || {}) };
      if ((p.marks.xuli || 0) < 1) { await ctx.log('【奇制】：没有“蓄力”点'); return; }
      const cands = g.alive().filter(x => !(p.flags.qzUsed || []).includes(x.id));
      if (!cands.length) { await ctx.log('【奇制】：本阶段每名角色均已发动过'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【奇制】：选择一名角色（本阶段每名角色限一次）', candidates: cands, min: 1, max: 1,
      });
      const t = ts[0];
      if (!t) return;
      p.marks.xuli = Math.max(0, (p.marks.xuli || 0) - 1);
      p.flags.qzUsed = [...(p.flags.qzUsed || []), t.id];
      p.flags.qzList = [...(p.flags.qzList || []), t.id];
      await ctx.log(`【奇制】：${p.name} 消耗 1 点“蓄力”（剩余 ${p.marks.xuli}），令 ${t.name} 摸两张牌`);
      await ctx.draw(t, 2, { reason: 'qizhi' });
      // 记录“蓄力”峰值的辅助（供【进趋】②读取）
      p.flags.jqPeak = Math.max(p.flags.jqPeak || 0, p.marks.xuli || 0);
    },
  },
});

// ======================================================================
// 界王基 · 进趋（锁定技）
// 锁定技，①当你于回合内使用两张基本牌或者普通锦囊牌后，你令一名有“蓄力技”的角色
// 获得1点“蓄力”点；②结束阶段，你摸X张牌（X为本回合你“蓄力”点数存在过的最高值）。
// ======================================================================
const hasXuliTech = (p) => (effSkills(p) || []).some(s => s.xuliTech);

defineSkill({
  id: 'sk4_jinqu', name: '进趋', priority: 0,
  desc: '锁定技，①当你于回合内使用两张基本牌或者普通锦囊牌后，你令一名有“蓄力技”的角色获得1点“蓄力”点；②结束阶段，你摸X张牌（X为本回合你“蓄力”点数存在过的最高值）。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player, g = d.game;
        if (!p || d.self !== p) return false;
        if (g.turnPlayer !== p) return false;
        return isBasicOrTrick(d.effName || d.card?.name);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.flags.jqTurn !== g.turnCount) { p.flags.jqTurn = g.turnCount; p.flags.jqN = 0; p.flags.jqPeak = p.marks?.xuli || 0; }
        p.flags.jqN = (p.flags.jqN || 0) + 1;
        if (p.flags.jqN % 2 !== 0) return;
        const cands = g.alive().filter(hasXuliTech);
        if (!cands.length) return;
        let t = p;
        if (cands.length > 1) {
          const ts = await ctx.ask.targets(p, { prompt: '【进趋】：令一名有“蓄力技”的角色获得 1 点“蓄力”', candidates: cands, min: 1, max: 1 });
          t = ts[0] || p;
        }
        t.marks = { ...(t.marks || {}) };
        t.marks.xuli = (t.marks.xuli || 0) + 1;
        if (t === p) p.flags.jqPeak = Math.max(p.flags.jqPeak || 0, t.marks.xuli);
        await ctx.log(`【进趋】：${p.name} 本回合已使用 ${p.flags.jqN} 张基本牌或普通锦囊，${t.name} 获得 1 点“蓄力”（共 ${t.marks.xuli}）`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'end' && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = Math.max(p.flags.jqPeak || 0, 0);
        if (x <= 0) { p.flags.jqPeak = 0; p.flags.jqN = 0; return; }
        p.flags.jqPeak = 0; p.flags.jqN = 0;
        await ctx.log(`【进趋】：结束阶段，${p.name} 本回合“蓄力”峰值 ${x}，摸 ${x} 张牌`);
        await ctx.draw(p, x, { reason: 'jinqu' });
      },
    },
  ],
});

// ======================================================================
// 界周妃 · 良姻
// ①当有牌被置于武将牌上时，你可令一名角色摸一张牌；
// ②当任意角色获得一名角色武将牌上的牌时，你可令一名角色弃置一张牌。
// ③每轮结束时，你可令本轮内：唯一成为“良姻”目标的角色回复1点体力，或唯一未成为
//   “良姻”目标的角色失去1点体力。
// ======================================================================
defineSkill({
  id: 'sk4_liangyin', name: '良姻',
  desc: '当有牌被置于武将牌上时，你可令一名角色摸一张牌；当任意角色获得一名角色武将牌上的牌时，你可令一名角色弃置一张牌。每轮结束时，你可令本轮内：唯一成为“良姻”目标的角色回复1点体力，或唯一未成为“良姻”目标的角色失去1点体力。',
  triggers: [
    {
      on: 'zone.out', who: 'any', optional: true,
      filter: (d) => (d.cards || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const ts = await ctx.ask.targets(p, { prompt: '【良姻】：有牌被置于武将牌上，令一名角色摸一张牌', candidates: g.alive(), min: 1, max: 1 });
        const t = ts[0];
        if (!t) return;
        p.flags.lyCur = [...(p.flags.lyCur || []), t.id];
        await ctx.log(`【良姻】：${p.name} 令 ${t.name} 摸一张牌`);
        await ctx.draw(t, 1, { reason: 'liangyin' });
      },
    },
    {
      on: 'zone.in', who: 'any', optional: true,
      filter: (d) => (d.cards || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = g.alive().filter(x => x.hand.length + Object.values(x.equips).filter(Boolean).length > 0);
        if (!cands.length) return;
        const ts = await ctx.ask.targets(p, { prompt: '【良姻】：有角色获得武将牌上的牌，令一名角色弃置一张牌', candidates: cands, min: 1, max: 1 });
        const t = ts[0];
        if (!t) return;
        p.flags.lyCur = [...(p.flags.lyCur || []), t.id];
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        const [c] = await g.chooseSomeCards(t, pool, 1, { prompt: '【良姻】：弃置一张牌' });
        const card = c || pool[0];
        await ctx.log(`【良姻】：${p.name} 令 ${t.name} 弃置一张牌`);
        await ctx.discard(t, [card], { reason: 'liangyin' });
      },
    },
    {
      on: 'round.begin', who: 'any', optional: true,
      filter: () => true,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cur = [...new Set(p.flags.lyCur || [])];
        p.flags.lyCur = [];
        if (!cur.length) return;
        const alive = g.alive();
        const opts = [];
        if (cur.length === 1) {
          const t = g.byId(cur[0]);
          if (t && t.alive && t.hp < t.maxHp) opts.push({ key: 'heal', label: `令本轮唯一成为“良姻”目标的 ${t.name} 回复1点体力` });
        }
        const rest = alive.filter(x => !cur.includes(x.id));
        if (rest.length === 1) opts.push({ key: 'lose', label: `令本轮唯一未成为“良姻”目标的 ${rest[0].name} 失去1点体力` });
        if (!opts.length) return;
        const idx = await ctx.ask.choose(p, opts.map(o => o.label), { prompt: '【良姻】：每轮结束时，请选择一项', reason: 'liangyin' });
        if (idx < 0 || !opts[idx]) return;
        if (opts[idx].key === 'heal') {
          const t = g.byId(cur[0]);
          if (t && t.alive) { await ctx.log(`【良姻】：${t.name} 回复1点体力`); await ctx.recover(t, 1, { reason: 'liangyin' }); }
        } else {
          const t = rest[0];
          if (t && t.alive) { await ctx.log(`【良姻】：${t.name} 失去1点体力`); await ctx.loseHp(t, 1, { reason: 'liangyin' }); }
        }
      },
    },
  ],
});

// ======================================================================
// 界周妃 · 箜声
// 准备阶段，或你回复或失去体力后，你可将当前回合角色任意张牌扣置于其武将牌上；
// 其结束阶段，你可使用其中一张牌，其获得其余的牌。
// ======================================================================
defineSkill({
  id: 'sk4_kongsheng', name: '箜声',
  desc: '准备阶段，或你回复或失去体力后，你可以将当前回合角色任意张牌扣置于其武将牌上；其结束阶段，你可以使用其中一张牌，其获得其余的牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare' && d.player.alive,
      async effect(ctx) { await kongshengPlace(ctx); },
    },
    {
      on: 'hp.recover', who: 'self', optional: true,
      filter: (d) => d.player.alive,
      async effect(ctx) { await kongshengPlace(ctx); },
    },
    {
      on: 'hp.lose', who: 'self', optional: true,
      filter: (d) => d.player.alive,
      async effect(ctx) { await kongshengPlace(ctx); },
    },
    {
      // 其结束阶段：使用其中一张，其获得其余的牌
      on: 'phase.begin', who: 'any', optional: true,
      filter: (d) => d.phase === 'end' && (d.self?.flags?.kong || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const owner = ctx.data.self;
        const kong = (owner.flags.kong || []).slice();
        owner.flags.kong = [];
        owner.marks = { ...(owner.marks || {}), kong: 0 };
        if (!kong.length) return;
        await ctx.log(`【箜声】：${owner.name} 的结束阶段，${p.name} 可以使用其武将牌上的一张牌（共 ${kong.length} 张）`);
        const [c] = await g.chooseSomeCards(p, kong, 1, { prompt: '【箜声】：可以使用其中一张牌' });
        let used = false;
        if (c) used = await playAsideCard(ctx, p, c, '箜声');
        const rest = kong.filter(x => x !== c || !used);
        if (rest.length) {
          await ctx.gain(owner, rest, { reason: 'kongsheng' });
          await ctx.log(`【箜声】：${owner.name} 获得其余的 ${rest.length} 张牌`);
        }
        await g.trigger('zone.in', { self: owner, cards: kong });
      },
    },
  ],
});

async function kongshengPlace(ctx) {
  const p = ctx.self, g = ctx.game;
  const cur = g.turnPlayer || p;
  if (!cur || !cur.alive) return;
  const pool = [...cur.hand, ...Object.values(cur.equips).filter(Boolean)];
  if (!pool.length) { await ctx.log('【箜声】：当前回合角色没有牌可扣置'); return; }
  const mx = Math.min(pool.length, 6);
  const opts = ['不扣置'];
  for (let i = 1; i <= mx; i++) opts.push(`${i} 张`);
  const idx = await ctx.ask.choose(p, opts, { prompt: `【箜声】：将 ${cur.name} 的任意张牌扣置于其武将牌上`, reason: 'kongsheng' });
  if (idx <= 0) return;
  const n = idx;
  const picks = [];
  const left = pool.slice();
  for (let i = 0; i < n && left.length; i++) {
    const [c] = await g.chooseSomeCards(p, left, 1, { prompt: `【箜声】：选择第 ${i + 1} 张牌扣置` });
    if (!c) break;
    picks.push(c);
    const li = left.indexOf(c);
    if (li >= 0) left.splice(li, 1);
  }
  if (!picks.length) return;
  for (const c of picks) {
    const hi = cur.hand.indexOf(c);
    if (hi >= 0) cur.hand.splice(hi, 1);
    await g.unequipCard(cur, c, { reason: 'move' });
    const ji = cur.judgeZone.findIndex(z => z.card === c);
    if (ji >= 0) cur.judgeZone.splice(ji, 1);
  }
  cur.flags.kong = [...(cur.flags.kong || []), ...picks];
  cur.marks = { ...(cur.marks || {}), kong: cur.flags.kong.length };
  await ctx.log(`【箜声】：${p.name} 将 ${cur.name} 的 ${picks.length} 张牌扣置于其武将牌上（${picks.map(cardLabel).join('、')}）`);
  await g.trigger('zone.out', { self: cur, cards: picks });
}
