<template>
  <div class="home-page">
    <header class="home-header">
      <div class="header-left">
        <h1>视频列表</h1>
      </div>
      <div class="header-right">
        <span class="store-name" v-if="authStore.storeInfo">
          {{ authStore.storeInfo.name }}
        </span>
        <button class="btn-logout" @click="authStore.logout()">退出</button>
      </div>
    </header>
    <main class="home-content">
      <div v-if="loading" class="loading-state">
        <span class="spinner"></span>
        <span>加载中...</span>
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn-retry" @click="loadVideos">重试</button>
      </div>

      <template v-else>
        <!-- Campaign Tabs -->
        <div v-if="campaigns.length > 0" class="campaign-tabs">
          <button
            v-for="campaign in campaigns"
            :key="campaign.id"
            :class="['tab-btn', { active: activeCampaignId === campaign.id }]"
            @click="activeCampaignId = campaign.id"
          >
            {{ campaign.title }}
          </button>
        </div>

        <!-- Video Grid -->
        <div v-if="activeVideos.length > 0" class="video-grid">
          <div
            v-for="video in activeVideos"
            :key="video.id"
            class="video-card"
          >
            <div class="video-thumb">
              <div class="thumb-placeholder">
                <span class="thumb-icon">▶</span>
              </div>
            </div>
            <div class="video-info">
              <h3 class="video-title" :title="video.title">{{ video.title }}</h3>
              <span class="video-size">{{ formatFileSize(video.fileSize) }}</span>
              <div class="video-badges">
                <span v-if="video.accessMode === 'code'" class="badge badge-lock">🔒 序列号</span>
                <span v-if="video.accessMode === 'open'" class="badge badge-open">🌐 公开</span>
                <span v-if="video.offlineAllowed === false" class="badge badge-online">⚠️ 需在线</span>
              </div>
            </div>
            <button
              class="btn-play"
              @click="playVideo(video)"
            >
              播放
            </button>
          </div>
        </div>

        <div v-else class="empty-state">
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
    // Only show active campaigns
    campaigns.value = allCampaigns.filter((c) => c.status === 'active');
    // Auto-select first tab
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
  background: #f5f6fa;
}

.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.header-left h1 {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a2e;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.store-name {
  font-size: 14px;
  color: #666;
}

.btn-logout {
  padding: 6px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #666;
  cursor: pointer;
  font-size: 13px;
}

.btn-logout:hover {
  border-color: #0f3460;
  color: #0f3460;
}

.home-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  gap: 12px;
  color: #999;
  font-size: 14px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e8e8e8;
  border-top-color: #0f3460;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  gap: 12px;
  color: #e53e3e;
  font-size: 14px;
}

.btn-retry {
  padding: 6px 20px;
  border: 1px solid #0f3460;
  border-radius: 4px;
  background: transparent;
  color: #0f3460;
  cursor: pointer;
  font-size: 13px;
}

.btn-retry:hover {
  background: #0f3460;
  color: #fff;
}

.campaign-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  border-bottom: 2px solid #e8e8e8;
}

.tab-btn {
  padding: 10px 24px;
  border: none;
  background: transparent;
  color: #666;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.2s, border-color 0.2s;
}

.tab-btn:hover {
  color: #0f3460;
}

.tab-btn.active {
  color: #0f3460;
  border-bottom-color: #0f3460;
  font-weight: 600;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.video-card {
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.2s, transform 0.2s;
}

.video-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.video-thumb {
  width: 100%;
  height: 130px;
  background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%);
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-icon {
  font-size: 32px;
  color: rgba(255, 255, 255, 0.4);
}

.video-info {
  padding: 12px 14px 8px;
}

.video-title {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-size {
  font-size: 12px;
  color: #999;
}

.video-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
}

.badge-lock {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.badge-open {
  background: rgba(16, 185, 129, 0.14);
  color: #047857;
}

.badge-online {
  background: rgba(229, 62, 62, 0.12);
  color: #c53030;
}

.btn-play {
  display: block;
  width: calc(100% - 28px);
  margin: 0 14px 14px;
  padding: 8px 0;
  border: none;
  border-radius: 6px;
  background: #0f3460;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-play:hover {
  background: #16213e;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #999;
  font-size: 16px;
}
</style>
