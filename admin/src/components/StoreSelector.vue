<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import request from '@/utils/request';
import EmptyState from '@/components/EmptyState.vue';

interface Store {
  id: number;
  name: string;
  code: string;
  region: string;
  address: string;
  status: number;
}

const props = defineProps<{
  modelValue: number[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void;
}>();

const stores = ref<Store[]>([]);
const loading = ref(false);
const regionFilter = ref('');
const searchText = ref('');

const regions = computed(() => {
  const set = new Set<string>();
  stores.value.forEach((s) => {
    if (s.region) set.add(s.region);
  });
  return Array.from(set).sort();
});

const filteredStores = computed(() => {
  let list = stores.value;
  if (regionFilter.value) {
    list = list.filter((s) => s.region === regionFilter.value);
  }
  if (searchText.value) {
    const kw = searchText.value.toLowerCase();
    list = list.filter(
      (s) =>
        s.name?.toLowerCase().includes(kw) ||
        s.code?.toLowerCase().includes(kw),
    );
  }
  return list;
});

const selectedIds = computed({
  get: () => props.modelValue,
  set: (val: number[]) => emit('update:modelValue', val),
});

async function fetchStores() {
  loading.value = true;
  try {
    const res = await request.get('/admin/stores', { params: { pageSize: 1000 } });
    stores.value = res.data.rows || res.data || [];
  } catch {
    stores.value = [];
  } finally {
    loading.value = false;
  }
}

watch(regionFilter, () => {
  // Remove selected stores that are no longer visible
  const visibleIds = new Set(filteredStores.value.map((s) => s.id));
  selectedIds.value = selectedIds.value.filter((id) => visibleIds.has(id));
});

fetchStores();
</script>

<template>
  <div class="store-selector">
    <div class="store-toolbar">
      <el-select
        v-model="regionFilter"
        placeholder="按区域筛选"
        clearable
        class="region-filter"
      >
        <el-option
          v-for="r in regions"
          :key="r"
          :label="r"
          :value="r"
        />
      </el-select>
      <el-input
        v-model="searchText"
        placeholder="搜索门店名称/编码"
        clearable
        class="store-search"
        prefix-icon="Search"
      />
    </div>
    <el-checkbox-group v-model="selectedIds">
      <div v-loading="loading" class="store-list">
        <el-checkbox
          v-for="store in filteredStores"
          :key="store.id"
          :value="store.id"
          class="store-item"
        >
          <span class="store-name">{{ store.name || store.code }}</span>
          <el-tag v-if="store.region" size="small" type="info" class="store-region">
            {{ store.region }}
          </el-tag>
        </el-checkbox>
        <EmptyState
          v-if="!loading && filteredStores.length === 0"
          message="暂无门店数据"
        />
      </div>
    </el-checkbox-group>
    <div class="store-summary">
      已选择 <strong>{{ selectedIds.length }}</strong> / {{ filteredStores.length }} 个门店
    </div>
  </div>
</template>

<style scoped>
.store-selector {
  border: var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
}

.store-toolbar {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.region-filter {
  width: 160px;
}

.store-search {
  width: 200px;
}

.store-list {
  max-height: 300px;
  overflow-y: auto;
  min-height: 80px;
}

.store-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: var(--space-1) 0;
}

.store-name {
  margin-right: var(--space-2);
}

.store-region {
  margin-left: var(--space-1);
}

.store-summary {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: var(--border-subtle);
  font-size: var(--el-font-size-small);
  color: var(--text-secondary);
}
</style>
