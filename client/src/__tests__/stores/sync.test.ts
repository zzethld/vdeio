import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import { useSyncStore } from '@/stores/sync';
import { useAuthStore } from '@/stores/auth';

describe('useSyncStore', () => {
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

  function mockElectron(overrides: Record<string, unknown> = {}) {
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      syncGetStatus: vi.fn().mockResolvedValue({
        status: 'idle',
        lastSyncTime: null,
        localCacheSize: 0,
        cachedVideoCount: 0,
      }),
      syncStart: vi.fn().mockResolvedValue({ success: true }),
      syncProvideToken: vi.fn(),
      ...overrides,
    };
  }

  describe('initial state', () => {
    it('starts with null syncStatus', () => {
      const store = useSyncStore();
      expect(store.syncStatus).toBeNull();
      expect(store.logs).toHaveLength(0);
      expect(store.isSyncing).toBe(false);
      expect(store.status).toBe('idle');
    });

    it('statusText returns idle by default', () => {
      const store = useSyncStore();
      expect(store.statusText).toBe('空闲');
      expect(store.statusClass).toBe('idle');
    });

    it('lastSyncText returns never when no lastSyncTime', () => {
      const store = useSyncStore();
      expect(store.lastSyncText).toBe('从未同步');
    });

    it('cacheSizeText formats 0 bytes', () => {
      const store = useSyncStore();
      expect(store.cacheSizeText).toBe('0 B');
    });

    it('progressPercent returns 0 when no progress', () => {
      const store = useSyncStore();
      expect(store.progressPercent).toBe(0);
    });
  });

  describe('computed values with status', () => {
    it('statusText returns syncing when syncing', () => {
      const store = useSyncStore();
      store.setSyncStatus({
        status: 'syncing', lastSyncTime: null, localCacheSize: 0, cachedVideoCount: 0,
        progress: { status: 'syncing', current: 1, total: 5 },
      });
      expect(store.statusText).toBe('同步中');
      expect(store.statusClass).toBe('syncing');
      expect(store.isSyncing).toBe(true);
    });

    it('statusText returns error when error', () => {
      const store = useSyncStore();
      store.setSyncStatus({
        status: 'error', lastSyncTime: null, localCacheSize: 0, cachedVideoCount: 0,
      });
      expect(store.statusText).toBe('同步错误');
      expect(store.statusClass).toBe('error');
    });

    it('statusText returns paused when paused', () => {
      const store = useSyncStore();
      store.setSyncStatus({
        status: 'paused', lastSyncTime: null, localCacheSize: 0, cachedVideoCount: 0,
      });
      expect(store.statusText).toBe('已暂停');
      expect(store.statusClass).toBe('paused');
    });

    it('progressPercent calculates correctly', () => {
      const store = useSyncStore();
      store.setSyncStatus({
        status: 'syncing', lastSyncTime: null, localCacheSize: 0, cachedVideoCount: 0,
        progress: { status: 'syncing', current: 3, total: 4 },
      });
      expect(store.progressPercent).toBe(75);
    });

    it('progressPercent returns 0 when total is 0', () => {
      const store = useSyncStore();
      store.setSyncStatus({
        status: 'syncing', lastSyncTime: null, localCacheSize: 0, cachedVideoCount: 0,
        progress: { status: 'syncing', current: 0, total: 0 },
      });
      expect(store.progressPercent).toBe(0);
    });

    it('cacheSizeText formats larger values', () => {
      const store = useSyncStore();
      store.setSyncStatus({
        status: 'idle', lastSyncTime: null,
        localCacheSize: 10 * 1024 * 1024,
        cachedVideoCount: 5,
      });
      expect(store.cacheSizeText).toContain('MB');
      expect(store.cachedVideoCount).toBe(5);
    });

    it('lastSyncText formats valid date string', () => {
      const store = useSyncStore();
      store.setSyncStatus({
        status: 'idle', lastSyncTime: '2024-01-15T10:00:00Z',
        localCacheSize: 0, cachedVideoCount: 0,
      });
      expect(store.lastSyncText).not.toBe('从未同步');
    });
  });

  describe('addLog', () => {
    it('adds entry to the front of logs', () => {
      const store = useSyncStore();
      store.addLog('first', 'info');
      store.addLog('second', 'error');
      expect(store.logs[0].msg).toBe('second');
      expect(store.logs[1].msg).toBe('first');
    });

    it('limits logs to 50 entries', () => {
      const store = useSyncStore();
      for (let i = 0; i < 55; i++) {
        store.addLog(`msg-${i}`);
      }
      expect(store.logs).toHaveLength(50);
    });

    it('clearLogs empties the log', () => {
      const store = useSyncStore();
      store.addLog('test');
      store.clearLogs();
      expect(store.logs).toHaveLength(0);
    });
  });

  describe('updateProgress', () => {
    it('updates syncStatus with new progress data', () => {
      const store = useSyncStore();
      store.setSyncStatus({
        status: 'idle', lastSyncTime: null, localCacheSize: 0, cachedVideoCount: 0,
      });
      store.updateProgress({ status: 'syncing', current: 1, total: 3 });
      expect(store.syncStatus?.status).toBe('syncing');
      expect(store.syncStatus?.progress?.current).toBe(1);
    });

    it('does nothing when syncStatus is null', () => {
      const store = useSyncStore();
      store.updateProgress({ status: 'syncing', current: 1, total: 3 });
      expect(store.syncStatus).toBeNull();
    });
  });

  describe('refreshStatus', () => {
    it('calls electronAPI.syncGetStatus and updates state', async () => {
      mockElectron({
        syncGetStatus: vi.fn().mockResolvedValue({
          status: 'idle', lastSyncTime: '2024-06-01T00:00:00Z',
          localCacheSize: 1024, cachedVideoCount: 2,
        }),
      });

      const store = useSyncStore();
      await store.refreshStatus();

      expect(store.syncStatus?.lastSyncTime).toBe('2024-06-01T00:00:00Z');
      expect(store.syncStatus?.cachedVideoCount).toBe(2);
    });

    it('does nothing when electronAPI is unavailable', async () => {
      delete (window as unknown as { electronAPI?: unknown }).electronAPI;
      const store = useSyncStore();
      await store.refreshStatus();
      expect(store.syncStatus).toBeNull();
    });
  });

  describe('startManualSync', () => {
    it('calls syncStart with token from auth store', async () => {
      const syncStart = vi.fn().mockResolvedValue({ success: true });
      mockElectron({ syncStart });

      const authStore = useAuthStore();
      authStore.setTokens('my-token', 'rt');

      const store = useSyncStore();
      await store.startManualSync();

      expect(syncStart).toHaveBeenCalledWith('my-token');
      // addLog uses unshift, so latest entry is first
      expect(store.logs[0].msg).toBe('同步已启动');
      expect(store.logs[0].type).toBe('success');
      expect(store.logs[1].msg).toBe('开始手动同步...');
      expect(store.logs[1].type).toBe('info');
    });

    it('logs error when no token', async () => {
      mockElectron();
      const store = useSyncStore();
      await store.startManualSync();
      expect(store.logs[0].msg).toBe('未登录，无法同步');
      expect(store.logs[0].type).toBe('error');
    });

    it('logs error when syncStart returns error', async () => {
      mockElectron({
        syncStart: vi.fn().mockResolvedValue({ error: 'Disk full' }),
      });

      const authStore = useAuthStore();
      authStore.setTokens('tok', 'rt');

      const store = useSyncStore();
      await store.startManualSync();

      expect(store.logs.some(l => l.msg.includes('Disk full') && l.type === 'error')).toBe(true);
    });

    it('logs error when syncStart throws', async () => {
      mockElectron({
        syncStart: vi.fn().mockRejectedValue(new Error('Crash')),
      });

      const authStore = useAuthStore();
      authStore.setTokens('tok', 'rt');

      const store = useSyncStore();
      await store.startManualSync();

      expect(store.logs.some(l => l.msg.includes('Crash') && l.type === 'error')).toBe(true);
    });

    it('does nothing when electronAPI is unavailable', async () => {
      delete (window as unknown as { electronAPI?: unknown }).electronAPI;
      const store = useSyncStore();
      await store.startManualSync();
      expect(store.logs).toHaveLength(0);
    });
  });
});
