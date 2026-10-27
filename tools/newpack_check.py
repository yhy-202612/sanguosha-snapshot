#!/usr/bin/env python3
"""新武将包前端验收（Playwright）：
   SP·绝世 / 稀世珍宝 / 稀有·传说 三个包能在大厅被识别、可勾选建房、进房后能选到新将。
   用法：PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers python3 tools/newpack_check.py [BASE_URL]
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SG_BASE", "http://127.0.0.1:8098")).rstrip("/")
NEW = ["sp5", "xe", "rare"]
NAME = {"sp5": "SP·绝世", "xe": "稀世珍宝", "rare": "稀有·传说"}
ok = 0
bad = []


def check(cond, msg):
    global ok
    if cond:
        ok += 1
        print("  ✓", msg)
    else:
        bad.append(msg)
        print("  ✗", msg)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 860})
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        page.goto(BASE + "/", wait_until="networkidle")
        page.wait_for_selector("#packList .chip")

        chips = page.eval_on_selector_all("#packList .chip", "els => els.map(e => [e.dataset.pack, e.textContent])")
        got = {c[0]: c[1] for c in chips}
        check(len(chips) == 41, f"武将包数应为 41（实测 {len(chips)}）")
        for k in NEW:
            check(k in got, f"缺少新包 chip：{k}")
            check(NAME[k] in (got.get(k) or ""), f"新包 {k} 中文名应为「{NAME[k]}」（实测 {got.get(k)}）")

        # 只勾选三个新包 → 建房
        page.click("#packList .pack-tools button.ghost >> nth=1")     # 清空
        page.wait_for_timeout(150)
        for k in NEW:                                                 # 先加三包（清空会兜底 standard）
            page.click(f"#packList .chip[data-pack='{k}']")
        page.wait_for_timeout(120)
        page.click("#packList .chip[data-pack='standard']")           # 再取消 standard
        page.wait_for_timeout(150)
        on = page.evaluate("() => [...window.__SG.packs]")
        check(set(on) == set(NEW), f"勾选结果应为三个新包（实测 {on}）")

        page.click("#pickModeList .chip[data-pick='host']")           # 房主自选，才能取到将池
        page.wait_for_timeout(100)
        page.fill("#nickname", "新包验收")
        if not page.is_checked("#aiFill"):
            page.check("#aiFill")
        page.click("#btnCreate")
        page.wait_for_selector("#room:not(.hidden)", timeout=15000)
        page.wait_for_timeout(600)
        cfg = page.inner_text("#roomConfig")
        check(all(NAME[k] in cfg for k in NEW), f"房间配置应显示三个新包名（{cfg[:90]}）")

        # 服务端将池：/api/rooms/:id/pick-info 的 pool 必须只含三个新包的 22 名武将
        info = page.evaluate("""async () => {
            const base = location.pathname.replace(/\/+$/, '');   // 线上站点前缀（如 /sanguo）
            const r = await fetch(base + `/api/rooms/${window.__SG.roomId}/pick-info`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: window.__SG.token })
            });
            return r.ok ? await r.json() : { error: r.status };
        }""")
        pool = (info or {}).get("pool") or []
        packs_in_pool = sorted({g.get("pack") for g in pool if isinstance(g, dict)})
        check(len(pool) == 22, f"将池应为 22 名（实测 {len(pool)}）")
        check(packs_in_pool == sorted(NEW), f"将池应只含三个新包（实测 {packs_in_pool}）")
        names = {g.get("name") for g in pool if isinstance(g, dict)}
        check({"SP貂蝉", "张让", "蹋顿"} <= names, f"将池缺少新将：{sorted(names)[:6]}")

        no_err = [e for e in errs if "favicon" not in e]
        check(no_err == [], f"无控制台错误（{no_err[:2]}）")
        browser.close()

    print(f"\n新包前端验收：通过 {ok} / 失败 {len(bad)}")
    if bad:
        print("失败项：")
        for b in bad:
            print("  ✗", b)
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(run())
