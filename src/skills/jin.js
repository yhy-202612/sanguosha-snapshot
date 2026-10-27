// 晋势力 · 文德武备（阶段 4D · 8 将 24 技能）
// 官方出处：《三国杀OL》2021-01-20 应变篇 第五势力「晋」首发 8 将（官网版本公告为准）。
//
// ============ M8 隐匿技（引擎已实现，本文件只读写 player.hidden）============
//   hidden: true 的武将开局 player.hidden === true：
//     ① 不能被其他角色指定为目标（canUse 拦截）② 不参与距离计算 ③ 使用任意牌后自动解除隐匿。
//   「登场」= 解除隐匿的瞬间。引擎只在「使用牌」时解除隐匿，因此本文件用统一钩子 onAppear()：
//     监听 card.use.after，当 hidden 已变为 false 且尚未打过标记时视为「登场」，写入 p.flags.jinAppeared。
//   张春华【宣穆】另外补了「隐匿状态下受到伤害即登场」（官方规则），由技能自己清 hidden。
//
// ============ 与原版技能的偏差（均在 desc 中写成实际实现的版本）============
//   1. 晋司马懿【鹰视】原为「牌堆顶 X 张对你可见」的纯情报技，引擎无「私密可见」通道 → 实现为
//      出牌阶段开始在战报里列出牌堆顶 X 张（信息对全体公开，属于简化）。
//   2. 晋司马懿【权变】原还包含「出牌阶段至多可使用 X 张非装备手牌」，引擎出牌阶段无「使用张数」
//      限制点 → 未实现该限制（仅实现「每种花色首次使用/打出时补一张异花色牌」）。
//   3. 晋张春华【清冷】原为「冰属性【杀】」，引擎 CARD_META 无冰【杀】/冰属性伤害 → 实现为普通【杀】
//      （无距离限制、不计次数）。
//   4. 王元姬【识人】、夏侯徽【宝箧】官方同为「隐匿技」，但本批按主控要求只让司马家四将 hidden:true，
//      故这两个技能改为「你的第一个回合开始时」发动的登场效果。
//   5. 夏侯徽【宝箧】原为「获得一张宝物牌」，引擎牌堆没有宝物牌类别 → 改为获得一张装备牌。
//   6. 司马昭【筹伐】原为「其手牌中与此牌不同类型的牌均视为【杀】直到其回合结束」，引擎不支持对
//      他人手牌做牌名转化（VIRTUAL_RULES 是引擎侧文件，本批不得修改）→ 实现为「弃置其一张不同类型
//      的手牌，你摸一张牌」。
//   7. 杜预【破竹】原为「将一张手牌当【出其不意】使用」，引擎无【出其不意】→ 实现为当【杀】使用
//      （无距离限制、不计次数），若此【杀】未造成伤害则本回合不能再发动。
//   8. 张虎&乐綝【袭爵】官方只有这一个技能，其内含【突袭】【骁果】两个子流程（双将合集），
//      本实现按「消耗 1 枚『爵』」的官方口径调用这两个子流程。
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

let vseq = 0;
const vcard = (name, suit = 'none', num = 0) => ({
  id: `vj${++vseq}`, name, suit, num, type: CARD_META[name]?.type, virtual: true,
});
const typeOf = (c) => CARD_META[c?.name]?.type;
const cnOf = (c) => CARD_META[c?.name]?.cn || c?.name || '?';
const others = (g, p) => g.alive().filter(q => q !== p);
const isEquip = (c) => typeOf(c) === 'equip';
const haveSuit = (cards, suit) => cards.some(c => c.suit === suit);
// 伤害类锦囊（睿略用）：决斗 / 南蛮入侵 / 万箭齐发 / 火攻
const DMG_TRICKS = new Set(['juedou', 'nanman', 'wanjian', 'huogong']);
// 「登场」标记（每名隐匿武将全局只登场一次）
const APPEAR = 'jinAppeared';

// 从牌堆顶取 X 张（返回数组，最后一个元素是牌堆顶）
const takeTop = (g, x) => {
  const n = Math.min(Math.max(0, x), g.deck.length);
  return n ? g.deck.splice(g.deck.length - n, n) : [];
};
const peekTop = (g, x) => g.deck.slice(g.deck.length - Math.min(Math.max(0, x), g.deck.length)).reverse();

// 从一名角色的区域（手牌/装备/判定）里选一张牌（不移动）
const pickZoneCard = async (ctx, from, target, prompt = '选择一张牌') => {
  const g = ctx.game;
  const pool = [
    ...target.hand,
    ...Object.values(target.equips).filter(Boolean),
    ...(target.judgeZone || []).map(z => z.card).filter(Boolean),
  ].filter(Boolean);
  if (!pool.length) return null;
  return (await g.chooseSomeCards(from, pool, 1, { prompt, optional: false }))[0] || null;
};

// 隐匿技「登场」统一钩子：把「解除隐匿」的那一次使用牌动作识别为登场
const onAppear = (effect, extraFilter = null) => ({
  on: 'card.use.after', who: 'self', optional: false,
  filter: (d) => !!d.self && d.self === d.player && d.self.alive
    && d.self.hidden === false && d.self.flags[APPEAR] !== true
    && (extraFilter ? extraFilter(d) : true),
  async effect(ctx) {
    const p = ctx.self;
    p.flags[APPEAR] = true;
    p.flags.jinAppearCard = ctx.data?.card?.id || null;
    p.flags.jinAppearTurn = ctx.game.turnCount;
    await ctx.log(`【登场】：${p.name} 亮出武将牌（解除隐匿）`);
    await effect(ctx);
  },
});

// ============================================================
// ==================== 晋司马懿（晋 · 3 · 隐匿） ====================
// ============================================================

