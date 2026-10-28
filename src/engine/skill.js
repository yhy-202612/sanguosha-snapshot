// 技能注册表：技能只通过 defineSkill 注册，引擎按事件分发
const REGISTRY = new Map();

export const VALID_EVENTS = new Set([
  'game.start', 'turn.begin', 'turn.end', 'phase.begin', 'phase.end',
  'cards.draw', 'cards.draw.after', 'cards.discard', 'cards.gain', 'cards.lose',
  'judge.before', 'judge.after',
  'card.use.before', 'card.use.after', 'card.effect.before', 'card.effect.after',
  'target.before', 'target.after', 'sha.target', 'juedou.need',
  'damage.before', 'damage.after', 'hp.lose', 'hp.recover',
  'dying.begin', 'dying.end', 'death.before', 'death.after',
  'dodge.before', 'dodge.after', 'sha.dodged', 'sha.hit',
  'respond.need', 'equip.change', 'equip.lose', 'armor.change', 'flip.after', 'distance.calc', 'hand.change', 'draw.count',
  // 「移出游戏 / 从游戏外加入」通用事件（武将牌上的牌：任/荣/声 等）
  'zone.out', 'zone.in',
  // 拼点选牌窗口（2026-10-26 新增，供【天辩】等「改用牌堆顶拼点」的技能介入）
  'pindian.pick',
  // 议事结算结束（【伐异】【复谋】等「议事结束后」技能依赖）
  'yishi.end',
  // 一轮结束（座位回绕、新一轮开始之前）
  'round.end',
  // 失去 / 恢复全部技能（【锁星】②等）：技能可监听它回收自己的私有容器（如【笔伐】扣置牌），
  // 否则「失去技能」后牌会永久滞留（SG027 R9）
  'skills.disabled', 'skills.enabled',
  // M4 形态切换（入魔 / 脱离入魔）
  'form.change',
  // 双势力：变更势力
  'kingdom.change',
  // M12 「轮」开始（座位回绕）：天工·诸葛亮【天机】【天工·登峰】等按轮触发
  'round.begin',
]);

export function defineSkill(skill) {
  if (!skill || !skill.id) throw new Error('skill.id required');
  if (REGISTRY.has(skill.id)) return REGISTRY.get(skill.id);
  for (const t of skill.triggers || []) {
    if (!VALID_EVENTS.has(t.on)) throw new Error(`unknown event ${t.on} in skill ${skill.id}`);
    if (typeof t.effect !== 'function') throw new Error(`skill ${skill.id} trigger ${t.on} needs effect()`);
  }
  REGISTRY.set(skill.id, { triggers: [], priority: 0, ...skill });
  // ★持有型容器回收函数登记为「全局常驻」（SG029 BLOCKER-2）：
  //   断肠 / 万利 / 断肠2 / 蹈节 等技能会直接 `p.skills = []` 而不经 reclaimHeld，
  //   若回收声明只挂在 player.skills 上，技能被删后声明随之消失 → 容器里的牌永久滞留。
  //   故 defineSkill 时把回收函数额外登记到全局表，回收时按「玩家身上是否真有这些容器」自查，幂等安全。
  const reclaim = skill.reclaimCards || skill.heldCards;
  if (typeof reclaim === 'function') GLOBAL_HELD_COLLECTORS.push({ id: skill.id, fn: reclaim });
  return REGISTRY.get(skill.id);
}

// 全局常驻的持有型容器回收函数表（与玩家当前是否拥有该技能无关）
export const GLOBAL_HELD_COLLECTORS = [];

// 持有型容器集中声明表（SG029 BLOCKER-1）：由 skills/held-reclaim.js 在装载时登记。
// 形如 { key, get(player)->数组, clear(player)->置空 }，引擎在死亡 / 失去技能时统一回收。
export const HELD_CONTAINERS = [];
export function registerHeldContainer(spec) {
  if (!spec || typeof spec.get !== 'function') return;
  if (HELD_CONTAINERS.some(x => x.key === spec.key)) return;
  HELD_CONTAINERS.push(spec);
}

