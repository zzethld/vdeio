import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/utils/request', () => {
  const get = vi.fn().mockResolvedValue({ data: {} });
  const post = vi.fn().mockResolvedValue({ data: {} });
  return { default: { get, post } };
});

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

import SyncStatus from '@/views/SyncStatus.vue';
import { useAuthStore } from '@/stores/auth';
import { mockElectronAPI } from '../helpers/electron-mock';

describe('SyncStatus.vue', () => {
  let savedElectronAPI: unknown;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    savedElectronAPI = (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  afterEach(() => {
    if (savedElectronAPI) {
      (window as unknown as { electronAPI: unknown }).electronAPI = savedElectronAPI;
    } else {
      delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    }
  });

  function setupElectronAPI(overrides: Record<string, unknown> = {}) {
    mockElectronAPI({
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'idle',
        lastSyncTime: null,
        localCacheSize: 0,
        cachedVideoCount: 0,
      }),
      syncStart: vi.fn().mockResolvedValue({ success: true }),
      syncProvideToken: vi.fn(),
      onSyncProgress: vi.fn().mockReturnValue(() => {}),
      onSyncNeedToken: vi.fn().mockReturnValue(() => {}),
      ...overrides,
    });
  }

  it('renders the page header', async () => {
    setupElectronAPI();
    const wrapper = mount(SyncStatus);
    await flushPromises();
    expect(wrapper.find('.app-header .header-title').text()).toBe('同步状态');
  });

  it('shows back button', async () => {
    setupElectronAPI();
    const wrapper = mount(SyncStatus);
    await flushPromises();
    expect(wrapper.find('.btn-back').exists()).toBe(true);
    expect(wrapper.find('.btn-back').text()).toContain('返回');
  });

  it('displays idle status by default', async () => {
    setupElectronAPI();
    const wrapper = mount(SyncStatus);
    await flushPromises();

    const badge = wrapper.find('.status-badge');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe('空闲');
    expect(badge.classes()).toContain('idle');
  });

  it('displays syncing status badge', async () => {
    setupElectronAPI({
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'syncing',
        lastSyncTime: '2024-01-01T00:00:00Z',
        localCacheSize: 1024,
        cachedVideoCount: 5,
        progress: { status: 'syncing', current: 2, total: 5, phase: 'download' },
      }),
    });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    const badge = wrapper.find('.status-badge');
    expect(badge.text()).toBe('同步中');
    expect(badge.classes()).toContain('syncing');
  });

  it('shows progress bar when syncing', async () => {
    setupElectronAPI({
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'syncing',
        lastSyncTime: null,
        localCacheSize: 0,
        cachedVideoCount: 0,
        progress: { status: 'syncing', current: 3, total: 10, phase: 'download', videoTitle: 'Video X' },
      }),
    });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    expect(wrapper.find('.progress-card').exists()).toBe(true);
    expect(wrapper.find('.progress-count').text()).toContain('3 / 10');
    expect(wrapper.find('.progress-video').text()).toContain('Video X');
  });

  it('shows error card when status is error', async () => {
    setupElectronAPI({
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'error',
        lastSyncTime: null,
        localCacheSize: 0,
        cachedVideoCount: 0,
        progress: { status: 'error', current: 0, total: 0, message: 'Disk full' },
      }),
    });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    expect(wrapper.find('.error-card').exists()).toBe(true);
    expect(wrapper.find('.error-card p').text()).toBe('Disk full');
  });

  it('displays last sync time when available', async () => {
    setupElectronAPI({
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'idle',
        lastSyncTime: '2024-06-15T10:30:00Z',
        localCacheSize: 0,
        cachedVideoCount: 0,
      }),
    });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    const rows = wrapper.findAll('.status-row .value');
    expect(rows[1].text()).not.toBe('从未同步');
  });

  it('displays cache size and video count', async () => {
    setupElectronAPI({
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'idle',
        lastSyncTime: null,
        localCacheSize: 10 * 1024 * 1024,
        cachedVideoCount: 3,
      }),
    });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    // .status-row .value: [0]=lastSyncText, [1]=cacheSizeText
    const cacheValue = wrapper.findAll('.status-row .value')[1];
    expect(cacheValue.text()).toContain('MB');
    expect(cacheValue.text()).toContain('3');
  });

  it('refresh button calls syncGetStatus', async () => {
    const syncGetStatus = vi.fn().mockResolvedValue({
      status: 'idle', lastSyncTime: null, localCacheSize: 0, cachedVideoCount: 0,
    });
    setupElectronAPI({ syncGetStatus });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    expect(syncGetStatus).toHaveBeenCalledTimes(1);

    await wrapper.find('.btn-refresh').trigger('click');
    await flushPromises();

    expect(syncGetStatus).toHaveBeenCalledTimes(2);
  });

  it('manual sync button calls syncStart with token', async () => {
    const syncStart = vi.fn().mockResolvedValue({ success: true });
    setupElectronAPI({ syncStart });

    const authStore = useAuthStore();
    authStore.setTokens('test-token', 'test-refresh');

    const wrapper = mount(SyncStatus);
    await flushPromises();

    await wrapper.find('.btn-sync').trigger('click');
    await flushPromises();

    expect(syncStart).toHaveBeenCalledWith('test-token');
    expect(wrapper.find('.log-list').exists()).toBe(true);
  });

  it('manual sync shows error log when no token', async () => {
    const syncStart = vi.fn();
    setupElectronAPI({ syncStart });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    await wrapper.find('.btn-sync').trigger('click');
    await flushPromises();

    expect(syncStart).not.toHaveBeenCalled();
    expect(wrapper.find('.log-list').exists()).toBe(true);
    expect(wrapper.find('.log-msg.error').text()).toContain('未登录');
  });

  it('manual sync button is disabled while syncing', async () => {
    setupElectronAPI({
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'syncing',
        lastSyncTime: null,
        localCacheSize: 0,
        cachedVideoCount: 0,
        progress: { status: 'syncing', current: 1, total: 5 },
      }),
    });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    const btn = wrapper.find('.btn-sync');
    expect(btn.attributes('disabled')).toBeDefined();
    expect(btn.text()).toContain('同步中');
  });

  it('manual sync logs error when syncStart returns error', async () => {
    const syncStart = vi.fn().mockResolvedValue({ error: 'Network failed' });
    setupElectronAPI({ syncStart });

    const authStore = useAuthStore();
    authStore.setTokens('tok', 'rt');

    const wrapper = mount(SyncStatus);
    await flushPromises();

    await wrapper.find('.btn-sync').trigger('click');
    await flushPromises();

    expect(wrapper.find('.log-msg.error').text()).toContain('Network failed');
  });

  it('displays phase text correctly', async () => {
    setupElectronAPI({
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'syncing',
        lastSyncTime: null,
        localCacheSize: 0,
        cachedVideoCount: 0,
        progress: { status: 'syncing', current: 1, total: 5, phase: 'download' },
      }),
    });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    expect(wrapper.find('.progress-phase').text()).toBe('下载视频');
  });

  it('calculates progress percentage correctly', async () => {
    setupElectronAPI({
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'syncing',
        lastSyncTime: null,
        localCacheSize: 0,
        cachedVideoCount: 0,
        progress: { status: 'syncing', current: 3, total: 4 },
      }),
    });

    const wrapper = mount(SyncStatus);
    await flushPromises();

    const fill = wrapper.find('.progress-bar-fill');
    expect(fill.attributes('style')).toContain('width: 75%');
  });
});
