#!/usr/bin/env python3
"""动效第三批（音效/拖拽协同与精修）派单 prompt：python3 tools/mk_ui_prompt6.py <out>"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


HEAD = r"""你在给《三国杀》在线对战前端做**动效第三批**（收尾打磨 + 与新加的音效/拖拽协同）。

已落地的基础（不要重做）：
- 第一/二批：飞牌、掉血飘字、回合横幅、询问面板进出、计时条 `scaleX`、战报入场、目标脉冲、手牌重叠（`--n`/`fx-overlap`）、卡牌 3D 光感、受伤 vignette、技能名飘字、结算浮层三态、大厅错峰入场、顶栏金线、摸牌飞入（`fxDrawIn`）、勾玉/护甲过渡、装备闪光、移动端 scroll-snap。
- 新加：**WebAudio 音效层** `client/audio.js`（`sfx('card'|'draw'|'hit'|'heal'|'skill'|'turn'|'win'|'lose'|'ui'|'tick')`、`toggleSfx/isSfxOn/unlockSfx/bindSfxUnlock`，顶栏 `#btnSfx` 开关）、**手牌拖拽出牌**（`fxBindDrag`、`fxDragPaint`、`fxDragHit`、`fxDragReset/fxDragDetach`，`.fx-drag` / `#tableCenter.fx-drop-ready` / `.fx-drop-on`）。

## 本批任务（全部要做）
### E1 拖拽体验精修
- 拖动中：被拖卡片轻微放大 + 阴影加深（已有），增加**落点吸附**——指针进入落点区时卡片有一个简短的「吸入」提示（scale 1.06 → 1.10，只动 transform），离开回 1.06。
- 拖动中其它手牌轻微让位（被拖卡片左右相邻的牌向两侧各推开 6px，用 transform，松手复位）。
- 松手出牌成功：被拖卡片原地缩小淡出一次（克隆，不改真实节点）；松手未命中：回弹（`cubic-bezier(.34,1.4,.64,1)` 的 transform 过渡，200ms）。
- 拖拽期间抑制「卡牌详情浮层」弹出（`showCardTip` 不应在 `body.fx-dragging` 时出现），松手后恢复。
### E2 音效与视觉协同
- 音效开关按钮：切换时按钮本身一次轻微缩放反馈；关闭状态图标点变暗（CSS 已有，补动画）。
- 询问面板倒计时进入最后 3 秒：每秒触发一次 `sfx('tick')`（用既有 `--t-base` 节奏，不要新开 setInterval 泄漏；走 `fxLater`），并与面板脉冲同步。
- 受击时让 `sfx('hit')` 与 vignette 严格同帧启动（当前分别在两处触发，请收敛到一处避免「先响后闪」）。
### E3 结算与回合的收尾特效
- 结算浮层：胜/平/负各自的背景光做**一次**缓慢扩散（`transform: scale` + `opacity`，1.6s，只播一次）；标题后的条目错峰（沿用 `--fx-stagger`）。
- 回合开始横幅：在横幅消失后，若仍有剩余时间，给顶栏金线补一次极短的余韵（150ms 淡出），避免「横幅消失得很突然」。
### E4 性能与可维护性收尾
- 检查本批新增的一切：定时器是否走 `fxLater`、动画 class 是否在 `animationend` 移除、`prefers-reduced-motion` 是否覆盖。
- 把新增的时长/缓动统一并入 `--fx-t-*` / `--t-*` 变量，不允许出现新的硬编码毫秒（若必须，集中定义一次）。

## 硬约束
- 不改任何已有 id / class 名（新增统一 `fx-` 前缀）；不引入外部资源。
- 不改 `api()`、`connect()` 的 SSE 逻辑、`submit()` / `submitPlay()` 请求体、`allowedCardIds()` / `isTargetSelectable()`、`clickCard()` 的选中逻辑、`fxBindDrag` 里已有的 pointer 事件注册顺序（只允许在既有回调内追加视觉行为）。
- 过渡只允许 transform / opacity / box-shadow / color / background-color / filter（filter 仅单卡小面积）。
- 每个 SEARCH 段 5~25 行、逐字一致、全文唯一；补丁彼此独立。
- 输出要克制：本批是收尾，不要重写已有实现。

## 输出格式（严格）
先 ≤25 行摘要。然后：

===PATCH: client/app.js===
<<<<<<< SEARCH
（逐字原文，必须出现在我提供的片段里）
=======
（替换后）
>>>>>>> REPLACE

===FILE: client/style.css.append===
（只写新增 CSS）

===FILE: client/index.html===
（需要新元素才给完整文件，否则 ===NOCHANGE===）

=================== 当前 client/index.html ===================
"""


def main():
    out = sys.argv[1]
    snip = read("/tmp/snippets_small.md")
    audio = read("client/audio.js")
    body = (HEAD + read("client/index.html")
            + "\n=================== 当前 client/style.css ===================\n" + read("client/style.css")
            + "\n=================== 音效层 client/audio.js（只读参考，不要改） ===================\n" + audio
            + "\n=================== 可修改的 app.js 片段（非全文） ===================\n" + snip
            + "\n=================== 结束 ===================\n请开始。\n")
    open(out, "w", encoding="utf-8").write(body)
    print(f"wrote {out}: {len(body)} chars")


if __name__ == "__main__":
    main()
