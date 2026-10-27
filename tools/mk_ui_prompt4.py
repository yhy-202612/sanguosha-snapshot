#!/usr/bin/env python3
"""第三阶段（动效第二轮：质感与场合特效）派单 prompt：python3 tools/mk_ui_prompt4.py <out>"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


HEAD = r"""任务：《三国杀》在线对战前端**动效第二轮**。第一轮已落地（飞牌 / 掉血飘字 / 回合横幅 / 询问面板进出 / 计时条 scaleX / 战报入场 / 目标脉冲，代码里 `FX`、`fx*` 前缀即那一轮产物）。这一轮做更高级的质感与"场合特效"，并请你顺手 review 第一轮的实现。

## 语境
- 纯静态前端（原生 HTML/CSS/ESM JS，无框架无外部资源）。桌面 1440×900 为主，手机 390×844 可玩。
- 规则判定全在服务端；前端只渲染 + 收集操作 + 收 SSE 快照。**禁止修改请求体、SSE 逻辑、判定函数、牌张数据结构**。
- 渲染模式：`render*` 全量重建 innerHTML；`#tableCenter`、`#opponents`、`#selfInfo` 等容器会被重建，做动效要考虑这一点（只对容器内新增节点做入场，不要依赖节点长期存在）。
- 战报 `addLog(entry)` 能拿到服务端日志文本，其中形如「发动【技能名】」「对 X 造成 N 点伤害」「X 回复 N 点体力」等。

## 本轮任务（全部要做，按此顺序）
### 1. 手牌"主角感"布局
- 手牌 ≥6 张时自动重叠（相邻牌负 margin 或 translateX 叠加），牌越多重叠越多（用容器上的 `--n` 变量 + CSS calc），悬停的牌抬到最上层（z-index）。
- ≤5 张时保持现状不重叠。要求既有 `#handRow .card` 结构与 `data-cid` 不变。
- 手牌过多时（>10 张）允许横向滚动，两端加渐隐遮罩提示。
### 2. 卡牌光感跟随（桌面指针设备）
- 手牌/座位卡在 `pointermove` 时更新 `--mx/--my`（百分比），CSS 用径向渐变高光跟随指针 + 轻微 `rotateX/rotateY`（≤6deg）的 3D 倾斜；`pointerleave` 复位。
- 必须节流到 rAF 一帧一次；触摸设备（`pointerType==='touch'`）不启用，reduced-motion 下也不启用。
### 3. 受到伤害/造成伤害的屏幕反馈
- 自己掉血：屏幕四边红色 vignette 闪一次（fixed 覆盖层，opacity 动画，`pointer-events:none`）。
- 自己回复：绿色低饱和 vignette。
- 他人掉血：对应座位卡一次红闪 + 轻微 shake（transform，≤3px）。
- 与第一轮的飘字共用同一份 hp 差分（`fxDiffHp`），**不要重复计算**。
### 4. 技能发动特效
- 解析战报文本里的「发动【X】」，在中央信息岛上方飘出金色的「【X】」两个字（或技能名全文），0.3s 缩放淡入、1.1s 淡出，连发时按 80ms 错峰堆叠。
- 只对「本次新增」的战报条目触发，历史战报回放不得触发。
### 5. 结算浮层（showOverlay）动效
- 胜/负/平三种结果不同配色与入场：胜=金色扩散光，负=暗红压暗，平=青灰；大标题 scale 0.86→1 弹入，条目错峰淡入。
- 提供「再来一局 / 返回大厅」按钮的 hover 呼吸（若这些按钮已存在，不改其逻辑）。
### 6. 大厅与选将动效
- 大厅 `.panel` 首次进入错峰淡入上移（stagger 60ms）；`.gcard` 悬停抬起 + 金边光晕；`.chip` 点击时一次性涟漪（伪元素 scale 扩散）。
- 选将弹窗（`openPickGeneral`）里的武将卡错峰入场。
### 7. 顶栏与连接状态
- SSE 断开时 `.conn` 红色脉冲；重连成功后一次绿色闪光（现有文案不变）。
- 「你的回合」时顶栏细金线扫过（一次性，1.2s）。
### 8. Review 第一轮实现并修正问题
- 检查 `fx*` 系列是否有：定时器泄漏（切视图/换局后仍在跑）、重复触发（同一事件闪两次）、reduced-motion 未覆盖、`el.animate` 在节点被重建后仍持有引用导致的内存滞留。
- 有问题的直接给补丁；没问题的在摘要里说明「已核查」。

## 硬约束
1. 不引入外部资源；不改任何 id / 已有 class（新增统一用 `fx-` 前缀）。
2. 不改 `api()` / `connect()` 的 SSE 逻辑 / `submit()` 请求体 / `allowedCardIds()` / `isTargetSelectable()`。
3. `render*` 仍是整块重建，不改造成 diff 渲染。
4. 一切过渡只允许 transform / opacity / box-shadow / color / background-color / filter（filter 仅限小面积单卡，且必须配 `will-change` 且动画结束清除）。
5. `prefers-reduced-motion: reduce` 时所有新增动效降级为「瞬时或无」。
6. 所有新定时器走 `fxLater()`（第一轮已有）或等价登记，切视图统一清理；新增 animation 结束必须移除临时 class 与内联样式。
7. 每个 SEARCH 段 5~25 行、逐字一致、全文唯一。

## 输出格式（严格）
先 ≤35 行摘要（含对第一轮的 review 结论）。
然后：

===PATCH: client/app.js===
<<<<<<< SEARCH
（原文逐字）
=======
（替换后）
>>>>>>> REPLACE

===FILE: client/style.css.append===
（只写新增 CSS）

===FILE: client/index.html===
（需要新元素才给完整文件，否则 ===NOCHANGE===）

不要输出 diff 行号、不要用省略号；补丁彼此独立。

=================== 当前 client/index.html ===================
"""

MID = "\n=================== 当前 client/style.css ===================\n"
MID2 = "\n=================== 当前 client/app.js ===================\n"


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ui_prompt4.txt"
    txt = (HEAD + read("client/index.html") + MID + read("client/style.css") + MID2 + read("client/app.js")
           + "\n=================== 结束 ===================\n请开始。\n")
    open(out, "w", encoding="utf-8").write(txt)
    print(f"wrote {out}: {len(txt)} chars")


if __name__ == "__main__":
    main()
