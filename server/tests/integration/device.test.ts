import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { createAdmin, createStore, createVideo, createDevice } from '../helpers';
import { signAccessToken } from '../../src/utils/jwt';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit';
import { DeviceModel } from '../../src/models';
import {
  calculateSyncDiff,
  getAuthorizedVideos,
  isVideoAuthorizedForStore,
  getVideoPlaylist,
  getVideoKey,
  getSegmentStream,
} from '../../src/services/sync-service';

// Mock sync-service functions that use raw SQL with MySQL's NOW() which SQLite doesn't support
vi.mock('../../src/services/sync-service', () => ({
  calculateSyncDiff: vi.fn(),
  getAuthorizedVideos: vi.fn(),
  isVideoAuthorizedForStore: vi.fn(),
  getVideoPlaylist: vi.fn(),
  getVideoKey: vi.fn(),
  getSegmentStream: vi.fn(),
}));

// Mock device-monitor to avoid foreign key constraint issues in SQLite
vi.mock('../../src/services/device-monitor', () => ({
  storeTelemetry: vi.fn().mockResolvedValue(undefined),
  TelemetryPayload: undefined,
}));

function getDeviceToken(deviceId: string, storeId: number | null = null): string {
  return signAccessToken({
    userId: 0,
    storeId,
    deviceId,
    role: 'operator',
  });
}

