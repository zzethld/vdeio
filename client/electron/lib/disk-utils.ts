import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
// fs.statfs (Node 18.15+) returns accurate free/total bytes per path without
// spawning a shell. promisify converts the callback form into a Promise.
const statfs = promisify(fs.statfs);

export async function getDiskUsage(
  pathToCheck: string,
): Promise<{ usagePercent: number; freeBytes: number; totalBytes: number }> {
  try {
    if (process.platform === 'win32') {
      // Use fs.statfs instead of the deprecated `wmic logicaldisk` command.
      // wmic is removed from Windows 11 24H2+ and was slow/process-heavy; statfs
      // is a single syscall and works on the exact path the cache lives on.
      const stats = await statfs(pathToCheck);
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bfree;
      const usagePercent = totalBytes > 0 ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0;
      return { usagePercent, freeBytes, totalBytes };
    }

    // Unix fallback: df is reliable and portable across Linux/macOS.
    const { stdout } = await execAsync(`df -k "${pathToCheck}"`, { timeout: 5000 });
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].trim().split(/\s+/);
      const totalBytes = parseInt(parts[1], 10) * 1024;
      const usedBytes = parseInt(parts[2], 10) * 1024;
      const freeBytes = parseInt(parts[3], 10) * 1024;
      const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
      return { usagePercent, freeBytes, totalBytes };
    }
  } catch {
    /* ignore — fall through to zeros */
  }

  return { usagePercent: 0, freeBytes: 0, totalBytes: 0 };
}
