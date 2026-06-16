import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface VideoAttributes {
  id: number;
  title: string | null;
  description: string | null;
  categoryId: number | null;
  duration: number | null;
  fileSize: number | null;
  resolution: string | null;
  originalUrl: string | null;
  hlsUrl: string | null;
  coverUrl: string | null;
  encryptStatus: 'pending' | 'encrypting' | 'done' | 'failed';
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface VideoCreationAttributes extends Optional<VideoAttributes, 'id' | 'encryptStatus' | 'createdAt' | 'updatedAt' | 'deletedAt'> {}

export class Video extends Model<InferAttributes<Video>, InferCreationAttributes<Video>> {
  declare id: CreationOptional<number>;
  declare title: string | null;
  declare description: string | null;
  declare categoryId: number | null;
  declare duration: number | null;
  declare fileSize: number | null;
  declare resolution: string | null;
  declare originalUrl: string | null;
  declare hlsUrl: string | null;
  declare coverUrl: string | null;
  declare encryptStatus: CreationOptional<'pending' | 'encrypting' | 'done' | 'failed'>;
  declare createdBy: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;
}

export function createModel(sequelize: Sequelize): typeof Video {
  Video.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'title',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'description',
      },
      categoryId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'category_id',
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'duration',
      },
      fileSize: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'file_size',
      },
      resolution: {
        type: DataTypes.STRING(16),
        allowNull: true,
        field: 'resolution',
      },
      originalUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'original_url',
      },
      hlsUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'hls_url',
      },
      coverUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'cover_url',
      },
      encryptStatus: {
        type: DataTypes.ENUM('pending', 'encrypting', 'done', 'failed'),
        defaultValue: 'pending',
        field: 'encrypt_status',
      },
      createdBy: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'created_by',
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'deleted_at',
      },
    },
    {
      sequelize,
      tableName: 'videos',
      timestamps: true,
      underscored: true,
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  );

  return Video;
}
