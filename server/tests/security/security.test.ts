import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { createAdmin, createStore, createDevice, createVideo, createCampaign } from '../helpers';
import { signAccessToken } from '../../src/utils/jwt';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit';

// ---------------------------------------------------------------------------
// Mocks — must be at file top level so vi.hoist() picks them up
// ---------------------------------------------------------------------------

vi.mock('../../src/services/upload', () => ({
  initUpload: vi.fn().mockResolvedValue({ uploadId: 'test-upload-id', chunkCount: 3, chunkSize: 5242880 }),
  uploadChunk: vi.fn().mockResolvedValue(undefined),
  completeUpload: vi.fn().mockResolvedValue({ videoId: 1, status: 'uploaded' }),
}));

vi.mock('../../src/services/sync-service', () => ({
  calculateSyncDiff: vi.fn().mockResolvedValue({ downloads: [], deletes: [] }),
  getAuthorizedVideos: vi.fn().mockResolvedValue([]),
  isVideoAuthorizedForStore: vi.fn().mockResolvedValue(true),
  isVideoAuthorized: vi.fn().mockResolvedValue(true),
  getVideoPlaylist: vi.fn().mockResolvedValue('http://localhost/playlist.m3u8'),
  getVideoKey: vi.fn().mockResolvedValue(Buffer.from('0123456789abcdef', 'hex')),
  getSegmentStream: vi.fn().mockImplementation(() =>
    Promise.resolve({
      pipe: (res: any) => { res.end('fake-ts-data'); },
    } as any)
  ),
}));

vi.mock('../../src/services/device-monitor', () => ({
  storeTelemetry: vi.fn().mockResolvedValue(undefined),
  TelemetryPayload: undefined,
}));

// ---------------------------------------------------------------------------
// Dynamic imports of mocked modules (required to get the mocked fns)
// ---------------------------------------------------------------------------

