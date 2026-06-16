import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/utils/request', () => {
  const get = vi.fn().mockResolvedValue({ data: {} });
  const post = vi.fn().mockResolvedValue({ data: {} });
  return { default: { get, post } };
});

vi.mock('@/stores/auth', () => {
  const store = {
    setTokens: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    refreshAccessToken: vi.fn().mockResolvedValue(true),
  };
  return { useAuthStore: vi.fn(() => store) };
});

vi.mock('@/router', () => {
  const push = vi.fn();
  return { default: { push } };
});

import Login from '@/views/Login.vue';
import request from '@/utils/request';
import { useAuthStore } from '@/stores/auth';
import router from '@/router';

describe('Login.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the login title', async () => {
    const wrapper = mount(Login);
    await flushPromises();
    expect(wrapper.find('.login-title').text()).toBe('门店视频播放系统');
  });

  it('shows loading state while fetching QR code', async () => {
    let resolveQR: (val: unknown) => void;
    (request.get as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((resolve) => { resolveQR = resolve; }));

    const wrapper = mount(Login);
    await flushPromises();
    expect(wrapper.find('.qr-loading').exists()).toBe(true);

    resolveQR!({ data: { qrCodeUrl: '', state: '' } });
    await flushPromises();
  });

  it('renders iframe when qrCodeUrl is available', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'state-abc' },
    });

    const wrapper = mount(Login);
    await flushPromises();

    const iframe = wrapper.find('.qr-iframe');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('src')).toBe('https://qr.example.com/code');
  });

  it('shows error state when QR fetch fails', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

    const wrapper = mount(Login);
    await flushPromises();

    expect(wrapper.find('.qr-error').exists()).toBe(true);
  });

  it('clicking retry reloads the QR code', async () => {
    (request.get as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ data: { qrCodeUrl: 'https://qr.example.com/code2', state: 'state-def' } });

    const wrapper = mount(Login);
    await flushPromises();

    expect(wrapper.find('.qr-error').exists()).toBe(true);

    await wrapper.find('.btn-retry').trigger('click');
    await flushPromises();

    expect(wrapper.find('.qr-iframe').exists()).toBe(true);
  });

  it('shows mock login button in normal mode', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'state-abc' },
    });

    const wrapper = mount(Login);
    await flushPromises();

    expect(wrapper.find('.btn-mock').exists()).toBe(true);
  });

  it('shows mock primary button and icon in mock mode', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: '', state: '', mockMode: true },
    });

    const wrapper = mount(Login);
    await flushPromises();

    expect(wrapper.find('.mock-area').exists()).toBe(true);
    expect(wrapper.find('.btn-mock-primary').exists()).toBe(true);
    expect(wrapper.find('.mock-icon').exists()).toBe(true);
  });

  it('clicking mock login button calls mockLogin', async () => {
    localStorage.setItem('deviceId', 'existing-device');
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: '', state: '', mockMode: true },
    });
    (request.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        status: 'success',
        accessToken: 'access-mock',
        refreshToken: 'refresh-mock',
        user: { id: 1, name: '测试用户', phone: '13800138000', avatar: '', role: 'operator' },
        storeId: 1,
      },
    });

    const wrapper = mount(Login);
    await flushPromises();

    await wrapper.find('.btn-mock-primary').trigger('click');
    await flushPromises();

    expect(request.post).toHaveBeenCalledWith('/auth/mock-login');
    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('clicking mock scan button in normal mode calls mockLogin', async () => {
    localStorage.setItem('deviceId', 'existing-device');
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'state-abc' },
    });
    (request.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        status: 'success',
        accessToken: 'access-mock',
        refreshToken: 'refresh-mock',
        user: { id: 1, name: '测试用户', phone: '13800138000', avatar: '', role: 'operator' },
        storeId: 1,
      },
    });

    const wrapper = mount(Login);
    await flushPromises();

    await wrapper.find('.btn-mock').trigger('click');
    await flushPromises();

    expect(request.post).toHaveBeenCalledWith('/auth/mock-login');
    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('polls for login success after QR code loads', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'poll-state' },
    });

    mount(Login);
    await flushPromises();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        status: 'success',
        accessToken: 'access-poll',
        refreshToken: 'refresh-poll',
        user: { id: 1, name: 'Poll User', phone: '13800138000', avatar: '', role: 'operator' },
        storeId: 1,
      },
    });

    await vi.advanceTimersByTimeAsync(2000);

    const store = useAuthStore();
    expect(store.setTokens).toHaveBeenCalledWith('access-poll', 'refresh-poll');
    expect(router.push).toHaveBeenCalledWith('/');
  });
});
