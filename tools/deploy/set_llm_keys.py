#!/usr/bin/env python3
"""把大模型密钥写到服务器的 /etc/sanguosha.env（chmod 600）并重启服务。

密钥只从环境变量读取，不在本进程内落盘、不打印明文：
    DEEPSEEK_API_KEY=... GLM_API_KEY=... python3 tools/deploy/set_llm_keys.py

重启后可用：
    curl http://172.19.0.1:8030/api/llm-status     # 只回 ready 布尔，不含密钥
"""
import os
import sys

import paramiko

HOST = os.environ.get("SH_HOST", "120.48.43.211")
USER = os.environ.get("SH_USER", "root")
PASS = os.environ.get("SH_PASS")
ENV_PATH = "/etc/sanguosha.env"

WANT = ["DEEPSEEK_API_KEY", "GLM_API_KEY"]


def main():
    if not PASS:
        raise SystemExit("missing SH_PASS")
    vals = {k: (os.environ.get(k) or "").strip() for k in WANT}
    if not any(vals.values()):
        raise SystemExit("DEEPSEEK_API_KEY / GLM_API_KEY 至少给一个")

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, port=int(os.environ.get("SH_PORT", 22)), username=USER, password=PASS, timeout=25)

    def run(cmd, timeout=120):
        _in, out, err = c.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", "replace")
        e = err.read().decode("utf-8", "replace")
        rc = out.channel.recv_exit_status()
        return rc, o.strip(), e.strip()

    lines = []
    for k in WANT:
        if vals[k]:
            # 只写单行 KEY=VALUE，值里不允许换行/引号，避免破坏 EnvironmentFile 解析
            v = vals[k].replace("\n", "").replace('"', "").replace("'", "")
            lines.append(f"{k}={v}")
    body = "\n".join(lines) + "\n"

    # 用 base64 传输，避免 shell 引号/特殊字符问题
    import base64
    b64 = base64.b64encode(body.encode()).decode()
    rc, o, e = run(f"printf '%s' '{b64}' | base64 -d > {ENV_PATH} && chmod 600 {ENV_PATH} && wc -l < {ENV_PATH}")
    if rc != 0:
        print("写 env 失败：", e)
        sys.exit(1)
    print(f"已写入 {ENV_PATH}（{o.strip()} 行，600）")

    rc, o, e = run("systemctl daemon-reload && systemctl restart sanguosha && sleep 3 && systemctl is-active sanguosha")
    print("服务状态：", o.strip() or e.strip())

    rc, o, e = run("curl -s -m 8 http://172.19.0.1:8030/api/llm-status")
    print("llm-status：", o[:300])
    c.close()


if __name__ == "__main__":
    main()
