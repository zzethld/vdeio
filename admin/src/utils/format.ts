export type StatusTagType = '' | 'success' | 'warning' | 'danger' | 'info';

export function formatDate(
  value: string | number | Date | null | undefined,
  fallback = '-',
): string {
  if (value === null || value === undefined || value === '') return fallback;
  return new Date(value).toLocaleString('zh-CN');
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  fallback = '永久',
): string {
  if (value === null || value === undefined || value === '') return fallback;
  return new Date(value).toLocaleString('zh-CN');
}

export function formatFileSize(bytes: number | null | undefined, fallback = '-'): string {
  if (bytes === null || bytes === undefined) return fallback;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export const formatBytes = formatFileSize;

export function shortId(id: string | number | null | undefined, length = 8): string {
  if (id === null || id === undefined || id === '') return '-';
  return String(id).slice(0, length);
}

export const campaignStatusMap: Record<string, { label: string; type: StatusTagType }> = {
  draft: { label: '草稿', type: 'info' },
  active: { label: '进行中', type: 'success' },
  ended: { label: '已结束', type: 'danger' },
  archived: { label: '已归档', type: 'warning' },
};

export const storeStatusMap: Record<number, { label: string; type: StatusTagType }> = {
  0: { label: '已禁用', type: 'danger' },
  1: { label: '正常', type: 'success' },
};

export const encryptStatusMap: Record<string, { label: string; type: StatusTagType }> = {
  pending: { label: '等待加密', type: 'info' },
  encrypting: { label: '加密中', type: 'warning' },
  done: { label: '已完成', type: 'success' },
  failed: { label: '加密失败', type: 'danger' },
};

export const accessModeMap: Record<string, { label: string; type: StatusTagType }> = {
  open: { label: '开放', type: 'success' },
  campaign: { label: '活动推送', type: 'warning' },
  code: { label: '序列号', type: 'danger' },
};
