import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { VideoModel, CampaignVideoModel, CampaignModel } from '../../models';
import { initUpload, uploadChunk, completeUpload } from '../../services/upload';
import { redis } from '../../config';

const router = Router();

// Apply auth + admin middleware to all video routes
router.use(authMiddleware, adminAuthMiddleware);

// POST /api/v1/admin/videos/upload/init — Initialize upload
router.post('/upload/init', async (req: Request, res: Response) => {
  try {
    const { fileName, fileSize, chunkSize } = req.body;

    if (!fileName || typeof fileSize !== 'number') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'fileName and fileSize are required',
      });
      return;
    }

    const result = await initUpload(
      fileName,
      fileSize,
      chunkSize,
      req.userId!
    );
    res.json(result);
  } catch (err) {
    console.error('Init upload error:', err);
    const message = err instanceof Error ? err.message : 'Failed to initialize upload';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// POST /api/v1/admin/videos/upload/chunk?uploadId=xxx&chunkIndex=0 — Upload chunk
router.post('/upload/chunk', async (req: Request, res: Response) => {
  try {
    const { uploadId, chunkIndex } = req.query;
    if (!uploadId || chunkIndex === undefined) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'uploadId and chunkIndex are required',
      });
      return;
    }

    // Support both raw binary (octet-stream) and JSON (base64 in body.chunkData)
    let chunkData: Buffer;
    if (Buffer.isBuffer(req.body)) {
      chunkData = req.body;
    } else if (req.body?.chunkData && typeof req.body.chunkData === 'string') {
      // JSON mode: base64-encoded chunk data
      chunkData = Buffer.from(req.body.chunkData, 'base64');
    } else if (typeof req.body === 'string') {
      chunkData = Buffer.from(req.body);
    } else {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Chunk data required (binary body or base64 chunkData field)',
      });
      return;
    }

    await uploadChunk(
      String(uploadId),
      Number(chunkIndex),
      chunkData
    );

    // Fetch upload metadata for progress info
    const metaStr = await redis.get(`upload:${uploadId}`);
    const meta = metaStr ? JSON.parse(metaStr) : null;

    res.json({
      chunkIndex: Number(chunkIndex),
      chunkCount: meta?.chunkCount ?? 0,
      receivedBytes: chunkData.length,
      totalBytes: meta?.fileSize ?? 0,
    });
  } catch (err) {
    console.error('Upload chunk error:', err);
    const message = err instanceof Error ? err.message : 'Failed to upload chunk';
    const statusCode = message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: statusCode === 404 ? 'Not Found' : 'Internal Server Error', message });
  }
});

// POST /api/v1/admin/videos/upload/complete — Complete upload
router.post('/upload/complete', async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.body;
    if (!uploadId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'uploadId is required',
      });
      return;
    }

    const result = await completeUpload(uploadId);
    res.json(result);
  } catch (err) {
    console.error('Complete upload error:', err);
    const message = err instanceof Error ? err.message : 'Failed to complete upload';
    const statusCode = message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: statusCode === 404 ? 'Not Found' : 'Internal Server Error', message });
  }
});

// GET /api/v1/admin/videos — List videos
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(
      1,
      Math.min(100, parseInt(req.query.pageSize as string, 10) || 20)
    );
    const search = req.query.search as string | undefined;
    const encryptStatus = req.query.encryptStatus as string | undefined;

    const where: any = {};
    if (encryptStatus) where.encryptStatus = encryptStatus;
    if (search) where.title = { [Op.like]: `%${search}%` };

    const { rows, count } = await VideoModel.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    res.json({ rows, count, page, pageSize });
  } catch (err) {
    console.error('List videos error:', err);
    const message = err instanceof Error ? err.message : 'Failed to list videos';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// GET /api/v1/admin/videos/:id — Video detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid video ID' });
      return;
    }

    const video = await VideoModel.findByPk(id);
    if (!video) {
      res.status(404).json({ error: 'Not Found', message: 'Video not found' });
      return;
    }

    res.json(video);
  } catch (err) {
    console.error('Get video error:', err);
    const message = err instanceof Error ? err.message : 'Failed to get video';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// PUT /api/v1/admin/videos/:id — Update video
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid video ID' });
      return;
    }

    const video = await VideoModel.findByPk(id);
    if (!video) {
      res.status(404).json({ error: 'Not Found', message: 'Video not found' });
      return;
    }

    const { title, description, categoryId, accessMode, offlineAllowed, keyTtlHours } = req.body;

    // Validate encryption policy fields when provided.
    const ALLOWED_ACCESS_MODES = ['open', 'campaign', 'code'] as const;
    if (accessMode !== undefined && !ALLOWED_ACCESS_MODES.includes(accessMode)) {
      res.status(400).json({
        error: 'Bad Request',
        message: `accessMode must be one of: ${ALLOWED_ACCESS_MODES.join(', ')}`,
      });
      return;
    }
    if (keyTtlHours !== undefined) {
      // Coerce strings like "12" to numbers; reject anything that isn't a
      // non-negative integer after coercion.
      const coercedTtl = typeof keyTtlHours === 'string' ? Number(keyTtlHours) : keyTtlHours;
      if (
        typeof coercedTtl !== 'number' ||
        !Number.isFinite(coercedTtl) ||
        !Number.isInteger(coercedTtl) ||
        coercedTtl < 0
      ) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'keyTtlHours must be a non-negative integer',
        });
        return;
      }
    }
    // Normalize offlineAllowed: accept actual booleans, or the strings
    // "true"/"false". Anything else is a client error.
    let normalizedOfflineAllowed: boolean | undefined;
    if (offlineAllowed !== undefined) {
      if (typeof offlineAllowed === 'boolean') {
        normalizedOfflineAllowed = offlineAllowed;
      } else if (offlineAllowed === 'true') {
        normalizedOfflineAllowed = true;
      } else if (offlineAllowed === 'false') {
        normalizedOfflineAllowed = false;
      } else {
        res.status(400).json({
          error: 'Bad Request',
          message: 'offlineAllowed must be a boolean',
        });
        return;
      }
    }

    // Build the updates object with only defined fields — Sequelize skips
    // undefined, but being explicit avoids accidental nulling of fields the
    // client did not send.
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (categoryId !== undefined) updates.categoryId = categoryId;
    if (accessMode !== undefined) updates.accessMode = accessMode;
    if (offlineAllowed !== undefined) updates.offlineAllowed = normalizedOfflineAllowed;
    if (keyTtlHours !== undefined) {
      // Store as a number in case the client sent a numeric string.
      updates.keyTtlHours =
        typeof keyTtlHours === 'string' ? Number(keyTtlHours) : keyTtlHours;
    }

    await video.update(updates);
    res.json(video);
  } catch (err) {
    console.error('Update video error:', err);
    const message = err instanceof Error ? err.message : 'Failed to update video';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// DELETE /api/v1/admin/videos/:id — Soft delete
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid video ID' });
      return;
    }

    const video = await VideoModel.findByPk(id);
    if (!video) {
      res.status(404).json({ error: 'Not Found', message: 'Video not found' });
      return;
    }

    // Check if referenced by active campaigns using the join table directly
    const activeRef = await CampaignVideoModel.findOne({
      include: [
        {
          model: CampaignModel,
          as: 'campaign',
          where: { status: 'active' },
        },
      ],
      where: { videoId: video.id },
    });

    if (activeRef) {
      res.status(409).json({
        error: 'Conflict',
        message: 'Cannot delete: video is used in active campaigns',
      });
      return;
    }

    await video.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('Delete video error:', err);
    const message = err instanceof Error ? err.message : 'Failed to delete video';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

export default router;
