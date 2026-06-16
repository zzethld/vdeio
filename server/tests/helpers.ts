/**
 * Test helper functions for creating test data and authenticating.
 *
 * All helpers use the models directly (no HTTP) except getAdminToken()
 * which exercises the actual login route via supertest.
 */
import bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  AdminModel,
  StoreModel,
  DeviceModel,
  VideoModel,
  CampaignModel,
  sequelize,
} from '../src/models';
import type { Application } from 'express';

// ---------------------------------------------------------------------------
// Admin helpers
// ---------------------------------------------------------------------------

const DEFAULT_ADMIN = {
  username: 'testadmin',
  password: 'admin123',
  name: 'Test Admin',
  role: 'super_admin' as const,
  status: 1,
};

/**
 * Create an AdminModel record with known credentials.
 * Returns the Sequelize model instance.
 */
export async function createAdmin(
  overrides: Partial<{
    username: string;
    password: string;
    name: string | null;
    role: 'super_admin' | 'admin';
    status: number;
  }> = {}
) {
  const username = overrides.username ?? DEFAULT_ADMIN.username;
  const password = overrides.password ?? DEFAULT_ADMIN.password;

  return AdminModel.create({
    username,
    passwordHash: await bcrypt.hash(password, 10),
    name: overrides.name ?? DEFAULT_ADMIN.name,
    role: overrides.role ?? DEFAULT_ADMIN.role,
    status: overrides.status ?? DEFAULT_ADMIN.status,
  });
}

/**
 * Ensure a test admin exists, then log in via POST /api/v1/admin/auth/login
 * and return the access token.
 *
 * Requires the Express app instance (from tests/app.ts) for supertest.
 */
export async function getAdminToken(
  app: Application,
  username: string = DEFAULT_ADMIN.username,
  password: string = DEFAULT_ADMIN.password,
): Promise<string> {
  // Ensure admin exists
  const existing = await AdminModel.findOne({ where: { username } });
  if (!existing) {
    await createAdmin({ username, password });
  }

  const res = await request(app)
    .post('/api/v1/admin/auth/login')
    .send({ username, password });

  if (!res.body.accessToken) {
    throw new Error(
      `Login failed: ${JSON.stringify(res.body)} (status ${res.status})`,
    );
  }

  return res.body.accessToken as string;
}

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

export async function createStore(
  overrides: Partial<{
    name: string | null;
    code: string | null;
    region: string | null;
    address: string | null;
    status: number;
  }> = {},
) {
  return StoreModel.create({
    name: overrides.name ?? 'Test Store',
    code: overrides.code ?? `STORE-${Date.now()}`,
    region: overrides.region ?? '华东',
    address: overrides.address ?? 'Test Address',
    status: overrides.status ?? 1,
  });
}

// ---------------------------------------------------------------------------
// Device helpers
// ---------------------------------------------------------------------------

export async function createDevice(
  overrides: Partial<{
    deviceId: string;
    storeId: number | null;
    deviceName: string | null;
    osVersion: string | null;
    appVersion: string | null;
    status: 'online' | 'offline';
  }> = {},
) {
  return DeviceModel.create({
    deviceId: overrides.deviceId ?? `DEV-${Date.now()}`,
    storeId: overrides.storeId ?? null,
    deviceName: overrides.deviceName ?? 'Test Device',
    osVersion: overrides.osVersion ?? 'Android 14',
    appVersion: overrides.appVersion ?? '1.0.0',
    status: overrides.status ?? 'offline',
  });
}

// ---------------------------------------------------------------------------
// Video helpers
// ---------------------------------------------------------------------------

export async function createVideo(
  overrides: Partial<{
    title: string | null;
    description: string | null;
    duration: number | null;
    fileSize: number | null;
    resolution: string | null;
    encryptStatus: 'pending' | 'encrypting' | 'done' | 'failed';
    createdBy: number | null;
  }> = {},
) {
  return VideoModel.create({
    title: overrides.title ?? 'Test Video',
    description: overrides.description ?? 'A test video',
    duration: overrides.duration ?? 60,
    fileSize: overrides.fileSize ?? 1024 * 1024,
    resolution: overrides.resolution ?? '1920x1080',
    encryptStatus: overrides.encryptStatus ?? 'done',
    createdBy: overrides.createdBy ?? null,
  });
}

// ---------------------------------------------------------------------------
// Campaign helpers
// ---------------------------------------------------------------------------

export async function createCampaign(
  overrides: Partial<{
    title: string | null;
    description: string | null;
    status: 'draft' | 'active' | 'ended' | 'archived';
    startTime: Date;
    endTime: Date;
    createdBy: number | null;
  }> = {},
) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return CampaignModel.create({
    title: overrides.title ?? 'Test Campaign',
    description: overrides.description ?? 'A test campaign',
    status: overrides.status ?? 'draft',
    startTime: overrides.startTime ?? tomorrow,
    endTime: overrides.endTime ?? nextWeek,
    createdBy: overrides.createdBy ?? null,
  });
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Drop all tables and recreate them. Useful for test isolation
 * when the global beforeEach sync is insufficient.
 */
export async function resetDatabase(): Promise<void> {
  await sequelize.sync({ force: true });
}
