import type { EChartsOption } from 'echarts';

/**
 * VDEIO admin ECharts color palette aligned with design tokens.
 * These hex values mirror the CSS variables in `src/styles/design-tokens.css`
 * so charts stay consistent with the light UI theme.
 */
export const chartColors = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#38bdf8',
  textPrimary: '#303133',
  textSecondary: '#606266',
  tooltipBg: '#ffffff',
  tooltipBorder: 'rgba(0, 0, 0, 0.12)',
  gridLine: 'rgba(0, 0, 0, 0.08)',
  primaryFade: 'rgba(59, 130, 246, 0.25)',
  primaryTransparent: 'rgba(59, 130, 246, 0.02)',
  chartBg: '#ffffff',
};

export const chartColorPalette = [
  chartColors.primary,
  chartColors.success,
  chartColors.warning,
  chartColors.error,
  chartColors.info,
];

/**
 * Common ECharts option defaults for the light admin theme.
 * Merge this into any chart option to inherit consistent typography,
 * tooltip styling and transparent backgrounds.
 */
export const commonChartOptions: Partial<EChartsOption> = {
  backgroundColor: 'transparent',
  color: chartColorPalette,
  textStyle: {
    color: chartColors.textSecondary,
    fontFamily:
      "'Inter', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  },
  title: {
    textStyle: {
      color: chartColors.textPrimary,
      fontSize: 16,
      fontWeight: 600,
    },
  },
  legend: {
    textStyle: {
      color: chartColors.textSecondary,
    },
  },
  tooltip: {
    backgroundColor: chartColors.tooltipBg,
    borderColor: chartColors.tooltipBorder,
    borderWidth: 1,
    textStyle: {
      color: chartColors.textPrimary,
    },
    padding: [12, 16],
  },
};
