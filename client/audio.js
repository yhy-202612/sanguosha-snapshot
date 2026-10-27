// 音效层（WebAudio 合成，零外部资源）
// ------------------------------------------------------------------
// 频谱分工：低频 60–200Hz 出"重量"，中频 300–900Hz 出"body"，
// 2.5–6kHz 只放极短、极轻的瞬态"air"（峰值约为主体的 5% 以内）。
// 输出链：master / longBus → Compressor → Highpass(45Hz) → destination。
// 所有可调参数都在 SFX_P；改听感只动这一个对象即可。
//
// 层（layer）类型：
//   tone  : 振荡器。f0→f1 指数滑音，lp 为 2 阶低通(-12dB/oct)，trem 为振幅颤音
//   noise : 噪声(随机 offset 起播) → 滤波器(可扫频) → 包络
//   arp   : 一串 tone，按 step 间隔依次起音，slide 为每音末尾频率比例

const KEY = 'sg_sfx_muted';

const SFX_P = {
  // ---------------- 系统级参数 ----------------
  sys: {
    master: { gain: 0.26 },
    comp: { threshold: -18, knee: 6, ratio: 8, attack: 0.003, release: 0.12 },
    hp: { freq: 45, q: 0.707 },
    noiseSec: 2,            // 噪声缓冲时长（越长，随机 offset 可选范围越大）
    maxActive: 8,           // 全局同时活跃上限
    activeMs: 420,          // 单次触发占用"活跃名额"的时长
    maxVoicesDefault: 99,   // 同名并发默认上限（各音效 limit.maxVoices 可覆盖）
    lifeMs: 300,            // 同名并发统计默认寿命
    loudMul: 1.35,          // loud 默认增益倍数（音效可用 loudMul 覆盖）
    // 长音效 ducking：起播时把 master 压到 base*ratio，holdMs 后按 releaseTc 恢复
    duck: { ratio: 0.6, holdMs: 120, attackTc: 0.01, releaseTc: 0.05 },
    // 同名合并：windowMs 内第 count 个起，合并为一次略加强的播放
    merge: { windowMs: 80, count: 3, boostStep: 0.12, boostMax: 0.3 },
    stop: { fadeTc: 0.01, restoreMs: 120 },   // 静音时的快速淡出与恢复
    defaults: {
      attack: 0.006,        // 默认起音
      tail: 0.05,           // 节点在包络结束后多留的时间
      floor: 0.0001,        // 包络下限（指数斜坡不能到 0）
      peakMin: 0.0002,
      minOscHz: 20,
      minFilterHz: 60,
      lpQ: 0.707,           // 低通 Q：无共振
      offsetGuard: 0.01,    // 噪声 offset 与缓冲末尾的安全余量
    },
  },

  // ---------------- 原有 10 个音效 ----------------

  // ui：triangle 软 blip 小幅下滑(中频 body) + 极轻 3kHz 点击；去掉 square 的刺耳感
  ui: {
    layers: [
      { k: 'tone', type: 'triangle', f0: 520, f1: 400, dur: 0.05, attack: 0.004, peak: 0.22, lp: 4000 },
      { k: 'noise', ftype: 'bandpass', f: 3200, q: 2, dur: 0.012, attack: 0.002, peak: 0.012 },
    ],
  },

  // card：骨架=慢起音的中频气声扫过(300→900) + 低频"拍桌"闷点 + 尾部极轻 air 轻弹
  card: {
    layers: [
      { k: 'noise', ftype: 'bandpass', f: 300, sweepTo: 900, q: 0.8, dur: 0.2, attack: 0.04, peak: 0.3 },
      { k: 'tone', type: 'sine', f0: 150, f1: 100, dur: 0.1, attack: 0.004, peak: 0.16 },
      { k: 'noise', ftype: 'bandpass', f: 3500, sweepTo: 5000, q: 1.5, dur: 0.05, attack: 0.01, peak: 0.018, delay: 0.12 },
    ],
  },

  // draw：骨架=triangle 上行轻点(中频) + 窄带纸张沙沙 + 极轻 4kHz 瞬态
  draw: {
    layers: [
      { k: 'tone', type: 'triangle', f0: 420, f1: 560, dur: 0.08, attack: 0.005, peak: 0.2, lp: 3000 },
      { k: 'noise', ftype: 'bandpass', f: 650, q: 1.4, dur: 0.07, attack: 0.004, peak: 0.12 },
      { k: 'noise', ftype: 'bandpass', f: 4200, q: 2, dur: 0.02, attack: 0.002, peak: 0.012 },
    ],
  },

  // hit：骨架=低频冲击。120Hz 起的 sine(重量) + 180Hz triangle body(小喇叭可闻)
  //       + 低通噪声碎裂 + 极轻 air。限流：并发≤2、间隔≥90ms。
  hit: {
    loudMul: 1.5,
    limit: { minGap: 90, maxVoices: 2, lifeMs: 320 },
    layers: [
      { k: 'tone', type: 'sine', f0: 120, f1: 92, dur: 0.26, attack: 0.004, peak: 0.45 },
      { k: 'tone', type: 'triangle', f0: 180, f1: 140, dur: 0.18, attack: 0.003, peak: 0.28, lp: 900 },
      { k: 'noise', ftype: 'lowpass', f: 500, q: 0.7, dur: 0.14, attack: 0.003, peak: 0.2 },
      { k: 'noise', ftype: 'bandpass', f: 3000, q: 1, dur: 0.02, attack: 0.002, peak: 0.015 },
    ],
  },

  // heal：骨架=纯 sine 双音上行(440→660→880)，慢起音，165Hz 暖底，极轻 air 微光
  heal: {
    layers: [
      { k: 'tone', type: 'sine', f0: 440, f1: 660, dur: 0.26, attack: 0.02, peak: 0.22 },
      { k: 'tone', type: 'sine', f0: 660, f1: 880, dur: 0.2, attack: 0.02, peak: 0.14, delay: 0.1 },
      { k: 'tone', type: 'sine', f0: 165, dur: 0.3, attack: 0.03, peak: 0.08 },
      { k: 'tone', type: 'sine', f0: 2800, dur: 0.1, attack: 0.01, peak: 0.008, delay: 0.1 },
    ],
  },

  // skill（长）：骨架=非谐波金属铃(基频×2.76×5.4) + 110Hz 低频托底，起音快衰减长
  skill: {
    long: true,
    layers: [
      { k: 'tone', type: 'sine', f0: 440, dur: 0.55, attack: 0.004, peak: 0.2 },
      { k: 'tone', type: 'sine', f0: 1214, dur: 0.36, attack: 0.003, peak: 0.07, delay: 0.01 },
      { k: 'tone', type: 'sine', f0: 2376, dur: 0.2, attack: 0.002, peak: 0.012, delay: 0.02 },
      { k: 'tone', type: 'sine', f0: 110, dur: 0.45, attack: 0.01, peak: 0.15 },
    ],
  },

  // turn（长）：骨架=低频钟(110/220/330 谐波叠加，高次衰减更快) + 低通噪声"槌击"
  turn: {
    long: true,
    layers: [
      { k: 'tone', type: 'sine', f0: 110, f1: 105, dur: 0.8, attack: 0.012, peak: 0.26 },
      { k: 'tone', type: 'sine', f0: 220, f1: 214, dur: 0.65, attack: 0.01, peak: 0.12 },
      { k: 'tone', type: 'sine', f0: 330, f1: 322, dur: 0.5, attack: 0.01, peak: 0.06 },
      { k: 'noise', ftype: 'lowpass', f: 420, q: 0.7, dur: 0.06, attack: 0.003, peak: 0.08 },
    ],
  },

  // win（长）：骨架=triangle(+低通) 大调琶音(G-B-D-G)，98Hz 低频托底，末音 air 闪光
  win: {
    long: true,
    layers: [
      { k: 'arp', type: 'triangle', notes: [392, 494, 587, 784], step: 0.1, dur: 0.24, attack: 0.006, peak: 0.22, lp: 3500 },
      { k: 'tone', type: 'sine', f0: 98, dur: 0.6, attack: 0.01, peak: 0.14 },
      { k: 'tone', type: 'sine', f0: 1568, dur: 0.3, attack: 0.003, peak: 0.01, delay: 0.3 },
    ],
  },

  // lose：骨架=sine 小调下行(每音带下滑，慢起音) + 末尾低频沉底
  lose: {
    layers: [
      { k: 'arp', type: 'sine', notes: [330, 262, 220], step: 0.17, slide: 0.97, dur: 0.36, attack: 0.02, peak: 0.26 },
      { k: 'tone', type: 'sine', f0: 98, f1: 82, dur: 0.6, attack: 0.03, peak: 0.18, delay: 0.32 },
    ],
  },

  // tick：骨架=木鱼感。triangle 640(低通) + sine 320 body，极轻 4kHz 点击；去掉 square
  tick: {
    layers: [
      { k: 'tone', type: 'triangle', f0: 640, dur: 0.045, attack: 0.002, peak: 0.16, lp: 4000 },
      { k: 'tone', type: 'sine', f0: 320, dur: 0.06, attack: 0.002, peak: 0.12 },
      { k: 'noise', ftype: 'bandpass', f: 4000, q: 2, dur: 0.01, attack: 0.001, peak: 0.01 },
    ],
  },

  // ---------------- 新增音效 ----------------

  // judge：骨架=极快起音的单点"叮"，非谐波金属泛音(×2.76/×5.4)，196Hz 轻底；无低频长尾
  judge: {
    layers: [
      { k: 'tone', type: 'sine', f0: 784, dur: 0.4, attack: 0.002, peak: 0.22 },
      { k: 'tone', type: 'sine', f0: 2164, dur: 0.25, attack: 0.002, peak: 0.05 },
      { k: 'tone', type: 'sine', f0: 4234, dur: 0.1, attack: 0.001, peak: 0.01 },
      { k: 'tone', type: 'sine', f0: 196, dur: 0.12, attack: 0.004, peak: 0.08 },
    ],
  },

  // equip：骨架=两段式扣合(<200ms)。先"咔"：低频 clunk + 窄带噪声；70ms 后"嗒"：双非谐波环鸣
  equip: {
    layers: [
      { k: 'tone', type: 'sine', f0: 150, f1: 110, dur: 0.08, attack: 0.003, peak: 0.2 },
      { k: 'tone', type: 'triangle', f0: 300, f1: 180, dur: 0.06, attack: 0.002, peak: 0.28, lp: 2500 },
      { k: 'noise', ftype: 'bandpass', f: 900, q: 4, dur: 0.03, attack: 0.002, peak: 0.15 },
      { k: 'tone', type: 'sine', f0: 620, dur: 0.1, attack: 0.002, peak: 0.1, delay: 0.07 },
      { k: 'tone', type: 'sine', f0: 1030, dur: 0.08, attack: 0.002, peak: 0.06, delay: 0.07 },
      { k: 'noise', ftype: 'bandpass', f: 4000, q: 2, dur: 0.015, attack: 0.001, peak: 0.012, delay: 0.07 },
    ],
  },

  // chain：骨架=电流感。三层全部做振幅颤音：中频噪声(38Hz) + 低通锯齿嗡鸣(24Hz) + 高频滑升 triangle(32Hz)
  chain: {
    layers: [
      { k: 'noise', ftype: 'bandpass', f: 900, sweepTo: 1400, q: 3, dur: 0.3, attack: 0.01, peak: 0.2, trem: { rate: 38, depth: 0.8 } },
      { k: 'tone', type: 'sawtooth', f0: 100, dur: 0.3, attack: 0.01, peak: 0.1, lp: 600, trem: { rate: 24, depth: 0.7 } },
      { k: 'tone', type: 'triangle', f0: 2800, f1: 3600, dur: 0.26, attack: 0.006, peak: 0.02, lp: 6000, trem: { rate: 32, depth: 0.9 } },
    ],
  },

  // nullify：骨架=120ms 下行"嗤"。噪声带通 2200→300 快速下扫 + sine 520→180 下滑
  nullify: {
    layers: [
      { k: 'noise', ftype: 'bandpass', f: 2200, sweepTo: 300, q: 1.2, dur: 0.12, attack: 0.004, peak: 0.3 },
      { k: 'tone', type: 'sine', f0: 520, f1: 180, dur: 0.1, attack: 0.004, peak: 0.12 },
    ],
  },

  // dying：骨架=纯低频"咚—咚"心跳(约 500ms)。sine 为重量，低通 triangle 补小喇叭可闻度；无高频，克制
  dying: {
    layers: [
      { k: 'tone', type: 'sine', f0: 105, f1: 75, dur: 0.14, attack: 0.008, peak: 0.4 },
      { k: 'tone', type: 'triangle', f0: 210, f1: 150, dur: 0.1, attack: 0.006, peak: 0.1, lp: 500 },
      { k: 'noise', ftype: 'lowpass', f: 220, q: 0.7, dur: 0.08, attack: 0.005, peak: 0.05 },
      { k: 'tone', type: 'sine', f0: 95, f1: 68, dur: 0.22, attack: 0.01, peak: 0.3, delay: 0.26 },
      { k: 'tone', type: 'triangle', f0: 190, f1: 140, dur: 0.16, attack: 0.008, peak: 0.08, lp: 500, delay: 0.26 },
    ],
  },

  // round：骨架=柔钟收尾(400ms)。两条微失谐 sine(440/447 产生拍频) + 220 低八度，慢起音
  round: {
    layers: [
      { k: 'tone', type: 'sine', f0: 440, dur: 0.4, attack: 0.015, peak: 0.12 },
      { k: 'tone', type: 'sine', f0: 447, dur: 0.4, attack: 0.015, peak: 0.12 },
      { k: 'tone', type: 'sine', f0: 220, dur: 0.35, attack: 0.015, peak: 0.1 },
    ],
  },

  // deny：骨架=60ms 钝响。低通 triangle + 低频 sine + 低通噪声，整体音量低，避免盖过正常音效
  deny: {
    layers: [
      { k: 'tone', type: 'triangle', f0: 260, f1: 190, dur: 0.055, attack: 0.003, peak: 0.1, lp: 900 },
      { k: 'tone', type: 'sine', f0: 140, f1: 110, dur: 0.05, attack: 0.003, peak: 0.07 },
      { k: 'noise', ftype: 'lowpass', f: 400, q: 0.7, dur: 0.04, attack: 0.002, peak: 0.04 },
    ],
  },
};

