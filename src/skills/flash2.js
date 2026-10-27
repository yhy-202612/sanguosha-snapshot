// OL「闪」系列 · 闪朱儁（江山如故·起 朱儁的 OL 移植版，2026-01-31 上线）
// OL 与线下的差异（官方口径）：【分敌】去掉「每回合限一次」；【拒降】的 X 由「弃置牌的花色数」改为「弃置的牌数」。
// 本实现按 OL 口径。
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { cardLabel } from '../engine/cards.js';

// ========================================================================
// 【分敌】当你使用【杀】指定唯一目标后，你可以展示该角色至多 X 张手牌（X 为你的体力上限）。
//        若如此做，直到此【杀】结算结束，其只能使用或打出这些被展示的牌；
//        当此【杀】对其造成伤害后，你获得这些牌。
// 实现：用引擎的「响应白名单」通用能力（SG026 D14）：
//      展示后给目标写 flags.responseWhitelist = { cardId, targetId, ids, turn }，
//      game.useCard / game.respondCard 两条路径统一检查（主动使用与任何响应都只认白名单里的牌），
//      此【杀】结算结束（card.use.after）时清除。含【闪】则其仍可闪避，不含则闪不了——无需另设 unavoidable。
// ★牌张守恒：flags 里只存**牌 id**，不存牌对象引用（否则会被双存门禁判为额外区域）。
// ========================================================================
defineSkill({
  id: 'zhujun_fendi', name: '分敌',
  desc: '当你使用【杀】指定唯一目标后，你可以展示该角色至多 X 张手牌（X 为你的体力上限）。若如此做，直到此【杀】结算结束，其只能使用或打出这些被展示的牌；当此【杀】对其造成伤害后，你获得这些牌。',
  triggers: [
    {
      on: 'target.after', who: 'any',
      // ★「唯一目标」必须看 d.total（本次使用声明的目标总数），不能看 d.used.length
      //   （那是「已结算完的目标数组」，第一个目标结算时恒为 0，多目标【杀】会误触发）。
      filter: (d) => d.self === d.player && !!d.shaCtx && !!d.card && d.card.name === 'sha'
        && !!d.target && d.target !== d.player && d.total === 1
        && d.target.hand.length > 0,
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.target, g = ctx.game;
        const n = Math.min(p.maxHp, t.hand.length);
        if (!(await ctx.ask.confirm(p, `【分敌】：是否展示 ${t.name} 至多 ${n} 张手牌？`))) return;
        const shown = await g.chooseSomeCards(t, t.hand.slice(), n, {
          prompt: `【分敌】：选择至多 ${n} 张手牌展示`, optional: true,
        });
        if (!shown.length) return;
        await g.revealCards(shown, { reason: `【分敌】${p.name} 展示 ${t.name} 的手牌` });
        const cardId = ctx.data.card.id;
        // 响应白名单：直到此【杀】结算结束，目标只能使用/打出这些牌
        t.flags.responseWhitelist = { cardId, targetId: t.id, ids: shown.map(c => c.id), turn: g.turnCount };
        p.flags.fdShown = p.flags.fdShown || [];
        p.flags.fdShown.push({ seat: t.seat, ids: shown.map(c => String(c.id)), cardId });
        await ctx.log(`【分敌】：展示 ${shown.map(cardLabel).join('、')}（此【杀】结算结束前，其只能使用或打出这些牌）`);
      },
    },
    {
      // 此【杀】造成伤害后取回展示牌（仍在目标手牌或已在弃牌堆的都能取回）
      on: 'damage.after', who: 'any',
      filter: (d) => d.from === d.player && !!d.card && d.card.name === 'sha' && !!d.to
        && (d.player.flags.fdShown || []).some(r => r.seat === d.to.seat && r.cardId === d.card.id),
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.to, g = ctx.game;
        const arr = p.flags.fdShown || [];
        const idx = arr.findIndex(r => r.seat === t.seat && r.cardId === ctx.data.card.id);
        if (idx < 0) return;
        const rec = arr.splice(idx, 1)[0];
        const got = [];
        for (const id of rec.ids) {
          const hi = t.hand.findIndex(c => String(c.id) === id);
          if (hi >= 0) { got.push({ c: t.hand.splice(hi, 1)[0], from: t }); continue; }
          const di = g.discardPile.findIndex(c => String(c.id) === id);
          if (di >= 0) { got.push({ c: g.discardPile.splice(di, 1)[0], from: null }); continue; }
        }
        if (!got.length) return;
        // 牌张守恒：来自目标手牌的牌必须带 from（否则「从其他角色获得牌」类技能全部漏触发）
        for (const { c, from } of got) await ctx.gain(p, [c], { from, reason: 'fendi' });
        await ctx.log(`【分敌】：${p.name} 获得展示牌 ${got.map((x) => cardLabel(x.c)).join('、')}`);
      },
    },
    {
      // 此【杀】结算结束：清展示记录 + 清掉目标身上的响应白名单（未造成伤害时不留残影，
      // 否则下一张对同一角色的【杀】会误取回上一张展示的牌 / 白名单会锁住目标的手牌）
      // ★filter 不能只依赖 fdShown 非空：造成伤害时 damage.after 已把该记录 splice 掉，
      //   若依赖它，命中后的白名单就永远清不掉（SG027 R8 FAIL）。
      //   故「自己使用【杀】」本身就足以触发清理（分敌只对【杀】生效）。
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => !!d.card && ((d.effName || d.card.name) === 'sha' || (d.player.flags.fdShown || []).length > 0),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, cardId = ctx.data.card && ctx.data.card.id;
        p.flags.fdShown = (p.flags.fdShown || []).filter(r => r.cardId !== cardId);
        for (const q of g.players) {
          const wl = q.flags.responseWhitelist;
          if (wl && wl.cardId === cardId) delete q.flags.responseWhitelist;
        }
      },
    },
  ],
});

