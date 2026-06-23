<template>
  <div class="home-page">
    <AppHeader title="视频列表">
      <template #right>
        <span v-if="authStore.storeInfo" class="store-name">
          {{ authStore.storeInfo.name }}
        </span>
        <button class="btn-logout" @click="authStore.logout()">退出</button>
      </template>
    </AppHeader>

    <main class="home-content">
      <div v-if="loading" class="state-overlay">
        <LoadingOverlay message="加载中..." />
      </div>

      <div v-else-if="error" class="state-message error-state">
        <p>{{ error }}</p>
        <button class="btn-retry" @click="loadVideos">重试</button>
      </div>

      <template v-else>
        <CampaignTabs
          v-if="campaigns.length > 0"
          v-model="activeCampaignId"
          :campaigns="campaigns"
        />

        <div v-if="activeVideos.length > 0" class="video-grid">
          <VideoCard
            v-for="video in activeVideos"
            :key="video.id"
            :title="video.title"
            :size="formatFileSize(video.fileSize)"
            @play="playVideo(video)"
          >
            <template #badges>
              <StatusBadge
                v-if="video.accessMode === 'code'"
                type="lock"
                label="序列号"
              />
              <StatusBadge
                v-if="video.accessMode === 'open'"
                type="open"
                label="公开"
              />
              <StatusBadge
                v-if="video.offlineAllowed === false"
                type="online"
                label="需在线"
              />
            </template>
          </VideoCard>
        </div>

        <div v-else class="state-message empty-state">
          <p>暂无视频</p>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AppHeader from '@/components/AppHeader.vue';
import CampaignTabs from '@/components/CampaignTabs.vue';
import VideoCard from '@/components/VideoCard.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import LoadingOverlay from '@/components/LoadingOverlay.vue';
import request from '@/utils/request';

interface VideoItem {
  id: number;
  title: string;
  fileSize: number;
  encryptStatus: string;
  accessMode: 'open' | 'campaign' | 'code';
  offlineAllowed: boolean;
  keyTtlHours: number;
  [key: string]: unknown;
}

interface Campaign {
  id: number;
  title: string;
  status: string;
  videos: VideoItem[];
}

const authStore = useAuthStore();
const router = useRouter();

const campaigns = ref<Campaign[]>([]);
const loading = ref(false);
const error = ref('');
const activeCampaignId = ref<number | null>(null);

const activeVideos = computed(() => {
  if (!activeCampaignId.value) return [];
  const campaign = campaigns.value.find((c) => c.id === activeCampaignId.value);
  return campaign ? campaign.videos : [];
});

async function loadVideos() {
  loading.value = true;
  error.value = '';
  try {
    const res = await request.get('/devices/videos');
    const allCampaigns: Campaign[] = res.data.campaigns || [];
    campaigns.value = allCampaigns.filter((c) => c.status === 'active');
    if (campaigns.value.length > 0 && !activeCampaignId.value) {
      activeCampaignId.value = campaigns.value[0].id;
    }
  } catch (err) {
    error.value = '加载视频列表失败';
    console.error('Failed to load videos:', err);
  } finally {
    loading.value = false;
  }
}

function playVideo(video: VideoItem) {
  router.push({
    path: `/player/${video.id}`,
    query: {
      title: video.title,
      accessMode: video.accessMode,
    },
  });
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = (bytes / Math.pow(k, i)).toFixed(1);
  return `${size} ${units[i]}`;
}

onMounted(() => {
  loadVideos();
});
</script>

<style scoped>
.home-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
}

.home-content {
  position: relative;
  flex: 1;
  padding: var(--space-6);
  overflow-y: auto;
}

.store-name {
  font-size: 14px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.btn-logout {
  padding: var(--space-2) var(--space-4);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}

.btn-logout:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}

.btn-logout:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.state-overlay {
  position: relative;
  height: 300px;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.state-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  gap: var(--space-3);
  color: var(--text-secondary);
  font-size: 16px;
}

.state-message.error {
  color: var(--error);
}

.btn-retry {
  padding: var(--space-2) var(--space-5);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}

.btn-retry:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}

.btn-retry:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-5);
}
</style>
