import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/router', () => {
  const push = vi.fn();
  return { default: { push } };
});

vi.mock('@/utils/request', () => {
  const get = vi.fn();
  const post = vi.fn().mockResolvedValue({ data: {} });
  return { default: { get, post } };
});

import { useAuthStore } from '@/stores/auth';
import request from '@/utils/request';
import router from '@/router';

describe('useAuthStore - setUser', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('sets user info and persists to localStorage', () => {
    const store = useAuthStore();
    const user = { id: 7, name: 'Frank', phone: '13700000000', avatar: 'x.png', role: 'operator' };
    store.setUser(user);
    expect(store.user).toEqual(user);
    expect(JSON.parse(localStorage.getItem('user')!)).toEqual(user);
  });

  it('overwrites previous user info', () => {
    const store = useAuthStore();
    store.setUser({ id: 1, name: 'A', phone: '', avatar: '', role: '' });
    store.setUser({ id: 2, name: 'B', phone: '', avatar: '', role: 'admin' });
    expect(store.user).toEqual({ id: 2, name: 'B', phone: '', avatar: '', role: 'admin' });
  });

  it('logout clears user', () => {
    const store = useAuthStore();
    store.setTokens('t', 'rt');
    store.setUser({ id: 1, name: 'A', phone: '', avatar: '', role: '' });
    store.logout();
    expect(store.user).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('useAuthStore - refreshAccessToken', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('calls /auth/refresh and updates tokens on success', async () => {
    const store = useAuthStore();
    store.setTokens('old-at', 'old-rt');

    (request.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { accessToken: 'new-at', refreshToken: 'new-rt' },
    });

    const result = await store.refreshAccessToken();
    expect(result).toBe(true);
    expect(request.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'old-rt' });
    expect(store.accessToken).toBe('new-at');
    expect(store.refreshToken).toBe('new-rt');
  });

  it('returns false when no refresh token', async () => {
    const store = useAuthStore();
    const result = await store.refreshAccessToken();
    expect(result).toBe(false);
    expect(request.post).not.toHaveBeenCalled();
  });

  it('returns false on API error', async () => {
    const store = useAuthStore();
    store.setTokens('at', 'rt');

    (request.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));

    const result = await store.refreshAccessToken();
    expect(result).toBe(false);
    expect(store.accessToken).toBe('at');
  });

  it('persists new tokens to localStorage on refresh', async () => {
    const store = useAuthStore();
    store.setTokens('at', 'rt');

    (request.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { accessToken: 'refreshed-at', refreshToken: 'refreshed-rt' },
    });

    await store.refreshAccessToken();
    expect(localStorage.getItem('accessToken')).toBe('refreshed-at');
    expect(localStorage.getItem('refreshToken')).toBe('refreshed-rt');
  });
});

describe('useAuthStore - isLoggedIn', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('is false initially', () => {
    const store = useAuthStore();
    expect(store.isLoggedIn).toBe(false);
  });

  it('is true after setTokens', () => {
    const store = useAuthStore();
    store.setTokens('at', 'rt');
    expect(store.isLoggedIn).toBe(true);
  });

  it('is false after logout', () => {
    const store = useAuthStore();
    store.setTokens('at', 'rt');
    store.logout();
    expect(store.isLoggedIn).toBe(false);
  });
});

describe('useAuthStore - logout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('clears all state', () => {
    const store = useAuthStore();
    store.setTokens('at', 'rt');
    store.setUser({ id: 1, name: 'X', phone: '', avatar: '', role: '' });
    store.setStoreInfo({ id: 1, name: 'S', code: 'C', region: 'R' });
    store.logout();

    expect(store.accessToken).toBe('');
    expect(store.refreshToken).toBe('');
    expect(store.user).toBeNull();
    expect(store.storeInfo).toBeNull();
  });

  it('clears all localStorage entries', () => {
    const store = useAuthStore();
    store.setTokens('at', 'rt');
    store.logout();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('storeInfo')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('navigates to /login', () => {
    const store = useAuthStore();
    store.logout();
    expect(router.push).toHaveBeenCalledWith('/login');
  });
});
