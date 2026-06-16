import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createUserStoreBindingModel } from '../../models/userStoreBinding';

let sequelize: Sequelize;
let UserStoreBinding: ReturnType<typeof createUserStoreBindingModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  UserStoreBinding = createUserStoreBindingModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('UserStoreBinding Model', () => {
  it('should create a binding record with correct fields', async () => {
    const binding = await UserStoreBinding.create({
      userId: 1,
      storeId: 10,
    });

    expect(binding.id).toBeDefined();
    expect(binding.id).toBeGreaterThan(0);
    expect(binding.userId).toBe(1);
    expect(binding.storeId).toBe(10);
  });

  it('should not have timestamps (timestamps: false)', async () => {
    const binding = await UserStoreBinding.create({ userId: 2, storeId: 20 });

    expect((binding as any).createdAt).toBeUndefined();
    expect((binding as any).updatedAt).toBeUndefined();
  });

  it('should enforce unique composite index on [user_id, store_id]', async () => {
    await UserStoreBinding.create({ userId: 1, storeId: 1 });

    await expect(
      UserStoreBinding.create({ userId: 1, storeId: 1 })
    ).rejects.toThrow();
  });

  it('should enforce unique index on user_id (single-store-per-user)', async () => {
    await UserStoreBinding.create({ userId: 1, storeId: 1 });

    await expect(
      UserStoreBinding.create({ userId: 1, storeId: 2 })
    ).rejects.toThrow();
  });

  it('should allow different users to bind to the same store', async () => {
    await UserStoreBinding.create({ userId: 1, storeId: 1 });
    const binding2 = await UserStoreBinding.create({ userId: 2, storeId: 1 });

    expect(binding2).toBeDefined();
    expect(binding2.userId).toBe(2);
    expect(binding2.storeId).toBe(1);
  });
});
