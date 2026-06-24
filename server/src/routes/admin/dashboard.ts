import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { asyncHandler } from '../../utils/async-handler';
import { getStats } from '../../services/dashboard';

const router = Router();

// Apply auth + admin middleware to all dashboard routes
router.use(authMiddleware, adminAuthMiddleware);

// GET /api/v1/admin/dashboard/stats
router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await getStats();
    res.json(stats);
  }),
);

export default router;
