#!/usr/bin/env python3
"""动效第四批（手牌可出性引导 / 出牌链条 / 状态可读性）派单 prompt：python3 tools/mk_ui_prompt7.py <out>"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def read_tmp(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


HEAD = r"""你在给《三国杀》在线对战前端做**动效第四批**（把「我现在能做什么」做成一眼能看懂的即时反馈）。

已落地的基础（**不要重做**，也不要改动它们的既有行为）：
- 飞牌 `fxFlyCards`、掉血飘字 `fxDiffHp`、回合横幅 `fxPhaseBanner`、技能名飘字 `fxSkillToast`、摸牌飞入 `fxDrawIn`、座位脉冲 `fxPulseSeat`、结算浮层三态、手牌重叠（`--n` / `.fx-overlap`）、卡牌 3D 光感、受伤 vignette、大厅错峰入场。
- **WebAudio 音效层** `client/audio.js`（`sfx('ui'|'card'|'draw'|'hit'|'heal'|'skill'|'turn'|'win'|'lose'|'tick')`，顶栏 `#btnSfx`）。
- **手牌拖拽出牌**（`fxBindDrag`/`fxDragPaint`/`fxDragHit`/`fxDragReset`，`.fx-drag` / `fx-drop-ready` / `fx-drop-on` / `body.fx-dragging`）。
- 第三批收尾：落点吸入、相邻让位、回弹、详情浮层抑制、倒计时 `tick`、受击同帧、结算光晕、条目错峰、横幅余韵。
- 已有变量：`--fx-t-*` / `--t-*` 时长、`--fx-stagger` 错峰；`fxLater(fn, ms)` 统一延时。

## 本批任务（全部要做）
### F1 手牌「可出性」引导（核心）
- 我的出牌阶段、`S.ask` 为 play 类询问时：`allowedCardIds()` 命中的手牌加 `fx-playable`（轻微上浮 + 边缘提亮，**只动 transform / box-shadow**），不命中的加 `fx-mute`（`opacity: .55` + 轻微下压 1px）。
- 已选中一张牌时：未选中的手牌整体轻微后退（`scale(.975)`），选中的牌保持原位并抬升（沿用既有 selected 视觉，只补过渡）。
- 这些 class 必须在 `renderHand()` 里按当前状态刷新、状态变化（换阶段/换选中）时自动撤销，**不得残留**（离开出牌阶段时全部移除）。
### F2 出牌链条的视觉接续
- `fxFlyCards` 的飞行卡：加一条淡拖尾（伪元素或 box-shadow 长投影，`opacity` 0.35 → 0，仅 transform/opacity），200ms 内结束。
- 摸牌后手牌重排走一次 FLIP：`renderHand` 前后记录各牌 `getBoundingClientRect()`，用 `transform` 补齐到旧位置再过渡到 0（140ms，`--fx-ease-out`）。**只在新旧卡片 id 交集上做**，避免新牌乱飞。
- 判定牌（`fxJudge` 或判定结果出现处）：给判定卡一次 `rotateY` 翻开（单卡 260ms，`transform-style` 不要污染布局）。
### F3 状态可读性
- 勾玉/护甲数字变化时：数字节点一次快跳 + 短暂放大（`scale 1.25 → 1`，160ms），与 `fxDiffHp` 的飘字错开 60ms（用 `fxLater`）。
- `marks` 标记数变化：对应标记 chip 一次脉冲（`transform` + `box-shadow`）。
- 装备区新增装备：从 `translateY(-8px)` + `scale(.92)` 淡入到正常（180ms）。
### F4 大厅与房间
- 包 chip 点击：一次点按回弹（`scale .94 → 1`，120ms，不阻断 chip 的原有 onclick）。
- 座位卡 `.seatcard` 首次渲染：从下方 10px 淡入，按 `--fx-i` 错峰（40ms 间隔，最多 8 个）。
- 从大厅进入房间（`#room` 由 hidden 变为可见）：房间面板整体一次上移 12px 淡入（220ms）。
### F5 收尾（必须）
- 本批所有定时器一律走 `fxLater`；所有动画 class 在 `animationend` / `transitionend` 移除；`prefers-reduced-motion: reduce` 时全部**只保留最终态、不播动画**。
- 新增时长集中定义到 `--fx-t-*`，不新增散落毫秒字面量。

## 硬约束
- 不改任何已有 id / class 名（新增统一 `fx-` 前缀）；不引入外部资源、不引入新依赖。
- **不得改动**：`api()`、`connect()` 的 SSE 逻辑、`submit()` / `submitPlay()` 的请求体、`allowedCardIds()` 的判定逻辑、`isTargetSelectable()`、`clickCard()` 的选中语义、`fxBindDrag` 里 pointer 事件的注册顺序（只允许在既有回调内追加视觉行为）。
- 过渡只允许 transform / opacity / box-shadow / color / background-color；`filter` 仅限单卡小面积。
- 每个 SEARCH 段 5~25 行、逐字一致（必须出现在我给的片段里）、全文唯一；各补丁彼此独立，能单独应用。
- 输出克制：本批是视觉反馈层，不要重写已有实现，不要顺手重构。

## 输出格式（严格）
先给 ≤25 行摘要（说明每处改动落在哪个函数）。然后：

===PATCH: client/app.js===
<<<<<<< SEARCH
（逐字原文）
=======
（替换后）
>>>>>>> REPLACE

（可重复多个 PATCH）

===FILE: client/style.css.append===
（只写新增 CSS，不要重复已有规则）

===FILE: client/index.html===
（需要新元素才给完整文件，否则 ===NOCHANGE===）

=================== 当前 client/index.html ===================
"""


def main():
    out = sys.argv[1]
    snip = read_tmp("/tmp/snips4.md")
    style = read_tmp("/tmp/style4.css")
    body = (HEAD + read("client/index.html")
            + "\n=================== client/style.css（节选：手牌/卡牌/座位/标记/装备/fx 相关规则，足够你写新 CSS；新规则仍写进 append 段） ===================\n" + style
            + "\n=================== 音效层 client/audio.js 导出签名（只读参考，不要改） ===================\n"
            + "sfx(name) / isSfxOn() / toggleSfx() / unlockSfx() / bindSfxUnlock()；name ∈ ui card draw hit heal skill turn win lose tick\n"
            + "\n=================== 可修改的 app.js 片段（非全文） ===================\n" + snip
            + "\n=================== 结束 ===================\n请开始。\n")
    with open(out, "w", encoding="utf-8") as f:
        f.write(body)
    print(f"wrote {out}: {len(body)} chars")


if __name__ == "__main__":
    main()
