import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

// Mock request (not used by Login directly but kept for safety)
vi.mock('@/utils/request', () => ({
  default: { post: vi.fn() },
}));

// Mock the router module — prevents loading the real src/router/index.ts
// which would call createRouter from vue-router.
vi.mock('@/router', () => ({
  default: { push: vi.fn(), replace: vi.fn() },
}));

// Hoisted state — vi.mock factories are hoisted above imports, so anything
// the factory touches must also be hoisted.
const { messageMocks, routerMocks, routeState } = vi.hoisted(() => ({
  messageMocks: {
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  },
  routerMocks: {
    push: vi.fn(async () => undefined),
  },
  routeState: {
    path: '/login',
    query: {} as Record<string, string>,
    params: {} as Record<string, string>,
    fullPath: '/login',
    meta: {} as Record<string, unknown>,
  },
}));

vi.mock('element-plus', () => ({
  ElMessage: messageMocks.ElMessage,
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerMocks.push }),
  useRoute: () => routeState,
}));

import Login from '@/views/Login.vue';
import { useAuthStore } from '@/stores/auth';
import { createElFormStub, commonStubs } from '../helpers';

describe('Login View', () => {
  let formStub: ReturnType<typeof createElFormStub>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    routeState.query = {};
    routeState.path = '/login';
    formStub = createElFormStub();

    // Default auth store login to success
    useAuthStore().login = vi.fn().mockResolvedValue(undefined);
  });

  function mountLogin() {
    return mount(Login, {
      global: {
        stubs: {
          ...commonStubs,
          ElForm: formStub.ElFormStub,
        },
      },
    });
  }

  describe('rendering', () => {
    it('renders the VDEIO title and subtitle', () => {
      const wrapper = mountLogin();
      expect(wrapper.find('.login-title').text()).toBe('VDEIO');
      expect(wrapper.find('.login-subtitle').text()).toBe('管理后台');
    });

    it('renders two form inputs (username, password)', () => {
      const wrapper = mountLogin();
      const inputs = wrapper.findAll('.el-input-stub');
      expect(inputs.length).toBe(2);
    });

    it('renders the login button with default label', () => {
      const wrapper = mountLogin();
      const btn = wrapper.find('.el-button-stub.primary');
      expect(btn.exists()).toBe(true);
    });

    it('shows "登 录" label when not loading', () => {
      const wrapper = mountLogin();
      expect(wrapper.find('.login-btn').text()).toContain('登');
    });
  });

  describe('handleLogin — success', () => {
    it('calls authStore.login with the entered credentials', async () => {
      const loginSpy = vi.fn().mockResolvedValue(undefined);
      useAuthStore().login = loginSpy;

      const wrapper = mountLogin();
      const inputs = wrapper.findAll('input');
      await inputs[0].setValue('admin');
      await inputs[1].setValue('pass123');
      await wrapper.find('.el-button-stub').trigger('click');
      await flushPromises();

      expect(loginSpy).toHaveBeenCalledWith('admin', 'pass123');
    });

    it('shows ElMessage.success on success', async () => {
      useAuthStore().login = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountLogin();

      await wrapper.find('.el-button-stub').trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessage.success).toHaveBeenCalledWith('登录成功');
    });

    it('redirects to /dashboard by default', async () => {
      useAuthStore().login = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountLogin();

      await wrapper.find('.el-button-stub').trigger('click');
      await flushPromises();

      expect(routerMocks.push).toHaveBeenCalledWith('/dashboard');
    });

    it('uses redirect query when present', async () => {
      routeState.query = { redirect: '/videos' };
      useAuthStore().login = vi.fn().mockResolvedValue(undefined);
      const wrapper = mountLogin();

      await wrapper.find('.el-button-stub').trigger('click');
      await flushPromises();

      expect(routerMocks.push).toHaveBeenCalledWith('/videos');
    });
  });

  describe('handleLogin — failure', () => {
    it('shows ElMessage.error when login throws', async () => {
      useAuthStore().login = vi.fn().mockRejectedValue(new Error('bad creds'));
      const wrapper = mountLogin();

      await wrapper.find('.el-button-stub').trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith(
        '登录失败，请检查用户名和密码',
      );
    });

    it('uses server-provided message when present', async () => {
      const err = Object.assign(new Error('fail'), {
        response: { data: { message: '密码错误' } },
      });
      useAuthStore().login = vi.fn().mockRejectedValue(err);
      const wrapper = mountLogin();

      await wrapper.find('.el-button-stub').trigger('click');
      await flushPromises();

      expect(messageMocks.ElMessage.error).toHaveBeenCalledWith('密码错误');
    });

    it('does not navigate on failure', async () => {
      useAuthStore().login = vi.fn().mockRejectedValue(new Error('no'));
      const wrapper = mountLogin();

      await wrapper.find('.el-button-stub').trigger('click');
      await flushPromises();

      expect(routerMocks.push).not.toHaveBeenCalled();
    });
  });

  describe('form validation', () => {
    it('does not call login when form validation fails', async () => {
      const loginSpy = vi.fn().mockResolvedValue(undefined);
      useAuthStore().login = loginSpy;
      formStub.setValidity(false);

      const wrapper = mountLogin();
      await wrapper.find('.el-button-stub').trigger('click');
      await flushPromises();

      expect(loginSpy).not.toHaveBeenCalled();
    });
  });
});
