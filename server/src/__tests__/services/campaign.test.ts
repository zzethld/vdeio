import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock models before importing service
vi.mock('../../models', () => ({
  CampaignModel: {
    create: vi.fn(),
    findByPk: vi.fn(),
    findAndCountAll: vi.fn(),
    findAll: vi.fn(),
    destroy: vi.fn(),
  },
  CampaignVideoModel: {
    findAll: vi.fn(),
    bulkCreate: vi.fn(),
    destroy: vi.fn(),
  },
  CampaignStoreModel: {
    findAll: vi.fn(),
    bulkCreate: vi.fn(),
    destroy: vi.fn(),
  },
  VideoModel: {},
  StoreModel: {},
}));

vi.mock('../../services/mqtt-publisher', () => ({
  notifyStoreSync: vi.fn().mockResolvedValue(undefined),
  notifyCampaignExpired: vi.fn().mockResolvedValue(undefined),
}));

import {
  createCampaign,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  publishCampaign,
  endCampaign,
  checkExpiredCampaigns,
  addVideos,
  removeVideo,
  addStores,
  removeStore,
} from '../../services/campaign';
import { CampaignModel, CampaignVideoModel, CampaignStoreModel } from '../../models';
import { notifyStoreSync, notifyCampaignExpired } from '../../services/mqtt-publisher';

