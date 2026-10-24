// 武将数据。pack: standard | jie(界限突破) | mou(谋) | shen(神) | ji(极)
// skills 为技能 id，必须在 src/skills/ 中注册。
export const GENERALS = [
  // ================= 标准包 =================
  { id: 'caocao', name: '曹操', kingdom: 'wei', hp: 4, pack: 'standard', skills: ['jianxiong', 'hujia'], lord: 'hujia' },
  { id: 'simayi', name: '司马懿', kingdom: 'wei', hp: 3, pack: 'standard', skills: ['fankui', 'guicai'] },
  { id: 'xiahoudun', name: '夏侯惇', kingdom: 'wei', hp: 4, pack: 'standard', skills: ['ganglie'] },
  { id: 'zhangliao', name: '张辽', kingdom: 'wei', hp: 4, pack: 'standard', skills: ['tuxi'] },
  { id: 'xuchu', name: '许褚', kingdom: 'wei', hp: 4, pack: 'standard', skills: ['luoyi'] },
  { id: 'guojia', name: '郭嘉', kingdom: 'wei', hp: 3, pack: 'standard', skills: ['tiandu', 'yiji'] },
  { id: 'zhenji', name: '甄姬', kingdom: 'wei', hp: 3, pack: 'standard', skills: ['qingguo', 'luoshen'] },

  { id: 'liubei', name: '刘备', kingdom: 'shu', hp: 4, pack: 'standard', skills: ['rende', 'jijiang'], lord: 'jijiang' },
  { id: 'guanyu', name: '关羽', kingdom: 'shu', hp: 4, pack: 'standard', skills: ['wusheng'] },
  { id: 'zhangfei', name: '张飞', kingdom: 'shu', hp: 4, pack: 'standard', skills: ['paoxiao'] },
  { id: 'zhaoyun', name: '赵云', kingdom: 'shu', hp: 4, pack: 'standard', skills: ['longdan'] },
  { id: 'machao', name: '马超', kingdom: 'shu', hp: 4, pack: 'standard', skills: ['mashu', 'tieji'] },
  { id: 'zhugeliang', name: '诸葛亮', kingdom: 'shu', hp: 3, pack: 'standard', skills: ['guanxing', 'kongcheng'] },
  { id: 'huangyueying', name: '黄月英', kingdom: 'shu', hp: 3, pack: 'standard', skills: ['jizhi', 'qicai'] },

  { id: 'sunquan', name: '孙权', kingdom: 'wu', hp: 4, pack: 'standard', skills: ['zhiheng', 'jiuyuan'], lord: 'jiuyuan' },
  { id: 'ganning', name: '甘宁', kingdom: 'wu', hp: 4, pack: 'standard', skills: ['qixi'] },
  { id: 'lumeng', name: '吕蒙', kingdom: 'wu', hp: 4, pack: 'standard', skills: ['keji'] },
  { id: 'huanggai', name: '黄盖', kingdom: 'wu', hp: 4, pack: 'standard', skills: ['kurou'] },
  { id: 'zhouyu', name: '周瑜', kingdom: 'wu', hp: 3, pack: 'standard', skills: ['yingzi', 'fanjian'] },
  { id: 'daqiao', name: '大乔', kingdom: 'wu', hp: 3, pack: 'standard', skills: ['guose', 'liuli'] },
  { id: 'luxun', name: '陆逊', kingdom: 'wu', hp: 3, pack: 'standard', skills: ['qianxun', 'lianying'] },
  { id: 'sunshangxiang', name: '孙尚香', kingdom: 'wu', hp: 3, pack: 'standard', skills: ['jieyin', 'xiaoji'] },

  { id: 'huatuo', name: '华佗', kingdom: 'qun', hp: 3, pack: 'standard', skills: ['jijiu', 'qingnang'] },
  { id: 'lvbu', name: '吕布', kingdom: 'qun', hp: 4, pack: 'standard', skills: ['wushuang'] },
  { id: 'diaochan', name: '貂蝉', kingdom: 'qun', hp: 3, pack: 'standard', skills: ['lijian', 'biyue'] },

  // ================= 界限突破 =================
  { id: 'jie_caocao', name: '界曹操', kingdom: 'wei', hp: 4, pack: 'jie', skills: ['jie_jianxiong', 'hujia'], lord: 'hujia' },
  { id: 'jie_simayi', name: '界司马懿', kingdom: 'wei', hp: 3, pack: 'jie', skills: ['jie_fankui', 'guicai'] },
  { id: 'jie_xiahoudun', name: '界夏侯惇', kingdom: 'wei', hp: 4, pack: 'jie', skills: ['jie_ganglie'] },
  { id: 'jie_zhangliao', name: '界张辽', kingdom: 'wei', hp: 4, pack: 'jie', skills: ['jie_tuxi'] },
  { id: 'jie_xuchu', name: '界许褚', kingdom: 'wei', hp: 4, pack: 'jie', skills: ['jie_luoyi'] },
  { id: 'jie_guojia', name: '界郭嘉', kingdom: 'wei', hp: 3, pack: 'jie', skills: ['tiandu', 'jie_yiji'] },
  { id: 'jie_zhenji', name: '界甄姬', kingdom: 'wei', hp: 3, pack: 'jie', skills: ['qingguo', 'jie_luoshen'] },
  { id: 'jie_liubei', name: '界刘备', kingdom: 'shu', hp: 4, pack: 'jie', skills: ['jie_rende', 'jijiang'], lord: 'jijiang' },
  { id: 'jie_guanyu', name: '界关羽', kingdom: 'shu', hp: 4, pack: 'jie', skills: ['jie_wusheng'] },
  { id: 'jie_zhangfei', name: '界张飞', kingdom: 'shu', hp: 4, pack: 'jie', skills: ['jie_paoxiao'] },
  { id: 'jie_zhaoyun', name: '界赵云', kingdom: 'shu', hp: 4, pack: 'jie', skills: ['jie_longdan'] },
  { id: 'jie_machao', name: '界马超', kingdom: 'shu', hp: 4, pack: 'jie', skills: ['mashu', 'jie_tieji'] },
  { id: 'jie_zhugeliang', name: '界诸葛亮', kingdom: 'shu', hp: 3, pack: 'jie', skills: ['jie_guanxing', 'kongcheng'] },
  { id: 'jie_huangyueying', name: '界黄月英', kingdom: 'shu', hp: 3, pack: 'jie', skills: ['jie_jizhi', 'qicai'] },
  { id: 'jie_sunquan', name: '界孙权', kingdom: 'wu', hp: 4, pack: 'jie', skills: ['jie_zhiheng', 'jiuyuan'], lord: 'jiuyuan' },
  { id: 'jie_ganning', name: '界甘宁', kingdom: 'wu', hp: 4, pack: 'jie', skills: ['jie_qixi'] },
  { id: 'jie_lumeng', name: '界吕蒙', kingdom: 'wu', hp: 4, pack: 'jie', skills: ['jie_keji'] },
  { id: 'jie_huanggai', name: '界黄盖', kingdom: 'wu', hp: 4, pack: 'jie', skills: ['jie_kurou'] },
  { id: 'jie_zhouyu', name: '界周瑜', kingdom: 'wu', hp: 3, pack: 'jie', skills: ['yingzi', 'jie_fanjian'] },
  { id: 'jie_daqiao', name: '界大乔', kingdom: 'wu', hp: 3, pack: 'jie', skills: ['guose', 'jie_liuli'] },
  { id: 'jie_luxun', name: '界陆逊', kingdom: 'wu', hp: 3, pack: 'jie', skills: ['jie_qianxun', 'jie_lianying'] },
  { id: 'jie_sunshangxiang', name: '界孙尚香', kingdom: 'wu', hp: 3, pack: 'jie', skills: ['jie_jieyin', 'jie_xiaoji'] },
  { id: 'jie_huatuo', name: '界华佗', kingdom: 'qun', hp: 3, pack: 'jie', skills: ['jijiu', 'jie_qingnang'] },
  { id: 'jie_lvbu', name: '界吕布', kingdom: 'qun', hp: 4, pack: 'jie', skills: ['jie_wushuang'] },
  { id: 'jie_diaochan', name: '界貂蝉', kingdom: 'qun', hp: 3, pack: 'jie', skills: ['jie_lijian', 'biyue'] },

  // ================= 谋 =================
  { id: 'mou_caocao', name: '谋曹操', kingdom: 'wei', hp: 4, pack: 'mou', skills: ['mou_jianxiong', 'mou_hujia'], lord: 'mou_hujia' },
  { id: 'mou_diaochan', name: '谋貂蝉', kingdom: 'qun', hp: 3, pack: 'mou', skills: ['mou_lijian', 'biyue'] },
  { id: 'mou_huangzhong', name: '谋黄忠', kingdom: 'shu', hp: 4, pack: 'mou', skills: ['mou_liegong', 'mou_jiushi'] },
  { id: 'mou_zhangliao', name: '谋张辽', kingdom: 'wei', hp: 4, pack: 'mou', skills: ['mou_tuxi'] },
  { id: 'mou_xuchu', name: '谋许褚', kingdom: 'wei', hp: 4, pack: 'mou', skills: ['mou_luoyi'] },
  { id: 'mou_zhouyu', name: '谋周瑜', kingdom: 'wu', hp: 3, pack: 'mou', skills: ['mou_yingzi', 'mou_fanjian'] },
  { id: 'mou_zhugeliang', name: '谋诸葛亮', kingdom: 'shu', hp: 3, pack: 'mou', skills: ['mou_guanxing', 'kongcheng'] },
  { id: 'mou_zhangfei', name: '谋张飞', kingdom: 'shu', hp: 4, pack: 'mou', skills: ['mou_paoxiao'] },
  { id: 'mou_guanyu', name: '谋关羽', kingdom: 'shu', hp: 4, pack: 'mou', skills: ['mou_wusheng'] },
  { id: 'mou_sunquan', name: '谋孙权', kingdom: 'wu', hp: 4, pack: 'mou', skills: ['mou_zhiheng', 'jiuyuan'], lord: 'jiuyuan' },

  // ================= 神 =================
  { id: 'shen_guanyu', name: '神关羽', kingdom: 'shen', hp: 5, pack: 'shen', skills: ['wusheng', 'wuhun'] },
  { id: 'shen_zhugeliang', name: '神诸葛亮', kingdom: 'shen', hp: 3, pack: 'shen', skills: ['qixing', 'kuangfeng', 'dawu'] },
  { id: 'shen_lvbu', name: '神吕布', kingdom: 'shen', hp: 5, pack: 'shen', skills: ['wushuang', 'wumou', 'wqian'] },
  { id: 'shen_caocao', name: '神曹操', kingdom: 'shen', hp: 3, pack: 'shen', skills: ['guixin', 'hujia'], lord: 'hujia' },
  { id: 'shen_simayi', name: '神司马懿', kingdom: 'shen', hp: 3, pack: 'shen', skills: ['renjie', 'baiyin_skill'] },
  { id: 'shen_zhouyu', name: '神周瑜', kingdom: 'shen', hp: 3, pack: 'shen', skills: ['qinyin', 'yeyan'] },
  { id: 'shen_lvmeng', name: '神吕蒙', kingdom: 'shen', hp: 3, pack: 'shen', skills: ['shelie', 'gongxin'] },
  { id: 'shen_zhaoyun', name: '神赵云', kingdom: 'shen', hp: 2, pack: 'shen', skills: ['juejing', 'longhun'] },
  { id: 'shen_luxun', name: '神陆逊', kingdom: 'shen', hp: 3, pack: 'shen', skills: ['junlve', 'cuike'] },
  { id: 'shen_ganning', name: '神甘宁', kingdom: 'shen', hp: 4, pack: 'shen', skills: ['qixi', 'jieying'] },
  { id: 'shen_guojia', name: '神郭嘉', kingdom: 'shen', hp: 3, pack: 'shen', skills: ['tiandu', 'yiji', 'zuoding'] },
  { id: 'shen_sunquan', name: '神孙权', kingdom: 'shen', hp: 4, pack: 'shen', skills: ['zhiheng', 'jiuyuan'], lord: 'jiuyuan' },

  // ================= 极 =================
  { id: 'ji_guanyu', name: '极关羽', kingdom: 'shu', hp: 4, pack: 'ji', skills: ['wusheng', 'ji_weizhen'] },
  { id: 'ji_lvbu', name: '极吕布', kingdom: 'qun', hp: 4, pack: 'ji', skills: ['wushuang', 'ji_wushuang'] },
  { id: 'ji_caocao', name: '极曹操', kingdom: 'wei', hp: 4, pack: 'ji', skills: ['jianxiong', 'ji_haoling'], lord: 'hujia' },
  { id: 'ji_simayi', name: '极司马懿', kingdom: 'wei', hp: 3, pack: 'ji', skills: ['fankui', 'guicai', 'ji_guicai'] },
  { id: 'ji_zhouyu', name: '极周瑜', kingdom: 'wu', hp: 3, pack: 'ji', skills: ['yingzi', 'ji_fanjian'] },
];

export const PACK_CN = { standard: '标准', jie: '界限突破', mou: '谋', shen: '神', ji: '极' };
export const KINGDOM_CN = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', shen: '神' };

export function generalById(id) { return GENERALS.find(g => g.id === id) || null; }
export function generalsOfPack(pack) { return pack === 'all' ? GENERALS : GENERALS.filter(g => g.pack === pack); }
export function pickGenerals({ packs = ['standard'], count, rng, exclude = [] }) {
  const pool = GENERALS.filter(g => packs.includes(g.pack) && !exclude.includes(g.id));
  return rng.shuffle(pool).slice(0, count);
}
