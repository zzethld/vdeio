import { DataTypes, Model, Optional, InferAttributes, InferCreationAttributes, CreationOptional, Sequelize } from 'sequelize';

export interface CampaignAttributes {
  id: number;
  title: string | null;
  description: string | null;
  status: 'draft' | 'active' | 'ended' | 'archived';
  startTime: Date;
  endTime: Date;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignCreationAttributes extends Optional<CampaignAttributes, 'id' | 'status' | 'createdAt' | 'updatedAt'> {}

export class Campaign extends Model<InferAttributes<Campaign>, InferCreationAttributes<Campaign>> {
  declare id: CreationOptional<number>;
  declare title: string | null;
  declare description: string | null;
  declare status: CreationOptional<'draft' | 'active' | 'ended' | 'archived'>;
  declare startTime: Date;
  declare endTime: Date;
  declare createdBy: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function createModel(sequelize: Sequelize): typeof Campaign {
  Campaign.init(
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
      status: {
        type: DataTypes.ENUM('draft', 'active', 'ended', 'archived'),
        defaultValue: 'draft',
        field: 'status',
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'start_time',
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'end_time',
      },
      createdBy: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'created_by',
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'campaigns',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['status', 'start_time', 'end_time'],
          name: 'idx_status_time',
        },
      ],
    }
  );

  return Campaign;
}
