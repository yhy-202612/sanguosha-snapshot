import { makeRng } from './rng.js';
import { CARD_META, EQUIP_SUB, SUIT_CN, isRed, cardName, cardLabel, buildDeck } from './cards.js';
import { collectTriggers, getSkill } from './skill.js';

export const PHASES = ['prepare', 'judge', 'draw', 'play', 'discard', 'end'];
export const PHASE_CN = { prepare: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束' };

// 女性武将（用于结姻/离间等性别判定）
const FEMALE = new Set([
  'zhenji', 'huangyueying', 'daqiao', 'sunshangxiang', 'diaochan',
  'jie_zhenji', 'jie_huangyueying', 'jie_daqiao', 'jie_sunshangxiang', 'jie_diaochan', 'mou_diaochan',
]);

// 虚拟牌规则：技能允许把某些牌当作另一个牌名使用/打出
export const VIRTUAL_RULES = [
  { skill: 'wusheng', as: 'sha', test: (cards) => cards.length === 1 && isRed(cards[0]) },
  { skill: 'longdan', as: 'sha', test: (cards) => cards.length === 1 && cards[0].name === 'shan' },
  { skill: 'longdan', as: 'shan', test: (cards) => cards.length === 1 && cards[0].name === 'sha' },
  { skill: 'qingguo', as: 'shan', test: (cards) => cards.length === 1 && !isRed(cards[0]) },
  { skill: 'jijiu', as: 'tao', test: (cards) => cards.length === 1 && isRed(cards[0]) },
  { skill: 'qixi', as: 'guohe', test: (cards) => cards.length === 1 && !isRed(cards[0]) },
  { skill: 'guose', as: 'lebu', test: (cards) => cards.length === 1 && cards[0].suit === 'diamond' },
  { skill: 'zhangba', as: 'sha', test: (cards) => cards.length === 2 },
  { skill: 'longhun', as: 'shan', test: (cards) => cards.length === 2 && cards[0].suit === cards[1].suit && cards[0].suit === 'diamond' },
  { skill: 'longhun', as: 'tao', test: (cards) => cards.length === 2 && cards[0].suit === cards[1].suit && cards[0].suit === 'heart' },
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

    this.players = seats.map((s, i) => ({
      id: s.id, seat: i, name: s.name, isAI: !!s.isAI,
      generalId: s.general?.id || 'none',
      generalName: s.general?.name || s.name,
      gender: s.general?.gender || (FEMALE.has(s.general?.id) ? 'female' : 'male'),
      kingdom: s.general?.kingdom || 'qun',
      maxHp: s.general?.hp || 4,
      hp: s.general?.hp || 4,
      hand: [], equips: { weapon: null, armor: null, horsePlus: null, horseMinus: null },
      judgeZone: [], alive: true, role: s.role || null,
      skills: (s.general?.skills || []).map(id => getSkill(id)).filter(Boolean),
      flags: {}, chained: false,
    }));
    this.players.forEach(p => {
      // 通用限定技/觉醒计数
      p.flags = {};
    });

    this.deck = buildDeck(deckEntries, this.rng);
    this.discardPile = [];

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
    const alive = this.alive();
    const i = alive.indexOf(from), j = alive.indexOf(to);
    if (i < 0 || j < 0) return 99;
    const n = alive.length;
    const raw = Math.min(Math.abs(i - j), n - Math.abs(i - j));
    const data = { self: from, to, value: raw };
    // 坐骑修正
    if (to.equips.horsePlus) data.value += 1;
    if (from.equips.horseMinus) data.value -= 1;
    this.triggerSync('distance.calc', data);
    return Math.max(1, data.value);
  }
  attackRange(p) { return p.equips.weapon ? (CARD_META[p.equips.weapon.name]?.range || 1) : 1; }
  inAttackRange(from, to) { return this.distance(from, to) <= this.attackRange(from); }

  // ---------------- 日志 ----------------
  async log(text, extra = {}) {
    const entry = { seq: ++this.logSeq, turn: this.turnCount, text, ...extra };
    this.logs.push(entry);
    this.onLog(entry);
    return entry;
  }

  // ---------------- 发牌 / 弃牌 ----------------
  popDeck(n = 1) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (!this.deck.length) {
        if (!this.discardPile.length) break;
        this.deck = this.rng.shuffle(this.discardPile);
        this.discardPile = [];
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
    const cards = player ? this.popDeck(data.count) : this.popDeck(data.count);
    if (player) {
      player.hand.push(...cards);
      await this.log(`${player.name} 摸了 ${cards.length} 张牌${toPublic ? '（' + cards.map(cardLabel).join('、') + '）' : ''}`);
    }
    await this.trigger('cards.draw.after', { self: player, cards, reason });
    return cards;
  }
  async discardCards(player, cards, { reason = 'discard' } = {}) {
    const list = cards.filter(Boolean);
    if (!list.length) return;
    await this.trigger('cards.discard', { self: player, cards: list, reason });
    for (const c of list) {
      if (player) {
        const i = player.hand.indexOf(c);
        if (i >= 0) player.hand.splice(i, 1);
        else {
          for (const k of Object.keys(player.equips)) {
            if (player.equips[k] === c) {
              player.equips[k] = null;
              await this.trigger('equip.lose', { self: player, card: c, slot: k });
            }
          }
          const j = player.judgeZone.findIndex(z => z.card === c);
          if (j >= 0) player.judgeZone.splice(j, 1);
        }
      }
      if (!this.discardPile.includes(c)) this.discardPile.push(c);
    }
    if (player) await this.log(`${player.name} 弃置了 ${list.map(cardLabel).join('、')}`);
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
    }
    await this.log(`${player.name} 获得了 ${list.length} 张牌${from ? `（来自 ${from.name}）` : ''}`);
    await this.trigger('cards.gain', { self: player, from, cards: list, reason });
  }

  // ---------------- 判定 ----------------
  async judge(player, { reason = 'judge', from = null, card = null } = {}) {
    const c = this.popDeck(1)[0];
    if (!c) return { suit: 'spade', num: 1, card: null };
    const data = { self: player, card: c, suit: c.suit, num: c.num, reason, from, source: card, canceled: false };
    await this.trigger('judge.before', data);
    await this.log(`${player.name} 判定（${reason}）：${cardLabel(c)}${data.suit !== c.suit || data.num !== c.num ? ' → 改为 ' + SUIT_CN[data.suit] + data.num : ''}`);
    this.discardPile.push(c);
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
    const data = { self: to, from, amount, nature, card, reason, canceled: false };
    // 藤甲
    const armor = to.equips.armor;
    if (armor && armor.name === 'tengjia' && nature === 'fire') data.amount += 1;
    if (armor && armor.name === 'baiyin' && data.amount > 1) data.amount = 1;
    await this.trigger('damage.before', data);
    if (data.canceled || data.amount <= 0) { await this.log(`${to.name} 免受伤害`); return; }
    to.hp -= data.amount;
    await this.log(`${to.name} 受到 ${data.amount} 点${nature === 'fire' ? '火焰' : nature === 'thunder' ? '雷电' : ''}伤害（${to.hp}/${to.maxHp}）${from ? '，来源：' + from.name : ''}`);
    await this.trigger('damage.after', data);
    // 铁索连环：先解除所有相关角色的连环，再逐一传导。
    // 原逻辑边传导边保留 chained，A 传导给 B 后 B 又向仍处于连环的 A 传导，无限递归直至栈溢出。
    if (to.chained && (nature === 'fire' || nature === 'thunder')) {
      const chained = this.alive().filter(p => p !== to && p.chained);
      to.chained = false;
      for (const p of chained) p.chained = false;
      for (const p of chained) {
        await this.log(`连环传导：${p.name}`);
        await this.damage({ from, to: p, amount: data.amount, nature, card, reason: 'tiesuo' });
      }
    }
    if (to.hp <= 0) await this.dying(to, { from, card });
  }

  // ---------------- 濒死 / 死亡 ----------------
  async dying(player, { from = null, card = null } = {}) {
    if (!player.alive) return;
    await this.trigger('dying.begin', { self: player, from });
    await this.log(`⚕ ${player.name} 进入濒死状态（${player.hp}/${player.maxHp}）`);
    let guard = 0;
    while (player.hp <= 0 && guard++ < 20) {
      let saved = false;
      for (const p of this.orderFrom(player)) {
        if (!p.alive) continue;
        if (p.hp <= 0) continue;
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

  async die(player, { from = null } = {}) {
    if (!player.alive) return;
    const data = { self: player, killer: from, canceled: false };
    await this.trigger('death.before', data);
    if (data.canceled) return;
    player.alive = false;
    player.hp = 0;
    await this.log(`☠ ${player.name} 阵亡${from ? '（击杀者：' + from.name + '）' : ''}`);
    // 弃置所有牌与判定区
    const all = [...player.hand, ...Object.values(player.equips).filter(Boolean), ...player.judgeZone.map(z => z.card)];
    player.hand = [];
    player.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    player.judgeZone = [];
    this.discardPile.push(...all.filter(Boolean));
    await this.trigger('death.after', { self: player, killer: from });
    await this.mode.onDeath?.(this, player, from);
    this.checkVictory();
  }

  // ---------------- 出牌 ----------------
  virtualAllowed(player, cards, asName) {
    return VIRTUAL_RULES.some(r =>
      r.as === asName && player.skills.some(s => s.id === r.skill) && r.test(cards));
  }

  canUse(player, card, targets = [], asName = null, extraCards = null) {
    const effName = asName || card.name;
    const meta = CARD_META[effName];
    if (!meta) return { ok: false, reason: '未知牌' };
    if (asName) {
      const cards = [card, ...(extraCards || [])];
      if (!this.virtualAllowed(player, cards, asName)) return { ok: false, reason: `没有可将此牌当作【${meta.cn}】使用的技能` };
    }
    if (effName === 'shan' || effName === 'wuxie') return { ok: false, reason: '此牌不能主动使用' };
    if (effName === 'sha') {
      const limit = player.equips.weapon?.name === 'zhuge' ? 99 : 1;
      if ((player.flags.shaUsed || 0) >= limit && !player.flags.shaUnlimited) return { ok: false, reason: '本回合【杀】已用尽' };
    }
    const rule = meta.target;
    if (!rule) return { ok: true };
    if (typeof rule === 'function') {
      const cands = rule(this, player);
      return { ok: targets.length > 0 && targets.every(t => cands.includes(t)), candidates: cands };
    }
    const min = rule.min ?? 0, max = rule.max ?? 1;
    if (targets.length < min || targets.length > max) return { ok: false, reason: `目标数量应为 ${min}~${max}` };
    const qicai = meta.type === 'trick' && player.skills.some(s => s.id === 'qicai');
    for (const t of targets) {
      if (!t.alive) return { ok: false, reason: '目标已阵亡' };
      if (t === player && !rule.self) return { ok: false, reason: '不能以自己为目标' };
      if (t !== player && rule.self && !rule.others && !rule.all) return { ok: false, reason: '只能以自己为目标' };
      if (rule.range && !this.inAttackRange(player, t)) return { ok: false, reason: '目标不在攻击范围内' };
      if (rule.distance != null && !qicai && this.distance(player, t) > rule.distance) return { ok: false, reason: '目标距离过远' };
    }
    return { ok: true };
  }

  candidatesFor(player, card) {
    const meta = CARD_META[card.name];
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
    if (rule.range) cands = cands.filter(p => this.inAttackRange(player, p));
    if (rule.distance != null) cands = cands.filter(p => this.distance(player, p) <= rule.distance);
    return cands;
  }

  async useCard({ from, card, targets = [], reason = 'play', virtual = false, asName = null, extraCards = null }) {
    if (!card || !from.alive) return false;
    const effName = asName || card.name;
    const meta = CARD_META[effName];
    if (!meta) return false;
    const check = this.canUse(from, card, targets, asName, extraCards);
    if (!check.ok) { await this.log(`✗ ${from.name} 使用 ${cardLabel(card)} 失败：${check.reason}`); return false; }
    const useData = { self: from, card, effName, targets, reason };
    await this.trigger('card.use.before', useData);
    if (useData.canceled) return false;

    // 移出手牌（含虚拟牌消耗的额外手牌）
    const spent = [card, ...(extraCards || [])];
    for (const c of spent) {
      const i = from.hand.indexOf(c);
      if (i >= 0) from.hand.splice(i, 1);
    }
    const effCard = asName ? { ...card, name: effName, __src: card } : card;
    this.table.push(card);
    await this.log(`${from.name} ${asName ? `将 ${cardLabel(card)} 当【${meta.cn}】使用` : `使用 ${cardLabel(card)}`}${targets.length ? ' → ' + targets.map(t => t.name).join('、') : ''}`);
    if (effName === 'sha') from.flags.shaUsed = (from.flags.shaUsed || 0) + 1;

    // 逐个目标结算（技能可取消或转移目标）
    const finalTargets = [];
    for (const t0 of targets) {
      const td = { self: from, target: t0, card: effCard, canceled: false, used: finalTargets.slice() };
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
    } else {
      const isTrick = meta.type === 'trick';
      let negated = false;
      if (isTrick && reason !== 'wuxie') negated = await this.wuxieChain(effCard, finalTargets[0] || from, from);
      if (!negated) {
        await this.trigger('card.effect.before', { self: from, card: effCard, targets: finalTargets, reason });
        await meta.effect(this, { from, card: effCard, targets: finalTargets });
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
    this.discardPile.push(...[...new Set(spent)].filter(c => !inPlay.has(c)));
    await this.trigger('card.use.after', useData);
    await this.checkHandChange(from);
    return true;
  }

  // 主动技：出牌阶段发动（如制衡/苦肉/青囊）
  async useActiveSkill(player, skillId, targets = []) {
    const sk = player.skills.find(s => s.id === skillId);
    if (!sk || !sk.active) { await this.log(`✗ ${player.name} 无法发动该技能`); return false; }
    const key = `act_${skillId}`;
    if (sk.active.perTurn && (player.flags[key] || 0) >= 1) { await this.log(`✗ ${sk.name} 本回合已发动过`); return false; }
    player.flags[key] = (player.flags[key] || 0) + 1;
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

  activeSkillsOf(player) {
    return player.skills
      .filter(s => s.active && (!s.active.perTurn || !(player.flags[`act_${s.id}`] >= 1)))
      .map(s => ({ id: s.id, name: s.name, desc: s.desc }));
  }

  async equipCard(player, card) {
    const sub = CARD_META[card.name].sub;
    const slot = EQUIP_SUB[sub];
    const old = player.equips[slot];
    if (old) {
      if (!this.discardPile.includes(old)) this.discardPile.push(old);
      await this.log(`${player.name} 弃置了 ${cardLabel(old)}`);
      await this.trigger('equip.lose', { self: player, card: old, slot });
    }
    player.equips[slot] = card;
    await this.log(`${player.name} 装备 ${cardLabel(card)}`);
    await this.trigger('equip.change', { self: player, slot, card, old });
  }

  placeDelayed(target, card, name) {
    target.judgeZone.push({ card, name });
  }

  // ---------------- 响应 ----------------
  matchFilter(card, filter = {}) {
    if (!filter || !Object.keys(filter).length) return true;
    if (filter.name && card.name !== filter.name) return false;
    if (filter.names && !filter.names.includes(card.name)) return false;
    if (filter.type && card.type !== filter.type) return false;
    if (filter.suit && !filter.suit.includes(card.suit)) return false;
    if (filter.red != null && isRed(card) !== filter.red) return false;
    if (filter.excludeName && card.name === filter.excludeName) return false;
    return true;
  }

  async respondCard(player, opt) {
    if (!player || !player.alive) return null;
    const data = { self: player, filter: opt.filter, handled: false, card: null };
    await this.trigger('respond.need', data);
    let card = null;
    if (data.handled && data.card) {
      card = data.card;
    } else {
      const cands = player.hand.filter(c => this.matchFilter(c, opt.filter));
      if (!cands.length) return null;
      const res = await this.ask(player, 'card', {
        prompt: opt.prompt || '请选择一张牌（或取消）',
        cards: cands.map(c => c.id),
        optional: opt.optional !== false,
        reason: opt.reason || 'respond',
      });
      if (!res || !res.cardId) return null;
      card = cands.find(c => c.id === res.cardId) || null;
      if (!card) return null;
    }
    // 打出的牌从手牌移出并进入弃牌堆
    const actual = card.__src || card;
    const i = player.hand.indexOf(actual);
    if (i >= 0) player.hand.splice(i, 1);
    if (!this.discardPile.includes(actual)) this.discardPile.push(actual);
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

  async requireDodge(target, { from, card, reason = 'sha', prompt } = {}) {
    const data = { self: target, from, card, dodged: false, extraDodge: 0 };
    await this.trigger('dodge.before', data);
    if (data.dodged) return true;
    if (card && (target.flags.noShan === card.id || target.flags.noShanTurn === this.turnCount)) {
      await this.log(`${target.name} 本回合不能使用【闪】`);
      return false;
    }
    const armor = target.equips.armor;
    const ignoreArmor = from?.equips?.weapon?.name === 'qinggang';
    if (armor && armor.name === 'bagua' && !ignoreArmor) {
      const j = await this.judge(target, { reason: '八卦阵', from });
      if (isRed({ suit: j.suit })) { await this.log(`${target.name} 的【八卦阵】生效，视为打出【闪】`); return true; }
    }
    const need = 1 + (data.extraDodge || 0);
    let got = 0;
    for (let k = 0; k < need; k++) {
      const c = await this.respondCard(target, {
        filter: { name: 'shan' }, reason, optional: true,
        prompt: prompt || `${from ? from.name + ' 对你使用【杀】，' : ''}请打出一张【闪】${need > 1 ? `（第 ${k + 1}/${need} 张）` : ''}`,
      });
      if (!c) break;
      got++;
      await this.log(`${target.name} 打出【闪】${SUIT_CN[c.suit] || ''}${c.num || ''}`);
    }
    return got >= need;
  }

  async resolveSha(from, target, card) {
    const armor = target.equips.armor;
    const ignoreArmor = from.equips.weapon?.name === 'qinggang';
    if (armor && !ignoreArmor) {
      if (armor.name === 'renwang' && !isRed(card)) { await this.log(`${target.name} 的【仁王盾】使黑杀无效`); return; }
      if (armor.name === 'tengjia' && card.nature !== 'fire') { await this.log(`${target.name} 的【藤甲】使普通杀无效`); return; }
    }
    const dodged = await this.requireDodge(target, { from, card, reason: 'sha' });
    if (dodged) {
      await this.trigger('sha.dodged', { self: from, target, card });
      await this.trigger('dodge.after', { self: target, from, card });
      return;
    }
    let amount = 1;
    if (from.flags.jiu) { amount += 1; from.flags.jiu = 0; }
    if (from.equips.weapon?.name === 'guding' && target.hand.length === 0) amount += 1;
    await this.trigger('sha.hit', { self: from, target, card, amount });
    await this.damage({ from, to: target, amount, card, reason: 'sha', nature: card.nature || 'normal' });
    // 麒麟弓：弃坐骑
    if (from.equips.weapon?.name === 'qilin' && (target.equips.horsePlus || target.equips.horseMinus)) {
      const horses = [target.equips.horsePlus, target.equips.horseMinus].filter(Boolean);
      await this.discardCards(target, [horses[0]], { reason: '麒麟弓' });
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
    const pool = [
      ...target.hand.map(c => ({ c, zone: 'hand' })),
      ...Object.values(target.equips).filter(Boolean).map(c => ({ c, zone: 'equip' })),
      ...(includeJudge ? target.judgeZone.map(z => ({ c: z.card, zone: 'judge' })) : []),
    ];
    if (!pool.length) return null;
    const options = pool.map(x => ({ id: x.c.id, label: cardLabel(x.c), zone: x.zone }));
    const res = await this.ask(source, 'choice', {
      prompt: `选择 ${target.name} 的一张牌`, options: options.map(o => o.label), optional: false, reason,
    });
    if (!res || res.index == null) return pool[0].c;
    return pool[res.index].c;
  }

  // ---------------- 技能触发 ----------------
  triggerSync(event, data) {
    for (const { player, skill, trigger } of collectTriggers(this, event, data)) {
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
    };
  }

  async trigger(event, data) {
    const list = collectTriggers(this, event, data);
    for (const { player, skill, trigger } of list) {
      if (!player.alive && !event.startsWith('death')) continue;
      try {
        if (trigger.filter && !trigger.filter({ ...data, self: data.self, player, game: this })) continue;
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
  }

  addFlag(player, key, value = true) { player.flags[key] = value; }

  // ---------------- 回合流程 ----------------
  async runTurn(player) {
    this.turnPlayer = player;
    this.turnCount++;
    for (const p of this.players) p.flags.jiu = 0;
    player.flags.shaUsed = 0;
    await this.log(`—— 第 ${this.turnCount} 回合：${player.name} ——`);
    await this.trigger('turn.begin', { self: player });
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
    }
    this.phase = null;
    await this.trigger('turn.end', { self: player });
  }

  async runPhase(player, phase) {
    if (phase === 'judge') {
      // 判定区逐张结算（后进先出）
      while (player.judgeZone.length && player.alive) {
        const z = player.judgeZone.pop();
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
      let guard = 0;
      while (player.alive && !this.over && guard++ < 300) {
        const res = await this.responder.askPlay(this, player);
        if (!res) break;
        if (res.endPhase) break;
        if (res.skill) {
          await this.useActiveSkill(player, res.skill, res.targets || []);
          continue;
        }
        if (!res.card) break;
        const ok = await this.useCard({
          from: player, card: res.card, targets: res.targets || [],
          asName: res.asName || null, extraCards: res.extraCards || null, reason: 'play',
        });
        if (!ok) continue;
      }
      return;
    }
    if (phase === 'discard') {
      const over = player.hand.length - Math.max(0, player.hp);
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
        this.discardPile.push(card);
        await this.damage({ to: player, amount: 3, nature: 'thunder', card, reason: 'shandian' });
      } else {
        // 传给下家
        const next = this.orderFrom(player, { includeSelf: false })[0];
        if (next) { next.judgeZone.push({ card, name }); await this.log(`【闪电】移动到 ${next.name} 的判定区`); }
        else this.discardPile.push(card);
      }
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
    const hideRole = ['identity', 'junzheng'].includes(this.mode.id);
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
      pending: this.pending ? { ...this.pending, deadline: this.pending.deadline } : null,
      players: this.players.map(p => ({
        seat: p.seat, id: p.id, name: p.name, isAI: p.isAI,
        generalId: p.generalId, generalName: p.generalName, kingdom: p.kingdom,
        hp: p.hp, maxHp: p.maxHp, alive: p.alive,
        role: hideRole && p.role !== 'lord' && p.seat !== forSeat ? null : p.role,
        handCount: p.hand.length,
        hand: this.config.openHand || p.seat === forSeat ? p.hand : undefined,
        equips: p.equips, judgeZone: p.judgeZone.map(z => z.card),
        skills: p.skills.map(s => ({ id: s.id, name: s.name, desc: s.desc })),
        activeSkills: p.seat === forSeat ? this.activeSkillsOf(p) : undefined,
        chained: p.chained,
        flags: { jiu: p.flags.jiu, shaUsed: p.flags.shaUsed },
      })),
      logs: this.logs.slice(-80),
    };
  }
}
