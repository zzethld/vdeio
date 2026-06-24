import { DeviceModel, DeviceTelemetryModel, DeviceTelemetry } from '../models';
import { Op, Sequelize, WhereOptions, Attributes } from 'sequelize';
import { publish } from './mqtt-publisher';
import mqtt from 'mqtt';
import { config } from '../config';
import {
  DEFAULT_PAGE_SIZE,
  TELEMETRY_HISTORY_MAX_LIMIT,
  isSqliteDev,
} from '../config/constants';

export interface TelemetryPayload {
  cpu?: number;
  memory?: number;
  disk?: number;
  diskFree?: number;
  cacheSize?: number;
  appVersion?: string;
  uptime?: number;
  network?: string;
}

export interface DeviceFilters {
  status?: 'online' | 'offline';
  storeId?: number;
  page?: number;
  pageSize?: number;
}

/**
 * Handle device connect event from EMQX webhook.
 * Updates device status to 'online' and sets lastOnlineAt.
 */
export async function handleDeviceConnect(deviceId: string): Promise<void> {
  const device = await DeviceModel.findOne({ where: { deviceId } });
  if (!device) {
    console.warn(`[DeviceMonitor] Connect event for unknown device: ${deviceId}`);
    return;
  }

  await device.update({
    status: 'online',
    lastOnlineAt: new Date(),
  });

  console.log(`[DeviceMonitor] Device ${deviceId} connected`);
}

/**
 * Handle device disconnect event from EMQX webhook.
 * Updates device status to 'offline' and sets lastOnlineAt.
 */
export async function handleDeviceDisconnect(deviceId: string): Promise<void> {
  const device = await DeviceModel.findOne({ where: { deviceId } });
  if (!device) {
    console.warn(`[DeviceMonitor] Disconnect event for unknown device: ${deviceId}`);
    return;
  }

  await device.update({
    status: 'offline',
    lastOnlineAt: new Date(),
  });

  console.log(`[DeviceMonitor] Device ${deviceId} disconnected`);
}

/**
 * Store telemetry data for a device.
 */
export async function storeTelemetry(
  deviceId: string,
  data: TelemetryPayload
): Promise<void> {
  const device = await DeviceModel.findOne({ where: { deviceId } });
  if (!device) {
    console.warn(`[DeviceMonitor] Telemetry for unknown device: ${deviceId}`);
    return;
  }

  await DeviceTelemetryModel.create({
    deviceId,
    cpu: data.cpu ?? 0,
    memory: data.memory ?? 0,
    disk: data.disk ?? 0,
    diskFree: data.diskFree ?? 0,
    cacheSize: data.cacheSize ?? 0,
    appVersion: data.appVersion ?? '',
    uptime: data.uptime ?? 0,
    network: data.network ?? 'offline',
  });

  // Also update device appVersion if provided
  if (data.appVersion && data.appVersion !== device.appVersion) {
    await device.update({ appVersion: data.appVersion });
  }

  console.log(`[DeviceMonitor] Telemetry stored for ${deviceId}`);
}

/**
 * Send a remote command to a device via MQTT.
 */
export async function sendCommand(
  deviceId: string,
  command: string,
  payload?: object
): Promise<void> {
  const device = await DeviceModel.findOne({ where: { deviceId } });
  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  const topic = `vdeio/device/${deviceId}/command`;
  const message = {
    command,
    payload,
    ts: Date.now(),
  };

  await publish(topic, message, { qos: 1 });
  console.log(`[DeviceMonitor] Command '${command}' sent to ${deviceId}`);
}

/**
 * Get paginated device list with optional status filter.
 */
