<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import { VideoPlay, Folder, Monitor, TrendCharts } from '@element-plus/icons-vue';
import request from '@/utils/request';

interface DashboardStats {
  totalVideos: number;
  activeCampaigns: number;
  onlineDevices: number;
  newVideosToday: number;
  totalDevices: number;
  offlineDevices: number;
  campaignDistribution: { name: string; value: number }[];
}

const stats = ref<DashboardStats>({
  totalVideos: 0,
  activeCampaigns: 0,
  onlineDevices: 0,
  newVideosToday: 0,
  totalDevices: 0,
  offlineDevices: 0,
  campaignDistribution: [],
});

const loading = ref(false);

let campaignChart: echarts.ECharts | null = null;
let deviceChart: echarts.ECharts | null = null;

async function fetchStats() {
  loading.value = true;
  try {
    const res = await request.get('/admin/dashboard/stats');
    stats.value = res.data;
    updateCharts();
  } catch (err) {
    ElMessage.error('获取统计数据失败');
  } finally {
    loading.value = false;
  }
}

function initCharts() {
  const campaignDom = document.getElementById('campaign-chart');
  const deviceDom = document.getElementById('device-chart');

  if (campaignDom) {
    campaignChart = echarts.init(campaignDom);
  }
  if (deviceDom) {
    deviceChart = echarts.init(deviceDom);
  }
}

function updateCharts() {
  if (campaignChart) {
    campaignChart.setOption({
      title: {
        text: '活动视频分布',
        left: 'center',
        textStyle: { fontSize: 16, fontWeight: 'normal' },
      },
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        bottom: '0%',
        left: 'center',
      },
      series: [
        {
          type: 'pie',
          radius: '60%',
          center: ['50%', '45%'],
          data: stats.value.campaignDistribution.length > 0
            ? stats.value.campaignDistribution
            : [{ name: '暂无数据', value: 0 }],
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    });
  }

  if (deviceChart) {
    deviceChart.setOption({
      title: {
        text: '设备在线状态',
        left: 'center',
        textStyle: { fontSize: 16, fontWeight: 'normal' },
      },
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        bottom: '0%',
        left: 'center',
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '65%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: '{b}\n{c}',
          },
          data: [
            {
              name: '在线',
              value: stats.value.onlineDevices,
              itemStyle: { color: '#67c23a' },
            },
            {
              name: '离线',
              value: stats.value.offlineDevices,
              itemStyle: { color: '#f56c6c' },
            },
          ],
        },
      ],
    });
  }
}

function handleResize() {
  campaignChart?.resize();
  deviceChart?.resize();
}

onMounted(() => {
  initCharts();
  fetchStats();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  campaignChart?.dispose();
  deviceChart?.dispose();
});
</script>

<template>
  <div class="dashboard" v-loading="loading">
    <!-- Stats Cards -->
    <el-row :gutter="16">
      <el-col :span="6" :xs="12">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <el-icon class="stat-icon" :size="32" color="#409eff">
              <VideoPlay />
            </el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totalVideos }}</div>
              <div class="stat-label">总视频数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6" :xs="12">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <el-icon class="stat-icon" :size="32" color="#67c23a">
              <Folder />
            </el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.activeCampaigns }}</div>
              <div class="stat-label">活动数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6" :xs="12">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <el-icon class="stat-icon" :size="32" color="#e6a23c">
              <Monitor />
            </el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.onlineDevices }}</div>
              <div class="stat-label">在线设备数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6" :xs="12">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <el-icon class="stat-icon" :size="32" color="#909399">
              <TrendCharts />
            </el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.newVideosToday }}</div>
              <div class="stat-label">今日新增</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Charts -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="12" :xs="24">
        <el-card class="chart-card" shadow="hover">
          <div id="campaign-chart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12" :xs="24">
        <el-card class="chart-card" shadow="hover">
          <div id="device-chart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 24px;
}

.stat-card {
  margin-bottom: 16px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.chart-row {
  margin-top: 8px;
}

.chart-card {
  margin-bottom: 16px;
}

.chart-container {
  width: 100%;
  height: 360px;
}
</style>
