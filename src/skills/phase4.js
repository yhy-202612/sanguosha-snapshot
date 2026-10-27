// 阶段 4 收尾批（4C + 4F）· 3 位机制武将（pack = 'phase4'）
//
// 本批武将：
//   1. 诸葛诞（魏 · 4 · clan 'zhuge'）：功獒 / 举义（觉醒）→ 崩坏 / 威重         —— 资料已核实（标准 / OL 诸葛诞）
//   2. 左慈（群 · 3）：化身（M11 简化化身）/ 新生                                —— 资料已核实（标准 左慈；本批为简化口径，见下）
//   3. 魔周瑜（吴 · 4）：魔炎 / 焚天                                             —— 资料未核实（按本批任务书给定的口径实现，见下）
//
// ============ 实现口径与偏差说明 ============
//   【功獒】官方原文为「锁定技，当一名角色受到伤害后，若其体力值小于你，你获得 1 枚「暴」」。
//     本批任务书要求的口径是「任意角色受到伤害后你获得 1 枚「暴」」，故**去掉「体力值小于你」的条件**
//     （desc 按实际实现版本书写，避免描述与行为不一致）。
//   【崩坏】/【威重】在本文件中 defineSkill 注册，但**不写进诸葛诞的初始技能表**：
//     只有【举义】觉醒后才通过 p.skills.push(getSkill('bengkai' | 'weizhong')) 获得。
//     【崩坏】自己的 filter 里再用 p.skills.some(s => s.id === 'bengkai') 兜底判定一次，防止被外部
//     误授予触发。
//   【威重】「当你的体力上限减少后，你摸一张牌」：引擎**没有**「体力上限变化」事件（game.js 只在
//     创建/日志/快照里读写 maxHp，无 maxHp.change 触发器）。因此本文件把「减体力上限」收敛到唯一入口
//     cutMaxHp()：扣上限 → 修正体力 → 若此时已拥有【威重】则摸一张牌。举义 / 崩坏 / 未来的同类技能
//     都走这个入口，语义与官方一致（举义是「先减上限，再获得威重」，所以举义自己那一次不减血摸牌）。
//   【化身·M11 简化版】官方 左慈【化身】是「获得两张化身牌，每张化身牌提供随机技能，受到伤害后可更换」。
//     本批按任务书给定的简化口径实现：
//       ① 游戏开始时随机获得 2 张化身牌，化身牌 = **武将 id**（存 p.marks.huashan，上限 4 张）；
//       ② 出牌阶段限一次，选一张化身牌，获得该武将的**一个技能**（真实技能对象 push 进 p.skills，
//          因此 activeSkillsOf / 触发器都能正常识别）；替换掉上一次以此法获得的技能
//          （id 记在 p.flags.huashenSkill）；
//       ③ 【新生】受到伤害后随机获得 1 张新化身牌（上限 4 张）。
//     ★ 冲突说明：src/skills/shan.js 里已有 神话再临·山 的左慈（id 'zuoci'，技能 id 'huashen'/'xinsheng'，
//       口径是「化身牌 = 技能 id、上限 5、受伤后换技能」）。技能 id 必须全局唯一，故本批的简化化身改用
//       'huashen2' / 'xinsheng2'，与 shan.js 的旧实现互不影响。
//   【魔周瑜】「资料未核实」：OL「魔」系列已实装魔曹操 / 魔张飞 / 魔孙权 等，魔周瑜的技能原文未能取得
//     权威来源，故按本批任务书给定的口径实现（魔炎：弃红牌造成 1 点火焰伤害；焚天：限定技，全体其他
//     角色各弃一张牌并获得额外回合）。若后续拿到官方原文，只需替换本文件两个 defineSkill 的实现。
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel, SUIT_CN } from '../engine/cards.js';
import { GENERALS, generalById } from '../data/generals.js';

const others = (g, p) => g.alive().filter(q => q !== p);
const isRed = (c) => !!c && (c.suit === 'heart' || c.suit === 'diamond');
const owns = (p, id) => (effSkills(p) || []).some(s => s.id === id);

