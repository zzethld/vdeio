import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// --- Hoisted mock state ---
const routeState = vi.hoisted(() => ({
  value: { params: { id: '123' }, query: {} as Record<string, unknown> },
}));

const routerState = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
}));

const mockFns = vi.hoisted(() => ({
  initPlayer: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  retry: vi.fn(),
}));

// --- Mocks ---

// Use reactive() so the template sees unwrapped boolean/string values (not ref objects).
// The mock factory can use `reactive` because vitest resolves vue before running it.
vi.mock('@/composables/usePlayer', () => {
  const { reactive } = require('vue');
  return {
    usePlayer: () =>
      reactive({
        loading: false,
        error: '',
        videoTitle: '',
        initPlayer: mockFns.initPlayer,
        destroy: mockFns.destroy,
        retry: mockFns.retry,
      }),
  };
});

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    setTokens: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    refreshAccessToken: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}));

vi.mock('vue-router', () => ({
  useRoute: () => routeState.value,
  useRouter: () => routerState,
}));

import Player from '@/views/Player.vue';

describe('Player.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.value = { params: { id: '123' }, query: {} };
    mockFns.initPlayer.mockResolvedValue(undefined);
    mockFns.destroy.mockResolvedValue(undefined);
  });

  function mountPlayer(videoId: string | number = '123', queryTitle?: string) {
    routeState.value = {
      params: { id: String(videoId) },
      query: queryTitle ? { title: queryTitle } : {},
    };
    return {
      push: routerState.push,
      wrapper: mount(Player),
    };
  }

  it('renders the player header with video id', () => {
    const { wrapper } = mountPlayer(42);
    expect(wrapper.find('.video-id').text()).toContain('42');
  });

  it('shows back button', () => {
    const { wrapper } = mountPlayer(42);
    expect(wrapper.find('.btn-back').exists()).toBe(true);
    expect(wrapper.find('.btn-back').text()).toContain('返回');
  });

  it('renders a video element', () => {
    const { wrapper } = mountPlayer(42);
    expect(wrapper.find('.video-element').exists()).toBe(true);
  });

  it('calls initPlayer on mount when videoId is valid', async () => {
    mountPlayer(42);
    await flushPromises();
    expect(mockFns.initPlayer).toHaveBeenCalledWith(expect.anything(), 42);
  });

  it('does not call initPlayer when videoId is NaN', async () => {
    mountPlayer('abc');
    await flushPromises();
    expect(mockFns.initPlayer).not.toHaveBeenCalled();
  });

  it('displays query title when available', async () => {
    const { wrapper } = mountPlayer(42, 'Query Title');
    await flushPromises();
    expect(wrapper.find('.player-header h1').text()).toBe('Query Title');
  });

  it('falls back to default title when no title available', async () => {
    const { wrapper } = mountPlayer(42);
    await flushPromises();
    expect(wrapper.find('.player-header h1').text()).toBe('视频播放');
  });

  it('clicking back button calls destroy and navigates home', async () => {
    const { wrapper, push } = mountPlayer(42);
    await flushPromises();

    await wrapper.find('.btn-back').trigger('click');
    await flushPromises();

    expect(mockFns.destroy).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/');
  });
});
