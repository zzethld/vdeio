import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createVideoAccessCodeModel } from '../../models/videoAccessCode';

let sequelize: Sequelize;
let VideoAccessCode: ReturnType<typeof createVideoAccessCodeModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  VideoAccessCode = createVideoAccessCodeModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('VideoAccessCode Model', () => {
  it('should create a video access code record with correct fields', async () => {
    const code = await VideoAccessCode.create({
      code: 'ACCESS-001',
      videoId: 1,
      storeId: 2,
      maxUses: 10,
      expiresAt: new Date('2026-12-31T23:59:59Z'),
      createdBy: 1,
    });

    expect(code.id).toBeDefined();
    expect(code.id).toBeGreaterThan(0);
    expect(code.code).toBe('ACCESS-001');
    expect(code.videoId).toBe(1);
    expect(code.storeId).toBe(2);
    expect(code.maxUses).toBe(10);
    expect(code.useCount).toBe(0);
    expect(code.expiresAt).toBeInstanceOf(Date);
    expect(code.status).toBe('active');
    expect(code.createdBy).toBe(1);
    expect(code.createdAt).toBeInstanceOf(Date);
  });

  it('should enforce unique code constraint', async () => {
    await VideoAccessCode.create({ code: 'DUPLICATE', videoId: 1 });

    await expect(
      VideoAccessCode.create({ code: 'DUPLICATE', videoId: 2 })
    ).rejects.toThrow();
  });

  it('should default status to active and useCount to 0', async () => {
    const code = await VideoAccessCode.create({ code: 'DEFAULTS', videoId: 1 });

    expect(code.status).toBe('active');
    expect(code.useCount).toBe(0);
  });

  it('should allow nullable storeId, maxUses, expiresAt and createdBy', async () => {
    const code = await VideoAccessCode.create({ code: 'NULLABLES', videoId: 1 });

    expect([null, undefined]).toContain(code.storeId);
    expect([null, undefined]).toContain(code.maxUses);
    expect([null, undefined]).toContain(code.expiresAt);
    expect([null, undefined]).toContain(code.createdBy);
  });

  it('should not have updatedAt (timestamps: false)', async () => {
    const code = await VideoAccessCode.create({ code: 'NO-UPDATED-AT', videoId: 1 });

    expect('updatedAt' in code).toBe(false);
  });
});
