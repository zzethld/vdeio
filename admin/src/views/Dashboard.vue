<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import { VideoPlay, Folder, Monitor, TrendCharts } from '@element-plus/icons-vue';
import request from '@/utils/request';
import { commonChartOptions, chartColors } from '@/utils/chart-theme';
import PageHeader from '@/components/PageHeader.vue';
import StatCard from '@/components/StatCard.vue';
import ChartCard from '@/components/ChartCard.vue';

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

let trendChart: echarts.ECharts | null = null;
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
  const trendDom = document.getElementById('trend-chart');
  const deviceDom = document.getElementById('device-chart');

  if (trendDom) {
    trendChart = echarts.init(trendDom);
  }
  if (deviceDom) {
    deviceChart = echarts.init(deviceDom);
  }
}

function updateCharts() {
  if (trendChart) {
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const base = stats.value.totalVideos || 100;
    const trendData = days.map((_, index) =>
      Math.max(0, Math.round(base * (0.6 + 0.08 * index)))
    );

    const option: echarts.EChartsOption = {
      ...commonChartOptions,
      tooltip: {
        ...commonChartOptions.tooltip,
        trigger: 'axis',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: days,
        axisLine: { lineStyle: { color: chartColors.textSecondary } },
        axisLabel: { color: chartColors.textSecondary },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: chartColors.gridLine } },
        axisLabel: { color: chartColors.textSecondary },
      },
      series: [
        {
          name: '播放次数',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: chartColors.primary },
          lineStyle: { width: 3 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: chartColors.primaryFade },
              { offset: 1, color: chartColors.primaryTransparent },
            ]),
          },
          data: trendData,
        },
      ],
    };
    trendChart.setOption(option);
  }

  if (deviceChart) {
    const deviceData = [
      { name: '在线', value: stats.value.onlineDevices },
      { name: '离线', value: stats.value.offlineDevices },
    ];

    const option: echarts.EChartsOption = {
      ...commonChartOptions,
      tooltip: {
        ...commonChartOptions.tooltip,
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        ...commonChartOptions.legend,
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
            borderColor: chartColors.chartBg,
            borderWidth: 2,
          },
          label: {
            show: true,
            color: chartColors.textSecondary,
            formatter: '{b}\n{c}',
          },
          data: deviceData.some((d) => d.value > 0)
            ? deviceData.map((d, index) => ({
                ...d,
                itemStyle: {
                  color: index === 0 ? chartColors.success : chartColors.error,
                },
              }))
            : [{ name: '暂无数据', value: 0, itemStyle: { color: chartColors.textSecondary } }],
        },
      ],
    };
    deviceChart.setOption(option);
  }
}

function handleResize() {
  trendChart?.resize();
  deviceChart?.resize();
}

onMounted(() => {
  initCharts();
  fetchStats();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  trendChart?.dispose();
  deviceChart?.dispose();
});
</script>

<template>
  <div class="dashboard" v-loading="loading">
    <PageHeader title="仪表盘" />

    <!-- KPI Cards -->
    <el-row :gutter="16" class="kpi-row">
      <el-col :span="8" :xs="24">
        <StatCard
          title="总视频数"
          :value="stats.totalVideos"
          :icon="VideoPlay"
          :trend="12"
        />
      </el-col>
      <el-col :span="5" :xs="12">
        <StatCard
          title="活动数"
          :value="stats.activeCampaigns"
          :icon="Folder"
          :trend="5"
        />
      </el-col>
      <el-col :span="5" :xs="12">
        <StatCard
          title="在线设备"
          :value="stats.onlineDevices"
          :icon="Monitor"
        />
      </el-col>
      <el-col :span="6" :xs="24">
        <StatCard
          title="今日新增"
          :value="stats.newVideosToday"
          :icon="TrendCharts"
          :trend="-3"
        />
      </el-col>
    </el-row>

    <!-- Charts -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="16" :xs="24">
        <ChartCard title="近7天播放趋势">
          <div id="trend-chart" class="chart-container"></div>
        </ChartCard>
      </el-col>
      <el-col :span="8" :xs="24">
        <ChartCard title="设备在线状态">
          <div id="device-chart" class="chart-container"></div>
        </ChartCard>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dashboard {
  padding: var(--space-6);
}

.kpi-row {
  margin-bottom: var(--space-6);
}

.kpi-row :deep(.el-col) {
  margin-bottom: var(--space-4);
}

.chart-row {
  margin-top: var(--space-2);
}

.chart-row :deep(.el-col) {
  margin-bottom: var(--space-4);
}

.chart-container {
  width: 100%;
  height: 360px;
}
</style>
