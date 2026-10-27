// 门阀士族（clan3）批次 · 族将 13 位
// clan（宗族标签）：'xun' 颍川荀氏 / 'wang' 太原王氏 / 'wu' 陈留吴氏 / 'lu' 吴郡陆氏 /
//                 'yang' 弘农杨氏 / 'zhuge' 琅琊诸葛氏
// 以上 6 个 clan 取值**全部为既有值**：xun/wang 见 src/data/clan.js，wu/lu/yang 见 clan2.js，
// zhuge 见 phase4.js（诸葛诞）。本批次未引入任何新 clan 取值。
// 宗族技复用既有实现：中流 zhongliu、蹈节 daojie、定安 dingan、抚宁 funing（src/skills/clan.js）
//                     穆荫 muyin、泽烈 zelie、去惑 quhuo（src/skills/clan2.js）
// 本批新增宗族技：纷势 cl3_fenshi（琅琊诸葛氏，见 src/skills/clan3.js）
// 势力说明：族荀采 / 族荀爽 / 族荀彧 / 族王允 / 族杨赐 官方为「群」；族诸葛果 / 族吴苋 / 族吴班 为「蜀」。
// 体力说明：按技能文本给的体力数值填写（本批次全部为 3 体力，族吴班 4 体力）。
export const CLAN3_GENERALS = [
  // ================= 颍川·荀氏（宗族技：蹈节）=================
  // 族荀攸：魏 3 体力；技能 百出 / 奇策（衍生）/ 蹈节
  { id: 'clan3_xunyou', name: '族荀攸', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'xun', skills: ['cl3_baichu', 'cl3_qice', 'daojie'] },
  // 族荀采：群 3 体力 女；技能 烈誓 / 点盏 / 还阴 / 蹈节
  { id: 'clan3_xuncai', name: '族荀采', kingdom: 'qun', hp: 3, gender: 'female', pack: 'clan2', clan: 'xun', skills: ['cl3_lieshi', 'cl3_dianzhan', 'cl3_huanyin', 'daojie'] },
  // 族荀莳：魏 3 体力；技能 清绝 / 萦香 / 蹈节（性别资料未核实，按默认 male）
  { id: 'clan3_xunshi', name: '族荀莳', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'xun', skills: ['cl3_qingjue', 'cl3_yingxiang', 'daojie'] },
  // 族荀爽：群 3 体力；技能 佯疾 / 耽道 / 清励 / 蹈节
  { id: 'clan3_xunshuang', name: '族荀爽', kingdom: 'qun', hp: 3, pack: 'clan2', clan: 'xun', skills: ['cl3_yangji', 'cl3_dandao', 'cl3_qingli', 'daojie'] },

  // ================= 太原·王氏（宗族技：中流）=================
  // 族王广：魏 3 体力；技能 离论 / 见机 / 中流
  { id: 'clan3_wangguang', name: '族王广', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'wang', skills: ['cl3_lilun', 'cl3_jianji', 'zhongliu'] },
  // 族王明山：魏 3 体力；技能 弹雀 / 剩墨 / 中流
  { id: 'clan3_wangmingshan', name: '族王明山', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'wang', skills: ['cl3_tanque', 'cl3_shengmo', 'zhongliu'] },
  // 族王允：群 3 体力；技能 解悬 / 铭戒 / 中流
  { id: 'clan3_wangyun', name: '族王允', kingdom: 'qun', hp: 3, pack: 'clan2', clan: 'wang', skills: ['cl3_jiexuan', 'cl3_mingjie', 'zhongliu'] },

  // ================= 陈留·吴氏（宗族技：穆荫）=================
  // 族吴苋：蜀 3 体力 女；技能 移荣 / 贵相 / 穆荫
  { id: 'clan3_wuxian', name: '族吴苋', kingdom: 'shu', hp: 3, gender: 'female', pack: 'clan2', clan: 'wu', skills: ['cl3_yirong', 'cl3_guixiang', 'muyin'] },
  // 族吴班：蜀 4 体力；技能 斩钉 / 穆荫
  { id: 'clan3_wuban', name: '族吴班', kingdom: 'shu', hp: 4, pack: 'clan2', clan: 'wu', skills: ['cl3_zhanding', 'muyin'] },

  // ================= 琅琊·诸葛氏（宗族技：纷势）=================
  // 族诸葛果：蜀 3 体力 女；技能 扶摇 / 纷势
  { id: 'clan3_zhugeguo', name: '族诸葛果', kingdom: 'shu', hp: 3, gender: 'female', pack: 'clan2', clan: 'zhuge', skills: ['cl3_fuyao', 'cl3_fenshi'] },

  // ================= 吴郡·陆氏（宗族技：泽烈）=================
  // 族陆绩：吴 3 体力；技能 该览 / 奋驽 / 泽烈
  { id: 'clan3_luji', name: '族陆绩', kingdom: 'wu', hp: 3, pack: 'clan2', clan: 'lu', skills: ['cl3_gailan', 'cl3_fennu', 'zelie'] },

  // ================= 弘农·杨氏（宗族技：去惑）=================
  // 族杨赐：群 3 体力；技能 切议 / 谏直 / 去惑
  { id: 'clan3_yangci', name: '族杨赐', kingdom: 'qun', hp: 3, pack: 'clan2', clan: 'yang', skills: ['cl3_qieyi', 'cl3_jianzhi', 'quhuo'] },
];
