"""从服务器下载文件到本地（SFTP）。用法：
  SH_PASS=... python3 tools/sshget.py <远程路径> <本地路径> [--dir]
密码只走环境变量。连接信息见『东风的知识库』《RDFZ 开发层服务器 · SSH 访问凭据.md》。
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
    remote, local = sys.argv[1], sys.argv[2]
    is_dir = "--dir" in sys.argv
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=20)
    sftp = c.open_sftp()
    if is_dir:
        os.makedirs(local, exist_ok=True)
        for name in sftp.listdir(remote):
            rp, lp = f"{remote}/{name}", os.path.join(local, name)
            try:
                if sftp.stat(rp).st_mode & 0o040000:
                    continue
                sftp.get(rp, lp)
                print("↓", name, os.path.getsize(lp))
            except Exception as e:  # noqa: BLE001
                print("skip", name, e)
    else:
        os.makedirs(os.path.dirname(local) or ".", exist_ok=True)
        sftp.get(remote, local)
        print("↓", remote, "->", local, os.path.getsize(local), "bytes")
    sftp.close()
    c.close()
    return 0


sys.exit(main())