// ============================================================
// ============ 通用：减体力上限（【威重】的唯一入口）============
// ============================================================
// 官方顺序：先减 1 点体力上限，再结算由此产生的技能（如【威重】）。
// 体力上限下限为 1（见 docs/SKILL-AUTHORING.md §5）。
async function cutMaxHp(ctx, p, n = 1) {
  const before = p.maxHp;
  p.maxHp = Math.max(1, p.maxHp - n);
  const cut = before - p.maxHp;
  if (p.hp > p.maxHp) p.hp = p.maxHp;
  if (cut > 0 && owns(p, 'weizhong')) {
    await ctx.draw(p, 1, { reason: 'weizhong' });
    await ctx.log(`【威重】：${p.name} 的体力上限减少 ${cut} 点，摸一张牌`);
  }
  return cut;
}

// ============================================================
// ==================== 诸葛诞（魏 · 4 · clan zhuge） ==========
// ============================================================
// 「暴」标记（p.marks.bao）
const baoOf = (p) => (p?.marks?.bao || 0);
const addBao = (p, n = 1) => {
  p.marks = p.marks || {};
  p.marks.bao = (p.marks.bao || 0) + n;
  return p.marks.bao;
};

// 功獒（锁定技）：当一名角色受到伤害后，你获得 1 枚「暴」。
// 官方原文含「若其体力值小于你」，本批按任务书口径去掉该条件（见文件头说明）。
defineSkill({
  id: 'gongao', name: '功獒',
  desc: '锁定技，当一名角色受到伤害后，你获得 1 枚「暴」。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: false,
    filter: (d) => !!d.player && d.player.alive !== false && (d.amount || 0) > 0,
    async effect(ctx) {
      const p = ctx.self;
      const total = addBao(p, 1);
      await ctx.log(`【功獒】：${p.name} 获得 1 枚「暴」（共 ${total} 枚）`);
    },
  }],
});

// 举义（觉醒技）：准备阶段，若你的「暴」不少于 3 枚，你减 1 点体力上限，然后获得【崩坏】和【威重】。
defineSkill({
  id: 'juyi', name: '举义',
  desc: '觉醒技，准备阶段，若你的「暴」不少于 3 枚，你减 1 点体力上限，然后获得【崩坏】和【威重】。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'prepare' && d.player.alive && d.player.flags.juyiUsed !== true
      && baoOf(d.player) >= 3,
    async effect(ctx) {
      const p = ctx.self;
      p.flags.juyiUsed = true;
      const before = p.maxHp;
      // 先减体力上限（此时还没有【威重】，故这一次不减血摸牌），再获得两个技能
      await cutMaxHp(ctx, p, 1);
      const got = [];
      for (const id of ['bengkai', 'weizhong']) {
        if (owns(p, id)) continue;
        const sk = getSkill(id);
        if (sk) { p.skills.push(sk); got.push(sk.name); }
      }
      await ctx.log(`【举义】：觉醒！${p.name} 体力上限 ${before} → ${p.maxHp}，获得【${got.join('】【')}】`);
    },
  }],
});

// 崩坏（锁定技）：结束阶段，若你不是体力值最少的角色，你须减 1 点体力上限或失去 1 点体力。
// 只有【举义】觉醒后才会持有本技能（见 filter 里的兜底判断）。
defineSkill({
  id: 'bengkai', name: '崩坏',
  desc: '锁定技，结束阶段，若你不是体力值最少的角色，你须减 1 点体力上限或失去 1 点体力。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: false,
    filter: (d) => d.phase === 'end' && d.player.alive && owns(d.player, 'bengkai'),
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const alive = g.alive();
      if (!alive.length) return;
      const minHp = Math.min(...alive.map(q => q.hp));
      if (p.hp <= minHp) { await ctx.log(`【崩坏】：${p.name} 已是体力值最少的角色，无需结算`); return; }
      const idx = await ctx.ask.choose(p, ['减 1 点体力上限', '失去 1 点体力'],
        { prompt: '【崩坏】：须减 1 点体力上限或失去 1 点体力' });
      if (idx === 1) {
        await ctx.loseHp(p, 1, { reason: 'bengkai' });
        await ctx.log(`【崩坏】：${p.name} 失去 1 点体力（${p.hp}/${p.maxHp}）`);
      } else {
        const before = p.maxHp;
        await cutMaxHp(ctx, p, 1);
        await ctx.log(`【崩坏】：${p.name} 减 1 点体力上限（${before} → ${p.maxHp}）`);
      }
    },
  }],
});