// ========================================================================
// 【拒降】每回合限一次，当你于摸牌阶段外获得牌后，你可以弃置这些牌；
//        你每以此法弃置一张牌，当前回合角色本回合使用【杀】的次数 +1。
// ========================================================================
defineSkill({
  id: 'zhujun_jujiang', name: '拒降',
  desc: '每回合限一次，当你于摸牌阶段外获得牌后，你可以弃置这些牌；你每以此法弃置一张牌，当前回合角色本回合使用【杀】的次数 +1。',
  triggers: [
    {
      on: 'cards.gain', who: 'any',
      filter: (d) => d.self === d.player && Array.isArray(d.cards) && d.cards.length > 0
        && d.player.flags.jjUsed !== d.game.turnCount
        // 排除「自己摸牌阶段内的摸牌」
        && !(d.game.phase === 'draw' && d.game.turnPlayer === d.player),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const cards = (ctx.data.cards || []).slice();
        if (!cards.length) return;
        if (!(await ctx.ask.confirm(p, `【拒降】：是否弃置刚获得的 ${cards.length} 张牌，令当前回合角色本回合【杀】次数 +${cards.length}？`))) return;
        p.flags.jjUsed = g.turnCount;
        await ctx.discard(p, cards, { reason: 'jujiang' });
        const tp = g.turnPlayer || p;
        // ★「次数 +N」必须加到上限（shaExtra），不能去减已用次数（shaUsed）：
        //   本回合还没出过【杀】时 Math.max(0, 0-N)=0，额外次数一点都没生效（SG025 #12）。
        tp.flags.shaExtraTurn = (tp.flags.shaExtraTurn || 0) + cards.length;
        await ctx.log(`【拒降】：${p.name} 弃置 ${cards.length} 张牌，${tp.name} 本回合【杀】次数 +${cards.length}`);
      },
    },
  ],
});

// ========================================================================
// OL「闪」系列 · 闪刘宏（江山如故·起 刘宏的 OL 移植版）
// 说明：闪刘宏与闪张辽的 5 个技能（朝争/甚宠/聚敛/整兵/突围）此前在数据里被引用但**从未注册**，
//      导致这两个武将在游戏内技能全空（packcheck 的 2.1/2.3/2.8 段断言因此长期失败）。
//      此处按起·刘宏 / 承·张辽 的同一套口径补齐无前缀版本；同时补上被【甚宠】引用的【飞扬】【跋扈】。
// ========================================================================

