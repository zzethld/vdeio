import { WhereOptions, Attributes } from 'sequelize';
import { VideoAccessCodeModel, VideoModel, VideoAccessCode } from '../models';
import { AppError } from '../utils/app-error';

/**
 * Access-code service — pure CRUD + validation logic for video access codes.
 *
 * Used by both the admin CRUD routes (`routes/admin/accessCode.ts`) and the
 * device unlock endpoint (`routes/device.ts`). All persistence and validation
 * throws live here; route handlers stay thin. Errors are thrown as `AppError`
 * so the global Express error middleware translates them into responses with
 * the correct HTTP status code.
 */

export interface CreateAccessCodeInput {
  code: string;
  videoId: number;
  storeId?: number | null;
  maxUses?: number | null;
  expiresAt?: Date | null;
  createdBy?: number | null;
}

export interface UpdateAccessCodeInput {
  status?: 'active' | 'disabled';
  maxUses?: number | null;
  expiresAt?: Date | null;
}

/**
 * GET /api/v1/admin/videos/:id/codes — list all access codes for a video.
 * Throws 404 if the video does not exist (preserves prior response shape).
 */
export async function listAccessCodes(videoId: number) {
  const video = await VideoModel.findByPk(videoId);
  if (!video) {
    throw new AppError('Video not found', 404);
  }

  const codes = await VideoAccessCodeModel.findAll({
    where: { videoId },
    order: [['createdAt', 'DESC']],
  });

  return { codes };
}

/**
 * POST /api/v1/admin/videos/:id/codes — create an access code for a video.
 * Caller is responsible for parsing `expiresAt` into a Date (or null) before
 * calling. Validates that the video exists and that `code` is a non-empty
 * string.
 */
export async function createAccessCode(data: CreateAccessCodeInput) {
  const video = await VideoModel.findByPk(data.videoId);
  if (!video) {
    throw new AppError('Video not found', 404);
  }

  if (!data.code || typeof data.code !== 'string') {
    throw new AppError('code is required', 400);
  }

  const accessCode = await VideoAccessCodeModel.create({
    code: data.code,
    videoId: data.videoId,
    storeId: data.storeId ?? null,
    maxUses: data.maxUses ?? null,
    expiresAt: data.expiresAt ?? null,
    createdBy: data.createdBy ?? null,
  });

  return accessCode;
}

/**
 * PUT /api/v1/admin/codes/:id — update an access code.
 * Only `status`, `maxUses`, and `expiresAt` are mutable. Returns the updated
 * record (Sequelize re-fetches after `.update`).
 */
export async function updateAccessCode(id: number, data: UpdateAccessCodeInput) {
  const accessCode = await VideoAccessCodeModel.findByPk(id);
  if (!accessCode) {
    throw new AppError('Access code not found', 404);
  }

  // Build the patch lazily so unset fields don't overwrite existing values.
  const updates: Partial<Attributes<VideoAccessCode>> = {};

  if (data.status !== undefined) {
    if (data.status !== 'active' && data.status !== 'disabled') {
      throw new AppError('status must be active or disabled', 400);
    }
    updates.status = data.status;
  }

  if (data.maxUses !== undefined) {
    updates.maxUses = data.maxUses === null ? null : Number(data.maxUses);
  }

  if (data.expiresAt !== undefined) {
    updates.expiresAt = data.expiresAt;
  }

  await accessCode.update(updates);
  return accessCode;
}

/**
 * DELETE /api/v1/admin/codes/:id — permanently delete an access code.
 */
export async function deleteAccessCode(id: number) {
  const accessCode = await VideoAccessCodeModel.findByPk(id);
  if (!accessCode) {
    throw new AppError('Access code not found', 404);
  }
  await accessCode.destroy();
  return { success: true };
}

/**
 * Validate an access code for the device unlock endpoint
 * (`POST /api/v1/devices/unlock`).
 *
 * Rules (mirrors the original inline logic in `routes/device.ts`):
 *   1. Code must exist with `status='active'` and (optionally) match `videoId`.
 *   2. If `record.storeId` is set, it must equal the device's `storeId`.
 *   3. If `record.expiresAt` is set, it must be in the future.
 *   4. If `record.maxUses` is set, `useCount` must be below it.
 *
 * On success, atomically increments `useCount` and returns the record (with
 * the associated video eager-loaded). Throws `AppError` (404 / 403) on any
 * validation failure so the route can map it directly.
 *
 * NOTE: unlike the admin CRUD, the unlock endpoint historically used a terse
 * `{ error: <message> }` body (no `message` field). The route handler
 * preserves that shape by reading `err.message` / `err.statusCode` directly
 * for AppErrors rather than forwarding to the global handler.
 */
export async function validateAccessCode(
  code: string,
  storeId: number,
  videoId?: number,
) {
  const where: WhereOptions<Attributes<VideoAccessCode>> = { code, status: 'active' };
  if (videoId !== undefined) {
    where.videoId = videoId;
  }

  const record = await VideoAccessCodeModel.findOne({
    where,
    include: [
      { model: VideoModel, as: 'video', attributes: ['id', 'title', 'accessMode'] },
    ],
  });

  if (!record || !record.video) {
    throw new AppError('Invalid code', 404);
  }
  if (record.storeId !== null && record.storeId !== storeId) {
    throw new AppError('Code not valid for this store', 403);
  }
  if (record.expiresAt && record.expiresAt < new Date()) {
    throw new AppError('Code expired', 403);
  }
  if (record.maxUses !== null && record.useCount >= record.maxUses) {
    throw new AppError('Code usage limit reached', 403);
  }

  // Consume one use; Sequelize's `.increment` issues an atomic UPDATE.
  await record.increment('useCount');
  return record;
}
