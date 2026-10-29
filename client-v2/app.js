// 三国杀在线 · 客户端
// 音效层（WebAudio 合成，零外部资源）：见 client/audio.js
import { sfx, toggleSfx, isSfxOn, bindSfxUnlock } from './audio.js';
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// 昵称等用户输入会被拼进模板，统一转义，避免 innerHTML 注入
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  meta: null, cards: {}, roomId: null, token: null, seat: null,
  snap: null, ask: null, sel: [], targets: [], view: 'lobby', es: null, timer: null, lastPlaySeq: 0,
  zbMode: false,   // 【丈八蛇矛】两张手牌当【杀】的选牌模式
  logOpen: false, logTouched: false,
  // 大厅配置：武将包多选 / 自定义将池 / 选将模式 / 几选一 / 双将 / 托管
  packs: new Set(['standard']), pool: new Set(), pickMode: 'random',
  pickCount: 3, dual: false, pickInfo: null, hostRole: null,
  autoCfg: { enabled: false, seconds: 15 }, room: null,
  // AI 大模型（房间可选）：providers 由 /api/llm-status 下发，只含模型名与是否就绪，绝不含密钥
  llm: { enabled: false, providers: {} }, aiThink: {},
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
  renderPickCountChips();
  renderPoolList();
  refreshHostPick();
  renderGenerals();
  bind();
  refreshLLM();   // 异步拉一次「哪些大模型可用」，失败不影响开局
}

// 大模型可用性（只读）：供房间设置显示「DeepSeek 就绪 / GLM 未配置」
async function refreshLLM() {
  try {
    const r = await api('/api/llm-status', null, 'GET');
    S.llm = { enabled: !!r.enabled, providers: r.providers || {} };
  } catch {
    S.llm = { enabled: false, providers: {} };
  }
  return S.llm;
}

function renderModeChips() {
  const box = $('#modeList');
  box.innerHTML = '';
  for (const m of S.meta.modes) {
    // 默认选中「身份场·军争」：本项目牌库已大量扩充军争牌（火杀/雷杀/火攻/铁索/兵粮/太平/木牛/霹雳车/兵临/奇正），
    // 标准包反而缺牌；仍可一键切回「身份场·标准」
    const c = el('div', 'chip' + (m.id === 'junzheng' ? ' on' : ''), m.name);
    c.title = `${m.desc}（${m.minPlayers}-${m.maxPlayers} 人）`;
    c.dataset.mode = m.id;
    c.onclick = () => {
      box.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      refreshHostRoleRow();
    };
    box.appendChild(c);
  }
  refreshHostRoleRow();
}

// 「房主自选身份」只在身份场 / 军争里出现
const IDENTITY_MODE_IDS = ['identity', 'junzheng'];
function currentModeId() {
  return $('#modeList .chip.on')?.dataset.mode || 'junzheng';
}
function refreshHostRoleRow() {
  const row = $('#hostRoleRow');
  if (!row) return;
  const isIdentity = IDENTITY_MODE_IDS.includes(currentModeId());
  row.classList.toggle('hidden', !isIdentity);
  if (!isIdentity) { const on = $('#hostRoleOn'); if (on) on.checked = false; }
  const sel = $('#hostRoleSel');
  if (sel) sel.disabled = !(isIdentity && $('#hostRoleOn')?.checked);
}

