// 技能覆盖率：node tools/skillcoverage.js
// 统计 界/谋/极/神 武将引用的技能哪些已独立实装、哪些仍在走前缀降级复用。
import '../src/skills/index.js';
import { skillIds, getSkill } from '../src/engine/skill.js';
import { GENERALS } from '../src/data/generals.js';

const ids = new Set(skillIds());
const PREFIX = /^(jie|mou|ji|shen)_/;
const by = { jie: { tot: 0, miss: [] }, mou: { tot: 0, miss: [] }, ji: { tot: 0, miss: [] }, shen: { tot: 0, miss: [] } };
let tot = 0, cov = 0;
for (const g of GENERALS) {
  for (const s of g.skills || []) {
    if (!PREFIX.test(s)) continue;
    const k = s.split('_')[0];
    tot++; by[k].tot++;
    if (ids.has(s)) cov++;
    else by[k].miss.push(`${g.id} → ${s}（${g.name}）`);
  }
}
console.log(`扩展包技能引用 ${tot}，已实装 ${cov}，缺口 ${tot - cov}`);
for (const k of Object.keys(by)) {
  if (!by[k].tot) continue;
  const miss = by[k].tot - by[k].miss.length;
  console.log(`\n[${k}] ${miss}/${by[k].tot} 已实装`);
  for (const m of by[k].miss) console.log('  缺口:', m);
}
