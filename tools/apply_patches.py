#!/usr/bin/env python3
"""应用 Claude 返回的补丁：
   python3 tools/apply_patches.py <claude_out.md> [--dry]
- 解析 ===PATCH: client/app.js=== 段里的 <<<<<<< SEARCH / ======= / >>>>>>> REPLACE 块，逐个唯一定位替换
- 解析 ===FILE: client/style.css.append=== 段，写入 style.css 的「UI v2 追加区」（幂等）
- 每步输出 matched/failed 明细；有失败时退出码 1（app.js 仍按成功的部分保存）
"""
import os, re, sys, time, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1]
DRY = "--dry" in sys.argv

text = open(OUT, encoding="utf-8").read()

# ---------- 1. app.js 补丁 ----------
m = re.search(r"^===PATCH: client/app\.js===\s*$(.*?)(?=^===[A-Z]+:|^===FILE:|\Z)", text, re.S | re.M)
blocks = []
if m:
    body = m.group(1)
    if "===NOCHANGE===" not in body:
        pat = re.compile(r"^<<<<<<< SEARCH\n(.*?)\n=======\n(.*?)\n>>>>>>> REPLACE\s*$", re.S | re.M)
        blocks = [(mm.group(1), mm.group(2)) for mm in pat.finditer(body)]

app_path = os.path.join(ROOT, "client/app.js")
src = open(app_path, encoding="utf-8").read()
orig = src
ok, fail = [], []
for i, (search, repl) in enumerate(blocks, 1):
    n = src.count(search)
    if n != 1:
        fail.append((i, n, search.strip().splitlines()[0][:80] if search.strip() else ""))
        continue
    src = src.replace(search, repl, 1)
    ok.append((i, search.strip().splitlines()[0][:80] if search.strip() else ""))

print(f"app.js 补丁：匹配成功 {len(ok)} / 失败 {len(fail)}")
for i, first in ok:
    print(f"  ✓ #{i} {first}")
for i, n, first in fail:
    print(f"  ✗ #{i}（原片段出现 {n} 次，需恰好 1 次） {first}")

if not DRY and src != orig:
    os.makedirs(os.path.join(ROOT, ".bak"), exist_ok=True)
    shutil.copy2(app_path, os.path.join(ROOT, ".bak", f"app.js.bak-{time.strftime('%H%M%S')}"))
    open(app_path, "w", encoding="utf-8").write(src)
    print("已写入 client/app.js（原文件备份在 .bak/）")

# ---------- 2. style.css 追加区 ----------
m2 = re.search(r"^===FILE: client/style\.css\.append===\s*$(.*?)(?=^===[A-Z]+:|^===FILE:|\Z)", text, re.S | re.M)
if m2:
    add = m2.group(1).strip()
    if add and "===NOCHANGE===" not in add:
        css_path = os.path.join(ROOT, "client/style.css")
        css = open(css_path, encoding="utf-8").read()
        BEGIN, END = "/* ===== UI v2（claude 追加区）BEGIN ===== */", "/* ===== UI v2（claude 追加区）END ===== */"
        block = f"{BEGIN}\n{add}\n{END}\n"
        if BEGIN in css and END in css:
            css = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", lambda _: block, css, flags=re.S)
        else:
            css = css.rstrip() + "\n\n" + block
        if not DRY:
            shutil.copy2(css_path, os.path.join(ROOT, ".bak", f"style.css.bak-{time.strftime('%H%M%S')}"))
            open(css_path, "w", encoding="utf-8").write(css)
        print(f"style.css 追加区：{len(add)} 字符已{'预演' if DRY else '写入'}")

sys.exit(1 if fail else 0)