describe('Device API Routes', () => {
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

    // Set default mock return values
    vi.mocked(calculateSyncDiff).mockResolvedValue({ downloads: [], deletes: [] });
    vi.mocked(getAuthorizedVideos).mockResolvedValue([]);
    vi.mocked(isVideoAuthorizedForStore).mockResolvedValue(true);
    vi.mocked(getVideoPlaylist).mockResolvedValue('http://localhost:9000/video-encrypted/videos/1/playlist.m3u8');
    vi.mocked(getVideoKey).mockResolvedValue(Buffer.from('0123456789abcdef', 'hex'));
    vi.mocked(getSegmentStream).mockImplementation(() => {
      return Promise.resolve({
        pipe: (res: any) => { res.end('fake-ts-data'); },
      } as any);
    });
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('POST /api/v1/devices/register', () => {
    it('should register a new device', async () => {
      const res = await request(app)
        .post('/api/v1/devices/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ deviceName: 'Test Device', osVersion: 'Android 14' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('deviceId');
      expect(res.body).toHaveProperty('deviceToken');
      expect(typeof res.body.deviceId).toBe('string');
      expect(typeof res.body.deviceToken).toBe('string');
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/devices/register')
        .send({ deviceName: 'Test Device' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/devices/bind', () => {
    it('should bind device to store', async () => {
      const store = await createStore({ name: 'Bind Store' });
      const device = await createDevice({ deviceId: 'dev-bind-001' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/bind')
        .set('Authorization', `Bearer ${token}`)
        .send({ storeId: store.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent device', async () => {
      const store = await createStore({ name: 'No Device Store' });
      const token = getDeviceToken('non-existent-device');

      const res = await request(app)
        .post('/api/v1/devices/bind')
        .set('Authorization', `Bearer ${token}`)
        .send({ storeId: store.id });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Device not found');
    });

    it('should return 409 if store already has device bound', async () => {
      const store = await createStore({ name: 'Already Bound Store' });
      const device1 = await createDevice({ deviceId: 'dev-first-001', storeId: store.id });
      const device2 = await createDevice({ deviceId: 'dev-second-001' });
      const token = getDeviceToken(device2.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/bind')
        .set('Authorization', `Bearer ${token}`)
        .send({ storeId: store.id });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Store already has a device bound');
    });
  });

  describe('POST /api/v1/devices/sync', () => {
    it('should return 403 for unbound device', async () => {
      const device = await createDevice({ deviceId: 'dev-unbound-001' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ cachedVideoIds: [] });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Device not bound to store');
    });

    it('should return sync diff for bound device', async () => {
      const store = await createStore({ name: 'Sync Store' });
      const device = await createDevice({ deviceId: 'dev-sync-001', storeId: store.id });

      vi.mocked(calculateSyncDiff).mockResolvedValue({
        downloads: [{ videoId: 1, title: 'Test Video', fileSize: 1024, campaignId: 1, playlistUrl: 'videos/1/playlist.m3u8' }],
        deletes: [],
      });

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .post('/api/v1/devices/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ cachedVideoIds: [] });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('downloads');
      expect(res.body).toHaveProperty('deletes');
      expect(Array.isArray(res.body.downloads)).toBe(true);
      expect(Array.isArray(res.body.deletes)).toBe(true);
    });

    it('should return 400 when cachedVideoIds is not array', async () => {
      const store = await createStore({ name: 'Bad Sync Store' });
      const device = await createDevice({ deviceId: 'dev-bad-sync-001', storeId: store.id });
      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .post('/api/v1/devices/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ cachedVideoIds: 'not-array' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cachedVideoIds must be an array');
    });
  });

  describe('GET /api/v1/devices/videos', () => {
    it('should return 403 for unbound device', async () => {
      const device = await createDevice({ deviceId: 'dev-unbound-vid-001' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .get('/api/v1/devices/videos')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Device not bound to store');
    });

    it('should return authorized videos for bound device', async () => {
      const store = await createStore({ name: 'Video Store' });
      const device = await createDevice({ deviceId: 'dev-vid-001', storeId: store.id });

      vi.mocked(getAuthorizedVideos).mockResolvedValue([
        { id: 1, title: 'Campaign 1', startTime: new Date(), endTime: new Date(), videos: [{ id: 1, title: 'Video 1', fileSize: 1024, duration: 60, coverUrl: null }] },
      ]);

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .get('/api/v1/devices/videos')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('campaigns');
      expect(Array.isArray(res.body.campaigns)).toBe(true);
      expect(res.body.campaigns.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/devices/videos/:id/playlist', () => {
    it('should return presigned URL for authorized video', async () => {
      const store = await createStore({ name: 'Playlist Store' });
      const device = await createDevice({ deviceId: 'dev-playlist-001', storeId: store.id });
      const video = await createVideo({ title: 'Playlist Video' });

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/playlist`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('url');
    });

    it('should return 403 for unauthorized video', async () => {
      const store = await createStore({ name: 'No Auth Store' });
      const device = await createDevice({ deviceId: 'dev-no-auth-001', storeId: store.id });
      const video = await createVideo({ title: 'Unauthorized Video' });

      vi.mocked(isVideoAuthorizedForStore).mockResolvedValue(false);

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/playlist`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Not authorized');
    });

    it('should return 403 for unbound device', async () => {
      const device = await createDevice({ deviceId: 'dev-unbound-pl-001' });
      const video = await createVideo({ title: 'Some Video' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/playlist`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/devices/videos/:id/key', () => {
    it('should return AES key for authorized video', async () => {
      const store = await createStore({ name: 'Key Store' });
      const device = await createDevice({ deviceId: 'dev-key-001', storeId: store.id });
      const video = await createVideo({ title: 'Key Video' });

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/key`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/octet-stream');
    });

    it('should return 403 for unauthorized video', async () => {
      const store = await createStore({ name: 'No Key Auth Store' });
      const device = await createDevice({ deviceId: 'dev-no-key-auth-001', storeId: store.id });
      const video = await createVideo({ title: 'No Key Video' });

      vi.mocked(isVideoAuthorizedForStore).mockResolvedValue(false);

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/key`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Not authorized');
    });

    it('should return 404 when key not found', async () => {
      const store = await createStore({ name: 'Missing Key Store' });
      const device = await createDevice({ deviceId: 'dev-missing-key-001', storeId: store.id });
      const video = await createVideo({ title: 'Missing Key Video' });

      vi.mocked(getVideoKey).mockResolvedValue(null);

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/key`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Key not found');
    });
  });

  describe('GET /api/v1/devices/videos/:id/segment/:seq', () => {
    it('should return TS segment for authorized video', async () => {
      const store = await createStore({ name: 'Segment Store' });
      const device = await createDevice({ deviceId: 'dev-seg-001', storeId: store.id });
      const video = await createVideo({ title: 'Segment Video' });

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/segment/001`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('video/mp2t');
    });

    it('should return 403 for unauthorized video', async () => {
      const store = await createStore({ name: 'No Seg Auth Store' });
      const device = await createDevice({ deviceId: 'dev-no-seg-auth-001', storeId: store.id });
      const video = await createVideo({ title: 'No Seg Video' });

      vi.mocked(isVideoAuthorizedForStore).mockResolvedValue(false);

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/segment/001`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Not authorized');
    });

    it('should return 403 for an unbound device (no storeId in token)', async () => {
      const device = await createDevice({ deviceId: 'dev-seg-unbound-001' });
      const video = await createVideo({ title: 'Some Video' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/segment/001`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('should return 500 when the underlying stream lookup fails', async () => {
      const store = await createStore({ name: 'Stream Error Store' });
      const device = await createDevice({ deviceId: 'dev-seg-err-001', storeId: store.id });
      const video = await createVideo({ title: 'Stream Error Video' });

      vi.mocked(getSegmentStream).mockRejectedValueOnce(new Error('object not found in minio'));

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .get(`/api/v1/devices/videos/${video.id}/segment/999`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed');
      expect(res.body.message).toContain('object not found in minio');
    });

    it('should pass the requested sequence to getSegmentStream unchanged', async () => {
      const store = await createStore({ name: 'Seq Pass Store' });
      const device = await createDevice({ deviceId: 'dev-seq-001', storeId: store.id });
      const video = await createVideo({ title: 'Seq Video' });
      const token = getDeviceToken(device.deviceId, store.id);

      await request(app)
        .get(`/api/v1/devices/videos/${video.id}/segment/42`)
        .set('Authorization', `Bearer ${token}`);

      expect(getSegmentStream).toHaveBeenCalledWith(video.id, '42');
    });
  });

  describe('POST /api/v1/devices/videos/:id/report-play', () => {
    it('should accept play report for authorized video', async () => {
      const store = await createStore({ name: 'Report Store' });
      const device = await createDevice({ deviceId: 'dev-report-001', storeId: store.id });
      const video = await createVideo({ title: 'Report Video' });

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .post(`/api/v1/devices/videos/${video.id}/report-play`)
        .set('Authorization', `Bearer ${token}`)
        .send({ event: 'play', position: 0, duration: 120 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 for unauthorized video', async () => {
      const store = await createStore({ name: 'No Report Store' });
      const device = await createDevice({ deviceId: 'dev-no-report-001', storeId: store.id });
      const video = await createVideo({ title: 'No Report Video' });

      vi.mocked(isVideoAuthorizedForStore).mockResolvedValue(false);

      const token = getDeviceToken(device.deviceId, store.id);

      const res = await request(app)
        .post(`/api/v1/devices/videos/${video.id}/report-play`)
        .set('Authorization', `Bearer ${token}`)
        .send({ event: 'play', position: 0, duration: 120 });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Not authorized');
    });
  });

  describe('POST /api/v1/devices/sync/confirm', () => {
    it('should confirm downloaded videos', async () => {
      const device = await createDevice({ deviceId: 'dev-confirm-001' });
      const video = await createVideo({ title: 'Confirm Video' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/sync/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirmedVideoIds: [video.id] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify device localPaths was updated
      const updated = await DeviceModel.findOne({ where: { deviceId: device.deviceId } });
      expect(updated?.localPaths).toHaveProperty(String(video.id));
    });

    it('should return 400 when confirmedVideoIds is not array', async () => {
      const device = await createDevice({ deviceId: 'dev-bad-confirm-001' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/sync/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirmedVideoIds: 'not-array' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('confirmedVideoIds must be an array');
    });

    it('should return 403 without device ID in token', async () => {
      // Create a token without deviceId
      const noDeviceToken = signAccessToken({
        userId: 1,
        storeId: null,
        deviceId: null,
        role: 'operator',
      });

      const res = await request(app)
        .post('/api/v1/devices/sync/confirm')
        .set('Authorization', `Bearer ${noDeviceToken}`)
        .send({ confirmedVideoIds: [1] });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('No device ID in token');
    });

    it('should return 404 when the device in the token does not exist in DB', async () => {
      // Token claims a deviceId that has no DB row
      const token = getDeviceToken('dev-ghost-not-persisted');

      const res = await request(app)
        .post('/api/v1/devices/sync/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirmedVideoIds: [1] });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Device not found');
    });

    it('should persist multiple confirmed video ids in a single call', async () => {
      const device = await createDevice({ deviceId: 'dev-multi-confirm-001' });
      const v1 = await createVideo({ title: 'Multi V1' });
      const v2 = await createVideo({ title: 'Multi V2' });
      const v3 = await createVideo({ title: 'Multi V3' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/sync/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirmedVideoIds: [v1.id, v2.id, v3.id] });

      expect(res.status).toBe(200);
      const updated = await DeviceModel.findOne({ where: { deviceId: device.deviceId } });
      expect(updated?.localPaths).toHaveProperty(String(v1.id));
      expect(updated?.localPaths).toHaveProperty(String(v2.id));
      expect(updated?.localPaths).toHaveProperty(String(v3.id));
    });

    it('should accept an empty confirmedVideoIds array as a no-op', async () => {
      const device = await createDevice({ deviceId: 'dev-empty-confirm-001' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/sync/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirmedVideoIds: [] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/devices/telemetry', () => {
    it('should store telemetry data', async () => {
      const device = await createDevice({ deviceId: 'dev-tel-001' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/telemetry')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cpu: 45,
          memory: 60,
          disk: 70,
          diskFree: 30,
          cacheSize: 500,
          appVersion: '1.2.3',
          uptime: 3600,
          network: 'wifi',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 200 even with an empty body (HTTP fallback tolerates partial data)', async () => {
      // HTTP telemetry is best-effort: clients may report a subset of fields.
      // storeTelemetry defaults missing fields, so an empty body must still 200.
      const device = await createDevice({ deviceId: 'dev-tel-empty-001' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/telemetry')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should accept a single-field telemetry payload', async () => {
      const device = await createDevice({ deviceId: 'dev-tel-partial-001' });
      const token = getDeviceToken(device.deviceId);

      const res = await request(app)
        .post('/api/v1/devices/telemetry')
        .set('Authorization', `Bearer ${token}`)
        .send({ cpu: 12.5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should still return 200 for an unknown device (storeTelemetry warns but does not throw)', async () => {
      // The HTTP fallback path must not crash on unknown deviceIds — the
      // device-monitor service logs a warning and silently drops the row.
      const token = getDeviceToken('dev-tel-unknown-001');

      const res = await request(app)
        .post('/api/v1/devices/telemetry')
        .set('Authorization', `Bearer ${token}`)
        .send({ cpu: 1 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 without device ID in token', async () => {
      const noDeviceToken = signAccessToken({
        userId: 1,
        storeId: null,
        deviceId: null,
        role: 'operator',
      });

      const res = await request(app)
        .post('/api/v1/devices/telemetry')
        .set('Authorization', `Bearer ${noDeviceToken}`)
        .send({ cpu: 50 });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('No device ID in token');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases for the sync diff endpoint
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/devices/sync (extra)', () => {
    it('should pass cachedVideoIds to calculateSyncDiff unchanged', async () => {
      const store = await createStore({ name: 'Args Store' });
      const device = await createDevice({ deviceId: 'dev-sync-args-001', storeId: store.id });
      const token = getDeviceToken(device.deviceId, store.id);

      vi.mocked(calculateSyncDiff).mockClear();
      vi.mocked(calculateSyncDiff).mockResolvedValue({ downloads: [], deletes: [] });

      await request(app)
        .post('/api/v1/devices/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ cachedVideoIds: [10, 20, 30] });

      expect(calculateSyncDiff).toHaveBeenCalledWith(store.id, [10, 20, 30]);
    });

    it('should accept an empty cachedVideoIds array', async () => {
      const store = await createStore({ name: 'Empty Sync Store' });
      const device = await createDevice({ deviceId: 'dev-sync-empty-001', storeId: store.id });
      const token = getDeviceToken(device.deviceId, store.id);

      vi.mocked(calculateSyncDiff).mockResolvedValue({ downloads: [], deletes: [] });

      const res = await request(app)
        .post('/api/v1/devices/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ cachedVideoIds: [] });

      expect(res.status).toBe(200);
      expect(res.body.downloads).toEqual([]);
      expect(res.body.deletes).toEqual([]);
    });

    it('should return 500 when calculateSyncDiff throws', async () => {
      const store = await createStore({ name: 'Throw Sync Store' });
      const device = await createDevice({ deviceId: 'dev-sync-throw-001', storeId: store.id });
      const token = getDeviceToken(device.deviceId, store.id);

      vi.mocked(calculateSyncDiff).mockRejectedValueOnce(new Error('now() unsupported'));

      const res = await request(app)
        .post('/api/v1/devices/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ cachedVideoIds: [] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Sync failed');
      expect(res.body.message).toContain('now() unsupported');
    });
  });
});
