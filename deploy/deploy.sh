#!/usr/bin/env bash
# 一键部署：本地构建 → 上传 → 远程 docker compose 构建并运行
# 用法：deploy/deploy.sh root@<服务器地址> [ssh 端口]
# 重置演示数据（清空全部数据）：RESEED=1 deploy/deploy.sh ...
set -euo pipefail
HOST="${1:?用法：deploy/deploy.sh user@host [port]}"
SSH_PORT="${2:-22}"
APP_DIR="${APP_DIR:-/opt/tire}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

[ "${SKIP_BUILD:-0}" = "1" ] || "$ROOT/deploy/build.sh"
echo "==> 上传到 $HOST:$APP_DIR"
ssh -p "$SSH_PORT" "$HOST" "mkdir -p $APP_DIR"
rsync -az --no-owner --no-group --delete -e "ssh -p $SSH_PORT" \
  --exclude 'data/' --exclude 'tire.env' --exclude 'runtime/' --exclude 'server/node_modules/' \
  --exclude 'server/prisma/tire.db' --exclude 'server/prisma/tire.db-journal' --exclude 'server/.env' \
  "$ROOT/deploy/.bundle/" "$HOST:$APP_DIR/"
ssh -p "$SSH_PORT" "$HOST" "APP_DIR=$APP_DIR RESEED=${RESEED:-0} bash $APP_DIR/remote-setup.sh"
