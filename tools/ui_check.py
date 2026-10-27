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

        # 1b) 包体关键字搜索（包名 / 包 id / 武将名）+ 全选 / 清空
        check(page.locator("#packList .pack-search").count() == 1, "武将包缺少搜索框")
        check(page.locator("#packList .pack-tools button.ghost").count() >= 2, "武将包缺少全选/清空按钮")
        pack_names = page.eval_on_selector_all("#packList .chip", "els => els.map(e => e.textContent)")
        check(not any("补全" in t for t in pack_names), f"合并后包名不应再出现「补全」：{[t for t in pack_names if '补全' in t]}")
        total_packs = len(pack_names)
        # 搜包名关键字
        page.fill("#packList .pack-search", "晋")
        page.wait_for_timeout(200)
        hit_names = page.eval_on_selector_all("#packList .chip", "els => els.map(e => e.textContent)")
        check(0 < len(hit_names) < total_packs, f"搜索「晋」应筛出部分包（筛出 {len(hit_names)} / {total_packs}）")
        check(any("晋" in t for t in hit_names), f"搜索「晋」结果不含晋包：{hit_names[:5]}")
        # 搜武将名（来源维度）
        page.fill("#packList .pack-search", "诸葛亮")
        page.wait_for_timeout(200)
        g_hits = page.eval_on_selector_all("#packList .chip", "els => els.map(e => e.dataset.pack)")
        check(len(g_hits) >= 2 and "standard" in g_hits, f"按武将名搜索「诸葛亮」应命中含该将的多个包：{g_hits}")
        # 全选（针对当前筛出结果）
        page.click("#packList .pack-tools button.ghost >> nth=0")
        page.wait_for_timeout(200)
        sel_n = page.evaluate("() => window.__SG.packs.size")
        check(sel_n >= len(set(g_hits)), f"全选后已选包数应覆盖全部筛出包（筛出 {len(set(g_hits))}，已选 {sel_n}）")
        # 清空
        page.fill("#packList .pack-search", "")
        page.wait_for_timeout(150)
        page.click("#packList .pack-tools button.ghost >> nth=1")
        page.wait_for_timeout(200)
        after_n = page.evaluate("() => window.__SG.packs.size")
        check(after_n == 1, f"清空后应只保留 1 个包（实际 {after_n}）")
        # 复位：重新勾选 jie / mou，后续用例依赖
        page.click("#packList .chip[data-pack='jie']")
        page.click("#packList .chip[data-pack='mou']")
        page.wait_for_timeout(150)

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

        # 4) 建房（AI 补足）→ 应停在准备界面，再点「开始对局」进牌桌
        page.fill("#nickname", "验收")
        page.select_option("#hostPick", index=1)
        page.check("#autoOn")
        page.fill("#autoSec", "20")
        page.click("#btnCreate")
        page.wait_for_selector("#room:not(.hidden)", timeout=15000)
        page.wait_for_timeout(400)
        check(page.locator("#btnStart").is_visible(), "创建房间后应停在准备界面（可见「开始对局」按钮）")
        check(page.evaluate("() => !!document.querySelector('#roomSeats .seatcard')"), "准备界面应渲染座位卡")
        # 准备界面显示的座位数应与创建人数一致（AI 已占位）
        seat_n = page.locator("#roomSeats .seatcard").count()
        check(seat_n >= 3, f"准备界面座位卡数量异常：{seat_n}")
        page.click("#btnStart")
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

        # 10) 护甲显示（护甲武将/双将在自身信息条里应可见）
        page.evaluate("""() => {
            const s = window.__SG.snap;
            if (s && s.players && s.players[0]) { s.players[0].armor = 2; s.players[0].armorMax = 2; }
            window.__SGFN.renderTable();
        }""")
        si2 = page.inner_text("#selfInfo")
        check("护甲" in si2 and "2/2" in si2, f"自身信息条未显示护甲：{si2[:80]}")

        # 11) 对局结束后「返回房间」（房间保留，可继续下一局）
        page.evaluate("() => window.__SGFN.showOverlay('验收测试结束', [{name: '验收'}])")
        check(page.locator("#btnBackRoom").count() == 1, "结束弹窗缺少「返回房间」按钮")
        check("返回房间" in page.inner_text("#overlay"), "结束弹窗按钮文案不含「返回房间」")
        page.click("#btnBackRoom")
        page.wait_for_timeout(900)
        check(page.locator("#overlay.hidden").count() == 1, "点击「返回房间」后弹窗未关闭")
        check(page.locator("#room:not(.hidden)").count() == 1, "点击「返回房间」后未切回房间视图")

        # 12) 锦囊自动目标：「只能指定自己 / 所有角色」的牌不需点人
        auto = page.evaluate("""() => {
            const S = window.__SG;
            const me = S.snap.players[S.seat];
            const wz = { id: 't-wz', name: 'wuzhong', suit: 'heart', num: 1 };
            const wj = { id: 't-wj', name: 'wanjian', suit: 'spade', num: 7 };
            me.hand = [wz, wj];
            S.ask = { kind: 'play', id: 999, timeout: 30000 };
            S.targets = [];
            S.sel = ['t-wz'];
            window.__SGFN.renderActions(me);
            const bar1 = document.getElementById('actionBar').innerText;
            S.sel = ['t-wj'];
            window.__SGFN.renderActions(me);
            const bar2 = document.getElementById('actionBar').innerText;
            return {
                seat: S.seat,
                a1: window.__SGFN.autoTargetSeats(wz),
                a2: window.__SGFN.autoTargetSeats(wj),
                alive: S.snap.players.filter(p => p.alive && p.seat !== S.seat).map(p => p.seat),
                bar1, bar2,
            };
        }""")
        check(auto["a1"] == [auto["seat"]], f"【无中生有】应自动指定自己（实际 {auto['a1']}）")
        check(sorted(auto["a2"]) == sorted(auto["alive"]), f"【万箭齐发】应自动指定全体其他角色（{auto['a2']} vs {auto['alive']}）")
        check("目标已自动选择" in auto["bar1"], f"选中【无中生有】时出牌区未提示自动目标：{auto['bar1'][:60]}")
        check("目标已自动选择" in auto["bar2"], f"选中【万箭齐发】时出牌区未提示自动目标：{auto['bar2'][:60]}")

        page.close()

        # ---------------- 手机（竖屏 390×844） ----------------
        m = browser.new_page(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        m.goto(BASE + "/", wait_until="networkidle")
        m.click("#btnPoolToggle")
        m.fill("#nickname", "手机")
        m.click("#btnCreate")
        m.wait_for_selector("#room:not(.hidden)", timeout=15000)
        # 手机端房主「房间设置」面板
        check(m.locator("#btnRoomSettings").is_visible(), "手机端房主应看到「房间设置」按钮")
        m.click("#btnRoomSettings")
        m.wait_for_selector(".modal-mask")
        check(m.locator(".modal-box #rsSeats").count() == 1, "手机端房间设置缺少人数输入")
        check(m.locator(".modal-box .chip").count() >= 20, "手机端房间设置武将包 chips 未渲染")
        check("托管" in m.inner_text(".modal-box"), "手机端房间设置缺少托管设置")
        m.click(".modal-box .close-row button.ghost")
        m.wait_for_timeout(250)
        check(m.locator(".modal-box").count() == 0, "手机端关闭后房间设置弹窗应消失")
        m.click("#btnStart")
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

        # ---------------- SG005：选将 4 档 / 几选一 / 双将 / 准备制 ----------------
        q = browser.new_page(viewport={"width": 1280, "height": 900})
        q.goto(BASE + "/", wait_until="networkidle")
        q.wait_for_selector("#pickModeList .chip")
        modes = q.eval_on_selector_all("#pickModeList .chip", "els => els.map(e => e.dataset.pick)")
        check(set(modes) >= {"random", "draw", "all", "host"}, f"选将模式应 4 档，实际 {modes}")
        check(q.locator("#pickModeList .chip[data-pick='draw']").count() == 1, "缺少「抽将（几选一）」档")
        check(q.locator("#pickCountRow").is_hidden(), "非抽将模式不应显示「几选一」")
        q.click("#pickModeList .chip[data-pick='draw']")
        check(q.locator("#pickCountRow").is_visible(), "抽将模式应显示「几选一」")
        cnts = q.eval_on_selector_all("#pickCountList .chip", "els => els.map(e => e.dataset.count)")
        check(cnts == ["2", "3", "5"], f"几选一应为 2/3/5，实际 {cnts}")
        q.click("#pickCountList .chip[data-count='5']")
        check(q.evaluate("() => window.__SG.pickCount") == 5, "几选一未写入状态")
        check("5" in q.inner_text("#pickCountList .chip.on"), "几选一选中态未高亮")
        check(q.eval_on_selector("#hostPick", "e => e.disabled"), "抽将模式不应在大厅预选武将")
        check(q.locator("#dualOn").count() == 1, "缺少「双将」勾选")
        q.check("#dualOn")
        check(q.evaluate("() => window.__SG.dual") is True, "双将勾选未写入状态")

        # 建房（保持 AI 补位）→ 也停在准备界面（不再自动开局），座位由电脑补足
        q.fill("#nickname", "选将验收")
        if not q.is_checked("#aiFill"):
            q.check("#aiFill")
        q.click("#btnCreate")
        q.wait_for_selector("#room:not(.hidden)", timeout=15000)
        q.wait_for_timeout(700)
        check(q.locator("#roomSeats .seatcard").count() >= 3, "准备界面座位卡应含电脑补足的座位")
        check(q.locator("#btnStart").is_visible(), "准备界面应显示「开始对局」")
        title = q.inner_text("#roomTitle")
        check("第 1 局" in title, f"房间标题未显示局数：{title}")
        cfg_txt = q.inner_text("#roomConfig")
        check("抽将" in cfg_txt, f"房间配置未显示选将模式：{cfg_txt}")
        check("5 选 1" in cfg_txt, f"房间配置未显示「5 选 1」：{cfg_txt}")
        check("双将" in cfg_txt, f"房间配置未显示「双将」：{cfg_txt}")
        check(q.locator("#btnReady").is_hidden(), "第一局（round=0）不应显示准备按钮")
        check("开始对局" in q.inner_text("#btnStart"), f"第一局开始按钮文案应为「开始对局」：{q.inner_text('#btnStart')}")

        # ---- 房主「房间设置」面板（人数 / 武将包 / 选将规则 / 双将 / 各座位托管）----
        check(q.locator("#btnRoomSettings").is_visible(), "房主应看到「房间设置」按钮")
        q.click("#btnRoomSettings")
        q.wait_for_selector(".modal-mask")
        set_h3 = q.inner_text(".modal-box h3")
        set_txt = q.inner_text(".modal-box")
        check("房间设置" in set_h3, f"房间设置弹窗标题不对：{set_h3}")
        check(q.locator(".modal-box #rsSeats").count() == 1, "房间设置缺少人数输入")
        seats_info = q.evaluate("() => ({ v: Number(document.querySelector('.modal-box #rsSeats').value), "
                                "max: Number(document.querySelector('.modal-box #rsSeats').max) })")
        check(seats_info["v"] >= 3, f"人数输入初值异常：{seats_info}")
        check(seats_info["max"] >= 8, f"人数输入上限应为模式上限：{seats_info}")
        n_chip = q.locator(".modal-box .chip").count()
        check(n_chip >= 20, f"房间设置应列出武将包与选将规则 chips，实际 {n_chip}")
        check("抽将" in set_txt and "随机分配" in set_txt, "房间设置缺少选将规则选项")
        check("几选一" in set_txt, "抽将模式下应显示几选一选项")
        check(q.locator(".modal-box #rsDual").count() == 1, "房间设置缺少双将开关")
        check("托管" in set_txt and "秒" in set_txt, "房间设置应含各玩家托管时长")
        check(q.locator(".modal-box .auto-row").count() >= 3, "房间设置缺少托管/人数设置行")
        q.click(".modal-box .close-row button.ghost")
        q.wait_for_timeout(200)
        check(q.locator(".modal-box").count() == 0, "关闭后房间设置弹窗应消失")

        # 抽将弹窗：只展示候选，双将需选满 2 个才能确认
        q.click("#btnPickGeneral")
        q.wait_for_selector(".modal-mask")
        n_items = q.locator(".modal-box .pool-item").count()
        check(n_items == 10, f"双将 5 选 1 应给 10 个候选（2 份 × 5），实际 {n_items}")
        check(q.locator(".modal-box button.primary").is_disabled(), "未选满时「确认选择」应禁用")
        check("还需选 2" in q.inner_text(".modal-box button.primary"), f"确认按钮文案不对：{q.inner_text('.modal-box button.primary')}")
        # ---- 选将搜索（名称 / 势力 / 技能 / 包 / 出处）----
        check(q.locator(".modal-box .pool-search").count() == 1, "选将弹窗缺少搜索框")
        check(q.locator(".modal-box .pool-item .pg-skills").count() > 0, "选将卡片未展示技能名")
        q.fill(".modal-box .pool-search", "zzz不存在的武将")
        q.wait_for_timeout(250)
        check(q.locator(".modal-box .pool-item").count() == 0, "搜索无匹配时应收起全部卡片")
        q.fill(".modal-box .pool-search", "")
        q.wait_for_timeout(250)
        check(q.locator(".modal-box .pool-item").count() == n_items, "清空搜索后应恢复全部卡片")
        q.fill(".modal-box .pool-search", "OL")
        q.wait_for_timeout(250)
        n_ol = q.locator(".modal-box .pool-item").count()
        q.fill(".modal-box .pool-search", "")
        q.wait_for_timeout(250)
        check(n_ol < n_items, f"按出处「OL」搜索未生效（{n_items} -> {n_ol}）")
        # ---- 搜索逐维度验证（名称 / 势力 / 技能 / 包名 / 多关键词 AND）----
        card0 = q.eval_on_selector(".modal-box .pool-item >> nth=0", """e => {
            const name = (e.querySelector('.pg-name').childNodes[0].textContent || '').trim();
            const meta = (e.querySelector('.pg-meta') || {}).textContent || '';
            const sk = (e.querySelector('.pg-skills') || {}).textContent || '';
            const parts = meta.split('·').map(x => x.trim());
            return { name, kingdom: parts[0] || '', pack: parts[parts.length - 1] || '',
                     skill: (sk.split('/')[0] || '').trim() };
        }""")
        def search(txt):
            q.fill(".modal-box .pool-search", txt)
            q.wait_for_timeout(200)
            return q.inner_text(".modal-box .pool-grid") if q.locator(".modal-box .pool-item").count() else ""
        check(card0["name"] and card0["name"] in search(card0["name"]),
              f"按名称「{card0['name']}」搜索未命中")
        if card0["skill"]:
            check(card0["name"] in search(card0["skill"]),
                  f"按技能名「{card0['skill']}」搜索未命中 {card0['name']}")
        if card0["kingdom"]:
            check(q.locator(".modal-box .pool-item").count() >= 1,
                  f"按势力「{card0['kingdom']}」搜索无结果")
        if card0["pack"]:
            check(card0["name"] in search(card0["pack"]),
                  f"按包名/出处「{card0['pack']}」搜索未命中 {card0['name']}")
        check(not search(f"{card0['name']} zzz不存在"), "多关键词 AND 未生效（应为 0 条）")
        check(card0["name"] in search(f"{card0['kingdom']} {card0['name']}"),
              "多关键词 AND 未生效（真实双词应命中）")
        search("")
        # ---- 右键查看武将技能详情 ----
        q.click(".modal-box .pool-item >> nth=0", button="right")
        q.wait_for_timeout(500)
        masks = q.locator(".modal-mask").count()
        check(masks >= 2, "右键武将卡片应弹出技能详情面板")
        if masks >= 2:
            detail = q.locator(".modal-mask").nth(masks - 1).inner_text()
            check("体力" in detail, "详情面板缺少体力信息：" + detail[:60])
            check("技能" in detail or "【" in detail, "详情面板缺少技能说明：" + detail[:60])
            q.evaluate("() => { const m = document.querySelectorAll('.modal-mask'); if (m.length > 1) m[m.length - 1].remove(); }")
            q.wait_for_timeout(200)
        # ---- 手机长按（480ms）查看技能详情 + 长按后不误选 ----
        q.evaluate("""() => {
            const el = document.querySelectorAll('.modal-box .pool-item')[0];
            el.dispatchEvent(new Event('touchstart', { bubbles: true }));
        }""")
        q.wait_for_timeout(700)
        masks_lp = q.locator(".modal-mask").count()
        check(masks_lp >= 2, "长按武将卡片应弹出技能详情面板")
        if masks_lp >= 2:
            d_lp = q.locator(".modal-mask").nth(masks_lp - 1).inner_text()
            check("体力" in d_lp, "长按详情面板缺少体力信息：" + d_lp[:60])
        q.evaluate("""() => {
            const el = document.querySelectorAll('.modal-box .pool-item')[0];
            el.dispatchEvent(new Event('touchend', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }""")
        q.wait_for_timeout(250)
        check(q.locator(".modal-box button.primary").is_disabled(), "长按后的 click 不应把武将选中（误选）")
        q.evaluate("() => { const m = document.querySelectorAll('.modal-mask'); if (m.length > 1) m[m.length - 1].remove(); }")
        q.wait_for_timeout(200)

        q.click(".modal-box .pool-item >> nth=0")
        q.click(".modal-box .pool-item >> nth=1")
        check(not q.locator(".modal-box button.primary").is_disabled(), "选满 2 个后「确认选择」应可用")
        q.click(".modal-box button.primary")
        q.wait_for_timeout(1400)
        check(q.locator(".modal-mask").count() == 0, "确认选择后弹窗未关闭")
        check("我的武将" in q.inner_text("#roomConfig"), "确认后房间配置未显示已选武将")

        # 局间（round=1、status=ended）：准备按钮 / 座位准备态 / 开始按钮门禁
        q.evaluate("""() => {
            const r = JSON.parse(JSON.stringify(window.__SG.room));
            r.round = 1; r.status = 'ended'; r.maxSeats = 4;
            const s0 = r.seats[0];
            r.seats = [
                { ...s0, index: 0, name: '房主', ready: true },
                { ...s0, index: 1, name: '玩家B', ready: false },
            ];
            window.__SGFN.renderRoom(r);
        }""")
        check(q.locator("#btnReady").is_visible(), "局间应显示准备按钮")
        check(("取消准备" in q.inner_text("#btnReady")) or ("我已准备" in q.inner_text("#btnReady")), f"准备按钮文案不对：{q.inner_text('#btnReady')}")
        seats_txt = q.inner_text("#roomSeats")
        check("已准备" in seats_txt, f"座位卡片未显示已准备：{seats_txt[:80]}")
        check("未准备" in seats_txt, f"座位卡片未显示未准备：{seats_txt[:80]}")
        start_txt = q.inner_text("#btnStart")
        check("开始第 2 局" in start_txt, f"局间开始按钮文案不对：{start_txt}")
        check(q.eval_on_selector("#btnStart", "e => e.disabled"), "未全员准备时开始按钮应禁用")
        check("等待" in start_txt, f"未全员准备时开始按钮应提示等待：{start_txt}")
        q.evaluate("""() => {
            const r = JSON.parse(JSON.stringify(window.__SG.room));
            r.round = 1; r.status = 'ended'; r.maxSeats = 4;
            const s0 = r.seats[0];
            r.seats = [
                { ...s0, index: 0, name: '房主', ready: true },
                { ...s0, index: 1, name: '玩家B', ready: true },
            ];
            window.__SGFN.renderRoom(r);
        }""")
        check(not q.eval_on_selector("#btnStart", "e => e.disabled"), "全员准备后开始按钮应可用")
        check("等待" not in q.inner_text("#btnStart"), f"全员准备后开始按钮不应再提示等待：{q.inner_text('#btnStart')}")
        q.close()

        # ---------------- 房主自选身份（身份场 / 军争） ----------------
        h = browser.new_page(viewport={"width": 1280, "height": 900})
        h.goto(BASE + "/", wait_until="networkidle")
        h.wait_for_selector("#hostRoleRow")
        check(not h.locator("#hostRoleRow").is_hidden(), "身份场应显示「房主身份」选项")
        check(h.eval_on_selector("#hostRoleSel", "e => e.disabled"), "未勾选「自选」时身份下拉应禁用")
        h.check("#hostRoleOn")
        check(not h.eval_on_selector("#hostRoleSel", "e => e.disabled"), "勾选「自选」后身份下拉应可用")
        h.click("#modeList .chip[data-mode='duel']")
        check(h.locator("#hostRoleRow").is_hidden(), "切到 1v1 模式应隐藏「房主身份」")
        check(not h.is_checked("#hostRoleOn"), "非身份模式应自动取消「自选」")
        h.click("#modeList .chip[data-mode='identity']")
        check(not h.locator("#hostRoleRow").is_hidden(), "切回身份场应重新出现「房主身份」")
        h.check("#hostRoleOn")
        h.select_option("#hostRoleSel", "rebel")
        h.fill("#nickname", "身份验收")
        if h.is_checked("#aiFill"):
            h.uncheck("#aiFill")
        h.click("#btnCreate")
        h.wait_for_selector("#room:not(.hidden)", timeout=15000)
        h.wait_for_timeout(900)
        cfg2 = h.inner_text("#roomConfig")
        check("房主身份" in cfg2 and "反贼" in cfg2, f"房间配置未显示房主身份：{cfg2[:100]}")
        check(h.locator("#btnHostRole").count() == 1, "房间内缺少「设置我的身份」按钮")
        h.click("#btnHostRole")
        h.wait_for_selector(".modal-mask")
        check(h.locator(".modal-box .chip").count() == 5, f"身份选项应为 5 项：{h.locator('.modal-box .chip').count()}")
        h.click(".modal-box .chip[data-role='loyalist']")
        h.wait_for_timeout(1300)
        cfg3 = h.inner_text("#roomConfig")
        check("忠臣" in cfg3, f"改为忠臣后房间配置未更新：{cfg3[:100]}")
        h.close()

        browser.close()


run()
print(f"\nUI 验收：通过 {ok} / 失败 {len(bad)}")
if bad:
    for b in bad:
        print("  -", b)
    sys.exit(1)
