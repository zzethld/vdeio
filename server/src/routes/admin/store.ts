import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authMiddleware } from '../../middleware/auth';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { StoreModel } from '../../models';

const router = Router();

// Apply auth + admin middleware to all store routes
router.use(authMiddleware, adminAuthMiddleware);

// GET /api/v1/admin/stores — List stores
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(
      1,
      Math.min(100, parseInt(req.query.pageSize as string, 10) || 20)
    );
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (status !== undefined) where.status = parseInt(status as string, 10);
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { code: { [Op.like]: `%${search}%` } },
      ];
    }

    const { rows, count } = await StoreModel.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    res.json({ rows, count, page, pageSize });
  } catch (err) {
    console.error('List stores error:', err);
    const message = err instanceof Error ? err.message : 'Failed to list stores';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// GET /api/v1/admin/stores/:id — Get store
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid store ID' });
      return;
    }

    const store = await StoreModel.findByPk(id);
    if (!store) {
      res.status(404).json({ error: 'Not Found', message: 'Store not found' });
      return;
    }

    res.json(store);
  } catch (err) {
    console.error('Get store error:', err);
    const message = err instanceof Error ? err.message : 'Failed to get store';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// POST /api/v1/admin/stores — Create store
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, code, region, address, status } = req.body;

    if (!name || !code) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'name and code are required',
      });
      return;
    }

    const store = await StoreModel.create({ name, code, region, address, status: status ?? 1 });
    res.status(201).json(store);
  } catch (err) {
    console.error('Create store error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create store';
    // Sequelize wraps unique violations as SequelizeUniqueConstraintError whose
    // top-level .message is just "Validation error" — the actual hint lives in
    // err.errors[]. Detect either the error class name or any nested message.
    const isUniqueViolation =
      message.includes('unique') ||
      message.includes('Duplicate') ||
      (err as any)?.name === 'SequelizeUniqueConstraintError' ||
      Array.isArray((err as any)?.errors) &&
        (err as any).errors.some(
          (e: { message?: string; type?: string }) =>
            (e.message ?? '').includes('unique') || e.type === 'unique violation',
        );
    const statusCode = isUniqueViolation ? 409 : 500;
    res.status(statusCode).json({
      error: statusCode === 409 ? 'Conflict' : 'Internal Server Error',
      message,
    });
  }
});

// PUT /api/v1/admin/stores/:id — Update store
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid store ID' });
      return;
    }

    const store = await StoreModel.findByPk(id);
    if (!store) {
      res.status(404).json({ error: 'Not Found', message: 'Store not found' });
      return;
    }

    const { name, code, region, address, status } = req.body;
    await store.update({ name, code, region, address, status });
    res.json(store);
  } catch (err) {
    console.error('Update store error:', err);
    const message = err instanceof Error ? err.message : 'Failed to update store';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

// DELETE /api/v1/admin/stores/:id — Delete store
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid store ID' });
      return;
    }

    const store = await StoreModel.findByPk(id);
    if (!store) {
      res.status(404).json({ error: 'Not Found', message: 'Store not found' });
      return;
    }

    await store.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('Delete store error:', err);
    const message = err instanceof Error ? err.message : 'Failed to delete store';
    res.status(500).json({ error: 'Internal Server Error', message });
  }
});

export default router;
