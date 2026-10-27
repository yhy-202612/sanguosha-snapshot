// OL「魔」系列（第三批）：魔张飞 / 魔孙权
// 依赖机制：入魔形态（player.form='demon'）、勾玉颜色（绿/黄/红）
// 勾玉颜色：绿=体力 > 2/3 上限；黄=1/3~2/3；红=≤1/3（本文件内自带 jade()，不依赖引擎）
import { defineSkill, getSkill, effSkills } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

let vseq = 0;
const VC = (name, suit = 'spade', num = 7, extra = {}) => ({
  id: `vm3${++vseq}`, name, suit, num, type: CARD_META[name]?.type || 'basic', virtual: true, ...extra,
});
const isBlack = (c) => c && (c.suit === 'spade' || c.suit === 'club');
// 勾玉颜色（官方三分支）
export const jade = (p) => {
  const hp = p?.hp ?? 0, max = Math.max(1, p?.maxHp ?? 1);
  if (hp * 3 > max * 2) return 'green';
  if (hp * 3 > max) return 'yellow';
  return 'red';
};
const JADE_CN = { green: '绿', yellow: '黄', red: '红' };
const roundStart = (g) => g.turnCount % Math.max(1, g.players.length) === 1;

// ==================== 魔张飞 · 灼魂 ====================
// 锁定技，你的回合内：你的【闪】均视为【杀】；一名角色的勾玉首次变为一个颜色后，你摸一张牌。
// 修改：你的回合内：你的【闪】均视为【杀】；一名角色的勾玉首次变为一个颜色后，
// 你将手牌摸至体力上限，并执行对应效果：绿，其本回合摸牌改为从牌堆获得等量【杀】；
// 黄，其本回合非锁定技失效；红，若无角色处于濒死状态，其失去所有体力。
defineSkill({
  id: 'zhuohun', name: '灼魂',
  desc: '锁定技，你的回合内：你的【闪】均视为【杀】；一名角色的勾玉首次变为一个颜色后，你摸一张牌。（修改：你的回合内：你的【闪】均视为【杀】；一名角色的勾玉首次变为一个颜色后，你将手牌摸至体力上限，并执行对应效果：绿色，其本回合摸牌改为从牌堆获得等量【杀】；黄色，其本回合非锁定技失效；红色，若无角色处于濒死状态，其失去所有体力。）',
  triggers: [
    {
      // 初始化勾玉颜色（开局记录基线，之后仅在“变化”时触发）
      on: 'game.start', who: 'any', optional: false,
      filter: (d) => !!d.game,
      async effect(ctx) {
        for (const q of ctx.game.players) q.flags.__jade = jade(q);
      },
    },
    {
      // 勾玉变色检测：任何角色的体力变化后重算颜色
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => !!d.game && d.game.players.length > 0,
      async effect(ctx) { await watchJade(ctx); },
    },
    {
      on: 'hp.recover', who: 'any', optional: false,
      filter: (d) => d.count > 0,
      async effect(ctx) { await watchJade(ctx); },
    },
    {
      on: 'hp.lose', who: 'any', optional: false,
      filter: (d) => true,
      async effect(ctx) { await watchJade(ctx); },
    },
  ],
  active: {
    // 「你的【闪】均视为【杀】」：以主动转化的形式提供（不修改引擎 virtual-extra）
    prompt: '灼魂：将一张【闪】当【杀】使用',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (g.turnPlayer !== p) { await ctx.log('【灼魂】：仅你的回合内【闪】视为【杀】'); return; }
      const shans = p.hand.filter(c => c.name === 'shan');
      if (!shans.length) { await ctx.log('【灼魂】：你没有【闪】'); return; }
      const [c] = await g.chooseSomeCards(p, shans, 1, { prompt: '【灼魂】：选择一张【闪】当【杀】使用' });
      if (!c) return;
      const cs = g.alive().filter(x => x !== p);
      if (!cs.length) return;
      const tg = await ctx.ask.targets(p, { prompt: '【灼魂】：选择【杀】的目标', candidates: cs, min: 1, max: 1 });
      if (!tg.length) return;
      const i = p.hand.indexOf(c);
      if (i >= 0) p.hand.splice(i, 1);
      await ctx.discard(p, [c], { reason: 'zhuohun' });
      const ok = await ctx.useCard({ from: p, card: VC('sha', c.suit, c.num), targets: tg, reason: 'zhuohun' });
      if (ok !== false) await ctx.log(`【灼魂】：${cardLabel(c)} 视为【杀】`);
    },
  },
});

