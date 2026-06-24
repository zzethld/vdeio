import type { BrowserWindow } from 'electron';
import { getVideosDir } from './lib/app-paths.js';
import { collectTelemetry } from './lib/system-info.js';
import { MqttTransport } from './mqtt/transport.js';
import { OfflineQueue } from './mqtt/offline-queue.js';
import { routeCommand, type RemoteCommand } from './mqtt/command-router.js';

// Re-export public types so callers importing from `electron/mqtt-bridge`
// keep working after the split.
export type { RemoteCommand } from './mqtt/command-router.js';
export type { TelemetryPayload } from './lib/system-info.js';
export type { QueuedMessage } from './mqtt/offline-queue.js';

// --- Types ---

interface MqttBridgeOptions {
  dataPath: string;
  mainWindow: BrowserWindow | null;
  onCommand?: (command: RemoteCommand) => void;
}

// --- Constants ---

const TELEMETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// --- MqttBridge ---
//
// Coordinator over four focused collaborators:
//   - MqttTransport      : MQTT.js connect/publish/subscribe lifecycle
//   - OfflineQueue       : buffers messages while the transport is down
//   - routeCommand       : parses & dispatches inbound command messages
//   - collectTelemetry   : gathers CPU/memory/disk/cache metrics
//
// Topic names, will/birth message shapes, command payloads, and the IPC
// channel name (`mqtt:command`) are unchanged from the pre-split module.

export class MqttBridge {
  private readonly transport = new MqttTransport();
  private readonly offlineQueue = new OfflineQueue();
  private deviceId: string | null = null;
  private readonly dataPath: string;
  private readonly videosDir: string;
  private mainWindow: BrowserWindow | null = null;
  private readonly onCommand: ((command: RemoteCommand) => void) | null = null;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly appStartTime = Date.now();

  constructor(options: MqttBridgeOptions) {
    this.dataPath = options.dataPath;
    this.videosDir = getVideosDir(options.dataPath);
    this.mainWindow = options.mainWindow;
    this.onCommand = options.onCommand || null;
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  connect(deviceId: string, deviceToken: string, brokerUrl?: string): void {
    this.deviceId = deviceId;
    const url = brokerUrl || 'mqtt://localhost:1883';
    const statusTopic = `vdeio/device/${deviceId}/status`;
    const commandTopic = `vdeio/device/${deviceId}/command`;

    console.log(`[MqttBridge] Connecting as device ${deviceId}`);

    this.transport.connect({
      clientId: `vdeio-device-${deviceId}`,
      username: deviceId,
      password: deviceToken,
      brokerUrl: url,
      will: {
        topic: statusTopic,
        payload: JSON.stringify({ status: 'offline', deviceId, timestamp: new Date().toISOString() }),
        qos: 1,
        retain: true,
      },
      onConnect: () => this.onTransportConnect(statusTopic, commandTopic),
      onMessage: (topic, payload) => {
        if (topic === commandTopic) {
          this.handleCommand(payload);
        }
      },
      onOffline: () => this.stopTelemetry(),
      onClose: () => this.stopTelemetry(),
      onError: (err) => console.error('[MqttBridge] Connection error:', err.message),
      onReconnect: () => console.log('[MqttBridge] Reconnecting...'),
    });
  }

  private onTransportConnect(statusTopic: string, commandTopic: string): void {
    // Birth (online) message
    this.transport.publish(
      statusTopic,
      JSON.stringify({ status: 'online', deviceId: this.deviceId, timestamp: new Date().toISOString() }),
      { qos: 1, retain: true },
    );
    // Subscribe to command topic
    this.transport.subscribe(commandTopic, { qos: 1 });
    // Flush anything buffered while offline
    this.flushOfflineQueue();
    // Begin periodic telemetry reporting
    this.startTelemetry();
  }

  private handleCommand(messageStr: string): void {
    const cmd = routeCommand(messageStr, {
      videosDir: this.videosDir,
      getMainWindow: () => this.mainWindow,
    });
    if (cmd && this.onCommand) {
      this.onCommand(cmd);
    }
  }

  disconnect(): void {
    if (this.deviceId) {
      const statusTopic = `vdeio/device/${this.deviceId}/status`;
      this.transport.disconnect({ statusTopic, deviceId: this.deviceId });
    } else {
      this.transport.disconnect();
    }
    this.stopTelemetry();
  }

  isConnected(): boolean {
    return this.transport.isConnected();
  }

  // --- Telemetry ---

  private startTelemetry(): void {
    this.stopTelemetry();
    // Send immediately on connect.
    this.reportTelemetry();
    this.telemetryTimer = setInterval(() => {
      this.reportTelemetry();
    }, TELEMETRY_INTERVAL_MS);
  }

  private stopTelemetry(): void {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
  }

  private async reportTelemetry(): Promise<void> {
    if (!this.deviceId) return;

    try {
      const telemetry = await collectTelemetry({
        deviceId: this.deviceId,
        dataPath: this.dataPath,
        videosDir: this.videosDir,
        appStartTime: this.appStartTime,
        network: this.transport.isConnected() ? 'online' : 'offline',
      });
      const topic = `vdeio/device/${this.deviceId}/telemetry`;
      const payload = JSON.stringify(telemetry);

      if (this.transport.isConnected()) {
        this.transport.publish(topic, payload, { qos: 1 }, (err) => {
          if (err) {
            console.error('[MqttBridge] Telemetry publish error:', err.message);
            this.offlineQueue.enqueue(topic, payload);
          }
        });
      } else {
        this.offlineQueue.enqueue(topic, payload);
      }
    } catch (err) {
      console.error('[MqttBridge] Telemetry collection error:', err);
    }
  }

  // --- Offline Queue ---

  private flushOfflineQueue(): void {
    if (this.offlineQueue.length === 0) return;
    const messages = this.offlineQueue.drain();
    console.log(`[MqttBridge] Flushing ${messages.length} queued messages`);
    for (const msg of messages) {
      this.transport.publish(msg.topic, msg.payload, { qos: 1 }, (err) => {
        if (err) {
          console.error('[MqttBridge] Failed to flush queued message:', err.message);
        }
      });
    }
  }
}
