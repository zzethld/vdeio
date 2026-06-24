import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

// --- Mocks ---

const mockRegisterResponseFilter = vi.fn();
const mockRegisterRequestFilter = vi.fn();
const mockNetworkingEngine = {
  registerResponseFilter: mockRegisterResponseFilter,
  registerRequestFilter: mockRegisterRequestFilter,
};

const mockPlayerInstance = {
  attach: vi.fn().mockResolvedValue(undefined),
  load: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  configure: vi.fn(),
  getNetworkingEngine: vi.fn().mockReturnValue(mockNetworkingEngine),
};

function MockPlayerConstructor(this: unknown) {
  return mockPlayerInstance;
}
(MockPlayerConstructor as any).isBrowserSupported = vi.fn().mockReturnValue(true);

vi.mock('shaka-player/dist/shaka-player.compiled', () => ({
  default: {
    polyfill: { installAll: vi.fn() },
    Player: MockPlayerConstructor,
    net: {
      NetworkingEngine: {
        RequestType: { KEY: 2, MANIFEST: 0, SEGMENT: 1 },
      },
    },
  },
}));

vi.mock('@/utils/request', () => {
  const get = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/key')) {
      // The /key endpoint carries the per-video keyTtlHours via the
      // X-Key-TTL response header (the playlist endpoint serves m3u8).
      return Promise.resolve({ data: new ArrayBuffer(16), headers: { 'x-key-ttl': '168' } });
    }
    return Promise.resolve({ data: {} });
  });
  const post = vi.fn().mockResolvedValue({ data: {} });
  return { default: { get, post } };
});

vi.mock('@/stores/auth', () => {
  const store = {
    setTokens: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    refreshAccessToken: vi.fn().mockResolvedValue(true),
  };
  return { useAuthStore: vi.fn(() => store) };
});

vi.mock('@/router', () => {
  const push = vi.fn();
  return { default: { push } };
});

// --- Imports after mocks ---

import { usePlayer } from '@/composables/usePlayer';
import request from '@/utils/request';

function createVideoElement(): HTMLVideoElement {
  const el = document.createElement('video');
  Object.defineProperty(el, 'currentTime', { value: 0, writable: true, configurable: true });
  Object.defineProperty(el, 'duration', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'paused', { value: false, writable: true, configurable: true });
  return el;
}

function withPlayer() {
  let result: ReturnType<typeof usePlayer>;
  mount(defineComponent({
    setup() {
      result = usePlayer();
      return {};
    },
    render: () => h('div'),
  }));
  return result!;
}

