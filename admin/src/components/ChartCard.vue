<script setup lang="ts">
defineProps<{
  title: string;
}>();
</script>

<template>
  <div class="chart-card">
    <div class="chart-card-header">
      <h3 class="chart-card-title">{{ title }}</h3>
    </div>
    <div class="chart-card-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.chart-card {
  background-color: var(--bg-elevated);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  border: var(--border-subtle);
  padding: var(--space-5);
  height: 100%;
}

.chart-card-header {
  margin-bottom: var(--space-4);
}

.chart-card-title {
  margin: 0;
  font-size: var(--el-font-size-large);
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.chart-card-body {
  width: 100%;
}
</style>
