import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import request from '@/utils/request';
import router from '@/router';

interface StoreInfo {
  id: number;
  name: string;
  code: string;
  region: string;
}

interface UserInfo {
  id: number;
  name: string;
  phone: string;
  avatar: string;
  role: string;
}

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string>('');
  const refreshToken = ref<string>('');
  const storeInfo = ref<StoreInfo | null>(null);
  const user = ref<UserInfo | null>(null);

  const isLoggedIn = computed(() => !!accessToken.value);

  function setTokens(at: string, rt: string) {
    accessToken.value = at;
    refreshToken.value = rt;
    localStorage.setItem('accessToken', at);
    localStorage.setItem('refreshToken', rt);
  }

  function setStoreInfo(info: StoreInfo) {
    storeInfo.value = info;
    localStorage.setItem('storeInfo', JSON.stringify(info));
  }

  function setUser(info: UserInfo) {
    user.value = info;
    localStorage.setItem('user', JSON.stringify(info));
  }

  async function refreshAccessToken(): Promise<boolean> {
    try {
      const rt = refreshToken.value;
      if (!rt) return false;
      const res = await request.post('/auth/refresh', { refreshToken: rt });
      const { accessToken: newAt, refreshToken: newRt } = res.data;
      setTokens(newAt, newRt);
      return true;
    } catch {
      return false;
    }
  }

  function logout() {
    accessToken.value = '';
    refreshToken.value = '';
    storeInfo.value = null;
    user.value = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('storeInfo');
    localStorage.removeItem('user');
    router.push('/login');
  }

  function loadFromStorage() {
    const at = localStorage.getItem('accessToken');
    const rt = localStorage.getItem('refreshToken');
    const storeStr = localStorage.getItem('storeInfo');
    const userStr = localStorage.getItem('user');
    if (at) {
      accessToken.value = at;
      refreshToken.value = rt || '';
      if (storeStr) {
        try {
          storeInfo.value = JSON.parse(storeStr);
        } catch {
          storeInfo.value = null;
        }
      }
      if (userStr) {
        try {
          user.value = JSON.parse(userStr);
        } catch {
          user.value = null;
        }
      }
    }
  }

  // Initialize from storage on store creation
  loadFromStorage();

  return {
    accessToken,
    refreshToken,
    storeInfo,
    user,
    isLoggedIn,
    setTokens,
    setStoreInfo,
    setUser,
    refreshAccessToken,
    logout,
    loadFromStorage,
  };
});
