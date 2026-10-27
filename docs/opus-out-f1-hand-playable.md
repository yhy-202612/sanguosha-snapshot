**摘要（改动落点）**
- **F1** `renderHand()`：清空前先记录旧位置到 `row._fxOld`。用 `fxHandPlay()` 判断是否处于「我的出牌阶段 + `S.ask.kind==='play'`」：
  - 是：命中 `allowedCardIds()` 的牌加 `fx-playable`，未命中的加 `fx-mute`。返回 `null` 视为不限制，全部可出。
  - 有选中牌时，`#handRow` 加 `fx-has-sel`，未选中的牌缩到 `scale(.975)`。
  - 每次渲染都重建节点并 toggle 行 class，离开出牌阶段即全部撤销，不会残留。
- **F2**
  - `fxFlyCards()`：克隆体移除 `fx-playable/fx-mute`，追加 `fx-fly-trail`（box-shadow 光尾，alpha .35→0，200ms）。
  - `renderHand()` 尾部调用 `fxFlipPlay()`：仅在出现新牌（摸牌）时触发，且只处理新旧 id 交集。用 WAAPI `composite:'add'` 做位移补齐，与 `.sel` 抬升叠加不跳变。
  - 判定翻开：片段里没有 `fxJudge`，改在判定区新增判定牌时做 `rotateY` 翻开（`renderSelfEquips` 与 `playerCard`），不使用 `transform-style`。
- **F3**
  - `fxDiffHp()`：调用 `fxNumPop()`，经 `fxLater(--fx-t-num-gap)` 延后 60ms 执行，与飘字错开。自己弹 `.fx-hpnum` / `.fx-arnum`，对手弹 `.hpbar`。
  - 为此在 `renderTable()` 的体力数字外包一层 `.fx-hpnum`，`armorText()` 的 `<b>` 加 class `fx-arnum`。
  - `fxMarkPulse()`：按座位记录标记值，`renderSelfEquips` 与 `playerCard` 中变化的 chip 脉冲。
  - 对手装备新增时加 `fx-eq-drop`（-8px / .92 → 正常，180ms）。自己的装备区沿用既有 `fx-eq-in`，不重做。
- **F4**
  - `renderPackPicker.paint()`：用 `pointerdown` 记录点按的包 id，`addEventListener('click')` 追加回弹，不碰原 `onclick`。原 `onclick` 会重绘 chip，因此在新 chip 上回放。
  - `.seatcard.fx-seat-in`（JS 既有）在 CSS 中改为从下方 10px 淡入、40ms 错峰、上限 8 个。
  - `switchView()`：`#room` 由隐藏变为可见时，`.room-panel` 加 `fx-room-in`。
- **F5**
  - 新时长统一定义为 `--fx-t-*`（含 `--fx-ease-out`）。
  - 所有 class 动画都经 `fxOnce`（`animationend` 移除，`fxLater` 兜底）。
  - `fxReset()` 的临时 class 表补上新 class，并清空新增的基线表。
  - reduce-motion 下只保留静态最终态，不播动画；JS 侧各入口均检查 `reduceMotion()`。
- **依赖说明**：新增 helper 集中在 `fxOnce` 之后那个补丁里。其余补丁在文本上可以单独应用，但运行时依赖该补丁。

===PATCH: client/app.js===
<<<<<<< SEARCH
      const c = el('div', 'chip' + (on ? ' on' : ''), `${p.name}(${p.count})`);
      c.dataset.pack = p.id;
      c.title = `包 id：${p.id}`;
      c.onclick = () => {
        if (selected.has(p.id)) {
          if (selected.size <= 1) return toast('至少选择一个武将包');
          selected.delete(p.id);
        } else selected.add(p.id);
        paint();
        if (onChange) onChange();
      };
      chips.appendChild(c);
    }
