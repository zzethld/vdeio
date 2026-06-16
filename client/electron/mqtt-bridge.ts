import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as mqtt from 'mqtt';
import { app, BrowserWindow } from 'electron';

const execAsync = promisify(exec);

// --- Types ---

interface TelemetryPayload {
  deviceId: string;
  timestamp: string;
  cpu: number;
  memory: number;
  disk: number;
  diskFree: number;
  cacheSize: number;
  appVersion: string;
  uptime: number;
  network: 'online' | 'offline';
}

interface RemoteCommand {
  command: 'restart' | 'sync' | 'clear-cache';
  payload?: Record<string, unknown>;
}

interface QueuedMessage {
  timestamp: number;
  topic: string;
  payload: string;
}

interface MqttBridgeOptions {
  dataPath: string;
  mainWindow: BrowserWindow | null;
  onCommand?: (command: RemoteCommand) => void;
}

// --- Constants ---

const TELEMETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const OFFLINE_QUEUE_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

// --- MqttBridge ---

export class MqttBridge {
  private client: mqtt.MqttClient | null = null;
  private deviceId: string | null = null;
  private dataPath: string;
  private videosDir: string;
  private mainWindow: BrowserWindow | null = null;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private offlineQueue: QueuedMessage[] = [];
  private connected = false;
  private onCommand: ((command: RemoteCommand) => void) | null = null;
  private appStartTime = Date.now();

