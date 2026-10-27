// 手杀「兵势篇·势」10 将数据（阶段 5E 批次）
// 技能文本与出处见 src/skills/shi.js 文件头注释。
// 体力/势力核到官方：势魏延(蜀4)、势陈到(蜀4)、势陆郁生(吴3女)、势黄祖(群4)、势张任(群4)、
//   势孙綝(吴4)、势曹爽(魏4)、势陈群(魏3)、势程普(吴4)、势周瑜(吴4)。
// 【资料未核实】势曹爽的定稿技能组未能核到，取其爆料版【擅政】【典易】【渐专】实现。
export const SHI_GENERALS = [
  // 兵势篇·势包
  { id: 'shi_weiyan', name: '势魏延', kingdom: 'shu', hp: 4, pack: 'shi', skills: ['zhuangshi', 'yinzhan', 'zhongao'] },
  { id: 'shi_chendao', name: '势陈到', kingdom: 'shu', hp: 4, pack: 'shi', skills: ['wanglie2', 'hongyi'] },
  { id: 'shi_luyusheng', name: '势陆郁生', kingdom: 'wu', hp: 3, gender: 'female', pack: 'shi', skills: ['runwei', 'shuanghuai'] },
  { id: 'shi_huangzu', name: '势黄祖', kingdom: 'qun', hp: 4, pack: 'shi', skills: ['chizhang', 'duanyang'] },
  // 兵势篇·奇包
  { id: 'shi_zhangren', name: '势张任', kingdom: 'qun', hp: 4, pack: 'shi', skills: ['fuan', 'yinxian'] },
  { id: 'shi_sunchen', name: '势孙綝', kingdom: 'wu', hp: 4, pack: 'shi', skills: ['nigu', 'lulian'] },
  { id: 'shi_caoshuang', name: '势曹爽', kingdom: 'wei', hp: 4, pack: 'shi', skills: ['shanzheng', 'dianyi', 'jianzhuan2'] },
  // 兵势篇·正包
  { id: 'shi_chenqun', name: '势陈群', kingdom: 'wei', hp: 3, pack: 'shi', skills: ['dingpin2', 'faen2'] },
  { id: 'shi_chengpu', name: '势程普', kingdom: 'wu', hp: 4, pack: 'shi', skills: ['duzuo', 'bihan'] },
  { id: 'shi_zhouyu', name: '势周瑜', kingdom: 'wu', hp: 4, pack: 'shi', skills: ['chiyun', 'yanhui', 'fentao', 'xiongzi'] },
];
