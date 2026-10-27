// 音效层冒烟（无需浏览器/无需 jsdom）：node tools/sfxcheck.mjs
// stub WebAudio，逐个触发全部 17 个音效，验证不抛错、确实起播音源、限流与静音总闸有效
class Param {
  constructor(v) { this.value = v; this._calls = []; }
  setValueAtTime(v, t) { this._calls.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { if (!(v > 0)) throw new Error('exp ramp to ' + v + ' (must be >0)'); if (!isFinite(t)) throw new Error('bad time'); this._calls.push(['exp', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this._calls.push(['lin', v, t]); return this; }
  setTargetAtTime(v, t, tc) { this._calls.push(['target', v, t, tc]); return this; }
  cancelScheduledValues(t) { this._calls.push(['cancel', t]); return this; }
}

let created = { osc: 0, gain: 0, filter: 0, buf: 0, comp: 0, hp: 0, started: 0 };

class FakeAudioContext {
  constructor() { this.sampleRate = 48000; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
  createGain() { created.gain++; return { gain: new Param(1), connect: () => ({}) }; }
  createOscillator() {
    created.osc++;
    return { type: 'sine', frequency: new Param(440), connect: () => ({}), start: () => { created.started++; }, stop: () => {}, onended: null };
  }
  createBiquadFilter() { created.filter++; return { type: 'lowpass', frequency: new Param(1000), Q: new Param(1), connect: () => ({}) }; }
  createBufferSource() {
    created.buf++;
    return { buffer: null, connect: () => ({}), start: () => { created.started++; }, stop: () => {}, onended: null };
  }
  createBuffer(ch, len, sr) {
    const data = new Float32Array(len);
    return { duration: len / sr, getChannelData: () => data, length: len, sampleRate: sr };
  }
  createDynamicsCompressor() {
    created.comp++;
    return {
      threshold: new Param(-24), knee: new Param(30), ratio: new Param(12),
      attack: new Param(0.003), release: new Param(0.25), connect: () => ({}),
    };
  }
  resume() { return Promise.resolve(); }
}

const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const listeners = [];
global.window = {
  AudioContext: FakeAudioContext,
  addEventListener: (t, fn) => listeners.push([t, fn]),
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false }),
};
global.document = { documentElement: { getPropertyValue: () => '0.2s' }, getElementById: () => null };

const NAMES = ['ui', 'card', 'draw', 'hit', 'heal', 'skill', 'turn', 'win', 'lose', 'tick',
  'judge', 'equip', 'chain', 'nullify', 'dying', 'round', 'deny'];

const mod = await import(new URL('../client/audio.js', import.meta.url).href);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };

ok(mod.isSfxOn() === true, '默认非静音');
ok(typeof mod.sfx === 'function', '导出 sfx');
for (const fn of ['setSfx', 'toggleSfx', 'unlockSfx', 'bindSfxUnlock']) ok(typeof mod[fn] === 'function', '导出 ' + fn);

mod.unlockSfx();
ok(created.comp >= 1, '输出链含 DynamicsCompressor（limiter）');
ok(created.filter >= 1, '输出链含 BiquadFilter（highpass）');

// 逐个音效触发
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const n of NAMES) {
  await sleep(460);  // 等活跃名额释放（maxActive=8 / activeMs=420，这是设计行为）
  const before = { ...created };
  let err = null;
  try { mod.sfx(n); } catch (e) { err = e; }
  ok(!err, `音效 ${n} 不抛异常${err ? '：' + err.message : ''}`);
  ok(created.started > before.started, `音效 ${n} 确实创建并起播了音源`);
}

// loud 语义
await sleep(460);
const b2 = created.started;
mod.sfx('hit', true);
ok(created.started > b2, 'loud 参数 true 能播放');
await sleep(460);
const b2b = created.started;
mod.sfx('hit', { loud: true });
ok(created.started > b2b, 'loud 参数 {loud:true} 能播放');

// 未知名不报错
let bad = null;
try { mod.sfx('nonexistent-sfx'); } catch (e) { bad = e; }
ok(!bad, '未知名音效安全忽略');

// 静音总闸
mod.setSfx(false);
ok(mod.isSfxOn() === false, 'setSfx(false) 生效');
const b3 = created.started;
mod.sfx('ui'); mod.sfx('hit'); mod.sfx('win');
ok(created.started === b3, '静音时完全不产生音源');
mod.setSfx(true);
ok(mod.isSfxOn() === true, 'setSfx(true) 恢复');
await sleep(460);
const b4 = created.started;
mod.sfx('ui');
ok(created.started > b4, '恢复后能再次发声');
ok(store.get('sg_sfx_muted') === '0', '静音状态写入 localStorage');

// 高频连打（限流/合并不能抛错、不能爆音源）
const b5 = created.started;
let e5 = null;
try { for (let i = 0; i < 40; i++) { mod.sfx('hit'); mod.sfx('tick'); } } catch (e) { e5 = e; }
ok(!e5, '40 连打不抛异常' + (e5 ? '：' + e5.message : ''));
const add = created.started - b5;
ok(add < 40 * 2 * 6, `连打被限流/合并（新增音源 ${add}，未放大到 40×2×多层）`);

// 全量节点统计（信息）
console.log(`\n节点统计：osc=${created.osc} buf=${created.buf} gain=${created.gain} filter=${created.filter} comp=${created.comp} started=${created.started}`);
console.log(`\n=== audio smoke：通过 ${pass} / 失败 ${fail} ===`);
process.exit(fail ? 1 : 0);
