import { createHistoryStore } from './factories/history.factory';

// 保持原有类型导出
export interface CommandHistoryEntryFE {
  id: number;
  command: string;
  timestamp: number;
}

export const useCommandHistoryStore = createHistoryStore<CommandHistoryEntryFE>({
  storeId: 'commandHistory',
  apiEndpoint: '/command-history',
  itemLabel: 'command',
  addLabel: '命令',
  deleteLabel: '历史记录',
  clearLabel: '所有历史记录',
  cacheKey: 'commandHistoryCache',
  reverseOrder: true,
});