// 不臣（隐匿技）：你于其他角色的回合登场后，可以获得当前回合角色的一张牌。
defineSkill({
  id: 'buchen', name: '不臣',
  desc: '隐匿技，当你于其他角色的回合登场后，你可以获得当前回合角色的一张牌。',
  triggers: [
    onAppear(async (ctx) => {
      const p = ctx.self, g = ctx.game;
      const t = g.turnPlayer;
      if (!t || t === p || !t.alive) return;
      if (!g.zoneCards(t).length) return;
      const yes = await ctx.ask.confirm(p, `【不臣】：是否获得当前回合角色 ${t.name} 的一张牌？`);
      if (!yes) return;
      const c = await pickZoneCard(ctx, p, t, '【不臣】：选择获得的一张牌');
      if (!c) return;
      await ctx.gain(p, [c], { from: t, reason: 'buchen' });
      await ctx.log(`【不臣】：${p.name} 获得 ${t.name} 的一张牌`);
    }, (d) => !!d.game.turnPlayer && d.game.turnPlayer !== d.player),
  ],
});

// 鹰视（锁定技）：出牌阶段，牌堆顶的 X 张牌始终对你可见（X 为体力上限）。
defineSkill({
  id: 'yingshi', name: '鹰视',
  desc: '锁定技，出牌阶段，牌堆顶的 X 张牌始终对你可见（X 为你的体力上限）。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && d.player.hidden !== true && d.player.maxHp > 0 && d.game.deck.length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = Math.min(p.maxHp, g.deck.length);
        const list = peekTop(g, x).map(cardLabel).join('、');
        await ctx.log(`【鹰视】：${p.name} 看到牌堆顶 ${x} 张牌（${list}）`);
      },
    },
  ],
});

// 雄志（限定技）：出牌阶段，展示牌堆顶的一张牌然后使用之，重复直到无法使用。
defineSkill({
  id: 'xiongzhi', name: '雄志',
  desc: '限定技，出牌阶段，你可以展示牌堆顶的一张牌，然后你使用此牌；若如此做，重复此流程直到你无法使用。',
  active: {
    prompt: '【雄志】（限定技）：展示牌堆顶的牌并尝试使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.xiongzhiUsed) { await ctx.log('【雄志】：本局已发动过（限定技）'); return; }
      p.flags.xiongzhiUsed = true;
      await ctx.log(`【雄志】：${p.name} 展示牌堆顶的牌并依次尝试使用`);
      let step = 0;
      while (g.deck.length && step < 12 && p.alive) {
        step += 1;
        const c = g.deck[g.deck.length - 1];
        const yes = await ctx.ask.confirm(p, `【雄志】：展示牌堆顶 ${cardLabel(c)}，是否使用？`);
        if (!yes) break;
        g.deck.pop();
        let targets = [];
        const rule = CARD_META[c.name]?.target;
        const cands = g.candidatesFor(p, c, null) || [];
        const auto = g.autoTargetsFor(p, c, null);
        if (auto && auto.length) {
          targets = auto;
        } else if (rule && typeof rule === 'object' && (rule.min || 0) > 0) {
          const ts = await ctx.ask.targets(p, {
            min: rule.min || 1, max: rule.max || 1, candidates: cands,
            prompt: `【雄志】：为 ${cardLabel(c)} 指定目标`,
          });
          if (!ts.length) { g.discardPile.push(c); break; }
          targets = ts;
        } else if (cands.length && rule && typeof rule === 'object') {
          targets = cands.slice(0, rule.max || 1);
        }
        const ok = await ctx.useCard({ from: p, card: c, targets, reason: 'xiongzhi' });
        if (!ok) {
          if (!g.discardPile.includes(c)) g.discardPile.push(c);
          break;
        }
      }
    },
  },
});

// 权变：出牌阶段，每当你首次使用/打出一种花色的手牌时，可以从牌堆顶 X 张中获得一张异花色牌。
defineSkill({
  id: 'quanbian', name: '权变',
  desc: '出牌阶段，每当你首次使用/打出一种花色的手牌时，你可以从牌堆顶的 X 张牌中获得一张与此牌花色不同的牌，并将其余牌以任意顺序置于牌堆顶（X 为你的体力上限）。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && d.game.phase === 'play'
        && d.player.flags[APPEAR] === true
        && !!d.card && !!d.card.suit && d.card.suit !== 'none'
        && d.card.id !== d.player.flags.jinAppearCard
        && d.player.flags[`qb_${d.game.turnCount}_${d.card.suit}`] !== true,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const suit = ctx.data.card.suit;
        const key = `qb_${g.turnCount}_${suit}`;
        if (p.flags[key]) return;
        p.flags[key] = true;
        if (g.deck.length === 0) return;
        const x = Math.min(Math.max(1, p.maxHp), g.deck.length);
        const pool = takeTop(g, x);
        const cands = pool.filter(c => c.suit && c.suit !== 'none' && c.suit !== suit);
        const yes = await ctx.ask.confirm(p,
          `【权变】：是否从牌堆顶 ${x} 张中取一张非${SUIT_CN[suit]}花色的牌？（其余置于牌堆顶）`);
        if (!yes || !cands.length) {
          g.deck.push(...pool);
          if (yes) await ctx.log('【权变】：牌堆顶没有异花色的牌');
          return;
        }
        const pick = (await g.chooseSomeCards(p, cands, 1, { prompt: '【权变】：选择获得的一张牌', optional: false }))[0];
        if (!pick) { g.deck.push(...pool); return; }
        g.deck.push(...pool.filter(c => c !== pick));
        await ctx.gain(p, [pick], { reason: 'quanbian' });
        await ctx.log(`【权变】：${p.name} 获得一张非${SUIT_CN[suit]}花色的牌`);
      },
    },
  ],
});

// ============================================================
// ==================== 晋张春华（晋 · 3 · 隐匿） ====================
// ============================================================

// 慧识：摸牌阶段，放弃摸牌，观看牌堆顶 X 张，获得其中一半（向下取整），其余置于牌堆底。
defineSkill({
  id: 'huishi', name: '慧识',
  desc: '摸牌阶段，你可以放弃摸牌，改为观看牌堆顶的 X 张牌，获得其中的一半（向下取整），然后将其余牌置入牌堆底（X 为牌堆中牌数的个位数）。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      prompt: '【慧识】：是否放弃摸牌，改为观看牌堆顶的牌并获得其中一半（其余置于牌堆底）？',
      filter: (d) => d.phase === 'draw' && d.player.alive && (d.game.deck.length % 10) >= 2,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const x = g.deck.length % 10;
        if (x < 2) return;
        p.flags.skip_draw = true;
        const pool = takeTop(g, x);
        const n = Math.floor(x / 2);
        const picks = await g.chooseSomeCards(p, pool.slice(), n, { prompt: `【慧识】：从 ${x} 张中选 ${n} 张获得`, optional: false });
        const rest = pool.filter(c => !picks.includes(c));
        g.deck.unshift(...rest);   // 其余置于牌堆底（保持顺序）
        await ctx.gain(p, picks, { reason: 'huishi' });
        await ctx.log(`【慧识】：${p.name} 观看牌堆顶 ${x} 张，获得 ${picks.length} 张，其余 ${rest.length} 张置于牌堆底`);
      },
    },
  ],
});

