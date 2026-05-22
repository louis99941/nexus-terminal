#!/usr/bin/env node

/**
 * auto-changelog.js
 *
 * post-commit 钩子调用：当最近一次提交包含 VERSION 文件且版本号发生变更时，
 * 自动从提交信息中提取内容，生成 changelog 条目并 amend 回提交。
 *
 * 提交信息格式：<emoji> <type>(<scope>): <描述>
 * 生成条目格式参考 docs/changelog.md 现有条目。
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'VERSION');
const CHANGELOG_FILE = path.join(ROOT, 'docs', 'changelog.md');

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim();
}

// conventional commit type → changelog 分类标题
const TYPE_MAP = {
  feat: '新增',
  fix: '修复',
  docs: '文档',
  style: '样式',
  refactor: '重构',
  perf: '性能',
  test: '测试',
  build: '构建',
  ci: 'CI',
  chore: '杂项',
  revert: '回退',
  security: '安全',
  release: '发布',
};

function main() {
  // 防重入：git commit --amend 会再次触发 post-commit 钩子
  if (process.env.AUTO_CHANGELOG_RUNNING === '1') {
    process.exit(0);
  }

  // 1. 检查最近一次提交是否包含 VERSION 文件
  const files = git('diff-tree --no-commit-id --name-only -r HEAD');
  if (!files.split('\n').includes('VERSION')) {
    process.exit(0);
  }

  // 2. 对比版本号
  let newVersion;
  try {
    newVersion = git('show HEAD:VERSION').trim();
  } catch {
    process.exit(0);
  }

  let oldVersion;
  try {
    oldVersion = git('show HEAD~1:VERSION').trim();
  } catch {
    oldVersion = '';
  }

  if (newVersion === oldVersion) {
    process.exit(0);
  }

  console.log(`[auto-changelog] 检测到版本变更: ${oldVersion || '(无)'} → ${newVersion}`);

  // 3. 读取提交信息
  const commitMsg = git('log -1 --pretty=%B HEAD');

  // 解析 conventional commit 格式: <emoji> <type>(<scope>): <description>
  const match = commitMsg.match(
    /^[\p{Emoji_Presentation}\p{Extended_Pictographic}️‍⃣\s]+\s+(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/u,
  );
  const type = match ? match[1] : 'chore';
  const scope = match ? match[2] : '';
  const description = match ? match[3].trim() : commitMsg.split('\n')[0].trim();

  const category = TYPE_MAP[type] || '其他';
  const scopeTag = scope ? `（${scope}）` : '';

  // 4. 读取现有 changelog
  let changelog = '';
  if (fs.existsSync(CHANGELOG_FILE)) {
    changelog = fs.readFileSync(CHANGELOG_FILE, 'utf8');
  }

  // 5. 构建条目：检查是否已有该版本的条目（支持追加）
  const versionHeader = `## v${newVersion}`;
  const today = new Date().toISOString().slice(0, 10);

  if (changelog.includes(versionHeader)) {
    // 已有该版本条目，在对应分类下追加，或新建分类
    const categoryHeader = `### ${category}`;
    const newLine = `- ${description}${scopeTag}`;

    if (changelog.includes(categoryHeader)) {
      // 在该分类标题后插入一行（在下一个 ### 或 ## 之前）
      const catIdx = changelog.indexOf(categoryHeader);
      const afterCat = changelog.slice(catIdx + categoryHeader.length);
      const nextSection = afterCat.search(/\n### |\n## /);
      if (nextSection !== -1) {
        const insertPos = catIdx + categoryHeader.length + nextSection;
        changelog = changelog.slice(0, insertPos) + '\n' + newLine + changelog.slice(insertPos);
      } else {
        changelog += '\n' + newLine + '\n';
      }
    } else {
      // 新建分类，插入到版本块末尾
      const versionIdx = changelog.indexOf(versionHeader);
      const afterVersion = changelog.slice(versionIdx);
      const nextVersion = afterVersion.search(/\n## /);
      if (nextVersion !== -1) {
        const insertPos = versionIdx + nextVersion;
        changelog =
          changelog.slice(0, insertPos) +
          `\n### ${category}\n\n${newLine}\n` +
          changelog.slice(insertPos);
      } else {
        changelog += `\n### ${category}\n\n${newLine}\n`;
      }
    }
  } else {
    // 新版本条目
    const newEntry = `${versionHeader}（${today}）\n\n### ${category}\n\n- ${description}${scopeTag}\n\n`;
    const headerMatch = changelog.match(/^(# 更新日志[^\n]*\n)/);
    if (headerMatch) {
      const header = headerMatch[1];
      const rest = changelog.slice(header.length);
      changelog = header + newEntry + rest;
    } else {
      changelog = `# 更新日志\n\n${newEntry}` + changelog;
    }
  }

  // 6. 写入 changelog
  fs.writeFileSync(CHANGELOG_FILE, changelog, 'utf8');
  console.log(`[auto-changelog] 已更新 ${CHANGELOG_FILE}`);

  // 7. amend 提交，包含 changelog 变更
  // 设置环境变量防止 amend 触发的 post-commit 递归执行
  process.env.AUTO_CHANGELOG_RUNNING = '1';
  git('add docs/changelog.md');
  git('commit --amend --no-edit');
  console.log('[auto-changelog] 已将 changelog 变更 amend 到当前提交');
}

main();
