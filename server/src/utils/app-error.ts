/**
 * Typed application error carrying an HTTP status code.
 *
 * Throwing `AppError` from services/routes lets the global Express error
 * middleware (`app.ts`) pick a correct status code without `as any` casts on
 * the base `Error`. Non-AppError errors fall back to 500, preserving the
 * previous behaviour.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;

    // Restore prototype chain (Error subclass quirk under ES5/ES2015 target).
    Object.setPrototypeOf(this, AppError.prototype);

    // Maintain clean stack trace where supported.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AppError);
    }
  }
}

/**
 * Any value that carries an HTTP `statusCode` number property. Several
 * third-party middlewares (body-parser's `SyntaxError`, express-jwt's
 * `UnauthorizedError`) decorate their errors this way; we want to honour those
 * without resorting to `as any`.
 */
interface HttpCarryingError {
  readonly statusCode: number;
}

function isHttpCarryingError(err: unknown): err is HttpCarryingError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number'
  );
}

/**
 * Resolve the HTTP status code for an error reaching the global handler.
 *
 * - `AppError` → its declared code
 * - Errors carrying their own numeric `statusCode` (body-parser SyntaxError,
 *   express-jwt UnauthorizedError) → that code
 * - Anything else → 500
 */
export function resolveErrorStatusCode(err: unknown): number {
  if (err instanceof AppError) return err.statusCode;
  if (isHttpCarryingError(err)) return err.statusCode;
  return 500;
}

