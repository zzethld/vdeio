import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { createAdmin, createVideo, createCampaign } from '../helpers';
import { signAccessToken } from '../../src/utils/jwt';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit';
import { CampaignVideoModel } from '../../src/models';

// Mock the upload service to avoid real filesystem/MinIO operations
vi.mock('../../src/services/upload', () => ({
  initUpload: vi.fn().mockResolvedValue({ uploadId: 'test-upload-id', chunkCount: 3, chunkSize: 5242880 }),
  uploadChunk: vi.fn().mockResolvedValue(undefined),
  completeUpload: vi.fn().mockResolvedValue({ videoId: 1, status: 'uploaded' }),
}));

describe('Video Management Routes', () => {
  let adminToken: string;

  beforeAll(async () => {
    await initTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    (rateLimitMiddleware as any).resetKey('::ffff:127.0.0.1');
    const admin = await createAdmin();
    adminToken = signAccessToken({
      userId: admin.id,
      storeId: null,
      deviceId: null,
      role: 'admin',
    });
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('POST /api/v1/admin/videos/upload/init', () => {
    it('should initialize upload with valid params', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/upload/init')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fileName: 'test.mp4', fileSize: 1024 * 1024 * 10 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('uploadId', 'test-upload-id');
      expect(res.body).toHaveProperty('chunkCount', 3);
    });

    it('should return 400 when fileName or fileSize missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/upload/init')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fileName: 'test.mp4' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('fileName and fileSize are required');
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/upload/init')
        .send({ fileName: 'test.mp4', fileSize: 1024 });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/admin/videos/upload/chunk', () => {
    it('should upload chunk with base64 data', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/upload/chunk')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ uploadId: 'test-upload-id', chunkIndex: '0' })
        .send({ chunkData: Buffer.from('test chunk data').toString('base64') });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('chunkIndex', 0);
      expect(res.body).toHaveProperty('chunkCount');
      expect(res.body).toHaveProperty('receivedBytes');
      expect(res.body).toHaveProperty('totalBytes');
    });

    it('should accept a raw binary (Buffer) request body', async () => {
      // Clients may upload chunks as raw octet-stream. The route inspects
      // req.body — when express.raw is in play this is a Buffer. supertest
      // supports this by sending the buffer directly.
      const payload = Buffer.from('binary-chunk-payload');

      const res = await request(app)
        .post('/api/v1/admin/videos/upload/chunk')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/octet-stream')
        .query({ uploadId: 'test-upload-id', chunkIndex: '1' })
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.chunkIndex).toBe(1);
      expect(res.body.receivedBytes).toBe(payload.length);
    });

    it('should return 400 when uploadId or chunkIndex missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/upload/chunk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ chunkData: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('uploadId and chunkIndex are required');
    });

    it('should return 400 when chunk data missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/upload/chunk')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ uploadId: 'test-upload-id', chunkIndex: '0' })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Chunk data required');
    });
  });

  describe('POST /api/v1/admin/videos/upload/complete', () => {
    it('should complete upload with valid uploadId', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/upload/complete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ uploadId: 'test-upload-id' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('videoId', 1);
      expect(res.body).toHaveProperty('status', 'uploaded');
    });

    it('should return 400 when uploadId missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/upload/complete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('uploadId is required');
    });
  });

  describe('GET /api/v1/admin/videos', () => {
    it('should list videos with pagination', async () => {
      await createVideo({ title: 'Video A' });
      await createVideo({ title: 'Video B' });

      const res = await request(app)
        .get('/api/v1/admin/videos')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(2);
      expect(res.body.count).toBe(2);
      expect(res.body.page).toBe(1);
    });

    it('should support search by title', async () => {
      await createVideo({ title: 'Searchable Video' });
      await createVideo({ title: 'Other Video' });

      const res = await request(app)
        .get('/api/v1/admin/videos')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: 'Searchable' });

      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].title).toBe('Searchable Video');
    });

    it('should support pagination params', async () => {
      await createVideo({ title: 'Video 1' });
      await createVideo({ title: 'Video 2' });
      await createVideo({ title: 'Video 3' });

      const res = await request(app)
        .get('/api/v1/admin/videos')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, pageSize: 2 });

      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(2);
      expect(res.body.pageSize).toBe(2);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/admin/videos');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/admin/videos/:id', () => {
    it('should get video detail', async () => {
      const video = await createVideo({ title: 'Detail Video', description: 'A detailed video' });

      const res = await request(app)
        .get(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Detail Video');
      expect(res.body.description).toBe('A detailed video');
    });

    it('should return 404 for non-existent video', async () => {
      const res = await request(app)
        .get('/api/v1/admin/videos/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Video not found');
    });

    it('should return 400 for invalid id', async () => {
      const res = await request(app)
        .get('/api/v1/admin/videos/invalid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid video ID');
    });
  });

  describe('PUT /api/v1/admin/videos/:id', () => {
    it('should update video metadata', async () => {
      const video = await createVideo({ title: 'Old Title' });

      const res = await request(app)
        .put(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'New Title', description: 'New description' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('New Title');
      expect(res.body.description).toBe('New description');
    });

    it('should return 404 for non-existent video', async () => {
      const res = await request(app)
        .put('/api/v1/admin/videos/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid id', async () => {
      const res = await request(app)
        .put('/api/v1/admin/videos/invalid')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(400);
    });

    it('should update encryption policy fields (accessMode, offlineAllowed, keyTtlHours)', async () => {
      const video = await createVideo({ title: 'Policy Video' });

      const res = await request(app)
        .put(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ accessMode: 'code', offlineAllowed: false, keyTtlHours: 0 });

      expect(res.status).toBe(200);
      expect(res.body.accessMode).toBe('code');
      expect(res.body.offlineAllowed).toBe(false);
      expect(res.body.keyTtlHours).toBe(0);

      // Verify persistence: re-fetch and confirm values survived the round-trip.
      const refetch = await request(app)
        .get(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(refetch.status).toBe(200);
      expect(refetch.body.accessMode).toBe('code');
      expect(refetch.body.offlineAllowed).toBe(false);
      expect(refetch.body.keyTtlHours).toBe(0);
    });

    it('should leave unspecified policy fields unchanged when only some are sent', async () => {
      // Only update accessMode — offlineAllowed and keyTtlHours must keep their
      // current values rather than being reset to defaults.
      const video = await createVideo({
        title: 'Partial Video',
        offlineAllowed: false,
        keyTtlHours: 24,
      });

      const res = await request(app)
        .put(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ accessMode: 'open' });

      expect(res.status).toBe(200);
      expect(res.body.accessMode).toBe('open');
      expect(res.body.offlineAllowed).toBe(false);
      expect(res.body.keyTtlHours).toBe(24);
    });

    it('should return 400 for an invalid accessMode value', async () => {
      const video = await createVideo({ title: 'Bad Mode Video' });

      const res = await request(app)
        .put(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ accessMode: 'secret' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('accessMode');
    });

    it('should return 400 for a negative keyTtlHours', async () => {
      const video = await createVideo({ title: 'Bad TTL Video' });

      const res = await request(app)
        .put(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ keyTtlHours: -1 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('keyTtlHours');
    });

    it('should return 400 for a non-integer keyTtlHours', async () => {
      const video = await createVideo({ title: 'Fractional TTL Video' });

      const res = await request(app)
        .put(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ keyTtlHours: 1.5 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('keyTtlHours');
    });
  });

  describe('DELETE /api/v1/admin/videos/:id', () => {
    it('should soft delete video', async () => {
      const video = await createVideo({ title: 'To Delete' });

      const res = await request(app)
        .delete(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent video', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/videos/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid id', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/videos/invalid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should return 409 when the video is referenced by an active campaign', async () => {
      // Build an active campaign and link the video via the join table.
      const video = await createVideo({ title: 'Active Campaign Video' });
      const campaign = await createCampaign({ title: 'Active blocker', status: 'active' });
      await CampaignVideoModel.create({
        campaignId: campaign.id,
        videoId: video.id,
      } as any);

      const res = await request(app)
        .delete(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Conflict');
      expect(res.body.message).toContain('active campaigns');

      // Sanity: the video row must still exist (was not soft-deleted).
      const stillThere = await request(app)
        .get(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(stillThere.status).toBe(200);
    });

    it('should allow deletion when only draft/ended campaigns reference the video', async () => {
      const video = await createVideo({ title: 'Draft-referenced Video' });
      const draft = await createCampaign({ title: 'Draft', status: 'draft' });
      await CampaignVideoModel.create({
        campaignId: draft.id,
        videoId: video.id,
      } as any);

      const res = await request(app)
        .delete(`/api/v1/admin/videos/${video.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
