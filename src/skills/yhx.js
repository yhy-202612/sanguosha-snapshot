// 阶段 6E · 一将成名 2022–2026（十周年原创线）14 将技能实现（pack = 'yhx'）
// ---------------------------------------------------------------------------
// 一将成名2022：诸葛尚【三顾】【轶祖】 陆凯【卜筮】【忠壮】 轲比能【寇旌】
//               武安国【叠嶂】【断腕】 苏飞【数荐】        谯周【识命】【将息】
// 一将成名2015（补）：曹叡【恢拓】【明鉴】 曹休【千驹】【倾袭】
//                     夏侯氏【樵拾】【燕语】 孙休【宴诛】【兴学】
// 原创之魂2016（补）：郭皇后【矫诏】【殚心】 刘虞【止戈】【宗祚】
// 原创之魂2017（补）：辛宪英【忠鉴】【才识】 吴苋【福绵】【怠宴】
//
// 技能 id 一律使用 yhxs_ 前缀（不使用 jie_/mou_/ji_/shen_/sp_/ol_，避免被引擎静默降级别名）。
// 一将成名 2023 之后官方未再续开「一将成名」原创设计线，故本包 6 位为 2022 年度，
// 其余 8 位按任务允许补 2015–2017 原创之魂/一将成名线（年份见上，报告亦注明）。
//
// ★★ 简化 / 自拟口径清单（desc 一律写「本实现实际效果」）★★
//  1. 诸葛尚【三顾】：官方为「其下个出牌阶段使用的前 X 张牌视为你选择的牌」。引擎的
//     card.use.before 不支持替换牌名，故简化为「其使用这些牌中的同名牌时额外摸一张牌」。
//     「若你选择了你此阶段未使用过的牌，你失去 1 点体力」按官方实装（按牌名比对）。
//  2. 诸葛尚【轶祖】：按官方（每回合限一次、体力值不大于使用者时回复 1 点）。
//  3. 陆凯【卜筮】：官方为「自由分配四种花色到四条描述」。本实现固定花色映射：
//     ♠=你使用【杀】无次数限制；♥=你使用♥牌后摸一张；♣=你成为♣牌目标后可弃一张手牌取消；
//     ♦=结束阶段你获得牌堆中一张♦牌（没有则摸一张）。发动即本回合生效。
//  4. 陆凯【忠壮】：按官方（攻击范围 >3 伤害 +1；<3 伤害至多 1 点）。
//  5. 轲比能【寇旌】：官方「这些牌视为无次数限制的【杀】」。引擎不支持改牌名，本实现为
//     「标记的牌本回合不计次数，且本回合你使用【杀】无次数限制」；交换部分按官方
//     （受伤角色可用其所有手牌交换你尚未用出的「旌」）。
//  6. 武安国【叠嶂】：官方为转换技（阳/阴两面）。本实现两面都常驻（阳：被你被抵消的牌
//     可弃一张牌视为对其使用【杀】；阴：你抵消他人的牌后可摸一张牌视为对其使用【杀】），
//     并常驻「出牌阶段使用【杀】次数上限 +1」。
//  7. 武安国【断腕】：**自拟**（官方描述在网络资料中残缺，仅知为「濒死时可发动」的限定技）。
//     本实现：限定技，当你处于濒死状态时，你可以弃置所有牌，然后将体力回复至 2 点。
//  8. 苏飞【数荐】：按官方（X = 此前本阶段此技能「剩余」发动次数；选择「视为使用 X 张
//     【过河拆桥】」后本回合不能再发动）。X 张【过河拆桥】统一以受牌者为目标（简化）。
//  9. 谯周【识命】：按官方。牌堆顶 = deck 数组尾部（引擎 popDeck 用 deck.pop()）。
// 10. 谯周【将息】：按官方（一号位于此回合内进入过濒死状态或未受到过伤害 → 重置【识命】；
//     所有角色均未受到过伤害 → 你可以与当前回合角色各摸一张牌）。
// 11. 曹叡【恢拓】：按官方（判定红→回复 1 点；黑→摸 X 张，X 为本次伤害数）。
// 12. 曹叡【明鉴】：按官方（交给其他角色所有手牌，其下回合手牌上限 +1、【杀】次数上限 +1）。
// 13. 曹休【千驹】：按官方（已受伤时计算距离 -X，X 为已损体力）。
// 14. 曹休【倾袭】：按官方（X 为武器攻击范围；选项 1 弃 X 张手牌并弃置你此武器牌）。
// 15. 夏侯氏【樵拾】：按官方（其他角色结束阶段开始时手牌数等于你 → 各摸一张）。
// 16. 夏侯氏【燕语】：按官方（重铸【杀】；出牌阶段结束时若重铸≥2 张，可令一名男性角色摸两张）。
// 17. 孙休【宴诛】：按官方（一无获得装备区所有牌并失去【宴诛】；二弃一张牌）。
// 18. 孙休【兴学】：按官方（X = 体力值；已失去【宴诛】则改为体力上限）。
// 19. 郭皇后【矫诏】：官方「直到回合结束，你可以将此手牌当声明的牌使用且你不能被选择为目标」。
//     本实现：声明后立即将所选手牌当该牌使用；「你不能被选择为目标」未实装（简化）。
// 20. 郭皇后【殚心】：官方为「摸一张牌，或依次修改【矫诏】的描述」。本实现简化为
//     「摸一张牌，或令【矫诏】本局每回合可额外发动一次」。
// 21. 刘虞【止戈】：官方为「除非其使用一张【杀】，否则交出装备区一张牌」。本实现为
//     「除非其打出一张【杀】」（引擎内「使用」需另择目标，简化为打出）。
// 22. 刘虞【宗祚】：按官方（游戏开始时加全场势力数的体力上限与体力；某势力最后一人死亡后 -1）。
// 23. 辛宪英【忠鉴】：按官方，唯「均不同则手牌上限 -1」简化为「你弃置一张手牌」。
// 24. 辛宪英【才识】：按官方，选项 1 的「本回合你的牌不能对其他角色使用」复用引擎
//     zhuikongTurn 出口实装；选项 2 的「本回合你的牌不能对自己使用」未实装（简化）。
// 25. 吴苋【福绵】：按官方转换思路，本实现每回合可重选；选项 2「红色牌多指定一个目标」
//     限一次（额外目标不限距离），数值递增部分按「与上回合选项不同则 +1」实装。
// 26. 吴苋【怠宴】：按官方（从牌堆获得一张♥基本牌；若其于上回合成为过此技能目标则失去 1 点体力）。
// ---------------------------------------------------------------------------
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

