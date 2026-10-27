// 稀有·专属（pack = 'rare2'）：移动版/海外服「稀有专属」20 名武将
// 技能实现见 src/skills/rare2.js（id 前缀 rx_）
// 注：与既有 pack 'rare'（「稀有·传说」）为不同扩展包，勿混用
export const RARE2_GENERALS = [
  // 魏
  { id: 'rx_simazhao', name: '稀有·司马昭', kingdom: 'wei', hp: 3, pack: 'rare2', title: '四海威服', skills: ['rx_daigong', 'rx_zhaoxin'] },
  { id: 'rx_wangyuanji', name: '稀有·王元姬', kingdom: 'wei', hp: 3, gender: 'female', pack: 'rare2', title: '清雅抑华', skills: ['rx_qianchong', 'rx_shangjian'] },
  { id: 'rx_zhuling', name: '稀有·朱灵', kingdom: 'wei', hp: 4, pack: 'rare2', title: '良将之亚', skills: ['rx_zhanyi'] },
  { id: 'rx_caochun', name: '稀有·曹纯', kingdom: 'wei', hp: 4, pack: 'rare2', title: '虎豹骑首', skills: ['rx_shanjia'] },
  { id: 'rx_liuye', name: '稀有·刘晔', kingdom: 'wei', hp: 3, pack: 'rare2', title: '佐世之才', skills: ['rx_polu', 'rx_choulve'] },
  { id: 'rx_majun', name: '稀有·马钧', kingdom: 'wei', hp: 3, pack: 'rare2', title: '没渊瑰璞', skills: ['rx_jingxie', 'rx_qiaosi'] },
  { id: 'rx_zhouxingbuyi', name: '稀有·星周不疑', kingdom: 'wei', hp: 3, pack: 'rare2', title: '稚雀清声', skills: ['rx_huiyao', 'rx_quesong'] },
  { id: 'rx_simashi', name: '稀有·司马师', kingdom: 'wei', hp: 4, pack: 'rare2', title: '摧坚荡异', skills: ['rx_baiyi', 'rx_jinglve', 'rx_shanli'] },
  { id: 'rx_yanghuiyu', name: '稀有·羊徽瑜', kingdom: 'wei', hp: 3, gender: 'female', pack: 'rare2', title: '温慧母仪', skills: ['rx_hongyi', 'rx_quanfeng'] },
  // 蜀
  { id: 'rx_lifeng', name: '稀有·李丰', kingdom: 'shu', hp: 3, pack: 'rare2', title: '继父尽事', skills: ['rx_tunchu', 'rx_shuliang'] },
  { id: 'rx_zhugeguo', name: '稀有·诸葛果', kingdom: 'shu', hp: 3, gender: 'female', pack: 'rare2', title: '凤阁乘烟', skills: ['rx_qirang', 'rx_yuhua'] },
  { id: 'rx_zhaotong', name: '稀有·赵统&赵广', kingdom: 'shu', hp: 4, pack: 'rare2', title: '身继龙魂', skills: ['rx_yizan', 'rx_longyuan'] },
  { id: 'rx_hujinding', name: '稀有·胡金定', kingdom: 'shu', hp: 3, gender: 'female', pack: 'rare2', title: '怀子求怜', skills: ['rx_renshi', 'rx_wuyuan', 'rx_huaizi'] },
  // 吴
  { id: 'rx_sunru', name: '稀有·孙茹', kingdom: 'wu', hp: 3, gender: 'female', pack: 'rare2', title: '出水青莲', skills: ['rx_yingjian', 'rx_shixin'] },
  { id: 'rx_lingcao', name: '稀有·凌操', kingdom: 'wu', hp: 4, pack: 'rare2', title: '激流勇进', skills: ['rx_dujin'] },
  { id: 'rx_liuzan', name: '稀有·留赞', kingdom: 'wu', hp: 4, pack: 'rare2', title: '啸天亢声', skills: ['rx_fenyin'] },
  { id: 'rx_sunhanhua', name: '稀有·孙寒华', kingdom: 'wu', hp: 3, gender: 'female', pack: 'rare2', title: '挣绽的青莲', skills: ['rx_chongxu', 'rx_miaojian', 'rx_lianhua'] },
  { id: 'rx_zhangfen', name: '稀有·张奋', kingdom: 'wu', hp: 4, pack: 'rare2', title: '究械菁杰', skills: ['rx_quchong', 'rx_xunjie'] },
  // 群
  { id: 'rx_nanhua', name: '稀有·南华老仙', kingdom: 'qun', hp: 3, pack: 'rare2', title: '冯虚御风', skills: ['rx_yufeng', 'rx_tianshu'] },
  { id: 'rx_yangbiao', name: '稀有·杨彪', kingdom: 'qun', hp: 3, pack: 'rare2', title: '德彰海内', skills: ['rx_zhaohan', 'rx_rangjie', 'rx_yizheng'] },
];
