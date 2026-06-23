import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';
import type { Video } from './video';

export interface VideoAccessCodeAttributes {
  id: number;
  code: string;
  videoId: number;
  storeId: number | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  status: 'active' | 'disabled';
  createdBy: number | null;
  createdAt: Date;
}

export interface VideoAccessCodeCreationAttributes
  extends Optional<VideoAccessCodeAttributes, 'id' | 'storeId' | 'maxUses' | 'useCount' | 'expiresAt' | 'status' | 'createdBy' | 'createdAt'> {}

export class VideoAccessCode extends Model<
  InferAttributes<VideoAccessCode>,
  InferCreationAttributes<VideoAccessCode>
> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare videoId: number;
  declare storeId: number | null;
  declare maxUses: number | null;
  declare useCount: CreationOptional<number>;
  declare expiresAt: Date | null;
  declare status: CreationOptional<'active' | 'disabled'>;
  declare createdBy: number | null;
  declare createdAt: CreationOptional<Date>;

  declare video?: Video;
}

export function createModel(sequelize: Sequelize): typeof VideoAccessCode {
  VideoAccessCode.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        field: 'code',
      },
      videoId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'video_id',
      },
      storeId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'store_id',
      },
      maxUses: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'max_uses',
      },
      useCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'use_count',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'expires_at',
      },
      status: {
        type: DataTypes.ENUM('active', 'disabled'),
        allowNull: false,
        defaultValue: 'active',
        field: 'status',
      },
      createdBy: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'created_by',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
      },
    },
    {
      sequelize,
      tableName: 'video_access_codes',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['code'],
        },
        {
          fields: ['video_id'],
        },
        {
          fields: ['store_id'],
        },
      ],
    }
  );

  return VideoAccessCode;
}
