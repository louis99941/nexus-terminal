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
  getStats(): CacheStats;
  size(): number;
}

/** 缓存命中率统计 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  lastAccessedAt: number;
}

export class MemoryCacheService implements ICacheService {
  private store = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;
  private readonly maxSize: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private hits = 0;
  private misses = 0;

  constructor(options: { defaultTtlMs?: number; maxSize?: number } = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 5 * 60 * 1000; // 默认 5 分钟
    this.maxSize = options.maxSize ?? 1000;
    // 每分钟清理过期条目
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    // 更新访问时间（LRU 语义）
    entry.lastAccessedAt = Date.now();
    this.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    // 仅在 key 不存在且池已满时才逐出，避免更新已有 key 时不必要的逐出
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictOldest();
    }
    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
      lastAccessedAt: now,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /**
   * 获取缓存命中率统计
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.store.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * 获取当前缓存条目数
   */
  size(): number {
    return this.store.size;
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
    // LRU 策略：淘汰最久未访问的条目
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
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
