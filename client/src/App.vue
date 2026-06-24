<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useDeviceStore } from '@/stores/device';
import { useAuthStore } from '@/stores/auth';
import { mqttBridge } from '@/utils/mqtt';

const deviceStore = useDeviceStore();
const authStore = useAuthStore();
let cleanupSyncVideoReady: (() => void) | null = null;
let cleanupSyncVideoDeleted: (() => void) | null = null;
let cleanupSyncNeedToken: (() => void) | null = null;
let cleanupSyncDiskWarning: (() => void) | null = null;
let cleanupMqttCommand: (() => void) | null = null;

// MQTT lifecycle: connect after login, disconnect on logout.
//deviceId + accessToken are both required; brokerUrl is left to the main
// process default (mqtt://localhost:1883) unless explicitly provided.
async function connectMqtt(deviceId: string, token: string): Promise<void> {
  try {
    const result = await mqttBridge.connect(deviceId, token);
    if (result && result.error) {
      console.warn('[App] MQTT connect returned error:', result.error);
    }
  } catch (err) {
    console.error('[App] MQTT connect failed:', err);
  }
}

function disconnectMqtt(): void {
  try {
    mqttBridge.disconnect().catch((err) => {
      console.error('[App] MQTT disconnect failed:', err);
    });
  } catch (err) {
    console.error('[App] MQTT disconnect threw:', err);
  }
}

// React to login/logout transitions.
watch(
  () => authStore.accessToken,
  (newToken, oldToken) => {
    const deviceId = deviceStore.deviceId;
    if (newToken && deviceId) {
      void connectMqtt(deviceId, newToken);
    } else if (oldToken && !newToken) {
      disconnectMqtt();
    }
  },
);

onMounted(async () => {
  await deviceStore.initDevice();

  // Listen for sync:video-ready IPC events and persist local paths
  if (window.electronAPI?.onSyncVideoReady) {
    cleanupSyncVideoReady = window.electronAPI.onSyncVideoReady((data) => {
      if (data.offlineAllowed !== false) {
        localStorage.setItem(`video:localPath:${data.videoId}`, data.localPath);
      }
    });
  }

  // Listen for sync:video-deleted IPC events and clean renderer storage
  if (window.electronAPI?.onSyncVideoDeleted) {
    cleanupSyncVideoDeleted = window.electronAPI.onSyncVideoDeleted((data) => {
      localStorage.removeItem(`video:localPath:${data.videoId}`);
      localStorage.removeItem(`video:key:${data.videoId}`);
    });
  }

  // Global sync:need-token handler — auto/MQTT sync requests the JWT here.
  // Registered at the App level so it stays active on every route, not just
  // SyncStatus.vue (previously auto-sync silently failed off that page).
  if (window.electronAPI?.onSyncNeedToken) {
    cleanupSyncNeedToken = window.electronAPI.onSyncNeedToken(() => {
      const token = authStore.accessToken;
      if (token && window.electronAPI) {
        window.electronAPI.syncProvideToken(token);
      }
    });
  }

  // sync:disk-warning — fired by SyncService when disk usage crosses 85%.
  // No toast library in the client (Element Plus is admin-only), so use the
  // native Notification API with a console.warn fallback. Stays at App level
  // so the warning surfaces regardless of which route is active.
  if (window.electronAPI?.onSyncDiskWarning) {
    cleanupSyncDiskWarning = window.electronAPI.onSyncDiskWarning((data) => {
      const pct = Math.round(data.usagePercent);
      const msg = `磁盘空间不足 ${pct}%，请清理缓存或扩展存储`;
      console.warn('[App] disk-warning:', msg);
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('存储空间警告', { body: msg });
        } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              new Notification('存储空间警告', { body: msg });
            }
          });
        }
      } catch {
        // Notification API may be unavailable in some Electron contexts; warn already logged.
      }
    });
  }

  // MQTT remote command dispatcher. The main process already handles the
  // heavy lifting (restart relaunches, clear-cache deletes files, sync
  // re-requests a token via sync:need-token). The renderer handler below
  // only does renderer-side cleanup/UX so we don't duplicate main work.
  cleanupMqttCommand = mqttBridge.onCommand((data) => {
    switch (data.command) {
      case 'restart':
        // Main process relaunches and exits; nothing useful to do here.
        console.log('[App] MQTT restart command received');
        break;
      case 'sync':
        // Main process already sends sync:need-token (handled above).
        console.log('[App] MQTT sync command received');
        break;
      case 'clear-cache': {
        // Main process already deleted files; clear renderer localStorage.
        console.log('[App] MQTT clear-cache command received');
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('video:localPath:') || key.startsWith('video:key:'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        break;
      }
      default:
        console.warn('[App] Unknown MQTT command:', data.command);
    }
  });

  // If the user was already logged in before mount (loaded from storage),
  // trigger the initial MQTT connect — the watch above only fires on changes.
  const existingToken = authStore.accessToken;
  const existingDeviceId = deviceStore.deviceId;
  if (existingToken && existingDeviceId) {
    void connectMqtt(existingDeviceId, existingToken);
  }

  // Best-effort disconnect if the renderer window unloads (reload/close).
  window.addEventListener('beforeunload', () => {
    disconnectMqtt();
  });
});

onUnmounted(() => {
  if (cleanupSyncVideoReady) {
    cleanupSyncVideoReady();
  }
  if (cleanupSyncVideoDeleted) {
    cleanupSyncVideoDeleted();
  }
  if (cleanupSyncNeedToken) {
    cleanupSyncNeedToken();
  }
  if (cleanupSyncDiskWarning) {
    cleanupSyncDiskWarning();
  }
  if (cleanupMqttCommand) {
    cleanupMqttCommand();
  }
  disconnectMqtt();
});
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  font-family: var(--font-sans);
  background: var(--bg-base);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
