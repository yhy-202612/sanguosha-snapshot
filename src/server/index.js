import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Game } from '../engine/index.js';
import { CARD_META } from '../engine/cards.js';
import { GENERALS, generalById, KINGDOM_CN, PACK_CN } from '../data/generals.js';
import { deckEntries } from '../data/deck.js';
import { getMode, modeList } from '../modes/index.js';
import { AIPlayer } from '../ai/index.js';
import { makeRng } from '../engine/rng.js';
import '../skills/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, '../../client');
const PORT = Number(process.env.PORT || 8030);
const HOST = process.env.HOST || '0.0.0.0';
const TURN_TIMEOUT = Number(process.env.TURN_TIMEOUT || 30000);

const rooms = new Map();
let roomSeq = 0;

// ---------------- 工具 ----------------
function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}
function newToken() { return randomBytes(10).toString('hex'); }

function publicRoom(room) {
  return {
    id: room.id, modeId: room.modeId, modeName: getMode(room.modeId).name, pack: room.pack,
    maxSeats: room.maxSeats, status: room.status,
    seats: room.seats.map(s => ({
      index: s.index, name: s.name, isAI: s.isAI, generalId: s.generalId,
      generalName: s.generalId ? generalById(s.generalId)?.name : null,
      kingdom: s.generalId ? generalById(s.generalId)?.kingdom : null,
      online: s.isAI || room.clients.has(s.token),
    })),
  };
}

// ---------------- 房间 ----------------
function createRoom({ modeId = 'identity', pack = 'standard', maxSeats = null, hostName = '房主' }) {
  const mode = getMode(modeId);
  const id = `R${++roomSeq}${randomBytes(2).toString('hex')}`;
  const room = {
    id, modeId, pack, maxSeats: maxSeats || mode.maxPlayers,
    seats: [], game: null, status: 'waiting',
    clients: new Map(), pending: new Map(), reqSeq: 0,
    lastSnapshotAt: 0, createdAt: Date.now(),
  };
  rooms.set(id, room);
  addSeat(room, hostName, false);
  return room;
}

function addSeat(room, name, isAI) {
  if (room.seats.length >= room.maxSeats) return null;
  const seat = { index: room.seats.length, name, token: newToken(), isAI, generalId: null };
  room.seats.push(seat);
  return seat;
}

function sendTo(room, seatIndex, event, data) {
  const seat = room.seats[seatIndex];
  if (!seat) return;
  const res = room.clients.get(seat.token);
  if (!res) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch { room.clients.delete(seat.token); }
}

