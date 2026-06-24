import * as fs from 'fs';
import type { BrowserWindow } from 'electron';
import type { SyncProgressInfo, SyncStatusInfo } from '../src/types';
import { getVideosDir } from './lib/app-paths.js';
import { type VideoDownload, type SyncDiff } from './lib/diff.js';
import { httpRequest } from './lib/http.js';
import {
  scanLocalVideoIds,
  deleteLocalVideoDir,
  calculateCacheSize,
  downloadEncryptedVideo,
} from './lib/video-cache.js';
import { checkDiskAndEvict } from './lib/disk.js';

// Re-export pure functions and types so existing callers/tests importing from
// `electron/sync-service` keep working. Implementations now live in ./lib/diff.js.
export { calculateDiff, parseM3U8, createLocalM3U8, extractIv } from './lib/diff.js';
export type { SyncDiff, VideoDownload, VideoDelete } from './lib/diff.js';

export class SyncService {
  private mainWindow: BrowserWindow | null = null;
  private dataPath: string;
  private videosDir: string;
  private serverBaseURL: string;
  private progress: SyncProgressInfo = { status: 'idle', current: 0, total: 0 };
  private lastSyncTime: string | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  constructor(dataPath: string, serverBaseURL?: string) {
    this.dataPath = dataPath;
    this.videosDir = getVideosDir(dataPath);
    this.serverBaseURL = serverBaseURL || process.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
    // Ensure videos directory exists
    if (!fs.existsSync(this.videosDir)) {
      fs.mkdirSync(this.videosDir, { recursive: true });
    }
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  startAutoSync(intervalMs = 4 * 60 * 60 * 1000): void {
    this.stopAutoSync();
    this.syncTimer = setInterval(() => {
      this.triggerAutoSync();
    }, intervalMs);
  }

  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private triggerAutoSync(): void {
    // Request access token from renderer
    this.sendToRenderer('sync:need-token', { reason: 'auto-sync' });
  }

  async startSync(accessToken: string): Promise<void> {
    if (this.syncing) {
      this.sendProgress({ status: 'syncing', current: 0, total: 0, message: '同步正在进行中' });
      return;
    }
    this.syncing = true;
    try {
      // Phase 1: Scan local cache
      this.sendProgress({ status: 'syncing', current: 0, total: 0, phase: 'scan', message: '扫描本地缓存...' });
      const cachedVideoIds = this.scanLocalVideos();

      // Phase 2: Get diff from server
      this.sendProgress({ status: 'syncing', current: 0, total: 0, phase: 'diff', message: '获取同步差异...' });
      const diff = await this.fetchSyncDiff(accessToken, cachedVideoIds);

      this.sendProgress({
        status: 'syncing',
        current: 0,
        total: diff.downloads.length + diff.deletes.length,
        phase: 'diff',
        message: `需要下载 ${diff.downloads.length} 个，删除 ${diff.deletes.length} 个`,
      });

      // Phase 3: Delete expired videos
      if (diff.deletes.length > 0) {
        this.sendProgress({ status: 'syncing', current: 0, total: diff.downloads.length + diff.deletes.length, phase: 'delete', message: '删除过期视频...' });
        for (let i = 0; i < diff.deletes.length; i++) {
          const del = diff.deletes[i];
          this.deleteLocalVideo(del.videoId);
          this.sendProgress({
            status: 'syncing',
            current: i + 1,
            total: diff.downloads.length + diff.deletes.length,
            videoId: del.videoId,
            phase: 'delete',
          });
        }
      }

      // Phase 3b: Purge local copies that the server now marks as online-only.
      // Note: videos that dropped out of the active campaign are already handled
      // in Phase 3. This pass catches the edge case where a download entry still
      // references a local copy but its policy switched to online-only.
      for (const id of this.scanLocalVideos()) {
        const meta = diff.downloads.find((d) => d.videoId === id);
        if (meta && meta.offlineAllowed === false) {
          this.deleteLocalVideo(id);
        }
      }

      // Phase 4: Download new videos
      if (diff.downloads.length > 0) {
        // Check disk space before downloading
        const diskOk = await this.checkDiskSpace(diff.downloads);
        if (!diskOk) {
          this.sendProgress({ status: 'paused', current: 0, total: 0, message: '磁盘空间不足，已暂停下载' });
          this.syncing = false;
          return;
        }

        for (let i = 0; i < diff.downloads.length; i++) {
          const video = diff.downloads[i];
          try {
            this.sendProgress({
              status: 'syncing',
              current: diff.deletes.length + i,
              total: diff.downloads.length + diff.deletes.length,
              videoId: video.videoId,
              videoTitle: video.title,
              phase: 'download',
              message: `下载: ${video.title}`,
            });
            await this.downloadVideo(accessToken, video);
          } catch (err) {
            console.error(`[SyncService] Failed to download video ${video.videoId}:`, err);
            // Continue with next video
          }
        }
      }

      this.lastSyncTime = new Date().toISOString();
      this.sendProgress({ status: 'idle', current: 0, total: 0, message: '同步完成' });
    } catch (err) {
      console.error('[SyncService] Sync failed:', err);
      this.sendProgress({ status: 'error', current: 0, total: 0, message: `同步失败: ${(err as Error).message}` });
    } finally {
      this.syncing = false;
    }
  }

  getStatus(): SyncStatusInfo {
    const cachedVideoIds = this.scanLocalVideos();
    const cacheSize = calculateCacheSize(this.videosDir);
    return {
      status: this.progress.status,
      lastSyncTime: this.lastSyncTime,
      localCacheSize: cacheSize,
      cachedVideoCount: cachedVideoIds.length,
      progress: { ...this.progress },
    };
  }

  private scanLocalVideos(): number[] {
    return scanLocalVideoIds(this.videosDir);
  }

  private deleteLocalVideo(videoId: number): void {
    if (deleteLocalVideoDir(this.videosDir, videoId)) {
      this.sendToRenderer('sync:video-deleted', { videoId });
    }
  }

  private async fetchSyncDiff(accessToken: string, cachedVideoIds: number[]): Promise<SyncDiff> {
    const url = `${this.serverBaseURL}/devices/sync`;
    const body = JSON.stringify({ cachedVideoIds });
    const data = await httpRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body,
    });
    return JSON.parse(data.toString()) as SyncDiff;
  }

  private async downloadVideo(accessToken: string, video: VideoDownload): Promise<void> {
    const localPath = await downloadEncryptedVideo(
      this.videosDir,
      this.serverBaseURL,
      accessToken,
      video,
    );
    this.sendToRenderer('sync:video-ready', {
      videoId: video.videoId,
      localPath,
      offlineAllowed: video.offlineAllowed,
    });
  }

  private async checkDiskSpace(downloads: VideoDownload[]): Promise<boolean> {
    return checkDiskAndEvict(
      this.dataPath,
      this.videosDir,
      downloads,
      (id) => this.deleteLocalVideo(id),
      (usagePercent) => this.sendToRenderer('sync:disk-warning', { usagePercent }),
    );
  }

  private sendProgress(progress: SyncProgressInfo): void {
    this.progress = progress;
    // Channel uses the `sync:*` namespace convention (see sync:need-token,
    // sync:video-ready, sync:disk-warning). Both ends (here + preload.ts
    // onSyncProgress) must match.
    this.sendToRenderer('sync:progress', progress);
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
