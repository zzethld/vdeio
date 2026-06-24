import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Device store — caches `deviceId`, `appVersion`, and `dataPath` sourced from
 * `window.electronAPI` (or browser dev fallbacks).
 *
 * @deprecated This store is not consumed by any production component. Components
 * read these values directly from `window.electronAPI` / localStorage. `initDevice`
 * is never invoked in production. Kept only for backward compatibility and tests.
 * May be removed in a future cleanup.
 */
export const useDeviceStore = defineStore('device', () => {
  /**
   * @deprecated Not read by any production component. The single source of truth
   * is `window.electronAPI.getDeviceId()`; localStorage key `vdeio:deviceId`
   * mirrors it for offline bootstrapping. May be removed in a future cleanup.
   */
  const deviceId = ref<string>('');
  /**
   * @deprecated Not read by any production component. Source of truth is
   * `window.electronAPI.getAppVersion()`. May be removed in a future cleanup.
   */
  const appVersion = ref<string>('');
  /**
   * @deprecated Not read by any production component. Source of truth is
   * `window.electronAPI.getStorePath()`. May be removed in a future cleanup.
   */
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
