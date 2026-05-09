import { useExportConnections } from './useExportConnections';

/**
 * 数据管理 composable — 复用 useExportConnections 避免重复逻辑
 * @see useExportConnections.ts
 */
export function useDataManagement() {
  return useExportConnections();
}