// 清冷：一名角色的回合结束时，若其体力值与手牌数之和不小于 X，你可将一张牌当无距离限制的【杀】对其使用。
defineSkill({
  id: 'qingleng', name: '清冷',
  desc: '一名角色的结束阶段开始时，若其体力值与其手牌数之和不小于 X（X 为牌堆中牌数的个位数），你可以将一张牌当作无距离限制的【杀】对其使用；当你首次对一名角色发动本技能时，你摸一张牌。',
  triggers: [
    {
      on: 'phase.begin', who: 'any', optional: true,
      prompt: '【清冷】：是否将一张牌当作无距离限制的【杀】对其使用？',
      filter: (d) => d.phase === 'end' && !!d.self && d.self.alive && d.self !== d.player
        && d.player.alive && d.player.hand.length > 0 && d.player.flags[APPEAR] === true
        && (d.self.hp + d.self.hand.length) >= (d.game.deck.length % 10),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.self;
        const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【清冷】：选择一张牌当作【杀】', optional: false }))[0];
        if (!c) return;
        const seen = p.flags.qinglengSeats || {};
        const first = !seen[t.seat];
        if (first) p.flags.qinglengSeats = { ...seen, [t.seat]: true };
        const ok = await ctx.useCard({
          from: p, card: vcard('sha', c.suit, c.num), targets: [t],
          reason: 'qingleng', extraCards: [c], ignoreRange: true, ignoreShaLimit: true,
        });
        if (ok && first) {
          await ctx.draw(p, 1, { reason: 'qingleng' });
          await ctx.log(`【清冷】：${p.name} 首次对 ${t.name} 发动，摸一张牌`);
        }
      },
    },
  ],
});

// 宣穆（锁定技 · 隐匿技）：你于其他角色的回合登场时，防止你本回合受到的伤害。
defineSkill({
  id: 'xuanmu', name: '宣穆',
  desc: '锁定技，隐匿技。你于其他角色的回合登场时，你于此回合内防止你受到的伤害。',
  triggers: [
    // ① 隐匿中受到伤害 → 登场（官方：隐匿状态体力扣减即登场），并防止此次伤害
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self.hidden === true,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        p.hidden = false;
        p.flags[APPEAR] = true;
        p.flags.jinAppearTurn = g.turnCount;
        d.canceled = true;
        p.flags.xuanmuTurn = g.turnCount;
        await ctx.log(`【宣穆】：${p.name} 受到伤害，隐匿登场，并防止本回合你受到的伤害`);
      },
    },
    // ② 登场后本回合防止伤害
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self.hidden !== true && d.self.flags.xuanmuTurn === d.game.turnCount,
      async effect(ctx) {
        ctx.data.canceled = true;
        await ctx.log(`【宣穆】：防止 ${ctx.self.name} 受到的伤害`);
      },
    },
    // ③ 于其他角色的回合「用牌登场」时同样生效
    onAppear(async (ctx) => {
      const p = ctx.self, g = ctx.game;
      if (g.turnPlayer && g.turnPlayer !== p) {
        p.flags.xuanmuTurn = g.turnCount;
        await ctx.log(`【宣穆】：${p.name} 于 ${g.turnPlayer.name} 的回合登场，本回合防止其受到的伤害`);
      }
    }),
  ],
});

// ============================================================
// ==================== 司马师（晋 · 4/3 · 隐匿） ====================
// ============================================================

// 韬隐（隐匿技）：你于其他角色的回合登场后，可令当前回合角色本回合手牌上限 -2。
defineSkill({
  id: 'taoyin', name: '韬隐',
  desc: '隐匿技，当你于其他角色的回合登场后，你可以令当前回合角色于此回合内手牌上限 -2。',
  triggers: [
    onAppear(async (ctx) => {
      const p = ctx.self, g = ctx.game;
      const t = g.turnPlayer;
      if (!t || t === p || !t.alive) return;
      const yes = await ctx.ask.confirm(p, `【韬隐】：是否令 ${t.name} 本回合手牌上限 -2？`);
      if (!yes) return;
      t.flags.handLimit = (t.flags.handLimit || 0) - 2;
      t.flags.taoyinTurn = g.turnCount;
      await ctx.log(`【韬隐】：${t.name} 本回合手牌上限 -2`);
    }, (d) => !!d.game.turnPlayer && d.game.turnPlayer !== d.player),
    // 回合结束时还原
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => !!d.self && d.self.flags.taoyinTurn === d.game.turnCount,
      async effect(ctx) {
        const t = ctx.data.self;
        t.flags.handLimit = (t.flags.handLimit || 0) + 2;
        delete t.flags.taoyinTurn;
      },
    },
  ],
});

// 夷灭：每名角色的回合限一次，你对其造成伤害时，可失去 1 点体力令此伤害 +X（X为其体力值-本次伤害值），结算后其回复 X 点体力。
defineSkill({
  id: 'yimie', name: '夷灭',
  desc: '每名角色的回合限一次，当你对一名其他角色造成伤害时，你可以失去 1 点体力，令此伤害 +X（X 为其体力值减本次伤害值；若 X 为 0 则不提示发动），此伤害结算后，该角色回复 X 点体力。',
  triggers: [
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => !!d.from && d.from === d.player && !!d.to && d.to !== d.player && d.to.alive
        && d.player.alive && d.player.flags.yimieTurn !== d.game.turnCount
        && (d.to.hp - d.amount) > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        const x = d.to.hp - d.amount;
        const victim = d.to;
        const yes = await ctx.ask.confirm(p,
          `【夷灭】：失去 1 点体力，令此伤害 +${x}（结算后 ${victim.name} 回复 ${x} 点体力）？`);
        if (!yes) return;
        p.flags.yimieTurn = g.turnCount;
        await ctx.loseHp(p, 1);
        if (!p.alive) return;
        d.amount += x;
        await ctx.log(`【夷灭】：${p.name} 失去 1 点体力，此伤害 +${x}`);
        d.afterDamage = async () => {
          if (victim.alive && x > 0) {
            await g.recover(victim, x, { from: p, reason: 'yimie' });
            await g.log(`【夷灭】：${victim.name} 回复 ${x} 点体力`);
          }
        };
      },
    },
  ],
});

