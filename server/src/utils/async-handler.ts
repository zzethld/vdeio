import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express route handler so that rejected promises are forwarded
 * to the next error-handling middleware via `next(err)`.
 *
 * This removes the need for inline try/catch blocks that end the response with
 * `res.status(500).json(...)`; unexpected errors naturally reach the global
 * error handler, while expected errors can be thrown as `AppError` anywhere in
 * the handler.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
