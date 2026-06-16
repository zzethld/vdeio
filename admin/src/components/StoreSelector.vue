<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import request from '@/utils/request';

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
        style="width: 160px"
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
        style="width: 200px"
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
        <el-empty v-if="!loading && filteredStores.length === 0" description="暂无门店数据" :image-size="60" />
      </div>
    </el-checkbox-group>
    <div class="store-summary">
      已选择 <strong>{{ selectedIds.length }}</strong> / {{ filteredStores.length }} 个门店
    </div>
  </div>
</template>

<style scoped>
.store-selector {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 12px;
}

.store-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
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
  padding: 4px 0;
}

.store-name {
  margin-right: 8px;
}

.store-region {
  margin-left: 4px;
}

.store-summary {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-extra-light);
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
