// 群英荟萃·补全（阶段 6D 批次 22 将，pack = 'qunying'）
// 覆盖 19 个子主题（原「芝兰玉树」位曹叡归 6E 独占，本包暂无该子包武将）：
//   才子佳人 孔融 · 天下归心 王朗 · 纵横捭阖 阚泽 · 正音雅乐 嵇康 · 百战虎贲 纪灵 / 沙摩柯
//   奇人异士 司马徽 · 计将安出 田丰 · 笔舌如椽 陈琳 / 王粲 · 豆蔻梢头 关银屏
//   皇家贵胄 刘协 / 曹节 · 章台春望 邹氏 · 锦瑟良缘 甘夫人 · 钟灵毓秀 诸葛瑾
//   逐鹿天下 刘焉 · 食禄尽忠 审配 · 上兵伐谋 蒋干 · 兵临城下 文聘
//   千里单骑 马良 · 武将列传 李典
// 技能字段与其它包一致；技能实现见 src/skills/qunying2.js（qy2s_ 前缀）
export const QUNYING2_GENERALS = [
  // ===== 才子佳人 =====
  { id: 'qy2_kongrong', name: '孔融', kingdom: 'qun', hp: 3, skills: ['qy2s_lirang', 'qy2s_mingshi'], pack: 'qunying' },

  // ===== 天下归心 =====
  { id: 'qy2_wanglang', name: '王朗', kingdom: 'qun', hp: 3, skills: ['qy2s_gushe', 'qy2s_jinci'], pack: 'qunying' },

  // ===== 纵横捭阖 =====
  { id: 'qy2_kanze', name: '阚泽', kingdom: 'wu', hp: 3, skills: ['qy2s_xiashu', 'qy2s_kuanshi'], pack: 'qunying' },

  // ===== 正音雅乐 =====
  { id: 'qy2_jikang', name: '嵇康', kingdom: 'wei', hp: 3, skills: ['qy2s_qingxian', 'qy2s_juexiang'], pack: 'qunying' },

  // ===== 百战虎贲（2） =====
  { id: 'qy2_jiling', name: '纪灵', kingdom: 'qun', hp: 4, skills: ['qy2s_shuangren'], pack: 'qunying' },
  { id: 'qy2_shamoke', name: '沙摩柯', kingdom: 'qun', hp: 4, skills: ['qy2s_jili', 'qy2s_manxi'], pack: 'qunying' },

  // ===== 奇人异士 =====
  { id: 'qy2_simahui', name: '司马徽', kingdom: 'qun', hp: 3, skills: ['qy2s_jianjie', 'qy2s_yinshi'], pack: 'qunying' },

  // ===== 计将安出 =====
  { id: 'qy2_tianfeng', name: '田丰', kingdom: 'qun', hp: 3, skills: ['qy2s_suishi', 'qy2s_sijian'], pack: 'qunying' },

  // ===== 笔舌如椽（2） =====
  { id: 'qy2_chenlin', name: '陈琳', kingdom: 'qun', hp: 3, skills: ['qy2s_bifa', 'qy2s_songci'], pack: 'qunying' },
  { id: 'qy2_wangcan', name: '王粲', kingdom: 'qun', hp: 3, skills: ['qy2s_denglou', 'qy2s_qiai'], pack: 'qunying' },

  // ===== 豆蔻梢头 =====
  { id: 'qy2_guanyinping', name: '关银屏', kingdom: 'shu', hp: 4, gender: 'female', skills: ['qy2s_xueji', 'qy2s_huxiao'], pack: 'qunying' },

  // ===== 皇家贵胄（2） =====
  { id: 'qy2_liuxie', name: '刘协', kingdom: 'qun', hp: 3, skills: ['qy2s_tianming', 'qy2s_mizhao'], pack: 'qunying' },
  { id: 'qy2_caojie', name: '曹节', kingdom: 'qun', hp: 3, gender: 'female', skills: ['qy2s_shoujie', 'qy2s_jiaofang'], pack: 'qunying' },

  // ===== 章台春望 =====
  { id: 'qy2_zoushi', name: '邹氏', kingdom: 'qun', hp: 3, gender: 'female', skills: ['qy2s_huoshui', 'qy2s_qingcheng'], pack: 'qunying' },

  // ===== 锦瑟良缘 =====
  { id: 'qy2_ganfuren', name: '甘夫人', kingdom: 'shu', hp: 3, gender: 'female', skills: ['qy2s_shushen', 'qy2s_shenzhi'], pack: 'qunying' },

  // ===== 钟灵毓秀 =====
  { id: 'qy2_zhugejin', name: '诸葛瑾', kingdom: 'wu', hp: 3, skills: ['qy2s_hongyuan', 'qy2s_huanshi'], pack: 'qunying' },

  // ===== 逐鹿天下 =====
  { id: 'qy2_liuyan', name: '刘焉', kingdom: 'qun', hp: 4, skills: ['qy2s_tushe', 'qy2s_limu'], pack: 'qunying' },

  // ===== 食禄尽忠 =====
  { id: 'qy2_shenpei', name: '审配', kingdom: 'qun', hp: 3, skills: ['qy2s_gangzhi', 'qy2s_beizhan'], pack: 'qunying' },

  // ===== 上兵伐谋 =====
  { id: 'qy2_jianggan', name: '蒋干', kingdom: 'qun', hp: 3, skills: ['qy2s_weicheng', 'qy2s_daoshu'], pack: 'qunying' },

  // ===== 兵临城下 =====
  { id: 'qy2_wenpin', name: '文聘', kingdom: 'wei', hp: 4, skills: ['qy2s_zhenwei'], pack: 'qunying' },

  // ===== 千里单骑 =====
  { id: 'qy2_maliang', name: '马良', kingdom: 'shu', hp: 3, skills: ['qy2s_zishu', 'qy2s_yingyuan'], pack: 'qunying' },

  // ===== 武将列传 =====
  { id: 'qy2_lidian', name: '李典', kingdom: 'wei', hp: 4, skills: ['qy2s_xunxun', 'qy2s_yongjue'], pack: 'qunying' },
];
