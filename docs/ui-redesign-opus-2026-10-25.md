## 改造摘要
- **设计 token**：在 `:root` 中定义完整变量。包括色阶（bg / surface / surface-2 / line / text / muted / brand-red / brand-gold / accent-blue / success / warn / danger）、4px 间距刻度、圆角、三档阴影、字号与行高、`--t-fast` / `--t-base` / `--t-slow`，以及 `--ease-out` / `--ease-spring` 两条缓动曲线。
- **颜色语义**：
  - 古金：当前回合、已选中
  - 青蓝：可选目标、可交互
  - 朱红：品牌主按钮、危险、伤害
  - 绿：在线、准备、回复
  - 灰化 / 斜线遮罩：不可用、阵亡
  - 红色不再表示"选中"或"在线"。
- **中央信息岛**：只用 CSS，不改 DOM。`#tableCenter` 做成金线描边的椭圆"牌桌"（径向渐变 + 低调斜纹）。`::before` 画出叠放的牌堆背面，`#phaseInfo` 做成回合徽标胶囊，`#discardInfo` 前面加一个小弃牌堆图标。
- **座位卡 `.pcard`**：
  - 改为纵向四层：名字行 / 武将 / 勾玉+护甲 / meta。
  - `.active`：金色外环，顶部金条呼吸（只动 opacity）。
  - `.targetable`：青色虚线环 + 悬停浮起。
  - `.picked`：金色填充环。
  - `.dead`：去饱和 + 半透明 + 斜线遮罩（伪元素）。
- **contain 例外**：身份角标 `.role` 在卡外（top:-7px），所以 `.pcard` 只用 `contain: layout`，避免 paint 裁剪掉角标。`.card` 和 `.gcard` 用 `contain: layout paint`。
- **手牌**：统一 80×112（5:7）。米白牌面加细金内边，牌名居中大字，点数花色在左上角同色，类型在右下角弱化。悬停浮起放大，`.sel` 抬起 + 金边 + 金色光晕，`.disabled` 灰化。手牌行固定高度，留出抬起空间，增减牌不会让周围跳动。
- **勾玉 `.hpdot`**：径向渐变 + 内阴影做出宝石感。空槽是暗凹槽，满槽是红宝石。护甲 `.shield` 用蓝色系胶囊。
- **战报**：13px、行高 1.7、等宽数字。`.hl` 作为回合头，带金色色标和分隔线。另外预置了 `.dmg` / `.heal` / `.sys` / `.skill` 四种可选色标，app.js 不加这些 class 也不影响现有显示。
- **战报抽屉**：始终保持 flex 布局，用 `transform: translateX` + opacity 开合，`visibility` 延迟收起。`.show` 和 `body.log-open` 都会打开抽屉。
- **面板入场**：`#askPanel` / `#overlay` / `.modal-mask` 用 keyframes 入场（只动 transform 和 opacity），`.hidden` 的语义不变。
- **大厅**：标签列统一 72px 右对齐基线，行距统一。chips 改为按钮组：选中态是金色填充 + 内发光，悬停上浮，数量标注被弱化（`.chip small`、`.chip i`）。
- **动效规范**：所有 transition 只涉及 transform / opacity / box-shadow / color / background-color，悬停不改边框宽度。`will-change` 只给手牌和抽屉。
- **计时条改动（需知悉）**：已去掉 `#askPanel .timer i` 的 width 过渡，以遵守"不动 width"的要求。计时条现在会按 JS 的更新节奏跳变；如果想要平滑效果，需要以后让 JS 改用 transform 驱动。
- **滚动**：滚动容器统一加细滚动条和 `overscroll-behavior: contain`。
- **≤760px**：触摸目标 ≥40px，手牌横向滚动并吸附，座位卡横向滚动，战报全屏抽屉。
- **短屏和横屏**：沿用原有压缩策略，数值按新的牌尺寸重新校准。
- **backdrop-filter**：只保留在顶栏一处。
- **index.html**：没有改动。

===FILE: client/style.css===
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0e1116;--bg-2:#0a0d12;--surface:#161b24;--surface-2:#1e2532;--surface-3:#262f3f;
  --line:#2a3344;--line-2:#3a4558;--hi:rgba(255,255,255,.07);
  --text:#e9edf4;--text-2:#c3cbd8;--muted:#8a96aa;--dim:#5d687a;
  --brand-red:#c8322f;--brand-red-2:#e04b3f;--brand-gold:#d8b46a;--gold-2:#f1d79a;--gold-3:#8a7140;
  --accent-blue:#4fa3e0;--accent-blue-2:#8fd0ff;--success:#43b277;--warn:#e0a94a;--danger:#e2453b;
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:20px;--s6:24px;--s8:32px;
  --r1:4px;--r2:6px;--r3:10px;--r4:14px;--r-pill:999px;
  --sh1:0 1px 2px rgba(0,0,0,.4),0 2px 6px rgba(0,0,0,.25);
  --sh2:0 4px 12px rgba(0,0,0,.45),0 1px 3px rgba(0,0,0,.4);
  --sh3:0 18px 48px rgba(0,0,0,.6),0 4px 12px rgba(0,0,0,.4);
  --fs-xs:11px;--fs-sm:12px;--fs-md:13px;--fs-base:14px;--fs-lg:16px;--fs-xl:19px;
  --lh-tight:1.2;--lh:1.5;--lh-loose:1.7;
  --t-fast:120ms;--t-base:200ms;--t-slow:320ms;
  --ease-out:cubic-bezier(.2,.8,.2,1);--ease-spring:cubic-bezier(.34,1.4,.5,1);
  --ring-gold:0 0 0 1px var(--brand-gold),0 0 18px rgba(216,180,106,.35);
  --ring-blue:0 0 0 1px var(--accent-blue),0 0 14px rgba(79,163,224,.35);
  --grain:repeating-linear-gradient(135deg,rgba(255,255,255,.012) 0 2px,transparent 2px 6px);
}
html,body{height:100%}
body{
  background:radial-gradient(1200px 620px at 50% -12%,#1c2433 0%,var(--bg) 60%),var(--bg);
  color:var(--text);font:var(--fs-base)/var(--lh) "PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  overflow:hidden;-webkit-font-smoothing:antialiased;
}
#app{display:flex;flex-direction:column;height:100vh;height:100dvh}
.hidden{display:none!important}
::selection{background:rgba(216,180,106,.35)}
*{scrollbar-width:thin;scrollbar-color:var(--line-2) transparent}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:3px}
::-webkit-scrollbar-track{background:transparent}
:focus-visible{outline:2px solid var(--accent-blue);outline-offset:2px}

