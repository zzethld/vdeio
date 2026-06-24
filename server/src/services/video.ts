/**
 * Video CRUD service.
 *
 * Encapsulates the list/get/update/DELETE business logic that previously lived
 * inline in `routes/admin/video.ts`. Upload-specific flows (init/chunk/complete)
 * remain in the route — they are upload orchestration, not video CRUD.
 *
 * Errors are thrown as `AppError` so the global Express error middleware can
 * pick the correct HTTP status code; the route layer only needs to call these
 * methods inside `asyncHandler`.
 */
import { Op, WhereOptions, Attributes } from 'sequelize';
import { VideoModel, CampaignVideoModel, CampaignModel, Video } from '../models';
import { AppError } from '../utils/app-error';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants';

/** Query parameters accepted by `listVideos`. */
export interface ListVideosQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  encryptStatus?: string;
}

/** Access modes permitted by the encryption policy on a video. */
const ALLOWED_ACCESS_MODES = ['open', 'campaign', 'code'] as const;

/**
 * List videos with pagination + optional filtering.
 *
 * @returns `{ rows, count, page, pageSize }` — page numbers are 1-based, the
 * page size is clamped to `[1, MAX_PAGE_SIZE]`.
 */
export async function listVideos(query: ListVideosQuery): Promise<{
  rows: unknown[];
  count: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
  );
  const search = query.search;
  const encryptStatus = query.encryptStatus;

  const where: WhereOptions<Attributes<Video>> = {};
  if (encryptStatus) where.encryptStatus = encryptStatus;
  if (search) where.title = { [Op.like]: `%${search}%` };

  const { rows, count } = await VideoModel.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return { rows, count, page, pageSize };
}

/** Fetch a single video by primary key, throwing 404 when absent. */
export async function getVideo(id: number) {
  const video = await VideoModel.findByPk(id);
  if (!video) {
    throw new AppError('Video not found', 404);
  }
  return video;
}

/** Fields a client may patch on a video. */
export interface UpdateVideoData {
  title?: unknown;
  description?: unknown;
  categoryId?: unknown;
  accessMode?: unknown;
  offlineAllowed?: unknown;
  keyTtlHours?: unknown;
}

/**
 * Partially update a video.
 *
 * Validates encryption-policy fields (`accessMode`, `keyTtlHours`,
 * `offlineAllowed`) when present and coerces them into the shapes Sequelize
 * expects. Only fields that are explicitly present in `data` are written, so
 * omitted fields are never accidentally nulled.
 */
export async function updateVideo(id: number, data: UpdateVideoData) {
  const video = await VideoModel.findByPk(id);
  if (!video) {
    throw new AppError('Video not found', 404);
  }

  const { title, description, categoryId, accessMode, offlineAllowed, keyTtlHours } = data;

  // Validate encryption policy fields when provided.
  if (accessMode !== undefined && !ALLOWED_ACCESS_MODES.includes(accessMode as never)) {
    throw new AppError(
      `accessMode must be one of: ${ALLOWED_ACCESS_MODES.join(', ')}`,
      400,
    );
  }
  if (keyTtlHours !== undefined) {
    // Coerce strings like "12" to numbers; reject anything that isn't a
    // non-negative integer after coercion.
    const coercedTtl =
      typeof keyTtlHours === 'string' ? Number(keyTtlHours) : keyTtlHours;
    if (
      typeof coercedTtl !== 'number' ||
      !Number.isFinite(coercedTtl) ||
      !Number.isInteger(coercedTtl) ||
      coercedTtl < 0
    ) {
      throw new AppError('keyTtlHours must be a non-negative integer', 400);
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
      throw new AppError('offlineAllowed must be a boolean', 400);
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
  return video;
}

/**
 * Soft-delete (paranoid) a video after asserting it is not referenced by any
 * active campaign. Throws 404 when absent, 409 when in use.
 */
export async function deleteVideo(id: number): Promise<{ success: true }> {
  const video = await VideoModel.findByPk(id);
  if (!video) {
    throw new AppError('Video not found', 404);
  }

  // Check if referenced by active campaigns using the join table directly.
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
    throw new AppError('Cannot delete: video is used in active campaigns', 409);
  }

  // Paranoid soft-delete: sets `deletedAt` rather than removing the row.
  await video.destroy();
  return { success: true };
}
