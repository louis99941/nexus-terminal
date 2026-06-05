/**
 * 日志上下文中间件
 * 通过 AsyncLocalStorage 实现跨 HTTP/WebSocket/SSH/SFTP 的统一日志上下文传播
 * 为每个请求/连接自动注入 requestId、userId、protocol 等字段到所有日志
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * 日志上下文接口
 * 定义可自动注入到每条日志的字段
 */
export interface LogContext {
  /** 请求级唯一标识（由 request-logger 中间件生成） */
  requestId?: string;
  /** 分布式追踪 ID（预留，供未来集成 OpenTelemetry） */
  traceId?: string;
  /** 当前认证用户 ID */
  userId?: number;
  /** 当前认证用户名 */
  username?: string;
  /** WebSocket 会话 ID */
  sessionId?: string;
  /** 数据库连接 ID */
  connectionId?: number;
  /** 当前操作的协议类型 */
  protocol?: 'ssh' | 'sftp' | 'rdp' | 'vnc' | 'telnet' | 'http';
}

/**
 * 全局日志上下文存储
 * 每个异步调用链拥有独立的上下文副本，互不干扰
 */
export const logContext = new AsyncLocalStorage<LogContext>();

/**
 * 在指定日志上下文中执行异步函数
 * 支持嵌套调用：子上下文继承父上下文字段，同名字段覆盖
 *
 * @param ctx - 本次要注入的日志上下文字段
 * @param fn  - 要在该上下文中执行的函数
 * @returns fn 的返回值
 *
 * @example
 * // HTTP 请求中间件中注入 requestId
 * withLogContext({ requestId }, () => next());
 *
 * // SSH 连接建立时追加 connectionId 和 protocol
 * withLogContext({ connectionId, protocol: 'ssh' }, () => handleSshConnect(...));
 */
export function withLogContext<T>(ctx: LogContext, fn: () => T): T {
  const parent = logContext.getStore() ?? {};
  // 过滤 undefined 值，避免覆盖父上下文中的有效属性
  const cleanCtx = Object.fromEntries(Object.entries(ctx).filter(([_, v]) => v !== undefined));
  return logContext.run({ ...parent, ...cleanCtx }, fn);
}

/**
 * 获取当前异步调用链的日志上下文
 * 在无上下文的调用链中返回空对象（安全降级）
 */
export function getLogContext(): LogContext {
  return logContext.getStore() ?? {};
}
