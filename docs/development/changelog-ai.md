# AI 自动化版本日志生成

> 使用 AI 自动分析 git 历史生成高质量 changelog 条目

---

## 工作原理

### 本地自动生成（post-commit）

当 `VERSION` 文件变更时，`post-commit` 钩子自动触发 `scripts/auto-changelog.js`，完成以下流程：

```
VERSION 变更 → 收集 commits + diff → AI 分析 → 写入 changelog.md → amend 提交
```

**多级降级策略**：
1. 尝试本地 Claude CLI（无需 API Key）
2. 尝试 OpenAI 兼容 API（需配置环境变量）
3. 静默跳过，不修改 changelog（由 CI 工作流保底）

### CI 保底生成（release.yml）

当 GitHub Actions 发布流程检测到 changelog 缺失时，自动调用 OpenAI 兼容 API 生成：

```
tag 推送 → kittylog.app 未找到 → AI 生成（兜底）→ 写入 & 发布
```

---

## 本地配置

### 方案 1：使用 Claude CLI（推荐）

**安装 Claude CLI**：
```bash
# macOS / Linux
brew install anthropics/claude/claude

# 或直接下载
# https://github.com/anthropics/claude-cli
```

**验证**：
```bash
claude --version
# 输出版本号即表示安装成功
```

**自定义路径**（可选）：
```bash
# 如果 Claude CLI 不在 PATH 中，可通过环境变量指定
export CLAUDE_CLI_PATH=/path/to/claude
```

### 方案 2：使用 OpenAI 兼容 API

**配置环境变量**：

```bash
# .env 或 ~/.bashrc / ~/.zshrc
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx
export OPENAI_MODEL=gpt-4o                # 可选，默认 gpt-4o
export CHANGELOG_AI_TIMEOUT=90000         # 可选，AI 调用超时时间（毫秒，默认 90000）
```

**兼容的 API 提供商**：
- OpenAI 官方 API
- Azure OpenAI
- 各类 OpenAI 兼容网关（如 LiteLLM、One API）

### 跳过本地生成

如果不想使用 AI 生成，可以设置环境变量跳过：

```bash
export SKIP_AUTO_CHANGELOG=1
```

或直接移除 `.husky/post-commit` 中的自动触发逻辑。

### Dry-run 模式（测试预览）

查看 AI 生成效果但不修改文件：

```bash
DRY_RUN=1 node scripts/auto-changelog.js
```

输出生成的 changelog 内容，但不写入文件、不 amend 提交。

### 强制重新生成历史版本

如果某个版本的 changelog 质量不佳，可以强制重新生成：

```bash
AUTO_CHANGELOG_FORCE_VERSION=1.5.4 node scripts/auto-changelog.js
```

会删除现有 v1.5.4 条目并重新生成（需手动 commit）。

---

## CI 配置

### GitHub Actions Secrets

在仓库设置中配置以下 Secrets（用于 CI 保底生成）：

| Secret 名称 | 说明 | 必填 |
|-------------|------|------|
| `OPENAI_BASE_URL` | OpenAI 兼容 API 地址 | ❌ 默认 `https://api.openai.com/v1` |
| `OPENAI_API_KEY` | API Key | ✅ |
| `OPENAI_MODEL` | 模型名称 | ❌ 默认 `gpt-4o` |

**配置路径**：
```
GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret
```

**测试验证**：
```bash
# 查看 CI 工作流日志，确认 AI 调用是否成功
# Actions → 最近一次 release 工作流 → "AI 生成更新日志（兜底）"步骤
```

---

## 生成效果示例

**输入（git commits）**：
```
f1b29b46 🐛 fix: 修复 OutputEnhancerAddon 清理顺序
f16a5871 ♻️ refactor: 重构终端背景透明样式选择器
0ec30999 ✨ feat: 终端背景渲染条件优化
```

