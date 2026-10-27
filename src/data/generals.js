// 武将数据。pack: standard | jie(界限突破) | mou(谋) | shen(神) | ji(极) | feng(神话再临·风)
// skills 为技能 id，必须在 src/skills/ 中注册。
import { LIN_GENERALS } from './lin.js';
import { SHAN_GENERALS } from './shan.js';
import { YJ2011_GENERALS } from './yj2011.js';
import { YJ2012_GENERALS } from './yj2012.js';
import { YJ2013_GENERALS } from './yj2013.js';
import { YJ2014_GENERALS } from './yj2014.js';
import { XINGHUO_GENERALS } from './xinghuo.js';
import { YIN_GENERALS } from './yin.js';
import { LEI_GENERALS } from './lei.js';
import { FLASH_GENERALS } from './flash.js';
import { MO_GENERALS } from './mo.js';
import { MOU2_GENERALS } from './mou2.js';
import { HUO_GENERALS } from './huo.js';
import { CLAN_GENERALS } from './clan.js';
import { CLAN2_GENERALS } from './clan2.js';
import { SHENWU_GENERALS } from './shenwu.js';
import { MOUDING_GENERALS } from './mouding.js';
import { NARRATIVE_GENERALS } from './narrative.js';
import { WEIZHEN_GENERALS } from './weizhen.js';
import { XINGHE_GENERALS } from './xinghe.js';
import { QUNYING_GENERALS } from './qunying.js';
import { JIN_GENERALS } from './jin.js';
import { PHASE4_GENERALS } from './phase4.js';
import { CUSTOM_GENERALS } from './custom.js';
// 2026-10-25：玩家手写设计稿第二批（星将 19 + 异闻 2）
import { STAR_GENERALS } from './star.js';
import { MYTH_GENERALS } from './myth.js';
import { MOON_GENERALS } from './moon.js';
// 2026-10-26：江山如故·起（17 将）
import { JSG_QI_GENERALS } from './jsg_qi.js';
import { JSG_CHENG_GENERALS } from './jsg_cheng.js';
import { JSG_ZHUAN_GENERALS } from './jsg_zhuan.js';
import { JSG_HE_GENERALS } from './jsg_he.js';
import { RARE2_GENERALS } from './rare2.js';
import { XINGHUO2_GENERALS } from './xinghuo2.js';
import { YJ2015_GENERALS } from './yj2015.js';
import { YZ2016_GENERALS } from './yz2016.js';
import { CLAN3_GENERALS } from './clan3.js';
// 阶段 5 批次（5E 势+友 / 5C 晋补全 / 5B 国战不臣篇）
import { SHI_GENERALS } from './shi.js';
import { YOU_GENERALS } from './you.js';
import { JIN2_GENERALS } from './jin2.js';
// 阶段 5F：手杀 SP + 界 精选 10 将
import { SP4_GENERALS } from './sp4.js';
// 2026-10-26：稀有扩展三包（SP·绝世 / 稀世珍宝 / 稀有·传说）
import { SP5_GENERALS } from './sp5.js';
import { XE_GENERALS } from './xe.js';
import { RARE_GENERALS } from './rare.js';
// 阶段 5B：国战·不臣篇 7 将（董昭 / 徐庶 已在其它包中存在，故跳过）
import { BUCHEN_GENERALS } from './buchen.js';
// 阶段 5I：神将跨线 10 将
import { SHEN2_GENERALS } from './shen2.js';
// 阶段 6A：神·武（补全）8 将
import { SHENWU2_GENERALS } from './shenwu2.js';
// 阶段 6B：谋·增补 6 将
import { MOU5_GENERALS } from './mou5.js';
// 阶段 6C：威震武庙·星河（补全）15 将
import { WEIZHEN2_GENERALS } from './weizhen2.js';
// 阶段 6D：群英荟萃·补全 22 将
import { QUNYING2_GENERALS } from './qunying2.js';
// 阶段 6E：一将成名·十周年 14 将
import { YHX_GENERALS } from './yhx.js';

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

  // ---- 界限突破·风火林山（阶段 2D）----
  { id: 'jie_huangzhong', name: '界黄忠', kingdom: 'shu', hp: 4, pack: 'jie', skills: ['jie_liegong'] },
  { id: 'jie_zhangjiao', name: '界张角', kingdom: 'qun', hp: 3, pack: 'jie', skills: ['jie_leiji', 'jie_guidao'] },
  { id: 'jie_xunyu', name: '界荀彧', kingdom: 'wei', hp: 3, pack: 'jie', skills: ['quhu', 'jie_jieming'] },
  { id: 'jie_weiyan', name: '界魏延', kingdom: 'shu', hp: 4, pack: 'jie', skills: ['jie_kuanggu', 'jie_qimou'] },
  { id: 'jie_xiaoqiao', name: '界小乔', kingdom: 'wu', hp: 3, pack: 'jie', skills: ['jie_tianxiang', 'jie_hongyan'], gender: 'female' },

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

  // ================= 神话再临·风（SG006） =================
  { id: 'feng_xiahouyuan', name: '夏侯渊', kingdom: 'wei', hp: 4, pack: 'feng', skills: ['shensu'] },
  { id: 'feng_caoren', name: '曹仁', kingdom: 'wei', hp: 4, pack: 'feng', skills: ['jushou'] },
  { id: 'feng_huangzhong', name: '黄忠', kingdom: 'shu', hp: 4, pack: 'feng', skills: ['liegong'] },
  { id: 'feng_weiyan', name: '魏延', kingdom: 'shu', hp: 4, pack: 'feng', skills: ['kuanggu'] },
  { id: 'feng_xiaoqiao', name: '小乔', kingdom: 'wu', hp: 3, pack: 'feng', skills: ['tianxiang', 'hongyan'], gender: 'female' },
  { id: 'feng_zhoutai', name: '周泰', kingdom: 'wu', hp: 4, pack: 'feng', skills: ['buqu'] },
  { id: 'feng_zhangjiao', name: '张角', kingdom: 'qun', hp: 3, pack: 'feng', skills: ['leiji', 'guidao'] },
  { id: 'feng_yuji', name: '于吉', kingdom: 'qun', hp: 3, pack: 'feng', skills: ['guhuo'] },
];