// 睿略（主公技）：其他晋势力角色的出牌阶段限一次，其可以将一张【杀】或伤害锦囊交给你。
defineSkill({
  id: 'ruilve', name: '睿略',
  desc: '主公技，其他晋势力角色的出牌阶段限一次，该角色可以将一张【杀】或伤害类锦囊牌交给你。',
  triggers: [
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'play' && !!d.self && d.self !== d.player && d.self.alive
        && d.self.kingdom === 'jin' && d.player.alive
        && d.self.flags.ruilveTurn !== d.game.turnCount
        && d.self.hand.some(c => c.name === 'sha' || DMG_TRICKS.has(c.name)),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.self;
        const pool = t.hand.filter(c => c.name === 'sha' || DMG_TRICKS.has(c.name));
        if (!pool.length) return;
        const yes = await ctx.ask.confirm(t, `【睿略】：是否将一张【杀】或伤害锦囊交给 ${p.name}？`);
        if (!yes) return;
        t.flags.ruilveTurn = g.turnCount;
        const c = (await g.chooseSomeCards(t, pool, 1, { prompt: '【睿略】：选择交出的牌', optional: false }))[0];
        if (!c) return;
        await ctx.gain(p, [c], { from: t, reason: 'ruilve' });
        await ctx.log(`【睿略】：${t.name} 交给 ${p.name} ${cardLabel(c)}`);
      },
    },
  ],
});

// 泰然（锁定技）：结束阶段回复体力至上限、手牌补至上限；下个出牌阶段开始时失去/弃置上回合以此法得到的部分。
defineSkill({
  id: 'tairan', name: '泰然',
  desc: '锁定技，回合结束时，你将体力回复至体力上限，将手牌摸至体力上限；出牌阶段开始时，你失去上回合结束时以此法回复的体力值，弃置你上回合结束时以此法获得的手牌。',
  triggers: [
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => d.player.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const healed = Math.max(0, p.maxHp - p.hp);
        if (healed > 0) await ctx.recover(p, healed);
        const need = Math.max(0, p.maxHp - p.hand.length);
        const got = need > 0 ? (await ctx.draw(p, need, { reason: 'tairan' })) : [];
        p.flags.tairanHp = healed;
        p.flags.tairanCards = (got || []).map(c => c.id);
        await ctx.log(`【泰然】：${p.name} 回复 ${healed} 点体力，摸 ${(got || []).length} 张牌`);
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'play' && d.player.alive,
      async effect(ctx) {
        const p = ctx.self;
        const hp = p.flags.tairanHp || 0;
        const ids = p.flags.tairanCards || [];
        p.flags.tairanHp = 0;
        p.flags.tairanCards = [];
        const cards = p.hand.filter(c => ids.includes(c.id));
        if (cards.length) await ctx.discard(p, cards, { reason: 'tairan' });
        if (hp > 0) await ctx.loseHp(p, hp);
        if (hp || cards.length) await ctx.log(`【泰然】：${p.name} 失去 ${hp} 点体力，弃置 ${cards.length} 张上回合以此法获得的牌`);
      },
    },
  ],
});

// ============================================================
// ==================== 司马昭（晋 · 3 · 隐匿） ====================
// ============================================================

// 推弑（隐匿技）：若你于其他角色的回合登场，此回合结束时，你可令其对其攻击范围内你选择的一名角色使用【杀】。
defineSkill({
  id: 'tuishi', name: '推弑',
  desc: '隐匿技，若你于其他角色的回合登场，此回合结束时，你可以令其对其攻击范围内、你选择的一名角色使用【杀】，若其未使用【杀】，你对其造成 1 点伤害。',
  triggers: [
    onAppear(async (ctx) => {
      const p = ctx.self, g = ctx.game;
      const t = g.turnPlayer;
      if (!t || t === p || !t.alive) return;
      p.flags.tuishiTurn = g.turnCount;
      p.flags.tuishiSeat = t.seat;
      await ctx.log(`【推弑】：${p.name} 于 ${t.name} 的回合登场，回合结束时将令其使用【杀】`);
    }, (d) => !!d.game.turnPlayer && d.game.turnPlayer !== d.player),
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => !!d.self && d.player.alive
        && d.player.flags.tuishiTurn === d.game.turnCount
        && d.player.flags.tuishiSeat === d.self.seat,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, t = ctx.data.self;
        p.flags.tuishiTurn = 0;
        p.flags.tuishiSeat = -1;
        if (!t.alive) return;
        const cands = g.alive().filter(q => q !== t && g.inAttackRange(t, q));
        if (!cands.length) return;
        const yes = await ctx.ask.confirm(p, `【推弑】：是否令 ${t.name} 对其攻击范围内的一名角色使用【杀】？`);
        if (!yes) return;
        const q = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【推弑】：为其选择目标' }))[0];
        if (!q) return;
        const sha = t.hand.find(c => c.name === 'sha');
        let used = false;
        if (sha) {
          used = await ctx.useCard({ from: t, card: sha, targets: [q], reason: 'tuishi', ignoreRange: true, ignoreShaLimit: true });
        }
        if (!used) {
          await ctx.log(`【推弑】：${t.name} 未使用【杀】`);
          await ctx.damage({ from: p, to: t, amount: 1, reason: 'tuishi' });
        }
      },
    },
  ],
});

