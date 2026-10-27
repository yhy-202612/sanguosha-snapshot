#!/usr/bin/env python3
"""更健壮的补丁落地器（v2）：
 - 支持多个 `===PATCH: <file>===` 段（finditer）
 - 容忍 `=======` / `>>>>>>> REPLACE` 前的空白缩进
 - SEARCH 先精确匹配，失败则按「忽略行尾空白」匹配，再失败则按「忽略缩进 + 行尾空白」匹配
 - `===FILE: xxx.append===` 幂等追加（按首行去重）
用法：python3 tools/apply_patches2.py <opus_out.md> [--dry]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BLOCK = re.compile(r"^[ \t]*<<<<<<< SEARCH[ \t]*\n(.*?)\n[ \t]*=======[ \t]*\n(.*?)\n[ \t]*>>>>>>> REPLACE[ \t]*$",
                   re.S | re.M)
PATCH = re.compile(r"^===PATCH: *([^=\n]+?) *===[ \t]*$", re.M)
APPEND = re.compile(r"^===FILE: *([^=\n]+?) *===[ \t]*$", re.M)


def norm(s):
    return "\n".join(line.rstrip() for line in s.split("\n"))


def find_span(text, search):
    """返回 (start, end) 或 None：三级匹配策略"""
    idx = text.find(search)
    if idx >= 0:
        return idx, idx + len(search)
    # 2) 忽略行尾空白
    lines = text.split("\n")
    sl = norm(search).split("\n")
    n, m = len(lines), len(sl)
    for i in range(n - m + 1):
        if all(lines[i + k].rstrip() == sl[k] for k in range(m)):
            start = len("\n".join(lines[:i])) + (1 if i else 0)
            end = len("\n".join(lines[:i + m]))
            return start, end
    # 3) 忽略缩进 + 行尾空白
    sl2 = [x.strip() for x in sl]
    for i in range(n - m + 1):
        if all(lines[i + k].strip() == sl2[k] for k in range(m)):
            start = len("\n".join(lines[:i])) + (1 if i else 0)
            end = len("\n".join(lines[:i + m]))
            return start, end
    return None


def main():
    src_file = sys.argv[1]
    dry = "--dry" in sys.argv
    text = open(src_file, encoding="utf-8").read()

    # 1) 收集所有 PATCH 段（每段到下一个 ===X 标记为止）
    segs = []
    marks = [(m.start(), "P", m.group(1).strip()) for m in PATCH.finditer(text)]
    marks += [(m.start(), "F", m.group(1).strip()) for m in APPEND.finditer(text)]
    marks.sort()
    for i, (pos, kind, name) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        segs.append((kind, name, text[pos:end]))

    stats = {}
    for kind, name, seg in segs:
        if kind != "P":
            continue
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            print(f"跳过（文件不存在）：{name}")
            continue
        body = open(path, encoding="utf-8").read()
        ok = bad = 0
        for m in BLOCK.finditer(seg):
            search, repl = m.group(1), m.group(2)
            span = find_span(body, search)
            if not span:
                bad += 1
                head = search.strip().split("\n")[0][:70]
                print(f"  ✗ 未匹配：{head}")
                continue
            body = body[:span[0]] + repl + body[span[1]:]
            ok += 1
            print(f"  ✓ {name} #{ok}: {search.strip().split(chr(10))[0][:60]}")
        if not dry:
            open(path, "w", encoding="utf-8").write(body)
        stats[name] = (ok, bad)
        print(f"{name}：成功 {ok} / 失败 {bad}")

    # 2) append 段
    for kind, name, seg in segs:
        if kind != "F" or not name.endswith(".append"):
            continue
        target = os.path.join(ROOT, name[: -len(".append")])
        css = BLOCK.sub("", seg)
        css = re.sub(r"^===FILE:.*$", "", css, flags=re.M)
        css = css.replace("===NOCHANGE===", "").strip()
        if not css:
            continue
        if not os.path.exists(target):
            print(f"跳过追加（目标不存在）：{name}")
            continue
        cur = open(target, encoding="utf-8").read()
        first = css.split("\n")[0].strip()
        if first and first in cur:
            print(f"{name}：已存在（首行 {first[:40]}），跳过追加")
            continue
        if not dry:
            with open(target, "a", encoding="utf-8") as f:
                f.write("\n\n/* ===== 动效第四批（F，Claude Opus 5.5）===== */\n" + css + "\n")
        print(f"{name}：追加 {len(css)} 字符")

    print("统计：", stats)


if __name__ == "__main__":
    main()
