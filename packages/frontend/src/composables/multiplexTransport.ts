/**
 * WebSocket 多路复用传输层（前端）
 * 单例模式管理共享 WebSocket 连接，支持多个逻辑通道
 *
 * 设计思路：
 * - 单例模式：全局共享一个物理 WebSocket 连接
 * - 逻辑通道：每个 SSH 会话对应一个逻辑通道
 * - 自动重连：物理连接断开时自动重连，重连后重建所有活跃通道
 * - 通道隔离：每个通道独立维护连接状态和消息处理
 */

import { ref, readonly } from 'vue';
import type { ConnectionStatus, WebSocketMessage, MessagePayload } from '../types/websocket.types';
import { parseWebSocketMessage } from './useWebSocketConnection/messageParser';
import { createReconnectManager } from './useWebSocketConnection/reconnect';
import { log } from '@/utils/log';

/** 逻辑通道状态 */
export interface ChannelState {
  sid: string;
  dbConnectionId: string;
  connectionStatus: ConnectionStatus;
  statusMessage: string;
  isSftpReady: boolean;
  messageHandlers: Map<string, Set<(payload: MessagePayload, message: WebSocketMessage) => void>>;
  isResumeFlow: boolean;
}

/** 通道控制接口 */
export interface MultiplexChannel {
  sid: string;
  connectionStatus: ReturnType<typeof readonly>;
  statusMessage: ReturnType<typeof readonly>;
  isSftpReady: ReturnType<typeof readonly>;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: WebSocketMessage) => void;
  onMessage: (
    type: string,
    handler: (payload: MessagePayload, message: WebSocketMessage) => void
  ) => () => void;
}

/** 传输层状态 */
const ws = ref<WebSocket | null>(null);
const isConnecting = ref(false);
const channels = new Map<string, ChannelState>();
const reconnectManager = createReconnectManager({ maxAttempts: 5 });

/**
 * 构建 WebSocket URL
 */
function buildWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/`;
}

/**
 * 向物理连接发送消息
 */
function sendRawMessage(message: object): void {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    try {
      ws.value.send(JSON.stringify(message));
    } catch (error) {
      log.error('[MultiplexTransport] 发送消息失败:', error);
    }
  }
}

/**
 * 向指定通道发送消息
 */
function sendToChannel(sid: string, message: WebSocketMessage): void {
  const messageWithSid = { ...message, sid };
  sendRawMessage(messageWithSid);
}

/**
 * 分发消息到对应通道
 */
function dispatchToChannel(message: WebSocketMessage): void {
  // 提取消息中的 sid（服务端响应会携带 sid）
  const sid = (message as Record<string, unknown>).sid as string | undefined;
  if (!sid) {
    log.warn('[MultiplexTransport] 收到无 sid 的消息，忽略');
    return;
  }

  const channel = channels.get(sid);
  if (!channel) {
    log.warn(`[MultiplexTransport] 收到未知通道 ${sid} 的消息`);
    return;
  }

  // 更新通道状态
  if (message.type === 'ssh:connected') {
    channel.connectionStatus = 'connected';
    channel.statusMessage = '已连接';
  } else if (message.type === 'ssh:disconnected') {
    channel.connectionStatus = 'disconnected';
    channel.statusMessage = typeof message.payload === 'string' ? message.payload : '已断开';
    channel.isSftpReady = false;
  } else if (message.type === 'ssh:error' || message.type === 'error') {
    channel.connectionStatus = 'error';
    channel.statusMessage = typeof message.payload === 'string' ? message.payload : '错误';
    channel.isSftpReady = false;
  } else if (message.type === 'sftp_ready') {
    channel.isSftpReady = true;
  }

  // 分发到注册的处理器
  const handlers = channel.messageHandlers.get(message.type);
  if (handlers) {
    handlers.forEach((handler) => {
      try {
        handler(message.payload, message);
      } catch (error) {
        log.error(`[MultiplexTransport] 通道 ${sid} 消息处理器错误:`, error);
      }
    });
  }
}

/**
 * 建立物理连接
 */
function connectPhysical(): void {
  if (
    ws.value &&
    (ws.value.readyState === WebSocket.OPEN || ws.value.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const url = buildWsUrl();
  let secureUrl = url;
  if (window.location.protocol === 'https:') {
    secureUrl = url.replace(/^ws:/, 'wss:');
  }

  // 添加多路复用协议头
  ws.value = new WebSocket(secureUrl, 'nexus-mux');
  isConnecting.value = true;

  ws.value.onopen = () => {
    isConnecting.value = false;
    reconnectManager.reset();
    log.info('[MultiplexTransport] 物理连接已建立');

    // 通知所有通道物理连接已就绪
    channels.forEach((channel, sid) => {
      if (channel.connectionStatus === 'disconnected' || channel.connectionStatus === 'error') {
        // 重新发送 ssh:connect 请求
        sendToChannel(sid, {
          type: 'ssh:connect',
          payload: { connectionId: parseInt(channel.dbConnectionId, 10) },
        });
      }
    });
  };

  ws.value.onmessage = (event: MessageEvent) => {
    const message = parseWebSocketMessage(event.data);
    if (message) {
      dispatchToChannel(message);
    }
  };

  ws.value.onerror = () => {
    isConnecting.value = false;
    log.error('[MultiplexTransport] 物理连接错误');
  };

  ws.value.onclose = (event) => {
    isConnecting.value = false;
    ws.value = null;

    // 通知所有通道物理连接已断开
    channels.forEach((_ch, sid) => {
      const ch = channels.get(sid);
      if (ch) {
        ch.connectionStatus = 'disconnected';
        ch.isSftpReady = false;
      }
    });

    // 自动重连
    if (!reconnectManager.state.intentionalDisconnect && event.code !== 1000) {
      scheduleReconnect();
    }
  };
}

/**
 * 安排重连
 */
function scheduleReconnect(): void {
  if (!reconnectManager.shouldReconnect()) {
    log.warn('[MultiplexTransport] 重连次数已达上限');
    return;
  }

  const delay = reconnectManager.getBackoffDelay(reconnectManager.incrementAttempts());
  reconnectManager.scheduleTimer(() => connectPhysical(), delay);
}

/**
 * 创建逻辑通道
 * @param sid 会话 ID
 * @param dbConnectionId 数据库连接 ID
 * @param options 可选参数
 * @returns 通道控制接口
 */
export function createChannel(
  sid: string,
  dbConnectionId: string,
  options?: { isResumeFlow?: boolean }
): MultiplexChannel {
  if (channels.has(sid)) {
    log.warn(`[MultiplexTransport] 通道 ${sid} 已存在，将覆盖`);
  }

  const channelState: ChannelState = {
    sid,
    dbConnectionId,
    connectionStatus: 'connecting',
    statusMessage: '正在连接...',
    isSftpReady: false,
    messageHandlers: new Map(),
    isResumeFlow: options?.isResumeFlow ?? false,
  };

  channels.set(sid, channelState);

  // 如果物理连接未建立，先建立连接
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
    connectPhysical();
  } else {
    // 物理连接已就绪，直接发送 ssh:connect
    if (!channelState.isResumeFlow) {
      sendToChannel(sid, {
        type: 'ssh:connect',
        payload: { connectionId: parseInt(dbConnectionId, 10) },
      });
    } else {
      channelState.connectionStatus = 'connected';
    }
  }

  // 返回通道控制接口
  return {
    sid,
    connectionStatus: readonly(ref(channelState.connectionStatus)),
    statusMessage: readonly(ref(channelState.statusMessage)),
    isSftpReady: readonly(ref(channelState.isSftpReady)),

    connect: () => {
      if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
        connectPhysical();
      } else if (!channelState.isResumeFlow) {
        sendToChannel(sid, {
          type: 'ssh:connect',
          payload: { connectionId: parseInt(dbConnectionId, 10) },
        });
      }
    },

    disconnect: () => {
      channels.delete(sid);
      log.debug(`[MultiplexTransport] 通道 ${sid} 已断开`);
    },

    sendMessage: (message: WebSocketMessage) => {
      sendToChannel(sid, message);
    },

    onMessage: (
      type: string,
      handler: (payload: MessagePayload, message: WebSocketMessage) => void
    ) => {
      let handlers = channelState.messageHandlers.get(type);
      if (!handlers) {
        handlers = new Set();
        channelState.messageHandlers.set(type, handlers);
      }
      handlers.add(handler);

      return () => {
        const handlers = channelState.messageHandlers.get(type);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            channelState.messageHandlers.delete(type);
          }
        }
      };
    },
  };
}

/**
 * 获取当前活跃通道数
 */
export function getChannelCount(): number {
  return channels.size;
}

/**
 * 检查物理连接状态
 */
export function isConnected(): boolean {
  return ws.value?.readyState === WebSocket.OPEN;
}

/**
 * 手动关闭物理连接
 */
export function disconnectAll(): void {
  reconnectManager.state.intentionalDisconnect = true;
  reconnectManager.clearTimer();

  if (ws.value) {
    ws.value.close(1000, '客户端主动断开');
    ws.value = null;
  }

  channels.forEach((_ch, sid) => {
    const ch = channels.get(sid);
    if (ch) {
      ch.connectionStatus = 'disconnected';
    }
  });
  channels.clear();
}
