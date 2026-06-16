import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useDeviceStore = defineStore('device', () => {
  const deviceId = ref<string>('');
  const appVersion = ref<string>('');
  const dataPath = ref<string>('');

  async function initDevice() {
    // In Electron, use the exposed APIs
    if (window.electronAPI) {
      try {
        deviceId.value = await window.electronAPI.getDeviceId();
        appVersion.value = await window.electronAPI.getAppVersion();
        dataPath.value = await window.electronAPI.getStorePath();
      } catch (e) {
        console.warn('[DeviceStore] Failed to init from electronAPI:', e);
      }
    } else {
      // Browser fallback for dev mode
      deviceId.value = 'dev-device-browser';
      appVersion.value = '0.0.1-dev';
      dataPath.value = '/tmp/vdeio-cache';
    }
  }

  return {
    deviceId,
    appVersion,
    dataPath,
    initDevice,
  };
});
