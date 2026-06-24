import {
  app,
  BrowserWindow,
  ipcMain,
  session,
} from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SyncService } from './sync-service.js';
import { MqttBridge } from './mqtt-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let syncService: SyncService | null = null;
let mqttBridge: MqttBridge | null = null;

// --- macOS reactivation reconnect state ---
//
// On macOS the app stays alive in the dock after all windows close. We record
// whether MQTT was connected so that, on `activate`, we can transparently
// reconnect using the same device credentials the renderer previously supplied.
//
// `lastMqttCredentials` is held in main-process closure only and is NEVER
// forwarded to the renderer (no IPC channel reads it), so device tokens do not
// leak across the trust boundary.
let mqttWasConnectedOnClose = false;
let lastMqttCredentials: {
  deviceId: string;
  deviceToken: string;
  brokerUrl?: string;
} | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    resizable: true,
    title: '门店视频播放系统',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  });

  // Security: Set Content-Security-Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: https:; " +
          "media-src 'self' https: blob:; " +
          "connect-src 'self' https: wss: ws:; " +
          "font-src 'self';",
        ],
      },
    });
  });

  // Disable navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize sync service with this window
  if (syncService) {
    syncService.setMainWindow(mainWindow);
  }

  // Initialize MQTT bridge with this window
  if (mqttBridge) {
    mqttBridge.setMainWindow(mainWindow);
  }
}

// IPC Handlers
function registerIpcHandlers(): void {
  ipcMain.handle('get-device-id', () => {
    // Generate a stable device ID based on machine info
    // In production, this would use a persistent stored ID
    const machineId = `${app.getName()}-${process.env.COMPUTERNAME || 'unknown'}`;
    return machineId;
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-store-path', () => {
    return app.getPath('userData');
  });

  // Sync IPC handlers
  ipcMain.handle('sync:start', async (_event, accessToken: string) => {
    if (!syncService) return { error: 'SyncService not initialized' };
    try {
      await syncService.startSync(accessToken);
      return { success: true };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  ipcMain.handle('sync:status', () => {
    if (!syncService) return { error: 'SyncService not initialized' };
    return syncService.getStatus();
  });

  // Listen for token from renderer (needed for auto-sync)
  ipcMain.on('sync:provide-token', (_event, accessToken: string) => {
    if (syncService) {
      syncService.startSync(accessToken).catch((err) => {
        console.error('[Main] Auto-sync failed:', err);
      });
    }
  });

  // MQTT IPC handlers
  ipcMain.handle('mqtt:connect', (_event, deviceId: string, deviceToken: string, brokerUrl?: string) => {
    if (!mqttBridge) return { error: 'MqttBridge not initialized' };
    try {
      mqttBridge.connect(deviceId, deviceToken, brokerUrl);
      // Cache credentials in main-process closure so the macOS `activate`
      // handler can reconnect after window-all-closed. Never exposed to the
      // renderer (no IPC reads this back).
      lastMqttCredentials = { deviceId, deviceToken, brokerUrl };
      return { success: true };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  ipcMain.handle('mqtt:disconnect', () => {
    if (!mqttBridge) return { error: 'MqttBridge not initialized' };
    mqttBridge.disconnect();
    // Explicit renderer-initiated disconnect clears cached credentials and
    // the reconnect flag, so macOS `activate` will not silently re-establish a
    // connection the user intentionally closed.
    lastMqttCredentials = null;
    mqttWasConnectedOnClose = false;
    return { success: true };
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Initialize sync service
  const dataPath = app.getPath('userData');
  syncService = new SyncService(dataPath);
  syncService.startAutoSync(4 * 60 * 60 * 1000); // 4 hours

  // Initialize MQTT bridge
  mqttBridge = new MqttBridge({
    dataPath,
    mainWindow: null,
    onCommand: (cmd) => {
      if (cmd.command === 'sync' && syncService) {
        // Request token from renderer to trigger sync
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync:need-token', { reason: 'mqtt-command' });
        }
      }
    },
  });

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
    // macOS: if MQTT was connected when the last window closed and is
    // currently disconnected, transparently reconnect with the cached
    // device credentials. This is a no-op on Windows/Linux because
    // `mqttWasConnectedOnClose` is only ever set on the darwin
    // `window-all-closed` path.
    if (
      process.platform === 'darwin' &&
      mqttWasConnectedOnClose &&
      mqttBridge &&
      !mqttBridge.isConnected() &&
      lastMqttCredentials
    ) {
      try {
        mqttBridge.connect(
          lastMqttCredentials.deviceId,
          lastMqttCredentials.deviceToken,
          lastMqttCredentials.brokerUrl,
        );
      } catch (err) {
        console.error('[Main] MQTT reconnect on activate failed:', (err as Error).message);
      }
      mqttWasConnectedOnClose = false;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    // macOS: keep the app alive in the dock. Record the MQTT connection state
    // (before disconnecting) so the `activate` handler can restore it, and
    // tear down the live MQTT socket while no window is present.
    if (mqttBridge) {
      mqttWasConnectedOnClose = mqttBridge.isConnected();
      mqttBridge.disconnect();
    }
    return;
  }
  // Windows / Linux: tear everything down and quit.
  if (syncService) {
    syncService.stopAutoSync();
  }
  if (mqttBridge) {
    mqttBridge.disconnect();
  }
  app.quit();
});
