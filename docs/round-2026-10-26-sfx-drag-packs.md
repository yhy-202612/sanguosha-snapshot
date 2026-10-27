# 三国杀在线 · 音效 / 拖拽出牌 / 三个稀有扩展包（2026-10-26）

本轮完成三件事：①WebAudio 音效层 ②手牌拖拽出牌 ③三个新武将包（22 将）④第四批动效（F 批，Claude Opus 5.5）。
线上：<http://120.48.43.211/sanguo/>

---

## 一、音效层 `client/audio.js`

零依赖 WebAudio 合成（无任何音频文件，全部波形现场生成，包体 5.7KB）。

| API | 说明 |
|---|---|
| `sfx(name)` | `ui` / `card` / `draw` / `hit` / `heal` / `skill` / `turn` / `win` / `lose` / `tick` |
| `toggleSfx()` / `isSfxOn()` | 开关与查询，静音状态存 `localStorage('sg_sfx_muted')` |
| `unlockSfx()` / `bindSfxUnlock()` | 首次用户手势解锁 AudioContext（浏览器自动播放策略） |

挂接点（8 处）：`fxFlyCards` → `card`、`fxDiffHp` → `hit`/`heal`、`fxPhaseBanner` → `turn`、`fxSkillName` → `skill`、`fxDrawIn` → `draw`、`showOverlay` → `win`/`lose`、倒计时最后 3 秒 → `tick`、按钮/选项点击 → `ui`。
顶栏新增 `#btnSfx`（`aria-pressed` 反映状态，文案「音效开 / 音效关」）。

**口径**：所有音效都是短促合成音（正弦/方波 + 快速包络），不做长混响；`prefers-reduced-motion` 不影响音效，静音开关是唯一总闸。

## 二、手牌拖拽出牌

复用真实出牌链路：拖拽只是「选择 + 提交」的手势外壳，落点命中后调用同样的 `clickCard(c)` + `submitPlay()`，因此校验、target 选择、非法牌提示全部与点击一致。

| 函数 | 职责 |
|---|---|
| `fxBindDrag(row)` | 在 `renderHand` 末尾把当前手牌接上拖拽（每张牌 `pointerdown`） |
| `fxDragPaint(e)` | 生成 `.fx-drag` 跟随克隆、实时判定落点、`.fx-drop-on` 高亮 |
| `fxDragHit()` | 落点在 `#tableCenter`（或合法目标）时命中，调用出牌 |
| `fxDragReset()` / `fxDragDetach()` | 复位 / 卸载 window 级监听 |

关键点与踩坑：
1. **pointermove 必须挂 window**：第一版挂 `#handRow`，指针拖出手牌区事件就断，表现为「拖拽无反应」。
2. **手牌 id 是字符串**（`'c52'`），比较落点/命中必须 `String(id)`，用 `Number()` 会让匹配恒失败。
3. 拖拽期间置 `body.fx-dragging`：抑制卡牌详情浮层、抑制 3D 光感跟随；结束后 `S.suppressClickUntil` 拦一次 click，避免抬手误触选中。
4. 触摸与鼠标共用 pointer 事件；移动端不做长按浮层竞争（长按 420ms 才出详情，短拖不触发）。

## 三、三个稀有扩展包（22 将 / 452 → 474 将 / 38 → 41 包）

| 包 id | 中文名 | 将数 | 武将 |
|---|---|---|---|
| `sp5` | SP·绝世 | 8 | SP貂蝉(离魂/闭月)、SP周瑜(反间/英姿)、马云禄(马术/凤魄)、曹金玉(金玉)、孙寒华(寒华/凝冰)、花鬘(战缘)、张琪瑛(雷击)、卑弥呼(邪马台) |
| `xe` | 稀世珍宝 | 7 | 张让(滔乱)、庞德公(评才/雅士)、黄承彦(观戏)、钟琰(观戏)※、张梁(妖术)、张宝(呼风)、丘力居(骁骑/掠阵) |
| `rare` | 稀有·传说 | 7 | 神魏延(奇谋)、孙鲁育(止息)、骆统(勤政)、贺齐(奋威)、全琮(邀名)、胡车儿(盗戟)、蹋顿(乱战) |

※ 见下「观戏」修正 —— 现为黄承彦持有。

引擎侧新增/修正：
- `src/engine/virtual-extra.js` 注册【滔乱】的转化规则（`{skill:'xe_taoluan', as:'wuzhong', test: cards.length===1}`），否则日志报「没有可将此牌当作【无中生有】使用的技能」。
- 「我造成伤害」类技能（凤魄/掠阵/奋威/乱战）必须 `who:'any'` + filter 里用 `d.player` 判定技能拥有者；`damage.before` 的 `data.self` 是**受害者**，用 `who:'self'` 会静默不触发（乱战 +1 伤害曾因此不生效）。

