// 阶段 5F · 手杀 SP + 界 精选（pack = 'sp4'，PACK_CN = '手杀 SP·精选'）
// SP 组：高翔 / 崔琰&毛玠 / 董白 / 程昱 / 兀突骨 / 灵雎 / 丁尚涴 / 钟繇
// 界组：界王基 / 界周妃
//
// 资料说明（「资料未核实」清单）：
//   1. 高翔【驰应】—— 手杀/十周年两版文本略有差异（原版「令其攻击范围内的其他角色各弃置一张牌」，
//      2024 版改为「其可以弃置其攻击范围内任意名其他角色各一张牌」）。本批按 2024 版（官网
//      x.sanguosha.com 高翔页面）实现，见 skills/sp4.js 文件头。
//   2. 崔琰&毛玠 手杀（移动版）2024 版【征辟】【奉迎】与 OL/国战版本差异较大，按移动版官网
//      sanguosha.cn hero-detail-668 文本实现；「征辟选择角色数 +1」的额度机制为自行复现口径。
//   3. 董白【黠慧】：官方第二段「不能使用、打出、弃置这些牌直到其体力值减少」需要全局拦截
//      用牌流程，引擎未开放该钩子，本批只实现「标记 + 体力值减少时标记消失」部分（desc 已如实收窄）。
//   4. 兀突骨【燃殇】【悍勇】：按手杀（移动版）版本文本实现（含「燃>2 减 2 点上限并摸两张牌」）。
//   5. 灵雎【焚心】：官方为「与角色交换身份牌」，引擎身份仅在 role 字段，按互换 role 实现。
//   6. 丁尚涴【抚悼】：官方第二段「拥有『决裂』的角色使用黑色牌指定你为目标后，其本回合不能
//      再使用牌」未实现（需全局封锁用牌），desc 已省略该句。
//   7. 钟繇【活墨】：官方为「当你需要（使用）基本牌时」的响应式转化，引擎无「需要使用」
//      通用钩子，本批收窄为「出牌阶段主动发动」，desc 已如实收窄。
//   8. 界王基【奇制】【进趋】：官方为「蓄力技」体系，引擎无原生蓄力点，本批用 p.marks.xuli
//      复现，并在技能对象上打 xuliTech:true 以便跨将识别。
//   9. 界周妃【良姻】③：「每轮结束时」——引擎**已有** round.end 事件（game.js 的 runTurn，
//      self = 本轮最后行动的角色）；本实现仍沿用历史写法（在下一次 round.begin 结算上一轮），
//      语义等价，可评估迁移到 round.end（SG027 R17 订正，原注释误称「引擎无 round.end」）。
//  10. 体力值：上述武将官方体力均可核（高翔4 / 崔琰&毛玠3 / 董白3 / 程昱3 / 兀突骨15 /
//      灵雎3 / 丁尚涴3 / 钟繇3 / 界王基3 / 界周妃3）。
export const SP4_GENERALS = [
  // ============ SP 组 ============
  // 高翔：蜀 4 体力；技能 驰应
  { id: 'sp4_gaoxiang', name: '高翔', kingdom: 'shu', hp: 4, pack: 'sp4', skills: ['sk4_chiying'] },
  // 崔琰&毛玠（双将）：魏 3 体力；技能 征辟 / 奉迎
  { id: 'cuiyan_maojie', name: '崔琰&毛玠', kingdom: 'wei', hp: 3, pack: 'sp4', skills: ['sk4_zhengbi', 'sk4_fengying'] },
  // 董白：群 3 体力 女；技能 连诛 / 黠慧
  { id: 'sp4_dongbai', name: '董白', kingdom: 'qun', hp: 3, gender: 'female', pack: 'sp4', skills: ['sk4_lianzhu', 'sk4_xiahui'] },
  // 程昱：魏 3 体力；技能 设伏 / 贲育
  { id: 'sp4_chengyu', name: '程昱', kingdom: 'wei', hp: 3, pack: 'sp4', skills: ['sk4_shefu', 'sk4_benyu'] },
  // 兀突骨：群 15 体力；技能 燃殇 / 悍勇
  { id: 'sp4_wutugu', name: '兀突骨', kingdom: 'qun', hp: 15, pack: 'sp4', skills: ['sk4_ranshang', 'sk4_hanyong'] },
  // 灵雎：群 3 体力 女；技能 竭缘 / 焚心
  { id: 'sp4_lingju', name: '灵雎', kingdom: 'qun', hp: 3, gender: 'female', pack: 'sp4', skills: ['sk4_jieyuan', 'sk4_fenxin'] },
  // 丁尚涴：魏 3 体力 女；技能 讽言 / 抚悼
  { id: 'sp4_dingshangwan', name: '丁尚涴', kingdom: 'wei', hp: 3, gender: 'female', pack: 'sp4', skills: ['sk4_fengyan', 'sk4_fudao'] },
  // 钟繇：魏 3 体力；技能 活墨 / 佐定
  { id: 'sp4_zhongyao', name: '钟繇', kingdom: 'wei', hp: 3, pack: 'sp4', skills: ['sk4_huomo', 'sk4_zuoding'] },

  // ============ 界 组 ============
  // 界王基：魏 3 体力；技能 奇制 / 进趋
  { id: 'jie_wangji', name: '界王基', kingdom: 'wei', hp: 3, pack: 'sp4', skills: ['sk4_qizhi', 'sk4_jinqu'] },
  // 界周妃：吴 3 体力 女；技能 良姻 / 箜声
  { id: 'jie_zhoufei', name: '界周妃', kingdom: 'wu', hp: 3, gender: 'female', pack: 'sp4', skills: ['sk4_liangyin', 'sk4_kongsheng'] },
];
