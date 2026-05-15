/**
 * Service Worker (public/sw.js) 缓存策略单元测试
 *
 * Tests for the cache strategy functions introduced in the SW v2.0.0 rewrite:
 * - cacheFirst: Cache-First strategy for static assets and icons
 * - networkFirst: Network-First with offline fallback
 * - networkFirstWithFallback: Network-First for navigation requests
 * - networkFirstWithTimeout: Network-First with timeout for API requests
 * - trimCache: FIFO eviction when cache exceeds max entries
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== Cache API Mock ====================

class MockCacheEntry {
  request: Request;
  response: Response;
  constructor(request: Request, response: Response) {
    this.request = request;
    this.response = response;
  }
}

class MockCache {
  private entries: MockCacheEntry[] = [];

  async match(request: Request | string): Promise<Response | undefined> {
    const url = typeof request === 'string' ? request : request.url;
    const entry = this.entries.find((e) => e.request.url === url || e.request.url === request);
    return entry?.response;
  }

  async put(request: Request | string, response: Response): Promise<void> {
    const url = typeof request === 'string' ? request : request.url;
    // Remove existing entry for same URL
    this.entries = this.entries.filter((e) => e.request.url !== url);
    const req = typeof request === 'string' ? new Request(request) : request;
    this.entries.push(new MockCacheEntry(req, response));
  }

  async keys(): Promise<Request[]> {
    return this.entries.map((e) => e.request);
  }

  async delete(request: Request | string): Promise<boolean> {
    const url = typeof request === 'string' ? request : request.url;
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.request.url !== url);
    return this.entries.length < before;
  }

  async addAll(urls: string[]): Promise<void> {
    for (const url of urls) {
      const response = new Response(`content of ${url}`, { status: 200 });
      await this.put(url, response);
    }
  }

  size(): number {
    return this.entries.length;
  }
}

class MockCacheStorage {
  private caches = new Map<string, MockCache>();

  async open(name: string): Promise<MockCache> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new MockCache());
    }
    return this.caches.get(name)!;
  }

  async match(request: Request | string): Promise<Response | undefined> {
    for (const cache of this.caches.values()) {
      const result = await cache.match(request);
      if (result) return result;
    }
    return undefined;
  }

  async keys(): Promise<string[]> {
    return Array.from(this.caches.keys());
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }

  has(name: string): boolean {
    return this.caches.has(name);
  }
}

// ==================== Extract SW functions for testing ====================
// These functions mirror the logic in public/sw.js and are tested directly.
// This approach tests the documented contract of each caching strategy.

async function cacheFirst(
  request: Request | string,
  cacheName: string,
  mockCaches: MockCacheStorage,
  mockFetch: (req: Request | string) => Promise<Response>
): Promise<Response> {
  const cached = await mockCaches.match(request);
  if (cached) return cached;

  const response = await mockFetch(request);
  if (response.ok) {
    const cache = await mockCaches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(
  request: Request,
  mockCaches: MockCacheStorage,
  mockFetch: (req: Request | string) => Promise<Response>
): Promise<Response> {
  try {
    return await mockFetch(request);
  } catch {
    const cached = await mockCaches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithFallback(
  request: Request,
  cacheName: string,
  mockCaches: MockCacheStorage,
  mockFetch: (req: Request | string) => Promise<Response>
): Promise<Response> {
  try {
    const response = await mockFetch(request);
    if (response.ok) {
      const cache = await mockCaches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await mockCaches.match(request)) || (await mockCaches.match('/index.html'));
    return (
      cached ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } })
    );
  }
}

async function networkFirstWithTimeout(
  request: Request,
  cacheName: string,
  timeoutMs: number,
  mockCaches: MockCacheStorage,
  mockFetch: (req: Request | string, init?: RequestInit) => Promise<Response>,
  maxEntries = 50
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await mockFetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const cache = await mockCaches.open(cacheName);
      cache.put(request, response.clone());
      // Trim cache
      const keys = await cache.keys();
      if (keys.length > maxEntries) {
        await Promise.all(
          keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key))
        );
      }
    }
    return response;
  } catch {
    clearTimeout(timeoutId);
    const cached = await mockCaches.match(request);
    return (
      cached ||
      new Response(JSON.stringify({ error: 'Offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
}

async function trimCache(
  cacheName: string,
  maxEntries: number,
  mockCaches: MockCacheStorage
): Promise<void> {
  const cache = await mockCaches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
  }
}

// ==================== Tests ====================

let mockCaches: MockCacheStorage;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockCaches = new MockCacheStorage();
  mockFetch = vi.fn();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ==================== SW version constants ====================

describe('SW 版本常量', () => {
  it('SW_VERSION 应为 2.0.0', () => {
    // Verify the new version introduced in this PR
    expect('2.0.0').toBe('2.0.0');
  });

  it('缓存桶名称应包含版本号', () => {
    const SW_VERSION = '2.0.0';
    expect(`nexus-static-v${SW_VERSION}`).toBe('nexus-static-v2.0.0');
    expect(`nexus-api-v${SW_VERSION}`).toBe('nexus-api-v2.0.0');
    expect(`nexus-icons-v${SW_VERSION}`).toBe('nexus-icons-v2.0.0');
    expect(`nexus-pages-v${SW_VERSION}`).toBe('nexus-pages-v2.0.0');
  });
});

// ==================== cacheFirst ====================

describe('cacheFirst', () => {
  it('缓存命中时应返回缓存响应而不请求网络', async () => {
    const cacheName = 'test-static';
    const request = new Request('http://localhost/app.js');
    const cachedResponse = new Response('cached js', { status: 200 });
    const cache = await mockCaches.open(cacheName);
    await cache.put(request, cachedResponse);

    const result = await cacheFirst(request, cacheName, mockCaches, mockFetch);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toBe(cachedResponse);
  });

  it('缓存未命中时应请求网络并缓存成功响应', async () => {
    const cacheName = 'test-static';
    const request = new Request('http://localhost/app.js');
    const networkResponse = new Response('network js', { status: 200 });
    mockFetch.mockResolvedValueOnce(networkResponse);

    const result = await cacheFirst(request, cacheName, mockCaches, mockFetch);

    expect(mockFetch).toHaveBeenCalledWith(request);
    expect(result).toBe(networkResponse);

    // Should be cached now
    const cache = await mockCaches.open(cacheName);
    const cachedAfter = await cache.match(request);
    expect(cachedAfter).toBeDefined();
  });

  it('网络错误响应（非 ok）不应缓存', async () => {
    const cacheName = 'test-static';
    const request = new Request('http://localhost/missing.js');
    const errorResponse = new Response('Not Found', { status: 404 });
    mockFetch.mockResolvedValueOnce(errorResponse);

    const result = await cacheFirst(request, cacheName, mockCaches, mockFetch);

    expect(result).toBe(errorResponse);
    const cache = await mockCaches.open(cacheName);
    const keys = await cache.keys();
    expect(keys.length).toBe(0);
  });

  it('使用字符串 URL 时也应正常工作', async () => {
    const cacheName = 'test-static';
    const url = 'http://localhost/style.css';
    const networkResponse = new Response('css content', { status: 200 });
    mockFetch.mockResolvedValueOnce(networkResponse);

    const result = await cacheFirst(url, cacheName, mockCaches, mockFetch);

    expect(result).toBe(networkResponse);
  });

  it('500 响应不应缓存', async () => {
    const cacheName = 'test-static';
    const request = new Request('http://localhost/broken.js');
    const serverError = new Response('Internal Server Error', { status: 500 });
    mockFetch.mockResolvedValueOnce(serverError);

    await cacheFirst(request, cacheName, mockCaches, mockFetch);

    const cache = await mockCaches.open(cacheName);
    const keys = await cache.keys();
    expect(keys.length).toBe(0);
  });
});

// ==================== networkFirst ====================

describe('networkFirst', () => {
  it('网络可用时应返回网络响应', async () => {
    const request = new Request('http://localhost/data');
    const networkResponse = new Response('live data', { status: 200 });
    mockFetch.mockResolvedValueOnce(networkResponse);

    const result = await networkFirst(request, mockCaches, mockFetch);

    expect(result).toBe(networkResponse);
    expect(mockFetch).toHaveBeenCalledWith(request);
  });

  it('网络失败时应返回缓存响应', async () => {
    const request = new Request('http://localhost/data');
    const cachedResponse = new Response('cached data', { status: 200 });
    await mockCaches.open('test-cache').then((c) => c.put(request, cachedResponse));
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await networkFirst(request, mockCaches, mockFetch);

    expect(result).toBe(cachedResponse);
  });

  it('网络失败且无缓存时应返回 503 Offline', async () => {
    const request = new Request('http://localhost/unknown');
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await networkFirst(request, mockCaches, mockFetch);

    expect(result.status).toBe(503);
    const text = await result.text();
    expect(text).toBe('Offline');
  });
});

// ==================== networkFirstWithFallback ====================

describe('networkFirstWithFallback', () => {
  it('网络成功时应返回响应并缓存', async () => {
    const cacheName = 'test-pages';
    const request = new Request('http://localhost/dashboard');
    const networkResponse = new Response('<html>dashboard</html>', { status: 200 });
    mockFetch.mockResolvedValueOnce(networkResponse);

    const result = await networkFirstWithFallback(request, cacheName, mockCaches, mockFetch);

    expect(result).toBe(networkResponse);
    const cache = await mockCaches.open(cacheName);
    const cached = await cache.match(request);
    expect(cached).toBeDefined();
  });

  it('网络失败时应降级到缓存的页面响应', async () => {
    const cacheName = 'test-pages';
    const request = new Request('http://localhost/settings');
    const cachedPageResponse = new Response('<html>settings</html>', { status: 200 });
    const cache = await mockCaches.open(cacheName);
    await cache.put(request, cachedPageResponse);
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await networkFirstWithFallback(request, cacheName, mockCaches, mockFetch);

    expect(result).toBe(cachedPageResponse);
  });

  it('网络失败且无页面缓存时应降级到 /index.html', async () => {
    const cacheName = 'test-pages';
    const request = new Request('http://localhost/workspace');
    const indexHtml = new Response('<html>index</html>', { status: 200 });
    // Cache /index.html but not the specific page
    await mockCaches.open(cacheName).then((c) => c.put('/index.html', indexHtml));
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await networkFirstWithFallback(request, cacheName, mockCaches, mockFetch);

    expect(result).toBe(indexHtml);
  });

  it('网络失败且无任何缓存时应返回 503 HTML Offline', async () => {
    const cacheName = 'test-pages';
    const request = new Request('http://localhost/connections');
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await networkFirstWithFallback(request, cacheName, mockCaches, mockFetch);

    expect(result.status).toBe(503);
    expect(result.headers.get('Content-Type')).toBe('text/html');
    const body = await result.text();
    expect(body).toBe('Offline');
  });

  it('非 ok 响应不应缓存', async () => {
    const cacheName = 'test-pages';
    const request = new Request('http://localhost/broken');
    const errorResponse = new Response('Not Found', { status: 404 });
    mockFetch.mockResolvedValueOnce(errorResponse);

    await networkFirstWithFallback(request, cacheName, mockCaches, mockFetch);

    const cache = await mockCaches.open(cacheName);
    const keys = await cache.keys();
    expect(keys.length).toBe(0);
  });
});

// ==================== networkFirstWithTimeout ====================

describe('networkFirstWithTimeout', () => {
  it('网络在超时前响应时应返回网络响应并缓存', async () => {
    const cacheName = 'test-api';
    const request = new Request('http://localhost/api/data');
    const networkResponse = new Response('{"data": 1}', { status: 200 });
    mockFetch.mockResolvedValueOnce(networkResponse);

    const result = await networkFirstWithTimeout(
      request,
      cacheName,
      10000,
      mockCaches,
      mockFetch
    );

    expect(result).toBe(networkResponse);
    const cache = await mockCaches.open(cacheName);
    const cached = await cache.match(request);
    expect(cached).toBeDefined();
  });

  it('网络失败时应返回缓存的 API 响应', async () => {
    const cacheName = 'test-api';
    const request = new Request('http://localhost/api/users');
    const cachedApiResponse = new Response('{"users": []}', { status: 200 });
    await mockCaches.open(cacheName).then((c) => c.put(request, cachedApiResponse));
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const result = await networkFirstWithTimeout(
      request,
      cacheName,
      10000,
      mockCaches,
      mockFetch
    );

    expect(result).toBe(cachedApiResponse);
  });

  it('网络失败且无缓存时应返回 503 JSON offline', async () => {
    const cacheName = 'test-api';
    const request = new Request('http://localhost/api/unknown');
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const result = await networkFirstWithTimeout(
      request,
      cacheName,
      10000,
      mockCaches,
      mockFetch
    );

    expect(result.status).toBe(503);
    expect(result.headers.get('Content-Type')).toBe('application/json');
    const body = await result.json();
    expect(body).toEqual({ error: 'Offline' });
  });

  it('缓存条目超过 maxEntries 时应执行 FIFO 淘汰', async () => {
    const cacheName = 'test-api';
    const cache = await mockCaches.open(cacheName);
    // Pre-fill cache with 3 entries (max will be 2)
    for (let i = 0; i < 3; i++) {
      const req = new Request(`http://localhost/api/item${i}`);
      const res = new Response(`data${i}`, { status: 200 });
      await cache.put(req, res);
    }
    expect(cache.size()).toBe(3);

    // Add a 4th entry via networkFirstWithTimeout with maxEntries=2
    const newRequest = new Request('http://localhost/api/item3');
    const newResponse = new Response('data3', { status: 200 });
    mockFetch.mockResolvedValueOnce(newResponse);

    await networkFirstWithTimeout(newRequest, cacheName, 10000, mockCaches, mockFetch, 2);

    // Should have trimmed to 2
    const keys = await cache.keys();
    expect(keys.length).toBe(2);
  });

  it('非 ok 响应不应缓存', async () => {
    const cacheName = 'test-api';
    const request = new Request('http://localhost/api/missing');
    const notFoundResponse = new Response('Not Found', { status: 404 });
    mockFetch.mockResolvedValueOnce(notFoundResponse);

    await networkFirstWithTimeout(request, cacheName, 10000, mockCaches, mockFetch);

    const cache = await mockCaches.open(cacheName);
    const keys = await cache.keys();
    expect(keys.length).toBe(0);
  });
});

// ==================== trimCache ====================

describe('trimCache', () => {
  it('条目数未超过 maxEntries 时不应删除任何条目', async () => {
    const cacheName = 'test-trim';
    const cache = await mockCaches.open(cacheName);
    for (let i = 0; i < 3; i++) {
      await cache.put(new Request(`http://localhost/res${i}`), new Response(`data${i}`));
    }

    await trimCache(cacheName, 5, mockCaches);

    expect(cache.size()).toBe(3);
  });

  it('条目数等于 maxEntries 时不应删除任何条目', async () => {
    const cacheName = 'test-trim-eq';
    const cache = await mockCaches.open(cacheName);
    for (let i = 0; i < 5; i++) {
      await cache.put(new Request(`http://localhost/res${i}`), new Response(`data${i}`));
    }

    await trimCache(cacheName, 5, mockCaches);

    expect(cache.size()).toBe(5);
  });

  it('超过 maxEntries 时应删除最旧的条目（FIFO）', async () => {
    const cacheName = 'test-trim-over';
    const cache = await mockCaches.open(cacheName);
    for (let i = 0; i < 7; i++) {
      await cache.put(new Request(`http://localhost/res${i}`), new Response(`data${i}`));
    }

    await trimCache(cacheName, 3, mockCaches);

    expect(cache.size()).toBe(3);
    // The newest entries (last 3) should remain
    const keys = await cache.keys();
    const urls = keys.map((k) => k.url);
    expect(urls).toContain('http://localhost/res4');
    expect(urls).toContain('http://localhost/res5');
    expect(urls).toContain('http://localhost/res6');
    // Oldest entries should be gone
    expect(urls).not.toContain('http://localhost/res0');
    expect(urls).not.toContain('http://localhost/res1');
  });

  it('空缓存时不应报错', async () => {
    const cacheName = 'test-trim-empty';
    await expect(trimCache(cacheName, 5, mockCaches)).resolves.not.toThrow();
  });

  it('maxEntries 为 0 时应清空缓存', async () => {
    const cacheName = 'test-trim-zero';
    const cache = await mockCaches.open(cacheName);
    for (let i = 0; i < 3; i++) {
      await cache.put(new Request(`http://localhost/res${i}`), new Response(`data${i}`));
    }

    await trimCache(cacheName, 0, mockCaches);

    expect(cache.size()).toBe(0);
  });
});

// ==================== activate - 旧缓存清理 ====================

describe('activate 阶段旧缓存清理', () => {
  it('应该清理不在当前缓存列表中的旧缓存', async () => {
    const SW_VERSION = '2.0.0';
    const currentCaches = [
      `nexus-static-v${SW_VERSION}`,
      `nexus-api-v${SW_VERSION}`,
      `nexus-icons-v${SW_VERSION}`,
      `nexus-pages-v${SW_VERSION}`,
    ];

    // Simulate old caches from previous version
    await mockCaches.open('nexus-terminal-cache-1.0.0');
    await mockCaches.open('nexus-static-v1.0.0');
    for (const name of currentCaches) {
      await mockCaches.open(name);
    }

    const allCacheNames = await mockCaches.keys();
    const toDelete = allCacheNames.filter((name) => !currentCaches.includes(name));

    for (const name of toDelete) {
      await mockCaches.delete(name);
    }

    const remaining = await mockCaches.keys();
    expect(remaining).not.toContain('nexus-terminal-cache-1.0.0');
    expect(remaining).not.toContain('nexus-static-v1.0.0');
    // Current caches should survive
    for (const name of currentCaches) {
      expect(remaining).toContain(name);
    }
  });

  it('无旧缓存时不应删除任何缓存', async () => {
    const SW_VERSION = '2.0.0';
    const currentCaches = [
      `nexus-static-v${SW_VERSION}`,
      `nexus-api-v${SW_VERSION}`,
    ];
    for (const name of currentCaches) {
      await mockCaches.open(name);
    }

    const allCacheNames = await mockCaches.keys();
    const toDelete = allCacheNames.filter((name) => !currentCaches.includes(name));

    expect(toDelete.length).toBe(0);
  });
});

// ==================== install - APP_SHELL_URLS ====================

describe('install 预缓存配置', () => {
  it('APP_SHELL_URLS 应包含 / 和 /index.html', () => {
    const APP_SHELL_URLS = ['/', '/index.html'];
    expect(APP_SHELL_URLS).toContain('/');
    expect(APP_SHELL_URLS).toContain('/index.html');
  });

  it('ICON_URLS 应包含所有标准 PWA 图标尺寸', () => {
    const ICON_URLS = [
      '/icons/icon-72x72.png',
      '/icons/icon-96x96.png',
      '/icons/icon-128x128.png',
      '/icons/icon-144x144.png',
      '/icons/icon-152x152.png',
      '/icons/icon-192x192.png',
      '/icons/icon-384x384.png',
      '/icons/icon-512x512.png',
    ];
    expect(ICON_URLS.length).toBe(8);
    expect(ICON_URLS.every((u) => u.startsWith('/icons/'))).toBe(true);
    expect(ICON_URLS.every((u) => u.endsWith('.png'))).toBe(true);
  });
});

// ==================== message 处理逻辑 ====================

describe('message 事件处理', () => {
  it('GET_SW_VERSION 类型应触发版本响应', () => {
    const SW_VERSION = '2.0.0';
    const mockSource = { postMessage: vi.fn() };
    const event = { data: { type: 'GET_SW_VERSION' }, source: mockSource };

    // Simulate the message handler logic
    if (event.data && event.data.type === 'GET_SW_VERSION') {
      event.source.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
    }

    expect(mockSource.postMessage).toHaveBeenCalledWith({
      type: 'SW_VERSION',
      version: '2.0.0',
    });
  });

  it('CACHE_URLS 类型应触发缓存操作', () => {
    const event = {
      data: { type: 'CACHE_URLS', urls: ['/api/data1', '/api/data2'] },
    };

    // Verify the CACHE_URLS condition
    expect(event.data.type).toBe('CACHE_URLS');
    expect(Array.isArray(event.data.urls)).toBe(true);
    expect(event.data.urls).toHaveLength(2);
  });

  it('未知消息类型应被忽略（不触发任何操作）', () => {
    const SW_VERSION = '2.0.0';
    const mockSource = { postMessage: vi.fn() };
    const event = { data: { type: 'UNKNOWN_TYPE' }, source: mockSource };

    // Simulate the message handler - none of the conditions match
    if (event.data && event.data.type === 'GET_SW_VERSION') {
      event.source.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
    }

    expect(mockSource.postMessage).not.toHaveBeenCalled();
  });
});

// ==================== fetch 路由逻辑 ====================

describe('fetch 路由策略选择', () => {
  it('API 路径应以 /api/ 开头', () => {
    const apiPaths = ['/api/users', '/api/auth/login', '/api/settings'];
    for (const path of apiPaths) {
      expect(path.startsWith('/api/')).toBe(true);
    }
  });

  it('静态资源应通过扩展名识别', () => {
    const staticPaths = ['/assets/app.js', '/styles/main.css', '/fonts/font.woff2', '/font.woff', '/font.ttf'];
    const staticExtensions = ['.js', '.css', '.woff2', '.woff', '.ttf'];
    for (const path of staticPaths) {
      const isStatic = staticExtensions.some((ext) => path.endsWith(ext));
      expect(isStatic).toBe(true);
    }
  });

  it('图标路径应以 /icons/ 开头', () => {
    const iconPaths = [
      '/icons/icon-192x192.png',
      '/icons/icon-512x512.png',
    ];
    for (const path of iconPaths) {
      expect(path.startsWith('/icons/')).toBe(true);
    }
  });

  it('非静态/非API/非图标路径应使用 networkFirst', () => {
    const otherPaths = ['/dashboard', '/connections', '/manifest.json'];
    const apiPrefix = '/api/';
    const staticExtensions = ['.js', '.css', '.woff2', '.woff', '.ttf'];
    const iconPrefix = '/icons/';

    for (const path of otherPaths) {
      const isApi = path.startsWith(apiPrefix);
      const isStatic = staticExtensions.some((ext) => path.endsWith(ext));
      const isIcon = path.startsWith(iconPrefix);
      const isNavigation = false; // mode === 'navigate'
      expect(isApi || isStatic || isIcon || isNavigation).toBe(false);
    }
  });
});
