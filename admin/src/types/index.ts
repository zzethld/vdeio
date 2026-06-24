// Shared domain types for the admin SPA

export interface Video {
  id: number;
  title: string | null;
  description?: string | null;
  fileSize: number | null;
  encryptStatus: 'pending' | 'encrypting' | 'done' | 'failed';
  createdAt: string;
  resolution: string | null;
  categoryId?: number | null;
  accessMode: 'open' | 'campaign' | 'code';
  offlineAllowed: boolean;
  keyTtlHours: number;
}

export interface Store {
  id: number;
  name: string | null;
  code: string | null;
  region: string | null;
  address: string | null;
  status: number;
}

export interface Campaign {
  id: number;
  title: string | null;
  description: string | null;
  status: 'draft' | 'active' | 'ended' | 'archived';
  startTime: string;
  endTime: string;
  createdAt: string;
  videos?: Video[];
  stores?: Store[];
}

export interface AccessCode {
  id: number;
  code: string;
  storeId: number | null;
  storeName?: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  status: 'active' | 'disabled' | 'expired';
}

export interface Device {
  id: number;
  deviceId: string;
  storeId: number | null;
  deviceName: string | null;
  osVersion: string | null;
  appVersion: string | null;
  lastOnlineAt: string | null;
  status: 'online' | 'offline';
  localPaths: Record<string, string>;
  createdAt: string;
}
