import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface PlayLogAttributes {
  id: number;
  userId: number | null;
  videoId: number | null;
  campaignId: number | null;
  deviceId: number | null;
  storeId: number | null;
  event: 'start' | 'pause' | 'resume' | 'end' | 'seek';
  position: number | null;
  duration: number | null;
  createdAt: Date;
}

export interface PlayLogCreationAttributes extends Optional<PlayLogAttributes, 'id' | 'createdAt'> {}

export class PlayLog extends Model<InferAttributes<PlayLog>, InferCreationAttributes<PlayLog>> {
  declare id: CreationOptional<number>;
  declare userId: number | null;
  declare videoId: number | null;
  declare campaignId: number | null;
  declare deviceId: number | null;
  declare storeId: number | null;
  declare event: 'start' | 'pause' | 'resume' | 'end' | 'seek';
  declare position: number | null;
  declare duration: number | null;
  declare createdAt: CreationOptional<Date>;
}

export function createModel(sequelize: Sequelize): typeof PlayLog {
  PlayLog.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'user_id',
      },
      videoId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'video_id',
      },
      campaignId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'campaign_id',
      },
      deviceId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'device_id',
      },
      storeId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'store_id',
      },
      event: {
        type: DataTypes.ENUM('start', 'pause', 'resume', 'end', 'seek'),
        allowNull: false,
      },
      position: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
      },
    },
    {
      sequelize,
      tableName: 'play_logs',
      timestamps: true,
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          fields: ['video_id', 'created_at'],
          name: 'idx_video_time',
        },
        {
          fields: ['store_id', 'created_at'],
          name: 'idx_store_time',
        },
        {
          fields: ['campaign_id', 'created_at'],
          name: 'idx_campaign_time',
        },
      ],
    }
  );

  return PlayLog;
}
