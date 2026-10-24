// 技能实战触发统计：node tools/trigcheck.js [局数]
// 强制座位从含 界/谋/极 技能的武将中抽取，统计日志里各技能中文名触发次数。
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { GENERALS } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeRng } from '../src/engine/rng.js';
import { getSkill } from '../src/engine/skill.js';

const N = Number(process.argv[2] || 30);
const COLORS = ['jie', 'mou', 'ji'];
const isColor = (s) => COLORS.some(k => s.startsWith(k + '_'));
const pool = GENERALS.filter(g => (g.skills || []).some(isColor));
const nameOf = new Map();
for (const g of pool) for (const s of g.skills) if (isColor(s)) { const sk = getSkill(s); if (sk && sk.name) nameOf.set(s, sk.name); }

const hits = new Map();
const seenGen = new Set();

async function playOne(modeId, seatCount, seed) {
  const rng = makeRng(seed);
  const cands = [...pool];
  const used = new Set();
  const seats = [];
  for (let i = 0; i < seatCount; i++) {
    const avail = cands.filter(g => !used.has(g.id));
    const g = avail[rng.int(avail.length)];
    used.add(g.id); seenGen.add(g.id);
    seats.push({ id: `s${i}`, name: `P${i}`, isAI: true, general: g });
  }
  const mode = getMode(modeId);
  const game = new Game({ seats, mode, seed, responder: makeAIResponder(0), deckEntries: deckEntries(mode.deck), config: { timeout: 5000 } });
  const aiMap = new Map();
  const pick = (p) => { if (!aiMap.has(p.seat)) aiMap.set(p.seat, makeAIResponder(p.seat)); return aiMap.get(p.seat); };
  game.responder = { askPlay: (g, p) => pick(p).askPlay(g, p), ask: (g, p, req) => pick(p).ask(g, p, req) };
  game.onState = () => {};
  const origLog = game.log.bind(game);
  game.log = async (text, extra) => { for (const [, nm] of nameOf) if (text.includes(`【${nm}】`)) hits.set(nm, (hits.get(nm) || 0) + 1); return origLog(text, extra); };
  const r = await game.run();
  return r;
}

const CASES = [['identity', 5], ['identity', 5], ['junzheng', 5], ['identity', 4], ['junzheng', 4], ['identity', 6]];
let errs = 0;
for (let i = 0; i < N; i++) {
  const [m, n] = CASES[i % CASES.length];
  try { await playOne(m, n, 770000 + i * 53); } catch (e) { errs++; console.log('ERR', m, n, e.message); }
}
const allNames = [...new Set([...nameOf.values()])].sort();
const hit = allNames.filter(n => hits.has(n));
const miss = allNames.filter(n => !hits.has(n));
console.log(`局数 ${N} / 异常 ${errs} / 参与武将 ${seenGen.size}/${pool.length}`);
console.log(`触发技能 ${hit.length}/${allNames.length}`);
console.log(hit.map(n => `${n}×${hits.get(n)}`).join('  '));
if (miss.length) console.log('未触发:', miss.join(' '));
