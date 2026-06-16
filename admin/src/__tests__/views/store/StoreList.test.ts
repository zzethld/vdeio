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
  useRoute: () => ({ path: '/stores', query: {}, params: {}, meta: {} }),
}));

import StoreList from '@/views/store/StoreList.vue';
import { commonStubs } from '../../helpers';

const mockStores = [
  { id: 1, name: '上海徐汇店', code: 'SH-XH-001', region: '华东', address: '上海市徐汇区', status: 1 },
  { id: 2, name: '北京朝阳店', code: 'BJ-CY-001', region: '华北', address: '北京市朝阳区', status: 0 },
];

describe('StoreList View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountList() {
    return mount(StoreList, {
      global: {
        stubs: commonStubs,
        directives: { loading: () => {} },
      },
    });
  }

  describe('rendering', () => {
    it('renders the page header with add button', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.find('.page-header').exists()).toBe(true);
      expect(wrapper.text()).toContain('新增门店');
    });

    it('renders the search input and query button', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.find('input.el-input-stub').exists()).toBe(true);
    });
  });

  describe('API call', () => {
    it('calls GET /admin/stores on mount', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      mountList();
      await flushPromises();

      expect(requestMocks.get).toHaveBeenCalledWith('/admin/stores', {
        params: { page: 1, pageSize: 20 },
      });
    });

    it('renders returned rows', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: mockStores, count: 2 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.findAll('.el-table-stub-row').length).toBe(2);
      expect(wrapper.text()).toContain('上海徐汇店');
      expect(wrapper.text()).toContain('北京朝阳店');
    });

    it('shows error on fetch failure', async () => {
      requestMocks.get.mockRejectedValue(new Error('fail'));
      const wrapper = mountList();
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith('获取门店列表失败');
      expect(wrapper.find('.store-list').exists()).toBe(true);
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

  describe('handleAdd', () => {
    it('opens the dialog with "新增门店" title when add clicked', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      expect(wrapper.find('.el-dialog-stub').exists()).toBe(false);

      const addBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.classes().includes('primary'));
      await addBtn?.trigger('click');
      await flushPromises();

      expect(wrapper.find('.el-dialog-stub').exists()).toBe(true);
      expect(wrapper.text()).toContain('新增门店');
    });
  });

  describe('handleEdit', () => {
    it('opens dialog with "编辑门店" title and populates form when edit clicked', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: mockStores, count: 2 } });
      const wrapper = mountList();
      await flushPromises();

      const editBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('编辑'));
      expect(editBtns.length).toBe(2);
      await editBtns[0].trigger('click');
      await flushPromises();

      expect(wrapper.find('.el-dialog-stub').exists()).toBe(true);
      expect(wrapper.text()).toContain('编辑门店');
      // Form should contain the store name as the first dialog input value
      const dialogInputs = wrapper.findAll('.el-dialog-stub input.el-input-stub');
      expect(dialogInputs.length).toBeGreaterThan(0);
      expect((dialogInputs[0].element as HTMLInputElement).value).toContain('上海徐汇店');
    });
  });

  describe('handleSave', () => {
    it('warns when name or code is empty', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      const wrapper = mountList();
      await flushPromises();

      // Open add dialog
      const addBtn = wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.classes().includes('primary'));
      await addBtn?.trigger('click');
      await flushPromises();

      // Click save (in dialog footer)
      const dialogSaveBtn = wrapper
        .findAll('.el-dialog-stub button.el-button-stub')
        .find((b) => b.classes().includes('primary'));
      await dialogSaveBtn?.trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessage.warning).toHaveBeenCalledWith('请填写门店名称和编码');
    });

    it('calls POST on create save', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: [], count: 0 } });
      requestMocks.post.mockResolvedValue({});
      const wrapper = mountList();
      await flushPromises();

      // Open dialog
      await wrapper
        .findAll('button.el-button-stub')
        .find((b) => b.classes().includes('primary'))
        ?.trigger('click');
      await flushPromises();

      // Set form values via the dialog inputs
      const inputs = wrapper.findAll('.el-dialog-stub input.el-input-stub');
      await inputs[0].setValue('新店');
      await inputs[1].setValue('NEW-001');

      const dialogSaveBtn = wrapper
        .findAll('.el-dialog-stub button.el-button-stub')
        .find((b) => b.classes().includes('primary'));
      await dialogSaveBtn?.trigger('click');
      await flushPromises();

      expect(requestMocks.post).toHaveBeenCalledWith('/admin/stores', expect.objectContaining({
        name: '新店',
        code: 'NEW-001',
      }));
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('创建成功');
    });

    it('calls PUT on edit save', async () => {
      requestMocks.get.mockResolvedValue({ data: { rows: mockStores, count: 2 } });
      requestMocks.put.mockResolvedValue({});
      const wrapper = mountList();
      await flushPromises();

      const editBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('编辑'));
      await editBtns[0].trigger('click');
      await flushPromises();

      const dialogSaveBtn = wrapper
        .findAll('.el-dialog-stub button.el-button-stub')
        .find((b) => b.classes().includes('primary'));
      await dialogSaveBtn?.trigger('click');
      await flushPromises();

      expect(requestMocks.put).toHaveBeenCalledWith('/admin/stores/1', expect.anything());
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('更新成功');
    });
  });

  describe('handleDelete', () => {
    it('deletes after confirm', async () => {
      messageMocks.ElMessageBox.confirm.mockResolvedValue('confirm');
      requestMocks.delete.mockResolvedValue({});
      requestMocks.get.mockResolvedValue({ data: { rows: mockStores, count: 2 } });
      const wrapper = mountList();
      await flushPromises();

      const deleteBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.classes().includes('danger') && b.text().includes('删除'));
      expect(deleteBtns.length).toBe(2);
      await deleteBtns[0].trigger('click');
      await flushPromises();

      expect(requestMocks.delete).toHaveBeenCalledWith('/admin/stores/1');
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('删除成功');
    });

    it('does not delete when cancelled', async () => {
      messageMocks.ElMessageBox.confirm.mockRejectedValue(new Error('cancel'));
      requestMocks.get.mockResolvedValue({ data: { rows: mockStores, count: 2 } });
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

  describe('handleToggleStatus', () => {
    it('calls PUT to disable an enabled store after confirm', async () => {
      messageMocks.ElMessageBox.confirm.mockResolvedValue('confirm');
      requestMocks.put.mockResolvedValue({});
      requestMocks.get.mockResolvedValue({ data: { rows: mockStores, count: 2 } });
      const wrapper = mountList();
      await flushPromises();

      // First store is enabled (status:1), button text should be '禁用'
      const toggleBtns = wrapper
        .findAll('button.el-button-stub')
        .filter((b) => b.text().includes('禁用') || b.text().includes('启用'));
      expect(toggleBtns.length).toBe(2);

      await toggleBtns[0].trigger('click');
      await flushPromises();

      expect(requestMocks.put).toHaveBeenCalledWith('/admin/stores/1', { status: 0 });
      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('禁用成功');
    });
  });
});
