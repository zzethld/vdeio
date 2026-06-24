<template>
  <div class="sync-status-page">
    <AppHeader title="同步状态" show-back />

    <main class="sync-content">
      <!-- Status Card -->
      <div class="card status-card">
        <div class="status-row">
          <span class="label">当前状态</span>
          <StatusBadge :type="badgeType" :label="statusText" />
        </div>
        <div class="status-row">
          <span class="label">上次同步</span>
          <span class="value">{{ lastSyncText }}</span>
        </div>
        <div class="status-row">
          <span class="label">本地缓存</span>
          <span class="value">
            {{ cacheSizeText }}（{{ syncStatus?.cachedVideoCount || 0 }} 个视频）
          </span>
        </div>
      </div>

      <!-- Progress Card -->
      <div v-if="progress && progress.status === 'syncing'" class="card progress-card">
        <div class="progress-header">
          <span class="progress-phase">{{ phaseText }}</span>
          <span class="progress-count">{{ progress.current }} / {{ progress.total }}</span>
        </div>
        <ProgressBar :percent="progressPercent" />
        <div v-if="progress.message" class="progress-message">{{ progress.message }}</div>
        <div v-if="progress.videoTitle" class="progress-video">
          当前: {{ progress.videoTitle }}
        </div>
      </div>

      <!-- Error message -->
      <div v-if="progress && progress.status === 'error'" class="card error-card">
        <p>{{ progress.message || '同步失败' }}</p>
      </div>

      <!-- Actions -->
      <div class="card actions-card">
        <button
          class="btn-sync"
          :disabled="isSyncing"
          @click="startManualSync"
        >
          {{ isSyncing ? '同步中...' : '手动同步' }}
        </button>
        <button class="btn-refresh" @click="refreshStatus">
          刷新状态
        </button>
      </div>

      <!-- Event Log -->
      <div v-if="logs.length > 0" class="card log-card">
        <h3>同步日志</h3>
        <div class="log-list">
          <div v-for="(log, i) in logs" :key="i" class="log-item">
            <span class="log-time">{{ log.time }}</span>
            <span :class="['log-msg', log.type]">{{ log.msg }}</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import AppHeader from '@/components/AppHeader.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import ProgressBar from '@/components/ProgressBar.vue';
import type { SyncLogEntry, SyncStatusInfo } from '@/types';
import { formatBytes } from '@/utils/format-bytes';

const authStore = useAuthStore();

const syncStatus = ref<SyncStatusInfo | null>(null);

const progress = computed(() => syncStatus.value?.progress);
const isSyncing = computed(() => progress.value?.status === 'syncing');
const logs = ref<SyncLogEntry[]>([]);

let cleanupProgress: (() => void) | null = null;

const statusText = computed(() => {
  const s = syncStatus.value?.status;
  if (s === 'syncing') return '同步中';
  if (s === 'error') return '同步错误';
  if (s === 'paused') return '已暂停';
  return '空闲';
});

const badgeType = computed(() => {
  const s = syncStatus.value?.status;
  if (s === 'syncing') return 'syncing';
  if (s === 'error') return 'error';
  if (s === 'paused') return 'warning';
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

const cacheSizeText = computed(() => formatBytes(syncStatus.value?.localCacheSize || 0));

const phaseText = computed(() => {
  const p = progress.value?.phase;
  if (p === 'scan') return '扫描本地文件';
  if (p === 'diff') return '计算同步差异';
  if (p === 'delete') return '删除过期视频';
  if (p === 'download') return '下载视频';
  return '同步中';
});

const progressPercent = computed(() => {
  if (!progress.value || progress.value.total === 0) return 0;
  return Math.round((progress.value.current / progress.value.total) * 100);
});

function addLog(msg: string, type: SyncLogEntry['type'] = 'info') {
  const time = new Date().toLocaleTimeString('zh-CN');
  logs.value.unshift({ time, msg, type });
  if (logs.value.length > 50) logs.value.pop();
}

async function refreshStatus() {
  if (!window.electronAPI) return;
  try {
    syncStatus.value = await window.electronAPI.syncGetStatus();
  } catch (e) {
    console.error('Failed to get sync status:', e);
  }
}

async function startManualSync() {
  if (!window.electronAPI) return;
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

function setupListeners() {
  if (!window.electronAPI) return;

  cleanupProgress = window.electronAPI.onSyncProgress((data) => {
    if (syncStatus.value && data) {
      syncStatus.value = {
        ...syncStatus.value,
        status: data.status,
        progress: data,
      };
    }
    if (data.status === 'idle' && data.message === '同步完成') {
      addLog('同步完成', 'success');
      refreshStatus();
    }
    if (data.status === 'error') {
      addLog(data.message || '同步错误', 'error');
    }
  });
}

onMounted(() => {
  refreshStatus();
  setupListeners();
});

onUnmounted(() => {
  if (cleanupProgress) cleanupProgress();
});
</script>

<style scoped>
.sync-status-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
}

.sync-content {
  flex: 1;
  padding: var(--space-6);
  overflow-y: auto;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

.card {
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
  box-shadow: var(--shadow-md);
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) 0;
}

.status-row + .status-row {
  border-top: var(--border-subtle);
}

.label {
  font-size: 14px;
  color: var(--text-secondary);
}

.value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.progress-phase {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.progress-count {
  font-size: 13px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.progress-message {
  margin-top: var(--space-2);
  font-size: 13px;
  color: var(--text-secondary);
}

.progress-video {
  margin-top: var(--space-1);
  font-size: 12px;
  color: var(--text-tertiary);
}

.error-card {
  border-left: 4px solid var(--error);
}

.error-card p {
  color: var(--error);
  font-size: 14px;
  margin: 0;
}

.actions-card {
  display: flex;
  gap: var(--space-3);
}

.btn-sync {
  flex: 1;
  padding: var(--space-3) 0;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--text-inverse);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-default);
}

.btn-sync:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-sync:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-sync:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-subtle);
}

.btn-refresh {
  padding: var(--space-3) var(--space-5);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}

.btn-refresh:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}

.btn-refresh:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.log-card h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 var(--space-3);
}

.log-list {
  max-height: 200px;
  overflow-y: auto;
}

.log-item {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  font-size: 12px;
}

.log-time {
  color: var(--text-tertiary);
  white-space: nowrap;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.log-msg {
  color: var(--text-secondary);
}

.log-msg.error {
  color: var(--error);
}

.log-msg.success {
  color: var(--success);
}

.log-msg.info {
  color: var(--info);
}
</style>
