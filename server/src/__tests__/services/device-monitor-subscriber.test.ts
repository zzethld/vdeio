import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for startTelemetrySubscriber in device-monitor.
 *
 * The real startTelemetrySubscriber() short-circuits when DB_DIALECT=sqlite
 * (no EMQX broker in dev mode). To exercise the message handler we:
 *
 *   1. Mock the `mqtt` module so .connect() returns a stub MqttClient whose
 *      'message' listeners we capture and invoke.
 *   2. Mock the models so storeTelemetry's findOne/create calls can be
 *      asserted on without touching a database.
 *   3. Force DB_DIALECT != 'sqlite' so the subscriber's early-return guard
 *      is bypassed.
 *
 * The storeTelemetry call site is an intra-module call, so spying on the
 * named export does not intercept it — we assert on the mocked models instead.
 */

// --- Stub mqtt client -------------------------------------------------------

type Handler = (...args: any[]) => void;

type MockFn = ReturnType<typeof vi.fn>;

interface StubClient {
  on: MockFn;
  subscribe: MockFn;
  end: MockFn;
  __handlers: Map<string, Handler[]>;
}

function makeStubClient(): StubClient {
  const handlers: Map<string, Handler[]> = new Map();
  return {
    on: vi.fn((event: string, handler: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }),
    subscribe: vi.fn((_topic: string, _opts: any, cb?: (err?: Error) => void) => {
      if (cb) cb(undefined);
    }),
    end: vi.fn(),
    __handlers: handlers,
  };
}

let stubClient: StubClient;
let originalDialect: string | undefined;

// vi.mock is hoisted; we use vi.hoisted to share the stub client reference.
const mocks = vi.hoisted(() => ({
  DeviceModel: {
    findOne: vi.fn(),
    findAndCountAll: vi.fn(),
  },
  DeviceTelemetryModel: {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
  },
  publish: vi.fn().mockResolvedValue(undefined),
  connectClient: null as unknown as StubClient,
}));

vi.mock('mqtt', () => ({
  default: { connect: () => mocks.connectClient },
  connect: () => mocks.connectClient,
}));

vi.mock('../../models', () => ({
  DeviceModel: mocks.DeviceModel,
  DeviceTelemetryModel: mocks.DeviceTelemetryModel,
}));

vi.mock('../../services/mqtt-publisher', () => ({ publish: mocks.publish }));

beforeEach(() => {
  originalDialect = process.env.DB_DIALECT;
  process.env.DB_DIALECT = 'mysql';

  stubClient = makeStubClient();
  mocks.connectClient = stubClient;

  vi.clearAllMocks();
});

afterEach(() => {
  if (originalDialect === undefined) delete process.env.DB_DIALECT;
  else process.env.DB_DIALECT = originalDialect;
  vi.resetModules();
});

