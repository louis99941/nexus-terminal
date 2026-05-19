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

# Install build dependencies including setuptools for node-gyp
RUN apk add --no-cache --virtual .build-deps python3 py3-setuptools make g++

WORKDIR /app


COPY --from=builder /app/packages/backend/dist ./dist

COPY --from=builder /app/packages/backend/src/locales ./dist/locales
COPY --from=builder /app/packages/backend/html-presets ./html-presets

COPY packages/backend/package.json ./package.json
COPY package-lock.json ./package-lock.json
RUN npm install --omit=dev --prefer-offline


RUN apk del .build-deps

# 创建数据目录并设置非 root 用户权限
RUN mkdir -p /app/data /app/data/sessions /app/data/background /app/data/uploads \
    && addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app/data

USER appuser

EXPOSE 3001


CMD ["node", "dist/index.js"]
