import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import request from '@/utils/request';
import router from '@/router';

interface Admin {
  id: string;
  username: string;
  name: string;
  role: string;
}

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string>('');
  const refreshToken = ref<string>('');
  const admin = ref<Admin | null>(null);

  const isLoggedIn = computed(() => !!accessToken.value);

  async function login(username: string, password: string) {
    const res = await request.post('/admin/auth/login', { username, password });
    const { accessToken: at, refreshToken: rt, admin: adminUser } = res.data;
    accessToken.value = at;
    refreshToken.value = rt;
    admin.value = adminUser;
    localStorage.setItem('accessToken', at);
    localStorage.setItem('refreshToken', rt);
    localStorage.setItem('admin', JSON.stringify(adminUser));
  }

  function logout() {
    accessToken.value = '';
    refreshToken.value = '';
    admin.value = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('admin');
    router.push('/login');
  }

  function loadFromStorage() {
    const at = localStorage.getItem('accessToken');
    const rt = localStorage.getItem('refreshToken');
    const adminStr = localStorage.getItem('admin');
    if (at) {
      accessToken.value = at;
      refreshToken.value = rt || '';
      if (adminStr) {
        try {
          admin.value = JSON.parse(adminStr);
        } catch {
          admin.value = null;
        }
      }
    }
  }

  return {
    accessToken,
    refreshToken,
    admin,
    isLoggedIn,
    login,
    logout,
    loadFromStorage,
  };
});
