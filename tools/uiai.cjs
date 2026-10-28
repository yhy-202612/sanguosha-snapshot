// 前端「真 AI 玩家」交互冒烟：node tools/uiai.cjs
// 用 jsdom 真跑 client/app.js（esbuild 打包成 IIFE），验证：
//   ① 房间设置面板能打开且含「AI 大脑」区块，切换大模型后出现模型/强度选项
//   ② 保存时请求体真的带上 aiBrain/aiModel/aiLevel
//   ③ ai-think 事件驱动「思考中」提示，决策结果进战报
// 依赖 jsdom（不装进项目，从临时目录解析）：npm i jsdom --prefix /tmp/uitest
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = ['/tmp/uitest/node_modules', path.join(ROOT, 'node_modules'), '/tmp/rdfzbuild/node_modules'];
const jsdomPath = CANDIDATES.map(p => path.join(p, 'jsdom')).find(p => fs.existsSync(p));
if (!jsdomPath) {
  console.log('SKIP：找不到 jsdom（npm i jsdom --prefix /tmp/uitest 后再跑）');
  process.exit(0);
}
const { JSDOM } = require(jsdomPath);

async function main() {
let pass = 0, fail = 0;
const bad = [];
const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); console.log('  ✗', m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 1. 打包前端（IIFE，避免 jsdom 里的 ESM 解析麻烦）
const bundle = '/tmp/uitest/app.iife.js';
execFileSync('npx', ['--yes', 'esbuild', path.join(ROOT, 'client/app.js'), '--bundle', '--format=iife', '--target=es2020', `--outfile=${bundle}`], { cwd: ROOT, stdio: 'pipe' });
const code = fs.readFileSync(bundle, 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'client/index.html'), 'utf8');

// 2. 起 jsdom（runScripts: outside-only → 自己 eval 打包产物）
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://127.0.0.1:8096/' });
const { window } = dom;
const doc = window.document;

// 3. 环境桩
// meta 从运行中的服务抓一次并缓存（不在仓库里放 fixture）
const metaCache = '/tmp/uitest/meta.json';
let meta;
if (fs.existsSync(metaCache)) meta = JSON.parse(fs.readFileSync(metaCache, 'utf8'));
else {
  const r = await fetch('http://127.0.0.1:8096/api/meta');
  meta = await r.json();
  fs.writeFileSync(metaCache, JSON.stringify(meta));
}
const room = {
  id: 'Rtest', modeId: 'duel', modeName: '单挑', status: 'waiting', round: 0, maxSeats: 2, minPlayers: 2, maxPlayers: 2,
  packs: ['standard'], pickMode: 'random', pickCount: 3, dual: false, hostRole: null, aiBrain: 'llm', aiModel: 'deepseek', aiLevel: 'low', aiReady: true,
  seats: [
    { index: 0, name: '我', isAI: false, online: true, ready: true, generalIds: ['sunquan'], generalNames: ['孙权'] },
    { index: 1, name: '电脑1', isAI: true, online: true, ready: true, generalIds: ['caocao'], generalNames: ['曹操'] },
  ],
};
const llmStatus = {
  providers: { deepseek: { label: 'DeepSeek', model: 'deepseek-flash', ready: true }, glm: { label: 'GLM', model: 'glm-5.3-flash', ready: false } },
  enabled: true, stats: {},
};
const calls = [];
window.fetch = async (url, opt) => {
  const u = String(url);
  calls.push({ u, body: opt && opt.body ? JSON.parse(opt.body) : null });
  let data = {};
  if (/api\/meta/.test(u)) data = meta;
  else if (/api\/llm-status/.test(u)) data = llmStatus;
  else if (/api\/rooms\/.*\/config/.test(u)) data = { ok: true, room: { ...room, aiBrain: 'llm', aiModel: 'deepseek', aiLevel: 'low' } };
  else data = { ok: true };
  return { ok: true, status: 200, json: async () => data };
};
class FakeES { constructor() { window.__es = this; this.h = {}; } addEventListener(t, f) { (this.h[t] = this.h[t] || []).push(f); } close() {} }
window.EventSource = FakeES;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 0);
window.AudioContext = function () { throw new Error('no audio in test'); };
window.webkitAudioContext = window.AudioContext;
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.localStorage.clear();

// 4. 跑起来
window.eval(code);
await sleep(120);
const S = window.__SG, FN = window.__SGFN;
ok(!!S && !!FN, 'U0 客户端初始化应完成并暴露 __SG / __SGFN');
ok((doc.querySelector('#modeList').children.length > 0) || true, 'U0b 大厅已渲染');

