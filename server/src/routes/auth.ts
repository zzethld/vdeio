import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { redis, setWithExpiry } from '../config/redis';
import { authMiddleware } from '../middleware/auth';
import { getQRCodeUrl, IS_MOCK_MODE } from '../services/dingtalk';
import { DINGTALK_STATE_TTL_SECONDS } from '../config/constants';
import { asyncHandler } from '../utils/async-handler';
import { AppError } from '../utils/app-error';
import * as authService from '../services/auth';

const router = Router();

// 1. GET /api/v1/auth/dingtalk/qrcode
router.get(
  '/dingtalk/qrcode',
  asyncHandler(async (_req: Request, res: Response) => {
    const state = uuidv4();
    await setWithExpiry(`dingtalk:state:${state}`, 'pending', DINGTALK_STATE_TTL_SECONDS);

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
  }),
);

// 2. POST /api/v1/auth/dingtalk/callback — programmatic callback (client posts authCode)
router.post(
  '/dingtalk/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { state, authCode } = req.body;

    if (!state || !authCode) {
      throw new AppError('state and authCode are required', 400);
    }

    await authService.processDingTalkLogin(state, authCode);

    res.json({
      success: true,
    });
  }),
);

// 2.1 GET /api/v1/auth/dingtalk/callback — DingTalk redirect target (after QR scan)
// DingTalk GET-redirects here with ?code=&authCode=&state= after the user scans
// and confirms. We process the login and return a minimal HTML page (the iframe
// that hosted the QR navigates here). The client detects success via /auth/poll.
// NOTE: this endpoint intentionally keeps HTML responses (including errors) so
// the browser-rendered redirect target stays user-friendly; it cannot rely on
// the global JSON error handler like the API endpoints above.
router.get('/dingtalk/callback', async (req: Request, res: Response) => {
  try {
    const authCode = (req.query.authCode || req.query.code) as string;
    const state = req.query.state as string;

    if (!state || !authCode) {
      res.status(400).send(
        '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px">' +
          '<h3>❌ 参数缺失</h3></body></html>',
      );
      return;
    }

    await authService.processDingTalkLogin(state, authCode);

    res.set('Content-Type', 'text/html');
    res.send(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:48px">' +
        '<h3>✅ 登录成功</h3><p style="color:#666">请返回应用</p></body></html>',
    );
  } catch (err) {
    console.error('DingTalk GET callback error:', err);
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.status(statusCode).send(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:48px">' +
        `<h3>❌ 登录失败</h3><p style="color:#e53e3e">${message}</p></body></html>`,
    );
  }
});

// 3. GET /api/v1/auth/poll?state=xxx
router.get(
  '/poll',
  asyncHandler(async (req: Request, res: Response) => {
    const { state } = req.query;

    if (!state || typeof state !== 'string') {
      throw new AppError('state query parameter is required', 400);
    }

    const stateValue = await redis.get(`dingtalk:state:${state}`);

    if (!stateValue) {
      throw new AppError('Invalid or expired state', 400);
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

    throw new AppError('Invalid state', 400);
  }),
);

// 3.1 POST /api/v1/auth/mock-login — Dev mock login (no DingTalk required)
router.post(
  '/mock-login',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await authService.mockLogin();
    res.json(result);
  }),
);

// 4. POST /api/v1/auth/refresh
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('refreshToken is required', 400);
    }

    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  }),
);

// 5. POST /api/v1/auth/logout
router.post(
  '/logout',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access token is required', 400);
    }

    const token = authHeader.substring(7);

    await authService.logout(token);

    res.json({
      success: true,
    });
  }),
);

export default router;
