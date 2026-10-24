// 三国杀在线 · 客户端
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// 昵称等用户输入会被拼进模板，统一转义，避免 innerHTML 注入
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  meta: null, cards: {}, roomId: null, token: null, seat: null,
  snap: null, ask: null, sel: [], targets: [], view: 'lobby', es: null, timer: null,
  logOpen: false, logTouched: false,
  // 大厅配置：武将包多选 / 自定义将池 / 选将模式 / 托管
  packs: new Set(['standard']), pool: new Set(), pickMode: 'random',
  autoCfg: { enabled: false, seconds: 15 }, room: null,
  tipTimer: null, tipHideTimer: null, suppressClickUntil: 0, toastEl: null,
};

async function api(path, body, method = 'POST') {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch('./' + String(path).replace(/^\/+/, ''), opt);
  return await r.json().catch(() => ({}));
}

async function init() {
  window.__SG = S; // 调试/自动化验收用：只读句柄，不参与业务逻辑
  const meta = await api('/api/meta', null, 'GET');
  S.meta = meta;
  S.cards = {};
  for (const c of meta.cards || []) S.cards[c.name] = c;
  renderModeChips();
  renderPackChips();
  renderPickModeChips();
  renderPoolList();
  refreshHostPick();
  renderGenerals();
  bind();
}

function renderModeChips() {
  const box = $('#modeList');
  box.innerHTML = '';
  for (const m of S.meta.modes) {
    const c = el('div', 'chip' + (m.id === 'identity' ? ' on' : ''), m.name);
    c.title = `${m.desc}（${m.minPlayers}-${m.maxPlayers} 人）`;
    c.dataset.mode = m.id;
    c.onclick = () => { box.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); c.classList.add('on'); };
    box.appendChild(c);
  }
}

// 武将包：多选（至少保留一个）
function renderPackChips() {
  const box = $('#packList');
  box.innerHTML = '';
  for (const p of S.meta.packs) {
    const on = S.packs.has(p.id);
    const c = el('div', 'chip' + (on ? ' on' : ''), `${p.name}(${p.count})`);
    c.dataset.pack = p.id;
    c.onclick = () => {
      if (S.packs.has(p.id)) {
        if (S.packs.size <= 1) return toast('至少选择一个武将包');
        S.packs.delete(p.id);
      } else S.packs.add(p.id);
      renderPackChips();
      renderPoolList();
      refreshHostPick();
    };
    box.appendChild(c);
  }
}

function renderPickModeChips() {
  const box = $('#pickModeList');
  box.innerHTML = '';
  for (const [id, label, tip] of [
    ['random', '随机分配', '由系统随机发将'],
    ['host', '仅房主自选', '只有房主能选武将，其他人随机'],
    ['all', '所有人自选', '每个玩家都能在房间里挑武将'],
  ]) {
    const c = el('div', 'chip' + (S.pickMode === id ? ' on' : ''), label);
    c.title = tip;
    c.dataset.pick = id;
    c.onclick = () => {
      S.pickMode = id;
      renderPickModeChips();
      refreshHostPick();
    };
    box.appendChild(c);
  }
}

// 大厅的自定义将池：按包分组列出所有武将，点击切换
function renderPoolList() {
  const box = $('#poolList');
  if (!box) return;
  box.innerHTML = '';
  const packName = {};
  for (const p of S.meta.packs) packName[p.id] = p.name;
  const groups = {};
  for (const g of S.meta.generals) (groups[g.pack] = groups[g.pack] || []).push(g);
  for (const pack of Object.keys(groups)) {
    const wrap = el('div', '');
    wrap.appendChild(el('div', 'pool-pack', `${packName[pack] || pack}（${groups[pack].length}）`));
    const grid = el('div', 'pool-grid');
    for (const g of groups[pack].sort((a, b) => a.name.localeCompare(b.name, 'zh'))) {
      const it = el('div', 'pool-item' + (S.pool.has(g.id) ? ' on' : ''), g.name);
      it.dataset.gid = g.id;
      it.title = `${g.kingdom} · ${g.hp} 体力`;
      it.onclick = () => {
        if (S.pool.has(g.id)) S.pool.delete(g.id); else S.pool.add(g.id);
        it.classList.toggle('on', S.pool.has(g.id));
        updatePoolCount();
        refreshHostPick();
      };
      grid.appendChild(it);
    }
    wrap.appendChild(grid);
    box.appendChild(wrap);
  }
  updatePoolCount();
}

function updatePoolCount() {
  const n = S.pool.size;
  const c = $('#poolCount');
  if (c) c.textContent = n ? `已选 ${n} 名武将` : '未指定则按武将包随机';
}

// 当前大厅将池（自定义优先，否则按选中的包）
function lobbyPool() {
  if (S.pool.size) return S.meta.generals.filter(g => S.pool.has(g.id));
  return S.meta.generals.filter(g => S.packs.has(g.pack));
}

function refreshHostPick() {
  const sel = $('#hostPick');
  if (!sel) return;
  const pool = lobbyPool().slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  sel.innerHTML = '<option value="">（随机）</option>' +
    pool.map(g => `<option value="${esc(g.id)}">${esc(g.name)}（${esc(g.kingdom)} ${g.hp}体力）</option>`).join('');
  sel.disabled = S.pickMode === 'random';
}

