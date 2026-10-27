// 阶段 6D · 群英荟萃·补全 22 将（pack = 'qunying2'，PACK_CN = 「群英荟萃·补全」）技能实现
// ---------------------------------------------------------------------------
// 孔融【礼让】【名士】      曹节【守节*】【椒房*】  王朗【鼓舌】【矜辞*】
// 阚泽【下书】【宽释】      嵇康【清弦】【绝响】    纪灵【双刃】
// 司马徽【荐杰】【隐士】    田丰【随势】【死谏】    陈琳【笔伐】【颂词】
// 王粲【登楼*】【七哀*】    关银屏【血祭】【虎啸】  刘协【天命】【密诏】
// 邹氏【祸水】【倾城】      甘夫人【淑慎】【神智】  诸葛瑾【弘援】【缓释】
// 刘焉【图射】【立牧*】     审配【刚直】【备战】    蒋干【伪诚】【盗书】
// 文聘【镇卫】              马良【自书】【应援】    李典【恂恂】【勇决*】
// 沙摩柯【蒺藜】【蛮袭*】
//
// 注：本包不含「芝兰玉树」子包武将（原曹叡已让位 6E 一将成名线，该子包由 6E 独占）。
//   （带 * 者为「自拟」技能名，其余均为官方名；官方边缘条款引擎无法表达时按 desc 如实降级）
//
// 技能 id 一律使用 qy2s_ 前缀（不使用 jie_/mou_/ji_/shen_/sp_/ol_，避免被引擎静默降级别名）。
//
// ★★ 资料核实与简化/自拟口径（desc 一律写成「本实现的实际效果」）★★
//  1. 孔融【礼让】：官方为「因弃置而失去牌后，可将其中的一张交给其他角色」。引擎的 cards.discard
//     事件在牌真正离开手牌前触发，直接转移会在弃牌堆留下重影，故降级为「弃置后可将另一张手牌交给
//     一名其他角色，然后摸一张牌」，代价与收益总量等价（-1 手牌 → 交给他人 1，自己摸 1）。
//  2. 孔融【名士】：官方为「锁定技，你不能成为黑色锦囊牌的目标」（部分版本为「黑色牌伤害-1」），
//     本实现取后者且限定【杀】：黑色【杀】造成的伤害 -1。
//  3. 曹节【守节】：**自拟**（汉室皇后护玺守节之意）。成为【杀】或【决斗】的目标时，可弃一张手牌
//     取消此牌对你的结算（走 target.before + data.canceled 这一引擎既有取消出口）。
//  4. 曹节【椒房】：**自拟**。锁定技，你的手牌上限 +1（写入引擎 player.flags.handLimit，弃牌阶段读取）。
//  5. 王朗【鼓舌】：官方拼点框架，胜则获得其一张手牌，没赢则弃置自己一张手牌。
//  6. 王朗【矜辞】：**自拟**（无可靠资料）。当你受到其他角色造成的伤害后，令伤害来源弃置一张手牌，
//     其没有手牌则你摸一张牌。
//  7. 阚泽【下书】：交出一张手牌后，由对方二选一（回交一张手牌 / 令你摸一张牌）。
//  8. 阚泽【宽释】：官方为濒死救援，本实现为「一名角色进入濒死时，可弃一张手牌令其回复 1 点体力」。
//  9. 嵇康【清弦】：弃一张手牌，令一名角色二选一（回复 1 点体力 / 摸两张牌）；体力已满时第一项改为摸一张。
// 10. 嵇康【绝响】：官方为死亡时点（觉醒/传承类），本实现为「死亡后令所有其他角色各弃置一张手牌」。
// 11. 纪灵【双刃】：官方为「拼点，胜者视为对对方使用【杀】」，引擎内避免二次 useCard 换手数，
//     本实现直接结算 1 点伤害（赢）/自身失去 1 点体力（没赢）。
// 12. 司马徽【荐杰】：令一名其他角色摸两张牌，然后其须交给你一张手牌。
// 13. 司马徽【隐士】：锁定技，你没有手牌时不能成为【杀】或【决斗】的目标（target.before 取消）。
// 14. 田丰【随势】：每回合限一次（引擎 once:'turn'），一名角色造成伤害后你摸一张牌。
// 15. 田丰【死谏】：官方为「失去最后一张手牌后弃置一名其他角色一张牌」，引擎的 hand.change 会在
//     手牌数不变时重复触发，故加「每回合限一次」防抖（desc 已写明）。
// 16. 陈琳【笔伐】：扣置一张手牌于目标武将牌旁，其回合开始时若不交出一张手牌则受到 1 点伤害。
// 17. 陈琳【颂词】：一名角色死亡后，可令一名角色摸两张牌（官方「弃两张/回血」分支按摸两张统一）。
// 18. 关银屏【血祭】：弃一张红色手牌，对一名其他角色造成 1 点伤害。
// 19. 关银屏【虎啸】：锁定技，你使用【杀】造成伤害后摸一张牌。
// 20. 刘协【天命】：成为【杀】目标后，弃置两张牌（不足则全弃）然后摸两张牌。
// 21. 刘协【密诏】：将所有手牌交给一名其他角色，然后令其与另一名其他角色拼点；前者赢你摸两张，
//     没赢你弃一张手牌（官方「赢者视为使用【杀】」未接）。
// 22. 王粲【登楼】：**自拟**（用《登楼赋》典）。弃一张手牌摸两张，已受伤改为摸三张。
// 23. 王粲【七哀】：**自拟**（用《七哀诗》典）。受到伤害后摸一张；手牌数大于体力值则再弃一张。
// 24. 邹氏【祸水】：令一名男性角色（无男性时改为任意其他角色）二选一（弃一张手牌 / 令你摸一张牌）。
// 25. 邹氏【倾城】：锁定技，男性角色计算与你的距离 +1（distance.calc）。
// 26. 甘夫人【淑慎】：你回复体力后，可令一名其他角色摸一张牌。
// 27. 甘夫人【神智】：弃一张手牌，令一名已受伤角色回复 1 点体力。
// 28. 诸葛瑾【弘援】：摸牌阶段可令一名其他角色摸两张牌，但你本阶段少摸一张（引擎 skip_one_draw）。
// 29. 诸葛瑾【缓释】：判定牌生效前，可弃一张手牌替换该判定牌（改写 suit/num）。
// 30. 刘焉【图射】：使用【杀】或非延时锦囊牌后，可摸一张牌然后弃置一张手牌。
// 31. 刘焉【立牧】：**自拟**（官方立牧为「弃置装备当牧」）。将一张手牌扣置为「牧」，出牌阶段结束时
//     收回全部「牧」并摸等量的牌。
// 32. 审配【刚直】：受到伤害后，令伤害来源弃一张手牌，否则其失去 1 点体力。
// 33. 审配【备战】：弃一张手牌，令一名角色摸两张牌。
// 34. 蒋干【伪诚】：受到伤害后，由伤害来源二选一（交给你一张手牌 / 令你摸一张牌）。
// 35. 蒋干【盗书】：获得一名其他角色一张手牌；黑色则摸一张，红色则你失去 1 点体力。
// 36. 李典【恂恂】：沿用官方技能名，效果为本实现口径（给牌换摸牌的「恂恂」风格），非原版摸牌堆顶。
// 37. 李典【勇决】：**自拟**。你的【杀】对一名其他角色造成伤害后，可弃置其一张牌。
// 38. 马良【自书】：锁定技，当你于摸牌阶段外获得牌后，你摸一张牌。
// 39. 马良【应援】：每回合限一次，你使用一张牌后，可令一名其他角色摸一张牌。
// 40. 文聘【镇卫】：锁定技，其他角色计算与你的距离 +1。
// 41. 沙摩柯【蒺藜】：每回合限一次，当你于回合外使用牌后，你可以摸一张牌。
// 42. 沙摩柯【蛮袭】：**自拟**。出牌阶段限一次，弃一张手牌对一名其他角色造成 1 点伤害。
// ---------------------------------------------------------------------------
import { defineSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';
import { pindian } from '../engine/pindian.js';

// ------------------------------ 公用小工具 ------------------------------
let vseq = 0;
const isRedC = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const isBlackC = (c) => !!c && (c.suit === 'spade' || c.suit === 'club');
const zonesOf = (p) => [
  ...(p?.hand || []),
  ...Object.values(p?.equips || {}).filter(Boolean),
  ...((p?.judgeZone || []).map(z => z.card).filter(Boolean)),
];
const others = (g, p) => g.alive().filter(x => x !== p);
const equipsOf = (p) => Object.values(p?.equips || {}).filter(Boolean);
const withCards = (g, p) => others(g, p).filter(x => zonesOf(x).length > 0);
const takable = (s) => !!(s && s.hand && s.hand.length);

// ============================================================
// 孔融 · 礼让 / 名士
// ============================================================
defineSkill({
  id: 'qy2s_lirang', name: '礼让',
  desc: '当你因弃置而失去牌后，你可以将另一张手牌交给一名其他角色，然后摸一张牌。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: true,
    filter: (d) => d.self === d.player && (d.cards || []).length > 0 && d.reason !== 'lirang'
      && d.player.alive !== false && others(d.game, d.player).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const cands = p.hand.filter(c => !d.cards.includes(c));
      if (!cands.length) { await ctx.log('【礼让】：没有其他手牌可交出'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【礼让】：选择获得你一张手牌的角色', candidates: others(g, p), min: 1, max: 1, reason: 'lirang',
      });
      const t = ts[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, cands, 1, { prompt: '【礼让】：选择交出的手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.gain(t, [c], { from: p, reason: 'lirang' });
      await ctx.draw(p, 1, { reason: 'lirang' });
      await ctx.log(`【礼让】：${p.name} 将 ${cardLabel(c)} 交给 ${t.name}，然后摸一张牌`);
    },
  }],
});

