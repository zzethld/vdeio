import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const usePlayerStore = defineStore('player', () => {
  const loading = ref(false);
  const error = ref('');
  const videoTitle = ref('');
  const currentVideoId = ref<number | null>(null);

  const isLoading = computed(() => loading.value);
  const hasError = computed(() => !!error.value);
  const hasVideo = computed(() => currentVideoId.value !== null);

  function setLoading(value: boolean): void {
    loading.value = value;
  }

  function setError(msg: string): void {
    error.value = msg;
  }

  function clearError(): void {
    error.value = '';
  }

  function setVideoTitle(title: string): void {
    videoTitle.value = title;
  }

  function setCurrentVideo(id: number | null): void {
    currentVideoId.value = id;
  }

  function reset(): void {
    loading.value = false;
    error.value = '';
    videoTitle.value = '';
    currentVideoId.value = null;
  }

  /** Persist playback position for a video to localStorage */
  function savePlaybackPosition(videoId: number, position: number): void {
    localStorage.setItem(`video:progress:${videoId}`, String(position));
  }

  /** Load persisted playback position for a video */
  function getPlaybackPosition(videoId: number): number | null {
    const raw = localStorage.getItem(`video:progress:${videoId}`);
    if (!raw) return null;
    const pos = parseFloat(raw);
    return isNaN(pos) ? null : pos;
  }

  /** Clear persisted playback position for a video */
  function clearPlaybackPosition(videoId: number): void {
    localStorage.removeItem(`video:progress:${videoId}`);
  }

  return {
    loading,
    error,
    videoTitle,
    currentVideoId,
    isLoading,
    hasError,
    hasVideo,
    setLoading,
    setError,
    clearError,
    setVideoTitle,
    setCurrentVideo,
    reset,
    savePlaybackPosition,
    getPlaybackPosition,
    clearPlaybackPosition,
  };
});
