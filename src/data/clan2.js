// 门阀士族（clan2）批次 · 族将 12 位
// clan：宗族标签（'zhong' 颍川钟氏 / 'wang' 太原王氏 / 'yang' 弘农杨氏 / 'chen' 颍川陈氏 / 'wu' 陈留吴氏 / 'lu' 吴郡陆氏）
// 引擎用 g.sameClan(a,b) 判定同族（player.clan 由 generals.js 的 clan 字段注入）。
// 势力说明：族钟琰官方势力为「晋」，引擎已支持 kingdom:'jin'（见 src/data/jin.js / KINGDOM_CN），故按官方写 jin。
// 体力说明：标注「资料未核实」者为本批次未能核到官方数值、按技能数量与同期同类武将推断的合理值。
export const CLAN2_GENERALS = [
  // ================= 颍川·钟氏（宗族技：保族）=================
  // 族钟琰：晋 3 体力 女；技能 观骨 / 啸咏 / 保族
  { id: 'clan2_zhongyan', name: '族钟琰', kingdom: 'jin', hp: 3, gender: 'female', pack: 'clan2', clan: 'zhong', skills: ['guangu', 'xiaoyong', 'baozu'] },
  // 族钟会：魏 4 体力（官方标「3/4 体力」，此处取上限 4，初始体力差异未建模）；技能 迂志 / 挟术 / 保族
  { id: 'clan2_zhonghui', name: '族钟会', kingdom: 'wei', hp: 4, pack: 'clan2', clan: 'zhong', skills: ['yuzhi', 'xieshu', 'baozu'] },
  // 族钟毓：魏 3 体力；技能 捷谏 / 惶汗 / 保族
  { id: 'clan2_zhongyu', name: '族钟毓', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'zhong', skills: ['jiejian', 'huanghan', 'baozu'] },
  // 族钟繇：魏 3 体力；技能 承启 / 诫厉 / 保族
  { id: 'clan2_zhongyao', name: '族钟繇', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'zhong', skills: ['chengqi', 'jieli', 'baozu'] },

  // ================= 太原·王氏（宗族技：中流，已在 clan.js 实现）=================
  // 族王沦：魏 3 体力；技能 求心 / 简远 / 中流
  { id: 'clan2_wanglun', name: '族王沦', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'wang', skills: ['qiuxin', 'jianyuan', 'zhongliu'] },
  // 族王昶：魏 4 体力（资料未核实）；技能 开济 / 中流
  { id: 'clan2_wangchang', name: '族王昶', kingdom: 'wei', hp: 4, pack: 'clan2', clan: 'wang', skills: ['kaiji', 'zhongliu'] },
  // 族王沈：魏 3 体力；技能 岸然 / 告变 / 中流
  { id: 'clan2_wangshen', name: '族王沈', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'wang', skills: ['anran', 'gaobian', 'zhongliu'] },

  // ================= 弘农·杨氏（宗族技：去惑）=================
  // 族杨修：魏 3 体力；技能 捷悟 / 高视 / 去惑
  { id: 'clan2_yangxiu', name: '族杨修', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'yang', skills: ['jiewu', 'gaoshi', 'quhuo'] },

  // ================= 颍川·陈氏（宗族技：士则）=================
  // 族陈群：魏 3 体力；技能 革制 / 明典 / 士则
  { id: 'clan2_chenqun', name: '族陈群', kingdom: 'wei', hp: 3, pack: 'clan2', clan: 'chen', skills: ['gezhi', 'mingdian', 'shize'] },
  // 族陈泰：魏 4 体力（资料未核实）；技能 奋剑 / 动虚 / 士则
  { id: 'clan2_chentai', name: '族陈泰', kingdom: 'wei', hp: 4, pack: 'clan2', clan: 'chen', skills: ['fenjian', 'dongxu', 'shize'] },

  // ================= 陈留·吴氏（宗族技：穆荫）=================
  // 族吴匡：群 4 体力（资料未核实）；技能 联诛 / 穆荫
  { id: 'clan2_wukuang', name: '族吴匡', kingdom: 'qun', hp: 4, pack: 'clan2', clan: 'wu', skills: ['lianzhu', 'muyin'] },

  // ================= 吴郡·陆氏（宗族技：泽烈）=================
  // 族陆郁生：吴 3 体力 女；技能 拾昔 / 坚白 / 泽烈
  { id: 'clan2_luyusheng', name: '族陆郁生', kingdom: 'wu', hp: 3, gender: 'female', pack: 'clan2', clan: 'lu', skills: ['shixi', 'jianbai', 'zelie'] },
];
