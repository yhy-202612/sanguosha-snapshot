// 星将技能 · 第三批：星·周瑜 / 星·大乔 / 星·黄月英 / 星·黄忠 / 星·黄盖 / 星·陆逊 / 星·华佗 / 星·管辂
import { defineSkill, effSkills } from '../engine/skill.js';
import { cardLabel, CARD_META, SUIT_CN } from '../engine/cards.js';
import { EXTRA_VIRTUAL_RULES } from '../engine/virtual-extra.js';
import { VIRTUAL_RULES } from '../engine/game.js';

const roundOf = (g) => g.round ?? 0;
function onceRound(p, g, key) {
  const k = `r_${key}`;
  if (p.flags[k] === roundOf(g)) return false;
  p.flags[k] = roundOf(g);
  return true;
}

// ==================== 星·周瑜 ====================
// 【环灭】♣→铁索连环、♦→火攻、♥→杀（火杀在引擎里没有独立牌名，按普通【杀】结算）
// 注意：game.js 的 VIRTUAL_RULES 在模块装载时用展开语法复制了 EXTRA_VIRTUAL_RULES，
// 因此从技能文件往 EXTRA_VIRTUAL_RULES 里 push 不会生效（2026-10-26 修复），必须直接 push 进 VIRTUAL_RULES。
VIRTUAL_RULES.push(
  { skill: 'huanmie', as: 'tiesuo', test: (cards) => cards?.length === 1 && cards[0]?.suit === 'club' },
  { skill: 'huanmie', as: 'huogong', test: (cards) => cards?.length === 1 && cards[0]?.suit === 'diamond' },
  { skill: 'huanmie', as: 'sha', test: (cards) => cards?.length === 1 && cards[0]?.suit === 'heart' },
);
defineSkill({
  id: 'huanmie', name: '环灭',
  desc: '你可以将♣牌当【铁索连环】使用，♦牌当【火攻】使用，♥牌当【火杀】使用。你死亡后，每个角色都可以将♣牌当【铁索连环】使用。（火杀本实现按普通【杀】结算）',
  triggers: [{
    on: 'death.after', who: 'any', optional: false,
    filter: (d) => effSkills(d.self).some(s => s.id === 'huanmie'),
    async effect(ctx) {
      const g = ctx.game;
      for (const p of g.alive()) p.marks.huanmieXin = true;
      await ctx.log('【环灭】：周瑜死亡，所有角色均可将♣牌当【铁索连环】使用');
    },
  }],
});

// 燎原的结算触发器挂在【炽灼】持有者身上（附加技能本身不在任何人的 skills 表里）
const LIAOYUAN_TRIGGER = {
    // 引擎没有「横置状态变化」事件，用【铁索连环】被使用作为横置入口（这是唯一的横置来源）
    on: 'card.use.after', who: 'any', optional: false,
    filter: (d) => (d.card?.name === 'tiesuo' || d.asName === 'tiesuo') && Array.isArray(d.targets) && d.targets.some(t => t?.marks?.liaoyuan),
    async effect(ctx) {
      const t = (ctx.data.targets || []).find(x => x?.marks?.liaoyuan);
      if (!t || !t.alive) return;
      if (t.hand.length >= 2) {
        await ctx.discard(t, t.hand.slice(0, 2), { reason: 'liaoyuan' });
        await ctx.log(`【燎原】：${t.name} 弃置两张手牌`);
      } else {
        await ctx.log(`【燎原】：${t.name} 未弃置两张手牌，受到 1 点火焰伤害`);
        await ctx.damage({ from: null, to: t, amount: 1, nature: 'fire', card: null, reason: 'liaoyuan' });
      }
    },
};

// 【炽灼】觉醒技：死亡时回复至 2 点复活，分配四张【火毒】，全场获得【燎原】
defineSkill({
  id: 'chizhuo', name: '炽灼',
  desc: '觉醒技，当你死亡时，你回复至 2 点体力复活，并分配四张明置的【火毒】给任意角色（【火毒】可视为【火攻】使用，若此【火攻】未成功则失去 1 点体力），然后所有角色获得【燎原】。',
  triggers: [{
    on: 'death.before', who: 'self', optional: true,
    filter: (d) => !d.player?.flags.chizhuoUsed,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.flags.chizhuoUsed = true;
      ctx.data.canceled = true;          // 阻止本次死亡
      p.alive = true;
      p.hp = 2;
      await ctx.log(`【炽灼】：${p.name} 回复至 2 点体力复活，分配四张【火毒】`);
      for (let i = 0; i < 4; i++) {
        const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive(), prompt: '【炽灼】：选择一名角色获得【火毒】' });
        if (!ts.length) break;
        ts[0].marks.huodu = (ts[0].marks.huodu || 0) + 1;
        await ctx.log(`【炽灼】：${ts[0].name} 获得一张明置【火毒】（共 ${ts[0].marks.huodu}）`);
      }
      for (const q of g.alive()) q.marks.liaoyuan = true;
      await ctx.log('【炽灼】：所有角色获得【燎原】');
    },
  }, LIAOYUAN_TRIGGER],
});

