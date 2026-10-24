# dsh 任务通道规范（本仓库为唯一通道）

自 2026-10-24 起，**`yhy-202612/sanguosha-online` 同时承担两个角色**：

1. 三国杀在线项目的代码仓库
2. **所有经 GitHub 与 dsh 传递的任务通道**（inbox → reports）

原智汇项目（`zhihui-showcase`）的 dsh 通道已收口，不再作为任务队列使用。

## 1. 任务号前缀（区分项目）

| 前缀 | 归属 | 代码实际位置 |
|---|---|---|
| `A###` | 三国杀在线（本仓库） | 本仓库 `workdir` |
| `Z###` | 智汇 ai-showcase | `zhihui-showcase` 的 clone 目录 |
| `G###` | 通用/跨项目/基础设施 | 见任务单 `target` 字段 |

任务文件仍放仓库根目录 `inbox/<id>.md`（保持与现有轮询脚本兼容，不建子目录）。

## 2. 跨项目任务怎么执行

任务单 frontmatter 增加三个可选字段：

```yaml
target_repo: yhy-202612/zhihui-showcase
target_workdir: C:\work\zhihui-showcase
target_branch: dsh/Z001-xxx
```

- 三者缺省时，默认在本仓库（三国杀）工作。
- 出现 `target_repo` 时，dsh 需先 `cd`/`clone` 到 `target_workdir` 再干活，**代码改动推 `target_repo` 的 `dsh/*` 分支**。
- 回执一律写回**本仓库** `dsh/reports:reports/<id>.md`（便于统一验收）。

> 若 dsh 环境不支持跨仓库切换，则跨项目任务需要另起一个轮询实例（`--repo` 指向目标仓库），此时任务单同时复制一份到目标仓库的 `inbox/`。

## 3. 轮询实例（推荐只要一个）

```powershell
git clone https://x-access-token:$env:GH_TOKEN@github.com/yhy-202612/sanguosha-online.git C:\work\sanguosha-online
python <轮询脚本> --repo yhy-202612/sanguosha-online --workdir C:\work\sanguosha-online
```

## 4. 状态机

```
pending ──(dsh 读到并执行)──> done / blocked / failed
   ├─ 需求变更：revision +1 → 重跑
   └─ 撤回：status: cancelled → 跳过
```

同一 `id` 同一 `revision` 只执行一次（幂等靠 `state.json`）。

## 5. 验收责任

- **人类/主控（copilot）**：读回执 → 跑项目自检 → 合并分支 → 部署 → 回写 `inbox/<id>.md` 的 `status: done`（或 `rejected` 并写原因）。
- **dsh**：只保证「分支内代码 + 自检通过 + 报告四节齐全」，不负责合并与部署。

## 6. 当前队列

| id | 项目 | 内容 | 状态 |
|---|---|---|---|
| A000 | 三国杀 | 全量体检与优化（含手机/电脑分别适配） | pending |
| A003 | 三国杀 | AI 决策增强 | pending |
| A005 | 三国杀 | 武将池扩到 100+ | pending |
| Z001 | 智汇 | 占位：后续智汇需求由此下发（A001 浏览量已合并 main） | — |

## 7. 已归档

- 智汇 `A001-view-count`：已合并至 `zhihui-showcase` main（commit `4f50c70`，WorkCard 显示浏览量，1 万以上显示 `X.X万`）。
- 智汇 `T000`/`T001`：通道连通性测试单，已作废。
