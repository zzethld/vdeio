<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goHome() {
  router.push('/dashboard');
}
</script>

<template>
  <div class="not-found">
    <h1 class="error-code">404</h1>
    <p class="error-text">页面未找到</p>
    <el-button type="primary" @click="goHome">返回首页</el-button>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  text-align: center;
  background-color: var(--bg-base);
  padding: var(--space-8);
}

.error-code {
  font-size: 120px;
  font-weight: 800;
  color: var(--text-tertiary);
  line-height: 1;
  margin: 0 0 var(--space-4);
}

.error-text {
  font-size: 18px;
  color: var(--text-secondary);
  margin: 0 0 var(--space-8);
}
</style>
