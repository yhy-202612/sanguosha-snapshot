// 阶段 6A · 神·武（补全）8 将（pack = 'shenwu2'，PACK_CN = 「神·武（补全）」）技能实现
// ---------------------------------------------------------------------------
// 神张飞【神裁】【巡使】    神邓艾【拓域】【险进】    神许褚【裸衣】【神威】
// 神孙尚香【结姻】【枭姬】  神貂蝉【离间】【闭月】    神张春华【绝情】【伤逝】
// 神夏侯渊【神速】【千里】  神黄月英【藏巧】【神械】
//
// 技能 id 一律使用 sw2_ 前缀（不使用 jie_/mou_/ji_/shen_/sp_/ol_，避免被引擎静默降级别名）。
// 神将 kingdom = 'shen'；技能名与本家武将允许重名（神将本就是同一人的「神格化」版本），id 全部唯一。
//
// ★★ 资料核实与自拟口径清单（desc 一律写成「本实现实际效果」）★★
//  1. 神张飞【神裁】【巡使】：取自三国杀十周年「限定专属·神·武」神张飞（LE 025，4 勾玉，称号
//     「两界大巡环使」，官网 x.sanguosha.com / 萌娘百科）。标记分类严格照抄官方给出的
//     「标准&军争牌堆」对照表：笞=桃/酒/桃园结义/白银狮子；杖=武器牌/借刀杀人；
//     徒=南蛮入侵/万箭齐发/决斗/丈八蛇矛/八卦阵；流=坐骑牌/顺手牵羊/兵粮寸断；其余=死。
//     简化：①「杖·无法响应【杀】」用引擎既有的 noShanTurn 出口实现为「本回合不能使用【闪】」；
//     ②「死」标记的「手牌上限 -X」在弃牌阶段以 flags.handLimit 抵扣并即时还原；
//     ③「死数 > 存活角色数则直接死亡」以「受到等同于其体力值的伤害」实现（引擎无「直接死亡」出口）；
//     ④【巡使】原为「多目标锦囊视为无色杀 + 无色牌无距离次数限制 + 修改神裁次数」，本实现只保留
//     「你的【杀】无距离与次数限制；你的【杀】造成伤害后，本局每次出牌阶段发动【神裁】的次数上限 +1
//     （至多 5）」，前两条因需改写牌面定义（引擎 cards.js 只读）而收窄。
//  2. 神邓艾【拓域】【险进】：取自三国杀OL 官网 2023-07-07 新品公告（神·武，4 勾玉，称号「带砺山河」）。
//     官方第三技【奇径】为觉醒技（减体力上限 + 移动座次 + 额外回合 + 获得「摧心」），本批不实装，
//     只做两技；【拓域】的三个「副区域」简化为三个累计的「域」标记（每出牌阶段开始开发 1 个），
//     效果依次为「使用牌无距离限制 / 【杀】不可被响应 / 造成的伤害 +1」。
//  3. 神许褚【裸衣】：沿用标准包裸衣口径（摸牌阶段少摸一张，本回合【杀】【决斗】伤害 +1）。
//     【神威】**自拟**（无确定的官方神许褚条目）：锁定技，攻击范围 +1；你的【杀】指定目标后，
//     若你的手牌数为全场最少，此【杀】不可被响应。
//  4. 神孙尚香【结姻】【枭姬】：沿用官方两技口径；【结姻】在原版「弃两张手牌令一名已受伤角色回复
//     1 点体力」之后追加「你与其各摸一张牌」（神格化加成，desc 已写明）。
//  5. 神貂蝉【离间】【闭月】：沿用官方两技口径；【闭月】追加「本回合你未造成伤害则改为摸两张」。
//  6. 神张春华【绝情】【伤逝】：沿用官方两技口径。【绝情】「造成的伤害均视为失去体力」用
//     damage.before + canceled 实现（引擎既有伤害取消出口），因此不触发伤害结算内的护甲减免。
//  7. 神夏侯渊【神速】：官方神速为「跳过判定+摸牌阶段 / 跳过出牌阶段并弃置一张装备牌，每跳过一项
//     视为使用一张【杀】」。本实现改为**准备阶段**结算（「跳过出牌阶段」在准备阶段无法生效，
//     故以「弃置一张装备牌」作为第二项的代价），每执行一项视为使用一张【杀】。
//     【千里】**自拟**：出牌阶段限一次，弃置一张牌，本回合【杀】次数 +1 且【杀】无距离限制。
//  8. 神黄月英【藏巧】【神械】：取自 2026 珍藏版 LE038（3 体力，称号「卧龙的点睛人」）的官网文本。
//     官方三技【藏巧】【神械】【化朽】，本批只做前两技，且【藏巧】原引用的【折戟】【女装】【驽马】
//     三张专属装备牌不在本仓库牌堆内 → 改为「从弃牌堆获得一张装备牌，称为「藏巧」」；
//     【神械】原为「将场上装备牌当延时锦囊使用」，简化为「弃置场上一张装备牌，然后摸两张牌」。
//  9. 体力值：神张飞 4 / 神邓艾 4 / 神许褚 4 / 神孙尚香 3（女）/ 神貂蝉 3（女）/
//     神张春华 3（女）/ 神夏侯渊 4 / 神黄月英 3（女）。
// ---------------------------------------------------------------------------
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

