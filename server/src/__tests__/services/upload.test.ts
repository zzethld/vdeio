import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn().mockResolvedValue(Buffer.from('chunk-data')),
    rm: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn((cb: () => void) => {
      if (cb) cb();
    }),
    on: vi.fn(),
  })),
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
  },
  join: vi.fn((...args: string[]) => args.join('/')),
}));

vi.mock('os', () => ({
  default: {
    tmpdir: vi.fn(() => '/tmp'),
  },
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-upload-id'),
}));

vi.mock('../../config/redis', () => ({
  redis: {
    get: vi.fn(),
    sadd: vi.fn(),
    smembers: vi.fn(),
    del: vi.fn(),
  },
  setWithExpiry: vi.fn(),
}));

vi.mock('../../config/minio', () => ({
  minioClient: {
    putObject: vi.fn(),
  },
}));

vi.mock('../../models', () => ({
  VideoModel: {
    create: vi.fn(),
  },
}));

vi.mock('../../services/encryption', () => ({
  addToQueue: vi.fn(),
}));

import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { redis, setWithExpiry } from '../../config/redis';
import { minioClient } from '../../config/minio';
import { VideoModel } from '../../models';
import { addToQueue } from '../../services/encryption';
import { initUpload, uploadChunk, completeUpload } from '../../services/upload';

describe('Upload Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initUpload', () => {
    it('should return uploadId and chunk info', async () => {
      const result = await initUpload('test.mp4', 1024, 512, 1);

      expect(result.uploadId).toBe('test-upload-id');
      expect(result.chunkCount).toBe(2);
      expect(result.chunkSize).toBe(512);
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/vdeio-uploads/test-upload-id', { recursive: true });
      expect(setWithExpiry).toHaveBeenCalledWith(
        'upload:test-upload-id',
        expect.any(String),
        3600
      );
    });
  });

  describe('uploadChunk', () => {
    it('should save chunk and track index in redis', async () => {
      (redis.get as any).mockResolvedValue(
        JSON.stringify({
          fileName: 'test.mp4',
          fileSize: 1024,
          chunkSize: 512,
          chunkCount: 2,
          createdBy: 1,
        })
      );

      await uploadChunk('test-upload-id', 0, Buffer.from('chunk0'));

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/vdeio-uploads/test-upload-id/chunk_0',
        Buffer.from('chunk0')
      );
      expect(redis.sadd).toHaveBeenCalledWith('upload:test-upload-id:chunks', '0');
    });

    it('should throw when upload session not found', async () => {
      (redis.get as any).mockResolvedValue(null);

      await expect(uploadChunk('bad-id', 0, Buffer.from('chunk0'))).rejects.toThrow(
        'Upload session not found or expired'
      );
    });
  });

  describe('completeUpload', () => {
    it('should merge chunks, upload to MinIO, and return videoId', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true);
      (redis.get as any).mockResolvedValue(
        JSON.stringify({
          fileName: 'test.mp4',
          fileSize: 1024,
          chunkSize: 512,
          chunkCount: 2,
          createdBy: 1,
        })
      );
      (redis.smembers as any).mockResolvedValue(['0', '1']);
      (VideoModel.create as any).mockResolvedValue({
        id: 42,
        update: mockUpdate,
      });

      const result = await completeUpload('test-upload-id');

      expect(result.videoId).toBe(42);
      expect(result.status).toBe('uploaded');
      expect(VideoModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'test',
          fileSize: 1024,
          encryptStatus: 'pending',
          createdBy: 1,
        })
      );
      expect(createWriteStream).toHaveBeenCalledWith(
        '/tmp/vdeio-uploads/test-upload-id/merged.mp4'
      );
      expect(minioClient.putObject).toHaveBeenCalledWith(
        'video-original',
        'videos/42/original.mp4',
        expect.any(Buffer)
      );
      expect(mockUpdate).toHaveBeenCalledWith({ originalUrl: 'videos/42/original.mp4' });
      expect(addToQueue).toHaveBeenCalledWith(42);
      expect(fs.rm).toHaveBeenCalledWith('/tmp/vdeio-uploads/test-upload-id', {
        recursive: true,
        force: true,
      });
      expect(redis.del).toHaveBeenCalledWith('upload:test-upload-id', 'upload:test-upload-id:chunks');
    });

    it('should throw when upload session not found', async () => {
      (redis.get as any).mockResolvedValue(null);

      await expect(completeUpload('bad-id')).rejects.toThrow(
        'Upload session not found or expired'
      );
    });

    it('should throw when not all chunks received', async () => {
      (redis.get as any).mockResolvedValue(
        JSON.stringify({
          fileName: 'test.mp4',
          fileSize: 1536,
          chunkSize: 512,
          chunkCount: 3,
          createdBy: 1,
        })
      );
      (redis.smembers as any).mockResolvedValue(['0', '1']);

      await expect(completeUpload('test-upload-id')).rejects.toThrow(
        'Not all chunks received: 2/3'
      );
    });

    it('should throw when MinIO putObject fails', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true);
      (redis.get as any).mockResolvedValue(
        JSON.stringify({
          fileName: 'test.mp4',
          fileSize: 1024,
          chunkSize: 512,
          chunkCount: 2,
          createdBy: 1,
        })
      );
      (redis.smembers as any).mockResolvedValue(['0', '1']);
      (VideoModel.create as any).mockResolvedValue({
        id: 42,
        update: mockUpdate,
      });
      (minioClient.putObject as any).mockRejectedValue(new Error('MinIO error'));

      await expect(completeUpload('test-upload-id')).rejects.toThrow('MinIO error');
    });
  });
});
