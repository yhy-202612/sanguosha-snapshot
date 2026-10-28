# 真 AI 玩家（大模型接管电脑座位）

> 2026-10-28 上线。房主可在「房间设置 → AI 大脑」把电脑玩家从内置启发式换成 DeepSeek / GLM，
> 并可调强度。玩家能看到它想了多久、选了什么、为什么。

## 一、玩家怎么用

1. 建房后点「房间设置」（仅房主）；
2. 「电脑玩家的 AI 大脑」选 **大模型 · 真 AI**；
3. 选模型（只列出服务器已配密钥的，未配置的显示划掉）；
4. 选强度：**普通**（只在出牌阶段思考）/ **高**（出牌 + 被杀/决斗等关键响应也思考）；
5. 保存（可同时「用电脑补足」）。

配置随房间保存，`round` 之间保留；改配置会清空大脑缓存。

## 二、玩家能看到什么（这是刻意的设计）

大模型单步要 2~8 秒（比内置 AI 慢），但慢的这段时间不是黑箱：

| 位置 | 显示 |
|---|---|
| 房间座位卡 | `🤖 大模型思考中 3s`（金色呼吸） |
| 对局桌面中央 | `🤖 电脑1 正在思考（3s）` |
| 战报 | `🤖 电脑1 想了 4.2s → 使用【杀】→ 座 3 我（补刀）` |
| 降级时 | `⚠ 电脑1 的大模型连续 3 次失败，本局改由内置 AI 接管` |

> 时间到了会自动清掉标记（40 秒超时保护），不会出现「一直显示思考中」。

## 三、为什么不会出非法动作

**候选集由引擎生成，大模型只做选择题**：

- 候选来自 `game.candidatesFor()`（已过 `canUse`）+ `activeSkillsOf()` + 「结束出牌阶段」；
- 提示词要求只回 `{"i":编号,"why":"不超过12字"}`；
- 反序列化有白名单校验：编号越界 / 非整数 / 非 JSON → 一律拒绝（不会猜）。

失败链（任何一步失败都不会卡住对局）：

```
超时 / HTTP错 / 非JSON / 编号越界 / 推理超预算
        ↓
  用内置启发式 AIPlayer 的首选动作
        ↓（连续 3 次）
  本座位本局熔断 → 全走内置 AI + 战报提示
```

另有两道护栏：

- **全局限流** `LLM_RPM`（默认 120 次/分钟）：防止有人反复建房刷爆 API 额度；超限直接回落内置 AI；
- 密钥只读服务器环境变量，`/api/llm-status` 只回 `{label, model, ready}` 布尔，**永不下发密钥与上游地址**（`tools/aicheck.js` 守这条线）。

## 四、实测数据（2026-10-28）

| 模型 | 单步耗时 | 稳定性 | 备注 |
|---|---|---|---|
| `deepseek-flash` | 1.4~5.8s（普通档） | 8/8 | 会给出理由；`reasoning_effort: low` 把 9.2s 压到 4.0s，决策不变 |
| `glm-5.3-flash` | 2.7~6.9s | 8/8 | 常只回 `{"action":n}` 不给理由，已兼容该字段 |
| `glm-5.3` | 37s+ | 不可用 | 明显不适合实时对局，未采用 |

**踩过的坑（都已修）**

1. `max_tokens=300` → 推理模型 100% 返回空 content（reasoning 吃光，`finish_reason=length`）。现普通档 2000、高强度档 3000，并把这种情况明确报成「推理超出 token 预算」而不是「模型乱答」。
2. GLM 经中转站只输出 `{"action": n}` 且爱套代码块围栏 → `parseDecision` 兼容 `action/choice/...` 与围栏，并支持「整段 JSON 被截断时从 `字段: 数字` 兜底」。
3. wawapii 风控：不带浏览器 UA 直接 403。

## 五、运维

**部署密钥**（不进部署包、不进 git）：

```bash
DEEPSEEK_API_KEY=... GLM_API_KEY=... \
  SH_PASS=*** python3 tools/deploy/set_llm_keys.py
# → 写 /etc/sanguosha.env (chmod 600) → daemon-reload → restart
```

systemd 单元已含 `EnvironmentFile=-/etc/sanguosha.env`，重复部署不会丢密钥。

**状态自查**：`curl http://<host>/sanguo/api/llm-status`
返回里的 `stats` 可看 `calls/fails/timeouts/avgMs/throttled/degraded/lastErr`。

**自测脚本**

| 脚本 | 覆盖 | 是否需密钥 |
|---|---|---|
| `node tools/llmcheck.js` | 候选合法性、解析容错、失败回落、事件广播、熔断、限流（56 项） | 否（mock） |
| `node tools/aicheck.js` | 前端/服务端契约、**客户端零密钥**（42 项） | 否 |
| `node tools/uiai.cjs` | jsdom 真跑前端：设置面板、思考提示、战报（25 项） | 否 |
| `node tools/diagllm.js deepseek high` | 固定局面 8 次单步，看耗时与失败原因 | 是 |
| `node tools/llmreal.js` | 真实 API + 完整一局（牌张守恒/技能异常） | 是 |
| `node tools/llmroom.js <base>` | 房间链路端到端（含线上冒烟） | 是 |

**成本**：单次决策约 150 prompt + 400~800 completion tokens；一局 2 人约 30 次调用 ≈ 每天几毛钱量级，放开给全班也在可控范围（配合 `LLM_RPM`）。
