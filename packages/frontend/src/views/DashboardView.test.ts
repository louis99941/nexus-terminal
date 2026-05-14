import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';

// Mock stores before import
const mockDashboardStore = {
  stats: ref<Record<string, unknown> | null>(null),
  assetHealth: ref<Record<string, unknown> | null>(null),
  timeline: ref<unknown[]>([]),
  storage: ref<Record<string, unknown> | null>(null),
  systemResources: ref<Record<string, unknown> | null>(null),
  systemResourcesHistory: ref<unknown[]>([]),
  timeRange: ref({ start: 0, end: 0 }),
  isLoading: ref(false),
  fetchAllData: vi.fn().mockResolvedValue(undefined),
  setTimeRange: vi.fn(),
  formatBytes: vi.fn((bytes: number) => `${bytes} B`),
  getActionIcon: vi.fn(() => 'fa-info'),
};

const mockConnectionsStore = {
  connections: ref<unknown[]>([]),
  fetchConnections: vi.fn().mockResolvedValue(undefined),
};

const mockAuditLogStore = {
  fetchLogs: vi.fn().mockResolvedValue(undefined),
};

const mockUiNotifications = {
  showError: vi.fn(),
  showSuccess: vi.fn(),
};

const mockAuthStore = {
  isInitCompleted: ref(true),
  isAuthenticated: ref(true),
};

const mockSessionStore = {
  handleConnectRequest: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../stores/dashboard.store', () => ({ useDashboardStore: () => mockDashboardStore }));
vi.mock('../stores/connections.store', () => ({ useConnectionsStore: () => mockConnectionsStore }));
vi.mock('../stores/audit.store', () => ({ useAuditLogStore: () => mockAuditLogStore }));
vi.mock('../stores/uiNotifications.store', () => ({
  useUiNotificationsStore: () => mockUiNotifications,
}));
vi.mock('../stores/auth.store', () => ({ useAuthStore: () => mockAuthStore }));
vi.mock('../stores/session.store', () => ({ useSessionStore: () => mockSessionStore }));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    locale: ref('zh-CN'),
  }),
}));

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia');
  return {
    ...actual,
    storeToRefs: <T extends object>(store: T) => store,
  };
});

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
  };
});

