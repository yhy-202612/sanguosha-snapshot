// SP·绝世（pack = 'sp5'）：稀有/限定定位的 SP 武将 8 名
// 技能实现见 src/skills/sp5.js（id 前缀 sp5_）
export const SP5_GENERALS = [
  // SP貂蝉：群 3 体力 女；离魂 / 闭月
  { id: 'sp5_diaochan', name: 'SP貂蝉', kingdom: 'qun', hp: 3, gender: 'female', pack: 'sp5', skills: ['sp5_lihun', 'sp5_biyue'] },
  // SP周瑜：吴 3 体力；反间 / 英姿
  { id: 'sp5_zhouyu', name: 'SP周瑜', kingdom: 'wu', hp: 3, pack: 'sp5', skills: ['sp5_fanjian', 'sp5_yingzi'] },
  // 马云禄：蜀 4 体力 女；马术 / 凤魄
  { id: 'sp5_mayunlu', name: '马云禄', kingdom: 'shu', hp: 4, gender: 'female', pack: 'sp5', skills: ['sp5_mashu', 'sp5_fengpo'] },
  // 曹金玉：魏 3 体力 女；金玉
  { id: 'sp5_caojinyu', name: '曹金玉', kingdom: 'wei', hp: 3, gender: 'female', pack: 'sp5', skills: ['sp5_jinyu'] },
  // 孙寒华：吴 3 体力 女；寒华 / 凝冰
  { id: 'sp5_sunhanhua', name: '孙寒华', kingdom: 'wu', hp: 3, gender: 'female', pack: 'sp5', skills: ['sp5_hanhua', 'sp5_ningbing'] },
  // 花鬘：群 4 体力 女；战缘
  { id: 'sp5_huaman', name: '花鬘', kingdom: 'qun', hp: 4, gender: 'female', pack: 'sp5', skills: ['sp5_zhanyuan'] },
  // 张琪瑛：群 3 体力 女；雷击
  { id: 'sp5_zhangqiying', name: '张琪瑛', kingdom: 'qun', hp: 3, gender: 'female', pack: 'sp5', skills: ['sp5_leiji'] },
  // 卑弥呼：群 3 体力 女；邪马台
  { id: 'sp5_himiko', name: '卑弥呼', kingdom: 'qun', hp: 3, gender: 'female', pack: 'sp5', skills: ['sp5_xiamatai'] },
];
