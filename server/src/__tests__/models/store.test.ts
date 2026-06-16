import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createStoreModel } from '../../models/store';

let sequelize: Sequelize;
let Store: ReturnType<typeof createStoreModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  Store = createStoreModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('Store Model', () => {
  it('should create a store record with correct fields', async () => {
    const store = await Store.create({
      name: 'Test Store',
      code: 'TS001',
      region: 'East',
      address: '123 Main St',
    });

    expect(store.id).toBeDefined();
    expect(store.id).toBeGreaterThan(0);
    expect(store.name).toBe('Test Store');
    expect(store.code).toBe('TS001');
    expect(store.region).toBe('East');
    expect(store.address).toBe('123 Main St');
    expect(store.status).toBe(1);
    expect(store.createdAt).toBeInstanceOf(Date);
    expect(store.updatedAt).toBeInstanceOf(Date);
  });

  it('should default status to 1', async () => {
    const store = await Store.create({ name: 'Default Status Store' });

    expect(store.status).toBe(1);
  });

  it('should enforce unique code', async () => {
    await Store.create({ name: 'Store A', code: 'CODE001' });

    await expect(
      Store.create({ name: 'Store B', code: 'CODE001' })
    ).rejects.toThrow();
  });

  it('should allow nullable fields', async () => {
    const store = await Store.create({});

    expect([null, undefined]).toContain(store.name);
    expect([null, undefined]).toContain(store.code);
    expect([null, undefined]).toContain(store.region);
    expect([null, undefined]).toContain(store.address);
  });
});
