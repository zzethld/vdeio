import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import type { SyncLogEntry, SyncProgressInfo, SyncStatusInfo } from '@/types';

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * @deprecated This store is unused in production — sync UI calls
 * `window.electronAPI.syncGetStatus()` / `syncStart()` inline (the engine lives
 * in `client/electron/sync-service.ts`). No live component imports this store;
 * kept only because tests still reference it. May be removed in a future cleanup
 * once tests are migrated.
 */
export const useSyncStore = defineStore('sync', () => {
  const syncStatus = ref<SyncStatusInfo | null>(null);
  const logs = ref<SyncLogEntry[]>([]);

  const progress = computed(() => syncStatus.value?.progress ?? null);
  const isSyncing = computed(() => progress.value?.status === 'syncing');
  const status = computed(() => syncStatus.value?.status ?? 'idle');

  const statusText = computed(() => {
    const s = status.value;
    if (s === 'syncing') return '同步中';
    if (s === 'error') return '同步错误';
    if (s === 'paused') return '已暂停';
    return '空闲';
  });

  const statusClass = computed(() => {
    const s = status.value;
    if (s === 'syncing') return 'syncing';
    if (s === 'error') return 'error';
    if (s === 'paused') return 'paused';
    return 'idle';
  });

  const lastSyncText = computed(() => {
    if (!syncStatus.value?.lastSyncTime) return '从未同步';
    try {
      return new Date(syncStatus.value.lastSyncTime).toLocaleString('zh-CN');
    } catch {
      return syncStatus.value.lastSyncTime;
    }
  });

  const cacheSizeText = computed(() => formatSize(syncStatus.value?.localCacheSize ?? 0));
  const cachedVideoCount = computed(() => syncStatus.value?.cachedVideoCount ?? 0);

  const progressPercent = computed(() => {
    if (!progress.value || progress.value.total === 0) return 0;
    return Math.round((progress.value.current / progress.value.total) * 100);
  });

  function addLog(msg: string, type: SyncLogEntry['type'] = 'info'): void {
    const time = new Date().toLocaleTimeString('zh-CN');
    logs.value.unshift({ time, msg, type });
    if (logs.value.length > 50) logs.value.pop();
  }

  function clearLogs(): void {
    logs.value = [];
  }

  function setSyncStatus(info: SyncStatusInfo): void {
    syncStatus.value = info;
  }

  function updateProgress(data: SyncProgressInfo): void {
    if (syncStatus.value) {
      syncStatus.value = { ...syncStatus.value, status: data.status, progress: data };
    }
  }

  async function refreshStatus(): Promise<void> {
    if (!window.electronAPI) return;
    try {
      syncStatus.value = await window.electronAPI.syncGetStatus();
    } catch (e) {
      console.error('Failed to get sync status:', e);
    }
  }

  async function startManualSync(): Promise<void> {
    if (!window.electronAPI) return;
    const authStore = useAuthStore();
    const token = authStore.accessToken;
    if (!token) {
      addLog('未登录，无法同步', 'error');
      return;
    }
    addLog('开始手动同步...', 'info');
    try {
      const result = await window.electronAPI.syncStart(token);
      if (result.error) {
        addLog(`同步失败: ${result.error}`, 'error');
      } else {
        addLog('同步已启动', 'success');
      }
    } catch (e) {
      addLog(`同步异常: ${(e as Error).message}`, 'error');
    }
  }

  return {
    syncStatus,
    logs,
    progress,
    isSyncing,
    status,
    statusText,
    statusClass,
    lastSyncText,
    cacheSizeText,
    cachedVideoCount,
    progressPercent,
    addLog,
    clearLogs,
    setSyncStatus,
    updateProgress,
    refreshStatus,
    startManualSync,
  };
});
