import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import {
  handleDeviceConnect,
  handleDeviceDisconnect,
  sendCommand,
  getDeviceList,
  getDeviceTelemetry,
} from '../../services/device-monitor';

// --- Webhook router (no auth) ---
const webhookRouter = Router();

// POST /api/v1/webhooks/emqx — EMQX webhook endpoint
webhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { event, clientid, username } = req.body;

    if (!event) {
      res.status(400).json({ error: 'Bad Request', message: 'event is required' });
      return;
    }

    // EMQX uses 'clientid' or 'username' for device identification
    // We use username (which is the deviceId) as the primary identifier
    const deviceId = username || clientid;
    if (!deviceId) {
      res.status(400).json({ error: 'Bad Request', message: 'username or clientid is required' });
      return;
    }

    switch (event) {
      case 'client.connected':
        await handleDeviceConnect(deviceId);
        res.json({ success: true, event: 'connect', deviceId });
        break;
      case 'client.disconnected':
        await handleDeviceDisconnect(deviceId);
        res.json({ success: true, event: 'disconnect', deviceId });
        break;
      default:
        // Silently accept unknown events
        res.json({ success: true, event, deviceId, note: 'Unhandled event type' });
        break;
    }
  } catch (err) {
    console.error('EMQX webhook error:', err);
    const message = err instanceof Error ? err.message : 'Webhook processing failed';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// --- Admin device router (auth required) ---
const router = Router();

// Apply auth + admin middleware to all admin routes
router.use(authMiddleware, adminAuthMiddleware);

// GET /api/v1/admin/devices — Device list with pagination, status filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as 'online' | 'offline' | undefined;
    const storeId = req.query.storeId
      ? parseInt(req.query.storeId as string, 10)
      : undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(
      1,
      Math.min(100, parseInt(req.query.pageSize as string, 10) || 20)
    );

    const result = await getDeviceList({
      status,
      storeId,
      page,
      pageSize,
    });

    res.json(result);
  } catch (err) {
    console.error('List devices error:', err);
    const message = err instanceof Error ? err.message : 'Failed to list devices';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// POST /api/v1/admin/devices/:deviceId/command — Send remote command
router.post('/:deviceId/command', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { command, payload } = req.body;

    if (!command) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'command is required',
      });
      return;
    }

    const validCommands = ['restart', 'sync', 'clear-cache'];
    if (!validCommands.includes(command)) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Invalid command. Must be one of: ${validCommands.join(', ')}`,
      });
      return;
    }

    await sendCommand(deviceId, command, payload);
    res.json({ success: true, deviceId, command });
  } catch (err) {
    console.error('Send command error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send command';
    const statusCode = message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
      message,
    });
  }
});

// GET /api/v1/admin/devices/:deviceId/telemetry — Telemetry history
router.get('/:deviceId/telemetry', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const limit = Math.min(
      500,
      Math.max(1, parseInt(req.query.limit as string, 10) || 100)
    );

    const telemetries = await getDeviceTelemetry(deviceId, limit);
    res.json({ deviceId, telemetries, count: telemetries.length });
  } catch (err) {
    console.error('Get telemetry error:', err);
    const message = err instanceof Error ? err.message : 'Failed to get telemetry';
    const statusCode = message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
      message,
    });
  }
});

export { webhookRouter };
export default router;
