import mqtt from 'mqtt';
import { config } from '../config';
import { DeviceModel } from '../models';

const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || 'vdeio-server';

let client: mqtt.MqttClient | null = null;
let isConnected = false;

function getClient(): mqtt.MqttClient | null {
  if (client) return client;

  try {
    client = mqtt.connect(config.mqtt.brokerUrl, {
      clientId: MQTT_CLIENT_ID,
      username: config.mqtt.username || undefined,
      password: config.mqtt.password || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    });

    client.on('connect', () => {
      isConnected = true;
      console.log('[MQTT] Connected to broker');
    });

    client.on('error', (err) => {
      console.error('[MQTT] Connection error:', err.message);
      isConnected = false;
    });

    client.on('close', () => {
      isConnected = false;
      console.log('[MQTT] Connection closed');
    });

    client.on('offline', () => {
      isConnected = false;
      console.log('[MQTT] Client offline');
    });

    return client;
  } catch (err) {
    console.error('[MQTT] Failed to create client:', err);
    return null;
  }
}

// Initialize client on module load
getClient();

/**
 * Publish a message to an MQTT topic.
 * Falls back to console logging if MQTT is unavailable (MVP mode).
 */
export async function publish(
  topic: string,
  message: object,
  options?: { qos?: number }
): Promise<void> {
  const payload = JSON.stringify(message);
  const qos = options?.qos ?? 0;

  const mqttClient = getClient();

  if (mqttClient && isConnected) {
    return new Promise((resolve, reject) => {
      mqttClient.publish(topic, payload, { qos: qos as 0 | 1 | 2 }, (err) => {
        if (err) {
          console.error('[MQTT] Publish error:', err.message);
          reject(err);
        } else {
          console.log('[MQTT:PUBLISH]', { topic, qos, ts: new Date().toISOString() });
          resolve();
        }
      });
    });
  }

  // MVP fallback: log to console when MQTT broker is unavailable
  console.log('[MQTT:PUBLISH:FALLBACK]', {
    topic,
    message,
    qos,
    ts: new Date().toISOString(),
    note: 'MQTT broker unavailable, logged for debug',
  });
}

/**
 * Notify online devices at given stores to sync campaign data.
 */
export async function notifyStoreSync(
  storeIds: number[],
  campaignId: number,
  type: string
): Promise<void> {
  const devices = await DeviceModel.findAll({
    where: {
      storeId: storeIds,
      status: 'online',
    },
  });

  for (const device of devices) {
    const topic = `vdeio/device/${device.deviceId}/sync`;
    await publish(topic, { type, campaignId, ts: Date.now() });
  }
}

/**
 * Notify stores that a campaign has expired.
 */
export async function notifyCampaignExpired(
  campaignId: number,
  storeIds: number[]
): Promise<void> {
  await notifyStoreSync(storeIds, campaignId, 'campaign_expired');
}