  constructor(options: MqttBridgeOptions) {
    this.dataPath = options.dataPath;
    this.videosDir = path.join(options.dataPath, 'videos');
    this.mainWindow = options.mainWindow;
    this.onCommand = options.onCommand || null;
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  connect(deviceId: string, deviceToken: string, brokerUrl?: string): void {
    if (this.client) {
      console.warn('[MqttBridge] Already connected, disconnecting first');
      this.disconnect();
    }

    this.deviceId = deviceId;
    const url = brokerUrl || 'mqtt://localhost:1883';
    const statusTopic = `vdeio/device/${deviceId}/status`;
    const commandTopic = `vdeio/device/${deviceId}/command`;

    console.log(`[MqttBridge] Connecting to ${url} as device ${deviceId}`);

    this.client = mqtt.connect(url, {
      clientId: `vdeio-device-${deviceId}`,
      username: deviceId,
      password: deviceToken,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      keepalive: 60,
      will: {
        topic: statusTopic,
        payload: JSON.stringify({ status: 'offline', deviceId, timestamp: new Date().toISOString() }),
        qos: 1,
        retain: true,
      },
    });

    this.client.on('connect', () => {
      console.log('[MqttBridge] Connected to broker');
      this.connected = true;

      // Publish birth (online) message
      this.client!.publish(
        statusTopic,
        JSON.stringify({ status: 'online', deviceId, timestamp: new Date().toISOString() }),
        { qos: 1, retain: true },
      );

      // Subscribe to command topic
      this.client!.subscribe(commandTopic, { qos: 1 }, (err) => {
        if (err) {
          console.error('[MqttBridge] Subscribe error:', err);
        } else {
          console.log(`[MqttBridge] Subscribed to ${commandTopic}`);
        }
      });

      // Flush offline queue
      this.flushOfflineQueue();

      // Start telemetry reporting
      this.startTelemetry();
    });

    this.client.on('message', (topic, message) => {
      if (topic === commandTopic) {
        this.handleCommand(message.toString());
      }
    });

    this.client.on('error', (err) => {
      console.error('[MqttBridge] Connection error:', err.message);
    });

    this.client.on('offline', () => {
      console.log('[MqttBridge] Client went offline');
      this.connected = false;
      this.stopTelemetry();
    });

    this.client.on('reconnect', () => {
      console.log('[MqttBridge] Reconnecting...');
    });

    this.client.on('close', () => {
      console.log('[MqttBridge] Connection closed');
      this.connected = false;
      this.stopTelemetry();
    });
  }

  disconnect(): void {
    if (this.client) {
      // Publish offline status before disconnecting
      if (this.deviceId) {
        const statusTopic = `vdeio/device/${this.deviceId}/status`;
        this.client.publish(
          statusTopic,
          JSON.stringify({ status: 'offline', deviceId: this.deviceId, timestamp: new Date().toISOString() }),
          { qos: 1, retain: true },
        );
      }

      this.stopTelemetry();
      this.client.end(true);
      this.client = null;
      this.connected = false;
      console.log('[MqttBridge] Disconnected');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // --- Telemetry ---

  private startTelemetry(): void {
    this.stopTelemetry();
    // Send immediately on connect
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
      const telemetry = await this.collectTelemetry();
      const topic = `vdeio/device/${this.deviceId}/telemetry`;
      const payload = JSON.stringify(telemetry);

      if (this.connected && this.client) {
        this.client.publish(topic, payload, { qos: 1 }, (err) => {
          if (err) {
            console.error('[MqttBridge] Telemetry publish error:', err.message);
            this.enqueueMessage(topic, payload);
          }
        });
      } else {
        // Queue for later
        this.enqueueMessage(topic, payload);
      }
    } catch (err) {
      console.error('[MqttBridge] Telemetry collection error:', err);
    }
  }

  private async collectTelemetry(): Promise<TelemetryPayload> {
    const cpuUsage = this.getCpuUsage();
    const memUsage = this.getMemoryUsage();
    const diskInfo = await this.getDiskInfo();
    const cacheSize = this.getCacheSize();

    return {
      deviceId: this.deviceId!,
      timestamp: new Date().toISOString(),
      cpu: cpuUsage,
      memory: memUsage,
      disk: diskInfo.usagePercent,
      diskFree: diskInfo.freeGB,
      cacheSize,
      appVersion: app.getVersion(),
      uptime: Math.floor((Date.now() - this.appStartTime) / 1000),
      network: this.connected ? 'online' : 'offline',
    };
  }

  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as Record<string, number>)[type];
      }
      totalIdle += cpu.times.idle;
    }

    const totalDiff = totalTick;
    const idleDiff = totalIdle;
    if (totalDiff === 0) return 0;
    return Math.round(((totalDiff - idleDiff) / totalDiff) * 100 * 10) / 10;
  }

  private getMemoryUsage(): number {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    if (totalMem === 0) return 0;
    return Math.round(((totalMem - freeMem) / totalMem) * 100 * 10) / 10;
  }

  private async getDiskInfo(): Promise<{ usagePercent: number; freeGB: number }> {
    try {
      if (process.platform === 'win32') {
        const drive = path.parse(this.dataPath).root;
        const driveLetter = drive.replace('\\', '');
        const { stdout } = await execAsync(
          `wmic logicaldisk where "DeviceID='${driveLetter}'" get FreeSpace,Size /format:list`,
          { timeout: 5000 },
        );
        const freeMatch = stdout.match(/FreeSpace=(\d+)/);
        const sizeMatch = stdout.match(/Size=(\d+)/);
        if (freeMatch && sizeMatch) {
          const free = parseInt(freeMatch[1], 10);
          const total = parseInt(sizeMatch[1], 10);
          const freeGB = Math.round((free / (1024 * 1024 * 1024)) * 10) / 10;
          const usagePercent = total > 0 ? Math.round(((total - free) / total) * 100 * 10) / 10 : 0;
          return { usagePercent, freeGB };
        }
      }
      // Unix fallback
      const { stdout } = await execAsync(`df -k "${this.dataPath}"`, { timeout: 5000 });
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].trim().split(/\s+/);
        const total = parseInt(parts[1], 10) * 1024; // KB to bytes
        const free = parseInt(parts[3], 10) * 1024;
        const freeGB = Math.round((free / (1024 * 1024 * 1024)) * 10) / 10;
        const usagePercent = total > 0 ? Math.round(((total - free) / total) * 100 * 10) / 10 : 0;
        return { usagePercent, freeGB };
      }
    } catch {
      // ignore
    }
    return { usagePercent: 0, freeGB: 0 };
  }

  private getCacheSize(): number {
    return this.getDirectorySize(this.videosDir);
  }

  private getDirectorySize(dirPath: string): number {
    let totalSize = 0;
    if (!fs.existsSync(dirPath)) return 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            totalSize += stat.size;
          } catch { /* skip */ }
        } else if (entry.isDirectory()) {
          totalSize += this.getDirectorySize(fullPath);
        }
      }
    } catch { /* skip */ }
    return totalSize;
  }

  // --- Command Handling ---

  private handleCommand(messageStr: string): void {
    try {
      const cmd = JSON.parse(messageStr) as RemoteCommand;
      console.log(`[MqttBridge] Received command: ${cmd.command}`);

      switch (cmd.command) {
        case 'restart':
          this.handleRestart();
          break;
        case 'sync':
          this.handleSync();
          break;
        case 'clear-cache':
          this.handleClearCache();
          break;
        default:
          console.warn(`[MqttBridge] Unknown command: ${cmd.command}`);
      }

      // Forward to callback if registered
      if (this.onCommand) {
        this.onCommand(cmd);
      }
    } catch (err) {
      console.error('[MqttBridge] Failed to parse command:', err);
    }
  }

  private handleRestart(): void {
    console.log('[MqttBridge] Executing restart command');
    app.relaunch();
    app.exit(0);
  }

  private handleSync(): void {
    console.log('[MqttBridge] Executing sync command');
    // Notify renderer to trigger sync
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('mqtt:command', { command: 'sync' });
    }
  }

  private handleClearCache(): void {
    console.log('[MqttBridge] Executing clear-cache command');
    try {
      if (fs.existsSync(this.videosDir)) {
        const entries = fs.readdirSync(this.videosDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(this.videosDir, entry.name);
            fs.rmSync(fullPath, { recursive: true, force: true });
          }
        }
        console.log('[MqttBridge] Cache cleared');
      }

      // Notify renderer
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('mqtt:command', { command: 'clear-cache' });
      }
    } catch (err) {
      console.error('[MqttBridge] Failed to clear cache:', err);
    }
  }

  // --- Offline Queue ---

  private enqueueMessage(topic: string, payload: string): void {
    this.offlineQueue.push({
      timestamp: Date.now(),
      topic,
      payload,
    });
    // Prune messages older than 48h
    const cutoff = Date.now() - OFFLINE_QUEUE_MAX_AGE_MS;
    this.offlineQueue = this.offlineQueue.filter((msg) => msg.timestamp > cutoff);
  }

  private flushOfflineQueue(): void {
    if (this.offlineQueue.length === 0) return;

    // Prune expired messages first
    const cutoff = Date.now() - OFFLINE_QUEUE_MAX_AGE_MS;
    this.offlineQueue = this.offlineQueue.filter((msg) => msg.timestamp > cutoff);

    console.log(`[MqttBridge] Flushing ${this.offlineQueue.length} queued messages`);

    for (const msg of this.offlineQueue) {
      if (this.client) {
        this.client.publish(msg.topic, msg.payload, { qos: 1 }, (err) => {
          if (err) {
            console.error('[MqttBridge] Failed to flush queued message:', err.message);
          }
        });
      }
    }

    this.offlineQueue = [];
  }
}
