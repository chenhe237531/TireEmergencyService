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
  ADMIN_PASSWORD=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)
  cat > tire.env <<ENV
PORT=$PORT
JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=$ADMIN_PASSWORD
# 生产默认不写演示门店/工单；需要演示数据时改为 1
SEED_DEMO=0
# 生产默认关闭演示登录；配置 WX_APPID/WX_SECRET 后走真实微信登录
ALLOW_DEMO_LOGIN=0
ENV
  chmod 600 tire.env
  echo "==> 已生成初始管理员密码，保存在 $APP_DIR/tire.env 的 INITIAL_ADMIN_PASSWORD"
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
  curl -fsS "http://127.0.0.1:$PORT/api/v1/app/faqs" >/dev/null 2>&1 && break
  sleep 2
done
docker compose ps
curl -fsS -o /dev/null -w "==> 健康检查 /api/v1/app/faqs -> %{http_code}\n" "http://127.0.0.1:$PORT/api/v1/app/faqs"