// ------------------------------ 公用小工具 ------------------------------
let vseq = 0;
const vcard = (name, extra = {}) => ({
  id: `vshenwu2_${++vseq}`, name, suit: 'none', num: 0,
  type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const isRedC = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const isBlackC = (c) => !!c && (c.suit === 'spade' || c.suit === 'club');
const typeOf = (c) => (c ? CARD_META[c.name]?.type : null);
const subOf = (c) => (c ? CARD_META[c.name]?.sub : null);
const isEquipC = (c) => typeOf(c) === 'equip';
const zonesOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card).filter(Boolean)),
];
const equipsOf = (p) => Object.values(p?.equips || {}).filter(Boolean);
const others = (g, p) => g.alive().filter(x => x !== p);
const lostHpOf = (p) => Math.max(0, (p.maxHp ?? p.hp) - p.hp);
const takeFromDiscard = (g, c) => {
  const i = g.discardPile.indexOf(c);
  if (i >= 0) g.discardPile.splice(i, 1);
  return c;
};

// ============================================================
// 神张飞 · 神裁 / 巡使
// ============================================================
const SC_ANG = new Set(['tao', 'jiu', 'taoyuan', 'baiyin']);
const SC_ZHANG = new Set(['jiedao']);
const SC_TU = new Set(['nanman', 'wanjian', 'juedou', 'zhangba', 'bagua']);
const SC_LIU = new Set(['shunshou', 'bingliang']);
const SC_CN = { ang: '笞', zhang: '杖', tu: '徒', liu: '流', si: '死' };
function shencaiKind(c) {
  if (!c) return 'si';
  const sub = subOf(c);
  if (SC_ANG.has(c.name)) return 'ang';
  if (sub === 'weapon' || SC_ZHANG.has(c.name)) return 'zhang';
  if (SC_TU.has(c.name)) return 'tu';
  if (sub === 'horse+' || sub === 'horse-' || SC_LIU.has(c.name)) return 'liu';
  return 'si';
}
const scMarks = (t) => {
  if (!t.flags.sw2Marks) t.flags.sw2Marks = { ang: 0, zhang: 0, tu: 0, liu: 0, si: 0 };
  return t.flags.sw2Marks;
};

