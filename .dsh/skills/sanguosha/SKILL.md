# 三国杀在线 · 项目技能（给 dsh 的技术契约）

> 优先级最高。所有技能实现必须严格遵循本文件定义的 API；不要自创接口，不要改引擎。

## 1. 目录结构

```
src/
  engine/          引擎核心（禁改）
    game.js        Game 类：状态机/回合/结算/询问
    cards.js       牌元数据（CARD_META）与牌效果（禁改）
    skill.js       defineSkill / getSkill / 事件白名单
    rng.js         可复现随机
    index.js       统一导出
  data/
    deck.js        牌堆构成（禁改）
    generals.js    武将数据（pack: standard|jie|mou|shen|ji）
  skills/
    standard.js    标准包 25 将（范例，仿照写）
    jie.js         界限突破（任务 A002）
    mou.js         谋系列（任务 A002）
    shen.js        神将（任务 A001）
    ji.js          极系列（任务 A002）
    index.js       汇总 import（勿改）
  modes/index.js   六种模式规则（任务 A006）
  ai/index.js      AI 决策（任务 A003）
  server/index.js  HTTP+SSE 服务（禁改）
client/            前端（任务 A004）
tools/selfcheck.js 自检（禁改，但必须跑绿）
```

## 2. 技能定义格式

```js
import { defineSkill } from '../engine/skill.js';
import { isRed, cardLabel, CARD_META } from '../engine/cards.js';

defineSkill({
  id: 'wusheng',              // 全局唯一，与 generals.js 的 skills 数组对应
  name: '武圣',
  desc: '你可以将一张红色牌当【杀】使用或打出。',
  // 被动/触发技：triggers 数组
  triggers: [{
    on: 'respond.need',       // 事件名（见 §4）
    who: 'self',              // 'self' = 事件主体必须是技能拥有者；'any' = 任何人拥有都参与判定（用 filter 收窄）
    optional: true,           // 是否询问玩家「是否发动」（true 会弹出确认）
    priority: 0,              // 可选，大者先结算
    filter: (d) => d.filter && d.filter.name === 'sha',
    async effect(ctx) { /* 异步实现 */ },
  }],
  // 主动技：出牌阶段点按钮发动
  active: {
    perTurn: true,            // 每回合限一次
    prompt: '弃置任意张牌并摸等量的牌',
    async effect(ctx) { /* ctx.self 为发动者 */ },
  },
});
```

规则：
- `on` 必须是 §4 白名单里的事件名，否则 `defineSkill` 直接抛错。
- `filter(d)` 的 `d` = 事件数据 + `{ self, player, game }`（`player` 是技能拥有者）。
- `effect(ctx)` 必须 `async`，内部所有 `ctx.ask.*` 都要 `await`。
- 同一个 skill 可有多个 trigger（挂不同事件）。
- **不要**在技能里直接改 `player.hp`；用 `ctx.damage/recover/loseHp`。

## 3. ctx API（技能内可用的全部能力）

| 用法 | 说明 |
|---|---|
| `ctx.game` | Game 实例（`ctx.game.alive()` / `.players` / `.deck` / `.discardPile` / `.rng`） |
| `ctx.self` | 技能拥有者（Player） |
| `ctx.data` | 事件数据对象，**可直接改**（如 `ctx.data.amount += 1`、`ctx.data.canceled = true`） |
| `ctx.source` | 事件来源（= `data.from`，可能为 null） |
| `ctx.target` | 事件目标（= `data.target` 或 `data.to`） |
| `ctx.card` | 相关牌 |
| `ctx.cards` | 相关牌数组 |
| `ctx.log(text)` | 写战报 |
| `ctx.ask.card(p, {filter, prompt, optional})` | 让 p 选一张手牌 → card \| null |
| `ctx.ask.choose(p, [选项字符串], {prompt})` | → 下标（取消为 -1） |
| `ctx.ask.targets(p, {min, max, candidates, prompt})` | → Player[] |
| `ctx.ask.confirm(p, prompt)` | → boolean |
| `ctx.draw(p, n, {reason})` | 摸牌，返回 card[] |
| `ctx.discard(p, cards, {reason})` | 弃置（自动处理手牌/装备/判定区） |
| `ctx.gain(p, cards, {from, reason})` | 获得牌（`from` 为原持有者，可省略） |
| `ctx.damage({from, to, amount, nature, card, reason})` | 造成伤害（会走濒死流程） |
| `ctx.recover(p, n, {reason})` | 回复体力 |
| `ctx.loseHp(p, n, {reason})` | 失去体力（不走伤害钩子） |
| `ctx.judge(p, {reason})` | 判定 → `{suit, num, card}`（suit: spade/heart/club/diamond） |
| `ctx.useCard({from, card, targets})` | 强制使用一张牌（可造虚拟牌） |
| `ctx.respond(p, {filter, prompt, optional})` | 让 p 打出牌（响应） → card \| null |
| `ctx.range(a, b)` / `ctx.inRange(a, b)` | 距离 / 是否在攻击范围 |

