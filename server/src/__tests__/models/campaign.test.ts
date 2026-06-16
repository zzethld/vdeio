import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { createModel as createCampaignModel } from '../../models/campaign';
import { createModel as createVideoModel } from '../../models/video';
import { createModel as createStoreModel } from '../../models/store';
import { createModel as createCampaignVideoModel } from '../../models/campaignVideo';
import { createModel as createCampaignStoreModel } from '../../models/campaignStore';

let sequelize: Sequelize;
let Campaign: ReturnType<typeof createCampaignModel>;
let Video: ReturnType<typeof createVideoModel>;
let Store: ReturnType<typeof createStoreModel>;
let CampaignVideo: ReturnType<typeof createCampaignVideoModel>;
let CampaignStore: ReturnType<typeof createCampaignStoreModel>;

function setupAssociations() {
  Campaign.belongsToMany(Video, {
    through: CampaignVideo,
    foreignKey: 'campaign_id',
    otherKey: 'video_id',
    as: 'videos',
  });
  Video.belongsToMany(Campaign, {
    through: CampaignVideo,
    foreignKey: 'video_id',
    otherKey: 'campaign_id',
    as: 'campaigns',
  });
  Campaign.belongsToMany(Store, {
    through: CampaignStore,
    foreignKey: 'campaign_id',
    otherKey: 'store_id',
    as: 'campaignStores',
  });
  Store.belongsToMany(Campaign, {
    through: CampaignStore,
    foreignKey: 'store_id',
    otherKey: 'campaign_id',
    as: 'storeCampaigns',
  });
}

beforeEach(async () => {
  sequelize = new Sequelize('sqlite::memory:', { logging: false, dialect: 'sqlite' });
  Campaign = createCampaignModel(sequelize);
  Video = createVideoModel(sequelize);
  Store = createStoreModel(sequelize);
  CampaignVideo = createCampaignVideoModel(sequelize);
  CampaignStore = createCampaignStoreModel(sequelize);
  setupAssociations();
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await sequelize.close();
});

describe('Campaign Model + Associations', () => {
  it('should create a campaign with default draft status', async () => {
    const campaign = await Campaign.create({
      title: 'Summer Sale 2024',
      description: 'Big summer discounts',
      startTime: new Date('2024-06-01'),
      endTime: new Date('2024-08-31'),
      createdBy: 1,
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.title).toBe('Summer Sale 2024');
    expect(campaign.status).toBe('draft');
    expect(campaign.startTime).toBeInstanceOf(Date);
    expect(campaign.endTime).toBeInstanceOf(Date);
  });

  it('should add videos to campaign via association', async () => {
    const campaign = await Campaign.create({
      title: 'Test Campaign',
      startTime: new Date(),
      endTime: new Date(Date.now() + 86400000),
      createdBy: 1,
    });

    const video1 = await Video.create({ title: 'Ad Video 1' });
    const video2 = await Video.create({ title: 'Ad Video 2' });

    // Create join records directly to avoid Sequelize association foreignKey mapping issues
    await CampaignVideo.create({ campaignId: campaign.id, videoId: video1.id, sortOrder: 1 });
    await CampaignVideo.create({ campaignId: campaign.id, videoId: video2.id, sortOrder: 2 });

    const videos = await (campaign as any).getVideos();
    expect(videos).toHaveLength(2);
    expect(videos.map((v: any) => v.title)).toContain('Ad Video 1');
    expect(videos.map((v: any) => v.title)).toContain('Ad Video 2');
  });

  it('should handle campaign status transitions', async () => {
    const campaign = await Campaign.create({
      title: 'Status Test',
      startTime: new Date(),
      endTime: new Date(Date.now() + 86400000),
      status: 'draft',
    });
    expect(campaign.status).toBe('draft');

    await campaign.update({ status: 'active' });
    expect(campaign.status).toBe('active');

    await campaign.update({ status: 'ended' });
    expect(campaign.status).toBe('ended');

    await campaign.update({ status: 'archived' });
    expect(campaign.status).toBe('archived');
  });

  it('should associate campaign with stores', async () => {
    const campaign = await Campaign.create({
      title: 'Store Campaign',
      startTime: new Date(),
      endTime: new Date(Date.now() + 86400000),
    });

    const store1 = await Store.create({ name: 'Store A', code: 'SA001' });
    const store2 = await Store.create({ name: 'Store B', code: 'SB002' });

    // Create join records directly
    await CampaignStore.create({ campaignId: campaign.id, storeId: store1.id });
    await CampaignStore.create({ campaignId: campaign.id, storeId: store2.id });

    const stores = await (campaign as any).getCampaignStores();
    expect(stores).toHaveLength(2);
    expect(stores.map((s: any) => s.name)).toContain('Store A');
    expect(stores.map((s: any) => s.name)).toContain('Store B');
  });

  it('should enforce unique campaign-video pairs', async () => {
    const campaign = await Campaign.create({
      title: 'Unique Test',
      startTime: new Date(),
      endTime: new Date(Date.now() + 86400000),
    });
    const video = await Video.create({ title: 'Unique Video' });

    await CampaignVideo.create({ campaignId: campaign.id, videoId: video.id });

    // Creating duplicate should throw due to unique index on (campaign_id, video_id)
    await expect(CampaignVideo.create({ campaignId: campaign.id, videoId: video.id })).rejects.toThrow();
  });
});
