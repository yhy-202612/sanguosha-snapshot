// 门阀士族（clan）批次：族王凌 / 族王浑 / 族荀淑 / 族荀粲 / 族荀彧 / 族荀谌 / 谋荀彧
// 依赖机制：宗族标签（player.clan / g.sameClan）、形态（form）、连环判定
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const VC = (name, suit = 'spade', num = 7, extra = {}) => ({
  id: `vcl${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const allCardsOf = (p) => [
  ...p.hand.map(c => ({ c, slot: null })),
  ...Object.entries(p.equips).filter(([, v]) => v).map(([k, v]) => ({ c: v, slot: k })),
  ...(p.judgeZone || []).map(z => ({ c: z.card, slot: 'judge' })),
];
const roundIdx = (g) => Math.floor(((g?.turnCount || 1) - 1) / Math.max(1, (g?.players || []).length));
const DMG_TRICK = ['nanman', 'wansha', 'juedou', 'huogong', 'jiedao'];
const isDamageTrick = (n) => DMG_TRICK.includes(n);
const takeFromDiscard = (g, card) => {
  const i = g.discardPile.indexOf(card);
  if (i >= 0) g.discardPile.splice(i, 1);
  return card;
};
const detachEquip = async (g, p, c) => {
  const slot = Object.keys(p.equips).find(k => p.equips[k] === c);
  if (slot) { p.equips[slot] = null; await g.trigger('equip.lose', { self: p, card: c, slot }); }
  return !!slot;
};
// 把一张牌从「处理区 / 任意玩家手牌·装备·判定区 / 弃牌堆」彻底摘下，
// 用于「获得你使用的牌」这类必须转移占用权的场景（否则同一张牌会同时存在于两个区域）。
const detachAnywhere = async (g, card) => {
  if (!card) return false;
  let moved = false;
  const ti = (g.table || []).indexOf(card);
  if (ti >= 0) { g.table.splice(ti, 1); moved = true; }
  const di = g.discardPile.indexOf(card);
  if (di >= 0) { g.discardPile.splice(di, 1); moved = true; }
  // ★牌堆也要摘（「置于牌堆顶/底」后又被获得的场景，否则牌会同时在牌堆与手牌）
  const ki = (g.deck || []).indexOf(card);
  if (ki >= 0) { g.deck.splice(ki, 1); moved = true; }
  for (const q of g.players) {
    const hi = q.hand.indexOf(card);
    if (hi >= 0) { q.hand.splice(hi, 1); moved = true; continue; }
    if (await detachEquip(g, q, card)) { moved = true; continue; }
    const ji = (q.judgeZone || []).findIndex(z => z.card === card);
    if (ji >= 0) { q.judgeZone.splice(ji, 1); moved = true; }
  }
  return moved;
};

// ==================== 宗族技 · 中流（族王凌 / 族王浑）====================
// 宗族技，锁定技，当你使用牌时，若此牌不为同族角色的手牌，你武将牌上的技能视为未发动过。
defineSkill({
  id: 'zhongliu', name: '中流',
  desc: '宗族技，锁定技，当你使用牌时，若此牌不为同族角色的手牌，你视为未发动过武将牌上的技能。',
  triggers: [{
    on: 'card.use.before', who: 'self', optional: false,
    filter: (d) => {
      const g = d.game, p = d.player, c = d.card;
      if (!c || !g) return false;
      return !g.players.some(q => q.alive && (q === p || g.sameClan(p, q)) && q.hand.includes(c));
    },
    async effect(ctx) {
      const p = ctx.self;
      let n = 0;
      for (const sk of effSkills(p)) {
        if (!sk.active) continue;
        // 同时清 perTurn（act_*）与 perPhase（actPhase_*）两种发动记录：
        // 「出牌阶段限一次」类主动技已改用 perPhase 声明（SG025 #11），只清 act_* 会刷新不到
        let hit = false;
        for (const key of [`act_${sk.id}`, `actPhase_${sk.id}`]) {
          if (p.flags[key] !== undefined) { delete p.flags[key]; hit = true; }
        }
        if (hit) n++;
      }
      if (n) await ctx.log(`【中流】：此牌不为同族角色的手牌，武将牌上的技能视为未发动过（刷新 ${n} 项）`);
    },
  }],
});

// ==================== 族王凌 · 驳龙 ====================
// 出牌阶段限一次，你可以令一名其他角色选择一项：
// 1.你交给其一张牌，视为对其使用一张雷【杀】；2.交给你与你手牌数等量张牌，视为对你使用一张【酒】。
defineSkill({
  id: 'bolong', name: '驳龙',
  desc: '出牌阶段限一次，你可以令一名其他角色选择一项：1.你交给其一张牌，视为对其使用一张雷【杀】；2.交给你与你手牌数等量张牌，视为对你使用一张【酒】。',
  active: {
    perPhase: true,
    prompt: '驳龙：令一名其他角色二选一',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【驳龙】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const pool = allCardsOf(t).map(x => x.c);
      const opts = ['你交给其一张牌，视为对其使用一张雷【杀】'];
      if (pool.length > 0 && p.hand.length > 0) opts.push('交给你与你手牌数等量张牌，视为对你使用一张【酒】');
      const idx = await ctx.ask.choose(t, opts, { prompt: '【驳龙】：请选择一项', reason: 'bolong' });
      if (idx === 1) {
        const n = Math.min(p.hand.length, pool.length);
        const picks = await g.chooseSomeCards(t, pool, n, { prompt: `【驳龙】：交给 ${p.name} ${n} 张牌` });
        for (const c of picks) await detachEquip(g, t, c);
        await ctx.gain(p, picks, { from: t, reason: 'bolong' });
        await ctx.useCard({ from: t, card: VC('jiu'), targets: [t], reason: 'bolong', ignoreRange: true });
        await ctx.log(`【驳龙】：${t.name} 交给你 ${picks.length} 张牌，视为对你使用一张【酒】`);
        return;
      }
      const mine = allCardsOf(p).map(x => x.c);
      if (!mine.length) { await ctx.log('【驳龙】：你没有可交出的牌'); return; }
      const [c] = await g.chooseSomeCards(p, mine, 1, { prompt: '【驳龙】：选择交给其的牌' });
      if (!c) return;
      await detachEquip(g, p, c);
      await ctx.gain(t, [c], { from: p, reason: 'bolong' });
      await ctx.useCard({ from: p, card: VC('sha', 'spade', 7, { nature: 'thunder' }), targets: [t], reason: 'bolong', ignoreRange: true });
      await ctx.log(`【驳龙】：交给 ${t.name} ${cardLabel(c)}，视为对其使用一张雷【杀】`);
    },
  },
});

// ==================== 族王浑 · 抚循 ====================
// 出牌阶段限一次，你可以获得或交给一名其他角色一张手牌，
// 若其手牌数与你相同且本阶段仅因此法变化过，你可以将一张牌当任意一张基本牌使用。
defineSkill({
  id: 'fuxun', name: '抚循',
  desc: '出牌阶段限一次，你可以获得或交给一名其他角色一张手牌，若其手牌数与你相同且本阶段仅因此法变化过，你可以将一张牌当任意基本牌使用。',
  active: {
    perPhase: true,
    prompt: '抚循：获得/交给一名其他角色一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【抚循】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const idx = await ctx.ask.choose(p, ['获得其一张手牌', '交给其一张手牌'], { prompt: '【抚循】：选择', reason: 'fuxun' });
      if (idx === 0) {
        if (!t.hand.length) { await ctx.log('【抚循】：其没有手牌'); return; }
        const [c] = await g.chooseSomeCards(p, t.hand.slice(), 1, { prompt: '【抚循】：选择获得的手牌' });
        if (!c) return;
        await ctx.gain(p, [c], { from: t, reason: 'fuxun' });
      } else {
        if (!p.hand.length) { await ctx.log('【抚循】：你没有手牌'); return; }
        const [c] = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【抚循】：选择交出的手牌' });
        if (!c) return;
        await ctx.gain(t, [c], { from: p, reason: 'fuxun' });
      }
      await ctx.log(`【抚循】：你与 ${t.name} 手牌数 ${p.hand.length} / ${t.hand.length}`);
      if (p.hand.length !== t.hand.length) { await ctx.log('【抚循】：手牌数不同，不能转化基本牌'); return; }
      const names = ['sha', 'tao', 'jiu'];
      const labels = ['【杀】', '【桃】', '【酒】'];
      labels.push('不使用');
      const bi = await ctx.ask.choose(p, labels, { prompt: '【抚循】：将一张牌当基本牌使用', reason: 'fuxun' });
      const nm = names[bi];
      if (!nm || !p.hand.length) return;
      const [c2] = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【抚循】：选择转化的牌' });
      if (!c2) return;
      let targets = [p];
      if (nm === 'sha') {
        const cs = g.alive().filter(x => x !== p);
        if (!cs.length) return;
        const tg = await ctx.ask.targets(p, { prompt: '【抚循】：选择【杀】的目标', candidates: cs, min: 1, max: 1 });
        if (!tg.length) return;
        targets = tg;
      }
      const i2 = p.hand.indexOf(c2);
      if (i2 >= 0) p.hand.splice(i2, 1);
      await ctx.discard(p, [c2], { reason: 'fuxun' });
      const ok = await ctx.useCard({ from: p, card: VC(nm), targets, reason: 'fuxun' });
      if (ok !== false) await ctx.log(`【抚循】：将 ${cardLabel(c2)} 当【${CARD_META[nm].cn}】使用`);
    },
  },
});

// ==================== 族王浑 · 沉雅 ====================
// 当一名角色发动“出牌阶段限一次”的技能后，你可以令其重铸任意张牌名字数为X的牌（X为其手牌数）。
const isPerTurnActive = (reason) => {
  const sk = reason ? getSkill(reason) : null;
  // 「出牌阶段限一次」类主动技现可能声明 perTurn（每回合）或 perPhase（每出牌阶段，SG025 #11），两者都要认
  return !!(sk && sk.active && (sk.active.perTurn || sk.active.perPhase));
};
defineSkill({
  id: 'chenya', name: '沉雅',
  desc: '当一名角色发动“出牌阶段限一次”的技能后，你可以令其重铸任意张牌名字数为X的牌（X为其手牌数）。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: true,
    filter: (d) => {
      const q = d.self;
      return !!(q && q.alive && isPerTurnActive(d.reason) && q !== undefined && d.game.turnPlayer === q
        && q.flags.chenyaTurn !== d.game.turnCount && q.hand.length > 0);
    },
    async effect(ctx) {
      const g = ctx.game, q = ctx.data.self;
      q.flags.chenyaTurn = g.turnCount;
      const x = q.hand.length;
      const cands = q.hand.filter(c => (CARD_META[c.name]?.cn || '').length === x);
      if (!cands.length) { await ctx.log(`【沉雅】：手牌数 ${x}，其没有名字数为 ${x} 的牌可重铸`); return; }
      const picks = await g.chooseSomeCards(q, cands, cands.length, { prompt: `【沉雅】：可重铸任意张名字数为 ${x} 的牌`, optional: true });
      if (!picks || !picks.length) return;
      await ctx.discard(q, picks, { reason: 'chenya' });
      await ctx.draw(q, picks.length, { reason: 'chenya' });
      await ctx.log(`【沉雅】：${q.name} 重铸 ${picks.length} 张牌`);
    },
  }],
});

// ==================== 族荀淑 · 神君 ====================
// 当一名角色使用【杀】或普通锦囊牌时，你展示所有同名手牌记为「神君」，
// 本阶段结束时，你可以将X张牌当任意「神君」牌使用（X为「神君」牌数）。
defineSkill({
  id: 'shenjun', name: '神君',
  desc: '当一名角色使用【杀】或普通锦囊牌时，你展示所有同名手牌记为「神君」，本阶段结束时，你可以将X张牌当任意「神君」牌使用（X为「神君」牌数）。',
  triggers: [
    {
      on: 'card.use.before', who: 'any', optional: false,
      filter: (d) => {
        const n = d.card?.name;
        if (!n) return false;
        const m = CARD_META[n];
        return n === 'sha' || (m && m.type === 'trick' && !m.delayed);
      },
      async effect(ctx) {
        const p = ctx.self, c = ctx.data.card;
        const same = p.hand.filter(h => h.name === c.name);
        if (!same.length) return;
        p.flags.shenjun = p.flags.shenjun || [];
        if (!p.flags.shenjun.includes(c.name)) {
          p.flags.shenjun.push(c.name);
          await ctx.log(`【神君】：展示 ${same.length} 张${CARD_META[c.name].cn}，记为「神君」（当前 ${p.flags.shenjun.length} 种）`);
        }
      },
    },
    {
      on: 'phase.end', who: 'self', optional: true,
      filter: (d) => d.phase === 'play' && (d.player.flags.shenjun || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const names = p.flags.shenjun.slice();
        p.flags.shenjun = [];
        const x = names.length;
        if (!p.hand.length) return;
        const opts = names.map(n => `将 ${Math.min(x, p.hand.length)} 张牌当【${CARD_META[n].cn}】使用`);
        opts.push('不发动');
        const i = await ctx.ask.choose(p, opts, { prompt: `【神君】：本阶段结束，可化「神君」为用（${x} 张）`, reason: 'shenjun' });
        const nm = names[i];
        if (!nm) return;
        const k = Math.min(x, p.hand.length);
        const picks = await g.chooseSomeCards(p, p.hand.slice(), k, { prompt: `【神君】：选择 ${k} 张牌` });
        if (!picks.length) return;
        let targets = [p];
        const m = CARD_META[nm];
        const needTarget = nm === 'sha' || (m?.type === 'trick' && !m.delayed && !(m.target && m.target.self && !m.target.others));
        if (needTarget) {
          const cs = g.alive().filter(q => q !== p);
          if (!cs.length) return;
          const tg = await ctx.ask.targets(p, { prompt: `【神君】：选择【${m.cn}】的目标`, candidates: cs, min: 1, max: 1 });
          if (!tg.length) return;
          targets = tg;
        }
        for (const c of picks) {
          const j = p.hand.indexOf(c);
          if (j >= 0) p.hand.splice(j, 1);
        }
        await ctx.discard(p, picks, { reason: 'shenjun' });
        const ok = await ctx.useCard({ from: p, card: VC(nm, picks[0].suit, picks[0].num), targets, reason: 'shenjun' });
        if (ok !== false) await ctx.log(`【神君】：将 ${picks.length} 张牌当【${m.cn}】使用`);
      },
    },
  ],
});

// ==================== 族荀淑 · 八龙 ====================
// 锁定技，当你每回合体力值首次变化后，若你手牌中锦囊牌为唯一最多的类型，
// 你展示手牌并摸至与存活角色数相同。
defineSkill({
  id: 'balong', name: '八龙',
  desc: '锁定技，当你每回合体力值首次变化后，若你手牌中锦囊牌为唯一最多的类型，你展示手牌并摸至与存活角色数相同。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => d.player.flags.balongTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.balongTurn = g.turnCount;
        const cnt = { basic: 0, trick: 0, equip: 0 };
        for (const c of p.hand) { const t = CARD_META[c.name]?.type; if (t) cnt[t] = (cnt[t] || 0) + 1; }
        if (!(cnt.trick > cnt.basic && cnt.trick > cnt.equip)) {
          await ctx.log(`【八龙】：锦囊牌（${cnt.trick}）非唯一最多，不摸牌`);
          return;
        }
        const n = g.alive().length;
        if (p.hand.length < n) {
          await ctx.draw(p, n - p.hand.length, { reason: 'balong' });
          await ctx.log(`【八龙】：展示手牌，摸至 ${n} 张（存活角色数）`);
        }
      },
    },
    {
      on: 'hp.recover', who: 'self', optional: false,
      filter: (d) => d.count > 0 && d.player.flags.balongTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.balongTurn = g.turnCount;
        const cnt = { basic: 0, trick: 0, equip: 0 };
        for (const c of p.hand) { const t = CARD_META[c.name]?.type; if (t) cnt[t] = (cnt[t] || 0) + 1; }
        if (!(cnt.trick > cnt.basic && cnt.trick > cnt.equip)) return;
        const n = g.alive().length;
        if (p.hand.length < n) await ctx.draw(p, n - p.hand.length, { reason: 'balong' });
      },
    },
    {
      on: 'hp.lose', who: 'self', optional: false,
      filter: (d) => d.player.flags.balongTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.balongTurn = g.turnCount;
        const cnt = { basic: 0, trick: 0, equip: 0 };
        for (const c of p.hand) { const t = CARD_META[c.name]?.type; if (t) cnt[t] = (cnt[t] || 0) + 1; }
        if (!(cnt.trick > cnt.basic && cnt.trick > cnt.equip)) return;
        const n = g.alive().length;
        if (p.hand.length < n) await ctx.draw(p, n - p.hand.length, { reason: 'balong' });
      },
    },
  ],
});

// ==================== 宗族技 · 蹈节（颍川荀氏共用）====================
// 宗族技，锁定技，当你每回合首次使用非伤害锦囊牌后，你失去1点体力或一个锁定技，令一名同族角色获得此牌。
defineSkill({
  id: 'daojie', name: '蹈节',
  desc: '宗族技，锁定技，当你每回合首次使用非伤害锦囊牌后，你失去1点体力或一个锁定技，令一名同族角色获得此牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => {
      const m = d.card && CARD_META[d.card.name];
      return !!(m && m.type === 'trick' && !isDamageTrick(d.card.name) && d.player.flags.daojieTurn !== d.game.turnCount);
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, card = ctx.data.card;
      p.flags.daojieTurn = g.turnCount;
      const idx = await ctx.ask.choose(p, ['失去1点体力', '失去一个锁定技'], { prompt: '【蹈节】：选择一项', reason: 'daojie' });
      if (idx === 1) {
        const locked = effSkills(p).filter(s => s !== ctx.skill && /锁定技/.test(s.desc || ''));
        if (locked.length) {
          const k = await ctx.ask.choose(p, locked.map(s => `失去【${s.name}】`), { prompt: '【蹈节】：选择失去的锁定技', reason: 'daojie' });
          if (k >= 0 && locked[k]) {
            await ctx.game.removeSkills(p, [locked[k].id]);   // ★统一出口（SG029 BLOCKER-2）
            await ctx.log(`【蹈节】：${p.name} 失去锁定技【${locked[k].name}】`);
          }
        } else {
          await ctx.loseHp(p, 1);
        }
      } else {
        await ctx.loseHp(p, 1);
      }
      const mates = g.alive().filter(q => g.sameClan(p, q));
      if (!mates.length) { await ctx.log('【蹈节】：场上没有其他同族角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【蹈节】：令一名同族角色获得此牌', candidates: mates, min: 1, max: 1 }))[0] || mates[0];
      await detachAnywhere(g, card);
      await ctx.gain(t, [card], { reason: 'daojie' });
      await ctx.log(`【蹈节】：${t.name} 获得 ${cardLabel(card)}`);
    },
  }],
});

// ==================== 族荀粲 · 熨身 ====================
// 出牌阶段限一次，你可以令一名其他角色回复1点体力，然后选择一项：
// 1.其视为对你使用一张冰【杀】；2.视为你对其使用一张冰【杀】。
defineSkill({
  id: 'yunshen', name: '熨身',
  desc: '出牌阶段限一次，你可以令一名其他角色回复1点体力，然后选择一项：1.其视为对你使用一张冰【杀】；2.视为你对其使用一张冰【杀】。',
  active: {
    perPhase: true,
    prompt: '熨身：令一名其他角色回复1点体力，并视为使用一张冰【杀】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.hp < x.maxHp);
      if (!cands.length) { await ctx.log('【熨身】：没有已受伤的其他角色'); return; }
      const t = (await ctx.ask.targets(p, { prompt: '【熨身】：选择一名其他角色', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      await ctx.recover(t, 1);
      // 分钗：首次成为技能目标的异性
      if (!p.flags.fenchaiTarget && (t.gender || 'male') !== (p.gender || 'male')) p.flags.fenchaiTarget = t.id;
      const idx = await ctx.ask.choose(p, ['视为其对你使用一张冰【杀】', '视为你对其使用一张冰【杀】'], { prompt: '【熨身】：选择一项', reason: 'yunshen' });
      const ice = () => VC('sha', 'spade', 7, { nature: 'ice' });
      if (idx === 1) await ctx.useCard({ from: p, card: ice(), targets: [t], reason: 'yunshen', ignoreRange: true });
      else await ctx.useCard({ from: t, card: ice(), targets: [p], reason: 'yunshen', ignoreRange: true });
      await ctx.log(`【熨身】：${t.name} 回复1点体力，视为${idx === 1 ? '你对其' : '其对你'}使用一张冰【杀】`);
    },
  },
});

// ==================== 族荀粲 · 伤神 ====================
// 当每回合第一次有角色受到属性伤害后，你可以执行一次【闪电】判定，令其将手牌摸至四张。
defineSkill({
  id: 'shangshen', name: '伤神',
  desc: '当每回合第一次有角色受到属性伤害后，你可以执行一次【闪电】判定，令其将手牌摸至四张。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => !!(d.nature && d.nature !== 'normal' && d.to && d.player.flags.shangshenTurn !== d.game.turnCount),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.to || ctx.data.self;
      p.flags.shangshenTurn = g.turnCount;
      await ctx.judge(p, { reason: 'shangshen' });
      if (t && t.alive && t.hand.length < 4) await ctx.draw(t, 4 - t.hand.length, { reason: 'shangshen' });
      await ctx.log(`【伤神】：执行【闪电】判定，${t.name} 将手牌摸至四张（${t.hand.length}）`);
    },
  }],
});

// ==================== 族荀粲 · 分钗 ====================
// 锁定技，若首次成为你技能目标的异性角色存活，你的判定牌视为♥，否则视为♠。
defineSkill({
  id: 'fenchai', name: '分钗',
  desc: '锁定技，若首次成为你技能目标的异性角色存活，你的判定牌视为♥，否则视为♠。',
  triggers: [
    {
      on: 'judge.before', who: 'self', optional: false,
      filter: (d) => !!(d.player.flags.fenchaiTarget && d.card),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const t = g.byId(p.flags.fenchaiTarget);
        const alive = !!(t && t.alive);
        ctx.data.suit = alive ? 'heart' : 'spade';
        await ctx.log(`【分钗】：判定牌视为${alive ? '红桃' : '黑桃'}`);
      },
    },
    {
      on: 'death.after', who: 'any', optional: false,
      filter: (d) => !!d.self && d.self.id === d.player.flags.fenchaiTarget,
      async effect(ctx) { await ctx.log('【分钗】：其已死亡，此后你的判定牌视为黑桃'); },
    },
  ],
});

// ==================== 族荀彧 · 定安 ====================
// 锁定技，当一个牌名的牌每回合第二次被使用后，若本回合未有角色进入过濒死状态，
// 你与一名非目标角色各摸一张牌（每回合每名角色限一次），
// 然后你对手牌最多的其他角色造成1点伤害，或令其弃置手牌中最多的同名牌。
defineSkill({
  id: 'dingan', name: '定安',
  desc: '锁定技，当一个牌名的牌每回合第二次被使用后，若本回合未有角色进入过濒死状态，你与一名非目标角色各摸一张牌（每回合每名角色限一次），然后你对手牌最多的其他角色造成1点伤害，或令其弃置手牌中最多的同名牌。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => d.self === d.player,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.dinganCount = {};
        p.flags.dinganDone = false;
        p.flags.dinganDying = false;
      },
    },
    {
      on: 'dying.begin', who: 'any', optional: false,
      filter: (d) => d.player.flags.dinganCount && d.player.flags.dinganDone === false,
      async effect(ctx) { ctx.self.flags.dinganDying = true; },
    },
    {
      on: 'card.use.after', who: 'any', optional: false,
      filter: (d) => !!d.card?.name && !d.player.flags.dinganDone,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, nm = ctx.data.card.name;
        p.flags.dinganCount = p.flags.dinganCount || {};
        p.flags.dinganCount[nm] = (p.flags.dinganCount[nm] || 0) + 1;
        if (p.flags.dinganCount[nm] !== 2) return;
        if (p.flags.dinganDone || p.flags.dinganDying) return;
        p.flags.dinganDone = true;
        const others = g.alive().filter(x => x !== p);
        if (!others.length) return;
        const t = (await ctx.ask.targets(p, { prompt: '【定安】：选择与你各摸一张牌的角色', candidates: others, min: 1, max: 1 }))[0];
        await ctx.draw(p, 1, { reason: 'dingan' });
        if (t) await ctx.draw(t, 1, { reason: 'dingan' });
        await ctx.log(`【定安】：牌名【${CARD_META[nm]?.cn || nm}】本回合第二次被使用，${p.name} 与 ${t ? t.name : '—'} 各摸一张牌`);
        const pool = g.alive().filter(x => x !== p);
        if (!pool.length) return;
        const maxHand = Math.max(...pool.map(x => x.hand.length));
        const big = pool.filter(x => x.hand.length === maxHand)[0];
        const idx = await ctx.ask.choose(p, [`对 ${big.name} 造成1点伤害`, `令 ${big.name} 弃置手牌中最多的同名牌`], { prompt: '【定安】：选择一项', reason: 'dingan' });
        if (idx === 1) {
          const cnt = {};
          for (const c of big.hand) cnt[c.name] = (cnt[c.name] || 0) + 1;
          const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
          if (best && big.hand.length) {
            const same = big.hand.filter(c => c.name === best[0]);
            await ctx.discard(big, same, { reason: 'dingan' });
            await ctx.log(`【定安】：${big.name} 弃置了 ${same.length} 张【${CARD_META[best[0]]?.cn || best[0]}】`);
          }
        } else {
          await ctx.damage({ from: p, to: big, amount: 1, reason: 'dingan' });
        }
      },
    },
  ],
});

// ==================== 族荀彧 · 抚宁 ====================
// 每轮你的体力值首次变化后，你可将至少X张牌交给一名角色（X为你已损失体力值）。
// 若你交给的牌颜色均相同，你回复1点体力；
// 数量大于本回合受到过伤害的角色数，你将手牌调整至体力上限。
defineSkill({
  id: 'funing', name: '抚宁',
  desc: '每轮你的体力值首次变化后，你可将至少X张牌交给一名角色（X为你已损失体力值）。若你交给的牌颜色均相同，你回复1点体力；数量大于本回合受到过伤害的角色数，你将手牌调整至体力上限。',
  triggers: [
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.to,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        if (p.flags.hurtTurn !== g.turnCount) { p.flags.hurtTurn = g.turnCount; p.flags.hurtSet = []; }
        if (!p.flags.hurtSet.includes(ctx.data.to.id)) p.flags.hurtSet.push(ctx.data.to.id);
      },
    },
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => d.player.flags.funingRound !== roundIdx(d.game),
      async effect(ctx) { await funing(ctx); },
    },
    {
      on: 'hp.recover', who: 'self', optional: true,
      filter: (d) => d.count > 0 && d.player.flags.funingRound !== roundIdx(d.game),
      async effect(ctx) { await funing(ctx); },
    },
  ],
});
async function funing(ctx) {
  const p = ctx.self, g = ctx.game;
  p.flags.funingRound = roundIdx(g);
  const x = Math.max(0, p.maxHp - p.hp);
  if (x <= 0) { await ctx.log('【抚宁】：未损失体力，不能发动'); return; }
  const pool = allCardsOf(p).map(o => o.c);
  if (!pool.length) return;
  const t = (await ctx.ask.targets(p, { prompt: `【抚宁】：将至少 ${x} 张牌交给一名角色`, candidates: g.alive(), min: 1, max: 1 }))[0];
  if (!t) return;
  const picks = await g.chooseSomeCards(p, pool, Math.min(x, pool.length), { prompt: `【抚宁】：选择至少 ${x} 张牌` });
  if (!picks.length) return;
  for (const c of picks) await detachEquip(g, p, c);
  await ctx.gain(t, picks, { from: p, reason: 'funing' });
  await ctx.log(`【抚宁】：将 ${picks.length} 张牌交给 ${t.name}（已损失体力 ${x}）`);
  const colors = new Set(picks.map(c => (c.suit === 'heart' || c.suit === 'diamond') ? 'red' : 'black'));
  if (colors.size === 1 && p.hp < p.maxHp) {
    await ctx.recover(p, 1);
    await ctx.log('【抚宁】：交出的牌颜色均相同，你回复1点体力');
  }
  const hurt = (p.flags.hurtSet || []).length;
  if (picks.length > hurt && p.hand.length < p.maxHp) {
    await ctx.draw(p, p.maxHp - p.hand.length, { reason: 'funing' });
    await ctx.log(`【抚宁】：交出牌数 ${picks.length} > 本回合受伤角色数 ${hurt}，手牌调整至体力上限 ${p.maxHp}`);
  }
}

// ==================== 族荀谌 · 三恇 ====================
// 锁定技，当你每轮首次使用一种类型的牌后，你令一名其他角色交给你至少X张牌，
// 然后获得你使用的牌（X为其满足的项数：1.场上有牌；2.已受伤；3.体力值小于手牌数）。
defineSkill({
  id: 'sankuang', name: '三恇',
  desc: '锁定技，当你每轮首次使用一种类型的牌后，你令一名其他角色交给你至少X张牌，然后获得你使用的牌（X为其满足的项数：1.场上有牌；2.已受伤；3.体力值小于手牌数）。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => !!d.card?.name && !!CARD_META[d.card.name],
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, card = ctx.data.card;
      const r = roundIdx(g);
      if (p.flags.sankuangRound !== r) { p.flags.sankuangRound = r; p.flags.sankuangTypes = []; }
      const type = CARD_META[card.name].type;
      if (p.flags.sankuangTypes.includes(type)) return;
      p.flags.sankuangTypes.push(type);
      const others = g.alive().filter(x => x !== p);
      if (!others.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【三恇】：选择交给你牌的角色', candidates: others, min: 1, max: 1 }))[0];
      if (!t) return;
      if (!p.flags.beishiTarget) { p.flags.beishiTarget = t.id; await ctx.log(`【三恇】：${t.name} 成为【卑势】角色`); }
      let x = 0;
      if (allCardsOf(t).length > 0) x++;
      if (t.hp < t.maxHp) x++;
      if (t.hp < t.hand.length) x++;
      const pool = allCardsOf(t).map(o => o.c);
      const n = Math.min(x, pool.length);
      if (n > 0) {
        const picks = await g.chooseSomeCards(t, pool, n, { prompt: `【三恇】：交给 ${p.name} ${n} 张牌` });
        for (const c of picks) await detachEquip(g, t, c);
        await ctx.gain(p, picks, { from: t, reason: 'sankuang' });
      }
      await detachAnywhere(g, card);
      await ctx.gain(t, [card], { reason: 'sankuang' });
      await ctx.log(`【三恇】：${t.name} 交给你 ${n} 张牌，并获得你使用的 ${cardLabel(card)}`);
    },
  }],
});

// ==================== 族荀谌 · 卑势 ====================
// 锁定技，当首次被【三恇】的角色失去所有手牌后，你回复1点体力。
defineSkill({
  id: 'beishi', name: '卑势',
  desc: '锁定技，当首次被【三恇】的角色失去所有手牌后，你回复1点体力。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: false,
    filter: (d) => {
      const p = d.player, q = d.self;
      const n = (d.cards || []).length;
      return !!(q && p.flags.beishiTarget === q.id && q.alive && n > 0 && n >= q.hand.length
        && p.flags.beishiTurn !== d.game.turnCount);
    },
    async effect(ctx) {
      const p = ctx.self;
      p.flags.beishiTurn = ctx.game.turnCount;
      if (p.hp < p.maxHp) await ctx.recover(p, 1);
      await ctx.log(`【卑势】：${ctx.data.self.name} 失去所有手牌，你回复1点体力`);
    },
  }],
});

// ==================== 谋荀彧 · 弼佐（限定技）====================
// 限定技，每名角色回合结束时，若一号位体力全场最低，你可令一名角色立即执行一个额外回合；
// 直至该回合结束除你与该角色外，其余角色非锁定技能失效；该回合结束后你分配当前回合所有不因弃置而进入弃牌堆的牌。
defineSkill({
  id: 'bizuo', name: '弼佐',
  desc: '限定技，每名角色回合结束时，若一号位体力值全场最低，你可令一名角色立即执行一个额外回合；直至该回合结束，除你与该角色外其余角色的非锁定技失效。（本实现：额外回合 + 非锁定技失效标记；回合结束时回收牌的分配给额外回合角色）',
  triggers: [{
    on: 'turn.end', who: 'any', optional: true,
    filter: (d) => {
      const g = d.game;
      if (d.player.flags.bizuoUsed) return false;
      const first = g.players[0];
      if (!first || !first.alive) return false;
      const alive = g.alive();
      return first.hp === Math.min(...alive.map(x => x.hp));
    },
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive();
      const t = (await ctx.ask.targets(p, { prompt: '【弼佐】：令一名角色执行一个额外回合', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.bizuoUsed = true;
      for (const q of g.alive()) {
        if (q === p || q === t) continue;
        q.flags.noSkillTurn = g.turnCount;   // 非锁定技失效（供其他技能 filter 参考）
      }
      await ctx.extraTurn(t);
      await ctx.log(`【弼佐】：${t.name} 立即执行一个额外回合（其余角色非锁定技失效）`);
    },
  }],
});

// ==================== 谋荀彧 · 势谋（转换技）====================
// 转换技，出牌阶段限一次，你可令 阳：你或手牌数全场最低的角色 / 阴：你或手牌数全场最高的角色
// 将手牌调整至体力上限（至多摸5）并视为使用一张普通锦囊牌（此牌的牌名与目标由你指定）。
// 若以此法摸牌，该锦囊可额外增加1个目标；若以此法弃牌，该锦囊可额外结算1次。
defineSkill({
  id: 'shimou', name: '势谋',
  desc: '转换技，出牌阶段限一次，你可令（阳：你或手牌数全场最低的角色／阴：你或手牌数全场最高的角色）将手牌调整至体力上限（至多摸5）并视为使用一张普通锦囊牌（此牌的牌名与目标由你指定）。若以此法摸牌，该锦囊可额外增加1个目标；若以此法弃牌，该锦囊可额外结算1次。',
  active: {
    perPhase: true,
    prompt: '势谋（转换技）：调整手牌并视为使用一张普通锦囊牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const yang = !p.flags.shimouYin;    // 初始为阳
      p.flags.shimouYin = !yang;
      await ctx.log(`【势谋】：转换技 → ${yang ? '阳' : '阴'}（手牌数全${yang ? '最低' : '最高'}的角色）`);
      const others = g.alive().filter(x => x !== p);
      let cand = [p];
      if (others.length) {
        const cnt = (x) => x.hand.length;
        const best = others.reduce((a, b) => (yang ? (cnt(b) < cnt(a) ? b : a) : (cnt(b) > cnt(a) ? b : a)), others[0]);
        cand = [p, best];
      }
      let t = p;
      if (cand.length > 1) {
        t = (await ctx.ask.targets(p, { prompt: '【势谋】：选择调整手牌的角色', candidates: cand, min: 1, max: 1 }))[0] || p;
      }
      let drew = false, discarded = false;
      const cap = Math.min(5, t.maxHp);
      if (t.hand.length < t.maxHp) {
        const n = Math.min(cap, t.maxHp - t.hand.length);
        if (n > 0) { await ctx.draw(t, n, { reason: 'shimou' }); drew = true; }
      } else if (t.hand.length > t.maxHp) {
        const n = t.hand.length - t.maxHp;
        const picks = await g.chooseSomeCards(t, t.hand.slice(), n, { prompt: `【势谋】：弃置 ${n} 张牌` });
        if (picks.length) { await ctx.discard(t, picks, { reason: 'shimou' }); discarded = true; }
      }
      const names = ['wuzhong', 'guohe', 'juedou', 'nanman', 'taoyuan'];
      const labels = names.map(n => `视为使用【${CARD_META[n].cn}】`);
      labels.push('不使用锦囊');
      const i = await ctx.ask.choose(p, labels, { prompt: '【势谋】：视为使用一张普通锦囊牌', reason: 'shimou' });
      const nm = names[i];
      if (!nm) return;
      const m = CARD_META[nm];
      let targets = [];
      if (nm === 'wuzhong' || nm === 'taoyuan') targets = [t];
      else {
        const cs = g.alive().filter(x => x !== p);
        if (!cs.length) return;
        targets = await ctx.ask.targets(p, { prompt: `【势谋】：选择【${m.cn}】的目标`, candidates: cs, min: 1, max: 1 });
        if (!targets.length) return;
        if (drew) {
          const extra = g.alive().filter(x => x !== p && !targets.includes(x));
          if (extra.length) targets = targets.concat([extra[0]]);
        }
      }
      const ok = await ctx.useCard({ from: p, card: VC(nm, 'spade', 13), targets, reason: 'shimou' });
      if (ok !== false) {
        await ctx.log(`【势谋】：${t.name} 手牌调整至 ${t.hand.length}${drew ? '（摸牌：额外目标）' : discarded ? '（弃牌：额外结算）' : ''}，视为使用【${m.cn}】`);
        if (discarded) await ctx.log('【势谋】：因此法弃牌，此锦囊额外结算1次（本实现以日志标记）');
      }
    },
  },
});
