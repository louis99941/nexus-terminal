import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { useTerminalEvents, type TerminalEventsDependencies } from './useTerminalEvents';

vi.mock('@/utils/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeSession(overrides: Record<string, any> = {}) {
  return {
    sessionId: 's1',
    connectionId: '1',
    terminalManager: {
      isSshConnected: { value: true },
      terminalInstance: { value: { writeln: vi.fn(), clear: vi.fn(), scrollToBottom: vi.fn() } },
      sendData: vi.fn(),
      handleTerminalData: vi.fn(),
      handleTerminalResize: vi.fn(),
      handleTerminalReady: vi.fn(),
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<TerminalEventsDependencies> = {}): TerminalEventsDependencies {
  const sessions = new Map<string, any>();
  sessions.set('s1', makeSession());

  return {
    sessionStore: {
      sessions,
      handleConnectRequest: vi.fn(),
    },
    connectionsStore: {
      connections: [
        {
          id: 1,
          name: 'Server 1',
          type: 'SSH',
          host: '10.0.0.1',
          port: 22,
          username: 'root',
        } as any,
      ],
    },
    commandHistoryStore: {
      addCommand: vi.fn(),
    },
    activeSession: ref(makeSession() as any),
    activeSessionId: ref('s1'),
    isMobile: ref(false),
    t: (key: string, fallback?: string) => fallback || key,
    ...overrides,
  };
}

describe('useTerminalEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleSendCommand', () => {
    it('应发送命令到活跃会话', () => {
      const deps = makeDeps();
      const { handleSendCommand } = useTerminalEvents(deps);

      handleSendCommand('ls -la');

      const tm = deps.activeSession.value!.terminalManager as any;
      expect(tm.sendData).toHaveBeenCalledWith('ls -la\r');
    });

    it('应将命令添加到历史记录', () => {
      const deps = makeDeps();
      const { handleSendCommand } = useTerminalEvents(deps);

      handleSendCommand('ls -la');

      expect(deps.commandHistoryStore.addCommand).toHaveBeenCalledWith('ls -la');
    });

    it('Ctrl+C 不应添加到历史记录', () => {
      const deps = makeDeps();
      const { handleSendCommand } = useTerminalEvents(deps);

      handleSendCommand('\x03');

      expect(deps.commandHistoryStore.addCommand).not.toHaveBeenCalled();
    });

    it('空命令不应添加到历史记录', () => {
      const deps = makeDeps();
      const { handleSendCommand } = useTerminalEvents(deps);

      handleSendCommand('  ');

      expect(deps.commandHistoryStore.addCommand).not.toHaveBeenCalled();
    });

    it('无活跃会话时应忽略', () => {
      const deps = makeDeps({ activeSession: ref(null) });
      const { handleSendCommand } = useTerminalEvents(deps);

      handleSendCommand('ls');

      // 不应抛出错误
    });

    it('指定 targetSessionId 时应发送到目标会话', () => {
      const session2 = makeSession({ sessionId: 's2', connectionId: '2' });
      const deps = makeDeps();
      deps.sessionStore.sessions.set('s2', session2 as any);
      const { handleSendCommand } = useTerminalEvents(deps);

      handleSendCommand('pwd', 's2');

      expect((session2.terminalManager as any).sendData).toHaveBeenCalledWith('pwd\r');
    });

    it('断开连接的会话发送空命令时应尝试重连', () => {
      const disconnectedSession = makeSession({
        terminalManager: {
          isSshConnected: { value: false },
          terminalInstance: { value: { writeln: vi.fn() } },
          sendData: vi.fn(),
        },
      });
      const deps = makeDeps({ activeSession: ref(disconnectedSession as any) });
      const { handleSendCommand } = useTerminalEvents(deps);

      handleSendCommand('  ');

      expect(deps.sessionStore.handleConnectRequest).toHaveBeenCalled();
    });

    it('断开连接但找不到连接信息时应记录错误', () => {
      const disconnectedSession = makeSession({
        connectionId: '999',
        terminalManager: {
          isSshConnected: { value: false },
          terminalInstance: { value: { writeln: vi.fn() } },
          sendData: vi.fn(),
        },
      });
      const deps = makeDeps({ activeSession: ref(disconnectedSession as any) });
      const { handleSendCommand } = useTerminalEvents(deps);

      handleSendCommand('  ');

      expect(deps.sessionStore.handleConnectRequest).not.toHaveBeenCalled();
    });
  });

  describe('handleTerminalInput', () => {
    it('应调用 terminalManager.handleTerminalData', () => {
      const deps = makeDeps();
      const { handleTerminalInput } = useTerminalEvents(deps);

      handleTerminalInput({ sessionId: 's1', data: 'a' });

      const tm = deps.sessionStore.sessions.get('s1')!.terminalManager as any;
      expect(tm.handleTerminalData).toHaveBeenCalledWith('a');
    });

    it('会话不存在时应忽略', () => {
      const deps = makeDeps();
      const { handleTerminalInput } = useTerminalEvents(deps);

      handleTerminalInput({ sessionId: 'nonexistent', data: 'a' });

      // 不应抛出错误
    });

    it('断开会话按回车时应尝试重连', () => {
      const disconnectedSession = makeSession({
        terminalManager: {
          isSshConnected: { value: false },
          terminalInstance: { value: { writeln: vi.fn() } },
          handleTerminalData: vi.fn(),
        },
      });
      const deps = makeDeps();
      deps.sessionStore.sessions.set('s1', disconnectedSession as any);
      const { handleTerminalInput } = useTerminalEvents(deps);

      handleTerminalInput({ sessionId: 's1', data: '\r' });

      expect(deps.sessionStore.handleConnectRequest).toHaveBeenCalled();
    });
  });

  describe('handleTerminalResize', () => {
    it('应调用 terminalManager.handleTerminalResize', () => {
      const deps = makeDeps();
      const { handleTerminalResize } = useTerminalEvents(deps);

      handleTerminalResize({ sessionId: 's1', dims: { cols: 120, rows: 40 } });

      const tm = deps.sessionStore.sessions.get('s1')!.terminalManager as any;
      expect(tm.handleTerminalResize).toHaveBeenCalledWith({ cols: 120, rows: 40 });
    });

    it('会话不存在时应忽略', () => {
      const deps = makeDeps();
      const { handleTerminalResize } = useTerminalEvents(deps);

      handleTerminalResize({ sessionId: 'nonexistent', dims: { cols: 80, rows: 24 } });

      // 不应抛出错误
    });
  });

  describe('handleTerminalReady', () => {
    it('应调用 terminalManager.handleTerminalReady', () => {
      const deps = makeDeps();
      const { handleTerminalReady } = useTerminalEvents(deps);
      const payload = { sessionId: 's1', terminal: {} as any, searchAddon: null };

      handleTerminalReady(payload);

      const tm = deps.sessionStore.sessions.get('s1')!.terminalManager as any;
      expect(tm.handleTerminalReady).toHaveBeenCalledWith(payload);
    });
  });

  describe('handleClearTerminal', () => {
    it('应清空活跃终端', () => {
      const deps = makeDeps();
      const { handleClearTerminal } = useTerminalEvents(deps);

      handleClearTerminal();

      const tm = deps.activeSession.value!.terminalManager as any;
      expect(tm.terminalInstance.value.clear).toHaveBeenCalled();
    });

    it('无活跃会话时应忽略', () => {
      const deps = makeDeps({ activeSession: ref(null) });
      const { handleClearTerminal } = useTerminalEvents(deps);

      handleClearTerminal();

      // 不应抛出错误
    });
  });

  describe('handleScrollToBottomRequest', () => {
    it('应滚动终端到底部', () => {
      const deps = makeDeps();
      const { handleScrollToBottomRequest } = useTerminalEvents(deps);

      handleScrollToBottomRequest({ sessionId: 's1' });

      const tm = deps.sessionStore.sessions.get('s1')!.terminalManager as any;
      expect(tm.terminalInstance.value.scrollToBottom).toHaveBeenCalled();
    });

    it('会话不存在时应忽略', () => {
      const deps = makeDeps();
      const { handleScrollToBottomRequest } = useTerminalEvents(deps);

      handleScrollToBottomRequest({ sessionId: 'nonexistent' });

      // 不应抛出错误
    });
  });

  describe('handleVirtualKeyPress', () => {
    it('应发送按键序列到活跃终端', () => {
      const deps = makeDeps();
      const { handleVirtualKeyPress } = useTerminalEvents(deps);

      handleVirtualKeyPress('\x1b[A');

      const tm = deps.activeSession.value!.terminalManager as any;
      expect(tm.sendData).toHaveBeenCalledWith('\x1b[A');
    });

    it('无活跃会话时应忽略', () => {
      const deps = makeDeps({ activeSession: ref(null) });
      const { handleVirtualKeyPress } = useTerminalEvents(deps);

      handleVirtualKeyPress('\x1b[A');

      // 不应抛出错误
    });
  });

  describe('handleQuickCommandExecuteProcessed', () => {
    it('应委托给 handleSendCommand', () => {
      const deps = makeDeps();
      const { handleQuickCommandExecuteProcessed } = useTerminalEvents(deps);

      handleQuickCommandExecuteProcessed({ command: 'uptime', sessionId: 's1' });

      const tm = deps.sessionStore.sessions.get('s1')!.terminalManager as any;
      expect(tm.sendData).toHaveBeenCalledWith('uptime\r');
    });
  });
});
