import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/router', () => {
  const push = vi.fn();
  return { default: { push } };
});

vi.mock('@/utils/request', () => {
  const get = vi.fn();
  const post = vi.fn().mockResolvedValue({ data: {} });
  return { default: { get, post } };
});

import { usePlayerStore } from '@/stores/player';

describe('usePlayerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty state', () => {
      const store = usePlayerStore();
      expect(store.loading).toBe(false);
      expect(store.error).toBe('');
      expect(store.videoTitle).toBe('');
      expect(store.currentVideoId).toBeNull();
    });

    it('isLoading reflects loading', () => {
      const store = usePlayerStore();
      expect(store.isLoading).toBe(false);
      store.setLoading(true);
      expect(store.isLoading).toBe(true);
    });

    it('hasError reflects error', () => {
      const store = usePlayerStore();
      expect(store.hasError).toBe(false);
      store.setError('fail');
      expect(store.hasError).toBe(true);
    });

    it('hasVideo reflects currentVideoId', () => {
      const store = usePlayerStore();
      expect(store.hasVideo).toBe(false);
      store.setCurrentVideo(42);
      expect(store.hasVideo).toBe(true);
    });
  });

  describe('setters', () => {
    it('setLoading sets loading', () => {
      const store = usePlayerStore();
      store.setLoading(true);
      expect(store.loading).toBe(true);
      store.setLoading(false);
      expect(store.loading).toBe(false);
    });

    it('setError sets error message', () => {
      const store = usePlayerStore();
      store.setError('video failed');
      expect(store.error).toBe('video failed');
    });

    it('clearError resets error to empty', () => {
      const store = usePlayerStore();
      store.setError('err');
      store.clearError();
      expect(store.error).toBe('');
    });

    it('setVideoTitle sets title', () => {
      const store = usePlayerStore();
      store.setVideoTitle('My Video');
      expect(store.videoTitle).toBe('My Video');
    });

    it('setCurrentVideo sets id', () => {
      const store = usePlayerStore();
      store.setCurrentVideo(99);
      expect(store.currentVideoId).toBe(99);
    });

    it('setCurrentVideo accepts null', () => {
      const store = usePlayerStore();
      store.setCurrentVideo(10);
      store.setCurrentVideo(null);
      expect(store.currentVideoId).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const store = usePlayerStore();
      store.setLoading(true);
      store.setError('err');
      store.setVideoTitle('Title');
      store.setCurrentVideo(5);

      store.reset();

      expect(store.loading).toBe(false);
      expect(store.error).toBe('');
      expect(store.videoTitle).toBe('');
      expect(store.currentVideoId).toBeNull();
    });
  });

  describe('playback position persistence', () => {
    it('savePlaybackPosition writes to localStorage', () => {
      const store = usePlayerStore();
      store.savePlaybackPosition(42, 123.45);
      expect(localStorage.getItem('video:progress:42')).toBe('123.45');
    });

    it('getPlaybackPosition reads from localStorage', () => {
      localStorage.setItem('video:progress:10', '55');
      const store = usePlayerStore();
      expect(store.getPlaybackPosition(10)).toBe(55);
    });

    it('getPlaybackPosition returns null when not stored', () => {
      const store = usePlayerStore();
      expect(store.getPlaybackPosition(999)).toBeNull();
    });

    it('getPlaybackPosition returns null for invalid value', () => {
      localStorage.setItem('video:progress:10', 'not-a-number');
      const store = usePlayerStore();
      expect(store.getPlaybackPosition(10)).toBeNull();
    });

    it('clearPlaybackPosition removes from localStorage', () => {
      localStorage.setItem('video:progress:10', '30');
      const store = usePlayerStore();
      store.clearPlaybackPosition(10);
      expect(localStorage.getItem('video:progress:10')).toBeNull();
    });

    it('round-trips save then load', () => {
      const store = usePlayerStore();
      store.savePlaybackPosition(5, 42.5);
      expect(store.getPlaybackPosition(5)).toBe(42.5);
    });
  });
});
