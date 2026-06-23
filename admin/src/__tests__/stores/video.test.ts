import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock the request module
vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import request from '@/utils/request';
import { useVideoStore } from '@/stores/video';

const mockVideoRows = [
  {
    id: 1,
    title: 'Video One',
    fileSize: 1024 * 1024,
    encryptStatus: 'done' as const,
    createdAt: '2025-01-01T00:00:00Z',
    resolution: '1080p',
  },
  {
    id: 2,
    title: 'Video Two',
    fileSize: 500 * 1024 * 1024,
    encryptStatus: 'encrypting' as const,
    createdAt: '2025-01-02T00:00:00Z',
    resolution: null,
  },
];

describe('Video Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty list and zero total', () => {
      const store = useVideoStore();
      expect(store.videos).toEqual([]);
      expect(store.total).toBe(0);
    });

    it('starts not loading', () => {
      const store = useVideoStore();
      expect(store.loading).toBe(false);
    });

    it('starts with null error', () => {
      const store = useVideoStore();
      expect(store.error).toBeNull();
    });

    it('isEmpty is true when not loading and list is empty', () => {
      const store = useVideoStore();
      expect(store.isEmpty).toBe(true);
    });
  });

  describe('fetchList', () => {
    it('should call GET /admin/videos with default pagination', async () => {
      vi.mocked(request.get).mockResolvedValue({
        data: { rows: mockVideoRows, count: 2 },
      });
      const store = useVideoStore();

      await store.fetchList();

      expect(request.get).toHaveBeenCalledWith('/admin/videos', {
        params: { page: 1, pageSize: 20 },
      });
      expect(store.videos).toEqual(mockVideoRows);
      expect(store.total).toBe(2);
    });

    it('should send search and encryptStatus params when provided', async () => {
      vi.mocked(request.get).mockResolvedValue({
        data: { rows: [], count: 0 },
      });
      const store = useVideoStore();

      await store.fetchList({
        page: 2,
        pageSize: 10,
        search: 'hello',
        encryptStatus: 'done',
      });

      expect(request.get).toHaveBeenCalledWith('/admin/videos', {
        params: { page: 2, pageSize: 10, search: 'hello', encryptStatus: 'done' },
      });
    });

    it('should set loading true while fetching then false', async () => {
      let resolveFn!: (v: { data: unknown }) => void;
      vi.mocked(request.get).mockReturnValue(
        new Promise((res) => {
          resolveFn = res as typeof resolveFn;
        }),
      );
      const store = useVideoStore();

      const promise = store.fetchList();
      expect(store.loading).toBe(true);

      resolveFn({ data: { rows: [], count: 0 } });
      await promise;

      expect(store.loading).toBe(false);
    });

    it('should handle empty rows in response', async () => {
      vi.mocked(request.get).mockResolvedValue({ data: {} });
      const store = useVideoStore();

      await store.fetchList();

      expect(store.videos).toEqual([]);
      expect(store.total).toBe(0);
      expect(store.isEmpty).toBe(true);
    });

    it('should set error and rethrow on failure', async () => {
      vi.mocked(request.get).mockRejectedValue(new Error('network'));
      const store = useVideoStore();

      await expect(store.fetchList()).rejects.toThrow('network');

      expect(store.error).toBe('获取视频列表失败');
      expect(store.loading).toBe(false);
    });
  });

  describe('remove', () => {
    it('should call DELETE /admin/videos/:id', async () => {
      vi.mocked(request.delete).mockResolvedValue({} as never);
      const store = useVideoStore();

      await store.remove(42);

      expect(request.delete).toHaveBeenCalledWith('/admin/videos/42');
    });

    it('should propagate delete errors', async () => {
      vi.mocked(request.delete).mockRejectedValue(new Error('forbidden'));
      const store = useVideoStore();

      await expect(store.remove(1)).rejects.toThrow('forbidden');
    });
  });

  describe('fetchById', () => {
    it('should call GET /admin/videos/:id and store as current', async () => {
      const mockVideo = {
        id: 7,
        title: 'Detail Video',
        fileSize: 2048,
        encryptStatus: 'done' as const,
        createdAt: '2025-03-01T00:00:00Z',
        resolution: '720p',
        accessMode: 'code' as const,
        offlineAllowed: false,
        keyTtlHours: 12,
      };
      vi.mocked(request.get).mockResolvedValue({ data: mockVideo });
      const store = useVideoStore();

      const result = await store.fetchById(7);

      expect(request.get).toHaveBeenCalledWith('/admin/videos/7');
      expect(result).toEqual(mockVideo);
      expect(store.current).toEqual(mockVideo);
    });

    it('should set loading true while fetching then false', async () => {
      let resolveFn!: (v: { data: unknown }) => void;
      vi.mocked(request.get).mockReturnValue(
        new Promise((res) => {
          resolveFn = res as typeof resolveFn;
        }),
      );
      const store = useVideoStore();

      const promise = store.fetchById(5);
      expect(store.loading).toBe(true);

      resolveFn({ data: { id: 5 } });
      await promise;

      expect(store.loading).toBe(false);
    });

    it('should set error and rethrow on failure', async () => {
      vi.mocked(request.get).mockRejectedValue(new Error('not found'));
      const store = useVideoStore();

      await expect(store.fetchById(99)).rejects.toThrow('not found');

      expect(store.error).toBe('获取视频失败');
      expect(store.loading).toBe(false);
    });
  });

  describe('update', () => {
    it('should call PUT /admin/videos/:id with policy payload', async () => {
      vi.mocked(request.put).mockResolvedValue({} as never);
      const store = useVideoStore();

      await store.update(42, {
        accessMode: 'code',
        offlineAllowed: false,
        keyTtlHours: 0,
      });

      expect(request.put).toHaveBeenCalledWith('/admin/videos/42', {
        accessMode: 'code',
        offlineAllowed: false,
        keyTtlHours: 0,
      });
    });

    it('should propagate update errors', async () => {
      vi.mocked(request.put).mockRejectedValue(new Error('validation'));
      const store = useVideoStore();

      await expect(
        store.update(1, { accessMode: 'open' }),
      ).rejects.toThrow('validation');
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      vi.mocked(request.get).mockResolvedValue({
        data: { rows: mockVideoRows, count: 2 },
      });
      const store = useVideoStore();
      await store.fetchList();
      expect(store.videos.length).toBe(2);

      store.reset();

      expect(store.videos).toEqual([]);
      expect(store.total).toBe(0);
      expect(store.error).toBeNull();
      expect(store.loading).toBe(false);
    });
  });
});
