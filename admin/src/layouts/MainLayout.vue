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
        background-color="#1d1e1f"
        text-color="#bfcbd9"
        active-text-color="#409eff"
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
}

.sidebar {
  background-color: #1d1e1f;
  transition: width 0.28s;
  overflow: hidden;
}

.logo-area {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.logo-text {
  color: #fff;
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
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 220px;
}

.main-container {
  overflow: hidden;
}

.top-bar {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.collapse-btn {
  font-size: 20px;
  cursor: pointer;
  color: #606266;
  transition: color 0.2s;
}

.collapse-btn:hover {
  color: #409eff;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-name {
  font-size: 14px;
  color: #606266;
}

.content-area {
  background-color: #f5f7fa;
  overflow-y: auto;
}
</style>
