import { describe, it, expect, vi, beforeEach } from 'vitest';

declare module 'mqtt' {
  export const _handlers: Record<string, Function[]>;
  export const _mockPublish: ReturnType<typeof vi.fn>;
}

vi.mock('mqtt', () => {
  const _handlers: Record<string, Function[]> = {};
  const _mockPublish = vi.fn((topic: string, payload: string, options: object, cb: (err?: Error | null) => void) => {
    if (cb) cb(null);
  });

  const mockClient = {
    on: vi.fn((event: string, handler: Function) => {
      if (!_handlers[event]) _handlers[event] = [];
      _handlers[event].push(handler);
    }),
    publish: _mockPublish,
  };

  return {
    default: {
      connect: vi.fn(() => mockClient),
    },
    _handlers,
    _mockPublish,
  };
});

vi.mock('../../models', () => ({
  DeviceModel: {
    findAll: vi.fn(),
  },
}));

import { _handlers, _mockPublish } from 'mqtt';
import { DeviceModel } from '../../models';
import { publish, notifyStoreSync, notifyCampaignExpired } from '../../services/mqtt-publisher';

describe('MQTT Publisher Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset isConnected by triggering close handlers
        (_handlers['close'] || []).forEach((h: Function) => h());
  });

  function triggerConnect() {
    (_handlers['connect'] || []).forEach((h: Function) => h());
  }

  describe('publish', () => {
    it('should fallback to console log when MQTT is not connected', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await publish('test/topic', { msg: 'hello' });

      expect(logSpy).toHaveBeenCalledWith(
        '[MQTT:PUBLISH:FALLBACK]',
        expect.objectContaining({
          topic: 'test/topic',
          message: { msg: 'hello' },
        })
      );
      logSpy.mockRestore();
    });

    it('should publish via mqttClient when connected', async () => {
      triggerConnect();
      await publish('test/topic', { msg: 'hello' }, { qos: 1 });

      expect(_mockPublish).toHaveBeenCalledWith(
        'test/topic',
        JSON.stringify({ msg: 'hello' }),
        { qos: 1 },
        expect.any(Function)
      );
    });

    it('should reject when mqtt publish returns error', async () => {
      triggerConnect();
      _mockPublish.mockImplementationOnce((topic: string, payload: string, options: object, cb: (err?: Error | null) => void) => {
        cb(new Error('publish failed'));
      });

      await expect(publish('test/topic', { msg: 'hello' })).rejects.toThrow('publish failed');
    });
  });

  describe('notifyStoreSync', () => {
    it('should publish to device sync topics for online devices', async () => {
      triggerConnect();
      (DeviceModel.findAll as any).mockResolvedValue([
        { deviceId: 'device-1' },
        { deviceId: 'device-2' },
      ]);

      await notifyStoreSync([1, 2], 5, 'campaign_published');

      expect(DeviceModel.findAll).toHaveBeenCalledWith({
        where: { storeId: [1, 2], status: 'online' },
      });
      expect(_mockPublish).toHaveBeenCalledTimes(2);
      expect(_mockPublish).toHaveBeenCalledWith(
        'vdeio/device/device-1/sync',
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
      expect(_mockPublish).toHaveBeenCalledWith(
        'vdeio/device/device-2/sync',
        expect.any(String),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should do nothing when no online devices found', async () => {
      triggerConnect();
      (DeviceModel.findAll as any).mockResolvedValue([]);

      await notifyStoreSync([1], 5, 'campaign_published');

      expect(DeviceModel.findAll).toHaveBeenCalled();
      expect(_mockPublish).not.toHaveBeenCalled();
    });
  });

  describe('notifyCampaignExpired', () => {
    it('should call notifyStoreSync with campaign_expired type', async () => {
      triggerConnect();
      (DeviceModel.findAll as any).mockResolvedValue([
        { deviceId: 'device-1' },
      ]);

      await notifyCampaignExpired(5, [1]);

      expect(DeviceModel.findAll).toHaveBeenCalledWith({
        where: { storeId: [1], status: 'online' },
      });
      expect(_mockPublish).toHaveBeenCalledTimes(1);
      expect(_mockPublish).toHaveBeenCalledWith(
        'vdeio/device/device-1/sync',
        expect.stringContaining('campaign_expired'),
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});
