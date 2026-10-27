// 阶段 5I · 神将跨线 10 将（pack = 'shen2'，PACK_CN = 「神·跨线」）
// ---------------------------------------------------------------
// 「神·跨线」是本仓库自建的跨势力神将批次：把魏 / 蜀 / 吴 / 群 各家名将的成名技做「神格化」后
// 重新组合到神势力牌面上。技能名允许与本家武将重名（跨线神将本就是同一人物的神格版本），
// 但技能 id 全部使用 sn_ 前缀以保证唯一，实现见 src/skills/shen2.js。
//
// ◆ 技能来源核实情况（逐条，详见 src/skills/shen2.js 文件头）：
//   [官方口径] 神太史慈【天义】、神荀彧【奇策】【节命】、神孙策【英魂】【激昂】、神鲁肃【缔盟】【好施】、
//              神黄忠【烈弓】、神庞统【涅槃】【连环】、神甄姬【倾国】【洛神】、神典韦【强袭】、
//              神曹丕【放逐】【行殇】——均沿用同名前代武将的官方（或官方简化）文本。
//   [自拟]     神张辽【夺锐】【止啼】、神太史慈【击虚】、神黄忠【穿云】、神典韦【古之恶来】
//              ——无官方神将条目可考，按人物典故自拟，desc 即本实现口径。
// ---------------------------------------------------------------
export const SHEN2_GENERALS = [
  // 神张辽 · 4 体力 · 夺锐 / 止啼（★自拟）
  { id: 'shen2_zhangliao', name: '神张辽', kingdom: 'shen', hp: 4, pack: 'shen',
    skills: ['sn_duorui', 'sn_zhiti'] },

  // 神太史慈 · 4 体力 · 击虚 / 天义（天义为官方口径的简化，击虚★自拟）
  { id: 'shen2_taishici', name: '神太史慈', kingdom: 'shen', hp: 4, pack: 'shen',
    skills: ['sn_jixu', 'sn_tianyi'] },

  // 神荀彧 · 3 体力 · 奇策 / 节命
  { id: 'shen2_xunyu', name: '神荀彧', kingdom: 'shen', hp: 3, pack: 'shen',
    skills: ['sn_qice', 'sn_jieming'] },

  // 神孙策 · 4 体力 · 英魂 / 激昂
  { id: 'shen2_sunce', name: '神孙策', kingdom: 'shen', hp: 4, pack: 'shen',
    skills: ['sn_yinghun', 'sn_jingge'] },

  // 神鲁肃 · 3 体力 · 缔盟 / 好施
  { id: 'shen2_lusu', name: '神鲁肃', kingdom: 'shen', hp: 3, pack: 'shen',
    skills: ['sn_dimeng', 'sn_haoshi'] },

  // 神黄忠 · 4 体力 · 烈弓 / 穿云（穿云★自拟）
  { id: 'shen2_huangzhong', name: '神黄忠', kingdom: 'shen', hp: 4, pack: 'shen',
    skills: ['sn_liegong', 'sn_chuanyun'] },

  // 神庞统 · 3 体力 · 涅槃 / 连环
  { id: 'shen2_pangtong', name: '神庞统', kingdom: 'shen', hp: 3, pack: 'shen',
    skills: ['sn_niepan', 'sn_lianhuan'] },

  // 神甄姬 · 3 体力 · 女性 · 倾国 / 洛神
  { id: 'shen2_zhenji', name: '神甄姬', kingdom: 'shen', hp: 3, pack: 'shen', gender: 'female',
    skills: ['sn_qingguo', 'sn_luoshen'] },

  // 神典韦 · 4 体力 · 强袭 / 古之恶来（古之恶来★自拟）
  { id: 'shen2_dianwei', name: '神典韦', kingdom: 'shen', hp: 4, pack: 'shen',
    skills: ['sn_qiangxi', 'sn_guzhielai'] },

  // 神曹丕 · 3 体力 · 放逐 / 行殇
  { id: 'shen2_caopi', name: '神曹丕', kingdom: 'shen', hp: 3, pack: 'shen',
    skills: ['sn_fangzhu', 'sn_xingshang'] },
];
