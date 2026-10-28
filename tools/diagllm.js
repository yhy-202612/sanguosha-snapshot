// LLM 单步诊断：node tools/diagllm.js <deepseek|glm> [low|high]
// 用固定局面重复 8 次决策，打印耗时 / 是否成功 / 模型给的理由 / 失败原因（需要对应 *_API_KEY）
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { makeAIResponder } from '../src/ai/index.js';
import { makeLLMBrain, llmStats, resetLLMStats } from '../src/ai/llm.js';

const model = process.argv[2] || 'deepseek';
let uid = 0;
const mk = (name, suit = 'spade', num = 7) => ({ id: `d${++uid}`, name, suit, num, type: 'basic' });
function newGame(seed = 7) {
  const gens = ['sunquan', 'caocao', 'liubei', 'guanyu'];
  const seats = gens.map((gid, i) => ({ id: `p${i}`, name: `P${i}`, isAI: true, general: generalById(gid) }));
  const g = new Game({ seats, mode: getMode('identity'), seed, deckEntries: deckEntries('standard'),
    responder: makeAIResponder(0), config: { timeout: 500 } });
  g.onState = () => {}; g.turnCount = 3; g.phase = 'play';
  for (const p of g.players) { p.hand = []; p.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null, treasure: null }; p.hp = 4; p.maxHp = 4; }
  g.players[0].role = 'lord'; g.players[1].role = 'rebel'; g.players[2].role = 'loyalist'; g.players[3].role = 'rebel';
  return g;
}
const g = newGame();
const me = g.players[0];
me.hand = [mk('sha'), mk('shan'), mk('tao'), mk('wuzhong'), mk('guohe'), mk('qinggang')];
for (let i = 0; i < 8; i++) {
  resetLLMStats();
  const brain = makeLLMBrain(0, { model, level: process.argv[3] || 'low' });
  const t0 = Date.now();
  const ans = await brain.askPlay(g, me);
  const s = llmStats();
  console.log(`#${i} ${Date.now() - t0}ms calls=${s.calls} fails=${s.fails} why="${s.lastWhy}" err="${s.lastErr}" ans=${JSON.stringify(ans)?.slice(0, 70)}`);
}
