// 玩家自定义武将（pack: 'custom'）
// 说明：这些武将来自玩家手写设计稿，技能实现见 src/skills/custom.js。
// 玩家确认口径（2026-10-25）：
//   · 极·庞统、神黄盖 初始体力均为 2
//   · 天工·诸葛亮 蜀势力、3 体力；「天机」「谋」按两张常驻特殊牌实现
//   · 弩炮**不再常驻军争牌堆**，仅当场上有天工·诸葛亮时由【巧工】加入牌堆
export const CUSTOM_GENERALS = [
  // 极·庞统：谋略值体系（谋渊 收谋略值、持恒 耗谋略值复活）
  { id: 'custom_pangtong', name: '极·庞统', kingdom: 'shu', hp: 2, pack: 'custom', skills: ['mouyuan', 'chiheng'] },

  // 神黄盖：护甲体系（护甲上限 10）+ 九条技能
  // 技能名为主控暂定（玩家原稿只编号），可随时改名
  { id: 'custom_huanggai', name: '神黄盖', kingdom: 'shen', hp: 2, pack: 'custom',
    skills: ['shejia', 'fenshen', 'sancai', 'fuyan', 'qijia', 'xujia', 'tiebi', 'zhujia', 'kuijia'] },

  // 天工·诸葛亮：工标记 + 天机/谋 双特殊牌 + 巧装备体系
  { id: 'custom_zhugeliang', name: '天工·诸葛亮', kingdom: 'shu', hp: 3, pack: 'custom',
    skills: ['qiaogong', 'tianji', 'dengfeng', 'zaoji', 'lianji'] },
];
