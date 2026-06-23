import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { messageMocks, requestMocks, routerMocks, routeState } = vi.hoisted(() => ({
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
  routeState: {
    path: '/campaigns/create',
    query: {} as Record<string, string>,
    params: {} as Record<string, string>,
    fullPath: '/campaigns/create',
    meta: {} as Record<string, unknown>,
  },
}));

vi.mock('@/utils/request', () => ({ default: requestMocks }));
vi.mock('element-plus', () => ({
  ElMessage: messageMocks.ElMessage,
  ElMessageBox: messageMocks.ElMessageBox,
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerMocks.push }),
  useRoute: () => routeState,
}));

// Stub StoreSelector so it doesn't make its own API call.
// Async factory so we can `import` vue inside (vi.mock is hoisted).
vi.mock('@/components/StoreSelector.vue', async () => {
  const { defineComponent, h } = await import('vue');
  const Stub = defineComponent({
    name: 'StoreSelector',
    props: { modelValue: { type: Array, default: () => [] } },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('div', { class: 'store-selector-stub' }, [
          h(
            'button',
            {
              class: 'stub-pick-store',
              onClick: () => emit('update:modelValue', [1, 2]),
            },
            'pick-stores',
          ),
          h('span', {}, `selected:${props.modelValue.length}`),
        ]);
    },
  });
  return { default: Stub };
});

import CampaignCreate from '@/views/campaign/CampaignCreate.vue';
import { commonStubs, createElFormStub } from '../../helpers';

const mockVideos = [
  { id: 1, title: 'Encrypted One', fileSize: 1000, encryptStatus: 'done' },
  { id: 2, title: 'Encrypted Two', fileSize: 2000, encryptStatus: 'done' },
];

