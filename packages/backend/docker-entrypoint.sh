#!/bin/sh
# Nexus Terminal Backend - Docker Entrypoint
# 处理 volume 挂载后的目录权限问题

set -e

DATA_DIR="/app/data"
UPLOADS_DIR="${DATA_DIR}/uploads"
SESSIONS_DIR="${DATA_DIR}/sessions"
BACKGROUND_DIR="${DATA_DIR}/background"

echo "[entrypoint] 检查数据目录..."

# 创建必要的子目录（如果不存在）
mkdir -p "$UPLOADS_DIR" "$SESSIONS_DIR" "$BACKGROUND_DIR"

# 修复权限：确保 appuser 对数据目录有完全访问权限
chown -R appuser:appgroup "$DATA_DIR"

echo "[entrypoint] 目录权限已修复"

# 执行原始命令（使用 gosu 切换到 appuser）
exec gosu appuser "$@"
