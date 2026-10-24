# 三国杀 · 在线对战（sanguosha-online）

服务端权威的三国杀网页版，零第三方依赖（Node 20 + 原生 ESM + HTTP/SSE），支持多人在线房间与 AI 托管。

## 六种模式

| 模式 | 人数 | 说明 |
|---|---|---|
| 身份场·标准 | 2–8 | 主公 / 忠臣 / 反贼 / 内奸，标准牌堆 108 张 |
| 身份场·军争 | 2–8 | 加入军争篇（酒 / 火攻 / 铁索 / 兵粮 / 藤甲 / 白银狮子…） |
| 1v1 单挑 | 2 | 先手少摸一张 |
| 斗地主 | 3 | 地主体力 +1、摸三张 |
| 国战 | 4–8 | 按势力结盟，消灭其他势力 |
| 虎牢关 | 2–4 | PVE，联手对抗 8 体力吕布 |

## 武将

- 标准包 25 将（技能全部实现）
- 界限突破 25 将、谋 10 将、神 12 将、极 5 将（技能逐步补全，未实现时自动回退到标准同名技能）

## 本地运行

```bash
node src/server/index.js          # 默认 http://127.0.0.1:8030
npm test                          # = node tools/selfcheck.js
```

`selfcheck.js` 会跑：牌堆数量、武将技能全注册、七种模式 AI 对 AI 完整对局、快照手牌可见性。

## 目录

```
src/engine/    引擎（状态机 / 牌效果 / 技能分发 / 随机数）
src/data/      牌堆与武将数据
src/skills/    技能实现（standard / jie / mou / shen / ji）
src/modes/     六种模式规则
src/ai/        AI 决策
src/server/    HTTP + SSE 服务、房间
client/        前端（无构建）
tools/         自检、部署、dsh 调度
inbox/         dsh 任务单
```

## 协作（dsh）

任务单在 `inbox/`，规则在 `AGENTS.md` 与 `.dsh/skills/sanguosha/SKILL.md`，接法见 `tools/dsh-scheduler/README.md`。

## 部署

服务器：`/opt/sanguosha`，由主站 nginx 以 `/sanguo/` 子路径反代（SSE 已关 buffering）。

```bash
bash tools/deploy/deploy.sh          # 上传 + 重启 + 健康检查
```
