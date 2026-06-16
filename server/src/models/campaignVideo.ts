import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface CampaignVideoAttributes {
  id: number;
  campaignId: number;
  videoId: number;
  sortOrder: number;
}

export interface CampaignVideoCreationAttributes extends Optional<CampaignVideoAttributes, 'id' | 'sortOrder'> {}

export class CampaignVideo extends Model<InferAttributes<CampaignVideo>, InferCreationAttributes<CampaignVideo>> {
  declare id: CreationOptional<number>;
  declare campaignId: number;
  declare videoId: number;
  declare sortOrder: CreationOptional<number>;
}

export function createModel(sequelize: Sequelize): typeof CampaignVideo {
  CampaignVideo.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      campaignId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'campaign_id',
      },
      videoId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'video_id',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    {
      sequelize,
      tableName: 'campaign_videos',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['campaign_id', 'video_id'],
        },
      ],
    }
  );

  return CampaignVideo;
}
