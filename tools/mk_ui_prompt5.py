#!/usr/bin/env python3
"""第二轮动效的分批派单 prompt。
用法：python3 tools/mk_ui_prompt5.py <out> <batch:a|b|c>
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


COMMON = r"""你在给《三国杀》在线对战前端做**动效完善**（第二阶段）。上一阶段已落地：飞牌、掉血飘字、回合横幅、询问面板进出、计时条 scaleX、战报入场、目标脉冲（代码里 `FX` 与 `fx*` 前缀）。

## 语境与约束（务必遵守）
- 纯静态前端：原生 HTML/CSS/ESM JS，无框架、无外部资源。桌面 1440×900 为主，手机 390×844 可玩。
- 规则判定在服务端，前端只渲染与收集操作。**禁止改**：`api()`、`connect()` 的 SSE 逻辑、`submit()`/`submitPlay()` 的请求体、`allowedCardIds()`/`isTargetSelectable()`、牌张数据结构。
- `render*` 函数整块重建 innerHTML，动效只对新增节点做入场。
- 过渡/动画只允许：transform、opacity、box-shadow、color、background-color（filter 仅限单卡小面积且结束清除）。
- 不改任何已有 id / class 名，新增统一 `fx-` 前缀。不得引入外部资源。
- `prefers-reduced-motion: reduce` 时新增动效降级为瞬时或无。
- 新定时器必须登记（沿用 `fxLater()`），切出桌面时由 `fxReset()` 清理；animation 结束要移除临时 class。
- 单个 SEARCH 段 5~25 行、逐字一致、全文唯一；补丁彼此独立（后面的 SEARCH 不得依赖前面已替换的内容）。
- **本批只做下面列出的几项，不要顺手扩大到别的模块**；方案要克制，不要过度设计。

## 本批任务
"""

TASKS = {
    "a": r"""### A1 手牌"主角感"重叠布局
手牌 ≥6 张时自动重叠（相邻牌负 margin / translateX 叠加，牌越多重叠越多，用容器 `--n` + CSS calc 控制），悬停/选中的牌抬到最上层（z-index），≤5 张不重叠。>10 张时允许横向滚动，两端加渐隐遮罩。保持 `#handRow .card` 与 `data-cid` 结构不变（可在 `renderHand()` 里给容器设置 `--n`）。
### A2 卡牌光感跟随（仅桌面指针设备）
`pointermove` 时更新元素上的 `--mx/--my`（百分比），CSS 用径向渐变高光跟随 + `rotateX/rotateY` ≤6deg 的轻微 3D 倾斜；`pointerleave` 复位。要求：rAF 节流（一帧最多一次）；`pointerType==='touch'` 不启用；reduced-motion 不启用；离开/销毁时清掉内联样式。
### A3 受伤/回复的屏幕反馈
复用第一轮的 hp/护甲差分（`fxDiffHp`），不要重复计算：
- 自己掉血 → 屏幕四边红色 vignette 闪一次（fixed 覆盖层，opacity 动画，`pointer-events:none`，结束后移除节点或复位 class）。
- 自己回复 → 绿色低饱和 vignette（更弱）。
- 他人掉血 → 对应座位卡红闪 + `transform` 轻微 shake（≤3px）。
- 连发时不叠加多个覆盖层，复用同一节点并重启动画。
""",
    "b": r"""### B1 技能发动特效
从战报新增条目里解析「发动【X】」（以及「技能【X】」这类形态），在中央信息岛上方飘出金色技能名，0.3s 缩放淡入、1.1s 淡出；连发按 80ms 错峰堆叠。只对本次新增条目触发，历史回放不触发。
### B2 结算浮层动效
胜/负/平三种结果不同配色与入场：胜=金色扩散光、负=暗红压暗、平=青灰；大标题 scale 0.86→1 弹入，条目错峰淡入。不改已有按钮逻辑。
### B3 大厅与选将入场
`.panel` 首次进入错峰淡入上移（stagger 60ms）；`.gcard` 悬停抬起 + 金边光晕；`.chip` 点击时一次性涟漪（伪元素 scale 扩散）；选将弹窗内的武将卡错峰入场。
### B4 顶栏与连接状态
SSE 断开时 `.conn` 红色脉冲；重连成功后一次绿色闪光（文案不变）。轮到我方回合时顶栏一条细金线扫过（一次性 1.2s）——与第一轮的中央横幅配合，不要重复弹两次大字。
""",
    "c": r"""### C1 审查并修正第一轮动效实现