describe('usePlayer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns expected interface', () => {
    const player = withPlayer();
    expect(player.loading).toBeDefined();
    expect(player.error).toBeDefined();
    expect(player.initPlayer).toBeDefined();
    expect(player.destroy).toBeDefined();
    expect(player.retry).toBeDefined();
  });

  it('initializes player and loads video', async () => {
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 123);
    expect(player.loading.value).toBe(false);
    expect(player.error.value).toBe('');
  });

  it('restores saved progress on init', async () => {
    localStorage.setItem('video:progress:123', '25');
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 123);
    expect(videoEl.currentTime).toBe(25);
  });

  it('does not restore progress if near end', async () => {
    localStorage.setItem('video:progress:123', '98');
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 123);
    expect(videoEl.currentTime).toBe(0);
  });

  it('saves progress on destroy', async () => {
    const player = withPlayer();
    const videoEl = createVideoElement();
    videoEl.currentTime = 42;
    await player.initPlayer(videoEl, 123);
    await player.destroy();
    expect(localStorage.getItem('video:progress:123')).toBe('42');
  });

  it('clears progress when video ends', async () => {
    localStorage.setItem('video:progress:123', '30');
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 123);
    videoEl.dispatchEvent(new Event('ended'));
    expect(localStorage.getItem('video:progress:123')).toBeNull();
  });

  it('saves progress periodically while playing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const player = withPlayer();
    const videoEl = createVideoElement();
    videoEl.currentTime = 15;
    await player.initPlayer(videoEl, 123);

    await vi.advanceTimersByTimeAsync(5000);
    expect(localStorage.getItem('video:progress:123')).toBe('15');
  });

  it('registers request filter for JWT injection on HLS requests', async () => {
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 456);
    expect(mockRegisterRequestFilter).toHaveBeenCalled();
  });

  it('registers response filter for key interception', async () => {
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 456);
    expect(mockRegisterResponseFilter).toHaveBeenCalled();
  });

  it('response filter fetches key and injects into response', async () => {
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 789);

    const filterCallback = mockRegisterResponseFilter.mock.calls[0][0];
    const response = { data: new ArrayBuffer(0), headers: { 'content-type': 'application/octet-stream' } };

    await filterCallback(2, response); // 2 = RequestType.KEY

    expect(request.get).toHaveBeenCalledWith('/devices/videos/789/key', { responseType: 'arraybuffer' });
    expect(response.data).toBeInstanceOf(ArrayBuffer);
    expect(response.headers).toEqual({});
  });

  it('passes access code to key endpoint and does not cache key for code videos', async () => {
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 789, 'SECRET-123');

    const filterCallback = mockRegisterResponseFilter.mock.calls[0][0];
    const response = { data: new ArrayBuffer(0), headers: {} };

    await filterCallback(2, response);

    expect(request.get).toHaveBeenCalledWith('/devices/videos/789/key', {
      responseType: 'arraybuffer',
      params: { code: 'SECRET-123' },
    });
    expect(localStorage.getItem('video:key:789')).toBeNull();
  });

  it('appends access code to segment and playlist urls in request filter', async () => {
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 789, 'SECRET-123');

    const filterCallback = mockRegisterRequestFilter.mock.calls[0][0];
    const requestObj = { uris: ['/api/v1/devices/videos/789/segment/001'] };
    filterCallback(1, requestObj); // 1 = RequestType.SEGMENT

    expect(requestObj.uris[0]).toBe('/api/v1/devices/videos/789/segment/001?code=SECRET-123');
  });

  it('uses cached key and skips server fetch on cache hit', async () => {
    const keyBase64 = btoa('x'.repeat(16));
    localStorage.setItem('video:key:789', JSON.stringify({ key: keyBase64, timestamp: Date.now() }));

    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 789);
    const filterCallback = mockRegisterResponseFilter.mock.calls[0][0];
    vi.clearAllMocks();

    const response = { data: new ArrayBuffer(0), headers: {} };
    await filterCallback(2, response);

    expect(request.get).not.toHaveBeenCalled();
    expect(response.data).toBeInstanceOf(ArrayBuffer);
  });

  it('ignores cached key when access code is provided', async () => {
    const keyBase64 = btoa('x'.repeat(16));
    localStorage.setItem('video:key:789', JSON.stringify({ key: keyBase64, timestamp: Date.now() }));

    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 789, 'SECRET-123');
    const filterCallback = mockRegisterResponseFilter.mock.calls[0][0];
    vi.clearAllMocks();

    const response = { data: new ArrayBuffer(0), headers: {} };
    await filterCallback(2, response);

    expect(request.get).toHaveBeenCalledWith('/devices/videos/789/key', {
      responseType: 'arraybuffer',
      params: { code: 'SECRET-123' },
    });
  });

  it('expires cached key after TTL and refetches', async () => {
    const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
    const keyBase64 = btoa('x'.repeat(16));
    localStorage.setItem('video:key:789', JSON.stringify({ key: keyBase64, timestamp: oldTimestamp }));

    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 789);
    const filterCallback = mockRegisterResponseFilter.mock.calls[0][0];
    vi.clearAllMocks();

    const response = { data: new ArrayBuffer(0), headers: {} };
    await filterCallback(2, response);

    expect(request.get).toHaveBeenCalledWith('/devices/videos/789/key', { responseType: 'arraybuffer' });
  });

  it('does not cache key when ttlHours is 0', async () => {
    const requestGet = request.get as Mock;
    requestGet.mockImplementation((url: string) => {
      if (url.includes('/key')) {
        // Server reports a 0-hour key TTL for this video.
        return Promise.resolve({ data: new ArrayBuffer(16), headers: { 'x-key-ttl': '0' } });
      }
      return Promise.resolve({ data: {} });
    });

    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 789);
    const filterCallback = mockRegisterResponseFilter.mock.calls[0][0];

    const response = { data: new ArrayBuffer(0), headers: {} };
    await filterCallback(2, response);

    expect(requestGet).toHaveBeenCalledWith('/devices/videos/789/key', { responseType: 'arraybuffer' });
    expect(localStorage.getItem('video:key:789')).toBeNull();
  });

  it('retry re-initializes player after error', async () => {
    const player = withPlayer();
    const videoEl = createVideoElement();
    await player.initPlayer(videoEl, 123);
    player.error.value = 'Some error';
    await player.retry();
    expect(player.error.value).toBe('');
  });
});
