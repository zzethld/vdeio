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
          <div class="mock-icon">🔧</div>
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
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.login-card {
  background: #fff;
  border-radius: 12px;
  padding: 48px 40px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  min-width: 320px;
}

.login-title {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.login-subtitle {
  font-size: 14px;
  color: #666;
  margin-bottom: 32px;
}

.qr-area {
  width: 240px;
  height: 240px;
  margin: 0 auto 24px;
  border: 2px solid #e8e8e8;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
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
  gap: 12px;
  color: #999;
  font-size: 14px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e8e8e8;
  border-top-color: #0f3460;
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
  gap: 8px;
  color: #999;
  font-size: 13px;
}

.error-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #fee;
  color: #e53e3e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
}

.btn-retry {
  margin-top: 4px;
  padding: 4px 16px;
  border: 1px solid #0f3460;
  border-radius: 4px;
  background: transparent;
  color: #0f3460;
  cursor: pointer;
  font-size: 13px;
}

.btn-retry:hover {
  background: #0f3460;
  color: #fff;
}

.login-hint {
  font-size: 12px;
  color: #999;
  margin-bottom: 16px;
}

.login-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fff5f5;
  border: 1px solid #fed7d7;
  border-radius: 6px;
  color: #e53e3e;
  font-size: 13px;
}

.mock-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed #e8e8e8;
}

.btn-mock {
  padding: 8px 24px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f7f7f7;
  color: #666;
  cursor: pointer;
  font-size: 13px;
}

.btn-mock:hover {
  background: #eee;
  color: #333;
}

.mock-area {
  flex-direction: column;
  gap: 16px;
}

.mock-icon {
  font-size: 48px;
  line-height: 1;
}

.mock-hint {
  font-size: 14px;
  color: #666;
  margin: 0;
}

.btn-mock-primary {
  padding: 12px 40px;
  border: none;
  border-radius: 8px;
  background: #0f3460;
  color: #fff;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  transition: background 0.2s;
}

.btn-mock-primary:hover {
  background: #16213e;
}
</style>
