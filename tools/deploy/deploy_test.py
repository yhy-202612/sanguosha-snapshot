#!/usr/bin/env python3
"""部署「UI v2 测试版」：同一份服务端代码，第二个 node 实例 + 独立前端目录 client-v2。

  /sanguo/       → 172.19.0.1:8030  CLIENT_DIR=/opt/sanguosha/client        （正式版）
  /sanguo-test/  → 172.19.0.1:8031  CLIENT_DIR=/opt/sanguosha/client-v2     （测试版）

只建 systemd unit + nginx location，不上传代码（先用 deploy.py 发布整包）。
凭据只从环境变量读取。
"""
import os

import paramiko

HOST = os.environ.get("SH_HOST", "120.48.43.211")
USER = os.environ.get("SH_USER", "root")
PASS = os.environ.get("SH_PASS")
REMOTE_DIR = "/opt/sanguosha"
PORT = 8031
SNIPPET = "/opt/rdfz-ai-portal/deploy/nginx/snippets/site-locations.conf"

UNIT = f"""[Unit]
Description=Sanguosha Online (UI v2 test instance)
After=network.target

[Service]
Type=simple
WorkingDirectory={REMOTE_DIR}
Environment=PORT={PORT}
Environment=HOST=172.19.0.1
Environment=CLIENT_DIR={REMOTE_DIR}/client-v2
Environment=STATE_FILE={REMOTE_DIR}/.rooms-{PORT}.json
Environment=TURN_TIMEOUT=30000
EnvironmentFile=-/etc/sanguosha.env
ExecStart=/usr/bin/node {REMOTE_DIR}/src/server/index.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/sanguosha-test.log
StandardError=append:/var/log/sanguosha-test.err.log

[Install]
WantedBy=multi-user.target
"""

BLOCK = f"""
# ---- 三国杀在线 · UI v2 测试版（/sanguo-test/ → 宿主 node 172.19.0.1:{PORT}）----
location = /sanguo-test {{ return 301 /sanguo-test/; }}
location /sanguo-test/ {{
    proxy_pass http://172.19.0.1:{PORT}/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    client_max_body_size 16m;
    chunked_transfer_encoding on;
}}
"""


def main():
    if not PASS:
        raise SystemExit("missing SH_PASS")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, port=int(os.environ.get("SH_PORT", 22)), username=USER, password=PASS, timeout=25)

    def run(cmd, timeout=180):
        _, out, err = c.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", "replace")
        e = err.read().decode("utf-8", "replace")
        rc = out.channel.recv_exit_status()
        if o.strip():
            print(o.strip()[-1500:])
        if rc != 0 and e.strip():
            print("[stderr]", e.strip()[-800:])
        return rc

    print("== systemd 单元（测试实例）")
    sftp = c.open_sftp()
    with sftp.file("/etc/systemd/system/sanguosha-test.service", "w") as fh:
        fh.write(UNIT)
    sftp.close()
    run("systemctl daemon-reload && systemctl enable sanguosha-test && systemctl restart sanguosha-test && sleep 2 && systemctl is-active sanguosha-test")

    print("== 本机探活")
    run(f"curl -s -o /dev/null -w 'test-meta %{{http_code}}' http://172.19.0.1:{PORT}/api/meta; echo")
    run(f"curl -s http://172.19.0.1:{PORT}/ | grep -c 'v2.css' || true")

    print("== nginx location")
    ts = os.popen("date +%Y%m%d%H%M%S").read().strip()
    sftp = c.open_sftp()
    with sftp.file("/tmp/sanguo-test-nginx.conf", "w") as fh:
        fh.write(BLOCK)
    sftp.close()
    run(
        f"cp {SNIPPET} {SNIPPET}.bak-test-{ts} && "
        f"grep -q 'location /sanguo-test/' {SNIPPET} && echo 'exists' || "
        f"(echo >> {SNIPPET} && cat /tmp/sanguo-test-nginx.conf >> {SNIPPET} && echo 'appended')"
    )
    run("docker exec deploy-nginx-1 nginx -t 2>&1 | tail -3")
    run("docker exec deploy-nginx-1 nginx -s reload && sleep 2 && echo reloaded")

    print("== 公网验证")
    for u in [
        "http://120.48.43.211/sanguo-test/",
        "http://120.48.43.211/sanguo-test/v2.css",
        "http://120.48.43.211/sanguo-test/api/meta",
        "http://120.48.43.211/sanguo/",
    ]:
        run(f"curl -s -o /dev/null -w '{u} -> %{{http_code}}\\n' {u}")

    print("== 测试版页面是否引用了 v2.css")
    run("curl -s http://120.48.43.211/sanguo-test/ | grep -o 'v2.css' | head -1")

    c.close()
    print("done")


if __name__ == "__main__":
    main()
