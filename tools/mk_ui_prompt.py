#!/usr/bin/env python3
"""生成发给 Claude 的 UI 优化任务 prompt（内联三国杀前端三文件全文）。
用法：python3 tools/mk_ui_prompt.py /tmp/ui_prompt.txt
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


HEAD = r"""你是资深游戏 Web UI 视觉设计师 + 前端性能工程师。请对下面这套《三国杀》在线对战网页前端做**美工与 UI 流畅性**的优化，并输出**可直接覆盖落地的代码**。

## 项目背景
- 纯前端零依赖：HTML + 原生 CSS + 原生 ES module JS（无框架、无构建、无 CDN、无外部字体/图片）。
- 部署在子路径 /sanguo/，玩家主要是中学生，桌面端（1440×900 / 1280×800）为主，手机端（390×844）辅助。
- 视觉基调：深色（近黑蓝）+ 朱红 + 古金，三国题材。当前基调可以保留与强化，但要求更精致、更有质感。
- 页面结构固定：顶栏 → 大厅（创建/加入房间、武将一览）→ 房间等待 → 对局桌面（对手座位卡 / 中央区 / 自己的信息条+装备条+手牌+操作按钮）→ 右侧战报抽屉 → 询问面板 #askPanel / 结算浮层 #overlay。

## 我方对当前界面的实拍评审（供你定位问题，不要照抄结论，以代码为准）
1. 对局桌面中央区域大面积空黑，只有「当前回合：X（Y）」「弃牌堆 0 张」两行小灰字，信息密度极低、视觉浪费严重。
2. 对手座位卡（.pcard）信息弱：昵称/武将/势力/血条/护甲挤在一起，字号小、对比低，看不出谁是当前回合、谁是目标、谁已阵亡的差别。
3. 战报抽屉（#logPanel）文字过小，回合分隔与普通事件无层次，长段阅读疲劳。
4. 手牌（.hand / .card）牌面有淡紫渐变，牌名/花色/点数在小尺寸下锐度不足；选中态与可出牌/不可出牌状态区分不够。
5. 大厅表单拥挤：标签列宽固定 62px 导致长说明折行错位（如「双将」说明被压成多行），chips 一行塞太多、选中态只有细红边不够醒目，整体缺少栅格与呼吸感。
6. 全局：颜色语义混乱（红色同时表示选中/危险/在线），状态反馈（连接中、等待他人、你的回合、可点目标）缺少统一的视觉语言；缺少动效节奏，切换面板/开战报/出牌结算都是硬切。

## 两条硬目标
### A. 美工（视觉质量）
- 建立设计 token：色阶（背景/表面/描边/主文/次文）、间距刻度、圆角刻度、阴影层级、字体层级，统一到 :root 变量。
- 强化三国题材质感但不浮夸：可用纯 CSS 实现（渐变、内阴影、细描边、金线、微纹理用 repeating-linear-gradient）。
- 让「当前回合 / 可选中目标 / 已阵亡 / 已选中 / 危险」五类状态一眼可分；血条勾玉与护甲盾行要精致易读。
- 手牌要成为视觉主角：牌尺寸、比例、字号层级、花色红黑配色、悬停浮起、选中抬起、不可用灰化。
- 大厅表单：对齐栅格、标签列宽与行距统一、chips 做成可扫读的按钮组（选中态明显、hover 有反馈、数量标注弱化）。
- 响应式：桌面充分利用横向空间（对局桌面可考虑对手区网格排布 + 中央区承载回合信息），≤760px 时按钮触摸目标 ≥40px、手牌可横向滚动、战报改为全屏抽屉。

