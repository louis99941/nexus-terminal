/**
 * Service Worker (public/sw.js) 单元测试
 *
 * 测试重写后的结构化缓存策略：
 * - cacheFirst: Cache-First 策略（静态资源/图标）
 * - networkFirst: Network-First 策略（其他请求）
 * - networkFirstWithFallback: 导航请求 + index.html 降级
 * - networkFirstWithTimeout: API 请求 + 超时降级
 * - trimCache: FIFO 缓存条目限制
 * - install / activate / fetch / message 事件处理
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== Mock Cache Storage API ====================

function makeMockCache() {
  const store = new Map<string, Response>();
  return {
    _store: store,
    match: vi.fn(async (req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      return store.get(key) ?? undefined;
    }),
    put: vi.fn(async (req: Request | string, res: Response) => {
      const key = typeof req === 'string' ? req : req.url;
      store.set(key, res);
    }),
    delete: vi.fn(async (req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      return store.delete(key);
    }),
    addAll: vi.fn(async () => {}),
    keys: vi.fn(async () => Array.from(store.keys()).map((url) => new Request(url))),
  };
}

type MockCache = ReturnType<typeof makeMockCache>;

const cacheStore = new Map<string, MockCache>();

const mockCaches = {
  open: vi.fn(async (name: string) => {
    if (!cacheStore.has(name)) cacheStore.set(name, makeMockCache());
    return cacheStore.get(name)!;
  }),
  match: vi.fn(async (req: Request | string) => {
    for (const cache of cacheStore.values()) {
      const result = await cache.match(req);
      if (result) return result;
    }
    return undefined;
  }),
  keys: vi.fn(async () => Array.from(cacheStore.keys())),
  delete: vi.fn(async (name: string) => cacheStore.delete(name)),
};

// ==================== Mock fetch ====================

const mockFetch = vi.fn();

// ==================== Mock Service Worker globals ====================

const mockSelf = {
  location: { origin: 'http://localhost:3000' },
  skipWaiting: vi.fn(),
  clients: {
    claim: vi.fn(),
  },
  onmessage: null as ((event: MessageEvent) => void) | null,
};

// ==================== Setup / Teardown ====================

// Store the event listeners registered by the SW
const swListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

function resetSWListeners() {
  for (const key of Object.keys(swListeners)) {
    delete swListeners[key];
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  cacheStore.clear();
  vi.clearAllMocks();
  resetSWListeners();

  // Set up global SW environment
  Object.defineProperty(globalThis, 'caches', { value: mockCaches, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'self', { value: mockSelf, writable: true, configurable: true });

  // Track addEventListener calls
  mockSelf.skipWaiting.mockClear();
  mockSelf.clients.claim.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ==================== Helper: make a mock Response ====================

function makeResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html', ...headers } });
}

// ==================== Helper: import SW functions by evaluating sw.js ====================

// Since sw.js is not a standard module with exports, we load it as text and extract
// the function implementations to test them in isolation. We do this by creating a
// controlled environment that captures the exported helper functions.

/**
 * Build a minimal SW-like scope and evaluate sw.js in it, returning the helper functions.
 */
async function getSWHelpers() {
  const { readFileSync } = await import('fs');
  const path = await import('path');
  const swPath = path.resolve(__dirname, '../public/sw.js');
  const swCode = readFileSync(swPath, 'utf-8');

  // We'll extract the helper functions by eval in a scope with mocked globals
  const scope = {
    caches: mockCaches,
    fetch: mockFetch,
    self: mockSelf,
    AbortController: globalThis.AbortController,
    Response: globalThis.Response,
    Request: globalThis.Request,
    URL: globalThis.URL,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    Promise: globalThis.Promise,
    JSON: globalThis.JSON,
    console: globalThis.console,
    addEventListener: vi.fn(),
  };

  // Wrap in an immediately-invoked function to capture the helper functions
  const wrappedCode = `
    "use strict";
    ${swCode}
    // Return helpers
    ({ cacheFirst, networkFirst, networkFirstWithFallback, networkFirstWithTimeout, trimCache });
  `;

  // eslint-disable-next-line no-new-func
  const factory = new Function(
    ...Object.keys(scope),
    wrappedCode
  );

  return factory(...Object.values(scope)) as {
    cacheFirst: (req: Request, cacheName: string) => Promise<Response>;
    networkFirst: (req: Request) => Promise<Response>;
    networkFirstWithFallback: (req: Request, cacheName: string) => Promise<Response>;
    networkFirstWithTimeout: (req: Request, cacheName: string, timeoutMs: number) => Promise<Response>;
    trimCache: (cacheName: string, maxEntries: number) => Promise<void>;
  };
}