async function watchJade(ctx) {
  const p = ctx.self, g = ctx.game;
  if (p.form !== 'demon' && p.form !== 'normal') p.form = p.form || 'normal';
  for (const q of g.alive()) {
    const cur = jade(q);
    const prev = q.flags.__jade;
    q.flags.__jade = cur;
    if (prev === undefined || prev === cur) continue;
    q.flags.jadeSeen = q.flags.jadeSeen || {};
    if (q.flags.jadeSeen[cur] === g.turnCount) continue;
    q.flags.jadeSeen[cur] = g.turnCount;
    if (!p.alive) continue;
    if (p.form !== 'demon') {
      await ctx.draw(p, 1, { reason: 'zhuohun' });
      await ctx.log(`【灼魂】：${q.name} 的勾玉变为${JADE_CN[cur]}色，你摸一张牌`);
      continue;
    }
    if (p.hand.length < p.maxHp) await ctx.draw(p, p.maxHp - p.hand.length, { reason: 'zhuohun' });
    await ctx.log(`【灼魂·改】：${q.name} 的勾玉变为${JADE_CN[cur]}色，你将手牌摸至体力上限（${p.hand.length}）`);
    if (cur === 'green') {
      q.flags.drawAsSha = g.turnCount;
      await ctx.log(`【灼魂·改】：绿色——${q.name} 本回合摸牌改为获得等量【杀】`);
    } else if (cur === 'yellow') {
      q.flags.nonLockedDisabled = g.turnCount;
      await ctx.log(`【灼魂·改】：黄色——${q.name} 本回合非锁定技失效`);
    } else {
      const dyingNow = g.players.some(x => x.alive && x.hp <= 0);
      if (!dyingNow) {
        await ctx.loseHp(q, Math.max(0, q.hp), { reason: 'zhuohun' });
        await ctx.log(`【灼魂·改】：红色——若无角色处于濒死状态，${q.name} 失去所有体力`);
      }
    }
  }
}

// ==================== 魔张飞 · 瞋视 ====================
// 锁定技，若其他角色的勾玉颜色与你：不同，你使用黑色【杀】能额外指定其为目标；
// 相同，你对其，或其对你使用的黑色【杀】改为【决斗】。
// 你因【杀】和【决斗】首次造成了或受到了至少3点伤害后，你回复1点体力，修改"灼魂"并入魔。
defineSkill({
  id: 'chenshi', name: '瞋视',
  desc: '锁定技，若其他角色的勾玉颜色与你：不同，你使用黑色【杀】能额外指定其为目标；相同，你对其，或其对你使用的黑色【杀】改为【决斗】。你因【杀】和【决斗】首次造成了或受到了至少3点伤害后，你回复1点体力，修改“灼魂”并入魔。',
  triggers: [
    {
      // 黑杀多指（勾玉异色）
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.card?.name === 'sha' && isBlack(d.card) && Array.isArray(d.targets),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, mine = jade(p);
        const extra = g.alive().filter(q => q !== p && !ctx.data.targets.includes(q) && jade(q) !== mine);
        if (!extra.length) return;
        for (const q of extra) ctx.data.targets.push(q);
        await ctx.log(`【瞋视】：黑色【杀】额外指定 ${extra.map(q => q.name).join('、')} 为目标（勾玉异色）`);
      },
    },
    {
      // 黑杀同色 → 改为【决斗】
      on: 'target.before', who: 'self', optional: false,
      filter: (d) => d.card?.name === 'sha' && isBlack(d.card) && d.target && d.target !== d.player
        && jade(d.target) === jade(d.player),
      async effect(ctx) {
        const p = ctx.self, t = ctx.data.target;
        ctx.data.canceled = true;
        p.flags.chenshiDuel = (p.flags.chenshiDuel || []).concat([t]);
        await ctx.log(`【瞋视】：${p.name} 与 ${t.name} 勾玉同色，黑色【杀】改为【决斗】`);
      },
    },
    {
      // 结算结束后对同色目标改打【决斗】
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.card?.name === 'sha' && (d.player.flags.chenshiDuel || []).length > 0,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const list = p.flags.chenshiDuel || [];
        p.flags.chenshiDuel = [];
        for (const t of list) {
          if (!t.alive) continue;
          await ctx.useCard({ from: p, card: VC('juedou'), targets: [t], reason: 'juedou', ignoreRange: true });
        }
      },
    },
    {
      // 累计 3 点【杀】/【决斗】伤害 → 回复 1 点并入魔
      on: 'damage.after', who: 'any', optional: false,
      filter: (d) => {
        const p = d.player;
        if (p.flags.chenshiDone) return false;
        const isShaOrDuel = d.card?.name === 'sha' || d.card?.name === 'juedou' || /juedou|sha/.test(String(d.reason || ''));
        return isShaOrDuel && (d.from === p || d.to === p);
      },
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, d = ctx.data;
        p.flags.chenshiDmg = (p.flags.chenshiDmg || 0) + (d.amount || 0);
        await ctx.log(`【瞋视】：因【杀】/【决斗】累计受伤/造成 ${p.flags.chenshiDmg} 点`);
        if (p.flags.chenshiDmg < 3) return;
        p.flags.chenshiDone = true;
        if (p.hp < p.maxHp) await ctx.recover(p, 1);
        await g.setForm(p, 'demon', '瞋视');
        await ctx.log('【瞋视】：你回复1点体力，修改「灼魂」并入魔');
      },
    },
  ],
});

