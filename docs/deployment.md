# 部署教程

本指南帮助您快速部署 Nexus Terminal，从零开始搭建完整的远程管理平台。

## 前置要求

::: info 系统要求

- **操作系统**：Linux（推荐 Debian/Ubuntu）、macOS、Windows
- **Docker**：版本 20.10+
- **Docker Compose**：版本 2.0+
- **内存**：建议 2GB+（根据连接数量调整）
- **磁盘**：至少 1GB 可用空间
  :::

## 一键部署（推荐）

### 第一步：创建目录

```bash
mkdir nexus-terminal && cd nexus-terminal
```

### 第二步：下载配置文件

从 GitHub 仓库下载 `docker-compose.yml` 和 `.env` 配置文件：

```bash
wget https://raw.githubusercontent.com/Silentely/nexus-terminal/refs/heads/main/docker-compose.yml -O docker-compose.yml
wget https://raw.githubusercontent.com/Silentely/nexus-terminal/refs/heads/main/.env -O .env
```

::: warning 注意
当前默认镜像仓库为 GitHub Container Registry（GHCR），命名空间：`ghcr.io/silentely`
:::

### 第三步：启动服务

```bash
docker compose up -d
```

等待所有容器启动完成（首次启动需要拉取镜像，可能需要几分钟）。

### 第四步：访问服务

打开浏览器，访问：**http://your-server-ip:18111**

::: tip 提示
默认端口为 `18111`，可在 `.env` 文件中修改。
:::

## 环境变量配置

### 核心变量

编辑 `.env` 文件，配置以下关键变量：

```env
# 部署模式
DEPLOYMENT_MODE=docker

# 运行环境
NODE_ENV=production

# 应用名称
APP_NAME=Nexus Terminal

# 后端端口（容器内部）
PORT=3001
```

### 安全配置

```env
# 加密密钥（自动生成，首次启动时创建）
# 请勿手动修改，除非您知道自己在做什么
ENCRYPTION_KEY=

# 会话密钥（自动生成）
SESSION_SECRET=
```

### Passkey 认证（可选）

如果需要启用 Passkey 登录：

```env
# Passkey Relying Party ID（域名，不带协议）
RP_ID=your-domain.com

# Passkey Relying Party Origin（完整 URL）
RP_ORIGIN=https://your-domain.com
```

::: warning 安全提示

- `RP_ID` 应为您的域名（不带协议和端口）
- `RP_ORIGIN` 应为完整的 URL（包含协议）
- 启用 Passkey 后，确保 `/.well-known/webauthn` 可访问
  :::

### 通知配置（可选）

```env
# Webhook 通知
WEBHOOK_URL=https://your-webhook-url

# Telegram 通知
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
```

### Prometheus 监控（可选）

```env
# 启用 Prometheus 端点
ENABLE_METRICS=true
```

启用后可通过 `http://localhost:3001/api/v1/metrics` 访问指标数据。

## Nginx 反向代理配置

### 安装 Nginx

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### 配置反向代理

创建配置文件 `/etc/nginx/sites-available/nexus-terminal`：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书（Let's Encrypt）
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # 前端
    location / {
        proxy_pass http://127.0.0.1:18111;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket（SSH / Guacamole）
    location ~ ^/(ws|guacamole)/ {
        proxy_pass http://127.0.0.1:18111;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:18111;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 启用站点

```bash
sudo ln -s /etc/nginx/sites-available/nexus-terminal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 配置 SSL 证书（推荐）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加：0 12 * * * /usr/bin/certbot renew --quiet
```

## 更新与维护

### 更新到最新版本

```bash
cd nexus-terminal
docker compose down
docker compose pull
docker compose up -d
```

::: tip 零停机更新
`docker compose pull` 后再 `up -d`，会自动创建新容器替换旧容器。
:::

### 查看日志

```bash
# 所有容器
docker compose logs -f

# 特定容器
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f remote-gateway
```

### 重启服务

```bash
docker compose restart          # 全部
docker compose restart backend  # 单个
```

## 数据备份与恢复

### 备份数据

数据存储在 `./data` 目录（SQLite 数据库、会话、上传文件）：

```bash
docker compose stop backend
tar -czf nexus-terminal-backup-$(date +%Y%m%d).tar.gz data/
docker compose start backend
```

### 使用内置 API 备份

```bash
# 导出
curl -X GET http://localhost:18111/api/v1/backup/export \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o backup.json

# 导入
curl -X POST http://localhost:18111/api/v1/backup/import \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@backup.json"
```

### 恢复数据

```bash
docker compose stop backend
tar -xzf nexus-terminal-backup-20240101.tar.gz
docker compose start backend
```

## ARM 架构支持

### ARM64（aarch64）

完全支持，无需额外配置。`remote-gateway` 镜像已内嵌 guacd。

### ARMv7（armhf）

::: warning ARMv7 限制
Apache Guacamole 未提供 guacd 的 ARMv7 镜像，RDP 功能将被禁用。
:::

参考上方 Docker 部署章节中的详细说明。

## 健康检查

```bash
# 查看容器健康状态
docker compose ps

# 后端健康端点
curl -f http://localhost:18111/api/v1/health

# 前端
curl -f http://localhost:18111/

# Prometheus 指标（需启用）
curl http://localhost:18111/api/v1/metrics
```

## 常见部署问题

### 容器无法启动

```bash
docker compose logs backend          # 查看日志
sudo lsof -i:18111                   # 检查端口占用
cat .env                             # 检查环境变量
```

### WebSocket 连接失败

1. 检查 Nginx WebSocket 配置中 `Upgrade` 和 `Connection` 头
2. 确保防火墙允许 WebSocket 端口
3. 确认使用 HTTPS（浏览器限制非 HTTPS 下的剪贴板）

### 数据库锁定

```bash
docker compose down
sudo chown -R 1000:1000 data/
docker compose up -d
```

### 内存不足

1. 增加服务器内存
2. 调整 `docker-compose.yml` 中的内存限制
3. 减少并发连接数量

## 最佳实践

::: tip 生产环境建议

1. **使用 HTTPS**：浏览器限制非 HTTPS 环境下的终端复制功能
2. **配置防火墙**：仅开放必要端口（80/443）
3. **定期备份**：建议每日自动备份数据
4. **监控资源**：设置 CPU/内存/磁盘告警
5. **日志轮转**：配置 Docker 日志驱动限制日志大小
   :::