const SYS = SFX_P.sys;
const D = SYS.defaults;

// ------------------------------------------------------------------
// 状态
// ------------------------------------------------------------------
let AC = null;
let master = null;     // 短音效总线（会被 ducking 压低）
let longBus = null;    // 长音效总线（不被自身 ducking 压住）
let noiseBuf = null;
let active = 0;
let gainMul = 1;       // 播放期间的增益倍数（loud / 合并加强）
let curBus = null;
let duckTimer = null;
let restoreTimer = null;
const live = new Set();   // 正在播放的音源，静音时统一停掉
const stats = {};         // 每个音效名的限流状态

let muted = (() => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
})();

export function isSfxOn() { return !muted; }

export function setSfx(on) {
  muted = !on;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch {}
  if (muted) stopAll();
}

export function toggleSfx() { setSfx(muted); return !muted; }

function ctx() {
  if (AC) {
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  AC = new C();

  master = AC.createGain();
  master.gain.value = SYS.master.gain;
  longBus = AC.createGain();
  longBus.gain.value = SYS.master.gain;

  const comp = AC.createDynamicsCompressor();
  const c = SYS.comp;
  comp.threshold.value = c.threshold;
  comp.knee.value = c.knee;
  comp.ratio.value = c.ratio;
  comp.attack.value = c.attack;
  comp.release.value = c.release;

  const hp = AC.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = SYS.hp.freq;
  hp.Q.value = SYS.hp.q;

  master.connect(comp);
  longBus.connect(comp);
  comp.connect(hp);
  hp.connect(AC.destination);
  curBus = master;

  // 白噪声缓冲（复用；每次随机 offset 起播）
  const len = Math.floor(AC.sampleRate * SYS.noiseSec);
  noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return AC;
}

// 用户首次交互时解锁
export function unlockSfx() {
  const a = ctx();
  if (a && a.state === 'suspended') a.resume().catch(() => {});
}

function stopAll() {
  Object.keys(stats).forEach((k) => {
    const S = stats[k];
    if (S.timer) clearTimeout(S.timer);
    S.timer = null; S.merged = 0; S.recent = []; S.voices = [];
  });
  clearTimeout(duckTimer);
  clearTimeout(restoreTimer);
  live.forEach((s) => { try { s.stop(); } catch {} });
  live.clear();
  if (!AC || !master) return;
  const t = AC.currentTime;
  [master, longBus].forEach((g) => {
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, SYS.stop.fadeTc);
    } catch {}
  });
  restoreTimer = setTimeout(() => {
    if (!AC) return;
    const n = AC.currentTime;
    [master, longBus].forEach((g) => {
      try {
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(SYS.master.gain, n);
      } catch {}
    });
  }, SYS.stop.restoreMs);
}

