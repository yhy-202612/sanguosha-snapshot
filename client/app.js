// 三国杀在线 · 客户端
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// 昵称等用户输入会被拼进模板，统一转义，避免 innerHTML 注入
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  meta: null, cards: {}, roomId: null, token: null, seat: null,
  snap: null, ask: null, sel: [], targets: [], view: 'lobby', es: null, timer: null,
  logOpen: false, logTouched: false,
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

function renderPackChips() {
  const box = $('#packList');
  box.innerHTML = '';
  for (const p of S.meta.packs) {
    const c = el('div', 'chip' + (p.id === 'standard' ? ' on' : ''), `${p.name}(${p.count})`);
    c.dataset.pack = p.id;
    c.onclick = () => { box.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); c.classList.add('on'); };
    box.appendChild(c);
  }
}

function renderGenerals() {
  const box = $('#generalList');
  box.innerHTML = '';
  const list = S.meta.generals.slice().sort((a, b) => (a.pack === b.pack ? a.name.localeCompare(b.name, 'zh') : a.pack.localeCompare(b.pack)));
  for (const g of list) {
    const card = el('div', 'gcard');
    card.innerHTML = `<b>${g.name}</b><div class="k">${g.kingdom} · ${g.hp}体力</div><div class="s">${(g.skills || []).join(' / ')}</div>`;
    box.appendChild(card);
  }
}

function bind() {
  $('#btnCreate').onclick = async () => {
    const modeId = $('#modeList .chip.on')?.dataset.mode || 'identity';
    const pack = $('#packList .chip.on')?.dataset.pack || 'standard';
    const maxSeats = Number($('#seatCount').value || 3);
    const name = ($('#nickname').value || '房主').trim().slice(0, 12) || '房主';
    const aiSeats = $('#aiFill').checked ? maxSeats : 0;
    const r = await api('/api/rooms', { modeId, pack, maxSeats, name, aiSeats });
    if (!r.ok) return alert(r.error || '创建失败');
    S.roomId = r.roomId; S.token = r.token; S.seat = r.seat;
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
}

const isMobileLayout = () => window.matchMedia('(max-width: 760px)').matches;

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
  setLogOpen(S.logOpen);
  syncAskOffset();
}

function showRoom(room) {
  switchView('room');
  renderRoom(room);
  connect();
}

function renderRoom(room) {
  $('#roomTitle').textContent = `房间 ${room.id} · ${room.modeName}（${room.seats.length}/${room.maxSeats}）`;
  const box = $('#roomSeats');
  box.innerHTML = '';
  for (const s of room.seats) {
    const c = el('div', 'seatcard' + (s.online ? '' : ' off'));
    c.innerHTML = `<div class="n">${esc(s.name)}${s.isAI ? '（电脑）' : ''}</div><div class="g">${esc(s.generalName || '待分配')}</div>`;
    box.appendChild(c);
  }
  $('#btnStart').style.display = room.seats.length && S.seat === 0 ? '' : 'none';
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
  es.addEventListener('room', (e) => { const room = JSON.parse(e.data); if (room.status === 'waiting') renderRoom(room); });
  es.addEventListener('state', (e) => { S.snap = JSON.parse(e.data); if (S.snap?.players) { switchView('table'); renderTable(); } });
  es.addEventListener('log', (e) => { addLog(JSON.parse(e.data)); });
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
    si.innerHTML = `你将 <b>${esc(me.generalName)}</b> · ${me.hp}/${me.maxHp} 体力 · 手牌 ${me.handCount} · ${snap.currentIndex === me.seat ? '<b style="color:#d8b46a">你的回合</b>' : '等待中'}${me.chained ? ' · 连环' : ''}`
      + (canSelf ? ' · <b style="color:#d8b46a">点此选自己</b>' : '');
    si.classList.toggle('targetable', canSelf);
    si.classList.toggle('picked', canSelf && S.targets.includes(me.seat));
    si.onclick = canSelf ? (() => toggleTarget(me.seat)) : null;
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
  const eq = [];
  for (const v of Object.values(p.equips || {})) if (v) eq.push(cardCN(v));
  const zone = (p.judgeZone || []).map(z => cardCN(z)).join(' ');
  const roleTag = p.role ? `<div class="role">${roleCN(p.role)}</div>` : '';
  c.innerHTML = `${roleTag}
    <div class="pn"><span>${esc(p.name)}</span><span class="pk">${esc(p.kingdom || '')}</span></div>
    <div class="pg">${esc(p.generalName)}</div>
    <div class="hpbar">${hpDots}</div>
    <div class="meta"><span>手牌 ${p.handCount}</span>${eq.length ? `<span>${eq.join(' ')}</span>` : ''}</div>
    ${zone ? `<div class="zone">判定区：${zone}</div>` : ''}`;
  return c;
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
  box.innerHTML = `<div class="box" style="max-width:520px;text-align:left">
    <h2>玩法</h2>
    <p>出牌阶段：点手牌选中 → 点击目标玩家 → 点「确定出牌」。<br/>
    响应时（出闪 / 出桃 / 无懈）会弹窗提示，点对应牌即可。<br/>
    超时由电脑代打，不会卡局。<br/>
    模式：身份场、军争、1v1、斗地主、国战、虎牢关。</p>
    <button class="ghost" onclick="document.getElementById('overlay').classList.add('hidden')">关闭</button>
  </div>`;
}

window.addEventListener('resize', () => {
  if (!S.logTouched) S.logOpen = S.view === 'table' ? !isMobileLayout() : S.logOpen;
  setLogOpen(S.logOpen);
  syncAskOffset();
});

init();
