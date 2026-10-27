**改造摘要**
- 新增模块级 `FX` 状态，记录定时器、动画句柄、上一帧 hp/护甲、飘字计数和阶段键。所有定时器都经 `fxLater()` 登记，切出桌面视图时由 `fxReset()` 统一清理。
- 飞牌：手牌节点新增 `data-cid`。`submitPlay()` 和弃牌「确定」在调用 `submit()` 之前先执行 `fxFlyCards()`。
  - 做法是克隆节点，挂到 body 上用 `position:fixed`，再用 `el.animate` 飞向 `#tableCenter`。
  - 多张牌依次错开 50ms 飞出；`onfinish` / `oncancel` 时移除克隆。不 await，提交请求体不变。
- 飘字：`renderTable()` 末尾调用 `fxDiffHp()`，与上一帧的 hp/护甲做差分。
  - 首帧（无旧值）不飘字。
  - 对手卡锚定 `.pcard[data-seat]`（新增 data 属性），自己锚定 `#selfInfo`。
  - 同一座位连续飘字按计数上移 18px，并左右交错。飘字为 fixed + `pointer-events:none`，950ms 后清理。
- 中央提示：`fxPhaseBanner()` 以「回合|当前座位|阶段」为键去重，同一阶段不重复闪。
  - 轮到我时，每个阶段都提示「你的回合 · X」。
  - 他人回合只在回合开始时提示一次，避免 AI 刷屏。
  - 提示挂在 `#tableCenter` 内，绝对定位，不参与布局。`#tableCenter` 本身不会被重建。
- 询问面板：显示时去掉 hidden 并加 `fx-in`；关闭走 `fx-out` 动画，180ms 后再加 hidden（有 setTimeout 兜底）。
  - 减弱动效时直接隐藏。
  - `submit()` 原有的立即隐藏逻辑不动，`syncAskOffset()` 不受影响。
- 计时条：JS 只在 `.timer` 上设置 `--p`，CSS 用 `scaleX(var(--p))` 驱动。
  - `--p` ≤0.3 加 `fx-warn`（橙），≤0.15 加 `fx-danger`（红 + 脉冲）。
  - 原代码没有剩余时间文案，因此无需保留。
- 战报：追加前判断是否在底部（阈值 24px），只有在底部才自动滚到最新；新条目加 `fx-log-in` 入场，`animationend` 后移除该类。
- 目标选择：`toggleTarget()` 后对座位卡执行 `fxPulseSeat()`（box-shadow 脉冲，animationend 移除，另有定时兜底）。
  - 复用已有提示：出牌栏的「已选目标」后追加「还需选择 N 个」。
  - targets 询问中的「还需 N 个」提示加了 `fx-need` 类，选择时原地更新文本，不重建面板，不重置计时。
- 减弱动效：飞牌直接跳过，面板关闭直接隐藏；飘字和横幅改为静态显示后按时移除，其余依赖全局 reduced-motion 规则。
- 硬约束核对：
  - 只新增 `fx-` 类名与 data 属性，未改任何 id 或已有类名。
  - 未改 `api()`、`connect()`、`submit()` 及各请求体、判定函数。
  - 过渡只用 transform / opacity / box-shadow / 颜色。

===PATCH: client/app.js===
<<<<<<< SEARCH
const isMobileLayout = () => window.matchMedia('(max-width: 760px)').matches;

const SUIT_CHAR = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const SUB_CN = { weapon: '武器', armor: '防具', 'horse+': '+1马', 'horse-': '-1马' };
const EQUIP_SLOTS = [['weapon', '武器'], ['armor', '防具'], ['horsePlus', '+1马'], ['horseMinus', '-1马'], ['treasure', '宝物']];
=======
const isMobileLayout = () => window.matchMedia('(max-width: 760px)').matches;

const SUIT_CHAR = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const SUB_CN = { weapon: '武器', armor: '防具', 'horse+': '+1马', 'horse-': '-1马' };
const EQUIP_SLOTS = [['weapon', '武器'], ['armor', '防具'], ['horsePlus', '+1马'], ['horseMinus', '-1马'], ['treasure', '宝物']];

