// 持有型容器集中声明（SG029 BLOCKER-1 / C1，SG030 A1/A2 修订）
// ---------------------------------------------------------------------------
// 「持有型」= 技能把牌从标准区域（手牌/装备/判定区/牌堆/弃牌堆）摘除后，
// 只由自己的私有容器持有。这类容器在下列时机必须把牌退回牌堆体系，否则牌永久消失：
//   ① 持有者阵亡（game.die）
//   ② 持有者失去该技能 / 失去全部技能（game.removeSkills / disableSkills）
// 「引用型」容器（如 clan3 的 rec.cards、shan 的 gzPool.cards、anlanBlock.ids）
// 存的是「已经进弃牌堆的牌」或「牌 id」，回收会造成同一张牌进两次弃牌堆 → **绝不能登记**。
//
// ★每个登记项必须给 `owner`（所属技能 id）：removeSkills(p, [某技能]) 只回收该技能的容器，
//   否则「删一个技能」会把玩家身上**其它仍持有技能**的容器一起清空（SG030 A2 实测：
//   删 guifu 时七星 stars→0）。
//
// clear(player, taken) 的 `taken` 是本次真正取走的牌；容器形态复杂（混合引用/虚拟牌）时
// 用它精确剔除，不要整体置空。
import { registerHeldContainer, isVirtualCard } from '../engine/skill.js';

const flagsArr = (name, owner) => ({
  key: `flags.${name}`,
  owner,
  get: (p) => p.flags?.[name],
  clear: (p) => { if (p.flags) p.flags[name] = []; },
});

// ---- 江山如故 / 稀有 ----
registerHeldContainer(flagsArr('jzShacheng', 'jz_shacheng'));   // 【沙城】牌堆顶两张（jsg_zhuan）
registerHeldContainer(flagsArr('rxLiang', 'rx_tunchu'));        // 【屯储】「粮」（rare2）
registerHeldContainer(flagsArr('rxWang', 'rx_zhaoxin'));        // 【昭心】牌（rare2）

// ---- 星火燎原 ----
registerHeldContainer(flagsArr('xhYinbing', 'xh_yinbing'));     // 【引兵】（xinghuo2）
registerHeldContainer(flagsArr('xhZengdao', 'xh_zengdao'));     // 【赠刀】（xinghuo2）
registerHeldContainer(flagsArr('xhKuangbi', 'xh_kuangbi'));     // 【匡弼】（xinghuo2）
// 【英识】「酬」形如 { seat, cards }（xinghuo2）
registerHeldContainer({
  key: 'flags.xhChou.cards',
  owner: 'xh_yingshi',
  get: (p) => p.flags?.xhChou?.cards,
  clear: (p) => { if (p.flags?.xhChou) p.flags.xhChou = { ...p.flags.xhChou, cards: [] }; },
});

// ---- 门阀士族 ----
registerHeldContainer(flagsArr('yi', 'cl3_fennu'));             // 【愤怒】「义」（clan3）

// ---- 其他扩展包 ----
registerHeldContainer(flagsArr('qianxunCards', 'jie_qianxun')); // 【谦逊】扣置手牌（jie）
registerHeldContainer(flagsArr('yiji', 'jie_yiji'));            // 【遗计】扣置牌（jie）
registerHeldContainer(flagsArr('stars', 'qixing'));             // 【七星】「星」（shen）
registerHeldContainer(flagsArr('qiongtu', 'qiongtu'));          // 【穷途】牌（flash3）
registerHeldContainer(flagsArr('kongsheng', 'kongsheng'));      // 【空声】牌（lei2）
registerHeldContainer(flagsArr('rong', 'zhengrong'));           // 【征荣】「荣」（lei2）
registerHeldContainer(flagsArr('wyCards', 'wanyi'));            // 【万仪】牌（jin2）
registerHeldContainer(flagsArr('hanCards', 'bc_qiuan'));        // 【嵌函】「函」（buchen）
registerHeldContainer(flagsArr('renCards', 'youyi'));           // 【游医】「仁」区（shenwu；★不能叫 ren）
registerHeldContainer(flagsArr('m5Qj', 'm5_qingjian'));         // 【清俭】（mou5）
registerHeldContainer(flagsArr('m5Kou', 'm5_pojun'));           // 【破军】「寇」（mou5）
// 「刺」：**由【独往】创建并维护**（qunying.js:143），【刺北】只读取/消耗（SG032 A2 实测：
// 登记成 cibei 会「删 duwang 漏 ci、删 cibei 误清 ci」，两个方向都错）。
registerHeldContainer(flagsArr('ci', 'duwang'));
registerHeldContainer(flagsArr('duanCards', 'duanyang'));       // 【断阳】牌（shi）
registerHeldContainer(flagsArr('ymCards', 'yangming'));         // 【阳明】牌（you）
registerHeldContainer(flagsArr('syHide', 'shunyi'));            // 【顺仪】藏牌（you）

