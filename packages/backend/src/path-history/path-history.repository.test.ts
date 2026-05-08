import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { runDb, getDb, allDb } from '../database/connection';
import { upsertPath, getAllPaths, deletePathById, clearAllPaths } from './path-history.repository';

vi.mock('../database/connection', () => ({
  getDbInstance: vi.fn().mockResolvedValue({}),
  runDb: vi.fn(),
  getDb: vi.fn(),
  allDb: vi.fn(),
}));

describe('path-history.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  describe('upsertPath', () => {
    it('路径已存在时应通过 UPSERT RETURNING id 返回 ID', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
      (getDb as any).mockResolvedValueOnce({ id: 99 });

      const id = await upsertPath('/home');
      expect(id).toBe(99);

      const upsertCall = (getDb as any).mock.calls[0];
      expect(upsertCall[1]).toContain('INSERT INTO path_history');
      expect(upsertCall[1]).toContain('ON CONFLICT(path) DO UPDATE');
      expect(upsertCall[1]).toContain('RETURNING id');
      expect(upsertCall[2]).toEqual(['/home', 1700000000]);
    });

    it('UPSERT 后未找到记录 ID 时应抛出异常', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
      (getDb as any).mockResolvedValueOnce(null);

      await expect(upsertPath('/home')).rejects.toThrow('无法更新或插入路径历史记录');
    });

    it('路径不存在时应插入并返回 ID', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
      (getDb as any).mockResolvedValueOnce({ id: 123 });

      const id = await upsertPath('/new');
      expect(id).toBe(123);

      const upsertCall = (getDb as any).mock.calls[0];
      expect(upsertCall[1]).toContain('INSERT INTO path_history');
      expect(upsertCall[2]).toEqual(['/new', 1700000000]);
    });

    it('数据库错误时应抛出异常', async () => {
      (getDb as any).mockRejectedValueOnce(new Error('db error'));
      await expect(upsertPath('/home')).rejects.toThrow('无法更新或插入路径历史记录');
    });
  });

  describe('getAllPaths', () => {
    it('应按 timestamp ASC 获取所有记录', async () => {
      (allDb as any).mockResolvedValueOnce([{ id: 1, path: '/a', timestamp: 1 }]);
      const result = await getAllPaths();
      expect(result).toHaveLength(1);

      const call = (allDb as any).mock.calls[0];
      expect(call[1]).toContain('ORDER BY timestamp ASC');
    });

    it('数据库错误时应抛出异常', async () => {
      (allDb as any).mockRejectedValueOnce(new Error('db error'));
      await expect(getAllPaths()).rejects.toThrow('无法获取路径历史记录');
    });
  });

  describe('deletePathById', () => {
    it('changes > 0 时应返回 true', async () => {
      (runDb as any).mockResolvedValueOnce({ changes: 1 });
      const result = await deletePathById(1);
      expect(result).toBe(true);
      const call = (runDb as any).mock.calls[0];
      expect(call[1]).toContain('DELETE FROM path_history WHERE id = ?');
    });

    it('changes = 0 时应返回 false', async () => {
      (runDb as any).mockResolvedValueOnce({ changes: 0 });
      const result = await deletePathById(999);
      expect(result).toBe(false);
    });

    it('数据库错误时应抛出异常', async () => {
      (runDb as any).mockRejectedValueOnce(new Error('db error'));
      await expect(deletePathById(1)).rejects.toThrow('无法删除路径历史记录');
    });
  });

  describe('clearAllPaths', () => {
    it('应返回删除的行数', async () => {
      (runDb as any).mockResolvedValueOnce({ changes: 5 });
      const result = await clearAllPaths();
      expect(result).toBe(5);
      const call = (runDb as any).mock.calls[0];
      expect(call[1]).toContain('DELETE FROM path_history');
    });

    it('数据库错误时应抛出异常', async () => {
      (runDb as any).mockRejectedValueOnce(new Error('db error'));
      await expect(clearAllPaths()).rejects.toThrow('无法清空路径历史记录');
    });
  });
});
