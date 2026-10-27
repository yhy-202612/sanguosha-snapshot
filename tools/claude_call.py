#!/usr/bin/env python3
"""调用 Claude（wawapii 中转）：
   python3 tools/claude_call.py <prompt_file> <out_file> [model] [max_tokens]
凭据来源优先级：环境变量 CLAUDE_API_KEY / 文件 /tmp/.claude_env（KEY=... BASE=... MODEL=...）
口径（记忆）：必须带浏览器 User-Agent（否则 403）、省略 temperature、timeout >= 180s。
"""
import json, os, sys, urllib.request

def load_creds():
    key = os.environ.get("CLAUDE_API_KEY", "")
    base = os.environ.get("CLAUDE_BASE_URL", "https://wawapii.com/v1")
    model = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")
    p = "/tmp/.claude_env"
    if not key and os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k == "KEY": key = v
            elif k == "BASE": base = v
            elif k == "MODEL": model = v
    return key, base.rstrip("/"), model

def main():
    prompt_file, out_file = sys.argv[1], sys.argv[2]
    model = sys.argv[3] if len(sys.argv) > 3 else None
    max_tokens = int(sys.argv[4]) if len(sys.argv) > 4 else 32000
    key, base, dmodel = load_creds()
    model = model or dmodel
    if not key:
        sys.exit("缺少 CLAUDE_API_KEY（可写入 /tmp/.claude_env 的 KEY=）")
    prompt = open(prompt_file, encoding="utf-8").read()
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    req = urllib.request.Request(
        base + "/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + key,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
    )
    print(f"[claude] model={model} base={base} prompt_chars={len(prompt)}", flush=True)
    with urllib.request.urlopen(req, timeout=900) as r:
        data = json.loads(r.read().decode("utf-8"))
    ch = data.get("choices") or []
    if not ch:
        sys.exit("无 choices：" + json.dumps(data, ensure_ascii=False)[:800])
    msg = ch[0].get("message") or {}
    text = msg.get("content") or ""
    if isinstance(text, list):
        text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
    open(out_file, "w", encoding="utf-8").write(text)
    u = data.get("usage") or {}
    print(f"[claude] out_chars={len(text)} finish={ch[0].get('finish_reason')} usage={u}", flush=True)

if __name__ == "__main__":
    main()