// 筹伐：出牌阶段限一次，展示一名其他角色的一张手牌，弃置其一张不同类别的牌，你摸一张牌。
defineSkill({
  id: 'choufa', name: '筹伐',
  desc: '出牌阶段限一次，你可以展示一名其他角色的一张手牌，然后弃置其一张与此牌类别不同的手牌；若如此做，你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '【筹伐】：展示一名其他角色的一张手牌，弃置其一张不同类别的牌，你摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter(t => t.hand.length > 0);
      if (!cands.length) { await ctx.log('【筹伐】：没有可选目标'); return; }
      const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【筹伐】：选择一名角色' }))[0];
      if (!t) return;
      const c = t.hand[g.rng.int(t.hand.length)];
      const ty = typeOf(c);
      await ctx.log(`【筹伐】：展示 ${t.name} 的一张手牌 ${cardLabel(c)}`);
      const pool = t.hand.filter(x => x !== c && typeOf(x) !== ty);
      if (!pool.length) { await ctx.log('【筹伐】：其没有类别不同的手牌'); return; }
      const pick = (await g.chooseSomeCards(p, pool, 1, { prompt: '【筹伐】：弃置其一张类别不同的手牌', optional: false }))[0];
      if (!pick) return;
      await ctx.discard(t, [pick], { reason: 'choufa' });
      await ctx.draw(p, 1, { reason: 'choufa' });
      await ctx.log(`【筹伐】：${t.name} 弃置一张牌，${p.name} 摸一张牌`);
    },
  },
});

// 昭然：出牌阶段开始时，可令手牌对所有角色可见；本阶段你失去某花色最后一张手牌时，摸一张或弃置他人一张牌。
const zhaoranStep = async (ctx, suit, exclude = []) => {
  const p = ctx.self, g = ctx.game;
  if (!suit || suit === 'none') return;
  if (p.flags.zhaoranTurn !== g.turnCount) return;
  if (haveSuit(p.hand.filter(c => !exclude.includes(c)), suit)) return;   // 手上仍有该花色
  p.flags.zhaoranSuits = p.flags.zhaoranSuits || {};
  if (p.flags.zhaoranSuits[suit]) return;
  p.flags.zhaoranSuits[suit] = true;
  const withCards = others(g, p).filter(q => g.zoneCards(q).length > 0);
  const opts = ['摸一张牌'];
  if (withCards.length) opts.push('弃置一名其他角色的一张牌');
  const idx = await ctx.ask.choose(p, opts, { prompt: `【昭然】：${SUIT_CN[suit] || ''}花色的最后一张手牌已失去，选择一项` });
  if (idx === 1 && withCards.length) {
    const t = (await ctx.ask.targets(p, { candidates: withCards, min: 1, max: 1, prompt: '【昭然】：选择一名角色' }))[0];
    if (t) {
      const c = await pickZoneCard(ctx, p, t, '【昭然】：弃置其一张牌');
      if (c) {
        await ctx.discard(t, [c], { reason: 'zhaoran' });
        await ctx.log(`【昭然】：${p.name} 弃置 ${t.name} 的一张牌`);
        return;
      }
    }
  }
  await ctx.draw(p, 1, { reason: 'zhaoran' });
  await ctx.log(`【昭然】：${p.name} 摸一张牌`);
};

defineSkill({
  id: 'zhaoran', name: '昭然',
  desc: '出牌阶段开始时，你可以令你的手牌对所有角色可见直到此阶段结束。若如此做，你于出牌阶段失去任意花色的最后一张手牌时，你可以摸一张牌或弃置一名其他角色的一张牌（每种花色限一次）。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      prompt: '【昭然】：令你的手牌对所有角色可见直到此阶段结束？（本阶段失去某花色最后一张手牌时可摸一张或弃置他人一张牌）',
      filter: (d) => d.phase === 'play' && d.player.alive,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.zhaoranTurn = g.turnCount;
        p.flags.zhaoranSuits = {};
        await ctx.log(`【昭然】：${p.name} 的手牌本阶段对所有角色可见（${p.hand.map(cardLabel).join('、') || '无'}）`);
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && !!d.card?.suit
        && d.player.flags.zhaoranTurn === d.game.turnCount,
      async effect(ctx) { await zhaoranStep(ctx, ctx.data.card.suit); },
    },
    {
      on: 'cards.discard', who: 'self', optional: false,
      filter: (d) => !!d.self && d.self === d.player && (d.cards || []).length > 0
        && d.player.flags.zhaoranTurn === d.game.turnCount,
      async effect(ctx) {
        const list = ctx.data.cards || [];
        const suits = [...new Set(list.map(c => c.suit).filter(s => s && s !== 'none'))];
        for (const s of suits) await zhaoranStep(ctx, s, list);
      },
    },
  ],
});

// 成务（主公技 · 锁定技）：其他晋势力角色攻击范围内的角色，你与他们计算距离时视为 1（即视为在你的攻击范围内）。
defineSkill({
  id: 'chengwu', name: '成务',
  desc: '主公技，锁定技，其他晋势力角色攻击范围内的角色，你与他们计算距离时视为 1（即视为在你的攻击范围内）。',
  triggers: [
    {
      on: 'distance.calc', who: 'self', optional: false,
      // distance.calc 走 triggerSync：引擎会调用 filter，但不得 await
      effect(ctx) {
        const d = ctx.data, p = ctx.self, g = ctx.game;
        if (!d || !d.to || d.to === p) return;
        if (p.hidden) return;
        if (p.flags.cwBusy) return;
        if (d.value <= 1) return;
        const jin = g.alive().filter(q => q !== p && q !== d.to && q.kingdom === 'jin');
        if (!jin.length) return;
        p.flags.cwBusy = true;
        try {
          if (jin.some(q => g.inAttackRange(q, d.to))) d.value = 1;
        } finally {
          p.flags.cwBusy = false;
        }
      },
    },
  ],
});

// ============================================================
// ==================== 王元姬（晋 · 3） ====================
// ============================================================

