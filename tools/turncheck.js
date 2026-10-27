#!/usr/bin/env node
// 技能限次与「自动目标」守门（无第三方依赖）：node tools/turncheck.js
// 1) perTurn 主动技 = 每个自己的回合一次（历史上被写成「整局一次」，本脚本锁定该回归）
// 2) once:'turn' 触发器 = 每回合一次（旧实现只写标记、从不读取）
// 3) 「仅自己 / 全体」类锦囊自动确定目标，玩家/调用方无需传入 targets
import '../src/skills/index.js';
import { Game, CARD_META } from '../src/engine/index.js';
import { deckEntries } from '../src/data/deck.js';
import { defineSkill, getSkill } from '../src/engine/skill.js';

let pass = 0, fail = 0;
const bad = [];
const ok = (cond, msg) => { if (cond) pass++; else { fail++; bad.push(msg); console.log('  ✗', msg); } };

const MODE = { id: 'test', name: '限次回归', setup() {}, checkVictory() { return null; } };
const seat = (i) => ({ id: `s${i}`, name: `P${i}`, isAI: false, general: { id: `t${i}`, name: `T${i}`, hp: 4, kingdom: 'qun', skills: [] } });
const card = (id, name, suit = 'heart', num = 1) => ({ id, name, suit, num, type: CARD_META[name]?.type });

// 一律不响应（不主动出无懈/闪/杀），让用例只验证引擎自身行为
const resp = { async askPlay() { return { endPhase: true }; }, async ask() { return null; } };

function makeGame(n = 2) {
  const g = new Game({ seats: Array.from({ length: n }, (_, i) => seat(i)), mode: MODE, seed: 11, responder: resp, deckEntries: deckEntries('standard') });
  g.players.forEach(p => { p.hand.length = 0; });
  return g;
}

defineSkill({
  id: 't_perturn', name: '测试每回合', desc: '每回合一次',
  active: { perTurn: true, effect: async (ctx) => { ctx.game.__pt = (ctx.game.__pt || 0) + 1; } },
});
defineSkill({
  id: 't_once', name: '测试触发', desc: '每回合一次',
  triggers: [{ on: 'turn.begin', once: 'turn', effect: (ctx) => { ctx.game.__once = (ctx.game.__once || 0) + 1; } }],
});

async function main() {
  // ---- 1) perTurn 主动技：同回合只能一次，跨回合恢复 ----
  {
    const g = makeGame(2);
    const p = g.players[0];
    p.skills = [getSkill('t_perturn')];
    g.turnCount = 5;
    const r1 = await g.useActiveSkill(p, 't_perturn');
    const r2 = await g.useActiveSkill(p, 't_perturn');
    ok(r1 === true, 'perTurn 主动技本回合首次发动应成功');
    ok(r2 === false, 'perTurn 主动技本回合第二次发动应被拒绝');
    ok(g.__pt === 1, `perTurn 主动技本回合应只执行 1 次（实际 ${g.__pt}）`);
    ok(!g.activeSkillsOf(p).some(s => s.id === 't_perturn'), '本回合已发动后不应再出现在可选主动技列表');
    g.turnCount = 6;
    ok(g.activeSkillsOf(p).some(s => s.id === 't_perturn'), '下一回合应重新出现在可选主动技列表');
    const r3 = await g.useActiveSkill(p, 't_perturn');
    ok(r3 === true && g.__pt === 2, '下一回合应可再次发动（不能变成「整局只能一次」）');
    // 另一名玩家不受影响
    const q = g.players[1];
    q.skills = [getSkill('t_perturn')];
    ok((await g.useActiveSkill(q, 't_perturn')) === true, '其他玩家的 perTurn 计数应互不影响');
  }

  // ---- 2) once:'turn' 触发器：每回合一次 ----
  {
    const g = makeGame(2);
    const p = g.players[0];
    p.skills = [getSkill('t_once')];
    g.turnCount = 3;
    await g.trigger('turn.begin', { self: p });
    await g.trigger('turn.begin', { self: p });
    ok(g.__once === 1, `once:'turn' 触发器同一回合应只生效 1 次（实际 ${g.__once}）`);
    g.turnCount = 4;
    await g.trigger('turn.begin', { self: p });
    ok(g.__once === 2, `once:'turn' 触发器下一回合应可再触发（实际 ${g.__once}）`);
  }

  // ---- 3) 「仅自己」类锦囊自动目标 ----
  {
    const g = makeGame(3);
    const p = g.players[0];
    p.hand.length = 0;
    const wz = card('wz', 'wuzhong');
    p.hand.push(wz);
    const used = await g.useCard({ from: p, card: wz });
    ok(used === true, '【无中生有】不传 targets 也应能使用（自动指定自己）');
    ok(p.hand.length === 2, `【无中生有】应摸 2 张（实际手牌 ${p.hand.length}）`);
    ok(g.logs.some(l => /自动指定目标/.test(l.text || '')), '日志应记录「自动指定目标」');
  }

  // ---- 4) 「全体」类锦囊自动目标（不含自己） ----
  {
    const g = makeGame(3);
    const p = g.players[0];
    p.hand.length = 0;
    const wj = card('wj', 'wanjian');
    p.hand.push(wj);
    const hp0 = g.players.map(x => x.hp);
    const used = await g.useCard({ from: p, card: wj });
    ok(used === true, '【万箭齐发】不传 targets 也应能使用（自动指定全体其他角色）');
    ok(g.players[0].hp === hp0[0], '【万箭齐发】不应伤到自己');
    ok(g.players[1].hp === hp0[1] - 1 && g.players[2].hp === hp0[2] - 1, '【万箭齐发】应对其他两名角色各造成 1 点伤害');
  }

  // ---- 5) 「全体」类锦囊自动目标（含自己） ----
  {
    const g = makeGame(3);
    const p = g.players[0];
    p.hand.length = 0;
    g.players.forEach(x => { x.hp = x.maxHp - 1; });
    const ty = card('ty', 'taoyuan');
    p.hand.push(ty);
    const used = await g.useCard({ from: p, card: ty });
    ok(used === true, '【桃园结义】不传 targets 也应能使用');
    ok(g.players.every(x => x.hp === x.maxHp), '【桃园结义】应为自己与所有其他角色各回复 1 点体力');
  }

  // ---- 6) 仍需人工选目标的牌不得被自动处理 ----
  {
    const g = makeGame(3);
    const p = g.players[0];
    p.hand.length = 0;
    const sha = card('s1', 'sha');
    p.hand.push(sha);
    const used = await g.useCard({ from: p, card: sha });
    ok(used === false, '【杀】需要指定目标，不应自动选择（无目标时应使用失败）');
    ok(p.hand.includes(sha), '【杀】使用失败不应消耗手牌');
  }

  console.log(`\n技能限次/自动目标：通过 ${pass} / 失败 ${fail}`);
  if (fail) { for (const b of bad) console.log('  -', b); process.exit(1); }
}

main();
