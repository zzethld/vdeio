// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('SyncService', () => {
  let SyncService: typeof import('../../../electron/sync-service.js').SyncService;
  let parseM3U8: typeof import('../../../electron/sync-service.js').parseM3U8;
  let createLocalM3U8: typeof import('../../../electron/sync-service.js').createLocalM3U8;
  let extractIv: typeof import('../../../electron/sync-service.js').extractIv;
  let mockedFs: typeof import('fs');

  // Shared mutable mock state, reset per test
  let files: Record<string, Buffer | string | { atime: number }>;
  let dirs: Record<string, string[]>;
  let httpResponses: Record<
    string,
    { statusCode?: number; body: Buffer | Buffer[]; headers?: Record<string, string> }
  >;
  let execQueue: Array<{ stdout: string }>;
  let statfsQueue: Array<{ freeBytes: number; totalBytes: number }>;
  let requests: Array<{ url: string; options: unknown; writes: Buffer[] }>;

  beforeEach(async () => {
    vi.resetModules();

    files = {};
    dirs = {};
    httpResponses = {};
    execQueue = [];
    statfsQueue = [];
    requests = [];

    vi.doMock('fs', () => ({
      existsSync: vi.fn((p: string) =>
        Object.prototype.hasOwnProperty.call(dirs, p) ||
        Object.prototype.hasOwnProperty.call(files, p)
      ),
      mkdirSync: vi.fn((p: string) => {
        if (!dirs[p]) dirs[p] = [];
      }),
      readdirSync: vi.fn((p: string) => {
        const entries = dirs[p] || [];
        return entries.map((name) => ({
          name,
          isDirectory: () => true,
          isFile: () => false,
        }));
      }),
      statSync: vi.fn((p: string) => ({
        size: Buffer.isBuffer(files[p]) ? (files[p] as Buffer).length : 0,
        atime: new Date((files[p] as { atime?: number })?.atime || Date.now()),
      })),
      writeFileSync: vi.fn((p: string, data: Buffer | string) => {
        files[p] = data;
      }),
      appendFileSync: vi.fn((p: string, data: Buffer) => {
        const existing = Buffer.isBuffer(files[p]) ? (files[p] as Buffer) : Buffer.from('');
        files[p] = Buffer.concat([existing, data]);
      }),
      rmSync: vi.fn((p: string) => {
        delete files[p];
        delete dirs[p];
      }),
      // fs.statfs is the disk-usage source on win32 (see lib/disk-utils.ts).
      // Callback-style so promisify(fs.statfs) in disk-utils works unchanged.
      statfs: vi.fn((
        _p: string,
        callback: (
          err: NodeJS.ErrnoException | null,
          stats: { bsize: number; blocks: number; bfree: number; bavail: number },
        ) => void,
      ) => {
        const resp = statfsQueue.shift();
        if (!resp) {
          callback(null, { bsize: 1, blocks: 0, bfree: 0, bavail: 0 });
          return;
        }
        callback(null, {
          bsize: 1,
          blocks: resp.totalBytes,
          bfree: resp.freeBytes,
          bavail: resp.freeBytes,
        });
      }),
    }));

    vi.doMock('path', () => ({
      join: vi.fn((...parts: string[]) => parts.join('/')),
      parse: vi.fn((p: string) => ({
        root: p.startsWith('C:') ? 'C:\\\\' : '/',
      })),
      dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/') || '/'),
    }));

    vi.doMock('child_process', () => ({
      exec: vi.fn((_cmd: string, _opts: unknown, callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
        const resp = execQueue.shift() || { stdout: '' };
        callback(null, { stdout: resp.stdout, stderr: '' });
      }),
    }));

    const mockRequest = vi.fn((first: string | object, second: unknown, third?: unknown) => {
      let options: Record<string, unknown>;
      let callback: (res: unknown) => void;

      if (typeof first === 'string') {
        options = second as Record<string, unknown>;
        callback = third as (res: unknown) => void;
      } else {
        options = first as Record<string, unknown>;
        callback = second as (res: unknown) => void;
      }

      const protocol = options.port === 443 ? 'https:' : 'http:';
      const hostname = options.hostname ?? 'localhost';
      const port = (options.port as number | undefined) ?? (protocol === 'https:' ? 443 : 80);
      const pathPart = (options.path as string) ?? '/';
      const isDefaultPort = (protocol === 'https:' && port === 443) || (protocol === 'http:' && port === 80);
      const url = isDefaultPort ? `${protocol}//${hostname}${pathPart}` : `${protocol}//${hostname}:${port}${pathPart}`;

      const writes: Buffer[] = [];
      requests.push({ url, options, writes });
      const config = httpResponses[url] || { statusCode: 200, body: Buffer.from('') };
      const bodyChunks = Array.isArray(config.body) ? config.body : [config.body];
      const res = {
        statusCode: config.statusCode ?? 200,
        headers: config.headers ?? {},
        on: vi.fn((event: string, handler: (data?: Buffer) => void) => {
          if (event === 'data') {
            bodyChunks.forEach((chunk) => handler(chunk));
          }
          if (event === 'end') {
            handler();
          }
        }),
      };
      callback(res);
      return {
        on: vi.fn(),
        setTimeout: vi.fn(),
        write: vi.fn((chunk: Buffer) => {
          writes.push(chunk);
        }),
        end: vi.fn(),
      };
    });

    vi.doMock('https', () => ({ request: mockRequest }));
    vi.doMock('http', () => ({ request: mockRequest }));

    const mod = await import('../../../electron/sync-service.ts');
    SyncService = mod.SyncService;
    parseM3U8 = mod.parseM3U8;
    createLocalM3U8 = mod.createLocalM3U8;
    extractIv = mod.extractIv;
    mockedFs = await import('fs');
  });

  describe('constructor', () => {
    it('creates videos directory when it does not exist', () => {
      const mkdirSync = mockedFs.mkdirSync as ReturnType<typeof vi.fn>;
      new SyncService('/data/vdeio');
      expect(mkdirSync).toHaveBeenCalledWith('/data/vdeio/videos', { recursive: true });
    });

    it('uses provided serverBaseURL', async () => {
      const service = new SyncService('/data/vdeio', 'https://api.example.com/api/v1');
      httpResponses['https://api.example.com/api/v1/devices/sync'] = {
        body: Buffer.from(JSON.stringify({ downloads: [], deletes: [] })),
      };

      await (service as unknown as { fetchSyncDiff: (token: string, ids: number[]) => Promise<unknown> }).fetchSyncDiff('tok', []);
      expect(requests[0].url).toBe('https://api.example.com/api/v1/devices/sync');
    });
  });

  describe('scanLocalVideos', () => {
    it('returns numeric directory names as video ids', () => {
      dirs['/data/vdeio/videos'] = ['1', '2', 'not-a-number', '03'];
      const service = new SyncService('/data/vdeio');

      const ids = (service as unknown as { scanLocalVideos: () => number[] }).scanLocalVideos();
      expect(ids.sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });

    it('returns empty array when videos directory does not exist', () => {
      const service = new SyncService('/data/vdeio');
      const ids = (service as unknown as { scanLocalVideos: () => number[] }).scanLocalVideos();
      expect(ids).toEqual([]);
    });
  });

  describe('fetchSyncDiff', () => {
    it('posts cachedVideoIds and returns parsed diff', async () => {
      const service = new SyncService('/data/vdeio');
      httpResponses['http://localhost:3000/api/v1/devices/sync'] = {
        body: Buffer.from(JSON.stringify({ downloads: [{ videoId: 10 }], deletes: [{ videoId: 5 }] })),
      };

      const diff = await (service as unknown as { fetchSyncDiff: (token: string, ids: number[]) => Promise<unknown> }).fetchSyncDiff('tok', [1, 2]);

      expect(diff).toEqual({ downloads: [{ videoId: 10 }], deletes: [{ videoId: 5 }] });
      expect(requests[0].options).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok',
          'Content-Type': 'application/json',
        }),
      });
      expect(requests[0].writes.map((b) => b.toString()).join('')).toBe(JSON.stringify({ cachedVideoIds: [1, 2] }));
    });
  });

  describe('downloadVideo', () => {
    it('downloads playlist, key, segments and writes local m3u8', async () => {
      const service = new SyncService('/data/vdeio');
      httpResponses['http://localhost:3000/api/v1/devices/videos/7/playlist'] = {
        body: Buffer.from(JSON.stringify({ url: 'https://cdn.example.com/playlist.m3u8' })),
      };
      httpResponses['https://cdn.example.com/playlist.m3u8'] = {
        body: Buffer.from('#EXTM3U\nseg1.ts\nhttps://cdn.example.com/seg2.ts'),
      };
      httpResponses['http://localhost:3000/api/v1/devices/videos/7/key'] = {
        body: Buffer.from('十六字节密钥!'),
      };
      httpResponses['https://cdn.example.com/seg1.ts'] = { body: Buffer.from('seg1-bytes') };
      httpResponses['https://cdn.example.com/seg2.ts'] = { body: Buffer.from('seg2-bytes') };

      await (service as unknown as { downloadVideo: (token: string, video: unknown) => Promise<void> }).downloadVideo('tok', {
        videoId: 7,
        title: 'Test Video',
        fileSize: 100,
        campaignId: 1,
        playlistUrl: '',
      });

      expect(requests.some((r) => r.url === 'http://localhost:3000/api/v1/devices/videos/7/key')).toBe(true);
      expect(requests.some((r) => r.url === 'https://cdn.example.com/seg1.ts')).toBe(true);
      expect(requests.some((r) => r.url === 'https://cdn.example.com/seg2.ts')).toBe(true);

      expect(files['/data/vdeio/videos/7/key.bin']).toEqual(Buffer.from('十六字节密钥!'));
      expect(files['/data/vdeio/videos/7/seg_000.ts']).toEqual(Buffer.from('seg1-bytes'));
      expect(files['/data/vdeio/videos/7/seg_001.ts']).toEqual(Buffer.from('seg2-bytes'));

      const playlist = files['/data/vdeio/videos/7/playlist.m3u8'] as string;
      expect(playlist).toContain('#EXTM3U');
      expect(playlist).toContain('seg_000.ts');
      expect(playlist).toContain('seg_001.ts');
      expect(playlist).toContain('#EXT-X-ENDLIST');
    });

    it('propagates the real IV from the server m3u8 into the local playlist', async () => {
      const service = new SyncService('/data/vdeio');
      const realIvHex = 'deadbeefcafebabe1122334455667788';
      httpResponses['http://localhost:3000/api/v1/devices/videos/9/playlist'] = {
        body: Buffer.from(JSON.stringify({ url: 'https://cdn.example.com/playlist9.m3u8' })),
      };
      httpResponses['https://cdn.example.com/playlist9.m3u8'] = {
        body: Buffer.from(
          `#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://localhost:3000/api/v1/devices/videos/9/key",IV=0x${realIvHex}\nseg1.ts`,
        ),
      };
      httpResponses['http://localhost:3000/api/v1/devices/videos/9/key'] = {
        body: Buffer.from('十六字节密钥!'),
      };
      httpResponses['https://cdn.example.com/seg1.ts'] = { body: Buffer.from('seg1-bytes') };

      await (service as unknown as { downloadVideo: (token: string, video: unknown) => Promise<void> }).downloadVideo('tok', {
        videoId: 9,
        title: 'IV Test',
        fileSize: 100,
        campaignId: 1,
        playlistUrl: '',
      });

      const playlist = files['/data/vdeio/videos/9/playlist.m3u8'] as string;
      // Real IV must appear; the buggy zero IV must NOT.
      expect(playlist).toContain(`IV=0x${realIvHex}`);
      expect(playlist).not.toContain('IV=0x00000000000000000000000000000000');
    });
  });

  describe('parseM3U8', () => {
    it('resolves absolute and relative segment URLs', () => {
      const text = '#EXTM3U\n#EXTINF:10,\nsegment.ts\nhttps://cdn.example.com/other.ts\n\n# comment\nrelative/path.ts';
      const urls = parseM3U8(text, 'https://cdn.example.com/playlist.m3u8');

      expect(urls).toEqual([
        'https://cdn.example.com/segment.ts',
        'https://cdn.example.com/other.ts',
        'https://cdn.example.com/relative/path.ts',
      ]);
    });
  });

  describe('extractIv', () => {
    it('returns the hex IV (without 0x prefix) when the KEY line declares one', () => {
      const text =
        '#EXTM3U\n' +
        '#EXT-X-KEY:METHOD=AES-128,URI="https://host/api/v1/devices/videos/1/key",IV=0xdeadbeefcafebabe1122334455667788\n' +
        '#EXTINF:10,\nseg_000.ts\n';
      expect(extractIv(text)).toBe('deadbeefcafebabe1122334455667788');
    });

    it('returns null when the m3u8 has no IV on the KEY line', () => {
      const text =
        '#EXTM3U\n' +
        '#EXT-X-KEY:METHOD=AES-128,URI="https://host/api/v1/devices/videos/1/key"\n' +
        '#EXTINF:10,\nseg_000.ts\n';
      expect(extractIv(text)).toBeNull();
    });

    it('returns null when there is no KEY line at all', () => {
      const text = '#EXTM3U\n#EXTINF:10,\nseg_000.ts\n';
      expect(extractIv(text)).toBeNull();
    });
  });

  describe('createLocalM3U8', () => {
    it('embeds the provided IV into the local playlist', () => {
      const ivHex = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
      const playlist = createLocalM3U8(3, ivHex);
      expect(playlist).toContain('#EXTM3U');
      expect(playlist).toContain('seg_000.ts');
      expect(playlist).toContain('seg_001.ts');
      expect(playlist).toContain('seg_002.ts');
      expect(playlist).toContain('#EXT-X-ENDLIST');
      expect(playlist).toContain('URI="key.bin"');
      expect(playlist).toContain(`IV=0x${ivHex}`);
      expect(playlist).not.toContain('IV=0x00000000000000000000000000000000');
    });

    it('omits the IV attribute when none is provided (player uses sequence number)', () => {
      const playlist = createLocalM3U8(2);
      expect(playlist).toContain('URI="key.bin"');
      expect(playlist).not.toMatch(/IV=/);
    });
  });

  describe('LRU eviction', () => {
    it('triggers eviction and fails when disk stays at or above 95%', async () => {
      dirs['/data/vdeio/videos'] = ['10', '20', '30'];
      files['/data/vdeio/videos/10'] = { atime: Date.now() - 10000 } as unknown as Buffer;
      files['/data/vdeio/videos/20'] = { atime: Date.now() - 5000 } as unknown as Buffer;
      files['/data/vdeio/videos/30'] = { atime: Date.now() } as unknown as Buffer;

      const highFree = 5000000000;
      const highTotal = 100000000000;

      if (process.platform === 'win32') {
        // win32 uses fs.statfs (see lib/disk-utils.ts) — 4 lookups: initial check,
        // one per evictable dir, then a final re-check, all still at 95%.
        statfsQueue.push({ freeBytes: highFree, totalBytes: highTotal });
        statfsQueue.push({ freeBytes: highFree, totalBytes: highTotal });
        statfsQueue.push({ freeBytes: highFree, totalBytes: highTotal });
        statfsQueue.push({ freeBytes: highFree, totalBytes: highTotal });
      } else {
        const highUsageStdout =
          'Filesystem     1K-blocks     Used Available Use% Mounted on\n/dev/sda1      100000000 95000000   5000000  95% /\n';
        // First check: 95% -> eviction path
        execQueue.push({ stdout: highUsageStdout });
        // Eviction loop checks usage for each evictable directory
        execQueue.push({ stdout: highUsageStdout });
        execQueue.push({ stdout: highUsageStdout });
        // Final check still 95%
        execQueue.push({ stdout: highUsageStdout });
      }

      const service = new SyncService('/data/vdeio');
      const ok = await (service as unknown as { checkDiskSpace: (downloads: unknown[]) => Promise<boolean> }).checkDiskSpace([
        { videoId: 30 },
      ]);

      expect(ok).toBe(false);
    });

    it('warns when disk usage is above 85% but still allows download', async () => {
      const warnFree = 12000000000;
      const warnTotal = 100000000000;

      if (process.platform === 'win32') {
        // 88% used via fs.statfs
        statfsQueue.push({ freeBytes: warnFree, totalBytes: warnTotal });
      } else {
        const warnStdout =
          'Filesystem     1K-blocks     Used Available Use% Mounted on\n/dev/sda1      100000000 88000000   12000000  88% /\n';
        execQueue.push({ stdout: warnStdout }); // 88% used
      }

      const service = new SyncService('/data/vdeio');
      service.setMainWindow({
        isDestroyed: () => false,
        webContents: { send: vi.fn() },
      } as unknown as import('electron').BrowserWindow);

      const ok = await (service as unknown as { checkDiskSpace: (downloads: unknown[]) => Promise<boolean> }).checkDiskSpace([]);

      expect(ok).toBe(true);
    });
  });

  describe('startSync', () => {
    it('guards against concurrent sync calls', async () => {
      const service = new SyncService('/data/vdeio');
      let diffCalls = 0;
      (service as unknown as { fetchSyncDiff: (token: string, ids: number[]) => Promise<unknown> }).fetchSyncDiff = async () => {
        diffCalls++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { downloads: [], deletes: [] };
      };

      const first = service.startSync('tok');
      const second = service.startSync('tok');
      await Promise.all([first, second]);

      expect(diffCalls).toBe(1);
    });

    it('completes a full sync flow with downloads and deletes', async () => {
      dirs['/data/vdeio/videos'] = ['5'];
      const service = new SyncService('/data/vdeio');

      (service as unknown as { fetchSyncDiff: (token: string, ids: number[]) => Promise<unknown> }).fetchSyncDiff = async () => ({
        downloads: [
          { videoId: 7, title: 'New', fileSize: 100, campaignId: 1, playlistUrl: '' },
        ],
        deletes: [{ videoId: 5 }],
      });

      (service as unknown as { downloadVideo: (token: string, video: unknown) => Promise<void> }).downloadVideo = vi.fn().mockResolvedValue(undefined);
      (service as unknown as { checkDiskSpace: (downloads: unknown[]) => Promise<boolean> }).checkDiskSpace = vi.fn().mockResolvedValue(true);

      await service.startSync('tok');

      expect(dirs).not.toHaveProperty('/data/vdeio/videos/5');
      expect((service as unknown as { downloadVideo: (token: string, video: unknown) => Promise<void> }).downloadVideo).toHaveBeenCalledWith('tok', expect.objectContaining({ videoId: 7 }));
    });
  });
});
