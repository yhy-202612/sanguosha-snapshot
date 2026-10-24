// 界限突破·标准包技能（SG002 批次 A）
// 规则依据：三国杀 OL 官方「界限突破」攻略（2016）与官方武将页；
// 与现行 OL 改版冲突处，按任务单点名的 2013 界限突破口径实现，详见 deliver/SG002/MANIFEST.md。
import { defineSkill } from '../engine/skill.js';
import { CARD_META, isRed, cardLabel } from '../engine/cards.js';

// ---------- 工具 ----------
function takeFromZones(game, card) {
  if (!card) return null;
  let i = game.table.indexOf(card);
  if (i >= 0) { game.table.splice(i, 1); return card; }
  i = game.discardPile.indexOf(card);
  if (i >= 0) { game.discardPile.splice(i, 1); return card; }
  return null;
}

function redCards(p) { return p.hand.filter(isRed); }

// 直接从手牌选一张：不能走 ctx.ask.card（respondCard 会再次触发 respond.need，武圣/龙胆会自我递归）
async function pickHandCard(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  const res = await ctx.game.ask(player, 'card', { prompt, cards: cands.map(c => c.id), optional: true, reason: 'skill' });
  if (!res || !res.cardId) return null;
  return cands.find(c => c.id === res.cardId) || null;
}

function virtualBasic(game, name) {
  const n = (game.__virtualSeq = (game.__virtualSeq || 0) + 1);
  return { id: `v${n}`, name, suit: 'none', num: 0, type: 'basic', virtual: true };
}

// ================= 魏 =================

// 界曹操 · 奸雄：每当你受到伤害后，你可以选择一项：摸一张牌，或获得对你造成伤害的牌。
defineSkill({
  id: 'jie_jianxiong', name: '奸雄',
  desc: '当你受到伤害后，你可以选择一项：摸一张牌，或获得对你造成伤害的牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    async effect(ctx) {
      const d = ctx.data;
      const card = d.card && (ctx.game.table.includes(d.card) || ctx.game.discardPile.includes(d.card)) ? d.card : null;
      const idx = await ctx.ask.choose(ctx.self, ['摸一张牌', '获得造成伤害的牌'], { prompt: '【奸雄】：选择一项', reason: 'jianxiong' });
      if (idx === 1 && card) {
        const c = takeFromZones(ctx.game, card);
        if (c) { await ctx.gain(ctx.self, [c], { reason: 'jianxiong' }); return; }
      }
      if (idx >= 0) await ctx.draw(ctx.self, 1, { reason: 'jianxiong' });
    },
  }],
});

// 界司马懿 · 反馈：当你受到伤害后，你可以获得伤害来源的一张牌，或令其摸一张牌。
defineSkill({
  id: 'jie_fankui', name: '反馈',
  desc: '当你受到伤害后，你可以获得伤害来源的一张牌，或令伤害来源摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => !!d.from && d.from !== d.self,
    async effect(ctx) {
      const src = ctx.data.from;
      if (!src || !src.alive) return;
      const idx = await ctx.ask.choose(ctx.self, ['获得伤害来源一张牌', '令伤害来源摸一张牌'], { prompt: '【反馈】：选择一项', reason: 'fankui' });
      if (idx === 1) { await ctx.draw(src, 1, { reason: 'fankui' }); return; }
      if (idx === 0) {
        const c = await ctx.game.chooseCardFrom(ctx.self, src, { reason: 'fankui', includeJudge: false });
        if (c) await ctx.gain(ctx.self, [c], { from: src, reason: 'fankui' });
      }
    },
  }],
});