// ------------------------------ 公用小工具 ------------------------------
let vseq = 0;
const vcard = (name, extra = {}) => ({
  id: `vyhx_${++vseq}`, name, suit: 'none', num: 0,
  type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const isRedC = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const equipCards = (p) => Object.values(p?.equips || {}).filter(Boolean);
const zonesOf = (p) => [...(p?.hand || []), ...equipCards(p)];
const others = (g, p) => g.alive().filter(x => x !== p);
const lostHpOf = (p) => Math.max(0, (p.maxHp ?? p.hp) - p.hp);
const isNormalTrick = (c) => CARD_META[c?.name]?.type === 'trick' && !CARD_META[c?.name]?.delayed;
const topOfDeck = (g, n = 1) => g.deck.slice(-n);          // 牌堆顶 = 数组尾部
const deckTopTwo = (g) => g.deck.slice(-2);

// 从一组牌里挑一张（返回牌对象或 null）
async function pickFrom(ctx, player, pool, prompt) {
  if (!pool.length) return null;
  const idx = await ctx.game.chooseOne(player, pool.map(cardLabel), { prompt });
  if (idx < 0) return null;
  return pool[idx] || null;
}

// ============================================================
// 诸葛尚 · 三顾 / 轶祖
// ============================================================
// 三顾：出牌阶段结束时，选择至多三张【杀】或普通锦囊牌并指定一名其他角色。
defineSkill({
  id: 'yhxs_sangu', name: '三顾',
  desc: '出牌阶段结束时，你可以选择至多三张【杀】或普通锦囊牌并指定一名其他角色：其下个出牌阶段内使用这些牌中的同名牌时，额外摸一张牌（此为「视为你选择的牌」的简化实现，最多生效 X 次，X 为你选择的牌数）。若你选择的牌中有你本阶段未使用过的牌名，你失去 1 点体力。',
  triggers: [
    {
      // 记录本阶段自己使用过的牌名
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.game.phase === 'play' && !!d.card,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.flags.yhxPlayNamesTurn !== g.turnCount) {
          p.flags.yhxPlayNamesTurn = g.turnCount;
          p.flags.yhxPlayNames = [];
        }
        const n = ctx.data.card?.name;
        if (n && !p.flags.yhxPlayNames.includes(n)) p.flags.yhxPlayNames.push(n);
      },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const pool = p.hand.filter(c => c.name === 'sha' || isNormalTrick(c));
        if (!pool.length) { await ctx.log('【三顾】：你没有【杀】或普通锦囊牌'); return; }
        const cands = others(g, p);
        if (!cands.length) { await ctx.log('【三顾】：没有其他角色'); return; }
        const picks = [];
        const rest = pool.slice();
        while (picks.length < 3 && rest.length) {
          const idx = await g.chooseOne(p, rest.map(cardLabel), {
            prompt: `【三顾】：选择至多三张【杀】或普通锦囊牌（已选 ${picks.length}/3）`,
          });
          if (idx < 0 || !rest[idx]) break;
          picks.push(rest.splice(idx, 1)[0]);
        }
        if (!picks.length) { await ctx.log('【三顾】：取消发动'); return; }
        const ts = await ctx.ask.targets(p, {
          prompt: '【三顾】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'sangu',
        });
        const t = ts[0];
        if (!t) { await ctx.log('【三顾】：取消发动'); return; }
        t.flags.yhxSangu = { owner: p.seat, names: picks.map(c => c.name), left: picks.length };
        await ctx.log(`【三顾】：${p.name} 令 ${t.name} 的下个出牌阶段前 ${picks.length} 张牌视为「${picks.map(cardLabel).join('、')}」`);
        const used = p.flags.yhxPlayNamesTurn === g.turnCount ? (p.flags.yhxPlayNames || []) : [];
        const bad = picks.find(c => !used.includes(c.name));
        if (bad) {
          await ctx.loseHp(p, 1, { reason: 'sangu' });
          await ctx.log(`【三顾】：${p.name} 选择了本阶段未使用过的「${cardLabel(bad)}」，失去 1 点体力`);
        }
      },
    },
    {
      // 被指定角色的下个出牌阶段：使用同名「视为」牌时额外摸一张
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => {
        const s = d.self;
        if (!s || s === d.player || !s.flags || !s.flags.yhxSangu) return false;
        const rec = s.flags.yhxSangu;
        return rec.left > 0 && d.game.phase === 'play' && !!d.card && rec.names.includes(d.card.name);
      },
      async effect(ctx) {
        const s = ctx.data.self, rec = s.flags.yhxSangu;   // who:'any' 下 ctx.self 是技能拥有者，行动者是 data.self
        if (!rec) return;
        rec.left -= 1;
        if (rec.left <= 0) delete s.flags.yhxSangu;
        await ctx.draw(s, 1, { reason: 'sangu' });
        await ctx.log(`【三顾】：${s.name} 使用的 ${cardLabel(ctx.data.card)} 视为【三顾】所选之牌，摸一张牌（剩余 ${rec.left} 次）`);
      },
    },
  ],
});

// 轶祖：锁定技，每回合限一次，当你成为【杀】或【决斗】的目标后，若你的体力值不大于使用者，回复 1 点体力。
defineSkill({
  id: 'yhxs_yizu', name: '轶祖',
  desc: '锁定技，每回合限一次，当你成为【杀】或【决斗】的目标后，若你的体力值不大于使用者的体力值，你回复 1 点体力。',
  triggers: [{
    on: 'target.after', who: 'any', optional: false,
    filter: (d) => d.target === d.player && d.self !== d.player && d.player.alive !== false
      && !!d.card && (d.card.name === 'sha' || d.card.name === 'juedou')
      && d.player.hp <= d.self.hp
      && (d.player.flags || {}).yhxYizuTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.yhxYizuTurn = ctx.game.turnCount;
      await ctx.recover(p, 1, { reason: 'yizu' });
      await ctx.log(`【轶祖】：${p.name} 的体力值不大于 ${ctx.data.self.name}，回复 1 点体力`);
    },
  }],
});

// ============================================================
// 陆凯 · 卜筮 / 忠壮
// ============================================================
defineSkill({
  id: 'yhxs_bushi', name: '卜筮',
  desc: '准备阶段，你可以发动：本回合你使用【杀】无次数限制；你使用或打出♥牌后摸一张牌；当你成为♣牌的目标后，你可以弃置一张手牌令此牌对你无效；结束阶段，你获得牌堆中一张♦牌（若没有则摸一张牌）。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare' && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.yhxBushiTurn = ctx.game.turnCount;
        p.flags.shaUnlimited = true;
        p.flags.yhxShaUnlim = true;
        await ctx.log(`【卜筮】：${p.name} 演算玄意——本回合【杀】无次数限制，♥牌可摸牌，♣牌可弃牌取消，结束阶段取♦牌`);
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.card && d.card.suit === 'heart'
        && (d.player.flags || {}).yhxBushiTurn === d.game.turnCount,
      async effect(ctx) {
        await ctx.draw(ctx.self, 1, { reason: 'bushi' });
        await ctx.log(`【卜筮】：${ctx.self.name} 使用♥牌，摸一张牌`);
      },
    },
    {
      on: 'target.before', who: 'any', optional: true,
      filter: (d) => d.target === d.player && d.self !== d.player && !!d.card && d.card.suit === 'club'
        && (d.player.flags || {}).yhxBushiTurn === d.game.turnCount && d.player.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self;
        const ok = await ctx.ask.confirm(p, '【卜筮】：是否弃置一张手牌，令此♣牌对你无效？');
        if (!ok) return;
        const c = await pickFrom(ctx, p, p.hand.slice(), '【卜筮】：弃置一张手牌');
        if (!c) return;
        await ctx.discard(p, [c], { reason: 'bushi' });
        ctx.data.canceled = true;
        await ctx.log(`【卜筮】：${p.name} 弃置 ${cardLabel(c)}，令 ${cardLabel(ctx.data.card)} 对其无效`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'end' && d.self === d.player
        && (d.player.flags || {}).yhxBushiTurn === d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.yhxBushiTurn = -1;
        const idx = g.deck.findIndex(c => c.suit === 'diamond');
        if (idx >= 0) {
          const c = g.deck.splice(idx, 1)[0];
          await ctx.gain(p, [c], { reason: 'bushi' });
          await ctx.log(`【卜筮】：${p.name} 自牌堆获得 ${cardLabel(c)}`);
        } else {
          await ctx.draw(p, 1, { reason: 'bushi' });
          await ctx.log('【卜筮】：牌堆中没有♦牌，改为摸一张牌');
        }
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.player.flags.yhxShaUnlim,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.yhxShaUnlim = false;
        p.flags.shaUnlimited = false;
      },
    },
  ],
});

