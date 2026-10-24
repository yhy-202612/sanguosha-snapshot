// 牌元数据与效果。技能/模式只读，不在技能文件中修改。
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
      for (const t of u.targets) await g.resolveSha(u.from, t, u.card);
    },
  },
  shan: { cn: '闪', type: 'basic', target: null, virtual: true },
  tao: {
    cn: '桃', type: 'basic', target: { min: 1, max: 1, self: true },
    async effect(g, u) { await g.recover(u.targets[0], 1, { from: u.from, card: u.card, reason: 'tao' }); },
  },
  jiu: {
    cn: '酒', type: 'basic', target: { min: 1, max: 1, self: true },
    async effect(g, u) { g.addFlag(u.from, 'jiu', 1); await g.log(`${u.from.name} 使用【酒】`); },
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
  juedou: {
    cn: '决斗', type: 'trick', target: { min: 1, max: 1, others: true },
    async effect(g, u) {
      const t = u.targets[0];
      let attacker = t, defender = u.from; // 目标先出杀
      while (true) {
        const c = await g.respondCard(attacker, { filter: { name: 'sha' }, prompt: `【决斗】：请打出一张【杀】，否则受到 1 点伤害`, reason: 'juedou' });
        if (!c) { await g.damage({ from: defender, to: attacker, amount: 1, card: u.card, reason: 'juedou' }); break; }
        [attacker, defender] = [defender, attacker];
      }
    },
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
    cn: '火攻', type: 'trick', target: { min: 1, max: 1, others: true },
    async effect(g, u) {
      const t = u.targets[0];
      if (!t.hand.length) return;
      const c = t.hand[g.rng.int(t.hand.length)];
      await g.revealCards([c], { to: g.alive(), reason: 'huogong' });
      const same = u.from.hand.filter(x => x.suit === c.suit);
      if (!same.length) return;
      const pick = await g.chooseOne(u.from, same.map(x => `${CARD_META[x.name].cn}${SUIT_CN[x.suit]}${x.num}`), { prompt: '【火攻】：可弃一张同花色手牌，造成 1 点火焰伤害' }, { optional: true });
      if (pick < 0) return;
      await g.discardCards(u.from, [same[pick]], { reason: 'huogong' });
      await g.damage({ from: u.from, to: t, amount: 1, nature: 'fire', card: u.card, reason: 'huogong' });
    },
  },
  tiesuo: {
    cn: '铁索连环', type: 'trick', target: { min: 1, max: 2, others: true, self: true },
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

  // ---------- 装备：防具 ----------
  bagua: { cn: '八卦阵', type: 'equip', sub: 'armor', effect: '需要出闪时可判定，红色视为闪' },
  renwang: { cn: '仁王盾', type: 'equip', sub: 'armor', effect: '黑色杀无效' },
  tengjia: { cn: '藤甲', type: 'equip', sub: 'armor', effect: '杀与普通锦囊无效，火属性伤害+1' },
  baiyin: { cn: '白银狮子', type: 'equip', sub: 'armor', effect: '每次最多受 1 点伤害，失去时回复 1 点体力' },

  // ---------- 装备：坐骑 ----------
  chitu: { cn: '赤兔', type: 'equip', sub: 'horse+', dist: 1 },
  dawan: { cn: '大宛', type: 'equip', sub: 'horse+', dist: 1 },
  zixing: { cn: '紫骍', type: 'equip', sub: 'horse+', dist: 1 },
  dilu: { cn: '的卢', type: 'equip', sub: 'horse-', dist: 1 },
  jueying: { cn: '绝影', type: 'equip', sub: 'horse-', dist: 1 },
  zhuahuang: { cn: '爪黄飞电', type: 'equip', sub: 'horse-', dist: 1 },
};

export const EQUIP_SUB = { weapon: 'weapon', armor: 'armor', 'horse+': 'horsePlus', 'horse-': 'horseMinus' };
export const SUB_CN = { weapon: '武器', armor: '防具', 'horse+': '+1马', 'horse-': '-1马' };

export function isRed(card) { return RED.has(card.suit); }
export function cardName(card) { return CARD_META[card.name]?.cn || card.name; }
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
  huogong: '出牌阶段对一名有手牌的角色使用：其展示一张手牌，你可弃一张同花色手牌，对其造成 1 点火焰伤害。',
  tiesuo: '出牌阶段对一至两名角色使用（可含自己），横置或重置其武将牌（连环状态）。连环角色受到属性伤害时会传导。',
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