/* ---------- 顶栏 ---------- */
#topbar{
  display:flex;align-items:center;gap:var(--s3);padding:var(--s2) var(--s4);flex:0 0 auto;
  background:linear-gradient(180deg,rgba(22,27,36,.92),rgba(14,17,22,.86));
  border-bottom:1px solid var(--line);box-shadow:inset 0 -1px 0 rgba(216,180,106,.12);
  backdrop-filter:blur(6px);position:relative;z-index:40;
}
.brand{font-weight:800;letter-spacing:3px;font-size:var(--fs-xl);color:var(--brand-gold);
  background:linear-gradient(180deg,var(--gold-2),var(--brand-gold) 55%,var(--gold-3));
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.brand span{font-weight:400;font-size:var(--fs-sm);margin-left:var(--s1);letter-spacing:1px;-webkit-text-fill-color:var(--muted)}
#topinfo{color:var(--muted);font-size:var(--fs-sm);font-variant-numeric:tabular-nums}
.spacer{flex:1}
.conn{font-size:var(--fs-sm);color:var(--muted);display:inline-flex;align-items:center;gap:6px}
.conn::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--dim);box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}
.conn.on{color:var(--success)}
.conn.on::before{background:var(--success);box-shadow:0 0 8px var(--success)}

/* ---------- 按钮 ---------- */
button{
  cursor:pointer;font:inherit;color:var(--text);border-radius:var(--r2);border:1px solid var(--line-2);
  padding:7px 14px;background:linear-gradient(180deg,var(--surface-3),var(--surface-2));
  box-shadow:inset 0 1px 0 var(--hi),var(--sh1);
  transition:transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast),background-color var(--t-fast),color var(--t-fast),filter var(--t-fast);
}
button:hover{box-shadow:inset 0 1px 0 var(--hi),0 0 0 1px rgba(216,180,106,.55),var(--sh2);transform:translateY(-1px)}
button:active{transform:translateY(0) scale(.98)}
button.primary{
  background:linear-gradient(180deg,#d7403a,#a82822 60%,#8e1f1b);border-color:#e45a4f;font-weight:700;letter-spacing:1px;
  box-shadow:inset 0 1px 0 rgba(255,220,200,.3),inset 0 -1px 0 rgba(0,0,0,.3),0 4px 14px rgba(200,50,47,.35);
}
button.primary:hover{filter:brightness(1.1);box-shadow:inset 0 1px 0 rgba(255,220,200,.35),0 0 0 1px var(--brand-gold),0 6px 18px rgba(200,50,47,.45)}
button.secondary{background:linear-gradient(180deg,#2a3c58,#1f2d44);border-color:#3b5a86}
button.secondary.on{background:linear-gradient(180deg,#25402c,#1b3022);border-color:#3f7a4f;color:#d3f0d9}
button.ghost{background:transparent;box-shadow:none;border-color:var(--line)}
button.ghost:hover{background:var(--surface-2);color:var(--text)}
button.mini{padding:3px 10px;font-size:var(--fs-sm);border-radius:var(--r1)}
button:disabled{opacity:.42;cursor:not-allowed;transform:none;filter:grayscale(.6);box-shadow:none}

/* ---------- 屏幕 / 面板 ---------- */
.screen{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:var(--s5);display:flex;flex-wrap:wrap;gap:var(--s4);align-content:flex-start;animation:fade-up var(--t-slow) var(--ease-out)}
.panel{
  position:relative;min-width:300px;flex:1 1 360px;padding:var(--s5) var(--s5) var(--s4);border-radius:var(--r4);
  background:var(--grain),linear-gradient(180deg,var(--surface),#121720);
  border:1px solid var(--line);box-shadow:inset 0 1px 0 var(--hi),var(--sh2);
}
.panel.wide{flex-basis:100%}
.panel h2{
  font-size:var(--fs-lg);color:var(--brand-gold);font-weight:700;letter-spacing:2px;margin-bottom:var(--s4);padding-bottom:var(--s2);
  border-bottom:1px solid transparent;border-image:linear-gradient(90deg,var(--brand-gold),rgba(216,180,106,.15) 60%,transparent) 1;
}
.row{display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3);flex-wrap:wrap;min-height:36px}
.row>label:first-child{flex:0 0 72px;width:72px;text-align:right;color:var(--muted);font-size:var(--fs-md);line-height:var(--lh-tight)}
.row>label.check{flex:1 1 220px}
.row.col{flex-direction:column;align-items:stretch;gap:var(--s2)}
.row.col>label{width:auto;flex:none;text-align:left;display:flex;align-items:center;gap:var(--s2);color:var(--muted);font-size:var(--fs-md)}
.check{display:flex;align-items:center;gap:var(--s2);color:var(--text-2);font-size:var(--fs-md);line-height:var(--lh);width:auto;cursor:pointer}
.check input[type=checkbox]{accent-color:var(--brand-gold);width:16px;height:16px;flex:0 0 auto}
input[type=text],input[type=number],.pick-select,.sec-input,.pool-search{
  flex:1;min-width:120px;background:var(--bg-2);color:var(--text);border:1px solid var(--line);border-radius:var(--r2);
  padding:8px 11px;font:inherit;font-size:var(--fs-md);outline:none;box-shadow:inset 0 1px 3px rgba(0,0,0,.45);
  transition:box-shadow var(--t-fast),border-color var(--t-fast);
}
input:focus,.pick-select:focus,.pool-search:focus{border-color:var(--brand-gold);box-shadow:inset 0 1px 3px rgba(0,0,0,.45),0 0 0 3px rgba(216,180,106,.18)}
.pick-select:disabled{opacity:.45}
.sec-input{width:74px;flex:0 0 auto;min-width:0;padding:5px 8px;text-align:center;font-variant-numeric:tabular-nums}
#btnCreate,#btnJoin{margin:var(--s2) 0 0 84px;min-width:140px;padding:9px 22px}
.hint{color:var(--muted);font-size:var(--fs-sm);margin-top:var(--s3);line-height:var(--lh-loose)}

/* chips：可扫读按钮组 */
.chips{display:flex;gap:var(--s2);flex-wrap:wrap;flex:1;min-width:0}
.chip{
  display:inline-flex;align-items:center;gap:4px;padding:6px 13px;border-radius:var(--r-pill);cursor:pointer;user-select:none;
  font-size:var(--fs-md);color:var(--text-2);background:var(--surface-2);border:1px solid var(--line);
  box-shadow:inset 0 1px 0 var(--hi);transition:transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast),color var(--t-fast),background-color var(--t-fast);
}
.chip small,.chip i{font-style:normal;font-size:var(--fs-xs);color:var(--dim);font-variant-numeric:tabular-nums}
.chip:hover{transform:translateY(-1px);color:var(--text);box-shadow:inset 0 1px 0 var(--hi),0 0 0 1px var(--line-2),var(--sh1)}
.chip.on{
  color:#fff3d6;background:linear-gradient(180deg,#4a3518,#33240f);border-color:var(--brand-gold);font-weight:600;
  box-shadow:inset 0 0 10px rgba(216,180,106,.28),inset 0 1px 0 rgba(255,230,180,.25),0 0 0 1px rgba(216,180,106,.35);
}
.chip.on small,.chip.on i{color:rgba(241,215,154,.7)}

/* 武将一览 */
.generals{display:grid;grid-template-columns:repeat(auto-fill,minmax(156px,1fr));gap:var(--s2);max-height:46vh;overflow:auto;overscroll-behavior:contain;padding:2px 4px 2px 0}
.gcard{
  contain:layout paint;padding:var(--s2) var(--s3);border-radius:var(--r3);font-size:var(--fs-sm);line-height:var(--lh);
  background:linear-gradient(180deg,var(--surface-2),var(--surface));border:1px solid var(--line);box-shadow:inset 0 1px 0 var(--hi);
  transition:transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast);
}
.gcard:hover{transform:translateY(-2px);box-shadow:inset 0 1px 0 var(--hi),0 0 0 1px rgba(216,180,106,.4),var(--sh2)}
.gcard b{display:block;font-size:var(--fs-base);margin-bottom:2px;color:var(--text)}
.gcard .k{color:var(--brand-gold)}
.gcard .s{color:var(--muted)}
.gcard .hp{color:var(--brand-red-2);font-variant-numeric:tabular-nums}

/* 第三方入口 */
.alt-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--s3)}
.alt-card{
  display:flex;flex-direction:column;gap:6px;padding:var(--s3) var(--s4);border-radius:var(--r3);text-decoration:none;color:inherit;
  background:var(--surface-2);border:1px solid var(--line);box-shadow:inset 3px 0 0 var(--brand-red),inset 0 1px 0 var(--hi);
  transition:transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast);
}
.alt-card b{font-size:var(--fs-base);color:var(--gold-2)}
.alt-card span{font-size:var(--fs-sm);line-height:1.6;color:var(--muted)}
.alt-card:hover{transform:translateY(-2px);box-shadow:inset 3px 0 0 var(--brand-gold),inset 0 1px 0 var(--hi),var(--sh2)}

