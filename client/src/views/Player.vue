<template>
  <div class="player-page">
    <header class="player-header">
      <button class="btn-back" @click="goBack">← 返回</button>
      <h1>{{ displayTitle }}</h1>
      <span class="video-id">ID: {{ videoId }}</span>
    </header>
    <main class="player-content">
      <!-- Code unlock overlay -->
      <div v-if="needsCode && !playing" class="player-overlay code-overlay">
        <div class="code-panel">
          <p class="code-title">该视频需要序列号，每次播放需重新输入</p>
          <input
            ref="codeInput"
            v-model="accessCode"
            class="code-input"
            type="text"
            placeholder="输入序列号"
            :disabled="unlockLoading"
            @keyup.enter="submitCode"
          />
          <button
            class="btn-unlock-play"
            type="button"
            :disabled="unlockLoading || !accessCode.trim()"
            @click="submitCode"
          >
            {{ unlockLoading ? '校验中...' : '播放' }}
          </button>
          <p v-if="unlockError" class="code-error">{{ unlockError }}</p>
        </div>
      </div>

      <!-- Loading overlay -->
      <div v-else-if="loading" class="player-overlay">
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
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePlayer } from '@/composables/usePlayer';
import request from '@/utils/request';

const route = useRoute();
const router = useRouter();

const videoId = computed(() => Number(route.params.id));
const accessMode = computed(() => (route.query.accessMode as string | undefined) || 'campaign');
const displayTitle = computed(() => {
  const queryTitle = route.query.title as string | undefined;
  return videoTitle.value || queryTitle || '视频播放';
});

const videoEl = ref<HTMLVideoElement | null>(null);
const codeInput = ref<HTMLInputElement | null>(null);
const { loading, error, videoTitle, initPlayer, destroy, retry: retryPlayer } = usePlayer();

const needsCode = ref(false);
const accessCode = ref('');
const unlockLoading = ref(false);
const unlockError = ref('');
const playing = ref(false);

function goBack(): void {
  destroy().then(() => {
    router.push('/');
  });
}

async function startPlayback(code?: string): Promise<void> {
  if (!videoEl.value || !videoId.value) return;
  playing.value = true;
  await initPlayer(videoEl.value, videoId.value, code);
}

async function submitCode(): Promise<void> {
  const code = accessCode.value.trim();
  if (!code) {
    unlockError.value = '请输入序列号';
    return;
  }
  unlockLoading.value = true;
  unlockError.value = '';
  try {
    // Consume one use of the code for this specific video.
    await request.post('/devices/unlock', { code, videoId: videoId.value });
    await startPlayback(code);
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
    unlockError.value = axiosErr.response?.data?.error || axiosErr.message || '校验失败';
    playing.value = false;
  } finally {
    unlockLoading.value = false;
  }
}

function retry(): void {
  error.value = '';
  if (accessMode.value === 'code') {
    playing.value = false;
    accessCode.value = '';
    unlockError.value = '';
    nextTick(() => codeInput.value?.focus());
  } else {
    retryPlayer();
  }
}

onMounted(() => {
  if (accessMode.value === 'code') {
    needsCode.value = true;
    nextTick(() => codeInput.value?.focus());
  } else {
    startPlayback();
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

.code-overlay {
  z-index: 20;
}

.code-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: rgba(0, 0, 0, 0.85);
  padding: 32px;
  border-radius: 12px;
  max-width: 360px;
  width: 90%;
}

.code-title {
  color: #fff;
  font-size: 14px;
  margin: 0;
  text-align: center;
}

.code-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 14px;
  outline: none;
}

.code-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.code-input:focus {
  border-color: #0f3460;
}

.btn-unlock-play {
  width: 100%;
  padding: 10px 0;
  border: none;
  border-radius: 6px;
  background: #0f3460;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-unlock-play:hover:not(:disabled) {
  background: #16213e;
}

.btn-unlock-play:disabled {
  background: #555;
  cursor: not-allowed;
}

.code-error {
  color: #e53e3e;
  font-size: 13px;
  margin: 0;
  text-align: center;
}
</style>