// ------------------------------------------------------------------
// 合成原语
// ------------------------------------------------------------------
function env(g, t0, a, d, peak) {
  g.gain.setValueAtTime(D.floor, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, D.peakMin), t0 + a);
  g.gain.exponentialRampToValueAtTime(D.floor, t0 + a + d);
}

// 登记音源：静音时可统一停止；播完自动断开节点
function track(src, nodes) {
  live.add(src);
  src.onended = () => {
    live.delete(src);
    nodes.forEach((n) => { try { n.disconnect(); } catch {} });
  };
}

// 振幅颤音：增益在 [1-depth, 1] 之间被 LFO 摆动
function tremStage(g, t0, end, trem) {
  if (!trem) return g;
  const tg = AC.createGain();
  tg.gain.value = 1 - trem.depth / 2;
  const lfo = AC.createOscillator();
  lfo.frequency.value = trem.rate;
  const lg = AC.createGain();
  lg.gain.value = trem.depth / 2;
  lfo.connect(lg);
  lg.connect(tg.gain);
  g.connect(tg);
  lfo.start(t0);
  lfo.stop(end);
  track(lfo, [lfo, lg, tg]);
  return tg;
}

function tone(L) {
  const t0 = AC.currentTime + (L.delay || 0);
  const a = L.attack ?? D.attack;
  const end = t0 + a + L.dur + D.tail;
  const o = AC.createOscillator();
  o.type = L.type || 'sine';
  o.frequency.setValueAtTime(L.f0, t0);
  if (L.f1 && L.f1 !== L.f0) {
    o.frequency.exponentialRampToValueAtTime(Math.max(D.minOscHz, L.f1), t0 + a + L.dur);
  }
  const nodes = [o];
  let src = o;
  if (L.lp) {
    const f = AC.createBiquadFilter();   // 2 阶低通 = -12dB/oct
    f.type = 'lowpass';
    f.frequency.value = L.lp;
    f.Q.value = D.lpQ;
    o.connect(f);
    src = f;
    nodes.push(f);
  }
  const g = AC.createGain();
  env(g, t0, a, L.dur, L.peak * gainMul);
  src.connect(g);
  nodes.push(g);
  const out = tremStage(g, t0, end, L.trem);
  out.connect(curBus);
  o.start(t0);
  o.stop(end);
  track(o, nodes);
}