// ---------------- 武将包选择器（关键字搜索 + 全选）----------------
// 搜索维度：包中文名 / 包 id / 包内任一武将名；空格分词时需全部命中
function packHaystackIndex() {
  const map = new Map();
  for (const g of ((S.meta && S.meta.generals) || [])) {
    if (!map.has(g.pack)) map.set(g.pack, []);
    map.get(g.pack).push(g.name);
  }
  return map;
}
function packMatchKeywords(p, kw, index) {
  const words = String(kw || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${p.name} ${p.id} ${(index.get(p.id) || []).join(' ')}`.toLowerCase();
  return words.every(w => hay.includes(w));
}
function renderPackPicker(box, selected, onChange, state) {
  if (!box) return;
  const meta = (S.meta && S.meta.packs) || [];
  const index = packHaystackIndex();
  const st = state || box.__pp || (box.__pp = { kw: '' });
  box.innerHTML = '';
  box.classList.add('pack-picker');

  const tools = el('div', 'pack-tools');
  const inp = document.createElement('input');
  inp.type = 'search';
  inp.className = 'pool-search pack-search';
  inp.placeholder = '搜索包名 / 包 id / 武将名（空格分词）';
  inp.value = st.kw || '';
  const btnAll = el('button', 'ghost', '全选');
  const btnNone = el('button', 'ghost', '清空');
  const cnt = el('span', 'hint pack-count');
  tools.append(inp, btnAll, btnNone, cnt);
  box.appendChild(tools);

  const chips = el('div', 'chips pack-chips');
  box.appendChild(chips);

  const visible = () => meta.filter(p => packMatchKeywords(p, st.kw, index));

  const paint = () => {
    chips.innerHTML = '';
    const list = visible();
    for (const p of list) {
      const on = selected.has(p.id);
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
    if (!list.length) chips.appendChild(el('div', 'hint', '没有匹配的武将包，换个关键字试试'));
    cnt.textContent = `已选 ${selected.size} / 共 ${meta.length} 个包${st.kw ? `（筛出 ${list.length}）` : ''}`;
  };
  inp.oninput = () => { st.kw = inp.value; paint(); };
  btnAll.onclick = () => {
    const list = visible();
    for (const p of list) selected.add(p.id);
    paint();
    if (onChange) onChange();
    toast(`已全选${st.kw ? `筛出的 ${list.length} 个` : '全部'}武将包`);
  };
  btnNone.onclick = () => {
    const keep = [...selected][0] || (meta[0] && meta[0].id);
    selected.clear();
    if (keep) selected.add(keep);
    paint();
    if (onChange) onChange();
    toast('已清空（至少保留 1 个武将包）');
  };
  paint();
}

// 武将包：多选（至少保留一个）
function renderPackChips() {
  renderPackPicker($('#packList'), S.packs, () => { renderPoolList(); refreshHostPick(); });
}

function renderPickModeChips() {
  const box = $('#pickModeList');
  box.innerHTML = '';
  for (const [id, label, tip] of [
    ['random', '随机分配', '由系统随机发将'],
    ['draw', '抽将（几选一）', '每人抽到几张候选，自己从中挑一个（双将则挑两个）'],
    ['all', '所有人自选', '每个玩家都能在房间里从全池挑武将'],
    ['host', '仅房主自选', '只有房主能选武将，其他人随机'],
  ]) {
    const c = el('div', 'chip' + (S.pickMode === id ? ' on' : ''), label);
    c.title = tip;
    c.dataset.pick = id;
    c.onclick = () => {
      S.pickMode = id;
      renderPickModeChips();
      refreshPickCountRow();
      refreshHostPick();
    };
    box.appendChild(c);
  }
  refreshPickCountRow();
}

// 「几选一」只在抽将模式出现
function refreshPickCountRow() {
  const row = $('#pickCountRow');
  if (row) row.classList.toggle('hidden', S.pickMode !== 'draw');
}

function renderPickCountChips() {
  const box = $('#pickCountList');
  if (!box) return;
  box.innerHTML = '';
  for (const n of [2, 3, 5]) {
    const c = el('div', 'chip' + (S.pickCount === n ? ' on' : ''), `${n} 选 1`);
    c.dataset.count = String(n);
    c.onclick = () => { S.pickCount = n; renderPickCountChips(); };
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
  sel.disabled = !(S.pickMode === 'all' || S.pickMode === 'host');
  sel.title = sel.disabled
    ? (S.pickMode === 'draw' ? '抽将模式下由系统发候选，建房时不预选' : '随机分配模式下不需选将')
    : '建房时预选自己的武将（也可以进房间后再选）';
  if (sel.disabled) sel.value = '';
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
    const modeId = $('#modeList .chip.on')?.dataset.mode || 'junzheng';
    const maxSeats = Number($('#seatCount').value || 3);
    const name = ($('#nickname').value || '房主').trim().slice(0, 12) || '房主';
    const aiSeats = $('#aiFill').checked ? maxSeats : 0;
    const packs = [...S.packs];
    const customPool = S.pool.size ? [...S.pool] : null;
    const pickMode = S.pickMode;
    const pickCount = S.pickCount;
    const dual = !!$('#dualOn')?.checked;
    const hostPickVal = $('#hostPick').value || null;
    const hostRole = (IDENTITY_MODE_IDS.includes(modeId) && $('#hostRoleOn')?.checked)
      ? ($('#hostRoleSel')?.value || null) : null;
    // 仅房主自选 / 所有人自选时，建房可直接带上自己挑的武将（抽将模式不预选）
    const generalIds = (pickMode === 'host' || pickMode === 'all') && hostPickVal ? [hostPickVal] : null;
    const autoEnable = !!$('#autoOn').checked;
    const autoSeconds = Math.max(5, Math.min(180, Number($('#autoSec').value || 15)));
    const r = await api('/api/rooms', {
      modeId, packs, customPool, pickMode, pickCount, dual, hostRole,
      generalId: hostPickVal, generalIds, maxSeats, name, aiSeats, autoEnable, autoSeconds,
    });
    if (!r.ok) return alert(r.error || '创建失败');
    S.roomId = r.roomId; S.token = r.token; S.seat = r.seat;
    S.autoCfg = { enabled: autoEnable, seconds: autoSeconds };
    showRoom(r.room);
    // 创建后进入准备界面（不再自动开局）：被电脑占满的座位若有同学加入，会自动让位给真人
    if (aiSeats >= maxSeats) {
      toast('座位已用电脑补足：可直接点「开始对局」，也可以等同学加入（会自动顶掉一个电脑）', 4200);
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
    if (!r.ok) { toast(r.error || '无法开始', 3200); return; }
    hideOverlay();
    renderRoom(r.room || S.room);
  };
  $('#btnReady').onclick = async () => {
    const my = S.room?.seats?.find(s => s.index === S.seat);
    const r = await api(`/api/rooms/${S.roomId}/ready`, { token: S.token, ready: !my?.ready });
    if (r.ok) renderRoom(r.room || S.room); else toast(r.error || '操作失败');
  };
  $('#btnCopy').onclick = () => {
    navigator.clipboard?.writeText(location.origin + location.pathname + '#' + S.roomId);
    alert('房间号：' + S.roomId);
  };
  $('#dualOn')?.addEventListener('change', () => { S.dual = !!$('#dualOn').checked; });
  $('#hostRoleOn')?.addEventListener('change', refreshHostRoleRow);
  $('#btnHelp').onclick = showHelp;
  bindSfxUnlock();
  if ($('#btnSfx')) {
    const paintSfx = () => {
      const on = isSfxOn();
      $('#btnSfx').textContent = on ? '音效开' : '音效关';
      $('#btnSfx').classList.toggle('off', !on);
      $('#btnSfx').setAttribute('aria-pressed', String(on));
    };
    paintSfx();
    $('#btnSfx').onclick = () => { toggleSfx(); paintSfx(); sfx('ui'); };
  }
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
function fxReset() {
  for (const t of FX.timers) clearTimeout(t);
  FX.timers.clear();
  for (const a of [...FX.anims]) { try { a.cancel(); } catch {} }
  FX.anims.clear();
  document.querySelectorAll('.fx-fly,.fx-float,.fx-banner,.fx-skill,.fx5-slot,.fx5-vig,.fx5-opp').forEach(n => n.remove());
  try { fxTargetClear(); } catch {}
  document.querySelectorAll('.fx-pulse').forEach(n => n.classList.remove('fx-pulse'));
  FX.lastHp.clear(); FX.lastArmor.clear(); FX.floatN.clear();
  FX.lastN = null; FX.lastTurn = 0;
  FX.lastPhaseKey = null; FX.askHideT = null;
  FX.skillArmed = false; FX.skillArmT = null; FX.skillLive = 0; FX.skillNextAt = 0;
  const tb = document.getElementById('topbar');
  if (tb) tb.classList.remove('fx-sweep');
  const cn = document.getElementById('conn');
  if (cn) cn.classList.remove('fx-conn-back');
  const ap = document.getElementById('askPanel');
  if (ap && ap.classList.contains('fx-out')) { ap.classList.add('hidden'); ap.classList.remove('fx-out', 'fx-in'); }
  if (ap) ap.classList.remove('fx-ask-urgent');
  document.querySelectorAll('.fx-vignette').forEach(n => { n.className = 'fx-vignette'; });
  document.querySelectorAll('.fx-hit').forEach(n => n.classList.remove('fx-hit'));
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
  try { fxTiltClear(); } catch {}
}
// 中央牌位（fx5）：出牌落地后，在中央留一个「正在结算」的牌位，走 入位→结算中→离场 三段后自毁
// 用独立轻量节点而非飞牌克隆，避免与飞行动画（fill:both 的 opacity:0）互顶
function fxSlotShow(ghost) {
  const host = document.getElementById('tableCenter');
  if (!host || !host.isConnected) return;
  const slot = el('div', 'fx5-slot fx5-slot-in');
  slot.setAttribute('aria-hidden', 'true');
  // v2：结算位直接显示这张牌的真牌面（花色/点数/牌名），不再是一个纯文字框
  if (ghost && ghost.cloneNode) {
    const face = ghost.cloneNode(true);
    face.className = 'card fx5-face';
    face.removeAttribute('data-cid');
    face.removeAttribute('style');
    slot.appendChild(face);
  } else {
    const cn = (ghost && ghost.textContent) || '';
    if (cn) slot.textContent = cn;
  }
  host.appendChild(slot);
  const tIn = fxMs('--fx5-t-slot-in', 180), tHold = fxMs('--fx5-t-hold', 700), tOut = fxMs('--fx5-t-slot-out', 200);
  fxLater(() => {
    if (!slot.isConnected) return;
    slot.classList.remove('fx5-slot-in');
    slot.classList.add('fx5-slot-resolve');
    fxLater(() => {
      if (!slot.isConnected) return;
      slot.classList.remove('fx5-slot-resolve');
      slot.classList.add('fx5-slot-out');
      fxLater(() => slot.remove(), tOut + 80);
    }, tHold);
  }, tIn);
}

// 飞牌：克隆手牌节点为 fixed 影子，飞向中央后移除；真实节点不动，不阻塞提交
function fxFlyCards(ids) {
  if (!ids || !ids.length) return;
  sfx('card');
  if (reduceMotion()) return;
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
    g.classList.remove('sel', 'picked', 'disabled', 'fx-tilt', 'fx-playable', 'fx-mute');
    g.classList.add('fx-fly', 'fx-fly-trail');
    g.removeAttribute('data-cid');
    g.setAttribute('aria-hidden', 'true');
    Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    frag.appendChild(g);
    return { g, r, i };
  });
  document.body.appendChild(frag);
  ghosts.forEach(({ g, r, i }) => {
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
    FX.anims.add(anim);
    const done = () => {
      FX.anims.delete(anim);
      if (i === 0) { try { fxSlotShow(g); } catch {} }   // 只让第一张留成中央牌位，其余照旧消失
      g.remove();
    };
    anim.onfinish = done;
    anim.oncancel = done;
  });
}
// v2：他人打出的牌 —— 桌面中央亮出牌面（此前别人的牌只能从战报文字里读）
function fxOppPlay(snap) {
  const lp = snap && snap.lastPlay;
  if (!lp || !lp.seq) return;
  if (S.lastPlaySeq === lp.seq) return;
  S.lastPlaySeq = lp.seq;
  if (S.view !== 'table') return;
  if (S.seat != null && lp.seat === S.seat) return;      // 自己出的牌走 renderHand 的飞牌动画
  const meta = S.cards[lp.name] || {};
  const red = lp.suit === 'heart' || lp.suit === 'diamond';
  const suit = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[lp.suit] || '';
  let box = document.getElementById('fx5Opp');
  if (!box) { box = el('div', 'fx5-opp'); box.id = 'fx5Opp'; document.body.appendChild(box); }
  box.innerHTML = '';
  const d = el('div', 'card fx5-opp-card' + (meta.type === 'equip' ? ' equip' : meta.type === 'trick' ? ' trick' : ''));
  d.innerHTML = `<div class="cs ${red ? 'red' : 'black'}">${suit}${lp.num || ''}</div>`
    + `<div class="cn">${esc(meta.cn || lp.name || '')}</div>`
    + `<div class="ct">${esc(lp.player || '')}</div>`;
  box.appendChild(d);
  box.classList.add('on');
  clearTimeout(box._fxT);
  box._fxT = setTimeout(() => { box.classList.remove('on'); }, 1200);
}

// v2：把当前行动者座位卡滚进横向可视区（只动容器 scrollLeft，不带动整页）
function fxScrollActiveIntoView() {
  const box = document.getElementById('opponents');
  if (!box) return;
  const a = box.querySelector('.pcard.active');
  if (!a) return;
  if (box.scrollWidth <= box.clientWidth + 4) return;         // 没有溢出就不用动
  const l = a.offsetLeft, w = a.offsetWidth, vw = box.clientWidth, sl = box.scrollLeft;
  if (l < sl + 8) box.scrollLeft = Math.max(0, l - 12);
  else if (l + w > sl + vw - 8) box.scrollLeft = l + w - vw + 12;
}

function fxSeatNode(seat) {
  if (S.seat != null && seat === S.seat) return document.getElementById('selfInfo');
  return document.querySelector(`#opponents .pcard[data-seat="${seat}"]`);
}
function fxFloat(anchor, key, text, kind, rect) {
  if (!anchor || !anchor.isConnected) return;
  const r = rect || anchor.getBoundingClientRect();
  if (!r || !r.width) return;
  const n = FX.floatN.get(key) || 0;
  FX.floatN.set(key, n + 1);
  const f = el('div', 'fx-float fx-' + kind + ' fx5-float fx5-float-' + (kind === 'heal' ? 'heal' : 'dmg'));
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
// 与上一帧对比 hp / 护甲，首帧只记录不飘字
function fxDiffHp(snap) {
  const jobs = [];
  for (const p of snap.players || []) {
    const k = p.seat;
    const ph = FX.lastHp.get(k), pa = FX.lastArmor.get(k);
    const hp = Number(p.hp || 0), ar = Number(p.armor || 0);
    FX.lastHp.set(k, hp); FX.lastArmor.set(k, ar);
    if (ph === undefined) continue;
    if (hp === ph && (pa === undefined || ar === pa)) continue;
    jobs.push({ k, ph, pa, hp, ar, anchor: fxSeatNode(k) });
  }
  // 统一读布局后再统一写入，8 人座也只触发一次 layout
  for (const j of jobs) j.rect = j.anchor && j.anchor.isConnected ? j.anchor.getBoundingClientRect() : null;
  for (const { k, ph, pa, hp, ar, anchor, rect } of jobs) {
    const self = S.seat != null && k === S.seat;
    try { fxHpDots(anchor, ph, hp, pa, ar); } catch {}
    try { fxNumPop(k, self, hp !== ph, pa !== undefined && ar !== pa); } catch {}
    if (pa !== undefined && ar < pa) fxFloat(anchor, k, `-${pa - ar} 护甲`, 'armor', rect);
    if (hp < ph) {
      fxFloat(anchor, k, `-${ph - hp}`, 'dmg', rect);
      fxImpact(k, self);
    } else if (hp > ph) {
      fxFloat(anchor, k, `+${hp - ph}`, 'heal', rect);
      sfx('heal');
      if (self) fxVignette('heal');
    }
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
  sfx('turn');
  fxLater(() => {
    b.remove();
    const s = S.snap;
    if (mine && s && !s.over && s.currentIndex === S.seat) fxSweepTail();
  }, fxMs('--fx-t-banner', 1200) + 50);
}

function fxSweepTail() {
  if (reduceMotion()) return;
  const tb = document.getElementById('topbar');
  if (!tb) return;
  tb.classList.remove('fx-sweep-tail');
  void tb.offsetWidth;
  tb.classList.add('fx-sweep-tail');
  fxLater(() => tb.classList.remove('fx-sweep-tail'), fxMs('--fx-t-tail', 150) + 60);
}
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
  fxLater(off, fxMs('--fx-t-vig', 900) + 100);
}

// 受击唯一入口：音效与视觉在同一同步调用内启动（同帧），避免「先响后闪」
function fxImpact(seat, self) {
  if (self) fxVignette('dmg'); else fxHitSeat(seat);
  sfx('hit', self);
}

function fxHitSeat(seat) {
  if (reduceMotion()) return;
  const node = fxSeatNode(seat);
  if (!node || !node.classList.contains('pcard')) return;
  node.classList.remove('fx-hit', 'fx5-hit');
  void node.offsetWidth;
  node.classList.add('fx-hit', 'fx5-hit');
  const n = (node._fxHitN || 0) + 1;
  node._fxHitN = n;
  const off = () => { if (node._fxHitN === n) node.classList.remove('fx-hit', 'fx5-hit'); };
  node.addEventListener('animationend', off, { once: true });
  fxLater(off, fxMs('--fx-t-hit', 480) + 100);
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
// ============ 拖拽出牌（仅鼠标 / 触控笔；触摸保留点击与横向滚动） ============
// 拖动手牌到桌面中央松手 = 选中该牌并立即尝试出牌；若该牌需要目标，则保持选中、
// 由玩家点目标后按「确定出牌」。拖动距离 < 8px 时不介入，交还原生 click。
const DRAG = { on: false, card: null, node: null, row: null, sx: 0, sy: 0, dx: 0, dy: 0, raf: 0, bound: false };

function fxDragDetach() {
  const h = DRAG.handlers;
  if (h) {
    window.removeEventListener('pointermove', h.onMove);
  }
  fxDragReset();
}

function fxDragRelease(node, hit) {
  if (hit) {
    const r = node.getBoundingClientRect();
    if (!r.width) return;
    const g = node.cloneNode(true);
    g.classList.remove('fx-drag', 'fx-drag-snap', 'sel', 'picked', 'disabled', 'fx-tilt');
    g.classList.add('fx-drag-ghost');
    g.removeAttribute('data-cid');
    g.setAttribute('aria-hidden', 'true');
    g.style.removeProperty('transform');
    Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.appendChild(g);
    let anim = null;
    const done = () => { if (anim) FX.anims.delete(anim); g.remove(); };
    try {
      anim = g.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }],
        { duration: fxMs('--fx-t-drag-out', 220), easing: fxVar('--ease-out', 'ease-out'), fill: 'forwards' });
    } catch { done(); return; }
    FX.anims.add(anim); anim.onfinish = done; anim.oncancel = done;
    return;
  }
  const ms = fxMs('--fx-t-drag-back', 200);
  node.style.transition = `transform ${ms}ms ${fxVar('--fx-ease-back', 'cubic-bezier(.34,1.4,.64,1)')}`;
  fxLater(() => node.style.removeProperty('transition'), ms + 50);
}