/* 将池 / 武将包 */
.pool-box{border:1px solid var(--line);border-radius:var(--r3);padding:var(--s3);background:var(--bg-2);box-shadow:inset 0 1px 4px rgba(0,0,0,.5)}
.pool-tools,.pack-tools{display:flex;gap:var(--s2);align-items:center;flex-wrap:wrap;margin-bottom:var(--s2)}
.pool-count,.pack-count{font-size:var(--fs-sm);color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.pool-list{max-height:220px;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:var(--s3);padding-right:4px}
.pool-pack{font-size:var(--fs-sm);color:var(--brand-gold);letter-spacing:1px;margin-bottom:var(--s1)}
.pool-grid{display:flex;gap:6px;flex-wrap:wrap}
.pool-search{width:100%;margin:0 0 var(--s2)}
.pool-search::placeholder,input::placeholder{color:var(--dim)}
.pool-item{
  min-width:118px;max-width:168px;display:flex;flex-direction:column;gap:2px;line-height:1.3;user-select:none;-webkit-user-select:none;
  font-size:var(--fs-sm);padding:5px 9px;border-radius:var(--r2);border:1px solid var(--line);background:var(--surface);color:var(--muted);cursor:pointer;
  transition:transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast),background-color var(--t-fast);
}
.pool-item:hover{transform:translateY(-1px);box-shadow:0 0 0 1px var(--line-2),var(--sh1)}
.pool-item.on{background:linear-gradient(180deg,#3d2c14,#2a1f0e);border-color:var(--brand-gold);box-shadow:inset 0 0 8px rgba(216,180,106,.22)}
.pool-item.dis{opacity:.35;cursor:not-allowed;text-decoration:line-through;transform:none}
.pool-item .pg-name{font-size:var(--fs-md);color:var(--text);font-weight:600;display:flex;align-items:center;gap:4px}
.pool-item.on .pg-name{color:var(--gold-2)}
.pool-item .pg-taken{font-size:10px;font-weight:400;color:#ff9a92;border:1px solid #7a3530;border-radius:var(--r1);padding:0 3px}
.pool-item .pg-meta,.pool-item .pg-skills{font-size:var(--fs-xs);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pool-item .pg-skills{color:#8f9bb3}
.pack-picker{display:flex;flex-direction:column;gap:var(--s2);width:100%;min-width:0;flex:1}
.pack-tools .pack-search{flex:1 1 220px;width:auto;min-width:160px;margin:0}
.pack-tools button.ghost{font-size:var(--fs-sm);padding:6px 10px;color:var(--muted)}
.pack-chips{max-height:190px;overflow-y:auto;overscroll-behavior:contain;padding:2px 4px 2px 0}

/* ---------- 房间 ---------- */
.room-panel{max-width:880px;margin:0 auto}
.room-panel .row{margin-top:var(--s3)}
.seats{display:flex;gap:var(--s3);flex-wrap:wrap;margin-bottom:var(--s4)}
.seatcard{
  min-width:132px;padding:var(--s3) var(--s4);border-radius:var(--r3);
  background:linear-gradient(180deg,var(--surface-2),var(--surface));border:1px solid var(--line);box-shadow:inset 0 1px 0 var(--hi),var(--sh1);
  transition:box-shadow var(--t-base),opacity var(--t-base);
}
.seatcard .n{font-weight:700}
.seatcard .g{color:var(--muted);font-size:var(--fs-sm)}
.seatcard .rdy{font-size:var(--fs-sm);margin-top:var(--s1);color:var(--muted)}
.seatcard.ready{border-color:#3f7a4f;box-shadow:inset 0 0 0 1px rgba(67,178,119,.3),0 0 12px rgba(67,178,119,.15)}
.seatcard.ready .rdy{color:var(--success)}
.seatcard.off{opacity:.45}

/* ---------- 对局桌面 ---------- */
#table{position:relative;display:flex;flex-direction:column;flex-wrap:nowrap;gap:var(--s2);padding:var(--s3) var(--s4) var(--s2);min-height:0;overflow:hidden}
@media (min-width:761px){body.log-open #table{margin-right:280px}}
.opponents{display:flex;gap:var(--s3);flex-wrap:wrap;justify-content:center;flex:0 0 auto;padding-top:var(--s2)}

/* 座位卡 */
.pcard{
  contain:layout;position:relative;min-width:132px;max-width:190px;padding:var(--s2) var(--s3) var(--s2);border-radius:var(--r3);
  display:flex;flex-direction:column;gap:3px;
  background:var(--grain),linear-gradient(180deg,#212938,#151b26);border:1px solid var(--line-2);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 -2px 0 rgba(0,0,0,.35),var(--sh2);
  transition:transform var(--t-base) var(--ease-out),box-shadow var(--t-base),opacity var(--t-slow);
}
.pcard::before{
  content:"";position:absolute;left:10px;right:10px;top:-1px;height:2px;border-radius:2px;
  background:linear-gradient(90deg,transparent,var(--gold-2),transparent);opacity:0;transition:opacity var(--t-base);
}
.pcard .pn{font-weight:700;font-size:var(--fs-base);display:flex;justify-content:space-between;align-items:baseline;gap:6px;color:var(--text);line-height:var(--lh-tight);padding-right:var(--s2)}
.pcard .pk{font-size:var(--fs-xs);color:var(--brand-gold);font-weight:600;flex:0 0 auto}
.pcard .pg{font-size:var(--fs-sm);color:var(--text-2);cursor:help;transition:color var(--t-fast)}
.pcard .pg:hover{color:var(--gold-2);text-decoration:underline dotted}
.pcard .hpbar{display:flex;gap:3px;flex-wrap:wrap;min-height:11px;margin-top:2px}
.pcard .armorbar{display:flex;align-items:center;gap:3px;font-size:var(--fs-xs);font-weight:700;line-height:1;color:var(--accent-blue-2);font-variant-numeric:tabular-nums;min-height:14px}
.pcard .armorbar i{font-style:normal;opacity:.6;font-weight:500}
.pcard .meta{display:flex;gap:var(--s2);font-size:var(--fs-xs);color:var(--muted);font-variant-numeric:tabular-nums;padding-top:3px;border-top:1px solid rgba(255,255,255,.05)}
.pcard .zone{font-size:10px;color:var(--warn)}
.pcard .eq-row{display:flex;gap:4px;flex-wrap:wrap}
.pcard .eq-row .equip-chip{font-size:10.5px;padding:1px 6px}
.pcard .mark-row .mark-tag{font-size:10px}
.pcard .role{
  position:absolute;top:-8px;right:-6px;z-index:2;font-size:10px;font-weight:700;padding:1px 7px;border-radius:var(--r-pill);color:#fff;
  background:linear-gradient(180deg,#d4433d,#9a2420);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),var(--sh1);
}
.pcard .role.shown{background:linear-gradient(180deg,#9e2a30,#6e161c);box-shadow:0 0 0 1px rgba(255,255,255,.4),var(--sh1)}
.pcard.active{box-shadow:var(--ring-gold),inset 0 1px 0 rgba(255,235,190,.15),var(--sh2);transform:translateY(-2px)}
.pcard.active::before{opacity:1;animation:pulse 1.8s ease-in-out infinite}
.pcard.targetable{cursor:pointer;box-shadow:0 0 0 2px rgba(79,163,224,.0),var(--ring-blue),var(--sh2)}
.pcard.targetable::after{content:"";position:absolute;inset:-4px;border-radius:13px;border:1px dashed var(--accent-blue-2);opacity:.7;pointer-events:none;animation:pulse 1.4s ease-in-out infinite}
.pcard.targetable:hover{transform:translateY(-4px);box-shadow:0 0 0 1px var(--accent-blue-2),0 0 22px rgba(79,163,224,.5),var(--sh3)}
.pcard.picked{transform:translateY(-4px);background:var(--grain),linear-gradient(180deg,#3b2e17,#1d1810);box-shadow:0 0 0 2px var(--brand-gold),0 0 24px rgba(216,180,106,.45),var(--sh3)}
.pcard.picked::after{border-style:solid;border-color:var(--gold-2);animation:none;opacity:1}
.pcard.dead{opacity:.5;filter:grayscale(1) brightness(.8);transform:none;box-shadow:var(--sh1)}
.pcard.dead::after{
  content:"阵亡";position:absolute;inset:0;border-radius:inherit;display:flex;align-items:center;justify-content:center;pointer-events:none;
  font-weight:800;letter-spacing:6px;font-size:var(--fs-lg);color:rgba(255,255,255,.55);border:0;animation:none;opacity:1;
  background:repeating-linear-gradient(135deg,rgba(0,0,0,.45) 0 6px,rgba(0,0,0,.15) 6px 12px);
}

/* 勾玉 */
.hpdot{
  width:10px;height:10px;border-radius:50%;flex:0 0 auto;
  background:radial-gradient(circle at 50% 60%,#232a37,#151a22);box-shadow:inset 0 1px 2px rgba(0,0,0,.7),0 0 0 1px #2f3848;
  transition:background-color var(--t-base),box-shadow var(--t-base);
}
.hpdot.on{
  background:radial-gradient(circle at 34% 30%,#ffd2c8 0 14%,#ff5a48 32%,#b8231c 72%,#6d100c);
  box-shadow:inset 0 -1px 2px rgba(0,0,0,.45),0 0 0 1px #7a1a14,0 0 6px rgba(226,69,59,.45);
}
.shield{
  display:inline-flex;align-items:center;justify-content:center;min-width:14px;height:14px;padding:0 3px;font-size:10px;border-radius:3px 3px 7px 7px;color:#e6f5ff;
  background:linear-gradient(180deg,#5fb3ef,#2c6fae);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 0 0 1px #1f4f80;
}

/* 中央信息岛 */
#tableCenter{
  flex:1;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--s3);
  position:relative;margin:var(--s2) auto;width:min(620px,92%);border-radius:50%/40%;
  background:var(--grain),radial-gradient(ellipse at 50% 40%,rgba(64,44,22,.55),rgba(24,22,22,.4) 55%,transparent 72%);
  box-shadow:inset 0 0 0 1px rgba(216,180,106,.16),inset 0 0 60px rgba(0,0,0,.5);
}
#tableCenter::before{
  content:"";width:58px;height:80px;border-radius:7px;flex:0 0 auto;
  background:repeating-linear-gradient(45deg,rgba(216,180,106,.18) 0 2px,transparent 2px 7px),linear-gradient(160deg,#7c1d1a,#3f0e0c);
  border:1px solid var(--gold-3);
  box-shadow:inset 0 0 0 3px #2a0b09,inset 0 0 0 4px rgba(216,180,106,.5),3px 3px 0 -1px #3a0f0d,3px 3px 0 0 var(--gold-3),6px 6px 0 -1px #2a0b09,6px 6px 0 0 #5c4a2a,var(--sh2);
}
#phaseInfo{
  font-size:var(--fs-base);color:var(--text-2);padding:6px 18px;border-radius:var(--r-pill);text-align:center;
  background:linear-gradient(180deg,rgba(30,37,50,.95),rgba(18,22,30,.95));border:1px solid var(--gold-3);
  box-shadow:inset 0 1px 0 rgba(255,235,190,.12),0 0 20px rgba(216,180,106,.12),var(--sh1);
}
#phaseInfo:empty,#discardInfo:empty{display:none}
#phaseInfo b{color:var(--gold-2);font-weight:700;letter-spacing:1px}
#discardInfo{display:flex;align-items:center;gap:var(--s2);font-size:var(--fs-sm);color:var(--muted);font-variant-numeric:tabular-nums}
#discardInfo::before{content:"";width:12px;height:16px;border-radius:2px;background:linear-gradient(180deg,#e9e1cc,#bfb291);box-shadow:2px -2px 0 -1px #8a7c5a,var(--sh1);transform:rotate(-8deg)}

/* 自身区 */
#selfArea{
  flex:0 0 auto;position:relative;padding:var(--s2) var(--s3) 0;border-radius:var(--r4) var(--r4) 0 0;
  background:linear-gradient(180deg,rgba(26,32,44,.85),rgba(14,17,22,.95));
  box-shadow:inset 0 1px 0 rgba(216,180,106,.25),0 -8px 24px rgba(0,0,0,.35);
}
#selfInfo{
  display:flex;gap:var(--s3);align-items:center;flex-wrap:wrap;min-height:30px;font-size:var(--fs-md);color:var(--muted);
  padding:3px var(--s2);border-radius:var(--r2);margin-bottom:var(--s1);font-variant-numeric:tabular-nums;
  transition:box-shadow var(--t-base),background-color var(--t-base);
}
#selfInfo b{color:var(--text)}
#selfInfo .hpbar{display:inline-flex;gap:3px}
#selfInfo .myrole{background:linear-gradient(180deg,#d4433d,#9a2420);color:#fff;padding:1px 9px;border-radius:var(--r-pill);font-size:var(--fs-sm);font-weight:700;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)}
#selfInfo.targetable{cursor:pointer;background:rgba(79,163,224,.08);box-shadow:inset 0 0 0 1px var(--accent-blue)}
#selfInfo.targetable:hover{background:rgba(79,163,224,.16)}
#selfInfo.picked{background:rgba(216,180,106,.14);box-shadow:inset 0 0 0 1px var(--brand-gold),0 0 14px rgba(216,180,106,.35)}

.equip-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;min-height:26px;margin:2px 0}
.equip-label{font-size:var(--fs-xs);color:var(--muted);margin-right:2px}
.equip-chip{
  font-size:11.5px;padding:3px 9px;border-radius:var(--r1);cursor:pointer;white-space:nowrap;color:#eadcb4;
  background:linear-gradient(180deg,#352c19,#241e11);border:1px solid #6b5a33;box-shadow:inset 0 1px 0 rgba(255,230,170,.12);
  transition:box-shadow var(--t-fast),transform var(--t-fast) var(--ease-out);
}
.equip-chip:hover{transform:translateY(-1px);box-shadow:inset 0 1px 0 rgba(255,230,170,.12),0 0 0 1px var(--brand-gold)}
.equip-chip .slot{color:#a39066;margin-right:4px}
.equip-chip.empty{background:transparent;border-style:dashed;border-color:#3a4456;color:var(--dim);cursor:default;box-shadow:none;transform:none}
.judge-chip{border-color:#7a4a2a;background:linear-gradient(180deg,#3a2618,#28190f);color:#f0c9a0}

/* 手牌 */
.hand{
  display:flex;gap:var(--s2);overflow-x:auto;overflow-y:hidden;overscroll-behavior:contain;
  height:142px;padding:18px var(--s2) 10px;justify-content:safe center;align-items:flex-end;
}
.card{
  contain:layout paint;width:80px;height:112px;flex:0 0 auto;position:relative;border-radius:var(--r2);cursor:pointer;user-select:none;
  display:flex;flex-direction:column;align-items:center;justify-content:center;color:#231f18;
  background:radial-gradient(ellipse at 50% 45%,rgba(255,255,255,.55),transparent 70%),linear-gradient(180deg,#fbf7ec,#eae0c8);
  border:1px solid #a8956a;
  box-shadow:inset 0 0 0 3px #fbf7ec,inset 0 0 0 4px rgba(168,149,106,.45),0 2px 4px rgba(0,0,0,.45),0 6px 14px rgba(0,0,0,.35);
  will-change:transform;
  transition:transform var(--t-base) var(--ease-spring),box-shadow var(--t-base),opacity var(--t-base),filter var(--t-base);
}
.card:hover{transform:translateY(-8px) scale(1.04);box-shadow:inset 0 0 0 3px #fbf7ec,inset 0 0 0 4px rgba(168,149,106,.55),0 14px 26px rgba(0,0,0,.55);z-index:1}
.card .cn{font-size:19px;font-weight:800;letter-spacing:1px;text-align:center;line-height:var(--lh-tight);padding:0 6px;text-shadow:0 1px 0 rgba(255,255,255,.7)}
.card .cs{position:absolute;top:6px;left:7px;font-size:13px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.card .cs.red{color:#c0261d}
.card .cs.black{color:#1d2633}
.card .ct{position:absolute;bottom:6px;right:7px;font-size:10px;color:#8a7d60;letter-spacing:1px}
.card.equip{background:radial-gradient(ellipse at 50% 45%,rgba(255,255,255,.45),transparent 70%),linear-gradient(180deg,#f1ecdc,#ddd1b4)}
.card.trick{background:radial-gradient(ellipse at 50% 45%,rgba(255,255,255,.5),transparent 70%),linear-gradient(180deg,#f6f1e6,#e3dccb)}
.card.sel,.card.picked{
  transform:translateY(-16px);z-index:2;
  box-shadow:inset 0 0 0 3px #fbf7ec,inset 0 0 0 4px var(--brand-gold),0 0 0 2px var(--brand-gold),0 0 20px rgba(216,180,106,.55),0 16px 28px rgba(0,0,0,.6);
}
.card.disabled{opacity:.45;filter:grayscale(.85) brightness(.75);cursor:not-allowed}
.card.disabled:hover{transform:none;box-shadow:inset 0 0 0 3px #fbf7ec,0 2px 4px rgba(0,0,0,.45)}
.card.z-tianji,.card.z-mou{padding-top:14px}
.card.z-tianji{background:linear-gradient(180deg,#f2eafc,#dccdf2);border-color:#8b5cf6}
.card.z-mou{background:linear-gradient(180deg,#fdebf3,#f2d0e1);border-color:#db2777}
.card.z-tianji::before,.card.z-mou::before{position:absolute;top:0;left:0;right:0;font-size:10px;font-weight:700;text-align:center;letter-spacing:3px;color:#fff;padding:1px 0}
.card.z-tianji::before{content:"天机";background:linear-gradient(180deg,#8b5cf6,#6d28d9)}
.card.z-mou::before{content:"谋";background:linear-gradient(180deg,#e2468b,#be185d)}
.card.z-tianji .cs,.card.z-mou .cs{top:20px}
.card .ct.tz{color:#7c3aed;font-weight:700}
.card .ct.mou{color:#db2777;font-weight:700}

.actions{display:flex;gap:var(--s2);flex-wrap:wrap;align-items:center;justify-content:center;min-height:44px;padding:2px 0 var(--s2)}
.actions button{min-width:76px}

/* 标记 / 技能 */
.mark-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:3px}
.mark-tag{font-size:var(--fs-xs);padding:1px 8px;border-radius:var(--r-pill);background:#1a2a3e;border:1px solid #35507a;color:#a9c8f0}
.mark-tag.status{background:#2c2318;border-color:#6b5a33;color:#e8d9b0}
.mark-tag.z-tianji{background:#2b1f45;border-color:#8b5cf6;color:#ddd0fb}
.mark-tag.z-mou{background:#45202f;border-color:#db2777;color:#fbd0e5}

/* ---------- 战报抽屉 ---------- */
#logPanel{
  position:fixed;right:0;top:50px;bottom:0;width:280px;z-index:20;display:flex;flex-direction:column;
  background:var(--grain),linear-gradient(180deg,#121722,#0c0f15);border-left:1px solid var(--line);
  box-shadow:inset 1px 0 0 rgba(216,180,106,.12),-12px 0 32px rgba(0,0,0,.45);
  transform:translateX(100%);opacity:0;visibility:hidden;will-change:transform;
  transition:transform var(--t-slow) var(--ease-out),opacity var(--t-base),visibility 0s linear var(--t-slow);
}
#logPanel.show,body.log-open #logPanel{transform:none;opacity:1;visibility:visible;transition:transform var(--t-slow) var(--ease-out),opacity var(--t-base),visibility 0s}
.log-head{display:flex;align-items:center;justify-content:space-between;gap:var(--s2);padding:var(--s2) var(--s3);font-size:var(--fs-md);font-weight:700;letter-spacing:2px;color:var(--brand-gold);border-bottom:1px solid var(--line)}
.log-tools{display:flex;gap:6px}
.log-head button{padding:3px 10px;font-size:var(--fs-sm);font-weight:400;letter-spacing:0;color:var(--muted)}
#btnLogClose{display:none}
#logList{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:var(--s2) var(--s3) var(--s4);font-size:var(--fs-md);line-height:var(--lh-loose);color:var(--text-2);font-variant-numeric:tabular-nums}
#logList div{padding:1px 0 1px 10px;margin-bottom:2px;position:relative;border-radius:var(--r1)}
#logList div::before{content:"";position:absolute;left:0;top:.55em;width:3px;height:.8em;border-radius:2px;background:var(--line-2)}
#logList .hl{color:var(--gold-2);font-weight:700;margin-top:var(--s3);padding-top:var(--s2);border-top:1px solid rgba(216,180,106,.25)}
#logList .hl::before{background:var(--brand-gold);top:calc(.55em + 8px)}
#logList .dmg{color:#ff8a80}#logList .dmg::before{background:var(--danger)}
#logList .heal{color:#7fd8a4}#logList .heal::before{background:var(--success)}
#logList .skill{color:#e8c98a}#logList .skill::before{background:var(--warn)}
#logList .sys{color:var(--dim);font-size:var(--fs-sm)}#logList .sys::before{background:var(--dim)}

/* ---------- 询问面板 ---------- */
#askPanel{
  position:fixed;left:50%;bottom:calc(var(--self-h,128px) + 10px);transform:translateX(-50%);z-index:30;
  min-width:340px;max-width:92vw;max-height:calc(100vh - var(--self-h,128px) - 64px);overflow-y:auto;overscroll-behavior:contain;
  padding:var(--s4) var(--s5);border-radius:var(--r4);
  background:linear-gradient(180deg,#222b3b,#171d29);border:1px solid var(--gold-3);
  box-shadow:inset 0 1px 0 rgba(255,235,190,.15),0 0 0 1px rgba(216,180,106,.2),var(--sh3);
  animation:ask-in var(--t-base) var(--ease-out);
}
#askPanel .q{margin-bottom:var(--s3);font-size:var(--fs-base);line-height:var(--lh);color:var(--text)}
#askPanel .opts{display:flex;gap:var(--s2);flex-wrap:wrap}
#askPanel .timer{height:3px;margin-top:var(--s3);border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}
#askPanel .timer i{display:block;height:100%;background:linear-gradient(90deg,var(--warn),var(--danger))}

/* ---------- 结算 / 弹窗 / 提示 ---------- */
#overlay,.modal-mask{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(5,7,10,.86);animation:fade var(--t-base) ease-out}
#overlay{z-index:60}
.modal-mask{z-index:70}
#overlay .box,.modal-box{
  border-radius:var(--r4);overflow-y:auto;overscroll-behavior:contain;max-height:calc(100vh - 28px);
  background:var(--grain),linear-gradient(180deg,var(--surface-2),var(--surface));border:1px solid var(--gold-3);
  box-shadow:inset 0 1px 0 rgba(255,235,190,.15),var(--sh3);animation:pop var(--t-slow) var(--ease-spring);
}
#overlay .box{width:min(520px,100%);padding:var(--s6) var(--s8);text-align:center}
#overlay h2{color:var(--gold-2);font-size:22px;letter-spacing:4px;margin-bottom:var(--s3)}
#overlay p{color:var(--muted);margin-bottom:var(--s4)}
.modal-box{width:min(660px,100%);padding:var(--s4) var(--s5)}
.modal-box h3{color:var(--brand-gold);font-size:var(--fs-lg);margin-bottom:var(--s1)}
.modal-box .sub{color:var(--muted);font-size:var(--fs-sm);margin-bottom:var(--s3)}
.modal-box .close-row{display:flex;justify-content:flex-end;gap:var(--s2);margin-top:var(--s4)}
.pk-row{display:flex;gap:var(--s3);align-items:flex-start;padding:var(--s3) 0;border-top:1px solid var(--line)}
.pk-row:first-of-type{border-top:0}
.pk-row .who{min-width:96px}
.pk-row .who b{font-size:var(--fs-md)}
.pk-row .who .g{font-size:11.5px;color:var(--brand-gold)}
.pk-row .who .hp{font-size:var(--fs-xs);color:var(--brand-red-2)}
.pk-row.me .who b{color:var(--gold-2)}
.skill-list{flex:1;display:flex;flex-direction:column;gap:6px}
.skill-item{font-size:var(--fs-sm);line-height:1.6}
.skill-item .sn{color:#e8c98a;font-weight:700;margin-right:5px}
.skill-item .sd{color:var(--text-2)}
.auto-row{display:flex;gap:var(--s3);align-items:center;flex-wrap:wrap;margin:var(--s3) 0}
.auto-row label.check{width:auto}
#cardTip{
  position:fixed;z-index:80;max-width:min(300px,86vw);pointer-events:none;padding:10px 12px;border-radius:var(--r3);
  background:#121722;border:1px solid var(--gold-3);box-shadow:var(--sh3);
  opacity:0;transform:translateY(4px);transition:opacity var(--t-fast),transform var(--t-fast) var(--ease-out);
}
#cardTip.show{opacity:1;transform:none}
#cardTip .t{font-size:var(--fs-md);font-weight:700;color:var(--gold-2);margin-bottom:3px}
#cardTip .m{font-size:var(--fs-xs);color:var(--muted);margin-bottom:5px}
#cardTip .d{font-size:var(--fs-sm);line-height:1.6;color:#d5dde9}
.toast{
  position:fixed;left:50%;bottom:24px;z-index:90;max-width:88vw;padding:9px 18px;border-radius:var(--r3);font-size:var(--fs-md);
  background:#1c2331;border:1px solid var(--gold-3);color:var(--text);box-shadow:var(--sh3);
  opacity:0;pointer-events:none;transform:translate(-50%,12px);transition:opacity var(--t-base),transform var(--t-base) var(--ease-out);
}
.toast.show{opacity:1;transform:translate(-50%,0)}

/* ---------- 动画 ---------- */
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes fade-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes ask-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes ask-in-m{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}
}

/* ---------- 手机 ≤760 ---------- */
@media (max-width:760px){
  #topbar{padding:6px var(--s2);gap:6px}
  .brand{font-size:var(--fs-lg);letter-spacing:2px}
  .brand span{display:none}
  #topinfo{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:var(--fs-xs)}
  #conn{max-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  button,.chip{min-height:40px}
  #btnLog{padding:8px 10px}
  .screen{padding:var(--s3);gap:var(--s3)}
  .panel{min-width:0;flex-basis:100%;padding:var(--s4) var(--s3)}
  .row>label:first-child{flex-basis:100%;width:100%;text-align:left}
  .row>label.check{flex-basis:100%}
  #btnCreate,#btnJoin{margin-left:0;width:100%}
  .alt-list{grid-template-columns:1fr}
  .pack-chips{max-height:150px}
  .pack-tools .pack-search{flex-basis:100%}
  #table{padding:var(--s2) var(--s2) 0}
  .opponents{flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;overscroll-behavior:contain;scroll-snap-type:x proximity;gap:var(--s2);padding:10px 4px 6px}
  .pcard{min-width:112px;flex:0 0 auto;padding:6px var(--s2);scroll-snap-align:start}
  .pcard .role{top:-6px;right:-2px}
  #tableCenter{min-height:90px;width:100%;gap:var(--s2)}
  #tableCenter::before{width:40px;height:56px}
  #selfArea{padding:6px var(--s2) 0}
  .hand,#handRow{height:118px;justify-content:flex-start;scroll-snap-type:x mandatory;padding:14px 4px 8px;gap:6px}
  .card{width:64px;height:90px;scroll-snap-align:start}
  .card:hover{transform:none}
  .card.sel,.card.picked{transform:translateY(-10px)}
  .card .cn{font-size:15px}
  .card .cs{font-size:12px}
  #actionBar button{min-height:42px;padding:8px 12px}
  #askPanel{left:8px;right:8px;transform:none;min-width:0;max-width:none;max-height:calc(100vh - var(--self-h,172px) - 56px);padding:10px 12px;animation-name:ask-in-m}
  #askPanel .q{font-size:var(--fs-md);margin-bottom:var(--s2)}
  #askPanel .opts button{min-width:44px;min-height:42px}
  #logPanel{top:52px;width:100%;z-index:50;border-left:0;background:#0c0f15}
  .log-head{position:sticky;top:0;background:#0c0f15;min-height:48px}
  #btnLogClose{display:inline-block}
  #logList{font-size:var(--fs-base)}
}

/* ---------- 短屏（桌面窄高） ---------- */
@media (max-height:520px) and (min-width:761px){
  #table{padding-top:4px}
  .hand{height:128px;padding-top:14px;padding-bottom:6px}
  #selfInfo{margin-bottom:0;font-size:var(--fs-sm)}
  .actions{min-height:34px}
  .actions button{padding:5px 10px}
  #askPanel{padding:var(--s2) var(--s3)}
  #askPanel .q{margin-bottom:6px;font-size:var(--fs-md)}
  #tableCenter::before{width:40px;height:56px}
  #logPanel{width:220px}
  body.log-open #table{margin-right:220px}
}

/* ---------- 手机横屏 ≤480 高 ---------- */
@media (orientation:landscape) and (max-height:480px){
  #selfArea{padding-top:3px}
  #selfInfo{margin-bottom:0;font-size:var(--fs-xs);gap:var(--s2);min-height:24px}
  .hand,#handRow{height:100px;padding:10px 4px 4px;gap:5px}
  .card{width:58px;height:81px;border-radius:5px}
  .card .cn{font-size:14px;letter-spacing:0}
  .card .cs,.card .ct{font-size:10px}
  .card .cs{top:4px;left:5px}
  .card .ct{bottom:4px;right:5px}
  .card.sel,.card.picked{transform:translateY(-8px)}
  .actions{min-height:32px;padding-bottom:2px;gap:6px}
  .actions button{padding:5px 10px;font-size:var(--fs-sm);min-height:34px}
  #tableCenter{min-height:60px}
  #tableCenter::before{display:none}
  #askPanel{bottom:calc(var(--self-h,140px) + 6px);max-height:calc(100vh - var(--self-h,140px) - 54px);padding:var(--s2) 10px}
  #askPanel .q{margin-bottom:5px;font-size:var(--fs-sm);line-height:1.4}
  #askPanel .opts{gap:6px}
  #askPanel .opts button{padding:5px 9px;font-size:var(--fs-sm);min-height:34px}
  body.log-open #table{margin-right:0}
  #logPanel{width:220px;background:#0c0f15f2}
}

===FILE: client/index.html===
===NOCHANGE===