// 【明伐】不是数组而是单对象 { card, seat }（qunying）
registerHeldContainer({
  key: 'flags.mingfa.card',
  owner: 'mingfa',
  get: (p) => (p.flags?.mingfa?.card ? [p.flags.mingfa.card] : []),
  clear: (p) => { if (p.flags?.mingfa) p.flags.mingfa = { ...p.flags.mingfa, card: null }; },
});

// 【设伏】形如 [{ key, cn, card }]（sp4）
registerHeldContainer({
  key: 'flags.fubing',
  owner: 'sk4_shefu',
  get: (p) => p.flags?.fubing,
  clear: (p) => {
    if (!p.flags) return;
    p.flags.fubing = [];
    if (p.marks && p.marks.fubing != null) p.marks = { ...p.marks, fubing: 0 };
  },
});
// 【箜声】形如 [{seat, cards}]（sp4）
registerHeldContainer({
  key: 'flags.kong',
  owner: 'sk4_kongsheng',
  get: (p) => (p.flags?.kong || []).flatMap(r => (r && r.cards) || []),
  clear: (p) => {
    if (!p.flags) return;
    p.flags.kong = [];
    if (p.marks && p.marks.kong != null) p.marks = { ...p.marks, kong: 0 };
  },
});

// 【统荫】「匡祚」：混合型 —— `xinghe.js:496` 存的是「已使用的伤害牌」（引用，牌在弃牌堆），
// `:503` 存的是 gain 来的牌（拥有）。故只回收「非虚拟 + 不在任何标准区域」的那部分。
// ★虚拟牌判定必须看 **id**，不能只看 name（SG032 A1.1 实测）：纯 vcard 的 id 形如
//   vm999 / vxh999，但 name 是正常牌名（sha/tao），只判 /^vm/.test(name) 会漏过 →
//   实测 vxh999 被推进弃牌堆。
// ★owner 是多方写入（SG033 P1-3）：tongyin:496/503 与 chengfeng:601-616 都往这里放牌，
//   kuangzuo:586 负责消耗 —— 三者任一失去，牌都会失去结算路径，故三个 id 都要登记。
registerHeldContainer({
  key: 'flags.kuangzuo',
  owner: ['tongyin', 'chengfeng', 'kuangzuo'],
  get: (p) => (p.flags?.kuangzuo || []).filter(c => c && !isVirtualCard(c)),
  clear: (p, taken) => {
    if (!p.flags) return;
    const drop = new Set(taken || []);
    p.flags.kuangzuo = (p.flags.kuangzuo || []).filter(c => !drop.has(c));
    if (p.marks && p.marks.kuangzuo != null) p.marks = { ...p.marks, kuangzuo: p.flags.kuangzuo.length };
  },
});

