<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  Monitor,
  VideoCamera,
  Promotion,
  OfficeBuilding,
  Cpu,
  Fold,
  Expand,
  SwitchButton,
} from '@element-plus/icons-vue';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const isCollapsed = ref(false);

const sidebarWidth = computed(() => (isCollapsed.value ? '64px' : '220px'));

const adminName = computed(() => authStore.admin?.name || authStore.admin?.username || '管理员');

const menuItems = [
  { index: '/dashboard', icon: Monitor, label: '仪表盘' },
  { index: '/videos', icon: VideoCamera, label: '视频管理' },
  { index: '/campaigns', icon: Promotion, label: '推广计划' },
  { index: '/stores', icon: OfficeBuilding, label: '门店管理' },
  { index: '/devices', icon: Cpu, label: '设备管理' },
];

const activeMenu = computed(() => route.path);

function handleMenuSelect(index: string) {
  router.push(index);
}

function handleLogout() {
  authStore.logout();
}
</script>

<template>
  <el-container class="main-layout">
    <!-- Sidebar -->
    <el-aside :width="sidebarWidth" class="sidebar">
      <div class="logo-area">
        <h1 v-show="!isCollapsed" class="logo-text">VDEIO</h1>
        <h1 v-show="isCollapsed" class="logo-text mini">V</h1>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapsed"
        :collapse-transition="false"
        class="sidebar-menu"
        @select="handleMenuSelect"
      >
        <el-menu-item v-for="item in menuItems" :key="item.index" :index="item.index">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- Main content area -->
    <el-container class="main-container">
      <!-- Top bar -->
      <el-header class="top-bar">
        <div class="top-bar-left">
          <el-icon class="collapse-btn" @click="isCollapsed = !isCollapsed">
            <Fold v-if="!isCollapsed" />
            <Expand v-else />
          </el-icon>
          <span class="page-title">{{ (route.meta.title as string) || '管理后台' }}</span>
        </div>
        <div class="top-bar-right">
          <span class="admin-name">{{ adminName }}</span>
          <el-button :icon="SwitchButton" text @click="handleLogout">退出</el-button>
        </div>
      </el-header>

      <!-- Content -->
      <el-main class="content-area">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.main-layout {
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-base);
}

.sidebar {
  background-color: var(--bg-elevated);
  border-right: var(--border-subtle);
  transition: width var(--duration-slow) var(--ease-default);
  overflow: hidden;
}

.logo-area {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: var(--border-subtle);
}

.logo-text {
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 4px;
  user-select: none;
  white-space: nowrap;
}

.logo-text.mini {
  font-size: 26px;
  letter-spacing: 0;
}

.sidebar-menu {
  border-right: none;
  background-color: var(--bg-elevated);
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 220px;
}

.sidebar-menu :deep(.el-menu-item) {
  color: var(--text-secondary);
  transition: background-color var(--duration-fast) var(--ease-default),
              color var(--duration-fast) var(--ease-default);
}

.sidebar-menu :deep(.el-menu-item:hover) {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  position: relative;
  background-color: var(--bg-active);
  color: var(--accent);
}

.sidebar-menu :deep(.el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--accent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.sidebar-menu :deep(.el-icon) {
  color: inherit;
}

.main-container {
  overflow: hidden;
  background-color: var(--bg-base);
}

.top-bar {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--bg-elevated);
  border-bottom: var(--border-subtle);
  padding: 0 var(--space-5);
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.collapse-btn {
  font-size: 20px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color var(--duration-fast) var(--ease-default);
}

.collapse-btn:hover {
  color: var(--accent);
}

.page-title {
  font-size: var(--el-font-size-large);
  font-weight: 600;
  color: var(--text-primary);
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.admin-name {
  font-size: var(--el-font-size-base);
  color: var(--text-secondary);
}

.content-area {
  background-color: var(--bg-base);
  color: var(--text-primary);
  overflow-y: auto;
  padding: var(--space-6);
}
</style>
