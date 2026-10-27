// 手杀「老友季·友」5 将数据（阶段 5E 批次）
// 官方设定：友系列原型处于魏蜀吴未立时期，故统一为「群」势力。
// 体力核到官方（均为 3 体力）：友诸葛亮 / 友徐庶 / 友庞统 / 友石韬 / 友崔钧。
// 技能文本与出处见 src/skills/you.js 文件头注释。
export const YOU_GENERALS = [
  // 老友季·友（水镜三徒 + 诸葛四友）
  { id: 'you_zhugeliang', name: '友诸葛亮', kingdom: 'qun', hp: 3, pack: 'you', skills: ['yance', 'fangqiu', 'gongli_zhuge'] },
  { id: 'you_xushu', name: '友徐庶', kingdom: 'qun', hp: 3, pack: 'you', skills: ['xiaxing', 'qihui', 'gongli_xushu'] },
  { id: 'you_pangtong', name: '友庞统', kingdom: 'qun', hp: 3, pack: 'you', skills: ['manjuan', 'yangming', 'gongli_pangtong'] },
  { id: 'you_shitao', name: '友石韬', kingdom: 'qun', hp: 3, pack: 'you', skills: ['qinying', 'lunxiong', 'gongli_shitao'] },
  { id: 'you_cuijun', name: '友崔钧', kingdom: 'qun', hp: 3, pack: 'you', skills: ['shunyi', 'biwei', 'gongli_cuijun'] },
];
