/**
 * SSH 输出批处理器单元测试
 *
 * 重点覆盖：
 * - 零延迟回显路径（小数据立即发送）
 * - 洪流批处理路径（16ms 窗口合并）
 * - 边界条件（阈值附近、最大批次、destroy 时机）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import {
  createOutputBatcher,
  getOrCreateBatcher,
  destroyBatcher,
  flushBatcher,
  cleanupAllBatchers,
} from './output-batcher';

interface MockWebSocket {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
}

const createMockWs = (open = true): MockWebSocket => ({
  readyState: open ? WebSocket.OPEN : WebSocket.CLOSED,
  send: vi.fn(),
});

describe('SSH Output Batcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanupAllBatchers();
  });

  afterEach(() => {
    cleanupAllBatchers();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('零延迟回显路径（小数据 < 256B）', () => {
    it('单字符回显应立即发送，不等待 16ms 批处理窗口', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      // 模拟远端单字符回显
      batcher.write('a');

      // 立即检查，不推进时间：应该已经触发发送
      expect(onSend).toHaveBeenCalledTimes(1);
      const encoded = onSend.mock.calls[0][0];
      expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe('a');
    });

    it('短 ANSI 转义序列（如光标移动）应立即发送', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      batcher.write('\x1b[1A'); // 光标上移

      expect(onSend).toHaveBeenCalledTimes(1);
      const encoded = onSend.mock.calls[0][0];
      expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe('\x1b[1A');
    });

    it('连续快速小数据写入：首次立即发送，后续在冷却期内合并', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      // 第一次写入：零延迟立即发送 + 启动冷却定时器
      batcher.write('h');
      expect(onSend).toHaveBeenCalledTimes(1);

      // 第二次、第三次在冷却期（16ms）内到达：应被缓冲，不立即发送
      batcher.write('e');
      batcher.write('l');
      expect(onSend).toHaveBeenCalledTimes(1); // 仍然只有第一次的 flush

      // 冷却期结束后，缓冲区自动 flush
      vi.advanceTimersByTime(16);
      expect(onSend).toHaveBeenCalledTimes(2);
      const merged = Buffer.from(onSend.mock.calls[1][0], 'base64').toString('utf8');
      expect(merged).toBe('el');
    });

    it('正常打字节奏（每字符间隔 > 16ms）每次应立即发送', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      batcher.write('h');
      expect(onSend).toHaveBeenCalledTimes(1);

      // 模拟正常打字间隔（> 16ms 冷却期）
      vi.advanceTimersByTime(20);
      batcher.write('e');
      expect(onSend).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(20);
      batcher.write('l');
      expect(onSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('洪流批处理路径（数据 ≥ 256B）', () => {
    it('单次大数据写入应启动 16ms 批处理窗口', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      // 写入超过 SMALL_PAYLOAD_THRESHOLD (256) 的数据
      const bigChunk = 'x'.repeat(300);
      batcher.write(bigChunk);

      // 不应立即发送，应等待 timer
      expect(onSend).not.toHaveBeenCalled();

      // 推进 16ms
      vi.advanceTimersByTime(16);

      expect(onSend).toHaveBeenCalledTimes(1);
      const encoded = onSend.mock.calls[0][0];
      expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(bigChunk);
    });

    it('多个小数据快速到达，累计超过阈值时应合并为单帧', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      // 先写一个稍大的块，启动定时器（不立即发送）
      const seed = 'a'.repeat(300);
      batcher.write(seed);
      expect(onSend).not.toHaveBeenCalled();

      // 在 16ms 窗口内再写多个小块，应合并
      batcher.write('b'); // 此时 timer 已存在，不会立即 flush
      batcher.write('c');
      expect(onSend).not.toHaveBeenCalled();

      vi.advanceTimersByTime(16);

      expect(onSend).toHaveBeenCalledTimes(1);
      const merged = Buffer.from(onSend.mock.calls[0][0], 'base64').toString('utf8');
      expect(merged).toBe(seed + 'b' + 'c');
    });

    it('缓冲区累计 ≥ 64KB 时应立即 flush', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      // 第一块启动 timer
      batcher.write('x'.repeat(300));
      // 第二块把总大小推到 64KB 以上
      batcher.write('y'.repeat(64 * 1024));

      // 应立即 flush（不等 16ms）
      expect(onSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('边界条件', () => {
    it('阈值附近 (255B) 应走零延迟路径', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      batcher.write('x'.repeat(255));
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('阈值 (256B) 应走批处理路径', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      batcher.write('x'.repeat(256));
      expect(onSend).not.toHaveBeenCalled();

      vi.advanceTimersByTime(16);
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('WebSocket 已关闭时不应发送', () => {
      const ws = createMockWs(false); // CLOSED
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      batcher.write('a');

      // 当 readyState !== OPEN 时，flush 内部直接跳过 send（不调用 onSend）
      expect(onSend).not.toHaveBeenCalled();
    });

    it('destroy 应刷新缓冲区剩余数据', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      // 写入大数据进入 timer 等待
      batcher.write('x'.repeat(300));
      expect(onSend).not.toHaveBeenCalled();

      // destroy 前不推进时间
      batcher.destroy();

      // 应该刷新出去
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('destroy 后 write 不应再发送', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      batcher.destroy();
      onSend.mockClear();
      batcher.write('a');

      expect(onSend).not.toHaveBeenCalled();
    });

    it('手动 flush 应清除定时器并立即发送', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      batcher.write('x'.repeat(300));
      expect(onSend).not.toHaveBeenCalled();

      batcher.flush();

      expect(onSend).toHaveBeenCalledTimes(1);
      // 推进时间不应再触发
      vi.advanceTimersByTime(50);
      expect(onSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('批处理器管理函数', () => {
    it('getOrCreateBatcher 应复用同 sessionId 的实例', () => {
      const ws = createMockWs();
      const a = getOrCreateBatcher(ws as unknown as WebSocket, 's1');
      const b = getOrCreateBatcher(ws as unknown as WebSocket, 's1');
      expect(a).toBe(b);
    });

    it('destroyBatcher 应释放指定会话', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      getOrCreateBatcher(ws as unknown as WebSocket, 's1', onSend);
      destroyBatcher('s1');

      // 重新获取应得到全新实例
      const fresh = getOrCreateBatcher(ws as unknown as WebSocket, 's1', onSend);
      fresh.write('a');
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('flushBatcher 对不存在的会话应静默返回', () => {
      expect(() => flushBatcher('nonexistent')).not.toThrow();
    });
  });

  describe('UTF-8 与多字节字符', () => {
    it('应正确编码中文字符', () => {
      const ws = createMockWs();
      const onSend = vi.fn();
      const batcher = createOutputBatcher(ws as unknown as WebSocket, 's1', onSend);

      batcher.write('你好喵');

      expect(onSend).toHaveBeenCalledTimes(1);
      const decoded = Buffer.from(onSend.mock.calls[0][0], 'base64').toString('utf8');
      expect(decoded).toBe('你好喵');
    });
  });
});
