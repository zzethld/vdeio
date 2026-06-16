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
  useRoute: () => ({ path: '/campaigns', query: {}, params: {}, meta: {} }),
}));

import CampaignList from '@/views/campaign/CampaignList.vue';
import { commonStubs } from '../../helpers';

const mockCampaigns = [
  {
    id: 1,
    title: 'Summer Promo',
    description: 'Summer campaign',
    status: 'active' as const,
    startTime: '2025-06-01T00:00:00Z',
    endTime: '2025-09-01T00:00:00Z',
    createdAt: '2025-05-15T00:00:00Z',
  },
  {
    id: 2,
    title: 'Draft Campaign',
    description: null,
    status: 'draft' as const,
    startTime: '2025-07-01T00:00:00Z',
    endTime: '2025-08-01T00:00:00Z',
    createdAt: '2025-05-20T00:00:00Z',
  },
];

describe('CampaignList View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountList() {
    return mount(CampaignList, {
      global: {
        stubs: commonStubs,
        directives: { loading: () => {} },
      },
    });
  }

  describe('rendering', () => {
    it('renders the page header with create button', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.find('.page-header').exists()).toBe(true);
      expect(wrapper.text()).toContain('新建推广计划');
    });

    it('renders the status filter select', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.find('.el-select-stub').exists()).toBe(true);
    });
  });

  describe('API call', () => {
    it('calls GET /admin/campaigns on mount with default params', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      mountList();
      await flushPromises();

      expect(requestMocks.get).toHaveBeenCalledWith('/admin/campaigns', {
        params: { page: 1, pageSize: 20 },
      });
    });

    it('renders returned rows', async () => {
      requestMocks.get.mockResolvedValue({
        data: { rows: mockCampaigns, count: 2 },
      });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.findAll('.el-table-stub-row').length).toBe(2);
      expect(wrapper.text()).toContain('Summer Promo');
      expect(wrapper.text()).toContain('Draft Campaign');
    });

    it('shows error message on fetch failure', async () => {
      requestMocks.get.mockRejectedValue(new Error('fail'));
      const wrapper = mountList();
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith('获取推广计划列表失败');
      expect(wrapper.find('.campaign-list').exists()).toBe(true);
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

  describe('navigation', () => {
    it('navigates to /campaigns/create when create button clicked', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      const createBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.classes().includes('primary'));
      await createBtn?.trigger('click');

      expect(routerMocks.push).toHaveBeenCalledWith('/campaigns/create');
    });

    it('navigates to detail page on "查看" click', async () => {
      requestMocks.get.mockResolvedValue({
        data: { rows: mockCampaigns, count: 2 },
      });
      const wrapper = mountList();
      await flushPromises();

      const viewBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('查看'));
      expect(viewBtns.length).toBeGreaterThan(0);
      await viewBtns[0].trigger('click');

      expect(routerMocks.push).toHaveBeenCalledWith('/campaigns/1');
    });

    it('navigates to edit page on "编辑" click (draft only)', async () => {
      requestMocks.get.mockResolvedValue({
        data: { rows: mockCampaigns, count: 2 },
      });
      const wrapper = mountList();
      await flushPromises();

      const editBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('编辑'));
      expect(editBtns.length).toBe(1); // only draft row has edit
      await editBtns[0].trigger('click');

      expect(routerMocks.push).toHaveBeenCalledWith('/campaigns/edit/2');
    });
  });

  describe('handleDelete', () => {
    it('deletes after confirm and shows success', async () => {
      messageMocks.ElMessageBox.confirm.mockResolvedValue('confirm');
      requestMocks.delete.mockResolvedValue({});
      requestMocks.get.mockResolvedValue({
        data: { rows: mockCampaigns, count: 2 },
      });
      const wrapper = mountList();
      await flushPromises();

      const deleteBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.classes().includes('danger') && b.text().includes('删除'));
      // Only the draft row has a delete button
      expect(deleteBtns.length).toBe(1);
      await deleteBtns[0].trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessageBox.confirm).toHaveBeenCalled();
      expect(requestMocks.delete).toHaveBeenCalledWith('/admin/campaigns/2');
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('删除成功');
    });

    it('does not delete when cancelled', async () => {
      messageMocks.ElMessageBox.confirm.mockRejectedValue(new Error('cancel'));
      requestMocks.get.mockResolvedValue({
        data: { rows: mockCampaigns, count: 2 },
      });
      const wrapper = mountList();
      await flushPromises();

      const deleteBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.classes().includes('danger') && b.text().includes('删除'));
      await deleteBtns[0].trigger('click');
      await flushPromises();

      expect(requestMocks.delete).not.toHaveBeenCalled();
    });
  });
});