**输出（AI 生成的 changelog）**：
```markdown
## v1.5.5（2026-06-10）

### 新增

- ✨ 终端背景渲染条件优化 — 避免空背景渲染导致全黑问题

### 修复

- 🐛 修复 OutputEnhancerAddon 清理顺序并启用 allowProposedApi 支持 Unicode11Addon

### 改进

- ♻️ 重构终端背景透明样式选择器以适配新的组件层级结构
```

**特点**：
- 自动按类型分组（新增、修复、改进、安全、测试、文档、杂项）
- 合并同一功能的多个 commit
- 使用面向用户的中文描述
- 保持与历史格式一致的 emoji 映射

---

## 故障排查

### 本地生成失败

**症状**：提交后 changelog 未更新

**排查步骤**：

1. **检查是否触发**：
   ```bash
   # 查看 post-commit 钩子输出
   # 应该看到 "[auto-changelog] 检测到版本变更: x.x.x → y.y.y"
   ```

2. **检查 Claude CLI**：
   ```bash
   claude --version
   # 如果提示 "command not found"，说明 Claude CLI 未安装或不在 PATH
   ```

3. **检查 OpenAI API**：
   ```bash
   echo $OPENAI_API_KEY
   # 如果为空，且 Claude CLI 不可用，会跳过本地生成
   ```

4. **查看详细日志**：
   ```bash
   # auto-changelog.js 会输出详细的降级过程
   # "[auto-changelog] 尝试 Claude CLI..."
   # "[auto-changelog] Claude CLI 调用失败，尝试 OpenAI API..."
   # "[auto-changelog] 所有 AI 调用均失败，跳过 changelog 自动生成"
   ```

### CI 保底生成失败

**症状**：Release 页面显示"暂无更新日志内容"

**排查步骤**：

1. **检查 Secrets 配置**：
   ```
   Settings → Secrets and variables → Actions
   # 确认 OPENAI_API_KEY 已配置
   ```

2. **查看工作流日志**：
   ```
   Actions → release → "AI 生成更新日志（兜底）"步骤
   # 查看是否有 API 调用错误
   ```

3. **常见错误**：
   - `⚠️ 未配置 OPENAI_API_KEY`：Secrets 未配置或名称错误
   - `⚠️ OpenAI API 响应异常: 401`：API Key 无效
   - `⚠️ OpenAI API 响应异常: 429`：API 配额不足
   - `⚠️ 无法找到上个版本标签`：首次发布，无历史版本对比

---

## 手动生成

如果自动生成失败，可以手动调用脚本：

```bash
# 进入项目根目录
cd /path/to/nexus-terminal

# 手动触发（会自动检测 VERSION 变更）
node scripts/auto-changelog.js

# 或通过环境变量强制生成指定版本
AUTO_CHANGELOG_FORCE_VERSION=1.5.5 node scripts/auto-changelog.js
```

---

## 高级配置

### 自定义提示词

修改 `scripts/auto-changelog.js` 中的 `buildPrompt` 函数，调整 AI 生成规则：

```javascript
function buildPrompt(version, commits, diffStat, keyDiff, today) {
  // 自定义提示词逻辑
  return `你是 Nexus Terminal 项目的技术文档工程师...`;
}
```

### 调整超时时间

```javascript
// auto-changelog.js 第 195 行
const timeoutId = setTimeout(() => controller.abort(), 90_000); // 默认 90 秒
```

### 禁用防重入机制

```bash
# 临时禁用（用于调试）
unset AUTO_CHANGELOG_RUNNING
node scripts/auto-changelog.js
```

---

## 最佳实践

1. **优先使用 Claude CLI**：无需 API Key，响应快，成本低
2. **OpenAI API 作为备用**：确保 CI 保底生成可用
3. **定期检查 API 配额**：避免 CI 构建失败
4. **人工审查 AI 生成内容**：AI 生成后建议人工快速审查，确保准确性
5. **保持 commit message 规范**：使用 Conventional Commits 格式，提升 AI 分析质量

---

## 相关文档

- [Conventional Commits 规范](../contributing/commit.md)
- [版本发布流程](../deployment.md)
