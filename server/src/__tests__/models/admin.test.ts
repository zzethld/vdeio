import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createAdminModel } from '../../models/admin';

let sequelize: Sequelize;
let Admin: ReturnType<typeof createAdminModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  Admin = createAdminModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('Admin Model', () => {
  it('should create an admin record with correct fields', async () => {
    const admin = await Admin.create({
      username: 'admin1',
      passwordHash: 'hashed_password_123',
      name: 'Test Admin',
      role: 'super_admin',
    });

    expect(admin.id).toBeDefined();
    expect(admin.id).toBeGreaterThan(0);
    expect(admin.username).toBe('admin1');
    expect(admin.passwordHash).toBe('hashed_password_123');
    expect(admin.name).toBe('Test Admin');
    expect(admin.role).toBe('super_admin');
    expect(admin.loginFailCount).toBe(0);
    expect([null, undefined]).toContain(admin.lockedUntil);
    expect(admin.status).toBe(1);
    expect(admin.createdAt).toBeInstanceOf(Date);
  });

  it('should default role to admin', async () => {
    const admin = await Admin.create({
      username: 'default_admin',
      passwordHash: 'hash123',
    });

    expect(admin.role).toBe('admin');
  });

  it('should default loginFailCount to 0', async () => {
    const admin = await Admin.create({
      username: 'failcount_admin',
      passwordHash: 'hash123',
    });

    expect(admin.loginFailCount).toBe(0);
  });

  it('should default status to 1', async () => {
    const admin = await Admin.create({
      username: 'status_admin',
      passwordHash: 'hash123',
    });

    expect(admin.status).toBe(1);
  });

  it('should enforce unique username', async () => {
    await Admin.create({ username: 'unique_admin', passwordHash: 'hash1' });

    await expect(
      Admin.create({ username: 'unique_admin', passwordHash: 'hash2' })
    ).rejects.toThrow();
  });

  it('should not have updatedAt (updatedAt: false)', async () => {
    const admin = await Admin.create({
      username: 'no_update_admin',
      passwordHash: 'hash123',
    });

    expect((admin as any).updatedAt).toBeUndefined();
  });

  it('should allow nullable name and lockedUntil', async () => {
    const admin = await Admin.create({
      username: 'nullable_admin',
      passwordHash: 'hash123',
    });

    expect([null, undefined]).toContain(admin.name);
    expect([null, undefined]).toContain(admin.lockedUntil);
  });
});