// 【火毒】明置标记：受火焰伤害 +1（近似「视为【火攻】使用，未成功则失去 1 点体力」）
defineSkill({
  id: 'huodu', name: '火毒',
  desc: '明置的火毒：你可以视其为【火攻】使用，当你未使此【火攻】触发成功而失去它时，失去 1 点体力。（本实现：带有火毒的角色受到火焰伤害时伤害 +1）',
  triggers: [{
    on: 'damage.before', who: 'any', optional: false,
    filter: (d) => (d.to?.marks?.huodu || 0) > 0 && d.nature === 'fire',
    async effect(ctx) {
      const t = ctx.data.to;
      ctx.data.amount = (ctx.data.amount || 1) + 1;
      t.marks.huodu -= 1;
      await ctx.log(`【火毒】：${t.name} 受到火焰伤害 +1（剩余火毒 ${t.marks.huodu}）`);
    },
  }],
});

// 【燎原】锁定：横置或取消横置时弃两张手牌，否则受 1 点无来源火焰伤害
defineSkill({
  id: 'liaoyuan', name: '燎原',
  locked: true,   // 持恒技+锁定技：同上
  desc: '持恒技、锁定技，当你横置或取消横置时，你弃置两张手牌，否则受到 1 点无来源火焰伤害。（附加技能：由【炽灼】发放，判定挂在【炽灼】持有者身上扫描全场）',
});
// ==================== 星·大乔 ====================
// 【月魂】6 点月之尘；消耗 1 点把一张手牌明置为【月魂】牌；使用后选两项
defineSkill({
  id: 'yuehun', name: '月魂',
  desc: '游戏开始时，你获得 6 点「月之尘」。持恒技，你可以消耗 1 点「月之尘」，将一张手牌明置，称为【月魂】牌；当你使用或打出【月魂】牌时，你选择两项（不可重复）：①摸一张牌；②回复 1 点体力；③跳过任一角色下回合的任一阶段。',
  triggers: [
    { on: 'game.start', who: 'any', optional: false, async effect(ctx) { ctx.self.marks.yuechen = 6; await ctx.log('【月魂】：获得 6 点月之尘'); } },
    {
      on: 'card.use.after', who: 'self', optional: true,
      filter: (d) => !!d.self?.flags?.yuehunCard && d.card === d.self.flags.yuehunCard,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        p.flags.yuehunCard = null;
        const picks = [];
        const opts = ['摸一张牌', '回复 1 点体力', '跳过一名角色下回合的一个阶段'];
        for (let i = 0; i < 2; i++) {
          const idx = await ctx.ask.choose(p, opts.map((o, j) => (picks.includes(j) ? `${o}（已选）` : o)), { prompt: `【月魂】：选择第 ${i + 1} 项` });
          if (idx < 0 || picks.includes(idx)) break;
          picks.push(idx);
          if (idx === 0) await ctx.draw(p, 1, { reason: 'yuehun' });
          else if (idx === 1) await ctx.recover(p, 1, { reason: 'yuehun' });
          else {
            const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive(), prompt: '【月魂】：选择一名角色，跳过其下回合的哪个阶段' });
            if (ts.length) {
              const ph = await ctx.ask.choose(p, ['摸牌阶段', '出牌阶段', '弃牌阶段'], { prompt: '【月魂】：跳过哪个阶段' });
              const key = ['draw', 'play', 'discard'][ph] || 'play';
              ts[0].flags[`skipNext_${key}`] = true;
              await ctx.log(`【月魂】：${ts[0].name} 下回合跳过${['摸牌', '出牌', '弃牌'][ph] || '出牌'}阶段`);
            }
          }
        }
      },
    },
    {
      // skipNext_* 在目标回合开始时转成跳过标记
      on: 'turn.begin', who: 'any', optional: false,
      filter: (d) => ['draw', 'play', 'discard'].some(k => d.player?.flags?.[`skipNext_${k}`]),
      async effect(ctx) {
        const p = ctx.data.player, g = ctx.game;
        for (const k of ['draw', 'play', 'discard']) {
          if (p.flags[`skipNext_${k}`]) {
            p.flags[`skipNext_${k}`] = false;
            ctx.skipPhase(p, k);
            await ctx.log(`${p.name} 因【月魂】跳过${k === 'draw' ? '摸牌' : k === 'play' ? '出牌' : '弃牌'}阶段`);
          }
        }
      },
    },
  ],
  active: {
    prompt: '消耗 1 点月之尘明置一张手牌为【月魂】',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if ((p.marks.yuechen || 0) < 1) { await ctx.log('【月魂】：月之尘不足'); return; }
      if (!p.hand.length) return;
      const res = await g.ask(p, 'cards', { prompt: '【月魂】：选择要明置的手牌', cards: p.hand.map(c => c.id), min: 1, max: 1 });
      const c = (res?.cardIds || []).map(id => p.hand.find(x => x.id === id)).filter(Boolean)[0];
      if (!c) return;
      p.marks.yuechen -= 1;
      p.flags.yuehunCard = c;
      await ctx.log(`【月魂】：明置 ${cardLabel(c)} 为【月魂】牌（月之尘剩余 ${p.marks.yuechen}）`);
    },
  },
});

