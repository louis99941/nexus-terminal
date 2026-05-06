import pino from 'pino';
import { redactSensitiveData } from '../logging/redaction';

// 环境感知配置（NODE_ENV 统一小写比较，避免大小写变体导致误判）
const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
const isProd = nodeEnv === 'production';
const isDev = !isProd;

// LOG_LEVEL 由 env.validator.ts 在启动时严格校验，此处直接使用
// dev 模式默认 debug（更详细的日志有助于开发调试），prod 模式默认 info
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
const pinoLogger = pino({
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

/**
 * 包装函数：在 pino 调用前执行脱敏
 * 保留 variadic 签名，兼容 logger.error(error, 'msg') 等现有调用模式
 * 对所有参数统一执行 redactSensitiveData
 */
function createLogger() {
  const wrap =
    (method: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (logRedact) {
        const redactedArgs = args.map((a) => redactSensitiveData(a));
        method(...redactedArgs);
      } else {
        method(...args);
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
