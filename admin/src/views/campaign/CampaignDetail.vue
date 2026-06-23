<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '@/utils/request';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';

interface Video {
  id: number;
  title: string | null;
  fileSize: number | null;
  encryptStatus: string;
}

interface Store {
  id: number;
  name: string | null;
  code: string | null;
  region: string | null;
  address: string | null;
}

interface Campaign {
  id: number;
  title: string | null;
  description: string | null;
  status: 'draft' | 'active' | 'ended' | 'archived';
  startTime: string;
  endTime: string;
  createdAt: string;
  videos: Video[];
  stores: Store[];
}

const route = useRoute();
const router = useRouter();

const campaignId = computed(() => Number(route.params.id));
const loading = ref(false);
const campaign = ref<Campaign | null>(null);

const statusMap: Record<string, { label: string; type: '' | 'success' | 'warning' | 'danger' | 'info' }> = {
  draft: { label: '草稿', type: 'info' },
  active: { label: '进行中', type: 'success' },
  ended: { label: '已结束', type: 'danger' },
  archived: { label: '已归档', type: 'warning' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN');
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

async function fetchCampaign() {
  loading.value = true;
  try {
    const res = await request.get(`/admin/campaigns/${campaignId.value}`);
    campaign.value = res.data;
  } catch {
    ElMessage.error('获取推广计划详情失败');
  } finally {
    loading.value = false;
  }
}

function handleEdit() {
  router.push(`/campaigns/edit/${campaignId.value}`);
}

function goBack() {
  router.push('/campaigns');
}

async function handlePublish() {
  try {
    await ElMessageBox.confirm(
      '确定要发布此推广计划吗？发布后将推送到所有关联门店。',
      '确认发布',
      { confirmButtonText: '发布', cancelButtonText: '取消', type: 'info' },
    );
    await request.post(`/admin/campaigns/${campaignId.value}/publish`);
    ElMessage.success('发布成功');
    fetchCampaign();
  } catch {
    // cancelled
  }
}

async function handleEnd() {
  try {
    await ElMessageBox.confirm(
      '确定要手动结束此推广计划吗？此操作不可恢复。',
      '确认结束',
      { confirmButtonText: '结束', cancelButtonText: '取消', type: 'warning' },
    );
    await request.post(`/admin/campaigns/${campaignId.value}/end`);
    ElMessage.success('推广计划已结束');
    fetchCampaign();
  } catch {
    // cancelled
  }
}

async function handleRemoveVideo(videoId: number) {
  if (!campaign.value || campaign.value.status !== 'draft') return;
  try {
    await request.delete(`/admin/campaigns/${campaignId.value}/videos/${videoId}`);
    ElMessage.success('已移除视频');
    fetchCampaign();
  } catch {
    ElMessage.error('移除视频失败');
  }
}

async function handleRemoveStore(storeId: number) {
  if (!campaign.value || campaign.value.status !== 'draft') return;
  try {
    await request.delete(`/admin/campaigns/${campaignId.value}/stores/${storeId}`);
    ElMessage.success('已移除门店');
    fetchCampaign();
  } catch {
    ElMessage.error('移除门店失败');
  }
}

onMounted(fetchCampaign);
</script>

<template>
  <div v-loading="loading" class="campaign-detail">
    <PageHeader title="推广计划详情">
      <el-button icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <el-button
        v-if="campaign?.status === 'draft'"
        icon="Edit"
        @click="handleEdit"
      >
        编辑
      </el-button>
      <el-button
        v-if="campaign?.status === 'draft'"
        type="success"
        icon="Promotion"
        @click="handlePublish"
      >
        发布
      </el-button>
      <el-button
        v-if="campaign?.status === 'active'"
        type="warning"
        icon="CircleClose"
        @click="handleEnd"
      >
        手动结束
      </el-button>
    </PageHeader>

    <template v-if="campaign">
      <el-card shadow="never" class="info-card">
        <template #header>
          <div class="card-header">
            <span>基本信息</span>
            <el-tag
              :type="statusMap[campaign.status]?.type || 'info'"
              size="large"
            >
              {{ statusMap[campaign.status]?.label || campaign.status }}
            </el-tag>
          </div>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="计划ID">{{ campaign.id }}</el-descriptions-item>
          <el-descriptions-item label="标题">{{ campaign.title || '-' }}</el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">
            {{ campaign.description || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="开始时间">
            {{ formatDate(campaign.startTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="结束时间">
            {{ formatDate(campaign.endTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDate(campaign.createdAt) }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card shadow="never" class="info-card">
        <template #header>
          <div class="card-header">
            <span>关联视频（{{ campaign.videos?.length || 0 }}）</span>
          </div>
        </template>
        <el-table
          v-if="campaign.videos && campaign.videos.length > 0"
          :data="campaign.videos"
          size="small"
          style="width: 100%"
        >
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column label="标题" min-width="200">
            <template #default="{ row }">
              {{ row.title || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="文件大小" width="120">
            <template #default="{ row }">
              {{ formatFileSize(row.fileSize) }}
            </template>
          </el-table-column>
          <el-table-column v-if="campaign.status === 'draft'" label="操作" width="80">
            <template #default="{ row }">
              <el-button type="danger" text size="small" @click="handleRemoveVideo(row.id)">
                移除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <EmptyState v-else message="暂无关联视频" />
      </el-card>

      <el-card shadow="never" class="info-card">
        <template #header>
          <div class="card-header">
            <span>关联门店（{{ campaign.stores?.length || 0 }}）</span>
          </div>
        </template>
        <el-table
          v-if="campaign.stores && campaign.stores.length > 0"
          :data="campaign.stores"
          size="small"
          style="width: 100%"
        >
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column label="门店名称" min-width="160">
            <template #default="{ row }">
              {{ row.name || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="编码" width="120">
            <template #default="{ row }">
              {{ row.code || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="区域" width="120">
            <template #default="{ row }">
              {{ row.region || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="地址" min-width="200">
            <template #default="{ row }">
              {{ row.address || '-' }}
            </template>
          </el-table-column>
          <el-table-column v-if="campaign.status === 'draft'" label="操作" width="80">
            <template #default="{ row }">
              <el-button type="danger" text size="small" @click="handleRemoveStore(row.id)">
                移除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <EmptyState v-else message="暂无关联门店" />
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.campaign-detail {
  padding: 0;
}

.info-card {
  margin-bottom: var(--space-4);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header span {
  font-size: var(--el-font-size-large);
  font-weight: 600;
  color: var(--text-primary);
}
</style>
