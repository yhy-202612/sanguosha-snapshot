// 自定义·异闻 包技能：嫦娥（天國）/ 哥伦比亚·希珀塞莱尼娅
// 两位都是 7 勾玉的超规格设计，核心是「月相/资源标记 + 满辉技/初辉技」体系。
import { defineSkill } from '../engine/skill.js';
import { cardLabel, CARD_META } from '../engine/cards.js';
import { addMoon, moonMaxOf, moonIsFull, moonClear, moonMult, moonGainN } from '../engine/moon.js';

const roundOf = (g) => g.round ?? 0;
function onceRound(p, g, key) {
  const k = `r_${key}`;
  if (p.flags[k] === roundOf(g)) return false;
  p.flags[k] = roundOf(g);
  return true;
}

// ==================== 嫦娥（天國）====================
// 【东方红】持恒技【祈月】：摸牌阶段从牌堆或弃牌堆获得 2 张【五谷丰登】与 1 张【无中生有】
defineSkill({
  id: 'dongfanghong', name: '东方红',
  desc: '持恒技，【祈月】：摸牌阶段，你从牌堆或弃牌堆中获得 2 张【五谷丰登】与 1 张【无中生有】。你的所有技能均持恒。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'draw',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const pickFrom = (name, n) => {
        const out = [];
        for (let i = 0; i < n; i++) {
          // 先从牌堆找，再从弃牌堆找
          let idx = g.deck.findIndex(c => c.name === name);
          if (idx >= 0) { out.push(g.deck.splice(idx, 1)[0]); continue; }
          idx = g.discardPile.findIndex(c => c.name === name);
          if (idx >= 0) { out.push(g.discardPile.splice(idx, 1)[0]); continue; }
          break;
        }
        return out;
      };
      const got = [...pickFrom('wugu', 2), ...pickFrom('wuzhong', 1)];
      if (!got.length) { await ctx.log('【东方红】：牌堆与弃牌堆里没有【五谷丰登】/【无中生有】'); return; }
      p.hand.push(...got);
      await ctx.log(`【东方红】：获得 ${got.map(c => CARD_META[c.name].cn).join('、')}`);
      await g.trigger('cards.gain', { self: p, from: null, cards: got, reason: 'dongfanghong' });
    },
  }],
});

// 【长征】☽ 达到 5 / 9 / 10 时获得对应效果
defineSkill({
  id: 'changzheng', name: '长征',
  desc: '当「☽」个数为「五」/「九」/「十」时，你获得对应效果：五 →【无人登月Ⅰ】摸牌阶段从牌堆底获得 4 张锦囊；九 →【载人登月】回合开始时获得 3 个随机技能效果（本实现：摸 2 张牌）；十 →【无人登月Ⅱ】摸牌时多摸 3 张、本回合出【杀】次数 +2。上述数值均受【新征程】增幅倍率（每次 +50%）加成并向下取整。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      filter: (d) => d.phase === 'draw' && (d.player?.marks?.yue || 0) >= 5,
      async effect(ctx) {
        const p = ctx.self, g = ctx.game;
        const mult = 1 + (p.marks.zengfu || 0) / 100;
        if ((p.marks.yue || 0) >= 10) {
          const n = Math.floor(3 * mult), shaN = Math.floor(2 * mult);
          await ctx.log(`【长征·无人登月Ⅱ】：本回合额外摸 ${n} 张、出【杀】次数 +${shaN}`);
          await ctx.draw(p, n, { reason: 'changzheng' });
          p.flags.shaExtraTurn = (p.flags.shaExtraTurn || 0) + shaN;   // 本回合（SG028）
          return;
        }
        const want = Math.floor(4 * mult);
        const got = [];
        for (let i = 0; i < want && g.deck.length; i++) {
          const idx = g.deck.findIndex(c => CARD_META[c.name]?.type === 'trick');
          if (idx < 0) break;
          got.push(g.deck.splice(idx, 1)[0]);
        }
        if (got.length) {
          p.hand.push(...got);
          await ctx.log(`【长征·无人登月Ⅰ】：从牌堆底获得 ${got.length} 张锦囊（${got.map(c => CARD_META[c.name].cn).join('、')}）`);
          await g.trigger('cards.gain', { self: p, from: null, cards: got, reason: 'changzheng' });
        }
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => (d.player?.marks?.yue || 0) >= 9 && !d.player.flags.zairu,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.zairu = true;
        const mult = 1 + (p.marks.zengfu || 0) / 100;
        const n = Math.max(1, Math.floor(2 * mult));
        await ctx.log(`【长征·载人登月】：获得三个技能的效果（本实现：摸 ${n} 张牌）`);
        await ctx.draw(p, n, { reason: 'changzheng' });
      },
    },
  ],
});

