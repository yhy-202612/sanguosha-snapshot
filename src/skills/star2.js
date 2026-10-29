// 星将技能 · 第二批：星·左慈 / 星·典韦 / 星·南华老仙 / 星·张角 / 星·吕布
// 「武将牌」类机制（左慈、月英、周瑜等）在引擎里没有实体，统一用 marks 抽象成点数资源。
import { defineSkill } from '../engine/skill.js';
import { cardLabel, CARD_META } from '../engine/cards.js';

const roundOf = (g) => g.round ?? 0;
function onceRound(p, g, key) {
  const k = `r_${key}`;
  if (p.flags[k] === roundOf(g)) return false;
  p.flags[k] = roundOf(g);
  return true;
}
const EQUIP_NAMES = () => Object.keys(CARD_META).filter(n => CARD_META[n].type === 'equip');

// ==================== 星·左慈 ====================
// 【幻变】武将牌体系：开局 2 张、摸牌阶段 1 张；可消耗武将牌换取效果（视为借用其技能）
defineSkill({
  id: 'huanbian', name: '幻变',
  desc: '游戏开始时，你获得 2 张「武将牌」（记为“幻”）；摸牌阶段，你额外获得 1 张「武将牌」。你可以消耗 1 张「武将牌」，视为使用了其中一个技能（本实现：摸两张牌）。',
  triggers: [
    { on: 'game.start', who: 'any', optional: false, async effect(ctx) { ctx.self.marks.huan = 2; await ctx.log('【幻变】：获得 2 张武将牌'); } },
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'draw',
      async effect(ctx) { const p = ctx.self; p.marks.huan = (p.marks.huan || 0) + 1; await ctx.log(`【幻变】：摸牌阶段获得 1 张武将牌（共 ${p.marks.huan}）`); },
    },
  ],
  active: {
    prompt: '消耗 1 张武将牌（摸两张牌）',
    async effect(ctx) {
      const p = ctx.self;
      if ((p.marks.huan || 0) < 1) { await ctx.log('【幻变】：没有武将牌'); return; }
      p.marks.huan -= 1;
      await ctx.log(`【幻变】：消耗 1 张武将牌（剩余 ${p.marks.huan}），视为使用其中一个技能`);
      await ctx.draw(p, 2, { reason: 'huanbian' });
    },
  },
});

// 【化形】出牌阶段限一次：把等于体力的武将牌置于右侧，获得每张的第一个技能（近似为增益层数）
defineSkill({
  id: 'huaxing', name: '化形',
  desc: '出牌阶段限一次，你可以将等于你当前体力值的「武将牌」依次置于武将牌右侧，然后你获得每张牌的第一个技能。当你失去体力或死亡时，防止之并失去最右侧的一张「武将牌」；失去全部武将牌或出牌阶段开始时，你退出此效果。（实现：每层「化形」使你的摸牌阶段多摸 1 张；失去体力时消耗 1 层）',
  active: {
    perPhase: true,
    prompt: '化形（消耗武将牌换增益）',
    async effect(ctx) {
      const p = ctx.self;
      const need = p.hp;
      if ((p.marks.huan || 0) < need) { await ctx.log(`【化形】：武将牌不足（需要 ${need}）`); return; }
      p.marks.huan -= need;
      p.marks.huaxing = (p.marks.huaxing || 0) + need;
      await ctx.log(`【化形】：${p.name} 化形 ${need} 层（每层摸牌阶段多摸 1 张），剩余武将牌 ${p.marks.huan}`);
    },
  },
  triggers: [
    {
      on: 'hp.lose', who: 'self', optional: false,
      filter: (d) => (d.player?.marks?.huaxing || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.marks.huaxing -= 1;
        await ctx.log(`【化形】：失去 1 层化形（剩余 ${p.marks.huaxing}）`);
      },
    },
    {
      on: 'draw.count', who: 'self', optional: false,
      filter: (d) => (d.player?.marks?.huaxing || 0) > 0,
      effect(ctx) { ctx.data.count += ctx.self.marks.huaxing; },
    },
  ],
});

