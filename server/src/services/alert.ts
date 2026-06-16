import { DeviceModel, DeviceTelemetryModel } from '../models';
import { Op, Sequelize } from 'sequelize';
import { redis } from '../config/redis';

const ALERT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DEDUP_TTL_SECONDS = 60 * 60; // 1 hour
const OFFLINE_THRESHOLD_MINUTES = 30;
const DISK_THRESHOLD = 80;

const DINGTALK_WEBHOOK = process.env.DINGTALK_ALERT_WEBHOOK || '';

/**
 * Check if we should send an alert for this device + alert type.
 * Uses Redis for deduplication with 1-hour TTL.
 */
async function shouldAlert(deviceId: string, alertType: string): Promise<boolean> {
  const key = `alert:sent:${alertType}:${deviceId}`;
  const exists = await redis.exists(key);
  if (exists) {
    return false;
  }
  await redis.setex(key, DEDUP_TTL_SECONDS, '1');
  return true;
}

/**
 * Send a DingTalk webhook alert.
 * If webhook URL is not configured, logs to console instead.
 */
async function sendDingTalkAlert(message: string): Promise<void> {
  if (!DINGTALK_WEBHOOK) {
    console.log(`[Alert] DINGTALK_ALERT_WEBHOOK not configured. Alert message:\n${message}`);
    return;
  }

  try {
    const response = await fetch(DINGTALK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: {
          title: 'Vdeio 设备告警',
          text: message,
        },
      }),
    });

    if (!response.ok) {
      console.error(`[Alert] DingTalk webhook failed: ${response.status} ${response.statusText}`);
    } else {
      console.log('[Alert] DingTalk alert sent successfully');
    }
  } catch (err) {
    console.error('[Alert] Failed to send DingTalk alert:', err);
  }
}

/**
 * Check for devices that have been offline for more than 30 minutes.
 */
async function checkDeviceOffline(): Promise<void> {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000);

    const offlineDevices = await DeviceModel.findAll({
      where: {
        status: 'offline',
        lastOnlineAt: {
          [Op.lt]: thirtyMinutesAgo,
        },
      },
    });

    for (const device of offlineDevices) {
      const deviceId = device.deviceId;
      if (await shouldAlert(deviceId, 'offline')) {
        const msg = `## ⚠️ 设备离线告警\n\n` +
          `- **设备ID**: ${deviceId}\n` +
          `- **设备名称**: ${device.deviceName || '未命名'}\n` +
          `- **最后在线**: ${device.lastOnlineAt ? device.lastOnlineAt.toLocaleString('zh-CN') : '未知'}\n` +
          `- **告警时间**: ${new Date().toLocaleString('zh-CN')}\n\n` +
          `> 该设备已离线超过 ${OFFLINE_THRESHOLD_MINUTES} 分钟，请及时处理。`;
        await sendDingTalkAlert(msg);
      }
    }

    if (offlineDevices.length > 0) {
      console.log(`[Alert] Checked offline devices: ${offlineDevices.length} found`);
    }
  } catch (err) {
    console.error('[Alert] Error checking offline devices:', err);
  }
}

/**
 * Check for devices with disk usage over threshold.
 */
async function checkDiskUsage(): Promise<void> {
  try {
    // Find latest telemetry for each device using a subquery that is
    // compatible with strict MySQL sql_mode=only_full_group_by.
    const latestTelemetries = await DeviceTelemetryModel.findAll({
      where: Sequelize.where(
        Sequelize.col('created_at'),
        Op.eq,
        Sequelize.literal(`(
          SELECT MAX(dt2.created_at)
          FROM device_telemetries AS dt2
          WHERE dt2.device_id = \`DeviceTelemetry\`.\`device_id\`
        )`)
      ),
      having: {
        disk: {
          [Op.gt]: DISK_THRESHOLD,
        },
      },
      order: [['created_at', 'DESC']],
      raw: true,
    });

    for (const telemetry of latestTelemetries) {
      const deviceId = telemetry.deviceId;
      if (!deviceId) continue;

      if (await shouldAlert(deviceId, 'disk')) {
        const msg = `## 🚨 磁盘空间告警\n\n` +
          `- **设备ID**: ${deviceId}\n` +
          `- **磁盘使用率**: ${telemetry.disk}%\n` +
          `- **告警时间**: ${new Date().toLocaleString('zh-CN')}\n\n` +
          `> 该设备磁盘使用率已超过 ${DISK_THRESHOLD}%，请及时清理。`;
        await sendDingTalkAlert(msg);
      }
    }

    if (latestTelemetries.length > 0) {
      console.log(`[Alert] Checked disk usage: ${latestTelemetries.length} devices over threshold`);
    }
  } catch (err) {
    console.error('[Alert] Error checking disk usage:', err);
  }
}

/**
 * Run all alert checks.
 */
async function runAlertChecks(): Promise<void> {
  console.log('[Alert] Running scheduled alert checks...');
  await checkDeviceOffline();
  await checkDiskUsage();
  console.log('[Alert] Scheduled alert checks completed');
}

/**
 * Start the alert scheduler.
 * Runs every 10 minutes.
 */
export function startAlertScheduler(): void {
  console.log('[Alert] Alert scheduler started (interval: 10 minutes)');

  // Run immediately on startup
  runAlertChecks().catch((err) => {
    console.error('[Alert] Initial alert check failed:', err);
  });

  // Schedule recurring checks
  setInterval(() => {
    runAlertChecks().catch((err) => {
      console.error('[Alert] Scheduled alert check failed:', err);
    });
  }, ALERT_INTERVAL_MS);
}
