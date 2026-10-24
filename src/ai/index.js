import { CARD_META, EQUIP_SUB } from '../engine/cards.js';

const CARD_VALUE = {
  tao: 12, wuxie: 9, sha: 6, shan: 7, jiu: 5, wuzhong: 9, guohe: 6, shunshou: 7,
  juedou: 5, jiedao: 4, wanjian: 5, nanman: 5, taoyuan: 4, wugu: 6, lebu: 4, bingliang: 4, shandian: 2,
  huogong: 4, tiesuo: 3, bagua: 8, renwang: 8, tengjia: 7, baiyin: 7,
};

function value(c) { return CARD_VALUE[c.name] ?? 3; }

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
    const act = game.activeSkillsOf(p);
    for (const s of act) {
      if (s.id === 'zhiheng' && p.hand.length >= 4) return { skill: s.id };
      if (s.id === 'kurou' && p.hp >= 3 && p.hand.length <= 3) return { skill: s.id };
      if (s.id === 'qingnang' && game.alive().some(x => x.hp < x.maxHp) && p.hand.length >= 2) return { skill: s.id };
      if (s.id === 'jieyin' && p.hand.length >= 3 && friends.some(f => f.gender === 'male' && f.hp < f.maxHp)) return { skill: s.id };
      if (s.id === 'lijian' && p.hand.length >= 2 && enemies.filter(e => e.gender === 'male').length >= 2) return { skill: s.id };
      if (s.id === 'rende' && p.hand.length >= 3 && friends.length) return { skill: s.id };
      if (s.id === 'fanjian' && p.hand.length >= 2 && enemies.length) return { skill: s.id };
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

    // 6) 杀
    const shaCards = p.hand.filter(c => c.name === 'sha');
    if (shaCards.length) {
      for (const c of shaCards) {
        const cands = game.candidatesFor(p, c).filter(t => isEnemy(game, p, t));
        if (cands.length) {
          const t = cands.sort((a, b) => a.hp - b.hp)[0];
          if (t.hp <= 2 || game.rng.next() < this.aggression) return { card: c, targets: [t] };
        }
      }
    }
    // 虚拟杀（武圣等）
    for (const c of p.hand) {
      if (game.virtualAllowed(p, [c], 'sha')) {
        const cands = game.candidatesFor(p, { name: 'sha' }).filter(t => isEnemy(game, p, t));
        if (cands.length && game.canUse(p, c, [cands[0]], 'sha').ok) return { card: c, asName: 'sha', targets: [cands[0]] };
      }
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
        return { cardIds: sorted.slice(0, Math.min(2, sorted.length)).map(c => c.id) };
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
