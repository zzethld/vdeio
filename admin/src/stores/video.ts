import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import request from '@/utils/request';

export interface Video {
  id: number;
  title: string | null;
  fileSize: number | null;
  encryptStatus: 'pending' | 'encrypting' | 'done' | 'failed';
  createdAt: string;
  resolution: string | null;
  accessMode: 'open' | 'campaign' | 'code';
  offlineAllowed: boolean;
  keyTtlHours: number;
}

export interface VideoListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  encryptStatus?: string;
}

export interface VideoPolicyPayload {
  accessMode?: 'open' | 'campaign' | 'code';
  offlineAllowed?: boolean;
  keyTtlHours?: number;
  title?: string;
  description?: string;
  categoryId?: number;
}

export const useVideoStore = defineStore('video', () => {
  const videos = ref<Video[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const current = ref<Video | null>(null);

  const isEmpty = computed(() => !loading.value && videos.value.length === 0);

  function reset() {
    videos.value = [];
    total.value = 0;
    current.value = null;
    error.value = null;
    loading.value = false;
  }

  async function fetchList(params: VideoListParams = {}) {
    loading.value = true;
    error.value = null;
    try {
      const query: Record<string, string | number> = {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
      };
      if (params.search) query.search = params.search;
      if (params.encryptStatus) query.encryptStatus = params.encryptStatus;

      const res = await request.get('/admin/videos', { params: query });
      videos.value = res.data.rows || [];
      total.value = res.data.count || 0;
      return { rows: videos.value, count: total.value };
    } catch (e) {
      error.value = '获取视频列表失败';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function remove(id: number) {
    await request.delete(`/admin/videos/${id}`);
  }

  async function fetchById(id: number) {
    loading.value = true;
    error.value = null;
    try {
      const res = await request.get(`/admin/videos/${id}`);
      current.value = res.data;
      return res.data;
    } catch (e) {
      error.value = '获取视频失败';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function update(id: number, payload: VideoPolicyPayload) {
    await request.put(`/admin/videos/${id}`, payload);
  }

  return {
    videos,
    total,
    loading,
    error,
    current,
    isEmpty,
    fetchList,
    fetchById,
    update,
    remove,
    reset,
  };
});
