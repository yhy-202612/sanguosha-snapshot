#!/usr/bin/env python3
"""从 client/app.js 抽取指定顶层函数/常量块，输出片段文件（供精简 prompt 使用）。
用法：python3 tools/extract_snippets.py <out.md>
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "client/app.js"), encoding="utf-8").read().split("\n")

TARGETS = [
    "function fxDrawIn", "function fxSkillName", "function fxSweepTail", "function fxBindDrag",
    "function renderPackChips", "function renderPackPicker", "function renderPoolList",
    "function renderMarks", "function renderEquips", "function seatCard", "function fxPickIn",
    "const S = ", "const FX", "function fxLater", "function fxReset", "function fxFlyCards",
    "function fxFloat", "function fxDiffHp", "function fxPhaseBanner", "function fxPulseSeat",
    "function fxSkillToast", "function switchView", "function renderTable", "function playerCard",
    "function renderHand", "function renderActions", "function renderAsk", "function syncAskOffset",
    "function addLog", "function showOverlay", "function hideOverlay", "function submitPlay",
    "function submit", "function toggleTarget", "function clickCard", "function toast",
    "function bindCardTip", "function showCardTip", "function openPickGeneral", "function renderRoom",
    "function connect", "function setLogOpen", "function openSkills", "function openOneSkills",
    "function renderSelfEquips", "function armorText", "function markEntries", "function cardInfo",
    "function openGeneralDetail", "function modal",
]

lines = src
out = []
i = 0
found = set()
while i < len(lines):
    line = lines[i]
    auto = line.startswith("function fx") or line.startswith("const FX")
    for t in (TARGETS if not auto else ["__auto__"]):
        if auto or line.startswith(t) or line.startswith(t.replace("function ", "async function ")):
            # 收集到下一个顶层声明（col 0 的 function/const/let/var/async function/export/}) 结束
            depth = 0
            buf = [line]
            j = i + 1
            if "{" in line:
                depth += line.count("{") - line.count("}")
            while j < len(lines):
                nxt = lines[j]
                if depth <= 0 and re.match(r"^(function |async function |const |let |var |export )", nxt):
                    break
                buf.append(nxt)
                depth += nxt.count("{") - nxt.count("}")
                j += 1
                if depth <= 0 and len(buf) > 2:
                    break
            out.append("\n".join(buf).rstrip())
            found.add("__auto__" if auto else t)
            i = j
            break
    else:
        i += 1

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/snippets.md"
with open(path, "w", encoding="utf-8") as f:
    f.write("/* ===== 以下是从 client/app.js 抽取的相关代码片段（不是全文）；"
            "你只能在片段范围内下 SEARCH 补丁 ===== */\n\n")
    f.write("\n\n".join(out))
    f.write("\n")
txt = open(path, encoding="utf-8").read()
print(f"wrote {path}: {len(txt)} chars, {len(out)} blocks")
miss = [t for t in TARGETS if t not in found]
if miss:
    print("未命中：", miss)
