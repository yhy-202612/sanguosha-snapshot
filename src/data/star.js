// 「星」自定义包（pack: 'star'，PACK_CN = '星将'）
// 来源：玩家手写设计稿（2026-10-25 拍照提交，共 19 位「星·」武将）。
// 技能实现见 src/skills/star1.js / star2.js / star3.js。
// 约定：手写稿里大量「持恒技」按「锁定/不可取消」处理；0.5 点伤害、获得控制权、
//      查看牌堆顶等超出引擎状态机的机制采用可玩近似，具体简化逐条写在技能 desc 末尾。
export const STAR_GENERALS = [
  // ---- 图 1 ----
  // 星·吕蒙：摸牌增益 + 展示牌堆顶分配 + 每轮限制伤害
  { id: 'star_lumeng', name: '星·吕蒙', kingdom: 'wu', hp: 4, pack: 'star',
    skills: ['shengyi', 'gongtian', 'lixin'] },

  // 星·孙权：重铸/视为使用 + 给牌换牌 + 响应摸牌
  { id: 'star_sunquan', name: '星·孙权', kingdom: 'wu', hp: 4, pack: 'star',
    skills: ['pingzhun', 'star_zhiba', 'quanding'] },

  // 星·华雄：勇标记（响应次数越多越难被响应）
  { id: 'star_huaxiong', name: '星·华雄', kingdom: 'qun', hp: 5, pack: 'star',
    skills: ['shanzhan', 'wenjiu'] },

  // 星·曹丕：限定技弃光手牌得帝星，转为龙谕资源体系
  { id: 'star_caopi', name: '星·曹丕', kingdom: 'wei', hp: 4, pack: 'star',
    skills: ['chengdi', 'dixing'] },

  // ---- 图 3 ----
  // 星·贾诩：借力杀人（虚拟杀）体系 + 濒死保护 + 每轮记恨
  { id: 'star_jiaxu', name: '星·贾诩', kingdom: 'qun', hp: 2, pack: 'star',
    skills: ['shenmou', 'yuanlv', 'jihen'] },

  // 星·赵云：龙吟牌 + 龙威点数，距离恒为 1
  { id: 'star_zhaoyun', name: '星·赵云', kingdom: 'shu', hp: 3, pack: 'star',
    skills: ['star_longyin', 'star_longyin_use', 'youlong'] },

  // 星·左慈：武将牌（以「幻」标记抽象）+ 化形获得技能
  { id: 'star_zuoci', name: '星·左慈', kingdom: 'qun', hp: 3, pack: 'star',
    skills: ['huanbian', 'huaxing'] },

  // 星·典韦：装备技能通用技，准备阶段自动上装备
  { id: 'star_dianwei', name: '星·典韦', kingdom: 'wei', hp: 4, pack: 'star',
    skills: ['zhuwu', 'weixie'] },

  // ---- 图 5 ----
  // 星·南华老仙：仙御（太平要术+八卦阵）
  { id: 'star_nanhua', name: '星·南华老仙', kingdom: 'qun', hp: 3, pack: 'star',
    skills: ['xuanxian', 'shihai', 'xianyu'] },

  // 星·张角：雷之印 + 雷诅/雷随 两种附加标记
  { id: 'star_zhangjiao', name: '星·张角', kingdom: 'qun', hp: 4, pack: 'star',
    skills: ['tianlei', 'leiyu'] },

  // 星·吕布：魔之谕换体力上限，魔之武当任意牌
  { id: 'star_lvbu', name: '星·吕布', kingdom: 'qun', hp: 5, pack: 'star',
    skills: ['moxing', 'tianwu', 'jueyi'] },

  // ---- 图 6 ----
  // 星·周瑜：火牌转化 + 死亡觉醒复活
  { id: 'star_zhouyu', name: '星·周瑜', kingdom: 'wu', hp: 2, pack: 'star',
    skills: ['huanmie', 'chizhuo'] },

  // 星·大乔：月之尘 + 月魂牌
  { id: 'star_daqiao', name: '星·大乔', kingdom: 'wu', hp: 3, pack: 'star',
    skills: ['yuehun', 'yuese'] },

  // 星·黄月英：天纵牌堆 + 心之谕
  { id: 'star_huangyueying', name: '星·黄月英', kingdom: 'shu', hp: 3, pack: 'star',
    skills: ['tianzong', 'jiheng', 'suoxing'] },

  // 星·黄忠：烈影记录 + 天杀多选叠加
  { id: 'star_huangzhong', name: '星·黄忠', kingdom: 'shu', hp: 4, pack: 'star',
    skills: ['lieying', 'tiansha'] },

  // ---- 图 7 ----
  // 星·黄盖：苦肉换护甲，未装备防具时的空甲判定
  { id: 'star_huanggai', name: '星·黄盖', kingdom: 'wu', hp: 3, pack: 'star', armor: 0, armorMax: 6,
    skills: ['kurou_star', 'kongjia', 'jiangnu'] },

  // 星·陆逊：连环/火焰体系
  { id: 'star_luxun', name: '星·陆逊', kingdom: 'wu', hp: 4, pack: 'star',
    skills: ['suoyan', 'jinxing', 'fenying', 'shanhuo'] },

  // 星·华佗：散标记（采药）
  { id: 'star_huatuo', name: '星·华佗', kingdom: 'qun', hp: 4, pack: 'star',
    skills: ['caiyao'] },

  // 星·管辂：星蛊猜牌名花色，翻面联动
  { id: 'star_guanlu', name: '星·管辂', kingdom: 'wei', hp: 3, pack: 'star',
    skills: ['xinggu', 'yuliu'] },
];