defineSkill({
  id: 'qy2s_mingshi', name: '名士',
  desc: '锁定技，黑色【杀】对你造成的伤害 -1。',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => d.self === d.player && !!d.card && d.card.name === 'sha' && isBlackC(d.card)
      && (d.amount || 0) > 0,
    async effect(ctx) {
      ctx.data.amount = Math.max(0, ctx.data.amount - 1);
      await ctx.log(`【名士】：黑色【杀】造成的伤害 -1（${ctx.self.name}）`);
    },
  }],
});

// ============================================================
// 王朗 · 鼓舌 / 矜辞（自拟）
// ============================================================
defineSkill({
  id: 'qy2s_gushe', name: '鼓舌',
  desc: '出牌阶段限一次，你可以与一名其他角色拼点：若你赢，你获得其一张手牌；若你没赢，你弃置一张手牌。',
  active: {
    perPhase: true,
    prompt: '与一名其他角色拼点：赢则获得其一张手牌，没赢则弃置一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【鼓舌】：你没有手牌可拼点'); return; }
      const cands = others(g, p).filter(x => x.hand.length > 0);
      if (!cands.length) { await ctx.log('【鼓舌】：没有可拼点的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【鼓舌】：选择拼点角色', candidates: cands, min: 1, max: 1, reason: 'gushe',
      });
      const t = ts[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: '鼓舌' });
      if (r.skip) return;
      if (r.win) {
        if (takable(t)) {
          const picks = await g.chooseSomeCards(p, t.hand.slice(), 1, { prompt: `【鼓舌】：获得 ${t.name} 一张手牌` });
          const c = picks[0];
          if (c) await ctx.gain(p, [c], { from: t, reason: 'gushe' });
        }
        await ctx.log(`【鼓舌】：${p.name} 拼点获胜，获得 ${t.name} 一张手牌`);
      } else {
        if (p.hand.length) {
          const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【鼓舌】：没赢，弃置一张手牌' });
          if (picks[0]) await ctx.discard(p, [picks[0]], { reason: 'gushe' });
        }
        await ctx.log(`【鼓舌】：${p.name} 拼点没赢，弃置一张手牌`);
      }
    },
  },
});

defineSkill({
  id: 'qy2s_jinci', name: '矜辞',
  desc: '当你受到其他角色造成的伤害后，你可以令伤害来源弃置一张手牌；若其没有手牌，你摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && !!d.from && d.from !== d.player && d.from.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, src = ctx.data.from;
      if (src.hand.length) {
        const picks = await g.chooseSomeCards(src, src.hand.slice(), 1, { prompt: '【矜辞】：弃置一张手牌' });
        if (picks[0]) await ctx.discard(src, [picks[0]], { reason: 'jinci' });
        await ctx.log(`【矜辞】：${src.name} 弃置一张手牌`);
      } else {
        await ctx.draw(p, 1, { reason: 'jinci' });
        await ctx.log(`【矜辞】：${src.name} 没有手牌，${p.name} 摸一张牌`);
      }
    },
  }],
});

