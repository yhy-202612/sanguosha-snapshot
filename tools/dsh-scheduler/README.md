# dsh 协作通道（inbox → reports）

本项目用「GitHub 仓库当消息队列 + 本机 dsh 轮询」的方式协作，协议与《通过GitHub定时任务调用dsh的方法》一致。

```
copilot（我）  →  main:inbox/<id>.md          下任务单
                    ↓ 你本机的轮询脚本按节奏拉取（只读 1 次 API）
              dsh --profile headless           只在发现新任务单时启动
                    ↓
                dsh/reports:reports/<id>.md    自动写回执
                    ↑ 我读取、验收、合并到 main、部署到服务器
```

## 你本机需要做的（一次性）

1. 克隆本仓库（私有，需你的令牌已受邀）：

```bash
git clone https://x-access-token:$GH_TOKEN@github.com/yhy-202612/sanguosha-online.git
cd sanguosha-online
git remote set-url origin https://github.com/yhy-202612/sanguosha-online.git
```

2. 把你**已配置好的**轮询脚本的 `--repo` / `--workdir` 指向本仓库：

```
--repo yhy-202612/sanguosha-online
--workdir <本仓库路径>
```

3. 保持默认节奏即可（发现新任务单才启动 dsh，空闲只花 1 次 GET）。

## 项目规则从哪读

dsh 会按「项目根 → 当前目录」逐级发现：

- `AGENTS.md`（角色边界、禁改清单、自检命令）
- `.dsh/skills/sanguosha/SKILL.md`（引擎契约、ctx API、事件表、范例）

**规则只写在仓库里**，改完即时生效，不依赖对话。

## 任务单协议

```markdown
---
id: A001
status: pending        # pending | done | cancelled
revision: 1            # 内容变更必须 +1，否则视为已处理
priority: high
branch: dsh/A001-shen-skills
---

## 目标
## 白名单
## 验收标准
```

回执（dsh 自动写回 `dsh/reports` 分支：`reports/<id>.md`）：

```markdown
---
id: A001
result: done           # done | blocked | failed
revision: 1
branch: dsh/A001-shen-skills
---
## 摘要
RESULT: done
BRANCH: dsh/A001-shen-skills
SESSION_ID: unknown
```

## 当前任务队列

| 单号 | 内容 | 优先级 | 分支 |
|---|---|---|---|
| A001 | 神将 12 位技能（19 个技能实现） | high | dsh/A001-shen-skills |
| A002 | 界/谋/极技能 | medium | dsh/A002-jie-mou-ji |
| A003 | AI 决策增强 | high | dsh/A003-ai |
| A004 | 前端 UI 增强 | medium | dsh/A004-ui |
| A005 | 武将池扩充到 100+ | low | dsh/A005-generals |

## 建议节奏（03-schedule.json）

```json
{
  "default_interval_minutes": 2,
  "windows": [
    { "name": "evening", "days": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], "start": "19:00", "end": "24:00", "interval_minutes": 10 },
    { "name": "afternoon_weekend", "days": ["Sat","Sun"], "start": "13:00", "end": "19:00", "interval_minutes": 10 }
  ]
}
```

## 排障

| 症状 | 原因 | 处理 |
|---|---|---|
| 一直「没有待处理指令」 | `status` 不是 `pending` 或 `revision` 没变 | 检查 frontmatter |
| clone 404 | 未接受协作邀请 / 令牌无该仓库权限 | 接受邀请；令牌需 Contents: R/W |
| 报「找不到 dsh」 | 计划任务/服务的 PATH 不含 nvm 等 | 用 `--dsh-cmd` 给完整路径 |
| 技能写完 selfcheck 红 | 实现有 bug | 看报告里的失败项，按 SKILL.md §8 修 |