function renderGenerals() {
  const box = $('#generalList');
  box.innerHTML = '';
  const list = S.meta.generals.slice().sort((a, b) => (a.pack === b.pack ? a.name.localeCompare(b.name, 'zh') : a.pack.localeCompare(b.pack)));
  for (const g of list) {
    const card = el('div', 'gcard');
    const sk = (g.skillsDetail || []).map(s => s.name).join(' / ') || (g.skills || []).join(' / ');
    card.innerHTML = `<b>${esc(g.name)}</b><div class="k">${esc(g.kingdom)} · ${g.hp}体力</div><div class="s">${esc(sk)}</div>`;
    card.onclick = () => openGeneralDetail(g);
    box.appendChild(card);
  }
}

function bind() {
  $('#btnCreate').onclick = async () => {
    const modeId = $('#modeList .chip.on')?.dataset.mode || 'identity';
    const maxSeats = Number($('#seatCount').value || 3);
    const name = ($('#nickname').value || '房主').trim().slice(0, 12) || '房主';
    const aiSeats = $('#aiFill').checked ? maxSeats : 0;
    const packs = [...S.packs];
    const customPool = S.pool.size ? [...S.pool] : null;
    const pickMode = S.pickMode;
    const generalId = pickMode === 'random' ? null : ($('#hostPick').value || null);
    const autoEnable = !!$('#autoOn').checked;
    const autoSeconds = Math.max(5, Math.min(180, Number($('#autoSec').value || 15)));
    const r = await api('/api/rooms', { modeId, packs, customPool, pickMode, generalId, maxSeats, name, aiSeats, autoEnable, autoSeconds });
    if (!r.ok) return alert(r.error || '创建失败');
    S.roomId = r.roomId; S.token = r.token; S.seat = r.seat;
    S.autoCfg = { enabled: autoEnable, seconds: autoSeconds };
    showRoom(r.room);
    if (aiSeats >= maxSeats) {
      await (S.esReady || Promise.resolve());
      await api(`/api/rooms/${S.roomId}/start`, { token: S.token });
    }
  };
  $('#btnJoin').onclick = async () => {
    const id = ($('#joinId').value || '').trim();
    const name = ($('#joinName').value || '').trim() || '玩家';
    if (!id) return alert('请输入房间号');
    const r = await api(`/api/rooms/${id}/join`, { name });
    if (!r.ok) return alert(r.error || '加入失败');
    S.roomId = id; S.token = r.token; S.seat = r.seat;
    showRoom(r.room);
  };
  $('#btnStart').onclick = async () => {
    const r = await api(`/api/rooms/${S.roomId}/start`, { token: S.token });
    if (!r.ok) alert(r.error || '无法开始');
  };
  $('#btnCopy').onclick = () => {
    navigator.clipboard?.writeText(location.origin + location.pathname + '#' + S.roomId);
    alert('房间号：' + S.roomId);
  };
  $('#btnHelp').onclick = showHelp;
  $('#btnLog').onclick = () => { S.logTouched = true; setLogOpen(!S.logOpen); };
  $('#btnLogClose').onclick = () => { S.logTouched = true; setLogOpen(false); };
  $('#btnLogClear').onclick = () => { $('#logList').innerHTML = ''; };
  $('#btnSkills').onclick = openSkills;
  $('#btnAuto').onclick = openAutoSettings;
  $('#btnPoolToggle').onclick = () => {
    const box = $('#poolBox');
    box.classList.toggle('hidden');
    $('#btnPoolToggle').textContent = box.classList.contains('hidden') ? '展开' : '收起';
  };
  $('#btnPoolAll').onclick = () => { for (const g of lobbyPool()) S.pool.add(g.id); renderPoolList(); refreshHostPick(); };
  $('#btnPoolNone').onclick = () => { S.pool.clear(); renderPoolList(); refreshHostPick(); };
  // 托管设置记忆
  const savedAuto = loadAutoCfg();
  $('#autoOn').checked = !!savedAuto.enabled;
  $('#autoSec').value = savedAuto.seconds;
  $('#autoOn').onchange = saveAutoCfg;
  $('#autoSec').onchange = saveAutoCfg;
}

function loadAutoCfg() {
  try {
    const raw = JSON.parse(localStorage.getItem('sg_auto') || 'null');
    if (raw && typeof raw === 'object') return { enabled: !!raw.enabled, seconds: Math.max(5, Math.min(180, Number(raw.seconds) || 15)) };
  } catch {}
  return { enabled: false, seconds: 15 };
}
function saveAutoCfg() {
  const cfg = { enabled: !!$('#autoOn').checked, seconds: Math.max(5, Math.min(180, Number($('#autoSec').value || 15))) };
  try { localStorage.setItem('sg_auto', JSON.stringify(cfg)); } catch {}
  return cfg;
}

const isMobileLayout = () => window.matchMedia('(max-width: 760px)').matches;

const SUIT_CHAR = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const SUB_CN = { weapon: '武器', armor: '防具', 'horse+': '+1马', 'horse-': '-1马' };
const EQUIP_SLOTS = [['weapon', '武器'], ['armor', '防具'], ['horsePlus', '+1马'], ['horseMinus', '-1马']];

