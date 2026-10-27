#!/usr/bin/env python3
"""生成发给 Claude 的精简版 UI 任务 prompt（只含 style.css + index.html + class 语义清单）。
用法：python3 tools/mk_ui_prompt2.py /tmp/ui_prompt2.txt
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


HEAD = r"""任务：为《三国杀》在线对战网页**重写整份 style.css**，目标是「美工质感 + UI 流畅性」双提升。只输出 CSS（以及必要时的 HTML 结构微调），不写 JS。

## 语境
- 纯静态：原生 CSS，无框架、无构建、无 CDN、无外部字体与图片。深色基调（近黑蓝 #0e1116 系）+ 朱红 + 古金，三国题材，玩家多为中学生。
- 桌面为主（1440×900 / 1280×800），手机（390×844）可玩。
- 页面流程：顶栏 → 大厅（创建/加入房间 + 武将一览）→ 房间等待 → 对局桌面（对手座位卡一排 / 中央回合信息 / 底部自己的信息条+装备条+手牌+操作按钮）→ 右侧战报抽屉（body.log-open 时打开）→ 询问面板 #askPanel → 结算浮层 #overlay。

## 当前界面的实拍问题（以此为重点改造对象）
1. **对局中央区大面积空黑**：只有「当前回合：X（Y）」与「弃牌堆 N 张」两行小灰字，信息密度极低。→ 中央区应成为一个有质感的信息岛（如牌堆/弃牌堆可视化、回合阶段徽标、当前回合角色高亮），但只能用 CSS 与现有 DOM，不要新增元素（除非给 HTML 改动）。
2. **对手座位卡（.pcard）层次差**：昵称/势力/武将/血条/护甲/手牌数/距离挤在一起，字号小对比低；`.active`（当前回合）、`.targetable`（可选目标）、`.dead`（阵亡）三态区分弱。
3. **战报抽屉（#logPanel）**：字号过小、回合分隔线与普通事件无层次，长文阅读疲劳。
4. **手牌（.hand .card）**：牌面淡紫渐变削弱了牌名/花色/点数的锐度；选中（.sel/.picked）、可出、不可用三态区分不够；hover 无浮起感。
5. **大厅表单**：标签列固定 62px 导致长说明文字折行错位（如双将那一行），chips 过密、选中态只有细红边不够醒目，整体缺栅格与呼吸感。
6. **颜色语义混乱**：红色同时表示选中/危险/在线/品牌；缺少统一的「当前回合 / 可操作 / 不可用 / 危险 / 阵亡」视觉语言。
7. **动效缺失**：面板切换、战报开合、出牌结算都是硬切，没有节奏。

## 改造要求
### 视觉
- 建立完整设计 token（:root）：色阶（bg/surface/surface-2/line/text/muted/brand-red/brand-gold/accent-blue/success/warn/danger）、间距刻度（4 的倍数）、圆角刻度、三档阴影、字号与行高刻度、两档过渡时长变量。
- 质感用纯 CSS：渐变、内阴影、细描边（1px 高光模拟金属边）、金线分隔、repeating-linear-gradient 微纹理（低调）；卡牌与座位卡要有「可拿起的实体感」。
- 五类状态一眼可分：当前回合 / 可选目标 / 已选中 / 不可用（灰化）/ 阵亡（去饱和 + 半透明 + 斜线遮罩）。
- 手牌是主角：统一牌尺寸与比例（宽高比接近 5:7），牌名居中大字号、点数与花色左上角同色系、类型标签右下角弱化；悬停浮起（transform: translateY + scale + 阴影）、选中抬起并加金边、不可用降饱和。
- 血条勾玉（.hpdot / .hpdot.on）与护甲盾行（.armorbar .shield）要精致：勾玉用内阴影做出宝石感，满/空对比明显，护甲用蓝色系。
- 大厅：标签列宽统一（建议 72px + 右对齐或统一左对齐基线）、行距统一、chips 做成可扫读按钮组（选中态填充 + 金/红边 + 内发光，hover 有轻微上浮），数量标注（如「标准(25)」）视觉弱化。
- 战报：等宽数字、事件分级（回合头/技能/伤害/系统各有色标）、伤害与失去体力用红、回复用绿、系统提示用灰。
- 移动端 ≤760px：触摸目标 ≥40px、手牌横向滚动且吸附、战报全屏抽屉、座位卡横向滚动。

