<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import request from '@/utils/request';

const router = useRouter();

const file = ref<File | null>(null);
const uploading = ref(false);
const uploadId = ref('');
const chunkSize = ref(0);
const chunkCount = ref(0);
const chunkProgress = ref<boolean[]>([]);
const currentChunk = ref(-1);
const uploadComplete = ref(false);
const createdVideoId = ref<number | null>(null);

const overallProgress = computed(() => {
  if (chunkProgress.value.length === 0) return 0;
  const done = chunkProgress.value.filter(Boolean).length;
  return Math.round((done / chunkProgress.value.length) * 100);
});

const fileName = computed(() => file.value?.name || '');
const fileSize = computed(() => {
  if (!file.value) return '';
  const bytes = file.value.size;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
});

function handleFileChange(uploadFile: File) {
  file.value = uploadFile;
  resetUpload();
}

function handleFileRemove() {
  file.value = null;
  resetUpload();
}

function resetUpload() {
  uploadId.value = '';
  chunkSize.value = 0;
  chunkCount.value = 0;
  chunkProgress.value = [];
  currentChunk.value = -1;
  uploadComplete.value = false;
  createdVideoId.value = null;
}

async function startUpload() {
  if (!file.value) {
    ElMessage.warning('请先选择文件');
    return;
  }

  uploading.value = true;
  uploadComplete.value = false;

  try {
    // Step 1: Initialize upload
    const initRes = await request.post('/admin/videos/upload/init', {
      fileName: file.value.name,
      fileSize: file.value.size,
    });
    uploadId.value = initRes.data.uploadId;
    chunkSize.value = initRes.data.chunkSize;
    chunkCount.value = initRes.data.chunkCount;
    chunkProgress.value = new Array(chunkCount.value).fill(false);

    // Step 2: Upload chunks sequentially
    for (let i = 0; i < chunkCount.value; i++) {
      currentChunk.value = i;
      const start = i * chunkSize.value;
      const end = Math.min(start + chunkSize.value, file.value.size);
      const blob = file.value.slice(start, end);

      await request.post(
        `/admin/videos/upload/chunk?uploadId=${uploadId.value}&chunkIndex=${i}`,
        blob,
        {
          headers: { 'Content-Type': 'application/octet-stream' },
          timeout: 300000,
        },
      );
      chunkProgress.value[i] = true;
    }

    // Step 3: Complete upload
    const completeRes = await request.post('/admin/videos/upload/complete', {
      uploadId: uploadId.value,
    });
    createdVideoId.value = completeRes.data.videoId;
    uploadComplete.value = true;
    ElMessage.success('视频上传成功');
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '上传失败';
    ElMessage.error(msg);
  } finally {
    uploading.value = false;
  }
}

function goBack() {
  router.push('/videos');
}

function goToVideoList() {
  router.push('/videos');
}
</script>

<template>
  <div class="video-upload">
    <div class="page-header">
      <el-button icon="ArrowLeft" @click="goBack">返回列表</el-button>
      <h3>上传视频</h3>
    </div>

    <el-card shadow="never">
      <el-upload
        :auto-upload="false"
        :limit="1"
        :on-change="(f: any) => handleFileChange(f.raw)"
        :on-remove="handleFileRemove"
        accept="video/*"
        drag
        class="upload-area"
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">将视频文件拖到此处，或 <em>点击选择</em></div>
        <template #tip>
          <div class="el-upload__tip">支持 mp4、mov、avi 等视频格式</div>
        </template>
      </el-upload>

      <div v-if="file" class="file-info">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="文件名">{{ fileName }}</el-descriptions-item>
          <el-descriptions-item label="文件大小">{{ fileSize }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <div v-if="chunkCount > 0" class="upload-progress">
        <div class="progress-header">
          <span>上传进度</span>
          <span>{{ overallProgress }}%</span>
        </div>
        <el-progress :percentage="overallProgress" :stroke-width="18" :text-inside="true" />
        <div class="chunk-grid">
          <div
            v-for="(done, idx) in chunkProgress"
            :key="idx"
            class="chunk-cell"
            :class="{
              done: done,
              active: idx === currentChunk && uploading,
              pending: !done && idx !== currentChunk,
            }"
            :title="`分片 ${idx + 1}/${chunkCount}`"
          >
            {{ idx + 1 }}
          </div>
        </div>
      </div>

      <div v-if="uploadComplete" class="upload-result">
        <el-result icon="success" title="上传成功" sub-title="视频已进入加密处理队列">
          <template #extra>
            <el-button type="primary" @click="goToVideoList">返回视频列表</el-button>
          </template>
        </el-result>
      </div>

      <div v-if="!uploadComplete" class="upload-actions">
        <el-button type="primary" :loading="uploading" :disabled="!file" @click="startUpload">
          {{ uploading ? '上传中...' : '开始上传' }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.video-upload {
  padding: 0;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.page-header h3 {
  margin: 0;
  font-size: 16px;
}

.upload-area {
  margin-bottom: 20px;
}

.upload-area :deep(.el-upload-dragger) {
  width: 100%;
}

.file-info {
  margin-bottom: 20px;
}

.upload-progress {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.chunk-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 12px;
}

.chunk-cell {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  transition: all 0.2s;
}

.chunk-cell.pending {
  background: var(--el-fill-color);
  color: var(--el-text-color-placeholder);
}

.chunk-cell.active {
  background: var(--el-color-primary-light-5);
  color: #fff;
  animation: pulse 1s ease-in-out infinite;
}

.chunk-cell.done {
  background: var(--el-color-success);
  color: #fff;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.upload-result {
  margin: 20px 0;
}

.upload-actions {
  margin-top: 20px;
}
</style>
