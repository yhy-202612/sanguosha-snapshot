// 前端「真 AI 玩家」守门：node tools/aicheck.js
// 只做静态断言，不需要浏览器。守四件事：
//   ① 房间设置里能调 AI 开关 / 模型 / 强度，且字段真的提交给服务端
//   ② 玩家能看到 AI 的思考过程（ai-think 事件 + 桌面提示 + 战报）
//   ③ **密钥与上游地址绝不能出现在客户端**
//   ④ 服务端把不可用/熔断的大脑回落到内置 AI，且对外只回「是否就绪」
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const app = read('client/app.js');
const html = read('client/index.html');
const css = read('client/style.css');
const srv = read('src/server/index.js');
const llm = read('src/ai/llm.js');

let pass = 0, fail = 0;
const bad = [];
const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); console.log('  ✗', m); } };

// ---- ① 房间设置 ----
ok(/aiBrain:\s*room\.aiBrain/.test(app), 'A1a 房间设置应读取 room.aiBrain 回显');
ok(/st\.aiBrain\s*=\s*v/.test(app) || /st\.aiBrain = /.test(app), 'A1b 应能切换 AI 大脑开关');
ok(/aiBrain:\s*st\.aiBrain,\s*aiModel:\s*st\.aiModel,\s*aiLevel:\s*st\.aiLevel/.test(app),
  'A1c 保存时必须把 aiBrain/aiModel/aiLevel 一起提交');
ok(/'llm'/.test(app) && /'builtin'/.test(app), 'A1d 前端应同时认识 builtin 与 llm');
ok(/\['low'/.test(app) && /\['high'/.test(app), 'A1e 强度应有 low / high 两档');
ok(/refreshLLM/.test(app) && /\/api\/llm-status/.test(app), 'A1f 应拉取 llm-status 判断哪些模型可用');
ok(/芯片|chip' \+ .*dis/.test(app) || /' dis'/.test(app), 'A1g 不可用模型应标灰（dis）');
ok(/\.chip\.dis/.test(css), 'A1h chip.dis 样式必须存在，否则「不可用」看不出区别');

// ---- ② 玩家能看到 AI 动作 ----
ok(/addEventListener\('ai-think'/.test(app), 'A2a 前端必须监听 ai-think 事件');
ok(/function handleAiThink/.test(app), 'A2b 应有 handleAiThink 处理函数');
ok(/id="aiThinkHint"/.test(html), 'A2c 桌面视图应有 #aiThinkHint 提示位');
ok(/#aiThinkHint/.test(css), 'A2d #aiThinkHint 需要样式');
ok(/想了 \$\{sec\}s → /.test(app), 'A2e 战报应记录「想了多久 → 选了什么」');
ok(/连续 \$\{ev\.count/.test(app), 'A2f 熔断时战报应说明已切回内置 AI');
ok(/\.seatcard \.think/.test(css) && /class="think"/.test(app), 'A2g 房间座位应显示思考中');
ok(/40000/.test(app), 'A2h 思考提示应有 40 秒超时清理，避免服务端异常后一直显示');
ok(/setInterval\(aiThinkTick, 1000\)/.test(app), 'A2i 思考计时应每秒刷新');

// ---- ③ 客户端零密钥 ----
for (const f of ['client/app.js', 'client/index.html', 'client/audio.js', 'client/style.css']) {
  const t = read(f);
  ok(!/DEEPSEEK_API_KEY|GLM_API_KEY|sk-[A-Za-z0-9]{8}/.test(t), `A3 客户端文件不得出现密钥：${f}`);
  ok(!/api\.deepseek\.com|wawapii\.com/.test(t), `A3 客户端不得直连上游：${f}`);
}

// ---- ④ 服务端契约 ----
ok(/function usableBrain/.test(srv) && /b\.alive\(\)/.test(srv), 'A4a 服务端应只使用未熔断的大脑');
ok(/usableBrain\(room, player\.seat\)/.test(srv), 'A4b askPlay/ask 都应走 usableBrain');
ok(/llmEnabled\(\)/.test(srv), 'A4c 未配置密钥时不得启用大模型');
ok(/aiReady:\s*llmEnabled\(\)/.test(srv), 'A4d 房间快照应下发 aiReady');
ok(/aiBrain === 'llm' && !llmEnabled\(\) \? 'builtin'/.test(srv), 'A4e 无密钥时保存配置必须回落到 builtin');
ok(/\/api\/llm-status/.test(srv), 'A4f 应提供 /api/llm-status');
ok(/providers: llmStatus\(\)/.test(srv), 'A4g llm-status 只回 providers/可用性');
ok(/room\.__brains\.clear\(\)/.test(srv), 'A4h 改 AI 配置后必须清空旧大脑缓存');
ok(/ready: !!\(process\.env\[p\.keyEnv\]/.test(llm), 'A4j llmStatus 只回 ready 布尔，不回密钥');
ok(/BREAKER_LIMIT/.test(llm), 'A4k 熔断阈值必须存在');

// ---- ai-think 事件字段与前端消费字段对齐 ----
for (const k of ['phase', 'seat', 'ms', 'label', 'why', 'reason', 'count']) {
  ok(new RegExp(`notify\\(\\{[^}]*${k}`).test(llm) || new RegExp(`${k}:`).test(llm), `A5 事件字段缺失：${k}`);
}

console.log(`\nAICHECK：通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败项：'); for (const b of bad) console.log('  -', b); }
process.exit(fail ? 1 : 0);
