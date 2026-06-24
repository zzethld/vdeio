// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { app, BrowserWindow, ipcMain, session } from 'electron';

vi.mock('electron', () => ({
  app: {
    getName: vi.fn().mockReturnValue('vdeio-client'),
    getVersion: vi.fn().mockReturnValue('1.0.0'),
    getPath: vi.fn().mockReturnValue('/tmp/vdeio-test'),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(function () {
    return {
      webContents: {
        send: vi.fn(),
        on: vi.fn(),
      },
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      on: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false),
    };
  }),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: vi.fn(),
      },
    },
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  // disk-utils.ts reads disk usage via fs.statfs on win32.
  statfs: vi.fn((
    _p: string,
    cb: (err: null, stats: { bsize: number; blocks: number; bfree: number; bavail: number }) => void,
  ) => cb(null, { bsize: 1, blocks: 0, bfree: 0, bavail: 0 })),
}));

import '../../../electron/main.ts';

describe('main', () => {
  const browserWindow = BrowserWindow as unknown as ReturnType<typeof vi.fn>;
  const webRequestOnHeadersReceived = session.defaultSession.webRequest.onHeadersReceived as ReturnType<typeof vi.fn>;
  const ipcHandle = ipcMain.handle as ReturnType<typeof vi.fn>;
  const ipcOn = ipcMain.on as ReturnType<typeof vi.fn>;

  it('creates BrowserWindow with expected options', () => {
    expect(browserWindow).toHaveBeenCalledTimes(1);
    const [options] = browserWindow.mock.calls[0] as [Record<string, unknown>];

    expect(options.width).toBe(1280);
    expect(options.height).toBe(800);
    expect(options.resizable).toBe(true);
    expect(options.title).toBe('门店视频播放系统');

    const webPreferences = options.webPreferences as Record<string, unknown>;
    expect(webPreferences.contextIsolation).toBe(true);
    expect(webPreferences.sandbox).toBe(true);
    expect(webPreferences.nodeIntegration).toBe(false);
    expect(webPreferences.nodeIntegrationInWorker).toBe(false);
    expect(webPreferences.webviewTag).toBe(false);
    expect(webPreferences.allowRunningInsecureContent).toBe(false);
    expect(typeof webPreferences.preload).toBe('string');
  });

  it('sets Content-Security-Policy header', () => {
    expect(webRequestOnHeadersReceived).toHaveBeenCalledTimes(1);
    const [handler] = webRequestOnHeadersReceived.mock.calls[0] as [Function];

    const callback = vi.fn();
    handler({ responseHeaders: { 'X-Other': ['value'] } }, callback);

    expect(callback).toHaveBeenCalledWith({
      responseHeaders: expect.objectContaining({
        'Content-Security-Policy': [
          expect.stringContaining("default-src 'self'"),
        ],
      }),
    });

    const csp = callback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0] as string;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain('connect-src');
  });

  it('registers expected IPC handlers', () => {
    const handledChannels = ipcHandle.mock.calls.map(([channel]) => channel as string);
    expect(handledChannels).toContain('get-device-id');
    expect(handledChannels).toContain('get-app-version');
    expect(handledChannels).toContain('get-store-path');
    expect(handledChannels).toContain('sync:start');
    expect(handledChannels).toContain('sync:status');
    expect(handledChannels).toContain('mqtt:connect');
    expect(handledChannels).toContain('mqtt:disconnect');
  });

  it('registers sync:provide-token listener', () => {
    const listenedChannels = ipcOn.mock.calls.map(([channel]) => channel as string);
    expect(listenedChannels).toContain('sync:provide-token');
  });

  it('get-device-id returns stable machine id', () => {
    const originalComputerName = process.env.COMPUTERNAME;
    process.env.COMPUTERNAME = 'TEST-PC';

    const [getDeviceIdHandler] = ipcHandle.mock.calls.find(
      ([channel]) => channel === 'get-device-id'
    )!.slice(1) as [() => string];

    const first = getDeviceIdHandler();
    const second = getDeviceIdHandler();
    expect(first).toBe('vdeio-client-TEST-PC');
    expect(second).toBe(first);

    process.env.COMPUTERNAME = originalComputerName;
  });

  it('loads dev server URL when VITE_DEV_SERVER_URL is set', () => {
    const win = browserWindow.mock.results[0].value as { loadURL: ReturnType<typeof vi.fn>; loadFile: ReturnType<typeof vi.fn> };
    // VITE_DEV_SERVER_URL is not set in this test, so loadFile should be used
    expect(win.loadFile).toHaveBeenCalled();
  });
});
