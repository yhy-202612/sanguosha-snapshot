#!/usr/bin/env python3
"""dsh 通道探针监视器：检查两个仓库的 dsh/reports 分支上是否出现回执。
用法：GH_TOKEN=xxx python3 tools/probe_watch.py [等待秒数=240] [轮询间隔=30]
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

TOKEN = os.environ.get("GH_TOKEN", "").strip()
TARGETS = [
    ("yhy-202612/sanguosha-online", "A007.md", "新仓库"),
    ("yhy-202612/zhihui-showcase", "_PROBE-D.md", "旧仓库"),
]
WAIT = int(sys.argv[1]) if len(sys.argv) > 1 else 240
STEP = int(sys.argv[2]) if len(sys.argv) > 2 else 30


def api(path, tries=3):
    for i in range(tries):
        req = urllib.request.Request(
            "https://api.github.com" + path,
            headers={"Authorization": "Bearer " + TOKEN, "User-Agent": "probe", "Accept": "application/vnd.github+json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=50) as r:
                return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            return e.code, None
        except Exception as e:
            if i == tries - 1:
                return 0, str(e)
            time.sleep(2 * (i + 1))
    return 0, None


def fetch_report(repo, name):
    """返回 (状态, 正文)。状态 ∈ HIT / NOBRANCH / MISS / ERR"""
    st, br = api(f"/repos/{repo}/branches/dsh%2Freports")
    if st == 404:
        return "NOBRANCH", None
    if st != 200:
        return "ERR", str(br)
    st2, c = api(f"/repos/{repo}/contents/reports/{name}?ref=dsh/reports")
    if st2 == 404:
        return "MISS", None
    if st2 != 200:
        return "ERR", str(c)
    return "HIT", base64.b64decode(c["content"]).decode("utf-8", "replace")


def main():
    t0 = time.time()
    last = {}
    while True:
        elapsed = int(time.time() - t0)
        line = [f"[{elapsed:4d}s]"]
        hit_any = False
        for repo, name, tag in TARGETS:
            st, body = fetch_report(repo, name)
            line.append(f"{tag}:{st}")
            if st == "HIT":
                last[(repo, name)] = body
                hit_any = True
        print(" ".join(line), flush=True)
        if hit_any:
            for (repo, name), body in last.items():
                print("=" * 50)
                print(f"回执到达：{repo}/reports/{name}")
                print("-" * 50)
                print(body[:2500])
            return
        if elapsed >= WAIT:
            print(f"=== {WAIT}s 内无任何回执 ===", flush=True)
            return
        time.sleep(STEP)


if __name__ == "__main__":
    main()
