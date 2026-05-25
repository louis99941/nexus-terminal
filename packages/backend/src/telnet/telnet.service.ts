/**
 * Telnet 连接服务
 * 管理 Telnet 连接生命周期：连接、数据传输、窗口大小协商、断开
 */

import * as net from 'net';
import { logger } from '../utils/logger';
import { TelnetNegotiator } from './telnet-negotiation';
import type { TelnetSocketState } from './telnet.types';

export interface TelnetServiceOptions {
  host: string;
  port: number;
  timeout?: number; // 连接超时（毫秒），默认 10000
}

export interface TelnetConnectResult {
  success: boolean;
  socket?: net.Socket;
  negotiator?: TelnetNegotiator;
  error?: string;
}

export class TelnetService {
  private socket: net.Socket | null = null;
  private negotiator: TelnetNegotiator;
  private state: TelnetSocketState = 'disconnected';
  private readonly options: TelnetServiceOptions;

  constructor(options: TelnetServiceOptions) {
    this.options = options;
    this.negotiator = new TelnetNegotiator();
  }

  /**
   * 建立 Telnet 连接
   */
  connect(): Promise<TelnetConnectResult> {
    return new Promise((resolve) => {
      const { host, port, timeout = 10000 } = this.options;

      logger.info({ host, port }, '正在建立 Telnet 连接');

      this.socket = net.createConnection({ host, port }, () => {
        this.state = 'connected';
        logger.info({ host, port }, 'Telnet 连接已建立');

        const socket = this.socket;
        if (socket) {
          resolve({
            success: true,
            socket,
            negotiator: this.negotiator,
          });
        } else {
          resolve({
            success: false,
            error: 'Socket 创建失败',
          });
        }
      });

      this.socket.setTimeout(timeout);

      this.socket.on('timeout', () => {
        this.state = 'error';
        logger.error({ host, port }, 'Telnet 连接超时');
        this.socket?.destroy();
        resolve({
          success: false,
          error: '连接超时',
        });
      });

      this.socket.on('error', (err) => {
        this.state = 'error';
        logger.error({ host, port, error: err.message }, 'Telnet 连接错误');
        resolve({
          success: false,
          error: err.message,
        });
      });

      this.socket.on('close', () => {
        this.state = 'disconnected';
        logger.info({ host, port }, 'Telnet 连接已关闭');
      });

      this.socket.on('end', () => {
        this.state = 'disconnected';
        logger.info({ host, port }, 'Telnet 连接结束');
      });
    });
  }

  /**
   * 发送数据到 Telnet 服务器
   */
  write(data: string | Buffer): boolean {
    if (!this.socket || this.state !== 'connected') {
      logger.warn('Telnet socket 未就绪，无法发送数据');
      return false;
    }

    try {
      this.socket.write(data);
      return true;
    } catch (err) {
      logger.error({ error: err }, 'Telnet 数据发送失败');
      return false;
    }
  }

  /**
   * 发送窗口大小协商
   */
  resize(cols: number, rows: number): boolean {
    if (!this.socket || this.state !== 'connected') {
      logger.warn('Telnet socket 未就绪，无法发送 resize');
      return false;
    }

    try {
      const nawsPacket = this.negotiator.negotiateNAWS(cols, rows);
      this.socket.write(nawsPacket);
      logger.debug({ cols, rows }, 'Telnet NAWS 窗口大小已发送');
      return true;
    } catch (err) {
      logger.error({ error: err }, 'Telnet resize 发送失败');
      return false;
    }
  }

  /**
   * 注册数据接收回调
   */
  onData(callback: (data: Buffer) => void): void {
    if (!this.socket) {
      logger.warn('Telnet socket 不存在，无法注册 onData');
      return;
    }

    this.socket.on('data', (rawBuffer: Buffer) => {
      // 通过协商器解析，移除 IAC 序列
      const parsed = this.negotiator.parse(rawBuffer);

      // 发送需要的响应（如 WILL/WONT 回复）
      if (parsed.responses.length > 0) {
        for (const response of parsed.responses) {
          this.socket?.write(response);
        }
      }

      // 返回干净的数据（移除了控制序列）
      if (parsed.cleanData.length > 0) {
        callback(Buffer.from(parsed.cleanData));
      }
    });
  }

  /**
   * 注册连接关闭回调
   */
  onClose(callback: () => void): void {
    this.socket?.on('close', callback);
  }

  /**
   * 注册错误回调
   */
  onError(callback: (err: Error) => void): void {
    this.socket?.on('error', callback);
  }

  /**
   * 断开 Telnet 连接
   */
  disconnect(): void {
    if (this.socket) {
      this.state = 'disconnected';
      this.socket.destroy();
      this.socket = null;
      logger.info('Telnet 连接已断开');
    }
  }

  /**
   * 获取当前连接状态
   */
  getState(): TelnetSocketState {
    return this.state;
  }

  /**
   * 获取原始 socket
   */
  getSocket(): net.Socket | null {
    return this.socket;
  }
}
