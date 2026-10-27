import { CARD_META } from './cards.js';
// 技能侧「把某些牌当作另一张牌使用/打出」的规则扩展点。
// 机制：src/engine/game.js 在启动时把本数组 push 进 VIRTUAL_RULES，
// 因此新增这类转化技只需要往这里加一条，不必改动 game.js（避免多分支并行时互相冲突）。
//
// 每条规则的结构（与 game.js 内置规则一致）：
//   { skill: '技能id', as: '目标牌名', test: (cards) => 布尔 }
//   - skill：拥有该规则的技能 id（引擎据此判断该玩家是否能这样转化）
//   - as   ：转化后的牌名（CARD_META 的 key，如 'sha' / 'guohe' / 'lebu' / 'tiesuo' / 'huogong' / 'wuxie' / 'wanjian' / 'juedou'）
//   - test ：给定本次打算使用的牌（数组），返回是否允许这样转化（张数、花色、颜色等判断写在这里）
// 闪赵云【镇胆】：一张非基本手牌可当「本轮你未使用过的基本牌」使用/打出
const ZHENDAN_BASICS = ['sha', 'shan', 'tao', 'jiu'];
const zhendanRound = (g) => Math.floor(((g?.turnCount || 1) - 1) / Math.max(1, (g?.players || []).length));
export const EXTRA_VIRTUAL_RULES = ZHENDAN_BASICS.map(name => ({
  skill: 'zhendan',
  as: name,
  test: (cards, game, player) => {
    if (!cards || cards.length !== 1) return false;
    const c = cards[0];
    if (CARD_META[c.name]?.type === 'basic') return false;          // 必须是非基本牌
    const used = player?.flags?.zhendanUsed || {};
    return used[`${zhendanRound(game)}:${name}`] !== true;           // 本轮未用过
  },
}));

// ==================== 魔系列 ====================
// 魔司马懿【诡伏】：带「诡伏」标记的【闪】可当「诡伏」已记录的牌名使用（每回合每种牌名限一次）
const GUIFU_NAMES = ['sha', 'juedou', 'nanman', 'wanjian', 'huogong'];
for (const name of GUIFU_NAMES) {
  EXTRA_VIRTUAL_RULES.push({
    skill: 'guifu', as: name,
    test: (cards, game, player) => {
      if (!cards || cards.length !== 1) return false;
      const c = cards[0];
      if (c.skillTag !== 'guifu') return false;
      if (!(player?.flags?.guifuRec || []).includes(name)) return false;
      const used = player?.flags?.guifuUsed || {};
      return used[`${game?.turnCount}:${name}`] !== true;
    },
  });
}
// 魔司马懿【骤袭】：获得「诡伏」的【闪】当所选牌名使用（至下回合开始）
for (const name of GUIFU_NAMES) {
  EXTRA_VIRTUAL_RULES.push({
    skill: 'zhouxi', as: name,
    test: (cards, game, player) => {
      if (!cards || cards.length !== 1) return false;
      if (cards[0].skillTag !== 'guifu') return false;
      if (player?.flags?.zhouxiAs !== name) return false;
      return (player?.flags?.zhouxiUntil || -1) >= (game?.turnCount || 0);
    },
  });
}
// 魔曹操【覆载】：装备牌只能当【借刀】或【无中生有】使用
for (const name of ['jiedao', 'wuzhong']) {
  EXTRA_VIRTUAL_RULES.push({
    skill: 'fuzai', as: name,
    test: (cards) => cards && cards.length === 1 && CARD_META[cards[0].name]?.type === 'equip',
  });
}

// 谋庞统【连环】：一张梅花手牌可当【铁索连环】使用（每个出牌阶段限一次）
EXTRA_VIRTUAL_RULES.push({
  skill: 'lianhuan2', as: 'tiesuo',
  test: (cards, game, player) => {
    if (!cards || cards.length !== 1) return false;
    const c = cards[0];
    if (c.suit !== 'club') return false;
    const used = player?.flags?.lianhuan2Turn;
    return used !== game?.turnCount;
  },
});

