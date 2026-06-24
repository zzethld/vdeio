/**
 * Auth service — business logic for the `/api/v1/auth/*` routes.
 *
 * Extracted from `routes/auth.ts` so the route layer is a thin
 * validate → call-service → respond shell. All JWT issuance, Redis
 * state/blacklist handling, and DingTalk user provisioning live here.
 *
 * Thrown errors are `AppError` instances carrying an HTTP status code,
 * which the global Express error middleware (`app.ts`) maps to responses.
 */

import { redis, setWithExpiry } from '../config/redis';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  JwtPayload,
} from '../utils/jwt';
import { AppError } from '../utils/app-error';
import { getUserInfoByCode } from './dingtalk';
import { UserModel, UserStoreBindingModel, DeviceModel, StoreModel } from '../models';
import {
  JWT_ACCESS_TTL_SECONDS,
  JWT_REFRESH_TTL_SECONDS,
  DINGTALK_STATE_TTL_SECONDS,
} from '../config/constants';

/** Public user projection embedded in login/refresh responses. */
interface AuthUserResponse {
  id: number;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  role: 'admin' | 'operator';
}

/** Shape returned by `mockLogin` (and DingTalk poll-success). */
export interface LoginResponse {
  status: 'success';
  accessToken: string;
  refreshToken: string;
  user: AuthUserResponse;
  storeId: number | null;
  deviceId: string;
}

/** Shape returned by `refreshAccessToken`. */
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Shared DingTalk login processing: exchange authCode → user info → JWT.
 * Stores tokens in Redis under the state key so the client can poll for them.
 *
 * Throws `AppError(400, ...)` for an invalid/expired state.
 */
export async function processDingTalkLogin(
  state: string,
  authCode: string,
): Promise<void> {
  // Verify state exists in Redis
  const stateValue = await redis.get(`dingtalk:state:${state}`);
  if (!stateValue) {
    throw new AppError('Invalid or expired state', 400);
  }

  // Exchange authCode for user info
  const dingtalkUser = await getUserInfoByCode(authCode);

  // Find or create user in database
  let user = await UserModel.findOne({
    where: { dingtalkId: dingtalkUser.dingtalkId },
  });

  if (!user) {
    user = await UserModel.create({
      dingtalkId: dingtalkUser.dingtalkId,
      name: dingtalkUser.name,
      phone: dingtalkUser.phone,
      avatar: dingtalkUser.avatar,
      role: 'operator',
      status: 1,
    });
  } else {
    // Update user info
    await user.update({
      name: dingtalkUser.name || user.name,
      phone: dingtalkUser.phone || user.phone,
      avatar: dingtalkUser.avatar || user.avatar,
    });
  }

  // Auto-create a Device record for this user if newly created
  let device = await DeviceModel.findOne({
    where: { deviceId: `user-${user.id}` },
  });
  if (!device) {
    device = await DeviceModel.create({
      deviceId: `user-${user.id}`,
      status: 'offline',
    });
  }

  // Find user's store binding
  const binding = await UserStoreBindingModel.findOne({
    where: { userId: user.id },
  });

  const storeId = binding ? binding.storeId : null;

  // Create JWT payload
  const jwtPayload: JwtPayload = {
    userId: user.id,
    storeId,
    deviceId: device.deviceId,
    role: user.role,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = signRefreshToken(jwtPayload);

  // Store tokens in Redis under the state key (5min TTL)
  const stateData = JSON.stringify({
    status: 'success',
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
    },
    storeId,
    deviceId: device.deviceId,
  });

  await setWithExpiry(`dingtalk:state:${state}`, stateData, DINGTALK_STATE_TTL_SECONDS);
}

/**
 * Dev mock login — provisions a stable mock operator/device and the first
 * store, then signs real JWT tokens. Returns the same shape as a successful
 * DingTalk poll.
 */
export async function mockLogin(): Promise<LoginResponse> {
  // 1. Find or create mock user
  let user = await UserModel.findOne({
    where: { dingtalkId: 'mock_dev_user' },
  });
  if (!user) {
    user = await UserModel.create({
      dingtalkId: 'mock_dev_user',
      name: '开发测试用户',
      phone: '13800138000',
      avatar: '',
      role: 'operator',
      status: 1,
    });
  }

  // 2. Find or create a device record
  const deviceId = `mock-device-${user.id}`;
  let device = await DeviceModel.findOne({ where: { deviceId } });
  if (!device) {
    device = await DeviceModel.create({
      deviceId,
      deviceName: 'Mock Device',
      osVersion: 'dev',
      status: 'online',
    });
  }

  // 3. Find the first store to bind
  let store = await StoreModel.findOne({ order: [['id', 'ASC']] });
  let storeId: number | null = null;

  if (store) {
    storeId = store.id;

    // Bind user to store if not already
    const existingBinding = await UserStoreBindingModel.findOne({
      where: { userId: user.id, storeId: store.id },
    });
    if (!existingBinding) {
      await UserStoreBindingModel.create({
        userId: user.id,
        storeId: store.id,
      });
    }

    // Bind device to store
    if (!device.storeId || device.storeId !== store.id) {
      await device.update({ storeId: store.id });
    }
  }

  // 4. Sign real JWT tokens
  const jwtPayload: JwtPayload = {
    userId: user.id,
    storeId,
    deviceId: device.deviceId,
    role: user.role,
  };

  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = signRefreshToken(jwtPayload);

  // 5. Return same format as poll success
  return {
    status: 'success',
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
    },
    storeId,
    deviceId: device.deviceId,
  };
}

/**
 * Rotate an access/refresh token pair.
 *
 * Verifies the refresh token, blacklists it for the remainder of its TTL
 * (single-use rotation), and issues a fresh pair with a clean payload
 * (stripped of `iat`/`exp` so `jwt.sign` doesn't reject the re-sign).
 *
 * Throws:
 *  - `AppError(400, ...)` if `refreshToken` is missing.
 *  - `AppError(401, ...)` if the token is blacklisted or fails verification.
 */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshResponse> {
  if (!refreshToken) {
    throw new AppError('refreshToken is required', 400);
  }

  // Check if refresh token is blacklisted
  const isBlacklisted = await redis.get(`jwt:blacklist:${refreshToken}`);
  if (isBlacklisted) {
    throw new AppError('Refresh token has been revoked', 401);
  }

  let decoded: JwtPayload;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token verification failed';
    throw new AppError(message, 401);
  }

  // Blacklist old refresh token for the remainder of its TTL
  await setWithExpiry(`jwt:blacklist:${refreshToken}`, 'revoked', JWT_REFRESH_TTL_SECONDS);

  // Re-sign with a clean JwtPayload — verifyRefreshToken returns the decoded
  // JWT which carries `iat`/`exp`, and passing those back to jwt.sign together
  // with `expiresIn` throws "the payload already has an 'exp' property".
  const payload: JwtPayload = {
    userId: decoded.userId,
    storeId: decoded.storeId,
    deviceId: decoded.deviceId,
    role: decoded.role,
  };

  // Generate new tokens
  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(payload);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Blacklist the supplied access token for the remainder of its TTL so
 * `authMiddleware` rejects it on subsequent requests.
 *
 * Throws `AppError(400, ...)` if `token` is empty.
 */
export async function logout(token: string): Promise<{ success: true }> {
  if (!token) {
    throw new AppError('Access token is required', 400);
  }

  // Add current accessToken to blacklist with TTL matching token expiry
  await setWithExpiry(`jwt:blacklist:${token}`, 'revoked', JWT_ACCESS_TTL_SECONDS);

  return { success: true };
}
