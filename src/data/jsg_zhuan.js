// 江山如故·转（pack = 'jsg_zhuan'）：17 名武将（线下原创扩「江山如故」转包，2023 原版口径）
// 技能实现见 src/skills/jsg_zhuan.js（id 前缀 jz_）；本包引入【影】机制（黑桃 A 的基本牌，不可使用，入弃牌堆即销毁）
export const JSG_ZHUAN_GENERALS = [
  { id: 'jz_mengguojia', name: '转·梦郭嘉', kingdom: 'wei', hp: 3, pack: 'jsg_zhuan', title: '赤壁的先知', skills: ['jz_qingzi', 'jz_dingce', 'jz_zhenfeng'] },
  { id: 'jz_zhangfei', name: '转·张飞', kingdom: 'shu', hp: 5, pack: 'jsg_zhuan', title: '长坂之威', skills: ['jz_baohe', 'jz_xushi'] },
  { id: 'jz_sunshangxiang', name: '转·孙尚香', kingdom: 'wu', hp: 3, gender: 'female', pack: 'jsg_zhuan', title: '情断吴江', skills: ['jz_guiji', 'jz_jiaohao'] },
  { id: 'jz_zhangren', name: '转·张任', kingdom: 'qun', hp: 4, pack: 'jsg_zhuan', title: '索命神射', skills: ['jz_funi', 'jz_chuanxin'] },
  { id: 'jz_lougu', name: '转·娄圭', kingdom: 'wei', hp: 3, pack: 'jsg_zhuan', title: '梦梅居士', skills: ['jz_shacheng', 'jz_ninghan'] },
  { id: 'jz_huangzhong', name: '转·黄忠', kingdom: 'shu', hp: 4, pack: 'jsg_zhuan', title: '定军之英', skills: ['jz_cuifeng', 'jz_dengnan'] },
  { id: 'jz_xiahourong', name: '转·夏侯荣', kingdom: 'wei', hp: 4, pack: 'jsg_zhuan', title: '擐甲执兵', skills: ['jz_fenjian'] },
  { id: 'jz_pangtong', name: '转·庞统', kingdom: 'qun', hp: 3, pack: 'jsg_zhuan', title: '荆楚之高俊', skills: ['jz_manjuan', 'jz_yangming'] },
  { id: 'jz_caimao', name: '转·蔡瑁&张允', kingdom: 'wei', hp: 4, pack: 'jsg_zhuan', title: '乘雷潜狡', skills: ['jz_lianzhou', 'jz_jinglan'] },
  { id: 'jz_jianggan', name: '转·蒋干', kingdom: 'wei', hp: 3, pack: 'jsg_zhuan', title: '锋镝悬信', skills: ['jz_weicheng', 'jz_daoshu'] },
  { id: 'jz_huangchengyan', name: '转·黄承彦', kingdom: 'qun', hp: 3, pack: 'jsg_zhuan', title: '沔阳雅士', skills: ['jz_guanxu', 'jz_yashi'] },
  { id: 'jz_kanze', name: '转·阚泽', kingdom: 'wu', hp: 3, pack: 'jsg_zhuan', title: '慧眼的博士', skills: ['jz_xiashu', 'jz_kuanshi'] },
  { id: 'jz_machao', name: '转·马超', kingdom: 'qun', hp: 4, pack: 'jsg_zhuan', title: '潼关之勇', skills: ['jz_zhuiming', 'mashu'] },
  { id: 'jz_hansui', name: '转·韩遂', kingdom: 'qun', hp: 4, pack: 'jsg_zhuan', title: '雄踞北疆', skills: ['jz_niluan', 'jz_huchou', 'jz_jiemeng'] },
  { id: 'jz_zhangchu', name: '转·张楚', kingdom: 'qun', hp: 3, pack: 'jsg_zhuan', title: '大贤后裔', skills: ['jz_huozhong', 'jz_rihui'] },
  { id: 'jz_fanjiang', name: '转·范疆&张达', kingdom: 'wu', hp: 5, pack: 'jsg_zhuan', title: '你死我亡', skills: ['jz_fushan'] },
  { id: 'jz_xiahouen', name: '转·夏侯恩', kingdom: 'wei', hp: 4, pack: 'jsg_zhuan', title: '背剑之将', skills: ['jz_hujian', 'jz_shili'] },
];
