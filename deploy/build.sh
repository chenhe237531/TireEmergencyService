#!/usr/bin/env bash
# 本地构建：管理端 + 小程序 H5 + API，打包到 deploy/.bundle（VPS 内存小，前端在本地构建）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/deploy/.bundle"

echo "==> 构建 API"
(cd "$ROOT/apps/server" && node prisma/db.js generate >/dev/null && npx nest build)

echo "==> 构建管理后台"
(cd "$ROOT/apps/admin" && pnpm build)

echo "==> 构建小程序 H5 版"
(cd "$ROOT/apps/miniapp" && pnpm build:h5)

echo "==> 组装部署包"
rm -rf "$BUNDLE" && mkdir -p "$BUNDLE/server" "$BUNDLE/admin" "$BUNDLE/miniapp/dist/build"
cp -R "$ROOT/apps/server/dist" "$ROOT/apps/server/src" "$ROOT/apps/server/prisma" "$BUNDLE/server/"
rm -f "$BUNDLE/server/prisma/"*.db "$BUNDLE/server/prisma/"*.db-journal "$BUNDLE/server/prisma/schema.mysql.prisma"
cp "$ROOT/apps/server/tsconfig.json" "$BUNDLE/server/"
node -e '
const p = require(process.argv[1]);
delete p.devDependencies["@nestjs/cli"];
require("fs").writeFileSync(process.argv[2], JSON.stringify(p, null, 2));
' "$ROOT/apps/server/package.json" "$BUNDLE/server/package.json"
cp -R "$ROOT/apps/admin/dist" "$BUNDLE/admin/dist"
cp -R "$ROOT/apps/miniapp/dist/build/h5" "$BUNDLE/miniapp/dist/build/h5"
cp "$ROOT/deploy/remote-setup.sh" "$ROOT/deploy/Dockerfile" "$ROOT/deploy/docker-compose.yml" "$ROOT/deploy/docker-entrypoint.sh" "$ROOT/deploy/.dockerignore" "$ROOT/deploy/nginx.conf" "$BUNDLE/"

# 部署包默认按 MySQL 构建：预生成 MySQL 版 Prisma Client，避免云托管冷启动时再 generate 一次
sed -i '' 's/^ARG DB_PROVIDER=sqlite$/ARG DB_PROVIDER=mysql/' "$BUNDLE/Dockerfile"

echo "==> 完成：$BUNDLE"
