<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">门店视频播放系统</h1>
      <p class="login-subtitle">
        {{ mockMode ? '开发模式 — 点击下方按钮登录' : '请使用钉钉扫码登录' }}
      </p>

      <!-- Mock Mode: Show mock login button prominently -->
      <div v-if="mockMode" class="qr-area mock-area">
        <div v-if="authLoading" class="qr-loading">
          <span class="spinner"></span>
          <span>登录中...</span>
        </div>
        <template v-else>
          <div class="mock-badge">DEV</div>
          <p class="mock-hint">钉钉未配置，使用模拟登录</p>
          <button class="btn-mock-primary" @click="handleMockLogin">
            模拟登录
          </button>
        </template>
      </div>

      <!-- Normal Mode: Show QR code -->
      <div v-else class="qr-area">
        <div v-if="authLoading" class="qr-loading">
          <span class="spinner"></span>
          <span>加载中...</span>
        </div>
        <iframe
          v-else-if="qrCodeUrl"
          :src="qrCodeUrl"
          class="qr-iframe"
          frameborder="0"
          scrolling="no"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="钉钉扫码登录"
        />
        <div v-else class="qr-error">
          <span class="error-icon">!</span>
          <span>{{ error || '二维码加载失败' }}</span>
          <button class="btn-retry" @click="retryLoad">重新加载</button>
        </div>
      </div>

      <p v-if="!mockMode" class="login-hint">打开钉钉 → 扫一扫 → 确认登录</p>

      <div v-if="error && (qrCodeUrl || mockMode)" class="login-error">
        {{ error }}
      </div>

      <!-- Mock login fallback in normal mode -->
      <div v-if="!mockMode" class="mock-section">
        <button class="btn-mock" @click="handleMockLogin">模拟扫码</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useDingTalkAuth } from '@/composables/useDingTalkAuth';

const {
  qrCodeUrl,
  loading: authLoading,
  error,
  mockMode,
  getQRCode,
  startPolling,
  stopPolling,
  mockLogin,
} = useDingTalkAuth();

function retryLoad() {
  loadQR();
}

async function handleMockLogin() {
  stopPolling();
  await mockLogin();
}

async function loadQR() {
  await getQRCode();
  if (qrCodeUrl.value && !mockMode.value) {
    startPolling();
  }
}

onMounted(() => {
  loadQR();
});
</script>

<style scoped>
.login-page {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
  padding: var(--space-6);
}

.login-card {
  width: 360px;
  max-width: 100%;
  background: var(--bg-elevated);
  border-radius: var(--radius-xl);
  padding: var(--space-10) var(--space-8);
  text-align: center;
  box-shadow: var(--shadow-lg);
}

.login-title {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.login-subtitle {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: var(--space-8);
}

.qr-area {
  width: 240px;
  height: 240px;
  margin: 0 auto var(--space-6);
  border: var(--border-default);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--bg-sunken);
}

.qr-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.qr-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-secondary);
  font-size: 14px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-default);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.qr-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: 13px;
}

.error-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--error) 14%, transparent);
  color: var(--error);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
}

.btn-retry {
  margin-top: var(--space-1);
  padding: var(--space-1) var(--space-4);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}

.btn-retry:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}

.btn-retry:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.login-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: var(--space-4);
}

.login-error {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: color-mix(in srgb, var(--error) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
  border-radius: var(--radius-md);
  color: var(--error);
  font-size: 13px;
}

.mock-section {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--border-default);
}

.btn-mock {
  padding: var(--space-2) var(--space-6);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 13px;
  transition: color var(--duration-fast) var(--ease-default);
}

.btn-mock:hover {
  color: var(--text-secondary);
}

.mock-area {
  flex-direction: column;
  gap: var(--space-4);
}

.mock-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent-subtle);
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.mock-hint {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.btn-mock-primary {
  padding: var(--space-3) var(--space-10);
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--text-inverse);
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  transition: background var(--duration-fast) var(--ease-default);
}

.btn-mock-primary:hover {
  background: var(--accent-hover);
}

.btn-mock-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
</style>
