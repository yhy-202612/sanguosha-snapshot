// 江山如故·起（pack = 'jsg_qi'）：17 名武将（线下原创扩「江山如故」起包，2023 原版口径）
// 技能实现见 src/skills/jsg_qi.js（id 前缀 jq_）
// 说明：本包武将原为「群」势力；与现有同名武将共用名字时统一加「起·」前缀以便选将区分。
export const JSG_QI_GENERALS = [
  // 梦曹操（曹操·汉征西将军，QUN 404）：主忠机制核心，靠「猎」标记压制与额外回合
  { id: 'jq_mengcaocao', name: '起·梦曹操', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '汉征西将军', skills: ['jq_zhenglue', 'jq_huilie', 'jq_pingrong'] },
  // 刘备（QUN 150）·负戎荷戈
  { id: 'jq_liubei', name: '起·刘备', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '负戎荷戈', skills: ['jq_jishan', 'jq_zhenqiao'] },
  // 孙坚（QUN 149）·拨定烈志
  { id: 'jq_sunjian', name: '起·孙坚', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '拨定烈志', skills: ['jq_pingtao', 'jq_juelie'] },
  // 皇甫嵩（QUN 054）·安危定倾
  { id: 'jq_huangfusong', name: '起·皇甫嵩', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '安危定倾', skills: ['jq_guanhuo', 'jq_juxia'] },
  // 何进（QUN 025）·独意误国谋
  { id: 'jq_hejin', name: '起·何进', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '独意误国谋', skills: ['jq_zhaobing', 'jq_zhuhuan', 'jq_yanhuo'] },
  // 王允（QUN 053）·居功自矜
  { id: 'jq_wangyun', name: '起·王允', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '居功自矜', skills: ['jq_shelun', 'jq_fayi'] },
  // 桥玄（QUN 114）·泛爱博容
  { id: 'jq_qiaoxuan', name: '起·桥玄', kingdom: 'qun', hp: 3, pack: 'jsg_qi', title: '泛爱博容', skills: ['jq_juezhi', 'jq_jizhao'] },
  // 许劭（QUN 059）·识人读心（访客机制，本实现用技能池等价替代）
  { id: 'jq_xushao', name: '起·许劭', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '识人读心', skills: ['jq_yingmen', 'jq_pingjian'] },
  // 董白（QUN 052）·魔姬
  { id: 'jq_dongbai', name: '起·董白', kingdom: 'qun', hp: 3, gender: 'female', pack: 'jsg_qi', title: '魔姬', skills: ['jq_shichong', 'jq_lianzhu'] },
  // 刘焉（QUN 068）·裂土之宗（主公）
  { id: 'jq_liuyan', name: '起·刘焉', kingdom: 'qun', hp: 3, pack: 'jsg_qi', title: '裂土之宗', skills: ['jq_limu', 'jq_tushe', 'jq_tongjue'] },
  // 杨彪（QUN 113）·德彰海内（3 体力 / 4 上限）
  { id: 'jq_yangbiao', name: '起·杨彪', kingdom: 'qun', hp: 3, maxHp: 4, pack: 'jsg_qi', title: '德彰海内', skills: ['jq_zhaohan', 'jq_rangjie', 'jq_yizheng'] },
  // 南华老仙（QUN 090·江山如故版，与移动版「御风/天书」不同）
  { id: 'jq_nanhua', name: '起·南华老仙', kingdom: 'qun', hp: 3, pack: 'jsg_qi', title: '冯虚御风', skills: ['jq_shoushu', 'jq_zundao', 'jq_xuanhua'] },
  // 王荣（QUN 103）·灵怀皇后
  { id: 'jq_wangrong', name: '起·王荣', kingdom: 'qun', hp: 3, gender: 'female', pack: 'jsg_qi', title: '灵怀皇后', skills: ['jq_fengzi', 'jq_jizhan', 'jq_fusong'] },
  // 朱儁（QUN 083）·征无遗虑
  { id: 'jq_zhujun', name: '起·朱儁', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '征无遗虑', skills: ['jq_fendi', 'jq_jujiang'] },
  // 孔融（QUN 014）·北海太守
  { id: 'jq_kongrong', name: '起·孔融', kingdom: 'qun', hp: 3, pack: 'jsg_qi', title: '北海太守', skills: ['jq_lirang', 'jq_zhengyi'] },
  // 段煨（QUN 112）·凉国之英
  { id: 'jq_duanwei', name: '起·段煨', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '凉国之英', skills: ['jq_langmie'] },
  // 刘宏（QUN 101）·轧庭焚礼（主公）
  { id: 'jq_liuhong', name: '起·刘宏', kingdom: 'qun', hp: 4, pack: 'jsg_qi', title: '轧庭焚礼', skills: ['jq_chaozheng', 'jq_shenchong', 'jq_julian'] },
];
