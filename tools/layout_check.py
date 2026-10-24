"""多端适配验收：四档视口分别检查布局与触控尺寸。
用法：PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers python3 tools/layout_check.py
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

URL = os.environ.get("SG_URL", "http://120.48.43.211/sanguo/")
OUT = os.environ.get("SG_OUT", "/sandbox/workspace/sanguo/output")

VIEWPORTS = [
    ("desktop", 1600, 900),
    ("tablet", 1024, 768),
    ("mobile", 390, 844),
    ("mobile-landscape", 844, 390),
]


async def main():
    os.makedirs(OUT, exist_ok=True)
    problems = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--no-sandbox"])
        for name, w, h in VIEWPORTS:
            page = await browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await page.goto(URL, wait_until="networkidle")
            await page.fill("#nickname", f"验{name}")
            await page.fill("#seatCount", "4")
            await page.click("#btnCreate")
            await page.wait_for_selector("#table:not(.hidden)", timeout=20000)
            await page.wait_for_timeout(2000)

            metrics = await page.evaluate("""() => {
              const de = document.documentElement;
              const vw = window.innerWidth, vh = window.innerHeight;
              const q = (s) => document.querySelector(s);
              const box = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right}; };
              const cards = [...document.querySelectorAll('#handRow .card')].map(e => { const r = e.getBoundingClientRect(); return {w:r.width,h:r.height}; });
              const btns = [...document.querySelectorAll('#actionBar button, #askPanel button, #btnCreate, #btnStart')].map(e => { const r = e.getBoundingClientRect(); return {t:(e.textContent||'').trim().slice(0,8), w:r.width, h:r.height}; });
              return {
                vw, vh,
                scrollW: de.scrollWidth, scrollH: de.scrollHeight,
                bodyOverflowX: de.scrollWidth - vw,
                hand: box('#handRow'), selfArea: box('#selfArea'), opponents: box('#opponents'),
                logPanel: box('#logPanel'), ask: box('#askPanel'),
                cards, btns,
                cardCount: cards.length,
                logVisible: !!(q('#logPanel') && getComputedStyle(q('#logPanel')).display !== 'none'),
              };
            }""")

            shot = os.path.join(OUT, f"layout-{name}.png")
            await page.screenshot(path=shot)
            await page.close()

            problems_here = []
            if metrics["bodyOverflowX"] > 1:
                problems_here.append(f"横向溢出 {metrics['bodyOverflowX']}px")
            if metrics["cardCount"] == 0:
                problems_here.append("未渲染手牌")
            for c in metrics["cards"]:
                # 分档口径：竖屏手机 60x84；手机横屏（高度≤480）48x64；其余按桌面 72x98
                if w <= 767:
                    min_w, min_h, label = 60, 84, "手机"
                elif h <= 480:
                    min_w, min_h, label = 48, 64, "横屏手机"
                else:
                    min_w, min_h, label = 72, 98, "桌面"
                if c["w"] < min_w or c["h"] < min_h:
                    problems_here.append(f"{label}卡牌过小 {c['w']:.0f}x{c['h']:.0f}（下限 {min_w}x{min_h}）")
                    break
            small = [b for b in metrics["btns"] if b["w"] > 0 and (b["w"] < 40 or b["h"] < 32)]
            if small and (w <= 767 or h <= 480):
                problems_here.append(f"触控目标过小: {small[:2]}")
            # 询问面板是否遮挡手牌
            if metrics["ask"] and metrics["hand"]:
                if metrics["ask"]["y"] < metrics["hand"]["bottom"] and metrics["ask"]["y"] + metrics["ask"]["h"] > metrics["hand"]["y"]:
                    problems_here.append("询问面板与手牌区重叠")
            if errs:
                problems_here.append(f"页面错误: {errs[0][:80]}")
            if w <= 767 and metrics["logVisible"]:
                problems_here.append("手机端战报栏未隐藏（占用横向空间）")

            status = "OK" if not problems_here else " / ".join(problems_here)
            print(f"{name:16s} {w}x{h}  手牌{metrics['cardCount']}张  scrollW={metrics['scrollW']}  -> {status}")
            problems.extend([f"{name}: {p}" for p in problems_here])
        await browser.close()

    print()
    if problems:
        print(f"发现 {len(problems)} 个适配问题：")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    print("四档视口全部通过")


asyncio.run(main())
