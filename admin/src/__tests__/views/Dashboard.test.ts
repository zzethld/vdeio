import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

// Hoisted mock state
const { messageMocks, requestMocks, echartsMocks } = vi.hoisted(() => ({
  messageMocks: {
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  },
  requestMocks: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  echartsMocks: {
    init: vi.fn(() => ({
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

vi.mock('@/utils/request', () => ({ default: requestMocks }));
vi.mock('element-plus', () => ({ ElMessage: messageMocks.ElMessage }));
vi.mock('echarts', () => echartsMocks);

import Dashboard from '@/views/Dashboard.vue';
import { commonStubs } from '../helpers';

const mockStats = {
  totalVideos: 42,
  activeCampaigns: 5,
  onlineDevices: 7,
  newVideosToday: 3,
  totalDevices: 12,
  offlineDevices: 5,
  campaignDistribution: [
    { name: '活动A', value: 10 },
    { name: '活动B', value: 20 },
  ],
};

describe('Dashboard View', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // jsdom doesn't have layout / dimensions; echarts.init returns the stub automatically.
  });

  function mountDashboard() {
    // attachTo: document.body so Dashboard's document.getElementById() works.
    document.body.innerHTML = '';
    return mount(Dashboard, {
      attachTo: document.body,
      global: {
        stubs: {
          ...commonStubs,
        },
        directives: {
          loading: () => {},
        },
      },
    });
  }

  describe('rendering', () => {
    it('renders four stat cards', async () => {
      requestMocks.get.mockResolvedValue({ data: mockStats });
      const wrapper = mountDashboard();
      await flushPromises();

      const cards = wrapper.findAll('.stat-card');
      expect(cards.length).toBe(4);
    });

    it('shows zeros before fetch completes', () => {
      requestMocks.get.mockReturnValue(new Promise(() => {}));
      const wrapper = mountDashboard();

      // initial stats show 0
      expect(wrapper.html()).toContain('0');
    });

    it('renders the campaign and device chart containers', () => {
      requestMocks.get.mockResolvedValue({ data: mockStats });
      const wrapper = mountDashboard();
      expect(wrapper.find('#campaign-chart').exists()).toBe(true);
      expect(wrapper.find('#device-chart').exists()).toBe(true);
    });
  });

  describe('API call', () => {
    it('calls GET /admin/dashboard/stats on mount', async () => {
      requestMocks.get.mockResolvedValue({ data: mockStats });
      mountDashboard();
      await flushPromises();

      expect(requestMocks.get).toHaveBeenCalledWith('/admin/dashboard/stats');
    });

    it('populates stats after fetch', async () => {
      requestMocks.get.mockResolvedValue({ data: mockStats });
      const wrapper = mountDashboard();
      await flushPromises();

      expect(wrapper.html()).toContain('42'); // totalVideos
      expect(wrapper.html()).toContain('5'); // activeCampaigns
      expect(wrapper.html()).toContain('7'); // onlineDevices
      expect(wrapper.html()).toContain('3'); // newVideosToday
    });

    it('shows error message when fetch fails', async () => {
      requestMocks.get.mockRejectedValue(new Error('network'));
      const wrapper = mountDashboard();
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith('获取统计数据失败');
      // loading flag cleared
      expect(wrapper.find('.dashboard').exists()).toBe(true);
    });
  });

  describe('charts lifecycle', () => {
    it('initialises echarts instances on mount', async () => {
      requestMocks.get.mockResolvedValue({ data: mockStats });
      mountDashboard();
      await flushPromises();

      expect(echartsMocks.init).toHaveBeenCalled();
    });

    it('calls setOption when stats arrive', async () => {
      const instanceStub = {
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
      };
      echartsMocks.init.mockReturnValue(instanceStub);
      requestMocks.get.mockResolvedValue({ data: mockStats });
      mountDashboard();
      await flushPromises();

      expect(instanceStub.setOption).toHaveBeenCalled();
    });

    it('disposes charts on unmount', async () => {
      const disposeSpy = vi.fn();
      echartsMocks.init.mockReturnValue({
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: disposeSpy,
      });
      requestMocks.get.mockResolvedValue({ data: mockStats });
      const wrapper = mountDashboard();
      await flushPromises();

      wrapper.unmount();

      expect(disposeSpy).toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('renders the dashboard even with zero stats', async () => {
      requestMocks.get.mockResolvedValue({
        data: {
          totalVideos: 0,
          activeCampaigns: 0,
          onlineDevices: 0,
          newVideosToday: 0,
          totalDevices: 0,
          offlineDevices: 0,
          campaignDistribution: [],
        },
      });
      const wrapper = mountDashboard();
      await flushPromises();

      expect(wrapper.find('.dashboard').exists()).toBe(true);
    });
  });
});
