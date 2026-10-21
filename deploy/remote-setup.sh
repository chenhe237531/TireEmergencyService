#!/usr/bin/env bash
# 在 VPS 上执行（root）：用 Docker Compose 构建并运行（restart: unless-stopped，开机随 Docker 自启）
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/tire}"
PORT="${PORT:-3000}"
cd "$APP_DIR"

command -v docker >/dev/null 2>&1 || { echo "请先安装 Docker（含 compose 插件）"; exit 1; }
mkdir -p data

# 环境变量文件（首次生成，之后保留）
if [ ! -f tire.env ]; then
  cat > tire.env <<ENV
PORT=$PORT
JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
ENV
  chmod 600 tire.env
fi

# 早期版本把 SQLite 放在 server/prisma 下：搬到持久卷，避免重新部署丢数据
if [ ! -f data/tire.db ] && [ -f server/prisma/tire.db ]; then
  echo "==> 迁移已有数据库到 data/"
  cp server/prisma/tire.db data/tire.db
fi

if [ "${RESEED:-0}" = "1" ]; then
  echo "==> 重置演示数据"
  rm -f data/tire.db data/tire.db-journal
fi
chown -R root:root "$APP_DIR" && chown -R 10001:10001 data

echo "==> 构建镜像并启动容器"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null 2>&1 || true

for i in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/api/v1/faqs" >/dev/null 2>&1 && break
  sleep 2
done
docker compose ps
curl -fsS -o /dev/null -w "==> 健康检查 /api/v1/faqs -> %{http_code}\n" "http://127.0.0.1:$PORT/api/v1/faqs"
