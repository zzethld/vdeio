import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { redis, setWithExpiry } from '../../src/config/redis';
import { signAccessToken, signRefreshToken } from '../../src/utils/jwt';

// Bypass rate limiting for integration tests
vi.mock('../../src/middleware/rate-limit', () => ({
  rateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

describe('Auth Routes', () => {
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
  // GET /api/v1/auth/dingtalk/qrcode
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/auth/dingtalk/qrcode', () => {
    it('should return qrCodeUrl and state', async () => {
      const res = await request(app).get('/api/v1/auth/dingtalk/qrcode');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('qrCodeUrl');
      expect(res.body).toHaveProperty('state');
      expect(typeof res.body.qrCodeUrl).toBe('string');
      expect(typeof res.body.state).toBe('string');
      // In mock mode (no DINGTALK_APP_KEY), qrCodeUrl is empty but state is still generated
      if (!res.body.mockMode) {
        expect(res.body.qrCodeUrl).toContain(res.body.state);
      }
    });

    it('should store state in Redis as pending', async () => {
      const res = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = res.body;

      const stateValue = await redis.get(`dingtalk:state:${state}`);
      expect(stateValue).toBe('pending');
    });

    it('should advertise mockMode=true when DINGTALK_APP_KEY is unset', async () => {
      // The test environment does not provide DINGTALK_APP_KEY, so the service
      // must advertise mock mode and return an empty qrCodeUrl. The state must
      // still be a fresh UUID stored in Redis so the rest of the flow works.
      const res = await request(app).get('/api/v1/auth/dingtalk/qrcode');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('mockMode', true);
      expect(res.body.qrCodeUrl).toBe('');
      expect(res.body.state).toBeTruthy();
      expect(res.body.state).toMatch(/^[0-9a-f-]{36}$/i); // UUIDv4

      // State is still persisted for the callback/poll flow
      const stored = await redis.get(`dingtalk:state:${res.body.state}`);
      expect(stored).toBe('pending');
    });

    it('should produce a unique state per request', async () => {
      const r1 = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const r2 = await request(app).get('/api/v1/auth/dingtalk/qrcode');

      expect(r1.body.state).not.toBe(r2.body.state);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/mock-login
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/mock-login', () => {
    it('should return real JWT tokens with storeId', async () => {
      const res = await request(app).post('/api/v1/auth/mock-login');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('name');
      expect(res.body.user).toHaveProperty('role');
      expect(res.body).toHaveProperty('storeId');
      expect(res.body).toHaveProperty('deviceId');
    });

    it('should be idempotent — same user on repeated calls', async () => {
      const res1 = await request(app).post('/api/v1/auth/mock-login');
      const res2 = await request(app).post('/api/v1/auth/mock-login');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.user.id).toBe(res2.body.user.id);
      expect(res1.body.deviceId).toBe(res2.body.deviceId);
    });

    it('should return tokens that pass authMiddleware', async () => {
      const loginRes = await request(app).post('/api/v1/auth/mock-login');
      const { accessToken } = loginRes.body;

      // Use the token to access an authenticated endpoint
      const res = await request(app)
        .get('/api/v1/devices/videos')
        .set('Authorization', `Bearer ${accessToken}`);

      // 200 = token verified + storeId valid; 403 = token verified but no videos assigned
      // Either way, NOT 401 (which would mean token is invalid)
      expect(res.status).not.toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/dingtalk/callback
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/dingtalk/callback', () => {
    it('should create user, auto-create device, and return success in mock mode', async () => {
      // Step 1: Get a valid state from qrcode endpoint
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      // Step 2: Call callback with valid state and authCode
      const res = await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ state, authCode: 'mock-auth-code-123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);

      // Verify state was updated in Redis with success data
      const stateValue = await redis.get(`dingtalk:state:${state}`);
      expect(stateValue).not.toBe('pending');
      const stateData = JSON.parse(stateValue!);
      expect(stateData.status).toBe('success');
      expect(stateData).toHaveProperty('accessToken');
      expect(stateData).toHaveProperty('refreshToken');
      expect(stateData).toHaveProperty('user');
      expect(stateData.user).toHaveProperty('id');
      expect(stateData.user).toHaveProperty('name', 'Mock User');
      expect(stateData).toHaveProperty('deviceId');
    });

    it('should return 400 when state is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ authCode: 'mock-auth-code' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('state and authCode are required');
    });

    it('should return 400 when authCode is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ state: 'some-state' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('state and authCode are required');
    });

    it('should return 400 for invalid or expired state', async () => {
      const res = await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ state: 'invalid-state-123', authCode: 'mock-auth-code' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('Invalid or expired state');
    });

    it('should update existing user on subsequent callbacks', async () => {
      // First callback creates user
      const qrcodeRes1 = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const state1 = qrcodeRes1.body.state;

      await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ state: state1, authCode: 'same-user-code' });

      const stateValue1 = await redis.get(`dingtalk:state:${state1}`);
      const stateData1 = JSON.parse(stateValue1!);
      const userId = stateData1.user.id;

      // Second callback with same dingtalkId should find and update existing user
      const qrcodeRes2 = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const state2 = qrcodeRes2.body.state;

      const res2 = await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ state: state2, authCode: 'same-user-code' });

      expect(res2.status).toBe(200);

      const stateValue2 = await redis.get(`dingtalk:state:${state2}`);
      const stateData2 = JSON.parse(stateValue2!);
      expect(stateData2.user.id).toBe(userId);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/auth/dingtalk/callback — DingTalk redirect landing page (HTML)
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/auth/dingtalk/callback (HTML landing page)', () => {
    it('should return an HTML success page with UTF-8 text/html content type', async () => {
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      const res = await request(app)
        .get('/api/v1/auth/dingtalk/callback')
        .query({ state, authCode: 'get-callback-html-code' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      // Body must be HTML, not JSON
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('登录成功');
    });

    it('should run the same login flow as POST callback (state becomes success in Redis)', async () => {
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      await request(app)
        .get('/api/v1/auth/dingtalk/callback')
        .query({ state, authCode: 'get-flow-code' });

      const stored = await redis.get(`dingtalk:state:${state}`);
      expect(stored).not.toBe('pending');
      const parsed = JSON.parse(stored!);
      expect(parsed.status).toBe('success');
      expect(parsed).toHaveProperty('accessToken');
      expect(parsed).toHaveProperty('refreshToken');
    });

    it('should accept ?code= as an alias for ?authCode=', async () => {
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      const res = await request(app)
        .get('/api/v1/auth/dingtalk/callback')
        .query({ state, code: 'alias-code-123' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('登录成功');

      // state should now be successful in Redis
      const stored = await redis.get(`dingtalk:state:${state}`);
      expect(JSON.parse(stored!).status).toBe('success');
    });

    it('should return 400 HTML when state is missing', async () => {
      const res = await request(app)
        .get('/api/v1/auth/dingtalk/callback')
        .query({ authCode: 'no-state-code' });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('参数缺失');
    });

    it('should return 400 HTML when authCode is missing', async () => {
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      const res = await request(app)
        .get('/api/v1/auth/dingtalk/callback')
        .query({ state });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('参数缺失');
    });

    it('should return error HTML for invalid or expired state', async () => {
      const res = await request(app)
        .get('/api/v1/auth/dingtalk/callback')
        .query({ state: 'expired-state-zzz', authCode: 'some-code' });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('登录失败');
      expect(res.text).toContain('Invalid or expired state');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/auth/poll
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/auth/poll', () => {
    it('should return pending initially', async () => {
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      const res = await request(app).get('/api/v1/auth/poll').query({ state });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'pending');
    });

    it('should return success with tokens after callback', async () => {
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      // Trigger callback
      await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ state, authCode: 'poll-test-code' });

      // Poll should now return success
      const res = await request(app).get('/api/v1/auth/poll').query({ state });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('name');
      expect(res.body).toHaveProperty('storeId');
    });

    it('should return 400 when state is missing', async () => {
      const res = await request(app).get('/api/v1/auth/poll');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('state query parameter is required');
    });

    it('should return 400 for invalid or expired state', async () => {
      const res = await request(app)
        .get('/api/v1/auth/poll')
        .query({ state: 'nonexistent-state' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('Invalid or expired state');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/refresh
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/refresh', () => {
    it('should blacklist old refresh token and return new tokens', async () => {
      // Get tokens via full auth flow
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ state, authCode: 'refresh-test-code' });

      const pollRes = await request(app).get('/api/v1/auth/poll').query({ state });
      const { refreshToken } = pollRes.body;

      // Refresh token — should succeed (200) with new access + refresh tokens
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');

      // Old refresh token should now be blacklisted
      const retryRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(retryRes.status).toBe(401);
      expect(retryRes.body.message).toContain('revoked');
    });

    it('should blacklist old refresh token after refresh', async () => {
      // Get tokens
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ state, authCode: 'blacklist-test-code' });

      const pollRes = await request(app).get('/api/v1/auth/poll').query({ state });
      const { refreshToken } = pollRes.body;

      // Refresh once
      await request(app).post('/api/v1/auth/refresh').send({ refreshToken });

      // Old refresh token should now be blacklisted
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toContain('revoked');
    });

    it('should return 400 when refreshToken is missing', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('refreshToken is required');
    });

    it('should return 401 for invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'totally.invalid.token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should reject a refresh token that was manually blacklisted before the call', async () => {
      // Issue a refresh token directly, then push it onto the blacklist (simulating
      // a prior /refresh or logout rotation), and verify /refresh refuses it.
      const refreshToken = signRefreshToken({
        userId: 1,
        storeId: null,
        deviceId: 'dev-manual-bl',
        role: 'operator',
      });
      await setWithExpiry(`jwt:blacklist:${refreshToken}`, 'revoked', 604800);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toContain('revoked');
    });

    it('should reject a blacklisted access token presented as a refresh token', async () => {
      // A blacklisted access token cannot serve as a refresh token: even though
      // it is on the blacklist, /refresh checks the blacklist first AND then
      // verifies the signature. An access token signed with the access secret
      // will fail refresh-token verification regardless of blacklist state.
      const accessToken = signAccessToken({
        userId: 1,
        storeId: null,
        deviceId: 'dev-at-as-rt',
        role: 'operator',
      });
      await setWithExpiry(`jwt:blacklist:${accessToken}`, 'revoked', 7200);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: accessToken });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/logout
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/auth/logout', () => {
    it('should blacklist access token and return success', async () => {
      // Get tokens via full auth flow
      const qrcodeRes = await request(app).get('/api/v1/auth/dingtalk/qrcode');
      const { state } = qrcodeRes.body;

      await request(app)
        .post('/api/v1/auth/dingtalk/callback')
        .send({ state, authCode: 'logout-test-code' });

      const pollRes = await request(app).get('/api/v1/auth/poll').query({ state });
      const { accessToken } = pollRes.body;

      // Logout
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);

      // Verify token is blacklisted by trying to use it
      const protectedRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(protectedRes.status).toBe(401);
      expect(protectedRes.body.message).toContain('revoked');
    });

    it('should return 401 when no authorization header is provided', async () => {
      const res = await request(app).post('/api/v1/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 when authorization header is malformed', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Basic invalid');

      // authMiddleware runs first and returns 401 for non-Bearer tokens
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toContain('Access token is required');
    });
  });
});
