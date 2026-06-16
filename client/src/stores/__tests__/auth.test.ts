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

import { useAuthStore } from '@/stores/auth';
import router from '@/router';

describe('useAuthStore - setStoreInfo', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('sets store info and persists to localStorage', () => {
    const store = useAuthStore();
    const info = { id: 10, name: 'Main Store', code: 'MS001', region: 'east' };
    store.setStoreInfo(info);
    expect(store.storeInfo).toEqual(info);
    expect(JSON.parse(localStorage.getItem('storeInfo')!)).toEqual(info);
  });

  it('overwrites previous store info', () => {
    const store = useAuthStore();
    store.setStoreInfo({ id: 1, name: 'Old', code: 'OLD', region: 'north' });
    store.setStoreInfo({ id: 2, name: 'New', code: 'NEW', region: 'south' });
    expect(store.storeInfo).toEqual({ id: 2, name: 'New', code: 'NEW', region: 'south' });
    expect(JSON.parse(localStorage.getItem('storeInfo')!).name).toBe('New');
  });

  it('logout clears store info', () => {
    const store = useAuthStore();
    store.setTokens('token', 'refresh');
    store.setStoreInfo({ id: 1, name: 'Test', code: 'T', region: 'east' });
    store.logout();
    expect(store.storeInfo).toBeNull();
    expect(localStorage.getItem('storeInfo')).toBeNull();
  });
});

describe('useAuthStore - loadFromStorage edge cases', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('handles corrupt storeInfo JSON gracefully', () => {
    localStorage.setItem('accessToken', 'token');
    localStorage.setItem('refreshToken', 'rt');
    localStorage.setItem('storeInfo', 'not-valid-json{{{');
    const store = useAuthStore();
    store.loadFromStorage();
    expect(store.accessToken).toBe('token');
    expect(store.storeInfo).toBeNull();
  });

  it('handles corrupt user JSON gracefully', () => {
    localStorage.setItem('accessToken', 'token');
    localStorage.setItem('user', '{invalid json');
    const store = useAuthStore();
    store.loadFromStorage();
    expect(store.accessToken).toBe('token');
    expect(store.user).toBeNull();
  });

  it('does nothing when accessToken is missing', () => {
    localStorage.setItem('refreshToken', 'rt');
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'A', phone: '', avatar: '', role: '' }));
    const store = useAuthStore();
    store.loadFromStorage();
    expect(store.accessToken).toBe('');
    expect(store.user).toBeNull();
  });

  it('restores storeInfo from localStorage', () => {
    const info = { id: 5, name: 'Store5', code: 'S5', region: 'west' };
    localStorage.setItem('accessToken', 'at');
    localStorage.setItem('storeInfo', JSON.stringify(info));
    const store = useAuthStore();
    store.loadFromStorage();
    expect(store.storeInfo).toEqual(info);
  });

  it('restores user and storeInfo together', () => {
    const user = { id: 3, name: 'Charlie', phone: '13700137000', avatar: '', role: 'operator' };
    const info = { id: 1, name: 'HQ', code: 'HQ', region: 'central' };
    localStorage.setItem('accessToken', 'at');
    localStorage.setItem('refreshToken', 'rt');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('storeInfo', JSON.stringify(info));
    const store = useAuthStore();
    store.loadFromStorage();
    expect(store.user).toEqual(user);
    expect(store.storeInfo).toEqual(info);
    expect(store.refreshToken).toBe('rt');
  });

  it('sets refreshToken to empty string when not in storage', () => {
    localStorage.setItem('accessToken', 'at');
    // no refreshToken set
    const store = useAuthStore();
    store.loadFromStorage();
    expect(store.refreshToken).toBe('');
  });
});

describe('useAuthStore - token lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('isLoggedIn toggles correctly', () => {
    const store = useAuthStore();
    expect(store.isLoggedIn).toBe(false);
    store.setTokens('new-token', 'new-refresh');
    expect(store.isLoggedIn).toBe(true);
    store.logout();
    expect(store.isLoggedIn).toBe(false);
  });

  it('setTokens overwrites previous tokens', () => {
    const store = useAuthStore();
    store.setTokens('first', 'first-rt');
    expect(store.accessToken).toBe('first');
    store.setTokens('second', 'second-rt');
    expect(store.accessToken).toBe('second');
    expect(localStorage.getItem('accessToken')).toBe('second');
  });

  it('logout navigates to /login', () => {
    const store = useAuthStore();
    store.setTokens('t', 'rt');
    store.logout();
    expect(router.push).toHaveBeenCalledWith('/login');
  });

  it('initializes from storage on creation', () => {
    localStorage.setItem('accessToken', 'init-token');
    localStorage.setItem('refreshToken', 'init-rt');
    const store = useAuthStore();
    expect(store.accessToken).toBe('init-token');
    expect(store.refreshToken).toBe('init-rt');
    expect(store.isLoggedIn).toBe(true);
  });

  it('starts with empty state when no stored data', () => {
    const store = useAuthStore();
    expect(store.accessToken).toBe('');
    expect(store.refreshToken).toBe('');
    expect(store.user).toBeNull();
    expect(store.storeInfo).toBeNull();
    expect(store.isLoggedIn).toBe(false);
  });
});