// 【奋进】每个阶段可获得 1 个 ☽（受【新征程】增幅，向下取整、至少 1 个）；使用【五谷丰登】时额外 +1 ☽
defineSkill({
  id: 'fenjin', name: '奋进',
  desc: '你的每个阶段，你可以获得 1 个「☽」（受【新征程】增幅影响，向下取整、至少 1 个）；你使用【五谷丰登】时，你获得 1 个「☽」（同样受增幅影响）。',
  triggers: [
    {
      on: 'phase.begin', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        if (moonIsFull(p)) return;
        const n = moonGainN(p, 1);
        addMoon(p, n);
        await ctx.log(`【奋进】：获得 ${n} 个「☽」（当前 ${p.marks.yue}/${moonMaxOf(p)}${p.marks.zengfu ? `，增幅 +${p.marks.zengfu}%` : ''}）`);
      },
    },
    {
      on: 'card.use.after', who: 'self', optional: false,
      filter: (d) => d.card?.name === 'wugu' || d.asName === 'wugu',
      async effect(ctx) {
        const p = ctx.self;
        const n = moonGainN(p, 1);
        addMoon(p, n);
        await ctx.log(`【奋进】：使用【五谷丰登】，获得 ${n} 个「☽」（当前 ${p.marks.yue}/${moonMaxOf(p)}）`);
      },
    },
  ],
});

// 【新征程】满辉技（「☽」集满时立即使用、耗尽「☽」）：清空并重新获得 1~5 个 ☽，每清空一次增幅 +50%
async function doXzc(ctx, n) {
  const p = ctx.self;
  const before = p.marks.yue || 0;
  p.marks.yue = Math.max(0, Math.min(moonMaxOf(p), n));
  p.marks.zengfu = (p.marks.zengfu || 0) + 50;
  const mult = 1 + (p.marks.zengfu || 0) / 100;
  await ctx.log(`【新征程】：清空 ${before} 个「☽」，重新获得 ${p.marks.yue} 个，增幅 +50%（累计 +${p.marks.zengfu}%，当前倍率 ×${mult.toFixed(2)}）`);
}

async function tryXzc(ctx) {
  const p = ctx.self;
  if (!moonIsFull(p)) return;
  await doXzc(ctx, Math.min(5, moonMaxOf(p)));
}

defineSkill({
  id: 'xinzhengcheng', name: '新征程',
  desc: '满辉技（「☽」集满时立即使用、耗尽「☽」）：你可以清空「☽」并重新获得 1~5 个「☽」；你每清空一次，技能效果增幅 +50%（向下取整，作用于【长征】各档的摸牌数与出【杀】次数，以及【奋进】每次获得的「☽」个数）。',
  // 满辉：集满即自动发动（重新获得 5 个为最优）
  triggers: [
    { on: 'turn.begin', who: 'self', optional: false, async effect(ctx) { await tryXzc(ctx); } },
    { on: 'phase.begin', who: 'self', optional: false, async effect(ctx) { await tryXzc(ctx); } },
    { on: 'card.use.after', who: 'self', optional: false, priority: -5, async effect(ctx) { await tryXzc(ctx); } },
  ],
  active: {
    prompt: '清空并重新获得 1~5 个 ☽',
    async effect(ctx) {
      const p = ctx.self;
      if (!moonIsFull(p)) { await ctx.log('【新征程】：满辉技只能在「☽」集满时发动'); return; }
      const idx = await ctx.ask.choose(p, ['1 个', '2 个', '3 个', '4 个', '5 个'], { prompt: '【新征程】：清空「☽」并重新获得' });
      if (idx < 0) return;
      await doXzc(ctx, idx + 1);
    },
  },
});