// ==================== 魔孙权 · 权御 ====================
const QY_KEYS = ['baihong', 'qingming', 'pixie', 'zidian', 'baili', 'liuxing'];
const QY_CN = { baihong: '白虹', qingming: '青冥', pixie: '辟邪', zidian: '紫电', baili: '百里', liuxing: '流星' };
const QY_DESC = {
  baihong: '白虹：伤害+1', qingming: '青冥：目标+1', pixie: '辟邪：无视防具',
  zidian: '紫电：不可响应', baili: '百里：额外结算', liuxing: '流星：无次数限制',
};
defineSkill({
  id: 'quanyu', name: '权御',
  desc: '锁定技，每轮开始时，所有角色同时选择一项（每人每项限一次），然后若其中有角色与你的“权御”效果相同，你摸X张牌（X为其中与你相同的角色数且至多为3）：白虹：伤害+1；青冥：目标+1；辟邪：无视防具；紫电：不可响应；百里：额外结算；流星：无次数限制。你的【杀】指定唯一目标时，执行你选择的效果。（本实现覆盖其中 4 项：白虹、青冥、紫电、流星）',
  triggers: [
    {
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => roundStart(d.game),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        for (const q of g.alive()) {
          q.flags.quanyuUsed = q.flags.quanyuUsed || [];
          const avail = QY_KEYS.filter(k => !q.flags.quanyuUsed.includes(k));
          if (!avail.length) continue;
          const i = await ctx.ask.choose(q, avail.map(k => QY_DESC[k]).concat(['不选择']), { prompt: '【权御】：选择一项本局未选择过的效果', reason: 'quanyu' });
          const k = avail[i];
          if (!k) continue;
          q.flags.quanyu = k;
          q.flags.quanyuUsed.push(k);
        }
        const mine = p.flags.quanyu;
        if (!mine) return;
        const same = g.alive().filter(q => q !== p && q.flags.quanyu === mine);
        await ctx.log(`【权御】：本轮各角色效果——${g.alive().map(q => `${q.name}${QY_CN[q.flags.quanyu] || '—'}`).join('、')}`);
        if (same.length) {
          const n = Math.min(3, same.length);
          await ctx.draw(p, n, { reason: 'quanyu' });
          await ctx.log(`【权御】：${same.map(q => q.name).join('、')} 与你效果相同，你摸 ${n} 张牌`);
        }
      },
    },
    {
      // 青冥：目标+1 / 紫电：不可响应 / 流星：无次数限制
      on: 'card.use.before', who: 'self', optional: false,
      filter: (d) => d.card?.name === 'sha' && !!d.player.flags.quanyu && Array.isArray(d.targets),
      async effect(ctx) {
        const p = ctx.self, g = ctx.game, eff = p.flags.quanyu;
        if (eff === 'qingming') {
          const extra = g.alive().filter(q => q !== p && !ctx.data.targets.includes(q));
          if (extra.length) {
            ctx.data.targets.push(extra[0]);
            await ctx.log(`【权御·青冥】：${extra[0].name} 成为额外目标`);
          }
        } else if (eff === 'zidian') {
          ctx.data.unavoidable = true;
          await ctx.log('【权御·紫电】：此【杀】不可被响应');
        } else if (eff === 'liuxing') {
          p.flags.shaUnlimited = true;
          await ctx.log('【权御·流星】：本回合【杀】无次数限制');
        }
        // 乾纲（入魔）：额外执行目标选择过的权御效果
        if (p.form === 'demon') {
          const t = (ctx.data.targets || [])[0];
          const teff = t && t !== p ? t.flags.quanyu : null;
          if (teff === 'zidian') { ctx.data.unavoidable = true; await ctx.log('【乾纲】：目标选过紫电，此【杀】不可被响应'); }
          if (teff === 'liuxing') { p.flags.shaUnlimited = true; await ctx.log('【乾纲】：目标选过流星，本回合【杀】无次数限制'); }
          if (teff === 'qingming') {
            const extra = g.alive().filter(q => q !== p && !ctx.data.targets.includes(q));
            if (extra.length) { ctx.data.targets.push(extra[0]); await ctx.log(`【乾纲】：目标选过青冥，${extra[0].name} 成为额外目标`); }
          }
          if (teff === 'baihong') { p.flags.qiangangBonus = 1; await ctx.log('【乾纲】：目标选过白虹，此【杀】伤害+1'); }
        }
      },
    },
    {
      // 白虹：伤害+1
      on: 'damage.before', who: 'any', optional: false,
      filter: (d) => d.from === d.player && d.card?.name === 'sha' && (d.player.flags.quanyu === 'baihong' || d.player.flags.qiangangBonus),
      async effect(ctx) {
        const p = ctx.self;
        ctx.data.amount += 1;
        if (p.flags.qiangangBonus) p.flags.qiangangBonus = 0;
        await ctx.log('【权御·白虹】：此【杀】伤害+1');
      },
    },
  ],
});

