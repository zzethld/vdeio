import { ref, onUnmounted } from 'vue';
import shaka from 'shaka-player/dist/shaka-player.compiled';
import request from '@/utils/request';

type PlayEvent = 'start' | 'pause' | 'resume' | 'end' | 'seek';

const PROGRESS_SAVE_INTERVAL = 5000; // 5 seconds
const KEY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export function usePlayer() {
  const loading = ref(false);
  const error = ref('');
  const videoTitle = ref('');

  let player: shaka.Player | null = null;
  let videoElement: HTMLVideoElement | null = null;
  let currentVideoId: number | null = null;
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let lastReportedEvent: PlayEvent | null = null;
  let reportDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let seekStarted = false;

  // --- Key caching ---

  interface CachedKey {
    key: string; // base64
    timestamp: number;
  }

  function getKeyCacheKey(videoId: number): string {
    return `video:key:${videoId}`;
  }

  function getCachedKey(videoId: number): string | null {
    const raw = localStorage.getItem(getKeyCacheKey(videoId));
    if (!raw) return null;
    try {
      const cached: CachedKey = JSON.parse(raw);
      if (Date.now() - cached.timestamp > KEY_CACHE_TTL) {
        localStorage.removeItem(getKeyCacheKey(videoId));
        return null;
      }
      return cached.key;
    } catch {
      return null;
    }
  }

  function setCachedKey(videoId: number, keyBase64: string): void {
    const cached: CachedKey = { key: keyBase64, timestamp: Date.now() };
    localStorage.setItem(getKeyCacheKey(videoId), JSON.stringify(cached));
  }

  async function fetchEncryptionKey(videoId: number): Promise<ArrayBuffer> {
    // Try cache first
    const cached = getCachedKey(videoId);
    if (cached) {
      return base64ToArrayBuffer(cached);
    }

    // Fetch from server
    const res = await request.get(`/devices/videos/${videoId}/key`, {
      responseType: 'arraybuffer',
    });
    const keyBuffer = res.data as ArrayBuffer;
    setCachedKey(videoId, arrayBufferToBase64(keyBuffer));
    return keyBuffer;
  }

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // --- Progress persistence ---

  function getProgressKey(videoId: number): string {
    return `video:progress:${videoId}`;
  }

  function saveProgress(videoId: number, position: number): void {
    localStorage.setItem(getProgressKey(videoId), String(position));
  }

  function loadProgress(videoId: number): number | null {
    const raw = localStorage.getItem(getProgressKey(videoId));
    if (!raw) return null;
    const pos = parseFloat(raw);
    return isNaN(pos) ? null : pos;
  }

  function clearProgress(videoId: number): void {
    localStorage.removeItem(getProgressKey(videoId));
  }

  // --- Local path check ---

  function getLocalPath(videoId: number): string | null {
    return localStorage.getItem(`video:localPath:${videoId}`);
  }

  // --- Play event reporting ---

  function reportPlayEvent(
    videoId: number,
    event: PlayEvent,
    position: number,
    duration: number,
  ): void {
    // Debounce: don't send same event type rapidly
    if (reportDebounceTimer) {
      clearTimeout(reportDebounceTimer);
    }
    reportDebounceTimer = setTimeout(() => {
      request
        .post(`/devices/videos/${videoId}/report-play`, {
          event,
          position,
          duration,
        })
        .catch((err) => {
          console.warn('[Player] Failed to report play event:', err);
        });
      reportDebounceTimer = null;
    }, 500);
  }

  // --- Video event handlers ---

  function onPlay(): void {
    if (!currentVideoId || !videoElement) return;
    const event: PlayEvent = lastReportedEvent === 'pause' ? 'resume' : 'start';
    reportPlayEvent(
      currentVideoId,
      event,
      videoElement.currentTime,
      videoElement.duration || 0,
    );
    lastReportedEvent = event;
  }

  function onPause(): void {
    if (!currentVideoId || !videoElement) return;
    reportPlayEvent(
      currentVideoId,
      'pause',
      videoElement.currentTime,
      videoElement.duration || 0,
    );
    lastReportedEvent = 'pause';
  }

  function onEnded(): void {
    if (!currentVideoId || !videoElement) return;
    reportPlayEvent(
      currentVideoId,
      'end',
      videoElement.currentTime,
      videoElement.duration || 0,
    );
    lastReportedEvent = 'end';
    // Clear progress when video ends naturally
    clearProgress(currentVideoId);
  }

  function onSeeked(): void {
    if (!seekStarted || !currentVideoId || !videoElement) return;
    seekStarted = false;
    reportPlayEvent(
      currentVideoId,
      'seek',
      videoElement.currentTime,
      videoElement.duration || 0,
    );
  }

  function onSeeking(): void {
    seekStarted = true;
  }

  // --- Progress timer ---

  function startProgressTimer(): void {
    stopProgressTimer();
    progressTimer = setInterval(() => {
      if (currentVideoId && videoElement && !videoElement.paused) {
        saveProgress(currentVideoId, videoElement.currentTime);
      }
    }, PROGRESS_SAVE_INTERVAL);
  }

  function stopProgressTimer(): void {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  // --- Main API ---

  async function initPlayer(
    el: HTMLVideoElement,
    videoId: number,
  ): Promise<void> {
    loading.value = true;
    error.value = '';
    currentVideoId = videoId;

    try {
      // Install polyfills
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) {
        throw new Error('浏览器不支持 Shaka Player');
      }

      videoElement = el;

      // Create player
      player = new shaka.Player();
      await player.attach(el);

      // Configure streaming
      player.configure({
        streaming: {
          bufferingGoal: 30,
          rebufferingGoal: 2,
          bufferBehind: 30,
        },
      });

      // Register response filter to inject the correct key
      player.getNetworkingEngine()?.registerResponseFilter(async (_type, response) => {
        if (_type === shaka.net.NetworkingEngine.RequestType.KEY && currentVideoId) {
          try {
            const keyBuffer = await fetchEncryptionKey(currentVideoId);
            response.data = keyBuffer;
            response.headers = {};
          } catch (err) {
            console.error('[Player] Failed to inject encryption key:', err);
          }
        }
      });

      // Determine manifest URI
      let manifestUri: string;

      // Try local cache first
      const localPath = getLocalPath(videoId);
      if (localPath) {
        manifestUri = localPath;
      } else {
        // Fetch playlist URL from server
        const res = await request.get(`/devices/videos/${videoId}/playlist`);
        const data = res.data as { url: string; title?: string };
        manifestUri = data.url;
        if (data.title) {
          videoTitle.value = data.title;
        }
      }

      // Load the stream
      await player.load(manifestUri);

      // Restore saved progress
      const savedProgress = loadProgress(videoId);
      if (savedProgress !== null && savedProgress > 0 && el.duration > 0) {
        // Only seek if saved position is not near the end
        if (savedProgress < el.duration - 5) {
          el.currentTime = savedProgress;
        }
      }

      // Bind video events
      el.addEventListener('play', onPlay);
      el.addEventListener('pause', onPause);
      el.addEventListener('ended', onEnded);
      el.addEventListener('seeking', onSeeking);
      el.addEventListener('seeked', onSeeked);

      // Start progress saving timer
      startProgressTimer();

      loading.value = false;
    } catch (err) {
      loading.value = false;
      const message =
        err instanceof Error ? err.message : '播放失败，请重试';
      error.value = message;
      console.error('[Player] Init failed:', err);
    }
  }

  async function destroy(): Promise<void> {
    // Save final progress
    if (currentVideoId && videoElement) {
      saveProgress(currentVideoId, videoElement.currentTime);
      reportPlayEvent(
        currentVideoId,
        'end',
        videoElement.currentTime,
        videoElement.duration || 0,
      );
    }

    // Remove event listeners
    if (videoElement) {
      videoElement.removeEventListener('play', onPlay);
      videoElement.removeEventListener('pause', onPause);
      videoElement.removeEventListener('ended', onEnded);
      videoElement.removeEventListener('seeking', onSeeking);
      videoElement.removeEventListener('seeked', onSeeked);
    }

    stopProgressTimer();

    if (reportDebounceTimer) {
      clearTimeout(reportDebounceTimer);
      reportDebounceTimer = null;
    }

    // Destroy Shaka player
    if (player) {
      try {
        await player.destroy();
      } catch {
        // Ignore destroy errors
      }
      player = null;
    }

    videoElement = null;
    currentVideoId = null;
    lastReportedEvent = null;
    seekStarted = false;
  }

  function retry(): void {
    if (videoElement && currentVideoId) {
      error.value = '';
      initPlayer(videoElement, currentVideoId);
    }
  }

  // Auto-cleanup on component unmount
  onUnmounted(() => {
    destroy();
  });

  return {
    loading,
    error,
    videoTitle,
    initPlayer,
    destroy,
    retry,
  };
}
