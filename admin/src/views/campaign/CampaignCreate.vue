<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import request from '@/utils/request';
import StoreSelector from '@/components/StoreSelector.vue';

interface Video {
  id: number;
  title: string | null;
  fileSize: number | null;
  encryptStatus: string;
}

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
  timeRange: [] as Date[],
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
      startTime: form.timeRange[0].toISOString(),
      endTime: form.timeRange[1].toISOString(),
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
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '保存失败';
    ElMessage.error(msg);
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
    <div class="page-header">
      <el-button icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <h3>{{ isEdit ? '编辑推广计划' : '新建推广计划' }}</h3>
    </div>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      style="max-width: 800px"
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
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="选择视频">
        <div class="video-selector">
          <el-input
            v-model="videoSearch"
            placeholder="搜索视频"
            clearable
            prefix-icon="Search"
            style="margin-bottom: 8px; width: 240px"
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
                <el-tag size="small" type="success" style="margin-left: 8px">已加密</el-tag>
              </el-checkbox>
              <el-empty v-if="!videosLoading && filteredVideos.length === 0" description="暂无可用视频" :image-size="60" />
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

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.page-header h3 {
  margin: 0;
  font-size: 16px;
}

.video-selector {
  width: 100%;
}

.video-checkbox-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 8px;
}

.video-checkbox-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 4px 0;
}

.selection-count {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
