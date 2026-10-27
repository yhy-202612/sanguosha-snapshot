// 神话再临·山（SG010）：刘禅 / 张郃 / 邓艾 / 姜维 / 孙策 / 张昭张纮 / 蔡文姬
// （左慈的【化身】依赖 M11 化身机制，单独一批实现）
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, suitOf, isRedFor } from '../engine/cards.js';
import { GENERALS } from '../data/generals.js';

async function pickHand(ctx, player, test, prompt) {
  const cands = player.hand.filter(test);
  if (!cands.length) return null;
  const res = await ctx.game.ask(player, 'card', { prompt, cards: cands.map(c => c.id), optional: true, reason: 'skill' });
  if (!res || !res.cardId) return null;
  return cands.find(c => c.id === res.cardId) || null;
}

// 觉醒：给角色追加技能（技能对象来自注册表）
function awaken(p, ids) {
  for (const id of ids) {
    if (effSkills(p).some(s => s.id === id)) continue;
    const sk = getSkill(id);
    if (sk) p.skills.push(sk);
  }
}

// ================= 蜀 =================

// 刘禅 · 享乐（锁定技）：成为【杀】的目标时，使用者须弃置一张基本牌，否则此【杀】无效。
defineSkill({
  id: 'xiangle', name: '享乐',
  desc: '锁定技，当你成为【杀】的目标时，此【杀】的使用者须弃置一张基本牌，否则此【杀】对你无效。',
  triggers: [{
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => d.target === d.player && d.card && d.card.name === 'sha'
      && d.target !== d.self && d.self.alive !== false,
    async effect(ctx) {
      const from = ctx.data.self, me = ctx.self;
      const basics = from.hand.filter(c => CARD_META[c.name]?.type === 'basic');
      const c = basics.length
        ? (await ctx.game.ask(from, 'card', { prompt: '【享乐】：弃置一张基本牌，否则此【杀】无效', cards: basics.map(x => x.id), optional: true, reason: 'xiangle' }))
        : null;
      const pick = c && c.cardId ? basics.find(x => x.id === c.cardId) : null;
      if (pick) {
        await ctx.discard(from, [pick], { reason: 'xiangle' });
        await ctx.log(`【享乐】：${from.name} 弃置 ${cardLabel(pick)}，此【杀】生效`);
      } else {
        ctx.data.canceled = true;
        await ctx.log(`【享乐】：${from.name} 未弃置基本牌，此【杀】对 ${me.name} 无效`);
      }
    },
  }],
});

// 刘禅 · 放权：跳过出牌阶段，回合结束时令一名其他角色进行一个额外回合。
defineSkill({
  id: 'fangquan', name: '放权',
  desc: '你可以跳过出牌阶段，若如此做，回合结束时，你可以令一名其他角色进行一个额外的回合。',
  active: {
    perTurn: true,
    prompt: '跳过出牌阶段，回合结束时令一名其他角色获得额外回合',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【放权】：选择获得额外回合的角色' });
      if (!ts.length) return;
      ctx.skipPhase(p, 'play');
      p.flags.fangquanTarget = ts[0].seat;
      await ctx.log(`${p.name} 发动【放权】：跳过出牌阶段，回合结束时 ${ts[0].name} 获得一个额外回合`);
    },
  },
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'end' && d.self.flags.fangquanTarget != null,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const t = g.players[p.flags.fangquanTarget];
      p.flags.fangquanTarget = null;
      if (!t || !t.alive) return;
      g.queueExtraTurn(t);
      await ctx.log(`【放权】：${t.name} 将在本回合结束后获得一个额外回合`);
    },
  }],
});

// 刘禅 · 若愚（主公技·觉醒技）：体力为全场最少时加 1 点上限并回复 1 点体力，获得【激将】。
defineSkill({
  id: 'yuruo', name: '若愚',
  desc: '主公技，觉醒技，准备阶段，若你的体力值为全场最少（或之一），你加 1 点体力上限并回复 1 点体力，然后获得技能【激将】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => {
      const p = d.self;
      if (d.phase !== 'prepare' || !p.alive || p.flags.awaken_yuruo) return false;
      if (p.role !== 'lord' && !p.isLord) return false;
      const min = Math.min(...d.game.alive().map(x => x.hp));
      return p.hp <= min;
    },
    async effect(ctx) {
      const p = ctx.self;
      p.flags.awaken_yuruo = true;
      p.maxHp += 1;
      await ctx.recover(p, 1, { reason: 'yuruo' });
      awaken(p, ['jijiang']);
      await ctx.log(`${p.name} 觉醒【若愚】：体力上限 +1、回复 1 点体力，并获得【激将】`);
    },
  }],
});

