import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { VideoAccessCodeModel, VideoModel } from '../../models';

const router = Router();

// Apply auth + admin middleware to all access-code routes
router.use(authMiddleware, adminAuthMiddleware);

// POST /api/v1/admin/videos/:id/codes — Create an access code for a video
router.post('/videos/:id/codes', async (req: Request, res: Response) => {
  try {
    const videoId = Number(req.params.id);
    if (Number.isNaN(videoId)) {
      res.status(404).json({ error: 'Not Found', message: 'Video not found' });
      return;
    }

    const video = await VideoModel.findByPk(videoId);
    if (!video) {
      res.status(404).json({ error: 'Not Found', message: 'Video not found' });
      return;
    }

    const { code, storeId, maxUses, expiresAt } = req.body;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Bad Request', message: 'code is required' });
      return;
    }

    let expiresAtDate: Date | null = null;
    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ error: 'Bad Request', message: 'expiresAt must be a valid ISO date' });
        return;
      }
      expiresAtDate = parsed;
    }

    const accessCode = await VideoAccessCodeModel.create({
      code,
      videoId,
      storeId: storeId ?? null,
      maxUses: maxUses ?? null,
      expiresAt: expiresAtDate,
      createdBy: req.userId ?? null,
    });

    res.status(201).json(accessCode);
  } catch (err) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// GET /api/v1/admin/videos/:id/codes — List access codes for a video
router.get('/videos/:id/codes', async (req: Request, res: Response) => {
  try {
    const videoId = Number(req.params.id);
    if (Number.isNaN(videoId)) {
      res.status(404).json({ error: 'Not Found', message: 'Video not found' });
      return;
    }

    const video = await VideoModel.findByPk(videoId);
    if (!video) {
      res.status(404).json({ error: 'Not Found', message: 'Video not found' });
      return;
    }

    const codes = await VideoAccessCodeModel.findAll({
      where: { videoId },
      order: [['createdAt', 'DESC']],
    });

    res.status(200).json({ codes });
  } catch (err) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// PUT /api/v1/admin/codes/:id — Update an access code
router.put('/codes/:id', async (req: Request, res: Response) => {
  try {
    const codeId = Number(req.params.id);
    if (Number.isNaN(codeId)) {
      res.status(404).json({ error: 'Not Found', message: 'Access code not found' });
      return;
    }

    const accessCode = await VideoAccessCodeModel.findByPk(codeId);
    if (!accessCode) {
      res.status(404).json({ error: 'Not Found', message: 'Access code not found' });
      return;
    }

    const { status, maxUses, expiresAt } = req.body;
    const updates: Partial<{
      status: 'active' | 'disabled';
      maxUses: number | null;
      expiresAt: Date | null;
    }> = {};

    if (status !== undefined) {
      if (status !== 'active' && status !== 'disabled') {
        res.status(400).json({ error: 'Bad Request', message: 'status must be active or disabled' });
        return;
      }
      updates.status = status;
    }

    if (maxUses !== undefined) {
      updates.maxUses = maxUses === null ? null : Number(maxUses);
    }

    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        updates.expiresAt = null;
      } else {
        const parsed = new Date(expiresAt);
        if (Number.isNaN(parsed.getTime())) {
          res.status(400).json({ error: 'Bad Request', message: 'expiresAt must be a valid ISO date' });
          return;
        }
        updates.expiresAt = parsed;
      }
    }

    await accessCode.update(updates);
    res.status(200).json(accessCode);
  } catch (err) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// DELETE /api/v1/admin/codes/:id — Delete an access code
router.delete('/codes/:id', async (req: Request, res: Response) => {
  try {
    const codeId = Number(req.params.id);
    if (Number.isNaN(codeId)) {
      res.status(404).json({ error: 'Not Found', message: 'Access code not found' });
      return;
    }

    const accessCode = await VideoAccessCodeModel.findByPk(codeId);
    if (!accessCode) {
      res.status(404).json({ error: 'Not Found', message: 'Access code not found' });
      return;
    }

    await accessCode.destroy();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;