// 神裁：出牌阶段限一次（可用次数上限由【巡使】提升，至多 5），令一名其他角色判定并令你获得判定牌，
// 按判定牌内容给其「笞/杖/徒/流/死」标记。
defineSkill({
  id: 'sw2_shencai', name: '神裁',
  desc: '出牌阶段限一次（【巡使】可提升至多 5 次），你可以令一名其他角色进行判定，然后你获得此判定牌，'
    + '其依判定牌内容获得标记：桃/酒/桃园结义/白银狮子得「笞」（受到伤害后失去等量体力）、'
    + '武器牌/借刀杀人得「杖」（本回合不能使用【闪】）、南蛮入侵/万箭齐发/决斗/丈八蛇矛/八卦阵得「徒」'
    + '（不因此技能失去手牌后随机弃置一张手牌）、坐骑牌/顺手牵羊/兵粮寸断得「流」（其结束阶段翻面）、'
    + '其余得「死」（手牌上限 -X；其回合结束时若「死」数大于存活角色数，其受到等同于体力值的伤害，'
    + '该伤害连带护甲一并穿透）。',
  active: {
    prompt: '令一名其他角色判定，依判定牌内容给其施加「笞/杖/徒/流/死」标记',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const max = Math.min(5, p.flags.sw2ScMax || 1);
      const used = p.flags.sw2ScUsed || 0;
      if (used >= max) {
        await ctx.log(`【神裁】：本阶段已发动 ${used} 次（上限 ${max}），不能再发动`);
        return;
      }
      const cands = others(g, p).filter(x => x.alive);
      if (!cands.length) { await ctx.log('【神裁】：没有可指定的其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【神裁】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'shencai',
      });
      const t = ts[0];
      if (!t) return;
      p.flags.sw2ScUsed = used + 1;
      const j = await ctx.judge(t, { reason: '神裁' });
      const jc = j.card;
      if (jc) {
        takeFromDiscard(g, jc);
        await ctx.gain(p, [jc], { reason: 'shencai' });
      }
      const kind = shencaiKind(jc);
      const marks = scMarks(t);
      // by：标记归属者（seat）。同一局面若有两个【神裁】拥有者，只有施加者本人结算，避免双倍触发
      marks.by = p.seat;
      if (kind === 'si') marks.si += 1;
      else marks[kind] = 1;
      if (kind === 'zhang') {
        // 「本回合不能使用【闪】」= 施加标记的这一个回合有效（game.js 用 noShanTurn === turnCount 判定）。
        // 原先写在 dodge.before 里，每次被要求出闪都把该值重盖成当前回合 → 等价永久禁闪。
        t.flags.noShanTurn = g.turnCount;
        await ctx.log(`【神裁】：${t.name} 本回合不能使用【闪】`);
      }
      await ctx.log(`【神裁】：判定牌为 ${jc ? cardLabel(jc) : '无'}，${t.name} 获得「${SC_CN[kind]}」标记`
        + `${kind === 'si' ? `（共 ${marks.si} 个）` : ''}`);
    },
  },
  triggers: [
    // 标记开立与阶段复位
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) { ctx.self.flags.sw2ScUsed = 0; },
    },
    // 「笞」：受到伤害后失去等量体力
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.self.alive !== false
        && d.self.flags.sw2Marks?.by === d.player.seat
        && (d.self.flags.sw2Marks?.ang || 0) > 0 && (d.amount || 0) > 0,
      async effect(ctx) {
        const t = ctx.data.self, n = ctx.data.amount;
        await ctx.loseHp(t, n, { from: ctx.self, reason: 'shencai' });
        await ctx.log(`【神裁】「笞」：${t.name} 因受到 ${n} 点伤害，再失去 ${n} 点体力`);
      },
    },
    // 「杖」：本回合不能使用【闪】—— 在施加标记时直接写入 noShanTurn（见 active.effect），
    // 不再用 dodge.before 触发重写（那样每次被要求出闪都会把禁闪顺延到当前回合 = 永久禁闪）。
    // 「徒」：不因此技能而失去手牌后，随机弃置一张手牌
    {
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.self.alive !== false
        && d.self.flags.sw2Marks?.by === d.player.seat
        && (d.self.flags.sw2Marks?.tu || 0) > 0
        && d.reason !== 'shencai' && d.reason !== 'sw2_tu'
        && (d.cards || []).length > 0 && (d.self.hand || []).length > 0,
      async effect(ctx) {
        const t = ctx.data.self, g = ctx.game;
        // 排除本次被弃置的牌：cards.discard 在实体牌离开手牌「之前」触发，
        // t.hand 里还含着它们，随机抽中会再弃一次（空转/异常）。
        const gone = new Set(ctx.data.cards || []);
        const pool = t.hand.filter(c => !gone.has(c));
        if (!pool.length) return;
        const c = pool[g.rng.int(pool.length)];
        if (!c) return;
        await ctx.discard(t, [c], { reason: 'sw2_tu' });
        await ctx.log(`【神裁】「徒」：${t.name} 失去手牌后随机弃置 ${cardLabel(c)}`);
      },
    },
    // 「流」：结束阶段翻面
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.phase === 'end'
        && d.self.flags.sw2Marks?.by === d.player.seat
        && (d.self.flags.sw2Marks?.liu || 0) > 0,
      async effect(ctx) {
        const t = ctx.data.self;
        await ctx.flip(t);
        await ctx.log(`【神裁】「流」：${t.name} 于结束阶段将武将牌翻面`);
      },
    },
    // 「死」①：弃牌阶段手牌上限 -X
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.phase === 'discard'
        && d.self.flags.sw2Marks?.by === d.player.seat
        && (d.self.flags.sw2Marks?.si || 0) > 0,
      async effect(ctx) {
        const t = ctx.data.self, n = t.flags.sw2Marks.si;
        t.flags.handLimit = (t.flags.handLimit || 0) - n;
        t.flags.sw2SiLimit = n;
        await ctx.log(`【神裁】「死」：${t.name} 本阶段手牌上限 -${n}`);
      },
    },
    {
      on: 'phase.end', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.phase === 'discard' && (d.self.flags.sw2SiLimit || 0) > 0,
      async effect(ctx) {
        const t = ctx.data.self, n = t.flags.sw2SiLimit || 0;
        t.flags.handLimit = (t.flags.handLimit || 0) + n;
        t.flags.sw2SiLimit = 0;
      },
    },
    // 「死」②：其回合结束时「死」数大于存活角色数 → 死亡（以等量伤害实现）
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.self.alive !== false
        && d.self.flags.sw2Marks?.by === d.player.seat
        && (d.self.flags.sw2Marks?.si || 0) > d.game.alive().length,
      async effect(ctx) {
        const t = ctx.data.self;
        await ctx.log(`【神裁】「死」：${t.name} 的「死」标记数超过存活角色数，直接死亡`);
        await ctx.damage({ from: ctx.self, to: t, amount: Math.max(1, t.hp + (t.armor || 0)), reason: 'shencai' });
      },
    },
    // 施放者阵亡：清理自己施加的全部标记（触发挂在施放者技能上，玩家死亡后引擎不再收集其触发，
    // 标记会永久滞留、且「死」扣掉的手牌上限永不恢复）
    {
      on: 'death.after', who: 'self', optional: false,
      async effect(ctx) {
        const me = ctx.self, g = ctx.game;
        for (const t of g.players) {
          const m = t.flags.sw2Marks;
          if (!m || m.by !== me.seat) continue;
          if (t.flags.sw2SiLimit) { t.flags.handLimit = (t.flags.handLimit || 0) + t.flags.sw2SiLimit; t.flags.sw2SiLimit = 0; }
          delete t.flags.sw2Marks;
          await ctx.log(`【神裁】：${me.name} 阵亡，${t.name} 身上的神裁标记全部移除`);
        }
      },
    },
  ],
});

