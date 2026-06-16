<template>
  <div class="sync-status-page">
    <header class="page-header">
      <div class="header-left">
        <button class="btn-back" @click="router.back()">← 返回</button>
        <h1>同步状态</h1>
      </div>
    </header>

    <main class="sync-content">
      <!-- Status Card -->
      <div class="status-card">
        <div class="status-row">
          <span class="label">当前状态</span>
          <span :class="['status-badge', statusClass]">{{ statusText }}</span>
        </div>
        <div class="status-row">
          <span class="label">上次同步</span>
          <span class="value">{{ lastSyncText }}</span>
        </div>
        <div class="status-row">
          <span class="label">本地缓存</span>
          <span class="value">{{ cacheSizeText }}（{{ syncStatus?.cachedVideoCount || 0 }} 个视频）</span>
        </div>
      </div>

      <!-- Progress Card -->
      <div v-if="progress && progress.status === 'syncing'" class="progress-card">
        <div class="progress-header">
          <span class="progress-phase">{{ phaseText }}</span>
          <span class="progress-count">{{ progress.current }} / {{ progress.total }}</span>
        </div>
        <div class="progress-bar-track">
          <div
            class="progress-bar-fill"
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>
        <div v-if="progress.message" class="progress-message">{{ progress.message }}</div>
        <div v-if="progress.videoTitle" class="progress-video">
          当前: {{ progress.videoTitle }}
        </div>
      </div>

      <!-- Error message -->
      <div v-if="progress && progress.status === 'error'" class="error-card">
        <p>{{ progress.message || '同步失败' }}</p>
      </div>

      <!-- Actions -->
      <div class="actions-card">
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
      <div v-if="logs.length > 0" class="log-card">
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
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

interface LogEntry {
  time: string;
  msg: string;
  type: 'info' | 'error' | 'success';
}

const router = useRouter();
const authStore = useAuthStore();

const syncStatus = ref<{
  status: string;
  lastSyncTime: string | null;
  localCacheSize: number;
  cachedVideoCount: number;
  progress?: {
    status: string;
    current: number;
    total: number;
    videoId?: number;
    videoTitle?: string;
    phase?: string;
    message?: string;
  };
} | null>(null);

const progress = computed(() => syncStatus.value?.progress);
const isSyncing = computed(() => progress.value?.status === 'syncing');
const logs = ref<LogEntry[]>([]);

let cleanupProgress: (() => void) | null = null;
let cleanupNeedToken: (() => void) | null = null;

const statusText = computed(() => {
  const s = syncStatus.value?.status;
  if (s === 'syncing') return '同步中';
  if (s === 'error') return '同步错误';
  if (s === 'paused') return '已暂停';
  return '空闲';
});

const statusClass = computed(() => {
  const s = syncStatus.value?.status;
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

const cacheSizeText = computed(() => {
  const size = syncStatus.value?.localCacheSize || 0;
  if (size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(size) / Math.log(k));
  return `${(size / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
});

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

function addLog(msg: string, type: LogEntry['type'] = 'info') {
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

  cleanupNeedToken = window.electronAPI.onSyncNeedToken(() => {
    const token = authStore.accessToken;
    if (token && window.electronAPI) {
      window.electronAPI.syncProvideToken(token);
    }
  });
}

onMounted(() => {
  refreshStatus();
  setupListeners();
});

onUnmounted(() => {
  if (cleanupProgress) cleanupProgress();
  if (cleanupNeedToken) cleanupNeedToken();
});
</script>

<style scoped>
.sync-status-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f6fa;
}

.page-header {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h1 {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a2e;
}

.btn-back {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #666;
  cursor: pointer;
  font-size: 13px;
}

.btn-back:hover {
  border-color: #0f3460;
  color: #0f3460;
}

.sync-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

.status-card,
.progress-card,
.actions-card,
.log-card,
.error-card {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.status-row + .status-row {
  border-top: 1px solid #f0f0f0;
}

.label {
  font-size: 14px;
  color: #666;
}

.value {
  font-size: 14px;
  color: #1a1a2e;
  font-weight: 500;
}

.status-badge {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 20px;
}

.status-badge.idle {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-badge.syncing {
  background: #e3f2fd;
  color: #1565c0;
}

.status-badge.error {
  background: #fce4ec;
  color: #c62828;
}

.status-badge.paused {
  background: #fff3e0;
  color: #e65100;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.progress-phase {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
}

.progress-count {
  font-size: 13px;
  color: #666;
}

.progress-bar-track {
  width: 100%;
  height: 8px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: #0f3460;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-message {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}

.progress-video {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}

.error-card {
  border-left: 4px solid #c62828;
}

.error-card p {
  color: #c62828;
  font-size: 14px;
  margin: 0;
}

.actions-card {
  display: flex;
  gap: 12px;
}

.btn-sync {
  flex: 1;
  padding: 10px 0;
  border: none;
  border-radius: 8px;
  background: #0f3460;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-sync:hover:not(:disabled) {
  background: #16213e;
}

.btn-sync:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-refresh {
  padding: 10px 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  color: #666;
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.btn-refresh:hover {
  border-color: #0f3460;
  color: #0f3460;
}

.log-card h3 {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 12px;
}

.log-list {
  max-height: 200px;
  overflow-y: auto;
}

.log-item {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.log-time {
  color: #999;
  white-space: nowrap;
}

.log-msg {
  color: #333;
}

.log-msg.error {
  color: #c62828;
}

.log-msg.success {
  color: #2e7d32;
}
</style>
