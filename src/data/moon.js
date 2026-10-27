// 「月」自定义包（pack: 'moon'，PACK_CN = '月'）
// 来源：玩家手写设计稿（2026-10-25 补充上传）：月·黄忠 / 月·黄盖 / 月·关羽。
// 月系列通用规则（见 docs 与 engine/moon.js）：
//   ★卡面口径（玩家 2026-10-25 澄清）：画成圆形的勾玉个数 = 该武将「体力值」（hp），
//     与月标记无关；月标记上限取自卡面右侧的文字标注「☽ x」（数据字段 moonMax）。
//     例：月·黄忠 4 血 / ☽7，月·黄盖 4 血 / ☽6，月·关羽 5 血 / ☽6，嫦娥 7 血 / ☽10。
//   初辉技：☽ 不满时，可以于出牌阶段使用，发动后耗尽 ☽。
//   满辉技：☽ 集满（达到上限）时立即使用，耗尽 ☽。
//   祈月：于下一次获得 ☽ 前可用（一次性窗口）。
// 另：嫦娥（天國）、哥伦比亚·希珀塞莱尼娅同属月系列，数据在 data/myth.js。
export const MOON_GENERALS = [
  // 月·黄忠：使用牌积累 ☽ 并记录花色；满辉时按记录花色数造成伤害
  { id: 'moon_huangzhong', name: '月·黄忠', kingdom: 'shu', hp: 4, pack: 'moon', moonMax: 7,
    skills: ['moon_zhuyue', 'moon_tianzhu'] },

  // 月·黄盖：苦肉积累 ☽；初辉【诈降】把 ☽ 换成牌堆底的【杀】；满辉【忠心】
  { id: 'moon_huanggai', name: '月·黄盖', kingdom: 'wu', hp: 4, pack: 'moon', moonMax: 6,
    skills: ['moon_kurou', 'moon_zhaxiang', 'moon_zhongxin'] },

  // 月·关羽：使用牌指定他人积累 ☽；满辉【武圣】摸基本牌 + 额外回合内无限杀
  { id: 'moon_guanyu', name: '月·关羽', kingdom: 'shu', hp: 5, pack: 'moon', moonMax: 6,
    skills: ['moon_wuhun', 'moon_wusheng'] },
];
