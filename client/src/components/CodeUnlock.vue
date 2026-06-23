<template>
  <div class="code-unlock">
    <div class="unlock-title">序列号解锁</div>
    <div class="unlock-form">
      <input
        v-model="code"
        class="unlock-input"
        type="text"
        placeholder="输入序列号"
        :disabled="loading"
        @keyup.enter="unlock"
      />
      <button
        class="btn-unlock"
        type="button"
        :disabled="loading || !code.trim()"
        @click="unlock"
      >
        {{ loading ? '解锁中...' : '解锁' }}
      </button>
    </div>
    <p v-if="error" class="unlock-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { AxiosError } from 'axios';
import request from '@/utils/request';

interface UnlockPayload {
  videoId: number;
  title: string;
  accessMode: string;
}

const emit = defineEmits<{
  (e: 'unlocked', video: UnlockPayload): void;
}>();

const code = ref('');
const loading = ref(false);
const error = ref('');

async function unlock(): Promise<void> {
  const trimmed = code.value.trim();
  if (!trimmed) {
    error.value = '请输入序列号';
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    const res = await request.post<UnlockPayload>('/devices/unlock', { code: trimmed });
    emit('unlocked', res.data);
    code.value = '';
  } catch (err: unknown) {
    const axiosErr = err as AxiosError<{ error?: string }>;
    error.value = axiosErr.response?.data?.error || '解锁失败';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.code-unlock {
  background: #fff;
  border-radius: 10px;
  padding: 14px 20px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border-left: 3px solid #0f3460;
}

.unlock-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 10px;
}

.unlock-form {
  display: flex;
  gap: 8px;
}

.unlock-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  font-size: 13px;
  color: #1a1a2e;
  outline: none;
  background: #fff;
  transition: border-color 0.2s;
}

.unlock-input::placeholder {
  color: #bbb;
}

.unlock-input:focus {
  border-color: #0f3460;
}

.unlock-input:disabled {
  background: #f5f6fa;
  cursor: not-allowed;
}

.btn-unlock {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: #0f3460;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.2s;
}

.btn-unlock:hover:not(:disabled) {
  background: #16213e;
}

.btn-unlock:disabled {
  background: #bbb;
  cursor: not-allowed;
}

.unlock-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #e53e3e;
}
</style>
