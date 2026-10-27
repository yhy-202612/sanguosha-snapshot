// 阶段 6C · 威震天下 / 武庙 / 星河璀璨·限定 剩余 15 将（pack = 'weizhen'）
// 与既有 weizhen（威曹操/威刘备/威孙尚香/威张星彩/威关银屏/威公孙瓒/武诸葛亮/武关羽/武张飞/武陆抗）
// 与 xinghe（星夏侯霸/星法正/星蒋琬/星曹仁/星荀彧/曹婴/曹纯/赵襄/鲍三娘/关索/文鸯/王双）均不重名。
// 武将 id 统一 wz2_<拼音>，技能 id 统一 wz2s_ 前缀（禁用 jie_/mou_/ji_/shen_/sp_/ol_）。
export const WEIZHEN2_GENERALS = [
  // ---- 威震天下（群，4 体力；威系列均为「威-威震天下」扩展）----
  { id: 'wz2_weizhangliao', name: '威张辽', kingdom: 'qun', hp: 4, pack: 'weizhen', skills: ['wz2s_yuxi', 'wz2s_porong'] },
  { id: 'wz2_weizhaoyun', name: '威赵云', kingdom: 'qun', hp: 4, pack: 'weizhen', skills: ['wz2s_longxiang', 'wz2s_chongzhen'] },
  { id: 'wz2_weimachao', name: '威马超', kingdom: 'qun', hp: 4, pack: 'weizhen', skills: ['wz2s_zhongtao', 'wz2s_jizhan'] },
  { id: 'wz2_weihuangzhong', name: '威黄忠', kingdom: 'qun', hp: 4, pack: 'weizhen', skills: ['wz2s_chuanyang', 'wz2s_dingjun'] },
  { id: 'wz2_weidianwei', name: '威典韦', kingdom: 'qun', hp: 4, pack: 'weizhen', skills: ['wz2s_elai', 'wz2s_zhiji'] },
  // ---- 武庙（限定-武庙；武系列体力上限高于本家）----
  { id: 'wz2_wuzhaoyun', name: '武赵云', kingdom: 'shu', hp: 5, pack: 'weizhen', skills: ['wz2s_juechen', 'wz2s_qijin'] },
  { id: 'wz2_wumachao', name: '武马超', kingdom: 'shu', hp: 5, pack: 'weizhen', skills: ['wz2s_tieji2', 'wz2s_shenwei'] },
  { id: 'wz2_wuhuangzhong', name: '武黄忠', kingdom: 'shu', hp: 5, pack: 'weizhen', skills: ['wz2s_liehun', 'wz2s_pozhen'] },
  { id: 'wz2_wudianwei', name: '武典韦', kingdom: 'wei', hp: 5, pack: 'weizhen', skills: ['wz2s_guzhielai2', 'wz2s_sheshen'] },
  // ---- 星河璀璨 / 限定专属 ----
  { id: 'wz2_xingsunquan', name: '星孙权', kingdom: 'wu', hp: 4, pack: 'weizhen', skills: ['wz2s_xingheng', 'wz2s_ningwang'] },
  { id: 'wz2_xingliubei', name: '星刘备', kingdom: 'shu', hp: 4, pack: 'weizhen', skills: ['wz2s_xingde', 'wz2s_renwang'] },
  { id: 'wz2_xingcaocao', name: '星曹操', kingdom: 'wei', hp: 4, pack: 'weizhen', skills: ['wz2s_xingxiong', 'wz2s_guancang'] },
  { id: 'wz2_xingguanyu', name: '星关羽', kingdom: 'shu', hp: 4, pack: 'weizhen', skills: ['wz2s_wuxing', 'wz2s_weizhen'] },
  { id: 'wz2_xingzhangfei', name: '星张飞', kingdom: 'shu', hp: 4, pack: 'weizhen', skills: ['wz2s_xinghou', 'wz2s_xingxiao'] },
  { id: 'wz2_xingdaqiao', name: '星大乔', kingdom: 'wu', hp: 3, pack: 'weizhen', skills: ['wz2s_xingying', 'wz2s_yizhu'], gender: 'female' },
];
