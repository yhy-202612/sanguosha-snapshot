**摘要**
- **D1 摸牌飞入**：新增 `fxDrawIn()`，在 `renderHand()` 末尾调用。它对比 `FX.lastHand` 找出新出现的牌，从 `#tableCenter` 克隆飞到最终位置。时长读 `--fx-t-fly`，多张牌按 `--fx-stagger` 错峰。
  - 飞行期间真牌用 `visibility:hidden` 隐藏，落地后再显示，避免与 opacity 过渡叠加造成闪烁。
  - 不飞的情况：首帧无历史、`prefers-reduced-motion`、一次超过 8 张、牌在手牌滚动区外。
  - 手牌渲染结构和 `data-cid` 都没动。
- **D2 勾玉与护甲**：在 `fxDiffHp` 的写入阶段调用 `fxHpDots()`，给对手卡的勾玉加一次性 class。
  - 失去：`::before` 缩小并淡出，`::after` 留一个红波纹。恢复：弹入。两者都只动 transform/opacity，宽高不变，不会挤动相邻勾玉。
  - 护甲任何变化都会让 `.armorbar` 的数值闪一次（只动 color/opacity）。为此把"护甲增加"也纳入了差分，但飘字逻辑不变，增加时不飘字。
  - 自己的信息栏是纯文本、没有勾玉节点，不处理。
- **D3 装备区**：在 `renderSelfEquips()` 中按槽位对比 `FX.lastEq`，DOM 结构不变。
  - 槽位新增或换装：金边闪光 + pop，时长 `--t-base`。
  - 装备被弃：在空槽上叠一个临时幽灵标签，淡出后移除。
- **D4 询问面板与技能面板**
  - 询问面板：每个新询问的选项按 `--fx-stagger` 错峰入场，hover 上抬 2px。剩余不足 3 秒时，用面板的 `::after` 内阴影做红色脉冲，与计时条危险色同色，不会出现两种颜色交替闪烁。
  - 技能面板：`openSkills`/`openOneSkills` 条目错峰淡入，技能条 hover 金色光晕。关闭时先淡出再真正 remove，显隐语义不变，减少动效模式下直接移除。
- **D5 房间座位**：`.seatcard` 首次渲染错峰入场（keyframe 不写结束 opacity，所以不覆盖 `.off` 的半透明）；准备状态切换时做一次轻微缩放。
- **D6 移动端（≤760px）**
  - `#handRow` 改为 `scroll-snap-type:x proximity`，两端加 mask 渐隐。
  - `#actionBar` 从空变为有按钮时自上滑入。
  - 按钮最小高度：已有规则是 42px，保持不变，已满足 ≥40px。
- **通用约定**
  - 新增工具函数 `fxOnce()`：一次性 class 在 `animationend` 时移除，同时用 `fxLater` 兜底。
  - `fxReset()` 补充清理：新增的临时 class、幽灵节点、正在淡出的弹窗，以及所有差分基线。
  - 所有新动效在 reduced-motion 下由 JS 跳过，CSS 也设为 `animation:none`。
  - 未改动任何 API、SSE、提交请求体或已有 id/class。

===PATCH: client/app.js===
<<<<<<< SEARCH
  const ap = document.getElementById('askPanel');
  if (ap && ap.classList.contains('fx-out')) { ap.classList.add('hidden'); ap.classList.remove('fx-out', 'fx-in'); }
  document.querySelectorAll('.fx-vignette').forEach(n => { n.className = 'fx-vignette'; });
  document.querySelectorAll('.fx-hit').forEach(n => n.classList.remove('fx-hit'));
  try { fxTiltClear(); } catch {}
}
=======
  const ap = document.getElementById('askPanel');
  if (ap && ap.classList.contains('fx-out')) { ap.classList.add('hidden'); ap.classList.remove('fx-out', 'fx-in'); }
  if (ap) ap.classList.remove('fx-ask-urgent');
  document.querySelectorAll('.fx-vignette').forEach(n => { n.className = 'fx-vignette'; });
  document.querySelectorAll('.fx-hit').forEach(n => n.classList.remove('fx-hit'));
  const FX_TMP = ['fx-draw-src', 'fx-hp-lose', 'fx-hp-gain', 'fx-armor-flash', 'fx-eq-in', 'fx-eq-out',
    'fx-opt-in', 'fx-bar-in', 'fx-seat-in', 'fx-seat-tap', 'fx-sk-in'];
  document.querySelectorAll(FX_TMP.map(c => '.' + c).join(',')).forEach(n => n.classList.remove(...FX_TMP));
  document.querySelectorAll('.fx-eq-ghost').forEach(n => n.remove());
  document.querySelectorAll('.modal-mask.fx-out').forEach(n => Element.prototype.remove.call(n));
  FX.lastHand = null; FX.lastEq = null; FX.seatReady = null; FX.askOptRef = null;
  try { fxTiltClear(); } catch {}
}
>>>>>>> REPLACE