// 巡使：锁定技，你的【杀】无距离与次数限制；你的【杀】造成伤害后，本局「神裁」每次出牌阶段的
// 可用次数上限 +1（至多 5）。
defineSkill({
  id: 'sw2_xunshi', name: '巡使',
  desc: '锁定技，你使用【杀】无距离与次数限制；当你使用【杀】造成伤害后，本局你每个出牌阶段发动'
    + '【神裁】的次数上限 +1（至多 5）。',
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false,
      async effect(ctx) {
        ctx.self.flags.shaUnlimited = true;
        if (!ctx.self.flags.sw2ScMax) ctx.self.flags.sw2ScMax = 1;
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.shaUnlimited = true;
        if (!p.flags.sw2ScMax) p.flags.sw2ScMax = 1;
        p.flags.freeRangeTurn = ctx.game.turnCount;   // 引擎既有的「使用牌无距离限制」出口
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.self !== d.player
        && (d.reason === 'sha' || (d.card && d.card.name === 'sha')),
      async effect(ctx) {
        const p = ctx.self;
        p.flags.sw2ScMax = Math.min(5, (p.flags.sw2ScMax || 1) + 1);
        await ctx.log(`【巡使】：【神裁】次数上限提升至 ${p.flags.sw2ScMax}`);
      },
    },
  ],
});

// ============================================================
// 神邓艾 · 拓域 / 险进
// ============================================================
// 拓域：锁定技，出牌阶段开始时开发一个「域」（至多 3 个）。
//       1 个：使用牌无距离限制；2 个：【杀】不可被响应；3 个：造成的伤害 +1。
defineSkill({
  id: 'sw2_tuoyu', name: '拓域',
  desc: '锁定技，出牌阶段开始时，你开发一个「域」（至多 3 个）。已开发 1 个：你使用牌无距离限制；'
    + '已开发 2 个：你使用的【杀】不可被响应；已开发 3 个：你造成的伤害 +1。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.sw2Yu = Math.min(3, (p.flags.sw2Yu || 0) + 1);
        if ((p.flags.sw2Yu || 0) >= 1) p.flags.freeRangeTurn = g.turnCount;
        await ctx.log(`【拓域】：${p.name} 开发第 ${p.flags.sw2Yu} 个「域」`);
      },
    },
    {
      on: 'target.after', who: 'self', optional: false,
      filter: (d) => (d.player.flags.sw2Yu || 0) >= 2 && d.card && d.card.name === 'sha'
        && d.target && d.target !== d.self,
      async effect(ctx) {
        if (ctx.data.shaCtx) ctx.data.shaCtx.unavoidable = true;
        await ctx.log(`【拓域】：${ctx.data.target.name} 不能使用【闪】响应此【杀】`);
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.self !== d.player && (d.player.flags.sw2Yu || 0) >= 3,
      async effect(ctx) {
        ctx.data.amount += 1;
        await ctx.log('【拓域】：第三个「域」使此伤害 +1');
      },
    },
  ],
});

