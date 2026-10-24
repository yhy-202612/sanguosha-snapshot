# AGENTS.md · 三国杀在线（sanguosha-online）

> 本文件是 dsh（DeepSeek Harness）在本仓库工作时的**硬约束**。任何任务单与本文件冲突时，以本文件为准。

## 1. 角色边界

- 你是本项目的**代码实现者**，只按 `inbox/<id>.md` 的任务单工作。
- 只允许推送 `dsh/*` 分支；**不得**推 `main`、不得 force push、不得改 `main`。
- 不得修改：`src/engine/**`、`src/server/**`、`src/data/deck.js`、`package.json`、`tools/deploy/**`、`.github/**`。
  - 如果任务确实需要改上述文件，写进报告里说明「需要人类修改」，**不要自己改**。
- 不得引入任何 npm 依赖（本项目零依赖，Node 20 原生 ESM）。
- 不得删除、重命名已有文件（只能新增或在白名单内修改）。
- 不得在代码里写死密钥、令牌、内网地址。

## 2. 技术事实（固定）

- 运行时：Node.js 18+（生产 20），ESM（`import`/`export`），**零第三方依赖**。
- 引擎：服务端权威，`src/engine/game.js` 为状态机；技能通过 `defineSkill()` 注册。
- 通信：HTTP + SSE（`text/event-stream`），无 WebSocket。
- 前端：`client/index.html` + `client/app.js`（原生 ESM）+ `client/style.css`，无构建步骤。
- 中文注释与中文文案；代码风格 2 空格缩进、单引号、分号。

## 3. 自检（提交前必须全部通过）

```bash
node tools/selfcheck.js          # 数据完整性 + 七模式对局冒烟 + 快照可见性
node --check src/skills/<你改的文件>.js   # 语法检查（可选，selfcheck 已覆盖）
```

`selfcheck.js` 必须 `失败 0`。若你的改动让某条断言变红，说明实现有问题，修到全绿再提交。

## 4. 提交规范

- 分支名：与任务单 `branch:` 字段一致（如 `dsh/A001-shen-skills`）。
- 提交信息：`A001: <一句话>`，正文列出改了哪些文件、怎么自检的。
- 报告写到 `reports/<id>.md`（由调度脚本写回 `dsh/reports` 分支，你只需保证分支内容正确）。
- 报告末尾三行必须存在：

```
RESULT: done
BRANCH: dsh/A001-xxx
SESSION_ID: <你的会话 id，没有就写 unknown>
```

## 5. 验收口径

任务单里的「验收标准」逐条可判定。做不到就写 `RESULT: blocked` 并在报告里说明卡在哪，**不要**用占位代码假装完成。

## 6. 已知坑

- 技能里的 `ctx.ask.*` 都是 **async**，必须 `await`。
- `trigger.filter` 收到的是事件数据 + `{ self, player, game }`；`who:'self'` 表示事件主体是该技能拥有者。
- 不要在技能里直接改 `player.hp`，一律用 `ctx.damage / ctx.recover / ctx.loseHp`。
- 牌对象不要新建（除虚拟牌 `{...card, name:'xxx', __src: card}`），否则弃牌堆会丢牌。
- `game.ask()` 的 `kind` 只能是 `card | choice | targets | confirm | discard | cards`。
