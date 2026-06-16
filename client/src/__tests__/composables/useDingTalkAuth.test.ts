import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

// Mocks must be before imports
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

import { useDingTalkAuth } from '@/composables/useDingTalkAuth';
import request from '@/utils/request';
import { useAuthStore } from '@/stores/auth';
import router from '@/router';

function withAuth() {
  let result: ReturnType<typeof useDingTalkAuth>;
  mount(defineComponent({
    setup() {
      result = useDingTalkAuth();
      return {};
    },
    render: () => h('div'),
  }));
  return result!;
}

describe('useDingTalkAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns expected interface', () => {
    const auth = withAuth();
    expect(auth.qrCodeUrl).toBeDefined();
    expect(auth.loading).toBeDefined();
    expect(auth.error).toBeDefined();
    expect(auth.getQRCode).toBeDefined();
    expect(auth.startPolling).toBeDefined();
    expect(auth.stopPolling).toBeDefined();
    expect(auth.mockLogin).toBeDefined();
  });

  it('fetches QR code on getQRCode', async () => {
    const auth = withAuth();
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'state-abc' },
    });

    await auth.getQRCode();
    expect(request.get).toHaveBeenCalledWith('/auth/dingtalk/qrcode');
    expect(auth.qrCodeUrl.value).toBe('https://qr.example.com/code');
    expect(auth.loading.value).toBe(false);
  });

  it('sets error on QR code fetch failure', async () => {
    const auth = withAuth();
    (request.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

    await auth.getQRCode();
    expect(auth.error.value).toBe('获取二维码失败，请重试');
    expect(auth.loading.value).toBe(false);
  });

  it('polls for login success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const auth = withAuth();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'poll-state' },
    });
    await auth.getQRCode();

    auth.startPolling();
    expect(request.get).toHaveBeenCalledTimes(1); // only getQRCode so far

    await vi.advanceTimersByTimeAsync(2000);
    expect(request.get).toHaveBeenCalledWith('/auth/poll', expect.objectContaining({
      params: { state: 'poll-state' },
    }));

    // Return success on next poll
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        status: 'success',
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        user: { id: 1, name: 'Test User', phone: '13800138000', avatar: '', role: 'operator' },
        storeId: 1,
      },
    });

    const store = useAuthStore();
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.setTokens).toHaveBeenCalledWith('access-123', 'refresh-123');
    expect(store.setUser).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Test User' }));
    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('shows error and logs out when storeId is missing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const auth = withAuth();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'poll-state' },
    });
    await auth.getQRCode();
    auth.startPolling();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        status: 'success',
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        user: { id: 1, name: 'Test User', phone: '13800138000', avatar: '', role: 'operator' },
        storeId: null,
      },
    });

    const store = useAuthStore();
    await vi.advanceTimersByTimeAsync(2000);
    expect(auth.error.value).toBe('您的账号未绑定门店，请联系管理员');
    expect(store.logout).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalledWith('/');
  });

  it('registers and binds device on first login', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const auth = withAuth();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'poll-state' },
    });
    await auth.getQRCode();
    auth.startPolling();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        status: 'success',
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        user: { id: 1, name: 'Test User', phone: '13800138000', avatar: '', role: 'operator' },
        storeId: 1,
      },
    });

    (request.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { deviceId: 'device-abc', deviceToken: 'token-xyz' },
    });
    (request.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: {} });

    await vi.advanceTimersByTimeAsync(2000);

    expect(request.post).toHaveBeenCalledWith('/devices/register', expect.objectContaining({
      deviceName: expect.any(String),
      osVersion: 'web',
    }));
    expect(request.post).toHaveBeenCalledWith('/devices/bind', expect.objectContaining({
      storeId: 1,
      deviceId: 'device-abc',
    }));
    expect(localStorage.getItem('deviceId')).toBe('device-abc');
    expect(localStorage.getItem('deviceToken')).toBe('token-xyz');
  });

  it('skips device registration if already registered', async () => {
    localStorage.setItem('deviceId', 'existing-device');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const auth = withAuth();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'poll-state' },
    });
    await auth.getQRCode();
    auth.startPolling();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        status: 'success',
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        user: { id: 1, name: 'Test User', phone: '13800138000', avatar: '', role: 'operator' },
        storeId: 1,
      },
    });

    await vi.advanceTimersByTimeAsync(2000);

    expect(request.post).not.toHaveBeenCalledWith('/devices/register', expect.anything());
    expect(request.post).not.toHaveBeenCalledWith('/devices/bind', expect.anything());
  });

  it('handles poll network errors gracefully', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const auth = withAuth();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'poll-state' },
    });
    await auth.getQRCode();
    auth.startPolling();

    (request.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Poll failed'));

    // Should not throw
    await expect(vi.advanceTimersByTimeAsync(2000)).resolves.not.toThrow();
    expect(auth.error.value).toBe(''); // error is not set on poll failure
  });

  it('mockLogin triggers login success', async () => {
    localStorage.setItem('deviceId', 'existing-device');
    const auth = withAuth();
    const store = useAuthStore();

    (request.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        status: 'success',
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        user: { id: 1, name: '测试用户', phone: '13800138000', avatar: '', role: 'operator' },
        storeId: 1,
      },
    });

    auth.mockLogin();
    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/');
    });
    expect(store.setTokens).toHaveBeenCalled();
    expect(store.setUser).toHaveBeenCalledWith(expect.objectContaining({ name: '测试用户' }));
  });

  it('stopPolling clears the interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const auth = withAuth();

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { qrCodeUrl: 'https://qr.example.com/code', state: 'poll-state' },
    });
    await auth.getQRCode();
    auth.startPolling();
    auth.stopPolling();

    await vi.advanceTimersByTimeAsync(4000);
    expect(request.get).toHaveBeenCalledTimes(1); // only getQRCode
  });
});
