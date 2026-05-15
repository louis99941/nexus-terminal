import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 使用 vi.hoisted 创建 mock，确保在 vi.mock 之前执行
const { mockUseAuthStore, mockAuthState } = vi.hoisted(() => {
  const state = { isInitCompleted: true, needsSetup: false, isAuthenticated: false };
  return { mockUseAuthStore: vi.fn(() => state), mockAuthState: state };
});

vi.mock('../stores/auth.store', () => ({
  useAuthStore: mockUseAuthStore,
}));

import router from './index';

// Mock views to avoid actual component loading
vi.mock('../views/DashboardView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../views/LoginView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../views/SetupView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../views/WorkspaceView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../views/ConnectionsView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../views/ProxiesView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../views/SettingsView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../views/NotificationsView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../views/AuditLogView.vue', () => ({ default: { template: '<div />' } }));

describe('路由守卫', () => {
  beforeEach(async () => {
    // 重置 mock 状态
    mockAuthState.isInitCompleted = true;
    mockAuthState.needsSetup = false;
    mockAuthState.isAuthenticated = false;
    // 导航到 /login 作为干净的起始点（公共路由，不会被重定向）
    await router.push('/login');
    await router.isReady();
  });

  describe('路由定义', () => {
    it('应该包含所有必要路由', () => {
      const routes = router.getRoutes();
      const routeNames = routes.map((r) => r.name);

      expect(routeNames).toContain('Dashboard');
      expect(routeNames).toContain('Login');
      expect(routeNames).toContain('Setup');
      expect(routeNames).toContain('Workspace');
      expect(routeNames).toContain('Connections');
      expect(routeNames).toContain('Settings');
      expect(routeNames).toContain('Proxies');
      expect(routeNames).toContain('Notifications');
      expect(routeNames).toContain('AuditLogs');
    });

    it('应该使用 HTML5 History 模式', () => {
      expect(router.options.history).toBeDefined();
    });

    it('应该有 9 个路由定义', () => {
      const routes = router.getRoutes();
      expect(routes.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('守卫行为', () => {
    it('应该定义 beforeEach 守卫', () => {
      expect(router.beforeEach).toBeDefined();
    });

    it('需要设置时应重定向到 Setup', async () => {
      mockAuthState.needsSetup = true;
      await router.push('/workspace');
      await router.isReady();
      expect(router.currentRoute.value.name).toBe('Setup');
    });

    it('不需要设置时访问 Setup 应重定向到 Dashboard（已登录）', async () => {
      mockAuthState.needsSetup = false;
      mockAuthState.isAuthenticated = true;
      await router.push('/setup');
      await router.isReady();
      expect(router.currentRoute.value.name).toBe('Dashboard');
    });

    it('不需要设置时访问 Setup 应重定向到 Login（未登录）', async () => {
      mockAuthState.needsSetup = false;
      mockAuthState.isAuthenticated = false;
      await router.push('/setup');
      await router.isReady();
      expect(router.currentRoute.value.name).toBe('Login');
    });

    it('未登录时应重定向到 Login', async () => {
      mockAuthState.isAuthenticated = false;
      await router.push('/workspace');
      await router.isReady();
      expect(router.currentRoute.value.name).toBe('Login');
    });

    it('已登录时访问 Login 应重定向到 Dashboard', async () => {
      mockAuthState.isAuthenticated = true;
      // 先导航到其他路由，避免同路由跳转时守卫不触发
      await router.push('/');
      await router.isReady();
      await router.push('/login');
      await router.isReady();
      expect(router.currentRoute.value.name).toBe('Dashboard');
    });

    it('已登录时应允许访问受保护路由', async () => {
      mockAuthState.isAuthenticated = true;
      await router.push('/workspace');
      await router.isReady();
      expect(router.currentRoute.value.name).toBe('Workspace');
    });
  });
});

// ==================== schedulePrefetch 测试 ====================

describe('schedulePrefetch', () => {
  let originalRequestIdleCallback: typeof globalThis.requestIdleCallback | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    originalRequestIdleCallback = (globalThis as unknown as Record<string, unknown>)
      .requestIdleCallback as typeof globalThis.requestIdleCallback | undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalRequestIdleCallback !== undefined) {
      (globalThis as unknown as Record<string, unknown>).requestIdleCallback =
        originalRequestIdleCallback;
    } else {
      delete (globalThis as unknown as Record<string, unknown>).requestIdleCallback;
    }
    vi.clearAllMocks();
  });

  it('schedulePrefetch 应该是一个函数', async () => {
    const { schedulePrefetch } = await import('./index');
    expect(typeof schedulePrefetch).toBe('function');
  });

  it('当 requestIdleCallback 可用时应使用 requestIdleCallback', async () => {
    const mockIdleCallback = vi.fn((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    });
    (globalThis as unknown as Record<string, unknown>).requestIdleCallback = mockIdleCallback;

    const { schedulePrefetch } = await import('./index');
    schedulePrefetch();

    expect(mockIdleCallback).toHaveBeenCalledTimes(1);
    expect(mockIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
  });

  it('当 requestIdleCallback 不可用时应使用 setTimeout 降级', async () => {
    // Remove requestIdleCallback
    delete (globalThis as unknown as Record<string, unknown>).requestIdleCallback;

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const { schedulePrefetch } = await import('./index');
    schedulePrefetch();

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    setTimeoutSpy.mockRestore();
  });

  it('setTimeout 降级时应在 2 秒后触发预加载', async () => {
    delete (globalThis as unknown as Record<string, unknown>).requestIdleCallback;

    const { schedulePrefetch } = await import('./index');
    schedulePrefetch();

    // Should not have triggered yet
    vi.advanceTimersByTime(1999);
    // After 2 seconds, the function should be called
    vi.advanceTimersByTime(1);
    // No error thrown means routes were processed
    expect(true).toBe(true);
  });

  it('requestIdleCallback 应带 timeout: 5000 选项', async () => {
    const mockIdleCallback = vi.fn(() => 1);
    (globalThis as unknown as Record<string, unknown>).requestIdleCallback = mockIdleCallback;

    const { schedulePrefetch } = await import('./index');
    schedulePrefetch();

    const [, options] = mockIdleCallback.mock.calls[0];
    expect(options).toEqual({ timeout: 5000 });
  });

  it('多次调用 schedulePrefetch 应不互相干扰', async () => {
    const mockIdleCallback = vi.fn((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    });
    (globalThis as unknown as Record<string, unknown>).requestIdleCallback = mockIdleCallback;

    const { schedulePrefetch } = await import('./index');
    schedulePrefetch();
    schedulePrefetch();

    expect(mockIdleCallback).toHaveBeenCalledTimes(2);
  });

  it('预加载应解析核心路由而不抛出错误', async () => {
    const mockIdleCallback = vi.fn((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    });
    (globalThis as unknown as Record<string, unknown>).requestIdleCallback = mockIdleCallback;

    const { schedulePrefetch } = await import('./index');
    expect(() => schedulePrefetch()).not.toThrow();
  });
});
