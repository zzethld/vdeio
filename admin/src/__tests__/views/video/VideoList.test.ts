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
    ElMessageBox: {
      confirm: vi.fn(),
      alert: vi.fn(),
    },
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
  useRoute: () => ({ path: '/videos', query: {}, params: {}, meta: {} }),
}));

import VideoList from '@/views/video/VideoList.vue';
import { commonStubs } from '../../helpers';

const mockVideos = [
  {
    id: 1,
    title: 'Promo Video',
    fileSize: 100 * 1024 * 1024,
    encryptStatus: 'done' as const,
    createdAt: '2025-01-01T10:00:00Z',
    resolution: '1080p',
  },
  {
    id: 2,
    title: null,
    fileSize: null,
    encryptStatus: 'pending' as const,
    createdAt: '2025-01-02T10:00:00Z',
    resolution: null,
  },
];

describe('VideoList View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountVideoList() {
    return mount(VideoList, {
      global: {
        stubs: commonStubs,
        directives: { loading: () => {} },
      },
    });
  }

  describe('rendering', () => {
    it('renders the page header with upload button', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountVideoList();
      await flushPromises();

      expect(wrapper.find('.page-header').exists()).toBe(true);
      expect(wrapper.text()).toContain('上传视频');
    });

    it('renders search input and status filter', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountVideoList();
      await flushPromises();

      expect(wrapper.find('.filter-input').exists()).toBe(true);
      expect(wrapper.find('.filter-select').exists()).toBe(true);
    });
  });

  describe('API call', () => {
    it('calls GET /admin/videos on mount with default params', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      mountVideoList();
      await flushPromises();

      expect(requestMocks.get).toHaveBeenCalledWith('/admin/videos', {
        params: { page: 1, pageSize: 20 },
      });
    });

    it('renders the returned rows', async () => {
      requestMocks.get.mockResolvedValue({
        data: { rows: mockVideos, count: 2 },
      });
      const wrapper = mountVideoList();
      await flushPromises();

      // 2 rows
      expect(wrapper.findAll('.el-table-stub-row').length).toBe(2);
      expect(wrapper.text()).toContain('Promo Video');
    });

    it('shows error message when fetch fails', async () => {
      requestMocks.get.mockRejectedValue(new Error('fail'));
      const wrapper = mountVideoList();
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith('获取视频列表失败');
      // Renders without crashing
      expect(wrapper.find('.video-list').exists()).toBe(true);
    });

    it('handles empty list gracefully', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountVideoList();
      await flushPromises();

      expect(wrapper.findAll('.el-table-stub-row').length).toBe(0);
    });

    it('handles missing rows in response', async () => {
      requestMocks.get.mockResolvedValue({ data: {} });
      const wrapper = mountVideoList();
      await flushPromises();

      expect(wrapper.findAll('.el-table-stub-row').length).toBe(0);
    });
  });

  describe('handleUpload', () => {
    it('navigates to /videos/upload when upload button clicked', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountVideoList();
      await flushPromises();

      const buttons = wrapper.findAll('.el-button-stub');
      // Upload button is the "primary" one in the header
      const uploadBtn = buttons.find((b) => b.classes().includes('primary'));
      await uploadBtn?.trigger('click');

      expect(routerMocks.push).toHaveBeenCalledWith('/videos/upload');
    });
  });

  describe('handleDelete', () => {
    it('calls DELETE /admin/videos/:id after confirm', async () => {
      messageMocks.ElMessageBox.confirm.mockResolvedValue('confirm');
      requestMocks.delete.mockResolvedValue({});
      requestMocks.get.mockResolvedValue({
        data: { rows: mockVideos, count: 2 },
      });
      const wrapper = mountVideoList();
      await flushPromises();

      // Find the row's delete button. Our ElTable stub renders rows with slot
      // content; the danger button is inside each row.
      const deleteButtons = wrapper.findAll('button.el-button-stub').filter((b) =>
        b.classes().includes('danger'),
      );
      expect(deleteButtons.length).toBeGreaterThan(0);
      await deleteButtons[0].trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessageBox.confirm).toHaveBeenCalled();
      expect(requestMocks.delete).toHaveBeenCalledWith('/admin/videos/1');
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('删除成功');
    });

    it('does not delete when confirm is cancelled', async () => {
      messageMocks.ElMessageBox.confirm.mockRejectedValue(new Error('cancel'));
      requestMocks.get.mockResolvedValue({
        data: { rows: mockVideos, count: 2 },
      });
      const wrapper = mountVideoList();
      await flushPromises();

      const deleteButtons = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.classes().includes('danger'));
      await deleteButtons[0].trigger('click');
      await flushPromises();

      expect(requestMocks.delete).not.toHaveBeenCalled();
    });
  });

  describe('handleSearch', () => {
    it('resets page to 1 and refetches', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountVideoList();
      await flushPromises();

      requestMocks.get.mockClear();
      // Find the search button (not primary, no danger, not in row)
      const buttons = wrapper.findAll('button.el-button-stub');
      const searchBtn = buttons.find((b) => {
        const cls = b.classes();
        return !cls.includes('primary') && !cls.includes('danger');
      });
      await searchBtn?.trigger('click');
      await flushPromises();

      expect(requestMocks.get).toHaveBeenCalled();
      const calls = requestMocks.get.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[1]).toEqual({ params: { page: 1, pageSize: 20 } });
    });
  });
});