// 姜维 · 挑衅：令攻击范围内一名其他角色选择对你使用【杀】，或令你弃置其一张牌。
defineSkill({
  id: 'tiaoxin', name: '挑衅',
  desc: '出牌阶段限一次，你可以令一名攻击范围内的其他角色选择一项：对你使用一张【杀】，或令你弃置其一张牌。',
  active: {
    perPhase: true,
    prompt: '令攻击范围内一名角色对你出【杀】，否则你弃其一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && g.inAttackRange(p, x));
      if (!cands.length) { await ctx.log('【挑衅】：攻击范围内没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【挑衅】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      const sha = t.hand.find(c => c.name === 'sha');
      const opts = sha ? ['对你使用一张【杀】', '令你弃置其一张牌'] : ['令你弃置其一张牌'];
      const i = await ctx.ask.choose(t, opts, { prompt: `【挑衅】：${p.name} 挑衅了你`, reason: 'tiaoxin' });
      if (i === 0 && sha) {
        await ctx.useCard({ from: t, card: sha, targets: [p], reason: 'tiaoxin' });
      } else {
        const pool = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        if (!pool.length) return;
        const c = pool[Math.floor(Math.random() * pool.length)];
        await ctx.discard(t, [c], { reason: 'tiaoxin' });
        await ctx.log(`【挑衅】：${p.name} 弃置了 ${t.name} 的 ${cardLabel(c)}`);
      }
    },
  },
});

// 姜维 · 志继（觉醒技）：准备阶段若没有手牌，减 1 点体力上限，获得【观星】。
defineSkill({
  id: 'zhiji', name: '志继',
  desc: '觉醒技，准备阶段，若你没有手牌，你减 1 点体力上限，然后获得技能【观星】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && d.self.alive && !d.self.flags.awaken_zhiji && d.self.hand.length === 0,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.awaken_zhiji = true;
      p.maxHp = Math.max(1, p.maxHp - 1);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      awaken(p, ['guanxing']);
      await ctx.log(`${p.name} 觉醒【志继】：体力上限 -1，并获得【观星】`);
    },
  }],
});

// ================= 魏 =================

// 张郃 · 巧变：准备阶段弃一张手牌，跳过摸牌阶段并获得至多两名角色各一张手牌。
defineSkill({
  id: 'qiaobian', name: '巧变',
  desc: '准备阶段，你可以弃置一张手牌，跳过本回合的摸牌阶段，然后获得至多两名其他角色各一张手牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && d.self.hand.length > 0 && d.game.alive().some(x => x !== d.self && (x.hand.length || Object.values(x.equips).some(Boolean))),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const c = await pickHand(ctx, p, () => true, '【巧变】：弃置一张手牌');
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'qiaobian' });
      ctx.skipPhase(p, 'draw');
      const cands = g.alive().filter(x => x !== p && (x.hand.length || Object.values(x.equips).some(Boolean)));
      const ts = await ctx.ask.targets(p, { min: 1, max: 2, candidates: cands, prompt: '【巧变】：选择至多两名角色，各获得其一张手牌' });
      for (const t of ts) {
        const c2 = await ctx.game.chooseCardFrom(p, t, { reason: 'qiaobian' });
        if (c2) await ctx.gain(p, [c2], { from: t, reason: 'qiaobian' });
      }
      await ctx.log(`${p.name} 发动【巧变】：跳过摸牌阶段，获得 ${ts.length} 名角色各一张牌`);
    },
  }],
});

