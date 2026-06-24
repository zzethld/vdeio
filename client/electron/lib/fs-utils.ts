import * as fs from 'fs';
import * as path from 'path';

export function getDirectorySize(dirPath: string): number {
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
        totalSize += getDirectorySize(fullPath);
      }
    }
  } catch { /* skip */ }
  return totalSize;
}
