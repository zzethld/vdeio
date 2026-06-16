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
import { useCampaignStore } from '@/stores/campaign';

const mockCampaignRows = [
  {
    id: 1,
    title: 'Spring Sale',
    description: 'Spring campaign',
    status: 'active' as const,
    startTime: '2025-03-01T00:00:00Z',
    endTime: '2025-04-01T00:00:00Z',
    createdAt: '2025-02-15T00:00:00Z',
  },
  {
    id: 2,
    title: null,
    description: null,
    status: 'draft' as const,
    startTime: '2025-05-01T00:00:00Z',
    endTime: '2025-06-01T00:00:00Z',
    createdAt: '2025-02-20T00:00:00Z',
  },
];

describe('Campaign Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty list and zero total', () => {
      const store = useCampaignStore();
      expect(store.campaigns).toEqual([]);
      expect(store.total).toBe(0);
    });

    it('starts not loading with null current and null error', () => {
      const store = useCampaignStore();
      expect(store.loading).toBe(false);
      expect(store.current).toBeNull();
      expect(store.error).toBeNull();
    });

    it('isEmpty is true initially', () => {
      const store = useCampaignStore();
      expect(store.isEmpty).toBe(true);
    });
  });

  describe('fetchList', () => {
    it('should call GET /admin/campaigns with default pagination', async () => {
      vi.mocked(request.get).mockResolvedValue({
        data: { rows: mockCampaignRows, count: 2 },
      });
      const store = useCampaignStore();

      await store.fetchList();

      expect(request.get).toHaveBeenCalledWith('/admin/campaigns', {
        params: { page: 1, pageSize: 20 },
      });
      expect(store.campaigns).toEqual(mockCampaignRows);
      expect(store.total).toBe(2);
    });

    it('should include status filter when provided', async () => {
      vi.mocked(request.get).mockResolvedValue({
        data: { rows: [], count: 0 },
      });
      const store = useCampaignStore();

      await store.fetchList({ page: 3, pageSize: 50, status: 'active' });

      expect(request.get).toHaveBeenCalledWith('/admin/campaigns', {
        params: { page: 3, pageSize: 50, status: 'active' },
      });
    });

    it('should handle missing rows/count gracefully', async () => {
      vi.mocked(request.get).mockResolvedValue({ data: { rows: null } });
      const store = useCampaignStore();

      await store.fetchList();

      expect(store.campaigns).toEqual([]);
      expect(store.total).toBe(0);
      expect(store.isEmpty).toBe(true);
    });

    it('should set error and rethrow on failure', async () => {
      vi.mocked(request.get).mockRejectedValue(new Error('timeout'));
      const store = useCampaignStore();

      await expect(store.fetchList()).rejects.toThrow('timeout');

      expect(store.error).toBe('获取推广计划列表失败');
      expect(store.loading).toBe(false);
    });
  });

  describe('fetchById', () => {
    it('should call GET /admin/campaigns/:id and populate current', async () => {
      const detail = { ...mockCampaignRows[0], videos: [], stores: [] };
      vi.mocked(request.get).mockResolvedValue({ data: detail });
      const store = useCampaignStore();

      const result = await store.fetchById(1);

      expect(request.get).toHaveBeenCalledWith('/admin/campaigns/1');
      expect(store.current).toEqual(detail);
      expect(result).toEqual(detail);
    });

    it('should set error on fetchById failure', async () => {
      vi.mocked(request.get).mockRejectedValue(new Error('not found'));
      const store = useCampaignStore();

      await expect(store.fetchById(99)).rejects.toThrow('not found');

      expect(store.error).toBe('获取推广计划失败');
    });
  });

  describe('create', () => {
    it('should POST /admin/campaigns with payload', async () => {
      vi.mocked(request.post).mockResolvedValue({ data: { id: 10 } });
      const store = useCampaignStore();

      const payload = {
        title: 'New Campaign',
        description: 'desc',
        startTime: '2025-01-01T00:00:00.000Z',
        endTime: '2025-02-01T00:00:00.000Z',
      };
      const result = await store.create(payload);

      expect(request.post).toHaveBeenCalledWith('/admin/campaigns', payload);
      expect(result).toEqual({ id: 10 });
    });
  });

  describe('update', () => {
    it('should PUT /admin/campaigns/:id with payload', async () => {
      vi.mocked(request.put).mockResolvedValue({} as never);
      const store = useCampaignStore();

      await store.update(7, { title: 'Renamed' });

      expect(request.put).toHaveBeenCalledWith('/admin/campaigns/7', { title: 'Renamed' });
    });
  });

  describe('remove', () => {
    it('should DELETE /admin/campaigns/:id', async () => {
      vi.mocked(request.delete).mockResolvedValue({} as never);
      const store = useCampaignStore();

      await store.remove(5);

      expect(request.delete).toHaveBeenCalledWith('/admin/campaigns/5');
    });
  });

  describe('reset', () => {
    it('should clear all state including current', async () => {
      vi.mocked(request.get).mockResolvedValue({
        data: { rows: mockCampaignRows, count: 2 },
      });
      const store = useCampaignStore();
      await store.fetchList();
      store.current = mockCampaignRows[0];

      store.reset();

      expect(store.campaigns).toEqual([]);
      expect(store.total).toBe(0);
      expect(store.current).toBeNull();
      expect(store.error).toBeNull();
      expect(store.loading).toBe(false);
    });
  });
});
