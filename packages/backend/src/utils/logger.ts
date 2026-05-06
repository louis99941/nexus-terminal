import pino from 'pino';
import { redactSensitiveData } from '../logging/redaction';

// 环境感知配置（NODE_ENV 统一小写比较，避免大小写变体导致误判）
const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const isDev = !isProd && !isTest;

// LOG_LEVEL 由 env.validator.ts 在启动时严格校验，此处直接使用
// dev 模式默认 debug，test/prod 模式默认 info
const logLevel = (process.env.LOG_LEVEL || (isDev ? 'debug' : 'info')).toLowerCase();

const logPretty =
  process.env.LOG_PRETTY === 'true' || (isDev && process.env.LOG_PRETTY !== 'false');
const logRedact = process.env.LOG_REDACT !== 'false'; // 默认开启脱敏

// 自定义 timestamp：支持 LOG_TZ 环境变量
const customTimestamp = () => {
  const tz = process.env.LOG_TZ || process.env.TZ || 'UTC';
  const time = new Date();
  try {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `,"time":"${formatter.format(time)}.${String(time.getMilliseconds()).padStart(3, '0')}"`;
  } catch {
    // 时区无效时回退到 UTC
    return `,"time":"${time.toISOString()}"`;
  }
};

/**
 * 基于 pino 的结构化 JSON 日志实例
 * - dev 模式：pino-pretty 彩色格式化输出
 * - prod 模式：JSON 静默输出
 * - 通过 LOG_LEVEL / LOG_PRETTY / LOG_REDACT / LOG_TZ 环境变量控制
 * - 支持运行时通过 setLogLevel() 动态调整
 * - 所有日志参数经 redactSensitiveData 脱敏处理
 */
let pinoLogger: pino.Logger;
try {
  pinoLogger = pino({
    level: logLevel,
    timestamp: customTimestamp,
    // NODE_ENV=production 时强制忽略 LOG_PRETTY，避免生产镜像缺少 pino-pretty 导致崩溃
    transport:
      logPretty && !isProd
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  });
} catch {
  // LOG_LEVEL 非法值（如 verbose）会导致 pino 崩溃，回退到 info 级别
  pinoLogger = pino({ level: 'info', timestamp: customTimestamp });
}

/**
 * 包装函数：在 pino 调用前执行脱敏 + 参数归一化
 *
 * pino 的结构化日志要求 Error 对象放在 merge 对象的 err 属性中：
 *   logger.error({ err }, 'message')  ← 正确，Error 被序列化
 *   logger.error('message', err)      ← 丢失堆栈，err 不被序列化
 *
 * 但大量业务代码使用 Node.js 回调风格 logger.error('msg', err)，
 * 因此在 wrapper 层做自动归一化：当第一个参数是字符串、最后一个参数是 Error 时，
 * 重组为 pino 期望的 mergeObject + message 格式。
 */
function createLogger() {
  const wrap =
    (method: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      let normalizedArgs = args;

      // 归一化：logger.error('msg', err) → logger.error({ err }, 'msg')
      if (args.length >= 2 && typeof args[0] === 'string') {
        const lastArg = args[args.length - 1];
        if (lastArg instanceof Error) {
          const mergeObj: Record<string, unknown> = { err: lastArg };
          // 中间参数作为额外 merge 字段（如 logger.error('msg', err, { extra: 1 })）
          for (let i = 1; i < args.length - 1; i++) {
            const arg = args[i];
            if (arg !== null && typeof arg === 'object' && !(arg instanceof Error)) {
              Object.assign(mergeObj, arg);
            }
          }
          normalizedArgs = [mergeObj, args[0]];
        }
      }

      if (logRedact) {
        const redactedArgs = normalizedArgs.map((a) => redactSensitiveData(a));
        method(...redactedArgs);
      } else {
        method(...normalizedArgs);
      }
    };

  return {
    info: wrap(pinoLogger.info.bind(pinoLogger)),
    warn: wrap(pinoLogger.warn.bind(pinoLogger)),
    error: wrap(pinoLogger.error.bind(pinoLogger)),
    debug: wrap(pinoLogger.debug.bind(pinoLogger)),
  };
}

/**
 * 运行时动态调整 pino 日志级别
 * 与 logging/logger.ts 的 setLogLevel 保持同步，
 * 确保通过 API 修改日志等级后，使用 utils/logger 的模块也能立即响应。
 *
 * @param level 目标日志级别
 */
export const setLogLevel = (level: string): void => {
  pinoLogger.level = level;
};

/**
 * 获取当前 pino 日志级别
 */
export const getLogLevel = (): string => pinoLogger.level;

/**
 * 统一日志工具
 * 导出 info / warn / error / debug 四个方法，可在任意模块中直接引用。
 *
 * 使用示例：
 *   import { logger } from '../utils/logger';
 *   logger.info('服务启动完成');
 *   logger.warn({ port }, '端口已被占用');
 *   logger.error(err, '数据库连接失败');
 *   logger.debug({ query }, '执行 SQL 查询');
 */
export const logger = createLogger();