// ---------------- 视觉动效层（纯表现，不参与任何规则判定） ----------------
const FX = {
  timers: new Set(), anims: new Set(),
  lastHp: new Map(), lastArmor: new Map(), floatN: new Map(),
  lastPhaseKey: null, askHideT: null,
};
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function fxLater(fn, ms) {
  const t = setTimeout(() => { FX.timers.delete(t); fn(); }, ms);
  FX.timers.add(t);
  return t;
}
function fxCancel(t) { if (t != null) { clearTimeout(t); FX.timers.delete(t); } }
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
// 飞牌：克隆手牌节点为 fixed 影子，飞向中央后移除；真实节点不动，不阻塞提交
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
    FX.anims.add(anim);
    const done = () => { FX.anims.delete(anim); g.remove(); };
    anim.onfinish = done;
    anim.oncancel = done;
  });
}
function fxSeatNode(seat) {
  if (S.seat != null && seat === S.seat) return document.getElementById('selfInfo');
  return document.querySelector(`#opponents .pcard[data-seat="${seat}"]`);
}
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
// 与上一帧对比 hp / 护甲，首帧只记录不飘字
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
// 回合/阶段切换的中央轻提示（同键不重复）
function fxPhaseBanner(snap, cur) {
  const key = `${snap.turn}|${snap.currentIndex}|${snap.phase}`;
  const prev = FX.lastPhaseKey;
  FX.lastPhaseKey = key;
  if (prev === null || prev === key || snap.over) return;
  const [pTurn, pIdx] = prev.split('|');
  const turnChanged = pTurn !== String(snap.turn) || pIdx !== String(snap.currentIndex);
  const mine = S.seat != null && snap.currentIndex === S.seat;
  if (!mine && !turnChanged) return;
  const host = document.getElementById('tableCenter');
  if (!host) return;
  host.querySelectorAll('.fx-banner').forEach(n => n.remove());
  const b = el('div', 'fx-banner' + (mine ? ' fx-mine' : ''));
  b.textContent = mine ? `你的回合 · ${phaseCN(snap.phase)}` : `${cur?.name || ''} 的回合`;
  b.setAttribute('aria-hidden', 'true');
  host.appendChild(b);
  fxLater(() => b.remove(), 1250);
}
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
function fxShowAsk(box) {
  fxCancel(FX.askHideT); FX.askHideT = null;
  box.classList.remove('fx-out');
  const was = box.classList.contains('hidden');
  box.classList.remove('hidden');
  if (was) { box.classList.remove('fx-in'); void box.offsetWidth; box.classList.add('fx-in'); }
}
function fxHideAsk(box) {
  if (box.classList.contains('hidden')) { box.classList.remove('fx-out', 'fx-in'); return; }
  if (reduceMotion()) { box.classList.add('hidden'); box.classList.remove('fx-out', 'fx-in'); return; }
  if (box.classList.contains('fx-out')) return;
  box.classList.add('fx-out');
  FX.askHideT = fxLater(() => {
    FX.askHideT = null;
    box.classList.add('hidden');
    box.classList.remove('fx-out', 'fx-in');
  }, 180);
}
>>>>>>> REPLACE
<<<<<<< SEARCH
function switchView(v) {
  S.view = v;
  for (const id of ['lobby', 'room', 'table']) {
    $('#' + id).classList.toggle('hidden', id !== v);
  }
  if (v === 'table' && !S.logTouched) S.logOpen = !isMobileLayout();
=======
function switchView(v) {
  S.view = v;
  if (v !== 'table') fxReset();
  for (const id of ['lobby', 'room', 'table']) {
    $('#' + id).classList.toggle('hidden', id !== v);
  }
  if (v === 'table' && !S.logTouched) S.logOpen = !isMobileLayout();
>>>>>>> REPLACE
<<<<<<< SEARCH
  const cur = snap.players[snap.currentIndex];
  $('#phaseInfo').innerHTML = cur ? `当前回合：<b>${esc(cur.name)}</b>（${esc(cur.generalName)}）` : '';
  $('#discardInfo').textContent = `弃牌堆 ${snap.discardCount} 张`;
  syncAskOffset();
}
=======
  const cur = snap.players[snap.currentIndex];
  $('#phaseInfo').innerHTML = cur ? `当前回合：<b>${esc(cur.name)}</b>（${esc(cur.generalName)}）` : '';
  $('#discardInfo').textContent = `弃牌堆 ${snap.discardCount} 张`;
  syncAskOffset();
  try { fxDiffHp(snap); fxPhaseBanner(snap, cur); } catch {}
}
>>>>>>> REPLACE
<<<<<<< SEARCH
function playerCard(p, snap) {
  const c = el('div', 'pcard' + (p.alive ? '' : ' dead') + (snap.currentIndex === p.seat ? ' active' : ''));
  if (isTargetSelectable(p)) {
    c.classList.add('targetable');
    c.onclick = () => toggleTarget(p.seat);
=======
function playerCard(p, snap) {
  const c = el('div', 'pcard' + (p.alive ? '' : ' dead') + (snap.currentIndex === p.seat ? ' active' : ''));
  c.dataset.seat = String(p.seat);
  if (isTargetSelectable(p)) {
    c.classList.add('targetable');
    c.onclick = () => toggleTarget(p.seat);
>>>>>>> REPLACE
<<<<<<< SEARCH
    if (isMou) d.classList.add('z-mou');
    if (allowed && !allowed.includes(c.id)) d.classList.add('disabled');
    if (S.sel.includes(c.id)) d.classList.add('sel');
    const red = c.suit === 'heart' || c.suit === 'diamond';
    const kindTxt = isTz ? '天机' : isMou ? '谋' : typeCN(meta.type);
=======
    if (isMou) d.classList.add('z-mou');
    d.dataset.cid = String(c.id);
    if (allowed && !allowed.includes(c.id)) d.classList.add('disabled');
    if (S.sel.includes(c.id)) d.classList.add('sel');
    const red = c.suit === 'heart' || c.suit === 'diamond';
    const kindTxt = isTz ? '天机' : isMou ? '谋' : typeCN(meta.type);
>>>>>>> REPLACE
<<<<<<< SEARCH
    if (card) {
      const auto = autoTargetSeats(card);
      const txt = auto.length
        ? `目标已自动选择：${auto.map(nameOf).join('、')}`
        : (S.targets.length ? `已选目标：${S.targets.map(nameOf).join('、')}` : '请点击上方玩家选择目标');
      bar.appendChild(el('div', 'hint', txt));
    }
=======
    if (card) {
      const auto = autoTargetSeats(card);
      let txt = auto.length
        ? `目标已自动选择：${auto.map(nameOf).join('、')}`
        : (S.targets.length ? `已选目标：${S.targets.map(nameOf).join('、')}` : '请点击上方玩家选择目标');
      const needLeft = Math.max(0, (S.cards[card.name]?.target?.min ?? 0) - S.targets.length);
      if (!auto.length && needLeft > 0) txt += ` · 还需选择 ${needLeft} 个`;
      bar.appendChild(el('div', 'hint', txt));
    }
>>>>>>> REPLACE
<<<<<<< SEARCH
function toggleTarget(seat) {
  if (S.ask?.kind === 'targets') {
    const max = S.ask.max || 1;
    if (S.targets.includes(seat)) S.targets = S.targets.filter(s => s !== seat);
    else { S.targets.push(seat); if (S.targets.length > max) S.targets.shift(); }
    if (S.targets.length >= (S.ask.min || 1)) submit({ seats: S.targets });
    return;
  }
  const meta = currentCardMeta();
  const max = meta?.target?.max ?? 1;
  if (S.targets.includes(seat)) S.targets = S.targets.filter(s => s !== seat);
  else { S.targets.push(seat); if (S.targets.length > max) S.targets.shift(); }
  renderTable();
}
=======
function toggleTarget(seat) {
  if (S.ask?.kind === 'targets') {
    const max = S.ask.max || 1;
    if (S.targets.includes(seat)) S.targets = S.targets.filter(s => s !== seat);
    else { S.targets.push(seat); if (S.targets.length > max) S.targets.shift(); }
    fxPulseSeat(seat);
    const nh = document.querySelector('#askPanel .fx-need');
    if (nh) nh.textContent = `请点击上方玩家选择目标（还需 ${Math.max(0, (S.ask.min || 1) - S.targets.length)} 个）`;
    if (S.targets.length >= (S.ask.min || 1)) submit({ seats: S.targets });
    return;
  }
  const meta = currentCardMeta();
  const max = meta?.target?.max ?? 1;
  if (S.targets.includes(seat)) S.targets = S.targets.filter(s => s !== seat);
  else { S.targets.push(seat); if (S.targets.length > max) S.targets.shift(); }
  renderTable();
  fxPulseSeat(seat);
}
>>>>>>> REPLACE
<<<<<<< SEARCH
  if (!S.targets.length) {
    const card = (S.snap?.players?.[S.seat]?.hand || []).find(c => c.id === cardId);
    const auto = autoTargetSeats(card);
    if (auto.length) S.targets = auto;
  }
  if (S.targets.length < need) return alert(`需要选择 ${need} 个目标`);
  submit({ cardId, seats: S.targets });
=======
  if (!S.targets.length) {
    const card = (S.snap?.players?.[S.seat]?.hand || []).find(c => c.id === cardId);
    const auto = autoTargetSeats(card);
    if (auto.length) S.targets = auto;
  }
  if (S.targets.length < need) return alert(`需要选择 ${need} 个目标`);
  try { fxFlyCards([cardId]); } catch {}
  submit({ cardId, seats: S.targets });
>>>>>>> REPLACE
<<<<<<< SEARCH
function renderAsk() {
  const a = S.ask;
  const box = $('#askPanel');
  if (!a || a.kind === 'play') { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = '';
=======
function renderAsk() {
  const a = S.ask;
  const box = $('#askPanel');
  if (!a || a.kind === 'play') { fxHideAsk(box); return; }
  fxShowAsk(box);
  box.innerHTML = '';
>>>>>>> REPLACE
<<<<<<< SEARCH
  } else if (a.kind === 'targets') {
    box.appendChild(el('div', 'hint', `请点击上方玩家选择目标（还需 ${Math.max(0, (a.min || 1) - S.targets.length)} 个）`));
    const cancel = el('button', 'ghost', '取消');
    cancel.onclick = () => submit({ seats: [] });
    opts.appendChild(cancel);
=======
  } else if (a.kind === 'targets') {
    box.appendChild(el('div', 'hint fx-need', `请点击上方玩家选择目标（还需 ${Math.max(0, (a.min || 1) - S.targets.length)} 个）`));
    const cancel = el('button', 'ghost', '取消');
    cancel.onclick = () => submit({ seats: [] });
    opts.appendChild(cancel);
>>>>>>> REPLACE
<<<<<<< SEARCH
    const ok = el('button', 'primary', '确定');
    ok.onclick = () => {
      const n = a.min || 1;
      if (S.sel.length < n) return alert(`至少选择 ${n} 张`);
      submit({ cardIds: S.sel.slice() });
    };
=======
    const ok = el('button', 'primary', '确定');
    ok.onclick = () => {
      const n = a.min || 1;
      if (S.sel.length < n) return alert(`至少选择 ${n} 张`);
      try { fxFlyCards(S.sel.slice()); } catch {}
      submit({ cardIds: S.sel.slice() });
    };
>>>>>>> REPLACE
<<<<<<< SEARCH
  const total = a.timeout || 30000;
  const start = Date.now();
  clearInterval(S.timer);
  S.timer = setInterval(() => {
    const left = Math.max(0, total - (Date.now() - start));
    i.style.width = (left / total * 100) + '%';
    if (left <= 0) clearInterval(S.timer);
  }, 100);
=======
  const total = a.timeout || 30000;
  const start = Date.now();
  bar.style.setProperty('--p', '1');
  clearInterval(S.timer);
  S.timer = setInterval(() => {
    const left = Math.max(0, total - (Date.now() - start));
    const p = total > 0 ? left / total : 0;
    bar.style.setProperty('--p', p.toFixed(3));
    bar.classList.toggle('fx-warn', p <= 0.3 && p > 0.15);
    bar.classList.toggle('fx-danger', p <= 0.15);
    if (left <= 0) clearInterval(S.timer);
  }, 100);
>>>>>>> REPLACE
<<<<<<< SEARCH
function addLog(entry) {
  const box = $('#logList');
  const d = el('div');
  d.textContent = entry.text; // 战报是纯文本，含玩家昵称，禁止走 innerHTML
  if (/回合|阵亡|结束|获胜/.test(entry.text)) d.classList.add('hl');
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  while (box.children.length > 300) box.removeChild(box.firstChild);
}
=======
function addLog(entry) {
  const box = $('#logList');
  const d = el('div');
  d.textContent = entry.text; // 战报是纯文本，含玩家昵称，禁止走 innerHTML
  if (/回合|阵亡|结束|获胜/.test(entry.text)) d.classList.add('hl');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight <= 24;
  d.classList.add('fx-log-in');
  d.addEventListener('animationend', () => d.classList.remove('fx-log-in'), { once: true });
  box.appendChild(d);
  while (box.children.length > 300) box.removeChild(box.firstChild);
  if (atBottom) box.scrollTop = box.scrollHeight;
}
>>>>>>> REPLACE

===FILE: client/style.css.append===
/* ========== 第二阶段：动效与交互反馈（fx-*） ========== */
/* 飞牌影子 */
.card.fx-fly{
  position:fixed;z-index:75;margin:0;pointer-events:none;transition:none;
  box-shadow:inset 0 0 0 3px #fbf7ec,inset 0 0 0 4px var(--brand-gold),0 0 18px rgba(216,180,106,.5),0 14px 28px rgba(0,0,0,.6);
}
.card.fx-fly:hover{transform:none}

/* 伤害 / 回复 / 护甲飘字 */
.fx-float{
  position:fixed;z-index:85;pointer-events:none;white-space:nowrap;
  font-weight:800;font-size:22px;line-height:1;letter-spacing:1px;font-variant-numeric:tabular-nums;
  transform:translate(-50%,-50%);text-shadow:0 2px 0 rgba(0,0,0,.6),0 0 10px rgba(0,0,0,.5);
  animation:fx-float 900ms var(--ease-out) both;
}
.fx-float.fx-dmg{color:#ff5a48}
.fx-float.fx-heal{color:#6fe39b}
.fx-float.fx-armor{color:var(--accent-blue-2);font-size:16px}
@keyframes fx-float{
  0%{opacity:0;transform:translate(-50%,-30%) scale(.7)}
  18%{opacity:1;transform:translate(-50%,-55%) scale(1.18)}
  35%{transform:translate(-50%,-70%) scale(1)}
  100%{opacity:0;transform:translate(-50%,-180%) scale(.95)}
}

/* 中央回合 / 阶段提示 */
.fx-banner{
  position:absolute;left:50%;top:50%;z-index:3;pointer-events:none;white-space:nowrap;
  padding:8px 26px;border-radius:var(--r-pill);font-size:var(--fs-lg);font-weight:700;letter-spacing:3px;color:var(--text);
  background:linear-gradient(180deg,rgba(30,37,50,.96),rgba(14,17,22,.96));
  border:1px solid var(--line-2);box-shadow:var(--sh3);
  transform:translate(-50%,-50%);animation:fx-banner 1.2s var(--ease-out) both;
}
.fx-banner.fx-mine{
  color:var(--gold-2);border-color:var(--brand-gold);
  box-shadow:0 0 0 1px rgba(216,180,106,.35),0 0 32px rgba(216,180,106,.35),var(--sh3);
}
@keyframes fx-banner{
  0%{opacity:0;transform:translate(-50%,-30%) scale(.92)}
  18%{opacity:1;transform:translate(-50%,-50%) scale(1)}
  78%{opacity:1;transform:translate(-50%,-50%) scale(1)}
  100%{opacity:0;transform:translate(-50%,-70%) scale(.98)}
}

/* 询问面板进出 */
#askPanel.fx-in{animation:ask-in var(--t-base) var(--ease-out)}
#askPanel.fx-out{animation:fx-ask-out 180ms var(--ease-out) forwards;pointer-events:none}
@keyframes fx-ask-out{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,10px)}}
@keyframes fx-ask-out-m{from{opacity:1;transform:none}to{opacity:0;transform:translateY(10px)}}
@media (max-width:760px){
  #askPanel.fx-in{animation-name:ask-in-m}
  #askPanel.fx-out{animation-name:fx-ask-out-m}
}

/* 计时条：transform 驱动 */
#askPanel .timer i{
  width:100%;transform:scaleX(var(--p,1));transform-origin:left center;will-change:transform;
  background:linear-gradient(90deg,var(--brand-gold),var(--warn));
  transition:transform 100ms linear,background-color var(--t-base);
}
#askPanel .timer.fx-warn i{background:var(--warn)}
#askPanel .timer.fx-danger i{background:var(--danger);animation:fx-timer-pulse .6s ease-in-out infinite}
@keyframes fx-timer-pulse{0%,100%{opacity:1}50%{opacity:.45}}

/* 战报新条目 */
#logList .fx-log-in{animation:fx-log-in 260ms var(--ease-out)}
@keyframes fx-log-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* 目标选择脉冲 */
.pcard.fx-pulse{animation:fx-pulse-card 420ms var(--ease-out)}
#selfInfo.fx-pulse{animation:fx-pulse-self 420ms var(--ease-out)}
@keyframes fx-pulse-card{
  0%{box-shadow:0 0 0 0 rgba(241,215,154,.9),var(--sh2)}
  60%{box-shadow:0 0 0 8px rgba(241,215,154,0),0 0 28px rgba(216,180,106,.55),var(--sh3)}
  100%{box-shadow:0 0 0 2px var(--brand-gold),var(--sh2)}
}
@keyframes fx-pulse-self{
  0%{box-shadow:inset 0 0 0 1px var(--brand-gold),0 0 0 0 rgba(241,215,154,.8)}
  100%{box-shadow:inset 0 0 0 1px var(--brand-gold),0 0 0 8px rgba(241,215,154,0)}
}

/* 减弱动效：飘字/横幅静态显示后由 JS 移除，其余时长归零 */
@media (prefers-reduced-motion:reduce){
  .fx-float,.fx-banner{animation:none!important}
  .fx-float{transform:translate(-50%,-90%)}
  .fx-banner{transform:translate(-50%,-50%)}
  #askPanel .timer i{transition:none}
  .card.fx-fly{display:none}
}

===FILE: client/index.html===
===NOCHANGE===