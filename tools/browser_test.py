"""真实浏览器端到端验证：创建房间 → 进入对局 → 出牌 → 截图。"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

URL = os.environ.get("SG_URL", "http://120.48.43.211/sanguo/")
SHOT = os.environ.get("SG_SHOT", "/sandbox/workspace/sanguo/output/shot.png")


async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 1600, "height": 900})
        page.on("console", lambda m: errors.append(f"[console.{m.type}] {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

        await page.goto(URL, wait_until="networkidle")
        print("title:", await page.title())
        print("lobby visible:", await page.is_visible("#lobby"))
        print("modes:", await page.locator("#modeList .chip").count())
        print("packs:", await page.locator("#packList .chip").count())
        print("generals:", await page.locator("#generalList .gcard").count())

        # 选 4 人身份场，填昵称，创建（勾选 AI 补足）
        await page.fill("#nickname", "浏览器测试")
        await page.fill("#seatCount", "4")

        await page.click("#btnCreate")
        await page.wait_for_selector("#table:not(.hidden)", timeout=15000)
        await page.wait_for_timeout(2500)

        print("table visible:", await page.is_visible("#table"))
        print("opponents:", await page.locator("#opponents .pcard").count())
        print("hand cards:", await page.locator("#handRow .card").count())
        print("logs:", await page.locator("#logList div").count())
        print("conn:", await page.text_content("#conn"))

        # 若轮到人类，验证手牌可点 + 结束出牌按钮
        bar = await page.text_content("#actionBar")
        print("actionBar:", (bar or "").strip()[:60])
        if bar and "结束出牌" in bar:
            await page.locator("#handRow .card").first.click()
            await page.wait_for_timeout(300)
            sel = await page.locator("#handRow .card.sel").count()
            print("card selected:", sel)
            await page.click("text=结束出牌")
            await page.wait_for_timeout(500)
            print("after endPhase, ask hidden:", await page.is_hidden("#askPanel"))

        os.makedirs(os.path.dirname(SHOT), exist_ok=True)
        await page.screenshot(path=SHOT, full_page=False)
        print("screenshot:", SHOT)

        # 移动端视口
        mobile = await browser.new_page(viewport={"width": 390, "height": 844})
        await mobile.goto(URL, wait_until="networkidle")
        mshot = SHOT.replace(".png", "-mobile.png")
        await mobile.screenshot(path=mshot)
        print("mobile screenshot:", mshot)
        sw = await mobile.evaluate("document.documentElement.scrollWidth")
        print("mobile scrollWidth:", sw, "(<=390 表示无横向滚动)")

        await browser.close()

    if errors:
        print("\n浏览器错误：")
        for e in errors[:12]:
            print(" ", e)
        sys.exit(1)
    print("\nOK 无控制台错误")


asyncio.run(main())
