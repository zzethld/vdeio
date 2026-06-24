<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import request from '@/utils/request';
import StoreSelector from '@/components/StoreSelector.vue';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import type { Video } from '@/types';

const route = useRoute();
const router = useRouter();

const campaignId = computed(() => {
  const id = route.params.id;
  return id ? Number(id) : null;
});
const isEdit = computed(() => !!campaignId.value);
const pageLoading = ref(false);

const formRef = ref<FormInstance>();
const saving = ref(false);

const form = reactive({
  title: '',
  description: '',
  timeRange: [] as (Date | string)[],
  selectedVideoIds: [] as number[],
  selectedStoreIds: [] as number[],
});

const rules = reactive<FormRules>({
  title: [{ required: true, message: '请输入推广计划标题', trigger: 'blur' }],
  timeRange: [{ required: true, message: '请选择推广时间范围', trigger: 'change' }],
});

const videos = ref<Video[]>([]);
const videosLoading = ref(false);

const videoSearch = ref('');

const filteredVideos = computed(() => {
  if (!videoSearch.value) return videos.value;
  const kw = videoSearch.value.toLowerCase();
  return videos.value.filter(
    (v) => v.title?.toLowerCase().includes(kw) || String(v.id).includes(kw),
  );
});

async function fetchVideos() {
  videosLoading.value = true;
  try {
    const res = await request.get('/admin/videos', {
      params: { pageSize: 200, encryptStatus: 'done' },
    });
    videos.value = res.data.rows || [];
  } catch {
    videos.value = [];
  } finally {
    videosLoading.value = false;
  }
}

async function fetchCampaign() {
  if (!campaignId.value) return;
  pageLoading.value = true;
  try {
    const res = await request.get(`/admin/campaigns/${campaignId.value}`);
    const data = res.data;
    form.title = data.title || '';
    form.description = data.description || '';
    if (data.startTime && data.endTime) {
      form.timeRange = [new Date(data.startTime), new Date(data.endTime)];
    }
    form.selectedVideoIds = (data.videos || []).map((v: { id: number }) => v.id);
    form.selectedStoreIds = (data.stores || []).map((s: { id: number }) => s.id);
  } catch {
    ElMessage.error('获取推广计划失败');
  } finally {
    pageLoading.value = false;
  }
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  if (form.selectedVideoIds.length === 0) {
    ElMessage.warning('请至少选择一个视频');
    return;
  }
  if (form.selectedStoreIds.length === 0) {
    ElMessage.warning('请至少选择一个门店');
    return;
  }

  saving.value = true;
  try {
    const payload = {
      title: form.title,
      description: form.description,
      startTime:
        form.timeRange[0] instanceof Date
          ? form.timeRange[0].toISOString()
          : form.timeRange[0],
      endTime:
        form.timeRange[1] instanceof Date
          ? form.timeRange[1].toISOString()
          : form.timeRange[1],
    };

    if (isEdit.value) {
      // Update campaign info
      await request.put(`/admin/campaigns/${campaignId.value}`, payload);

      // Replace videos: remove all then add new
      // Get current videos first
      const currentRes = await request.get(`/admin/campaigns/${campaignId.value}`);
      const currentVideos: { id: number }[] = currentRes.data.videos || [];
      const currentStores: { id: number }[] = currentRes.data.stores || [];

      // Remove old videos
      for (const v of currentVideos) {
        if (!form.selectedVideoIds.includes(v.id)) {
          await request.delete(`/admin/campaigns/${campaignId.value}/videos/${v.id}`);
        }
      }
      // Add new videos
      const newVideoIds = form.selectedVideoIds.filter(
        (id) => !currentVideos.some((v) => v.id === id),
      );
      if (newVideoIds.length > 0) {
        await request.post(`/admin/campaigns/${campaignId.value}/videos`, {
          videoIds: newVideoIds,
        });
      }

      // Remove old stores
      for (const s of currentStores) {
        if (!form.selectedStoreIds.includes(s.id)) {
          await request.delete(`/admin/campaigns/${campaignId.value}/stores/${s.id}`);
        }
      }
      // Add new stores
      const newStoreIds = form.selectedStoreIds.filter(
        (id) => !currentStores.some((s) => s.id === id),
      );
      if (newStoreIds.length > 0) {
        await request.post(`/admin/campaigns/${campaignId.value}/stores`, {
          storeIds: newStoreIds,
        });
      }

      ElMessage.success('更新成功');
    } else {
      // Create campaign
      const res = await request.post('/admin/campaigns', payload);
      const newId = res.data.id;

      // Add videos
      await request.post(`/admin/campaigns/${newId}/videos`, {
        videoIds: form.selectedVideoIds,
      });
      // Add stores
      await request.post(`/admin/campaigns/${newId}/stores`, {
        storeIds: form.selectedStoreIds,
      });

      ElMessage.success('创建成功');
    }
    router.push('/campaigns');
  } catch {
    // Error message already shown by request interceptor.
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/campaigns');
}

onMounted(() => {
  fetchVideos();
  if (isEdit.value) {
    fetchCampaign();
  }
});
</script>

<template>
  <div v-loading="pageLoading" class="campaign-create">
    <PageHeader :title="isEdit ? '编辑推广计划' : '新建推广计划'">
      <el-button icon="ArrowLeft" @click="goBack">返回列表</el-button>
    </PageHeader>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      class="campaign-form"
    >
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" placeholder="请输入推广计划标题" maxlength="128" show-word-limit />
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="请输入推广计划描述（可选）"
          maxlength="500"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="推广时间" prop="timeRange">
        <el-date-picker
          v-model="form.timeRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm:ss"
          class="form-full"
        />
      </el-form-item>

      <el-form-item label="选择视频">
        <div class="video-selector">
          <el-input
            v-model="videoSearch"
            placeholder="搜索视频"
            clearable
            prefix-icon="Search"
            class="video-search"
          />
          <el-checkbox-group v-model="form.selectedVideoIds" v-loading="videosLoading">
            <div class="video-checkbox-list">
              <el-checkbox
                v-for="video in filteredVideos"
                :key="video.id"
                :value="video.id"
                class="video-checkbox-item"
              >
                <span>{{ video.title || `视频 #${video.id}` }}</span>
                <el-tag size="small" type="success" class="video-encrypted-tag">已加密</el-tag>
              </el-checkbox>
              <EmptyState
                v-if="!videosLoading && filteredVideos.length === 0"
                message="暂无可用视频"
              />
            </div>
          </el-checkbox-group>
          <div class="selection-count">
            已选择 {{ form.selectedVideoIds.length }} 个视频
          </div>
        </div>
      </el-form-item>

      <el-form-item label="选择门店">
        <StoreSelector v-model="form.selectedStoreIds" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ saving ? '保存中...' : '保存' }}
        </el-button>
        <el-button @click="goBack">取消</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.campaign-create {
  padding: 0;
}

.campaign-form {
  max-width: 800px;
}

.video-selector {
  width: 100%;
}

.video-search {
  width: 240px;
  margin-bottom: var(--space-2);
}

.video-checkbox-list {
  max-height: 240px;
  overflow-y: auto;
  border: var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
}

.video-checkbox-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: var(--space-1) 0;
}

.video-encrypted-tag {
  margin-left: var(--space-2);
}

.selection-count {
  margin-top: var(--space-2);
  font-size: var(--el-font-size-small);
  color: var(--text-secondary);
}
</style>
