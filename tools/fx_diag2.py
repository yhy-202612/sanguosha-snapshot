#!/usr/bin/env python3
"""诊断：等待我方操作时机，期间打印状态。python3 tools/fx_diag.py [BASE] [秒]"""
import sys, time
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8098").rstrip("/")
SECS = int(sys.argv[2]) if len(sys.argv) > 2 else 12

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console:" + m.text) if m.type == "error" else None)
    pg.goto(BASE + "/", wait_until="networkidle")
    pg.wait_for_selector("#packList .chip")
    pg.fill("#nickname", "诊断")
    pg.click("#btnCreate")
    pg.wait_for_selector("#room:not(.hidden)", timeout=15000)
    pg.click("#btnStart")
    pg.wait_for_selector("#table:not(.hidden)", timeout=20000)
    t0 = time.time()
    while time.time() - t0 < SECS:
        st = pg.evaluate("""() => {
          const ab = document.querySelector('#actionBar');
          const ask = document.querySelector('#askPanel');
          const tc = document.querySelector('#tableCenter');
          return {
            ab: ab ? ab.innerHTML.replace(/\\s+/g,' ').slice(0,120) : 'NO#actionBar',
            abBtns: ab ? ab.querySelectorAll('button').length : -1,
            askHidden: ask ? ask.classList.contains('hidden') : null,
            askText: ask ? ask.textContent.replace(/\\s+/g,' ').slice(0,80) : '',
            center: tc ? tc.textContent.replace(/\\s+/g,' ').slice(0,90) : '',
            hand: document.querySelectorAll('#handRow .card').length,
            sel: (window.S && window.S.sel) ? window.S.sel.length : null,
          };
        }""")
        dbg = pg.evaluate("""() => {
          const S = window.__SG;
          const me = S && S.snap ? S.snap.players[S.seat] : null;
          return { seat: S && S.seat, hasSnap: !!S.snap, meKeys: me ? Object.keys(me) : null,
                   handLen: me && me.hand ? me.hand.length : null,
                   hand0: me && me.hand && me.hand[0] ? {id: me.hand[0].id, name: me.hand[0].name, t: typeof me.hand[0].id} : null,
                   cardCid: (document.querySelector('#handRow .card')||{}).dataset }; }""")
        print("DBG", dbg, flush=True)
        print(f"[{int(time.time()-t0):3d}s]", st, flush=True)
        if st["abBtns"] > 0:
            print("=> 出现操作按钮", flush=True)
            break
        pg.wait_for_timeout(5000)
    print("errors:", errs[:5])
    b.close()
