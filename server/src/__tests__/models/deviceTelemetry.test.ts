import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createDeviceTelemetryModel } from '../../models/deviceTelemetry';

let sequelize: Sequelize;
let DeviceTelemetry: ReturnType<typeof createDeviceTelemetryModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  DeviceTelemetry = createDeviceTelemetryModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('DeviceTelemetry Model', () => {
  it('should create a telemetry record with correct fields', async () => {
    const telemetry = await DeviceTelemetry.create({
      deviceId: 'device_001',
      cpu: 45.5,
      memory: 78.2,
      disk: 60.0,
      diskFree: 40.0,
      cacheSize: 1024000,
      appVersion: '1.0.0',
      uptime: 86400,
      network: 'wifi',
    });

    expect(telemetry.id).toBeDefined();
    expect(telemetry.id).toBeGreaterThan(0);
    expect(telemetry.deviceId).toBe('device_001');
    expect(telemetry.cpu).toBe(45.5);
    expect(telemetry.memory).toBe(78.2);
    expect(telemetry.disk).toBe(60.0);
    expect(telemetry.diskFree).toBe(40.0);
    expect(telemetry.cacheSize).toBe(1024000);
    expect(telemetry.appVersion).toBe('1.0.0');
    expect(telemetry.uptime).toBe(86400);
    expect(telemetry.network).toBe('wifi');
    expect(telemetry.createdAt).toBeInstanceOf(Date);
  });

  it('should default numeric fields to 0', async () => {
    const telemetry = await DeviceTelemetry.create({ deviceId: 'dev_defaults' });

    expect(telemetry.cpu).toBe(0);
    expect(telemetry.memory).toBe(0);
    expect(telemetry.disk).toBe(0);
    expect(telemetry.diskFree).toBe(0);
    expect(telemetry.cacheSize).toBe(0);
    expect(telemetry.uptime).toBe(0);
  });

  it('should default appVersion to empty string', async () => {
    const telemetry = await DeviceTelemetry.create({ deviceId: 'dev_version' });

    expect(telemetry.appVersion).toBe('');
  });

  it('should default network to offline', async () => {
    const telemetry = await DeviceTelemetry.create({ deviceId: 'dev_net' });

    expect(telemetry.network).toBe('offline');
  });

  it('should not have updatedAt (updatedAt: false)', async () => {
    const telemetry = await DeviceTelemetry.create({ deviceId: 'dev_no_update' });

    expect((telemetry as any).updatedAt).toBeUndefined();
  });

  it('should require deviceId', async () => {
    await expect(
      DeviceTelemetry.create({} as any)
    ).rejects.toThrow();
  });
});