// 邓艾 · 屯田：回合外失去牌后判定，非红桃则将判定牌置于武将牌上称为「田」。
defineSkill({
  id: 'tuntian', name: '屯田',
  desc: '当你于回合外失去牌后，你可以进行判定，若结果不为红桃，你将判定牌置于你的武将牌上，称为「田」。',
  triggers: [{
    on: 'cards.discard', who: 'self', optional: true,
    filter: (d) => d.self !== d.game.turnPlayer && d.self.alive,
    async effect(ctx) {
      const p = ctx.self;
      const j = await ctx.judge(p, { reason: '屯田' });
      if (j.suit === 'heart') {
        await ctx.log(`【屯田】：判定为红桃，不获得「田」`);
        return;
      }
      p.tian = p.tian || [];
      // 判定牌在 judge() 里已进弃牌堆，直接取判定结果里的牌对象（取不到则造一张虚拟「田」占位）
      const jc = j.card;
      if (jc) {
        const di = ctx.game.discardPile.indexOf(jc);
        if (di >= 0) ctx.game.discardPile.splice(di, 1);
        p.tian.push(jc);
      } else {
        p.tian.push({ id: `tian${Date.now()}`, name: 'tian', suit: j.suit, num: j.num, virtual: true });
      }
      await ctx.log(`${p.name} 发动【屯田】：获得 1 张「田」（共 ${p.tian.length} 张）`);
    },
  }],
});

// 邓艾 · 凿险（觉醒技）：准备阶段若「田」≥3，减 1 点体力上限并获得【急袭】。
defineSkill({
  id: 'zaoxian', name: '凿险',
  desc: '觉醒技，准备阶段，若你的「田」不少于 3 张，你减 1 点体力上限，然后获得技能【急袭】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && d.self.alive && !d.self.flags.awaken_zaoxian && (d.self.tian || []).length >= 3,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.awaken_zaoxian = true;
      p.maxHp = Math.max(1, p.maxHp - 1);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      awaken(p, ['jixi']);
      await ctx.log(`${p.name} 觉醒【凿险】：体力上限 -1，并获得【急袭】`);
    },
  }],
});

// 邓艾 · 急袭：移去一张「田」，视为对一名其他角色使用【顺手牵羊】。
defineSkill({
  id: 'jixi', name: '急袭',
  desc: '出牌阶段限一次，你可以移去一张「田」，视为对一名距离 1 以内的其他角色使用一张【顺手牵羊】。',
  active: {
    perPhase: true,
    prompt: '移去一张「田」，视为使用【顺手牵羊】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const tian = p.tian || [];
      if (!tian.length) { await ctx.log('【急袭】：没有「田」'); return; }
      const cands = g.alive().filter(x => x !== p && g.distance(p, x) <= 1 && (x.hand.length || Object.values(x.equips).some(Boolean)));
      if (!cands.length) { await ctx.log('【急袭】：距离 1 内没有可选目标'); return; }
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【急袭】：选择目标（视为顺手牵羊）' });
      if (!ts.length) return;
      const moved = tian.slice(0, 1);
      p.tian = tian.slice(1);
      // 「田」被移去 = 移出游戏（不入弃牌堆），必须显式记账，否则牌凭空消失不可校验
      if (moved.length && !moved[0].virtual) g.exileCards(moved);
      const c = await g.chooseCardFrom(p, ts[0], { reason: 'jixi' });
      if (c) await ctx.gain(p, [c], { from: ts[0], reason: 'jixi' });
      await ctx.log(`${p.name} 发动【急袭】：移去 1 张「田」，获得 ${ts[0].name} 的 ${c ? cardLabel(c) : '（未获得牌）'}`);
    },
  },
});

// ================= 吴 =================

// 孙策 · 激昂：使用红色【杀】或【决斗】、或被【决斗】/红色【杀】指定为目标时，摸一张牌。
defineSkill({
  id: 'jiangji', name: '激昂',
  desc: '每当你使用（指定目标后）或被指定为【决斗】或红色【杀】的目标后，你可以摸一张牌。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => {
      const c = d.card;
      if (!c) return false;
      const isSha = c.name === 'sha' && isRedFor(d.self || d.player, c);
      const isJuedou = c.name === 'juedou';
      if (!isSha && !isJuedou) return false;
      return d.self === d.player || d.target === d.player;
    },
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'jiangji' });
      await ctx.log(`${ctx.self.name} 发动【激昂】，摸一张牌`);
    },
  }],
});

