import { Sequelize } from 'sequelize';
import { sequelize } from '../config/database';

import { createModel as createUserModel, User } from './user';
import { createModel as createStoreModel, Store } from './store';
import { createModel as createUserStoreBindingModel, UserStoreBinding } from './userStoreBinding';
import { createModel as createDeviceModel, Device } from './device';
import { createModel as createVideoModel, Video } from './video';
import { createModel as createVideoKeyModel, VideoKey } from './videoKey';
import { createModel as createVideoAccessCodeModel, VideoAccessCode } from './videoAccessCode';
import { createModel as createCampaignModel, Campaign } from './campaign';
import { createModel as createCampaignVideoModel, CampaignVideo } from './campaignVideo';
import { createModel as createCampaignStoreModel, CampaignStore } from './campaignStore';
import { createModel as createCategoryModel, Category } from './category';
import { createModel as createPlayLogModel, PlayLog } from './playLog';
import { createModel as createAdminModel, Admin } from './admin';
import { createModel as createDeviceTelemetryModel, DeviceTelemetry } from './deviceTelemetry';

// Initialize all models
export const UserModel = createUserModel(sequelize);
export const StoreModel = createStoreModel(sequelize);
export const UserStoreBindingModel = createUserStoreBindingModel(sequelize);
export const DeviceModel = createDeviceModel(sequelize);
export const VideoModel = createVideoModel(sequelize);
export const VideoKeyModel = createVideoKeyModel(sequelize);
export const VideoAccessCodeModel = createVideoAccessCodeModel(sequelize);
export const CampaignModel = createCampaignModel(sequelize);
export const CampaignVideoModel = createCampaignVideoModel(sequelize);
export const CampaignStoreModel = createCampaignStoreModel(sequelize);
// @deprecated Category — registered for schema compatibility; no production
// callers (see models/category.ts). Tracked for post-MVP removal.
export const CategoryModel = createCategoryModel(sequelize);
// @deprecated PlayLog — registered for schema compatibility; associations
// disabled and no production callers (see models/playLog.ts). Tracked for
// post-MVP removal.
export const PlayLogModel = createPlayLogModel(sequelize);
export const AdminModel = createAdminModel(sequelize);
export const DeviceTelemetryModel = createDeviceTelemetryModel(sequelize);

// Define associations
export function setupAssociations(): void {
  // User <-> Store (many-to-many through UserStoreBinding)
  UserModel.belongsToMany(StoreModel, {
    through: UserStoreBindingModel,
    foreignKey: 'user_id',
    otherKey: 'store_id',
    as: 'stores',
  });
  StoreModel.belongsToMany(UserModel, {
    through: UserStoreBindingModel,
    foreignKey: 'store_id',
    otherKey: 'user_id',
    as: 'users',
  });

  // Store -> Device (one-to-many)
  StoreModel.hasMany(DeviceModel, {
    foreignKey: 'store_id',
    as: 'devices',
  });
  DeviceModel.belongsTo(StoreModel, {
    foreignKey: 'store_id',
    as: 'store',
  });

  // Campaign <-> Video (many-to-many through CampaignVideo)
  CampaignModel.belongsToMany(VideoModel, {
    through: CampaignVideoModel,
    foreignKey: 'campaign_id',
    otherKey: 'video_id',
    as: 'videos',
  });
  VideoModel.belongsToMany(CampaignModel, {
    through: CampaignVideoModel,
    foreignKey: 'video_id',
    otherKey: 'campaign_id',
    as: 'campaigns',
  });

  // Campaign <-> Store (many-to-many through CampaignStore)
  CampaignModel.belongsToMany(StoreModel, {
    through: CampaignStoreModel,
    foreignKey: 'campaign_id',
    otherKey: 'store_id',
    as: 'campaignStores',
  });
  StoreModel.belongsToMany(CampaignModel, {
    through: CampaignStoreModel,
    foreignKey: 'store_id',
    otherKey: 'campaign_id',
    as: 'storeCampaigns',
  });

  // Video -> VideoKey (one-to-one)
  VideoModel.hasOne(VideoKeyModel, {
    foreignKey: 'video_id',
    as: 'videoKey',
  });
  VideoKeyModel.belongsTo(VideoModel, {
    foreignKey: 'video_id',
    as: 'video',
  });

  // Video -> VideoAccessCode (one-to-many)
  VideoModel.hasMany(VideoAccessCodeModel, {
    foreignKey: 'video_id',
    as: 'accessCodes',
  });
  VideoAccessCodeModel.belongsTo(VideoModel, {
    foreignKey: 'video_id',
    as: 'video',
  });

  // Store -> VideoAccessCode (one-to-many)
  StoreModel.hasMany(VideoAccessCodeModel, {
    foreignKey: 'store_id',
    as: 'accessCodes',
  });
  VideoAccessCodeModel.belongsTo(StoreModel, {
    foreignKey: 'store_id',
    as: 'store',
  });

  // Category -> Video (one-to-many)
  CategoryModel.hasMany(VideoModel, {
    foreignKey: 'category_id',
    as: 'videos',
  });
  VideoModel.belongsTo(CategoryModel, {
    foreignKey: 'category_id',
    as: 'category',
  });

  // MVP: PlayLog model exists but associations are disabled. Playback stats excluded from MVP.

  // Device -> DeviceTelemetry (one-to-many)
  DeviceModel.hasMany(DeviceTelemetryModel, {
    foreignKey: 'device_id',
    sourceKey: 'deviceId',
    as: 'telemetries',
  });
  DeviceTelemetryModel.belongsTo(DeviceModel, {
    foreignKey: 'device_id',
    targetKey: 'deviceId',
    as: 'device',
  });

  // CampaignVideo -> Campaign (many-to-one)
  CampaignVideoModel.belongsTo(CampaignModel, {
    foreignKey: 'campaign_id',
    as: 'campaign',
  });
  CampaignModel.hasMany(CampaignVideoModel, {
    foreignKey: 'campaign_id',
    as: 'campaignVideos',
  });

  // CampaignVideo -> Video (many-to-one)
  CampaignVideoModel.belongsTo(VideoModel, {
    foreignKey: 'video_id',
    as: 'video',
  });
  VideoModel.hasMany(CampaignVideoModel, {
    foreignKey: 'video_id',
    as: 'campaignVideos',
  });
}

// Export all models and types
export {
  User,
  Store,
  UserStoreBinding,
  Device,
  Video,
  VideoKey,
  VideoAccessCode,
  Campaign,
  CampaignVideo,
  CampaignStore,
  Category,
  PlayLog,
  Admin,
  DeviceTelemetry,
};

export { sequelize };
