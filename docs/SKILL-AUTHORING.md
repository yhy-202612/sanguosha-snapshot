# 三国杀在线 · 技能编写规范（给协作者）

> 项目根目录：`/sandbox/workspace/sanguo`（ESM，Node 20）。**不要**改动 `src/engine/` 下任何文件（引擎由主控维护），只新增/修改：
> `src/skills/*.js`、`src/data/*.js`、`src/skills/index.js`、`src/data/generals.js`、`tools/packcheck.js`。

## 1. 目录与命名

| 文件 | 作用 |
|---|---|
| `src/skills/<pack>.js` | `defineSkill({...})` 注册技能 |
| `src/data/<pack>.js` | `export const XXX_GENERALS = [{ id, name, kingdom, hp, pack, skills }]` |
| `src/skills/index.js` | 加一行 `import './<pack>.js';` |
| `src/data/generals.js` | `import { XXX_GENERALS } from './<pack>.js'` + `GENERALS.push(...XXX_GENERALS);` + `PACK_CN` 加 `<pack>: '中文名'` |
| `tools/packcheck.js` | 加数据断言 + 关键行为断言（见 §6） |

**技能 id 禁用前缀 `jie_` / `mou_` / `ji_`**（`getSkill()` 会把这些前缀降级复用标准包同名技能，导致静默串技能）。推荐用 `技能拼音` 或 `技能拼音 + 数字`，如 `kurou2` / `tiaoxin2`；必须全局唯一。

## 2. 武将数据字段

```js
{ id: 'mou2_huanggai', name: '谋黄盖', kingdom: 'wu', hp: 4, hpNow: 2, armor: 2, pack: 'mou2',
  skills: ['kurou2', 'zhaixiang'] }
```

- `kingdom`：`wei|shu|wu|qun|shen`（引擎会映射中文）
- `hp`：体力上限；`hpNow`：初始体力（与上限不同时用，如 2/4）
- `armor`：初始护甲
- `kingdom2`：双势力第二势力（如闪张辽 `kingdom:'qun', kingdom2:'wei'`）
- `form: 'demon'`：开局即入魔形态
- 势力技：技能对象上写 `kingdomOnly: 'qun'`，仅在对应势力可用（引擎已支持）
- 形态技：技能对象上写 `form: 'demon'`，仅入魔后可用（引擎已支持）

## 3. 技能对象结构

```js
import { defineSkill, getSkill } from '../engine/skill.js';
import { CARD_META, cardLabel } from '../engine/cards.js';

defineSkill({
  id: 'xxx', name: '技能名',
  desc: '官方技能描述原文（尽量一字不改）',
  triggers: [
    { on: 'phase.begin', who: 'self', optional: true,
      filter: (d) => d.phase === 'play',
      async effect(ctx) { /* 用 ctx，不要用第二参数 */ } },
  ],
  active: {                 // 出牌阶段主动技（可选）
    perTurn: true,          // 每回合一次；省略则不限次
    prompt: '按钮/提示文案',
    async effect(ctx) { /* ctx.ask.targets(...) 等 */ },
  },
});
```

### 可选事件（`on`）
`game.start`、`turn.begin`、`turn.end`、`phase.begin`、`phase.end`、`cards.draw`、`cards.draw.after`、`cards.discard`、`cards.gain`、`cards.lose`、`judge.before`、`judge.after`、`card.use.before`、`card.use.after`、`card.effect.before`、`card.effect.after`、`target.before`、`target.after`、`sha.target`、`juedou.need`、`damage.before`、`damage.after`、`hp.lose`、`hp.recover`、`dying.begin`、`dying.end`、`death.before`、`death.after`、`dodge.before`、`dodge.after`、`sha.dodged`、`sha.hit`、`respond.need`、`equip.change`、`equip.lose`、`flip.after`、`distance.calc`、`hand.change`、`draw.count`、`zone.out`、`zone.in`、`form.change`、`kingdom.change`

