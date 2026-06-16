import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Mock router and request before auth store import
vi.mock('@/router', () => {
  const push = vi.fn();
  return { default: { push } };
});

vi.mock('@/utils/request', () => {
  const post = vi.fn().mockResolvedValue({ data: {} });
  return { default: { get: vi.fn(), post } };
});

import { mqttBridge, MqttCommandData } from '@/utils/mqtt';
import { useAuthStore } from '@/stores/auth';
import request from '@/utils/request';
import router from '@/router';

describe('mqttBridge', () => {
  let mockConnect: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;
  let mockOnCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockConnect = vi.fn().mockResolvedValue({ success: true });
    mockDisconnect = vi.fn().mockResolvedValue({ success: true });
    mockOnCommand = vi.fn().mockReturnValue(() => {});

    vi.stubGlobal('window', {
      electronAPI: {
        mqttConnect: mockConnect,
        mqttDisconnect: mockDisconnect,
        onMqttCommand: mockOnCommand,
      },
    });
  });

  it('connect delegates to window.electronAPI', async () => {
    const result = await mqttBridge.connect('device1', 'token1');
    expect(mockConnect).toHaveBeenCalledWith('device1', 'token1', undefined);
    expect(result).toEqual({ success: true });
  });

  it('connect passes optional brokerUrl', async () => {
    await mqttBridge.connect('device1', 'token1', 'ws://broker');
    expect(mockConnect).toHaveBeenCalledWith('device1', 'token1', 'ws://broker');
  });

  it('disconnect delegates to window.electronAPI', async () => {
    const result = await mqttBridge.disconnect();
    expect(mockDisconnect).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('onCommand delegates to window.electronAPI', () => {
    const handler = (data: MqttCommandData) => console.log(data);
    mqttBridge.onCommand(handler);
    expect(mockOnCommand).toHaveBeenCalledWith(handler);
  });

  it('returns error when electronAPI is unavailable', async () => {
    vi.stubGlobal('window', {});
    const result = await mqttBridge.connect('device1', 'token1');
    expect(result).toEqual({ error: 'Electron API not available' });
  });
});

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('sets tokens and persists to localStorage', () => {
    const store = useAuthStore();
    store.setTokens('access-abc', 'refresh-xyz');
    expect(store.accessToken).toBe('access-abc');
    expect(store.refreshToken).toBe('refresh-xyz');
    expect(localStorage.getItem('accessToken')).toBe('access-abc');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-xyz');
  });

  it('sets user and persists to localStorage', () => {
    const store = useAuthStore();
    const user = { id: 1, name: 'Alice', phone: '13800138000', avatar: '', role: 'admin' };
    store.setUser(user);
    expect(store.user).toEqual(user);
    expect(JSON.parse(localStorage.getItem('user')!)).toEqual(user);
  });

  it('computes isLoggedIn based on accessToken', () => {
    const store = useAuthStore();
    expect(store.isLoggedIn).toBe(false);
    store.setTokens('token', 'refresh');
    expect(store.isLoggedIn).toBe(true);
  });

  it('logout clears state and localStorage', () => {
    const store = useAuthStore();
    store.setTokens('token', 'refresh');
    store.setUser({ id: 1, name: 'Alice', phone: '13800138000', avatar: '', role: 'admin' });
    store.logout();

    expect(store.accessToken).toBe('');
    expect(store.user).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(router.push).toHaveBeenCalledWith('/login');
  });

  it('loadFromStorage restores state from localStorage', () => {
    localStorage.setItem('accessToken', 'stored-token');
    localStorage.setItem('refreshToken', 'stored-refresh');
    localStorage.setItem('user', JSON.stringify({ id: 2, name: 'Bob', phone: '13900139000', avatar: '', role: 'operator' }));

    const store = useAuthStore();
    store.loadFromStorage();
    expect(store.accessToken).toBe('stored-token');
    expect(store.refreshToken).toBe('stored-refresh');
    expect(store.user).toEqual({ id: 2, name: 'Bob', phone: '13900139000', avatar: '', role: 'operator' });
  });

  it('refreshAccessToken calls API and updates tokens', async () => {
    const store = useAuthStore();
    store.setTokens('old-access', 'old-refresh');

    (request.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
    });

    const result = await store.refreshAccessToken();
    expect(result).toBe(true);
    expect(request.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'old-refresh' });
    expect(store.accessToken).toBe('new-access');
    expect(store.refreshToken).toBe('new-refresh');
  });

  it('refreshAccessToken returns false when no refresh token', async () => {
    const store = useAuthStore();
    const result = await store.refreshAccessToken();
    expect(result).toBe(false);
    expect(request.post).not.toHaveBeenCalled();
  });

  it('refreshAccessToken returns false on API error', async () => {
    const store = useAuthStore();
    store.setTokens('access', 'refresh');
    (request.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

    const result = await store.refreshAccessToken();
    expect(result).toBe(false);
  });
});