<<<<<<< SEARCH
    if (ph === undefined) continue;
    if (hp === ph && !(pa !== undefined && ar < pa)) continue;
    jobs.push({ k, ph, pa, hp, ar, anchor: fxSeatNode(k) });
  }
  // 统一读布局后再统一写入，8 人座也只触发一次 layout
  for (const j of jobs) j.rect = j.anchor && j.anchor.isConnected ? j.anchor.getBoundingClientRect() : null;
  for (const { k, ph, pa, hp, ar, anchor, rect } of jobs) {
    const self = S.seat != null && k === S.seat;
=======
    if (ph === undefined) continue;
    if (hp === ph && (pa === undefined || ar === pa)) continue;
    jobs.push({ k, ph, pa, hp, ar, anchor: fxSeatNode(k) });
  }
  // 统一读布局后再统一写入，8 人座也只触发一次 layout
  for (const j of jobs) j.rect = j.anchor && j.anchor.isConnected ? j.anchor.getBoundingClientRect() : null;
  for (const { k, ph, pa, hp, ar, anchor, rect } of jobs) {
    const self = S.seat != null && k === S.seat;
    try { fxHpDots(anchor, ph, hp, pa, ar); } catch {}
>>>>>>> REPLACE

<<<<<<< SEARCH
  box.appendChild(el('span', 'equip-label', '装备'));
  for (const [slot, cn] of EQUIP_SLOTS) {
    const c = me.equips?.[slot];
    const chip = el('div', 'equip-chip' + (c ? '' : ' empty'),
      c ? `${esc(S.cards[c.name]?.cn || c.name)}${SUIT_CHAR[c.suit] || ''}${c.num ?? ''}` : `${cn} —`);
    if (c) bindCardTip(chip, () => c);
    box.appendChild(chip);
  }
=======
  box.appendChild(el('span', 'equip-label', '装备'));
  const fxPrevEq = FX.lastEq, fxNextEq = new Map();
  for (const [slot, cn] of EQUIP_SLOTS) {
    const c = me.equips?.[slot];
    const chip = el('div', 'equip-chip' + (c ? '' : ' empty'),
      c ? `${esc(S.cards[c.name]?.cn || c.name)}${SUIT_CHAR[c.suit] || ''}${c.num ?? ''}` : `${cn} —`);
    if (c) bindCardTip(chip, () => c);
    if (c) fxNextEq.set(slot, {
      key: String(c.id ?? `${c.name}|${c.suit}|${c.num}`),
      label: `${S.cards[c.name]?.cn || c.name}${SUIT_CHAR[c.suit] || ''}${c.num ?? ''}`,
    });
    if (fxPrevEq && !reduceMotion()) {
      const was = fxPrevEq.get(slot), now = fxNextEq.get(slot);
      if (now && (!was || was.key !== now.key)) fxOnce(chip, 'fx-eq-in', fxMs('--t-base', 200) + 60);
      else if (!now && was) fxEqGhost(chip, was.label);
    }
    box.appendChild(chip);
  }
  FX.lastEq = fxNextEq;
>>>>>>> REPLACE

<<<<<<< SEARCH
function openSkills() {
  const snap = S.snap;
  if (!snap?.players) return toast('对局还没开始');
  const { body } = modal('技能一览', '包含全部角色（含你自己）的武将技能与标记；标记数按当前状态实时显示');
  for (const p of snap.players) {
=======
function openSkills() {
  const snap = S.snap;
  if (!snap?.players) return toast('对局还没开始');
  const { mask, body } = modal('技能一览', '包含全部角色（含你自己）的武将技能与标记；标记数按当前状态实时显示');
  fxSkillModal(mask);
  for (const p of snap.players) {
>>>>>>> REPLACE

<<<<<<< SEARCH
  const box = $('#roomSeats');
  box.innerHTML = '';
  for (const s of room.seats) {
    const c = el('div', 'seatcard' + (s.online ? '' : ' off') + (s.ready ? ' ready' : ''));
    const ids = s.generalIds && s.generalIds.length ? s.generalIds : (s.generalId ? [s.generalId] : []);
    const gm = s.generalNames && s.generalNames.length ? s.generalNames.join(' + ') : (ids.length ? ids.map(generalNameOf).join(' + ') : (s.generalName || '待分配'));
    c.innerHTML = `<div class="n">${esc(s.name)}${s.isAI ? '（电脑）' : ''}${s.index === S.seat ? '（你）' : ''}${s.auto ? ` · 托管 ${s.autoSeconds || 15}s` : ''}</div>
      <div class="g">${esc(gm)}</div>
      ${(room.round || 0) > 0 && !s.isAI ? `<div class="rdy">${s.ready ? '✔ 已准备' : '… 未准备'}</div>` : ''}`;
    box.appendChild(c);
  }
=======
  const box = $('#roomSeats');
  box.innerHTML = '';
  const fxPrevRdy = FX.seatReady, fxNextRdy = new Map();
  let fxSi = 0;
  for (const s of room.seats) {
    const c = el('div', 'seatcard' + (s.online ? '' : ' off') + (s.ready ? ' ready' : ''));
    const ids = s.generalIds && s.generalIds.length ? s.generalIds : (s.generalId ? [s.generalId] : []);
    const gm = s.generalNames && s.generalNames.length ? s.generalNames.join(' + ') : (ids.length ? ids.map(generalNameOf).join(' + ') : (s.generalName || '待分配'));
    c.innerHTML = `<div class="n">${esc(s.name)}${s.isAI ? '（电脑）' : ''}${s.index === S.seat ? '（你）' : ''}${s.auto ? ` · 托管 ${s.autoSeconds || 15}s` : ''}</div>
      <div class="g">${esc(gm)}</div>
      ${(room.round || 0) > 0 && !s.isAI ? `<div class="rdy">${s.ready ? '✔ 已准备' : '… 未准备'}</div>` : ''}`;
    fxNextRdy.set(s.index, !!s.ready);
    if (!reduceMotion()) {
      if (!fxPrevRdy) {
        const k = Math.min(fxSi++, 8);
        c.style.setProperty('--fx-i', String(k));
        fxOnce(c, 'fx-seat-in', fxMs('--t-slow', 320) + k * fxMs('--fx-stagger', 40) + 80);
      } else if (fxPrevRdy.has(s.index) && fxPrevRdy.get(s.index) !== !!s.ready) {
        fxOnce(c, 'fx-seat-tap', fxMs('--t-slow', 320) + 80);
      }
    }
    box.appendChild(c);
  }
  FX.seatReady = fxNextRdy;
>>>>>>> REPLACE

<<<<<<< SEARCH
function openOneSkills(p) {
  const armorTxt = (p.armor || p.armorMax) ? ` · 护甲 ${p.armorMax > 0 ? `${p.armor}/${p.armorMax}` : p.armor}` : '';
  const { body } = modal(`${p.name} · ${p.generalName}`, `${p.hp}/${p.maxHp} 体力${armorTxt} · 手牌 ${p.handCount}${p.chained ? ' · 连环' : ''}`);
  for (const s of p.skills || []) {
    const item = el('div', 'skill-item');
=======
function openOneSkills(p) {
  const armorTxt = (p.armor || p.armorMax) ? ` · 护甲 ${p.armorMax > 0 ? `${p.armor}/${p.armorMax}` : p.armor}` : '';
  const { mask, body } = modal(`${p.name} · ${p.generalName}`, `${p.hp}/${p.maxHp} 体力${armorTxt} · 手牌 ${p.handCount}${p.chained ? ' · 连环' : ''}`);
  fxSkillModal(mask);
  for (const s of p.skills || []) {
    const item = el('div', 'skill-item');
>>>>>>> REPLACE

<<<<<<< SEARCH
    d.onclick = () => clickCard(c);
    bindCardTip(d, () => c);
    row.appendChild(d);
  }
  renderActions(me);
}
=======
    d.onclick = () => clickCard(c);
    bindCardTip(d, () => c);
    row.appendChild(d);
  }
  try { fxDrawIn(me); } catch {}
  renderActions(me);
}

// 一次性 class：animationend（仅自身）移除，fxLater 兜底
function fxOnce(node, cls, ms) {
  if (!node) return;
  node.classList.add(cls);
  const off = () => { node.classList.remove(cls); node.removeEventListener('animationend', onEnd); };
  const onEnd = (e) => { if (e.target === node) off(); };
  node.addEventListener('animationend', onEnd);
  fxLater(off, ms);
}

// D1：新进手牌从中央牌堆飞入
function fxDrawIn(me) {
  const ids = (me.hand || []).map(c => String(c.id));
  const prev = FX.lastHand;
  FX.lastHand = new Set(ids);
  if (!prev || reduceMotion()) return;
  const fresh = ids.filter(id => !prev.has(id));
  if (!fresh.length || fresh.length > 8) return;
  const from = document.getElementById('tableCenter');
  const row = document.getElementById('handRow');
  if (!from || !row || !from.isConnected) return;
  const fr = from.getBoundingClientRect(), rr = row.getBoundingClientRect();
  if (!fr.width || !rr.width) return;
  const cx = fr.left + fr.width / 2, cy = fr.top + fr.height / 2;
  const esc2 = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  const jobs = [];
  for (const id of fresh) {
    const n = row.querySelector(`.card[data-cid="${esc2(id)}"]`);
    if (!n) continue;
    const r = n.getBoundingClientRect();
    if (!r.width || r.right < rr.left || r.left > rr.right) continue;
    jobs.push({ n, r });
  }
  if (!jobs.length) return;
  const dur = fxMs('--fx-t-fly', 520), gap = fxMs('--fx-stagger', 40);
  const ease = fxVar('--ease-out', 'cubic-bezier(.2,.8,.2,1)');
  const frag = document.createDocumentFragment();
  const ghosts = jobs.map(({ n, r }) => {
    const g = n.cloneNode(true);
    g.classList.remove('sel', 'picked', 'disabled', 'fx-tilt');
    g.classList.add('fx-fly', 'fx-draw-ghost');
    g.removeAttribute('data-cid');
    g.setAttribute('aria-hidden', 'true');
    Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    n.classList.add('fx-draw-src');
    frag.appendChild(g);
    return { g, n, r };
  });
  document.body.appendChild(frag);
  ghosts.forEach(({ g, n, r }, i) => {
    const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    const done = () => { if (anim) FX.anims.delete(anim); g.remove(); n.classList.remove('fx-draw-src'); };
    let anim = null;
    try {
      anim = g.animate([
        { transform: `translate(${dx}px,${dy}px) scale(.6)`, opacity: 0 },
        { offset: 0.25, opacity: 1 },
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
      ], { duration: dur, delay: i * gap, easing: ease, fill: 'backwards' });
    } catch { done(); return; }
    FX.anims.add(anim);
    anim.onfinish = done;
    anim.oncancel = done;
  });
}

// D2：勾玉失去/恢复 + 护甲闪烁（仅对手座位卡有勾玉节点）
function fxHpDots(anchor, ph, hp, pa, ar) {
  if (reduceMotion() || !anchor || !anchor.isConnected || !anchor.classList.contains('pcard')) return;
  const dots = anchor.querySelectorAll('.hpbar .hpdot');
  const ms = fxMs('--fx-t-hit', 480) + 80;
  for (let i = Math.max(0, hp); i < Math.min(ph, dots.length); i++) {
    const d = dots[i];
    d.classList.add('fx-hp-lose');
    fxLater(() => d.classList.remove('fx-hp-lose'), ms);
  }
  for (let i = Math.max(0, ph); i < Math.min(hp, dots.length); i++) {
    fxOnce(dots[i], 'fx-hp-gain', fxMs('--t-slow', 320) + 80);
  }
  if (pa !== undefined && ar !== pa) {
    const a = anchor.querySelector('.armorbar');
    if (a) fxOnce(a, 'fx-armor-flash', fxMs('--t-slow', 320) + 80);
  }
}

// D3：装备被弃时在空槽上淡出旧名
function fxEqGhost(chip, label) {
  chip.classList.add('fx-eq-out');
  const g = document.createElement('span');
  g.className = 'fx-eq-ghost';
  g.textContent = label;
  g.setAttribute('aria-hidden', 'true');
  chip.appendChild(g);
  const off = () => { g.remove(); chip.classList.remove('fx-eq-out'); };
  g.addEventListener('animationend', off, { once: true });
  fxLater(off, fxMs('--t-slow', 320) + 80);
}

// D4：技能面板条目错峰淡入；关闭先淡出再移除
function fxSkillModal(mask) {
  if (!mask) return;
  mask.classList.add('fx-skm');
  const rm = Element.prototype.remove.bind(mask);
  mask.remove = () => {
    if (mask._fxOut) return;
    if (reduceMotion() || !mask.isConnected) { rm(); return; }
    mask._fxOut = 1;
    mask.classList.add('fx-out');
    mask.addEventListener('animationend', (e) => { if (e.target === mask && e.animationName === 'fx-fade-out') rm(); });
    fxLater(rm, fxMs('--t-base', 200) + 60);
  };
  if (reduceMotion()) return;
  queueMicrotask(() => {
    const body = mask.querySelector('.body');
    if (!body) return;
    const gap = fxMs('--fx-stagger', 40), base = fxMs('--t-slow', 320);
    [...body.children].forEach((n, i) => {
      const k = Math.min(i, 10);
      n.style.setProperty('--fx-i', String(k));
      fxOnce(n, 'fx-sk-in', base + k * gap + 80);
    });
  });
}
>>>>>>> REPLACE

<<<<<<< SEARCH
function renderActions(me) {
  const bar = $('#actionBar');
  bar.innerHTML = '';
  if (S.ask?.kind === 'play') {
    const card = S.sel.length === 1 ? (me.hand || []).find(c => c.id === S.sel[0]) : null;
=======
function renderActions(me) {
  const bar = $('#actionBar');
  const fxWasEmpty = !bar.children.length;
  bar.innerHTML = '';
  queueMicrotask(() => {
    if (fxWasEmpty && bar.children.length && !reduceMotion()) fxOnce(bar, 'fx-bar-in', fxMs('--t-base', 200) + 80);
  });
  if (S.ask?.kind === 'play') {
    const card = S.sel.length === 1 ? (me.hand || []).find(c => c.id === S.sel[0]) : null;
>>>>>>> REPLACE

<<<<<<< SEARCH
  box.appendChild(opts);

  const bar = el('div', 'timer');
  const i = el('i');
  bar.appendChild(i);
=======
  box.appendChild(opts);
  box.classList.remove('fx-ask-urgent');
  if (FX.askOptRef !== a && !reduceMotion()) {
    const gap = fxMs('--fx-stagger', 40), base = fxMs('--t-base', 200);
    [...opts.children].forEach((b, k) => {
      const j = Math.min(k, 8);
      b.style.setProperty('--fx-i', String(j));
      fxOnce(b, 'fx-opt-in', base + j * gap + 80);
    });
  }
  FX.askOptRef = a;

  const bar = el('div', 'timer');
  const i = el('i');
  bar.appendChild(i);
>>>>>>> REPLACE

<<<<<<< SEARCH
    bar.classList.toggle('fx-danger', p <= 0.15);
    if (left <= 0) clearInterval(S.timer);
  }, 100);
  syncAskOffset();
}
=======
    bar.classList.toggle('fx-danger', p <= 0.15);
    box.classList.toggle('fx-ask-urgent', left > 0 && left <= 3000);
    if (left <= 0) clearInterval(S.timer);
  }, 100);
  syncAskOffset();
}
>>>>>>> REPLACE

===FILE: client/style.css.append===
/* ===== 第二阶段 · 批次 D：动效完善 ===== */
/* D1 摸牌飞入 */
.fx-draw-ghost{position:fixed;margin:0;z-index:55;pointer-events:none;transition:none!important;will-change:transform,opacity}
.card.fx-draw-src{visibility:hidden}

/* D2 勾玉 / 护甲 */
.hpdot.fx-hp-lose,.hpdot.fx-hp-gain{position:relative}
.hpdot.fx-hp-lose::before,.hpdot.fx-hp-lose::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none}
.hpdot.fx-hp-lose::before{
  background:radial-gradient(circle at 34% 30%,#ffd2c8 0 14%,#ff5a48 32%,#b8231c 72%,#6d100c);
  animation:fx-hp-out var(--t-slow) var(--ease-out) forwards;
}
.hpdot.fx-hp-lose::after{box-shadow:0 0 0 2px rgba(226,69,59,.75);animation:fx-hp-ring var(--fx-t-hit) var(--ease-out) forwards}
.hpdot.fx-hp-gain{animation:fx-hp-in var(--t-slow) var(--ease-spring) backwards}
.armorbar.fx-armor-flash{animation:fx-armor-flash var(--t-slow) var(--ease-out)}
@keyframes fx-hp-out{from{transform:scale(1);opacity:1}to{transform:scale(.2);opacity:0}}
@keyframes fx-hp-ring{from{transform:scale(.8);opacity:.9}to{transform:scale(2.4);opacity:0}}
@keyframes fx-hp-in{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes fx-armor-flash{0%,100%{color:var(--accent-blue-2);opacity:1}40%{color:#ffffff;opacity:.6}}

/* D3 装备区 */
.equip-chip.fx-eq-in{animation:fx-eq-pop var(--t-base) var(--ease-spring)}
@keyframes fx-eq-pop{
  0%{transform:scale(.72);box-shadow:inset 0 1px 0 rgba(255,230,170,.12),0 0 0 2px var(--gold-2),0 0 16px rgba(216,180,106,.8)}
  100%{transform:none;box-shadow:inset 0 1px 0 rgba(255,230,170,.12),0 0 0 0 transparent,0 0 0 rgba(216,180,106,0)}
}
.equip-chip.fx-eq-out{position:relative}
.fx-eq-ghost{
  position:absolute;inset:-1px;display:flex;align-items:center;justify-content:center;border-radius:inherit;pointer-events:none;
  white-space:nowrap;font-size:inherit;color:#eadcb4;background:linear-gradient(180deg,#352c19,#241e11);border:1px solid #6b5a33;
  animation:fx-eq-fade var(--t-slow) var(--ease-out) forwards;
}
@keyframes fx-eq-fade{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-3px)}}

/* D4 询问面板 */
#askPanel .opts button.fx-opt-in{animation:fx-opt-in var(--t-base) var(--ease-out) backwards;animation-delay:calc(var(--fx-i,0) * var(--fx-stagger))}
@keyframes fx-opt-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
#askPanel .opts button:not(:disabled):hover{transform:translateY(-2px)}
#askPanel.fx-ask-urgent::after{
  content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  box-shadow:inset 0 0 0 1px var(--danger),inset 0 0 16px rgba(226,69,59,.35);
  animation:fx-urgent 1s ease-in-out infinite;
}
@keyframes fx-urgent{0%,100%{opacity:.25}50%{opacity:1}}

/* D4 技能面板 */
.fx-skm .fx-sk-in{animation:fx-sk-in var(--t-slow) var(--ease-out) backwards;animation-delay:calc(var(--fx-i,0) * var(--fx-stagger))}
@keyframes fx-sk-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.fx-skm .skill-item{border-radius:var(--r1);transition:box-shadow var(--t-fast),background-color var(--t-fast)}
.fx-skm .skill-item:hover{background-color:rgba(216,180,106,.06);box-shadow:0 0 0 1px rgba(216,180,106,.55),0 0 12px rgba(216,180,106,.25)}
.modal-mask.fx-skm.fx-out{pointer-events:none;animation:fx-fade-out var(--t-base) var(--ease-out) forwards}
@keyframes fx-fade-out{from{opacity:1}to{opacity:0}}

/* D5 房间座位（入场不写结束 opacity，保留 .off 的半透明） */
.seatcard.fx-seat-in{animation:fx-seat-in var(--t-slow) var(--ease-out) backwards;animation-delay:calc(var(--fx-i,0) * var(--fx-stagger))}
@keyframes fx-seat-in{from{opacity:0;transform:translateY(8px)}to{transform:none}}
.seatcard.fx-seat-tap{animation:fx-seat-tap var(--t-slow) var(--ease-spring)}
@keyframes fx-seat-tap{0%,100%{transform:none}40%{transform:scale(1.04)}}

/* D6 移动端 */
@keyframes fx-bar-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media (max-width:760px){
  #handRow{
    scroll-snap-type:x proximity;
    -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 12px,#000 calc(100% - 12px),transparent 100%);
    mask-image:linear-gradient(90deg,transparent 0,#000 12px,#000 calc(100% - 12px),transparent 100%);
  }
  #actionBar button{min-height:42px}
  #actionBar.fx-bar-in{animation:fx-bar-in var(--t-base) var(--ease-out)}
}

@media (prefers-reduced-motion:reduce){
  .hpdot.fx-hp-lose::before,.hpdot.fx-hp-lose::after,.hpdot.fx-hp-gain,.armorbar.fx-armor-flash,
  .equip-chip.fx-eq-in,.fx-eq-ghost,#askPanel .opts button.fx-opt-in,.fx-skm .fx-sk-in,
  .modal-mask.fx-skm.fx-out,.seatcard.fx-seat-in,.seatcard.fx-seat-tap,#actionBar.fx-bar-in{animation:none!important}
  .hpdot.fx-hp-lose::before,.hpdot.fx-hp-lose::after,.fx-eq-ghost{display:none}
  #askPanel.fx-ask-urgent::after{animation:none!important;opacity:.8}
  #askPanel .opts button:not(:disabled):hover{transform:none}
}

===FILE: client/index.html===
===NOCHANGE===