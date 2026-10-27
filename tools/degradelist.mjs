import fs from 'fs';
import path from 'path';
const dir = 'src/skills';
const rows = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  // 粗略切分 defineSkill 块
  const re = /defineSkill\(\{([\s\S]*?)\n\}\);/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[1];
    const idM = body.match(/id:\s*'([^']+)'/);
    const nameM = body.match(/name:\s*'([^']+)'/);
    const descM = body.match(/desc:\s*'([\s\S]*?)',\n/);
    if (!idM) continue;
    const desc = descM ? descM[1] : '';
    if (!/(降级|未实现|近似|暂不|仅实现|仅保留)/.test(desc)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const mark = (desc.match(/（(?:实现|降级)[:：]([^）]*)）/) || [])[1]
      || (desc.match(/（(?:实现|降级)[:：]([\s\S]*?)）/) || [])[1] || '';
    rows.push({ file: f.replace('.js', ''), line, id: idM[1], name: nameM ? nameM[1] : '', mark: mark.trim() });
  }
}
const byFile = {};
for (const r of rows) (byFile[r.file] = byFile[r.file] || []).push(r);
let out = `# 降级/未完全实现技能清单（自动提取，${rows.length} 条）\n\n`;
for (const [f, list] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
  out += `\n## ${f}（${list.length} 条）\n\n| # | 行 | 技能 id | 名称 | desc 里的降级说明 |\n|---|---|---|---|---|\n`;
  list.forEach((r, i) => { out += `| ${i + 1} | ${r.line} | \`${r.id}\` | 【${r.name}】 | ${r.mark.replace(/\|/g, '／').slice(0, 150) || '（见 desc）'} |\n`; });
}
fs.writeFileSync('docs/degrade-inventory.md', out);
console.log('提取', rows.length, '条 → docs/degrade-inventory.md');
console.log('文件分布:', Object.entries(byFile).map(([k, v]) => k + ':' + v.length).join(' '));