function noise(L) {
  const t0 = AC.currentTime + (L.delay || 0);
  const a = L.attack ?? D.attack;
  const end = t0 + a + L.dur + D.tail;
  const s = AC.createBufferSource();
  s.buffer = noiseBuf;
  const f = AC.createBiquadFilter();
  f.type = L.ftype || 'bandpass';
  f.frequency.setValueAtTime(L.f, t0);
  if (L.sweepTo) {
    f.frequency.exponentialRampToValueAtTime(Math.max(D.minFilterHz, L.sweepTo), t0 + a + L.dur);
  }
  f.Q.value = L.q ?? 1;
  const g = AC.createGain();
  env(g, t0, a, L.dur, L.peak * gainMul);
  s.connect(f);
  f.connect(g);
  const out = tremStage(g, t0, end, L.trem);
  out.connect(curBus);
  // 随机 offset 起播，避免每次都是同一段噪声
  const maxOff = Math.max(0, noiseBuf.duration - (a + L.dur + D.tail) - D.offsetGuard);
  s.start(t0, Math.random() * maxOff);
  s.stop(end);
  track(s, [s, f, g]);
}

function arp(L) {
  L.notes.forEach((f, i) => tone({
    type: L.type,
    f0: f,
    f1: L.slide ? f * L.slide : 0,
    dur: L.dur,
    attack: L.attack,
    peak: L.peak,
    lp: L.lp,
    delay: (L.delay || 0) + i * L.step,
  }));
}

