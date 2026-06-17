import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';
import { VideoModel, VideoKeyModel } from '../models';
import { presignedGetUrl } from '../config/minio';
import { getKeyForVideo } from './key-manager';

/** Row shape produced by the calculateSyncDiff raw SELECT. */
interface ShouldCacheRow {
  id: number;
  title: string;
  file_size: number;
  hls_url: string;
  campaign_id: number;
}

/** Row shape produced by the getAuthorizedVideos raw SELECT. */
interface CampaignRow {
  id: number;
  title: string;
  start_time: Date;
  end_time: Date;
  video_id: number;
  video_title: string;
  file_size: number;
  duration: number;
  cover_url: string;
  hls_url: string;
}

/** Row shape produced by the isVideoAuthorizedForStore COUNT(*) raw SELECT. */
interface CountRow {
  cnt: number;
}

export async function calculateSyncDiff(storeId: number, cachedVideoIds: number[]) {
  // 1. Query videos that should be cached
  const shouldCache = await sequelize.query<ShouldCacheRow>(
    `SELECT DISTINCT v.id, v.title, v.file_size, v.hls_url, cv.campaign_id
     FROM videos v
     JOIN campaign_videos cv ON v.id = cv.video_id
     JOIN campaigns c ON cv.campaign_id = c.id
     JOIN campaign_stores cs ON cs.campaign_id = c.id
     WHERE cs.store_id = ?
       AND c.status = 'active'
       AND NOW() BETWEEN c.start_time AND c.end_time
       AND v.deleted_at IS NULL
       AND v.encrypt_status = 'done'`,
    { replacements: [storeId], type: QueryTypes.SELECT }
  );

  const shouldSet = new Set(shouldCache.map(v => v.id));
  const cachedSet = new Set(cachedVideoIds);

  // 2. Calculate diff
  const downloads = shouldCache
    .filter(v => !cachedSet.has(v.id))
    .map(v => ({
      videoId: v.id,
      title: v.title,
      fileSize: v.file_size,
      campaignId: v.campaign_id,
      playlistUrl: `videos/${v.id}/playlist.m3u8`, // Client will request via auth endpoint
    }));

  const deletes = cachedVideoIds
    .filter(id => !shouldSet.has(id))
    .map(id => ({ videoId: id }));

  return { downloads, deletes };
}

export async function getAuthorizedVideos(storeId: number) {
  const campaigns = await sequelize.query<CampaignRow>(
    `SELECT DISTINCT c.id, c.title, c.start_time, c.end_time,
            v.id as video_id, v.title as video_title, v.file_size, v.duration, v.cover_url, v.hls_url
     FROM campaigns c
     JOIN campaign_videos cv ON c.id = cv.campaign_id
     JOIN videos v ON cv.video_id = v.id
     JOIN campaign_stores cs ON cs.campaign_id = c.id
     WHERE cs.store_id = ?
       AND c.status = 'active'
       AND NOW() BETWEEN c.start_time AND c.end_time
       AND v.deleted_at IS NULL
       AND v.encrypt_status = 'done'
     ORDER BY c.id, v.id`,
    { replacements: [storeId], type: QueryTypes.SELECT }
  );

  // Group by campaign
  const campaignMap = new Map();
  for (const row of campaigns) {
    if (!campaignMap.has(row.id)) {
      campaignMap.set(row.id, { id: row.id, title: row.title, startTime: row.start_time, endTime: row.end_time, videos: [] });
    }
    campaignMap.get(row.id).videos.push({
      id: row.video_id, title: row.video_title, fileSize: row.file_size,
      duration: row.duration, coverUrl: row.cover_url,
    });
  }

  return [...campaignMap.values()];
}

export async function isVideoAuthorizedForStore(videoId: number, storeId: number): Promise<boolean> {
  const result = await sequelize.query<CountRow>(
    `SELECT COUNT(*) as cnt FROM campaign_videos cv
     JOIN campaigns c ON cv.campaign_id = c.id
     JOIN campaign_stores cs ON cs.campaign_id = c.id
     WHERE cv.video_id = ? AND cs.store_id = ?
       AND c.status = 'active'
       AND NOW() BETWEEN c.start_time AND c.end_time`,
    { replacements: [videoId, storeId], type: QueryTypes.SELECT }
  );
  return result[0].cnt > 0;
}

export async function getVideoPlaylist(videoId: number): Promise<string> {
  return presignedGetUrl('video-encrypted', `videos/${videoId}/playlist.m3u8`, 86400);
}

export async function getVideoKey(videoId: number): Promise<Buffer | null> {
  const keyData = await getKeyForVideo(videoId);
  return keyData ? keyData.key : null;
}

export async function getSegmentStream(videoId: number, seq: string) {
  const { minioClient } = await import('../config/minio');
  const key = `videos/${videoId}/seg_${seq.padStart(3, '0')}.ts`;
  const stream = await minioClient.getObject('video-encrypted', key);
  return stream;
}
