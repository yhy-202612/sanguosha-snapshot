// 稀世珍宝（pack = 'xe'）：7 名 OL/演义向稀有武将
// 技能实现见 src/skills/xe.js（id 前缀 xe_）
export const XE_GENERALS = [
  // 张让：群 3 体力；滔乱
  { id: 'xe_zhangrang', name: '张让', kingdom: 'qun', hp: 3, pack: 'xe', skills: ['xe_taoluan'] },
  // 庞德公：群 3 体力；评才
  { id: 'xe_pangdegong', name: '庞德公', kingdom: 'qun', hp: 3, pack: 'xe', skills: ['xe_pingcai'] },
  // 黄承彦：群 3 体力；雅士
  { id: 'xe_huangchengyan', name: '黄承彦', kingdom: 'qun', hp: 3, pack: 'xe', skills: ['xe_yashi'] },
  // 钟琰：魏 3 体力 女；观戏
  { id: 'xe_zhongyan', name: '钟琰', kingdom: 'wei', hp: 3, gender: 'female', pack: 'xe', skills: ['xe_guanxi'] },
  // 张梁：群 4 体力；妖术
  { id: 'xe_zhangliang', name: '张梁', kingdom: 'qun', hp: 4, pack: 'xe', skills: ['xe_yaoshu'] },
  // 张宝：群 4 体力；呼风
  { id: 'xe_zhangbao', name: '张宝', kingdom: 'qun', hp: 4, pack: 'xe', skills: ['xe_hufeng'] },
  // 丘力居：群 4 体力；骁骑 / 掠阵
  { id: 'xe_qiuliju', name: '丘力居', kingdom: 'qun', hp: 4, pack: 'xe', skills: ['xe_xiaoqi', 'xe_luezhen'] },
];