// ---------------- 轻提示 ----------------
function toast(text, ms = 2400) {
  let t = S.toastEl;
  if (!t || !t.isConnected) { t = el('div', 'toast'); document.body.appendChild(t); S.toastEl = t; }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------- 卡牌详情（桌面 hover / 手机长按） ----------------
function cardInfo(cardOrName) {
  const name = typeof cardOrName === 'string' ? cardOrName : cardOrName?.name;
  const meta = S.cards[name] || {};
  let suit = '';
  if (cardOrName && typeof cardOrName === 'object') suit = `${SUIT_CHAR[cardOrName.suit] || ''}${cardOrName.num ?? ''}`;
  const parts = [];
  if (meta.type) parts.push(typeCN(meta.type));
  if (meta.sub) parts.push(SUB_CN[meta.sub] || meta.sub);
  if (meta.range) parts.push(`攻击范围 ${meta.range}`);
  if (meta.delayed) parts.push('延时锦囊');
  return {
    title: (meta.cn || name) + (suit ? ` ${suit}` : ''),
    sub: parts.join(' · '),
    desc: meta.desc || '（暂无说明）',
  };
}

function showCardTip(info, anchor) {
  let tip = document.getElementById('cardTip');
  if (!tip) { tip = el('div'); tip.id = 'cardTip'; document.body.appendChild(tip); }
  tip.innerHTML = `<div class="t">${esc(info.title)}</div>${info.sub ? `<div class="m">${esc(info.sub)}</div>` : ''}<div class="d">${esc(info.desc)}</div>`;
  tip.classList.add('show');
  const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2, top: 120, width: 0, height: 0, bottom: 120 };
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(8, Math.min(innerWidth - tw - 8, left));
  let top = r.top - th - 8;
  if (top < 8) top = Math.min(innerHeight - th - 8, r.bottom + 8);
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function hideCardTip() {
  const tip = document.getElementById('cardTip');
  if (tip) tip.classList.remove('show');
}

// 给任意元素挂「桌面悬停 / 手机长按」查看牌面详情
function bindCardTip(node, getCard) {
  const show = () => { const c = getCard(); if (c) showCardTip(cardInfo(c), node); };
  node.addEventListener('mouseenter', () => { clearTimeout(S.tipTimer); S.tipTimer = setTimeout(show, 240); });
  node.addEventListener('mouseleave', () => { clearTimeout(S.tipTimer); hideCardTip(); });
  node.addEventListener('touchstart', () => {
    clearTimeout(S.tipTimer);
    S.tipTimer = setTimeout(() => { show(); S.suppressClickUntil = Date.now() + 900; }, 420);
  }, { passive: true });
  node.addEventListener('touchmove', () => { clearTimeout(S.tipTimer); hideCardTip(); }, { passive: true });
  node.addEventListener('touchend', () => { clearTimeout(S.tipTimer); clearTimeout(S.tipHideTimer); S.tipHideTimer = setTimeout(hideCardTip, 2000); });
  node.addEventListener('touchcancel', () => { clearTimeout(S.tipTimer); hideCardTip(); });
}

// ---------------- 通用弹窗 ----------------
function modal(title, sub) {
  const mask = el('div', 'modal-mask');
  const box = el('div', 'modal-box');
  box.innerHTML = `<h3>${esc(title)}</h3>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}<div class="body"></div>`;
  const closeRow = el('div', 'close-row');
  const btn = el('button', 'ghost', '关闭');
  btn.onclick = () => mask.remove();
  closeRow.appendChild(btn);
  box.appendChild(closeRow);
  mask.appendChild(box);
  document.body.appendChild(mask);
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  return { mask, body: box.querySelector('.body'), closeRow };
}

// ---------------- 自身装备 / 判定 / 标记 ----------------
function renderSelfEquips(me) {
  const box = $('#selfEquips');
  if (!box) return;
  box.innerHTML = '';
  if (!me) return;
  box.appendChild(el('span', 'equip-label', '装备'));
  for (const [slot, cn] of EQUIP_SLOTS) {
    const c = me.equips?.[slot];
    const chip = el('div', 'equip-chip' + (c ? '' : ' empty'),
      c ? `${esc(S.cards[c.name]?.cn || c.name)}${SUIT_CHAR[c.suit] || ''}${c.num ?? ''}` : `${cn} —`);
    if (c) bindCardTip(chip, () => c);
    box.appendChild(chip);
  }
  const judge = me.judgeZone || [];
  if (judge.length) {
    box.appendChild(el('span', 'equip-label', '判定'));
    for (const z of judge) {
      const chip = el('div', 'equip-chip judge-chip', esc(S.cards[z.name]?.cn || z.name));
      bindCardTip(chip, () => z);
      box.appendChild(chip);
    }
  }
  const marks = [];
  for (const [k, v] of Object.entries(me.marks || {})) if (v) marks.push([k, v]);
  if (me.chained) marks.push(['连环', '']);
  if (me.flags?.jiu) marks.push(['酒', me.flags.jiu]);
  if (me.flags?.shaUsed) marks.push(['已出杀', me.flags.shaUsed]);
  for (const [k, v] of marks) {
    box.appendChild(el('span', 'mark-tag', `${esc(k)}${v ? ' ' + esc(v) : ''}`));
  }
}

// ---------------- 技能一览（含自己 + 标记数） ----------------
function openSkills() {
  const snap = S.snap;
  if (!snap?.players) return toast('对局还没开始');
  const { body } = modal('技能一览', '包含全部角色（含你自己）的武将技能与标记；标记数按当前状态实时显示');
  for (const p of snap.players) {
    const row = el('div', 'pk-row' + (p.seat === S.seat ? ' me' : '') + (p.alive ? '' : ' dead'));
    const who = el('div', 'who');
    who.innerHTML = `<b>${esc(p.name)}${p.seat === S.seat ? '（你）' : ''}</b>
      <div class="g">${esc(p.generalName || '')}</div>
      <div class="hp">${p.hp}/${p.maxHp} 体力 · 手牌 ${p.handCount}</div>`;
    const tags = [];
    for (const [k, v] of Object.entries(p.marks || {})) if (v) tags.push(`<span class="mark-tag">${esc(k)} ${esc(v)}</span>`);
    if (p.chained) tags.push('<span class="mark-tag status">连环</span>');
    if (p.flags?.jiu) tags.push(`<span class="mark-tag status">酒 ×${esc(p.flags.jiu)}</span>`);
    if (p.flags?.shaUsed) tags.push(`<span class="mark-tag status">已出杀 ${esc(p.flags.shaUsed)}</span>`);
    if (tags.length) { const mr = el('div', 'mark-row'); mr.innerHTML = tags.join(''); who.appendChild(mr); }
    row.appendChild(who);
    const list = el('div', 'skill-list');
    const skills = p.skills || [];
    if (!skills.length) list.appendChild(el('div', 'skill-item', '（无技能）'));
    for (const s of skills) {
      const item = el('div', 'skill-item');
      item.innerHTML = `<span class="sn">${esc(s.name)}</span><span class="sd">${esc(s.desc || '')}</span>`;
      list.appendChild(item);
    }
    row.appendChild(list);
    body.appendChild(row);
  }
}

function openGeneralDetail(g) {
  const { body } = modal(`${g.name}`, `${g.kingdom} · ${g.hp} 体力 · ${packName(g.pack)}`);
  for (const s of g.skillsDetail || []) {
    const item = el('div', 'skill-item');
    item.innerHTML = `<span class="sn">${esc(s.name)}</span><span class="sd">${esc(s.desc || '')}</span>`;
    body.appendChild(item);
  }
}

function packName(id) {
  return (S.meta?.packs || []).find(p => p.id === id)?.name || id;
}

// ---------------- 托管设置 ----------------
function openAutoSettings() {
  const cfg = { ...S.autoCfg };
  const { mask, body, closeRow } = modal('托管设置', '开启后，轮到你操作时若超过设定秒数没有动作，将由电脑代打；你随时可在这里改回来');
  body.innerHTML = `<div class="auto-row">
      <label class="check"><input id="autoEnabled" type="checkbox" ${cfg.enabled ? 'checked' : ''}/> 超时后自动交给电脑</label>
      <label class="check">超时时间 <input id="autoSeconds" class="sec-input" type="number" min="5" max="180" value="${cfg.seconds}" /> 秒</label>
    </div>
    <div class="hint">关闭时仍有服务端兜底超时（约 30 秒）防止卡局；托管只影响你自己的座位。</div>`;
  const save = el('button', 'primary', '保存');
  save.onclick = async () => {
    const enabled = !!body.querySelector('#autoEnabled').checked;
    const seconds = Math.max(5, Math.min(180, Number(body.querySelector('#autoSeconds').value || 15)));
    const r = await api(`/api/rooms/${S.roomId}/autoplay`, { token: S.token, enabled, seconds });
    if (r.ok) {
      S.autoCfg = { enabled, seconds };
      try { localStorage.setItem('sg_auto', JSON.stringify(S.autoCfg)); } catch {}
      renderTable();
      toast(enabled ? `托管已开启：${seconds} 秒未操作即由电脑代打` : '托管已关闭');
      mask.remove();
    } else toast(r.error || '保存失败');
  };
  closeRow.insertBefore(save, closeRow.firstChild);
}

// ---------------- 房间内选将 ----------------
function openPickGeneral(room) {
  const pool = (room.pool || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const used = new Set(room.seats.filter(s => s.index !== S.seat && s.generalId).map(s => s.generalId));
  const mine = room.seats.find(s => s.index === S.seat)?.generalId;
  const { mask, body } = modal('选择我的武将', `本房间将池 ${pool.length} 名（按所选武将包 / 自定义将池生成），已被他人选走的不可再选`);
  if (!pool.length) body.appendChild(el('div', 'hint', '将池为空，请让房主调整武将包或此将池。'));
  const grid = el('div', 'pool-grid');
  for (const g of pool) {
    const taken = used.has(g.id);
    const it = el('div', 'pool-item' + (taken ? ' dis' : '') + (mine === g.id ? ' on' : ''), g.name);
    it.title = taken ? '已被其他座位选择' : `${g.kingdom} · ${g.hp} 体力`;
    if (!taken) {
      it.onclick = async () => {
        const r = await api(`/api/rooms/${S.roomId}/pick`, { token: S.token, generalId: g.id });
        if (r.ok) { mask.remove(); renderRoom(r.room); toast(`已选择 ${g.name}`); }
        else toast(r.error || '选择失败');
      };
    }
    grid.appendChild(it);
  }
  body.appendChild(grid);
  const reset = el('button', 'ghost', '改为随机');
  reset.style.marginTop = '10px';
  reset.onclick = async () => {
    const r = await api(`/api/rooms/${S.roomId}/pick`, { token: S.token, generalId: '' });
    if (r.ok) { mask.remove(); renderRoom(r.room); toast('已改为随机分配'); }
  };
  body.appendChild(reset);
}


function setLogOpen(open) {
  S.logOpen = !!open;
  const show = S.logOpen && S.view === 'table';
  $('#logPanel').classList.toggle('show', show);
  document.body.classList.toggle('log-open', show && !isMobileLayout());
  const btn = $('#btnLog');
  btn.textContent = S.logOpen ? '收起战报' : '战报';
  btn.setAttribute('aria-expanded', String(show));
}

// 询问面板底边跟随自身区域高度，避免遮挡手牌（横竖屏都适用）
function syncAskOffset() {
  const self = $('#selfArea');
  if (!self) return;
  document.documentElement.style.setProperty('--self-h', `${self.offsetHeight}px`);
}

function switchView(v) {
  S.view = v;
  for (const id of ['lobby', 'room', 'table']) {
    $('#' + id).classList.toggle('hidden', id !== v);
  }
  if (v === 'table' && !S.logTouched) S.logOpen = !isMobileLayout();
  $('#btnLog').classList.toggle('hidden', v !== 'table');
  $('#btnSkills').classList.toggle('hidden', v !== 'table');
  $('#btnAuto').classList.toggle('hidden', v !== 'table');
  setLogOpen(S.logOpen);
  syncAskOffset();
}

function showRoom(room) {
  switchView('room');
  renderRoom(room);
  connect();
}

function renderRoom(room) {
  S.room = room;
  $('#roomTitle').textContent = `房间 ${room.id} · ${room.modeName}（${room.seats.length}/${room.maxSeats}）`;
  const box = $('#roomSeats');
  box.innerHTML = '';
  for (const s of room.seats) {
    const c = el('div', 'seatcard' + (s.online ? '' : ' off'));
    c.innerHTML = `<div class="n">${esc(s.name)}${s.isAI ? '（电脑）' : ''}${s.index === S.seat ? '（你）' : ''}${s.auto ? ' · 托管' : ''}</div>
      <div class="g">${esc(s.generalName || '待分配')}</div>`;
    box.appendChild(c);
  }
  // 房间配置与选将入口
  const cfg = $('#roomConfig');
  if (cfg) {
    cfg.innerHTML = '';
    const packs = (room.packs || []).map(p => packName(p)).join(' + ');
    const modeCN = { random: '随机分配', host: '仅房主自选', all: '所有人自选' }[room.pickMode] || '随机分配';
    const line = el('div', 'hint', `武将包：${packs}　选将：${modeCN}${room.customPool ? `　自定义将池 ${room.customPool.length} 名` : ''}`);
    cfg.appendChild(line);
    const my = room.seats.find(s => s.index === S.seat);
    const canPick = room.status === 'waiting' && (room.pickMode === 'all' || (room.pickMode === 'host' && S.seat === 0));
    if (canPick) {
      const b = el('button', 'secondary', my?.generalId ? `我的武将：${generalNameOf(my.generalId)}（点击更换）` : '选择我的武将');
      b.onclick = () => openPickGeneral(room);
      cfg.appendChild(b);
    } else if (room.pickMode === 'host' && S.seat !== 0) {
      cfg.appendChild(el('div', 'hint', '本房间仅房主可选将，其他座位随机分配。'));
    } else if (room.pickMode !== 'random' && room.status === 'waiting') {
      cfg.appendChild(el('div', 'hint', '开局时由系统在各座位随机分配未被选择的武将。'));
    }
  }
  $('#btnStart').style.display = room.seats.length && S.seat === 0 ? '' : 'none';
}

function generalNameOf(id) {
  return (S.meta?.generals || []).find(g => g.id === id)?.name || id;
}

function connect() {
  if (S.es) try { S.es.close(); } catch {}
  const url = `./api/rooms/${S.roomId}/stream?token=${encodeURIComponent(S.token)}`;
  const es = new EventSource(url);
  S.es = es;
  S.esReady = new Promise((resolve) => {
    es.onopen = () => { $('#conn').textContent = '已连接'; $('#conn').classList.add('on'); resolve(true); };
    setTimeout(() => resolve(false), 4000);
  });
  es.onerror = () => { $('#conn').textContent = '连接中断，重试中'; $('#conn').classList.remove('on'); };
  es.addEventListener('room', (e) => { const room = JSON.parse(e.data); S.room = room; if (room.status === 'waiting') renderRoom(room); });
  es.addEventListener('state', (e) => { S.snap = JSON.parse(e.data); if (S.snap?.players) { switchView('table'); renderTable(); } });
  es.addEventListener('log', (e) => { addLog(JSON.parse(e.data)); });
  es.addEventListener('auto', (e) => {
    const d = JSON.parse(e.data);
    if (d.on) { toast('已超时，本次操作由电脑代打（可在「托管」里调整）', 3200); addLog({ text: '⏱ 超时未操作，电脑已代为操作' }); }
  });
  es.addEventListener('ask', (e) => {
    S.ask = JSON.parse(e.data); S.sel = []; S.targets = [];
    // 手机端战报是全屏抽屉，新询问到达时自动收起，避免挡住操作
    if (isMobileLayout() && S.logOpen) { S.logTouched = true; setLogOpen(false); }
    renderAsk(); renderTable();
  });
  es.addEventListener('ended', (e) => { const d = JSON.parse(e.data); showOverlay(d.text, d.winners); });
}

function renderTable() {
  const snap = S.snap;
  if (!snap || !snap.players) return;
  $('#topinfo').textContent = `第 ${snap.turn} 回合 · ${phaseCN(snap.phase)} · 牌堆 ${snap.deckCount}`;
  const me = S.seat != null ? snap.players[S.seat] : null;
  const opp = $('#opponents');
  opp.innerHTML = '';
  for (const p of snap.players) {
    if (me && p.seat === S.seat) continue;
    opp.appendChild(playerCard(p, snap));
  }
  if (me) {
    const canSelf = isTargetSelectable(me);
    const si = $('#selfInfo');
    const autoTxt = S.autoCfg?.enabled ? ` · <span style="color:#7f8fa8">托管 ${S.autoCfg.seconds}s</span>` : '';
    si.innerHTML = `你将 <b>${esc(me.generalName)}</b> · ${me.hp}/${me.maxHp} 体力 · 手牌 ${me.handCount} · ${snap.currentIndex === me.seat ? '<b style="color:#d8b46a">你的回合</b>' : '等待中'}${me.chained ? ' · 连环' : ''}${autoTxt}`
      + (canSelf ? ' · <b style="color:#d8b46a">点此选自己</b>' : '');
    si.classList.toggle('targetable', canSelf);
    si.classList.toggle('picked', canSelf && S.targets.includes(me.seat));
    si.onclick = canSelf ? (() => toggleTarget(me.seat)) : null;
    renderSelfEquips(me);
    renderHand(me);
  }
  const cur = snap.players[snap.currentIndex];
  $('#phaseInfo').innerHTML = cur ? `当前回合：<b>${esc(cur.name)}</b>（${esc(cur.generalName)}）` : '';
  $('#discardInfo').textContent = `弃牌堆 ${snap.discardCount} 张`;
  syncAskOffset();
}

function phaseCN(p) {
  return { prepare: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束' }[p] || '—';
}

function playerCard(p, snap) {
  const c = el('div', 'pcard' + (p.alive ? '' : ' dead') + (snap.currentIndex === p.seat ? ' active' : ''));
  if (isTargetSelectable(p)) {
    c.classList.add('targetable');
    c.onclick = () => toggleTarget(p.seat);
    if (S.targets.includes(p.seat)) c.style.outline = '2px solid #d8b46a';
  }
  const hpDots = Array.from({ length: p.maxHp }, (_, i) => `<i class="hpdot${i < p.hp ? ' on' : ''}"></i>`).join('');
  const roleTag = p.role ? `<div class="role">${roleCN(p.role)}</div>` : '';
  const markTags = [];
  for (const [k, v] of Object.entries(p.marks || {})) if (v) markTags.push(`<span class="mark-tag">${esc(k)} ${esc(v)}</span>`);
  if (p.chained) markTags.push('<span class="mark-tag status">连环</span>');
  if (p.flags?.jiu) markTags.push(`<span class="mark-tag status">酒 ×${esc(p.flags.jiu)}</span>`);
  c.innerHTML = `${roleTag}
    <div class="pn"><span>${esc(p.name)}</span><span class="pk">${esc(p.kingdom || '')}</span></div>
    <div class="pg">${esc(p.generalName)}</div>
    <div class="hpbar">${hpDots}</div>
    <div class="meta"><span>手牌 ${p.handCount}</span>${typeof p.distance === 'number' ? `<span>距离 ${p.distance}</span>` : ''}</div>
    <div class="eq-row"></div>`;
  const eqRow = c.querySelector('.eq-row');
  let anyEq = false;
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
  // 查看该武将技能：电脑=左键长按 500ms 或右键；手机=长按 480ms（单击不触发，避免误开）
  attachSkillTrigger(c.querySelector('.pg'), p);
  return c;
}

// 长按/右键唤醒「单将技能」面板（手机长按、电脑左键长按或右键）
function attachSkillTrigger(node, p) {
  if (!node) return;
  node.title = '长按（电脑可右键）查看该武将技能';
  let timer = null;
  const open = () => { clearTimeout(timer); timer = null; openOneSkills(p); };
  const cancel = () => { clearTimeout(timer); timer = null; };
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancel();
    timer = setTimeout(open, e.pointerType === 'mouse' ? 500 : 480);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'pointermove']) node.addEventListener(ev, cancel);
  node.addEventListener('contextmenu', (e) => { e.preventDefault(); open(); });
}

// 单人技能速查
function openOneSkills(p) {
  const { body } = modal(`${p.name} · ${p.generalName}`, `${p.hp}/${p.maxHp} 体力 · 手牌 ${p.handCount}${p.chained ? ' · 连环' : ''}`);
  for (const s of p.skills || []) {
    const item = el('div', 'skill-item');
    item.innerHTML = `<span class="sn">${esc(s.name)}</span><span class="sd">${esc(s.desc || '')}</span>`;
    body.appendChild(item);
  }
  if (!(p.skills || []).length) body.appendChild(el('div', 'skill-item', '（无技能）'));
}

function cardCN(c) {
  const cn = S.cards[c.name]?.cn || c.name;
  const suit = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[c.suit] || '';
  return `${cn}${suit}${c.num || ''}`;
}
function roleCN(r) {
  return { lord: '主公', loyalist: '忠臣', rebel: '反贼', renegade: '内奸', landlord: '地主', farmer: '农民', boss: '吕布', hero: '联军' }[r] || '';
}

function renderHand(me) {
  const row = $('#handRow');
  row.innerHTML = '';
  const allowed = allowedCardIds();
  for (const c of me.hand || []) {
    const meta = S.cards[c.name] || {};
    const d = el('div', 'card' + (meta.type === 'equip' ? ' equip' : meta.type === 'trick' ? ' trick' : ''));
    if (allowed && !allowed.includes(c.id)) d.classList.add('disabled');
    if (S.sel.includes(c.id)) d.classList.add('sel');
    const red = c.suit === 'heart' || c.suit === 'diamond';
    d.innerHTML = `<div class="cs ${red ? 'red' : 'black'}">${{ spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[c.suit] || ''}${c.num}</div>
      <div class="cn">${meta.cn || c.name}</div><div class="ct">${typeCN(meta.type)}</div>`;
    d.onclick = () => clickCard(c);
    bindCardTip(d, () => c);
    row.appendChild(d);
  }
  renderActions(me);
}

function typeCN(t) { return { basic: '基本', trick: '锦囊', equip: '装备' }[t] || ''; }

function renderActions(me) {
  const bar = $('#actionBar');
  bar.innerHTML = '';
  if (S.ask?.kind === 'play') {
    const b1 = el('button', 'primary', '确定出牌');
    b1.onclick = () => submitPlay();
    const b2 = el('button', 'secondary', '结束出牌');
    b2.onclick = () => submit({ endPhase: true });
    bar.appendChild(b1); bar.appendChild(b2);
    for (const sk of me.activeSkills || []) {
      const b = el('button', '', `发动【${sk.name}】`);
      b.title = sk.desc || '';
      b.onclick = () => submit({ skill: sk.id });
      bar.appendChild(b);
    }
  }
}

function currentCardMeta() {
  if (S.sel.length !== 1) return null;
  const me = S.snap?.players?.[S.seat];
  const c = me?.hand?.find(x => x.id === S.sel[0]);
  return c ? (S.cards[c.name] || null) : null;
}

function isTargetSelectable(p) {
  if (S.ask?.kind === 'targets') return (S.ask.targets || []).includes(p.seat);
  if (S.ask?.kind === 'play' && S.sel.length === 1 && p.alive) {
    const meta = currentCardMeta();
    if (!meta || !meta.target) return false;
    const t = meta.target;
    // 与引擎 candidatesFor 同口径：self 单标只能点自己；含 others 两者都可；无 self 不能点自己
    if (t.self && !t.others && !t.all) return p.seat === S.seat;
    if (!t.self) return p.seat !== S.seat;
    return true;
  }
  return false;
}

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

function allowedCardIds() {
  const a = S.ask;
  if (!a) return null;
  if (a.kind === 'card' || a.kind === 'discard' || a.kind === 'cards') return a.cards || [];
  return null;
}

function clickCard(card) {
  // 手机长按查看牌面后紧接着的这次点击不算选牌，避免误操作
  if (Date.now() < S.suppressClickUntil) return;
  const allowed = allowedCardIds();
  if (allowed && !allowed.includes(card.id)) return;
  const a = S.ask;
  if (a && a.kind === 'card') { submit({ cardId: card.id }); return; }
  if (a && (a.kind === 'discard' || a.kind === 'cards')) {
    const max = a.max || 1;
    if (S.sel.includes(card.id)) S.sel = S.sel.filter(x => x !== card.id);
    else { S.sel.push(card.id); if (S.sel.length > max) S.sel.shift(); }
    renderTable();
    renderAsk();
    return;
  }
  if (S.sel.includes(card.id)) S.sel = [];
  else S.sel = [card.id];
  S.targets = [];
  renderTable();
}

async function submit(answer) {
  const ask = S.ask;
  if (!ask) return;
  const payload = { token: S.token, reqId: ask.id, reqKind: ask.kind, answer };
  S.ask = null; S.sel = []; S.targets = [];
  clearInterval(S.timer);
  $('#askPanel').classList.add('hidden');
  await api(`/api/rooms/${S.roomId}/action`, payload);
}

function submitPlay() {
  if (!S.sel.length) return alert('请先选择一张牌');
  const cardId = S.sel[0];
  const meta = currentCardMeta();
  const need = meta?.target?.min ?? 0;
  if (S.targets.length < need) return alert(`需要选择 ${need} 个目标`);
  submit({ cardId, seats: S.targets });
}

function renderAsk() {
  const a = S.ask;
  const box = $('#askPanel');
  if (!a || a.kind === 'play') { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = '';
  const q = el('div', 'q');
  q.textContent = a.prompt || '请选择';
  box.appendChild(q);
  const opts = el('div', 'opts');

  if (a.kind === 'card') {
    const me = S.snap?.players?.[S.seat];
    const cands = (a.cards || []).map(id => me?.hand?.find(c => c.id === id)).filter(Boolean);
    for (const c of cands) {
      const b = el('button', 'primary');
      b.textContent = cardCN(c);
      b.onclick = () => submit({ cardId: c.id });
      opts.appendChild(b);
    }
    const cancel = el('button', 'ghost', '放弃');
    cancel.onclick = () => submit(null);
    opts.appendChild(cancel);
  } else if (a.kind === 'confirm') {
    const y = el('button', 'primary', '发动');
    y.onclick = () => submit({ yes: true });
    const n = el('button', 'ghost', '否');
    n.onclick = () => submit({ yes: false });
    opts.appendChild(y); opts.appendChild(n);
  } else if (a.kind === 'choice') {
    (a.options || []).forEach((o, i) => {
      const b = el('button');
      b.textContent = o;
      b.onclick = () => submit({ index: i });
      opts.appendChild(b);
    });
    if (a.optional) {
      const c = el('button', 'ghost', '取消');
      c.onclick = () => submit({ index: -1 });
      opts.appendChild(c);
    }
  } else if (a.kind === 'targets') {
    box.appendChild(el('div', 'hint', `请点击上方玩家选择目标（还需 ${Math.max(0, (a.min || 1) - S.targets.length)} 个）`));
    const cancel = el('button', 'ghost', '取消');
    cancel.onclick = () => submit({ seats: [] });
    opts.appendChild(cancel);
  } else if (a.kind === 'discard' || a.kind === 'cards') {
    box.appendChild(el('div', 'hint', `请选择 ${a.min}~${a.max} 张牌（已选 ${S.sel.length}）`));
    const ok = el('button', 'primary', '确定');
    ok.onclick = () => {
      const n = a.min || 1;
      if (S.sel.length < n) return alert(`至少选择 ${n} 张`);
      submit({ cardIds: S.sel.slice() });
    };
    const cancel = el('button', 'ghost', '取消');
    cancel.onclick = () => submit({ cardIds: [] });
    opts.appendChild(ok); opts.appendChild(cancel);
  }
  box.appendChild(opts);

  const bar = el('div', 'timer');
  const i = el('i');
  bar.appendChild(i);
  box.appendChild(bar);
  const total = a.timeout || 30000;
  const start = Date.now();
  clearInterval(S.timer);
  S.timer = setInterval(() => {
    const left = Math.max(0, total - (Date.now() - start));
    i.style.width = (left / total * 100) + '%';
    if (left <= 0) clearInterval(S.timer);
  }, 100);
  syncAskOffset();
}

function addLog(entry) {
  const box = $('#logList');
  const d = el('div');
  d.textContent = entry.text; // 战报是纯文本，含玩家昵称，禁止走 innerHTML
  if (/回合|阵亡|结束|获胜/.test(entry.text)) d.classList.add('hl');
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  while (box.children.length > 300) box.removeChild(box.firstChild);
}

function showOverlay(text, winners) {
  const box = $('#overlay');
  box.classList.remove('hidden');
  box.innerHTML = `<div class="box"><h2>对局结束</h2><p>${esc(text || '')}</p>
    <p>${(winners || []).map(w => esc(w.name)).join('、')}</p>
    <button class="primary" onclick="location.reload()">再来一局</button></div>`;
}

function showHelp() {
  const box = $('#overlay');
  box.classList.remove('hidden');
  box.innerHTML = `<div class="box" style="max-width:560px;text-align:left">
    <h2>玩法</h2>
    <p>出牌阶段：点手牌选中 → 点击目标玩家（或点自己信息条选自己）→ 点「确定出牌」。<br/>
    响应时（出闪 / 出桃 / 无懈）会弹窗提示，点对应牌即可。<br/>
    <b>看牌面说明</b>：电脑上把鼠标停在牌上；手机上长按牌 0.4 秒，即可看到这张牌的完整效果。<br/>
    <b>技能一览</b>：顶栏「技能」可查看全场武将技能与你自己的标记数量；<b>长按</b>对手的武将名也能单独看他的技能（电脑上左键长按 0.5 秒，或直接右键）。<br/>
    <b>装备</b>：自己的武器 / 防具 / 坐骑 / 判定区显示在手牌上方，点一下可看效果；对手的装备显示在对方卡片上。<br/>
    <b>托管</b>：顶栏「托管」可设「多少秒没操作就交给电脑」，关闭后仍有约 30 秒兜底，避免卡局。<br/>
    模式：身份场、军争、1v1、斗地主、国战、虎牢关。</p>
    <button class="ghost" onclick="document.getElementById('overlay').classList.add('hidden')">关闭</button>
  </div>`;
}

window.addEventListener('resize', () => {
  if (!S.logTouched) S.logOpen = S.view === 'table' ? !isMobileLayout() : S.logOpen;
  setLogOpen(S.logOpen);
  syncAskOffset();
  hideCardTip();
});

init();
