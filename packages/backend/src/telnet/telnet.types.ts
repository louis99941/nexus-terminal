/**
 * Telnet 协议类型定义
 */

// Telnet 协议控制字节常量
export const TELNET_IAC = 255; // Interpret As Command
export const TELNET_WILL = 251; // 协议：愿意执行选项
export const TELNET_WONT = 252; // 协议：拒绝执行选项
export const TELNET_DO = 253; // 协议：请求对方执行选项
export const TELNET_DONT = 254; // 协议：请求对方停止执行选项
export const TELNET_SB = 250; // 子选项开始
export const TELNET_SE = 240; // 子选项结束

// Telnet 选项代码
export const TELNET_OPTION_ECHO = 1; // 回显
export const TELNET_OPTION_SUPPRESS_GO_AHEAD = 3; // 抑制 Go Ahead
export const TELNET_OPTION_NAWS = 31; // 协商窗口大小

// Telnet 解析结果
export interface TelnetParseResult {
  cleanData: string; // 移除 IAC 序列后的干净数据
  responses: Buffer[]; // 需要发送给服务器的响应
}

// Telnet 连接状态
export type TelnetSocketState = 'connecting' | 'connected' | 'disconnected' | 'error';

// Telnet 协商器接口
export interface ITelnetNegotiator {
  parse(buffer: Buffer): TelnetParseResult;
  negotiateNAWS(cols: number, rows: number): Buffer;
  getSupportedOptions(): number[];
}
