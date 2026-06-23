<template>
  <header class="app-header">
    <div class="header-left">
      <button
        v-if="showBack"
        class="btn-back"
        type="button"
        @click="goBack"
      >
        <svg class="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>返回</span>
      </button>
      <slot name="left">
        <h1 v-if="title" class="header-title">{{ title }}</h1>
      </slot>
    </div>
    <div class="header-right">
      <slot name="right" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const props = defineProps<{
  title?: string;
  showBack?: boolean;
  backTo?: string;
}>();

const router = useRouter();

function goBack(): void {
  if (props.backTo) {
    router.push(props.backTo);
  } else {
    router.back();
  }
}
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 var(--space-6);
  background: var(--bg-elevated);
  border-bottom: var(--border-subtle);
  flex-shrink: 0;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}

.btn-back:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}

.btn-back:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.back-icon {
  width: 16px;
  height: 16px;
}
</style>
