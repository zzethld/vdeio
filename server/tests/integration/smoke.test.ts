import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { createAdmin, createStore, createVideo, createDevice } from '../helpers';
import { signAccessToken } from '../../src/utils/jwt';

// Bypass rate limiting for the smoke test so repeated login attempts don't lock the account.
vi.mock('../../src/middleware/rate-limit', () => ({
  rateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Mock the upload service to avoid real filesystem/MinIO/Redis operations.
vi.mock('../../src/services/upload', () => ({
  initUpload: vi.fn().mockResolvedValue({
    uploadId: 'smoke-upload-id',
    chunkCount: 1,
    chunkSize: 5242880,
  }),
  uploadChunk: vi.fn().mockResolvedValue(undefined),
  completeUpload: vi.fn().mockResolvedValue({ videoId: 1, status: 'uploaded' }),
}));

describe('Admin Workflow Smoke Test', () => {
  let adminToken: string;

  beforeAll(async () => {
    await initTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    const admin = await createAdmin({ username: 'admin', password: 'admin123' });
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

  it('should exercise the full admin workflow end-to-end', async () => {
    // -------------------------------------------------------------------------
    // 1. Admin Login
    // -------------------------------------------------------------------------
    const loginRes = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('accessToken');
    expect(typeof loginRes.body.accessToken).toBe('string');

    // -------------------------------------------------------------------------
    // 2. Store CRUD
    // -------------------------------------------------------------------------
    const createStoreRes = await request(app)
      .post('/api/v1/admin/stores')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Smoke Test Store',
        code: 'SMOKE-001',
        region: '华东',
        address: 'Smoke Test Address',
        status: 1,
      });

    expect(createStoreRes.status).toBe(201);
    expect(createStoreRes.body).toHaveProperty('id');
    expect(createStoreRes.body.name).toBe('Smoke Test Store');
    const storeId = createStoreRes.body.id;

    const listStoresRes = await request(app)
      .get('/api/v1/admin/stores')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listStoresRes.status).toBe(200);
    expect(listStoresRes.body).toHaveProperty('rows');
    expect(listStoresRes.body).toHaveProperty('count');
    expect(listStoresRes.body.rows.some((s: any) => s.id === storeId)).toBe(true);

    const updateStoreRes = await request(app)
      .put(`/api/v1/admin/stores/${storeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Smoke Test Store Updated' });

    expect(updateStoreRes.status).toBe(200);
    expect(updateStoreRes.body.name).toBe('Smoke Test Store Updated');

    // -------------------------------------------------------------------------
    // 3. Video Upload Flow
    // -------------------------------------------------------------------------
    const initRes = await request(app)
      .post('/api/v1/admin/videos/upload/init')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'smoke.mp4', fileSize: 1024 * 1024 * 10 });

    expect(initRes.status).toBe(200);
    expect(initRes.body).toHaveProperty('uploadId', 'smoke-upload-id');
    expect(initRes.body).toHaveProperty('chunkCount', 1);

    const chunkRes = await request(app)
      .post('/api/v1/admin/videos/upload/chunk')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ uploadId: 'smoke-upload-id', chunkIndex: '0' })
      .send({ chunkData: Buffer.from('smoke chunk data').toString('base64') });

    expect(chunkRes.status).toBe(200);
    expect(chunkRes.body).toHaveProperty('chunkIndex', 0);
    expect(chunkRes.body).toHaveProperty('chunkCount');
    expect(chunkRes.body).toHaveProperty('receivedBytes');
    expect(chunkRes.body).toHaveProperty('totalBytes');

    const completeRes = await request(app)
      .post('/api/v1/admin/videos/upload/complete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ uploadId: 'smoke-upload-id' });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body).toHaveProperty('videoId');
    expect(completeRes.body).toHaveProperty('status', 'uploaded');

    // -------------------------------------------------------------------------
    // 4. Video Delete (unreferenced video)
    // -------------------------------------------------------------------------
    const unreferencedVideo = await createVideo({ title: 'Smoke Delete Video' });

    const deleteRes = await request(app)
      .delete(`/api/v1/admin/videos/${unreferencedVideo.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toHaveProperty('success', true);

    // -------------------------------------------------------------------------
    // 5. Campaign Lifecycle
    // -------------------------------------------------------------------------
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const createCampaignRes = await request(app)
      .post('/api/v1/admin/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Smoke Campaign',
        description: 'Smoke test campaign',
        startTime: tomorrow.toISOString(),
        endTime: nextWeek.toISOString(),
      });

    expect(createCampaignRes.status).toBe(201);
    expect(createCampaignRes.body).toHaveProperty('id');
    expect(createCampaignRes.body.status).toBe('draft');
    const campaignId = createCampaignRes.body.id;

    const campaignVideo = await createVideo({ title: 'Smoke Campaign Video' });
    const campaignStore = await createStore({ name: 'Smoke Campaign Store' });

    const addVideoRes = await request(app)
      .post(`/api/v1/admin/campaigns/${campaignId}/videos`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ videoIds: [campaignVideo.id] });

    expect(addVideoRes.status).toBe(204);

    const addStoreRes = await request(app)
      .post(`/api/v1/admin/campaigns/${campaignId}/stores`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ storeIds: [campaignStore.id] });

    expect(addStoreRes.status).toBe(204);

    const publishRes = await request(app)
      .post(`/api/v1/admin/campaigns/${campaignId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.status).toBe('active');

    // -------------------------------------------------------------------------
    // 6. Dashboard Stats
    // -------------------------------------------------------------------------
    const dashboardRes = await request(app)
      .get('/api/v1/admin/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body).toHaveProperty('totalVideos');
    expect(dashboardRes.body).toHaveProperty('activeCampaigns');
    expect(dashboardRes.body).toHaveProperty('onlineDevices');
    expect(dashboardRes.body).toHaveProperty('totalDevices');
    expect(dashboardRes.body).toHaveProperty('offlineDevices');
    expect(dashboardRes.body).toHaveProperty('newVideosToday');
    expect(dashboardRes.body).toHaveProperty('campaignDistribution');
    expect(Array.isArray(dashboardRes.body.campaignDistribution)).toBe(true);

    // -------------------------------------------------------------------------
    // 7. Device List
    // -------------------------------------------------------------------------
    await createDevice({ deviceId: 'smoke-device-001', status: 'online' });

    const devicesRes = await request(app)
      .get('/api/v1/admin/devices')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(devicesRes.status).toBe(200);
    expect(devicesRes.body).toHaveProperty('rows');
    expect(devicesRes.body).toHaveProperty('count');
    expect(devicesRes.body.rows.length).toBeGreaterThan(0);

    // -------------------------------------------------------------------------
    // 8. MQTT Command Publish
    // -------------------------------------------------------------------------
    const commandDevice = await createDevice({ deviceId: 'smoke-command-001' });

    const commandRes = await request(app)
      .post(`/api/v1/admin/devices/${commandDevice.deviceId}/command`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ command: 'sync', payload: { reason: 'smoke-test' } });

    expect(commandRes.status).toBe(200);
    expect(commandRes.body).toHaveProperty('success', true);
    expect(commandRes.body).toHaveProperty('deviceId', commandDevice.deviceId);
    expect(commandRes.body).toHaveProperty('command', 'sync');
  });
});