### `who` 语义（**最容易错，务必看**）
- `who: 'self'`：只有「技能拥有者 == 事件主角 `data.self`」时才触发。
- `who: 'any'`：所有人都参与，靠 `filter` 判断。
- `effect(ctx)`：**引擎只传 ctx，第二个参数恒为 undefined**。旧代码里 `effect(ctx, d)` 是错误写法。
- 在 `filter(d)` 与 `effect` 里：`d.self` = 事件角色（使用者/受伤者/拥有者视事件而定），`d.player` = 技能拥有者，`d.game` = game。
  - 判断「技能拥有者就是使用者」写 `d.self === d.player`（**不要**写 `d.target === d.self` 之类）。

## 4. ctx API（全部可用）

```js
ctx.self / ctx.game / ctx.data / ctx.skill
ctx.log(text)                      // 写战报
ctx.ask.confirm(p, prompt)         // → bool
ctx.ask.targets(p, { candidates: 玩家对象数组, min, max, prompt })  // → 玩家对象数组
ctx.ask.choose(p, ['选项A','选项B'], { prompt, reason })             // → index（数字，可能 -1）
ctx.ask.card(p, { filter, prompt, reason })   // → 牌对象（已从手牌移出并进弃牌堆！不要再 discard）
ctx.draw(p, n, { reason })
ctx.discard(p, [card...], { reason })
ctx.gain(p, [card...], { from, reason })
ctx.damage({ from, to, amount, nature, card, reason })   // ★对象参数
ctx.recover(p, n) / ctx.loseHp(p, n)
ctx.judge(p, { reason })           // → { self, card, suit, num, canceled }
ctx.useCard({ from, card, targets: [玩家], reason })
ctx.flip(p) / ctx.setForm(p, 'demon'|'normal', reason) / ctx.setKingdom(p, 'wei', reason)
ctx.jadeColor(p)                   // 'red'|'blue'（按体力奇偶）
ctx.sameClan(a, b) / ctx.extraTurn(p) / ctx.yishi(p, { extraRed })
```

game 级工具：`g.alive()`、`g.byId(id)`、`g.players`、`g.turnCount`、`g.turnPlayer`、`g.phase`、`g.rng.int(n)` / `g.rng.pick(arr)` / `g.rng.shuffle(arr)`（**注意 rng 是对象，不能 `g.rng()`**）、`g.chooseSomeCards(p, [card], n, { prompt })`（→ 牌数组，**不移动牌**）、`g.attackRange(p)`、`g.inAttackRange(a,b)`、`g.distance(a,b)`、`g.trigger(event, data)`、`g.recover/loseHp/equipCard/placeDelayed`、`g.queueExtraTurn(p)`。

## 5. 三个硬约束（踩过坑）

1. **`ctx.ask.card` 会把牌移出手牌并弃置**（内部 `respondCard` 统一触发 `cards.discard`）。所以：
   - 需要「拿到一张牌再交给别人」→ 用 `g.chooseSomeCards(p, p.hand.slice(), 1, {...})`，**不要**用 `ctx.ask.card` 后再 `ctx.discard`（会二次失去）。
2. **牌堆顶在数组末尾**：`g.deck` 最后一张是牌堆顶。批量放回顶部用 `deck.push(...arr)`，批量放底部用 `deck.unshift(...arr)`；逐张 `unshift` 会反转顺序。
3. **体力上限 / 体力下限不得小于 1**：任何 `maxHp - n` 都要 `Math.max(1, ...)`。

## 5.5 引擎契约（SG027–SG029 新增，**写新技能必读**）

### 5.5.1 「是否拥有某技能」一律走 `effSkills`

```js
import { effSkills } from '../engine/skill.js';
effSkills(p).some(s => s.id === 'guixin')     // ✅
p.skills.some(s => s.id === 'guixin')          // ❌ 失去技能后仍会命中
```

`effSkills` 会同时处理 `flags.skillsDisabled`（【锁星】②永久失去全部技能）与 `flags.noSkills`
（【她的乡愁】④临时失去非锁定技）。**只允许三类地方读裸 `p.skills`**：写操作、`effSkills` 自身、
`collectTriggers` 的原始遍历。