// ==================== 哥伦比亚·希珀塞莱尼娅 ====================
// 【月亮诱发的疯狂】每轮限一次：场上≥3 人时弃光手牌（≥3），获得一名角色下回合的控制权
defineSkill({
  id: 'yuedian', name: '月亮诱发的疯狂',
  desc: '每轮限一次，场上角色至少为 3 时，你可以弃置至少三张的全部手牌，获得一名其他角色在其下回合结束前的控制权。（实现：目标下回合跳过出牌阶段，你摸 2 张牌作为补偿）',
  active: {
    prompt: '弃光手牌获得一名角色下回合的控制权',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (g.alive().length < 3) { await ctx.log('【月亮诱发的疯狂】：场上角色不足 3 名'); return; }
      if (p.hand.length < 3) { await ctx.log('【月亮诱发的疯狂】：手牌不足三张'); return; }
      if (!onceRound(p, g, 'yuedian')) { await ctx.log('【月亮诱发的疯狂】：本轮已发动过'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【月亮诱发的疯狂】：选择一名角色' });
      if (!ts.length) return;
      const t = ts[0];
      await ctx.discard(p, [...p.hand], { reason: 'yuedian' });
      t.flags.skipNext_play = true;
      await ctx.log(`【月亮诱发的疯狂】：${p.name} 弃置全部手牌，${t.name} 下回合跳过出牌阶段（视为被你控制）`);
      await ctx.draw(p, 2, { reason: 'yuedian' });
    },
  },
});

// 【新月自己的法则】准备阶段：弃任意张手牌积累等量 ☽
defineSkill({
  id: 'xinyue', name: '新月自己的法则',
  desc: '恒，准备阶段，你弃置任意张手牌，积累等量「☽」（不超过月标记上限）。',
  triggers: [{
    on: 'phase.begin', who: 'self', optional: true,
    filter: (d) => d.phase === 'prepare' && (d.player?.hand?.length || 0) > 0,
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      const res = await g.ask(p, 'cards', { prompt: '【新月自己的法则】：弃置任意张手牌积累等量 D', cards: p.hand.map(c => c.id), min: 0, max: p.hand.length, optional: true });
      const cards = (res?.cardIds || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
      if (!cards.length) return;
      await ctx.discard(p, cards, { reason: 'xinyue' });
      p.marks.yue = p.marks.yue || 0;
      addMoon(p, cards.length);
      await ctx.log(`【新月自己的法则】：弃置 ${cards.length} 张牌，「☽」增至 ${p.marks.yue}/${moonMaxOf(p)}`);
    },
  }],
});

// 【三相月临】转换技：恒月 / 霜月 / 虹月
defineSkill({
  id: 'sanxiang', name: '三相月临',
  desc: '恒锁，出牌阶段限一次，你回复 1 点体力并回复至 7 点体力上限，并按顺序转换：恒月（下回合准备阶段前无法被指定，每次被尝试指定你摸一张牌）；霜月（指定任意名角色翻面）；虹月（弃置 1~2 张牌，对一名角色造成等量无来源伤害）。',
  active: {
    perPhase: true,
    prompt: '三相月临（转换技）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      p.maxHp = Math.max(p.maxHp, 7);
      await ctx.recover(p, 1, { reason: 'sanxiang' });
      const cur = p.marks.xiang || 0;
      if (cur === 0) {
        p.marks.xiang = 1;
        p.flags.hengYue = true;
        await ctx.log('【三相月临·恒月】：你下回合准备阶段前无法被指定，每次被尝试指定摸一张牌');
      } else if (cur === 1) {
        p.marks.xiang = 2;
        const ts = await g.chooseTargets(p, { min: 1, max: 99, candidates: g.alive(), prompt: '【三相月临·霜月】：选择翻面的角色（可多选）' });
        for (const t of ts) await ctx.flip(t);
        await ctx.log(`【三相月临·霜月】：${ts.map(t => t.name).join('、')} 翻面`);
      } else {
        p.marks.xiang = 0;
        const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
        if (pool.length) {
          const res = await g.ask(p, 'cards', { prompt: '【三相月临·虹月】：弃置 1~2 张牌', cards: pool.map(c => c.id), min: 1, max: 2 });
          const cost = (res?.cardIds || []).map(id => pool.find(c => c.id === id)).filter(Boolean).slice(0, 2);
          if (cost.length) {
            await ctx.discard(p, cost, { reason: 'sanxiang' });
            const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【三相月临·虹月】：造成无来源伤害的目标' });
            if (ts.length) await ctx.damage({ from: null, to: ts[0], amount: cost.length, card: null, reason: 'sanxiang' });
            await ctx.log(`【三相月临·虹月】：弃置 ${cost.length} 张牌，造成 ${cost.length} 点无来源伤害`);
          }
        }
      }
    },
  },
  triggers: [
    {
      // 恒月：被指定为目标时摸一张牌
      on: 'target.before', who: 'any', optional: false,
      filter: (d) => !!d.player?.flags?.hengYue && Array.isArray(d.targets) && d.targets.includes(d.player),
      async effect(ctx) {
        const p = ctx.self;
        await ctx.log(`【三相月临·恒月】：${p.name} 被指定为目标，摸一张牌`);
        await ctx.draw(p, 1, { reason: 'sanxiang' });
      },
    },
    {
      on: 'turn.begin', who: 'self', optional: false,
      filter: (d) => !!d.player?.flags?.hengYue,
      async effect(ctx) { ctx.self.flags.hengYue = false; },
    },
  ],
});

