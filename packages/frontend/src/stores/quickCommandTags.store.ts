import { createTagStore, type TagInfo } from './factories/tag.factory';

// 向后兼容类型别名
export type QuickCommandTag = TagInfo;

export const useQuickCommandTagsStore = createTagStore({
  storeId: 'quickCommandTags',
  apiEndpoint: '/quick-command-tags',
  cacheKey: 'quickCommandTagsCache',
  useNotifications: true,
});
