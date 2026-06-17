import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { minioClient } from '../../config/minio';
import { VideoModel } from '../../models';
import type { VideoAttributes } from '../../models/video';
import { generateEncryptionKey, storeKey, KeyData } from './key-manager';

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const BUCKET_ORIGINAL = 'video-original';
const BUCKET_ENCRYPTED = 'video-encrypted';
const MAX_RETRIES = 3;
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONCURRENT = 2;
const STDERR_PREVIEW_LENGTH = 200;

// In-memory retry tracking (resets on server restart, which is fine)
const retryCountMap = new Map<number, number>();
// Concurrency semaphore
let activeEncryptions = 0;

/**
 * Truncate stderr to a concise one-line preview for logging.
 * Full stderr is only shown when LOG_LEVEL=debug.
 */
function truncateStderr(stderr: string, max = STDERR_PREVIEW_LENGTH): string {
  const firstLine = stderr.split('\n').find(l => l.trim().length > 0) || '';
  if (firstLine.length <= max) return firstLine;
  return firstLine.substring(0, max) + '...';
}

export async function encryptVideo(videoId: number): Promise<void> {
  const video = await VideoModel.findByPk(videoId);
  if (!video) throw new Error(`Video ${videoId} not found`);
  // Allow retry from 'failed' status (reset to pending), also allow 'pending' and 'encrypting' (stale)
  if (video.encryptStatus === 'failed') {
    const retries = retryCountMap.get(videoId) || 0;
    if (retries >= MAX_RETRIES) {
      console.log(`[Encryption] Video ${videoId}: max retries (${MAX_RETRIES}) reached, skipping`);
      return;
    }
    retryCountMap.set(videoId, retries + 1);
    await video.update({ encryptStatus: 'pending' });
  }
  if (video.encryptStatus !== 'pending') return;

  await video.update({ encryptStatus: 'encrypting' });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `vdeio-${videoId}-`));

  try {
    // 1. Download original from MinIO
    const originalPath = path.join(tmpDir, 'original.mp4');
    const originalStream = await minioClient.getObject(BUCKET_ORIGINAL, `videos/${videoId}/original.mp4`);
    await pipeline(originalStream, createWriteStream(originalPath));

    // 2. Generate encryption key
    const keyData: KeyData = generateEncryptionKey();
    const keyFilePath = path.join(tmpDir, 'encrypt.key');
    await fs.writeFile(keyFilePath, keyData.key);

    // 3. Create key_info file for FFmpeg — FIXED URL
    const keyUrl = `/api/v1/devices/videos/${videoId}/key`;
    const keyInfoPath = path.join(tmpDir, 'key_info');
    await fs.writeFile(keyInfoPath, `${keyUrl}\n${keyFilePath}\n${keyData.iv}\n`);

    // 4. Run FFmpeg with timeout and extra flags
    const outputPath = path.join(tmpDir, 'output.m3u8');
    const segmentPattern = path.join(tmpDir, 'seg_%03d.ts');

    await runFFmpeg([
      '-y',
      '-nostdin',
      '-i', originalPath,
      '-hls_time', '10',
      '-hls_key_info_file', keyInfoPath,
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', segmentPattern,
      outputPath,
    ]);

    // 5. Read output files
    const m3u8Content = await fs.readFile(outputPath, 'utf-8');
    const files = await fs.readdir(tmpDir);
    const tsFiles = files.filter(f => f.endsWith('.ts'));

    // 6. Upload to MinIO
    const prefix = `videos/${videoId}`;

    await minioClient.putObject(BUCKET_ENCRYPTED, `${prefix}/playlist.m3u8`, Buffer.from(m3u8Content));

    for (const tsFile of tsFiles) {
      const tsPath = path.join(tmpDir, tsFile);
      const tsContent = await fs.readFile(tsPath);
      await minioClient.putObject(BUCKET_ENCRYPTED, `${prefix}/${tsFile}`, tsContent);
    }

    // 7. Store key
    await storeKey(videoId, keyData);

    // 8. Update video record — SUCCESS, clear retry count
    await video.update({
      encryptStatus: 'done',
      hlsUrl: `${prefix}/playlist.m3u8`,
    });
    retryCountMap.delete(videoId);

    console.log(`[Encryption] Video ${videoId} encrypted successfully`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Encryption] Video ${videoId} failed: ${truncateStderr(msg)}`);
    await video.update({ encryptStatus: 'failed' });
    throw error;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args);
    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    // Timeout: kill after FFMPEG_TIMEOUT_MS
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`FFmpeg timed out after ${FFMPEG_TIMEOUT_MS / 1000}s`));
    }, FFMPEG_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (code ${code}): ${truncateStderr(stderr)}`));
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export interface ProcessQueueOptions {
  /** Only process fresh 'pending' videos, skip failed/encrypting retries */
  startup?: boolean;
  /** Max number of videos to process in this run */
  limit?: number;
}

export async function processQueue(options: ProcessQueueOptions = {}): Promise<void> {
  const { startup = false, limit } = options;

  const statuses: Array<VideoAttributes['encryptStatus']> = startup
    ? ['pending']
    : ['pending', 'failed', 'encrypting'];

  const videos = await VideoModel.findAll({
    where: {
      encryptStatus: statuses,
    },
    order: [['createdAt', 'ASC']],
    ...(limit ? { limit } : {}),
  });

  console.log(`[Encryption] Processing queue: ${videos.length} video(s) found${startup ? ' (startup mode)' : ''}`);

  for (const video of videos) {
    // Proper concurrency wait
    while (activeEncryptions >= MAX_CONCURRENT) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    activeEncryptions++;
    try {
      await encryptVideo(video.id);
    } catch {
      // Error already logged concisely inside encryptVideo
    } finally {
      activeEncryptions--;
    }
  }
}

export function addToQueue(videoId: number): void {
  // Fire and forget — process in background
  encryptVideo(videoId).catch(() => {
    // Error already logged concisely inside encryptVideo
  });
}
