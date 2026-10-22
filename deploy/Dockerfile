# 小蚂蚁 · 轮胎救援平台 · 运行镜像
# 前端（管理后台、小程序 H5）在本地构建后随部署包上传；镜像内只安装 API 依赖（VPS 内存小，不在服务器上构建前端）
# 数据库开关：sqlite（默认，数据在 /data 卷）/ mysql（微信云托管，连接见 apps/server/prisma/db-env.js）
# 构建参数只决定预先生成哪种 Prisma Client；运行时改 DB_PROVIDER 也可以，容器启动时会自动重新生成
FROM node:22-bookworm-slim
ARG DB_PROVIDER=sqlite

ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    WEB_ROOT=/app \
    PORT=3000 \
    DB_PROVIDER=${DB_PROVIDER} \
    DATABASE_URL=file:/data/tire.db

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package.json ./
RUN npm install --include=dev --no-audit --no-fund --loglevel=error

COPY server/prisma ./prisma
RUN node prisma/db.js generate

COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/dist ./dist
COPY admin/dist /app/admin/dist
COPY miniapp/dist/build/h5 /app/miniapp/dist/build/h5
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# 使用专用 uid 10001（避免与宿主机已有用户 uid 1000 重叠）
# Prisma Client 目录与 prisma 目录对运行用户可写：运行时切换 DB_PROVIDER 时需要重新生成
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data && chown -R 10001:10001 /data node_modules/.prisma prisma

ENV HOME=/tmp
USER 10001:10001
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/app/faqs').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
