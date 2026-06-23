<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useDeviceStore } from '@/stores/device';

const deviceStore = useDeviceStore();
let cleanupSyncVideoReady: (() => void) | null = null;
let cleanupSyncVideoDeleted: (() => void) | null = null;

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
});

onUnmounted(() => {
  if (cleanupSyncVideoReady) {
    cleanupSyncVideoReady();
  }
  if (cleanupSyncVideoDeleted) {
    cleanupSyncVideoDeleted();
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
  font-family: var(--font-sans);
  background: var(--bg-base);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