// 【月色】造成或受到属性伤害时，可弃一张牌获得 1 点月之尘并令伤害来源跳过下回合出牌阶段
defineSkill({
  id: 'yuese', name: '月色',
  desc: '当你造成或受到属性伤害时，你可以弃置一张牌，获得 1 点「月之尘」，并令伤害来源跳过其下回合的出牌阶段。',
  triggers: [{
    on: 'damage.after', who: 'any', optional: true,
    filter: (d) => !!d.player && (d.from === d.player || d.to === d.player) && (d.nature === 'fire' || d.nature === 'thunder'),
    async effect(ctx) {
      const p = ctx.self;
      if (!p.alive) return;
      const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (!pool.length) return;
      const res = await ctx.game.ask(p, 'cards', { prompt: '【月色】：弃置一张牌获得 1 点月之尘', cards: pool.map(c => c.id), min: 1, max: 1 });
      const c = (res?.cardIds || []).map(id => pool.find(x => x.id === id)).filter(Boolean)[0];
      if (!c) return;
      await ctx.discard(p, [c], { reason: 'yuese' });
      p.marks.yuechen = (p.marks.yuechen || 0) + 1;
      const src = ctx.data.from;
      if (src && src.alive && src !== p) {
        src.flags.skipNext_play = true;
        await ctx.log(`【月色】：${p.name} 获得 1 点月之尘，${src.name} 下回合跳过出牌阶段`);
      } else {
        await ctx.log(`【月色】：${p.name} 获得 1 点月之尘`);
      }
    },
  }],
});

// ==================== 星·黄月英 ====================
// 【天纵】牌进弃牌堆时，若天纵牌不含同名牌，二选一
defineSkill({
  id: 'tianzong', name: '天纵',
  desc: '持恒技，当一张牌进入弃牌堆时，若【天纵】牌中不含同名牌，你可以选择一项：①获得 2 点「心之谕」；②消耗 1 点「心之谕」，将此牌置入【天纵】，然后你摸一张牌再弃一张牌。',
  triggers: [{
    on: 'cards.discard', who: 'any', optional: true,
    filter: (d) => Array.isArray(d.cards) && d.cards.length > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.tianzongBusy) return;                     // 【天纵】自身效果产生的弃牌不再触发
      const card = (ctx.data.cards || [])[0];
      if (!card) return;
      const list = p.marks.tianzong || [];
      if (list.includes(card.name)) return;                 // 【天纵】里已有同名牌
      if ((p.flags.tianzongTurn === g.turnCount && (p.flags.tianzongCount || 0) >= 2)) return;  // 每回合最多 2 次，防刷屏
      if (p.flags.tianzongTurn !== g.turnCount) { p.flags.tianzongTurn = g.turnCount; p.flags.tianzongCount = 0; }
      const opts = ['获得 2 点心之谕'];
      if ((p.marks.xinzhiyu || 0) >= 1) opts.push(`消耗 1 点心之谕，将 ${cardLabel(card)} 置入【天纵】`);
      const idx = await ctx.ask.choose(p, opts, { prompt: '【天纵】：选择一项' });
      if (idx === 0) {
        p.marks.xinzhiyu = (p.marks.xinzhiyu || 0) + 2;
        await ctx.log(`【天纵】：获得 2 点心之谕（当前 ${p.marks.xinzhiyu}）`);
      } else if (idx === 1) {
        p.flags.tianzongBusy = true;
        p.marks.xinzhiyu -= 1;
        p.flags.tianzongCount = (p.flags.tianzongCount || 0) + 1;
        // 关键：必须在 cards.discard 里用 taken「接走」这张牌。
        // 只调 takeCard 摘牌是不够的——discardCards 会按「trigger 前牌还在原主区域」把它再推进弃牌堆，
        // 结果牌既在弃牌堆又算进了【天纵】，玩家看到的就是「发动了但没效果」。
        if (Array.isArray(ctx.data.taken)) ctx.data.taken.push(card);
        await g.takeCard(card);
        g.exileCards([card]);                     // 置入【天纵】＝移出游戏（记账保证牌张守恒）
        p.marks.tianzong = [...list, card.name];
        p.flags.tianzongCards = [...(p.flags.tianzongCards || []), card];
        await ctx.log(`【天纵】：${cardLabel(card)} 置入【天纵】（现有 ${p.marks.tianzong.length} 种牌名）`);
        try {
          await ctx.draw(p, 1, { reason: 'tianzong' });
          if (p.hand.length) await ctx.discard(p, [p.hand[0]], { reason: 'tianzong' });
        } finally {
          p.flags.tianzongBusy = false;
        }
      }
    },
  }],
});