const LAYER = { tone, noise, arp };

function playSound(P, loud, boost) {
  gainMul = boost * (loud ? (P.loudMul ?? SYS.loudMul) : 1);
  curBus = P.long ? longBus : master;
  try {
    P.layers.forEach((L) => { const fn = LAYER[L.k]; if (fn) fn(L); });
  } finally {
    gainMul = 1;
    curBus = master;
  }
}

// ------------------------------------------------------------------
// Ducking：长音效起播时压低 master（短音效总线），holdMs 后恢复
// ------------------------------------------------------------------
function duck() {
  const k = SYS.duck;
  const t = AC.currentTime;
  try {
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(SYS.master.gain * k.ratio, t, k.attackTc);
  } catch {}
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => {
    if (!AC || !master || muted) return;
    const n = AC.currentTime;
    try {
      master.gain.cancelScheduledValues(n);
      master.gain.setTargetAtTime(SYS.master.gain, n, k.releaseTc);
    } catch {}
  }, k.holdMs);
}

// ------------------------------------------------------------------
// 限流：并发上限 / 最小间隔 / 窗口内合并
// ------------------------------------------------------------------
function st(name) {
  return stats[name] || (stats[name] = { last: 0, recent: [], timer: null, merged: 0, loud: false, voices: [] });
}

