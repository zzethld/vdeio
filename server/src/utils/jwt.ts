import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_change_in_production';

export interface JwtPayload {
  userId: number;
  storeId: number | null;
  deviceId: string | null;
  role: 'admin' | 'operator';
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
    expiresIn: '2h',
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    algorithm: 'HS512',
    expiresIn: '7d',
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

export function refreshAccessToken(refreshToken: string): { accessToken: string; payload: JwtPayload } {
  const decoded = verifyRefreshToken(refreshToken);
  // verifyRefreshToken returns the full decoded JWT (includes `iat`/`exp`).
  // Re-signing with that payload + `expiresIn` would throw
  // "the payload already has an 'exp' property", so project to a clean JwtPayload.
  const payload: JwtPayload = {
    userId: decoded.userId,
    storeId: decoded.storeId,
    deviceId: decoded.deviceId,
    role: decoded.role,
  };
  const accessToken = signAccessToken(payload);
  return { accessToken, payload };
}