// 宴戏子流程（识人 / 宴戏 共用）
const yanxiFlow = async (ctx, p, t) => {
  const g = ctx.game;
  if (!t || !t.alive || !t.hand.length) return;
  const hc = t.hand[g.rng.int(t.hand.length)];
  const top = takeTop(g, 2);
  const pool = g.rng.shuffle([hc, ...top]);
  const labels = pool.map((c) => `第 ${pool.indexOf(c) + 1} 张（${cardLabel(c)}）`);
  await ctx.log(`【宴戏】：${t.name} 的一张手牌与牌堆顶两张牌混合展示：${pool.map(cardLabel).join('、')}`);
  const correct = pool.indexOf(hc);
  const raw = await ctx.ask.choose(p, labels, { prompt: '【宴戏】：猜哪一张来自其手牌' });
  const guess = raw >= 0 ? raw : 0;
  // 手牌来源的那张先移出其手牌，避免同一张牌同时存在于两处
  const hi = t.hand.indexOf(hc);
  if (hi >= 0) t.hand.splice(hi, 1);
  const got = guess === correct ? pool.slice() : [pool[guess] || pool[0]];
  const rest = pool.filter(c => !got.includes(c));
  await ctx.gain(p, got, { reason: 'yanxi' });
  g.discardPile.push(...rest.filter(c => c && !g.discardPile.includes(c)));
  p.flags.handLimit = (p.flags.handLimit || 0) + got.length;
  p.flags.yanxiTurn = g.turnCount;
  await ctx.log(guess === correct
    ? `【宴戏】：${p.name} 猜对（第 ${correct + 1} 张），获得全部 ${got.length} 张牌`
    : `【宴戏】：${p.name} 猜错（正确为第 ${correct + 1} 张），只获得选中的一张牌`);
};

// 识人：本批实现为「你的第一个回合开始时，可对一名有手牌的其他角色发动一次【宴戏】」
// （官方为隐匿技：你于其他角色的回合登场后立即发动一次【宴戏】；本批未设 hidden，详见文件头注释）
defineSkill({
  id: 'shiren', name: '识人',
  desc: '你的第一个回合开始时，若场上有其他角色有手牌，你可以立即对其发动一次【宴戏】。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.player.alive && !d.player.flags.shirenDone
        && d.game.alive().some(q => q !== d.player && q.hand.length > 0),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.shirenDone = true;
        const cands = others(g, p).filter(t => t.hand.length > 0);
        if (!cands.length) return;
        const yes = await ctx.ask.confirm(p, '【识人】：是否对一名有手牌的其他角色发动一次【宴戏】？');
        if (!yes) return;
        const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【识人】：选择【宴戏】的目标' }))[0];
        if (!t) return;
        await yanxiFlow(ctx, p, t);
      },
    },
  ],
});

// 宴戏：出牌阶段限一次，令一名其他角色的随机一张手牌与牌堆顶两张牌混合展示，猜哪张来自其手牌。
defineSkill({
  id: 'yanxi', name: '宴戏',
  desc: '出牌阶段限一次，你可以令一名其他角色的随机一张手牌与牌堆顶的两张牌混合后展示，你猜测哪张牌来自其手牌。若你猜对，你获得这三张牌；若你猜错，你获得你选中的那张牌。你以此法获得的牌本回合不计入手牌上限。',
  active: {
    perPhase: true,
    prompt: '【宴戏】：令一名其他角色的随机手牌与牌堆顶两张混合展示，猜哪张来自其手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter(t => t.hand.length > 0);
      if (!cands.length) { await ctx.log('【宴戏】：没有可选目标'); return; }
      const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【宴戏】：选择一名角色' }))[0];
      if (!t) return;
      await yanxiFlow(ctx, p, t);
    },
  },
});

// ============================================================
// ==================== 夏侯徽（晋 · 3） ====================
// ============================================================

// 宝箧：本批实现为「你的第一个回合开始时，从牌堆或弃牌堆获得一张装备牌，然后你可以使用之」
// （官方为隐匿技：登场后获得一张宝物牌；引擎牌堆无宝物牌类别，故以装备牌替代）
defineSkill({
  id: 'baoxie', name: '宝箧',
  desc: '你的第一个回合开始时，你从牌堆或弃牌堆获得一张装备牌，然后你可以使用之。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.player.alive && !d.player.flags.baoxieDone,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.baoxieDone = true;
        let c = peekTop(g, g.deck.length).find(isEquip) || null;
        if (c) {
          const i = g.deck.indexOf(c);
          if (i >= 0) g.deck.splice(i, 1);
        } else {
          c = g.discardPile.find(isEquip) || null;
          const j = c ? g.discardPile.indexOf(c) : -1;
          if (j >= 0) g.discardPile.splice(j, 1);
        }
        if (!c) { await ctx.log('【宝箧】：牌堆与弃牌堆中都没有装备牌'); return; }
        await ctx.gain(p, [c], { reason: 'baoxie' });
        await ctx.log(`【宝箧】：${p.name} 获得 ${cardLabel(c)}`);
        const yes = await ctx.ask.confirm(p, `【宝箧】：是否使用 ${cardLabel(c)}？`);
        if (!yes) return;
        const ok = await ctx.useCard({ from: p, card: c, targets: [p], reason: 'baoxie' });
        if (!ok) await ctx.log(`【宝箧】：${cardLabel(c)} 无法使用`);
      },
    },
  ],
});