function soundOf(name) {
  if (!Object.prototype.hasOwnProperty.call(SFX_P, name)) return null;
  const P = SFX_P[name];
  return P && Array.isArray(P.layers) ? P : null;
}

function fire(name, P, loud, merged) {
  if (muted) return;
  const a = ctx();
  if (!a || a.state !== 'running') return;
  const S = st(name);
  const L = P.limit || {};
  const now = performance.now();
  S.voices = S.voices.filter((t) => t > now);
  if (S.voices.length >= (L.maxVoices || SYS.maxVoicesDefault)) return;
  if (active >= SYS.maxActive) return;
  S.last = now;
  S.voices.push(now + (L.lifeMs || SYS.lifeMs));
  active++;
  setTimeout(() => { active = Math.max(0, active - 1); }, SYS.activeMs);
  const M = SYS.merge;
  const boost = 1 + Math.min(M.boostMax, M.boostStep * merged);
  if (P.long) duck();
  try { playSound(P, loud, boost); } catch {}
}

function schedule(name, P, loud) {
  const S = st(name);
  const L = P.limit || {};
  const M = SYS.merge;
  const now = performance.now();
  S.recent = S.recent.filter((t) => now - t < M.windowMs);
  S.recent.push(now);

  // 已有待播的合并/延后任务：并入它（只播一次，略加强）
  if (S.timer) { S.merged++; S.loud = S.loud || loud; return; }

  const gapWait = Math.max(0, S.last + (L.minGap || 0) - now);
  const mergeNow = S.recent.length >= M.count;
  if (!gapWait && !mergeNow) { fire(name, P, loud, 0); return; }

  let wait = gapWait;
  if (mergeNow) {
    wait = Math.max(wait, M.windowMs - (now - S.recent[0]));
    S.merged = 1;
  } else {
    S.merged = 0;   // 仅因最小间隔延后，不加强
  }
  S.loud = loud;
  S.timer = setTimeout(() => {
    const m = S.merged;
    const l = S.loud;
    S.timer = null; S.merged = 0; S.recent = [];
    fire(name, P, l, m);
  }, wait);
}

// ------------------------------------------------------------------
// 对外接口：arg 可为 true（loud）或 { loud: true }
// ------------------------------------------------------------------
export function sfx(name, arg) {
  if (muted) return;
  const P = soundOf(name);
  if (!P) return;
  const a = ctx();
  if (!a || a.state !== 'running') return;
  const loud = arg === true || !!(arg && arg.loud === true);
  schedule(name, P, loud);
}

// 首次任意指针/键盘交互自动解锁（只绑一次）
let bound = false;
export function bindSfxUnlock() {
  if (bound) return;
  bound = true;
  const h = () => { unlockSfx(); window.removeEventListener('pointerdown', h, true); window.removeEventListener('keydown', h, true); };
  window.addEventListener('pointerdown', h, true);
  window.addEventListener('keydown', h, true);
}
