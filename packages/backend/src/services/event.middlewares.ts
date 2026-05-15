/**
 * 内置事件中间件
 * 提供日志记录和事件持久化功能
 */
import { logger } from '../utils/logger';
import { getDbInstance, runDb } from '../database/connection';
import {
  type AppEventPayload,
  type AppEventType,
  type EventMiddleware,
  PERSISTENT_EVENTS,
} from '../types/event.types';

// event_logs 清理配置
const CLEANUP_THRESHOLD = 200; // 每 200 次写入触发清理
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟间隔触发清理
const RETENTION_DAYS = 30; // 保留 30 天日志

let writeCount = 0;
let lastCleanupTime = Date.now();

/**
 * 清理过期的 event_logs 记录
 * 保留最近 RETENTION_DAYS 天的日志
 */
async function cleanupOldEventLogs(): Promise<void> {
  try {
    const db = await getDbInstance();
    const cutoffTime = Math.floor(Date.now() / 1000) - RETENTION_DAYS * 24 * 60 * 60;
    await runDb(db, 'DELETE FROM event_logs WHERE created_at < ?', [cutoffTime]);
    logger.debug('[EventPersistence] event_logs 清理完成');
  } catch (error) {
    logger.error('[EventPersistence] event_logs 清理失败:', error);
  }
}

/**
 * 日志中间件
 * 以 debug 级别记录事件触发信息，替代 emitEvent 中原有的 info 级别日志
 * 降低日志噪音，同时保留调试能力
 */
export const loggingMiddleware: EventMiddleware = (
  eventType: AppEventType,
  _payload: AppEventPayload,
  next: () => void
): void => {
  logger.debug(`[Event] ${eventType}`);
  next();
};

/**
 * 持久化中间件
 * 对 PERSISTENT_EVENTS 中的事件异步写入 event_logs 表
 * 采用 fire-and-forget 模式，不阻塞事件发送
 */
export const persistenceMiddleware: EventMiddleware = (
  eventType: AppEventType,
  payload: AppEventPayload,
  next: () => void
): void => {
  // 仅持久化关键事件
  if (!PERSISTENT_EVENTS.has(eventType)) {
    next();
    return;
  }

  // 先调用 next()，确保事件先发送给监听器
  next();

  // 异步持久化，不阻塞事件流
  persistEvent(eventType, payload).catch((error) => {
    logger.error(`[EventPersistence] 事件持久化失败: ${(error as Error).message}`, {
      eventType,
    });
  });
};

/**
 * 异步持久化事件到数据库
 * 序列化完整 payload（排除 timestamp，已在数据库列中存储）
 */
async function persistEvent(eventType: AppEventType, payload: AppEventPayload): Promise<void> {
  const db = await getDbInstance();
  const userId = payload.userId ?? null;

  let payloadJson: string;
  try {
    // 序列化完整 payload，排除 timestamp（已在 created_at 列存储）
    const { timestamp: _timestamp, ...rest } = payload;
    payloadJson = JSON.stringify(rest);
  } catch (error) {
    // 防止 JSON.stringify 因循环引用等原因失败
    logger.error('[EventPersistence] 事件 payload 序列化失败', {
      eventType,
      error: (error as Error)?.message,
    });
    // 回退：至少保存关键信息
    payloadJson = JSON.stringify({
      serializationError: (error as Error)?.message ?? 'UNKNOWN_ERROR',
      fallbackPayload: {
        userId: payload.userId ?? null,
        details: payload.details,
      },
    });
  }

  await new Promise<void>((resolve, reject) => {
    db.run(
      `INSERT INTO event_logs (event_type, user_id, payload) VALUES (?, ?, ?)`,
      [eventType, userId, payloadJson],
      (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // 概率清理：每 200 次写入或 5 分钟间隔触发清理
  writeCount++;
  if (writeCount >= CLEANUP_THRESHOLD || Date.now() - lastCleanupTime > CLEANUP_INTERVAL_MS) {
    writeCount = 0;
    lastCleanupTime = Date.now();
    cleanupOldEventLogs();
  }
}
