import { Request, Response, NextFunction } from 'express';
import { ADMIN_ROLES } from '../config/constants';

/**
 * Roles permitted to access `/admin/*` routes. Materialised once at module
 * load into a `Set<string>` so the per-request membership check is O(1) and,
 * importantly, type-safe against the loose `role: string` declared on
 * `Express.Request.user` (a tuple's `.includes()` would reject a bare
 * `string` argument). Source of truth: `ADMIN_ROLES` in `config/constants.ts`.
 */
const ADMIN_ROLE_SET: ReadonlySet<string> = new Set<string>(ADMIN_ROLES);

export function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || !ADMIN_ROLE_SET.has(req.user.role)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required',
    });
    return;
  }

  next();
}
