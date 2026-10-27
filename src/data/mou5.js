// 阶段 6B · 谋·增补 6 将（pack = 'mou'，PACK_CN = '谋·增补'）
// 谋司马懿 / 谋夏侯惇 / 谋徐盛 / 谋甘宁 / 谋张角 / 谋董卓
//
// 资料说明（「未核实 / 简化」清单，详细口径见 src/skills/mou5.js 文件头）：
//   1. 谋司马懿：十周年「谋定天下」（魏 3 体力）【权谋】【平辽】，阳/阴完整实现；
//      【平辽】的「不公开指定目标」因引擎无隐藏目标机制不实现，其余按官方收窄。
//   2. 谋夏侯惇：移动版谋攻篇（魏 4 体力）【刚烈】改为主动技、每局每名角色限一次；【清俭】按引擎时序收窄。
//   3. 谋徐盛：移动版谋徐盛（吴 4 体力）【破军】【疑城】。注：部分攻略站把谋徐盛写成群势力，本包按
//      武将本家势力取「吴」，如需改群请主控统一调整。
//   4. 谋甘宁：官网 sanguosha.cn hero-detail-513（吴 4 体力）【奇袭】【奋威（限定技）】。
//   5. 谋张角：移动版谋攻篇-知（群 3 体力）【雷击】【鬼道】，「道兵」标记用 flags.m5Db 复现。
//   6. 谋董卓：三国杀OL 谋董卓（技能 观变/凶逆/封赏/执柄），本包只实装【凶逆】【封赏】。
//      体力值 8 沿用标准董卓，**官方谋董卓体力未核实**。
export const MOU5_GENERALS = [
  // 谋司马懿：魏 3 体力；技能 权谋 / 平辽
  { id: 'mou5_simayi', name: '谋司马懿', kingdom: 'wei', hp: 3, pack: 'mou', skills: ['m5_quanmou', 'm5_pingliao'] },
  // 谋夏侯惇：魏 4 体力；技能 刚烈 / 清俭
  { id: 'mou5_xiahoudun', name: '谋夏侯惇', kingdom: 'wei', hp: 4, pack: 'mou', skills: ['m5_ganglie', 'm5_qingjian'] },
  // 谋徐盛：吴 4 体力；技能 破军 / 疑城
  { id: 'mou5_xusheng', name: '谋徐盛', kingdom: 'wu', hp: 4, pack: 'mou', skills: ['m5_pojun', 'm5_yicheng'] },
  // 谋甘宁：吴 4 体力；技能 奇袭 / 奋威（限定技）
  { id: 'mou5_ganning', name: '谋甘宁', kingdom: 'wu', hp: 4, pack: 'mou', skills: ['m5_qixi', 'm5_fenwei'] },
  // 谋张角：群 3 体力；技能 雷击 / 鬼道
  { id: 'mou5_zhangjiao', name: '谋张角', kingdom: 'qun', hp: 3, pack: 'mou', skills: ['m5_leiji', 'm5_guidao'] },
  // 谋董卓：群 8 体力；技能 凶逆 / 封赏
  { id: 'mou5_dongzhuo', name: '谋董卓', kingdom: 'qun', hp: 8, pack: 'mou', skills: ['m5_xiongni', 'm5_fengshang'] },
];
