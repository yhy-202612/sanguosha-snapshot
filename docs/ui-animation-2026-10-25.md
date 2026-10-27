# 三国杀在线 · UI 动效改造记录（2026-10-25 夜）

由 Claude Opus 5.5（wawapii 中转，流式 + `reasoning_effort: low`）分四轮产出，主控负责拆任务、落地补丁、验收与部署。
原始产出全文见同目录 `opus-out-r*.md`；视觉重设计（第一晚）见 `ui-redesign-opus-2026-10-25.md`。

## 轮次概览

| 轮 | 主题 | 产出 | 结果 |
|---|---|---|---|
| R1 | 动效基础设施 | `FX` 状态容器 + `fxLater/fxReset/fxFlyCards/fxFloat/fxDiffHp/fxPhaseBanner/fxPulseSeat`；飞牌、掉血飘字、回合横幅、询问面板进出、计时条 `scaleX(--p)`、战报入场、目标脉冲 | 13/13 补丁应用 |
| R2A | 手牌与屏幕反馈 | 手牌重叠布局（`--n` + `fx-overlap`/`fx-scroll`）、卡牌 3D 光感跟随（rAF 节流、触摸/减动效不启用）、受伤/回复屏幕 vignette、他人掉血座位卡 shake | 4/4 |
| R2B | 场合特效 | 技能发动飘字（解析战报「发动【X】」）、结算浮层胜/负/平三套入场、大厅面板错峰入场、chip 涟漪、顶栏回合金线扫过、连接断开红脉冲/重连绿闪 | 6/6 |
| R3 | 审查与节奏统一 | 修两类泄漏（切视图时询问倒计时未清、桌面直接开新局导致旧 `lastHp` 让全体飘字）、飞牌与飘字改为「先批量读布局再统一写 DOM」、reduced-motion 全面补齐、JS 时长改读 CSS 变量（`fxVar/fxMs`） | 16/17（1 处 SEARCH 因空行差异失败，手工补插 `fxVar/fxMs`） |
| R4 | 摸牌与栏位细化 | 摸牌飞入（`fxDrawIn`，与上一帧手牌 id 集合差分）、勾玉失去/恢复过渡（`fxHpDots`，`::before/::after` 波纹）、装备入槽金闪与弃置幽灵淡出、询问选项错峰 + 最后 3 秒边框脉冲、技能面板错峰、房间座位入场、移动端 scroll-snap + 操作条滑入 | 10/10 |

## 关键技术点

- **飞牌不碰真实 DOM**：克隆手牌节点 → `position:fixed` + `el.animate` → `onfinish/oncancel` 立即 remove；动画句柄登记在 `FX.anims`，`fxReset()` 统一 `cancel()`。
- **飘字与横幅都按 key 去重**：`FX.lastHp`（座位→hp）做差分，首帧只记基线；横幅键为「回合|座位|阶段」，同一阶段不重复闪。
- **性能**：`fxFlyCards` 与 `fxDiffHp` 改为「批量读 rect → 批量写 DOM」，8 人局不再布局抖动。
- **节奏统一**：`:root` 里新增 `--fx-t-fly/--fx-t-float/--fx-t-banner/--fx-t-skill/--fx-t-sweep/--fx-t-hit/--fx-t-vig/--fx-stagger`，JS 侧用 `fxMs()` 读取（不用 calc，因为 JS 读不到 calc 的解析值）。
- **reduced-motion**：飞牌/涟漪/技能名直接跳过；飘字与横幅降级为「静态显示到时长结束」，不会因全局 1ms 规则一闪而过丢掉伤害信息。

## 验收

| 项 | 本地 | 线上 |
|---|---|---|
| `tools/ui_check.py`（功能回归） | 123 / 0 | 123 / 0 |
| `tools/fx_check.py`（动效冒烟，含 reduced-motion） | 10 / 0 | 10 / 0 |
| `node tools/selfcheck.js`（服务端） | 44 / 0 | — |

新增工具：`tools/fx_check.py`（动效冒烟）、`tools/fx_diag.py`（等回合诊断）、`tools/apply_patches.py`（SEARCH/REPLACE 自动落地）、`tools/mk_ui_prompt*.py`（派单 prompt 生成）、`tools/extract_snippets.py`（抽取片段给模型）。

## 已知限制

- chip 涟漪：若点击后列表被整块重建，原节点被替换，涟漪可能看不见。
- 摸牌飞入：一次超过 8 张、或目标位置在手牌滚动区外时不飞（避免几十个克隆同飞）。
- `#selfInfo` 是纯文本信息条，没有勾玉节点，所以自己的体力变化只有飘字与 vignette。

## 回滚

```bash
cd /sandbox/workspace/sanguo
ls .bak/          # app.js.bak-<时分秒> / style.css.bak-<时分秒>
cp .bak/app.js.bak-XXXXXX client/app.js && cp .bak/style.css.bak-XXXXXX client/style.css
SH_PASS=... python3 tools/deploy/deploy.py
```

## 后续可做（未做）

1. 音效层：出牌/受伤/技能/回合切换音（需内联 base64 或 WebAudio 合成，避免外部资源）。
2. AI 回合「快进」：一次显示多条战报而不是逐条动画，减少等待感。
3. 战报语音朗读（接 Edge TTS 端点）。
4. 手牌拖拽出牌（拖到手牌区上方松手即打出）。