// 界夏侯惇 · 刚烈：每当你受到 1 点伤害后，你可以判定：红色则对来源造成 1 点伤害，黑色则弃置其一张牌。
defineSkill({
  id: 'jie_ganglie', name: '刚烈',
  desc: '当你受到 1 点伤害后，你可以进行判定：若为红色，你对伤害来源造成 1 点伤害；若为黑色，你弃置其一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => !!d.from && d.from !== d.self,
    async effect(ctx) {
      const src = ctx.data.from;
      const times = Math.max(1, Math.min(3, ctx.data.amount || 1));
      for (let i = 0; i < times; i++) {
        if (!ctx.self.alive || !src.alive) break;
        const j = await ctx.judge(ctx.self, { reason: '刚烈' });
        if (isRed({ suit: j.suit })) {
          await ctx.damage({ from: ctx.self, to: src, amount: 1, reason: 'ganglie' });
        } else {
          const c = await ctx.game.chooseCardFrom(ctx.self, src, { reason: 'ganglie' });
          if (c) await ctx.discard(src, [c], { reason: 'ganglie' });
        }
      }
    },
  }],
});

// 界张辽 · 突袭：摸牌阶段，你可以少摸任意张牌，然后获得等量名其他角色的各一张手牌。
defineSkill({
  id: 'jie_tuxi', name: '突袭',
  desc: '摸牌阶段，你可以少摸任意张牌，然后获得等量名其他角色的各一张手牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw' && d.game.alive().some(x => x !== d.self && x.hand.length > 0),
    async effect(ctx) {
      const cands = ctx.game.alive().filter(x => x !== ctx.self && x.hand.length);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(ctx.self, { min: 1, max: 2, candidates: cands, prompt: '【突袭】：选择至多两名角色' });
      if (!ts.length) return;
      ctx.self.flags.skip_draw = true;
      const remain = Math.max(0, 2 - ts.length);
      if (remain > 0) await ctx.draw(ctx.self, remain, { reason: 'tuxi' });
      for (const t of ts) {
        if (!t.hand.length) continue;
        const c = t.hand[ctx.game.rng.int(t.hand.length)];
        await ctx.gain(ctx.self, [c], { from: t, reason: 'tuxi' });
      }
    },
  }],
});

// 界许褚 · 裸衣：摸牌阶段开始时，亮出牌堆顶三张牌，可以获得其中的基本牌、武器牌和【决斗】；
// 若如此做，放弃摸牌，且直到你的下回合开始，你为伤害来源的【杀】或【决斗】伤害 +1。
defineSkill({
  id: 'jie_luoyi', name: '裸衣',
  desc: '摸牌阶段开始时，你可以亮出牌堆顶三张牌，获得其中基本牌、武器牌和【决斗】，然后放弃摸牌；直到你的下回合开始，你造成的【杀】或【决斗】伤害 +1。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'draw' && d.game.deck.length > 0,
      async effect(ctx) {
        const top = ctx.game.deck.splice(-3, 3);
        if (!top.length) return;
        await ctx.game.revealCards(top, { reason: '裸衣' });
        const gain = [], rest = [];
        for (const c of top) {
          const meta = CARD_META[c.name] || {};
          if (meta.type === 'basic' || meta.sub === 'weapon' || c.name === 'juedou') gain.push(c);
          else rest.push(c);
        }
        if (!gain.length) {
          // 没有可获得的牌：不发动，牌放回牌堆顶，正常摸牌
          ctx.game.deck.push(...top);
          return;
        }
        ctx.self.flags.skip_draw = true;
        ctx.self.flags.luoyi = true;
        await ctx.gain(ctx.self, gain, { reason: 'luoyi' });
        if (rest.length) await ctx.discard(ctx.self, rest, { reason: 'luoyi' });
        await ctx.log(`${ctx.self.name} 发动【裸衣】，获得 ${gain.length} 张牌并放弃摸牌`);
      },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from && d.from === d.player && d.player.flags.luoyi && (d.reason === 'sha' || d.reason === 'juedou'),
      async effect(ctx) { ctx.data.amount += 1; },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.luoyi = false; },
    },
  ],
});

