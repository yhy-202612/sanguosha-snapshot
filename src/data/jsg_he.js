// 江山如故·合（pack = 'jsg_he'）：17 名武将（线下原创扩「江山如故」合包，2024 原版口径）
// 技能实现见 src/skills/jsg_he.js（id 前缀 jh_）；本包引入「蓄谋」机制
export const JSG_HE_GENERALS = [
  { id: 'jh_mengzhugeliang', name: '合·梦诸葛亮', kingdom: 'shu', hp: 3, pack: 'jsg_he', title: '炎汉忠魂', skills: ['jh_wentian', 'jh_chushi', 'jh_yinlue'] },
  { id: 'jh_jiangwei', name: '合·姜维', kingdom: 'shu', kingdom2: 'wei', hp: 4, pack: 'jsg_he', title: '赤血化龙', skills: ['jh_jinfa', 'jh_fumou', 'jh_xuanfeng'] },
  { id: 'jh_zhaoyun', name: '合·赵云', kingdom: 'shu', hp: 4, pack: 'jsg_he', title: '北伐之柱', skills: ['jh_longlin', 'jh_zhendan'] },
  { id: 'jh_liuyong', name: '合·刘永', kingdom: 'shu', hp: 3, pack: 'jsg_he', title: '甘陵王', skills: ['jh_danxin', 'jh_fengxiang'] },
  { id: 'jh_gaoxiang', name: '合·高翔', kingdom: 'shu', hp: 4, pack: 'jsg_he', title: '玄乡侯', skills: ['jh_chiying'] },
  { id: 'jh_caofang', name: '合·曹芳', kingdom: 'wei', hp: 3, maxHp: 4, pack: 'jsg_he', title: '引狼入庙', skills: ['jh_zhaotu', 'jh_jingju', 'jh_weizhui'] },
  { id: 'jh_guoxun', name: '合·郭循', kingdom: 'wei', hp: 4, pack: 'jsg_he', title: '秉心不回', skills: ['jh_eqian', 'jh_fusha'] },
  { id: 'jh_simayi', name: '合·司马懿', kingdom: 'wei', hp: 4, pack: 'jsg_he', title: '危崖隐羽', skills: ['jh_yingshi', 'jh_tuigu'] },
  { id: 'jh_guozhao', name: '合·郭照', kingdom: 'wei', hp: 3, gender: 'female', pack: 'jsg_he', title: '碧海青天', skills: ['jh_pianchong', 'jh_zunwei'] },
  { id: 'jh_wenqin', name: '合·文钦', kingdom: 'wei', hp: 4, pack: 'jsg_he', title: '困兽鸱张', skills: ['jh_guangao', 'jh_huiqi', 'jh_xieju'] },
  { id: 'jh_caoshuang', name: '合·曹爽', kingdom: 'wei', hp: 4, pack: 'jsg_he', title: '骄奢跋扈', skills: ['jh_shanzhuan', 'jh_tuogu'] },
  { id: 'jh_chentai', name: '合·陈泰', kingdom: 'wei', hp: 4, pack: 'jsg_he', title: '岳峙渊渟', skills: ['jh_jiuxian', 'jh_chenyong'] },
  { id: 'jh_sunjun', name: '合·孙峻', kingdom: 'wu', hp: 4, pack: 'jsg_he', title: '朋党执虎', skills: ['jh_yaoyan', 'jh_bazheng'] },
  { id: 'jh_luxun', name: '合·陆逊', kingdom: 'wu', hp: 3, pack: 'jsg_he', title: '却敌安疆', skills: ['jh_youjin', 'jh_dailao', 'jh_zhubei'] },
  { id: 'jh_sunluban', name: '合·孙鲁班&孙鲁育', kingdom: 'wu', hp: 3, gender: 'female', pack: 'jsg_he', title: '恶紫夺朱', skills: ['jh_daimou', 'jh_fangjie'] },
  { id: 'jh_zhangxuan', name: '合·张嫙', kingdom: 'wu', hp: 4, gender: 'female', pack: 'jsg_he', title: '玉宇嫁蔷', skills: ['jh_tongli', 'jh_shezang'] },
  { id: 'jh_weiwen', name: '合·卫温&诸葛直', kingdom: 'wu', hp: 4, pack: 'jsg_he', title: '帆至夷州', skills: ['jh_fuhai'] },
];
