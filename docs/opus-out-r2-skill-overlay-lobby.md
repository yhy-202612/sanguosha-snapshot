**摘要**
- **B1 技能发动特效**
  - `addLog` 末尾新增调用 `fxSkillFromLog`，匹配「发动【X】」和「技能【X】」两种写法，同一条战报内去重。
  - 技能名作为 `.fx-skill` 挂在 `#tableCenter` 顶部上方。动画 0.3s 缩放淡入、1.1s 淡出。连发时按 80ms 错峰，每条上移 26px 堆叠，最多同时 4 条。
  - 历史回放不触发：进入桌面后首次 `renderTable` 登记一个 800ms 的 `fxLater`，之后才开始响应新战报。连接时补发的历史战报都落在这个窗口内或不在桌面视图，会被忽略。`fxReset` 会重置这个状态。
- **B2 结算浮层**
  - `showOverlay` 按结果给 `#overlay` 加 `fx-res fx-res-win|lose|draw`，`hideOverlay` 负责移除。
  - 判定：胜者列表为空或文案含「平局」算平；胜者里有我方座位号或我方昵称算胜；其余算负。
  - 背景用 `::before`：胜为金色径向扩散，负为暗红压暗，平为青灰。
  - 标题从 0.86 弹到 1，其余条目按 nth-child 错峰淡入上移。HTML 结构和按钮逻辑不变。
- **B3 大厅与选将**
  - `#lobby/#room>.panel` 错峰 60ms 入场。动画结束后加 `fx-entered` 并关掉动画，所以只在首次进入时播放。
  - `.gcard` 悬停改用 inset 金边光晕。原因是 `.gcard` 带 `contain:paint`，外发光会被裁掉。
  - `.chip` 在 pointerdown 时做一次性涟漪，`animationend` 后移除 class。**已知限制**：如果点击时 chip 列表被整块重建，原节点会被替换，涟漪可能看不到。
  - 选将弹窗只在首次 `render()` 时给 `.pool-item` 加错峰入场；之后搜索或点选重建都不会再播。
- **B4 顶栏**
  - 不改 `connect()`，用 MutationObserver 监听 `#conn` 上 `on` class 的变化。断开时持续红色脉冲；重连成功后绿光闪一次。文案不变。
  - 轮到我方回合时，`#topbar::after` 画一条细金线扫过一次（1.2s）。不新增大字，和中央横幅同时出现但互不重复。
- **定时器与减弱动效**
  - 所有新定时器都走 `fxLater`。`fxReset` 会额外清理 `.fx-skill`、`fx-sweep` 和 `fx-conn-back`。
  - `prefers-reduced-motion` 下：技能飘字和金线由 JS 直接跳过，其余新增动效由 CSS 设为 none。
- index.html 不需要改。

===PATCH: client/app.js===
<<<<<<< SEARCH
function fxReset() {
  for (const t of FX.timers) clearTimeout(t);
  FX.timers.clear();
  for (const a of [...FX.anims]) { try { a.cancel(); } catch {} }
  FX.anims.clear();
  document.querySelectorAll('.fx-fly,.fx-float,.fx-banner').forEach(n => n.remove());
  FX.lastHp.clear(); FX.lastArmor.clear(); FX.floatN.clear();
  FX.lastPhaseKey = null; FX.askHideT = null;
=======
function fxReset() {
  for (const t of FX.timers) clearTimeout(t);
  FX.timers.clear();
  for (const a of [...FX.anims]) { try { a.cancel(); } catch {} }
  FX.anims.clear();
  document.querySelectorAll('.fx-fly,.fx-float,.fx-banner,.fx-skill').forEach(n => n.remove());
  FX.lastHp.clear(); FX.lastArmor.clear(); FX.floatN.clear();
  FX.lastPhaseKey = null; FX.askHideT = null;
  FX.skillArmed = false; FX.skillArmT = null; FX.skillLive = 0; FX.skillNextAt = 0;
  const tb = document.getElementById('topbar');
  if (tb) tb.classList.remove('fx-sweep');
  const cn = document.getElementById('conn');
  if (cn) cn.classList.remove('fx-conn-back');
>>>>>>> REPLACE

<<<<<<< SEARCH
  const cur = snap.players[snap.currentIndex];
  $('#phaseInfo').innerHTML = cur ? `当前回合：<b>${esc(cur.name)}</b>（${esc(cur.generalName)}）` : '';
  $('#discardInfo').textContent = `弃牌堆 ${snap.discardCount} 张`;
  syncAskOffset();
  try { fxDiffHp(snap); fxPhaseBanner(snap, cur); } catch {}
}
=======
  const cur = snap.players[snap.currentIndex];
  $('#phaseInfo').innerHTML = cur ? `当前回合：<b>${esc(cur.name)}</b>（${esc(cur.generalName)}）` : '';
  $('#discardInfo').textContent = `弃牌堆 ${snap.discardCount} 张`;
  syncAskOffset();
  const fxPrevKey = FX.lastPhaseKey;
  try { fxDiffHp(snap); fxPhaseBanner(snap, cur); fxTurnSweep(fxPrevKey, snap); } catch {}
  if (!FX.skillArmed && !FX.skillArmT) {
    FX.skillArmT = fxLater(() => { FX.skillArmT = null; FX.skillArmed = true; }, 800);
  }
}
>>>>>>> REPLACE

