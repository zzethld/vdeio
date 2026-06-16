import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { mqttBridge, MqttCommandData } from '@/utils/mqtt';

describe('mqttBridge - connect', () => {
  let savedElectronAPI: unknown;

  beforeEach(() => {
    savedElectronAPI = (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).electronAPI = savedElectronAPI;
  });

  it('delegates connect to electronAPI.mqttConnect', async () => {
    const mockMqttConnect = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = {
      mqttConnect: mockMqttConnect,
      mqttDisconnect: vi.fn(),
      onMqttCommand: vi.fn(),
    };

    const result = await mqttBridge.connect('dev-1', 'token-abc');
    expect(mockMqttConnect).toHaveBeenCalledWith('dev-1', 'token-abc', undefined);
    expect(result).toEqual({ success: true });
  });

  it('passes brokerUrl to mqttConnect', async () => {
    const mockMqttConnect = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = {
      mqttConnect: mockMqttConnect,
      mqttDisconnect: vi.fn(),
      onMqttCommand: vi.fn(),
    };

    await mqttBridge.connect('dev-1', 'tok', 'wss://broker.example.com');
    expect(mockMqttConnect).toHaveBeenCalledWith('dev-1', 'tok', 'wss://broker.example.com');
  });

  it('returns error when electronAPI is missing', async () => {
    delete (window as any).electronAPI;
    const result = await mqttBridge.connect('dev-1', 'tok');
    expect(result).toEqual({ error: 'Electron API not available' });
  });

  it('returns error when mqttConnect is missing from electronAPI', async () => {
    (window as any).electronAPI = {};
    const result = await mqttBridge.connect('dev-1', 'tok');
    expect(result).toEqual({ error: 'Electron API not available' });
  });

  it('propagates connect error from electronAPI', async () => {
    (window as any).electronAPI = {
      mqttConnect: vi.fn().mockResolvedValue({ error: 'Connection refused' }),
    };

    const result = await mqttBridge.connect('dev-1', 'tok');
    expect(result).toEqual({ error: 'Connection refused' });
  });
});

describe('mqttBridge - disconnect', () => {
  let savedElectronAPI: unknown;

  beforeEach(() => {
    savedElectronAPI = (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).electronAPI = savedElectronAPI;
  });

  it('delegates disconnect to electronAPI.mqttDisconnect', async () => {
    const mockDisconnect = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = {
      mqttConnect: vi.fn(),
      mqttDisconnect: mockDisconnect,
      onMqttCommand: vi.fn(),
    };

    const result = await mqttBridge.disconnect();
    expect(mockDisconnect).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('returns error when electronAPI is missing on disconnect', async () => {
    delete (window as any).electronAPI;
    const result = await mqttBridge.disconnect();
    expect(result).toEqual({ error: 'Electron API not available' });
  });

  it('returns error when mqttDisconnect is missing from electronAPI', async () => {
    (window as any).electronAPI = { mqttConnect: vi.fn() };
    const result = await mqttBridge.disconnect();
    expect(result).toEqual({ error: 'Electron API not available' });
  });
});

describe('mqttBridge - onCommand', () => {
  let savedElectronAPI: unknown;

  beforeEach(() => {
    savedElectronAPI = (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).electronAPI = savedElectronAPI;
  });

  it('delegates onCommand to electronAPI.onMqttCommand', () => {
    const unsubscribe = vi.fn();
    const mockOnCommand = vi.fn().mockReturnValue(unsubscribe);
    (window as any).electronAPI = {
      mqttConnect: vi.fn(),
      mqttDisconnect: vi.fn(),
      onMqttCommand: mockOnCommand,
    };

    const handler = (data: MqttCommandData) => { data.command; };
    const result = mqttBridge.onCommand(handler);

    expect(mockOnCommand).toHaveBeenCalledWith(handler);
    expect(result).toBe(unsubscribe);
  });

  it('returns no-op unsubscribe when electronAPI is missing', () => {
    delete (window as any).electronAPI;
    const unsub = mqttBridge.onCommand(() => {});
    expect(typeof unsub).toBe('function');
    // Calling it should not throw
    expect(() => unsub()).not.toThrow();
  });

  it('returns no-op unsubscribe when onMqttCommand is missing', () => {
    (window as any).electronAPI = {};
    const unsub = mqttBridge.onCommand(() => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('unsubscribe function returned by electronAPI works correctly', () => {
    let capturedUnsub: (() => void) | undefined;
    const mockOnCommand = vi.fn().mockImplementation((cb: any) => {
      capturedUnsub = () => { /* cleanup */ };
      return capturedUnsub;
    });
    (window as any).electronAPI = {
      mqttConnect: vi.fn(),
      mqttDisconnect: vi.fn(),
      onMqttCommand: mockOnCommand,
    };

    const unsub = mqttBridge.onCommand(() => {});
    expect(unsub).toBe(capturedUnsub);
  });
});
