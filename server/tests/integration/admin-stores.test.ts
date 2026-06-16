import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { initTestDatabase, resetTestDatabase, closeTestDatabase } from '../setup';
import { createAdmin, createStore } from '../helpers';
import { signAccessToken } from '../../src/utils/jwt';
import { StoreModel } from '../../src/models';

// Bypass rate limiting for integration tests
vi.mock('../../src/middleware/rate-limit', () => ({
  rateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

describe('Admin Store Routes', () => {
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
      const res = await request(app).get('/api/v1/admin/stores');
      expect(res.status).toBe(401);
    });

    it('should return 403 when token role is not admin (operator)', async () => {
      const operatorToken = signAccessToken({
        userId: 99,
        storeId: null,
        deviceId: null,
        role: 'operator',
      });
      const res = await request(app)
        .get('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${operatorToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Admin access required');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/admin/stores
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/admin/stores', () => {
    it('should create a store and return 201 with the record', async () => {
      const res = await request(app)
        .post('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '徐家汇店',
          code: 'XJH-001',
          region: '华东',
          address: '上海市徐汇区',
          status: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('徐家汇店');
      expect(res.body.code).toBe('XJH-001');
      expect(res.body.region).toBe('华东');
      expect(res.body.address).toBe('上海市徐汇区');
      expect(res.body.status).toBe(1);
    });

    it('should default status to 1 when not provided', async () => {
      const res = await request(app)
        .post('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Default Status Store', code: 'DEF-001' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(1);
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'NO-NAME' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('name and code are required');
    });

    it('should return 400 when code is missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'No Code Store' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('name and code are required');
    });

    it('should return 409 when creating a store with a duplicate code', async () => {
      await createStore({ name: 'First Store', code: 'DUP-001' });

      const res = await request(app)
        .post('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Second Store', code: 'DUP-001' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Conflict');
      // Sequelize surfaces the violation as a generic "Validation error" —
      // the unique hint lives in err.errors[]. Just confirm we got a message.
      expect(typeof res.body.message).toBe('string');
      expect(res.body.message.length).toBeGreaterThan(0);

      // And the duplicate must NOT have been inserted — only the original row remains.
      const all = await StoreModel.findAll({ where: { code: 'DUP-001' } });
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('First Store');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/admin/stores
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/admin/stores', () => {
    it('should list stores with pagination metadata', async () => {
      await createStore({ name: 'Store A', code: 'A-001' });
      await createStore({ name: 'Store B', code: 'B-001' });

      const res = await request(app)
        .get('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.rows).toHaveLength(2);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
    });

    it('should filter by status', async () => {
      await createStore({ name: 'Active Store', code: 'S-ACT', status: 1 });
      await createStore({ name: 'Disabled Store', code: 'S-INA', status: 0 });

      const res = await request(app)
        .get('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ status: 1 });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.rows[0].name).toBe('Active Store');
      expect(res.body.rows[0].status).toBe(1);
    });

    it('should filter by name via search', async () => {
      await createStore({ name: 'Pudong Flagship', code: 'SRCH-PD' });
      await createStore({ name: 'Beijing Branch', code: 'SRCH-BJ' });

      const res = await request(app)
        .get('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: 'Pudong' });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.rows[0].name).toBe('Pudong Flagship');
    });

    it('should filter by code via search', async () => {
      await createStore({ name: 'Alpha Store', code: 'CODE-AAA' });
      await createStore({ name: 'Beta Store', code: 'CODE-BBB' });

      const res = await request(app)
        .get('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: 'CODE-BBB' });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.rows[0].code).toBe('CODE-BBB');
    });

    it('should respect pageSize and page for pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await createStore({ name: `Page Store ${i}`, code: `PG-${i}` });
      }

      const page1 = await request(app)
        .get('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, pageSize: 2 });

      expect(page1.status).toBe(200);
      expect(page1.body.rows).toHaveLength(2);
      expect(page1.body.count).toBe(5);
      expect(page1.body.page).toBe(1);
      expect(page1.body.pageSize).toBe(2);

      const page2 = await request(app)
        .get('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 2, pageSize: 2 });

      expect(page2.body.rows).toHaveLength(2);
      expect(page2.body.page).toBe(2);

      const page3 = await request(app)
        .get('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 3, pageSize: 2 });

      expect(page3.body.rows).toHaveLength(1);
    });

    it('should clamp pageSize to a maximum of 100', async () => {
      const res = await request(app)
        .get('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ pageSize: 500 });

      expect(res.status).toBe(200);
      expect(res.body.pageSize).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/admin/stores/:id
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/admin/stores/:id', () => {
    it('should return a single store by id', async () => {
      const store = await createStore({ name: 'Lookup Store', code: 'LUK-001' });

      const res = await request(app)
        .get(`/api/v1/admin/stores/${store.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(store.id);
      expect(res.body.name).toBe('Lookup Store');
    });

    it('should return 400 for a non-numeric id', async () => {
      const res = await request(app)
        .get('/api/v1/admin/stores/not-a-number')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid store ID');
    });

    it('should return 404 for a non-existent store', async () => {
      const res = await request(app)
        .get('/api/v1/admin/stores/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Store not found');
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/v1/admin/stores/:id
  // ---------------------------------------------------------------------------
  describe('PUT /api/v1/admin/stores/:id', () => {
    it('should update name/region/address/status', async () => {
      const store = await createStore({
        name: 'Old Name',
        code: 'UPD-001',
        region: '华东',
        address: 'Old Address',
        status: 1,
      });

      const res = await request(app)
        .put(`/api/v1/admin/stores/${store.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Name',
          code: 'UPD-001',
          region: '华北',
          address: 'New Address',
          status: 0,
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
      expect(res.body.region).toBe('华北');
      expect(res.body.address).toBe('New Address');
      expect(res.body.status).toBe(0);

      // Verify persistence
      const refreshed = await StoreModel.findByPk(store.id);
      expect(refreshed?.name).toBe('New Name');
      expect(refreshed?.status).toBe(0);
    });

    it('should return 400 for a non-numeric id', async () => {
      const res = await request(app)
        .put('/api/v1/admin/stores/abc')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'x' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for a non-existent store', async () => {
      const res = await request(app)
        .put('/api/v1/admin/stores/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'x' });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/admin/stores/:id
  // ---------------------------------------------------------------------------
  describe('DELETE /api/v1/admin/stores/:id', () => {
    it('should delete a store', async () => {
      const store = await createStore({ name: 'Doomed Store', code: 'DEL-001' });

      const res = await request(app)
        .delete(`/api/v1/admin/stores/${store.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);

      // Row is actually gone
      const gone = await StoreModel.findByPk(store.id);
      expect(gone).toBeNull();
    });

    it('should return 400 for a non-numeric id', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/stores/abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should return 404 for a non-existent store', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/stores/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Full CRUD round-trip
  // ---------------------------------------------------------------------------
  describe('CRUD round-trip', () => {
    it('create → read → update → read → delete → read', async () => {
      // create
      const created = await request(app)
        .post('/api/v1/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Roundtrip', code: 'RT-001', region: '华南', address: 'Shenzhen' });
      expect(created.status).toBe(201);
      const id = created.body.id;

      // read
      const got = await request(app)
        .get(`/api/v1/admin/stores/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(got.status).toBe(200);
      expect(got.body.code).toBe('RT-001');

      // update
      const updated = await request(app)
        .put(`/api/v1/admin/stores/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Roundtrip v2', code: 'RT-001', region: '华南', address: 'Shenzhen', status: 1 });
      expect(updated.status).toBe(200);
      expect(updated.body.name).toBe('Roundtrip v2');

      // delete
      const deleted = await request(app)
        .delete(`/api/v1/admin/stores/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleted.status).toBe(200);

      // read-after-delete → 404
      const after = await request(app)
        .get(`/api/v1/admin/stores/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(after.status).toBe(404);
    });
  });
});