// 【机衡】摸牌阶段：可消耗 1 点心之谕取回天纵牌；否则二选一
defineSkill({
  id: 'jiheng', name: '机衡',
  desc: '摸牌阶段，你可以消耗 1 点「心之谕」，将【天纵】牌中的任意张置入手牌；否则，你选择一项：①获得 2 点「心之谕」；②对一名角色造成 1 点伤害。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const owns = (p.marks.tianzong || []).length;
      if (owns && (p.marks.xinzhiyu || 0) >= 1) {
        const yes = await ctx.ask.confirm(p, `【机衡】：消耗 1 点心之谕，把【天纵】中的牌置入手牌？`);
        if (yes) {
          p.marks.xinzhiyu -= 1;
          const cards = (p.flags.tianzongCards || []).slice();
          p.flags.tianzongCards = [];
          p.marks.tianzong = [];
          // 天纵牌存放在「移出游戏」区，取回时把它从 exilePile 摘出来再交给玩家
          for (const c of cards) {
            const k = (g.exilePile || []).indexOf(c);
            if (k >= 0) g.exilePile.splice(k, 1);
          }
          if (cards.length) {
            await ctx.gain(p, cards, { reason: 'jiheng' });
            await ctx.log(`【机衡】：取回 ${cards.length} 张【天纵】牌（${cards.map(cardLabel).join('、')}）`);
          }
          return;
        }
      }
      const idx = await ctx.ask.choose(p, ['获得 2 点心之谕', '对一名角色造成 1 点伤害'], { prompt: '【机衡】：选择一项' });
      if (idx === 0) {
        p.marks.xinzhiyu = (p.marks.xinzhiyu || 0) + 2;
        await ctx.log(`【机衡】：获得 2 点心之谕（当前 ${p.marks.xinzhiyu}）`);
      } else if (idx === 1) {
        const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【机衡】：选择一名角色造成 1 点伤害' });
        if (ts.length) await ctx.damage({ from: p, to: ts[0], amount: 1, card: null, reason: 'jiheng' });
      }
    },
  }],
});

// 【锁星】限定技：消耗 4 点心之谕，令一名角色选择：①失去所有牌并进入濒死；②失去所有武将技能。
//         然后你失去所有牌并变为 1 点体力。
defineSkill({
  id: 'suoxing', name: '锁星',
  desc: '限定技，你消耗 4 点「心之谕」，令一名角色选择：①失去所有牌并进入濒死状态；②失去所有武将技能。然后你失去所有牌并变为 1 点体力。',
  active: {
    prompt: '消耗 4 点心之谕，令一名角色选择：失去所有牌并濒死 / 失去所有技能',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.suoxingUsed) { await ctx.log('【锁星】：限定技已使用'); return; }
      if ((p.marks.xinzhiyu || 0) < 4) { await ctx.log('【锁星】：心之谕不足 4 点'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【锁星】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      p.flags.suoxingUsed = true;
      p.marks.xinzhiyu -= 4;
      // 「令一名角色选择」= 由目标本人二选一（此前只实现了 ①）
      const idx = await ctx.ask.choose(t, ['① 失去所有牌并进入濒死状态', '② 失去所有武将技能'], { prompt: '【锁星】：请选择一项' });
      if (idx === 1) {
        await g.disableSkills(t, { includeLocked: true, reason: '锁星' });
        await ctx.log(`【锁星】：${t.name} 选择失去所有武将技能`);
      } else {
        const all = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
        if (all.length) await ctx.discard(t, all, { reason: 'suoxing' });
        await ctx.log(`【锁星】：${t.name} 选择失去所有牌并进入濒死状态`);
        await g.setHp(t, 0, { from: p, reason: 'suoxing' });
      }
      const mine = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
      if (mine.length) await ctx.discard(p, mine, { reason: 'suoxing' });
      await g.setHp(p, 1, { reason: 'suoxing' });
      await ctx.log(`【锁星】：${p.name} 失去所有牌，体力变为 1`);
    },
  },
});

// ==================== 星·黄忠 ====================
// 【烈影】使用/打出的牌点数未记录则记录并摸一张
defineSkill({
  id: 'lieying', name: '烈影',
  desc: '锁定技，你使用或打出的牌若点数未被记录，则记录，称为【烈影】，然后你摸一张牌。',
  triggers: [{
    on: 'card.use.after', who: 'self', optional: false,
    filter: (d) => !!d.card && d.card.num != null,
    async effect(ctx) {
      const p = ctx.self;
      const nums = p.marks.lieying || [];
      if (nums.includes(ctx.data.card.num)) return;
      p.marks.lieying = [...nums, ctx.data.card.num];
      await ctx.log(`【烈影】：记录点数 ${ctx.data.card.num}（共 ${p.marks.lieying.length} 种），摸一张牌`);
      await ctx.draw(p, 1, { reason: 'lieying' });
    },
  }],
});

