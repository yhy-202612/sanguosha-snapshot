#!/usr/bin/env python3
"""用 GitHub Git Data API 推送整个项目（沙箱内 git 443 不通）。令牌只从环境变量 GH_TOKEN 读取。

优化（2026-10-24）：
- 本地计算 blob sha，与远程 tree 比对，只上传变更文件（增量推送，失败面小、快）
- 每个请求带重试（网络抖动常见）
用法：GH_TOKEN=xxx python3 tools/ghpush.py "提交信息" [--force]
"""
import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

TOKEN = os.environ.get("GH_TOKEN")
REPO = os.environ.get("GH_REPO", "yhy-202612/sanguosha-online")
BRANCH = os.environ.get("GH_BRANCH", "main")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
API = "https://api.github.com"

SKIP_DIRS = {".git", "node_modules", "data", "output", "uploads", ".sources", "__pycache__", ".venv"}
SKIP_FILES = {".env", ".DS_Store"}


def req(method, path, payload=None, tries=4):
    url = API + path
    data = json.dumps(payload).encode() if payload is not None else None
    last = None
    for i in range(tries):
        r = urllib.request.Request(url, data=data, method=method)
        r.add_header("Authorization", "Bearer " + TOKEN)
        r.add_header("Accept", "application/vnd.github+json")
        r.add_header("Content-Type", "application/json")
        r.add_header("User-Agent", "sanguosha-deploy")
        try:
            with urllib.request.urlopen(r, timeout=45) as resp:
                body = resp.read().decode()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            if e.code in (401, 403, 404, 409, 422):
                raise SystemExit(f"{method} {path} -> {e.code}: {detail}")
            last = f"{e.code}: {detail}"
        except Exception as e:  # 网络类错误，重试
            last = f"{type(e).__name__}: {e}"
        time.sleep(2 * (i + 1))
    raise SystemExit(f"{method} {path} 重试耗尽 -> {last}")


def blob_sha(content: bytes) -> str:
    h = hashlib.sha1()
    h.update(b"blob %d\0" % len(content))
    h.update(content)
    return h.hexdigest()


def iter_files():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f in SKIP_FILES or f.endswith((".log", ".pyc", ".zip", ".tar.gz")):
                continue
            full = os.path.join(base, f)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            yield rel, full


def main():
    if not TOKEN:
        raise SystemExit("missing GH_TOKEN")
    force = "--force" in sys.argv
    msg = next((a for a in sys.argv[1:] if not a.startswith("--")), "update")

    files = list(iter_files())
    print(f"files: {len(files)}")

    # 远程现状
    remote = {}
    parent = None
    try:
        ref = req("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}")
        parent = ref["object"]["sha"]
        c = req("GET", f"/repos/{REPO}/git/commits/{parent}")
        rt = req("GET", f"/repos/{REPO}/git/trees/{c['tree']['sha']}?recursive=1")
        remote = {n["path"]: n["sha"] for n in rt.get("tree", []) if n["type"] == "blob"}
    except SystemExit:
        print("远程分支为空，将做首次提交")

    todo, skip = [], 0
    for rel, full in files:
        with open(full, "rb") as fh:
            content = fh.read()
        if len(content) > 5 * 1024 * 1024:
            print("skip large:", rel)
            continue
        if not force and remote.get(rel) == blob_sha(content):
            skip += 1
            continue
        todo.append((rel, content))
    print(f"变更 {len(todo)} 个 / 未变 {skip} 个")

    if not todo and parent:
        print("无变更，跳过提交")
        return

    def upload(item):
        rel, content = item
        b = req("POST", f"/repos/{REPO}/git/blobs", {
            "content": base64.b64encode(content).decode(), "encoding": "base64"})
        return {"path": rel, "mode": "100644", "type": "blob", "sha": b["sha"]}

    with ThreadPoolExecutor(max_workers=4) as ex:
        changed = list(ex.map(upload, todo))

    # 保留远程未变更文件（tree 需完整快照）
    changed_map = {c["path"]: c for c in changed}
    tree = []
    for rel, sha in remote.items():
        tree.append(changed_map.pop(rel, {"path": rel, "mode": "100644", "type": "blob", "sha": sha}))
    tree.extend(changed_map.values())
    # 删除远程已不存在的文件：tree 快照不含即被移除（上面以远程为底，需剔除本地已删文件）
    local_paths = {rel for rel, _ in files}
    tree = [t for t in tree if t["path"] in local_paths]

    new_tree = req("POST", f"/repos/{REPO}/git/trees", {"tree": tree})
    payload = {"message": msg, "tree": new_tree["sha"]}
    if parent:
        payload["parents"] = [parent]
    commit = req("POST", f"/repos/{REPO}/git/commits", payload)
    if parent:
        req("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}", {"sha": commit["sha"]})
    else:
        req("POST", f"/repos/{REPO}/git/refs", {"ref": f"refs/heads/{BRANCH}", "sha": commit["sha"]})
    print("commit:", commit["sha"][:8], "files:", len(tree))


if __name__ == "__main__":
    main()
