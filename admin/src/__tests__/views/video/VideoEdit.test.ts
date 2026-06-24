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
  useRoute: () => ({ path: '/videos/edit/1', query: {}, params: { id: '1' }, meta: {} }),
}));

import VideoEdit from '@/views/video/VideoEdit.vue';
import { commonStubs, createElFormStub } from '../../helpers';

const mockVideo = {
  id: 1,
  title: 'Editable Video',
  description: 'A description',
  fileSize: 1024 * 1024,
  encryptStatus: 'done',
  createdAt: '2025-01-01T00:00:00Z',
  resolution: '1080p',
  accessMode: 'campaign' as const,
  offlineAllowed: true,
  keyTtlHours: 24,
};

const mockCodes = [
  {
    id: 10,
    code: 'ABC123',
    storeId: null,
    storeName: null,
    maxUses: null,
    useCount: 3,
    expiresAt: null,
    status: 'active' as const,
  },
  {
    id: 11,
    code: 'XYZ999',
    storeId: 2,
    storeName: 'Store A',
    maxUses: 100,
    useCount: 50,
    expiresAt: '2025-12-31T00:00:00Z',
    status: 'disabled' as const,
  },
];

describe('VideoEdit View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path mocks
    requestMocks.get.mockImplementation((url: string) => {
      if (url === '/admin/videos/1') {
        return Promise.resolve({ data: mockVideo });
      }
      if (url === '/admin/videos/1/codes') {
        return Promise.resolve({ data: { codes: mockCodes } });
      }
      if (url === '/admin/stores') {
        return Promise.resolve({ data: { rows: [] } });
      }
      return Promise.resolve({ data: {} });
    });
    requestMocks.put.mockResolvedValue({});
    requestMocks.post.mockResolvedValue({});
    requestMocks.delete.mockResolvedValue({});
  });

  function mountVideoEdit() {
    const { ElFormStub } = createElFormStub();
    return mount(VideoEdit, {
      global: {
        stubs: {
          ...commonStubs,
          ElForm: ElFormStub,
        },
        directives: { loading: () => {} },
      },
    });
  }

  describe('mount & data loading', () => {
    it('fetches video and codes on mount', async () => {
      const wrapper = mountVideoEdit();
      await flushPromises();

      expect(requestMocks.get).toHaveBeenCalledWith('/admin/videos/1');
      expect(requestMocks.get).toHaveBeenCalledWith('/admin/videos/1/codes');
      // Title rendered
      expect(wrapper.text()).toContain('编辑视频');
    });

    it('shows error when video fetch fails', async () => {
      requestMocks.get.mockImplementation((url: string) => {
        if (url === '/admin/videos/1') {
          return Promise.reject(new Error('not found'));
        }
        if (url === '/admin/videos/1/codes') {
          return Promise.resolve({ data: { codes: [] } });
        }
        return Promise.resolve({ data: {} });
      });
      const wrapper = mountVideoEdit();
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith('获取视频失败');
      expect(wrapper.find('.video-edit').exists()).toBe(true);
    });
  });

  describe('policy section rendering', () => {
    it('renders access mode select, offline switch, key ttl input', async () => {
      const wrapper = mountVideoEdit();
      await flushPromises();

      // Form-item labels and switch active-text are passed as attrs by the
      // passthrough stubs, so assert on the rendered stub components instead.
      expect(wrapper.find('.form-medium').exists()).toBe(true);
      expect(wrapper.find('.el-switch-stub').exists()).toBe(true);
      expect(wrapper.find('.el-input-number-stub').exists()).toBe(true);
      // Hint text inside form-items IS rendered as DOM text
      expect(wrapper.text()).toContain('控制客户端访问视频的方式');
      expect(wrapper.text()).toContain('客户端 AES 密钥的本地缓存时长');
    });
  });

  describe('handleSave', () => {
    it('calls PUT /admin/videos/:id with policy fields then navigates back', async () => {
      const wrapper = mountVideoEdit();
      await flushPromises();

      // Find the save button (primary button in policy tab footer)
      const buttons = wrapper.findAll('button.el-button-stub');
      const saveBtn = buttons.find((b) => b.classes().includes('primary'));
      expect(saveBtn).toBeTruthy();
      await saveBtn!.trigger('click');
      await flushPromises();

      expect(requestMocks.put).toHaveBeenCalledWith('/admin/videos/1', {
        title: 'Editable Video',
        description: 'A description',
        accessMode: 'campaign',
        offlineAllowed: true,
        keyTtlHours: 24,
      });
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('保存成功');
      expect(routerMocks.push).toHaveBeenCalledWith('/videos');
    });

    it('does not duplicate error message when PUT fails (interceptor owns it)', async () => {
      requestMocks.put.mockRejectedValue({
        response: { data: { message: 'validation failed' } },
      });
      const wrapper = mountVideoEdit();
      await flushPromises();

      const buttons = wrapper.findAll('button.el-button-stub');
      const saveBtn = buttons.find((b) => b.classes().includes('primary'));
      await saveBtn!.trigger('click');
      await flushPromises();

      // Error feedback is the request interceptor's responsibility; the view
      // must not show a second ElMessage.error.
      expect(messageMocks.ElMessage.error).not.toHaveBeenCalled();
    });
  });

  describe('access code management', () => {
    it('renders the codes table with fetched rows', async () => {
      const wrapper = mountVideoEdit();
      await flushPromises();

      // Switch to codes tab by finding the 新增授权码 button after switching
      // ElTabs stub passes through content so both panes render
      expect(wrapper.text()).toContain('授权码管理');
      expect(wrapper.text()).toContain('ABC123');
      expect(wrapper.text()).toContain('XYZ999');
    });

    it('opens create dialog when 新增授权码 clicked', async () => {
      const wrapper = mountVideoEdit();
      await flushPromises();

      const buttons = wrapper.findAll('button.el-button-stub');
      const addBtn = buttons.find((b) => b.text().includes('新增授权码'));
      expect(addBtn).toBeTruthy();
      await addBtn!.trigger('click');
      await flushPromises();

      // Dialog stub renders only when modelValue is true
      expect(wrapper.find('.el-dialog-stub').exists()).toBe(true);
      // It should fetch stores for the store select
      expect(requestMocks.get).toHaveBeenCalledWith('/admin/stores', {
        params: { pageSize: 1000 },
      });
    });

    it('creates code via POST and refreshes list', async () => {
      const wrapper = mountVideoEdit();
      await flushPromises();

      // open dialog
      const buttons = wrapper.findAll('button.el-button-stub');
      const addBtn = buttons.find((b) => b.text().includes('新增授权码'));
      await addBtn!.trigger('click');
      await flushPromises();

      requestMocks.post.mockClear();
      requestMocks.get.mockClear();
      // Click the 创建 button (primary inside dialog footer)
      const dialogButtons = wrapper.findAll('button.el-button-stub');
      const createBtn = dialogButtons
        .filter((b) => b.classes().includes('primary'))
        .find((b) => b.text().includes('创建'));
      expect(createBtn).toBeTruthy();
      await createBtn!.trigger('click');
      await flushPromises();

      expect(requestMocks.post).toHaveBeenCalled();
      const [url, payload] = requestMocks.post.mock.calls[0];
      expect(url).toBe('/admin/videos/1/codes');
      expect(payload).toHaveProperty('code');
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('授权码已创建');
    });

    it('disables a code after confirm', async () => {
      messageMocks.ElMessageBox.confirm.mockResolvedValue('confirm');
      const wrapper = mountVideoEdit();
      await flushPromises();

      requestMocks.put.mockClear();
      const buttons = wrapper.findAll('button.el-button-stub');
      // First row's "禁用" button (active code -> 禁用)
      const disableBtn = buttons.find((b) => b.text().trim() === '禁用');
      expect(disableBtn).toBeTruthy();
      await disableBtn!.trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessageBox.confirm).toHaveBeenCalled();
      expect(requestMocks.put).toHaveBeenCalledWith('/admin/codes/10', {
        status: 'disabled',
      });
    });

    it('deletes a code after confirm', async () => {
      messageMocks.ElMessageBox.confirm.mockResolvedValue('confirm');
      const wrapper = mountVideoEdit();
      await flushPromises();

      requestMocks.delete.mockClear();
      const buttons = wrapper.findAll('button.el-button-stub');
      const deleteBtns = buttons.filter((b) => b.text().trim() === '删除');
      expect(deleteBtns.length).toBeGreaterThan(0);
      await deleteBtns[0].trigger('click');
      await flushPromises();

      expect(requestMocks.delete).toHaveBeenCalledWith('/admin/codes/10');
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('删除成功');
    });
  });
});