// 【朝争】准备阶段，你可以令所有其他角色议事，若结果为：红色，意见为红色的角色各回复 1 点体力；
//        黑色，意见为红色的角色各失去 1 点体力。此次议事结束后，若所有角色意见相同，你摸 X 张牌。
defineSkill({
  id: 'chaozheng', name: '朝争',
  desc: '出牌阶段开始时，你可以令所有其他角色议事，若结果为：红色，意见为红色的角色各回复 1 点体力；黑色，意见为红色的角色各失去 1 点体力。此次议事结束后，若所有角色意见相同，你摸 X 张牌（X 为此次议事的角色数）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'play',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const parts = g.alive().filter((x) => x !== p && x.hand.length > 0);
      if (!parts.length) return;
      const r = await g.yishi(p);
      await ctx.log(`【朝争】：议事 — 红 ${r.red.length} / 黑 ${r.black.length}`);
      if (r.redWin) {
        for (const q of r.red) if (q.alive && q.hp < q.maxHp) await ctx.recover(q, 1, { reason: 'chaozheng' });
        await ctx.log('【朝争】：红色胜，意见为红色的角色各回复 1 点体力');
      } else {
        for (const q of r.red) if (q.alive) await ctx.loseHp(q, 1, { reason: 'chaozheng' });
        await ctx.log('【朝争】：黑色胜，意见为红色的角色各失去 1 点体力');
      }
      const same = r.red.length === 0 || r.black.length === 0;
      if (same) {
        await ctx.draw(p, r.total, { reason: 'chaozheng' });
        await ctx.log(`【朝争】：所有人意见相同，摸 ${r.total} 张牌`);
      }
    },
  }],
});

// 【甚宠】限定技，令一名其他角色获得【飞扬】和【跋扈】；当你死亡时，其失去所有技能并弃置所有手牌。
// 实现：在准备阶段询问（官方为出牌阶段；放准备阶段可避免与其它出牌阶段主动技的询问互相抢占）。
defineSkill({
  id: 'shenchong', name: '甚宠',
  desc: '限定技，你可以令一名其他角色获得【飞扬】和【跋扈】。若如此做，当你死亡时，其失去所有技能，弃置所有手牌。（实现：在准备阶段询问）',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && !d.self.flags.shenchongUsed,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((x) => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【甚宠】（限定技）：令一名其他角色获得【飞扬】【跋扈】', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      p.flags.shenchongUsed = true;
      p.flags.shenchongTarget = t.id;
      for (const id of ['feiyang', 'bahu']) {
        if (!(effSkills(t) || []).some((s) => s.id === id)) {
          const sk = getSkill(id);
          if (sk) t.skills.push(sk);
        }
      }
      await ctx.log(`【甚宠】：${t.name} 获得【飞扬】【跋扈】`);
    },
  }, {
    on: 'death.after', who: 'self',
    filter: (d) => !!d.self.flags.shenchongTarget,
    async effect(ctx) {
      const g = ctx.game;
      const t = g.byId(ctx.data.self.flags.shenchongTarget);
      if (!t) return;
      t.skills = (t.skills || []).filter((s) => s.id !== 'feiyang' && s.id !== 'bahu');
      if (t.hand.length) await g.discardCards(t, t.hand.slice(), { reason: 'shenchong' });
      await ctx.log(`【甚宠】：${t.name} 失去所有技能并弃置所有手牌`);
    },
  }],
});

// 【聚敛】主公技，其他群势力角色回合内限两次，当其于摸牌阶段外不因此技能而摸牌后，其可以摸一张牌；
//        结束阶段，你可以获得所有其他群势力角色各一张手牌。
defineSkill({
  id: 'julian', name: '聚敛',
  desc: '主公技，其他群势力角色回合内限两次，当其于摸牌阶段外不因此技能而摸牌后，其可以摸一张牌；结束阶段，你可以获得所有其他群势力角色各一张手牌。',
  triggers: [{
    on: 'cards.draw.after', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && d.self.kingdom === 'qun'
      && d.reason !== 'draw' && d.reason !== 'julian'
      && (d.self.flags.julianCount || 0) < 2,
    async effect(ctx) {
      const t = ctx.data.self;
      t.flags.julianCount = (t.flags.julianCount || 0) + 1;
      await ctx.draw(t, 1, { reason: 'julian' });
      await ctx.log(`【聚敛】：${t.name} 摸一张牌`);
    },
  }, {
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'end',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter((x) => x !== p && x.kingdom === 'qun' && x.hand.length > 0);
      if (!cands.length) return;
      for (const t of cands) {
        const c = (await g.chooseSomeCards(p, t.hand.slice(), 1, { prompt: `【聚敛】：获得 ${t.name} 一张手牌` }))[0];
        if (c) await ctx.gain(p, [c], { from: t, reason: 'julian' });
      }
      await ctx.log(`【聚敛】：获得 ${cands.map((t) => t.name).join('、')} 各一张手牌`);
    },
  }],
});

