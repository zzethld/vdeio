import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { calculateSyncDiff, getAuthorizedVideos, isVideoAuthorizedForStore, getVideoPlaylist, getVideoKey, getSegmentStream } from '../services/sync-service';
import { DeviceModel } from '../models';
import { signAccessToken } from '../utils/jwt';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { sequelize } from '../config/database';
import { Op } from 'sequelize';
import { storeTelemetry, TelemetryPayload } from '../services/device-monitor';

const router = Router();
router.use(authMiddleware);

// POST /sync — Incremental sync
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { cachedVideoIds } = req.body;
    if (!Array.isArray(cachedVideoIds)) {
      res.status(400).json({ error: 'cachedVideoIds must be an array' }); return;
    }
    const storeId = req.storeId;
    if (!storeId) { res.status(403).json({ error: 'Device not bound to store' }); return; }
    const diff = await calculateSyncDiff(storeId, cachedVideoIds);
    res.json(diff);
  } catch (err) { res.status(500).json({ error: 'Sync failed', message: (err as Error).message }); }
});

// GET /videos — Authorized video list grouped by campaign
router.get('/videos', async (req: Request, res: Response) => {
  try {
    const storeId = req.storeId;
    if (!storeId) { res.status(403).json({ error: 'Device not bound to store' }); return; }
    const campaigns = await getAuthorizedVideos(storeId);
    res.json({ campaigns });
  } catch (err) { res.status(500).json({ error: 'Failed', message: (err as Error).message }); }
});

// GET /videos/:id/playlist — Presigned m3u8 URL
router.get('/videos/:id/playlist', async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id);
    const storeId = req.storeId;
    if (!storeId || !(await isVideoAuthorizedForStore(videoId, storeId))) {
      res.status(403).json({ error: 'Not authorized for this video' }); return;
    }
    const url = await getVideoPlaylist(videoId);
    res.json({ url });
  } catch (err) { res.status(500).json({ error: 'Failed', message: (err as Error).message }); }
});

// GET /videos/:id/key — AES-128 key (binary)
router.get('/videos/:id/key', async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id);
    const storeId = req.storeId;
    const deviceId = req.deviceId;
    if (!storeId || !(await isVideoAuthorizedForStore(videoId, storeId))) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const key = await getVideoKey(videoId);
    if (!key) { res.status(404).json({ error: 'Key not found' }); return; }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(key);
  } catch (err) { res.status(500).json({ error: 'Failed', message: (err as Error).message }); }
});

// GET /videos/:id/segment/:seq — ts segment
router.get('/videos/:id/segment/:seq', async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id);
    const seq = req.params.seq;
    const storeId = req.storeId;
    if (!storeId || !(await isVideoAuthorizedForStore(videoId, storeId))) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const stream = await getSegmentStream(videoId, seq);
    res.setHeader('Content-Type', 'video/mp2t');
    stream.pipe(res);
  } catch (err) { res.status(500).json({ error: 'Failed', message: (err as Error).message }); }
});

// POST /sync/confirm — Client confirms downloaded video localPaths
router.post('/sync/confirm', async (req: Request, res: Response) => {
  try {
    const { confirmedVideoIds } = req.body;
    if (!Array.isArray(confirmedVideoIds)) {
      res.status(400).json({ error: 'confirmedVideoIds must be an array' }); return;
    }
    const deviceId = req.deviceId;
    if (!deviceId) { res.status(403).json({ error: 'No device ID in token' }); return; }
    const device = await DeviceModel.findOne({ where: { deviceId } });
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    const localPaths = { ...(device.localPaths || {}) };
    for (const vid of confirmedVideoIds) {
      localPaths[String(vid)] = new Date().toISOString();
    }
    await device.update({ localPaths });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Confirm failed', message: (err as Error).message }); }
});

// POST /telemetry — HTTP fallback for device telemetry
router.post('/telemetry', async (req: Request, res: Response) => {
  try {
    const deviceId = req.deviceId;
    if (!deviceId) { res.status(403).json({ error: 'No device ID in token' }); return; }
    const data: TelemetryPayload = req.body;
    await storeTelemetry(deviceId, data);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Telemetry failed', message: (err as Error).message }); }
});

// POST /register — Device registration
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { deviceName, osVersion } = req.body;
    const deviceId = uuidv4();

    // Issue a JWT for HTTP device authentication (same token is reused as the
    // MQTT password so the client only needs one credential).
    const jwtPayload = {
      userId: 0,
      storeId: null as number | null,
      deviceId,
      role: 'operator' as const,
    };
    const deviceToken = signAccessToken(jwtPayload);
    const mqttPasswordHash = await bcrypt.hash(deviceToken, 10);

    await DeviceModel.create({ deviceId, deviceName, osVersion, status: 'offline' });
    // Insert mqtt_user for EMQX auth (skip in SQLite dev mode)
    if (process.env.DB_DIALECT !== 'sqlite') {
      await sequelize.query(
        'INSERT INTO mqtt_user (username, password_hash, is_superuser) VALUES (?, ?, 0)',
        { replacements: [deviceId, mqttPasswordHash] }
      );
    }
    res.json({ deviceId, deviceToken });
  } catch (err) { res.status(500).json({ error: 'Registration failed', message: (err as Error).message }); }
});

// POST /bind — Bind device to store
router.post('/bind', async (req: Request, res: Response) => {
  try {
    const { storeId, deviceId: bodyDeviceId } = req.body;
    const deviceId = bodyDeviceId || req.deviceId;
    if (!deviceId) { res.status(400).json({ error: 'No device ID provided' }); return; }
    const device = await DeviceModel.findOne({ where: { deviceId } });
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    // Check if another device is already bound to this store
    const existing = await DeviceModel.findOne({
      where: { storeId, id: { [Op.ne]: device.id } },
    });
    if (existing) { res.status(409).json({ error: 'Store already has a device bound' }); return; }
    await device.update({ storeId });

    // Re-issue device token with the new storeId so the client can access
    // store-scoped endpoints immediately after binding.
    const jwtPayload = {
      userId: 0,
      storeId: storeId as number | null,
      deviceId,
      role: 'operator' as const,
    };
    const deviceToken = signAccessToken(jwtPayload);

    res.json({ success: true, deviceToken });
  } catch (err) { res.status(500).json({ error: 'Bind failed', message: (err as Error).message }); }
});

// POST /videos/:id/report-play — Play event logging
// MVP: Play reporting is a no-op. Playback statistics are excluded from MVP scope.
router.post('/videos/:id/report-play', async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id);
    const { event, position, duration } = req.body;
    const storeId = req.storeId;

    if (!storeId || !(await isVideoAuthorizedForStore(videoId, storeId))) {
      res.status(403).json({ error: 'Not authorized for this video' }); return;
    }

    console.log(`[PlayLog] Video ${videoId}: ${event} at ${position}s / ${duration}s`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed', message: (err as Error).message }); }
});

export default router;