// ============================================================
// 阚泽 · 下书 / 宽释
// ============================================================
defineSkill({
  id: 'qy2s_xiashu', name: '下书',
  desc: '出牌阶段限一次，你可以将一张手牌交给一名其他角色，然后该角色选择一项：交给你一张手牌；或令你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '将一张手牌交给一名其他角色，再由其选择回交一张手牌或令你摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【下书】：你没有手牌可交出'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【下书】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【下书】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'xiashu',
      });
      const t = ts[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【下书】：选择交出的手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.gain(t, [c], { from: p, reason: 'xiashu' });
      await ctx.log(`【下书】：${p.name} 将 ${cardLabel(c)} 交给 ${t.name}`);
      const idx = await ctx.ask.choose(t, ['交给你一张手牌', '令你摸一张牌'], { prompt: '【下书】：请选择一项', reason: 'xiashu' });
      if (idx === 0) {
        if (!t.hand.length) {
          await ctx.draw(p, 1, { reason: 'xiashu' });
          await ctx.log(`【下书】：${t.name} 没有手牌，改为 ${p.name} 摸一张牌`);
          return;
        }
        const back = await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: `【下书】：交给 ${p.name} 一张手牌` });
        const c2 = back[0];
        if (c2) await ctx.gain(p, [c2], { from: t, reason: 'xiashu' });
        await ctx.log(`【下书】：${t.name} 回交给 ${p.name} 一张手牌`);
      } else if (idx === 1) {
        await ctx.draw(p, 1, { reason: 'xiashu' });
        await ctx.log(`【下书】：${p.name} 摸一张牌`);
      } else {
        await ctx.log('【下书】：对方取消选择，本次无效');
      }
    },
  },
});

defineSkill({
  id: 'qy2s_kuanshi', name: '宽释',
  desc: '当一名其他角色进入濒死状态时，你可以弃置一张手牌，令其回复 1 点体力。',
  triggers: [{
    on: 'dying.begin', who: 'any', optional: true,
    filter: (d) => d.self !== d.player && d.self.alive !== false && d.player.alive !== false
      && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.self;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【宽释】：弃置一张手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'kuanshi' });
      if (t.hp < t.maxHp) await ctx.recover(t, 1, { reason: 'kuanshi' });
      await ctx.log(`【宽释】：${p.name} 弃置一张手牌，${t.name} 回复 1 点体力`);
    },
  }],
});

// ============================================================
// 嵇康 · 清弦 / 绝响
// ============================================================
defineSkill({
  id: 'qy2s_qingxian', name: '清弦',
  desc: '出牌阶段限一次，你可以弃置一张手牌，令一名角色选择一项：回复 1 点体力；或摸两张牌（体力已满时改为摸一张牌）。',
  active: {
    perPhase: true,
    prompt: '弃置一张手牌，令一名角色回复体力或摸牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【清弦】：你没有手牌'); return; }
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【清弦】：弃置一张手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'qingxian' });
      const ts = await ctx.ask.targets(p, {
        prompt: '【清弦】：选择一名角色', candidates: g.alive(), min: 1, max: 1, reason: 'qingxian',
      });
      const t = ts[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, ['回复 1 点体力', '摸两张牌'], { prompt: '【清弦】：请选择一项', reason: 'qingxian' });
      if (idx === 1) {
        await ctx.draw(t, 2, { reason: 'qingxian' });
        await ctx.log(`【清弦】：${t.name} 摸两张牌`);
      } else if (idx === 0) {
        if (t.hp < t.maxHp) {
          await ctx.recover(t, 1, { reason: 'qingxian' });
          await ctx.log(`【清弦】：${t.name} 回复 1 点体力`);
        } else {
          await ctx.draw(t, 1, { reason: 'qingxian' });
          await ctx.log(`【清弦】：${t.name} 体力已满，改为摸一张牌`);
        }
      } else {
        await ctx.log('【清弦】：目标取消选择，本次无效');
      }
    },
  },
});

defineSkill({
  id: 'qy2s_juexiang', name: '绝响',
  desc: '当你死亡后，你可以令所有其他角色各弃置一张手牌。',
  triggers: [{
    on: 'death.after', who: 'any', optional: true,
    filter: (d) => d.self === d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      for (const x of others(g, p)) {
        if (!x.alive || !x.hand.length) continue;
        const picks = await g.chooseSomeCards(x, x.hand.slice(), 1, { prompt: '【绝响】：弃置一张手牌' });
        if (picks[0]) await ctx.discard(x, [picks[0]], { reason: 'juexiang' });
      }
      await ctx.log(`【绝响】：${p.name} 亡故，余音令全场各弃置一张手牌`);
    },
  }],
});

// ============================================================
// 纪灵 · 双刃
// ============================================================
defineSkill({
  id: 'qy2s_shuangren', name: '双刃',
  desc: '出牌阶段限一次，你可以与一名其他角色拼点：若你赢，你对其造成 1 点伤害；若你没赢，你失去 1 点体力。',
  active: {
    perPhase: true,
    prompt: '与一名其他角色拼点：赢则造成 1 点伤害，没赢则失去 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【双刃】：你没有手牌可拼点'); return; }
      const cands = others(g, p).filter(x => x.hand.length > 0);
      if (!cands.length) { await ctx.log('【双刃】：没有可拼点的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【双刃】：选择拼点角色', candidates: cands, min: 1, max: 1, reason: 'shuangren',
      });
      const t = ts[0];
      if (!t) return;
      const r = await pindian(g, p, t, { reason: '双刃' });
      if (r.skip) return;
      if (r.win) {
        await ctx.damage({ from: p, to: t, amount: 1, reason: 'shuangren' });
        await ctx.log(`【双刃】：${p.name} 拼点获胜，对 ${t.name} 造成 1 点伤害`);
      } else {
        await ctx.loseHp(p, 1, { reason: 'shuangren' });
        await ctx.log(`【双刃】：${p.name} 拼点没赢，失去 1 点体力`);
      }
    },
  },
});

// ============================================================
// 司马徽 · 荐杰 / 隐士
// ============================================================
defineSkill({
  id: 'qy2s_jianjie', name: '荐杰',
  desc: '出牌阶段限一次，你可以令一名其他角色摸两张牌，然后其须交给你一张手牌。',
  active: {
    perPhase: true,
    prompt: '令一名其他角色摸两张牌，然后其交给你一张手牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【荐杰】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【荐杰】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'jianjie',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, 2, { reason: 'jianjie' });
      if (t.hand.length) {
        const picks = await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: `【荐杰】：交给 ${p.name} 一张手牌` });
        const c = picks[0];
        if (c) await ctx.gain(p, [c], { from: t, reason: 'jianjie' });
      }
      await ctx.log(`【荐杰】：${t.name} 摸两张牌并交给 ${p.name} 一张手牌`);
    },
  },
});

defineSkill({
  id: 'qy2s_yinshi', name: '隐士',
  desc: '锁定技，当你的手牌数为 0 时，你不能成为【杀】或【决斗】的目标。',
  triggers: [{
    on: 'target.before', who: 'any', optional: false,
    filter: (d) => d.target === d.player && d.self !== d.player && !!d.card
      && (d.card.name === 'sha' || d.card.name === 'juedou') && (d.player.hand || []).length === 0,
    async effect(ctx) {
      ctx.data.canceled = true;
      await ctx.log(`【隐士】：${ctx.self.name} 手中无牌，不能成为目标`);
    },
  }],
});

