import { DeviceModel, DeviceTelemetryModel } from '../models';
import { Op } from 'sequelize';
import { publish } from './mqtt-publisher';
import mqtt from 'mqtt';
import { config } from '../config';

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
    pageSize = 20,
  } = filters;

  const where: any = {};
  if (status) where.status = status;
  if (storeId) where.store_id = storeId;

  const { rows, count } = await DeviceModel.findAndCountAll({
    where,
    order: [['last_online_at', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  // Fetch latest telemetry for each device (MySQL compatible — no GROUP BY)
  const deviceIds = rows.map((d) => d.deviceId);
  if (deviceIds.length === 0) {
    return { rows: rows.map((device) => ({ ...device.toJSON(), latestTelemetry: null })), count };
  }

  // Get the most recent telemetry ID per device via raw query
  const latestTelemetries: any[] = [];
  for (const deviceId of deviceIds) {
    const t = await DeviceTelemetryModel.findOne({
      where: { deviceId },
      order: [['created_at', 'DESC']],
      raw: true,
    });
    if (t) latestTelemetries.push(t);
  }

  const telemetryMap = new Map<string, any>();
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
): Promise<any[]> {
  const device = await DeviceModel.findOne({ where: { deviceId } });
  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  const telemetries = await DeviceTelemetryModel.findAll({
    where: { deviceId },
    order: [['created_at', 'DESC']],
    limit: Math.min(limit, 500),
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
  if (process.env.DB_DIALECT === 'sqlite') {
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
