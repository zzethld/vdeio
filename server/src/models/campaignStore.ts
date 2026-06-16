import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface CampaignStoreAttributes {
  id: number;
  campaignId: number;
  storeId: number;
}

export interface CampaignStoreCreationAttributes extends Optional<CampaignStoreAttributes, 'id'> {}

export class CampaignStore extends Model<InferAttributes<CampaignStore>, InferCreationAttributes<CampaignStore>> {
  declare id: CreationOptional<number>;
  declare campaignId: number;
  declare storeId: number;
}

export function createModel(sequelize: Sequelize): typeof CampaignStore {
  CampaignStore.init(
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
      storeId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'store_id',
      },
    },
    {
      sequelize,
      tableName: 'campaign_stores',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['campaign_id', 'store_id'],
        },
      ],
    }
  );

  return CampaignStore;
}
