import { makeRng } from './rng.js';
import { CARD_META, EQUIP_SUB, SUIT_CN, isRed, isRedFor, suitOf, cardName, cardLabel, buildDeck } from './cards.js';
import { collectTriggers, getSkill, effSkills, effHasSkill, GLOBAL_HELD_COLLECTORS, HELD_CONTAINERS } from './skill.js';
import { EXTRA_VIRTUAL_RULES } from './virtual-extra.js';
import { LIN_VIRTUAL_RULES } from './virtual-lin.js';
import { SHAN_VIRTUAL_RULES } from './virtual-shan.js';
import { YJ2011_VIRTUAL_RULES } from './virtual-yj2011.js';
import { YJ2012_VIRTUAL_RULES } from './virtual-yj2012.js';
import { HUO_VIRTUAL_RULES } from './virtual-huo.js';

export const PHASES = ['prepare', 'judge', 'draw', 'play', 'discard', 'end'];
export const PHASE_CN = { prepare: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束' };

// 女性武将（用于结姻/离间等性别判定）
const FEMALE = new Set([
  'zhenji', 'huangyueying', 'daqiao', 'sunshangxiang', 'diaochan',
  'jie_zhenji', 'jie_huangyueying', 'jie_daqiao', 'jie_sunshangxiang', 'jie_diaochan', 'mou_diaochan',
  'zhurong', 'caiwenji', 'zhangchunhua', 'wuguotai', 'wangyi', 'bulianshi', 'fuhuanghou', 'sunluban', 'hehuanghou', 'caifuren', 'mayunlu', 'zhangxingcai', 'zhugeguo',
]);

// 虚拟牌规则：技能允许把某些牌当作另一个牌名使用/打出
export const VIRTUAL_RULES = [
  { skill: 'wusheng', as: 'sha', test: (cards) => cards.length === 1 && isRed(cards[0]) },
  { skill: 'longdan', as: 'sha', test: (cards) => cards.length === 1 && cards[0].name === 'shan' },
  { skill: 'longdan', as: 'shan', test: (cards) => cards.length === 1 && cards[0].name === 'sha' },
  { skill: 'qingguo', as: 'shan', test: (cards) => cards.length === 1 && !isRed(cards[0]) },
  { skill: 'jijiu', as: 'tao', test: (cards) => cards.length === 1 && isRed(cards[0]) },
  { skill: 'qixi', as: 'guohe', test: (cards) => cards.length === 1 && !isRed(cards[0]) },
  { skill: 'jie_qixi', as: 'guohe', test: (cards) => cards.length === 1 && !isRed(cards[0]) },
  { skill: 'mou_wusheng', as: 'sha', test: (cards) => cards.length === 1 && isRed(cards[0]) },
  { skill: 'guose', as: 'lebu', test: (cards) => cards.length === 1 && cards[0].suit === 'diamond' },
  // ★【丈八蛇矛】不在此表：装备不在 player.skills 里，按 skill 名查的规则永远不成立（死规则）。
  //   已改为 virtualAllowed() 里对 equips.weapon.name==='zhangba' 的特判（主动使用 + respondCard 响应双路径）。
  { skill: 'longhun', as: 'shan', test: (cards) => cards.length === 2 && cards[0].suit === cards[1].suit && cards[0].suit === 'diamond' },
  { skill: 'longhun', as: 'tao', test: (cards) => cards.length === 2 && cards[0].suit === cards[1].suit && cards[0].suit === 'heart' },
  // 扩展点的规则（src/engine/virtual-extra.js）：新增转化技只改那个文件，不动本文件，避免并行分支冲突
  // ★EXTRA_VIRTUAL_RULES 不在这里展开：技能文件可能在 game.js 之后才 import 并 push，
  //   装载时展开会得到空快照（历史 bug：【环灭】等三条转化规则在 server 入口下是死代码）。
  //   改由 virtualAllowed() 运行期合并。
  ...LIN_VIRTUAL_RULES,
  ...SHAN_VIRTUAL_RULES,
  ...YJ2011_VIRTUAL_RULES,
  ...YJ2012_VIRTUAL_RULES,
  ...HUO_VIRTUAL_RULES,
];

export class Game {
  constructor(opts) {
    const { seats, mode, seed, responder, deckEntries, onLog, config = {} } = opts;
    this.mode = mode;
    this.config = config;
    this.rng = makeRng(seed);
    this.responder = responder;
    this.onLog = onLog || (() => {});
    this.seed = this.rng.seed;
    this.reqSeq = 0;
    this.logSeq = 0;
    this.logs = [];
    this.pending = null;
    this.over = false;
    this.result = null;
    this.turnCount = 0;
    this.currentIndex = 0;
    this.phase = null;
    this.turnPlayer = null;
    this.discardPile = [];
    this.table = []; // 处理区
    // 「移出游戏」区：技能把牌永久移出牌局时必须显式走 exileCards 记账，
    // 否则牌会凭空消失、牌张守恒无法校验（例：邓艾【急袭】移去一张「田」）。
    this.exilePile = [];
    this.extraQueue = []; // M12 额外回合队列

    this.players = seats.map((s, i) => {
      // 双将：seats 里可传 generals: [g1, g2]（或单个 general）。
      // 合并口径：技能取并集；体力上限/初始体力取平均值并向上取整；护甲取和。
      const gens = (Array.isArray(s.generals) && s.generals.length ? s.generals : (s.general ? [s.general] : [])).filter(Boolean);
      const dual = gens.length > 1;
      const hpOf = (g) => (typeof g?.hp === 'number' ? g.hp : 4);
      const armorOf = (g) => (typeof g?.armor === 'number' ? g.armor : 0);
      const maxHp = gens.length
        ? (dual ? Math.ceil(gens.reduce((a, g) => a + hpOf(g), 0) / gens.length) : hpOf(gens[0]))
        : 4;
      const armor = gens.reduce((a, g) => a + armorOf(g), 0);
      // 护甲上限：武将数据可单独声明 armorMax（如星·黄盖 0/6）；未声明时等于初始护甲（原行为）
      const armorMaxOf = (g) => (typeof g?.armorMax === 'number' ? g.armorMax : armorOf(g));
      const armorMax = gens.reduce((a, g) => a + armorMaxOf(g), 0);
      // 月标记上限：武将数据可声明 moonMax（手写稿武将名右侧的月亮图标数），未声明默认 10
      const moonMaxOf = (g) => (typeof g?.moonMax === 'number' && g.moonMax > 0 ? g.moonMax : 10);
      const moonMax = gens.length ? Math.max(...gens.map(moonMaxOf)) : 10;
      // 初始体力可与体力上限不同（谋黄盖 2/4）：general.hpNow
      const hpNow = (typeof gens[0]?.hpNow === 'number') ? gens[0].hpNow : null;
      const skillIds = [];
      for (const g of gens) for (const id of g.skills || []) if (!skillIds.includes(id)) skillIds.push(id);
      const main = gens[0];
      return {
        id: s.id, seat: i, name: s.name, isAI: !!s.isAI,
        generalId: main?.id || 'none',
        generalIds: gens.map(g => g.id),
        generalName: gens.length ? gens.map(g => g.name).join(' ＆ ') : (s.name || ''),
        gender: main?.gender || (FEMALE.has(main?.id) ? 'female' : 'male'),
        kingdom: main?.kingdom || 'qun',
        maxHp, hp: hpNow == null ? maxHp : Math.min(hpNow, maxHp),
        armor, armorMax, // 护甲：受到伤害时先扣护甲（armorMax 可高于初始护甲）
        moonMax,         // 月标记（☽）上限，见 engine/moon.js
        hand: [], equips: { weapon: null, armor: null, horsePlus: null, horseMinus: null, treasure: null },
        judgeZone: [], alive: true, role: s.role || null,
        skills: skillIds.map(id => getSkill(id)).filter(Boolean),
        // M4 双势力 / 入魔形态：kingdom2 = 第二势力（'wei'/'shu'…），form = 'normal' | 'demon'
        kingdom2: main?.kingdom2 || null,
        form: main?.form || 'normal',
        // M5 宗族：clan 为宗族标签（'xun'/'wang'…），同族角色共享宗族技
        clan: main?.clan || null,
        flags: {}, chained: false,
        flipped: false, // M2 翻面：true 表示背面朝上，下个回合整体跳过
        buqu: [],       // M9 不屈「创」：存置入的牌对象（点数用于判重）
        // M10 谋略值（「登峰造极」机制）：上限 5，有谋略值即视为拥有【妙计】（见 activeSkillsOf）
        moulue: Math.max(0, Math.min(5, main?.moulue || 0)), moulueMax: 5,
        // M12 天工·诸葛亮：武将牌旁的特殊牌位（「天机」/「谋」），牌同时视为你的手牌（标记 __tz）
        // 天机无上限：两个牌位都是数组
        extraZone: { tianji: [], mou: [] },
        // M8 隐匿技：true = 隐匿中（不能被其他角色指定为目标、不参与距离计算；使用牌后解除）
        hidden: !!main?.hidden,
        marks: {}, // 通用「标记」容器：技能自行增减（如 忍 / 创 / 锦 等），快照下发给前端展示
      };
    });
    this.players.forEach(p => {
      // 通用限定技/觉醒计数
      p.flags = {};
    });

    this.deck = buildDeck(deckEntries, this.rng);
    this.discardPile = [];
    this.round = 1;          // M12 「轮」：座位号回绕到更小时 +1
    this.playPhaseSeq = 0;   // 出牌阶段序号：每次进入出牌阶段（含额外阶段）+1，供 perPhase 主动技判重
    this._lastTurnSeat = null;
    this._lastTurnPlayer = null;

    // 模式初始化（身份、体力上限等）
    this.mode.setup?.(this);

    // 发牌
    for (const p of this.players) this.drawRaw(p, p.hp === 0 ? 4 : 4);
  }

  // ---------------- 查询工具 ----------------
  alive() { return this.players.filter(p => p.alive); }
  byId(id) { return this.players.find(p => p.id === id); }
  orderFrom(player, { includeSelf = true, dir = 1 } = {}) {
    const n = this.players.length;
    const start = player ? player.seat : this.currentIndex;
    const out = [];
    for (let k = includeSelf ? 0 : 1; k < n + (includeSelf ? 0 : 1); k++) {
      const p = this.players[(start + dir * k + n * 2) % n];
      if (p && p.alive) out.push(p);
      if (out.length >= this.alive().length) break;
    }
    return out;
  }
  distance(from, to) {
    if (!from || !to || from === to) return 0;
    // 连击弩炮（天工·诸葛亮【天工·造极】）：你与其他角色的距离视为 1
    if (from.flags?.lianji && to.alive !== false) return 1;
    const alive = this.alive().filter(x => !(x.hidden && x !== from && x !== to));   // M8 隐匿角色不参与距离计算
    const i = alive.indexOf(from), j = alive.indexOf(to);
    if (i < 0 || j < 0) return 99;
    const n = alive.length;
    const raw = Math.min(Math.abs(i - j), n - Math.abs(i - j));
    const data = { self: from, to, value: raw };
    // 坐骑修正（弩炮：无视其他角色的坐骑效果，且与所有角色距离 -1）
    const hasNupao = from.equips?.weapon?.name === 'nupao';
    if (to.equips.horsePlus && !hasNupao) data.value += 1;
    if (from.equips.horseMinus) data.value -= 1;
    if (hasNupao) data.value -= 1;
    // 技能级距离修正（公孙瓒【义从】/关索【撷芳】等）
    if (from.flags && from.flags.distanceMinus) data.value -= from.flags.distanceMinus;
    // 吴懿【奔袭】：回合内每使用一张牌距离-1（本回合内累加，turn.begin 清零）
    if (from.flags && from.flags.benxiMinus) data.value -= from.flags.benxiMinus;
    if (to.flags && to.flags.distancePlus) data.value += to.flags.distancePlus;
    this.triggerSync('distance.calc', data);
    return Math.max(1, data.value);
  }
  attackRange(p) {
    if (p.flags?.rangeOverride != null) return p.flags.rangeOverride;   // 张任【伏匿】：攻击范围始终为 0
    const wRange = p.equips.weapon ? (CARD_META[p.equips.weapon.name]?.range || 1) : 1;
    // 魔曹操【覆载】：装备区无武器时视为装备攻击范围等于当前体力值的武器牌
    const fz = (!p.equips.weapon && (this.effectiveSkills(p) || []).some(s => s.id === 'fuzai')) ? Math.max(1, p.hp) : 0;
    // rangeBonusArmor：【降怒】等「按护甲值动态计算」的加成走独立字段，
    // 不能写 rangeBonus —— 那是累加型字段（多处 +=1），用 `=` 会清掉别人的加成（SG029 BLOCKER-3）
    return Math.max(wRange, fz) + (p.flags?.rangeBonus || 0) + (p.flags?.rangeBonusArmor || 0);
  }
  inAttackRange(from, to) { return this.distance(from, to) <= this.attackRange(from); }

  // ==================== M10 谋略值 ====================
  // 官方口径（三国杀小程序「登峰造极」机制汇总）：
  //   谋略值上限 5 点；拥有谋略值的角色视为拥有【妙计】；
  //   【妙计】每名角色的回合限一次，消耗 1/2/3 点谋略值，视为使用【过河拆桥】/【无懈可击】/【无中生有】。
  // 获取点与上限行为按规则集：「若 (5-Y) 为 0 则无事发生；不小于 X 正常获得；大于 0 且小于 X 则改为获得 (5-Y)」。
  addMoulue(p, n = 1) {
    if (!p) return 0;
    const max = p.moulueMax ?? 5;
    const before = p.moulue || 0;
    p.moulue = Math.min(max, before + Math.max(0, n));
    return p.moulue - before;
  }
  useMoulue(p, n = 1) {
    if (!p || (p.moulue || 0) < n) return false;
    p.moulue -= n;
    return true;
  }
  hasMoulue(p) { return (p?.moulue || 0) > 0; }

  // 护甲增减（神黄盖【铁壁】把上限提到 10；无 armorMax 时按无上限处理）
  // ★护甲变化必须派发 armor.change（SG029 BLOCKER-3）：【降怒】的「攻击范围/出杀次数 +X（X=护甲值）」
  //   㟒挂 equip.change 监听是错的——护甲不是装备，护甲增减根本不会触发装备事件，数值永不刷新。
  async addArmor(p, n = 1) {
    if (!p) return 0;
    const cap = (p.armorMax || 0) > 0 ? p.armorMax : 99;
    const before = p.armor || 0;
    p.armor = Math.min(cap, before + Math.max(0, n));
    const d = p.armor - before;
    if (d !== 0) await this.trigger('armor.change', { self: p, delta: d, armor: p.armor });
    return d;
  }

  // 护甲直接赋值出口（技能里 `p.armor = n` 一律改走这里，保证派发 armor.change）
  async setArmor(p, n) {
    if (!p) return 0;
    const cap = (p.armorMax || 0) > 0 ? p.armorMax : 99;
    const before = p.armor || 0;
    p.armor = Math.max(0, Math.min(cap, n || 0));
    const d = p.armor - before;
    if (d !== 0) await this.trigger('armor.change', { self: p, delta: d, armor: p.armor });
    return d;
  }

  // 【妙计】：谋略值的通用消耗出口（出牌阶段主动技；无懈可击在响应时由 virtual-extra 规则处理）
  async activeMiaojii(player) {
    if (!this.hasMoulue(player)) { await this.log(`✗ ${player.name} 没有谋略值，无法发动【妙计】`); return false; }
    if (player.flags.act_miaojii === this.turnCount) { await this.log(`✗ 【妙计】本回合已发动过`); return false; }
    const opts = [];
    if (player.moulue >= 1) opts.push({ cost: 1, name: '过河拆桥', need: 'guohe' });
    if (player.moulue >= 3) opts.push({ cost: 3, name: '无中生有', need: 'wuzhong' });
    if (!opts.length) { await this.log(`✗ 谋略值不足（当前 ${player.moulue}）`); return false; }
    let pick = opts[0];
    if (opts.length > 1) {
      const idx = await this.chooseOne(player, opts.map(o => `消耗 ${o.cost} 点谋略值 → 【${o.name}】`),
        { prompt: `【妙计】当前谋略值 ${player.moulue}/5，请选择视为使用的牌` }, { optional: true });
      if (idx == null || idx < 0) return false;
      pick = opts[idx] || opts[0];
    }
    // 过河拆桥需要有牌可拆的目标，否则提前拦截（避免白扣谋略值）
    let targets = [];
    if (pick.need === 'guohe') {
      const cands = this.alive().filter(x => x !== player && this.zoneCards(x).length > 0);
      if (!cands.length) { await this.log(`✗ 【妙计】：场上没有可拆牌的角色`); return false; }
      const picks = await this.chooseTargets(player, {
        prompt: '【妙计·过河拆桥】选择一名区域内有牌的角色', candidates: cands, min: 1, max: 1, optional: false,
      });
      const t = picks[0];
      if (!t) return false;
      targets = [t];
    }
    this.useMoulue(player, pick.cost);
    player.flags.act_miaojii = this.turnCount;
    await this.log(`${player.name} 发动【妙计】：消耗 ${pick.cost} 点谋略值，视为使用【${pick.name}】（剩余 ${player.moulue}/5）`);
    const vcard = { id: `miaojii_${this.turnCount}_${pick.need}_${player.seat}`, name: pick.need, suit: null, num: 0, virtual: true };
    return await this.useCard({ from: player, card: vcard, targets, reason: 'miaojii', virtual: true });
  }

  // 角色「区域内的牌」（手牌 + 装备 + 判定区），供拆牌类技能判定可用目标
  zoneCards(p) {
    return [
      ...(p.hand || []),
      ...Object.values(p.equips || {}).filter(Boolean),
      ...(p.judgeZone || []),
    ];
  }

  // ==================== M12 「工」标记 + 「天机 / 谋」特殊牌位（天工·诸葛亮）====================
  gongOf(p) { return (p?.marks?.gong || 0); }
  addGong(p, n = 1) { if (!p) return 0; p.marks.gong = (p.marks.gong || 0) + n; return n; }
  useGong(p, n = 1) {
    if (!p || this.gongOf(p) < n) return false;
    p.marks.gong -= n;
    return true;
  }
  // 归一化特殊牌位（兼容旧的单值形态）
  normExtraZone(p) {
    if (!p) return { tianji: [], mou: [] };
    if (!p.extraZone || typeof p.extraZone !== 'object') p.extraZone = { tianji: [], mou: [] };
    for (const k of ['tianji', 'mou']) {
      const v = p.extraZone[k];
      if (!Array.isArray(v)) p.extraZone[k] = v ? [v] : [];
    }
    return p.extraZone;
  }
  // 把一张牌放到「天机」牌位：同时进入手牌（视为可用的手牌），并标记 __tz
  // 天机无上限：直接追加，不替换已有天机
  placeTianji(p, card) {
    if (!p || !card) return;
    const z = this.normExtraZone(p);
    z.tianji.push(card);
    card.__tz = 'tianji';
    delete card.__mou;
    if (!p.hand.includes(card)) p.hand.push(card);
  }
  // 每轮开始：把当轮所有「天机」转为「谋」（同一张牌换名牌位），返回转换的牌数组
  tianjiToMou(p) {
    const z = this.normExtraZone(p);
    if (!z.tianji.length) return [];
    const moved = z.tianji.splice(0, z.tianji.length);
    for (const c of moved) {
      delete c.__tz;
      c.__mou = true;
      z.mou.push(c);
    }
    return moved;
  }
  // 从特殊牌位移除并把牌置入弃牌堆（被弃置时）
  discardExtraCard(p, card) {
    if (!p || !card) return;
    const z = this.normExtraZone(p);
    for (const k of ['tianji', 'mou']) {
      const i = z[k].indexOf(card);
      if (i >= 0) z[k].splice(i, 1);
    }
    delete card.__tz;
    delete card.__mou;
    const i = p.hand.indexOf(card);
    if (i >= 0) p.hand.splice(i, 1);
    if (!this.discardPile.includes(card)) this.discardPile.push(card);
  }
  // 牌被使用/打出离手后清空牌位引用（牌已进处理区，不再弃置）
  clearExtraSlot(p, card) {
    if (!p || !card) return;
    const z = this.normExtraZone(p);
    for (const k of ['tianji', 'mou']) {
      const i = z[k].indexOf(card);
      if (i >= 0) z[k].splice(i, 1);
    }
    delete card.__tz;
    delete card.__mou;
  }
  // 使用/打出「天机」「谋」的代价：扣除 1 点体力 或 移除 1 个「工」标记（两者都不能付则不可用）
  async payForTianji(p) {
    const canHp = p.hp > 1;
    const canGong = this.gongOf(p) >= 1;
    if (!canHp && !canGong) return false;
    let useHp = true;
    if (canHp && canGong) useHp = await this.confirm(p, '【天机】：支付 1 点体力（取消则移除 1 个「工」标记）？');
    if (useHp) { await this.loseHp(p, 1, { reason: 'tianji' }); }
    else { this.useGong(p, 1); await this.log(`${p.name} 【天机】：移除 1 个「工」标记（剩余 ${this.gongOf(p)}）`); }
    return true;
  }
  // 无视防具：青釭剑，或技能置位（吴懿【奔袭】②：与所有角色距离均为 1 时无视防具）
  // 界黄忠【烈弓】①：使用【杀】时，可将「此牌点数」当作可及距离
  shaRangeByPoint(from, effName, card, to) {
    if (effName !== 'sha' || !card) return false;
    if (!(this.effectiveSkills(from) || []).some(s => s.id === 'jie_liegong')) return false;
    return this.distance(from, to) <= (card.num || 0);
  }

  // 陈到【往烈】①：出牌阶段使用的第一张牌无距离限制
  // 陆抗【决堰】·坐骑栏：本回合使用牌无距离限制
  freeRangeNow(player) {
    if (!player) return false;
    if (player.flags.freeRangeTurn === this.turnCount && this.turnPlayer === player) return true;
    return player?.flags?.wanglieFreeRange === this.turnCount
      && (player.flags.wanglieUsed || 0) === 0
      && this.turnPlayer === player;
  }

  // 张绣【雄乱】：本回合对指定角色使用牌无距离限制
  xiongluanFreeRange(player, to) {
    return !!player && !!to && player.flags.xiongluanSeat === to.seat
      && player.flags.xiongluanTurn === this.turnCount;
  }

  armorIgnored(from) {
    if (!from) return false;
    if (from.equips?.weapon?.name === 'qinggang') return true;
    return from.flags?.ignoreArmorTurn === this.turnCount;
  }

  // ---------------- 日志 ----------------
  async log(text, extra = {}) {
    const entry = { seq: ++this.logSeq, turn: this.turnCount, text, ...extra };
    this.logs.push(entry);
    this.onLog(entry);
    return entry;
  }

  // ---------------- 发牌 / 弃牌 ----------------
  // 牌堆底（数组头部）：许攸【寸目】等「从牌堆底摸牌」
  popDeckBottom(n = 1) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (!this.deck.length) {
        if (!this.discardPile.length) break;
        this.deck = this.rng.shuffle(this.discardPile);
        this.discardPile = [];
        this.flags = this.flags || {};
        this.flags.shuffled = (this.flags.shuffled || 0) + 1;   // 记录「洗过牌」（杨彪【昭汉】等）
      }
      out.push(this.deck.shift());
    }
    return out;
  }
  popDeck(n = 1) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (!this.deck.length) {
        if (!this.discardPile.length) break;
        this.deck = this.rng.shuffle(this.discardPile);
        this.discardPile = [];
        this.flags = this.flags || {};
        this.flags.shuffled = (this.flags.shuffled || 0) + 1;   // 记录「洗过牌」（杨彪【昭汉】等）
      }
      out.push(this.deck.pop());
    }
    return out;
  }
  drawRaw(player, n) {
    const cards = this.popDeck(n);
    if (player) player.hand.push(...cards);
    return cards;
  }
  async drawCards(player, n, { reason = 'draw', toPublic = false } = {}) {
    if (n <= 0) return [];
    const data = { self: player, count: n, reason };
    await this.trigger('cards.draw', data);
    const cards = (player && player.flags.drawFromBottom)
      ? this.popDeckBottom(data.count)
      : this.popDeck(data.count);
    if (player) {
      player.hand.push(...cards);
      await this.log(`${player.name} 摸了 ${cards.length} 张牌${toPublic ? '（' + cards.map(cardLabel).join('、') + '）' : ''}`);
    }
    await this.trigger('cards.draw.after', { self: player, cards, reason });
    return cards;
  }
  // 把一张牌从它当前所在的**任何**区域摘下（牌堆/弃牌堆/处理区/某人的手牌·装备·判定区）。
  // 用于「置于牌堆顶」「获得你使用的牌」等场景，避免同一张牌同时存在于两个区域。
  async takeCard(card) {
    if (!card) return false;
    let moved = false;
    const owners = [];   // 记住这张牌原本在谁的区域，用于派发 cards.lose
    const ti = (this.table || []).indexOf(card);
    if (ti >= 0) { this.table.splice(ti, 1); moved = true; }
    const di = this.discardPile.indexOf(card);
    if (di >= 0) { this.discardPile.splice(di, 1); moved = true; }
    const ki = this.deck.indexOf(card);
    if (ki >= 0) { this.deck.splice(ki, 1); moved = true; }
    for (const q of this.players) {
      const hi = q.hand.indexOf(card);
      if (hi >= 0) { q.hand.splice(hi, 1); moved = true; owners.push(q); continue; }
      let eqHit = false;
      for (const k of Object.keys(q.equips)) {
        if (q.equips[k] === card) {
          q.equips[k] = null;
          await this.trigger('equip.lose', { self: q, card, slot: k });
          eqHit = true; moved = true; owners.push(q);
        }
      }
      if (eqHit) continue;
      const ji = (q.judgeZone || []).findIndex(z => z.card === card);
      if (ji >= 0) { q.judgeZone.splice(ji, 1); moved = true; owners.push(q); }
    }
    for (const q of owners) await this.trigger('cards.lose', { self: q, cards: [card], reason: 'takeCard' });
    return moved;
  }
  // 统一的「进入弃牌堆」入口：同一张牌（同一对象引用）不得在弃牌堆里出现两次。
  // 历史上多处直接 push（死亡弃牌、使用后结算、判定牌）会把已经在弃牌堆里的牌再推一次，
  // 造成牌张被复制（牌总数随对局缓慢增长）。所有新代码请走这里。
  // 牌当前是否存在于某个区域（牌堆/处理区/某人的手牌·装备·判定区），不含弃牌堆
  cardLocated(card) {
    if (!card) return false;
    if (this.deck.includes(card)) return true;
    if ((this.table || []).includes(card)) return true;
    return this.players.some(q => q.hand.includes(card)
      || Object.values(q.equips).includes(card)
      || (q.judgeZone || []).some(z => z.card === card));
  }
  // 「移出游戏」：牌永久离开牌局（不入弃牌堆），只做记账，供牌张守恒校验。
  exileCards(cards) {
    const list = (Array.isArray(cards) ? cards : [cards]).filter(Boolean);
    let n = 0;
    for (const c of list) {
      if (this.exilePile.includes(c)) continue;
      this.exilePile.push(c);
      n++;
    }
    return n;
  }
  pushDiscard(cards) {    const list = (Array.isArray(cards) ? cards : [cards]).filter(Boolean);
    let n = 0;
    for (const c of list) {
      if (c && c.name === 'ying') { this.exileCards([c]); continue; }   // 【影】进入弃牌堆后销毁
      Game.stripCardMarks(c);
      if (!this.discardPile.includes(c)) { this.discardPile.push(c); n++; }
    }
    return n;
  }
  // 这张牌当前是否已经存在于任一标准区域（含牌堆 / 弃牌堆 / 移出区 / 各玩家区域）
  // 用于「技能把暂存区的牌移去」这类结算：若牌其实还在别处（引用/未摘除），就不能再推一次弃牌堆，
  // 否则同一张牌会同时存在于牌堆与弃牌堆（SG029 实测 seed 9144 c16）。
  inAnyZone(card) {
    if (!card || typeof card !== 'object') return false;
    // ★按 id 比对（含 __src 源牌 id）：引擎会造「同 id 的副本对象」（game.js 虚拟牌 / jie.js 转化牌），
    //   只比对象身份会漏判 → 同一张牌在 table 与手牌各一份时仍判 orphan，重复入堆造成双存（SG030 A4.1）
    const ids = new Set([String(card.id)]);
    if (card.__src && card.__src.id != null) ids.add(String(card.__src.id));
    const hit = (arr) => Array.isArray(arr) && arr.some(c => c && c.id != null && ids.has(String(c.id)));
    if (hit(this.deck) || hit(this.discardPile) || hit(this.exilePile) || hit(this.table)) return true;
    for (const p of this.players || []) {
      if (hit(p.hand) || hit(Object.values(p.equips || {})) ) return true;
      // ★判定区也按 id 比对（SG032 A4.1）：判定区存的是 { card, name } 包装，且里面常是副本对象
      if ((p.judgeZone || []).some(z => z && z.card && z.card.id != null && ids.has(String(z.card.id)))) return true;
      if (hit(p.buqu) || hit(p.quan) || hit(p.si)) return true;
    }
    return false;
  }

  // 只有「哪儿都不在」的牌才入弃牌堆（幂等），返回是否真的入堆
  pushDiscardIfOrphan(card) {
    if (!card || typeof card !== 'object') return false;
    if (this.inAnyZone(card)) return false;
    this.discardPile.push(card);
    return true;
  }

  // 兑现 cards.discard 里的 taken 契约：技能声明「接走」的牌不应留在弃牌堆。
  // useCard / respondCard 是「先入堆再派发事件」的路径（与 discardCards 相反），
  // 若不在这里摘除，牌会同时存在于弃牌堆与技能的新区域（例：曹植【落英】获得自己弃置的梅花【杀】）。
  settleTaken(data) {
    const taken = (data && data.taken) || [];
    for (const c of taken) {
      if (!c) continue;
      const k = this.discardPile.lastIndexOf(c);
      if (k >= 0) this.discardPile.splice(k, 1);
    }
  }

  async discardCards(player, cards, { reason = 'discard', silentLog = false } = {}) {
    const list = cards.filter(Boolean);
    if (!list.length) return;
    // taken：技能可在 cards.discard 里「接走」某些牌（如【游医】置入“仁”区），
    // 接走的牌不再进入弃牌堆，否则会同时存在于两个区域（牌张被复制）。
    // kept：技能声明「这张牌留在原主区域、本批不弃置」（例：【笛音】把正在弃置的手牌留在手里）。
    //   ★与 taken 的区别：taken = 牌被移去别处，仍从原区域摘除；kept = 牌不离开原区域，也不入堆。
    //   此前笛音用手牌分支写 taken，导致牌从手牌被 splice 掉又不进弃牌堆 → 牌凭空消失。
    const data = { self: player, cards: list, reason, taken: [], kept: [] };
    await this.trigger('cards.discard', data);
    const taken = data.taken || [];
    const kept = new Set(data.kept || []);
    // 技能若在 cards.discard 里把牌 gain 走（from = 原主），牌已不在原主区域，
    // 此时不应再进弃牌堆（否则与新手牌区双存）。taken 用于「牌仍在原主区域但被技能接管」的场景。
    const stillOwned = new Set(list.filter(c => player && (
      player.hand.includes(c)
      || Object.values(player.equips).includes(c)
      || (player.judgeZone || []).some(z => z.card === c)
    )));
    // 防御：技能可能在 cards.discard 里把「正在被弃置的牌」又加回原主手牌，造成同一对象出现两份；
    // 这种情况下 indexOf 只删第一份，会留下「手牌 + 弃牌堆」双存（例：【笛音】抓回本批弃置的牌）。
    if (player) {
      for (const c of list) {
        let first = player.hand.indexOf(c);
        while (first >= 0) {
          const second = player.hand.indexOf(c, first + 1);
          if (second < 0) break;
          player.hand.splice(second, 1);
        }
      }
    }
    for (const c of list) {
      // kept：牌留在原主区域，既不摘除也不入弃牌堆
      if (kept.has(c)) continue;
      if (player) {
        const i = player.hand.indexOf(c);
        if (i >= 0) player.hand.splice(i, 1);
        else {
          for (const k of Object.keys(player.equips)) {
            if (player.equips[k] === c) {
              player.equips[k] = null;
              // afterEquipLose 由 trigger 出口统一调用（SG034），此处不再重复
              await this.trigger('equip.lose', { self: player, card: c, slot: k });
            }
          }
          const j = player.judgeZone.findIndex(z => z.card === c);
          if (j >= 0) player.judgeZone.splice(j, 1);
        }
      }
      if (taken.includes(c)) continue;
      // 牌若已不在原主区域、但确实出现在别的区域（被技能 gain/置顶走了），则不再进弃牌堆；
      // 若两处都没有（如技能从牌堆取出后弃置），仍应正常进弃牌堆。
      if (player && !stillOwned.has(c) && this.cardLocated(c)) continue;
      Game.stripCardMarks(c);   // 弃置即失去该次持有带来的牌级豁免（SG032 A4.2）
      if (!this.discardPile.includes(c)) this.discardPile.push(c);
    }
    // 日志只列真正离开原区域的牌（kept 的牌并未被弃置）
    const gone = kept.size ? list.filter(c => !kept.has(c)) : list;
    if (player && gone.length && !silentLog) await this.log(`${player.name} 弃置了 ${gone.map(cardLabel).join('、')}`);
    // cards.lose：角色「失去牌」（弃置 / 被获得 / 被移走）。
    // ★此前只在 VALID_EVENTS 注册、引擎从不派发，监听它的技能（如【沙城】统计本回合失去的牌数）是死代码。
    //   口径：牌离开该角色的手牌/装备区/判定区即算失去；「使用牌」不算（走 pushDiscard，不经过这里）。
    if (player && gone.length) await this.trigger('cards.lose', { self: player, cards: gone, reason });
    if (player) await this.checkHandChange(player);
  }
  async gainCards(player, cards, { from = null, reason = 'gain', toHand = true } = {}) {
    const list = cards.filter(Boolean);
    if (!list.length) return;
    for (const c of list) {
      if (from) {
        const i = from.hand.indexOf(c);
        if (i >= 0) from.hand.splice(i, 1);
        else {
          for (const k of Object.keys(from.equips)) {
            if (from.equips[k] === c) {
              from.equips[k] = null;
              await this.trigger('equip.lose', { self: from, card: c, slot: k });
            }
          }
          // 判定区的牌被顺走/获得时也要移出判定区，否则同一张牌会同时存在于两处
          const j = from.judgeZone.findIndex(z => z.card === c);
          if (j >= 0) from.judgeZone.splice(j, 1);
        }
      }
      if (toHand) player.hand.push(c);
      Game.stripCardMarks(c);   // 换手后不再继承上一持有者的牌级豁免（SG032 A4.2）
    }
    await this.log(`${player.name} 获得了 ${list.length} 张牌${from ? `（来自 ${from.name}）` : ''}`);
    if (from && list.length) await this.trigger('cards.lose', { self: from, cards: list, reason });
    await this.trigger('cards.gain', { self: player, from, cards: list, reason });
  }

  // ---------------- 判定 ----------------
  async judge(player, { reason = 'judge', from = null, card = null } = {}) {
    const c = this.popDeck(1)[0];
    if (!c) return { suit: 'spade', num: 1, card: null };
    const data = { self: player, card: c, suit: c.suit, num: c.num, reason, from, source: card, canceled: false };
    await this.trigger('judge.before', data);
    await this.log(`${player.name} 判定（${reason}）：${cardLabel(c)}${data.suit !== c.suit || data.num !== c.num ? ' → 改为 ' + SUIT_CN[data.suit] + data.num : ''}`);
    this.pushDiscard(c);
    await this.trigger('judge.after', data);
    return data;
  }

  // ---------------- 体力 ----------------
  async recover(player, n = 1, { from = null, card = null, reason = 'recover' } = {}) {
    if (!player.alive) return 0;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + n);
    const gain = player.hp - before;
    await this.trigger('hp.recover', { self: player, from, count: gain, card, reason });
    if (gain > 0) await this.log(`${player.name} 回复 ${gain} 点体力（${player.hp}/${player.maxHp}）`);
    return gain;
  }
  async loseHp(player, n = 1, { reason = 'lose', from = null } = {}) {
    if (!player.alive) return;
    player.hp -= n;
    await this.trigger('hp.lose', { self: player, count: n, from, reason });
    await this.log(`${player.name} 失去 ${n} 点体力（${player.hp}/${player.maxHp}）`);
    if (player.hp <= 0) await this.dying(player, { from });
  }

  // ---------------- 伤害 ----------------
  async damage({ from, to, amount = 1, nature = 'normal', card = null, reason = 'damage' }) {
    if (!to || !to.alive) return;
    const data = { self: to, to, from, amount, nature, card, reason, canceled: false };
    // 防具（装备区的 armor 槽）
    const armorCard = this.armorIgnored(from) ? null : to.equips.armor;
    if (armorCard && armorCard.name === 'tengjia' && nature === 'fire') data.amount += 1;
    if (armorCard && armorCard.name === 'baiyin' && data.amount > 1) data.amount = 1;
    // 宝物【太平要术】：锁定技，防止你受到的火属性伤害
    if (to.equips?.treasure?.name === 'taiping' && nature === 'fire') {
      data.canceled = true;
      data.amount = 0;
      await this.log(`${to.name} 的【太平要术】防止了 ${amount} 点火属性伤害`);
    }
    await this.trigger('damage.before', data);
    if (data.canceled || data.amount <= 0) { await this.log(`${to.name} 免受伤害`); return; }
    // 伤害转移（小乔【天香】）：damage.before 阶段可把 data.to 改到另一名角色，伤害来源不变。
    // 转移后按新目标结算护甲/扣血/后续事件，原目标不再受伤。
    let victim = to;
    if (data.to && data.to !== to && data.to.alive) {
      victim = data.to;
      data.self = victim;
      await this.log(`伤害转移：${to.name} → ${victim.name}`);
    }
    // 护甲（双将初始护甲取和）：先扣护甲，护甲不足再扣体力
    if (victim.armor > 0) {
      const absorbed = Math.min(victim.armor, data.amount);
      victim.armor -= absorbed;
      await this.trigger('armor.change', { self: victim, delta: -absorbed, armor: victim.armor });
      data.amount -= absorbed;
      data.armorAbsorbed = absorbed;
      await this.log(`${victim.name} 的护甲抵挡 ${absorbed} 点伤害（护甲剩余 ${victim.armor}）`);
      if (data.amount <= 0) { await this.trigger('damage.after', data); return; }
    }
    victim.hp -= data.amount;
    await this.log(`${victim.name} 受到 ${data.amount} 点${nature === 'fire' ? '火焰' : nature === 'thunder' ? '雷电' : ''}伤害（${victim.hp}/${victim.maxHp}）${from ? '，来源：' + from.name : ''}`);
    await this.trigger('damage.after', data);
    // 转移类技能（如【天香】）的后续结算（摸牌等）在伤害完全结算后执行
    if (typeof data.afterDamage === 'function') await data.afterDamage();
    // 铁索连环：先解除所有相关角色的连环，再逐一传导。
    // 原逻辑边传导边保留 chained，A 传导给 B 后 B 又向仍处于连环的 A 传导，无限递归直至栈溢出。
    if (victim.chained && (nature === 'fire' || nature === 'thunder')) {
      const chained = this.alive().filter(p => p !== victim && p.chained);
      victim.chained = false;
      for (const p of chained) p.chained = false;
      for (const p of chained) {
        await this.log(`连环传导：${p.name}`);
        await this.damage({ from, to: p, amount: data.amount, nature, card, reason: 'tiesuo' });
      }
    }
    if (victim.hp <= 0) await this.dying(victim, { from, card });
  }

  // ---------------- 濒死 / 死亡 ----------------
  async dying(player, { from = null, card = null } = {}) {
    if (!player.alive) return;
    await this.trigger('dying.begin', { self: player, from });
    await this.log(`⚕ ${player.name} 进入濒死状态（${player.hp}/${player.maxHp}）`);
    // M9 不屈（周泰）：进入濒死之后、正常求桃之前，翻一张牌堆顶为「创」。
    // 点数不重复 → 体力回复至 1，脱离濒死且不再求桃；点数重复 → 该牌弃置、清空全部「创」，继续常规求桃。
    if (player.hp <= 0 && (this.effectiveSkills(player) || []).some(s => s.id === 'buqu')) {
      const flipped = this.popDeck(1)[0];
      if (flipped) {
        if (!player.buqu) player.buqu = [];
        const nums = player.buqu.map(x => (typeof x === 'number' ? x : x.num));
        if (!nums.includes(flipped.num)) {
          player.buqu.push(flipped);
          player.hp = 1;
          await this.log(`${player.name} 发动【不屈】，翻出 ${cardLabel(flipped)}（创 ${player.buqu.length}），体力回复至 1`);
        } else {
          this.pushDiscard(flipped);
          await this.log(`${player.name} 的【不屈】翻出 ${cardLabel(flipped)}，点数重复，弃置全部「创」`);
          for (const old of player.buqu) if (!this.discardPile.includes(old)) this.discardPile.push(old);
          player.buqu = [];
        }
      }
    }
    let guard = 0;
    while (player.hp <= 0 && guard++ < 20) {
      let saved = false;
      // 官方口径：从「当前回合角色」起按行动顺序依次询问，而不是从濒死者自己起问
      const start = (this.turnPlayer && this.turnPlayer.alive) ? this.turnPlayer : player;
      // 贾诩【完杀】（锁定技，引擎内建）：拥有者回合内，除他以外只有濒死者本人可以使用【桃】
      const wanshaOwner = this.players.find(x => x.alive && (this.effectiveSkills(x) || []).some(s => s.id === 'wansha') && x === this.turnPlayer) || null;
      for (const p of this.orderFrom(start)) {
        if (!p.alive) continue;
        if (p.hp <= 0) continue;
        if (wanshaOwner && p !== wanshaOwner && p !== player) continue;
        const c = await this.respondCard(p, {
          filter: { name: 'tao' }, reason: 'dying', optional: true,
          prompt: `${player.name} 濒死，是否使用【桃】？`,
        });
        if (c) {
          await this.recover(player, 1, { from: p, card: c, reason: 'dying' });
          saved = true;
          break;
        }
      }
      if (!saved) break;
    }
    await this.trigger('dying.end', { self: player, from });
    if (player.hp <= 0) await this.die(player, { from });
  }

  // 技能私有容器回收（牌张守恒，SG028）：
  // 把「挂在玩家身上、但不在 hand/equips/judgeZone/buqu 任何标准区域」的牌退回弃牌堆。
  //   ① 技能可在注册对象（defineSkill 的对象）上声明 `heldCards: (player) => [card...]`，
  //      引擎在该角色死亡 / 失去技能时统一调用 —— 这是新增的通用契约，
  //      以后新写「扣置 / 寄放 / 托管」类技能必须声明它，否则目标先死就丢牌；
  //   ② 内置兜底处理已知容器（目前是【笔伐】的 bifaStack）。
  // 判定「这看起来是一张牌对象」（id + name 都有）
  static looksCard(x) {
    return !!x && typeof x === 'object' && x.id != null && typeof x.name === 'string';
  }

  // 清除「牌级一次性豁免」标记（SG032 A4.2 / SG033 P1-4）：
  // 【刺北】给「以此法获得的【杀】」打上 ignoreShaLimit / ignoreRange，作为**该次持有**的属性。
  // 若不清除，牌进弃牌堆重洗后被别人摸到，仍免次数/免距离；`{...card}` 副本也会继承。
  // 调用点：useCard 结算后、discardCards、gainCards（换手）、pushDiscard（入堆）。
  static stripCardMarks(c) {
    if (!c || typeof c !== 'object') return c;
    if (c.ignoreShaLimit) delete c.ignoreShaLimit;
    if (c.ignoreRange) delete c.ignoreRange;
    return c;
  }

  // 从一个「技能私有容器」里把牌取出来（返回 {cards, keep}）
  //   · 裸牌数组：[{id,name,suit,num}...]        → 取牌、不保留
  //   · 寄存项：[{ownerId, card}] / [{owner, cards:[...]}] → 取其中牌、整项丢弃
  //   · 其它元素（id 数字 / 花色串 / 记录对象）    → 原样保留
  _sweepHeldArr(arr) {
    const out = [], keep = [];
    for (const it of arr || []) {
      if (Game.looksCard(it)) { out.push(it); continue; }
      if (it && Game.looksCard(it.card)) { out.push(it.card); continue; }
      if (it && Array.isArray(it.cards)) {
        let took = false;
        for (const c of it.cards) if (Game.looksCard(c)) { out.push(c); took = true; }
        if (took) continue;
      }
      keep.push(it);
    }
    return { cards: out, keep };
  }

  // onlyOwners：只回收这些技能 id 名下的容器（removeSkills 用）。
  // 传 null = 全量回收（死亡 / 失去全部技能 / disableSkills）。
  async reclaimHeld(player, { onlyOwners = null, holderDead = false } = {}) {
    if (!player) return 0;
    const owners = onlyOwners ? new Set([].concat(onlyOwners)) : null;
    const owned = (id) => !owners || owners.has(id);
    // ★owner 可以是数组（SG033 P1-3：一个容器被多个技能写入，如 kuangzuo =
    //   tongyin/chengfeng 写、kuangzuo 消耗；只登记一个 id 会导致「删 A 漏清、删 B 误清」）
    // ★语义（SG034）：单 owner = 该技能被删就回收；多 owner = **全部**被删才回收
    //   （OR 语义会让「删【统荫】」误清仍被【承奉】使用的「匡祚」）。
    const ownedSpec = (owner) => {
      if (!owners) return true;                       // 全量回收（死亡 / 失去全部技能）
      const list = [].concat(owner || []);
      if (!list.length) return true;
      if (list.length === 1) return owners.has(list[0]);
      // 多 owner：只有「玩家身上已不再拥有其中任何一个」时才回收。
      //   不能写成 every(x => owners.has(x))：逐个删技能时永远凑不齐（T52c 实测不回收）。
      const stillHas = (id) => (player.skills || []).some(x => x && x.id === id);
      return list.every(id => !stillHas(id));
    };
    const taken = [];
    // ① 技能显式声明 reclaimCards(player) => [card...]（取牌 + 清空自己的容器，一步完成）：
    //    「把牌放在武将牌旁 / 移出游戏」的技能必须声明它，否则角色死亡或失去技能后
    //    这些牌没有任何结算路径，会永久滞留（SG028 第③组）。
    for (const sk of player.skills || []) {
      if (owners && !owners.has(sk && sk.id)) continue;
      const fn = typeof sk.reclaimCards === 'function' ? sk.reclaimCards
        : (typeof sk.heldCards === 'function' ? sk.heldCards : null);
      if (!fn) continue;
      let got = [];
      try {
        const r = fn(player);
        if (Array.isArray(r)) got = r;
        else if (r != null) await this.log(`⚠ 技能 ${sk.id} 的回收声明未返回数组，已跳过`);
      } catch { got = []; }
      for (const c of got) if (c) taken.push(c);
    }
    // ② 全局常驻回收函数（与 player.skills 无关）：断肠/万利/断肠2/蹈节 等会直接 `p.skills = []`，
    //    若声明只挂在技能对象上，技能一被删声明就消失、容器里的牌永久滞留（SG029 BLOCKER-2 实测 quan 滞留）。
    //    这些函数只看「玩家身上是否真有该容器」，技能已失去时仍能正确回收，重复调用幂等。
    const declared = new Set((player.skills || []).map(s => s && s.id));
    for (const c of GLOBAL_HELD_COLLECTORS) {
      if (declared.has(c.id)) continue;   // ①已按技能实例处理过
      if (!owned(c.id)) continue;         // 只回收「被删技能」名下的容器（SG030 A2）
      let got = [];
      try {
        const r = c.fn(player);
        // 防呆：回收函数必须是同步返回数组（返回 Promise / 对象会让引擎在 `for…of` 处直接抛错，
        // 进而把整局打断——SG029 实测 seed34 即因此「局内抛错：got is not iterable」）
        if (Array.isArray(r)) got = r;
        else if (r != null) await this.log(`⚠ 回收函数 ${c.id} 未返回数组，已跳过`);
      } catch { got = []; }
      for (const x of got) if (x) taken.push(x);
    }
    // ③ 集中声明的持有型容器（skills/held-reclaim.js）：与技能是否还在身上无关，容器空了即跳过
    for (const spec of HELD_CONTAINERS) {
      if (spec.owner && !ownedSpec(spec.owner)) continue;   // 只回收被删技能名下的容器
      // ★crossPlayer（SG034 P1）：牌被放在**别人**身上的容器（【破军】「军」、【破军】「寇」），
      //   施放者阵亡/失技时，容器在目标身上、没人回收 → 牌永久滞留。故这类要遍历所有玩家。
      const holders = spec.crossPlayer ? (this.players || []) : [player];
      for (const holder of holders) {
        if (!holder) continue;
        let arr = null;
        try { arr = spec.get(holder); } catch { arr = null; }
        if (!Array.isArray(arr) || !arr.length) {
          if (spec.alwaysClear) { try { spec.clear(holder, [], []); } catch { /* ignore */ } }
          continue;
        }
        // ★SG035-r2 P1 / SG036 P0：crossPlayer 容器里可能混着多个施放者的牌（A、B 都【破军】过同一目标）。
        //   ① holder 就是本次被回收的玩家 → 他身上的牌全部要退（持牌者死亡时，尸体上不能留牌，无论谁扣的）；
        //   ② holder 是别人 → 只退「自己扣的」那批（否则无关角色死亡/失技会把全桌的牌一起扫进弃牌堆）。
        //   无 heldFrom 标记的按旧行为回收（宁可回收，避免滞留）。
        const mineOf = (c) => {
          // ★SG036-r2 P1：crossPlayer 但**没声明 fromSeat** 的容器无法判断归属 → 只回收自己身上的，
          //   不能「任何角色失技就扫全桌」（宁可漏收，漏收会被 heldleak 门禁抓出来，扫全桌是静默丢牌）。
          if (spec.crossPlayer && typeof spec.fromSeat !== 'function') return holder === player;
          if (!spec.crossPlayer) return true;
          const from = spec.fromSeat(c);
          if (from == null) return true;
          //    ★holderDead 才代表「持牌者本人已死」；仅仅失去技能时不能把别人扣在他身上的牌扫走（SG036-r2 P1）
          return (holder === player && holderDead) || from === player.seat;
        };
        const arrMine = spec.crossPlayer ? arr.filter(mineOf) : arr;
        if (!arrMine.length) continue;   // 全是别人扣置、且持牌者还活着：一张都不动
        const { cards, keep } = this._sweepHeldArr(arrMine);
        if (!cards.length) {
          // 「只清不返回」型容器（虚拟牌 / 合成牌，如 extraWeaponCard、guifu）也必须清空，
          // 否则失去技能后容器里的虚拟牌一直挂着（它不是真牌，不能入弃牌堆）
          if (spec.alwaysClear) { try { spec.clear(holder, [], keep); } catch { /* ignore */ } }
          continue;
        }
        for (const c of cards) taken.push(c);
        // clear 收到「本次真正取走的牌」，供混合型容器精确剔除（否则整体置空会误删引用项）
        try { spec.clear(holder, cards, keep); } catch { /* 容器形态不符时忽略 */ }
      }
    }
    // ④ 内置已知容器：【笔伐】bifaStack（无 owner 归属，只在全量回收时处理）
    const stack = owners ? [] : (player.bifaStack || []);
    if (stack.length) {
      for (const r of stack) if (r && r.card) taken.push(r.card);
      player.bifaStack = [];
      const m = { ...(player.marks || {}) };
      delete m.bifa;
      player.marks = m;
    }
    // ③ ★不做「通用扫描」：容器里既可能是「拥有」的牌（扣置/寄存，需回收），
    //   也可能是「引用」的记录（如 clan3 的 rec.cards 记已用牌，牌早已在弃牌堆），
    //   静态无法区分 —— 一律扫描会把引用再推一次弃牌堆，造成「牌张重复」（实测 5 个 sim 立刻报错）。
    //   因此私有容器必须由技能显式声明 heldCards(player) => [card...]（见 ①）。
    // ④ 入弃牌堆（去重，且避免与控制区已有牌重复）
    const uniq = [];
    const seen = new Set();
    for (const c of taken) {
      if (!c || typeof c !== 'object') continue;
      // ★牌仍在其它标准区域 → 只是「引用」而非「拥有」，摘除容器即可，绝不能再推一次弃牌堆
      //   （否则同一张牌会同时存在于牌堆与弃牌堆；SG029 实测 seed 9144 即因此 c16 双存）
      // ★必须走 inAnyZone（按 id + __src 比对，SG032 A4.1）：原先这里用对象身份 includes，
      //   而引擎会造「同 id 的副本对象」（game.js 虚拟牌 / jie.js 转化牌），
      //   实测 __src 副本 + 实体已在弃牌堆 → 同一张牌被入堆两次（real1, real1）。
      if (this.inAnyZone(c)) continue;
      if (uniq.some(x => x && x.id != null && String(x.id) === String(c.id))) continue;
      const key = String(c.id);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(c);
    }
    if (uniq.length) { this.pushDiscard(uniq); await this.log(`${player.name} 的扣置牌 ${uniq.length} 张置入弃牌堆`); }
    return uniq.length;
  }

  // 统一「失去技能」出口（SG029 BLOCKER-2）：
  // 直接写 `p.skills = []` 会绕过持有型容器回收（断肠后 quan 永久滞留、之后再死也不回收），
  // 凡「永久失去某技能 / 全部技能」的结算都必须走这里。ids 为 null 表示失去全部。
  async removeSkills(player, ids = null) {
    if (!player) return 0;
    const before = (player.skills || []).length;
    if (ids == null) {
      player.skills = [];
    } else {
      const want = new Set([].concat(ids));
      player.skills = (player.skills || []).filter(s => !want.has(s && s.id));
    }
    const n = before - (player.skills || []).length;
    // ★只回收「被删技能」名下的容器：全量回收会把玩家身上**其它仍持有技能**的容器一起清空
    //   （SG030 A2 实测：删 guifu 时七星 stars→0、弃牌堆 +1）
    if (n > 0) await this.reclaimHeld(player, { onlyOwners: ids == null ? null : [].concat(ids) });
    return n;
  }

  async die(player, { from = null } = {}) {
    if (!player.alive) return;
    const data = { self: player, killer: from, canceled: false };
    await this.trigger('death.before', data);
    if (data.canceled) return;
    player.alive = false;
    player.hp = 0;
    await this.log(`☠ ${player.name} 阵亡${from ? '（击杀者：' + from.name + '）' : ''}`);
    // 弃置所有牌与判定区
    const all = [...player.hand, ...Object.values(player.equips).filter(Boolean), ...player.judgeZone.map(z => z.card), ...(player.buqu || [])];
    player.hand = [];
    player.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null, treasure: null };
    player.judgeZone = [];
    player.buqu = [];
    this.pushDiscard(all);
    // ★技能私有容器里的牌也必须回收（SG028）：bifaStack 之类「扣置在武将牌旁」的牌不在任何标准区域，
    //   die() 原先只清 hand/equips/judgeZone/buqu → 目标先死时那些牌永久滞留（实测 bifaStack 仍为 1、牌不在弃牌堆）。
    await this.reclaimHeld(player, { holderDead: true });
    await this.trigger('death.after', { self: player, killer: from });
    await this.mode.onDeath?.(this, player, from);
    this.checkVictory();
  }

  // ---------------- 出牌 ----------------
  virtualAllowed(player, cards, asName) {
    // ★装备提供的转化规则：【丈八蛇矛】两张手牌可当【杀】使用或打出。
    //   此前只有 CARD_META 里写了描述、没有任何实现 → 装了丈八完全没有效果（equipfullcheck 抓出）。
    if (asName === 'sha' && Array.isArray(cards) && cards.length === 2
      && player?.equips?.weapon?.name === 'zhangba') return true;
    // 于吉【蛊惑】：被技能标记的单张手牌可当作任意基本牌/非延时锦囊使用
    // （标记由技能自身设置，避免放开其他玩家的普通牌）
    if (cards.length === 1 && cards[0] && cards[0].__guhuo
      && (this.effectiveSkills(player) || []).some(s => s.id === 'guhuo')) {
      const m = CARD_META[asName];
      if (m && (m.type === 'basic' || (m.type === 'trick' && !m.delayed))) return true;
    }
    return VIRTUAL_RULES.some(r =>
      r.as === asName && this.effectiveSkills(player).some(s => s.id === r.skill) && r.test(cards, this, player))
      // 运行期合并 EXTRA_VIRTUAL_RULES（技能文件在引擎装载后 push 的规则也能生效）
      || EXTRA_VIRTUAL_RULES.some(r =>
        r.as === asName && this.effectiveSkills(player).some(s => s.id === r.skill) && r.test(cards, this, player));
  }

  canUse(player, card, targets = [], asName = null, extraCards = null, opts = {}) {
    const effName = asName || card.name;
    const meta = CARD_META[effName];
    if (!meta) return { ok: false, reason: '未知牌' };
    // M8 隐匿技：隐匿中的角色不能被其他角色指定为目标
    if (targets.some(t => t && t !== player && t.hidden)) {
      const h = targets.find(t => t && t !== player && t.hidden);
      return { ok: false, reason: `【隐匿】：${h.name} 处于隐匿状态，不能被指定为目标` };
    }
    // 技能对牌名的禁用（高顺【禁酒】"不能使用【酒】"），由技能静态声明 banUse: ['jiu']
    const banned = (this.effectiveSkills(player) || []).find(sk => (sk.banUse || []).includes(effName));
    if (banned) return { ok: false, reason: `【${banned.name}】不能使用${meta.cn}` };
    // 「本回合不能使用【杀】」（将驰 / 自守）
    if (effName === 'sha' && player.flags.banShaTurn === this.turnCount) {
      return { ok: false, reason: '本回合不能使用【杀】' };
    }
    // 陈到【往烈】：若如此做（令此牌不能被响应），本阶段不能再使用牌
    if (player.flags.banCardTurn === this.turnCount && this.turnPlayer === player) {
      return { ok: false, reason: '【往烈】：本阶段不能再使用牌' };
    }
    // 孙亮【掣政】：出牌阶段内，攻击范围内不包含你的角色不能成为你使用牌的目标
    if (targets.length && this.phase === 'play' && (this.effectiveSkills(player) || []).some(s => s.id === 'chezheng')) {
      const bad = targets.find(t => t && t !== player && !this.inAttackRange(t, player));
      if (bad) return { ok: false, reason: `【掣政】：${bad.name} 的攻击范围不包含你` };
    }
    // 张松【献图】：其本回合不能对献图者使用牌
    if (targets.length && player.flags.noTargetTurn === this.turnCount
      && targets.some(t => t && t.seat === player.flags.noTargetSeat)) {
      return { ok: false, reason: '【献图】：本回合不能对其使用牌' };
    }
    // 伏皇后【惴恐】：本回合不能指定其他角色为目标
    if (targets.length && player.flags.zhuikongTurn === this.turnCount && targets.some(t => t && t !== player)) {
      return { ok: false, reason: '【惴恐】：本回合不能指定其他角色为目标' };
    }
    // 简雍【巧说】：本阶段不能使用锦囊牌
    if (player.flags.qiaoshuoLose === this.turnCount && meta.type === 'trick' && !meta.delayed) {
      return { ok: false, reason: '【巧说】：本阶段不能使用锦囊牌' };
    }
    // 马岱【潜袭】：本回合不能使用/打出指定颜色的手牌
    const qx = player.flags.qianxiNoColor;
    if (qx && player.flags.qianxiTurn === this.turnCount) {
      const red = card.suit === 'heart' || card.suit === 'diamond';
      if ((qx === 'red' && red) || (qx === 'black' && !red && card.suit !== 'none')) {
        return { ok: false, reason: `【潜袭】：本回合不能使用${qx === 'red' ? '红' : '黑'}色手牌` };
      }
    }
    if (asName) {
      const cards = [card, ...(extraCards || [])];
      if (!this.virtualAllowed(player, cards, asName)) return { ok: false, reason: `没有可将此牌当作【${meta.cn}】使用的技能` };
    }
    if (effName === 'shan' || effName === 'wuxie') return { ok: false, reason: '此牌不能主动使用' };
    // 闪赵云【龙临】：决斗造成伤害后，其本阶段下一张牌不能指定其他角色为目标
    if (targets.length && player.flags.noOtherTargetTurn === this.turnCount
      && targets.some(t => t && t !== player)) {
      return { ok: false, reason: '本阶段下一张牌不能指定其他角色为目标' };
    }
    // 张绣【雄乱】：被指定的角色本回合不能使用牌
    if (player.flags.xiongluanBan === this.turnCount) {
      return { ok: false, reason: '【雄乱】：本回合不能使用牌' };
    }
    if (effName === 'sha') {
      const wname = player.equips.weapon?.name;
      const limit = ((wname === 'zhuge' || CARD_META[wname]?.noShaLimit) ? 99 : 1)
        + (wname === 'nupao' ? 1 : 0)          // 弩炮：每回合出【杀】次数 +1
        + (player.flags.nupaoExtra || 0)       // 弩炮判定为黑色：本回合出【杀】次数再 +1
        + (player.flags.qimouSha || 0) + (player.flags.shaExtra || 0)
        + (player.flags.shaExtraArmor || 0)    // 【降怒】：按护甲值动态计算（独立字段，避免覆盖 shaExtra）
        + (player.flags.shaExtraEquip || 0)    // 【飒然】：按装备区牌数动态计算（同上）
        + (player.flags.shaExtraTurn || 0);   // 「仅本回合」的额外出杀次数（【拒降】等，runTurn 清零）
      const freeOnTarget = player.flags.xiongluanTurn === this.turnCount
        && targets.some(t => t && t.seat === player.flags.xiongluanSeat);
      // ★牌级豁免（【刺北】的「刺」：以此法获得的【杀】不受次数限制，且效果跨回合）
      const cardFree = !!(card && card.ignoreShaLimit);
      if (!freeOnTarget && !opts.ignoreShaLimit && !cardFree
        && (player.flags.shaUsed || 0) >= limit
        && !player.flags.shaUnlimited && !player.flags.shaLimitBypass) return { ok: false, reason: '本回合【杀】已用尽' };
    }
    // 桃在出牌阶段只能给自己用，且必须已受伤（濒死求桃走响应流程，不经过这里）
    if (effName === 'tao' && player.hp >= player.maxHp) return { ok: false, reason: '体力已满，无需使用【桃】' };
    // 【酒】每回合限使用一次（出牌阶段与濒死自救共用这一次）
    if (effName === 'jiu' && player.flags.jiuUsed) return { ok: false, reason: '本回合已使用过【酒】' };
    const rule = meta.target;
    if (!rule) return { ok: true };
    if (typeof rule === 'function') {
      const cands = rule(this, player);
      return { ok: targets.length > 0 && targets.every(t => cands.includes(t)), candidates: cands };
    }
    const min = rule.min ?? 0;
    let max = rule.max ?? 1;
    // 方天画戟：最后一张手牌当【杀】时可额外指定至多两名目标
    if (effName === 'sha' && player.equips.weapon?.name === 'fangtian' && player.hand.length === 1) max = 3;
    // 技能级额外目标（吴懿【奔袭】②：与所有角色距离均为 1 时【杀】目标+1，与方天画戟可叠加为四杀）
    if (effName === 'sha' && player.flags.extraShaTarget === this.turnCount) max += 1;
    // 月·关羽【武圣】：额外回合内【杀】可指定任意名目标
    if (effName === 'sha' && player.flags.shaMultiTarget) max = Math.max(max, 99);
    if (targets.length < min || targets.length > max) return { ok: false, reason: `目标数量应为 ${min}~${max}` };
    const qicai = meta.type === 'trick' && this.effectiveSkills(player).some(s => s.id === 'qicai');
    for (const t of targets) {
      if (!t.alive) return { ok: false, reason: '目标已阵亡' };
      if (t === player && !rule.self) return { ok: false, reason: '不能以自己为目标' };
      if (t !== player && rule.self && !rule.others && !rule.all) return { ok: false, reason: '只能以自己为目标' };
      const cardRangeFree = !!(card && card.ignoreRange);
      if (rule.range && !opts.ignoreRange && !cardRangeFree && !this.inAttackRange(player, t)
        && !this.freeRangeNow(player) && !this.xiongluanFreeRange(player, t)
        && !this.shaRangeByPoint(player, effName, card, t)) return { ok: false, reason: '目标不在攻击范围内' };
      if (rule.distance != null && !qicai && !opts.ignoreRange && !player.flags.shaNoRange && this.distance(player, t) > rule.distance) return { ok: false, reason: '目标距离过远' };
    }
    return { ok: true };
  }

  candidatesFor(player, card, asName = null) {
    const name = asName || card.name;
    const meta = CARD_META[name];
    if (!meta) return [];
    const rule = meta.target;
    if (typeof rule === 'function') return rule(this, player);
    if (!rule) return [];
    let cands = this.alive();
    // 目标口径：
    //   self 单标（桃/酒/无中生有/闪电）→ 只能自己
    //   self + others（铁索连环）      → 自己与他人皆可
    //   self + all（五谷丰登）         → 全体（min 0，通常无需选）
    //   无 self（杀/决斗/过河拆桥…）    → 默认不能以自己为目标
    if (rule.self && !rule.others && !rule.all) cands = cands.filter(p => p === player);
    else if (!rule.self) cands = cands.filter(p => p !== player);
    if (name === 'tao') cands = cands.filter(p => p.hp < p.maxHp); // 满血不能用桃
    // ★牌级豁免（SG032 A4.2 / SG033 P1-4）：【刺北】的「刺」带 card.ignoreRange，
    //   canUse 已认它，但 AI/自动选目标走的是 candidatesFor —— 这里不认就会出现
    //   「canUse ok 但候选里没有该目标」（实测 8 人局距离 4 时 AI 永远不出这张牌）。
    if (card && card.ignoreRange) return cands.filter(p => {
      if (rule.self && !rule.others && !rule.all && p !== player) return false;
      if (!rule.self && p === player) return false;
      if (name === 'tao' && p.hp >= p.maxHp) return false;
      return true;
    });
    if (rule.range) cands = cands.filter(p => this.inAttackRange(player, p) || this.freeRangeNow(player)
      || this.xiongluanFreeRange(player, p) || this.shaRangeByPoint(player, name, card, p));
    if (rule.distance != null && !(card && card.ignoreRange)) cands = cands.filter(p => this.distance(player, p) <= rule.distance);
    return cands;
  }

  // 「仅可指定自己」与「所有角色」的牌没有可选择空间，直接给出目标，免得玩家/调用方多点一次
  autoTargetsFor(player, card, asName = null) {
    const meta = CARD_META[asName || card.name];
    const rule = meta && meta.target;
    if (!rule || typeof rule === 'function') return null;
    const cands = this.candidatesFor(player, card, asName);
    if (!cands.length) return null;
    // 只能指定自己（桃 / 酒 / 无中生有 / 闪电）
    if (rule.self && !rule.others && !rule.all) return cands.includes(player) ? [player] : null;
    // 所有角色（万箭齐发 / 南蛮入侵 / 桃园结义 / 五谷丰登）
    if (rule.all) return cands.slice();
    return null;
  }

  async useCard({ from, card, targets = [], reason = 'play', virtual = false, asName = null, extraCards = null, unavoidable = false, ignoreRange = false, ignoreShaLimit = false }) {
    if (!card || !from.alive) return false;
    // 响应白名单（【分敌】）：被限制的角色只能使用/打出被展示的牌
    if (!this.responseAllowed(from, card)) {
      await this.log(`✗ ${from.name} 受限制，只能使用或打出被展示过的牌`);
      return false;
    }
    const effName = asName || card.name;
    const meta = CARD_META[effName];
    if (!meta) return false;
    // 神黄盖【三彩】：下一张牌无距离/次数限制且不可被响应
    if (from.flags?.sancaiOnce) {
      from.flags.sancaiOnce = false;
      ignoreRange = true; ignoreShaLimit = true; unavoidable = true;
      await this.log(`${from.name} 的【三彩】：此牌无距离/次数限制且不可被响应`);
    }
    // 「仅自己 / 全体」的牌自动确定目标（前端、AI、技能调用都受益，避免再点一次人）
    if (!targets.length) {
      const auto = this.autoTargetsFor(from, card, asName);
      if (auto && auto.length) {
        targets = auto;
        await this.log(`${from.name} 的【${meta.cn}】自动指定目标：${auto.map(t => t.name).join('、')}`);
      }
    }
    const check = this.canUse(from, card, targets, asName, extraCards, { ignoreRange, ignoreShaLimit });
    if (!check.ok) { await this.log(`✗ ${from.name} 使用 ${cardLabel(card)} 失败：${check.reason}`); return false; }
    // 「天机」/「谋」当作手牌使用时须支付 1 点体力或 1 个「工」标记
    if ((card.__tz || card.__mou) && (this.effectiveSkills(from) || []).some(s => s.id === 'tianji')) {
      if (!(await this.payForTianji(from))) { await this.log(`✗ ${from.name} 无法支付【天机】的代价，不能使用该牌`); return false; }
    }
    const useData = { self: from, card, effName, targets, reason };
    await this.trigger('card.use.before', useData);
    if (useData.canceled) return false;
    if (useData.unavoidable) unavoidable = true;   // 陈到【往烈】等：使用前声明此牌不可被响应
    // 额外目标（张虎【同援】红色基本牌等）：技能在 card.use.before 里写入 extraTargets（seat 数组）
    if (Array.isArray(useData.extraTargets) && useData.extraTargets.length) {
      for (const s of useData.extraTargets) {
        const q = this.players[s];
        if (q && q.alive !== false && !targets.includes(q)) targets.push(q);
      }
    }

    // 移出手牌（含虚拟牌消耗的额外手牌）
    const spent = [card, ...(extraCards || [])];
    for (const c of spent) {
      const i = from.hand.indexOf(c);
      if (i >= 0) from.hand.splice(i, 1);
      this.clearExtraSlot(from, c);   // 天机 / 谋 被使用后清空对应牌位
    }
    const effCard = asName ? { ...card, name: effName, __src: card } : card;
    // 防御：一张牌即将进入处理区，它不应同时还在弃牌堆里
    //（技能从弃牌堆「拿来使用」时可能漏摘；若不摘，会出现「弃牌堆 + 处理区」双存）
    const dpi = this.discardPile.indexOf(card);
    if (dpi >= 0) this.discardPile.splice(dpi, 1);
    if (!this.table.includes(card)) this.table.push(card);
    // ★「谁出了什么牌」广播（前端据此在桌面中央展示**他人**打出的牌）：
    //   此前只有自己的手牌有飞牌动画，别人的牌只能从战报文字里读，看不到牌面。
    this.lastPlay = {
      seq: ((this.lastPlay && this.lastPlay.seq) || 0) + 1,
      seat: from.seat, player: from.name,
      name: effName, cn: cardLabel(effCard),
      suit: card?.suit || null, num: card?.num || null,
      targets: targets.map(t => t.seat),
      turn: this.turnCount, phase: this.phase,
    };
    await this.log(`${from.name} ${asName ? `将 ${cardLabel(card)} 当【${meta.cn}】使用` : `使用 ${cardLabel(card)}`}${targets.length ? ' → ' + targets.map(t => t.name).join('、') : ''}`);
    if (effName === 'sha' && !ignoreShaLimit && !(card && card.ignoreShaLimit)) from.flags.shaUsed = (from.flags.shaUsed || 0) + 1;
    // M8 隐匿：使用牌即解除隐匿（武将牌翻开）
    if (from.hidden) { from.hidden = false; await this.log(`${from.name} 使用牌，解除【隐匿】`); }

    // 【杀】结算上下文：unavoidable 表示本次【杀】不可被【闪】响应（黄忠【烈弓】等可在 target.after 里置位）
    const shaCtx = effName === 'sha' ? { unavoidable: !!unavoidable } : null;

    // 逐个目标结算（技能可取消或转移目标）
    const finalTargets = [];
    for (const t0 of targets) {
      // total = 本次使用声明的目标总数（含 extraTargets）：供「指定唯一目标」类技能
      // （如【追命】）做 d.total === 1 判定——用 targets.length 而非 finalTargets.length，
      // 因为 target.before 阶段可能取消/转移目标，而官方口径的「唯一目标」指使用时唯一。
      const td = { self: from, target: t0, card: effCard, canceled: false, used: finalTargets.slice(), shaCtx, total: targets.length };
      await this.trigger('target.before', td);
      if (td.canceled) { await this.log(`${t0.name} 不能成为目标`); continue; }
      if (td.target !== t0 && finalTargets.includes(td.target)) continue;
      finalTargets.push(td.target);
      await this.trigger('target.after', td);
    }

    if (meta.delayed) {
      for (const t of finalTargets) await meta.effect(this, { from, card: effCard, targets: [t] });
    } else if (meta.sub) {
      await this.equipCard(from, effCard);
    } else if (!finalTargets.length && !meta.delayed) {
      // 目标被技能全部取消（如贾诩【帷幕】对黑色锦囊免疫 / 【督持】取消唯一目标）：
      // 不结算效果，直接进弃牌堆。此前只对 trick 做了保护，basic 牌会以空 targets 结算并崩溃。
      await this.log(`${cardLabel(effCard)} 没有合法目标，直接置入弃牌堆`);
    } else {
      const isTrick = meta.type === 'trick';
      let negated = false;
      // unavoidable 语义为「此牌不可被响应」：对【杀】是不可【闪】，对锦囊是不可【无懈】
      if (isTrick && reason !== 'wuxie' && !unavoidable) negated = await this.wuxieChain(effCard, finalTargets[0] || from, from);
      if (!negated) {
        await this.trigger('card.effect.before', { self: from, card: effCard, targets: finalTargets, reason });
        await meta.effect(this, { from, card: effCard, targets: finalTargets, shaCtx, unavoidable: shaCtx ? shaCtx.unavoidable : false });
        await this.trigger('card.effect.after', { self: from, card: effCard, targets: finalTargets, reason });
      } else {
        await this.log(`${cardLabel(effCard)} 被【无懈可击】抵消`);
      }
    }
    // 结算后弃置实际牌。已被技能获得（手牌）、已置入判定区、或已装备的牌不能重复进弃牌堆。
    const ti = this.table.indexOf(card);
    if (ti >= 0) this.table.splice(ti, 1);
    const inPlay = new Set([
      ...Object.values(from.equips).filter(Boolean),
      ...this.players.flatMap(p => p.hand),
      ...this.players.flatMap(p => p.judgeZone.map(z => z.card.__src || z.card)),
    ]);
    const spentToPile = [...new Set(spent)].filter(c => !inPlay.has(c));
    if (spentToPile.length) {
      this.pushDiscard(spentToPile);
      // 使用后进入弃牌堆同样属于「一张牌进入弃牌堆」（出【杀】等），须触发事件
      const disc1 = { self: from, cards: spentToPile, reason: reason || 'use', taken: [] };
      await this.trigger('cards.discard', disc1);
      this.settleTaken(disc1);
    }
    await this.trigger('card.use.after', useData);
    await this.checkHandChange(from);
    return true;
  }

  // 主动技：出牌阶段发动（如制衡/苦肉/青囊）
  async useActiveSkill(player, skillId, targets = []) {
    // 【妙计】：由谋略值动态赋予的通用主动技，不在 player.skills 里
    if (skillId === 'miaojii') {
      if (player.flags?.skillsDisabled) { await this.log(`✗ ${player.name} 已失去所有武将技能，无法发动【妙计】`); return false; }
      return await this.activeMiaojii(player);
    }
    // 失去所有技能（【锁星】②）：主动技一律不可发动。
    // ★activeSkillsOf 只隐藏面板，直接调 useActiveSkill（前端/技能/AI 均可）原来仍能绕过（SG027 R6）
    if (player.flags?.skillsDisabled) {
      await this.log(`✗ ${player.name} 已失去所有武将技能，无法发动主动技`);
      return false;
    }
    const sk = this.effectiveSkills(player).find(s => s.id === skillId);
    if (!sk || !sk.active) { await this.log(`✗ ${player.name} 无法发动该技能`); return false; }
    if (sk.form && sk.form !== (player.form || 'normal')) { await this.log(`✗ ${sk.name} 当前形态不可发动`); return false; }
    if (sk.kingdomOnly && sk.kingdomOnly !== player.kingdom) { await this.log(`✗ ${sk.name} 当前势力不可发动`); return false; }
    // 出牌阶段限制（SG027 R1）：声明了 perTurn / perPhase 的主动技只能在**自己的出牌阶段**发动。
    // 旧实现没有任何阶段闸门 → 自己的判定/摸牌/弃牌阶段也能通过接口发动（额外出牌阶段仍可反复发动，
    // 因为这里看的是 phase 而非次数）。回合外（别人回合）不在此拦，留给「回合外可发动」类技能。
    // 个别技能确实要跨阶段发动时可写 active.phaseOnly = false 显式放开。
    if (sk.active.phaseOnly !== false && this.phase && this.turnPlayer === player && this.phase !== 'play') {
      await this.log(`✗ 【${sk.name}】只能在自己的出牌阶段发动`);
      return false;
    }
    // perTurn  = 每个自己的回合一次（key: act_*）
    // perPhase = 每个出牌阶段一次（key: actPhase_*）——额外出牌阶段（当先/整兵/观微）会重新计数
    // ★旧实现只有 act_* 且在 runTurn 开头清一次，导致额外出牌阶段里「出牌阶段限一次」的技能无法再发动（SG025 #11）
    const perPhase = !!sk.active.perPhase;
    const key = perPhase ? `actPhase_${skillId}` : `act_${skillId}`;
    const stamp = perPhase ? this.playPhaseSeq : this.turnCount;
    if (sk.active.perTurn && player.flags[`act_${skillId}`] === this.turnCount) { await this.log(`✗ ${sk.name} 本回合已发动过`); return false; }
    if (perPhase && player.flags[key] === stamp) { await this.log(`✗ ${sk.name} 本阶段已发动过`); return false; }
    player.flags[key] = stamp;
    await this.log(`${player.name} 发动【${sk.name}】`);
    const ctx = this.makeCtx(player, sk, { on: 'active', effect: sk.active.effect }, { self: player });
    try {
      await sk.active.effect(ctx, targets);
    } catch (e) {
      await this.log(`⚠ 技能 ${sk.name} 执行异常：${e.message}`);
    }
    await this.checkHandChange(player);
    return true;
  }

  // 「当前有效技能表」/「是否拥有技能」（SG027 R9 · engine-plan 方案 1）
  // ★失去技能（flags.skillsDisabled）后，所有「拥有某技能」的判定都必须走这两个入口，
  //   不能再直接读 player.skills —— 不屈/覆载/红颜/集智等直读写法会绕过禁用（SG027 R9 FAIL）。
  //   实现落在 skill.js 的纯函数上（技能文件也可 import effSkills 直接用）。
  effectiveSkills(player) { return effSkills(player); }
  hasSkill(player, ...ids) { return effHasSkill(player, ...ids); }

  activeSkillsOf(player) {
    // 失去技能由 effectiveSkills 统一处理（skillsDisabled → 空；noSkills → 只剩锁定技），
    // 这里不再单独判 skillsDisabled，避免两套语义分叉（SG028 A2）
    const list = this.effectiveSkills(player)
      .filter(s => s.active && (!s.form || s.form === (player.form || 'normal'))
        && (!s.kingdomOnly || s.kingdomOnly === player.kingdom)
        && (!s.active.perTurn || player.flags[`act_${s.id}`] !== this.turnCount)
        && (!s.active.perPhase || player.flags[`actPhase_${s.id}`] !== this.playPhaseSeq))
      .map(s => ({ id: s.id, name: s.name, desc: s.desc }));
    // 【妙计】由谋略值动态赋予（不在武将技能表里）：有谋略值即视为拥有，每个自己的回合限一次
    if ((player.moulue || 0) > 0 && player.flags.act_miaojii !== this.turnCount) {
      list.push({
        id: 'miaojii', name: '妙计',
        desc: `每回合限一次，消耗 1 点谋略值视为使用【过河拆桥】、3 点视为使用【无中生有】（无懈可击在需要响应时可用）。当前谋略值 ${player.moulue}/${player.moulueMax || 5}`,
      });
    }
    return list;
  }

  // 装备离场后的规则结算：白银狮子失去时回复 1 点体力
  async afterEquipLose(player, card) {
    if (!player || !card) return;
    if (card.name === 'baiyin' && player.hp < player.maxHp) {
      await this.recover(player, 1, { from: player, card, reason: 'baiyin' });
      await this.log(`${player.name} 失去【白银狮子】，回复 1 点体力`);
    }
  }

  // 从装备区摘下某张牌，并派发 equip.lose（SG033 P0-2）：
  // 全库有 40+ 处直接 `equips[k] = null` 的「静默摘装备」，16 个技能监听 equip.lose
  // （降怒/飒然/精械弩/悲歌/奋音…）在这些路径上永不刷新。凡「把装备移走/获得/弃置」都应走这里。
  // 返回被摘掉的槽名（没摘到返回 null）。★只负责摘除+派发，入弃牌堆/进手牌由调用方决定。
  async unequipCard(player, card, { reason = 'unequip' } = {}) {
    if (!player || !card || !player.equips) return null;
    for (const k of Object.keys(player.equips)) {
      if (player.equips[k] === card) {
        player.equips[k] = null;
        await this.trigger('equip.lose', { self: player, card, slot: k, reason, noLoseHook: true });
        await this.afterEquipLose(player, card);
        return k;
      }
    }
    return null;
  }

  // 交换两名角色某个装备槽的牌（SG034 P0：甘露/诡图/冠武的「交换类」技能曾零 lose、零 change）
  // 顺序：双方先置空 → 各自派 equip.lose（noChange，跳过补派）→ 写入新牌 → 各自派一次 equip.change。
  // 这样双方监听者看到的状态都自洽（不会出现「lose 时槽位仍指向旧牌」）。
  async swapEquipSlot(a, b, slot, { reason = 'swap' } = {}) {
    const ca = a?.equips?.[slot] || null;
    const cb = b?.equips?.[slot] || null;
    if (ca === cb) return false;
    if (a?.equips) a.equips[slot] = null;
    if (b?.equips) b.equips[slot] = null;
    if (ca) { await this.trigger('equip.lose', { self: a, card: ca, slot, reason, noChange: true, noLoseHook: true }); await this.afterEquipLose(a, ca); }
    if (cb) { await this.trigger('equip.lose', { self: b, card: cb, slot, reason, noChange: true, noLoseHook: true }); await this.afterEquipLose(b, cb); }
    if (a?.equips) a.equips[slot] = cb;
    if (b?.equips) b.equips[slot] = ca;
    if (cb || ca) await this.trigger('equip.change', { self: a, slot, card: cb, old: ca });
    if (ca || cb) await this.trigger('equip.change', { self: b, slot, card: ca, old: cb });
    return true;
  }

  // 一次性把某张牌装到玩家身上（用于「凭空换上某装备」类技能）——
  // 等价于「摘下旧装备（派 lose）→ 置入新装备（派 change）」，避免各处手写漏派（SG034 P0：冠武）
  async forceEquip(player, card, { reason = 'force', ignoreDisabled = false } = {}) {
    const sub = CARD_META[card.name]?.sub;
    const slot = sub ? EQUIP_SUB[sub] : null;
    if (!slot || !player) return null;
    // ★SG036-r2 P1：被废除的装备栏（陆抗【决堰】/ 张绣【雄乱】等）不能靠 forceEquip 绕过去
    //   （援护/直谏/骄纵/飒然都会把牌塞进去）。与 equipCard 同口径：直接进弃牌堆。
    if (!ignoreDisabled && (player.flags.disabledEquip || {})[slot]) {
      if (!this.discardPile.includes(card)) this.discardPile.push(card);
      const cn = { weapon: '武器', armor: '防具', horsePlus: '+1 坐骑', horseMinus: '-1 坐骑', treasure: '宝物' }[slot] || '该';
      await this.log(`${player.name} 的${cn}装备栏已废除，${cardLabel(card)} 直接置入弃牌堆`);
      return null;
    }
    const old = player.equips[slot] || null;
    if (old === card) return slot;
    if (old) {
      await this.unequipCard(player, old, { reason });
      this.pushDiscard(old);
    }
    player.equips[slot] = card;
    await this.log(`${player.name} 装备 ${cardLabel(card)}`);
    await this.trigger('equip.change', { self: player, slot, card, old });
    return slot;
  }

  async equipCard(player, card) {
    const sub = CARD_META[card.name].sub;
    const slot = EQUIP_SUB[sub];
    // 魔曹操【覆载】：锁定技——装备牌只能当【借刀】/【无中生有】使用，不能进入装备区
    if ((this.effectiveSkills(player) || []).some(s => s.id === 'fuzai')) {
      if (!this.discardPile.includes(card)) this.discardPile.push(card);
      await this.log(`${player.name} 的【覆载】：${cardLabel(card)} 不能装备，置入弃牌堆`);
      return;
    }
    // M7 装备区废除（陆抗【决堰】/ 张绣【雄乱】）：已废除的栏位不能再装备
    if (player.flags.disabledEquip && player.flags.disabledEquip[slot]) {
      if (!this.discardPile.includes(card)) this.discardPile.push(card);
      const cn = { weapon: '武器', armor: '防具', horsePlus: '+1 坐骑', horseMinus: '-1 坐骑', treasure: '宝物' }[sub] || '该';
      await this.log(`${player.name} 的${cn}装备栏已废除，${cardLabel(card)} 直接置入弃牌堆`);
      return;
    }
    const old = player.equips[slot];
    // 幂等保护：若该栏位已是这张牌本身（同一张牌被重复「装备」，例如先被技能取回牌堆又被摸到），
    // 不能再把它当旧装备推进弃牌堆，否则同一张牌会同时存在于装备区与弃牌堆。
    if (old === card) return;
    if (old) {
      // ★先把槽位置空再派发 equip.lose（SG033 P0-1）：若先派发、槽位仍指向旧牌，
      //   监听者读 equips[slot] 拿到的是「正要被换掉的旧装备」，会做出错误判断
      //   （精械弩 jx→青釭：lose 时看到 jx 把 shaUnlimited 清掉，紧接着的 change 又看到 jx 置 true）。
      player.equips[slot] = null;
      this.pushDiscard(old);
      await this.log(`${player.name} 弃置了 ${cardLabel(old)}`);
      // noChange：让 trigger 末尾的「补派 equip.change」跳过 —— 本函数自己会在最后派发一次
      await this.trigger('equip.lose', { self: player, card: old, slot, noChange: true, noLoseHook: true });
      await this.afterEquipLose(player, old);
    }
    player.equips[slot] = card;
    await this.log(`${player.name} 装备 ${cardLabel(card)}`);
    await this.trigger('equip.change', { self: player, slot, card, old });
  }

  placeDelayed(target, card, name) {
    // 延时锦囊：牌使用后进入目标判定区，不应同时留在弃牌堆（否则牌堆耗尽重洗时同一张牌会既在牌堆又在判定区）
    const i = this.discardPile.indexOf(card);
    if (i >= 0) this.discardPile.splice(i, 1);
    target.judgeZone.push({ card, name });
  }

  // ---------------- 响应 ----------------
  matchFilter(card, filter = {}, player = null) {
    if (!filter || !Object.keys(filter).length) return true;
    if (filter.name && card.name !== filter.name) return false;
    if (filter.names && !filter.names.includes(card.name)) return false;
    if (filter.type && card.type !== filter.type) return false;
    // 红颜：小乔的黑桃牌视为红桃（只在判定花色时映射，不改牌本身）
    const suit = player ? suitOf(player, card) : card.suit;
    if (filter.suit && !filter.suit.includes(suit)) return false;
    if (filter.red != null && (player ? isRedFor(player, card) : isRed(card)) !== filter.red) return false;
    if (filter.excludeName && card.name === filter.excludeName) return false;
    return true;
  }

  // 响应白名单（【分敌】等）：被限制的角色只能使用/打出被展示的那些牌。
  // 由技能写 player.flags.responseWhitelist = { cardId, ids:[...], turn }，
  // 引擎在「主动使用」（useCard）与「响应」（respondCard）两条路径统一检查；
  // turn 与本回合不一致视为过期，自动失效（避免技能漏清导致永久锁手牌）。
  responseAllowed(player, card) {
    const wl = player && player.flags && player.flags.responseWhitelist;
    if (!wl || !card) return true;
    if (wl.turn != null && wl.turn !== this.turnCount) return true;
    const ids = wl.ids || [];
    const actual = card.__src || card;
    return ids.includes(card.id) || (actual && ids.includes(actual.id));
  }

  async respondCard(player, opt) {
    if (!player || !player.alive) return null;
    const data = { self: player, filter: opt.filter, handled: false, card: null };
    await this.trigger('respond.need', data);
    let card = null;
    if (data.handled && data.card) {
      // ★响应白名单（【分敌】）必须覆盖「转化技 handled」这条捷径：
      //   龙胆/武圣等在 respond.need 里直接把 data.card 递上来，旧实现绕过了 responseAllowed，
      //   目标可以打出未被展示的牌（SG027 R8 FAIL）。检查实体牌（虚拟牌看 __src）。
      const actual = data.card.__src || data.card;
      if (!this.responseAllowed(player, actual)) {
        await this.log(`✗ ${player.name} 受限制，只能使用或打出被展示过的牌`);
      } else {
        card = data.card;
      }
    }
    if (!card) {
      const allowedIds = opt.filter && opt.filter.allowedIds ? new Set(opt.filter.allowedIds) : null;
      const cands = player.hand.filter(c => this.matchFilter(c, opt.filter, player)
        && this.responseAllowed(player, c)
        && (!allowedIds || allowedIds.has(c.id) || (c.__src && allowedIds.has(c.__src.id))));
      // 【丈八蛇矛】：手里没有真【杀】时，可将两张手牌当【杀】打出（响应路径）。
      // ★SG037-r2：此前只实现了「主动使用」（virtualAllowed），决斗/南蛮/万箭要求打出【杀】时
      //   装了丈八也打不出，装备等于白装——这里补齐响应链路。
      if (!cands.length && opt.filter && opt.filter.name === 'sha'
        && player.equips && player.equips.weapon && player.equips.weapon.name === 'zhangba') {
        const pool = player.hand.filter(c => this.responseAllowed(player, c));
        if (pool.length >= 2) {
          const yes = await this.confirm(player, '【丈八蛇矛】：是否将两张手牌当【杀】打出？');
          if (yes) {
            const res2 = await this.ask(player, 'cards', {
              prompt: '【丈八蛇矛】：选择两张手牌当【杀】打出',
              cards: pool.map(c => c.id), min: 2, max: 2, reason: 'zhangba',
            });
            const zids = (res2 && res2.cardIds) || [];
            const pair = zids.map(id => pool.find(c => c.id === id)).filter(Boolean);
            if (pair.length === 2 && pair[0] !== pair[1]) {
              for (const c of pair) {
                const zi = player.hand.indexOf(c);
                if (zi >= 0) player.hand.splice(zi, 1);
                this.clearExtraSlot(player, c);
                Game.stripCardMarks(c);
                if (!this.discardPile.includes(c)) this.discardPile.push(c);
              }
              const discZb = { self: player, cards: pair, reason: opt.reason || 'respond', taken: [] };
              await this.trigger('cards.discard', discZb);
              this.settleTaken(discZb);
              await this.checkHandChange(player);
              await this.log(`【丈八蛇矛】：${player.name} 将 ${cardLabel(pair[0])}、${cardLabel(pair[1])} 当【杀】打出`);
              // 返回虚拟【杀】：id 必须唯一（形如 c40_zb）并标 virtual，
              //   ★不能沿用源牌 id —— 调用方可能再 useCard（【借刀杀人】），
              //   同 id 的副本会与已在弃牌堆的实体牌构成「牌张重复」（seed 9135 实测）。
              return { ...pair[0], id: `${pair[0].id}_zb`, name: 'sha', __src: pair[0], virtual: true, __virtual: 'zhangba' };
            }
          }
        }
      }
      if (!cands.length) return null;
      const res = await this.ask(player, 'card', {
        prompt: opt.prompt || '请选择一张牌（或取消）',
        cards: cands.map(c => c.id),
        optional: opt.optional !== false,
        reason: opt.reason || 'respond',
      });
      if (!res || !res.cardId) return null;
      const picked = cands.find(c => c.id === res.cardId);
      // 「天机」/「谋」当作手牌打出时同样须支付代价
      if (picked && (picked.__tz || picked.__mou) && (this.effectiveSkills(player) || []).some(s => s.id === 'tianji')) {
        if (!(await this.payForTianji(player))) { await this.log(`✗ ${player.name} 无法支付【天机】的代价，不能打出该牌`); return null; }
      }
      card = cands.find(c => c.id === res.cardId) || null;
      if (!card) return null;
    }
    // 打出的牌从手牌移出并进入弃牌堆
    // 注意：这里统一触发 cards.discard（「失去/打出牌」类技能依赖它）；
    // 调用方拿到返回牌后不要再 ctx.discard，否则同一张牌会触发两次失去。
    const actual = card.__src || card;
    const i = player.hand.indexOf(actual);
    if (i >= 0) player.hand.splice(i, 1);
    this.clearExtraSlot(player, actual);
    Game.stripCardMarks(actual);   // 打出即失去牌级豁免（SG034 P1：respondCard 曾绕过）
    if (!this.discardPile.includes(actual)) this.discardPile.push(actual);
    const disc2 = { self: player, cards: [actual], reason: opt.reason || 'respond', taken: [] };
    await this.trigger('cards.discard', disc2);
    this.settleTaken(disc2);
    await this.checkHandChange(player);
    return card;
  }

  // 手牌数变化钩子（连营等）
  async checkHandChange(player) {
    if (!player || !player.alive) return;
    const data = { self: player, count: player.hand.length };
    await this.trigger('hand.change', data);
  }

  // 亮牌（展示给所有玩家）
  async revealCards(cards, { to = [], reason = '' } = {}) {
    if (!cards?.length) return;
    const text = cards.map(cardLabel).join('、');
    await this.log(`展示：${text}${reason ? `（${reason}）` : ''}`);
    this.lastReveal = { cards: cards.map(c => ({ id: c.id, name: c.name, suit: c.suit, num: c.num })), at: Date.now() };
  }

  async requireDodge(target, { from, card, reason = 'sha', prompt, unavoidable = false } = {}) {
    const data = { self: target, from, card, dodged: false, extraDodge: 0 };
    await this.trigger('dodge.before', data);
    if (data.dodged) return true;
    // 【烈弓】等令此【杀】不可被【闪】响应：复用「不能使用【闪】」的同一判定出口
    if (unavoidable) {
      await this.log(`此【杀】不可被【闪】响应`);
      return false;
    }
    if (target.flags.xiongluanBan === this.turnCount) {
      await this.log(`${target.name} 受【雄乱】影响，不能打出手牌`);
      return false;
    }
    if (card && (target.flags.noShan === card.id || target.flags.noShanTurn === this.turnCount)) {
      await this.log(`${target.name} 本回合不能使用【闪】`);
      return false;
    }
    const armor = target.equips.armor;
    const ignoreArmor = this.armorIgnored(from);
    if (armor && armor.name === 'bagua' && !ignoreArmor) {
      const j = await this.judge(target, { reason: '八卦阵', from });
      if (isRed({ suit: j.suit })) { await this.log(`${target.name} 的【八卦阵】生效，视为打出【闪】`); return true; }
    }
    const need = 1 + (data.extraDodge || 0);
    let got = 0;
    const dodges = [];
    for (let k = 0; k < need; k++) {
      const c = await this.respondCard(target, {
        filter: { name: 'shan' }, reason, optional: true,
        prompt: prompt || `${from ? from.name + ' 对你使用【杀】，' : ''}请打出一张【闪】${need > 1 ? `（第 ${k + 1}/${need} 张）` : ''}`,
      });
      if (!c) break;
      got++;
      dodges.push(c);
      await this.log(`${target.name} 打出【闪】${SUIT_CN[c.suit] || ''}${c.num || ''}`);
    }
    // 供【忠勇】等「【杀】被【闪】抵消」技能取用（打出的【闪】此时已在弃牌堆）
    target.flags.lastDodgeCards = got >= need ? dodges : [];
    return got >= need;
  }

  async resolveSha(from, target, card, { unavoidable = false, bonus = 0 } = {}) {
    const armor = target.equips.armor;
    const weapon = from.equips.weapon?.name;
    const ignoreArmor = this.armorIgnored(from);
    if (armor && !ignoreArmor) {
      if (armor.name === 'renwang' && !isRed(card)) { await this.log(`${target.name} 的【仁王盾】使黑杀无效`); return; }
      if (armor.name === 'tengjia' && card.nature !== 'fire') { await this.log(`${target.name} 的【藤甲】使普通杀无效`); return; }
    }
    // 雌雄双股剑：指定异性目标后，令其舍弃一张手牌，或你摸一张牌
    if (weapon === 'cixiong' && !from.isAI && target.gender && from.gender && target.gender !== from.gender) {
      const idx = await this.chooseOne(target, ['弃置一张手牌', '让对方摸一张牌'],
        { prompt: `${from.name} 的【雌雄双股剑】：请选择一项` }, { optional: false });
      if (idx === 1 || !target.hand.length) {
        await this.drawCards(from, 1, { reason: 'cixiong' });
      } else {
        const pick = await this.chooseOne(target, target.hand.map(c => cardLabel(c)),
          { prompt: '【雌雄双股剑】：弃置一张手牌' }, { optional: false });
        if (pick >= 0 && target.hand[pick]) await this.discardCards(target, [target.hand[pick]], { reason: 'cixiong' });
      }
    }
    const dodged = await this.requireDodge(target, { from, card, reason: 'sha', unavoidable });
    if (dodged) {
      await this.trigger('sha.dodged', { self: from, target, card, dodgeCards: target.flags.lastDodgeCards || [] });
      await this.trigger('dodge.after', { self: target, from, card });
      // 青龙偃月刀：被【闪】抵消后，可弃一张【杀】继续攻击该角色（不计次数）
      if (weapon === 'qinglong' && !from.isAI) {
        const shaCards = from.hand.filter(c => c.name === 'sha');
        if (shaCards.length) {
          const idx = await this.chooseOne(from, shaCards.map(c => cardLabel(c)),
            { prompt: '【青龙偃月刀】：可弃一张【杀】继续攻击该角色' }, { optional: true });
          if (idx >= 0 && shaCards[idx]) {
            from.flags.shaLimitBypass = true;
            try { await this.useCard({ from, card: shaCards[idx], targets: [target], reason: 'qinglong' }); }
            finally { from.flags.shaLimitBypass = false; }
          }
        }
      } else if (weapon === 'guanshi' && !from.isAI) {
        // 贯石斧：被【闪】抵消时，可弃两张牌令此【杀】依然造成伤害
        const pool = [...from.hand, ...Object.values(from.equips).filter(Boolean)];
        if (pool.length >= 2 && await this.confirm(from, '【贯石斧】：弃两张牌令此【杀】依然造成伤害？')) {
          const picks = await this.chooseSomeCards(from, pool, 2, { prompt: '【贯石斧】：选择两张牌弃置' });
          if (picks.length === 2) {
            await this.discardCards(from, picks, { reason: 'guanshi' });
            const dmg = 1 + (from.flags.jiu ? 1 : 0);
            if (from.flags.jiu) from.flags.jiu = 0;
            const hitData1 = { self: from, target, card, amount: dmg };
            await this.trigger('sha.hit', hitData1);
            await this.damage({ from, to: target, amount: hitData1.amount, card, reason: 'sha', nature: card.nature || 'normal' });
          }
        }
      }
      return;
    }
    let amount = 1;
    if (bonus) amount += bonus; // 界黄忠【烈弓】②：体力值 ≤ 目标时此【杀】伤害 +1
    if (from.flags.jiu) { amount += 1; from.flags.jiu = 0; }
    if (weapon === 'guding' && target.hand.length === 0) amount += 1;
    if (weapon === 'zhuque' && (card.nature === 'fire' || card.__fire)) amount += 1;   // 朱雀羽扇：火杀伤害 +1
    // 弩炮（自定义配件牌）：对距离 1（相邻）的角色使用【杀】时判定——红色此【杀】伤害 +1，黑色本回合出【杀】次数 +1
    if (weapon === 'nupao' && this.distance(from, target) <= 1) {
      const jd = await this.judge(from, { reason: 'nupao', from, card });
      if (jd.suit === 'heart' || jd.suit === 'diamond') {
        amount += 1;
        await this.log(`【弩炮】判定为红色（${SUIT_CN[jd.suit]}${jd.num}），此【杀】伤害 +1（共 ${amount}）`);
      } else {
        from.flags.nupaoExtra = (from.flags.nupaoExtra || 0) + 1;
        await this.log(`【弩炮】判定为黑色（${SUIT_CN[jd.suit]}${jd.num}），本回合出【杀】次数 +1`);
      }
    }
    // 寒冰剑：造成伤害时，可防止此伤害，改为弃置目标两张牌
    if (weapon === 'hanbing' && !from.isAI) {
      const pool = [...target.hand, ...Object.values(target.equips).filter(Boolean)];
      if (pool.length && await this.confirm(from, '【寒冰剑】：防止此伤害，改为弃置目标两张牌？')) {
        const picks = await this.chooseSomeCards(from, pool, 2, { prompt: '【寒冰剑】：选择目标的牌弃置' });
        if (picks.length) { await this.discardCards(target, picks, { reason: 'hanbing' }); return; }
      }
    }
    const hitData = { self: from, target, card, amount };
    await this.trigger('sha.hit', hitData);   // 技能可改 hitData.amount（闪孙坚【绝烈】等）
    await this.damage({ from, to: target, amount: hitData.amount, card, reason: 'sha', nature: card.nature || 'normal' });
    // 霹雳车：造成伤害后弃置目标装备区里的一张牌
    if (weapon === 'piliche' && target.alive) {
      const eq = Object.values(target.equips).filter(Boolean);
      if (eq.length) {
        await this.log(`${from.name} 的【霹雳车】：弃置 ${target.name} 的 ${cardLabel(eq[0])}`);
        await this.discardCards(target, [eq[0]], { reason: '霹雳车' });
      }
    }
    // 麒麟弓：弃坐骑
    if (weapon === 'qilin' && (target.equips.horsePlus || target.equips.horseMinus)) {
      const horses = [target.equips.horsePlus, target.equips.horseMinus].filter(Boolean);
      await this.discardCards(target, [horses[0]], { reason: '麒麟弓' });
    }
  }

  // 决斗结算：目标先出【杀】，双方轮流，先不出者受到对方 1 点伤害。
  // juedou.need 允许技能（无双等）要求每次多打出若干张【杀】。
  async resolveJuedou({ from, target, card = null, reason = 'juedou' }) {
    if (!from || !target || !target.alive) return;
    let attacker = target, defender = from;
    let guard = 0;
    while (guard++ < 20) {
      if (!attacker.alive || !defender.alive) break;
      const need = { self: attacker, from: defender, card, extraSha: 0 };
      await this.trigger('juedou.need', need);
      const n = 1 + (need.extraSha || 0);
      let got = 0;
      for (let k = 0; k < n; k++) {
        const c = await this.respondCard(attacker, {
          filter: { name: 'sha' }, reason,
          prompt: `【决斗】：请打出一张【杀】${n > 1 ? `（第 ${k + 1}/${n} 张）` : ''}`,
        });
        if (!c) break;
        got++;
      }
      if (got < n) {
        await this.damage({ from: defender, to: attacker, amount: 1, card, reason });
        break;
      }
      [attacker, defender] = [defender, attacker];
    }
  }

  // 无懈可击链：返回 true 表示原效果被抵消
  async wuxieChain(card, target, from, depth = 0) {
    if (depth > 3) return false;
    for (const p of this.alive()) {
      const cands = p.hand.filter(c => c.name === 'wuxie');
      if (!cands.length) continue;
      const c = await this.respondCard(p, {
        filter: { name: 'wuxie' }, reason: 'wuxie', optional: true,
        prompt: `是否对 ${target?.name || ''} 的【${cardName(card)}】使用【无懈可击】？`,
      });
      if (c) {
        // respondCard 已把实际牌放进弃牌堆，此处不能再 push（否则同一张【无懈】会复制一份）
        await this.log(`${p.name} 使用【无懈可击】`);
        const counter = await this.wuxieChain(card, target, p, depth + 1);
        return !counter;
      }
    }
    return false;
  }

  // ---------------- 询问 ----------------
  async ask(player, kind, params = {}) {
    if (!this.responder) throw new Error('responder missing');
    const req = {
      id: ++this.reqSeq, kind, seat: player.seat,
      prompt: params.prompt || '',
      options: params.options || null,
      cards: params.cards || null,
      targets: params.targets || null,
      min: params.min ?? 0, max: params.max ?? 1,
      optional: params.optional !== false,
      reason: params.reason || '',
      deadline: Date.now() + (params.timeout || this.config.timeout || 30000),
      extra: params.extra || null,
    };
    this.pending = req;
    this.onState?.(this);
    let res;
    try {
      res = await this.responder.ask(this, player, req);
    } finally {
      this.pending = null;
      this.onState?.(this);
    }
    return res;
  }

  async chooseOne(player, options, params = {}, { optional = false } = {}) {
    if (!options.length) return -1;
    const res = await this.ask(player, 'choice', {
      prompt: params.prompt || '请选择', options, optional, reason: params.reason || '',
    });
    if (!res || res.index == null) return -1;
    return Math.max(-1, Math.min(options.length - 1, res.index));
  }

  // 从一组牌里选 n 张（逐张询问；用于贯石斧/寒冰剑等「弃两张」类效果）
  async chooseSomeCards(player, cards, n, { prompt = '请选择', optional = true } = {}) {
    const pool = cards.filter(Boolean);
    const out = [];
    while (out.length < n && pool.length) {
      const idx = await this.chooseOne(player, pool.map(c => cardLabel(c)),
        { prompt: `${prompt}（已选 ${out.length}/${n}）` }, { optional });
      if (idx < 0 || !pool[idx]) break;
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  async chooseTargets(player, { min = 1, max = 1, candidates, prompt = '请选择目标', optional = true } = {}) {
    if (!candidates.length) return [];
    const res = await this.ask(player, 'targets', {
      prompt, targets: candidates.map(p => p.seat), min, max, optional,
    });
    const seats = res?.seats || [];
    return seats.map(s => this.players[s]).filter(p => p && candidates.includes(p));
  }

  async confirm(player, prompt) {
    const res = await this.ask(player, 'confirm', { prompt, optional: true });
    return !!(res && res.yes);
  }

  async chooseCardFrom(source, target, { reason = 'choose', includeJudge = true } = {}) {
    // 盲选规范（官方规则）：不得查看对方手牌，只能指定「手牌」这一区域里的一张；
    // 装备区 / 判定区的牌是公开信息，可以明示牌名让玩家挑。
    const handOpts = target.hand.map((c, i) => ({ c, zone: 'hand', label: target.hand.length > 1 ? `手牌（第 ${i + 1} 张）` : '手牌' }));
    const equipOpts = Object.values(target.equips).filter(Boolean).map(c => ({ c, zone: 'equip', label: `装备区：${cardLabel(c)}` }));
    const judgeOpts = includeJudge ? target.judgeZone.map(z => ({ c: z.card, zone: 'judge', label: `判定区：${cardLabel(z.card)}` })) : [];
    const pool = [...equipOpts, ...judgeOpts, ...handOpts];
    if (!pool.length) return null;
    const res = await this.ask(source, 'choice', {
      prompt: `选择 ${target.name} 的一张牌（手牌为暗选，装备区/判定区可见）`,
      options: pool.map(o => o.label), optional: false, reason,
      blindHand: handOpts.length > 0,
    });
    if (!res || res.index == null || !pool[res.index]) return pool[0].c;
    return pool[res.index].c;
  }

  // ---------------- 技能触发 ----------------
  triggerSync(event, data) {
    for (const { player, skill, trigger } of collectTriggers(this, event, data)) {
      if (trigger.once === 'turn' && player.flags[`used_${skill.id}`] === this.turnCount) continue;
      // 同步钩子同样必须先走 filter（此前遗漏：写在 filter 里的判断会被无条件执行）
      try {
        // ★SG036-r2：`game.start` 没有单一主体（派发时 self=null），但很多技能把它写成
        //   `filter: (d) => d.self === d.player`。只把 who:'self' 判对还不够，filter 里的 d.self
        //   也必须补成「拥有该技能的角色自己」，否则这 8 个技能（连谋/宏策/隽谋/鹍浴/狩骊/尽瘁…）仍被挡。
        const fself = (data.self == null && event === 'game.start') ? player : data.self;
        if (trigger.filter && !trigger.filter({ ...data, self: fself, player, game: this })) continue;
      } catch { continue; }
      try {
        const ctx = this.makeCtx(player, skill, trigger, data);
        trigger.effect(ctx); // 同步版（距离等不得 await）
      } catch (e) { /* 忽略同步钩子异常 */ }
    }
  }

  makeCtx(player, skill, trigger, data) {
    const game = this;
    return {
      game, self: player, skill, trigger, data,
      get source() { return data.from || null; },
      get target() { return data.target || data.to || null; },
      get card() { return data.card || null; },
      get cards() { return data.cards || []; },
      get amount() { return data.amount; },
      set amount(v) { data.amount = v; },
      log: (t) => game.log(t),
      notify: (t) => game.log(t),
      ask: {
        card: (p, opt) => game.respondCard(p, opt),
        choose: (p, opts, prm) => game.chooseOne(p, opts, prm),
        targets: (p, prm) => game.chooseTargets(p, prm),
        confirm: (p, prompt) => game.confirm(p, prompt),
      },
      draw: (p, n, o) => game.drawCards(p, n, o),
      discard: (p, cards, o) => game.discardCards(p, cards, o),
      gain: (p, cards, o) => game.gainCards(p, cards, o),
      damage: (o) => game.damage(o),
      recover: (p, n, o) => game.recover(p, n, o),
      loseHp: (p, n, o) => game.loseHp(p, n, o),
      judge: (p, o) => game.judge(p, o),
      useCard: (o) => game.useCard(o),
      respond: (p, o) => game.respondCard(p, o),
      range: (a, b) => game.distance(a, b),
      inRange: (a, b) => game.inAttackRange(a, b),
      flip: (t) => game.flip(t),
      setForm: (p2, form, reason) => game.setForm(p2, form, reason),
      jadeColor: (p2) => game.jadeColor(p2),
      sameClan: (a, b) => game.sameClan(a, b),
      extraTurn: (p2) => game.queueExtraTurn(p2),
      setKingdom: (p2, k, r) => game.setKingdom(p2, k, r),
      yishi: (p2, o) => game.yishi(p2, o),
      skipPhase: (p, phase) => game.skipPhase(p, phase),
      attackRange: (p) => game.attackRange(p),
    };
  }

  async trigger(event, data) {
    const list = collectTriggers(this, event, data);
    for (const { player, skill, trigger } of list) {
      if (!player.alive && !event.startsWith('death')) continue;
      // once:'turn' = 每个自己的回合最多一次（标记按回合号判定；旧实现只写标记、从不读取）
      if (trigger.once === 'turn' && player.flags[`used_${skill.id}`] === this.turnCount) continue;
      try {
        // ★SG036-r2：同 triggerSync —— game.start 下 filter 的 d.self 要补成角色自己
        const fself = (data.self == null && event === 'game.start') ? player : data.self;
        if (trigger.filter && !trigger.filter({ ...data, self: fself, player, game: this })) continue;
      } catch { continue; }
      const ctx = this.makeCtx(player, skill, trigger, data);
      if (trigger.optional) {
        const yes = await this.confirm(player, `${player.generalName}【${skill.name}】：${trigger.prompt || skill.desc || '是否发动？'}`);
        if (!yes) continue;
      }
      try {
        await trigger.effect(ctx);
      } catch (e) {
        await this.log(`⚠ 技能 ${skill.name} 执行异常：${e.message}`);
      }
      if (data.canceled) break;
      if (trigger.once === 'turn') { player.flags[`used_${skill.id}`] = this.turnCount; }
    }
    // ★装备「减少」也补派 equip.change（SG029 BLOCKER-3）：
    //   原先只有 equipCard() 一处派发 equip.change，弃置/被夺/失去装备只发 equip.lose，
    //   于是「按装备区牌数 / 护甲值重算」的技能（【飒然】【降怒】）在装备减少时永不刷新。
    //   技能文件里手工 `g.trigger('equip.lose', …)` 的 20+ 处调用点也一并被覆盖。
    if (event === 'equip.lose' && data && data.self) {
      // ★仅在「槽位已空」时补派（SG031 B2 实测）：换装路径 equipCard 是「先派 lose、再更新槽位」，
      //   若此时补派，监听者看到的 equips 仍是旧装备（精械弩 jx 仍在槽 → shaUnlimited 清完又被置 true）。
      //   换装由 equipCard 自己在槽位更新后派 equip.change，不需要这里补。
      const slotNow = data.slot ? data.self.equips?.[data.slot] : null;
      if (!slotNow && !data.noChange) {
        await this.trigger('equip.change', { self: data.self, slot: data.slot, card: null, old: data.card, lost: true });
      }
      // ★统一在 trigger 出口做「失去装备的收尾」（SG034 P1：全库 27 处手写 `equips[k]=null`
      //   + 4 个 detachEquip 都绕过 afterEquipLose → 白银狮子在这些路径上永不回复）。
      //   显式调用方（equipCard / unequipCard / swapEquipSlot）传 noLoseHook 自行调用，避免双触发。
      if (!data.noLoseHook && data.card) {
        await this.afterEquipLose(data.self, data.card);
      }
    }
  }

  addFlag(player, key, value = true) { player.flags[key] = value; }

  // M12：授予额外回合（同一角色最多排队 1 次，避免技能互相嵌套导致无限回合）
  queueExtraTurn(player) {
    if (!player || !player.alive) return false;
    if (this.extraQueue.includes(player)) return false;
    this.extraQueue.push(player);
    return true;
  }

  // M2 翻面：切换正/背面。背面朝上的角色在下个回合开始时整体跳过该回合。
  async flip(target) {
    if (!target) return;
    target.flipped = !target.flipped;
    await this.log(`${target.name} ${target.flipped ? '翻面（背面朝上）' : '翻回正面'}`);
    await this.trigger('flip.after', { self: target });
  }

  // M6 勾玉颜色：按当前体力值奇偶映射（奇数=赤玉/阳，偶数=墨玉/阴）。
  // 供「魔」系列（魔张飞【灼魂】、魔孙权【权御】）等按颜色分支的技能使用。
  // 勾玉三分支（魔系列）：绿 = 体力 > 2/3 上限；黄 = 1/3 ~ 2/3；红 = ≤ 1/3
  jadeColor(player) {
    const hp = player?.hp ?? 0;
    const max = Math.max(1, player?.maxHp ?? 1);
    if (hp * 3 > max * 2) return 'green';
    if (hp * 3 > max) return 'yellow';
    return 'red';
  }

  // M4 形态切换（入魔 / 脱离入魔）：技能可声明 form:'demon' 或 form:'normal'，仅对应形态下可用。
  async setForm(player, form, reason) {
    if (!player || player.form === form) return false;
    player.form = form;
    await this.log(`${player.name} ${form === 'demon' ? '入魔' : '脱离入魔'}${reason ? `（${reason}）` : ''}`);
    await this.trigger('form.change', { self: player, form, reason });
    return true;
  }

  // M5 同宗族判定（宗族技：同族角色共享持有）
  sameClan(a, b) { return !!(a?.clan && b?.clan && a.clan === b.clan); }

  // 双势力：变更势力（闪张辽 群→魏、闪张郃 等）
  async setKingdom(player, kingdom, reason) {
    if (!player || !kingdom || player.kingdom === kingdom) return false;
    const old = player.kingdom;
    player.kingdom = kingdom;
    await this.log(`${player.name} 势力由「${old}」变更为「${kingdom}」${reason ? `（${reason}）` : ''}`);
    await this.trigger('kingdom.change', { self: player, from: old, to: kingdom, reason });
    return true;
  }

  // 「议事」（闪刘宏【朝争】等）：全体各展示 1 张手牌，按颜色分派意见
  // 议事（红黑意见统计）。
  // ★必须 async 并在返回前派发 yishi.end：此前是同步函数、从不 trigger，
  //   `yishi.end` 只在白名单里，任何 `on:'yishi.end'` 的技能都是死代码（SG025 #10）。
  // ★payload 必须含 opinions / shown / participants（SG027 R13）：
  //   监听者（【伐异】【复谋】等）要判断「谁的意见和我不同」，只有红/黑两个数组不够——
  //   引擎原先缺 opinions，伐异 filter 里 d.opinions 恒 undefined → 永远不触发。
  //   字段口径与 skills/jsg_qi.js 的 runYishi/emitYishiEnd 完全对齐，监听者不必区分来源。
  // parts：可选，显式指定参与者（不传则「除发起者外所有有手牌的角色」）。
  async yishi(initiator, { extraRed = 0, forceRed = [], forceBlack = [], parts = null } = {}) {
    const red = [], black = [], opinions = {}, shown = {}, joined = [];
    const useParts = Array.isArray(parts) && parts.length > 0;
    const pool = useParts ? parts : this.alive();
    for (const p of pool) {
      if (!p || !p.alive || !p.hand.length) continue;
      if (!useParts && p === initiator) continue;   // 默认发起者不参与议事（显式传 parts 时以其为准）
      const c = p.hand[this.rng.int(p.hand.length)];
      const forced = forceRed.includes(p) ? true : forceBlack.includes(p) ? false : null;
      const isRed = forced === null ? (c.suit === 'heart' || c.suit === 'diamond') : forced;
      (isRed ? red : black).push(p);
      opinions[p.seat] = isRed ? 'red' : 'black';
      shown[p.seat] = c;
      joined.push(p);
    }
    const redN = red.length + extraRed;
    const blackN = black.length;
    const verdict = redN === blackN ? 'none' : (redN > blackN ? 'red' : 'black');
    const result = {
      red, black, redN, blackN, redWin: redN > blackN, total: redN + blackN,
      verdict, opinions, shown, participants: joined,
    };
    await this.trigger('yishi.end', { self: initiator, initiator, ...result });
    return result;
  }

  // 「失去所有武将技能」（星·管辂【锁星】②等）。
  // ★不能复用 flags.noSkills：那个只在 runTurn 开头恢复、且 collectTriggers 只跳过非锁定技、
  //   主动技面板也不隐藏。skillsDisabled 是永久性的（直到对局结束），默认连锁定技一起停。
  async disableSkills(player, { permanent = true, includeLocked = true, reason = '' } = {}) {
    if (!player) return false;
    player.flags.skillsDisabled = { permanent: !!permanent, includeLocked: !!includeLocked, reason, turn: this.turnCount };
    await this.log(`${player.name} 失去所有${includeLocked ? '' : '非锁定'}武将技能${reason ? `（${reason}）` : ''}`);
    await this.trigger('skills.disabled', { self: player, includeLocked: !!includeLocked, reason });
    // 失去技能同样要回收「挂在自己身上的私有容器牌」：笔伐等容器此时已无任何结算路径（SG028）
    await this.reclaimHeld(player);
    return true;
  }

  // 「体力变为 N 点」（【锁星】③等）：事件化，替代直接写 player.hp。
  // 走 hp.change 事件；降到 0 以下进濒死。真正「伤害/失去体力」仍应走 damage/loseHp（它们有来源与减伤链）。
  async setHp(player, hp, { reason = 'setHp', from = null, card = null } = {}) {
    if (!player) return 0;
    const before = player.hp;
    player.hp = hp;
    await this.log(`${player.name} 的体力变为 ${hp} 点${before !== hp ? `（原 ${before}）` : ''}`);
    await this.trigger('hp.change', { self: player, before, after: hp, reason, from, card });
    if (player.hp <= 0 && player.alive !== false) await this.dying(player, { from, card });
    return player.hp;
  }

  // 跳过指定阶段：设置 skip_<phase> 标记，回合流程到达该阶段时消费并记录日志。
  skipPhase(player, phase) {    if (!player || !PHASES.includes(phase)) return;
    player.flags[`skip_${phase}`] = true;
  }

  // ---------------- 回合流程 ----------------
  async runTurn(player, { extra = false } = {}) {
    this.turnPlayer = player;
    this.turnCount++;
    // M12 「轮」（round）：座位号回绕即进入新一轮（首个回合不触发）
    const prevSeat = this._lastTurnSeat;
    const prevPlayer = this._lastTurnPlayer || null;
    let newRound = false;
    // ★三个要点：
    //   ① seat 回绕才可能是新一轮；
    //   ② 「同一角色连续行动」是额外回合（executeTurn 递归），不是新一轮；
    //   ③ ★额外回合（extra=true）既不参与轮判定、也不更新「最后行动者」——
    //      放权/诏图常把额外回合授予更低座次，若参与判定会让下一回合 seat<=prevSeat 命中，
    //      把 round.end 提前触发到 p3 之前（轮边界错乱）。
    //   ④ ★只剩 1 人存活时 player === prevPlayer，「同人连续回合」判据会一直拦着，
    //      round 永不递增、round.end 永不触发 → 单人存活时每个正常回合都算新一轮。
    if (!extra) {
      const alone = this.alive().length <= 1;
      if (prevSeat != null && (alone || (player !== prevPlayer && player.seat <= prevSeat))) {
        // 新一轮开始之前，先给技能「本轮结束」的结算窗口。
        // self = 本轮最后行动的角色的（不是即将开始的这个），语义才与「本轮结束」一致
        await this.trigger('round.end', { self: prevPlayer || player, round: this.round || 1 });
        this.round = (this.round || 1) + 1;
        newRound = true;
      }
      this._lastTurnSeat = player.seat;
      this._lastTurnPlayer = player;
    }
    for (const p of this.players) { p.flags.jiu = 0; p.flags.jiuUsed = false; }
    player.flags.shaUsed = 0;
    // ★「仅本回合」的额外出杀次数必须每回合清零（SG028）。
    //   历史上所有技能都往 flags.shaExtra 里加，但【漠规②】是「永久 +1」语义，
    //   两者混用导致「本回合类效果」（【拒降】【天义】等）跨回合累积。
    //   故拆出 shaExtraTurn：本回合类效果写它、runTurn 清零；shaExtra 留给永久加成。
    player.flags.shaExtraTurn = 0;
    // 月·黄盖【诈降】/月·关羽【武圣】的本回合性效果
    player.flags.shaUnlimited = false;
    player.flags.shaMultiTarget = false;
    player.flags.nupaoExtra = 0;   // 弩炮判定加次数：每个自己的回合重置
    // 每回合刷新主动技计数（act_*）。原先从不清零，导致「出牌阶段限一次」实际变成整局一次。
    for (const k of Object.keys(player.flags)) if (k.startsWith('act_')) delete player.flags[k];
    await this.log(`—— 第 ${this.turnCount} 回合：${player.name} ——`);
    if (newRound) await this.trigger('round.begin', { self: player, round: this.round });
    // 【她的乡愁】④：下个准备阶段前失去所有技能 —— 到自己回合开始时恢复
    if (player.flags.noSkills) {
      player.flags.noSkills = false;
      await this.log(`${player.name} 的技能恢复正常`);
    }
    // ★非永久「失去技能」（disableSkills({permanent:false})）到本回合结束自动解除（SG027 R6）：
    //   旧实现只把 permanent 存进 flags 却从不读取，参数形同虚设。
    //   在自己的下一个回合开始时清除，等价于「持续到上一个自己的回合结束」。
    {
      const sdOwn = player.flags.skillsDisabled;
      if (sdOwn && !sdOwn.permanent && sdOwn.turn < this.turnCount) {
        const why = sdOwn.reason || '';
        delete player.flags.skillsDisabled;
        await this.log(`${player.name} 恢复武将技能${why ? `（${why}，时效结束）` : '（时效结束）'}`);
        await this.trigger('skills.enabled', { self: player, reason: why });
      }
    }
    await this.trigger('turn.begin', { self: player });
    // 宝物【木牛流马】：每回合开始运粮，摸一张牌
    if (player.equips?.treasure?.name === 'muniu' && player.alive !== false) {
      await this.log(`${player.name} 的【木牛流马】运粮，摸一张牌`);
      await this.drawCards(player, 1, { reason: 'muniu' });
    }
    // M2 翻面：背面朝上的角色跳过整个回合（turn.begin → 跳过全部阶段 → turn.end）
    if (player.flipped) {
      player.flipped = false;
      this.phase = null;
      await this.log(`${player.name} 翻面，跳过本回合`);
      await this.trigger('turn.end', { self: player });
      return;
    }
    for (const phase of PHASES) {
      if (!player.alive || this.over) break;
      if (player.flags[`skip_${phase}`]) {
        await this.log(`${player.name} 跳过${PHASE_CN[phase]}阶段`);
        player.flags[`skip_${phase}`] = false;
        continue;
      }
      this.phase = phase;
      await this.trigger('phase.begin', { self: player, phase });
      await this.runPhase(player, phase);
      await this.trigger('phase.end', { self: player, phase });
      // 廖化【当先】：额外出牌阶段（出牌阶段结束后立即再执行一次）
      if (phase === 'play' && player.alive && !this.over && player.flags.extraPlay) {
        player.flags.extraPlay = false;
        await this.log(`${player.name} 的额外出牌阶段`);
        await this.trigger('phase.begin', { self: player, phase: 'play' });
        await this.runPhase(player, 'play');
        await this.trigger('phase.end', { self: player, phase: 'play' });
      }
    }
    this.phase = null;
    // 闪张辽【整兵】：本回合结束时执行一个额外的出牌阶段（无额外摸牌）
    if (player.alive && !this.over && player.flags.extraPlayAtEnd) {
      player.flags.extraPlayAtEnd = false;
      this.phase = 'play';
      await this.log(`${player.name} 的额外（回合结束）出牌阶段`);
      await this.trigger('phase.begin', { self: player, phase: 'play' });
      await this.runPhase(player, 'play');
      await this.trigger('phase.end', { self: player, phase: 'play' });
      this.phase = null;
    }
    await this.trigger('turn.end', { self: player });
  }

  async runPhase(player, phase) {
    if (phase === 'judge') {
      // 判定区逐张结算（后进先出）
      while (player.judgeZone.length && player.alive) {
        const z = player.judgeZone.pop();
        if (z.name === 'xumou') { await this.resolveXumou(player, z); continue; }   // 蓄谋牌（江山如故·合）
        await this.resolveDelayed(player, z);
      }
      return;
    }
    if (phase === 'draw') {
      if (player.flags.skip_draw) { player.flags.skip_draw = false; return; }
      const d = { self: player, count: 2 };
      await this.trigger('draw.count', d);
      if (player.flags.skip_one_draw) { d.count = Math.max(0, d.count - 1); player.flags.skip_one_draw = false; }
      await this.drawCards(player, d.count, { reason: 'draw' });
      return;
    }
    if (phase === 'play') {
      // 每次进入出牌阶段（含【当先】【整兵】等额外出牌阶段）都推进一个「阶段序号」：
      // active.perPhase 主动技与技能自记的「本阶段」计数（【定叛】【戡难】【断发】【移荣】【战绝】）用它判重。
      this.playPhaseSeq = (this.playPhaseSeq || 0) + 1;
      let guard = 0;
      let fails = 0;
      while (player.alive && !this.over && guard++ < 300) {
        const res = await this.responder.askPlay(this, player);
        if (!res) break;
        if (res.endPhase) break;
        if (res.skill) {
          await this.useActiveSkill(player, res.skill, res.targets || []);
          fails = 0;
          continue;
        }
        if (!res.card) break;
        // 重铸（如【铁索连环】）：弃置该牌并摸一张，不视为使用，仍留在本出牌阶段
        if (res.recast) {
          const meta = CARD_META[res.card.name];
          if (!meta?.recast || !player.hand.includes(res.card)) {
            await this.log(`${meta?.cn || res.card.name} 不能重铸`);
            if (++fails >= 5) { await this.log(`${player.name} 连续 5 次无法出牌，结束出牌阶段`); break; }
            continue;
          }
          await this.discardCards(player, [res.card], { reason: 'recast' });
          await this.drawCards(player, 1, { reason: 'recast' });
          await this.log(`${player.name} 重铸 ${meta.cn}：弃置该牌并摸一张牌`);
          fails = 0;
          continue;
        }
        const ok = await this.useCard({
          from: player, card: res.card, targets: res.targets || [],
          asName: res.asName || null, extraCards: res.extraCards || null, reason: 'play',
        });
        if (!ok) {
          // 连续选到不能用的牌（如杀已用尽）就收手，避免刷满失败日志、空转到 guard 上限
          if (++fails >= 5) {
            await this.log(`${player.name} 连续 5 次无法出牌，结束出牌阶段`);
            break;
          }
          continue;
        }
        fails = 0;
      }
      return;
    }
    if (phase === 'discard') {
      // 手牌上限 = 当前体力 + 技能加成（如谋周瑜英姿 +体力上限）- 不屈「创」数（周泰）
      const treasure = player.equips?.treasure?.name;
      const treasureLimit = treasure === 'muniu' ? 2 : treasure === 'taiping' ? 1 : 0;
      const limit = Math.max(0, player.hp + (player.flags.handLimit || 0) + treasureLimit - ((player.buqu || []).length));
      const over = player.hand.length - limit;
      if (over > 0) {
        const res = await this.ask(player, 'discard', {
          prompt: `请弃置 ${over} 张牌`, cards: player.hand.map(c => c.id), min: over, max: over, optional: false,
        });
        const ids = res?.cardIds || [];
        const cards = ids.map(id => player.hand.find(c => c.id === id)).filter(Boolean).slice(0, over);
        if (cards.length) await this.discardCards(player, cards, { reason: 'discard' });
      }
      return;
    }
    // prepare / end 由技能钩子处理
  }

  async resolveDelayed(player, z) {
    const { card, name } = z;
    if (name === 'lebu') {
      const j = await this.judge(player, { reason: '乐不思蜀' });
      if (j.suit !== 'heart') { player.flags.skip_play = true; await this.log(`${player.name} 被【乐不思蜀】跳过出牌阶段`); }
      else await this.log(`${player.name} 判定为红桃，【乐不思蜀】失效`);
      const actual = card.__src || card;
      if (!this.discardPile.includes(actual)) this.discardPile.push(actual);
    } else if (name === 'bingliang') {
      const j = await this.judge(player, { reason: '兵粮寸断' });
      if (j.suit !== 'club') { player.flags.skip_draw = true; await this.log(`${player.name} 被【兵粮寸断】跳过摸牌阶段`); }
      else await this.log(`${player.name} 判定为梅花，【兵粮寸断】失效`);
      const actual = card.__src || card;
      if (!this.discardPile.includes(actual)) this.discardPile.push(actual);
    } else if (name === 'shandian') {
      const j = await this.judge(player, { reason: '闪电' });
      if (j.suit === 'spade' && j.num >= 2 && j.num <= 9) {
        await this.log(`⚡ ${player.name} 被【闪电】击中`);
        this.pushDiscard(card);
        await this.damage({ to: player, amount: 3, nature: 'thunder', card, reason: 'shandian' });
      } else {
        // 传给下家
        const next = this.orderFrom(player, { includeSelf: false })[0];
        if (next) { next.judgeZone.push({ card, name }); await this.log(`【闪电】移动到 ${next.name} 的判定区`); }
        else this.pushDiscard(card);
      }
    }
  }

  // 蓄谋（江山如故·合）：判定阶段开始时按置入顺序（后置先处理）依次处理；
  // 可选择使用该蓄谋牌，否则将该角色判定区内所有蓄谋牌置入弃牌堆。
  async resolveXumou(player, z) {
    const card = z.card;
    const meta = CARD_META[card.name] || {};
    const usable = meta.type !== 'equip' || !player.equips?.[meta.slot || 'weapon'];
    let use = false;
    try {
      use = usable ? await this.confirm(player, `【蓄谋】：是否使用蓄谋牌【${cardLabel(card)}】？`) : false;
    } catch { use = false; }
    if (use) {
      let targets = [];
      try {
        if (meta.target && meta.target.max !== 0) targets = this.autoTargetsFor(player, card) || [];
      } catch { targets = []; }
      try {
        const ok = await this.useCard({ from: player, card, targets, reason: 'xumou' });
        if (ok) await this.log(`${player.name} 使用了蓄谋牌【${cardLabel(card)}】`);
        else use = false;   // 使用失败（如满血吃桃、闪不可主动使用）→ 回退为置入弃牌堆，避免牌张丢失
      } catch (e) {
        await this.log(`蓄谋牌使用失败：${e.message}`);
        use = false;
      }
    }
    if (!use) {
      const rest = (player.judgeZone || []).filter((x) => x.name === 'xumou');
      player.judgeZone = (player.judgeZone || []).filter((x) => x.name !== 'xumou');
      this.pushDiscard([card, ...rest.map((x) => x.card)]);
      await this.log(`${player.name} 将判定区所有蓄谋牌置入弃牌堆`);
    }
  }

  nextTurn() {
    const n = this.players.length;
    let i = this.currentIndex;
    for (let k = 1; k <= n; k++) {
      const p = this.players[(i + k) % n];
      if (p.alive) { this.currentIndex = (i + k) % n; return true; }
    }
    return false;
  }

  checkVictory() {
    if (this.over) return;
    const r = this.mode.checkVictory?.(this);
    if (r) {
      this.over = true;
      this.result = r;
      this.log(`🏁 对局结束：${r.text || ''}`);
    }
  }

  async run() {
    await this.log(`对局开始（模式：${this.mode.name}，种子 ${this.seed}）`);
    await this.trigger('game.start', { self: null });
    this.mode.onStart?.(this);
    const startIdx = this.players.findIndex(p => p.role === 'lord');
    this.currentIndex = startIdx >= 0 ? startIdx : 0;
    let guard = 0;
    while (!this.over && guard++ < 5000) {
      const p = this.players[this.currentIndex];
      if (p && p.alive) await this.runTurn(p);
      if (this.over) break;
      // M12 额外回合（刘禅【放权】等）：被授予者立即再获得一个完整回合，用完后正常轮到下家
      const extra = this.extraQueue.shift();
      if (extra && extra.alive && !this.over) {
        await this.log(`${extra.name} 进行一个额外的回合`);
        await this.runTurn(extra, { extra: true });
        if (this.over) break;
      }
      if (!this.nextTurn()) break;
    }
    if (!this.result) {
      this.result = { winners: this.alive(), text: '对局中止' };
      this.over = true;
    }
    return this.result;
  }

  // ---------------- 序列化（下发给客户端） ----------------
  snapshot(forSeat = null) {
    // 身份局：对局中只把「自己的身份 + 主公」下发（防作弊）；对局结束后全员可见
    const hideRole = ['identity', 'junzheng'].includes(this.mode.id) && !this.over;
    return {
      seed: this.seed,
      mode: this.mode.id,
      turn: this.turnCount,
      phase: this.phase,
      currentIndex: this.currentIndex,
      over: this.over,
      result: this.result ? { text: this.result.text, winners: (this.result.winners || []).map(p => p.seat) } : null,
      deckCount: this.deck.length,
      discardCount: this.discardPile.length,
      // 最近一次使用牌（供前端展示「他人打出的牌」）：牌面 + 使用者 + 目标座位
      lastPlay: this.lastPlay || null,
      // 询问内容只发给当事人：options/cards 里含手牌 id 与暗选信息，广播出去等于亮牌
      pending: this.pending && (forSeat != null && this.pending.seat === forSeat)
        ? { kind: this.pending.kind, prompt: this.pending.prompt, deadline: this.pending.deadline, seat: this.pending.seat }
        : null,
      players: this.players.map(p => ({
        seat: p.seat, id: p.id, name: p.name, isAI: p.isAI,
        generalId: p.generalId, generalName: p.generalName, kingdom: p.kingdom,
        generalIds: p.generalIds || [p.generalId],
        hp: p.hp, maxHp: p.maxHp, armor: p.armor || 0, armorMax: p.armorMax || 0, alive: p.alive,
        moonMax: p.moonMax || 0,
        moulue: p.moulue || 0, moulueMax: p.moulueMax || 5,
        // 天工·诸葛亮：「工」标记、天机/谋牌位张数
        gong: (p.marks?.gong || 0),
        extraZone: {
          tianji: (p.extraZone?.tianji || []).length,
          mou: (p.extraZone?.mou || []).length,
        },
        hidden: !!p.hidden,
        flipped: !!p.flipped,
        buqu: (p.buqu || []).length,
        role: hideRole && p.role !== 'lord' && p.seat !== forSeat ? null : p.role,
        handCount: p.hand.length,
        hand: this.config.openHand || p.seat === forSeat ? p.hand : undefined,
        equips: p.equips, judgeZone: p.judgeZone.map(z => z.card),
        // hidden:true 的技能是内部结算技能（如【追姬·印记】），不下发给前端
        // 永久失去所有技能（【锁星】②）时清空技能表，前端技能面板随之隐藏
        skills: this.effectiveSkills(p).filter(s => !s.hidden).map(s => ({ id: s.id, name: s.name, desc: s.desc })),
        activeSkills: p.seat === forSeat ? this.activeSkillsOf(p) : undefined,
        chained: p.chained,
        marks: { ...(p.marks || {}) },
        flags: { jiu: p.flags.jiu, shaUsed: p.flags.shaUsed, skillsDisabled: !!p.flags.skillsDisabled, noSkills: !!p.flags.noSkills },
        // 距离信息（前端展示与判断攻击范围用）
        distance: forSeat != null ? this.distance(this.players[forSeat], p) : undefined,
        attackRange: forSeat != null ? this.attackRange(this.players[forSeat]) : undefined,
      })),
      logs: this.logs.slice(-80),
    };
  }
}
