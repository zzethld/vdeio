import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/app-error';
import * as accessCodeService from '../../services/access-code';

const router = Router();

// Apply auth + admin middleware to all access-code routes
router.use(authMiddleware, adminAuthMiddleware);

// Parse a numeric path param, throwing a 404 AppError with the supplied
// message when malformed. Access-code routes historically returned 404 (not
// 400) for non-numeric ids, so we preserve that.
function parseId(raw: string, message: string): number {
  const id = Number(raw);
  if (Number.isNaN(id)) {
    throw new AppError(message, 404);
  }
  return id;
}

// Parse an incoming expiresAt body field into a Date | null.
// Throws 400 if the value is present but not a valid ISO date.
function parseExpiresAt(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError('expiresAt must be a valid ISO date', 400);
  }
  return parsed;
}

// POST /api/v1/admin/videos/:id/codes — Create an access code for a video
router.post(
  '/videos/:id/codes',
  asyncHandler(async (req, res) => {
    const videoId = parseId(req.params.id, 'Video not found');
    const { code, storeId, maxUses } = req.body;
    const expiresAt = parseExpiresAt(req.body.expiresAt);

    const accessCode = await accessCodeService.createAccessCode({
      code,
      videoId,
      storeId: storeId ?? null,
      maxUses: maxUses ?? null,
      expiresAt,
      createdBy: req.userId ?? null,
    });

    res.status(201).json(accessCode);
  }),
);

// GET /api/v1/admin/videos/:id/codes — List access codes for a video
router.get(
  '/videos/:id/codes',
  asyncHandler(async (req, res) => {
    const videoId = parseId(req.params.id, 'Video not found');
    const result = await accessCodeService.listAccessCodes(videoId);
    res.status(200).json(result);
  }),
);

// PUT /api/v1/admin/codes/:id — Update an access code
router.put(
  '/codes/:id',
  asyncHandler(async (req, res) => {
    const codeId = parseId(req.params.id, 'Access code not found');
    const { status, maxUses } = req.body;
    const expiresAt = parseExpiresAt(req.body.expiresAt);

    // Distinguish "field omitted" from "field set to null/empty"; only pass
    // through fields the client actually sent so they don't get overwritten.
    const data: {
      status?: 'active' | 'disabled';
      maxUses?: number | null;
      expiresAt?: Date | null;
    } = {};
    if (status !== undefined) data.status = status;
    if (maxUses !== undefined) data.maxUses = maxUses === null ? null : Number(maxUses);
    if (req.body.expiresAt !== undefined) data.expiresAt = expiresAt;

    const accessCode = await accessCodeService.updateAccessCode(codeId, data);
    res.status(200).json(accessCode);
  }),
);

// DELETE /api/v1/admin/codes/:id — Delete an access code
router.delete(
  '/codes/:id',
  asyncHandler(async (req, res) => {
    const codeId = parseId(req.params.id, 'Access code not found');
    await accessCodeService.deleteAccessCode(codeId);
    res.status(204).send();
  }),
);

export default router;