defineSkill({
  id: 'yhxs_zhongzhuang', name: '忠壮',
  desc: '锁定技，当你使用【杀】造成伤害时，若你的攻击范围大于 3，此伤害 +1；若你的攻击范围小于 3，此伤害至多为 1 点。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
      && !!d.card && d.card.name === 'sha' && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, r = ctx.game.attackRange(p);
      if (r > 3) {
        ctx.data.amount += 1;
        await ctx.log(`【忠壮】：攻击范围 ${r} > 3，此伤害 +1`);
      } else if (r < 3) {
        if (ctx.data.amount > 1) ctx.data.amount = 1;
        await ctx.log(`【忠壮】：攻击范围 ${r} < 3，此伤害至多为 1 点`);
      }
    },
  }],
});

// ============================================================
// 轲比能 · 寇旌
// ============================================================
defineSkill({
  id: 'yhxs_koujing', name: '寇旌',
  desc: '出牌阶段开始时，你可以选择任意张手牌，这些牌本回合不计入你使用【杀】的次数且本回合你使用【杀】无次数限制。当其他角色受到你使用【杀】造成的伤害后，其可以用所有手牌与你尚未用出的这些牌交换。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && d.self === d.player && d.player.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const rest = p.hand.slice();
        const picks = [];
        while (rest.length) {
          const idx = await g.chooseOne(p, rest.map(cardLabel), {
            prompt: `【寇旌】：选择任意张手牌作为「旌」（已选 ${picks.length} 张）`,
          });
          if (idx < 0 || !rest[idx]) break;
          picks.push(rest.splice(idx, 1)[0]);
        }
        if (!picks.length) { await ctx.log('【寇旌】：取消发动'); return; }
        p.flags.yhxKoujing = picks.map(c => c.id);
        p.flags.shaUnlimited = true;
        p.flags.yhxShaUnlim = true;
        await ctx.log(`【寇旌】：${p.name} 立 ${picks.length} 张「旌」，本回合使用【杀】无次数限制`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: true,
      filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
        && !!d.card && d.card.name === 'sha' && (d.amount || 0) > 0
        && Array.isArray(d.player.flags.yhxKoujing) && d.player.flags.yhxKoujing.length > 0
        && d.self.alive !== false,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, v = ctx.data.self;
        const ids = p.flags.yhxKoujing || [];
        const jing = p.hand.filter(c => ids.includes(c.id));
        if (!jing.length) { p.flags.yhxKoujing = []; return; }
        const ok = await ctx.ask.confirm(v, `【寇旌】：是否用你的全部手牌交换 ${p.name} 的 ${jing.length} 张「旌」？`);
        if (!ok) return;
        const vh = v.hand.slice();
        v.hand = jing.slice();
        p.hand = p.hand.filter(c => !ids.includes(c.id)).concat(vh);
        p.flags.yhxKoujing = [];
        await ctx.log(`【寇旌】：${v.name} 用 ${vh.length} 张手牌交换了 ${p.name} 的 ${jing.length} 张「旌」`);
        if (g.checkHandChange) { await g.checkHandChange(v); await g.checkHandChange(p); }
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => d.self === d.player && !!d.player.flags.yhxShaUnlim,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.yhxShaUnlim = false;
        p.flags.shaUnlimited = false;
      },
    },
  ],
});

// ============================================================
// 武安国 · 叠嶂 / 断腕
// ============================================================
// 叠嶂：你出牌阶段使用【杀】的次数上限 +1；阳：你的牌被抵消后可弃一张牌视为对其使用【杀】；
//       阴：你抵消他人的牌后可摸一张牌视为对其使用【杀】。
defineSkill({
  id: 'yhxs_diezhang', name: '叠嶂',
  desc: '你出牌阶段使用【杀】的次数上限 +1。阳：当你使用的牌被其他角色抵消后，你可以弃置一张牌，视为对其使用一张【杀】；阴：当你抵消其他角色使用的牌后，你可以摸一张牌，视为对其使用一张【杀】。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      // 常驻 +1 用「本回合类」实现：引擎每回合开始清零 shaExtraTurn，这里再 +1，效果等价且不依赖配对减（SG028）
      async effect(ctx) { ctx.self.flags.shaExtraTurn = (ctx.self.flags.shaExtraTurn || 0) + 1; },
    },
    {
      // 阳：你的牌被抵消（用【闪】抵消【杀】）
      on: 'sha.dodged', who: 'any', optional: true,
      filter: (d) => d.self === d.player && d.target !== d.player && d.target.alive !== false
        && zonesOf(d.player).length > 0 && !!d.player.flags.yhxDiezhangYang
        && d.player.flags.yhxDiezhangYangUsed !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.target;
        const ok = await ctx.ask.confirm(p, `【叠嶂·阳】：是否弃置一张牌，视为对 ${t.name} 使用【杀】？`);
        if (!ok) return;
        const c = await pickFrom(ctx, p, zonesOf(p), '【叠嶂·阳】：弃置一张牌');
        if (!c) return;
        await ctx.discard(p, [c], { reason: 'diezhang' });
        p.flags.yhxDiezhangYangUsed = ctx.game.turnCount;
        await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'diezhang', ignoreRange: true, ignoreShaLimit: true });
        await ctx.log(`【叠嶂·阳】：${p.name} 弃置 ${cardLabel(c)}，视为对 ${t.name} 使用【杀】`);
      },
    },
    {
      // 阳的开关：出牌阶段开始时点亮
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        if (p.flags.yhxDiezhangYang !== ctx.game.turnCount) p.flags.yhxDiezhangYang = ctx.game.turnCount;
      },
    },
    {
      // 阴：你抵消他人的牌（出【闪】抵消【杀】）
      on: 'dodge.after', who: 'any', optional: true,
      filter: (d) => d.self === d.player && d.from && d.from !== d.player && d.from.alive !== false,
      async effect(ctx) {
        const p = ctx.self, src = ctx.data.from;
        const ok = await ctx.ask.confirm(p, `【叠嶂·阴】：是否摸一张牌，视为对 ${src.name} 使用【杀】？`);
        if (!ok) return;
        await ctx.draw(p, 1, { reason: 'diezhang' });
        await ctx.useCard({ from: p, card: vcard('sha'), targets: [src], reason: 'diezhang', ignoreRange: true, ignoreShaLimit: true });
        await ctx.log(`【叠嶂·阴】：${p.name} 摸一张牌，视为对 ${src.name} 使用【杀】`);
      },
    },
  ],
});

// 断腕：（自拟）限定技，当你处于濒死状态时，你可以弃置所有牌，然后将体力回复至 2 点。
defineSkill({
  id: 'yhxs_duanwan', name: '断腕',
  desc: '限定技，当你处于濒死状态时，你可以弃置所有牌，然后将你的体力回复至 2 点。',
  triggers: [{
    on: 'dying.begin', who: 'self', optional: true,
    filter: (d) => d.self === d.player && !d.player.flags.yhxDuanwanUsed,
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.yhxDuanwanUsed) return;
      p.flags.yhxDuanwanUsed = true;
      const all = zonesOf(p);
      if (all.length) await ctx.discard(p, all, { reason: 'duanwan' });
      const need = Math.max(0, 2 - p.hp);
      if (need > 0) await ctx.recover(p, need, { reason: 'duanwan' });
      await ctx.log(`【断腕】：${p.name} 弃置所有牌，断腕自保，体力回复至 ${p.hp} 点`);
    },
  }],
});

