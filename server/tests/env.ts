/**
 * Test environment configuration.
 *
 * This file MUST be listed FIRST in vitest's setupFiles array so that
 * environment variables are set BEFORE any module (database.ts, etc.)
 * is loaded. Import hoisting means env vars must be in a separate file
 * with no imports of its own.
 */

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.NODE_ENV = 'test';
process.env.REDIS_MOCK = 'true';
process.env.SERVER_PORT = '0'; // Let OS pick a free port (irrelevant for supertest)
