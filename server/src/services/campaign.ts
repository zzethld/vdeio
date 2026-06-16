import { Op } from 'sequelize';
import {
  CampaignModel,
  CampaignVideoModel,
  CampaignStoreModel,
  VideoModel,
  StoreModel,
  Campaign,
} from '../models';
import {
  notifyStoreSync,
  notifyCampaignExpired,
} from './mqtt-publisher';

export interface CreateCampaignInput {
  title: string;
  description?: string;
  startTime: Date | string;
  endTime: Date | string;
  createdBy: number;
}

export interface UpdateCampaignInput {
  title?: string;
  description?: string;
  startTime?: Date | string;
  endTime?: Date | string;
}

export interface ListCampaignOptions {
  status?: 'draft' | 'active' | 'ended' | 'archived';
  page?: number;
  pageSize?: number;
}

export async function createCampaign(
  data: CreateCampaignInput
): Promise<Campaign> {
  const campaign = await CampaignModel.create({
    title: data.title,
    description: data.description ?? null,
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    createdBy: data.createdBy,
    status: 'draft',
  });
  return campaign;
}

export async function getCampaignById(id: number): Promise<Campaign | null> {
  const campaign = await CampaignModel.findByPk(id, {
    include: [
      { model: VideoModel, as: 'videos' },
      { model: StoreModel, as: 'campaignStores' },
    ],
  });
  return campaign;
}

export async function listCampaigns(
  options: ListCampaignOptions = {}
): Promise<{ rows: Campaign[]; count: number }> {
  const { status, page = 1, pageSize = 20 } = options;
  const where: any = {};
  if (status) {
    where.status = status;
  }

  const { rows, count } = await CampaignModel.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return { rows, count };
}

export async function updateCampaign(
  id: number,
  data: UpdateCampaignInput
): Promise<Campaign> {
  const campaign = await CampaignModel.findByPk(id);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'draft') {
    throw new Error('Only draft campaigns can be updated');
  }

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.startTime !== undefined) updateData.startTime = new Date(data.startTime);
  if (data.endTime !== undefined) updateData.endTime = new Date(data.endTime);

  await campaign.update(updateData);
  return campaign;
}

export async function deleteCampaign(id: number): Promise<void> {
  const campaign = await CampaignModel.findByPk(id);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'draft') {
    throw new Error('Only draft campaigns can be deleted');
  }

  // Remove associations first
  await CampaignVideoModel.destroy({ where: { campaignId: id } });
  await CampaignStoreModel.destroy({ where: { campaignId: id } });
  await campaign.destroy();
}

export async function addVideos(
  campaignId: number,
  videoIds: number[]
): Promise<void> {
  const campaign = await CampaignModel.findByPk(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'draft') {
    throw new Error('Only draft campaigns can be modified');
  }

  const existing = await CampaignVideoModel.findAll({
    where: { campaignId, videoId: videoIds },
  });
  const existingIds = new Set(existing.map((cv) => cv.videoId));
  const newIds = videoIds.filter((vid) => !existingIds.has(vid));

  if (newIds.length === 0) return;

  await CampaignVideoModel.bulkCreate(
    newIds.map((videoId) => ({ campaignId, videoId, sortOrder: 0 }))
  );
}

export async function removeVideo(
  campaignId: number,
  videoId: number
): Promise<void> {
  const campaign = await CampaignModel.findByPk(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'draft') {
    throw new Error('Only draft campaigns can be modified');
  }

  await CampaignVideoModel.destroy({ where: { campaignId, videoId } });
}

export async function addStores(
  campaignId: number,
  storeIds: number[]
): Promise<void> {
  const campaign = await CampaignModel.findByPk(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'draft') {
    throw new Error('Only draft campaigns can be modified');
  }

  const existing = await CampaignStoreModel.findAll({
    where: { campaignId, storeId: storeIds },
  });
  const existingIds = new Set(existing.map((cs) => cs.storeId));
  const newIds = storeIds.filter((sid) => !existingIds.has(sid));

  if (newIds.length === 0) return;

  await CampaignStoreModel.bulkCreate(
    newIds.map((storeId) => ({ campaignId, storeId }))
  );
}

export async function removeStore(
  campaignId: number,
  storeId: number
): Promise<void> {
  const campaign = await CampaignModel.findByPk(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'draft') {
    throw new Error('Only draft campaigns can be modified');
  }

  await CampaignStoreModel.destroy({ where: { campaignId, storeId } });
}

export async function publishCampaign(campaignId: number): Promise<Campaign> {
  const campaign = await CampaignModel.findByPk(campaignId, {
    include: [
      { model: VideoModel, as: 'videos' },
      { model: StoreModel, as: 'campaignStores' },
    ],
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'draft') {
    throw new Error('Only draft campaigns can be published');
  }

  // Must have videos
  const videos = (campaign as any).videos ?? [];
  if (!videos || videos.length === 0) {
    throw new Error('Campaign must have at least one video');
  }

  // Must have stores
  const stores = (campaign as any).campaignStores ?? [];
  if (!stores || stores.length === 0) {
    throw new Error('Campaign must have at least one store');
  }

  // startTime must be in the future (or now)
  const now = new Date();
  if (new Date(campaign.startTime) > now) {
    // startTime is in the future - that's fine
  }
  // If startTime is in the past, we still allow publishing (campaign starts immediately)

  await campaign.update({ status: 'active' });

  // Notify stores via MQTT
  const storeIds = stores.map((s: any) => s.id as number);
  await notifyStoreSync(storeIds, campaignId, 'campaign_published');

  return campaign;
}

export async function endCampaign(campaignId: number): Promise<Campaign> {
  const campaign = await CampaignModel.findByPk(campaignId, {
    include: [{ model: StoreModel, as: 'campaignStores' }],
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'active') {
    throw new Error('Only active campaigns can be ended');
  }

  await campaign.update({ status: 'ended' });

  const stores = (campaign as any).campaignStores ?? [];
  const storeIds = stores.map((s: any) => s.id as number);
  await notifyCampaignExpired(campaignId, storeIds);

  return campaign;
}

export async function checkExpiredCampaigns(): Promise<number> {
  const expiredCampaigns = await CampaignModel.findAll({
    where: {
      status: 'active',
      endTime: { [Op.lt]: new Date() },
    },
    include: [{ model: StoreModel, as: 'campaignStores' }],
  });

  for (const campaign of expiredCampaigns) {
    await campaign.update({ status: 'ended' });

    const stores = (campaign as any).campaignStores ?? [];
    const storeIds = stores.map((s: any) => s.id as number);
    await notifyCampaignExpired(campaign.id, storeIds);
  }

  return expiredCampaigns.length;
}
