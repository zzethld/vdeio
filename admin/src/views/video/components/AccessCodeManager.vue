<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import request from '@/utils/request';
import { confirmAction } from '@/utils/confirm';
import { formatDateTime, type StatusTagType } from '@/utils/format';
import EmptyState from '@/components/EmptyState.vue';
import type { AccessCode, Store } from '@/types';

const props = defineProps<{
  videoId: number;
}>();

const emit = defineEmits<{
  (e: 'refresh'): void;
}>();

const codes = ref<AccessCode[]>([]);
const codesLoading = ref(false);

const dialogVisible = ref(false);
const dialogSaving = ref(false);
const codeFormRef = ref<FormInstance>();
const codeForm = reactive({
  code: '',
  storeId: null as number | null,
  maxUses: null as number | null,
  expiresAt: null as string | null,
});
const codeRules = reactive<FormRules>({
  code: [{ required: true, message: '请输入授权码', trigger: 'blur' }],
});
const storeOptions = ref<Store[]>([]);

async function fetchCodes() {
  if (!props.videoId) return;
  codesLoading.value = true;
  try {
    const res = await request.get(`/admin/videos/${props.videoId}/codes`);
    codes.value = (res.data.codes || res.data || []) as AccessCode[];
    emit('refresh');
  } catch {
    codes.value = [];
  } finally {
    codesLoading.value = false;
  }
}

async function fetchStores() {
  try {
    const res = await request.get('/admin/stores', { params: { pageSize: 1000 } });
    storeOptions.value = (res.data.rows || res.data || []) as Store[];
  } catch {
    storeOptions.value = [];
  }
}

function openCodeDialog() {
  codeForm.code = '';
  codeForm.storeId = null;
  codeForm.maxUses = null;
  codeForm.expiresAt = null;
  dialogVisible.value = true;
  if (storeOptions.value.length === 0) {
    fetchStores();
  }
}

async function handleCodeSubmit() {
  const valid = await codeFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  dialogSaving.value = true;
  try {
    const payload: {
      code: string;
      storeId?: number;
      maxUses?: number;
      expiresAt?: string;
    } = { code: codeForm.code };
    if (codeForm.storeId !== null) payload.storeId = codeForm.storeId;
    if (codeForm.maxUses !== null) payload.maxUses = codeForm.maxUses;
    if (codeForm.expiresAt) payload.expiresAt = codeForm.expiresAt;

    await request.post(`/admin/videos/${props.videoId}/codes`, payload);
    ElMessage.success('授权码已创建');
    dialogVisible.value = false;
    fetchCodes();
  } catch {
    // Error message already shown by request interceptor.
  } finally {
    dialogSaving.value = false;
  }
}

async function handleToggleCode(row: AccessCode) {
  const nextStatus = row.status === 'disabled' ? 'active' : 'disabled';
  const label = nextStatus === 'disabled' ? '禁用' : '启用';
  await confirmAction({
    title: `确认${label}`,
    message: `确定要${label}授权码「${row.code}」吗？`,
    confirmButtonText: label,
    onConfirm: async () => {
      await request.put(`/admin/codes/${row.id}`, { status: nextStatus });
      fetchCodes();
    },
    successMsg: `${label}成功`,
  });
}

async function handleDeleteCode(row: AccessCode) {
  await confirmAction({
    title: '确认删除',
    message: `确定要删除授权码「${row.code}」吗？此操作不可恢复。`,
    confirmButtonText: '删除',
    onConfirm: async () => {
      await request.delete(`/admin/codes/${row.id}`);
      fetchCodes();
    },
    successMsg: '删除成功',
  });
}

function codeStatusTag(
  status: string,
): { label: string; type: StatusTagType } {
  const map: Record<string, { label: string; type: StatusTagType }> = {
    active: { label: '启用', type: 'success' },
    disabled: { label: '已禁用', type: 'info' },
    expired: { label: '已过期', type: 'danger' },
  };
  return map[status] || { label: status, type: 'info' };
}

onMounted(() => {
  fetchCodes();
});
</script>

<template>
  <div class="codes-section">
    <div class="codes-header">
      <h4>授权码管理</h4>
      <el-button type="primary" icon="Plus" @click="openCodeDialog">新增授权码</el-button>
    </div>
    <p class="section-hint">
      访问策略为「序列号」时，客户端需输入有效的授权码解锁视频。
    </p>

    <el-table
      v-if="codes.length > 0"
      :data="codes"
      v-loading="codesLoading"
      style="width: 100%"
    >
      <el-table-column prop="code" label="授权码" min-width="180">
        <template #default="{ row }">
          {{ row.code }}
        </template>
      </el-table-column>
      <el-table-column label="所属门店" width="160">
        <template #default="{ row }">
          {{ row.storeName || (row.storeId ? '#' + row.storeId : '全部门店') }}
        </template>
      </el-table-column>
      <el-table-column label="最大使用次数" width="130">
        <template #default="{ row }">
          {{ row.maxUses === null || row.maxUses === undefined ? '不限' : row.maxUses }}
        </template>
      </el-table-column>
      <el-table-column label="已使用次数" width="120">
        <template #default="{ row }">
          {{ row.useCount }}
        </template>
      </el-table-column>
      <el-table-column label="过期时间" width="200">
        <template #default="{ row }">
          {{ formatDateTime(row.expiresAt) }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="codeStatusTag(row.status).type" size="small">
            {{ codeStatusTag(row.status).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            text
            size="small"
            @click="handleToggleCode(row)"
          >
            {{ row.status === 'disabled' ? '启用' : '禁用' }}
          </el-button>
          <el-button
            type="danger"
            text
            size="small"
            @click="handleDeleteCode(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-else message="暂无授权码" />

    <el-dialog
      v-model="dialogVisible"
      title="新增授权码"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="codeFormRef"
        :model="codeForm"
        :rules="codeRules"
        label-width="100px"
      >
        <el-form-item label="授权码" prop="code">
          <el-input v-model="codeForm.code" placeholder="请输入授权码" maxlength="64" />
        </el-form-item>
        <el-form-item label="所属门店">
          <el-select
            v-model="codeForm.storeId"
            placeholder="不选则全部门店"
            clearable
            filterable
            class="form-full"
          >
            <el-option
              v-for="s in storeOptions"
              :key="s.id"
              :label="s.name || s.code"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="最大使用次数">
          <el-input-number
            v-model="codeForm.maxUses"
            :min="1"
            :step="1"
            placeholder="留空表示不限"
            class="form-full"
          />
        </el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker
            v-model="codeForm.expiresAt"
            type="datetime"
            placeholder="不选则永久有效"
            format="YYYY-MM-DD HH:mm:ss"
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="form-full"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogSaving" @click="handleCodeSubmit">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.codes-section {
  padding-top: var(--space-1);
}

.codes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.codes-header h4 {
  margin: 0;
  font-size: var(--el-font-size-large);
  color: var(--text-primary);
}

.section-hint {
  margin: 0 0 var(--space-3) 0;
  font-size: var(--el-font-size-small);
  color: var(--text-secondary);
}

.form-full {
  width: 100%;
}
</style>