// ============================================================
// 苏飞 · 数荐
// ============================================================
defineSkill({
  id: 'yhxs_shujian', name: '数荐',
  desc: '出牌阶段限三次，你可以交给一名其他角色一张牌，然后其选择一项：1. 令你摸 X 张牌并弃置 X-1 张牌；2. 视为对你交给牌的角色使用 X 张【过河拆桥】，本回合此技能不再发动（X 为此前本阶段此技能剩余发动次数）。',
  active: {
    prompt: '交给一名其他角色一张牌：其令你摸牌，或你视为对其使用若干张【过河拆桥】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.yhxShujianTurn !== g.turnCount) {
        p.flags.yhxShujianTurn = g.turnCount;
        p.flags.yhxShujianLeft = 3;
      }
      const left = p.flags.yhxShujianLeft ?? 0;
      if (left <= 0) { await ctx.log('【数荐】：本阶段已发动三次，不能再发动'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【数荐】：没有其他角色'); return; }
      const pool = zonesOf(p);
      if (!pool.length) { await ctx.log('【数荐】：你没有牌可以交出'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【数荐】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'shujian',
      });
      const t = ts[0];
      if (!t) { await ctx.log('【数荐】：取消发动'); return; }
      const c = await pickFrom(ctx, p, pool, '【数荐】：交给其一张牌');
      if (!c) { await ctx.log('【数荐】：取消发动'); return; }
      p.flags.yhxShujianLeft = left - 1;
      await ctx.gain(t, [c], { from: p, reason: 'shujian' });
      await ctx.log(`【数荐】：${p.name} 将 ${cardLabel(c)} 交给 ${t.name}（X = ${left}）`);
      const idx = await ctx.ask.choose(t, [
        `令 ${p.name} 摸 ${left} 张牌并弃置 ${Math.max(0, left - 1)} 张牌`,
        `视为对 ${t.name} 使用 ${left} 张【过河拆桥】，${p.name} 本回合不再发动【数荐】`,
      ], { prompt: '【数荐】：请选择一项' });
      if (idx === 1) {
        p.flags.yhxShujianLeft = 0;
        for (let i = 0; i < left; i++) {
          if (!t.alive || !t.hand.length) break;
          await ctx.useCard({ from: p, card: vcard('guohe'), targets: [t], reason: 'shujian' });
        }
        await ctx.log(`【数荐】：${t.name} 任用荐才，视为 ${p.name} 对其使用 ${left} 张【过河拆桥】`);
      } else {
        await ctx.draw(p, left, { reason: 'shujian' });
        const n = Math.max(0, left - 1);
        if (n > 0 && p.hand.length) {
          const picks = await g.chooseSomeCards(p, p.hand.slice(), Math.min(n, p.hand.length),
            { prompt: `【数荐】：弃置 ${n} 张手牌` });
          if (picks.length) await ctx.discard(p, picks, { reason: 'shujian' });
        }
        await ctx.log(`【数荐】：${t.name} 拒绝任用，${p.name} 摸 ${left} 张牌`);
      }
    },
  },
});

// ============================================================
// 谯周 · 识命 / 将息
// ============================================================
defineSkill({
  id: 'yhxs_shiming', name: '识命',
  desc: '每轮限一次，一名角色的摸牌阶段，你可以观看牌堆顶的两张牌，然后可以将其中一张置于牌堆底；若如此做，当前回合角色可以放弃摸牌，改为对自己造成 1 点伤害，然后从牌堆底摸三张牌。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => d.phase === 'draw' && (d.player.flags || {}).yhxShimingRound !== d.game.round
      && d.game.deck.length >= 2,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, cur = ctx.data.self;
      const top = deckTopTwo(g);
      if (top.length < 2) return;
      await ctx.log(`【识命】：${p.name} 观看牌堆顶两张：${top.map(cardLabel).join('、')}`);
      const idx = await ctx.ask.choose(p, top.map(c => `将 ${cardLabel(c)} 置于牌堆底`), { prompt: '【识命】：是否将其中一张置于牌堆底？' });
      if (idx < 0) { await ctx.log('【识命】：不置于牌堆底，效果结束'); return; }
      const moved = top[idx];
      g.deck.splice(g.deck.indexOf(moved), 1);
      g.deck.unshift(moved);   // 牌堆底 = 数组头部
      p.flags.yhxShimingRound = g.round;
      await ctx.log(`【识命】：${cardLabel(moved)} 被置于牌堆底`);
      const ok = await ctx.ask.confirm(cur, `【识命】：是否放弃摸牌，改为对自己造成 1 点伤害，然后从牌堆底摸三张牌？`);
      if (!ok) return;
      cur.flags.skip_draw = true;
      await ctx.damage({ from: cur, to: cur, amount: 1, reason: '识命' });
      if (!cur.alive) return;
      cur.flags.drawFromBottom = true;
      await ctx.draw(cur, 3, { reason: 'shiming' });
      cur.flags.drawFromBottom = false;
      await ctx.log(`【识命】：${cur.name} 放弃摸牌，自伤 1 点并从牌堆底摸三张牌`);
    },
  }],
});

defineSkill({
  id: 'yhxs_jiangxi', name: '将息',
  desc: '一名角色的回合结束时，若一号位于此回合内进入过濒死状态或未受到过伤害，你可以重置【识命】；若所有角色均未受到过伤害，你可以与当前回合角色各摸一张牌。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => (d.amount || 0) > 0 && !!d.self,
      async effect(ctx) { ctx.data.self.flags.yhxHurtTurn = ctx.game.turnCount; },
    },
    {
      on: 'dying.begin', who: 'any', optional: false,
      filter: (d) => !!d.self,
      async effect(ctx) { ctx.data.self.flags.yhxDyingTurn = ctx.game.turnCount; },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => d.player.alive !== false,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, cur = ctx.data.self;
        const first = g.players[0];
        if (first) {
          const reset = first.flags.yhxDyingTurn === g.turnCount || first.flags.yhxHurtTurn !== g.turnCount;
          if (reset) {
            p.flags.yhxShimingRound = -1;
            await ctx.log(`【将息】：一号位本回合${first.flags.yhxDyingTurn === g.turnCount ? '进入过濒死状态' : '未受到过伤害'}，${p.name} 重置【识命】`);
          }
        }
        const anyHurt = g.alive().some(x => x.flags.yhxHurtTurn === g.turnCount);
        if (!anyHurt && p.alive && cur && cur.alive) {
          const ok = await ctx.ask.confirm(p, '【将息】：本回合无人受到伤害，是否与当前回合角色各摸一张牌？');
          if (!ok) return;
          await ctx.draw(p, 1, { reason: 'jiangxi' });
          if (cur !== p) await ctx.draw(cur, 1, { reason: 'jiangxi' });
          await ctx.log(`【将息】：${p.name} 与 ${cur.name} 各摸一张牌`);
        }
      },
    },
  ],
});

