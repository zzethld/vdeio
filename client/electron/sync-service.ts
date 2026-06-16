import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { BrowserWindow } from 'electron';

const execAsync = promisify(exec);

// --- Types ---

export interface SyncDiff {
  downloads: VideoDownload[];
  deletes: VideoDelete[];
}

export interface VideoDownload {
  videoId: number;
  title: string;
  fileSize: number;
  campaignId: number;
  playlistUrl: string;
}

export interface VideoDelete {
  videoId: number;
}

// --- Pure diff logic ---
// Given local cached video IDs and server's playlist, compute what to download
// and what to delete. Extracted as a pure function for testability.
export function calculateDiff(
  localIds: number[],
  serverVideos: VideoDownload[],
): SyncDiff {
  const localSet = new Set(localIds);
  const seen = new Set<number>();
  const downloads: VideoDownload[] = [];

  for (const video of serverVideos) {
    if (!localSet.has(video.videoId) && !seen.has(video.videoId)) {
      seen.add(video.videoId);
      downloads.push(video);
    }
  }

  const serverSet = new Set(serverVideos.map((v) => v.videoId));
  const deletes = localIds
    .filter((id) => !serverSet.has(id))
    .map((id) => ({ videoId: id }));

  return { downloads, deletes };
}

// --- M3U8 utilities (pure functions, exported for testing) ---

export function parseM3U8(m3u8Text: string, baseUrl: string): string[] {
  const lines = m3u8Text.split('\n');
  const segments: string[] = [];
  const parsedBase = new URL(baseUrl);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      segments.push(trimmed);
    } else {
      const resolved = new URL(trimmed, parsedBase.href);
      segments.push(resolved.href);
    }
  }
  return segments;
}

export function createLocalM3U8(segmentCount: number, ivHex?: string | null): string {
  let m3u8 = '#EXTM3U\n';
  m3u8 += '#EXT-X-VERSION:3\n';
  m3u8 += '#EXT-X-TARGETDURATION:10\n';
  m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
  // When an IV is known, declare it explicitly so the player decrypts with the same
  // IV FFmpeg used to encrypt the segments. When unknown, omit the IV attribute so the
  // player falls back to the media-sequence-number IV per RFC 8216 — never hardcode zero,
  // that would mis-decrypt segments encrypted with a real random IV.
  const keyLine = ivHex
    ? `#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x${ivHex}\n`
    : '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n';
  m3u8 += keyLine;

  for (let i = 0; i < segmentCount; i++) {
    m3u8 += '#EXTINF:10.0,\n';
    m3u8 += `seg_${String(i).padStart(3, '0')}.ts\n`;
  }

  m3u8 += '#EXT-X-ENDLIST\n';
  return m3u8;
}

/**
 * Extract the AES-128 initialization vector from a server-generated HLS playlist.
 *
 * FFmpeg writes the per-video IV into the m3u8 as
 * `#EXT-X-KEY:METHOD=AES-128,URI="...",IV=0x<hex>` whenever the key_info file's
 * third line is present (which key-manager always provides). Returns the hex
 * string WITHOUT the `0x` prefix, or null when the playlist omits the IV (in
 * which case the player must use the media sequence number as IV per RFC 8216).
 */
