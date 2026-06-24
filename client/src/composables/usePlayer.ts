import { ref, onUnmounted } from 'vue';
import shaka from 'shaka-player/dist/shaka-player.compiled';
import { useEncryptionKey } from '@/composables/useEncryptionKey';
import { usePlaybackProgress } from '@/composables/usePlaybackProgress';
import { usePlayReporter, type PlayEvent } from '@/composables/usePlayReporter';
import { useShakaPlayer } from '@/composables/useShakaPlayer';

const PROGRESS_SAVE_INTERVAL = 5000; // 5 seconds

/**
 * Facade composing the player sub-composables into the public API consumed by
 * `Player.vue`. Retains the "glue": video element event binding, progress
 * restore/periodic-save timer, start-vs-resume disambiguation, and the AES key
 * response filter (delegates key fetch to `useEncryptionKey`).
 */
export function usePlayer() {
  const loading = ref(false);
  const error = ref('');

  let videoElement: HTMLVideoElement | null = null;
  let currentVideoId: number | null = null;
  let currentAccessCode: string | undefined;
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let lastReportedEvent: PlayEvent | null = null;
  let seekStarted = false;

  const { fetchEncryptionKey } = useEncryptionKey();
  const { saveProgress, loadProgress, clearProgress } = usePlaybackProgress();
  const { reportPlayEvent, dispose: disposeReporter } = usePlayReporter();
  const { init: initShaka, destroy: destroyShaka } = useShakaPlayer();

  // Injects the fetched AES key into KEY responses. For code-protected playback
  // the access code is passed so the key is fetched per-request, not cached.
  async function onKeyResponse(
    type: shaka.net.NetworkingEngine.RequestType,
    response: shaka.extern.Response,
  ): Promise<void> {
    if (type !== shaka.net.NetworkingEngine.RequestType.KEY || !currentVideoId) return;
    try {
      response.data = await fetchEncryptionKey(currentVideoId, currentAccessCode);
      response.headers = {};
    } catch (err) {
      console.error('[Player] Failed to inject encryption key:', err);
    }
  }

  // --- Video event handlers ---

  function onPlay(): void {
    if (!currentVideoId || !videoElement) return;
    const event: PlayEvent = lastReportedEvent === 'pause' ? 'resume' : 'start';
    reportPlayEvent(currentVideoId, event, videoElement.currentTime, videoElement.duration || 0);
    lastReportedEvent = event;
  }

  function onPause(): void {
    if (!currentVideoId || !videoElement) return;
    reportPlayEvent(currentVideoId, 'pause', videoElement.currentTime, videoElement.duration || 0);
    lastReportedEvent = 'pause';
  }

  function onEnded(): void {
    if (!currentVideoId || !videoElement) return;
    reportPlayEvent(currentVideoId, 'end', videoElement.currentTime, videoElement.duration || 0);
    lastReportedEvent = 'end';
    clearProgress(currentVideoId); // Clear progress when video ends naturally
  }

  function onSeeking(): void {
    seekStarted = true;
  }

  function onSeeked(): void {
    if (!seekStarted || !currentVideoId || !videoElement) return;
    seekStarted = false;
    reportPlayEvent(currentVideoId, 'seek', videoElement.currentTime, videoElement.duration || 0);
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

  async function initPlayer(el: HTMLVideoElement, videoId: number, accessCode?: string): Promise<void> {
    loading.value = true;
    error.value = '';
    currentVideoId = videoId;
    currentAccessCode = accessCode;
    videoElement = el;

    try {
      // Clear loading state once the video element can render, regardless of
      // when player.load() resolves — Shaka may start playback before load()
      // settles and we don't want the overlay covering a playing video.
      el.addEventListener('loadeddata', () => { loading.value = false; }, { once: true });

      await initShaka({
        videoEl: el,
        videoId,
        accessCode,
        onResponseFilter: onKeyResponse,
      });

      // Restore saved progress (skip if near the end)
      const saved = loadProgress(videoId);
      if (saved !== null && saved > 0 && el.duration > 0 && saved < el.duration - 5) {
        el.currentTime = saved;
      }

      el.addEventListener('play', onPlay);
      el.addEventListener('pause', onPause);
      el.addEventListener('ended', onEnded);
      el.addEventListener('seeking', onSeeking);
      el.addEventListener('seeked', onSeeked);

      startProgressTimer();
      loading.value = false;
    } catch (err) {
      loading.value = false;
      error.value = err instanceof Error ? err.message : '播放失败，请重试';
      console.error('[Player] Init failed:', err);
    }
  }

  async function destroy(): Promise<void> {
    if (currentVideoId && videoElement) {
      saveProgress(currentVideoId, videoElement.currentTime);
      reportPlayEvent(currentVideoId, 'end', videoElement.currentTime, videoElement.duration || 0);
    }

    if (videoElement) {
      videoElement.removeEventListener('play', onPlay);
      videoElement.removeEventListener('pause', onPause);
      videoElement.removeEventListener('ended', onEnded);
      videoElement.removeEventListener('seeking', onSeeking);
      videoElement.removeEventListener('seeked', onSeeked);
    }

    stopProgressTimer();
    disposeReporter();
    await destroyShaka();

    videoElement = null;
    currentVideoId = null;
    currentAccessCode = undefined;
    lastReportedEvent = null;
    seekStarted = false;
  }

  function retry(): void {
    if (videoElement && currentVideoId) {
      error.value = '';
      initPlayer(videoElement, currentVideoId);
    }
  }

  onUnmounted(() => {
    destroy();
  });

  return {
    loading,
    error,
    initPlayer,
    destroy,
    retry,
  };
}
