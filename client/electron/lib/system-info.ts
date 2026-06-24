import * as os from 'os';
import { app } from 'electron';
import { getDirectorySize } from './fs-utils.js';
import { getDiskUsage } from './disk-utils.js';

// --- Types ---

export interface TelemetryPayload {
  deviceId: string;
  timestamp: string;
  cpu: number;
  memory: number;
  disk: number;
  diskFree: number;
  cacheSize: number;
  appVersion: string;
  uptime: number;
  network: 'online' | 'offline';
}

export interface DiskInfo {
  diskPercent: number;
  diskFreeGb: number;
  cacheSize: number;
}

export interface CollectTelemetryParams {
  deviceId: string;
  dataPath: string;
  videosDir: string;
  appStartTime: number;
  network: 'online' | 'offline';
}

// --- Pure collectors ---

/** Aggregated CPU busy percentage across all cores (0-100, 1 decimal). */
export function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += (cpu.times as Record<string, number>)[type];
    }
    totalIdle += cpu.times.idle;
  }

  if (totalTick === 0) return 0;
  return Math.round(((totalTick - totalIdle) / totalTick) * 100 * 10) / 10;
}

/** Used memory percentage of total (0-100, 1 decimal). */
export function getMemoryUsage(): number {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  if (totalMem === 0) return 0;
  return Math.round(((totalMem - freeMem) / totalMem) * 100 * 10) / 10;
}

/** Disk usage of the drive holding `dataPath` plus video cache size. */
export async function getDiskInfo(dataPath: string, videosDir: string): Promise<DiskInfo> {
  const diskUsage = await getDiskUsage(dataPath);
  return {
    diskPercent: Math.round(diskUsage.usagePercent * 10) / 10,
    diskFreeGb: Math.round((diskUsage.freeBytes / (1024 * 1024 * 1024)) * 10) / 10,
    cacheSize: getDirectorySize(videosDir),
  };
}

/** Assemble the full telemetry payload published to the broker. */
export async function collectTelemetry(params: CollectTelemetryParams): Promise<TelemetryPayload> {
  const disk = await getDiskInfo(params.dataPath, params.videosDir);
  return {
    deviceId: params.deviceId,
    timestamp: new Date().toISOString(),
    cpu: getCpuUsage(),
    memory: getMemoryUsage(),
    disk: disk.diskPercent,
    diskFree: disk.diskFreeGb,
    cacheSize: disk.cacheSize,
    appVersion: app.getVersion(),
    uptime: Math.floor((Date.now() - params.appStartTime) / 1000),
    network: params.network,
  };
}
