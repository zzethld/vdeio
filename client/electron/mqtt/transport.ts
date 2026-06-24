import * as mqtt from 'mqtt';

// --- Types ---

/** MQTT Quality of Service level (matches `mqtt-packet` QoS). */
export type QoS = 0 | 1 | 2;

export interface TransportConnectOptions {
  clientId: string;
  username: string;
  password: string;
  brokerUrl: string;
  will: { topic: string; payload: string; qos: QoS; retain: boolean };
  onConnect: () => void;
  onMessage: (topic: string, payload: string) => void;
  onOffline: () => void;
  onClose: () => void;
  onError: (err: Error) => void;
  onReconnect: () => void;
}

export interface PublishOptions {
  qos?: QoS;
  retain?: boolean;
}

export type PublishCallback = (err?: Error) => void;

export interface OfflineStatus {
  statusTopic: string;
  deviceId: string;
}

// --- MqttTransport ---

/**
 * Thin wrapper around MQTT.js. Owns the client lifecycle (connect/disconnect)
 * and tracks connection state. All event handling is delegated to callbacks
 * supplied on `connect()` so the coordinator stays free of broker plumbing.
 */
export class MqttTransport {
  private client: mqtt.MqttClient | null = null;
  private connected = false;

  connect(opts: TransportConnectOptions): void {
    if (this.client) {
      console.warn('[MqttTransport] Already connected, disconnecting first');
      this.disconnect();
    }

    console.log(`[MqttTransport] Connecting to ${opts.brokerUrl} as ${opts.username}`);

    this.client = mqtt.connect(opts.brokerUrl, {
      clientId: opts.clientId,
      username: opts.username,
      password: opts.password,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      keepalive: 60,
      will: opts.will,
    });

    this.client.on('connect', () => {
      console.log('[MqttTransport] Connected to broker');
      this.connected = true;
      opts.onConnect();
    });

    this.client.on('message', (topic, message) => {
      opts.onMessage(topic, message.toString());
    });

    this.client.on('error', (err) => {
      opts.onError(err);
    });

    this.client.on('offline', () => {
      console.log('[MqttTransport] Client went offline');
      this.connected = false;
      opts.onOffline();
    });

    this.client.on('reconnect', () => {
      console.log('[MqttTransport] Reconnecting...');
      opts.onReconnect();
    });

    this.client.on('close', () => {
      console.log('[MqttTransport] Connection closed');
      this.connected = false;
      opts.onClose();
    });
  }

  publish(topic: string, payload: string, options?: PublishOptions, callback?: PublishCallback): void {
    if (!this.client) return;
    if (callback) {
      this.client.publish(topic, payload, options ?? {}, callback);
    } else {
      this.client.publish(topic, payload, options ?? {});
    }
  }

  subscribe(topic: string, options: { qos: QoS }, callback?: (err: Error | null) => void): void {
    if (!this.client) return;
    this.client.subscribe(topic, options, (err) => {
      if (err) {
        console.error('[MqttTransport] Subscribe error:', err);
      } else {
        console.log(`[MqttTransport] Subscribed to ${topic}`);
      }
      if (callback) callback(err);
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Tear down the connection. When `offlineStatus` is supplied, an offline
   * retained message is published first so subscribers see the transition.
   */
  disconnect(offlineStatus?: OfflineStatus): void {
    if (!this.client) return;

    if (offlineStatus) {
      this.client.publish(
        offlineStatus.statusTopic,
        JSON.stringify({
          status: 'offline',
          deviceId: offlineStatus.deviceId,
          timestamp: new Date().toISOString(),
        }),
        { qos: 1, retain: true },
      );
    }

    this.client.end(true);
    this.client = null;
    this.connected = false;
    console.log('[MqttTransport] Disconnected');
  }
}
