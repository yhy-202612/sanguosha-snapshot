# 快照版本信息（dsh 开工前必先核对）

| 项 | 值 |
|---|---|
| 快照时间 | 2026-10-28 06:58 (+08:00) |
| 武将总数 | **603** |
| 扩展包总数 | **48** |
| 技能数 | `defineSkill` 调用 **1200**（71 个技能文件） |
| 默认模式 | 身份场·军争（junzheng） |

## 关键文件指纹（sha256 前 12 位）

| 文件 | 指纹 |
|---|---|
| `src/engine/game.js` | `0c1ad416794f` |
| `src/engine/cards.js` | `bcf9ec71e946` |
| `src/engine/skill.js` | `f19187d03d42` |
| `src/engine/pindian.js` | `4c78886315d3` |
| `src/engine/virtual-extra.js` | `71dce56eb1dd` |
| `src/data/generals.js` | `72a106817210` |
| `src/skills/jsg_he.js` | `1a8b1f3395ff` |
| `src/skills/jsg_cheng.js` | `52783cf7f31b` |
| `src/skills/rare2.js` | `a881a96def84` |
| `src/skills/lei3.js` | `dd3270addd6a` |
| `src/skills/flash2.js` | `d542290e383e` |
| `src/skills/xinghuo2.js` | `2c03bae227f0` |
| `src/skills/clan3.js` | `f0cd0aa5e996` |
| `src/skills/yj2015.js` | `620679641712` |
| `src/skills/yz2016.js` | `6de9c4f2b652` |

> 若你本机快照与上表不符，说明 `git merge --ff-only origin/main` 没生效（历史上 `_work/`、`deliver/` 未跟踪会导致它跳过）。
> 此时请先执行 `git fetch origin main && git stash -u && git merge --ff-only origin/main`，再开工；若仍失败，直接在回执里写 `RESULT: blocked` 并说明。

## 相对上一版（562 将 / 46 包）的增量

### 新增/扩充的包

| 包 id | 中文名 | 将数 | 说明 |
|---|---|---:|---|
| `xinghuo` | 星火燎原 | 30（+20） | 补孙登、步骘、司马朗、杜畿、董允、严畯、戏志才、孙乾、秦宓、薛综、潘濬、马忠、李严、糜竺、周鲂、吕岱、刘繇、吕虔、祖茂、徐氏 |
| `clan2` | 门阀士族·族将 | 24（+12） | 补族荀攸、族荀采、族荀莳、族荀爽、族王广、族王明山、族王允、族吴苋、族吴班、族诸葛果、族陆绩、族杨赐 |
| `flash` | OL·闪 | 6（+1） | 补闪朱儁（`zhujun_fendi`/`zhujun_jujiang`），并补齐长期未注册的 `chaozheng`/`shenchong`/`julian`/`zhengbing`/`tuwei`/`feiyang`/`bahu` |
| `yj2015` | 一将成名·2015 | 5（新包） | 刘谌、张嶷、朱治、公孙渊、郭图逢纪（`y15_` 前缀） |
| `yz2016` | 原创之魂·2016 | 3（新包） | 岑昏、孙资刘放、黄皓（`yz16_` 前缀） |

### 引擎改动（本轮）

1. `src/engine/game.js`：`VIRTUAL_RULES` **不再在装载时展开** `EXTRA_VIRTUAL_RULES`（技能文件在引擎之后 push 的转化规则此前是死代码），改由 `virtualAllowed()` 运行期合并。
2. `src/engine/game.js`：出【杀】次数上限支持 `CARD_META[name].noShaLimit`（牌数据声明「不计入次数」）。
3. `src/engine/game.js`：新增 `settleTaken(data)`；`useCard`/`respondCard` 派发 `cards.discard` 时带 `taken:[]` 并结算；`discardCards` 加同对象去重；`useCard` 进处理区前从弃牌堆摘除同牌。
4. `src/engine/game.js`：回合回绕时派发新事件 `round.end`（新一轮开始前）。
5. `src/engine/pindian.js`：选牌前派发 `pindian.pick`（技能可替换本方拼点牌与点数），返回 `aNum/bNum`；`putAway` 处理牌堆顶牌。
6. `src/engine/skill.js`：`VALID_EVENTS` 增加 `pindian.pick`、`yishi.end`、`round.end`。

### 技能侧重要修正

1. **`sha.target` 死事件**：该事件在 `VALID_EVENTS` 白名单里但引擎**从不派发**，【等力】【震峭】【绝烈】【分敌】【追命】5 处均为死代码 → 统一改挂 `target.after` + `d.card.name==='sha'` + 使用者判定。
2. **宝物槽连带遗漏**：`equips.treasure` 引入后 `lei3.js`（【雄乱】废除栏）、`star2.js`（空装备栏）、`weizhen.js`/`qunying.js`（SLOTS）仍按 4 栏硬编码 → 全部补 `treasure`；【雄乱】改为无条件废除全部 5 栏。
3. **降级技能升级**：desc 级降级由 51 条压到 18 条（清单见 `docs/degrade-inventory.md`），剩余 18 条均需引擎新能力（自定义装备牌/小游戏/新牌型/响应侧代打白名单等）。

## 主控已跑通的门禁（不必重复报）

`packcheck` 1508/0、`selfcheck` 44/0、`regression` 70/0、`sg020guard` 1636/0、`cardcons` 0 失败、
`equipcheck` 21/0、`skillaudit` 问题 0（603 将 / 1169 技能引用 / 实装 1169）、`skilllint` 8/0、
`leicheck` 151/0、`flashcheck` 40/0、`xinghuocheck` 86/0、`clancheck` 265/0、`clan2check` 351/0、
`shenwucheck` 360/0、`starcheck` 99/0，以及 40+ 个包级 check 全 0 失败。
