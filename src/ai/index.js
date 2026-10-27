import { CARD_META, EQUIP_SUB } from '../engine/cards.js';


const CARD_VALUE = {
  tao: 12, wuxie: 9, sha: 6, shan: 7, jiu: 5, wuzhong: 9, guohe: 6, shunshou: 7,
  juedou: 5, jiedao: 4, wanjian: 5, nanman: 5, taoyuan: 4, wugu: 6, lebu: 4, bingliang: 4, shandian: 2,
  huogong: 4, tiesuo: 3, bagua: 8, renwang: 8, tengjia: 7, baiyin: 7,
};

function value(c) { return CARD_VALUE[c.name] ?? 3; }

// 技能 id 去包前缀：jie_zhiheng / mou_zhiheng / ji_zhiheng → zhiheng
export function baseSkillId(id) {
  return String(id || '').replace(/^(jie|mou|ji|shen|sp|ol|sc|re)_/, '');
}

// 已做精确条件判定的主动技（基名）。命中的技能若条件不满足，AI 不再走「45% 通用兜底」，
// 防止做出亏操作（弃光手牌、自杀式送牌等）。新增主动技时，要么在此加精确条件，要么让兜底接管。
const AI_PRECISE = new Set([
  'guangu', 'chengqi', 'qiuxin', 'kaiji', 'fenjian', 'dongxu',
  'xiongzhi', 'choufa', 'yanxi', 'shidu', 'sanzhen', 'pozhu',
  'shejia', 'qijia', 'zhujia', 'kuijia', 'qiaogong', 'zaoji',
  'huashen2', 'moyan', 'fentian',
  // 阶段 5：兵势篇 / 友 / 晋补全 / 不臣篇 / 手杀 SP / 神·跨线
  'runwei', 'nigu', 'dianyi', 'qinying', 'biwei', 'fangqiu',
  'caozhao', 'tousui', 'xuanbei',
  'sk4_chiying', 'sk4_fengying', 'sk4_lianzhu', 'sk4_fengyan', 'sk4_huomo', 'sk4_qizhi',
  'sn_jixu', 'sn_tianyi', 'sn_qice', 'sn_dimeng', 'sn_lianhuan', 'sn_qiangxi',
  // 阶段 6：神武补全 / 谋增补 / 威震星河 / 群英荟萃 / 一将成名
  'shencai', 'jieyin', 'lijian', 'qianli', 'quanmou', 'fenwei', 'leiji',
  'chongzhen', 'jizhan', 'dingjun', 'zhiji', 'pozhen', 'sheshen', 'xingheng', 'xingde',
  'guancang', 'wuxing', 'xinghou', 'gushe', 'qingxian', 'shuangren', 'manxi', 'bifa',
  'denglou', 'xueji', 'mizhao', 'shenzhi', 'beizhan', 'daoshu',
  // 2026-10-25 星将 / 异闻（手写设计稿第二批）：这些主动技有的代价极高（苦肉失体力、称帝弃光手牌），
  // 必须精确判定，否则 45% 兜底会让 AI 自杀式发动
  'kurou_star', 'gongtian', 'lixin', 'star_zhiba', 'chengdi', 'shenmou', 'jihen',
  'star_longyin', 'huanbian', 'huaxing', 'weixie', 'shihai', 'tianwu', 'xiangchou',
  'sanxiang', 'yuedian', 'xinzhengcheng', 'jinxing', 'fenying', 'shanhuo', 'caiyao',
  'xinggu', 'suoxing', 'tiansha', 'yuehun', 'wanchao', 'dixing', 'star_longyin_use',
]);

// 敌我判定
export function isEnemy(game, me, other) {
  if (me === other) return false;
  const modeId = game.mode.id;
  if (modeId === 'identity' || modeId === 'junzheng') {
    if (!other.role) return true;
    if (me.role === 'lord' || me.role === 'loyalist') return other.role === 'rebel' || other.role === 'renegade';
    if (me.role === 'rebel') return other.role === 'lord' || other.role === 'loyalist';
    if (me.role === 'renegade') return true;
    return true;
  }
  if (modeId === 'hulao') return (me.role === 'boss') !== (other.role === 'boss');
  if (modeId === 'guozhan') return me.role !== other.role;
  if (modeId === 'doudizhu') return (me.role === 'landlord') !== (other.role === 'landlord');
  return true; // duel
}

export function isFriend(game, me, other) {
  if (me === other) return true;
  return !isEnemy(game, me, other);
}

export class AIPlayer {
  constructor(seat, { aggression = 0.7 } = {}) {
    this.seat = seat;
    this.aggression = aggression;
  }

