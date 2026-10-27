// 阶段 6A · 神·武（补全）8 将（pack = 'shenwu'，PACK_CN = '神·武（补全）'）
// 神张飞 / 神邓艾 / 神许褚 / 神孙尚香 / 神貂蝉 / 神张春华 / 神夏侯渊 / 神黄月英
//
// 资料说明（「资料未核实 / 自拟」清单，详细口径见 src/skills/shenwu2.js 文件头）：
//   1. 神张飞（十周年「限定专属·神·武」LE 025，4 体力，称号「两界大巡环使」）【神裁】【巡使】为官方技；
//      标记对照表照抄官方「标准&军争牌堆」说明，「杖/死」两处按引擎既有出口做了等价收窄。
//   2. 神邓艾（三国杀OL 2023-07-07 新品，4 体力，称号「带砺山河」）官方三技【拓域】【险进】【奇径】，
//      本包只实装前两技（【奇径】为觉醒技：减体力上限 + 移动座次 + 额外回合 + 获得「摧心」，暂不实现）。
//   3. 神黄月英（2026 珍藏版 LE038，3 体力，称号「卧龙的点睛人」）官方三技【藏巧】【神械】【化朽】，
//      本包只实装前两技并做简化（详见 skills/shenwu2.js）。
//   4. 神许褚【裸衣】沿用标准包口径；【神威】**自拟**。神夏侯渊【神速】为官方技（改为准备阶段结算）；
//      【千里】**自拟**。神孙尚香【结姻】【枭姬】、神貂蝉【离间】【闭月】、神张春华【绝情】【伤逝】
//      均沿用官方两技口径，仅在数值/附加收益上做神格化微调（desc 已如实写明）。
//   5. 体力值：4 / 4 / 4 / 3 / 3 / 3 / 4 / 3；神将势力统一为 'shen'。
export const SHENWU2_GENERALS = [
  // 神张飞：神 4 体力；技能 神裁 / 巡使
  { id: 'shenwu2_zhangfei', name: '神张飞', kingdom: 'shen', hp: 4, pack: 'shenwu', skills: ['sw2_shencai', 'sw2_xunshi'] },
  // 神邓艾：神 4 体力；技能 拓域 / 险进
  { id: 'shenwu2_dengai', name: '神邓艾', kingdom: 'shen', hp: 4, pack: 'shenwu', skills: ['sw2_tuoyu', 'sw2_xianjin'] },
  // 神许褚：神 4 体力；技能 裸衣 / 神威（神威自拟）
  { id: 'shenwu2_xuchu', name: '神许褚', kingdom: 'shen', hp: 4, pack: 'shenwu', skills: ['sw2_luoyi', 'sw2_shenwei'] },
  // 神孙尚香：神 3 体力 女；技能 结姻 / 枭姬
  { id: 'shenwu2_sunshangxiang', name: '神孙尚香', kingdom: 'shen', hp: 3, gender: 'female', pack: 'shenwu', skills: ['sw2_jieyin', 'sw2_xiaoji'] },
  // 神貂蝉：神 3 体力 女；技能 离间 / 闭月
  { id: 'shenwu2_diaochan', name: '神貂蝉', kingdom: 'shen', hp: 3, gender: 'female', pack: 'shenwu', skills: ['sw2_lijian', 'sw2_biyue'] },
  // 神张春华：神 3 体力 女；技能 绝情 / 伤逝
  { id: 'shenwu2_zhangchunhua', name: '神张春华', kingdom: 'shen', hp: 3, gender: 'female', pack: 'shenwu', skills: ['sw2_jueqing', 'sw2_shangshi'] },
  // 神夏侯渊：神 4 体力；技能 神速 / 千里（千里自拟）
  { id: 'shenwu2_xiahouyuan', name: '神夏侯渊', kingdom: 'shen', hp: 4, pack: 'shenwu', skills: ['sw2_shensu', 'sw2_qianli'] },
  // 神黄月英：神 3 体力 女；技能 藏巧 / 神械
  { id: 'shenwu2_huangyueying', name: '神黄月英', kingdom: 'shen', hp: 3, gender: 'female', pack: 'shenwu', skills: ['sw2_cangqiao', 'sw2_shenxie'] },
];