// 界郭嘉 · 遗计：受到 1 点伤害后摸两张牌，然后可将至多两张手牌扣置于至多两名其他角色武将牌旁，
// 这些角色于其下个摸牌阶段开始时获得这些牌。
defineSkill({
  id: 'jie_yiji', name: '遗计',
  desc: '当你受到 1 点伤害后，你可以摸两张牌，然后你可以将至多两张手牌扣置于至多两名其他角色的武将牌旁，这些角色于其下个摸牌阶段开始时获得这些牌。',
  triggers: [
    {
      on: 'damage.after', who: 'self', optional: true,
      async effect(ctx) {
        const cards = await ctx.draw(ctx.self, 2, { reason: 'yiji' });
        if (!cards.length) return;
        const others = ctx.game.alive().filter(x => x !== ctx.self);
        if (!others.length || !ctx.self.hand.length) return;
        const ts = await ctx.ask.targets(ctx.self, { min: 0, max: 2, candidates: others, prompt: '【遗计】：将至多两张手牌扣置于至多两名角色武将牌旁（可取消）' });
        for (const t of ts) {
          if (!ctx.self.hand.length) break;
          const res = await ctx.game.ask(ctx.self, 'cards', {
            prompt: `【遗计】：选择至多两张手牌扣置于 ${t.name} 的武将牌旁`,
            cards: ctx.self.hand.map(c => c.id), min: 0, max: 2, optional: true,
          });
          const picked = (res?.cardIds || []).map(id => ctx.self.hand.find(c => c.id === id)).filter(Boolean).slice(0, 2);
          if (!picked.length) continue;
          for (const c of picked) {
            const i = ctx.self.hand.indexOf(c);
            if (i >= 0) ctx.self.hand.splice(i, 1);
          }
          t.flags.yiji = [...(t.flags.yiji || []), ...picked];
          await ctx.log(`${ctx.self.name} 将 ${picked.length} 张牌扣置于 ${t.name} 武将牌旁`);
        }
        await ctx.game.checkHandChange(ctx.self);
      },
    },
    {
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'draw' && d.self && (d.self.flags.yiji || []).length > 0,
      async effect(ctx) {
        const t = ctx.data.self;
        const cards = t.flags.yiji || [];
        t.flags.yiji = [];
        if (cards.length) await ctx.gain(t, cards, { reason: 'yiji' });
      },
    },
  ],
});

// 界甄姬 · 洛神：准备阶段可重复判定，黑色则获得此牌并可以继续（官方“不计入手牌上限”需引擎支持，暂未实现）。
defineSkill({
  id: 'jie_luoshen', name: '洛神',
  desc: '准备阶段，你可以进行判定：若结果为黑色，你获得此牌，然后你可以重复此流程。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      let guard = 0;
      while (guard++ < 12) {
        const yes = await ctx.ask.confirm(ctx.self, '【洛神】：是否进行判定？');
        if (!yes) break;
        const j = await ctx.judge(ctx.self, { reason: '洛神' });
        if (!j.card || isRed({ suit: j.suit })) { await ctx.log('【洛神】判定为红色，结束'); break; }
        const c = j.card;
        const i = ctx.game.discardPile.indexOf(c);
        if (i >= 0) ctx.game.discardPile.splice(i, 1);
        await ctx.gain(ctx.self, [c], { reason: 'luoshen' });
      }
    },
  }],
});

// ================= 蜀 =================

