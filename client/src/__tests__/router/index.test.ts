import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

// Mock the lazy-loaded view components as simple stubs
vi.mock('@/views/Login.vue', () => ({
  default: { name: 'Login', template: '<div id="login-view" />' },
}));
vi.mock('@/views/Home.vue', () => ({
  default: { name: 'Home', template: '<div id="home-view" />' },
}));
vi.mock('@/views/Player.vue', () => ({
  default: { name: 'Player', template: '<div id="player-view" />' },
}));
vi.mock('@/views/SyncStatus.vue', () => ({
  default: { name: 'SyncStatus', template: '<div id="sync-view" />' },
}));

vi.mock('@/utils/request', () => {
  const get = vi.fn();
  const post = vi.fn().mockResolvedValue({ data: {} });
  return { default: { get, post } };
});

import router from '@/router';
import { useAuthStore } from '@/stores/auth';

describe('router/index.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  async function navigateTo(path: string): Promise<void> {
    await router.push(path);
    await nextTick();
  }

  describe('route definitions', () => {
    it('has Login route at /login with requiresAuth false', () => {
      const route = router.getRoutes().find((r) => r.name === 'Login');
      expect(route).toBeDefined();
      expect(route?.path).toBe('/login');
      expect(route?.meta?.requiresAuth).toBe(false);
    });

    it('has Home route at / with requiresAuth true', () => {
      const route = router.getRoutes().find((r) => r.name === 'Home');
      expect(route).toBeDefined();
      expect(route?.path).toBe('/');
      expect(route?.meta?.requiresAuth).toBe(true);
    });

    it('has Player route at /player/:id with requiresAuth true', () => {
      const route = router.getRoutes().find((r) => r.name === 'Player');
      expect(route).toBeDefined();
      expect(route?.path).toBe('/player/:id');
      expect(route?.meta?.requiresAuth).toBe(true);
    });

    it('has SyncStatus route at /sync-status with requiresAuth true', () => {
      const route = router.getRoutes().find((r) => r.name === 'SyncStatus');
      expect(route).toBeDefined();
      expect(route?.path).toBe('/sync-status');
      expect(route?.meta?.requiresAuth).toBe(true);
    });

    it('uses hash-based history', () => {
      expect(router.options.history).toBeDefined();
    });

    it('defines exactly 4 routes', () => {
      const namedRoutes = router.getRoutes().filter((r) => r.name);
      expect(namedRoutes).toHaveLength(4);
    });
  });

  describe('navigation guard - unauthenticated access', () => {
    it('redirects to Login when accessing Home without auth', async () => {
      // Ensure logged out
      const authStore = useAuthStore();
      authStore.logout();

      await navigateTo('/');
      expect(router.currentRoute.value.name).toBe('Login');
    });

    it('includes redirect query when redirected from protected route', async () => {
      const authStore = useAuthStore();
      authStore.logout();

      await navigateTo('/sync-status');
      expect(router.currentRoute.value.name).toBe('Login');
      expect(router.currentRoute.value.query.redirect).toBe('/sync-status');
    });

    it('redirects to Login when accessing Player without auth', async () => {
      const authStore = useAuthStore();
      authStore.logout();

      await navigateTo('/player/42');
      expect(router.currentRoute.value.name).toBe('Login');
    });

    it('allows access to Login when not authenticated', async () => {
      const authStore = useAuthStore();
      authStore.logout();

      await navigateTo('/login');
      expect(router.currentRoute.value.name).toBe('Login');
    });
  });

  describe('navigation guard - authenticated access', () => {
    it('allows access to Home when authenticated', async () => {
      const authStore = useAuthStore();
      authStore.setTokens('access-token', 'refresh-token');

      await navigateTo('/');
      expect(router.currentRoute.value.name).toBe('Home');
    });

    it('allows access to Player with id param when authenticated', async () => {
      const authStore = useAuthStore();
      authStore.setTokens('access-token', 'refresh-token');

      await navigateTo('/player/99');
      expect(router.currentRoute.value.name).toBe('Player');
      expect(router.currentRoute.value.params.id).toBe('99');
    });

    it('allows access to SyncStatus when authenticated', async () => {
      const authStore = useAuthStore();
      authStore.setTokens('access-token', 'refresh-token');

      await navigateTo('/sync-status');
      expect(router.currentRoute.value.name).toBe('SyncStatus');
    });

    it('redirects from Login to Home when already authenticated', async () => {
      const authStore = useAuthStore();
      authStore.setTokens('access-token', 'refresh-token');

      await navigateTo('/login');
      expect(router.currentRoute.value.name).toBe('Home');
    });
  });

  describe('navigation guard - auth state transitions', () => {
    it('can access Home after logging in', async () => {
      const authStore = useAuthStore();

      // Start from login page to ensure a real navigation
      authStore.logout();
      await navigateTo('/login');

      // Try to access Home while logged out — should redirect to Login
      await navigateTo('/');
      expect(router.currentRoute.value.name).toBe('Login');

      // Log in
      authStore.setTokens('token', 'refresh');
      await navigateTo('/login');
      await navigateTo('/');
      expect(router.currentRoute.value.name).toBe('Home');
    });

    it('redirects to Login after logging out from a protected route', async () => {
      const authStore = useAuthStore();
      authStore.setTokens('token', 'refresh');

      await navigateTo('/');
      expect(router.currentRoute.value.name).toBe('Home');

      // Log out — authStore.logout() navigates to /login via mocked router.push
      // but the real router won't see it, so navigate explicitly
      authStore.logout();
      localStorage.removeItem('accessToken');
      // Navigate to a different route first to force guard re-evaluation
      await navigateTo('/login');
      await navigateTo('/sync-status');
      expect(router.currentRoute.value.name).toBe('Login');
    });
  });
});
