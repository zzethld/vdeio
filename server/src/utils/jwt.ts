import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { JWT_ACCESS_TTL_SECONDS, JWT_REFRESH_TTL_SECONDS } from '../config/constants';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_change_in_production';

export interface JwtPayload {
  userId: number;
  storeId: number | null;
  deviceId: string | null;
  /**
   * Role carried by the token. Drawn from three disjoint planes:
   *  - admin plane:  `'admin' | 'super_admin'` (see `Admin.role`, `ADMIN_ROLES`)
   *  - operator plane: `'admin' | 'operator'`  (see `User.role`)
   *  - device plane:  `'operator'`             (device JWTs, see `routes/device.ts`)
   *
   * Kept as a flat union so a single `verifyAccessToken` covers every issuer.
   */
  role: 'admin' | 'super_admin' | 'operator';
}

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtError';
  }
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS512',
    expiresIn: JWT_ACCESS_TTL_SECONDS,
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    algorithm: 'HS512',
    expiresIn: JWT_REFRESH_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS512'],
    }) as JwtPayload;
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new JwtError('Access token has expired');
    } else if (err instanceof jwt.JsonWebTokenError) {
      throw new JwtError(`Invalid access token: ${err.message}`);
    } else {
      throw new JwtError('Access token verification failed');
    }
  }
}

export function verifyRefreshToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      algorithms: ['HS512'],
    }) as JwtPayload;
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new JwtError('Refresh token has expired');
    } else if (err instanceof jwt.JsonWebTokenError) {
      throw new JwtError(`Invalid refresh token: ${err.message}`);
    } else {
      throw new JwtError('Refresh token verification failed');
    }
  }
}

// NOTE: A standalone `refreshAccessToken(refreshToken)` helper previously lived
// here but was never called by production code — the `/auth/refresh` route
// (routes/auth.ts) re-implements the refresh flow inline. Removed in the S11
// dead-code pass.
