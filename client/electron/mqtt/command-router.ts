import * as fs from 'fs';
import * as path from 'path';
import { app, type BrowserWindow } from 'electron';

// --- Types ---

export type RemoteCommandName = 'restart' | 'sync' | 'clear-cache';

export interface RemoteCommand {
  command: RemoteCommandName;
  payload?: Record<string, unknown>;
}

export interface CommandRouterDeps {
  videosDir: string;
  getMainWindow: () => BrowserWindow | null;
}

// --- Helpers ---

function notifyRenderer(win: BrowserWindow | null, command: RemoteCommandName): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('mqtt:command', { command });
  }
}

function handleRestart(): void {
  console.log('[MqttBridge] Executing restart command');
  app.relaunch();
  app.exit(0);
}

function handleSync(win: BrowserWindow | null): void {
  console.log('[MqttBridge] Executing sync command');
  notifyRenderer(win, 'sync');
}

function handleClearCache(deps: CommandRouterDeps): void {
  console.log('[MqttBridge] Executing clear-cache command');
  try {
    if (fs.existsSync(deps.videosDir)) {
      const entries = fs.readdirSync(deps.videosDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(deps.videosDir, entry.name);
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      }
      console.log('[MqttBridge] Cache cleared');
    }
    notifyRenderer(deps.getMainWindow(), 'clear-cache');
  } catch (err) {
    console.error('[MqttBridge] Failed to clear cache:', err);
  }
}

// --- routeCommand ---

/**
 * Parse and dispatch a command message string. Returns the parsed command so
 * the caller can forward it to its own `onCommand` callback, or `null` if the
 * message could not be parsed (in which case nothing is dispatched).
 */
export function routeCommand(messageStr: string, deps: CommandRouterDeps): RemoteCommand | null {
  try {
    const cmd = JSON.parse(messageStr) as RemoteCommand;
    console.log(`[MqttBridge] Received command: ${cmd.command}`);

    switch (cmd.command) {
      case 'restart':
        handleRestart();
        break;
      case 'sync':
        handleSync(deps.getMainWindow());
        break;
      case 'clear-cache':
        handleClearCache(deps);
        break;
      default:
        console.warn(`[MqttBridge] Unknown command: ${cmd.command}`);
    }

    return cmd;
  } catch (err) {
    console.error('[MqttBridge] Failed to parse command:', err);
    return null;
  }
}
