// 验证：快照 JSON 是否把「天机/谋」标记带到前端（前端靠 __tz/__mou 区分显示）
import '../src/skills/index.js';
import { Game } from '../src/engine/index.js';
import { generalById } from '../src/data/generals.js';
import { deckEntries } from '../src/data/deck.js';
import { getMode } from '../src/modes/index.js';
import { CARD_META } from '../src/engine/cards.js';

const card = (id, name, suit = 'spade', num = 7) => ({ id, name, suit, num, type: CARD_META[name]?.type });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const seats = ['custom_zhugeliang', 'sunquan'].map((id, i) => ({ id: `s${i}`, name: `P${i}`, isAI: true, general: generalById(id) }));
const g = new Game({
  seats, mode: getMode('duel'), seed: 4242,
  responder: {
    askPlay: async () => ({ endPhase: true }),
    ask: async (gg, p, req) => {
      if (req.kind === 'confirm') return { yes: true };
      if (req.kind === 'choice') return { index: 0 };
      if (req.kind === 'card') return { cardId: (p.hand[0] || {}).id };
      if (req.kind === 'targets') return { seats: [1] };
      return null;
    },
  },
  deckEntries: deckEntries('duel'), config: { timeout: 1000 },
});
g.onState = () => {};
const p = g.players[0];
await g.trigger('turn.begin', { self: p, player: p });
await g.trigger('turn.begin', { self: g.players[1], player: p });

const snap = g.snapshot(0);
const json = JSON.stringify(snap);
const me = snap.players[0];
ok(me.extraZone && me.extraZone.tianji === 2, `快照应带 extraZone.tianji 张数（实际 ${JSON.stringify(me.extraZone)}）`);
ok(me.gong === 0 || typeof me.gong === 'number', '快照应带 gong 字段');
ok(json.includes('"__tz":"tianji"'), '手牌 JSON 应带 __tz="tianji" 标记（前端据此显示「天机」）');

await g.trigger('round.begin', { self: g.players[1], player: p, round: 2 });
const snap2 = g.snapshot(0);
const json2 = JSON.stringify(snap2);
ok(snap2.players[0].extraZone.tianji === 0 && snap2.players[0].extraZone.mou === 2,
  `转为「谋」后快照计数应更新（${JSON.stringify(snap2.players[0].extraZone)}）`);
ok(json2.includes('"__mou":true'), '手牌 JSON 应带 __mou=true 标记（前端据此显示「谋」）');

// 模拟前端 renderHand 的判定逻辑，确认三态可区分
const kinds = snap2.players[0].hand.map(c => (c.__tz === 'tianji' ? '天机' : c.__mou ? '谋' : '普通'));
ok(kinds.filter(k => k === '谋').length === 2, `前端应能识别 2 张「谋」（实际 ${JSON.stringify(kinds)}）`);
ok(kinds.includes('普通'), '同手牌中的普通牌不应被标记');

console.log(`\n快照标记验证：通过 ${pass} / 失败 ${fail}`);
if (fail) process.exit(1);