请逐条检查现有 `FX` / `fx*` 代码，找出并修复以下类型的问题（有则给补丁，没有就在摘要里写明「已核查」）：
1. 定时器/动画泄漏：切视图、换局、房间重开后仍在跑的 setTimeout / animate 句柄。
2. 重复触发：同一事件闪两次（例如 hp 差分与战报解析同时触发同一种提示）。
3. reduced-motion 覆盖不全。
4. 性能：每帧多次读写布局（`getBoundingClientRect` 循环）、批量 DOM 操作未用 fragment。
5. 边界：手牌为空 / 座位数 2 / 座位数 8 / 自身阵亡 / 战报清空时的行为。
### C2 统一动效节奏
把所有新增与已有的动效时长/缓动收敛到 CSS 变量（`--t-fast/--t-base/--t-slow`、`--ease-out`），去掉散落的硬编码 ms；并确保同一类交互（面板进、提示出、卡牌抬起）在两处实现里用的时长一致。
""",
}
TASKS["d"] = r"""### D1 摸牌/获得牌的飞入
`renderHand()` 会重建手牌。请对比上一次的 card id 集合，对新出现的牌做「从中央牌堆 `#tableCenter` 飞到它最终手牌位置」的入场（克隆飞行的做法沿用第一轮 `fxFlyCards`），时长与缓动读 `--fx-t-fly`。要求：首帧（无历史）不飞；一次摸多张时按 `--fx-stagger` 错峰；`prefers-reduced-motion` 直接跳过；不得改变手牌渲染结构与 `data-cid`。
### D2 勾玉与护甲的变化过渡
体力勾玉（`.hpdot`）失去时缩小+淡出并留一个短暂红波纹，恢复时弹入（`transform: scale` + opacity，只动这两个属性）；护甲（`.armorbar`）变化时数值闪一次。要求：靠 CSS 的 `transition` 或一次性 class 实现，不要在 JS 里逐帧改样式；相邻勾玉不得因尺寸变化导致布局跳动（用 transform，不改宽高）。
### D3 装备区的变化提示
`#selfEquips` 中某个槽位从空变为有装备时，该槽位一次性金边闪光 + 图标 pop（`--t-base`）；装备被弃置时淡出。若 `.eq-row` 结构不支持，可在 `renderSelfEquips()` 里对比上一次的槽位内容实现，不要改 DOM 结构。
### D4 询问面板与技能面板的细化
- 询问面板选项按钮错峰入场（`--fx-stagger`），hover 轻微抬起；倒计时进入最后 3 秒时面板边框脉冲（只动 box-shadow/opacity），与已有的计时条变色配合但不要重复闪烁两种颜色。
- 技能面板（`openSkills()` / `openOneSkills()`）打开时条目错峰淡入，技能条目 hover 金边光晕；关闭时淡出（保持既有显隐语义）。
### D5 房间等待与准备状态
房间座位卡（`.seatcard`）首次渲染错峰入场；「准备/未准备」状态切换时该卡一次轻微缩放反馈（`.off` 已有半透明，不要改其语义）。
### D6 移动端手牌与操作条
≤760px：`#handRow` 横向滚动加 `scroll-snap-type: x proximity`、两端渐隐遮罩；`#actionBar` 首次出现时从上往下滑入（只动 transform/opacity），并给按钮最小触摸高度 40px。
"""
TAIL = r"""
## 输出格式（严格按标记，机器解析）
先 ≤25 行摘要。
然后：

===PATCH: client/app.js===
<<<<<<< SEARCH
（逐字原文，必须出现在我提供的片段里）
=======
（替换后代码）
>>>>>>> REPLACE

===FILE: client/style.css.append===
（只写新增 CSS，不要重发整份 style.css）

===FILE: client/index.html===
（需要新元素才给完整文件，否则写 ===NOCHANGE===）

不要输出 diff 行号、不要用省略号代替代码。

=================== 当前 client/index.html ===================
"""


def main():
    out = sys.argv[1]
    batch = (sys.argv[2] if len(sys.argv) > 2 else "a").lower()
    head = COMMON + TASKS[batch] + TAIL
    body = (head + read("client/index.html")
            + "\n=================== 当前 client/style.css ===================\n" + read("client/style.css")
            + "\n=================== 可修改的 app.js 代码片段（非全文） ===================\n" + read("/tmp/snippets.md")
            + "\n=================== 结束 ===================\n请开始。\n")
    open(out, "w", encoding="utf-8").write(body)
    print(f"wrote {out}: {len(body)} chars (batch {batch})")


if __name__ == "__main__":
    main()