<<<<<<< SEARCH
    for (const g of shown) {
      const taken = used.has(g.id);
      const on = sel.includes(g.id);
      const it = el('div', 'pool-item' + (taken ? ' dis' : '') + (on ? ' on' : ''));
      const info = detailOf(g);
=======
    if (!grid._fxInit) { grid._fxInit = 1; queueMicrotask(() => { grid._fxDone = 1; }); }
    for (const g of shown) {
      const taken = used.has(g.id);
      const on = sel.includes(g.id);
      const it = el('div', 'pool-item' + (taken ? ' dis' : '') + (on ? ' on' : ''));
      if (!grid._fxDone && !reduceMotion()) {
        it.classList.add('fx-pick-in');
        it.style.animationDelay = `${Math.min(grid.children.length, 16) * 30}ms`;
        it.addEventListener('animationend', () => { it.classList.remove('fx-pick-in'); it.style.animationDelay = ''; }, { once: true });
      }
      const info = detailOf(g);
>>>>>>> REPLACE

<<<<<<< SEARCH
  if (/回合|阵亡|结束|获胜/.test(entry.text)) d.classList.add('hl');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight <= 24;
  d.classList.add('fx-log-in');
  d.addEventListener('animationend', () => d.classList.remove('fx-log-in'), { once: true });
  box.appendChild(d);
  while (box.children.length > 300) box.removeChild(box.firstChild);
  if (atBottom) box.scrollTop = box.scrollHeight;
}
=======
  if (/回合|阵亡|结束|获胜/.test(entry.text)) d.classList.add('hl');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight <= 24;
  d.classList.add('fx-log-in');
  d.addEventListener('animationend', () => d.classList.remove('fx-log-in'), { once: true });
  box.appendChild(d);
  while (box.children.length > 300) box.removeChild(box.firstChild);
  if (atBottom) box.scrollTop = box.scrollHeight;
  try { fxSkillFromLog(entry.text); } catch {}
}
>>>>>>> REPLACE

<<<<<<< SEARCH
function hideOverlay() {
  const box = $('#overlay');
  if (!box) return;
  box.classList.add('hidden');
  box.innerHTML = '';
}
=======
function fxSkillFromLog(text) {
  if (!text || !FX.skillArmed || S.view !== 'table' || reduceMotion()) return;
  const names = new Set();
  const re = /(?:发动|技能)\s*【([^】]{1,10})】/g;
  let m;
  while ((m = re.exec(String(text)))) names.add(m[1]);
  for (const n of names) fxSkillName(n);
}

function fxSkillName(name) {
  const host = document.getElementById('tableCenter');
  if (!host || !host.isConnected) return;
  const live = FX.skillLive || 0;
  if (live >= 4) return;
  const now = Date.now();
  const delay = Math.max(0, (FX.skillNextAt || 0) - now);
  FX.skillNextAt = now + delay + 80;
  FX.skillLive = live + 1;
  const f = el('div', 'fx-skill');
  f.textContent = `【${name}】`;
  f.setAttribute('aria-hidden', 'true');
  f.style.setProperty('--k', String(live));
  f.style.animationDelay = `${delay}ms`;
  host.appendChild(f);
  fxLater(() => { f.remove(); FX.skillLive = Math.max(0, (FX.skillLive || 1) - 1); }, delay + 1450);
}

function fxTurnSweep(prevKey, snap) {
  if (prevKey == null || snap.over || reduceMotion()) return;
  if (S.seat == null || snap.currentIndex !== S.seat) return;
  const [pTurn, pIdx] = String(prevKey).split('|');
  if (pTurn === String(snap.turn) && pIdx === String(snap.currentIndex)) return;
  const tb = document.getElementById('topbar');
  if (!tb) return;
  tb.classList.remove('fx-sweep');
  void tb.offsetWidth;
  tb.classList.add('fx-sweep');
  const n = (tb._fxSw || 0) + 1;
  tb._fxSw = n;
  const off = () => { if (tb._fxSw === n) tb.classList.remove('fx-sweep'); };
  fxLater(off, 1300);
}