function fxDragReset() {
  const d = DRAG;
  if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; }
  const moved = !!(d.on && d.node && d.node.isConnected && (d.dx || d.dy));
  if (d.node) {
    if (moved && !reduceMotion()) { try { fxDragRelease(d.node, fxDragHit()); } catch {} }
    d.node.classList.remove('fx-drag', 'fx-drag-snap');
    d.node.style.removeProperty('transform');
    d.node.style.removeProperty('z-index');
  }
  if (d.row) d.row.querySelectorAll('.fx-drag-nb-l,.fx-drag-nb-r').forEach(n => n.classList.remove('fx-drag-nb-l', 'fx-drag-nb-r'));
  d.fxPrep = 0;
  document.body.classList.remove('fx-dragging');
  const ctr = document.getElementById('tableCenter');
  if (ctr) ctr.classList.remove('fx-drop-ready', 'fx-drop-on');
  d.on = false; d.card = null; d.node = null; d.sx = d.sy = d.dx = d.dy = 0;
}

function fxDragPrep(d) {
  d.fxPrep = 1;
  const tip = document.getElementById('cardTip');
  if (tip) tip.classList.remove('show');
  if (reduceMotion()) return;
  const p = d.node.previousElementSibling, n = d.node.nextElementSibling;
  if (p && p.classList.contains('card')) p.classList.add('fx-drag-nb-l');
  if (n && n.classList.contains('card')) n.classList.add('fx-drag-nb-r');
}

function fxDragPaint() {
  const d = DRAG;
  d.raf = 0;
  if (!d.on || !d.node) return;
  if (!d.fxPrep) fxDragPrep(d);
  // 缩放交给 CSS 的 scale 属性（.fx-drag 1.06 / .fx-drag-snap 1.10，带过渡），这里只写位移+旋转
  d.node.style.transform = `translate(${d.dx}px, ${d.dy}px) rotate(${Math.max(-6, Math.min(6, d.dx / 12))}deg)`;
  const ctr = document.getElementById('tableCenter');
  if (!ctr) return;
  const r = ctr.getBoundingClientRect();
  const hit = d.sx + d.dx > r.left - 40 && d.sx + d.dx < r.right + 40 && d.sy + d.dy < r.bottom + 60;
  ctr.classList.toggle('fx-drop-on', hit);
  d.node.classList.toggle('fx-drag-snap', hit);
}

// 悬停命中区（松手是否算「放到桌面」）
function fxDragHit() {
  const ctr = document.getElementById('tableCenter');
  const row = DRAG.row;
  if (!ctr || !row) return false;
  const r = ctr.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  const x = DRAG.sx + DRAG.dx, y = DRAG.sy + DRAG.dy;
  const inCenter = x > r.left - 60 && x < r.right + 60 && y > r.top - 60 && y < r.bottom + 60;
  const aboveHand = y < rr.top - 6;      // 只要拖出手牌区上沿即可（更宽容）
  return inCenter || aboveHand;
}

function fxBindDrag(row) {
  if (DRAG.bound || !row) return;
  DRAG.bound = true;
  DRAG.row = row;

  const onMove = (e) => {
    if (!DRAG.card || !DRAG.node) return;
    DRAG.dx = e.clientX - DRAG.sx;
    DRAG.dy = e.clientY - DRAG.sy;
    if (!DRAG.on) {
      if (Math.hypot(DRAG.dx, DRAG.dy) < 8) return;
      if (DRAG.node.classList.contains('disabled')) { fxDragDetach(); return; }
      DRAG.on = true;
      DRAG.node.classList.add('fx-drag');
      DRAG.node.style.zIndex = '60';
      document.body.classList.add('fx-dragging');
      const ctr = document.getElementById('tableCenter');
      if (ctr) ctr.classList.add('fx-drop-ready');
      sfx('ui');
    }
    if (!DRAG.raf) DRAG.raf = requestAnimationFrame(fxDragPaint);
  };

  const finish = (commit) => {
    const wasOn = DRAG.on, card = DRAG.card, hit = wasOn && fxDragHit();
    if (wasOn) S.suppressClickUntil = Date.now() + 260; // 抑制拖动结束后的 click
    fxDragDetach();
    if (!wasOn || !commit || !hit) return;
    // 落点命中后重新校验可出性：拖动途中服务端可能已推新状态
    const allowedNow = allowedCardIds();
    if (allowedNow && !allowedNow.includes(card.id)) { (sfx('deny'), toast('这张牌现在不能出', 1800)); return; }
    // ask.kind==='card' 时点牌即直接提交，不再走下面的选牌/定目标流程
    if (S.ask && S.ask.kind === 'card') { try { clickCard(card, true); } catch {} return; }
    // 放到桌面：选中该牌并尝试出牌（force=true 跳过上面刚设的 click 抑制）
    if (!S.sel.includes(card.id)) {
      try { clickCard(card, true); } catch {}
    }
    if (!S.sel.length) { (sfx('deny'), toast('这张牌现在不能出', 1800)); return; }
    const meta = currentCardMeta();
    const need = meta?.target?.min ?? 0;
    if (!need) { try { submitPlay(); } catch {} return; }
    if (!S.targets.length) {
      const auto = autoTargetSeats(card);
      if (auto.length) S.targets = auto;
    }
    if (S.targets.length >= need) { try { submitPlay(); } catch {} }
    else toast('已选中该牌，请点击目标后出牌', 2000);
  };

  DRAG.handlers = { onMove, finish };

  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button > 0) return;
    const n = e.target && e.target.closest ? e.target.closest('.card') : null;
    if (!n || !row.contains(n)) return;
    const id = String(n.dataset.cid || '');
    const card = (S.snap?.players?.[S.seat]?.hand || []).find((c) => String(c.id) === id);
    if (!card) return;
    DRAG.card = card; DRAG.node = n; DRAG.sx = e.clientX; DRAG.sy = e.clientY;
    DRAG.dx = DRAG.dy = 0; DRAG.on = false;
    // 指针移出手牌区后仍要能继续拖：监听 window
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', () => finish(true), { once: true });
    window.addEventListener('pointercancel', () => finish(false), { once: true });
  });
}

function fxTickWatch(box) {
  if (box._fxTW) return;
  box._fxTW = 1;
  box.addEventListener('animationend', (e) => { if (e.animationName === 'fx-ask-tick') box.classList.remove('fx-ask-tick'); });
  new MutationObserver(() => {
    const on = box.classList.contains('fx-ask-urgent') && !box.classList.contains('hidden');
    if (on && !FX.tickOn) { FX.tickOn = true; FX.tickN = 0; fxTickStep(box); }
    else if (!on && FX.tickOn) { FX.tickOn = false; fxCancel(FX.tickT); FX.tickT = null; box.classList.remove('fx-ask-tick'); }
  }).observe(box, { attributes: true, attributeFilter: ['class'] });
}

function fxTickStep(box) {
  FX.tickT = null;
  if (!FX.tickOn || FX.tickN >= 3) return;
  FX.tickN++;
  if (!reduceMotion()) { box.classList.remove('fx-ask-tick'); void box.offsetWidth; box.classList.add('fx-ask-tick'); }
  sfx('tick');
  FX.tickT = fxLater(() => fxTickStep(box), fxMs('--fx-t-tick', 1000));
}

function fxShowAsk(box) {
  try { fxTickWatch(box); } catch {}
  fxCancel(FX.askHideT); FX.askHideT = null;
  box.classList.remove('fx-out');
  const was = box.classList.contains('hidden');
  box.classList.remove('hidden');
  if (was) { box.classList.remove('fx-in'); void box.offsetWidth; box.classList.add('fx-in'); }
  try { fxTargetPaint(); } catch {}
}
function fxHideAsk(box) {
  try { fxTargetClear(); } catch {}
  if (box.classList.contains('hidden')) { box.classList.remove('fx-out', 'fx-in'); return; }
  if (reduceMotion()) { box.classList.add('hidden'); box.classList.remove('fx-out', 'fx-in'); return; }
  if (box.classList.contains('fx-out')) return;
  box.classList.add('fx-out');
  FX.askHideT = fxLater(() => {
    FX.askHideT = null;
    box.classList.add('hidden');
    box.classList.remove('fx-out', 'fx-in');
  }, fxMs('--t-base', 200));
}

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
  if (document.body.classList.contains('fx-dragging')) return;
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
  const marks = [];
  for (const [k, v] of Object.entries(me.marks || {})) if (v) marks.push([k, v]);
  if (me.chained) marks.push(['连环', '']);
  if (me.flags?.jiu) marks.push(['酒', me.flags.jiu]);
  if (me.flags?.shaUsed) marks.push(['已出杀', me.flags.shaUsed]);
  // 谋略值（上限 5）：有谋略值时视为拥有【妙计】，出牌阶段会多出一个「发动【妙计】」按钮
  if (me.moulue) marks.push(['谋略值', `${me.moulue}/${me.moulueMax || 5}`]);
  for (const [k, v] of marks) {
    box.appendChild(el('span', 'mark-tag', `${esc(k)}${v ? ' ' + esc(v) : ''}`));
  }
  try { fxMarkPulse(me.seat, box); } catch {}
}