// ============================================================
// 田丰 · 随势 / 死谏
// ============================================================
defineSkill({
  id: 'qy2s_suishi', name: '随势',
  desc: '每回合限一次，当一名角色造成伤害后，你可以摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true, once: 'turn',
    filter: (d) => !!d.from && d.from.alive !== false && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'suishi' });
      await ctx.log(`【随势】：${p.name} 顺应局势，摸一张牌`);
    },
  }],
});

defineSkill({
  id: 'qy2s_sijian', name: '死谏',
  desc: '每回合限一次，当你失去最后一张手牌后，你可以弃置一名其他角色的一张牌。',
  triggers: [{
    on: 'hand.change', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.count === 0
      && (d.player.flags || {}).sijianTurn !== d.game.turnCount
      && withCards(d.game, d.player).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.sijianTurn = g.turnCount;
      const ts = await ctx.ask.targets(p, {
        prompt: '【死谏】：选择一名其他角色，弃置其一张牌',
        candidates: withCards(g, p), min: 1, max: 1, reason: 'sijian',
      });
      const t = ts[0];
      if (!t) return;
      const pool = zonesOf(t);
      if (!pool.length) { await ctx.log(`【死谏】：${t.name} 没有牌可弃置`); return; }
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: `【死谏】：弃置 ${t.name} 的一张牌` });
      const c = picks[0] || pool[0];
      await ctx.discard(t, [c], { reason: 'sijian' });
      await ctx.log(`【死谏】：${p.name} 弃置 ${t.name} 的 ${cardLabel(c)}`);
    },
  }],
});

// ============================================================
// 陈琳 · 笔伐 / 颂词
// ============================================================
// 回收「本人扣置在别人武将牌旁」的笔伐牌（施放者阵亡 / 失去技能时调用）。
// ★牌张守恒：这些牌既不在手牌也不在装备区，只在目标的 bifaStack 私有容器里，
//   任何一条「不再结算」的路径都必须把它们退回弃牌堆，否则牌永久消失。
async function reclaimBifa(p, g) {
  let n = 0;
  for (const q of g.players) {
    const stack = q.bifaStack || [];
    const mine = stack.filter(r => r.ownerId === p.id);
    if (!mine.length) continue;
    const rest = stack.filter(r => r.ownerId !== p.id);
    q.bifaStack = rest;
    if (rest.length) q.marks = { ...(q.marks || {}), bifa: rest.length };
    else { const m = { ...(q.marks || {}) }; delete m.bifa; q.marks = m; }
    const pile = mine.map(r => r.card).filter(c => c && !g.discardPile.includes(c));
    if (pile.length) { g.pushDiscard(pile); n += pile.length; }
  }
  if (n) await g.log(`【笔伐】：回收 ${p.name} 扣置的 ${n} 张牌（置入弃牌堆）`);
}

defineSkill({
  id: 'qy2s_bifa', name: '笔伐',
  desc: '出牌阶段限一次，你可以将一张手牌扣置于一名其他角色武将牌旁（称为「笔伐」）；其回合开始时，若不交给你一张手牌，其受到 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '将一张手牌扣置于一名其他角色武将牌旁，其回合开始时需交牌否则受伤',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【笔伐】：你没有手牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【笔伐】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【笔伐】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'bifa',
      });
      const t = ts[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【笔伐】：选择扣置的手牌' });
      const c = picks[0];
      if (!c) return;
      const i = p.hand.indexOf(c);
      if (i >= 0) p.hand.splice(i, 1);
      // 扣置牌存在「武将牌旁」的独立栈里（不进 marks，避免快照泄露暗置牌的 id/花色/点数）；
      // marks 只放数量供前端显示。用栈而非单槽：同一目标可被重复笔伐，单槽会覆盖丢牌。
      t.bifaStack = t.bifaStack || [];
      t.bifaStack.push({ ownerId: p.id, card: c });
      t.marks = { ...(t.marks || {}), bifa: t.bifaStack.length };
      await ctx.log(`【笔伐】：${p.name} 将 ${cardLabel(c)} 扣置于 ${t.name} 武将牌旁`);
    },
  },
  triggers: [{
    on: 'turn.begin', who: 'any', optional: false,
    filter: (d) => !!d.self && (d.self.bifaStack || []).some(r => r.ownerId === d.player.id),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, q = ctx.data.self;
      const stack = q.bifaStack || [];
      const idx = stack.findIndex(r => r.ownerId === p.id);
      if (idx < 0) return;
      const rec = stack.splice(idx, 1)[0];
      q.bifaStack = stack;
      if (stack.length) q.marks = { ...(q.marks || {}), bifa: stack.length };
      else { const m = { ...(q.marks || {}) }; delete m.bifa; q.marks = m; }
      // 结算后扣置牌必须进弃牌堆（原先只打「作废」日志，牌永久消失、重洗后总量递减）
      const toPile = () => { if (rec.card && !g.discardPile.includes(rec.card)) g.pushDiscard([rec.card]); };
      if (q.hand.length) {
        const picks = await g.chooseSomeCards(q, q.hand.slice(), 1, {
          prompt: `【笔伐】：交给 ${p.name} 一张手牌，否则受到 1 点伤害`,
        });
        const c = picks[0];
        if (c) {
          await ctx.gain(p, [c], { from: q, reason: 'bifa' });
          toPile();
          await ctx.log(`【笔伐】：${q.name} 交出一张手牌（${cardLabel(rec.card)} 作废）`);
          return;
        }
      }
      await ctx.damage({ from: p, to: q, amount: 1, reason: 'bifa' });
      toPile();
      await ctx.log(`【笔伐】：${q.name} 未交出牌，受到 1 点伤害`);
    },
  }, {
    // 施放者阵亡：扣置牌必须归位，否则永久滞留在目标武将牌旁（牌张不守恒且无人能再结算）
    // ★cleanup:true —— 这是牌张守恒的收尾，不是「技能效果」：
    //   失去全部技能（flags.skillsDisabled）后引擎默认停掉本角色的所有触发器，
    //   若不停这条，扣置牌会永远回不来（SG027 R9 FAIL）。
    on: 'death.after', who: 'self', optional: false, cleanup: true,
    async effect(ctx) { await reclaimBifa(ctx.self, ctx.game); },
  }, {
    // 失去全部技能（【锁星】②等）：同样必须回收本人扣置的牌（cleanup 型，禁用后仍执行）
    on: 'skills.disabled', who: 'self', optional: false, cleanup: true,
    async effect(ctx) { await reclaimBifa(ctx.self, ctx.game); },
  }],
});

