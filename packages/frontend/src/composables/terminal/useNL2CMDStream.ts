/**
 * useNL2CMDStream Composable
 * 处理终端中的自然语言转命令功能（SSE 流式版本）
 * 支持实时显示 AI 生成的命令
 */

import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import type { NL2CMDRequest } from '../../types/nl2cmd.types';
import { useAISettingsStore } from '../../stores/aiSettings.store';
import { useAIStore } from '../../stores/ai.store';
import { log } from '@/utils/log';

// 远程服务器 OS/Shell 类型配置
export interface RemoteSystemInfo {
  osType: string;
  shellType: string;
  currentPath?: string;
}

// 流式响应数据块
interface StreamChunk {
  type: 'start' | 'token' | 'end' | 'error';
  content?: string;
  command?: string;
  warning?: string;
  error?: string;
  traceId?: string;
}

export function useNL2CMDStream() {
  const aiSettingsStore = useAISettingsStore();
  const aiStore = useAIStore();

  // 确保加载配置
  onMounted(async () => {
    await aiSettingsStore.ensureLoaded();
  });

  // 状态
  const isVisible = ref(false);
  const query = ref('');
  const isLoading = ref(false);
  const streamedContent = ref(''); // 流式接收的内容
  const generatedCommand = ref<string | null>(null); // 最终生成的命令
  const commandWarning = ref<string | null>(null); // 危险命令警告
  const streamError = ref<string | null>(null); // 流式错误

  // AbortController 用于取消请求
  let abortController: AbortController | null = null;

  // 远程系统信息（可由调用方设置）
  const remoteSystemInfo = ref<RemoteSystemInfo>({
    osType: 'Linux',
    shellType: 'bash',
    currentPath: '~',
  });

  // 计算属性：AI 是否已启用
  const isAIEnabled = computed(() => aiSettingsStore.settings.enabled);

  /**
   * 设置远程系统信息
   */
  function setRemoteSystemInfo(info: Partial<RemoteSystemInfo>) {
    remoteSystemInfo.value = {
      ...remoteSystemInfo.value,
      ...info,
    };
  }

  /**
   * 显示 NL2CMD 输入框
   */
  function show() {
    if (!isAIEnabled.value) {
      ElMessage.warning('请先在设置中启用并配置 AI 助手');
      return;
    }
    isVisible.value = true;
    query.value = '';
    resetState();
  }

  /**
   * 隐藏 NL2CMD 输入框
   */
  function hide() {
    isVisible.value = false;
    query.value = '';
    resetState();
  }

  /**
   * 重置状态
   */
  function resetState() {
    streamedContent.value = '';
    generatedCommand.value = null;
    commandWarning.value = null;
    streamError.value = null;
  }

  /**
   * 生成命令（SSE 流式版本）
   */
  async function generateCommand(): Promise<string | null> {
    if (!query.value.trim()) {
      ElMessage.warning('请输入命令描述');
      return null;
    }

    isLoading.value = true;
    resetState();
    abortController = new AbortController();

    try {
      const request: NL2CMDRequest = {
        query: query.value.trim(),
        osType: remoteSystemInfo.value.osType,
        shellType: remoteSystemInfo.value.shellType,
        currentPath: remoteSystemInfo.value.currentPath,
        debug: aiStore.debugMode || undefined,
      };

      log.debug('[NL2CMD Stream] Request:', request);
      aiStore.addDebugLog({ type: 'request', source: 'nl2cmd', data: request });

      // 使用 fetch + ReadableStream 消费 SSE
      const response = await fetch('/api/v1/ai/nl2cmd/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // 处理 SSE 数据行
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留未完成的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              // 流结束
              continue;
            }

            try {
              const chunk: StreamChunk = JSON.parse(data);
              handleStreamChunk(chunk);
            } catch {
              log.debug('[NL2CMD Stream] 解析数据块失败:', data);
            }
          }
        }
      }

      log.debug('[NL2CMD Stream] Response:', generatedCommand.value);
      aiStore.addDebugLog({
        type: 'response',
        source: 'nl2cmd',
        data: {
          command: generatedCommand.value,
          warning: commandWarning.value,
          content: streamedContent.value,
        },
      });

      if (generatedCommand.value) {
        // 如果有警告，显示警告信息
        if (commandWarning.value) {
          ElMessage.warning({
            message: `⚠️ 危险命令警告：${commandWarning.value}`,
            duration: 5000,
            showClose: true,
          });
        } else {
          ElMessage.success('命令已生成');
        }

        hide();
        return generatedCommand.value;
      } else if (streamError.value) {
        ElMessage.error(streamError.value);
        return null;
      } else {
        const msg = 'AI 未能生成命令，请尝试更详细地描述您的需求';
        ElMessage.warning(msg);
        return null;
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        log.debug('[NL2CMD Stream] 请求已取消');
        return null;
      }

      log.error('[NL2CMD Stream] 生成命令失败:', error);
      const err = error as { message?: string };
      const errorMsg = err.message || '生成命令失败';

      aiStore.addDebugLog({
        type: 'error',
        source: 'nl2cmd',
        data: { error: errorMsg, raw: error },
      });

      ElMessage.error(errorMsg);
      return null;
    } finally {
      isLoading.value = false;
      abortController = null;
    }
  }

  /**
   * 处理流式数据块
   */
  function handleStreamChunk(chunk: StreamChunk) {
    switch (chunk.type) {
      case 'start':
        log.debug('[NL2CMD Stream] 流开始, traceId:', chunk.traceId);
        break;

      case 'token':
        // 实时显示生成的 token
        if (chunk.content) {
          streamedContent.value += chunk.content;
        }
        break;

      case 'end':
        // 流结束，提取最终命令
        if (chunk.command) {
          generatedCommand.value = chunk.command;
        }
        if (chunk.warning) {
          commandWarning.value = chunk.warning;
        }
        break;

      case 'error':
        streamError.value = chunk.error || '流式处理错误';
        break;
    }
  }

  /**
   * 取消生成
   */
  function cancel() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    hide();
  }

  return {
    isVisible,
    query,
    isLoading,
    isAIEnabled,
    remoteSystemInfo,
    streamedContent,
    generatedCommand,
    commandWarning,
    streamError,
    show,
    hide,
    generateCommand,
    cancel,
    setRemoteSystemInfo,
  };
}