### B. UI 流畅性（既包括观感流畅，也包括运行流畅）
- 所有过渡/动画只作用于 transform 与 opacity（避免 width/height/top/left/filter 引起的 layout/paint 抖动）；统一 transition 时长与缓动曲线（2~3 档即可，做成变量）。
- hover 引起的边框/描边变化不要用 border 改宽度（会重排），改用 box-shadow / outline / 伪元素。
- 适度使用 `will-change`（仅对会动的元素，且不要滥用）、`contain: layout paint`（对座位卡、手牌等固定尺寸项）、`overscroll-behavior`、自定义细滚动条。
- 大面积模糊（backdrop-filter）只保留在顶栏这类小面积元素；不要给整屏或多个卡片加 blur。
- 面板/抽屉出现用 transform+opacity 过渡（不要用 display 硬切动画，如需显示仍需 display，请给出 app.js 配合的 class 切换方案）。
- 手牌增减、血条变化、提示浮层出现要有轻量过渡，且不引起周围元素跳动（用固定占位/绝对定位）。
- 长列表（武将一览、战报）渲染稳定，不因 hover 改变尺寸。

## 硬约束（违反即返工）
1. 不得引入任何外部资源：禁止 @import、CDN、web font、外部图片；允许 CSS 渐变、内联 `data:image/svg+xml` 形式的极简 SVG 背景（必须用 url("data:image/svg+xml;utf8,...") 且不含网络请求）。
2. 不得重命名任何已存在的 id 与 class 名（app.js 大量依赖 querySelector 与 classList 判断）。可以新增 class，但必须同时在 app.js 补丁里真正加上，否则视为无效改动。
3. 不得改动与规则/网络/状态机/牌张守恒相关的任何逻辑。app.js 只允许改「渲染、样式相关的属性、动画、事件节流、纯视觉辅助函数」。
4. 保持以下既有布局钩子与交互契约不变（可以改它们的样式）：`body.log-open #table{margin-right}`、`.hidden{display:none!important}`、`#selfInfo.targetable/.picked`、`.pcard.active/.dead/.targetable`、`.chip.on`、`button.primary/.secondary/.ghost`、`.screen`、`.panel`、`#askPanel`、`#overlay`、`#logPanel`。
5. 不写 npm 包、不写构建步骤；产物必须是浏览器直接可跑的静态文件。
6. CSS 请控制在 700 行以内（不含注释），信息密度优先，不要堆无用规则；每条规则都要有存在理由。

## 输出格式（严格按此，机器会解析落地）
先输出不超过 60 行的「改造摘要」（改了哪几块、为什么、有哪些需要 JS 配合）。
然后依次输出文件块，标记必须单独成行、完全一致：

===FILE: client/style.css===
（这里放完整的新 style.css 全文，可直接覆盖原文件）

===FILE: client/index.html===
（只有当必须增减 DOM 元素/属性时才给完整新文件；没有任何结构改动就写一行：===NOCHANGE===，不要输出其他内容）

===PATCH: client/app.js===
（每处改动用一个补丁块，格式如下，SEARCH 段必须与原文逐字一致且唯一：）
<<<<<<< SEARCH
原代码逐字（含缩进，最多 30 行）
=======
替换后的代码
>>>>>>> REPLACE
（没有任何 JS 改动就写一行：===NOCHANGE===）

要求：
- 所有 SEARCH 段必须来自我下面提供的 app.js 原文，逐字一致（含空格与换行）。若某处改动超过 30 行，请拆成多个连续小块。
- 补丁必须可直接按顺序应用，后一块的 SEARCH 不能依赖前一块已替换的内容。
- 不要输出 diff 行号、不要输出省略号替代代码。

=================== 以下是当前代码全文 ===================

########## client/index.html ##########
"""

MID = "\n########## client/style.css ##########\n"
MID2 = "\n########## client/app.js ##########\n"


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ui_prompt.txt"
    buf = io.StringIO()
    buf.write(HEAD)
    buf.write(read("client/index.html"))
    buf.write(MID)
    buf.write(read("client/style.css"))
    buf.write(MID2)
    buf.write(read("client/app.js"))
    buf.write("\n=================== 代码结束 ===================\n")
    buf.write("\n现在请开始输出：先「改造摘要」，再按要求输出 style.css 全文与必要的 index.html / app.js 改动。\n")
    txt = buf.getvalue()
    with open(out, "w", encoding="utf-8") as f:
        f.write(txt)
    print(f"wrote {out}: {len(txt)} chars")


if __name__ == "__main__":
    main()