=======
      const c = el('div', 'chip' + (on ? ' on' : ''), `${p.name}(${p.count})`);
      c.dataset.pack = p.id;
      c.title = `包 id：${p.id}`;
      c.onclick = () => {
        if (selected.has(p.id)) {
          if (selected.size <= 1) return toast('至少选择一个武将包');
          selected.delete(p.id);
        } else selected.add(p.id);
        paint();
        if (onChange) onChange();
      };
      // F4 点按回弹：不改原 onclick；重绘后在新 chip 上回放，未重绘则在原 chip 上回放
      c.addEventListener('pointerdown', () => { st.fxTapId = p.id; });
      c.addEventListener('click', () => { if (c.isConnected && st.fxTapId === p.id) { st.fxTapId = null; try { fxReplay(c, 'fx-chip-tap', '--fx-t-chip', 120); } catch {} } });
      if (st.fxTapId === p.id) { st.fxTapId = null; try { fxReplay(c, 'fx-chip-tap', '--fx-t-chip', 120); } catch {} }
      chips.appendChild(c);
    }
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
  const FX_TMP = ['fx-draw-src', 'fx-hp-lose', 'fx-hp-gain', 'fx-armor-flash', 'fx-eq-in', 'fx-eq-out',
    'fx-opt-in', 'fx-bar-in', 'fx-seat-in', 'fx-seat-tap', 'fx-sk-in',
    'fx-ask-tick', 'fx-sweep-tail', 'fx-res-item', 'fx-res-glow', 'fx-sfx-tap', 'fx-drag-nb-l', 'fx-drag-nb-r'];
  document.querySelectorAll(FX_TMP.map(c => '.' + c).join(',')).forEach(n => n.classList.remove(...FX_TMP));
  document.querySelectorAll('.fx-eq-ghost,.fx-drag-ghost').forEach(n => n.remove());
  document.querySelectorAll('.modal-mask.fx-out').forEach(n => Element.prototype.remove.call(n));
  FX.tickOn = false; FX.tickT = null; FX.tickN = 0;
  FX.lastHand = null; FX.lastEq = null; FX.seatReady = null; FX.askOptRef = null;