export async function getDeviceList(filters: DeviceFilters = {}) {
  const {
    status,
    storeId,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = filters;

  // NOTE: `store_id` is the snake_case column name retained verbatim for
  // compatibility with callers/tests that assert on this exact where shape.
  // Bare `WhereOptions` (default generic) is used because the clause mixes a
  // camelCase attribute (`status`) with a snake_case column key (`store_id`),
  // which a model-attribute-keyed WhereOptions rejects.
  const where: WhereOptions = {
    ...(status ? { status } : {}),
    ...(storeId ? { store_id: storeId } : {}),
  };

  const { rows, count } = await DeviceModel.findAndCountAll({
    where,
    order: [['last_online_at', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  // Fetch latest telemetry for each device.
  // Single query (NOT an N+1 loop) using a correlated subquery that selects
  // the row whose `created_at` equals MAX(created_at) for that device.
  // This pattern is compatible with strict MySQL sql_mode=only_full_group_by
  // and SQLite (SQLite accepts backtick identifier quoting as an extension).
  const deviceIds = rows.map((d) => d.deviceId);
  if (deviceIds.length === 0) {
    return { rows: rows.map((device) => ({ ...device.toJSON(), latestTelemetry: null })), count };
  }

  const latestTelemetries: Attributes<DeviceTelemetry>[] = await DeviceTelemetryModel.findAll({
    where: {
      deviceId: { [Op.in]: deviceIds },
      [Op.and]: Sequelize.where(
        Sequelize.col('created_at'),
        Op.eq,
        Sequelize.literal(`(
          SELECT MAX(dt2.created_at)
          FROM device_telemetries AS dt2
          WHERE dt2.device_id = \`DeviceTelemetry\`.\`device_id\`
        )`)
      ),
    },
    raw: true,
  });

  const telemetryMap = new Map<string, Attributes<DeviceTelemetry>>();
  for (const t of latestTelemetries) {
    telemetryMap.set(t.deviceId, t);
  }

  const devicesWithTelemetry = rows.map((device) => ({
    ...device.toJSON(),
    latestTelemetry: telemetryMap.get(device.deviceId) || null,
  }));

  return {
    rows: devicesWithTelemetry,
    count,
    page,
    pageSize,
  };
}

/**
 * Get telemetry history for a device.
 */
export async function getDeviceTelemetry(
  deviceId: string,
  limit: number = 100
): Promise<Attributes<DeviceTelemetry>[]> {
  const device = await DeviceModel.findOne({ where: { deviceId } });
  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  const telemetries = await DeviceTelemetryModel.findAll({
    where: { deviceId },
    order: [['created_at', 'DESC']],
    limit: Math.min(limit, TELEMETRY_HISTORY_MAX_LIMIT),
  });

  return telemetries.map((t) => t.toJSON());
}

let mqttSubscriberClient: mqtt.MqttClient | null = null;

/**
 * Start MQTT subscriber for device telemetry messages.
 * Subscribes to vdeio/device/+/telemetry and stores telemetry data.
 */
export function startTelemetrySubscriber(): void {
  if (mqttSubscriberClient) {
    console.log('[DeviceMonitor] Telemetry subscriber already started');
    return;
  }

  // Skip MQTT in dev mode when using SQLite (no EMQX available)
  if (isSqliteDev) {
    console.log('[DeviceMonitor] Skipping MQTT subscriber (dev mode with SQLite)');
    return;
  }

  mqttSubscriberClient = mqtt.connect(config.mqtt.brokerUrl, {
    clientId: 'vdeio-server-monitor',
    username: config.mqtt.username || undefined,
    password: config.mqtt.password || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
  });

  mqttSubscriberClient.on('connect', () => {
    console.log('[DeviceMonitor] Telemetry subscriber connected');
    mqttSubscriberClient!.subscribe('vdeio/device/+/telemetry', { qos: 1 }, (err) => {
      if (err) {
        console.error('[DeviceMonitor] Failed to subscribe to telemetry topic:', err.message);
      } else {
        console.log('[DeviceMonitor] Subscribed to vdeio/device/+/telemetry');
      }
    });
  });

  mqttSubscriberClient.on('message', (topic, message) => {
    const match = topic.match(/vdeio\/device\/(.+)\/telemetry/);
    if (match) {
      const deviceId = match[1];
      try {
        const data = JSON.parse(message.toString());
        storeTelemetry(deviceId, data);
      } catch {
        // ignore parse errors
      }
    }
  });

  mqttSubscriberClient.on('error', (err) => {
    console.error('[DeviceMonitor] MQTT subscriber error:', err.message);
  });

  mqttSubscriberClient.on('close', () => {
    console.log('[DeviceMonitor] MQTT subscriber connection closed');
  });
}
