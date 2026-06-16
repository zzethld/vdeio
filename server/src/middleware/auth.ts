import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { redis } from '../config/redis';

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is required',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Check Redis blacklist
    const isBlacklisted = await redis.get(`jwt:blacklist:${token}`);
    if (isBlacklisted) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has been revoked',
      });
      return;
    }

    const payload = verifyAccessToken(token);

    req.userId = payload.userId;
    req.storeId = payload.storeId;
    req.deviceId = payload.deviceId;
    req.user = {
      userId: payload.userId,
      storeId: payload.storeId,
      deviceId: payload.deviceId,
      role: payload.role,
    };

    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.status(401).json({
      error: 'Unauthorized',
      message,
    });
  }
}