// ==================== 协作批次 A / B / C 追加 ====================
// 魔张飞【灼魂】：你的回合内，你的【闪】均视为【杀】
EXTRA_VIRTUAL_RULES.push({
  skill: 'zhuohun', as: 'sha',
  test: (cards, game, player) => !!cards && cards.length === 1 && cards[0].name === 'shan' && game?.turnPlayer === player,
});
// 神庞统【鸾锁】：你的回合内，与此前本回合进入弃牌堆花色均不同的手牌视为【铁索连环】
EXTRA_VIRTUAL_RULES.push({
  skill: 'luansuo', as: 'tiesuo',
  test: (cards, game, player) => {
    if (!cards || cards.length !== 1) return false;
    if (!game || game.turnPlayer !== player) return false;
    const c = cards[0];
    if (!c || !c.suit || c.suit === 'none') return false;
    const used = player?.flags?.luansuoSuits || [];
    return !used.includes(c.suit);
  },
});
// 界孙策【激昂】：你点数为 K 的牌均视为【杀】
EXTRA_VIRTUAL_RULES.push({
  skill: 'jiang2', as: 'sha',
  test: (cards) => !!cards && cards.length === 1 && cards[0].num === 13,
});
// 武关羽【绝武】：点数为 2 的牌可当任意伤害牌使用（每种牌名每回合限一次）
for (const name of ['sha', 'juedou', 'nanman', 'wanjian', 'huogong']) {
  EXTRA_VIRTUAL_RULES.push({
    skill: 'juewu', as: name,
    test: (cards, game, player) => {
      if (!cards || cards.length !== 1 || cards[0].num !== 2) return false;
      return (player?.flags?.juewuUsed || {})[`${game?.turnCount}:${name}`] !== true;
    },
  });
}
// ==================== 协作批次 D（星河璀璨·限定）====================
// 星曹仁【砺锋】：一张本回合未使用过的颜色的手牌当不计次数的【杀】或【无懈可击】使用
for (const name of ['sha', 'wuxie']) {
  EXTRA_VIRTUAL_RULES.push({
    skill: 'lifeng', as: name,
    test: (cards, game, player) => {
      if (!cards || cards.length !== 1 || !game || !player) return false;
      const c = cards[0];
      const col = (c.suit === 'heart' || c.suit === 'diamond') ? 'red'
        : (c.suit === 'spade' || c.suit === 'club') ? 'black' : null;
      if (!col) return false;
      const used = player.flags?.lifengColors;
      if (used && used.turn === game.turnCount && used.list.includes(col)) return false;
      c.__lifeng = { turn: game.turnCount, col };
      return true;
    },
  });
}
// 赵襄【芳魂】：移去 1 个「梅影」发动【龙胆】（【杀】↔【闪】）
EXTRA_VIRTUAL_RULES.push({
  skill: 'fanghun', as: 'sha',
  test: (cards, game, player) => !!cards && cards.length === 1 && cards[0].name === 'shan'
    && (player?.marks?.meiying || 0) > 0,
});
EXTRA_VIRTUAL_RULES.push({
  skill: 'fanghun', as: 'shan',
  test: (cards, game, player) => !!cards && cards.length === 1 && cards[0].name === 'sha'
    && (player?.marks?.meiying || 0) > 0,
});
// 文鸯【冲坚】：一张装备牌当【酒】或【杀】使用（吴势力技）
for (const name of ['jiu', 'sha']) {
  EXTRA_VIRTUAL_RULES.push({
    skill: 'chongjian', as: name,
    test: (cards, game, player) => {
      if (!cards || cards.length !== 1) return false;
      if (CARD_META[cards[0].name]?.type !== 'equip') return false;
      if (name === 'sha') cards[0].__chongjian = true;
      return true;
    },
  });
}

// ==================== 稀世珍宝（xe，2026-10-26）====================
// 张让【滔乱】：弃置一张手牌后，可将该牌当作【无中生有】使用
EXTRA_VIRTUAL_RULES.push({
  skill: 'xe_taoluan', as: 'wuzhong',
  test: (cards) => !!cards && cards.length === 1,
});