`filter` 支持字段：`{ name: 'sha' }`、`{ names: ['sha','juedou'] }`、`{ type: 'trick' }`、`{ suit: ['heart'] }`、`{ red: true|false }`、`{ excludeName: 'tao' }`。

## 4. 事件列表与 data 字段

| 事件 | data 关键字段 | 可做 |
|---|---|---|
| `game.start` | `self: null` | 开局 |
| `turn.begin` / `turn.end` | `self`: 回合玩家 | 回合始末（如咆哮设 `flags.shaUnlimited`） |
| `phase.begin` / `phase.end` | `self`, `phase`(prepare/judge/draw/play/discard/end) | 观星/洛神/闭月等 |
| `draw.count` | `self`, `count`（可改） | 英姿 +1、裸衣 -1 |
| `cards.draw` / `cards.draw.after` | `self`, `count` / `cards` | 摸牌前后 |
| `cards.discard` | `self`, `cards`, `reason` | 弃牌时 |
| `cards.gain` | `self`, `from`, `cards` | 获得牌时 |
| `judge.before` / `judge.after` | `self`, `card`, `suit`, `num`, `reason` | 改判（鬼才）、拿判定牌（天妒） |
| `card.use.before` / `card.use.after` | `self`, `card`, `effName`, `targets` | 集智（用锦囊摸牌） |
| `card.effect.before` / `after` | `self`, `card`, `targets` | 效果前后 |
| `target.before` | `self`: 使用者, `target`, `card`, `canceled`, `used` | 空城/谦逊取消、流离转移（改 `target`） |
| `target.after` | `self`, `target`, `card` | 铁骑（杀指定目标后判定） |
| `damage.before` / `damage.after` | `self`: 受伤者, `from`, `amount`（可改）, `nature`, `card`, `reason`, `canceled` | 奸雄/刚烈/遗计、减伤 |
| `hp.lose` / `hp.recover` | `self`, `count`, `from`, `reason` | 回血加成（救援） |
| `dying.begin` / `dying.end` | `self`: 濒死者, `from` | 濒死 |
| `death.before` / `death.after` | `self`: 死者, `killer` | 死亡（`canceled` 可救活） |
| `dodge.before` | `self`: 目标, `from`, `card`, `extraDodge`（可加） | 无双（需两张闪） |
| `dodge.after` | `self`, `from`, `card` | 闪生效后 |
| `sha.hit` | `self`: 使用者, `target`, `card`, `amount` | 杀命中（伤害类技能） |
| `sha.dodged` | `self`: 使用者, `target`, `card` | 杀被闪抵消（青龙偃月刀） |
| `respond.need` | `self`: 需响应者, `filter`(要什么牌), `handled`, `card` | 转化牌（武圣/倾国/龙胆/急救） |
| `equip.change` / `equip.lose` | `self`, `slot`/`card` | 枭姬（失去装备摸两张） |
| `distance.calc` | `self`: 计算者, `to`, `value`（可改） | 马术 -1 |
| `hand.change` | `self`, `count` | 连营（手牌空了摸一张） |

## 5. 虚拟牌（把 A 当 B 用）

两种写法：

**响应型**（最常用）——在 `respond.need` 里给出 `{...card, name: '目标牌名', __src: card}`：
```js
{
  on: 'respond.need', who: 'self', optional: true,
  filter: (d) => d.filter && d.filter.name === 'shan' && d.self.hand.some(c => !isRed(c)),
  async effect(ctx) {
    const c = await ctx.ask.card(ctx.self, { filter: { red: false }, prompt: '倾国：将黑色牌当【闪】打出' });
    if (c) { ctx.data.handled = true; ctx.data.card = { ...c, name: 'shan', __src: c }; }
  },
}
```

