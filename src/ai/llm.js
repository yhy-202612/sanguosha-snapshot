// LLM 大脑：把「出牌阶段决策」交给大模型（DeepSeek / GLM），启发式只做候选生成与兜底
// ---------------------------------------------------------------------------
// 设计原则：
//   ① **永远只选合法候选**：候选集由引擎（candidatesFor / canUse / activeSkillsOf）生成，
//      大模型只做「从 N 个编号里选一个」，不生成任何牌名/目标 → 不会产生非法动作。
//   ② **失败必回落**：超时 / 非 JSON / 编号越界 / 接口报错 → 用启发式的首选动作，绝不卡住对局。
//   ③ **默认关闭**：房间 `aiBrain==='llm'` 才启用；密钥只读环境变量，永不下发前端。
//   ④ **强度两档**：
//      low  = 只在出牌阶段用 LLM，候选 = 启发式评分前 4 个（便宜、快）
//      high = 出牌阶段用 LLM + 关键响应（被杀/决斗时是否出牌）也用 LLM，候选 = 全部合法
// 环境变量：DEEPSEEK_API_KEY / GLM_API_KEY（GLM 走 wawapii 中转，需浏览器 UA）
import { CARD_META, EQUIP_SUB } from '../engine/cards.js';
import { AIPlayer, isEnemy, isFriend } from './index.js';

const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    keyEnv: 'DEEPSEEK_API_KEY',
    model: 'deepseek-flash',
    json: true,          // 支持 response_format: json_object
    effort: true,        // 支持 reasoning_effort：实测 low 把 9.2s 降到 4.0s，决策不变
  },
  glm: {
    label: 'GLM',
    url: 'https://wawapii.com/v1/chat/completions',
    keyEnv: 'GLM_API_KEY',
    model: 'glm-5.3-flash',   // glm-5.3 实测单次 37s，不适合实时对局
    json: false,               // 中转站不支持 response_format，靠提示词约束
    browserUA: true,           // wawapii 风控：无浏览器 UA 直接 403
  },
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function llmStatus() {
  const out = {};
  for (const [id, p] of Object.entries(PROVIDERS)) {
    out[id] = { label: p.label, model: p.model, ready: !!(process.env[p.keyEnv] || '').trim() };
  }
  return out;
}

export function llmEnabled() {
  return Object.values(PROVIDERS).some(p => (process.env[p.keyEnv] || '').trim());
}

