#!/usr/bin/env python3
"""部署三国杀到服务器：打包 → SFTP → 解包 → systemd → nginx 反代 → 健康检查。
凭据只从环境变量读取。
"""
import io
import os
import sys
import tarfile
import time

import paramiko

HOST = os.environ.get("SH_HOST", "120.48.43.211")
USER = os.environ.get("SH_USER", "root")
PASS = os.environ.get("SH_PASS")
REMOTE_DIR = "/opt/sanguosha"
PORT = 8030
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

EXCLUDE = {".git", "node_modules", "output", ".sources", "__pycache__"}


def build_tar():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for base, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in EXCLUDE]
            for f in files:
                if f.endswith((".log", ".pyc")):
                    continue
                full = os.path.join(base, f)
                rel = os.path.relpath(full, ROOT)
                tar.add(full, arcname=os.path.join("sanguosha", rel))
    buf.seek(0)
    return buf


def main():
    if not PASS:
        raise SystemExit("missing SH_PASS")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, port=int(os.environ.get("SH_PORT", 22)), username=USER, password=PASS, timeout=25)

    def run(cmd, timeout=180):
        stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        rc = stdout.channel.recv_exit_status()
        if out.strip():
            print(out.strip()[-2000:])
        if rc != 0 and err.strip():
            print("[stderr]", err.strip()[-800:])
        return rc

    print("== 上传")
    data = build_tar()
    sftp = c.open_sftp()
    with sftp.file("/tmp/sanguosha.tar.gz", "wb") as fh:
        fh.write(data.getvalue())
    sftp.close()
    print("size:", len(data.getvalue()))

    print("== 解包")
    run(f"mkdir -p {REMOTE_DIR} && rm -rf {REMOTE_DIR}/* && tar xzf /tmp/sanguosha.tar.gz -C {REMOTE_DIR} --strip-components=1 && ls {REMOTE_DIR}")

    print("== systemd 单元")
    unit = f"""[Unit]
Description=Sanguosha Online (三国杀在线)
After=network.target

[Service]
Type=simple
WorkingDirectory={REMOTE_DIR}
Environment=PORT={PORT}
Environment=HOST=172.19.0.1
Environment=TURN_TIMEOUT=30000
# 大模型密钥（真 AI 玩家）：只放服务器本地，chmod 600，不进部署包、不进 git
EnvironmentFile=-/etc/sanguosha.env
ExecStart=/usr/bin/node {REMOTE_DIR}/src/server/index.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/sanguosha.log
StandardError=append:/var/log/sanguosha.err.log

[Install]
WantedBy=multi-user.target
"""
    sftp = c.open_sftp()
    with sftp.file("/etc/systemd/system/sanguosha.service", "w") as fh:
        fh.write(unit)
    sftp.close()
    # 重启前先给在线房间广播维护提示（房间壳会落盘、重启后自动恢复，玩家不会被无声踢出）
    print("== 预重启通知")
    run(f"curl -s -m 5 -X POST http://172.19.0.1:{PORT}/api/admin/notice "
        f"-H 'Content-Type: application/json' "
        f"-d '{{\"text\":\"服务器即将更新（约 5 秒），房间会自动保留，稍候会自动重连\",\"seconds\":8}}' || true")
    run("sleep 1")
    # 必须 restart：enable --now 对已在跑的服务不会重启，等于新代码不生效
    run("systemctl daemon-reload && systemctl enable sanguosha && systemctl restart sanguosha "
        "&& sleep 2 && systemctl is-active sanguosha")

    print("== 本机探活")
    run(f"curl -s -o /dev/null -w '%{{http_code}}' http://172.19.0.1:{PORT}/api/meta; echo")

    print("== nginx 反代")
    snippet = "/opt/rdfz-ai-portal/deploy/nginx/snippets/site-locations.conf"
    block = f"""# ---- 三国杀在线（/sanguo/ → 宿主 node 172.19.0.1:{PORT}）----
location = /sanguo {{ return 301 /sanguo/; }}
location /sanguo/ {{
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
    sftp = c.open_sftp()
    with sftp.file("/tmp/sanguo-nginx-block.conf", "w") as fh:
        fh.write(block)
    sftp.close()
    ts = time.strftime("%Y%m%d%H%M%S")
    run(f"cp {snippet} {snippet}.bak-sanguo-{ts} && grep -q 'location /sanguo/' {snippet} && echo 'exists' || (echo >> {snippet} && cat /tmp/sanguo-nginx-block.conf >> {snippet} && echo 'appended')")
    run("docker exec deploy-nginx-1 nginx -t 2>&1 | tail -3")
    run("docker exec deploy-nginx-1 nginx -s reload && echo reloaded")

    print("== 公网验证")
    for u in ["http://120.48.43.211/sanguo/", "http://120.48.43.211/sanguo/api/meta"]:
        run(f"curl -s -o /dev/null -w '{u} -> %{{http_code}}\\n' {u}")

    c.close()
    print("done")


if __name__ == "__main__":
    main()
