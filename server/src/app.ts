import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { testConnection, sequelize } from './config/database';
import { setupAssociations } from './models';
import { ensureBucket } from './config/minio';
import { rateLimitMiddleware } from './middleware/rate-limit';
import authRoutes from './routes/auth';
import adminAuthRoutes from './routes/admin/auth';
import adminCampaignRoutes from './routes/admin/campaign';
import adminVideoRoutes from './routes/admin/video';
import adminDeviceRoutes, { webhookRouter as emqxWebhookRoutes } from './routes/admin/device';
import adminDashboardRoutes from './routes/admin/dashboard';
import adminStoreRoutes from './routes/admin/store';
import deviceRoutes from './routes/device';
import { checkExpiredCampaigns } from './services/campaign';
import { startAlertScheduler } from './services/alert';
import { startTelemetrySubscriber } from './services/device-monitor';
import { processQueue } from './services/encryption';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.SERVER_PORT || '3000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// JSON body parser with 100MB limit for video chunks
app.use(express.json({ limit: '100mb' }));

// Raw body parser for octet-stream uploads. The /admin/videos/upload/chunk
// route accepts either base64-JSON (handled by express.json above) or raw
// binary bodies. Without this parser the binary branch is unreachable because
// express.json leaves req.body = {} for non-JSON content types.
app.use(
  '/api/v1/admin/videos/upload/chunk',
  express.raw({ type: 'application/octet-stream', limit: '100mb' }),
);

// CORS
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

// Rate limiting
app.use(rateLimitMiddleware);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Auth routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin/auth', adminAuthRoutes);
app.use('/api/v1/admin/campaigns', adminCampaignRoutes);
app.use('/api/v1/admin/videos', adminVideoRoutes);
app.use('/api/v1/admin/devices', adminDeviceRoutes);
app.use('/api/v1/admin/dashboard', adminDashboardRoutes);
app.use('/api/v1/admin/stores', adminStoreRoutes);
app.use('/api/v1/webhooks/emqx', emqxWebhookRoutes);
app.use('/api/v1/devices', deviceRoutes);

// 404 handler for unmatched routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist',
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);

  const statusCode = (err as any).statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: err.name || 'Internal Server Error',
    message,
  });
});

/**
 * Initialize database connection, sync models, and seed dev data.
 * Called by startServer() and can be called independently for testing.
 */
export async function initializeApp(): Promise<void> {
  // Test database connection
  await testConnection();

  // Setup model associations
  setupAssociations();

  // Sync models — required for SQLite (no migration runner)
  if (process.env.DB_DIALECT === 'sqlite') {
    await sequelize.sync({ force: false });
    console.log('SQLite models synced.');

    // Auto-seed in dev mode
    const { AdminModel, StoreModel } = await import('./models');
    const bcrypt = await import('bcryptjs');
    const adminCount = await AdminModel.count();
    if (adminCount === 0) {
      await AdminModel.create({
        username: 'admin',
        passwordHash: await bcrypt.hash('admin123', 10),
        name: '系统管理员',
        role: 'super_admin',
        status: 1,
      });
      console.log('[DEV] Admin seeded: admin / admin123');
    }
    const storeCount = await StoreModel.count();
    if (storeCount === 0) {
      await StoreModel.create({
        name: '测试门店',
        code: 'TEST001',
        region: '华东',
        address: '上海市浦东新区测试路1号',
        status: 1,
      });
      console.log('[DEV] Test store seeded: TEST001');
    }
  }
}

/**
 * Start the server: initialize DB, listen on PORT, start schedulers.
 * Only runs when this file is executed directly (not when imported).
 */
export async function startServer(): Promise<void> {
  try {
    await initializeApp();

    // Ensure required MinIO buckets exist for uploads/encryption
    await ensureBucket('video-original');
    await ensureBucket('video-encrypted');

    app.listen(PORT, () => {
      console.log(`Vdeio server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Campaign scheduler: check expired campaigns every 60 seconds
    setInterval(async () => {
      try {
        const count = await checkExpiredCampaigns();
        if (count > 0) {
          console.log(`[Scheduler] Auto-ended ${count} expired campaign(s)`);
        }
      } catch (err) {
        console.error('[Scheduler] Error checking expired campaigns:', err);
      }
    }, 60000);

    // Alert scheduler: check device status every 10 minutes
    startAlertScheduler();

    // Start MQTT telemetry subscriber
    startTelemetrySubscriber();

    // Encryption queue: defer initial run to avoid startup noise,
    // then process full queue (including retries) every 5 minutes
    const ENCRYPTION_STARTUP_DELAY = parseInt(
      process.env.ENCRYPTION_STARTUP_DELAY_MS || '30000', 10
    );
    setTimeout(() => {
      processQueue({ startup: true, limit: 5 }).catch(err =>
        console.error('[Encryption] Startup queue failed:', err.message)
      );
    }, ENCRYPTION_STARTUP_DELAY);
    setInterval(async () => {
      try {
        await processQueue();
      } catch (err) {
        console.error('[Encryption] Scheduled queue processing failed:', err);
      }
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only auto-start when run directly (not when imported by tests or other modules)
if (require.main === module) {
  startServer();
}

export { app };
export default app;