★「锁定」是**两层**判定，不要混用：
- 技能级 `isLockedSkill(s)`：只看 `s.locked === true` 或 desc 里声明「锁定技」；
- 触发器级 `isLockedTrigger(tr)`：`tr.optional === false`。

混合技（如【裸衣】`luoyi`：desc 非锁定，但有 `optional:false` 触发器）在 `noSkills` 下
**只跑锁定触发器**；此时 `effSkills` 会返回不含它（`hasSkill=false`），这是预期口径。

### 5.5.2 出杀次数：四个字段别用错

| 字段 | 语义 | 谁在用 |
|---|---|---|
| `shaExtra` | **永久**加成（累加型，用 `+=`） | 【漠规②】 |
| `shaExtraTurn` | **仅本回合**（`runTurn` 清零） | 【拒降】【追猎】 |
| `shaExtraArmor` | 由护甲值**每次重算**（用 `=` ） | 【降怒】 |
| `shaExtraEquip` | 由装备区牌数**每次重算**（用 `=` ） | 【飒然】 |
| `qimouSha` | 奇谋类一次性加成 | 【奇谋】 |
| `shaUnlimited` | 完全无次数限制（布尔） | 精械弩、诸葛连弩类 |

★「**这张牌**不受次数限制」是**牌级**属性，不要写进任何 flags —— 给牌打标记：

```js
c.ignoreShaLimit = true;   // 此【杀】不计次数
c.ignoreRange = true;      // 此【杀】无距离限制
```
引擎 `canUse`/`useCard`/`candidatesFor` **三处都识别**这两个标记（【刺北】的「刺」即如此：
效果随牌跨回合，写 `shaExtraTurn` 会在 `runTurn` 清零 → 等于没有效果）。
★标记是**该次持有**的属性，不是牌的固有属性：引擎在 `useCard` 结算后 / `discardCards` /
`gainCards` / `pushDiscard` 四处调用 `Game.stripCardMarks(card)` 清掉它 ——
否则牌进弃牌堆重洗、被别人摸到，仍会免次数/免距离（`{...card}` 副本也会继承）。

★ 动态重算类**绝不能写 `shaExtra`**：`shaExtra` 是累加型，用 `=` 会把别人的加成清掉。
攻击范围同理：`rangeBonus`（累加）/ `rangeBonusArmor`（降怒动态）。

### 5.5.3 装备 / 护甲事件

- `equip.change`：装备**增减都会**派发。失去装备时由引擎补派，`data` 形如
  `{ self, slot, card: null, old: 原牌, lost: true }`；换装（A 换 B）由 `equipCard` 在槽位更新后派一次。
  ★「获得装备后」型技能必须写 `filter: (d) => !!d.card && d.lost !== true`，否则失去装备时也会触发。
- `armor.change`：护甲增减。改护甲**必须**走 `await g.addArmor(p, n)` / `await g.setArmor(p, n)`，
  不要直接 `p.armor = …`（否则监听护甲的技能不会刷新）。
- ★**交换类技能**（【甘露】【诡图】等）必须用 `await g.swapEquipSlot(a, b, slot, {reason})`，
  **不要**手写 `a.equips = eb; b.equips = ea`：那样零 lose、零 change，精械弩/飒然/降怒全部残留，
  实测「精械弩换成青龙后 `shaUsed=99` 仍可出杀」（SG034 P0）。
- ★**凭空换上装备**（【冠武】把青龙装到自己身上）走 `await g.forceEquip(player, card, {reason})`：
  它负责「旧装备 unequipCard + 入弃牌堆 → 置入新装备 → 派 equip.change」。
  手写 `p.equips.weapon = found` 会让旧装备静默进弃牌堆、监听者不刷新。
