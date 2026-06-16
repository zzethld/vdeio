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