### 流畅性（硬要求）
- transition/animation 只允许 transform 与 opacity（外加 box-shadow/color 这类不触发 layout 的属性也可，但绝不允许动 width/height/top/left/margin/font-size）。
- hover 变化不要改 border 宽度，用 box-shadow/outline/伪元素。
- 统一用 --t-fast (120ms) / --t-base (200ms) / --t-slow (320ms) 与两条缓动曲线。
- 适度：`contain: layout paint` 给固定尺寸项（.pcard/.card/.gcard），`will-change: transform` 只给会动的元素（手牌 hover、抽屉），不要滥用；`overscroll-behavior: contain` 给滚动容器；自定义细滚动条。
- 不给整屏或多个卡片加 backdrop-filter（只保留顶栏一处小面积）。
- 面板/抽屉出现用 transform+opacity 过渡（保持 .hidden{display:none!important} 语义不变，可直接给 #logPanel 加 transform 与 transition）。
- 手牌数量变化、血条变化不得引起周围元素跳动（用固定尺寸/绝对定位）。

## 硬约束
1. 禁止 @import、CDN、web font、外部图片；允许渐变与 `url("data:image/svg+xml;utf8,...")` 内联极简 SVG（不发网络请求）。
2. **不得重命名**任何现有 id / class。app.js 会动态加这些 class，你必须为它们提供样式：`.on`（chip/勾玉/开关激活）、`.active`（当前回合座位）、`.dead`（阵亡）、`.targetable`（可选目标）、`.picked`（已选中）、`.sel`（手牌选中）、`.shown`、`.hidden`、`.rdy`、`.show`、`.hl`、`.myrole`、`.auto-row`、`.eq-row`、`.mark-tag`、`.shield`、`.hpdot.on`、`.z-mou`/`.z-tianji`（谋/田记武将角标）、`body.log-open`。
3. 保留这些布局契约：`body.log-open #table{margin-right:…}`（桌面）、`.hidden{display:none!important}`、`.screen`、`.panel`、`#selfInfo.targetable/.picked`、`#askPanel`、`#overlay`、`#handRow`、`#selfEquips`、`#logPanel`、`#topbar`。
4. CSS ≤ 800 行（不含注释），每条规则都要有理由，不堆冗余。
5. 若必须增删 DOM 元素才做得到的改进（例如中央信息岛需要一个容器），可以给整份新 index.html，但新增元素必须**不破坏 app.js 的选择器契约**（不要动任何已有 id）。

## 输出格式（严格按标记，机器解析）
先输出 ≤25 行「改造摘要」（要点式，不要长篇分析）。
然后：

===FILE: client/style.css===
（完整 style.css 全文，可直接覆盖）

===FILE: client/index.html===
（有结构改动才给完整文件；否则只写一行 ===NOCHANGE===）

要求：不要输出 app.js 代码；不要输出 diff；不要用省略号代替代码；CSS 里不要出现注释掉的大段死代码。

=================== 当前 client/index.html ===================
"""

MID = "\n=================== 当前 client/style.css ===================\n"


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ui_prompt2.txt"
    txt = HEAD + read("client/index.html") + MID + read("client/style.css") + \
        "\n=================== 结束 ===================\n请开始：先 25 行以内的改造摘要，再输出 ===FILE: client/style.css=== 全文。\n"
    open(out, "w", encoding="utf-8").write(txt)
    print(f"wrote {out}: {len(txt)} chars")


if __name__ == "__main__":
    main()
