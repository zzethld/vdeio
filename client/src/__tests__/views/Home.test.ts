import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const pushMock = vi.fn();

vi.mock('@/utils/request', () => {
  const get = vi.fn().mockResolvedValue({ data: {} });
  const post = vi.fn().mockResolvedValue({ data: {} });
  return { default: { get, post } };
});

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ params: {}, query: {} }),
}));

import Home from '@/views/Home.vue';
import request from '@/utils/request';
import { useAuthStore } from '@/stores/auth';

describe('Home.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    pushMock.mockClear();
  });

  it('renders the page title', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { campaigns: [] } });
    const wrapper = mount(Home);
    await flushPromises();
    expect(wrapper.find('.app-header .header-title').text()).toBe('视频列表');
  });

  it('shows loading state initially', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise(() => {}));
    const wrapper = mount(Home);
    await flushPromises();
    expect(wrapper.find('.state-overlay').exists()).toBe(true);
  });

  it('renders campaign tabs for active campaigns', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        campaigns: [
          { id: 1, title: 'Campaign A', status: 'active', videos: [] },
          { id: 2, title: 'Campaign B', status: 'active', videos: [] },
          { id: 3, title: 'Old Campaign', status: 'expired', videos: [] },
        ],
      },
    });

    const wrapper = mount(Home);
    await flushPromises();

    const tabs = wrapper.findAll('.tab-btn');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].text()).toBe('Campaign A');
    expect(tabs[1].text()).toBe('Campaign B');
  });

  it('renders video cards for the active campaign', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        campaigns: [
          {
            id: 1, title: 'Campaign A', status: 'active',
            videos: [
              { id: 10, title: 'Video 10', fileSize: 1048576, encryptStatus: 'done' },
              { id: 20, title: 'Video 20', fileSize: 5242880, encryptStatus: 'done' },
            ],
          },
        ],
      },
    });

    const wrapper = mount(Home);
    await flushPromises();

    const cards = wrapper.findAll('.video-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].find('.video-title').text()).toBe('Video 10');
    expect(cards[0].find('.video-size').text()).toContain('MB');
  });

  it('shows empty state when no videos are available', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { campaigns: [] } });

    const wrapper = mount(Home);
    await flushPromises();

    expect(wrapper.find('.empty-state').exists()).toBe(true);
    expect(wrapper.find('.empty-state').text()).toBe('暂无视频');
  });

  it('shows error state when loading fails', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

    const wrapper = mount(Home);
    await flushPromises();

    expect(wrapper.find('.error-state').exists()).toBe(true);
    expect(wrapper.find('.error-state p').text()).toBe('加载视频列表失败');
  });

  it('clicking retry reloads videos', async () => {
    (request.get as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ data: { campaigns: [] } });

    const wrapper = mount(Home);
    await flushPromises();

    expect(wrapper.find('.error-state').exists()).toBe(true);

    await wrapper.find('.btn-retry').trigger('click');
    await flushPromises();

    expect(wrapper.find('.empty-state').exists()).toBe(true);
  });

  it('clicking play button navigates to player with metadata', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        campaigns: [
          {
            id: 1, title: 'Campaign A', status: 'active',
            videos: [{ id: 42, title: 'Click Me', fileSize: 100, encryptStatus: 'done', accessMode: 'code' }],
          },
        ],
      },
    });

    const wrapper = mount(Home);
    await flushPromises();

    await wrapper.find('.btn-play').trigger('click');
    expect(pushMock).toHaveBeenCalledWith({
      path: '/player/42',
      query: { title: 'Click Me', accessMode: 'code' },
    });
  });

  it('auto-selects first campaign tab', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        campaigns: [
          { id: 1, title: 'First', status: 'active', videos: [{ id: 10, title: 'V', fileSize: 1, encryptStatus: 'done' }] },
          { id: 2, title: 'Second', status: 'active', videos: [{ id: 20, title: 'V2', fileSize: 1, encryptStatus: 'done' }] },
        ],
      },
    });

    const wrapper = mount(Home);
    await flushPromises();

    expect(wrapper.find('.tab-btn.active').text()).toBe('First');
    expect(wrapper.findAll('.video-card')).toHaveLength(1);
  });

  it('switching tabs shows different videos', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        campaigns: [
          { id: 1, title: 'First', status: 'active', videos: [{ id: 10, title: 'Video10', fileSize: 1, encryptStatus: 'done' }] },
          { id: 2, title: 'Second', status: 'active', videos: [{ id: 20, title: 'Video20', fileSize: 1, encryptStatus: 'done' }] },
        ],
      },
    });

    const wrapper = mount(Home);
    await flushPromises();

    expect(wrapper.findAll('.video-card')[0].find('.video-title').text()).toBe('Video10');

    await wrapper.findAll('.tab-btn')[1].trigger('click');
    expect(wrapper.findAll('.video-card')[0].find('.video-title').text()).toBe('Video20');
  });

  it('formats file sizes correctly', async () => {
    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        campaigns: [
          {
            id: 1, title: 'C', status: 'active',
            videos: [
              { id: 1, title: 'Bytes', fileSize: 500, encryptStatus: 'done' },
              { id: 2, title: 'KB', fileSize: 2048, encryptStatus: 'done' },
              { id: 3, title: 'MB', fileSize: 5 * 1024 * 1024, encryptStatus: 'done' },
            ],
          },
        ],
      },
    });

    const wrapper = mount(Home);
    await flushPromises();

    const sizes = wrapper.findAll('.video-size');
    expect(sizes[0].text()).toBe('500.0 B');
    expect(sizes[1].text()).toContain('KB');
    expect(sizes[2].text()).toContain('MB');
  });

  it('shows store name when storeInfo is set', async () => {
    const authStore = useAuthStore();
    authStore.setStoreInfo({ id: 1, name: 'Test Store', code: 'TS', region: 'east' });

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { campaigns: [] } });

    const wrapper = mount(Home);
    await flushPromises();

    expect(wrapper.find('.store-name').text()).toBe('Test Store');
  });

  it('logout button calls authStore.logout', async () => {
    const authStore = useAuthStore();
    vi.spyOn(authStore, 'logout');

    (request.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { campaigns: [] } });

    const wrapper = mount(Home);
    await flushPromises();

    await wrapper.find('.btn-logout').trigger('click');
    expect(authStore.logout).toHaveBeenCalled();
  });
});
