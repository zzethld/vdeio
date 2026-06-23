import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { createAdmin, createVideo } from '../helpers';
import { signAccessToken } from '../../src/utils/jwt';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit';

describe('Admin Access Code Routes', () => {
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

  describe('POST /api/v1/admin/videos/:id/codes', () => {
    it('should create an access code for a video', async () => {
      const video = await createVideo();
      const code = `CODE-${Date.now()}`;

      const res = await request(app)
        .post(`/api/v1/admin/videos/${video.id}/codes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code, maxUses: 5 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        code,
        videoId: video.id,
        maxUses: 5,
        status: 'active',
      });
    });

    it('should return 404 when the video does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/999999/codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: `CODE-${Date.now()}` });

      expect(res.status).toBe(404);
    });

    it('should return 403 for a non-admin token', async () => {
      const video = await createVideo();
      const operatorToken = signAccessToken({
        userId: 1,
        storeId: null,
        deviceId: null,
        role: 'operator',
      });

      const res = await request(app)
        .post(`/api/v1/admin/videos/${video.id}/codes`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ code: `CODE-${Date.now()}` });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/admin/videos/:id/codes', () => {
    it('should list access codes for a video', async () => {
      const video = await createVideo();
      const code1 = `CODE-${Date.now()}-1`;
      const code2 = `CODE-${Date.now()}-2`;

      await request(app)
        .post(`/api/v1/admin/videos/${video.id}/codes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: code1 });

      await request(app)
        .post(`/api/v1/admin/videos/${video.id}/codes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: code2 });

      const res = await request(app)
        .get(`/api/v1/admin/videos/${video.id}/codes`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('codes');
      expect(Array.isArray(res.body.codes)).toBe(true);
      expect(res.body.codes).toHaveLength(2);
      expect(res.body.codes.map((c: { code: string }) => c.code).sort()).toEqual(
        [code1, code2].sort(),
      );
    });
  });

  describe('PUT /api/v1/admin/codes/:id', () => {
    it('should disable an access code', async () => {
      const video = await createVideo();
      const createRes = await request(app)
        .post(`/api/v1/admin/videos/${video.id}/codes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: `CODE-${Date.now()}` });

      const codeId = createRes.body.id;

      const updateRes = await request(app)
        .put(`/api/v1/admin/codes/${codeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'disabled' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.status).toBe('disabled');
    });
  });

  describe('DELETE /api/v1/admin/codes/:id', () => {
    it('should delete an access code', async () => {
      const video = await createVideo();
      const createRes = await request(app)
        .post(`/api/v1/admin/videos/${video.id}/codes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: `CODE-${Date.now()}` });

      const codeId = createRes.body.id;

      const deleteRes = await request(app)
        .delete(`/api/v1/admin/codes/${codeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteRes.status).toBe(204);

      const listRes = await request(app)
        .get(`/api/v1/admin/videos/${video.id}/codes`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.body.codes).toHaveLength(0);
    });
  });
});
