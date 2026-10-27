**摘要（C1 / C2）**
1. 泄漏一：切出桌面时，询问倒计时 `S.timer`（驱动计时条 scaleX）仍在跑。改为在 `switchView` 离开 table 时清掉。没有放进 `fxReset`，因为同局重开时 `fxReset` 也会被调用，放进去会误杀新询问的倒计时。
2. 泄漏二 / 重复触发：不经大厅、在桌面上直接开下一局时，旧的 `lastHp` 会让所有座位一起飘「+N」并闪回合横幅。现在以「人数变化或回合数回退」判定为新局，先 `fxReset()` 再记录基线。
3. `fxReset` 补充清理残留的 `.fx-pulse`，并重置新局判定状态。
4. 性能一：`fxFlyCards` 原来逐张交替「读 rect → 写 DOM」。改为先批量读布局，再用 DocumentFragment 一次性插入；查找手牌节点改为 Map。
5. 性能二：`fxDiffHp` 在 8 人座位上会多次交替读写。改为三段：先算差分，再统一读 rect，最后统一写入；`fxFloat` 接受预读的 rect。
6. 重复触发已核查：飘字只来自 hp 差分，技能名只来自战报解析，两者不重叠；技能名用 Set 去重。横幅与顶栏金线是设计上的双通道（中央 + 顶栏）。`renderTable` 多次调用不会重复，因为都按 key 或差分去重。
7. reduced-motion：
   - `fxPulseSeat` 补上 JS 层降级。
   - CSS 补齐 `.fx-float/.fx-banner/.fx-hit/.fx-pulse/.fx-vignette/询问面板进出/战报入场/计时条`。
   - 飘字与横幅在降级时改为静态显示到时长结束，不会因全局 1ms 规则一闪而过、丢失伤害信息。
8. 边界已核查：
   - 手牌为空：`fxFlyCards` 无 job 直接返回。
   - 2 人 / 8 人：座位节点按 `data-seat` 查找，与数量无关。
   - 自身阵亡：`selfInfo` 仍在，暗角正常、无报错。
   - 战报清空：技能飘字计数不依赖战报列表。
9. 统一节奏：
   - 新增 `fxVar()` / `fxMs()`，从 CSS 变量读取时长与缓动并缓存。JS 中的 520 / 950 / 1250 / 1300 / 1450 / 1000 / 600 / 900 / 180 / 80 / 50 / 30 全部改为读变量。
   - 交互类统一：面板进出用 `--t-base`；卡牌抬起沿用 `--t-base`；目标脉冲与将池入场用 `--t-slow`；错峰统一用 `--fx-stagger`。
   - 叙事类长动效（飞牌、飘字、横幅、技能名、金线、受击、暗角）集中定义在 `:root` 的 `--fx-t-*` 中。不用 calc，因为 JS 读不到 calc 的解析结果。
10. 未改：B2 结算浮层的一次性编排时长（不属于同类交互，保持原样）；`toast` 与卡牌提示（非 fx 模块）。
11. 待确认：片段中未见 `fxVigEl`、`fxConnState` 的声明，也未见第一轮 `.fx-float` / `.fx-banner` 等 CSS。CSS 部分只追加了时长与降级覆盖，不重定义 keyframes。

===PATCH: client/app.js===
<<<<<<< SEARCH
function fxLater(fn, ms) {
  const t = setTimeout(() => { FX.timers.delete(t); fn(); }, ms);
  FX.timers.add(t);
  return t;
}

function fxCancel(t) { if (t != null) { clearTimeout(t); FX.timers.delete(t); } }
=======
function fxLater(fn, ms) {
  const t = setTimeout(() => { FX.timers.delete(t); fn(); }, ms);
  FX.timers.add(t);
  return t;
}

function fxCancel(t) { if (t != null) { clearTimeout(t); FX.timers.delete(t); } }

// 动效节奏统一从 CSS 变量读取（缓存）；JS 不再散落硬编码 ms
const FX_VARS = new Map();
function fxVar(name, fb) {
  if (FX_VARS.has(name)) return FX_VARS.get(name);
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
  FX_VARS.set(name, v);
  return v;
}
function fxMs(name, fb) {
  const v = String(fxVar(name, ''));
  const n = parseFloat(v);
  if (!isFinite(n)) return fb;
  return /ms$/.test(v) ? n : (/s$/.test(v) ? n * 1000 : n);
}
>>>>>>> REPLACE

