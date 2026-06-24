import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Op } from 'sequelize';

// Mock models before importing service
vi.mock('../../models', () => ({
  DeviceModel: {
    findOne: vi.fn(),
    findAndCountAll: vi.fn(),
  },
  DeviceTelemetryModel: {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('../../services/mqtt-publisher', () => ({
  publish: vi.fn().mockResolvedValue(undefined),
}));

import {
  handleDeviceConnect,
  handleDeviceDisconnect,
  storeTelemetry,
  getDeviceList,
  getDeviceTelemetry,
} from '../../services/device-monitor';
import { DeviceModel, DeviceTelemetryModel } from '../../models';
import { publish } from '../../services/mqtt-publisher';

describe('Device Monitor Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleDeviceConnect', () => {
    it('finds device → updates status to online, sets lastOnlineAt', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true);
      const device = {
        deviceId: 'dev-001',
        update: mockUpdate,
      };
      (DeviceModel.findOne as any).mockResolvedValue(device);

      await handleDeviceConnect('dev-001');

      expect(DeviceModel.findOne).toHaveBeenCalledWith({ where: { deviceId: 'dev-001' } });
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'online',
        lastOnlineAt: expect.any(Date),
      });
    });

    it('unknown device → logs warning, no error thrown', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (DeviceModel.findOne as any).mockResolvedValue(null);

      await expect(handleDeviceConnect('unknown-device')).resolves.not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[DeviceMonitor] Connect event for unknown device: unknown-device'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('handleDeviceDisconnect', () => {
    it('finds device → updates status to offline', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true);
      const device = {
        deviceId: 'dev-001',
        update: mockUpdate,
      };
      (DeviceModel.findOne as any).mockResolvedValue(device);

      await handleDeviceDisconnect('dev-001');

      expect(DeviceModel.findOne).toHaveBeenCalledWith({ where: { deviceId: 'dev-001' } });
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'offline',
        lastOnlineAt: expect.any(Date),
      });
    });

    it('unknown device → logs warning, no error thrown', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (DeviceModel.findOne as any).mockResolvedValue(null);

      await expect(handleDeviceDisconnect('unknown-device')).resolves.not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[DeviceMonitor] Disconnect event for unknown device: unknown-device'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('storeTelemetry', () => {
    it('creates DeviceTelemetryModel record with correct fields', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true);
      const device = {
        deviceId: 'dev-001',
        appVersion: '1.0.0',
        update: mockUpdate,
      };
      (DeviceModel.findOne as any).mockResolvedValue(device);
      (DeviceTelemetryModel.create as any).mockResolvedValue({ id: 1 });

      await storeTelemetry('dev-001', {
        cpu: 45.5,
        memory: 60,
        disk: 75,
        diskFree: 25,
        cacheSize: 1024,
        appVersion: '1.0.0',
        uptime: 3600,
        network: 'wifi',
      });

      expect(DeviceTelemetryModel.create).toHaveBeenCalledWith({
        deviceId: 'dev-001',
        cpu: 45.5,
        memory: 60,
        disk: 75,
        diskFree: 25,
        cacheSize: 1024,
        appVersion: '1.0.0',
        uptime: 3600,
        network: 'wifi',
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('updates device appVersion if different', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true);
      const device = {
        deviceId: 'dev-001',
        appVersion: '1.0.0',
        update: mockUpdate,
      };
      (DeviceModel.findOne as any).mockResolvedValue(device);
      (DeviceTelemetryModel.create as any).mockResolvedValue({ id: 1 });

      await storeTelemetry('dev-001', {
        appVersion: '2.0.0',
      });

      expect(DeviceTelemetryModel.create).toHaveBeenCalledWith({
        deviceId: 'dev-001',
        cpu: 0,
        memory: 0,
        disk: 0,
        diskFree: 0,
        cacheSize: 0,
        appVersion: '2.0.0',
        uptime: 0,
        network: 'offline',
      });
      expect(mockUpdate).toHaveBeenCalledWith({ appVersion: '2.0.0' });
    });

    it('returns early for unknown device', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (DeviceModel.findOne as any).mockResolvedValue(null);

      await storeTelemetry('unknown-device', { cpu: 50 });

      expect(DeviceTelemetryModel.create).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[DeviceMonitor] Telemetry for unknown device: unknown-device'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('getDeviceList', () => {
    it('returns paginated results with latest telemetry', async () => {
      const mockDeviceToJSON = vi.fn().mockReturnValue({
        deviceId: 'dev-001',
        status: 'online',
      });
      const mockDevice = {
        deviceId: 'dev-001',
        toJSON: mockDeviceToJSON,
      };
      const mockTelemetry = {
        deviceId: 'dev-001',
        cpu: 50,
        memory: 60,
      };

      (DeviceModel.findAndCountAll as any).mockResolvedValue({
        rows: [mockDevice],
        count: 1,
      });
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([mockTelemetry]);

      const result = await getDeviceList({ page: 1, pageSize: 10 });

      expect(DeviceModel.findAndCountAll).toHaveBeenCalledWith({
        where: {},
        order: [['last_online_at', 'DESC']],
        limit: 10,
        offset: 0,
      });
      // Single findAll call (not N findOne calls) — N+1 fix
      expect(DeviceTelemetryModel.findAll).toHaveBeenCalledTimes(1);
      expect(DeviceTelemetryModel.findOne).not.toHaveBeenCalled();
      expect(result.rows[0]).toEqual({
        deviceId: 'dev-001',
        status: 'online',
        latestTelemetry: mockTelemetry,
      });
      expect(result.count).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('returns empty array when no devices found', async () => {
      (DeviceModel.findAndCountAll as any).mockResolvedValue({
        rows: [],
        count: 0,
      });

      const result = await getDeviceList();

      expect(result.rows).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('applies status and storeId filters', async () => {
      const mockDeviceToJSON = vi.fn().mockReturnValue({
        deviceId: 'dev-001',
        status: 'online',
      });
      const mockDevice = {
        deviceId: 'dev-001',
        toJSON: mockDeviceToJSON,
      };

      (DeviceModel.findAndCountAll as any).mockResolvedValue({
        rows: [mockDevice],
        count: 1,
      });
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([]);

      await getDeviceList({ status: 'online', storeId: 5 });

      expect(DeviceModel.findAndCountAll).toHaveBeenCalledWith({
        where: { status: 'online', store_id: 5 },
        order: [['last_online_at', 'DESC']],
        limit: 20,
        offset: 0,
      });
    });

    it('telemetry query count stays constant regardless of device count (no N+1)', async () => {
      // Build N mock devices
      const makeDevice = (id: string) => ({
        deviceId: id,
        toJSON: vi.fn().mockReturnValue({ deviceId: id, status: 'online' }),
      });
      const devices = [
        makeDevice('dev-001'),
        makeDevice('dev-002'),
        makeDevice('dev-003'),
        makeDevice('dev-004'),
        makeDevice('dev-005'),
      ];

      (DeviceModel.findAndCountAll as any).mockResolvedValue({
        rows: devices,
        count: devices.length,
      });
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([
        { deviceId: 'dev-001', cpu: 10, createdAt: new Date() },
        { deviceId: 'dev-002', cpu: 20, createdAt: new Date() },
      ]);

      await getDeviceList({ page: 1, pageSize: 10 });

      // Critical invariant: telemetry is fetched in exactly ONE query,
      // NOT one query per device (the previous N+1 behavior).
      expect(DeviceTelemetryModel.findAll).toHaveBeenCalledTimes(1);
      expect(DeviceTelemetryModel.findOne).not.toHaveBeenCalled();

      // The single findAll must request all device IDs via Op.in so that
      // the correlated subquery only walks the relevant subset.
      const callArg = (DeviceTelemetryModel.findAll as any).mock.calls[0][0];
      expect(callArg.where.deviceId).toEqual({
        [Op.in]: ['dev-001', 'dev-002', 'dev-003', 'dev-004', 'dev-005'],
      });
    });
  });

  describe('getDeviceTelemetry', () => {
    it('returns telemetry history for a device', async () => {
      const mockDevice = { deviceId: 'dev-001' };
      const mockTelemetry = {
        toJSON: vi.fn().mockReturnValue({ id: 1, deviceId: 'dev-001', cpu: 50 }),
      };

      (DeviceModel.findOne as any).mockResolvedValue(mockDevice);
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([mockTelemetry]);

      const result = await getDeviceTelemetry('dev-001', 50);

      expect(DeviceModel.findOne).toHaveBeenCalledWith({ where: { deviceId: 'dev-001' } });
      expect(DeviceTelemetryModel.findAll).toHaveBeenCalledWith({
        where: { deviceId: 'dev-001' },
        order: [['created_at', 'DESC']],
        limit: 50,
      });
      expect(result).toEqual([{ id: 1, deviceId: 'dev-001', cpu: 50 }]);
    });

    it('throws if device not found', async () => {
      (DeviceModel.findOne as any).mockResolvedValue(null);

      await expect(getDeviceTelemetry('unknown-device')).rejects.toThrow(
        'Device not found: unknown-device'
      );
    });

    it('caps limit at 500', async () => {
      const mockDevice = { deviceId: 'dev-001' };
      const mockTelemetry = {
        toJSON: vi.fn().mockReturnValue({ id: 1 }),
      };

      (DeviceModel.findOne as any).mockResolvedValue(mockDevice);
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([mockTelemetry]);

      await getDeviceTelemetry('dev-001', 1000);

      expect(DeviceTelemetryModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 })
      );
    });
  });
});
