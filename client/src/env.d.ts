/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface SyncProgressInfo {
  status: 'idle' | 'syncing' | 'error' | 'paused';
  current: number;
  total: number;
  videoId?: number;
  videoTitle?: string;
  phase?: 'scan' | 'diff' | 'delete' | 'download';
  message?: string;
}

interface SyncStatusResult {
  status: string;
  lastSyncTime: string | null;
  localCacheSize: number;
  cachedVideoCount: number;
  progress?: SyncProgressInfo;
}

interface Window {
  electronAPI?: {
    getDeviceId: () => Promise<string>;
    getAppVersion: () => Promise<string>;
    getStorePath: () => Promise<string>;
    syncStart: (accessToken: string) => Promise<{ success?: boolean; error?: string }>;
    syncGetStatus: () => Promise<SyncStatusResult>;
    syncProvideToken: (accessToken: string) => void;
    onSyncProgress: (callback: (progress: SyncProgressInfo) => void) => () => void;
    onSyncVideoReady: (callback: (data: { videoId: number; localPath: string; offlineAllowed?: boolean }) => void) => () => void;
    onSyncVideoDeleted: (callback: (data: { videoId: number }) => void) => () => void;
    onSyncNeedToken: (callback: () => void) => () => void;
    mqttConnect: (deviceId: string, token: string, brokerUrl?: string) => Promise<{ success?: boolean; error?: string }>;
    mqttDisconnect: () => Promise<{ success?: boolean; error?: string }>;
    onMqttCommand: (callback: (data: { command: string; payload?: Record<string, unknown> }) => void) => () => void;
  };
}
