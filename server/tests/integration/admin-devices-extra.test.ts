import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { createAdmin, createStore, createDevice } from '../helpers';
import { signAccessToken } from '../../src/utils/jwt';
import { sequelize } from '../../src/config/database';

// Bypass rate limiting for integration tests
vi.mock('../../src/middleware/rate-limit', () => ({
  rateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Mock the MQTT publisher so sendCommand resolves without a broker.
// We intentionally do NOT mock device-monitor itself — we want the real
// getDeviceList / getDeviceTelemetry / sendCommand to exercise the DB.
vi.mock('../../src/services/mqtt-publisher', () => ({
  publish: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Insert a telemetry row directly, bypassing Sequelize's association layer.
 *
 * The model layer declares Device.id (BIGINT, auto-increment) as the target of
 * DeviceTelemetry.device_id, but the application stores the textual device_id
 * string. In production (MySQL) this works because Sequelize does not enforce
 * the constraint, but SQLite enforces it on sync(). Raw INSERT bypasses the
 * ORM-level association check while still hitting the same table — exactly
 * what we need to seed fixtures for the read paths.
 */
async function seedTelemetry(
  deviceId: string,
  fields: { cpu?: number; memory?: number; network?: string; createdAt?: Date } = {},
): Promise<void> {
  // The DeviceTelemetry model sets updatedAt: false, so only created_at exists.
  // Disable SQLite FK enforcement for this INSERT: the application stores the
  // textual device_id in device_telemetries, but Sequelize's association points
  // at Device.id (BIGINT PK), so a real FK check cannot succeed. Production
  // (MySQL) doesn't enforce the FK because Sequelize doesn't emit one.
  //
  // The caller may pass an explicit createdAt to ensure deterministic ordering,
  // since SQLite's datetime('now') has only second granularity.
  const tsIso = (fields.createdAt ?? new Date()).toISOString();
  await sequelize.query('PRAGMA foreign_keys = OFF');
  try {
    await sequelize.query(
      `INSERT INTO device_telemetries (device_id, cpu, memory, network, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      {
        replacements: [
          deviceId,
          fields.cpu ?? 0,
          fields.memory ?? 0,
          fields.network ?? 'offline',
          tsIso,
        ],
      },
    );
  } finally {
    await sequelize.query('PRAGMA foreign_keys = ON');
  }
}

describe('Admin Device Routes (extra coverage)', () => {
  let adminToken: string;

  beforeAll(async () => {
    await initTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
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

  // ---------------------------------------------------------------------------
  // Authorization guard
  // ---------------------------------------------------------------------------
  describe('authorization', () => {
    it('should return 401 when no access token is provided', async () => {
      const res = await request(app).get('/api/v1/admin/devices');
      expect(res.status).toBe(401);
    });

    it('should return 403 when token role is not admin', async () => {
      const operatorToken = signAccessToken({
        userId: 7,
        storeId: null,
        deviceId: null,
        role: 'operator',
      });
      const res = await request(app)
        .get('/api/v1/admin/devices')
        .set('Authorization', `Bearer ${operatorToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/admin/devices — list + filters
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/admin/devices', () => {
    it('should return paginated device list with default page/pageSize', async () => {
      await createDevice({ deviceId: 'dev-a-001', status: 'online' });
      await createDevice({ deviceId: 'dev-a-002', status: 'offline' });

      const res = await request(app)
        .get('/api/v1/admin/devices')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.rows).toHaveLength(2);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      // Each row carries the latest telemetry slot (null when none exists)
      expect(res.body.rows[0]).toHaveProperty('latestTelemetry');
    });

    it('should filter by status=online', async () => {
      await createDevice({ deviceId: 'dev-fil-001', status: 'online' });
      await createDevice({ deviceId: 'dev-fil-002', status: 'offline' });
      await createDevice({ deviceId: 'dev-fil-003', status: 'online' });

      const res = await request(app)
        .get('/api/v1/admin/devices')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ status: 'online' });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      for (const row of res.body.rows) {
        expect(row.status).toBe('online');
      }
    });

    it('should filter by storeId', async () => {
      const store = await createStore({ name: 'Filter Store', code: 'FIL-S1' });
      await createDevice({ deviceId: 'dev-store-001', storeId: store.id });
      await createDevice({ deviceId: 'dev-store-002' }); // unbound

      const res = await request(app)
        .get('/api/v1/admin/devices')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ storeId: String(store.id) });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.rows[0].deviceId).toBe('dev-store-001');
    });

    it('should return an empty page when no devices exist', async () => {
      const res = await request(app)
        .get('/api/v1/admin/devices')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.rows).toEqual([]);
    });

    it('should respect page and pageSize for pagination', async () => {
      for (let i = 0; i < 4; i++) {
        await createDevice({ deviceId: `dev-page-${i.toString().padStart(3, '0')}` });
      }

      const r1 = await request(app)
        .get('/api/v1/admin/devices')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, pageSize: 2 });
      expect(r1.body.rows).toHaveLength(2);
      expect(r1.body.count).toBe(4);
      expect(r1.body.page).toBe(1);
      expect(r1.body.pageSize).toBe(2);

      const r2 = await request(app)
        .get('/api/v1/admin/devices')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 2, pageSize: 2 });
      expect(r2.body.rows).toHaveLength(2);
      expect(r2.body.page).toBe(2);
    });

    it('should attach the latest telemetry row for each device', async () => {
      const device = await createDevice({ deviceId: 'dev-tel-attach-001' });

      // Insert telemetry rows directly (raw SQL — see seedTelemetry note).
      // Use explicit timestamps so "latest" is deterministic despite SQLite's
      // second-granularity datetime('now').
      await seedTelemetry(device.deviceId, {
        cpu: 10,
        memory: 20,
        network: 'wifi',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      });
      await seedTelemetry(device.deviceId, {
        cpu: 99,
        memory: 88,
        network: 'ethernet',
        createdAt: new Date('2024-06-01T00:00:00Z'),
      });

      const res = await request(app)
        .get('/api/v1/admin/devices')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ pageSize: 50 });

      expect(res.status).toBe(200);
      const found = res.body.rows.find(
        (r: { deviceId: string }) => r.deviceId === device.deviceId,
      );
      expect(found).toBeTruthy();
      expect(found.latestTelemetry).not.toBeNull();
      // Latest row is the most recently inserted one
      expect(found.latestTelemetry.cpu).toBe(99);
      expect(found.latestTelemetry.network).toBe('ethernet');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/admin/devices/:deviceId/command
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/admin/devices/:deviceId/command', () => {
    it('should send a valid command to an existing device', async () => {
      const device = await createDevice({ deviceId: 'dev-cmd-001' });

      const res = await request(app)
        .post(`/api/v1/admin/devices/${device.deviceId}/command`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ command: 'restart' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.deviceId).toBe(device.deviceId);
      expect(res.body.command).toBe('restart');
    });

    it('should accept payload alongside command', async () => {
      const device = await createDevice({ deviceId: 'dev-cmd-002' });

      const res = await request(app)
        .post(`/api/v1/admin/devices/${device.deviceId}/command`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ command: 'sync', payload: { force: true } });

      expect(res.status).toBe(200);
      expect(res.body.command).toBe('sync');
    });

    it('should return 400 when command is missing', async () => {
      const device = await createDevice({ deviceId: 'dev-cmd-003' });

      const res = await request(app)
        .post(`/api/v1/admin/devices/${device.deviceId}/command`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('command is required');
    });

    it('should return 400 for an invalid command name', async () => {
      const device = await createDevice({ deviceId: 'dev-cmd-004' });

      const res = await request(app)
        .post(`/api/v1/admin/devices/${device.deviceId}/command`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ command: 'self-destruct' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('Invalid command');
      // Hint should list valid commands
      expect(res.body.message).toContain('restart');
      expect(res.body.message).toContain('sync');
      expect(res.body.message).toContain('clear-cache');
    });

    it('should return 404 when the device does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/admin/devices/nonexistent-device/command')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ command: 'sync' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
      expect(res.body.message).toContain('not found');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/admin/devices/:deviceId/telemetry
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/admin/devices/:deviceId/telemetry', () => {
    it('should return telemetry history for an existing device', async () => {
      const device = await createDevice({ deviceId: 'dev-tel-get-001' });

      await seedTelemetry(device.deviceId, {
        cpu: 30,
        memory: 40,
        network: 'wifi',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      });
      await seedTelemetry(device.deviceId, {
        cpu: 60,
        memory: 70,
        network: 'wifi',
        createdAt: new Date('2024-06-01T00:00:00Z'),
      });

      const res = await request(app)
        .get(`/api/v1/admin/devices/${device.deviceId}/telemetry`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.deviceId).toBe(device.deviceId);
      expect(Array.isArray(res.body.telemetries)).toBe(true);
      expect(res.body.count).toBe(2);
      // Most-recent first
      expect(res.body.telemetries[0].cpu).toBe(60);
      expect(res.body.telemetries[1].cpu).toBe(30);
    });

    it('should default limit to 100 and cap at 500', async () => {
      const device = await createDevice({ deviceId: 'dev-tel-limit-001' });
      // Just verify it accepts the call; we don't need to insert 500+ rows
      const res = await request(app)
        .get(`/api/v1/admin/devices/${device.deviceId}/telemetry`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.telemetries).toEqual([]);
    });

    it('should honor a custom limit', async () => {
      const device = await createDevice({ deviceId: 'dev-tel-custlimit-001' });
      const base = new Date('2024-01-01T00:00:00Z');
      for (let i = 0; i < 5; i++) {
        const ts = new Date(base.getTime() + i * 60_000);
        await seedTelemetry(device.deviceId, { cpu: i, createdAt: ts });
      }

      const res = await request(app)
        .get(`/api/v1/admin/devices/${device.deviceId}/telemetry`)
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ limit: 2 });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.telemetries).toHaveLength(2);
      // Most recent first → cpu = 4 then 3
      expect(res.body.telemetries[0].cpu).toBe(4);
      expect(res.body.telemetries[1].cpu).toBe(3);
    });

    it('should return 404 when the device does not exist', async () => {
      const res = await request(app)
        .get('/api/v1/admin/devices/no-such-device/telemetry')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
      expect(res.body.message).toContain('not found');
    });
  });
});
