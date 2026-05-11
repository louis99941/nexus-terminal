# 更新日志

本页面记录 Nexus Terminal 的重要版本更新和变更。

## v1.2.0（开发中）

### 新增

- 文档站点 agent-readiness 支持（robots.txt、sitemap.xml、API 目录发现）
- MCP Server Card 和 Agent Skills 发现端点
- RFC 8288 Link 响应头支持

### 修复

- 修复 PR #43 审查发现的 5 项连接问题
- 修复 SSH/RDP/VNC 连接功能的多个安全与健壮性问题
- 修复数据备份导出功能并增强 UX
- 修复数据备份导入的字段映射与回滚统计
- 修复 AI 助手第三方 API 测试连接失败（system 角色兼容性）

### 优化

- 测试覆盖率大幅提升 + 技术债务报告重构
- AI 助手设置页面优化 — Endpoint 下拉选择器与默认模型更新
- 优化发布工作流的变更日志生成逻辑

### 文档

- 新增 VitePress 文档站点
- 精简文档结构，新增设计文档模板
- 更新 README 中英文文档

## v1.1.0

### 新增

- Passkey（WebAuthn）无密码认证支持
- 数据备份导入/导出功能
- Prometheus 指标监控端点
- IP 地理位置查询
- Telegram 通知支持

### 修复

- 修复多个 WebSocket 连接稳定性问题
- 修复 SFTP 文件传输中断恢复
- 修复移动端触控操作兼容性

### 优化

- 终端性能优化，减少渲染延迟
- Docker 镜像体积优化
- ARM 架构支持（ARM64 完全支持）

## v1.0.0

### 首个正式版本

- SSH 终端（基于 Xterm.js）
- SFTP 文件管理（双面板布局）
- RDP 远程桌面（基于 Guacamole）
- VNC 远程桌面
- 多标签页管理
- 会话挂起与恢复
- 用户认证系统（密码 + TOTP 2FA）
- 审计日志
- 通知系统（Webhook / Email）
- Docker Compose 一键部署
- 100+ iTerm2 终端主题
- 移动端适配
- AI 智能助手（基础版）
- 批量命令执行
- 快速命令模板
