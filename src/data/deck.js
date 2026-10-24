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
];

export const DECKS = {
  standard: { name: '标准包', entries: expand(STD) },
  ex: { name: '标准+军争', entries: expand([...STD, ...EX]) },
};

function expand(list) {
  return list.map(([name, code]) => ({ name, ...parse(code) }));
}

export function deckEntries(kind = 'standard') {
  return (DECKS[kind] || DECKS.standard).entries;
}
