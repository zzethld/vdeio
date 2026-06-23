<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import request from '@/utils/request';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';

type AccessMode = 'open' | 'campaign' | 'code';

interface VideoDetail {
  id: number;
  title: string | null;
  description?: string | null;
  fileSize: number | null;
  encryptStatus: string;
  createdAt: string;
  resolution: string | null;
  categoryId?: number | null;
  accessMode: AccessMode;
  offlineAllowed: boolean;
  keyTtlHours: number;
}

interface StoreOption {
  id: number;
  name: string;
  code: string;
}

interface AccessCode {
  id: number;
  code: string;
  storeId: number | null;
  storeName?: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  status: 'active' | 'disabled' | 'expired';
}

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

// Access code management state
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
const storeOptions = ref<StoreOption[]>([]);

async function fetchVideo() {
  if (!videoId.value) return;
  pageLoading.value = true;
  try {
    const res = await request.get(`/admin/videos/${videoId.value}`);
    const data = res.data as VideoDetail;
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

async function fetchCodes() {
  if (!videoId.value) return;
  codesLoading.value = true;
  try {
    const res = await request.get(`/admin/videos/${videoId.value}/codes`);
    codes.value = (res.data.codes || res.data || []) as AccessCode[];
  } catch {
    codes.value = [];
  } finally {
    codesLoading.value = false;
  }
}

async function fetchStores() {
  try {
    const res = await request.get('/admin/stores', { params: { pageSize: 1000 } });
    storeOptions.value = (res.data.rows || res.data || []) as StoreOption[];
  } catch {
    storeOptions.value = [];
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
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      '保存失败';
    ElMessage.error(msg);
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/videos');
}

// Access code management handlers
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

    await request.post(`/admin/videos/${videoId.value}/codes`, payload);
    ElMessage.success('授权码已创建');
    dialogVisible.value = false;
    fetchCodes();
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      '创建授权码失败';
    ElMessage.error(msg);
  } finally {
    dialogSaving.value = false;
  }
}

async function handleToggleCode(row: AccessCode) {
  const nextStatus = row.status === 'disabled' ? 'active' : 'disabled';
  const label = nextStatus === 'disabled' ? '禁用' : '启用';
  try {
    await ElMessageBox.confirm(
      `确定要${label}授权码「${row.code}」吗？`,
      `确认${label}`,
      { confirmButtonText: label, cancelButtonText: '取消', type: 'warning' },
    );
    await request.put(`/admin/codes/${row.id}`, { status: nextStatus });
    ElMessage.success(`${label}成功`);
    fetchCodes();
  } catch {
    // cancelled or error
  }
}

async function handleDeleteCode(row: AccessCode) {
  try {
    await ElMessageBox.confirm(
      `确定要删除授权码「${row.code}」吗？此操作不可恢复。`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
    await request.delete(`/admin/codes/${row.id}`);
    ElMessage.success('删除成功');
    fetchCodes();
  } catch {
    // cancelled or error
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '永久';
  return new Date(dateStr).toLocaleString('zh-CN');
}

function codeStatusTag(
  status: string,
): { label: string; type: '' | 'success' | 'warning' | 'danger' | 'info' } {
  const map: Record<
    string,
    { label: string; type: '' | 'success' | 'warning' | 'danger' | 'info' }
  > = {
    active: { label: '启用', type: 'success' },
    disabled: { label: '已禁用', type: 'info' },
    expired: { label: '已过期', type: 'danger' },
  };
  return map[status] || { label: status, type: 'info' };
}

onMounted(() => {
  fetchVideo();
  fetchCodes();
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
        </div>
      </el-tab-pane>
    </el-tabs>

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
</style>
