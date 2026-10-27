// 神话再临·火（7 将）的转化规则
//  - 连环（庞统）：黑色梅花手牌 → 【铁索连环】
//  - 火计（卧龙诸葛亮）：红色手牌 → 【火攻】
//  - 看破（卧龙诸葛亮）：黑色手牌 → 【无懈可击】
//    ⚠ 已知限制：game.js 的 wuxieChain 只扫描实体 name==='wuxie' 的牌，
//      虚拟无懈不会被动触发（主动使用时正常）。
//  - 乱击（袁绍）：两张同花色手牌 → 【万箭齐发】
//  - 双雄（颜良文丑）：本回合判定牌的异色手牌 → 【决斗】
const isRed = (c) => c.suit === 'heart' || c.suit === 'diamond';

export const HUO_VIRTUAL_RULES = [
  { skill: 'lianhuan', as: 'tiesuo', test: (cards) => cards.length === 1 && cards[0].suit === 'club' && !isRed(cards[0]) },
  { skill: 'huoji', as: 'huogong', test: (cards) => cards.length === 1 && isRed(cards[0]) },
  { skill: 'kanpo', as: 'wuxie', test: (cards) => cards.length === 1 && !isRed(cards[0]) },
  { skill: 'luanji', as: 'wanjian', test: (cards) => cards.length === 2 && cards[0].suit === cards[1].suit },
  { skill: 'shuangxiong', as: 'juedou', test: (cards, game, player) => {
    if (cards.length !== 1) return false;
    const g = game || player?.game;
    const p = player;
    if (!p || !p.flags) return false;
    if (p.flags.shuangxiongTurn !== (g ? g.turnCount : p.flags.shuangxiongTurn)) return false;
    const judgeSuit = p.flags.shuangxiongSuit;
    if (!judgeSuit) return false;
    const judgeRed = judgeSuit === 'heart' || judgeSuit === 'diamond';
    return isRed(cards[0]) !== judgeRed;
  } },
];
