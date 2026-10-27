// 稀有·传说（pack = 'rare'）：7 名高人气限定武将
// 技能实现见 src/skills/rare.js（id 前缀 ra_）
export const RARE_GENERALS = [
  // 神魏延：神 4 体力；奇谋
  { id: 'ra_shenweiyan', name: '神魏延', kingdom: 'shen', hp: 4, pack: 'rare', skills: ['ra_qimou'] },
  // 孙鲁育：吴 3 体力 女；止息
  { id: 'ra_sunluyu', name: '孙鲁育', kingdom: 'wu', hp: 3, gender: 'female', pack: 'rare', skills: ['ra_zhixi'] },
  // 骆统：吴 4 体力；勤政
  { id: 'ra_luotong', name: '骆统', kingdom: 'wu', hp: 4, pack: 'rare', skills: ['ra_qinzheng'] },
  // 贺齐：吴 4 体力；奋威
  { id: 'ra_heqi', name: '贺齐', kingdom: 'wu', hp: 4, pack: 'rare', skills: ['ra_fenwei'] },
  // 全琮：吴 4 体力；邀名
  { id: 'ra_quancong', name: '全琮', kingdom: 'wu', hp: 4, pack: 'rare', skills: ['ra_yaoming'] },
  // 胡车儿：群 4 体力；盗戟
  { id: 'ra_hucher', name: '胡车儿', kingdom: 'qun', hp: 4, pack: 'rare', skills: ['ra_daoji'] },
  // 蹋顿：群 4 体力；乱战
  { id: 'ra_tadun', name: '蹋顿', kingdom: 'qun', hp: 4, pack: 'rare', skills: ['ra_luanzhan'] },
];