defineSkill({
  id: 'qy2s_songci', name: '颂词',
  desc: '当一名角色死亡后，你可以令一名角色摸两张牌。',
  triggers: [{
    on: 'death.after', who: 'any', optional: true,
    filter: (d) => d.self !== d.player,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = g.alive();
      if (!cands.length) { await ctx.log('【颂词】：没有可指定的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: `【颂词】：${ctx.data.self.name} 阵亡，选择一名角色令其摸两张牌`,
        candidates: cands, min: 1, max: 1, reason: 'songci',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, 2, { reason: 'songci' });
      await ctx.log(`【颂词】：${t.name} 摸两张牌`);
    },
  }],
});

// ============================================================
// 王粲 · 登楼 / 七哀（均为自拟）
// ============================================================
// 登楼：**自拟**（用「登楼赋」典）。弃一张手牌摸两张，若已受伤改为摸三张。
defineSkill({
  id: 'qy2s_denglou', name: '登楼',
  desc: '出牌阶段限一次，你可以弃置一张手牌，然后摸两张牌；若你已受伤，改为摸三张牌。',
  active: {
    perPhase: true,
    prompt: '弃置一张手牌，然后摸两张牌（已受伤则摸三张）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【登楼】：你没有手牌'); return; }
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【登楼】：弃置一张手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'denglou' });
      const n = p.hp < (p.maxHp ?? p.hp) ? 3 : 2;
      await ctx.draw(p, n, { reason: 'denglou' });
      await ctx.log(`【登楼】：${p.name} 弃置一张手牌，摸 ${n} 张牌`);
    },
  },
});

// 七哀：**自拟**（用「七哀诗」典）。受到伤害后摸一张；手牌数大于体力值则再弃一张。
defineSkill({
  id: 'qy2s_qiai', name: '七哀',
  desc: '当你受到伤害后，你可以摸一张牌；若如此做，若你的手牌数大于体力值，你弃置一张手牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && d.self.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      await ctx.draw(p, 1, { reason: 'qiai' });
      let extra = '';
      if (p.hand.length > p.hp) {
        const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【七哀】：手牌数大于体力值，弃置一张手牌' });
        if (picks[0]) {
          await ctx.discard(p, [picks[0]], { reason: 'qiai' });
          extra = '，并弃置一张手牌';
        }
      }
      await ctx.log(`【七哀】：${p.name} 摸一张牌${extra}`);
    },
  }],
});

// 关银屏 · 血祭 / 虎啸
// ============================================================
defineSkill({
  id: 'qy2s_xueji', name: '血祭',
  desc: '出牌阶段限一次，你可以弃置一张红色手牌，对一名其他角色造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '弃置一张红色手牌，对一名其他角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const reds = p.hand.filter(isRedC);
      if (!reds.length) { await ctx.log('【血祭】：你没有红色手牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【血祭】：没有其他角色'); return; }
      const picks = await g.chooseSomeCards(p, reds, 1, { prompt: '【血祭】：弃置一张红色手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'xueji' });
      const ts = await ctx.ask.targets(p, {
        prompt: '【血祭】：选择受到伤害的角色', candidates: cands, min: 1, max: 1, reason: 'xueji',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'xueji' });
      await ctx.log(`【血祭】：${p.name} 以 ${cardLabel(c)} 为祭，对 ${t.name} 造成 1 点伤害`);
    },
  },
});

defineSkill({
  id: 'qy2s_huxiao', name: '虎啸',
  desc: '锁定技，当你使用【杀】造成伤害后，你摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => d.from === d.player && !!d.card && d.card.name === 'sha' && (d.amount || 0) > 0,
    async effect(ctx) {
      await ctx.draw(ctx.self, 1, { reason: 'huxiao' });
      await ctx.log(`【虎啸】：${ctx.self.name} 的【杀】命中，摸一张牌`);
    },
  }],
});

// ============================================================
// 刘协 · 天命 / 密诏
// ============================================================
defineSkill({
  id: 'qy2s_tianming', name: '天命',
  desc: '当你成为【杀】的目标后，你可以弃置两张牌（不足则全弃），然后摸两张牌。',
  triggers: [{
    on: 'target.after', who: 'any', optional: true,
    filter: (d) => d.target === d.player && d.self !== d.player && !!d.card && d.card.name === 'sha'
      && d.player.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = zonesOf(p);
      if (!pool.length) { await ctx.log('【天命】：你没有牌可弃置'); return; }
      const n = Math.min(2, pool.length);
      const picks = await g.chooseSomeCards(p, pool.slice(), n, { prompt: `【天命】：弃置 ${n} 张牌` });
      if (picks.length) await ctx.discard(p, picks, { reason: 'tianming' });
      await ctx.draw(p, 2, { reason: 'tianming' });
      await ctx.log(`【天命】：${p.name} 弃置 ${picks.length} 张牌，然后摸两张牌`);
    },
  }],
});

defineSkill({
  id: 'qy2s_mizhao', name: '密诏',
  desc: '出牌阶段限一次，你可以将所有手牌交给一名其他角色，然后令其与另一名其他角色拼点：若其赢，你摸两张牌；若其没赢，你弃置一张手牌。',
  active: {
    perPhase: true,
    prompt: '将所有手牌交给一名其他角色，再令其与另一名其他角色拼点',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【密诏】：你没有手牌可交出'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【密诏】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【密诏】：选择接收手牌的角色', candidates: cands, min: 1, max: 1, reason: 'mizhao',
      });
      const t = ts[0];
      if (!t) return;
      const cost = p.hand.slice();
      await ctx.gain(t, cost, { from: p, reason: 'mizhao' });
      await ctx.log(`【密诏】：${p.name} 将 ${cost.length} 张手牌交给 ${t.name}`);
      const rest = others(g, p).filter(x => x !== t && x.hand.length > 0);
      if (!rest.length) { await ctx.log('【密诏】：没有可拼点的角色'); return; }
      const ts2 = await ctx.ask.targets(p, {
        prompt: '【密诏】：选择与其拼点的另一名角色', candidates: rest, min: 1, max: 1, reason: 'mizhao',
      });
      const u = ts2[0];
      if (!u) return;
      const r = await pindian(g, t, u, { reason: '密诏' });
      if (r.skip) return;
      if (r.win) {
        await ctx.draw(p, 2, { reason: 'mizhao' });
        await ctx.log(`【密诏】：${t.name} 拼点获胜，${p.name} 摸两张牌`);
      } else if (p.hand.length) {
        const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【密诏】：弃置一张手牌' });
        if (picks[0]) await ctx.discard(p, [picks[0]], { reason: 'mizhao' });
        await ctx.log(`【密诏】：${t.name} 没赢，${p.name} 弃置一张手牌`);
      }
    },
  },
});

