import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock auth store so the real router guard reads a controllable value
const mockAuthStore = {
  isLoggedIn: false,
};

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}));

// Stub all lazy-loaded view/layout components so importing the real router
// does not pull in heavy dependencies (echarts, Element Plus, etc.).
const stubComponent = (name: string) => ({
  default: { name, template: `<div class="${name.toLowerCase()}-stub" />` },
});

vi.mock('@/layouts/MainLayout.vue', () => stubComponent('MainLayout'));
vi.mock('@/views/Login.vue', () => stubComponent('Login'));
vi.mock('@/views/Dashboard.vue', () => stubComponent('Dashboard'));
vi.mock('@/views/NotFound.vue', () => stubComponent('NotFound'));
vi.mock('@/views/video/VideoList.vue', () => stubComponent('VideoList'));
vi.mock('@/views/video/VideoUpload.vue', () => stubComponent('VideoUpload'));
vi.mock('@/views/campaign/CampaignList.vue', () => stubComponent('CampaignList'));
vi.mock('@/views/campaign/CampaignCreate.vue', () => stubComponent('CampaignCreate'));
vi.mock('@/views/campaign/CampaignDetail.vue', () => stubComponent('CampaignDetail'));
vi.mock('@/views/store/StoreList.vue', () => stubComponent('StoreList'));
vi.mock('@/views/device/DeviceList.vue', () => stubComponent('DeviceList'));

// Import the REAL router — exercises the actual route table and beforeEach guard
import router from '@/router';

