#!/usr/bin/env python3
"""从班级网站服务器 /opt/rdfz-ai-portal/deploy/.env 读取 Claude 凭据，写入本机 /tmp/.claude_env（600）。
只打印脱敏摘要。"""
import os, re, stat
import paramiko

HOST = os.environ.get("SH_HOST", "120.48.43.211")
USER = os.environ.get("SH_USER", "root")
PASS = os.environ["SH_PASS"]

cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, username=USER, password=PASS, timeout=30)
cmd = ("grep -E '^(CLAUDE_API_KEY|CLAUDE_BASE_URL|CLAUDE_MODEL)=' /opt/rdfz-ai-portal/deploy/.env "
       "|| (echo '--- compose env ---'; docker exec deploy-api-1 printenv | grep -E '^CLAUDE_')")
_, out, err = cli.exec_command(cmd, timeout=60)
txt = out.read().decode() + err.read().decode()
cli.close()

kv = {}
for line in txt.splitlines():
    m = re.match(r"^(CLAUDE_API_KEY|CLAUDE_BASE_URL|CLAUDE_MODEL)=(.*)$", line.strip())
    if m:
        kv[m.group(1)] = m.group(2).strip().strip('"').strip("'")
if "CLAUDE_API_KEY" not in kv:
    raise SystemExit("未找到 CLAUDE_API_KEY：\n" + txt[:1000])
path = "/tmp/.claude_env"
with open(path, "w") as f:
    f.write("KEY=%s\n" % kv["CLAUDE_API_KEY"])
    f.write("BASE=%s\n" % kv.get("CLAUDE_BASE_URL", "https://wawapii.com/v1"))
    f.write("MODEL=%s\n" % kv.get("CLAUDE_MODEL", "claude-opus-5-5"))
os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
k = kv["CLAUDE_API_KEY"]
print("KEY 已写入（脱敏：%s...%s / 长度 %d）" % (k[:6], k[-4:], len(k)))
print("BASE =", kv.get("CLAUDE_BASE_URL", "https://wawapii.com/v1"))
print("MODEL =", kv.get("CLAUDE_MODEL", "claude-opus-5-5"))
