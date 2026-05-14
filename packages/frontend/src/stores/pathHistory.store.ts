import { createHistoryStore } from './factories/history.factory';

// 保持原有类型导出
export interface PathHistoryEntryFE {
  id: number;
  path: string;
  timestamp: number;
}

export const usePathHistoryStore = createHistoryStore<PathHistoryEntryFE>({
  storeId: 'pathHistory',
  apiEndpoint: '/path-history',
  itemLabel: 'path',
  addLabel: '路径',
  deleteLabel: '路径历史记录',
  clearLabel: '所有路径历史记录',
  cacheKey: 'pathHistoryCache',
  reverseOrder: true,
});
