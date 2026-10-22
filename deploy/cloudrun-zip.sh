#!/usr/bin/env bash
# 打包微信云托管「手动上传代码包」用的 zip：Dockerfile 在压缩包根目录（控制台「目标目录」留空）
# 包含当前工作区的代码（含未提交改动），排除规则与 .dockerignore 一致
# 云托管对上传包的限制是 2 MiB，所以额外剔除构建用不到的模板文档与子目录 lockfile
# 用法：deploy/cloudrun-zip.sh  → deploy/.bundle/tire-cloudrun.zip
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy/.bundle/tire-cloudrun.zip"
LIMIT=$((2 * 1024 * 1024))
mkdir -p "$(dirname "$OUT")" && rm -f "$OUT"

cd "$ROOT"
# -9 最大压缩：源码与 lockfile 文本占比高，压得更狠
zip -qr9 "$OUT" \
  Dockerfile .dockerignore container.config.json package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc apps \
  -x '*/node_modules/*' '*/dist/*' '*.DS_Store' '*.local' \
     'apps/server/.env' 'apps/server/uploads/*' 'apps/server/prisma/*.db' 'apps/server/prisma/*.db-journal' \
     'apps/server/prisma/schema.mysql.prisma' 'apps/miniapp/project.private.config.json' \
     'apps/miniapp/.agents/*' 'apps/miniapp/.cursor/*' 'apps/miniapp/hermes/*' \
     'apps/miniapp/pnpm-lock.yaml' 'apps/admin/pnpm-lock.yaml'

SIZE=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")
echo "==> $OUT ($(du -h "$OUT" | cut -f1) / ${SIZE} bytes，上限 ${LIMIT} bytes)"
unzip -l "$OUT" | awk 'NR>3 && $4 !~ /\// {print "    " $4}' | grep -v '^    $' || true

if [ "$SIZE" -gt "$LIMIT" ]; then
  echo "!! 超过云托管 2 MiB 上传上限，控制台会拒绝上传，需继续瘦身" >&2
  exit 1
fi
echo "==> 体积校验通过（$(echo "scale=2; $SIZE * 100 / $LIMIT" | bc)% 上限）"
