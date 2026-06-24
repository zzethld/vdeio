<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import request from '@/utils/request';
import PageHeader from '@/components/PageHeader.vue';
import type { Video } from '@/types';
import AccessCodeManager from './components/AccessCodeManager.vue';

type AccessMode = 'open' | 'campaign' | 'code';

const route = useRoute();
const router = useRouter();

const videoId = computed(() => Number(route.params.id));

const pageLoading = ref(false);
const saving = ref(false);
const activeTab = ref('policy');

const formRef = ref<FormInstance>();
const form = reactive({
  title: '',
  description: '',
  accessMode: 'campaign' as AccessMode,
  offlineAllowed: true,
  keyTtlHours: 24,
  categoryId: null as number | null,
});

const rules = reactive<FormRules>({
  title: [{ required: true, message: '请输入视频标题', trigger: 'blur' }],
  accessMode: [{ required: true, message: '请选择访问策略', trigger: 'change' }],
});

const accessModeOptions: { value: AccessMode; label: string }[] = [
  { value: 'open', label: '开放' },
  { value: 'campaign', label: '活动推送' },
  { value: 'code', label: '序列号' },
];

async function fetchVideo() {
  if (!videoId.value) return;
  pageLoading.value = true;
  try {
    const res = await request.get(`/admin/videos/${videoId.value}`);
    const data = res.data as Video;
    form.title = data.title || '';
    form.description = data.description || '';
    form.accessMode = data.accessMode ?? 'campaign';
    form.offlineAllowed = data.offlineAllowed ?? true;
    form.keyTtlHours = data.keyTtlHours ?? 24;
    form.categoryId = data.categoryId ?? null;
  } catch {
    ElMessage.error('获取视频失败');
  } finally {
    pageLoading.value = false;
  }
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    const payload = {
      title: form.title,
      description: form.description,
      accessMode: form.accessMode,
      offlineAllowed: form.offlineAllowed,
      keyTtlHours: form.keyTtlHours,
    };
    await request.put(`/admin/videos/${videoId.value}`, payload);
    ElMessage.success('保存成功');
    router.push('/videos');
  } catch {
    // Error message already shown by request interceptor.
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/videos');
}

onMounted(() => {
  fetchVideo();
});
</script>

<template>
  <div v-loading="pageLoading" class="video-edit">
    <PageHeader title="编辑视频">
      <el-button icon="ArrowLeft" @click="goBack">返回列表</el-button>
    </PageHeader>

    <el-tabs v-model="activeTab" class="edit-tabs">
      <el-tab-pane label="策略与基础信息" name="policy">
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-width="120px"
          class="edit-form"
        >
          <el-divider content-position="left">基础信息</el-divider>

          <el-form-item label="标题" prop="title">
            <el-input
              v-model="form.title"
              placeholder="请输入视频标题"
              maxlength="128"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="描述">
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="3"
              placeholder="请输入视频描述（可选）"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>

          <el-divider content-position="left">加密策略</el-divider>

          <el-form-item label="访问策略" prop="accessMode">
            <el-select v-model="form.accessMode" placeholder="请选择访问策略" class="form-medium">
              <el-option
                v-for="opt in accessModeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <div class="form-hint">控制客户端访问视频的方式</div>
          </el-form-item>

          <el-form-item label="允许离线">
            <el-switch
              v-model="form.offlineAllowed"
              active-text="允许"
              inactive-text="禁止"
              :active-value="true"
              :inactive-value="false"
            />
            <div class="form-hint">允许后客户端可缓存离线播放</div>
          </el-form-item>

          <el-form-item label="密钥缓存时长">
            <el-input-number
              v-model="form.keyTtlHours"
              :min="0"
              :step="1"
              controls-position="right"
            />
            <span class="unit-label">小时 (0=不缓存)</span>
            <div class="form-hint">客户端 AES 密钥的本地缓存时长</div>
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="saving" @click="handleSave">
              {{ saving ? '保存中...' : '保存' }}
            </el-button>
            <el-button @click="goBack">取消</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="授权码管理" name="codes">
        <AccessCodeManager :video-id="videoId" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.video-edit {
  padding: 0;
}

.edit-tabs {
  max-width: 900px;
}

.edit-form {
  max-width: 800px;
}

.form-hint {
  font-size: var(--el-font-size-extra-small);
  color: var(--text-tertiary);
  line-height: 1.5;
  margin-top: var(--space-1);
}

.unit-label {
  margin-left: var(--space-2);
  font-size: var(--el-font-size-small);
  color: var(--text-secondary);
}
</style>
