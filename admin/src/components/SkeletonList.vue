<script setup lang="ts">
defineProps<{
  rows?: number;
}>();
</script>

<template>
  <div class="skeleton-list">
    <div
      v-for="i in (rows ?? 5)"
      :key="i"
      class="skeleton-row"
    >
      <div class="skeleton-cell skeleton-cell--icon"></div>
      <div class="skeleton-cell skeleton-cell--main"></div>
      <div class="skeleton-cell skeleton-cell--secondary"></div>
      <div class="skeleton-cell skeleton-cell--action"></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 48px;
  padding: 0 var(--space-4);
  background-color: var(--bg-elevated);
  border-radius: var(--radius-md);
}

.skeleton-cell {
  height: 16px;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--bg-hover) 0%,
    var(--bg-active) 50%,
    var(--bg-hover) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-pulse var(--duration-slow) ease-in-out infinite;
}

.skeleton-cell--icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.skeleton-cell--main {
  flex: 1;
  min-width: 120px;
}

.skeleton-cell--secondary {
  width: 96px;
  flex-shrink: 0;
}

.skeleton-cell--action {
  width: 64px;
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-cell {
    animation: none;
  }
}

@keyframes skeleton-pulse {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