// ============================================================
// 曹叡 · 恢拓 / 明鉴
// ============================================================
defineSkill({
  id: 'yhxs_huituo', name: '恢拓',
  desc: '当你受到伤害后，你可以令一名角色进行判定：若结果为红色，其回复 1 点体力；若为黑色，其摸 X 张牌（X 为此次伤害的伤害数）。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => (d.amount || 0) > 0 && d.self === d.player && d.player.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const amount = ctx.data.amount || 1;
      const ts = await ctx.ask.targets(p, {
        prompt: '【恢拓】：选择一名角色进行判定', candidates: g.alive(), min: 1, max: 1, reason: 'huituo',
      });
      const t = ts[0];
      if (!t) return;
      const j = await ctx.judge(t, { reason: '恢拓' });
      if (isRedC(j)) {
        await ctx.recover(t, 1, { reason: 'huituo' });
        await ctx.log(`【恢拓】：判定红色，${t.name} 回复 1 点体力`);
      } else {
        await ctx.draw(t, amount, { reason: 'huituo' });
        await ctx.log(`【恢拓】：判定黑色，${t.name} 摸 ${amount} 张牌`);
      }
    },
  }],
});

defineSkill({
  id: 'yhxs_mingjian', name: '明鉴',
  desc: '出牌阶段限一次，你可以将所有手牌交给一名其他角色：该角色于其下回合手牌上限 +1，且出牌阶段使用【杀】的次数上限 +1。',
  active: {
    perPhase: true,
    prompt: '将所有手牌交给一名其他角色（其下回合手牌上限与【杀】次数上限 +1）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【明鉴】：你没有手牌可以交出'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【明鉴】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【明鉴】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'mingjian',
      });
      const t = ts[0];
      if (!t) { await ctx.log('【明鉴】：取消发动'); return; }
      const all = p.hand.slice();
      await ctx.gain(t, all, { from: p, reason: 'mingjian' });
      t.flags.yhxMingjianPending = true;
      await ctx.log(`【明鉴】：${p.name} 将 ${all.length} 张手牌交给 ${t.name}，其下回合手牌上限与【杀】次数上限 +1`);
    },
  },
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => !!(d.self.flags || {}).yhxMingjianPending,
      async effect(ctx) {
        const p = ctx.data.self;
        p.flags.yhxMingjianPending = false;
        p.flags.handLimit = (p.flags.handLimit || 0) + 1;
        p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + 1;   // 其下回合生效（SG028）
        p.flags.yhxMingjianTurn = ctx.game.turnCount;
        await ctx.log(`【明鉴】：${p.name} 本回合手牌上限 +1、【杀】次数上限 +1`);
      },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => (d.self.flags || {}).yhxMingjianTurn === d.game.turnCount,
      async effect(ctx) {
        const p = ctx.data.self;
        p.flags.yhxMingjianTurn = -1;
        p.flags.handLimit = Math.max(0, (p.flags.handLimit || 1) - 1);
        // shaExtraTurn 由引擎在下一个回合开始时清零，无需在此配对减（SG028）
      },
    },
  ],
});

// ============================================================
// 曹休 · 千驹 / 倾袭
// ============================================================
defineSkill({
  id: 'yhxs_qianju', name: '千驹',
  desc: '锁定技，若你已受伤，你计算与其他角色的距离 -X（X 为你已损失的体力值）。',
  triggers: [{
    on: 'distance.calc', who: 'self', optional: false,
    filter: (d) => !!d && d.self === d.player && !!d.to && d.to !== d.player && lostHpOf(d.player) > 0,
    // distance.calc 走 triggerSync（同步分发），这里必须是同步 effect，不能 await
    effect(ctx) {
      const p = ctx.self, x = lostHpOf(p);
      ctx.data.value = Math.max(1, (ctx.data.value || 1) - x);
    },
  }],
});

defineSkill({
  id: 'yhxs_qingxi', name: '倾袭',
  desc: '当你使用【杀】对目标角色造成伤害时，若你的装备区里有武器牌，你可以令其选择一项：1. 弃置 X 张手牌（X 为此武器牌的攻击范围），若如此做，其弃置你的此武器牌；2. 令此伤害 +1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: true,
    filter: (d) => !!d.from && d.from === d.player && d.self !== d.player
      && !!d.card && d.card.name === 'sha' && (d.amount || 0) > 0
      && !!d.player.equips.weapon,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self, g = ctx.game;
      const w = p.equips.weapon;
      const x = CARD_META[w.name]?.range || 1;
      const idx = await ctx.ask.choose(t, [
        `弃置 ${x} 张手牌，然后弃置 ${p.name} 的【${CARD_META[w.name]?.cn || w.name}】`,
        '令此伤害 +1',
      ], { prompt: '【倾袭】：请选择一项' });
      if (idx === 1) {
        ctx.data.amount += 1;
        await ctx.log(`【倾袭】：${t.name} 选择加伤，此伤害 +1`);
        return;
      }
      // 取消（-1/超时）必须直接结束：原实现只判 idx===1，取消会落进弃牌分支，
      // 反而让目标弃牌并丢掉武器（取消打出了最坏效果）。
      if (idx !== 0) { await ctx.log('【倾袭】：取消'); return; }
      // 「若如此做」：必须真的弃满 X 张，选项才成立；手牌不足 X 张时整个选项不成立（不丢武器）。
      if (t.hand.length < x) {
        await ctx.log(`【倾袭】：${t.name} 手牌不足 ${x} 张，无法选择该项`);
        return;
      }
      const picks = await g.chooseSomeCards(t, t.hand.slice(), x, { prompt: `【倾袭】：弃置 ${x} 张手牌` });
      if (picks.length < x) {
        await ctx.log(`【倾袭】：${t.name} 未弃满 ${x} 张手牌，选项不成立`);
        return;
      }
      await ctx.discard(t, picks.slice(0, x), { reason: 'qingxi' });
      // 注意：必须以「武器持有者 p」为参数才能让引擎摘除装备区并触发 equip.lose；
      // 传 t 时引擎在 t 的区域找不到该牌，会静默什么都不做（武器仍在 p 身上）。
      if (p.equips.weapon === w) await ctx.discard(p, [w], { reason: 'qingxi' });
      await ctx.log(`【倾袭】：${t.name} 弃置 ${x} 张手牌，并弃置 ${p.name} 的武器牌`);
    },
  }],
});

// ============================================================
// 夏侯氏 · 樵拾 / 燕语
// ============================================================
defineSkill({
  id: 'yhxs_qiaoshi', name: '樵拾',
  desc: '其他角色的结束阶段开始时，若其手牌数等于你，你可以令你与其各摸一张牌。',
  triggers: [{
    on: 'phase.begin', who: 'any', optional: true,
    filter: (d) => d.phase === 'end' && d.self !== d.player && d.self.alive !== false
      && d.self.hand.length === d.player.hand.length,
    async effect(ctx) {
      const p = ctx.self, t = ctx.data.self;
      await ctx.draw(p, 1, { reason: 'qiaoshi' });
      await ctx.draw(t, 1, { reason: 'qiaoshi' });
      await ctx.log(`【樵拾】：${p.name} 与 ${t.name} 手牌数相同，各摸一张牌`);
    },
  }],
});