// ==================== 星·典韦 ====================
// 【诸武】准备阶段：若有空装备槽，弃一张牌（否则失去 1 点体力）并从牌堆底获得一张装备牌自动使用
defineSkill({
  id: 'zhuwu', name: '诸武',
  desc: '锁定技，当你使用装备技能时，你获得一个通用类技能，每槽至多触发一次。准备阶段，若你有空闲的装备栏，你可以弃置一张牌（否则失去 1 点体力），并获得牌堆底上一张装备牌，然后自动使用之。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const empty = ['weapon', 'armor', 'horsePlus', 'horseMinus', 'treasure'].filter(k => !p.equips[k] && !(p.flags.disabledEquip && p.flags.disabledEquip[k]));
      if (!empty.length) return;
      // 从牌堆底往上找第一张装备牌：直接在牌堆里 splice（deck[0] 为牌堆底），
      // 再 equipCard 置入装备区——equipCard 不会从手牌摘牌，先 gain 再装备会造成同牌双存。
      const idx = g.deck.findIndex(c => CARD_META[c.name]?.type === 'equip');
      const found = idx >= 0 ? g.deck.splice(idx, 1)[0] : null;
      if (!found) { await ctx.log('【诸武】：牌堆里没有装备牌'); return; }
      if (p.hand.length) {
        const res = await g.ask(p, 'cards', { prompt: '【诸武】：弃置一张牌获得该装备牌（取消＝失去 1 点体力）', cards: p.hand.map(c => c.id), min: 1, max: 1, optional: true });
        const c = (res?.cardIds || []).map(id => p.hand.find(x => x.id === id)).filter(Boolean)[0];
        if (c) {
          await ctx.discard(p, [c], { reason: 'zhuwu' });
        } else {
          await ctx.loseHp(p, 1, { reason: 'zhuwu' });
        }
      } else {
        await ctx.loseHp(p, 1, { reason: 'zhuwu' });
      }
      await ctx.log(`【诸武】：${p.name} 从牌堆底获得 ${cardLabel(found)} 并自动装备`);
      await g.equipCard(p, found);
    },
  }],
});

// 【威慑】装备区牌数 ≥ 体力值时，可弃 2 张牌获得一名角色一张牌，并使其下回合无法指定你
defineSkill({
  id: 'weixie', name: '威慑',
  desc: '当你同时触发了至少 X 个装备的效果于同一唯一目标，你可以弃置 2 张牌并获得其一张牌，并使该角色于你的下个准备阶段前指定你为目标时，你可以使其不再是目标。（实现：简化为你装备区的牌数达到体力值时，可弃 2 张牌获得一名角色一张牌，并使其本回合无法指定你为目标）',
  active: {
    prompt: '弃两张牌获得其一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const eqCount = Object.values(p.equips).filter(Boolean).length;
      if (eqCount < p.hp) { await ctx.log(`【威慑】：装备区牌数（${eqCount}）不足体力值（${p.hp}）`); return; }
      if (!onceRound(p, g, 'weixie')) { await ctx.log('【威慑】：本轮已发动过'); return; }
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (pool.length < 2) { await ctx.log('【威慑】：牌不足两张'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【威慑】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const res = await g.ask(p, 'cards', { prompt: '【威慑】：弃置两张牌', cards: pool.map(c => c.id), min: 2, max: 2 });
      const cost = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean).slice(0, 2);
      if (cost.length < 2) return;
      await ctx.discard(p, cost, { reason: 'weixie' });
      const got = await g.chooseCardFrom(p, t, { reason: 'weixie' });
      if (got) await ctx.gain(p, [got], { from: t, reason: 'weixie' });
      t.marks.weixieBlock = { from: p.id, round: roundOf(g) };
      await ctx.log(`【威慑】：${p.name} 获得 ${t.name} 一张牌，其本轮不能指定你为目标`);
    },
  },
});

