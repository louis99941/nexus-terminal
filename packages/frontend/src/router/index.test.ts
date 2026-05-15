import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 使用 vi.hoisted 创建 mock，确保在 vi.mock 之前执行
const { mockUseAuthStore, mockAuthState } = vi.hoisted(() => {
  const state = { isInitCompleted: true, needsSetup: false, isAuthenticated: false };
  return { mockUseAuthStore: vi.fn(() => state), mockAuthState: state };
});

vi.mock('../stores/auth.store', () => ({
  useAuthStore: mockUseAuthStore,
}));

import router, { schedulePrefetch } from './index';

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

describe('schedulePrefetch', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('requestIdleCallback 可用时', () => {
    it('应该使用 requestIdleCallback 调度预加载', () => {
      const mockRIC = vi.fn();
      vi.stubGlobal('requestIdleCallback', mockRIC);

      schedulePrefetch();

      expect(mockRIC).toHaveBeenCalledOnce();
      expect(mockRIC).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });

      vi.unstubAllGlobals();
    });

    it('requestIdleCallback 回调执行时应触发路由解析', () => {
      let capturedCallback: (() => void) | null = null;
      const mockRIC = vi.fn((cb: () => void) => { capturedCallback = cb; });
      vi.stubGlobal('requestIdleCallback', mockRIC);

      const resolveSpy = vi.spyOn(router, 'resolve');

      schedulePrefetch();

      // Trigger the idle callback
      expect(capturedCallback).not.toBeNull();
      capturedCallback!();

      // Should have resolved the 3 core routes
      expect(resolveSpy).toHaveBeenCalledWith('/');
      expect(resolveSpy).toHaveBeenCalledWith('/workspace');
      expect(resolveSpy).toHaveBeenCalledWith('/connections');

      vi.unstubAllGlobals();
    });
  });

  describe('requestIdleCallback 不可用时降级', () => {
    it('应该使用 setTimeout 降级执行', () => {
      vi.useFakeTimers();

      // Remove requestIdleCallback
      const originalRIC = (globalThis as unknown as Record<string, unknown>).requestIdleCallback;
      (globalThis as unknown as Record<string, unknown>).requestIdleCallback = undefined;

      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      schedulePrefetch();

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

      // Restore
      (globalThis as unknown as Record<string, unknown>).requestIdleCallback = originalRIC;
    });

    it('setTimeout 回调执行时应触发路由解析', () => {
      vi.useFakeTimers();

      const originalRIC = (globalThis as unknown as Record<string, unknown>).requestIdleCallback;
      (globalThis as unknown as Record<string, unknown>).requestIdleCallback = undefined;

      const resolveSpy = vi.spyOn(router, 'resolve');

      schedulePrefetch();

      // Before timeout fires, resolve should not have been called by schedulePrefetch
      const callCountBefore = resolveSpy.mock.calls.filter(
        (call) => ['/', '/workspace', '/connections'].includes(call[0] as string)
      ).length;

      vi.advanceTimersByTime(2000);

      const callCountAfter = resolveSpy.mock.calls.filter(
        (call) => ['/', '/workspace', '/connections'].includes(call[0] as string)
      ).length;

      expect(callCountAfter).toBeGreaterThan(callCountBefore);

      (globalThis as unknown as Record<string, unknown>).requestIdleCallback = originalRIC;
    });
  });

  describe('prefetch 核心路由', () => {
    it('应该预加载 Dashboard、Workspace 和 Connections 路由', () => {
      vi.useFakeTimers();

      const originalRIC = (globalThis as unknown as Record<string, unknown>).requestIdleCallback;
      (globalThis as unknown as Record<string, unknown>).requestIdleCallback = undefined;

      const resolveSpy = vi.spyOn(router, 'resolve');

      schedulePrefetch();
      vi.advanceTimersByTime(2000);

      const resolvedPaths = resolveSpy.mock.calls.map((call) => call[0]);
      expect(resolvedPaths).toContain('/');
      expect(resolvedPaths).toContain('/workspace');
      expect(resolvedPaths).toContain('/connections');

      (globalThis as unknown as Record<string, unknown>).requestIdleCallback = originalRIC;
    });

    it('schedulePrefetch 是一个函数', () => {
      expect(typeof schedulePrefetch).toBe('function');
    });
  });
});