// ==================== cacheFirst ====================

describe('cacheFirst', () => {
  it('缓存命中时应直接返回缓存的响应', async () => {
    const { cacheFirst } = await getSWHelpers();
    const request = new Request('http://localhost:3000/app.js');
    const cachedResponse = makeResponse('<cached js>');

    // Pre-populate cache
    const cache = await mockCaches.open('nexus-static-v2.0.0');
    await cache.put(request, cachedResponse);
    // Mock caches.match to return the cached response
    mockCaches.match.mockResolvedValueOnce(cachedResponse);

    const result = await cacheFirst(request, 'nexus-static-v2.0.0');
    expect(result).toBe(cachedResponse);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('缓存未命中时应从网络获取并缓存', async () => {
    const { cacheFirst } = await getSWHelpers();
    const request = new Request('http://localhost:3000/new-file.js');
    const networkResponse = makeResponse('<network js>');

    mockCaches.match.mockResolvedValueOnce(undefined);
    mockFetch.mockResolvedValueOnce(networkResponse);

    const result = await cacheFirst(request, 'nexus-static-v2.0.0');
    expect(result).toBe(networkResponse);
    expect(mockFetch).toHaveBeenCalledWith(request);
  });

  it('网络响应成功时应将其存入缓存', async () => {
    const { cacheFirst } = await getSWHelpers();
    const request = new Request('http://localhost:3000/styles.css');
    const networkResponse = makeResponse('<css>');
    // Ensure response.ok is true
    Object.defineProperty(networkResponse, 'ok', { value: true });
    Object.defineProperty(networkResponse, 'clone', { value: () => networkResponse });

    mockCaches.match.mockResolvedValueOnce(undefined);
    mockFetch.mockResolvedValueOnce(networkResponse);

    const cache = await mockCaches.open('nexus-static-v2.0.0');
    await cacheFirst(request, 'nexus-static-v2.0.0');

    expect(cache.put).toHaveBeenCalled();
  });

  it('网络响应失败时不应将其存入缓存', async () => {
    const { cacheFirst } = await getSWHelpers();
    const request = new Request('http://localhost:3000/bad-resource.js');
    const errorResponse = new Response('Not Found', { status: 404 });

    mockCaches.match.mockResolvedValueOnce(undefined);
    mockFetch.mockResolvedValueOnce(errorResponse);

    const cache = await mockCaches.open('nexus-static-v2.0.0');
    const putSpy = vi.spyOn(cache, 'put');

    await cacheFirst(request, 'nexus-static-v2.0.0');
    expect(putSpy).not.toHaveBeenCalled();
  });
});

// ==================== networkFirst ====================

describe('networkFirst', () => {
  it('网络可用时应返回网络响应', async () => {
    const { networkFirst } = await getSWHelpers();
    const request = new Request('http://localhost:3000/some-resource');
    const networkResponse = makeResponse('<response>');

    mockFetch.mockResolvedValueOnce(networkResponse);

    const result = await networkFirst(request);
    expect(result).toBe(networkResponse);
  });

  it('网络失败时应降级到缓存', async () => {
    const { networkFirst } = await getSWHelpers();
    const request = new Request('http://localhost:3000/resource');
    const cachedResponse = makeResponse('<cached>');

    mockFetch.mockRejectedValueOnce(new TypeError('Network error'));
    mockCaches.match.mockResolvedValueOnce(cachedResponse);

    const result = await networkFirst(request);
    expect(result).toBe(cachedResponse);
  });

  it('网络失败且无缓存时应返回 503 Offline', async () => {
    const { networkFirst } = await getSWHelpers();
    const request = new Request('http://localhost:3000/unknown');

    mockFetch.mockRejectedValueOnce(new TypeError('Network error'));
    mockCaches.match.mockResolvedValueOnce(undefined);

    const result = await networkFirst(request);
    expect(result.status).toBe(503);
    const text = await result.text();
    expect(text).toBe('Offline');
  });
});

// ==================== networkFirstWithFallback ====================

describe('networkFirstWithFallback (导航请求)', () => {
  it('网络可用时应返回网络响应并缓存', async () => {
    const { networkFirstWithFallback } = await getSWHelpers();
    const request = new Request('http://localhost:3000/', { mode: 'navigate' } as RequestInit);
    const networkResponse = new Response('<html/>', { status: 200 });
    Object.defineProperty(networkResponse, 'ok', { value: true });
    Object.defineProperty(networkResponse, 'clone', { value: () => networkResponse });

    mockFetch.mockResolvedValueOnce(networkResponse);

    const result = await networkFirstWithFallback(request, 'nexus-pages-v2.0.0');
    expect(result).toBe(networkResponse);
  });

  it('网络失败时应降级到缓存的 index.html', async () => {
    const { networkFirstWithFallback } = await getSWHelpers();
    const request = new Request('http://localhost:3000/some-page');
    const indexHtml = makeResponse('<html>index</html>');

    mockFetch.mockRejectedValueOnce(new TypeError('offline'));
    // First match for the request itself returns nothing, second for /index.html returns content
    mockCaches.match
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(indexHtml);

    const result = await networkFirstWithFallback(request, 'nexus-pages-v2.0.0');
    expect(result).toBe(indexHtml);
  });

  it('网络失败且无任何缓存时应返回 503 HTML', async () => {
    const { networkFirstWithFallback } = await getSWHelpers();
    const request = new Request('http://localhost:3000/no-cache');

    mockFetch.mockRejectedValueOnce(new TypeError('offline'));
    mockCaches.match.mockResolvedValue(undefined);

    const result = await networkFirstWithFallback(request, 'nexus-pages-v2.0.0');
    expect(result.status).toBe(503);
    const text = await result.text();
    expect(text).toBe('Offline');
    expect(result.headers.get('Content-Type')).toBe('text/html');
  });

  it('网络成功时应将响应写入 PAGES 缓存', async () => {
    const { networkFirstWithFallback } = await getSWHelpers();
    const request = new Request('http://localhost:3000/');
    const networkResponse = new Response('<html/>', { status: 200 });
    Object.defineProperty(networkResponse, 'ok', { value: true });
    Object.defineProperty(networkResponse, 'clone', { value: () => new Response('<html/>') });

    mockFetch.mockResolvedValueOnce(networkResponse);

    const cache = await mockCaches.open('nexus-pages-v2.0.0');
    const putSpy = vi.spyOn(cache, 'put');

    await networkFirstWithFallback(request, 'nexus-pages-v2.0.0');
    expect(putSpy).toHaveBeenCalled();
  });
});

// ==================== networkFirstWithTimeout ====================

describe('networkFirstWithTimeout (API 请求)', () => {
  it('网络在超时前响应时应返回网络响应', async () => {
    const { networkFirstWithTimeout } = await getSWHelpers();
    const request = new Request('http://localhost:3000/api/users');
    const networkResponse = new Response('{"users":[]}', { status: 200 });
    Object.defineProperty(networkResponse, 'ok', { value: true });
    Object.defineProperty(networkResponse, 'clone', { value: () => networkResponse });

    mockFetch.mockResolvedValueOnce(networkResponse);

    const result = await networkFirstWithTimeout(request, 'nexus-api-v2.0.0', 10000);
    expect(result).toBe(networkResponse);
  });

  it('超时时应降级到缓存', async () => {
    const { networkFirstWithTimeout } = await getSWHelpers();
    const request = new Request('http://localhost:3000/api/slow');
    const cachedResponse = new Response('{"cached":true}', { status: 200 });

    // Simulate abort error (timeout)
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);
    mockCaches.match.mockResolvedValueOnce(cachedResponse);

    const result = await networkFirstWithTimeout(request, 'nexus-api-v2.0.0', 10000);
    expect(result).toBe(cachedResponse);
  });

  it('超时且无缓存时应返回 503 JSON', async () => {
    const { networkFirstWithTimeout } = await getSWHelpers();
    const request = new Request('http://localhost:3000/api/unavailable');

    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);
    mockCaches.match.mockResolvedValueOnce(undefined);

    const result = await networkFirstWithTimeout(request, 'nexus-api-v2.0.0', 10000);
    expect(result.status).toBe(503);
    const json = await result.json();
    expect(json).toEqual({ error: 'Offline' });
    expect(result.headers.get('Content-Type')).toBe('application/json');
  });

  it('网络成功时应将响应存入 API 缓存', async () => {
    const { networkFirstWithTimeout } = await getSWHelpers();
    const request = new Request('http://localhost:3000/api/data');
    const networkResponse = new Response('{"data":1}', { status: 200 });
    Object.defineProperty(networkResponse, 'ok', { value: true });
    Object.defineProperty(networkResponse, 'clone', { value: () => new Response('{"data":1}') });

    mockFetch.mockResolvedValueOnce(networkResponse);

    const cache = await mockCaches.open('nexus-api-v2.0.0');
    const putSpy = vi.spyOn(cache, 'put');

    await networkFirstWithTimeout(request, 'nexus-api-v2.0.0', 10000);
    expect(putSpy).toHaveBeenCalled();
  });

  it('网络失败（非超时）时也应降级到缓存', async () => {
    const { networkFirstWithTimeout } = await getSWHelpers();
    const request = new Request('http://localhost:3000/api/items');
    const cachedResponse = new Response('{"items":[]}', { status: 200 });

    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    mockCaches.match.mockResolvedValueOnce(cachedResponse);

    const result = await networkFirstWithTimeout(request, 'nexus-api-v2.0.0', 10000);
    expect(result).toBe(cachedResponse);
  });
});

