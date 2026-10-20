#!/usr/bin/env bash
# 在 VPS 上执行（root）：用 Docker Compose 构建并运行（restart: unless-stopped，开机随 Docker 自启）
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/xueji}"
PORT="${PORT:-3000}"
cd "$APP_DIR"

command -v docker >/dev/null 2>&1 || { echo "请先安装 Docker（含 compose 插件）"; exit 1; }
mkdir -p data

# 环境变量文件（首次生成，之后保留）
if [ ! -f xueji.env ]; then
  cat > xueji.env <<ENV
PORT=$PORT
JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
ENV
  chmod 600 xueji.env
fi

# 从旧的 systemd 部署迁移：保留已有数据库，停用旧服务
if [ ! -f data/xueji.db ] && [ -f server/prisma/xueji.db ]; then
  echo "==> 迁移已有数据库到 data/"
  systemctl stop xueji 2>/dev/null || true
  cp server/prisma/xueji.db data/xueji.db
fi
if systemctl list-unit-files xueji.service >/dev/null 2>&1 && [ -f /etc/systemd/system/xueji.service ]; then
  echo "==> 停用旧的 systemd 服务（已改为 Docker 运行）"
  systemctl disable --now xueji 2>/dev/null || true
  rm -f /etc/systemd/system/xueji.service && systemctl daemon-reload
  rm -rf runtime server/node_modules server/prisma/xueji.db server/prisma/xueji.db-journal server/.env
fi

if [ "${RESEED:-0}" = "1" ]; then
  echo "==> 重置演示数据"
  rm -f data/xueji.db data/xueji.db-journal
fi
chown -R root:root "$APP_DIR" && chown -R 10001:10001 data

echo "==> 构建镜像并启动容器"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null 2>&1 || true

for i in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/api/v1/app/about" >/dev/null 2>&1 && break
  sleep 2
done
if [ "${SYNC_CONFIG:-0}" = "1" ] && [ "${RESEED:-0}" != "1" ]; then
  echo "==> 同步配置数据（保留客户与业务数据），先备份数据库"
  cp data/xueji.db "data/xueji.db.bak-$(date +%Y%m%d%H%M%S)"
  docker compose exec -T xueji node prisma/db.js sync-config
  docker compose restart xueji
  for i in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:$PORT/api/v1/app/about" >/dev/null 2>&1 && break
    sleep 2
  done
fi
docker compose ps
curl -fsS -o /dev/null -w "==> 健康检查 /api/v1/app/about -> %{http_code}\n" "http://127.0.0.1:$PORT/api/v1/app/about"
