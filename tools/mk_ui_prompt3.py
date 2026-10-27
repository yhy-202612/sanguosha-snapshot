#!/usr/bin/env python3
"""第二阶段（动效/交互）派单 prompt：python3 tools/mk_ui_prompt3.py <out> [round]
round=1 动效基础设施与出牌/伤害/回合反馈；round=2 手牌与面板过渡、细节打磨
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


HEAD = r"""任务：为《三国杀》在线对战前端**补上动态与交互动效**（第二阶段）。上一阶段已完成视觉重设计（当前 style.css 已是新的设计 token 体系），这一阶段专注「动起来的质感」与交互反馈，需要你同时给出 **app.js 补丁** 和 **style.css 追加样式**。

## 语境（务必先看代码再动手）
- 纯静态前端：原生 HTML + CSS + ES module JS，无框架/无构建/无外部资源。桌面为主（1440×900），手机（390×844）可玩。
- 服务端是权威引擎，前端只负责「渲染 + 收集玩家操作 + 通过 SSE 收快照」；**任何规则判定都不在前端**，所以你可以放心做视觉层改造，但绝不能改网络请求、SSE 处理、提交逻辑的语义。
- 关键渲染函数（行号供你定位，以实际代码为准）：`renderTable()`（1032）、`playerCard()`（1096）、`renderSelfEquips()`（445）、`renderHand()`（1184）、`renderActions()`（1210）、`clickCard()`（1280）、`toggleTarget()`（1258）、`submitPlay()`（1320）、`renderAsk()`（1335）、`syncAskOffset()`（841）、`addLog()`（1410）、`showOverlay()`（1427）、`modal()`（429）、`toast()`（367）、`bindCardTip()`（415）、`showCardTip()`（394）。
- 渲染模式：服务端推 snapshot → 各 render* 函数整块重建 innerHTML（所以元素会被替换，动画要考虑到这一点）。

## 本轮要做的事（按优先级，逐项落地）
### 1. 出牌/弃牌「飞牌」动效
点「确定出牌」成功后，被使用的牌应从手牌位置飞向中央 `#tableCenter`（视觉影子副本即可，不能影响真实 DOM）。要点：
- 用「克隆节点 + position:fixed + transform 位移」实现；动画结束 remove 克隆，绝不动真实卡片节点。
- 一次可以多张（多选牌场景），错开 40~60ms 依次飞出。
- 用 Web Animations（`el.animate(...)`）或 class + transition 都行，但要能拿到动画结束回调；**不要 await 阻塞提交逻辑**。
### 2. 伤害/回复/失去体力的飘字
`renderTable()` 每帧会用快照重建座位卡。请在渲染时对比「上一次 hp/armor」与「本次」，在对应座位卡（`.pcard`）或自己的 `#selfInfo` 上浮出 `-1` / `+1` / `-护甲` 飘字（红/绿/蓝），0.9s 后自动清理。要求：
- 差分状态存在模块级变量里（如 `lastHp = new Map()`），初次渲染不飘字。
- 同一座位连续掉血时飘字要错位，不要叠在一起。
- 飘字层用 fixed 定位 + `pointer-events:none`，不参与布局。
### 3. 「你的回合」/阶段切换的中央提示
当快照显示「当前回合变成我」或阶段发生变化时，在中央信息岛闪一条轻量提示（如「你的回合 · 出牌」淡入淡出 1.2s），只做视觉，不改布局；节流：同一阶段不重复闪。
### 4. 询问面板（#askPanel）进出过渡
`renderAsk()` 会重建面板内容。要求：面板出现时用 transform+opacity 入场（保持 `.hidden` 的 `display:none` 语义不变，即出现时才移除 hidden 并加 `.in` 类），关闭时若有过渡需要延迟 display，可加 `.out` 类 + `animationend` 或 setTimeout 兜底。同时保证 `syncAskOffset()` 的定位逻辑不受影响（它计算面板高度来避让手牌）。
### 5. 计时条改为 transform 驱动
`#askPanel .timer i` 目前靠 JS 改宽度（会触发 layout）。改为：JS 只设置 CSS 变量（如 `--p: 0.62`），CSS 用 `transform: scaleX(var(--p))` + `transform-origin:left`，并保留超时变色（<=0.3 转橙、<=0.15 转红 + 脉冲）。保持原有剩余时间文案。
### 6. 战报（#logPanel）新条目入场 + 自动滚动
`addLog()` 追加条目时：新条目淡入上移（CSS keyframes，给新节点加类），若当前已滚动到底部则自动滚到最新（`scrollTop` 比较阈值 24px），用户手动上翻时**不**强制滚动。
### 7. 目标选择的交互反馈
`toggleTarget()` 选中/取消时给座位卡一个短暂高亮脉冲（class + animation，animationend 移除），并在中央或顶部给出「已选择：X / 还需选择 N 个」这类轻提示（若代码里已有类似提示就复用，不要新增重复 UI）。

## 硬约束
1. 不得引入外部资源；不得改任何 id / 已有 class 名（可新增 `fx-` 前缀类名）。
2. 不得改：`api()`、`connect()` 里的 SSE 逻辑、`submit()` / `submitPlay()` 的请求体、`allowedCardIds()` / `isTargetSelectable()` 的判定、牌张数据结构的任何字段。
3. `render*` 函数仍是整块重建，**不要改成 diff/patch 渲染**（风险太大）。
4. 所有动效必须尊重 `prefers-reduced-motion: reduce`（动效时长归零）。
5. 所有过渡只允许 transform / opacity / box-shadow / color / background-color；不得对 width/height/top/left/margin 做 transition。
6. 定时器与动画句柄必须能被清理（避免切换视图后残留：可用模块级 Set 记录 setTimeout，切换视图时 clear）。
7. 单个改动尽量小：每个 SEARCH 段 5~25 行、必须逐字一致且全文唯一。

## 输出格式（严格，机器解析）
先 ≤30 行改造摘要（要点式）。
然后：

===PATCH: client/app.js===
<<<<<<< SEARCH
（原文逐字，含缩进）
=======
（替换后代码）
>>>>>>> REPLACE
（按需多个块）

===FILE: client/style.css.append===
（只写新增的 CSS，不要重发整份 style.css；由主控追加到文件末尾）

===FILE: client/index.html===
（需要新增容器/元素才给完整新文件，否则只写 ===NOCHANGE===）

注意：不要输出 diff 行号；不要用省略号省略代码；补丁之间必须彼此独立（后面的 SEARCH 不能依赖前面已替换的内容）。

=================== 当前 client/index.html ===================
"""

MID = "\n=================== 当前 client/style.css ===================\n"
MID2 = "\n=================== 当前 client/app.js ===================\n"


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ui_prompt3.txt"
    txt = (HEAD + read("client/index.html") + MID + read("client/style.css") + MID2 + read("client/app.js")
           + "\n=================== 结束 ===================\n请开始：先 30 行以内改造摘要，再输出 app.js 补丁与 CSS 追加。\n")
    open(out, "w", encoding="utf-8").write(txt)
    print(f"wrote {out}: {len(txt)} chars")


if __name__ == "__main__":
    main()