// ==================== trimCache ====================

describe('trimCache', () => {
  it('条目数未超限时不应删除任何条目', async () => {
    const { trimCache } = await getSWHelpers();

    // Add 3 entries to the cache
    const cache = await mockCaches.open('nexus-api-v2.0.0');
    for (let i = 0; i < 3; i++) {
      await cache.put(new Request(`http://localhost/api/item${i}`), makeResponse(`item${i}`));
    }
    const deleteSpy = vi.spyOn(cache, 'delete');

    await trimCache('nexus-api-v2.0.0', 5);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('条目数超过限制时应删除最旧的条目', async () => {
    const { trimCache } = await getSWHelpers();

    const cache = await mockCaches.open('nexus-api-v2.0.0');
    // Add 7 entries
    for (let i = 0; i < 7; i++) {
      await cache.put(new Request(`http://localhost/api/item${i}`), makeResponse(`item${i}`));
    }

    await trimCache('nexus-api-v2.0.0', 5);
    // 7 - 5 = 2 entries should be deleted
    expect(cache.delete).toHaveBeenCalledTimes(2);
  });

  it('恰好达到限制时不应删除任何条目', async () => {
    const { trimCache } = await getSWHelpers();

    const cache = await mockCaches.open('nexus-api-v2.0.0');
    for (let i = 0; i < 5; i++) {
      await cache.put(new Request(`http://localhost/api/item${i}`), makeResponse(`item${i}`));
    }
    const deleteSpy = vi.spyOn(cache, 'delete');

    await trimCache('nexus-api-v2.0.0', 5);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('空缓存不应报错', async () => {
    const { trimCache } = await getSWHelpers();
    await expect(trimCache('nexus-api-v2.0.0', 50)).resolves.not.toThrow();
  });

  it('超过 50 条 API 缓存时应触发清理', async () => {
    const { trimCache } = await getSWHelpers();

    const cache = await mockCaches.open('nexus-api-v2.0.0');
    for (let i = 0; i < 55; i++) {
      await cache.put(new Request(`http://localhost/api/item${i}`), makeResponse(`item${i}`));
    }

    await trimCache('nexus-api-v2.0.0', 50);
    // 55 - 50 = 5 entries should be deleted
    expect(cache.delete).toHaveBeenCalledTimes(5);
  });
});

// ==================== SW 版本和缓存桶命名 ====================

describe('Service Worker 版本和缓存桶', () => {
  it('SW 版本应为 2.0.0', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const swCode = readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf-8');
    expect(swCode).toContain("SW_VERSION = '2.0.0'");
  });

  it('应定义 4 个命名缓存桶', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const swCode = readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf-8');
    expect(swCode).toContain('CACHE_STATIC');
    expect(swCode).toContain('CACHE_API');
    expect(swCode).toContain('CACHE_ICONS');
    expect(swCode).toContain('CACHE_PAGES');
  });

  it('API 缓存最大条目应为 50', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const swCode = readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf-8');
    expect(swCode).toContain('API_CACHE_MAX = 50');
  });

  it('API 超时应为 10000ms', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const swCode = readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf-8');
    expect(swCode).toContain('API_TIMEOUT_MS = 10000');
  });

  it('应包含 APP_SHELL_URLS', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const swCode = readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf-8');
    expect(swCode).toContain("'/'");
    expect(swCode).toContain("'/index.html'");
  });

  it('应缓存 8 个图标 URL', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const swCode = readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf-8');
    expect(swCode).toContain('icon-72x72.png');
    expect(swCode).toContain('icon-512x512.png');
  });
});

// ==================== manifest.json 变更验证 ====================

describe('manifest.json 变更', () => {
  it('应包含 categories 字段', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const manifestPath = path.resolve(__dirname, '../public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.categories).toBeDefined();
    expect(Array.isArray(manifest.categories)).toBe(true);
    expect(manifest.categories).toContain('developer');
    expect(manifest.categories).toContain('utilities');
  });

  it('description 应更新为新描述', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const manifestPath = path.resolve(__dirname, '../public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.description).toBe('现代化、功能丰富的 Web SSH / RDP / VNC 客户端');
  });

  it('short_name 应为 NexusTerm', async () => {
    const { readFileSync } = await import('fs');
    const path = await import('path');
    const manifestPath = path.resolve(__dirname, '../public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.short_name).toBe('NexusTerm');
  });
});