// 【整兵】出牌阶段限一次，你可以重铸一张【杀】，然后你本回合手牌上限 +1；
//        若你的势力为群，你可以将势力变更为魏（此后【整兵】失效、【突围】可用）。
defineSkill({
  id: 'zhengbing', name: '整兵',
  desc: '出牌阶段限一次，你可以重铸一张【杀】，然后你本回合手牌上限 +1；若你的势力为群，你可以将势力变更为魏。（实现：势力门控用 kingdomOnly，变为魏后本技能自动失效）',
  kingdomOnly: 'qun',
  active: {
    perPhase: true,
    prompt: '整兵：重铸一张【杀】，本回合手牌上限 +1',
    async effect(ctx) {
      const p = ctx.self;
      const c = await ctx.ask.card(p, { filter: (x) => x.name === 'sha', prompt: '【整兵】：重铸一张【杀】', reason: 'zhengbing' });
      if (!c) return;
      await ctx.draw(p, 1, { reason: 'zhengbing' });
      p.flags.handLimit = (p.flags.handLimit || 0) + 1;
      await ctx.log(`【整兵】：${p.name} 重铸【杀】，手牌上限 +1（本回合）`);
      if (p.kingdom === 'qun') {
        if (await ctx.ask.confirm(p, '【整兵】：是否将势力变更为魏？')) {
          await ctx.setKingdom(p, 'wei', 'zhengbing');
          await ctx.log(`【整兵】：${p.name} 势力变更为魏`);
        }
      }
    },
  },
});

// 【突围】魏势力技，出牌阶段限一次，你可以弃置一张牌，视为对一名其他角色使用一张【杀】（无距离限制）。
defineSkill({
  id: 'tuwei', name: '突围',
  desc: '魏势力技，出牌阶段限一次，你可以弃置一张牌，视为对一名其他角色使用一张【杀】（无距离限制）。（实现：以等价的虚拟【杀】结算）',
  kingdomOnly: 'wei',
  active: {
    perPhase: true,
    prompt: '突围：弃置一张牌，视为使用【杀】（无距离限制）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = await ctx.ask.card(p, { prompt: '【突围】：弃置一张牌', reason: 'tuwei' });
      if (!c) return;
      const cands = g.alive().filter((x) => x !== p);
      if (!cands.length) return;
      const t = (await ctx.ask.targets(p, { prompt: '【突围】：选择【杀】的目标', candidates: cands, min: 1, max: 1 }))[0];
      if (!t) return;
      const vc = { id: 'vtuwei' + (g.cardSeq = (g.cardSeq || 0) + 1), name: 'sha', suit: c.suit, num: c.num, type: 'basic', virtual: true };
      await ctx.log(`【突围】：${p.name} 视为对 ${t.name} 使用【杀】`);
      await ctx.useCard({ from: p, card: vc, targets: [t], reason: 'tuwei', ignoreRange: true, ignoreShaLimit: true });
    },
  },
});

// 【飞扬】判定阶段开始时，你可以弃置两张牌，然后弃置你判定区里的所有牌。
defineSkill({
  id: 'feiyang', name: '飞扬',
  desc: '判定阶段开始时，你可以弃置两张牌，然后弃置你判定区里的所有牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'judge' && d.self.hand.length >= 2 && (d.self.judgeZone || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 2, { prompt: '【飞扬】：弃置两张牌', optional: false });
      if (picks.length < 2) return;
      await ctx.discard(p, picks, { reason: 'feiyang' });
      const zs = (p.judgeZone || []).map((z) => z.card).filter(Boolean);
      p.judgeZone = [];
      g.pushDiscard(zs);
      await ctx.log(`【飞扬】：弃置判定区 ${zs.length} 张牌`);
    },
  }],
});

// 【跋扈】锁定技，摸牌阶段，你多摸一张牌。
defineSkill({
  id: 'bahu', name: '跋扈',
  desc: '锁定技，摸牌阶段，你多摸一张牌。',
  triggers: [{
    // draw.count 只在摸牌阶段派发（data = { self, count }），无需再判阶段
    on: 'draw.count', who: 'self',
    effect(ctx) { ctx.data.count = (ctx.data.count || 0) + 1; },
  }],
});
