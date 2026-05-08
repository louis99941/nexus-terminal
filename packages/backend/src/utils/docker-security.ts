/**
 * Docker 安全工具函数
 * 提供容器 ID 净化和命令白名单校验，防止命令注入
 */

/** 合法的 Docker 命令动作 */
type DockerCommandAction = 'start' | 'stop' | 'restart' | 'remove';

const ALLOWED_DOCKER_COMMANDS: ReadonlySet<string> = new Set([
  'start',
  'stop',
  'restart',
  'remove',
]);

/**
 * 校验容器 ID，仅允许字母、数字、下划线、连字符。
 * 若包含任何其他字符则返回空字符串，由调用方拒绝该输入。
 * 使用严格匹配而非剥离，确保不会产生意外的安全缺口。
 */
export function sanitizeDockerContainerId(containerId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(containerId)) {
    return '';
  }
  return containerId;
}

/**
 * 校验 Docker 命令是否在白名单中
 */
export function isValidDockerCommand(command: string): command is DockerCommandAction {
  return ALLOWED_DOCKER_COMMANDS.has(command);
}