describe('Campaign Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCampaign', () => {
    it('should create a campaign with draft status', async () => {
      const mockCampaign = {
        id: 1,
        title: 'New Campaign',
        status: 'draft',
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-12-31'),
      };
      (CampaignModel.create as any).mockResolvedValue(mockCampaign);

      const result = await createCampaign({
        title: 'New Campaign',
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-12-31'),
        createdBy: 1,
      });

      expect(CampaignModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Campaign',
          status: 'draft',
          createdBy: 1,
        })
      );
      expect(result.status).toBe('draft');
    });
  });

  describe('updateCampaign', () => {
    it('should update a draft campaign', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true);
      const mockCampaign = {
        id: 1,
        status: 'draft',
        update: mockUpdate,
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      await updateCampaign(1, { title: 'Updated Title' });

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Updated Title' }));
    });

    it('should throw when updating non-draft campaign', async () => {
      const mockCampaign = {
        id: 1,
        status: 'active',
        update: vi.fn(),
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      await expect(updateCampaign(1, { title: 'Updated' })).rejects.toThrow(
        'Only draft campaigns can be updated'
      );
    });

    it('should throw when campaign not found', async () => {
      (CampaignModel.findByPk as any).mockResolvedValue(null);

      await expect(updateCampaign(999, { title: 'Updated' })).rejects.toThrow(
        'Campaign not found'
      );
    });
  });

  describe('deleteCampaign', () => {
    it('should delete a draft campaign and its associations', async () => {
      const mockDestroy = vi.fn().mockResolvedValue(true);
      const mockCampaign = {
        id: 1,
        status: 'draft',
        destroy: mockDestroy,
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);
      (CampaignVideoModel.destroy as any).mockResolvedValue(1);
      (CampaignStoreModel.destroy as any).mockResolvedValue(1);

      await deleteCampaign(1);

      expect(CampaignVideoModel.destroy).toHaveBeenCalledWith({ where: { campaignId: 1 } });
      expect(CampaignStoreModel.destroy).toHaveBeenCalledWith({ where: { campaignId: 1 } });
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should throw when deleting non-draft campaign', async () => {
      const mockCampaign = {
        id: 1,
        status: 'active',
        destroy: vi.fn(),
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      await expect(deleteCampaign(1)).rejects.toThrow('Only draft campaigns can be deleted');
    });
  });

  describe('publishCampaign', () => {
    it('should publish a draft campaign with videos and stores', async () => {
      const mockUpdate = vi.fn().mockImplementation(function (this: any, data) {
        Object.assign(this, data);
        return Promise.resolve(this);
      });
      const mockCampaign = {
        id: 1,
        status: 'draft',
        startTime: new Date(),
        update: mockUpdate,
        videos: [{ id: 1 }],
        campaignStores: [{ id: 1 }],
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      const result = await publishCampaign(1);

      expect(mockUpdate).toHaveBeenCalledWith({ status: 'active' });
      expect(result.status).toBe('active');
      expect(notifyStoreSync).toHaveBeenCalledWith([1], 1, 'campaign_published');
    });

    it('should throw when campaign has no videos', async () => {
      const mockCampaign = {
        id: 1,
        status: 'draft',
        videos: [],
        campaignStores: [{ id: 1 }],
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      await expect(publishCampaign(1)).rejects.toThrow('Campaign must have at least one video');
    });

    it('should throw when campaign has no stores', async () => {
      const mockCampaign = {
        id: 1,
        status: 'draft',
        videos: [{ id: 1 }],
        campaignStores: [],
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      await expect(publishCampaign(1)).rejects.toThrow('Campaign must have at least one store');
    });

    it('should throw when campaign is not draft', async () => {
      const mockCampaign = {
        id: 1,
        status: 'active',
        videos: [{ id: 1 }],
        campaignStores: [{ id: 1 }],
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      await expect(publishCampaign(1)).rejects.toThrow('Only draft campaigns can be published');
    });
  });

  describe('endCampaign', () => {
    it('should end an active campaign', async () => {
      const mockUpdate = vi.fn().mockImplementation(function (this: any, data) {
        Object.assign(this, data);
        return Promise.resolve(this);
      });
      const mockCampaign = {
        id: 1,
        status: 'active',
        update: mockUpdate,
        campaignStores: [{ id: 1 }, { id: 2 }],
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      const result = await endCampaign(1);

      expect(mockUpdate).toHaveBeenCalledWith({ status: 'ended' });
      expect(result.status).toBe('ended');
      expect(notifyCampaignExpired).toHaveBeenCalledWith(1, [1, 2]);
    });

    it('should throw when ending non-active campaign', async () => {
      const mockCampaign = {
        id: 1,
        status: 'draft',
        update: vi.fn(),
      };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      await expect(endCampaign(1)).rejects.toThrow('Only active campaigns can be ended');
    });
  });

  describe('checkExpiredCampaigns', () => {
    it('should mark expired active campaigns as ended', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(true);
      const expiredCampaign = {
        id: 1,
        status: 'active',
        endTime: new Date(Date.now() - 3600000),
        update: mockUpdate,
        campaignStores: [{ id: 1 }],
      };
      (CampaignModel.findAll as any).mockResolvedValue([expiredCampaign]);

      const count = await checkExpiredCampaigns();

      expect(count).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith({ status: 'ended' });
      expect(notifyCampaignExpired).toHaveBeenCalledWith(1, [1]);
    });

    it('should return 0 when no expired campaigns', async () => {
      (CampaignModel.findAll as any).mockResolvedValue([]);

      const count = await checkExpiredCampaigns();

      expect(count).toBe(0);
      expect(notifyCampaignExpired).not.toHaveBeenCalled();
    });
  });

  describe('addVideos', () => {
    it('should add videos to a draft campaign', async () => {
      const mockCampaign = { id: 1, status: 'draft' };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);
      (CampaignVideoModel.findAll as any).mockResolvedValue([]);
      (CampaignVideoModel.bulkCreate as any).mockResolvedValue(true);

      await addVideos(1, [1, 2, 3]);

      expect(CampaignVideoModel.bulkCreate).toHaveBeenCalledWith([
        { campaignId: 1, videoId: 1, sortOrder: 0 },
        { campaignId: 1, videoId: 2, sortOrder: 0 },
        { campaignId: 1, videoId: 3, sortOrder: 0 },
      ]);
    });

    it('should skip already added videos', async () => {
      const mockCampaign = { id: 1, status: 'draft' };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);
      (CampaignVideoModel.findAll as any).mockResolvedValue([
        { campaignId: 1, videoId: 1 },
      ]);
      (CampaignVideoModel.bulkCreate as any).mockResolvedValue(true);

      await addVideos(1, [1, 2]);

      expect(CampaignVideoModel.bulkCreate).toHaveBeenCalledWith([
        { campaignId: 1, videoId: 2, sortOrder: 0 },
      ]);
    });

    it('should throw when modifying non-draft campaign', async () => {
      const mockCampaign = { id: 1, status: 'active' };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      await expect(addVideos(1, [1])).rejects.toThrow('Only draft campaigns can be modified');
    });
  });

  describe('addStores', () => {
    it('should add stores to a draft campaign', async () => {
      const mockCampaign = { id: 1, status: 'draft' };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);
      (CampaignStoreModel.findAll as any).mockResolvedValue([]);
      (CampaignStoreModel.bulkCreate as any).mockResolvedValue(true);

      await addStores(1, [1, 2]);

      expect(CampaignStoreModel.bulkCreate).toHaveBeenCalledWith([
        { campaignId: 1, storeId: 1 },
        { campaignId: 1, storeId: 2 },
      ]);
    });

    it('should throw when modifying non-draft campaign', async () => {
      const mockCampaign = { id: 1, status: 'ended' };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);

      await expect(addStores(1, [1])).rejects.toThrow('Only draft campaigns can be modified');
    });
  });

  describe('removeVideo', () => {
    it('should remove a video from a draft campaign', async () => {
      const mockCampaign = { id: 1, status: 'draft' };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);
      (CampaignVideoModel.destroy as any).mockResolvedValue(1);

      await removeVideo(1, 1);

      expect(CampaignVideoModel.destroy).toHaveBeenCalledWith({ where: { campaignId: 1, videoId: 1 } });
    });
  });

  describe('removeStore', () => {
    it('should remove a store from a draft campaign', async () => {
      const mockCampaign = { id: 1, status: 'draft' };
      (CampaignModel.findByPk as any).mockResolvedValue(mockCampaign);
      (CampaignStoreModel.destroy as any).mockResolvedValue(1);

      await removeStore(1, 1);

      expect(CampaignStoreModel.destroy).toHaveBeenCalledWith({ where: { campaignId: 1, storeId: 1 } });
    });
  });
});