// 虚拟牌（合成牌）判定 —— 这类牌不是牌堆里的实体牌，**绝不能推入弃牌堆**。
// SG032 A1.1 实测：只判 name 前缀（/^vm/）会漏过「id 是 vxh999、name 是 sha」的纯 vcard。
// 判据取三重并集：显式 virtual 标记 + 有合成来源 __src + id 前缀（vm/vxh/qx_/tian 等）。
export function isVirtualCard(c) {
  if (!c || typeof c !== 'object') return false;
  if (c.virtual === true) return true;
  if (c.__src) return true;
  return /^(vm|vxh|qx_|tian)/.test(String(c.id || ''));
}

export function getSkill(id) {
  if (REGISTRY.has(id)) return REGISTRY.get(id);
  // 降级：jie_/mou_/ji_ 前缀的技能若未单独实现，复用标准包同名技能（待协作任务补齐真实技能）
  const base = String(id).replace(/^(jie_|mou_|ji_)/, '');
  if (base !== id && REGISTRY.has(base)) {
    const s = REGISTRY.get(base);
    return { ...s, id, fallbackOf: base };
  }
  return null;
}
export function hasSkill(id) { return !!getSkill(id); }
export function allSkills() { return [...REGISTRY.values()]; }
export function skillIds() { return [...REGISTRY.keys()]; }

export function validEvents() { return [...VALID_EVENTS]; }

// ============================================================================
// 角色「当前有效的技能表」（SG027 R9 修复 · engine-plan 方案 1）
// ----------------------------------------------------------------------------
// 规则：失去所有技能（flags.skillsDisabled）后，**任何**「是否拥有某技能」的判定都必须走这里。
// 旧实现只在 collectTriggers 里早退，导致不屈/覆载/红颜/集智等「直接读 player.skills」的判定
// 完全不受影响——失去技能了却还在生效（SG027 R9 FAIL）。
//
// includeLocked === false 时只滤掉「全部为非锁定」的技能（保留锁定技），
// 与 flags.noSkills（只停非锁定技、可恢复）是两套不同语义。
//
// ★对非玩家对象（武将模板 g.skills 等）原样返回其 skills 数组，故本函数可安全地
//   替换任意 `X.skills` 读取表达式，误用也无害。
// ============================================================================
// 锁定技判据（三选一）：①desc 声明里含「锁定技」；②显式 locked:true；③所有触发器 optional:false
// ★①不能用 /^锁定技/：主公技/持恒技的写法是「主公技，锁定技，…」「持恒技、锁定技，…」，
//   前缀匹配会漏掉【皆盟】【伪帝】【燎原】三个（SG028 A2 实测反例）。
//   也不能用裸 /锁定技/：desc 里出现「非锁定技」「视为锁定技」时会误判。
// ★SG030 A5：**只**看技能级声明（desc / locked），绝不能用「任一触发器 optional:false」。
//   原因：混合技（如【络衣】luoyi）desc 不写锁定技，但 3 个触发器只有 1 个 optional:false，
//   用 some() 会把整条技能判成锁定技 → noSkills 下连非锁定触发器也照跑（全库此类技能 126 个）。
//   「触发器是否锁定」由 collectTriggers 逐触发器用 tr.optional === false 判定（分层）。
export function isLockedSkill(s) {
  return s.locked === true
    || /(?:^|[,，、;；])\s*锁定技/.test(String(s.desc || ''));
}

// 单个触发器是否锁定（optional === false）
export function isLockedTrigger(tr) {
  return !!tr && tr.optional === false;
}

