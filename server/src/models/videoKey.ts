import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface VideoKeyAttributes {
  id: number;
  videoId: number;
  keyId: string | null;
  encryptedKey: string | null;
  iv: string | null;
  status: 'active' | 'expired' | 'rotated';
  createdAt: Date;
}

export interface VideoKeyCreationAttributes extends Optional<VideoKeyAttributes, 'id' | 'status' | 'createdAt'> {}

export class VideoKey extends Model<InferAttributes<VideoKey>, InferCreationAttributes<VideoKey>> {
  declare id: CreationOptional<number>;
  declare videoId: number;
  declare keyId: string | null;
  declare encryptedKey: string | null;
  declare iv: string | null;
  declare status: CreationOptional<'active' | 'expired' | 'rotated'>;
  declare createdAt: CreationOptional<Date>;
}

export function createModel(sequelize: Sequelize): typeof VideoKey {
  VideoKey.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      videoId: {
        type: DataTypes.BIGINT,
        unique: true,
        allowNull: false,
        field: 'video_id',
      },
      keyId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'key_id',
      },
      encryptedKey: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'encrypted_key',
      },
      iv: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('active', 'expired', 'rotated'),
        defaultValue: 'active',
      },
      createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
      },
    },
    {
      sequelize,
      tableName: 'video_keys',
      timestamps: true,
      underscored: true,
      updatedAt: false,
    }
  );

  return VideoKey;
}