defineSkill({
  id: 'yhxs_yanyu', name: '燕语',
  desc: '出牌阶段，你可以重铸一张【杀】（弃置之并摸一张牌）；出牌阶段结束时，若你于此阶段以此法重铸了两张或更多的【杀】，你可以令一名男性角色摸两张牌。',
  active: {
    prompt: '重铸一张【杀】：弃置之并摸一张牌（本阶段重铸两张以上后，结束阶段可令一名男性角色摸两张牌）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.yhxYanyuTurn !== g.turnCount) { p.flags.yhxYanyuTurn = g.turnCount; p.flags.yhxYanyu = 0; }
      const sha = p.hand.filter(c => c.name === 'sha');
      if (!sha.length) { await ctx.log('【燕语】：你没有【杀】可以重铸'); return; }
      const c = await pickFrom(ctx, p, sha, '【燕语】：重铸一张【杀】');
      if (!c) { await ctx.log('【燕语】：取消发动'); return; }
      await ctx.discard(p, [c], { reason: 'yanyu' });
      await ctx.draw(p, 1, { reason: 'yanyu' });
      p.flags.yhxYanyu = (p.flags.yhxYanyu || 0) + 1;
      await ctx.log(`【燕语】：${p.name} 重铸 ${cardLabel(c)}（本阶段已重铸 ${p.flags.yhxYanyu} 张）`);
    },
  },
  triggers: [{
    on: 'phase.end', who: 'self', optional: true,
    filter: (d) => d.phase === 'play' && d.self === d.player
      && (d.player.flags.yhxYanyuTurn === d.game.turnCount) && (d.player.flags.yhxYanyu || 0) >= 2,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter(x => x.gender === 'male');
      if (!cands.length) { await ctx.log('【燕语】：没有男性角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【燕语】：令一名男性角色摸两张牌', candidates: cands, min: 1, max: 1, reason: 'yanyu',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, 2, { reason: 'yanyu' });
      await ctx.log(`【燕语】：${p.name} 令 ${t.name} 摸两张牌`);
    },
  }],
});

// ============================================================
// 孙休 · 宴诛 / 兴学
// ============================================================
defineSkill({
  id: 'yhxs_yanzhu', name: '宴诛',
  desc: '出牌阶段限一次，你可以令一名有牌的其他角色选择一项：1. 令你获得其装备区里的所有牌，然后你失去【宴诛】且【兴学】的 X 改为你的体力上限；2. 弃置一张牌。',
  active: {
    perPhase: true,
    prompt: '令一名有牌的其他角色交给装备区所有牌，或弃置一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.yhxYanzhuLost) { await ctx.log('【宴诛】：你已失去此技能'); return; }
      const cands = others(g, p).filter(x => zonesOf(x).length > 0);
      if (!cands.length) { await ctx.log('【宴诛】：没有可指定的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【宴诛】：选择一名有牌的其他角色', candidates: cands, min: 1, max: 1, reason: 'yanzhu',
      });
      const t = ts[0];
      if (!t) { await ctx.log('【宴诛】：取消发动'); return; }
      const eq = equipCards(t);
      const opts = [];
      if (eq.length) opts.push(`令 ${p.name} 获得你装备区的 ${eq.length} 张牌（其失去【宴诛】）`);
      opts.push('弃置一张牌');
      const idx = await ctx.ask.choose(t, opts, { prompt: '【宴诛】：请选择一项' });
      const pickEquip = eq.length > 0 && idx === 0;
      if (pickEquip) {
        await ctx.gain(p, eq, { from: t, reason: 'yanzhu' });
        p.flags.yhxYanzhuLost = true;
        await ctx.log(`【宴诛】：${t.name} 交出装备区 ${eq.length} 张牌，${p.name} 失去【宴诛】，【兴学】改为体力上限`);
      } else {
        const pool = zonesOf(t);
        const c = await pickFrom(ctx, t, pool, '【宴诛】：弃置一张牌');
        if (c) {
          await ctx.discard(t, [c], { reason: 'yanzhu' });
          await ctx.log(`【宴诛】：${t.name} 弃置 ${cardLabel(c)}`);
        } else {
          await ctx.log('【宴诛】：其未弃置牌');
        }
      }
    },
  },
});

defineSkill({
  id: 'yhxs_xingxue', name: '兴学',
  desc: '结束阶段，你可以令至多 X 名角色依次摸一张牌并将一张手牌置于牌堆顶（X 为你的体力值；若你已失去【宴诛】，X 改为你的体力上限）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.self === d.player && d.player.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const x = p.flags.yhxYanzhuLost ? p.maxHp : p.hp;
      if (x <= 0) { await ctx.log('【兴学】：X 为 0，不能发动'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: `【兴学】：选择至多 ${x} 名角色`, candidates: g.alive(), min: 1, max: x, reason: 'xingxue',
      });
      if (!ts.length) { await ctx.log('【兴学】：取消发动'); return; }
      for (const t of ts) {
        await ctx.draw(t, 1, { reason: 'xingxue' });
        if (t.hand.length) {
          const c = await pickFrom(ctx, t, t.hand.slice(), `【兴学】：${t.name} 将一张手牌置于牌堆顶`);
          if (c) {
            t.hand = t.hand.filter(z => z !== c);
            g.deck.push(c);   // 牌堆顶 = 数组尾部
            await ctx.log(`【兴学】：${t.name} 将 ${cardLabel(c)} 置于牌堆顶`);
          }
        }
      }
      await ctx.log(`【兴学】：${p.name} 令 ${ts.length} 名角色（至多 ${x} 名）依次摸牌并控顶`);
    },
  }],
});

// ============================================================
// 郭皇后 · 矫诏 / 殚心
// ============================================================
defineSkill({
  id: 'yhxs_jiazhao', name: '矫诏',
  desc: '出牌阶段限一次，你可以展示一张手牌，令距离你最近的一名其他角色声明一种基本牌的牌名（杀/桃/酒），然后你将该手牌当此牌使用（本实现为立即使用；若无法使用则改为摸一张牌）。',
  active: {
    prompt: '展示一张手牌，令最近的其他角色声明基本牌，然后将其当该牌使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.yhxJiazhaoTurn !== g.turnCount) { p.flags.yhxJiazhaoTurn = g.turnCount; p.flags.yhxJiazhaoUsed = 0; }
      const limit = 1 + (p.flags.yhxDanxin || 0);
      if ((p.flags.yhxJiazhaoUsed || 0) >= limit) {
        await ctx.log(`【矫诏】：本回合已发动 ${limit} 次`);
        return;
      }
      if (!p.hand.length) { await ctx.log('【矫诏】：你没有手牌'); return; }
      const whose = others(g, p);
      if (!whose.length) { await ctx.log('【矫诏】：没有其他角色'); return; }
      const c = await pickFrom(ctx, p, p.hand.slice(), '【矫诏】：展示一张手牌');
      if (!c) { await ctx.log('【矫诏】：取消发动'); return; }
      await ctx.log(`【矫诏】：${p.name} 展示 ${cardLabel(c)}`);
      const dist = (x) => g.distance(p, x);
      let best = null, bd = 99;
      for (const x of whose) { const d = dist(x); if (d < bd) { bd = d; best = x; } }
      if (!best) return;
      const idx = await ctx.ask.choose(best, ['杀', '桃', '酒'], { prompt: `【矫诏】：${p.name} 展示了 ${cardLabel(c)}，请声明一种基本牌的牌名` });
      const name = ['sha', 'tao', 'jiu'][idx < 0 ? 0 : idx];
      p.flags.yhxJiazhaoUsed = (p.flags.yhxJiazhaoUsed || 0) + 1;
      await ctx.log(`【矫诏】：${best.name} 声明【${CARD_META[name].cn}】`);
      if (name === 'tao' && p.hp >= p.maxHp) {
        await ctx.draw(p, 1, { reason: 'jiazhao' });
        await ctx.log(`【矫诏】：${p.name} 无需使用【桃】，改为摸一张牌`);
        return;
      }
      if (name === 'sha') {
        const cands = others(g, p).filter(x => g.inAttackRange(p, x));
        if (!cands.length) {
          await ctx.draw(p, 1, { reason: 'jiazhao' });
          await ctx.log('【矫诏】：没有合法目标，改为摸一张牌');
          return;
        }
        const ts = await ctx.ask.targets(p, {
          prompt: `【矫诏】：将 ${cardLabel(c)} 当【杀】使用，选择目标`, candidates: cands, min: 1, max: 1, reason: 'jiazhao',
        });
        const t = ts[0];
        if (!t) { await ctx.draw(p, 1, { reason: 'jiazhao' }); await ctx.log('【矫诏】：未选择目标，改为摸一张牌'); return; }
        p.hand = p.hand.filter(z => z !== c);
        await ctx.discard(p, [c], { reason: 'jiazhao' });
        await ctx.useCard({ from: p, card: vcard('sha'), targets: [t], reason: 'jiazhao', ignoreShaLimit: true });
        await ctx.log(`【矫诏】：${p.name} 将 ${cardLabel(c)} 当【杀】使用`);
        return;
      }
      p.hand = p.hand.filter(z => z !== c);
      await ctx.discard(p, [c], { reason: 'jiazhao' });
      await ctx.useCard({ from: p, card: vcard(name), targets: [p], reason: 'jiazhao' });
      await ctx.log(`【矫诏】：${p.name} 将 ${cardLabel(c)} 当【${CARD_META[name].cn}】使用`);
    },
  },
});