// 【她的乡愁】满辉技（「☽」集满时立即使用、耗尽「☽」）：弃一张【杀】造成 5 点无来源伤害，对方可执行 5 种操作各减 1 点
async function doXiangchou(ctx) {
      const p = ctx.self, g = ctx.game;
      const sha = p.hand.find(c => c.name === 'sha');
      if (!sha) { await ctx.log('【她的乡愁】：没有【杀】'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p), prompt: '【她的乡愁】：选择目标' });
      if (!ts.length) return;
      const t = ts[0];
      await ctx.discard(p, [sha], { reason: 'xiangchou' });
      let amount = 5;
      await ctx.log(`【她的乡愁】：${p.name} 弃置一张【杀】，对 ${t.name} 造成 5 点无来源伤害（其可执行操作减伤）`);
      const ops = [
        ['弃置所有牌', async () => {
          const all = [...t.hand, ...Object.values(t.equips).filter(Boolean)];
          if (all.length) await ctx.discard(t, all, { reason: 'xiangchou' });
        }],
        ['翻至背面', async () => { if (!t.flipped) await ctx.flip(t); }],
        ['减少 1 点体力上限', async () => {
          t.maxHp = Math.max(1, (t.maxHp || 1) - 1);
          if (t.hp > t.maxHp) t.hp = t.maxHp;
        }],
        ['下个准备阶段前失去所有技能', async () => { t.flags.noSkills = true; }],
        ['废弃所有装备栏', async () => {
          const eq = Object.values(t.equips).filter(Boolean);
          if (eq.length) await ctx.discard(t, eq, { reason: 'xiangchou' });
          t.flags.noEquip = true;
        }],
      ];
      for (const [label, run] of ops) {
        if (!t.alive) break;
        const yes = await g.confirm(t, `【她的乡愁】：是否${label}？（每执行一项减 1 点伤害，当前 ${amount} 点）`);
        if (!yes) continue;
        await run();
        amount -= 1;
        await ctx.log(`【她的乡愁】：${t.name} ${label}，减伤后为 ${amount} 点`);
      }
      if (amount > 0) await ctx.damage({ from: null, to: t, amount, card: null, reason: 'xiangchou' });
      else await ctx.log('【她的乡愁】：伤害已全部减免');
}

async function tryXiangchou(ctx) {
  const p = ctx.self;
  if (!moonIsFull(p)) return;
  if (!p.hand.some(c => c.name === 'sha')) return;
  if (!ctx.game.alive().some(t => t !== p)) return;
  moonClear(p);
  await ctx.log(`【她的乡愁】：满辉立即发动，${p.name} 耗尽「☽」`);
  await doXiangchou(ctx);
}

