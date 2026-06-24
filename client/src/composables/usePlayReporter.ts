import request from '@/utils/request';

export type PlayEvent = 'start' | 'pause' | 'resume' | 'end' | 'seek';

/**
 * Reports play events (start/pause/resume/end/seek) to the server's
 * `/devices/videos/:id/report-play` endpoint. Reports are debounced (500ms)
 * so rapid event bursts (e.g. scrubbing) don't flood the server.
 */
export function usePlayReporter() {
  let reportDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** Clears any pending debounced report. Call on destroy. */
  function dispose(): void {
    if (reportDebounceTimer) {
      clearTimeout(reportDebounceTimer);
      reportDebounceTimer = null;
    }
  }

  return {
    reportPlayEvent,
    dispose,
  };
}
