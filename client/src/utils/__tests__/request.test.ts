import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';

// Mock the auth store before importing request
vi.mock('@/stores/auth', () => {
  let accessToken = '';
  let refreshTokenValue = '';
  const store = {
    get accessToken() { return accessToken; },
    get refreshToken() { return refreshTokenValue; },
    setTokens: vi.fn((at: string, rt: string) => { accessToken = at; refreshTokenValue = rt; }),
    setUser: vi.fn(),
    logout: vi.fn(),
    refreshAccessToken: vi.fn().mockImplementation(async () => {
      if (!refreshTokenValue) return false;
      accessToken = 'new-access-token';
      return true;
    }),
  };
  return { useAuthStore: vi.fn(() => store) };
});

vi.mock('@/router', () => {
  const push = vi.fn();
  return { default: { push } };
});

import request from '@/utils/request';

describe('request util - request interceptor', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('injects Authorization header when token exists in localStorage', async () => {
    localStorage.setItem('accessToken', 'my-test-token');

    // Create a simple interceptor test by making a request and inspecting the config
    const config = await request.interceptors.request.handlers[0].fulfilled({
      headers: {} as any,
    });

    expect(config.headers.Authorization).toBe('Bearer my-test-token');
  });

  it('does not inject Authorization header when no token', async () => {
    const config = await request.interceptors.request.handlers[0].fulfilled({
      headers: {} as any,
    });

    expect(config.headers.Authorization).toBeUndefined();
  });

  it('passes through config unchanged (except header)', async () => {
    localStorage.setItem('accessToken', 'tok');
    const config = {
      headers: {} as any,
      url: '/test',
      method: 'get',
    };

    const result = await request.interceptors.request.handlers[0].fulfilled(config);
    expect(result.url).toBe('/test');
    expect(result.method).toBe('get');
    expect(result.headers.Authorization).toBe('Bearer tok');
  });

  it('rejects on request interceptor error', async () => {
    const error = new Error('request setup error');
    await expect(
      request.interceptors.request.handlers[0].rejected(error),
    ).rejects.toThrow('request setup error');
  });
});

describe('request util - response interceptor (401 handling)', () => {
  let authStoreModule: any;

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    authStoreModule = await import('@/stores/auth');
  });

  it('refreshes token on 401 and retries request', async () => {
    const store = authStoreModule.useAuthStore();
    store.setTokens('old-token', 'old-refresh');

    const originalRequest = {
      headers: { Authorization: 'Bearer old-token' } as any,
      _retry: false,
    };

    const error = {
      response: { status: 401 },
      config: originalRequest,
    };

    const handler = request.interceptors.response.handlers[0];
    // The retry calls request(originalRequest) which fails with network error in jsdom,
    // but we verify the refresh was attempted
    await expect(handler.rejected(error)).rejects.toThrow();
    expect(store.refreshAccessToken).toHaveBeenCalled();
  });

  it('calls logout when refresh fails on 401', async () => {
    const store = authStoreModule.useAuthStore();
    store.refreshAccessToken = vi.fn().mockResolvedValue(false);

    const error = {
      response: { status: 401 },
      config: { headers: {} as any, _retry: false },
    };

    const handler = request.interceptors.response.handlers[0];
    await expect(handler.rejected(error)).rejects.toBeDefined();
    expect(store.logout).toHaveBeenCalled();
  });

  it('does not retry on non-401 errors', async () => {
    const error = {
      response: { status: 500 },
      config: { headers: {} as any, _retry: false },
    };

    const handler = request.interceptors.response.handlers[0];
    await expect(handler.rejected(error)).rejects.toBeDefined();
  });

  it('does not retry if _retry is already true', async () => {
    const store = authStoreModule.useAuthStore();

    const error = {
      response: { status: 401 },
      config: { headers: {} as any, _retry: true },
    };

    const handler = request.interceptors.response.handlers[0];
    await expect(handler.rejected(error)).rejects.toBeDefined();
    expect(store.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('passes through successful responses unchanged', async () => {
    const response = { status: 200, data: { hello: 'world' } };
    const handler = request.interceptors.response.handlers[0];
    const result = await handler.fulfilled(response);
    expect(result).toEqual(response);
  });
});

describe('request util - configuration', () => {
  it('has correct base URL from env', () => {
    expect(request.defaults.baseURL).toBe('http://localhost:3000/api/v1');
  });

  it('has 30s timeout', () => {
    expect(request.defaults.timeout).toBe(30000);
  });
});