// 威重（锁定技）：当你的体力上限减少后，你摸一张牌。
// ★ 引擎无「体力上限变化」事件 → 实际执行点在文件头的 cutMaxHp()（本技能的唯一结算入口）。
defineSkill({
  id: 'weizhong', name: '威重',
  desc: '锁定技，当你的体力上限减少后，你摸一张牌。',
  triggers: [],
});

// ============================================================
// ==================== 左慈（群 · 3 · M11 简化化身） ==========
// ============================================================
const HS_MAX = 4;                      // 化身牌上限
const HS_SKIP = new Set(['huashen', 'xinsheng', 'huashen2', 'xinsheng2']); // 不允许化身得到的技能（防递归）

// 化身牌列表（p.marks.huashan 为武将 id 数组）
const hsCards = (p) => {
  p.marks = p.marks || {};
  if (!Array.isArray(p.marks.huashan)) p.marks.huashan = [];
  return p.marks.huashan;
};
// 某张化身牌上「可获得」的技能 id 列表
const hsSkillsOf = (p, gid) => {
  const gd = generalById(gid);
  if (!gd) return [];
  return (effSkills(gd) || []).filter(id => {
    if (HS_SKIP.has(id)) return false;
    const sk = getSkill(id);
    if (!sk || sk.fallbackOf) return false;      // 未实装 / 被降级的技能不能化身
    return !owns(p, id);                          // 已经拥有的技能不再重复获得
  });
};
// 可作化身的武将池：排除自己，且至少有一个可获得的技能
const hsPool = (p) => GENERALS.filter(gd => gd.id !== p.generalId && hsSkillsOf(p, gd.id).length > 0);
// 随机获得 n 张化身牌（受 HS_MAX 上限约束）
const hsAdd = (p, g, n = 1) => {
  const list = hsCards(p);
  const pool = hsPool(p).filter(gd => !list.includes(gd.id));
  if (!pool.length || list.length >= HS_MAX) return [];
  const picked = [];
  for (const gd of g.rng.shuffle(pool)) {
    if (picked.length >= n || list.length >= HS_MAX) break;
    list.push(gd.id);
    picked.push(gd.id);
  }
  return picked;
};
const hsName = (gid) => generalById(gid)?.name || gid;

// 化身（M11 简化版）：游戏开始时随机获得 2 张化身牌；出牌阶段限一次，
// 你可以获得一张化身牌上的一个技能（替换上一次以此法获得的技能）。
defineSkill({
  id: 'huashen2', name: '化身',
  desc: '游戏开始时你随机获得 2 张化身牌。出牌阶段限一次，你可以选择一张化身牌，获得该武将的一个技能（替换你上一次以此法获得的技能）。',
  triggers: [{
    on: 'game.start', who: 'any', optional: false,
    filter: (d) => !!d.player && !d.player.flags.huashenInit,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.huashenInit = true;
      const got = hsAdd(p, g, 2);
      if (!got.length) { await ctx.log('【化身】：没有可用的化身牌'); return; }
      await ctx.log(`【化身】：${p.name} 获得化身牌 ${got.map(hsName).join('、')}（共 ${hsCards(p).length} 张）`);
    },
  }],
  active: {
    perPhase: true,
    prompt: '【化身】：获得一张化身牌上的一个技能',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const list = hsCards(p).filter(gid => hsSkillsOf(p, gid).length > 0);
      if (!list.length) { await ctx.log('【化身】：没有可获得技能的化身牌'); return; }
      const opts = list.map(gid => `${hsName(gid)}（${hsSkillsOf(p, gid).map(id => getSkill(id).name).join('/')}）`);
      const gi = await ctx.ask.choose(p, opts, { prompt: '【化身】：选择一张化身牌' });
      if (!(gi >= 0) || !list[gi]) return;
      const gid = list[gi];
      const ids = hsSkillsOf(p, gid);
      if (!ids.length) return;
      let sid = ids[0];
      if (ids.length > 1) {
        const si = await ctx.ask.choose(p, ids.map(id => getSkill(id).name), { prompt: `【化身】：选择 ${hsName(gid)} 的一个技能` });
        sid = ids[si >= 0 && si < ids.length ? si : 0];
      }
      const sk = getSkill(sid);
      if (!sk) return;
      // 替换上一次以此法获得的技能
      const old = p.flags.huashenSkill;
      if (old && old !== sid) {
        await ctx.game.removeSkills(p, [old]);   // ★统一出口（SG030 A2）
        // perTurn（act_*）/ perPhase（actPhase_*）两种发动记录都要清：换掉技能后重新获得应视为未发动
        if (p.flags[`act_${old}`] != null) delete p.flags[`act_${old}`];
        if (p.flags[`actPhase_${old}`] != null) delete p.flags[`actPhase_${old}`];
      }
      if (!owns(p, sid)) p.skills.push(sk);
      p.flags.huashenSkill = sid;
      await ctx.log(`【化身】：${p.name} 化为 ${hsName(gid)}，获得技能【${sk.name}】${old && old !== sid ? `（替换【${getSkill(old)?.name || old}】）` : ''}`);
    },
  },
});

