#!/usr/bin/env python3
"""拖拽出牌冒烟（Playwright）：python3 tools/drag_check.py [BASE]"""
import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8098").rstrip("/")
ok, bad = 0, []


def check(c, m):
    global ok
    if c:
        ok += 1
        print("  ✓", m)
    else:
        bad.append(m)
        print("  ✗", m)


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    dialogs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console:" + m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    pg.goto(BASE + "/", wait_until="networkidle")
    pg.wait_for_selector("#packList .chip")
    pg.fill("#nickname", "拖拽员")
    pg.click("#btnCreate")
    pg.wait_for_selector("#room:not(.hidden)", timeout=15000)
    pg.click("#btnStart")
    pg.wait_for_selector("#table:not(.hidden)", timeout=20000)

    mine = False
    for _ in range(90):
        if pg.evaluate("() => !!document.querySelector('#actionBar button')"):
            mine = True
            break
        pg.evaluate("""() => { const a = document.querySelector('#askPanel');
          if (a && !a.classList.contains('hidden')) { const b = a.querySelector('button'); if (b) b.click(); } }""")
        pg.wait_for_timeout(1000)
    check(mine, "等到自己的操作时机")
    if not mine:
        print("跳过拖拽用例")
    else:
        box = pg.evaluate("""() => {
          const cs = [...document.querySelectorAll('#handRow .card')];
          const c = cs.find(x => !x.classList.contains('disabled')) || cs[0];
          if (!c) return null;
          const r = c.getBoundingClientRect();
          return { x: r.left + r.width/2, y: r.top + r.height/2, cid: c.dataset.cid, hand: cs.length };
        }""")
        check(bool(box), f"取到可拖拽手牌 {box}")
        if box:
            # 小幅移动（<8px）应不进入拖拽
            pg.mouse.move(box["x"], box["y"])
            pg.mouse.down()
            pg.mouse.move(box["x"] + 4, box["y"] - 3, steps=3)
            small = pg.evaluate("() => document.querySelectorAll('#handRow .card.fx-drag').length")
            pg.mouse.up()
            check(small == 0, f"移动 <8px 不进入拖拽（fx-drag={small}）")
            pg.wait_for_timeout(200)

            # 正式拖拽到中央
            pg.mouse.move(box["x"], box["y"])
            pg.mouse.down()
            pg.mouse.move(box["x"], box["y"] - 40, steps=6)
            pg.wait_for_timeout(120)
            dragging = pg.evaluate("() => document.querySelectorAll('#handRow .card.fx-drag').length")
            drop_ready = pg.evaluate("() => !!document.querySelector('#tableCenter.fx-drop-ready')")
            pg.mouse.move(720, 380, steps=10)
            pg.wait_for_timeout(150)
            drop_on = pg.evaluate("() => !!document.querySelector('#tableCenter.fx-drop-on')")
            pg.mouse.up()
            pg.wait_for_timeout(700)
            check(dragging >= 1, f"拖动时卡片带 fx-drag（{dragging}）")
            check(drop_ready, "拖动时中央出现落点提示容器")
            check(drop_on, "指针进入落点区时高亮（fx-drop-on）")
            cid = box["cid"]
            after = pg.evaluate("""(cid) => {
              const n = document.querySelector('#handRow .card[data-cid="'+cid+'"]');
              return {
                sel: n ? n.classList.contains('sel') : false,
                gone: !n,
                drag: document.querySelectorAll('.card.fx-drag').length,
                hand: document.querySelectorAll('#handRow .card').length,
                toast: (document.querySelector('.toast')||{}).textContent || ''
              };
            }""", cid)
            check(after["drag"] == 0, f"松手后拖拽状态复位（fx-drag={after['drag']}）")
            check(not any("请先选择一张牌" in d for d in dialogs), f"落点后未被误判为未选牌（alert={dialogs}）")
            check(after["sel"] or after["gone"], f"落点后该牌被选中或已出 {after}")
            # 若卡片仍处于选中且需要目标，补充选目标并出牌
            pg.evaluate("""() => {
              for (const t of document.querySelectorAll('#opponents .pcard.targetable, #selfInfo.targetable')) t.click();
            }""")
            pg.wait_for_timeout(300)
            pg.evaluate("""() => { const b = [...document.querySelectorAll('#actionBar button')].find(x=>/确定出牌/.test(x.textContent)); if (b) b.click(); }""")
            pg.wait_for_timeout(900)
            fin = pg.evaluate("""(cid) => {
              const n = document.querySelector('#handRow .card[data-cid="'+cid+'"]');
              return {
                hand: document.querySelectorAll('#handRow .card').length,
                gone: !n,
                onTable: !!document.querySelector('#tableCenter [data-cid="'+cid+'"]')
              };
            }""", cid)
            check(fin["gone"] or fin["onTable"] or fin["hand"] < after["hand"],
                  f"拖拽后可完成出牌（手牌 {after['hand']} → {fin['hand']}，gone={fin['gone']} onTable={fin['onTable']}）")

    check(not errs, f"无控制台错误（{errs[:2]}）")
    b.close()

print(f"\n拖拽冒烟：通过 {ok} / 失败 {len(bad)}")
if bad:
    for x in bad:
        print("  ✗", x)
    sys.exit(1)