- ★**摘下的牌必须有着落**：`unequipCard` 只负责「摘除 + 派发」，**不负责**入弃牌堆/进手牌。
  写完 `await g.unequipCard(...)` 必须紧跟 `g.pushDiscard(c)` / `await ctx.discard(...)` /
  `等待对方 gain` / 写入另一个容器 —— 否则牌凭空消失（SG034 实测【让节】换装时丢牌）。
- ★**`afterEquipLose` 不要自己调**：引擎在 `trigger('equip.lose')` 出口统一调用
  （白银狮子回血）。只有 `equipCard` / `unequipCard` / `swapEquipSlot` 这三个「自己已经调过」的地方
  会传 `noLoseHook: true` 跳过。手写 `equips[k]=null` + `trigger('equip.lose', ...)` 会自动获得该收尾。
- ★**不要静默摘装备**：统一走 `await g.unequipCard(player, card, { reason })` ——
  它做三件事：置空槽位 → 派发 `equip.lose` → `afterEquipLose`，并返回被摘掉的槽名。
  自己手写时也必须 **先置空槽位、再派发 `equip.lose`**：若先派发，监听者读 `equips[slot]`
  拿到的是「正要被换掉的旧装备」，会做出错误判断（精械弩 jx→青釭：lose 时看到 jx 把
  `shaUnlimited` 清掉，紧接着的 change 又看到 jx 置 true —— SG031/SG032 实测）。
  换装路径 `equipCard` 派 `equip.lose` 时会带 `noChange: true`，让引擎跳过「补派 equip.change」，
  由函数自己在槽位更新后派一次，因此**一次换装 = 1 次 lose + 1 次 change**。

### 5.5.4 私有牌容器必须登记回收

技能把牌从标准区域摘除后放在自己的容器里（「置于武将牌上」「扣置」「移出游戏」），
**必须**在 `src/skills/held-reclaim.js` 里登记：

```js
registerHeldContainer({
  key: 'flags.xxx',                  // 唯一标识（仅用于去重）
  get: (p) => p.flags.xxx,           // 返回持有牌的数组
  clear: (p) => { p.flags.xxx = []; }, // 置空（可保留非牌元素）
});
```

否则持有者阵亡 / 失去技能时这些牌**永久消失**。验收工具：

```bash
node tools/heldleak.js 80     # 必须「未发现持有型容器泄漏」+「静态未登记候选 0」
```

目前登记 **37 个容器**，每个登记项**必须带 `owner`**（所属技能 id，可以是数组，见下）。

**不要登记「引用型」容器**（存的是已进弃牌堆的牌或牌 id）：`gzPool.cards`、`clan3` 的 `rec.cards`、
`lastDodgeCards`、`anlanBlock.ids` —— 登记后回收会把同一张牌推两次弃牌堆。
★例外：`flags.kuangzuo` 是混合型（引用 + 拥有），登记时在 `get` 里过滤虚拟牌与 `__src` 即可。

**纯虚拟牌容器**（`vcard` 的 `virtual:true`、`__src`、`id` 前缀 `vm*`/`vxh*`/`qx_*`）不能入弃牌堆：
给 spec 加 `alwaysClear: true` 且 `get` 返回 `[]`，只清空不返回：

```js
registerHeldContainer({
  key: 'flags.extraWeaponCard', owner: 'qiexie',
  alwaysClear: true, get: () => [],
  clear: (p) => { p.flags.extraWeaponCard = null; },
});
```

混合型容器（既有引用又有拥有）在 `get` 里过滤掉虚拟牌/引用项，在 `clear(p, taken)` 里只删 `taken`。
★虚拟牌判定**必须用 `isVirtualCard(c)`**（来自 `engine/skill.js`：`virtual` / `__src` / id 前缀
`vm|vxh|qx_|tian` 三重判据），**不能只判 `name`** —— 纯 vcard 的 id 是 `vxh999`、name 却是正常的
`sha`，只判 name 会漏过（实测 `vxh999` 被推进弃牌堆）。

★`crossPlayer: true`：牌被放在**别人**身上（【破军】把目标的牌置于目标武将牌上），
施放者失技/阵亡时容器在目标身上、没人回收 → 牌永久滞留。这类容器必须声明 `crossPlayer: true`，
引擎会遍历所有玩家回收（`jun`、`flags.m5Kou` 已如此登记）。

