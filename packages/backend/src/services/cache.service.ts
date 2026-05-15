/**
 * 进程内缓存服务
 * 支持 TTL 自动过期，未来可通过 ICacheService 接口替换为 Redis
 */
import { logger } from '../utils/logger';

export interface ICacheService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlMs?: number): void;
  delete(key: string): void;
  clear(): void;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class MemoryCacheService implements ICacheService {
  private store = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;
  private readonly maxSize: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: { defaultTtlMs?: number; maxSize?: number } = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 5 * 60 * 1000; // 默认 5 分钟
    this.maxSize = options.maxSize ?? 1000;
    // 每分钟清理过期条目
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= this.maxSize) {
      this.evictOldest();
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /**
   * 停止清理定时器（用于优雅关闭）
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private evictOldest(): void {
    const oldest = this.store.keys().next().value;
    if (oldest) this.store.delete(oldest);
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      logger.debug(`[CacheService] 清理了 ${cleanedCount} 个过期缓存条目`);
    }
  }
}

// 单例导出
export const cacheService = new MemoryCacheService();
