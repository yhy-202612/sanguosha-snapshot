import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Game } from '../engine/index.js';
import { CARD_META, cardDesc } from '../engine/cards.js';
import { getSkill } from '../engine/skill.js';
import { GENERALS, generalById, KINGDOM_CN, PACK_CN } from '../data/generals.js';
import { deckEntries } from '../data/deck.js';
import { getMode, modeList } from '../modes/index.js';
import { AIPlayer } from '../ai/index.js';
import { makeLLMBrain, llmStatus, llmEnabled, llmStats } from '../ai/llm.js';
import { makeRng } from '../engine/rng.js';
import '../skills/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, '../../client');
const PORT = Number(process.env.PORT || 8030);
const HOST = process.env.HOST || '0.0.0.0';
const TURN_TIMEOUT = Number(process.env.TURN_TIMEOUT || 30000);
// 人类座位离线时给多长的重连窗口（超时由 AI 代打）；测试可用环境变量缩短
const RECONNECT_GRACE = Math.max(0, Number(process.env.RECONNECT_GRACE_MS || 3000));
// 空房回收：无任何在线客户端且持续 ROOM_TTL_MS 后删除。环境变量便于测试。
// 未开局的房间保留 30 分钟（原 5 分钟太短：手机锁屏/切网回来房间就没了）。
const ROOM_TTL_MS = Math.max(100, Number(process.env.ROOM_TTL_MS || 1800000));
// 对局进行中：即使所有客户端都断了也不按上面的短 TTL 回收（玩家可能锁屏/断网），
// 只在「无连接且持续 ROOM_PLAY_TTL_MS」后兜底清理，避免僵尸房永久占用。
const ROOM_PLAY_TTL_MS = Math.max(ROOM_TTL_MS, Number(process.env.ROOM_PLAY_TTL_MS || 6 * 3600000));
// 房间壳持久化：服务重启（部署/更新）后自动恢复房间与座位，玩家不用重新建房。
// 传 STATE_FILE='' 可禁用（测试用）。
const STATE_FILE = process.env.STATE_FILE === ''
  ? null
  : (process.env.STATE_FILE || path.join(__dirname, `../../.rooms-${PORT}.json`));

const rooms = new Map();
let roomSeq = 0;

// ---------------- 房间壳持久化 ----------------
// 只存「房间壳」（设置 + 座位 + 状态），不存对局内部对象（牌对象/responder 无法序列化）。
// 重启后若原来在对局中，房间保留但回到等待态，并标记 interrupted，由前端提示「需重新开局」。
// 这样部署更新服务器不再等于「把所有人的房间删掉」。
let persistTimer = null;

function roomShell(room) {
  const playing = room.status === 'playing' || room.status === 'error';
  return {
    id: room.id, modeId: room.modeId, packs: room.packs, customPool: room.customPool,
    pickMode: room.pickMode, pickCount: room.pickCount, dual: !!room.dual,
    hostRole: room.hostRole, maxSeats: room.maxSeats,
    status: room.status, round: room.round || 0, createdAt: room.createdAt,
    lastActiveAt: room.lastActiveAt || Date.now(),
    interrupted: playing ? 'restart' : (room.interrupted || null),
    seats: room.seats.map(s => ({
      index: s.index, name: s.name, token: s.token, isAI: !!s.isAI,
      generalId: s.generalId || null, generalIds: s.generalIds || [],
      candidates: s.candidates || [], candidatesKey: s.candidatesKey || null,
      ready: !!s.ready, auto: s.auto || { enabled: false, seconds: 15 },
    })),
  };
}

