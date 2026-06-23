<template>
  <div class="player-page">
    <header class="player-header">
      <button class="btn-back" @click="goBack">← 返回</button>
      <h1>{{ displayTitle }}</h1>
      <span class="video-id">ID: {{ videoId }}</span>
    </header>
    <main class="player-content">
      <!-- Loading overlay -->
      <div v-if="loading" class="player-overlay">
        <span class="spinner"></span>
        <span>加载视频中...</span>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="player-overlay error-overlay">
        <p class="error-msg">{{ error }}</p>
        <button class="btn-retry" @click="retry()">重试</button>
      </div>

      <!-- Video element -->
      <video
        ref="videoEl"
        autoplay
        controls
        class="video-element"
      ></video>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePlayer } from '@/composables/usePlayer';

const route = useRoute();
const router = useRouter();

const videoId = computed(() => Number(route.params.id));
const displayTitle = computed(() => {
  const queryTitle = route.query.title as string | undefined;
  return videoTitle.value || queryTitle || '视频播放';
});

const videoEl = ref<HTMLVideoElement | null>(null);
const { loading, error, videoTitle, initPlayer, destroy, retry } = usePlayer();

function goBack(): void {
  destroy().then(() => {
    router.push('/');
  });
}

onMounted(() => {
  if (videoEl.value && videoId.value) {
    initPlayer(videoEl.value, videoId.value);
  }
});
</script>

<style scoped>
.player-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
}

.player-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  flex-shrink: 0;
}

.btn-back {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.2s;
}

.btn-back:hover {
  border-color: rgba(255, 255, 255, 0.6);
}

.player-header h1 {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-id {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: auto;
  flex-shrink: 0;
}

.player-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.player-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.7);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-overlay {
  color: #e53e3e;
}

.error-msg {
  font-size: 14px;
  text-align: center;
  max-width: 400px;
  line-height: 1.5;
}

.btn-retry {
  padding: 8px 24px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.btn-retry:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
