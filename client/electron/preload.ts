import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  getDeviceId: (): Promise<string> => ipcRenderer.invoke('get-device-id'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  getStorePath: (): Promise<string> => ipcRenderer.invoke('get-store-path'),

  // Sync APIs
  syncStart: (accessToken: string): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('sync:start', accessToken),
  syncGetStatus: (): Promise<{
    status: string;
    lastSyncTime: string | null;
    localCacheSize: number;
    cachedVideoCount: number;
    progress?: {
      status: string;
      current: number;
      total: number;
      videoId?: number;
      videoTitle?: string;
      phase?: string;
      message?: string;
    };
  }> => ipcRenderer.invoke('sync:status'),

  // Send access token to main process for auto-sync
  syncProvideToken: (accessToken: string): void => {
    ipcRenderer.send('sync:provide-token', accessToken);
  },

  // Event listeners
  onSyncProgress: (callback: (progress: unknown) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
      callback(data);
    };
    ipcRenderer.on('sync-progress', handler);
    return () => {
      ipcRenderer.removeListener('sync-progress', handler);
    };
  },

  onSyncVideoReady: (callback: (data: { videoId: number; localPath: string; offlineAllowed?: boolean }) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, data: { videoId: number; localPath: string; offlineAllowed?: boolean }) => {
      callback(data);
    };
    ipcRenderer.on('sync:video-ready', handler);
    return () => {
      ipcRenderer.removeListener('sync:video-ready', handler);
    };
  },

  onSyncVideoDeleted: (callback: (data: { videoId: number }) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, data: { videoId: number }) => {
      callback(data);
    };
    ipcRenderer.on('sync:video-deleted', handler);
    return () => {
      ipcRenderer.removeListener('sync:video-deleted', handler);
    };
  },

  onSyncNeedToken: (callback: () => void): () => void => {
    const handler = () => {
      callback();
    };
    ipcRenderer.on('sync:need-token', handler);
    return () => {
      ipcRenderer.removeListener('sync:need-token', handler);
    };
  },

  // MQTT APIs
  mqttConnect: (deviceId: string, token: string, brokerUrl?: string): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('mqtt:connect', deviceId, token, brokerUrl),
  mqttDisconnect: (): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('mqtt:disconnect'),
  onMqttCommand: (callback: (data: { command: string; payload?: Record<string, unknown> }) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, data: { command: string; payload?: Record<string, unknown> }) => {
      callback(data);
    };
    ipcRenderer.on('mqtt:command', handler);
    return () => {
      ipcRenderer.removeListener('mqtt:command', handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