defineSkill({
  id: 'xiangchou', name: '她的乡愁',
  desc: '恒 满辉技（「☽」集满时立即使用、耗尽「☽」），你弃置一张【杀】对一名角色造成 5 点无来源伤害；对方可以执行下列操作中的任意个，每执行 1 个减少 1 点伤害：①弃置所有牌 ②翻至背面 ③减少 1 点体力上限 ④下个准备阶段前失去所有技能 ⑤废弃所有装备栏。',
  triggers: [
    { on: 'turn.begin', who: 'self', optional: false, async effect(ctx) { await tryXiangchou(ctx); } },
    { on: 'phase.begin', who: 'self', optional: false, async effect(ctx) { await tryXiangchou(ctx); } },
    { on: 'card.use.after', who: 'self', optional: false, priority: -6, async effect(ctx) { await tryXiangchou(ctx); } },
  ],
  active: {
    prompt: '弃一张【杀】造成 5 点无来源伤害（「☽」集满时自动发动）',
    async effect(ctx) {
      if (!moonIsFull(ctx.self)) { await ctx.log('【她的乡愁】：满辉技只能在「☽」集满时发动'); return; }
      moonClear(ctx.self);
      await doXiangchou(ctx);
    },
  },
});

// 【万古潮汐】初辉技：多次拼点，赢则双方翻面，未赢则回复 D
defineSkill({
  id: 'wanchao', name: '万古潮汐',
  desc: '恒 初辉技，【祈月】：当自身翻至背面时，翻至正面并摸一张牌。你可以多次与一名角色拼点（上限为当前「☽」数），赢则双方均翻面，未赢则按输的点数约 1/2（向上取整）回复对应的「☽」。使用后失去此技能，直到使用【三相月临】。',
  triggers: [{
    on: 'flip.after', who: 'self', optional: false,
    filter: (d) => d.self === d.player && d.player?.flipped && !d.player.flags.wanchaoUsed,
    async effect(ctx) {
      const p = ctx.self;
      await ctx.flip(p);
      await ctx.log('【万古潮汐·祈月】：翻回正面并摸一张牌');
      await ctx.draw(p, 1, { reason: 'wanchao' });
    },
  }],
  active: {
    prompt: '与一名角色拼点（D 体系）',
    async effect(ctx) {
      const p = ctx.self, g = ctx.game;
      if (p.flags.wanchaoUsed) { await ctx.log('【万古潮汐】：已使用过（需再次使用【三相月临】恢复）'); return; }
      // 初辉技：☽ 不满时才能于出牌阶段发动（发动后耗尽 ☽）
      if (moonIsFull(p)) { await ctx.log('【万古潮汐】：初辉技只能在「☽」不满时发动'); return; }
      const d = p.marks.yue || 0;
      if (d <= 0) { await ctx.log('【万古潮汐】：没有「☽」，不能拼点'); return; }
      const ts = await g.chooseTargets(p, { min: 1, max: 1, candidates: g.alive().filter(t => t !== p && t.hand.length), prompt: '【万古潮汐】：选择拼点对象' });
      if (!ts.length) return;
      const t = ts[0];
      p.flags.wanchaoUsed = true;
      moonClear(p);   // 初辉技：发动后耗尽「☽」，未赢时再按差值的 1/2 返还
      await ctx.log(`【万古潮汐】：初辉发动，耗尽 ${d} 个「☽」`);
      const { pindian } = await import('../engine/pindian.js');
      const r = await pindian(g, p, t, { reason: '万古潮汐' });
      if (!r || r.skip) return;
      const diff = Math.abs((r.a?.num || 0) - (r.b?.num || 0));
      if (r.win) {
        await ctx.flip(p);
        await ctx.flip(t);
        await ctx.log('【万古潮汐】：拼点获胜，双方翻面');
      } else {
        const gain = Math.max(1, Math.ceil(diff / 2));
        addMoon(p, gain);
        await ctx.log(`【万古潮汐】：未赢（差 ${diff}），回复 ${gain} 个「☽」（现 ${p.marks.yue}/${moonMaxOf(p)}）`);
      }
    },
  },
});