// ============================================================
// 曹节 · 守节 / 椒房
// ============================================================
// 守节：**自拟**。汉室皇后护玺守节之意：成为【杀】或【决斗】的目标时，可弃一张手牌取消之。
defineSkill({
  id: 'qy2s_shoujie', name: '守节',
  desc: '当你成为【杀】或【决斗】的目标时，若你有手牌，你可以弃置一张手牌，取消此牌对你的结算。',
  triggers: [{
    on: 'target.before', who: 'any', optional: true,
    filter: (d) => d.target === d.player && d.self !== d.player && !!d.card
      && (d.card.name === 'sha' || d.card.name === 'juedou')
      && d.player.alive !== false && (d.player.hand || []).length > 0,
    async effect(ctx) {
      const p = ctx.self, d = ctx.data;
      const picks = await ctx.game.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【守节】：弃置一张手牌以取消此牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'shoujie' });
      d.canceled = true;
      await ctx.log(`【守节】：${p.name} 弃置 ${cardLabel(c)}，抵消了针对自己的【${CARD_META[d.card.name].cn}】`);
    },
  }],
});

// 椒房：**自拟**。锁定技，你的手牌上限 +1（引擎 player.flags.handLimit）。
defineSkill({
  id: 'qy2s_jiaofang', name: '椒房',
  desc: '锁定技，你的手牌上限 +1。',
  triggers: [{
    on: 'turn.begin', who: 'self', optional: false,
    filter: (d) => d.self === d.player && !(d.player.flags || {}).jiaofangApplied,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.jiaofangApplied = true;
      p.flags.handLimit = (p.flags.handLimit || 0) + 1;
      await ctx.log(`【椒房】：${p.name} 的手牌上限 +1`);
    },
  }],
});

// 邹氏 · 祸水 / 倾城
// ============================================================
defineSkill({
  id: 'qy2s_huoshui', name: '祸水',
  desc: '出牌阶段限一次，你可以令一名男性角色（若无男性则改为任意其他角色）选择一项：弃置一张手牌；或令你摸一张牌。',
  active: {
    perPhase: true,
    prompt: '令一名男性角色弃置一张手牌，或令你摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      let cands = others(g, p).filter(x => x.gender === 'male');
      if (!cands.length) cands = others(g, p);
      if (!cands.length) { await ctx.log('【祸水】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【祸水】：选择一名角色', candidates: cands, min: 1, max: 1, reason: 'huoshui',
      });
      const t = ts[0];
      if (!t) return;
      const idx = await ctx.ask.choose(t, ['弃置一张手牌', '令其摸一张牌'], { prompt: '【祸水】：请选择一项', reason: 'huoshui' });
      if (idx === 0) {
        if (!t.hand.length) {
          await ctx.draw(p, 1, { reason: 'huoshui' });
          await ctx.log(`【祸水】：${t.name} 没有手牌，${p.name} 摸一张牌`);
          return;
        }
        const picks = await g.chooseSomeCards(t, t.hand.slice(), 1, { prompt: '【祸水】：弃置一张手牌' });
        if (picks[0]) await ctx.discard(t, [picks[0]], { reason: 'huoshui' });
        await ctx.log(`【祸水】：${t.name} 弃置一张手牌`);
      } else if (idx === 1) {
        await ctx.draw(p, 1, { reason: 'huoshui' });
        await ctx.log(`【祸水】：${p.name} 摸一张牌`);
      } else {
        await ctx.log('【祸水】：对方取消选择，本次无效');
      }
    },
  },
});

defineSkill({
  id: 'qy2s_qingcheng', name: '倾城',
  desc: '锁定技，男性角色计算与你的距离 +1。',
  triggers: [{
    on: 'distance.calc', who: 'any', optional: false,
    // distance.calc 走 triggerSync，判断全部放在 effect 内
    effect(ctx) {
      const d = ctx.data, p = ctx.self;
      if (!d || !p || d.to !== p || d.self === p) return;
      if (!d.self || d.self.gender !== 'male') return;
      d.value += 1;
    },
  }],
});

// ============================================================
// 甘夫人 · 淑慎 / 神智
// ============================================================
defineSkill({
  id: 'qy2s_shushen', name: '淑慎',
  desc: '当你回复体力后，你可以令一名其他角色摸一张牌。',
  triggers: [{
    on: 'hp.recover', who: 'any', optional: true,
    filter: (d) => d.self === d.player && (d.count || 0) > 0 && others(d.game, d.player).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ts = await ctx.ask.targets(p, {
        prompt: '【淑慎】：选择一名其他角色，令其摸一张牌', candidates: others(g, p), min: 1, max: 1, reason: 'shushen',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, 1, { reason: 'shushen' });
      await ctx.log(`【淑慎】：${t.name} 摸一张牌`);
    },
  }],
});

defineSkill({
  id: 'qy2s_shenzhi', name: '神智',
  desc: '出牌阶段限一次，你可以弃置一张手牌，令一名已受伤的角色回复 1 点体力。',
  active: {
    perPhase: true,
    prompt: '弃置一张手牌，令一名已受伤的角色回复 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【神智】：你没有手牌'); return; }
      const hurt = g.alive().filter(x => x.hp < (x.maxHp ?? x.hp));
      if (!hurt.length) { await ctx.log('【神智】：没有已受伤的角色'); return; }
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【神智】：弃置一张手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'shenzhi' });
      const ts = await ctx.ask.targets(p, {
        prompt: '【神智】：选择回复体力的角色', candidates: hurt, min: 1, max: 1, reason: 'shenzhi',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.recover(t, 1, { reason: 'shenzhi' });
      await ctx.log(`【神智】：${t.name} 回复 1 点体力`);
    },
  },
});

// ============================================================
// 诸葛瑾 · 弘援 / 缓释
// ============================================================
defineSkill({
  id: 'qy2s_hongyuan', name: '弘援',
  desc: '摸牌阶段，你可以令一名其他角色摸两张牌；若如此做，你本阶段少摸一张牌。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw' && d.self === d.player && others(d.game, d.player).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ts = await ctx.ask.targets(p, {
        prompt: '【弘援】：选择一名其他角色，令其摸两张牌（你本阶段少摸一张）',
        candidates: others(g, p), min: 1, max: 1, reason: 'hongyuan',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, 2, { reason: 'hongyuan' });
      p.flags.skip_one_draw = true;
      await ctx.log(`【弘援】：${t.name} 摸两张牌，${p.name} 本阶段少摸一张牌`);
    },
  }],
});

defineSkill({
  id: 'qy2s_huanshi', name: '缓释',
  desc: '当一名角色的判定牌生效前，你可以弃置一张手牌，以之替换该判定牌。',
  triggers: [{
    on: 'judge.before', who: 'any', optional: true,
    filter: (d) => !!d.card && !d.canceled && d.player.alive !== false && d.player.hand.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, d = ctx.data;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【缓释】：弃置一张手牌替换判定牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'huanshi' });
      d.card = c;
      d.suit = c.suit;
      d.num = c.num;
      await ctx.log(`【缓释】：${p.name} 以 ${cardLabel(c)} 替换了判定牌`);
    },
  }],
});

