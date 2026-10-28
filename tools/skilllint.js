// 技能静态巡检（skilllint）：用正则对 src/skills/*.js 做「已知坑」模式扫描。
// 用途：新增批次后快速发现历史上反复踩过的写法错误（不替代 *_check.js 的行为断言）。
// 用法：node tools/skilllint.js [--verbose]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ★SG036：Windows 下 URL.pathname 是 '/C:/xxx'，path.resolve 会拼出 'C:\\C:\\xxx' → 扫不到文件。
//   必须用 fileURLToPath 转成本地路径。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_DIR = path.join(ROOT, 'src/skills');
const verbose = process.argv.includes('--verbose');

let pass = 0;
const bad = [];
const warn = [];

function ok(cond, msg) {
  if (cond) pass++;
  else bad.push(msg);
}
function note(msg) { warn.push(msg); }

const files = fs.readdirSync(SKILL_DIR).filter(f => f.endsWith('.js') && f !== 'index.js');
const srcOf = new Map(files.map(f => [f, fs.readFileSync(path.join(SKILL_DIR, f), 'utf8')]));

// ---------- 1. 禁用前缀（会触发引擎 getSkill 的静默降级） ----------
const BANNED = ['jie_', 'mou_', 'ji_', 'shen_', 'sp_', 'ol_'];
{
  const hits = [];
  for (const [f, src] of srcOf) {
    for (const m of src.matchAll(/\bid:\s*'([^']+)'/g)) {
      const id = m[1];
      // 界/谋/极 系列本身是既有数据，只检查「非对应包」文件里新加的这些前缀
      const legacy = ['jie.js', 'mou.js', 'ji.js', 'mou2.js', 'mou3.js', 'mou4.js', 'jie2.js', 'shen.js', 'shenwu.js', 'flash.js', 'flash2.js', 'flash3.js', 'mo.js', 'mo2.js', 'mo3.js', 'mouding.js', 'clan.js', 'clan2.js', 'shi.js', 'you.js'];
      if (legacy.includes(f)) continue;
      if (BANNED.some(b => id.startsWith(b))) hits.push(`${f}: ${id}`);
    }
  }
  ok(!hits.length, `技能 id 使用了禁用前缀（会静默降级）：${hits.slice(0, 8).join('、')}`);
}

