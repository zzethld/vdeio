// Shared type definitions used by both the renderer process (src/) and the Electron main process (electron/).

export interface SyncProgressInfo {
  status: 'idle' | 'syncing' | 'error' | 'paused';
  current: number;
  total: number;
  videoId?: number;
  videoTitle?: string;
  phase?: 'scan' | 'diff' | 'delete' | 'download';
  message?: string;
}

export interface SyncStatusInfo {
  status: 'idle' | 'syncing' | 'error' | 'paused';
  lastSyncTime: string | null;
  localCacheSize: number;
  cachedVideoCount: number;
  progress?: SyncProgressInfo;
}

export interface SyncLogEntry {
  time: string;
  msg: string;
  type: 'info' | 'error' | 'success';
}

export interface DeviceInfo {
  deviceId: string;
  appVersion: string;
  dataPath: string;
}
