import { createTagStore, type TagInfo } from './factories/tag.factory';
import apiClient from '../utils/apiClient';
import { cacheManager, CACHE_KEYS } from '../utils/cacheManager';
import { extractErrorMessage } from '../utils/errorExtractor';
import { log } from '@/utils/log';

// 保持原有类型导出
export type { TagInfo };

export const useTagsStore = createTagStore({
  storeId: 'tags',
  apiEndpoint: '/tags',
  cacheKey: 'tagsCache',
  useNotifications: false,
});

// 扩展 store 类型，包含 updateTagConnections
export type TagsStoreExtended = ReturnType<typeof useTagsStore> & {
  updateTagConnections: (tagId: number, connectionIds: number[]) => Promise<boolean>;
};

/**
 * Create and return the tags store augmented with a method to update a tag's connections.
 *
 * The returned store is the base tags store plus an `updateTagConnections(tagId, connectionIds)` method.
 * That method updates the tag's connections on the server, clears tag and connection caches, attempts to refresh local tag data, and sets the store's `isLoading` and `error` state to reflect progress and failures.
 *
 * @returns The tags store extended with `updateTagConnections(tagId: number, connectionIds: number[]): Promise<boolean>`, which resolves to `true` on success and `false` on failure.
 */
export function useTagsStoreExtended(): TagsStoreExtended {
  const store = useTagsStore();

  const updateTagConnections = async (tagId: number, connectionIds: number[]): Promise<boolean> => {
    store.isLoading = true;
    store.error = null;
    try {
      await apiClient.put(`/tags/${tagId}/connections`, {
        connection_ids: connectionIds,
      });
      cacheManager.remove(CACHE_KEYS.TAGS);
      cacheManager.remove(CACHE_KEYS.CONNECTIONS);
      const fetchSuccess = await store.fetchTags();
      if (!fetchSuccess) {
        store.error = '标签数据刷新失败';
        return false;
      }
      return true;
    } catch (err: unknown) {
      log.error(`Failed to update connections for tag ${tagId}:`, err);
      store.error = extractErrorMessage(err, '连接更新失败');
      return false;
    } finally {
      store.isLoading = false;
    }
  };

  return Object.assign(store, { updateTagConnections });
}