// 界刘备 · 仁德：出牌阶段每名角色限一次，可交给其任意张手牌；
// 当本阶段以此法给出的牌首次达到两张时，可以视为使用一张基本牌。
defineSkill({
  id: 'jie_rende', name: '仁德',
  desc: '出牌阶段，每名角色限一次，你可以交给一名其他角色任意张手牌；当你本阶段以此法给出的牌首次达到两张或更多时，你可以视为使用一张基本牌。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    async effect(ctx) {
      ctx.self.flags.jieRendeGiven = [];
      ctx.self.flags.jieRendeTotal = 0;
      ctx.self.flags.jieRendeBasic = false;
    },
  }, {
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'play',
    async effect(ctx) {
      ctx.self.flags.jieRendeGiven = [];
      ctx.self.flags.jieRendeTotal = 0;
      ctx.self.flags.jieRendeBasic = false;
    },
  }],
  active: {
    perTurn: false,
    prompt: '将任意张手牌交给一名其他角色',
    async effect(ctx) {
      const p = ctx.self;
      const given = p.flags.jieRendeGiven || [];
      const others = ctx.game.alive().filter(x => x !== p && !given.includes(x.id));
      if (!others.length || !p.hand.length) return;
      const res = await ctx.game.ask(p, 'cards', { prompt: '【仁德】：选择要交出的手牌', cards: p.hand.map(c => c.id), min: 1, max: 99, optional: true });
      const cards = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
      if (!cards.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: others, prompt: '【仁德】：交给谁？' });
      if (!ts.length) return;
      const t = ts[0];
      await ctx.gain(t, cards, { from: p, reason: 'rende' });
      p.flags.jieRendeGiven = [...given, t.id];
      p.flags.jieRendeTotal = (p.flags.jieRendeTotal || 0) + cards.length;

      if (p.flags.jieRendeTotal >= 2 && !p.flags.jieRendeBasic) {
        p.flags.jieRendeBasic = true;
        const idx = await ctx.ask.choose(p, ['视为使用【杀】', '视为使用【桃】', '视为使用【酒】', '不发动'], { prompt: '【仁德】：是否视为使用一张基本牌？', reason: 'rende' });
        if (idx === 0) {
          const v = virtualBasic(ctx.game, 'sha');
          const cands = ctx.game.candidatesFor(p, { name: 'sha' });
          if (cands.length) {
            const tg = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【仁德】：视为使用【杀】，选择目标' });
            if (tg.length) await ctx.useCard({ from: p, card: v, targets: tg, reason: 'rende' });
          }
        } else if (idx === 1) {
          await ctx.useCard({ from: p, card: virtualBasic(ctx.game, 'tao'), targets: [p], reason: 'rende' });
        } else if (idx === 2) {
          await ctx.useCard({ from: p, card: virtualBasic(ctx.game, 'jiu'), targets: [p], reason: 'rende' });
        }
      }
    },
  },
});

// 界关羽 · 武圣：可以将一张红色牌当【杀】使用或打出；方块【杀】无距离限制（后者需引擎支持，暂未实现）。
defineSkill({
  id: 'jie_wusheng', name: '武圣',
  desc: '你可以将一张红色牌当【杀】使用或打出。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => d.filter && d.filter.name === 'sha' && redCards(d.self).length > 0,
    async effect(ctx) {
      const c = await pickHandCard(ctx, ctx.self, isRed, '【武圣】：将一张红色牌当【杀】打出');
      if (c) { ctx.data.handled = true; ctx.data.card = { ...c, name: 'sha', __src: c }; }
    },
  }],
});

// 界张飞 · 咆哮：锁定技，使用【杀】无次数限制；你的【杀】被抵消后，本回合下一张【杀】伤害 +1。
defineSkill({
  id: 'jie_paoxiao', name: '咆哮',
  desc: '锁定技，你使用【杀】无次数限制；当你使用的【杀】被抵消后，你本回合下一张【杀】造成的伤害 +1。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) {
        ctx.self.flags.shaUnlimited = true;
        ctx.self.flags.jiePaoxiaoBonus = -1;
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      async effect(ctx) {
        ctx.self.flags.shaUnlimited = false;
        ctx.self.flags.jiePaoxiaoBonus = -1;
      },
    },
    {
      on: 'sha.dodged', who: 'self', optional: false,
      async effect(ctx) { ctx.self.flags.jiePaoxiaoBonus = ctx.game.turnCount; },
    },
    {
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from && d.from === d.player && d.reason === 'sha' && d.player.flags.jiePaoxiaoBonus >= 0 && d.player.flags.jiePaoxiaoBonus === d.game.turnCount,
      async effect(ctx) {
        ctx.data.amount += 1;
        ctx.self.flags.jiePaoxiaoBonus = -1;
      },
    },
  ],
});

// ================= 批次 B =================

