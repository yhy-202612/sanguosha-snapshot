#!/usr/bin/env python3
"""对当前前端截图（用于 UI 评审）：python3 tools/ui_shot.py <BASE> <outdir>"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8098").rstrip("/")
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/shots"
os.makedirs(OUT, exist_ok=True)


def snap(page, name):
    p = os.path.join(OUT, name + ".png")
    page.screenshot(path=p, full_page=False)
    print("shot", p)


with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--no-sandbox"])

    # ---------- 桌面 ----------
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto(BASE + "/", wait_until="networkidle")
    pg.wait_for_selector("#packList .chip")
    pg.wait_for_timeout(400)
    snap(pg, "01-lobby")
    pg.eval_on_selector("#generalList", "e => e.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(400)
    snap(pg, "02-generals")
    pg.evaluate("() => window.scrollTo(0,0)")
    # 建房 → 开局
    pg.fill("#nickname", "评审员")
    pg.click("#btnCreate")
    pg.wait_for_selector("#room:not(.hidden)", timeout=15000)
    pg.wait_for_timeout(600)
    snap(pg, "03-room")
    pg.click("#btnStart")
    pg.wait_for_selector("#table:not(.hidden)", timeout=20000)
    pg.wait_for_timeout(2500)
    snap(pg, "04-table")
    # 打开战报
    try:
        pg.click("#btnLog")
        pg.wait_for_timeout(900)
        snap(pg, "05-table-log")
    except Exception as e:
        print("log open failed", e)
    # 手牌悬停（卡牌详情浮层）
    try:
        cards = pg.query_selector_all("#handRow > *")
        if cards:
            cards[0].hover()
            pg.wait_for_timeout(700)
            snap(pg, "06-cardtip")
    except Exception as e:
        print("hover failed", e)
    pg.close()

    # ---------- 移动端 ----------
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    m.goto(BASE + "/", wait_until="networkidle")
    m.wait_for_selector("#packList .chip")
    m.wait_for_timeout(400)
    m.screenshot(path=os.path.join(OUT, "07-mobile-lobby.png"))
    print("shot", os.path.join(OUT, "07-mobile-lobby.png"))
    m.fill("#nickname", "手机")
    m.click("#btnCreate")
    m.wait_for_selector("#room:not(.hidden)", timeout=15000)
    m.click("#btnStart")
    m.wait_for_selector("#table:not(.hidden)", timeout=20000)
    m.wait_for_timeout(2500)
    m.screenshot(path=os.path.join(OUT, "08-mobile-table.png"))
    print("shot", os.path.join(OUT, "08-mobile-table.png"))
    b.close()
print("done")