=======
  const FX_TMP = ['fx-draw-src', 'fx-hp-lose', 'fx-hp-gain', 'fx-armor-flash', 'fx-eq-in', 'fx-eq-out',
    'fx-opt-in', 'fx-bar-in', 'fx-seat-in', 'fx-seat-tap', 'fx-sk-in',
    'fx-ask-tick', 'fx-sweep-tail', 'fx-res-item', 'fx-res-glow', 'fx-sfx-tap', 'fx-drag-nb-l', 'fx-drag-nb-r',
    'fx-playable', 'fx-mute', 'fx-has-sel', 'fx-num-pop', 'fx-mark-pulse', 'fx-eq-drop', 'fx-judge-flip',
    'fx-chip-tap', 'fx-room-in', 'fx-fly-trail'];
  document.querySelectorAll(FX_TMP.map(c => '.' + c).join(',')).forEach(n => n.classList.remove(...FX_TMP));
  document.querySelectorAll('.fx-eq-ghost,.fx-drag-ghost').forEach(n => n.remove());
  document.querySelectorAll('.modal-mask.fx-out').forEach(n => Element.prototype.remove.call(n));
  FX.tickOn = false; FX.tickT = null; FX.tickN = 0;
  FX.lastHand = null; FX.lastEq = null; FX.seatReady = null; FX.askOptRef = null;
  FX.lastMarks = null; FX.lastPEq = null; FX.lastJudge = null;
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
  const ghosts = jobs.map(({ src, r, i }) => {
    const g = src.cloneNode(true);
    g.classList.remove('sel', 'picked', 'disabled', 'fx-tilt');
    g.classList.add('fx-fly');
    g.removeAttribute('data-cid');
=======
  const ghosts = jobs.map(({ src, r, i }) => {
    const g = src.cloneNode(true);
    g.classList.remove('sel', 'picked', 'disabled', 'fx-tilt', 'fx-playable', 'fx-mute');
    g.classList.add('fx-fly', 'fx-fly-trail');
    g.removeAttribute('data-cid');
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
  for (const { k, ph, pa, hp, ar, anchor, rect } of jobs) {
    const self = S.seat != null && k === S.seat;
    try { fxHpDots(anchor, ph, hp, pa, ar); } catch {}
    if (pa !== undefined && ar < pa) fxFloat(anchor, k, `-${pa - ar} 护甲`, 'armor', rect);
    if (hp < ph) {
=======
  for (const { k, ph, pa, hp, ar, anchor, rect } of jobs) {
    const self = S.seat != null && k === S.seat;
    try { fxHpDots(anchor, ph, hp, pa, ar); } catch {}
    try { fxNumPop(k, self, hp !== ph, pa !== undefined && ar !== pa); } catch {}
    if (pa !== undefined && ar < pa) fxFloat(anchor, k, `-${pa - ar} 护甲`, 'armor', rect);
    if (hp < ph) {
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
function armorText(p, withLabel = true) {
  const cur = Number(p.armor || 0);
  const max = Number(p.armorMax || 0);
  if (!(cur > 0 || max > 0)) return '';
  const v = max > 0 ? `${cur}/${max}` : `${cur}`;
  return ` · <b style="color:#8fc7ff">${v}</b>${withLabel ? ' 护甲' : ''}`;
}
=======
function armorText(p, withLabel = true) {
  const cur = Number(p.armor || 0);
  const max = Number(p.armorMax || 0);
  if (!(cur > 0 || max > 0)) return '';
  const v = max > 0 ? `${cur}/${max}` : `${cur}`;
  return ` · <b class="fx-arnum" style="color:#8fc7ff">${v}</b>${withLabel ? ' 护甲' : ''}`;
}
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
    si.innerHTML = `${myRole}你将 <b>${esc(me.generalName)}</b> · ${me.hp}/${me.maxHp} 体力${armorText(me)}${me.moulue ? ` · <b style="color:#7dd3a8">${me.moulue}/${me.moulueMax || 5}</b> 谋略` : ''}${me.gong ? ` · <b style="color:#d8b46a">${me.gong}</b> 工` : ''}${me.extraZone && me.extraZone.tianji ? ` · <b style="color:#c084fc">${me.extraZone.tianji}</b> 天机` : ''}${me.extraZone && me.extraZone.mou ? ` · <b style="color:#f472b6">${me.extraZone.mou}</b> 谋` : ''} · 手牌 ${me.handCount} · ${snap.currentIndex === me.seat ? '<b style="color:#d8b46a">你的回合</b>' : '等待中'}${me.chained ? ' · 连环' : ''}${autoTxt}`
      + (canSelf ? ' · <b style="color:#d8b46a">点此选自己</b>' : '');
    si.classList.toggle('targetable', canSelf);
    si.classList.toggle('picked', canSelf && S.targets.includes(me.seat));
    si.onclick = canSelf ? (() => toggleTarget(me.seat)) : null;
=======
    si.innerHTML = `${myRole}你将 <b>${esc(me.generalName)}</b> · <span class="fx-hpnum">${me.hp}/${me.maxHp}</span> 体力${armorText(me)}${me.moulue ? ` · <b style="color:#7dd3a8">${me.moulue}/${me.moulueMax || 5}</b> 谋略` : ''}${me.gong ? ` · <b style="color:#d8b46a">${me.gong}</b> 工` : ''}${me.extraZone && me.extraZone.tianji ? ` · <b style="color:#c084fc">${me.extraZone.tianji}</b> 天机` : ''}${me.extraZone && me.extraZone.mou ? ` · <b style="color:#f472b6">${me.extraZone.mou}</b> 谋` : ''} · 手牌 ${me.handCount} · ${snap.currentIndex === me.seat ? '<b style="color:#d8b46a">你的回合</b>' : '等待中'}${me.chained ? ' · 连环' : ''}${autoTxt}`
      + (canSelf ? ' · <b style="color:#d8b46a">点此选自己</b>' : '');
    si.classList.toggle('targetable', canSelf);
    si.classList.toggle('picked', canSelf && S.targets.includes(me.seat));
    si.onclick = canSelf ? (() => toggleTarget(me.seat)) : null;
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
  const judge = me.judgeZone || [];
  if (judge.length) {
    box.appendChild(el('span', 'equip-label', '判定'));
    for (const z of judge) {
      const chip = el('div', 'equip-chip judge-chip', esc(S.cards[z.name]?.cn || z.name));
      bindCardTip(chip, () => z);
      box.appendChild(chip);
    }
  }
=======
  const judge = me.judgeZone || [];
  const fxJk = (z) => String(z.id ?? `${z.name}|${z.suit}|${z.num}`);
  let fxJNew = new Set();
  try { fxJNew = fxNewKeys('lastJudge', me.seat, judge.map(fxJk)); } catch {}
  if (judge.length) {
    box.appendChild(el('span', 'equip-label', '判定'));
    for (const z of judge) {
      const chip = el('div', 'equip-chip judge-chip', esc(S.cards[z.name]?.cn || z.name));
      bindCardTip(chip, () => z);
      box.appendChild(chip);
      if (fxJNew.has(fxJk(z))) { try { fxReplay(chip, 'fx-judge-flip', '--fx-t-judge', 260); } catch {} }
    }
  }
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
  // 谋略值（上限 5）：有谋略值时视为拥有【妙计】，出牌阶段会多出一个「发动【妙计】」按钮
  if (me.moulue) marks.push(['谋略值', `${me.moulue}/${me.moulueMax || 5}`]);
  for (const [k, v] of marks) {
    box.appendChild(el('span', 'mark-tag', `${esc(k)}${v ? ' ' + esc(v) : ''}`));
  }
}
=======
  // 谋略值（上限 5）：有谋略值时视为拥有【妙计】，出牌阶段会多出一个「发动【妙计】」按钮
  if (me.moulue) marks.push(['谋略值', `${me.moulue}/${me.moulueMax || 5}`]);
  for (const [k, v] of marks) {
    box.appendChild(el('span', 'mark-tag', `${esc(k)}${v ? ' ' + esc(v) : ''}`));
  }
  try { fxMarkPulse(me.seat, box); } catch {}
}
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
  for (const [slot, cn] of EQUIP_SLOTS) {
    const card = p.equips?.[slot];
    if (!card) continue;
    anyEq = true;
    const chip = el('span', 'equip-chip', `${esc(S.cards[card.name]?.cn || card.name)}${SUIT_CHAR[card.suit] || ''}${card.num ?? ''}`);
    bindCardTip(chip, () => card);
    eqRow.appendChild(chip);
  }
  for (const z of p.judgeZone || []) {
    anyEq = true;
    const chip = el('span', 'equip-chip judge-chip', `判·${esc(S.cards[z.name]?.cn || z.name)}`);
    bindCardTip(chip, () => z);
    eqRow.appendChild(chip);
  }
  if (!anyEq) eqRow.remove();
  if (markTags.length) {
    const mr = el('div', 'mark-row');
    mr.innerHTML = markTags.join('');
    c.appendChild(mr);
  }
=======
  const fxEk = (slot, x) => `${slot}|${x.id ?? `${x.name}|${x.suit}|${x.num}`}`;
  const fxJk = (z) => String(z.id ?? `${z.name}|${z.suit}|${z.num}`);
  let fxENew = new Set(), fxJNew = new Set();
  try {
    fxENew = fxNewKeys('lastPEq', p.seat, EQUIP_SLOTS.filter(([s]) => p.equips?.[s]).map(([s]) => fxEk(s, p.equips[s])));
    fxJNew = fxNewKeys('lastJudge', p.seat, (p.judgeZone || []).map(fxJk));
  } catch {}
  for (const [slot, cn] of EQUIP_SLOTS) {
    const card = p.equips?.[slot];
    if (!card) continue;
    anyEq = true;
    const chip = el('span', 'equip-chip', `${esc(S.cards[card.name]?.cn || card.name)}${SUIT_CHAR[card.suit] || ''}${card.num ?? ''}`);
    bindCardTip(chip, () => card);
    eqRow.appendChild(chip);
    if (fxENew.has(fxEk(slot, card))) { try { fxReplay(chip, 'fx-eq-drop', '--fx-t-eq', 180); } catch {} }
  }
  for (const z of p.judgeZone || []) {
    anyEq = true;
    const chip = el('span', 'equip-chip judge-chip', `判·${esc(S.cards[z.name]?.cn || z.name)}`);
    bindCardTip(chip, () => z);
    eqRow.appendChild(chip);
    if (fxJNew.has(fxJk(z))) { try { fxReplay(chip, 'fx-judge-flip', '--fx-t-judge', 260); } catch {} }
  }
  if (!anyEq) eqRow.remove();
  let fxMr = null;
  if (markTags.length) {
    const mr = el('div', 'mark-row');
    mr.innerHTML = markTags.join('');
    c.appendChild(mr);
    fxMr = mr;
  }
  try { fxMarkPulse(p.seat, fxMr); } catch {}
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
function renderHand(me) {
  const row = $('#handRow');
  try { fxTiltClear(); fxBindTilt(row); fxBindDrag(row); } catch {}
  row.innerHTML = '';
  const handN = (me.hand || []).length;
  row.style.setProperty('--n', String(handN));
  row.classList.toggle('fx-overlap', handN >= 6);
  row.classList.toggle('fx-scroll', handN > 10);
  const allowed = allowedCardIds();
=======
function renderHand(me) {
  const row = $('#handRow');
  try { fxTiltClear(); fxBindTilt(row); fxBindDrag(row); } catch {}
  try { row._fxOld = fxFlipRead(row); } catch { row._fxOld = null; }
  row.innerHTML = '';
  const handN = (me.hand || []).length;
  row.style.setProperty('--n', String(handN));
  row.classList.toggle('fx-overlap', handN >= 6);
  row.classList.toggle('fx-scroll', handN > 10);
  const allowed = allowedCardIds();
  let fxPlay = false;
  try { fxPlay = fxHandPlay(); } catch {}
  row.classList.toggle('fx-has-sel', fxPlay && S.sel.length > 0);
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
    if (isMou) d.classList.add('z-mou');
    d.dataset.cid = String(c.id);
    if (allowed && !allowed.includes(c.id)) d.classList.add('disabled');
    if (S.sel.includes(c.id)) d.classList.add('sel');
    const red = c.suit === 'heart' || c.suit === 'diamond';
=======
    if (isMou) d.classList.add('z-mou');
    d.dataset.cid = String(c.id);
    if (allowed && !allowed.includes(c.id)) d.classList.add('disabled');
    if (S.sel.includes(c.id)) d.classList.add('sel');
    if (row.classList.contains('fx-has-sel') || (S.ask?.kind === 'play' && S.snap && S.seat != null && S.snap.currentIndex === S.seat)) {
      d.classList.add(!allowed || allowed.includes(c.id) ? 'fx-playable' : 'fx-mute');
    }
    const red = c.suit === 'heart' || c.suit === 'diamond';
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
    d.onclick = () => clickCard(c);
    bindCardTip(d, () => c);
    row.appendChild(d);
  }
  try { fxDrawIn(me); } catch {}
  renderActions(me);
}
=======
    d.onclick = () => clickCard(c);
    bindCardTip(d, () => c);
    row.appendChild(d);
  }
  try { fxFlipPlay(row, row._fxOld, me); } catch {}
  row._fxOld = null;
  try { fxDrawIn(me); } catch {}
  renderActions(me);
}
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
function fxOnce(node, cls, ms) {
  if (!node) return;
  node.classList.add(cls);
  const off = () => { node.classList.remove(cls); node.removeEventListener('animationend', onEnd); };
  const onEnd = (e) => { if (e.target === node) off(); };
  node.addEventListener('animationend', onEnd);
  fxLater(off, ms);
}
=======
function fxOnce(node, cls, ms) {
  if (!node) return;
  node.classList.add(cls);
  const off = () => { node.classList.remove(cls); node.removeEventListener('animationend', onEnd); };
  const onEnd = (e) => { if (e.target === node) off(); };
  node.addEventListener('animationend', onEnd);
  fxLater(off, ms);
}

// ===== 动效第四批 helper =====
function fxReplay(node, cls, varName, fb) {
  if (!node || reduceMotion()) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  fxOnce(node, cls, fxMs(varName, fb) + 60);
}

// 我的出牌阶段 + play 类询问
function fxHandPlay() {
  return S.ask?.kind === 'play' && !!S.snap && S.seat != null && S.snap.currentIndex === S.seat;
}

function fxFlipRead(row) {
  if (!row || !FX.lastHand || reduceMotion() || document.body.classList.contains('fx-dragging')) return null;
  const m = new Map();
  row.querySelectorAll('.card').forEach(n => { const r = n.getBoundingClientRect(); if (r.width) m.set(n.dataset.cid, r); });
  return m.size ? m : null;
}

// 仅在摸牌（出现新 id）时，对新旧 id 交集做 FLIP；composite:add 叠加在 .sel 等 CSS transform 之上
function fxFlipPlay(row, old, me) {
  const prev = FX.lastHand;
  if (!old || !prev || reduceMotion()) return;
  const ids = (me.hand || []).map(c => String(c.id));
  if (!ids.some(id => !prev.has(id))) return;
  const jobs = [];
  row.querySelectorAll('.card').forEach(n => {
    const o = old.get(n.dataset.cid);
    if (!o || !prev.has(n.dataset.cid)) return;
    const r = n.getBoundingClientRect();
    const dx = o.left - r.left, dy = o.top - r.top;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) jobs.push({ n, dx, dy });
  });
  const dur = fxMs('--fx-t-flip', 140), ease = fxVar('--fx-ease-out', 'cubic-bezier(.2,.8,.2,1)');
  for (const { n, dx, dy } of jobs) {
    let a = null;
    try {
      a = n.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }],
        { duration: dur, easing: ease, composite: 'add' });
    } catch { continue; }
    FX.anims.add(a);
    a.onfinish = a.oncancel = () => FX.anims.delete(a);
  }
}