describe('startTelemetrySubscriber', () => {
  it('subscribes to vdeio/device/+/telemetry on connect and logs the subscription', async () => {
    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    startTelemetrySubscriber();

    const connectHandlers = stubClient.__handlers.get('connect') ?? [];
    expect(connectHandlers.length).toBeGreaterThan(0);
    for (const h of connectHandlers) h();

    expect(stubClient.subscribe).toHaveBeenCalledWith(
      'vdeio/device/+/telemetry',
      { qos: 1 },
      expect.any(Function),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Subscribed to vdeio/device/+/telemetry'),
    );
    logSpy.mockRestore();
  });

  it('logs an error when subscribe fails', async () => {
    stubClient.subscribe.mockImplementationOnce(
      (_t: string, _o: any, cb: (err?: Error) => void) => {
        cb(new Error('subscription denied'));
      },
    );

    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    startTelemetrySubscriber();

    const connectHandlers = stubClient.__handlers.get('connect') ?? [];
    for (const h of connectHandlers) h();

    expect(errSpy).toHaveBeenCalledWith(
      '[DeviceMonitor] Failed to subscribe to telemetry topic:',
      'subscription denied',
    );
    errSpy.mockRestore();
  });

  it('parses telemetry JSON from the topic and forwards it to storeTelemetry', async () => {
    const fakeDevice = { deviceId: 'dev-mqtt-001', appVersion: '1.0.0', update: vi.fn() };
    mocks.DeviceModel.findOne.mockResolvedValue(fakeDevice);
    mocks.DeviceTelemetryModel.create.mockResolvedValue({ id: 1 });

    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    startTelemetrySubscriber();

    const messageHandlers = stubClient.__handlers.get('message') ?? [];
    expect(messageHandlers.length).toBeGreaterThan(0);

    const payload = { cpu: 55, memory: 65, network: 'wifi' };
    for (const h of messageHandlers) {
      h('vdeio/device/dev-mqtt-001/telemetry', Buffer.from(JSON.stringify(payload)));
    }

    // storeTelemetry is async (fire-and-forget inside the message handler)
    await new Promise((r) => setImmediate(r));

    expect(mocks.DeviceModel.findOne).toHaveBeenCalledWith({
      where: { deviceId: 'dev-mqtt-001' },
    });
    expect(mocks.DeviceTelemetryModel.create).toHaveBeenCalledWith({
      deviceId: 'dev-mqtt-001',
      cpu: 55,
      memory: 65,
      disk: 0,
      diskFree: 0,
      cacheSize: 0,
      appVersion: '',
      uptime: 0,
      network: 'wifi',
    });
  });

  it('applies storeTelemetry defaults when payload omits optional fields', async () => {
    const fakeDevice = { deviceId: 'dev-defaults', appVersion: '2.0.0', update: vi.fn() };
    mocks.DeviceModel.findOne.mockResolvedValue(fakeDevice);
    mocks.DeviceTelemetryModel.create.mockResolvedValue({ id: 2 });

    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    startTelemetrySubscriber();

    const handlers = stubClient.__handlers.get('message') ?? [];
    for (const h of handlers) {
      h('vdeio/device/dev-defaults/telemetry', Buffer.from(JSON.stringify({})));
    }
    await new Promise((r) => setImmediate(r));

    expect(mocks.DeviceTelemetryModel.create).toHaveBeenCalledWith({
      deviceId: 'dev-defaults',
      cpu: 0,
      memory: 0,
      disk: 0,
      diskFree: 0,
      cacheSize: 0,
      appVersion: '',
      uptime: 0,
      network: 'offline',
    });
  });

  it('updates the device appVersion when telemetry reports a newer one', async () => {
    const updateSpy = vi.fn().mockResolvedValue(true);
    mocks.DeviceModel.findOne.mockResolvedValue({
      deviceId: 'dev-ver',
      appVersion: '1.0.0',
      update: updateSpy,
    });
    mocks.DeviceTelemetryModel.create.mockResolvedValue({ id: 3 });

    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    startTelemetrySubscriber();

    const handlers = stubClient.__handlers.get('message') ?? [];
    for (const h of handlers) {
      h(
        'vdeio/device/dev-ver/telemetry',
        Buffer.from(JSON.stringify({ appVersion: '2.5.0' })),
      );
    }
    await new Promise((r) => setImmediate(r));

    expect(updateSpy).toHaveBeenCalledWith({ appVersion: '2.5.0' });
  });

  it('does not throw when device is unknown (warns and skips)', async () => {
    mocks.DeviceModel.findOne.mockResolvedValue(null);

    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    startTelemetrySubscriber();

    const handlers = stubClient.__handlers.get('message') ?? [];
    expect(() => {
      for (const h of handlers) {
        h(
          'vdeio/device/unknown-device/telemetry',
          Buffer.from(JSON.stringify({ cpu: 1 })),
        );
      }
    }).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(mocks.DeviceTelemetryModel.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[DeviceMonitor] Telemetry for unknown device: unknown-device',
    );
    warnSpy.mockRestore();
  });

  it('silently ignores malformed JSON payloads (no storeTelemetry call, no throw)', async () => {
    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    startTelemetrySubscriber();

    const handlers = stubClient.__handlers.get('message') ?? [];
    expect(() => {
      for (const h of handlers) {
        h('vdeio/device/dev-bad-json/telemetry', Buffer.from('not-json'));
      }
    }).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(mocks.DeviceModel.findOne).not.toHaveBeenCalled();
    expect(mocks.DeviceTelemetryModel.create).not.toHaveBeenCalled();
  });

  it('ignores messages on topics that do not match the telemetry pattern', async () => {
    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    startTelemetrySubscriber();

    const handlers = stubClient.__handlers.get('message') ?? [];
    for (const h of handlers) {
      h('vdeio/device/dev-1/command', Buffer.from('{}'));
      h('some/other/topic', Buffer.from('{}'));
    }
    await new Promise((r) => setImmediate(r));

    expect(mocks.DeviceModel.findOne).not.toHaveBeenCalled();
    expect(mocks.DeviceTelemetryModel.create).not.toHaveBeenCalled();
  });

  it('is idempotent — second call is a no-op that logs already-started', async () => {
    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    startTelemetrySubscriber();
    startTelemetrySubscriber();

    expect(logSpy).toHaveBeenCalledWith(
      '[DeviceMonitor] Telemetry subscriber already started',
    );
    logSpy.mockRestore();
  });

  it('logs broker errors via the error handler', async () => {
    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    startTelemetrySubscriber();

    const errorHandlers = stubClient.__handlers.get('error') ?? [];
    expect(errorHandlers.length).toBeGreaterThan(0);
    for (const h of errorHandlers) h(new Error('broker timeout'));

    expect(errSpy).toHaveBeenCalledWith(
      '[DeviceMonitor] MQTT subscriber error:',
      'broker timeout',
    );
    errSpy.mockRestore();
  });

  it('logs when the broker connection closes', async () => {
    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    startTelemetrySubscriber();

    const closeHandlers = stubClient.__handlers.get('close') ?? [];
    expect(closeHandlers.length).toBeGreaterThan(0);
    for (const h of closeHandlers) h();

    expect(logSpy).toHaveBeenCalledWith(
      '[DeviceMonitor] MQTT subscriber connection closed',
    );
    logSpy.mockRestore();
  });
});

describe('startTelemetrySubscriber in SQLite dev mode', () => {
  it('skips subscriber setup when DB_DIALECT=sqlite', async () => {
    process.env.DB_DIALECT = 'sqlite';

    const { startTelemetrySubscriber } = await import('../../services/device-monitor');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    startTelemetrySubscriber();

    expect(logSpy).toHaveBeenCalledWith(
      '[DeviceMonitor] Skipping MQTT subscriber (dev mode with SQLite)',
    );
    expect(stubClient.subscribe).not.toHaveBeenCalled();
  });
});