// 界赵云 · 龙胆：杀/闪互换，酒可当桃（桃当酒需引擎 VIRTUAL_RULES 支持，暂未实现）。
defineSkill({
  id: 'jie_longdan', name: '龙胆',
  desc: '你可以将一张【杀】当【闪】、【闪】当【杀】、【酒】当【桃】使用或打出。',
  triggers: [{
    on: 'respond.need', who: 'self', optional: true,
    filter: (d) => {
      const want = d.filter?.name;
      if (!['sha', 'shan', 'tao'].includes(want)) return false;
      const need = want === 'sha' ? 'shan' : want === 'shan' ? 'sha' : 'jiu';
      return d.self.hand.some(c => c.name === need);
    },
    async effect(ctx) {
      const want = ctx.data.filter.name;
      const need = want === 'sha' ? 'shan' : want === 'shan' ? 'sha' : 'jiu';
      const c = await pickHandCard(ctx, ctx.self, x => x.name === need, `【龙胆】：将一张【${CARD_META[need].cn}】当【${CARD_META[want].cn}】打出`);
      if (!c) return;
      ctx.data.handled = true;
      ctx.data.card = { ...c, name: want, __src: c };
    },
  }],
});

// 界马超 · 铁骑：使用【杀】指定目标后判定，除非其弃一张与判定花色相同的牌，否则不能使用【闪】。
defineSkill({
  id: 'jie_tieji', name: '铁骑',
  desc: '当你使用【杀】指定目标后，你可以进行判定：除非该角色弃置一张与判定结果花色相同的牌，否则其不能使用【闪】响应此【杀】。',
  triggers: [{
    on: 'target.after', who: 'self', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && d.target && d.target !== d.self,
    async effect(ctx) {
      const t = ctx.data.target;
      const j = await ctx.judge(ctx.self, { reason: '铁骑' });
      const cands = t.hand.filter(c => c.suit === j.suit);
      if (cands.length) {
        const c = await ctx.ask.card(t, { filter: { suit: [j.suit] }, prompt: `【铁骑】：弃置一张 ${SUIT_CN_TEXT(j.suit)} 牌，否则不能使用【闪】`, optional: true, reason: 'tieji' });
        if (c) return;
      }
      t.flags.noShan = ctx.data.card?.id || true;
      await ctx.log(`【铁骑】生效：${t.name} 不能使用【闪】`);
    },
  }],
});

// 界诸葛亮 · 观星：看 5 张（存活 <4 看 3 张）任意置于顶/底；若全置底，结束阶段可再来一次。
defineSkill({
  id: 'jie_guanxing', name: '观星',
  desc: '准备阶段，你可以观看牌堆顶的 5 张牌（存活角色少于 4 时为 3 张），以任意顺序置于牌堆顶或牌堆底；若全部置于牌堆底，结束阶段你可以再次发动。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'prepare',
      async effect(ctx) { await guanxing(ctx, false); },
    },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'end' && d.self.flags.jieGuanxingAgain,
      async effect(ctx) {
        ctx.self.flags.jieGuanxingAgain = false;
        const yes = await ctx.ask.confirm(ctx.self, '【观星】：是否再次发动？');
        if (yes) await guanxing(ctx, true);
      },
    },
  ],
});

async function guanxing(ctx, isRepeat) {
  const p = ctx.self;
  const n = Math.min(5, ctx.game.alive().length < 4 ? 3 : 5);
  const top = ctx.game.deck.splice(-n, n);
  if (!top.length) return;
  const toTop = [], toBottom = [];
  for (const c of top) {
    const idx = await ctx.ask.choose(p, [`${cardLabel(c)} → 置于牌堆顶`, `${cardLabel(c)} → 置于牌堆底`], { prompt: '【观星】：选择放置位置', reason: 'guanxing' });
    if (idx === 1) toBottom.push(c); else toTop.push(c);
  }
  ctx.game.deck.push(...toTop.slice().reverse());
  ctx.game.deck.unshift(...toBottom.slice().reverse());
  if (!isRepeat && toTop.length === 0) p.flags.jieGuanxingAgain = true;
  await ctx.log(`${p.name} 发动【观星】，调整了 ${top.length} 张牌（顶 ${toTop.length} / 底 ${toBottom.length}）`);
}