// ==================== 星·南华老仙 ====================
// 【玄仙】受到伤害时防止，改为失去 1 点体力并获得【仙御】；造成伤害时获得星之识
defineSkill({
  id: 'xuanxian', name: '玄仙',
  desc: '持恒技、锁定技，当你受到伤害时，防止此伤害，改为失去 1 点体力并获得【仙御】；当你造成伤害时，你获得 X 点「星之识」（X 为对方体力高于你的点数，最小为 1）。',
  triggers: [
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => d.to === d.player && (d.amount || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        ctx.data.canceled = true;
        await ctx.log(`【玄仙】：防止 ${ctx.data.amount} 点伤害，改为失去 1 点体力并获得【仙御】`);
        p.marks.xianyu = true;
        await ctx.loseHp(p, 1, { reason: 'xuanxian' });
      },
    },
    {
      on: 'damage.after', who: 'self', optional: false,
      filter: (d) => d.from === d.player && d.to && d.to !== d.player,
      async effect(ctx) {
        const p = ctx.self, to = ctx.data.to;
        const x = Math.max(1, (to.hp || 0) - (p.hp || 0));
        p.marks.xingzhi = (p.marks.xingzhi || 0) + x;
        await ctx.log(`【玄仙】：获得 ${x} 点星之识（当前 ${p.marks.xingzhi}）`);
      },
    },
  ],
});

// 【识海】消耗 2 点星之识判定；装备牌重判，否则记录牌名并找到同名牌
defineSkill({
  id: 'shihai', name: '识海',
  desc: '持恒技，你可以消耗 2 点「星之识」并进行判定：若为装备牌或智囊，则重新判定；否则记录该牌名，然后从牌堆顶向下查找下一张同名牌，若找到，则从牌堆顶持续获得牌直到这张牌。',
  active: {
    prompt: '消耗 2 点星之识进行判定',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if ((p.marks.xingzhi || 0) < 2) { await ctx.log('【识海】：星之识不足 2 点'); return; }
      p.marks.xingzhi -= 2;
      let jd = null;
      for (let i = 0; i < 3; i++) {
        jd = await ctx.judge(p, { reason: 'shihai' });
        if (CARD_META[jd.card?.name]?.type === 'equip') {
          await ctx.log(`【识海】：判定为装备牌 ${cardLabel(jd.card)}，重新判定`);
          continue;
        }
        break;
      }
      if (!jd || !jd.card) return;
      const want = jd.card.name;
      await ctx.log(`【识海】：记录牌名「${CARD_META[want]?.cn || want}」，向下搜索同名牌`);
      const drawn = [];
      for (let i = 0; i < 8; i++) {
        const c = g.popDeck(1)[0];
        if (!c) break;
        drawn.push(c);
        if (c.name === want) break;
      }
      if (drawn.length) {
        await ctx.gain(p, drawn, { reason: 'shihai' });
        await ctx.log(`【识海】：翻到 ${drawn.length} 张（${drawn.map(c => CARD_META[c.name]?.cn || c.name).join('、')}）`);
      }
    },
  },
});

// 【仙御】视为拥有太平要术与八卦阵；受到致命伤害时防止并失去此技能
defineSkill({
  id: 'xianyu', name: '仙御',
  desc: '你视为同时拥有【太平要术】与【八卦阵】的效果。当你受到致命伤害时，你防止之并失去此技能。（实现：需要【闪】时可判定，红色视为打出【闪】；致命伤害防止一次）',
  triggers: [
    {
      // dodge.before 是 requireDodge 的判定出口（八卦阵同样走它），在同步事件里判定红色即视为闪
      on: 'dodge.before', who: 'self', optional: true,
      filter: (d) => d.self === d.player && !!d.player?.marks?.xianyu,
      async effect(ctx) {
        const p = ctx.self;
        if (ctx.data.dodged) return;
        const jd = await ctx.judge(p, { reason: 'xianyu' });
        const red = jd.suit === 'heart' || jd.suit === 'diamond';
        await ctx.log(`【仙御】：判定 ${cardLabel(jd.card)} → ${red ? '红色，视为打出【闪】' : '黑色，判定失败'}`);
        if (red) ctx.data.dodged = true;
      },
    },
    {
      on: 'damage.before', who: 'self', optional: false,
      filter: (d) => d.to === d.player && !!d.player?.marks?.xianyu && (d.amount || 0) >= (d.player.hp || 0),
      async effect(ctx) {
        const p = ctx.self;
        ctx.data.canceled = true;
        p.marks.xianyu = false;
        await ctx.log(`【仙御】：防止致命伤害，失去【仙御】`);
      },
    },
  ],
});

