import { ref, onUnmounted } from 'vue';
import request from '@/utils/request';
import { useAuthStore } from '@/stores/auth';
import router from '@/router';

interface PollSuccessResult {
  status: 'success';
  accessToken: string;
  refreshToken: string;
  user: {
    id: number;
    name: string;
    phone: string;
    avatar: string;
    role: string;
  };
  storeId: number | null;
  deviceId?: string;
}

export function useDingTalkAuth() {
  const qrCodeUrl = ref<string>('');
  const state = ref<string>('');
  const loading = ref(false);
  const error = ref<string>('');
  const mockMode = ref(false);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function getQRCode() {
    loading.value = true;
    error.value = '';
    try {
      const res = await request.get('/auth/dingtalk/qrcode');
      qrCodeUrl.value = res.data.qrCodeUrl || '';
      state.value = res.data.state || '';
      mockMode.value = !!res.data.mockMode;
    } catch (err) {
      error.value = '获取二维码失败，请重试';
      console.error('Failed to get QR code:', err);
    } finally {
      loading.value = false;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!state.value) return;
      try {
        const res = await request.get('/auth/poll', {
          params: { state: state.value },
        });
        const data = res.data as PollSuccessResult | { status: 'pending' };
        if (data.status === 'success') {
          stopPolling();
          onLoginSuccess(data);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 2000);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function onLoginSuccess(data: PollSuccessResult) {
    const authStore = useAuthStore();
    authStore.setTokens(data.accessToken, data.refreshToken);
    authStore.setUser(data.user);

    if (data.storeId === null || data.storeId === undefined) {
      error.value = '您的账号未绑定门店，请联系管理员';
      authStore.logout();
      return;
    }

    // Auto-register and bind device if not already registered.
    // In mock mode the server already provides a deviceId, so reuse it
    // instead of creating a new device that would conflict on store binding.
    const storedDeviceId = localStorage.getItem('deviceId');
    if (data.deviceId) {
      localStorage.setItem('deviceId', data.deviceId);
    } else if (!storedDeviceId) {
      try {
        const regRes = await request.post('/devices/register', {
          deviceName: navigator.userAgent.substring(0, 128),
          osVersion: 'web',
        });
        const { deviceId, deviceToken } = regRes.data;
        localStorage.setItem('deviceId', deviceId);
        localStorage.setItem('deviceToken', deviceToken);

        // Bind device to store
        try {
          await request.post('/devices/bind', {
            storeId: data.storeId,
            deviceId,
          });
        } catch (err) {
          console.warn('[Auth] Device bind failed:', err);
          error.value = '设备绑定门店失败，该门店可能已绑定其他设备';
          authStore.logout();
          return;
        }
      } catch (err) {
        console.warn('[Auth] Device registration failed:', err);
      }
    }

    router.push('/');
  }

  /** Dev mock: call server mock-login endpoint for real JWT tokens */
  async function mockLogin() {
    loading.value = true;
    error.value = '';
    try {
      const res = await request.post('/auth/mock-login');
      const data = res.data as PollSuccessResult;
      if (data.status === 'success') {
        await onLoginSuccess(data);
      } else {
        error.value = '模拟登录失败';
      }
    } catch (err) {
      error.value = '模拟登录失败，请检查服务器是否运行';
      console.error('Mock login failed:', err);
    } finally {
      loading.value = false;
    }
  }

  onUnmounted(() => {
    stopPolling();
  });

  return {
    qrCodeUrl,
    loading,
    error,
    mockMode,
    getQRCode,
    startPolling,
    stopPolling,
    mockLogin,
  };
}