describe('Router (real src/router/index.ts)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    mockAuthStore.isLoggedIn = false;

    // Reset location to a known starting point before each test
    await router.push('/login');
    await router.isReady();
  });

  describe('route table definitions', () => {
    it('declares a Login route at /login', () => {
      const record = router.getRoutes().find((r) => r.name === 'Login');
      expect(record).toBeDefined();
      expect(record?.path).toBe('/login');
    });

    it('declares a Dashboard route', () => {
      const record = router.getRoutes().find((r) => r.name === 'Dashboard');
      expect(record).toBeDefined();
      expect(record?.path).toContain('dashboard');
    });

    it('declares all main feature routes', () => {
      const names = new Set(router.getRoutes().map((r) => r.name));
      for (const name of [
        'Login',
        'Dashboard',
        'Videos',
        'VideoUpload',
        'Campaigns',
        'CampaignCreate',
        'CampaignEdit',
        'CampaignDetail',
        'Stores',
        'Devices',
        'NotFound',
      ]) {
        expect(names.has(name)).toBe(true);
      }
    });

    it('marks /login as requiresAuth: false', () => {
      const record = router.getRoutes().find((r) => r.name === 'Login');
      expect(record?.meta?.requiresAuth).toBe(false);
    });

    it('marks the main layout as requiresAuth: true', () => {
      const root = router.getRoutes().find((r) => r.path === '/');
      expect(root?.meta?.requiresAuth).toBe(true);
    });

    it('declares CampaignEdit with :id param under campaigns/edit/:id', () => {
      const record = router.getRoutes().find((r) => r.name === 'CampaignEdit');
      expect(record).toBeDefined();
      expect(record?.path).toContain(':id');
    });

    it('has a catch-all NotFound route', () => {
      const notFound = router.getRoutes().find((r) => r.name === 'NotFound');
      expect(notFound).toBeDefined();
      expect(notFound?.path).toContain('pathMatch');
    });
  });

  describe('unauthenticated access (guard)', () => {
    it('redirects to Login with redirect query when visiting /dashboard', async () => {
      mockAuthStore.isLoggedIn = false;
      await router.push('/dashboard');

      expect(router.currentRoute.value.name).toBe('Login');
      expect(router.currentRoute.value.query.redirect).toBe('/dashboard');
    });

    it('redirects to Login when visiting /videos', async () => {
      mockAuthStore.isLoggedIn = false;
      await router.push('/videos');

      expect(router.currentRoute.value.name).toBe('Login');
      expect(router.currentRoute.value.query.redirect).toBe('/videos');
    });

    it('redirects to Login when visiting /campaigns', async () => {
      mockAuthStore.isLoggedIn = false;
      await router.push('/campaigns');

      expect(router.currentRoute.value.name).toBe('Login');
      expect(router.currentRoute.value.query.redirect).toBe('/campaigns');
    });

    it('redirects to Login when visiting /stores', async () => {
      mockAuthStore.isLoggedIn = false;
      await router.push('/stores');

      expect(router.currentRoute.value.name).toBe('Login');
      expect(router.currentRoute.value.query.redirect).toBe('/stores');
    });

    it('redirects to Login when visiting /devices', async () => {
      mockAuthStore.isLoggedIn = false;
      await router.push('/devices');

      expect(router.currentRoute.value.name).toBe('Login');
      expect(router.currentRoute.value.query.redirect).toBe('/devices');
    });

    it('allows Login page access when unauthenticated', async () => {
      mockAuthStore.isLoggedIn = false;
      await router.push('/login');

      expect(router.currentRoute.value.name).toBe('Login');
      expect(router.currentRoute.value.query.redirect).toBeUndefined();
    });

    it('redirects root path to Login when unauthenticated (root redirects to /dashboard first)', async () => {
      mockAuthStore.isLoggedIn = false;
      await router.push('/');

      // Root has `redirect: '/dashboard'`, so router resolves to /dashboard,
      // then the guard sees requiresAuth and bounces to Login with that as redirect.
      expect(router.currentRoute.value.name).toBe('Login');
      expect(router.currentRoute.value.query.redirect).toBe('/dashboard');
    });
  });

  describe('authenticated access (guard)', () => {
    it('allows /dashboard when authenticated', async () => {
      mockAuthStore.isLoggedIn = true;
      await router.push('/dashboard');

      expect(router.currentRoute.value.path).toBe('/dashboard');
      expect(router.currentRoute.value.name).toBe('Dashboard');
    });

    it('allows /videos when authenticated', async () => {
      mockAuthStore.isLoggedIn = true;
      await router.push('/videos');

      expect(router.currentRoute.value.path).toBe('/videos');
      expect(router.currentRoute.value.name).toBe('Videos');
    });

    it('allows /campaigns/create when authenticated', async () => {
      mockAuthStore.isLoggedIn = true;
      await router.push('/campaigns/create');

      expect(router.currentRoute.value.name).toBe('CampaignCreate');
    });

    it('allows /campaigns/edit/:id when authenticated', async () => {
      mockAuthStore.isLoggedIn = true;
      await router.push('/campaigns/edit/7');

      expect(router.currentRoute.value.name).toBe('CampaignEdit');
      expect(router.currentRoute.value.params.id).toBe('7');
    });

    it('allows /stores when authenticated', async () => {
      mockAuthStore.isLoggedIn = true;
      await router.push('/stores');

      expect(router.currentRoute.value.name).toBe('Stores');
    });

    it('allows /devices when authenticated', async () => {
      mockAuthStore.isLoggedIn = true;
      await router.push('/devices');

      expect(router.currentRoute.value.name).toBe('Devices');
    });

    it('redirects authenticated user away from /login to /dashboard', async () => {
      mockAuthStore.isLoggedIn = true;
      // Navigate somewhere else first so the push to /login is not a redundant no-op
      await router.push('/dashboard');
      await router.push('/login');

      expect(router.currentRoute.value.name).toBe('Dashboard');
    });

    it('redirects root to /dashboard when authenticated', async () => {
      mockAuthStore.isLoggedIn = true;
      await router.push('/');

      expect(router.currentRoute.value.path).toBe('/dashboard');
    });
  });

  describe('unknown routes', () => {
    it('falls through to NotFound for arbitrary paths when authenticated', async () => {
      mockAuthStore.isLoggedIn = true;
      await router.push('/this-does-not-exist');

      expect(router.currentRoute.value.name).toBe('NotFound');
    });
  });
});