// 宜室：每名角色的回合限一次，每当一名其他角色于其出牌阶段弃置手牌后，你可令其获得其中一张，你获得其余牌。
// 引擎的 cards.discard 在弃牌结算「之前」触发（牌还在其手牌里），因此这里先把本次弃置记录下来，
// 等 hand.change（弃牌结算之后）再取牌，避免同一张牌同时出现在两个区域。
defineSkill({
  id: 'yishi', name: '宜室',
  desc: '每名角色的回合限一次，每当一名其他角色于其出牌阶段弃置手牌后，你可以令其获得其中的一张牌，你获得其余牌。',
  triggers: [
    {
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => !!d.self && d.self !== d.player && d.self.alive && d.self.kingdom !== undefined
        && d.game.phase === 'play' && (d.cards || []).length > 0
        && d.player.flags.yishiTurn !== d.game.turnCount,
      async effect(ctx) {
        // 记录待处理：{ 弃置者座位, 牌 id 列表 }
        const d = ctx.data;
        ctx.self.flags.yishiPending = {
          seat: d.self.seat,
          turn: ctx.game.turnCount,
          ids: (d.cards || []).map(c => c.id),
        };
      },
    },
    {
      on: 'hand.change', who: 'any', optional: false,
      filter: (d) => !!d.player.flags.yishiPending
        && d.player.flags.yishiPending.turn === d.game.turnCount
        && d.player.flags.yishiTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const pend = p.flags.yishiPending;
        p.flags.yishiPending = null;
        if (!pend) return;
        const t = g.players[pend.seat];
        if (!t || !t.alive) return;
        const cards = g.discardPile.filter(c => pend.ids.includes(c.id));
        if (!cards.length) return;
        const yes = await ctx.ask.confirm(p,
          `【宜室】：${t.name} 弃置了 ${cards.length} 张牌，是否令其获得一张，你获得其余 ${cards.length - 1} 张？`);
        if (!yes) return;
        p.flags.yishiTurn = g.turnCount;
        const back = (await g.chooseSomeCards(p, cards.slice(), 1, { prompt: `【宜室】：选择令 ${t.name} 获得的牌`, optional: false }))[0];
        const rest = cards.filter(c => c !== back);
        for (const c of [...rest, back].filter(Boolean)) {
          const i = g.discardPile.indexOf(c);
          if (i >= 0) g.discardPile.splice(i, 1);
        }
        if (back) await ctx.gain(t, [back], { reason: 'yishi' });
        if (rest.length) await ctx.gain(p, rest, { reason: 'yishi' });
        await ctx.log(`【宜室】：${t.name} 获得 1 张，${p.name} 获得其余 ${rest.length} 张`);
      },
    },
  ],
});

// 识度：出牌阶段限一次，与一名其他角色拼点；若你赢，你获得其所有手牌，然后将你手牌的一半（向下取整）交给其。
defineSkill({
  id: 'shidu', name: '识度',
  desc: '出牌阶段限一次，你可以与一名其他角色拼点。若你赢，你获得其所有手牌，然后将你手牌的一半（向下取整）交给其。',
  active: {
    perPhase: true,
    prompt: '【识度】：与一名其他角色拼点（赢则获得其所有手牌，再交出一半手牌）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【识度】：你没有手牌，无法拼点'); return; }
      const cands = others(g, p).filter(t => t.hand.length > 0);
      if (!cands.length) { await ctx.log('【识度】：没有可拼点的角色'); return; }
      const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【识度】：选择拼点目标' }))[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: '识度' });
      if (!r || !r.win) return;
      const all = t.hand.slice();
      if (all.length) await ctx.gain(p, all, { from: t, reason: 'shidu' });
      const back = Math.floor(p.hand.length / 2);
      if (back > 0) {
        const picks = await g.chooseSomeCards(p, p.hand.slice(), back, { prompt: `【识度】：选择 ${back} 张交给 ${t.name}`, optional: false });
        if (picks.length) await ctx.gain(t, picks, { from: p, reason: 'shidu' });
      }
      await ctx.log(`【识度】：${p.name} 获得 ${t.name} 的所有手牌，并交还 ${back} 张`);
    },
  },
});

// ============================================================
// ==================== 杜预（晋 · 4） ====================
// ============================================================

// 三陈：出牌阶段限一次，令一名角色摸 3 张弃 3 张；若弃置牌种类均不同，其摸一张牌且本技能视为未发动（本回合不能再指定其）。
defineSkill({
  id: 'sanzhen', name: '三陈',
  desc: '出牌阶段限一次，你可以令一名角色摸 3 张牌，然后弃置 3 张牌。若其以此法弃置的牌类别均不同，则其摸一张牌，并视为该技能未发动过（本回合不能再指定其为目标）。',
  active: {
    perTurn: true,
    prompt: '【三陈】：令一名角色摸 3 张牌，然后弃置 3 张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const done = p.flags.sanchenDone || [];
      const cands = g.alive().filter(q => !done.includes(q.seat));
      if (!cands.length) { await ctx.log('【三陈】：本回合已对所有角色发动过'); return; }
      const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【三陈】：选择一名角色' }))[0];
      if (!t) return;
      p.flags.sanchenCount = (p.flags.sanchenCount || 0) + 1;
      await ctx.draw(t, 3, { reason: 'sanzhen' });
      const pool = t.hand.slice();
      const n = Math.min(3, pool.length);
      const disc = n > 0
        ? await g.chooseSomeCards(t, pool, n, { prompt: `【三陈】：弃置 ${n} 张牌`, optional: false })
        : [];
      if (disc.length) await ctx.discard(t, disc, { reason: 'sanzhen' });
      const kinds = new Set(disc.map(typeOf));
      const distinct = disc.length === 3 && kinds.size === 3;
      if (distinct) {
        await ctx.draw(t, 1, { reason: 'sanzhen' });
        p.flags.act_sanzhen = -1;             // 视为本回合未发动
        await ctx.log(`【三陈】：${t.name} 弃置的牌类别均不同，摸一张牌，【三陈】视为未发动`);
      } else {
        p.flags.sanchenDone = [...done, t.seat];
        await ctx.log(`【三陈】：${t.name} 摸 3 张并弃置 ${disc.length} 张牌`);
      }
    },
  },
});

// 诏讨（觉醒技）：回合开始时，若你本局发动过至少 3 次【三陈】，减 1 点体力上限并获得【破竹】。
defineSkill({
  id: 'zhaotao', name: '诏讨',
  desc: '觉醒技，回合开始时，若你本局游戏发动过至少 3 次【三陈】，你减 1 点体力上限，获得【破竹】。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.player.alive && !d.player.flags.zhaotaoDone && (d.player.flags.sanchenCount || 0) >= 3,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.zhaotaoDone = true;
        const before = p.maxHp;
        p.maxHp = Math.max(1, p.maxHp - 1);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
        if (!effSkills(p).some(s => s.id === 'pozhu')) {
          const sk = getSkill('pozhu');
          if (sk) p.skills.push(sk);
        }
        await ctx.log(`【诏讨】：觉醒！${p.name} 体力上限 ${before} → ${p.maxHp}，获得【破竹】`);
      },
    },
  ],
});

