#!/bin/sh
# 每次启动同步表结构；库为空（首次启动或 RESEED 后）时写入演示数据。
# SQLite 数据保存在 /data 卷中；MySQL（DB_PROVIDER=mysql）连接见 prisma/db-env.js
set -e
cd /app/server
# 建表 + 空库灌种子数据。表结构稳定后可在控制台设 SKIP_DB_PUSH=1，省掉每次冷启动的建表耗时
if [ "${SKIP_DB_PUSH:-0}" = "1" ]; then
  echo "[xueji] SKIP_DB_PUSH=1，跳过建表"
else
  node prisma/db.js init
fi
exec node dist/main.js