// 险进：锁定技，你每造成或受到 2 点伤害后，摸 X 张牌（X 为已开发的「域」数，至少 1；
//       若你的手牌数为全场最多则改为摸 1 张）。
defineSkill({
  id: 'sw2_xianjin', name: '险进',
  desc: '锁定技，当你造成或受到伤害后，若你累计造成与受到的伤害达到 2 点，你摸 X 张牌'
    + '（X 为你已开发的「域」数且至少为 1；若你的手牌数为全场最多则改为摸一张），然后重新累计。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => (d.self === d.player || d.from === d.player) && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.sw2Xj = (p.flags.sw2Xj || 0) + (ctx.data.amount || 0);
      if (p.flags.sw2Xj < 2) return;
      p.flags.sw2Xj -= 2;
      const maxHand = Math.max(...g.alive().map(x => x.hand.length));
      const x = p.hand.length >= maxHand ? 1 : Math.max(1, p.flags.sw2Yu || 0);
      await ctx.draw(p, x, { reason: 'xianjin' });
      await ctx.log(`【险进】：${p.name} 摸 ${x} 张牌`);
    },
  }],
});

// ============================================================
// 神许褚 · 裸衣 / 神威
// ============================================================
// 裸衣：摸牌阶段，你可以少摸一张牌；若如此做，本回合你使用【杀】或【决斗】造成的伤害 +1。
defineSkill({
  id: 'sw2_luoyi', name: '裸衣',
  desc: '摸牌阶段，你可以少摸一张牌；若如此做，本回合你使用【杀】或【决斗】造成的伤害 +1。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'draw',
      async effect(ctx) {
        if (!(await ctx.ask.confirm(ctx.self, '【裸衣】：少摸一张牌，本回合【杀】与【决斗】伤害 +1？'))) return;
        ctx.self.flags.skip_one_draw = true;
        ctx.self.flags.sw2Luoyi = ctx.game.turnCount;
        await ctx.log('【裸衣】：本回合【杀】与【决斗】造成的伤害 +1');
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.self !== d.player
        && d.player.flags.sw2Luoyi === d.game.turnCount
        && (d.reason === 'sha' || d.reason === 'juedou' || (d.card && ['sha', 'juedou'].includes(d.card.name))),
      async effect(ctx) {
        ctx.data.amount += 1;
        await ctx.log('【裸衣】：此伤害 +1');
      },
    },
  ],
});

// 神威：锁定技，你的攻击范围 +1；当你使用【杀】指定目标后，若你的手牌数为全场最少，
//       此【杀】不可被响应。
defineSkill({
  id: 'sw2_shenwei', name: '神威',
  desc: '锁定技，你的攻击范围 +1；当你使用【杀】指定目标后，若你的手牌数为全场最少，此【杀】不可被响应。',
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.rangeBonus = (ctx.self.flags.rangeBonus || 0) + 1; },
    },
    {
      on: 'target.after', who: 'self', optional: false,
      filter: (d) => d.card && d.card.name === 'sha' && d.target && d.target !== d.self
        && d.self.hand.length <= Math.min(...d.game.alive().filter(x => x !== d.self).map(x => x.hand.length)),
      async effect(ctx) {
        if (ctx.data.shaCtx) ctx.data.shaCtx.unavoidable = true;
        await ctx.log(`【神威】：${ctx.self.name} 手牌最少，${ctx.data.target.name} 不能使用【闪】`);
      },
    },
  ],
});

