// 门阀士族（clan）批次：族王凌 / 族王浑 / 族荀淑 / 族荀粲 / 族荀彧 / 族荀谌 / 谋荀彧
// clan：宗族标签（'wang' 太原王氏 / 'xun' 颍川荀氏），引擎用 g.sameClan() 判定同族
export const CLAN_GENERALS = [
  // 太原·王氏
  { id: 'clan_wangling', name: '族王凌', kingdom: 'wei', hp: 4, pack: 'clan', clan: 'wang', skills: ['bolong', 'zhongliu'] },
  // 族王浑：官方势力为「晋」，引擎暂无晋势力，暂以 wei 表示（王浑为魏晋名臣）
  { id: 'clan_wanghun', name: '族王浑', kingdom: 'wei', hp: 3, pack: 'clan', clan: 'wang', skills: ['fuxun', 'chenya', 'zhongliu'] },

  // 颍川·荀氏
  { id: 'clan_xunshu', name: '族荀淑', kingdom: 'qun', hp: 3, pack: 'clan', clan: 'xun', skills: ['shenjun', 'balong', 'daojie'] },
  { id: 'clan_xuncan', name: '族荀粲', kingdom: 'wei', hp: 3, pack: 'clan', clan: 'xun', skills: ['yunshen', 'shangshen', 'fenchai', 'daojie'] },
  { id: 'clan_xunyu', name: '族荀彧', kingdom: 'wei', hp: 3, pack: 'clan', clan: 'xun', skills: ['dingan', 'funing', 'daojie'] },
  { id: 'clan_xunchen', name: '族荀谌', kingdom: 'qun', hp: 3, pack: 'clan', clan: 'xun', skills: ['sankuang', 'beishi', 'daojie'] },
  // 谋荀彧（十周年·谋定天下版本，2025-05-01 上线，技能【弼佐】【势谋】）
  // 2026-10-26 修正：官方扩展包字段是「谋定天下」，且无「族」前缀与宗族技，此前误挂在本包 → 归入 mouding
  { id: 'clan_mouxunyu', name: '谋荀彧', kingdom: 'wei', hp: 3, pack: 'mouding', skills: ['bizuo', 'shimou'] },
];
