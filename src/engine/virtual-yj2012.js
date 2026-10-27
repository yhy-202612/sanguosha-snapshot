// 一将成名 2012 转化技规则分片：韩当【弓骑】（装备牌当【杀】）
import { CARD_META } from './cards.js';

export const YJ2012_VIRTUAL_RULES = [
  { skill: 'gongqi', as: 'sha', test: (cs) => cs.length === 1 && !!CARD_META[cs[0].name]?.sub },
];