// ============================================================
// 神孙尚香 · 结姻 / 枭姬
// ============================================================
// 结姻：出牌阶段限一次，弃置两张手牌，令一名已受伤角色回复 1 点体力，然后你与其各摸一张牌。
defineSkill({
  id: 'sw2_jieyin', name: '结姻',
  desc: '出牌阶段限一次，你可以弃置两张手牌，令一名已受伤的角色回复 1 点体力，然后你与其各摸一张牌。',
  active: {
    perPhase: true,
    prompt: '弃置两张手牌，令一名已受伤角色回复 1 点体力，然后你与其各摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.hand.length < 2) { await ctx.log('【结姻】：手牌不足两张'); return; }
      const cands = g.alive().filter(x => x.hp < (x.maxHp ?? x.hp));
      if (!cands.length) { await ctx.log('【结姻】：没有已受伤的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【结姻】：选择一名已受伤的角色', candidates: cands, min: 1, max: 1, reason: 'jieyin2',
      });
      const t = ts[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 2, { prompt: '【结姻】：弃置两张手牌' });
      if (picks.length < 2) { await ctx.log('【结姻】：未弃置两张手牌，发动取消'); return; }
      await ctx.discard(p, picks, { reason: 'jieyin2' });
      await ctx.recover(t, 1, { reason: 'jieyin2' });
      await ctx.draw(p, 1, { reason: 'jieyin2' });
      await ctx.draw(t, 1, { reason: 'jieyin2' });
      await ctx.log(`【结姻】：${p.name} 与 ${t.name} 各摸一张牌`);
    },
  },
});

// 枭姬：当你失去装备区里的一张牌后，你可以摸两张牌。
defineSkill({
  id: 'sw2_xiaoji', name: '枭姬',
  desc: '当你失去装备区里的一张牌后，你可以摸两张牌。',
  triggers: [{
    on: 'equip.lose', who: 'self', optional: true,
    filter: (d) => !!d.card,
    async effect(ctx) {
      await ctx.draw(ctx.self, 2, { reason: 'xiaoji2' });
      await ctx.log(`【枭姬】：${ctx.self.name} 失去 ${cardLabel(ctx.data.card)}，摸两张牌`);
    },
  }],
});

// ============================================================
// 神貂蝉 · 离间 / 闭月
// ============================================================
// 离间：出牌阶段限一次，弃置一张牌，视为其中一名男性角色对另一名男性角色使用一张【决斗】。
defineSkill({
  id: 'sw2_lijian', name: '离间',
  desc: '出牌阶段限一次，你可以弃置一张牌，视为其中一名男性角色对另一名男性角色使用一张【决斗】。',
  active: {
    perPhase: true,
    prompt: '弃置一张牌，视为一名男性角色对另一名男性角色使用【决斗】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!zonesOf(p).length) { await ctx.log('【离间】：没有可弃置的牌'); return; }
      const males = others(g, p).filter(x => x.gender !== 'female');
      if (males.length < 2) { await ctx.log('【离间】：男性角色不足两名'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【离间】：选择两名男性角色', candidates: males, min: 2, max: 2, reason: 'lijian2',
      });
      if (ts.length < 2) { await ctx.log('【离间】：需选择两名男性角色，发动取消'); return; }
      const pool = zonesOf(p);
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【离间】：弃置一张牌' });
      const cost = picks[0];
      if (!cost) return;
      await ctx.discard(p, [cost], { reason: 'lijian2' });
      const a = ts[0], b = ts[1];
      await ctx.log(`【离间】：${p.name} 弃置 ${cardLabel(cost)}，视为 ${a.name} 对 ${b.name} 使用【决斗】`);
      await ctx.useCard({ from: a, card: vcard('juedou'), targets: [b], reason: 'lijian2', ignoreRange: true });
    },
  },
});

// 闭月：结束阶段，你可以摸一张牌；若你本回合未造成过伤害，改为摸两张牌。
defineSkill({
  id: 'sw2_biyue', name: '闭月',
  desc: '结束阶段，你可以摸一张牌；若你本回合未造成过伤害，改为摸两张牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'end',
      async effect(ctx) {
        const p = ctx.self;
        const n = p.flags.sw2DmgTurn === ctx.game.turnCount ? 1 : 2;
        await ctx.draw(p, n, { reason: 'biyue2' });
        await ctx.log(`【闭月】：${p.name} 摸 ${n} 张牌`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => d.from === d.player && (d.amount || 0) > 0,
      async effect(ctx) { ctx.self.flags.sw2DmgTurn = ctx.game.turnCount; },
    },
  ],
});

