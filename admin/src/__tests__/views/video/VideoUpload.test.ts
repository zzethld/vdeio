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
  useRoute: () => ({ path: '/videos/upload', query: {}, params: {}, meta: {} }),
}));

import { defineComponent, h } from 'vue';
import VideoUpload from '@/views/video/VideoUpload.vue';
import { commonStubs } from '../../helpers';

/**
 * Local ElUpload stub: captures the on-change prop and exposes a closure
 * the test can call to simulate file selection.
 */
let triggerFileChange: ((file: File) => void) | null = null;

const LocalElUploadStub = defineComponent({
  name: 'ElUpload',
  props: {
    onChange: { type: Function, default: null },
    onRemove: { type: Function, default: null },
    autoUpload: Boolean,
    limit: Number,
    accept: String,
  },
  setup(props, { slots }) {
    triggerFileChange = (file: File) =>
      props.onChange?.({ raw: file, name: file.name, size: file.size });
    return () => h('div', { class: 'el-upload-stub' }, slots.default?.());
  },
});

describe('VideoUpload View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountUpload() {
    triggerFileChange = null;
    return mount(VideoUpload, {
      global: {
        stubs: {
          ...commonStubs,
          ElUpload: LocalElUploadStub,
          // Element Plus icon components used in template
          Upload: { template: '<i class="icon-stub"/>' },
          ArrowLeft: { template: '<i class="icon-stub"/>' },
        },
        directives: { loading: () => {} },
      },
    });
  }

  describe('rendering', () => {
    it('renders the page header with back button and title', () => {
      const wrapper = mountUpload();
      expect(wrapper.find('.page-header').exists()).toBe(true);
      expect(wrapper.text()).toContain('上传视频');
      expect(wrapper.text()).toContain('返回列表');
    });

    it('renders the upload area', () => {
      const wrapper = mountUpload();
      expect(wrapper.find('.upload-area').exists()).toBe(true);
    });

    it('renders the start upload button (disabled when no file)', () => {
      const wrapper = mountUpload();
      const buttons = wrapper.findAll('button.el-button-stub');
      // Back button and upload button — upload button should be disabled
      const startBtn = buttons.find((b) => b.text().includes('开始上传'));
      expect(startBtn).toBeDefined();
      expect(startBtn?.attributes('disabled')).toBeDefined();
    });

    it('does not render progress section when chunkCount is 0', () => {
      const wrapper = mountUpload();
      expect(wrapper.find('.upload-progress').exists()).toBe(false);
    });
  });

  describe('navigation', () => {
    it('navigates back to /videos on "返回列表" click', async () => {
      const wrapper = mountUpload();
      const backBtn = wrapper.findAll('button.el-button-stub').find((b) =>
        b.text().includes('返回列表'),
      );
      await backBtn?.trigger('click');

      expect(routerMocks.push).toHaveBeenCalledWith('/videos');
    });
  });

  describe('startUpload — validation', () => {
    it('warns when no file is selected', async () => {
      const wrapper = mountUpload();
      const startBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.text().includes('开始上传'));
      // Force-enable since the disabled is just visual
      startBtn?.element.removeAttribute('disabled');
      await startBtn?.trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessage.warning).toHaveBeenCalledWith('请先选择文件');
      expect(requestMocks.post).not.toHaveBeenCalled();
    });
  });

  describe('startUpload — success flow', () => {
    it('runs init → chunks → complete and shows success', async () => {
      // Mock init: file is 5000 bytes, chunkSize 1000 → 5 chunks
      requestMocks.post.mockImplementation(async (url: string) => {
        if (url.includes('/upload/init')) {
          return {
            data: { uploadId: 'uid-1', chunkSize: 1000, chunkCount: 5 },
          };
        }
        if (url.includes('/upload/chunk')) {
          return { data: {} };
        }
        if (url.includes('/upload/complete')) {
          return { data: { videoId: 99 } };
        }
        return { data: {} };
      });

      const wrapper = mountUpload();

      // Drive the el-upload on-change via the local stub closure
      const file = new File(['x'.repeat(5000)], 'test.mp4', { type: 'video/mp4' });
      triggerFileChange?.(file);
      await flushPromises();

      // The start button should now be enabled; click it
      const startBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.text().includes('开始上传'));
      startBtn?.element.removeAttribute('disabled');
      await startBtn?.trigger('click');
      await flushPromises();

      expect(requestMocks.post).toHaveBeenCalledWith('/admin/videos/upload/init', {
        fileName: 'test.mp4',
        fileSize: 5000,
      });
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('视频上传成功');
    });
  });

  describe('startUpload — failure', () => {
    it('shows error message on init failure', async () => {
      requestMocks.post.mockRejectedValue(
        Object.assign(new Error('init fail'), {
          response: { data: { message: 'init error' } },
        }),
      );

      const wrapper = mountUpload();
      const file = new File(['x'.repeat(100)], 'fail.mp4', { type: 'video/mp4' });
      triggerFileChange?.(file);
      await flushPromises();

      const startBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.text().includes('开始上传'));
      startBtn?.element.removeAttribute('disabled');
      await startBtn?.trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith('init error');
    });
  });
});
