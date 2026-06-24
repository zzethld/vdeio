import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { initUpload, uploadChunk, completeUpload } from '../../services/upload';
import { redis } from '../../config';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/app-error';
import * as videoService from '../../services/video';

const router = Router();

// Apply auth + admin middleware to all video routes
router.use(authMiddleware, adminAuthMiddleware);

// POST /api/v1/admin/videos/upload/init — Initialize upload
router.post(
  '/upload/init',
  asyncHandler(async (req: Request, res: Response) => {
    const { fileName, fileSize, chunkSize } = req.body;

    if (!fileName || typeof fileSize !== 'number') {
      throw new AppError('fileName and fileSize are required', 400);
    }

    const result = await initUpload(
      fileName,
      fileSize,
      chunkSize,
      req.userId!,
    );
    res.json(result);
  }),
);

// POST /api/v1/admin/videos/upload/chunk?uploadId=xxx&chunkIndex=0 — Upload chunk
router.post(
  '/upload/chunk',
  asyncHandler(async (req: Request, res: Response) => {
    const { uploadId, chunkIndex } = req.query;
    if (!uploadId || chunkIndex === undefined) {
      throw new AppError('uploadId and chunkIndex are required', 400);
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
      throw new AppError(
        'Chunk data required (binary body or base64 chunkData field)',
        400,
      );
    }

    await uploadChunk(
      String(uploadId),
      Number(chunkIndex),
      chunkData,
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
  }),
);

// POST /api/v1/admin/videos/upload/complete — Complete upload
router.post(
  '/upload/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const { uploadId } = req.body;
    if (!uploadId) {
      throw new AppError('uploadId is required', 400);
    }

    const result = await completeUpload(uploadId);
    res.json(result);
  }),
);

// GET /api/v1/admin/videos — List videos
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || undefined;
    const pageSize = parseInt(req.query.pageSize as string, 10) || undefined;
    const search = req.query.search as string | undefined;
    const encryptStatus = req.query.encryptStatus as string | undefined;

    const result = await videoService.listVideos({ page, pageSize, search, encryptStatus });
    res.json(result);
  }),
);

// GET /api/v1/admin/videos/:id — Video detail
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid video ID', 400);
    }

    const video = await videoService.getVideo(id);
    res.json(video);
  }),
);

// PUT /api/v1/admin/videos/:id — Update video
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid video ID', 400);
    }

    const video = await videoService.updateVideo(id, req.body);
    res.json(video);
  }),
);

// DELETE /api/v1/admin/videos/:id — Soft delete
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError('Invalid video ID', 400);
    }

    await videoService.deleteVideo(id);
    res.json({ success: true });
  }),
);

export default router;
