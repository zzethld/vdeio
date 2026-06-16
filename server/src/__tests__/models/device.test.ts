import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createDeviceModel } from '../../models/device';

let sequelize: Sequelize;
let Device: ReturnType<typeof createDeviceModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  Device = createDeviceModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('Device Model', () => {
  it('should create a device record with correct fields', async () => {
    const device = await Device.create({
      deviceId: 'device_001',
      storeId: 1,
      deviceName: 'Player #1',
      osVersion: 'Android 12',
      appVersion: '1.0.0',
      lastOnlineAt: new Date(),
    });

    expect(device.id).toBeDefined();
    expect(device.id).toBeGreaterThan(0);
    expect(device.deviceId).toBe('device_001');
    expect(device.storeId).toBe(1);
    expect(device.deviceName).toBe('Player #1');
    expect(device.osVersion).toBe('Android 12');
    expect(device.appVersion).toBe('1.0.0');
    expect(device.lastOnlineAt).toBeInstanceOf(Date);
    expect(device.status).toBe('offline');
    expect(device.localPaths).toBeTruthy();
    expect(device.createdAt).toBeInstanceOf(Date);
  });

  it('should default status to offline', async () => {
    const device = await Device.create({ deviceId: 'dev_status' });

    expect(device.status).toBe('offline');
  });

  it('should default localPaths to empty object', async () => {
    const device = await Device.create({ deviceId: 'dev_paths' });

    expect(device.localPaths).toBeTruthy();
  });

  it('should enforce unique deviceId', async () => {
    await Device.create({ deviceId: 'unique_dev' });

    await expect(
      Device.create({ deviceId: 'unique_dev' })
    ).rejects.toThrow();
  });

  it('should allow nullable fields', async () => {
    const device = await Device.create({ deviceId: 'dev_nullable' });

    expect([null, undefined]).toContain(device.storeId);
    expect([null, undefined]).toContain(device.deviceName);
    expect([null, undefined]).toContain(device.osVersion);
    expect([null, undefined]).toContain(device.appVersion);
    expect([null, undefined]).toContain(device.lastOnlineAt);
  });

  it('should not have updatedAt (updatedAt: false)', async () => {
    const device = await Device.create({ deviceId: 'dev_no_update' });

    expect((device as any).updatedAt).toBeUndefined();
  });

  it('should store localPaths as JSON', async () => {
    const paths = { videos: '/data/videos', cache: '/data/cache' };
    const device = await Device.create({
      deviceId: 'dev_json',
      localPaths: paths,
    });

    expect(device.localPaths).toEqual(paths);
    expect(device.localPaths.videos).toBe('/data/videos');
    expect(device.localPaths.cache).toBe('/data/cache');
  });
});
