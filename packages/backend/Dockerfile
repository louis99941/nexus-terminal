FROM node:20 AS builder

WORKDIR /app


# Copy root package files including the lock file
COPY package.json package-lock.json ./

# Copy workspace package.json files to ensure npm ci works correctly in monorepo
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/remote-gateway/package.json ./packages/remote-gateway/

# Install dependencies (using install instead of ci for potential armv7/alpine compatibility issues)
RUN npm install

COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/html-presets ./packages/backend/html-presets

RUN npm run build --workspace=@nexus-terminal/backend


FROM node:20-alpine

ENV NODE_ENV=production
# 设置 UTF-8 locale，解决中文文件名显示乱码问题
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Install build dependencies including setuptools for node-gyp, gosu for user switching
RUN apk add --no-cache --virtual .build-deps python3 py3-setuptools make g++ \
    && apk add --no-cache gosu

WORKDIR /app


COPY --from=builder /app/packages/backend/dist ./dist

COPY --from=builder /app/packages/backend/src/locales ./dist/locales
COPY --from=builder /app/packages/backend/html-presets ./html-presets

COPY packages/backend/package.json ./package.json
COPY package-lock.json ./package-lock.json
RUN npm install --omit=dev --prefer-offline


RUN apk del .build-deps

# 创建非 root 用户
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 复制 entrypoint 脚本
COPY packages/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/docker-entrypoint.sh"]

CMD ["node", "dist/index.js"]