// 界黄月英 · 集智：使用非转化锦囊时摸一张（官方“手牌上限 +1”需引擎支持，暂未实现）。
defineSkill({
  id: 'jie_jizhi', name: '集智',
  desc: '当你使用一张非转化的普通锦囊牌时，你可以摸一张牌。',
  triggers: [{
    on: 'card.use.before', who: 'self', optional: true,
    filter: (d) => d.card && d.card.type === 'trick' && !d.card.__src && !CARD_META[d.card.name]?.delayed,
    async effect(ctx) { await ctx.draw(ctx.self, 1, { reason: 'jizhi' }); },
  }],
});

// 界孙权 · 制衡：弃任意张牌摸等量；若弃置了所有手牌，额外摸一张。
defineSkill({
  id: 'jie_zhiheng', name: '制衡',
  desc: '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌；若你以此法弃置了所有手牌，你额外摸一张牌。',
  active: {
    perTurn: true,
    prompt: '弃置任意张牌并摸等量的牌',
    async effect(ctx) {
      const p = ctx.self;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) return;
      const handBefore = p.hand.length;
      const res = await ctx.game.ask(p, 'cards', { prompt: '【制衡】：选择要弃置的牌', cards: pool.map(c => c.id), min: 0, max: 99, optional: true });
      const cards = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
      if (!cards.length) return;
      await ctx.discard(p, cards, { reason: 'zhiheng' });
      const extra = handBefore > 0 && p.hand.length === 0 ? 1 : 0;
      await ctx.draw(p, cards.length + extra, { reason: 'zhiheng' });
    },
  },
});

// 界吕蒙 · 克己：出牌阶段未使用或打出【杀】，可跳过弃牌阶段。
defineSkill({
  id: 'jie_keji', name: '克己',
  desc: '若你于出牌阶段未使用或打出过【杀】，你可以跳过弃牌阶段。',
  triggers: [{
    on: 'phase.end', who: 'self', optional: false,
    filter: (d) => d.phase === 'play',
    async effect(ctx) {
      if (!ctx.self.flags.shaUsed) {
        ctx.self.flags.skip_discard = true;
        await ctx.log(`${ctx.self.name} 发动【克己】，跳过弃牌阶段`);
      }
    },
  }],
});