// ==================== 星·张角 ====================
// 【天雷】开局 2 雷之印；使用牌时可消耗 1 雷印为所有目标附加雷诅或雷随
defineSkill({
  id: 'tianlei', name: '天雷',
  desc: '游戏开始时，你获得 2 点「雷之印」。持恒技，当你使用牌时，你可以消耗 1 点「雷之印」，为所有目标分别选择附加【雷诅】或【雷随】。',
  triggers: [
    { on: 'game.start', who: 'any', optional: false, async effect(ctx) { ctx.self.marks.leiyin = 2; await ctx.log('【天雷】：获得 2 点雷之印'); } },
    {
      on: 'card.use.after', who: 'self', optional: true,
      filter: (d) => (d.self?.marks?.leiyin || 0) > 0 && Array.isArray(d.targets) && d.targets.length > 0,
      async effect(ctx) {
        const p = ctx.self;
        const targets = (ctx.data.targets || []).filter(t => t && t.alive && t !== p);
        if (!targets.length) return;
        p.marks.leiyin -= 1;
        for (const t of targets) {
          const idx = await ctx.ask.choose(p, ['附加【雷诅】（其受雷电伤害 +1）', '附加【雷随】（其用【杀】时与你拼点）'], { prompt: `【天雷】：为 ${t.name} 附加` });
          if (idx === 0) { t.marks.leizu = true; await ctx.log(`【天雷】：${t.name} 附加【雷诅】`); }
          else if (idx === 1) { t.marks.leisui = true; await ctx.log(`【天雷】：${t.name} 附加【雷随】`); }
        }
      },
    },
    {
      // 雷诅：受到雷电伤害 +1 并弃一张牌，然后失去
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => !!d.to?.marks?.leizu && d.nature === 'thunder',
      async effect(ctx) {
        const t = ctx.data.to;
        ctx.data.amount = (ctx.data.amount || 1) + 1;
        await ctx.log(`【雷诅】：${t.name} 受到雷电伤害 +1`);
      },
    },
    {
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.to?.marks?.leizu && d.nature === 'thunder',
      async effect(ctx) {
        const t = ctx.data.to, g = ctx.game;
        if (!t.alive) return;
        t.marks.leizu = false;
        if (t.hand.length) await ctx.discard(t, [t.hand[0]], { reason: 'leizu' });
        await ctx.log(`【雷诅】：${t.name} 弃置一张牌并失去【雷诅】`);
      },
    },
  ],
});

