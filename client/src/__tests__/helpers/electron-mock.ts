import { vi } from 'vitest';

// Mock window.electronAPI for testing Electron renderer code
export function mockElectronAPI(overrides: Record<string, unknown> = {}) {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      getDeviceId: vi.fn().mockResolvedValue('test-device-id'),
      getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
      getStorePath: vi.fn().mockResolvedValue('/tmp/vdeio-test'),
      onSyncProgress: vi.fn(),
      ...overrides,
    },
    writable: true,
    configurable: true,
  });
}
