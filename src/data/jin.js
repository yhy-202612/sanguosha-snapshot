// 晋势力 · 文德武备（阶段 4D · 8 将）
// 官方出处：《三国杀OL》2021-01-20「应变篇」版本新增第五势力「晋」的首发 8 将（官网版本公告）。
// 资料来源：三国杀OL 官网 2021-01-20 公告（武将技能原文）+ 三国杀 Wiki + 萌娘百科 规则集描述。
//
// ◆ M8 隐匿技：晋势力的通用机制。武将数据上写 hidden: true → 该角色开局即处于隐匿
//   （引擎：不能被其他角色指定为目标、不参与距离计算、使用任意牌后自动解除隐匿）。
//   司马家四将（晋司马懿 / 晋张春华 / 司马师 / 司马昭）拥有官方「隐匿技」，故设为 hidden: true。
//   * 说明（本批设定的偏差）：官方 王元姬【识人】、夏侯徽【宝箧】同样带有「隐匿技」标签，
//     但按本批要求只让上述 4 位处于隐匿；为让这两个技能在不隐匿时仍有触发点，
//     实际实现改为「你的第一个回合开始时（视为登场）」发动，desc 已写成本批实际实现的版本。
export const JIN_GENERALS = [
  // 晋司马懿（JIN 001）· 3 体力 · 隐匿技武将（资料已核实：官网 2021-01-20 公告）
  { id: 'jin_simayi', name: '晋司马懿', kingdom: 'jin', hp: 3, pack: 'jin', hidden: true,
    skills: ['buchen', 'yingshi', 'xiongzhi', 'quanbian'] },

  // 晋张春华 · 3 体力 · 隐匿技武将（资料已核实）
  { id: 'jin_zhangchunhua', name: '晋张春华', kingdom: 'jin', hp: 3, pack: 'jin', hidden: true,
    skills: ['huishi', 'qingleng', 'xuanmu'] },

  // 司马师（JIN 003）· 上限 4 / 起始 3 · 隐匿技武将（资料已核实）+ 主公技【睿略】
  { id: 'jin_simashi', name: '司马师', kingdom: 'jin', hp: 4, hpNow: 3, pack: 'jin', hidden: true,
    skills: ['taoyin', 'yimie', 'ruilve', 'tairan'], lord: 'ruilve' },

  // 司马昭 · 3 体力 · 隐匿技武将（资料已核实）+ 主公技【成务】
  { id: 'jin_simazhao', name: '司马昭', kingdom: 'jin', hp: 3, pack: 'jin', hidden: true,
    skills: ['tuishi', 'choufa', 'zhaoran', 'chengwu'], lord: 'chengwu' },

  // 王元姬 · 3 体力（官方【识人】为隐匿技；本批未设 hidden，实现见 src/skills/jin.js 文件注释）
  { id: 'jin_wangyuanji', name: '王元姬', kingdom: 'jin', hp: 3, pack: 'jin',
    skills: ['shiren', 'yanxi'] },

  // 夏侯徽 · 3 体力（官方【宝箧】为隐匿技；本批未设 hidden；【宝箧】按牌堆无「宝物牌」简化为装备牌）
  { id: 'jin_xiahouhui', name: '夏侯徽', kingdom: 'jin', hp: 3, pack: 'jin',
    skills: ['baoxie', 'yishi', 'shidu'] },

  // 杜预 · 4 体力（资料已核实：三陈 / 诏讨 / 破竹；【破竹】的【出其不意】引擎无此牌，详见技能文件注释）
  { id: 'jin_duyu', name: '杜预', kingdom: 'jin', hp: 4, pack: 'jin',
    skills: ['sanzhen', 'zhaotao', 'pozhu'] },

  // 张虎&乐綝 · 4 体力 · 双将（官方技能只有【袭爵】，内含【突袭】【骁果】两个子流程，取两人合集）
  { id: 'jin_zhanghu_lelian', name: '张虎&乐綝', kingdom: 'jin', hp: 4, pack: 'jin',
    skills: ['xijue'] },
];
