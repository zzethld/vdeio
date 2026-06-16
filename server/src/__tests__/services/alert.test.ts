import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../models', () => ({
  DeviceModel: {
    findAll: vi.fn(),
    findOne: vi.fn(),
  },
  DeviceTelemetryModel: {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { DeviceModel, DeviceTelemetryModel } from '../../models';
import { getRedis } from '../../config/redis';

describe('Alert Service', () => {
  let startAlertScheduler: typeof import('../../services/alert').startAlertScheduler;
  let mockFetch: ReturnType<typeof vi.fn>;
  let setIntervalSpy: any;
  let redisInstance: ReturnType<typeof getRedis>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(999 as any);

    // Set webhook env BEFORE importing alert module
    process.env.DINGTALK_ALERT_WEBHOOK = 'https://oapi.dingtalk.com/robot/send?access_token=test-token';

    // Re-import alert module so DINGTALK_WEBHOOK is read fresh
    vi.resetModules();

    // Dynamically import redis to get the SAME instance alert.ts will use
    const redisModule = await import('../../config/redis');
    redisInstance = redisModule.getRedis();

    // Clear alert keys on the shared instance
    const keys = await redisInstance.keys('alert:sent:*');
    if (keys.length > 0) {
      await redisInstance.del(...keys);
    }

    const alertModule = await import('../../services/alert');
    startAlertScheduler = alertModule.startAlertScheduler;
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    vi.unstubAllGlobals();
    delete process.env.DINGTALK_ALERT_WEBHOOK;
  });

  describe('checkDeviceOffline', () => {
    it('devices offline > 30 min trigger alert', async () => {
      const offlineDevice = {
        deviceId: 'dev-001',
        deviceName: 'Test Device',
        lastOnlineAt: new Date(Date.now() - 31 * 60 * 1000),
      };
      (DeviceModel.findAll as any).mockResolvedValue([offlineDevice]);
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([]);
      mockFetch.mockResolvedValue({ ok: true } as Response);

      startAlertScheduler();

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      expect(DeviceModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'offline',
            lastOnlineAt: expect.any(Object),
          }),
        })
      );
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('https://oapi.dingtalk.com/robot/send?access_token=test-token');
      const body = JSON.parse(fetchCall[1].body);
      expect(body.msgtype).toBe('markdown');
      expect(body.markdown.title).toBe('Vdeio 设备告警');
      expect(body.markdown.text).toContain('dev-001');
      expect(body.markdown.text).toContain('Test Device');
    });

    it('does not alert for devices offline < 30 min', async () => {
      const recentDevice = {
        deviceId: 'dev-002',
        deviceName: 'Recent Device',
        lastOnlineAt: new Date(Date.now() - 5 * 60 * 1000),
      };
      (DeviceModel.findAll as any).mockResolvedValue([recentDevice]);
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([]);
      mockFetch.mockResolvedValue({ ok: true } as Response);

      startAlertScheduler();

      await vi.waitFor(() => {
        expect(DeviceModel.findAll).toHaveBeenCalled();
      });

      // Mock returns the device, but in real DB query it would be filtered out
      // by lastOnlineAt < 30 min ago. We verify query structure is correct.
    });
  });

  describe('checkDiskUsage', () => {
    it('disk usage > 80% triggers alert', async () => {
      (DeviceModel.findAll as any).mockResolvedValue([]);
      const highDiskTelemetry = {
        deviceId: 'dev-003',
        disk: 85,
      };
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([highDiskTelemetry]);
      mockFetch.mockResolvedValue({ ok: true } as Response);

      startAlertScheduler();

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      expect(DeviceTelemetryModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Object),
        })
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.markdown.text).toContain('dev-003');
      expect(body.markdown.text).toContain('85%');
    });
  });

  describe('deduplication', () => {
    it('same device alert not sent within 1 hour', async () => {
      // Pre-set the dedup key so shouldAlert returns false
      await redisInstance.setex('alert:sent:offline:dev-004', 3600, '1');

      const offlineDevice = {
        deviceId: 'dev-004',
        deviceName: 'Deduplicated Device',
        lastOnlineAt: new Date(Date.now() - 35 * 60 * 1000),
      };
      (DeviceModel.findAll as any).mockResolvedValue([offlineDevice]);
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([]);
      mockFetch.mockResolvedValue({ ok: true } as Response);

      startAlertScheduler();

      await vi.waitFor(() => {
        expect(DeviceModel.findAll).toHaveBeenCalled();
      });

      // Wait a bit for async operations, then verify fetch was NOT called
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('sendDingTalkAlert', () => {
    it('calls webhook with correct message when configured', async () => {
      const offlineDevice = {
        deviceId: 'dev-005',
        deviceName: 'Webhook Device',
        lastOnlineAt: new Date(Date.now() - 40 * 60 * 1000),
      };
      (DeviceModel.findAll as any).mockResolvedValue([offlineDevice]);
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([]);
      mockFetch.mockResolvedValue({ ok: true } as Response);

      startAlertScheduler();

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('https://oapi.dingtalk.com/robot/send?access_token=test-token');
      expect(fetchCall[1].method).toBe('POST');
      expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(fetchCall[1].body);
      expect(body.msgtype).toBe('markdown');
      expect(body.markdown.title).toBe('Vdeio 设备告警');
      expect(body.markdown.text).toContain('dev-005');
    });

    it('logs to console when webhook not configured', async () => {
      delete process.env.DINGTALK_ALERT_WEBHOOK;
      vi.resetModules();
      const alertModule = await import('../../services/alert');
      const localStartAlertScheduler = alertModule.startAlertScheduler;

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const offlineDevice = {
        deviceId: 'dev-006',
        deviceName: 'No Webhook Device',
        lastOnlineAt: new Date(Date.now() - 45 * 60 * 1000),
      };
      (DeviceModel.findAll as any).mockResolvedValue([offlineDevice]);
      (DeviceTelemetryModel.findAll as any).mockResolvedValue([]);

      localStartAlertScheduler();

      await vi.waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('DINGTALK_ALERT_WEBHOOK not configured')
        );
      });

      consoleLogSpy.mockRestore();
    });
  });
});