// ============================================================
// 刘焉 · 图射 / 立牧（自拟）
// ============================================================
const isTrickNonDelayed = (name) => {
  const m = CARD_META[name];
  return !!m && m.type === 'trick' && !m.delayed;
};
defineSkill({
  id: 'qy2s_tushe', name: '图射',
  desc: '当你使用【杀】或非延时锦囊牌后，你可以摸一张牌，然后弃置一张手牌。',
  triggers: [{
    on: 'card.use.after', who: 'any', optional: true,
    filter: (d) => d.self === d.player && !!d.card && d.reason !== 'tushe'
      && (d.card.name === 'sha' || isTrickNonDelayed(d.card.name)),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      await ctx.draw(p, 1, { reason: 'tushe' });
      if (p.hand.length) {
        const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【图射】：弃置一张手牌' });
        if (picks[0]) await ctx.discard(p, [picks[0]], { reason: 'tushe' });
      }
      await ctx.log(`【图射】：${p.name} 摸一张牌并弃置一张手牌`);
    },
  }],
});

defineSkill({
  id: 'qy2s_limu', name: '立牧',
  desc: '出牌阶段限一次，你可以将一张手牌扣置于武将牌上，称为「牧」；出牌阶段结束时，你收回全部「牧」并摸等量的牌。',
  active: {
    perPhase: true,
    prompt: '将一张手牌扣置为「牧」，出牌阶段结束时收回并摸等量的牌',
    async effect(ctx) {
      const p = ctx.self;
      if (!p.hand.length) { await ctx.log('【立牧】：你没有手牌'); return; }
      p.marks = p.marks || {};
      const mu = p.marks.mu || [];
      if (mu.length >= 3) { await ctx.log('【立牧】：「牧」已有 3 张'); return; }
      const picks = await ctx.game.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【立牧】：选择扣置的手牌' });
      const c = picks[0];
      if (!c) return;
      const i = p.hand.indexOf(c);
      if (i >= 0) p.hand.splice(i, 1);
      p.marks.mu = [...mu, c];
      await ctx.log(`【立牧】：${p.name} 将 ${cardLabel(c)} 扣置为「牧」（${p.marks.mu.length} 张）`);
    },
  },
  triggers: [{
    on: 'phase.end', who: 'self', optional: false,
    filter: (d) => d.phase === 'play' && d.self === d.player && ((d.player.marks || {}).mu || []).length > 0,
    async effect(ctx) {
      const p = ctx.self;
      const list = (p.marks.mu || []).splice(0);
      p.marks.mu = [];
      await ctx.gain(p, list, { reason: 'limu' });
      await ctx.draw(p, list.length, { reason: 'limu' });
      await ctx.log(`【立牧】：${p.name} 收回 ${list.length} 张「牧」并摸 ${list.length} 张牌`);
    },
  }],
});

// ============================================================
// 审配 · 刚直 / 备战
// ============================================================
defineSkill({
  id: 'qy2s_gangzhi', name: '刚直',
  desc: '当你受到其他角色造成的伤害后，你可以令伤害来源弃置一张手牌；若其未如此做，其失去 1 点体力。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && !!d.from && d.from !== d.player && d.from.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, src = ctx.data.from;
      if (src.hand.length) {
        const picks = await g.chooseSomeCards(src, src.hand.slice(), 1, { prompt: '【刚直】：弃置一张手牌，否则失去 1 点体力' });
        const c = picks[0];
        if (c) {
          await ctx.discard(src, [c], { reason: 'gangzhi' });
          await ctx.log(`【刚直】：${src.name} 弃置一张手牌`);
          return;
        }
      }
      await ctx.loseHp(src, 1, { reason: 'gangzhi' });
      await ctx.log(`【刚直】：${src.name} 未弃牌，失去 1 点体力`);
    },
  }],
});

defineSkill({
  id: 'qy2s_beizhan', name: '备战',
  desc: '出牌阶段限一次，你可以弃置一张手牌，令一名角色摸两张牌。',
  active: {
    perPhase: true,
    prompt: '弃置一张手牌，令一名角色摸两张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【备战】：你没有手牌'); return; }
      const cands = g.alive();
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【备战】：弃置一张手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'beizhan' });
      const ts = await ctx.ask.targets(p, {
        prompt: '【备战】：选择摸牌的角色', candidates: cands, min: 1, max: 1, reason: 'beizhan',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, 2, { reason: 'beizhan' });
      await ctx.log(`【备战】：${t.name} 摸两张牌`);
    },
  },
});

// ============================================================
// 蒋干 · 伪诚 / 盗书
// ============================================================
defineSkill({
  id: 'qy2s_weicheng', name: '伪诚',
  desc: '当你受到其他角色造成的伤害后，你可以令伤害来源选择一项：交给你一张手牌；或令你摸一张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.self === d.player && !!d.from && d.from !== d.player && d.from.alive !== false,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, src = ctx.data.from;
      const idx = await ctx.ask.choose(src, ['交给你一张手牌', '令你摸一张牌'], { prompt: '【伪诚】：请选择一项', reason: 'weicheng' });
      if (idx === 0 && src.hand.length) {
        const picks = await g.chooseSomeCards(src, src.hand.slice(), 1, { prompt: `【伪诚】：交给 ${p.name} 一张手牌` });
        const c = picks[0];
        if (c) await ctx.gain(p, [c], { from: src, reason: 'weicheng' });
        await ctx.log(`【伪诚】：${src.name} 交给 ${p.name} 一张手牌`);
      } else if (idx === 1 || (idx === 0 && !src.hand.length)) {
        await ctx.draw(p, 1, { reason: 'weicheng' });
        await ctx.log(`【伪诚】：${p.name} 摸一张牌`);
      } else {
        await ctx.log('【伪诚】：对方取消选择，本次无效');
      }
    },
  }],
});

defineSkill({
  id: 'qy2s_daoshu', name: '盗书',
  desc: '出牌阶段限一次，你可以获得一名其他角色的一张手牌；若该牌为黑色，你摸一张牌，否则你失去 1 点体力。',
  active: {
    perPhase: true,
    prompt: '获得一名其他角色一张手牌：黑色则摸牌，红色则失去 1 点体力',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const cands = others(g, p).filter(x => x.hand.length > 0);
      if (!cands.length) { await ctx.log('【盗书】：没有可偷取的角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【盗书】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'daoshu',
      });
      const t = ts[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, t.hand.slice(), 1, { prompt: `【盗书】：获得 ${t.name} 一张手牌` });
      const c = picks[0];
      if (!c) return;
      await ctx.gain(p, [c], { from: t, reason: 'daoshu' });
      if (isBlackC(c)) {
        await ctx.draw(p, 1, { reason: 'daoshu' });
        await ctx.log(`【盗书】：获得 ${cardLabel(c)}，为黑色，摸一张牌`);
      } else {
        await ctx.loseHp(p, 1, { reason: 'daoshu' });
        await ctx.log(`【盗书】：获得 ${cardLabel(c)}，并非黑色，失去 1 点体力`);
      }
    },
  },
});

