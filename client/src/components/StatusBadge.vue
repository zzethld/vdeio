<template>
  <span class="status-badge" :class="type">{{ label }}</span>
</template>

<script setup lang="ts">
defineProps<{
  type:
    | 'lock'
    | 'open'
    | 'online'
    | 'idle'
    | 'syncing'
    | 'error'
    | 'success'
    | 'warning';
  label: string;
}>();
</script>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}

.lock {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
}

.open {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}

.online {
  background: color-mix(in srgb, var(--info) 14%, transparent);
  color: var(--info);
}

.idle {
  background: color-mix(in srgb, var(--text-secondary) 14%, transparent);
  color: var(--text-secondary);
}

.syncing {
  background: var(--accent-subtle);
  color: var(--accent);
}

.error {
  background: color-mix(in srgb, var(--error) 14%, transparent);
  color: var(--error);
}

.success {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}

.warning {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
}
</style>
