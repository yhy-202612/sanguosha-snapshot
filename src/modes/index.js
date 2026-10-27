// 六种模式：身份场 / 军争 / 1v1 / 斗地主 / 国战 / 虎牢关
export const MODES = {
  identity: {
    id: 'identity', name: '身份场·标准', minPlayers: 2, maxPlayers: 8, deck: 'standard',
    desc: '主公与忠臣对抗反贼，内奸自立。',
    setup(game) {
      assignRoles(game);
      const lord = game.players.find(p => p.role === 'lord');
      if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }
    },
    checkVictory(game) { return identityVictory(game); },
    async onDeath(game, dead, killer) { await identityReward(game, dead, killer); },
  },

  junzheng: {
    id: 'junzheng', name: '身份场·军争', minPlayers: 2, maxPlayers: 8, deck: 'ex',
    desc: '加入军争篇牌堆（酒/火攻/铁索/兵粮/藤甲等）的身份场。',
    setup(game) {
      assignRoles(game);
      const lord = game.players.find(p => p.role === 'lord');
      if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }
    },
    checkVictory(game) { return identityVictory(game); },
    async onDeath(game, dead, killer) { await identityReward(game, dead, killer); },
  },

  duel: {
    id: 'duel', name: '1v1 单挑', minPlayers: 2, maxPlayers: 2, deck: 'standard',
    desc: '两人对决，先手少摸一张。',
    setup(game) {
      game.players.forEach((p, i) => { p.role = i === 0 ? 'first' : 'second'; });
      // 后手 +1 手牌
      const second = game.players[1];
      if (second) game.drawRaw(second, 1);
    },
    checkVictory(game) {
      const alive = game.alive();
      if (alive.length === 1) return { winners: alive, text: `${alive[0].name} 获胜` };
      if (alive.length === 0) return { winners: [], text: '平局' };
      return null;
    },
  },

  doudizhu: {
    id: 'doudizhu', name: '斗地主', minPlayers: 3, maxPlayers: 3, deck: 'standard',
    desc: '地主（体力上限 +1、摸三张）对抗两名农民。',
    setup(game) {
      const lord = game.players[game.rng.int(3)];
      game.players.forEach(p => { p.role = p === lord ? 'landlord' : 'farmer'; });
      lord.maxHp += 1; lord.hp = lord.maxHp;
      game.drawRaw(lord, 1);
    },
    checkVictory(game) {
      const alive = game.alive();
      const lord = game.players.find(p => p.role === 'landlord');
      const farmers = game.players.filter(p => p.role === 'farmer');
      if (lord && !lord.alive) return { winners: farmers.filter(p => p.alive), text: '农民获胜' };
      if (farmers.every(p => !p.alive)) return { winners: [lord].filter(Boolean), text: '地主获胜' };
      return null;
    },
    // 地主摸牌 +1
    onTurnBegin(game, p) { if (p.role === 'landlord') p.flags.drawBonus = 1; },
  },

  guozhan: {
    id: 'guozhan', name: '国战', minPlayers: 4, maxPlayers: 8, deck: 'ex',
    desc: '按势力结盟，消灭其他势力。',
    setup(game) {
      // 按势力分组，玩家在同一势力内互为队友
      game.players.forEach(p => { p.role = p.kingdom; });
      if (game.players.length % 2 === 0) {
        // 均分两势力，避免单势力独大
        const half = Math.floor(game.players.length / 2);
        game.players.forEach((p, i) => {
          if (i < half) { p.role = 'wei'; p.kingdom = 'wei'; }
          else { p.role = 'shu'; p.kingdom = 'shu'; }
        });
      }
    },
    checkVictory(game) {
      const alive = game.alive();
      const kingdoms = [...new Set(alive.map(p => p.role))];
      if (kingdoms.length === 1) return { winners: alive, text: `${kingdoms[0] === 'wei' ? '魏' : kingdoms[0] === 'shu' ? '蜀' : kingdoms[0] === 'wu' ? '吴' : '群'}势力获胜` };
      if (!alive.length) return { winners: [], text: '同归于尽' };
      return null;
    },
  },

  hulao: {
    id: 'hulao', name: '虎牢关（PVE）', minPlayers: 2, maxPlayers: 4, deck: 'ex',
    desc: '玩家联手对抗 8 体力、每回合摸三张的吕布。',
    setup(game) {
      const boss = game.players[0];
      boss.role = 'boss';
      boss.generalName = '吕布（虎牢关）';
      boss.maxHp = 8; boss.hp = 8;
      boss.isAI = true;
      boss.flags.boss = true;
      game.players.slice(1).forEach(p => { p.role = 'hero'; });
    },
    checkVictory(game) {
      const boss = game.players[0];
      const heroes = game.players.slice(1);
      if (!boss.alive) return { winners: heroes.filter(p => p.alive), text: '联军获胜，虎牢关告破！' };
      if (heroes.every(p => !p.alive)) return { winners: [boss], text: '吕布获胜' };
      return null;
    },
    onTurnBegin(game, p) { if (p.role === 'boss') p.flags.drawBonus = 1; },
  },
};

