import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/router', () => {
  const push = vi.fn();
  return { default: { push } };
});

vi.mock('@/utils/request', () => {
  const post = vi.fn().mockResolvedValue({ data: {} });
  return { default: { get: vi.fn(), post } };
});

import { useDeviceStore } from '@/stores/device';

describe('useDeviceStore', () => {
  let savedElectronAPI: unknown;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    savedElectronAPI = (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).electronAPI = savedElectronAPI;
  });

  it('initializes with Electron API', async () => {
    (window as any).electronAPI = {
      getDeviceId: vi.fn().mockResolvedValue('electron-device-001'),
      getAppVersion: vi.fn().mockResolvedValue('2.1.0'),
      getStorePath: vi.fn().mockResolvedValue('C:\\Users\\test\\vdeio'),
    };

    const store = useDeviceStore();
    await store.initDevice();

    expect(store.deviceId).toBe('electron-device-001');
    expect(store.appVersion).toBe('2.1.0');
    expect(store.dataPath).toBe('C:\\Users\\test\\vdeio');
  });

  it('falls back to dev values when Electron API is unavailable', async () => {
    delete (window as any).electronAPI;

    const store = useDeviceStore();
    await store.initDevice();

    expect(store.deviceId).toBe('dev-device-browser');
    expect(store.appVersion).toBe('0.0.1-dev');
    expect(store.dataPath).toBe('/tmp/vdeio-cache');
  });

  it('handles Electron API errors gracefully', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as any).electronAPI = {
      getDeviceId: vi.fn().mockRejectedValue(new Error('IPC failed')),
      getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
      getStorePath: vi.fn().mockResolvedValue('/tmp/test'),
    };

    const store = useDeviceStore();
    await expect(store.initDevice()).resolves.not.toThrow();
    expect(store.deviceId).toBe('');

    consoleWarn.mockRestore();
  });

  it('starts with empty default values before init', () => {
    delete (window as any).electronAPI;

    const store = useDeviceStore();
    expect(store.deviceId).toBe('');
    expect(store.appVersion).toBe('');
    expect(store.dataPath).toBe('');
  });

  it('can call initDevice multiple times (idempotent)', async () => {
    delete (window as any).electronAPI;

    const store = useDeviceStore();
    await store.initDevice();
    await store.initDevice();
    expect(store.deviceId).toBe('dev-device-browser');
    expect(store.appVersion).toBe('0.0.1-dev');
  });

  it('Electron API calls are awaited in order', async () => {
    const callOrder: string[] = [];
    (window as any).electronAPI = {
      getDeviceId: vi.fn().mockImplementation(async () => {
        callOrder.push('getDeviceId');
        return 'dev-1';
      }),
      getAppVersion: vi.fn().mockImplementation(async () => {
        callOrder.push('getAppVersion');
        return '1.0.0';
      }),
      getStorePath: vi.fn().mockImplementation(async () => {
        callOrder.push('getStorePath');
        return '/data';
      }),
    };

    const store = useDeviceStore();
    await store.initDevice();

    expect(callOrder).toEqual(['getDeviceId', 'getAppVersion', 'getStorePath']);
  });
});
