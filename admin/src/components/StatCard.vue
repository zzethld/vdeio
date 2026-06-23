<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  title: string;
  value: string | number;
  trend?: number;
  icon?: unknown;
}

const props = defineProps<Props>();

const trendClass = computed(() => {
  if (props.trend == null) return '';
  return props.trend >= 0 ? 'trend-up' : 'trend-down';
});

const trendText = computed(() => {
  if (props.trend == null) return '';
  const sign = props.trend >= 0 ? '+' : '';
  return `${sign}${props.trend}%`;
});
</script>

<template>
  <div class="stat-card">
    <div class="stat-card-inner">
      <div class="stat-icon-wrap">
        <el-icon v-if="icon" :size="28">
          <component :is="icon" />
        </el-icon>
      </div>
      <div class="stat-body">
        <div class="stat-title">{{ title }}</div>
        <div class="stat-value-wrap">
          <span class="stat-value">{{ value }}</span>
          <span v-if="trend != null" class="stat-trend" :class="trendClass">
            {{ trendText }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  background-color: var(--bg-elevated);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  border: var(--border-subtle);
  padding: var(--space-5);
  transition: transform var(--duration-fast) var(--ease-default),
              box-shadow var(--duration-fast) var(--ease-default);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.stat-card-inner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
}

.stat-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background-color: var(--accent-subtle);
  color: var(--accent);
  flex-shrink: 0;
}

.stat-body {
  flex: 1;
  min-width: 0;
}

.stat-title {
  font-size: var(--el-font-size-base);
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.stat-value-wrap {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-trend {
  font-size: var(--el-font-size-small);
  font-weight: 600;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-full);
}

.trend-up {
  color: var(--success);
  background-color: color-mix(in srgb, var(--success) 12%, transparent);
}

.trend-down {
  color: var(--error);
  background-color: color-mix(in srgb, var(--error) 12%, transparent);
}
</style>