  async askPlay(game, p) {
    if (!p.alive) return null;
    const enemies = game.alive().filter(x => x !== p && isEnemy(game, p, x));
    const friends = game.alive().filter(x => x !== p && isFriend(game, p, x));

    // 1) 低血吃桃
    const tao = p.hand.find(c => c.name === 'tao');
    if (tao && (p.hp <= 2 || (p.hp < p.maxHp && game.rng.next() < 0.25))) return { card: tao, targets: [p] };

    // 2) 上装备
    for (const c of p.hand) {
      const meta = CARD_META[c.name];
      if (meta?.sub) {
        const slot = EQUIP_SUB[meta.sub];
        if (!p.equips[slot]) return { card: c, targets: [] };
        // 替换更弱的武器
        if (slot === 'weapon' && (CARD_META[c.name].range || 1) > (CARD_META[p.equips[slot].name].range || 1)) {
          return { card: c, targets: [] };
        }
      }
    }

    // 3) 主动技
    // 注意：界/谋/极 武将的技能 id 带前缀（jie_zhiheng / mou_zhiheng…），
    // 直接比 s.id 会全部落空 → AI 永远不发动这些主动技。统一按「去前缀基名」判定。
    const act = game.activeSkillsOf(p);
    for (const s of act) {
      const bid = baseSkillId(s.id);
      // 防 AI 对「限次技能」反复空转：技能自身已限一次/每阶段限一次时，
      // 重复 return 只会进 effect 被守卫拦下并刷一行日志（实测【讽言】【润微】曾单局刷上百行）。
      if (AI_PRECISE.has(bid)) {
        const tryKey = `__aiTry_${bid}_${game.turnCount}`;
        const n = p.flags[tryKey] || 0;
        if (n >= 12) continue;
        p.flags[tryKey] = n + 1;
      }
      if (bid === 'zhiheng' && p.hand.length >= 4) return { skill: s.id };
      if (bid === 'kurou' && p.hp >= 3 && p.hand.length <= 3) return { skill: s.id };
      if (bid === 'qingnang' && p.hand.length >= 4 && p.hp <= p.maxHp - 2
        && p.flags.aiQnTurn !== game.turnCount && game.alive().some(x => x.hp < x.maxHp)) {
        // 界青囊可在同一回合内链式发动；AI 每回合只进入一次，避免长局反复刷血拖成僵局
        p.flags.aiQnTurn = game.turnCount;
        return { skill: s.id };
      }
      if (bid === 'jieyin' && p.hand.length >= 3 && friends.some(f => f.gender === 'male' && f.hp < f.maxHp)) return { skill: s.id };
      if (bid === 'lijian' && p.hand.length >= 2 && enemies.filter(e => e.gender === 'male').length >= 2) return { skill: s.id };
      if (bid === 'rende' && p.hand.length >= 3 && friends.length) return { skill: s.id };
      if (bid === 'fanjian' && p.hand.length >= 2 && enemies.length) return { skill: s.id };
      if (bid === 'qixi' && p.hand.length >= 2 && enemies.some(e => e.hand.length || Object.values(e.equips).some(Boolean))) return { skill: s.id };
      if (bid === 'tuxi' && enemies.some(e => e.hand.length)) return { skill: s.id };
      // 于吉【蛊惑】：手牌充裕时试着声明使用（真假由亮牌结算）
      if (bid === 'guhuo' && p.hand.length >= 2 && enemies.length) return { skill: s.id };
      // 界魏延【奇谋】：体力充足时一次性爆发（限定技）
      if (bid === 'qimou' && !p.flags.qimouUsed && p.hp >= 3 && enemies.length) return { skill: s.id };
      // 蒯良蒯越【审时】·阳面：有手牌且场上有敌人
      if (bid === 'shenshi' && p.flags.shenshiSide !== 'yin' && p.hand.length && enemies.length) return { skill: s.id };
      // 王平【飞军】：有牌可弃且有可针对的角色
      if (bid === 'feijun' && p.hand.length && enemies.length) return { skill: s.id };
      // 许攸【成略】：手牌足够支付
      if (bid === 'chenglve' && p.hand.length >= 3) return { skill: s.id };
      // 陆抗【决堰】：装备栏未废完时换资源
      if (bid === 'jueyan' && Object.keys(p.flags.disabledEquip || {}).length < 4) return { skill: s.id };
      // 张绣【雄乱】：限定技，手上有【杀】且敌人手牌不多时爆发
      if (bid === 'xiongluan' && !p.flags.xiongluanUsed && p.hand.filter(c => c.name === 'sha').length >= 1 && enemies.length) return { skill: s.id };
      // 陆抗【怀柔】：手上有装备牌可重铸
      if (bid === 'huairou' && p.hand.some(c => CARD_META[c.name]?.sub)) return { skill: s.id };
      // 闪孙坚【平讨】：有敌人即可发动（要牌或被【杀】）
      if (bid === 'pingtao' && enemies.length) return { skill: s.id };
      // 毌丘俭【清侧】：有「荣」即可回收并拆牌
      if (bid === 'qingce' && (p.flags.rong || []).length && enemies.some(e => e.hand.length || Object.values(e.equips).some(Boolean))) return { skill: s.id };
      // 卢植【贞良】·阳面：有「任」、有同色牌且攻击范围内有敌人
      if (bid === 'zhenliang' && p.flags.zhenliangSide !== 'yin' && p.flags.renCard
        && p.hand.length >= 2 && enemies.length) return { skill: s.id };
      // 风包主动技：神速（每回合两项各一次）、据守（手牌 ≤3 时摸三翻面）
      if (bid === 'shensu' && enemies.length) {
        const opts = p.flags.shensuTurn === game.turnCount ? (p.flags.shensuOpts || {}) : {};
        const hasEquip = [...p.hand, ...Object.values(p.equips).filter(Boolean)]
          .some(c => CARD_META[c.name]?.sub);
        if (!opts[1] || (!opts[2] && hasEquip)) return { skill: s.id };
      }
      if (bid === 'jushou' && p.hand.length <= 3 && !p.flipped) return { skill: s.id };
      // 林包主动技
      if (bid === 'qiangxi' && p.hp >= 3 && enemies.some(e => game.inAttackRange(p, e))) return { skill: s.id };
      if (bid === 'dimeng' && p.hand.length >= 3 && enemies.length >= 2) return { skill: s.id };
      if (bid === 'luanwu' && !p.flags.luanwuUsed && enemies.length >= 2) return { skill: s.id };
      // 山包主动技
      if (bid === 'tiaoxin' && enemies.some(e => game.inAttackRange(p, e))) return { skill: s.id };
      if (bid === 'zhijian' && p.hand.some(c => CARD_META[c.name]?.sub) && friends.length) return { skill: s.id };
      if (bid === 'fangquan' && friends.length && p.hand.length <= 3) return { skill: s.id };
      if (bid === 'jixi' && (p.tian || []).length && enemies.some(e => game.distance(p, e) <= 1)) return { skill: s.id };
      if (bid === 'zhiba' && p.hand.length >= 2 && game.alive().some(x => x !== p && x.kingdom === 'wu' && x.hand.length)) return { skill: s.id };
      // ---- 以下为阶段 4 / 门阀士族 / 晋 / 自定义将的主动技精确条件 ----
      // 这些技能一旦列入 AI_PRECISE，条件不满足就不会再落到下面的「通用兜底」，
      // 避免 AI 用 45% 概率做出亏操作（例如【弃甲】弃光手牌、【馈甲】自杀式送牌）。
      if (bid === 'guangu' && p.hand.length <= 5) return { skill: s.id };                    // 观骨：牌不多时看牌补牌
      if (bid === 'chengqi' && p.hand.length >= 3 && enemies.length) return { skill: s.id };  // 承启：两张手牌转化
      if (bid === 'qiuxin' && enemies.length) return { skill: s.id };                         // 求心：指定敌方声明
      if (bid === 'kaiji' && p.hand.length >= 2 && enemies.length) return { skill: s.id };    // 开济：有牌可被弃
      if (bid === 'fenjian' && enemies.some(e => game.inAttackRange(p, e))) return { skill: s.id }; // 奋剑：视为使用【杀】
      if (bid === 'dongxu' && p.hand.length < Math.min(game.attackRange(p) || 1, 5)) return { skill: s.id }; // 动虚：阴面摸牌
      if (bid === 'xiongzhi' && !p.flags.xiongzhiUsed && p.hand.length <= 4) return { skill: s.id };  // 雄志：限定技爆发
      if (bid === 'choufa' && enemies.some(e => e.hand.length)) return { skill: s.id };       // 筹伐
      if (bid === 'yanxi' && enemies.some(e => e.hand.length)) return { skill: s.id };        // 宴戏
      if (bid === 'shidu' && p.hand.length && enemies.some(e => e.hand.length)) return { skill: s.id }; // 识度：拼点
      if (bid === 'sanzhen' && p.hand.length <= 4) return { skill: s.id };                    // 三陈：滤牌
      if (bid === 'pozhu' && p.hand.length && enemies.some(e => game.inAttackRange(p, e))) return { skill: s.id }; // 破竹
      if (bid === 'shejia' && p.hand.length <= 3 && ((p.armor || 0) >= 1 || p.maxHp > 2)) return { skill: s.id }; // 舍甲
      if (bid === 'qijia' && p.flags.fuyanUsed && p.hand.length > 3
        && game.alive().every(x => x === p || x.hand.length < p.hand.length)) return { skill: s.id }; // 弃甲：仅复燃已消耗时
      if (bid === 'zhujia' && p.hand.length >= 5 && (p.armor || 0) < (p.armorMax || 0)) return { skill: s.id }; // 铸甲：牌多且护甲未满
      if (bid === 'kuijia' && p.hp >= 3 && friends.length && p.hand.length >= 4) return { skill: s.id };        // 馈甲：体力充裕
      if (bid === 'qiaogong' && (p.marks?.gong || 0) >= 2) return { skill: s.id };             // 巧工：取「巧」装备
      if (bid === 'zaoji' && (p.marks?.gong || 0) >= 5) return { skill: s.id };                // 造极：连击弩炮
      if (bid === 'huashen2' && (p.marks?.huashan || []).length) return { skill: s.id };       // 化身：换技能
      if (bid === 'moyan' && enemies.length
        && p.hand.some(c => c.suit === 'heart' || c.suit === 'diamond')) return { skill: s.id }; // 魔炎：弃红牌打 1 点火焰
      if (bid === 'fentian' && !p.flags.fentianUsed && enemies.length >= 2) return { skill: s.id }; // 焚天：限定技
      // ---- 阶段 5 各批（兵势篇 / 友 / 晋补全 / 不臣篇 / 手杀 SP / 神·跨线）主动技精确条件 ----
      if (bid === 'runwei' && game.alive().length >= 2) return { skill: s.id };                // 润微：看牌分牌
      if (bid === 'nigu' && p.hand.length >= 2 && new Set(p.hand.map(c => c.suit)).size >= 2) return { skill: s.id }; // 逆固：至少两花色
      if (bid === 'dianyi' && game.alive().some(q => q !== p && q.hand.some(c => c.__zhuanshe))) return { skill: s.id }; // 典易：场上有专慑牌
      if (bid === 'qinying' && p.hand.length >= 1 && enemies.length) return { skill: s.id };    // 钦英：重铸视为决斗
      if (bid === 'biwei' && p.hand.length >= 2 && enemies.some(e => e.hand.length)) return { skill: s.id }; // 鄙位：需弃最大点数牌
      if (bid === 'fangqiu' && !p.flags.fangqiuUsed && (p.flags.yanceN || 0) > 0) return { skill: s.id };    // 方遒：有预测待验证
      if (bid === 'caozhao' && p.hand.length >= 1 && enemies.some(e => e.hp <= p.hp)) return { skill: s.id }; // 草诏
      if (bid === 'tousui' && p.hand.length >= 2) return { skill: s.id };                       // 透髓：多张牌当杀
      if (bid === 'xuanbei' && enemies.some(e => e.hand.length >= 1)) return { skill: s.id };   // 选备
      if (bid === 'sk4_chiying' && game.alive().length >= 3) return { skill: s.id };            // 驰应：需他人可弃牌
      if (bid === 'sk4_fengying' && !p.flags.fengyingUsed && game.alive().length >= 3) return { skill: s.id }; // 奉迎：限定技
      if (bid === 'sk4_lianzhu' && p.hand.length >= 2 && enemies.length) return { skill: s.id }; // 连诛
      if (bid === 'sk4_fengyan' && enemies.some(e => e.hp <= p.hp && e.hand.length)) return { skill: s.id }; // 讽言
      if (bid === 'sk4_huomo' && p.hand.some(c => (c.suit === 'spade' || c.suit === 'club') && CARD_META[c.name]?.type === 'trick')) return { skill: s.id }; // 活墨：有黑色非基本牌
      if (bid === 'sk4_qizhi' && (p.marks.xuli || 0) >= 1) return { skill: s.id };              // 奇制：有蓄力点
      if (bid === 'sn_jixu' && enemies.some(e => e.hand.length || Object.values(e.equips || {}).some(Boolean))) return { skill: s.id }; // 击虚
      if (bid === 'sn_tianyi' && p.hand.length && enemies.some(e => e.hand.length)) return { skill: s.id }; // 天义：拼点
      if (bid === 'sn_qice' && p.hand.length >= 1 && p.hand.length <= 3) return { skill: s.id }; // 奇策：手牌少时才倾囊
      if (bid === 'sn_dimeng' && p.hand.length >= 2 && game.alive().filter(q => q !== p).length >= 2) return { skill: s.id }; // 缔盟
      if (bid === 'sn_lianhuan' && p.hand.length >= 2 && game.alive().length >= 3) return { skill: s.id }; // 连环
      if (bid === 'sn_qiangxi' && p.hp >= 2 && enemies.some(e => game.inAttackRange(p, e))) return { skill: s.id }; // 强袭：体力够才失去体力
      // ---- 阶段 6（6A-6E：神武补全 / 谋增补 / 威震星河 / 群英荟萃 / 一将成名）主动技精确条件 ----
      const isRed = (c) => c.suit === 'heart' || c.suit === 'diamond';
      const isBlack = (c) => c.suit === 'spade' || c.suit === 'club';
      const inRange = enemies.some(e => game.inAttackRange(p, e));
      if (bid === 'shencai' && enemies.length) return { skill: s.id };                                  // 神裁
      if (bid === 'jieyin' && p.hand.length >= 2 && game.alive().some(x => x.hp < x.maxHp)) return { skill: s.id };
      if (bid === 'lijian' && p.hand.length >= 1 && enemies.filter(e => e.gender === 'male').length >= 2) return { skill: s.id };
      if (bid === 'qianli' && p.hand.length >= 1 && p.hand.some(c => c.name === 'sha')) return { skill: s.id };
      if (bid === 'quanmou' && enemies.some(e => e.hand.length)) return { skill: s.id };                 // 权谋
      if (bid === 'fenwei' && !p.flags.m5FwUsed && p.hand.length >= 1) return { skill: s.id };           // 奋威：限定技
      if (bid === 'leiji' && (p.flags.m5Db || 0) >= 4 && enemies.length) return { skill: s.id };         // 雷击：需 4 道兵
      if (bid === 'chongzhen' && p.hand.length >= 1 && enemies.some(e => e.hand.length)) return { skill: s.id };
      if (bid === 'jizhan' && p.hand.some(isBlack) && enemies.length) return { skill: s.id };
      if (bid === 'dingjun' && p.hand.length >= 1 && inRange) return { skill: s.id };
      if (bid === 'zhiji' && p.hp >= 2 && inRange) return { skill: s.id };
      if (bid === 'pozhen' && p.hp >= 2 && enemies.length) return { skill: s.id };
      if (bid === 'sheshen' && p.hp >= 2 && enemies.length) return { skill: s.id };
      if (bid === 'xingheng' && p.hand.length >= 3) return { skill: s.id };                              // 星衡：牌少时换牌无意义
      if (bid === 'xingde' && friends.length && p.hand.length >= 3) return { skill: s.id };
      if (bid === 'guancang' && p.hand.length >= 2 && game.alive().length >= 2) return { skill: s.id };
      if (bid === 'wuxing' && p.hand.some(isRed) && inRange) return { skill: s.id };
      if (bid === 'xinghou' && p.hand.length >= 2 && inRange) return { skill: s.id };
      if (bid === 'gushe' && p.hand.length >= 2 && enemies.some(e => e.hand.length)) return { skill: s.id };
      if (bid === 'qingxian' && p.hand.length >= 2) return { skill: s.id };
      if (bid === 'shuangren' && p.hp >= 3 && p.hand.length >= 2 && enemies.some(e => e.hand.length)) return { skill: s.id };
      if (bid === 'manxi' && p.hand.length >= 2 && enemies.length) return { skill: s.id };
      if (bid === 'bifa' && p.hand.length >= 2 && enemies.length) return { skill: s.id };
      if (bid === 'denglou' && p.hand.length >= 2) return { skill: s.id };
      if (bid === 'xueji' && p.hand.some(isRed) && enemies.length) return { skill: s.id };
      if (bid === 'mizhao' && p.hand.length >= 1 && p.hand.length <= 2 && game.alive().length >= 3) return { skill: s.id }; // 密诏：手牌多时会全送，禁止
      if (bid === 'shenzhi' && p.hand.length >= 2 && game.alive().some(x => x.hp < x.maxHp)) return { skill: s.id };
      if (bid === 'beizhan' && p.hand.length >= 2 && game.alive().length >= 2) return { skill: s.id };
      if (bid === 'daoshu' && p.hp >= 3 && enemies.some(e => e.hand.length)) return { skill: s.id };
      // ---- 星将 / 异闻（2026-10-25 自定义第二批）----
      if (bid === 'kurou_star' && p.hp >= 3 && (p.hand.length <= 3 || (p.armor || 0) < (p.armorMax || 99))) return { skill: s.id };
      if (bid === 'gongtian' && p.hand.length >= 1) return { skill: s.id };
      if (bid === 'lixin' && enemies.length) return { skill: s.id };
      if (bid === 'star_zhiba' && p.hand.length >= 3 && enemies.length) return { skill: s.id };
      if (bid === 'chengdi' && !p.marks.dixing && p.hand.length >= 4) return { skill: s.id };
      if (bid === 'dixing' && (p.marks.longyu || 0) >= 1) return { skill: s.id };
      if (bid === 'shenmou' && enemies.length && p.armorMax >= 0) return { skill: s.id };
      if (bid === 'jihen' && enemies.length && !p.marks.jihen) return { skill: s.id };
      if (bid === 'star_longyin' && !p.flags.longyinCard && p.hand.some(c => CARD_META[c.name]?.type === 'basic')) return { skill: s.id };
      if (bid === 'star_longyin_use' && p.flags.longyinCard && (p.marks.longwei || 0) >= 1 && enemies.length) return { skill: s.id };
      if (bid === 'huanbian' && (p.marks.huan || 0) >= 1 && p.hand.length <= 3) return { skill: s.id };
      if (bid === 'huaxing' && (p.marks.huan || 0) >= p.hp) return { skill: s.id };
      if (bid === 'weixie' && Object.values(p.equips).filter(Boolean).length >= p.hp && p.hand.length >= 2) return { skill: s.id };
      if (bid === 'shihai' && (p.marks.xingzhi || 0) >= 2) return { skill: s.id };
      if (bid === 'tianwu' && (p.marks.mozhiwu || 0) >= 1 && enemies.length) return { skill: s.id };
      if (bid === 'xiangchou' && p.hand.some(c => c.name === 'sha') && enemies.length) return { skill: s.id };
      if (bid === 'sanxiang' && p.hp < p.maxHp + 2) return { skill: s.id };      // 回复 + 转换技，总是值得
      if (bid === 'yuedian' && game.alive().length >= 3 && p.hand.length >= 3) return { skill: s.id };
      if (bid === 'xinzhengcheng' && (p.marks.yue || 0) >= 5) return { skill: s.id };
      if (bid === 'jinxing' && p.hand.filter(c => !(CARD_META[c.name]?.cn || '').includes('火')).length >= 2) return { skill: s.id };
      if (bid === 'fenying' && p.chained && p.hp >= 3) return { skill: s.id };
      if (bid === 'shanhuo' && p.flags.fenyingUsed && p.hand.length >= 2) return { skill: s.id };
      if (bid === 'caiyao' && p.hand.length >= 3) return { skill: s.id };
      if (bid === 'xinggu' && p.hand.length >= 3 && enemies.length) return { skill: s.id };
      if (bid === 'suoxing' && !p.flags.suoxingUsed && (p.marks.xinzhiyu || 0) >= 4 && enemies.length) return { skill: s.id };
      if (bid === 'tiansha' && (p.marks.lieying || []).length >= 1 && enemies.length) return { skill: s.id };
      if (bid === 'yuehun' && (p.marks.yuechen || 0) >= 1 && p.hand.length >= 1 && !p.flags.yuehunCard) return { skill: s.id };
      if (bid === 'wanchao' && !p.flags.wanchaoUsed && (p.marks.D || 0) >= 1 && enemies.some(e => e.hand.length)) return { skill: s.id };
      // 已精确判定的技能：条件不满足时不再走通用兜底
      if (AI_PRECISE.has(bid)) continue;
      // 通用兜底：白名单外的主动技（族将/晋将/自定义将等新增技能）不再永不发动。
      // 条件：有敌人、手牌 ≥2、本回合该技能只尝试一次、45% 概率；失败会记日志但不会空转。
      const triedKey = `__aiAct_${s.id}_${game.turnCount}`;
      if (enemies.length && p.hand.length >= 2 && !p.flags[triedKey] && game.rng.next() < 0.45) {
        p.flags[triedKey] = true;
        return { skill: s.id };
      }
    }

    // 4) 无中生有 / 五谷 / 桃园
    for (const name of ['wuzhong', 'wugu', 'taoyuan']) {
      const c = p.hand.find(x => x.name === name);
      if (c) {
        const targets = name === 'wuzhong' ? [p] : game.candidatesFor(p, c);
        if (targets.length) return { card: c, targets };
      }
    }

    // 5) 顺手牵羊 / 过河拆桥
    for (const name of ['shunshou', 'guohe']) {
      const c = p.hand.find(x => x.name === name);
      if (c) {
        const cands = game.candidatesFor(p, c).filter(t => isEnemy(game, p, t) && (t.hand.length || Object.values(t.equips).some(Boolean)));
        if (cands.length) {
          const t = cands.sort((a, b) => b.hand.length - a.hand.length)[0];
          return { card: c, targets: [t] };
        }
      }
    }

    // 6) 杀（必须过 canUse，否则「本回合杀已用尽」时会被反复选中，刷出大量失败日志）
    const shaCards = p.hand.filter(c => c.name === 'sha');
    if (shaCards.length) {
      for (const c of shaCards) {
        const cands = game.candidatesFor(p, c).filter(t => isEnemy(game, p, t));
        if (cands.length) {
          const t = cands.sort((a, b) => a.hp - b.hp)[0];
          if ((t.hp <= 2 || game.rng.next() < this.aggression) && game.canUse(p, c, [t]).ok) {
            return { card: c, targets: [t] };
          }
        }
      }
    }
    // 虚拟杀（武圣等）：按牌价值从低到高取用，且不用【桃】【无懈】这类关键牌去换一次杀
    const virt = p.hand.filter(c => game.virtualAllowed(p, [c], 'sha') && value(c) <= 8);
    virt.sort((a, b) => value(a) - value(b));
    for (const c of virt) {
      const cands = game.candidatesFor(p, { name: 'sha' }).filter(t => isEnemy(game, p, t));
      if (cands.length && game.canUse(p, c, [cands[0]], 'sha').ok) return { card: c, asName: 'sha', targets: [cands[0]] };
    }

    // 7) 决斗 / 火攻 / 万箭 / 南蛮
    const juedou = p.hand.find(c => c.name === 'juedou');
    if (juedou && p.hand.length >= 2) {
      const cands = game.candidatesFor(p, juedou).filter(t => isEnemy(game, p, t));
      if (cands.length) return { card: juedou, targets: [cands.sort((a, b) => a.hand.length - b.hand.length)[0]] };
    }
    for (const name of ['wanjian', 'nanman']) {
      const c = p.hand.find(x => x.name === name);
      if (c) {
        const targets = game.candidatesFor(p, c);
        const hits = targets.filter(t => isEnemy(game, p, t)).length;
        const risks = targets.filter(t => isFriend(game, p, t) && t !== p).length;
        if (hits > risks) return { card: c, targets };
      }
    }
    const huogong = p.hand.find(c => c.name === 'huogong');
    if (huogong && p.hand.length >= 3) {
      const cands = game.candidatesFor(p, huogong).filter(t => isEnemy(game, p, t) && t.hand.length);
      if (cands.length) return { card: huogong, targets: [cands[0]] };
    }

    // 8) 乐不思蜀 / 兵粮寸断
    for (const name of ['lebu', 'bingliang']) {
      const c = p.hand.find(x => x.name === name);
      if (c) {
        const cands = game.candidatesFor(p, c).filter(t => isEnemy(game, p, t));
        if (cands.length) return { card: c, targets: [cands.sort((a, b) => b.hand.length - a.hand.length)[0]] };
      }
    }

    // 9) 借刀杀人
    const jiedao = p.hand.find(c => c.name === 'jiedao');
    if (jiedao) {
      const cands = game.candidatesFor(p, jiedao).filter(t => isEnemy(game, p, t));
      if (cands.length) return { card: jiedao, targets: [cands[0]] };
    }

    // 10) 闪电 / 铁索
    const shandian = p.hand.find(c => c.name === 'shandian');
    if (shandian && game.candidatesFor(p, shandian).includes(p)) return { card: shandian, targets: [p] };

    // 10.5) 铁索连环：能横置未连环的敌人就横置，否则重铸（弃置摸一张）
    const tiesuo = p.hand.find(c => c.name === 'tiesuo');
    if (tiesuo) {
      const chainedTargets = game.candidatesFor(p, tiesuo).filter(t => isEnemy(game, p, t) && !t.chained);
      if (chainedTargets.length) return { card: tiesuo, targets: chainedTargets.slice(0, 2) };
      return { card: tiesuo, recast: true };
    }

    return { endPhase: true };
  }

