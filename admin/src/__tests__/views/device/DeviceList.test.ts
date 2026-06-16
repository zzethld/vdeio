import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { messageMocks, requestMocks, routerMocks } = vi.hoisted(() => ({
  messageMocks: {
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
    ElMessageBox: { confirm: vi.fn(), alert: vi.fn() },
  },
  requestMocks: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  routerMocks: {
    push: vi.fn(async () => undefined),
  },
}));

vi.mock('@/utils/request', () => ({ default: requestMocks }));
vi.mock('element-plus', () => ({
  ElMessage: messageMocks.ElMessage,
  ElMessageBox: messageMocks.ElMessageBox,
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerMocks.push }),
  useRoute: () => ({ path: '/devices', query: {}, params: {}, meta: {} }),
}));

import DeviceList from '@/views/device/DeviceList.vue';
import { commonStubs } from '../../helpers';

const mockDevices = [
  {
    id: 1,
    deviceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    storeId: 10,
    deviceName: 'Kiosk A',
    osVersion: 'Windows 10',
    appVersion: '1.2.3',
    lastOnlineAt: '2025-06-01T10:00:00Z',
    status: 'online' as const,
    localPaths: {},
    createdAt: '2025-05-01T00:00:00Z',
  },
  {
    id: 2,
    deviceId: 'ffffffff-0000-1111-2222-333333333333',
    storeId: null,
    deviceName: null,
    osVersion: null,
    appVersion: null,
    lastOnlineAt: null,
    status: 'offline' as const,
    localPaths: {},
    createdAt: '2025-05-02T00:00:00Z',
  },
];

describe('DeviceList View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountList() {
    return mount(DeviceList, {
      global: {
        stubs: commonStubs,
        directives: { loading: () => {} },
      },
    });
  }

  describe('rendering', () => {
    it('renders the page header', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.find('.page-header').exists()).toBe(true);
    });

    it('renders the status filter select', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.find('.el-select-stub').exists()).toBe(true);
    });
  });

  describe('API call', () => {
    it('calls GET /admin/devices on mount', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      mountList();
      await flushPromises();

      expect(requestMocks.get).toHaveBeenCalledWith('/admin/devices', {
        params: { page: 1, pageSize: 20 },
      });
    });

    it('renders returned rows', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: mockDevices, count: 2 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.findAll('.el-table-stub-row').length).toBe(2);
      expect(wrapper.text()).toContain('Kiosk A');
    });

    it('shows error on fetch failure', async () => {
      requestMocks.get.mockRejectedValue(new Error('fail'));
      const wrapper = mountList();
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith('获取设备列表失败');
      expect(wrapper.find('.device-list').exists()).toBe(true);
    });

    it('handles empty list', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.findAll('.el-table-stub-row').length).toBe(0);
    });

    it('handles missing rows in response', async () => {
      requestMocks.get.mockResolvedValue({ data: {} });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.findAll('.el-table-stub-row').length).toBe(0);
    });
  });

  describe('showTelemetry', () => {
    it('opens telemetry dialog and fetches telemetry', async () => {
      requestMocks.get.mockImplementation(async (url: string) => {
        if (url === '/admin/devices') return { data: { rows: mockDevices, count: 2 } };
        if (url.includes('/telemetry'))
          return {
            data: {
              telemetries: [
                {
                  id: 1,
                  deviceId: mockDevices[0].deviceId,
                  cpu: 50,
                  memory: 60,
                  disk: 70,
                  temperature: 40,
                  createdAt: '2025-06-01T10:00:00Z',
                },
              ],
            },
          };
        return { data: {} };
      });

      const wrapper = mountList();
      await flushPromises();

      // Dialog closed initially
      expect(wrapper.find('.el-dialog-stub').exists()).toBe(false);

      // Click first "遥测" button
      const telemetryBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('遥测'));
      expect(telemetryBtns.length).toBe(2);
      await telemetryBtns[0].trigger('click');
      await flushPromises();

      expect(wrapper.find('.el-dialog-stub').exists()).toBe(true);
      expect(requestMocks.get).toHaveBeenCalledWith(
        `/admin/devices/${mockDevices[0].deviceId}/telemetry`,
        { params: { limit: 50 } },
      );
    });

    it('shows error when telemetry fetch fails', async () => {
      requestMocks.get.mockImplementation(async (url: string) => {
        if (url === '/admin/devices') return { data: { rows: mockDevices, count: 2 } };
        throw new Error('telemetry fail');
      });

      const wrapper = mountList();
      await flushPromises();

      const telemetryBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('遥测'));
      await telemetryBtns[0].trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith('获取遥测数据失败');
    });
  });

  describe('sendCommand', () => {
    it('sends sync command after confirm', async () => {
      messageMocks.ElMessageBox.confirm.mockResolvedValue('confirm');
      requestMocks.post.mockResolvedValue({});
      requestMocks.get.mockResolvedValue({ data: { rows: mockDevices, count: 2 } });

      const wrapper = mountList();
      await flushPromises();

      const syncBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('同步'));
      expect(syncBtns.length).toBe(2);
      await syncBtns[0].trigger('click');
      await flushPromises();

      expect(requestMocks.post).toHaveBeenCalledWith(
        `/admin/devices/${mockDevices[0].deviceId}/command`,
        { command: 'sync' },
      );
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('「同步」命令已发送');
    });

    it('sends restart command after confirm', async () => {
      messageMocks.ElMessageBox.confirm.mockResolvedValue('confirm');
      requestMocks.post.mockResolvedValue({});
      requestMocks.get.mockResolvedValue({ data: { rows: mockDevices, count: 2 } });

      const wrapper = mountList();
      await flushPromises();

      const restartBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('重启'));
      await restartBtns[0].trigger('click');
      await flushPromises();

      expect(requestMocks.post).toHaveBeenCalledWith(
        `/admin/devices/${mockDevices[0].deviceId}/command`,
        { command: 'restart' },
      );
    });

    it('does not send when confirm cancelled', async () => {
      messageMocks.ElMessageBox.confirm.mockRejectedValue(new Error('cancel'));
      requestMocks.get.mockResolvedValue({ data: { rows: mockDevices, count: 2 } });

      const wrapper = mountList();
      await flushPromises();

      const syncBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('同步'));
      await syncBtns[0].trigger('click');
      await flushPromises();

      expect(requestMocks.post).not.toHaveBeenCalled();
    });
  });
});
