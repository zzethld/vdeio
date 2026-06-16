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
  height: 60vh;
  text-align: center;
}

.error-code {
  font-size: 120px;
  font-weight: 800;
  color: #c0c4cc;
  line-height: 1;
  margin-bottom: 16px;
}

.error-text {
  font-size: 18px;
  color: #909399;
  margin-bottom: 32px;
}
</style>
