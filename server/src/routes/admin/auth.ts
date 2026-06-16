import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { signAccessToken, signRefreshToken } from '../../utils/jwt';
import { AdminModel } from '../../models';

const router = Router();

// POST /api/v1/admin/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'username and password are required',
      });
      return;
    }

    // Find admin by username
    const admin = await AdminModel.findOne({
      where: { username },
    });

    if (!admin) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
      return;
    }

    // Check if account is locked
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Account locked',
        lockedUntil: admin.lockedUntil.toISOString(),
      });
      return;
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.passwordHash);

    if (!isMatch) {
      // Increment login fail count
      const newFailCount = (admin.loginFailCount || 0) + 1;
      const updateData: {
        loginFailCount: number;
        lockedUntil?: Date;
      } = {
        loginFailCount: newFailCount,
      };

      // If count >= 5, lock account for 15 minutes
      if (newFailCount >= 5) {
        const lockedUntil = new Date();
        lockedUntil.setMinutes(lockedUntil.getMinutes() + 15);
        updateData.lockedUntil = lockedUntil;
      }

      await admin.update(updateData);

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
      return;
    }

    // Password matched - reset login_fail_count
    await admin.update({
      loginFailCount: 0,
      lockedUntil: null,
    });

    // Sign JWT with role: 'admin'
    const jwtPayload = {
      userId: admin.id,
      storeId: null as number | null,
      deviceId: null as string | null,
      role: 'admin' as const,
    };

    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    res.json({
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to login',
    });
  }
});

export default router;
