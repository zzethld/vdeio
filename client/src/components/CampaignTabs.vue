<template>
  <div class="campaign-tabs" role="tablist">
    <button
      v-for="campaign in campaigns"
      :key="campaign.id"
      role="tab"
      type="button"
      :aria-selected="modelValue === campaign.id"
      :class="['tab-btn', { active: modelValue === campaign.id }]"
      @click="select(campaign.id)"
    >
      {{ campaign.title }}
    </button>
  </div>
</template>

<script setup lang="ts">
interface Campaign {
  id: number;
  title: string;
}

const props = defineProps<{
  campaigns: Campaign[];
  modelValue: number | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [id: number];
}>();

function select(id: number): void {
  if (id !== props.modelValue) {
    emit('update:modelValue', id);
  }
}
</script>

<style scoped>
.campaign-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}

.tab-btn {
  padding: var(--space-2) var(--space-4);
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}

.tab-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.tab-btn.active {
  background: var(--accent);
  color: var(--text-inverse);
}

.tab-btn.active:hover {
  background: var(--accent-hover);
}
</style>
