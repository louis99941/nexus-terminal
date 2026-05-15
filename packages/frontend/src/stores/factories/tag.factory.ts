import { defineStore } from 'pinia';
import { ref } from 'vue';
import apiClient from '../../utils/apiClient';
import { extractErrorMessage } from '../../utils/errorExtractor';
import { useUiNotificationsStore } from '../uiNotifications.store';
import { log } from '@/utils/log';

export interface TagStoreConfig {
  storeId: string;
  apiEndpoint: string;
  cacheKey: string;
  useNotifications?: boolean; // 是否显示成功通知（默认 true）
}

export interface TagInfo {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
}

/**
 * Creates a Pinia store for managing tag records (CRUD) with localStorage caching and optional UI notifications.
 *
 * @param config - Configuration for the generated tag store. Fields:
 *   - `storeId`: Pinia store identifier used with `defineStore`.
 *   - `apiEndpoint`: Base API endpoint for tag CRUD requests.
 *   - `cacheKey`: `localStorage` key used to cache the tag list.
 *   - `useNotifications` (optional, default `true`): Whether to show success/error notifications via the UI notifications store.
 * @returns A Pinia store exposing:
 *   - `tags`: reactive array of `TagInfo`
 *   - `isLoading`: reactive loading flag
 *   - `error`: reactive last error message or `null`
 *   - `fetchTags()`, `addTag(name)`, `updateTag(id, name)`, `deleteTag(id)`: async actions for tag operations
 */
export function createTagStore(config: TagStoreConfig) {
  const { storeId, apiEndpoint, cacheKey, useNotifications = true } = config;

  return defineStore(storeId, () => {
    const tags = ref<TagInfo[]>([]);
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const uiNotificationsStore = useUiNotificationsStore();

    /**
     * Loads the tag list into the store, using localStorage cache when available and then refreshing from the API.
     *
     * Attempts to populate the store's `tags` from the configured cache key, fetches the latest tags from the API,
     * updates the cache if the fetched list differs from the current list, sets `error` on failure, and updates `isLoading`
     * for the duration of the operation. If notifications are enabled, shows an error message when the API request fails.
     *
     * @returns `true` if the tags were fetched and the store state updated successfully, `false` otherwise.
     */
    async function fetchTags() {
      error.value = null;

      try {
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          tags.value = JSON.parse(cachedData);
          isLoading.value = false;
        } else {
          isLoading.value = true;
        }
      } catch (loadError: unknown) {
        log.error(`[${storeId}] 缓存加载失败:`, loadError);
        localStorage.removeItem(cacheKey);
        isLoading.value = true;
      }

      isLoading.value = true;
      try {
        const response = await apiClient.get<TagInfo[]>(apiEndpoint);
        const freshData = response.data;
        const freshDataString = JSON.stringify(freshData);

        const currentDataString = JSON.stringify(tags.value);
        if (currentDataString !== freshDataString) {
          tags.value = freshData;
          localStorage.setItem(cacheKey, freshDataString);
        }
        error.value = null;
        return true;
      } catch (err: unknown) {
        log.error(`[${storeId}] 获取标签失败:`, err);
        error.value = extractErrorMessage(err, '获取标签列表失败');
        if (useNotifications && error.value) {
          uiNotificationsStore.showError(error.value);
        }
        return false;
      } finally {
        isLoading.value = false;
      }
    }

    /**
     * Creates a new tag with the given name and refreshes the stored tag list.
     *
     * If the store is configured to use UI notifications, a success or error message
     * may be shown after the operation completes.
     *
     * @param name - The display name for the new tag
     * @returns The created `TagInfo` on success, `null` on failure
     */
    async function addTag(name: string): Promise<TagInfo | null> {
      isLoading.value = true;
      error.value = null;
      try {
        const response = await apiClient.post<{ message: string; tag: TagInfo }>(apiEndpoint, {
          name,
        });
        const newTag = response.data.tag;
        localStorage.removeItem(cacheKey);
        const fetchSuccess = await fetchTags();
        if (fetchSuccess && useNotifications) {
          uiNotificationsStore.showSuccess('标签已添加');
        }
        return newTag;
      } catch (err: unknown) {
        log.error(`[${storeId}] 添加标签失败:`, err);
        error.value = extractErrorMessage(err, '添加标签失败');
        if (useNotifications && error.value) {
          uiNotificationsStore.showError(error.value);
        }
        return null;
      } finally {
        isLoading.value = false;
      }
    }

    /**
     * Update an existing tag's name and refresh the store's cached tag list.
     *
     * @param id - The identifier of the tag to update
     * @param name - The new name for the tag
     * @returns `true` if the tag was updated and the store was refreshed, `false` otherwise.
     */
    async function updateTag(id: number, name: string): Promise<boolean> {
      isLoading.value = true;
      error.value = null;
      try {
        await apiClient.put(`${apiEndpoint}/${id}`, { name });
        localStorage.removeItem(cacheKey);
        const fetchSuccess = await fetchTags();
        if (fetchSuccess && useNotifications) {
          uiNotificationsStore.showSuccess('标签已更新');
        }
        return true;
      } catch (err: unknown) {
        log.error(`[${storeId}] 更新标签失败:`, err);
        error.value = extractErrorMessage(err, '更新标签失败');
        if (useNotifications && error.value) {
          uiNotificationsStore.showError(error.value);
        }
        return false;
      } finally {
        isLoading.value = false;
      }
    }

    /**
     * Delete a tag by its id and refresh the cached tag list.
     *
     * If configured to use notifications, shows a success message when the deletion
     * and subsequent refresh succeed, or an error message when the operation fails.
     *
     * @param id - The identifier of the tag to delete
     * @returns `true` if the tag was deleted and the tag list was refreshed successfully, `false` otherwise
     */
    async function deleteTag(id: number): Promise<boolean> {
      isLoading.value = true;
      error.value = null;
      try {
        await apiClient.delete(`${apiEndpoint}/${id}`);
        localStorage.removeItem(cacheKey);
        const fetchSuccess = await fetchTags();
        if (fetchSuccess && useNotifications) {
          uiNotificationsStore.showSuccess('标签已删除');
        }
        return true;
      } catch (err: unknown) {
        log.error(`[${storeId}] 删除标签失败:`, err);
        error.value = extractErrorMessage(err, '删除标签失败');
        if (useNotifications && error.value) {
          uiNotificationsStore.showError(error.value);
        }
        return false;
      } finally {
        isLoading.value = false;
      }
    }

    return {
      tags,
      isLoading,
      error,
      fetchTags,
      addTag,
      updateTag,
      deleteTag,
    };
  });
}
