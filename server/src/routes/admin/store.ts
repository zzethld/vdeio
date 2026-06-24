import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/app-error';
import * as storeService from '../../services/store';

const router = Router();

// Apply auth + admin middleware to all store routes
router.use(authMiddleware, adminAuthMiddleware);

// Parse a numeric path param, throwing a 400 AppError when malformed.
function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    throw new AppError('Invalid store ID', 400);
  }
  return id;
}

// GET /api/v1/admin/stores — List stores
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 20;
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await storeService.listStores({ page, pageSize, search, status });
    res.json(result);
  }),
);

// GET /api/v1/admin/stores/:id — Get store
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const store = await storeService.getStore(id);
    res.json(store);
  }),
);

// POST /api/v1/admin/stores — Create store
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, code } = req.body;
    if (!name || !code) {
      throw new AppError('name and code are required', 400);
    }
    const store = await storeService.createStore(req.body);
    res.status(201).json(store);
  }),
);

// PUT /api/v1/admin/stores/:id — Update store
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const store = await storeService.updateStore(id, req.body);
    res.json(store);
  }),
);

// DELETE /api/v1/admin/stores/:id — Delete store
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const result = await storeService.deleteStore(id);
    res.json(result);
  }),
);

export default router;
