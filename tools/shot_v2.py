#!/usr/bin/env python3
# 对线上 UI 截图（桌面 + 手机），用于人工查看 v2 视觉效果
#   PYTHONPATH=/sandbox/workspace/.pylibs PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright \
#     python3 tools/shot_v2.py [BASE] [OUTDIR]
import sys, os, glob
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://120.48.43.211/sanguo").rstrip("/")
OUT = sys.argv[2] if len(sys.argv) > 2 else "/sandbox/workspace/output/ui-shots"
os.makedirs(OUT, exist_ok=True)


def exe():
    for pat in ("/root/.cache/ms-playwright/chromium-*/chrome-linux/chrome",
                "/root/.cache/ms-playwright/chromium-*/chrome-linux64/chrome",
                "/tmp/pw-browsers/chromium-*/chrome-linux*/chrome"):
        hit = glob.glob(pat)
        if hit:
            return hit[0]
    return None


def enter_table(page):
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_selector("#btnCreate", timeout=20000)
    page.fill("#nickname", "验收")
    page.check("#autoOn") if page.locator("#autoOn").count() else None
    page.click("#btnCreate")
    page.wait_for_selector("#room:not(.hidden)", timeout=20000)
    page.wait_for_timeout(400)
    page.click("#btnStart")
    page.wait_for_selector("#table:not(.hidden)", timeout=25000)
    page.wait_for_timeout(2500)


def shoot(page, name):
    path = os.path.join(OUT, name)
    page.screenshot(path=path)
    print("shot", path)


def main():
    with sync_playwright() as p:
        kw = {"args": ["--no-sandbox"]}
        e = exe()
        if e:
            kw["executable_path"] = e
        browser = p.chromium.launch(**kw)

        d = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        enter_table(d)
        shoot(d, "desktop-1440.png")
        d.wait_for_timeout(14000)
        shoot(d, "desktop-1440-later.png")

        m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                is_mobile=True, has_touch=True,
                                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")
        mp = m.new_page()
        enter_table(mp)
        shoot(mp, "mobile-390.png")
        mp.wait_for_timeout(9000)
        shoot(mp, "mobile-390-later.png")
        browser.close()


if __name__ == "__main__":
    main()
