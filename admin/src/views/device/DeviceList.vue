<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '@/utils/request';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import SkeletonList from '@/components/SkeletonList.vue';

interface Device {
  id: number;
  deviceId: string;
  storeId: number | null;
  deviceName: string | null;
  osVersion: string | null;
  appVersion: string | null;
  lastOnlineAt: string | null;
  status: 'online' | 'offline';
  localPaths: Record<string, string>;
  createdAt: string;
}

interface TelemetryEntry {
  id: number;
  deviceId: string;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  temperature: number | null;
  createdAt: string;
}

const loading = ref(false);
const devices = ref<Device[]>([]);
const total = ref(0);
const telemetryVisible = ref(false);
const telemetryLoading = ref(false);
const telemetryDeviceId = ref('');
const telemetries = ref<TelemetryEntry[]>([]);

const query = reactive({
  page: 1,
  pageSize: 20,
  status: '',
});

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN');
}

async function fetchDevices() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {
      page: query.page,
      pageSize: query.pageSize,
    };
    if (query.status) params.status = query.status;

    const res = await request.get('/admin/devices', { params });
    devices.value = res.data.rows || [];
    total.value = res.data.count || 0;
  } catch {
    ElMessage.error('获取设备列表失败');
  } finally {
    loading.value = false;
  }
}

function handleFilter() {
  query.page = 1;
  fetchDevices();
}

function handlePageChange(page: number) {
  query.page = page;
  fetchDevices();
}

function handleSizeChange(size: number) {
  query.pageSize = size;
  query.page = 1;
  fetchDevices();
}

async function sendCommand(deviceId: string, command: string) {
  const commandLabels: Record<string, string> = {
    restart: '重启',
    sync: '同步',
    'clear-cache': '清理缓存',
  };
  try {
    await ElMessageBox.confirm(
      `确定要向设备 ${deviceId.slice(0, 8)}... 发送「${commandLabels[command] || command}」命令吗？`,
      '确认发送',
      { confirmButtonText: '发送', cancelButtonText: '取消', type: 'warning' },
    );
    await request.post(`/admin/devices/${deviceId}/command`, { command });
    ElMessage.success(`「${commandLabels[command] || command}」命令已发送`);
  } catch {
    // cancelled or error
  }
}

async function showTelemetry(deviceId: string) {
  telemetryDeviceId.value = deviceId;
  telemetryVisible.value = true;
  telemetryLoading.value = true;
  try {
    const res = await request.get(`/admin/devices/${deviceId}/telemetry`, {
      params: { limit: 50 },
    });
    telemetries.value = res.data.telemetries || [];
  } catch {
    ElMessage.error('获取遥测数据失败');
    telemetries.value = [];
  } finally {
    telemetryLoading.value = false;
  }
}

onMounted(fetchDevices);
</script>

<template>
  <div class="device-list">
    <PageHeader title="设备管理">
      <div class="filter-group">
        <el-select
          v-model="query.status"
          placeholder="设备状态"
          clearable
          class="filter-select"
          @change="handleFilter"
        >
          <el-option label="在线" value="online" />
          <el-option label="离线" value="offline" />
        </el-select>
      </div>
    </PageHeader>

    <SkeletonList v-if="loading && devices.length === 0" :rows="5" />
    <el-table v-else-if="devices.length > 0" :data="devices" style="width: 100%">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="设备ID" width="180">
        <template #default="{ row }">
          <el-tooltip :content="row.deviceId" placement="top">
            <span>{{ row.deviceId.slice(0, 12) }}...</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="deviceName" label="名称" min-width="140">
        <template #default="{ row }">
          {{ row.deviceName || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="门店ID" width="100">
        <template #default="{ row }">
          {{ row.storeId ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'online' ? 'success' : 'info'" size="small">
            {{ row.status === 'online' ? '在线' : '离线' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="osVersion" label="系统版本" width="120">
        <template #default="{ row }">
          {{ row.osVersion || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="最后在线" width="180">
        <template #default="{ row }">
          {{ formatDate(row.lastOnlineAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" @click="showTelemetry(row.deviceId)">遥测</el-button>
          <el-button text size="small" @click="sendCommand(row.deviceId, 'sync')">同步</el-button>
          <el-button text size="small" @click="sendCommand(row.deviceId, 'clear-cache')">清缓存</el-button>
          <el-button type="warning" text size="small" @click="sendCommand(row.deviceId, 'restart')">重启</el-button>
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-else message="暂无设备" />

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

    <!-- Telemetry Dialog -->
    <el-dialog
      v-model="telemetryVisible"
      title="设备遥测数据"
      width="700px"
      destroy-on-close
    >
      <div v-loading="telemetryLoading">
        <p class="telemetry-meta">
          设备: {{ telemetryDeviceId.slice(0, 12) }}... (最近 50 条)
        </p>
        <el-table v-if="telemetries.length > 0" :data="telemetries" max-height="400" style="width: 100%">
          <el-table-column label="时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column label="CPU %" width="100">
            <template #default="{ row }">
              {{ row.cpu !== null ? row.cpu.toFixed(1) : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="内存 %" width="100">
            <template #default="{ row }">
              {{ row.memory !== null ? row.memory.toFixed(1) : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="磁盘 %" width="100">
            <template #default="{ row }">
              {{ row.disk !== null ? row.disk.toFixed(1) : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="温度 ℃" width="100">
            <template #default="{ row }">
              {{ row.temperature !== null ? row.temperature.toFixed(1) : '-' }}
            </template>
          </el-table-column>
        </el-table>
        <EmptyState v-if="!telemetryLoading && telemetries.length === 0" message="暂无遥测数据" />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.device-list {
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

.telemetry-meta {
  margin: 0 0 var(--space-3) 0;
  color: var(--text-secondary);
}
</style>
