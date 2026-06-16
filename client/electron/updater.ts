import type { BrowserWindow } from 'electron';

/**
 * Auto-updater stub.
 * Will be implemented with electron-updater in a future task.
 */
export function initUpdater(_mainWindow: BrowserWindow): void {
  // TODO: Implement auto-updater with electron-updater
  // - Check for updates on GitHub Releases / custom update server
  // - Notify renderer when update available
  // - Download and install on restart
  console.log('[Updater] Auto-updater initialized (stub)');
}