★`owner` 语义：`removeSkills(p, [id])` 只回收「owner 命中该 id」的容器，避免删 A 误清 B。
一个容器被**多个技能**写入时（如 `flags.kuangzuo` = `tongyin`/`chengfeng` 写、`kuangzuo` 消耗），
`owner` 必须写成数组 `['tongyin','chengfeng','kuangzuo']`，否则删任一方都会漏清或误清。
多 owner 的回收条件是「玩家身上已不再拥有其中**任何**一个技能」（不是「都出现在本次被删集合」——
后者在逐个删技能时永远凑不齐，实测不回收）。

移去暂存区的牌要入弃牌堆时，用 `g.pushDiscardIfOrphan(card)`（牌已在任一标准区域则跳过），
不要直接 `g.discardPile.push(...)`。

### 5.5.5 「失去技能」必须走 `g.removeSkills`

```js
await g.removeSkills(p, null);        // 失去全部技能（断肠/万利）
await g.removeSkills(p, ['daojie']);  // 失去指定技能
```

它会在删技能后调用 `reclaimHeld(player, { onlyOwners: ids })` —— **只回收被删技能名下的容器**，
不会误伤玩家身上其它技能的容器。直接写 `p.skills = []` 会绕过回收。

★ 凡「失去某个/全部技能」的结算都必须走它：`fuyan`(custom)、`huashen2`(phase4)、`hsSetActive`(shan)、
`lingren`(xinghe)、`jh_tuogu`(jsg_he)、`fusui`/`wanli`/`duanchang2`(narrative)、`daojie`(clan)、`duanchang`(shan)。

## 6. 交付流程（每批必做）

```bash
cd /sandbox/workspace/sanguo
node tools/skillaudit.js     # 必须：问题 0
node tools/packcheck.js      # 必须：0 失败（新将要在 EXPECT 表里登记）
node tools/selfcheck.js      # 必须：0 失败
node tools/simulate.js 60    # 必须：异常 0
node tools/heldleak.js 80    # 必须：无持有型容器泄漏（写/改「扣置」「置于武将牌上」类技能时）
node tools/bugfix-check.js   # 必须：0 失败（引擎契约回归）
```

`tools/packcheck.js` 里加：
- 数据断言：往 `EXPECT` 数组加 `[id, 名称, 势力, 体力, [技能id...], 包id]`；
- 包将数：`ok(GENERALS.filter(g => g.pack === '<pack>').length === N, ...)`（若该行已存在，改数字）；
- 关键行为：至少每个「主动技」一条、每个「触发技」一条真实调用断言（用 `mk([...将id], handler)` 构造对局后 `await g.trigger(...)` 或 `await g.useActiveSkill(p, id)`）。
  - 桩 handler 约定：`req.kind === 'confirm'` → `{yes:true}`；`'targets'` → `{seats:[座位号]}`；`'choice'` → `{index:0}`；`'card'` → `{cardId}`。
  - `g.logs` 是对象数组 `{seq,turn,text}`，断言日志用 `g.logs.some(l => l.text.includes('xx'))`。

## 7. 参考实现

- 触发技 + 主动技 + 转化 + 形态：`src/skills/mo.js`、`src/skills/mo2.js`
- 护甲 / 翻面 / 蓄力点 / 标记：`src/skills/mou2.js`、`src/skills/mou3.js`
- 双势力 / 势力技 / 议事：`src/skills/flash2.js`
- 逐张校验式大文件：`src/skills/lei2.js`、`src/skills/lei3.js`
- 转化牌规则（把某类牌当另一张牌用）：`src/engine/virtual-extra.js` 末尾**追加** `EXTRA_VIRTUAL_RULES.push({ skill:'技能id', as:'目标牌名', test:(cards, game, player)=>bool })` 即可（这是唯一允许改的引擎文件，且只能追加）。