// 【天杀】把烈影牌当【杀】使用，可选叠加四种附加效果
defineSkill({
  id: 'tiansha', name: '天杀',
  desc: '持恒技，你可以将一张【烈影】牌当【杀】使用或打出，此时你可以选择（可多选、叠加）：①消耗一张♥【烈影】回复 1 点体力；②消耗一张♣【烈影】对目标造成 1 点雷电伤害；③消耗一张♦【烈影】获得目标一张牌；④消耗一张☆【烈影】无距离限制、可用次数 +1。（本实现：以已记录点数代表【烈影】，④ 省略；四项各选满 2 次则目标立即进入濒死）',
  active: {
    prompt: '烈影当【杀】：对一名角色造成伤害并叠加附加效果',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const nums = p.marks.lieying || [];
      if (!nums.length) { await ctx.log('【天杀】：还没有【烈影】记录'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【天杀】：选择目标' });
      if (!ts.length) return;
      const t = ts[0];
      const useNums = nums.slice(0, 1);
      p.marks.lieying = nums.filter(n => !useNums.includes(n));
      await ctx.log(`【天杀】：将【烈影】（点数 ${useNums[0]}）当【杀】对 ${t.name} 使用`);
      await ctx.damage({ from: p, to: t, amount: 1, card: null, reason: 'tiansha' });
      const cnt = p.marks.tianshaCount || { heal: 0, thunder: 0, steal: 0 };
      const opts = [];
      if (p.marks.lieying?.length) {
        opts.push('①消耗一张【烈影】回复 1 点体力');
        opts.push('②消耗一张【烈影】对其造成 1 点雷电伤害');
        opts.push('③消耗一张【烈影】获得其一张牌');
      }
      if (!opts.length) return;
      const idx = await ctx.ask.choose(p, opts, { prompt: '【天杀】：是否叠加附加效果（取消＝结算完毕）' });
      if (idx < 0) return;
      const pick = (p.marks.lieying || []).slice(0, 1);
      p.marks.lieying = (p.marks.lieying || []).filter(n => !pick.includes(n));
      if (idx === 0) {
        cnt.heal += 1;
        await ctx.recover(p, 1, { reason: 'tiansha' });
        await ctx.log('【天杀】：①回复 1 点体力');
      } else if (idx === 1) {
        cnt.thunder += 1;
        await ctx.damage({ from: p, to: t, amount: 1, nature: 'thunder', card: null, reason: 'tiansha' });
        await ctx.log('【天杀】：②造成 1 点雷电伤害');
      } else {
        cnt.steal += 1;
        const got = await g.chooseCardFrom(p, t, { reason: 'tiansha' });
        if (got) await ctx.gain(p, [got], { from: t, reason: 'tiansha' });
        await ctx.log('【天杀】：③获得目标一张牌');
      }
      p.marks.tianshaCount = cnt;
      if (cnt.heal >= 2 && cnt.thunder >= 2 && cnt.steal >= 2 && t.alive) {
        await ctx.log(`【天杀】：三项各达 2 次，${t.name} 立即进入濒死状态`);
        await g.loseHp(t, Math.max(1, t.hp), { reason: 'tiansha' });
      }
    },
  },
});

// ==================== 星·黄盖 ====================
// 【苦肉】随时可失去 1 点体力；每损失 1 点体力选两项
defineSkill({
  id: 'kurou_star', name: '苦肉',
  desc: '持恒技，你可以随时失去 1 点体力；锁定技，你每损失 1 点体力，选择其中两项：①对伤害来源造成 1 点伤害；②摸两张牌；③获得 1 点护甲。',
  active: {
    prompt: '失去 1 点体力（随后选两项补偿）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const from = p.flags.kurouFrom || null;
      p.flags.kurouFrom = null;
      await ctx.log('【苦肉】：失去 1 点体力');
      await ctx.loseHp(p, 1, { reason: 'kurou_star' });
      const opts = ['①摸两张牌', '②获得 1 点护甲'];
      if (from && from.alive && from !== p) opts.unshift('①对伤害来源造成 1 点伤害');
      const picks = [];
      for (let i = 0; i < 2; i++) {
        const idx = await ctx.ask.choose(p, opts.map((o, j) => (picks.includes(j) ? `${o}（已选）` : o)), { prompt: `【苦肉】：选择第 ${i + 1} 项` });
        if (idx < 0) break;
        if (picks.includes(idx)) continue;
        picks.push(idx);
        const label = opts[idx];
        if (label.startsWith('①对伤害来源')) {
          await ctx.damage({ from: p, to: from, amount: 1, card: null, reason: 'kurou_star' });
        } else if (label.startsWith('①摸')) {
          await ctx.draw(p, 2, { reason: 'kurou_star' });
        } else {
          await g.addArmor(p, 1);
          await ctx.log(`【苦肉】：获得 1 点护甲（${p.armor}/${p.armorMax}）`);
        }
      }
    },
  },
  triggers: [{
    on: 'hp.lose', who: 'self', optional: false,
    filter: (d) => !!d.from && d.from !== d.player,
    async effect(ctx) { ctx.self.flags.kurouFrom = ctx.data.from.id; },
  }],
});