// 【雷雨】锁定：使用指定 ≥2 目标的牌时 +1 雷印；响应牌时若场上不足 3 人 +1（每回合限一次）
defineSkill({
  id: 'leiyu', name: '雷雨',
  desc: '锁定技，当你使用指定了至少 2 个目标的牌时，你获得 1 点「雷之印」；当你响应了一张牌时，若场上剩余角色不足 3 名，你获得 1 点「雷之印」（每回合限一次）。',
  triggers: [
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => Array.isArray(d.targets) && d.targets.filter(Boolean).length >= 2,
      async effect(ctx) {
        const p = ctx.self;
        p.marks.leiyin = (p.marks.leiyin || 0) + 1;
        await ctx.log(`【雷雨】：使用多目标牌，雷之印增至 ${p.marks.leiyin}`);
      },
    },
    {
      on: 'dodge.after', who: 'self', optional: false,
      filter: (d) => d.self === d.player && d.game.alive().length < 3 && d.player.flags.leiyuTurn !== d.game.turnCount,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.leiyuTurn = ctx.game.turnCount;
        p.marks.leiyin = (p.marks.leiyin || 0) + 1;
        await ctx.log(`【雷雨】：响应牌时全场不足 3 人，雷之印增至 ${p.marks.leiyin}`);
      },
    },
    {
      // 雷随：使用【杀】时与目标拼点，赢则造成 1 点雷电伤害并失去
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => (d.card?.name === 'sha' || d.asName === 'sha') && Array.isArray(d.targets) && d.targets.some(t => t?.marks?.leisui) && (d.self?.marks?.leiyin || 0) >= 1,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const t = (ctx.data.targets || []).find(x => x?.marks?.leisui);
        if (!t || !t.alive || !p.hand.length || !t.hand.length) return;
        const { pindian } = await import('../engine/pindian.js');
        const r = await pindian(g, p, t, { reason: '雷随' });
        if (!r || r.skip) return;
        if (r.win) {
          t.marks.leisui = false;
          p.marks.leiyin -= 1;
          await ctx.log(`【雷随】：拼点获胜，对 ${t.name} 造成 1 点雷电伤害`);
          await ctx.damage({ from: p, to: t, amount: 1, nature: 'thunder', card: null, reason: 'leisui' });
        }
      },
    },
  ],
});

// 雷诅 / 雷随：附加技能（供面板展示；实际判定看 marks，逻辑在【天雷】【雷雨】里）
defineSkill({ id: 'leizu', name: '雷诅', desc: '锁定技，当你受到雷电伤害时，伤害 +1 且弃置一张牌，然后失去此技能。' });
defineSkill({ id: 'leisui', name: '雷随', desc: '你使用或打出【杀】时，可与目标拼点，若获胜则失去此技能并对其造成 1 点雷电伤害。' });

// ==================== 星·吕布 ====================
// 【魔星】开局可降体力上限换魔之谕；回合开始获得魔之武，回合结束失去并摸等量牌
defineSkill({
  id: 'moxing', name: '魔星',
  desc: '游戏开始时，你可以降低 0~4 点体力上限，获得等量「魔之谕」。持恒技，回合开始时，你获得等于「魔之谕」数量的「魔之武」；回合结束时，你失去所有「魔之武」并摸等量牌。',
  triggers: [
    {
      on: 'game.start', who: 'any', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        const idx = await ctx.ask.choose(p, ['不降低体力上限', '降低 1 点', '降低 2 点', '降低 3 点', '降低 4 点'], { prompt: '【魔星】：降低体力上限换取魔之谕' });
        const n = Math.max(0, Math.min(4, idx));
        if (!n) { p.marks.mozhiyu = 0; return; }
        p.maxHp = Math.max(1, p.maxHp - n);
        p.hp = Math.min(p.hp, p.maxHp);
        p.marks.mozhiyu = n;
        await ctx.log(`【魔星】：体力上限 -${n}（现 ${p.maxHp}），获得 ${n} 点魔之谕`);
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        p.marks.mozhiwu = p.marks.mozhiyu || 0;
        if (p.marks.mozhiwu) await ctx.log(`【魔星】：获得 ${p.marks.mozhiwu} 点魔之武`);
      },
    },
    {
      // 死印（附加）：任意角色的结束阶段开始前，带死印者失去 1 点体力
      on: 'phase.begin', who: 'any', optional: false,
      filter: (d) => d.phase === 'end' && !!d.self?.marks?.siyin,
      async effect(ctx) {
        // ★SG037-r2：ctx.self 是「技能拥有者」，事件主体是 ctx.data.self。
        // 死印可以附加在任意角色身上，所以必须用事件主体（原写法读 d.player / ctx.self 永不生效）。
        const t = ctx.data.self;
        if (!t || !t.alive || t.marks.siyin === 'paid') return;
        await ctx.log(`【死印】：${t.name} 结束阶段失去 1 点体力`);
        await ctx.loseHp(t, 1, { reason: 'siyin' });
      },
    },
    {
      on: 'turn.end', who: 'self', optional: false,
      filter: (d) => (d.player?.marks?.mozhiwu || 0) > 0,
      async effect(ctx) {
        const p = ctx.self;
        const n = p.marks.mozhiwu || 0;
        p.marks.mozhiwu = 0;
        await ctx.log(`【魔星】：失去 ${n} 点魔之武，摸 ${n} 张牌`);
        await ctx.draw(p, n, { reason: 'moxing' });
      },
    },
  ],
});