## 四、本轮修掉的引擎/前端真 bug

| 现象 | 根因 | 修法 |
|---|---|---|
| 压力测试 6/66 局报 `⚠ 技能 观戏 执行异常：Cannot read properties of undefined (reading 'name')` | `card.use.after` 的事件原始数据里**没有 `player` 字段**（`player` 只存在于 trigger 的 filter 入参，代表技能拥有者）；effect 里用 `ctx.data.player.name` 必崩 | effect 改用 `ctx.data.self`（使用者），并加空值兜底 |
| packcheck「滔乱」断言恒失败 | 对手手里有无懈可击，把无中生有抵消了（规则正确、断言环境不当） | 测试里清空对手手牌；断言消息附带最近 4 条战报便于定位 |
| 拖拽 smoke「5 → 5」看起来没出牌 | 断言含 `or toast` 兜底（弹出「需要选择目标」也算通过） | 保留原口径，另由 `drag_check` 的 FX 断言保证手势本身命中 |

## 五、第四批动效（F 批 · Claude Opus 5.5）

派单 prompt 生成器 `tools/mk_ui_prompt7.py`（约束 ≤100K 字符：style.css 只给手牌/座位/标记/fx 相关 114 个规则块）、落地器 `tools/apply_patches2.py`（支持多 `===PATCH` 段 + 容忍标记行前空白 + 三级 SEARCH 匹配）。

| 编号 | 主题 | 落地内容 |
|---|---|---|
| F1 | 手牌可出性引导 | `fxHandPlay()` 判定「我的出牌阶段」→ `allowedCardIds()` 命中加 `fx-playable`（上浮 + 边缘提亮），其余 `fx-mute`（opacity .55）；有选中牌时行加 `fx-has-sel`，未选中牌 `scale(.975)`；离开出牌阶段全部撤销 |
| F2 | 出牌链条接续 | 飞行卡加 `fx-fly-trail` 拖尾（box-shadow，alpha .35→0，200ms）；摸牌后手牌重排走 FLIP（`fxFlipPlay`，仅新旧 id 交集，WAAPI `composite:'add'` 叠加在 `.sel` 之上）；判定牌 `rotateY` 翻开 260ms |
| F3 | 状态可读性 | 勾玉/护甲数字变化快跳 + 放大（1.25→1，160ms，与飘字错开 60ms）；marks chip 脉冲；装备入槽 `translateY(-8px)+scale(.92)` 淡入 |
| F4 | 大厅与房间 | 包 chip 点按回弹（.94→1，120ms，不阻断 onclick）；座位卡首次渲染下方 10px 淡入（`--fx-i` 错峰 40ms，最多 8 个）；进入房间面板上移 12px 淡入 220ms |
| F5 | 收尾 | 定时器全走 `fxLater`；动画 class 在 `animationend`/`transitionend` 移除；`prefers-reduced-motion: reduce` 只保留最终态 |

Claude 调用口径（本轮再次验证）：`stream:true` + `max_tokens:64000` + `reasoning_effort:"low"`，prompt 96.5K 字符、耗时 218s、输出 21943 字符 / 14 个补丁全中。
**注意**：`tools/claude_call_s.py`（urllib）本次被上游以 404 拒绝，同参数用 `curl --data-binary` 正常 200 —— 后续建议直接用 curl + 本地解析 SSE（本轮即如此，解析脚本思路见 commit 说明）。

## 六、验收数据（全部通过）

| 门禁 | 结果 |
|---|---|
| `selfcheck` | 44 / 0 |
| `regression` | 70 / 0 |
| `customcheck` | 148 / 0 |
| `newcardcheck` | 46 / 0 |
| `packcheck` | **910 / 0**（含新包 22 将数据断言 + 14 组行为断言） |
| `skilllint` | 8 / 0（60 个技能文件） |
| `starsim` | 42 局 / 0 失败，24 将全覆盖 |
| `newpacksim`（本轮新增） | **66 局 / 0 失败，22 将全覆盖**，含牌张重复/丢牌/护甲越界检查 |
| `ui_check` | 123 / 0（本地 + 线上） |
| `fx_check` | **17 / 0**（本轮加 3 条：可出性标记存在、非出牌阶段不残留、选中态与行标记一致） |
| `drag_check` | 10 / 0（本地 + 线上） |
| `newpack_check`（本轮新增） | **13 / 0**（三包 chip 中文名、勾选建房、房间配置显示、将池 22 名且只含三包、无 console 错误） |

线上 `/api/meta`：**474 武将 / 41 包**，三新包中文名与数量正确，月将 `moonMax` 保持 7/6/6。