// ---------- 2. rng.shuffle 未赋值（历史 bug：牌堆没洗） ----------
{
  const hits = [];
  for (const [f, src] of srcOf) {
    for (const line of src.split('\n')) {
      if (!/rng\.shuffle\(/.test(line)) continue;
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) continue;
      const consumed = /=\s*[^=]*rng\.shuffle\(/.test(t) || /return .*rng\.shuffle\(/.test(t) || /\bof\s+[\w.$]*rng\.shuffle\(/.test(t);
      if (!consumed) hits.push(`${f}: ${t.slice(0, 90)}`);
    }
  }
  ok(!hits.length, `rng.shuffle() 返回值被丢弃（牌不会洗）：${hits.slice(0, 6).join(' | ')}`);
}

// ---------- 3. damage 用位置参数（引擎签名是对象） ----------
{
  const hits = [];
  for (const [f, src] of srcOf) {
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      // 形如 damage(p, 1) / damage(target, 2 / damage(self, x)
      if (/\bdamage\(\s*[A-Za-z_$][\w.$]*\s*,\s*[0-9A-Za-z_$]/.test(line) && !/\.damage\(\{/.test(line)) {
        hits.push(`${f}:${i + 1} ${line.trim().slice(0, 80)}`);
      }
    });
  }
  ok(!hits.length, `damage() 疑似用位置参数（应为 damage({from,to,amount})）：${hits.slice(0, 6).join(' | ')}`);
}

// ---------- 4. distance.calc 走 triggerSync：effect 内不得 await ----------
{
  const hits = [];
  for (const [f, src] of srcOf) {
    const blocks = src.split(/defineSkill\(\{/).slice(1);
    for (const b of blocks) {
      if (!/on:\s*'distance\.calc'/.test(b)) continue;
      const idm = b.match(/id:\s*'([^']+)'/);
      const id = idm ? idm[1] : '?';
      // 取到下一个 on: 之前的段落
      const seg = b.slice(b.indexOf("on: 'distance.calc'"));
      const nextOn = seg.indexOf("on: '", 5);
      const block = nextOn > 0 ? seg.slice(0, nextOn) : seg.slice(0, 900);
      if (/async\s+effect/.test(block)) hits.push(`${f}: ${id}`);
    }
  }
  ok(!hits.length, `distance.calc 的 effect 里出现 await（triggerSync 是同步调用，会报错/丢效果）：${hits.join('、')}`);
}

// ---------- 5. 技能必须有 desc ----------
{
  const missing = [];
  for (const [f, src] of srcOf) {
    const blocks = src.split(/defineSkill\(\{/).slice(1);
    for (const b of blocks) {
      const idm = b.match(/id:\s*'([^']+)'/);
      if (!idm) continue;
      const head = b.slice(0, 600);
      if (!/\bdesc:\s*['"`]/.test(head) && !/\bdesc:/.test(head)) missing.push(`${f}: ${idm[1]}`);
    }
  }
  ok(missing.length <= 3, `技能缺少 desc 的描述：${missing.slice(0, 10).join('、')}${missing.length > 3 ? ` 等 ${missing.length} 个` : ''}`);
}

// ---------- 6. 技能 id 全局唯一 ----------
{
  const seen = new Map();
  const dup = [];
  for (const [f, src] of srcOf) {
    for (const m of src.matchAll(/\bid:\s*'([^']+)'/g)) {
      const id = m[1];
      if (seen.has(id)) dup.push(`${id}（${seen.get(id)} / ${f}）`);
      else seen.set(id, f);
    }
  }
  ok(!dup.length, `技能 id 重复定义：${dup.slice(0, 8).join('、')}`);
}

// ---------- 7. 触发器事件名必须在 VALID_EVENTS 白名单内 ----------
{
  const { VALID_EVENTS } = await import('../src/engine/skill.js');
  const validSet = VALID_EVENTS instanceof Set ? VALID_EVENTS : new Set(VALID_EVENTS || []);
  const hits = [];
  if (validSet.size) {
    for (const [f, src] of srcOf) {
      for (const m of src.matchAll(/(?:^|[^A-Za-z_])on:\s*'([a-z][a-z.]*)'/g)) {
        if (!validSet.has(m[1])) hits.push(`${f}:'${m[1]}'`);
      }
    }
  } else note('VALID_EVENTS 未导出，跳过事件名白名单校验');
  ok(!hits.length, `触发了未注册的事件名：${[...new Set(hits)].slice(0, 8).join('、')}`);
}

// ---------- 8. 主动技必须带 prompt（前端按钮与 AI 提示依赖它） ----------
{
  const missing = [];
  for (const [f, src] of srcOf) {
    for (const m of src.matchAll(/active:\s*\{/g)) {
      const seg = src.slice(m.index, m.index + 260);
      const idBack = src.slice(Math.max(0, m.index - 900), m.index).match(/id:\s*'([^']+)'/g);
      const id = idBack ? idBack[idBack.length - 1].replace(/.*'(.*)'.*/, '$1') : '?';
      if (!/prompt:/.test(seg)) missing.push(`${f}: ${id}`);
    }
  }
  if (missing.length) note(`主动技缺少 prompt（前端按钮文案会退化为技能名）：${missing.slice(0, 10).join('、')}`);
  else pass++;
}

// ---------- 输出 ----------
console.log(`skilllint：通过 ${pass} / 失败 ${bad.length}（扫描 ${files.length} 个技能文件）`);
if (bad.length) {
  console.log('失败项：');
  for (const b of bad) console.log('  ✗', b);
}
if (verbose && warn.length) {
  console.log('提示：');
  for (const w of warn) console.log('  ·', w);
}
process.exit(bad.length ? 1 : 0);
