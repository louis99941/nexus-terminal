# 监控与告警

Nexus Terminal 内置 Prometheus 指标采集，配合 Grafana 和 Prometheus 告警规则，可以监控系统健康、连接性能和安全事件。

## 启用 Prometheus 指标

在 `.env` 或 `docker-compose.yml` 中设置：

```dotenv
ENABLE_METRICS=true
METRICS_TOKEN=your-secret-token
```

重启后验证指标是否正常暴露：

```bash
# 生产环境（需要鉴权头）
curl -H "X-Metrics-Token: your-secret-token" https://your-domain.com/api/v1/metrics

# 开发环境（无需鉴权）
curl http://localhost:3001/api/v1/metrics
```

## 可用指标

| 指标名称                        | 类型      | 标签                       | 说明                                 |
| ------------------------------- | --------- | -------------------------- | ------------------------------------ |
| `http_request_duration_seconds` | Histogram | method, route, status_code | HTTP 请求延迟分布                    |
| `websocket_active_connections`  | Gauge     | —                          | 当前活跃 WebSocket 连接数            |
| `ssh_active_sessions`           | Gauge     | —                          | 当前活跃 SSH 会话数                  |
| `ssh_connect_duration_seconds`  | Histogram | status                     | SSH 连接建立耗时（success/failure）  |
| `ssh_pool_connections`          | Gauge     | —                          | SSH 连接池连接数                     |
| `sftp_transferred_bytes_total`  | Counter   | direction                  | SFTP 传输字节数（upload/download）   |
| `auth_failures_total`           | Counter   | method                     | 认证失败次数（password/passkey/2fa） |

## 配置 Grafana Dashboard

导入预置的 Dashboard 模板：

1. 打开 Grafana，进入 **Dashboards → Import**
2. 上传 `docs/monitoring/grafana-dashboard.json`
3. 选择你的 Prometheus 数据源
4. 点击 **Import** 完成导入

Dashboard 包含以下面板：

- **HTTP 请求延迟 P95** — 监控 API 响应性能
- **活跃连接数** — WebSocket/SSH/连接池实时状态
- **SSH 连接耗时分布** — 热力图展示连接延迟
- **认证失败次数** — 安全事件监控
- **SFTP 传输速率** — 文件传输性能
- **Node.js 内存使用** — 堆内存健康状态

## 配置告警规则

将告警规则导入 Prometheus 或 Grafana Alerting：

### Prometheus 方式

复制 `docs/monitoring/alert-rules.yml` 到 Prometheus 的 rules 目录，然后在 `prometheus.yml` 中引用：

```yaml
rule_files:
  - 'rules/nexus-terminal-alerts.yml'
```

### Grafana Alerting 方式

1. 打开 Grafana，进入 **Alerting → Alert rules**
2. 点击 **Import rule**
3. 上传 `docs/monitoring/alert-rules.yml` 文件

### 告警规则说明

| 告警名称                 | 触发条件                 | 严重级别 | 含义                 |
| ------------------------ | ------------------------ | -------- | -------------------- |
| HighAuthFailureRate      | 5 分钟内认证失败 > 20 次 | warning  | 可能存在暴力破解攻击 |
| SshConnectLatencyHigh    | SSH 连接 P95 > 10 秒     | warning  | 网络或资源瓶颈       |
| WebSocketConnectionsHigh | WebSocket 连接 > 500     | warning  | 需关注资源使用       |
| HighMemoryUsage          | 堆内存使用率 > 85%       | critical | 可能存在内存泄漏     |
| HighHttp5xxRate          | 5xx 错误占比 > 10%       | critical | 服务可能存在严重问题 |

## 环境变量参考

| 变量名           | 默认值 | 说明                                 |
| ---------------- | ------ | ------------------------------------ |
| `ENABLE_METRICS` | false  | 启用 Prometheus 指标端点             |
| `METRICS_TOKEN`  | —      | 指标端点访问令牌（生产环境必须设置） |

## 安全建议

- 生产环境**必须设置** `METRICS_TOKEN`，防止公网暴露指标数据
- 指标端点不包含敏感信息（用户名、IP、会话 ID 等均不作为标签）
- 告警阈值根据实际业务量调整，避免误报
