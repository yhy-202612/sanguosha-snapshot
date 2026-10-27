// 晋势力 · 文德武备（补全）—— 阶段 5C 批次 · 12 将
// 官方出处：《三国杀OL》文德武备系列（理 / 备 / 果 / 戒 / 约）。
// 资料来源：三国杀OL 官网武将页（sanguosha.com/hero/70xx）、OL 版本更新公告、
//           三国杀 Wiki（sanguosha.fandom.com）、萌娘百科「文德武备」系列条目。
//
// ◆ 势力说明：文德武备是「混势力」子包——官方编号里 华歆 = WEI 084、成济&成倅 = SP.WEI 155，
//   属魏势力；其余 10 位为晋势力（JIN 0xx）。如需统一显示为「晋」，把这两条的 kingdom 改成 'jin' 即可。
// ◆ 隐匿技：羊徽瑜【慧容】为官方「隐匿」标签 → hidden: true（引擎 M8 机制）。
export const JIN2_GENERALS = [
  // 司马伷（JIN 005）· 4 体力 · 才望 / 纳降（资料已核实：OL 官网 hero/7011 + 2021-11-24 版本更新公告）
  { id: 'jin2_simazhou', name: '司马伷', kingdom: 'jin', hp: 4, pack: 'jin',
    skills: ['caiwang', 'najiang'] },

  // 华歆（WEI 084）· 3 体力 · 草诏 / 息兵（资料已核实：OL 官网 hero/7015）
  { id: 'jin2_huaxin', name: '华歆', kingdom: 'wei', hp: 3, pack: 'jin',
    skills: ['caozhao', 'xibing2'] },

  // 石苞（JIN 016）· 4 体力 · 擢升（资料已核实：OL 官网 hero/7009）
  { id: 'jin2_shibao', name: '石苞', kingdom: 'jin', hp: 4, pack: 'jin',
    skills: ['zhuosheng'] },

  // 羊徽瑜（羊徽瑜·景献皇后）· 3 体力 · 隐匿技武将 · 慧容 / 慈威 / 才媛
  { id: 'jin2_yanghuiyu', name: '羊徽瑜', kingdom: 'jin', hp: 3, pack: 'jin', hidden: true,
    skills: ['huirong', 'ciwei', 'caiyuan'] },

  // 成济&成倅（SP.WEI 155）· 4 体力 · 双将 · 透髓 / 畜鸣
  { id: 'chengji_chengcui', name: '成济&成倅', kingdom: 'wei', hp: 4, pack: 'jin',
    skills: ['tousui', 'chuming'] },

  // 卫瓘（JIN 020）· 3 体力 · 忠允 / 神品（资料已核实：OL 官网 hero/7013）
  { id: 'jin2_weiguan', name: '卫瓘', kingdom: 'jin', hp: 3, pack: 'jin',
    skills: ['zhongyun', 'shenpin'] },

  // 辛敞 · 3 体力 · 参谋 / 从鉴（资料已核实：OL 官网 2022-03-18 公告「文德武备辛敞上线」）
  { id: 'jin2_xinchang', name: '辛敞', kingdom: 'jin', hp: 3, pack: 'jin',
    skills: ['canmou', 'congjian2'] },

  // 贾充（JIN 021）· 3 体力 · 凶竖 / 奸回（三国杀 Wiki「晉賈充」；原文「兇堅」为繁体笔误，取「凶竖」）
  { id: 'jin2_jiachong', name: '贾充', kingdom: 'jin', hp: 3, pack: 'jin',
    skills: ['xiongshu', 'jianhui'] },

  // 王祥（JIN 032）· 3 体力 · 冰心（文德武备·戒 2022 版，bwiki / 萌娘百科）
  { id: 'jin2_wangxiang', name: '王祥', kingdom: 'jin', hp: 3, pack: 'jin',
    skills: ['bingxin'] },

  // 杨艳（JIN 029）· 3 体力 · 选备 / 娴婉（OL 军争版：选备为主动弃牌型；资料已核实官网 hero/7016）
  { id: 'jin2_yangyan', name: '杨艳', kingdom: 'jin', hp: 3, pack: 'jin',
    skills: ['xuanbei', 'xianwan'] },

  // 杨芷（JIN 025）· 3 体力 · 婉嫕 / 埋祸（文德武备·约 OL2022 版）
  { id: 'jin2_yangzhi', name: '杨芷', kingdom: 'jin', hp: 3, pack: 'jin',
    skills: ['wanyi', 'maihuo'] },

  // 荀顗 · 3 体力 · 践雅 / 举章 —— ★资料未核实★
  // 官方文德武备（理/备/果/戒/约）五个子包内均查不到荀顗的技能原文，
  // 本批按史评「明三礼、知朝廷大仪，唯阿意苟合于贾充、荀勖之间」+ 晋势力机制自拟（详见 src/skills/jin2.js 文件头）。
  { id: 'jin2_xunyi', name: '荀顗', kingdom: 'jin', hp: 3, pack: 'jin',
    skills: ['jianya', 'juzhang'] },
];
