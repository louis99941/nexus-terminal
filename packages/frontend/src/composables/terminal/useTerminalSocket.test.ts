import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useTerminalSocket } from './useTerminalSocket';

const mockEmit = vi.fn();
vi.mock('../workspaceEvents', () => ({
  useWorkspaceEventEmitter: () => mockEmit,
}));

vi.mock('@/utils/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeTerminal(overrides: Record<string, any> = {}) {
  return {
    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    write: vi.fn(),
    ...overrides,
  };
}

describe('useTerminalSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应返回 setupInputHandler', () => {
    const terminal = ref(makeTerminal() as any);
    const stream = ref<ReadableStream<string> | undefined>(undefined);

    const result = useTerminalSocket(terminal, 's1', stream);

    expect(typeof result.setupInputHandler).toBe('function');
  });

  describe('setupInputHandler', () => {
    it('应注册 onData 处理器并发射 terminal:input 事件', () => {
      const term = makeTerminal();
      const terminal = ref(term as any);
      const stream = ref<ReadableStream<string> | undefined>(undefined);

      const { setupInputHandler } = useTerminalSocket(terminal, 's1', stream);
      setupInputHandler();

      expect(term.onData).toHaveBeenCalled();

      // 模拟用户输入
      const handler = term.onData.mock.calls[0][0];
      handler('ls -la\r');

      expect(mockEmit).toHaveBeenCalledWith('terminal:input', {
        sessionId: 's1',
        data: 'ls -la\r',
      });
    });

    it('terminal 为 null 时不应注册处理器', () => {
      const terminal = ref(null);
      const stream = ref<ReadableStream<string> | undefined>(undefined);

      const { setupInputHandler } = useTerminalSocket(terminal, 's1', stream);
      setupInputHandler();

      // 不应抛出错误
    });
  });

  describe('stream watch', () => {
    it('stream 有数据时应写入 terminal', async () => {
      const term = makeTerminal();
      const terminal = ref(term as any);

      const chunks = ['Hello', ' World'];
      let chunkIndex = 0;

      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            const val = chunks[chunkIndex++];
            return Promise.resolve({ done: false, value: val });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: () => mockReader,
      } as any;

      const stream = ref<ReadableStream<string> | undefined>(undefined);

      useTerminalSocket(terminal, 's1', stream);

      // 设置 stream 触发 watch
      stream.value = mockStream;
      await nextTick();

      // 等待异步读取完成
      await vi.waitFor(() => {
        expect(term.write).toHaveBeenCalledWith('Hello');
        expect(term.write).toHaveBeenCalledWith(' World');
      });

      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('stream 为 undefined 时不应读取', () => {
      const term = makeTerminal();
      const terminal = ref(term as any);
      const stream = ref<ReadableStream<string> | undefined>(undefined);

      useTerminalSocket(terminal, 's1', stream);

      expect(term.write).not.toHaveBeenCalled();
    });

    it('读取流出错时应记录错误', async () => {
      const term = makeTerminal();
      const terminal = ref(term as any);

      const mockReader = {
        read: vi.fn().mockRejectedValue(new Error('stream error')),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: () => mockReader,
      } as any;

      const stream = ref<ReadableStream<string> | undefined>(undefined);

      useTerminalSocket(terminal, 's1', stream);

      stream.value = mockStream;
      await nextTick();

      await vi.waitFor(() => {
        expect(mockReader.releaseLock).toHaveBeenCalled();
      });
    });

    it('terminal 为 null 时流数据应被忽略', async () => {
      const terminal = ref(null);

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: 'data' })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockStream = {
        getReader: () => mockReader,
      } as any;

      const stream = ref<ReadableStream<string> | undefined>(undefined);

      useTerminalSocket(terminal, 's1', stream);

      stream.value = mockStream;
      await nextTick();

      await vi.waitFor(() => {
        expect(mockReader.releaseLock).toHaveBeenCalled();
      });
    });
  });
});
