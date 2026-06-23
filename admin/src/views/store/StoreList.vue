<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '@/utils/request';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import SkeletonList from '@/components/SkeletonList.vue';

interface Store {
  id: number;
  name: string;
  code: string;
  region: string;
  address: string;
  status: number;
}

const loading = ref(false);
const stores = ref<Store[]>([]);
const total = ref(0);
const dialogVisible = ref(false);
const dialogTitle = ref('新增门店');
const editingId = ref<number | null>(null);

const query = reactive({
  page: 1,
  pageSize: 20,
  search: '',
});

const form = reactive({
  name: '',
  code: '',
  region: '',
  address: '',
  status: 1,
});

const statusMap: Record<number, { label: string; type: '' | 'success' | 'danger' }> = {
  0: { label: '已禁用', type: 'danger' },
  1: { label: '正常', type: 'success' },
};

function resetForm() {
  form.name = '';
  form.code = '';
  form.region = '';
  form.address = '';
  form.status = 1;
  editingId.value = null;
}

async function fetchStores() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {
      page: query.page,
      pageSize: query.pageSize,
    };
    if (query.search) params.search = query.search;

    const res = await request.get('/admin/stores', { params });
    stores.value = res.data.rows || [];
    total.value = res.data.count || 0;
  } catch {
    ElMessage.error('获取门店列表失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  fetchStores();
}

function handlePageChange(page: number) {
  query.page = page;
  fetchStores();
}

function handleSizeChange(size: number) {
  query.pageSize = size;
  query.page = 1;
  fetchStores();
}

function handleAdd() {
  resetForm();
  dialogTitle.value = '新增门店';
  dialogVisible.value = true;
}

function handleEdit(row: Store) {
  editingId.value = row.id;
  form.name = row.name || '';
  form.code = row.code || '';
  form.region = row.region || '';
  form.address = row.address || '';
  form.status = row.status;
  dialogTitle.value = '编辑门店';
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.name || !form.code) {
    ElMessage.warning('请填写门店名称和编码');
    return;
  }
  try {
    if (editingId.value) {
      await request.put(`/admin/stores/${editingId.value}`, form);
      ElMessage.success('更新成功');
    } else {
      await request.post('/admin/stores', form);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchStores();
  } catch {
    // error handled by interceptor
  }
}

async function handleDelete(row: Store) {
  try {
    await ElMessageBox.confirm(
      `确定要删除门店「${row.name || row.code}」吗？`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
    await request.delete(`/admin/stores/${row.id}`);
    ElMessage.success('删除成功');
    fetchStores();
  } catch {
    // cancelled or error
  }
}

async function handleToggleStatus(row: Store) {
  const newStatus = row.status === 1 ? 0 : 1;
  const label = newStatus === 1 ? '启用' : '禁用';
  try {
    await ElMessageBox.confirm(
      `确定要${label}门店「${row.name || row.code}」吗？`,
      `确认${label}`,
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' },
    );
    await request.put(`/admin/stores/${row.id}`, { status: newStatus });
    ElMessage.success(`${label}成功`);
    fetchStores();
  } catch {
    // cancelled or error
  }
}

onMounted(fetchStores);
</script>

<template>
  <div class="store-list">
    <PageHeader title="门店管理">
      <div class="filter-group">
        <el-input
          v-model="query.search"
          placeholder="搜索门店名称/编码"
          clearable
          class="filter-input"
          prefix-icon="Search"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-button icon="Search" @click="handleSearch">查询</el-button>
      </div>
      <el-button type="primary" icon="Plus" @click="handleAdd">新增门店</el-button>
    </PageHeader>

    <SkeletonList v-if="loading && stores.length === 0" :rows="5" />
    <el-table v-else-if="stores.length > 0" :data="stores" style="width: 100%">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="门店名称" min-width="160">
        <template #default="{ row }">
          {{ row.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="code" label="编码" width="120">
        <template #default="{ row }">
          {{ row.code || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="region" label="区域" width="100">
        <template #default="{ row }">
          {{ row.region || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="address" label="地址" min-width="200">
        <template #default="{ row }">
          {{ row.address || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusMap[row.status]?.type || 'info'" size="small">
            {{ statusMap[row.status]?.label || '未知' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button
            :type="row.status === 1 ? 'warning' : 'success'"
            text
            size="small"
            @click="handleToggleStatus(row)"
          >
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
          <el-button type="danger" text size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-else message="暂无门店" />

    <div v-if="total > 0" class="pagination-wrap">
      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>

    <!-- Add/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="500px" destroy-on-close>
      <el-form :model="form" label-width="80px">
        <el-form-item label="门店名称" required>
          <el-input v-model="form.name" placeholder="请输入门店名称" />
        </el-form-item>
        <el-form-item label="门店编码" required>
          <el-input v-model="form.code" placeholder="请输入唯一编码" />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="form.region" placeholder="如：华东、华南" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" type="textarea" :rows="2" placeholder="请输入详细地址" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="form.status"
            :active-value="1"
            :inactive-value="0"
            active-text="正常"
            inactive-text="禁用"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.store-list {
  padding: 0;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-right: auto;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}
</style>