const fxConnState = { on: false, seen: false };
function fxConnWatch() {
  const c = document.getElementById('conn');
  if (!c || c._fxW) return;
  c._fxW = 1;
  new MutationObserver(() => {
    const on = c.classList.contains('on');
    if (on === fxConnState.on) return;
    fxConnState.on = on;
    if (!on) {
      if (fxConnState.seen) { c.classList.remove('fx-conn-back'); c.classList.add('fx-conn-lost'); }
      return;
    }
    fxConnState.seen = true;
    if (!c.classList.contains('fx-conn-lost')) return;
    c.classList.remove('fx-conn-lost');
    if (reduceMotion()) return;
    c.classList.add('fx-conn-back');
    const off = () => c.classList.remove('fx-conn-back');
    c.addEventListener('animationend', off, { once: true });
    fxLater(off, 900);
  }).observe(c, { attributes: true, attributeFilter: ['class'] });
}
fxConnWatch();

document.addEventListener('animationend', (e) => {
  if (e.animationName === 'fx-panel-in' && e.target.classList) e.target.classList.add('fx-entered');
});

document.addEventListener('pointerdown', (e) => {
  const c = e.target && e.target.closest ? e.target.closest('.chip') : null;
  if (!c || reduceMotion()) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--fx-x', `${e.clientX - r.left}px`);
  c.style.setProperty('--fx-y', `${e.clientY - r.top}px`);
  c.classList.remove('fx-ripple');
  void c.offsetWidth;
  c.classList.add('fx-ripple');
  c.addEventListener('animationend', () => c.classList.remove('fx-ripple'), { once: true });
});

function hideOverlay() {
  const box = $('#overlay');
  if (!box) return;
  box.classList.add('hidden');
  box.classList.remove('fx-res', 'fx-res-win', 'fx-res-lose', 'fx-res-draw');
  box.innerHTML = '';
}
>>>>>>> REPLACE