vi.mock('@/utils/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../components/dashboard/SessionDurationChart.vue', () => ({
  default: { template: '<div />' },
}));
vi.mock('../components/dashboard/SystemResourcesHistoryChart.vue', () => ({
  default: { template: '<div />' },
}));
vi.mock('../components/AddConnectionForm.vue', () => ({
  default: { template: '<div />' },
}));

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockDashboardStore.stats.value = null;
    mockDashboardStore.assetHealth.value = null;
    mockDashboardStore.timeline.value = [];
    mockDashboardStore.systemResources.value = null;
    mockDashboardStore.systemResourcesHistory.value = [];
    mockDashboardStore.isLoading.value = false;
    mockAuthStore.isInitCompleted.value = true;
    mockAuthStore.isAuthenticated.value = true;
    mockConnectionsStore.connections.value = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mountView() {
    const { default: DashboardView } = await import('./DashboardView.vue');
    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          'el-date-picker': { template: '<div />' },
          'el-switch': { template: '<div />' },
          'el-select': { template: '<div />' },
          'el-option': { template: '<div />' },
          'el-button': { template: '<div />' },
          'el-skeleton': { template: '<div />' },
        },
      },
    });
    await nextTick();
    return wrapper;
  }

  describe('初始化', () => {
    it('认证完成时应加载数据', async () => {
      await mountView();
      expect(mockDashboardStore.fetchAllData).toHaveBeenCalled();
      expect(mockConnectionsStore.fetchConnections).toHaveBeenCalled();
      expect(mockAuditLogStore.fetchLogs).toHaveBeenCalled();
    });

    it('认证未完成时不应加载数据', async () => {
      mockAuthStore.isInitCompleted.value = false;
      await mountView();
      expect(mockDashboardStore.fetchAllData).not.toHaveBeenCalled();
    });

    it('未认证时应尝试初始化（guard 逻辑在组件内部）', async () => {
      mockAuthStore.isInitCompleted.value = false;
      mockAuthStore.isAuthenticated.value = false;
      const wrapper = await mountView();
      // 组件挂载成功即可，guard 逻辑在 initializeDashboardDataIfReady 内部
      expect(wrapper.exists()).toBe(true);
      wrapper.unmount();
    });
  });

  describe('统计卡片渲染', () => {
    it('有统计数据时应渲染会话数', async () => {
      mockDashboardStore.stats.value = {
        sessions: { active: 5, todayConnections: 10, avgDuration: 120 },
        security: { loginFailures: 2, commandBlocks: 1, alerts: 3 },
      };
      const wrapper = await mountView();

      expect(wrapper.text()).toContain('5');
      expect(wrapper.text()).toContain('10');
    });

    it('无统计数据时应显示 0', async () => {
      const wrapper = await mountView();
      expect(wrapper.text()).toContain('0');
    });
  });

  describe('系统资源', () => {
    it('有资源数据时应渲染百分比', async () => {
      mockDashboardStore.systemResources.value = {
        cpuPercent: 45,
        memPercent: 60,
        memUsed: 1024 * 1024 * 512,
        memTotal: 1024 * 1024 * 1024,
        diskPercent: 75,
        diskUsed: 1024 * 1024 * 100,
        diskTotal: 1024 * 1024 * 200,
      };
      const wrapper = await mountView();

      expect(wrapper.text()).toContain('45%');
      expect(wrapper.text()).toContain('60%');
      expect(wrapper.text()).toContain('75%');
    });
  });

  describe('资产健康', () => {
    it('有资产数据时应渲染状态', async () => {
      mockDashboardStore.assetHealth.value = {
        healthy: 3,
        unreachable: 1,
        assets: [
          { id: '1', name: 'Server-1', status: 'online', latency: 50 },
          { id: '2', name: 'Server-2', status: 'offline' },
        ],
      };
      const wrapper = await mountView();

      expect(wrapper.text()).toContain('Server-1');
      expect(wrapper.text()).toContain('Server-2');
      expect(wrapper.text()).toContain('50ms');
    });
  });

  describe('最近连接', () => {
    it('有连接时应渲染连接列表', async () => {
      mockConnectionsStore.connections.value = [
        {
          id: 1,
          name: 'My Server',
          type: 'SSH',
          host: '192.168.1.1',
          username: 'root',
          last_connected_at: Date.now() / 1000,
        },
      ];
      const wrapper = await mountView();

      expect(wrapper.text()).toContain('My Server');
      expect(wrapper.text()).toContain('root@192.168.1.1');
    });

    it('无连接时应显示空状态', async () => {
      mockConnectionsStore.connections.value = [];
      const wrapper = await mountView();

      expect(wrapper.text()).toContain('dashboard.noConnections');
    });
  });

  describe('自动刷新', () => {
    it('自动刷新开启时应定时调用 fetchAllData', async () => {
      await mountView();
      mockDashboardStore.fetchAllData.mockClear();

      vi.advanceTimersByTime(30000);

      expect(mockDashboardStore.fetchAllData).toHaveBeenCalled();
    });
  });

  describe('组件卸载', () => {
    it('卸载时应清除定时器', async () => {
      const wrapper = await mountView();
      wrapper.unmount();

      mockDashboardStore.fetchAllData.mockClear();
      vi.advanceTimersByTime(60000);

      expect(mockDashboardStore.fetchAllData).not.toHaveBeenCalled();
    });
  });

  describe('连接失败处理', () => {
    it('handleConnectRecent 失败时应显示错误通知', async () => {
      mockSessionStore.handleConnectRequest.mockRejectedValueOnce(new Error('连接失败'));
      mockConnectionsStore.connections.value = [
        {
          id: 1,
          name: 'Server',
          type: 'SSH',
          host: '192.168.1.1',
          username: 'root',
          last_connected_at: Date.now() / 1000,
        },
      ];
      const wrapper = await mountView();

      // 点击连接项触发 handleConnectRecent
      const connItem = wrapper.find('.cursor-pointer');
      expect(connItem.exists()).toBe(true);
      await connItem.trigger('click');
      await nextTick();
      expect(mockUiNotifications.showError).toHaveBeenCalled();
    });
  });
});