// ---- 单对象容器（不是数组）----
// 【明任】「任」：单张牌对象（yin3）
registerHeldContainer({
  key: 'flags.renCard',
  owner: 'mingren',
  get: (p) => (p.flags?.renCard && p.flags.renCard.name ? [p.flags.renCard] : []),
  clear: (p) => { if (p.flags) { p.flags.renCard = null; if (p.marks) p.marks = { ...p.marks, ren: '' }; } },
});
// 【奋威】「威」：单张牌对象（mou5）
registerHeldContainer({
  key: 'flags.m5Wei',
  owner: 'm5_fenwei',
  get: (p) => (p.flags?.m5Wei && p.flags.m5Wei.name ? [p.flags.m5Wei] : []),
  clear: (p) => { if (p.flags) p.flags.m5Wei = null; },
});
// 【挹挟】额外武器：**虚拟牌**（`virtual:true` / id 形如 qx_*），绝不能入弃牌堆 → 只清空
registerHeldContainer({
  key: 'flags.extraWeaponCard',
  owner: 'qiexie',
  alwaysClear: true,
  get: () => [],
  clear: (p) => { if (p.flags) p.flags.extraWeaponCard = null; },
});

// ---- 玩家级容器（不在 flags 上）----
// 【屯田】「田」（shan.js:196-205，邓艾）：判定牌从弃牌堆摘出后扣置在武将牌上。
// 虚拟占位牌（id 形如 tian*、virtual:true，见 shan.js:204）不能入弃牌堆 → get 里过滤，
// 只回收真实判定牌（SG033 P1-3：此前完全未登记，邓艾死亡/失技后「田」永久丢失）。
registerHeldContainer({
  key: 'tian', owner: 'tuntian',
  get: (p) => (p.tian || []).filter(c => c && !isVirtualCard(c)),
  clear: (p, taken) => {
    const drop = new Set(taken || []);
    p.tian = (p.tian || []).filter(c => !drop.has(c));
  },
});
// 【立牧】「牧」（qunying2.js:921-938）：手牌扣置在武将牌上，出牌阶段结束才收回。
registerHeldContainer({
  key: 'marks.mu', owner: 'qy2s_limu',
  get: (p) => p.marks?.mu,
  clear: (p, taken) => {
    const drop = new Set(taken || []);
    if (p.marks) p.marks = { ...p.marks, mu: (p.marks.mu || []).filter(c => !drop.has(c)) };
  },
});
// 【破军】「军」（yj2011.js:351，徐盛）：把**目标**至多 X 张牌置于目标武将牌上，目标回合结束收回。
// ★容器挂在被害者身上而不是施放者身上 —— 全量回收（死亡）时 owners=null 会全部走到，
//   故不需要额外声明；removeSkills 时 owner 不在集合里自然跳过（施放者失技不该动别人的牌）。
registerHeldContainer({
  key: 'jun', owner: 'pojun',
  get: (p) => p.jun,
  clear: (p, taken) => {
    const drop = new Set(taken || []);
    p.jun = (p.jun || []).filter(c => !drop.has(c));
  },
});
// 【醇醪】「醇」（yj2012.js:361，程普）：结束阶段把【杀】置于武将牌上，濒死时可当【酒】。
registerHeldContainer({
  key: 'chunlao', owner: 'chunlao',
  get: (p) => p.chunlao,
  clear: (p, taken) => {
    const drop = new Set(taken || []);
    p.chunlao = (p.chunlao || []).filter(c => !drop.has(c));
  },
});
registerHeldContainer({
  key: 'quan', owner: 'quanji',
  get: (p) => p.quan,
  clear: (p) => { p.quan = []; },
});
registerHeldContainer({
  key: 'si', owner: 'xiansi',
  get: (p) => p.si,
  clear: (p) => { p.si = []; },
});
registerHeldContainer({
  key: 'zhen', owner: 'zhenjun',
  get: (p) => (p.zhen || []).map(r => r && r.card).filter(Boolean),
  clear: (p) => { p.zhen = (p.zhen || []).filter(r => !(r && r.card)); },   // 只清牌，保留记录项
});

// ★不登记 guifu（mo.js）：
//   mo.js:7/27 的「归附」容器会混入 vcard 虚拟牌（合成牌），回收后弃牌堆会出现 vm999 这类
//   非法牌（SG030 A1.1 实测）。归附牌在技能内部即取即用，不需要跨回合持有 → 其 reclaimCards
//   只清空容器、不返回牌（见 mo.js）。
// ★不登记 kuangzuo 的引用部分 / gzPool.cards / clan3 的 rec.cards / lastDodgeCards / anlanBlock.ids