<<<<<<< SEARCH
  for (const t of FX.timers) clearTimeout(t);
  FX.timers.clear();
  for (const a of [...FX.anims]) { try { a.cancel(); } catch {} }
  FX.anims.clear();
  document.querySelectorAll('.fx-fly,.fx-float,.fx-banner,.fx-skill').forEach(n => n.remove());
  FX.lastHp.clear(); FX.lastArmor.clear(); FX.floatN.clear();
=======
  for (const t of FX.timers) clearTimeout(t);
  FX.timers.clear();
  for (const a of [...FX.anims]) { try { a.cancel(); } catch {} }
  FX.anims.clear();
  document.querySelectorAll('.fx-fly,.fx-float,.fx-banner,.fx-skill').forEach(n => n.remove());
  document.querySelectorAll('.fx-pulse').forEach(n => n.classList.remove('fx-pulse'));
  FX.lastHp.clear(); FX.lastArmor.clear(); FX.floatN.clear();
  FX.lastN = null; FX.lastTurn = 0;
>>>>>>> REPLACE

<<<<<<< SEARCH
function fxFlyCards(ids) {
  if (!ids || !ids.length || reduceMotion()) return;
  const dest = document.getElementById('tableCenter');
  if (!dest || !dest.isConnected) return;
  const dr = dest.getBoundingClientRect();
  if (!dr.width) return;
  const tx = dr.left + dr.width / 2, ty = dr.top + dr.height / 2;
  const nodes = [...document.querySelectorAll('#handRow .card')];
  const mid = (ids.length - 1) / 2;
  ids.forEach((id, i) => {
    const src = nodes.find(n => n.dataset.cid === String(id));
    if (!src) return;
    const r = src.getBoundingClientRect();
    const g = src.cloneNode(true);
    g.classList.remove('sel', 'picked', 'disabled');
    g.classList.add('fx-fly');
    g.removeAttribute('data-cid');
    g.setAttribute('aria-hidden', 'true');
    Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.appendChild(g);
=======
function fxFlyCards(ids) {
  if (!ids || !ids.length || reduceMotion()) return;
  const dest = document.getElementById('tableCenter');
  if (!dest || !dest.isConnected) return;
  const dr = dest.getBoundingClientRect();
  if (!dr.width) return;
  const tx = dr.left + dr.width / 2, ty = dr.top + dr.height / 2;
  const byId = new Map([...document.querySelectorAll('#handRow .card')].map(n => [n.dataset.cid, n]));
  const mid = (ids.length - 1) / 2;
  // 先统一读布局，再用 fragment 统一写，避免逐张 read/write 交替
  const jobs = [];
  ids.forEach((id, i) => {
    const src = byId.get(String(id));
    if (!src) return;
    const r = src.getBoundingClientRect();
    if (r.width) jobs.push({ src, r, i });
  });
  if (!jobs.length) return;
  const frag = document.createDocumentFragment();
  const ghosts = jobs.map(({ src, r, i }) => {
    const g = src.cloneNode(true);
    g.classList.remove('sel', 'picked', 'disabled', 'fx-tilt');
    g.classList.add('fx-fly');
    g.removeAttribute('data-cid');
    g.setAttribute('aria-hidden', 'true');
    Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    frag.appendChild(g);
    return { g, r, i };
  });
  document.body.appendChild(frag);
  ghosts.forEach(({ g, r, i }) => {
>>>>>>> REPLACE

<<<<<<< SEARCH
    const dx = tx - (r.left + r.width / 2) + (i - mid) * 18;
    const dy = ty - (r.top + r.height / 2);
    const rot = (i - mid) * 6;
    let anim;
    try {
      anim = g.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { offset: 0.75, transform: `translate(${dx}px,${dy}px) scale(.82) rotate(${rot}deg)`, opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(.7) rotate(${rot}deg)`, opacity: 0 },
      ], { duration: 520, delay: i * 50, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    } catch { g.remove(); return; }
=======
    const dx = tx - (r.left + r.width / 2) + (i - mid) * 18;
    const dy = ty - (r.top + r.height / 2);
    const rot = (i - mid) * 6;
    let anim;
    try {
      anim = g.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { offset: 0.75, transform: `translate(${dx}px,${dy}px) scale(.82) rotate(${rot}deg)`, opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(.7) rotate(${rot}deg)`, opacity: 0 },
      ], {
        duration: fxMs('--fx-t-fly', 520),
        delay: i * fxMs('--fx-stagger', 40),
        easing: fxVar('--ease-out', 'cubic-bezier(.2,.8,.2,1)'),
        fill: 'both',
      });
    } catch { g.remove(); return; }
>>>>>>> REPLACE

<<<<<<< SEARCH
function fxFloat(anchor, key, text, kind) {
  if (!anchor || !anchor.isConnected) return;
  const r = anchor.getBoundingClientRect();
  if (!r.width) return;
  const n = FX.floatN.get(key) || 0;
  FX.floatN.set(key, n + 1);
  const f = el('div', 'fx-float fx-' + kind);
  f.textContent = text;
  f.setAttribute('aria-hidden', 'true');
  f.style.left = `${r.left + r.width / 2 + (n ? (n % 2 ? 16 : -16) : 0)}px`;
  f.style.top = `${r.top + Math.min(r.height, 60) * 0.45 - n * 18}px`;
  document.body.appendChild(f);
  fxLater(() => {
    f.remove();
    const m = (FX.floatN.get(key) || 1) - 1;
    if (m > 0) FX.floatN.set(key, m); else FX.floatN.delete(key);
  }, 950);
}
=======
function fxFloat(anchor, key, text, kind, rect) {
  if (!anchor || !anchor.isConnected) return;
  const r = rect || anchor.getBoundingClientRect();
  if (!r || !r.width) return;
  const n = FX.floatN.get(key) || 0;
  FX.floatN.set(key, n + 1);
  const f = el('div', 'fx-float fx-' + kind);
  f.textContent = text;
  f.setAttribute('aria-hidden', 'true');
  f.style.left = `${r.left + r.width / 2 + (n ? (n % 2 ? 16 : -16) : 0)}px`;
  f.style.top = `${r.top + Math.min(r.height, 60) * 0.45 - n * 18}px`;
  document.body.appendChild(f);
  fxLater(() => {
    f.remove();
    const m = (FX.floatN.get(key) || 1) - 1;
    if (m > 0) FX.floatN.set(key, m); else FX.floatN.delete(key);
  }, fxMs('--fx-t-float', 900) + 50);
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
=======
function fxDiffHp(snap) {
  const jobs = [];
  for (const p of snap.players || []) {
    const k = p.seat;
    const ph = FX.lastHp.get(k), pa = FX.lastArmor.get(k);
    const hp = Number(p.hp || 0), ar = Number(p.armor || 0);
    FX.lastHp.set(k, hp); FX.lastArmor.set(k, ar);
    if (ph === undefined) continue;
    if (hp === ph && !(pa !== undefined && ar < pa)) continue;
    jobs.push({ k, ph, pa, hp, ar, anchor: fxSeatNode(k) });
  }
  // 统一读布局后再统一写入，8 人座也只触发一次 layout
  for (const j of jobs) j.rect = j.anchor && j.anchor.isConnected ? j.anchor.getBoundingClientRect() : null;
  for (const { k, ph, pa, hp, ar, anchor, rect } of jobs) {
    const self = S.seat != null && k === S.seat;
    if (pa !== undefined && ar < pa) fxFloat(anchor, k, `-${pa - ar} 护甲`, 'armor', rect);
    if (hp < ph) {
      fxFloat(anchor, k, `-${ph - hp}`, 'dmg', rect);
      if (self) fxVignette('dmg'); else fxHitSeat(k);
    } else if (hp > ph) {
      fxFloat(anchor, k, `+${hp - ph}`, 'heal', rect);
      if (self) fxVignette('heal');
    }
  }
}
>>>>>>> REPLACE

<<<<<<< SEARCH
  const b = el('div', 'fx-banner' + (mine ? ' fx-mine' : ''));
  b.textContent = mine ? `你的回合 · ${phaseCN(snap.phase)}` : `${cur?.name || ''} 的回合`;
  b.setAttribute('aria-hidden', 'true');
  host.appendChild(b);
  fxLater(() => b.remove(), 1250);
=======
  const b = el('div', 'fx-banner' + (mine ? ' fx-mine' : ''));
  b.textContent = mine ? `你的回合 · ${phaseCN(snap.phase)}` : `${cur?.name || ''} 的回合`;
  b.setAttribute('aria-hidden', 'true');
  host.appendChild(b);
  fxLater(() => b.remove(), fxMs('--fx-t-banner', 1200) + 50);
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
  if (reduceMotion()) return;
  const node = fxSeatNode(seat);
  if (!node) return;
  node.classList.remove('fx-pulse');
  void node.offsetWidth;
  node.classList.add('fx-pulse');
  const off = () => node.classList.remove('fx-pulse');
  node.addEventListener('animationend', off, { once: true });
  fxLater(off, fxMs('--t-slow', 320) + 100);
}
>>>>>>> REPLACE

<<<<<<< SEARCH
  const n = (v._n || 0) + 1;
  v._n = n;
  const off = () => { if (v._n === n) v.className = 'fx-vignette'; };
  v.onanimationend = off;
  fxLater(off, 1000);
=======
  const n = (v._n || 0) + 1;
  v._n = n;
  const off = () => { if (v._n === n) v.className = 'fx-vignette'; };
  v.onanimationend = off;
  fxLater(off, fxMs('--fx-t-vig', 900) + 100);
>>>>>>> REPLACE

<<<<<<< SEARCH
  const n = (node._fxHitN || 0) + 1;
  node._fxHitN = n;
  const off = () => { if (node._fxHitN === n) node.classList.remove('fx-hit'); };
  node.addEventListener('animationend', off, { once: true });
  fxLater(off, 600);
=======
  const n = (node._fxHitN || 0) + 1;
  node._fxHitN = n;
  const off = () => { if (node._fxHitN === n) node.classList.remove('fx-hit'); };
  node.addEventListener('animationend', off, { once: true });
  fxLater(off, fxMs('--fx-t-hit', 480) + 100);
>>>>>>> REPLACE

<<<<<<< SEARCH
  box.classList.add('fx-out');
  FX.askHideT = fxLater(() => {
    FX.askHideT = null;
    box.classList.add('hidden');
    box.classList.remove('fx-out', 'fx-in');
  }, 180);
=======
  box.classList.add('fx-out');
  FX.askHideT = fxLater(() => {
    FX.askHideT = null;
    box.classList.add('hidden');
    box.classList.remove('fx-out', 'fx-in');
  }, fxMs('--t-base', 200));
>>>>>>> REPLACE

<<<<<<< SEARCH
      const it = el('div', 'pool-item' + (taken ? ' dis' : '') + (on ? ' on' : ''));
      if (!grid._fxDone && !reduceMotion()) {
        it.classList.add('fx-pick-in');
        it.style.animationDelay = `${Math.min(grid.children.length, 16) * 30}ms`;
        it.addEventListener('animationend', () => { it.classList.remove('fx-pick-in'); it.style.animationDelay = ''; }, { once: true });
      }
=======
      const it = el('div', 'pool-item' + (taken ? ' dis' : '') + (on ? ' on' : ''));
      if (!grid._fxDone && !reduceMotion()) {
        it.classList.add('fx-pick-in');
        it.style.setProperty('--fx-i', String(Math.min(grid.children.length, 16)));
        it.addEventListener('animationend', () => { it.classList.remove('fx-pick-in'); it.style.removeProperty('--fx-i'); }, { once: true });
      }
>>>>>>> REPLACE

<<<<<<< SEARCH
function switchView(v) {
  S.view = v;
  if (v !== 'table') fxReset();
  for (const id of ['lobby', 'room', 'table']) {
    $('#' + id).classList.toggle('hidden', id !== v);
  }
=======
function switchView(v) {
  S.view = v;
  if (v !== 'table') { fxReset(); clearInterval(S.timer); }
  for (const id of ['lobby', 'room', 'table']) {
    $('#' + id).classList.toggle('hidden', id !== v);
  }
>>>>>>> REPLACE

<<<<<<< SEARCH
  syncAskOffset();
  const fxPrevKey = FX.lastPhaseKey;
  try { fxDiffHp(snap); fxPhaseBanner(snap, cur); fxTurnSweep(fxPrevKey, snap); } catch {}
  if (!FX.skillArmed && !FX.skillArmT) {
    FX.skillArmT = fxLater(() => { FX.skillArmT = null; FX.skillArmed = true; }, 800);
  }
=======
  syncAskOffset();
  // 不经过房间视图直接开新局（人数变化 / 回合数回退）：先清掉上一局的差分基线，避免全员飘「+N」
  const fxN = snap.players.length, fxTurn = Number(snap.turn) || 0;
  if (FX.lastN != null && (fxN !== FX.lastN || fxTurn < (FX.lastTurn || 0))) fxReset();
  FX.lastN = fxN; FX.lastTurn = fxTurn;
  const fxPrevKey = FX.lastPhaseKey;
  try { fxDiffHp(snap); fxPhaseBanner(snap, cur); fxTurnSweep(fxPrevKey, snap); } catch {}
  if (!FX.skillArmed && !FX.skillArmT) {
    FX.skillArmT = fxLater(() => { FX.skillArmT = null; FX.skillArmed = true; }, 800);
  }
>>>>>>> REPLACE

<<<<<<< SEARCH
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
=======
  const now = Date.now();
  const delay = Math.max(0, (FX.skillNextAt || 0) - now);
  FX.skillNextAt = now + delay + fxMs('--fx-stagger', 40) * 2;
  FX.skillLive = live + 1;
  const f = el('div', 'fx-skill');
  f.textContent = `【${name}】`;
  f.setAttribute('aria-hidden', 'true');
  f.style.setProperty('--k', String(live));
  f.style.animationDelay = `${delay}ms`;
  host.appendChild(f);
  fxLater(() => { f.remove(); FX.skillLive = Math.max(0, (FX.skillLive || 1) - 1); }, delay + fxMs('--fx-t-skill', 1400) + 50);
>>>>>>> REPLACE

<<<<<<< SEARCH
  tb.classList.add('fx-sweep');
  const n = (tb._fxSw || 0) + 1;
  tb._fxSw = n;
  const off = () => { if (tb._fxSw === n) tb.classList.remove('fx-sweep'); };
  fxLater(off, 1300);
=======
  tb.classList.add('fx-sweep');
  const n = (tb._fxSw || 0) + 1;
  tb._fxSw = n;
  const off = () => { if (tb._fxSw === n) tb.classList.remove('fx-sweep'); };
  fxLater(off, fxMs('--fx-t-sweep', 1200) + 100);
>>>>>>> REPLACE

<<<<<<< SEARCH
    c.classList.add('fx-conn-back');
    const off = () => c.classList.remove('fx-conn-back');
    c.addEventListener('animationend', off, { once: true });
    fxLater(off, 900);
  }).observe(c, { attributes: true, attributeFilter: ['class'] });
=======
    c.classList.add('fx-conn-back');
    const off = () => c.classList.remove('fx-conn-back');
    c.addEventListener('animationend', off, { once: true });
    fxLater(off, fxMs('--fx-t-vig', 900) + 100);
  }).observe(c, { attributes: true, attributeFilter: ['class'] });
>>>>>>> REPLACE

===FILE: client/style.css.append===
/* ========== 第二阶段 · 批次 C：动效节奏统一 + reduced-motion 补全 ========== */
/* 交互类用 --t-fast/--t-base/--t-slow；叙事类长动效集中在此（字面量，便于 JS fxMs 读取） */
:root{
  --fx-t-fly:520ms;--fx-t-float:900ms;--fx-t-banner:1200ms;--fx-t-skill:1400ms;
  --fx-t-sweep:1200ms;--fx-t-hit:480ms;--fx-t-vig:900ms;--fx-stagger:40ms;
}
/* 交互类：面板进出 / 战报入场 = base；目标脉冲 / 列表入场 / 涟漪 = slow */
#askPanel.fx-in,#askPanel.fx-out{animation-duration:var(--t-base);animation-timing-function:var(--ease-out)}
#logList .fx-log-in{animation-duration:var(--t-base);animation-timing-function:var(--ease-out)}
.fx-pulse{animation-duration:var(--t-slow)}
.pool-item.fx-pick-in{animation-duration:var(--t-slow);animation-delay:calc(var(--fx-i,0) * var(--fx-stagger))}
.chip.fx-ripple::after{animation-duration:var(--t-slow)}
#lobby>.panel,#room>.panel{animation-duration:var(--t-slow)}
#lobby>.panel:nth-child(2){animation-delay:var(--fx-stagger)}
#lobby>.panel:nth-child(3){animation-delay:calc(var(--fx-stagger) * 2)}
#lobby>.panel:nth-child(4){animation-delay:calc(var(--fx-stagger) * 3)}
/* 叙事类 */
.fx-float{animation-duration:var(--fx-t-float)}
.fx-banner{animation-duration:var(--fx-t-banner)}
.fx-skill{animation-duration:var(--fx-t-skill)}
#topbar.fx-sweep::after{animation-duration:var(--fx-t-sweep)}
.pcard.fx-hit{animation-duration:var(--fx-t-hit)}
.fx-vignette.fx-vig-dmg,.fx-vignette.fx-vig-heal{animation-duration:var(--fx-t-vig)}
.conn.fx-conn-back::before{animation-duration:var(--fx-t-vig)}

@media (prefers-reduced-motion:reduce){
  /* 信息类：静态显示到定时器移除，不因全局 1ms 规则一闪而过 */
  .fx-float,.fx-banner{animation:none!important;opacity:1}
  /* 装饰类：直接无动画 */
  .fx-vignette{display:none}
  .pcard.fx-hit,.fx-pulse,#askPanel.fx-in,#askPanel.fx-out,#logList .fx-log-in{animation:none!important}
  #askPanel .timer i{transition:none!important}
}

===FILE: client/index.html===
===NOCHANGE===