function persistNow() {
  if (!STATE_FILE) return;
  const list = [...rooms.values()].map(roomShell);
  const tmp = `${STATE_FILE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, ts: Date.now(), rooms: list }), { mode: 0o600 });
    fs.renameSync(tmp, STATE_FILE); // 原子替换，避免读到写一半的文件
  } catch (e) {
    console.error('[persist] 写房间快照失败:', e.message);
  }
}

function schedulePersist() {
  if (!STATE_FILE || persistTimer) return;
  persistTimer = setTimeout(() => { persistTimer = null; persistNow(); }, 400);
  persistTimer.unref?.();
}

function restoreRooms() {
  if (!STATE_FILE) return 0;
  let data;
  try { data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return 0; }
  const list = Array.isArray(data?.rooms) ? data.rooms : [];
  let n = 0;
  for (const sh of list) {
    if (!sh || !sh.id || rooms.has(sh.id)) continue;
    let mode;
    try { mode = getMode(sh.modeId); } catch { continue; }
    if (!mode) continue;
    const interrupted = sh.interrupted === 'restart' || sh.status === 'playing' || sh.status === 'error';
    const room = {
      id: sh.id, modeId: sh.modeId,
      packs: Array.isArray(sh.packs) && sh.packs.length ? sh.packs : ['standard'],
      customPool: Array.isArray(sh.customPool) && sh.customPool.length ? sh.customPool : null,
      pickMode: ['random', 'draw', 'host', 'all'].includes(sh.pickMode) ? sh.pickMode : 'random',
      pickCount: [2, 3, 5].includes(Number(sh.pickCount)) ? Number(sh.pickCount) : 3,
      dual: !!sh.dual, hostRole: sh.hostRole || normHostRole(sh.modeId, null),
      maxSeats: sh.maxSeats || mode.maxPlayers,
      seats: [], game: null, pending: new Map(), clients: new Map(), reqSeq: 0,
      status: sh.status === 'ended' ? 'ended' : 'waiting',
      round: sh.round || 0, result: null, error: null,
      interrupted: interrupted ? 'restart' : null,
      emptySince: Date.now(), lastActiveAt: Date.now(), createdAt: sh.createdAt || Date.now(),
    };
    for (const ss of sh.seats || []) {
      if (room.seats.length >= room.maxSeats) break;
      room.seats.push({
        index: room.seats.length, name: ss.name || '玩家', token: ss.token || newToken(),
        isAI: !!ss.isAI,
        generalId: ss.generalId || null, generalIds: Array.isArray(ss.generalIds) ? ss.generalIds : [],
        candidates: Array.isArray(ss.candidates) ? ss.candidates : [], candidatesKey: ss.candidatesKey || null,
        ready: ss.isAI ? true : (interrupted ? false : !!ss.ready),
        auto: ss.auto && typeof ss.auto === 'object'
          ? { enabled: !!ss.auto.enabled, seconds: Number(ss.auto.seconds) || 15 }
          : { enabled: false, seconds: 15 },
        autoplaying: false,
      });
    }
    if (!room.seats.length) continue;
    const seq = Number(String(sh.id).replace(/^R/, '').replace(/\D.*$/, '')) || 0;
    if (seq > roomSeq) roomSeq = seq;
    rooms.set(room.id, room);
    n++;
  }
  return n;
}

// ---------------- 工具 ----------------
function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '', done = false;
    const finish = (fn, v) => { if (done) return; done = true; fn(v); };
    req.on('data', c => {
      if (done) return;
      d += c;
      if (d.length > 1e6) {
        // Q2-B：超限不能只 destroy（请求会静默挂起），必须 reject 带状态码，由路由层统一回 413
        const err = new Error('body too large');
        err.statusCode = 413;
        d = '';               // 释放已收内容
        finish(reject, err);  // 之后到达的数据直接丢弃（done=true），不 destroy，保证能回 413
      }
    });
    req.on('end', () => finish(resolve, (() => { try { return d ? JSON.parse(d) : {}; } catch { return {}; } })()));
    req.on('error', e => finish(reject, e));
  });
}
function newToken() { return randomBytes(10).toString('hex'); }

// 每名玩家要选几个将：双将 = 2
function generalCountOf(room) { return room.dual ? 2 : 1; }

// 武将 id 列表 → "曹操 ＆ 司马懿"
function generalNames(ids) {
  return (ids || []).map(id => generalById(id)).filter(Boolean).map(g => g.name);
}
function generalNameText(ids) {
  const names = generalNames(ids);
  return names.length ? names.join(' ＆ ') : null;
}
function pickView(g) {
  return { id: g.id, name: g.name, pack: g.pack, kingdom: KINGDOM_CN[g.kingdom] || g.kingdom, hp: g.hp, skills: g.skills, armor: g.armor || 0 };
}

function publicRoom(room) {
  const generalCount = generalCountOf(room);
  return {
    interrupted: room.interrupted || null,
    id: room.id, modeId: room.modeId, modeName: getMode(room.modeId).name,
    pack: (room.packs || []).join(','), packs: room.packs || [], pickMode: room.pickMode || 'random',
    pickCount: room.pickCount || 3, dual: !!room.dual, generalCount,
    customPool: room.customPool || null,
    maxSeats: room.maxSeats, status: room.status, round: room.round || 0,
    hostRole: room.hostRole || null,
    aiBrain: room.aiBrain || 'builtin', aiModel: room.aiModel || 'deepseek', aiLevel: room.aiLevel || 'low',
    aiReady: llmEnabled(),
    emptySince: room.emptySince ?? null,
    minPlayers: getMode(room.modeId).minPlayers,
    maxPlayers: getMode(room.modeId).maxPlayers,
    seats: room.seats.map(s => {
      const ids = (s.generalIds || []).filter(Boolean);
      return {
        index: s.index, name: s.name, isAI: s.isAI, generalId: ids[0] || null,
        generalIds: ids, generalName: generalNameText(ids),
        kingdom: ids.length ? generalById(ids[0])?.kingdom : null,
        online: s.isAI || room.clients.has(s.token),
        ready: !!s.ready,
        auto: !!s.auto?.enabled, autoplaying: !!s.autoplaying,
        autoSeconds: Math.max(5, Math.min(180, Number(s.auto?.seconds) || 15)),
        // 只回显"是否已选满将"，候选人（candidates）绝不进广播
        picked: ids.length === generalCount,
      };
    }),
    // 等待 / 局间给前端渲染可选武将（选了自定义池就只给池内）
    pool: ['waiting', 'ended'].includes(room.status) ? roomPool(room).map(pickView) : undefined,
  };
}

// 房间武将池：自定义池优先；否则按选中的包（多选）过滤；池子不够坐满时回退补标准包
function roomPool(room) {
  const custom = Array.isArray(room.customPool) ? room.customPool.filter(Boolean) : null;
  if (custom && custom.length) {
    const list = GENERALS.filter(g => custom.includes(g.id));
    if (list.length) return list;
  }
  const packs = (Array.isArray(room.packs) && room.packs.length) ? room.packs : ['standard'];
  let list = GENERALS.filter(g => packs.includes(g.pack));
  const need = Math.max((room.seats || []).length, 2);
  if (list.length < need) {
    const extra = GENERALS.filter(g => g.pack === 'standard' && !packs.includes('standard'));
    list = [...list, ...extra];
  }
  return list.length ? list : [...GENERALS];
}

// ---------------- 房间 ----------------
// 房主自选身份（仅身份场类模式有效）：房主可在开局前把自己指定成任意身份
const HOST_ROLES = ['lord', 'loyalist', 'rebel', 'renegade'];
const IDENTITY_MODES = new Set(['identity', 'junzheng']);
const normHostRole = (modeId, v) => (IDENTITY_MODES.has(modeId) && HOST_ROLES.includes(v) ? v : null);

function createRoom({
  modeId = 'junzheng', packs = ['standard'], customPool = null, pickMode = 'random',
  pickCount = 3, dual = false, generalIds = null, maxSeats = null, hostName = '房主', hostRole = null,
}) {
  const mode = getMode(modeId);
  const id = `R${++roomSeq}${randomBytes(2).toString('hex')}`;
  const packList = (Array.isArray(packs) ? packs : [packs]).filter(p => PACK_CN[p]);
  const n = Number(pickCount);
  const room = {
    id, modeId,
    packs: packList.length ? packList : ['standard'],
    customPool: Array.isArray(customPool) && customPool.length ? customPool : null,
    pickMode: ['random', 'draw', 'host', 'all'].includes(pickMode) ? pickMode : 'random',
    pickCount: [2, 3, 5].includes(n) ? n : 3,
    dual: !!dual,
    hostRole: normHostRole(modeId, hostRole),
    maxSeats: maxSeats || mode.maxPlayers,
    // AI 大脑：builtin=内置启发式；llm=大模型。level: low(仅出牌阶段) / high(出牌+关键响应)
    aiBrain: 'builtin', aiModel: 'deepseek', aiLevel: 'low',
    seats: [], game: null, status: 'waiting', round: 0, result: null,
    emptySince: Date.now(),
    clients: new Map(), pending: new Map(), reqSeq: 0,
    lastSnapshotAt: 0, createdAt: Date.now(), lastActiveAt: Date.now(), interrupted: null,
  };
  rooms.set(id, room);
  const host = addSeat(room, hostName, false);
  // 建房时允许房主预先指定武将（长度不足/不在池内的会在开局时随机补足）
  if (host && room.pickMode !== 'random' && Array.isArray(generalIds) && generalIds.length) {
    const poolIds = new Set(roomPool(room).map(g => g.id));
    const need = generalCountOf(room);
    const ids = [...new Set(generalIds.map(String))].filter(gid => poolIds.has(gid)).slice(0, need);
    host.generalIds = ids;
    host.generalId = ids[0] || null;
  }
  schedulePersist(); // 建房也要立刻落盘（否则第一次持久化要等下一次 room 广播）
  return room;
}

function addSeat(room, name, isAI) {
  if (room.seats.length >= room.maxSeats) return null;
  const seat = {
    index: room.seats.length, name, token: newToken(), isAI,
    generalId: null, generalIds: [], candidates: [], candidatesKey: null,
    ready: !!isAI, // AI 恒为已准备
    auto: { enabled: false, seconds: 15 }, autoplaying: false,
  };
  room.seats.push(seat);
  schedulePersist();
  return seat;
}

// 房间已满时让真人「顶掉」一个电脑座位：原位替换（保持 index 不变，否则座位与 game 的对应会错）
function replaceSeatWithHuman(room, aiSeat, name) {
  if (!aiSeat || !aiSeat.isAI) return null;
  aiSeat.name = name;
  aiSeat.isAI = false;
  aiSeat.token = newToken();
  aiSeat.ready = false;
  aiSeat.generalId = null;
  aiSeat.generalIds = [];
  aiSeat.candidates = [];
  aiSeat.candidatesKey = null;
  aiSeat.auto = { enabled: false, seconds: 15 };
  aiSeat.autoplaying = false;
  aiSeat.replacedAI = true;
  return aiSeat;
}

// ---------------- 选将 ----------------
function seatChosen(seat) {
  return (seat.generalIds || []).filter(Boolean);
}

// draw 模式：为本人抽 pickCount × generalCount 个候选，排除其他座位的已选与候选
function drawCandidates(room, seat) {
  const need = (room.pickCount || 3) * generalCountOf(room);
  const blocked = new Set();
  for (const s of room.seats) {
    if (s.index === seat.index) continue;
    for (const id of seatChosen(s)) blocked.add(id);
    for (const id of s.candidates || []) blocked.add(id);
  }
  const available = roomPool(room).filter(g => !blocked.has(g.id)).map(g => g.id);
  const rng = makeRng();
  const out = [];
  while (out.length < need && available.length) {
    out.push(available.splice(rng.int(available.length), 1)[0]);
  }
  return out;
}

function pickInfoFor(room, seat) {
  const generalCount = generalCountOf(room);
  const info = {
    pickMode: room.pickMode, pickCount: room.pickCount || 3,
    dual: !!room.dual, generalCount,
    pool: [], candidates: [], chosen: seatChosen(seat), ready: !!seat.ready,
    // 房主自选的身份只回给房主本人，避免开局前把身份信息泄露给其他人
    hostRole: seat.index === 0 ? (room.hostRole || null) : null,
  };
  if (room.pickMode === 'random') { info.pool = []; return info; }
  if (room.pickMode === 'host' && seat.index !== 0) { info.pool = []; return info; }
  const pool = roomPool(room);
  if (room.pickMode === 'draw') {
    const key = `${room.pickCount}x${generalCount}`;
    if (!Array.isArray(seat.candidates) || seat.candidatesKey !== key) {
      seat.candidates = drawCandidates(room, seat);
      seat.candidatesKey = key;
    }
    info.pool = pool.map(pickView);
    info.candidates = seat.candidates.slice();
    return info;
  }
  // all；host 模式下房主按 all 处理
  info.pool = pool.map(pickView);
  return info;
}

// 立刻把最新状态推下去，忽略 120ms 节流。
// 用途：任何询问（ask）之前必须先刷新状态，否则前端会出现「先能出牌、后看见摸牌」的错序
// —— 因为 state 被节流延迟、而 ask 是立即发出的。
function flushState(room) {
  if (!room.game) return;
  if (room.stateTimer) { clearTimeout(room.stateTimer); room.stateTimer = null; }
  room.lastSnapshotAt = Date.now();
  broadcast(room, 'state');
}

function sendTo(room, seatIndex, event, data) {
  if (event === 'ask') flushState(room);
  const seat = room.seats[seatIndex];
  if (!seat) return;
  const res = room.clients.get(seat.token);
  if (!res) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch { room.clients.delete(seat.token); }
}

function broadcast(room, event, data) {
  if (event === 'room') schedulePersist();
  for (const seat of room.seats) {
    if (seat.isAI) continue;
    const res = room.clients.get(seat.token);
    if (!res) continue;
    let payload = data;
    if (event === 'state') payload = room.game ? room.game.snapshot(seat.index) : { status: room.status, room: publicRoom(room) };
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch { room.clients.delete(seat.token); }
  }
}

function pushState(room) {
  const now = Date.now();
  if (now - room.lastSnapshotAt < 120) {
    if (!room.stateTimer) {
      room.stateTimer = setTimeout(() => { room.stateTimer = null; pushState(room); }, 120);
    }
    return;
  }
  room.lastSnapshotAt = now;
  broadcast(room, 'state');
}

// 询问人类玩家（超时由 AI 代答）
function askSeat(room, seatIndex, req) {
  return new Promise((resolve) => {
    const seat = room.seats[seatIndex];
    const ai = new AIPlayer(seatIndex);
    // 托管：玩家可自行设置「多久没操作就交给电脑」，未开启时用全局兜底超时
    const autoOn = !!(seat && seat.auto && seat.auto.enabled);
    const autoSec = autoOn ? Math.max(5, Math.min(180, Number(seat.auto.seconds) || 15)) : 0;
    const timeout = autoOn ? autoSec * 1000 : (req.timeout || TURN_TIMEOUT);
    const key = `${seatIndex}:${req.id}`;
    let timer = null;
    const finish = (v) => {
      if (!room.pending.has(key)) return;
      room.pending.delete(key);
      if (timer) clearTimeout(timer);
      resolve(v);
    };
    const timeoutFallback = async () => {
      if (!room.pending.has(key)) return;
      room.pending.delete(key);
      if (seat && autoOn) {
        seat.autoplaying = true;
        sendTo(room, seatIndex, 'auto', { on: true, reason: 'timeout', prompt: req.prompt || '' });
      }
      try {
        const fallback = req.kind === 'play'
          ? await ai.askPlay(room.game, room.game.players[seatIndex])
          : await ai.ask(room.game, room.game.players[seatIndex], req);
        resolve(fallback);
      } catch { resolve(null); }
    };
    // 挂超时：初次推送与「重连后补推」都要挂，否则玩家重连但不操作会让 Promise 永挂、对局卡死
    const armTimeout = (ms = timeout) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(timeoutFallback, ms);
    };
    room.pending.set(key, { finish, req });
    armTimeout();

    // 人类座位离线时给 3 秒重连窗口，超时才由 AI 代打；在线则用正常回合超时
    if (!seat || seat.isAI || !room.clients.has(seat.token)) {
      clearTimeout(timer);
      const wait = (!seat || seat.isAI) ? 0 : RECONNECT_GRACE;
      const fallback = () => {
        if (!room.pending.has(key)) return;
        room.pending.delete(key);
        Promise.resolve(req.kind === 'play'
          ? ai.askPlay(room.game, room.game.players[seatIndex])
          : ai.ask(room.game, room.game.players[seatIndex], req)).then(resolve);
      };
      if (wait === 0) { fallback(); return; }
      // 3 秒内若客户端连上，则改为正常推送询问
      const started = Date.now();
      const check = setInterval(() => {
        if (room.clients.has(seat.token)) {
          clearInterval(check);
          sendTo(room, seatIndex, 'ask', { ...req, timeout });
          // 重连成功后才开始计时：玩家连上却不操作时仍会被托管/兜底，不会卡死
          armTimeout();
        } else if (Date.now() - started >= wait) {
          clearInterval(check);
          fallback();
        }
      }, 200);
      return;
    }
    sendTo(room, seatIndex, 'ask', { ...req, timeout });
  });
}

// AI 大脑实例缓存：同一房间同一座位复用（避免每次决策重建 + 便于统计）
// onThink：把大模型的决策过程广播给真人玩家 —— 玩家能看到「AI 正在思考 / 想了多久 / 选了什么」
function brainOf(room, seatIndex) {
  if (!llmEnabled()) return null;
  room.__brains = room.__brains || new Map();
  const key = `${seatIndex}:${room.aiModel}:${room.aiLevel}`;
  if (!room.__brains.has(key)) {
    const onThink = (ev) => {
      broadcast(room, 'ai-think', ev);
      if (ev.phase === 'dead') {
        const nm = room.seats[ev.seat]?.name || `座 ${ev.seat + 1}`;
        broadcast(room, 'log', { text: `⚠ ${nm} 的大模型连续 ${ev.count} 次未响应，本局已自动切回内置 AI` });
      }
    };
    room.__brains.set(key, makeLLMBrain(seatIndex, { model: room.aiModel, level: room.aiLevel, onThink }));
  }
  return room.__brains.get(key);
}

// 座位可用的大模型大脑：未开启 / 密钥缺失 / 已熔断 → null（调用方回落内置 AI）
function usableBrain(room, seatIndex) {
  if (room.aiBrain !== 'llm') return null;
  const b = brainOf(room, seatIndex);
  return b && b.alive() ? b : null;
}

function makeResponder(room) {
  return {
    async askPlay(game, player) {
      const seat = room.seats[player.seat];
      const req = {
        id: ++room.reqSeq, kind: 'play', prompt: '出牌阶段：请选择要使用的牌或发动技能',
        timeout: TURN_TIMEOUT,
      };
      if (!seat || seat.isAI) {
        const brain = usableBrain(room, player.seat);
        if (brain) return brain.askPlay(game, player);
        return new AIPlayer(player.seat).askPlay(game, player);
      }
      return askSeat(room, player.seat, req);
    },
    async ask(game, player, req) {
      const seat = room.seats[player.seat];
      if (!seat || seat.isAI) {
        const brain = usableBrain(room, player.seat);
        if (brain) return brain.ask(game, player, req);
        return new AIPlayer(player.seat).ask(game, player, req);
      }
      return askSeat(room, player.seat, req);
    },
  };
}

// ---------------- 开局 ----------------
function startRoom(room) {
  if (room.status === 'playing') return { ok: false, error: '对局已开始' };
  // 第二局起：所有人类座位准备后才允许开始（AI 恒视为已准备）
  if ((room.round || 0) > 0) {
    const notReady = room.seats.filter(s => !s.isAI && !s.ready).length;
    if (notReady > 0) return { ok: false, error: `还有 ${notReady} 人未准备` };
  }
  const mode = getMode(room.modeId);
  // 补 AI 至最少人数
  while (room.seats.length < Math.max(mode.minPlayers, 2)) addSeat(room, `电脑${room.seats.length}`, true);
  if (room.seats.length > mode.maxPlayers) return { ok: false, error: `该模式最多 ${mode.maxPlayers} 人` };

  // 选将：按 seat.generalIds（长度足够且都在池内）建 seats；不够的随机补足
  const rng = makeRng();
  const pool = roomPool(room);
  const poolIds = new Set(pool.map(g => g.id));
  const need = generalCountOf(room);
  const used = new Set();
  for (const s of room.seats) {
    const ids = [...new Set(seatChosen(s))].filter(id => poolIds.has(id));
    if (ids.length === need && ids.every(id => !used.has(id))) {
      s.generalIds = ids;
      for (const id of ids) used.add(id);
    } else {
      s.generalIds = [];
      s.generalId = null;
    }
  }
  for (const s of room.seats) {
    while (s.generalIds.length < need) {
      const cands = pool.filter(g => !used.has(g.id));
      const g = cands.length ? cands[rng.int(cands.length)] : pool[rng.int(pool.length)];
      if (!g) break;
      s.generalIds.push(g.id);
      used.add(g.id);
    }
    s.generalId = s.generalIds[0] || null;
  }

  const seats = room.seats.map(s => {
    const gens = s.generalIds.map(id => generalById(id)).filter(Boolean);
    return {
      id: `s${s.index}`, name: s.name, isAI: s.isAI,
      // 单将交 general，双将交 generals —— 体力平均与护甲求和由引擎负责
      ...(gens.length > 1 ? { generals: gens } : { general: gens[0] }),
    };
  });

  room.round = (room.round || 0) + 1;
  room.result = null;
  room.error = null;
  room.pending.clear();
  const game = new Game({
    seats, mode, seed: rng.seed, responder: makeResponder(room),
    deckEntries: deckEntries(mode.deck), config: { timeout: TURN_TIMEOUT, hostRole: room.hostRole || null },
    onLog: (entry) => broadcast(room, 'log', entry),
  });
  game.onState = () => pushState(room);
  room.game = game;
  room.status = 'playing';
  room.interrupted = null;

  broadcast(room, 'room', publicRoom(room));
  pushState(room);
  game.run().then(result => {
    // 对局结束：房间保留，进入局间（ended）
    room.status = 'ended';
    room.result = result;
    room.game = null;
    room.pending.clear();
    if (room.stateTimer) { clearTimeout(room.stateTimer); room.stateTimer = null; }
    for (const s of room.seats) {
      s.ready = !!s.isAI;
      s.candidates = [];
      s.candidatesKey = null;
    }
    broadcast(room, 'ended', { text: result?.text || '对局结束', winners: (result?.winners || []).map(p => ({ seat: p.seat, name: p.name })) });
    broadcast(room, 'room', publicRoom(room));
  }).catch(e => {
    console.error('[game error]', e);
    room.status = 'error';
    room.error = e.message;
    broadcast(room, 'error', { message: e.message });
  });
  return { ok: true, room: publicRoom(room), round: room.round };
}

// ---------------- 静态文件 ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
};
function serveStatic(req, res, urlPath) {
  let rel = urlPath.replace(/^\/+/, '') || 'index.html';
  if (rel.startsWith('sanguo/')) rel = rel.slice(7);
  const file = path.join(CLIENT_DIR, rel);
  const relToClient = path.relative(CLIENT_DIR, file);
  if (relToClient.startsWith('..') || path.isAbsolute(relToClient)) return json(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA 回退
      fs.readFile(path.join(CLIENT_DIR, 'index.html'), (e2, html) => {
        if (e2) return json(res, 404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ---------------- 路由 ----------------
// 简易 IP 限速（防刷建房等）：windowMs 内最多 limit 次
const rateBuckets = new Map();
function rateLimited(key, limit = 10, windowMs = 60000) {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now - b.start > windowMs) { rateBuckets.set(key, { start: now, n: 1 }); return false; }
  b.n++;
  return b.n > limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) if (now - b.start > 120000) rateBuckets.delete(k);
}, 60000).unref?.();

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return json(res, 400, { error: 'bad request' }); }
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST' });
    return res.end();
  }

  try {
    // 部署脚本在重启服务前调用：给所有房间广播一条维护提示，避免玩家「房间突然没了」却毫无预兆。
    // 只允许本机访问（部署脚本在服务器上用 127.0.0.1 调用）。
    if (p === '/api/admin/notice' && req.method === 'POST') {
      const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (!['127.0.0.1', '::1', 'localhost'].includes(ip)) return json(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      const text = String(body?.text || '服务器即将更新，房间会自动保留，请稍候重连').slice(0, 200);
      const seconds = Math.max(0, Math.min(120, Number(body?.seconds) || 10));
      let hit = 0;
      for (const room of rooms.values()) {
        if (room.clients.size === 0) continue;
        broadcast(room, 'notice', { text, seconds });
        hit += room.clients.size;
      }
      persistNow(); // 重启前落盘一次，确保恢复的是最新房间
      return json(res, 200, { ok: true, clients: hit, rooms: rooms.size });
    }
    if (p === '/api/llm-status') {
      return json(res, 200, { providers: llmStatus(), enabled: llmEnabled(), stats: llmStats() });
    }
    if (p === '/api/meta') {
      return json(res, 200, {
        modes: modeList(),
        packs: Object.entries(PACK_CN).map(([id, name]) => ({ id, name, count: GENERALS.filter(g => g.pack === id).length })),
        generals: GENERALS.map(g => ({
          id: g.id, name: g.name, kingdom: KINGDOM_CN[g.kingdom], hp: g.hp, pack: g.pack,
          moonMax: g.moonMax || 0,   // 月系列：月亮图标个数 = 月标记上限
          skills: g.skills,
          // 技能中文名 + 描述：大厅/对局内的「查看技能」面板直接用
          skillsDetail: (g.skills || []).map(id => { const s = getSkill(id); return s ? { id, name: s.name, desc: s.desc || '' } : { id, name: id, desc: '（未实装）' }; }),
        })),
        cards: Object.entries(CARD_META).map(([name, m]) => ({
          name, cn: m.cn, type: m.type, sub: m.sub || null, delayed: !!m.delayed, range: m.range || 0,
          desc: cardDesc(name),
          recast: !!m.recast,
          target: typeof m.target === 'function'
            ? (m.targetMeta || { min: 1, max: 1, others: true })
            : (m.target || null),
        })),
      });
    }

    if (p === '/api/rooms' && req.method === 'POST') {
      const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (rateLimited('rooms:' + ip, 10)) return json(res, 429, { error: '建房过于频繁，请稍后再试' });
      const body = await readBody(req);
      const packsIn = body.packs != null ? body.packs : (body.pack ? [body.pack] : ['standard']);
      const gids = Array.isArray(body.generalIds) ? body.generalIds : (body.generalId ? [body.generalId] : []);
      const room = createRoom({
        modeId: body.modeId || 'junzheng',
        packs: packsIn === 'all' ? Object.keys(PACK_CN) : packsIn,
        customPool: Array.isArray(body.customPool) ? body.customPool.slice(0, 400) : null,
        pickMode: body.pickMode || 'random',
        pickCount: body.pickCount,
        dual: body.dual,
        generalIds: gids,
        maxSeats: body.maxSeats || null, hostName: body.name || '房主',
        hostRole: body.hostRole || null,
      });
      const seat = room.seats[0];
      if (body.autoEnable != null) {
        seat.auto = { enabled: !!body.autoEnable, seconds: Math.max(5, Math.min(180, Number(body.autoSeconds) || 15)) };
      }
      if (body.aiSeats) {
        const want = Number(body.aiSeats);
        while (room.seats.length < Math.min(want, room.maxSeats)) addSeat(room, `电脑${room.seats.length}`, true);
      }
      if (body.autoStart) startRoom(room);
      return json(res, 200, { ok: true, roomId: room.id, seat: seat.index, token: seat.token, room: publicRoom(room) });
    }

    const m = p.match(/^\/api\/rooms\/([^/]+)\/([\w-]+)$/);
    if (m) {
      const room = rooms.get(m[1]);
      if (!room) return json(res, 404, { error: '房间不存在' });
      const action = m[2];

      if (action === 'pick-info' && req.method === 'POST') {
        const body = await readBody(req);
        const seat = room.seats.find(s => s.token === body.token);
        if (!seat) return json(res, 403, { error: '无效令牌' });
        return json(res, 200, { ok: true, ...pickInfoFor(room, seat) });
      }

      if (action === 'pick' && req.method === 'POST') {
        const body = await readBody(req);
        if (!['waiting', 'ended'].includes(room.status)) return json(res, 400, { error: '对局进行中不能选将' });
        const seat = room.seats.find(s => s.token === body.token);
        if (!seat) return json(res, 403, { error: '无效令牌' });
        if (room.pickMode === 'random') return json(res, 400, { error: '本房间为随机分配武将' });
        if (room.pickMode === 'host' && seat.index !== 0) return json(res, 403, { error: '本房间仅房主可选将' });
        const ids = Array.isArray(body.generalIds)
          ? body.generalIds.map(String)
          : (body.generalId ? [String(body.generalId)] : []);
        const need = generalCountOf(room);
        if (ids.length !== need) return json(res, 400, { error: `需要选择 ${need} 名武将` });
        if (new Set(ids).size !== ids.length) return json(res, 400, { error: '不能重复选择同一名武将' });
        const poolIds = new Set(roomPool(room).map(g => g.id));
        if (ids.some(id => !poolIds.has(id))) return json(res, 400, { error: '该武将不在本房间将池内' });
        if (room.pickMode === 'draw') {
          if (!Array.isArray(seat.candidates) || !seat.candidates.length) pickInfoFor(room, seat);
          // 允许保留自己此前已选的武将（建房预选 / 改选前）；不能选到别人候选里的将
          const cands = new Set([...(seat.candidates || []), ...seatChosen(seat)]);
          if (ids.some(id => !cands.has(id))) return json(res, 400, { error: '该武将不在你的候选内' });
        }
        if (room.seats.some(s => s.index !== seat.index && seatChosen(s).some(id => ids.includes(id)))) {
          return json(res, 400, { error: '该武将已被其他座位选择' });
        }
        seat.generalIds = ids.slice();
        seat.generalId = ids[0] || null;
        seat.ready = false; // 改选后需要重新准备
        broadcast(room, 'room', publicRoom(room));
        return json(res, 200, { ok: true, room: publicRoom(room), chosen: seat.generalIds.slice() });
      }

      if (action === 'ready' && req.method === 'POST') {
        const body = await readBody(req);
        const seat = room.seats.find(s => s.token === body.token);
        if (!seat) return json(res, 403, { error: '无效令牌' });
        if (!['waiting', 'ended'].includes(room.status)) return json(res, 400, { error: '对局进行中不能准备' });
        seat.ready = !!body.ready;
        broadcast(room, 'room', publicRoom(room));
        return json(res, 200, { ok: true, room: publicRoom(room), ready: seat.ready });
      }

      if (action === 'config' && req.method === 'POST') {
        const body = await readBody(req);
        const seat = room.seats.find(s => s.token === body.token);
        if (!seat || seat.index !== 0) return json(res, 403, { error: '只有房主可以修改房间设置' });
        if (!['waiting', 'ended'].includes(room.status)) return json(res, 400, { error: '仅等待或局间可以修改设置' });

        // ===== 第一步：全部校验（不落任何值）=====
        // 房主调整人数：缩小时只允许裁掉尾部的「电脑」座位；扩大时补电脑占位座
        let wantSeats = null;
        let cutSeats = [];
        if (body.maxSeats != null) {
          const mode = getMode(room.modeId);
          const lo = Math.max(mode.minPlayers, 2);
          const hi = mode.maxPlayers;
          wantSeats = Math.max(lo, Math.min(hi, Number(body.maxSeats) || lo));
          if (wantSeats < room.seats.length) {
            cutSeats = room.seats.slice(wantSeats);
            const human = cutSeats.find(s => !s.isAI);
            if (human) {
              // 关键：这里必须在校验阶段直接返回，不能已改过 packs/pickMode/dual（否则内存脏状态）
              return json(res, 400, { error: `第 ${human.index + 1} 号座位有真人玩家（${human.name}），无法减到 ${wantSeats} 人` });
            }
          }
        }
        const nextPacks = Array.isArray(body.packs)
          ? [...new Set(body.packs.filter(p => PACK_CN[p]))].slice(0, 64)   // 去重，防重复包导致将池重复
          : null;
        let nextCustomPool = undefined;
        if (body.customPool !== undefined) {
          const list = Array.isArray(body.customPool)
            ? [...new Set(body.customPool)].filter(id => generalById(id)).slice(0, 400)   // 只留真实存在的武将
            : [];
          nextCustomPool = list.length ? list : null;
        }

        // ===== 第二步：提交（此时所有校验已通过）=====
        const before = {
          packs: (room.packs || []).join(','), pickMode: room.pickMode || 'random',
          pickCount: room.pickCount || 3, dual: !!room.dual, customs: (room.customPool || []).join(','),
        };
        if (nextPacks) {
          const changed = nextPacks.join(',') !== before.packs;
          room.packs = nextPacks.length ? nextPacks : ['standard'];
          // 改了武将包就清掉自定义将池（否则 roomPool 仍优先旧池，换包不生效）
          if (changed && nextCustomPool === undefined) room.customPool = null;
        }
        if (nextCustomPool !== undefined) room.customPool = nextCustomPool;
        if (['random', 'draw', 'host', 'all'].includes(body.pickMode)) room.pickMode = body.pickMode;
        if (body.pickCount != null) {
          const n = Number(body.pickCount);
          if ([2, 3, 5].includes(n)) room.pickCount = n;
        }
        if (body.dual != null) room.dual = !!body.dual;
        if (body.hostRole !== undefined) room.hostRole = normHostRole(room.modeId, body.hostRole);
        // AI 大脑设置（房主可调）：builtin/llm、deepseek/glm、low/high
        if (['builtin', 'llm'].includes(body.aiBrain)) {
          room.aiBrain = body.aiBrain === 'llm' && !llmEnabled() ? 'builtin' : body.aiBrain;
        }
        if (['deepseek', 'glm'].includes(body.aiModel)) room.aiModel = body.aiModel;
        if (['low', 'high'].includes(body.aiLevel)) room.aiLevel = body.aiLevel;
        if (room.__brains) room.__brains.clear();
        if (wantSeats != null) {
          if (wantSeats < room.seats.length) {
            room.seats = room.seats.slice(0, wantSeats);
            room.seats.forEach((s, i) => { s.index = i; });
          }
          room.maxSeats = wantSeats;
        }
        if (body.fillAI) {   // 用电脑补足到当前人数上限
          while (room.seats.length < room.maxSeats) addSeat(room, `电脑${room.seats.length}`, true);
        }
        // 扩大人数但没点「补足」：补电脑占位座，保证 seats.length === maxSeats
        while (room.seats.length < room.maxSeats) addSeat(room, `电脑${room.seats.length}`, true);

        // 只有真正影响将池/将数的字段变化时才重置候选与准备（只改身份/补位不应打断别人）
        const after = {
          packs: (room.packs || []).join(','), pickMode: room.pickMode || 'random',
          pickCount: room.pickCount || 3, dual: !!room.dual, customs: (room.customPool || []).join(','),
        };
        const poolChanged = ['packs', 'pickMode', 'pickCount', 'dual', 'customs'].some(k => before[k] !== after[k]);
        if (poolChanged) {
          const need = generalCountOf(room);
          const poolIds = new Set(roomPool(room).map(g => g.id));
          for (const s of room.seats) {
            s.candidates = [];
            s.candidatesKey = null;
            s.ready = !!s.isAI;
            const ids = [...new Set(seatChosen(s))].filter(id => poolIds.has(id));
            s.generalIds = ids.length === need ? ids : [];
            s.generalId = s.generalIds[0] || null;
          }
        }
        broadcast(room, 'room', publicRoom(room));
        return json(res, 200, { ok: true, poolChanged, room: publicRoom(room) });
      }

      if (action === 'autoplay' && req.method === 'POST') {
        const body = await readBody(req);
        const me = room.seats.find(s => s.token === body.token);
        if (!me) return json(res, 403, { error: '无效令牌' });
        let target = me;
        // 房主可以为「任意座位」分别调整托管时长；普通玩家只能调自己
        if (body.seat != null && Number(body.seat) !== me.index) {
          if (me.index !== 0) return json(res, 403, { error: '只有房主可以调整其他玩家的托管' });
          target = room.seats[Number(body.seat)];
          if (!target) return json(res, 400, { error: '座位不存在' });
          if (target.isAI) return json(res, 400, { error: '电脑座位无需托管' });
        }
        target.auto = { enabled: !!body.enabled, seconds: Math.max(5, Math.min(180, Number(body.seconds) || 15)) };
        target.autoplaying = false;
        broadcast(room, 'room', publicRoom(room));
        return json(res, 200, { ok: true, seat: target.index, auto: target.auto, room: publicRoom(room) });
      }

      if (action === 'join' && req.method === 'POST') {
        const body = await readBody(req);
        // 等待中与局间（上一局刚结束、准备下一局）都允许加入
        if (!['waiting', 'ended'].includes(room.status)) return json(res, 400, { error: '对局已开始' });
        // 同一个 token 重连/刷新：复用原座位，不再新增座（防「刷新一次就多一个人」把 AI 位吃光）
        if (body.token) {
          const same = room.seats.find(s => s.token === body.token && !s.isAI);
          if (same) {
            if (body.name) same.name = String(body.name).slice(0, 24);
            broadcast(room, 'room', publicRoom(room));
            return json(res, 200, { ok: true, seat: same.index, token: same.token, reused: true, room: publicRoom(room) });
          }
        }
        const name = body.name || `玩家${room.seats.length + 1}`;
        let seat = addSeat(room, name, false);
        let replacedAI = false;
        if (!seat) {
          // 座位已被电脑填满：让最后一个电脑座位让位给真人（原位替换，座位号不变）
          const aiSeat = [...room.seats].reverse().find(s => s.isAI);
          if (!aiSeat) return json(res, 400, { error: '房间已满（无电脑座位可让位）' });
          seat = replaceSeatWithHuman(room, aiSeat, name);
          replacedAI = !!seat;
          if (!seat) return json(res, 400, { error: '房间已满' });
        }
        broadcast(room, 'room', publicRoom(room));
        return json(res, 200, { ok: true, seat: seat.index, token: seat.token, replacedAI, room: publicRoom(room) });
      }

      if (action === 'start' && req.method === 'POST') {
        const body = await readBody(req);
        const seat = room.seats.find(s => s.token === body.token);
        if (!seat || seat.index !== 0) return json(res, 403, { error: '只有房主可以开始' });
        const r = startRoom(room);
        return json(res, r.ok ? 200 : 400, r);
      }

      if (action === 'state') {
        const token = url.searchParams.get('token');
        const seat = room.seats.find(s => s.token === token);
        return json(res, 200, {
          room: publicRoom(room), status: room.status,
          seat: seat ? seat.index : null,
          state: room.game ? room.game.snapshot(seat ? seat.index : null) : null,
        });
      }

      if (action === 'stream') {
        const token = url.searchParams.get('token');
        const seat = room.seats.find(s => s.token === token);
        if (!seat) return json(res, 403, { error: '无效令牌' });
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
        });
        res.write(': connected\n\n');
        room.clients.set(token, res);
        room.emptySince = null; // 有人连上，取消空房计时
        room.lastActiveAt = Date.now();
        sendTo(room, seat.index, 'room', publicRoom(room));
        if (room.game) sendTo(room, seat.index, 'state', room.game.snapshot(seat.index));
        const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
        req.on('close', () => {
          clearInterval(hb);
          // 旧连接的 close 不能误删重连后的新 token
          if (room.clients.get(token) === res) {
            room.clients.delete(token);
            if (room.clients.size === 0) room.emptySince = Date.now();
          }
        });
        return;
      }

      if (action === 'action' && req.method === 'POST') {
        const body = await readBody(req);
        const seat = room.seats.find(s => s.token === body.token);
        if (!seat) return json(res, 403, { error: '无效令牌' });
        if (!room.game) return json(res, 400, { error: '对局未开始' });
        const key = `${seat.index}:${body.reqId}`;
        const item = room.pending.get(key);
        if (!item) return json(res, 200, { ok: true, stale: true });
        seat.autoplaying = false; // 玩家亲自操作，托管状态解除
        let answer = body.answer || null;
        if (body.reqKind === 'play' && answer && answer.cardId) {
          const card = room.game.players[seat.index].hand.find(c => c.id === answer.cardId);
          answer = { card, targets: (answer.seats || []).map(s => room.game.players[s]).filter(Boolean), asName: answer.asName || null, endPhase: !!answer.endPhase, skill: answer.skill || null, recast: !!answer.recast };
        }
        item.finish(answer);
        return json(res, 200, { ok: true });
      }

      if (action === 'chat' && req.method === 'POST') {
        const body = await readBody(req);
        const seat = room.seats.find(s => s.token === body.token);
        if (seat) broadcast(room, 'chat', { name: seat.name, text: String(body.text || '').slice(0, 200), at: Date.now() });
        return json(res, 200, { ok: true });
      }
    }

    if (p.startsWith('/api/')) return json(res, 404, { error: 'unknown api' });
    return serveStatic(req, res, p);
  } catch (e) {
    const code = e && Number.isInteger(e.statusCode) ? e.statusCode : 500;
    if (code === 413) return json(res, 413, { error: '请求体过大', code: 'BODY_TOO_LARGE' });
    console.error(e);
    return json(res, code, { error: e.message });
  }
});

// 定期回收空房：clients.size === 0 且空置时间达到 ROOM_TTL_MS。
// 扫描间隔随 TTL 缩短（默认 60s），便于用 ROOM_TTL_MS=1500 做测试。
const ROOM_SWEEP_MS = Math.min(60000, Math.max(250, Math.floor(ROOM_TTL_MS / 2)));
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.clients.size > 0) { room.emptySince = null; continue; }
    if (room.emptySince == null) { room.emptySince = now; continue; }
    // 对局进行中用更长的兜底 TTL：玩家可能只是锁屏/切网/接电话，
    // 按「无连接 5 分钟」就删房等于把人踢出去（原实现正是如此）。
    const ttl = room.game ? ROOM_PLAY_TTL_MS : ROOM_TTL_MS;
    if (now - room.emptySince >= ttl) {
      if (room.stateTimer) { clearTimeout(room.stateTimer); room.stateTimer = null; }
      room.pending.clear();
      rooms.delete(id);
      schedulePersist();
    }
  }
}, ROOM_SWEEP_MS).unref?.();

// 优雅退出：被 systemctl restart / Ctrl+C 打断时先把房间落盘，确保重启后能恢复
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    try { persistNow(); } catch {}
    process.exit(0);
  });
}

const RESTORED_ROOMS = restoreRooms();
server.listen(PORT, HOST, () => {
  if (RESTORED_ROOMS) console.log(`已恢复 ${RESTORED_ROOMS} 个房间（服务重启前保留，玩家可直接重连）`);
  console.log(`三国杀在线服务已启动：http://${HOST}:${PORT}`);
  console.log(`模式：${modeList().map(m => m.name).join(' / ')} · 空房回收 ${ROOM_TTL_MS}ms`);
});