// 勾玉/护甲数字快跳：与 fxDiffHp 飘字错开
function fxNumPop(seat, self, hpCh, arCh) {
  if (reduceMotion() || (!hpCh && !arCh)) return;
  fxLater(() => {
    const a = fxSeatNode(seat);
    if (!a || !a.isConnected) return;
    const ns = self
      ? [hpCh && a.querySelector('.fx-hpnum'), arCh && a.querySelector('.fx-arnum')]
      : [hpCh && a.querySelector('.hpbar')];
    for (const n of ns) if (n) fxReplay(n, 'fx-num-pop', '--fx-t-num', 160);
  }, fxMs('--fx-t-num-gap', 60));
}

// 记录 seat 的 key 集合，返回新增 key（首次只记基线）
function fxNewKeys(name, seat, keys) {
  if (!FX[name]) FX[name] = new Map();
  const prev = FX[name].get(seat);
  FX[name].set(seat, new Set(keys));
  if (!prev || reduceMotion()) return new Set();
  return new Set(keys.filter(k => !prev.has(k)));
}

function fxMarkPulse(seat, box) {
  if (!FX.lastMarks) FX.lastMarks = new Map();
  const prev = FX.lastMarks.get(seat), cur = new Map();
  const nodes = box ? [...box.querySelectorAll('.mark-tag')] : [];
  for (const n of nodes) {
    const t = n.textContent.trim(), i = t.indexOf(' ');
    const label = i < 0 ? t : t.slice(0, i), val = i < 0 ? '' : t.slice(i + 1);
    cur.set(label, val);
    if (prev && prev.get(label) !== val) fxReplay(n, 'fx-mark-pulse', '--fx-t-mark', 240);
  }
  FX.lastMarks.set(seat, cur);
}

