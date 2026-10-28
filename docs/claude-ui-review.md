## A. 问题清单

**P0 遮挡/误触/看不清**
- 中央牌堆卡背与结算牌位同占一处 → 牌位是 `position:absolute` 居中，卡背是 flex 子项，两者重叠，且卡背像可点击物 → 删除卡背，牌堆数改角落徽标（你们的判断合理。顶栏本来就有牌堆数，信息还重复）。
- 结算牌位只是 56×76 的文字框 → 看不出是哪张牌（花色/点数）→ 牌位内放一张真牌面（见 D5），停留拉长到 1100ms。
- 询问面板压在中央，结算牌位 z-index 54 反而盖住面板 → 询问出现时牌位上移（C）。
- 手机顶栏 5 个按钮加连接状态，实际高度 36px，低于 44px 点击标准，且 360 宽挤爆 → 对局中隐藏「玩法」，连接状态只留圆点。
- 对手横滑条 7 人时看不到全部座位，行动者可能在屏外 → 每次渲染把 `.active` 滚入可视区。
- 手机战报全屏盖住牌桌 → 改底部抽屉（55dvh），仍能看到手牌。
- 手牌 ≥6 张在手机上只能横滑，且牌小 → 重叠排布，每张保留 ≥50px 可点宽度。

**P1 信息可达性**
- 「谁在行动」只靠 2px 金环 → 加金色描边和名字后的 ▸。
- 「该我做什么」只在 selfInfo 长文本里 → 自己区加 `.my-turn` 顶部金线，有询问时加 `.need-act` 高亮主按钮；阶段胶囊补上阶段名。
- 剩余牌数 → 牌堆≤10 变琥珀色。
- 低血量对手难辨 → `.low` 红边框。
- selfInfo 手机上换行成 3 行，挤占手牌 → 手机单行横滑。

**P2 视觉打磨**
- 选中目标用内联 `outline`，与 `fx5-target-picked` 重复 → 改 class。
- 中央椭圆会裁掉角落徽标 → 改圆角矩形。
- 桌面手牌 80×112 偏小 → 大屏 92×128，牌名 22px。

## B. v2 布局规格

桌面/横屏（≥761px，或横屏且高≤480）：
```
┌ topbar ─────────────────────────────────┐
│ L列   │   T 上方座位    │   R列  │
│ 座位  │ ┌─中央出牌区──┐ │  座位  │
│ 纵列  │ │阶段胶囊     │ │  纵列  │
│       │ │  [结算牌位] │ │        │
│       │ │牌堆   弃牌堆│ │        │
│ ───── └─└─────────────┘ ───── │
│ 自己信息 / 装备条                 │
│ [手牌横排大字牌 ........] [操作区]│
└─────────────────────────────────────────┘
战报：右侧 280px 抽屉，≤1100px 时覆盖而非挤压
```
手机竖屏（≤760）：
```
topbar
[座位横滑条，每张 88-96px，行动者自动居中]
┌ 中央（弹性高度）┐
│ 阶段胶囊        │
│   [结算牌位]    │
│ 牌堆     弃牌堆 │
└─────────────────┘
自己信息/装备（单行横滑）
手牌（≥6 张重叠 -14px）
[操作按钮行，每个 ≥44px 高]
```
| 区域 | 定位/尺寸 | z-index |
|---|---|---|
| 侧列 L/R | grid，宽 `--side`=clamp(112,15vw,184)px，纵向溢出可滚 | 1 |
| 上方座位 T | grid 上行，座位宽 176px | 1 |
| 中央 | grid 中区，圆角矩形，徽标在左右下角 | 2 |
| 自己区 | grid 底行，右列为操作区 | 5 |
| 战报抽屉 | 桌面右侧 280px；手机竖屏底部 55dvh | 20 / 50 |
| 询问面板 | 现状 | 30 |
| 结算牌位 | 现状 | 54 |
| 弹窗/提示/toast | 现状 | 70/80/90 |

最小点击尺寸：按钮和座位 44×44，手牌可见宽 ≥50px，顶栏按钮 ≥40px。

## C. CSS 覆盖（接在 style.css 末尾）