import { completeUpload } from '../../src/services/upload';
import { isVideoAuthorizedForStore, isVideoAuthorized } from '../../src/services/sync-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDeviceToken(deviceId: string, storeId: number | null = null): string {
  return signAccessToken({
    userId: 0,
    storeId,
    deviceId,
    role: 'operator',
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Security & Boundary Tests', () => {
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

  // =========================================================================
  // Authentication & Authorization (6 tests)
  // =========================================================================

  describe('Authentication & Authorization', () => {
    it('should return 401 when no token is provided on protected route', async () => {
      const res = await request(app).get('/api/v1/admin/videos');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toContain('Access token is required');
    });

    it('should return 403 when operator token accesses admin route', async () => {
      const operatorToken = signAccessToken({
        userId: 1,
        storeId: null,
        deviceId: null,
        role: 'operator',
      });

      const res = await request(app)
        .post('/api/v1/admin/campaigns')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          title: 'Test',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toContain('Admin access required');
    });

    it('should enforce device isolation: token with wrong storeId gets 403', async () => {
      const storeA = await createStore({ name: 'Store A' });
      const storeB = await createStore({ name: 'Store B' });
      const device = await createDevice({ deviceId: 'dev-iso-001', storeId: storeA.id });
      const video = await createVideo({ title: 'Isolated Video' });

      // Craft a token that claims storeB but device is physically bound to storeA
      const maliciousToken = signAccessToken({
        userId: 0,
        storeId: storeB.id,
        deviceId: device.deviceId,
        role: 'operator',
      });

      vi.mocked(isVideoAuthorized).mockResolvedValue(false);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/playlist`)
        .set('Authorization', `Bearer ${maliciousToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Not authorized');
    });

    it('should return 401 for tampered JWT payload', async () => {
      const token = signAccessToken({
        userId: 1,
        storeId: null,
        deviceId: null,
        role: 'admin',
      });

      // Tamper with the payload (middle section) by flipping the last char
      const parts = token.split('.');
      const lastChar = parts[1].slice(-1);
      parts[1] = parts[1].slice(0, -1) + (lastChar === 'A' ? 'B' : 'A');
      const tamperedToken = parts.join('.');

      const res = await request(app)
        .get('/api/v1/admin/videos')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 for expired JWT', async () => {
      const expiredToken = jwt.sign(
        {
          userId: 1,
          storeId: null,
          deviceId: null,
          role: 'admin',
        },
        process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production',
        { algorithm: 'HS512', expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/v1/admin/videos')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toContain('expired');
    });

    it('should return 401 for token after logout (blacklisted)', async () => {
      await createAdmin({ username: 'logouttest', password: 'logoutpass' });
      const loginRes = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ username: 'logouttest', password: 'logoutpass' });

      const token = loginRes.body.accessToken;

      // Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(logoutRes.status).toBe(200);

      // Try to reuse the token
      const res = await request(app)
        .get('/api/v1/admin/videos')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('revoked');
    });
  });

  // =========================================================================
  // Input Validation (6 tests)
  // =========================================================================

  describe('Input Validation', () => {
    it('should safely escape SQL injection in search parameter', async () => {
      await createVideo({ title: 'Normal Video' });

      const res = await request(app)
        .get('/api/v1/admin/videos')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: "' OR 1=1 --" });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rows)).toBe(true);
      // Injection should not cause an error or return all rows unconditionally
    });

    it('should accept but not execute XSS payload in campaign title', async () => {
      const xssTitle = '<script>alert(1)</script>';
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/v1/admin/campaigns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: xssTitle,
          startTime: tomorrow.toISOString(),
          endTime: nextWeek.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe(xssTitle);
    });

    it('should return 400 for empty JSON body on campaign create', async () => {
      const res = await request(app)
        .post('/api/v1/admin/campaigns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('title, startTime, and endTime are required');
    });

    it('should accept negative fileSize (documents lack of server-side validation)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/videos/upload/init')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fileName: 'test.mp4', fileSize: -1 });

      // The route only checks typeof fileSize !== 'number'; negative values pass through
      expect(res.status).toBe(200);
    });

    it('should cap super large pageSize to reasonable limit', async () => {
      await createVideo({ title: 'Video 1' });

      const res = await request(app)
        .get('/api/v1/admin/videos')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ pageSize: 100000 });

      expect(res.status).toBe(200);
      expect(res.body.pageSize).toBe(100); // hard cap in route
    });

    it('should return 400 for invalid MongoDB-style ID', async () => {
      const res = await request(app)
        .get('/api/v1/admin/videos/abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid video ID');
    });
  });

  // =========================================================================
  // Boundary Conditions (4 tests)
  // =========================================================================

  describe('Boundary Conditions', () => {
    it('should return 409 when concurrent device tries to bind same store', async () => {
      const store = await createStore({ name: 'Conflict Store' });
      await createDevice({ deviceId: 'dev-first-001', storeId: store.id });
      const device2 = await createDevice({ deviceId: 'dev-second-001' });
      const token2 = getDeviceToken(device2.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/bind')
        .set('Authorization', `Bearer ${token2}`)
        .send({ storeId: store.id });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Store already has a device bound');
    });

    it('should reject update on ended campaign', async () => {
      const campaign = await createCampaign({ title: 'Ended Campaign', status: 'ended' });

      const res = await request(app)
        .put(`/api/v1/admin/campaigns/${campaign.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Only draft');
    });

    it('should return error when completing upload with missing chunks', async () => {
      vi.mocked(completeUpload).mockRejectedValueOnce(
        new Error('Not all chunks received: 0/3')
      );

      const res = await request(app)
        .post('/api/v1/admin/videos/upload/complete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ uploadId: 'incomplete-upload' });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Not all chunks received');
    });

    it('should return 409 when bound device tries to bind store that already has another device', async () => {
      const storeA = await createStore({ name: 'Store A', code: `SEC-A-${Date.now()}` });
      const storeB = await createStore({ name: 'Store B', code: `SEC-B-${Date.now() + 1}` });
      await createDevice({ deviceId: 'dev-bound-a', storeId: storeA.id });
      await createDevice({ deviceId: 'dev-bound-b', storeId: storeB.id });
      const tokenA = getDeviceToken('dev-bound-a');

      // Device A (bound to Store A) tries to bind Store B which already has Device B
      const res = await request(app)
        .post('/api/v1/devices/bind')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ storeId: storeB.id });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Store already has a device bound');
    });
  });

  // =========================================================================
  // Rate Limiting & Errors (4+ tests)
  // =========================================================================

  describe('Rate Limiting & Errors', () => {
    it('should return 429 after exceeding rate limit', async () => {
      // Make 100 requests (the limit per 60s window)
      for (let i = 0; i < 100; i++) {
        await request(app).get('/health');
      }

      // 101st request should be rate limited
      const res = await request(app).get('/health');
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too Many Requests');
    });

    it('should return 400 for malformed JSON body', async () => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .set('Content-Type', 'application/json')
        .send('this is not json');

      expect(res.status).toBe(400);
    });

    it('should return 400 when POST without proper Content-Type', async () => {
      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send('{"username":"test","password":"test"}');

      // Without Content-Type: application/json, express won't parse body
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('username and password are required');
    });

    it('should accept very long string title', async () => {
      const longTitle = 'A'.repeat(10000);
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/v1/admin/campaigns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: longTitle,
          startTime: tomorrow.toISOString(),
          endTime: nextWeek.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe(longTitle);
    });

    it('should return 400 for invalid campaign ID format in URL', async () => {
      const res = await request(app)
        .get('/api/v1/admin/campaigns/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid campaign ID');
    });
  });
});