// 【天武】消耗魔之武当任意牌使用；2 点且未被响应则附加死印
defineSkill({
  id: 'tianwu', name: '天武',
  desc: '你可以将 1 点「魔之武」当作任意一张非锦囊牌使用；持恒技，你可以将 2 点「魔之武」当作任意一张牌使用，且若其未被响应，你对一名攻击范围内的角色附加【死印】。（实现：按对一名角色造成 1 点伤害结算）',
  active: {
    prompt: '消耗魔之武造成伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const n = p.marks.mozhiwu || 0;
      if (n < 1) { await ctx.log('【天武】：没有魔之武'); return; }
      const opts = ['消耗 1 点魔之武：视为使用【杀】（1 点伤害）'];
      if (n >= 2) opts.push('消耗 2 点魔之武：视为使用任意牌（1 点伤害），未被响应则附加【死印】');
      const idx = await ctx.ask.choose(p, opts, { prompt: '【天武】：选择' });
      if (idx < 0) return;
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【天武】：选择目标' });
      if (!ts.length) return;
      const t = ts[0];
      if (idx === 0) {
        p.marks.mozhiwu -= 1;
        await ctx.log(`【天武】：消耗 1 点魔之武对 ${t.name} 使用【杀】`);
        await ctx.damage({ from: p, to: t, amount: 1, card: null, reason: 'tianwu' });
      } else {
        p.marks.mozhiwu -= 2;
        await ctx.log(`【天武】：消耗 2 点魔之武对 ${t.name} 视为使用一张牌`);
        const before = t.hp;
        await ctx.damage({ from: p, to: t, amount: 1, card: null, reason: 'tianwu' });
        if (t.alive && t.hp < before) {
          t.marks.siyin = true;
          await ctx.log(`【天武】：${t.name} 未响应，附加【死印】`);
        }
      }
    },
  },
});

// 【绝艺】濒死时弃全部魔之谕，回复至满体力并摸五张
defineSkill({
  id: 'jueyi', name: '绝艺',
  desc: '持恒技，当你进入濒死状态时，你可以弃置所有「魔之谕」，回复至满体力并摸五张牌。',
  triggers: [{
    on: 'dying.begin', who: 'self', optional: true,
    filter: (d) => (d.player?.marks?.mozhiyu || 0) > 0,
    async effect(ctx) {
      const p = ctx.self;
      p.marks.mozhiyu = 0;
      p.marks.mozhiwu = 0;
      p.hp = p.maxHp;
      await ctx.log(`【绝艺】：弃置所有魔之谕，回复至 ${p.maxHp} 点体力并摸五张牌`);
      await ctx.draw(p, 5, { reason: 'jueyi' });
    },
  }],
});

// 【死印】锁定：结束阶段失去 1 点体力（附加技能不在任何人的 skills 表里，
// 因此触发挂在【魔星】持有者身上，扫描全场带 siyin 标记的角色）
defineSkill({
  id: 'siyin', name: '死印',
  desc: '锁定技，结束阶段，你失去 1 点体力；你可以随时弃置两张牌，失去所有牌和此技能。',
});