**主动型**（出牌阶段）——引擎已内置规则表 `VIRTUAL_RULES`（`src/engine/game.js`），
支持 `wusheng→sha`、`longdan↔`、`qingguo→shan`、`jijiu→tao`、`qixi→guohe`、`guose→lebu`、`zhangba→sha`。
新增主动型虚拟牌需要改引擎（**禁止**），请在报告里提出。

## 6. 数据格式

武将（`src/data/generals.js`）：
```js
{ id: 'shen_guanyu', name: '神关羽', kingdom: 'shen', hp: 5, pack: 'shen', skills: ['wusheng', 'wuhun'] }
```
- `kingdom`: wei / shu / wu / qun / shen
- `hp`: 体力上限（主公在身份场会 +1，数据里不要预加）
- `skills`: 技能 id 数组，必须都能被 `getSkill()` 找到
- 女性武将要加 `gender: 'female'`（结婚姻/离间判定）

牌（`src/engine/cards.js` 的 `CARD_META`，禁改）：牌名是英文 id（`sha`/`shan`/`tao`/`juedou`…），`cn` 是中文名。

## 7. 完整范例（照这个写神将）

```js
// 神诸葛亮·七星：游戏开始时，你将牌堆顶七张牌置于你的武将牌上，称为「星」。
defineSkill({
  id: 'qixing', name: '七星', desc: '游戏开始时，你将牌堆顶七张牌置于你的武将牌上，称为「星」；每当你受到 1 点伤害后，你可以获得一张「星」。',
  triggers: [
    {
      on: 'game.start', who: 'self', optional: false,
      async effect(ctx) {
        const p = ctx.self;
        p.flags.stars = [];
        for (let i = 0; i < 7; i++) {
          const cards = await ctx.draw(null, 1, { reason: 'qixing' });
          if (cards[0]) p.flags.stars.push(cards[0]);
        }
        await ctx.log(`${p.name} 获得 7 枚「星」`);
      },
    },
    {
      on: 'damage.after', who: 'self', optional: true,
      filter: (d) => (d.self.flags.stars || []).length > 0,
      async effect(ctx) {
        const p = ctx.self;
        const star = p.flags.stars.pop();
        if (star) await ctx.gain(p, [star], { reason: 'qixing' });
      },
    },
  ],
});
```

```js
// 鬼才·改判（注意 judge.before 里改的是 ctx.data.suit / num）
defineSkill({
  id: 'guicai', name: '鬼才', desc: '在任意角色的判定牌生效前，你可以打出一张手牌代替之。',
  triggers: [{
    on: 'judge.before', who: 'any', optional: true,
    async effect(ctx) {
      const c = await ctx.ask.card(ctx.self, { prompt: '鬼才：打出一张手牌代替判定牌', optional: true });
      if (!c) return;
      await ctx.discard(ctx.self, [c], { reason: 'guicai' });
      ctx.data.suit = c.suit;
      ctx.data.num = c.num;
    },
  }],
});
```

## 8. 常见错误（会被自检或线上暴露）

1. 忘记 `await` → 事件顺序错乱，伤害没结算就继续。
2. `filter` 里访问 `d.self` 但事件没这个字段 → 抛错（引擎会捕获并写战报，但技能失效）。
3. 直接用 `ctx.self.hand.push(card)` 加牌 → 不走 `cards.gain` 事件，连营/枭姬等联动失效。用 `ctx.gain`。
4. 技能 id 与 `generals.js` 里的拼写不一致 → 武将变白板。
5. 在 `respond.need` 里用了 `optional: false` → 每次都被强制发动，可能把牌打空。
6. 断言不过还提交 → 视为未完成。

## 9. 自检与提交

```bash
node tools/selfcheck.js     # 必须「失败 0」
```

提交到任务单指定的 `dsh/<id>-xxx` 分支，报告写 `reports/<id>.md`，末尾三行：
```
RESULT: done
BRANCH: dsh/A001-shen-skills
SESSION_ID: unknown
```
