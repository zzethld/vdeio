<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const formRef = ref<FormInstance>();
const loading = ref(false);

const loginForm = reactive({
  username: '',
  password: '',
});

const rules = reactive<FormRules>({
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
});

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    await authStore.login(loginForm.username, loginForm.password);
    ElMessage.success('登录成功');
    const redirect = (route.query.redirect as string) || '/dashboard';
    router.push(redirect);
  } catch {
    // Error message already shown by request interceptor.
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h1 class="login-title">VDEIO</h1>
        <p class="login-subtitle">连锁门店视频管理系统</p>
      </div>

      <el-form
        ref="formRef"
        :model="loginForm"
        :rules="rules"
        size="large"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="用户名"
            prefix-icon="User"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="密码"
            prefix-icon="Lock"
            show-password
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            :loading="loading"
            class="login-btn"
            @click="handleLogin"
          >
            {{ loading ? '登录中...' : '登 录' }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-base);
  padding: var(--space-6);
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: var(--space-12) var(--space-8) var(--space-8);
  background-color: var(--bg-elevated);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  border: var(--border-subtle);
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-8);
}

.login-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 6px;
  margin: 0 0 var(--space-2);
  line-height: 1.2;
}

.login-subtitle {
  font-size: var(--el-font-size-base);
  color: var(--text-secondary);
  margin: 0;
}

.login-btn {
  width: 100%;
}
</style>
