"""验收：状态推送与出牌询问的顺序 —— 不能出现「先出牌、后摸牌」。

做法：在页面加载前劫持 EventSource，从第一条 SSE 事件开始采集
（记录每条 state 里自己的 handCount、turn 与 ask 的 kind）。
判据：若某个 ask(kind=play) 之后 400ms 内到达的 state 让自己的 handCount 变大，
      说明摸牌后的状态被 120ms 节流拖延、询问抢跑了 —— 玩家看到的就是「先出牌后摸牌」。

用法：PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers python3 tools/turn_order_test.py
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

URL = os.environ.get("SG_URL", "http://120.48.43.211/sanguo/")

INIT = r"""
(function () {
  const Orig = window.EventSource;
  window.__ev = [];
  function hook(es) {
    const origAdd = es.addEventListener.bind(es);
    es.addEventListener = function (type, fn, opts) {
      return origAdd(type, function (ev) {
        try {
          const d = JSON.parse(ev.data);
          const seat = window.__SG ? window.__SG.seat : null;
          const me = Array.isArray(d.players) ? d.players.find(p => p.seat === seat) : null;
          window.__ev.push({
            type, at: Date.now(), kind: d.kind || null,
            handCount: me ? me.handCount : null, turn: d.turn === undefined ? null : d.turn,
          });
        } catch (e) { window.__ev.push({ type, at: Date.now(), kind: null, handCount: null, turn: null }); }
        return fn.apply(this, arguments);
      }, opts);
    };
  }
  window.EventSource = function (url, cfg) {
    const es = new Orig(url, cfg);
    hook(es);
    window.__sgEs = es;
    return es;
  };
  window.EventSource.prototype = Orig.prototype;
  window.EventSource.CONNECTING = Orig.CONNECTING;
  window.EventSource.OPEN = Orig.OPEN;
  window.EventSource.CLOSED = Orig.CLOSED;
})();
"""


async def main():
    problems, notes = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:160]))
        await page.add_init_script(INIT)
        await page.goto(URL, wait_until="networkidle")
        await page.fill("#nickname", "顺序验收")
        await page.fill("#seatCount", "4")
        await page.click("#btnCreate")
        await page.wait_for_selector("#table:not(.hidden)", timeout=20000)

        # 等到自己的第一个出牌询问（不操作，采集完即退出）
        for _ in range(40):
            await page.wait_for_timeout(500)
            if await page.evaluate("() => window.__SG && window.__SG.ask && window.__SG.ask.kind === 'play'"):
                break
        await page.wait_for_timeout(800)
        ev = await page.evaluate("() => window.__ev || []")
        notes.append(f"采集 SSE 事件 {len(ev)} 条："
                     + ", ".join(f"{e['type']}{'('+e['kind']+')' if e['kind'] else ''}"
                                 for e in ev[:6]))

        plays = [i for i, e in enumerate(ev) if e["type"] == "ask" and e["kind"] == "play"]
        if not plays:
            problems.append("未采集到 ask(play)，无法判定（可能没轮到自己）")
        for i in plays:
            a = ev[i]
            prev = next((ev[j] for j in range(i - 1, -1, -1)
                         if ev[j]["type"] == "state" and ev[j]["handCount"] is not None), None)
            for j in range(i + 1, len(ev)):
                nxt = ev[j]
                if nxt["at"] - a["at"] > 400:
                    break
                if nxt["type"] == "state" and prev and nxt["handCount"] is not None \
                        and nxt["handCount"] > prev["handCount"]:
                    problems.append(
                        f"ask(play) 到达后 {nxt['at'] - a['at']}ms 才收到手牌增加的状态"
                        f"（{prev['handCount']} → {nxt['handCount']}），即先出牌后摸牌")
                    break
        if problems == [] and plays:
            hc = next((e["handCount"] for e in ev if e["type"] == "state" and e["handCount"]), None)
            notes.append(f"出牌询问 {len(plays)} 次，之前状态已含摸牌结果（手牌 {hc} 张）")
        if errs:
            problems.append(f"控制台错误: {errs[:2]}")
        await page.close()
        await browser.close()

    for n in notes:
        print("  ·", n)
    if problems:
        print("\n发现问题：")
        for p in problems:
            print("  ✗", p)
        sys.exit(1)
    print("\n推送时序正确：状态先到、询问后到")


asyncio.run(main())