// ---------------- 身份场内部实现 ----------------
const ROLE_TABLE = {
  2: ['lord', 'rebel'],
  3: ['lord', 'loyalist', 'rebel'],
  4: ['lord', 'loyalist', 'rebel', 'rebel'],
  5: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'],
  6: ['lord', 'loyalist', 'rebel', 'rebel', 'rebel', 'renegade'],
  7: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'renegade'],
  8: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'renegade'],
};

function assignRoles(game) {
  const n = game.players.length;
  const roles = (ROLE_TABLE[n] || ROLE_TABLE[8]).slice(0, n);
  // 房主自选身份：config.hostRole 在身份白名单内且该人数下存在这个身份，才按它指定给 0 号位（房主）
  const want = game.config?.hostRole;
  const hostRole = want && roles.includes(want) ? want : 'lord';
  const others = game.rng.shuffle(roles.filter(r => r !== hostRole));
  game.players.forEach((p, i) => { p.role = i === 0 ? hostRole : (others[i - 1] || 'rebel'); });
}

function identityVictory(game) {
  const alive = game.alive();
  const lord = game.players.find(p => p.role === 'lord');
  const rebels = alive.filter(p => p.role === 'rebel');
  const renegade = alive.filter(p => p.role === 'renegade');
  const loyal = alive.filter(p => p.role === 'loyalist');
  if (lord && !lord.alive) {
    if (alive.length === 1 && alive[0].role === 'renegade') return { winners: alive, text: '内奸独存，内奸获胜' };
    return { winners: rebels.concat(renegade.filter(() => false)), text: '主公阵亡，反贼获胜' };
  }
  if (lord && lord.alive && rebels.length === 0 && renegade.length === 0) {
    return { winners: [lord, ...loyal], text: '反贼与内奸尽灭，主忠获胜' };
  }
  return null;
}

async function identityReward(game, dead, killer) {
  if (dead.role === 'rebel' && killer && killer.alive) {
    await game.drawCards(killer, 3, { reason: 'killRebel' });
    await game.log(`${killer.name} 击杀反贼，摸三张牌`);
  }
  if (dead.role === 'loyalist' && killer && killer.role === 'lord') {
    const all = [...killer.hand, ...Object.values(killer.equips).filter(Boolean)];
    // ★原地清空，不要替换数组引用（替换会打断其他地方持有的 hand 引用）
    killer.hand.length = 0;
    killer.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null, treasure: null };
    // ★必须走 pushDiscard（去重 + 统一入口），直推 discardPile 会造成同 id 双存
    game.pushDiscard(all);
    await game.log(`主公误杀忠臣，弃置所有牌`);
  }
}

export function modeList() {
  return Object.values(MODES).map(m => ({
    id: m.id, name: m.name, minPlayers: m.minPlayers, maxPlayers: m.maxPlayers, desc: m.desc,
  }));
}
export function getMode(id) { return MODES[id] || MODES.identity; }