// 【空甲】未装备防具时，每损失 1 点护甲可判定
defineSkill({
  id: 'kongjia', name: '空甲',
  desc: '当你未装备防具时，你每损失 1 点护甲值，你可以进行判定：若为装备牌，你获得之；若为基本牌，视为你对自己使用了这张牌。',
  triggers: [{
    on: 'damage.after', who: 'self', optional: true,
    filter: (d) => d.to === d.player && (d.armorAbsorbed || 0) > 0 && !d.player.equips.armor,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const lost = ctx.data.armorAbsorbed || 0;
      for (let i = 0; i < lost; i++) {
        const jd = await ctx.judge(p, { reason: 'kongjia' });
        const meta = CARD_META[jd.card?.name];
        if (!meta) continue;
        if (meta.type === 'equip') {
          // judge() 已把判定牌放进弃牌堆，必须先摘出来再获得，否则同一张牌会双区域
          const k = g.discardPile.indexOf(jd.card);
          if (k >= 0) g.discardPile.splice(k, 1);
          await ctx.gain(p, [jd.card], { reason: 'kongjia' });
          await ctx.log(`【空甲】：判定 ${cardLabel(jd.card)}，获得之`);
        } else if (meta.type === 'basic') {
          await ctx.log(`【空甲】：判定 ${cardLabel(jd.card)}，视为对自己使用`);
          if (jd.card.name === 'tao') await ctx.recover(p, 1, { reason: 'kongjia' });
          else if (jd.card.name === 'jiu') p.flags.jiu = (p.flags.jiu || 0) + 1;
          // 判定牌已在弃牌堆，不要再 push
        }
      }
    },
  }],
});

// 【降怒】重算：护甲值 → 攻击范围/出杀次数加成
// ★走独立字段 rangeBonusArmor / shaExtraArmor：rangeBonus 与 shaExtra 是累加型字段
//   （多处 +=1），用 `=` 赋值会把别人的加成清掉（SG029 BLOCKER-3）。
function recalcJiangnu(p) {
  if (!p) return;
  p.flags.rangeBonusArmor = p.armor || 0;
  p.flags.shaExtraArmor = p.armor || 0;
}

// 【降怒】锁定：攻击范围与出杀次数 +X（X 为护甲值）
defineSkill({
  id: 'jiangnu', name: '降怒',
  desc: '锁定技，你的攻击范围与可出【杀】次数 +X（X 为你的护甲值）。',
  triggers: [
    {
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) { recalcJiangnu(ctx.self); },
    },
    {
      // ★护甲值可能在回合内变化，必须监听 armor.change（不是 equip.change）：
      //   护甲不是装备，护甲增减不会触发装备事件 —— 旧实现挂 equip.change「获得/失去防具」，
      //   实际护甲由技能改动，数值永不刷新（SG029 BLOCKER-3）。
      on: 'armor.change', who: 'self', optional: false,
      async effect(ctx) { recalcJiangnu(ctx.self); },
    },
  ],
});

// ==================== 星·陆逊 ====================
// 【锁焰】锁定：所有角色视为装备不可重铸的【铁索连环】；铁索无法重置横置角色
defineSkill({
  id: 'suoyan', name: '锁焰',
  desc: '锁定技，所有角色均视为不可重铸的【铁索连环】；所有【铁索连环】无法重置横置角色。',
  triggers: [
    {
      on: 'game.start', who: 'any', optional: false,
      async effect(ctx) {
        ctx.self.marks.suoyan = true;
        for (const p of ctx.game.alive()) p.chained = true;
        await ctx.log('【锁焰】：所有角色视为不可重铸的【铁索连环】（全场横置，且无法重置）');
      },
    },
    {
      // 引擎在传导伤害后会把 chained 置 false，本技能把「不可重置」落成每个回合开始重置回 true
      on: 'turn.begin', who: 'self', optional: false,
      async effect(ctx) {
        if (!ctx.self.alive) return;
        let fixed = 0;
        for (const p of ctx.game.alive()) if (!p.chained) { p.chained = true; fixed += 1; }
        if (fixed) await ctx.log(`【锁焰】：${fixed} 名角色重新横置`);
      },
    },
  ],
});

// 【金星】出牌阶段限一次：重铸任意张不带「火」字的牌并摸一张
defineSkill({
  id: 'jinxing', name: '金星',
  desc: '出牌阶段限一次，你可以重铸任意张不带「火」字的牌，并摸一张牌。',
  active: {
    perPhase: true,
    prompt: '重铸任意张牌并摸一张',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pool = p.hand.filter(c => !(CARD_META[c.name]?.cn || '').includes('火'));
      if (!pool.length) { await ctx.log('【金星】：没有可重铸的牌'); return; }
      const res = await g.ask(p, 'cards', { prompt: '【金星】：选择要重铸的牌', cards: pool.map(c => c.id), min: 0, max: pool.length, optional: true });
      const cards = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
      if (!cards.length) return;
      await ctx.discard(p, cards, { reason: 'jinxing' });
      await ctx.draw(p, cards.length + 1, { reason: 'jinxing' });
      await ctx.log(`【金星】：重铸 ${cards.length} 张牌，摸 ${cards.length + 1} 张`);
    },
  },
});

