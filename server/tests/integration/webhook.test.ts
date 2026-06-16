import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { createDevice } from '../helpers';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit';
import { DeviceModel } from '../../src/models';

describe('EMQX Webhook', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    (rateLimitMiddleware as any).resetKey('::ffff:127.0.0.1');
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('POST /api/v1/webhooks/emqx — client.connected', () => {
    it('should set device status to online', async () => {
      const device = await createDevice({ deviceId: 'wh-conn-001', status: 'offline' });

      const res = await request(app)
        .post('/api/v1/webhooks/emqx')
        .send({ event: 'client.connected', username: device.deviceId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.event).toBe('connect');
      expect(res.body.deviceId).toBe(device.deviceId);

      // Verify DB updated
      const updated = await DeviceModel.findOne({ where: { deviceId: device.deviceId } });
      expect(updated?.status).toBe('online');
      expect(updated?.lastOnlineAt).toBeTruthy();
    });

    it('should use clientid as fallback when username is absent', async () => {
      const device = await createDevice({ deviceId: 'wh-conn-002', status: 'offline' });

      const res = await request(app)
        .post('/api/v1/webhooks/emqx')
        .send({ event: 'client.connected', clientid: device.deviceId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await DeviceModel.findOne({ where: { deviceId: device.deviceId } });
      expect(updated?.status).toBe('online');
    });
  });

  describe('POST /api/v1/webhooks/emqx — client.disconnected', () => {
    it('should set device status to offline', async () => {
      const device = await createDevice({ deviceId: 'wh-disc-001', status: 'online' });

      const res = await request(app)
        .post('/api/v1/webhooks/emqx')
        .send({ event: 'client.disconnected', username: device.deviceId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.event).toBe('disconnect');

      const updated = await DeviceModel.findOne({ where: { deviceId: device.deviceId } });
      expect(updated?.status).toBe('offline');
    });
  });

  describe('POST /api/v1/webhooks/emqx — unknown event', () => {
    it('should accept unknown event types with note', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/emqx')
        .send({ event: 'client.subscribe', username: 'some-device' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.note).toBe('Unhandled event type');
    });
  });

  describe('POST /api/v1/webhooks/emqx — validation', () => {
    it('should return 400 when event is missing', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/emqx')
        .send({ username: 'wh-device-001' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('event is required');
    });

    it('should return 400 when username and clientid are missing', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/emqx')
        .send({ event: 'client.connected' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('username or clientid is required');
    });
  });

  describe('POST /api/v1/webhooks/emqx — non-existent device', () => {
    it('should still return 200 for connect event with unknown device', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/emqx')
        .send({ event: 'client.connected', username: 'non-existent-device-id' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should still return 200 for disconnect event with unknown device', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/emqx')
        .send({ event: 'client.disconnected', username: 'non-existent-device-id' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