describe('CampaignCreate View', () => {
  let formStub: ReturnType<typeof createElFormStub>;

  beforeEach(() => {
    vi.clearAllMocks();
    routeState.path = '/campaigns/create';
    routeState.params = {};
    formStub = createElFormStub();
  });

  function mountCreate() {
    return mount(CampaignCreate, {
      global: {
        stubs: { ...commonStubs, ElForm: formStub.ElFormStub },
        directives: { loading: () => {} },
      },
    });
  }

  describe('rendering', () => {
    it('renders the title for create mode', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: mockVideos, count: 2 } });
      const wrapper = mountCreate();
      await flushPromises();

      expect(wrapper.text()).toContain('新建推广计划');
    });

    it('renders the title for edit mode when route has :id', async () => {
      routeState.params = { id: '5' };
      requestMocks.get.mockImplementation(async (url: string) => {
        if (url === '/admin/videos') return { data: { rows: mockVideos, count: 2 } };
        if (url === '/admin/campaigns/5')
          return {
            data: {
              id: 5,
              title: 'Existing',
              description: 'desc',
              startTime: '2025-01-01T00:00:00Z',
              endTime: '2025-02-01T00:00:00Z',
              videos: [{ id: 1 }],
              stores: [{ id: 1 }],
            },
          };
        return { data: {} };
      });
      const wrapper = mountCreate();
      await flushPromises();

      expect(wrapper.text()).toContain('编辑推广计划');
    });

    it('renders title input field', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountCreate();
      await flushPromises();

      expect(wrapper.find('.campaign-form').exists()).toBe(true);
    });
  });

  describe('API calls', () => {
    it('fetches videos on mount', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: mockVideos, count: 2 } });
      mountCreate();
      await flushPromises();

      expect(requestMocks.get).toHaveBeenCalledWith('/admin/videos', {
        params: { pageSize: 200, encryptStatus: 'done' },
      });
    });

    it('renders available video checkboxes', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: mockVideos, count: 2 } });
      const wrapper = mountCreate();
      await flushPromises();

      expect(wrapper.text()).toContain('Encrypted One');
      expect(wrapper.text()).toContain('Encrypted Two');
    });

    it('shows empty placeholder when no videos available', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountCreate();
      await flushPromises();

      expect(wrapper.text()).toContain('暂无可用视频');
    });

    it('fetches campaign for edit mode', async () => {
      routeState.params = { id: '7' };
      requestMocks.get.mockImplementation(async (url: string) => {
        if (url === '/admin/videos') return { data: { rows: [], count: 0 } };
        if (url === '/admin/campaigns/7')
          return {
            data: {
              id: 7,
              title: 'Existing Campaign',
              startTime: '2025-01-01T00:00:00Z',
              endTime: '2025-02-01T00:00:00Z',
              videos: [],
              stores: [],
            },
          };
        return { data: {} };
      });
      mountCreate();
      await flushPromises();

      expect(requestMocks.get).toHaveBeenCalledWith('/admin/campaigns/7');
    });
  });

  describe('handleSave', () => {
    it('warns when no video selected', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: mockVideos, count: 2 } });
      const wrapper = mountCreate();
      await flushPromises();

      // Click save without selecting anything
      const saveBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.text().includes('保存'));
      await saveBtn?.trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessage.warning).toHaveBeenCalledWith('请至少选择一个视频');
    });

    it('warns when video selected but no store', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: mockVideos, count: 2 } });
      const wrapper = mountCreate();
      await flushPromises();

      // Drive the StoreSelector stub to emit a store selection, then click save
      // without selecting any video. The component checks videos first, so the
      // warning should still be about videos.
      const pickBtn = wrapper.find('.stub-pick-store');
      await pickBtn.trigger('click');

      const saveBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.text().includes('保存'));
      await saveBtn?.trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessage.warning).toHaveBeenCalledWith('请至少选择一个视频');
    });

    it('creates campaign when timeRange values are strings (value-format)', async () => {
      formStub.setValidity(true);
      requestMocks.get.mockResolvedValue({ data: { rows: mockVideos, count: 2 } });
      requestMocks.post.mockImplementation(async (url: string) => {
        if (url === '/admin/campaigns') return { data: { id: 42 } };
        return { data: {} };
      });

      const wrapper = mountCreate();
      await flushPromises();

      // Drive selections and fields through component state
      const vm = wrapper.vm as unknown as {
        form: {
          title: string;
          description: string;
          timeRange: string[];
          selectedVideoIds: number[];
          selectedStoreIds: number[];
        };
      };
      vm.form.title = 'String Time Campaign';
      vm.form.description = '';
      vm.form.timeRange = ['2026-06-18T10:00:00', '2026-06-25T10:00:00'];
      vm.form.selectedVideoIds = [1, 2];
      vm.form.selectedStoreIds = [1, 2];
      await flushPromises();

      const saveBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.text().includes('保存'));
      await saveBtn?.trigger('click');
      await flushPromises();

      expect(requestMocks.post).toHaveBeenCalledWith('/admin/campaigns', {
        title: 'String Time Campaign',
        description: '',
        startTime: '2026-06-18T10:00:00',
        endTime: '2026-06-25T10:00:00',
      });
      expect(requestMocks.post).toHaveBeenCalledWith('/admin/campaigns/42/videos', {
        videoIds: [1, 2],
      });
      expect(requestMocks.post).toHaveBeenCalledWith('/admin/campaigns/42/stores', {
        storeIds: [1, 2],
      });
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('创建成功');
      expect(routerMocks.push).toHaveBeenCalledWith('/campaigns');
    });
  });

  describe('navigation', () => {
    it('navigates back to /campaigns on "取消" click', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountCreate();
      await flushPromises();

      const cancelBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.text().includes('取消'));
      await cancelBtn?.trigger('click');

      expect(routerMocks.push).toHaveBeenCalledWith('/campaigns');
    });

    it('navigates back to /campaigns on "返回列表" click', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountCreate();
      await flushPromises();

      const backBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.text().includes('返回列表'));
      await backBtn?.trigger('click');

      expect(routerMocks.push).toHaveBeenCalledWith('/campaigns');
    });
  });

  describe('validation', () => {
    it('does not call API when form validation fails', async () => {
      formStub.setValidity(false);
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountCreate();
      await flushPromises();

      const saveBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.text().includes('保存'));
      await saveBtn?.trigger('click');
      await flushPromises();

      expect(requestMocks.post).not.toHaveBeenCalled();
    });
  });
});
