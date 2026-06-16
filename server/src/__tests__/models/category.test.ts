import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createCategoryModel } from '../../models/category';

let sequelize: Sequelize;
let Category: ReturnType<typeof createCategoryModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  Category = createCategoryModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('Category Model', () => {
  it('should create a category record with correct fields', async () => {
    const category = await Category.create({
      name: 'Electronics',
      parentId: null,
      sortOrder: 1,
    });

    expect(category.id).toBeDefined();
    expect(category.id).toBeGreaterThan(0);
    expect(category.name).toBe('Electronics');
    expect(category.parentId).toBeNull();
    expect(category.sortOrder).toBe(1);
    expect(category.createdAt).toBeInstanceOf(Date);
  });

  it('should default sortOrder to 0', async () => {
    const category = await Category.create({ name: 'Default Sort' });

    expect(category.sortOrder).toBe(0);
  });

  it('should default parentId to null', async () => {
    const category = await Category.create({ name: 'Root Category' });

    expect([null, undefined]).toContain(category.parentId);
  });

  it('should not have updatedAt (updatedAt: false)', async () => {
    const category = await Category.create({ name: 'No Update' });

    expect((category as any).updatedAt).toBeUndefined();
  });

  it('should support nested categories via parentId', async () => {
    const parent = await Category.create({ name: 'Parent', sortOrder: 1 });
    const child = await Category.create({ name: 'Child', parentId: parent.id, sortOrder: 1 });

    expect(child.parentId).toBe(parent.id);
  });

  it('should allow nullable name', async () => {
    const category = await Category.create({});

    expect([null, undefined]).toContain(category.name);
  });
});
