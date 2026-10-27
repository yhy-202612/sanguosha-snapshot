// 阶段 5B「国战·不臣篇」（buchen）武将数据 · 7 位（去重后实际新增）
// 说明：
//   1) 官方「国战·不臣篇·上」(2021 手杀版) 共 9 将，其中
//      董昭（qunying 包 id: dongzhao）、徐庶（yj2011 包 id: xushu）已存在于本项目，
//      按去重要求跳过，故本文件只登记 7 位。
//   2) 双势力将：官方为「魏&蜀 / 蜀&吴 / 蜀&群 / 魏&群 / 吴&群 / 魏&吴」等，
//      引擎支持 kingdom + kingdom2 双势力字段（参考 flash 张辽），此处按官方组合填写。
//   3) 体力换算：国战「2 阴阳鱼 = 4 体力」、「1.5 阴阳鱼 = 3 体力」。
//   4) 唐咨【恂恂】由【兴棹】动态赋予（不在 skills 列表中，技能已单独注册）。
export const BUCHEN_GENERALS = [
  // 孟达：魏&蜀 1.5 阴阳鱼；技能 求安 / 量反（「怠军反复」）
  { id: 'buchen_mengda', name: '孟达', kingdom: 'wei', kingdom2: 'shu', hp: 3, pack: 'buchen',
    skills: ['bc_qiuan', 'bc_liangfan'] },

  // 糜芳&傅士仁：蜀&吴 2 阴阳鱼；技能 锋势（双将，id 按需求写作 mifang_fushiren）
  { id: 'mifang_fushiren', name: '糜芳&傅士仁', kingdom: 'shu', kingdom2: 'wu', hp: 4, pack: 'buchen',
    skills: ['bc_fengshi'] },

  // 刘琦：蜀&群 1.5 阴阳鱼；技能 问计 / 屯江（「居外而安」）
  { id: 'buchen_liuqi', name: '刘琦', kingdom: 'shu', kingdom2: 'qun', hp: 3, pack: 'buchen',
    skills: ['bc_wenji', 'bc_tunjiang'] },

  // 张鲁：魏&群 1.5 阴阳鱼；技能 布施 / 米道（「政宽教惠」）
  { id: 'buchen_zhanglu', name: '张鲁', kingdom: 'wei', kingdom2: 'qun', hp: 3, pack: 'buchen',
    skills: ['bc_bushi', 'bc_midao'] },

  // 士燮：吴&群 1.5 阴阳鱼；技能 避乱 / 礼下（「百粤灵欹」）
  { id: 'buchen_shixie', name: '士燮', kingdom: 'wu', kingdom2: 'qun', hp: 3, pack: 'buchen',
    skills: ['bc_biluan', 'bc_lixia'] },

  // 唐咨：魏&吴 2 阴阳鱼；技能 兴棹（锁定技，1 个或以上受伤势力时拥有【恂恂】）
  { id: 'buchen_tangzi', name: '唐咨', kingdom: 'wei', kingdom2: 'wu', hp: 4, pack: 'buchen',
    skills: ['bc_xingzhao'] },

  // 严白虎：群 2 阴阳鱼；技能 雉盗 / 寄篱（「豺牙落涧」）
  // 官方【寄篱】为副将技（选体力牌时 -1 单独阴阳鱼），引擎无双将副将位，且 2025 修订已取消该限制，
  // 故体力按 2 阴阳鱼 = 4 直接登记。
  { id: 'buchen_yanbaihu', name: '严白虎', kingdom: 'qun', hp: 4, pack: 'buchen',
    skills: ['bc_zhidao', 'bc_jili'] },
];
