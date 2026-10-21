#!/usr/bin/env bash
# 打包微信云托管「手动上传代码包」用的 zip：Dockerfile 在压缩包根目录（控制台「目标目录」留空）
# 包含当前工作区的代码（含未提交改动），排除规则与 .dockerignore 一致
# 用法：deploy/cloudrun-zip.sh  → deploy/.bundle/tire-cloudrun.zip
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy/.bundle/tire-cloudrun.zip"
mkdir -p "$(dirname "$OUT")" && rm -f "$OUT"

cd "$ROOT"
zip -qr "$OUT" \
  Dockerfile .dockerignore container.config.json package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc apps \
  -x '*/node_modules/*' '*/dist/*' '*.DS_Store' '*.local' \
     'apps/server/.env' 'apps/server/uploads/*' 'apps/server/prisma/*.db' 'apps/server/prisma/*.db-journal' \
     'apps/server/prisma/schema.mysql.prisma' 'apps/miniapp/project.private.config.json'

echo "==> $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | awk 'NR>3 && $4 !~ /\// {print "    " $4}' | grep -v '^    $' || true
