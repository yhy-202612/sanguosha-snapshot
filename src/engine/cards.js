// 牌元数据与效果。技能/模式只读，不在技能文件中修改。
// effSkills：失去技能（flags.skillsDisabled）后「红颜」等直读 player.skills 的判定也要失效（SG027 R9）
import { effSkills } from './skill.js';
export const SUITS = ['spade', 'heart', 'club', 'diamond'];
export const SUIT_CN = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
export const RED = new Set(['heart', 'diamond']);

// type: basic | trick | equip
// target: { min, max, range?, self?, others?, any? } 或 (g, from) => Player[]
// delayed: 延时锦囊，置入判定区
export const CARD_META = {
  // ---------- 基本牌 ----------
  sha: {
    cn: '杀', type: 'basic', target: { min: 1, max: 1, range: true },
    async effect(g, u) {
      const sc = u.shaCtx || null;
      for (const t of u.targets) {
        // 不可被【闪】响应：可来自整张牌（u.unavoidable / shaCtx.unavoidable），
        // 也可来自只针对该目标的技能（shaCtx.unavoidableBySeat，如【追命】）。
        // ★必须逐目标计算：shaCtx 一次使用共享，若在循环外读成常量，
        //   任一目标声明不可闪会让全部目标（含尚未结算的）都免【闪】。
        const unavoidable = !!(
          u.unavoidable
          || (sc && sc.unavoidable)
          || (sc && sc.unavoidableBySeat && sc.unavoidableBySeat[t.seat])
        );
        // 界黄忠【烈弓】②等：按目标加伤（shaCtx.bonusBySeat 由 target.after 阶段的技能写入）
        const bonus = (sc && sc.bonusBySeat && sc.bonusBySeat[t.seat]) || 0;
        await g.resolveSha(u.from, t, u.card, { unavoidable, bonus });
      }
    },
  },
  shan: { cn: '闪', type: 'basic', target: null, virtual: true },
  // 【影】（江山如故·转）：黑桃 A 的基本牌，不能使用或打出、无任何效果；进入弃牌堆后销毁（见 game.pushDiscard）
  ying: { cn: '影', type: 'basic', target: null, virtual: true },
  tao: {
    cn: '桃', type: 'basic', target: { min: 1, max: 1, self: true },
    async effect(g, u) { await g.recover(u.targets[0], 1, { from: u.from, card: u.card, reason: 'tao' }); },
  },
  jiu: {
    cn: '酒', type: 'basic', target: { min: 1, max: 1, self: true },
    async effect(g, u) { g.addFlag(u.from, 'jiu', 1); g.addFlag(u.from, 'jiuUsed', true); await g.log(`${u.from.name} 使用【酒】`); },
  },

  // ---------- 普通锦囊 ----------
  wuzhong: {
    cn: '无中生有', type: 'trick', target: { min: 1, max: 1, self: true },
    async effect(g, u) { await g.drawCards(u.targets[0], 2, { reason: 'wuzhong' }); },
  },
  guohe: {
    cn: '过河拆桥', type: 'trick', target: { min: 1, max: 1, others: true },
    async effect(g, u) {
      const t = u.targets[0];
      const c = await g.chooseCardFrom(u.from, t, { reason: 'guohe', includeJudge: true });
      if (c) await g.discardCards(t, [c], { reason: 'guohe' });
    },
  },
  shunshou: {
    cn: '顺手牵羊', type: 'trick', target: { min: 1, max: 1, others: true, distance: 1 },
    async effect(g, u) {
      const t = u.targets[0];
      const c = await g.chooseCardFrom(u.from, t, { reason: 'shunshou', includeJudge: true });
      if (c) await g.gainCards(u.from, [c], { from: t, reason: 'shunshou' });
    },
  },
  binglin: {
    // 2026-10-25 按玩家设计稿重做：查看牌堆顶 4 张 → 可使用其中的【杀】（不计次数、无视距离）→ 其余放回
    cn: '兵临城下', type: 'trick', target: { min: 1, max: 1, self: true },
    effect: '出牌阶段使用：查看牌堆顶 4 张牌，你可以使用其中的【杀】（不计入本回合次数限制、无视距离），其余牌放回牌堆顶。',
    async effect(g, u) {
      const from = u.from;
      const n = Math.min(4, g.deck.length);
      if (!n) return;
      const top = g.deck.slice(g.deck.length - n);          // 数组尾部 = 牌堆顶
      const shown = [...top].reverse();                     // 由顶到底
      await g.log(`【兵临城下】：${from.name} 查看牌堆顶 ${n} 张牌（不公开）`);
      const shas = shown.filter(c => c.name === 'sha');
      if (!shas.length) { await g.log('【兵临城下】：其中没有【杀】，牌放回牌堆顶'); return; }
      for (const sc of shas) {
        if (!from.alive) break;
        const idx = g.deck.indexOf(sc);
        if (idx < 0) continue;
        const cands = g.alive().filter(t => t !== from);
        if (!cands.length) break;
        const ts = await g.chooseTargets(from, {
          min: 1, max: 1, candidates: cands, optional: true,
          prompt: `【兵临城下】：是否使用 ${cardLabel(sc)}（无视距离、不计次数）？取消则不放这张【杀】`,
        });
        if (!ts.length) continue;                            // 不用则仍留在牌堆里
        g.deck.splice(idx, 1);                               // 先离开牌堆，避免与 useCard 双存
        await g.useCard({ from, card: sc, targets: ts, reason: 'binglin', ignoreRange: true, ignoreShaLimit: true });
      }
      await g.log('【兵临城下】：其余牌放回牌堆顶');
    },
  },
  qizheng: {
    // 2026-10-25 按玩家设计稿重做：使用者选奇兵/正兵 → 对方可打出【杀】或【闪】（也可不打）
    cn: '奇正相生', type: 'trick', target: { min: 1, max: 1, others: true },
    effect: '出牌阶段对一名其他角色使用：你选择「奇兵」或「正兵」；其可以打出一张【杀】或【闪】（可不打出）。奇兵：其打出【杀】则此牌无效，否则你获得其一张牌；正兵：其打出【闪】则此牌无效，否则你对其造成 1 点伤害。',
    async effect(g, u) {
      const t = u.targets[0], from = u.from;
      const pick = await g.chooseOne(from, ['奇兵（对方打出【杀】则无效，否则获得其一张牌）', '正兵（对方打出【闪】则无效，否则造成 1 点伤害）'],
        { prompt: `【奇正相生】对 ${t.name}：请选择兵势` }, { optional: false });
      const isQi = pick !== 1;
      await g.log(`【奇正相生】：${from.name} 对 ${t.name} 用${isQi ? '奇兵' : '正兵'}`);
      // 对方选择打出杀 / 闪 / 不打出
      const sel = await g.chooseOne(t, ['打出一张【杀】', '打出一张【闪】', '不打出'],
        { prompt: `${from.name} 的【奇正相生】：请选择（可打出一张【杀】或【闪】，也可不打出）` }, { optional: false });
      let played = null;   // 'sha' | 'shan' | null
      if (sel === 0) played = await g.respondCard(t, { filter: { name: 'sha' }, prompt: '【奇正相生】：打出一张【杀】', reason: 'qizheng' });
      else if (sel === 1) played = await g.respondCard(t, { filter: { name: 'shan' }, prompt: '【奇正相生】：打出一张【闪】', reason: 'qizheng' });
      const playedName = played ? played.name : null;
      if (playedName) await g.log(`【奇正相生】：${t.name} 打出 ${cardLabel(played)}`);
      else await g.log(`【奇正相生】：${t.name} 未打出牌`);
      if (isQi) {
        if (playedName === 'sha') { await g.log('【奇正相生】：奇兵被【杀】化解，此牌无效'); return; }
        const c = await g.chooseCardFrom(from, t, { reason: 'qizheng', includeJudge: false });
        if (c) { await g.gainCards(from, [c], { from: t, reason: 'qizheng' }); await g.log(`【奇正相生】：奇兵生效，${from.name} 获得 ${t.name} 的 ${cardLabel(c)}`); }
        else await g.log('【奇正相生】：奇兵生效，但对方没有可获得的牌');
      } else {
        if (playedName === 'shan') { await g.log('【奇正相生】：正兵被【闪】化解，此牌无效'); return; }
        await g.damage({ from, to: t, amount: 1, card: u.card, reason: 'qizheng' });
        await g.log(`【奇正相生】：正兵生效，${t.name} 受到 1 点伤害`);
      }
    },
  },
  juedou: {
    cn: '决斗', type: 'trick', target: { min: 1, max: 1, others: true },
    async effect(g, u) { await g.resolveJuedou({ from: u.from, target: u.targets[0], card: u.card, reason: 'juedou' }); },
  },
  jiedao: {
    cn: '借刀杀人', type: 'trick',
    target: (g, from) => g.alive().filter(p => p !== from && p.equips.weapon && g.alive().some(x => x !== p && g.inAttackRange(p, x))),
    targetMeta: { min: 1, max: 1, source: true },
    async effect(g, u) {
      const t = u.targets[0];
      const cands = g.alive().filter(x => x !== t && g.inAttackRange(t, x));
      const victim = await g.chooseTargets(u.from, { min: 1, max: 1, candidates: cands, prompt: `【借刀杀人】：选择 ${t.name} 攻击范围内的目标` });
      if (!victim.length) return;
      const v = victim[0];
      const c = await g.respondCard(t, { filter: { name: 'sha' }, prompt: `【借刀杀人】：请对 ${v.name} 使用【杀】，否则交出武器`, reason: 'jiedao' });
      if (c) await g.useCard({ from: t, card: c, targets: [v], reason: 'jiedao' });
      else if (t.equips.weapon) await g.gainCards(u.from, [t.equips.weapon], { from: t, reason: 'jiedao' });
    },
  },
  wanjian: {
    cn: '万箭齐发', type: 'trick', target: { min: 0, max: 99, others: true, all: true },
    async effect(g, u) {
      for (const t of u.targets) {
        const ok = await g.requireDodge(t, { from: u.from, card: u.card, reason: 'wanjian', prompt: '【万箭齐发】：请打出一张【闪】' });
        if (!ok) await g.damage({ from: u.from, to: t, amount: 1, card: u.card, reason: 'wanjian' });
      }
    },
  },
  nanman: {
    cn: '南蛮入侵', type: 'trick', target: { min: 0, max: 99, others: true, all: true },
    async effect(g, u) {
      for (const t of u.targets) {
        const c = await g.respondCard(t, { filter: { name: 'sha' }, prompt: '【南蛮入侵】：请打出一张【杀】', reason: 'nanman' });
        if (!c) await g.damage({ from: u.from, to: t, amount: 1, card: u.card, reason: 'nanman' });
      }
    },
  },
  taoyuan: {
    cn: '桃园结义', type: 'trick', target: { min: 0, max: 99, self: true, all: true },
    async effect(g, u) {
      for (const t of u.targets) if (t.hp < t.maxHp) await g.recover(t, 1, { from: u.from, card: u.card, reason: 'taoyuan' });
    },
  },
  wugu: {
    cn: '五谷丰登', type: 'trick', target: { min: 0, max: 99, self: true, all: true },
    async effect(g, u) {
      const n = u.targets.length;
      const pool = await g.drawCards(null, n, { reason: 'wugu', toPublic: true });
      for (const t of u.targets) {
        if (!pool.length) break;
        const idx = await g.chooseOne(t, pool.map(c => `${CARD_META[c.name].cn}${SUIT_CN[c.suit]}${c.num}`), { prompt: '【五谷丰登】：选择一张牌' });
        const c = pool.splice(idx, 1)[0];
        if (c) await g.gainCards(t, [c], { reason: 'wugu' });
      }
      if (pool.length) await g.discardCards(null, pool, { reason: 'wugu' });
    },
  },
  wuxie: { cn: '无懈可击', type: 'trick', target: null, virtual: true },

  // ---------- 延时锦囊 ----------
  lebu: {
    cn: '乐不思蜀', type: 'trick', delayed: true, target: { min: 1, max: 1, others: true },
    async effect(g, u) { g.placeDelayed(u.targets[0], u.card, 'lebu'); },
  },
  shandian: {
    cn: '闪电', type: 'trick', delayed: true, target: { min: 1, max: 1, self: true },
    async effect(g, u) { g.placeDelayed(u.targets[0], u.card, 'shandian'); },
  },
  bingliang: {
    cn: '兵粮寸断', type: 'trick', delayed: true, target: { min: 1, max: 1, others: true, distance: 1 },
    async effect(g, u) { g.placeDelayed(u.targets[0], u.card, 'bingliang'); },
  },

  // ---------- 军争锦囊 ----------
  huogong: {
    cn: '火攻', type: 'trick',
    // 官方口径：只能对「有手牌」的其他角色使用
    target: (g, from) => g.alive().filter(t => t !== from && t.hand.length > 0),
    targetMeta: { min: 1, max: 1, others: true },
    async effect(g, u) {
      const t = u.targets[0];
      if (!t || !t.hand.length) { await g.log(`【火攻】：${t ? t.name : '目标'}没有手牌，无效`); return; }
      // 官方口径：由目标自己展示一张手牌（AI 由 responder 代选）
      const res = await g.ask(t, 'cards', { prompt: '【火攻】：请展示一张手牌', cards: t.hand.map(c => c.id), min: 1, max: 1 });
      const cid = res?.cardIds?.[0];
      const c = t.hand.find(x => x.id === cid) || t.hand[g.rng.int(t.hand.length)];
      await g.revealCards([c], { to: g.alive(), reason: '火攻' });
      const same = u.from.hand.filter(x => x.suit === c.suit);
      if (!same.length) { await g.log(`【火攻】：${u.from.name} 没有与展示牌同花色的手牌，无法造成伤害`); return; }
      const pick = await g.chooseOne(u.from, same.map(x => `${CARD_META[x.name].cn}${SUIT_CN[x.suit]}${x.num}`), { prompt: '【火攻】：可弃一张同花色手牌，造成 1 点火焰伤害' }, { optional: true });
      if (pick < 0) return;
      await g.discardCards(u.from, [same[pick]], { reason: 'huogong' });
      await g.damage({ from: u.from, to: t, amount: 1, nature: 'fire', card: u.card, reason: 'huogong' });
    },
  },
  tiesuo: {
    cn: '铁索连环', type: 'trick', recast: true, target: { min: 1, max: 2, others: true, self: true },
    async effect(g, u) {
      for (const t of u.targets) {
        t.chained = !t.chained;
        await g.log(`${t.name} ${t.chained ? '进入' : '解除'}连环状态`);
      }
    },
  },

  // ---------- 装备：武器 ----------
  qinggang: { cn: '青釭剑', type: 'equip', sub: 'weapon', range: 2, effect: '无视防具' },
  cixiong: { cn: '雌雄双股剑', type: 'equip', sub: 'weapon', range: 2, effect: '对异性目标可令其弃牌或你摸牌' },
  qinglong: { cn: '青龙偃月刀', type: 'equip', sub: 'weapon', range: 3, effect: '杀被闪抵消后可再用杀' },
  zhangba: { cn: '丈八蛇矛', type: 'equip', sub: 'weapon', range: 3, effect: '两张手牌当杀' },
  guanshi: { cn: '贯石斧', type: 'equip', sub: 'weapon', range: 3, effect: '可弃两张牌令杀强制命中' },
  fangtian: { cn: '方天画戟', type: 'equip', sub: 'weapon', range: 4, effect: '最后一张手牌当杀可多目标' },
  qilin: { cn: '麒麟弓', type: 'equip', sub: 'weapon', range: 5, effect: '造成伤害时可弃目标坐骑' },
  zhuge: { cn: '诸葛连弩', type: 'equip', sub: 'weapon', range: 1, effect: '出杀无次数限制' },
  hanbing: { cn: '寒冰剑', type: 'equip', sub: 'weapon', range: 2, effect: '造成伤害时可改为弃目标两张牌' },
  guding: { cn: '古锭刀', type: 'equip', sub: 'weapon', range: 2, effect: '目标无手牌时伤害+1' },
  // 自定义配件牌（玩家自制）：攻击范围 7 的巨型攻城器械
  nupao: {
    cn: '弩炮', type: 'equip', sub: 'weapon', range: 7,
    effect: '无视其他角色的坐骑；你与其他角色的距离 -1；每回合出【杀】次数 +1；对距离 1（相邻）的角色使用【杀】时需判定，红色则此【杀】伤害 +1、黑色则本回合出【杀】次数 +1',
  },
  zhuque: { cn: '朱雀羽扇', type: 'equip', sub: 'weapon', range: 4, effect: '你使用的火【杀】伤害 +1' },

  // ---------- 装备：防具 ----------
  bagua: { cn: '八卦阵', type: 'equip', sub: 'armor', effect: '需要出闪时可判定，红色视为闪' },
  renwang: { cn: '仁王盾', type: 'equip', sub: 'armor', effect: '黑色杀无效' },
  tengjia: { cn: '藤甲', type: 'equip', sub: 'armor', effect: '杀与普通锦囊无效，火属性伤害+1' },
  baiyin: { cn: '白银狮子', type: 'equip', sub: 'armor', effect: '每次最多受 1 点伤害，失去时回复 1 点体力' },

  // ---------- 装备：坐骑 ----------
  // ---------- 装备：宝物（新槽位）与特殊武器 ----------
  taiping: { cn: '太平要术', type: 'equip', sub: 'treasure', effect: '锁定技：防止你受到的火属性伤害；你的手牌上限+1' },
  muniu: { cn: '木牛流马', type: 'equip', sub: 'treasure', effect: '锁定技：你的手牌上限+2；每回合开始时「运粮」摸一张牌' },
  piliche: { cn: '霹雳车', type: 'equip', sub: 'weapon', range: 4, effect: '当你使用【杀】对目标角色造成伤害后，弃置其装备区里的一张牌' },

  chitu: { cn: '赤兔', type: 'equip', sub: 'horse+', dist: 1 },
  dawan: { cn: '大宛', type: 'equip', sub: 'horse+', dist: 1 },
  zixing: { cn: '紫骍', type: 'equip', sub: 'horse+', dist: 1 },
  dilu: { cn: '的卢', type: 'equip', sub: 'horse-', dist: 1 },
  jueying: { cn: '绝影', type: 'equip', sub: 'horse-', dist: 1 },
  zhuahuang: { cn: '爪黄飞电', type: 'equip', sub: 'horse-', dist: 1 },
};

