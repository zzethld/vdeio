/**
 * Explicit server entry point.
 *
 * Alternative to running `src/app.ts` directly. Use this when you want to
 * start the server from another module (e.g. `ts-node src/server.ts`).
 * When app.ts is run directly via `npm run dev`, it auto-starts via the
 * `require.main === module` guard.
 */
import { startServer } from './app';

startServer();
