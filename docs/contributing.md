# 贡献指南

感谢您对 Nexus Terminal 的关注！本文档将帮助您快速参与到项目开发中。

## 开发环境要求

| 依赖    | 最低版本 | 推荐版本 | 说明                              |
| ------- | -------- | -------- | --------------------------------- |
| Node.js | 18.0     | 20 LTS   | 运行时                            |
| npm     | 8.0      | 10+      | 包管理（项目使用 npm workspaces） |
| Git     | 2.30     | 最新     | 版本控制                          |
| Docker  | 20.10    | 24.0+    | 可选，用于容器化部署测试          |

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/<your-username>/nexus-terminal.git
cd nexus-terminal

# 安装所有子包依赖（npm workspaces）
npm install
```

### Git Hooks 说明

项目使用 Husky 管理 Git hooks，安装依赖后会自动配置：

- **pre-commit**：运行 lint-staged（eslint --fix + prettier --write），然后执行 quality:check（类型检查 + lint 零 warning + 格式检查）
- **commit-msg**：Commitlint 校验提交消息格式（必须符合 Conventional Commits + 中文 subject + 可选 Emoji）

如需临时跳过 pre-commit 质量检查：

```bash
SKIP_PRECOMMIT_QUALITY=1 git commit -m "✨ feat(scope): 示例"
```

### 测试命令

```bash
npm test                 # 全部测试
npm run test:backend     # 后端测试
npm run test:frontend    # 前端测试
npm run test:coverage    # 覆盖率报告
npm run typecheck:frontend  # 前端类型检查
npm run typecheck:backend   # 后端类型检查
npm run lint             # 代码检查
```

## 参与方式

### 报告 Bug

在 [GitHub Issues](https://github.com/Silentely/nexus-terminal/issues) 中提交 Bug 报告，请包含：

- 操作系统和浏览器版本
- Nexus Terminal 版本
- 复现步骤
- 预期行为和实际行为
- 相关日志或截图

### 请求功能

在 [GitHub Discussions](https://github.com/Silentely/nexus-terminal/discussions) 中提出功能建议，描述：

- 使用场景和痛点
- 期望的交互方式
- 是否有类似的替代方案

### 提交代码

#### 1. Fork 并克隆

```bash
git clone https://github.com/<your-username>/nexus-terminal.git
cd nexus-terminal
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 创建功能分支

```bash
git checkout -b feature/your-feature
```

分支命名规范：

- `feature/xxx` — 新功能
- `fix/xxx` — Bug 修复
- `docs/xxx` — 文档更新
- `refactor/xxx` — 代码重构
- `test/xxx` — 测试补充

#### 4. 本地开发

```bash
# 后端
cd packages/backend && npm run dev

# 前端
cd packages/frontend && npm run dev

# 网关（如需 RDP/VNC）
cd packages/remote-gateway && npm run dev
```

#### 5. 运行测试

```bash
npm test                 # 全部测试
npm run test:backend     # 后端测试
npm run test:frontend    # 前端测试
npm run test:coverage    # 覆盖率报告
```

#### 6. 提交 PR

```bash
git add .
git commit -m "feat: 描述你的改动"
git push origin feature/your-feature
```

然后在 GitHub 上创建 Pull Request。

## 代码规范

### 提交信息

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>
```

类型：

| 类型       | 说明                   |
| ---------- | ---------------------- |
| `feat`     | 新功能                 |
| `fix`      | Bug 修复               |
| `docs`     | 文档更新               |
| `style`    | 代码格式（不影响功能） |
| `refactor` | 重构                   |
| `test`     | 测试                   |
| `chore`    | 构建/工具变更          |

示例：

```
feat(terminal): 添加终端搜索功能
fix(auth): 修复 Passkey 登录超时问题
docs: 更新部署文档中的 Nginx 配置
```

### 代码风格

- 使用 TypeScript 严格模式
- 文件名：`kebab-case`
- 类名/接口：`PascalCase`
- 变量/函数：`camelCase`
- 常量：`UPPER_SNAKE_CASE`
- 注释语言：简体中文

### 测试要求

- 新功能必须包含单元测试
- 测试文件与被测文件同目录，命名 `*.test.ts`
- 覆盖率要求：

| 模块类型   | 行覆盖率 | 分支覆盖率 |
| ---------- | -------- | ---------- |
| Service    | >=80%    | >=70%      |
| Controller | >=70%    | >=60%      |
| Repository | >=60%    | >=50%      |
| Utils      | >=90%    | >=80%      |
| Store      | >=80%    | >=70%      |
| Component  | >=60%    | >=50%      |

## 项目结构

```
nexus-terminal/
├── packages/
│   ├── backend/          # Express + SQLite + SSH2
│   ├── frontend/         # Vue 3 + Vite + Pinia
│   └── remote-gateway/   # Guacamole Lite
└── docs/                 # VitePress 文档站 + 技术文档
    ├── configuration/    # 配置文档（CORS、Docker、环境变量）
    ├── deployment/       # 部署文档（Nginx、CDN）
    ├── contributing/     # 贡献指南
    ├── technical/        # 技术文档（技术债务报告）
    └── guide/            # 用户指南
```

## 获取帮助

- [GitHub Issues](https://github.com/Silentely/nexus-terminal/issues) — Bug 报告和功能请求
- [GitHub Discussions](https://github.com/Silentely/nexus-terminal/discussions) — 提问和讨论