export const EQUIP_SUB = { weapon: 'weapon', armor: 'armor', 'horse+': 'horsePlus', 'horse-': 'horseMinus', treasure: 'treasure' };
export const SUB_CN = { weapon: '武器', armor: '防具', 'horse+': '+1马', 'horse-': '-1马', treasure: '宝物' };

export function isRed(card) { return RED.has(card.suit); }
// 红颜（小乔）：黑桃牌视为红桃牌。只在「判定花色」时映射，不改牌对象本身。
export function suitOf(player, card) {
  const hasHongyan = !!(player && (effSkills(player) || []).some(s => s.id === 'hongyan' || s.id === 'jie_hongyan'));
  if (hasHongyan && card && card.suit === 'spade') return 'heart';
  return card ? card.suit : undefined;
}
export function isRedFor(player, card) { return RED.has(suitOf(player, card)); }
export function cardName(card) {
  // 属性【杀】：牌名统一是 sha（出杀次数/距离/技能判断都按 sha），界面按属性显示「火杀」「雷杀」
  if (card && card.name === 'sha' && card.nature === 'fire') return '火杀';
  if (card && card.name === 'sha' && card.nature === 'thunder') return '雷杀';
  return CARD_META[card.name]?.cn || card.name;
}
export function cardLabel(card) { return `${cardName(card)}${SUIT_CN[card.suit] || ''}${card.num || ''}`; }

