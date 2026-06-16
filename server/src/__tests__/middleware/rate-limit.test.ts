import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

let rateLimitMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;

function createMockReq(ip: string): Request {
  return { ip } as Request;
}

function createMockRes() {
  const jsonFn = vi.fn();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const setHeaderFn = vi.fn();
  return {
    res: {
      status: statusFn,
      json: jsonFn,
      setHeader: setHeaderFn,
      headersSent: false,
      append: setHeaderFn,
      on: vi.fn(),
    } as unknown as Response,
    jsonFn,
    statusFn,
    setHeaderFn,
  };
}

describe('rateLimitMiddleware', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const module = await import('../../middleware/rate-limit');
    rateLimitMiddleware = module.rateLimitMiddleware as any;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow 100 requests from the same IP (under limit)', async () => {
    const ip = '192.168.1.1';
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    for (let i = 0; i < 100; i++) {
      const req = createMockReq(ip);
      await rateLimitMiddleware(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(100);
    expect(statusFn).not.toHaveBeenCalled();
    expect(jsonFn).not.toHaveBeenCalled();
  });

  it('should return 429 on the 101st request from the same IP (over limit)', async () => {
    const ip = '192.168.1.2';
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    for (let i = 0; i < 101; i++) {
      const req = createMockReq(ip);
      await rateLimitMiddleware(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(100);
    expect(statusFn).toHaveBeenCalledWith(429);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
    });
  });

  it('should reset the rate limit after the window expires', async () => {
    const ip = '192.168.1.3';
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    // Make 100 requests — all allowed
    for (let i = 0; i < 100; i++) {
      const req = createMockReq(ip);
      await rateLimitMiddleware(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(100);

    // 101st request should be blocked
    const reqBlocked = createMockReq(ip);
    await rateLimitMiddleware(reqBlocked, res, next);
    expect(statusFn).toHaveBeenCalledWith(429);

    // Advance time past the 60-second window
    vi.advanceTimersByTime(61 * 1000);

    // Clear mocks to distinguish new calls
    next.mockClear();
    statusFn.mockClear();
    jsonFn.mockClear();

    // New request should succeed after window reset
    const reqNew = createMockReq(ip);
    await rateLimitMiddleware(reqNew, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(statusFn).not.toHaveBeenCalled();
    expect(jsonFn).not.toHaveBeenCalled();
  });

  it('should track different IPs with separate counters', async () => {
    const ip1 = '192.168.1.10';
    const ip2 = '192.168.1.20';
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    // Make 100 requests from IP1
    for (let i = 0; i < 100; i++) {
      const req = createMockReq(ip1);
      await rateLimitMiddleware(req, res, next);
    }

    // Make 100 requests from IP2
    for (let i = 0; i < 100; i++) {
      const req = createMockReq(ip2);
      await rateLimitMiddleware(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(200);
    expect(statusFn).not.toHaveBeenCalled();
    expect(jsonFn).not.toHaveBeenCalled();
  });
});
