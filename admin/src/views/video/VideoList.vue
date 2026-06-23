<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '@/utils/request';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import SkeletonList from '@/components/SkeletonList.vue';

interface Video {
  id: number;
  title: string | null;
  fileSize: number | null;
  encryptStatus: 'pending' | 'encrypting' | 'done' | 'failed';
  createdAt: string;
  resolution: string | null;
  accessMode: 'open' | 'campaign' | 'code';
  offlineAllowed: boolean;
  keyTtlHours: number;
}

const router = useRouter();

const loading = ref(false);
const videos = ref<Video[]>([]);
const total = ref(0);

const query = reactive({
  page: 1,
  pageSize: 20,
  search: '',
  encryptStatus: '',
});

const encryptStatusMap: Record<string, { label: string; type: '' | 'success' | 'warning' | 'danger' | 'info' }> = {
  pending: { label: '等待加密', type: 'info' },
  encrypting: { label: '加密中', type: 'warning' },
  done: { label: '已完成', type: 'success' },
  failed: { label: '加密失败', type: 'danger' },
};

const accessModeMap: Record<string, { label: string; type: '' | 'success' | 'warning' | 'danger' | 'info' }> = {
  open: { label: '开放', type: 'success' },
  campaign: { label: '活动推送', type: 'warning' },
  code: { label: '序列号', type: 'danger' },
};

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN');
}

async function fetchVideos() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {
      page: query.page,
      pageSize: query.pageSize,
    };
    if (query.search) params.search = query.search;
    if (query.encryptStatus) params.encryptStatus = query.encryptStatus;

    const res = await request.get('/admin/videos', { params });
    videos.value = res.data.rows || [];
    total.value = res.data.count || 0;
  } catch {
    ElMessage.error('获取视频列表失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  fetchVideos();
}

function handlePageChange(page: number) {
  query.page = page;
  fetchVideos();
}

function handleSizeChange(size: number) {
  query.pageSize = size;
  query.page = 1;
  fetchVideos();
}

function handleUpload() {
  router.push('/videos/upload');
}

function handleEdit(row: Video) {
  router.push('/videos/edit/' + row.id);
}

async function handleDelete(row: Video) {
  try {
    await ElMessageBox.confirm(
      `确定要删除视频「${row.title || row.id}」吗？此操作不可恢复。`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
    await request.delete(`/admin/videos/${row.id}`);
    ElMessage.success('删除成功');
    fetchVideos();
  } catch {
    // cancelled or error
  }
}

onMounted(fetchVideos);
</script>

<template>
  <div class="video-list">
    <PageHeader title="视频管理">
      <div class="filter-group">
        <el-input
          v-model="query.search"
          placeholder="搜索视频标题"
          clearable
          class="filter-input"
          prefix-icon="Search"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select
          v-model="query.encryptStatus"
          placeholder="加密状态"
          clearable
          class="filter-select"
          @change="handleSearch"
        >
          <el-option
            v-for="(item, key) in encryptStatusMap"
            :key="key"
            :label="item.label"
            :value="key"
          />
        </el-select>
        <el-button icon="Search" @click="handleSearch">查询</el-button>
      </div>
      <el-button type="primary" icon="Upload" @click="handleUpload">上传视频</el-button>
    </PageHeader>

    <SkeletonList v-if="loading && videos.length === 0" :rows="5" />
    <el-table v-else-if="videos.length > 0" :data="videos" style="width: 100%">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="title" label="标题" min-width="200">
        <template #default="{ row }">
          {{ row.title || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="文件大小" width="120">
        <template #default="{ row }">
          {{ formatFileSize(row.fileSize) }}
        </template>
      </el-table-column>
      <el-table-column label="分辨率" width="100">
        <template #default="{ row }">
          {{ row.resolution || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="加密状态" width="120">
        <template #default="{ row }">
          <el-tag
            :type="encryptStatusMap[row.encryptStatus]?.type || 'info'"
            size="small"
          >
            {{ encryptStatusMap[row.encryptStatus]?.label || row.encryptStatus }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="访问策略" width="110">
        <template #default="{ row }">
          <el-tag
            :type="accessModeMap[row.accessMode]?.type || 'info'"
            size="small"
          >
            {{ accessModeMap[row.accessMode]?.label || row.accessMode || '-' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" text size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button type="danger" text size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-else message="暂无视频" />

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
  </div>
</template>

<style scoped>
.video-list {
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
