# 常见问题

## 部署相关

### 为什么选择 Docker 部署？

- **一键部署** — 无需手动安装依赖
- **环境隔离** — 避免与系统其他服务冲突
- **易于维护** — 更新和回滚简单
- **跨平台** — 支持 Linux、macOS、Windows

### 最低系统要求是什么？

| 资源 | 最低要求      | 推荐配置     |
| ---- | ------------- | ------------ |
| CPU  | 1 核          | 2 核+        |
| 内存 | 1GB           | 2GB+         |
| 磁盘 | 1GB           | 5GB+         |
| 系统 | Docker 20.10+ | Docker 24.0+ |

### 如何修改默认端口 18111？

编辑 `.env` 和 `docker-compose.yml`：

```env
FRONTEND_PORT=8080
```

```yaml
frontend:
  ports:
    - '8080:80'
```

### 可以不用 Docker 部署吗？

可以，参考本地开发方式：

```bash
npm install
cd packages/backend && npm run dev
cd packages/frontend && npm run dev
cd packages/remote-gateway && npm run dev
```

## 连接问题

### SSH 连接失败怎么办？

1. 确认服务器地址和端口正确
2. 确认用户名和密码/密钥正确
3. 确认服务器防火墙允许 SSH 连接
4. 查看后端日志：`docker compose logs backend | grep ssh`

### RDP/VNC 连接黑屏？

- **Guacd 未启动** — 检查 remote-gateway 容器日志
- **协议不支持** — 确认远程服务器开启了 RDP/VNC
- **网络问题** — 确认 Guacd 端口可达

### WebSocket 连接频繁断开？

调整心跳配置：

```env
HEARTBEAT_INTERVAL_DESKTOP=15000
MAX_MISSED_PONGS_DESKTOP=5
```

### 移动端无法复制终端内容？

浏览器安全策略限制，非 HTTPS 环境下无法使用剪贴板。解决方案：

1. 配置 HTTPS（推荐）
2. 使用 localhost 访问（仅限开发环境）

## 数据相关

### 数据存储在哪里？

所有数据存储在 `./data` 目录：

```
data/
├── nexus-terminal.db    # SQLite 数据库
└── sessions/            # 会话文件
```

### 如何备份数据？

```bash
docker compose stop backend
tar -czf backup.tar.gz data/
docker compose start backend
```

### 如何恢复数据？

```bash
docker compose stop backend
tar -xzf backup.tar.gz
docker compose start backend
```

## 安全相关

### 如何启用 HTTPS？

推荐使用 Nginx + Let's Encrypt：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 如何配置 IP 白名单？

通过应用界面：设置 → 安全 → IP 白名单 → 添加 IP 地址。

### Passkey 登录失败？

检查以下配置：

1. `RP_ID` 和 `RP_ORIGIN` 是否正确
2. 访问地址是否与 `RP_ORIGIN` 匹配
3. 是否使用 HTTPS（Passkey 要求）
4. `/.well-known/webauthn` 是否可访问

```bash
curl https://your-domain.com/.well-known/webauthn
```

## 性能相关

### 如何支持更多并发连接？

1. 增加服务器资源（CPU、内存）
2. 调整系统参数：`sudo sysctl -w net.core.somaxconn=65535`
3. 调整容器内存限制

### 终端响应慢？

- **网络延迟** — 检查服务器到目标机器的网络
- **服务器负载** — 检查远程服务器负载
- **浏览器性能** — 尝试减少终端标签页数量

### 数据库锁定错误？

```bash
docker compose down
sqlite3 data/nexus-terminal.db ".tables"
docker compose up -d
```

## 更新相关

### 如何更新到最新版本？

```bash
cd nexus-terminal
docker compose down
docker compose pull
docker compose up -d
```

### 更新会丢失数据吗？

不会。数据存储在挂载的 `./data` 目录，更新镜像不影响数据。

### 如何回滚到旧版本？

修改 `docker-compose.yml` 中的镜像标签：

```yaml
services:
  backend:
    image: ghcr.io/silentely/nexus-terminal-backend:v1.0.0
```

然后 `docker compose up -d`。

## 开发相关

### 如何贡献代码？

1. Fork 项目
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改
4. 创建 Pull Request

### 如何运行测试？

```bash
npm test                 # 所有测试
npm run test:backend     # 后端测试
npm run test:frontend    # 前端测试
npm run test:coverage    # 覆盖率报告
```

## 其他

### 项目支持哪些协议？

| 协议 | 状态     | 说明                |
| ---- | -------- | ------------------- |
| SSH  | 完全支持 | 终端连接            |
| SFTP | 完全支持 | 文件传输            |
| RDP  | 完全支持 | Windows 远程桌面    |
| VNC  | 完全支持 | Unix/Linux 图形桌面 |

### 有移动端 App 吗？

目前没有原生 App，但 Web 界面完美适配移动端浏览器，支持触控操作和手势控制。

### 如何获取帮助？

- [GitHub Issues](https://github.com/Silentely/nexus-terminal/issues) — 报告 Bug 或请求功能
- [GitHub Discussions](https://github.com/Silentely/nexus-terminal/discussions) — 提问和讨论
