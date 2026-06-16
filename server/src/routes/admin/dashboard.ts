import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { VideoModel, CampaignModel, DeviceModel, CampaignVideoModel, sequelize } from '../../models';

const router = Router();

// Apply auth + admin middleware to all dashboard routes
router.use(authMiddleware, adminAuthMiddleware);

// GET /api/v1/admin/dashboard/stats
router.get('/stats', async (_req: Request, res: Response) => {
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

    const formattedDistribution = (campaignDistribution as any[]).map((item: any) => ({
      name: item['campaign.title'] || `活动 #${item.campaignId}`,
      value: parseInt(item.videoCount || '0', 10),
    }));

    res.json({
      totalVideos,
      activeCampaigns,
      onlineDevices,
      newVideosToday,
      totalDevices,
      offlineDevices: totalDevices - onlineDevices,
      campaignDistribution: formattedDistribution,
    });
  } catch (err) {
    console.error('[Dashboard] Error fetching stats:', err);
    res.status(500).json({ error: 'Internal Server Error', message: '获取统计数据失败' });
  }
});

export default router;