// 神话再临·林（SG009）
GENERALS.push(...LIN_GENERALS);
// 神话再临·山（SG010）
GENERALS.push(...SHAN_GENERALS);
// 一将成名 2011
GENERALS.push(...YJ2011_GENERALS);
// 一将成名 2012
GENERALS.push(...YJ2012_GENERALS);
// 一将成名 2013
GENERALS.push(...YJ2013_GENERALS);
// 一将成名 2014
GENERALS.push(...YJ2014_GENERALS);
// 星火燎原·精选
GENERALS.push(...XINGHUO_GENERALS);
// 神话再临·阴（阶段 5A 第一批）
GENERALS.push(...YIN_GENERALS);
GENERALS.push(...LEI_GENERALS);
GENERALS.push(...FLASH_GENERALS);
GENERALS.push(...MO_GENERALS);
GENERALS.push(...MOU2_GENERALS);
// 神话再临·火（7 将；典韦在 lin.js）
GENERALS.push(...HUO_GENERALS);
GENERALS.push(...CLAN_GENERALS);
GENERALS.push(...CLAN2_GENERALS);
GENERALS.push(...SHENWU_GENERALS);
GENERALS.push(...MOUDING_GENERALS);
GENERALS.push(...NARRATIVE_GENERALS);
GENERALS.push(...WEIZHEN_GENERALS);
GENERALS.push(...XINGHE_GENERALS);
GENERALS.push(...QUNYING_GENERALS);
// 晋势力 · 文德武备（8 将 · M8 隐匿技）
GENERALS.push(...JIN_GENERALS);
// 阶段 4 收尾批（4C + 4F）· 3 位机制武将（诸葛诞 / 左慈 / 魔周瑜）
GENERALS.push(...PHASE4_GENERALS);
// 玩家自定义武将（custom 包）
GENERALS.push(...CUSTOM_GENERALS);
// 阶段 5E：手杀「兵势篇·势」10 将 + 老友季「友」5 将
GENERALS.push(...SHI_GENERALS);
GENERALS.push(...YOU_GENERALS);
// 阶段 5C：晋·文德武备补全 12 将
GENERALS.push(...JIN2_GENERALS);
// 阶段 5F：手杀 SP + 界 精选 10 将（高翔 / 崔琰&毛玠 / 董白 / 程昱 / 兀突骨 / 灵雎 / 丁尚涴 / 钟繇 / 界王基 / 界周妃）
GENERALS.push(...SP4_GENERALS);
GENERALS.push(...SP5_GENERALS);
GENERALS.push(...XE_GENERALS);
GENERALS.push(...RARE_GENERALS);
// 阶段 5B：国战·不臣篇（孟达 / 糜芳&傅士仁 / 刘琦 / 张鲁 / 士燮 / 唐咨 / 严白虎）
GENERALS.push(...BUCHEN_GENERALS);
// 阶段 5I：神将跨线 10 将（夺锐/止啼 · 击虚/天义 · 奇策/节命 · …）
GENERALS.push(...SHEN2_GENERALS);
// ---- 阶段 6：尾期全量补齐 ----
GENERALS.push(...SHENWU2_GENERALS);   // 6A 神·武（补全）
GENERALS.push(...MOU5_GENERALS);      // 6B 谋·增补
GENERALS.push(...WEIZHEN2_GENERALS);  // 6C 威震武庙·星河（补全）
GENERALS.push(...QUNYING2_GENERALS);  // 6D 群英荟萃·补全
GENERALS.push(...YHX_GENERALS);       // 6E 一将成名·十周年
// ---- 玩家自定义第二批（2026-10-25 手写设计稿）----
GENERALS.push(...STAR_GENERALS);      // 星将（19）
GENERALS.push(...MYTH_GENERALS);      // 自定义·异闻（2）
GENERALS.push(...MOON_GENERALS);      // 月（3）：月·黄忠 / 月·黄盖 / 月·关羽
// 2026-10-26：江山如故·起（17 将，线下原创扩）
GENERALS.push(...JSG_QI_GENERALS);
GENERALS.push(...JSG_CHENG_GENERALS);   // 江山如故·承（17 将）
GENERALS.push(...JSG_ZHUAN_GENERALS);
GENERALS.push(...JSG_HE_GENERALS);   // 江山如故·合（17 将）
GENERALS.push(...RARE2_GENERALS);    // 稀有·专属（移动版，20 将）
// 2026-10-26 第二批补全（41 将）：星火燎原缺 20 + 一将成名 2015 缺 5 + 原创之魂 2016 缺 3 + 门阀士族缺 12 + 闪朱儁 1
GENERALS.push(...XINGHUO2_GENERALS);
GENERALS.push(...YJ2015_GENERALS);
GENERALS.push(...YZ2016_GENERALS);
GENERALS.push(...CLAN3_GENERALS);

