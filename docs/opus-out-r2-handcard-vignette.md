## 摘要
- **A1 手牌重叠**
  - `renderHand()` 开头给 `#handRow` 设置 `--n`(手牌张数),并切换 `fx-overlap`(≥6 张)和 `fx-scroll`(>10 张)两个 class。
  - 重叠量由 CSS 的 `clamp()` 计算:6 张约 12px,张数越多叠得越多,桌面最多叠 44px,手机最多 34px。
  - 悬停的牌 z-index 为 6,选中的牌为 5,保证抬到最上层。
  - >10 张时左对齐、两端留内边距,并用静态 `mask-image` 做渐隐遮罩。遮罩不参与过渡。
  - `#handRow .card` 和 `data-cid` 结构不变。
- **A2 光感跟随**
  - 在 `#handRow` 上做一次性事件委托(由 `FXT.bound` 保证只绑定一次),所以 innerHTML 重建后依然有效。
  - 一帧最多更新一次:`requestAnimationFrame` 合并,写入 `--mx/--my/--rx/--ry`,倾斜不超过 ±6deg。
  - 以下情况不启用:触屏(`pointerType==='touch'`)、非 `hover:hover + pointer:fine` 设备、reduced-motion、`disabled` 牌。
  - 复位与清理:`pointerleave`、换到另一张牌、`renderHand` 重建、`fxReset()` 时,都会清除内联变量和 `fx-tilt` class,并取消挂起的 rAF。
  - 高光用 `::after` 径向渐变,只在 `.fx-tilt` 时存在。卡牌原有的 `::after` 没有被占用。
- **A3 屏幕反馈**
  - 直接在 `fxDiffHp` 的现有分支里调用,没有重复计算差分。
  - 自己掉血:红色 vignette。自己回复:更弱的绿色 vignette。
  - 全局只有一个 `.fx-vignette` 节点,连发时复位 class、强制回流后重启动画,不会叠加多个覆盖层。
  - vignette 只做 opacity 动画,`pointer-events:none`。结束时由 `animationend` 复位,另有 `fxLater` 兜底;用序号 `_n` 防止旧定时器打断新动画。
  - 他人掉血:座位卡加 `fx-hit`,做红色 box-shadow 闪烁 + ±3px 的 translateX 抖动,结束移除 class。
  - reduced-motion 时两者都直接跳过。
- `fxReset()` 新增:复位 vignette 节点、调用 `fxTiltClear()`。
- 不改 index.html。没有修改 api / connect / submit / allowedCardIds / isTargetSelectable。

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
  const ap = document.getElementById('askPanel');
  if (ap && ap.classList.contains('fx-out')) { ap.classList.add('hidden'); ap.classList.remove('fx-out', 'fx-in'); }
}
=======
function fxReset() {
  for (const t of FX.timers) clearTimeout(t);
  FX.timers.clear();
  for (const a of [...FX.anims]) { try { a.cancel(); } catch {} }
  FX.anims.clear();
  document.querySelectorAll('.fx-fly,.fx-float,.fx-banner').forEach(n => n.remove());
  FX.lastHp.clear(); FX.lastArmor.clear(); FX.floatN.clear();
  FX.lastPhaseKey = null; FX.askHideT = null;
  const ap = document.getElementById('askPanel');
  if (ap && ap.classList.contains('fx-out')) { ap.classList.add('hidden'); ap.classList.remove('fx-out', 'fx-in'); }
  document.querySelectorAll('.fx-vignette').forEach(n => { n.className = 'fx-vignette'; });
  document.querySelectorAll('.fx-hit').forEach(n => n.classList.remove('fx-hit'));
  try { fxTiltClear(); } catch {}
}
>>>>>>> REPLACE

