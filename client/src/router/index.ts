import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const Login = () => import('@/views/Login.vue');
const Home = () => import('@/views/Home.vue');
const Player = () => import('@/views/Player.vue');
const SyncStatus = () => import('@/views/SyncStatus.vue');

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { requiresAuth: true, title: '视频列表' },
  },
  {
    path: '/player/:id',
    name: 'Player',
    component: Player,
    meta: { requiresAuth: true, title: '视频播放' },
  },
  {
    path: '/sync-status',
    name: 'SyncStatus',
    component: SyncStatus,
    meta: { requiresAuth: true, title: '同步状态' },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();
  const requiresAuth = to.matched.some((r) => r.meta.requiresAuth !== false);

  if (requiresAuth && !authStore.isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
  } else if (to.name === 'Login' && authStore.isLoggedIn) {
    next({ name: 'Home' });
  } else {
    next();
  }
});

export default router;
