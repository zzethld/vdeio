import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const MainLayout = () => import('@/layouts/MainLayout.vue');
const Login = () => import('@/views/Login.vue');
const Dashboard = () => import('@/views/Dashboard.vue');
const NotFound = () => import('@/views/NotFound.vue');

// Video views
const VideoList = () => import('@/views/video/VideoList.vue');
const VideoUpload = () => import('@/views/video/VideoUpload.vue');
const VideoEdit = () => import('@/views/video/VideoEdit.vue');

// Campaign views
const CampaignList = () => import('@/views/campaign/CampaignList.vue');
const CampaignCreate = () => import('@/views/campaign/CampaignCreate.vue');
const CampaignDetail = () => import('@/views/campaign/CampaignDetail.vue');

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: Dashboard,
        meta: { title: '仪表盘' },
      },
      {
        path: 'videos',
        name: 'Videos',
        component: VideoList,
        meta: { title: '视频管理' },
      },
      {
        path: 'videos/upload',
        name: 'VideoUpload',
        component: VideoUpload,
        meta: { title: '上传视频' },
      },
      {
        path: 'videos/edit/:id',
        name: 'VideoEdit',
        component: VideoEdit,
        meta: { title: '编辑视频' },
      },
      {
        path: 'campaigns',
        name: 'Campaigns',
        component: CampaignList,
        meta: { title: '推广计划' },
      },
      {
        path: 'campaigns/create',
        name: 'CampaignCreate',
        component: CampaignCreate,
        meta: { title: '新建推广计划' },
      },
      {
        path: 'campaigns/edit/:id',
        name: 'CampaignEdit',
        component: CampaignCreate,
        meta: { title: '编辑推广计划' },
      },
      {
        path: 'campaigns/:id',
        name: 'CampaignDetail',
        component: CampaignDetail,
        meta: { title: '推广计划详情' },
      },
      {
        path: 'stores',
        name: 'Stores',
        component: () => import('@/views/store/StoreList.vue'),
        meta: { title: '门店管理' },
      },
      {
        path: 'devices',
        name: 'Devices',
        component: () => import('@/views/device/DeviceList.vue'),
        meta: { title: '设备管理' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();
  const requiresAuth = to.matched.some((r) => r.meta.requiresAuth !== false);

  if (requiresAuth && !authStore.isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
  } else if (to.name === 'Login' && authStore.isLoggedIn) {
    next({ name: 'Dashboard' });
  } else {
    next();
  }
});

export default router;