// 孙策 · 魂姿（觉醒技）：准备阶段若体力为 1，减 1 点体力上限，获得【英姿】与【英魂】。
defineSkill({
  id: 'hunzi', name: '魂姿',
  desc: '觉醒技，准备阶段，若你的体力值为 1，你减 1 点体力上限，然后获得技能【英姿】和【英魂】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && d.self.alive && !d.self.flags.awaken_hunzi && d.self.hp === 1,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.awaken_hunzi = true;
      p.maxHp = Math.max(1, p.maxHp - 1);
      if (p.hp > p.maxHp) p.hp = p.maxHp;
      awaken(p, ['yingzi', 'yinghun']);
      await ctx.log(`${p.name} 觉醒【魂姿】：体力上限 -1，并获得【英姿】【英魂】`);
    },
  }],
});

// 孙策 · 制霸（主公技，简化实现）：出牌阶段限一次，你可以与一名吴势力角色拼点，若你赢，获得双方拼点的牌。
defineSkill({
  id: 'zhiba', name: '制霸',
  desc: '主公技（简化实现），出牌阶段限一次，你可以与一名吴势力角色拼点：若你赢，你获得双方拼点的牌。',
  active: {
    perPhase: true,
    prompt: '与一名吴势力角色拼点，赢则获得双方拼点的牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive().filter(x => x !== p && x.kingdom === 'wu' && x.hand.length && p.hand.length);
      if (!cands.length) { await ctx.log('【制霸】：没有可拼点的吴势力角色'); return; }
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【制霸】：选择一名吴势力角色拼点' });
      if (!ts.length) return;
      const { pindian } = await import('../engine/pindian.js');
      const r = await pindian(g, p, ts[0], { reason: '制霸' });
      if (r.win && r.a && r.b) {
        // 拼点牌已在弃牌堆，先从所有区域摘下再获得，否则会与弃牌堆双存
        for (const c of [r.a, r.b]) if (c) await g.takeCard(c);
        await ctx.gain(p, [r.a, r.b], { reason: 'zhiba' });
        await ctx.log(`${p.name} 发动【制霸】拼点获胜，获得双方拼点的牌`);
      }
    },
  },
});

// 张昭张纮 · 直谏：将一张装备牌置入一名其他角色的装备区，然后摸一张牌。
defineSkill({
  id: 'zhijian', name: '直谏',
  desc: '出牌阶段限一次，你可以将一张装备牌置入一名其他角色的装备区（视为其使用），然后摸一张牌。',
  active: {
    perPhase: true,
    prompt: '把一张装备牌置入其他角色的装备区，然后摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const equips = p.hand.filter(c => CARD_META[c.name]?.sub);
      if (!equips.length) { await ctx.log('【直谏】：没有装备牌'); return; }
      const cands = g.alive().filter(x => x !== p);
      if (!cands.length) return;
      const ts = await ctx.ask.targets(p, { min: 1, max: 1, candidates: cands, prompt: '【直谏】：选择置入装备的角色' });
      if (!ts.length) return;
      const c = await pickHand(ctx, p, x => CARD_META[x.name]?.sub, '【直谏】：选择一张装备牌');
      if (!c) return;
      const slot = CARD_META[c.name].sub;
      const t = ts[0];
      p.hand = p.hand.filter(x => x !== c);
      const old = t.equips[slot];
      if (old) await g.discardCards(t, [old], { reason: 'zhijian' });
      t.equips[slot] = c;
      await g.trigger('equip.change', { self: t, slot, card: c, old: old || null });
      await ctx.draw(p, 1, { reason: 'zhijian' });
      await ctx.log(`${p.name} 发动【直谏】：将 ${cardLabel(c)} 置入 ${t.name} 的装备区，然后摸一张牌`);
    },
  },
});