// ============================================================
// 神张春华 · 绝情 / 伤逝
// ============================================================
// 绝情：锁定技，你造成的伤害均视为失去体力。
defineSkill({
  id: 'sw2_jueqing', name: '绝情',
  desc: '锁定技，你造成的伤害均视为失去体力（防止该伤害，改为令其失去等量体力）。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => d.from === d.player && d.self !== d.player && !d.canceled && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self, n = ctx.data.amount;
      ctx.data.canceled = true;
      await ctx.log(`【绝情】：${p.name} 造成的伤害视为失去体力`);
      await ctx.loseHp(t, n, { from: p, reason: 'jueqing' });
      await ctx.log(`【绝情】：${t.name} 失去 ${n} 点体力`);
    },
  }],
});

// 伤逝：除你的回合外，每当你的手牌数变化后，你可以摸牌至等于你已损体力值（至多摸五张）。
defineSkill({
  id: 'sw2_shangshi', name: '伤逝',
  desc: '除你的回合外，每当你的手牌数变化后，你可以摸牌至你的手牌数等于你已损的体力值（单次最多摸五张）。',
  triggers: [{
    on: 'hand.change', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.game.turnPlayer !== d.player && !d.player.flags.sw2SsBusy
      && d.player.alive !== false,
    async effect(ctx) {
      const p = ctx.self;
      const need = Math.min(5, lostHpOf(p) - p.hand.length);
      if (need <= 0) return;
      p.flags.sw2SsBusy = true;
      try {
        await ctx.draw(p, need, { reason: 'shangshi2' });
        await ctx.log(`【伤逝】：${p.name} 摸 ${need} 张牌`);
      } finally { p.flags.sw2SsBusy = false; }
    },
  }],
});

// ============================================================
// 神夏侯渊 · 神速 / 千里
// ============================================================
// 神速：准备阶段，你可以选择一至两项：1.跳过本回合的判定阶段与摸牌阶段；2.弃置一张装备牌。
//       每执行一项，视为对一名其他角色使用一张【杀】。
defineSkill({
  id: 'sw2_shensu', name: '神速',
  desc: '准备阶段，你可以选择一至两项：①跳过本回合的判定阶段与摸牌阶段；②弃置一张装备牌。'
    + '每执行一项，你视为对一名其他角色使用一张无距离限制的【杀】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const equips = [...equipsOf(p), ...p.hand.filter(isEquipC)];
      const opts = ['跳过判定阶段与摸牌阶段', '弃置一张装备牌', '两项都执行'];
      if (!equips.length) opts.splice(2, 1);
      if (!others(g, p).length) return;
      const idx = await ctx.ask.choose(p, opts, { prompt: '【神速】：选择要执行的项（取消则不发动）', reason: 'shensu2' });
      if (idx < 0) return;
      const label = opts[idx];
      if (label === '跳过判定阶段与摸牌阶段') {
        ctx.skipPhase(p, 'judge');
        ctx.skipPhase(p, 'draw');
        await ctx.log('【神速】：跳过本回合的判定阶段与摸牌阶段');
        await sw2Sha(ctx, 1);
      } else if (label === '弃置一张装备牌') {
        if (!(await payEquip(ctx, equips))) return;
        await sw2Sha(ctx, 1);
      } else {
        ctx.skipPhase(p, 'judge');
        ctx.skipPhase(p, 'draw');
        await ctx.log('【神速】：跳过本回合的判定阶段与摸牌阶段');
        if (!(await payEquip(ctx, equips))) return;
        await sw2Sha(ctx, 2);
      }
    },
  }],
});

async function payEquip(ctx, equips) {
  const p = ctx.self, g = ctx.game;
  if (!equips.length) { await ctx.log('【神速】：没有装备牌可弃置'); return false; }
  const picks = await g.chooseSomeCards(p, equips.slice(), 1, { prompt: '【神速】：弃置一张装备牌' });
  const c = picks[0];
  if (!c) { await ctx.log('【神速】：未弃置装备牌，后续结算取消'); return false; }
  await ctx.discard(p, [c], { reason: 'shensu2' });
  await ctx.log(`【神速】：弃置 ${cardLabel(c)}`);
  return true;
}

async function sw2Sha(ctx, times) {
  for (let k = 0; k < times; k++) {
    const p = ctx.self, g = ctx.game;
    if (!p.alive) return;
    const cands = others(g, p);
    if (!cands.length) return;
    const ts = await ctx.ask.targets(p, {
      prompt: '【神速】：视为使用一张【杀】，选择目标', candidates: cands, min: 1, max: 1, reason: 'shensu2',
    });
    const t = ts[0];
    if (!t) return;
    await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'shensu2', ignoreRange: true, ignoreShaLimit: true });
  }
}

