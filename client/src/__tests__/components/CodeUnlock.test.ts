import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('@/utils/request', () => ({
  default: { post: postMock },
}));

import CodeUnlock from '@/components/CodeUnlock.vue';

describe('CodeUnlock.vue', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('emits unlocked with video data on success', async () => {
    postMock.mockResolvedValueOnce({
      data: { videoId: 42, title: 'Secret Video', accessMode: 'code' },
    });

    const wrapper = mount(CodeUnlock);
    await wrapper.find('.unlock-input').setValue('ABC-123');
    await wrapper.find('.btn-unlock').trigger('click');
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith('/devices/unlock', { code: 'ABC-123' });
    expect(wrapper.emitted('unlocked')).toBeTruthy();
    expect(wrapper.emitted('unlocked')![0][0]).toEqual({
      videoId: 42,
      title: 'Secret Video',
      accessMode: 'code',
    });
  });

  it('shows server error message when unlock fails', async () => {
    postMock.mockRejectedValueOnce({
      response: { data: { error: '无效的序列号' } },
    });

    const wrapper = mount(CodeUnlock);
    await wrapper.find('.unlock-input').setValue('BAD');
    await wrapper.find('.btn-unlock').trigger('click');
    await flushPromises();

    expect(wrapper.find('.unlock-error').exists()).toBe(true);
    expect(wrapper.find('.unlock-error').text()).toBe('无效的序列号');
  });

  it('shows default error message when response has no error field', async () => {
    postMock.mockRejectedValueOnce(new Error('network down'));

    const wrapper = mount(CodeUnlock);
    await wrapper.find('.unlock-input').setValue('X');
    await wrapper.find('.btn-unlock').trigger('click');
    await flushPromises();

    expect(wrapper.find('.unlock-error').text()).toBe('解锁失败');
  });

  it('clears the input after a successful unlock', async () => {
    postMock.mockResolvedValueOnce({
      data: { videoId: 1, title: 'V', accessMode: 'code' },
    });

    const wrapper = mount(CodeUnlock);
    await wrapper.find('.unlock-input').setValue('USED-CODE');
    await wrapper.find('.btn-unlock').trigger('click');
    await flushPromises();

    expect((wrapper.find('.unlock-input').element as HTMLInputElement).value).toBe('');
  });

  it('does not call the API when the code is empty or whitespace', async () => {
    const wrapper = mount(CodeUnlock);
    // No value entered — button should be disabled / submit guarded
    await wrapper.find('.btn-unlock').trigger('click');
    await flushPromises();

    expect(postMock).not.toHaveBeenCalled();
  });

  it('does not emit when only whitespace is entered', async () => {
    const wrapper = mount(CodeUnlock);
    await wrapper.find('.unlock-input').setValue('   ');
    await wrapper.find('.btn-unlock').trigger('click');
    await flushPromises();

    expect(postMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('unlocked')).toBeFalsy();
  });
});