defineSkill({
  id: 'yhxs_danxin', name: '殚心',
  desc: '当你受到伤害后，你可以摸一张牌；或令【矫诏】本局每回合可额外发动一次（依次累加）。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => (d.amount || 0) > 0 && d.self === d.player && d.player.alive !== false,
    async effect(ctx) {
      const p = ctx.self;
      const idx = await ctx.ask.choose(p, ['摸一张牌', '令【矫诏】本局每回合额外发动一次'], { prompt: '【殚心】：请选择一项' });
      if (idx === 1) {
        p.flags.yhxDanxin = (p.flags.yhxDanxin || 0) + 1;
        await ctx.log(`【殚心】：${p.name} 修改【矫诏】——本局每回合可额外发动 ${p.flags.yhxDanxin} 次`);
      } else {
        await ctx.draw(p, 1, { reason: 'danxin' });
        await ctx.log(`【殚心】：${p.name} 摸一张牌`);
      }
    },
  }],
});

// ============================================================
// 刘虞 · 止戈 / 宗祚
// ============================================================
defineSkill({
  id: 'yhxs_zhige', name: '止戈',
  desc: '出牌阶段限一次，若你的手牌数大于你的体力值，你可以选择一名攻击范围内含有你的其他角色：除非其打出一张【杀】，否则其将装备区里的一张牌交给你。',
  active: {
    perPhase: true,
    prompt: '若手牌数大于体力值：令一名攻击范围内含你的角色打出一张【杀】，否则交出装备区一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.hand.length <= p.hp) { await ctx.log(`【止戈】：你的手牌数（${p.hand.length}）不大于体力值（${p.hp}）`); return; }
      const cands = others(g, p).filter(x => g.inAttackRange(x, p) && equipCards(x).length > 0);
      const any = others(g, p).filter(x => g.inAttackRange(x, p));
      const pool = cands.length ? cands : any;
      if (!pool.length) { await ctx.log('【止戈】：没有攻击范围内含有你的其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【止戈】：选择一名攻击范围内含有你的角色', candidates: pool, min: 1, max: 1, reason: 'zhige',
      });
      const t = ts[0];
      if (!t) { await ctx.log('【止戈】：取消发动'); return; }
      const sha = t.hand.filter(c => c.name === 'sha');
      let played = false;
      if (sha.length) {
        const got = await ctx.ask.card(t, {
          prompt: `【止戈】：打出一张【杀】，否则将装备区一张牌交给 ${p.name}`,
          filter: (c) => c.name === 'sha', optional: true, reason: 'zhige',
        });
        played = !!got;
      }
      if (played) {
        await ctx.log(`【止戈】：${t.name} 打出一张【杀】，${p.name} 的计谋被化解`);
        return;
      }
      const eq = equipCards(t);
      if (!eq.length) { await ctx.log(`【止戈】：${t.name} 装备区没有牌`); return; }
      const c = await pickFrom(ctx, p, eq, `【止戈】：选择 ${t.name} 装备区的一张牌`);
      const card = c || eq[0];
      await ctx.gain(p, [card], { from: t, reason: 'zhige' });
      await ctx.log(`【止戈】：${t.name} 未打出【杀】，将 ${cardLabel(card)} 交给 ${p.name}`);
    },
  },
});

defineSkill({
  id: 'yhxs_zongzuo', name: '宗祚',
  desc: '锁定技，游戏开始时，你加 X 点体力上限和体力（X 为全场势力数）；当某势力的最后一名角色死亡后，你减 1 点体力上限。',
  triggers: [
    {
      on: 'game.start', who: 'any', optional: false,
      filter: (d) => d.player.alive !== false,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = new Set(g.alive().map(q => q.kingdom)).size;
        p.maxHp += x;
        p.hp += x;
        await ctx.log(`【宗祚】：全场 ${x} 个势力，${p.name} 体力上限与体力 +${x}（现为 ${p.hp}/${p.maxHp}）`);
      },
    },
    {
      on: 'death.after', who: 'any', optional: false,
      filter: (d) => !!d.self && d.player.alive !== false,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, k = ctx.data.self.kingdom;
        if (g.alive().some(q => q.kingdom === k)) return;
        p.maxHp = Math.max(1, p.maxHp - 1);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
        await ctx.log(`【宗祚】：${k} 势力尽灭，${p.name} 减 1 点体力上限（现为 ${p.hp}/${p.maxHp}）`);
      },
    },
  ],
});

// ============================================================
// 辛宪英 · 忠鉴 / 才识
// ============================================================
defineSkill({
  id: 'yhxs_zhongjian', name: '忠鉴',
  desc: '出牌阶段限一次，你可以展示一张手牌，然后展示手牌数大于体力值的一名其他角色的 X 张手牌（X 为其手牌数与体力值之差）：若有颜色相同的牌，你摸一张牌或弃置其一张牌；若有点数相同的牌，本回合此技能改为限两次；若均不同，你弃置一张手牌。',
  active: {
    prompt: '展示一张手牌，比对手牌（同色：摸一张或弃其一张；同点：本回合限两次）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.yhxZhongjianTurn !== g.turnCount) { p.flags.yhxZhongjianTurn = g.turnCount; p.flags.yhxZhongjianUsed = 0; }
      const limit = 1 + (p.flags.yhxZhongjianExtra === g.turnCount ? 1 : 0);
      if ((p.flags.yhxZhongjianUsed || 0) >= limit) { await ctx.log(`【忠鉴】：本回合已发动 ${limit} 次`); return; }
      if (!p.hand.length) { await ctx.log('【忠鉴】：你没有手牌'); return; }
      const mine = await pickFrom(ctx, p, p.hand.slice(), '【忠鉴】：展示一张手牌');
      if (!mine) { await ctx.log('【忠鉴】：取消发动'); return; }
      await ctx.log(`【忠鉴】：${p.name} 展示 ${cardLabel(mine)}`);
      const cands = others(g, p).filter(x => x.hand.length > x.hp);
      if (!cands.length) { await ctx.log('【忠鉴】：没有手牌数大于体力值的其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【忠鉴】：选择一名手牌数大于体力值的角色', candidates: cands, min: 1, max: 1, reason: 'zhongjian',
      });
      const t = ts[0];
      if (!t) { await ctx.log('【忠鉴】：取消发动'); return; }
      p.flags.yhxZhongjianUsed = (p.flags.yhxZhongjianUsed || 0) + 1;
      const x = t.hand.length - t.hp;
      const shown = t.hand.slice(0, Math.max(1, x));
      await ctx.log(`【忠鉴】：${t.name} 展示 ${shown.map(cardLabel).join('、')}`);
      const sameColor = shown.some(c => isRedC(c) === isRedC(mine));
      const sameNum = shown.some(c => c.num === mine.num);
      if (sameColor) {
        const idx = await ctx.ask.choose(p, ['摸一张牌', `弃置 ${t.name} 一张牌`], { prompt: '【忠鉴】：有颜色相同的牌' });
        if (idx === 1) {
          const pool = zonesOf(t);
          const c = await pickFrom(ctx, p, pool, `【忠鉴】：弃置 ${t.name} 一张牌`);
          if (c) { await ctx.discard(t, [c], { reason: 'zhongjian' }); await ctx.log(`【忠鉴】：${p.name} 弃置 ${t.name} 的 ${cardLabel(c)}`); }
        } else {
          await ctx.draw(p, 1, { reason: 'zhongjian' });
          await ctx.log(`【忠鉴】：${p.name} 摸一张牌`);
        }
      } else if (sameNum) {
        p.flags.yhxZhongjianExtra = g.turnCount;
        await ctx.log(`【忠鉴】：有点数相同的牌，本回合此技能改为限两次`);
      } else {
        if (p.hand.length) {
          const c = await pickFrom(ctx, p, p.hand.slice(), '【忠鉴】：弃置一张手牌');
          if (c) { await ctx.discard(p, [c], { reason: 'zhongjian' }); await ctx.log(`【忠鉴】：均不同，${p.name} 弃置 ${cardLabel(c)}`); }
        }
      }
    },
  },
});

