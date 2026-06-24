import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import request from '@/utils/request';
import type { Campaign } from '@/types';

export interface CampaignListParams {
  page?: number;
  pageSize?: number;
  status?: string;
}

export interface CampaignPayload {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
}

/**
 * @deprecated This store is unused — views currently use request directly.
 * May be removed in a future cleanup. Tests still reference it.
 */
export const useCampaignStore = defineStore('campaign', () => {
  const campaigns = ref<Campaign[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const current = ref<Campaign | null>(null);

  const isEmpty = computed(() => !loading.value && campaigns.value.length === 0);

  function reset() {
    campaigns.value = [];
    total.value = 0;
    current.value = null;
    error.value = null;
    loading.value = false;
  }

  async function fetchList(params: CampaignListParams = {}) {
    loading.value = true;
    error.value = null;
    try {
      const query: Record<string, string | number> = {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
      };
      if (params.status) query.status = params.status;

      const res = await request.get('/admin/campaigns', { params: query });
      campaigns.value = res.data.rows || [];
      total.value = res.data.count || 0;
      return { rows: campaigns.value, count: total.value };
    } catch (e) {
      error.value = '获取推广计划列表失败';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchById(id: number) {
    loading.value = true;
    error.value = null;
    try {
      const res = await request.get(`/admin/campaigns/${id}`);
      current.value = res.data;
      return res.data;
    } catch (e) {
      error.value = '获取推广计划失败';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function create(payload: CampaignPayload) {
    const res = await request.post('/admin/campaigns', payload);
    return res.data;
  }

  async function update(id: number, payload: Partial<CampaignPayload>) {
    await request.put(`/admin/campaigns/${id}`, payload);
  }

  async function remove(id: number) {
    await request.delete(`/admin/campaigns/${id}`);
  }

  return {
    campaigns,
    total,
    loading,
    error,
    current,
    isEmpty,
    fetchList,
    fetchById,
    create,
    update,
    remove,
    reset,
  };
});
