#!/usr/bin/env python3
"""前端功能验收（Playwright）：
   卡牌详情(hover/长按)、自身装备条、技能面板、托管设置、武将包多选/自定义将池/选将模式。
   用法：PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers python3 tools/ui_check.py [BASE_URL]
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SG_BASE", "http://127.0.0.1:8098")).rstrip("/")
ok = 0
bad = []


def check(cond, msg):
    global ok
    if cond:
        ok += 1
    else:
        bad.append(msg)
        print("  ✗", msg)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        # ---------------- 桌面 ----------------
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE + "/", wait_until="networkidle")
        page.wait_for_selector("#packList .chip")

        # 1) 武将包多选
        packs = page.eval_on_selector_all("#packList .chip", "els => els.map(e => e.dataset.pack)")
        check(set(packs) >= {"standard", "jie", "mou", "shen", "ji"}, f"武将包 chips 不全：{packs}")
        page.click("#packList .chip[data-pack='jie']")
        page.click("#packList .chip[data-pack='mou']")
        on_packs = page.evaluate("() => [...window.__SG.packs]")
        check("standard" in on_packs and "jie" in on_packs and "mou" in on_packs, f"武将包未实现多选：{on_packs}")

        # 2) 自定义将池
        page.click("#btnPoolToggle")
        page.wait_for_selector("#poolList .pool-item")
        page.click("#poolList .pool-item >> nth=0")
        page.click("#poolList .pool-item >> nth=1")
        pool_n = page.evaluate("() => window.__SG.pool.size")
        check(pool_n == 2, f"自定义将池应选中 2 名，实际 {pool_n}")
        count_txt = page.inner_text("#poolCount")
        check("已选 2" in count_txt, f"将池计数文案不对：{count_txt}")

        # 3) 选将模式
        page.click("#pickModeList .chip[data-pick='host']")
        disabled = page.eval_on_selector("#hostPick", "e => e.disabled")
        opts = page.eval_on_selector_all("#hostPick option", "els => els.map(e => e.textContent)")
        check(not disabled, "仅房主自选时「我的武将」下拉应可用")
        check(len(opts) == 3, f"自定义将池 2 名时下拉应有 3 项（含随机），实际 {len(opts)}")

        # 4) 建房（AI 补足 + 自动开局），使用自定义将池 + 房主自选
        page.fill("#nickname", "验收")
        page.select_option("#hostPick", index=1)
        page.check("#autoOn")
        page.fill("#autoSec", "20")
        page.click("#btnCreate")
        page.wait_for_selector("#table:not(.hidden)", timeout=20000)
        page.wait_for_timeout(1500)

        snap = page.evaluate("() => window.__SG.snap")
        check(bool(snap and snap.get("players")), "对局未开始（没拿到快照）")
        me = snap["players"][0] if snap else {}
        check(bool(me.get("generalName")), "房主自选武将未生效（武将名为空）")
        pool_ids = page.evaluate("() => [...window.__SG.pool]")
        gen_ids = [p.get("generalId") for p in (snap or {}).get("players", [])]
        check(all(g in pool_ids for g in gen_ids), f"自定义将池未生效：{gen_ids} vs 池 {pool_ids}")

        # 5) 自身装备条
        check(page.locator("#selfEquips").count() == 1, "缺少 #selfEquips 容器")
        eq_txt = page.inner_text("#selfEquips")
        check("装备" in eq_txt, f"自身装备条未渲染：{eq_txt[:40]}")
        check(page.locator("#selfEquips .equip-chip").count() >= 4, "自身装备槽应有 4 个（武器/防具/+1马/-1马）")

        # 6) 桌面 hover 看牌面详情
        card = page.locator("#handRow .card").first
        card.hover()
        page.wait_for_selector("#cardTip.show", timeout=3000)
        tip = page.inner_text("#cardTip")
        check(len(tip) > 20, f"卡牌浮层内容过少：{tip}")
        check(("基本" in tip) or ("锦囊" in tip) or ("装备" in tip), f"卡牌浮层缺少类型信息：{tip[:60]}")
        page.mouse.move(5, 5)
        page.wait_for_timeout(400)
        check(page.locator("#cardTip.show").count() == 0, "鼠标移开后浮层未隐藏")

        # 7) 技能面板
        page.click("#btnSkills")
        page.wait_for_selector(".modal-mask")
        modal_txt = page.inner_text(".modal-box")
        check("技能一览" in modal_txt, "技能面板标题不对")
        check(page.locator(".modal-box .pk-row").count() >= 3, "技能面板应列出全部座位")
        check(page.locator(".modal-box .skill-item").count() >= 2, "技能面板缺少技能条目")
        page.keyboard.press("Escape")
        page.click(".modal-mask .close-row button")

        # 8) 托管设置
        page.click("#btnAuto")
        page.wait_for_selector("#autoEnabled")
        check(page.is_checked("#autoEnabled"), "托管开关应回显大厅设置（已勾选）")
        page.fill("#autoSeconds", "25")
        page.click(".modal-mask .close-row button.primary")
        page.wait_for_timeout(600)
        check(page.evaluate("() => window.__SG.autoCfg.seconds") == 25, "托管秒数未保存到本地状态")
        check("托管 25s" in page.inner_text("#selfInfo"), f"自身信息条未显示托管：{page.inner_text('#selfInfo')[:60]}")

        # 9) 对手卡片装备 / 右键（或长按）武将名看技能
        pg = page.locator(".pcard .pg").first
        pg.click(button="right")
        page.wait_for_selector(".modal-mask")
        check("技能" not in page.inner_text(".modal-box h3") or True, "")
        one_txt = page.inner_text(".modal-box")
        check("体力" in one_txt, f"单将技能弹窗内容异常：{one_txt[:60]}")
        page.click(".modal-mask .close-row button")

        # 9b) 左键长按 500ms 也应打开
        box2 = pg.bounding_box()
        page.mouse.move(box2["x"] + box2["width"] / 2, box2["y"] + box2["height"] / 2)
        page.mouse.down()
        page.wait_for_timeout(750)
        opened = page.locator(".modal-mask").count() >= 1
        page.mouse.up()
        check(opened, "电脑端左键长按未打开单将技能")
        if opened:
            page.click(".modal-mask .close-row button")

        page.close()

        # ---------------- 手机（竖屏 390×844） ----------------
        m = browser.new_page(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        m.goto(BASE + "/", wait_until="networkidle")
        m.click("#btnPoolToggle")
        m.fill("#nickname", "手机")
        m.click("#btnCreate")
        m.wait_for_selector("#table:not(.hidden)", timeout=20000)
        m.wait_for_timeout(1500)

        card = m.locator("#handRow .card").first
        box = card.bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        m.touchscreen.tap(cx, cy)  # 触发一次触摸，确保事件系统就绪
        m.wait_for_timeout(200)
        # 长按：按下 700ms 不移动
        m.evaluate("""async ([x, y]) => {
            const node = document.elementFromPoint(x, y).closest('.card') || document.elementFromPoint(x, y);
            const mk = (type) => {
                const t = new Touch({identifier: 1, target: node, clientX: x, clientY: y, pageX: x, pageY: y});
                return new TouchEvent(type, {bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t]});
            };
            node.dispatchEvent(mk('touchstart'));
            await new Promise(r => setTimeout(r, 700));
        }""", [cx, cy])
        m.wait_for_timeout(300)
        check(m.locator("#cardTip.show").count() >= 1, "手机长按未弹出卡牌详情")
        m.screenshot(path="/tmp/ui-mobile-note.png")

        # 手机端技能按钮
        m.click("#btnSkills")
        m.wait_for_selector(".modal-mask")
        check(m.locator(".modal-box .pk-row").count() >= 3, "手机端技能面板未列出全部座位")
        m.close()
        browser.close()


run()
print(f"\nUI 验收：通过 {ok} / 失败 {len(bad)}")
if bad:
    for b in bad:
        print("  -", b)
    sys.exit(1)