```css
/* ===== UI v3 布局覆盖 ===== */
:root{--side:clamp(112px,15vw,184px);--card-w:68px;--card-h:96px;--hit:44px;--fx5-t-hold:1100ms}
#tableCenter::before{content:none!important;display:none!important}
#tableCenter{width:100%;margin:0;border-radius:var(--r4);gap:var(--s2);
  background:var(--grain),radial-gradient(ellipse at 50% 45%,rgba(64,44,22,.5),rgba(18,20,24,.35) 70%);
  box-shadow:inset 0 0 0 1px rgba(216,180,106,.16),inset 0 0 40px rgba(0,0,0,.45)}
#phaseInfo{position:absolute;top:8px;left:50%;translate:-50% 0;max-width:92%;padding:4px 14px;font-size:var(--fs-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#aiThinkHint{position:absolute;top:40px;left:50%;translate:-50% 0}
#deckInfo,#discardInfo{position:absolute;bottom:8px;display:flex;align-items:center;gap:6px;padding:2px 9px;border-radius:var(--r-pill);
  background:rgba(10,13,18,.72);border:1px solid var(--line);font-size:var(--fs-xs);color:var(--muted);pointer-events:none;font-variant-numeric:tabular-nums}
#deckInfo{left:10px}#discardInfo{right:10px}
#deckInfo::before{content:"";width:10px;height:14px;border-radius:2px;background:linear-gradient(160deg,#7c1d1a,#3f0e0c);border:1px solid var(--gold-3)}
#deckInfo.low{color:var(--warn);border-color:var(--warn)}
#deckInfo:empty{display:none}
.fx5-slot{min-width:0;min-height:0;padding:0;background:none;border:0}
.fx5-face{position:relative!important;width:var(--card-w);height:var(--card-h);cursor:default;pointer-events:none}
body:has(#askPanel:not(.hidden)) .fx5-slot{top:30%}
/* 状态可读性 */
.pcard.active{outline:2px solid var(--brand-gold);outline-offset:1px}
.pcard.active .pn span:first-child::after{content:" ▸";color:var(--gold-2)}
.pcard.low:not(.dead){border-color:var(--danger)}
#selfArea.my-turn{box-shadow:inset 0 2px 0 var(--brand-gold),0 -8px 24px rgba(216,180,106,.12)}
#selfArea.need-act .actions button.primary{box-shadow:var(--ring-gold)}
.actions button{min-height:var(--hit)}

/* 手机（含竖屏） */
@media (max-width:760px){
  #app:has(#table:not(.hidden)) #btnHelp{display:none}
  #conn{font-size:0;gap:0}
  .opponents{padding:6px 2px 4px;-webkit-mask-image:linear-gradient(90deg,#000 92%,transparent)}
  .opp-l,.opp-r,.opp-t{display:contents}
  .pcard{min-width:88px;max-width:96px;padding:5px 6px;gap:2px}
  .pcard .pk{display:none}.pcard .pn{font-size:var(--fs-sm)}.pcard .pg{font-size:var(--fs-xs)}
  #selfInfo,#selfEquips{flex-wrap:nowrap;overflow-x:auto;white-space:nowrap}
  .hand,#handRow{height:128px;scroll-snap-type:x proximity}
  .card{width:var(--card-w);height:var(--card-h)}
  .card .cn{font-size:17px}
  .hand.fx-overlap .card:not(:first-child){margin-left:-14px}
  .card.sel,.card.picked{z-index:3}
}
@media (max-width:760px) and (orientation:portrait){
  #logPanel{top:auto;height:55dvh;width:100%;transform:translateY(100%);border:0;border-top:1px solid var(--gold-3);border-radius:var(--r4) var(--r4) 0 0}
  #logPanel.show,body.log-open #logPanel{transform:none}
}

/* 桌面 / 横屏：网武式三栏 */
@media (min-width:761px),(orientation:landscape) and (max-height:480px){
  #table{display:grid;grid-template-columns:var(--side) minmax(0,1fr) var(--side);grid-template-rows:auto minmax(0,1fr) auto;
    grid-template-areas:"l t r" "l c r" "s s s";gap:var(--s2) var(--s3);padding:var(--s2) var(--s3) 0}
  #opponents{display:contents}
  .opp-l{grid-area:l}.opp-r{grid-area:r}.opp-t{grid-area:t;display:flex;gap:var(--s3);justify-content:center;min-width:0}
  .opp-l,.opp-r{display:flex;flex-direction:column;justify-content:safe center;gap:var(--s2);overflow-y:auto;min-height:0;padding:6px 4px}
  .opp-t:empty{display:none}
  #tableCenter{grid-area:c;min-height:0}
  .pcard{width:100%;min-width:0;max-width:none}
  .opp-t .pcard{width:176px}
  #selfArea{grid-area:s;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"i a" "e a" "h a";column-gap:var(--s3)}
  #selfInfo{grid-area:i}#selfEquips{grid-area:e}#handRow{grid-area:h}
  #actionBar{grid-area:a;flex-direction:column;justify-content:flex-end;align-self:end;min-width:112px;max-height:100%;overflow-y:auto;padding:0 0 var(--s3)}
  .actions button{width:100%}
}
@media (min-width:761px) and (max-width:1100px){body.log-open #table{margin-right:0}}
@media (min-width:761px) and (min-height:621px){
  :root{--card-w:92px;--card-h:128px}
  .hand{height:166px}.card{width:var(--card-w);height:var(--card-h)}.card .cn{font-size:22px}
}
@media (orientation:landscape) and (max-height:480px){:root{--side:112px;--card-w:58px;--card-h:81px}}
```

