/**
 * Test database setup utilities.
 *
 * This module exports functions for integration tests to call in their
 * own beforeAll/beforeEach/afterEach hooks. It does NOT register global
 * hooks (to avoid interfering with existing unit tests in src/__tests__/).
 *
 * Usage in integration tests:
 *   import { initTestDatabase, resetTestDatabase } from './setup';
 *   beforeAll(initTestDatabase);
 *   beforeEach(resetTestDatabase);
 */
import { sequelize } from '../src/config/database';
import { setupAssociations } from '../src/models';

/**
 * One-time initialization: authenticate, setup associations, sync models.
 * Call in beforeAll().
 */
export async function initTestDatabase(): Promise<void> {
  await sequelize.authenticate();
  setupAssociations();
  await sequelize.sync({ force: true });
}

/**
 * Per-test reset: drop and recreate all tables for clean state.
 * Call in beforeEach().
 */
export async function resetTestDatabase(): Promise<void> {
  await sequelize.sync({ force: true });
}

/**
 * Close the database connection. Call in afterAll() when done.
 */
export async function closeTestDatabase(): Promise<void> {
  await sequelize.close();
}