// 张昭张纮 · 固政：其他角色弃牌阶段结束时，可将其中一张交还给他，然后你获得其余的牌。
defineSkill({
  id: 'guzheng', name: '固政',
  desc: '其他角色的弃牌阶段结束时，你可以将此阶段中该角色弃置的一张牌交给该角色，然后你获得其余以此法弃置的牌。',
  triggers: [
    {
      on: 'cards.discard', who: 'any', optional: false,
      filter: (d) => d.self !== d.player && d.game.phase === 'discard' && Array.isArray(d.cards) && d.cards.length > 0,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.gzPool = p.flags.gzPool || [];
        p.flags.gzPool.push({ owner: ctx.data.self.seat, cards: [...ctx.data.cards] });
      },
    },
    {
      on: 'phase.end', who: 'any', optional: true,
      filter: (d) => d.phase === 'discard' && d.self !== d.player && (d.player.flags.gzPool || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, owner = ctx.data.self;
        const pool = p.flags.gzPool || [];
        const entry = pool.find(e => e.owner === owner.seat);
        p.flags.gzPool = pool.filter(e => e !== entry);
        if (!entry || !entry.cards.length) return;
        const back = entry.cards[0];
        const rest = entry.cards.slice(1);
        await ctx.gain(owner, [back], { from: p, reason: 'guzheng' });
        if (rest.length) await ctx.gain(p, rest, { reason: 'guzheng' });
        await ctx.log(`${p.name} 发动【固政】：交还 ${owner.name} 1 张牌，获得其余 ${rest.length} 张`);
      },
    },
  ],
});

// ================= 群 =================

// 蔡文姬 · 悲歌：一名角色受到【杀】造成的伤害后，可弃一张牌令其判定，按花色产生效果。
defineSkill({
  id: 'beige', name: '悲歌',
  desc: '每当一名角色受到【杀】造成的伤害后，你可以弃置一张牌，令其进行判定：红桃——回复 1 点体力；方块——摸两张牌；梅花——伤害来源弃置两张牌；黑桃——伤害来源翻面。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.card && d.card.name === 'sha' && (d.amount || 0) > 0 && d.self.alive !== false
      && [...d.player.hand, ...Object.values(d.player.equips).filter(Boolean)].length > 0,
    async effect(ctx) {
      const p = ctx.self, victim = ctx.data.self, from = ctx.data.from;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      const res = await ctx.game.ask(p, 'card', { prompt: '【悲歌】：弃置一张牌发动', cards: pool.map(c => c.id), optional: true, reason: 'beige' });
      const c = res && res.cardId ? pool.find(x => x.id === res.cardId) : null;
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'beige' });
      const j = await ctx.judge(victim, { reason: '悲歌' });
      const suit = j.suit;
      if (suit === 'heart') {
        await ctx.recover(victim, 1, { reason: 'beige' });
      } else if (suit === 'diamond') {
        await ctx.draw(victim, 2, { reason: 'beige' });
      } else if (suit === 'club' && from) {
        const hand = from.hand.slice(0, 2);
        if (hand.length) await ctx.discard(from, hand, { reason: 'beige' });
      } else if (suit === 'spade' && from) {
        await ctx.flip(from);
      }
      await ctx.log(`${p.name} 发动【悲歌】：判定 ${suit}`);
    },
  }],
});

// 蔡文姬 · 断肠（锁定技）：死亡时，杀死你的角色失去所有技能。
defineSkill({
  id: 'duanchang', name: '断肠',
  desc: '锁定技，当你死亡时，杀死你的角色失去所有技能。',
  triggers: [{
    on: 'death.before', who: 'self', optional: false,
    filter: (d) => !!d.killer && d.killer !== d.self,
    async effect(ctx) {
      const k = ctx.data.killer;
      const n = effSkills(k).length;
      await ctx.game.removeSkills(k, null);   // ★走统一出口：删技能 + 回收该角色技能私有容器里的牌（SG029 BLOCKER-2）
      await ctx.log(`${ctx.self.name} 发动【断肠】：${k.name} 失去全部 ${n} 个技能`);
    },
  }],
});

// ===================== 左慈 · 化身 / 新生（M11 简化版） =====================
// 口径：化身牌池 = 全部已实装武将的技能（排除左慈自身技能与降级技能）；
// 游戏开始时随机获得 2 张化身牌并自动启用第一张；每回合最多更换化身技能一次；
// 化身牌上限 5 张（新生补充）。势力/性别「视为」简化不实现（单将身份局无影响）。
const HS_OWN = new Set(['huashen', 'xinsheng']);
const HS_MAX = 5;

