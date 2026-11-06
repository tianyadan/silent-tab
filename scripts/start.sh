#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="background"
if [ "${1:-}" = "--foreground" ]; then
  MODE="foreground"
elif [ -n "${1:-}" ]; then
  echo "用法：$0 [--foreground]" >&2
  exit 2
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${SILENT_TAB_TOKEN:-}" ]; then
  if command -v openssl >/dev/null 2>&1; then
    SILENT_TAB_TOKEN="$(openssl rand -hex 32)"
  else
    SILENT_TAB_TOKEN="$(date +%s)-silent-tab-local-token"
  fi
  export SILENT_TAB_TOKEN

  # 首次启动时持久化 Token，避免后台服务重启后扩展凭据失效。
  if [ ! -f .env ]; then
    printf '%s\n' \
      'SILENT_TAB_ADDR=127.0.0.1:8765' \
      "SILENT_TAB_TOKEN=$SILENT_TAB_TOKEN" \
      'SILENT_TAB_ALLOWED_DOMAINS=localhost,127.0.0.1,chatgpt.com,chat.openai.com' \
      'SILENT_TAB_ALLOW_REMOTE=0' > .env
  else
    printf '\nSILENT_TAB_TOKEN=%s\n' "$SILENT_TAB_TOKEN" >> .env
  fi
fi

export SILENT_TAB_ADDR="${SILENT_TAB_ADDR:-127.0.0.1:8765}"
export SILENT_TAB_ALLOWED_DOMAINS="${SILENT_TAB_ALLOWED_DOMAINS:-localhost,127.0.0.1,chatgpt.com,chat.openai.com}"
export SILENT_TAB_ALLOW_REMOTE="${SILENT_TAB_ALLOW_REMOTE:-0}"

./scripts/build-extension.sh
mkdir -p bin
go build -o bin/silent-tab ./cmd/silent-tab

echo ""
echo "Silent Tab Token（粘贴到扩展设置）：$SILENT_TAB_TOKEN"
echo "Chrome 加载目录：$(pwd)/dist/extension"
echo "服务地址：http://$SILENT_TAB_ADDR"
echo ""

if [ "$MODE" = "foreground" ]; then
  exec ./bin/silent-tab
fi

mkdir -p logs run
PID_FILE="run/silent-tab.pid"
LOG_FILE="logs/silent-tab.log"

if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(sed -n '1p' "$PID_FILE")"
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "Silent Tab 已在后台运行，PID：$EXISTING_PID"
    echo "日志：$(pwd)/$LOG_FILE"
    exit 0
  fi
fi

nohup ./bin/silent-tab >> "$LOG_FILE" 2>&1 &
SERVICE_PID=$!
printf '%s\n' "$SERVICE_PID" > "$PID_FILE"

# 等待服务真正监听端口，避免只报告进程创建成功。
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if ! kill -0 "$SERVICE_PID" 2>/dev/null; then
    echo "Silent Tab 后台进程启动失败，请查看：$(pwd)/$LOG_FILE" >&2
    tail -n 20 "$LOG_FILE" >&2 || true
    exit 1
  fi
  if curl -fsS "http://$SILENT_TAB_ADDR/healthz" >/dev/null 2>&1; then
    echo "Silent Tab 已在后台启动，PID：$SERVICE_PID"
    echo "日志：$(pwd)/$LOG_FILE"
    echo "PID 文件：$(pwd)/$PID_FILE"
    exit 0
  fi
  sleep 0.25
done

echo "Silent Tab 启动超时，请查看：$(pwd)/$LOG_FILE" >&2
exit 1
