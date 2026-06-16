import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { createAdmin, createDevice, createVideo, createCampaign } from '../helpers';

// Bypass rate limiting for integration tests
vi.mock('../../src/middleware/rate-limit', () => ({
  rateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

describe('Admin Auth + Dashboard Routes', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/admin/auth/login
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/admin/auth/login', () => {
    it('should return 200 with accessToken for correct credentials', async () => {
      await createAdmin({ username: 'admin1', password: 'secret123' });

      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'admin1', password: 'secret123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('admin');
      expect(res.body.admin).toHaveProperty('id');
      expect(res.body.admin).toHaveProperty('username', 'admin1');
      expect(res.body.admin).toHaveProperty('name');
      expect(res.body.admin).toHaveProperty('role');
    });

    it('should return 401 for wrong password', async () => {
      await createAdmin({ username: 'admin2', password: 'correctpass' });

      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'admin2', password: 'wrongpass' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toContain('Invalid credentials');
    });

    it('should return 401 for non-existent username', async () => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'nonexistent', password: 'anypass' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toContain('Invalid credentials');
    });

    it('should return 400 when username is missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ password: 'somepass' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('username and password are required');
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'someuser' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('username and password are required');
    });

    it('should return 400 when both fields are missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('username and password are required');
    });

    it('should lock account after 5 failed attempts', async () => {
      await createAdmin({ username: 'lockme', password: 'realpass' });

      // 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/admin/auth/login')
          .send({ username: 'lockme', password: 'wrongpass' });

        if (i < 4) {
          expect(res.status).toBe(401);
        } else {
          // 5th attempt should trigger lockout
          expect(res.status).toBe(401);
        }
      }

      // 6th attempt should be locked (403)
      const lockedRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'lockme', password: 'wrongpass' });

      expect(lockedRes.status).toBe(403);
      expect(lockedRes.body.error).toBe('Forbidden');
      expect(lockedRes.body.message).toContain('Account locked');
      expect(lockedRes.body).toHaveProperty('lockedUntil');

      // Even correct password should be rejected while locked
      const correctRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'lockme', password: 'realpass' });

      expect(correctRes.status).toBe(403);
      expect(correctRes.body.error).toBe('Forbidden');
      expect(correctRes.body.message).toContain('Account locked');
    });

    it('should reset loginFailCount on successful login', async () => {
      await createAdmin({ username: 'resetme', password: 'mypass' });

      // 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/admin/auth/login')
          .send({ username: 'resetme', password: 'wrongpass' });
      }

      // Successful login should reset the counter
      const successRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'resetme', password: 'mypass' });

      expect(successRes.status).toBe(200);
      expect(successRes.body).toHaveProperty('accessToken');

      // Failed attempts counter should be reset, so next wrong password
      // should NOT immediately lock (needs 5 more fails)
      const failRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'resetme', password: 'wrongpass' });

      expect(failRes.status).toBe(401);
      expect(failRes.body.error).toBe('Unauthorized');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/admin/dashboard/stats
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/admin/dashboard/stats', () => {
    it('should return 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard/stats');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 when token is invalid', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard/stats')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 200 with stats object for valid admin token', async () => {
      // Seed some data
      await createVideo({ title: 'Video 1' });
      await createVideo({ title: 'Video 2' });
      await createCampaign({ status: 'active', title: 'Active Campaign 1' });
      await createCampaign({ status: 'active', title: 'Active Campaign 2' });
      await createCampaign({ status: 'draft', title: 'Draft Campaign' });
      await createDevice({ status: 'online', deviceId: 'dev-online-1' });
      await createDevice({ status: 'offline', deviceId: 'dev-offline-1' });

      // Create admin and login
      await createAdmin({ username: 'dashadmin', password: 'dashpass' });
      const loginRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'dashadmin', password: 'dashpass' });

      const accessToken = loginRes.body.accessToken;

      const res = await request(app)
        .get('/api/v1/admin/dashboard/stats')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalVideos', 2);
      expect(res.body).toHaveProperty('activeCampaigns', 2);
      expect(res.body).toHaveProperty('onlineDevices', 1);
      expect(res.body).toHaveProperty('totalDevices', 2);
      expect(res.body).toHaveProperty('offlineDevices', 1);
      expect(res.body).toHaveProperty('newVideosToday');
      expect(typeof res.body.newVideosToday).toBe('number');
      expect(res.body).toHaveProperty('campaignDistribution');
      expect(Array.isArray(res.body.campaignDistribution)).toBe(true);
    });

    it('should return empty stats when no data exists', async () => {
      await createAdmin({ username: 'emptyadmin', password: 'emptypass' });
      const loginRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'emptyadmin', password: 'emptypass' });

      const accessToken = loginRes.body.accessToken;

      const res = await request(app)
        .get('/api/v1/admin/dashboard/stats')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalVideos', 0);
      expect(res.body).toHaveProperty('activeCampaigns', 0);
      expect(res.body).toHaveProperty('onlineDevices', 0);
      expect(res.body).toHaveProperty('totalDevices', 0);
      expect(res.body).toHaveProperty('offlineDevices', 0);
      expect(res.body).toHaveProperty('newVideosToday', 0);
      expect(res.body).toHaveProperty('campaignDistribution');
      expect(res.body.campaignDistribution).toEqual([]);
    });
  });
});
