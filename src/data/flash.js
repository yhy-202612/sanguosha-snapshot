// OL「闪」系列（4 将；闪张郃 待技能资料核实后补入）
export const FLASH_GENERALS = [
  { id: 'flash_zhaoyun', name: '闪赵云', kingdom: 'shu', hp: 4, pack: 'flash', skills: ['longlin', 'zhendan'] },
  { id: 'flash_sunjian', name: '闪孙坚', kingdom: 'qun', hp: 4, pack: 'flash', skills: ['pingtao', 'juelie'] },
  { id: 'flash_liuhong', name: '闪刘宏', kingdom: 'qun', hp: 4, pack: 'flash', skills: ['chaozheng', 'shenchong', 'julian'] },
  // 闪张辽：魏 / 群 双势力（开局为群，可经【整兵】转为魏）
  { id: 'flash_zhangliao', name: '闪张辽', kingdom: 'qun', kingdom2: 'wei', hp: 4, pack: 'flash', skills: ['zhengbing', 'tuwei'] },
  // 闪张郃：群 / 魏 双势力
  { id: 'flash_zhanghe', name: '闪张郃', kingdom: 'qun', kingdom2: 'wei', hp: 4, pack: 'flash', skills: ['qiongtu', 'xianzhu'] },
  // 闪朱儁：群 4 体力（OL 2026-01-31 上线，江山如故·起 朱儁的 OL 移植版；技能见 skills/flash2.js）
  { id: 'flash_zhujun', name: '闪朱儁', kingdom: 'qun', hp: 4, pack: 'flash', skills: ['zhujun_fendi', 'zhujun_jujiang'] },
];
