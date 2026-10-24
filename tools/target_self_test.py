"""验收：能否以自己为目标打出「桃 / 酒 / 无中生有 / 闪电」。
策略：我方先手，初始手牌里若没有自目标牌就直接重开局（不点结束出牌，避免跳进弃牌阶段）。
用法：PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers python3 tools/target_self_test.py
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

URL = os.environ.get("SG_URL", "http://120.48.43.211/sanguo/")
SELF_CARDS = ["无中生有", "酒", "桃", "闪电"]
MAX_GAMES = 10


async def read_state(page):
    return await page.evaluate("""() => {const S=window.__SG; if(!S) return {err:'noS'};
      const me=S.snap?.players?.[S.seat];
      return {askKind:S.ask?.kind, seat:S.seat, sel:S.sel.slice(), targets:S.targets.slice(),
              hand:(me?.hand||[]).map(c=>({id:c.id,name:c.name})),
              myTurn:S.snap?.currentIndex===S.seat,
              targetable: !!document.querySelector('#selfInfo.targetable'),
              picked: !!document.querySelector('#selfInfo.picked')};}""")


async def main():
    problems, ok = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--no-sandbox"])
        tested = False

        for gi in range(MAX_GAMES):
            page = await browser.new_page(viewport={"width": 1440, "height": 900})
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)[:160]))
            await page.goto(URL, wait_until="networkidle")
            await page.fill("#nickname", f"自目标{gi}")
            await page.fill("#seatCount", "2")
            await page.click("#btnCreate")
            await page.wait_for_selector("#table:not(.hidden)", timeout=20000)
            await page.wait_for_timeout(2200)

            st = await read_state(page)
            if st.get("askKind") != "play":
                await page.close()
                continue
            names = {c["id"]: c["name"] for c in st.get("hand", [])}
            # 手牌里的中文名要从 DOM 读
            card_els = await page.query_selector_all("#handRow .card")
            pick = None
            for el in card_els:
                txt = ((await el.inner_text()) or "").strip()
                for want in SELF_CARDS:
                    if want in txt:
                        pick = (el, want)
                        break
                if pick:
                    break
            if not pick:
                await page.close()
                continue

            card_el, name = pick
            tested = True
            await card_el.click()
            await page.wait_for_timeout(500)
            st2 = await read_state(page)
            if not st2["targetable"]:
                problems.append(f"选中【{name}】后自身信息条不可点（#selfInfo.targetable 缺失）")
            else:
                ok.append(f"选中【{name}】→ 自身条变为可点")
                await page.click("#selfInfo")
                await page.wait_for_timeout(400)
                st3 = await read_state(page)
                if st3["picked"]:
                    ok.append("点击自身条 → 进入已选状态")
                else:
                    problems.append("点击自身信息条后未进入已选状态")
                btn = await page.query_selector('#actionBar button:has-text("确定出牌")')
                if btn and await btn.is_visible():
                    await btn.click()
                    await page.wait_for_timeout(2000)
                    logtext = ""
                    lp = await page.query_selector("#logList")
                    if lp:
                        logtext = await lp.inner_text()
                    if name in logtext:
                        ok.append(f"战报出现使用【{name}】记录")
                    else:
                        problems.append(f"出牌后战报未见【{name}】")
                else:
                    problems.append("确定出牌按钮不可用")
            await page.screenshot(path=f"/sandbox/workspace/sanguo/output/target-self-{name}.png")
            if errs:
                problems.append(f"控制台错误: {errs[:2]}")
            await page.close()
            break

        await browser.close()

    if not tested:
        problems.append(f"{MAX_GAMES} 局内初始手牌都没有自目标牌，无法验证")
    print("\n".join("  ✓ " + x for x in ok))
    if problems:
        print("\n发现问题：")
        for p in problems:
            print("  ✗", p)
        sys.exit(1)
    print("\n自目标出牌链路通过")


asyncio.run(main())
