import { contextBridge, ipcRenderer } from 'electron';
import type { SyncProgressInfo, SyncStatusInfo } from '../src/types';

const electronAPI = {
  getDeviceId: (): Promise<string> => ipcRenderer.invoke('get-device-id'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  getStorePath: (): Promise<string> => ipcRenderer.invoke('get-store-path'),

  // Sync APIs
  syncStart: (accessToken: string): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('sync:start', accessToken),
  syncGetStatus: (): Promise<SyncStatusInfo> => ipcRenderer.invoke('sync:status'),

  // Send access token to main process for auto-sync
  syncProvideToken: (accessToken: string): void => {
    ipcRenderer.send('sync:provide-token', accessToken);
  },

  // Event listeners
  onSyncProgress: (callback: (progress: SyncProgressInfo) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, data: SyncProgressInfo) => {
      callback(data);
    };
    ipcRenderer.on('sync:progress', handler);
    return () => {
      ipcRenderer.removeListener('sync:progress', handler);
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

  // Disk-usage warning — fired by SyncService.checkDiskSpace when usage
  // crosses the 85% warning threshold (see electron/sync-service.ts). Payload
  // mirrors what the main process sends: { usagePercent: number }.
  onSyncDiskWarning: (callback: (data: { usagePercent: number }) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, data: { usagePercent: number }) => {
      callback(data);
    };
    ipcRenderer.on('sync:disk-warning', handler);
    return () => {
      ipcRenderer.removeListener('sync:disk-warning', handler);
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
