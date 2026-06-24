import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { AppError } from '../../utils/app-error';
import { asyncHandler } from '../../utils/async-handler';
import {
  createCampaign,
  getCampaignById,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  addVideos,
  removeVideo,
  addStores,
  removeStore,
  publishCampaign,
  endCampaign,
} from '../../services/campaign';

const router = Router();

// Apply auth + admin middleware to all campaign routes
router.use(authMiddleware, adminAuthMiddleware);

/**
 * Catches known service-layer errors and re-throws them as `AppError(400)` so
 * the global handler returns the same status/message the old inline try/catch
 * produced. Unexpected errors are re-thrown untouched and propagate to the
 * global error handler as 500.
 */
async function withServiceError<T>(
  promise: Promise<T>,
  expected400Messages: string[]
): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof Error) {
      const message = err.message;
      if (expected400Messages.some((pattern) => message.includes(pattern))) {
        throw new AppError(message, 400);
      }
    }
    throw err;
  }
}

// GET /api/v1/admin/campaigns — List campaigns
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as
      | 'draft'
      | 'active'
      | 'ended'
      | 'archived'
      | undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(
      1,
      Math.min(100, parseInt(req.query.pageSize as string, 10) || 20)
    );

    const result = await listCampaigns({ status, page, pageSize });

    res.json({
      rows: result.rows,
      count: result.count,
      page,
      pageSize,
    });
  })
);

// POST /api/v1/admin/campaigns — Create campaign
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { title, description, startTime, endTime } = req.body;

    if (!title || !startTime || !endTime) {
      throw new AppError(
        'title, startTime, and endTime are required',
        400
      );
    }

    const createdBy = req.user!.userId;

    const campaign = await createCampaign({
      title,
      description,
      startTime,
      endTime,
      createdBy,
    });

    res.status(201).json(campaign);
  })
);

// GET /api/v1/admin/campaigns/:id — Get campaign detail
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid campaign ID', 400);
    }

    const campaign = await getCampaignById(id);
    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    res.json(campaign);
  })
);

// PUT /api/v1/admin/campaigns/:id — Update campaign
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid campaign ID', 400);
    }

    const { title, description, startTime, endTime } = req.body;
    const campaign = await withServiceError(
      updateCampaign(id, {
        title,
        description,
        startTime,
        endTime,
      }),
      ['not found', 'Only draft']
    );

    res.json(campaign);
  })
);

// DELETE /api/v1/admin/campaigns/:id — Delete campaign
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid campaign ID', 400);
    }

    await withServiceError(deleteCampaign(id), ['not found', 'Only draft']);
    res.status(204).send();
  })
);

// POST /api/v1/admin/campaigns/:id/videos — Add videos
router.post(
  '/:id/videos',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid campaign ID', 400);
    }

    const { videoIds } = req.body;
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      throw new AppError('videoIds must be a non-empty array', 400);
    }

    await withServiceError(addVideos(id, videoIds), [
      'not found',
      'Only draft',
    ]);
    res.status(204).send();
  })
);

// DELETE /api/v1/admin/campaigns/:id/videos/:videoId — Remove video
router.delete(
  '/:id/videos/:videoId',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const videoId = parseInt(req.params.videoId, 10);
    if (isNaN(id) || isNaN(videoId)) {
      throw new AppError('Invalid ID', 400);
    }

    await withServiceError(removeVideo(id, videoId), [
      'not found',
      'Only draft',
    ]);
    res.status(204).send();
  })
);

// POST /api/v1/admin/campaigns/:id/stores — Add stores
router.post(
  '/:id/stores',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid campaign ID', 400);
    }

    const { storeIds } = req.body;
    if (!Array.isArray(storeIds) || storeIds.length === 0) {
      throw new AppError('storeIds must be a non-empty array', 400);
    }

    await withServiceError(addStores(id, storeIds), [
      'not found',
      'Only draft',
    ]);
    res.status(204).send();
  })
);

// DELETE /api/v1/admin/campaigns/:id/stores/:storeId — Remove store
router.delete(
  '/:id/stores/:storeId',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const storeId = parseInt(req.params.storeId, 10);
    if (isNaN(id) || isNaN(storeId)) {
      throw new AppError('Invalid ID', 400);
    }

    await withServiceError(removeStore(id, storeId), [
      'not found',
      'Only draft',
    ]);
    res.status(204).send();
  })
);

// POST /api/v1/admin/campaigns/:id/publish — Publish campaign
router.post(
  '/:id/publish',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid campaign ID', 400);
    }

    const campaign = await withServiceError(publishCampaign(id), [
      'not found',
      'must have',
    ]);
    res.json(campaign);
  })
);

// POST /api/v1/admin/campaigns/:id/end — End campaign manually
router.post(
  '/:id/end',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid campaign ID', 400);
    }

    const campaign = await withServiceError(endCampaign(id), [
      'not found',
      'Only active',
    ]);
    res.json(campaign);
  })
);

export default router;
