import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock element-plus with a shared mock fn — hoisted mock is what the module under test uses
const mockElMessageError = vi.fn();
vi.mock('element-plus', () => ({
  ElMessage: {
    error: (...args: unknown[]) => mockElMessageError(...args),
  },
}));

// Mock router
const mockPush = vi.fn();
vi.mock('@/router', () => ({
  default: {
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

import request from '@/utils/request';

describe('Request Util', () => {
  beforeEach(() => {
    mockElMessageError.mockClear();
    mockPush.mockClear();
    localStorage.clear();
  });

  describe('configuration', () => {
    it('should have baseURL set to /api/v1', () => {
      expect(request.defaults.baseURL).toBe('/api/v1');
    });

    it('should have timeout set to 15000ms', () => {
      expect(request.defaults.timeout).toBe(15000);
    });
  });

  describe('request interceptor - Authorization header', () => {
    it('should read token from localStorage when present', () => {
      localStorage.setItem('accessToken', 'my-jwt-token');
      expect(localStorage.getItem('accessToken')).toBe('my-jwt-token');
    });

    it('should have no token in localStorage by default', () => {
      expect(localStorage.getItem('accessToken')).toBeNull();
    });
  });

  describe('response interceptor - error handling', () => {
    it('should handle 401 by clearing storage and redirecting to login', async () => {
      localStorage.setItem('accessToken', 'old-token');
      localStorage.setItem('refreshToken', 'old-refresh');
      localStorage.setItem('admin', '{"id":"1"}');

      const error401 = {
        response: { status: 401, data: {} },
        message: 'Unauthorized',
      };

      try {
        await request.interceptors.response.handlers[0].rejected(error401);
      } catch {
        // expected to re-throw
      }

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('admin')).toBeNull();
      expect(mockPush).toHaveBeenCalledWith('/login');
      expect(mockElMessageError).toHaveBeenCalledWith('登录已过期，请重新登录');
    });

    it('should show error message from response data for non-401 errors', async () => {
      const error500 = {
        response: {
          status: 500,
          data: { message: '服务器内部错误' },
        },
        message: 'Internal Server Error',
      };

      try {
        await request.interceptors.response.handlers[0].rejected(error500);
      } catch {
        // expected
      }

      expect(mockElMessageError).toHaveBeenCalledWith('服务器内部错误');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should fallback to error.message when no response data message', async () => {
      const errorNoMsg = {
        response: { status: 503, data: {} },
        message: 'Service Unavailable',
      };

      try {
        await request.interceptors.response.handlers[0].rejected(errorNoMsg);
      } catch {
        // expected
      }

      expect(mockElMessageError).toHaveBeenCalledWith('Service Unavailable');
    });

    it('should fallback to "请求失败" when no response and no message', async () => {
      const errorBare = {
        message: '',
      };

      try {
        await request.interceptors.response.handlers[0].rejected(errorBare);
      } catch {
        // expected
      }

      // error.response?.data?.message = undefined, error.message = '', so fallback = '请求失败'
      expect(mockElMessageError).toHaveBeenCalledWith('请求失败');
    });

    it('should re-throw the error after handling', async () => {
      const error = {
        response: { status: 500, data: { message: 'fail' } },
        message: 'fail',
      };

      await expect(
        request.interceptors.response.handlers[0].rejected(error),
      ).rejects.toBe(error);
    });
  });
});