// 新生：当你受到伤害后，你随机获得一张新的化身牌（上限 4 张）。
defineSkill({
  id: 'xinsheng2', name: '新生',
  desc: '当你受到伤害后，你随机获得一张新的化身牌（至多 4 张）。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: false,
    filter: (d) => d.player.alive !== false && (d.amount || 0) > 0 && hsCards(d.player).length < HS_MAX,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const got = hsAdd(p, g, 1);
      if (!got.length) { await ctx.log('【新生】：没有新的化身牌（或已达上限）'); return; }
      await ctx.log(`【新生】：${p.name} 获得化身牌 ${got.map(hsName).join('、')}（共 ${hsCards(p).length}/${HS_MAX} 张）`);
    },
  }],
});

// ============================================================
// ==================== 魔周瑜（吴 · 4）· 资料未核实 ============
// ============================================================
// 魔炎（出牌阶段限一次）：你可以弃置一张红色手牌，对一名其他角色造成 1 点火焰伤害。
defineSkill({
  id: 'moyan', name: '魔炎',
  desc: '出牌阶段限一次，你可以弃置一张红色手牌，对一名其他角色造成 1 点火焰伤害。',
  active: {
    perPhase: true,
    prompt: '【魔炎】：弃置一张红色手牌，造成 1 点火焰伤害',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const reds = p.hand.filter(isRed);
      if (!reds.length) { await ctx.log('【魔炎】：没有红色手牌'); return; }
      const cands = others(g, p);
      if (!cands.length) { await ctx.log('【魔炎】：没有其他角色'); return; }
      const t = (await ctx.ask.targets(p, { candidates: cands, min: 1, max: 1, prompt: '【魔炎】：选择一名其他角色' }))[0];
      if (!t) return;
      const c = (await g.chooseSomeCards(p, reds, 1, { prompt: '【魔炎】：弃置一张红色手牌', optional: false }))[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'moyan' });
      await ctx.log(`【魔炎】：${p.name} 弃置 ${cardLabel(c)}${SUIT_CN[c.suit] || ''}，对 ${t.name} 造成 1 点火焰伤害`);
      await ctx.damage({ from: p, to: t, amount: 1, nature: 'fire', card: c, reason: 'moyan' });
    },
  },
});

// 焚天（限定技）：出牌阶段，你可以令所有其他角色各弃置一张牌，然后你获得一个额外回合。
defineSkill({
  id: 'fentian', name: '焚天',
  desc: '限定技，出牌阶段，你可以令所有其他角色各弃置一张牌，然后你获得一个额外回合。',
  active: {
    prompt: '【焚天】（限定技）：所有其他角色各弃一张牌，你获得一个额外回合',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.fentianUsed) { await ctx.log('【焚天】：本局已发动过（限定技）'); return; }
      p.flags.fentianUsed = true;
      let n = 0;
      for (const q of others(g, p)) {
        if (!q.alive) continue;
        const pool = [...q.hand, ...Object.values(q.equips).filter(Boolean)];
        if (!pool.length) continue;
        const pick = (await g.chooseSomeCards(q, pool, 1, { prompt: '【焚天】：弃置一张牌', optional: false }))[0];
        if (!pick) continue;
        await ctx.discard(q, [pick], { reason: 'fentian' });
        n++;
      }
      await ctx.log(`【焚天】：${p.name} 令 ${n} 名角色各弃置一张牌`);
      const queued = g.queueExtraTurn(p);
      await ctx.log(queued ? `【焚天】：${p.name} 获得一个额外回合` : '【焚天】：已有待结算的额外回合，本次不再重复获得');
    },
  },
});
