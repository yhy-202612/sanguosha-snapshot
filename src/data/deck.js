// 牌堆构成。花色/点数以简写表示：s♠ h♥ c♣ d♦，A=1 J=11 Q=12 K=13 T=10
const SUIT = { s: 'spade', h: 'heart', c: 'club', d: 'diamond' };
const NUM = { A: 1, T: 10, J: 11, Q: 12, K: 13 };

export function parse([suit, num]) {
  return { suit: SUIT[suit], num: NUM[num] || Number(num) };
}

// 标准包：108 张
const STD = [
  // 杀 31
  ['sha', 's7'], ['sha', 's8'], ['sha', 's8'], ['sha', 's9'], ['sha', 's9'], ['sha', 'sT'], ['sha', 'sT'],
  ['sha', 'c2'], ['sha', 'c3'], ['sha', 'c4'], ['sha', 'c5'], ['sha', 'c6'], ['sha', 'c7'], ['sha', 'c8'],
  ['sha', 'c8'], ['sha', 'c9'], ['sha', 'c9'], ['sha', 'cT'], ['sha', 'cT'], ['sha', 'cJ'], ['sha', 'cJ'],
  ['sha', 'hT'], ['sha', 'hT'], ['sha', 'hJ'],
  ['sha', 'd6'], ['sha', 'd8'], ['sha', 'd9'], ['sha', 'dT'], ['sha', 'dJ'], ['sha', 'dJ'],
  // 闪 15
  ['shan', 'h2'], ['shan', 'h2'], ['shan', 'h3'], ['shan', 'h4'], ['shan', 'h5'], ['shan', 'h6'],
  ['shan', 'h7'], ['shan', 'h8'], ['shan', 'h9'], ['shan', 'hT'], ['shan', 'hJ'], ['shan', 'hQ'], ['shan', 'hK'],
  ['shan', 'd2'], ['shan', 'd3'],
  // 桃 8
  ['tao', 'h3'], ['tao', 'h4'], ['tao', 'h6'], ['tao', 'h7'], ['tao', 'h8'], ['tao', 'h9'], ['tao', 'hQ'], ['tao', 'dQ'],
  // 锦囊 36
  ['wuzhong', 'h7'], ['wuzhong', 'h8'], ['wuzhong', 'h9'], ['wuzhong', 'hJ'],
  ['guohe', 's3'], ['guohe', 's4'], ['guohe', 'sQ'], ['guohe', 'c3'], ['guohe', 'c4'], ['guohe', 'hQ'],
  ['shunshou', 's3'], ['shunshou', 's4'], ['shunshou', 'sJ'], ['shunshou', 'd3'], ['shunshou', 'd4'],
  ['juedou', 'sA'], ['juedou', 'cA'], ['juedou', 'dA'],
  ['jiedao', 'cQ'], ['jiedao', 'cK'],
  ['wanjian', 'hA'],
  ['nanman', 's7'], ['nanman', 'sK'], ['nanman', 'c7'],
  ['taoyuan', 'dA'],
  ['wugu', 'h3'], ['wugu', 'h4'],
  ['wuxie', 'sJ'], ['wuxie', 'cQ'], ['wuxie', 'cK'], ['wuxie', 'dQ'],
  ['lebu', 's6'], ['lebu', 'c6'], ['lebu', 'h6'],
  ['shandian', 'sA'], ['shandian', 'hQ'],
  // 装备 19
  ['qinggang', 's6'], ['cixiong', 'sQ'], ['qinglong', 's5'], ['zhangba', 'sQ'],
  ['guanshi', 'd5'], ['fangtian', 'dQ'], ['qilin', 'h5'], ['zhuge', 'cA'], ['zhuge', 'dA'],
  ['bagua', 's2'], ['bagua', 'c2'], ['renwang', 'c2'],
  ['chitu', 'h5'], ['dawan', 'sK'], ['zixing', 'dK'],
  ['dilu', 'c5'], ['jueying', 's5'], ['zhuahuang', 'dK'],
  ['chitu', 'sQ'],
];

// 军争篇：52 张
const EX = [
  ['jiu', 's9'], ['jiu', 's9'], ['jiu', 'c9'], ['jiu', 'c9'], ['jiu', 'd9'],
  ['sha', 's4'], ['sha', 's5'], ['sha', 's6'], ['sha', 's7'], ['sha', 's8'], ['sha', 's9'], ['sha', 'sT'],
  ['sha', 'c3'], ['sha', 'c4'], ['sha', 'c5'], ['sha', 'c6'], ['sha', 'c7'], ['sha', 'c8'], ['sha', 'c9'],
  ['shan', 'h2'], ['shan', 'h3'], ['shan', 'h4'], ['shan', 'h5'], ['shan', 'h6'], ['shan', 'h7'], ['shan', 'h8'], ['shan', 'h9'], ['shan', 'hT'],
  ['tao', 'h2'], ['tao', 'h5'], ['tao', 'hQ'], ['tao', 'd2'],
  ['huogong', 'h2'], ['huogong', 'h3'], ['huogong', 'dQ'],
  ['tiesuo', 'sQ'], ['tiesuo', 'sK'], ['tiesuo', 'cQ'], ['tiesuo', 'cK'], ['tiesuo', 'dQ'], ['tiesuo', 'dK'],
  ['bingliang', 'sT'], ['bingliang', 'cT'],
  ['wuxie', 'sQ'], ['wuxie', 'sK'], ['wuxie', 'cQ'],
  ['hanbing', 's2'], ['guding', 'sA'], ['tengjia', 's2'], ['tengjia', 'c2'], ['baiyin', 'd2'], ['zixing', 'sK'],
  // 属性【杀】：火杀 5 / 雷杀 5（牌名仍为 sha，带 nature）
  ['sha', 'h4', 'fire'], ['sha', 'h7', 'fire'], ['sha', 'hT', 'fire'], ['sha', 'd4', 'fire'], ['sha', 'd5', 'fire'],
  ['sha', 'c4', 'thunder'], ['sha', 'c5', 'thunder'], ['sha', 'c6', 'thunder'], ['sha', 'c8', 'thunder'], ['sha', 'd6', 'thunder'],
  // 宝物与特殊武器：太平要术 / 木牛流马 / 霹雳车
  ['taiping', 'd6'], ['taiping', 'h6'],
  ['muniu', 'd5'], ['muniu', 'c7'],
  ['piliche', 'dJ'],
  // 新锦囊：兵临城下 / 奇正相生
  ['binglin', 's3'], ['binglin', 'd9'],
  ['qizheng', 'hJ'], ['qizheng', 'cJ'],
  // 弩炮（自定义配件牌）不常驻牌堆：仅当场上有【巧工】（天工·诸葛亮）时由技能加入牌堆
  ['zhuque', 'd4'],   // 朱雀羽扇（巧武器之一，天工·诸葛亮【巧工】可从牌堆取用）
];

export const DECKS = {
  standard: { name: '标准包', entries: expand(STD) },
  ex: { name: '标准+军争', entries: expand([...STD, ...EX]) },
};

function expand(list) {
  // 第三项为属性（'fire' / 'thunder'）：属性【杀】的牌名仍是 sha，靠 nature 区分，界面显示「火杀」「雷杀」
  return list.map(([name, code, nature]) => ({ name, ...parse(code), ...(nature ? { nature } : {}) }));
}

export function deckEntries(kind = 'standard') {
  return (DECKS[kind] || DECKS.standard).entries;
}