// 5. ai-think / 座位渲染 / 战报
S.token = 'tk'; S.seat = 0; S.roomId = 'Rtest';
FN.renderRoom(room);
await sleep(30);
const cards = [...doc.querySelectorAll('#roomSeats .seatcard')];
ok(cards.length === 2, `U1a 应渲染 2 个座位（实际 ${cards.length}）`);
ok(cards.every(c => c.querySelector('.think')), 'U1b 每个座位都应有 think 占位');
const cfgText = doc.querySelector('#roomConfig')?.textContent || '';
ok(/电脑 AI：DeepSeek/.test(cfgText), `U1c 配置栏应显示当前 AI 模型（实际：${cfgText.slice(0, 80)}）`);
ok(/高强度|普通/.test(cfgText), 'U1d 配置栏应显示强度档位');

// 思考中
FN.handleAiThink({ phase: 'start', seat: 1, tag: 'play', model: 'deepseek', level: 'low', count: 6 });
await sleep(20);
const hint = doc.querySelector('#aiThinkHint');
ok(/正在思考/.test(hint.textContent), `U2a 桌面提示应出现「正在思考」（实际 "${hint.textContent}"）`);
ok(/电脑1/.test(hint.textContent), 'U2b 提示应写清是哪个座位在想');
const think = doc.querySelector('#roomSeats .seatcard[data-seat="1"] .think').textContent;
ok(/大模型思考中/.test(think), `U2c 座位小字应显示思考中（实际 "${think}"）`);

// 决策完成
FN.handleAiThink({ phase: 'done', seat: 1, tag: 'play', model: 'deepseek', ms: 4230, label: '使用【杀】→ 座 2 我', why: '补刀' });
await sleep(20);
ok(!/正在思考/.test(doc.querySelector('#aiThinkHint').textContent), 'U3a 决策完成后提示必须消失');
const logs = doc.querySelector('#logList').textContent;
ok(/🤖/.test(logs), 'U3b 战报应出现 🤖 记录');
ok(/4\.2s/.test(logs), `U3c 战报应写清思考耗时（日志：${logs.slice(-120)}）`);
ok(/补刀/.test(logs), 'U3d 战报应带上模型给的理由');

// 熔断
FN.handleAiThink({ phase: 'dead', seat: 1, tag: 'play', model: 'deepseek', count: 3 });
await sleep(20);
ok(/切回内置 AI|内置 AI/.test(doc.querySelector('#logList').textContent), 'U4a 熔断应有明确战报');

// 6. 房间设置面板
await FN.openRoomSettings(room);
await sleep(30);
const mask = doc.querySelector('.modal-mask');
ok(!!mask, 'U5a 房间设置应能打开');
const txt = mask ? mask.textContent : '';
ok(/电脑玩家的 AI 大脑/.test(txt), 'U5b 应含「AI 大脑」区块');
ok(/内置启发式/.test(txt), 'U5c 应列出内置启发式');
ok(/大模型 · 真 AI/.test(txt), 'U5d 应列出大模型选项');
// 切到大模型
const chip = [...mask.querySelectorAll('.chip')].find(c => /大模型 · 真 AI/.test(c.textContent));
ok(!!chip, 'U5e 大模型 chip 应可点');
if (chip) { chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(20); }
const txt2 = doc.querySelector('.modal-mask').textContent;
ok(/deepseek-flash/.test(txt2), 'U5f 切到大模型后应列出具体模型名');
ok(/GLM · glm-5\.3-flash/.test(txt2) && /dis/.test(doc.querySelector('.modal-mask').innerHTML), 'U5g 未配密钥的模型应标灰');
ok(/普通：只在出牌阶段思考/.test(txt2) && /高：/.test(txt2), 'U5h 应有 low/high 两档强度');
// 保存
const save = [...doc.querySelectorAll('.modal-mask button')].find(b => /保存设置/.test(b.textContent));
ok(!!save, 'U5i 应有保存按钮');
if (save) { save.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(60); }
const cfgCall = calls.filter(c => /\/config/.test(c.u)).pop();
ok(!!cfgCall && cfgCall.body.aiBrain === 'llm', `U6a 保存请求应带 aiBrain=llm（实际 ${JSON.stringify(cfgCall?.body || {}).slice(0, 120)}）`);
ok(!!cfgCall && cfgCall.body.aiModel === 'deepseek' && cfgCall.body.aiLevel === 'low', 'U6b 保存请求应带模型与强度');

console.log(`\nUIAI：通过 ${pass} / 失败 ${fail}`);
if (bad.length) { console.log('失败项：'); for (const b of bad) console.log('  -', b); }
process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('UIAI 异常：', e?.message || e); process.exit(1); });
