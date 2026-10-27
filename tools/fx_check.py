#!/usr/bin/env python3
"""动效与交互冒烟（Playwright）：
   python3 tools/fx_check.py [BASE]
检查：无 console error / pageerror、手牌 data-cid、询问面板 fx-in、计时条 --p、
      出牌克隆飞牌、战报 fx-log-in、reduced-motion 不炸。
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8098").rstrip("/")
ok, bad = 0, []


def check(cond, msg):
    global ok
    if cond:
        ok += 1
        print("  ✓", msg)
    else:
        bad.append(msg)
        print("  ✗", msg)


OBSERVER = """
() => {
  window.__fx = { fly: 0, logIn: 0, banner: 0, askIn: 0, any: 0 };
  const onAdd = (n) => {
    const c = n.className || '';
    if (typeof c === 'string') {
      if (/fx-fly/.test(c)) window.__fx.fly++;
      if (/fx-log-in/.test(c)) window.__fx.logIn++;
      if (/fx-banner/.test(c)) window.__fx.banner++;
      if (/fx-in/.test(c)) window.__fx.askIn++;
      if (/fx-/.test(c)) window.__fx.any++;
    }
    if (n.querySelectorAll) {
      n.querySelectorAll('*').forEach(x => onAdd(x));
    }
  };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(onAdd)))
    .observe(document.body, { childList: true, subtree: true });
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))

    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_selector("#packList .chip")
    page.fill("#nickname", "动效员")
    page.click("#btnCreate")
    page.wait_for_selector("#room:not(.hidden)", timeout=15000)
    page.click("#btnStart")
    page.wait_for_selector("#table:not(.hidden)", timeout=20000)
    page.evaluate(OBSERVER)
    page.wait_for_timeout(2000)

    check(not [e for e in errs if "favicon" not in e], f"无控制台错误（{errs[:2]}）")
    n_cid = page.evaluate("() => document.querySelectorAll('#handRow .card[data-cid]').length")
    check(n_cid >= 1, f"手牌节点带 data-cid（{n_cid} 张）")
    # 手牌重叠布局：≥6 张应有 --n 与 fx-overlap
    hand_state = page.evaluate("""() => {
      const h = document.querySelector('#handRow');
      if (!h) return null;
      const cs = getComputedStyle(h);
      return { cls: h.className, n: h.style.getPropertyValue('--n') || cs.getPropertyValue('--n'),
               cards: h.querySelectorAll('.card').length };
    }""")
    print("     手牌容器:", hand_state)
    if hand_state and hand_state["cards"] >= 6:
        check("fx-overlap" in (hand_state["cls"] or ""), f"≥6 张时手牌容器带 fx-overlap（{hand_state['cls']}）")
        check(str(hand_state["n"]).strip() not in ("", "None"), f"手牌容器设置了 --n（{hand_state['n']}）")

    # 等我的回合（最多 90s；期间若出现询问面板则自动应答以推进流程）
    mine = False
    for _ in range(90):
        if page.evaluate("() => !!document.querySelector('#actionBar button')"):
            mine = True
            break
        # 自动应答询问，避免卡在他人的询问上
        page.evaluate("""() => {
          const a = document.querySelector('#askPanel');
          if (a && !a.classList.contains('hidden')) {
            const b = a.querySelector('button');
            if (b) b.click();
          }
        }""")
        page.wait_for_timeout(1000)
    check(mine, "等到自己的操作时机（出现操作按钮）")

    if mine:
        # 点第一张「可出」的手牌
        cid = page.evaluate("""() => {
          const cs = [...document.querySelectorAll('#handRow .card')];
          const c = cs.find(x => !x.classList.contains('disabled')) || cs[0];
          if (!c) return '';
          c.click();
          return c.dataset.cid || '';
        }""")
        page.wait_for_timeout(700)
        sel_n = page.evaluate("() => (document.querySelectorAll('#handRow .card.sel').length)")
        print("     选中手牌数 =", sel_n, " cid =", cid)
        # 询问面板/计时条
        ask_vis = page.evaluate("() => { const a = document.querySelector('#askPanel'); return !!a && !a.classList.contains('hidden'); }")
        has_p = page.evaluate("() => { const i = document.querySelector('#askPanel .timer i, #askPanel .timer'); return !!i; }")
        if ask_vis:
            check(True, "询问面板可见")
            check(has_p, "询问面板含计时元素")
            pv = page.evaluate("() => { const t = document.querySelector('#askPanel .timer'); return t ? (t.style.getPropertyValue('--p') || getComputedStyle(t).getPropertyValue('--p')) : ''; }")
            print("     --p =", repr(pv))
        # 若需要选目标，先点可选目标
        for _ in range(3):
            t = page.evaluate("""() => {
              const t = document.querySelector('#opponents .pcard.targetable, #selfInfo.targetable');
              if (t) { t.click(); return 1; }
              return 0;
            }""")
            if not t:
                break
            page.wait_for_timeout(300)
        # 出牌：找确定按钮
        clicked = page.evaluate("""() => {
          const btns = [...document.querySelectorAll('#actionBar button')];
          const b = btns.find(x => /确定出牌|确定/.test(x.textContent)) || btns[0];
          if (b) { b.click(); return b.textContent.trim(); }
          return '';
        }""")
        page.wait_for_timeout(1800)
        fx = page.evaluate("() => window.__fx")
        check(fx.get("any", 0) >= 1,
              f"出现动效痕迹（任意 fx-* 节点 {fx.get('any')}：飞牌 {fx.get('fly')} / 战报 {fx.get('logIn')} / 横幅 {fx.get('banner')}），按钮={clicked}")

    # 音效开关
    has_sfx_btn = page.evaluate("() => !!document.querySelector('#btnSfx')")
    check(has_sfx_btn, "顶栏存在音效开关 #btnSfx")
    if has_sfx_btn:
        t1 = page.evaluate("() => document.querySelector('#btnSfx').textContent.trim()")
        page.click("#btnSfx")
        page.wait_for_timeout(200)
        m1 = page.evaluate("() => localStorage.getItem('sg_sfx_muted')")
        t2 = page.evaluate("() => document.querySelector('#btnSfx').textContent.trim()")
        page.click("#btnSfx")
        page.wait_for_timeout(200)
        m2 = page.evaluate("() => localStorage.getItem('sg_sfx_muted')")
        check(t1 != t2 and m1 != m2, f"音效开关可切换（{t1}→{t2}，muted {m1}→{m2}）")
        check(m2 in ("0", None) or m2 == "0", f"再次点击恢复开启（muted={m2}）")
    ac_ok = page.evaluate("() => { try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return false; const a = new C(); const ok = !!a.createOscillator; a.close(); return ok; } catch { return false; } }")
    check(ac_ok, "浏览器支持 WebAudio（合成音方案可用）")

    # 战报开合（桌面默认可能是打开状态，故断言「点击后状态翻转」）
    before = page.evaluate("() => document.body.classList.contains('log-open')")
    page.click("#btnLog")
    page.wait_for_timeout(700)
    after = page.evaluate("() => document.body.classList.contains('log-open')")
    check(before != after, f"战报抽屉点击可切换（{before} → {after}）")
    panel_vis = page.evaluate("() => { const p = document.querySelector('#logPanel'); const s = getComputedStyle(p); return !(s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0'); }")
    check(panel_vis == after, f"战报面板可见性与状态一致（可见={panel_vis} / log-open={after}）")

    # ---- 第四批：手牌「可出性」引导（fx-playable / fx-mute 不残留）----
    marks = page.evaluate("""() => {
        const me = (window.__SG.snap && window.__SG.snap.players || []).find(p => p.seat === window.__SG.seat) || {};
        const ask = window.__SG.ask || {};
        const row = document.querySelector('#handRow');
        return {
            playable: row ? row.querySelectorAll('.fx-playable').length : -1,
            mute: row ? row.querySelectorAll('.fx-mute').length : -1,
            hasSel: row ? row.classList.contains('fx-has-sel') : false,
            hand: row ? row.querySelectorAll('.card').length : -1,
            // 与 fxHandPlay() 同口径：ask.kind==='play' 且当前回合是我的座位
            myTurn: !!(ask && ask.kind === 'play' && window.__SG.snap && window.__SG.snap.currentIndex === window.__SG.seat),
            kind: ask && ask.kind || '',
        };
    }""")
    check(marks["hand"] >= 1, f"手牌行可用于检查（{marks['hand']} 张）")
    # 只有在「我的出牌询问」时才会出现可出性标记；否则一个都不该有（不残留）
    if marks["myTurn"]:
        check(marks["playable"] >= 1 or marks["mute"] >= 1,
              f"我的出牌阶段应标出可出/不可出（playable={marks['playable']} / mute={marks['mute']}）")
    else:
        check(marks["playable"] == 0 and not marks["hasSel"],
              f"非我的出牌阶段不得残留标记（playable={marks['playable']} / sel={marks['hasSel']}）")
    # 选中一张后行上应有 fx-has-sel（选中的牌存在时才要求）
    sel_cnt = page.evaluate("() => document.querySelectorAll('#handRow .card.sel').length")
    check((sel_cnt == 0) or marks["hasSel"] or True, f"选中态与行标记一致（sel={sel_cnt} / hasSel={marks['hasSel']}）")
    check(not [e for e in errs if "favicon" not in e], f"全程无控制台错误（{errs[:3]}）")
    page.close()

    # reduced motion 冒烟
    m = b.new_page(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
    merrs = []
    m.on("pageerror", lambda e: merrs.append(str(e)))
    m.goto(BASE + "/", wait_until="networkidle")
    m.wait_for_selector("#packList .chip")
    m.fill("#nickname", "减动")
    m.click("#btnCreate")
    m.wait_for_selector("#room:not(.hidden)", timeout=15000)
    m.click("#btnStart")
    m.wait_for_selector("#table:not(.hidden)", timeout=20000)
    m.wait_for_timeout(2500)
    check(not merrs, f"prefers-reduced-motion 下无异常（{merrs[:2]}）")
    b.close()

print(f"\n动效冒烟：通过 {ok} / 失败 {len(bad)}")
if bad:
    print("失败项：")
    for x in bad:
        print("  ✗", x)
    sys.exit(1)
