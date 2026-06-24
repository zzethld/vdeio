import * as path from 'path';
import { app } from 'electron';

export function getDataPath(): string {
  return app.getPath('userData');
}

export function getVideosDir(dataPath: string): string {
  return path.join(dataPath, 'videos');
}
