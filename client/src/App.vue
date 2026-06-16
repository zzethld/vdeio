<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useDeviceStore } from '@/stores/device';

const deviceStore = useDeviceStore();
let cleanupSyncVideoReady: (() => void) | null = null;

onMounted(async () => {
  await deviceStore.initDevice();

  // Listen for sync:video-ready IPC events and persist local paths
  if (window.electronAPI?.onSyncVideoReady) {
    cleanupSyncVideoReady = window.electronAPI.onSyncVideoReady((data) => {
      localStorage.setItem(`video:localPath:${data.videoId}`, data.localPath);
    });
  }
});

onUnmounted(() => {
  if (cleanupSyncVideoReady) {
    cleanupSyncVideoReady();
  }
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