## D. 需要改的 JS

1. index.html：`#tableCenter` 内加 `<div id="deckInfo"></div>`。
2. renderTable 顶栏：`#topinfo` 去掉「牌堆 N」。写入 `#deckInfo` 为 `牌堆 N`（≤10 加 `low` 类），`#discardInfo` 改为 `弃牌 N`。
3. renderTable 对手分组：`#opponents` 保持不重建，只重建其子容器 `.opp-l/.opp-t/.opp-r`。
   - 按座位顺序取对手列表 `list`，n 为人数，`k = n<2 ? 0 : max(1, floor(n/3))`。
   - 前 k 个放右列（自下而上，即反序），中间放上方（自右向左），后 k 个放左列（自上而下）。
   - 每个 `playerCard` 同时设 `style.order = 序号`，手机上 `display:contents` 后按座位顺序横排。
   - 末尾设 `opp.scrollLeft`，让 `.active` 居中（只在 `opp.scrollWidth > opp.clientWidth` 时）。
4. playerCard：把 `c.style.outline=...` 改成 `c.classList.add('picked')`，并加 `c.classList.toggle('low', p.alive && p.hp <= 1)`。
5. fxSlotShow：保留现有 `el('div','fx5-slot fx5-slot-in')`。把文字换成牌面：`const face=el('div','card fx5-face'); face.innerHTML=ghost.innerHTML; slot.appendChild(face);`。`.card` 带 `contain:paint`，所以牌面必须放在子节点里，否则会裁掉牌位外圈光环。
6. renderTable（`me` 分支）：
   - `$('#selfArea').classList.toggle('my-turn', snap.currentIndex===me.seat)`
   - `$('#selfArea').classList.toggle('need-act', !!S.ask)`
7. `#phaseInfo` 文案加阶段：`当前回合：<b>X</b>（武将）· ${phaseCN(snap.phase)}`。

## E. 回归风险

- `#opponents{display:contents}` 后它本身没有 box。凡是对 `#opponents` 取 `getBoundingClientRect` 的特效（座位定位、`syncAskOffset`、伤害飘字锚点）都要改用 `[data-seat]` 节点。这条我没法从给出的代码里核实，需要全局搜一遍。
- 手机 `scrollLeft` 依赖 `#opponents` 容器常驻，不能再整体替换。
- 侧列设了 `overflow-y:auto`，会裁掉 `.pcard.targetable::after`（inset -4px）和悬停上移 4px。侧列已留 6px/4px 内边距，请实测。
- 横屏手机中央区高度很小，拖拽落点（`fx-drop-on`）命中区变小。建议 `fxBindDrag` 里把「拖出手牌区上边界」也算作有效出牌。
- `.fx-overlap/.fx-scroll` 在你贴出的 CSS 里没有规则，可能在别处。若别处已有同名规则，会与我的负 margin 冲突。
- `:has()` 需要 Safari 15.4+、Chrome 105+，不支持时只是失去询问时牌位上移，不影响功能。
- 结算牌位停留 700→1100ms 会拉长出牌节奏。回放/连续出牌时会排队，需要看 `fxLater` 是否会叠多个牌位。
- `prefers-reduced-motion`：新增代码没有新动画。第 3 条的滚动用 `behavior:'auto'` 即可。
- 以上 CSS 和 JS 我都没有实际运行验证，需要在 360/414px 竖屏、桌面和手机横屏三档各过一遍 2 人和 8 人局。