// ==================== 魔孙权 · 天恩 ====================
// 锁定技，每回合每项各限一次，你使用牌指定唯一目标后：
// 若本轮你与其选择的"权御"效果不同，你随机弃置其一张牌，对其发动一次"权御"；
// 若与你相同，你获得一张不计入手牌上限的【杀】。
defineSkill({
  id: 'tianen', name: '天恩',
  desc: '锁定技，每回合每项各限一次，你使用牌指定唯一目标后：若本轮你与其选择的“权御”效果不同，你随机弃置其一张牌，对其发动一次“权御”；若与你相同，你获得一张不计入手牌上限的【杀】。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => Array.isArray(d.targets) && d.targets.length === 1 && d.targets[0] !== d.player && !!d.player.flags.quanyu,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game, t = ctx.data.targets[0];
      if (!t || !t.alive) return;
      p.flags.tianenUsed = p.flags.tianenUsed || {};
      const key = t.flags.quanyu === p.flags.quanyu ? 'same' : 'diff';
      if (p.flags.tianenUsed[key] === g.turnCount) return;
      p.flags.tianenUsed[key] = g.turnCount;
      if (key === 'same') {
        const c = VC('sha', 'spade', 7);
        c.noHandLimit = true;
        p.hand.push(c);
        await ctx.log(`【天恩】：${t.name} 与你权御相同，你获得一张不计入手牌上限的【杀】`);
        return;
      }
      const pool = t.hand.map(c => ({ c })).concat(Object.entries(t.equips).filter(([, v]) => v).map(([k, v]) => ({ c: v, slot: k })));
      if (pool.length) {
        const pick = pool[g.rng.int(pool.length)];
        if (pick.slot) { t.equips[pick.slot] = null; await g.trigger('equip.lose', { self: t, card: pick.c, slot: pick.slot }); }
        await ctx.discard(t, [pick.c], { reason: 'tianen' });
        await ctx.log(`【天恩】：${t.name} 权御与你不同，随机弃置其一张牌`);
      }
      const eff = p.flags.quanyu;
      if (eff === 'baihong') await ctx.damage({ from: p, to: t, amount: 1, reason: 'tianen' });
      else if (eff === 'qingming' || eff === 'pixie') {
        if (t.hand.length) await ctx.discard(t, [t.hand[g.rng.int(t.hand.length)]], { reason: 'tianen' });
      } else if (eff === 'baili') await ctx.damage({ from: p, to: t, amount: 1, reason: 'tianen' });
      else await ctx.draw(p, 1, { reason: 'tianen' });
      await ctx.log(`【天恩】：对其发动一次「权御」（${QY_CN[eff] || '—'}）`);
    },
  }],
});

// ==================== 魔孙权 · 乾纲 ====================
// 出牌阶段，你可失去"天恩"并入魔，然后你使用指定唯一目标的【杀】执行目标所选择过的"权御"效果。
defineSkill({
  id: 'qiangang', name: '乾纲',
  desc: '出牌阶段，你可失去“天恩”并入魔，然后你使用指定唯一目标的【杀】执行目标所选择过的“权御”效果。',
  active: {
    perTurn: true,
    prompt: '乾纲：失去【天恩】并入魔',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.form === 'demon') { await ctx.log('【乾纲】：你已经入魔'); return; }
      p.skills = p.skills.filter(s => s.id !== 'tianen');
      await g.setForm(p, 'demon', '乾纲');
      await ctx.log('【乾纲】：失去【天恩】并入魔，此后【杀】额外执行目标选择过的「权御」效果');
    },
  },
});
