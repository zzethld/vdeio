import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { redis, setWithExpiry } from '../config/redis';
import { minioClient } from '../config/minio';
import { VideoModel } from '../models';
import { addToQueue } from './encryption';

const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'vdeio-uploads');

interface UploadMetadata {
  fileName: string;
  fileSize: number;
  chunkSize: number;
  chunkCount: number;
  createdBy: number;
}

export async function initUpload(
  fileName: string,
  fileSize: number,
  chunkSize: number = 5 * 1024 * 1024,
  createdBy: number
) {
  const uploadId = uuidv4();
  const chunkCount = Math.ceil(fileSize / chunkSize);
  const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId);
  await fs.mkdir(uploadDir, { recursive: true });
  const meta: UploadMetadata = {
    fileName,
    fileSize,
    chunkSize,
    chunkCount,
    createdBy,
  };
  await setWithExpiry(`upload:${uploadId}`, JSON.stringify(meta), 3600);
  return { uploadId, chunkCount, chunkSize };
}

export async function uploadChunk(
  uploadId: string,
  chunkIndex: number,
  chunkData: Buffer
) {
  const metaStr = await redis.get(`upload:${uploadId}`);
  if (!metaStr) throw new Error('Upload session not found or expired');
  const chunkPath = path.join(UPLOAD_TEMP_DIR, uploadId, `chunk_${chunkIndex}`);
  await fs.writeFile(chunkPath, chunkData);
  await redis.sadd(`upload:${uploadId}:chunks`, String(chunkIndex));
}

export async function completeUpload(uploadId: string): Promise<{ videoId: number; status: 'uploaded' }> {
  const metaStr = await redis.get(`upload:${uploadId}`);
  if (!metaStr) throw new Error('Upload session not found or expired');
  const meta: UploadMetadata = JSON.parse(metaStr);

  // Verify all chunks received
  const receivedChunks = await redis.smembers(`upload:${uploadId}:chunks`);
  if (receivedChunks.length !== meta.chunkCount) {
    throw new Error(
      `Not all chunks received: ${receivedChunks.length}/${meta.chunkCount}`
    );
  }

  // Create video record first to get ID
  const video = await VideoModel.create({
    title: meta.fileName.replace(/\.[^.]+$/, ''),
    fileSize: meta.fileSize,
    encryptStatus: 'pending',
    createdBy: meta.createdBy,
  });

  // Merge chunks and upload to MinIO
  const mergedPath = path.join(UPLOAD_TEMP_DIR, uploadId, 'merged.mp4');
  const writeStream = (await import('fs')).createWriteStream(mergedPath);

  for (let i = 0; i < meta.chunkCount; i++) {
    const chunkPath = path.join(UPLOAD_TEMP_DIR, uploadId, `chunk_${i}`);
    const chunkData = await fs.readFile(chunkPath);
    writeStream.write(chunkData);
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  });

  // Upload to MinIO
  const fileBuffer = await fs.readFile(mergedPath);
  await minioClient.putObject(
    'video-original',
    `videos/${video.id}/original.mp4`,
    fileBuffer
  );

  // Update video URL
  await video.update({ originalUrl: `videos/${video.id}/original.mp4` });

  // Trigger encryption
  addToQueue(video.id);

  // Clean up
  await fs.rm(path.join(UPLOAD_TEMP_DIR, uploadId), {
    recursive: true,
    force: true,
  });
  await redis.del(`upload:${uploadId}`, `upload:${uploadId}:chunks`);

  return { videoId: video.id, status: 'uploaded' as const };
}
