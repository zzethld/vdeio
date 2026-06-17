import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database', () => ({
  sequelize: {
    query: vi.fn(),
  },
}));

vi.mock('../../models', () => ({
  VideoModel: {},
  VideoKeyModel: {},
}));

vi.mock('../../config/minio', () => ({
  presignedGetUrl: vi.fn().mockResolvedValue('https://minio.example.com/video-encrypted/videos/1/playlist.m3u8'),
  minioClient: {
    getObject: vi.fn(),
  },
}));

vi.mock('../../services/encryption', () => ({
  getKeyForVideo: vi.fn().mockResolvedValue({ key: Buffer.from('aes-encryption-key') }),
}));

import {
  calculateSyncDiff,
  isVideoAuthorizedForStore,
  getVideoPlaylist,
  getVideoKey,
  getSegmentStream,
  getAuthorizedVideos,
} from '../../services/sync-service';
import { sequelize } from '../../config/database';
import { presignedGetUrl, minioClient } from '../../config/minio';
import { getKeyForVideo } from '../../services/encryption';

describe('Sync Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateSyncDiff', () => {
    it('should include video in downloads when in active campaign but not cached', async () => {
      (sequelize.query as any).mockResolvedValue([
        {
          id: 1,
          title: 'Campaign Video',
          file_size: 5000000,
          hls_url: 'http://example.com/video1.m3u8',
          campaign_id: 1,
        },
      ]);

      const result = await calculateSyncDiff(1, []);

      expect(result.downloads).toHaveLength(1);
      expect(result.downloads[0]).toMatchObject({
        videoId: 1,
        title: 'Campaign Video',
        fileSize: 5000000,
        campaignId: 1,
      });
      expect(result.deletes).toHaveLength(0);
    });

    it('should include video in deletes when cached but no active campaign', async () => {
      (sequelize.query as any).mockResolvedValue([]);

      const result = await calculateSyncDiff(1, [1, 2]);

      expect(result.downloads).toHaveLength(0);
      expect(result.deletes).toHaveLength(2);
      expect(result.deletes.map((d) => d.videoId)).toContain(1);
      expect(result.deletes.map((d) => d.videoId)).toContain(2);
    });

    it('should return no diff when video is cached and in active campaign', async () => {
      (sequelize.query as any).mockResolvedValue([
        {
          id: 1,
          title: 'Cached Campaign Video',
          file_size: 3000000,
          hls_url: 'http://example.com/video1.m3u8',
          campaign_id: 1,
        },
      ]);

      const result = await calculateSyncDiff(1, [1]);

      expect(result.downloads).toHaveLength(0);
      expect(result.deletes).toHaveLength(0);
    });

    it('should handle mixed scenario with downloads and deletes', async () => {
      (sequelize.query as any).mockResolvedValue([
        {
          id: 2,
          title: 'New Video',
          file_size: 4000000,
          hls_url: 'http://example.com/video2.m3u8',
          campaign_id: 1,
        },
      ]);

      const result = await calculateSyncDiff(1, [1, 2]);

      // Video 2 is cached and in campaign -> no diff
      // Video 1 is cached but not in campaign -> delete
      expect(result.downloads).toHaveLength(0);
      expect(result.deletes).toHaveLength(1);
      expect(result.deletes[0].videoId).toBe(1);
    });

    it('should include video in downloads when new campaign video not in cache', async () => {
      (sequelize.query as any).mockResolvedValue([
        {
          id: 3,
          title: 'Brand New Video',
          file_size: 6000000,
          hls_url: 'http://example.com/video3.m3u8',
          campaign_id: 2,
        },
      ]);

      const result = await calculateSyncDiff(1, [1, 2]);

      expect(result.downloads).toHaveLength(1);
      expect(result.downloads[0].videoId).toBe(3);
      expect(result.deletes).toHaveLength(2);
    });
  });

  describe('isVideoAuthorizedForStore', () => {
    it('should return true when store has active campaign access', async () => {
      (sequelize.query as any).mockResolvedValue([{ cnt: 1 }]);

      const result = await isVideoAuthorizedForStore(1, 1);

      expect(result).toBe(true);
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as cnt'),
        expect.objectContaining({ replacements: [1, 1] })
      );
    });

    it('should return false when store has no campaign access', async () => {
      (sequelize.query as any).mockResolvedValue([{ cnt: 0 }]);

      const result = await isVideoAuthorizedForStore(1, 1);

      expect(result).toBe(false);
    });

    it('should return false when count is zero', async () => {
      (sequelize.query as any).mockResolvedValue([{ cnt: 0 }]);

      const result = await isVideoAuthorizedForStore(99, 99);

      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getVideoPlaylist — presigned m3u8 URL
  // ---------------------------------------------------------------------------
  describe('getVideoPlaylist', () => {
    it('returns a presigned URL for the video playlist in the encrypted bucket', async () => {
      (presignedGetUrl as any).mockResolvedValueOnce('https://signed.example.com/pl.m3u8');

      const url = await getVideoPlaylist(42);

      expect(presignedGetUrl).toHaveBeenCalledWith(
        'video-encrypted',
        'videos/42/playlist.m3u8',
        86400,
      );
      expect(url).toBe('https://signed.example.com/pl.m3u8');
    });

    it('uses a 24-hour (86400s) expiry window', async () => {
      (presignedGetUrl as any).mockResolvedValueOnce('https://signed.example.com/pl.m3u8');
      await getVideoPlaylist(1);
      expect(presignedGetUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        86400,
      );
    });

    it('propagates the videoId into the object key', async () => {
      (presignedGetUrl as any).mockResolvedValueOnce('x');
      await getVideoPlaylist(777);
      expect(presignedGetUrl).toHaveBeenCalledWith(
        expect.any(String),
        'videos/777/playlist.m3u8',
        expect.any(Number),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getVideoKey — AES-128 key from key-manager
  // ---------------------------------------------------------------------------
  describe('getVideoKey', () => {
    it('returns the AES key buffer when key-manager has a row', async () => {
      const keyBytes = Buffer.from('0123456789abcdef', 'hex');
      (getKeyForVideo as any).mockResolvedValueOnce({ key: keyBytes });

      const result = await getVideoKey(7);

      expect(getKeyForVideo).toHaveBeenCalledWith(7);
      expect(result).toBe(keyBytes);
    });

    it('returns null when key-manager has no row for the video', async () => {
      (getKeyForVideo as any).mockResolvedValueOnce(null);

      const result = await getVideoKey(999);

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getSegmentStream — TS segment object stream from MinIO
  // ---------------------------------------------------------------------------
  describe('getSegmentStream', () => {
    it('requests seg_NNN.ts with zero-padded sequence from the encrypted bucket', async () => {
      const fakeStream = { pipe: vi.fn() };
      (minioClient.getObject as any).mockResolvedValueOnce(fakeStream);

      await getSegmentStream(11, '5');

      expect(minioClient.getObject).toHaveBeenCalledWith(
        'video-encrypted',
        'videos/11/seg_005.ts',
      );
    });

    it('zero-pads short sequences to 3 digits', async () => {
      const fakeStream = { pipe: vi.fn() };
      (minioClient.getObject as any).mockResolvedValueOnce(fakeStream);

      await getSegmentStream(2, '1');

      expect(minioClient.getObject).toHaveBeenCalledWith(
        expect.any(String),
        'videos/2/seg_001.ts',
      );
    });

    it('returns the stream object returned by minio', async () => {
      const fakeStream = { pipe: vi.fn() };
      (minioClient.getObject as any).mockResolvedValueOnce(fakeStream);

      const result = await getSegmentStream(3, '10');

      expect(result).toBe(fakeStream);
    });

    it('does not truncate sequences already >= 3 digits', async () => {
      const fakeStream = { pipe: vi.fn() };
      (minioClient.getObject as any).mockResolvedValueOnce(fakeStream);

      await getSegmentStream(4, '1234');

      expect(minioClient.getObject).toHaveBeenCalledWith(
        expect.any(String),
        'videos/4/seg_1234.ts',
      );
    });

    it('propagates errors from minioClient.getObject', async () => {
      (minioClient.getObject as any).mockRejectedValueOnce(new Error('NoSuchKey'));

      await expect(getSegmentStream(5, '1')).rejects.toThrow('NoSuchKey');
    });
  });

  // ---------------------------------------------------------------------------
  // getAuthorizedVideos — campaign-grouped authorized video list
  // ---------------------------------------------------------------------------
  describe('getAuthorizedVideos', () => {
    it('groups flat query rows into campaigns with nested videos', async () => {
      // Two rows from the same campaign → one campaign with two videos
      (sequelize.query as any).mockResolvedValueOnce([
        {
          id: 1,
          title: 'Summer Promo',
          start_time: new Date('2024-06-01'),
          end_time: new Date('2024-08-31'),
          video_id: 10,
          video_title: 'Promo A',
          file_size: 1000,
          duration: 60,
          cover_url: 'https://example.com/a.png',
          hls_url: 'videos/10/playlist.m3u8',
        },
        {
          id: 1,
          title: 'Summer Promo',
          start_time: new Date('2024-06-01'),
          end_time: new Date('2024-08-31'),
          video_id: 11,
          video_title: 'Promo B',
          file_size: 2000,
          duration: 90,
          cover_url: null,
          hls_url: 'videos/11/playlist.m3u8',
        },
      ]);

      const result = await getAuthorizedVideos(5);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        title: 'Summer Promo',
      });
      expect(result[0].videos).toHaveLength(2);
      expect(result[0].videos[0]).toMatchObject({
        id: 10,
        title: 'Promo A',
        fileSize: 1000,
        duration: 60,
        coverUrl: 'https://example.com/a.png',
      });
      expect(result[0].videos[1]).toMatchObject({
        id: 11,
        title: 'Promo B',
        fileSize: 2000,
        duration: 90,
        coverUrl: null,
      });
    });

    it('returns separate campaign entries when rows span multiple campaigns', async () => {
      (sequelize.query as any).mockResolvedValueOnce([
        {
          id: 1,
          title: 'C1',
          start_time: new Date(),
          end_time: new Date(),
          video_id: 100,
          video_title: 'V1',
          file_size: 1,
          duration: 1,
          cover_url: null,
          hls_url: 'x',
        },
        {
          id: 2,
          title: 'C2',
          start_time: new Date(),
          end_time: new Date(),
          video_id: 200,
          video_title: 'V2',
          file_size: 2,
          duration: 2,
          cover_url: null,
          hls_url: 'y',
        },
      ]);

      const result = await getAuthorizedVideos(5);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it('returns an empty array when the query has no rows', async () => {
      (sequelize.query as any).mockResolvedValueOnce([]);

      const result = await getAuthorizedVideos(99);

      expect(result).toEqual([]);
    });

    it('passes the storeId as the only SQL replacement', async () => {
      (sequelize.query as any).mockResolvedValueOnce([]);

      await getAuthorizedVideos(42);

      expect(sequelize.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ replacements: [42] }),
      );
    });

    it('preserves video order within a campaign as returned by the DB', async () => {
      (sequelize.query as any).mockResolvedValueOnce([
        {
          id: 1,
          title: 'C',
          start_time: new Date(),
          end_time: new Date(),
          video_id: 3,
          video_title: 'V3',
          file_size: 1,
          duration: 1,
          cover_url: null,
          hls_url: 'x',
        },
        {
          id: 1,
          title: 'C',
          start_time: new Date(),
          end_time: new Date(),
          video_id: 1,
          video_title: 'V1',
          file_size: 1,
          duration: 1,
          cover_url: null,
          hls_url: 'x',
        },
        {
          id: 1,
          title: 'C',
          start_time: new Date(),
          end_time: new Date(),
          video_id: 2,
          video_title: 'V2',
          file_size: 1,
          duration: 1,
          cover_url: null,
          hls_url: 'x',
        },
      ]);

      const result = await getAuthorizedVideos(1);

      expect(result[0].videos.map((v: { id: number }) => v.id)).toEqual([3, 1, 2]);
    });
  });
});
