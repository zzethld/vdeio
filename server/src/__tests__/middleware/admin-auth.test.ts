import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { adminAuthMiddleware } from '../../middleware/admin-auth';

function createMockRes() {
  const jsonFn = vi.fn();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  return {
    res: { status: statusFn, json: jsonFn } as unknown as Response,
    jsonFn,
    statusFn,
  };
}

describe('adminAuthMiddleware', () => {
  it('should return 403 when user role is operator', () => {
    const req = { user: { role: 'operator' } } as Request;
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Admin access required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when user role is admin', () => {
    const req = { user: { role: 'admin' } } as Request;
    const { res, next } = { res: createMockRes().res, next: vi.fn() };

    adminAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 403 when req.user is undefined (auth middleware skipped)', () => {
    const req = {} as Request;
    const { res, jsonFn, statusFn } = createMockRes();
    const next = vi.fn();

    adminAuthMiddleware(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Admin access required',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