function broadcast(room, event, data) {
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
    const timeout = req.timeout || TURN_TIMEOUT;
    const key = `${seatIndex}:${req.id}`;
    const finish = (v) => {
      if (!room.pending.has(key)) return;
      room.pending.delete(key);
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(async () => {
      if (!room.pending.has(key)) return;
      room.pending.delete(key);
      try {
        const fallback = req.kind === 'play'
          ? await ai.askPlay(room.game, room.game.players[seatIndex])
          : await ai.ask(room.game, room.game.players[seatIndex], req);
        resolve(fallback);
      } catch { resolve(null); }
    }, timeout);
    room.pending.set(key, { finish, req });

    // 人类座位离线时给 3 秒重连窗口，超时才由 AI 代打；在线则用正常回合超时
    if (!seat || seat.isAI || !room.clients.has(seat.token)) {
      clearTimeout(timer);
      const wait = (!seat || seat.isAI) ? 0 : 3000;
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

function makeResponder(room) {
  return {
    async askPlay(game, player) {
      const seat = room.seats[player.seat];
      const req = {
        id: ++room.reqSeq, kind: 'play', prompt: '出牌阶段：请选择要使用的牌或发动技能',
        timeout: TURN_TIMEOUT,
      };
      if (!seat || seat.isAI) {
        return new AIPlayer(player.seat).askPlay(game, player);
      }
      return askSeat(room, player.seat, req);
    },
    async ask(game, player, req) {
      const seat = room.seats[player.seat];
      if (!seat || seat.isAI) {
        return new AIPlayer(player.seat).ask(game, player, req);
      }
      return askSeat(room, player.seat, req);
    },
  };
}

// ---------------- 开局 ----------------
function startRoom(room) {
  if (room.status !== 'waiting') return { ok: false, error: '对局已开始' };
  const mode = getMode(room.modeId);
  // 补 AI 至最少人数
  while (room.seats.length < Math.max(mode.minPlayers, 2)) addSeat(room, `电脑${room.seats.length}`, true);
  if (room.seats.length > mode.maxPlayers) return { ok: false, error: `该模式最多 ${mode.maxPlayers} 人` };

  // 选将：从指定包随机分配
  const rng = makeRng();
  const packs = room.pack === 'all' ? ['standard', 'jie', 'mou', 'shen', 'ji'] : [room.pack, 'standard'];
  const pool = GENERALS.filter(g => packs.includes(g.pack));
  const used = new Set();
  for (const s of room.seats) {
    const cands = pool.filter(g => !used.has(g.id));
    const g = cands.length ? cands[rng.int(cands.length)] : pool[0];
    s.generalId = g.id;
    used.add(g.id);
  }

  const seats = room.seats.map(s => ({
    id: `s${s.index}`, name: s.name, isAI: s.isAI,
    general: generalById(s.generalId),
  }));

  const game = new Game({
    seats, mode, seed: rng.seed, responder: makeResponder(room),
    deckEntries: deckEntries(mode.deck), config: { timeout: TURN_TIMEOUT },
    onLog: (entry) => broadcast(room, 'log', entry),
  });
  game.onState = () => pushState(room);
  room.game = game;
  room.status = 'playing';

  broadcast(room, 'room', publicRoom(room));
  pushState(room);
  game.run().then(result => {
    room.status = 'ended';
    room.result = result;
    broadcast(room, 'ended', { text: result?.text || '对局结束', winners: (result?.winners || []).map(p => ({ seat: p.seat, name: p.name })) });
    pushState(room);
  }).catch(e => {
    console.error('[game error]', e);
    room.status = 'error';
    room.error = e.message;
    broadcast(room, 'error', { message: e.message });
  });
  return { ok: true };
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
  if (!file.startsWith(CLIENT_DIR)) return json(res, 403, { error: 'forbidden' });
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
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST' });
    return res.end();
  }

  try {
    if (p === '/api/meta') {
      return json(res, 200, {
        modes: modeList(),
        packs: Object.entries(PACK_CN).map(([id, name]) => ({ id, name, count: GENERALS.filter(g => g.pack === id).length })),
        generals: GENERALS.map(g => ({
          id: g.id, name: g.name, kingdom: KINGDOM_CN[g.kingdom], hp: g.hp, pack: g.pack,
          skills: g.skills,
        })),
        cards: Object.entries(CARD_META).map(([name, m]) => ({
          name, cn: m.cn, type: m.type, sub: m.sub || null, delayed: !!m.delayed, range: m.range || 0,
          target: typeof m.target === 'function'
            ? { min: 1, max: 1, others: true }
            : (m.target || null),
        })),
      });
    }

    if (p === '/api/rooms' && req.method === 'POST') {
      const body = await readBody(req);
      const room = createRoom({
        modeId: body.modeId || 'identity', pack: body.pack || 'standard',
        maxSeats: body.maxSeats || null, hostName: body.name || '房主',
      });
      const seat = room.seats[0];
      if (body.aiSeats) {
        const want = Number(body.aiSeats);
        while (room.seats.length < Math.min(want, room.maxSeats)) addSeat(room, `电脑${room.seats.length}`, true);
      }
      if (body.autoStart) startRoom(room);
      return json(res, 200, { ok: true, roomId: room.id, seat: seat.index, token: seat.token, room: publicRoom(room) });
    }

    const m = p.match(/^\/api\/rooms\/([^/]+)\/(\w+)$/);
    if (m) {
      const room = rooms.get(m[1]);
      if (!room) return json(res, 404, { error: '房间不存在' });
      const action = m[2];

      if (action === 'join' && req.method === 'POST') {
        const body = await readBody(req);
        if (room.status !== 'waiting') return json(res, 400, { error: '对局已开始' });
        const seat = addSeat(room, body.name || `玩家${room.seats.length + 1}`, false);
        if (!seat) return json(res, 400, { error: '房间已满' });
        broadcast(room, 'room', publicRoom(room));
        return json(res, 200, { ok: true, seat: seat.index, token: seat.token, room: publicRoom(room) });
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
        sendTo(room, seat.index, 'room', publicRoom(room));
        if (room.game) sendTo(room, seat.index, 'state', room.game.snapshot(seat.index));
        const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
        req.on('close', () => { clearInterval(hb); room.clients.delete(token); });
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
        let answer = body.answer || null;
        if (body.reqKind === 'play' && answer && answer.cardId) {
          const card = room.game.players[seat.index].hand.find(c => c.id === answer.cardId);
          answer = { card, targets: (answer.seats || []).map(s => room.game.players[s]).filter(Boolean), asName: answer.asName || null, endPhase: !!answer.endPhase, skill: answer.skill || null };
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
    console.error(e);
    return json(res, 500, { error: e.message });
  }
});

// 定期清理空房
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    const idle = now - room.createdAt > 3 * 3600 * 1000;
    const noBody = room.clients.size === 0 && room.status === 'waiting' && now - room.createdAt > 30 * 60 * 1000;
    if (idle || noBody) rooms.delete(id);
  }
}, 5 * 60 * 1000).unref?.();

server.listen(PORT, HOST, () => {
  console.log(`三国杀在线服务已启动：http://${HOST}:${PORT}`);
  console.log(`模式：${modeList().map(m => m.name).join(' / ')}`);
});
