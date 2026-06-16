<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '@/utils/request';

interface Campaign {
  id: number;
  title: string | null;
  description: string | null;
  status: 'draft' | 'active' | 'ended' | 'archived';
  startTime: string;
  endTime: string;
  createdAt: string;
}

const router = useRouter();

const loading = ref(false);
const campaigns = ref<Campaign[]>([]);
const total = ref(0);

const query = reactive({
  page: 1,
  pageSize: 20,
  status: '',
});

const statusMap: Record<string, { label: string; type: '' | 'success' | 'warning' | 'danger' | 'info' }> = {
  draft: { label: '草稿', type: 'info' },
  active: { label: '进行中', type: 'success' },
  ended: { label: '已结束', type: 'danger' },
  archived: { label: '已归档', type: 'warning' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN');
}

async function fetchCampaigns() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {
      page: query.page,
      pageSize: query.pageSize,
    };
    if (query.status) params.status = query.status;

    const res = await request.get('/admin/campaigns', { params });
    campaigns.value = res.data.rows || [];
    total.value = res.data.count || 0;
  } catch {
    ElMessage.error('获取推广计划列表失败');
  } finally {
    loading.value = false;
  }
}

function handleFilter() {
  query.page = 1;
  fetchCampaigns();
}

function handlePageChange(page: number) {
  query.page = page;
  fetchCampaigns();
}

function handleSizeChange(size: number) {
  query.pageSize = size;
  query.page = 1;
  fetchCampaigns();
}

function handleCreate() {
  router.push('/campaigns/create');
}

function handleView(row: Campaign) {
  router.push(`/campaigns/${row.id}`);
}

function handleEdit(row: Campaign) {
  router.push(`/campaigns/edit/${row.id}`);
}

async function handleDelete(row: Campaign) {
  try {
    await ElMessageBox.confirm(
      `确定要删除推广计划「${row.title || row.id}」吗？此操作不可恢复。`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
    await request.delete(`/admin/campaigns/${row.id}`);
    ElMessage.success('删除成功');
    fetchCampaigns();
  } catch {
    // cancelled
  }
}

onMounted(fetchCampaigns);
</script>

<template>
  <div class="campaign-list">
    <div class="page-header">
      <div class="header-actions">
        <el-select
          v-model="query.status"
          placeholder="状态筛选"
          clearable
          style="width: 140px"
          @change="handleFilter"
        >
          <el-option
            v-for="(item, key) in statusMap"
            :key="key"
            :label="item.label"
            :value="key"
          />
        </el-select>
      </div>
      <el-button type="primary" icon="Plus" @click="handleCreate">新建推广计划</el-button>
    </div>

    <el-table :data="campaigns" v-loading="loading" border stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="title" label="标题" min-width="200">
        <template #default="{ row }">
          {{ row.title || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusMap[row.status]?.type || 'info'" size="small">
            {{ statusMap[row.status]?.label || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="开始时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.startTime) }}
        </template>
      </el-table-column>
      <el-table-column label="结束时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.endTime) }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" @click="handleView(row)">查看</el-button>
          <el-button
            v-if="row.status === 'draft'"
            text
            size="small"
            @click="handleEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="row.status === 'draft'"
            type="danger"
            text
            size="small"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrap">
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
  </div>
</template>

<style scoped>
.campaign-list {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
