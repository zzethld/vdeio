import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import request from '@/utils/request';

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

  function mountPlayer(videoId: string | number = '123', queryTitle?: string, accessMode?: string) {
    routeState.value = {
      params: { id: String(videoId) },
      query: { ...(queryTitle ? { title: queryTitle } : {}), ...(accessMode ? { accessMode } : {}) },
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
    expect(mockFns.initPlayer).toHaveBeenCalledWith(expect.anything(), 42, undefined);
  });

  it('does not call initPlayer when videoId is NaN', async () => {
    mountPlayer('abc');
    await flushPromises();
    expect(mockFns.initPlayer).not.toHaveBeenCalled();
  });

  it('shows code unlock overlay for code-protected videos', async () => {
    const { wrapper } = mountPlayer(42, undefined, 'code');
    await flushPromises();
    expect(wrapper.find('.code-overlay').exists()).toBe(true);
    expect(wrapper.find('.code-input').exists()).toBe(true);
    expect(mockFns.initPlayer).not.toHaveBeenCalled();
  });

  it('calls /unlock and initPlayer with code after submitting', async () => {
    const { wrapper } = mountPlayer(42, undefined, 'code');
    await flushPromises();

    await wrapper.find('.code-input').setValue('ABC-123');
    await wrapper.find('.btn-unlock-play').trigger('click');
    await flushPromises();

    expect(request.post).toHaveBeenCalledWith('/devices/unlock', { code: 'ABC-123', videoId: 42 });
    expect(mockFns.initPlayer).toHaveBeenCalledWith(expect.anything(), 42, 'ABC-123');
  });

  it('shows error when code unlock fails', async () => {
    (request.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      response: { data: { error: '无效的序列号' } },
    });

    const { wrapper } = mountPlayer(42, undefined, 'code');
    await flushPromises();

    await wrapper.find('.code-input').setValue('BAD');
    await wrapper.find('.btn-unlock-play').trigger('click');
    await flushPromises();

    expect(wrapper.find('.code-error').text()).toBe('无效的序列号');
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
