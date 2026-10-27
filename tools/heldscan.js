// 运行时「持有型容器」扫描（SG029 §C1）
// 目的：找出所有把牌对象存进 player.flags / player.marks 的容器，
//      这些容器在持有者死亡 / 技能被禁用 / 装备变化时必须显式回收，否则牌永久丢失。
// 运行：node tools/heldscan.js [局数]
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS, generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';

const N = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 40);
const FILLER = ['sunquan', 'caocao', 'liubei', 'guanyu', 'zhenji', 'zhouyu', 'huanggai', 'luxun', 'huatuo', 'lvbu', 'simayi', 'diaochan'];
const CASES = [['identity', 5], ['junzheng', 4], ['duel', 2], ['identity', 6], ['guozhan', 4]];

const isCard = (v) => v && typeof v === 'object' && v.id != null && typeof v.name === 'string';
const found = new Map();

function note(name, sample) {
  if (!found.has(name)) found.set(name, { hits: 0, sample: sample ? `${sample.name}#${sample.id}` : '' });
  found.get(name).hits++;
}
function scanHolders(g) {
  const walk = (obj, keypath) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'lastDodgeCards') continue;
      if (Array.isArray(v)) {
        const c0 = v.find(isCard);
        if (c0) note(keypath + k, c0);
        for (const x of v) walk(x, keypath + k + '.');
      } else if (v && typeof v === 'object') {
        if (isCard(v)) continue;
        if (Array.isArray(v.cards) && v.cards.some(isCard)) note(keypath + k + '.cards', v.cards.find(isCard));
        walk(v, keypath + k + '.');
      }
    }
  };
  for (const p of g.players) {
    walk(p.flags || {}, 'flags.');
    walk(p.marks || {}, 'marks.');
  }
}

let done = 0, failures = 0;
for (let i = 0; i < N; i++) {
  const [modeId, n] = CASES[i % CASES.length];
  const rng = makeRng(7600 + i);
  const pool = rng.shuffle(GENERALS.map(x => x.id));
  const seats = [];
  for (let k = 0; k < n; k++) {
    const id = k < pool.length ? pool[k] : FILLER[k % FILLER.length];
    seats.push({ id: `s${k}`, name: `P${k}`, isAI: true, general: generalById(id) });
  }
  const mode = getMode(modeId);
  const game = new Game({
    seats, mode, seed: 7600 + i,
    responder: makeAIResponder(0),
    deckEntries: deckEntries(mode.deck || 'standard'),
    config: { timeout: 5000 },
  });
  const aiMap = new Map();
  const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
  game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
  // 每次状态推送都扫一遍（覆盖中途形态）
  game.onState = () => { if (game.players) scanHolders(game); };
  try {
    await game.run();
    scanHolders(game);
    done++;
  } catch (e) {
    failures++;
    if (failures <= 3) console.error(`局 ${i} 异常：${e.message}`);
  }
}

console.log(`\n跑完 ${done}/${N} 局（异常 ${failures}）\n`);
const rows = [...found.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.hits - a.hits);
console.log('=== 运行时观测到的 flags/marks 持牌容器 ===');
for (const r of rows) console.log(`${r.k.padEnd(32)} 命中 ${String(r.hits).padStart(6)}  样例 ${r.sample}`);
console.log(`\n共 ${rows.length} 个容器`);
