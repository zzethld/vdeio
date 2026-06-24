// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the mock objects exist before the hoisted vi.mock factory runs.
const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mocks.invoke,
    send: mocks.send,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}));

import '../../../electron/preload';

// Capture the exposed API object right after import (before any clearAllMocks)
const exposedCalls = () => mocks.exposeInMainWorld.mock.calls;
const getApi = (): Record<string, (...args: unknown[]) => unknown> => {
  const [, api] = exposedCalls()[0] as [string, Record<string, (...args: unknown[]) => unknown>];
  return api;
};

describe('preload', () => {
  beforeEach(() => {
    // Only clear invoke/send/on/removeListener so we don't lose the import-time exposeInMainWorld call
    mocks.invoke.mockClear();
    mocks.send.mockClear();
    mocks.on.mockClear();
    mocks.removeListener.mockClear();
  });

  it('exposes electronAPI on the main world', () => {
    expect(mocks.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(mocks.exposeInMainWorld).toHaveBeenCalledWith('electronAPI', expect.any(Object));
  });

  it('exposes expected API shape', () => {
    const api = getApi();

    expect(typeof api.getDeviceId).toBe('function');
    expect(typeof api.getAppVersion).toBe('function');
    expect(typeof api.getStorePath).toBe('function');

    expect(typeof api.syncStart).toBe('function');
    expect(typeof api.syncGetStatus).toBe('function');
    expect(typeof api.syncProvideToken).toBe('function');

    expect(typeof api.onSyncProgress).toBe('function');
    expect(typeof api.onSyncVideoReady).toBe('function');
    expect(typeof api.onSyncNeedToken).toBe('function');

    expect(typeof api.mqttConnect).toBe('function');
    expect(typeof api.mqttDisconnect).toBe('function');
    expect(typeof api.onMqttCommand).toBe('function');
  });

  it('getDeviceId invokes get-device-id channel', async () => {
    const api = getApi();
    mocks.invoke.mockResolvedValue('device-1');

    const result = await api.getDeviceId();
    expect(mocks.invoke).toHaveBeenCalledWith('get-device-id');
    expect(result).toBe('device-1');
  });

  it('syncStart invokes sync:start with token', async () => {
    const api = getApi();
    mocks.invoke.mockResolvedValue({ success: true });

    const result = await api.syncStart('token-abc');
    expect(mocks.invoke).toHaveBeenCalledWith('sync:start', 'token-abc');
    expect(result).toEqual({ success: true });
  });

  it('syncProvideToken sends sync:provide-token', () => {
    const api = getApi();

    api.syncProvideToken('token-abc');
    expect(mocks.send).toHaveBeenCalledWith('sync:provide-token', 'token-abc');
  });

  it('mqttConnect invokes mqtt:connect with optional brokerUrl', async () => {
    const api = getApi();
    mocks.invoke.mockResolvedValue({ success: true });

    const result = await api.mqttConnect('dev-1', 'tok-1', 'wss://broker.example.com');
    expect(mocks.invoke).toHaveBeenCalledWith('mqtt:connect', 'dev-1', 'tok-1', 'wss://broker.example.com');
    expect(result).toEqual({ success: true });
  });

  it('onSyncProgress registers and returns unsubscribe', () => {
    const api = getApi();
    const handler = vi.fn();

    const unsubscribe = api.onSyncProgress(handler);
    expect(mocks.on).toHaveBeenCalledWith('sync:progress', expect.any(Function));
    expect(typeof unsubscribe).toBe('function');

    unsubscribe();
    expect(mocks.removeListener).toHaveBeenCalledWith('sync:progress', expect.any(Function));
  });
});