// 破竹：出牌阶段，可将一张手牌当【杀】使用（无距离限制、不计次数）；若未造成伤害，本回合不能再发动。
defineSkill({
  id: 'pozhu', name: '破竹',
  desc: '出牌阶段，你可以将一张手牌当作无距离限制、不计入次数的【杀】使用；若此【杀】未造成伤害，本技能本回合无效。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.from && d.from === d.player && d.reason === 'poozhu',
      async effect(ctx) { ctx.self.flags.pozhuHit = ctx.game.turnCount; },
    },
  ],
  active: {
    prompt: '【破竹】：将一张手牌当作【杀】使用（无距离限制、不计次数）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.pozhuBroken === g.turnCount) { await ctx.log('【破竹】：本回合此技能已无效'); return; }
      if (!p.hand.length) { await ctx.log('【破竹】：没有手牌'); return; }
      const c = (await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【破竹】：选择一张手牌当作【杀】', optional: false }))[0];
      if (!c) return;
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【破竹】：没有目标'); return; }
      const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【破竹】：选择【杀】的目标' }))[0];
      if (!t) return;
      p.flags.pozhuHit = 0;
      const ok = await ctx.useCard({
        from: p, card: vcard('sha', c.suit, c.num), targets: [t],
        reason: 'poozhu', extraCards: [c], ignoreRange: true, ignoreShaLimit: true,
      });
      if (!ok) { p.flags.pozhuBroken = g.turnCount; return; }
      if (p.flags.pozhuHit !== g.turnCount) {
        p.flags.pozhuBroken = g.turnCount;
        await ctx.log('【破竹】：此【杀】未造成伤害，本回合【破竹】无效');
      }
    },
  },
});

// ============================================================
// ==================== 张虎&乐綝（晋 · 4 · 双将） ====================
// ============================================================

// 袭爵：游戏开始获得 4 枚「爵」；回合结束按本回合造成伤害补充；摸牌阶段可弃「爵」发动【突袭】；
//       其他角色的结束阶段可弃「爵」发动【骁果】（双将合集：突袭取自张虎一脉、骁果取自乐綝）。
defineSkill({
  id: 'xijue', name: '袭爵',
  desc: '游戏开始时，你获得 4 枚「爵」；回合结束时，你获得 X 枚「爵」（X 为你本回合造成的伤害点数）。摸牌阶段开始时，你可以弃置 1 枚「爵」发动【突袭】（放弃摸牌，获得至多两名其他角色各一张手牌）；其他角色的结束阶段开始时，你可以弃置 1 枚「爵」发动【骁果】（其选择一项：弃置一张装备牌，你摸一张牌；或受到你造成的 1 点伤害）。',
  triggers: [
    {
      on: 'game.start', who: 'any', optional: false,
      filter: (d) => !!d.player && !d.player.flags.xijueInit,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.xijueInit = true;
        p.marks.jue = (p.marks.jue || 0) + 4;
        await ctx.log(`【袭爵】：${p.name} 获得 4 枚「爵」（共 ${p.marks.jue} 枚）`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.from && d.from === d.player,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.jueDmg = (p.flags.jueDmg || 0) + (ctx.data.amount || 0);
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => d.player.alive,
      async effect(ctx) {
        const p = ctx.self;
        const dmg = p.flags.jueDmg || 0;
        p.flags.jueDmg = 0;
        if (dmg > 0) {
          p.marks.jue = (p.marks.jue || 0) + dmg;
          await ctx.log(`【袭爵】：${p.name} 本回合造成 ${dmg} 点伤害，获得 ${dmg} 枚「爵」（共 ${p.marks.jue} 枚）`);
        }
      },
    },
    {
      on: 'phase.begin', who: 'self', optional: true,
      prompt: '【袭爵】：弃置 1 枚「爵」发动【突袭】（放弃摸牌，获得至多两名其他角色各一张手牌）？',
      filter: (d) => d.phase === 'draw' && d.player.alive && (d.player.marks.jue || 0) > 0
        && d.game.alive().some(q => q !== d.player && q.hand.length > 0),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cands = others(g, p).filter(q => q.hand.length > 0);
        if (!cands.length) return;
        const ts = await ctx.ask.targets(p, { min: 1, max: 2, candidates: cands, prompt: '【突袭】：选择至多两名角色' });
        if (!ts.length) return;
        p.marks.jue = Math.max(0, (p.marks.jue || 0) - 1);
        p.flags.skip_draw = true;
        await ctx.log(`【袭爵】：${p.name} 弃置 1 枚「爵」发动【突袭】（剩余 ${p.marks.jue} 枚）`);
        for (const t of ts) {
          if (!t.hand.length) continue;
          const c = t.hand[g.rng.int(t.hand.length)];
          await ctx.gain(p, [c], { from: t, reason: 'xijue' });
        }
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: true,
      prompt: '【袭爵】：弃置 1 枚「爵」发动【骁果】？',
      filter: (d) => d.phase === 'end' && !!d.self && d.self !== d.player && d.self.alive
        && d.player.alive && (d.player.marks.jue || 0) > 0,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.self;
        if (!t.alive) return;
        p.marks.jue = Math.max(0, (p.marks.jue || 0) - 1);
        await ctx.log(`【袭爵】：${p.name} 弃置 1 枚「爵」对 ${t.name} 发动【骁果】（剩余 ${p.marks.jue} 枚）`);
        const equips = Object.entries(t.equips).filter(([k, v]) => v && k !== '__disabled').map(([, v]) => v);
        const opts = [];
        if (equips.length) opts.push('弃置一张装备牌');
        opts.push(`受到 ${p.name} 造成的 1 点伤害`);
        const idx = await ctx.ask.choose(t, opts, { prompt: '【骁果】：选择一项' });
        if (idx === 0 && equips.length) {
          const eq = (await ctx.game.chooseSomeCards(t, equips, 1, { prompt: '【骁果】：弃置一张装备牌', optional: false }))[0];
          if (eq) await ctx.discard(t, [eq], { reason: 'xijue' });
          await ctx.draw(p, 1, { reason: 'xijue' });
          await ctx.log(`【骁果】：${t.name} 弃置装备牌，${p.name} 摸一张牌`);
        } else {
          await ctx.damage({ from: p, to: t, amount: 1, reason: 'xijue' });
          await ctx.log(`【骁果】：${t.name} 受到 1 点伤害`);
        }
      },
    },
  ],
});
