# ---------- 阶段 1:构建前端 ----------
FROM node:20-bookworm-slim AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- 阶段 2:构建后端 ----------
FROM node:20-bookworm-slim AS server-build
# better-sqlite3 优先使用预编译二进制;下载不可用时回退源码编译,故备好工具链
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---------- 阶段 3:运行时 ----------
FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/app/data/vinyl.db \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=server-build /build/server/node_modules ./node_modules
COPY --from=server-build /build/server/dist ./dist
COPY --from=client-build /build/client/dist ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
