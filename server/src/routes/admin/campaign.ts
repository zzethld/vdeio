import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
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

// GET /api/v1/admin/campaigns — List campaigns
router.get('/', async (req: Request, res: Response) => {
  try {
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
  } catch (err) {
    console.error('List campaigns error:', err);
    const message = err instanceof Error ? err.message : 'Failed to list campaigns';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// POST /api/v1/admin/campaigns — Create campaign
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, startTime, endTime } = req.body;

    if (!title || !startTime || !endTime) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'title, startTime, and endTime are required',
      });
      return;
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
  } catch (err) {
    console.error('Create campaign error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create campaign';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// GET /api/v1/admin/campaigns/:id — Get campaign detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid campaign ID' });
      return;
    }

    const campaign = await getCampaignById(id);
    if (!campaign) {
      res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
      return;
    }

    res.json(campaign);
  } catch (err) {
    console.error('Get campaign error:', err);
    const message = err instanceof Error ? err.message : 'Failed to get campaign';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// PUT /api/v1/admin/campaigns/:id — Update campaign
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid campaign ID' });
      return;
    }

    const { title, description, startTime, endTime } = req.body;
    const campaign = await updateCampaign(id, {
      title,
      description,
      startTime,
      endTime,
    });

    res.json(campaign);
  } catch (err) {
    console.error('Update campaign error:', err);
    const message = err instanceof Error ? err.message : 'Failed to update campaign';
    const statusCode = message.includes('Only draft') || message.includes('not found') ? 400 : 500;
    res.status(statusCode).json({ error: 'Bad Request', message });
  }
});

// DELETE /api/v1/admin/campaigns/:id — Delete campaign
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid campaign ID' });
      return;
    }

    await deleteCampaign(id);
    res.status(204).send();
  } catch (err) {
    console.error('Delete campaign error:', err);
    const message = err instanceof Error ? err.message : 'Failed to delete campaign';
    const statusCode = message.includes('Only draft') || message.includes('not found') ? 400 : 500;
    res.status(statusCode).json({ error: 'Bad Request', message });
  }
});

// POST /api/v1/admin/campaigns/:id/videos — Add videos
router.post('/:id/videos', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid campaign ID' });
      return;
    }

    const { videoIds } = req.body;
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'videoIds must be a non-empty array',
      });
      return;
    }

    await addVideos(id, videoIds);
    res.status(204).send();
  } catch (err) {
    console.error('Add videos error:', err);
    const message = err instanceof Error ? err.message : 'Failed to add videos';
    const statusCode = message.includes('Only draft') || message.includes('not found') ? 400 : 500;
    res.status(statusCode).json({ error: 'Bad Request', message });
  }
});

// DELETE /api/v1/admin/campaigns/:id/videos/:videoId — Remove video
router.delete('/:id/videos/:videoId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const videoId = parseInt(req.params.videoId, 10);
    if (isNaN(id) || isNaN(videoId)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid ID' });
      return;
    }

    await removeVideo(id, videoId);
    res.status(204).send();
  } catch (err) {
    console.error('Remove video error:', err);
    const message = err instanceof Error ? err.message : 'Failed to remove video';
    const statusCode = message.includes('Only draft') || message.includes('not found') ? 400 : 500;
    res.status(statusCode).json({ error: 'Bad Request', message });
  }
});

// POST /api/v1/admin/campaigns/:id/stores — Add stores
router.post('/:id/stores', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid campaign ID' });
      return;
    }

    const { storeIds } = req.body;
    if (!Array.isArray(storeIds) || storeIds.length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'storeIds must be a non-empty array',
      });
      return;
    }

    await addStores(id, storeIds);
    res.status(204).send();
  } catch (err) {
    console.error('Add stores error:', err);
    const message = err instanceof Error ? err.message : 'Failed to add stores';
    const statusCode = message.includes('Only draft') || message.includes('not found') ? 400 : 500;
    res.status(statusCode).json({ error: 'Bad Request', message });
  }
});

// DELETE /api/v1/admin/campaigns/:id/stores/:storeId — Remove store
router.delete('/:id/stores/:storeId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const storeId = parseInt(req.params.storeId, 10);
    if (isNaN(id) || isNaN(storeId)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid ID' });
      return;
    }

    await removeStore(id, storeId);
    res.status(204).send();
  } catch (err) {
    console.error('Remove store error:', err);
    const message = err instanceof Error ? err.message : 'Failed to remove store';
    const statusCode = message.includes('Only draft') || message.includes('not found') ? 400 : 500;
    res.status(statusCode).json({ error: 'Bad Request', message });
  }
});

// POST /api/v1/admin/campaigns/:id/publish — Publish campaign
router.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid campaign ID' });
      return;
    }

    const campaign = await publishCampaign(id);
    res.json(campaign);
  } catch (err) {
    console.error('Publish campaign error:', err);
    const message = err instanceof Error ? err.message : 'Failed to publish campaign';
    const statusCode =
      message.includes('not found') || message.includes('must have')
        ? 400
        : 500;
    res.status(statusCode).json({ error: 'Bad Request', message });
  }
});

// POST /api/v1/admin/campaigns/:id/end — End campaign manually
router.post('/:id/end', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid campaign ID' });
      return;
    }

    const campaign = await endCampaign(id);
    res.json(campaign);
  } catch (err) {
    console.error('End campaign error:', err);
    const message = err instanceof Error ? err.message : 'Failed to end campaign';
    const statusCode = message.includes('not found') || message.includes('Only active') ? 400 : 500;
    res.status(statusCode).json({ error: 'Bad Request', message });
  }
});

export default router;