<<<<<<< SEARCH
function showOverlay(text, winners) {
  const box = $('#overlay');
  box.classList.remove('hidden');
  box.innerHTML = `<div class="box"><h2>对局结束</h2><p>${esc(text || '')}</p>
=======
function showOverlay(text, winners) {
  const box = $('#overlay');
  const wl = winners || [];
  const meP = S.snap?.players?.[S.seat];
  const fxWin = wl.some(w => (w && w.seat != null && w.seat === S.seat) || (meP && w && w.name === meP.name));
  const fxRes = (!wl.length || /平局/.test(String(text || ''))) ? 'draw' : (fxWin ? 'win' : 'lose');
  box.classList.remove('hidden', 'fx-res-win', 'fx-res-lose', 'fx-res-draw');
  box.classList.add('fx-res', 'fx-res-' + fxRes);
  box.innerHTML = `<div class="box"><h2>对局结束</h2><p>${esc(text || '')}</p>
>>>>>>> REPLACE

===FILE: client/style.css.append===
/* ========== 第二阶段 · 批次 B（fx-*） ========== */
/* B1 技能名飘字 */
.fx-skill{
  position:absolute;left:50%;top:calc(-6px - var(--k,0) * 26px);z-index:6;pointer-events:none;white-space:nowrap;
  font-size:20px;font-weight:800;letter-spacing:3px;color:var(--gold-2);
  text-shadow:0 0 10px rgba(216,180,106,.65),0 2px 3px rgba(0,0,0,.8);
  opacity:0;transform:translate(-50%,0) scale(.6);
  animation:fx-skill 1.4s var(--ease-out) both;
}
@keyframes fx-skill{
  0%{opacity:0;transform:translate(-50%,6px) scale(.6)}
  21%{opacity:1;transform:translate(-50%,0) scale(1)}
  100%{opacity:0;transform:translate(-50%,-14px) scale(1)}
}
@media (max-width:760px){.fx-skill{font-size:16px;top:calc(-2px - var(--k,0) * 22px)}}

/* B2 结算浮层 */
#overlay.fx-res::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;animation:fx-res-bg .9s var(--ease-out) .05s both}
#overlay.fx-res .box{position:relative}
#overlay.fx-res-win::before{background:radial-gradient(circle at 50% 45%,rgba(241,215,154,.34),rgba(216,180,106,.12) 35%,transparent 65%)}
#overlay.fx-res-lose::before{background:radial-gradient(ellipse at 50% 50%,transparent 25%,rgba(80,8,10,.6) 100%),rgba(30,0,0,.3)}
#overlay.fx-res-draw::before{background:radial-gradient(circle at 50% 45%,rgba(150,180,190,.2),transparent 62%)}
#overlay.fx-res-win .box{box-shadow:inset 0 1px 0 rgba(255,235,190,.2),0 0 40px rgba(216,180,106,.35),var(--sh3)}
#overlay.fx-res-lose .box{border-color:#6e2a26;box-shadow:inset 0 1px 0 rgba(255,200,190,.08),0 0 30px rgba(120,20,18,.4),var(--sh3)}
#overlay.fx-res-draw .box{border-color:#4f6670}
#overlay.fx-res-win h2{color:var(--gold-2);text-shadow:0 0 16px rgba(216,180,106,.6)}
#overlay.fx-res-lose h2{color:#e98a80}
#overlay.fx-res-draw h2{color:#a9c3cc}
#overlay.fx-res h2{animation:fx-res-pop .48s var(--ease-spring) .08s both}
#overlay.fx-res .box>*:not(h2){animation:fx-res-item .36s var(--ease-out) both}
#overlay.fx-res .box>:nth-child(2){animation-delay:.18s}
#overlay.fx-res .box>:nth-child(3){animation-delay:.24s}
#overlay.fx-res .box>:nth-child(4){animation-delay:.30s}
#overlay.fx-res .box>:nth-child(5){animation-delay:.36s}
@keyframes fx-res-bg{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fx-res-pop{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:scale(1)}}
@keyframes fx-res-item{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* B3 大厅 / 房间面板错峰入场（仅首次） */
#lobby>.panel,#room>.panel{animation:fx-panel-in .42s var(--ease-out) both}
#lobby>.panel:nth-child(2){animation-delay:60ms}
#lobby>.panel:nth-child(3){animation-delay:120ms}
#lobby>.panel:nth-child(4){animation-delay:180ms}
#lobby>.panel.fx-entered,#room>.panel.fx-entered{animation:none}
@keyframes fx-panel-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}

.gcard:hover{
  transform:translateY(-3px);
  box-shadow:inset 0 1px 0 var(--hi),inset 0 0 0 1px var(--brand-gold),inset 0 0 16px rgba(216,180,106,.28);
}

.chip.fx-ripple{position:relative;overflow:hidden}
.chip.fx-ripple::after{
  content:"";position:absolute;left:var(--fx-x,50%);top:var(--fx-y,50%);width:120px;height:120px;margin:-60px 0 0 -60px;
  border-radius:50%;background:rgba(241,215,154,.35);pointer-events:none;animation:fx-ripple .5s ease-out forwards;
}
@keyframes fx-ripple{from{transform:scale(0);opacity:1}to{transform:scale(1.4);opacity:0}}

.pool-item.fx-pick-in{animation:fx-panel-in .32s var(--ease-out) both}

/* B4 连接状态 / 回合金线 */
.conn.fx-conn-lost{color:var(--danger)}
.conn.fx-conn-lost::before{background:var(--danger);animation:fx-conn-pulse 1.2s ease-in-out infinite}
@keyframes fx-conn-pulse{0%,100%{box-shadow:0 0 0 0 rgba(226,69,59,.7)}50%{box-shadow:0 0 0 5px rgba(226,69,59,0)}}
.conn.fx-conn-back::before{animation:fx-conn-back .8s ease-out}
@keyframes fx-conn-back{0%{box-shadow:0 0 0 0 rgba(67,178,119,.9),0 0 14px var(--success)}100%{box-shadow:0 0 0 8px rgba(67,178,119,0),0 0 8px var(--success)}}

#topbar.fx-sweep::after{
  content:"";position:absolute;left:0;bottom:-1px;width:40%;height:2px;pointer-events:none;
  background:linear-gradient(90deg,transparent,var(--gold-2),transparent);
  transform:translateX(-100%);animation:fx-sweep 1.2s var(--ease-out) forwards;
}
@keyframes fx-sweep{0%{transform:translateX(-100%);opacity:0}10%{opacity:1}85%{opacity:1}100%{transform:translateX(260%);opacity:0}}

@media (prefers-reduced-motion:reduce){
  .fx-skill,#topbar.fx-sweep::after,.chip.fx-ripple::after{display:none}
  #lobby>.panel,#room>.panel,.pool-item.fx-pick-in{animation:none}
  #overlay.fx-res::before{animation:none;opacity:1}
  #overlay.fx-res h2,#overlay.fx-res .box>*:not(h2){animation:none}
  .conn.fx-conn-lost::before,.conn.fx-conn-back::before{animation:none}
}

===FILE: client/index.html===
===NOCHANGE===