// ============================================================
// 马良 · 自书 / 应援
// ============================================================
defineSkill({
  id: 'qy2s_zishu', name: '自书',
  desc: '锁定技，当你于摸牌阶段外获得牌后，你摸一张牌。',
  triggers: [{
    on: 'cards.gain', who: 'any', optional: false,
    filter: (d) => d.self === d.player && d.reason !== 'zishu' && d.game.phase !== 'draw'
      && (d.cards || []).length > 0,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.draw(p, 1, { reason: 'zishu' });
      await ctx.log(`【自书】：${p.name} 于摸牌阶段外获得牌，摸一张牌`);
    },
  }],
});

defineSkill({
  id: 'qy2s_yingyuan', name: '应援',
  desc: '每回合限一次，当你使用一张牌后，你可以令一名其他角色摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'any', optional: true, once: 'turn',
    filter: (d) => d.self === d.player && !!d.card && others(d.game, d.player).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const ts = await ctx.ask.targets(p, {
        prompt: '【应援】：选择一名其他角色，令其摸一张牌', candidates: others(g, p), min: 1, max: 1, reason: 'yingyuan',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.draw(t, 1, { reason: 'yingyuan' });
      await ctx.log(`【应援】：${t.name} 摸一张牌`);
    },
  }],
});

// ============================================================
// 文聘 · 镇卫
// ============================================================
defineSkill({
  id: 'qy2s_zhenwei', name: '镇卫',
  desc: '锁定技，其他角色计算与你的距离 +1。',
  triggers: [{
    on: 'distance.calc', who: 'any', optional: false,
    effect(ctx) {
      const d = ctx.data, p = ctx.self;
      if (!d || !p || d.to !== p || d.self === p) return;
      d.value += 1;
    },
  }],
});

// ============================================================
// 李典 · 恂恂 / 勇决
// ============================================================
// 恂恂：沿用官方技能名，效果为本实现口径——给牌换取摸牌（「恂恂」原作摸牌/牌堆顶风格）。
defineSkill({
  id: 'qy2s_xunxun', name: '恂恂',
  desc: '出牌阶段限一次，你可以将一张手牌交给一名其他角色，然后摸一张牌。',
  active: {
    perPhase: true,
    prompt: '将一张手牌交给一名其他角色，然后摸一张牌',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【恂恂】：你没有手牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【恂恂】：没有其他角色'); return; }
      const ts = await ctx.ask.targets(p, {
        prompt: '【恂恂】：选择一名其他角色', candidates: cands, min: 1, max: 1, reason: 'xunxun',
      });
      const t = ts[0];
      if (!t) return;
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【恂恂】：选择交出的手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.gain(t, [c], { from: p, reason: 'xunxun' });
      await ctx.draw(p, 1, { reason: 'xunxun' });
      await ctx.log(`【恂恂】：${p.name} 将 ${cardLabel(c)} 交给 ${t.name}，然后摸一张牌`);
    },
  },
});

// 勇决：**自拟**。你的【杀】造成伤害后，可弃置受伤角色一张牌。
defineSkill({
  id: 'qy2s_yongjue', name: '勇决',
  desc: '当你使用【杀】对一名其他角色造成伤害后，你可以弃置其一张牌。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => d.from === d.player && d.self !== d.player && !!d.card && d.card.name === 'sha'
      && d.self.alive !== false && zonesOf(d.self).length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.self;
      const pool = zonesOf(t);
      if (!pool.length) { await ctx.log(`【勇决】：${t.name} 没有牌可弃置`); return; }
      const picks = await g.chooseSomeCards(p, pool, 1, { prompt: `【勇决】：弃置 ${t.name} 的一张牌` });
      const c = picks[0] || pool[0];
      await ctx.discard(t, [c], { reason: 'yongjue' });
      await ctx.log(`【勇决】：${p.name} 弃置 ${t.name} 的 ${cardLabel(c)}`);
    },
  }],
});

// 沙摩柯 · 蒺藜 / 蛮袭（自拟）
// ============================================================
defineSkill({
  id: 'qy2s_jili', name: '蒺藜',
  desc: '每回合限一次，当你于回合外使用或打出一张牌后，你可以摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'any', optional: true,
    filter: (d) => d.self === d.player && !!d.card && d.game.turnPlayer !== d.player
      && (d.player.flags || {}).jiliTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.jiliTurn = g.turnCount;
      await ctx.draw(p, 1, { reason: 'jili' });
      await ctx.log(`【蒺藜】：${p.name} 于回合外使用牌，摸一张牌`);
    },
  }, {
    // 打出/响应用牌（【闪】【桃】【无懈】）不走 card.use.after，只产生 reason='respond' 的 cards.discard，
    // 因此必须单独监听，否则「回合外打出」几乎永远不触发。
    on: 'cards.discard', who: 'any', optional: true,
    filter: (d) => d.self === d.player && d.reason === 'respond'
      && (d.cards || []).length > 0 && d.player.alive !== false
      && d.game.turnPlayer !== d.player
      && (d.player.flags || {}).jiliTurn !== d.game.turnCount,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.jiliTurn = g.turnCount;
      await ctx.draw(p, 1, { reason: 'jili' });
      await ctx.log(`【蒺藜】：${p.name} 于回合外打出牌，摸一张牌`);
    },
  }],
});

defineSkill({
  id: 'qy2s_manxi', name: '蛮袭',
  desc: '出牌阶段限一次，你可以弃置一张手牌，对一名其他角色造成 1 点伤害。',
  active: {
    perPhase: true,
    prompt: '弃置一张手牌，对一名其他角色造成 1 点伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (!p.hand.length) { await ctx.log('【蛮袭】：你没有手牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【蛮袭】：没有其他角色'); return; }
      const picks = await g.chooseSomeCards(p, p.hand.slice(), 1, { prompt: '【蛮袭】：弃置一张手牌' });
      const c = picks[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'manxi' });
      const ts = await ctx.ask.targets(p, {
        prompt: '【蛮袭】：选择受到伤害的角色', candidates: cands, min: 1, max: 1, reason: 'manxi',
      });
      const t = ts[0];
      if (!t) return;
      await ctx.damage({ from: p, to: t, amount: 1, reason: 'manxi' });
      await ctx.log(`【蛮袭】：${p.name} 弃置 ${cardLabel(c)}，对 ${t.name} 造成 1 点伤害`);
    },
  },
});
