// 技能注册表：技能只通过 defineSkill 注册，引擎按事件分发
const REGISTRY = new Map();

const VALID_EVENTS = new Set([
  'game.start', 'turn.begin', 'turn.end', 'phase.begin', 'phase.end',
  'cards.draw', 'cards.draw.after', 'cards.discard', 'cards.gain', 'cards.lose',
  'judge.before', 'judge.after',
  'card.use.before', 'card.use.after', 'card.effect.before', 'card.effect.after',
  'target.before', 'target.after', 'sha.target', 'juedou.need',
  'damage.before', 'damage.after', 'hp.lose', 'hp.recover',
  'dying.begin', 'dying.end', 'death.before', 'death.after',
  'dodge.before', 'dodge.after', 'sha.dodged', 'sha.hit',
  'respond.need', 'equip.change', 'equip.lose', 'distance.calc', 'hand.change', 'draw.count',
]);

export function defineSkill(skill) {
  if (!skill || !skill.id) throw new Error('skill.id required');
  if (REGISTRY.has(skill.id)) return REGISTRY.get(skill.id);
  for (const t of skill.triggers || []) {
    if (!VALID_EVENTS.has(t.on)) throw new Error(`unknown event ${t.on} in skill ${skill.id}`);
    if (typeof t.effect !== 'function') throw new Error(`skill ${skill.id} trigger ${t.on} needs effect()`);
  }
  REGISTRY.set(skill.id, { triggers: [], priority: 0, ...skill });
  return REGISTRY.get(skill.id);
}

export function getSkill(id) {
  if (REGISTRY.has(id)) return REGISTRY.get(id);
  // 降级：jie_/mou_/ji_ 前缀的技能若未单独实现，复用标准包同名技能（待协作任务补齐真实技能）
  const base = String(id).replace(/^(jie_|mou_|ji_)/, '');
  if (base !== id && REGISTRY.has(base)) {
    const s = REGISTRY.get(base);
    return { ...s, id, fallbackOf: base };
  }
  return null;
}
export function hasSkill(id) { return !!getSkill(id); }
export function allSkills() { return [...REGISTRY.values()]; }
export function skillIds() { return [...REGISTRY.keys()]; }

export function validEvents() { return [...VALID_EVENTS]; }

// 收集本次事件所有可发动的技能触发，按 priority 降序
export function collectTriggers(game, event, data) {
  const out = [];
  for (const p of game.players) {
    if (!p.alive && !(event.startsWith('dying') || event === 'death.after')) continue;
    for (const sk of p.skills || []) {
      for (const tr of sk.triggers || []) {
        if (tr.on !== event) continue;
        if (tr.who === 'self' && data.self !== p) continue;
        if (tr.who === 'any' || tr.who === undefined) {
          // 由 filter 决定
        }
        out.push({ player: p, skill: sk, trigger: tr, priority: tr.priority ?? sk.priority ?? 0 });
      }
    }
  }
  out.sort((a, b) => b.priority - a.priority);
  return out;
}
