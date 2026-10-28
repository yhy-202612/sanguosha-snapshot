// UI v2 验收（已合并进正式版）：node tools/uiv2.cjs [--dir client|client-v2]
// 用 jsdom 真跑前端 app.js（默认 client），验证 UI v2 的改动点：
//   ① 中央删掉牌堆卡背（v2.css）+ 牌堆数改到 #deckInfo 角标（≤10 变警告色）
//   ② 行动者 .pcard.active / 低血 .pcard.low / 已选目标 .pcard.picked
//   ③ 自己回合 #selfArea.my-turn
//   ④ 结算牌位显示真牌面（.fx5-slot > .fx5-face）
//   ⑤ 手牌 ≥7 张自动重叠（#handRow.fx-overlap）
//   ⑥ 行动者滚入可视区函数存在且不抛错
// 依赖 jsdom：npm i jsdom --prefix /tmp/uitest
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

  const dirArg = process.argv.indexOf('--dir');
  const V2 = path.join(ROOT, dirArg > 0 ? process.argv[dirArg + 1] : 'client');
  const bundle = '/tmp/uitest/app-v2.iife.js';
  console.log(`验收目录：${path.basename(V2)}`);
  execFileSync('npx', ['--yes', 'esbuild', path.join(V2, 'app.js'), '--bundle', '--format=iife', '--target=es2020', `--outfile=${bundle}`], { cwd: ROOT, stdio: 'pipe' });
  const code = fs.readFileSync(bundle, 'utf8');
  const html = fs.readFileSync(path.join(V2, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(V2, 'v2.css'), 'utf8');

  // 静态：v2.css 必须真的关掉牌堆卡背、且自己区/手牌规则在场
  ok(/<link[^>]+v2\.css/.test(html), 'V0a index.html 应引用 v2.css（正式版不受影响）');
  ok(/#tableCenter::before\s*\{[^}]*content:\s*none/.test(css.replace(/\s+/g, ' ')), 'V0b v2.css 必须显式关闭 #tableCenter::before（牌堆卡背）');
  ok(/#deckInfo\{left:10px\}/.test(css.replace(/\s+/g, '')), 'V0c 牌堆徽标应固定在中央岛左下角');
  ok(/fx-overlap/.test(css) && /fx-overlap/.test(code), 'V0d 手牌重叠规则与 JS 开关都要在');
  ok(/my-turn/.test(css) && /need-act/.test(css), 'V0e 自己回合/需要操作的高亮规则要在');

  // meta.cards 是数组（客户端 for...of 遍历），别写成对象
  const meta = { generals: [], packs: [], modes: [], cards: [
    { name: 'sha', cn: '杀', type: 'basic', desc: '杀' },
    { name: 'shan', cn: '闪', type: 'basic', desc: '闪' },
  ] };
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://127.0.0.1:8097/' });
  const { window } = dom;
  const doc = window.document;
  window.fetch = async (url) => {
    let data = {};
    if (/api\/meta/.test(String(url))) data = meta;
    else if (/llm-status/.test(String(url))) data = { providers: [] };
    else data = { ok: true };
    return { ok: true, status: 200, json: async () => data };
  };
  class FakeES { constructor() { window.__es = this; this.h = {}; } addEventListener(t, f) { (this.h[t] = this.h[t] || []).push(f); } close() {} }
  window.EventSource = FakeES;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 0);
  window.AudioContext = function () { throw new Error('no audio'); };
  window.webkitAudioContext = window.AudioContext;
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.localStorage.clear();

  window.eval(code);
  await sleep(120);
  const S = window.__SG, FN = window.__SGFN;
  ok(!!S && !!FN, 'V1a 客户端应初始化完成（__SG / __SGFN）');
  ok(!!FN.fxSlotShow && !!FN.fxScrollActiveIntoView, 'V1b 新增的验收入口应已导出');

  // 造一局：3 名玩家，我在 0 号座，1 号座行动且低血
  const mkCards = (n) => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, name: i % 2 ? 'shan' : 'sha', suit: i % 2 ? 'heart' : 'spade', num: (i % 9) + 2 }));
  const snap = {
    turn: 3, phase: 'play', currentIndex: 1, deckCount: 8, discardCount: 5, over: false,
    players: [
      { seat: 0, name: '我', generalName: '孙权', kingdom: 'wu', hp: 4, maxHp: 4, alive: true, handCount: 8, equips: {}, judgeZone: [], marks: {} },
      { seat: 1, name: '电脑1', generalName: '曹操', kingdom: 'wei', hp: 1, maxHp: 4, alive: true, handCount: 3, equips: {}, judgeZone: [], marks: {} },
      { seat: 2, name: '电脑2', generalName: '刘备', kingdom: 'shu', hp: 3, maxHp: 4, alive: true, handCount: 2, equips: {}, judgeZone: [], marks: {} },
    ],
  };
  S.seat = 0; S.snap = snap; S.cards = meta.cards; S.ask = null; S.targets = [];
  S.hand = mkCards(8);
  snap.players[0].hand = S.hand;

  FN.renderTable();
  await sleep(60);

  // ① 牌堆徽标
  const dk = doc.querySelector('#deckInfo');
  ok(!!dk && /牌堆\s*8/.test(dk.textContent), `V2a 牌堆徽标应显示张数（实际 "${dk && dk.textContent}"）`);
  ok(dk.classList.contains('low'), 'V2b 牌堆 ≤10 张应加 low 警告样式');

  // ② 行动者 / 低血 / 选中
  const active = [...doc.querySelectorAll('.pcard.active')];
  ok(active.length === 1, `V2c 只应有一张座位卡是当前行动者（实际 ${active.length}）`);
  ok(active[0] && /电脑1/.test(active[0].textContent), 'V2d 行动者应是被标记的那位（电脑1）');
  const low = [...doc.querySelectorAll('.pcard.low')];
  ok(low.length === 1 && /电脑1/.test(low[0].textContent), 'V2e 1 血角色应有 low 红边标记');

  // ③ 自己回合高亮：切到我的回合
  snap.currentIndex = 0;
  FN.renderTable();
  await sleep(40);
  ok(doc.querySelector('#selfArea').classList.contains('my-turn'), 'V3a 轮到自己时应给 #selfArea 加 my-turn');

  // ⑤ 手牌重叠（8 张）
  const row = doc.querySelector('#handRow');
  ok(row.classList.contains('fx-overlap'), `V4a 手牌 8 张应加 fx-overlap（实际 ${row.children.length} 张）`);

  // ④ 结算牌位 = 真牌面
  const faceSrc = doc.createElement('div');
  faceSrc.className = 'card';
  faceSrc.innerHTML = '<span class="cs red">♥</span><div class="cn">杀</div><span class="ct">基本</span>';
  FN.fxSlotShow(faceSrc);
  await sleep(30);
  const slot = doc.querySelector('#tableCenter .fx5-slot');
  const face = slot && slot.querySelector('.fx5-face');
  ok(!!face, 'V5a 结算牌位应包含真牌面节点（.fx5-face）');
  ok(face && /杀/.test(face.textContent), 'V5b 牌面应显示牌名（不是空框）');
  ok(face && face.classList.contains('card'), 'V5c 牌面应复用 .card 样式（花色/点数/牌名一致）');

  // ⑥ 滚动函数不抛错
  let threw = null;
  try { FN.fxScrollActiveIntoView(); } catch (e) { threw = e; }
  ok(!threw, `V6a fxScrollActiveIntoView 不应抛错（${threw && threw.message}）`);


  // ⑦ 桌面对手分列（网杀三栏）：3 人对手 → 左 2 右 1；1 人 → opp-t
  {
    const mkP = (seat, name, hp) => ({ seat, name, generalName: '曹操', kingdom: 'wei', hp, maxHp: 4, alive: true, handCount: 2, equips: {}, judgeZone: [], marks: {} });
    const snap3 = { turn: 5, phase: 'play', currentIndex: 1, deckCount: 30, discardCount: 2, over: false,
      players: [mkP(0, '我', 4), mkP(1, 'A', 4), mkP(2, 'B', 4), mkP(3, 'C', 4)] };
    S.snap = snap3; S.seat = 0; S.hand = mkCards(3); snap3.players[0].hand = S.hand;
    FN.renderTable();
    await sleep(50);
    ok(doc.querySelectorAll('#opponents .opp-l').length === 2, `V7a 4 人局应左列 2 人（实际 ${doc.querySelectorAll('#opponents .opp-l').length}）`);
    ok(doc.querySelectorAll('#opponents .opp-r').length === 1, `V7b 4 人局应右列 1 人（实际 ${doc.querySelectorAll('#opponents .opp-r').length}）`);
    const snap1 = { turn: 5, phase: 'play', currentIndex: 1, deckCount: 30, discardCount: 2, over: false,
      players: [mkP(0, '我', 4), mkP(1, 'A', 4)] };
    S.snap = snap1; S.seat = 0; S.hand = mkCards(3); snap1.players[0].hand = S.hand;
    FN.renderTable();
    await sleep(40);
    ok(doc.querySelectorAll('#opponents .opp-t').length === 1, 'V7c 单人对手应放在中栏顶部（opp-t）');
    ok(/display:contents/.test(css.replace(/\s+/g, '')), 'V7d v2.css 应用 display:contents 把对手条拆进三栏');
  }

  console.log(`\nUIV2：通过 ${pass} / 失败 ${fail}`);
  if (bad.length) { console.log('失败项：'); for (const b of bad) console.log('  -', b); }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('UIV2 异常：', e?.message || e); process.exit(1); });
