import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';

// Mock the request module
vi.mock('@/utils/request', () => ({
  default: {
    post: vi.fn(),
  },
}));

// Mock the router module
vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
  },
}));

import request from '@/utils/request';
import router from '@/router';

const mockAdmin = {
  id: 'admin-1',
  username: 'testadmin',
  name: 'Test Admin',
  role: 'superadmin',
};

const mockLoginResponse = {
  data: {
    accessToken: 'test-access-token-123',
    refreshToken: 'test-refresh-token-456',
    admin: mockAdmin,
  },
};

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start with empty tokens', () => {
      const store = useAuthStore();
      expect(store.accessToken).toBe('');
      expect(store.refreshToken).toBe('');
      expect(store.admin).toBeNull();
    });

    it('should not be logged in initially', () => {
      const store = useAuthStore();
      expect(store.isLoggedIn).toBe(false);
    });
  });

  describe('isLoggedIn computed', () => {
    it('returns false when accessToken is empty', () => {
      const store = useAuthStore();
      expect(store.isLoggedIn).toBe(false);
    });

    it('returns true when accessToken is set', () => {
      const store = useAuthStore();
      store.accessToken = 'some-token';
      expect(store.isLoggedIn).toBe(true);
    });

    it('returns true when accessToken is any truthy string', () => {
      const store = useAuthStore();
      store.accessToken = 'abc';
      expect(store.isLoggedIn).toBe(true);
    });
  });

  describe('login', () => {
    it('should set tokens and admin on successful login', async () => {
      vi.mocked(request.post).mockResolvedValue(mockLoginResponse);
      const store = useAuthStore();

      await store.login('testadmin', 'password123');

      expect(store.accessToken).toBe('test-access-token-123');
      expect(store.refreshToken).toBe('test-refresh-token-456');
      expect(store.admin).toEqual(mockAdmin);
    });

    it('should persist tokens to localStorage on login', async () => {
      vi.mocked(request.post).mockResolvedValue(mockLoginResponse);
      const store = useAuthStore();

      await store.login('testadmin', 'password123');

      expect(localStorage.getItem('accessToken')).toBe('test-access-token-123');
      expect(localStorage.getItem('refreshToken')).toBe('test-refresh-token-456');
    });

    it('should persist admin info to localStorage on login', async () => {
      vi.mocked(request.post).mockResolvedValue(mockLoginResponse);
      const store = useAuthStore();

      await store.login('testadmin', 'password123');

      expect(localStorage.getItem('admin')).toBe(JSON.stringify(mockAdmin));
    });

    it('should call request.post with correct URL and credentials', async () => {
      vi.mocked(request.post).mockResolvedValue(mockLoginResponse);
      const store = useAuthStore();

      await store.login('myuser', 'mypass');

      expect(request.post).toHaveBeenCalledWith('/admin/auth/login', {
        username: 'myuser',
        password: 'mypass',
      });
    });

    it('should update isLoggedIn to true after login', async () => {
      vi.mocked(request.post).mockResolvedValue(mockLoginResponse);
      const store = useAuthStore();

      expect(store.isLoggedIn).toBe(false);
      await store.login('testadmin', 'password123');
      expect(store.isLoggedIn).toBe(true);
    });

    it('should throw on login failure (wrong credentials)', async () => {
      const error = new Error('Unauthorized');
      vi.mocked(request.post).mockRejectedValue(error);
      const store = useAuthStore();

      await expect(store.login('wrong', 'creds')).rejects.toThrow('Unauthorized');

      expect(store.accessToken).toBe('');
      expect(store.admin).toBeNull();
      expect(store.isLoggedIn).toBe(false);
    });

    it('should not persist to localStorage on login failure', async () => {
      vi.mocked(request.post).mockRejectedValue(new Error('fail'));
      const store = useAuthStore();

      try {
        await store.login('wrong', 'creds');
      } catch {
        // expected
      }

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('admin')).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear tokens and admin', async () => {
      vi.mocked(request.post).mockResolvedValue(mockLoginResponse);
      const store = useAuthStore();

      await store.login('testadmin', 'password123');
      expect(store.isLoggedIn).toBe(true);

      store.logout();

      expect(store.accessToken).toBe('');
      expect(store.refreshToken).toBe('');
      expect(store.admin).toBeNull();
      expect(store.isLoggedIn).toBe(false);
    });

    it('should remove tokens from localStorage', async () => {
      vi.mocked(request.post).mockResolvedValue(mockLoginResponse);
      const store = useAuthStore();

      await store.login('testadmin', 'password123');
      store.logout();

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('admin')).toBeNull();
    });

    it('should redirect to /login page', () => {
      const store = useAuthStore();
      store.logout();

      expect(router.push).toHaveBeenCalledWith('/login');
    });
  });

  describe('loadFromStorage', () => {
    it('should restore tokens from localStorage', () => {
      localStorage.setItem('accessToken', 'stored-token');
      localStorage.setItem('refreshToken', 'stored-refresh');
      localStorage.setItem('admin', JSON.stringify(mockAdmin));

      const store = useAuthStore();
      store.loadFromStorage();

      expect(store.accessToken).toBe('stored-token');
      expect(store.refreshToken).toBe('stored-refresh');
      expect(store.admin).toEqual(mockAdmin);
      expect(store.isLoggedIn).toBe(true);
    });

    it('should handle missing localStorage data gracefully', () => {
      const store = useAuthStore();
      store.loadFromStorage();

      expect(store.accessToken).toBe('');
      expect(store.admin).toBeNull();
      expect(store.isLoggedIn).toBe(false);
    });

    it('should handle corrupt admin JSON in localStorage', () => {
      localStorage.setItem('accessToken', 'some-token');
      localStorage.setItem('admin', '{invalid-json}');

      const store = useAuthStore();
      store.loadFromStorage();

      expect(store.accessToken).toBe('some-token');
      expect(store.admin).toBeNull();
    });

    it('should not restore anything when accessToken is missing', () => {
      localStorage.setItem('refreshToken', 'some-refresh');
      localStorage.setItem('admin', JSON.stringify(mockAdmin));

      const store = useAuthStore();
      store.loadFromStorage();

      expect(store.accessToken).toBe('');
      expect(store.refreshToken).toBe('');
      expect(store.admin).toBeNull();
    });
  });
});
