import { describe, it, expect, beforeEach } from 'vitest';
import { mockElectronAPI } from './helpers/electron-mock';

describe('Client Test Infrastructure', () => {
  beforeEach(() => {
    mockElectronAPI();
  });

  it('should have jsdom environment', () => {
    expect(typeof window).toBe('object');
  });

  it('should have mocked electronAPI', () => {
    expect(window.electronAPI).toBeDefined();
    expect(typeof window.electronAPI.getDeviceId).toBe('function');
  });
});
