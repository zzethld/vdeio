import { rateLimit } from 'express-rate-limit';
import { Request, Response } from 'express';

export const rateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 60 seconds
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Include RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  handler: (req: Request, res: Response): void => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
    });
  },
});
