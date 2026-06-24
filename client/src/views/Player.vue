<template>
  <div class="player-page">
    <header class="player-header">
      <button class="btn-back" type="button" @click="goBack">
        <svg class="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        返回
      </button>
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
      <LoadingOverlay
        v-else-if="loading"
        message="加载视频中..."
        class="player-overlay"
      />

      <!-- Error state -->
      <div v-else-if="error" class="player-overlay error-overlay">
        <p class="error-msg">{{ error }}</p>
        <button class="btn-retry" type="button" @click="retry()">重试</button>
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
import LoadingOverlay from '@/components/LoadingOverlay.vue';
import request from '@/utils/request';

const route = useRoute();
const router = useRouter();

const videoId = computed(() => Number(route.params.id));
const accessMode = computed(() => (route.query.accessMode as string | undefined) || 'campaign');
const displayTitle = computed(() => {
  const queryTitle = route.query.title as string | undefined;
  return queryTitle || '视频播放';
});

const videoEl = ref<HTMLVideoElement | null>(null);
const codeInput = ref<HTMLInputElement | null>(null);
const { loading, error, initPlayer, destroy, retry: retryPlayer } = usePlayer();

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
  background: var(--video-bg);
}

.player-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  background: color-mix(in srgb, var(--bg-base) 85%, transparent);
  color: var(--text-primary);
  flex-shrink: 0;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: var(--border-subtle);
}

.btn-back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: transparent;
  border: var(--border-default);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}

.btn-back:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}

.btn-back:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.back-icon {
  width: 16px;
  height: 16px;
}

.player-header h1 {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}

.video-id {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: auto;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
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
  background: var(--video-bg);
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
  gap: var(--space-3);
  color: var(--text-secondary);
  font-size: 14px;
  z-index: 10;
  background: color-mix(in srgb, var(--bg-base) 75%, transparent);
}

.error-overlay {
  color: var(--error);
}

.error-msg {
  font-size: 14px;
  text-align: center;
  max-width: 400px;
  line-height: 1.5;
  margin: 0;
}

.btn-retry {
  padding: var(--space-2) var(--space-6);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary);
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

.code-overlay {
  z-index: 20;
}

.code-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  background: color-mix(in srgb, var(--bg-elevated) 90%, transparent);
  padding: var(--space-8);
  border-radius: var(--radius-lg);
  border: var(--border-default);
  max-width: 360px;
  width: 90%;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.code-title {
  color: var(--text-primary);
  font-size: 14px;
  margin: 0;
  text-align: center;
}

.code-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-sunken);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-default);
}

.code-input::placeholder {
  color: var(--text-tertiary);
}

.code-input:focus {
  border-color: var(--accent);
}

.code-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.code-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-unlock-play {
  width: 100%;
  padding: var(--space-2) 0;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--text-inverse);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background var(--duration-fast) var(--ease-default);
}

.btn-unlock-play:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-unlock-play:disabled {
  background: var(--bg-active);
  cursor: not-allowed;
}

.btn-unlock-play:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-subtle);
}

.code-error {
  color: var(--error);
  font-size: 13px;
  margin: 0;
  text-align: center;
}
</style>
