// 江山如故·承（pack = 'jsg_cheng'）：17 名武将（线下原创扩「江山如故」承包，2023 原版口径）
// 技能实现见 src/skills/jsg_cheng.js（id 前缀 jc_）；与现有武将同名者统一加「承·」前缀。
// 可复用的既有技能：张辽【整兵/突围】= 闪张辽 zhengbing/tuwei；麴义【伏骑/骄恣】= fuqi/jiaozi；
//                   关羽【马术】= mashu；梦孙策【制衡】= zhiheng；张郃【穷途】= qiongtu。
export const JSG_CHENG_GENERALS = [
  { id: 'jc_mengsunce', name: '承·梦孙策', kingdom: 'wu', hp: 4, pack: 'jsg_cheng', title: '问鼎的霸王', skills: ['jc_duxing', 'jc_yiheng', 'jc_zhasi', 'jc_bashi'] },
  { id: 'jc_xugong', name: '承·许贡', kingdom: 'wu', hp: 3, pack: 'jsg_cheng', title: '独计击流', skills: ['jc_biaozhao', 'jc_yechou'] },
  { id: 'jc_chendeng', name: '承·陈登', kingdom: 'qun', hp: 3, pack: 'jsg_cheng', title: '惊涛弄潮', skills: ['jc_lunshi', 'jc_gueitu'] },
  { id: 'jc_guanyu', name: '承·关羽', kingdom: 'shu', hp: 5, pack: 'jsg_cheng', title: '羊左之义', skills: ['jc_guanjue', 'jc_nianen', 'mashu'] },
  { id: 'jc_zoushi', name: '承·邹氏', kingdom: 'qun', hp: 3, gender: 'female', pack: 'jsg_cheng', title: '淯水香魂', skills: ['jc_guyin', 'jc_zhangdeng'] },
  { id: 'jc_lvbu', name: '承·吕布', kingdom: 'qun', kingdom2: 'shu', hp: 5, pack: 'jsg_cheng', title: '虎视中原', skills: ['jc_wuchang', 'jc_qingjiao', 'jc_chengxu'] },
  { id: 'jc_yanfuren', name: '承·严夫人', kingdom: 'qun', hp: 3, gender: 'female', pack: 'jsg_cheng', title: '霜天薄裳', skills: ['jc_channe', 'jc_nifu'] },
  { id: 'jc_taoqian', name: '承·陶谦', kingdom: 'qun', hp: 3, pack: 'jsg_cheng', title: '膺秉温仁', skills: ['jc_zhaohuo', 'jc_yixiang', 'jc_yirang'] },
  { id: 'jc_caosong', name: '承·曹嵩', kingdom: 'wei', hp: 4, pack: 'jsg_cheng', title: '依权弼子', skills: ['jc_lilu', 'jc_yizheng2'] },
  { id: 'jc_xuyou', name: '承·许攸', kingdom: 'qun', kingdom2: 'wei', hp: 3, pack: 'jsg_cheng', title: '毕方矫翼', skills: ['jc_lipan', 'jc_qingxi', 'jc_jinmie'] },
  { id: 'jc_zhanghe', name: '承·张郃', kingdom: 'wei', kingdom2: 'qun', hp: 4, pack: 'jsg_cheng', title: '微子去殷', skills: ['qiongtu', 'jc_xianzhu'] },
  { id: 'jc_zhangliao', name: '承·张辽', kingdom: 'qun', kingdom2: 'wei', hp: 4, pack: 'jsg_cheng', title: '利刃风骑', skills: ['zhengbing', 'tuwei'] },
  { id: 'jc_chunyuqiong', name: '承·淳于琼', kingdom: 'qun', hp: 4, pack: 'jsg_cheng', title: '乌巢酒仙', skills: ['jc_cangchu', 'jc_shishou'] },
  { id: 'jc_gaolan', name: '承·高览', kingdom: 'qun', hp: 4, pack: 'jsg_cheng', title: '绝击坚营', skills: ['jc_jungong', 'jc_dengli'] },
  { id: 'jc_quyi', name: '承·麴义', kingdom: 'qun', hp: 4, pack: 'jsg_cheng', title: '名门的骁将', skills: ['fuqi', 'jiaozi'] },
  { id: 'jc_yuantan', name: '承·袁谭&袁尚', kingdom: 'qun', hp: 4, pack: 'jsg_cheng', title: '操戈同室', skills: ['jc_neifa'] },
  { id: 'jc_zhenmi', name: '承·甄宓', kingdom: 'qun', hp: 3, gender: 'female', pack: 'jsg_cheng', title: '一顾倾国', skills: ['jc_jixiang', 'jc_chengxian'] },
];
