#!/usr/bin/env python3
"""SSH 执行器：凭据只从环境变量读取，不落盘。"""
import os, sys, paramiko

HOST = os.environ.get("SH_HOST", "120.48.43.211")
PORT = int(os.environ.get("SH_PORT", "22"))
USER = os.environ.get("SH_USER", "root")
PASS = os.environ.get("SH_PASS")
TIMEOUT = int(os.environ.get("SH_TIMEOUT", "180"))

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "true"
    if not PASS:
        print("missing SH_PASS", file=sys.stderr)
        return 2
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, port=PORT, username=USER, password=PASS, timeout=25, banner_timeout=30, auth_timeout=30)
    stdin, stdout, stderr = c.exec_command(cmd, timeout=TIMEOUT)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    rc = stdout.channel.recv_exit_status()
    sys.stdout.write(out)
    if err.strip():
        sys.stderr.write("\n[stderr]\n" + err)
    c.close()
    return rc

if __name__ == "__main__":
    sys.exit(main())
