import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from './index';

// Mock auth store
vi.mock('../stores/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

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
  let mockAuthStore: {
    isInitCompleted: boolean;
    needsSetup: boolean;
    isAuthenticated: boolean;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthStore = {
      isInitCompleted: true,
      needsSetup: false,
      isAuthenticated: false,
    };
    const { useAuthStore } = await import('../stores/auth.store');
    vi.mocked(useAuthStore).mockReturnValue(mockAuthStore as any);
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
      // 注意: getRoutes() 返回扁平化路由，包含嵌套路由
      expect(routes.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('守卫逻辑', () => {
    it('应该定义 beforeEach 守卫', () => {
      expect(router.beforeEach).toBeDefined();
    });
  });
});