// ---------------- 状态压缩（给大模型看的局面摘要） ----------------
const SLOT_CN = { weapon: '武器', armor: '防具', horsePlus: '+1马', horseMinus: '-1马', treasure: '宝物' };
const ROLE_CN = { lord: '主公', loyalist: '忠臣', rebel: '反贼', renegade: '内奸', boss: 'BOSS' };
const PHASE_CN = { prepare: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束' };

function cardText(c) {
  if (!c) return '';
  const cn = CARD_META[c.name]?.cn || c.name;
  const suit = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[c.suit] || '';
  return `${cn}${suit}${c.num ?? ''}`;
}

function equipText(p) {
  const list = Object.entries(p.equips || {}).filter(([, v]) => v).map(([k, v]) => `${SLOT_CN[k] || k}:${cardText(v)}`);
  return list.length ? list.join('、') : '无';
}

export function describeState(game, p) {
  const lines = [];
  const modeName = game.mode?.name || game.mode?.id || '';
  lines.push(`【对局】${modeName}，第 ${game.turnCount || 1} 回合，轮到【你】`);
  lines.push(`【你】座 ${p.seat + 1}，${p.generalName || p.name}${p.role ? `（${ROLE_CN[p.role] || p.role}）` : ''}，`
    + `${p.hp}/${p.maxHp} 血，手牌 ${p.hand.length} 张，装备：${equipText(p)}`);
  if (p.armor) lines.push(`【护甲】${p.armor}`);
  if ((p.judgeZone || []).length) lines.push(`【判定区】${p.judgeZone.map(z => CARD_META[z.name]?.cn || z.name).join('、')}`);
  lines.push('【你的手牌】' + (p.hand.map(cardText).join('、') || '无'));

  const others = game.alive().filter(x => x !== p);
  if (others.length) {
    lines.push('【场上其他角色】');
    for (const q of others) {
      const rel = isFriend(game, p, q) ? '友' : (isEnemy(game, p, q) ? '敌' : '?');
      lines.push(`- 座 ${q.seat + 1} ${q.generalName || q.name}${q.role ? `（${ROLE_CN[q.role] || q.role}）` : ''} `
        + `【${rel}】${q.hp}/${q.maxHp} 血，手牌 ${q.hand.length} 张，装备：${equipText(q)}`
        + (q.armor ? `，护甲 ${q.armor}` : ''));
    }
  }
  const skills = (game.activeSkillsOf?.(p) || []).map(s => s.name || s.id);
  if (skills.length) lines.push('【可发动的主动技】' + skills.join('、'));
  lines.push(`【当前】${PHASE_CN[game.phase] || game.phase || ''}阶段，本回合已出【杀】${p.flags?.shaUsed || 0} 次`);
  return lines.join('\n');
}

// ---------------- 候选动作枚举 ----------------
// 只产出「引擎认为合法」的动作：能出这张牌（canUse 通过）+ 目标来自 candidatesFor
function targetScore(game, me, card, t) {
  let s = 0;
  if (isEnemy(game, me, t)) s += 10;
  if (isFriend(game, me, t)) s -= 6;
  if (t === me) s += 3;
  if (t.hp <= 1) s += 4;                       // 补刀
  if (t.hp <= 0) s -= 20;
  if (card.name === 'tao') s = t === me ? 20 : (t.hp < t.maxHp ? 12 : -20);
  if (card.name === 'sha' && t.equips?.armor?.name === 'bagua') s -= 1;
  return s;
}

const SELF_TARGET_OK = new Set(['tao', 'jiu', 'wuzhong', 'tiesuo', 'wugu', 'shan']);

export function enumerateActions(game, me, { rich = true } = {}) {
  const acts = [];
  const push = (a) => { if (a) acts.push(a); };
  for (const c of me.hand) {
    const meta = CARD_META[c.name];
    if (!meta) continue;
    if (meta.sub) { push({ type: 'equip', card: c, label: `装备【${cardText(c)}】` }); continue; }
    let cands = [];
    try { cands = game.candidatesFor(me, c) || []; } catch { cands = []; }
    if (!cands.length && !SELF_TARGET_OK.has(c.name)) continue;
    const allowSelf = SELF_TARGET_OK.has(c.name);
    const scored = cands
      .filter(t => allowSelf || t !== me)
      .map(t => ({ t, s: targetScore(game, me, c, t) }))
      .sort((a, b) => b.s - a.s);
    if (!allowSelf && !scored.length) continue;
    const lim = rich ? 2 : 1;                       // 强度高 → 同一张牌给两个目标备选
    for (const { t } of scored.slice(0, lim)) {
      // ★候选动作必须过 canUse：否则「本回合【杀】已用尽」「本回合不能使用【杀】（将驰/自守）」
      //   「距离不足」等非法动作也会进候选表，模型选了被服务端拒绝后还会反复重试，
      //   对战报刷出大量「✗ 使用 杀 失败」并把回合耗光（截图实测 5 次以上）。
      let okUse = true;
      try { okUse = !!game.canUse(me, c, [t])?.ok; } catch { okUse = false; }
      if (!okUse) continue;
      push({ type: 'use', card: c, targets: [t], label: `使用【${cardText(c)}】→ 座 ${t.seat + 1} ${t.generalName || t.name}` });
    }
    if (c.name === 'sha' && game.alive().length > 2 && rich && scored.length >= 2) {
      // 【杀】的第二目标：只有 canUse 认为「双目标」合法时才产出（方天画戟等）
      const pair = [scored[0].t, scored[1].t];
      let okPair = false;
      try { okPair = !!game.canUse(me, c, pair)?.ok; } catch { okPair = false; }
      if (okPair) {
        push({ type: 'use', card: c, targets: pair, label: `使用【${cardText(c)}】→ 座 ${pair[0].seat + 1} 和座 ${pair[1].seat + 1}` });
      }
    }
  }
  // 【丈八蛇矛】：两张手牌当【杀】（手里没有真【杀】时才给出，优先用真杀）
  const zbW = me.equips && me.equips.weapon && me.equips.weapon.name === 'zhangba';
  if (zbW && me.hand.length >= 2 && !me.hand.some(c => c.name === 'sha')) {
    const pool = me.hand.filter(c => c.name !== 'tao' && c.name !== 'wuxie' && c.name !== 'shan');
    if (pool.length >= 2) {
      const pair = [pool[0], pool[1]];
      let okV = false;
      try { okV = !!game.virtualAllowed(me, pair, 'sha'); } catch { okV = false; }
      if (okV) {
        let cands2 = [];
        try { cands2 = game.candidatesFor(me, pair[0], 'sha') || []; } catch { cands2 = []; }
        const scored2 = cands2
          .filter(t => t !== me)
          .map(t => ({ t, s: targetScore(game, me, pair[0], t) }))
          .sort((a, b) => b.s - a.s);
        for (const { t } of scored2.slice(0, rich ? 2 : 1)) {
          let ok = false;
          try { ok = !!game.canUse(me, pair[0], [t], 'sha', [pair[1]])?.ok; } catch { ok = false; }
          if (!ok) continue;
          push({
            type: 'use', card: pair[0], extraCards: [pair[1]], asName: 'sha', targets: [t],
            label: `丈八蛇矛：${cardText(pair[0])}+${cardText(pair[1])} 当【杀】→ 座 ${t.seat + 1} ${t.generalName || t.name}`,
          });
        }
      }
    }
  }
  for (const sk of (game.activeSkillsOf?.(me) || [])) {
    push({ type: 'skill', skill: sk.id, label: `发动技能【${sk.name || sk.id}】` });
  }
  push({ type: 'end', label: '结束出牌阶段' });
  return acts;
}

// ---------------- LLM 调用 ----------------
// ★maxTokens 必须给足：deepseek-flash / glm 都是推理模型，推理 tokens 先于正文消耗，
//   实测 max_tokens=300 会 100% 被 reasoning 吃光、返回空 content（finish_reason=length）。
//   正文只要几十 token，剩下全是推理余量，这里给 1200 足够且成本可忽略。
async function chat(providerId, messages, { timeoutMs = 12000, maxTokens = 2000, effort = '' } = {}) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error(`unknown provider ${providerId}`);
  const key = (process.env[p.keyEnv] || '').trim();
  if (!key) throw new Error(`missing ${p.keyEnv}`);
  const body = { model: p.model, messages, max_tokens: maxTokens };
  if (p.json) body.response_format = { type: 'json_object' };
  // 推理强度：普通档压推理（快 2 倍左右），高强度档用模型默认的深思考
  if (p.effort && effort) body.reasoning_effort = effort;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (p.browserUA) headers['User-Agent'] = UA;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(p.url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ch = data?.choices?.[0] || {};
    const txt = String(ch.message?.content || '');
    // 推理把预算吃光 → 明确报错，避免被当成「模型乱答」而看不出真实原因
    if (!txt && ch.finish_reason === 'length') throw new Error('模型推理超出 token 预算');
    return txt;
  } finally {
    clearTimeout(timer);
  }
}

