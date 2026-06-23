<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<template>
  <div class="empty-state">
    <div class="empty-state-illustration">
      <slot name="illustration">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M20 6H4V18H20V6Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <path
            d="M4 6L12 13L20 6"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
        </svg>
      </slot>
    </div>
    <p class="empty-state-message">{{ message }}</p>
    <div v-if="$slots.default" class="empty-state-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-10) var(--space-6);
  color: var(--text-secondary);
}

.empty-state-illustration {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: var(--radius-lg);
  background-color: var(--bg-hover);
  color: var(--text-tertiary);
  margin-bottom: var(--space-4);
}

.empty-state-message {
  margin: 0 0 var(--space-4);
  font-size: var(--el-font-size-base);
  color: var(--text-secondary);
  line-height: 1.6;
}

.empty-state-actions {
  display: flex;
  gap: var(--space-3);
}
</style>
