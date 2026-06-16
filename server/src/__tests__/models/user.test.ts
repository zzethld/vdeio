import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createUserModel } from '../../models/user';

let sequelize: Sequelize;
let User: ReturnType<typeof createUserModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  User = createUserModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('User Model', () => {
  it('should create a user record with correct fields', async () => {
    const user = await User.create({
      dingtalkId: 'dt_001',
      name: 'Test User',
      phone: '13800138000',
      avatar: 'http://example.com/avatar.jpg',
    });

    expect(user.id).toBeDefined();
    expect(user.id).toBeGreaterThan(0);
    expect(user.dingtalkId).toBe('dt_001');
    expect(user.name).toBe('Test User');
    expect(user.phone).toBe('13800138000');
    expect(user.avatar).toBe('http://example.com/avatar.jpg');
    expect(user.role).toBe('operator');
    expect(user.status).toBe(1);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('should default role to operator', async () => {
    const user = await User.create({ name: 'Default Role User' });

    expect(user.role).toBe('operator');
  });

  it('should default status to 1', async () => {
    const user = await User.create({ name: 'Default Status User' });

    expect(user.status).toBe(1);
  });

  it('should enforce unique dingtalkId', async () => {
    await User.create({ dingtalkId: 'dt_unique', name: 'User A' });

    await expect(
      User.create({ dingtalkId: 'dt_unique', name: 'User B' })
    ).rejects.toThrow();
  });

  it('should allow nullable fields', async () => {
    const user = await User.create({});

    expect([null, undefined]).toContain(user.dingtalkId);
    expect([null, undefined]).toContain(user.name);
    expect([null, undefined]).toContain(user.phone);
    expect([null, undefined]).toContain(user.avatar);
  });

  it('should allow admin role', async () => {
    const user = await User.create({ name: 'Admin User', role: 'admin' });

    expect(user.role).toBe('admin');
  });
});