// 【焚营】出牌阶段限一次：若已横置，对自己造成 1 点火焰伤害，然后判定
defineSkill({
  id: 'fenying', name: '焚营',
  desc: '出牌阶段限一次，若你已横置，你可以对自己造成 1 点火焰伤害，然后你判定：若为红色，你重置并摸 2 张牌；若为黑色，你可以弃 2 张牌回复 2 点体力。',
  active: {
    perTurn: true,
    prompt: '焚营（需已横置）',
    async effect(ctx) {
      const p = ctx.self;
      if (!p.chained) { await ctx.log('【焚营】：你未横置，不能发动'); return; }
      await ctx.log('【焚营】：对自己造成 1 点火焰伤害');
      await ctx.damage({ from: p, to: p, amount: 1, nature: 'fire', card: null, reason: 'fenying' });
      p.flags.fenyingUsed = true;
      const jd = await ctx.judge(p, { reason: 'fenying' });
      const red = jd.suit === 'heart' || jd.suit === 'diamond';
      if (red) {
        p.chained = false;
        await ctx.log(`【焚营】：判定 ${cardLabel(jd.card)} 红色，重置并摸 2 张牌`);
        await ctx.draw(p, 2, { reason: 'fenying' });
      } else {
        await ctx.log(`【焚营】：判定 ${cardLabel(jd.card)} 黑色，可弃 2 张牌回复 2 点体力`);
        if (p.hand.length >= 2) {
          const yes = await ctx.ask.confirm(p, '【焚营】：是否弃置两张牌回复 2 点体力？');
          if (yes) { await ctx.discard(p, p.hand.slice(0, 2), { reason: 'fenying' }); await ctx.recover(p, 2, { reason: 'fenying' }); }
        }
      }
    },
  },
});

// 【山火】锁定：若曾使用【焚营】，连环状态传导伤害后不会重置；可弃 1 张牌重置【焚营】
defineSkill({
  id: 'shanhuo', name: '山火',
  desc: '锁定技，若你曾使用过【焚营】，连环状态传导伤害后不会重置；你可以弃置 1 张牌重置【焚营】。（本实现：弃 1 张牌使【焚营】本回合可再次发动）',
  active: {
    prompt: '弃 1 张牌重置【焚营】',
    async effect(ctx) {
      const p = ctx.self;
      if (!p.flags.fenyingUsed) { await ctx.log('【山火】：本回合未使用过【焚营】'); return; }
      if (!p.hand.length) return;
      await ctx.discard(p, [p.hand[0]], { reason: 'shanhuo' });
      delete p.flags.act_fenying;
      await ctx.log('【山火】：弃 1 张牌，【焚营】本回合可再次发动');
    },
  },
});

// ==================== 星·华佗 ====================
// 【采药】把手牌/场上牌置于武将牌上称「散」；使用「散」结算花色效果
defineSkill({
  id: 'caiyao', name: '采药',
  desc: '持恒技，你可以将一张手牌或场上一张牌（每轮限一次）置于你的武将牌上，称为「散」。每回合限一次，你可以弃置最上方的「散」并弃置牌堆顶一张牌，根据其花色：①均为黑色：你可以从一名角色处获得手牌直到获得黑色牌；②均为红色：体力回复至场上最高，原体力大于 1 时至多回复 2 点；③颜色不同：你摸一张牌。然后你弃置一张牌或失去 1 点体力。',
  active: {
    prompt: '采药：把一张手牌置于武将牌上',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const opts = [];
      if (p.hand.length) opts.push('将一张手牌置于武将牌上（散）');
      if ((p.marks.san || []).length) opts.push('使用最上方的「散」结算');
      const idx = await ctx.ask.choose(p, opts, { prompt: '【采药】：选择一项' });
      if (idx === 0) {
        const res = await g.ask(p, 'cards', { prompt: '【采药】：选择要扣置的手牌', cards: p.hand.map(c => c.id), min: 1, max: 1 });
        const c = (res?.cardIds || []).map(id => p.hand.find(x => x.id === id)).filter(Boolean)[0];
        if (!c) return;
        const i = p.hand.indexOf(c);
        p.hand.splice(i, 1);
        g.exileCards([c]);
        p.marks.san = [...(p.marks.san || []), { name: c.name, suit: c.suit, num: c.num }];
        await ctx.log(`【采药】：${cardLabel(c)} 成为「散」（共 ${p.marks.san.length} 张）`);
        return;
      }
      if (idx === 1) {
        const san = p.marks.san || [];
        if (!san.length) return;
        const top = san[san.length - 1];
        p.marks.san = san.slice(0, -1);
        const topCard = g.popDeck(1)[0];
        if (!topCard) return;
        const aBlack = top.suit === 'spade' || top.suit === 'club';
        const bBlack = topCard.suit === 'spade' || topCard.suit === 'club';
        await ctx.log(`【采药】：散为${SUIT_CN[top.suit] || '?'}，弃牌堆顶为 ${cardLabel(topCard)}`);
        if (aBlack && bBlack) {
          const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p && t.hand.length), prompt: '【采药】：从谁那里获得手牌（直到获得黑色牌）' });
          if (ts.length) {
            const t = ts[0];
            const got = [];
            while (t.hand.length && got.length < 4) {
              const c = t.hand[0];
              const i = t.hand.indexOf(c);
              t.hand.splice(i, 1);
              got.push(c);
              if (c.suit === 'spade' || c.suit === 'club') break;
            }
            if (got.length) {
              p.hand.push(...got);
              await ctx.log(`【采药】：从 ${t.name} 处获得 ${got.length} 张牌`);
            }
          }
        } else if (!aBlack && !bBlack) {
          const maxHp = Math.max(...g.alive().map(x => x.hp));
          const heal = Math.min(2, Math.max(0, maxHp - p.hp));
          if (heal > 0) await ctx.recover(p, heal, { reason: 'caiyao' });
          await ctx.log(`【采药】：均为红色，回复 ${heal} 点体力（至 ${p.hp}）`);
        } else {
          await ctx.draw(p, 1, { reason: 'caiyao' });
        }
        g.pushDiscard([topCard]);
        // 结算后：弃一张牌或失去 1 点体力
        if (p.hand.length) {
          const yes = await ctx.ask.confirm(p, '【采药】：弃置一张牌？（取消＝失去 1 点体力）');
          if (yes) await ctx.discard(p, [p.hand[0]], { reason: 'caiyao' });
          else await ctx.loseHp(p, 1, { reason: 'caiyao' });
        } else {
          await ctx.loseHp(p, 1, { reason: 'caiyao' });
        }
      }
    },
  },
});

