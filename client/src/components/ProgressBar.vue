<template>
  <div
    class="progress-bar"
    role="progressbar"
    :aria-valuenow="clampedPercent"
    aria-valuemin="0"
    aria-valuemax="100"
    :style="{ background: trackColor || 'var(--bg-sunken)' }"
  >
    <div
      class="progress-bar-fill"
      :style="{
        width: `${clampedPercent}%`,
        background: fillColor || 'var(--accent)',
      }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  percent: number;
  trackColor?: string;
  fillColor?: string;
}>();

const clampedPercent = computed(() => {
  const value = Number.isFinite(props.percent) ? props.percent : 0;
  return Math.min(100, Math.max(0, value));
});
</script>

<style scoped>
.progress-bar {
  width: 100%;
  height: 8px;
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--duration-slow) var(--ease-default);
}
</style>
