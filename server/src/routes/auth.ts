import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { redis, setWithExpiry } from '../config/redis';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  JwtPayload,
} from '../utils/jwt';
import { authMiddleware } from '../middleware/auth';
import { getQRCodeUrl, getUserInfoByCode, IS_MOCK_MODE } from '../services/dingtalk';
import { UserModel, UserStoreBindingModel, DeviceModel, StoreModel } from '../models';

const router = Router();

/** Typed auth error that carries an HTTP status code (default 500 for generic errors). */
class DingTalkAuthError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'DingTalkAuthError';
  }
}

// 1. GET /api/v1/auth/dingtalk/qrcode
router.get('/dingtalk/qrcode', async (_req: Request, res: Response) => {
  try {
    const state = uuidv4();
    await setWithExpiry(`dingtalk:state:${state}`, 'pending', 300); // 5min TTL

    if (IS_MOCK_MODE) {
      // Mock mode: no DingTalk credentials configured.
      // Return empty qrCodeUrl + mockMode flag so client shows mock-login UI.
      // State is still stored so callback/poll flow remains testable.
      res.json({
        qrCodeUrl: '',
        state,
        mockMode: true,
      });
      return;
    }

    const qrCodeUrl = getQRCodeUrl(state);

    res.json({
      qrCodeUrl,
      state,
      mockMode: false,
    });
  } catch (err) {
    console.error('Generate QR code error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate QR code',
    });
  }
});

/**
 * Shared DingTalk login processing: exchange authCode → user info → JWT.
 * Stores tokens in Redis under the state key so the client can poll for them.
 */
async function processDingTalkLogin(state: string, authCode: string): Promise<void> {
  // Verify state exists in Redis
  const stateValue = await redis.get(`dingtalk:state:${state}`);
  if (!stateValue) {
    throw new DingTalkAuthError('Invalid or expired state', 400);
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

  await setWithExpiry(`dingtalk:state:${state}`, stateData, 300); // 5min TTL
}

// 2. POST /api/v1/auth/dingtalk/callback — programmatic callback (client posts authCode)
router.post('/dingtalk/callback', async (req: Request, res: Response) => {
  try {
    const { state, authCode } = req.body;

    if (!state || !authCode) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'state and authCode are required',
      });
      return;
    }

    await processDingTalkLogin(state, authCode);

    res.json({
      success: true,
    });
  } catch (err) {
    console.error('DingTalk callback error:', err);
    const statusCode = err instanceof DingTalkAuthError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.status(statusCode).json({
      error: statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
      message,
    });
  }
});

// 2.1 GET /api/v1/auth/dingtalk/callback — DingTalk redirect target (after QR scan)
// DingTalk GET-redirects here with ?code=&authCode=&state= after the user scans
// and confirms. We process the login and return a minimal HTML page (the iframe
// that hosted the QR navigates here). The client detects success via /auth/poll.
router.get('/dingtalk/callback', async (req: Request, res: Response) => {
  try {
    const authCode = (req.query.authCode || req.query.code) as string;
    const state = req.query.state as string;

    if (!state || !authCode) {
      res.status(400).send(
        '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px">' +
        '<h3>❌ 参数缺失</h3></body></html>'
      );
      return;
    }

    await processDingTalkLogin(state, authCode);

    res.set('Content-Type', 'text/html');
    res.send(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:48px">' +
      '<h3>✅ 登录成功</h3><p style="color:#666">请返回应用</p></body></html>'
    );
  } catch (err) {
    console.error('DingTalk GET callback error:', err);
    const statusCode = err instanceof DingTalkAuthError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.status(statusCode).send(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:48px">' +
      `<h3>❌ 登录失败</h3><p style="color:#e53e3e">${message}</p></body></html>`
    );
  }
});

// 3. GET /api/v1/auth/poll?state=xxx
router.get('/poll', async (req: Request, res: Response) => {
  try {
    const { state } = req.query;

    if (!state || typeof state !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'state query parameter is required',
      });
      return;
    }

    const stateValue = await redis.get(`dingtalk:state:${state}`);

    if (!stateValue) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid or expired state',
      });
      return;
    }

    if (stateValue === 'pending') {
      res.json({
        status: 'pending',
      });
      return;
    }

    // State contains success data (JSON string)
    const stateData = JSON.parse(stateValue);

    if (stateData.status === 'success') {
      res.json({
        status: 'success',
        accessToken: stateData.accessToken,
        refreshToken: stateData.refreshToken,
        user: stateData.user,
        storeId: stateData.storeId,
      });
      return;
    }

    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid state',
    });
  } catch (err) {
    console.error('Poll error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to poll login status',
    });
  }
});

// 3.1 POST /api/v1/auth/mock-login — Dev mock login (no DingTalk required)
router.post('/mock-login', async (_req: Request, res: Response) => {
  try {
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
    res.json({
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
  } catch (err) {
    console.error('Mock login error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Mock login failed',
    });
  }
});

// 4. POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'refreshToken is required',
      });
      return;
    }

    // Check if refresh token is blacklisted
    const isBlacklisted = await redis.get(`jwt:blacklist:${refreshToken}`);
    if (isBlacklisted) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token has been revoked',
      });
      return;
    }

    let decoded: JwtPayload;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token verification failed';
      res.status(401).json({
        error: 'Unauthorized',
        message,
      });
      return;
    }

    // Blacklist old refresh token (7d TTL = 604800 seconds)
    await setWithExpiry(`jwt:blacklist:${refreshToken}`, 'revoked', 604800);

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

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to refresh token',
    });
  }
});

// 5. POST /api/v1/auth/logout
router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Access token is required',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Add current accessToken to blacklist with TTL matching token expiry (2h = 7200 seconds)
    await setWithExpiry(`jwt:blacklist:${token}`, 'revoked', 7200);

    res.json({
      success: true,
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to logout',
    });
  }
});

export default router;
