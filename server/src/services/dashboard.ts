/**
 * Dashboard aggregation service.
 *
 * Encapsulates the stats-aggregation business logic that previously lived inline
 * in `routes/admin/dashboard.ts`. The route layer only needs to call `getStats`
 * inside `asyncHandler` and return the JSON.
 *
 * Errors are thrown as `AppError` so the global Express error middleware can
 * pick the correct HTTP status code.
 */
import { Op } from 'sequelize';
import {
  VideoModel,
  CampaignModel,
  DeviceModel,
  CampaignVideoModel,
  sequelize,
} from '../models';
import { AppError } from '../utils/app-error';

/**
 * Shape of a raw row produced by the campaign-distribution aggregation below
 * (Sequelize `findAll({ raw: true })` with a COUNT fn + nested Campaign include).
 * `videoCount` is a string because MySQL/SQLite return aggregate values as strings.
 */
interface CampaignDistributionItem {
  campaignId: number;
  videoCount: string;
  'campaign.title': string;
}

/** Item in the `campaignDistribution` array of `DashboardStats`. */
interface CampaignDistributionEntry {
  name: string;
  value: number;
}

/** Response payload returned by `getStats`. */
export interface DashboardStats {
  totalVideos: number;
  activeCampaigns: number;
  onlineDevices: number;
  newVideosToday: number;
  totalDevices: number;
  offlineDevices: number;
  campaignDistribution: CampaignDistributionEntry[];
}

/**
 * Compute the admin dashboard stats.
 *
 * Runs the headline counters in parallel (`Promise.all`), then issues the
 * campaign-video distribution aggregation. The response shape is preserved
 * verbatim from the original inline implementation so existing dashboard UI
 * consumers see the same fields.
 */
export async function getStats(): Promise<DashboardStats> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalVideos,
      activeCampaigns,
      onlineDevices,
      newVideosToday,
      totalDevices,
    ] = await Promise.all([
      VideoModel.count({ where: { deletedAt: null } }),
      CampaignModel.count({ where: { status: 'active' } }),
      DeviceModel.count({ where: { status: 'online' } }),
      VideoModel.count({
        where: {
          createdAt: {
            [Op.gte]: today,
          },
        },
      }),
      DeviceModel.count(),
    ]);

    // Campaign video distribution: count videos per active campaign
    const campaignDistribution = await CampaignVideoModel.findAll({
      attributes: [
        'campaignId',
        [sequelize.fn('COUNT', sequelize.col('video_id')), 'videoCount'],
      ],
      include: [
        {
          model: CampaignModel,
          as: 'campaign',
          attributes: ['title'],
          where: { status: 'active' },
        },
      ],
      group: ['campaign_id'],
      raw: true,
    });

    const formattedDistribution = (
      campaignDistribution as unknown as CampaignDistributionItem[]
    ).map((item) => ({
      name: item['campaign.title'] || `活动 #${item.campaignId}`,
      value: parseInt(item.videoCount || '0', 10),
    }));

    return {
      totalVideos,
      activeCampaigns,
      onlineDevices,
      newVideosToday,
      totalDevices,
      offlineDevices: totalDevices - onlineDevices,
      campaignDistribution: formattedDistribution,
    };
  } catch (err) {
    console.error('[Dashboard] Error fetching stats:', err);
    throw new AppError('获取统计数据失败', 500);
  }
}
