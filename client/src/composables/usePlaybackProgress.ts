/**
 * Persists playback position per video in `localStorage` so playback can resume
 * where the user left off across sessions/restarts. Progress is cleared when a
 * video ends naturally (see `usePlayer` facade).
 */
export function usePlaybackProgress() {
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

  return {
    saveProgress,
    loadProgress,
    clearProgress,
  };
}
