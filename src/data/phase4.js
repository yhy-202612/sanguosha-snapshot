// 阶段 4 收尾批（4C + 4F）· 3 位机制武将（pack = 'phase4'）
//
// 官方出处与核实状态：
//   · 诸葛诞 —— 标准 / OL 诸葛诞（魏 · 4 · 功獒 / 举义 / 崩坏 / 威重）。资料已核实。
//       其中【崩坏】【威重】不是初始技能，只有【举义】觉醒后才获得（见 src/skills/phase4.js）。
//       clan: 'zhuge'（琅琊诸葛氏，与门阀士族包的宗族标签通用）。
//   · 左慈   —— 标准 / 神话再临 左慈（群 · 3 · 化身 / 新生）。武将资料已核实；
//       本批的【化身】为 M11「简化化身」口径（化身牌 = 武将 id，上限 4 张，开局 2 张，
//       出牌阶段限一次获得其中一个技能），与 shan.js 中旧左慈（skills 'huashen'/'xinsheng'）的实现不同，
//       故技能 id 用 'huashen2' / 'xinsheng2' 保证全局唯一。
//   · 魔周瑜 —— 吴 · 4 · 魔炎 / 焚天。技能原文**资料未核实**，按本批任务书给定的口径实现
//       （魔炎：弃 1 张红色手牌造成 1 点火焰伤害；焚天：限定技，全体其他角色各弃 1 张牌 + 额外回合）。
export const PHASE4_GENERALS = [
  // 诸葛诞 · 魏 · 4 体力 · 琅琊诸葛氏（初始只有功獒 / 举义，觉醒后获得崩坏 / 威重）
  { id: 'p4_zhugedan', name: '诸葛诞', kingdom: 'wei', hp: 4, pack: 'phase4', clan: 'zhuge',
    skills: ['gongao', 'juyi'] },

  // 左慈 · 群 · 3 体力 · M11 简化化身（化身牌 = 武将 id，存 p.marks.huashan）
  { id: 'p4_zuoci', name: '左慈', kingdom: 'qun', hp: 3, pack: 'phase4',
    skills: ['huashen2', 'xinsheng2'] },

  // 魔周瑜 · 吴 · 4 体力 · 魔炎 / 焚天（技能原文资料未核实，见文件头）
  { id: 'p4_mozhouyu', name: '魔周瑜', kingdom: 'wu', hp: 4, pack: 'phase4',
    skills: ['moyan', 'fentian'] },
];