// 牌面详细效果（前端悬停 / 长按展示用）。装备的说明以 CARD_META[name].effect 为兜底。
export const CARD_DESC = {
  sha: '出牌阶段对攻击范围内一名角色使用。目标需打出一张【闪】，否则受到 1 点伤害。每回合限一次（诸葛连弩等除外）。',
  shan: '当你需要使用或打出【闪】时（被杀指定、万箭齐发、南蛮入侵以外的伤害牌结算等），打出一张【闪】抵消。',
  tao: '出牌阶段对自己使用，回复 1 点体力；或在任何角色进入濒死状态时使用，令其回复 1 点体力。',
  jiu: '出牌阶段对自己使用，本回合下一张【杀】造成的伤害 +1；或在你濒死时使用，回复 1 点体力（每回合限一次）。',
  wuzhong: '出牌阶段对自己使用，摸两张牌。',
  guohe: '出牌阶段对一名其他角色使用，弃置其区域里的一张牌（手牌为暗选，装备区 / 判定区为明选）。',
  shunshou: '出牌阶段对距离 1 以内的一名其他角色使用，获得其区域里的一张牌（手牌为暗选，装备区 / 判定区为明选）。',
  binglin: '出牌阶段使用：查看牌堆顶 4 张牌，你可以使用其中的【杀】（不计入本回合次数限制、无视距离），其余牌放回牌堆顶。',
  qizheng: '出牌阶段对一名其他角色使用：你选择「奇兵」或「正兵」，其可打出一张【杀】或【闪】（可不打出）。奇兵：其打出【杀】则无效，否则你获得其一张牌；正兵：其打出【闪】则无效，否则你对其造成 1 点伤害。',
  taiping: '宝物。锁定技：防止你受到的火属性伤害；你的手牌上限 +1。',
  muniu: '宝物。锁定技：你的手牌上限 +2；每个回合开始时「运粮」，你摸一张牌。',
  piliche: '武器（攻击范围 4）。当你使用【杀】对目标角色造成伤害后，你弃置其装备区里的一张牌。',
  juedou: '出牌阶段对一名其他角色使用。由其开始，双方轮流打出一张【杀】，先不打出者受到对方 1 点伤害。',
  jiedao: '出牌阶段对一名装备了武器的角色使用：令其对你选择的另一名角色使用一张【杀】，否则其须将武器交给你。',
  wanjian: '出牌阶段使用，所有其他角色各需打出一张【闪】，否则受到 1 点伤害。',
  nanman: '出牌阶段使用，所有其他角色各需打出一张【杀】，否则受到 1 点伤害。',
  taoyuan: '出牌阶段使用，所有角色各回复 1 点体力。',
  wugu: '出牌阶段使用，亮出等同存活人数的牌，由你开始每人依次选一张获得，剩余弃置。',
  wuxie: '在任意锦囊牌生效前使用，抵消该锦囊对一名角色的效果；可被另一张【无懈可击】抵消。',
  lebu: '延时锦囊，置于一名其他角色的判定区。其判定阶段判定：若不为红桃，跳过其出牌阶段。',
  shandian: '延时锦囊，置于自己判定区。判定阶段判定：若为黑桃 2~9，受到 3 点雷电伤害，否则移动到下家判定区。',
  bingliang: '延时锦囊，置于距离 1 以内一名其他角色的判定区。判定不为梅花则跳过其摸牌阶段。',
  huogong: '出牌阶段对一名有手牌的其他角色使用：其展示一张手牌，你可以弃置一张与此牌花色相同的手牌，对其造成 1 点火焰伤害。',
  tiesuo: '出牌阶段对一至两名角色使用（可含自己），横置或重置其武将牌（连环状态）；处于连环状态的角色受到属性伤害时会向其他连环角色传导。此牌亦可【重铸】：出牌阶段弃置此牌并摸一张牌，不视为使用。',
  qinggang: '武器 · 攻击范围 2：你使用的【杀】无视目标防具。',
  cixiong: '武器 · 攻击范围 2：你使用【杀】指定异性目标后，可令其弃一张手牌，或你摸一张牌。',
  qinglong: '武器 · 攻击范围 3：你使用的【杀】被【闪】抵消后，可对该目标再使用一张【杀】。',
  zhangba: '武器 · 攻击范围 3：你可以将两张手牌当【杀】使用或打出。',
  guanshi: '武器 · 攻击范围 3：你的【杀】被【闪】抵消时，可弃两张牌令此【杀】依然造成伤害。',
  fangtian: '武器 · 攻击范围 4：你使用最后一张手牌当【杀】时，可额外指定至多两个目标。',
  qilin: '武器 · 攻击范围 5：你使用【杀】造成伤害时，可弃置目标装备区里的一匹坐骑。',
  zhuge: '武器 · 攻击范围 1：你使用【杀】没有次数限制。',
  hanbing: '武器 · 攻击范围 2：你使用【杀】造成伤害时，可防止此伤害，改为弃置目标两张牌。',
  guding: '武器 · 攻击范围 2：你使用【杀】指定无手牌的目标时，此【杀】伤害 +1。',
  nupao: '配件牌 · 武器 · 攻击范围 7：装备后你无视其他角色的坐骑效果，与其他角色的距离 -1，每回合可使用【杀】的次数 +1。当你对距离 1 的角色使用【杀】时需进行一次判定：红色（红桃/方块）此【杀】伤害 +1；黑色（黑桃/梅花）本回合出【杀】次数 +1。',
  zhuque: '武器 · 攻击范围 4：你使用的火【杀】造成的伤害 +1。',
  bagua: '防具：当你需要使用或打出【闪】时，可判定，若为红色则视为打出一张【闪】。',
  renwang: '防具：黑色的【杀】对你无效。',
  tengjia: '防具：【杀】和普通锦囊牌对你无效；你受到火焰伤害时伤害 +1。',
  baiyin: '防具：你每次受到伤害时最多承受 1 点；此防具离开你装备区时，你回复 1 点体力。',
  chitu: '+1 马（防御马）：其他角色计算与你的距离 +1。',
  dawan: '+1 马（防御马）：其他角色计算与你的距离 +1。',
  zixing: '+1 马（防御马）：其他角色计算与你的距离 +1。',
  dilu: '-1 马（进攻马）：你计算与其他角色的距离 -1。',
  jueying: '-1 马（进攻马）：你计算与其他角色的距离 -1。',
  zhuahuang: '-1 马（进攻马）：你计算与其他角色的距离 -1。',
};

export function cardDesc(name) {
  const m = CARD_META[name] || {};
  return CARD_DESC[name] || m.desc || (m.effect ? `${SUB_CN[m.sub] || '装备'}：${m.effect}` : '');
}

// 由牌表构建牌堆（每张牌带唯一 id）
export function buildDeck(entries, rng) {
  const deck = [];
  let i = 0;
  for (const e of entries) {
    deck.push({ id: `c${++i}`, name: e.name, suit: e.suit, num: e.num, type: CARD_META[e.name].type });
  }
  return rng ? rng.shuffle(deck) : deck;
}