<<<<<<< SEARCH
function fxDiffHp(snap) {
  for (const p of snap.players || []) {
    const k = p.seat;
    const ph = FX.lastHp.get(k), pa = FX.lastArmor.get(k);
    const hp = Number(p.hp || 0), ar = Number(p.armor || 0);
    FX.lastHp.set(k, hp); FX.lastArmor.set(k, ar);
    if (ph === undefined) continue;
    const anchor = fxSeatNode(k);
    if (pa !== undefined && ar < pa) fxFloat(anchor, k, `-${pa - ar} 护甲`, 'armor');
    if (hp < ph) fxFloat(anchor, k, `-${ph - hp}`, 'dmg');
    else if (hp > ph) fxFloat(anchor, k, `+${hp - ph}`, 'heal');
  }
}
=======
function fxDiffHp(snap) {
  for (const p of snap.players || []) {
    const k = p.seat;
    const ph = FX.lastHp.get(k), pa = FX.lastArmor.get(k);
    const hp = Number(p.hp || 0), ar = Number(p.armor || 0);
    FX.lastHp.set(k, hp); FX.lastArmor.set(k, ar);
    if (ph === undefined) continue;
    const anchor = fxSeatNode(k);
    const self = S.seat != null && k === S.seat;
    if (pa !== undefined && ar < pa) fxFloat(anchor, k, `-${pa - ar} 护甲`, 'armor');
    if (hp < ph) {
      fxFloat(anchor, k, `-${ph - hp}`, 'dmg');
      if (self) fxVignette('dmg'); else fxHitSeat(k);
    } else if (hp > ph) {
      fxFloat(anchor, k, `+${hp - ph}`, 'heal');
      if (self) fxVignette('heal');
    }
  }
}
>>>>>>> REPLACE

<<<<<<< SEARCH
function fxPulseSeat(seat) {
  const node = fxSeatNode(seat);
  if (!node) return;
  node.classList.remove('fx-pulse');
  void node.offsetWidth;
  node.classList.add('fx-pulse');
  const off = () => node.classList.remove('fx-pulse');
  node.addEventListener('animationend', off, { once: true });
  fxLater(off, 600);
}
=======
function fxPulseSeat(seat) {
  const node = fxSeatNode(seat);
  if (!node) return;
  node.classList.remove('fx-pulse');
  void node.offsetWidth;
  node.classList.add('fx-pulse');
  const off = () => node.classList.remove('fx-pulse');
  node.addEventListener('animationend', off, { once: true });
  fxLater(off, 600);
}

// A3：屏幕 vignette（单节点复用）+ 他人座位受击
let fxVigEl = null;
function fxVignette(kind) {
  if (reduceMotion()) return;
  let v = fxVigEl;
  if (!v || !v.isConnected) {
    v = el('div', 'fx-vignette');
    v.setAttribute('aria-hidden', 'true');
    document.body.appendChild(v);
    fxVigEl = v;
  }
  v.className = 'fx-vignette';
  void v.offsetWidth;
  v.classList.add(kind === 'heal' ? 'fx-vig-heal' : 'fx-vig-dmg');
  const n = (v._n || 0) + 1;
  v._n = n;
  const off = () => { if (v._n === n) v.className = 'fx-vignette'; };
  v.onanimationend = off;
  fxLater(off, 1000);
}

function fxHitSeat(seat) {
  if (reduceMotion()) return;
  const node = fxSeatNode(seat);
  if (!node || !node.classList.contains('pcard')) return;
  node.classList.remove('fx-hit');
  void node.offsetWidth;
  node.classList.add('fx-hit');
  const n = (node._fxHitN || 0) + 1;
  node._fxHitN = n;
  const off = () => { if (node._fxHitN === n) node.classList.remove('fx-hit'); };
  node.addEventListener('animationend', off, { once: true });
  fxLater(off, 600);
}

// A2：手牌光感跟随（仅桌面精确指针）
const FXT = { raf: 0, card: null, x: 0, y: 0, bound: false };
function fxTiltOk() {
  return !reduceMotion() && matchMedia('(hover:hover) and (pointer:fine)').matches;
}
function fxTiltClear() {
  if (FXT.raf) cancelAnimationFrame(FXT.raf);
  FXT.raf = 0;
  const c = FXT.card;
  FXT.card = null;
  if (c) {
    c.classList.remove('fx-tilt');
    for (const k of ['--mx', '--my', '--rx', '--ry']) c.style.removeProperty(k);
  }
}
function fxTiltApply() {
  FXT.raf = 0;
  const c = FXT.card;
  if (!c || !c.isConnected) { FXT.card = null; return; }
  const r = c.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const px = Math.min(1, Math.max(0, (FXT.x - r.left) / r.width));
  const py = Math.min(1, Math.max(0, (FXT.y - r.top) / r.height));
  c.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
  c.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  c.style.setProperty('--ry', `${((px - 0.5) * 12).toFixed(2)}deg`);
  c.style.setProperty('--rx', `${((0.5 - py) * 12).toFixed(2)}deg`);
  c.classList.add('fx-tilt');
}
function fxBindTilt(row) {
  if (FXT.bound || !row) return;
  FXT.bound = true;
  row.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !fxTiltOk()) { if (FXT.card) fxTiltClear(); return; }
    const c = e.target && e.target.closest ? e.target.closest('.card') : null;
    if (!c || !row.contains(c) || c.classList.contains('disabled')) { if (FXT.card) fxTiltClear(); return; }
    if (c !== FXT.card) { fxTiltClear(); FXT.card = c; }
    FXT.x = e.clientX; FXT.y = e.clientY;
    if (!FXT.raf) FXT.raf = requestAnimationFrame(fxTiltApply);
  });
  row.addEventListener('pointerleave', fxTiltClear);
}
>>>>>>> REPLACE

