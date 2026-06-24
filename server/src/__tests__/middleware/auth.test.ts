import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
    sign: vi.fn(),
    TokenExpiredError: class TokenExpiredError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'TokenExpiredError';
      }
    },
    JsonWebTokenError: class JsonWebTokenError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'JsonWebTokenError';
      }
    },
  },
}));

vi.mock('../../config/redis', () => ({
  redis: {
    get: vi.fn(),
  },
  getRedis: vi.fn(),
  setWithExpiry: vi.fn(),
}));

import jwt from 'jsonwebtoken';
import { redis } from '../../config/redis';
import { authMiddleware } from '../../middleware/auth';

function createMockRes() {
  const jsonFn = vi.fn();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  return {
    res: { status: statusFn, json: jsonFn } as unknown as Response,
    jsonFn,
    statusFn,
  };
}

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as Request;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when no Authorization header is present', async () => {
    const req = createMockReq();
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Access token is required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header is missing Bearer prefix', async () => {
    const req = createMockReq({ headers: { authorization: 'Basic token123' } });
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Access token is required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is malformed (no Bearer prefix)', async () => {
    const req = createMockReq({ headers: { authorization: 'token123' } });
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Access token is required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when JWT is expired or invalid', async () => {
    (jwt.verify as any).mockImplementation(() => {
      const Err = jwt.TokenExpiredError as any;
      throw new Err('jwt expired');
    });

    const req = createMockReq({ headers: { authorization: 'Bearer expired-token' } });
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Access token has expired',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is in Redis blacklist', async () => {
    (redis.get as any).mockResolvedValue('1');
    (jwt.verify as any).mockReturnValue({
      userId: 42,
      storeId: 7,
      deviceId: 'device-abc',
      role: 'admin',
    });

    const req = createMockReq({ headers: { authorization: 'Bearer blacklisted-token' } });
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(redis.get).toHaveBeenCalledWith('jwt:blacklist:blacklisted-token');
    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Token has been revoked',
    });
    expect(next).not.toHaveBeenCalled();
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('should call next() and set req.user for valid token', async () => {
    (redis.get as any).mockResolvedValue(null);
    (jwt.verify as any).mockReturnValue({
      userId: 42,
      storeId: 7,
      deviceId: 'device-abc',
      role: 'admin',
    });

    const req = createMockReq({ headers: { authorization: 'Bearer valid-token' } });
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(redis.get).toHaveBeenCalledWith('jwt:blacklist:valid-token');
    expect(jwt.verify).toHaveBeenCalledWith(
      'valid-token',
      'test-jwt-secret',
      expect.objectContaining({ algorithms: ['HS512'] })
    );
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe(42);
    expect(req.storeId).toBe(7);
    expect(req.deviceId).toBe('device-abc');
    expect(req.user).toEqual({
      userId: 42,
      storeId: 7,
      deviceId: 'device-abc',
      role: 'admin',
    });
  });
});
