#!/usr/bin/env node
// 全量技能审计：77 位武将的每一个技能是否真的实装（未注册 / 被降级成标准包同名 / 空壳无实现）
// 用法：node tools/skillaudit.js [--verbose]
import { GENERALS, PACK_CN } from '../src/data/generals.js';
import { getSkill, allSkills } from '../src/engine/skill.js';
import { VIRTUAL_RULES } from '../src/engine/game.js';
import '../src/skills/index.js';

// 引擎内建实现（不通过 trigger/active 注册，而是在 canUse / distance 计算里硬编码）
const PASSIVE_BUILTIN = new Set(['qicai', 'hongyan', 'buqu', 'wansha', 'duanliang', 'jiuchi', 'jinjiu', 'binglve']); // 硬编码在 canUse/距离、suitOf/isRedFor、dying 里（duanliang/jiuchi 走 virtual 规则；binglve 逻辑内联在 feijun）
const VIRTUAL_SKILLS = new Set(VIRTUAL_RULES.map(r => r.skill));

const VERBOSE = process.argv.includes('--verbose');
let ok = 0;
const fails = [];
const warns = [];
const perTurn = [];
const noImpl = [];
const notRegistered = [];
const downgraded = [];

const used = new Map(); // skillId -> 引用它的武将

for (const g of GENERALS) {
  for (const id of g.skills || []) {
    if (!used.has(id)) used.set(id, []);
    used.get(id).push(`${g.name}(${g.pack})`);
  }
}

for (const [id, owners] of used) {
  const sk = getSkill(id);
  const owner = owners.join('、');
  if (!sk) {
    notRegistered.push(`${id} ← ${owner}`);
    fails.push(`技能未注册：${id}（${owner}）→ 该技能在游戏内完全无效`);
    continue;
  }
  if (sk.fallbackOf) {
    downgraded.push(`${id}（降级为 ${sk.fallbackOf}）← ${owner}`);
    fails.push(`技能被静默降级：${id} 复用 ${sk.fallbackOf} 的实现（${owner}）`);
    continue;
  }
  const nTrig = (sk.triggers || []).length;
  const hasActive = !!sk.active;
  const builtin = VIRTUAL_SKILLS.has(id) || PASSIVE_BUILTIN.has(id);
  if (!nTrig && !hasActive && !builtin) {
    noImpl.push(`${id}【${sk.name}】← ${owner}`);
    fails.push(`技能是空壳：${id}【${sk.name}】既无触发器也无主动效果（${owner}）`);
    continue;
  }
  if (hasActive && sk.active.perTurn) perTurn.push(`${id}【${sk.name}】`);
  ok++;
  if (VERBOSE) console.log(`  ✓ ${id}【${sk.name}】${PACK_CN[owners[0].split('(')[1]?.replace(')', '')] || ''} triggers=${nTrig}${hasActive ? ' active' : ''}${sk.active?.perTurn ? ' perTurn' : ''}`);
}

// 注册了但没被任何武将引用的技能（可能是残留/为后续批次预留）
const referenced = new Set(used.keys());
const orphans = allSkills().filter(s => !referenced.has(s.id)).map(s => s.id);

console.log(`\n技能审计：武将 ${GENERALS.length} 位 / 技能引用 ${used.size} 个 / 实装 ${ok} / 问题 ${fails.length}`);
if (downgraded.length) console.log(`  降级：${downgraded.length}\n    - ${downgraded.join('\n    - ')}`);
if (notRegistered.length) console.log(`  未注册：${notRegistered.length}\n    - ${notRegistered.join('\n    - ')}`);
if (noImpl.length) console.log(`  空壳：${noImpl.length}\n    - ${noImpl.join('\n    - ')}`);
if (perTurn.length) console.log(`  每回合一次的主动技（${perTurn.length}）：${perTurn.join('、')}`);
if (orphans.length) console.log(`  已注册但无武将引用（${orphans.length}）：${orphans.join('、')}`);
if (fails.length) {
  console.log('\n失败：');
  for (const f of fails) console.log('  ✗', f);
  process.exit(1);
}
console.log('全部技能均已真实装。');