export function effSkills(x) {
  const list = (x && x.skills) || [];
  const flags = (x && x.flags) || {};
  const sd = flags.skillsDisabled;
  // 【她的乡愁】④ flags.noSkills（下个准备阶段前失去所有非锁定技）与 skillsDisabled 是两套语义，
  // 但「是否拥有某技能」的判定同样要反映它 —— 否则不屈/覆载/红颜等直读判定照旧生效（SG028 A2）。
  if (!sd) return flags.noSkills ? list.filter((s) => isLockedSkill(s)) : list;
  if (sd.includeLocked !== false) return [];
  return list.filter((s) => isLockedSkill(s));
}

// 是否拥有指定技能（可传多个 id，任一命中即真）
export function effHasSkill(x, ...ids) {
  const want = ids.flat();
  return effSkills(x).some((s) => want.includes(s.id));
}

// 收集本次事件所有可发动的技能触发，按 priority 降序
export function collectTriggers(game, event, data) {
  const out = [];
  for (const p of game.players) {
    if (!p.alive && !(event.startsWith('dying') || event === 'death.after')) continue;
    // 永久失去所有技能（【锁星】②）：默认连锁定技一起停（flags.noSkills 是「仅非锁定 + 可恢复」的另一套语义）
    const sd = p.flags?.skillsDisabled;
    // ★cleanup 型触发器不受「失去技能」影响：它们只负责把技能私有容器里的牌收回/记回，
    //   属于牌张守恒的收尾，不是「技能效果」。停掉会让牌永久滞留（【笔伐】bifaStack，SG027 R9）。
    // ★这里必须读原始 p.skills，不能用 effSkills(p)：cleanup 型触发器要在「失去技能」后照常执行，
    //   用 effSkills 会在禁用时整条滤掉，笔伐扣置的牌就永远收不回来（SG027 R9）。
    for (const sk of p.skills || []) {
      // M4：形态专属技能（form:'demon' / form:'normal'）仅在对应形态下可触发
      if (sk.form && sk.form !== (p.form || 'normal')) continue;
      // 势力技：当前势力必须与技能声明一致（双势力武将变更势力后自动切换可用技能）
      if (sk.kingdomOnly && sk.kingdomOnly !== p.kingdom) continue;
      for (const tr of sk.triggers || []) {
        if (tr.on !== event) continue;
        // ① 永久失去技能（【锁星】②）：includeLocked!==false 时全部停；否则只停非锁定触发器
        //    ★逐触发器判定（不按技能整体），否则混合技里的锁定触发器会跟着非锁定触发器一起停
        if (sd && !tr.cleanup && ((sd.includeLocked !== false) || !isLockedTrigger(tr))) continue;
        // ② 临时封印（【她的乡愁】④）：技能级用 desc/locked 判，触发器级用 optional 判（分层，SG030 A5）
        //    —— 混合技（desc 非锁定 + 有 optional:false 触发器）只会跑锁定触发器，与非锁定语义分离
        if (p.flags?.noSkills && !tr.cleanup
          && !isLockedSkill(sk) && !isLockedTrigger(tr)) continue;
        // ★SG036 P0：`game.start` 是「每名角色各一次」的事件，派发时没有单一主体
        //   （game.js 传的是 `{ self: null }`）。若照旧用 data.self 判 who:'self'，
        //   全库 21 个 `on:'game.start', who:'self'` 的技能永远不会触发
        //   （【铁壁】护甲上限、极·庞统【穷谋】谋略上限 10 都是死的）。
        //   因此只在 game.start 上把「self」理解为「拥有该技能的角色自己」。
        const selfOf = event === 'game.start' ? p : data.self;
        if (tr.who === 'self' && selfOf !== p) continue;
        // ★SG036-r2：who:'other' 此前根本没有闸门（任何角色触发都算）。生产 0 使用，但补上防将来踩坑。
        if (tr.who === 'other' && event !== 'game.start' && data.self === p) continue;
        if (tr.who === 'any' || tr.who === undefined) {
          // 由 filter 决定
        }
        out.push({ player: p, skill: sk, trigger: tr, priority: tr.priority ?? sk.priority ?? 0 });
      }
    }
  }
  out.sort((a, b) => b.priority - a.priority);
  return out;
}