// 界周瑜 · 反间：交给一名其他角色一张手牌，其展示手牌弃同花色牌或失去 1 点体力。
defineSkill({
  id: 'jie_fanjian', name: '反间',
  desc: '出牌阶段限一次，你可以展示并交给一名其他角色一张手牌，然后其选择一项：1.展示所有手牌，弃置与此牌花色相同的牌；2.失去 1 点体力。',
  active: {
    perTurn: true,
    prompt: '交给一名角色一张手牌，由其选择弃同花色牌或失去体力',
    async effect(ctx) {
      const p = ctx.self;
      const others = ctx.game.alive().filter(x => x !== p);
      if (!others.length || !p.hand.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: others, prompt: '【反间】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const ci = await ctx.ask.choose(p, p.hand.map(c => cardLabel(c)), { prompt: '【反间】：选择一张手牌交给对方', reason: 'fanjian' });
      if (ci < 0 || !p.hand[ci]) return;
      const c = p.hand[ci];
      await ctx.gain(t, [c], { from: p, reason: 'fanjian' });
      await ctx.game.revealCards([c], { to: ctx.game.alive(), reason: '反间' });
      const idx = await ctx.ask.choose(t, ['展示所有手牌，弃置与此牌花色相同的牌', '失去 1 点体力'], { prompt: '【反间】：选择一项', reason: 'fanjian' });
      if (idx === 1) {
        await ctx.loseHp(t, 1, { reason: 'fanjian' });
      } else {
        await ctx.game.revealCards(t.hand.slice(), { to: ctx.game.alive(), reason: '反间' });
        const same = t.hand.filter(x => x.suit === c.suit);
        if (same.length) await ctx.discard(t, same, { reason: 'fanjian' });
      }
    },
  },
});

// 界大乔 · 流离：成为【杀】目标时，可弃一张牌转移给攻击范围内的另一名角色。
defineSkill({
  id: 'jie_liuli', name: '流离',
  desc: '当你成为【杀】的目标时，你可以弃置一张牌，将此【杀】转移给你攻击范围内的另一名角色。',
  triggers: [{
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && d.target === d.player,
    async effect(ctx) {
      const p = ctx.self;
      const used = ctx.data.used || [];
      const cands = ctx.game.alive().filter(x => x !== p && !used.includes(x) && ctx.inRange(p, x));
      if (!cands.length) return;
      const c = await ctx.ask.card(p, { prompt: '【流离】：弃置一张牌，转移此【杀】', optional: true, reason: 'liuli' });
      if (!c) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【流离】：将【杀】转移给谁？' });
      if (!ts.length) return;
      await ctx.discard(p, [c], { reason: 'liuli' });
      ctx.data.target = ts[0];
      ctx.data.redirected = true;
      await ctx.log(`${p.name} 发动【流离】，将【杀】转移给 ${ts[0].name}`);
    },
  }],
});

// 界陆逊 · 谦逊：唯一目标的锦囊对你生效时，可将所有手牌扣置于武将牌上，回合结束取回。
defineSkill({
  id: 'jie_qianxun', name: '谦逊',
  desc: '当一张延时锦囊牌或其他角色使用的普通锦囊牌对你生效时，若你是此牌唯一目标，你可以将所有手牌扣置于武将牌上，然后此回合结束时获得这些牌。',
  triggers: [
    {
      on: 'target.before', who: 'any', optional: true,
      filter: (d) => d.target === d.player && d.card && d.card.type === 'trick' && onlyOneTarget(d.card),
      async effect(ctx) {
        const p = ctx.self;
        if (!p.hand.length) return;
        p.flags.qianxunCards = p.hand.slice();
        p.hand.splice(0, p.hand.length);
        await ctx.log(`${p.name} 发动【谦逊】，将 ${p.flags.qianxunCards.length} 张手牌扣置于武将牌上`);
        await ctx.game.checkHandChange(p);
      },
    },
    {
      on: 'turn.end', who: 'any', optional: false,
      filter: (d) => (d.player.flags.qianxunCards || []).length > 0,
      async effect(ctx) {
        const cards = ctx.self.flags.qianxunCards || [];
        ctx.self.flags.qianxunCards = [];
        if (cards.length) await ctx.gain(ctx.self, cards, { reason: 'qianxun' });
      },
    },
  ],
});

function onlyOneTarget(card) {
  const rule = CARD_META[card.name]?.target;
  return !!rule && typeof rule === 'object' && (rule.max ?? 1) === 1 && !rule.all;
}

// 界陆逊 · 连营：失去所有手牌后，可令至多 X 名角色各摸一张牌（X 为此次失去的手牌数）。
defineSkill({
  id: 'jie_lianying', name: '连营',
  desc: '当你失去所有手牌后，你可以令至多 X 名角色各摸一张牌（X 为你此次失去的手牌数）。',
  triggers: [{
    on: 'hand.change', who: 'self', optional: false,
    async effect(ctx) {
      const p = ctx.self;
      const prev = p.flags.jieLianyingPrev;
      const cur = p.hand.length;
      p.flags.jieLianyingPrev = cur;
      if (cur !== 0 || !(prev > 0) || p.flags.jieLianyingBusy) return;
      p.flags.jieLianyingBusy = true;
      const x = Math.min(prev, ctx.game.alive().length);
      const ts = await ctx.ask.targets(p, { min: 0, max: x, candidates: ctx.game.alive(), prompt: `【连营】：令至多 ${x} 名角色各摸一张牌` });
      for (const t of ts) await ctx.draw(t, 1, { reason: 'lianying' });
      p.flags.jieLianyingBusy = false;
    },
  }],
});

// 界华佗 · 青囊：弃一张手牌令一名受伤角色回复 1 点；若弃置的是红牌，可再次发动（不能选同一个人）。
defineSkill({
  id: 'jie_qingnang', name: '青囊',
  desc: '出牌阶段限一次，你可以弃置一张手牌，令一名已受伤的角色回复 1 点体力；若你弃置的是红色牌，你可以再次发动此技能，但不能选择本回合选择过的角色。',
  active: {
    perTurn: false,
    prompt: '弃置一张手牌，令一名受伤角色回复 1 点体力',
    async effect(ctx) {
      const p = ctx.self;
      if (p.flags.jieQingnangTurn === ctx.game.turnCount) return;
      p.flags.jieQingnangTurn = ctx.game.turnCount;
      const used = [];
      let guard = 0;
      while (guard++ < 8) {
        const cands = ctx.game.alive().filter(x => x.hp < x.maxHp && !used.includes(x.id));
        if (!cands.length || !p.hand.length) break;
        const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【青囊】：选择一名受伤角色' });
        if (!ts.length) break;
        const ci = await ctx.ask.choose(p, p.hand.map(c => cardLabel(c)), { prompt: '【青囊】：弃置一张手牌', reason: 'qingnang' });
        if (ci < 0 || !p.hand[ci]) break;
        const c = p.hand[ci];
        await ctx.discard(p, [c], { reason: 'qingnang' });
        await ctx.recover(ts[0], 1, { reason: 'qingnang' });
        used.push(ts[0].id);
        if (!isRed(c)) break;
        const yes = await ctx.ask.confirm(p, '【青囊】：是否再次发动？');
        if (!yes) break;
      }
    },
  },
});

// 界吕布 · 无双：锁定技，杀需两张闪才能抵消（决斗部分需引擎补 juedou.need 触发，暂未生效）。
defineSkill({
  id: 'jie_wushuang', name: '无双',
  desc: '锁定技，当你使用【杀】时，目标需连续使用两张【闪】才能抵消。',
  triggers: [{
    on: 'dodge.before', who: 'any', optional: false,
    filter: (d) => d.from && d.from === d.player && d.card,
    async effect(ctx) { ctx.data.extraDodge = 1; },
  }, {
    on: 'juedou.need', who: 'any', optional: false,
    filter: (d) => d.from && d.from === d.player,
    async effect(ctx) { ctx.data.extraSha = 1; },
  }],
});

// 界貂蝉 · 离间：弃一张牌，令一名男性角色视为对另一名男性角色使用【决斗】（不能被无懈）。
defineSkill({
  id: 'jie_lijian', name: '离间',
  desc: '出牌阶段限一次，你可以弃置一张牌，令一名男性角色视为对另一名男性角色使用一张【决斗】（不能被【无懈可击】抵消）。',
  active: {
    perTurn: true,
    prompt: '弃置一张牌，令两名男性角色决斗',
    async effect(ctx) {
      const p = ctx.self;
      const cands = ctx.game.alive().filter(x => x !== p && x.gender !== 'female');
      if (cands.length < 2) return;
      const ts = await ctx.ask.targets(p, { min: 2, max: 2, candidates: cands, prompt: '【离间】：选择两名男性角色进行决斗' });
      if (ts.length < 2) return;
      const c = await ctx.ask.card(p, { prompt: '【离间】：弃置一张牌', optional: false, reason: 'lijian' });
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'lijian' });
      await ctx.game.log(`【离间】：${ts[0].name} 视为对 ${ts[1].name} 使用【决斗】`);
      let attacker = ts[0], defender = ts[1];
      let guard = 0;
      while (guard++ < 10) {
        const s = await ctx.respond(attacker, { filter: { name: 'sha' }, prompt: '【离间】决斗：请打出一张【杀】', optional: true, reason: 'lijian' });
        if (!s) { await ctx.damage({ from: defender, to: attacker, amount: 1, reason: 'lijian' }); break; }
        [attacker, defender] = [defender, attacker];
      }
    },
  },
});

function SUIT_CN_TEXT(suit) {
  return { spade: '黑桃', heart: '红桃', club: '梅花', diamond: '方块' }[suit] || '';
}

export {};