function hsPool() {
  const out = [];
  for (const g of GENERALS) {
    if (g.id === 'zuoci') continue;
    for (const sid of effSkills(g) || []) {
      if (HS_OWN.has(sid) || out.includes(sid)) continue;
      const sk = getSkill(sid);
      if (!sk || sk.fallbackOf) continue;
      out.push(sid);
    }
  }
  return out;
}

function hsState(p) {
  if (!p.flags.huashen) p.flags.huashen = { cards: [], active: null, changedTurn: -1 };
  return p.flags.huashen;
}

// ★SG030 A2：更换化身技能 = 失去旧技能，必须走 removeSkills（只回收该技能的容器）
async function hsSetActive(p, sid, g) {
  const st = hsState(p);
  if (st.active && st.active !== sid) {
    if (g && typeof g.removeSkills === 'function') await g.removeSkills(p, [st.active]);
    else p.skills = (p.skills || []).filter(s => s.id !== st.active);
  }
  st.active = sid || null;
  if (st.active) {
    const sk = getSkill(st.active);
    if (sk && !(effSkills(p) || []).some(s => s.id === sk.id)) p.skills.push(sk);
  }
}

function hsDraw(p, g, n) {
  const st = hsState(p);
  const pool = hsPool().filter(sid => !st.cards.includes(sid));
  if (!pool.length) return [];
  const picked = g.rng.shuffle(pool.slice()).slice(0, n);
  for (const sid of picked) if (st.cards.length < HS_MAX) st.cards.push(sid);
  return picked;
}

const hsName = (sid) => (getSkill(sid)?.name || sid);

defineSkill({
  id: 'huashen', name: '化身',
  desc: '锁定技，游戏开始时你随机获得两张化身牌并选择其中一个技能作为你的化身技能；每当你受到 1 点伤害后，你可以更换化身技能。',
  triggers: [
    {
      on: 'game.start', who: 'any',
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const st = hsState(p);
        const got = hsDraw(p, g, 2);
        if (!got.length) { await ctx.log('【化身】：没有可用的化身牌'); return; }
        await ctx.log(`【化身】：获得化身牌 ${got.map(hsName).join('、')}`);
        await hsSetActive(p, got[0], g);
        await ctx.log(`【化身】：化为 ${hsName(got[0])}`);
      },
    },
    {
      on: 'damage.after', who: 'self',
      filter: (d) => {
        const st = d.player.flags.huashen;
        return !!st && st.cards.length > 0 && d.player.flags.huashenChangedTurn !== d.game.turnCount;
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const st = hsState(p);
        p.flags.huashenChangedTurn = g.turnCount;
        const opts = ['不更换', ...st.cards.map(sid => `化身·${hsName(sid)}`)];
        const idx = await ctx.ask.choose(p, opts, { prompt: '【化身】：是否更换化身技能？' });
        if (!(idx > 0)) return;
        const sid = st.cards[idx - 1];
        if (!sid || sid === st.active) return;
        await hsSetActive(p, sid, g);
        await ctx.log(`【化身】：更换化身技能为 ${hsName(sid)}`);
      },
    },
  ],
});

defineSkill({
  id: 'xinsheng', name: '新生',
  desc: '每当你受到 1 点伤害后，你可以获得一张新的化身牌（至多 5 张）。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => (d.player.flags.huashen?.cards?.length || 0) < HS_MAX,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const got = hsDraw(p, g, 1);
      if (!got.length) { await ctx.log('【新生】：没有可用的化身牌了'); return; }
      await ctx.log(`【新生】：获得化身牌 ${hsName(got[0])}`);
    },
  }],
});

export const SHAN_SKILL_IDS = ['xiangle', 'fangquan', 'yuruo', 'tiaoxin', 'zhiji', 'qiaobian', 'tuntian',
  'zaoxian', 'jixi', 'jiangji', 'hunzi', 'zhiba', 'zhijian', 'guzheng', 'beige', 'duanchang',
  'huashen', 'xinsheng'];
