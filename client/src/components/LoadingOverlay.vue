<template>
  <div class="loading-overlay">
    <span class="spinner" aria-hidden="true"></span>
    <span class="message">{{ message }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  message?: string;
}>(), {
  message: '加载中...',
});
</script>

<style scoped>
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  background: color-mix(in srgb, var(--bg-base) 85%, transparent);
  color: var(--text-secondary);
  font-size: 14px;
  z-index: 10;
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

.message {
  color: var(--text-secondary);
}
</style>