// ---------------- 技能一览（含自己 + 标记数） ----------------
function openSkills() {
  const snap = S.snap;
  if (!snap?.players) return toast('对局还没开始');
  const { mask, body } = modal('技能一览', '包含全部角色（含你自己）的武将技能与标记；标记数按当前状态实时显示');
  fxSkillModal(mask);
  for (const p of snap.players) {
    const row = el('div', 'pk-row' + (p.seat === S.seat ? ' me' : '') + (p.alive ? '' : ' dead'));
    const who = el('div', 'who');
    who.innerHTML = `<b>${esc(p.name)}${p.seat === S.seat ? '（你）' : ''}</b>
      <div class="g">${esc(p.generalName || '')}</div>
      <div class="hp">${p.hp}/${p.maxHp} 体力 · 手牌 ${p.handCount}</div>`;
    const tags = [];
    for (const [k, v] of Object.entries(p.marks || {})) if (v) tags.push(`<span class="mark-tag">${esc(k)} ${esc(v)}</span>`);
    if (p.moulue) tags.push(`<span class="mark-tag status">谋略 ${esc(p.moulue)}/${esc(p.moulueMax || 5)}</span>`);
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
  const list = g.skillsDetail || [];
  if (!list.length) { body.appendChild(el('div', 'hint', '暂无技能说明')); return; }
  body.appendChild(el('div', 'hint', '技能'));
  for (const s of list) {
    const item = el('div', 'skill-item');
    item.innerHTML = `<span class="sn">【${esc(s.name)}】</span><span class="sd">${esc(s.desc || '')}</span>`;
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

// ---------------- 房主：房间内完整设置（人数 / 武将包 / 选将规则 / 双将 / 房主身份 / 各座位托管） ----------------
async function openRoomSettings(room) {
  if (!room || S.seat !== 0) return;
  const lo = Math.max(room.minPlayers || 2, 2);
  const hi = Math.max(lo, room.maxPlayers || lo);
  const st = {
    maxSeats: Math.min(hi, Math.max(lo, room.maxSeats || lo)),
    packs: new Set(room.packs && room.packs.length ? room.packs : ['standard']),
    pickMode: room.pickMode || 'random',
    pickCount: room.pickCount || 3,
    dual: !!room.dual,
    hostRole: room.hostRole || '',
    customPool: undefined,   // undefined = 不改；null = 清空
    auto: {},
    aiBrain: room.aiBrain || 'builtin',
    aiModel: room.aiModel || 'deepseek',
    aiLevel: room.aiLevel || 'low',
  };
  for (const s of room.seats || []) {
    if (!s.isAI) st.auto[s.index] = { enabled: !!s.auto, seconds: s.autoSeconds || 15 };
  }
  const { mask, body, closeRow } = modal('房间设置', '仅房主可改。改人数 / 武将包 / 选将规则会清空已选武将并重置准备状态。');

  const rebuild = () => {
    body.innerHTML = '';
    // 人数
    const row1 = el('div', 'auto-row');
    row1.innerHTML = `<label class="check">人数 <input id="rsSeats" class="sec-input" type="number" min="${lo}" max="${hi}" value="${st.maxSeats}" /> 人（本模式 ${lo}~${hi}）</label>`;
    body.appendChild(row1);
    body.querySelector('#rsSeats').oninput = (e) => {
      st.maxSeats = Math.max(lo, Math.min(hi, Number(e.target.value) || lo));
    };
    body.appendChild(el('div', 'hint', '缩小时只裁掉末尾的电脑座位；末尾有真人玩家时会提示无法缩减。'));

    // 武将包（多选）
    body.appendChild(el('div', 'hint', '武将包（可多选，至少 1 个；支持关键字搜索与全选）'));
    const packs = el('div', '');
    body.appendChild(packs);
    // onChange 传空：picker 自己会重绘 chips 与计数，不必重建整个面板（避免搜索框失焦、面板闪回顶部）
    renderPackPicker(packs, st.packs, null, st.packUi || (st.packUi = { kw: '' }));

    // 自定义将池（房间若带池，roomPool 会优先用它 → 换包不生效，这里给出清空入口）
    const poolN = st.customPool === null ? 0 : (st.customPool === undefined
      ? ((room.customPool || []).length) : st.customPool.length);
    if (poolN > 0) {
      const rowP = el('div', 'auto-row');
      rowP.innerHTML = `<span class="hint" style="margin:0">自定义将池：${poolN} 名（优先于武将包）</span>`;
      const clr = el('button', 'ghost', '清空自定义将池');
      clr.onclick = () => { st.customPool = null; rebuild(); };
      rowP.appendChild(clr);
      body.appendChild(rowP);
    } else if (st.customPool === null) {
      body.appendChild(el('div', 'hint', '已清空自定义将池（保存后按武将包选将）'));
    }

    // 选将规则
    body.appendChild(el('div', 'hint', '选将规则'));
    const pm = el('div', 'chips');
    for (const [v, label] of [['random', '随机分配'], ['draw', '抽将（几选一）'], ['host', '仅房主自选'], ['all', '所有人自选']]) {
      const c = el('div', 'chip' + (st.pickMode === v ? ' on' : ''), label);
      c.onclick = () => { st.pickMode = v; rebuild(); };
      pm.appendChild(c);
    }
    body.appendChild(pm);

    if (st.pickMode === 'draw') {
      body.appendChild(el('div', 'hint', '几选一'));
      const pc = el('div', 'chips');
      for (const n of [2, 3, 5]) {
        const c = el('div', 'chip' + (st.pickCount === n ? ' on' : ''), `${n} 选 1`);
        c.onclick = () => { st.pickCount = n; rebuild(); };
        pc.appendChild(c);
      }
      body.appendChild(pc);
    }

    // 双将
    const row2 = el('div', 'auto-row');
    row2.innerHTML = `<label class="check"><input id="rsDual" type="checkbox" ${st.dual ? 'checked' : ''}/> 双将模式（每人 2 名武将，体力平均、护甲求和）</label>`;
    body.appendChild(row2);
    body.querySelector('#rsDual').onchange = (e) => { st.dual = e.target.checked; };

    // 房主身份（身份场 / 军争）
    if (IDENTITY_MODE_IDS.includes(room.modeId)) {
      const row3 = el('div', 'auto-row');
      row3.innerHTML = `<label class="check">房主身份 <select id="rsHostRole">
        <option value="">不指定（默认主公）</option>
        <option value="lord"${st.hostRole === 'lord' ? ' selected' : ''}>主公</option>
        <option value="loyalist"${st.hostRole === 'loyalist' ? ' selected' : ''}>忠臣</option>
        <option value="rebel"${st.hostRole === 'rebel' ? ' selected' : ''}>反贼</option>
        <option value="renegade"${st.hostRole === 'renegade' ? ' selected' : ''}>内奸</option>
      </select></label>`;
      body.appendChild(row3);
      body.querySelector('#rsHostRole').onchange = (e) => { st.hostRole = e.target.value; };
    }

    // AI 大脑：电脑座位由内置启发式还是真大模型接管（密钥只在服务器，前端只看到模型名）
    body.appendChild(el('div', 'hint', '电脑玩家的 AI 大脑'));
    const provs = Object.entries(S.llm.providers || {});
    const anyReady = provs.some(([, v]) => v.ready);
    const br = el('div', 'chips');
    for (const [v, label, ready] of [
      ['builtin', '内置启发式（快，0 延迟）', true],
      ['llm', '大模型 · 真 AI（约 3~8 秒思考）', !!(S.llm.enabled && anyReady)],
    ]) {
      const c = el('div', 'chip' + (st.aiBrain === v ? ' on' : '') + (ready ? '' : ' dis'), label);
      if (ready) c.onclick = () => { st.aiBrain = v; rebuild(); };
      br.appendChild(c);
      if (!ready) c.title = '服务器未配置该模型密钥';
    }
    body.appendChild(br);

    if (st.aiBrain === 'llm') {
      body.appendChild(el('div', 'hint', '模型（只列出服务器已配密钥的）'));
      const md = el('div', 'chips');
      if (!provs.length) md.appendChild(el('div', 'hint', '服务器未配置任何大模型密钥'));
      for (const [id, info] of provs) {
        const c = el('div', 'chip' + (st.aiModel === id ? ' on' : '') + (info.ready ? '' : ' dis'), `${esc(info.label)} · ${esc(info.model)}`);
        if (info.ready) c.onclick = () => { st.aiModel = id; rebuild(); };
        md.appendChild(c);
      }
      body.appendChild(md);

      body.appendChild(el('div', 'hint', '强度'));
      const lv = el('div', 'chips');
      for (const [v, label] of [['low', '普通：只在出牌阶段思考'], ['high', '高：出牌 + 被杀/决斗等关键响应也思考']]) {
        const c = el('div', 'chip' + (st.aiLevel === v ? ' on' : ''), label);
        c.onclick = () => { st.aiLevel = v; rebuild(); };
        lv.appendChild(c);
      }
      body.appendChild(lv);
      body.appendChild(el('div', 'hint', '电脑思考时座位上会显示「思考中」，战报会记下它选了什么、为什么；接口连续失败会自动切回内置 AI，不会卡住对局。'));
    }

    // 各玩家托管时长（房主可为每个座位分别调整）
    body.appendChild(el('div', 'hint', '各玩家托管时长（房主可为每个座位单独设置；电脑座位无需托管）'));
    const list = el('div', '');
    for (const s of (room.seats || [])) {
      if (s.isAI) continue;
      if (!st.auto[s.index]) st.auto[s.index] = { enabled: !!s.auto, seconds: s.autoSeconds || 15 };
      const a = st.auto[s.index];
      const row = el('div', 'auto-row');
      row.innerHTML = `<label class="check"><input type="checkbox" ${a.enabled ? 'checked' : ''}/> 托管 ${esc(s.name)}${s.index === S.seat ? '（你）' : ''}</label>
        <label class="check"><input class="sec-input" type="number" min="5" max="180" value="${a.seconds}" /> 秒</label>`;
      const inputs = row.querySelectorAll('input');
      inputs[0].onchange = () => { a.enabled = inputs[0].checked; };
      inputs[1].oninput = () => { a.seconds = Math.max(5, Math.min(180, Number(inputs[1].value) || 15)); };
      list.appendChild(row);
    }
    body.appendChild(list);
  };
  rebuild();

  // 统一提交：config（完整字段）+ 逐座位 autoplay，最后以服务端最新状态渲染
  const submit = async (withFill) => {
    const body = {
      token: S.token, packs: [...st.packs], pickMode: st.pickMode, pickCount: st.pickCount,
      dual: st.dual, hostRole: st.hostRole || null, maxSeats: st.maxSeats,
      aiBrain: st.aiBrain, aiModel: st.aiModel, aiLevel: st.aiLevel,
    };
    if (st.customPool !== undefined) body.customPool = st.customPool;   // null = 显式清空自定义将池
    if (withFill) body.fillAI = true;
    const r = await api(`/api/rooms/${S.roomId}/config`, body);
    if (!r.ok) { toast(r.error || '保存失败', 3600); return false; }
    const fails = [];
    for (const s of (r.room?.seats || [])) {
      if (s.isAI) continue;
      const a = st.auto[s.index];
      if (!a) continue;    // 弹窗打开后才加入的座位：不动它（默认不托管）
      const x = await api(`/api/rooms/${S.roomId}/autoplay`, { token: S.token, seat: s.index, enabled: a.enabled, seconds: a.seconds });
      if (!x.ok) fails.push(`${s.name}：${x.error || '托管设置失败'}`);
    }
    let latest = r.room;
    try {   // 重新拉一次房间状态，避免用「autoplay 之前」的快照覆盖新状态
      const st2 = await api(`/api/rooms/${S.roomId}/state?token=${encodeURIComponent(S.token)}`, null, 'GET');
      if (st2?.room) latest = st2.room;
    } catch {}
    mask.remove();
    if (latest) renderRoom(latest);
    if (fails.length) toast(`设置已保存，但托管未生效：${fails.slice(0, 2).join('；')}`, 4200);
    else toast(withFill ? '已保存并用电脑补足座位' : '房间设置已更新');
    return true;
  };
  const fill = el('button', 'secondary', '保存并用电脑补足');
  fill.onclick = () => submit(true);
  const save = el('button', 'primary', '保存设置');
  save.onclick = () => submit(false);
  closeRow.insertBefore(fill, closeRow.firstChild);
  closeRow.insertBefore(save, closeRow.firstChild);
}

// ---------------- 房间内选将 ----------------
async function openPickGeneral(room) {
  const info = await refreshPickInfo();
  const applied = (info?.chosen || []).slice();
  const mode = info?.pickMode || room.pickMode;
  const need = Math.max(1, info?.generalCount || ((info?.dual ?? room.dual) ? 2 : 1));
  const isDraw = mode === 'draw';
  // 服务端 candidates 是武将 id 数组，pool 是武将对象数组；统一成对象再渲染
  const poolList = (info?.pool || []).filter(g => g && typeof g === 'object');
  const poolById = new Map(poolList.map(g => [g.id, g]));
  const candList = (info?.candidates || [])
    .map(c => (typeof c === 'string' ? (poolById.get(c) || { id: c, name: c }) : c))
    .filter(Boolean);
  const list = (isDraw ? candList : poolList)
    .slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
  const used = new Set(room.seats
    .filter(s => s.index !== S.seat)
    .flatMap(s => (s.generalIds && s.generalIds.length ? s.generalIds : (s.generalId ? [s.generalId] : []))));
  const tip = isDraw
    ? `抽将：你抽到 ${list.length} 名候选，请从中选 ${need} 个（双将选 2 个），选定后本局不可更换`
    : `本房间将池 ${list.length} 名（按所选武将包 / 自定义将池生成），已被他人选走的不可再选；请选 ${need} 个`;
  const { mask, body } = modal('选择我的武将', tip);
  let sel = applied.slice(0, need);

  if (!list.length) {
    body.appendChild(el('div', 'hint', isDraw ? '候选为空（将池人数不足），请让房主调整武将包或改为随机。' : '将池为空，请让房主调整武将包或此将池。'));
  }
  // 武将详情索引：meta 里含 skillsDetail / 包信息，pick-info 的 pool 只有精简字段
  const metaById = new Map(((S.meta && S.meta.generals) || []).map(g => [g.id, g]));
  const detailOf = (g) => {
    const m = metaById.get(g.id) || {};
    return { ...m, ...g, pack: g.pack || m.pack, skillsDetail: m.skillsDetail || [] };
  };
  // 搜索框：名称 / 势力 / 技能名（含技能描述）/ 包 / 出处
  const searchBox = document.createElement('input');
  searchBox.className = 'pool-search';
  searchBox.type = 'search';
  searchBox.placeholder = '搜索：名称 / 势力 / 技能 / 包 / 出处（如 OL、神话再临）';
  let kw = '';
  const grid = el('div', 'pool-grid');
  const confirmBtn = el('button', 'primary', '确认选择');
  const render = () => {
    grid.innerHTML = '';
    // 支持多个关键词（空格 / 逗号 / 顿号分隔），需全部命中
    const terms = (searchBox.value || '').trim().toLowerCase()
      .split(/[\s,，、]+/).filter(Boolean);
    const shown = [];
    for (const g of list) {
      if (terms.length) {
        const m = metaById.get(g.id) || {};
        const hay = [
          g.name, m.name, g.kingdom, m.kingdom,
          g.pack, m.pack, packName(g.pack), packName(m.pack),
          ...(m.skillsDetail || []).map(x => x.name),
          ...(m.skillsDetail || []).map(x => x.desc || ''),
          ...(g.skills || []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!terms.every(t => hay.includes(t))) continue;
      }
      shown.push(g);
    }
    if (!grid._fxInit) { grid._fxInit = 1; queueMicrotask(() => { grid._fxDone = 1; }); }
    for (const g of shown) {
      const taken = used.has(g.id);
      const on = sel.includes(g.id);
      const it = el('div', 'pool-item' + (taken ? ' dis' : '') + (on ? ' on' : ''));
      if (!grid._fxDone && !reduceMotion()) {
        it.classList.add('fx-pick-in');
        it.style.setProperty('--fx-i', String(Math.min(grid.children.length, 16)));
        it.addEventListener('animationend', () => { it.classList.remove('fx-pick-in'); it.style.removeProperty('--fx-i'); }, { once: true });
      }
      const info = detailOf(g);
      it.innerHTML = `<div class="pg-name">${esc(g.name)}${taken ? '<span class="pg-taken">已被选</span>' : ''}</div>`
        + `<div class="pg-meta">${esc(info.kingdom || '')} · ${esc(String(info.hp || '?'))} 体力 · ${esc(packName(info.pack))}</div>`
        + `<div class="pg-skills">${esc((info.skillsDetail || []).map(x => x.name).join(' / ') || (g.skills || []).join(' / '))}</div>`;
      it.title = taken ? '已被其他座位选择' : '右键 / 长按查看技能详情';
      it.dataset.gid = g.id;
      const openDetail = () => openGeneralDetail(detailOf(g));
      it.addEventListener('contextmenu', (e) => { e.preventDefault(); openDetail(); });
      let pressTimer = null;
      let pressAt = 0;
      it.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => {
          pressTimer = null;
          pressAt = Date.now();
          it.dataset.longpress = '1';
          openDetail();
        }, 480);
      }, { passive: true });
      const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
      it.addEventListener('touchend', cancelPress);
      it.addEventListener('touchmove', cancelPress);
      it.addEventListener('touchcancel', cancelPress);
      if (!taken) {
        it.onclick = () => {
          // 长按刚打开详情时吞掉这次 click，避免误选；超过 1.5s 视为残留标记，正常处理
          if (it.dataset.longpress === '1') {
            delete it.dataset.longpress;
            if (Date.now() - pressAt < 1500) return;
          }
          if (on) sel = sel.filter(x => x !== g.id);
          else {
            if (sel.length >= need) { toast(`最多选 ${need} 个`); return; }
            sel = sel.concat(g.id);
          }
          render();
        };
      }
      grid.appendChild(it);
    }
    if (!shown.length) grid.appendChild(el('div', 'hint', `没有匹配「${searchBox.value}」的武将`));
    confirmBtn.disabled = sel.length !== need;
    confirmBtn.textContent = sel.length === need
      ? `确认选择（${sel.length}/${need}）`
      : `还需选 ${need - sel.length} 个（已选 ${sel.length}/${need}）`;
  };
  searchBox.oninput = render;
  render();
  body.appendChild(searchBox);
  body.appendChild(grid);
  confirmBtn.style.marginTop = '10px';
  confirmBtn.onclick = async () => {
    const r = await api(`/api/rooms/${S.roomId}/pick`, { token: S.token, generalIds: sel });
    if (r.ok) {
      mask.remove();
      S.pickInfo = null;
      await refreshPickInfo();
      renderRoom(r.room || S.room);
      toast('已选择 ' + sel.map(generalNameOf).join(' + '));
    } else toast(r.error || '选择失败', 3200);
  };
  body.appendChild(confirmBtn);
  body.appendChild(el('div', 'hint', isDraw
    ? '候选由系统抽取，选定后本局不可更换；想换候选需房主改配置或重开房间。'
    : '不在这里选也可以：开局时系统会为未选的座位随机分配剩余武将。'));
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
// 自己区高度会随「手牌增减 / 动作栏增删按钮」变化，用 ResizeObserver 持续同步，
// 否则询问面板底边用的是旧高度，会压住手牌或按钮。
try {
  const selfEl = $('#selfArea');
  if (selfEl && window.ResizeObserver) {
    const ro = new ResizeObserver(() => syncAskOffset());
    ro.observe(selfEl);
    S.__selfRO = ro;
  }
} catch {}

function switchView(v) {
  S.view = v;
  if (v !== 'table') { fxReset(); clearInterval(S.timer); }
  const fxRoomHid = $('#room').classList.contains('hidden');
  for (const id of ['lobby', 'room', 'table']) {
    $('#' + id).classList.toggle('hidden', id !== v);
  }
  if (v === 'room' && fxRoomHid) { try { fxRoomIn(); } catch {} }
  if (v === 'table' && !S.logTouched) S.logOpen = !isMobileLayout();
  $('#btnLog').classList.toggle('hidden', v !== 'table');
  $('#btnSkills').classList.toggle('hidden', v !== 'table');
  $('#btnAuto').classList.toggle('hidden', v !== 'table');
  setLogOpen(S.logOpen);
  syncAskOffset();
}

async function showRoom(room) {
  switchView('room');
  renderRoom(room);
  connect();
  await refreshPickInfo();
  if (S.room) renderRoom(S.room);
}

// 拉取本人的选将信息（draw 的候选 / all·host 的全池 / 已选武将）
async function refreshPickInfo() {
  if (!S.roomId || !S.token) return null;
  const r = await api(`/api/rooms/${S.roomId}/pick-info`, { token: S.token });
  if (r && r.ok) { S.pickInfo = r; S.hostRole = r.hostRole || null; }
  return S.pickInfo;
}

const PICK_MODE_CN = { random: '随机分配', draw: '抽将', all: '所有人自选', host: '仅房主自选' };

function renderRoom(room) {
  if (!room || !room.seats) return;
  S.room = room;
  const nextNo = (room.round || 0) + 1;
  $('#roomTitle').textContent = `房间 ${room.id} · ${room.modeName}（${room.seats.length}/${room.maxSeats}）· 第 ${nextNo} 局${room.status === 'ended' ? '（待准备）' : ''}`;
  const box = $('#roomSeats');
  box.innerHTML = '';
  const fxPrevRdy = FX.seatReady, fxNextRdy = new Map();
  let fxSi = 0;
  for (const s of room.seats) {
    const c = el('div', 'seatcard' + (s.online ? '' : ' off') + (s.ready ? ' ready' : ''));
    c.dataset.seat = String(s.index);
    const ids = s.generalIds && s.generalIds.length ? s.generalIds : (s.generalId ? [s.generalId] : []);
    const gm = s.generalNames && s.generalNames.length ? s.generalNames.join(' + ') : (ids.length ? ids.map(generalNameOf).join(' + ') : (s.generalName || '待分配'));
    c.innerHTML = `<div class="n">${esc(s.name)}${s.isAI ? '（电脑）' : ''}${s.index === S.seat ? '（你）' : ''}${s.auto ? ` · 托管 ${s.autoSeconds || 15}s` : ''}</div>
      <div class="g">${esc(gm)}</div>
      ${(room.round || 0) > 0 && !s.isAI ? `<div class="rdy">${s.ready ? '✔ 已准备' : '… 未准备'}</div>` : ''}
      <div class="think"></div>`;
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
  syncAiThinking();
  FX.seatReady = fxNextRdy;
  // 房间配置与选将入口
  const cfg = $('#roomConfig');
  if (cfg) {
    cfg.innerHTML = '';
    const packs = (room.packs || []).map(p => packName(p)).join(' + ');
    const bits = [`武将包：${packs}`, `选将：${PICK_MODE_CN[room.pickMode] || '随机分配'}`];
    if (room.pickMode === 'draw') bits.push(`几选一：${room.pickCount || 3} 选 1`);
    bits.push(room.dual ? '双将' : '单将');
    if (room.customPool && room.customPool.length) bits.push(`自定义将池 ${room.customPool.length} 名`);
    if (room.aiBrain === 'llm') {
      const pv = (S.llm.providers || {})[room.aiModel];
      const nm = pv?.label || (room.aiModel === 'glm' ? 'GLM' : 'DeepSeek');
      bits.push(`电脑 AI：${nm}${pv?.model ? ' · ' + pv.model : ''}（${room.aiLevel === 'high' ? '高强度' : '普通'}）`);
    } else {
      bits.push('电脑 AI：内置');
    }
    if (S.seat === 0 && IDENTITY_MODE_IDS.includes(room.modeId)) {
      bits.push(`房主身份：${S.hostRole ? roleCN(S.hostRole) : '主公（默认）'}`);
    }
    cfg.appendChild(el('div', 'hint', bits.join('　')));
    const my = room.seats.find(s => s.index === S.seat);
    const isHost = S.seat === 0;
    const canPick = room.status !== 'playing'
      && (room.pickMode === 'all' || room.pickMode === 'draw' || (room.pickMode === 'host' && isHost));
    if (canPick) {
      const chosen = (S.pickInfo?.chosen || my?.generalIds || []).map(generalNameOf).filter(Boolean);
      const b = el('button', 'secondary', chosen.length ? `我的武将：${chosen.join(' + ')}（点击更换）` : '选择我的武将');
      b.id = 'btnPickGeneral';
      b.onclick = () => openPickGeneral(room);
      cfg.appendChild(b);
    } else if (room.pickMode === 'host' && S.seat !== 0) {
      cfg.appendChild(el('div', 'hint', '本房间仅房主可选将，其他座位随机分配。'));
    } else if (room.pickMode === 'random') {
      cfg.appendChild(el('div', 'hint', '随机分配：开局时由系统为每个座位发将。'));
    }
    if (S.seat === 0 && room.status !== 'playing') {
      const b = el('button', 'secondary', '房间设置（人数/武将包/选将/双将/托管）');
      b.id = 'btnRoomSettings';
      b.onclick = () => openRoomSettings(room);
      cfg.appendChild(b);
    }
    if (S.seat === 0 && IDENTITY_MODE_IDS.includes(room.modeId) && room.status !== 'playing') {
      const b = el('button', 'secondary', '设置我的身份');
      b.id = 'btnHostRole';
      b.onclick = () => openHostRole();
      cfg.appendChild(b);
    }
  }
  // 房主开始 / 全员准备
  const isHost = S.seat === 0 && room.seats.length > 0;
  const startBtn = $('#btnStart');
  startBtn.style.display = isHost ? '' : 'none';
  if ((room.round || 0) === 0) {
    startBtn.textContent = '开始对局';
    startBtn.disabled = false;
    startBtn.title = '';
  } else {
    const humans = room.seats.filter(s => !s.isAI);
    const notReady = humans.filter(s => !s.ready).length;
    startBtn.textContent = notReady ? `开始第 ${nextNo} 局（等待 ${notReady} 人准备）` : `开始第 ${nextNo} 局`;
    startBtn.disabled = notReady > 0;
    startBtn.title = notReady ? `还有 ${notReady} 人未准备` : '';
  }
  const rdy = $('#btnReady');
  if (rdy) {
    const show = (room.round || 0) > 0 && S.seat != null;
    const myReady = !!room.seats.find(s => s.index === S.seat)?.ready;
    rdy.className = (myReady ? 'secondary on' : 'secondary') + (show ? '' : ' hidden');
    rdy.textContent = myReady ? '取消准备' : '我已准备';
  }
}

// ============ AI 大模型（真 AI 玩家）的思考过程 ============
// 服务端 ai-think 事件的四态：start 开始思考 / done 选定动作 / miss 未给出可用决策 / dead 熔断降级
// 目的：把「为什么这局有点慢」变成「看到了电脑在想什么」，而不是空等
let aiTickTimer = null;

function aiSeatName(seat) {
  return S.room?.seats?.find(s => s.index === seat)?.name || `座 ${seat + 1}`;
}

function syncAiThinking() {
  const on = S.aiThink || {};
  const now = Date.now();
  for (const k of Object.keys(on)) if (now - on[k].since > 40000) delete on[k];   // 防残留（服务端异常时不会一直显示思考中）
  const seats = Object.keys(on);
  // ① 房间视图：座位卡片上的小字
  for (const card of document.querySelectorAll('#roomSeats .seatcard')) {
    const t = card.querySelector('.think');
    if (!t) continue;
    const info = on[card.dataset.seat];
    if (info) {
      const sec = Math.round((now - info.since) / 1000);
      t.textContent = `🤖 大模型思考中${sec ? ` ${sec}s` : '…'}`;
      t.classList.add('on');
    } else {
      t.textContent = '';
      t.classList.remove('on');
    }
  }
  // ② 桌面视图：中央提示（对局中座位卡片不可见，靠这里看是谁在想）
  const hint = document.querySelector('#aiThinkHint');
  if (hint) {
    if (seats.length) {
      const info = on[seats[0]];
      const sec = Math.round((now - info.since) / 1000);
      hint.textContent = `🤖 ${aiSeatName(Number(seats[0]))} 正在思考${sec ? `（${sec}s）` : '…'}`;
      hint.classList.add('on');
    } else {
      hint.textContent = '';
      hint.classList.remove('on');
    }
  }
}

function aiThinkTick() {
  if (!Object.keys(S.aiThink || {}).length) {
    if (aiTickTimer) { clearInterval(aiTickTimer); aiTickTimer = null; }
  }
  syncAiThinking();
}

function handleAiThink(ev) {
  if (!ev || !Number.isFinite(ev.seat)) return;
  if (!S.aiThink) S.aiThink = {};
  if (ev.phase === 'start') {
    S.aiThink[ev.seat] = { since: Date.now(), tag: ev.tag || 'play', count: ev.count || 0 };
    if (!aiTickTimer) aiTickTimer = setInterval(aiThinkTick, 1000);
  } else {
    delete S.aiThink[ev.seat];
  }
  syncAiThinking();
  if (ev.phase === 'start') return;
  const nm = aiSeatName(ev.seat);
  const sec = ((ev.ms || 0) / 1000).toFixed(1);
  if (ev.phase === 'done') {
    addLog({ text: `🤖 ${nm} 想了 ${sec}s → ${ev.label}${ev.why ? `（${ev.why}）` : ''}` });
  } else if (ev.phase === 'miss') {
    addLog({ text: `🤖 ${nm} 大模型未给出可用决策（${ev.reason || '未知'}），本次改用内置 AI` });
  } else if (ev.phase === 'dead') {
    addLog({ text: `⚠ ${nm} 的大模型连续 ${ev.count || 3} 次失败，本局改由内置 AI 接管` });
  }
}

function generalNameOf(id) {
  return (S.meta?.generals || []).find(g => g.id === id)?.name || id;
}

// 房主自选身份（身份场 / 军争）：开局时房主固定为该身份，其余身份随机分配
async function openHostRole() {
  const cur = S.hostRole || '';
  const { mask, body } = modal('设置房主身份', '仅房主可用。选定后开局时你固定为该身份（若当前人数下没有该身份，则回退为主公）；其余身份随机分配。');
  const grid = el('div', 'chips');
  const opts = [['', '不指定（默认主公）'], ['lord', '主公'], ['loyalist', '忠臣'], ['rebel', '反贼'], ['renegade', '内奸']];
  for (const [v, label] of opts) {
    const c = el('div', 'chip' + (cur === v ? ' on' : ''), label);
    c.dataset.role = v || 'none';
    c.onclick = async () => {
      const r = await api(`/api/rooms/${S.roomId}/config`, { token: S.token, hostRole: v || null });
      if (r.ok) {
        mask.remove();
        S.hostRole = v || null;
        renderRoom(r.room || S.room);
        toast(`房主身份：${label}`);
      } else toast(r.error || '设置失败', 3200);
    };
    grid.appendChild(c);
  }
  body.appendChild(grid);
  body.appendChild(el('div', 'hint', '提示：其他人看不到这里的选择，开局后按正常身份明暗规则显示。'));
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
  es.addEventListener('room', (e) => {
    const room = JSON.parse(e.data);
    S.room = room;
    // 服务器重启（部署更新）后房间已被保留，但对局无法续接 —— 必须明确告诉玩家发生了什么
    if (room.interrupted && !S.interruptShown) {
      S.interruptShown = true;
      toast('服务器已更新，房间已为你保留；本局需要重新准备后开局', 8000);
      addLog({ text: '📢 服务器已更新：房间保留，上一局已中断，请重新准备开局' });
    }
    if (!room.interrupted) S.interruptShown = false;
    // 房间视图随时保持最新（准备状态 / 选将 / 局数都与它相关）；对局中桌面由 state 驱动
    if (!$('#room').classList.contains('hidden')) renderRoom(room);
  });
  es.addEventListener('state', (e) => { S.snap = JSON.parse(e.data); if (S.snap?.players) { switchView('table'); renderTable(); } });
  es.addEventListener('log', (e) => { addLog(JSON.parse(e.data)); });
  es.addEventListener('ai-think', (e) => { try { handleAiThink(JSON.parse(e.data)); } catch {} });
  es.addEventListener('notice', (e) => {
    let d = {};
    try { d = JSON.parse(e.data); } catch {}
    const text = d.text || '服务器即将更新，房间会自动保留';
    toast(text, 8000);
    addLog({ text: `📢 ${text}` });
  });
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
  // v2：牌堆数改到中央岛左下角徽标（≤10 张转琥珀色提醒）
  const dk = document.getElementById('deckInfo');
  if (dk) {
    dk.textContent = `牌堆 ${snap.deckCount}`;
    dk.classList.toggle('low', Number(snap.deckCount) <= 10);
  }
  const me = S.seat != null ? snap.players[S.seat] : null;
  const opp = $('#opponents');
  opp.innerHTML = '';
  // v2：桌面按「网杀」三栏排布——对手分左右两列竖排，1 人时放中栏顶部。
  //   这些类只在 ≥761px 的媒体查询里生效（display:contents 把 #opponents 拆开），手机上不起作用。
  const others = snap.players.filter((p) => !(me && p.seat === S.seat));
  const half = others.length >= 3 ? Math.ceil(others.length / 2) : (others.length === 2 ? 1 : 0);
  others.forEach((p, i) => {
    const card = playerCard(p, snap);
    if (others.length === 1) card.classList.add('opp-t');
    else card.classList.add(i < half ? 'opp-l' : 'opp-r');
    opp.appendChild(card);
  });
  if (me) {
    const canSelf = isTargetSelectable(me);
    const si = $('#selfInfo');
    const autoTxt = S.autoCfg?.enabled ? ` · <span style="color:#7f8fa8">托管 ${S.autoCfg.seconds}s</span>` : '';
    const myRole = me.role ? `<b class="myrole" title="你的身份">${roleCN(me.role)}</b> · ` : '';
    si.innerHTML = `${myRole}你将 <b>${esc(me.generalName)}</b> · <span class="fx-hpnum">${me.hp}/${me.maxHp}</span> 体力${armorText(me)}${me.moulue ? ` · <b style="color:#7dd3a8">${me.moulue}/${me.moulueMax || 5}</b> 谋略` : ''}${me.gong ? ` · <b style="color:#d8b46a">${me.gong}</b> 工` : ''}${me.extraZone && me.extraZone.tianji ? ` · <b style="color:#c084fc">${me.extraZone.tianji}</b> 天机` : ''}${me.extraZone && me.extraZone.mou ? ` · <b style="color:#f472b6">${me.extraZone.mou}</b> 谋` : ''} · 手牌 ${me.handCount} · ${snap.currentIndex === me.seat ? '<b style="color:#d8b46a">你的回合</b>' : '等待中'}${me.chained ? ' · 连环' : ''}${autoTxt}`
      + (canSelf ? ' · <b style="color:#d8b46a">点此选自己</b>' : '');
    si.classList.toggle('targetable', canSelf);
    si.classList.toggle('picked', canSelf && S.targets.includes(me.seat));
    // v2：自己回合金线 / 需要我操作时高亮主按钮
    const sa = document.getElementById('selfArea');
    if (sa) {
      sa.classList.toggle('my-turn', snap.currentIndex === me.seat);
      sa.classList.toggle('need-act', !!(S.ask && S.ask.kind && (S.ask.seat == null || S.ask.seat === me.seat)));
    }
    si.onclick = canSelf ? (() => toggleTarget(me.seat)) : null;
    renderSelfEquips(me);
    renderHand(me);
  }
  const cur = snap.players[snap.currentIndex];
  $('#phaseInfo').innerHTML = cur ? `当前回合：<b>${esc(cur.name)}</b>（${esc(cur.generalName)}）` : '';
  $('#discardInfo').textContent = `弃牌堆 ${snap.discardCount} 张`;
  // v2：他人打出的牌 → 桌面中央显示牌面（自己的出牌已有手牌飞出动画）
  try { fxOppPlay(snap); } catch {}
  // v2：行动者在横滑条里可能跑到屏外 → 渲染后把它滚进可视区
  try { fxScrollActiveIntoView(); } catch {}
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
}

// 护甲文案：有上限显示 x/y，无上限只显示 x；护甲为 0 但上限 > 0（被打光）时也要显示，这是关键信息
function armorText(p, withLabel = true) {
  const cur = Number(p.armor || 0);
  const max = Number(p.armorMax || 0);
  if (!(cur > 0 || max > 0)) return '';
  const v = max > 0 ? `${cur}/${max}` : `${cur}`;
  return ` · <b class="fx-arnum" style="color:#8fc7ff">${v}</b>${withLabel ? ' 护甲' : ''}`;
}

// 标记（marks）中文名：未列出的 key 原样显示；对象/数组/布尔型标记属于内部记账，不在卡片上展示
const MARK_CN = {
  yong: '勇', longwei: '龙威', longyu: '龙谕', xingzhi: '星之识', leiyin: '雷之印',
  mozhiyu: '魔之谕', mozhiwu: '魔之武', yuechen: '月之尘', yue: '☽',
  huan: '武将牌', huaxing: '化形', xinzhiyu: '心之谕', lieying: '烈影', xiang: '月相',
  zengfu: '增幅', san: '散', tianshaCount: '天杀次数', shanliang: '闪量',
};
function markEntries(p) {
  const out = [];
  for (const [k, v] of Object.entries(p.marks || {})) {
    if (!v) continue;
    if (k === 'gong') continue;                        // 「工」单独用中文显示
    if (typeof v === 'object' || typeof v === 'boolean') continue;   // 内部记账，不上卡面
    // 月标记：显示为 ☽ 当前值/上限（上限来自武将数据的 moonMax）
    if (k === 'yue') { out.push(['☽', `${v}/${p.moonMax || 10}`]); continue; }
    const label = MARK_CN[k] || k;
    out.push([label, v]);
  }
  return out;
}

function phaseCN(p) {
  return { prepare: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束' }[p] || '—';
}

function playerCard(p, snap) {
  const c = el('div', 'pcard' + (p.alive ? '' : ' dead') + (snap.currentIndex === p.seat ? ' active' : ''));
  c.dataset.seat = String(p.seat);
  if (isTargetSelectable(p)) {
    c.classList.add('targetable');
    c.onclick = () => toggleTarget(p.seat);
    // v2：选中用 class（内联 outline 会被特效类覆盖）
    c.classList.toggle('picked', S.targets.includes(p.seat));
  }
  const hpDots = Array.from({ length: p.maxHp }, (_, i) => `<i class="hpdot${i < p.hp ? ' on' : ''}"></i>`).join('');
  // v2：行动者金环、低血红边（让「谁在行动 / 谁快死了」一眼可见）
  c.classList.toggle('active', snap.currentIndex === p.seat);
  c.classList.toggle('low', p.alive !== false && p.hp > 0 && p.hp <= 1);
  const roleTag = p.role ? `<div class="role${snap.over ? ' shown' : ''}">${roleCN(p.role)}</div>` : '';
  const markTags = [];
  for (const [label, v] of markEntries(p)) {
    markTags.push(`<span class="mark-tag">${esc(label)} ${esc(v)}</span>`);
  }
  if (p.gong) markTags.push(`<span class="mark-tag status">工 ${esc(p.gong)}</span>`);
  if (p.extraZone && p.extraZone.tianji) markTags.push(`<span class="mark-tag z-tianji">天机 ×${esc(p.extraZone.tianji)}</span>`);
  if (p.extraZone && p.extraZone.mou) markTags.push(`<span class="mark-tag z-mou">谋 ×${esc(p.extraZone.mou)}</span>`);
  if (p.moulue) markTags.push(`<span class="mark-tag status">谋略 ${esc(p.moulue)}/${esc(p.moulueMax || 5)}</span>`);
  if (p.chained) markTags.push('<span class="mark-tag status">连环</span>');
  if (p.flags?.jiu) markTags.push(`<span class="mark-tag status">酒 ×${esc(p.flags.jiu)}</span>`);
  c.innerHTML = `${roleTag}
    <div class="pn"><span>${esc(p.name)}</span><span class="pk">${esc(p.kingdom || '')}</span></div>
    <div class="pg">${esc(p.generalName)}</div>
    <div class="hpbar">${hpDots}</div>${p.armor > 0 || p.armorMax > 0 ? `<div class="armorbar" title="护甲：受到伤害时先扣护甲"><span class="shield">🛡</span>${p.armor}${p.armorMax ? `<i>/${p.armorMax}</i>` : ''}</div>` : ''}    <div class="meta"><span>手牌 ${p.handCount}</span>${typeof p.distance === 'number' ? `<span>距离 ${p.distance}</span>` : ''}</div>
    <div class="eq-row"></div>`;
  const eqRow = c.querySelector('.eq-row');
  let anyEq = false;
  const fxEk = (slot, x) => `${slot}|${x.id ?? `${x.name}|${x.suit}|${x.num}`}`;
  const fxJk = (z) => String(z.id ?? `${z.name}|${z.suit}|${z.num}`);
  let fxENew = new Set(), fxJNew = new Set();
  try {
    fxENew = fxNewKeys('lastPEq', p.seat, EQUIP_SLOTS.filter(([s]) => p.equips?.[s]).map(([s]) => fxEk(s, p.equips[s])));
    fxJNew = fxNewKeys('lastJudge', p.seat, (p.judgeZone || []).map(fxJk));
  } catch {}
  // 装备入槽 / 判定牌入区：音效不受 reduced-motion 影响，独立派发（sfx 内部自带限流与合并）
  if (fxENew.size) sfx('equip');
  if (fxJNew.size) sfx('judge');
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
  const armorTxt = (p.armor || p.armorMax) ? ` · 护甲 ${p.armorMax > 0 ? `${p.armor}/${p.armorMax}` : p.armor}` : '';
  const { mask, body } = modal(`${p.name} · ${p.generalName}`, `${p.hp}/${p.maxHp} 体力${armorTxt} · 手牌 ${p.handCount}${p.chained ? ' · 连环' : ''}`);
  fxSkillModal(mask);
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
  row.classList.toggle('fx5-hand', fxPlay);
  for (const c of me.hand || []) {
    const meta = S.cards[c.name] || {};
    const d = el('div', 'card' + (meta.type === 'equip' ? ' equip' : meta.type === 'trick' ? ' trick' : ''));
    const isTz = c.__tz === 'tianji';
    const isMou = !!c.__mou;
    if (isTz) d.classList.add('z-tianji');
    if (isMou) d.classList.add('z-mou');
    d.dataset.cid = String(c.id);
    if (allowed && !allowed.includes(c.id)) d.classList.add('disabled');
    if (S.sel.includes(c.id)) d.classList.add('sel');
    if (row.classList.contains('fx-has-sel') || (S.ask?.kind === 'play' && S.snap && S.seat != null && S.snap.currentIndex === S.seat)) {
      d.classList.add(!allowed || allowed.includes(c.id) ? 'fx-playable' : 'fx-mute');
    }
    const red = c.suit === 'heart' || c.suit === 'diamond';
    const kindTxt = isTz ? '天机' : isMou ? '谋' : typeCN(meta.type);
    d.innerHTML = `<div class="cs ${red ? 'red' : 'black'}">${{ spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[c.suit] || ''}${c.num}</div>
      <div class="cn">${meta.cn || c.name}</div><div class="ct${isTz ? ' tz' : isMou ? ' mou' : ''}">${kindTxt}</div>`;
    d.onclick = () => clickCard(c);
    bindCardTip(d, () => c);
    row.appendChild(d);
  }
  try { fxFlipPlay(row, row._fxOld, me); } catch {}
  row._fxOld = null;
  try { fxDrawIn(me); } catch {}
  try { fxTargetPaint(); } catch {}
  // v2：手牌较多时自动重叠，保证每张仍有 ≥50px 可点宽度
  row.classList.toggle('fx-overlap', row.children.length >= 7);
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

// D1：新进手牌从中央牌堆飞入
function fxDrawIn(me) {
  const ids = (me.hand || []).map(c => String(c.id));
  const prev = FX.lastHand;
  FX.lastHand = new Set(ids);
  if (!prev || reduceMotion()) return;
  const fresh = ids.filter(id => !prev.has(id));
  if (fresh.length) sfx('draw');
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
    mask.style.pointerEvents = 'none'; // 淡出期间不再拦截后续点击/长按
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

function typeCN(t) { return { basic: '基本', trick: '锦囊', equip: '装备' }[t] || ''; }

function renderActions(me) {
  const bar = $('#actionBar');
  const fxWasEmpty = !bar.children.length;
  bar.innerHTML = '';
  queueMicrotask(() => {
    if (fxWasEmpty && bar.children.length && !reduceMotion()) fxOnce(bar, 'fx-bar-in', fxMs('--t-base', 200) + 80);
  });
  if (S.ask?.kind === 'play') {
    // 【丈八蛇矛】选牌模式：只保留「取消 / 结束出牌」，避免误触只用第一张牌出牌
    if (S.zbMode) {
      bar.appendChild(el('div', 'hint', `丈八蛇矛：已选 ${S.sel.length}/2 张${S.sel.length === 2 ? '，请点击上方玩家选择目标' : '，再点一张手牌'}`));
      const bz = el('button', 'ghost', '取消丈八');
      bz.onclick = () => { S.zbMode = false; S.sel = []; S.targets = []; renderTable(); };
      bar.appendChild(bz);
      const bend = el('button', 'secondary', '结束出牌');
      bend.onclick = () => submit({ endPhase: true });
      bar.appendChild(bend);
      return;
    }
    const card = S.sel.length === 1 ? (me.hand || []).find(c => c.id === S.sel[0]) : null;
    const nameOf = (s) => (S.snap?.players || []).find(p => p.seat === s)?.name || `座位${s}`;
    if (card) {
      const auto = autoTargetSeats(card);
      let txt = auto.length
        ? `目标已自动选择：${auto.map(nameOf).join('、')}`
        : (S.targets.length ? `已选目标：${S.targets.map(nameOf).join('、')}` : '请点击上方玩家选择目标');
      const needLeft = Math.max(0, (S.cards[card.name]?.target?.min ?? 0) - S.targets.length);
      if (!auto.length && needLeft > 0) txt += ` · 还需选择 ${needLeft} 个`;
      bar.appendChild(el('div', 'hint', txt));
    }
    const b1 = el('button', 'primary', '确定出牌');
    b1.onclick = () => submitPlay();
    const b2 = el('button', 'secondary', '结束出牌');
    b2.onclick = () => submit({ endPhase: true });
    bar.appendChild(b1); bar.appendChild(b2);
    // 【丈八蛇矛】：装备了武器时提供「两张手牌当【杀】」的入口
    //   （引擎侧已支持 useCard extraCards + respondCard 双牌响应，这里只是人类玩家的操作入口）
    if (me.equips && me.equips.weapon && me.equips.weapon.name === 'zhangba') {
      const bz = el('button', 'secondary', '丈八·两张当杀');
      bz.title = '【丈八蛇矛】：将两张手牌当【杀】使用';
      bz.onclick = () => { S.zbMode = true; S.sel = []; S.targets = []; renderTable(); };
      bar.appendChild(bz);
    }
    // 重铸（【铁索连环】等）：弃置此牌并摸一张，不视为使用
    if (card && S.cards?.[card.name]?.recast) {
      const br = el('button', 'secondary', '重铸（弃置摸一张）');
      br.title = '重铸：弃置这张牌并摸一张牌，不视为使用（铁索连环的常规用法）';
      br.onclick = () => submit({ cardId: card.id, recast: true });
      bar.appendChild(br);
    }
    // 手机：技能按钮省掉「发动」二字，避免动作栏一排挤满（挤满会换行→顶掉手牌与按钮）
    const compactSkill = isMobileLayout();
    for (const sk of me.activeSkills || []) {
      const b = el('button', '', compactSkill ? `【${sk.name}】` : `发动【${sk.name}】`);
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
  // 丈八蛇矛：选满两张后，目标规则与【杀】一致（可选其他存活角色）
  if (S.zbMode && S.ask?.kind === 'play') return p.alive && p.seat !== S.seat && S.sel.length === 2;
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

// 目标引导三态（fx5）：候选=蓝色呼吸环 / 已选=金色锁定环 / 不可选=压暗
// 只在"正在选目标"时生效，避免无谓地压暗全场
function fxTargetMode() {
  if (S.ask?.kind === 'targets') return true;
  if (S.zbMode && S.ask?.kind === 'play') return S.sel.length === 2;
  if (S.ask?.kind === 'play' && S.sel.length === 1) {
    const meta = currentCardMeta();
    return !!(meta && meta.target && (meta.target.min || 0) > 0);
  }
  return false;
}
function fxTargetPaint() {
  if (reduceMotion() || !fxTargetMode()) { fxTargetClear(); return; }
  for (const p of (S.snap?.players || [])) {
    const node = fxSeatNode(p.seat);
    if (!node) continue;
    node.classList.remove('fx5-target-ok', 'fx5-target-picked', 'fx5-target-no');
    const picked = (S.targets || []).includes(p.seat);
    if (picked) node.classList.add('fx5-target-picked');
    else node.classList.add(isTargetSelectable(p) ? 'fx5-target-ok' : 'fx5-target-no');
  }
}
function fxTargetClear() {
  document.querySelectorAll('.fx5-target-ok,.fx5-target-picked,.fx5-target-no')
    .forEach(n => n.classList.remove('fx5-target-ok', 'fx5-target-picked', 'fx5-target-no'));
}

function toggleTarget(seat) {
  if (S.zbMode && S.ask?.kind === 'play') {
    if (S.sel.length !== 2) return toast('请先选择两张手牌', 1600);
    const who = (S.snap?.players || []).find(p => p.seat === seat);
    if (!who || !who.alive || seat === S.seat) return;
    S.targets = [seat];
    renderTable();
    submitZhangba();
    return;
  }
  if (S.ask?.kind === 'targets') {
    const max = S.ask.max || 1;
    if (S.targets.includes(seat)) S.targets = S.targets.filter(s => s !== seat);
    else { S.targets.push(seat); if (S.targets.length > max) S.targets.shift(); }
    fxPulseSeat(seat);
    try { fxTargetPaint(); } catch {}
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

function allowedCardIds() {
  const a = S.ask;
  if (!a) return null;
  if (a.kind === 'card' || a.kind === 'discard' || a.kind === 'cards') return a.cards || [];
  return null;
}

function clickCard(card, force) {
  // 手机长按查看牌面后紧接着的这次点击不算选牌，避免误操作
  if (!force && Date.now() < S.suppressClickUntil) return;
  const allowed = allowedCardIds();
  if (allowed && !allowed.includes(card.id)) return;
  const a = S.ask;
  if (S.zbMode && a && a.kind === 'play') { zbClickCard(card); return; }
  if (a && a.kind === 'card') { submit({ cardId: card.id }); return; }
  if (a && (a.kind === 'discard' || a.kind === 'cards')) {
    const max = a.max || 1;
    if (S.sel.includes(card.id)) S.sel = S.sel.filter(x => x !== card.id);
    else { S.sel.push(card.id); if (S.sel.length > max) S.sel.shift(); }
    renderTable();
    renderAsk();
    return;
  }
  if (S.sel.includes(card.id)) { S.sel = []; S.targets = []; }
  else { S.sel = [card.id]; S.targets = autoTargetSeats(card); }
  renderTable();
}

// 【丈八蛇矛】：把已选的两张手牌当【杀】使用（人类玩家入口）
function submitZhangba() {
  if (S.sel.length !== 2) return toast('请先选择两张手牌', 1600);
  const ids = S.sel.slice();
  if (!S.targets.length) return toast('请点击上方玩家选择【杀】的目标', 1600);
  S.zbMode = false;
  try { fxFlyCards(ids); } catch {}
  submit({ cardId: ids[0], extraCards: [ids[1]], asName: 'sha', seats: S.targets.slice() });
}

// 丈八选牌模式：点牌 = 复选（最多 2 张）
function zbClickCard(card) {
  if (S.sel.includes(card.id)) S.sel = S.sel.filter(x => x !== card.id);
  else { S.sel.push(card.id); if (S.sel.length > 2) S.sel.shift(); }
  S.targets = [];
  renderTable();
  if (S.sel.length === 2) toast('已选两张，请点击上方玩家选择【杀】的目标', 1800);
}

// 与引擎 autoTargetsFor 同口径：「只能指定自己」与「所有角色」的牌没有可挑的余地，直接填好目标
function autoTargetSeats(card) {
  const t = card && S.cards ? S.cards[card.name]?.target : null;
  if (!t || typeof t !== 'object') return [];
  const alive = (S.snap?.players || []).filter(p => p.alive);
  if (t.self && !t.others && !t.all) return S.seat == null ? [] : [S.seat];
  if (t.all) return alive.filter(p => (t.self ? true : p.seat !== S.seat)).map(p => p.seat);
  return [];
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
  // 「仅自己 / 全体」的牌由引擎自动定目标；这里兜底补齐，避免玩家被要求点人
  if (!S.targets.length) {
    const card = (S.snap?.players?.[S.seat]?.hand || []).find(c => c.id === cardId);
    const auto = autoTargetSeats(card);
    if (auto.length) S.targets = auto;
  }
  if (S.targets.length < need) return alert(`需要选择 ${need} 个目标`);
  try { fxFlyCards([cardId]); } catch {}
  submit({ cardId, seats: S.targets });
}

function renderAsk() {
  const a = S.ask;
  const box = $('#askPanel');
  if (!a || a.kind === 'play') { fxHideAsk(box); return; }
  fxShowAsk(box);
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
    box.appendChild(el('div', 'hint fx-need', `请点击上方玩家选择目标（还需 ${Math.max(0, (a.min || 1) - S.targets.length)} 个）`));
    const cancel = el('button', 'ghost', '取消');
    cancel.onclick = () => submit({ seats: [] });
    opts.appendChild(cancel);
  } else if (a.kind === 'discard' || a.kind === 'cards') {
    box.appendChild(el('div', 'hint', `请选择 ${a.min}~${a.max} 张牌（已选 ${S.sel.length}）`));
    const ok = el('button', 'primary', '确定');
    ok.onclick = () => {
      const n = a.min || 1;
      if (S.sel.length < n) return alert(`至少选择 ${n} 张`);
      try { fxFlyCards(S.sel.slice()); } catch {}
      submit({ cardIds: S.sel.slice() });
    };
    const cancel = el('button', 'ghost', '取消');
    cancel.onclick = () => submit({ cardIds: [] });
    opts.appendChild(ok); opts.appendChild(cancel);
  }
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
  box.appendChild(bar);
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
    box.classList.toggle('fx-ask-urgent', left > 0 && left <= 3000);
    if (left <= 0) clearInterval(S.timer);
  }, 100);
  syncAskOffset();
}

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
  try { fxSkillFromLog(entry.text); } catch {}
  try { fxSfxFromLog(entry.text); } catch {}
}

// 战报关键词 → 音效。每种音效有独立节流，避免连续战报把音效叠成噪音。
const SFX_LOG_AT = new Map();
function fxSfxOne(name, gap) {
  const now = Date.now();
  if (now - (SFX_LOG_AT.get(name) || 0) < gap) return;
  SFX_LOG_AT.set(name, now);
  sfx(name);
}
function fxSfxFromLog(text) {
  if (!text || S.view !== 'table') return;
  const t = String(text);
  // 顺序有讲究：无懈/濒死是更重要的信息，优先派发且只播一个
  if (/无懈/.test(t)) return fxSfxOne('nullify', 700);
  if (/濒死|求桃/.test(t)) return fxSfxOne('dying', 1500);
  if (/判定/.test(t)) return fxSfxOne('judge', 450);
  if (/铁索|连环|横置|重置/.test(t)) return fxSfxOne('chain', 900);
  if (/第\s*\d+\s*轮|新一轮/.test(t)) return fxSfxOne('round', 2500);
}

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
  FX.skillNextAt = now + delay + fxMs('--fx-stagger', 40) * 2;
  FX.skillLive = live + 1;
  sfx('skill');
  const f = el('div', 'fx-skill');
  f.textContent = `【${name}】`;
  f.setAttribute('aria-hidden', 'true');
  f.style.setProperty('--k', String(live));
  f.style.animationDelay = `${delay}ms`;
  host.appendChild(f);
  fxLater(() => { f.remove(); FX.skillLive = Math.max(0, (FX.skillLive || 1) - 1); }, delay + fxMs('--fx-t-skill', 1400) + 50);
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
  fxLater(off, fxMs('--fx-t-sweep', 1200) + 100);
}

const fxConnState = { on: false, seen: false };
function fxSfxBtnBind() {
  const b = document.getElementById('btnSfx');
  if (!b || b._fxTap) return;
  b._fxTap = 1;
  b.addEventListener('click', () => {
    if (reduceMotion()) return;
    b.classList.remove('fx-sfx-tap'); void b.offsetWidth;
    fxOnce(b, 'fx-sfx-tap', fxMs('--t-base', 200) + 80);
  });
}

function fxConnWatch() {
  try { fxSfxBtnBind(); } catch {}
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
    fxLater(off, fxMs('--fx-t-vig', 900) + 100);
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

function showOverlay(text, winners) {
  const box = $('#overlay');
  const wl = winners || [];
  const meP = S.snap?.players?.[S.seat];
  const fxWin = wl.some(w => (w && w.seat != null && w.seat === S.seat) || (meP && w && w.name === meP.name));
  const fxRes = (!wl.length || /平局/.test(String(text || ''))) ? 'draw' : (fxWin ? 'win' : 'lose');
  box.classList.remove('hidden', 'fx-res-win', 'fx-res-lose', 'fx-res-draw');
  box.classList.add('fx-res', 'fx-res-' + fxRes);
  sfx(fxRes === 'win' ? 'win' : fxRes === 'lose' ? 'lose' : 'turn');
  box.innerHTML = `<div class="box"><h2>对局结束</h2><p>${esc(text || '')}</p>
    <p>${(winners || []).map(w => esc(w.name)).join('、')}</p>
    <div class="row" style="justify-content:center;gap:8px">
      <button class="primary" id="btnBackRoom">返回房间 · 继续下一局</button>
      <button class="ghost" onclick="location.reload()">离开</button>
    </div>
    <p class="hint">房间会保留：所有人退出 5 分钟后自动回收；下一局需所有人点「准备」。</p></div>`;
  $('#btnBackRoom').onclick = async () => {
    hideOverlay();
    await refreshPickInfo();
    switchView('room');
    if (S.room) renderRoom(S.room);
  };
  try { fxResItems(box); } catch {}
}

function fxResItems(box) {
  if (reduceMotion()) return;
  box.classList.remove('fx-res-glow'); void box.offsetWidth;
  fxOnce(box, 'fx-res-glow', fxMs('--fx-t-res-glow', 1600) + 100);
  const inner = box.querySelector('.box');
  if (!inner) return;
  const gap = fxMs('--fx-stagger', 40), base = fxMs('--t-slow', 320);
  [...inner.children].slice(1).forEach((n, i) => {
    const k = Math.min(i + 1, 8);
    n.style.setProperty('--fx-i', String(k));
    fxOnce(n, 'fx-res-item', base + k * gap + 80);
  });
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

// 调试/验收钩子：供自动化测试直接驱动渲染函数（同源内部状态，不额外暴露敏感信息）
window.__SGFN = { renderRoom, renderTable, renderActions, autoTargetSeats, renderPickModeChips, renderPickCountChips, refreshPickInfo, switchView, showOverlay, hideOverlay, renderAsk,
  // 真 AI 玩家相关：供自动化验收驱动（只读/渲染入口，不含任何密钥）
  openRoomSettings, handleAiThink, syncAiThinking, refreshLLM,
  // UI v2（测试版）验收用
  fxSlotShow, fxScrollActiveIntoView, fxOppPlay };

init();
