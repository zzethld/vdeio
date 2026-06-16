import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createVideoKeyModel } from '../../models/videoKey';

let sequelize: Sequelize;
let VideoKey: ReturnType<typeof createVideoKeyModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  VideoKey = createVideoKeyModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('VideoKey Model', () => {
  it('should create a video key record with correct fields', async () => {
    const videoKey = await VideoKey.create({
      videoId: 1,
      keyId: 'key_abc123',
      encryptedKey: 'encrypted_value_here',
      iv: 'initialization_vector',
    });

    expect(videoKey.id).toBeDefined();
    expect(videoKey.id).toBeGreaterThan(0);
    expect(videoKey.videoId).toBe(1);
    expect(videoKey.keyId).toBe('key_abc123');
    expect(videoKey.encryptedKey).toBe('encrypted_value_here');
    expect(videoKey.iv).toBe('initialization_vector');
    expect(videoKey.status).toBe('active');
    expect(videoKey.createdAt).toBeInstanceOf(Date);
  });

  it('should default status to active', async () => {
    const videoKey = await VideoKey.create({ videoId: 2 });

    expect(videoKey.status).toBe('active');
  });

  it('should enforce unique videoId', async () => {
    await VideoKey.create({ videoId: 1 });

    await expect(
      VideoKey.create({ videoId: 1 })
    ).rejects.toThrow();
  });

  it('should allow nullable encryptedKey and iv', async () => {
    const videoKey = await VideoKey.create({ videoId: 5 });

    expect([null, undefined]).toContain(videoKey.keyId);
    expect([null, undefined]).toContain(videoKey.encryptedKey);
    expect([null, undefined]).toContain(videoKey.iv);
  });

  it('should not have updatedAt (updatedAt: false)', async () => {
    const videoKey = await VideoKey.create({ videoId: 3 });

    expect((videoKey as any).updatedAt).toBeUndefined();
  });
});