defineSkill({
  id: 'yhxs_caishi', name: '才识',
  desc: '摸牌阶段开始时，你可以选择一项：1. 本回合你的手牌上限 +1，然后本回合你不能指定其他角色为目标；2. 回复 1 点体力。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw' && d.self === d.player,
    async effect(ctx) {
      const p = ctx.self;
      const idx = await ctx.ask.choose(p, ['手牌上限 +1，本回合不能指定其他角色为目标', '回复 1 点体力'], { prompt: '【才识】：请选择一项' });
      if (idx === 1) {
        if (p.hp < p.maxHp) {
          await ctx.recover(p, 1, { reason: 'caishi' });
          await ctx.log(`【才识】：${p.name} 回复 1 点体力`);
        } else {
          await ctx.log('【才识】：体力已满，取消发动');
        }
        return;
      }
      p.flags.handLimit = (p.flags.handLimit || 0) + 1;
      p.flags.zhuikongTurn = ctx.game.turnCount;   // 复用引擎「本回合不能指定其他角色为目标」出口
      await ctx.log(`【才识】：${p.name} 本回合手牌上限 +1，且不能指定其他角色为目标`);
    },
  }],
});

// ============================================================
// 吴苋 · 福绵 / 怠宴
// ============================================================
defineSkill({
  id: 'yhxs_fumian', name: '福绵',
  desc: '准备阶段，你可以选择一项：1. 本回合摸牌阶段多摸一张牌；2. 本回合限一次，你使用红色基本牌或红色普通锦囊牌时可以额外指定一名其他角色为目标（无距离限制）。若你选择的选项与你上回合选择的选项不同，则数值 +1。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare' && d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        const idx = await ctx.ask.choose(p, ['本回合摸牌阶段多摸牌', '本回合使用红色牌可额外指定一个目标'], { prompt: '【福绵】：请选择一项' });
        const opt = idx === 1 ? 1 : 0;
        const grow = p.flags.yhxFumianLast !== undefined && p.flags.yhxFumianLast !== opt;
        p.flags.yhxFumianLast = opt;
        const n = grow ? 2 : 1;
        if (opt === 0) {
          p.flags.yhxFumianDraw = n;
          await ctx.log(`【福绵】：${p.name} 本回合摸牌阶段多摸 ${n} 张牌`);
        } else {
          p.flags.yhxFumianTarget = n;
          p.flags.yhxFumianTargetTurn = ctx.game.turnCount;
          await ctx.log(`【福绵】：${p.name} 本回合使用红色牌可额外指定 ${n} 个目标`);
        }
      },
    },
    {
      on: 'draw.count', who: 'self', optional: false,
      filter: (d) => d.self === d.player && (d.player.flags.yhxFumianDraw || 0) > 0
        && (d.player.flags.yhxFumianTurn !== d.game.turnCount),
      async effect(ctx) {
        const p = ctx.self, n = p.flags.yhxFumianDraw || 0;
        if (!n) return;
        ctx.data.count += n;
        p.flags.yhxFumianDraw = 0;
        p.flags.yhxFumianTurn = ctx.game.turnCount;
        await ctx.log(`【福绵】：${p.name} 摸牌阶段多摸 ${n} 张牌`);
      },
    },
    {
      // 选项 2：使用红色基本牌/普通锦囊时额外指定一名目标
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => {
        const p = d.player;
        if (d.self !== p) return false;
        if ((p.flags.yhxFumianTarget || 0) <= 0) return false;
        if (p.flags.yhxFumianTargetTurn !== d.game.turnCount) return false;
        const c = d.card;
        if (!c || !isRedC(c)) return false;
        const meta = CARD_META[c.name];
        if (!meta) return false;
        if (meta.type !== 'basic' && !(meta.type === 'trick' && !meta.delayed)) return false;
        return ['sha', 'juedou', 'guohe', 'shunshou', 'huogong'].includes(c.name)
          && (d.targets || []).length > 0;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const cands = g.alive().filter(x => x !== p && !(d.targets || []).includes(x));
        if (!cands.length) return;
        const n = p.flags.yhxFumianTarget || 1;
        const ts = await ctx.ask.targets(p, {
          prompt: `【福绵】：额外指定至多 ${n} 名目标`, candidates: cands, min: 1, max: n, reason: 'fumian',
        });
        if (!ts.length) return;
        d.extraTargets = ts.map(x => x.seat);
        p.flags.yhxFumianTarget = 0;
        await ctx.log(`【福绵】：额外指定 ${ts.map(x => x.name).join('、')} 为目标（无距离限制）`);
      },
    },
  ],
});

defineSkill({
  id: 'yhxs_daiyan', name: '怠宴',
  desc: '结束阶段，你可以令一名其他角色从牌堆中获得一张♥基本牌，然后若其于上回合成为过此技能的目标，其失去 1 点体力。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end' && d.self === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【怠宴】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【怠宴】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'daiyan',
      });
      const t = ts[0];
      if (!t) { await ctx.log('【怠宴】：取消发动'); return; }
      const idx = g.deck.findIndex(c => c.suit === 'heart' && CARD_META[c.name]?.type === 'basic');
      if (idx >= 0) {
        const c = g.deck.splice(idx, 1)[0];
        await ctx.gain(t, [c], { reason: 'daiyan' });
        await ctx.log(`【怠宴】：${t.name} 自牌堆获得 ${cardLabel(c)}`);
      } else {
        await ctx.log('【怠宴】：牌堆中没有♥基本牌，其未获得牌');
      }
      if (t.flags.yhxDaiyanRound === g.round - 1) {
        await ctx.loseHp(t, 1, { reason: 'daiyan' });
        await ctx.log(`【怠宴】：${t.name} 连续两回合被怠宴，失去 1 点体力`);
      }
      t.flags.yhxDaiyanRound = g.round;
    },
  }],
});
