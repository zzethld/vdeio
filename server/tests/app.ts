/**
 * Test app module — exports the Express app and a supertest request helper.
 *
 * Importing this module does NOT start the server (the `require.main === module`
 * guard in app.ts prevents auto-start when imported).
 *
 * Usage in tests:
 *   import { app, apiRequest } from './app';
 *   const res = await apiRequest().get('/health');
 */
import request from 'supertest';
import { app } from '../src/app';

export { app };

/**
 * Create a supertest agent bound to the Express app.
 * Use this for all HTTP assertions in integration tests.
 */
export function apiRequest() {
  return request(app);
}
