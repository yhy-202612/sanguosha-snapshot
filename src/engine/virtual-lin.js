// 转化技规则分片（林包）：断粮 / 酒池。
// game.js 会把本数组并入 VIRTUAL_RULES。
// 结构：{ skill: '技能id', as: '目标牌名', test: (cards, player) => 布尔 }
import { CARD_META, isRed } from './cards.js';

export const LIN_VIRTUAL_RULES = [
  // 徐晃 · 断粮：一张黑色基本牌或黑色装备牌当【兵粮寸断】
  {
    skill: 'duanliang', as: 'bingliang',
    test: (cs) => cs.length === 1 && !isRed(cs[0])
      && (CARD_META[cs[0].name]?.type === 'basic' || !!CARD_META[cs[0].name]?.sub),
  },
  // 董卓 · 酒池：一张黑桃手牌当【酒】
  { skill: 'jiuchi', as: 'jiu', test: (cs) => cs.length === 1 && cs[0].suit === 'spade' },
];
