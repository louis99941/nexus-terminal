import { z } from 'zod';
import { messageSchemaRegistry, SupportedMessageType } from './schemas';

/**
 * 快速预检：在 JSON.parse 之前用低成本字符串检查过滤无效消息
 * 所有合法消息都是 JSON 对象（以 `{` 开头），此检查可跳过明显无效的载荷
 *
 * @returns true 表示可能合法，false 表示一定非法
 */
export function isLikelyValidJson(raw: string): boolean {
  // 跳过前导空白，检查是否以 `{` 开头
  const len = raw.length;
  let i = 0;
  while (i < len && raw.charCodeAt(i) <= 32) i++;
  return i < len && raw.charCodeAt(i) === 123; // 123 === '{'
}

type ValidatedWebSocketMessage = {
  type: string;
  payload?: unknown;
  requestId?: string;
};

/**
 * WebSocket 消息校验结果
 */
export type ValidationResult =
  | {
      success: true;
      data: ValidatedWebSocketMessage;
    }
  | {
      success: false;
      error: string;
      errorDetails?: z.ZodIssue[];
    };

const toValidatedWebSocketMessage = (value: unknown): ValidatedWebSocketMessage | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.type !== 'string') {
    return null;
  }

  return {
    type: record.type,
    payload: record.payload,
    requestId: typeof record.requestId === 'string' ? record.requestId : undefined,
  };
};

/**
 * 统一的 WebSocket 消息校验函数
 *
 * @param message 原始消息对象（已 JSON 解析）
 * @returns 校验结果
 */
export function validateWebSocketMessage(message: unknown): ValidationResult {
  // 1. 基础结构校验：必须有 type 字段
  if (!message || typeof message !== 'object') {
    return {
      success: false,
      error: '消息格式错误：必须是有效的 JSON 对象',
    };
  }

  const record = message as Record<string, unknown>;
  const { type } = record;

  if (!type || typeof type !== 'string') {
    return {
      success: false,
      error: '消息格式错误：缺少有效的 type 字段',
    };
  }

  // 2. 检查消息类型是否被支持（使用 hasOwnProperty 避免原型污染）
  if (!Object.prototype.hasOwnProperty.call(messageSchemaRegistry, type)) {
    return {
      success: false,
      error: `不支持的消息类型: ${type}`,
    };
  }

  // 3. 获取对应的 Zod Schema 并校验
  const schema = messageSchemaRegistry[type as SupportedMessageType];

  try {
    const validatedData = schema.parse(message);
    const messageEnvelope = toValidatedWebSocketMessage(validatedData);
    if (!messageEnvelope) {
      return {
        success: false,
        error: '消息校验失败：缺少有效的 type 字段',
      };
    }

    return {
      success: true,
      data: messageEnvelope,
    };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      // 提取关键错误信息
      const errorMessages = error.issues.map((err: z.ZodIssue) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });

      return {
        success: false,
        error: `消息校验失败 (${type}): ${errorMessages.join('; ')}`,
        errorDetails: error.issues,
      };
    }

    return {
      success: false,
      error: `消息校验失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}
