import * as fs from 'fs';
import * as path from 'path';
import { getDirectorySize } from './fs-utils.js';
import { httpRequest } from './http.js';
import { parseM3U8, extractIv, createLocalM3U8, type VideoDownload } from './diff.js';

/**
 * Scan the videos directory and return the numeric ids of every cached video
 * (one directory per video, named by id). Non-numeric and zero/negative names
 * are ignored. Returns [] when the directory is missing or unreadable.
 */
export function scanLocalVideoIds(videosDir: string): number[] {
  if (!fs.existsSync(videosDir)) return [];
  try {
    const entries = fs.readdirSync(videosDir, { withFileTypes: true });
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

/**
 * Recursively remove a single video's local cache directory. Returns true when
 * the directory existed (and was removed), false otherwise. Does NOT emit IPC
 * events — the caller (orchestrator) owns renderer notification.
 */
export function deleteLocalVideoDir(videosDir: string, videoId: number): boolean {
  const videoDir = path.join(videosDir, String(videoId));
  if (fs.existsSync(videoDir)) {
    fs.rmSync(videoDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

/** Total bytes consumed by the local video cache (recursive). */
export function calculateCacheSize(videosDir: string): number {
  return getDirectorySize(videosDir);
}

/**
 * Download a single segment to destPath with HTTP Range resume support. If the
 * destination already has bytes, sends a `Range:` header and appends; otherwise
 * writes a fresh file.
 */
export async function downloadWithResume(url: string, destPath: string): Promise<void> {
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

  const data = await httpRequest(url, { headers, responseType: 'buffer' });

  if (existingSize > 0) {
    // Append to existing file
    fs.appendFileSync(destPath, data);
  } else {
    fs.writeFileSync(destPath, data);
  }
}

/**
 * Fully download and persist one encrypted HLS video to the local cache:
 * resolve the presigned playlist URL, fetch the m3u8, parse segment URLs,
 * extract the real IV, fetch the key, download every segment (with resume),
 * and write the local playlist referencing `key.bin`. Returns the absolute
 * path of the written `playlist.m3u8`. Orchestrator owns the final IPC event.
 */
export async function downloadEncryptedVideo(
  videosDir: string,
  serverBaseURL: string,
  accessToken: string,
  video: VideoDownload,
): Promise<string> {
  const videoDir = path.join(videosDir, String(video.videoId));
  if (!fs.existsSync(videoDir)) {
    fs.mkdirSync(videoDir, { recursive: true });
  }

  // 1. Get playlist (presigned m3u8 URL)
  const playlistUrl = `${serverBaseURL}/devices/videos/${video.videoId}/playlist`;
  const playlistData = await httpRequest(playlistUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const playlistResp = JSON.parse(playlistData.toString());
  const m3u8PresignedUrl: string = playlistResp.url;

  // 2. Fetch the actual m3u8 content
  const m3u8Content = await httpRequest(m3u8PresignedUrl, {});
  const m3u8Text = m3u8Content.toString('utf-8');

  // 3. Parse m3u8 to get segment URLs
  const segmentUrls = parseM3U8(m3u8Text, m3u8PresignedUrl);

  // 3b. Extract the real IV FFmpeg wrote into the server playlist so the local
  // playlist decrypts with the same IV the segments were encrypted with.
  const ivHex = extractIv(m3u8Text);

  // 4. Download encryption key
  const keyUrl = `${serverBaseURL}/devices/videos/${video.videoId}/key`;
  const keyData = await httpRequest(keyUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  fs.writeFileSync(path.join(videoDir, 'key.bin'), keyData);

  // 5. Download each segment with resume support
  for (let i = 0; i < segmentUrls.length; i++) {
    const segUrl = segmentUrls[i];
    const segFileName = `seg_${String(i).padStart(3, '0')}.ts`;
    const segPath = path.join(videoDir, segFileName);

    await downloadWithResume(segUrl, segPath);
  }

  // 6. Create local m3u8 with the real IV (never hardcode zero). Pass the source
  // m3u8 so TARGETDURATION and per-segment EXTINF durations mirror the server's.
  const localM3U8 = createLocalM3U8(segmentUrls.length, ivHex, m3u8Text);
  const playlistPath = path.join(videoDir, 'playlist.m3u8');
  fs.writeFileSync(playlistPath, localM3U8, 'utf-8');

  return playlistPath;
}
