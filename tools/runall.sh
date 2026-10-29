#!/usr/bin/env bash
# 全量离线门禁（dsh / 本地通用）：bash tools/runall.sh [--heavy|--list|--only 名字,...]
#   --light（默认）：结构 + 单技能矩阵 + 定向回归（不含长时间仿真）
#   --heavy        ：额外跑守恒/仿真/联机房间（sg020guard / newpacksim / starsim / simulate / roomcheck）
#   --list         ：只列出将要执行的脚本
# 输出：每个脚本一行「OK/FAIL 用时 名字 摘要」，最后汇总；有 FAIL 时退出码 1。
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
MODE=light
ONLY=""
if [ $# -gt 0 ]; then
  case "$1" in
    --heavy) MODE=heavy ;;
    --list) MODE=list ;;
    --only) MODE=light; ONLY="${2:-}" ;;
    *) MODE=light ;;
  esac
fi

LIGHT=(
  selfcheck.js
  skilllint.js
  skillcoverage.js
  skillmatrix.js
  skillaudit.js
  cardcons.js
  trigcheck.js
  turncheck.js
  rolecheck.js
  equipcheck.js
  equipfullcheck.js
  packcheck.js
  bodylimitcheck.js
  sgbaseline.js
  bugfix-check.js
  regression.js
  aicheck.js
  buchencheck.js
  clancheck.js
  clan2check.js
  customcheck.js
  fengcheck.js
  flashcheck.js
  huocheck.js
  jie2check.js
  jincheck.js
  jin2check.js
  jsgqicheck.js
  jsgchengcheck.js
  jsgzhuancheck.js
  jsghecheck.js
  leicheck.js
  lincheck.js
  mou5check.js
  narrativecheck.js
  newbatchcheck.js
  newcardcheck.js
  phase4check.js
  qunyingcheck.js
  qunying2check.js
  rare2check.js
  shancheck.js
  shen2check.js
  shenwucheck.js
  shenwu2check.js
  shiyoucheck.js
  sp4check.js
  starcheck.js
  weizhen2check.js
  xinghecheck.js
  xinghuocheck.js
  yhxcheck.js
  yincheck.js
  yj2011check.js
  yj2012check.js
  yj2013check.js
  yj2014check.js
  skillcheck_sg002.js
  skillcheck_sg004.js
)
HEAVY=(
  sg020guard.js
  newpacksim.js
  starsim.js
  simulate.js
  customsim.js
  roomcheck.js
)

if [ -n "$ONLY" ]; then
  IFS=',' read -r -a SEL <<< "$ONLY"
else
  SEL=("${LIGHT[@]}")
  [ "$MODE" = heavy ] && SEL+=("${HEAVY[@]}")
fi

if [ "$MODE" = list ]; then
  printf '%s\n' "${SEL[@]}"
  exit 0
fi

ok=0; bad=0; failed=()
printf '==== 全量门禁（%s）%s ====\n' "$MODE" "$(git rev-parse --short HEAD 2>/dev/null || echo 'no-git')"
for f in "${SEL[@]}"; do
  [ -f "tools/$f" ] || { printf 'SKIP  %-22s 不存在\n' "$f"; continue; }
  t0=$(date +%s)
  out=$(timeout 900 node "tools/$f" 2>&1)
  rc=$?
  dt=$(( $(date +%s) - t0 ))
  last=$(printf '%s\n' "$out" | grep -vE '^\s*$' | tail -1 | cut -c1-90)
  if [ $rc -eq 0 ]; then
    ok=$((ok+1)); printf 'OK    %-22s %3ss  %s\n' "$f" "$dt" "$last"
  else
    bad=$((bad+1)); failed+=("$f"); printf 'FAIL  %-22s %3ss  %s\n' "$f" "$dt" "$last"
    printf '%s\n' "$out" | grep -vE '^\s*$' | tail -25 | sed 's/^/        /'
  fi
done
printf '\n==== 汇总：OK %d / FAIL %d ====\n' "$ok" "$bad"
[ $bad -eq 0 ] || { printf '失败：%s\n' "${failed[*]}"; exit 1; }