<<<<<<< SEARCH
function renderHand(me) {
  const row = $('#handRow');
  row.innerHTML = '';
  const allowed = allowedCardIds();
  for (const c of me.hand || []) {
=======
function renderHand(me) {
  const row = $('#handRow');
  try { fxTiltClear(); fxBindTilt(row); } catch {}
  row.innerHTML = '';
  const handN = (me.hand || []).length;
  row.style.setProperty('--n', String(handN));
  row.classList.toggle('fx-overlap', handN >= 6);
  row.classList.toggle('fx-scroll', handN > 10);
  const allowed = allowedCardIds();
  for (const c of me.hand || []) {
>>>>>>> REPLACE

===FILE: client/style.css.append===
/* ========== 第二阶段 · 批次 A：手牌重叠 / 光感 / 受伤反馈（fx-*） ========== */
/* A1 手牌重叠：≥6 张时按 --n 递增重叠 */
#handRow.fx-overlap{gap:0}
#handRow.fx-overlap .card+.card{margin-left:calc(-1 * clamp(10px, (var(--n) - 5) * 6px + 6px, 44px))}
#handRow.fx-overlap .card.sel,#handRow.fx-overlap .card.picked{z-index:5}
#handRow.fx-overlap .card:hover,#handRow.fx-overlap .card.fx-tilt{z-index:6}
#handRow.fx-scroll{
  justify-content:flex-start;padding-left:28px;padding-right:28px;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 28px,#000 calc(100% - 28px),transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 28px,#000 calc(100% - 28px),transparent 100%);
}
@media (max-width:760px){
  #handRow.fx-overlap .card+.card{margin-left:calc(-1 * clamp(8px, (var(--n) - 5) * 5px + 4px, 34px))}
  #handRow.fx-scroll{padding-left:20px;padding-right:20px}
}

/* A2 光感跟随 + 轻微 3D 倾斜（JS 仅在精确指针 / 非减弱动效时添加 .fx-tilt） */
.card.fx-tilt{
  transition:transform 90ms linear,box-shadow var(--t-base);
  transform:perspective(600px) translateY(-8px) scale(1.04) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));
}
.card.sel.fx-tilt,.card.picked.fx-tilt{
  transform:perspective(600px) translateY(-16px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));
}
.card.fx-tilt::after{
  content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:radial-gradient(circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.6),rgba(255,248,225,.15) 35%,transparent 60%);
}

/* A3 屏幕 vignette（单节点复用） */
.fx-vignette{position:fixed;inset:0;z-index:74;pointer-events:none;opacity:0}
.fx-vignette.fx-vig-dmg{
  background:radial-gradient(ellipse at 50% 50%,transparent 55%,rgba(200,30,24,.28) 78%,rgba(226,69,59,.6) 100%);
  animation:fx-vig 600ms var(--ease-out) both;
}
.fx-vignette.fx-vig-heal{
  background:radial-gradient(ellipse at 50% 50%,transparent 62%,rgba(67,178,119,.12) 82%,rgba(90,160,120,.28) 100%);
  animation:fx-vig 900ms var(--ease-out) both;
}
@keyframes fx-vig{0%{opacity:0}15%{opacity:1}100%{opacity:0}}

/* A3 他人受击：红闪 + 轻微抖动 */
.pcard.fx-hit{animation:fx-hit 460ms var(--ease-out)}
@keyframes fx-hit{
  0%{transform:translateX(0);box-shadow:0 0 0 2px rgba(226,69,59,.95),0 0 26px rgba(226,69,59,.6),var(--sh2)}
  20%{transform:translateX(-3px)}
  40%{transform:translateX(3px)}
  60%{transform:translateX(-2px);box-shadow:0 0 0 1px rgba(226,69,59,.6),0 0 16px rgba(226,69,59,.35),var(--sh2)}
  80%{transform:translateX(2px)}
  100%{transform:translateX(0);box-shadow:var(--sh2)}
}

@media (prefers-reduced-motion:reduce){
  .fx-vignette{display:none}
  .pcard.fx-hit{animation:none}
  .card.fx-tilt{transform:none}
  .card.fx-tilt::after{display:none}
}

===FILE: client/index.html===
===NOCHANGE===