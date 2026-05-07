/**
 * Command History Repository 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { runDb, getDb, allDb } from '../database/connection';
import {
  upsertCommand,
  getAllCommands,
  deleteCommandById,
  clearAllCommands,
} from './command-history.repository';

// Mock 数据库连接
vi.mock('../database/connection', () => ({
  getDbInstance: vi.fn().mockResolvedValue({}),
  runDb: vi.fn().mockResolvedValue({ changes: 1, lastID: 1 }),
  getDb: vi.fn(),
  allDb: vi.fn().mockResolvedValue([]),
}));

describe('Command History Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertCommand', () => {
    it('命令已存在时应通过 UPSERT 更新时间戳并返回 ID', async () => {
      // ON CONFLICT UPSERT 成功
      (runDb as any).mockResolvedValueOnce({ changes: 1 });
      // 查询返回 ID
      (getDb as any).mockResolvedValueOnce({ id: 5 });

      const result = await upsertCommand('ls -la');

      expect(result).toBe(5);
      expect(runDb).toHaveBeenCalled();
      const upsertCall = (runDb as any).mock.calls[0];
      expect(upsertCall[1]).toContain('INSERT INTO command_history');
      expect(upsertCall[1]).toContain('ON CONFLICT(command) DO UPDATE');
    });

    it('命令不存在时应插入新记录并返回 ID', async () => {
      // ON CONFLICT UPSERT 成功（插入新记录）
      (runDb as any).mockResolvedValueOnce({ changes: 1 });
      // 查询返回 ID
      (getDb as any).mockResolvedValueOnce({ id: 10 });

      const result = await upsertCommand('echo hello');

      expect(result).toBe(10);
      const upsertCall = (runDb as any).mock.calls[0];
      expect(upsertCall[1]).toContain('INSERT INTO command_history');
    });

    it('UPSERT 后查询不到 ID 时应抛出异常', async () => {
      (runDb as any).mockResolvedValueOnce({ changes: 1 });
      (getDb as any).mockResolvedValueOnce(null);

      await expect(upsertCommand('test')).rejects.toThrow('无法更新或插入命令历史记录');
    });

    it('数据库错误时应抛出异常', async () => {
      (runDb as any).mockRejectedValueOnce(new Error('Database error'));

      await expect(upsertCommand('test')).rejects.toThrow('无法更新或插入命令历史记录');
    });
  });

  describe('getAllCommands', () => {
    it('应返回所有命令历史记录（按时间升序）', async () => {
      const mockCommands = [
        { id: 1, command: 'ls', timestamp: 1000 },
        { id: 2, command: 'pwd', timestamp: 2000 },
      ];
      (allDb as any).mockResolvedValueOnce(mockCommands);

      const result = await getAllCommands();

      expect(result).toEqual(mockCommands);
      const call = (allDb as any).mock.calls[0];
      expect(call[1]).toContain('ORDER BY timestamp ASC');
    });

    it('无记录时应返回空数组', async () => {
      (allDb as any).mockResolvedValueOnce([]);

      const result = await getAllCommands();

      expect(result).toHaveLength(0);
    });

    it('数据库错误时应抛出异常', async () => {
      (allDb as any).mockRejectedValueOnce(new Error('Database error'));

      await expect(getAllCommands()).rejects.toThrow('无法获取命令历史记录');
    });
  });

  describe('deleteCommandById', () => {
    it('应成功删除指定命令记录', async () => {
      (runDb as any).mockResolvedValueOnce({ changes: 1 });

      const result = await deleteCommandById(1);

      expect(result).toBe(true);
      const call = (runDb as any).mock.calls[0];
      expect(call[1]).toContain('DELETE FROM command_history WHERE id = ?');
    });

    it('记录不存在时应返回 false', async () => {
      (runDb as any).mockResolvedValueOnce({ changes: 0 });

      const result = await deleteCommandById(999);

      expect(result).toBe(false);
    });

    it('数据库错误时应抛出异常', async () => {
      (runDb as any).mockRejectedValueOnce(new Error('Database error'));

      await expect(deleteCommandById(1)).rejects.toThrow('无法删除命令历史记录');
    });
  });

  describe('clearAllCommands', () => {
    it('应成功清空所有命令历史记录并返回删除数量', async () => {
      (runDb as any).mockResolvedValueOnce({ changes: 50 });

      const result = await clearAllCommands();

      expect(result).toBe(50);
      const call = (runDb as any).mock.calls[0];
      expect(call[1]).toBe('DELETE FROM command_history');
    });

    it('无记录时应返回 0', async () => {
      (runDb as any).mockResolvedValueOnce({ changes: 0 });

      const result = await clearAllCommands();

      expect(result).toBe(0);
    });

    it('数据库错误时应抛出异常', async () => {
      (runDb as any).mockRejectedValueOnce(new Error('Database error'));

      await expect(clearAllCommands()).rejects.toThrow('无法清空命令历史记录');
    });
  });
});
