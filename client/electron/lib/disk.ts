import * as fs from 'fs';
import * as path from 'path';
import { getDiskUsage } from './disk-utils.js';

interface EvictableVideo {
  id: number;
  atime: Date;
}

/**
 * List cached video directories eligible for LRU eviction: numeric dirs whose
 * id is NOT in `excludeIds` (videos about to be downloaded must never be
 * evicted). Returned oldest-access-time first.
 */
export function listEvictableVideos(
  videosDir: string,
  excludeIds: number[],
): EvictableVideo[] {
  const exclude = new Set(excludeIds);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(videosDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const videoDirs: EvictableVideo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const num = parseInt(entry.name, 10);
    if (isNaN(num)) continue;
    // Don't evict videos we're about to download
    if (exclude.has(num)) continue;

    const videoDir = path.join(videosDir, entry.name);
    try {
      const stat = fs.statSync(videoDir);
      videoDirs.push({ id: num, atime: stat.atime });
    } catch { /* skip */ }
  }

  // Sort by access time (oldest first)
  videoDirs.sort((a, b) => a.atime.getTime() - b.atime.getTime());
  return videoDirs;
}

/**
 * Disk-space gate run before a download batch.
 *
 * - usage >= 95%: critical — evict LRU videos until usage < 90%, then re-check;
 *   return true only if usage dropped below 95%.
 * - usage >= 85%: warning — call `onWarn` but still allow downloads.
 * - otherwise: allow.
 *
 * `onDelete(videoId)` performs the actual local deletion (and any side effects
 * like IPC). Thresholds and control flow match the original SyncService exactly.
 */
export async function checkDiskAndEvict(
  dataPath: string,
  videosDir: string,
  incomingDownloads: Array<{ videoId: number }>,
  onDelete: (videoId: number) => void,
  onWarn: (usagePercent: number) => void,
): Promise<boolean> {
  try {
    let usage = (await getDiskUsage(dataPath)).usagePercent;
    if (usage >= 95) {
      // Critical: LRU eviction
      await lruEvict(dataPath, videosDir, incomingDownloads, onDelete);
      usage = (await getDiskUsage(dataPath)).usagePercent;
      return usage < 95;
    }
    if (usage >= 85) {
      // Warning — still allow download but warn
      onWarn(usage);
    }
    return true;
  } catch {
    // If we can't check, assume ok
    return true;
  }
}

async function lruEvict(
  dataPath: string,
  videosDir: string,
  incomingDownloads: Array<{ videoId: number }>,
  onDelete: (videoId: number) => void,
): Promise<void> {
  const candidates = listEvictableVideos(
    videosDir,
    incomingDownloads.map((d) => d.videoId),
  );

  // Evict oldest until we're under 90%
  for (const dir of candidates) {
    const usage = (await getDiskUsage(dataPath)).usagePercent;
    if (usage < 90) break;
    console.log(`[SyncService] LRU evicting video ${dir.id}`);
    onDelete(dir.id);
  }
}