  async ask(game, p, req) {
    const enemies = game.alive().filter(x => x !== p && isEnemy(game, p, x));
    switch (req.kind) {
      case 'card': {
        const cands = (req.cards || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
        if (!cands.length) return null;
        // 濒死求桃：引擎的 ask 不带 targetSeat，从提示文本里取濒死者名字，
        // 避免给敌方出桃（原逻辑取不到玩家时一律出桃）
        const isTao = req.reason === 'dying' || /濒死/.test(req.prompt || '');
        if (isTao) {
          const m = /(.+?) 濒死/.exec(req.prompt || '');
          const dying = m ? game.players.find(x => x.name === m[1]) : null;
          const selfDying = p.hp <= 0 || dying === p;
          if (selfDying || !dying || isFriend(game, p, dying)) return { cardId: cands[0].id };
          return null;
        }
        if (req.reason === 'wuxie') {
          const targetSeat = req.extra?.targetSeat;
          const victim = targetSeat != null ? game.players[targetSeat] : null;
          if (victim && isFriend(game, p, victim) && !isFriend(game, p, req.extra?.fromSeat != null ? game.players[req.extra.fromSeat] : p)) {
            return { cardId: cands[0].id };
          }
          return game.rng.next() < 0.1 ? { cardId: cands[0].id } : null;
        }
        // 默认：血少必出，血多随机省牌
        if (p.hp <= 2) return { cardId: cands[0].id };
        if (game.rng.next() < 0.85) return { cardId: cands[0].id };
        return null;
      }
      case 'confirm': {
        // 「再次发动」类（界青囊红牌续发等）：手牌不多就别烧牌换血，否则弃光防御牌、
        // 会把对局拖成无意义的消耗战（实测 hulao 出现 568 回合僵局）。
        if (/再次发动|再发动/.test(req.prompt || '')) {
          return { yes: p.hand.length >= 5 && game.rng.next() < 0.35 };
        }
        // 明确正收益的被动技：枭姬摸两张、奸雄拿伤害牌、突袭/观星调整牌序
        if (/枭姬|奸雄|突袭|观星/.test(req.prompt || '')) return { yes: true };
        // 改判类（鬼才/鬼道）：只有自己濒死或判定明显不利时才考虑，避免无脑烧牌改判
        if (/鬼才|鬼道/.test(req.prompt || '')) return { yes: p.hp <= 2 && game.rng.next() < 0.35 };
        // 据守：手牌 ≤3 才发动（与规格的 AI 口径一致）
        if (/据守/.test(req.prompt || '')) return { yes: p.hand.length <= 3 };
        // 护驾/激将：血量健康时交给队友决定，不一律 yes
        if (/护驾|激将/.test(req.prompt || '')) return { yes: p.hp <= 2 || game.rng.next() < 0.5 };
        if (p.hp <= 1 && /闪|桃|杀/.test(req.prompt)) return { yes: true };
        return { yes: game.rng.next() < 0.7 };
      }
      case 'choice': {
        const opts = req.options || [];
        if (!opts.length) return { index: -1 };
        // 优先选择对自己有利的（顶/底、花色等）
        if (req.prompt.includes('观星')) return { index: 0 };
        if (req.prompt.includes('反间')) return { index: game.rng.int(opts.length) };
        if (req.prompt.includes('五谷')) return { index: 0 };
        return { index: 0 };
      }
      case 'targets': {
        const seats = (req.targets || []).map(s => game.players[s]).filter(Boolean);
        // 「交给/遗计/仁德」这类送牌目标要选队友，不能按“选敌人”的默认逻辑
        const giveAway = /交给|遗计|仁德|结姻/.test(req.prompt || '');
        const pool = giveAway ? seats.filter(t => isFriend(game, p, t)) : seats.filter(t => isEnemy(game, p, t));
        const chosen = (pool.length ? pool : seats).slice(0, Math.max(req.min || 1, 1));
        return { seats: chosen.map(t => t.seat) };
      }
      case 'discard': {
        const need = req.max || 1;
        const cards = (req.cards || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
        const sorted = cards.sort((a, b) => value(a) - value(b));
        return { cardIds: sorted.slice(0, need).map(c => c.id) };
      }
      case 'cards': {
        const cards = (req.cards || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean);
        const sorted = cards.sort((a, b) => value(a) - value(b));
        // 必须尊重 req.min/req.max：原实现固定返回 min(2,…)，调用方只按 max=1 处理时
        // 会拿到 2 张 → 第 2 张牌双存（手牌被 gain 走却仍留在原主手里）。
        const lo = Math.max(1, req.min || 1);
        const hi = Math.max(lo, req.max || lo);
        const n = Math.min(hi, sorted.length);
        return { cardIds: sorted.slice(0, n).map(c => c.id) };
      }
      default:
        return null;
    }
  }
}

export function makeAIResponder(seat) {
  const ai = new AIPlayer(seat);
  return {
    askPlay: (game, p) => ai.askPlay(game, p),
    ask: (game, p, req) => ai.ask(game, p, req),
  };
}