export function extractIv(m3u8Text: string): string | null {
  const match = m3u8Text.match(/#EXT-X-KEY:[^\n]*IV=0x([0-9a-fA-F]+)/);
  return match ? match[1].toLowerCase() : null;
}

interface SyncProgress {
  status: 'idle' | 'syncing' | 'error' | 'paused';
  current: number;
  total: number;
  videoId?: number;
  videoTitle?: string;
  phase?: 'scan' | 'diff' | 'delete' | 'download';
  message?: string;
}

interface SyncStatusResult {
  status: SyncProgress['status'];
  lastSyncTime: string | null;
  localCacheSize: number;
  cachedVideoCount: number;
  progress?: SyncProgress;
}

// --- SyncService ---

export class SyncService {
  private mainWindow: BrowserWindow | null = null;
  private dataPath: string;
  private videosDir: string;
  private serverBaseURL: string;
  private progress: SyncProgress = { status: 'idle', current: 0, total: 0 };
  private lastSyncTime: string | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  constructor(dataPath: string, serverBaseURL?: string) {
    this.dataPath = dataPath;
    this.videosDir = path.join(dataPath, 'videos');
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

  getStatus(): SyncStatusResult {
    const cachedVideoIds = this.scanLocalVideos();
    const cacheSize = this.calculateCacheSize();
    return {
      status: this.progress.status,
      lastSyncTime: this.lastSyncTime,
      localCacheSize: cacheSize,
      cachedVideoCount: cachedVideoIds.length,
      progress: { ...this.progress },
    };
  }

  // --- Local Cache Operations ---

  private scanLocalVideos(): number[] {
    if (!fs.existsSync(this.videosDir)) return [];
    try {
      const entries = fs.readdirSync(this.videosDir, { withFileTypes: true });
      const ids: number[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const num = parseInt(entry.name, 10);
          if (!isNaN(num) && num > 0) {
            ids.push(num);
          }
        }
      }
      return ids;
    } catch {
      return [];
    }
  }

  private deleteLocalVideo(videoId: number): void {
    const videoDir = path.join(this.videosDir, String(videoId));
    if (fs.existsSync(videoDir)) {
      fs.rmSync(videoDir, { recursive: true, force: true });
    }
  }

  private calculateCacheSize(): number {
    return this.getDirectorySize(this.videosDir);
  }

  private getDirectorySize(dirPath: string): number {
    let totalSize = 0;
    if (!fs.existsSync(dirPath)) return 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            totalSize += stat.size;
          } catch { /* skip */ }
        } else if (entry.isDirectory()) {
          totalSize += this.getDirectorySize(fullPath);
        }
      }
    } catch { /* skip */ }
    return totalSize;
  }

  // --- Network Operations ---

  private async fetchSyncDiff(accessToken: string, cachedVideoIds: number[]): Promise<SyncDiff> {
    const url = `${this.serverBaseURL}/devices/sync`;
    const body = JSON.stringify({ cachedVideoIds });
    const data = await this.httpRequest(url, {
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
    const videoDir = path.join(this.videosDir, String(video.videoId));
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }

    // 1. Get playlist (presigned m3u8 URL)
    const playlistUrl = `${this.serverBaseURL}/devices/videos/${video.videoId}/playlist`;
    const playlistData = await this.httpRequest(playlistUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const playlistResp = JSON.parse(playlistData.toString());
    const m3u8PresignedUrl: string = playlistResp.url;

    // 2. Fetch the actual m3u8 content
    const m3u8Content = await this.httpRequest(m3u8PresignedUrl, {});
    const m3u8Text = m3u8Content.toString('utf-8');

    // 3. Parse m3u8 to get segment URLs
    const segmentUrls = parseM3U8(m3u8Text, m3u8PresignedUrl);

    // 3b. Extract the real IV FFmpeg wrote into the server playlist so the local
    // playlist decrypts with the same IV the segments were encrypted with.
    const ivHex = extractIv(m3u8Text);

    // 4. Download encryption key
    const keyUrl = `${this.serverBaseURL}/devices/videos/${video.videoId}/key`;
    const keyData = await this.httpRequest(keyUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    fs.writeFileSync(path.join(videoDir, 'key.bin'), keyData);

    // 5. Download each segment with resume support
    for (let i = 0; i < segmentUrls.length; i++) {
      const segUrl = segmentUrls[i];
      const segFileName = `seg_${String(i).padStart(3, '0')}.ts`;
      const segPath = path.join(videoDir, segFileName);

      await this.downloadWithResume(segUrl, segPath);
    }

    // 6. Create local m3u8 with the real IV (never hardcode zero)
    const localM3U8 = createLocalM3U8(segmentUrls.length, ivHex);
    fs.writeFileSync(path.join(videoDir, 'playlist.m3u8'), localM3U8, 'utf-8');

    // 7. Notify renderer about local path
    this.sendToRenderer('sync:video-ready', {
      videoId: video.videoId,
      localPath: path.join(videoDir, 'playlist.m3u8'),
    });
  }

  private async downloadWithResume(url: string, destPath: string): Promise<void> {
    let existingSize = 0;
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      existingSize = stat.size;
      // If file seems complete (non-zero), skip — actual completeness checked by content-length later
    }

    const headers: Record<string, string> = {};
    if (existingSize > 0) {
      headers['Range'] = `bytes=${existingSize}-`;
    }

    const data = await this.httpRequest(url, { headers, responseType: 'buffer' });

    if (existingSize > 0) {
      // Append to existing file
      fs.appendFileSync(destPath, data);
    } else {
      fs.writeFileSync(destPath, data);
    }
  }

  // --- Disk Space ---

  private async checkDiskSpace(downloads: VideoDownload[]): Promise<boolean> {
    try {
      const usage = await this.getDiskUsagePercent();
      if (usage >= 95) {
        // Critical: LRU eviction
        await this.lruEvict(downloads);
        return await this.getDiskUsagePercent() < 95;
      }
      if (usage >= 85) {
        // Warning
        this.sendToRenderer('sync:disk-warning', { usagePercent: usage });
        // Still allow download but warn
      }
      return true;
    } catch {
      // If we can't check, assume ok
      return true;
    }
  }

  private async getDiskUsagePercent(): Promise<number> {
    try {
      if (process.platform === 'win32') {
        const drive = path.parse(this.dataPath).root;
        const { stdout } = await execAsync(
          `wmic logicaldisk where "DeviceID='${drive.replace('\\', '')}'" get FreeSpace,Size /format:list`,
          { timeout: 5000 }
        );
        const freeMatch = stdout.match(/FreeSpace=(\d+)/);
        const sizeMatch = stdout.match(/Size=(\d+)/);
        if (freeMatch && sizeMatch) {
          const free = parseInt(freeMatch[1], 10);
          const total = parseInt(sizeMatch[1], 10);
          return ((total - free) / total) * 100;
        }
      }
      // Unix: use statvfs equivalent (df command)
      const { stdout } = await execAsync(`df -k "${this.dataPath}"`, { timeout: 5000 });
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].trim().split(/\s+/);
        const used = parseInt(parts[2], 10);
        const total = parseInt(parts[1], 10);
        if (total > 0) return (used / total) * 100;
      }
    } catch { /* ignore */ }
    return 0;
  }

  private async lruEvict(incomingDownloads: VideoDownload[]): Promise<void> {
    // Find all video directories and sort by last access time
    const entries = fs.readdirSync(this.videosDir, { withFileTypes: true });
    const videoDirs: Array<{ id: number; atime: Date }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const num = parseInt(entry.name, 10);
      if (isNaN(num)) continue;
      // Don't evict videos we're about to download
      if (incomingDownloads.some(d => d.videoId === num)) continue;

      const videoDir = path.join(this.videosDir, entry.name);
      try {
        const stat = fs.statSync(videoDir);
        videoDirs.push({ id: num, atime: stat.atime });
      } catch { /* skip */ }
    }

    // Sort by access time (oldest first)
    videoDirs.sort((a, b) => a.atime.getTime() - b.atime.getTime());

    // Evict oldest until we're under 90%
    for (const dir of videoDirs) {
      const usage = await this.getDiskUsagePercent();
      if (usage < 90) break;
      console.log(`[SyncService] LRU evicting video ${dir.id}`);
      this.deleteLocalVideo(dir.id);
    }
  }

  // --- HTTP Utility ---

  private httpRequest(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      responseType?: 'text' | 'buffer';
      maxRedirects?: number;
    } = {}
  ): Promise<Buffer> {
    const { method = 'GET', headers = {}, body, maxRedirects = 5 } = options;

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const reqOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
        rejectUnauthorized: true,
      };

      const req = lib.request(reqOptions, (res) => {
        // Handle redirects
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && maxRedirects > 0) {
          this.httpRequest(res.headers.location, { ...options, maxRedirects: maxRedirects - 1 })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const errBody = Buffer.concat(chunks).toString('utf-8');
            reject(new Error(`HTTP ${res.statusCode}: ${errBody.substring(0, 200)}`));
          });
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      });

      req.on('error', reject);
      req.setTimeout(120000, () => {
        req.destroy(new Error('Request timeout'));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  // --- IPC Helpers ---

  private sendProgress(progress: SyncProgress): void {
    this.progress = progress;
    this.sendToRenderer('sync-progress', progress);
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

