import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { CacheManager, cacheManager, CACHE_KEYS, CACHE_CONFIG } from './cacheManager';

/**
 * 创建可工作的内存 localStorage mock，
 * 覆盖全局 setup.ts 中的 vi.fn() 空壳 mock
 */
function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number) {
      const keys = Array.from(store.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  } as Storage;
}

describe('CacheManager', () => {
  let manager: CacheManager;
  let originalLocalStorage: Storage;

  beforeAll(() => {
    originalLocalStorage = window.localStorage;
  });

  beforeEach(() => {
    // 替换为可工作的内存 localStorage
    const mock = createLocalStorageMock();
    Object.defineProperty(window, 'localStorage', { value: mock, configurable: true });
    manager = new CacheManager();
  });

  afterEach(() => {
    // 恢复原始 localStorage
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  describe('构造函数', () => {
    it('应该使用默认前缀创建实例', () => {
      manager.set('test', 'value');
      expect(localStorage.getItem('nexus_test')).not.toBeNull();
    });

    it('应该支持自定义前缀', () => {
      const custom = new CacheManager('custom_');
      custom.set('test', 'value');
      expect(localStorage.getItem('custom_test')).not.toBeNull();
      // 默认前缀不应存在
      expect(localStorage.getItem('nexus_test')).toBeNull();
    });
  });

  describe('get 方法', () => {
    it('缓存未命中时应返回默认值', () => {
      const result = manager.get<string>('nonexistent', 'default');
      expect(result).toBe('default');
    });

    it('缓存命中时应返回存储的值', () => {
      manager.set('key1', 'hello');
      const result = manager.get<string>('key1', 'default');
      expect(result).toBe('hello');
    });

    it('应支持复杂对象类型', () => {
      const obj = { name: 'test', items: [1, 2, 3] };
      manager.set('obj', obj);
      const result = manager.get<typeof obj>('obj', { name: '', items: [] });
      expect(result).toEqual(obj);
    });

    it('应支持数组类型', () => {
      manager.set('arr', [10, 20, 30]);
      const result = manager.get<number[]>('arr', []);
      expect(result).toEqual([10, 20, 30]);
    });

    it('应支持 null 值缓存', () => {
      manager.set('nullable', null);
      const result = manager.get<string | null>('nullable', 'fallback');
      expect(result).toBeNull();
    });

    it('版本不匹配时应返回默认值并清除缓存', () => {
      manager.set('key1', 'value', { version: 1 });
      const result = manager.get<string>('key1', 'default', { version: 2 });
      expect(result).toBe('default');
      // 缓存应被清除
      expect(localStorage.getItem('nexus_key1')).toBeNull();
    });

    it('TTL 未过期时应返回缓存值', () => {
      manager.set('key1', 'value');
      const result = manager.get<string>('key1', 'default', { ttl: 60000 });
      expect(result).toBe('value');
    });

    it('TTL 已过期时应返回默认值并清除缓存', () => {
      // 直接写入一个已过期的缓存条目
      const expiredEntry = JSON.stringify({
        version: 1,
        timestamp: Date.now() - 120000, // 2 分钟前
        data: 'expired',
      });
      localStorage.setItem('nexus_key1', expiredEntry);

      const result = manager.get<string>('key1', 'default', { ttl: 60000 }); // 1 分钟 TTL
      expect(result).toBe('default');
      expect(localStorage.getItem('nexus_key1')).toBeNull();
    });

    it('TTL 为 0 时应永不过期', () => {
      const oldEntry = JSON.stringify({
        version: 1,
        timestamp: Date.now() - 365 * 24 * 60 * 60 * 1000, // 一年前
        data: 'old-but-valid',
      });
      localStorage.setItem('nexus_key1', oldEntry);

      const result = manager.get<string>('key1', 'default', { ttl: 0 });
      expect(result).toBe('old-but-valid');
    });

    it('TTL 未设置时应永不过期', () => {
      const oldEntry = JSON.stringify({
        version: 1,
        timestamp: Date.now() - 365 * 24 * 60 * 60 * 1000,
        data: 'old-but-valid',
      });
      localStorage.setItem('nexus_key1', oldEntry);

      const result = manager.get<string>('key1', 'default');
      expect(result).toBe('old-but-valid');
    });

    it('JSON 解析失败时应返回默认值并清除缓存', () => {
      localStorage.setItem('nexus_corrupt', 'invalid json {{{');
      const result = manager.get<string>('corrupt', 'default');
      expect(result).toBe('default');
      expect(localStorage.getItem('nexus_corrupt')).toBeNull();
    });

    it('localStorage.getItem 抛出异常时应返回默认值', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage error');
      });

      const result = manager.get<string>('key', 'default');
      expect(result).toBe('default');

      spy.mockRestore();
    });

    it('未设置版本时应使用默认版本 1', () => {
      manager.set('key1', 'value', { version: 1 });
      // 使用默认版本（也是 1）应能命中
      const result = manager.get<string>('key1', 'default');
      expect(result).toBe('value');
    });
  });

  describe('set 方法', () => {
    it('应该成功写入缓存并返回 true', () => {
      const result = manager.set('key1', 'value1');
      expect(result).toBe(true);

      const raw = localStorage.getItem('nexus_key1');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string);
      expect(parsed.data).toBe('value1');
      expect(parsed.version).toBe(1);
      expect(parsed.timestamp).toBeTypeOf('number');
    });

    it('应该支持自定义版本号', () => {
      manager.set('key1', 'value', { version: 3 });
      const raw = localStorage.getItem('nexus_key1');
      const parsed = JSON.parse(raw as string);
      expect(parsed.version).toBe(3);
    });

    it('应该覆盖已存在的键', () => {
      manager.set('key1', 'first');
      manager.set('key1', 'second');
      const result = manager.get<string>('key1', 'default');
      expect(result).toBe('second');
    });

    it('应该支持写入 undefined', () => {
      const result = manager.set('key1', undefined);
      expect(result).toBe(true);
      const raw = localStorage.getItem('nexus_key1');
      const parsed = JSON.parse(raw as string);
      expect(parsed.data).toBeUndefined();
    });

    it('应该支持写入布尔值', () => {
      manager.set('flag', false);
      expect(manager.get<boolean>('flag', true)).toBe(false);
    });

    it('应该支持写入数字 0', () => {
      manager.set('count', 0);
      expect(manager.get<number>('count', -1)).toBe(0);
    });

    it('写入失败时应尝试清理过期缓存并返回 false', () => {
      // 替换当前 mock 的 setItem 使其抛出异常
      const originalSetItem = Object.getOwnPropertyDescriptor(window.localStorage, 'setItem');
      Object.defineProperty(window.localStorage, 'setItem', {
        value: () => {
          throw new Error('QuotaExceededError');
        },
        configurable: true,
      });

      const result = manager.set('key1', 'value');
      expect(result).toBe(false);

      // 恢复 mock
      if (originalSetItem) {
        Object.defineProperty(window.localStorage, 'setItem', originalSetItem);
      }
    });

    it('写入成功时 timestamp 应接近当前时间', () => {
      const before = Date.now();
      manager.set('key1', 'value');
      const after = Date.now();

      const raw = localStorage.getItem('nexus_key1');
      const parsed = JSON.parse(raw as string);
      expect(parsed.timestamp).toBeGreaterThanOrEqual(before);
      expect(parsed.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('remove 方法', () => {
    it('应该删除指定缓存', () => {
      manager.set('key1', 'value');
      expect(localStorage.getItem('nexus_key1')).not.toBeNull();

      manager.remove('key1');
      expect(localStorage.getItem('nexus_key1')).toBeNull();
    });

    it('删除不存在的键不应报错', () => {
      expect(() => manager.remove('nonexistent')).not.toThrow();
    });

    it('不应影响其他键', () => {
      manager.set('key1', 'value1');
      manager.set('key2', 'value2');

      manager.remove('key1');
      expect(manager.get<string>('key2', '')).toBe('value2');
    });
  });

  describe('has 方法', () => {
    it('键不存在时应返回 false', () => {
      expect(manager.has('nonexistent')).toBe(false);
    });

    it('键存在时应返回 true', () => {
      manager.set('key1', 'value');
      expect(manager.has('key1')).toBe(true);
    });

    it('版本匹配时应返回 true', () => {
      manager.set('key1', 'value', { version: 5 });
      expect(manager.has('key1', { version: 5 })).toBe(true);
    });

    it('版本不匹配时应返回 false', () => {
      manager.set('key1', 'value', { version: 1 });
      expect(manager.has('key1', { version: 2 })).toBe(false);
    });

    it('TTL 已过期时应返回 false', () => {
      const expiredEntry = JSON.stringify({
        version: 1,
        timestamp: Date.now() - 120000,
        data: 'expired',
      });
      localStorage.setItem('nexus_key1', expiredEntry);

      expect(manager.has('key1', { ttl: 60000 })).toBe(false);
    });

    it('TTL 未过期时应返回 true', () => {
      manager.set('key1', 'value');
      expect(manager.has('key1', { ttl: 60000 })).toBe(true);
    });

    it('TTL 为 0 时应忽略过期检查', () => {
      const oldEntry = JSON.stringify({
        version: 1,
        timestamp: Date.now() - 365 * 24 * 60 * 60 * 1000,
        data: 'old',
      });
      localStorage.setItem('nexus_key1', oldEntry);

      expect(manager.has('key1', { ttl: 0 })).toBe(true);
    });

    it('JSON 解析失败时应返回 false', () => {
      localStorage.setItem('nexus_corrupt', 'not-json');
      expect(manager.has('corrupt')).toBe(false);
    });

    it('localStorage.getItem 抛出异常时应返回 false', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage error');
      });

      expect(manager.has('key')).toBe(false);

      spy.mockRestore();
    });
  });

  describe('clear 方法', () => {
    it('应该只清除带前缀的缓存', () => {
      manager.set('key1', 'value1');
      manager.set('key2', 'value2');
      localStorage.setItem('other_prefix_key', 'other');

      manager.clear();

      expect(localStorage.getItem('nexus_key1')).toBeNull();
      expect(localStorage.getItem('nexus_key2')).toBeNull();
      expect(localStorage.getItem('other_prefix_key')).toBe('other');
    });

    it('清除空缓存不应报错', () => {
      expect(() => manager.clear()).not.toThrow();
    });

    it('自定义前缀应只清除对应前缀的缓存', () => {
      const custom = new CacheManager('custom_');
      custom.set('a', 1);
      manager.set('b', 2);

      custom.clear();

      expect(localStorage.getItem('custom_a')).toBeNull();
      expect(localStorage.getItem('nexus_b')).not.toBeNull();
    });
  });

  describe('clearExpired 方法', () => {
    it('应清除超过 30 天的缓存', () => {
      const oldEntry = JSON.stringify({
        version: 1,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        data: 'old',
      });
      localStorage.setItem('nexus_old', oldEntry);

      const recentEntry = JSON.stringify({
        version: 1,
        timestamp: Date.now() - 1000,
        data: 'recent',
      });
      localStorage.setItem('nexus_recent', recentEntry);

      manager.clearExpired();

      expect(localStorage.getItem('nexus_old')).toBeNull();
      expect(localStorage.getItem('nexus_recent')).not.toBeNull();
    });

    it('应清除 JSON 解析失败的缓存', () => {
      localStorage.setItem('nexus_corrupt', 'invalid-json-{{{');

      manager.clearExpired();

      expect(localStorage.getItem('nexus_corrupt')).toBeNull();
    });

    it('不影响带其他前缀的缓存', () => {
      const oldEntry = JSON.stringify({
        version: 1,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
        data: 'old',
      });
      localStorage.setItem('other_old', oldEntry);

      manager.clearExpired();

      expect(localStorage.getItem('other_old')).not.toBeNull();
    });

    it('不影响 30 天内的缓存', () => {
      const recentEntry = JSON.stringify({
        version: 1,
        timestamp: Date.now() - 29 * 24 * 60 * 60 * 1000,
        data: 'recent',
      });
      localStorage.setItem('nexus_recent', recentEntry);

      manager.clearExpired();

      expect(localStorage.getItem('nexus_recent')).not.toBeNull();
    });

    it('空字符串值不会被 clearExpired 清除（if(raw) 为 falsy 跳过）', () => {
      // 空字符串 '' 是 falsy，if (raw) 跳过，不会进入解析或清除逻辑
      localStorage.setItem('nexus_empty', '');

      manager.clearExpired();

      expect(localStorage.getItem('nexus_empty')).toBe('');
    });
  });

  describe('getStats 方法', () => {
    it('空缓存应返回零统计', () => {
      const stats = manager.getStats();
      expect(stats.count).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.keys).toEqual([]);
    });

    it('应正确统计带前缀的缓存', () => {
      manager.set('a', 'hello');
      manager.set('b', 'world');

      const stats = manager.getStats();
      expect(stats.count).toBe(2);
      expect(stats.keys).toContain('a');
      expect(stats.keys).toContain('b');
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('不应统计不带前缀的缓存', () => {
      manager.set('a', 'hello');
      localStorage.setItem('other_key', 'value');

      const stats = manager.getStats();
      expect(stats.count).toBe(1);
      expect(stats.keys).toEqual(['a']);
    });

    it('keys 应返回去掉前缀的键名', () => {
      manager.set('connections', []);
      manager.set('settings', {});

      const stats = manager.getStats();
      expect(stats.keys).toContain('connections');
      expect(stats.keys).toContain('settings');
    });

    it('totalSize 应按 UTF-16 计算（每字符 2 字节）', () => {
      // 直接写入已知长度的原始值
      const raw = JSON.stringify({ version: 1, timestamp: 123, data: 'ab' });
      localStorage.setItem('nexus_test', raw);

      const stats = manager.getStats();
      // raw.length * 2
      expect(stats.totalSize).toBe(raw.length * 2);
    });
  });

  describe('默认实例与常量', () => {
    it('应导出默认 cacheManager 实例', () => {
      expect(cacheManager).toBeInstanceOf(CacheManager);
    });

    it('CACHE_KEYS 应包含所有必需的键', () => {
      expect(CACHE_KEYS.CONNECTIONS).toBe('connections');
      expect(CACHE_KEYS.TAGS).toBe('tags');
      expect(CACHE_KEYS.PROXIES).toBe('proxies');
      expect(CACHE_KEYS.QUICK_COMMANDS).toBe('quickCommands');
      expect(CACHE_KEYS.SETTINGS).toBe('settings');
      expect(CACHE_KEYS.APPEARANCE).toBe('appearance');
      expect(CACHE_KEYS.LAYOUT).toBe('layout');
      expect(CACHE_KEYS.SIDEBAR).toBe('sidebar');
    });

    it('CACHE_CONFIG 应为每个键定义版本和 TTL', () => {
      for (const key of Object.values(CACHE_KEYS)) {
        const config = CACHE_CONFIG[key];
        expect(config).toBeDefined();
        expect(config.version).toBeTypeOf('number');
        expect(config.ttl).toBeTypeOf('number');
      }
    });

    it('有 TTL 的配置应 TTL > 0，无 TTL 的应 ttl = 0', () => {
      expect(CACHE_CONFIG[CACHE_KEYS.CONNECTIONS].ttl).toBe(5 * 60 * 1000);
      expect(CACHE_CONFIG[CACHE_KEYS.TAGS].ttl).toBe(10 * 60 * 1000);
      expect(CACHE_CONFIG[CACHE_KEYS.PROXIES].ttl).toBe(10 * 60 * 1000);
      expect(CACHE_CONFIG[CACHE_KEYS.QUICK_COMMANDS].ttl).toBe(10 * 60 * 1000);
      expect(CACHE_CONFIG[CACHE_KEYS.SETTINGS].ttl).toBe(0);
      expect(CACHE_CONFIG[CACHE_KEYS.APPEARANCE].ttl).toBe(0);
      expect(CACHE_CONFIG[CACHE_KEYS.LAYOUT].ttl).toBe(0);
      expect(CACHE_CONFIG[CACHE_KEYS.SIDEBAR].ttl).toBe(0);
    });
  });
});
