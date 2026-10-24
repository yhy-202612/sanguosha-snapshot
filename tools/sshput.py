"""上传本地文件/目录到服务器（SFTP）。用法：
  SH_PASS=... python3 tools/sshput.py <本地路径> <远程路径>
密码只走环境变量。
"""
import os
import sys

import paramiko

HOST = os.environ.get("SH_HOST", "120.48.43.211")
USER = os.environ.get("SH_USER", "root")
PASS = os.environ["SH_PASS"]


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    local, remote = sys.argv[1], sys.argv[2]
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=20)
    sftp = c.open_sftp()
    if os.path.isdir(local):
        for root, _dirs, files in os.walk(local):
            for f in files:
                lp = os.path.join(root, f)
                rp = remote + "/" + os.path.relpath(lp, local).replace(os.sep, "/")
                try:
                    sftp.stat(os.path.dirname(rp))
                except IOError:
                    parts = os.path.dirname(rp).split("/")
                    for i in range(2, len(parts) + 1):
                        try:
                            sftp.mkdir("/".join(parts[:i]))
                        except IOError:
                            pass
                sftp.put(lp, rp)
        print("↑ dir", local, "->", remote)
    else:
        sftp.put(local, remote)
        print("↑", local, "->", remote, os.path.getsize(local), "bytes")
    sftp.close()
    c.close()
    return 0


sys.exit(main())
