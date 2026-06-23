import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createVideoModel } from '../../models/video';

let sequelize: Sequelize;
let Video: ReturnType<typeof createVideoModel>;

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  Video = createVideoModel(sequelize);
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('Video Model', () => {
  it('should create a video record with correct fields', async () => {
    const video = await Video.create({
      title: 'Test Video',
      description: 'A test video description',
      duration: 120,
      fileSize: 1024000,
      resolution: '1920x1080',
      originalUrl: 'http://example.com/original.mp4',
      hlsUrl: 'http://example.com/hls/playlist.m3u8',
      coverUrl: 'http://example.com/cover.jpg',
      createdBy: 1,
    });

    expect(video.id).toBeDefined();
    expect(video.id).toBeGreaterThan(0);
    expect(video.title).toBe('Test Video');
    expect(video.description).toBe('A test video description');
    expect(video.duration).toBe(120);
    expect(video.fileSize).toBe(1024000);
    expect(video.resolution).toBe('1920x1080');
    expect(video.originalUrl).toBe('http://example.com/original.mp4');
    expect(video.hlsUrl).toBe('http://example.com/hls/playlist.m3u8');
    expect(video.coverUrl).toBe('http://example.com/cover.jpg');
    expect(video.accessMode).toBe('campaign');
    expect(video.offlineAllowed).toBe(true);
    expect(video.keyTtlHours).toBe(168);
    expect(video.encryptStatus).toBe('pending');
    expect(video.createdBy).toBe(1);
    expect(video.createdAt).toBeInstanceOf(Date);
    expect(video.updatedAt).toBeInstanceOf(Date);
    expect(video.deletedAt).toBeUndefined();
  });

  it('should soft delete a video (paranoid mode)', async () => {
    const video = await Video.create({ title: 'To Be Deleted' });
    expect(video.deletedAt).toBeUndefined();

    await video.destroy();

    // Should not be found with default (paranoid) query
    const found = await Video.findByPk(video.id);
    expect(found).toBeNull();

    // Should be found when including deleted records
    const foundWithDeleted = await Video.findByPk(video.id, { paranoid: false });
    expect(foundWithDeleted).not.toBeNull();
    expect(foundWithDeleted!.deletedAt).not.toBeNull();
    expect(foundWithDeleted!.title).toBe('To Be Deleted');
  });

  it('should only return non-deleted videos by default scope', async () => {
    await Video.create({ title: 'Active Video 1' });
    await Video.create({ title: 'Active Video 2' });
    const toDelete = await Video.create({ title: 'Deleted Video' });
    await toDelete.destroy();

    const allVideos = await Video.findAll();
    expect(allVideos).toHaveLength(2);
    const titles = allVideos.map((v) => v.title);
    expect(titles).toContain('Active Video 1');
    expect(titles).toContain('Active Video 2');
    expect(titles).not.toContain('Deleted Video');
  });

  it('should default encryptStatus to pending', async () => {
    const video = await Video.create({ title: 'No Status Set' });
    expect(video.encryptStatus).toBe('pending');
  });

  it('should default accessMode to campaign, offlineAllowed to true, and keyTtlHours to 168', async () => {
    const video = await Video.create({ title: 'No Policy Set' });
    expect(video.accessMode).toBe('campaign');
    expect(video.offlineAllowed).toBe(true);
    expect(video.keyTtlHours).toBe(168);
  });
});