// 「只输出 JSON」的容错解析
// 三种真实情形都要吃下：deepseek 给 {"i":n}；GLM 经中转给 {"action":n}（还常套代码块围栏）；
// 偶发被截断/夹杂中文引号导致整段非法 JSON —— 此时只认「字段: 数字」这种明确写法，
// 绝不从自然语言里猜（"我选第 2 个" 必须拒绝，否则会误执行）。
export function parseDecision(text, max) {
  if (!text) return null;
  const inRange = (n) => Number.isInteger(n) && n >= 0 && n < max;
  const whyOf = (o) => {
    const w = o.why ?? o.reason ?? o.reasoning;
    return typeof w === 'string' ? w.trim().slice(0, 40) : '';
  };
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      const i = Number(obj.i ?? obj.index ?? obj.pick ?? obj.choose ?? obj.action ?? obj.choice ?? obj.n ?? obj.sel);
      if (inRange(i)) return { index: i, why: whyOf(obj) };
      if (Number.isInteger(i)) return null;      // 编号明确但越界 → 拒绝，不猜别的
    } catch { /* 整段非法：走下面的兜底 */ }
  }
  const lm = s.match(/["']?(?:i|index|pick|choose|action|choice|n|sel)["']?\s*[:：]\s*(\d{1,2})/i);
  if (lm && inRange(Number(lm[1]))) {
    const wm = s.match(/["']?(?:why|reason)["']?\s*[:：]\s*["']([^"'\n]{1,40})/);
    return { index: Number(lm[1]), why: wm ? wm[1].trim().slice(0, 40) : '' };
  }
  return null;
}

// ---------------- LLM 决策器 ----------------
const SYS_PLAY = `你是三国杀高手，正在替一个玩家做决策。
规则：
1. 只能从"候选动作"里选一个，输出 JSON：{"i": 编号, "why": "不超过12字的理由"}
2. 不要输出任何其他文字、不要解释规则、不要编造候选编号。
3. 判断原则：优先保住自己与队友、优先击杀残血敌人、手牌与装备的效率优先；
   能稳定获得收益（摸牌/拆关键装备/回血）时不要过早结束出牌阶段。`;
// 中转站的 GLM 习惯用 action 字段且不给理由，单独加一句约束（实测能稳定带上 why）
const SYS_PLAY_GLM = SYS_PLAY + '\n4. 必须输出 {"action": 编号, "why": "不超过12字的理由"}，why 不能省略。';

const STATS = { calls: 0, fails: 0, timeouts: 0, lastMs: 0, lastWhy: '', lastBy: '', avgMs: 0, degraded: 0, lastErr: '', throttled: 0 };
export function llmStats() { return { ...STATS }; }
export function resetLLMStats() {
  for (const k of Object.keys(STATS)) STATS[k] = k === 'lastWhy' || k === 'lastBy' || k === 'lastErr' ? '' : 0;
}

// 连续失败 N 次即「本座位本局降级为内置 AI」，避免接口挂掉后每回合干等超时
const BREAKER_LIMIT = 3;

// 全局调用限流：防止有人反复建房把 API 额度刷爆。
// 默认 120 次/分钟（一局 2 人约 30 次决策，够 4 局并行同开）；可用 LLM_RPM 覆盖。
const RL = { windowStart: 0, count: 0, throttled: 0 };
function allowCall() {
  const now = Date.now();
  if (now - RL.windowStart > 60000) { RL.windowStart = now; RL.count = 0; }
  const limit = Math.max(10, Number(process.env.LLM_RPM) || 120);
  if (RL.count >= limit) { RL.throttled++; return false; }
  RL.count++;
  return true;
}

export function makeLLMBrain(seatIndex, opts = {}) {
  const model = opts.model === 'glm' ? 'glm' : 'deepseek';
  const level = opts.level === 'high' ? 'high' : 'low';
  const inner = new AIPlayer(seatIndex);
  // 实测 deepseek 单次 2.4~9.3s（偶发 >7s），用户明确「慢一点便于看清 AI 动作」，故放宽超时
  const timeoutMs = Number(opts.timeoutMs) || (level === 'high' ? 20000 : 12000);
  const effort = level === 'high' ? '' : 'low';   // 普通档压推理提速，高强度档交给模型尽情想
  const maxTokens = level === 'high' ? 3000 : 2000;  // 推理模型：实测 1200 偶发被 reasoning 吃光
  const sysPrompt = model === 'glm' ? SYS_PLAY_GLM : SYS_PLAY;
  // 决策过程回调：server 把它转成广播事件，玩家就能看到「AI 正在思考 / 想了多久 / 选了啥」
  const onThink = typeof opts.onThink === 'function' ? opts.onThink : () => {};
  const notify = (ev) => { try { onThink(ev); } catch { /* 广播失败绝不影响对局 */ } };
  let consec = 0;      // 连续失败次数
  let dead = false;    // 已降级为本局熔断

  const metOk = () => { consec = 0; };
  const metFail = (reason) => {
    consec++;
    if (!dead && consec >= BREAKER_LIMIT) {
      dead = true;
      STATS.degraded++;
      notify({ phase: 'dead', seat: seatIndex, reason, count: consec, model, level });
    }
  };
  const recMs = (ms) => {
    STATS.lastMs = ms;
    STATS.avgMs = STATS.avgMs ? Math.round(STATS.avgMs * 0.7 + ms * 0.3) : ms;
  };

  const choose = async (game, me, acts, tag) => {
    const lines = acts.map((a, i) => `${i}. ${a.label}`);
    const q = `${describeState(game, me)}\n\n候选动作：\n${lines.join('\n')}\n\n请选择最优动作，只输出 JSON：`;
    if (!allowCall()) {
      STATS.throttled++;
      notify({ phase: 'miss', seat: seatIndex, tag, model, ms: 0, reason: '调用频率限制' });
      return null;
    }
    const t0 = Date.now();
    STATS.calls++;
    notify({ phase: 'start', seat: seatIndex, tag, model, level, count: acts.length });
    try {
      const txt = await chat(model, [{ role: 'system', content: sysPrompt }, { role: 'user', content: q }], { timeoutMs, effort, maxTokens });
      const dec = parseDecision(txt, acts.length);
      const ms = Date.now() - t0;
      recMs(ms);
      if (!dec) {
        STATS.fails++;
        STATS.lastErr = `无法解析：${String(txt).slice(0, 60)}`;
        metFail('返回无法解析');
        notify({ phase: 'miss', seat: seatIndex, tag, model, ms, reason: '返回无法解析' });
        return null;
      }
      STATS.lastWhy = dec.why; STATS.lastBy = `${model}/${tag}`;
      metOk();
      const act = acts[dec.index];
      notify({ phase: 'done', seat: seatIndex, tag, model, ms, why: dec.why, label: act.label });
      return act;
    } catch (e) {
      const ms = Date.now() - t0;
      recMs(ms);
      const to = /abort/i.test(String(e?.name || e?.message));
      if (to) STATS.timeouts++; else STATS.fails++;
      STATS.lastErr = `${to ? '超时' : '调用失败'}：${String(e?.message || '').slice(0, 60)}`;
      metFail(to ? '超时' : String(e?.message || '调用失败'));
      notify({ phase: 'miss', seat: seatIndex, tag, model, ms, reason: to ? '超时' : '调用失败' });
      return null;
    }
  };

  const toAnswer = (act) => {
    if (!act) return null;
    if (act.type === 'end') return { endPhase: true };
    if (act.type === 'skill') return { skill: act.skill };
    // asName / extraCards：转化技与【丈八蛇矛】（两张当一张）必须透传，
    // 否则模型选了候选、服务端只当普通牌用（或直接用不了）。
    return { card: act.card, targets: act.targets || [], asName: act.asName || null, extraCards: act.extraCards || null };
  };

  return {
    model, level, seatIndex,
    alive: () => !dead,
    consecFails: () => consec,
    async askPlay(game, p) {
      if (dead) return inner.askPlay(game, p);                  // 熔断：本局后续全走内置 AI
      const acts = enumerateActions(game, p, { rich: level === 'high' });
      if (acts.length <= 1) return inner.askPlay(game, p);      // 无事可做，不浪费一次调用
      const act = await choose(game, p, acts, 'play');
      if (act) return toAnswer(act);
      return inner.askPlay(game, p);                            // ★兜底
    },
    async ask(game, p, req) {
      // 强度 high 时，关键响应（需要出牌响应：闪/杀/桃）也交给 LLM
      if (!dead && level === 'high' && req && req.kind === 'card' && Array.isArray(req.cards) && req.cards.length) {
        const acts = req.cards.slice(0, 8).map((c, i) => ({ type: 'resp', id: c.id, label: `打出【${cardText(c)}】` }));
        acts.push({ type: 'resp', id: null, label: '不打出' });
        const q = `${describeState(game, p)}\n\n【此刻】${req.prompt || '请选择要打出的牌'}\n候选：\n`
          + acts.map((a, i) => `${i}. ${a.label}`).join('\n') + '\n\n请选择，只输出 JSON：';
        if (!allowCall()) {
          STATS.throttled++;
          notify({ phase: 'miss', seat: seatIndex, tag: 'resp', model, ms: 0, reason: '调用频率限制' });
          return inner.ask(game, p, req);
        }
        const t0 = Date.now();
        STATS.calls++;
        notify({ phase: 'start', seat: seatIndex, tag: 'resp', model, level, count: acts.length });
        try {
          const txt = await chat(model, [{ role: 'system', content: sysPrompt }, { role: 'user', content: q }], { timeoutMs, effort, maxTokens });
          const dec = parseDecision(txt, acts.length);
          const ms = Date.now() - t0;
          recMs(ms);
          if (dec) {
            const a = acts[dec.index];
            STATS.lastWhy = dec.why; STATS.lastBy = `${model}/resp`;
            metOk();
            notify({ phase: 'done', seat: seatIndex, tag: 'resp', model, ms, why: dec.why, label: a.label });
            return a.id ? { cardId: a.id } : null;
          }
          STATS.fails++;
          STATS.lastErr = `无法解析：${String(txt).slice(0, 60)}`;
          metFail('返回无法解析');
          notify({ phase: 'miss', seat: seatIndex, tag: 'resp', model, ms, reason: '返回无法解析' });
        } catch (e) {
          const ms = Date.now() - t0;
          recMs(ms);
          const to = /abort/i.test(String(e?.name || e?.message));
          if (to) STATS.timeouts++; else STATS.fails++;
          STATS.lastErr = `${to ? '超时' : '调用失败'}：${String(e?.message || '').slice(0, 60)}`;
          metFail(to ? '超时' : String(e?.message || '调用失败'));
          notify({ phase: 'miss', seat: seatIndex, tag: 'resp', model, ms, reason: to ? '超时' : '调用失败' });
        }
      }
      return inner.ask(game, p, req);
    },
  };
}