export const PACK_CN = { standard: '标准', jie: '界限突破', mou: '谋', shen: '神', ji: '极', feng: '神话再临·风', lin: '神话再临·林', huo: '神话再临·火', shan: '神话再临·山', yj2011: '一将成名·2011', yj2012: '一将成名·2012', yj2013: '一将成名·2013', yj2014: '一将成名·2014', xinghuo: '星火燎原', yin: '神话再临·阴', lei: '神话再临·雷', flash: 'OL·闪', mo: 'OL·魔', mou2: '谋攻篇', clan: '门阀士族', clan2: '门阀士族·族将', shenwu: '神·武', mouding: '谋定天下', narrative: '线下叙事包', weizhen: '威震天下·武庙', xinghe: '星河璀璨·限定', qunying: '群英荟萃', jin: '晋·文德武备', custom: '自定义', phase4: '阶段 4 精选', shi: '手杀·兵势篇', you: '手杀·友', sp4: '手杀 SP·精选', buchen: '国战·不臣篇', yhx: '一将成名·十周年', star: '星将', myth: '自定义·异闻', moon: '月', sp5: 'SP·绝世', xe: '稀世珍宝', rare: '稀有·传说', jsg_qi: '江山如故·起', jsg_cheng: '江山如故·承', jsg_zhuan: '江山如故·转', jsg_he: '江山如故·合', rare2: '稀有·专属', yj2015: '一将成名·2015', yz2016: '原创之魂·2016' };
export const KINGDOM_CN = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', shen: '神', jin: '晋' };

export function generalById(id) { return GENERALS.find(g => g.id === id) || null; }
export function generOfPack(pack) { return pack === 'all' ? GENERALS : GENERALS.filter(g => g.pack === pack); }
export function pickGenerals({ packs = ['standard'], count, rng, exclude = [] }) {
  const pool = GENERALS.filter(g => packs.includes(g.pack) && !exclude.includes(g.id));
  return rng.shuffle(pool).slice(0, count);
}
