# 小蚂蚁 · 轮胎救援平台 · 微信云托管镜像
# 云托管从代码仓库直接构建：本文件在仓库根目录，构建目录为仓库根目录（服务设置里 Dockerfile 路径填 Dockerfile、目标目录留空）。
# 镜像内包含 API + 管理后台（/）+ 小程序 H5 版（/h5/），默认连接云托管 MySQL。
# VPS（Docker Compose + SQLite）部署仍使用 deploy/Dockerfile，二者互不影响。

# ───────────── 构建 ─────────────
FROM node:22-bookworm-slim AS build
ARG NPM_REGISTRY=https://registry.npmmirror.com/
ENV CI=true \
    COREPACK_NPM_REGISTRY=${NPM_REGISTRY} \
    PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

WORKDIR /src
# 先只拷依赖清单，源码改动不会让依赖层缓存失效
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/admin/package.json apps/admin/
COPY apps/miniapp/package.json apps/miniapp/
RUN pnpm config set registry ${NPM_REGISTRY} && pnpm install --frozen-lockfile

COPY apps ./apps
# 构建时生成 MySQL 版 Prisma Client（不需要连接数据库）
RUN cd apps/server && DB_PROVIDER=mysql node prisma/db.js generate && pnpm build
RUN pnpm --filter tire-admin build
RUN pnpm --filter tire-miniapp build:h5
# 独立的 API 运行目录（按 lockfile 安装，含 prisma / ts-node：启动时建表、空库写入演示数据要用）
RUN pnpm --filter tire-server deploy --legacy /out/server \
 && cd /out/server && DB_PROVIDER=mysql node prisma/db.js generate

# ───────────── 运行 ─────────────
FROM node:22-bookworm-slim
ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    WEB_ROOT=/app \
    PORT=80 \
    DB_PROVIDER=mysql \
    HOME=/tmp
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY --from=build /out/server ./
COPY --from=build /src/apps/server/dist ./dist
COPY --from=build /src/apps/admin/dist /app/admin/dist
COPY --from=build /src/apps/miniapp/dist/build/h5 /app/miniapp/dist/build/h5

# 云托管默认容器端口 80（服务设置里的「端口」要与 PORT 一致）
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||80)+'/api/v1/faqs').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 启动：同步表结构（多实例时加锁串行）→ 空库写入演示数据 → 启动 API
CMD ["sh", "-c", "node prisma/db.js init && exec node dist/main.js"]