function fxRoomIn() {
  const p = document.querySelector('#room .room-panel');
  if (p) fxReplay(p, 'fx-room-in', '--fx-t-room', 220);
}
>>>>>>> REPLACE

===PATCH: client/app.js===
<<<<<<< SEARCH
function switchView(v) {
  S.view = v;
  if (v !== 'table') { fxReset(); clearInterval(S.timer); }
  for (const id of ['lobby', 'room', 'table']) {
    $('#' + id).classList.toggle('hidden', id !== v);
  }
=======
function switchView(v) {
  S.view = v;
  if (v !== 'table') { fxReset(); clearInterval(S.timer); }
  const fxRoomHid = $('#room').classList.contains('hidden');
  for (const id of ['lobby', 'room', 'table']) {
    $('#' + id).classList.toggle('hidden', id !== v);
  }
  if (v === 'room' && fxRoomHid) { try { fxRoomIn(); } catch {} }
>>>>>>> REPLACE

===FILE: client/style.css.append===
/* ===== 动效第四批：变量 ===== */
:root{
  --fx-t-num:160ms;--fx-t-num-gap:60ms;--fx-t-flip:140ms;--fx-t-trail:200ms;--fx-t-judge:260ms;
  --fx-t-eq:180ms;--fx-t-mark:240ms;--fx-t-chip:120ms;--fx-t-seat:220ms;--fx-t-room:220ms;
  --fx-ease-out:cubic-bezier(.2,.8,.2,1);--fx-lift:2px;
}

/* F1 可出性 */
body:not(.fx-dragging) #handRow .card.fx-playable:not(.sel):not(:hover){
  transform:translateY(calc(var(--fx-lift) * -1));
  box-shadow:inset 0 0 0 3px #fbf7ec,inset 0 0 0 4px rgba(216,180,106,.6),0 0 0 1px rgba(241,215,154,.5),0 0 12px rgba(216,180,106,.28),0 6px 14px rgba(0,0,0,.35);
}
#handRow .card.fx-mute{opacity:.55}
body:not(.fx-dragging) #handRow .card.fx-mute:not(:hover){transform:translateY(1px)}
body:not(.fx-dragging) #handRow.fx-has-sel .card:not(.sel):not(:hover){transform:scale(.975)}

/* F2 飞牌拖尾 / 判定翻开 */
.fx-fly.fx-fly-trail{animation:fx-fly-trail var(--fx-t-trail) var(--fx-ease-out) forwards}
@keyframes fx-fly-trail{
  from{box-shadow:0 0 18px 6px rgba(241,215,154,.35),0 16px 30px rgba(0,0,0,.35)}
  to{box-shadow:0 0 18px 6px rgba(241,215,154,0),0 16px 30px rgba(0,0,0,0)}
}
.equip-chip.fx-judge-flip{display:inline-block;backface-visibility:hidden;animation:fx-judge-flip var(--fx-t-judge) var(--fx-ease-out)}
@keyframes fx-judge-flip{from{transform:perspective(400px) rotateY(90deg);opacity:.4}to{transform:perspective(400px) rotateY(0);opacity:1}}

/* F3 状态可读性 */
.fx-hpnum,.fx-arnum{display:inline-block}
.fx-num-pop{animation:fx-num-pop var(--fx-t-num) var(--fx-ease-out)}
@keyframes fx-num-pop{0%{transform:translateY(-2px) scale(1.25)}100%{transform:none}}
.mark-tag.fx-mark-pulse{animation:fx-mark-pulse var(--fx-t-mark) var(--fx-ease-out)}
@keyframes fx-mark-pulse{
  0%{transform:scale(1.15);box-shadow:0 0 0 2px rgba(143,208,255,.55),0 0 10px rgba(143,208,255,.4)}
  100%{transform:none;box-shadow:0 0 0 0 rgba(143,208,255,0)}
}
.pcard .equip-chip.fx-eq-drop{display:inline-block;animation:fx-eq-drop var(--fx-t-eq) var(--fx-ease-out) backwards}
@keyframes fx-eq-drop{from{opacity:0;transform:translateY(-8px) scale(.92)}to{opacity:1;transform:none}}

/* F4 大厅与房间 */
.chip.fx-chip-tap{animation:fx-chip-tap var(--fx-t-chip) var(--fx-ease-out)}
@keyframes fx-chip-tap{from{transform:scale(.94)}to{transform:scale(1)}}
#roomSeats .seatcard.fx-seat-in{
  animation:fx-seat-rise var(--fx-t-seat) var(--fx-ease-out) backwards;
  animation-delay:calc(min(var(--fx-i,0),7) * var(--fx-stagger,40ms));
}
@keyframes fx-seat-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#room .room-panel.fx-room-in{animation:fx-room-in var(--fx-t-room) var(--fx-ease-out) backwards}
@keyframes fx-room-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}

/* F5 减少动效：只保留最终态 */
@media (prefers-reduced-motion:reduce){
  #handRow .card.fx-playable,#handRow .card.fx-mute,#handRow.fx-has-sel .card{transition:none}
  .fx-fly.fx-fly-trail,.equip-chip.fx-judge-flip,.fx-num-pop,.mark-tag.fx-mark-pulse,
  .pcard .equip-chip.fx-eq-drop,.chip.fx-chip-tap,#roomSeats .seatcard.fx-seat-in,#room .room-panel.fx-room-in{animation:none!important}
}

===FILE: client/index.html===
===NOCHANGE===