// ==================== 星·管辂 ====================
// 【星蛊】扣置三张牌让目标猜牌名
defineSkill({
  id: 'xinggu', name: '星蛊',
  desc: '你可以将三张牌有序扣置，并选定一名角色令其猜测牌名与花色：①猜中 0~1 个：其翻面并失去 1 点体力；②猜中 2~4 个：你翻面并摸三张牌；③猜中 5~6 个：你进入濒死状态。然后这三张牌进入弃牌堆。（实现：按牌名命中数判定）',
  active: {
    prompt: '星蛊：扣置三张手牌让目标猜牌名',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.hand.length < 3) { await ctx.log('【星蛊】：手牌不足三张'); return; }
      if (!onceRound(p, g, 'xinggu')) { await ctx.log('【星蛊】：本轮已发动过'); return; }
      const res = await g.ask(p, 'cards', { prompt: '【星蛊】：选择三张扣置的牌', cards: p.hand.map(c => c.id), min: 3, max: 3 });
      const picked = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean).slice(0, 3);
      if (picked.length < 3) return;
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【星蛊】：选择猜测的角色' });
      if (!ts.length) return;
      const t = ts[0];
      const NAME_POOL = ['sha', 'shan', 'tao', 'jiu', 'wuzhong', 'guohe', 'shunshou', 'juedou'];
      let hit = 0;
      for (const c of picked) {
        const idx = await ctx.ask.choose(t, NAME_POOL.map(n => CARD_META[n].cn), { prompt: '【星蛊】：猜一张牌的牌名' });
        const guess = NAME_POOL[idx] || NAME_POOL[0];
        if (guess === c.name) hit += 1;
        await ctx.log(`【星蛊】：${t.name} 猜「${CARD_META[guess].cn}」${guess === c.name ? '✓' : '✗'}`);
      }
      for (const c of picked) {
        const i = p.hand.indexOf(c);
        if (i >= 0) p.hand.splice(i, 1);
      }
      g.pushDiscard(picked);
      await ctx.log(`【星蛊】：猜中 ${hit} 个`);
      if (hit <= 1) {
        await ctx.flip(t);
        await ctx.loseHp(t, 1, { reason: 'xinggu' });
      } else if (hit <= 4) {
        await ctx.flip(p);
        await ctx.draw(p, 3, { reason: 'xinggu' });
      } else {
        await ctx.loseHp(p, Math.max(1, p.hp), { reason: 'xinggu' });
      }
    },
  },
});

// 【域流】锁定：场上有人翻面时你摸一张
defineSkill({
  id: 'yuliu', name: '域流',
  desc: '锁定技，当场上有人翻面时，你摸一张牌。',
  triggers: [{
    on: 'flip.after', who: 'any', optional: false,
    filter: (d) => !!d.player?.alive && (d.player.flags?.yuliuTurn !== d.game.turnCount),
    async effect(ctx) {
      const p = ctx.self;
      p.flags.yuliuTurn = ctx.game.turnCount;
      await ctx.log('【域流】：场上有人翻面，摸一张牌');
      await ctx.draw(p, 1, { reason: 'yuliu' });
    },
  }],
});
