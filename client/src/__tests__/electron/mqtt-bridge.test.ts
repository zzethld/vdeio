// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as mqtt from 'mqtt';
import * as fs from 'fs';
import { app } from 'electron';

vi.mock('mqtt', () => {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const client = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      handlers[event] = handler;
    }),
    publish: vi.fn(),
    subscribe: vi.fn(),
    end: vi.fn(),
  };
  return {
    connect: vi.fn().mockReturnValue(client),
    __handlers: handlers,
    __client: client,
  };
});

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn().mockReturnValue('1.0.0'),
    relaunch: vi.fn(),
    exit: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('os', () => ({
  cpus: vi.fn().mockReturnValue([
    { times: { user: 100, sys: 50, idle: 150, nice: 0, irq: 0 } },
  ]),
  totalmem: vi.fn().mockReturnValue(16 * 1024 * 1024 * 1024),
  freemem: vi.fn().mockReturnValue(8 * 1024 * 1024 * 1024),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
  rmSync: vi.fn(),
  // disk-utils.ts reads disk usage via fs.statfs on win32.
  statfs: vi.fn((
    _p: string,
    cb: (err: null, stats: { bsize: number; blocks: number; bfree: number; bavail: number }) => void,
  ) => cb(null, { bsize: 1, blocks: 100000000000, bfree: 8000000000, bavail: 8000000000 })),
}));

vi.mock('path', () => ({
  join: vi.fn((...parts: string[]) => parts.join('/')),
  parse: vi.fn(() => ({ root: '/' })),
}));

vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, _opts: unknown, callback: (err: null, result: { stdout: string }) => void) => {
    callback(null, { stdout: 'FreeSpace=8000000000\nSize=100000000000\n' });
  }),
}));

import { MqttBridge } from '../../../electron/mqtt-bridge.ts';

describe('MqttBridge', () => {
  const connect = mqtt.connect as unknown as ReturnType<typeof vi.fn>;
  const handlers = (mqtt as unknown as { __handlers: Record<string, (...args: unknown[]) => unknown> }).__handlers;
  const client = (mqtt as unknown as { __client: {
    on: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  } }).__client;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connect uses correct options including will', () => {
    const bridge = new MqttBridge({ dataPath: '/data/vdeio', mainWindow: null });
    bridge.connect('device-1', 'token-abc');

    expect(connect).toHaveBeenCalledTimes(1);
    const [url, options] = connect.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('mqtt://localhost:1883');
    expect(options.clientId).toBe('vdeio-device-device-1');
    expect(options.username).toBe('device-1');
    expect(options.password).toBe('token-abc');
    expect(options.clean).toBe(true);
    expect(options.reconnectPeriod).toBe(5000);
    expect(options.keepalive).toBe(60);

    const will = options.will as Record<string, unknown>;
    expect(will.topic).toBe('vdeio/device/device-1/status');
    const willPayload = JSON.parse(will.payload as string);
    expect(willPayload.status).toBe('offline');
    expect(willPayload.deviceId).toBe('device-1');
    expect(will.qos).toBe(1);
    expect(will.retain).toBe(true);
  });

  it('publishes online status and subscribes to commands on connect', () => {
    const bridge = new MqttBridge({ dataPath: '/data/vdeio', mainWindow: null });
    bridge.connect('device-1', 'token-abc');

    handlers.connect();

    expect(client.publish).toHaveBeenCalledWith(
      'vdeio/device/device-1/status',
      expect.stringContaining('"status":"online"'),
      { qos: 1, retain: true },
    );
    expect(client.subscribe).toHaveBeenCalledWith(
      'vdeio/device/device-1/command',
      { qos: 1 },
      expect.any(Function),
    );
    expect(bridge.isConnected()).toBe(true);
  });

  it('handles restart command', () => {
    const bridge = new MqttBridge({ dataPath: '/data/vdeio', mainWindow: null });
    bridge.connect('device-1', 'token-abc');
    handlers.connect();

    handlers.message('vdeio/device/device-1/command', Buffer.from(JSON.stringify({ command: 'restart' })));

    expect(app.relaunch).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);
  });

  it('handles sync command by notifying renderer', () => {
    const send = vi.fn();
    const mainWindow = {
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as import('electron').BrowserWindow;

    const bridge = new MqttBridge({ dataPath: '/data/vdeio', mainWindow });
    bridge.connect('device-1', 'token-abc');
    handlers.connect();

    handlers.message('vdeio/device/device-1/command', Buffer.from(JSON.stringify({ command: 'sync' })));

    expect(send).toHaveBeenCalledWith('mqtt:command', { command: 'sync' });
  });

  it('handles clear-cache command', () => {
    const send = vi.fn();
    const mainWindow = {
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as import('electron').BrowserWindow;

    vi.mocked(fs).existsSync.mockReturnValue(true);
    vi.mocked(fs).readdirSync.mockReturnValue([
      { name: '1', isDirectory: () => true, isFile: () => false } as unknown as fs.Dirent,
    ]);

    const bridge = new MqttBridge({ dataPath: '/data/vdeio', mainWindow });
    bridge.connect('device-1', 'token-abc');
    handlers.connect();

    handlers.message('vdeio/device/device-1/command', Buffer.from(JSON.stringify({ command: 'clear-cache' })));

    expect(fs.rmSync).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('mqtt:command', { command: 'clear-cache' });
  });

  it('queues telemetry when offline and flushes on reconnect', async () => {
    const bridge = new MqttBridge({ dataPath: '/data/vdeio', mainWindow: null });
    bridge.connect('device-1', 'token-abc');

    // Simulate going offline before telemetry interval fires
    handlers.offline();
    expect(bridge.isConnected()).toBe(false);

    // Manually trigger telemetry report while offline
    await (bridge as unknown as { reportTelemetry: () => Promise<void> }).reportTelemetry();

    // Nothing should be published while offline
    expect(client.publish).not.toHaveBeenCalledWith(
      'vdeio/device/device-1/telemetry',
      expect.any(String),
      { qos: 1 },
    );

    // Reconnect should flush queued telemetry
    handlers.connect();
    expect(client.publish).toHaveBeenCalledWith(
      'vdeio/device/device-1/telemetry',
      expect.any(String),
      { qos: 1 },
      expect.any(Function),
    );
  });

  it('publishes offline status on disconnect', () => {
    const bridge = new MqttBridge({ dataPath: '/data/vdeio', mainWindow: null });
    bridge.connect('device-1', 'token-abc');
    handlers.connect();

    bridge.disconnect();

    expect(client.publish).toHaveBeenCalledWith(
      'vdeio/device/device-1/status',
      expect.stringContaining('"status":"offline"'),
      { qos: 1, retain: true },
    );
    expect(client.end).toHaveBeenCalled();
    expect(bridge.isConnected()).toBe(false);
  });
});
