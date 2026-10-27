// 一将成名 2011 转化技规则分片：曹植【酒诗】
export const YJ2011_VIRTUAL_RULES = [
  // 酒诗：一张黑桃手牌当【酒】使用
  { skill: 'jiushi_shi', as: 'jiu', test: (cs) => cs.length === 1 && cs[0].suit === 'spade' },
];
