#!/usr/bin/env python3
"""调用 Claude（wawapii 中转），流式，避免 Cloudflare 524：
   python3 tools/claude_call_s.py <prompt_file> <out_file> [model] [max_tokens]
凭据：环境变量 CLAUDE_API_KEY 或 /tmp/.claude_env（KEY= / BASE= / MODEL=）
口径：必须带浏览器 UA、省略 temperature、流式保持连接。
"""
import json, os, sys, time, urllib.request


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
            if k == "KEY":
                key = v
            elif k == "BASE":
                base = v
            elif k == "MODEL":
                model = v
    return key, base.rstrip("/"), model


def main():
    prompt_file, out_file = sys.argv[1], sys.argv[2]
    model = sys.argv[3] if len(sys.argv) > 3 else None
    # 第 4 参：max_tokens；传 0 或省略表示「不设上限」（请求里完全不带该字段）
    max_tokens = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    key, base, dmodel = load_creds()
    model = model or dmodel
    if not key:
        sys.exit("缺少 CLAUDE_API_KEY")
    prompt = open(prompt_file, encoding="utf-8").read()
    body = {
        "model": model,
        "stream": True,
        "messages": [{"role": "user", "content": prompt}],
    }
    if max_tokens > 0:
        body["max_tokens"] = max_tokens
    extra = os.environ.get("CLAUDE_EXTRA", "").strip()
    if extra:
        body.update(json.loads(extra))
    req = urllib.request.Request(
        base + "/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + key,
            "Accept": "text/event-stream",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
    )
    print(f"[claude] model={model} prompt_chars={len(prompt)} max_tokens={max_tokens or "不设上限"}", flush=True)
    t0 = time.time()
    parts, finish, usage = [], None, None
    with urllib.request.urlopen(req, timeout=1800) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line or not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload in ("[DONE]", "done"):
                break
            try:
                obj = json.loads(payload)
            except Exception:
                continue
            if obj.get("usage"):
                usage = obj["usage"]
            for ch in obj.get("choices") or []:
                d = ch.get("delta") or {}
                t = d.get("content")
                if isinstance(t, str) and t:
                    parts.append(t)
                elif isinstance(t, list):
                    for seg in t:
                        if isinstance(seg, dict) and seg.get("text"):
                            parts.append(seg["text"])
                if ch.get("finish_reason"):
                    finish = ch["finish_reason"]
            if len(parts) and len(parts) % 200 == 0:
                print(f"  ... {sum(len(x) for x in parts)} chars, {time.time()-t0:.0f}s", flush=True)
    text = "".join(parts)
    open(out_file, "w", encoding="utf-8").write(text)
    print(f"[claude] out_chars={len(text)} finish={finish} {time.time()-t0:.0f}s usage={usage}", flush=True)


if __name__ == "__main__":
    main()
