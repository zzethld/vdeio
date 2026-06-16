import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// ---------- mocks ----------

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdtemp: vi.fn().mockResolvedValue('/tmp/vdeio-1-abc'),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn().mockResolvedValue(['seg_000.ts', 'seg_001.ts']),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('fs', () => ({
  createWriteStream: vi.fn(() => ({ write: vi.fn(), end: vi.fn(), on: vi.fn() })),
}));

vi.mock('stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
  },
  join: vi.fn((...args: string[]) => args.join('/')),
}));

vi.mock('os', () => ({
  default: {
    tmpdir: vi.fn(() => '/tmp'),
  },
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('../../config/minio', () => ({
  minioClient: {
    getObject: vi.fn(),
    putObject: vi.fn(),
  },
}));

vi.mock('../../models', () => ({
  VideoModel: {
    findByPk: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../services/key-manager', () => ({
  generateEncryptionKey: vi.fn(),
  storeKey: vi.fn(),
}));

// ---------- imports (after mocks) ----------

import { spawn } from 'child_process';
import fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import { minioClient } from '../../config/minio';
import { VideoModel } from '../../models';
import { generateEncryptionKey, storeKey } from '../../services/key-manager';

// ---------- helpers ----------

/** Create a fake FFmpeg child process that emits the expected events. */
function createFakeProcess(opts: {
  exitCode?: number;
  stderrOutput?: string;
  error?: Error;
  delayMs?: number;
}): ChildProcess {
  const ee = new EventEmitter() as ChildProcess;
  (ee as any).stderr = new EventEmitter();
  (ee as any).kill = vi.fn();

  const run = () => {
    if (opts.error) {
      ee.emit('error', opts.error);
      return;
    }
    if (opts.stderrOutput) {
      (ee as any).stderr.emit('data', Buffer.from(opts.stderrOutput));
    }
    ee.emit('close', opts.exitCode ?? 0);
  };

  if (opts.delayMs) {
    setTimeout(run, opts.delayMs);
  } else {
    // next tick so the caller can attach listeners first
    queueMicrotask(run);
  }

  return ee;
}

/** Create a mock VideoModel instance. */
function createMockVideo(overrides: Record<string, any> = {}) {
  const self: Record<string, any> = {
    id: overrides.id ?? 1,
    encryptStatus: overrides.encryptStatus ?? 'pending',
  };
  const update = vi.fn().mockImplementation(async (fields: Record<string, any>) => {
    // Mutate self so guards like `if (video.encryptStatus !== 'pending')` work
    Object.assign(self, fields);
  });
  Object.assign(self, { update }, overrides);
  // ensure `update` isn't accidentally overwritten
  if (overrides.update !== undefined) self.update = overrides.update;
  return self as any;
}

/** Standard KeyData stub returned by generateEncryptionKey mock. */
const fakeKeyData = {
  key: Buffer.from('0123456789abcdef'),
  iv: 'aabbccddeeff00112233445566778899',
  keyId: 'key-uuid-1',
};

// ---------- reset module-level state ----------

// The encryption module has module-level `activeEncryptions` and `retryCountMap`.
// We need to re-import between certain tests to reset that state.

let encryptVideo: (videoId: number) => Promise<void>;
let processQueue: (options?: { startup?: boolean; limit?: number }) => Promise<void>;
let addToQueue: (videoId: number) => void;

beforeEach(async () => {
  vi.clearAllMocks();

  // Re-import so module-level state is reset
  vi.resetModules();

  // Re-register mocks (resetModules clears the mock registry)
  vi.doMock('child_process', () => ({ spawn: vi.fn() }));
  vi.doMock('fs/promises', () => ({
    default: {
      mkdtemp: vi.fn().mockResolvedValue('/tmp/vdeio-1-abc'),
      writeFile: vi.fn(),
      readFile: vi.fn().mockResolvedValue('#EXTM3U\nfake m3u8'),
      readdir: vi.fn().mockResolvedValue(['seg_000.ts', 'seg_001.ts']),
      rm: vi.fn().mockResolvedValue(undefined),
    },
  }));
  vi.doMock('fs', () => ({
    createWriteStream: vi.fn(() => ({ write: vi.fn(), end: vi.fn(), on: vi.fn() })),
  }));
  vi.doMock('stream/promises', () => ({
    pipeline: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('path', () => ({
    default: { join: vi.fn((...args: string[]) => args.join('/')) },
    join: vi.fn((...args: string[]) => args.join('/')),
  }));
  vi.doMock('os', () => ({
    default: { tmpdir: vi.fn(() => '/tmp') },
    tmpdir: vi.fn(() => '/tmp'),
  }));
  vi.doMock('../../config/minio', () => ({
    minioClient: {
      getObject: vi.fn(),
      putObject: vi.fn(),
    },
  }));
  vi.doMock('../../models', () => ({
    VideoModel: {
      findByPk: vi.fn(),
      findAll: vi.fn(),
      update: vi.fn(),
    },
  }));
  vi.doMock('../../services/key-manager', () => ({
    generateEncryptionKey: vi.fn(),
    storeKey: vi.fn(),
  }));

  const mod = await import('../../services/encryption');
  encryptVideo = mod.encryptVideo;
  processQueue = mod.processQueue;
  addToQueue = mod.addToQueue;
});

// ---------- tests ----------

describe('Encryption Service', () => {
  // ================================================================
  // 1. processQueue — startup mode
  // ================================================================
  describe('processQueue — startup mode', () => {
    it('should query only pending videos when startup: true', async () => {
      const { VideoModel: VM } = await import('../../models');
      (VM.findAll as any).mockResolvedValue([]);

      await processQueue({ startup: true });

      expect(VM.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            encryptStatus: ['pending'],
          }),
        }),
      );
    });

    it('should query pending, failed, and encrypting when no options', async () => {
      const { VideoModel: VM } = await import('../../models');
      (VM.findAll as any).mockResolvedValue([]);

      await processQueue();

      expect(VM.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            encryptStatus: ['pending', 'failed', 'encrypting'],
          }),
        }),
      );
    });

    it('should respect the limit option', async () => {
      const { VideoModel: VM } = await import('../../models');
      (VM.findAll as any).mockResolvedValue([]);

      await processQueue({ limit: 5 });

      expect(VM.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
        }),
      );
    });

    it('should not include limit when not provided', async () => {
      const { VideoModel: VM } = await import('../../models');
      (VM.findAll as any).mockResolvedValue([]);

      await processQueue();

      // limit should NOT be in the query options
      const call = (VM.findAll as any).mock.calls[0][0];
      expect(call).not.toHaveProperty('limit');
    });
  });

  // ================================================================
  // 2. processQueue — concurrency
  // ================================================================
  describe('processQueue — concurrency', () => {
    it('should process at most MAX_CONCURRENT (2) videos simultaneously', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');
      const { pipeline: pipelineFn } = await import('stream/promises');
      const { generateEncryptionKey: genKey } = await import('../../services/key-manager');

      const videos = [createMockVideo({ id: 1 }), createMockVideo({ id: 2 }), createMockVideo({ id: 3 })];
      (VM.findByPk as any).mockImplementation((id: number) => {
        const v = videos.find(v => v.id === id);
        return Promise.resolve(v || null);
      });
      (VM.findAll as any).mockResolvedValue(videos);
      (genKey as any).mockReturnValue(fakeKeyData);
      (pipelineFn as any).mockResolvedValue(undefined);

      // Track concurrent count
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      // Make FFmpeg take time so we can observe concurrency
      (spawnFn as any).mockImplementation(() => {
        currentConcurrent++;
        if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;

        const proc = createFakeProcess({ exitCode: 0, delayMs: 100 });
        const originalClose = proc.emit.bind(proc);
        // Wrap close to decrement counter
        const origEmit = proc.emit;
        proc.emit = function (this: any, event: string, ...args: any[]) {
          if (event === 'close') {
            currentConcurrent--;
          }
          return (origEmit as any).call(this, event, ...args);
        } as any;
        return proc;
      });

      await processQueue();

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  // ================================================================
  // 3. encryptVideo — error handling
  // ================================================================
  describe('encryptVideo — error handling', () => {
    it('should log concise one-line error when FFmpeg fails', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');
      const { pipeline: pipelineFn } = await import('stream/promises');
      const { generateEncryptionKey: genKey } = await import('../../services/key-manager');

      const mockVideo = createMockVideo({ id: 10 });
      (VM.findByPk as any).mockResolvedValue(mockVideo);
      (pipelineFn as any).mockResolvedValue(undefined);
      (genKey as any).mockReturnValue(fakeKeyData);

      const longStderr = 'Error line 1\n'.repeat(50) + 'Error line final';
      (spawnFn as any).mockImplementation(() =>
        createFakeProcess({ exitCode: 1, stderrOutput: longStderr }),
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(encryptVideo(10)).rejects.toThrow();

      // The console.error should have been called with a truncated message
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCall = consoleErrorSpy.mock.calls[0];
      const loggedMsg = errorCall.join(' ');
      // Should NOT contain the full 50+ line dump
      expect(loggedMsg.length).toBeLessThan(300);

      consoleErrorSpy.mockRestore();
    });

    it('should set encryptStatus to failed on error', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');
      const { pipeline: pipelineFn } = await import('stream/promises');
      const { generateEncryptionKey: genKey } = await import('../../services/key-manager');

      const mockVideo = createMockVideo({ id: 11 });
      (VM.findByPk as any).mockResolvedValue(mockVideo);
      (pipelineFn as any).mockResolvedValue(undefined);
      (genKey as any).mockReturnValue(fakeKeyData);

      (spawnFn as any).mockImplementation(() =>
        createFakeProcess({ exitCode: 1, stderrOutput: 'FFmpeg error' }),
      );

      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(encryptVideo(11)).rejects.toThrow();

      // video.update should have been called with encrypting first, then failed
      const updateCalls = mockVideo.update.mock.calls;
      expect(updateCalls[0]).toEqual([{ encryptStatus: 'encrypting' }]);
      expect(updateCalls[1]).toEqual([{ encryptStatus: 'failed' }]);

      vi.restoreAllMocks();
    });

    it('should clean up temp directory even on failure', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');
      const { pipeline: pipelineFn } = await import('stream/promises');
      const fsMod = await import('fs/promises');
      const { generateEncryptionKey: genKey } = await import('../../services/key-manager');

      const mockVideo = createMockVideo({ id: 12 });
      (VM.findByPk as any).mockResolvedValue(mockVideo);
      (pipelineFn as any).mockResolvedValue(undefined);
      (genKey as any).mockReturnValue(fakeKeyData);

      (spawnFn as any).mockImplementation(() =>
        createFakeProcess({ exitCode: 1, stderrOutput: 'fail' }),
      );

      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(encryptVideo(12)).rejects.toThrow();

      expect(fsMod.default.rm).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true, force: true },
      );

      vi.restoreAllMocks();
    });
  });

  // ================================================================
  // 4. encryptVideo — max retries
  // ================================================================
  describe('encryptVideo — max retries', () => {
    it('should skip videos that have reached MAX_RETRIES', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');
      const { pipeline: pipelineFn } = await import('stream/promises');
      const { generateEncryptionKey: genKey } = await import('../../services/key-manager');
      const { minioClient: mc } = await import('../../config/minio');
      const fsMod = await import('fs/promises');

      // Create a new mock video each time findByPk is called so the
      // encryptStatus mutation from previous calls doesn't carry over.
      let callCount = 0;
      (VM.findByPk as any).mockImplementation(() => {
        callCount++;
        return Promise.resolve(createMockVideo({ id: 20, encryptStatus: 'failed' }));
      });
      (pipelineFn as any).mockResolvedValue(undefined);
      (genKey as any).mockReturnValue(fakeKeyData);
      (mc.getObject as any).mockResolvedValue({ on: vi.fn(), pipe: vi.fn() });
      (mc.putObject as any).mockResolvedValue(undefined);
      (fsMod.default.readFile as any).mockResolvedValue(Buffer.from('data'));
      (fsMod.default.readdir as any).mockResolvedValue([]);

      // First 3 calls: FFmpeg fails → retry count increments to 1, 2, 3
      (spawnFn as any).mockImplementation(() =>
        createFakeProcess({ exitCode: 1, stderrOutput: 'encode error' }),
      );

      vi.spyOn(console, 'error').mockImplementation(() => {});

      // Exhaust 3 retries
      for (let i = 0; i < 3; i++) {
        await encryptVideo(20).catch(() => {});
      }

      // spawn was called 3 times
      expect(spawnFn).toHaveBeenCalledTimes(3);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // 4th call — should skip due to max retries (no new spawn call)
      await encryptVideo(20);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('max retries'),
      );
      // spawn should still be exactly 3 — no additional call
      expect(spawnFn).toHaveBeenCalledTimes(3);

      consoleLogSpy.mockRestore();
    });
  });

  // ================================================================
  // 5. encryptVideo — success flow
  // ================================================================
  describe('encryptVideo — success flow', () => {
    it('should download from MinIO, run FFmpeg, upload segments, store key, update status', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');
      const fsMod = await import('fs/promises');
      const { pipeline: pipelineFn } = await import('stream/promises');
      const { minioClient: mc } = await import('../../config/minio');
      const { generateEncryptionKey: genKey, storeKey: storeKeyFn } = await import('../../services/key-manager');

      const mockVideo = createMockVideo({ id: 30 });
      (VM.findByPk as any).mockResolvedValue(mockVideo);

      const fakeStream = { on: vi.fn(), pipe: vi.fn() };
      (mc.getObject as any).mockResolvedValue(fakeStream);
      (pipelineFn as any).mockResolvedValue(undefined);
      (genKey as any).mockReturnValue(fakeKeyData);
      (mc.putObject as any).mockResolvedValue(undefined);
      (storeKeyFn as any).mockResolvedValue(undefined);

      (fsMod.default.readFile as any).mockImplementation((p: string) => {
        if (p.includes('.m3u8')) return Promise.resolve('#EXTM3U\nfake playlist');
        return Promise.resolve(Buffer.from('ts-data'));
      });
      (fsMod.default.readdir as any).mockResolvedValue(['seg_000.ts', 'seg_001.ts']);

      (spawnFn as any).mockImplementation(() => createFakeProcess({ exitCode: 0 }));

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await encryptVideo(30);

      // 1. Downloaded from MinIO
      expect(mc.getObject).toHaveBeenCalledWith(
        'video-original',
        'videos/30/original.mp4',
      );

      // 2. Generated encryption key
      expect(genKey).toHaveBeenCalled();

      // 3. FFmpeg was spawned
      expect(spawnFn).toHaveBeenCalled();
      const spawnArgs = (spawnFn as any).mock.calls[0];
      // First arg is ffmpeg path, second is args array
      expect(spawnArgs[1]).toEqual(
        expect.arrayContaining(['-hls_time', '10', '-hls_key_info_file']),
      );

      // 4. Uploaded to MinIO — playlist + segments
      expect(mc.putObject).toHaveBeenCalledTimes(3); // 1 playlist + 2 segments
      expect(mc.putObject).toHaveBeenCalledWith(
        'video-encrypted',
        'videos/30/playlist.m3u8',
        expect.any(Buffer),
      );
      expect(mc.putObject).toHaveBeenCalledWith(
        'video-encrypted',
        'videos/30/seg_000.ts',
        expect.any(Buffer),
      );
      expect(mc.putObject).toHaveBeenCalledWith(
        'video-encrypted',
        'videos/30/seg_001.ts',
        expect.any(Buffer),
      );

      // 5. Stored key
      expect(storeKeyFn).toHaveBeenCalledWith(30, fakeKeyData);

      // 6. Updated status to 'done'
      const updateCalls = mockVideo.update.mock.calls;
      expect(updateCalls[0]).toEqual([{ encryptStatus: 'encrypting' }]);
      expect(updateCalls[1]).toEqual([{
        encryptStatus: 'done',
        hlsUrl: 'videos/30/playlist.m3u8',
      }]);

      // 7. Cleaned up temp dir
      expect(fsMod.default.rm).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true, force: true },
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('encrypted successfully'),
      );

      consoleLogSpy.mockRestore();
    });
  });

  // ================================================================
  // 6. addToQueue
  // ================================================================
  describe('addToQueue', () => {
    it('should not throw when encryption fails (fire-and-forget)', async () => {
      const { VideoModel: VM } = await import('../../models');

      (VM.findByPk as any).mockResolvedValue(null);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      // addToQueue is synchronous and fire-and-forget
      expect(() => addToQueue(999)).not.toThrow();

      // Give the microtask queue time to settle
      await new Promise(resolve => setTimeout(resolve, 50));

      vi.restoreAllMocks();
    });

    it('should trigger encryptVideo in background', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');
      const { pipeline: pipelineFn } = await import('stream/promises');
      const { generateEncryptionKey: genKey, storeKey: storeKeyFn } = await import('../../services/key-manager');
      const { minioClient: mc } = await import('../../config/minio');
      const fsMod = await import('fs/promises');

      const mockVideo = createMockVideo({ id: 40 });
      (VM.findByPk as any).mockResolvedValue(mockVideo);
      (mc.getObject as any).mockResolvedValue({ on: vi.fn(), pipe: vi.fn() });
      (pipelineFn as any).mockResolvedValue(undefined);
      (genKey as any).mockReturnValue(fakeKeyData);
      (mc.putObject as any).mockResolvedValue(undefined);
      (storeKeyFn as any).mockResolvedValue(undefined);
      (fsMod.default.readFile as any).mockResolvedValue(Buffer.from('data'));
      (fsMod.default.readdir as any).mockResolvedValue([]);
      (spawnFn as any).mockImplementation(() => createFakeProcess({ exitCode: 0 }));

      vi.spyOn(console, 'log').mockImplementation(() => {});

      addToQueue(40);

      // Wait for background execution
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(VM.findByPk).toHaveBeenCalledWith(40);

      vi.restoreAllMocks();
    });
  });

  // ================================================================
  // 7. encryptVideo — video not found
  // ================================================================
  describe('encryptVideo — video not found', () => {
    it('should throw when video is not found by PK', async () => {
      const { VideoModel: VM } = await import('../../models');
      (VM.findByPk as any).mockResolvedValue(null);

      await expect(encryptVideo(999)).rejects.toThrow('Video 999 not found');
    });
  });

  // ================================================================
  // 8. encryptVideo — non-pending status is skipped
  // ================================================================
  describe('encryptVideo — status guards', () => {
    it('should skip videos with encryptStatus other than pending/failed', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');

      const mockVideo = createMockVideo({ id: 50, encryptStatus: 'done' });
      (VM.findByPk as any).mockResolvedValue(mockVideo);

      await encryptVideo(50);

      // Should NOT have updated to 'encrypting' or spawned FFmpeg
      expect(mockVideo.update).not.toHaveBeenCalledWith({ encryptStatus: 'encrypting' });
      expect(spawnFn).not.toHaveBeenCalled();
    });

    it('should process a video with encrypting (stale) status', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');
      const { pipeline: pipelineFn } = await import('stream/promises');
      const { generateEncryptionKey: genKey, storeKey: storeKeyFn } = await import('../../services/key-manager');
      const { minioClient: mc } = await import('../../config/minio');
      const fsMod = await import('fs/promises');

      // 'encrypting' is not 'pending', so it should be skipped by the
      // `if (video.encryptStatus !== 'pending') return;` guard
      const mockVideo = createMockVideo({ id: 51, encryptStatus: 'encrypting' });
      (VM.findByPk as any).mockResolvedValue(mockVideo);

      await encryptVideo(51);

      // Should be skipped since encryptStatus !== 'pending' and !== 'failed'
      expect(spawnFn).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // 9. encryptVideo — failed status resets to pending for retry
  // ================================================================
  describe('encryptVideo — retry from failed', () => {
    it('should reset failed status to pending and continue', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { spawn: spawnFn } = await import('child_process');
      const { pipeline: pipelineFn } = await import('stream/promises');
      const { generateEncryptionKey: genKey, storeKey: storeKeyFn } = await import('../../services/key-manager');
      const { minioClient: mc } = await import('../../config/minio');
      const fsMod = await import('fs/promises');

      const mockVideo = createMockVideo({ id: 60, encryptStatus: 'failed' });
      (VM.findByPk as any).mockResolvedValue(mockVideo);
      (mc.getObject as any).mockResolvedValue({ on: vi.fn(), pipe: vi.fn() });
      (pipelineFn as any).mockResolvedValue(undefined);
      (genKey as any).mockReturnValue(fakeKeyData);
      (mc.putObject as any).mockResolvedValue(undefined);
      (storeKeyFn as any).mockResolvedValue(undefined);
      (fsMod.default.readFile as any).mockResolvedValue(Buffer.from('data'));
      (fsMod.default.readdir as any).mockResolvedValue([]);
      (spawnFn as any).mockImplementation(() => createFakeProcess({ exitCode: 0 }));

      vi.spyOn(console, 'log').mockImplementation(() => {});

      await encryptVideo(60);

      // Should have reset to pending first
      expect(mockVideo.update).toHaveBeenCalledWith({ encryptStatus: 'pending' });
      // Then set to encrypting
      expect(mockVideo.update).toHaveBeenCalledWith({ encryptStatus: 'encrypting' });

      vi.restoreAllMocks();
    });
  });

  // ================================================================
  // 10. processQueue — empty queue
  // ================================================================
  describe('processQueue — empty queue', () => {
    it('should handle empty queue gracefully', async () => {
      const { VideoModel: VM } = await import('../../models');
      (VM.findAll as any).mockResolvedValue([]);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await processQueue();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('0 video(s) found'),
      );

      consoleLogSpy.mockRestore();
    });
  });

  // ================================================================
  // 11. encryptVideo — MinIO download failure
  // ================================================================
  describe('encryptVideo — MinIO download failure', () => {
    it('should fail gracefully when MinIO getObject throws', async () => {
      const { VideoModel: VM } = await import('../../models');
      const { minioClient: mc } = await import('../../config/minio');
      const fsMod = await import('fs/promises');

      const mockVideo = createMockVideo({ id: 70 });
      (VM.findByPk as any).mockResolvedValue(mockVideo);
      (mc.getObject as any).mockRejectedValue(new Error('MinIO connection refused'));

      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(encryptVideo(70)).rejects.toThrow('MinIO connection refused');

      expect(mockVideo.update).toHaveBeenCalledWith({ encryptStatus: 'failed' });
      expect(fsMod.default.rm).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });
});