// 千里（自拟）：出牌阶段限一次，弃置一张牌，本回合【杀】次数 +1 且【杀】无距离限制。
defineSkill({
  id: 'sw2_qianli', name: '千里',
  desc: '出牌阶段限一次，你可以弃置一张牌，然后本回合你使用【杀】的次数上限 +1 且你的【杀】无距离限制。',
  active: {
    perPhase: true,
    prompt: '弃置一张牌，本回合【杀】次数 +1 且【杀】无距离限制',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = zonesOf(p);
      if (!pool.length) { await ctx.log('【千里】：没有可弃置的牌'); return; }
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: '【千里】：弃置一张牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'qianli' });
      p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + 1;   // 本回合（SG028）
      p.flags.freeRangeTurn = g.turnCount;
      await ctx.log(`【千里】：${p.name} 弃置 ${cardLabel(c)}，本回合【杀】次数 +1 且无距离限制`);
    },
  },
});

// ============================================================
// 神黄月英 · 藏巧 / 神械
// ============================================================
// 藏巧：每轮开始时（本实现按「你的回合开始时、每轮一次」），你可以从弃牌堆获得一张装备牌，称为
//       「藏巧」；当你使用「藏巧」牌时，你可以摸牌至你的体力上限（单次最多摸三张）。
defineSkill({
  id: 'sw2_cangqiao', name: '藏巧',
  desc: '每轮开始时（本实现为你的回合开始时、每轮一次），你可以从弃牌堆获得一张装备牌，称为「藏巧」牌'
    + '（弃牌堆无装备牌则改为摸一张牌）；当你使用「藏巧」牌时，你可以摸牌至你的体力上限（单次最多三张）。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.player.flags.sw2CqRound !== d.game.round,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.sw2CqRound = g.round;
        const equips = g.discardPile.filter(isEquipC);
        if (!equips.length) {
          await ctx.draw(p, 1, { reason: 'cangqiao' });
          await ctx.log('【藏巧】：弃牌堆没有装备牌，改为摸一张牌');
          return;
        }
        const picks = await g.chooseSomeCards(p, equips, 1, { prompt: '【藏巧】：从弃牌堆获得一张装备牌' });
        const c = picks[0];
        if (!c) return;
        takeFromDiscard(g, c);
        c.__sw2Cq = true;
        await ctx.gain(p, [c], { reason: 'cangqiao' });
        await ctx.log(`【藏巧】：${p.name} 获得 ${cardLabel(c)}，称为「藏巧」牌`);
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.card && d.card.__sw2Cq === true,
      async effect(ctx) {
        const p = ctx.self;
        const need = Math.min(3, Math.max(0, (p.maxHp ?? p.hp) - p.hand.length));
        if (need <= 0) return;
        await ctx.draw(p, need, { reason: 'cangqiao' });
        await ctx.log(`【藏巧】：${p.name} 使用「藏巧」牌，摸 ${need} 张牌`);
      },
    },
  ],
});

// 神械（简化）：每回合限一次，当你使用黑色牌指定目标后，你可以弃置场上一张装备牌，然后摸两张牌。
defineSkill({
  id: 'sw2_shenxie', name: '神械',
  desc: '每回合限一次，当你使用黑色牌指定目标后，你可以弃置场上（任一角色装备区里）的一张装备牌，'
    + '然后摸两张牌。（原官方文本为「将装备牌当延时锦囊使用」，本实现收窄为弃置并摸牌）',
  triggers: [{
    on: 'target.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player.flags.sw2SxTurn !== d.game.turnCount
      && !!d.card && isBlackC(d.card)
      && d.game.alive().some(x => equipsOf(x).length > 0),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => equipsOf(x).length > 0);
      const ts = await ctx.ask.targets(p, {
        prompt: '【神械】：选择一名角色，弃置其装备区里的一张牌',
        candidates: cands, min: 1, max: 1, reason: 'shenxie',
      });
      const t = ts[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, equipsOf(t), 1, { prompt: `【神械】：弃置 ${t.name} 的一张装备牌` });
      const c = picks[0];
      if (!c) return;
      p.flags.sw2SxTurn = g.turnCount;
      await ctx.discard(t, [c], { reason: 'shenxie' });
      await ctx.draw(p, 2, { reason: 'shenxie' });
      await ctx.log(`【神械】：${p.name} 弃置 ${t.name} 的 ${cardLabel(c)}，摸两张牌`);
    },
  }],
});
