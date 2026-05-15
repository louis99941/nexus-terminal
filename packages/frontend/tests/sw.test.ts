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

// Store the event listeners registered by the SW (populated when getSWHelpers is called)
const swListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

function resetSWListeners() {
  for (const key of Object.keys(swListeners)) {
    delete swListeners[key];
  }
}

const mockSelf = {
  location: { origin: 'http://localhost:3000' },
  skipWaiting: vi.fn(),
  clients: {
    claim: vi.fn(),
  },
  onmessage: null as ((event: MessageEvent) => void) | null,
  // addEventListener is needed because sw.js calls self.addEventListener(...)
  addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!swListeners[event]) swListeners[event] = [];
    swListeners[event].push(handler);
  }),
};

// ==================== Setup / Teardown ====================

beforeEach(() => {
  vi.useFakeTimers();
  cacheStore.clear();
  vi.clearAllMocks();
  resetSWListeners();

  // Set up global SW environment
  Object.defineProperty(globalThis, 'caches', { value: mockCaches, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'self', { value: mockSelf, writable: true, configurable: true });

  // Re-bind mock functions so clearAllMocks doesn't break them
  mockSelf.skipWaiting.mockClear();
  mockSelf.clients.claim.mockClear();
  // Re-register addEventListener since vi.clearAllMocks() resets the mock
  mockSelf.addEventListener.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (!swListeners[event]) swListeners[event] = [];
    swListeners[event].push(handler);
  });
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
 * Build a minimal SW-like scope and evaluate sw.js in it, returning the helper functions
 * and captured event handlers.
 */
async function getSWHelpers() {
  const { readFileSync } = await import('fs');
  const path = await import('path');
  const swPath = path.resolve(__dirname, '../public/sw.js');
  const swCode = readFileSync(swPath, 'utf-8');

  // Capture handlers registered by self.addEventListener during sw.js initialization
  const capturedHandlers: Record<string, (...args: unknown[]) => void> = {};

  // We'll extract the helper functions by eval in a scope with mocked globals
  const scope = {
    caches: mockCaches,
    fetch: mockFetch,
    self: {
      ...mockSelf,
      // Override addEventListener in scope to capture handlers from sw.js init
      addEventListener: (event: string, handler: (...args: unknown[]) => void) => {
        capturedHandlers[event] = handler;
        // Also populate the module-level swListeners for compatibility
        if (!swListeners[event]) swListeners[event] = [];
        swListeners[event].push(handler);
      },
    },
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
    // Return helpers and any other needed references
    ({ cacheFirst, networkFirst, networkFirstWithFallback, networkFirstWithTimeout, trimCache });
  `;

  // eslint-disable-next-line no-new-func
  const factory = new Function(
    ...Object.keys(scope),
    wrappedCode
  );

  const helpers = factory(...Object.values(scope)) as {
    cacheFirst: (req: Request, cacheName: string) => Promise<Response>;
    networkFirst: (req: Request) => Promise<Response>;
    networkFirstWithFallback: (req: Request, cacheName: string) => Promise<Response>;
    networkFirstWithTimeout: (req: Request, cacheName: string, timeoutMs: number) => Promise<Response>;
    trimCache: (cacheName: string, maxEntries: number) => Promise<void>;
  };

  return {
    ...helpers,
    /** Event handlers registered by sw.js (install, fetch, activate, message) */
    handlers: capturedHandlers,
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

// ==================== SW 事件处理器测试 ====================

describe('SW install 事件处理器', () => {
  it('install 时应预缓存静态 shell 资源（/ 和 /index.html）', async () => {
    const { handlers } = await getSWHelpers();
    const installHandler = handlers['install'];
    expect(installHandler).toBeDefined();

    const waitUntilMock = vi.fn();
    const event = { waitUntil: waitUntilMock };
    installHandler(event);

    // waitUntil should be called with a Promise
    expect(waitUntilMock).toHaveBeenCalledOnce();
    const promise = waitUntilMock.mock.calls[0][0];
    expect(promise).toBeInstanceOf(Promise);
  });

  it('install 时应打开 CACHE_STATIC 和 CACHE_ICONS 两个缓存桶', async () => {
    const { handlers } = await getSWHelpers();
    const installHandler = handlers['install'];

    const waitUntilMock = vi.fn();
    const event = { waitUntil: waitUntilMock };
    installHandler(event);

    await waitUntilMock.mock.calls[0][0];

    // Both static and icons caches should be opened
    const openedCaches = mockCaches.open.mock.calls.map((c) => c[0]);
    expect(openedCaches).toContain('nexus-static-v2.0.0');
    expect(openedCaches).toContain('nexus-icons-v2.0.0');
  });

  it('install 时应调用 self.skipWaiting()', async () => {
    const { handlers } = await getSWHelpers();
    const installHandler = handlers['install'];

    const waitUntilMock = vi.fn();
    installHandler({ waitUntil: waitUntilMock });

    expect(mockSelf.skipWaiting).toHaveBeenCalledOnce();
  });

  it('install 时 CACHE_STATIC 应缓存 APP_SHELL_URLS', async () => {
    const { handlers } = await getSWHelpers();
    const installHandler = handlers['install'];

    const waitUntilMock = vi.fn();
    installHandler({ waitUntil: waitUntilMock });
    await waitUntilMock.mock.calls[0][0];

    const staticCache = await mockCaches.open('nexus-static-v2.0.0');
    expect(staticCache.addAll).toHaveBeenCalledWith(expect.arrayContaining(['/', '/index.html']));
  });

  it('install 时 CACHE_ICONS 应缓存图标 URLs', async () => {
    const { handlers } = await getSWHelpers();
    const installHandler = handlers['install'];

    const waitUntilMock = vi.fn();
    installHandler({ waitUntil: waitUntilMock });
    await waitUntilMock.mock.calls[0][0];

    const iconsCache = await mockCaches.open('nexus-icons-v2.0.0');
    expect(iconsCache.addAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        '/icons/icon-72x72.png',
        '/icons/icon-512x512.png',
      ])
    );
  });
});

describe('SW activate 事件处理器', () => {
  it('activate 时应调用 event.waitUntil', async () => {
    const { handlers } = await getSWHelpers();
    const activateHandler = handlers['activate'];
    expect(activateHandler).toBeDefined();

    const waitUntilMock = vi.fn();
    activateHandler({ waitUntil: waitUntilMock });

    expect(waitUntilMock).toHaveBeenCalledOnce();
  });

  it('activate 时应调用 clients.claim()', async () => {
    const { handlers } = await getSWHelpers();
    const activateHandler = handlers['activate'];

    const waitUntilMock = vi.fn();
    activateHandler({ waitUntil: waitUntilMock });
    await waitUntilMock.mock.calls[0][0];

    expect(mockSelf.clients.claim).toHaveBeenCalledOnce();
  });

  it('activate 时应删除不在当前缓存列表中的旧缓存', async () => {
    const { handlers } = await getSWHelpers();
    const activateHandler = handlers['activate'];

    // Simulate old caches existing
    const oldCacheNames = ['nexus-terminal-cache-1.0.0', 'old-cache-v1'];
    const currentCacheNames = [
      'nexus-static-v2.0.0',
      'nexus-api-v2.0.0',
      'nexus-icons-v2.0.0',
      'nexus-pages-v2.0.0',
    ];
    mockCaches.keys.mockResolvedValueOnce([...oldCacheNames, ...currentCacheNames]);

    const waitUntilMock = vi.fn();
    activateHandler({ waitUntil: waitUntilMock });
    await waitUntilMock.mock.calls[0][0];

    // Old caches should be deleted
    expect(mockCaches.delete).toHaveBeenCalledWith('nexus-terminal-cache-1.0.0');
    expect(mockCaches.delete).toHaveBeenCalledWith('old-cache-v1');
    // Current caches should NOT be deleted
    for (const name of currentCacheNames) {
      expect(mockCaches.delete).not.toHaveBeenCalledWith(name);
    }
  });

  it('activate 时如果没有旧缓存则不删除任何缓存', async () => {
    const { handlers } = await getSWHelpers();
    const activateHandler = handlers['activate'];

    mockCaches.keys.mockResolvedValueOnce([
      'nexus-static-v2.0.0',
      'nexus-api-v2.0.0',
      'nexus-icons-v2.0.0',
      'nexus-pages-v2.0.0',
    ]);

    const waitUntilMock = vi.fn();
    activateHandler({ waitUntil: waitUntilMock });
    await waitUntilMock.mock.calls[0][0];

    expect(mockCaches.delete).not.toHaveBeenCalled();
  });
});

describe('SW message 事件处理器', () => {
  it('GET_SW_VERSION 消息应回复版本号', async () => {
    const { handlers } = await getSWHelpers();
    const messageHandler = handlers['message'];
    expect(messageHandler).toBeDefined();

    const postMessageMock = vi.fn();
    const event = {
      data: { type: 'GET_SW_VERSION' },
      source: { postMessage: postMessageMock },
    };
    messageHandler(event);

    expect(postMessageMock).toHaveBeenCalledWith({ type: 'SW_VERSION', version: '2.0.0' });
  });

  it('SKIP_WAITING 消息应调用 self.skipWaiting()', async () => {
    const { handlers } = await getSWHelpers();
    const messageHandler = handlers['message'];

    const event = {
      data: { type: 'SKIP_WAITING' },
      source: { postMessage: vi.fn() },
    };
    messageHandler(event);

    expect(mockSelf.skipWaiting).toHaveBeenCalled();
  });

  it('CACHE_URLS 消息应获取并缓存指定 URLs', async () => {
    const { handlers } = await getSWHelpers();
    const messageHandler = handlers['message'];

    const mockResponse = makeResponse('<content>');
    mockFetch.mockResolvedValue(mockResponse);

    const event = {
      data: {
        type: 'CACHE_URLS',
        urls: ['http://localhost:3000/api/data1', 'http://localhost:3000/api/data2'],
      },
      source: { postMessage: vi.fn() },
    };
    messageHandler(event);

    // Give the async operations time to run
    await vi.runAllTimersAsync();

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/data1');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/data2');
  });

  it('未知消息类型应安静忽略', async () => {
    const { handlers } = await getSWHelpers();
    const messageHandler = handlers['message'];

    const postMessageMock = vi.fn();
    const event = {
      data: { type: 'UNKNOWN_TYPE' },
      source: { postMessage: postMessageMock },
    };

    expect(() => messageHandler(event)).not.toThrow();
    expect(postMessageMock).not.toHaveBeenCalled();
    expect(mockSelf.skipWaiting).not.toHaveBeenCalled();
  });

  it('data 为 null 时应安静忽略', async () => {
    const { handlers } = await getSWHelpers();
    const messageHandler = handlers['message'];

    const event = { data: null, source: { postMessage: vi.fn() } };
    expect(() => messageHandler(event)).not.toThrow();
  });

  it('CACHE_URLS 且 urls 不是数组时应忽略', async () => {
    const { handlers } = await getSWHelpers();
    const messageHandler = handlers['message'];

    const event = {
      data: { type: 'CACHE_URLS', urls: 'not-an-array' },
      source: { postMessage: vi.fn() },
    };
    expect(() => messageHandler(event)).not.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('SW fetch 事件处理器路由规则', () => {
  it('导航请求（mode=navigate）应使用 networkFirstWithFallback 策略', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];
    expect(fetchHandler).toBeDefined();

    const networkResponse = makeResponse('<html/>');
    Object.defineProperty(networkResponse, 'ok', { value: true });
    Object.defineProperty(networkResponse, 'clone', { value: () => new Response('<html/>') });
    mockFetch.mockResolvedValueOnce(networkResponse);

    const respondWithMock = vi.fn();
    const request = new Request('http://localhost:3000/', { mode: 'navigate' } as RequestInit);
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    expect(respondWithMock).toHaveBeenCalledOnce();
    const responsePromise = respondWithMock.mock.calls[0][0];
    const result = await responsePromise;
    expect(result).toBe(networkResponse);
  });

  it('/api/ 路径应使用 networkFirstWithTimeout 策略', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];

    const networkResponse = new Response('{"data":1}', { status: 200 });
    Object.defineProperty(networkResponse, 'ok', { value: true });
    Object.defineProperty(networkResponse, 'clone', { value: () => new Response('{"data":1}') });
    mockFetch.mockResolvedValueOnce(networkResponse);

    const respondWithMock = vi.fn();
    const request = new Request('http://localhost:3000/api/users');
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    expect(respondWithMock).toHaveBeenCalledOnce();
    const result = await respondWithMock.mock.calls[0][0];
    expect(result).toBe(networkResponse);
  });

  it('.js 静态资源应使用 cacheFirst 策略', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];

    // Serve from network (no cache)
    const networkResponse = makeResponse('console.log(1)');
    mockCaches.match.mockResolvedValueOnce(undefined);
    mockFetch.mockResolvedValueOnce(networkResponse);

    const respondWithMock = vi.fn();
    const request = new Request('http://localhost:3000/assets/app.js');
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    expect(respondWithMock).toHaveBeenCalledOnce();
    const result = await respondWithMock.mock.calls[0][0];
    expect(result).toBe(networkResponse);
  });

  it('.css 静态资源应使用 cacheFirst 策略', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];

    const cachedResponse = makeResponse('body {}');
    mockCaches.match.mockResolvedValueOnce(cachedResponse);

    const respondWithMock = vi.fn();
    const request = new Request('http://localhost:3000/assets/styles.css');
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    expect(respondWithMock).toHaveBeenCalledOnce();
    const result = await respondWithMock.mock.calls[0][0];
    expect(result).toBe(cachedResponse);
    // fetch should NOT be called since cache hit
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('.woff2 字体文件应使用 cacheFirst 策略', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];

    const cachedResponse = makeResponse('font-data', 200, { 'Content-Type': 'font/woff2' });
    mockCaches.match.mockResolvedValueOnce(cachedResponse);

    const respondWithMock = vi.fn();
    const request = new Request('http://localhost:3000/fonts/inter.woff2');
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    expect(respondWithMock).toHaveBeenCalledOnce();
    const result = await respondWithMock.mock.calls[0][0];
    expect(result).toBe(cachedResponse);
  });

  it('/icons/ 路径应使用 cacheFirst 策略', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];

    const cachedIcon = makeResponse('icon-data', 200, { 'Content-Type': 'image/png' });
    mockCaches.match.mockResolvedValueOnce(cachedIcon);

    const respondWithMock = vi.fn();
    const request = new Request('http://localhost:3000/icons/icon-192x192.png');
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    expect(respondWithMock).toHaveBeenCalledOnce();
    const result = await respondWithMock.mock.calls[0][0];
    expect(result).toBe(cachedIcon);
  });

  it('其他请求应使用 networkFirst 策略', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];

    const networkResponse = makeResponse('<image>');
    mockFetch.mockResolvedValueOnce(networkResponse);

    const respondWithMock = vi.fn();
    const request = new Request('http://localhost:3000/some/other/resource');
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    expect(respondWithMock).toHaveBeenCalledOnce();
    const result = await respondWithMock.mock.calls[0][0];
    expect(result).toBe(networkResponse);
  });

  it('跨域请求应绕过缓存（不调用 respondWith）', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];

    const respondWithMock = vi.fn();
    const request = new Request('https://external-domain.com/api/data');
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    // Cross-origin requests bypass the cache handler
    expect(respondWithMock).not.toHaveBeenCalled();
  });

  it('.woff 字体文件应使用 cacheFirst 策略', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];

    const networkResponse = makeResponse('woff-data', 200, { 'Content-Type': 'font/woff' });
    mockCaches.match.mockResolvedValueOnce(undefined);
    mockFetch.mockResolvedValueOnce(networkResponse);

    const respondWithMock = vi.fn();
    const request = new Request('http://localhost:3000/fonts/font.woff');
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    expect(respondWithMock).toHaveBeenCalledOnce();
    const result = await respondWithMock.mock.calls[0][0];
    expect(result).toBe(networkResponse);
  });

  it('.ttf 字体文件应使用 cacheFirst 策略', async () => {
    const { handlers } = await getSWHelpers();
    const fetchHandler = handlers['fetch'];

    const networkResponse = makeResponse('ttf-data', 200, { 'Content-Type': 'font/ttf' });
    mockCaches.match.mockResolvedValueOnce(undefined);
    mockFetch.mockResolvedValueOnce(networkResponse);

    const respondWithMock = vi.fn();
    const request = new Request('http://localhost:3000/fonts/font.ttf');
    const event = { request, respondWith: respondWithMock };

    fetchHandler(event);

    expect(respondWithMock).toHaveBeenCalledOnce();
    const result = await respondWithMock.mock.calls[0][0];
    expect(result).toBe(networkResponse);
  });
});

// ==================== 回归测试 ====================

describe('SW 回归：sw.js 注册了正确的事件监听器', () => {
  it('应注册 install、fetch、activate 和 message 事件处理器', async () => {
    const { handlers } = await getSWHelpers();
    expect(typeof handlers['install']).toBe('function');
    expect(typeof handlers['fetch']).toBe('function');
    expect(typeof handlers['activate']).toBe('function');
    expect(typeof handlers['message']).toBe('function');
  });
});
